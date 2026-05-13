import { useEffect, useRef } from 'react'

const CHROMA_URL = (import.meta as any).env.VITE_CHROMA_URL ?? 'http://localhost:8080'
const SYNC_INTERVAL_MS = 60_000

export interface UseChromaSyncOptions {
  /** Called after a reingest is successfully triggered */
  onSync?: () => void
  /** Called if the reingest request fails */
  onError?: (err: Error) => void
  /** Override the default 30s interval */
  intervalMs?: number
  /** Set false to pause syncing (e.g. while app is backgrounded) */
  enabled?: boolean
}

export function useChromaSync({
  onSync,
  onError,
  intervalMs = SYNC_INTERVAL_MS,
  enabled = true,
}: UseChromaSyncOptions = {}) {
  const onSyncRef  = useRef(onSync)
  const onErrorRef = useRef(onError)

  useEffect(() => { onSyncRef.current  = onSync  }, [onSync])
  useEffect(() => { onErrorRef.current = onError }, [onError])

  useEffect(() => {
    if (!enabled) return

    async function reingest() {
      try {
        const resp = await fetch(`${CHROMA_URL}/reingest`, { method: 'POST' })
        if (!resp.ok) throw new Error(`Reingest failed: ${resp.status}`)
        onSyncRef.current?.()
      } catch (e) {
        onErrorRef.current?.(e instanceof Error ? e : new Error(String(e)))
      }
    }

    // Fire once immediately on mount, then on interval
    reingest()
    const id = setInterval(reingest, intervalMs)
    return () => clearInterval(id)
  }, [enabled, intervalMs])
}