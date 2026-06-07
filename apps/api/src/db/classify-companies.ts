import { config } from 'dotenv'
config({ path: '.env.local' })

import Anthropic from '@anthropic-ai/sdk'
import { db } from './index.js'
import { atsCompanies } from './schema.js'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// Taxonomy of company specializations
const TAXONOMY = `
Cloud/Contact Center (CCaaS): Contact center platforms, customer service software, IVR systems, workforce management
DevTools/Dev Platforms: Developer tools, IDEs, version control, CI/CD, monitoring, observability, API management
Database/Data: Database systems, data warehouses, analytics, data pipelines, search engines
FinTech: Financial services, payments, accounting, trading, investment platforms
HR Tech: Human resources, recruitment, employee engagement, learning management
Infrastructure/Cloud: Cloud infrastructure, container orchestration, networking, security
AI/ML: Machine learning platforms, LLMs, AI tools, data science
E-commerce: Online retail platforms, shopping carts, marketplace software
Communication: Email, messaging, VoIP, video conferencing, collaboration tools
Marketing/Analytics: Marketing automation, CRM, analytics, customer data, advertising
`

interface ClassifyRequest {
  name: string
  careersUrl?: string
}

async function classifyBatch(companies: ClassifyRequest[]): Promise<Record<string, string>> {
  const prompt = `Return ONLY valid JSON with no markdown, no explanation.
Classify these companies:

${companies.map((c) => c.name).join('\n')}

Use categories: CCaaS, DevTools, Database, FinTech, HR Tech, Infrastructure, AI/ML, E-commerce, Communication, Marketing/Analytics, or Other.

Format: {"Company": "Category"}`

  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 1500,
      messages: [{ role: 'user', content: prompt }],
    })

    const text = response.content[0].type === 'text' ? response.content[0].text : ''

    // Extract JSON from response (between first { and last })
    const jsonStart = text.indexOf('{')
    const jsonEnd = text.lastIndexOf('}')

    if (jsonStart === -1 || jsonEnd === -1 || jsonStart > jsonEnd) {
      console.error(`No valid JSON found in response`)
      return {}
    }

    const jsonText = text.substring(jsonStart, jsonEnd + 1)
    return JSON.parse(jsonText)
  } catch (e) {
    console.error(`Parse error: ${(e as Error).message}`)
    return {}
  }
}

async function main() {
  console.log('Fetching all companies...')
  const allCompanies = await db.select().from(atsCompanies)
  console.log(`Found ${allCompanies.length} companies`)

  const BATCH_SIZE = 25
  let classified = 0
  let skipped = 0

  for (let i = 0; i < allCompanies.length; i += BATCH_SIZE) {
    const batch = allCompanies.slice(i, i + BATCH_SIZE)
    const unclassified = batch.filter((c) => !c.specialization || c.specialization === 'Other')

    if (unclassified.length === 0) {
      skipped += batch.length
      continue
    }

    console.log(
      `\nProcessing batch ${Math.floor(i / BATCH_SIZE) + 1} (${unclassified.length} unclassified)...`,
    )

    try {
      const results = await classifyBatch(unclassified.map((c) => ({ name: c.name, careersUrl: c.careersUrl ?? undefined })))

      for (const company of unclassified) {
        const specialization = results[company.name] || 'Other'
        await db
          .update(atsCompanies)
          .set({ specialization })
          .where(atsCompanies.id == company.id)
        classified++
        if (classified % 10 === 0) {
          console.log(`  Classified ${classified}...`)
        }
      }
    } catch (error) {
      console.error(`Error classifying batch: ${error instanceof Error ? error.message : error}`)
    }
  }

  console.log(`\n✓ Complete`)
  console.log(`  Classified: ${classified}`)
  console.log(`  Skipped (already classified): ${skipped}`)
}

main().catch(console.error)
