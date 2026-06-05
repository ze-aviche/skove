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
  const human = slug.replace(/-/g, ' ')
  const title = `${human} jobs`
  const today = new Date().toISOString().slice(0, 10)

  const faq = [
    {
      question: `What is a ${human} job?`,
      answer:
        `A ${human} job typically involves domain-specific skills and experience. ` +
        `These roles range from junior to senior levels and may be remote or onsite.`,
    },
    {
      question: 'How do I apply?',
      answer:
        'Follow the links on this page to view openings and apply through the companies listed or set up job alerts on Skove.',
    },
  ]

  const structuredData = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        name: 'Skove',
        url: 'https://skove.com',
      },
      {
        '@type': 'WebPage',
        name: title,
        description: `Find ${human} jobs — remote, senior, and onsite opportunities updated regularly.`,
        url: `https://skove.com/jobs/${slug}`,
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://skove.com' },
          { '@type': 'ListItem', position: 2, name: 'Jobs', item: 'https://skove.com/jobs' },
          { '@type': 'ListItem', position: 3, name: title, item: `https://skove.com/jobs/${slug}` },
        ],
      },
      {
        '@type': 'FAQPage',
        mainEntity: faq.map((f) => ({
          '@type': 'Question',
          name: f.question,
          acceptedAnswer: { '@type': 'Answer', text: f.answer },
        })),
      },
      {
        '@type': 'JobPosting',
        title: `${human} Engineer`,
        datePosted: today,
        hiringOrganization: { '@type': 'Organization', name: 'Skove', sameAs: 'https://skove.com' },
        jobLocation: { '@type': 'Place', address: { '@type': 'PostalAddress', addressLocality: 'Remote' } },
        description: `Example ${human} job posting. For actual openings, browse listings and apply.`,
      },
    ],
  }

  return (
    <main style={{ padding: 32, fontFamily: 'system-ui, Arial', maxWidth: 900 }}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />

      <h1>{title}</h1>

      <p>
        Skove curates the best {human} roles from across the web — remote and onsite,
        contract and full-time positions, and openings for all seniority levels. We
        organize opportunities so you can find targeted positions quickly.
      </p>

      <section>
        <h2>What You’ll Do</h2>
        <ul>
          <li>Work with cross-functional teams to deliver production-grade systems.</li>
          <li>Design, build, and maintain scalable infrastructure and applications.</li>
          <li>Participate in code reviews and mentor colleagues.</li>
        </ul>
      </section>

      <section>
        <h2>Skills & Experience</h2>
        <p>
          Employers hiring for {human} roles typically look for practical experience,
          strong problem-solving skills, and familiarity with common tools and
          frameworks in the domain. Examples of relevant skills include cloud
          platforms, infrastructure-as-code, programming languages, and testing.
        </p>
      </section>

      <section>
        <h2>Tips to Improve Your Match</h2>
        <ol>
          <li>Optimize your resume with project details and measurable impact.</li>
          <li>Highlight domain-specific keywords and technologies.</li>
          <li>Keep a portfolio or public repo with examples of your work.</li>
        </ol>
      </section>

      <section>
        <h2>Frequently Asked Questions</h2>
        {faq.map((f) => (
          <div key={f.question} style={{ marginBottom: 12 }}>
            <strong>{f.question}</strong>
            <p>{f.answer}</p>
          </div>
        ))}
      </section>

      <section>
        <h2>Related Searches</h2>
        <ul>
          <li><a href="/jobs/aws-connect">AWS Connect jobs</a></li>
          <li><a href="/jobs/remote-aws-jobs">Remote AWS jobs</a></li>
          <li><a href="/jobs/senior-aws-jobs">Senior AWS jobs</a></li>
        </ul>
      </section>

      <footer style={{ marginTop: 24 }}>
        <p>Updated: {today}</p>
      </footer>
    </main>
  )
}
