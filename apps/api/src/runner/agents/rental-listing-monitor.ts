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

interface NormalisedListing {
  id: string
  title: string
  address: string
  price: number
  bedrooms?: number
  bathrooms?: number
  sqft?: number
  url: string
  source: string
  propertyType?: string
}

function formatPrice(price: number): string {
  return `$${price.toLocaleString()}/mo`
}

function bedsLabel(beds?: number | string): string {
  if (!beds) return ''
  const n = Number(beds)
  if (n === 0) return 'Studio'
  return `${n}BR`
}

// Map our UI property type to Zillow's home_type param
const ZILLOW_HOME_TYPE: Record<string, string> = {
  Apartment: 'Apartments',
  House: 'Houses',
  Condo: 'Condos_Co-ops',
  Townhouse: 'Townhomes',
  Studio: 'Apartments',
}

// Map our UI property type to Realtor.com prop_type param
const REALTOR_PROP_TYPE: Record<string, string> = {
  Apartment: 'apartment',
  House: 'single_family',
  Condo: 'condo',
  Townhouse: 'townhome',
  Studio: 'apartment',
}

// ── Source 1: Zillow via RapidAPI (zillow56) ─────────────────────────────────

async function fetchZillow(config: RentalConfig): Promise<NormalisedListing[]> {
  const key = process.env.RAPIDAPI_KEY
  if (!key) { log.warn('rental-monitor', 'RAPIDAPI_KEY not set — skipping Zillow'); return [] }

  const params = new URLSearchParams({
    location: config.city ?? '',
    status: 'forRent',
    isForRent: '1',
    sort: 'Newest',
  })

  const propType = config.propertyType && config.propertyType !== 'Any' ? ZILLOW_HOME_TYPE[config.propertyType] : null
  if (propType) params.set('home_type', propType)

  const beds = config.bedrooms && config.bedrooms !== 'Any' ? config.bedrooms : null
  if (beds === 'Studio') params.set('bedrooms', '0')
  else if (beds && beds !== '4+') params.set('bedrooms', beds)
  else if (beds === '4+') params.set('bedrooms', '4')

  if (config.minRent) params.set('minPrice', String(config.minRent))
  if (config.maxRent) params.set('maxPrice', String(config.maxRent))

  try {
    const res = await fetch(`https://zillow56.p.rapidapi.com/search?${params}`, {
      headers: {
        'X-RapidAPI-Key': key,
        'X-RapidAPI-Host': 'zillow56.p.rapidapi.com',
      },
    })
    if (!res.ok) { log.warn('rental-monitor', 'zillow request failed', { status: res.status }); return [] }

    const data = await res.json() as {
      results?: Array<{
        zpid?: string | number
        price?: number
        bedrooms?: number
        bathrooms?: number
        livingArea?: number
        homeType?: string
        detailUrl?: string
        addressStreet?: string
        addressCity?: string
        addressState?: string
        address?: string
      }>
    }

    return (data.results ?? [])
      .filter(r => r.price && r.price > 0)
      .map(r => {
        const address = r.address ?? [r.addressStreet, r.addressCity, r.addressState].filter(Boolean).join(', ')
        const beds = r.bedrooms != null ? bedsLabel(r.bedrooms) : ''
        const baths = r.bathrooms ? ` · ${r.bathrooms}ba` : ''
        const sqft = r.livingArea ? ` · ${r.livingArea.toLocaleString()} sqft` : ''
        return {
          id: `zillow-${r.zpid ?? Math.random()}`,
          title: `${beds}${baths}${sqft} — ${address}`.replace(/^·\s*/, '').trim(),
          address,
          price: r.price!,
          bedrooms: r.bedrooms,
          bathrooms: r.bathrooms,
          sqft: r.livingArea,
          url: r.detailUrl ? `https://www.zillow.com${r.detailUrl}` : 'https://www.zillow.com',
          source: 'Zillow',
          propertyType: r.homeType,
        }
      })
  } catch (err) {
    log.warn('rental-monitor', 'zillow fetch error', { err: String(err) })
    return []
  }
}

// ── Source 2: Realtor.com via RapidAPI (us-real-estate) ──────────────────────

async function fetchRealtor(config: RentalConfig): Promise<NormalisedListing[]> {
  const key = process.env.RAPIDAPI_KEY
  if (!key) { log.warn('rental-monitor', 'RAPIDAPI_KEY not set — skipping Realtor.com'); return [] }

  // Split "City, ST" into city + state_code
  const parts = (config.city ?? '').split(',').map(s => s.trim())
  const city = parts[0] ?? ''
  const stateCode = parts[1] ?? ''
  if (!city) return []

  const params = new URLSearchParams({
    city,
    state_code: stateCode,
    limit: '20',
    offset: '0',
  })

  const propType = config.propertyType && config.propertyType !== 'Any' ? REALTOR_PROP_TYPE[config.propertyType] : null
  if (propType) params.set('prop_type', propType)

  const beds = config.bedrooms && config.bedrooms !== 'Any' ? config.bedrooms : null
  if (beds === 'Studio') params.set('beds_min', '0')
  else if (beds && beds !== '4+') params.set('beds_min', beds)
  else if (beds === '4+') params.set('beds_min', '4')

  const baths = config.bathrooms && config.bathrooms !== 'Any' ? config.bathrooms : null
  if (baths) params.set('baths_min', baths.replace('+', ''))

  if (config.minRent) params.set('price_min', String(config.minRent))
  if (config.maxRent) params.set('price_max', String(config.maxRent))

  try {
    const res = await fetch(`https://us-real-estate.p.rapidapi.com/for-rent?${params}`, {
      headers: {
        'X-RapidAPI-Key': key,
        'X-RapidAPI-Host': 'us-real-estate.p.rapidapi.com',
      },
    })
    if (!res.ok) { log.warn('rental-monitor', 'realtor request failed', { status: res.status }); return [] }

    const data = await res.json() as {
      data?: {
        home_search?: {
          results?: Array<{
            property_id?: string
            list_price?: number
            description?: {
              beds?: number
              baths?: number
              sqft?: number
              type?: string
            }
            location?: {
              address?: {
                line?: string
                city?: string
                state_code?: string
                postal_code?: string
              }
            }
            href?: string
          }>
        }
      }
    }

    const results = data?.data?.home_search?.results ?? []
    return results
      .filter(r => r.list_price && r.list_price > 0)
      .map(r => {
        const loc = r.location?.address
        const address = [loc?.line, loc?.city, loc?.state_code].filter(Boolean).join(', ')
        const beds = r.description?.beds != null ? bedsLabel(r.description.beds) : ''
        const baths = r.description?.baths ? ` · ${r.description.baths}ba` : ''
        const sqft = r.description?.sqft ? ` · ${r.description.sqft.toLocaleString()} sqft` : ''
        return {
          id: `realtor-${r.property_id ?? Math.random()}`,
          title: `${beds}${baths}${sqft} — ${address}`.replace(/^·\s*/, '').trim(),
          address,
          price: r.list_price!,
          bedrooms: r.description?.beds,
          bathrooms: r.description?.baths,
          sqft: r.description?.sqft,
          url: r.href ?? 'https://www.realtor.com',
          source: 'Realtor.com',
          propertyType: r.description?.type,
        }
      })
  } catch (err) {
    log.warn('rental-monitor', 'realtor fetch error', { err: String(err) })
    return []
  }
}

// ── Source 3: Rentals.com via RapidAPI ───────────────────────────────────────

async function fetchRentalscom(config: RentalConfig): Promise<NormalisedListing[]> {
  const key = process.env.RAPIDAPI_KEY
  if (!key) return []

  const params = new URLSearchParams({ location: config.city ?? '', limit: '20' })
  if (config.minRent) params.set('price_min', String(config.minRent))
  if (config.maxRent) params.set('price_max', String(config.maxRent))

  const beds = config.bedrooms && config.bedrooms !== 'Any' ? config.bedrooms : null
  if (beds === 'Studio') params.set('beds', '0')
  else if (beds && beds !== '4+') params.set('beds', beds)
  else if (beds === '4+') params.set('beds', '4')

  try {
    const res = await fetch(`https://rentals-com.p.rapidapi.com/properties/search?${params}`, {
      headers: {
        'X-RapidAPI-Key': key,
        'X-RapidAPI-Host': 'rentals-com.p.rapidapi.com',
      },
    })
    if (!res.ok) { log.warn('rental-monitor', 'rentals.com request failed', { status: res.status }); return [] }

    const data = await res.json() as {
      listings?: Array<{
        id?: string
        price?: number
        beds?: number
        baths?: number
        sqft?: number
        address?: string
        url?: string
        type?: string
      }>
    }

    return (data.listings ?? [])
      .filter(r => r.price && r.price > 0)
      .map(r => {
        const beds = r.beds != null ? bedsLabel(r.beds) : ''
        const baths = r.baths ? ` · ${r.baths}ba` : ''
        const sqft = r.sqft ? ` · ${r.sqft.toLocaleString()} sqft` : ''
        return {
          id: `rentals-${r.id ?? Math.random()}`,
          title: `${beds}${baths}${sqft} — ${r.address ?? ''}`.replace(/^·\s*/, '').trim(),
          address: r.address ?? '',
          price: r.price!,
          bedrooms: r.beds,
          bathrooms: r.baths,
          sqft: r.sqft,
          url: r.url ?? 'https://www.rentals.com',
          source: 'Rentals.com',
          propertyType: r.type,
        }
      })
  } catch (err) {
    log.warn('rental-monitor', 'rentals.com fetch error', { err: String(err) })
    return []
  }
}

// ── Main runner ───────────────────────────────────────────────────────────────

export async function runRentalListingMonitor(
  config: Record<string, unknown>,
  ctx: RunnerContext,
): Promise<AgentRunResult[]> {
  const cfg = config as RentalConfig
  const city = cfg.city ?? 'Unknown'

  log.info('rental-monitor', 'starting', { city, config: cfg })

  const [zillowListings, realtorListings, rentalsListings] = await Promise.all([
    fetchZillow(cfg),
    fetchRealtor(cfg),
    fetchRentalscom(cfg),
  ])

  const all = [...zillowListings, ...realtorListings, ...rentalsListings]
  log.info('rental-monitor', 'fetched listings', { zillow: zillowListings.length, realtor: realtorListings.length, rentals: rentalsListings.length })

  // Deduplicate by address + price to avoid cross-source duplication
  const seen = new Set<string>()
  const deduped = all.filter(l => {
    const key = `${l.address.toLowerCase().replace(/\s+/g, '')}-${l.price}`
    if (ctx.seenKeys.has(key) || seen.has(key)) return false
    seen.add(key)
    return true
  })

  if (deduped.length === 0) {
    log.info('rental-monitor', 'no new listings found')
    return []
  }

  // Apply pet filter (best-effort — not all sources expose this field)
  const filtered = cfg.petsAllowed
    ? deduped.filter(l => {
        // If source doesn't expose pets info we include the listing and let the user check
        return true
      })
    : deduped

  // Sort by price ascending
  filtered.sort((a, b) => a.price - b.price)

  return filtered.slice(0, 20).map(l => {
    const bedsText = l.bedrooms != null ? bedsLabel(l.bedrooms) : ''
    const bathsText = l.bathrooms ? `${l.bathrooms}ba` : ''
    const specParts = [bedsText, bathsText].filter(Boolean)
    const spec = specParts.length ? ` (${specParts.join(' · ')})` : ''

    return {
      title: `${formatPrice(l.price)}${spec} — ${l.address}`,
      value: formatPrice(l.price),
      url: l.url,
      metadata: {
        agentType: 'rental-listing-monitor',
        source: l.source,
        address: l.address,
        price: l.price,
        bedrooms: l.bedrooms,
        bathrooms: l.bathrooms,
        sqft: l.sqft,
        propertyType: l.propertyType,
        city,
      },
    }
  })
}
