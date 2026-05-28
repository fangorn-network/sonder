/**
 * hooks/useSpotifyContext.ts
 *
 * Controls the local Spotify desktop app via IPC.
 * No auth, no tokens.
 */

import { useCallback, useEffect, useRef, useState } from 'react'

const ipc = (window as any).electron.ipcRenderer

export function useSpotify(onEnded?: () => void) {
  const onEndedRef = useRef(onEnded)
  useEffect(() => { onEndedRef.current = onEnded }, [onEnded])

  const [ready,          setReady]          = useState(true)
  const [isPlaying,      setIsPlaying]      = useState(false)
  const [currentVideoId, setCurrentVideoId] = useState<string | null>(null)
  const [currentTitle,   setCurrentTitle]   = useState<string | null>(null)
  const [currentArtist,  setCurrentArtist]  = useState<string | null>(null)
  const [currentThumb,   setCurrentThumb]   = useState<string | null>(null)
  const [durationMs,     setDurationMs]     = useState(0)
  const [progressMs,     setProgressMs]     = useState(0)
  const [error,          setError]          = useState<string | null>(null)

  const wasPlayingRef          = useRef(false)
  // If we never get real status data (Windows/WSL2), we must not fire onEnded
  // — there's no way to know when a track ends, so we never auto-advance.
  const hasEverHadRealDataRef  = useRef(false)

  // ── Poll Spotify app state ────────────────────────────────────────────────
  useEffect(() => {
    const poll = async () => {
      try {
        const s = await ipc.invoke('spotify:status')
        if (!s) return

        const hasRealData = !!(s.title || s.trackId)

        if (hasRealData) {
          hasEverHadRealDataRef.current = true
          setIsPlaying(s.isPlaying)
          setProgressMs(s.progressMs)
          setDurationMs(s.durationMs)
          if (s.trackId) setCurrentVideoId(s.trackId)
          if (s.title)   setCurrentTitle(s.title)
          if (s.artist)  setCurrentArtist(s.artist)
          if (s.thumb)   setCurrentThumb(s.thumb)

          // Only fire onEnded when we have real data — never on EMPTY status
          if (wasPlayingRef.current && !s.isPlaying && s.progressMs < 1000) {
            onEndedRef.current?.()
          }
          wasPlayingRef.current = s.isPlaying
        }
      } catch { /* Spotify not open — non-fatal */ }
    }
    const id = setInterval(poll, 500)
    poll()
    return () => clearInterval(id)
  }, [])

  // ── play ──────────────────────────────────────────────────────────────────
  const play = useCallback(async (
    _queryOrId: string,
    title?:     string,
    artist?:    string,
  ) => {
    setError(null)

    const t = title  ?? _queryOrId
    const a = artist ?? ''

    // Placeholder ID so PlayerBar renders immediately
    const placeholderId = `local:${a}:${t}`.replace(/\s+/g, '-')
    setCurrentVideoId(placeholderId)
    setCurrentTitle(t)
    setCurrentArtist(a)
    setCurrentThumb(null)
    setProgressMs(0)
    setIsPlaying(true)
    wasPlayingRef.current = true

    try {
      await ipc.invoke('spotify:play', a, t)
    } catch (e: any) {
      const msg = e?.message ?? 'Playback failed'
      console.error('[spotify] play error:', msg)
      setError(msg)
      setIsPlaying(false)
      wasPlayingRef.current = false
    }
  }, [])

  // ── controls ──────────────────────────────────────────────────────────────
  const pause = useCallback(async () => {
    setIsPlaying(false)
    wasPlayingRef.current = false
    await ipc.invoke('spotify:pause')
  }, [])

  const resume = useCallback(async () => {
    setIsPlaying(true)
    wasPlayingRef.current = true
    await ipc.invoke('spotify:resume')
  }, [])

  const stop = useCallback(async () => {
    await ipc.invoke('spotify:pause')
    setIsPlaying(false)
    setCurrentVideoId(null)
    setCurrentTitle(null)
    setCurrentArtist(null)
    setCurrentThumb(null)
    setDurationMs(0)
    setProgressMs(0)
    wasPlayingRef.current = false
  }, [])

  const seek = useCallback(async (ms: number) => {
    setProgressMs(ms)
    await ipc.invoke('spotify:seek', ms)
  }, [])

  const setVolume = useCallback(async (pct: number) => {
    await ipc.invoke('spotify:volume', pct)
  }, [])

  return {
    play, pause, resume, stop, seek, setVolume,
    ready, isPlaying,
    currentVideoId, currentTitle, currentArtist, currentThumb,
    durationMs, progressMs,
    error,
  }
}