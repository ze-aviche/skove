import 'dotenv/config'
import { db } from './index.js'
import { atsCompanies } from './schema.js'
import { eq } from 'drizzle-orm'

const providerFiles = ['lever', 'greenhouse', 'ashby']
const githubRawBase = 'https://raw.githubusercontent.com/kalil0321/ats-scrapers/main/ats-companies'

function parseCsv(text: string) {
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0)
  const rows: Array<{ name: string; slug: string; url: string }> = []
  for (const line of lines.slice(1)) {
    const cells = []
    let cur = ''
    let inQuote = false
    for (let i = 0; i < line.length; i += 1) {
      const char = line[i]
      if (char === '"') {
        inQuote = !inQuote
        continue
      }
      if (char === ',' && !inQuote) {
        cells.push(cur)
        cur = ''
        continue
      }
      cur += char
    }
    cells.push(cur)

    if (cells.length < 2) continue
    const name = cells[0].trim()
    const slug = (cells[1] ?? '').trim()
    const url = (cells[2] ?? '').trim()
    rows.push({ name, slug, url })
  }
  return rows
}

function inferSlug(provider: string, url: string) {
  if (!url) return ''
  const parsed = new URL(url)
  const parts = parsed.pathname.split('/').filter(Boolean)
  if (parts.length === 0) return ''
  return parts[parts.length - 1].toLowerCase()
}

async function fetchProviderCsv(provider: string) {
  const url = `${githubRawBase}/${provider}.csv`
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`Failed to load ${provider} CSV: ${res.status} ${res.statusText}`)
  }
  const text = await res.text()
  return parseCsv(text)
}

async function upsertCompany(provider: string, name: string, slug: string, url: string) {
  if (!name || !url) return
  const normalizedSlug = slug.trim().toLowerCase() || inferSlug(provider, url)
  if (!normalizedSlug) return

  const [existing] = await db.select({ id: atsCompanies.id }).from(atsCompanies).where(eq(atsCompanies.atsIdentifier, normalizedSlug))
  const row = {
    name,
    careersUrl: url,
    atsType: provider,
    atsIdentifier: normalizedSlug,
    isEnabled: true,
    updatedAt: new Date(),
  }

  if (existing) {
    await db.update(atsCompanies).set(row).where(eq(atsCompanies.atsIdentifier, normalizedSlug))
  } else {
    await db.insert(atsCompanies).values(row)
  }
}

export async function seedATSCompanies() {
  console.log('Seeding ATS company mappings from ats-scrapers...')
  for (const provider of providerFiles) {
    console.log(`Loading ${provider} CSV...`)
    const rows = await fetchProviderCsv(provider)
    console.log(`Loaded ${rows.length} rows for ${provider}`)
    let inserted = 0
    for (const row of rows) {
      await upsertCompany(provider, row.name, row.slug, row.url)
      inserted += 1
    }
    console.log(`Seeded ${inserted} ${provider} rows.`)
  }
  console.log('ATS company seeding complete.')
}

if (require.main === module) {
  seedATSCompanies().catch((error) => {
    console.error('Seed failed:', error)
    process.exit(1)
  })
}
