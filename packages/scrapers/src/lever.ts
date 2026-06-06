import { NormalisedJob } from './index'

export async function fetchLeverJobs(jobTitle: string, location: string, minSalary: number, companies: Array<{ name: string; atsIdentifier: string }>): Promise<NormalisedJob[]> {
  const query = String(jobTitle).toLowerCase()
  const isRemote = String(location).toLowerCase().includes('remote')
  const results: NormalisedJob[] = []

  const promises = companies.map(async (company) => {
    const url = `https://api.lever.co/v0/postings/${company.atsIdentifier}?mode=json`
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'skove-agent/1.0' } })
      if (!res.ok) return []
      const data = await res.json() as Array<any>
      return (data ?? []).slice(0, 6).map((job: any) => ({
        id: `lever-${company.atsIdentifier}-${job.id}`,
        title: job.text,
        company: company.name,
        location: job.categories?.location ?? 'Remote',
        applyUrl: job.hostedUrl ?? `https://jobs.lever.co/${company.atsIdentifier}/${job.id}`,
        salaryMin: undefined,
        salaryMax: undefined,
        description: job.description ?? job.notes,
        postedAt: job.postedAt || new Date().toISOString(),
        source: 'Lever ATS',
      }))
    } catch (e) {
      return []
    }
  })

  const settled = await Promise.all(promises)
  settled.forEach((s) => results.push(...s))
  return results
}
