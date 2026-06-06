import { AgentRunResult } from './flight-watcher.js'
import { RunnerContext } from './index.js'
import { log } from '../../lib/logger.js'

interface RealEstateConfig {
  listingType?: string
  city?: string
  propertyType?: string
  minPrice?: number | string
  maxPrice?: number | string
  minRent?: number | string   // backwards compat
  maxRent?: number | string   // backwards compat
  bedrooms?: string
  bathrooms?: string
  petsAllowed?: boolean
}

interface SerpOrganicResult {
  title?: string
  link?: string
  snippet?: string
}

interface SerpResponse {
  organic_results?: SerpOrganicResult[]
  error?: string
}

// ── Domain lists per listing type ────────────────────────────────────────────

const RENT_DOMAINS = [
  'zillow.com', 'redfin.com', 'apartments.com', 'rentals.com',
  'trulia.com', 'realtor.com', 'hotpads.com', 'rent.com',
  'padmapper.com', 'zumper.com',
]

const BUY_DOMAINS = [
  'zillow.com', 'redfin.com', 'realtor.com', 'trulia.com',
  'homes.com', 'movoto.com', 'homesnap.com', 'estately.com',
]

const LEASE_DOMAINS = [
  'zillow.com', 'redfin.com', 'realtor.com', 'trulia.com',
  'loopnet.com', 'crexi.com', 'commercialcafe.com',
]

function domainsForType(t: string): string[] {
  if (t === 'Buy') return BUY_DOMAINS
  if (t === 'Lease') return LEASE_DOMAINS
  return RENT_DOMAINS
}

// ── Individual listing detection (per site) ──────────────────────────────────
// Blocks category/search pages — user wants one specific property, not a list.

function isIndividualListing(link: string): boolean {
  try {
    const { hostname, pathname } = new URL(link)
    const host = hostname.toLowerCase()
    const path = pathname.toLowerCase()

    if (host.includes('zillow.com')) {
      // Individual listings always contain /homedetails/ or end with _zpid
      return path.includes('/homedetails/') || link.toLowerCase().includes('_zpid')
    }
    if (host.includes('redfin.com')) {
      // Individual: path ends with /home/NNNNN
      return /\/home\/\d+\/?$/.test(path)
    }
    if (host.includes('apartments.com')) {
      // Category/filter pages end with slugs like "2-bedrooms", "under-1500", "pet-friendly"
      // (all contain hyphens). Individual listing IDs are compact alphanumeric with no hyphens,
      // e.g. "6k1hyx5", "zt73rdb", "123456".
      const segs = path.split('/').filter(Boolean)
      if (segs.length < 2) return false
      const lastSeg = segs[segs.length - 1]
      return /^[a-z0-9]{4,12}$/.test(lastSeg) // alphanumeric, no hyphens = listing ID
    }
    if (host.includes('realtor.com')) {
      return path.includes('/realestateandhomes-detail/')
    }
    if (host.includes('trulia.com')) {
      // Individual pages are under /p/
      return path.includes('/p/')
    }
    if (host.includes('zumper.com')) {
      return path.includes('/renter/p')
    }
    if (host.includes('hotpads.com')) {
      // Individual listings end with a long numeric ID
      return /\/\d{5,}\/?$/.test(path)
    }
    if (host.includes('rentals.com')) {
      // /listings/city/complex/id needs at least 3 segments
      return path.split('/').filter(Boolean).length >= 3
    }
    if (host.includes('loopnet.com') || host.includes('crexi.com')) {
      // Commercial: individual listings have a numeric id in the path
      return /\/\d{4,}/.test(path)
    }
    // Unknown domain — pass through
    return true
  } catch {
    return true
  }
}

// ── Listing type text validation ─────────────────────────────────────────────
// Catches cases where URL signals miss cross-type contamination
// (e.g. Redfin for-sale individual page has no 'for-sale' in the URL).
//
// Strategy: use DEFINITIVE signals only. Any unambiguous sale phrase in a Rent
// result is an immediate reject — we don't try to "balance" signals because a
// sale listing mentioning HOA fees ("/mo") would otherwise pass the rent filter.

const DEFINITIVE_SALE_SIGNALS = [
  'for sale', 'sale price', 'listing price', 'list price',
  'listed at', 'sold for', 'sale pending', 'price reduced',
  'just listed', 'new listing',
]

const DEFINITIVE_RENT_SIGNALS = ['for rent', 'for lease']

function matchesListingTypeText(title: string, snippet: string, listingType: string): boolean {
  const text = `${title} ${snippet}`.toLowerCase()

  if (listingType === 'Rent') {
    // Hard reject: ANY definitive sale phrase disqualifies — HOA "/mo" cannot rescue it
    if (DEFINITIVE_SALE_SIGNALS.some(s => text.includes(s))) return false
    return true
  }

  if (listingType === 'Buy') {
    // Hard reject: any explicit rent/lease phrase disqualifies
    if (DEFINITIVE_RENT_SIGNALS.some(s => text.includes(s))) return false
    // Also reject if text shows rental pricing (/mo, per month) with no sale context
    const hasMonthlyPrice = text.includes('/mo') || text.includes('per month')
    const hasSaleContext  = DEFINITIVE_SALE_SIGNALS.some(s => text.includes(s))
    if (hasMonthlyPrice && !hasSaleContext) return false
    return true
  }

  if (listingType === 'Lease') {
    // Hard reject on definitive sale signals with no lease context
    const hasSale  = DEFINITIVE_SALE_SIGNALS.some(s => text.includes(s))
    const hasLease = text.includes('for lease') || text.includes('lease')
    if (hasSale && !hasLease) return false
    return true
  }

  return true
}

// ── URL-level listing type enforcement ───────────────────────────────────────
// Blocks pages where the URL path itself contradicts the requested listing type.

// Path fragments that definitively mean FOR-SALE
const SALE_URL_SIGNALS = [
  'for_sale', 'for-sale', 'homes-for-sale', 'houses-for-sale',
  'property-for-sale', '/sold/', 'forsale', '/buy/',
]

// Path fragments that definitively mean FOR-RENT (used to block Buy results)
const RENT_URL_SIGNALS = [
  'for_rent', 'for-rent', 'homes-for-rent', 'houses-for-rent', 'forrent',
]

// ── Article / report filter ───────────────────────────────────────────────────

const NON_LISTING_PATHS = [
  '/blog/', '/news/', '/research/', '/report/', '/reports/',
  '/market/', '/trends/', '/insights/', '/press/', '/about/',
  '/learn/', '/guide/', '/guides/', '/advice/', '/resources/',
  '/help/', '/faq/', '/glossary/', '/tag/', '/category/',
  '/rental-market/', '/rent-report/', '/rent-trends/', '/housing-market/',
]

const ARTICLE_TITLE_RE = [
  /\breport\b/i, /\bdata[:\s]/i, /\btrends?\b/i, /\bmarket\b/i,
  /\binsights?\b/i, /\bforecast\b/i, /\bindex\b/i, /\bguide\b/i,
  /\bhow\s+to\b/i, /\btips?\b/i, /\d{4}\s+rental/i,
  /rental\s+market/i, /rent\s+prices/i, /average\s+rent/i,
  /housing\s+market/i, /home\s+prices/i, /real\s+estate\s+market/i,
]

// ── Master URL validity check ─────────────────────────────────────────────────

function isValidResult(link: string, title: string, listingType: string): boolean {
  const url = link.toLowerCase()

  // 1. Article / report — drop for all types
  if (NON_LISTING_PATHS.some(p => url.includes(p))) return false
  if (ARTICLE_TITLE_RE.some(r => r.test(title))) return false

  // 2. Must be an individual property page, not a search/category page
  if (!isIndividualListing(link)) return false

  // 3. URL-level listing type enforcement
  if (listingType === 'Rent' || listingType === 'Lease') {
    if (SALE_URL_SIGNALS.some(s => url.includes(s))) return false
  }
  if (listingType === 'Buy') {
    if (RENT_URL_SIGNALS.some(s => url.includes(s))) return false
    // Rental-only domains have no for-sale inventory
    if (['apartments.com', 'rentals.com', 'zumper.com', 'padmapper.com']
      .some(d => url.includes(d))) return false
  }

  return true
}

// ── Property type filter ──────────────────────────────────────────────────────

const TYPE_SIGNALS: Record<string, string[]> = {
  House:     ['house', 'home', 'single family', 'single-family', 'sfh'],
  Apartment: ['apartment', 'apt', 'flat'],
  Condo:     ['condo', 'condominium'],
  Townhouse: ['townhouse', 'townhome', 'town house'],
  Studio:    ['studio'],
}

const TYPE_EXCLUSIONS: Record<string, string[]> = {
  House:     ['apartment', 'apartments', 'condo', 'condos', 'studio'],
  Apartment: ['house', 'houses', 'single family', 'townhouse'],
  Condo:     ['house', 'houses', 'single family'],
  Townhouse: ['apartment', 'apartments', 'studio'],
  Studio:    ['house', 'houses', 'single family', 'townhouse'],
}

function matchesPropertyType(title: string, snippet: string, propType?: string): boolean {
  if (!propType || propType === 'Any') return true
  const text = `${title} ${snippet}`.toLowerCase()
  const exclusions = TYPE_EXCLUSIONS[propType] ?? []
  if (!exclusions.some(t => text.includes(t))) return true
  return (TYPE_SIGNALS[propType] ?? []).some(t => text.includes(t))
}

// ── Query builders ────────────────────────────────────────────────────────────

const LISTING_PHRASE: Record<string, string> = {
  Rent:  '"for rent"',
  Buy:   '"for sale"',
  Lease: '"for lease"',
}

const LISTING_NEGATIVES: Record<string, string[]> = {
  Rent:  ['-"for sale"', '-"just sold"', '-sold'],
  Buy:   ['-"for rent"', '-rental', '-"per month"'],
  Lease: ['-"for sale"', '-sold'],
}

const PROP_TYPE_TERM: Record<string, string> = {
  House: 'house', Apartment: 'apartment', Condo: 'condo',
  Townhouse: 'townhouse', Studio: 'studio', Land: 'land',
  Commercial: 'commercial property',
}

function buildQuery(cfg: RealEstateConfig): string {
  const lt = cfg.listingType ?? 'Rent'
  const parts: string[] = []

  if (cfg.bedrooms && cfg.bedrooms !== 'Any' &&
      cfg.propertyType !== 'Land' && cfg.propertyType !== 'Commercial') {
    if (cfg.bedrooms === 'Studio') parts.push('studio')
    else if (cfg.bedrooms === '4+') parts.push('4+ bedroom')
    else parts.push(`${cfg.bedrooms} bedroom`)
  }

  parts.push(
    cfg.propertyType && cfg.propertyType !== 'Any'
      ? (PROP_TYPE_TERM[cfg.propertyType] ?? 'home')
      : 'home'
  )

  // Exact phrase — key fix that prevents cross-type matches
  parts.push(LISTING_PHRASE[lt] ?? '"for rent"')

  if (cfg.city) parts.push(`"${cfg.city}"`)

  // Explicit negatives for the other listing types
  parts.push(...(LISTING_NEGATIVES[lt] ?? []))

  // Property type exclusion terms
  const excl = cfg.propertyType ? TYPE_EXCLUSIONS[cfg.propertyType] : null
  if (excl?.length) excl.slice(0, 2).forEach(e => parts.push(`-${e}`))

  const minP = cfg.minPrice ?? cfg.minRent
  const maxP = cfg.maxPrice ?? cfg.maxRent
  if (minP && maxP) parts.push(`$${minP}-$${maxP}`)
  else if (maxP) parts.push(`under $${maxP}`)
  else if (minP) parts.push(`from $${minP}`)

  if (cfg.petsAllowed && lt === 'Rent') parts.push('pet friendly')

  return parts.join(' ')
}

// Site queries use path-specific prefixes where possible to target
// individual listing pages at the query level (not just post-filter).
function buildSiteQuery(baseQuery: string, lt: string): string {
  if (lt === 'Buy') {
    return `${baseQuery} (site:zillow.com/homedetails OR site:redfin.com OR site:realtor.com/realestateandhomes-detail OR site:trulia.com/p OR site:homes.com OR site:movoto.com)`
  }
  if (lt === 'Lease') {
    return `${baseQuery} (site:zillow.com/homedetails OR site:redfin.com OR site:realtor.com/realestateandhomes-detail OR site:trulia.com/p OR site:loopnet.com OR site:crexi.com)`
  }
  // Rent
  return `${baseQuery} (site:zillow.com/homedetails OR site:redfin.com OR site:apartments.com OR site:realtor.com/realestateandhomes-detail OR site:trulia.com/p OR site:zumper.com/renter OR site:hotpads.com)`
}

// ── Price extraction ──────────────────────────────────────────────────────────

function extractRentPrice(text: string): number | null {
  // $1,234/mo  $1,234 per month
  const m = text.match(/\$[\d,]+(?:\.\d+)?(?:\s*\/\s*mo|\s*per\s+month|\s*\/month)/i)
  if (m) return Number(m[0].replace(/[^0-9]/g, ''))
  // Fallback: bare $X,XXX — use negative lookahead to reject the thousand-portion
  // of larger numbers like $1,200,000 (which has \b after "200" but isn't a rent price).
  const fb = text.match(/\$(\d{1,2},\d{3})(?!,\d)\b/)
  if (fb) {
    const n = Number(fb[1].replace(',', ''))
    if (n >= 400 && n <= 20_000) return n
  }
  return null
}

function extractSalePrice(text: string): number | null {
  const mM = text.match(/\$([\d.]+)\s*[Mm]\b/)
  if (mM) return Math.round(parseFloat(mM[1]) * 1_000_000)
  const mK = text.match(/\$([\d,]+)\s*[Kk]\b/)
  if (mK) return Math.round(Number(mK[1].replace(',', '')) * 1_000)
  // $450,000 or $1,200,000 — must be 6+ digit number
  const m = text.match(/\$([\d,]{6,})\b/)
  if (m) {
    const n = Number(m[1].replace(/,/g, ''))
    if (n >= 50_000) return n
  }
  return null
}

function extractPrice(text: string, lt: string): number | null {
  return lt === 'Buy' ? extractSalePrice(text) : extractRentPrice(text)
}

function formatPrice(price: number, lt: string): string {
  if (lt === 'Buy') {
    if (price >= 1_000_000) return `$${(price / 1_000_000).toFixed(1)}M`
    if (price >= 1_000) return `$${Math.round(price / 1_000)}k`
    return `$${price.toLocaleString()}`
  }
  return `$${price.toLocaleString()}/mo`
}

function extractBeds(text: string): number | null {
  const m = text.match(/(\d+)\s*(?:bed(?:room)?s?|br\b)/i)
  return m ? Number(m[1]) : null
}

function extractBaths(text: string): number | null {
  const m = text.match(/([\d.]+)\s*(?:bath(?:room)?s?|ba\b)/i)
  return m ? Number(m[1]) : null
}

function bedsLabel(n: number): string {
  return n === 0 ? 'Studio' : `${n}BR`
}

function sourceLabel(link: string, lt: string): string {
  const match = domainsForType(lt).find(d => link.includes(d))
  if (!match) return 'Web'
  return match.replace('.com', '').replace(/^\w/, c => c.toUpperCase())
}

// ── SerpAPI call ──────────────────────────────────────────────────────────────

async function searchSerpApi(
  query: string,
  apiKey: string,
  lt: string,
): Promise<SerpOrganicResult[]> {
  const params = new URLSearchParams({
    engine: 'google',
    q: query,
    api_key: apiKey,
    num: '20',
    hl: 'en',
    gl: 'us',
    lr: 'lang_en',   // English pages only
  })

  const res = await fetch(`https://serpapi.com/search.json?${params}`)
  if (!res.ok) {
    log.warn('real-estate', 'serpapi failed', { status: res.status, query })
    return []
  }

  const data = await res.json() as SerpResponse
  if (data.error) {
    log.warn('real-estate', 'serpapi error', { error: data.error })
    return []
  }

  const domains = domainsForType(lt)
  return (data.organic_results ?? []).filter(r =>
    r.link &&
    domains.some(d => r.link!.includes(d)) &&
    isValidResult(r.link, r.title ?? '', lt)
  )
}

// ── Main runner ───────────────────────────────────────────────────────────────

export async function runRentalListingMonitor(
  config: Record<string, unknown>,
  ctx: RunnerContext,
): Promise<AgentRunResult[]> {
  const cfg = config as RealEstateConfig
  const city = cfg.city ?? 'Unknown'
  const lt = cfg.listingType ?? 'Rent'

  const apiKey = process.env.SERPAPI_KEY
  if (!apiKey) throw new Error('SERPAPI_KEY is not set')

  log.info('real-estate', 'starting', { city, listingType: lt })

  const generalQuery = buildQuery(cfg)
  const siteQuery    = buildSiteQuery(generalQuery, lt)

  const [generalResults, siteResults] = await Promise.all([
    searchSerpApi(generalQuery, apiKey, lt),
    searchSerpApi(siteQuery, apiKey, lt),
  ])

  // Site-targeted results first (higher precision), then general
  const allResults = [...siteResults, ...generalResults]
  log.info('real-estate', 'fetched', { general: generalResults.length, site: siteResults.length })

  const results: AgentRunResult[] = []
  const seen = new Set<string>()
  const minP = cfg.minPrice ?? cfg.minRent
  const maxP = cfg.maxPrice ?? cfg.maxRent

  for (const r of allResults) {
    if (!r.link) continue

    // Dedup by URL (strip query params)
    const urlKey = r.link.split('?')[0]
    if (ctx.seenKeys.has(urlKey) || seen.has(urlKey)) continue
    seen.add(urlKey)

    // Title/snippet must confirm the requested listing type
    if (!matchesListingTypeText(r.title ?? '', r.snippet ?? '', lt)) continue

    // Title/snippet must not contradict the requested property type
    if (!matchesPropertyType(r.title ?? '', r.snippet ?? '', cfg.propertyType)) continue

    const text  = `${r.title ?? ''} ${r.snippet ?? ''}`
    const price = extractPrice(text, lt)
    const beds  = extractBeds(text)
    const baths = extractBaths(text)

    // Price range filter
    if (price !== null) {
      const min = minP ? Number(minP) : null
      const max = maxP ? Number(maxP) : null
      if (min && price < min) continue
      if (max && price > max) continue
    }

    // Beds filter
    if (beds !== null && cfg.bedrooms && cfg.bedrooms !== 'Any') {
      const want  = cfg.bedrooms === 'Studio' ? 0 : cfg.bedrooms === '4+' ? 4 : Number(cfg.bedrooms)
      const isMin = cfg.bedrooms === '4+'
      if (!isMin && beds !== want) continue
      if (isMin && beds < want) continue
    }

    const bedsText = beds !== null ? bedsLabel(beds) : ''
    const bathsText = baths ? `${baths}ba` : ''
    const spec = [bedsText, bathsText].filter(Boolean).join(' · ')

    const cleanTitle = (r.title ?? '')
      .replace(/\s*[-|·]\s*(Zillow|Redfin|Apartments\.com|Realtor\.com|Trulia|Rentals\.com|HotPads|Rent\.com|Movoto|Homes\.com|LoopNet|Crexi).*/i, '')
      .trim() || `${cfg.propertyType ?? 'Home'} ${lt === 'Buy' ? 'for sale' : lt === 'Lease' ? 'for lease' : 'for rent'} — ${city}`

    const titleHasBeds = /\d\s*(br|bed)/i.test(cleanTitle)
    const displayTitle = spec && !titleHasBeds ? `${cleanTitle} (${spec})` : cleanTitle

    results.push({
      title: displayTitle,
      value: price ? formatPrice(price, lt) : undefined,
      url: r.link,
      metadata: {
        agentType:    'rental-listing-monitor',
        listingType:  lt,
        source:       sourceLabel(r.link, lt),
        city,
        price:        price ?? undefined,
        bedrooms:     beds ?? undefined,
        bathrooms:    baths ?? undefined,
        propertyType: cfg.propertyType,
        snippet:      r.snippet,
      },
    })

    if (results.length >= 15) break
  }

  log.info('real-estate', 'run complete', { found: results.length, listingType: lt })
  return results
}
