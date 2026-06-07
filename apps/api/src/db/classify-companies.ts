import { config } from 'dotenv'
config({ path: '.env.local' })

import Anthropic from '@anthropic-ai/sdk'
import { eq } from 'drizzle-orm'
import { db } from './index.js'
import { atsCompanies } from './schema.js'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// Taxonomy of company specializations
const TAXONOMY = `
CCaaS: PURE contact center and customer service platform companies ONLY. Examples: Genesys, Five9, NICE, Talkdesk, Avaya, RingCentral (CCaaS division), Vonage, 8x8, Cisco (Webex CC), Amazon Connect, Twilio Flex. Do NOT use this for CRM, sales tools, or broad SaaS companies even if they have a contact center product.
DevTools: Developer tools, IDEs, version control, CI/CD pipelines, monitoring, observability, API management, code review. Examples: GitHub, GitLab, Datadog, PagerDuty, Postman, JFrog.
Database: Database systems, data warehouses, data pipelines, search engines, analytics infrastructure. Examples: Snowflake, Databricks, MongoDB, Elastic, Confluent, dbt Labs.
FinTech: Financial services, payments, banking software, trading platforms, accounting, insurance tech. Examples: Stripe, Plaid, Brex, Rippling (finance), QuickBooks.
HR Tech: Human resources, recruitment ATS, employee engagement, payroll, learning management. Examples: Workday, Greenhouse, Lever, Rippling (HR), Lattice, 15Five.
Infrastructure: Cloud infrastructure, container orchestration, networking, security, storage. Examples: AWS, GCP, Azure, Cloudflare, HashiCorp, Palo Alto Networks.
AI/ML: Machine learning platforms, LLM providers, AI-native tools, MLOps, data science platforms. Examples: OpenAI, Anthropic, Cohere, Scale AI, Weights & Biases, Hugging Face.
E-commerce: Online retail platforms, marketplace software, commerce tooling. Examples: Shopify, BigCommerce, Magento, Faire.
Communication: Team messaging, VoIP, video conferencing, email platforms, collaboration. Examples: Slack, Zoom, Microsoft Teams, Loom, Notion.
Marketing/Analytics: CRM, marketing automation, customer data, advertising tech, web analytics. Examples: Salesforce, HubSpot, Marketo, Segment, Amplitude, Mixpanel.
Other: Any company that does not clearly fit the above categories (healthcare, legal, real estate, manufacturing, education, logistics, etc).
`

interface ClassifyRequest {
  name: string
  careersUrl?: string
}

async function classifyBatch(companies: ClassifyRequest[]): Promise<Record<string, string>> {
  const prompt = `Classify these ${companies.length} companies into ONE category each.

Companies:
${companies.map((c, i) => `${i + 1}. ${c.name}`).join('\n')}

Categories: CCaaS, DevTools, Database, FinTech, HR Tech, Infrastructure, AI/ML, E-commerce, Communication, Marketing/Analytics, Other

IMPORTANT: Return ONLY valid JSON. Each company gets exactly ONE category.
Format: {"Company Name": "Category"}
NO markdown, NO code blocks, NO explanations.`

  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }],
    })

    const text = response.content[0].type === 'text' ? response.content[0].text : ''

    // Extract JSON from response (between first { and last })
    const jsonStart = text.indexOf('{')
    const jsonEnd = text.lastIndexOf('}')

    if (jsonStart === -1 || jsonEnd === -1 || jsonStart > jsonEnd) {
      console.error(`[BATCH ERROR] No JSON found. Response preview: ${text.substring(0, 100)}`)
      return {}
    }

    const jsonText = text.substring(jsonStart, jsonEnd + 1)
    const parsed = JSON.parse(jsonText)

    // Validate: check that we got entries for all companies
    const received = Object.keys(parsed).length
    console.log(`  [BATCH] Received ${received}/${companies.length} classifications`)

    if (received < companies.length * 0.8) {
      console.warn(`  [WARNING] Got only ${received}% of expected responses`)
    }

    return parsed
  } catch (e) {
    console.error(`  [PARSE ERROR] ${(e as Error).message}`)
    return {}
  }
}

async function main() {
  console.log('Resetting all specializations to null...')
  await db.update(atsCompanies).set({ specialization: null })
  console.log('Reset complete. Fetching all companies...')
  const allCompanies = await db.select().from(atsCompanies)
  console.log(`Found ${allCompanies.length} companies`)

  const BATCH_SIZE = 25
  let classified = 0
  let skipped = 0

  for (let i = 0; i < allCompanies.length; i += BATCH_SIZE) {
    const batch = allCompanies.slice(i, i + BATCH_SIZE)
    const unclassified = batch.filter((c) => !c.specialization)

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
          .where(eq(atsCompanies.id, company.id))
        classified++

        // Log a sample to see the distribution
        if (classified <= 10 || classified % 100 === 0) {
          console.log(`    → ${company.name}: ${specialization}`)
        } else if (classified % 10 === 0) {
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
