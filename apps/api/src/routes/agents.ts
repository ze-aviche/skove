import { Router } from 'express'
import { db } from '../db'
import { agentInstances, agentDefinitions } from '../db/schema'
import { eq } from 'drizzle-orm'
import { requireAuth } from '../lib/auth'
import { z } from 'zod'

export const agentsRouter = Router()

// GET /api/agents — list all available agent definitions
agentsRouter.get('/definitions', async (_, res) => {
  try {
    const agents = await db.select().from(agentDefinitions).where(
      eq(agentDefinitions.isPublished, true)
    )
    res.json(agents)
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch agents' })
  }
})

// GET /api/agents/my — list user's deployed agent instances
agentsRouter.get('/my', requireAuth, async (req, res) => {
  try {
    const instances = await db.select().from(agentInstances).where(
      eq(agentInstances.userId, req.userId!)
    )
    res.json(instances)
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch agent instances' })
  }
})

// POST /api/agents/deploy — deploy an agent for the user
const deploySchema = z.object({
  agentId: z.string(),
  config: z.record(z.unknown()),
})

agentsRouter.post('/deploy', requireAuth, async (req, res) => {
  const body = deploySchema.safeParse(req.body)
  if (!body.success) return res.status(400).json({ error: body.error })

  try {
    const [instance] = await db.insert(agentInstances).values({
      userId: req.userId!,
      agentId: body.data.agentId,
      config: body.data.config,
      isActive: true,
    }).returning()
    res.json(instance)
  } catch (err) {
    res.status(500).json({ error: 'Failed to deploy agent' })
  }
})

// PATCH /api/agents/:id/toggle — pause or resume an agent
agentsRouter.patch('/:id/toggle', requireAuth, async (req, res) => {
  try {
    const instance = await db.select().from(agentInstances).where(
      eq(agentInstances.id, req.params.id)
    )
    if (!instance[0] || instance[0].userId !== req.userId) {
      return res.status(404).json({ error: 'Agent not found' })
    }
    const [updated] = await db.update(agentInstances)
      .set({ isActive: !instance[0].isActive })
      .where(eq(agentInstances.id, req.params.id))
      .returning()
    res.json(updated)
  } catch (err) {
    res.status(500).json({ error: 'Failed to toggle agent' })
  }
})
