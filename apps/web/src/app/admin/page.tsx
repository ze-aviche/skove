'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@clerk/nextjs'
import { useToast } from '@/app/providers'
import { getAdminStats, getAdminUsers, adminChangePlan, adminDeleteUser, AdminUser, AdminStats } from '@/lib/api'

const PLAN_BADGE: Record<string, { color: string; bg: string }> = {
  free: { color: '#6b7280', bg: 'rgba(107,114,128,0.12)' },
  pro:  { color: '#2563eb', bg: 'rgba(37,99,235,0.12)' },
}

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div style={{
      background: 'var(--surface-2)', border: '1px solid var(--border)',
      borderRadius: 12, padding: '16px 20px',
    }}>
      <div style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 600, color: 'var(--text-primary)', letterSpacing: '-0.04em', fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>{sub}</div>}
    </div>
  )
}

export default function AdminPage() {
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [users, setUsers] = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [planFilter, setPlanFilter] = useState<'all' | 'free' | 'pro'>('all')
  const auth = useAuth()
  const { showToast } = useToast()

  useEffect(() => {
    async function load() {
      try {
        const token = await auth.getToken()
        const [s, u] = await Promise.all([getAdminStats(token), getAdminUsers(token)])
        setStats(s)
        setUsers(u)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load admin data')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const handlePlanChange = async (userId: string, plan: string) => {
    try {
      const token = await auth.getToken()
      const updated = await adminChangePlan(userId, plan, token)
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, plan: updated.plan } : u))
      showToast({ message: `Plan updated to ${plan}`, variant: 'success' })
    } catch (err) {
      showToast({ message: err instanceof Error ? err.message : 'Failed to update plan', variant: 'error' })
    }
  }

  const handleDelete = async (user: AdminUser) => {
    if (!window.confirm(`Delete ${user.email}? This removes all their agents, results, and their Clerk account. This cannot be undone.`)) return
    try {
      const token = await auth.getToken()
      await adminDeleteUser(user.id, token)
      setUsers(prev => prev.filter(u => u.id !== user.id))
      showToast({ message: `${user.email} deleted`, variant: 'success' })
    } catch (err) {
      showToast({ message: err instanceof Error ? err.message : 'Failed to delete user', variant: 'error' })
    }
  }

  const filtered = users.filter(u => {
    const matchSearch = !search || u.email.toLowerCase().includes(search.toLowerCase())
    const matchPlan = planFilter === 'all' || u.plan === planFilter
    return matchSearch && matchPlan
  })

  return (
    <div style={{ minHeight: '100vh', background: 'var(--surface-0)', padding: '36px 40px', fontFamily: 'var(--font-sans)' }}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <h1 style={{ fontSize: 22, fontWeight: 600, color: 'var(--text-primary)', letterSpacing: '-0.03em' }}>Admin</h1>
          <span style={{
            fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 99,
            background: 'rgba(239,68,68,0.12)', color: 'var(--red)',
            border: '1px solid rgba(239,68,68,0.2)',
          }}>Internal</span>
        </div>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>User management, subscriptions, and platform stats.</p>
      </div>

      {loading ? (
        <div style={{ color: 'var(--text-secondary)' }}>Loading…</div>
      ) : error ? (
        <div style={{ color: 'var(--red)', padding: '16px', background: 'rgba(239,68,68,0.08)', borderRadius: 10, border: '1px solid rgba(239,68,68,0.2)' }}>
          {error.includes('Forbidden') ? '⛔ You do not have admin access. Add your user ID to ADMIN_USER_IDS.' : error}
        </div>
      ) : (
        <>
          {/* Stats */}
          {stats && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 28 }}>
              <StatCard label="Total users" value={stats.totalUsers} />
              <StatCard label="Pro users" value={stats.proUsers} sub={`${stats.totalUsers > 0 ? Math.round(stats.proUsers / stats.totalUsers * 100) : 0}% of total`} />
              <StatCard label="Active agents" value={stats.totalAgents} />
              <StatCard label="Total results" value={stats.totalResults} />
            </div>
          )}

          {/* Filters */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 16, alignItems: 'center' }}>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by email…"
              style={{
                flex: 1, maxWidth: 300, padding: '8px 12px', fontSize: 13,
                background: 'var(--surface-2)', border: '1px solid var(--border)',
                borderRadius: 8, color: 'var(--text-primary)',
              }}
            />
            {(['all', 'free', 'pro'] as const).map(p => (
              <button key={p} onClick={() => setPlanFilter(p)} style={{
                fontSize: 12, fontWeight: 500, padding: '6px 14px', borderRadius: 99,
                border: `1px solid ${planFilter === p ? 'var(--brand)' : 'var(--border)'}`,
                background: planFilter === p ? 'var(--brand-dim)' : 'var(--surface-2)',
                color: planFilter === p ? 'var(--brand)' : 'var(--text-secondary)',
                cursor: 'pointer', textTransform: 'capitalize',
              }}>{p}</button>
            ))}
            <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-tertiary)' }}>
              {filtered.length} user{filtered.length !== 1 ? 's' : ''}
            </span>
          </div>

          {/* Users table */}
          <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
            {/* Table header */}
            <div style={{
              display: 'grid', gridTemplateColumns: '1fr 90px 80px 80px 120px 100px',
              padding: '10px 18px', borderBottom: '1px solid var(--border)',
              fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 500,
            }}>
              <span>Email</span>
              <span>Plan</span>
              <span>Agents</span>
              <span>Results</span>
              <span>Joined</span>
              <span>Actions</span>
            </div>

            {filtered.length === 0 ? (
              <div style={{ padding: '24px 18px', color: 'var(--text-secondary)', fontSize: 13 }}>No users match your filters.</div>
            ) : filtered.map((user, i) => {
              const badge = PLAN_BADGE[user.plan] ?? PLAN_BADGE.free
              return (
                <div key={user.id} style={{
                  display: 'grid', gridTemplateColumns: '1fr 90px 80px 80px 120px 100px',
                  padding: '12px 18px', alignItems: 'center',
                  borderBottom: i < filtered.length - 1 ? '1px solid var(--border)' : 'none',
                  transition: 'background 0.1s',
                }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-3)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {user.email}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>
                      {user.id.slice(0, 18)}…
                    </div>
                  </div>

                  <span style={{
                    fontSize: 11, fontWeight: 600, padding: '2px 9px', borderRadius: 99,
                    background: badge.bg, color: badge.color, display: 'inline-block',
                    textTransform: 'capitalize',
                  }}>{user.plan}</span>

                  <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{user.agentCount}</span>
                  <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{user.resultCount}</span>
                  <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{new Date(user.createdAt).toLocaleDateString()}</span>

                  <div style={{ display: 'flex', gap: 6 }}>
                    <select
                      value={user.plan}
                      onChange={e => handlePlanChange(user.id, e.target.value)}
                      style={{
                        fontSize: 11, padding: '4px 6px', borderRadius: 6,
                        border: '1px solid var(--border)', background: 'var(--surface-3)',
                        color: 'var(--text-secondary)', cursor: 'pointer',
                      }}
                    >
                      <option value="free">Free</option>
                      <option value="pro">Pro</option>
                    </select>
                    <button onClick={() => handleDelete(user)} style={{
                      fontSize: 11, padding: '4px 8px', borderRadius: 6,
                      border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.08)',
                      color: 'var(--red)', cursor: 'pointer',
                    }}>Del</button>
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
