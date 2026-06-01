import { SignUp } from '@clerk/nextjs'

const clerkAppearance = {
  variables: {
    colorBackground: '#1f1f27',
    colorInputBackground: '#282832',
    colorInputText: '#ffffff',
    colorText: '#ffffff',
    colorTextSecondary: '#a1a1b3',
    colorPrimary: '#7c3aed',
    colorDanger: '#ef4444',
    colorSuccess: '#10b981',
    borderRadius: '10px',
    fontFamily: 'Inter, -apple-system, sans-serif',
    fontSize: '14px',
  },
  elements: {
    card: { background: '#1f1f27', border: '1px solid rgba(255,255,255,0.08)', boxShadow: '0 20px 48px rgba(0,0,0,0.55)' },
    headerTitle: { color: '#ffffff', fontSize: '20px', fontWeight: '600' },
    headerSubtitle: { color: '#a1a1b3' },
    formButtonPrimary: { background: '#7c3aed', '&:hover': { background: '#6d28d9' } },
    footerActionLink: { color: '#7c3aed' },
    identityPreviewText: { color: '#ffffff' },
    formFieldLabel: { color: '#a1a1b3' },
    dividerLine: { background: 'rgba(255,255,255,0.08)' },
    dividerText: { color: '#6b6b7d' },
    socialButtonsBlockButton: {
      background: '#282832',
      border: '1px solid rgba(255,255,255,0.08)',
      color: '#ffffff',
      '&:hover': { background: '#31313d' },
    },
    socialButtonsBlockButtonText: { color: '#ffffff' },
  },
}

const features = [
  { icon: '✈️', label: 'Track cheap flights' },
  { icon: '💼', label: 'Find matching jobs' },
  { icon: '🏠', label: 'Monitor rental listings' },
  { icon: '📈', label: 'Watch stocks & prices' },
  { icon: '📰', label: 'Follow keywords in news' },
]

export default function SignUpPage() {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      background: 'var(--surface-0)',
      fontFamily: 'Inter, -apple-system, sans-serif',
    }}>
      {/* Left panel — branding */}
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        padding: '60px 64px',
        borderRight: '1px solid rgba(255,255,255,0.06)',
        background: 'linear-gradient(135deg, #0f0f12 0%, #16161b 100%)',
      }} className="auth-left-panel">
        <div style={{ maxWidth: 400 }}>
          <div style={{ marginBottom: 40 }}>
            <span style={{
              fontSize: 26, fontWeight: 700, letterSpacing: '-0.05em',
              color: '#ffffff',
            }}>Skove</span>
          </div>

          <h1 style={{
            fontSize: 32, fontWeight: 700, lineHeight: 1.2,
            letterSpacing: '-0.04em', color: '#ffffff', marginBottom: 14,
          }}>
            Agents working<br />for you, 24/7
          </h1>
          <p style={{ fontSize: 15, color: '#a1a1b3', lineHeight: 1.6, marginBottom: 36 }}>
            Deploy autonomous agents that monitor, search, and act on your behalf. Results waiting when you wake up.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {features.map(f => (
              <div key={f.label} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{
                  width: 34, height: 34,
                  background: 'rgba(124,58,237,0.12)',
                  border: '1px solid rgba(124,58,237,0.2)',
                  borderRadius: 9,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 16, flexShrink: 0,
                }}>{f.icon}</span>
                <span style={{ fontSize: 14, color: '#e2e8f0' }}>{f.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right panel — Clerk form */}
      <div style={{
        width: 480,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px 32px',
        flexShrink: 0,
      }}>
        {/* Social login note — enable in Clerk dashboard:
            User & Authentication → Social Connections → X, Facebook, Instagram */}
        <SignUp
          afterSignUpUrl="/dashboard"
          appearance={clerkAppearance}
        />
      </div>
    </div>
  )
}
