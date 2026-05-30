'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@clerk/nextjs'
import { useToast } from '@/app/providers'
import { getResults, markResultRead, AgentResult } from '@/lib/api'

export default function ResultsPage() {
  const [results, setResults] = useState<AgentResult[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const auth = useAuth()
  const { showToast } = useToast()

  useEffect(() => {
    async function load() {
      try {
        const token = await auth.getToken()
        setResults(await getResults(token))
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load results'
        showToast({ message, variant: 'error' })
        setError(message)
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [])

  return (
    <div style={{ padding: '32px 36px', animation: 'fadeIn 0.4s ease' }}>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, color: 'var(--text-primary)', letterSpacing: '-0.03em', marginBottom: 4 }}>
          Results
        </h1>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
          Everything your agents have found, in one place.
        </p>
      </div>

      {loading ? (
        <div style={{ color: 'var(--text-secondary)' }}>Loading results…</div>
      ) : error ? (
        <div style={{ color: 'var(--red)' }}>{error}</div>
      ) : results.length === 0 ? (
        <div style={{ color: 'var(--text-secondary)' }}>No results yet. Deploy an agent to get started.</div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 4, marginBottom: 20, background: 'var(--surface-2)', borderRadius: 10, padding: 4, width: 'fit-content', border: '1px solid var(--border)' }}>
            {['All results', 'Unread', 'Flights', 'Jobs', 'Rentals'].map((tab, i) => (
              <button key={tab} style={{
                fontSize: 12, fontWeight: i === 0 ? 500 : 400,
                padding: '5px 14px', borderRadius: 7,
                border: 'none',
                background: i === 0 ? 'var(--surface-4)' : 'transparent',
                color: i === 0 ? 'var(--text-primary)' : 'var(--text-secondary)',
                cursor: 'pointer',
              }}>{tab}</button>
            ))}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {results.map((r) => (
              <div key={r.id} style={{
                background: 'var(--surface-2)',
                border: `1px solid ${r.isRead ? 'var(--border)' : 'var(--border-hover)'}`,
                borderRadius: 12,
                padding: '13px 16px',
                display: 'flex',
                alignItems: 'center',
                gap: 14,
              }}>
                <span style={{
                  width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                  background: r.isRead ? 'var(--text-tertiary)' : 'var(--green)',
                  boxShadow: r.isRead ? 'none' : '0 0 8px var(--green)',
                }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 13,
                    fontWeight: r.isRead ? 400 : 500,
                    color: r.isRead ? 'var(--text-secondary)' : 'var(--text-primary)',
                    marginBottom: 2,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {r.title}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                    {r.value ? `${r.value} · ` : ''}
                    {typeof r.metadata === 'object' && r.metadata !== null && 'agentType' in r.metadata ? String((r.metadata as any).agentType) : 'Agent result'}
                  </div>
                </div>
                <span style={{ fontSize: 11, color: 'var(--text-tertiary)', flexShrink: 0 }}>{new Date(r.createdAt).toLocaleString()}</span>
                {r.url && (
                  <a href={r.url} target="_blank" rel="noreferrer" style={{
                    fontSize: 11, fontWeight: 500,
                    padding: '4px 12px', borderRadius: 7,
                    border: '1px solid var(--brand)',
                    background: 'var(--brand-dim)',
                    color: 'var(--brand)',
                    cursor: 'pointer', flexShrink: 0,
                    textDecoration: 'none',
                  }}>Open</a>
                )}
                {!r.isRead && (
                  <button onClick={async () => {
                    try {
                      const token = await auth.getToken()
                      const updated = await markResultRead(r.id, token)
                      setResults((prev) => prev.map((p) => p.id === updated.id ? updated : p))
                      showToast({ message: 'Marked result as read', variant: 'success' })
                    } catch (err) {
                      showToast({ message: err instanceof Error ? err.message : 'Failed to mark read', variant: 'error' })
                    }
                  }} style={{
                    fontSize: 11, fontWeight: 500,
                    padding: '4px 12px', borderRadius: 7,
                    border: '1px solid var(--border)',
                    background: 'var(--surface-3)',
                    color: 'var(--text-secondary)',
                    cursor: 'pointer', flexShrink: 0,
                    marginLeft: 8,
                  }}>Mark read</button>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
