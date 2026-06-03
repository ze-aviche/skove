'use client'
import { SignUp } from '@clerk/nextjs'
import Link from 'next/link'
import { clerkLight } from '@/lib/auth-appearance'

export default function SignUpContinuePage() {
  return (
    <div style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      background: '#f8fafc', fontFamily: "'Inter', -apple-system, sans-serif", padding: '32px 16px',
    }}>
      <Link href="/" style={{ textDecoration: 'none', marginBottom: 32 }}>
        <span style={{ fontSize: 22, fontWeight: 700, color: '#111827', letterSpacing: '-0.04em' }}>Skove</span>
      </Link>
      <div style={{
        width: '100%', maxWidth: 420, background: '#ffffff',
        border: '1px solid #e5e7eb', borderRadius: 16, padding: '36px 36px 28px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 4px 16px rgba(0,0,0,0.04)',
      }}>
        <SignUp afterSignUpUrl="/dashboard" afterSignInUrl="/dashboard" appearance={clerkLight} />
      </div>
      <p style={{ fontSize: 11, color: '#9ca3af', textAlign: 'center', marginTop: 16, lineHeight: 1.6, maxWidth: 320 }}>
        By creating an account you agree to our{' '}
        <Link href="/terms" style={{ color: '#6b7280', textDecoration: 'underline' }}>Terms of Service</Link>
        {' '}and{' '}
        <Link href="/privacy" style={{ color: '#6b7280', textDecoration: 'underline' }}>Privacy Policy</Link>.
        Skove is currently in beta — features may change.
      </p>
    </div>
  )
}
