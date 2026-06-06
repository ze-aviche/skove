import { Router } from 'express'
import { db } from '../db/index.js'
import { agentResults } from '../db/schema.js'
import { eq, desc, and, inArray } from 'drizzle-orm'
import { requireAuth } from '../lib/auth.js'
import { log } from '../lib/logger.js'

export const resultsRouter = Router()

// GET /api/results — get all results for the user
resultsRouter.get('/', requireAuth, async (req, res) => {
  try {
    const results = await db.select().from(agentResults)
      .where(eq(agentResults.userId, req.userId!))
      .orderBy(desc(agentResults.createdAt))
      .limit(100)
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
