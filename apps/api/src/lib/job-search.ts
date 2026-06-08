import { db } from '../db/index.js'
import { atsJobs } from '../db/schema.js'
import { and, or, desc, sql } from 'drizzle-orm'

export interface JobSearchParams {
  titles?: string[]      // multiple job titles, OR'd
  locations?: string[]   // multiple locations, OR'd
  specializations?: string[] // multiple specializations, OR'd
  company?: string       // single company LIKE filter
  keywords?: string      // extra keyword appended as OR title term
  limit?: number
  offset?: number
}

export interface AtsJobRow {
  id: string
  source: string
  externalId: string | null
  applyUrl: string
  title: string
  company: string
  location: string
  salaryMin: number | null
  salaryMax: number | null
  description: string | null
  postedAt: string
  titleSearch: string
  companySearch: string
  locationSearch: string
}

function normalizeText(value?: string) {
  return String(value ?? '').trim().toLowerCase()
}

function buildLocationPattern(loc: string): string {
  const n = normalizeText(loc)
  if (n.includes('remote') || n.includes('wfh')) return '%remote%'
  if (n === 'us' || n === 'usa' || n === 'united states') return '%us%'
  if (n === 'uk' || n === 'gb' || n === 'united kingdom') return '%uk%'
  if (n === 'ca' || n === 'canada') return '%ca%'
  if (n === 'au' || n === 'australia') return '%australia%'
  const city = n.split(',')[0].trim()
  return `%${city}%`
}

export async function searchAtsJobs(params: JobSearchParams): Promise<AtsJobRow[]> {
  const conditions: any[] = []

  // 1. Location OR — identical logic to /api/jobs/search
  const locs = (params.locations ?? []).filter(Boolean)
  if (locs.length > 0) {
    const locationConds = locs.map(l => sql`${atsJobs.locationSearch} like ${buildLocationPattern(l)}`)
    conditions.push(locs.length === 1 ? locationConds[0] : or(...locationConds))
  }

  // 2. Specialization — EXISTS with DISTINCT ON, identical to /api/jobs/search
  // For multiple specializations the inner condition becomes OR across all values.
  const specs = (params.specializations ?? []).filter(Boolean)
  if (specs.length > 0) {
    // Build the OR expression inside the EXISTS as a raw SQL string — safe because
    // values are lowercased and sanitized by normalizeText before interpolation.
    const specConditions = specs
      .map(s => `lower(uc.specialization) = lower('${normalizeText(s).replace(/'/g, "''")}')`)
      .join(' OR ')
    conditions.push(sql`EXISTS (
      SELECT 1 FROM (
        SELECT DISTINCT ON (lower(name)) name, specialization
        FROM ats_companies
        WHERE specialization IS NOT NULL
        ORDER BY lower(name), specialization
      ) uc
      WHERE lower(uc.name) = lower(${atsJobs.company})
      AND (${sql.raw(specConditions)})
    )`)
  }

  // 3. Company LIKE
  if (params.company) {
    conditions.push(sql`${atsJobs.companySearch} like ${'%' + normalizeText(params.company) + '%'}`)
  }

  // 4. Title OR — each title is its own LIKE, plus optional keywords term
  const titleTerms = [
    ...(params.titles ?? []).filter(Boolean),
    ...(params.keywords ? [params.keywords] : []),
  ]
  if (titleTerms.length > 0) {
    const titleConds = titleTerms.map(t => sql`${atsJobs.titleSearch} like ${'%' + normalizeText(t) + '%'}`)
    conditions.push(titleTerms.length === 1 ? titleConds[0] : or(...titleConds))
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined

  const rows = await db
    .select()
    .from(atsJobs)
    .where(where)
    .orderBy(desc(atsJobs.createdAt))
    .limit(params.limit ?? 100)
    .offset(params.offset ?? 0)

  return rows as AtsJobRow[]
}

export async function countAtsJobs(params: JobSearchParams): Promise<number> {
  const conditions: any[] = []

  const locs = (params.locations ?? []).filter(Boolean)
  if (locs.length > 0) {
    const locationConds = locs.map(l => sql`${atsJobs.locationSearch} like ${buildLocationPattern(l)}`)
    conditions.push(locs.length === 1 ? locationConds[0] : or(...locationConds))
  }

  const specs = (params.specializations ?? []).filter(Boolean)
  if (specs.length > 0) {
    const specConditions = specs
      .map(s => `lower(uc.specialization) = lower('${normalizeText(s).replace(/'/g, "''")}')`)
      .join(' OR ')
    conditions.push(sql`EXISTS (
      SELECT 1 FROM (
        SELECT DISTINCT ON (lower(name)) name, specialization
        FROM ats_companies
        WHERE specialization IS NOT NULL
        ORDER BY lower(name), specialization
      ) uc
      WHERE lower(uc.name) = lower(${atsJobs.company})
      AND (${sql.raw(specConditions)})
    )`)
  }

  if (params.company) {
    conditions.push(sql`${atsJobs.companySearch} like ${'%' + normalizeText(params.company) + '%'}`)
  }

  const titleTerms = [
    ...(params.titles ?? []).filter(Boolean),
    ...(params.keywords ? [params.keywords] : []),
  ]
  if (titleTerms.length > 0) {
    const titleConds = titleTerms.map(t => sql`${atsJobs.titleSearch} like ${'%' + normalizeText(t) + '%'}`)
    conditions.push(titleTerms.length === 1 ? titleConds[0] : or(...titleConds))
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined
  const [{ total }] = await db.select({ total: sql<string>`count(*)` }).from(atsJobs).where(where)
  return Number(total)
}
