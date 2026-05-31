'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { UserButton, useAuth } from '@clerk/nextjs'
import { useTheme } from '@/app/providers'
import { getResults } from '@/lib/api'

const navItems = [
  { label: 'Dashboard', href: '/dashboard', icon: '▦' },
  { label: 'My agents', href: '/dashboard/agents', icon: '⬡' },
  { label: 'Results', href: '/dashboard/results', icon: '◈' },
  { label: 'Alerts', href: '/dashboard/alerts', icon: '◎' },
  { label: 'Agent store', href: '/dashboard/store', icon: '⊞' },
]

export default function Sidebar() {
  const pathname = usePathname()
  const { theme, toggleTheme } = useTheme()
  const { getToken } = useAuth()
  const [unreadCount, setUnreadCount] = useState(0)

  const fetchUnread = async () => {
    try {
      const token = await getToken()
      const results = await getResults(token)
      setUnreadCount(results.filter((r) => !r.isRead).length)
    } catch { /* non-fatal */ }
  }

  useEffect(() => {
    fetchUnread()
  }, [pathname])

  useEffect(() => {
    const handler = () => fetchUnread()
    window.addEventListener('results:changed', handler)
    return () => window.removeEventListener('results:changed', handler)
  }, [])

  return (
    <aside style={{
      width: 'var(--sidebar-width)',
      background: 'var(--surface-1)',
      borderRight: '1px solid var(--border)',
      position: 'fixed',
      inset: '0 auto 0 0',
      display: 'flex',
      flexDirection: 'column',
      zIndex: 40,
    }}>
      {/* Logo */}
      <div style={{
        padding: '20px 18px 16px',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
      }}>
        <div style={{
          width: 28, height: 28,
          background: 'var(--brand)',
          borderRadius: 8,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 14,
          boxShadow: '0 0 12px var(--brand-glow)',
        }}>⬡</div>
        <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
          skove
        </span>
        <span style={{
          marginLeft: 'auto',
          fontSize: 10,
          color: 'var(--brand)',
          background: 'var(--brand-dim)',
          padding: '2px 7px',
          borderRadius: 99,
          border: '1px solid rgba(139,92,246,0.2)',
          fontWeight: 500,
        }}>beta</span>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '12px 10px', display: 'flex', flexDirection: 'column', gap: 2 }}>
        <div style={{ fontSize: 10, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.08em', padding: '4px 8px 6px', fontWeight: 500 }}>
          Overview
        </div>
        {navItems.map((item) => {
          const active = pathname === item.href
          return (
            <Link key={item.href} href={item.href} style={{
              display: 'flex',
              alignItems: 'center',
              gap: 9,
              padding: '7px 10px',
              borderRadius: 8,
              fontSize: 13,
              fontWeight: active ? 500 : 400,
              color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
              background: active ? 'var(--surface-3)' : 'transparent',
              border: active ? '1px solid var(--border)' : '1px solid transparent',
              textDecoration: 'none',
              transition: 'all 0.15s',
              position: 'relative',
            }}>
              <span style={{ fontSize: 15, opacity: active ? 1 : 0.6 }}>{item.icon}</span>
              {item.label}
              {item.label === 'Alerts' && unreadCount > 0 && (
                <span style={{
                  marginLeft: 'auto',
                  fontSize: 10,
                  fontWeight: 600,
                  background: 'var(--warning-dim)',
                  color: 'var(--warning)',
                  padding: '1px 6px',
                  borderRadius: 99,
                  border: '1px solid rgba(245,158,11,0.2)',
                }}>{unreadCount}</span>
              )}
              {active && (
                <span style={{
                  position: 'absolute',
                  left: 0, top: '50%',
                  transform: 'translateY(-50%)',
                  width: 2, height: 16,
                  background: 'var(--brand)',
                  borderRadius: 1,
                  boxShadow: '0 0 6px var(--brand)',
                }} />
              )}
            </Link>
          )
        })}
      </nav>

      {/* Footer */}
      <div style={{
        padding: '12px 16px',
        borderTop: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}>
        {/* Theme Toggle */}
        <button
          onClick={toggleTheme}
          style={{
            width: '100%',
            padding: '8px 12px',
            borderRadius: 8,
            border: '1px solid var(--border)',
            background: 'var(--surface-2)',
            color: 'var(--text-secondary)',
            fontSize: 12,
            fontWeight: 500,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            transition: 'all var(--transition-fast)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--surface-3)'
            e.currentTarget.style.color = 'var(--text-primary)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'var(--surface-2)'
            e.currentTarget.style.color = 'var(--text-secondary)'
          }}
        >
          {theme === 'dark' ? '🌙 Dark' : '☀️ Light'}
        </button>

        {/* User */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}>
          <UserButton afterSignOutUrl="/" appearance={{
            elements: { avatarBox: { width: 28, height: 28 } }
          }} />
          <div>
            <div style={{ fontSize: 12, color: 'var(--text-primary)', fontWeight: 500 }}>My account</div>
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Free plan</div>
          </div>
        </div>
      </div>
    </aside>
  )
}
