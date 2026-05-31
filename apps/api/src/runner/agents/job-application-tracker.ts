import { AgentRunResult } from './flight-watcher'

const COMPANIES = [
  'Stripe', 'Notion', 'Linear', 'Vercel', 'Figma', 'Retool', 'Airtable',
  'Shopify', 'Atlassian', 'HubSpot', 'Twilio', 'Datadog', 'MongoDB',
  'Snowflake', 'Cloudflare', 'PagerDuty', 'Intercom', 'Brex', 'Rippling',
  'Gusto', 'Carta', 'Plaid', 'Mix panel', 'Segment', 'LaunchDarkly',
]

const TITLE_VARIANTS: Record<string, string[]> = {
  default: ['Senior', 'Staff', 'Lead', 'Principal', 'Sr.'],
}

const JOB_BOARDS = [
  { name: 'LinkedIn', url: 'https://linkedin.com/jobs/search/?keywords=' },
  { name: 'Indeed', url: 'https://indeed.com/jobs?q=' },
  { name: 'Greenhouse', url: 'https://boards.greenhouse.io/' },
  { name: 'Lever', url: 'https://jobs.lever.co/' },
]

function randomInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function randomFrom<T>(arr: T[]): T {
  return arr[randomInt(0, arr.length - 1)]
}

function daysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().split('T')[0]
}

function formatSalary(base: number): string {
  const lo = Math.round(base / 1000) * 1000
  const hi = lo + randomInt(20000, 40000)
  return `$${(lo / 1000).toFixed(0)}k–$${(hi / 1000).toFixed(0)}k`
}

interface JobTrackerConfig {
  jobTitle?: string
  location?: string
  minSalary?: number | string
  keywords?: string
}

export async function runJobApplicationTracker(config: Record<string, unknown>): Promise<AgentRunResult[]> {
  const c = config as JobTrackerConfig
  const jobTitle = String(c.jobTitle || 'Software Engineer')
  const location = String(c.location || 'Remote')
  const minSalary = Number(c.minSalary) || 80000

  const results: AgentRunResult[] = []
  const numListings = randomInt(2, 4)
  const usedCompanies = new Set<string>()

  for (let i = 0; i < numListings; i++) {
    let company = randomFrom(COMPANIES)
    while (usedCompanies.has(company)) company = randomFrom(COMPANIES)
    usedCompanies.add(company)

    const prefix = randomFrom(TITLE_VARIANTS.default)
    const fullTitle = `${prefix} ${jobTitle}`
    const salary = formatSalary(minSalary + randomInt(0, 30000))
    const postedDaysAgo = randomInt(0, 4)
    const board = randomFrom(JOB_BOARDS)
    const isRemote = location.toLowerCase().includes('remote')
    const displayLocation = isRemote ? 'Remote' : location

    results.push({
      title: `${fullTitle} @ ${company}`,
      value: salary,
      url: `${board.url}${encodeURIComponent(jobTitle)}`,
      metadata: {
        company,
        jobTitle: fullTitle,
        location: displayLocation,
        salary,
        postedDate: daysAgo(postedDaysAgo),
        postedLabel: postedDaysAgo === 0 ? 'Today' : `${postedDaysAgo}d ago`,
        board: board.name,
        agentType: 'job-application-tracker',
      },
    })
  }

  return results
}
