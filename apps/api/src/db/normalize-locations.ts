import { config } from 'dotenv'
config({ path: '.env.local' })

import { db } from './index.js'
import { atsJobs } from './schema.js'
import { eq } from 'drizzle-orm'

// Map location text to country code
function extractCountry(location: string): string | null {
  const lower = location.toLowerCase()

  // Exact country matches
  if (lower.includes('united states') || lower.includes('usa') || lower === 'us') return 'US'
  if (lower.includes('united kingdom') || lower.includes('uk') || lower === 'gb') return 'UK'
  if (lower.includes('india')) return 'India'
  if (lower.includes('australia') || lower === 'au') return 'Australia'

  // State/province patterns for US
  if (/\b(ca|texas|ny|florida|illinois|ohio|pennsylvania|georgia|north carolina|michigan|new jersey|virginia|washington|arizona|massachusetts|tennessee|colorado|minnesota|missouri|alabama|maryland|louisiana|wisconsin|indiana|oklahoma|utah|iowa|nevada|arkansas|kansas|mississippi|new mexico|nebraska|idaho|hawaii|maine|new hampshire|montana|rhode island|delaware|south dakota|north dakota|wyoming|west virginia|vermont|connecticut|alaska)\b/i.test(lower)) {
    return 'US'
  }

  // UK regions
  if (/\b(london|manchester|birmingham|leeds|glasgow|england|scotland|wales|northern ireland)\b/i.test(lower)) {
    return 'UK'
  }

  // Indian cities
  if (/\b(bangalore|bengaluru|mumbai|delhi|hyderabad|pune|ahmedabad|chennai|kolkata|gurgaon|noida)\b/i.test(lower)) {
    return 'India'
  }

  // Australian cities
  if (/\b(sydney|melbourne|brisbane|perth|adelaide|hobart|canberra|gold coast)\b/i.test(lower)) {
    return 'Australia'
  }

  // Remote indicators
  if (/\b(remote|distributed|anywhere)\b/i.test(lower)) {
    return 'Remote'
  }

  return null
}

async function main() {
  console.log('Normalizing job locations to country codes...\n')

  const allJobs = await db.select().from(atsJobs)
  console.log(`Found ${allJobs.length} jobs`)

  let updated = 0
  let remote = 0
  let unknown = 0

  for (const job of allJobs) {
    const country = extractCountry(job.location)

    if (country === 'Remote') {
      remote++
    } else if (!country) {
      unknown++
    }

    if (country) {
      // Update location to just the country for consistency
      await db
        .update(atsJobs)
        .set({
          location: country,
          locationSearch: country.toLowerCase(),
        })
        .where(eq(atsJobs.id, job.id))

      updated++
      if (updated % 1000 === 0) {
        console.log(`  Normalized ${updated}...`)
      }
    }
  }

  console.log(`\n✓ Complete`)
  console.log(`  Normalized: ${updated}`)
  console.log(`  Remote: ${remote}`)
  console.log(`  Unknown (will not delete): ${unknown}`)

  // Show distribution
  const distribution = await db.select({ location: atsJobs.location }).from(atsJobs)
  const counts = distribution.reduce(
    (acc, job) => {
      acc[job.location] = (acc[job.location] || 0) + 1
      return acc
    },
    {} as Record<string, number>,
  )

  console.log(`\n=== Distribution ===`)
  Object.entries(counts)
    .sort(([, a], [, b]) => b - a)
    .forEach(([location, count]) => {
      console.log(`  ${location}: ${count}`)
    })
}

main().catch(console.error)
