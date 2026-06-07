'use client'

import { useEffect, useRef, useState } from 'react'
import { CITIES } from './CityPicker'

const SUGGESTIONS = [
  'Remote',
  'Dallas, TX',
  'Austin, TX',
  'New York, NY',
  'Atlanta, GA',
  'Chicago, IL',
  'San Francisco, CA',
  'Seattle, WA',
  'Denver, CO',
  'Boston, MA',
]

type Props = {
  value: string   // stored as comma-separated, e.g. "Remote, Dallas, TX"
  onChange: (value: string) => void
  placeholder?: string
}

export default function LocationTagsPicker({ value, onChange, placeholder }: Props) {
  const [tags, setTags] = useState<string[]>(() =>
    value ? value.split(',').map((s) => s.trim()).filter(Boolean) : [],
  )
  const [input, setInput] = useState('')
  const [open, setOpen] = useState(false)
  const [focused, setFocused] = useState(-1)
  const ref = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Keep tags in sync if the parent resets value (e.g. edit modal opens with existing config)
  useEffect(() => {
    setTags(value ? value.split(',').map((s) => s.trim()).filter(Boolean) : [])
  }, [value])

  const filteredCities = input.length >= 1
    ? CITIES.filter((c) => {
        const q = input.toLowerCase()
        return (
          c.city.toLowerCase().startsWith(q) ||
          `${c.city}, ${c.state}`.toLowerCase().includes(q) ||
          c.state.toLowerCase() === q
        )
      }).slice(0, 7)
    : []

  const showSuggestions = input.length === 0
  const dropdownItems: string[] = showSuggestions
    ? SUGGESTIONS.filter((s) => !tags.includes(s))
    : filteredCities.map((c) => `${c.city}, ${c.state}`).filter((s) => !tags.includes(s))

  const commit = (tag: string) => {
    const trimmed = tag.trim()
    if (!trimmed || tags.includes(trimmed)) { setInput(''); return }
    const next = [...tags, trimmed]
    setTags(next)
    onChange(next.join(', '))
    setInput('')
    setOpen(false)
    setFocused(-1)
  }

  const removeTag = (i: number) => {
    const next = tags.filter((_, idx) => idx !== i)
    setTags(next)
    onChange(next.join(', '))
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (focused >= 0 && dropdownItems[focused]) {
        commit(dropdownItems[focused])
      } else if (input.trim()) {
        commit(input)
      }
    } else if (e.key === 'Backspace' && !input && tags.length > 0) {
      removeTag(tags.length - 1)
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setFocused((f) => Math.min(f + 1, dropdownItems.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setFocused((f) => Math.max(f - 1, 0))
    } else if (e.key === 'Escape') {
      setOpen(false)
      setFocused(-1)
    }
  }

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
        setFocused(-1)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      {/* Tag container — clicking anywhere focuses the input */}
      <div
        onClick={() => inputRef.current?.focus()}
        style={{
          minHeight: 42,
          borderRadius: 12,
          border: '1px solid var(--border)',
          padding: '6px 10px',
          background: 'var(--surface-1)',
          display: 'flex',
          flexWrap: 'wrap',
          gap: 6,
          alignItems: 'center',
          cursor: 'text',
        }}
      >
        {tags.map((tag, i) => (
          <span
            key={tag}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              background: 'var(--brand-dim)',
              color: 'var(--brand)',
              border: '1px solid rgba(99,102,241,0.25)',
              borderRadius: 8,
              padding: '2px 6px 2px 9px',
              fontSize: 12,
              fontWeight: 500,
              lineHeight: '20px',
            }}
          >
            {tag}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); removeTag(i) }}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--brand)', padding: '0 2px', fontSize: 15, lineHeight: 1,
              }}
            >×</button>
          </span>
        ))}

        <input
          ref={inputRef}
          value={input}
          placeholder={tags.length === 0 ? (placeholder ?? 'Remote, Dallas, TX…') : 'Add location…'}
          autoComplete="off"
          onChange={(e) => { setInput(e.target.value); setOpen(true); setFocused(-1) }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          style={{
            flex: '1 1 120px',
            minWidth: 80,
            background: 'transparent',
            border: 'none',
            outline: 'none',
            color: 'var(--text-primary)',
            fontSize: 13,
            padding: '2px 2px',
          }}
        />
      </div>

      {/* Dropdown */}
      {open && dropdownItems.length > 0 && (
        <div style={{
          position: 'absolute',
          top: 'calc(100% + 4px)',
          left: 0, right: 0,
          zIndex: 200,
          background: 'var(--surface-2)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          overflow: 'hidden',
          boxShadow: '0 12px 32px rgba(0,0,0,0.28)',
        }}>
          {showSuggestions && (
            <div style={{
              padding: '7px 12px 4px',
              fontSize: 10, fontWeight: 700,
              color: 'var(--text-secondary)',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
            }}>
              Suggestions
            </div>
          )}
          {dropdownItems.map((item, i) => (
            <button
              key={item}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); commit(item) }}
              style={{
                width: '100%',
                textAlign: 'left',
                padding: '8px 12px',
                background: i === focused ? 'var(--surface-3)' : 'transparent',
                border: 'none',
                borderBottom: i < dropdownItems.length - 1 ? '1px solid var(--border)' : 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                fontSize: 13,
                color: 'var(--text-primary)',
              }}
            >
              <span style={{ fontSize: 14 }}>{item === 'Remote' ? '🌐' : '📍'}</span>
              {item === 'Remote' ? (
                <span style={{ fontWeight: 600 }}>Remote</span>
              ) : (
                <>
                  <span style={{ fontWeight: 500 }}>{item.split(', ')[0]}</span>
                  <span style={{
                    fontSize: 11, fontWeight: 700, color: 'var(--brand)',
                    background: 'var(--brand-dim)', padding: '1px 6px',
                    borderRadius: 5, fontFamily: 'var(--font-mono)',
                  }}>{item.split(', ')[1]}</span>
                </>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
