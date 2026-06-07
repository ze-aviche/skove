import { config } from 'dotenv'
config({ path: '.env.local' })

import { db } from './index.js'
import { atsJobs } from './schema.js'
import Anthropic from '@anthropic-ai/sdk'
import { writeFileSync } from 'fs'
import { resolve } from 'path'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const KNOWN_MAPPINGS: Record<string, string> = {
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

async function main() {
  console.log('Fetching all unique locations from database...\n')

  // Get all unique locations
  const allJobs = await db.select({ location: atsJobs.location }).from(atsJobs)
  const uniqueLocations = Array.from(new Set(allJobs.map((r) => r.location))).sort()

  console.log(`Found ${uniqueLocations.length} unique locations\n`)

  // Find unmapped locations (city-only, no comma, not remote)
  const unmapped = uniqueLocations.filter(
    (loc: string) =>
      !loc.includes(',') &&
      !loc.toLowerCase().includes('remote') &&
      !KNOWN_MAPPINGS[normalizeText(loc)],
  )

  if (unmapped.length === 0) {
    console.log('✓ All locations are already mapped!')
    return
  }

  console.log(`Found ${unmapped.length} unmapped locations. Asking Haiku for suggestions (batching)...\n`)

  const BATCH_SIZE = 100
  const allSuggestions: Record<string, string> = {}

  for (let i = 0; i < unmapped.length; i += BATCH_SIZE) {
    const batch = unmapped.slice(i, i + BATCH_SIZE)
    const batchNum = Math.floor(i / BATCH_SIZE) + 1
    const totalBatches = Math.ceil(unmapped.length / BATCH_SIZE)

    console.log(`Processing batch ${batchNum}/${totalBatches}...`)

    const prompt = `Given these location strings from job postings, suggest enriched versions that include city, state/province, and country. Return ONLY a JSON object with no additional text.

Locations to enrich:
${batch.map((loc, idx) => `${idx + 1}. "${loc}"`).join('\n')}

Return format:
{
  "location name": "enriched format, country",
  ...
}

Examples:
"Austin" → "austin, tx, us"
"London" → "london, uk"
"Bangalore" → "bangalore, india"
"Remote - US" → "remote"

IMPORTANT: Return ONLY the JSON object, no markdown, no code blocks, no explanations.`

    const response = await client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 2048,
      messages: [{ role: 'user', content: prompt }],
    })

    const responseText = response.content[0].type === 'text' ? response.content[0].text : ''

    // Strip markdown code fences if present
    let jsonText = responseText
    if (jsonText.includes('```')) {
      jsonText = jsonText.replace(/```json\n?/g, '').replace(/```\n?/g, '')
    }

    try {
      const batchSuggestions = JSON.parse(jsonText)
      Object.assign(allSuggestions, batchSuggestions)
    } catch (e) {
      console.error(`Failed to parse batch ${batchNum}:`, jsonText.slice(0, 200))
    }
  }

  const suggestions = allSuggestions

  console.log('=== HAIKU SUGGESTIONS ===\n')

  // Show suggestions and build the mapping
  const allMappings = { ...KNOWN_MAPPINGS }

  for (const location of unmapped) {
    const suggested = suggestions[location] || suggestions[location.toLowerCase()]
    if (suggested) {
      console.log(`  "${location}" → "${suggested}"`)
      allMappings[normalizeText(location)] = suggested
    } else {
      console.log(`  ⚠ "${location}" (no suggestion)`)
    }
  }

  console.log('\n=== UPDATED ENRICHMENT MAP ===\n')

  // Sort mappings and convert to JSON
  const sortedMappings = Object.fromEntries(
    Object.entries(allMappings).sort(([a], [b]) => a.localeCompare(b))
  )

  const mapContent = JSON.stringify(sortedMappings, null, 2)
  console.log(`Showing first 20 entries:`)
  const preview = Object.entries(sortedMappings).slice(0, 20)
  preview.forEach(([key, value]) => {
    console.log(`  "${key}" → "${value}"`)
  })
  console.log(`  ... and ${Object.keys(sortedMappings).length - 20} more`)

  // Write to file for review
  const outputFile = resolve('./enrichment-map.json')
  writeFileSync(outputFile, mapContent)
  console.log(`\n✓ Full map written to: ${outputFile}`)
  console.log(`✓ Total mappings: ${Object.keys(sortedMappings).length}`)
  console.log('✓ The apply script will automatically use this file')
  console.log('✓ Then run: pnpm --filter api db:enrich-locations-apply\n')
}

main().catch(console.error)
