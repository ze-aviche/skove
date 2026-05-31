'use client'

import { useEffect, useRef, useState } from 'react'

export const AIRPORTS = [
  // US
  { code: 'ATL', city: 'Atlanta', name: 'Hartsfield-Jackson Atlanta International' },
  { code: 'LAX', city: 'Los Angeles', name: 'Los Angeles International' },
  { code: 'ORD', city: 'Chicago', name: "O'Hare International" },
  { code: 'DFW', city: 'Dallas', name: 'Dallas/Fort Worth International' },
  { code: 'DEN', city: 'Denver', name: 'Denver International' },
  { code: 'JFK', city: 'New York', name: 'John F. Kennedy International' },
  { code: 'SFO', city: 'San Francisco', name: 'San Francisco International' },
  { code: 'LAS', city: 'Las Vegas', name: 'Harry Reid International' },
  { code: 'SEA', city: 'Seattle', name: 'Seattle-Tacoma International' },
  { code: 'CLT', city: 'Charlotte', name: 'Charlotte Douglas International' },
  { code: 'MCO', city: 'Orlando', name: 'Orlando International' },
  { code: 'PHX', city: 'Phoenix', name: 'Phoenix Sky Harbor International' },
  { code: 'MIA', city: 'Miami', name: 'Miami International' },
  { code: 'IAH', city: 'Houston', name: 'George Bush Intercontinental' },
  { code: 'EWR', city: 'Newark', name: 'Newark Liberty International' },
  { code: 'MSP', city: 'Minneapolis', name: 'Minneapolis-Saint Paul International' },
  { code: 'DTW', city: 'Detroit', name: 'Detroit Metropolitan Wayne County' },
  { code: 'BOS', city: 'Boston', name: 'Logan International' },
  { code: 'FLL', city: 'Fort Lauderdale', name: 'Fort Lauderdale-Hollywood International' },
  { code: 'PHL', city: 'Philadelphia', name: 'Philadelphia International' },
  { code: 'LGA', city: 'New York', name: 'LaGuardia Airport' },
  { code: 'BWI', city: 'Baltimore', name: 'Baltimore/Washington International' },
  { code: 'MDW', city: 'Chicago', name: 'Midway International' },
  { code: 'IAD', city: 'Washington', name: 'Washington Dulles International' },
  { code: 'DCA', city: 'Washington', name: 'Ronald Reagan Washington National' },
  { code: 'SLC', city: 'Salt Lake City', name: 'Salt Lake City International' },
  { code: 'AUS', city: 'Austin', name: 'Austin-Bergstrom International' },
  { code: 'HOU', city: 'Houston', name: 'William P. Hobby Airport' },
  { code: 'DAL', city: 'Dallas', name: 'Dallas Love Field' },
  { code: 'SAN', city: 'San Diego', name: 'San Diego International' },
  { code: 'TPA', city: 'Tampa', name: 'Tampa International' },
  { code: 'PDX', city: 'Portland', name: 'Portland International' },
  { code: 'STL', city: 'St. Louis', name: 'St. Louis Lambert International' },
  { code: 'BNA', city: 'Nashville', name: 'Nashville International' },
  { code: 'RDU', city: 'Raleigh', name: 'Raleigh-Durham International' },
  { code: 'MCI', city: 'Kansas City', name: 'Kansas City International' },
  { code: 'OAK', city: 'Oakland', name: 'Oakland Metropolitan International' },
  { code: 'SJC', city: 'San Jose', name: 'Norman Y. Mineta San José International' },
  { code: 'SMF', city: 'Sacramento', name: 'Sacramento International' },
  { code: 'MSY', city: 'New Orleans', name: 'Louis Armstrong New Orleans International' },
  { code: 'SNA', city: 'Orange County', name: 'John Wayne Airport' },
  { code: 'HNL', city: 'Honolulu', name: 'Daniel K. Inouye International' },
  { code: 'OGG', city: 'Maui', name: 'Kahului Airport' },
  { code: 'ABQ', city: 'Albuquerque', name: 'Albuquerque International Sunport' },
  // International
  { code: 'LHR', city: 'London', name: 'Heathrow Airport' },
  { code: 'LGW', city: 'London', name: 'Gatwick Airport' },
  { code: 'CDG', city: 'Paris', name: 'Charles de Gaulle Airport' },
  { code: 'FRA', city: 'Frankfurt', name: 'Frankfurt Airport' },
  { code: 'AMS', city: 'Amsterdam', name: 'Amsterdam Airport Schiphol' },
  { code: 'MAD', city: 'Madrid', name: 'Adolfo Suárez Madrid–Barajas' },
  { code: 'BCN', city: 'Barcelona', name: 'Barcelona-El Prat Airport' },
  { code: 'FCO', city: 'Rome', name: 'Leonardo da Vinci International' },
  { code: 'MUC', city: 'Munich', name: 'Munich Airport' },
  { code: 'ZRH', city: 'Zurich', name: 'Zurich Airport' },
  { code: 'DXB', city: 'Dubai', name: 'Dubai International Airport' },
  { code: 'DOH', city: 'Doha', name: 'Hamad International Airport' },
  { code: 'AUH', city: 'Abu Dhabi', name: 'Zayed International Airport' },
  { code: 'SIN', city: 'Singapore', name: 'Changi Airport' },
  { code: 'HKG', city: 'Hong Kong', name: 'Hong Kong International Airport' },
  { code: 'NRT', city: 'Tokyo', name: 'Narita International Airport' },
  { code: 'HND', city: 'Tokyo', name: 'Haneda Airport' },
  { code: 'ICN', city: 'Seoul', name: 'Incheon International Airport' },
  { code: 'PEK', city: 'Beijing', name: 'Beijing Capital International Airport' },
  { code: 'PVG', city: 'Shanghai', name: 'Shanghai Pudong International Airport' },
  { code: 'BOM', city: 'Mumbai', name: 'Chhatrapati Shivaji Maharaj International' },
  { code: 'DEL', city: 'Delhi', name: 'Indira Gandhi International Airport' },
  { code: 'BLR', city: 'Bangalore', name: 'Kempegowda International Airport' },
  { code: 'MAA', city: 'Chennai', name: 'Chennai International Airport' },
  { code: 'HYD', city: 'Hyderabad', name: 'Rajiv Gandhi International Airport' },
  { code: 'SYD', city: 'Sydney', name: 'Kingsford Smith Airport' },
  { code: 'MEL', city: 'Melbourne', name: 'Melbourne Airport' },
  { code: 'YYZ', city: 'Toronto', name: 'Toronto Pearson International' },
  { code: 'YVR', city: 'Vancouver', name: 'Vancouver International Airport' },
  { code: 'MEX', city: 'Mexico City', name: 'Benito Juárez International Airport' },
  { code: 'GRU', city: 'São Paulo', name: 'Guarulhos International Airport' },
  { code: 'EZE', city: 'Buenos Aires', name: 'Ministro Pistarini International' },
  { code: 'CUN', city: 'Cancún', name: 'Cancún International Airport' },
  { code: 'BOG', city: 'Bogotá', name: 'El Dorado International Airport' },
  { code: 'LIM', city: 'Lima', name: 'Jorge Chávez International Airport' },
]

export function isValidAirport(value: string): boolean {
  const v = value.trim().toUpperCase()
  return AIRPORTS.some(
    (a) => a.code === v || v.includes(`(${a.code})`)
  )
}

type Props = {
  value: string
  onChange: (value: string) => void
  placeholder?: string
}

export default function AirportPicker({ value, onChange, placeholder }: Props) {
  const [query, setQuery] = useState(value)
  const [open, setOpen] = useState(false)
  const [focused, setFocused] = useState<number>(-1)
  const ref = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const filtered = query.length >= 1
    ? AIRPORTS.filter((a) => {
        const q = query.toLowerCase()
        return (
          a.code.toLowerCase().startsWith(q) ||
          a.city.toLowerCase().includes(q) ||
          a.name.toLowerCase().includes(q)
        )
      }).slice(0, 7)
    : []

  useEffect(() => {
    setQuery(value)
  }, [value])

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

  const select = (airport: typeof AIRPORTS[0]) => {
    const formatted = `${airport.city} (${airport.code})`
    setQuery(formatted)
    onChange(formatted)
    setOpen(false)
    setFocused(-1)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open || filtered.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setFocused((f) => Math.min(f + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setFocused((f) => Math.max(f - 1, 0))
    } else if (e.key === 'Enter' && focused >= 0) {
      e.preventDefault()
      select(filtered[focused])
    } else if (e.key === 'Escape') {
      setOpen(false)
      setFocused(-1)
    }
  }

  const valid = query.trim() === '' || isValidAirport(query)

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <input
        value={query}
        placeholder={placeholder ?? 'City or airport code'}
        onChange={(e) => {
          setQuery(e.target.value)
          onChange(e.target.value)
          setOpen(true)
          setFocused(-1)
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        autoComplete="off"
        style={{
          width: '100%',
          minHeight: 42,
          borderRadius: 12,
          border: `1px solid ${!valid ? 'var(--error)' : 'var(--border)'}`,
          padding: '10px 12px',
          background: 'var(--surface-1)',
          color: 'var(--text-primary)',
          boxSizing: 'border-box',
          outline: 'none',
        }}
      />
      {!valid && (
        <span style={{ fontSize: 11, color: 'var(--error)', marginTop: 4, display: 'block' }}>
          Enter a valid airport or city, e.g. &quot;Dallas (DAL)&quot;
        </span>
      )}
      {open && filtered.length > 0 && (
        <div
          ref={listRef}
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
            boxShadow: '0 12px 32px rgba(0,0,0,0.3)',
          }}
        >
          {filtered.map((airport, i) => (
            <button
              key={airport.code}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); select(airport) }}
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
                fontSize: 11,
                fontWeight: 700,
                color: 'var(--brand)',
                background: 'var(--brand-dim)',
                padding: '2px 7px',
                borderRadius: 6,
                fontFamily: 'var(--font-mono)',
                minWidth: 38,
                textAlign: 'center',
                flexShrink: 0,
              }}>
                {airport.code}
              </span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>{airport.city}</div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{airport.name}</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
