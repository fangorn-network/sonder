/**
 * hooks/useSpotifyContext.ts
 *
 * Controls the local Spotify desktop app via IPC.
 * Handles:
 *  - simulated progress for WSL/Windows
 *  - real progress for Linux/macOS
 *  - robust Spotify transition handling
 *  - queue ownership / auto-advance detection
 */

import { useCallback, useEffect, useRef, useState } from 'react'

const ipc = (window as any).electron.ipcRenderer

export function useSpotify(onEnded?: () => void) {
  const onEndedRef = useRef(onEnded)

  useEffect(() => {
    onEndedRef.current = onEnded
  }, [onEnded])

  // ───────────────────────────────────────────────────────────────────────────
  // refs
  // ───────────────────────────────────────────────────────────────────────────

  const expectedTitleRef = useRef<string | null>(null)
  const expectedArtistRef = useRef<string | null>(null)

  const lastPlayCallRef = useRef(0)
  const handlingEndedRef = useRef(false)

  const transitionPendingRef = useRef(false)
  const transitionStableRef = useRef(false)

  const playStartRef = useRef(0)
  const pausedAtRef = useRef<number | null>(null)
  const totalPausedRef = useRef(0)

  const simDurationRef = useRef(0)

  const wasPlayingRef = useRef(false)
  const isPlayingRef = useRef(false)

  const hasEverHadRealDataRef = useRef(false)

  // ───────────────────────────────────────────────────────────────────────────
  // state
  // ───────────────────────────────────────────────────────────────────────────

  const [ready] = useState(true)

  const [isPlaying, setIsPlaying] = useState(false)

  const [currentVideoId, setCurrentVideoId] =
    useState<string | null>(null)

  const [currentTitle, setCurrentTitle] =
    useState<string | null>(null)

  const [currentArtist, setCurrentArtist] =
    useState<string | null>(null)

  const [currentThumb, setCurrentThumb] =
    useState<string | null>(null)

  const [durationMs, setDurationMs] =
    useState(0)

  const [progressMs, setProgressMs] =
    useState(0)

  const [error, setError] =
    useState<string | null>(null)

  useEffect(() => {
    isPlayingRef.current = isPlaying
  }, [isPlaying])

  // ───────────────────────────────────────────────────────────────────────────
  // helpers
  // ───────────────────────────────────────────────────────────────────────────

  const normalize = (s: string | null | undefined) => {
    if (!s) return ''

    return s
      .toLowerCase()
      .replace(/\(.*?\)/g, '')
      .replace(/\[.*?\]/g, '')
      .replace(/feat\..*/gi, '')
      .replace(/\s+/g, ' ')
      .trim()
  }

  const titlesMatch = (
    actual: string | null | undefined,
    expected: string | null | undefined,
  ) => {
    const a = normalize(actual)
    const e = normalize(expected)

    if (!a || !e) return false

    return (
      a === e ||
      a.includes(e) ||
      e.includes(a)
    )
  }

  const artistsMatch = (
    actual: string | null | undefined,
    expected: string | null | undefined,
  ) => {
    const a = normalize(actual)
    const e = normalize(expected)

    if (!a || !e) return false

    return (
      a === e ||
      a.includes(e) ||
      e.includes(a)
    )
  }

  // ───────────────────────────────────────────────────────────────────────────
  // polling
  // ───────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    const tick = async () => {
      // ── simulated progress ────────────────────────────────────────────────

      if (
        isPlayingRef.current &&
        !pausedAtRef.current &&
        playStartRef.current > 0
      ) {
        const elapsed =
          Date.now() -
          playStartRef.current -
          totalPausedRef.current

        const dur = simDurationRef.current

        const capped =
          dur > 0
            ? Math.min(elapsed, dur)
            : elapsed

        setProgressMs(capped)
      }

      // ── spotify status ────────────────────────────────────────────────────

      try {
        const s = await ipc.invoke('playback:status')

        if (!s) return

        const hasRealData =
          !!(s.title || s.trackId)

        if (hasRealData) {
          hasEverHadRealDataRef.current = true

          setIsPlaying(s.isPlaying)

          // ── real duration/progress ───────────────────────────────────────

          if (s.durationMs > 0) {
            setDurationMs(s.durationMs)
            simDurationRef.current = s.durationMs
          }

          if (s.progressMs > 0) {
            setProgressMs(s.progressMs)

            playStartRef.current =
              Date.now() -
              s.progressMs -
              totalPausedRef.current
          }

          // ── metadata ──────────────────────────────────────────────────────

          if (s.trackId) {
            setCurrentVideoId(s.trackId)
          }

          if (s.title) {
            setCurrentTitle(s.title)
          }

          if (s.artist) {
            setCurrentArtist(s.artist)
          }

          if (s.thumb) {
            setCurrentThumb(s.thumb)
          }

          // ─────────────────────────────────────────────────────────────────
          // transition stabilization
          // ─────────────────────────────────────────────────────────────────

          if (
            transitionPendingRef.current &&
            s.title
          ) {
            const titleOk = titlesMatch(
              s.title,
              expectedTitleRef.current,
            )

            const artistOk =
              !expectedArtistRef.current ||
              artistsMatch(
                s.artist,
                expectedArtistRef.current,
              )

            if (titleOk && artistOk) {
              transitionPendingRef.current = false
              transitionStableRef.current = true

              expectedTitleRef.current = s.title

              console.log(
                '[spotify] transition stabilized:',
                s.title,
              )
            }
          }

          // ─────────────────────────────────────────────────────────────────
          // natural end detection
          // Guard: suppress while a track transition is in-flight. The loading
          // window (URI sent → title confirmed) looks identical to end-of-track
          // and must not trigger our autoplay chain.
          // ─────────────────────────────────────────────────────────────────

          if (
            !transitionPendingRef.current &&
            wasPlayingRef.current &&
            !s.isPlaying &&
            s.progressMs < 1000
          ) {
            if (!handlingEndedRef.current) {
              console.log(
                '[spotify] natural end detected'
              )

              handlingEndedRef.current = true

              ipc
                .invoke('playback:pause')
                .catch(() => { })

              onEndedRef.current?.()
            }
          }

          // ─────────────────────────────────────────────────────────────────
          // spotify auto-advance detection
          // ─────────────────────────────────────────────────────────────────

          const sincePlay =
            Date.now() -
            lastPlayCallRef.current

          const settled =
            sincePlay > 5000

          // FIX: Read progressMs from the 's' status object or use a functional 
          // state update if needed, but since we are polling, s.progressMs 
          // or calculating elapsed locally is much safer than relying on state.
          const currentProgress = s.progressMs > 0 ? s.progressMs : (Date.now() - playStartRef.current - totalPausedRef.current)
          const enoughProgress = currentProgress > 5000

          const titleMismatch =
            s.title &&
            expectedTitleRef.current &&
            !titlesMatch(
              s.title,
              expectedTitleRef.current,
            )

          if (
            settled &&
            enoughProgress &&
            transitionStableRef.current &&
            !transitionPendingRef.current &&
            !handlingEndedRef.current &&
            s.isPlaying &&
            titleMismatch
          ) {
            console.log(
              '[spotify] confirmed auto-advance:',
              {
                actual: s.title,
                expected:
                  expectedTitleRef.current,
              }
            )

            handlingEndedRef.current = true

            expectedTitleRef.current =
              s.title

            ipc
              .invoke('playback:pause')
              .catch(() => { })

            onEndedRef.current?.()
          }

          wasPlayingRef.current =
            s.isPlaying
        }

        // ── simulated end detection ───────────────────────────────────────────
        // Also suppressed during transitions — simDuration is set after IPC
        // returns, so this can't fire prematurely, but guard it anyway.

        if (
          !transitionPendingRef.current &&
          !hasRealData &&
          simDurationRef.current > 0 &&
          !handlingEndedRef.current
        ) {
          const elapsed =
            Date.now() -
            playStartRef.current -
            totalPausedRef.current

          if (
            elapsed >=
            simDurationRef.current + 2000
          ) {
            console.log(
              '[spotify] simulated track end detected'
            )

            handlingEndedRef.current = true

            ipc
              .invoke('playback:pause')
              .catch(() => { })

            onEndedRef.current?.()
          }
        }
      } catch {
        // Spotify not open
      }
    }

    const id = setInterval(tick, 500)

    tick()

    return () => clearInterval(id)
  }, [])

  // ───────────────────────────────────────────────────────────────────────────
  // play
  // ───────────────────────────────────────────────────────────────────────────

  const play = useCallback(
    async (
      _queryOrId: string,
      title?: string,
      artist?: string,
    ) => {
      setError(null)

      const t = title ?? _queryOrId
      const a = artist ?? ''

      // 1. CRITICAL: Immediately tell our local flags playback has been interrupted
      // This stops the polling effect from tripping over itself mid-transition
      handlingEndedRef.current = false
      transitionPendingRef.current = true
      transitionStableRef.current = false

      // 2. Optimistic UI Updates
      const placeholderId = `local:${a}:${t}`.replace(/\s+/g, '-')
      setCurrentVideoId(placeholderId)
      setCurrentTitle(t)
      setCurrentArtist(a)
      setCurrentThumb(null)
      setProgressMs(0)
      setDurationMs(0)

      setIsPlaying(true)
      isPlayingRef.current = true
      wasPlayingRef.current = true

      expectedTitleRef.current = t
      expectedArtistRef.current = a
      lastPlayCallRef.current = Date.now()

      playStartRef.current = Date.now()
      pausedAtRef.current = null
      totalPausedRef.current = 0
      simDurationRef.current = 0

      try {
        // 3. Send the command to Electron
        const result = await ipc.invoke('playback:play', { title: t, artist: a })

        if (result?.durationMs) {
          setDurationMs(result.durationMs)
          simDurationRef.current = result.durationMs
          playStartRef.current = Date.now()
        }
      } catch (e: any) {
        const msg = e?.message ?? 'Playback failed'
        console.error('[spotify] play error:', msg)
        setError(msg)
        setIsPlaying(false)
        isPlayingRef.current = false
        wasPlayingRef.current = false
        transitionPendingRef.current = false
        transitionStableRef.current = false
      }
    },
    [],
  )

  // ───────────────────────────────────────────────────────────────────────────
  // pause
  // ───────────────────────────────────────────────────────────────────────────

  const pause = useCallback(async () => {
    if (!pausedAtRef.current) {
      pausedAtRef.current = Date.now()
    }

    setIsPlaying(false)

    isPlayingRef.current = false
    wasPlayingRef.current = false

    await ipc.invoke('playback:pause')
  }, [])

  // ───────────────────────────────────────────────────────────────────────────
  // resume
  // ───────────────────────────────────────────────────────────────────────────

  const resume = useCallback(async () => {
    if (pausedAtRef.current) {
      totalPausedRef.current +=
        Date.now() -
        pausedAtRef.current

      pausedAtRef.current = null
    }

    setIsPlaying(true)

    isPlayingRef.current = true
    wasPlayingRef.current = true

    await ipc.invoke('playback:resume')
  }, [])

  // ───────────────────────────────────────────────────────────────────────────
  // stop
  // ───────────────────────────────────────────────────────────────────────────

  const stop = useCallback(async () => {
    await ipc.invoke('playback:stop')

    setIsPlaying(false)

    setCurrentVideoId(null)
    setCurrentTitle(null)
    setCurrentArtist(null)
    setCurrentThumb(null)

    setDurationMs(0)
    setProgressMs(0)

    isPlayingRef.current = false
    wasPlayingRef.current = false

    playStartRef.current = 0

    pausedAtRef.current = null
    totalPausedRef.current = 0

    simDurationRef.current = 0

    transitionPendingRef.current = false
    transitionStableRef.current = false
  }, [])

  // ───────────────────────────────────────────────────────────────────────────
  // seek
  // ───────────────────────────────────────────────────────────────────────────

  const seek = useCallback(async (ms: number) => {
    playStartRef.current =
      Date.now() - ms

    totalPausedRef.current = 0

    if (pausedAtRef.current) {
      pausedAtRef.current = Date.now()
    }

    setProgressMs(ms)

    await ipc.invoke('playback:seek', ms)
  }, [])

  // ───────────────────────────────────────────────────────────────────────────
  // volume
  // ───────────────────────────────────────────────────────────────────────────

  const setVolume = useCallback(
    async (pct: number) => {
      await ipc.invoke(
        'playback:volume',
        pct,
      )
    },
    [],
  )

  // ───────────────────────────────────────────────────────────────────────────
  // sources (swappable playback adapters: spotify, later local/apple/tidal)
  // ───────────────────────────────────────────────────────────────────────────

  const [sources, setSources] = useState<
    { id: string; label: string; available: boolean }[]
  >([])
  const [activeSource, setActiveSource] = useState<string | null>(null)

  useEffect(() => {
    ipc.invoke('playback:sources').then(setSources).catch(() => { })
    ipc.invoke('playback:active').then(setActiveSource).catch(() => { })
  }, [])

  const setSource = useCallback(async (id: string) => {
    const ok = await ipc.invoke('playback:set-source', id)
    if (ok) setActiveSource(id)
    return ok
  }, [])

  // ───────────────────────────────────────────────────────────────────────────
  // api
  // ───────────────────────────────────────────────────────────────────────────

  return {
    play,
    pause,
    resume,
    stop,
    seek,
    setVolume,

    sources,
    activeSource,
    setSource,

    ready,
    isPlaying,

    currentVideoId,
    currentTitle,
    currentArtist,
    currentThumb,

    durationMs,
    progressMs,

    error,
  }
}