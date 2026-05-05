import { createContext, useContext } from 'react'
import { useSpotify } from '../hooks/useSpotify'

type SpotifyContextValue = ReturnType<typeof useSpotify> & {
  onNext?: () => void
  onPrev?: () => void
}

const SpotifyContext = createContext<SpotifyContextValue | null>(null)

export function SpotifyProvider({
  value,
  children,
}: {
  value: SpotifyContextValue
  children: React.ReactNode
}) {
  return <SpotifyContext.Provider value={value}>{children}</SpotifyContext.Provider>
}

export function useSpotifyContext(): SpotifyContextValue {
  const ctx = useContext(SpotifyContext)
  if (!ctx) throw new Error('useSpotifyContext must be used inside SpotifyProvider')
  return ctx
}