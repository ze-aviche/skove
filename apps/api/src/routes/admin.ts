import { Router } from 'express'
import { requireAuth } from '../lib/auth'
import { db } from '../db'
import { users, agentInstances, agentResults } from '../db/schema'
import { eq, sql } from 'drizzle-orm'
import { clerkClient } from '@clerk/clerk-sdk-node'
import { log } from '../lib/logger'
import { z } from 'zod'

export const adminRouter = Router()

// All admin routes require auth + admin role
const ADMIN_USER_IDS = (process.env.ADMIN_USER_IDS ?? '').split(',').map(s => s.trim()).filter(Boolean)

function requireAdmin(req: any, res: any, next: any) {
  if (!req.userId || !ADMIN_USER_IDS.includes(req.userId)) {
    log.warn('admin', 'unauthorized access attempt', { userId: req.userId })
    return res.status(403).json({ error: 'Forbidden' })
  }
  next()
}

async function fetchAllClerkUsers() {
  const pageSize = 500
  const allUsers: Awaited<ReturnType<typeof clerkClient.users.getUser>>[] = []
  let offset = 0
  while (true) {
    const page = await clerkClient.users.getUserList({ limit: pageSize, offset })
    allUsers.push(...(page as any))
    if ((page as any).length < pageSize) break
    offset += pageSize
  }
  return allUsers
}

// GET /api/admin/stats
adminRouter.get('/stats', requireAuth, requireAdmin, async (req, res) => {
  try {
    const [clerkUsers, totalAgents, totalResults, proUsers] = await Promise.all([
      fetchAllClerkUsers(),
      db.select({ count: sql<number>`count(*)` }).from(agentInstances).then(r => Number(r[0].count)),
      db.select({ count: sql<number>`count(*)` }).from(agentResults).then(r => Number(r[0].count)),
      db.select({ count: sql<number>`count(*)` }).from(users).where(eq(users.plan, 'pro')).then(r => Number(r[0].count)),
    ])

    res.json({
      totalUsers: clerkUsers.length,
      totalAgents,
      totalResults,
      proUsers,
    })
  } catch (err) {
    log.error('admin', 'GET /api/admin/stats failed', err)
    res.status(500).json({ error: 'Failed to fetch stats' })
  }
})

// GET /api/admin/users — reconcile Clerk (source of truth) with DB, then return merged list
adminRouter.get('/users', requireAuth, requireAdmin, async (req, res) => {
  try {
    const [clerkUsers, dbUsers] = await Promise.all([
      fetchAllClerkUsers(),
      db.select().from(users),
    ])

    const clerkIds = new Set(clerkUsers.map((u: any) => u.id))
    const dbMap = new Map(dbUsers.map(u => [u.id, u]))

    // Upsert any Clerk user missing from DB, and fix stale emails
    for (const cu of clerkUsers) {
      const email: string = (cu as any).emailAddresses?.[0]?.emailAddress ?? ''
      if (!email) continue
      const existing = dbMap.get((cu as any).id)
      if (!existing) {
        const [inserted] = await db.insert(users).values({ id: (cu as any).id, email }).returning()
        dbMap.set((cu as any).id, inserted)
        log.info('admin', 'user auto-created in DB from Clerk', { userId: (cu as any).id })
      } else if (existing.email !== email) {
        await db.update(users).set({ email }).where(eq(users.id, (cu as any).id))
        existing.email = email
        log.info('admin', 'user email synced from Clerk', { userId: (cu as any).id })
      }
    }

    // Log orphaned DB users (deleted from Clerk but not yet from DB)
    // These are excluded from the response; delete them via the admin Del button
    for (const dbUser of dbUsers) {
      if (!clerkIds.has(dbUser.id)) {
        log.warn('admin', 'orphaned DB user (not in Clerk) — delete via admin page', { userId: dbUser.id, email: dbUser.email })
      }
    }

    const [agentCounts, resultCounts] = await Promise.all([
      db.select({ userId: agentInstances.userId, count: sql<number>`count(*)` }).from(agentInstances).groupBy(agentInstances.userId),
      db.select({ userId: agentResults.userId, count: sql<number>`count(*)` }).from(agentResults).groupBy(agentResults.userId),
    ])

    const agentMap = Object.fromEntries(agentCounts.map(r => [r.userId, Number(r.count)]))
    const resultMap = Object.fromEntries(resultCounts.map(r => [r.userId, Number(r.count)]))

    const result = clerkUsers
      .map((cu: any) => {
        const u = dbMap.get(cu.id)
        if (!u) return null
        return {
          id: u.id,
          email: u.email,
          plan: u.plan,
          agentCount: agentMap[u.id] ?? 0,
          resultCount: resultMap[u.id] ?? 0,
          createdAt: u.createdAt,
          planExpiresAt: u.planExpiresAt,
        }
      })
      .filter(Boolean)

    res.json(result)
  } catch (err) {
    log.error('admin', 'GET /api/admin/users failed', err)
    res.status(500).json({ error: 'Failed to fetch users' })
  }
})

// PATCH /api/admin/users/:id/plan — change a user's plan
const planSchema = z.object({ plan: z.enum(['free', 'pro']) })

adminRouter.patch('/users/:id/plan', requireAuth, requireAdmin, async (req, res) => {
  const body = planSchema.safeParse(req.body)
  if (!body.success) return res.status(400).json({ error: 'Plan must be "free" or "pro"' })

  try {
    const [updated] = await db.update(users)
      .set({ plan: body.data.plan, planExpiresAt: null })
      .where(eq(users.id, req.params.id))
      .returning({ id: users.id, plan: users.plan })

    if (!updated) return res.status(404).json({ error: 'User not found' })
    log.info('admin', 'plan changed', { targetUserId: req.params.id, plan: body.data.plan, adminId: req.userId })
    res.json(updated)
  } catch (err) {
    log.error('admin', 'PATCH /api/admin/users/:id/plan failed', err, { targetUserId: req.params.id })
    res.status(500).json({ error: 'Failed to update plan' })
  }
})

// DELETE /api/admin/users/:id — delete user from DB + Clerk
adminRouter.delete('/users/:id', requireAuth, requireAdmin, async (req, res) => {
  const targetId = req.params.id
  try {
    // Remove all data in order (FK constraints)
    await db.delete(agentResults).where(eq(agentResults.userId, targetId))
    const instances = await db.select({ id: agentInstances.id }).from(agentInstances).where(eq(agentInstances.userId, targetId))
    for (const inst of instances) {
      await db.delete(agentResults).where(eq(agentResults.instanceId, inst.id))
    }
    await db.delete(agentInstances).where(eq(agentInstances.userId, targetId))
    await db.delete(users).where(eq(users.id, targetId))

    // Delete from Clerk
    try {
      await clerkClient.users.deleteUser(targetId)
    } catch (err) {
      log.warn('admin', 'clerk delete failed (user may not exist in Clerk)', { targetUserId: targetId })
    }

    log.info('admin', 'user deleted', { targetUserId: targetId, adminId: req.userId })
    res.json({ id: targetId })
  } catch (err) {
    log.error('admin', 'DELETE /api/admin/users/:id failed', err, { targetUserId: targetId })
    res.status(500).json({ error: 'Failed to delete user' })
  }
})
