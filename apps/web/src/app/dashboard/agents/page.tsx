'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@clerk/nextjs'
import { useToast } from '@/app/providers'
import { getAgentDefinitions, getMyAgents, toggleAgent, deleteAgent, updateAgentConfig, runAgent, deployAgent, getResumeStatus, uploadResume, AgentConfigField, AgentDefinition, AgentInstance } from '@/lib/api'
import ConfigField from '@/components/ConfigField'
import { isValidAirport } from '@/components/AirportPicker'

function formatRelative(iso: string | null): string {
  if (!iso) return 'Never'
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function formatNextRun(iso: string | null): string {
  if (!iso) return '—'
  const diff = new Date(iso).getTime() - Date.now()
  if (diff < 0) return 'Soon'
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `in ${mins}m`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `in ${hrs}h`
  return `in ${Math.floor(hrs / 24)}d`
}

function getInstanceLabel(agentId: string, config: Record<string, unknown>): string | null {
  switch (agentId) {
    case 'flight-watcher':
      if (config.origin && config.destination)
        return `${config.origin}  →  ${config.destination}`
      break
    case 'job-application-tracker':
      if (config.jobTitle)
        return config.location ? `${config.jobTitle} · ${config.location}` : String(config.jobTitle)
      break
    case 'rental-listing-monitor':
      if (config.city)
        return `${config.city}${config.maxRent ? ` · max $${config.maxRent}` : ''}`
      break
    case 'stock-price-alert':
      if (config.symbol)
        return `${config.symbol}${config.targetPrice ? ` · below $${config.targetPrice}` : ''}`
      break
    case 'keyword-news-monitor':
      if (config.keyword) return `"${config.keyword}"`
      break
  }
  return null
}

const iconMap: Record<string, string> = {
  'flight-watcher': '✈️',
  'job-application-tracker': '💼',
  'rental-listing-monitor': '🏠',
  'stock-price-alert': '📈',
  'keyword-news-monitor': '📰',
}

export default function AgentsPage() {
  const [agents, setAgents] = useState<AgentInstance[]>([])
  const [definitions, setDefinitions] = useState<Record<string, AgentDefinition>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editingAgent, setEditingAgent] = useState<AgentInstance | null>(null)
  const [editConfig, setEditConfig] = useState<Record<string, unknown>>({})
  const [editErrors, setEditErrors] = useState<string[]>([])
  const [editLoading, setEditLoading] = useState(false)
  const [runningIds, setRunningIds] = useState<Set<string>>(new Set())
  const [cloningAgent, setCloningAgent] = useState<AgentInstance | null>(null)
  const [cloneConfig, setCloneConfig] = useState<Record<string, unknown>>({})
  const [cloneErrors, setCloneErrors] = useState<string[]>([])
  const [cloneLoading, setCloneLoading] = useState(false)
  const [hasResume, setHasResume] = useState(false)
  const [resumeWordCount, setResumeWordCount] = useState(0)
  const [resumeUploading, setResumeUploading] = useState(false)
  const resumeFileRef = useRef<HTMLInputElement>(null)
  const auth = useAuth()
  const { showToast } = useToast()

  useEffect(() => {
    async function load() {
      try {
        const token = await auth.getToken()
        const [instances, defs, resumeStatus] = await Promise.all([
          getMyAgents(token),
          getAgentDefinitions(token),
          getResumeStatus(token).catch(() => ({ hasResume: false, wordCount: 0 })),
        ])
        setAgents(instances)
        setDefinitions(Object.fromEntries(defs.map((def) => [def.id, def])))
        setHasResume(resumeStatus.hasResume)
        setResumeWordCount(resumeStatus.wordCount)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load agents')
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [])

  const agentCards = useMemo(() => agents.map((agent) => {
    const def = definitions[agent.agentId]
    return {
      id: agent.id,
      icon: iconMap[agent.agentId] ?? '🤖',
      name: def?.name ?? agent.agentId,
      desc: def?.description ?? 'Deployed agent instance',
      label: getInstanceLabel(agent.agentId, agent.config as Record<string, unknown>),
      status: agent.isActive ? 'active' : 'paused',
      lastRun: formatRelative(agent.lastRunAt),
      nextRun: agent.isActive ? formatNextRun(agent.nextRunAt) : '—',
      color: agent.isActive ? 'var(--success)' : 'var(--warning)',
      colorDim: agent.isActive ? 'var(--success-dim)' : 'var(--warning-dim)',
    }
  }), [agents, definitions])

  const getInitialConfig = (configSchema: Record<string, AgentConfigField>) => {
    return Object.fromEntries(
      Object.entries(configSchema).map(([key, field]) => {
        if (field.type === 'boolean') return [key, false]
        if (field.type === 'select') return [key, field.options?.[0] ?? '']
        return [key, '']
      })
    ) as Record<string, unknown>
  }

  const openClone = (agent: AgentInstance) => {
    setCloningAgent(agent)
    setCloneConfig({ ...(agent.config ?? {}) })
    setCloneErrors([])
  }

  const closeClone = () => {
    setCloningAgent(null)
    setCloneErrors([])
  }

  const handleCloneChange = (key: string, value: unknown) => {
    setCloneConfig((prev) => ({ ...prev, [key]: value }))
  }

  const validateCloneConfig = () => {
    if (!cloningAgent) return false
    const def = definitions[cloningAgent.agentId]
    if (!def) return false
    const errs: string[] = []
    Object.entries(def.configSchema).forEach(([key, field]) => {
      const val = cloneConfig[key]
      const empty = val === '' || val === null || val === undefined || (typeof val === 'string' && val.trim() === '')
      if (field.required && empty) errs.push(`${field.label} is required.`)
      else if (field.type === 'airport' && !empty && !isValidAirport(String(val)))
        errs.push(`${field.label}: enter a valid airport, e.g. "Dallas (DAL)".`)
    })
    setCloneErrors(errs)
    return errs.length === 0
  }

  const submitClone = async () => {
    if (!cloningAgent || !validateCloneConfig()) return
    setCloneLoading(true)
    try {
      const token = await auth.getToken()
      await deployAgent(cloningAgent.agentId, cloneConfig, token)
      const updated = await getMyAgents(token)
      setAgents(updated)
      showToast({ message: 'New agent instance deployed', variant: 'success' })
      window.dispatchEvent(new CustomEvent('agents:changed'))
      closeClone()
    } catch (err) {
      showToast({ message: err instanceof Error ? err.message : 'Failed to deploy', variant: 'error' })
    } finally {
      setCloneLoading(false)
    }
  }

  const openEditConfig = (agent: AgentInstance) => {
    const def = definitions[agent.agentId]
    if (!def) {
      showToast({ message: 'Unable to edit config: agent definition unavailable', variant: 'error' })
      return
    }

    setEditConfig(agent.config ?? getInitialConfig(def.configSchema))
    setEditErrors([])
    setEditingAgent(agent)
  }

  const closeEditConfig = () => {
    setEditingAgent(null)
    setEditErrors([])
  }

  const handleEditChange = (key: string, value: unknown) => {
    setEditConfig((prev) => ({ ...prev, [key]: value }))
  }

  const validateEditConfig = () => {
    if (!editingAgent) return false
    const def = definitions[editingAgent.agentId]
    if (!def) return false

    const errs: string[] = []
    Object.entries(def.configSchema).forEach(([key, field]) => {
      const val = editConfig[key]
      const empty = val === '' || val === null || val === undefined || (typeof val === 'string' && val.trim() === '')
      if (field.required && empty) {
        errs.push(`${field.label} is required.`)
      } else if (field.type === 'airport' && !empty && !isValidAirport(String(val))) {
        errs.push(`${field.label}: enter a valid airport, e.g. "Dallas (DAL)".`)
      }
    })

    setEditErrors(errs)
    return errs.length === 0
  }

  const submitEditConfig = async () => {
    if (!editingAgent || !validateEditConfig()) return

    setEditLoading(true)
    try {
      const token = await auth.getToken()
      const updated = await updateAgentConfig(editingAgent.id, editConfig, token)
      setAgents((prev) => prev.map((agent) => agent.id === updated.id ? updated : agent))
      showToast({ message: 'Agent configuration updated', variant: 'success' })
      setEditingAgent(null)
    } catch (err) {
      showToast({ message: err instanceof Error ? err.message : 'Failed to update config', variant: 'error' })
    } finally {
      setEditLoading(false)
    }
  }

  const handleResumeFile = async (file: File) => {
    if (!file.name.endsWith('.pdf')) { showToast({ message: 'Please upload a PDF file', variant: 'error' }); return }
    setResumeUploading(true)
    try {
      const token = await auth.getToken()
      const result = await uploadResume(file, token)
      setHasResume(true)
      setResumeWordCount(result.wordCount)
      showToast({ message: `Resume uploaded — ${result.wordCount} words`, variant: 'success' })
    } catch (err) {
      showToast({ message: err instanceof Error ? err.message : 'Upload failed', variant: 'error' })
    } finally {
      setResumeUploading(false)
    }
  }

  return (
    <div style={{ padding: '32px 36px', animation: 'fadeIn 0.4s ease' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 600, color: 'var(--text-primary)', letterSpacing: '-0.03em', marginBottom: 4 }}>My agents</h1>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Manage and monitor your deployed agents.</p>
        </div>
        <Link href="/dashboard/store" style={{
          fontSize: 13, fontWeight: 500,
          padding: '8px 16px', borderRadius: 9,
          border: '1px solid var(--brand)',
          background: 'var(--brand-dim)',
          color: 'var(--brand)',
          textDecoration: 'none',
        }}>+ Deploy new agent</Link>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {loading ? (
          <div style={{ color: 'var(--text-secondary)' }}>Loading your agents…</div>
        ) : error ? (
          <div style={{ color: 'var(--red)' }}>{error}</div>
        ) : agentCards.length === 0 ? (
          <div style={{ color: 'var(--text-secondary)' }}>No deployed agents yet. Deploy one from the agent store.</div>
        ) : agentCards.map((a) => (
          <div key={a.id} style={{
            background: 'var(--surface-2)',
            border: '1px solid var(--border)',
            borderRadius: 14,
            padding: '18px 20px',
          }}>
            <div className="agent-card-inner" style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
              <div style={{
                width: 44, height: 44,
                background: a.colorDim,
                border: `1px solid ${a.color}30`,
                borderRadius: 12,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 22, flexShrink: 0,
              }}>{a.icon}</div>

              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                  <span style={{ fontSize: 15, fontWeight: 500, color: 'var(--text-primary)' }}>{a.name}</span>
                  {runningIds.has(a.id) ? (
                    <span style={{
                      fontSize: 10, fontWeight: 600,
                      padding: '2px 8px', borderRadius: 99,
                      background: 'rgba(59,130,246,0.15)',
                      color: 'var(--brand)',
                      border: '1px solid rgba(59,130,246,0.3)',
                      display: 'flex', alignItems: 'center', gap: 4,
                    }}>
                      <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: 'var(--brand)', animation: 'pulse 1s infinite' }} />
                      Running now
                    </span>
                  ) : (
                    <span style={{
                      fontSize: 10, fontWeight: 600,
                      padding: '2px 8px', borderRadius: 99,
                      background: a.status === 'active' ? 'var(--success-dim)' : 'var(--surface-4)',
                      color: a.status === 'active' ? 'var(--success)' : 'var(--text-tertiary)',
                      border: `1px solid ${a.status === 'active' ? 'rgba(16,185,129,0.2)' : 'var(--border)'}`,
                      display: 'flex', alignItems: 'center', gap: 4,
                    }}>
                      {a.status === 'active' && (
                        <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: 'var(--success)' }} />
                      )}
                      {a.status}
                    </span>
                  )}
                </div>
                {a.label && (
                  <div style={{
                    fontSize: 13, fontWeight: 500,
                    color: 'var(--text-primary)',
                    background: 'var(--surface-3)',
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    padding: '4px 10px',
                    display: 'inline-block',
                    marginBottom: 8,
                    fontFamily: 'var(--font-mono)',
                    letterSpacing: '0.01em',
                  }}>{a.label}</div>
                )}
                <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 14 }}>{a.desc}</div>

                {/* Metrics row */}
                <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
                  {[
                    { label: 'Last run', val: a.lastRun },
                    { label: 'Next run', val: runningIds.has(a.id) ? 'Running…' : a.nextRun },
                  ].map(m => (
                    <div key={m.label}>
                      <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginBottom: 2, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{m.label}</div>
                      <div style={{ fontSize: 14, fontWeight: 500, color: m.label === 'Next run' && a.status === 'active' ? 'var(--text-primary)' : 'var(--text-secondary)' }}>{m.val}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Actions */}
              <div className="agent-actions">
                <button disabled={runningIds.has(a.id)} onClick={async () => {
                  setRunningIds((prev) => new Set(prev).add(a.id))
                  try {
                    const token = await auth.getToken()
                    const { results } = await runAgent(a.id, token)
                    showToast({
                      message: results.length > 0 ? `Agent ran — ${results.length} result(s) found` : 'Agent ran — no new results',
                      variant: 'success',
                    })
                    window.dispatchEvent(new CustomEvent('agents:changed'))
                    const [instances] = await Promise.all([getMyAgents(token)])
                    setAgents(instances)
                  } catch (err) {
                    showToast({ message: err instanceof Error ? err.message : 'Run failed', variant: 'error' })
                  } finally {
                    setRunningIds((prev) => { const s = new Set(prev); s.delete(a.id); return s })
                  }
                }} style={{
                  fontSize: 12, padding: '6px 14px', borderRadius: 8,
                  border: '1px solid rgba(59,130,246,0.3)',
                  background: 'var(--brand-dim)',
                  color: runningIds.has(a.id) ? 'var(--text-tertiary)' : 'var(--brand)',
                  cursor: runningIds.has(a.id) ? 'not-allowed' : 'pointer',
                  opacity: runningIds.has(a.id) ? 0.6 : 1,
                }}>{runningIds.has(a.id) ? 'Running…' : 'Run now'}</button>
                <button onClick={() => { const orig = agents.find((ag) => ag.id === a.id); if (orig) openClone(orig) }} style={{
                  fontSize: 12, padding: '6px 14px', borderRadius: 8,
                  border: '1px solid var(--border)',
                  background: 'var(--surface-3)',
                  color: 'var(--text-secondary)', cursor: 'pointer',
                }}>Duplicate</button>
                <button onClick={() => { const orig = agents.find((ag) => ag.id === a.id); if (orig) openEditConfig(orig) }} style={{
                  fontSize: 12, padding: '6px 14px', borderRadius: 8,
                  border: '1px solid var(--border)',
                  background: 'var(--surface-3)',
                  color: 'var(--text-secondary)', cursor: 'pointer',
                }}>Configure</button>
                <button onClick={async () => {
                  try {
                    const token = await auth.getToken()
                    const updated = await toggleAgent(a.id, token)
                    setAgents((prev) => prev.map((p) => p.id === updated.id ? updated : p))
                    showToast({
                      message: a.status === 'live' ? 'Agent paused' : 'Agent resumed',
                      variant: 'success',
                    })
                    window.dispatchEvent(new CustomEvent('agents:changed'))
                  } catch (err) {
                    showToast({ message: err instanceof Error ? err.message : 'Failed to toggle agent', variant: 'error' })
                  }
                }} style={{
                  fontSize: 12, padding: '6px 14px', borderRadius: 8,
                  border: `1px solid ${a.status === 'active' ? 'rgba(239,68,68,0.3)' : 'rgba(16,185,129,0.3)'}`,
                  background: a.status === 'active' ? 'rgba(239,68,68,0.08)' : 'var(--success-dim)',
                  color: a.status === 'active' ? 'var(--error)' : 'var(--success)',
                  cursor: 'pointer',
                }}>{a.status === 'active' ? 'Pause' : 'Resume'}</button>
                <button onClick={async () => {
                  if (!window.confirm('Undeploy this agent and remove it from your dashboard?')) {
                    return
                  }

                  try {
                    const token = await auth.getToken()
                    await deleteAgent(a.id, token)
                    setAgents((prev) => prev.filter((p) => p.id !== a.id))
                    showToast({ message: 'Agent undeployed and removed', variant: 'success' })
                    window.dispatchEvent(new CustomEvent('agents:changed'))
                  } catch (err) {
                    showToast({ message: err instanceof Error ? err.message : 'Failed to delete agent', variant: 'error' })
                  }
                }} style={{
                  fontSize: 12, padding: '6px 14px', borderRadius: 8,
                  border: '1px solid rgba(239,68,68,0.3)',
                  background: 'rgba(239,68,68,0.08)',
                  color: 'var(--red)',
                  cursor: 'pointer',
                }}>Delete</button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {cloningAgent && (() => {
        const definition = definitions[cloningAgent.agentId]
        const fields = definition ? Object.entries(definition.configSchema) : []
        return (
          <div style={{
            position: 'fixed', inset: 0,
            background: 'rgba(15, 23, 42, 0.55)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 9999, padding: 16,
          }}>
            <div style={{
              width: 'min(660px, 100%)',
              background: 'var(--surface-0)',
              border: '1px solid var(--border)',
              borderRadius: 18,
              boxShadow: '0 32px 80px rgba(15, 23, 42, 0.18)',
              padding: 24,
              display: 'flex', flexDirection: 'column', gap: 18,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)' }}>
                    Duplicate: {definition?.name ?? cloningAgent.agentId}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
                    Pre-filled with your current config — adjust and deploy as a new instance.
                  </div>
                </div>
                <button onClick={closeClone} style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 18 }}>×</button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 14 }}>
                {fields
                  .filter(([, field]) => !field.showWhen || String(cloneConfig[field.showWhen.field] ?? '') === field.showWhen.value)
                  .map(([key, field]) => (
                    <label key={key} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>
                        {field.label}{field.required ? ' *' : ''}
                      </span>
                      <ConfigField fieldKey={key} field={field} value={cloneConfig[key]} onChange={handleCloneChange} />
                    </label>
                  ))}
              </div>

              {/* Resume section — job tracker only */}
              {cloningAgent.agentId === 'job-application-tracker' && (
                <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>Resume</div>
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Used to score jobs and generate cover letters. PDF only.</div>
                    </div>
                    {hasResume && (
                      <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 99, background: 'var(--success-dim)', color: 'var(--success)', border: '1px solid rgba(16,185,129,0.2)' }}>Uploaded</span>
                    )}
                  </div>
                  {hasResume ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ flex: 1, background: 'var(--surface-3)', border: '1px solid var(--border)', borderRadius: 9, padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span>📄</span>
                        <span style={{ fontSize: 13, color: 'var(--text-primary)' }}>Resume on file · {resumeWordCount.toLocaleString()} words</span>
                      </div>
                      <button onClick={() => resumeFileRef.current?.click()} disabled={resumeUploading} style={{ fontSize: 12, padding: '7px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-3)', color: 'var(--text-secondary)', cursor: 'pointer', flexShrink: 0 }}>
                        {resumeUploading ? 'Uploading…' : 'Replace'}
                      </button>
                    </div>
                  ) : (
                    <div
                      onClick={() => resumeFileRef.current?.click()}
                      onDragOver={e => e.preventDefault()}
                      onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleResumeFile(f) }}
                      style={{ border: '2px dashed var(--border)', borderRadius: 10, padding: '20px', textAlign: 'center', cursor: 'pointer' }}
                    >
                      <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                        {resumeUploading ? 'Uploading…' : '📄 Drop resume here or click to upload'}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {cloneErrors.length > 0 && (
                <div style={{ color: 'var(--error)', fontSize: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {cloneErrors.map((e) => <span key={e}>{e}</span>)}
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 4 }}>
                <button onClick={closeClone} style={{
                  fontSize: 12, fontWeight: 500, padding: '10px 16px', borderRadius: 10,
                  border: '1px solid var(--border)', background: 'var(--surface-2)',
                  color: 'var(--text-secondary)', cursor: 'pointer',
                }}>Cancel</button>
                <button onClick={submitClone} disabled={cloneLoading} style={{
                  fontSize: 12, fontWeight: 500, padding: '10px 16px', borderRadius: 10,
                  border: '1px solid var(--brand)', background: 'var(--brand-dim)',
                  color: 'var(--brand)', cursor: 'pointer',
                }}>{cloneLoading ? 'Deploying…' : 'Deploy new instance'}</button>
              </div>
            </div>
          </div>
        )
      })()}

      {editingAgent && (() => {
        const definition = definitions[editingAgent.agentId]
        const fields = definition ? Object.entries(definition.configSchema) : []

        return (
          <div style={{
            position: 'fixed', inset: 0,
            background: 'rgba(15, 23, 42, 0.55)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 9999,
            padding: 16,
          }}>
            <div style={{
              width: 'min(660px, 100%)',
              background: 'var(--surface-0)',
              border: '1px solid var(--border)',
              borderRadius: 18,
              boxShadow: '0 32px 80px rgba(15, 23, 42, 0.18)',
              padding: 24,
              display: 'flex',
              flexDirection: 'column',
              gap: 18,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)' }}>Edit {definition?.name ?? editingAgent.agentId}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>Update the agent configuration and save the changes.</div>
                </div>
                <button onClick={closeEditConfig} style={{
                  background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 18,
                }}>×</button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 14 }}>
                {fields.length === 0 ? (
                  <div style={{ color: 'var(--text-secondary)' }}>No editable fields are available for this agent.</div>
                ) : fields
                  .filter(([, field]) => !field.showWhen || String(editConfig[field.showWhen.field] ?? '') === field.showWhen.value)
                  .map(([key, field]) => (
                    <label key={key} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>
                        {field.label}{field.required ? ' *' : ''}
                      </span>
                      <ConfigField
                        fieldKey={key}
                        field={field}
                        value={editConfig[key]}
                        onChange={handleEditChange}
                      />
                    </label>
                  ))}
              </div>

              {/* Resume section — job tracker only */}
              {editingAgent.agentId === 'job-application-tracker' && (
                <div style={{
                  borderTop: '1px solid var(--border)', paddingTop: 16,
                  display: 'flex', flexDirection: 'column', gap: 10,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>Resume</div>
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                        Used to score jobs and generate cover letters. PDF only.
                      </div>
                    </div>
                    {hasResume && (
                      <span style={{
                        fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 99,
                        background: 'var(--success-dim)', color: 'var(--success)',
                        border: '1px solid rgba(16,185,129,0.2)',
                      }}>Uploaded</span>
                    )}
                  </div>
                  {hasResume ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{
                        flex: 1, background: 'var(--surface-3)', border: '1px solid var(--border)',
                        borderRadius: 9, padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 10,
                      }}>
                        <span>📄</span>
                        <span style={{ fontSize: 13, color: 'var(--text-primary)' }}>
                          Resume on file · {resumeWordCount.toLocaleString()} words
                        </span>
                      </div>
                      <button onClick={() => resumeFileRef.current?.click()} disabled={resumeUploading} style={{
                        fontSize: 12, padding: '7px 14px', borderRadius: 8,
                        border: '1px solid var(--border)', background: 'var(--surface-3)',
                        color: 'var(--text-secondary)', cursor: 'pointer', flexShrink: 0,
                      }}>{resumeUploading ? 'Uploading…' : 'Replace'}</button>
                    </div>
                  ) : (
                    <div
                      onClick={() => resumeFileRef.current?.click()}
                      onDragOver={e => e.preventDefault()}
                      onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleResumeFile(f) }}
                      style={{
                        border: '2px dashed var(--border)', borderRadius: 10,
                        padding: '20px', textAlign: 'center', cursor: 'pointer',
                      }}
                    >
                      <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                        {resumeUploading ? 'Uploading…' : '📄 Drop resume here or click to upload'}
                      </div>
                    </div>
                  )}
                  <input ref={resumeFileRef} type="file" accept=".pdf" style={{ display: 'none' }}
                    onChange={e => { const f = e.target.files?.[0]; if (f) handleResumeFile(f) }} />
                </div>
              )}

              {editErrors.length > 0 && (
                <div style={{ color: 'var(--red)', fontSize: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {editErrors.map((error) => (
                    <span key={error}>{error}</span>
                  ))}
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 4 }}>
                <button onClick={closeEditConfig} style={{
                  fontSize: 12, fontWeight: 500,
                  padding: '10px 16px', borderRadius: 10,
                  border: '1px solid var(--border)',
                  background: 'var(--surface-2)',
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                }}>Cancel</button>
                <button onClick={submitEditConfig} disabled={editLoading} style={{
                  fontSize: 12, fontWeight: 500,
                  padding: '10px 16px', borderRadius: 10,
                  border: '1px solid var(--brand)',
                  background: 'var(--brand-dim)',
                  color: 'var(--brand)',
                  cursor: 'pointer',
                }}>{editLoading ? 'Saving…' : 'Save changes'}</button>
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
