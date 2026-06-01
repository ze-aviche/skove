'use client'

import { AuthenticateWithRedirectCallback } from '@clerk/nextjs'

// Handles OAuth redirect back from providers (Google, X, Facebook, etc.)
export default function SSOCallback() {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--surface-0)',
    }}>
      <AuthenticateWithRedirectCallback />
    </div>
  )
}
