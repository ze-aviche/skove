import { NormalisedJob } from './index'

export async function fetchGreenhouseJobs(jobTitle: string, location: string, minSalary: number, companies: Array<{ name: string; atsIdentifier: string }>): Promise<NormalisedJob[]> {
  const query = String(jobTitle).toLowerCase()
  const isRemote = String(location).toLowerCase().includes('remote')
  const results: NormalisedJob[] = []

  const promises = companies.map(async (company) => {
    const url = `https://boards-api.greenhouse.io/v1/boards/${company.atsIdentifier}/jobs?content=true`
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'skove-agent/1.0' } })
      if (!res.ok) return []
      const data = await res.json() as { jobs?: Array<any> }
      return (data.jobs ?? []).slice(0, 6).map((job: any) => ({
        id: `greenhouse-${company.atsIdentifier}-${job.id}`,
        title: job.title,
        company: company.name,
        location: job.location?.name ?? 'Remote',
        applyUrl: `https://boards.greenhouse.io/${company.atsIdentifier}/jobs/${job.id}`,
        salaryMin: undefined,
        salaryMax: undefined,
        description: job.contents,
        postedAt: job.updated_at || new Date().toISOString(),
        source: 'Greenhouse ATS',
      }))
    } catch (e) {
      return []
    }
  })

  const settled = await Promise.all(promises)
  settled.forEach((s) => results.push(...s))
  return results
}
