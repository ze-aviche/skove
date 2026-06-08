'use client'

import { useState, useRef, useEffect } from 'react'
import { useAuth } from '@clerk/nextjs'
import { useToast } from '@/app/providers'
import { searchJobs, saveAndScoreJob, saveJob, downloadDocument, toggleFavourite, toggleApplied, AtsJob, AgentResult } from '@/lib/api'
import JobTitlePicker from '@/components/JobTitlePicker'
import CompanyPicker from '@/components/CompanyPicker'
import LocationTagsPicker from '@/components/LocationTagsPicker'

const PAGE_SIZE = 25

function postedLabel(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
  if (isNaN(days) || days < 0) return 'Recently'
  if (days === 0) return 'Today'
  if (days === 1) return '1d ago'
  if (days < 7) return `${days}d ago`
  if (days < 30) return `${Math.floor(days / 7)}w ago`
  return `${Math.floor(days / 30)}mo ago`
}

function formatSalary(min?: number, max?: number): string | null {
  if (!min && !max) return null
  const lo = min ? `$${Math.round(min / 1000)}k` : null
  const hi = max ? `$${Math.round(max / 1000)}k` : null
  if (lo && hi) return `${lo}–${hi}`
  return lo ?? hi ?? null
}

function slugify(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim().replace(/\s+/g, '_').slice(0, 40)
}

type ScoredJob = {
  atsJob: AtsJob
  result?: AgentResult
  scoring?: boolean
}

export default function ExplorePage() {
  const { getToken } = useAuth()
  const { showToast } = useToast()

  // Search state
  const [titleQ, setTitleQ] = useState('')
  const [companyQ, setCompanyQ] = useState('')
  const [locationQ, setLocationQ] = useState('')
  const [specializationQ, setSpecializationQ] = useState('')
  const [token, setToken] = useState<string | undefined>(undefined)
  const [loading, setLoading] = useState(false)

  // Load token on mount so pickers work before first search
  useEffect(() => {
    getToken().then(t => setToken(t ?? undefined)).catch(() => {})
  }, [])

  // Specializations dropdown
  const specializations = ['AI/ML', 'CCaaS', 'Communication', 'Database', 'DevTools', 'E-commerce', 'FinTech', 'HR Tech', 'Infrastructure', 'Marketing/Analytics', 'Other']

  // Results state
  const [jobs, setJobs] = useState<ScoredJob[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [searched, setSearched] = useState(false)

  // Expanded row
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [downloading, setDownloading] = useState<string | null>(null)

  const inputStyle: React.CSSProperties = {
    flex: 1,
    minWidth: 160,
    height: 40,
    borderRadius: 10,
    border: '1px solid var(--border)',
    padding: '0 12px',
    background: 'var(--surface-1)',
    color: 'var(--text-primary)',
    fontSize: 13,
    outline: 'none',
  }

  const doSearch = async (newPage = 1) => {
    if (!titleQ && !companyQ && !locationQ && !specializationQ) {
      showToast({ message: 'Enter at least one search term', variant: 'error' })
      return
    }
    setLoading(true)
    setExpandedId(null)
    try {
      const tok = await getToken()
      setToken(tok ?? undefined)
      const token = tok
      const res = await searchJobs({ title: titleQ, company: companyQ, location: locationQ, specialization: specializationQ, page: newPage, limit: PAGE_SIZE }, token)
      setJobs(res.jobs.map(j => ({ atsJob: j })))
      setTotal(res.total)
      setPage(newPage)
      setSearched(true)
    } catch (err) {
      showToast({ message: err instanceof Error ? err.message : 'Search failed', variant: 'error' })
    } finally {
      setLoading(false)
    }
  }

  const handleSaveAndScore = async (jobId: string) => {
    setJobs(prev => prev.map(j => j.atsJob.id === jobId ? { ...j, scoring: true } : j))
    try {
      const token = await getToken()
      const res = await saveAndScoreJob(jobId, token)
      setJobs(prev => prev.map(j => j.atsJob.id === jobId ? { ...j, result: res.result, scoring: false } : j))
      const label = res.alreadyScored ? 'Already scored' : `Scored ${(res.result.metadata as any)?.matchScore ?? '?'}/10`
      showToast({ message: `${label} — saved to Results`, variant: 'success' })
      setExpandedId(jobId)
    } catch (err) {
      setJobs(prev => prev.map(j => j.atsJob.id === jobId ? { ...j, scoring: false } : j))
      showToast({ message: err instanceof Error ? err.message : 'Scoring failed', variant: 'error' })
    }
  }

  const handleToggleFavourite = async (resultId: string) => {
    try {
      const token = await getToken()
      const updated = await toggleFavourite(resultId, token)
      setJobs(prev => prev.map(j => j.result?.id === resultId ? { ...j, result: updated } : j))
      showToast({ message: updated.isFavourite ? 'Saved to favourites' : 'Removed from favourites', variant: 'success' })
    } catch {
      showToast({ message: 'Failed to update favourite', variant: 'error' })
    }
  }

  const handleToggleApplied = async (jobId: string, existingResultId?: string) => {
    try {
      const token = await getToken()
      let resultId = existingResultId
      if (!resultId) {
        const { result } = await saveJob(jobId, token)
        setJobs(prev => prev.map(j => j.atsJob.id === jobId ? { ...j, result } : j))
        resultId = result.id
      }
      const updated = await toggleApplied(resultId, token)
      setJobs(prev => prev.map(j => j.result?.id === resultId ? { ...j, result: updated } : j))
      showToast({ message: updated.isApplied ? 'Marked as applied' : 'Removed from applied', variant: 'success' })
    } catch {
      showToast({ message: 'Failed to update applied status', variant: 'error' })
    }
  }

  const handleDownload = async (result: AgentResult, type: 'resume' | 'cover', format: 'pdf' | 'docx') => {
    const key = `${result.id}-${type}-${format}`
    setDownloading(key)
    try {
      const token = await getToken()
      const meta = (result.metadata ?? {}) as Record<string, unknown>
      const jobTitle = typeof meta.jobTitle === 'string' ? meta.jobTitle : 'position'
      const company = typeof meta.company === 'string' ? meta.company : 'company'
      const prefix = type === 'cover' ? 'cover_letter' : 'resume'
      await downloadDocument(result.id, type, format, `${prefix}_${slugify(`${jobTitle}_${company}`)}.${format}`, token)
    } catch (err) {
      showToast({ message: err instanceof Error ? err.message : 'Download failed', variant: 'error' })
    } finally {
      setDownloading(null)
    }
  }

  const totalPages = Math.ceil(total / PAGE_SIZE)

  return (
    <div style={{ padding: '32px 36px', animation: 'fadeIn 0.4s ease' }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, color: 'var(--text-primary)', letterSpacing: '-0.03em', marginBottom: 4 }}>
          Job Explorer
        </h1>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
          Search the live ATS job database directly — then score and tailor your resume for any listing.
        </p>
      </div>

      {/* Search bar */}
      <div style={{
        background: 'var(--surface-2)',
        border: '1px solid var(--border)',
        borderRadius: 14,
        padding: '16px 18px',
        marginBottom: 24,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 4, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Job Title</div>
            <JobTitlePicker
              value={titleQ}
              onChange={setTitleQ}
              placeholder="Software Engineer, Data Scientist…"
              token={token}
            />
          </div>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 4, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Company</div>
            <CompanyPicker
              value={companyQ}
              onChange={setCompanyQ}
              placeholder="Genesys, Five9, NICE…"
              token={token}
            />
          </div>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 4, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Location</div>
            <LocationTagsPicker
              value={locationQ}
              onChange={setLocationQ}
              placeholder="Remote, Dallas TX…"
            />
          </div>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 4, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Specialization</div>
            <select
              style={{ ...inputStyle, width: '100%', height: 42, appearance: 'none' }}
              value={specializationQ}
              onChange={e => setSpecializationQ(e.target.value)}
            >
              <option value="">All specializations</option>
              {specializations.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            onClick={() => doSearch(1)}
            disabled={loading}
            style={{
              height: 40, padding: '0 20px', borderRadius: 10,
              border: '1px solid var(--brand)',
              background: 'var(--brand-dim)',
              color: 'var(--brand)',
              fontSize: 13, fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.6 : 1,
              whiteSpace: 'nowrap',
            }}
          >
            {loading ? 'Searching…' : 'Search'}
          </button>
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
          Tip: Leave a field blank to match all. Location normalizes "Remote", "USA-Remote", etc. automatically.
        </div>
      </div>

      {/* Results */}
      {!searched ? (
        <div style={{
          textAlign: 'center', padding: '60px 20px',
          color: 'var(--text-tertiary)', fontSize: 13,
        }}>
          Search the job database above to get started.
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
              {total === 0 ? 'No jobs found' : `${total.toLocaleString()} job${total !== 1 ? 's' : ''} found`}
            </span>
            {totalPages > 1 && (
              <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                Page {page} of {totalPages}
              </span>
            )}
          </div>

          {jobs.length === 0 ? (
            <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
              Try broadening your search — fewer filters return more results.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {jobs.map(({ atsJob: job, result, scoring }) => {
                const meta = result ? (result.metadata ?? {}) as Record<string, any> : null
                const matchScore = meta?.matchScore != null ? Number(meta.matchScore) : null
                const hasCover = !!meta?.coverLetter
                const hasResume = !!meta?.tailoredResumeText
                const isExpanded = expandedId === job.id
                const salary = formatSalary(job.salaryMin, job.salaryMax)

                return (
                  <div
                    key={job.id}
                    style={{
                      background: 'var(--surface-2)',
                      border: '1px solid var(--border)',
                      borderRadius: 12,
                      overflow: 'hidden',
                      transition: 'border-color 0.15s',
                    }}
                  >
                    {/* Row */}
                    <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 14 }}>
                      {/* Company badge */}
                      <div style={{
                        width: 36, height: 36, borderRadius: 10,
                        background: 'var(--surface-3)',
                        border: '1px solid var(--border)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 13, fontWeight: 700, color: 'var(--brand)',
                        flexShrink: 0, letterSpacing: '-0.02em',
                      }}>
                        {job.company.slice(0, 2).toUpperCase()}
                      </div>

                      {/* Main info */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 3 }}>
                          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {job.title}
                          </span>
                          {matchScore !== null && !isNaN(matchScore) && (
                            <span style={{
                              fontSize: 10, fontWeight: 700,
                              padding: '1px 7px', borderRadius: 99,
                              background: matchScore >= 8 ? 'var(--success-dim)' : 'var(--brand-dim)',
                              color: matchScore >= 8 ? 'var(--success)' : 'var(--brand)',
                              border: `1px solid ${matchScore >= 8 ? 'rgba(16,185,129,0.2)' : 'rgba(59,130,246,0.2)'}`,
                              flexShrink: 0,
                            }}>
                              {matchScore}/10 match
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                          <span style={{ fontWeight: 500 }}>{job.company}</span>
                          <span style={{ color: 'var(--text-tertiary)' }}>·</span>
                          <span>{job.location}</span>
                          {salary && (
                            <>
                              <span style={{ color: 'var(--text-tertiary)' }}>·</span>
                              <span style={{ color: 'var(--success)', fontWeight: 500 }}>{salary}</span>
                            </>
                          )}
                          <span style={{ color: 'var(--text-tertiary)' }}>·</span>
                          <span style={{ color: 'var(--text-tertiary)' }}>{postedLabel(job.postedAt)}</span>
                        </div>
                      </div>

                      {/* Actions */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                        {result && (
                          <button
                            onClick={() => handleToggleFavourite(result.id)}
                            title={result.isFavourite ? 'Remove from saved' : 'Save job'}
                            style={{
                              fontSize: 15, lineHeight: 1,
                              padding: '5px 8px', borderRadius: 7,
                              border: `1px solid ${result.isFavourite ? 'rgba(245,158,11,0.35)' : 'var(--border)'}`,
                              background: result.isFavourite ? 'rgba(245,158,11,0.1)' : 'transparent',
                              color: result.isFavourite ? '#f59e0b' : 'var(--text-tertiary)',
                              cursor: 'pointer',
                            }}
                          >{result.isFavourite ? '★' : '☆'}</button>
                        )}
                        <button
                          onClick={() => handleToggleApplied(job.id, result?.id)}
                          title={result?.isApplied ? 'Mark as not applied' : 'Mark as applied'}
                          style={{
                            fontSize: 11, fontWeight: 600,
                            padding: '5px 10px', borderRadius: 7,
                            border: `1px solid ${result?.isApplied ? 'rgba(16,185,129,0.4)' : 'var(--border)'}`,
                            background: result?.isApplied ? 'rgba(16,185,129,0.12)' : 'transparent',
                            color: result?.isApplied ? 'var(--success)' : 'var(--text-tertiary)',
                            cursor: 'pointer',
                            whiteSpace: 'nowrap',
                          }}
                        >{result?.isApplied ? '✓ Applied' : 'Mark applied'}</button>
                        <a
                          href={job.applyUrl}
                          target="_blank"
                          rel="noreferrer"
                          style={{
                            fontSize: 11, fontWeight: 500,
                            padding: '5px 12px', borderRadius: 7,
                            border: '1px solid var(--border)',
                            background: 'var(--surface-3)',
                            color: 'var(--text-secondary)',
                            textDecoration: 'none',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          Apply →
                        </a>
                        {result ? (
                          <button
                            onClick={() => setExpandedId(isExpanded ? null : job.id)}
                            style={{
                              fontSize: 11, fontWeight: 500,
                              padding: '5px 12px', borderRadius: 7,
                              border: '1px solid rgba(59,130,246,0.3)',
                              background: 'var(--brand-dim)',
                              color: 'var(--brand)',
                              cursor: 'pointer',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {isExpanded ? 'Hide details' : 'View score'}
                          </button>
                        ) : (
                          <button
                            onClick={() => handleSaveAndScore(job.id)}
                            disabled={!!scoring}
                            style={{
                              fontSize: 11, fontWeight: 500,
                              padding: '5px 12px', borderRadius: 7,
                              border: '1px solid rgba(139,92,246,0.3)',
                              background: 'rgba(139,92,246,0.08)',
                              color: scoring ? 'var(--text-tertiary)' : '#8b5cf6',
                              cursor: scoring ? 'not-allowed' : 'pointer',
                              opacity: scoring ? 0.6 : 1,
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {scoring ? 'Scoring…' : '✦ Score & save'}
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Expanded details */}
                    {isExpanded && result && meta && (
                      <div style={{
                        borderTop: '1px solid var(--border)',
                        padding: '14px 16px',
                        background: 'var(--surface-1)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 12,
                      }}>
                        {/* Match score + reasoning */}
                        {matchScore !== null && (
                          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                            <span style={{
                              fontSize: 11, fontWeight: 700, flexShrink: 0,
                              padding: '3px 10px', borderRadius: 99,
                              background: matchScore >= 8 ? 'var(--success-dim)' : 'var(--brand-dim)',
                              color: matchScore >= 8 ? 'var(--success)' : 'var(--brand)',
                              border: `1px solid ${matchScore >= 8 ? 'rgba(16,185,129,0.2)' : 'rgba(59,130,246,0.2)'}`,
                            }}>AI Match {matchScore}/10</span>
                            {meta.matchReasoning && (
                              <span style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                                {String(meta.matchReasoning)}
                              </span>
                            )}
                          </div>
                        )}

                        {/* Download buttons */}
                        {(hasResume || hasCover) && (
                          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                            <span style={{ fontSize: 11, color: 'var(--text-tertiary)', marginRight: 2 }}>Download:</span>
                            {hasResume && (
                              <>
                                <button onClick={() => handleDownload(result, 'resume', 'pdf')} disabled={!!downloading} style={{ fontSize: 10, padding: '3px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface-3)', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                                  {downloading === `${result.id}-resume-pdf` ? '…' : 'CV PDF'}
                                </button>
                                <button onClick={() => handleDownload(result, 'resume', 'docx')} disabled={!!downloading} style={{ fontSize: 10, padding: '3px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface-3)', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                                  {downloading === `${result.id}-resume-docx` ? '…' : 'CV Word'}
                                </button>
                              </>
                            )}
                            {hasCover && (
                              <>
                                <button onClick={() => handleDownload(result, 'cover', 'pdf')} disabled={!!downloading} style={{ fontSize: 10, padding: '3px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface-3)', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                                  {downloading === `${result.id}-cover-pdf` ? '…' : 'CL PDF'}
                                </button>
                                <button onClick={() => handleDownload(result, 'cover', 'docx')} disabled={!!downloading} style={{ fontSize: 10, padding: '3px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface-3)', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                                  {downloading === `${result.id}-cover-docx` ? '…' : 'CL Word'}
                                </button>
                              </>
                            )}
                          </div>
                        )}

                        {/* Cover letter preview */}
                        {hasCover && (
                          <div style={{
                            padding: '12px 14px',
                            background: 'var(--surface-2)',
                            border: '1px solid var(--border)',
                            borderRadius: 10,
                            fontSize: 12, color: 'var(--text-secondary)',
                            lineHeight: 1.7, whiteSpace: 'pre-wrap',
                            maxHeight: 260, overflow: 'auto',
                          }}>
                            {String(meta.coverLetter)}
                          </div>
                        )}

                        {/* Job description */}
                        {job.description && (
                          <details style={{ cursor: 'pointer' }}>
                            <summary style={{ fontSize: 12, color: 'var(--text-tertiary)', userSelect: 'none' }}>
                              Job description
                            </summary>
                            <div style={{
                              marginTop: 8, padding: '10px 12px',
                              background: 'var(--surface-2)', border: '1px solid var(--border)',
                              borderRadius: 8, fontSize: 12, color: 'var(--text-secondary)',
                              lineHeight: 1.6, maxHeight: 220, overflow: 'auto',
                              whiteSpace: 'pre-wrap',
                            }}>
                              {job.description}
                            </div>
                          </details>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginTop: 24, flexWrap: 'wrap' }}>
              <button
                onClick={() => doSearch(page - 1)}
                disabled={page <= 1 || loading}
                style={{
                  fontSize: 12, padding: '6px 14px', borderRadius: 8,
                  border: '1px solid var(--border)', background: 'var(--surface-2)',
                  color: page <= 1 ? 'var(--text-tertiary)' : 'var(--text-secondary)',
                  cursor: page <= 1 ? 'not-allowed' : 'pointer',
                }}
              >← Prev</button>
              {Array.from({ length: Math.min(7, totalPages) }, (_, i) => {
                const pg = totalPages <= 7 ? i + 1 : Math.max(1, Math.min(page - 3, totalPages - 6)) + i
                const active = pg === page
                return (
                  <button
                    key={pg}
                    onClick={() => doSearch(pg)}
                    disabled={loading}
                    style={{
                      fontSize: 12, padding: '6px 12px', borderRadius: 8, minWidth: 36,
                      border: active ? '1px solid var(--brand)' : '1px solid var(--border)',
                      background: active ? 'var(--brand-dim)' : 'var(--surface-2)',
                      color: active ? 'var(--brand)' : 'var(--text-secondary)',
                      cursor: 'pointer', fontWeight: active ? 600 : 400,
                    }}
                  >{pg}</button>
                )
              })}
              <button
                onClick={() => doSearch(page + 1)}
                disabled={page >= totalPages || loading}
                style={{
                  fontSize: 12, padding: '6px 14px', borderRadius: 8,
                  border: '1px solid var(--border)', background: 'var(--surface-2)',
                  color: page >= totalPages ? 'var(--text-tertiary)' : 'var(--text-secondary)',
                  cursor: page >= totalPages ? 'not-allowed' : 'pointer',
                }}
              >Next →</button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
