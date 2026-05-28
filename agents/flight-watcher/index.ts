import { defineAgent } from '@skove/sdk'

interface FlightWatcherConfig {
  origin: string       // e.g. "DAL"
  destination: string  // e.g. "JFK"
  maxPrice: number     // e.g. 300
  departAfter: string  // e.g. "2025-06-01"
  departBefore: string // e.g. "2025-06-30"
}

export default defineAgent<FlightWatcherConfig>({
  id: 'flight-watcher',
  name: 'Flight price watcher',
  description: 'Monitors a flight route and alerts you when the price drops below your limit.',
  icon: '✈️',
  category: 'travel',

  configSchema: {
    origin: {
      type: 'string',
      label: 'From (airport code)',
      placeholder: 'DAL',
      required: true,
    },
    destination: {
      type: 'string',
      label: 'To (airport code)',
      placeholder: 'JFK',
      required: true,
    },
    maxPrice: {
      type: 'number',
      label: 'Max price (USD)',
      placeholder: '300',
      required: true,
      min: 1,
    },
    departAfter: {
      type: 'string',
      label: 'Depart after',
      placeholder: '2025-06-01',
      required: true,
    },
    departBefore: {
      type: 'string',
      label: 'Depart before',
      placeholder: '2025-06-30',
      required: true,
    },
  },

  // Run every 2 hours
  schedule: '0 */2 * * *',

  async run(config, ctx) {
    ctx.log(`Checking flights ${config.origin} → ${config.destination}, max $${config.maxPrice}`)

    // TODO: integrate with a real flights API
    // Options: Google Flights (via SerpAPI), Amadeus, Skyscanner API
    // For now this is a stub that shows the structure

    const mockFlights = [
      {
        airline: 'Spirit Airlines',
        price: 241,
        date: '2025-06-14',
        url: `https://www.google.com/travel/flights?q=${config.origin}+to+${config.destination}`,
      },
    ]

    const deals = mockFlights.filter(f => f.price <= config.maxPrice)

    return deals.map(flight => ({
      title: `$${flight.price} — ${config.origin} → ${config.destination}, ${flight.date} (${flight.airline})`,
      value: `$${flight.price}`,
      url: flight.url,
      metadata: { airline: flight.airline, date: flight.date, price: flight.price },
    }))
  },
})
