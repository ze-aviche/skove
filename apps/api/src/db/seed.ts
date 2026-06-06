import 'dotenv/config'
import { db } from './index'
import { agentDefinitions, atsCompanies } from './schema'
import { eq } from 'drizzle-orm'
import { seedATSCompanies } from './seed-ats-companies'

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
      frequency: { type: 'select', label: 'Check frequency', required: false, options: ['Every 1 hour', 'Every 2 hours', 'Every 6 hours', 'Every 12 hours'], placeholder: 'Every 2 hours' },
    },
    schedule: '0 */2 * * *',
    authorId: null,
    isPublished: true,
  },
  {
    id: 'job-application-tracker',
    name: 'Job application tracker',
    description: 'Watches new job listings and prioritizes ATS feeds first, with broad search APIs as fallback.',
    configSchema: {
      jobTitle: { type: 'string', label: 'Job title', required: true, placeholder: 'Product Manager' },
      location: { type: 'string', label: 'Location', required: true, placeholder: 'Remote / Austin, TX' },
      minSalary: { type: 'number', label: 'Minimum salary ($)', required: false },
      keywords: { type: 'string', label: 'Keywords', required: false, placeholder: 'PM, product, roadmap' },
      atsCompanies: { type: 'string', label: 'ATS companies (comma-separated)', required: false, placeholder: 'Amazon, Google, Salesforce' },
      atsFirstOnly: { type: 'boolean', label: 'ATS-first only', required: false, placeholder: 'Only use Lever, Greenhouse, and Ashby sources' },
      matchThreshold: { type: 'number', label: 'Min AI match score (1–10)', required: false, placeholder: '7' },
      frequency: { type: 'select', label: 'Check frequency', required: false, options: ['Every 6 hours', 'Every 12 hours', 'Daily'], placeholder: 'Every 12 hours' },
    },
    schedule: '0 */4 * * *',
    authorId: null,
    isPublished: true,
  },
  {
    id: 'rental-listing-monitor',
    name: 'Real estate search',
    description: 'Searches Zillow, Redfin, Realtor.com and more for homes to rent, buy, or lease.',
    configSchema: {
      listingType: { type: 'select', label: 'Looking to', required: true, options: ['Rent', 'Buy', 'Lease'] },
      city: { type: 'city', label: 'City', required: true, placeholder: 'Austin, TX' },
      propertyType: { type: 'select', label: 'Property type', required: false, options: ['Any', 'House', 'Apartment', 'Condo', 'Townhouse', 'Studio', 'Land', 'Commercial'] },
      minPrice: { type: 'number', label: 'Min price', required: false, placeholder: '800' },
      maxPrice: { type: 'number', label: 'Max price', required: false, placeholder: '2500' },
      bedrooms: { type: 'select', label: 'Bedrooms', required: false, options: ['Any', 'Studio', '1', '2', '3', '4+'] },
      bathrooms: { type: 'select', label: 'Bathrooms', required: false, options: ['Any', '1', '1.5', '2', '3+'] },
      petsAllowed: { type: 'boolean', label: 'Pet friendly only', required: false },
      frequency: { type: 'select', label: 'Check frequency', required: false, options: ['Every 12 hours', 'Daily', 'Every 2 days', 'Weekly'], placeholder: 'Daily' },
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
      frequency: { type: 'select', label: 'Check frequency', required: false, options: ['Every 30 minutes', 'Every 1 hour', 'Every 2 hours', 'Every 4 hours'], placeholder: 'Every 1 hour' },
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
      sources: { type: 'string', label: 'Sources', required: false, placeholder: 'TechCrunch, Hacker News, Reddit' },
      frequency: { type: 'select', label: 'Check frequency', required: false, options: ['Twice daily', 'Daily', 'Weekly'], placeholder: 'Daily' },
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

  const companySeeds = [
    {
      name: 'Anthropic',
      careersUrl: 'https://boards.greenhouse.io/anthropic',
      atsType: 'greenhouse',
      atsIdentifier: 'anthropic',
      isEnabled: true,
    },
    {
      name: 'OpenAI',
      careersUrl: 'https://openai.com/careers',
      atsType: 'custom',
      atsIdentifier: 'openai',
      isEnabled: true,
    },
    {
      name: 'Google',
      careersUrl: 'https://careers.google.com',
      atsType: 'greenhouse',
      atsIdentifier: 'google',
      isEnabled: true,
    },
  ]

  console.log('Seeding ATS company mappings...')
  for (const company of companySeeds) {
    const existing = await db.select({ id: atsCompanies.id }).from(atsCompanies).where(eq(atsCompanies.atsIdentifier, company.atsIdentifier))
    if (existing.length > 0) {
      await db.update(atsCompanies).set({
        name: company.name,
        careersUrl: company.careersUrl,
        atsType: company.atsType,
        isEnabled: company.isEnabled,
        updatedAt: new Date(),
      }).where(eq(atsCompanies.atsIdentifier, company.atsIdentifier))
    } else {
      await db.insert(atsCompanies).values({
        name: company.name,
        careersUrl: company.careersUrl,
        atsType: company.atsType,
        atsIdentifier: company.atsIdentifier,
        isEnabled: company.isEnabled,
        updatedAt: new Date(),
      })
    }
    console.log(`Upserted ATS company: ${company.name}`)
  }

  await seedATSCompanies()

  console.log('Seeding complete.')
}

seed().catch((error) => {
  console.error('Seed failed:', error)
  process.exit(1)
})
