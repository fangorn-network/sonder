import { useCallback, useEffect, useRef, useState } from 'react'
import { useFangornAgent } from './useFangornAgent'
import { agentResultToTracks } from '../utils/agentToTrack'
import type { Track } from '../types'

// ─── Kernel snapshot ────────────────────────────────────────────────────────
// A minimal read interface so this hook stays decoupled from useSessionKernel's
// internals.  Pass the real kernel object — we only read these fields.
export interface KernelSnapshot {
  entropy: number                   // 0–1, current exploration pressure
  centroidLabel?: string            // human-readable if available, e.g. "ambient / post-rock"
  recentPlays: string[]             // last N track labels/titles, newest first
  recentSkips: string[]             // last N skipped track labels/titles
  uncertaintyHint?: string          // optional: a genre/mood region the kernel is unsure about
}

// ─── Config ──────────────────────────────────────────────────────────────────
const QUEUE_LOW_WATER  = 2   // refill when queue drops to this
const QUEUE_TARGET     = 6   // fill up to this many tracks
const POLL_INTERVAL_MS = 45_000  // background heartbeat (45s) — only fires when queue is low

// ─── Prompt builder ──────────────────────────────────────────────────────────
// Serialises kernel state into a natural-language + structured query.
// The agent receives this as `message` and uses search_datasources to respond.
function buildQuery(kernel: KernelSnapshot, needed: number): string {
  const parts: string[] = []

  if (kernel.centroidLabel) {
    parts.push(`Taste centre: ${kernel.centroidLabel}.`)
  }

  parts.push(`Exploration pressure (entropy): ${(kernel.entropy * 100).toFixed(0)}%.`)

  if (kernel.recentPlays.length > 0) {
    parts.push(`Recent plays: ${kernel.recentPlays.slice(0, 4).join(', ')}.`)
  }

  if (kernel.recentSkips.length > 0) {
    parts.push(`Recent skips (avoid these patterns): ${kernel.recentSkips.slice(0, 3).join(', ')}.`)
  }

  if (kernel.uncertaintyHint) {
    parts.push(`Uncertainty zone (probe here): ${kernel.uncertaintyHint}.`)
  }

  // The key instruction: information-maximum, not engagement-maximum
  parts.push(
    `Find ${needed} tracks that maximise information gain against this taste model — ` +
    `the most surprising thing this listener can still appreciate. ` +
    `Prioritise unexplored adjacent territory over confirmed favourites. ` +
    `Do not repeat any recent plays.`
  )

  return parts.join(' ')
}

// ─── Hook ────────────────────────────────────────────────────────────────────
export interface AmbientAgentOptions {
  kernel: KernelSnapshot | null
  enabled: boolean
}

export interface AmbientAgentState {
  queue: Track[]
  status: 'idle' | 'fetching' | 'error'
  lastQuery: string | null
  lastReason: string | null   // agent's explanation for the batch — surfaces in Window mode
  consume: () => Track | null // pop the next track, triggers replenish if needed
  prime: () => void           // manually trigger a fill (e.g. when mode switches to 'agent')
}

export function useAmbientAgent({ kernel, enabled }: AmbientAgentOptions): AmbientAgentState {
  const { sendMessage } = useFangornAgent()

  const [queue, setQueue]         = useState<Track[]>([])
  const [status, setStatus]       = useState<'idle' | 'fetching' | 'error'>('idle')
  const [lastQuery, setLastQuery] = useState<string | null>(null)
  const [lastReason, setLastReason] = useState<string | null>(null)

  // Keep a ref-copy of the queue so callbacks always see current length
  const queueRef    = useRef<Track[]>([])
  const fetchingRef = useRef(false)
  const kernelRef   = useRef<KernelSnapshot | null>(null)

  useEffect(() => { kernelRef.current = kernel }, [kernel])

  // Deduplicate by track id against recent plays + current queue
  const seenIds = useRef<Set<string>>(new Set())

  // ── Core fetch ────────────────────────────────────────────────────────────
  const fetchBatch = useCallback(async () => {
    console.log('calling fetch batch')
    if (!enabled) return

    if (fetchingRef.current) return

    const k = kernelRef.current
    if (!k) return

    const needed = QUEUE_TARGET - queueRef.current.length
    if (needed <= 0) return

    fetchingRef.current = true
    setStatus('fetching')

    try {
      const query = buildQuery(k, needed)
      console.log('using query ' + query)
      setLastQuery(query)

      const result = await sendMessage(query)
      if (!result) throw new Error('Agent returned null')

      const tracks = agentResultToTracks(result.mcpResults)
        .filter(t => !seenIds.current.has(t.id))
        .slice(0, needed)

      // Mark seen
      tracks.forEach(t => seenIds.current.add(t.id))

      if (result.agentMessage) setLastReason(result.agentMessage)

      setQueue(prev => {
        const next = [...prev, ...tracks]
        queueRef.current = next
        return next
      })
      setStatus('idle')
    } catch (e) {
      console.error('[ambient-agent] fetch failed:', e)
      setStatus('error')
    } finally {
      fetchingRef.current = false
    }
  }, [enabled, sendMessage])

  // ── Background heartbeat ──────────────────────────────────────────────────
  // Only fires when enabled AND queue is low — not a busy-poll
  useEffect(() => {
    if (!enabled) return
    const id = setInterval(() => {
      if (queueRef.current.length < QUEUE_LOW_WATER) {
        fetchBatch()
      }
    }, POLL_INTERVAL_MS)
    return () => clearInterval(id)
  }, [enabled, fetchBatch])

  // ── Initial prime when enabled flips on ───────────────────────────────────
  useEffect(() => {
    if (enabled && queueRef.current.length === 0) {
      fetchBatch()
    }
  }, [enabled, fetchBatch])

  // ── consume ───────────────────────────────────────────────────────────────
  const consume = useCallback((): Track | null => {
    if (queueRef.current.length === 0) return null

    const [next, ...rest] = queueRef.current
    queueRef.current = rest
    setQueue(rest)

    // Replenish if we've dropped below the low-water mark
    if (rest.length < QUEUE_LOW_WATER) {
      fetchBatch()
    }

    return next
  }, [fetchBatch])

  // ── manual prime ──────────────────────────────────────────────────────────
  const prime = useCallback(() => { fetchBatch() }, [fetchBatch])

  return { queue, status, lastQuery, lastReason, consume, prime }
}