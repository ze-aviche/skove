 'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@clerk/nextjs'
import { getAgentDefinitions, getMyAgents, getResults, AgentDefinition, AgentInstance, AgentResult } from '@/lib/api'

function postedLabel(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
  if (isNaN(days) || days < 0) return 'Recently'
  if (days === 0) return 'Today'
  if (days === 1) return '1d ago'
  if (days < 7) return `${days}d ago`
  if (days < 30) return `${Math.floor(days / 7)}w ago`
  return `${Math.floor(days / 30)}mo ago`
}

const iconMap: Record<string, string> = {
  'flight-watcher': '✈️',
  'job-application-tracker': '💼',
  'rental-listing-monitor': '🏠',
  'stock-price-alert': '📈',
  'keyword-news-monitor': '📰',
}

function getInstanceLabel(agentId: string, config: Record<string, unknown>): string | null {
  switch (agentId) {
    case 'flight-watcher':
      if (config.origin && config.destination) return `${config.origin} → ${config.destination}`
      break
    case 'job-application-tracker':
      if (config.jobTitle) return config.location ? `${config.jobTitle} · ${config.location}` : String(config.jobTitle)
      break
    case 'rental-listing-monitor':
      if (config.city) {
        const parts: string[] = [String(config.city)]
        if (config.listingType) parts.push(String(config.listingType))
        if (config.bedrooms && config.bedrooms !== 'Any') parts.push(`${config.bedrooms}BR`)
        if (config.propertyType && config.propertyType !== 'Any') parts.push(String(config.propertyType))
        const minP = config.minPrice ?? config.minRent
        const maxP = config.maxPrice ?? config.maxRent
        if (minP && maxP) parts.push(`$${minP}–$${maxP}`)
        else if (maxP) parts.push(`max $${maxP}`)
        else if (minP) parts.push(`from $${minP}`)
        return parts.join(' · ')
      }
      break
    case 'stock-price-alert':
      if (config.symbol) return `${config.symbol}${config.targetPrice ? ` · below $${config.targetPrice}` : ''}`
      break
    case 'keyword-news-monitor':
      if (config.keyword) return `"${config.keyword}"`
      break
  }
  return null
}

export default function DashboardPage() {
  const [agents, setAgents] = useState<AgentInstance[]>([])
  const [definitions, setDefinitions] = useState<Record<string, AgentDefinition>>({})
  const [results, setResults] = useState<AgentResult[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const auth = useAuth()
  useEffect(() => {
    async function loadDashboard() {
      try {
        const token = await auth.getToken()
        const [instances, defs, recentResults] = await Promise.all([
          getMyAgents(token),
          getAgentDefinitions(token),
          getResults(token),
        ])
        setAgents(instances)
        setDefinitions(Object.fromEntries(defs.map((def) => [def.id, def])))
        setResults(recentResults)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load dashboard data')
      } finally {
        setLoading(false)
      }
    }

    loadDashboard()
  }, [])

  useEffect(() => {
    const handleAgentsChanged = async () => {
      setLoading(true)
      try {
        const token = await auth.getToken()
        const [instances, defs, recentResults] = await Promise.all([
          getMyAgents(token),
          getAgentDefinitions(token),
          getResults(token),
        ])
        setAgents(instances)
        setDefinitions(Object.fromEntries(defs.map((def) => [def.id, def])))
        setResults(recentResults)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load dashboard data')
      } finally {
        setLoading(false)
      }
    }

    window.addEventListener('agents:changed', handleAgentsChanged)
    return () => window.removeEventListener('agents:changed', handleAgentsChanged)
  }, [auth])

  const activeAgents = agents.filter((agent) => agent.isActive).length
  const totalAgents = agents.length
  const unreadResults = results.filter((result) => !result.isRead).length
  const lastRun = useMemo(() => {
    const withTimes = agents.filter(a => a.lastRunAt)
    if (withTimes.length === 0) return null
    return withTimes.reduce((latest, a) => a.lastRunAt! > latest.lastRunAt! ? a : latest)
  }, [agents])

  const lastRunAt = lastRun?.lastRunAt ?? null

  const lastRunLabel = useMemo(() => {
    if (!lastRunAt) return 'Never'
    const diff = Date.now() - new Date(lastRunAt).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return 'Just now'
    if (mins < 60) return `${mins}m ago`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `${hrs}h ago`
    return `${Math.floor(hrs / 24)}d ago`
  }, [lastRunAt])

  const stats = useMemo(() => [
    { label: 'Active agents', value: String(activeAgents), delta: `${totalAgents} deployed`, color: 'var(--brand)' },
    { label: 'Results found', value: String(results.length), delta: 'all time', color: 'var(--green)' },
    { label: 'Unread', value: String(unreadResults), delta: unreadResults === 0 ? 'All caught up' : 'need review', color: 'var(--amber)' },
    { label: 'Last run', value: lastRunLabel, delta: lastRun ? (definitions[lastRun.agentId]?.name ?? lastRun.agentId) : 'No runs yet', color: 'var(--blue)' },
  ], [activeAgents, results.length, totalAgents, unreadResults, lastRunLabel, lastRun, definitions])

  const runningAgents = useMemo(() => agents.map((agent) => {
    const def = definitions[agent.agentId]
    return {
      id: agent.id,
      icon: iconMap[agent.agentId] ?? '🤖',
      name: def?.name ?? agent.agentId,
      label: getInstanceLabel(agent.agentId, (agent.config ?? {}) as Record<string, unknown>),
      desc: def?.description ?? 'Deployed agent instance',
      status: agent.isActive ? 'live' : 'paused',
      statusText: agent.isActive ? 'Running' : 'Paused',
      lastRun: agent.lastRunAt ? new Date(agent.lastRunAt).toLocaleString() : 'Never',
      color: agent.isActive ? 'var(--green)' : 'var(--amber)',
      colorDim: agent.isActive ? 'var(--green-dim)' : 'var(--amber-dim)',
    }
  }), [agents, definitions])

  const latestResults = useMemo(() => results.slice(0, 3), [results])

  return (
    <div style={{ padding: '32px 36px', animation: 'fadeIn 0.4s ease' }}>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, color: 'var(--text-primary)', letterSpacing: '-0.03em', marginBottom: 4 }}>
          Overview
        </h1>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
          Live summary of your agents and results.
        </p>
      </div>

      {loading ? (
        <div style={{ color: 'var(--text-secondary)' }}>Loading dashboard…</div>
      ) : error ? (
        <div style={{ color: 'var(--red)' }}>{error}</div>
      ) : (
        <>
          <div className="stat-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 28 }}>
            {stats.map((stat) => (
              <div key={stat.label} style={{
                background: 'var(--surface-2)',
                border: '1px solid var(--border)',
                borderRadius: 12,
                padding: '16px 18px',
              }}>
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  {stat.label}
                </div>
                <div style={{ fontSize: 28, fontWeight: 600, color: stat.color, letterSpacing: '-0.04em', marginBottom: 4, fontVariantNumeric: 'tabular-nums' }}>
                  {stat.value}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{stat.delta}</div>
              </div>
            ))}
          </div>

          <div className="two-col-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <h2 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>Running agents</h2>
                <Link href="/dashboard/store" style={{
                  fontSize: 12, color: 'var(--brand)', textDecoration: 'none',
                  background: 'var(--brand-dim)', padding: '4px 10px', borderRadius: 6,
                  border: '1px solid rgba(59,130,246,0.2)',
                }}>+ Add agent</Link>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {runningAgents.length === 0 ? (
                  <div style={{ color: 'var(--text-secondary)' }}>No agent instances are deployed yet. Deploy one from the store.</div>
                ) : runningAgents.map((agent) => (
                  <div key={agent.id} style={{
                    background: 'var(--surface-2)',
                    border: '1px solid var(--border)',
                    borderRadius: 12,
                    padding: '14px 16px',
                    transition: 'border-color 0.15s',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 12 }}>
                      <div style={{
                        width: 36, height: 36,
                        background: agent.colorDim,
                        border: `1px solid ${agent.color}30`,
                        borderRadius: 10,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 18, flexShrink: 0,
                      }}>{agent.icon}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', marginBottom: agent.label ? 4 : 2 }}>{agent.name}</div>
                        {agent.label && (
                          <div style={{
                            fontSize: 11, fontWeight: 500,
                            color: 'var(--text-primary)',
                            background: 'var(--surface-3)',
                            border: '1px solid var(--border)',
                            borderRadius: 6,
                            padding: '2px 8px',
                            display: 'inline-block',
                            marginBottom: 4,
                            fontFamily: 'var(--font-mono)',
                          }}>{agent.label}</div>
                        )}
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{agent.desc}</div>
                      </div>
                      <span style={{
                        fontSize: 10, fontWeight: 600,
                        padding: '2px 8px', borderRadius: 99,
                        background: agent.status === 'live' ? 'var(--green-dim)' : 'var(--surface-4)',
                        color: agent.status === 'live' ? 'var(--green)' : 'var(--text-tertiary)',
                        border: `1px solid ${agent.status === 'live' ? 'rgba(34,197,94,0.2)' : 'var(--border)'}`,
                      }}>{agent.status}</span>
                    </div>
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      paddingTop: 10, borderTop: '1px solid var(--border)',
                    }}>
                      <span style={{
                        width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                        background: agent.status === 'live' ? 'var(--green)' : 'var(--text-tertiary)',
                        boxShadow: agent.status === 'live' ? '0 0 6px var(--green)' : 'none',
                      }} />
                      <span style={{ fontSize: 11, color: 'var(--text-secondary)', flex: 1 }}>{agent.statusText}</span>
                      <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{agent.lastRun}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <h2 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>Latest results</h2>
                <Link href="/dashboard/results" style={{ fontSize: 12, color: 'var(--text-secondary)', textDecoration: 'none' }}>View all →</Link>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {latestResults.length === 0 ? (
                  <div style={{ color: 'var(--text-secondary)' }}>No results yet. Your active agents will show updates here.</div>
                ) : latestResults.map((result) => (
                  <div key={result.id} style={{
                    background: 'var(--surface-2)',
                    border: '1px solid var(--border)',
                    borderRadius: 12,
                    padding: '12px 14px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                  }}>
                    <span style={{
                      width: 8, height: 8, borderRadius: '50%',
                      background: result.isRead ? 'var(--text-tertiary)' : 'var(--green)',
                      boxShadow: result.isRead ? 'none' : '0 0 6px var(--green)',
                      flexShrink: 0,
                    }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {result.title}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                        {result.value ? `${result.value} · ` : ''}
                        {typeof result.metadata === 'object' && result.metadata !== null && 'agentType' in result.metadata ? String((result.metadata as any).agentType) : 'Agent result'}
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
                      <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{new Date(result.createdAt).toLocaleString()}</span>
                      {result.url ? (
                        <a href={result.url} target="_blank" rel="noreferrer" style={{
                          fontSize: 11, fontWeight: 500,
                          padding: '3px 10px', borderRadius: 6,
                          border: '1px solid var(--border)',
                          background: 'var(--surface-3)',
                          color: 'var(--text-secondary)',
                          textDecoration: 'none',
                        }}>Open</a>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>

              <Link href="/dashboard/store" style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                gap: 8, marginTop: 8,
                background: 'var(--surface-2)',
                border: '1px dashed var(--border)',
                borderRadius: 12, padding: '14px',
                fontSize: 13, color: 'var(--text-secondary)',
                textDecoration: 'none',
                transition: 'all 0.15s',
              }}>
                ⊞ Browse agent store
              </Link>
            </div>
          </div>

          {/* Saved Jobs */}
          {(() => {
            const savedJobs = results.filter(r => r.isFavourite && (r.metadata as any)?.atsJobId)
            if (savedJobs.length === 0) return null
            return (
              <div style={{ marginTop: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                  <h2 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>
                    Saved jobs <span style={{ color: 'var(--text-tertiary)', fontWeight: 400 }}>({savedJobs.length})</span>
                  </h2>
                  <Link href="/dashboard/explore" style={{ fontSize: 12, color: 'var(--text-secondary)', textDecoration: 'none' }}>Browse more →</Link>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 10 }}>
                  {savedJobs.map(r => {
                    const meta = (r.metadata ?? {}) as Record<string, any>
                    const matchScore = meta.matchScore != null ? Number(meta.matchScore) : null
                    return (
                      <div key={r.id} style={{
                        background: 'var(--surface-2)',
                        border: '1px solid var(--border)',
                        borderRadius: 12,
                        padding: '12px 14px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 6,
                      }}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                          <div style={{
                            width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                            background: 'var(--surface-3)', border: '1px solid var(--border)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 11, fontWeight: 700, color: 'var(--brand)',
                          }}>
                            {(meta.company ?? '?').slice(0, 2).toUpperCase()}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {meta.jobTitle ?? r.title}
                            </div>
                            <div style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 2 }}>
                              <span style={{ fontWeight: 500 }}>{meta.company}</span>
                              {meta.location && <><span style={{ color: 'var(--text-tertiary)' }}>·</span><span>{meta.location}</span></>}
                            </div>
                          </div>
                          {matchScore !== null && !isNaN(matchScore) && (
                            <span style={{
                              fontSize: 10, fontWeight: 700, flexShrink: 0,
                              padding: '2px 7px', borderRadius: 99,
                              background: matchScore >= 8 ? 'var(--success-dim)' : 'var(--brand-dim)',
                              color: matchScore >= 8 ? 'var(--success)' : 'var(--brand)',
                              border: `1px solid ${matchScore >= 8 ? 'rgba(16,185,129,0.2)' : 'rgba(59,130,246,0.2)'}`,
                            }}>{matchScore}/10</span>
                          )}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 }}>
                          <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                            {meta.postedAt ? postedLabel(meta.postedAt) : postedLabel(r.createdAt)} · ★ saved
                          </span>
                          {r.url && (
                            <a href={r.url} target="_blank" rel="noreferrer" style={{
                              fontSize: 11, fontWeight: 500,
                              padding: '3px 10px', borderRadius: 6,
                              border: '1px solid var(--border)',
                              background: 'var(--surface-3)',
                              color: 'var(--text-secondary)',
                              textDecoration: 'none',
                            }}>Apply →</a>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })()}
        </>
      )}
    </div>
  )
}
