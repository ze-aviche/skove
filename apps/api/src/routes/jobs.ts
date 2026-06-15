import { Router } from 'express'
import { db } from '../db/index.js'
import { atsJobs, agentResults, users } from '../db/schema.js'
import { and, desc, eq, sql } from 'drizzle-orm'
import { requireAuth } from '../lib/auth.js'
import { log } from '../lib/logger.js'
import { scoreJobMatch, tailorResume } from '../lib/claude.js'
import { searchAtsJobs, countAtsJobs } from '../lib/job-search.js'

export const jobsRouter = Router()

function normalizeText(value?: string) {
  return String(value ?? '').trim().toLowerCase()
}

// GET /api/jobs/search — query ats_jobs with optional filters
// Query params: title, company, location, specialization, page (default 1), limit (default 25, max 50)
jobsRouter.get('/search', requireAuth, async (req, res) => {
  try {
    const title = String(req.query.title ?? '').trim()
    const company = String(req.query.company ?? '').trim()
    const location = String(req.query.location ?? '').trim()
    const specialization = String(req.query.specialization ?? '').trim()
    const page = Math.max(1, Number(req.query.page) || 1)
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 25))
    const offset = (page - 1) * limit

    const params = {
      titles: title ? title.split(',').map(t => t.trim()).filter(Boolean) : undefined,
      company: company || undefined,
      locations: location ? location.split(',').map(l => l.trim()).filter(Boolean) : undefined,
      specializations: specialization ? [specialization] : undefined,
      limit,
      offset,
    }

    const [jobs, total] = await Promise.all([
      searchAtsJobs(params),
      countAtsJobs(params),
    ])

    // Fetch the user's existing agentResults for the returned jobs so the
    // frontend can show saved/applied state without a separate round-trip.
    // Page size is capped at 50 so filtering in JS is fine.
    let userResults: (typeof agentResults.$inferSelect)[] = []
    if (jobs.length > 0) {
      const jobIdSet = new Set(jobs.map(j => j.id))
      const allResults = await db
        .select()
        .from(agentResults)
        .where(eq(agentResults.userId, req.userId!))
      userResults = allResults.filter(r => {
        const meta = (r.metadata ?? {}) as Record<string, unknown>
        return typeof meta.atsJobId === 'string' && jobIdSet.has(meta.atsJobId)
      })
    }

    res.json({ jobs, total, page, limit, userResults })
  } catch (err) {
    log.error('api', 'GET /api/jobs/search failed', err)
    res.status(500).json({ error: 'Search failed' })
  }
})

// GET /api/jobs/suggestions — get autocomplete suggestions
jobsRouter.get('/suggestions', requireAuth, async (req, res) => {
  try {
    const field = String(req.query.field ?? '').trim().toLowerCase()
    const q = String(req.query.q ?? '').trim().toLowerCase()

    if (!field || !q || q.length < 1) {
      return res.json([])
    }

    let suggestions: string[] = []

    if (field === 'title') {
      const results = await db
        .selectDistinct({ title: atsJobs.title })
        .from(atsJobs)
        .where(sql`${atsJobs.titleSearch} LIKE ${`%${normalizeText(q)}%`}`)
        .limit(10)
      suggestions = results.map((r) => r.title).filter(Boolean)
    } else if (field === 'company') {
      const results = await db
        .selectDistinct({ company: atsJobs.company })
        .from(atsJobs)
        .where(sql`${atsJobs.companySearch} LIKE ${`%${normalizeText(q)}%`}`)
        .limit(10)
      suggestions = results.map((r) => r.company).filter(Boolean)
    }

    res.json(suggestions)
  } catch (err) {
    log.error('api', 'GET /api/jobs/suggestions failed', err)
    res.status(500).json({ error: 'Failed to fetch suggestions' })
  }
})

// POST /api/jobs/:atsJobId/save — save without scoring (idempotent)
jobsRouter.post('/:atsJobId/save', requireAuth, async (req, res) => {
  try {
    const [job] = await db.select().from(atsJobs).where(eq(atsJobs.id, req.params.atsJobId))
    if (!job) return res.status(404).json({ error: 'Job not found' })

    const existing = await db.select().from(agentResults).where(
      and(eq(agentResults.userId, req.userId!), eq(agentResults.url, job.applyUrl))
    )

    if (existing[0]) return res.json({ result: existing[0], created: false })

    const salary = job.salaryMin || job.salaryMax
      ? [job.salaryMin ? `$${Math.round(job.salaryMin / 1000)}k` : null, job.salaryMax ? `$${Math.round(job.salaryMax / 1000)}k` : null].filter(Boolean).join('–')
      : undefined

    const [created] = await db.insert(agentResults).values({
      instanceId: null,
      userId: req.userId!,
      title: `${job.title} at ${job.company}`,
      url: job.applyUrl,
      metadata: {
        agentType: 'job-application-tracker',
        jobTitle: job.title,
        company: job.company,
        location: job.location,
        description: job.description,
        salary,
        source: job.source,
        atsJobId: job.id,
      },
      isRead: false,
      isFavourite: false,
    }).returning()

    res.json({ result: created, created: true })
  } catch (err) {
    log.error('api', 'POST /api/jobs/:id/save failed', err, { atsJobId: req.params.atsJobId, userId: req.userId })
    res.status(500).json({ error: 'Save failed' })
  }
})

// POST /api/jobs/:atsJobId/save-and-score
// Saves the ats_job as an agentResult for this user and runs AI scoring.
// Idempotent: re-running on an already-saved job returns the existing result.
jobsRouter.post('/:atsJobId/save-and-score', requireAuth, async (req, res) => {
  try {
    const [job] = await db.select().from(atsJobs).where(eq(atsJobs.id, req.params.atsJobId))
    if (!job) return res.status(404).json({ error: 'Job not found' })

    const [userRow] = await db.select({ resumeText: users.resumeText }).from(users).where(eq(users.id, req.userId!))
    if (!userRow?.resumeText) {
      return res.status(400).json({ error: 'No resume uploaded — upload a resume before scoring' })
    }

    // Check if already saved (match by applyUrl for this user)
    const existing = await db.select().from(agentResults).where(
      and(eq(agentResults.userId, req.userId!), eq(agentResults.url, job.applyUrl))
    )

    let result = existing[0]
    const wasNew = !result

    if (!result) {
      const salary = job.salaryMin || job.salaryMax
        ? [job.salaryMin ? `$${Math.round(job.salaryMin / 1000)}k` : null, job.salaryMax ? `$${Math.round(job.salaryMax / 1000)}k` : null].filter(Boolean).join('–')
        : undefined

      const [created] = await db.insert(agentResults).values({
        instanceId: null,
        userId: req.userId!,
        title: `${job.title} at ${job.company}`,
        url: job.applyUrl,
        metadata: {
          agentType: 'job-application-tracker',
          jobTitle: job.title,
          company: job.company,
          location: job.location,
          description: job.description,
          salary,
          source: job.source,
          atsJobId: job.id,
        },
        isRead: false,
        isFavourite: false,
      }).returning()
      result = created
    }

    const meta = (result.metadata ?? {}) as Record<string, any>

    if (meta.matchScore !== undefined) {
      return res.json({ result, created: wasNew, alreadyScored: true })
    }

    const jobData = {
      title: job.title,
      company: job.company,
      location: job.location,
      description: job.description ?? undefined,
      salary: meta.salary,
    }

    const match = await scoreJobMatch(userRow.resumeText, jobData)
    log.info('api', 'explorer score complete', { resultId: result.id, score: match.score, userId: req.userId })

    let tailoredResumeText: string | undefined
    try {
      const tailored = await tailorResume(userRow.resumeText, jobData)
      tailoredResumeText = tailored.tailoredText
    } catch {
      log.warn('api', 'resume tailoring failed in explorer score', { resultId: result.id })
    }

    const updatedMeta = { ...meta, matchScore: match.score, matchReasoning: match.reasoning, coverLetter: match.coverLetter, tailoredResumeText }

    const [updated] = await db
      .update(agentResults)
      .set({ metadata: updatedMeta })
      .where(eq(agentResults.id, result.id))
      .returning()

    res.json({ result: updated, created: wasNew, alreadyScored: false })
  } catch (err) {
    log.error('api', 'POST /api/jobs/:id/save-and-score failed', err, { atsJobId: req.params.atsJobId, userId: req.userId })
    res.status(500).json({ error: 'Save and score failed' })
  }
})
