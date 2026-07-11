'use client'

import { useEffect, useState } from 'react'
import { useAuth, useClerk } from '@clerk/nextjs'
import { useRouter } from 'next/navigation'
import { useToast } from '@/app/providers'
import { getBillingPlan, createCheckoutSession, createBillingPortalSession, UserPlan, getProfile, saveProfile, ProfileInput } from '@/lib/api'
import { useSearchParams } from 'next/navigation'

const EMPTY_PROFILE: ProfileInput = {
  firstName: '', lastName: '', preferredFirstName: '', preferredLastName: '', initials: '',
  phone: '', city: '', country: '', currentLocation: '',
  workAuthorization: '', needsSponsorship: false,
  linkedinUrl: '', githubUrl: '', portfolioUrl: '',
  gender: '', race: '', hispanicLatino: '', veteranStatus: '', disabilityStatus: '', aiUsage: '', locatedBayArea: '',
  reasonForChange: '', compensationTarget: '', directReports: '',
}

const WORK_AUTH_OPTIONS = [
  { value: '', label: 'Select…' },
  { value: 'citizen', label: 'Citizen / Permanent resident' },
  { value: 'visa', label: 'Authorized on a visa' },
  { value: 'needs-sponsorship', label: 'Need sponsorship' },
]

const GENDER_OPTIONS = [
  { value: '', label: 'Select…' },
  { value: 'Male', label: 'Male' },
  { value: 'Female', label: 'Female' },
  { value: 'Non-binary', label: 'Non-binary' },
  { value: 'Decline to self-identify', label: 'Decline to self-identify' },
]

const RACE_OPTIONS = [
  { value: '', label: 'Select…' },
  { value: 'American Indian or Alaska Native', label: 'American Indian or Alaska Native' },
  { value: 'Asian', label: 'Asian' },
  { value: 'Black or African American', label: 'Black or African American' },
  { value: 'Native Hawaiian or Other Pacific Islander', label: 'Native Hawaiian or Other Pacific Islander' },
  { value: 'White', label: 'White' },
  { value: 'Two or More Races', label: 'Two or More Races' },
  { value: 'Decline to self-identify', label: 'Decline to self-identify' },
]

const YES_NO_DECLINE = [
  { value: '', label: 'Select…' },
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
  { value: 'decline', label: 'Decline to self-identify' },
]

const YES_NO = [
  { value: '', label: 'Select…' },
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
]

const VETERAN_OPTIONS = [
  { value: '', label: 'Select…' },
  { value: 'I am not a protected veteran', label: 'I am not a protected veteran' },
  { value: 'I identify as one or more of the classifications of protected veteran', label: 'I am a protected veteran' },
  { value: 'Decline to self-identify', label: 'Decline to self-identify' },
]

const inputStyle: React.CSSProperties = {
  fontSize: 13, padding: '8px 11px', borderRadius: 8,
  border: '1px solid var(--border)', background: 'var(--surface-3)',
  color: 'var(--text-primary)', width: '100%', outline: 'none',
}

const labelStyle: React.CSSProperties = {
  fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 5, display: 'block',
}

const PLAN_LABELS: Record<string, { label: string; color: string; bg: string; border: string }> = {
  free:  { label: 'Free',  color: '#6b7280', bg: 'rgba(107,114,128,0.1)', border: 'rgba(107,114,128,0.2)' },
  pro:   { label: 'Pro',   color: '#2563eb', bg: 'rgba(37,99,235,0.1)',   border: 'rgba(37,99,235,0.2)'   },
}

export default function ProfilePage() {
  const [loading, setLoading] = useState(true)
  const [billing, setBilling] = useState<UserPlan | null>(null)
  const [billingLoading, setBillingLoading] = useState(false)
  const [profile, setProfile] = useState<ProfileInput>(EMPTY_PROFILE)
  const [savingProfile, setSavingProfile] = useState(false)
  const auth = useAuth()
  const { showToast } = useToast()
  const searchParams = useSearchParams()

  useEffect(() => {
    async function load() {
      try {
        const token = await auth.getToken()
        const [billingRes, profileRes] = await Promise.all([
          getBillingPlan(token).catch(() => null),
          getProfile(token).catch(() => null),
        ])
        if (billingRes) setBilling(billingRes)
        if (profileRes?.profile) {
          const p = profileRes.profile
          const next: ProfileInput = { ...EMPTY_PROFILE }
          for (const key of Object.keys(EMPTY_PROFILE) as (keyof ProfileInput)[]) {
            const val = p[key as keyof typeof p]
            if (key === 'needsSponsorship') (next as any)[key] = val ?? false
            else (next as any)[key] = val ?? ''
          }
          setProfile(next)
        }
      } catch { /* non-fatal */ }
      finally { setLoading(false) }
    }
    load()
  }, [])

  const setField = (key: keyof ProfileInput, value: string | boolean) =>
    setProfile(prev => ({ ...prev, [key]: value }))

  const handleSaveProfile = async () => {
    setSavingProfile(true)
    try {
      const token = await auth.getToken()
      await saveProfile(profile, token)
      showToast({ message: 'Application info saved.', variant: 'success' })
    } catch (err) {
      showToast({ message: err instanceof Error ? err.message : 'Failed to save', variant: 'error' })
    } finally {
      setSavingProfile(false)
    }
  }

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

  const { signOut } = useClerk()
  const router = useRouter()

  const handleSignOut = () => signOut(() => router.push('/'))

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
      <div style={{
        marginTop: 16, background: 'var(--surface-2)', border: '1px solid var(--border)',
        borderRadius: 14, padding: 24,
      }}>
        <div style={{ marginBottom: 4, fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>
          Application info
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 18 }}>
          Used to auto-fill job application forms when you use AI Apply.
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
          <div>
            <label style={labelStyle}>First name</label>
            <input style={inputStyle} value={profile.firstName ?? ''} onChange={e => setField('firstName', e.target.value)} />
          </div>
          <div>
            <label style={labelStyle}>Last name</label>
            <input style={inputStyle} value={profile.lastName ?? ''} onChange={e => setField('lastName', e.target.value)} />
          </div>
          <div>
            <label style={labelStyle}>Preferred first name</label>
            <input style={inputStyle} value={profile.preferredFirstName ?? ''} onChange={e => setField('preferredFirstName', e.target.value)} />
          </div>
          <div>
            <label style={labelStyle}>Preferred last name</label>
            <input style={inputStyle} value={profile.preferredLastName ?? ''} onChange={e => setField('preferredLastName', e.target.value)} />
          </div>
          <div>
            <label style={labelStyle}>Initials</label>
            <input style={inputStyle} value={profile.initials ?? ''} onChange={e => setField('initials', e.target.value)} placeholder="e.g. A.M." />
          </div>
          <div>
            <label style={labelStyle}>Phone</label>
            <input style={inputStyle} value={profile.phone ?? ''} onChange={e => setField('phone', e.target.value)} placeholder="+1 555 123 4567" />
          </div>
          <div>
            <label style={labelStyle}>Work authorization</label>
            <select style={inputStyle} value={profile.workAuthorization ?? ''} onChange={e => setField('workAuthorization', e.target.value)}>
              {WORK_AUTH_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>City</label>
            <input style={inputStyle} value={profile.city ?? ''} onChange={e => setField('city', e.target.value)} />
          </div>
          <div>
            <label style={labelStyle}>Country</label>
            <input style={inputStyle} value={profile.country ?? ''} onChange={e => setField('country', e.target.value)} />
          </div>
          <div>
            <label style={labelStyle}>Current location</label>
            <input style={inputStyle} value={profile.currentLocation ?? ''} onChange={e => setField('currentLocation', e.target.value)} placeholder="e.g. San Francisco, CA" />
          </div>
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16, cursor: 'pointer' }}>
          <input type="checkbox" checked={Boolean(profile.needsSponsorship)} onChange={e => setField('needsSponsorship', e.target.checked)} />
          I will now or in the future require visa sponsorship
        </label>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12, marginBottom: 18 }}>
          <div>
            <label style={labelStyle}>LinkedIn URL</label>
            <input style={inputStyle} value={profile.linkedinUrl ?? ''} onChange={e => setField('linkedinUrl', e.target.value)} placeholder="https://linkedin.com/in/…" />
          </div>
          <div>
            <label style={labelStyle}>GitHub URL</label>
            <input style={inputStyle} value={profile.githubUrl ?? ''} onChange={e => setField('githubUrl', e.target.value)} placeholder="https://github.com/…" />
          </div>
          <div>
            <label style={labelStyle}>Portfolio / website</label>
            <input style={inputStyle} value={profile.portfolioUrl ?? ''} onChange={e => setField('portfolioUrl', e.target.value)} placeholder="https://…" />
          </div>
        </div>

        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>
          Demographic &amp; EEO (optional)
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 12 }}>
          Self-reported. Used only to answer voluntary EEO questions on application forms.
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 18 }}>
          <div>
            <label style={labelStyle}>Gender</label>
            <select style={inputStyle} value={profile.gender ?? ''} onChange={e => setField('gender', e.target.value)}>
              {GENDER_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Race</label>
            <select style={inputStyle} value={profile.race ?? ''} onChange={e => setField('race', e.target.value)}>
              {RACE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Hispanic or Latino?</label>
            <select style={inputStyle} value={profile.hispanicLatino ?? ''} onChange={e => setField('hispanicLatino', e.target.value)}>
              {YES_NO_DECLINE.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Veteran status</label>
            <select style={inputStyle} value={profile.veteranStatus ?? ''} onChange={e => setField('veteranStatus', e.target.value)}>
              {VETERAN_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Disability status</label>
            <select style={inputStyle} value={profile.disabilityStatus ?? ''} onChange={e => setField('disabilityStatus', e.target.value)}>
              {YES_NO_DECLINE.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        </div>

        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 12 }}>
          Common screening questions
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12, marginBottom: 18 }}>
          <div>
            <label style={labelStyle}>Are you currently located in the Bay Area?</label>
            <select style={inputStyle} value={profile.locatedBayArea ?? ''} onChange={e => setField('locatedBayArea', e.target.value)}>
              {YES_NO.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>How are you using AI today?</label>
            <textarea
              style={{ ...inputStyle, resize: 'vertical', minHeight: 68, fontFamily: 'inherit' }}
              rows={3}
              value={profile.aiUsage ?? ''}
              onChange={e => setField('aiUsage', e.target.value)}
              placeholder="A sentence or two on how you use AI in your work."
            />
          </div>
          <div>
            <label style={labelStyle}>Why are you looking for a change / why did you leave your last role?</label>
            <textarea
              style={{ ...inputStyle, resize: 'vertical', minHeight: 68, fontFamily: 'inherit' }}
              rows={3}
              value={profile.reasonForChange ?? ''}
              onChange={e => setField('reasonForChange', e.target.value)}
              placeholder="Your reason for seeking a new opportunity."
            />
          </div>
          <div>
            <label style={labelStyle}>Compensation target for this role</label>
            <input style={inputStyle} value={profile.compensationTarget ?? ''} onChange={e => setField('compensationTarget', e.target.value)} placeholder="e.g. $160k–$180k base" />
          </div>
          <div>
            <label style={labelStyle}>Do you have direct reports? If so, how many?</label>
            <input style={inputStyle} value={profile.directReports ?? ''} onChange={e => setField('directReports', e.target.value)} placeholder="e.g. No / 3 direct reports" />
          </div>
        </div>

        <button onClick={handleSaveProfile} disabled={savingProfile} style={{
          fontSize: 13, fontWeight: 600, padding: '9px 20px', borderRadius: 9,
          border: 'none', background: '#2563eb', color: '#fff', cursor: 'pointer',
        }}>
          {savingProfile ? 'Saving…' : 'Save application info'}
        </button>
      </div>

      <div style={{ marginTop: 16 }}>
        <button
          onClick={handleSignOut}
          style={{
            fontSize: 13, fontWeight: 500, padding: '9px 18px', borderRadius: 9,
            border: '1px solid rgba(239,68,68,0.25)', background: 'rgba(239,68,68,0.06)',
            color: '#ef4444', cursor: 'pointer', width: '100%',
          }}
        >
          Sign out
        </button>
      </div>
    </div>
  )
}
