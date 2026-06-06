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
      if (data) break
    }

    if (!data) {
      log.warn('ats-refresher', 'lever: all slugs failed', {
        company: company.name,
        triedSlugs: [company.atsIdentifier, ...uniqueCandidates],
      })
      return []
    }
  }

  return data
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
}

async function fetchGreenhouseCompanyJobs(company: {
  name: string
  atsIdentifier: string
}): Promise<NormalisedJob[]> {
  const url = `https://boards-api.greenhouse.io/v1/boards/${company.atsIdentifier}/jobs?content=true`
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'skove-agent/1.0' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
    if (!res.ok) {
      log.warn('ats-refresher', 'greenhouse: fetch failed', { company: company.name, status: res.status })
      return []
    }
    const data = await res.json() as { jobs?: Array<Record<string, any>> }
    return (data.jobs ?? [])
      .filter((job) => job.title && job.id)
      .map((job) => ({
        id: `greenhouse-${company.atsIdentifier}-${job.id}`,
        title: job.title,
        company: company.name,
        location: job.location?.name ?? 'Remote',
        applyUrl: `https://boards.greenhouse.io/${company.atsIdentifier}/jobs/${job.id}`,
        description: job.contents,
        postedAt: job.updated_at || new Date().toISOString(),
        source: 'Greenhouse ATS',
      }))
  } catch (err) {
    log.warn('ats-refresher', 'greenhouse: network error', { company: company.name, err: (err as Error).message })
    return []
  }
}

async function fetchAshbyCompanyJobs(company: {
  name: string
  atsIdentifier: string
}): Promise<NormalisedJob[]> {
  // Ashby public posting API — documented at https://developers.ashbyhq.com/reference/jobboardjoblistinglist
  const url = `https://api.ashbyhq.com/posting-api/job-board/${company.atsIdentifier}`
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'skove-agent/1.0',
      },
      body: JSON.stringify({}),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
    if (!res.ok) {
      log.warn('ats-refresher', 'ashby: fetch failed', { company: company.name, status: res.status })
      return []
    }
    const json = await res.json() as { results?: Array<Record<string, any>> }
    return (json.results ?? [])
      .filter((job) => job.title && job.id && job.isListed !== false)
      .map((job) => ({
        id: `ashby-${company.atsIdentifier}-${job.id}`,
        title: job.title,
        company: company.name,
        location: job.locationName ?? (job.isRemote ? 'Remote' : 'Unknown'),
        applyUrl: job.applyUrl ?? `https://jobs.ashbyhq.com/${company.atsIdentifier}/${job.id}`,
        description: job.descriptionPlain ?? job.description,
        postedAt: job.publishedDate || new Date().toISOString(),
        source: 'Ashby ATS',
      }))
  } catch (err) {
    log.warn('ats-refresher', 'ashby: network error', { company: company.name, err: (err as Error).message })
    return []
  }
}

async function fetchCompanyJobs(company: {
  id: string
  name: string
  atsType: string
  atsIdentifier: string
  careersUrl: string | null
}): Promise<NormalisedJob[]> {
  const resolvedType = inferAtsTypeFromUrl(company.careersUrl, company.atsType)
  if (resolvedType === 'lever') return fetchLeverCompanyJobs(company)
  if (resolvedType === 'greenhouse') return fetchGreenhouseCompanyJobs(company)
  if (resolvedType === 'ashby') return fetchAshbyCompanyJobs(company)
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
  await db.delete(atsJobs).where(lt(atsJobs.createdAt, retentionCutoff))
  log.info('ats-refresher', 'old jobs cleaned up', { cutoff: retentionCutoff })

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
