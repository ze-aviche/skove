'use client'

import { useEffect, useRef, useState } from 'react'
import { apiUrl } from '@/lib/api'

type Props = {
  value: string // stored as comma-separated, e.g. "Software Engineer, Data Scientist"
  onChange: (value: string) => void
  placeholder?: string
  token?: string
}

export default function JobTitlePicker({ value, onChange, placeholder, token }: Props) {
  const [tags, setTags] = useState<string[]>(() =>
    value ? value.split(',').map((s) => s.trim()).filter(Boolean) : [],
  )
  const [input, setInput] = useState('')
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [open, setOpen] = useState(false)
  const [focused, setFocused] = useState(-1)
  const ref = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setTags(value ? value.split(',').map((s) => s.trim()).filter(Boolean) : [])
  }, [value])

  // Fetch suggestions as user types
  useEffect(() => {
    if (input.length < 1) {
      setSuggestions([])
      return
    }

    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`${apiUrl}/api/jobs/suggestions?field=title&q=${encodeURIComponent(input)}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        })
        const data = await res.json()
        setSuggestions((data || []).filter((s: string) => !tags.includes(s)))
      } catch (err) {
        setSuggestions([])
      }
    }, 200)

    return () => clearTimeout(timer)
  }, [input, tags, token])

  const commit = (tag: string) => {
    const trimmed = tag.trim()
    if (!trimmed || tags.includes(trimmed)) {
      setInput('')
      return
    }
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
      if (focused >= 0 && suggestions[focused]) {
        commit(suggestions[focused])
      } else if (input.trim()) {
        commit(input)
      }
    } else if (e.key === 'Backspace' && !input && tags.length > 0) {
      removeTag(tags.length - 1)
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setFocused((f) => Math.min(f + 1, suggestions.length - 1))
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
              onClick={(e) => {
                e.stopPropagation()
                removeTag(i)
              }}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--brand)',
                padding: '0 2px',
                fontSize: 15,
                lineHeight: 1,
              }}
            >
              ×
            </button>
          </span>
        ))}

        <input
          ref={inputRef}
          value={input}
          placeholder={tags.length === 0 ? (placeholder ?? 'Software Engineer, Data Scientist…') : 'Add title…'}
          autoComplete="off"
          onChange={(e) => {
            setInput(e.target.value)
            setOpen(true)
            setFocused(-1)
          }}
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

      {open && suggestions.length > 0 && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            right: 0,
            zIndex: 200,
            background: 'var(--surface-2)',
            border: '1px solid var(--border)',
            borderRadius: 12,
            overflow: 'hidden',
            boxShadow: '0 12px 32px rgba(0,0,0,0.28)',
          }}
        >
          {suggestions.map((item, i) => (
            <button
              key={item}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault()
                commit(item)
              }}
              style={{
                width: '100%',
                textAlign: 'left',
                padding: '8px 12px',
                background: i === focused ? 'var(--surface-3)' : 'transparent',
                border: 'none',
                borderBottom: i < suggestions.length - 1 ? '1px solid var(--border)' : 'none',
                cursor: 'pointer',
                fontSize: 13,
                color: 'var(--text-primary)',
              }}
            >
              {item}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
