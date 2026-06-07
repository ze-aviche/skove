import 'dotenv/config'
import { db } from './index.js'
import { atsCompanies } from './schema.js'
import { eq } from 'drizzle-orm'
import { fileURLToPath } from 'url'

// Curated list of CCaaS / contact-center companies, covering:
//   - Pure-play CCaaS (Five9, Talkdesk, Dialpad, Aircall, …)
//   - CPaaS / telco platforms (Twilio, Bandwidth, Vonage, 8x8, …)
//   - CX / workforce engagement (Sprinklr, Medallia, Qualtrics, Verint, …)
//   - Large MNCs via Workday (Genesys, RingCentral, NICE, Zoom, Avaya, …)
//
// Workday URLs follow the pattern:
//   https://{tenant}.{instance}.myworkdayjobs.com/en-US/{board}
// The refresher derives the CXS API endpoint from the careersUrl at fetch time.

const CCAAS_COMPANIES: Array<{
  name: string
  provider: 'greenhouse' | 'lever' | 'ashby' | 'workday'
  slug: string
  url: string
}> = [
  // ── Greenhouse ──────────────────────────────────────────────────────────────
  { name: 'Five9',       provider: 'greenhouse', slug: 'five9',       url: 'https://boards.greenhouse.io/five9' },
  { name: 'Talkdesk',    provider: 'greenhouse', slug: 'talkdesk',    url: 'https://boards.greenhouse.io/talkdesk' },
  { name: 'Twilio',      provider: 'greenhouse', slug: 'twilio',      url: 'https://boards.greenhouse.io/twilio' },
  { name: 'LivePerson',  provider: 'greenhouse', slug: 'liveperson',  url: 'https://boards.greenhouse.io/liveperson' },
  { name: 'Bandwidth',   provider: 'greenhouse', slug: 'bandwidth',   url: 'https://boards.greenhouse.io/bandwidth' },
  { name: 'Intercom',    provider: 'greenhouse', slug: 'intercom',    url: 'https://boards.greenhouse.io/intercom' },
  { name: 'Sprinklr',    provider: 'greenhouse', slug: 'sprinklr',    url: 'https://boards.greenhouse.io/sprinklr' },
  { name: 'Medallia',    provider: 'greenhouse', slug: 'medallia',    url: 'https://boards.greenhouse.io/medallia' },
  { name: 'Freshworks',  provider: 'greenhouse', slug: 'freshworks',  url: 'https://boards.greenhouse.io/freshworks' },
  { name: 'Nextiva',     provider: 'greenhouse', slug: 'nextiva',     url: 'https://boards.greenhouse.io/nextiva' },
  { name: 'Gladly',      provider: 'greenhouse', slug: 'gladly',      url: 'https://boards.greenhouse.io/gladly' },
  { name: 'Qualtrics',   provider: 'greenhouse', slug: 'qualtrics',   url: 'https://boards.greenhouse.io/qualtrics' },
  { name: 'TTEC',        provider: 'greenhouse', slug: 'ttec',        url: 'https://boards.greenhouse.io/ttec' },
  { name: 'Concentrix',  provider: 'greenhouse', slug: 'concentrix',  url: 'https://boards.greenhouse.io/concentrix' },
  { name: 'Kore.ai',     provider: 'greenhouse', slug: 'koreai',      url: 'https://boards.greenhouse.io/koreai' },
  { name: 'Vonage',      provider: 'greenhouse', slug: 'vonage',      url: 'https://boards.greenhouse.io/vonage' },
  { name: 'Nuance',      provider: 'greenhouse', slug: 'nuance',      url: 'https://boards.greenhouse.io/nuance' },

  // ── Lever ───────────────────────────────────────────────────────────────────
  { name: 'Aircall',    provider: 'lever', slug: 'aircall',    url: 'https://jobs.lever.co/aircall' },
  { name: 'Kustomer',   provider: 'lever', slug: 'kustomer',   url: 'https://jobs.lever.co/kustomer' },
  { name: 'Dialpad',    provider: 'lever', slug: 'dialpad',    url: 'https://jobs.lever.co/dialpad' },
  { name: '8x8',        provider: 'lever', slug: '8x8',        url: 'https://jobs.lever.co/8x8' },
  { name: 'CloudTalk',  provider: 'lever', slug: 'cloudtalk',  url: 'https://jobs.lever.co/cloudtalk' },
  { name: 'Liveops',    provider: 'lever', slug: 'liveops',    url: 'https://jobs.lever.co/liveops' },

  // ── Ashby ───────────────────────────────────────────────────────────────────
  { name: 'Cognigy',     provider: 'ashby', slug: 'cognigy',     url: 'https://jobs.ashbyhq.com/cognigy' },
  { name: 'Observe.AI',  provider: 'ashby', slug: 'observeai',   url: 'https://jobs.ashbyhq.com/observeai' },
  { name: 'Assembled',   provider: 'ashby', slug: 'assembled',   url: 'https://jobs.ashbyhq.com/assembled' },
  { name: 'PolyAI',      provider: 'ashby', slug: 'polyai',      url: 'https://jobs.ashbyhq.com/polyai' },

  // ── Workday (large MNCs) ────────────────────────────────────────────────────
  // URL pattern: https://{tenant}.{instance}.myworkdayjobs.com/en-US/{board}
  // The refresher parses this to build the CXS API endpoint automatically.
  { name: 'Genesys',      provider: 'workday', slug: 'workday-genesys',      url: 'https://genesys.wd1.myworkdayjobs.com/en-US/Genesys' },
  { name: 'RingCentral',  provider: 'workday', slug: 'workday-ringcentral',  url: 'https://ringcentral.wd5.myworkdayjobs.com/en-US/RingCentral' },
  { name: 'NICE',         provider: 'workday', slug: 'workday-nice',         url: 'https://nice.wd3.myworkdayjobs.com/en-US/NICE' },
  { name: 'Verint',       provider: 'workday', slug: 'workday-verint',       url: 'https://verint.wd1.myworkdayjobs.com/en-US/Verint_Careers' },
  { name: 'Zendesk',      provider: 'workday', slug: 'workday-zendesk',      url: 'https://zendesk.wd1.myworkdayjobs.com/en-US/Zendesk' },
  { name: 'Zoom',         provider: 'workday', slug: 'workday-zoom',         url: 'https://zoom.wd5.myworkdayjobs.com/en-US/Zoom' },
  { name: 'Avaya',        provider: 'workday', slug: 'workday-avaya',        url: 'https://avaya.wd5.myworkdayjobs.com/en-US/avaya-ext' },
]

async function upsertCompany(entry: (typeof CCAAS_COMPANIES)[number]) {
  const [existing] = await db
    .select({ id: atsCompanies.id })
    .from(atsCompanies)
    .where(eq(atsCompanies.atsIdentifier, entry.slug))

  const row = {
    name: entry.name,
    careersUrl: entry.url,
    atsType: entry.provider,
    atsIdentifier: entry.slug,
    isEnabled: true,
    updatedAt: new Date(),
  }

  if (existing) {
    await db.update(atsCompanies).set(row).where(eq(atsCompanies.atsIdentifier, entry.slug))
  } else {
    await db.insert(atsCompanies).values(row)
  }
}

export async function seedCCaaSCompanies() {
  console.log(`Seeding ${CCAAS_COMPANIES.length} CCaaS companies…`)
  let upserted = 0
  for (const entry of CCAAS_COMPANIES) {
    await upsertCompany(entry)
    upserted += 1
    console.log(`  [${entry.provider}] ${entry.name}`)
  }
  console.log(`Done — ${upserted} rows upserted.`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  seedCCaaSCompanies().catch((err) => {
    console.error('Seed failed:', err)
    process.exit(1)
  })
}
