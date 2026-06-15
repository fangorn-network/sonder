import { useCallback, useEffect, useState } from 'react'

// Light/dark theming. The whole UI is driven by CSS custom properties defined
// in App.css; `data-theme="dark"` on <html> swaps the palette, and every view
// (CSS rules + inline styles that read var(--…)) follows. We persist the user's
// choice and default to the light editorial palette the app was designed around.

export type Theme = 'light' | 'dark'

const STORAGE_KEY = 'sond3r:theme'

function readStoredTheme(): Theme {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (v === 'dark' || v === 'light') return v
  } catch { /* localStorage unavailable */ }
  return 'light'
}

function applyTheme(theme: Theme): void {
  const root = document.documentElement
  root.dataset.theme = theme
  // Tells the UA to render form controls / scrollbars in the matching scheme.
  root.style.colorScheme = theme
  // Re-tint the native window-controls overlay (min/max/close) to match. The
  // bridge may be absent at module-load (preload still wiring up) or in a
  // non-Electron context, so guard the call.
  window.sond3r?.setWindowTheme?.(theme)
}

// Apply at module load — before React's first paint — so the initial render
// already matches the stored theme and there's no light→dark flash.
applyTheme(readStoredTheme())

export function useTheme(): { theme: Theme; toggleTheme: () => void; setTheme: (t: Theme) => void } {
  const [theme, setThemeState] = useState<Theme>(readStoredTheme)

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next)
    try { localStorage.setItem(STORAGE_KEY, next) } catch { /* ignore */ }
    applyTheme(next)
  }, [])

  const toggleTheme = useCallback(() => {
    setThemeState(prev => {
      const next: Theme = prev === 'dark' ? 'light' : 'dark'
      try { localStorage.setItem(STORAGE_KEY, next) } catch { /* ignore */ }
      applyTheme(next)
      return next
    })
  }, [])

  // Re-assert on mount in case the DOM attribute drifted from React state
  // (e.g. a hot reload that reset <html> but kept the module-level value).
  useEffect(() => { applyTheme(theme) }, [theme])

  return { theme, toggleTheme, setTheme }
}
