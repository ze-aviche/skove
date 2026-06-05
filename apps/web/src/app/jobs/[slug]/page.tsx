import fs from 'fs'
import path from 'path'

type Params = { params: { slug: string } }

function loadSlugs() {
  const file = path.join(process.cwd(), 'apps/web/data/seo-slugs.json')
  if (!fs.existsSync(file)) return []
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as string[]
  } catch {
    return []
  }
}

export async function generateStaticParams() {
  const slugs = loadSlugs()
  return slugs.map((s) => ({ slug: s }))
}

export async function generateMetadata({ params }: Params) {
  const slug = params.slug
  const title = `${slug.replace(/-/g, ' ')} jobs | Skove`
  const description = `Find ${slug.replace(/-/g, ' ')} jobs on Skove — latest openings, remote options, and senior roles.`
  return {
    title,
    description,
    openGraph: { title, description },
  }
}

export default function Page({ params }: Params) {
  const slug = params.slug
  const slugs = loadSlugs()
  const exists = slugs.includes(slug)
  const title = exists ? `${slug.replace(/-/g, ' ')} jobs` : `${slug.replace(/-/g, ' ')} jobs` 

  return (
    <main style={{ padding: 32, fontFamily: 'system-ui, Arial' }}>
      <h1>{title}</h1>
      <p>
        Discover curated {slug.replace(/-/g, ' ')} roles — remote and onsite listings,
        senior and junior positions, and companies hiring now.
      </p>

      <section>
        <h2>Why this page matters</h2>
        <p>
          Skove creates focused landing pages to surface the best {slug.replace(/-/g, ' ')}
          opportunities. We aggregate and surface relevant openings to help you find
          the right role faster.
        </p>
      </section>

      <section>
        <h2>Related Searches</h2>
        <ul>
          <li><a href="/jobs/aws-connect">AWS Connect jobs</a></li>
          <li><a href="/jobs/remote-aws-jobs">Remote AWS jobs</a></li>
          <li><a href="/jobs/senior-aws-jobs">Senior AWS jobs</a></li>
        </ul>
      </section>
    </main>
  )
}
