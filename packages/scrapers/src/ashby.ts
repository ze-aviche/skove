import { NormalisedJob } from './index'

export async function fetchAshbyJobs(jobTitle: string, location: string, minSalary: number, companies: Array<{ name: string; atsIdentifier: string }>): Promise<NormalisedJob[]> {
  const results: NormalisedJob[] = []
  const apiKey = process.env.ASHBY_API_KEY
  const baseUrl = process.env.ASHBY_API_URL ?? 'https://api.ashbyhq.com/v1'

  const promises = companies.map(async (company) => {
    const url = apiKey
      ? `${baseUrl}/companies/${company.atsIdentifier}/jobs`
      : `https://boards.ashbyhq.com/${company.atsIdentifier}/jobs.json`
    try {
      const res = await fetch(url, { headers: apiKey ? { Authorization: `Bearer ${apiKey}`, 'User-Agent': 'skove-agent/1.0' } : { 'User-Agent': 'skove-agent/1.0' } })
      if (!res.ok) return []
      const json = await res.json()
      const data = json.data ?? json.jobs ?? json.results ?? json
      return (data ?? []).slice(0, 6).map((job: any) => ({
        id: `ashby-${company.atsIdentifier}-${job.id ?? job.uuid ?? Math.random()}`,
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
    } catch (e) {
      return []
    }
  })

  const settled = await Promise.all(promises)
  settled.forEach((s) => results.push(...s))
  return results
}
