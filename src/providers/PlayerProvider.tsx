import {
  createContext, useContext, useRef, useState, useEffect, useCallback, useMemo,
  type ReactNode,
} from 'react'
import { usePrivy } from '@privy-io/react-auth'
import type { Track } from '../types'
import { useFangornMiddleware } from '../hooks/useX402fFetch'
import { useFirebase } from '../hooks/useFirebase'

export type PlayerStatus =
  | 'idle'      // no track selected
  | 'loading'   // fetching bytes (settle or initial load)
  | 'ready'     // blob loaded, never started or finished
  | 'playing'
  | 'paused'
  | 'error'

interface PlayerContextValue {
  currentTrack: Track | null
  status: PlayerStatus
  error: string | null
  progress: number    // 0–1
  currentTime: number
  duration: number
  queue: Track[]      // owned tracks in catalog order
  queueIdx: number
  hasPrev: boolean
  hasNext: boolean

  /** Play an owned track. Requires nullifier in storage; runs settle path. */
  selectTrack: (track: Track) => Promise<void>
  /** Post-buy handoff. Caller already has bytes; skip the network. */
  loadFromBytes: (track: Track, bytes: Uint8Array) => Promise<void>
  togglePlay: () => void
  play: () => void
  pause: () => void
  seek: (ratio: number) => void
  next: () => void
  prev: () => void
}

const PlayerContext = createContext<PlayerContextValue | null>(null)

export function usePlayer() {
  const ctx = useContext(PlayerContext)
  if (!ctx) throw new Error('usePlayer must be used within PlayerProvider')
  return ctx
}

export function PlayerProvider({
  tracks,
  children,
}: { tracks: Track[]; children: ReactNode }) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const blobUrlRef = useRef<string | null>(null)

  const [currentTrack, setCurrentTrack] = useState<Track | null>(null)
  const [status, setStatus] = useState<PlayerStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)

  const middleware = useFangornMiddleware()
  const { user } = usePrivy()
  const { ids: libraryIds, getNullifier } = useFirebase(user?.id ?? null)

  // ── queue derivation ────────────────────────────────────────────────
  const queue = useMemo(
    () => tracks.filter(t => libraryIds.includes(t.id)),
    [tracks, libraryIds],
  )
  const queueIdx = currentTrack ? queue.findIndex(t => t.id === currentTrack.id) : -1
  const hasPrev = queueIdx > 0
  const hasNext = queueIdx !== -1 && queueIdx < queue.length - 1

  // ── shared playback bootstrap ───────────────────────────────────────
  const startPlayback = useCallback(async (bytes: Uint8Array) => {
    const blob = new Blob(
      [bytes.buffer.slice(0) as ArrayBuffer],
      { type: 'audio/mpeg' },
    )
    if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current)
    blobUrlRef.current = URL.createObjectURL(blob)

    const audio = audioRef.current
    if (!audio) return
    audio.src = blobUrlRef.current
    await audio.play()
    setStatus('playing')
  }, [])

  // ── settle path ─────────────────────────────────────────────────────
  const selectTrack = useCallback(async (track: Track) => {
    if (!middleware) return

    // toggle if already current
    if (currentTrack?.id === track.id && status !== 'error') {
      if (status === 'playing') {
        audioRef.current?.pause()
        setStatus('paused')
      } else if (blobUrlRef.current && audioRef.current) {
        await audioRef.current.play()
        setStatus('playing')
      }
      return
    }

    setCurrentTrack(track)
    setStatus('loading')
    setError(null)
    setProgress(0)
    setCurrentTime(0)
    setDuration(0)

    try {
      const nullifier = getNullifier(track.id)
      if (!nullifier) {
        setStatus('error')
        setError('Track not in library — buy it first')
        return
      }

      const result = await middleware.fetchResource({
        owner: track.owner as `0x${string}`,
        schemaName: track.datasourceName,
        name: track.name,
        baseUrl: '/facilitator',
        nullifierHash: nullifier,
      })

      if (!result.success || !result.data) {
        setStatus('error')
        setError((result as { error?: string }).error ?? 'Fetch failed')
        return
      }

      const bytes = result.data instanceof Uint8Array
        ? result.data
        : new Uint8Array(result.data as ArrayBuffer)

      await startPlayback(bytes)
    } catch (e) {
      setStatus('error')
      setError(e instanceof Error ? e.message : 'Playback failed')
    }
  }, [middleware, currentTrack, status, getNullifier, startPlayback])

  // ── post-buy handoff ────────────────────────────────────────────────
  const loadFromBytes = useCallback(async (track: Track, bytes: Uint8Array) => {
    setCurrentTrack(track)
    setStatus('loading')
    setError(null)
    setProgress(0)
    setCurrentTime(0)
    setDuration(0)

    try {
      await startPlayback(bytes)
    } catch (e) {
      setStatus('error')
      setError(e instanceof Error ? e.message : 'Playback failed')
    }
  }, [startPlayback])

  // ── transport ───────────────────────────────────────────────────────
  const play = useCallback(() => {
    audioRef.current?.play()
    setStatus('playing')
  }, [])

  const pause = useCallback(() => {
    audioRef.current?.pause()
    setStatus('paused')
  }, [])

  const togglePlay = useCallback(() => {
    if (status === 'playing') pause()
    else if (status === 'paused' || status === 'ready') play()
  }, [status, play, pause])

  const seek = useCallback((ratio: number) => {
    if (audioRef.current && duration) {
      audioRef.current.currentTime = ratio * duration
      setProgress(ratio)
    }
  }, [duration])

  const next = useCallback(() => {
    if (hasNext) selectTrack(queue[queueIdx + 1])
  }, [hasNext, queue, queueIdx, selectTrack])

  const prev = useCallback(() => {
    if (hasPrev) selectTrack(queue[queueIdx - 1])
  }, [hasPrev, queue, queueIdx, selectTrack])

  // ── audio element wiring ────────────────────────────────────────────
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    const onTimeUpdate = () => {
      setCurrentTime(audio.currentTime)
      setProgress(audio.duration ? audio.currentTime / audio.duration : 0)
    }
    const onDurationChange = () => setDuration(audio.duration || 0)
    const onEnded = () => {
      setProgress(0)
      setCurrentTime(0)
      if (audio) audio.currentTime = 0
      if (hasNext) {
        selectTrack(queue[queueIdx + 1])
      } else {
        setStatus('paused')
      }
    }
    // guard against the spurious error event from src=''
    const onError = () => {
      if (!audio.src || audio.src === window.location.href) return
      if (!audio.error) return
      setStatus('error')
      setError('Playback failed')
    }

    audio.addEventListener('timeupdate', onTimeUpdate)
    audio.addEventListener('durationchange', onDurationChange)
    audio.addEventListener('ended', onEnded)
    audio.addEventListener('error', onError)
    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate)
      audio.removeEventListener('durationchange', onDurationChange)
      audio.removeEventListener('ended', onEnded)
      audio.removeEventListener('error', onError)
    }
  }, [hasNext, queue, queueIdx, selectTrack])

  useEffect(() => () => {
    if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current)
  }, [])

  const value: PlayerContextValue = {
    currentTrack, status, error, progress, currentTime, duration,
    queue, queueIdx, hasPrev, hasNext,
    selectTrack, loadFromBytes, togglePlay, play, pause, seek, next, prev,
  }

  return (
    <PlayerContext.Provider value={value}>
      <audio ref={audioRef} />
      {children}
    </PlayerContext.Provider>
  )
}