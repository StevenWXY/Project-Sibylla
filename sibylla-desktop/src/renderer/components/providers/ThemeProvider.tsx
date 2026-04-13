import React, { createContext, useContext, useEffect, useMemo } from 'react'
import { useAppStore, Theme, selectTheme } from '../../store/appStore'

type ThemeContextType = {
  theme: Theme
  setTheme: (theme: Theme) => void
  resolvedTheme: 'light' | 'dark'
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined)

function getPrefersDark(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return true
  }
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  } catch {
    return true
  }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useAppStore(selectTheme)
  const setTheme = useAppStore((state) => state.setTheme)
  
  const resolvedTheme = useMemo(() => {
    if (theme === 'system') {
      return getPrefersDark() ? 'dark' : 'light'
    }
    return theme
  }, [theme])
  
  useEffect(() => {
    const root = window.document.documentElement
    root.classList.remove('light', 'dark')
    root.classList.add(resolvedTheme)
  }, [resolvedTheme])
  
  useEffect(() => {
    if (theme === 'system') {
      if (typeof window.matchMedia !== 'function') {
        return
      }

      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
      const handleChange = () => {
        const root = window.document.documentElement
        root.classList.remove('light', 'dark')
        root.classList.add(mediaQuery.matches ? 'dark' : 'light')
      }

      if (typeof mediaQuery.addEventListener === 'function') {
        mediaQuery.addEventListener('change', handleChange)
        return () => mediaQuery.removeEventListener('change', handleChange)
      }

      // Older Electron/Chromium fallback
      if (typeof mediaQuery.addListener === 'function') {
        mediaQuery.addListener(handleChange)
        return () => mediaQuery.removeListener(handleChange)
      }
    }
  }, [theme])
  
  return (
    <ThemeContext.Provider value={{ theme, setTheme, resolvedTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider')
  }
  return context
}
