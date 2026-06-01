import { Router } from 'express'
import { db } from '../db'
import { agentResults } from '../db/schema'
import { eq, desc } from 'drizzle-orm'
import { requireAuth } from '../lib/auth'
import { log } from '../lib/logger'

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
