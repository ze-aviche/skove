import * as cron from 'node-cron'
import { eq, and } from 'drizzle-orm'
import { clerkClient } from '@clerk/clerk-sdk-node'
import { db } from '../db'
import { agentInstances, agentDefinitions, agentResults, users } from '../db/schema'
import { agentRunners } from './agents'
import { sendAlertEmail, sendDailyDigest, DigestItem } from '../lib/email'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const scheduledTasks = new Map<string, any>()

export async function startScheduler() {
  const rows = await db
    .select()
    .from(agentInstances)
    .innerJoin(agentDefinitions, eq(agentInstances.agentId, agentDefinitions.id))
    .where(eq(agentInstances.isActive, true))

  for (const row of rows) {
    scheduleInstance(row.agent_instances.id, row.agent_definitions.schedule)
  }

  // Morning digest — every day at 8am
  cron.schedule('0 8 * * *', () => {
    sendMorningDigest().catch((err) => console.error('[scheduler] Digest failed:', err))
  })

  console.log(`[scheduler] Started — ${rows.length} active agents scheduled`)
}

export function scheduleInstance(instanceId: string, cronExpression: string) {
  if (scheduledTasks.has(instanceId)) return

  if (!cron.validate(cronExpression)) {
    console.warn(`[scheduler] Invalid cron "${cronExpression}" for instance ${instanceId}`)
    return
  }

  const task = cron.schedule(cronExpression, () => {
    runInstance(instanceId).catch((err) =>
      console.error(`[scheduler] Run failed for ${instanceId}:`, err)
    )
  })

  scheduledTasks.set(instanceId, task)
  console.log(`[scheduler] Scheduled ${instanceId} (${cronExpression})`)
}

export function unscheduleInstance(instanceId: string) {
  const task = scheduledTasks.get(instanceId)
  if (task) {
    task.destroy()
    scheduledTasks.delete(instanceId)
    console.log(`[scheduler] Unscheduled ${instanceId}`)
  }
}

export async function runInstance(instanceId: string) {
  const [row] = await db
    .select()
    .from(agentInstances)
    .innerJoin(agentDefinitions, eq(agentInstances.agentId, agentDefinitions.id))
    .where(eq(agentInstances.id, instanceId))

  if (!row) throw new Error(`Instance ${instanceId} not found`)

  const { agent_instances: instance, agent_definitions: definition } = row
  const runner = agentRunners[definition.id]

  if (!runner) throw new Error(`No runner registered for agent "${definition.id}"`)

  console.log(`[scheduler] Running ${definition.id} for user ${instance.userId}`)

  const results = await runner(instance.config as Record<string, unknown>, { userId: instance.userId })

  for (const result of results) {
    await db.insert(agentResults).values({
      instanceId: instance.id,
      userId: instance.userId,
      title: result.title,
      value: result.value ?? null,
      url: result.url ?? null,
      metadata: result.metadata ?? null,
      isRead: false,
    })
  }

  const nextRunAt = estimateNextRun(definition.schedule)
  await db
    .update(agentInstances)
    .set({ lastRunAt: new Date(), nextRunAt })
    .where(eq(agentInstances.id, instanceId))

  console.log(`[scheduler] ${definition.id} produced ${results.length} result(s)`)

  if (results.length > 0) {
    const email = await getUserEmail(instance.userId)
    if (email) {
      await sendAlertEmail(email, definition.name, results)
    }
  }

  return results
}

async function sendMorningDigest() {
  // Find all users who have unread results
  const unreadRows = await db
    .select()
    .from(agentResults)
    .innerJoin(agentInstances, eq(agentResults.instanceId, agentInstances.id))
    .innerJoin(agentDefinitions, eq(agentInstances.agentId, agentDefinitions.id))
    .where(eq(agentResults.isRead, false))

  if (unreadRows.length === 0) return

  // Group unread results by userId
  const byUser = new Map<string, DigestItem[]>()
  for (const row of unreadRows) {
    const userId = row.agent_results.userId
    if (!byUser.has(userId)) byUser.set(userId, [])
    byUser.get(userId)!.push({
      agentName: row.agent_definitions.name,
      title: row.agent_results.title,
      value: row.agent_results.value,
      url: row.agent_results.url,
    })
  }

  for (const [userId, items] of byUser) {
    const email = await getUserEmail(userId)
    if (email) {
      await sendDailyDigest(email, items)
    }
  }

  console.log(`[scheduler] Morning digest sent to ${byUser.size} user(s)`)
}

async function getUserEmail(userId: string): Promise<string | null> {
  // Try our users table first (populated by Clerk webhook or deploy route)
  const [userRow] = await db.select().from(users).where(eq(users.id, userId))
  if (userRow?.email && userRow.email.includes('@')) {
    return userRow.email
  }

  // Fall back to Clerk SDK for the real email
  try {
    const clerkUser = await clerkClient.users.getUser(userId)
    const email = clerkUser.emailAddresses[0]?.emailAddress ?? null
    // Update our users table so we don't have to call Clerk again
    if (email && userRow) {
      await db.update(users).set({ email }).where(eq(users.id, userId))
    }
    return email
  } catch (err) {
    console.warn(`[scheduler] Could not fetch email for ${userId}:`, err)
    return null
  }
}

function estimateNextRun(cronExpression: string): Date {
  const next = new Date()
  const parts = cronExpression.split(' ')
  const minutePart = parts[0]
  const hourPart = parts[1]

  if (minutePart.startsWith('*/')) {
    next.setMinutes(next.getMinutes() + parseInt(minutePart.slice(2)))
  } else if (hourPart?.startsWith('*/')) {
    next.setHours(next.getHours() + parseInt(hourPart.slice(2)))
  } else {
    next.setHours(next.getHours() + 1)
  }
  return next
}
