export interface AgentRunResult {
  title: string
  value?: string
  url?: string
  metadata?: Record<string, unknown>
}

interface FlightWatcherConfig {
  origin?: string
  destination?: string
  tripType?: string
  maxPrice?: number | string
  departAfter?: string
  returnBefore?: string
}

interface SerpFlightResult {
  flights: {
    departure_airport: { name: string; id: string; time: string }
    arrival_airport: { name: string; id: string; time: string }
    duration: number
    airline: string
    flight_number: string
  }[]
  total_duration: number
  price: number
  airline_logo?: string
}

interface SerpApiResponse {
  best_flights?: SerpFlightResult[]
  other_flights?: SerpFlightResult[]
  error?: string
}

function extractIata(value: string): string {
  const match = value.match(/\(([A-Z]{3})\)/i)
  if (match) return match[1].toUpperCase()
  return value.trim().toUpperCase().slice(0, 3)
}

function tomorrowIso(): string {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return d.toISOString().split('T')[0]
}

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${h}h ${m}m`
}

export async function runFlightWatcher(config: Record<string, unknown>, _ctx?: { userId: string }): Promise<AgentRunResult[]> {
  const c = config as FlightWatcherConfig
  const origin = extractIata(String(c.origin || 'DAL'))
  const destination = extractIata(String(c.destination || 'JFK'))
  const maxPrice = Number(c.maxPrice) || 300
  const departDate = c.departAfter || tomorrowIso()
  const isRoundTrip = c.tripType === 'Round trip'
  const returnDate = isRoundTrip ? (c.returnBefore || null) : null

  const apiKey = process.env.SERPAPI_KEY
  if (!apiKey) throw new Error('SERPAPI_KEY is not set')

  const params = new URLSearchParams({
    engine: 'google_flights',
    departure_id: origin,
    arrival_id: destination,
    outbound_date: departDate,
    currency: 'USD',
    hl: 'en',
    type: isRoundTrip ? '1' : '2',
    api_key: apiKey,
  })
  if (isRoundTrip && returnDate) params.set('return_date', returnDate)

  const res = await fetch(`https://serpapi.com/search.json?${params}`)
  if (!res.ok) throw new Error(`SerpApi error: ${res.status}`)

  const data = await res.json() as SerpApiResponse
  if (data.error) throw new Error(`SerpApi: ${data.error}`)

  const allFlights = [...(data.best_flights ?? []), ...(data.other_flights ?? [])]
  console.log(`[flight-watcher] ${allFlights.length} flights found, maxPrice=$${maxPrice}, cheapest=$${Math.min(...allFlights.map(f => f.price)) || 'n/a'}`)

  return allFlights
    .filter((f) => f.price <= maxPrice)
    .slice(0, 5)
    .map((f) => {
      const leg = f.flights[0]
      const airline = leg?.airline ?? 'Unknown airline'
      const departTime = leg?.departure_airport.time ?? departDate
      const duration = formatDuration(f.total_duration)

      return {
        title: `${airline} · ${origin} → ${destination}`,
        value: `$${f.price}`,
        url: isRoundTrip && returnDate
          ? `https://www.kayak.com/flights/${origin}-${destination}/${departDate}/${returnDate}`
          : `https://www.kayak.com/flights/${origin}-${destination}/${departDate}`,
        metadata: {
          airline,
          price: f.price,
          departTime,
          duration,
          flightNumber: leg?.flight_number,
          origin,
          destination,
          roundTrip: isRoundTrip,
          agentType: 'flight-watcher',
        },
      }
    })
}
