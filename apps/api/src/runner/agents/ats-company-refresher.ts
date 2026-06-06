import { db } from '../../db/index.js'
import { atsCompanies, atsJobs } from '../../db/schema.js'
import { eq, lt, sql } from 'drizzle-orm'
import { log } from '../../lib/logger.js'

const BATCH_SIZE = 200
const CONCURRENCY = 20
const RETENTION_MS = 1000 * 60 * 60 * 24 * 14 // 14 days

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
      const res = await fetch(url, { headers: { 'User-Agent': 'skove-agent/1.0' } })
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
    const res = await fetch(url, { headers: { 'User-Agent': 'skove-agent/1.0' } })
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
    log.error('ats-refresher', 'greenhouse: fetch error', err, { company: company.name })
    return []
  }
}

async function fetchAshbyCompanyJobs(company: {
  name: string
  atsIdentifier: string
}): Promise<NormalisedJob[]> {
  const url = `https://boards.ashbyhq.com/${company.atsIdentifier}/jobs.json`
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'skove-agent/1.0' } })
    if (!res.ok) {
      log.warn('ats-refresher', 'ashby: fetch failed', { company: company.name, status: res.status })
      return []
    }
    const json = await res.json()
    const data: Array<Record<string, any>> = json.data ?? json.jobs ?? json.results ?? json
    return (data ?? [])
      .filter((job) => (job.title ?? job.text ?? job.name) && job.id)
      .map((job) => ({
        id: `ashby-${company.atsIdentifier}-${job.id ?? job.uuid}`,
        title: job.title ?? job.text ?? job.name,
        company: company.name,
        location: job.location?.name ?? job.location ?? 'Remote',
        applyUrl: job.applyUrl ?? job.url ?? job.hostedUrl ?? `https://boards.ashbyhq.com/${company.atsIdentifier}`,
        salaryMin: job.salaryMin ?? job.salary_min,
        salaryMax: job.salaryMax ?? job.salary_max,
        description: job.description ?? job.notes,
        postedAt: job.updatedAt || job.postedAt || job.createdAt || new Date().toISOString(),
        source: 'Ashby ATS',
      }))
  } catch (err) {
    log.error('ats-refresher', 'ashby: fetch error', err, { company: company.name })
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

export async function runATSCompanyRefresher(): Promise<void> {
  log.info('ats-refresher', 'run started')

  // Clean up jobs older than 14 days
  const retentionCutoff = new Date(Date.now() - RETENTION_MS)
  await db.delete(atsJobs).where(lt(atsJobs.createdAt, retentionCutoff))
  log.info('ats-refresher', 'old jobs cleaned up', { cutoff: retentionCutoff })

  // Pick the BATCH_SIZE companies with oldest lastFetchedAt (nulls first = never fetched)
  const companies = await db
    .select()
    .from(atsCompanies)
    .where(eq(atsCompanies.isEnabled, true))
    .orderBy(sql`${atsCompanies.lastFetchedAt} ASC NULLS FIRST`)
    .limit(BATCH_SIZE)

  log.info('ats-refresher', 'companies selected', { count: companies.length })

  let totalJobs = 0

  await processInChunks(companies, CONCURRENCY, async (company) => {
    const jobs = await fetchCompanyJobs(company)
    await persistJobs(jobs)
    await db
      .update(atsCompanies)
      .set({ lastFetchedAt: new Date() })
      .where(eq(atsCompanies.id, company.id))
    totalJobs += jobs.length
  })

  log.info('ats-refresher', 'run complete', {
    companiesProcessed: companies.length,
    jobsFetched: totalJobs,
  })
}
