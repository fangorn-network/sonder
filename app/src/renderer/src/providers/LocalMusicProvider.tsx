/**
 * providers/LocalMusicProvider.tsx
 *
 * Standalone player for on-disk music. Owns its own HTML5 <audio> element and
 * transport so it stays alive while the user moves around the app, and is
 * deliberately isolated from the catalog player / kernel / agent — local tracks
 * just play. Files are located + served by the main process (main/local/*); this
 * only points <audio> at the localhost stream URL each track carries.
 */

import {
  createContext, useCallback, useContext, useEffect, useRef, useState,
  type ReactNode,
} from 'react'

/** Mirror of main/local/types.ts `LocalTrack` (structurally identical). */
export interface LocalTrack {
  id: string
  path: string
  title: string
  artist: string | null
  album: string | null
  ext: string
  streamUrl: string
}

interface LocalMusicContextValue {
  dir: string | null
  tracks: LocalTrack[]
  loading: boolean
  error: string | null

  current: LocalTrack | null
  isPlaying: boolean
  currentTime: number
  duration: number
  progress: number // 0–1

  /** Scan the saved/default folder once, lazily (called when the view opens). */
  ensureLoaded: () => void
  /** Re-scan the current folder. */
  rescan: () => Promise<void>
  /** Open the native folder picker, then scan the chosen folder. */
  chooseFolder: () => Promise<void>

  playTrack: (track: LocalTrack) => void
  togglePlay: () => void
  next: () => void
  prev: () => void
  seek: (ratio: number) => void
}

const LocalMusicContext = createContext<LocalMusicContextValue | null>(null)

export function useLocalMusic(): LocalMusicContextValue {
  const ctx = useContext(LocalMusicContext)
  if (!ctx) throw new Error('useLocalMusic must be used within LocalMusicProvider')
  return ctx
}

export function LocalMusicProvider({ children }: { children: ReactNode }) {
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const [dir, setDir] = useState<string | null>(null)
  const [tracks, setTracks] = useState<LocalTrack[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const loadedRef = useRef(false)

  const [current, setCurrent] = useState<LocalTrack | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)

  // Show the saved/default folder path on mount; scanning stays lazy.
  useEffect(() => {
    window.localMusic?.getDir().then(setDir).catch(() => {})
  }, [])

  const scanDir = useCallback(async (target?: string) => {
    setLoading(true)
    setError(null)
    try {
      const found = await window.localMusic.scan(target)
      setTracks(found)
      if (target) setDir(target)
      else window.localMusic.getDir().then(setDir).catch(() => {})
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not scan folder')
    } finally {
      // Mark the lazy first-load as attempted even on failure, so `ensureLoaded`
      // doesn't retry-loop. Explicit rescan/chooseFolder still re-scan freely.
      loadedRef.current = true
      setLoading(false)
    }
  }, [])

  const ensureLoaded = useCallback(() => {
    if (loadedRef.current || loading) return
    void scanDir()
  }, [loading, scanDir])

  const rescan = useCallback(() => scanDir(dir ?? undefined), [scanDir, dir])

  const chooseFolder = useCallback(async () => {
    const picked = await window.localMusic.pickDir()
    if (!picked) return
    await scanDir(picked)
  }, [scanDir])

  const playTrack = useCallback((track: LocalTrack) => {
    const audio = audioRef.current
    if (!audio) return
    // Toggle when re-selecting the current track.
    if (current?.id === track.id) {
      if (audio.paused) void audio.play()
      else audio.pause()
      return
    }
    setCurrent(track)
    setError(null)
    audio.src = track.streamUrl
    void audio.play().catch((e) => setError(e instanceof Error ? e.message : 'Playback failed'))
  }, [current])

  const togglePlay = useCallback(() => {
    const audio = audioRef.current
    if (!audio || !current) return
    if (audio.paused) void audio.play()
    else audio.pause()
  }, [current])

  const step = useCallback((delta: number) => {
    if (!current) return
    const idx = tracks.findIndex((t) => t.id === current.id)
    const nextTrack = tracks[idx + delta]
    if (nextTrack) playTrack(nextTrack)
  }, [current, tracks, playTrack])

  const next = useCallback(() => step(1), [step])
  const prev = useCallback(() => step(-1), [step])

  const seek = useCallback((ratio: number) => {
    const audio = audioRef.current
    if (audio && duration) {
      audio.currentTime = Math.max(0, Math.min(1, ratio)) * duration
    }
  }, [duration])

  // ── <audio> event wiring ──────────────────────────────────────────────
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    const onPlay = () => setIsPlaying(true)
    const onPause = () => setIsPlaying(false)
    const onTime = () => setCurrentTime(audio.currentTime)
    const onDuration = () => setDuration(Number.isFinite(audio.duration) ? audio.duration : 0)
    const onEnded = () => next()
    const onError = () => {
      if (!audio.src) return
      setError('Could not play this file')
      setIsPlaying(false)
    }

    audio.addEventListener('play', onPlay)
    audio.addEventListener('pause', onPause)
    audio.addEventListener('timeupdate', onTime)
    audio.addEventListener('durationchange', onDuration)
    audio.addEventListener('ended', onEnded)
    audio.addEventListener('error', onError)
    return () => {
      audio.removeEventListener('play', onPlay)
      audio.removeEventListener('pause', onPause)
      audio.removeEventListener('timeupdate', onTime)
      audio.removeEventListener('durationchange', onDuration)
      audio.removeEventListener('ended', onEnded)
      audio.removeEventListener('error', onError)
    }
  }, [next])

  const value: LocalMusicContextValue = {
    dir, tracks, loading, error,
    current, isPlaying, currentTime, duration,
    progress: duration ? currentTime / duration : 0,
    ensureLoaded, rescan, chooseFolder,
    playTrack, togglePlay, next, prev, seek,
  }

  return (
    <LocalMusicContext.Provider value={value}>
      <audio ref={audioRef} />
      {children}
    </LocalMusicContext.Provider>
  )
}
