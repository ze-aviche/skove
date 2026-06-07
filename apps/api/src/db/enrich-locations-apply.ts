import { config } from 'dotenv'
config({ path: '.env.local' })

import { db } from './index.js'
import { atsJobs } from './schema.js'
import { eq } from 'drizzle-orm'
import { readFileSync } from 'fs'
import { resolve } from 'path'

function normalizeText(value?: string) {
  return String(value ?? '').trim().toLowerCase()
}

function enrichLocation(location: string, mappings: Record<string, string>): string {
  const normalized = location.trim().toLowerCase()
  if (normalized.includes('remote')) return 'Remote'

  const enriched = mappings[normalized]
  if (enriched) return enriched

  if (normalized.includes(',')) return location

  return location
}

async function main() {
  console.log('Loading enrichment mappings...')

  // Try to load from enrichment-map.json if it exists, otherwise use basic mappings
  let enrichmentMap: Record<string, string> = {}
  const mappingFile = resolve('./enrichment-map.json')

  try {
    const data = readFileSync(mappingFile, 'utf-8')
    enrichmentMap = JSON.parse(data)
    console.log(`✓ Loaded ${Object.keys(enrichmentMap).length} mappings from enrichment-map.json`)
  } catch {
    console.log('No enrichment-map.json found, using basic mappings')
    enrichmentMap = {
      'san francisco': 'san francisco, ca, us',
      'new york': 'new york, ny, us',
      'los angeles': 'los angeles, ca, us',
      'chicago': 'chicago, il, us',
      'remote': 'remote',
    }
  }

  console.log('\nApplying location enrichment...')
  const allJobs = await db.select().from(atsJobs)
  console.log(`Found ${allJobs.length} total jobs`)

  let updated = 0
  let skipped = 0

  for (const job of allJobs) {
    const enrichedLocation = enrichLocation(job.location, enrichmentMap)

    // Skip if location didn't change
    if (enrichedLocation === job.location) {
      skipped++
      continue
    }

    // Update with enriched location
    await db
      .update(atsJobs)
      .set({
        location: enrichedLocation,
        locationSearch: normalizeText(enrichedLocation),
      })
      .where(eq(atsJobs.id, job.id))

    updated++
    if (updated % 100 === 0) {
      console.log(`  Updated ${updated}...`)
    }
  }

  console.log(`\n✓ Complete`)
  console.log(`  Updated: ${updated}`)
  console.log(`  Skipped (already enriched): ${skipped}`)
}

main().catch(console.error)
