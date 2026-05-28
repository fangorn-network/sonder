/**
 * providers/SpotifyAuthProvider.tsx
 *
 * Auth context + provider. Wrap your app root with this.
 * useSpotifyAuth() can be called anywhere inside it.
 */

import { createContext, useCallback, useContext, useEffect, useState } from 'react'

const ipc = (window as any).electron.ipcRenderer

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SpotifyAuthValue {
  accessToken:     string | null
  isAuthenticated: boolean
  login:           () => Promise<void>
  logout:          () => Promise<void>
}

// ─── Context ──────────────────────────────────────────────────────────────────

const SpotifyAuthCtx = createContext<SpotifyAuthValue | null>(null)

// ─── Provider ─────────────────────────────────────────────────────────────────

export function SpotifyAuthProvider({ children }: { children: React.ReactNode }) {
  const [accessToken,     setAccessToken]     = useState<string | null>(null)
  const [isAuthenticated, setIsAuthenticated] = useState(false)

  // Check for existing token on mount
  useEffect(() => {
    ipc.invoke('spotify-auth:check').then(({ isAuthenticated: authed }: { isAuthenticated: boolean }) => {
      if (!authed) return
      ipc.invoke('spotify-auth:get-token').then((token: string | null) => {
        if (token) { setAccessToken(token); setIsAuthenticated(true) }
      })
    })
  }, [])

  // Listen for auth callback from main process
  useEffect(() => {
    const onSuccess = (_e: unknown, token: string) => {
      setAccessToken(token)
      setIsAuthenticated(true)
    }
    const onError = (_e: unknown, msg: string) => console.error('[spotify-auth]', msg)

    ipc.on('spotify-auth:success', onSuccess)
    ipc.on('spotify-auth:error',   onError)
    return () => {
      ipc.removeListener('spotify-auth:success', onSuccess)
      ipc.removeListener('spotify-auth:error',   onError)
    }
  }, [])

  // Proactive refresh every 30 min
  useEffect(() => {
    if (!isAuthenticated) return
    const id = setInterval(async () => {
      const token = await ipc.invoke('spotify-auth:get-token')
      if (token) setAccessToken(token)
      else { setAccessToken(null); setIsAuthenticated(false) }
    }, 30 * 60 * 1000)
    return () => clearInterval(id)
  }, [isAuthenticated])

  const login = useCallback(async () => {
    await ipc.invoke('spotify-auth:login')
  }, [])

  const logout = useCallback(async () => {
    await ipc.invoke('spotify-auth:logout')
    setAccessToken(null)
    setIsAuthenticated(false)
  }, [])

  return (
    <SpotifyAuthCtx.Provider value={{ accessToken, isAuthenticated, login, logout }}>
      {children}
    </SpotifyAuthCtx.Provider>
  )
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useSpotifyAuth(): SpotifyAuthValue {
  const ctx = useContext(SpotifyAuthCtx)
  if (!ctx) throw new Error('useSpotifyAuth must be inside SpotifyAuthProvider')
  return ctx
}