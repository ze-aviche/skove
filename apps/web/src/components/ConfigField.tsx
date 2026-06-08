'use client'

import AirportPicker from './AirportPicker'
import CityPicker from './CityPicker'
import DatePicker from './DatePicker'
import LocationTagsPicker from './LocationTagsPicker'
import JobTitlePicker from './JobTitlePicker'
import { AgentConfigField } from '@/lib/api'

const SPECIALIZATIONS = [
  'AI/ML', 'CCaaS', 'Communication', 'Database', 'DevTools',
  'E-commerce', 'FinTech', 'HR Tech', 'Infrastructure', 'Marketing/Analytics', 'Other',
]

const inputStyle = {
  width: '100%',
  minHeight: 42,
  borderRadius: 12,
  border: '1px solid var(--border)',
  padding: '10px 12px',
  background: 'var(--surface-1)',
  color: 'var(--text-primary)',
  boxSizing: 'border-box' as const,
  outline: 'none',
}

type Props = {
  fieldKey: string
  field: AgentConfigField
  value: unknown
  onChange: (key: string, value: unknown) => void
  token?: string
}

export default function ConfigField({ fieldKey, field, value, onChange, token }: Props) {
  if (field.type === 'select') {
    return (
      <select
        value={String(value ?? '')}
        onChange={(e) => onChange(fieldKey, e.target.value)}
        style={inputStyle}
      >
        <option value="">Select an option</option>
        {(field.options ?? []).map((option) => (
          <option key={option} value={option}>{option}</option>
        ))}
      </select>
    )
  }

  if (field.type === 'boolean') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={(e) => onChange(fieldKey, e.target.checked)}
        />
        <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{field.placeholder ?? ''}</span>
      </div>
    )
  }

  if (field.type === 'airport') {
    return (
      <AirportPicker
        value={String(value ?? '')}
        onChange={(v) => onChange(fieldKey, v)}
        placeholder={field.placeholder}
      />
    )
  }

  if (field.type === 'city') {
    return (
      <CityPicker
        value={String(value ?? '')}
        onChange={(v) => onChange(fieldKey, v)}
        placeholder={field.placeholder}
      />
    )
  }

  if (field.type === 'location-tags') {
    return (
      <LocationTagsPicker
        value={String(value ?? '')}
        onChange={(v) => onChange(fieldKey, v)}
        placeholder={field.placeholder}
      />
    )
  }

  if (field.type === 'job-title-tags') {
    return (
      <JobTitlePicker
        value={String(value ?? '')}
        onChange={(v) => onChange(fieldKey, v)}
        placeholder={field.placeholder}
        token={token}
      />
    )
  }

  if (field.type === 'specialization-tags') {
    const selected = new Set(
      String(value ?? '').split(',').map(s => s.trim()).filter(Boolean)
    )
    const toggle = (spec: string) => {
      const next = new Set(selected)
      next.has(spec) ? next.delete(spec) : next.add(spec)
      onChange(fieldKey, Array.from(next).join(', '))
    }
    return (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {SPECIALIZATIONS.map(spec => {
          const active = selected.has(spec)
          return (
            <button
              key={spec}
              type="button"
              onClick={() => toggle(spec)}
              style={{
                fontSize: 12, fontWeight: active ? 600 : 400,
                padding: '6px 12px', borderRadius: 20,
                border: `1px solid ${active ? 'var(--brand)' : 'var(--border)'}`,
                background: active ? 'var(--brand-dim)' : 'var(--surface-2)',
                color: active ? 'var(--brand)' : 'var(--text-secondary)',
                cursor: 'pointer',
                transition: 'all 0.12s',
              }}
            >{spec}</button>
          )
        })}
      </div>
    )
  }

  if (field.type === 'date') {
    return (
      <DatePicker
        value={String(value ?? '')}
        onChange={(v) => onChange(fieldKey, v)}
        min={new Date().toISOString().split('T')[0]}
      />
    )
  }

  return (
    <input
      type={field.type === 'number' ? 'number' : 'text'}
      value={(value ?? '') as string | number}
      placeholder={field.placeholder ?? ''}
      onChange={(e) => {
        const v = field.type === 'number' ? Number(e.target.value) : e.target.value
        onChange(fieldKey, v)
      }}
      style={inputStyle}
    />
  )
}
