'use client'

import AirportPicker from './AirportPicker'
import CityPicker from './CityPicker'
import DatePicker from './DatePicker'
import LocationTagsPicker from './LocationTagsPicker'
import { AgentConfigField } from '@/lib/api'

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
}

export default function ConfigField({ fieldKey, field, value, onChange }: Props) {
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
