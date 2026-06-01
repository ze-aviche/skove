import { SignIn } from '@clerk/nextjs'
import Link from 'next/link'

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
    formButtonPrimary: { background: '#7c3aed' },
    footerActionLink: { color: '#7c3aed' },
    formFieldLabel: { color: '#a1a1b3' },
    dividerLine: { background: 'rgba(255,255,255,0.08)' },
    dividerText: { color: '#6b6b7d' },
    socialButtonsBlockButton: {
      background: '#282832',
      border: '1px solid rgba(255,255,255,0.08)',
      color: '#ffffff',
    },
    socialButtonsBlockButtonText: { color: '#ffffff' },
  },
}

// Handles all Clerk sign-in sub-routes:
// /sign-in/sso-callback, /sign-in/factor-one, /sign-in/factor-two, etc.
export default function SignInCatchAll() {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 24,
      background: 'var(--surface-0)',
    }}>
      <Link href="/" style={{
        fontSize: 22, fontWeight: 700, letterSpacing: '-0.05em',
        color: '#ffffff', textDecoration: 'none',
      }}>Skove</Link>
      <SignIn afterSignInUrl="/dashboard" appearance={clerkAppearance} />
    </div>
  )
}
