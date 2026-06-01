'use client'

import { useEffect, useRef, useState } from 'react'
import { useAuth } from '@clerk/nextjs'
import { useToast } from '@/app/providers'
import { getResumeStatus, uploadResume, getBillingPlan, createCheckoutSession, createBillingPortalSession, UserPlan } from '@/lib/api'
import { useSearchParams } from 'next/navigation'

const PLAN_LABELS: Record<string, { label: string; color: string; bg: string; border: string }> = {
  free:  { label: 'Free',  color: '#6b7280', bg: 'rgba(107,114,128,0.1)', border: 'rgba(107,114,128,0.2)' },
  pro:   { label: 'Pro',   color: '#2563eb', bg: 'rgba(37,99,235,0.1)',   border: 'rgba(37,99,235,0.2)'   },
}

export default function ProfilePage() {
  const [hasResume, setHasResume] = useState(false)
  const [wordCount, setWordCount] = useState(0)
  const [uploading, setUploading] = useState(false)
  const [loading, setLoading] = useState(true)
  const [billing, setBilling] = useState<UserPlan | null>(null)
  const [billingLoading, setBillingLoading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const auth = useAuth()
  const { showToast } = useToast()
  const searchParams = useSearchParams()

  useEffect(() => {
    async function load() {
      try {
        const token = await auth.getToken()
        const [status, plan] = await Promise.all([
          getResumeStatus(token),
          getBillingPlan(token),
        ])
        setHasResume(status.hasResume)
        setWordCount(status.wordCount)
        setBilling(plan)
      } catch { /* no resume yet */ }
      finally { setLoading(false) }
    }
    load()
  }, [])

  useEffect(() => {
    if (searchParams.get('upgraded') === '1') {
      showToast({ message: 'Welcome to Pro! Your plan has been upgraded.', variant: 'success' })
    }
  }, [])

  const handleFile = async (file: File) => {
    if (!file.name.endsWith('.pdf')) {
      showToast({ message: 'Please upload a PDF file', variant: 'error' })
      return
    }
    setUploading(true)
    try {
      const token = await auth.getToken()
      const result = await uploadResume(file, token)
      setHasResume(true)
      setWordCount(result.wordCount)
      showToast({ message: `Resume uploaded — ${result.wordCount} words across ${result.pages} page${result.pages !== 1 ? 's' : ''}`, variant: 'success' })
    } catch (err) {
      showToast({ message: err instanceof Error ? err.message : 'Upload failed', variant: 'error' })
    } finally {
      setUploading(false)
    }
  }

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
        <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Manage your profile and subscription.</p>
      </div>

      {/* Plan section */}
      <div style={{
        background: 'var(--surface-2)', border: '1px solid var(--border)',
        borderRadius: 14, padding: 24, marginBottom: 16,
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
              Upgrade to Pro
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
              {billingLoading ? 'Redirecting…' : 'Upgrade to Pro →'}
            </button>
          </div>
        )}
      </div>

      {/* Resume section */}
      <div style={{
        background: 'var(--surface-2)', border: '1px solid var(--border)',
        borderRadius: 14, padding: 24,
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>Resume</div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
              Used by the job tracker to score listings and generate cover letters.
            </div>
          </div>
          {hasResume && (
            <span style={{
              fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 99,
              background: 'var(--success-dim)', color: 'var(--success)',
              border: '1px solid rgba(16,185,129,0.2)', flexShrink: 0,
            }}>Uploaded</span>
          )}
        </div>

        {loading ? (
          <div style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>Loading…</div>
        ) : hasResume ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{
              background: 'var(--surface-3)', border: '1px solid var(--border)', borderRadius: 10,
              padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 10, flex: 1,
            }}>
              <span style={{ fontSize: 18 }}>📄</span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>Resume on file</div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{wordCount.toLocaleString()} words extracted</div>
              </div>
            </div>
            <button onClick={() => fileRef.current?.click()} disabled={uploading} style={{
              fontSize: 12, padding: '8px 16px', borderRadius: 9,
              border: '1px solid var(--border)', background: 'var(--surface-3)',
              color: 'var(--text-secondary)', cursor: 'pointer', flexShrink: 0,
            }}>Replace</button>
          </div>
        ) : (
          <div
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }}
            style={{
              border: '2px dashed var(--border)', borderRadius: 12,
              padding: '32px 24px', textAlign: 'center', cursor: 'pointer',
            }}
          >
            <div style={{ fontSize: 28, marginBottom: 10 }}>📄</div>
            <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 4 }}>
              {uploading ? 'Uploading…' : 'Drop your resume here'}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>PDF only · max 5MB</div>
          </div>
        )}

        <input ref={fileRef} type="file" accept=".pdf" style={{ display: 'none' }}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />

        {!hasResume && (
          <div style={{
            marginTop: 14, padding: '10px 14px',
            background: 'var(--brand-dim)', border: '1px solid rgba(124,58,237,0.2)',
            borderRadius: 10, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5,
          }}>
            💡 Without a resume, the job tracker returns all listings. With a resume, Claude scores each job 1–10 and only alerts you on strong matches, plus generates a tailored cover letter.
          </div>
        )}
      </div>
    </div>
  )
}
