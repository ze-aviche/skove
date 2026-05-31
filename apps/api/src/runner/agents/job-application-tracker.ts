import { AgentRunResult } from './flight-watcher'

interface JobTrackerConfig {
  jobTitle?: string
  location?: string
  minSalary?: number | string
  keywords?: string
}

interface AdzunaJob {
  id: string
  title: string
  company: { display_name: string }
  location: { display_name: string }
  redirect_url: string
  salary_min?: number
  salary_max?: number
  created: string
  contract_time?: string
}

interface AdzunaResponse {
  results: AdzunaJob[]
  count: number
  exception?: string
}

function formatSalary(min?: number, max?: number): string | undefined {
  if (!min && !max) return undefined
  const lo = min ? `$${Math.round(min / 1000)}k` : null
  const hi = max ? `$${Math.round(max / 1000)}k` : null
  if (lo && hi && lo !== hi) return `${lo}–${hi}`
  return lo ?? hi ?? undefined
}

function postedLabel(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const days = Math.floor(diff / 86400000)
  if (days === 0) return 'Today'
  if (days === 1) return '1 day ago'
  if (days < 7) return `${days} days ago`
  if (days < 14) return '1 week ago'
  return `${Math.floor(days / 7)} weeks ago`
}

export async function runJobApplicationTracker(config: Record<string, unknown>): Promise<AgentRunResult[]> {
  const c = config as JobTrackerConfig
  const jobTitle = String(c.jobTitle || 'Software Engineer')
  const location = String(c.location || 'Remote')
  const minSalary = Number(c.minSalary) || 0
  const keywords = c.keywords ? String(c.keywords) : ''

  const appId = process.env.ADZUNA_APP_ID
  const appKey = process.env.ADZUNA_APP_KEY
  if (!appId || !appKey) throw new Error('ADZUNA_APP_ID and ADZUNA_APP_KEY are not set')

  const isRemote = location.toLowerCase().includes('remote')
  const what = [jobTitle, keywords].filter(Boolean).join(' ')
  const where = isRemote ? 'remote' : location

  const url = new URL('https://api.adzuna.com/v1/api/jobs/us/search/1')
  url.searchParams.set('app_id', appId)
  url.searchParams.set('app_key', appKey)
  url.searchParams.set('what', what)
  url.searchParams.set('where', where)
  url.searchParams.set('results_per_page', '10')
  url.searchParams.set('sort_by', 'date')
  if (minSalary > 0) url.searchParams.set('salary_min', String(minSalary))

  const res = await fetch(url.toString())
  if (!res.ok) throw new Error(`Adzuna API error: ${res.status}`)

  const data = await res.json() as AdzunaResponse
  if (data.exception) throw new Error(`Adzuna: ${data.exception}`)

  return data.results.slice(0, 5).map((job) => {
    const salary = formatSalary(job.salary_min, job.salary_max)
    return {
      title: `${job.title} @ ${job.company.display_name}`,
      value: salary,
      url: job.redirect_url,
      metadata: {
        company: job.company.display_name,
        jobTitle: job.title,
        location: job.location.display_name,
        salary,
        postedLabel: postedLabel(job.created),
        contractTime: job.contract_time,
        agentType: 'job-application-tracker',
      },
    }
  })
}
