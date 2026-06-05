import { AgentRunResult } from './flight-watcher'
import { RunnerContext } from './index'
import { scoreJobMatch, tailorResume } from '../../lib/claude'
import { db } from '../../db'
import { users, atsJobs, atsQueryCaches } from '../../db/schema'
import { and, desc, eq, lt, or, sql, SQL } from 'drizzle-orm'
import { createHash } from 'crypto'
import { log } from '../../lib/logger'

interface JobTrackerConfig {
  jobTitle?: string
  location?: string
  minSalary?: number | string
  keywords?: string
  atsCompanies?: string
  atsFirstOnly?: boolean
  matchThreshold?: number | string
}

// Normalised job shape from any source
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

function formatSalary(min?: number, max?: number): string | undefined {
  if (!min && !max) return undefined
  const lo = min ? `$${Math.round(min / 1000)}k` : null
  const hi = max ? `$${Math.round(max / 1000)}k` : null
  if (lo && hi && lo !== hi) return `${lo}–${hi}`
  return lo ?? hi ?? undefined
}

function postedLabel(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
  if (days === 0) return 'Today'
  if (days === 1) return '1 day ago'
  if (days < 7) return `${days} days ago`
  return `${Math.floor(days / 7)} weeks ago`
}

// ── Source 1: Adzuna ─────────────────────────────────────────────────────────

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
  const data = await res.json() as { results?: { id: string; title: string; company: { display_name: string }; location: { display_name: string }; redirect_url: string; salary_min?: number; salary_max?: number; description?: string; created: string }[]; exception?: string }
  if (data.exception) { log.warn('job-tracker', 'adzuna api error', { error: data.exception }); return [] }

  return (data.results ?? []).map(j => ({
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

// ── Source 2: JSearch (LinkedIn + Indeed + Glassdoor) ────────────────────────

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
  const data = await res.json() as { data?: { job_id: string; job_title: string; employer_name: string; job_city: string; job_state: string; job_is_remote: boolean; job_apply_link: string; job_min_salary: number | null; job_max_salary: number | null; job_posted_at_datetime_utc: string; job_description?: string }[] }

  return (data.data ?? []).map(j => ({
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

// ── Source 3: RemoteOK (free, no key needed) ─────────────────────────────────

async function fetchRemoteOK(jobTitle: string): Promise<NormalisedJob[]> {
  const tag = jobTitle.toLowerCase().replace(/\s+/g, '-')
  const res = await fetch(`https://remoteok.com/api?tag=${encodeURIComponent(tag)}`, {
    headers: { 'User-Agent': 'skove-agent/1.0' },
  })
  if (!res.ok) return []
  const data = await res.json() as { slug?: string; position?: string; company?: string; location?: string; url?: string; salary_min?: number; salary_max?: number; date?: string; description?: string }[]

  return data
    .filter(j => j.position)
    .slice(0, 5)
    .map(j => ({
      id: `remoteok-${j.slug ?? Math.random()}`,
      title: j.position!,
      company: j.company ?? 'Unknown',
      location: j.location ?? 'Remote',
      applyUrl: j.url ?? `https://remoteok.com`,
      salaryMin: j.salary_min,
      salaryMax: j.salary_max,
      postedAt: j.date ?? new Date().toISOString(),
      description: j.description,
      source: 'RemoteOK',
    }))
}

const defaultATSCompanies = [
  'amazon',
  'google',
  'microsoft',
  'facebook',
  'apple',
  'salesforce',
  'uber',
  'airbnb',
  'stripe',
  'twitter',
]

function normalizeText(value?: string) {
  return String(value ?? '').trim().toLowerCase()
}

function matchText(value: string, search: string) {
  return search.length === 0 || value.includes(search)
}

function matchLocation(value: string, location: string, isRemote: boolean) {
  const normalized = value.toLowerCase()
  if (isRemote) {
    return normalized.includes('remote') || normalized.includes('work from home')
  }
  return location.length === 0 || normalized.includes(location)
}

const ATS_REFRESH_MS = 1000 * 60 * 60 // 1 hour
const ATS_RETENTION_MS = 1000 * 60 * 60 * 24 * 14 // 14 days

async function cleanupOldATSCache(): Promise<void> {
  const threshold = new Date(Date.now() - ATS_RETENTION_MS)
  await db.delete(atsJobs).where(lt(atsJobs.createdAt, threshold))
  await db.delete(atsQueryCaches).where(lt(atsQueryCaches.lastRefreshedAt, threshold))
}

function normalizeCompanies(companies: string[]): string[] {
  return (companies.length > 0 ? companies : defaultATSCompanies)
    .map(normalizeText)
    .filter(Boolean)
    .sort()
}

function buildQueryKey(queryText: string, location: string, companies: string[], minSalary: number): string {
  const normalized = JSON.stringify({
    queryText: normalizeText(queryText),
    location: normalizeText(location),
    companies: normalizeCompanies(companies),
    minSalary,
  })
  return createHash('sha256').update(normalized).digest('hex')
}

function buildATSCacheConditions(jobTitle: string, location: string, companies: string[], minSalary: number): SQL[] {
  const normalizedTitle = normalizeText(jobTitle)
  const normalizedLocation = normalizeText(location)
  const organizations = normalizeCompanies(companies)

  const conditions: SQL[] = []
  if (normalizedTitle) conditions.push(sql`${atsJobs.titleSearch} ILIKE ${`%${normalizedTitle}%`}`)
  if (normalizedLocation) {
    if (location.toLowerCase().includes('remote')) {
      conditions.push(sql`${atsJobs.locationSearch} ILIKE ${'%remote%'}`)
    } else {
      conditions.push(sql`${atsJobs.locationSearch} ILIKE ${`%${normalizedLocation}%`}`)
    }
  }
  if (organizations.length > 0) {
    conditions.push(or(...organizations.map((company) => sql`${atsJobs.companySearch} ILIKE ${`%${company}%`}`)))
  }
  if (minSalary > 0) {
    conditions.push(sql`(${atsJobs.salaryMin} IS NULL OR ${atsJobs.salaryMin} >= ${minSalary})`)
  }
  return conditions
}

async function getATSQueryCache(queryText: string, location: string, companies: string[], minSalary: number) {
  const queryKey = buildQueryKey(queryText, location, companies, minSalary)
  const [row] = await db.select().from(atsQueryCaches).where(eq(atsQueryCaches.queryKey, queryKey))
  return row ?? null
}

async function upsertATSQueryCache(queryText: string, location: string, companies: string[], minSalary: number): Promise<void> {
  const queryKey = buildQueryKey(queryText, location, companies, minSalary)
  const companyList = normalizeCompanies(companies).join(',')

  await db.insert(atsQueryCaches).values({
    queryKey,
    queryText,
    location,
    companies: companyList,
    lastRefreshedAt: new Date(),
  }).onConflictDoUpdate({
    target: atsQueryCaches.queryKey,
    set: {
      queryText,
      location,
      companies: companyList,
      lastRefreshedAt: new Date(),
    },
  })
}

async function fetchStoredATSJobs(jobTitle: string, location: string, companies: string[], minSalary: number): Promise<NormalisedJob[]> {
  const conditions = buildATSCacheConditions(jobTitle, location, companies, minSalary)

  const rows = await (conditions.length > 0
    ? db.select().from(atsJobs).where(and(...conditions)).orderBy(desc(atsJobs.createdAt)).limit(20)
    : db.select().from(atsJobs).orderBy(desc(atsJobs.createdAt)).limit(20))

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    company: row.company,
    location: row.location,
    applyUrl: row.applyUrl,
    salaryMin: row.salaryMin ?? undefined,
    salaryMax: row.salaryMax ?? undefined,
    description: row.description ?? undefined,
    postedAt: row.postedAt,
    source: row.source,
  }))
}

async function persistATSJobs(jobs: NormalisedJob[]): Promise<void> {
  for (const job of jobs) {
    await db.insert(atsJobs).values({
      source: job.source,
      externalId: job.id,
      applyUrl: job.applyUrl,
      title: job.title,
      company: job.company,
      location: job.location,
      salaryMin: job.salaryMin ?? null,
      salaryMax: job.salaryMax ?? null,
      description: job.description ?? null,
      postedAt: job.postedAt,
      metadata: { source: job.source },
      titleSearch: normalizeText(job.title),
      companySearch: normalizeText(job.company),
      locationSearch: normalizeText(job.location),
    }).onConflictDoUpdate({
      target: atsJobs.applyUrl,
      set: {
        source: job.source,
        externalId: job.id,
        title: job.title,
        company: job.company,
        location: job.location,
        salaryMin: job.salaryMin ?? null,
        salaryMax: job.salaryMax ?? null,
        description: job.description ?? null,
        postedAt: job.postedAt,
        metadata: { source: job.source },
        titleSearch: normalizeText(job.title),
        companySearch: normalizeText(job.company),
        locationSearch: normalizeText(job.location),
      },
    })
  }
}

async function fetchLeverJobs(jobTitle: string, location: string, minSalary: number, companies: string[]): Promise<NormalisedJob[]> {
  const query = normalizeText(jobTitle)
  const isRemote = location.includes('remote')
  const results: NormalisedJob[] = []

  const promises = companies.map(async (company) => {
    const url = `https://api.lever.co/v0/postings/${company}?mode=json`
    const res = await fetch(url, { headers: { 'User-Agent': 'skove-agent/1.0' } })
    if (!res.ok) return []
    const data = await res.json() as Array<Record<string, any>>

    return data
      .filter((job) => {
        const title = normalizeText(job.text)
        const locationText = normalizeText(job.categories?.location)
        const salary = job.salary_min ?? job.salaryMin ?? null
        const meetsSalary = salary == null || salary >= minSalary
        return matchText(title, query) && matchLocation(locationText, location, isRemote) && meetsSalary
      })
      .slice(0, 6)
      .map((job) => ({
        id: `lever-${company}-${job.id}`,
        title: job.text,
        company: company.charAt(0).toUpperCase() + company.slice(1),
        location: job.categories?.location ?? 'Remote',
        applyUrl: job.hostedUrl ?? `https://jobs.lever.co/${company}/${job.id}`,
        salaryMin: undefined,
        salaryMax: undefined,
        description: job.description || job.notes,
        postedAt: job.postedAt || new Date().toISOString(),
        source: 'Lever ATS',
      }))
  })

  const settled = await Promise.allSettled(promises)
  settled.forEach((item) => {
    if (item.status === 'fulfilled') results.push(...item.value)
  })
  return results
}

async function fetchGreenhouseJobs(jobTitle: string, location: string, minSalary: number, companies: string[]): Promise<NormalisedJob[]> {
  const query = normalizeText(jobTitle)
  const isRemote = location.includes('remote')
  const results: NormalisedJob[] = []

  const promises = companies.map(async (company) => {
    const url = `https://boards-api.greenhouse.io/v1/boards/${company}/jobs?content=true`
    const res = await fetch(url, { headers: { 'User-Agent': 'skove-agent/1.0' } })
    if (!res.ok) return []
    const data = await res.json() as { jobs?: Array<Record<string, any>> }

    return (data.jobs ?? [])
      .filter((job) => {
        const title = normalizeText(job.title)
        const locationText = normalizeText(job.location?.name)
        const salary = job.salary_min ?? job.salaryMin ?? null
        const meetsSalary = salary == null || salary >= minSalary
        return matchText(title, query) && matchLocation(locationText, location, isRemote) && meetsSalary
      })
      .slice(0, 6)
      .map((job) => ({
        id: `greenhouse-${company}-${job.id}`,
        title: job.title,
        company: company.charAt(0).toUpperCase() + company.slice(1),
        location: job.location?.name ?? 'Remote',
        applyUrl: `https://boards.greenhouse.io/${company}/jobs/${job.id}`,
        salaryMin: undefined,
        salaryMax: undefined,
        description: job.contents,
        postedAt: job.updated_at || new Date().toISOString(),
        source: 'Greenhouse ATS',
      }))
  })

  const settled = await Promise.allSettled(promises)
  settled.forEach((item) => {
    if (item.status === 'fulfilled') results.push(...item.value)
  })
  return results
}

async function fetchAshbyJobs(jobTitle: string, location: string, minSalary: number, companies: string[]): Promise<NormalisedJob[]> {
  const query = normalizeText(jobTitle)
  const isRemote = location.includes('remote')
  const results: NormalisedJob[] = []
  const apiKey = process.env.ASHBY_API_KEY
  const baseUrl = process.env.ASHBY_API_URL ?? 'https://api.ashbyhq.com/v1'

  const promises = companies.map(async (company) => {
    let data: Array<Record<string, any>> = []
    if (apiKey) {
      const url = `${baseUrl}/companies/${company}/jobs`
      const res = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}`, 'User-Agent': 'skove-agent/1.0' } })
      if (!res.ok) return []
      const json = await res.json()
      data = json.data ?? json.jobs ?? json.results ?? []
    } else {
      const url = `https://boards.ashbyhq.com/${company}/jobs.json`
      const res = await fetch(url, { headers: { 'User-Agent': 'skove-agent/1.0' } })
      if (!res.ok) return []
      const json = await res.json()
      data = json.jobs ?? json.results ?? json
    }

    return data
      .filter((job) => {
        const title = normalizeText(job.title ?? job.text ?? job.name)
        const locationText = normalizeText(job.location?.name ?? job.location)
        const salary = job.salaryMin ?? job.salary_min ?? null
        const meetsSalary = salary == null || salary >= minSalary
        return matchText(title, query) && matchLocation(locationText, location, isRemote) && meetsSalary
      })
      .slice(0, 6)
      .map((job) => ({
        id: `ashby-${company}-${job.id ?? job.uuid ?? Math.random()}`,
        title: job.title ?? job.text ?? job.name,
        company: company.charAt(0).toUpperCase() + company.slice(1),
        location: job.location?.name ?? job.location ?? 'Remote',
        applyUrl: job.applyUrl ?? job.url ?? job.hostedUrl ?? `https://boards.ashbyhq.com/${company}`,
        salaryMin: job.salaryMin ?? job.salary_min,
        salaryMax: job.salaryMax ?? job.salary_max,
        description: job.description ?? job.notes,
        postedAt: job.updatedAt || job.postedAt || job.createdAt || new Date().toISOString(),
        source: 'Ashby ATS',
      }))
  })

  const settled = await Promise.allSettled(promises)
  settled.forEach((item) => {
    if (item.status === 'fulfilled') results.push(...item.value)
  })
  return results
}

async function fetchATSJobs(jobTitle: string, location: string, minSalary: number, companies: string[]): Promise<NormalisedJob[]> {
  const organizations = companies.length > 0 ? companies : defaultATSCompanies
  const [leverResults, greenhouseResults, ashbyResults] = await Promise.all([
    fetchLeverJobs(jobTitle, location, minSalary, organizations),
    fetchGreenhouseJobs(jobTitle, location, minSalary, organizations),
    fetchAshbyJobs(jobTitle, location, minSalary, organizations),
  ])

  const results = [...leverResults, ...greenhouseResults, ...ashbyResults].slice(0, 20)
  if (results.length > 0) {
    await persistATSJobs(results)
  }
  return results
}

// ── Main runner ───────────────────────────────────────────────────────────────

export async function runJobApplicationTracker(
  config: Record<string, unknown>,
  ctx: RunnerContext
): Promise<AgentRunResult[]> {
  const c = config as JobTrackerConfig
  const jobTitle = String(c.jobTitle || 'Software Engineer')
  const location = String(c.location || 'Remote')
  const minSalary = Number(c.minSalary) || 0
  const keywords = c.keywords ? String(c.keywords) : ''
  const atsCompanies = c.atsCompanies ? String(c.atsCompanies).split(',').map((company) => company.trim()).filter(Boolean) : []
  const atsFirstOnly = Boolean(c.atsFirstOnly)
  const matchThreshold = Number(c.matchThreshold) || 7

  // Fetch user resume
  const [user] = await db.select({ resumeText: users.resumeText }).from(users).where(eq(users.id, ctx.userId))
  const resumeText = user?.resumeText ?? null

  await cleanupOldATSCache()

  const isRemote = location.toLowerCase().includes('remote')
  const what = [jobTitle, keywords].filter(Boolean).join(' ')
  const where = isRemote ? 'remote' : location

  const cacheRow = await getATSQueryCache(what, where, atsCompanies, minSalary)
  let jobs: NormalisedJob[] = []

  if (cacheRow) {
    const ageMs = Date.now() - new Date(cacheRow.lastRefreshedAt).getTime()
    const isFresh = ageMs < ATS_REFRESH_MS

    jobs = await fetchStoredATSJobs(what, where, atsCompanies, minSalary)
    log.info('job-tracker', 'ats db cache hit', { count: jobs.length, companies: atsCompanies.length ? atsCompanies : defaultATSCompanies, atsFirstOnly, ageMs, isFresh })

    if (!isFresh || jobs.length === 0) {
      const externalJobs = await fetchATSJobs(what, where, minSalary, atsCompanies)
      await upsertATSQueryCache(what, where, atsCompanies, minSalary)
      log.info('job-tracker', 'ats refresh fetch complete', { count: externalJobs.length, companies: atsCompanies.length ? atsCompanies : defaultATSCompanies, atsFirstOnly, ageMs })

      jobs = await fetchStoredATSJobs(what, where, atsCompanies, minSalary)
      if (jobs.length === 0) {
        jobs = externalJobs
        log.info('job-tracker', 'ats refresh yielded no db rows, using fetched jobs', { count: jobs.length })
      }
    }
  } else {
    const externalJobs = await fetchATSJobs(what, where, minSalary, atsCompanies)
    await upsertATSQueryCache(what, where, atsCompanies, minSalary)
    log.info('job-tracker', 'ats fetch on cache miss complete', { count: externalJobs.length, companies: atsCompanies.length ? atsCompanies : defaultATSCompanies, atsFirstOnly })
    jobs = externalJobs
  }

  if (!atsFirstOnly) {
    if (jobs.length === 0) {
      jobs = await fetchAdzuna(what, where, minSalary)
      log.info('job-tracker', 'adzuna fetch complete', { count: jobs.length })
    }

    if (jobs.length === 0) {
      jobs = await fetchJSearch(`${jobTitle} ${isRemote ? 'remote' : location}`)
      log.info('job-tracker', 'jsearch fallback complete', { count: jobs.length })
    }

    if (jobs.length === 0 && isRemote) {
      jobs = await fetchRemoteOK(jobTitle)
      log.info('job-tracker', 'remoteok fallback complete', { count: jobs.length })
    }
  } else {
    log.info('job-tracker', 'ats-first-only mode active', { total: jobs.length })
  }

  log.info('job-tracker', 'jobs fetched', { total: jobs.length, hasResume: Boolean(resumeText), threshold: matchThreshold, userId: ctx.userId })

  const results: AgentRunResult[] = []

  for (const job of jobs.slice(0, 8)) {
    const jobKey = job.applyUrl ?? `${job.title} @ ${job.company}`

    if (ctx.seenKeys.has(jobKey)) {
      log.info('job-tracker', 'skipping seen job', { title: job.title, company: job.company, userId: ctx.userId })
      continue
    }

    const salary = formatSalary(job.salaryMin, job.salaryMax)
    const baseResult: AgentRunResult = {
      title: `${job.title} @ ${job.company}`,
      value: salary,
      url: job.applyUrl,
      metadata: {
        company: job.company,
        jobTitle: job.title,
        location: job.location,
        salary,
        postedLabel: postedLabel(job.postedAt),
        source: job.source,
        agentType: 'job-application-tracker',
      },
    }

    if (resumeText) {
      log.info('job-tracker', 'scoring with claude', { title: job.title, company: job.company, userId: ctx.userId })
      try {
        const match = await scoreJobMatch(resumeText, {
          title: job.title,
          company: job.company,
          location: job.location,
          description: job.description,
          salary,
        })
        log.info('job-tracker', 'claude score', { title: job.title, company: job.company, score: match.score, threshold: matchThreshold, userId: ctx.userId })

        if (match.score >= matchThreshold) {
          let tailoredResumeText: string | undefined
          try {
            const tailored = await tailorResume(resumeText, {
              title: job.title, company: job.company,
              location: job.location, description: job.description, salary,
            })
            tailoredResumeText = tailored.tailoredText
            log.info('job-tracker', 'resume tailored', { title: job.title, company: job.company, userId: ctx.userId })
          } catch (err) {
            log.error('job-tracker', 'resume tailoring failed', err, { jobId: job.id })
          }
          results.push({
            ...baseResult,
            metadata: {
              ...baseResult.metadata,
              matchScore: match.score,
              matchReasoning: match.reasoning,
              coverLetter: match.coverLetter,
              tailoredResumeText,
            },
          })
        }
      } catch (err) {
        log.error('job-tracker', 'claude scoring failed', err, { jobId: job.id, title: job.title, userId: ctx.userId })
        results.push(baseResult)
      }
    } else {
      results.push(baseResult)
    }
  }

  return results
}
