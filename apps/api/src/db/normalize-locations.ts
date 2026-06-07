import { config } from 'dotenv'
config({ path: '.env.local' })

import { db } from './index.js'
import { atsJobs } from './schema.js'
import { eq } from 'drizzle-orm'
import { extractLocationSearch } from '../lib/location.js'

async function main() {
  console.log('Normalizing job locations to country codes...\n')

  const allJobs = await db.select().from(atsJobs)
  console.log(`Found ${allJobs.length} jobs`)

  let updated = 0

  for (const job of allJobs) {
    const locationSearch = extractLocationSearch(job.location)
    await db.update(atsJobs).set({ locationSearch }).where(eq(atsJobs.id, job.id))
    updated++
    if (updated % 1000 === 0) console.log(`  Normalized ${updated}...`)
  }

  console.log(`\n✓ Complete — normalized ${updated} jobs`)
}

main().catch(console.error)
