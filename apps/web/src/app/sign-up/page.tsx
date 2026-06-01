import { SignUp } from '@clerk/nextjs'
import Link from 'next/link'
import { clerkLight } from '@/lib/auth-appearance'

const features = [
  { icon: '✈️', text: 'Track cheap flights and get alerted instantly' },
  { icon: '💼', text: 'Find jobs that match your resume with AI scoring' },
  { icon: '🏠', text: 'Monitor rental listings before they disappear' },
  { icon: '📈', text: 'Watch stocks and prices around the clock' },
]

export default function SignUpPage() {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      background: '#ffffff',
      fontFamily: "'Inter', -apple-system, sans-serif",
    }}>

      {/* Left panel — branding */}
      <div style={{
        flex: '0 0 45%',
        background: '#f8fafc',
        borderRight: '1px solid #e5e7eb',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '48px 56px',
      }} className="auth-left-panel">

        {/* Logo */}
        <Link href="/" style={{ textDecoration: 'none' }}>
          <span style={{ fontSize: 22, fontWeight: 700, color: '#111827', letterSpacing: '-0.04em' }}>
            Skove
          </span>
        </Link>

        {/* Hero copy */}
        <div>
          <h1 style={{
            fontSize: 36, fontWeight: 700, color: '#111827',
            letterSpacing: '-0.04em', lineHeight: 1.15, marginBottom: 16,
          }}>
            Stop searching.<br />Start automating.
          </h1>
          <p style={{ fontSize: 16, color: '#6b7280', lineHeight: 1.6, marginBottom: 40, maxWidth: 340 }}>
            Deploy agents that monitor the web 24/7 and surface results when they matter.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {features.map(f => (
              <div key={f.text} style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                <span style={{
                  width: 36, height: 36, background: '#eff6ff',
                  border: '1px solid #dbeafe', borderRadius: 9,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 17, flexShrink: 0,
                }}>{f.icon}</span>
                <span style={{ fontSize: 14, color: '#374151', lineHeight: 1.5, paddingTop: 8 }}>
                  {f.text}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <p style={{ fontSize: 12, color: '#9ca3af' }}>
          Free to start · No credit card required
        </p>
      </div>

      {/* Right panel — form */}
      <div style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '48px 40px',
        background: '#ffffff',
      }}>
        <div style={{ width: '100%', maxWidth: 400 }}>
          <div style={{ marginBottom: 28 }}>
            <h2 style={{ fontSize: 24, fontWeight: 600, color: '#111827', letterSpacing: '-0.03em', marginBottom: 6 }}>
              Create your account
            </h2>
            <p style={{ fontSize: 14, color: '#6b7280' }}>
              Already have one?{' '}
              <Link href="/sign-in" style={{ color: '#2563eb', textDecoration: 'none', fontWeight: 500 }}>
                Sign in
              </Link>
            </p>
          </div>

          {/* Social login buttons appear here automatically when enabled in Clerk dashboard
              Supported: Google, GitHub, X (Twitter), Facebook, Instagram, LinkedIn */}
          <SignUp
            afterSignUpUrl="/dashboard"
            appearance={clerkLight}
          />
        </div>
      </div>
    </div>
  )
}
