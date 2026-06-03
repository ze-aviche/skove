import Link from 'next/link'

const EFFECTIVE_DATE = 'June 2, 2026'

export const metadata = { title: 'Terms of Service — Skove' }

export default function TermsPage() {
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
          Terms of Service
        </h1>
        <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 48 }}>
          Effective date: {EFFECTIVE_DATE}
        </p>

        <Section title="1. Acceptance of Terms">
          By accessing or using Skove ("the Service"), you agree to be bound by these Terms of Service. If you do not agree, do not use the Service. These terms apply to all users, including free and paid subscribers.
        </Section>

        <Section title="2. Beta Disclaimer">
          Skove is currently in beta. The Service is provided as-is and may be subject to downtime, data loss, or changes to features without notice. We make no guarantees of uptime, accuracy, or continuity of service during this period.
        </Section>

        <Section title="3. Description of Service">
          Skove provides automated monitoring agents that search the web and external data sources on your behalf and deliver results to your dashboard and email. Agents include flight price watchers, job trackers, real estate monitors, stock alerts, and news monitors.
        </Section>

        <Section title="4. Eligibility">
          You must be at least 18 years old to use the Service. By registering, you represent that you meet this requirement and that the information you provide is accurate.
        </Section>

        <Section title="5. Accounts">
          You are responsible for maintaining the confidentiality of your account credentials. You are responsible for all activity that occurs under your account. Notify us immediately at{' '}
          <a href="mailto:support@skove.io" style={{ color: '#2563eb' }}>support@skove.io</a>
          {' '}if you suspect unauthorised access.
        </Section>

        <Section title="6. Acceptable Use">
          You agree not to use the Service to:
          <ul style={{ marginTop: 12, paddingLeft: 20, lineHeight: 2 }}>
            <li>Violate any applicable law or regulation</li>
            <li>Scrape or harvest data in a manner that violates any third-party terms of service</li>
            <li>Attempt to reverse-engineer, disrupt, or overload the Service</li>
            <li>Transmit spam, malware, or harmful content</li>
            <li>Impersonate any person or entity</li>
          </ul>
        </Section>

        <Section title="7. Paid Plans">
          Certain features are available only under a paid subscription ("Pro"). Billing is handled by Stripe. Subscriptions renew automatically unless cancelled. Refunds are issued at our discretion. Prices may change with 30 days' notice.
        </Section>

        <Section title="8. Intellectual Property">
          All content, design, and software comprising the Service is owned by Skove or its licensors and protected by copyright and other intellectual property laws. You may not copy, modify, or distribute any part of the Service without written permission.
        </Section>

        <Section title="9. Third-Party Services">
          The Service relies on third-party providers including Clerk (authentication), Railway (infrastructure), Supabase (database), Resend (email), and SerpAPI (search). Your use of the Service is also subject to their respective terms and privacy policies.
        </Section>

        <Section title="10. Disclaimer of Warranties">
          THE SERVICE IS PROVIDED "AS IS" WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, OR NON-INFRINGEMENT. WE DO NOT GUARANTEE THE ACCURACY OR COMPLETENESS OF SEARCH RESULTS RETURNED BY AGENTS.
        </Section>

        <Section title="11. Limitation of Liability">
          TO THE MAXIMUM EXTENT PERMITTED BY LAW, SKOVE SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES ARISING OUT OF YOUR USE OF THE SERVICE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGES.
        </Section>

        <Section title="12. Termination">
          We reserve the right to suspend or terminate your account at any time for violation of these Terms or for any other reason at our sole discretion. You may delete your account at any time from your profile page.
        </Section>

        <Section title="13. Changes to Terms">
          We may update these Terms at any time. Material changes will be communicated by email or via an in-app notice. Continued use of the Service after changes constitutes acceptance of the revised Terms.
        </Section>

        <Section title="14. Governing Law">
          These Terms are governed by the laws of the State of Delaware, United States, without regard to conflict-of-law principles. Disputes shall be resolved in the courts of Delaware.
        </Section>

        <Section title="15. Contact">
          Questions about these Terms? Email us at{' '}
          <a href="mailto:support@skove.io" style={{ color: '#2563eb' }}>support@skove.io</a>.
        </Section>

        <div style={{ marginTop: 48, paddingTop: 24, borderTop: '1px solid #e5e7eb' }}>
          <Link href="/privacy" style={{ fontSize: 13, color: '#2563eb', marginRight: 24, textDecoration: 'none' }}>
            Privacy Policy →
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
