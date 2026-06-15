import { Router } from 'express'
import { db } from '../db/index.js'
import { agentResults, users } from '../db/schema.js'
import { eq, desc, and, inArray } from 'drizzle-orm'
import { requireAuth } from '../lib/auth.js'
import { log } from '../lib/logger.js'
import { scoreJobMatch, tailorResume } from '../lib/claude.js'

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
