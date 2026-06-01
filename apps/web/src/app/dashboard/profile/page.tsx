'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@clerk/nextjs'
import { useToast } from '@/app/providers'
import { getBillingPlan, createCheckoutSession, createBillingPortalSession, UserPlan } from '@/lib/api'
import { useSearchParams } from 'next/navigation'

const PLAN_LABELS: Record<string, { label: string; color: string; bg: string; border: string }> = {
  free:  { label: 'Free',  color: '#6b7280', bg: 'rgba(107,114,128,0.1)', border: 'rgba(107,114,128,0.2)' },
  pro:   { label: 'Pro',   color: '#2563eb', bg: 'rgba(37,99,235,0.1)',   border: 'rgba(37,99,235,0.2)'   },
}

export default function ProfilePage() {
  const [loading, setLoading] = useState(true)
  const [billing, setBilling] = useState<UserPlan | null>(null)
  const [billingLoading, setBillingLoading] = useState(false)
  const auth = useAuth()
  const { showToast } = useToast()
  const searchParams = useSearchParams()

  useEffect(() => {
    async function load() {
      try {
        const token = await auth.getToken()
        setBilling(await getBillingPlan(token))
      } catch { /* non-fatal */ }
      finally { setLoading(false) }
    }
    load()
  }, [])

  useEffect(() => {
    if (searchParams.get('upgraded') === '1') {
      showToast({ message: 'Welcome to Pro! Your plan has been upgraded.', variant: 'success' })
    }
  }, [])

  const handleUpgrade = async () => {
    setBillingLoading(true)
    try {
      const token = await auth.getToken()
      const { url } = await createCheckoutSession(token)
      window.location.href = url
    } catch (err) {
      showToast({ message: err instanceof Error ? err.message : 'Failed to start checkout', variant: 'error' })
      setBillingLoading(false)
    }
  }

  const handleManageBilling = async () => {
    setBillingLoading(true)
    try {
      const token = await auth.getToken()
      const { url } = await createBillingPortalSession(token)
      window.location.href = url
    } catch (err) {
      showToast({ message: err instanceof Error ? err.message : 'Failed to open billing portal', variant: 'error' })
      setBillingLoading(false)
    }
  }

  const plan = billing?.plan ?? 'free'
  const planStyle = PLAN_LABELS[plan] ?? PLAN_LABELS.free
  const isPro = plan === 'pro'

  return (
    <div style={{ padding: '32px 36px', animation: 'fadeIn 0.4s ease', maxWidth: 560 }}>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, color: 'var(--text-primary)', letterSpacing: '-0.03em', marginBottom: 4 }}>Profile</h1>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Manage your subscription.</p>
      </div>

      <div style={{
        background: 'var(--surface-2)', border: '1px solid var(--border)',
        borderRadius: 14, padding: 24,
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>Subscription</div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
              {isPro ? 'Unlimited agents and results.' : 'Free plan — 2 agents max.'}
            </div>
          </div>
          <span style={{
            fontSize: 12, fontWeight: 600, padding: '3px 12px', borderRadius: 99,
            background: planStyle.bg, color: planStyle.color, border: `1px solid ${planStyle.border}`,
            flexShrink: 0,
          }}>{planStyle.label}</span>
        </div>

        {loading ? (
          <div style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>Loading…</div>
        ) : isPro ? (
          <div>
            {billing?.planExpiresAt && (
              <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 12 }}>
                Cancels on {new Date(billing.planExpiresAt).toLocaleDateString()}
              </div>
            )}
            <button onClick={handleManageBilling} disabled={billingLoading} style={{
              fontSize: 13, fontWeight: 500, padding: '9px 18px', borderRadius: 9,
              border: '1px solid var(--border)', background: 'var(--surface-3)',
              color: 'var(--text-secondary)', cursor: 'pointer',
            }}>
              {billingLoading ? 'Opening…' : 'Manage billing →'}
            </button>
          </div>
        ) : (
          <div style={{
            background: 'rgba(37,99,235,0.06)', border: '1px solid rgba(37,99,235,0.15)',
            borderRadius: 10, padding: '14px 16px',
          }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>
              Start your 14-day free trial
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 14 }}>
              {['Unlimited agents', 'Unlimited results', 'Priority runs', 'Email digest'].map(f => (
                <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-secondary)' }}>
                  <span style={{ color: '#2563eb', fontSize: 14 }}>✓</span> {f}
                </div>
              ))}
            </div>
            <button onClick={handleUpgrade} disabled={billingLoading} style={{
              fontSize: 13, fontWeight: 600, padding: '9px 20px', borderRadius: 9,
              border: 'none', background: '#2563eb', color: '#fff', cursor: 'pointer',
            }}>
              {billingLoading ? 'Redirecting…' : 'Try Pro free for 14 days →'}
            </button>
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 8 }}>
              No charge until trial ends. Cancel anytime.
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
