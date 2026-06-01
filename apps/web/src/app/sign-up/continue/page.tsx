'use client'
import { SignUp } from '@clerk/nextjs'

const clerkAppearance = {
  variables: {
    colorBackground: '#1f1f27', colorInputBackground: '#282832',
    colorInputText: '#ffffff', colorText: '#ffffff',
    colorTextSecondary: '#a1a1b3', colorPrimary: '#7c3aed',
    colorDanger: '#ef4444', colorSuccess: '#10b981',
    borderRadius: '10px', fontFamily: 'Inter, -apple-system, sans-serif', fontSize: '14px',
  },
  elements: {
    card: { background: '#1f1f27', border: '1px solid rgba(255,255,255,0.08)', boxShadow: '0 20px 48px rgba(0,0,0,0.55)' },
    headerTitle: { color: '#ffffff', fontSize: '20px', fontWeight: '600' },
    headerSubtitle: { color: '#a1a1b3' },
    formButtonPrimary: { background: '#7c3aed' },
    footerActionLink: { color: '#7c3aed' },
    formFieldLabel: { color: '#a1a1b3' },
    dividerLine: { background: 'rgba(255,255,255,0.08)' },
    dividerText: { color: '#6b6b7d' },
  },
}

export default function SignUpContinuePage() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--surface-0)' }}>
      <SignUp afterSignUpUrl="/dashboard" appearance={clerkAppearance} />
    </div>
  )
}
