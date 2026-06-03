import Link from 'next/link'

const EFFECTIVE_DATE = 'June 2, 2026'

export const metadata = { title: 'Privacy Policy — Skove' }

export default function PrivacyPage() {
  return (
    <div style={{
      minHeight: '100vh',
      background: '#ffffff',
      fontFamily: "'Inter', -apple-system, sans-serif",
      color: '#111827',
    }}>
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '64px 24px 96px' }}>

        {/* Header */}
        <div style={{ marginBottom: 48 }}>
          <Link href="/" style={{ fontSize: 18, fontWeight: 700, color: '#111827', letterSpacing: '-0.03em', textDecoration: 'none' }}>
            Skove
          </Link>
        </div>

        <h1 style={{ fontSize: 32, fontWeight: 700, letterSpacing: '-0.04em', marginBottom: 8 }}>
          Privacy Policy
        </h1>
        <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 48 }}>
          Effective date: {EFFECTIVE_DATE}
        </p>

        <Section title="1. Overview">
          Skove ("we", "us", or "our") operates the Skove monitoring platform. This Privacy Policy explains what data we collect, how we use it, and your rights. By using the Service you agree to the practices described here.
        </Section>

        <Section title="2. Information We Collect">
          <strong style={{ display: 'block', marginBottom: 8, color: '#111827' }}>Account information</strong>
          When you create an account we collect your email address and, optionally, your name via our authentication provider (Clerk).

          <strong style={{ display: 'block', marginTop: 16, marginBottom: 8, color: '#111827' }}>Agent configuration data</strong>
          We store the configuration you provide when deploying agents — including search criteria such as job titles, locations, airport codes, stock ticker symbols, city names, and price ranges. This data is used solely to operate your agents.

          <strong style={{ display: 'block', marginTop: 16, marginBottom: 8, color: '#111827' }}>Resume and documents</strong>
          If you use the Job Tracker agent, you may optionally upload a resume in PDF format. The extracted text is stored and used to score job matches and generate tailored documents. You can delete your resume at any time from your Profile page.

          <strong style={{ display: 'block', marginTop: 16, marginBottom: 8, color: '#111827' }}>Agent results</strong>
          Search results retrieved by your agents (e.g. flight prices, job listings, property listings) are stored in your account so you can review them in the dashboard.

          <strong style={{ display: 'block', marginTop: 16, marginBottom: 8, color: '#111827' }}>Usage data</strong>
          We collect standard server logs including IP addresses, browser type, pages visited, and timestamps. This data helps us diagnose issues and improve the Service.
        </Section>

        <Section title="3. How We Use Your Data">
          <ul style={{ paddingLeft: 20, lineHeight: 2, marginTop: 0 }}>
            <li>To authenticate you and manage your account</li>
            <li>To run your monitoring agents and deliver results to your dashboard</li>
            <li>To send email notifications about new agent results</li>
            <li>To generate AI-tailored resumes and cover letters (Job Tracker only)</li>
            <li>To process payments and manage subscriptions (Pro plan)</li>
            <li>To improve and debug the Service</li>
            <li>To comply with legal obligations</li>
          </ul>
          We do not sell your personal data to third parties.
        </Section>

        <Section title="4. AI and Third-Party Processing">
          Skove uses Anthropic's Claude API to score job listings, generate cover letters, and tailor resumes. Relevant portions of your resume and job listing data are sent to Anthropic's API for this purpose. Anthropic's data handling practices are described at{' '}
          <a href="https://www.anthropic.com/privacy" target="_blank" rel="noreferrer" style={{ color: '#2563eb' }}>
            anthropic.com/privacy
          </a>. We also use SerpAPI to perform web searches on your behalf; search queries derived from your agent configurations are sent to SerpAPI's servers.
        </Section>

        <Section title="5. Data Sharing">
          We share your data with the following sub-processors solely to operate the Service:
          <table style={{ marginTop: 12, width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                <th style={{ textAlign: 'left', paddingBottom: 8, color: '#6b7280', fontWeight: 500 }}>Provider</th>
                <th style={{ textAlign: 'left', paddingBottom: 8, color: '#6b7280', fontWeight: 500 }}>Purpose</th>
              </tr>
            </thead>
            <tbody>
              {[
                ['Clerk', 'Authentication and user management'],
                ['Supabase / PostgreSQL', 'Database storage'],
                ['Railway', 'Cloud infrastructure and hosting'],
                ['Resend', 'Transactional email delivery'],
                ['Anthropic', 'AI job scoring and document generation'],
                ['SerpAPI', 'Web search for agent results'],
                ['Stripe', 'Payment processing (Pro plan)'],
              ].map(([provider, purpose]) => (
                <tr key={provider} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={{ padding: '8px 0', fontWeight: 500 }}>{provider}</td>
                  <td style={{ padding: '8px 0', color: '#374151' }}>{purpose}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>

        <Section title="6. Data Retention">
          We retain your account data for as long as your account is active. Agent results are retained indefinitely unless you delete them from the dashboard. If you delete your account, all associated data including agent configurations, results, and your resume are permanently deleted within 30 days.
        </Section>

        <Section title="7. Security">
          We use industry-standard measures including TLS encryption for data in transit and encrypted storage at rest. Your authentication is managed by Clerk, which is SOC 2 certified. Despite these measures, no method of transmission or storage is 100% secure.
        </Section>

        <Section title="8. Cookies">
          Skove uses session cookies necessary for authentication (managed by Clerk). We do not use advertising or tracking cookies. You can disable cookies in your browser, but this will prevent you from logging in.
        </Section>

        <Section title="9. Your Rights">
          Depending on your jurisdiction you may have the right to:
          <ul style={{ paddingLeft: 20, lineHeight: 2, marginTop: 8 }}>
            <li>Access the personal data we hold about you</li>
            <li>Request correction of inaccurate data</li>
            <li>Request deletion of your data ("right to be forgotten")</li>
            <li>Object to or restrict certain processing</li>
            <li>Data portability</li>
          </ul>
          To exercise any of these rights, email us at{' '}
          <a href="mailto:privacy@skove.io" style={{ color: '#2563eb' }}>privacy@skove.io</a>.
          We will respond within 30 days.
        </Section>

        <Section title="10. Children's Privacy">
          The Service is not directed at children under the age of 13. We do not knowingly collect personal data from children. If you believe a child has provided us with their data, contact us and we will delete it.
        </Section>

        <Section title="11. Changes to This Policy">
          We may update this Privacy Policy from time to time. Material changes will be communicated by email or in-app notice at least 14 days before they take effect. Continued use of the Service after changes constitutes acceptance.
        </Section>

        <Section title="12. Contact">
          For privacy-related questions or requests, contact us at{' '}
          <a href="mailto:privacy@skove.io" style={{ color: '#2563eb' }}>privacy@skove.io</a>
          .
        </Section>

        <div style={{ marginTop: 48, paddingTop: 24, borderTop: '1px solid #e5e7eb' }}>
          <Link href="/terms" style={{ fontSize: 13, color: '#2563eb', marginRight: 24, textDecoration: 'none' }}>
            Terms of Service →
          </Link>
          <Link href="/" style={{ fontSize: 13, color: '#6b7280', textDecoration: 'none' }}>
            Back to Skove
          </Link>
        </div>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 36 }}>
      <h2 style={{ fontSize: 15, fontWeight: 600, color: '#111827', marginBottom: 10 }}>{title}</h2>
      <div style={{ fontSize: 14, color: '#374151', lineHeight: 1.75 }}>{children}</div>
    </div>
  )
}
