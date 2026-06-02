import { AgentRunResult } from './flight-watcher'
import { RunnerContext } from './index'
import { log } from '../../lib/logger'

interface RentalConfig {
  city?: string
  propertyType?: string
  minRent?: number | string
  maxRent?: number | string
  bedrooms?: string
  bathrooms?: string
  petsAllowed?: boolean
}

interface SerpOrganicResult {
  title?: string
  link?: string
  snippet?: string
  displayed_link?: string
  source?: string
}

interface SerpResponse {
  organic_results?: SerpOrganicResult[]
  error?: string
}

// Known rental listing domains to filter/prioritise
const RENTAL_DOMAINS = [
  'zillow.com',
  'redfin.com',
  'apartments.com',
  'rentals.com',
  'trulia.com',
  'realtor.com',
  'hotpads.com',
  'rent.com',
  'padmapper.com',
  'zumper.com',
  'forrent.com',
  'abodo.com',
]

function sourceLabel(link: string): string {
  const match = RENTAL_DOMAINS.find(d => link.includes(d))
  if (!match) return 'Web'
  // Capitalise first letter, strip .com suffix for display
  return match.replace('.com', '').replace(/^\w/, c => c.toUpperCase())
}

// Extract monthly price from a snippet or title string
function extractPrice(text: string): number | null {
  // Matches $1,234/mo  $1234/mo  $1,234 per month  $1,234 a month
  const m = text.match(/\$[\d,]+(?:\.\d+)?(?:\s*\/\s*mo|\s*per\s+month|\s*a\s+month|\s*\/month)/i)
  if (!m) {
    // Fallback: look for standalone "$X,XXX" where X >= 500 (likely a rent, not a fee)
    const fb = text.match(/\$(\d{1,2},?\d{3})\b/)
    if (fb) {
      const n = Number(fb[1].replace(',', ''))
      if (n >= 400 && n <= 20000) return n
    }
    return null
  }
  return Number(m[0].replace(/[^0-9]/g, ''))
}

// Extract bedroom count from text
function extractBeds(text: string): number | null {
  const m = text.match(/(\d+)\s*(?:bed(?:room)?s?|br\b)/i)
  return m ? Number(m[1]) : null
}

// Extract bath count from text
function extractBaths(text: string): number | null {
  const m = text.match(/([\d.]+)\s*(?:bath(?:room)?s?|ba\b)/i)
  return m ? Number(m[1]) : null
}

function bedsLabel(n: number): string {
  return n === 0 ? 'Studio' : `${n}BR`
}

// Terms that signal each property type in a result title/snippet
const TYPE_SIGNALS: Record<string, string[]> = {
  House:     ['house', 'home', 'single family', 'single-family'],
  Apartment: ['apartment', 'apt', 'flat', 'unit'],
  Condo:     ['condo', 'condominium'],
  Townhouse: ['townhouse', 'townhome', 'town house', 'town home'],
  Studio:    ['studio'],
}

// Terms that contradict the requested property type — used for query exclusions and result filtering
const TYPE_EXCLUSIONS: Record<string, string[]> = {
  House:     ['apartment', 'apartments', 'condo', 'condos', 'studio'],
  Apartment: ['house', 'houses', 'single family', 'townhouse', 'townhome'],
  Condo:     ['house', 'houses', 'single family', 'townhouse'],
  Townhouse: ['apartment', 'apartments', 'condo', 'studio'],
  Studio:    ['house', 'houses', 'single family', 'townhouse'],
}

// Returns true if the result title/snippet is compatible with the requested property type
function matchesPropertyType(title: string, snippet: string, propertyType: string | undefined): boolean {
  if (!propertyType || propertyType === 'Any') return true
  const text = `${title} ${snippet}`.toLowerCase()
  const exclusions = TYPE_EXCLUSIONS[propertyType] ?? []
  // Reject if any exclusion term appears AND no signal for the wanted type appears
  const hasExclusion = exclusions.some(t => text.includes(t))
  if (!hasExclusion) return true
  const signals = TYPE_SIGNALS[propertyType] ?? []
  return signals.some(t => text.includes(t))
}

// Build the Google search query from config
function buildQuery(cfg: RentalConfig): string {
  const parts: string[] = []

  // Beds
  if (cfg.bedrooms && cfg.bedrooms !== 'Any') {
    if (cfg.bedrooms === 'Studio') parts.push('studio')
    else if (cfg.bedrooms === '4+') parts.push('4+ bedroom')
    else parts.push(`${cfg.bedrooms} bedroom`)
  }

  // Property type — use specific term or generic "homes"
  if (cfg.propertyType && cfg.propertyType !== 'Any') {
    const typeQuery: Record<string, string> = {
      House: 'house',
      Apartment: 'apartment',
      Condo: 'condo',
      Townhouse: 'townhouse',
      Studio: 'studio apartment',
    }
    parts.push(typeQuery[cfg.propertyType] ?? 'home')
  } else {
    parts.push('homes')
  }

  parts.push('for rent')

  // City
  if (cfg.city) parts.push(`"${cfg.city}"`)

  // Negative keywords: exclude contradicting property types from results
  const exclusions = cfg.propertyType ? TYPE_EXCLUSIONS[cfg.propertyType] : null
  if (exclusions?.length) {
    // Add the first two as -term exclusions (Google supports this)
    exclusions.slice(0, 2).forEach(e => parts.push(`-${e}`))
  }

  // Price range
  if (cfg.minRent && cfg.maxRent) parts.push(`$${cfg.minRent}-$${cfg.maxRent}`)
  else if (cfg.maxRent) parts.push(`under $${cfg.maxRent}`)
  else if (cfg.minRent) parts.push(`from $${cfg.minRent}`)

  if (cfg.petsAllowed) parts.push('pet friendly')

  return parts.join(' ')
}

// One SerpAPI call — returns organic results filtered to rental domains
async function searchSerpApi(query: string, apiKey: string): Promise<SerpOrganicResult[]> {
  const params = new URLSearchParams({
    engine: 'google',
    q: query,
    api_key: apiKey,
    num: '20',
    hl: 'en',
    gl: 'us',
  })

  const res = await fetch(`https://serpapi.com/search.json?${params}`)
  if (!res.ok) {
    log.warn('rental-monitor', 'serpapi request failed', { status: res.status })
    return []
  }

  const data = await res.json() as SerpResponse
  if (data.error) {
    log.warn('rental-monitor', 'serpapi error', { error: data.error })
    return []
  }

  // Keep only results that come from known rental sites
  return (data.organic_results ?? []).filter(r =>
    r.link && RENTAL_DOMAINS.some(d => r.link!.includes(d))
  )
}

// ── Main runner ───────────────────────────────────────────────────────────────

export async function runRentalListingMonitor(
  config: Record<string, unknown>,
  ctx: RunnerContext,
): Promise<AgentRunResult[]> {
  const cfg = config as RentalConfig
  const city = cfg.city ?? 'Unknown'

  const apiKey = process.env.SERPAPI_KEY
  if (!apiKey) throw new Error('SERPAPI_KEY is not set')

  log.info('rental-monitor', 'starting', { city, config: cfg })

  // Run two parallel queries: one general, one site-targeted to top rental portals
  const generalQuery = buildQuery(cfg)
  const siteQuery = `${generalQuery} site:zillow.com OR site:redfin.com OR site:apartments.com OR site:rentals.com OR site:trulia.com OR site:realtor.com`

  const [generalResults, siteResults] = await Promise.all([
    searchSerpApi(generalQuery, apiKey),
    searchSerpApi(siteQuery, apiKey),
  ])

  const allResults = [...siteResults, ...generalResults]
  log.info('rental-monitor', 'serpapi results', {
    general: generalResults.length,
    site: siteResults.length,
    total: allResults.length,
  })

  if (allResults.length === 0) {
    log.info('rental-monitor', 'no listings found in search results')
    return []
  }

  const results: AgentRunResult[] = []
  const seen = new Set<string>()

  for (const r of allResults) {
    if (!r.link) continue

    // Deduplicate by URL
    const urlKey = r.link.split('?')[0] // strip query params
    if (ctx.seenKeys.has(urlKey) || seen.has(urlKey)) continue
    seen.add(urlKey)

    // Drop results that contradict the requested property type
    if (!matchesPropertyType(r.title ?? '', r.snippet ?? '', cfg.propertyType)) continue

    const text = `${r.title ?? ''} ${r.snippet ?? ''}`
    const price = extractPrice(text)
    const beds = extractBeds(text)
    const baths = extractBaths(text)

    // Apply price filter: skip if price is outside configured range
    const minRent = cfg.minRent ? Number(cfg.minRent) : null
    const maxRent = cfg.maxRent ? Number(cfg.maxRent) : null
    if (price !== null) {
      if (minRent && price < minRent) continue
      if (maxRent && price > maxRent) continue
    }

    // Apply beds filter
    if (beds !== null && cfg.bedrooms && cfg.bedrooms !== 'Any') {
      const wantedBeds = cfg.bedrooms === 'Studio' ? 0 : cfg.bedrooms === '4+' ? 4 : Number(cfg.bedrooms)
      const isMin = cfg.bedrooms === '4+'
      if (!isMin && beds !== wantedBeds) continue
      if (isMin && beds < wantedBeds) continue
    }

    const source = sourceLabel(r.link)
    const bedsText = beds !== null ? bedsLabel(beds) : ''
    const bathsText = baths !== null ? `${baths}ba` : ''
    const specParts = [bedsText, bathsText].filter(Boolean)
    const spec = specParts.length ? ` (${specParts.join(' · ')})` : ''
    const priceStr = price ? `$${price.toLocaleString()}/mo` : null

    const title = r.title
      ? r.title.replace(/\s*[-|·]\s*(Zillow|Redfin|Apartments\.com|Realtor\.com|Trulia|Rentals\.com|HotPads|Rent\.com).*/i, '').trim()
      : `${spec} listing — ${city}`.trim()

    results.push({
      title: `${title}${spec && !title.toLowerCase().includes('br') && !title.toLowerCase().includes('bed') ? spec : ''}`,
      value: priceStr ?? undefined,
      url: r.link,
      metadata: {
        agentType: 'rental-listing-monitor',
        source,
        city,
        price: price ?? undefined,
        bedrooms: beds ?? undefined,
        bathrooms: baths ?? undefined,
        snippet: r.snippet,
        propertyType: cfg.propertyType,
      },
    })

    if (results.length >= 15) break
  }

  log.info('rental-monitor', 'run complete', { found: results.length })
  return results
}
