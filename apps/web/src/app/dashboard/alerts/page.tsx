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
  const [expandedCoverLetter, setExpandedCoverLetter] = useState<string | null>(null)
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

  const handleMarkAllRead = async () => {
    const unreadAlerts = alerts.filter((a) => !a.isRead)
    if (unreadAlerts.length === 0) return
    try {
      const token = await auth.getToken()
      await Promise.all(unreadAlerts.map((a) => markResultRead(a.id, token)))
      setAlerts((prev) => prev.map((a) => ({ ...a, isRead: true })))
      window.dispatchEvent(new CustomEvent('results:changed'))
      showToast({ message: `${unreadAlerts.length} alert${unreadAlerts.length !== 1 ? 's' : ''} marked read`, variant: 'success' })
    } catch (err) {
      showToast({ message: err instanceof Error ? err.message : 'Failed to mark all read', variant: 'error' })
    }
  }

  return (
    <div style={{ padding: '32px 36px', animation: 'fadeIn 0.4s ease' }}>
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
            <h1 style={{ fontSize: 22, fontWeight: 600, color: 'var(--text-primary)', letterSpacing: '-0.03em' }}>Alerts</h1>
            {unread > 0 && (
              <span style={{
                fontSize: 12, fontWeight: 600,
                padding: '2px 10px', borderRadius: 99,
                background: 'var(--warning-dim)',
                color: 'var(--warning)',
                border: '1px solid rgba(245,158,11,0.2)',
              }}>{unread} unread</span>
            )}
          </div>
          {unread > 0 && (
            <button onClick={handleMarkAllRead} style={{
              fontSize: 12, fontWeight: 500,
              padding: '7px 14px', borderRadius: 9,
              border: '1px solid var(--border)',
              background: 'var(--surface-2)',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
            }}>Mark all as read</button>
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
                  {/* AI match score */}
                  {alert.metadata && typeof alert.metadata === 'object' && 'matchScore' in alert.metadata && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <span style={{
                        fontSize: 11, fontWeight: 700,
                        padding: '2px 8px', borderRadius: 99,
                        background: Number(alert.metadata.matchScore) >= 8 ? 'var(--success-dim)' : 'var(--brand-dim)',
                        color: Number(alert.metadata.matchScore) >= 8 ? 'var(--success)' : 'var(--brand)',
                        border: `1px solid ${Number(alert.metadata.matchScore) >= 8 ? 'rgba(16,185,129,0.2)' : 'rgba(124,58,237,0.2)'}`,
                      }}>
                        AI Match {String(alert.metadata.matchScore)}/10
                      </span>
                      {'matchReasoning' in alert.metadata && alert.metadata.matchReasoning && (
                        <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                          {String(alert.metadata.matchReasoning)}
                        </span>
                      )}
                    </div>
                  )}
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{body}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
                    {alert.url && (
                      <a href={alert.url} target="_blank" rel="noreferrer" style={{
                        fontSize: 11, fontWeight: 500,
                        color: 'var(--brand)',
                        textDecoration: 'none',
                      }}>Apply →</a>
                    )}
                    {alert.metadata && typeof alert.metadata === 'object' && 'coverLetter' in alert.metadata && (
                      <button
                        onClick={() => setExpandedCoverLetter(
                          expandedCoverLetter === alert.id ? null : alert.id
                        )}
                        style={{
                          fontSize: 11, fontWeight: 500,
                          padding: '4px 10px', borderRadius: 7,
                          border: '1px solid var(--border)',
                          background: 'var(--surface-3)',
                          color: 'var(--text-secondary)',
                          cursor: 'pointer',
                        }}
                      >
                        {expandedCoverLetter === alert.id ? 'Hide cover letter' : '📝 View cover letter'}
                      </button>
                    )}
                  </div>
                  {expandedCoverLetter === alert.id && alert.metadata && typeof alert.metadata === 'object' && 'coverLetter' in alert.metadata && (
                    <div style={{
                      marginTop: 12,
                      padding: '14px 16px',
                      background: 'var(--surface-1)',
                      border: '1px solid var(--border)',
                      borderRadius: 10,
                      fontSize: 12,
                      color: 'var(--text-secondary)',
                      lineHeight: 1.7,
                      whiteSpace: 'pre-wrap',
                    }}>
                      {String(alert.metadata.coverLetter)}
                    </div>
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
