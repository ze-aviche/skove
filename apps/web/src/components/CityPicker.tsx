'use client'

import { useEffect, useRef, useState } from 'react'

export const CITIES = [
  { city: 'New York', state: 'NY' },
  { city: 'Los Angeles', state: 'CA' },
  { city: 'Chicago', state: 'IL' },
  { city: 'Houston', state: 'TX' },
  { city: 'Phoenix', state: 'AZ' },
  { city: 'Philadelphia', state: 'PA' },
  { city: 'San Antonio', state: 'TX' },
  { city: 'San Diego', state: 'CA' },
  { city: 'Dallas', state: 'TX' },
  { city: 'San Jose', state: 'CA' },
  { city: 'Austin', state: 'TX' },
  { city: 'Jacksonville', state: 'FL' },
  { city: 'Fort Worth', state: 'TX' },
  { city: 'Columbus', state: 'OH' },
  { city: 'Charlotte', state: 'NC' },
  { city: 'San Francisco', state: 'CA' },
  { city: 'Seattle', state: 'WA' },
  { city: 'Denver', state: 'CO' },
  { city: 'Nashville', state: 'TN' },
  { city: 'Washington', state: 'DC' },
  { city: 'Boston', state: 'MA' },
  { city: 'Atlanta', state: 'GA' },
  { city: 'Miami', state: 'FL' },
  { city: 'Minneapolis', state: 'MN' },
  { city: 'Tampa', state: 'FL' },
  { city: 'New Orleans', state: 'LA' },
  { city: 'Arlington', state: 'TX' },
  { city: 'Las Vegas', state: 'NV' },
  { city: 'Baltimore', state: 'MD' },
  { city: 'Louisville', state: 'KY' },
  { city: 'Memphis', state: 'TN' },
  { city: 'Milwaukee', state: 'WI' },
  { city: 'Albuquerque', state: 'NM' },
  { city: 'Tucson', state: 'AZ' },
  { city: 'Fresno', state: 'CA' },
  { city: 'Sacramento', state: 'CA' },
  { city: 'Kansas City', state: 'MO' },
  { city: 'Colorado Springs', state: 'CO' },
  { city: 'Raleigh', state: 'NC' },
  { city: 'Long Beach', state: 'CA' },
  { city: 'Virginia Beach', state: 'VA' },
  { city: 'Omaha', state: 'NE' },
  { city: 'Oakland', state: 'CA' },
  { city: 'Bakersfield', state: 'CA' },
  { city: 'Honolulu', state: 'HI' },
  { city: 'Anaheim', state: 'CA' },
  { city: 'Aurora', state: 'CO' },
  { city: 'Santa Ana', state: 'CA' },
  { city: 'Corpus Christi', state: 'TX' },
  { city: 'Riverside', state: 'CA' },
  { city: 'St. Louis', state: 'MO' },
  { city: 'Pittsburgh', state: 'PA' },
  { city: 'Stockton', state: 'CA' },
  { city: 'Cincinnati', state: 'OH' },
  { city: 'St. Paul', state: 'MN' },
  { city: 'Greensboro', state: 'NC' },
  { city: 'Toledo', state: 'OH' },
  { city: 'Newark', state: 'NJ' },
  { city: 'Plano', state: 'TX' },
  { city: 'Henderson', state: 'NV' },
  { city: 'Orlando', state: 'FL' },
  { city: 'Chandler', state: 'AZ' },
  { city: 'Madison', state: 'WI' },
  { city: 'Durham', state: 'NC' },
  { city: 'Reno', state: 'NV' },
  { city: 'Baton Rouge', state: 'LA' },
  { city: 'Irvine', state: 'CA' },
  { city: 'Irving', state: 'TX' },
  { city: 'Scottsdale', state: 'AZ' },
  { city: 'Fremont', state: 'CA' },
  { city: 'Gilbert', state: 'AZ' },
  { city: 'Boise', state: 'ID' },
  { city: 'Birmingham', state: 'AL' },
  { city: 'Rochester', state: 'NY' },
  { city: 'Richmond', state: 'VA' },
  { city: 'Spokane', state: 'WA' },
  { city: 'Des Moines', state: 'IA' },
  { city: 'Salt Lake City', state: 'UT' },
  { city: 'Tallahassee', state: 'FL' },
  { city: 'Huntsville', state: 'AL' },
  { city: 'Fort Wayne', state: 'IN' },
  { city: 'Knoxville', state: 'TN' },
  { city: 'Providence', state: 'RI' },
  { city: 'Tempe', state: 'AZ' },
  { city: 'Chattanooga', state: 'TN' },
  { city: 'Fort Lauderdale', state: 'FL' },
  { city: 'Vancouver', state: 'WA' },
  { city: 'Worcester', state: 'MA' },
  { city: 'Fort Collins', state: 'CO' },
  { city: 'Salem', state: 'OR' },
  { city: 'Cary', state: 'NC' },
  { city: 'Eugene', state: 'OR' },
  { city: 'Springfield', state: 'MO' },
  { city: 'Lakewood', state: 'CO' },
  { city: 'Clarksville', state: 'TN' },
  { city: 'Jackson', state: 'MS' },
  { city: 'Savannah', state: 'GA' },
  { city: 'Sunnyvale', state: 'CA' },
  { city: 'Bellevue', state: 'WA' },
  { city: 'Murfreesboro', state: 'TN' },
  { city: 'Macon', state: 'GA' },
  { city: 'Cape Coral', state: 'FL' },
  { city: 'Sioux Falls', state: 'SD' },
  { city: 'Fayetteville', state: 'AR' },
  { city: 'Naperville', state: 'IL' },
  { city: 'Wichita', state: 'KS' },
  { city: 'Frisco', state: 'TX' },
  { city: 'McKinney', state: 'TX' },
  { city: 'Allen', state: 'TX' },
  { city: 'Overland Park', state: 'KS' },
  { city: 'Yonkers', state: 'NY' },
  { city: 'Syracuse', state: 'NY' },
  { city: 'Grand Rapids', state: 'MI' },
  { city: 'Tacoma', state: 'WA' },
  { city: 'Oxnard', state: 'CA' },
  { city: 'Peoria', state: 'AZ' },
  { city: 'Fontana', state: 'CA' },
  { city: 'Moreno Valley', state: 'CA' },
  { city: 'Glendale', state: 'AZ' },
  { city: 'Glendale', state: 'CA' },
  { city: 'Garden Grove', state: 'CA' },
  { city: 'Oceanside', state: 'CA' },
  { city: 'Rancho Cucamonga', state: 'CA' },
  { city: 'Santa Clarita', state: 'CA' },
  { city: 'Elk Grove', state: 'CA' },
  { city: 'Ontario', state: 'CA' },
  { city: 'Corona', state: 'CA' },
  { city: 'Hayward', state: 'CA' },
  { city: 'Palmdale', state: 'CA' },
  { city: 'Torrance', state: 'CA' },
  { city: 'Pomona', state: 'CA' },
  { city: 'Escondido', state: 'CA' },
  { city: 'Pasadena', state: 'TX' },
  { city: 'Pasadena', state: 'CA' },
  { city: 'Orange', state: 'CA' },
  { city: 'Fullerton', state: 'CA' },
  { city: 'Roseville', state: 'CA' },
  { city: 'Surprise', state: 'AZ' },
  { city: 'Mesquite', state: 'TX' },
  { city: 'Columbia', state: 'SC' },
  { city: 'Sterling Heights', state: 'MI' },
  { city: 'Hampton', state: 'VA' },
  { city: 'McAllen', state: 'TX' },
  { city: 'West Valley City', state: 'UT' },
  { city: 'Warren', state: 'MI' },
  { city: 'Alexandria', state: 'VA' },
  { city: 'Peoria', state: 'IL' },
  { city: 'Aurora', state: 'IL' },
  { city: 'Rockford', state: 'IL' },
  { city: 'Little Rock', state: 'AR' },
  { city: 'Akron', state: 'OH' },
  { city: 'Shreveport', state: 'LA' },
  { city: 'Brownsville', state: 'TX' },
  { city: 'Newport News', state: 'VA' },
  { city: 'Mobile', state: 'AL' },
]

type Props = {
  value: string
  onChange: (value: string) => void
  placeholder?: string
}

export default function CityPicker({ value, onChange, placeholder }: Props) {
  const [query, setQuery] = useState(value)
  const [open, setOpen] = useState(false)
  const [focused, setFocused] = useState(-1)
  const ref = useRef<HTMLDivElement>(null)

  const filtered = query.length >= 1
    ? CITIES.filter((c) => {
        const q = query.toLowerCase()
        return (
          c.city.toLowerCase().startsWith(q) ||
          `${c.city}, ${c.state}`.toLowerCase().includes(q) ||
          c.state.toLowerCase() === q
        )
      }).slice(0, 8)
    : []

  useEffect(() => { setQuery(value) }, [value])

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

  const select = (c: typeof CITIES[0]) => {
    const formatted = `${c.city}, ${c.state}`
    setQuery(formatted)
    onChange(formatted)
    setOpen(false)
    setFocused(-1)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open || filtered.length === 0) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setFocused(f => Math.min(f + 1, filtered.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setFocused(f => Math.max(f - 1, 0)) }
    else if (e.key === 'Enter' && focused >= 0) { e.preventDefault(); select(filtered[focused]) }
    else if (e.key === 'Escape') { setOpen(false); setFocused(-1) }
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <input
        value={query}
        placeholder={placeholder ?? 'City, State (e.g. Austin, TX)'}
        onChange={(e) => { setQuery(e.target.value); onChange(e.target.value); setOpen(true); setFocused(-1) }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        autoComplete="off"
        style={{
          width: '100%',
          minHeight: 42,
          borderRadius: 12,
          border: '1px solid var(--border)',
          padding: '10px 12px',
          background: 'var(--surface-1)',
          color: 'var(--text-primary)',
          boxSizing: 'border-box',
          outline: 'none',
        }}
      />
      {open && filtered.length > 0 && (
        <div style={{
          position: 'absolute',
          top: 'calc(100% + 4px)',
          left: 0, right: 0,
          zIndex: 200,
          background: 'var(--surface-2)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          overflow: 'hidden',
          boxShadow: '0 12px 32px rgba(0,0,0,0.3)',
        }}>
          {filtered.map((c, i) => (
            <button
              key={`${c.city}-${c.state}`}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); select(c) }}
              style={{
                width: '100%',
                textAlign: 'left',
                padding: '9px 12px',
                background: i === focused ? 'var(--surface-3)' : 'transparent',
                border: 'none',
                borderBottom: i < filtered.length - 1 ? '1px solid var(--border)' : 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
              }}
            >
              <span style={{
                fontSize: 11, fontWeight: 700,
                color: 'var(--brand)',
                background: 'var(--brand-dim)',
                padding: '2px 7px', borderRadius: 6,
                fontFamily: 'var(--font-mono)',
                minWidth: 30, textAlign: 'center', flexShrink: 0,
              }}>{c.state}</span>
              <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>
                {c.city}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
