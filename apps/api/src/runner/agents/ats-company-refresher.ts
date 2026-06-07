import { db } from '../../db/index.js'
import { atsCompanies, atsJobs } from '../../db/schema.js'
import { eq, lt, sql } from 'drizzle-orm'
import { log } from '../../lib/logger.js'

const BATCH_SIZE = 200
const CONCURRENCY_PER_PROVIDER = 5 // max simultaneous requests to any single ATS provider
const RETENTION_MS = 1000 * 60 * 60 * 24 * 14 // 14 days
const FETCH_TIMEOUT_MS = 15_000

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

function inferAtsTypeFromUrl(careersUrl: string | null | undefined, currentType: string): string {
  if (!careersUrl) return currentType
  const url = careersUrl.toLowerCase()
  if (url.includes('greenhouse.io')) return 'greenhouse'
  if (url.includes('lever.co')) return 'lever'
  if (url.includes('ashbyhq.com') || url.includes('boards.ashby.io')) return 'ashby'
  if (url.includes('myworkdayjobs.com')) return 'workday'
  return currentType
}

async function fetchLeverCompanyJobs(company: {
  id: string
  name: string
  atsIdentifier: string
  careersUrl: string | null
}): Promise<NormalisedJob[]> {
  async function trySlug(slug: string): Promise<Array<Record<string, any>> | null> {
    const url = `https://api.lever.co/v0/postings/${slug}?mode=json`
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'skove-agent/1.0' },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      })
      if (!res.ok) return null
      return await res.json() as Array<Record<string, any>>
    } catch {
      return null
    }
  }

  log.info('ats-refresher', 'lever: fetching', { company: company.name, slug: company.atsIdentifier })
  let usedSlug = company.atsIdentifier
  let data = await trySlug(company.atsIdentifier)

  if (!data) {
    const candidates: string[] = []
    if (company.careersUrl) {
      try {
        const parsed = new URL(company.careersUrl)
        const parts = parsed.pathname.split('/').filter(Boolean)
        if (parts.length > 0) {
          const rawSlug = parts[parts.length - 1]
          candidates.push(rawSlug)
          const lower = rawSlug.toLowerCase()
          if (lower !== company.atsIdentifier) candidates.push(lower)
        }
      } catch {}
    }
    candidates.push(normalizeText(company.name))
    candidates.push(normalizeText(company.name).replace(/\s+/g, '-'))

    const uniqueCandidates = Array.from(new Set(candidates)).filter((c) => c !== company.atsIdentifier)
    for (const slug of uniqueCandidates) {
      data = await trySlug(slug)
      if (data) { usedSlug = slug; break }
    }

    if (!data) {
      log.warn('ats-refresher', 'lever: all slugs failed', {
        company: company.name,
        triedSlugs: [company.atsIdentifier, ...uniqueCandidates],
      })
      return []
    }
  }

  const jobs = data
    .filter((job) => job.text && job.id)
    .map((job) => ({
      id: `lever-${company.atsIdentifier}-${job.id}`,
      title: job.text,
      company: company.name,
      location: job.categories?.location ?? 'Remote',
      applyUrl: job.hostedUrl ?? `https://jobs.lever.co/${company.atsIdentifier}/${job.id}`,
      description: job.description || job.notes,
      postedAt: job.postedAt || new Date().toISOString(),
      source: 'Lever ATS',
    }))

  log.info('ats-refresher', 'lever: done', { company: company.name, slug: usedSlug, jobs: jobs.length })
  return jobs
}

async function fetchGreenhouseCompanyJobs(company: {
  name: string
  atsIdentifier: string
}): Promise<NormalisedJob[]> {
  const url = `https://boards-api.greenhouse.io/v1/boards/${company.atsIdentifier}/jobs?content=true`
  log.info('ats-refresher', 'greenhouse: fetching', { company: company.name, slug: company.atsIdentifier })
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'skove-agent/1.0' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
    if (!res.ok) {
      log.warn('ats-refresher', 'greenhouse: fetch failed', { company: company.name, slug: company.atsIdentifier, status: res.status })
      return []
    }
    const data = await res.json() as { jobs?: Array<Record<string, any>> }
    const jobs = (data.jobs ?? [])
      .filter((job) => job.title && job.id)
      .map((job) => ({
        id: `greenhouse-${company.atsIdentifier}-${job.id}`,
        title: job.title,
        company: company.name,
        location: job.location?.name ?? 'Remote',
        applyUrl: job.absolute_url ?? `https://boards.greenhouse.io/${company.atsIdentifier}/jobs/${job.id}`,
        description: job.contents,
        postedAt: job.updated_at || new Date().toISOString(),
        source: 'Greenhouse ATS',
      }))
    log.info('ats-refresher', 'greenhouse: done', { company: company.name, jobs: jobs.length })
    return jobs
  } catch (err) {
    log.warn('ats-refresher', 'greenhouse: network error', { company: company.name, slug: company.atsIdentifier, err: (err as Error).message })
    return []
  }
}

async function fetchAshbyCompanyJobs(company: {
  name: string
  atsIdentifier: string
}): Promise<NormalisedJob[]> {
  // Ashby public posting API — https://developers.ashbyhq.com/docs/public-job-posting-api
  const url = `https://api.ashbyhq.com/posting-api/job-board/${company.atsIdentifier}`
  log.info('ats-refresher', 'ashby: fetching', { company: company.name, slug: company.atsIdentifier })
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'skove-agent/1.0' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
    if (!res.ok) {
      log.warn('ats-refresher', 'ashby: fetch failed', { company: company.name, slug: company.atsIdentifier, status: res.status })
      return []
    }
    const json = await res.json() as { jobs?: Array<Record<string, any>> }
    const jobs = (json.jobs ?? [])
      .filter((job) => job.title && job.id && job.isListed !== false)
      .map((job) => ({
        id: `ashby-${company.atsIdentifier}-${job.id}`,
        title: job.title,
        company: company.name,
        location: job.location ?? (job.workplaceType === 'Remote' || job.isRemote ? 'Remote' : 'Unknown'),
        applyUrl: job.applyUrl ?? `https://jobs.ashbyhq.com/${company.atsIdentifier}/${job.id}`,
        description: job.descriptionPlain,
        postedAt: job.publishedAt || new Date().toISOString(),
        source: 'Ashby ATS',
      }))
    log.info('ats-refresher', 'ashby: done', { company: company.name, jobs: jobs.length })
    return jobs
  } catch (err) {
    log.warn('ats-refresher', 'ashby: network error', { company: company.name, slug: company.atsIdentifier, err: (err as Error).message })
    return []
  }
}

async function fetchWorkdayCompanyJobs(company: {
  name: string
  atsIdentifier: string
  careersUrl: string | null
}): Promise<NormalisedJob[]> {
  if (!company.careersUrl) {
    log.warn('ats-refresher', 'workday: no careersUrl', { company: company.name })
    return []
  }

  // Derive the CXS (Content Experience Service) search endpoint from the human-readable careers URL.
  // Input:  https://{tenant}.{instance}.myworkdayjobs.com/en-US/{board}
  // Output: https://{tenant}.{instance}.myworkdayjobs.com/wday/cxs/{tenant}/{board}/jobs
  let tenant: string
  let baseUrl: string
  let board: string
  try {
    const parsed = new URL(company.careersUrl)
    const hostParts = parsed.hostname.split('.')
    tenant = hostParts[0]
    baseUrl = `https://${parsed.hostname}`
    const pathParts = parsed.pathname.split('/').filter(Boolean)
    // pathname is /en-US/{board} or just /{board}
    board = pathParts[pathParts.length - 1]
  } catch {
    log.warn('ats-refresher', 'workday: could not parse careersUrl', { company: company.name, url: company.careersUrl })
    return []
  }

  const cxsUrl = `${baseUrl}/wday/cxs/${tenant}/${board}/jobs`
  const PAGE_SIZE = 20
  const MAX_JOBS = 200
  const jobs: NormalisedJob[] = []
  let offset = 0
  let total = Infinity

  log.info('ats-refresher', 'workday: fetching', { company: company.name, cxsUrl })

  while (offset < total && jobs.length < MAX_JOBS) {
    try {
      const res = await fetch(cxsUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'skove-agent/1.0',
        },
        body: JSON.stringify({ appliedFacets: {}, limit: PAGE_SIZE, offset, searchText: '' }),
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      })

      if (!res.ok) {
        log.warn('ats-refresher', 'workday: fetch failed', { company: company.name, status: res.status, offset })
        break
      }

      const data = await res.json() as { total?: number; jobPostings?: Array<Record<string, any>> }
      total = data.total ?? 0

      const postings = data.jobPostings ?? []
      for (const job of postings) {
        if (!job.title || !job.externalPath) continue
        const applyUrl = `${baseUrl}/en-US/${board}${job.externalPath}`
        const stableId = job.externalPath.replace(/\//g, '-').replace(/^-/, '')
        jobs.push({
          id: `workday-${tenant}-${stableId}`,
          title: job.title,
          company: company.name,
          location: job.locationsText ?? 'Unknown',
          applyUrl,
          postedAt: new Date().toISOString(),
          source: 'Workday',
        })
      }

      offset += PAGE_SIZE
      if (postings.length < PAGE_SIZE) break
    } catch (err) {
      log.warn('ats-refresher', 'workday: network error', { company: company.name, err: (err as Error).message })
      break
    }
  }

  log.info('ats-refresher', 'workday: done', { company: company.name, jobs: jobs.length, total })
  return jobs
}

async function fetchCompanyJobs(company: {
  id: string
  name: string
  atsType: string
  atsIdentifier: string
  careersUrl: string | null
}): Promise<NormalisedJob[]> {
  const resolvedType = inferAtsTypeFromUrl(company.careersUrl, company.atsType)
  if (resolvedType !== company.atsType) {
    log.info('ats-refresher', 'provider inferred from careersUrl', {
      company: company.name,
      stored: company.atsType,
      resolved: resolvedType,
    })
  }
  if (resolvedType === 'lever') return fetchLeverCompanyJobs(company)
  if (resolvedType === 'greenhouse') return fetchGreenhouseCompanyJobs(company)
  if (resolvedType === 'ashby') return fetchAshbyCompanyJobs(company)
  if (resolvedType === 'workday') return fetchWorkdayCompanyJobs(company)
  log.warn('ats-refresher', 'unsupported ats type, skipping', { company: company.name, atsType: resolvedType })
  return []
}

async function persistJobs(jobs: NormalisedJob[]): Promise<void> {
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

async function processInChunks<T>(
  items: T[],
  size: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  for (let i = 0; i < items.length; i += size) {
    await Promise.allSettled(items.slice(i, i + size).map(fn))
  }
}

function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>()
  for (const item of items) {
    const k = key(item)
    if (!map.has(k)) map.set(k, [])
    map.get(k)!.push(item)
  }
  return map
}

export async function runATSCompanyRefresher(): Promise<void> {
  log.info('ats-refresher', 'run started')

  // Clean up jobs older than 14 days
  const retentionCutoff = new Date(Date.now() - RETENTION_MS)
  const deleted = await db.delete(atsJobs).where(lt(atsJobs.createdAt, retentionCutoff)).returning({ id: atsJobs.id })
  log.info('ats-refresher', 'old jobs cleaned up', { deleted: deleted.length, cutoff: retentionCutoff })

  // Pick the BATCH_SIZE companies with oldest lastFetchedAt, secondary sort by ats_type
  // to naturally interleave providers across the batch
  const companies = await db
    .select()
    .from(atsCompanies)
    .where(eq(atsCompanies.isEnabled, true))
    .orderBy(sql`${atsCompanies.lastFetchedAt} ASC NULLS FIRST`, sql`${atsCompanies.atsType} ASC`)
    .limit(BATCH_SIZE)

  log.info('ats-refresher', 'companies selected', { count: companies.length })

  // Process each ATS provider concurrently but capped per-provider to avoid rate limits
  const byProvider = groupBy(companies, (c) => inferAtsTypeFromUrl(c.careersUrl, c.atsType))
  let totalJobs = 0

  await Promise.allSettled(
    Array.from(byProvider.entries()).map(([provider, providerCompanies]) =>
      processInChunks(providerCompanies, CONCURRENCY_PER_PROVIDER, async (company) => {
        const jobs = await fetchCompanyJobs(company)
        await persistJobs(jobs)
        await db
          .update(atsCompanies)
          .set({ lastFetchedAt: new Date() })
          .where(eq(atsCompanies.id, company.id))
        totalJobs += jobs.length
      }).then(() => log.info('ats-refresher', 'provider done', { provider, count: providerCompanies.length }))
    )
  )

  log.info('ats-refresher', 'run complete', {
    companiesProcessed: companies.length,
    jobsFetched: totalJobs,
  })
}
