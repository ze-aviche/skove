'use client'

import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '@clerk/nextjs'
import { useToast } from '@/app/providers'
import { getResults, markResultRead, AgentResult } from '@/lib/api'

const defaultAlertIcon = '◎'

function iconForResult(result: AgentResult) {
  const agentType = typeof result.metadata === 'object' && result.metadata !== null && 'agentType' in result.metadata
    ? String((result.metadata as any).agentType).toLowerCase()
    : ''

  if (agentType.includes('flight')) return '✈️'
  if (agentType.includes('job')) return '💼'
  if (agentType.includes('rental') || agentType.includes('real estate')) return '🏠'
  if (agentType.includes('stock') || agentType.includes('finance')) return '📈'
  if (agentType.includes('news') || agentType.includes('keyword')) return '📰'
  return defaultAlertIcon
}

function titleForResult(result: AgentResult) {
  if (result.title) return result.title
  return 'New agent finding'
}

function bodyForResult(result: AgentResult) {
  if (result.value) return `${result.value} · ${typeof result.metadata === 'object' && result.metadata !== null && 'agentType' in result.metadata ? String((result.metadata as any).agentType) : 'Agent result'}`
  return typeof result.metadata === 'object' && result.metadata !== null && 'agentType' in result.metadata
    ? String((result.metadata as any).agentType)
    : 'Agent update available.'
}

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<AgentResult[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const auth = useAuth()
  const { showToast } = useToast()

  useEffect(() => {
    async function loadAlerts() {
      try {
        const token = await auth.getToken()
        const results = await getResults(token)
        setAlerts(results)
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load alerts'
        setError(message)
        showToast({ message, variant: 'error' })
      } finally {
        setLoading(false)
      }
    }

    loadAlerts()
  }, [auth, showToast])

  const unread = useMemo(() => alerts.filter((a) => !a.isRead).length, [alerts])

  const handleMarkRead = async (id: string) => {
    try {
      const token = await auth.getToken()
      const updated = await markResultRead(id, token)
      setAlerts((prev) => prev.map((alert) => alert.id === id ? updated : alert))
      window.dispatchEvent(new CustomEvent('results:changed'))
      showToast({ message: 'Alert marked read', variant: 'success' })
    } catch (err) {
      showToast({ message: err instanceof Error ? err.message : 'Failed to mark alert read', variant: 'error' })
    }
  }

  return (
    <div style={{ padding: '32px 36px', animation: 'fadeIn 0.4s ease' }}>
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
          <h1 style={{ fontSize: 22, fontWeight: 600, color: 'var(--text-primary)', letterSpacing: '-0.03em' }}>Alerts</h1>
          {unread > 0 && (
            <span style={{
              fontSize: 12, fontWeight: 600,
              padding: '2px 10px', borderRadius: 99,
              background: 'var(--amber-dim)',
              color: 'var(--amber)',
              border: '1px solid rgba(245,158,11,0.2)',
            }}>{unread} unread</span>
          )}
        </div>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
          Notifications when your agents find something worth acting on.
        </p>
      </div>

      {loading ? (
        <div style={{ color: 'var(--text-secondary)' }}>Loading alerts…</div>
      ) : error ? (
        <div style={{ color: 'var(--red)' }}>{error}</div>
      ) : alerts.length === 0 ? (
        <div style={{ color: 'var(--text-secondary)' }}>No alerts yet. Your agents will send notifications here as they find meaningful updates.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {alerts.map((alert) => {
            const icon = iconForResult(alert)
            const title = titleForResult(alert)
            const body = bodyForResult(alert)
            const time = new Date(alert.createdAt).toLocaleString()

            return (
              <div key={alert.id} style={{
                background: alert.isRead ? 'var(--surface-1)' : 'var(--surface-2)',
                border: `1px solid ${alert.isRead ? 'var(--border)' : 'var(--border-hover)'}`,
                borderRadius: 12,
                padding: '14px 16px',
                display: 'flex',
                gap: 14,
                alignItems: 'flex-start',
              }}>
                <div style={{
                  width: 36, height: 36,
                  borderRadius: 10,
                  background: 'var(--surface-3)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 18, flexShrink: 0,
                }}>{icon}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
                    <span style={{ fontSize: 13, fontWeight: alert.isRead ? 400 : 600, color: 'var(--text-primary)' }}>{title}</span>
                    {!alert.isRead && (
                      <span style={{
                        width: 7, height: 7, borderRadius: '50%',
                        background: 'var(--green)',
                        boxShadow: '0 0 6px var(--green)',
                        display: 'inline-block',
                      }} />
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{body}</div>
                  {alert.url && (
                    <a href={alert.url} target="_blank" rel="noreferrer" style={{
                      display: 'inline-block', marginTop: 10,
                      fontSize: 11, fontWeight: 500,
                      color: 'var(--brand)',
                      textDecoration: 'none',
                    }}>Open source</a>
                  )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8, flexShrink: 0 }}>
                  <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{time}</span>
                  {!alert.isRead && (
                    <button onClick={() => handleMarkRead(alert.id)} style={{
                      fontSize: 11, fontWeight: 600,
                      padding: '6px 10px', borderRadius: 8,
                      border: '1px solid var(--border)',
                      background: 'var(--surface-3)',
                      color: 'var(--text-secondary)',
                      cursor: 'pointer',
                    }}>Mark read</button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
