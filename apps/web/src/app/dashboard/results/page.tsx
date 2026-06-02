'use client'

import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '@clerk/nextjs'
import { useToast } from '@/app/providers'
import { getResults, markResultRead, downloadDocument, AgentResult } from '@/lib/api'

type Tab = 'All' | 'Unread' | 'Flights' | 'Jobs' | 'Rentals' | 'Stocks' | 'News'

const TABS: Tab[] = ['All', 'Unread', 'Flights', 'Jobs', 'Rentals', 'Stocks', 'News']

function agentType(r: AgentResult): string {
  return typeof r.metadata === 'object' && r.metadata !== null && 'agentType' in r.metadata
    ? String((r.metadata as Record<string, unknown>).agentType).toLowerCase()
    : ''
}

function urlLabel(r: AgentResult): string {
  const t = agentType(r)
  if (t.includes('flight')) return 'View flights'
  if (t.includes('rental')) return 'View listing'
  if (t.includes('stock')) return 'View stock'
  if (t.includes('news') || t.includes('keyword')) return 'Read article'
  return 'Open'
}

function matchesTab(r: AgentResult, tab: Tab): boolean {
  if (tab === 'All') return true
  if (tab === 'Unread') return !r.isRead
  const t = agentType(r)
  if (tab === 'Flights') return t.includes('flight')
  if (tab === 'Jobs') return t.includes('job')
  if (tab === 'Rentals') return t.includes('rental')
  if (tab === 'Stocks') return t.includes('stock')
  if (tab === 'News') return t.includes('news') || t.includes('keyword')
  return false
}

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim().replace(/\s+/g, '_').slice(0, 40)
}

export default function ResultsPage() {
  const [results, setResults] = useState<AgentResult[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<Tab>('All')
  const [downloading, setDownloading] = useState<string | null>(null)
  const auth = useAuth()
  const { showToast } = useToast()

  const handleDownload = async (r: AgentResult, type: 'resume' | 'cover', format: 'pdf' | 'docx') => {
    const key = `${r.id}-${type}-${format}`
    setDownloading(key)
    try {
      const token = await auth.getToken()
      const meta = (r.metadata ?? {}) as Record<string, unknown>
      const jobTitle = typeof meta.jobTitle === 'string' ? meta.jobTitle : 'position'
      const company = typeof meta.company === 'string' ? meta.company : 'company'
      const slug = slugify(`${jobTitle}_${company}`)
      const prefix = type === 'cover' ? 'cover_letter' : 'resume'
      await downloadDocument(r.id, type, format, `${prefix}_${slug}.${format}`, token)
    } catch (err) {
      showToast({ message: err instanceof Error ? err.message : 'Download failed', variant: 'error' })
    } finally {
      setDownloading(null)
    }
  }

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

  const filtered = useMemo(() => results.filter(r => matchesTab(r, activeTab)), [results, activeTab])

  const handleMarkAllRead = async () => {
    const unread = filtered.filter(r => !r.isRead)
    if (unread.length === 0) return
    try {
      const token = await auth.getToken()
      await Promise.all(unread.map(r => markResultRead(r.id, token)))
      setResults(prev => prev.map(r => unread.some(u => u.id === r.id) ? { ...r, isRead: true } : r))
      showToast({ message: `${unread.length} result${unread.length !== 1 ? 's' : ''} marked read`, variant: 'success' })
    } catch (err) {
      showToast({ message: err instanceof Error ? err.message : 'Failed to mark all read', variant: 'error' })
    }
  }

  const tabCounts = useMemo(() => {
    const counts: Partial<Record<Tab, number>> = {}
    for (const tab of TABS) {
      const n = results.filter(r => matchesTab(r, tab)).length
      if (tab !== 'All') counts[tab] = n
    }
    return counts
  }, [results])

  return (
    <div style={{ padding: '32px 36px', animation: 'fadeIn 0.4s ease' }}>
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <h1 style={{ fontSize: 22, fontWeight: 600, color: 'var(--text-primary)', letterSpacing: '-0.03em' }}>Results</h1>
          {filtered.some(r => !r.isRead) && (
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
          <div className="tab-bar" style={{ display: 'flex', gap: 4, marginBottom: 20, background: 'var(--surface-2)', borderRadius: 10, padding: 4, width: 'fit-content', maxWidth: '100%', border: '1px solid var(--border)' }}>
            {TABS.map((tab) => {
              const active = tab === activeTab
              const count = tab === 'All' ? results.length : tabCounts[tab] ?? 0
              return (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  style={{
                    fontSize: 12, fontWeight: active ? 500 : 400,
                    padding: '5px 14px', borderRadius: 7,
                    border: 'none',
                    background: active ? 'var(--surface-4)' : 'transparent',
                    color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
                    cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: 6,
                  }}
                >
                  {tab}
                  {count > 0 && (
                    <span style={{
                      fontSize: 10, fontWeight: 600,
                      padding: '1px 6px', borderRadius: 99,
                      background: active ? 'var(--brand-dim)' : 'var(--surface-3)',
                      color: active ? 'var(--brand)' : 'var(--text-tertiary)',
                      border: `1px solid ${active ? 'rgba(59,130,246,0.2)' : 'var(--border)'}`,
                    }}>{count}</span>
                  )}
                </button>
              )
            })}
          </div>

          {filtered.length === 0 ? (
            <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>No results in this category.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {filtered.map((r) => (
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
                      {agentType(r) || 'Agent result'}
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
                    }}>{urlLabel(r)}</a>
                  )}
                  {agentType(r).includes('job') && (() => {
                    const meta = (r.metadata ?? {}) as Record<string, unknown>
                    const hasResume = !!meta.tailoredResumeText
                    const hasCover = !!meta.coverLetter
                    if (!hasResume && !hasCover) return null
                    return (
                      <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                        {hasResume && (
                          <>
                            <button onClick={() => handleDownload(r, 'resume', 'pdf')} disabled={!!downloading} style={{ fontSize: 10, padding: '3px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface-3)', color: 'var(--text-secondary)', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                              {downloading === `${r.id}-resume-pdf` ? '…' : 'CV PDF'}
                            </button>
                            <button onClick={() => handleDownload(r, 'resume', 'docx')} disabled={!!downloading} style={{ fontSize: 10, padding: '3px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface-3)', color: 'var(--text-secondary)', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                              {downloading === `${r.id}-resume-docx` ? '…' : 'CV Word'}
                            </button>
                          </>
                        )}
                        {hasCover && (
                          <>
                            <button onClick={() => handleDownload(r, 'cover', 'pdf')} disabled={!!downloading} style={{ fontSize: 10, padding: '3px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface-3)', color: 'var(--text-secondary)', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                              {downloading === `${r.id}-cover-pdf` ? '…' : 'CL PDF'}
                            </button>
                            <button onClick={() => handleDownload(r, 'cover', 'docx')} disabled={!!downloading} style={{ fontSize: 10, padding: '3px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface-3)', color: 'var(--text-secondary)', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                              {downloading === `${r.id}-cover-docx` ? '…' : 'CL Word'}
                            </button>
                          </>
                        )}
                      </div>
                    )
                  })()}
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
                    }}>Mark read</button>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
