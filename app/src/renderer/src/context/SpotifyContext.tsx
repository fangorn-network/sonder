/**
 * context/SpotifyContext.tsx
 *
 * Shares a single useSpotify instance across all components.
 * No auth, no tokens.
 */

import { createContext, useContext } from 'react'
import { useSpotify }                from '../hooks/useSpotifyContext'
import type { TasteSignal }          from '../types'

type SpotifyContextValue = ReturnType<typeof useSpotify> & {
  onNext?:   () => void
  onPrev?:   () => void
  onSignal?: (signal: TasteSignal) => void
}

const SpotifyContext = createContext<SpotifyContextValue | null>(null)

export function SpotifyProvider({
  value,
  children,
}: {
  value:    SpotifyContextValue
  children: React.ReactNode
}) {
  return <SpotifyContext.Provider value={value}>{children}</SpotifyContext.Provider>
}

export function useSpotifyContext(): SpotifyContextValue {
  const ctx = useContext(SpotifyContext)
  if (!ctx) throw new Error('useSpotifyContext must be inside SpotifyProvider')
  return ctx
}