import 'dotenv/config'
import { db } from './index'
import { agentDefinitions } from './schema'

const builtInAgents = [
  {
    id: 'flight-watcher',
    name: 'Flight price watcher',
    description: 'Monitors a route and alerts when price drops below your target.',
    configSchema: {
      origin: { type: 'airport', label: 'Origin airport or city', required: true, placeholder: 'Dallas (DAL)' },
      destination: { type: 'airport', label: 'Destination airport or city', required: true, placeholder: 'New York (JFK)' },
      tripType: { type: 'select', label: 'Trip type', required: true, options: ['One way', 'Round trip'] },
      maxPrice: { type: 'number', label: 'Max price ($)', required: true, placeholder: '300' },
      departAfter: { type: 'date', label: 'Depart after', placeholder: '' },
      returnBefore: { type: 'date', label: 'Return before', placeholder: '', showWhen: { field: 'tripType', value: 'Round trip' } },
    },
    schedule: '0 */2 * * *',
    authorId: null,
    isPublished: true,
  },
  {
    id: 'job-application-tracker',
    name: 'Job application tracker',
    description: 'Watches new job listings and manages applications for your target role.',
    configSchema: {
      jobTitle: { type: 'string', label: 'Job title', required: true, placeholder: 'Product Manager' },
      location: { type: 'string', label: 'Location', required: true, placeholder: 'Remote / Austin, TX' },
      minSalary: { type: 'number', label: 'Minimum salary ($)', required: false },
      keywords: { type: 'string', label: 'Keywords', required: false, placeholder: 'PM, product, roadmap' },
    },
    schedule: '0 */4 * * *',
    authorId: null,
    isPublished: true,
  },
  {
    id: 'rental-listing-monitor',
    name: 'Rental listing monitor',
    description: 'Tracks rental listings that match your budget and location preferences.',
    configSchema: {
      city: { type: 'string', label: 'City or neighborhood', required: true, placeholder: 'Allen, TX' },
      maxRent: { type: 'number', label: 'Max rent ($)', required: true, placeholder: '1800' },
      bedrooms: { type: 'select', label: 'Bedrooms', options: ['Studio', '1BR', '2BR', '3BR+'] },
      petsAllowed: { type: 'boolean', label: 'Pet friendly only', required: false },
    },
    schedule: '0 */6 * * *',
    authorId: null,
    isPublished: true,
  },
  {
    id: 'stock-price-alert',
    name: 'Stock price alert',
    description: 'Watches a stock or crypto price and alerts you when it crosses your target.',
    configSchema: {
      symbol: { type: 'string', label: 'Ticker symbol', required: true, placeholder: 'AAPL' },
      targetPrice: { type: 'number', label: 'Alert when price is below', required: true, placeholder: '150' },
      market: { type: 'select', label: 'Market', options: ['Stocks', 'Crypto'], required: true },
    },
    schedule: '0 */1 * * *',
    authorId: null,
    isPublished: true,
  },
  {
    id: 'keyword-news-monitor',
    name: 'Keyword news monitor',
    description: 'Sends a daily digest whenever your keyword appears in major news sources.',
    configSchema: {
      keyword: { type: 'string', label: 'Keyword or phrase', required: true, placeholder: 'AI agents' },
      frequency: { type: 'select', label: 'Digest frequency', options: ['Daily', 'Twice a day', 'Weekly'], required: true },
      sources: { type: 'string', label: 'Sources', required: false, placeholder: 'TechCrunch, Hacker News, Reddit' },
    },
    schedule: '0 8 * * *',
    authorId: null,
    isPublished: true,
  },
]

async function seed() {
  console.log('Seeding built-in agent definitions...')
  for (const agent of builtInAgents) {
    await db.insert(agentDefinitions).values({
      id: agent.id,
      name: agent.name,
      description: agent.description,
      configSchema: agent.configSchema,
      schedule: agent.schedule,
      authorId: agent.authorId,
      isPublished: agent.isPublished,
    }).onConflictDoUpdate({
      target: agentDefinitions.id,
      set: {
        name: agent.name,
        description: agent.description,
        configSchema: agent.configSchema,
        schedule: agent.schedule,
        isPublished: agent.isPublished,
      },
    })
    console.log(`Upserted agent: ${agent.id}`)
  }
  console.log('Seeding complete.')
}

seed().catch((error) => {
  console.error('Seed failed:', error)
  process.exit(1)
})
