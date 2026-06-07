import { config } from 'dotenv'
config({ path: '.env.local' })

import { db } from './index.js'
import { atsJobs } from './schema.js'
import { sql } from 'drizzle-orm'

// Enrichment mapping - will be built based on actual DB locations
let ENRICHMENT_MAP: Record<string, string> = {
  'san francisco': 'san francisco, ca, us',
  'new york': 'new york, ny, us',
  'los angeles': 'los angeles, ca, us',
  'chicago': 'chicago, il, us',
  'austin': 'austin, tx, us',
  'seattle': 'seattle, wa, us',
  'london': 'london, uk',
  'toronto': 'toronto, on, ca',
  'vancouver': 'vancouver, bc, ca',
  'berlin': 'berlin, germany',
  'paris': 'paris, france',
  'singapore': 'singapore, sg',
  'sydney': 'sydney, australia',
  'tokyo': 'tokyo, japan',
  'dubai': 'dubai, uae',
  'bangalore': 'bangalore, india',
  'mumbai': 'mumbai, india',
  'remote': 'remote',
}

function normalizeText(value?: string) {
  return String(value ?? '').trim().toLowerCase()
}

function enrichLocation(location: string): string {
  const normalized = location.trim().toLowerCase()
  if (normalized.includes('remote')) return 'Remote'

  // Check if it's in our mapping
  const enriched = ENRICHMENT_MAP[normalized]
  if (enriched) return enriched

  // If it already has a comma, it's likely already enriched
  if (normalized.includes(',')) return location

  // Return as-is if we can't enrich it
  return location
}

async function main() {
  console.log('Fetching all unique locations from database...\n')

  // Get all unique locations
  const allJobs = await db.select({ location: atsJobs.location }).from(atsJobs)
  const uniqueLocations = Array.from(new Set(allJobs.map((r) => r.location))).sort()

  console.log(`Found ${uniqueLocations.length} unique locations:\n`)

  // Separate into already-enriched (have comma) and city-only (no comma)
  const needsEnrichment = uniqueLocations.filter((loc: string) => !loc.includes(',') && !loc.toLowerCase().includes('remote'))
  const alreadyEnriched = uniqueLocations.filter((loc: string) => loc.includes(',') || loc.toLowerCase().includes('remote'))

  console.log('=== ALREADY ENRICHED (will skip) ===')
  alreadyEnriched.forEach((loc: string) => console.log(`  ✓ ${loc}`))

  console.log(`\n=== NEEDS ENRICHMENT (${needsEnrichment.length} locations) ===`)
  needsEnrichment.forEach((loc: string) => {
    const normalized = normalizeText(loc)
    const enriched = ENRICHMENT_MAP[normalized]
    if (enriched) {
      console.log(`  → ${loc} → ${enriched}`)
    } else {
      console.log(`  ⚠ ${loc} (NO MAPPING - will keep as-is)`)
    }
  })

  console.log('\n=== LOCATIONS WITH NO MAPPING ===')
  const unmapped = needsEnrichment.filter((loc: string) => !ENRICHMENT_MAP[normalizeText(loc)])
  if (unmapped.length === 0) {
    console.log('  None - all city-only locations have mappings')
  } else {
    console.log('  These will be kept as-is (add to ENRICHMENT_MAP to enrich):')
    unmapped.forEach((loc: string) => console.log(`    - ${loc}`))
  }

  // Count how many jobs will be updated
  const jobsNeedingUpdate = await db
    .select({ count: sql<string>`count(*)` })
    .from(atsJobs)
    .where(sql`location NOT LIKE '%,%' AND location NOT ILIKE '%remote%'`)

  console.log(`\n=== UPDATE PLAN ===`)
  console.log(`  Will update: ${jobsNeedingUpdate[0]?.count || 0} jobs`)
  console.log(`  Will skip: ${uniqueLocations.length - needsEnrichment.length} locations (already enriched or remote)`)

  console.log('\n✓ Location analysis complete')
  console.log('\nIf you want to add mappings for unmapped locations, edit ENRICHMENT_MAP above and re-run.')
  console.log('\nTo apply enrichment, run: pnpm --filter api db:enrich-locations-apply\n')
}

main().catch(console.error)
