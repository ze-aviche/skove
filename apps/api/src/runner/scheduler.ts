import * as cron from 'node-cron'
import { eq } from 'drizzle-orm'
import { clerkClient } from '@clerk/clerk-sdk-node'
import { db } from '../db'
import { agentInstances, agentDefinitions, agentResults, users } from '../db/schema'
import { agentRunners } from './agents'
import { sendAlertEmail, sendDailyDigest, DigestItem } from '../lib/email'
import { log } from '../lib/logger'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const scheduledTasks = new Map<string, any>()

// Maps human-readable frequency labels → cron expressions
const FREQUENCY_CRON: Record<string, string> = {
  'Every 30 minutes': '*/30 * * * *',
  'Every 1 hour':     '0 */1 * * *',
  'Every 2 hours':    '0 */2 * * *',
  'Every 4 hours':    '0 */4 * * *',
  'Every 6 hours':    '0 */6 * * *',
  'Every 12 hours':   '0 */12 * * *',
  'Daily':            '0 8 * * *',
  'Twice daily':      '0 8,20 * * *',
  'Every 2 days':     '0 8 */2 * *',
  'Weekly':           '0 8 * * 1',
}

// Minutes between runs for nextRunAt estimation
const FREQUENCY_MINUTES: Record<string, number> = {
  'Every 30 minutes': 30,
  'Every 1 hour':     60,
  'Every 2 hours':    120,
  'Every 4 hours':    240,
  'Every 6 hours':    360,
  'Every 12 hours':   720,
  'Daily':            1440,
  'Twice daily':      720,
  'Every 2 days':     2880,
  'Weekly':           10080,
}

export function frequencyToCron(frequency: string, fallback: string): string {
  return FREQUENCY_CRON[frequency] ?? fallback
}

export async function startScheduler() {
  const rows = await db
    .select()
    .from(agentInstances)
    .innerJoin(agentDefinitions, eq(agentInstances.agentId, agentDefinitions.id))
    .where(eq(agentInstances.isActive, true))

  for (const row of rows) {
    const config = (row.agent_instances.config ?? {}) as Record<string, unknown>
    const freq = typeof config.frequency === 'string' ? config.frequency : null
    const cronExpr = freq ? frequencyToCron(freq, row.agent_definitions.schedule) : row.agent_definitions.schedule
    scheduleInstance(row.agent_instances.id, cronExpr)
  }

  // Morning digest — every day at 8am
  cron.schedule('0 8 * * *', () => {
    sendMorningDigest().catch((err) => log.error('scheduler', 'morning digest failed', err))
  })

  log.info('scheduler', 'started', { activeAgents: rows.length })
}

export function scheduleInstance(instanceId: string, cronExpression: string) {
  if (scheduledTasks.has(instanceId)) return

  if (!cron.validate(cronExpression)) {
    log.warn('scheduler', 'invalid cron expression', { instanceId, cronExpression })
    return
  }

  const task = cron.schedule(cronExpression, () => {
    runInstance(instanceId).catch((err) =>
      log.error('scheduler', 'run failed', err, { instanceId })
    )
  })

  scheduledTasks.set(instanceId, task)
  log.info('scheduler', 'instance scheduled', { instanceId, cronExpression })
}

export function unscheduleInstance(instanceId: string) {
  const task = scheduledTasks.get(instanceId)
  if (task) {
    task.destroy()
    scheduledTasks.delete(instanceId)
    log.info('scheduler', 'instance unscheduled', { instanceId })
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

  // Fetch previously seen results before running so agents can skip already-known items
  const existing = await db
    .select({ url: agentResults.url, title: agentResults.title })
    .from(agentResults)
    .where(eq(agentResults.instanceId, instance.id))

  const seenKeys = new Set(existing.map(r => r.url ?? r.title))
  log.info('scheduler', 'run started', { agentId: definition.id, userId: instance.userId, seenCount: seenKeys.size })

  const results = await runner(instance.config as Record<string, unknown>, { userId: instance.userId, seenKeys })

  // Safety-net dedup in case an agent returns something it shouldn't have
  const newResults = results.filter(r => !seenKeys.has(r.url ?? r.title))

  for (const result of newResults) {
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

  const instanceFreq = typeof (instance.config as Record<string, unknown>)?.frequency === 'string'
    ? (instance.config as Record<string, unknown>).frequency as string
    : null
  const nextRunAt = estimateNextRun(instanceFreq, definition.schedule)
  await db
    .update(agentInstances)
    .set({ lastRunAt: new Date(), nextRunAt })
    .where(eq(agentInstances.id, instanceId))

  log.info('scheduler', 'run complete', { agentId: definition.id, userId: instance.userId, found: results.length, inserted: newResults.length })

  if (newResults.length > 0) {
    const email = await getUserEmail(instance.userId)
    if (email) {
      await sendAlertEmail(email, definition.name, newResults)
    }
  }

  return newResults
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

  log.info('scheduler', 'morning digest sent', { userCount: byUser.size })
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
    log.warn('scheduler', 'could not fetch user email', { userId, error: err instanceof Error ? err.message : String(err) })
    return null
  }
}

function estimateNextRun(frequency: string | null, fallbackCron: string): Date {
  const next = new Date()

  // Use frequency label if available — much more reliable than cron parsing
  if (frequency && FREQUENCY_MINUTES[frequency]) {
    next.setMinutes(next.getMinutes() + FREQUENCY_MINUTES[frequency])
    return next
  }

  // Fallback: parse the definition's cron expression
  const parts = fallbackCron.split(' ')
  const minutePart = parts[0]
  const hourPart = parts[1]
  if (minutePart.startsWith('*/')) {
    next.setMinutes(next.getMinutes() + parseInt(minutePart.slice(2)))
  } else if (hourPart?.startsWith('*/')) {
    next.setHours(next.getHours() + parseInt(hourPart.slice(2)))
  } else {
    next.setHours(next.getHours() + 24)
  }
  return next
}
