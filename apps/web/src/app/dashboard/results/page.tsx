'use client'

import { Fragment, useEffect, useMemo, useState } from 'react'
import { useAuth } from '@clerk/nextjs'
import { useToast } from '@/app/providers'
import { getResults, markResultRead, deleteResult, deleteResults, downloadDocument, scoreResult, toggleFavourite, toggleApplied, buildApplyPackage, saveApplyPackageEdits, getFillToken, ApplyPackageResponse, AgentResult } from '@/lib/api'

type Tab = 'All' | 'Unread' | 'Saved' | 'Applied'
const TABS: Tab[] = ['All', 'Unread', 'Saved', 'Applied']

function agentType(r: AgentResult): string {
  return typeof r.metadata === 'object' && r.metadata !== null && 'agentType' in r.metadata
    ? String((r.metadata as Record<string, unknown>).agentType).toLowerCase()
    : ''
}

function iconForResult(r: AgentResult): string {
  return agentType(r).includes('job') ? '💼' : '◎'
}

function urlLabel(_r: AgentResult): string {
  return 'View job →'
}

function bodyForResult(r: AgentResult): string {
  const t = agentType(r)
  if (r.value) return `${r.value} · ${t || 'Agent result'}`
  return t || 'Agent update available.'
}

function matchesTab(r: AgentResult, tab: Tab): boolean {
  if (tab === 'All') return true
  if (tab === 'Unread') return !r.isRead
  if (tab === 'Saved') return r.isFavourite
  if (tab === 'Applied') return r.isApplied
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
  const [expandedCoverLetter, setExpandedCoverLetter] = useState<string | null>(null)
  const [downloading, setDownloading] = useState<string | null>(null)
  const [scoringIds, setScoringIds] = useState<Set<string>>(new Set())
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [deleting, setDeleting] = useState(false)
  const [applyingId, setApplyingId] = useState<string | null>(null)
  const [applyModal, setApplyModal] = useState<ApplyPackageResponse | null>(null)
  const auth = useAuth()
  const { showToast } = useToast()

  useEffect(() => {
    async function load() {
      try {
        const token = await auth.getToken()
        setResults(await getResults(token))
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load results'
        setError(message)
        showToast({ message, variant: 'error' })
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const unread = useMemo(() => results.filter(r => !r.isRead).length, [results])
  const filtered = useMemo(() => results.filter(r => matchesTab(r, activeTab)), [results, activeTab])

  const tabCounts = useMemo(() => {
    const counts: Partial<Record<Tab, number>> = {}
    for (const tab of TABS) {
      if (tab !== 'All') counts[tab] = results.filter(r => matchesTab(r, tab)).length
    }
    return counts
  }, [results])

  const handleMarkRead = async (id: string) => {
    try {
      const token = await auth.getToken()
      const updated = await markResultRead(id, token)
      setResults(prev => prev.map(r => r.id === updated.id ? updated : r))
      window.dispatchEvent(new CustomEvent('results:changed'))
      showToast({ message: 'Marked as read', variant: 'success' })
    } catch (err) {
      showToast({ message: err instanceof Error ? err.message : 'Failed to mark read', variant: 'error' })
    }
  }

  const handleMarkAllRead = async () => {
    const unreadItems = filtered.filter(r => !r.isRead)
    if (unreadItems.length === 0) return
    try {
      const token = await auth.getToken()
      await Promise.all(unreadItems.map(r => markResultRead(r.id, token)))
      setResults(prev => prev.map(r => unreadItems.some(u => u.id === r.id) ? { ...r, isRead: true } : r))
      window.dispatchEvent(new CustomEvent('results:changed'))
      showToast({ message: `${unreadItems.length} result${unreadItems.length !== 1 ? 's' : ''} marked read`, variant: 'success' })
    } catch (err) {
      showToast({ message: err instanceof Error ? err.message : 'Failed to mark all read', variant: 'error' })
    }
  }

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const allFilteredSelected = filtered.length > 0 && filtered.every(r => selected.has(r.id))

  const toggleSelectAll = () => {
    if (allFilteredSelected) {
      setSelected(prev => {
        const next = new Set(prev)
        filtered.forEach(r => next.delete(r.id))
        return next
      })
    } else {
      setSelected(prev => {
        const next = new Set(prev)
        filtered.forEach(r => next.add(r.id))
        return next
      })
    }
  }

  const handleDeleteOne = async (id: string) => {
    try {
      const token = await auth.getToken()
      await deleteResult(id, token)
      setResults(prev => prev.filter(r => r.id !== id))
      setSelected(prev => { const next = new Set(prev); next.delete(id); return next })
      window.dispatchEvent(new CustomEvent('results:changed'))
      showToast({ message: 'Result deleted', variant: 'success' })
    } catch (err) {
      showToast({ message: err instanceof Error ? err.message : 'Failed to delete', variant: 'error' })
    }
  }

  const handleDeleteSelected = async () => {
    const ids = Array.from(selected)
    if (ids.length === 0) return
    setDeleting(true)
    try {
      const token = await auth.getToken()
      await deleteResults(ids, token)
      setResults(prev => prev.filter(r => !selected.has(r.id)))
      setSelected(new Set())
      window.dispatchEvent(new CustomEvent('results:changed'))
      showToast({ message: `${ids.length} result${ids.length !== 1 ? 's' : ''} deleted`, variant: 'success' })
    } catch (err) {
      showToast({ message: err instanceof Error ? err.message : 'Failed to delete', variant: 'error' })
    } finally {
      setDeleting(false)
    }
  }

  const handleScore = async (r: AgentResult) => {
    setScoringIds(prev => new Set(prev).add(r.id))
    try {
      const token = await auth.getToken()
      const res = await scoreResult(r.id, token)
      setResults(prev => prev.map(x => x.id === r.id ? { ...x, metadata: res.metadata } : x))
      showToast({ message: res.already ? 'Already scored' : 'Score complete', variant: 'success' })
    } catch (err) {
      showToast({ message: err instanceof Error ? err.message : 'Scoring failed', variant: 'error' })
    } finally {
      setScoringIds(prev => { const s = new Set(prev); s.delete(r.id); return s })
    }
  }

  const handleFavourite = async (r: AgentResult) => {
    try {
      const token = await auth.getToken()
      const updated = await toggleFavourite(r.id, token)
      setResults(prev => prev.map(x => x.id === updated.id ? updated : x))
      showToast({ message: updated.isFavourite ? 'Added to saved' : 'Removed from saved', variant: 'success' })
    } catch (err) {
      showToast({ message: err instanceof Error ? err.message : 'Failed to update', variant: 'error' })
    }
  }

  const handleApplied = async (r: AgentResult) => {
    try {
      const token = await auth.getToken()
      const updated = await toggleApplied(r.id, token)
      setResults(prev => prev.map(x => x.id === updated.id ? updated : x))
      showToast({ message: updated.isApplied ? 'Marked as applied' : 'Removed from applied', variant: 'success' })
    } catch (err) {
      showToast({ message: err instanceof Error ? err.message : 'Failed to update applied status', variant: 'error' })
    }
  }

  const handleAiApply = async (r: AgentResult) => {
    setApplyingId(r.id)
    try {
      const token = await auth.getToken()
      const pkg = await buildApplyPackage(r.id, token)
      setApplyModal(pkg)
    } catch (err) {
      showToast({ message: err instanceof Error ? err.message : 'AI Apply failed', variant: 'error' })
    } finally {
      setApplyingId(null)
    }
  }

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

  return (
    <div style={{ padding: '32px 36px', animation: 'fadeIn 0.4s ease' }}>
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
            <h1 style={{ fontSize: 22, fontWeight: 600, color: 'var(--text-primary)', letterSpacing: '-0.03em' }}>Results</h1>
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
          {/* Select-all + bulk delete toolbar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none' }}>
              <input
                type="checkbox"
                checked={allFilteredSelected}
                onChange={toggleSelectAll}
                style={{ width: 15, height: 15, cursor: 'pointer', accentColor: 'var(--brand)' }}
              />
              <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                {selected.size > 0 ? `${selected.size} selected` : 'Select all'}
              </span>
            </label>
            {selected.size > 0 && (
              <button
                onClick={handleDeleteSelected}
                disabled={deleting}
                style={{
                  fontSize: 12, fontWeight: 500,
                  padding: '5px 12px', borderRadius: 7,
                  border: '1px solid rgba(239,68,68,0.3)',
                  background: 'rgba(239,68,68,0.08)',
                  color: 'var(--red)',
                  cursor: deleting ? 'not-allowed' : 'pointer',
                  opacity: deleting ? 0.6 : 1,
                }}
              >
                {deleting ? 'Deleting…' : `Delete ${selected.size}`}
              </button>
            )}
          </div>

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
              {filtered.map((r) => {
                const meta = (r.metadata ?? {}) as Record<string, unknown>
                const hasResume = !!meta.tailoredResumeText
                const hasCover = !!meta.coverLetter
                const matchScore = meta.matchScore != null ? Number(meta.matchScore) : null
                const matchReasoning = typeof meta.matchReasoning === 'string' ? meta.matchReasoning : null
                const isJobResult = agentType(r).includes('job')
                const isScoring = scoringIds.has(r.id)

                return (
                  <div key={r.id} style={{
                    background: selected.has(r.id) ? 'var(--brand-dim)' : r.isRead ? 'var(--surface-1)' : 'var(--surface-2)',
                    border: `1px solid ${selected.has(r.id) ? 'rgba(59,130,246,0.3)' : r.isRead ? 'var(--border)' : 'var(--border-hover)'}`,
                    borderRadius: 12,
                    padding: '14px 16px',
                    display: 'flex',
                    gap: 14,
                    alignItems: 'flex-start',
                  }}>
                    <input
                      type="checkbox"
                      checked={selected.has(r.id)}
                      onChange={() => toggleSelect(r.id)}
                      style={{ marginTop: 10, width: 15, height: 15, cursor: 'pointer', flexShrink: 0, accentColor: 'var(--brand)' }}
                    />
                    <div style={{
                      width: 36, height: 36, borderRadius: 10,
                      background: 'var(--surface-3)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 18, flexShrink: 0,
                    }}>{iconForResult(r)}</div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <span style={{
                          fontSize: 13, fontWeight: r.isRead ? 400 : 600,
                          color: 'var(--text-primary)',
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                          {r.title || 'New agent finding'}
                        </span>
                        {!r.isRead && (
                          <span style={{
                            width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
                            background: 'var(--green)',
                            boxShadow: '0 0 6px var(--green)',
                            display: 'inline-block',
                          }} />
                        )}
                      </div>

                      {matchScore !== null && !isNaN(matchScore) && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                          <span style={{
                            fontSize: 11, fontWeight: 700,
                            padding: '2px 8px', borderRadius: 99,
                            background: matchScore >= 8 ? 'var(--success-dim)' : 'var(--brand-dim)',
                            color: matchScore >= 8 ? 'var(--success)' : 'var(--brand)',
                            border: `1px solid ${matchScore >= 8 ? 'rgba(16,185,129,0.2)' : 'rgba(59,130,246,0.2)'}`,
                          }}>
                            AI Match {matchScore}/10
                          </span>
                          {matchReasoning && (
                            <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{matchReasoning}</span>
                          )}
                        </div>
                      )}

                      <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: 8 }}>
                        {bodyForResult(r)}
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        {r.url && (
                          <a
                            href={r.url}
                            target="_blank"
                            rel="noreferrer"
                            onClick={() => { if (!r.isRead) handleMarkRead(r.id) }}
                            style={{ fontSize: 11, fontWeight: 500, color: 'var(--brand)', textDecoration: 'none' }}
                          >{urlLabel(r)}</a>
                        )}
                        {isJobResult && matchScore === null && (
                          <button
                            onClick={() => handleScore(r)}
                            disabled={isScoring}
                            style={{
                              fontSize: 11, fontWeight: 500,
                              padding: '4px 10px', borderRadius: 7,
                              border: '1px solid rgba(139,92,246,0.3)',
                              background: 'rgba(139,92,246,0.08)',
                              color: isScoring ? 'var(--text-tertiary)' : '#8b5cf6',
                              cursor: isScoring ? 'not-allowed' : 'pointer',
                              opacity: isScoring ? 0.6 : 1,
                            }}
                          >
                            {isScoring ? 'Scoring…' : '✦ Score match'}
                          </button>
                        )}
                        {isJobResult && r.url && (
                          <button
                            onClick={() => handleAiApply(r)}
                            disabled={applyingId === r.id}
                            style={{
                              fontSize: 11, fontWeight: 600,
                              padding: '4px 10px', borderRadius: 7,
                              border: '1px solid rgba(37,99,235,0.35)',
                              background: 'rgba(37,99,235,0.1)',
                              color: applyingId === r.id ? 'var(--text-tertiary)' : '#2563eb',
                              cursor: applyingId === r.id ? 'not-allowed' : 'pointer',
                            }}
                          >
                            {applyingId === r.id ? 'Preparing…' : '⚡ AI Apply'}
                          </button>
                        )}
                        {hasCover && (
                          <button
                            onClick={() => setExpandedCoverLetter(expandedCoverLetter === r.id ? null : r.id)}
                            style={{
                              fontSize: 11, fontWeight: 500,
                              padding: '4px 10px', borderRadius: 7,
                              border: '1px solid var(--border)',
                              background: 'var(--surface-3)',
                              color: 'var(--text-secondary)',
                              cursor: 'pointer',
                            }}
                          >
                            {expandedCoverLetter === r.id ? 'Hide cover letter' : '📝 View cover letter'}
                          </button>
                        )}
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

                      {expandedCoverLetter === r.id && hasCover && (
                        <div style={{
                          marginTop: 12, padding: '14px 16px',
                          background: 'var(--surface-1)',
                          border: '1px solid var(--border)',
                          borderRadius: 10,
                          fontSize: 12, color: 'var(--text-secondary)',
                          lineHeight: 1.7, whiteSpace: 'pre-wrap',
                        }}>
                          {String(meta.coverLetter)}
                        </div>
                      )}
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
                      <span style={{ fontSize: 11, color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>{new Date(r.createdAt).toLocaleString()}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {!r.isRead && (
                          <button onClick={() => handleMarkRead(r.id)} style={{
                            fontSize: 11, fontWeight: 600,
                            padding: '5px 10px', borderRadius: 7,
                            border: '1px solid var(--border)',
                            background: 'var(--surface-3)',
                            color: 'var(--text-secondary)',
                            cursor: 'pointer',
                            whiteSpace: 'nowrap',
                          }}>Mark read</button>
                        )}
                        <button
                          onClick={() => handleFavourite(r)}
                          title={r.isFavourite ? 'Remove from saved' : 'Save'}
                          style={{
                            fontSize: 15, lineHeight: 1,
                            padding: '5px 8px', borderRadius: 7,
                            border: `1px solid ${r.isFavourite ? 'rgba(245,158,11,0.35)' : 'var(--border)'}`,
                            background: r.isFavourite ? 'rgba(245,158,11,0.1)' : 'transparent',
                            color: r.isFavourite ? '#f59e0b' : 'var(--text-tertiary)',
                            cursor: 'pointer',
                          }}>{r.isFavourite ? '★' : '☆'}</button>
                        {isJobResult && (
                          <button
                            onClick={() => handleApplied(r)}
                            title={r.isApplied ? 'Mark as not applied' : 'Mark as applied'}
                            style={{
                              fontSize: 11, fontWeight: 600,
                              padding: '5px 10px', borderRadius: 7,
                              border: `1px solid ${r.isApplied ? 'rgba(16,185,129,0.4)' : 'var(--border)'}`,
                              background: r.isApplied ? 'rgba(16,185,129,0.12)' : 'transparent',
                              color: r.isApplied ? 'var(--success)' : 'var(--text-tertiary)',
                              cursor: 'pointer',
                              whiteSpace: 'nowrap',
                            }}
                          >{r.isApplied ? '✓ Applied' : 'Mark applied'}</button>
                        )}
                        <button
                          onClick={() => handleDeleteOne(r.id)}
                          title="Delete result"
                          style={{
                            fontSize: 11, fontWeight: 500,
                            padding: '5px 10px', borderRadius: 7,
                            border: '1px solid rgba(239,68,68,0.25)',
                            background: 'transparent',
                            color: 'var(--red)',
                            cursor: 'pointer',
                          }}>Delete</button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}

      {applyModal && (
        <ApplyReviewModal
          data={applyModal}
          onClose={() => setApplyModal(null)}
        />
      )}
    </div>
  )
}

function ApplyReviewModal({ data, onClose }: { data: ApplyPackageResponse; onClose: () => void }) {
  const { showToast } = useToast()
  const auth = useAuth()
  const { fields } = data.package

  const [answers, setAnswers] = useState(data.package.screeningAnswers)
  const [coverLetter, setCoverLetter] = useState(data.package.coverLetter)
  const [editingIdx, setEditingIdx] = useState<number | null>(null)
  const [editingCover, setEditingCover] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)

  const updateAnswer = (idx: number, value: string) => {
    setAnswers(prev => prev.map((a, i) => i === idx ? { ...a, answer: value } : a))
    setDirty(true)
  }

  const copyText = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text)
      showToast({ message: `${label} copied`, variant: 'success' })
    } catch {
      showToast({ message: 'Copy failed', variant: 'error' })
    }
  }

  const persist = async () => {
    const token = await auth.getToken()
    await saveApplyPackageEdits(data.applicationId, { screeningAnswers: answers, coverLetter }, token)
  }

  const saveEdits = async () => {
    setSaving(true)
    try {
      await persist()
      setDirty(false)
      setEditingIdx(null)
      setEditingCover(false)
      showToast({ message: 'Changes saved', variant: 'success' })
    } catch (err) {
      showToast({ message: err instanceof Error ? err.message : 'Failed to save', variant: 'error' })
    } finally {
      setSaving(false)
    }
  }

  const [prefilling, setPrefilling] = useState(false)
  const handlePrefill = async () => {
    if (!data.applyUrl) return
    setPrefilling(true)
    try {
      const token = await auth.getToken()
      // Persist any pending edits so the extension fetches the latest wording
      if (dirty) { await persist(); setDirty(false); setEditingIdx(null); setEditingCover(false) }
      const { token: fillToken } = await getFillToken(data.applicationId, token)
      const sep = data.applyUrl.includes('#') ? '&' : '#'
      window.open(`${data.applyUrl}${sep}skove=${encodeURIComponent(fillToken)}`, '_blank', 'noopener')
    } catch (err) {
      showToast({ message: err instanceof Error ? err.message : 'Failed to prepare autofill', variant: 'error' })
    } finally {
      setPrefilling(false)
    }
  }

  const screeningAnswers = answers

  const fieldRows: Array<[string, string]> = [
    ['First name', fields.firstName],
    ['Last name', fields.lastName],
    ['Email', fields.email],
    ['Phone', fields.phone],
    ['Location', fields.location],
    ['LinkedIn', fields.linkedinUrl],
    ['GitHub', fields.githubUrl],
    ['Portfolio', fields.portfolioUrl],
    ['Work authorization', fields.workAuthorization],
    ['Needs sponsorship', fields.needsSponsorship ? 'Yes' : 'No'],
  ]

  const copyAll = async () => {
    const lines = [
      ...fieldRows.map(([k, v]) => `${k}: ${v}`),
      '',
      ...screeningAnswers.map(a => `Q: ${a.question}\nA: ${a.answer}`),
      '',
      'Cover letter:',
      coverLetter,
    ]
    try {
      await navigator.clipboard.writeText(lines.join('\n'))
      showToast({ message: 'Copied to clipboard', variant: 'success' })
    } catch {
      showToast({ message: 'Copy failed', variant: 'error' })
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1000, padding: 20,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--surface-1)', border: '1px solid var(--border)',
          borderRadius: 16, padding: 24, maxWidth: 620, width: '100%',
          maxHeight: '85vh', overflowY: 'auto',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
          <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--text-primary)' }}>⚡ AI Apply — review</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 18, color: 'var(--text-tertiary)', cursor: 'pointer' }}>✕</button>
        </div>
        <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 18 }}>
          Detected ATS: <b style={{ color: 'var(--text-primary)' }}>{data.atsType}</b>. Review the drafted answers, then open the application form. Nothing is submitted automatically yet — you stay in control of the final submit.
        </p>

        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>Your details</div>
        <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: '6px 12px', marginBottom: 20, fontSize: 12 }}>
          {fieldRows.map(([k, v]) => (
            <Fragment key={k}>
              <div style={{ color: 'var(--text-tertiary)' }}>{k}</div>
              <div style={{ color: v ? 'var(--text-primary)' : 'var(--text-tertiary)' }}>{v || '—'}</div>
            </Fragment>
          ))}
        </div>

        {screeningAnswers.length > 0 && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>Screening answers</div>
              {dirty && (
                <button onClick={saveEdits} disabled={saving} style={{
                  fontSize: 11, fontWeight: 600, padding: '4px 12px', borderRadius: 7,
                  border: 'none', background: '#2563eb', color: '#fff', cursor: saving ? 'not-allowed' : 'pointer',
                }}>{saving ? 'Saving…' : 'Save changes'}</button>
              )}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
              {screeningAnswers.map((a, i) => {
                const isEditing = editingIdx === i
                return (
                  <div key={i} style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{a.question}</div>
                      <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                        <button
                          onClick={() => setEditingIdx(isEditing ? null : i)}
                          title={isEditing ? 'Done editing' : 'Edit answer'}
                          style={{ fontSize: 11, padding: '2px 7px', borderRadius: 6, border: '1px solid var(--border)', background: isEditing ? 'var(--brand-dim)' : 'var(--surface-3)', color: isEditing ? 'var(--brand)' : 'var(--text-secondary)', cursor: 'pointer', whiteSpace: 'nowrap' }}
                        >{isEditing ? '✓ Done' : '✎ Edit'}</button>
                        <button
                          onClick={() => copyText(a.answer, 'Answer')}
                          title="Copy answer"
                          style={{ fontSize: 11, padding: '2px 7px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface-3)', color: 'var(--text-secondary)', cursor: 'pointer', whiteSpace: 'nowrap' }}
                        >⧉ Copy</button>
                      </div>
                    </div>
                    {isEditing ? (
                      <textarea
                        value={a.answer}
                        onChange={e => updateAnswer(i, e.target.value)}
                        rows={Math.max(3, Math.ceil((a.answer.length || 1) / 60))}
                        autoFocus
                        style={{
                          width: '100%', fontSize: 12, lineHeight: 1.6, padding: '8px 10px',
                          borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-1)',
                          color: 'var(--text-primary)', outline: 'none', resize: 'vertical', fontFamily: 'inherit',
                        }}
                      />
                    ) : (
                      <div style={{ fontSize: 12, color: a.answer ? 'var(--text-secondary)' : 'var(--text-tertiary)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                        {a.answer || '(no answer — click Edit to fill this in)'}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </>
        )}

        {(coverLetter || editingCover) && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>Cover letter</div>
              <div style={{ display: 'flex', gap: 4 }}>
                <button
                  onClick={() => setEditingCover(v => !v)}
                  title={editingCover ? 'Done editing' : 'Edit cover letter'}
                  style={{ fontSize: 11, padding: '2px 7px', borderRadius: 6, border: '1px solid var(--border)', background: editingCover ? 'var(--brand-dim)' : 'var(--surface-3)', color: editingCover ? 'var(--brand)' : 'var(--text-secondary)', cursor: 'pointer', whiteSpace: 'nowrap' }}
                >{editingCover ? '✓ Done' : '✎ Edit'}</button>
                <button
                  onClick={() => copyText(coverLetter, 'Cover letter')}
                  title="Copy cover letter"
                  style={{ fontSize: 11, padding: '2px 7px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface-3)', color: 'var(--text-secondary)', cursor: 'pointer', whiteSpace: 'nowrap' }}
                >⧉ Copy</button>
              </div>
            </div>
            {editingCover ? (
              <textarea
                value={coverLetter}
                onChange={e => { setCoverLetter(e.target.value); setDirty(true) }}
                rows={Math.max(6, Math.ceil((coverLetter.length || 1) / 70))}
                autoFocus
                style={{
                  width: '100%', fontSize: 12, lineHeight: 1.7, padding: '10px 12px',
                  borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface-1)',
                  color: 'var(--text-primary)', outline: 'none', resize: 'vertical', fontFamily: 'inherit', marginBottom: 20,
                }}
              />
            ) : (
              <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px', fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.7, whiteSpace: 'pre-wrap', marginBottom: 20 }}>
                {coverLetter}
              </div>
            )}
          </>
        )}

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {dirty && (
            <button onClick={saveEdits} disabled={saving} style={{
              fontSize: 13, fontWeight: 600, padding: '9px 16px', borderRadius: 9,
              border: '1px solid rgba(37,99,235,0.35)', background: 'var(--brand-dim)',
              color: '#2563eb', cursor: saving ? 'not-allowed' : 'pointer',
            }}>{saving ? 'Saving…' : 'Save changes'}</button>
          )}
          <button onClick={copyAll} style={{
            fontSize: 13, fontWeight: 500, padding: '9px 16px', borderRadius: 9,
            border: '1px solid var(--border)', background: 'var(--surface-3)',
            color: 'var(--text-secondary)', cursor: 'pointer',
          }}>Copy all</button>
          {data.applyUrl && (
            <>
              <button onClick={handlePrefill} disabled={prefilling} style={{
                fontSize: 13, fontWeight: 600, padding: '9px 18px', borderRadius: 9,
                border: 'none', background: '#2563eb', color: '#fff',
                cursor: prefilling ? 'not-allowed' : 'pointer',
              }}>{prefilling ? 'Preparing…' : '⚡ Pre-fill application form →'}</button>
              <a href={data.applyUrl} target="_blank" rel="noreferrer" style={{
                fontSize: 13, fontWeight: 500, padding: '9px 16px', borderRadius: 9,
                border: '1px solid var(--border)', background: 'var(--surface-3)',
                color: 'var(--text-secondary)', textDecoration: 'none',
              }}>Open form only</a>
            </>
          )}
        </div>
        {data.applyUrl && (
          <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 10, lineHeight: 1.5 }}>
            Pre-fill needs the free Skove browser extension and works on Greenhouse forms today. It opens the form with your details, resume, and answers filled in — review everything, then submit yourself.
          </p>
        )}
      </div>
    </div>
  )
}
