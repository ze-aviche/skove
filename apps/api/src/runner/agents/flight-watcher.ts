const AIRLINES = ['Southwest', 'Delta', 'American', 'United', 'Spirit']

function randomInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function daysFromNow(n: number) {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return d.toISOString().split('T')[0]
}

interface FlightWatcherConfig {
  origin?: string
  destination?: string
  maxPrice?: number | string
  departAfter?: string
  returnBefore?: string
}

export interface AgentRunResult {
  title: string
  value?: string
  url?: string
  metadata?: Record<string, unknown>
}

export async function runFlightWatcher(config: Record<string, unknown>): Promise<AgentRunResult[]> {
  const c = config as FlightWatcherConfig
  const origin = String(c.origin || 'DAL').toUpperCase()
  const destination = String(c.destination || 'JFK').toUpperCase()
  const maxPrice = Number(c.maxPrice) || 300

  const results: AgentRunResult[] = []
  const numFlights = randomInt(1, 2)

  for (let i = 0; i < numFlights; i++) {
    const price = randomInt(Math.floor(maxPrice * 0.6), maxPrice)
    const airline = AIRLINES[randomInt(0, AIRLINES.length - 1)]
    const departDate = daysFromNow(randomInt(14, 45))

    results.push({
      title: `${airline} · ${origin} → ${destination}`,
      value: `$${price}`,
      url: `https://www.google.com/travel/flights?q=flights+from+${origin}+to+${destination}`,
      metadata: { airline, price, departDate, origin, destination, agentType: 'flight-watcher' },
    })
  }

  return results
}
