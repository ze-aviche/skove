import { AgentRunResult } from './flight-watcher.js'
import { RunnerContext } from './index.js'
import { scoreJobMatch, tailorResume } from '../../lib/claude.js'
import { db } from '../../db/index.js'
import { users, atsJobs, atsQueryCaches, atsCompanies, agentResults } from '../../db/schema.js'
import { and, desc, eq, lt, or, sql, SQL } from 'drizzle-orm'
import { createHash } from 'crypto'
import { log } from '../../lib/logger.js'

interface JobTrackerConfig {
  jobTitle?: string
  location?: string
  minSalary?: number | string
  keywords?: string
  atsCompanies?: string
  atsFirstOnly?: boolean
  matchThreshold?: number | string
}

type ATSProviderType = 'lever' | 'greenhouse' | 'ashby' | 'custom'

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

const ATS_REFRESH_MS = 1000 * 60 * 60 // 1 hour
const ATS_RETENTION_MS = 1000 * 60 * 60 * 24 * 14 // 14 days

const defaultATSCompanies = [
  'amazon',
  'google',
  'microsoft',
  'meta',
  'apple',
  'salesforce',
  'uber',
  'airbnb',
  'stripe',
  'twitter',
]

const providerCompanyAliases: Record<string, Record<'lever' | 'greenhouse' | 'ashby', string>> = {
  facebook: { lever: 'meta', greenhouse: 'meta', ashby: 'meta' },
  meta: { lever: 'meta', greenhouse: 'meta', ashby: 'meta' },
}

function normalizeText(value?: string) {
  return String(value ?? '').trim().toLowerCase()
}

function displayCompanyName(company: string) {
  const normalized = normalizeText(company)
  if (normalized === 'meta') return 'Meta'
  return normalized
    .split(/[-\s]+/)
    .map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1))
    .join(' ')
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

function buildQueryKey(queryText: string, location: string, companies: string[], minSalary: number): string {
  const normalized = JSON.stringify({
    queryText: normalizeText(queryText),
    location: normalizeText(location),
    companies: normalizeCompanies(companies),
    minSalary,
  })
  return createHash('sha256').update(normalized).digest('hex')
}

function normalizeCompanies(companies: string[]) {
  return Array.from(new Set((companies.length > 0 ? companies : defaultATSCompanies).map(normalizeText))).sort()
}

async function cleanupOldATSCache(): Promise<void> {
  const threshold = new Date(Date.now() - ATS_RETENTION_MS)
  await db.delete(atsJobs).where(lt(atsJobs.createdAt, threshold))
  await db.delete(atsQueryCaches).where(lt(atsQueryCaches.lastRefreshedAt, threshold))
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

async function fetchATSCompanyRows(requestedCompanies: string[]) {
  const normalizedRequested = requestedCompanies.map(normalizeText).filter(Boolean)
  const rows = await db.select().from(atsCompanies).where(eq(atsCompanies.isEnabled, true))
  if (normalizedRequested.length === 0) return rows
  return rows.filter((row) => normalizedRequested.includes(normalizeText(row.name)) || normalizedRequested.includes(normalizeText(row.atsIdentifier)))
}

type ATSCompanyRow = {
  id: string
  name: string
  careersUrl?: string | null
  atsType: string
  atsIdentifier: string
}

function getRawRowFromName(company: string, als?: ATSProviderType): ATSCompanyRow {
  return {
    id: company,
    name: company,
    atsType: als ?? 'lever',
    atsIdentifier: getProviderCompanySlug(company, 'lever'),
    careersUrl: null,
  }
}

function getProviderCompanySlug(company: string, provider: 'lever' | 'greenhouse' | 'ashby') {
  const normalized = normalizeText(company)
  return providerCompanyAliases[normalized]?.[provider] ?? normalized
}

async function fetchLeverJobs(jobTitle: string, location: string, minSalary: number, companies: Array<{ name: string; atsIdentifier: string; careersUrl?: string }>): Promise<NormalisedJob[]> {
  const query = normalizeText(jobTitle)
  const isRemote = location.includes('remote')
  const results: NormalisedJob[] = []

  const promises = companies.map(async (company) => {
    const baseUrlForSlug = (slug: string) => `https://api.lever.co/v0/postings/${slug}?mode=json`

    async function tryFetchForSlug(slug: string) {
      const url = baseUrlForSlug(slug)
      try {
        const res = await fetch(url, { headers: { 'User-Agent': 'skove-agent/1.0' } })
        if (!res.ok) return { ok: false, status: res.status, url }
        const data = await res.json() as Array<Record<string, any>>
        return { ok: true, data, url }
      } catch (err) {
        return { ok: false, err, url: baseUrlForSlug(slug) }
      }
    }

    // Attempt initial fetch with stored atsIdentifier
    let attempt = await tryFetchForSlug(company.atsIdentifier)
    if (!attempt.ok) {
      const candidates: string[] = []
      // slug from careersUrl (last path segment) — preserve original case; Lever slugs are case-sensitive
      if (company.careersUrl) {
        try {
          const parsed = new URL(String(company.careersUrl))
          const parts = parsed.pathname.split('/').filter(Boolean)
          if (parts.length > 0) {
            const rawSlug = parts[parts.length - 1]
            candidates.push(rawSlug)
            candidates.push(rawSlug.toLowerCase())
          }
        } catch (_e) {
          // ignore invalid careers URL
        }
      }
      // normalized name and dashed name
      candidates.push(normalizeText(company.name))
      candidates.push(normalizeText(company.name).replace(/\s+/g, '-'))

      // deduplicate and skip slugs already tried
      const uniqueCandidates = Array.from(new Set(candidates)).filter((c) => c !== company.atsIdentifier)

      for (const cand of uniqueCandidates) {
        const candAttempt = await tryFetchForSlug(cand)
        if (candAttempt.ok) {
          attempt = candAttempt
          break
        }
      }

      if (!attempt.ok) {
        log.warn('job-tracker', 'lever fetch failed for all slugs', {
          company: company.name,
          triedSlugs: [company.atsIdentifier, ...uniqueCandidates],
          status: attempt.status,
        })
      }
    }

    if (!attempt.ok) return []

    const data = attempt.data as Array<Record<string, any>>
    const filtered = (data ?? [])
      .filter((job) => {
        const title = normalizeText(job.text)
        const locationText = normalizeText(job.categories?.location)
        const salary = job.salary_min ?? job.salaryMin ?? null
        const meetsSalary = salary == null || salary >= minSalary
        return matchText(title, query) && matchLocation(locationText, location, isRemote) && meetsSalary
      })
      .slice(0, 6)

    return filtered.map((job) => ({
      id: `lever-${company.atsIdentifier}-${job.id}`,
      title: job.text,
      company: displayCompanyName(company.name),
      location: job.categories?.location ?? 'Remote',
      applyUrl: job.hostedUrl ?? `https://jobs.lever.co/${company.atsIdentifier}/${job.id}`,
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

async function fetchGreenhouseJobs(jobTitle: string, location: string, minSalary: number, companies: Array<{ name: string; atsIdentifier: string }>): Promise<NormalisedJob[]> {
  const query = normalizeText(jobTitle)
  const isRemote = location.includes('remote')
  const results: NormalisedJob[] = []

  const promises = companies.map(async (company) => {
    const url = `https://boards-api.greenhouse.io/v1/boards/${company.atsIdentifier}/jobs?content=true`
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'skove-agent/1.0' } })
      if (!res.ok) {
        log.warn('job-tracker', 'greenhouse fetch failed', { company: company.name, providerId: company.atsIdentifier, status: res.status, url })
        return []
      }
      const data = await res.json() as { jobs?: Array<Record<string, any>> }
      const filtered = (data.jobs ?? [])
        .filter((job) => {
          const title = normalizeText(job.title)
          const locationText = normalizeText(job.location?.name)
          const salary = job.salary_min ?? job.salaryMin ?? null
          const meetsSalary = salary == null || salary >= minSalary
          return matchText(title, query) && matchLocation(locationText, location, isRemote) && meetsSalary
        })
        .slice(0, 6)

      return filtered.map((job) => ({
        id: `greenhouse-${company.atsIdentifier}-${job.id}`,
        title: job.title,
        company: displayCompanyName(company.name),
        location: job.location?.name ?? 'Remote',
        applyUrl: `https://boards.greenhouse.io/${company.atsIdentifier}/jobs/${job.id}`,
        salaryMin: undefined,
        salaryMax: undefined,
        description: job.contents,
        postedAt: job.updated_at || new Date().toISOString(),
        source: 'Greenhouse ATS',
      }))
    } catch (err) {
      log.error('job-tracker', 'greenhouse fetch error', err, { company: company.name, providerId: company.atsIdentifier, url })
      return []
    }
  })

  const settled = await Promise.allSettled(promises)
  settled.forEach((item) => {
    if (item.status === 'fulfilled') results.push(...item.value)
  })
  return results
}

async function fetchAshbyJobs(jobTitle: string, location: string, minSalary: number, companies: Array<{ name: string; atsIdentifier: string }>): Promise<NormalisedJob[]> {
  const query = normalizeText(jobTitle)
  const isRemote = location.includes('remote')
  const results: NormalisedJob[] = []
  const apiKey = process.env.ASHBY_API_KEY
  const baseUrl = process.env.ASHBY_API_URL ?? 'https://api.ashbyhq.com/v1'

  const promises = companies.map(async (company) => {
    const url = apiKey
      ? `${baseUrl}/companies/${company.atsIdentifier}/jobs`
      : `https://boards.ashbyhq.com/${company.atsIdentifier}/jobs.json`
    try {
      const res = await fetch(url, {
        headers: apiKey
          ? { Authorization: `Bearer ${apiKey}`, 'User-Agent': 'skove-agent/1.0' }
          : { 'User-Agent': 'skove-agent/1.0' },
      })
      if (!res.ok) {
        log.warn('job-tracker', 'ashby fetch failed', { company: company.name, providerId: company.atsIdentifier, status: res.status, url })
        return []
      }
      const json = await res.json()
      const data = json.data ?? json.jobs ?? json.results ?? json
      const filtered = (data ?? [])
        .filter((job: any) => {
          const title = normalizeText(job.title ?? job.text ?? job.name)
          const locationText = normalizeText(job.location?.name ?? job.location)
          const salary = job.salaryMin ?? job.salary_min ?? null
          const meetsSalary = salary == null || salary >= minSalary
          return matchText(title, query) && matchLocation(locationText, location, isRemote) && meetsSalary
        })
        .slice(0, 6)

      return filtered.map((job: any) => ({
        id: `ashby-${company.atsIdentifier}-${job.id ?? job.uuid ?? Math.random()}`,
        title: job.title ?? job.text ?? job.name,
        company: displayCompanyName(company.name),
        location: job.location?.name ?? job.location ?? 'Remote',
        applyUrl: job.applyUrl ?? job.url ?? job.hostedUrl ?? `https://boards.ashbyhq.com/${company.atsIdentifier}`,
        salaryMin: job.salaryMin ?? job.salary_min,
        salaryMax: job.salaryMax ?? job.salary_max,
        description: job.description ?? job.notes,
        postedAt: job.updatedAt || job.postedAt || job.createdAt || new Date().toISOString(),
        source: 'Ashby ATS',
      }))
    } catch (err) {
      log.error('job-tracker', 'ashby fetch error', err, { company: company.name, providerId: company.atsIdentifier, url })
      return []
    }
  })

  const settled = await Promise.allSettled(promises)
  settled.forEach((item) => {
    if (item.status === 'fulfilled') results.push(...item.value)
  })
  return results
}

function inferAtsTypeFromUrl(careersUrl: string | null | undefined, currentType: string): string {
  if (!careersUrl) return currentType
  const url = careersUrl.toLowerCase()
  if (url.includes('greenhouse.io')) return 'greenhouse'
  if (url.includes('lever.co')) return 'lever'
  if (url.includes('ashbyhq.com') || url.includes('boards.ashby.io')) return 'ashby'
  return currentType
}

async function fetchATSJobsForCompanyRows(jobTitle: string, location: string, minSalary: number, rows: ATSCompanyRow[]): Promise<NormalisedJob[]> {
  const resolvedRows = rows.map((row) => {
    const resolvedType = inferAtsTypeFromUrl(row.careersUrl, row.atsType)
    if (resolvedType !== row.atsType) {
      log.warn('job-tracker', 'ats type mismatch: careersUrl implies different provider than stored atsType', {
        company: row.name,
        storedType: row.atsType,
        inferredType: resolvedType,
        careersUrl: row.careersUrl,
      })
    }
    return { ...row, atsType: resolvedType }
  })

  const leverCompanies = resolvedRows.filter((row) => row.atsType === 'lever').map((row) => ({ name: row.name, atsIdentifier: row.atsIdentifier, careersUrl: row.careersUrl }))
  const greenhouseCompanies = resolvedRows.filter((row) => row.atsType === 'greenhouse').map((row) => ({ name: row.name, atsIdentifier: row.atsIdentifier }))
  const ashbyCompanies = resolvedRows.filter((row) => row.atsType === 'ashby').map((row) => ({ name: row.name, atsIdentifier: row.atsIdentifier }))

  const results: NormalisedJob[] = []
  // Load vendored scrapers dynamically at runtime (avoids TS resolution issues)
  let vendor: any = null
  try {
    // @ts-ignore - dynamic import of vendored scrapers package (may not be on TS path)
    vendor = await import(new URL('../../../../../packages/scrapers/src/index.ts', import.meta.url))
  } catch (err) {
    log.warn('job-tracker', 'failed to load vendored scrapers, falling back to local fetchers', { err })
  }

  if (leverCompanies.length > 0) {
    if (vendor?.fetchLeverJobs) {
      results.push(...await vendor.fetchLeverJobs(jobTitle, location, minSalary, leverCompanies))
    } else {
      results.push(...await fetchLeverJobs(jobTitle, location, minSalary, leverCompanies))
    }
  }
  if (greenhouseCompanies.length > 0) {
    if (vendor?.fetchGreenhouseJobs) {
      results.push(...await vendor.fetchGreenhouseJobs(jobTitle, location, minSalary, greenhouseCompanies))
    } else {
      results.push(...await fetchGreenhouseJobs(jobTitle, location, minSalary, greenhouseCompanies))
    }
  }
  if (ashbyCompanies.length > 0) {
    if (vendor?.fetchAshbyJobs) {
      results.push(...await vendor.fetchAshbyJobs(jobTitle, location, minSalary, ashbyCompanies))
    } else {
      results.push(...await fetchAshbyJobs(jobTitle, location, minSalary, ashbyCompanies))
    }
  }
  return results.slice(0, 20)
}

async function fetchATSJobsLegacy(jobTitle: string, location: string, minSalary: number, companies: string[]): Promise<NormalisedJob[]> {
  const rawAccounts = companies.map((company) => ({
    name: company,
    atsIdentifier: getProviderCompanySlug(company, 'lever'),
  }))
  const [leverResults, greenhouseResults, ashbyResults] = await Promise.all([
    fetchLeverJobs(jobTitle, location, minSalary, rawAccounts),
    fetchGreenhouseJobs(jobTitle, location, minSalary, rawAccounts),
    fetchAshbyJobs(jobTitle, location, minSalary, rawAccounts),
  ])

  return [...leverResults, ...greenhouseResults, ...ashbyResults].slice(0, 20)
}

async function persistATSJobs(jobs: NormalisedJob[]): Promise<void> {
  if (jobs.length === 0) return

  const now = new Date()
  const rows = jobs.map((job) => ({
    source: job.source,
    externalId: job.id,
    applyUrl: job.applyUrl,
    title: job.title,
    company: job.company,
    location: job.location,
    salaryMin: job.salaryMin,
    salaryMax: job.salaryMax,
    description: job.description,
    postedAt: job.postedAt,
    metadata: { source: job.source },
    titleSearch: normalizeText(job.title),
    companySearch: normalizeText(job.company),
    locationSearch: normalizeText(job.location),
    createdAt: now,
  }))

  await db.insert(atsJobs).values(rows).onConflictDoNothing({ target: atsJobs.applyUrl })
}

async function fetchStoredATSJobs(queryText: string, location: string, companies: string[], minSalary: number): Promise<NormalisedJob[]> {
  const searchText = `%${normalizeText(queryText)}%`
  const locationText = `%${normalizeText(location)}%`

  const rows = await db.select().from(atsJobs).where(
    and(
      sql`${atsJobs.titleSearch} like ${searchText}`,
      sql`${atsJobs.locationSearch} like ${locationText}`
    )
  )

  return rows
    .filter((job) => {
      if (minSalary > 0 && job.salaryMin != null && job.salaryMin < minSalary) {
        return false
      }
      if (companies.length === 0) return true
      const normalizedCompanies = normalizeCompanies(companies)
      return normalizedCompanies.some((company) => normalizeText(job.company).includes(company))
    })
    .map((job) => ({
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

async function fetchATSJobs(jobTitle: string, location: string, minSalary: number, requestedCompanies: string[]): Promise<NormalisedJob[]> {
  const companyRows = await fetchATSCompanyRows(requestedCompanies)
  if (companyRows.length > 0) {
    return fetchATSJobsForCompanyRows(jobTitle, location, minSalary, companyRows)
  }

  const fallbackCompanies = requestedCompanies.length > 0 ? requestedCompanies : defaultATSCompanies
  if (requestedCompanies.length > 0) {
    log.warn('job-tracker', 'no ats company DB records found, falling back to raw company names', { requestedCompanies })
  }
  return fetchATSJobsLegacy(jobTitle, location, minSalary, fallbackCompanies)
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
  const atsCompanies = c.atsCompanies ? String(c.atsCompanies).split(',').map(normalizeText).filter(Boolean) : []
  const atsFirstOnly = Boolean(c.atsFirstOnly)
  const matchThreshold = Number(c.matchThreshold) || 7

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
      await persistATSJobs(externalJobs)
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
    await persistATSJobs(externalJobs)
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

  // Fetch previously delivered result URLs for this user so we don't resend them.
  const deliveredRows = await db.select({ url: agentResults.url }).from(agentResults).where(eq(agentResults.userId, ctx.userId))
  const deliveredSet = new Set(deliveredRows.map((r: any) => r.url))

  const results: AgentRunResult[] = []

  for (const job of jobs.slice(0, 8)) {
    const jobKey = job.applyUrl ?? `${job.title} @ ${job.company}`

    if (ctx.seenKeys.has(jobKey)) {
      log.info('job-tracker', 'skipping seen job', { title: job.title, company: job.company, userId: ctx.userId })
      continue
    }

    if (deliveredSet.has(job.applyUrl)) {
      log.info('job-tracker', 'skipping previously delivered job', { title: job.title, company: job.company, url: job.applyUrl, userId: ctx.userId })
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
