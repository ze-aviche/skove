import { Router } from 'express'
import { clerkClient } from '@clerk/clerk-sdk-node'
import { db } from '../db/index.js'
import { agentResults, users, profiles, applications } from '../db/schema.js'
import { eq, desc, and, inArray } from 'drizzle-orm'
import { requireAuth } from '../lib/auth.js'
import { log } from '../lib/logger.js'
import { scoreJobMatch, tailorResume, buildApplyPackage } from '../lib/claude.js'

function inferAtsType(url?: string | null): string {
  const u = (url ?? '').toLowerCase()
  if (u.includes('greenhouse.io')) return 'greenhouse'
  if (u.includes('lever.co')) return 'lever'
  if (u.includes('ashbyhq.com')) return 'ashby'
  if (u.includes('myworkdayjobs.com') || u.includes('workday')) return 'workday'
  return 'unknown'
}

export const resultsRouter = Router()

// GET /api/results — get all results for the user
resultsRouter.get('/', requireAuth, async (req, res) => {
  try {
    const results = await db.select().from(agentResults)
      .where(eq(agentResults.userId, req.userId!))
      .orderBy(desc(agentResults.createdAt))
      .limit(1000)
    res.json(results)
  } catch (err) {
    log.error('api', 'GET /api/results failed', err, { userId: req.userId })
    res.status(500).json({ error: 'Failed to fetch results' })
  }
})

// DELETE /api/results/bulk — delete multiple results by id array
resultsRouter.delete('/bulk', requireAuth, async (req, res) => {
  const { ids } = req.body as { ids?: string[] }
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'ids must be a non-empty array' })
  }
  try {
    await db.delete(agentResults).where(
      and(
        inArray(agentResults.id, ids),
        eq(agentResults.userId, req.userId!)
      )
    )
    log.info('api', 'bulk delete results', { count: ids.length, userId: req.userId })
    res.json({ deleted: ids.length })
  } catch (err) {
    log.error('api', 'DELETE /api/results/bulk failed', err, { userId: req.userId })
    res.status(500).json({ error: 'Failed to delete results' })
  }
})

// DELETE /api/results/:id — delete a single result
resultsRouter.delete('/:id', requireAuth, async (req, res) => {
  try {
    const [result] = await db.select().from(agentResults).where(eq(agentResults.id, req.params.id))
    if (!result || result.userId !== req.userId) {
      return res.status(404).json({ error: 'Result not found' })
    }
    await db.delete(agentResults).where(eq(agentResults.id, req.params.id))
    res.json({ id: req.params.id })
  } catch (err) {
    log.error('api', 'DELETE /api/results/:id failed', err, { resultId: req.params.id, userId: req.userId })
    res.status(500).json({ error: 'Failed to delete result' })
  }
})

// POST /api/results/:id/score — run AI match score on demand for a single job result
resultsRouter.post('/:id/score', requireAuth, async (req, res) => {
  try {
    const [result] = await db.select().from(agentResults).where(eq(agentResults.id, req.params.id))
    if (!result || result.userId !== req.userId) {
      return res.status(404).json({ error: 'Result not found' })
    }

    const meta = (result.metadata ?? {}) as Record<string, any>
    if (meta.matchScore !== undefined) {
      return res.json({ already: true, metadata: meta })
    }

    const [userRow] = await db.select({ resumeText: users.resumeText }).from(users).where(eq(users.id, req.userId!))
    if (!userRow?.resumeText) {
      return res.status(400).json({ error: 'No resume uploaded — upload a resume before scoring' })
    }

    const jobData = {
      title: meta.jobTitle ?? result.title,
      company: meta.company ?? '',
      location: meta.location ?? '',
      description: meta.description,
      salary: meta.salary,
    }

    const match = await scoreJobMatch(userRow.resumeText, jobData)
    log.info('api', 'on-demand score complete', { resultId: result.id, score: match.score, userId: req.userId })

    let tailoredResumeText: string | undefined
    try {
      const tailored = await tailorResume(userRow.resumeText, jobData)
      tailoredResumeText = tailored.tailoredText
    } catch (err) {
      log.warn('api', 'resume tailoring failed during score', { resultId: result.id })
    }

    const updatedMeta = {
      ...meta,
      matchScore: match.score,
      matchReasoning: match.reasoning,
      coverLetter: match.coverLetter,
      tailoredResumeText,
    }

    const [updated] = await db
      .update(agentResults)
      .set({ metadata: updatedMeta })
      .where(eq(agentResults.id, result.id))
      .returning()

    res.json({ already: false, metadata: updatedMeta })
  } catch (err) {
    log.error('api', 'POST /api/results/:id/score failed', err, { resultId: req.params.id, userId: req.userId })
    res.status(500).json({ error: 'Scoring failed' })
  }
})

// POST /api/results/:id/apply-package — assemble a review-ready AI Apply package
resultsRouter.post('/:id/apply-package', requireAuth, async (req, res) => {
  try {
    const [result] = await db.select().from(agentResults).where(eq(agentResults.id, req.params.id))
    if (!result || result.userId !== req.userId) {
      return res.status(404).json({ error: 'Result not found' })
    }

    const [userRow] = await db.select({ resumeText: users.resumeText, email: users.email }).from(users).where(eq(users.id, req.userId!))
    if (!userRow?.resumeText) {
      return res.status(400).json({ error: 'No resume uploaded — upload a resume before using AI Apply' })
    }

    const [profileRow] = await db.select().from(profiles).where(eq(profiles.userId, req.userId!))

    // Fall back to Clerk identity for name/email when the profile leaves them blank
    let clerkFirst = '', clerkLast = '', clerkEmail = ''
    try {
      const clerkUser = await clerkClient.users.getUser(req.userId!)
      clerkFirst = clerkUser.firstName ?? ''
      clerkLast = clerkUser.lastName ?? ''
      const primary = clerkUser.emailAddresses?.find(e => e.id === clerkUser.primaryEmailAddressId)
      clerkEmail = primary?.emailAddress ?? clerkUser.emailAddresses?.[0]?.emailAddress ?? ''
    } catch { /* non-fatal */ }

    const meta = (result.metadata ?? {}) as Record<string, any>
    const jobData = {
      title: meta.jobTitle ?? result.title,
      company: meta.company ?? '',
      location: meta.location ?? '',
      description: meta.description,
      salary: meta.salary,
    }

    const pkg = await buildApplyPackage(
      {
        firstName: profileRow?.firstName || clerkFirst,
        lastName: profileRow?.lastName || clerkLast,
        email: userRow.email && userRow.email.includes('@') ? userRow.email : clerkEmail,
        phone: profileRow?.phone,
        city: profileRow?.city,
        country: profileRow?.country,
        workAuthorization: profileRow?.workAuthorization,
        needsSponsorship: profileRow?.needsSponsorship,
        linkedinUrl: profileRow?.linkedinUrl,
        githubUrl: profileRow?.githubUrl,
        portfolioUrl: profileRow?.portfolioUrl,
      },
      userRow.resumeText,
      jobData,
    )

    const atsType = inferAtsType(result.url)
    const [application] = await db.insert(applications)
      .values({ userId: req.userId!, resultId: result.id, atsType, status: 'draft', payload: pkg })
      .returning()

    log.info('api', 'apply package built', { resultId: result.id, atsType, applicationId: application.id, userId: req.userId })
    res.json({ applicationId: application.id, atsType, applyUrl: result.url, package: pkg })
  } catch (err) {
    log.error('api', 'POST /api/results/:id/apply-package failed', err, { resultId: req.params.id, userId: req.userId })
    res.status(500).json({ error: 'Failed to build application package' })
  }
})

// PATCH /api/results/applications/:applicationId — persist edited screening answers
// so the future auto-apply agent uses the user's wording as input context
resultsRouter.patch('/applications/:applicationId', requireAuth, async (req, res) => {
  const { screeningAnswers, coverLetter } = req.body as {
    screeningAnswers?: Array<{ question: string; answer: string }>
    coverLetter?: string
  }
  if (screeningAnswers !== undefined && !Array.isArray(screeningAnswers)) {
    return res.status(400).json({ error: 'screeningAnswers must be an array' })
  }
  if (coverLetter !== undefined && typeof coverLetter !== 'string') {
    return res.status(400).json({ error: 'coverLetter must be a string' })
  }
  try {
    const [application] = await db.select().from(applications).where(eq(applications.id, req.params.applicationId))
    if (!application || application.userId !== req.userId) {
      return res.status(404).json({ error: 'Application not found' })
    }
    const payload = { ...((application.payload ?? {}) as Record<string, any>) }
    if (screeningAnswers !== undefined) payload.screeningAnswers = screeningAnswers
    if (coverLetter !== undefined) payload.coverLetter = coverLetter
    const [updated] = await db.update(applications)
      .set({ payload })
      .where(eq(applications.id, application.id))
      .returning()
    res.json({ applicationId: updated.id, payload })
  } catch (err) {
    log.error('api', 'PATCH /api/results/applications/:id failed', err, { applicationId: req.params.applicationId, userId: req.userId })
    res.status(500).json({ error: 'Failed to save answers' })
  }
})

// PATCH /api/results/:id/favourite — toggle favourite flag
resultsRouter.patch('/:id/favourite', requireAuth, async (req, res) => {
  try {
    const [result] = await db.select().from(agentResults).where(eq(agentResults.id, req.params.id))
    if (!result || result.userId !== req.userId) {
      return res.status(404).json({ error: 'Result not found' })
    }
    const [updated] = await db.update(agentResults)
      .set({ isFavourite: !result.isFavourite })
      .where(eq(agentResults.id, req.params.id))
      .returning()
    res.json(updated)
  } catch (err) {
    log.error('api', 'PATCH /api/results/:id/favourite failed', err, { resultId: req.params.id, userId: req.userId })
    res.status(500).json({ error: 'Failed to update favourite' })
  }
})

// PATCH /api/results/:id/applied — toggle applied flag
resultsRouter.patch('/:id/applied', requireAuth, async (req, res) => {
  try {
    const [result] = await db.select().from(agentResults).where(eq(agentResults.id, req.params.id))
    if (!result || result.userId !== req.userId) {
      return res.status(404).json({ error: 'Result not found' })
    }
    const nowApplied = !result.isApplied
    const [updated] = await db.update(agentResults)
      .set({ isApplied: nowApplied, appliedAt: nowApplied ? new Date() : null })
      .where(eq(agentResults.id, req.params.id))
      .returning()
    res.json(updated)
  } catch (err) {
    log.error('api', 'PATCH /api/results/:id/applied failed', err, { resultId: req.params.id, userId: req.userId })
    res.status(500).json({ error: 'Failed to update applied status' })
  }
})

// PATCH /api/results/:id/read — mark result as read
resultsRouter.patch('/:id/read', requireAuth, async (req, res) => {
  try {
    const result = await db.select().from(agentResults).where(eq(agentResults.id, req.params.id))
    if (!result[0] || result[0].userId !== req.userId) {
      return res.status(404).json({ error: 'Result not found' })
    }

    const [updated] = await db.update(agentResults)
      .set({ isRead: true })
      .where(eq(agentResults.id, req.params.id))
      .returning()
    res.json(updated)
  } catch (err) {
    log.error('api', 'PATCH /api/results/:id/read failed', err, { resultId: req.params.id, userId: req.userId })
    res.status(500).json({ error: 'Failed to mark result as read' })
  }
})
