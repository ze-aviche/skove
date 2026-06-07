import { Router } from 'express'
import { db } from '../db/index.js'
import { atsJobs, atsCompanies, agentResults, users } from '../db/schema.js'
import { and, or, desc, eq, sql, ilike } from 'drizzle-orm'
import { requireAuth } from '../lib/auth.js'
import { log } from '../lib/logger.js'
import { scoreJobMatch, tailorResume } from '../lib/claude.js'

export const jobsRouter = Router()

function normalizeText(value?: string) {
  return String(value ?? '').trim().toLowerCase()
}

function buildLocationPattern(loc: string): string {
  const n = normalizeText(loc)
  if (n.includes('remote') || n.includes('wfh')) return '%remote%'

  // Handle country-level searches: "US" → match "us" in location
  if (n === 'us' || n === 'usa' || n === 'united states') return '%us%'
  if (n === 'uk' || n === 'gb' || n === 'united kingdom') return '%uk%'
  if (n === 'ca' || n === 'canada') return '%ca%'
  if (n === 'au' || n === 'australia') return '%australia%'

  // For city searches, extract the first part (before comma) or use as-is
  const city = n.split(',')[0].trim()
  return `%${city}%`
}

// GET /api/jobs/search — query ats_jobs with optional specialization filter
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

    const conditions: ReturnType<typeof sql>[] = []

    // Handle multiple comma-separated values with OR logic
    if (title) {
      const titles = title.split(',').map(t => t.trim()).filter(Boolean)
      if (titles.length > 0) {
        const titleConditions = titles.map(t => sql`${atsJobs.titleSearch} like ${'%' + normalizeText(t) + '%'}`)
        conditions.push(titleConditions.length === 1 ? titleConditions[0] : sql`(${or(...titleConditions)})`
        )
      }
    }

    if (company) {
      const companies = company.split(',').map(c => c.trim()).filter(Boolean)
      if (companies.length > 0) {
        const companyConditions = companies.map(c => sql`${atsJobs.companySearch} like ${'%' + normalizeText(c) + '%'}`)
        conditions.push(companyConditions.length === 1 ? companyConditions[0] : sql`(${or(...companyConditions)})`
        )
      }
    }

    if (location) {
      const locations = location.split(',').map(l => l.trim()).filter(Boolean)
      if (locations.length > 0) {
        const locationConditions = locations.map(l => sql`${atsJobs.locationSearch} like ${buildLocationPattern(l)}`)
        conditions.push(locationConditions.length === 1 ? locationConditions[0] : sql`(${or(...locationConditions)})`
        )
      }
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined

    let query = db.select().from(atsJobs).where(where)

    // If specialization filter, join with ats_companies using case-insensitive name match
    if (specialization) {
      // Use lower() on both sides to handle name mismatches like "Path Robotics" vs "path robotics"
      const joinCondition = sql`lower(${atsJobs.company}) = lower(${atsCompanies.name})`
      // Exact specialization match to avoid "CCaaS" matching "Not CCaaS"
      const specializationCondition = sql`lower(${atsCompanies.specialization}) = lower(${specialization})`
      const specWhere = and(where, specializationCondition)

      const [{ total }] = await db
        .select({ total: sql<string>`count(*)` })
        .from(atsJobs)
        .innerJoin(atsCompanies, joinCondition)
        .where(specWhere)

      const jobs = await db
        .select({ job: atsJobs })
        .from(atsJobs)
        .innerJoin(atsCompanies, joinCondition)
        .where(specWhere)
        .orderBy(desc(atsJobs.createdAt))
        .limit(limit)
        .offset(offset)

      return res.json({ jobs: jobs.map(r => r.job), total: Number(total), page, limit })
    }

    // Standard query without specialization filter
    const [{ total }] = await db
      .select({ total: sql<string>`count(*)` })
      .from(atsJobs)
      .where(where)

    const jobs = await db
      .select()
      .from(atsJobs)
      .where(where)
      .orderBy(desc(atsJobs.createdAt))
      .limit(limit)
      .offset(offset)

    res.json({ jobs, total: Number(total), page, limit })
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
