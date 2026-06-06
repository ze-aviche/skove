import { AgentRunResult } from './flight-watcher.js'
import { RunnerContext } from './index.js'
import { db } from '../../db/index.js'
import { atsJobs, agentResults } from '../../db/schema.js'
import { and, desc, eq, sql } from 'drizzle-orm'
import { log } from '../../lib/logger.js'

interface JobTrackerConfig {
  jobTitle?: string
  location?: string
  minSalary?: number | string
  keywords?: string
  atsFirstOnly?: boolean
}

interface NormalisedJob {
  id: string
  title: string
  company: string
  location: string
  applyUrl: string
  salaryMin?: number
  salaryMax?: number
  description?: string
  postedAt: string
  source: string
}

function normalizeText(value?: string) {
  return String(value ?? '').trim().toLowerCase()
}

function formatSalary(min?: number, max?: number): string | undefined {
  if (!min && !max) return undefined
  const lo = min ? `$${Math.round(min / 1000)}k` : null
  const hi = max ? `$${Math.round(max / 1000)}k` : null
  if (lo && hi && lo !== hi) return `${lo}-${hi}`
  return lo ?? hi ?? undefined
}

function postedLabel(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
  if (days === 0) return 'Today'
  if (days === 1) return '1 day ago'
  if (days < 7) return `${days} days ago`
  return `${Math.floor(days / 7)} weeks ago`
}

async function fetchStoredATSJobs(queryText: string, location: string, minSalary: number): Promise<NormalisedJob[]> {
  const searchText = `%${normalizeText(queryText)}%`
  const locationText = `%${normalizeText(location)}%`

  log.info('job-tracker', 'db query', { titleSearch: searchText, locationSearch: locationText, minSalary })

  const rows = await db
    .select()
    .from(atsJobs)
    .where(
      and(
        sql`${atsJobs.titleSearch} like ${searchText}`,
        sql`${atsJobs.locationSearch} like ${locationText}`,
      ),
    )
    .orderBy(desc(atsJobs.createdAt))
    .limit(100)

  const filtered = rows.filter((job) => minSalary === 0 || job.salaryMin == null || job.salaryMin >= minSalary)

  log.info('job-tracker', 'db query result', {
    rowsFromDb: rows.length,
    afterSalaryFilter: filtered.length,
    salaryFilterActive: minSalary > 0,
  })

  return filtered.map((job) => ({
    id: job.externalId ?? job.id,
    title: job.title,
    company: job.company,
    location: job.location,
    applyUrl: job.applyUrl,
    salaryMin: job.salaryMin ?? undefined,
    salaryMax: job.salaryMax ?? undefined,
    description: job.description ?? undefined,
    postedAt: job.postedAt,
    source: job.source,
  }))
}

async function fetchAdzuna(what: string, where: string, minSalary: number): Promise<NormalisedJob[]> {
  const appId = process.env.ADZUNA_APP_ID
  const appKey = process.env.ADZUNA_APP_KEY
  if (!appId || !appKey) return []

  const url = new URL('https://api.adzuna.com/v1/api/jobs/us/search/1')
  url.searchParams.set('app_id', appId)
  url.searchParams.set('app_key', appKey)
  url.searchParams.set('what', what)
  url.searchParams.set('where', where)
  url.searchParams.set('results_per_page', '10')
  url.searchParams.set('sort_by', 'date')
  if (minSalary > 0) url.searchParams.set('salary_min', String(minSalary))

  const res = await fetch(url.toString())
  if (!res.ok) { log.warn('job-tracker', 'adzuna request failed', { status: res.status }); return [] }
  const data = await res.json() as {
    results?: Array<{
      id: string
      title: string
      company: { display_name: string }
      location: { display_name: string }
      redirect_url: string
      salary_min?: number
      salary_max?: number
      description?: string
      created: string
    }>
    exception?: string
  }
  if (data.exception) { log.warn('job-tracker', 'adzuna api error', { error: data.exception }); return [] }

  return (data.results ?? []).map((j) => ({
    id: `adzuna-${j.id}`,
    title: j.title,
    company: j.company.display_name,
    location: j.location.display_name,
    applyUrl: j.redirect_url,
    salaryMin: j.salary_min,
    salaryMax: j.salary_max,
    description: j.description,
    postedAt: j.created,
    source: 'Adzuna',
  }))
}

async function fetchJSearch(query: string): Promise<NormalisedJob[]> {
  const apiKey = process.env.RAPIDAPI_KEY
  if (!apiKey) return []

  const url = new URL('https://jsearch.p.rapidapi.com/search')
  url.searchParams.set('query', query)
  url.searchParams.set('page', '1')
  url.searchParams.set('num_pages', '1')
  url.searchParams.set('date_posted', 'week')

  const res = await fetch(url.toString(), {
    headers: { 'X-RapidAPI-Key': apiKey, 'X-RapidAPI-Host': 'jsearch.p.rapidapi.com' },
  })
  if (!res.ok) { log.warn('job-tracker', 'jsearch request failed', { status: res.status }); return [] }
  const data = await res.json() as {
    data?: Array<{
      job_id: string
      job_title: string
      employer_name: string
      job_city: string
      job_state: string
      job_is_remote: boolean
      job_apply_link: string
      job_min_salary: number | null
      job_max_salary: number | null
      job_posted_at_datetime_utc: string
      job_description?: string
    }>
  }

  return (data.data ?? []).map((j) => ({
    id: `jsearch-${j.job_id}`,
    title: j.job_title,
    company: j.employer_name,
    location: j.job_is_remote ? 'Remote' : [j.job_city, j.job_state].filter(Boolean).join(', '),
    applyUrl: j.job_apply_link,
    salaryMin: j.job_min_salary ?? undefined,
    salaryMax: j.job_max_salary ?? undefined,
    postedAt: j.job_posted_at_datetime_utc,
    description: j.job_description,
    source: 'LinkedIn/Indeed',
  }))
}

async function fetchRemoteOK(jobTitle: string): Promise<NormalisedJob[]> {
  const tag = jobTitle.toLowerCase().replace(/\s+/g, '-')
  const res = await fetch(`https://remoteok.com/api?tag=${encodeURIComponent(tag)}`, {
    headers: { 'User-Agent': 'skove-agent/1.0' },
  })
  if (!res.ok) return []
  const data = await res.json() as Array<{
    slug?: string
    position?: string
    company?: string
    location?: string
    url?: string
    salary_min?: number
    salary_max?: number
    date?: string
    description?: string
  }>

  return data
    .filter((j) => j.position)
    .slice(0, 5)
    .map((j) => ({
      id: `remoteok-${j.slug ?? Math.random()}`,
      title: j.position!,
      company: j.company ?? 'Unknown',
      location: j.location ?? 'Remote',
      applyUrl: j.url ?? 'https://remoteok.com',
      salaryMin: j.salary_min,
      salaryMax: j.salary_max,
      postedAt: j.date ?? new Date().toISOString(),
      description: j.description,
      source: 'RemoteOK',
    }))
}

export async function runJobApplicationTracker(
  config: Record<string, unknown>,
  ctx: RunnerContext
): Promise<AgentRunResult[]> {
  const c = config as JobTrackerConfig
  const jobTitle = String(c.jobTitle || 'Software Engineer')
  const location = String(c.location || 'Remote')
  const minSalary = Number(c.minSalary) || 0
  const keywords = c.keywords ? String(c.keywords) : ''
  const atsFirstOnly = Boolean(c.atsFirstOnly)
  const isRemote = location.toLowerCase().includes('remote')
  const what = [jobTitle, keywords].filter(Boolean).join(' ')
  const where = isRemote ? 'remote' : location

  log.info('job-tracker', 'run started', { userId: ctx.userId, jobTitle, location, minSalary, keywords, atsFirstOnly })

  let jobs = await fetchStoredATSJobs(what, where, minSalary)
  let jobSource = 'ats_db'

  if (!atsFirstOnly) {
    if (jobs.length === 0) {
      log.info('job-tracker', 'db empty, trying adzuna', { what, where })
      jobs = await fetchAdzuna(what, where, minSalary)
      jobSource = 'adzuna'
      log.info('job-tracker', 'adzuna fetch complete', { count: jobs.length })
    }
    if (jobs.length === 0) {
      log.info('job-tracker', 'adzuna empty, trying jsearch', { query: `${jobTitle} ${isRemote ? 'remote' : location}` })
      jobs = await fetchJSearch(`${jobTitle} ${isRemote ? 'remote' : location}`)
      jobSource = 'jsearch'
      log.info('job-tracker', 'jsearch fetch complete', { count: jobs.length })
    }
    if (jobs.length === 0 && isRemote) {
      log.info('job-tracker', 'jsearch empty, trying remoteok', { jobTitle })
      jobs = await fetchRemoteOK(jobTitle)
      jobSource = 'remoteok'
      log.info('job-tracker', 'remoteok fetch complete', { count: jobs.length })
    }
  } else if (jobs.length === 0) {
    log.info('job-tracker', 'ats-first-only mode: db empty, no fallback', { userId: ctx.userId })
  }

  log.info('job-tracker', 'jobs candidate pool ready', { count: jobs.length, source: jobSource, userId: ctx.userId })

  const deliveredRows = await db.select({ url: agentResults.url }).from(agentResults).where(eq(agentResults.userId, ctx.userId))
  const deliveredSet = new Set(deliveredRows.map((r: any) => r.url))

  log.info('job-tracker', 'dedup context loaded', {
    seenThisRun: ctx.seenKeys.size,
    previouslyDelivered: deliveredSet.size,
    userId: ctx.userId,
  })

  const results: AgentRunResult[] = []
  let skippedSeen = 0
  let skippedDelivered = 0

  for (const job of jobs) {
    const jobKey = job.applyUrl ?? `${job.title} @ ${job.company}`
    if (ctx.seenKeys.has(jobKey)) { skippedSeen++; continue }
    if (deliveredSet.has(job.applyUrl)) { skippedDelivered++; continue }

    const salary = formatSalary(job.salaryMin, job.salaryMax)
    results.push({
      title: `${job.title} @ ${job.company}`,
      value: salary,
      url: job.applyUrl,
      metadata: {
        company: job.company,
        jobTitle: job.title,
        location: job.location,
        description: job.description,
        salary,
        postedLabel: postedLabel(job.postedAt),
        source: job.source,
        agentType: 'job-application-tracker',
      },
    })
  }

  log.info('job-tracker', 'run complete', {
    userId: ctx.userId,
    candidatePool: jobs.length,
    skippedSeen,
    skippedDelivered,
    newResults: results.length,
  })
  return results
}
