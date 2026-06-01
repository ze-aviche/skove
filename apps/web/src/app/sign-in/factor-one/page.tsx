'use client'
import { SignIn } from '@clerk/nextjs'
import Link from 'next/link'
import { clerkLight } from '@/lib/auth-appearance'

export default function FactorOnePage() {
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
        <SignIn afterSignInUrl="/dashboard" appearance={clerkLight} />
      </div>
    </div>
  )
}
