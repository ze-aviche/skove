import { Router } from 'express'
import { clerkClient } from '@clerk/clerk-sdk-node'
import { db } from '../db'
import { agentInstances, agentDefinitions, users, agentResults } from '../db/schema'
import { eq } from 'drizzle-orm'
import { requireAuth } from '../lib/auth'
import { z } from 'zod'
import { scheduleInstance, unscheduleInstance, runInstance } from '../runner/scheduler'
import { log } from '../lib/logger'
import { PLANS } from '../lib/stripe'

export const agentsRouter = Router()

// GET /api/agents — list all available agent definitions
agentsRouter.get('/definitions', async (_, res) => {
  try {
    const agents = await db.select().from(agentDefinitions).where(
      eq(agentDefinitions.isPublished, true)
    )
    res.json(agents)
  } catch (err) {
    log.error('api', 'GET /api/agents/definitions failed', err)
    res.status(500).json({ error: 'Failed to fetch agents' })
  }
})

// Debug: return the authenticated user id
agentsRouter.get('/whoami', requireAuth, async (req, res) => {
  try {
    res.json({ userId: req.userId })
  } catch (err) {
    log.error('api', 'GET /api/agents/whoami failed', err)
    res.status(500).json({ error: 'Failed to resolve user' })
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
    log.error('api', 'GET /api/agents/my failed', err, { userId: req.userId })
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
    // Ensure user row exists with a real email address
    const existingUser = await db.select().from(users).where(eq(users.id, req.userId!))
    if (!existingUser[0]) {
      let email = req.userId! // fallback
      try {
        const clerkUser = await clerkClient.users.getUser(req.userId!)
        email = clerkUser.emailAddresses[0]?.emailAddress ?? req.userId!
      } catch { /* non-fatal — proceed with fallback */ }
      await db.insert(users).values({ id: req.userId!, email })
    }

    // Enforce plan agent limit
    const plan = (existingUser[0]?.plan ?? 'free') as keyof typeof PLANS
    const maxAgents = PLANS[plan]?.maxAgents ?? PLANS.free.maxAgents
    if (maxAgents !== Infinity) {
      const current = await db.select().from(agentInstances).where(eq(agentInstances.userId, req.userId!))
      if (current.length >= maxAgents) {
        return res.status(403).json({
          error: `Free plan is limited to ${maxAgents} agent${maxAgents !== 1 ? 's' : ''}. Upgrade to Pro for unlimited agents.`,
          code: 'PLAN_LIMIT_REACHED',
        })
      }
    }

    const [instance] = await db.insert(agentInstances).values({
      userId: req.userId!,
      agentId: body.data.agentId,
      config: body.data.config,
      isActive: true,
    }).returning()

    // Look up the agent's schedule and schedule it immediately
    const [definition] = await db.select().from(agentDefinitions).where(eq(agentDefinitions.id, body.data.agentId))
    if (definition) {
      scheduleInstance(instance.id, definition.schedule)
    }

    // Run immediately on first deploy — don't make user wait for the first cron tick
    runInstance(instance.id).catch((err) =>
      log.error('api', 'initial run after deploy failed', err, { instanceId: instance.id, userId: req.userId })
    )

    res.json(instance)
  } catch (err) {
    log.error('api', 'POST /api/agents/deploy failed', err, { userId: req.userId })
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
    const nowActive = !instance[0].isActive
    const [updated] = await db.update(agentInstances)
      .set({ isActive: nowActive })
      .where(eq(agentInstances.id, req.params.id))
      .returning()

    if (nowActive) {
      const [definition] = await db.select().from(agentDefinitions).where(eq(agentDefinitions.id, instance[0].agentId))
      if (definition) scheduleInstance(updated.id, definition.schedule)
    } else {
      unscheduleInstance(updated.id)
    }

    res.json(updated)
  } catch (err) {
    log.error('api', 'PATCH /api/agents/:id/toggle failed', err, { instanceId: req.params.id, userId: req.userId })
    res.status(500).json({ error: 'Failed to toggle agent' })
  }
})

const updateConfigSchema = z.object({
  config: z.record(z.unknown()),
})

// PATCH /api/agents/:id/config — update an agent's configuration
agentsRouter.patch('/:id/config', requireAuth, async (req, res) => {
  const body = updateConfigSchema.safeParse(req.body)
  if (!body.success) return res.status(400).json({ error: body.error })

  try {
    const instance = await db.select().from(agentInstances).where(
      eq(agentInstances.id, req.params.id)
    )
    if (!instance[0] || instance[0].userId !== req.userId) {
      return res.status(404).json({ error: 'Agent not found' })
    }

    const [updated] = await db.update(agentInstances)
      .set({ config: body.data.config })
      .where(eq(agentInstances.id, req.params.id))
      .returning()
    res.json(updated)
  } catch (err) {
    log.error('api', 'PATCH /api/agents/:id/config failed', err, { instanceId: req.params.id, userId: req.userId })
    res.status(500).json({ error: 'Failed to update agent config' })
  }
})

// POST /api/agents/:id/run — manually trigger an agent run immediately
agentsRouter.post('/:id/run', requireAuth, async (req, res) => {
  try {
    const [instance] = await db.select().from(agentInstances).where(eq(agentInstances.id, req.params.id))
    if (!instance || instance.userId !== req.userId) {
      return res.status(404).json({ error: 'Agent not found' })
    }
    // Respond immediately so navigating away doesn't cancel the run
    res.json({ ran: true, queued: true })
    runInstance(req.params.id).catch((err) =>
      log.error('api', 'background run failed', err, { instanceId: req.params.id, userId: req.userId })
    )
  } catch (err) {
    log.error('api', 'POST /api/agents/:id/run failed', err, { instanceId: req.params.id, userId: req.userId })
    res.status(500).json({ error: err instanceof Error ? err.message : 'Run failed' })
  }
})

// DELETE /api/agents/:id — undeploy and remove a user agent instance
agentsRouter.delete('/:id', requireAuth, async (req, res) => {
  try {
    const instance = await db.select().from(agentInstances).where(
      eq(agentInstances.id, req.params.id)
    )
    if (!instance[0] || instance[0].userId !== req.userId) {
      return res.status(404).json({ error: 'Agent not found' })
    }

    unscheduleInstance(req.params.id)
    await db.delete(agentResults).where(eq(agentResults.instanceId, req.params.id))
    await db.delete(agentInstances).where(eq(agentInstances.id, req.params.id))

    res.json({ id: req.params.id })
  } catch (err) {
    log.error('api', 'DELETE /api/agents/:id failed', err, { instanceId: req.params.id, userId: req.userId })
    res.status(500).json({ error: 'Failed to delete agent' })
  }
})
