export * from './lever'
export * from './greenhouse'
export * from './ashby'

export type NormalisedJob = {
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
