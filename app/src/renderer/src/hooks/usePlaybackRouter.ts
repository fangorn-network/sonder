import { useCallback, useRef, useState } from 'react'
import { useSpotifyContext } from '../providers/SpotifyProvider'
import { useYouTubeContext } from './useYoutubeContext'
import type { PlaybackState, SourceId } from '../types/playback'
import type { Track } from '../types'

export type SourcePreference = 'auto' | SourceId

export interface PlaybackRouterOptions {
  onSkip?: (trackId: string) => void
}

// ─── Source resolution ────────────────────────────────────────────────────────
// Builds an ordered list of source candidates from a track's known addresses.
// The router tries each in order, skipping unavailable ones.

function resolveSources(track: Track): Array<{ id: SourceId; address: string }> {
  const sources: Array<{ id: SourceId; address: string }> = []
  if (track.spotifyTrackId) sources.push({ id: 'spotify', address: `spotify:track:${track.spotifyTrackId}` })
  if (track.youtubeVideoId) sources.push({ id: 'youtube', address: track.youtubeVideoId })
  return sources
}

// ─── Stop helpers ─────────────────────────────────────────────────────────────

function stopCurrent(
  active: SourceId | null,
  spotify: { pause?: () => void },
  youtube: { pause: () => void },
) {
  if (active === 'spotify') spotify.pause?.()
  if (active === 'youtube') youtube.pause()
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function usePlaybackRouter(
  preference: SourcePreference = 'auto',
  { onSkip }: PlaybackRouterOptions = {},
) {
  const spotify = useSpotifyContext()
  const youtube = useYouTubeContext()

  const [state, setState] = useState<PlaybackState>({
    activeSource: null,
    playing:      false,
    trackId:      null,
  })

  const activeSourceRef = useRef<SourceId | null>(null)
  const stateRef        = useRef(state)
  stateRef.current      = state

  const onSkipRef = useRef(onSkip)
  onSkipRef.current = onSkip

  // ── Availability ─────────────────────────────────────────────────────────────
  // YouTube is always available — yt-dlp needs no auth, no connection step.
  // Spotify requires the user to be connected.

  const isAvailable = useCallback((id: SourceId): boolean => {
    if (id === 'spotify') return spotify.connected
    if (id === 'youtube') return youtube.ready  // true as soon as the audio element mounts
    return false
  }, [spotify.connected, youtube.ready])

  // ── playVia — low-level: dispatch to a specific source ───────────────────────

  const playVia = useCallback((id: SourceId, address: string, track: Track) => {
    const prev = stateRef.current

    // Fire skip for the outgoing track when switching to a different one
    if (activeSourceRef.current !== null && prev.trackId && prev.trackId !== track.id) {
      onSkipRef.current?.(prev.trackId)
    }

    // Always stop current source before starting the next
    stopCurrent(activeSourceRef.current, spotify, youtube)

    if (id === 'spotify') {
      spotify.play(address)
    } else if (id === 'youtube') {
      // address is a bare video ID — yt-dlp accepts both IDs and search queries
      youtube.play(address, track.title, track.artist)
    }

    activeSourceRef.current = id
    setState({ activeSource: id, playing: true, trackId: track.id })
  }, [spotify, youtube])

  // ── play — high-level: resolve sources, apply preference, fall back ──────────

  const play = useCallback(async (track: Track) => {
    const sources = resolveSources(track)

    // ── Explicit source addresses on the track ────────────────────────────────
    if (sources.length > 0) {
      // Honour a non-auto preference first
      if (preference !== 'auto') {
        const preferred = sources.find(s => s.id === preference)
        if (preferred && isAvailable(preferred.id)) {
          playVia(preferred.id, preferred.address, track)
          return
        }
      }

      // Try each source in order
      for (const source of sources) {
        if (isAvailable(source.id)) {
          playVia(source.id, source.address, track)
          return
        }
      }

      // Nothing available — prompt Spotify connect as last resort
      await spotify.connect()
      return
    }

    // ── No explicit addresses — fuzzy search fallback ─────────────────────────
    // Stop whatever is currently playing. Fire skip only for a different track.
    const prev = stateRef.current
    stopCurrent(activeSourceRef.current, spotify, youtube)
    if (prev.trackId && prev.trackId !== track.id) {
      onSkipRef.current?.(prev.trackId)
    }

    const query = `${track.title} ${track.artist}`.replace(/\(.*?\)/g, '').trim()

    // 1. Try Spotify if connected
    if (preference !== 'youtube' && spotify.connected) {
      try {
        await spotify.searchAndPlay(query)
        activeSourceRef.current = 'spotify'
        setState({ activeSource: 'spotify', playing: true, trackId: track.id })
        return
      } catch (err) {
        console.warn('[router] Spotify fuzzy search failed, falling back to YouTube:', err)
      }
    }

    // 2. Fall back to YouTube via yt-dlp (always available, no auth required)
    if (preference !== 'spotify' && youtube.ready) {
      try {
        // Pass the search string directly — yt-dlp resolves it
        youtube.play(query, track.title, track.artist)
        activeSourceRef.current = 'youtube'
        setState({ activeSource: 'youtube', playing: true, trackId: track.id })
        return
      } catch (err) {
        console.warn('[router] YouTube fuzzy search failed:', err)
      }
    }

    // 3. Nothing worked — prompt Spotify connect
    await spotify.connect()
  }, [preference, isAvailable, playVia, spotify, youtube])

  // ── pause / stop ──────────────────────────────────────────────────────────────

  const pause = useCallback(() => {
    stopCurrent(activeSourceRef.current, spotify, youtube)
    setState(s => ({ ...s, playing: false }))
  }, [spotify, youtube])

  const stop = useCallback(() => {
    stopCurrent(activeSourceRef.current, spotify, youtube)
    if (activeSourceRef.current === 'youtube') youtube.stop()
    activeSourceRef.current = null
    setState({ activeSource: null, playing: false, trackId: null })
  }, [spotify, youtube])

  // ── resume — restart the active source without re-resolving ──────────────────

  const resume = useCallback(() => {
    if (activeSourceRef.current === 'youtube') youtube.resume()
    // Spotify resume is handled via play() with the same URI — no separate call needed
    setState(s => ({ ...s, playing: true }))
  }, [youtube])

  return { play, pause, stop, resume, state }
}