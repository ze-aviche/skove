import 'dotenv/config'
import { db } from './index.js'
import { agentDefinitions, atsCompanies } from './schema.js'
import { eq } from 'drizzle-orm'
import { seedATSCompanies } from './seed-ats-companies.js'

const builtInAgents = [
  {
    id: 'job-application-tracker',
    name: 'Job application tracker',
    description: 'Watches new job listings and prioritizes ATS feeds first, with broad search APIs as fallback.',
    configSchema: {
      jobTitle: { type: 'job-title-tags', label: 'Job titles', required: true, placeholder: 'Software Engineer, Data Scientist…' },
      location: { type: 'location-tags', label: 'Locations', required: true, placeholder: 'Remote, Dallas, TX…' },
      keywords: { type: 'string', label: 'Keywords', required: false, placeholder: 'e.g. Genesys, CCaaS, Twilio, contact center' },
      specialization: { type: 'specialization-tags', label: 'Specializations', required: false, placeholder: '' },
      matchThreshold: { type: 'number', label: 'Min AI match score (1–10)', required: false, placeholder: '7' },
      frequency: { type: 'select', label: 'Check frequency', required: false, options: ['Every 6 hours', 'Every 12 hours', 'Daily'], placeholder: 'Every 12 hours' },
    },
    schedule: '0 */4 * * *',
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
