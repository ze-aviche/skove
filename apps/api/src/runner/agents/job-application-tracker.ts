import { AgentRunResult } from './flight-watcher'

interface JobTrackerConfig {
  jobTitle?: string
  location?: string
  minSalary?: number | string
  keywords?: string
}

interface JSearchJob {
  job_id: string
  employer_name: string
  job_title: string
  job_city: string
  job_state: string
  job_country: string
  job_is_remote: boolean
  job_posted_at_datetime_utc: string
  job_min_salary: number | null
  job_max_salary: number | null
  job_salary_currency: string | null
  job_apply_link: string
  job_employment_type: string
}

function formatSalary(min: number | null, max: number | null, currency: string | null): string | undefined {
  if (!min && !max) return undefined
  const sym = currency === 'USD' ? '$' : (currency ?? '')
  const lo = min ? `${sym}${Math.round(min / 1000)}k` : null
  const hi = max ? `${sym}${Math.round(max / 1000)}k` : null
  if (lo && hi) return `${lo}–${hi}`
  return lo ?? hi ?? undefined
}

function postedLabel(iso: string | null): string {
  if (!iso) return 'Recently'
  const diff = Date.now() - new Date(iso).getTime()
  const days = Math.floor(diff / 86400000)
  if (days === 0) return 'Today'
  if (days === 1) return '1 day ago'
  if (days < 7) return `${days} days ago`
  if (days < 14) return '1 week ago'
  return `${Math.floor(days / 7)} weeks ago`
}

async function fetchFromJSearch(query: string, apiKey: string): Promise<JSearchJob[]> {
  const url = new URL('https://jsearch.p.rapidapi.com/search')
  url.searchParams.set('query', query)
  url.searchParams.set('page', '1')
  url.searchParams.set('num_pages', '1')
  url.searchParams.set('date_posted', 'week')

  const res = await fetch(url.toString(), {
    headers: {
      'X-RapidAPI-Key': apiKey,
      'X-RapidAPI-Host': 'jsearch.p.rapidapi.com',
    },
  })

  if (!res.ok) throw new Error(`JSearch API error: ${res.status}`)
  const data = await res.json() as { data: JSearchJob[] }
  return data.data ?? []
}

export async function runJobApplicationTracker(config: Record<string, unknown>): Promise<AgentRunResult[]> {
  const c = config as JobTrackerConfig
  const jobTitle = String(c.jobTitle || 'Software Engineer')
  const location = String(c.location || 'Remote')
  const minSalary = Number(c.minSalary) || 0
  const keywords = c.keywords ? String(c.keywords) : ''

  const apiKey = process.env.RAPIDAPI_KEY
  if (!apiKey) throw new Error('RAPIDAPI_KEY is not set')

  const isRemote = location.toLowerCase().includes('remote')
  const queryParts = [jobTitle]
  if (keywords) queryParts.push(keywords)
  if (!isRemote) queryParts.push(`in ${location}`)
  if (isRemote) queryParts.push('remote')
  const query = queryParts.join(' ')

  const jobs = await fetchFromJSearch(query, apiKey)

  return jobs
    .filter((job) => {
      if (minSalary > 0 && job.job_min_salary && job.job_min_salary < minSalary) return false
      return true
    })
    .slice(0, 5)
    .map((job) => {
      const salary = formatSalary(job.job_min_salary, job.job_max_salary, job.job_salary_currency)
      const jobLocation = job.job_is_remote
        ? 'Remote'
        : [job.job_city, job.job_state].filter(Boolean).join(', ') || job.job_country

      return {
        title: `${job.job_title} @ ${job.employer_name}`,
        value: salary,
        url: job.job_apply_link,
        metadata: {
          company: job.employer_name,
          jobTitle: job.job_title,
          location: jobLocation,
          salary,
          postedLabel: postedLabel(job.job_posted_at_datetime_utc),
          employmentType: job.job_employment_type,
          agentType: 'job-application-tracker',
        },
      }
    })
}
