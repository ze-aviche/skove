import { config } from 'dotenv'
config({ path: '.env.local' })

import { db } from './index.js'
import { atsJobs } from './schema.js'
import { sql, count } from 'drizzle-orm'

// Target countries for jobs
const TARGET_COUNTRIES = ['us', 'india', 'australia', 'uk', 'remote']
const RETENTION_DAYS = 7

export async function cleanupStaleJobs(): Promise<{ deleted: number; remaining: number }> {
  // Delete jobs older than RETENTION_DAYS OR from non-target countries
  const sevenDaysAgo = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000)

  const result = await db.delete(atsJobs).where(
    sql`
      (${atsJobs.createdAt} < ${sevenDaysAgo})
      OR NOT (
        ${atsJobs.locationSearch} LIKE '%us%'
        OR ${atsJobs.locationSearch} LIKE '%india%'
        OR ${atsJobs.locationSearch} LIKE '%australia%'
        OR ${atsJobs.locationSearch} LIKE '%uk%'
        OR ${atsJobs.locationSearch} LIKE '%remote%'
      )
    `
  ).returning()

  const [{ remaining }] = await db.select({ remaining: count() }).from(atsJobs)

  return { deleted: result.length, remaining }
}

async function main() {
  console.log(`Cleaning up stale jobs (retention: ${RETENTION_DAYS} days)...\n`)

  const result = await cleanupStaleJobs()
  console.log(`✓ Complete`)
  console.log(`  Deleted: ${result.deleted}`)
  console.log(`  Remaining: ${result.remaining}`)
}

main().catch(console.error)
