'use client'

import { createContext, useContext, useEffect, useState } from 'react'

type Theme = 'dark' | 'light'

type ToastVariant = 'success' | 'error' | 'info'

interface ThemeContextType {
  theme: Theme
  toggleTheme: () => void
}

interface Toast {
  id: string
  message: string
  variant: ToastVariant
}

interface ToastContextType {
  showToast: (toast: Omit<Toast, 'id'>) => void
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined)
const ToastContext = createContext<ToastContextType | undefined>(undefined)

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>('dark')
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    // Get theme from localStorage or system preference
    const stored = localStorage.getItem('theme') as Theme | null
    const system = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
    const initial = stored || system
    setTheme(initial)
    applyTheme(initial)
  }, [])

  const toggleTheme = () => {
    setTheme((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark'
      localStorage.setItem('theme', next)
      applyTheme(next)
      return next
    })
  }

  const applyTheme = (t: Theme) => {
    const root = document.documentElement
    if (t === 'light') {
      root.setAttribute('data-theme', 'light')
    } else {
      root.removeAttribute('data-theme')
    }
  }

  // Always provide the context to children so hooks like `useTheme` don't throw
  // We still wait to apply the DOM attribute until mounted to avoid FOUC.
  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const showToast = ({ message, variant }: Omit<Toast, 'id'>) => {
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`
    setToasts((prev) => [...prev, { id, message, variant }])
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id))
    }, 4300)
  }

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div style={{
        position: 'fixed',
        right: 18,
        bottom: 18,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        zIndex: 9999,
        pointerEvents: 'none',
      }}>
        {toasts.map((toast) => (
          <div key={toast.id} style={{
            minWidth: 260,
            padding: '12px 14px',
            borderRadius: 14,
            background: toast.variant === 'success' ? 'rgba(34,197,94,0.12)' : toast.variant === 'error' ? 'rgba(239,68,68,0.12)' : 'rgba(59,130,246,0.12)',
            color: toast.variant === 'error' ? 'rgb(185,28,28)' : toast.variant === 'success' ? 'rgb(4,120,87)' : 'rgb(30,64,175)',
            border: `1px solid ${toast.variant === 'success' ? 'rgba(34,197,94,0.2)' : toast.variant === 'error' ? 'rgba(239,68,68,0.25)' : 'rgba(59,130,246,0.2)'}`,
            boxShadow: '0 22px 45px rgba(15, 23, 42, 0.08)',
            pointerEvents: 'auto',
          }}>
            {toast.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) {
    console.warn('useTheme called outside ThemeProvider; falling back to default theme')
    return {
      theme: 'dark' as Theme,
      toggleTheme: () => {},
    }
  }
  return context
}

export function useToast() {
  const context = useContext(ToastContext)
  if (!context) {
    console.warn('useToast called outside ToastProvider; toast calls will be ignored')
    return {
      showToast: () => {},
    }
  }
  return context
}
