'use client'

import { useEffect, useRef, useState } from 'react'

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December']
const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

function formatDisplay(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return `${MONTHS[m - 1]} ${d}, ${y}`
}

type Props = {
  value: string
  onChange: (value: string) => void
  min?: string
}

export default function DatePicker({ value, onChange, min }: Props) {
  const today = new Date()
  const todayIso = today.toISOString().split('T')[0]
  const minIso = min ?? todayIso

  const parseIso = (iso: string) => {
    const [y, m] = iso.split('-').map(Number)
    return { year: y, month: m - 1 }
  }

  const initial = value ? parseIso(value) : { year: today.getFullYear(), month: today.getMonth() }
  const [open, setOpen] = useState(false)
  const [viewYear, setViewYear] = useState(initial.year)
  const [viewMonth, setViewMonth] = useState(initial.month)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const prevMonth = () => {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11) }
    else setViewMonth(m => m - 1)
  }
  const nextMonth = () => {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0) }
    else setViewMonth(m => m + 1)
  }

  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate()
  const firstDay = new Date(viewYear, viewMonth, 1).getDay()

  const toIso = (day: number) =>
    `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`

  const selectDay = (day: number) => {
    const iso = toIso(day)
    if (iso < minIso) return
    onChange(iso)
    setOpen(false)
  }

  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%',
          minHeight: 42,
          borderRadius: 12,
          border: '1px solid var(--border)',
          padding: '10px 12px',
          background: 'var(--surface-1)',
          color: value ? 'var(--text-primary)' : 'var(--text-tertiary)',
          textAlign: 'left',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: 13,
          boxSizing: 'border-box',
        }}
      >
        <span>{value ? formatDisplay(value) : 'Select a date'}</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--text-tertiary)', flexShrink: 0 }}>
          <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
        </svg>
      </button>

      {open && (
        <div style={{
          position: 'absolute',
          top: 'calc(100% + 6px)',
          left: 0,
          zIndex: 300,
          background: 'var(--surface-2)',
          border: '1px solid var(--border)',
          borderRadius: 14,
          padding: 16,
          width: 272,
          boxShadow: '0 16px 40px rgba(0,0,0,0.4)',
        }}>
          {/* Month navigation */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <button type="button" onClick={prevMonth} style={navBtn}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
            </button>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
              {MONTHS[viewMonth]} {viewYear}
            </span>
            <button type="button" onClick={nextMonth} style={navBtn}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="9 18 15 12 9 6"/></svg>
            </button>
          </div>

          {/* Weekday headers */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', marginBottom: 6 }}>
            {WEEKDAYS.map(d => (
              <div key={d} style={{ textAlign: 'center', fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)', padding: '2px 0' }}>
                {d}
              </div>
            ))}
          </div>

          {/* Days grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
            {cells.map((day, i) => {
              if (!day) return <div key={`empty-${i}`} />
              const iso = toIso(day)
              const selected = iso === value
              const disabled = iso < minIso
              const isToday = iso === todayIso
              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => selectDay(day)}
                  disabled={disabled}
                  style={{
                    aspectRatio: '1',
                    borderRadius: 8,
                    border: isToday && !selected ? '1px solid var(--brand)' : '1px solid transparent',
                    fontSize: 12,
                    fontWeight: selected ? 600 : 400,
                    cursor: disabled ? 'default' : 'pointer',
                    background: selected ? 'var(--brand)' : 'transparent',
                    color: disabled
                      ? 'var(--text-tertiary)'
                      : selected
                      ? '#fff'
                      : isToday
                      ? 'var(--brand)'
                      : 'var(--text-primary)',
                    opacity: disabled ? 0.4 : 1,
                    transition: 'background 0.1s',
                  }}
                  onMouseEnter={e => { if (!disabled && !selected) (e.target as HTMLButtonElement).style.background = 'var(--surface-3)' }}
                  onMouseLeave={e => { if (!disabled && !selected) (e.target as HTMLButtonElement).style.background = 'transparent' }}
                >
                  {day}
                </button>
              )
            })}
          </div>

          {value && (
            <button
              type="button"
              onClick={() => { onChange(''); setOpen(false) }}
              style={{
                marginTop: 12,
                width: '100%',
                padding: '6px',
                borderRadius: 8,
                border: '1px solid var(--border)',
                background: 'transparent',
                color: 'var(--text-secondary)',
                fontSize: 11,
                cursor: 'pointer',
              }}
            >
              Clear
            </button>
          )}
        </div>
      )}
    </div>
  )
}

const navBtn: React.CSSProperties = {
  background: 'var(--surface-3)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  width: 28,
  height: 28,
  cursor: 'pointer',
  color: 'var(--text-secondary)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 0,
  flexShrink: 0,
}
