/**
 * useYoutubeContext.tsx
 *
 * Replaces the iframe-based YouTube provider with yt-dlp + HTML5 <audio>.
 *
 * Public interface is intentionally identical to the old context so
 * nothing upstream needs to change. The only behavioural difference:
 *   - play() accepts a video ID *or* a search string (yt-dlp handles both)
 *   - seeking and volume work natively via the audio element
 *   - no hidden iframe, no YT state machine, no embed restrictions
 *
 * IPC contract (must be registered in main.ts):
 *   ipcMain.handle('yt:resolve', (_e, query) => resolveYt(query))
 *   → Promise<{ streamUrl, videoId, title, artist, thumbnail, durationMs }>
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react'

// ─── Public interface ─────────────────────────────────────────────────────────

export interface YouTubeContextValue {
  play:           (queryOrId: string, title?: string, artist?: string) => void
  pause:          () => void
  resume:         () => void
  stop:           () => void
  ready:          boolean
  isPlaying:      boolean
  currentVideoId: string | null
  currentTitle:   string | null
  currentArtist:  string | null
  currentThumb:   string | null
  durationMs:     number
  progressMs:     number
  seek:           (ms: number) => void
  setVolume:      (pct: number) => void
  error:          string | null
}

// ─── Internal resolve result ──────────────────────────────────────────────────

interface YtResolveResult {
  streamUrl:  string
  videoId:    string
  title:      string
  artist:     string
  thumbnail:  string
  durationMs: number
}

// ─── Context ──────────────────────────────────────────────────────────────────

const YouTubeContext = createContext<YouTubeContextValue | null>(null)

// ─── Provider ─────────────────────────────────────────────────────────────────

export function YouTubeProvider({
  children,
  onEnded,
}: {
  children: React.ReactNode
  onEnded?: () => void
}) {
  const audioRef    = useRef<HTMLAudioElement | null>(null)
  const progressRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const onEndedRef  = useRef(onEnded)
  useEffect(() => { onEndedRef.current = onEnded }, [onEnded])

  const [ready,          setReady]          = useState(false)
  const [isPlaying,      setIsPlaying]      = useState(false)
  const [currentVideoId, setCurrentVideoId] = useState<string | null>(null)
  const [currentTitle,   setCurrentTitle]   = useState<string | null>(null)
  const [currentArtist,  setCurrentArtist]  = useState<string | null>(null)
  const [currentThumb,   setCurrentThumb]   = useState<string | null>(null)
  const [durationMs,     setDurationMs]     = useState(0)
  const [progressMs,     setProgressMs]     = useState(0)
  const [error,          setError]          = useState<string | null>(null)

  // ── Create audio element once ──────────────────────────────────────────────
  useEffect(() => {
    const audio = new Audio()
    audio.preload = 'auto'
    audio.volume  = 1

    audio.addEventListener('play',  () => setIsPlaying(true))
    audio.addEventListener('pause', () => setIsPlaying(false))
    audio.addEventListener('ended', () => {
      setIsPlaying(false)
      setProgressMs(0)
      onEndedRef.current?.()
    })
    audio.addEventListener('durationchange', () => {
      setDurationMs(isFinite(audio.duration) ? Math.round(audio.duration * 1000) : 0)
    })
    audio.addEventListener('error', () => {
      // Ignore errors when no src is loaded yet
      if (!audio.currentSrc) return
      const msg = audio.error?.message ?? 'Audio error'
      console.error('[yt] audio error:', msg)
      setError(msg)
      setIsPlaying(false)
    })

    audioRef.current = audio
    setReady(true)

    progressRef.current = setInterval(() => {
      if (!audio.paused && isFinite(audio.currentTime)) {
        setProgressMs(Math.round(audio.currentTime * 1000))
      }
    }, 500)

    return () => {
      audio.pause()
      audio.src = ''
      if (progressRef.current) clearInterval(progressRef.current)
    }
  }, [])

  // ── play ───────────────────────────────────────────────────────────────────

  const play = useCallback(async (
    queryOrId: string,
    title?:    string,
    artist?:   string,
  ) => {
    setError(null)
    const audio = audioRef.current
    if (!audio) return

    audio.pause()
    setIsPlaying(false)

    try {
      const result: YtResolveResult = await (window as any).electron.ipcRenderer.invoke(
        'yt:resolve',
        queryOrId,
      )

      setCurrentVideoId(result.videoId)
      setCurrentTitle(title   ?? result.title)
      setCurrentArtist(artist ?? result.artist)
      setCurrentThumb(result.thumbnail)
      setDurationMs(result.durationMs)
      setProgressMs(0)

      audio.src = result.streamUrl
      audio.load()
      await audio.play()
    } catch (e: any) {
      const msg = e?.message ?? 'Playback failed'
      console.error('[yt] play error:', msg)
      setError(msg)
    }
  }, [])

  // ── controls ───────────────────────────────────────────────────────────────

  const pause  = useCallback(() => { audioRef.current?.pause() }, [])
  const resume = useCallback(() => { audioRef.current?.play()  }, [])

  const stop = useCallback(() => {
    const audio = audioRef.current
    if (!audio) return
    audio.pause()
    audio.src = ''
    setIsPlaying(false)
    setCurrentVideoId(null)
    setCurrentTitle(null)
    setCurrentArtist(null)
    setCurrentThumb(null)
    setDurationMs(0)
    setProgressMs(0)
  }, [])

  const seek = useCallback((ms: number) => {
    const audio = audioRef.current
    if (!audio) return
    audio.currentTime = ms / 1000
    setProgressMs(ms)
  }, [])

  const setVolume = useCallback((pct: number) => {
    if (audioRef.current) audioRef.current.volume = Math.max(0, Math.min(1, pct / 100))
  }, [])

  return (
    <YouTubeContext.Provider value={{
      play, pause, resume, stop, seek, setVolume,
      ready, isPlaying,
      currentVideoId, currentTitle, currentArtist, currentThumb,
      durationMs, progressMs,
      error,
    }}>
      {children}
    </YouTubeContext.Provider>
  )
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useYouTubeContext() {
  const ctx = useContext(YouTubeContext)
  if (!ctx) throw new Error('useYouTubeContext must be used inside YouTubeProvider')
  return ctx
}