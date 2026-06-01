'use client'

import { useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@clerk/nextjs'
import { AgentConfigField, deployAgent, getResumeStatus, uploadResume } from '@/lib/api'
import { useToast } from '@/app/providers'
import ConfigField from './ConfigField'
import { isValidAirport } from './AirportPicker'

type DeployButtonProps = {
  agent: {
    id: string
    name: string
    configSchema: Record<string, AgentConfigField>
  }
}

const getInitialConfig = (configSchema: Record<string, AgentConfigField>) => {
  return Object.fromEntries(
    Object.entries(configSchema).map(([key, field]) => {
      if (field.type === 'boolean') return [key, false]
      if (field.type === 'select') return [key, field.options?.[0] ?? '']
      return [key, '']
    })
  ) as Record<string, unknown>
}

export default function DeployButton({ agent }: DeployButtonProps) {
  const [loading, setLoading] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [config, setConfig] = useState<Record<string, unknown>>(() => getInitialConfig(agent.configSchema))
  const [errors, setErrors] = useState<string[]>([])
  const [hasResume, setHasResume] = useState(false)
  const [resumeWordCount, setResumeWordCount] = useState(0)
  const [resumeUploading, setResumeUploading] = useState(false)
  const resumeFileRef = useRef<HTMLInputElement>(null)
  const router = useRouter()
  const auth = useAuth()
  const { showToast } = useToast()

  const configFields = useMemo(() => Object.entries(agent.configSchema), [agent.configSchema])
  const isJobTracker = agent.id === 'job-application-tracker'

  const openModal = async () => {
    setConfig(getInitialConfig(agent.configSchema))
    setErrors([])
    setModalOpen(true)
    if (isJobTracker) {
      try {
        const token = await auth.getToken()
        const status = await getResumeStatus(token)
        setHasResume(status.hasResume)
        setResumeWordCount(status.wordCount)
      } catch { /* non-fatal */ }
    }
  }

  const closeModal = () => setModalOpen(false)

  const handleChange = (key: string, value: unknown) => {
    setConfig((prev) => ({ ...prev, [key]: value }))
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

  const validateConfig = () => {
    const errs: string[] = []
    configFields.forEach(([key, field]) => {
      const val = config[key]
      const empty = val === '' || val === null || val === undefined || (typeof val === 'string' && val.trim() === '')
      if (field.required && empty) {
        errs.push(`${field.label} is required.`)
      } else if (field.type === 'airport' && !empty && !isValidAirport(String(val))) {
        errs.push(`${field.label}: enter a valid airport, e.g. "Dallas (DAL)".`)
      }
    })
    setErrors(errs)
    return errs.length === 0
  }

  const submit = async () => {
    if (!validateConfig()) return
    setLoading(true)
    try {
      const token = await auth.getToken()
      await deployAgent(agent.id, config, token)
      showToast({ message: 'Agent deployed successfully', variant: 'success' })
      window.dispatchEvent(new CustomEvent('agents:changed'))
      router.push('/dashboard/agents')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to deploy agent'
      showToast({ message: msg, variant: 'error' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <button onClick={openModal} style={{
        fontSize: 12, fontWeight: 500,
        padding: '6px 16px', borderRadius: 8,
        border: '1px solid var(--brand)',
        background: 'var(--brand-dim)',
        color: 'var(--brand)',
        cursor: 'pointer',
      }}>
        Configure →
      </button>

      {modalOpen && (
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
                <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)' }}>Configure {agent.name}</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>Fill in the fields below and deploy your agent.</div>
              </div>
              <button onClick={closeModal} style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 18 }}>×</button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 14 }}>
              {configFields
                .filter(([, field]) => !field.showWhen || String(config[field.showWhen.field] ?? '') === field.showWhen.value)
                .map(([key, field]) => (
                  <label key={key} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>
                      {field.label}{field.required ? ' *' : ''}
                    </span>
                    <ConfigField fieldKey={key} field={field} value={config[key]} onChange={handleChange} />
                  </label>
                ))}
            </div>

            {/* Resume section — job tracker only */}
            {isJobTracker && (
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
                    <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>Optional — enables AI job scoring and cover letter generation</div>
                  </div>
                )}
                <input ref={resumeFileRef} type="file" accept=".pdf" style={{ display: 'none' }}
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleResumeFile(f) }} />
              </div>
            )}

            {errors.length > 0 && (
              <div style={{ color: 'var(--red)', fontSize: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
                {errors.map((error) => <span key={error}>{error}</span>)}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 4 }}>
              <button onClick={closeModal} style={{
                fontSize: 12, fontWeight: 500, padding: '10px 16px', borderRadius: 10,
                border: '1px solid var(--border)', background: 'var(--surface-2)',
                color: 'var(--text-secondary)', cursor: 'pointer',
              }}>Cancel</button>
              <button onClick={submit} disabled={loading} style={{
                fontSize: 12, fontWeight: 500, padding: '10px 16px', borderRadius: 10,
                border: '1px solid var(--brand)', background: 'var(--brand-dim)',
                color: 'var(--brand)', cursor: 'pointer',
              }}>{loading ? 'Deploying…' : 'Deploy agent'}</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
