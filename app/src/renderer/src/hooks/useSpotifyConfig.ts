import { useState, useCallback } from 'react'

export interface SpotifyConfig {
  clientId: string
  clientSecret: string
}

const STORAGE_KEY = 'spotify_config'

function loadConfig(): SpotifyConfig | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (parsed?.clientId && parsed?.clientSecret) return parsed
    return null
  } catch {
    return null
  }
}

export function useSpotifyConfig() {
  const [config, setConfig] = useState<SpotifyConfig | null>(loadConfig)

  const saveConfig = useCallback((next: SpotifyConfig) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    setConfig(next)
  }, [])

  const clearConfig = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY)
    setConfig(null)
  }, [])

  return {
    config,
    hasConfig: config !== null,
    saveConfig,
    clearConfig,
  }
}