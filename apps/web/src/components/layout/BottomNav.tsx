'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { useAuth } from '@clerk/nextjs'
import { getResults } from '@/lib/api'

const navItems = [
  { label: 'Home',    href: '/dashboard',         icon: '▦' },
  { label: 'Agents',  href: '/dashboard/agents',  icon: '⬡' },
  { label: 'Alerts',  href: '/dashboard/alerts',  icon: '◎' },
  { label: 'Store',   href: '/dashboard/store',   icon: '⊞' },
  { label: 'Profile', href: '/dashboard/profile', icon: '◉' },
]

export default function BottomNav() {
  const pathname = usePathname()
  const { getToken } = useAuth()
  const [unreadCount, setUnreadCount] = useState(0)

  const fetchUnread = async () => {
    try {
      const token = await getToken()
      const results = await getResults(token)
      setUnreadCount(results.filter(r => !r.isRead).length)
    } catch { /* non-fatal */ }
  }

  useEffect(() => { fetchUnread() }, [pathname])

  useEffect(() => {
    const handler = () => fetchUnread()
    window.addEventListener('results:changed', handler)
    return () => window.removeEventListener('results:changed', handler)
  }, [])

  return (
    <nav className="bottom-nav">
      {navItems.map((item) => {
        const active = pathname === item.href
        return (
          <Link key={item.href} href={item.href} style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 3,
            padding: '8px 4px',
            textDecoration: 'none',
            color: active ? 'var(--brand)' : 'var(--text-tertiary)',
            position: 'relative',
            transition: 'color 0.15s',
          }}>
            <span style={{ fontSize: 18, lineHeight: 1 }}>{item.icon}</span>
            <span style={{ fontSize: 10, fontWeight: active ? 600 : 400, letterSpacing: '0.01em' }}>
              {item.label}
            </span>
            {item.label === 'Alerts' && unreadCount > 0 && (
              <span style={{
                position: 'absolute', top: 6, right: '50%',
                transform: 'translateX(10px)',
                width: 16, height: 16,
                background: 'var(--warning)',
                color: '#fff',
                fontSize: 9, fontWeight: 700,
                borderRadius: 99,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>{unreadCount > 9 ? '9+' : unreadCount}</span>
            )}
            {active && (
              <span style={{
                position: 'absolute', top: 0, left: '50%',
                transform: 'translateX(-50%)',
                width: 20, height: 2,
                background: 'var(--brand)',
                borderRadius: 99,
              }} />
            )}
          </Link>
        )
      })}
    </nav>
  )
}
