import { useCallback, useRef, useState } from 'react'
import { useSpotifyContext } from '../providers/SpotifyProvider'
import { useYouTubeContext } from '../providers/YoutubeProvider'
import type { PlaybackState, SourceId } from '../types/playback'
import type { Track } from '../types'

export type SourcePreference = 'auto' | SourceId

export interface PlaybackRouterOptions {
  onSkip?: (trackId: string) => void
}

function resolveSources(track: Track): Array<{ id: SourceId; address: string }> {
  const sources: Array<{ id: SourceId; address: string }> = []
  if (track.spotifyTrackId) sources.push({ id: 'spotify', address: `spotify:track:${track.spotifyTrackId}` })
  if (track.youtubeVideoId) sources.push({ id: 'youtube', address: track.youtubeVideoId })
  return sources
}

// Stop whichever source is currently active
function stopCurrent(
  active: SourceId | null,
  spotify: { pause?: () => void },
  youtube: { pause: () => void }
) {
  if (active === 'spotify') spotify.pause?.()
  if (active === 'youtube') youtube.pause()
}

export function usePlaybackRouter(
  preference: SourcePreference = 'auto',
  { onSkip }: PlaybackRouterOptions = {}
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

  const isAvailable = useCallback((id: SourceId): boolean => {
    if (id === 'spotify') return spotify.connected
    if (id === 'youtube') return youtube.ready
    return false
  }, [spotify.connected, youtube.ready])

  const playVia = useCallback((id: SourceId, address: string, track: Track) => {
    const prev = stateRef.current

    // fire skip for outgoing track when switching to a different track
    if (activeSourceRef.current !== null && prev.trackId && prev.trackId !== track.id) {
      onSkipRef.current?.(prev.trackId)
    }

    // always stop current source — no ID check, no exceptions
    stopCurrent(activeSourceRef.current, spotify, youtube)

    if (id === 'spotify') {
      spotify.play(address)
    } else if (id === 'youtube') {
      youtube.play(address, track.title, track.artist)
    }

    activeSourceRef.current = id
    setState({ activeSource: id, playing: true, trackId: track.id })
  }, [spotify, youtube])

  const play = useCallback(async (track: Track) => {
    const sources = resolveSources(track)

    // ── Has explicit source addresses ────────────────────────────────────────
    if (sources.length > 0) {
      if (preference !== 'auto') {
        const preferred = sources.find(s => s.id === preference)
        if (preferred && isAvailable(preferred.id)) {
          playVia(preferred.id, preferred.address, track)
          return
        }
      }
      for (const source of sources) {
        if (isAvailable(source.id)) {
          playVia(source.id, source.address, track)
          return
        }
      }
      await spotify.connect()
      return
    }

    // ── No explicit addresses — fuzzy Spotify search ─────────────────────────
    // Always stop whatever is currently playing first — no ID check.
    // This handles "try spotify" on a YT track (same track.id, different source).
    const prev = stateRef.current
    stopCurrent(activeSourceRef.current, spotify, youtube)

    // fire skip if it was a different track
    if (prev.trackId && prev.trackId !== track.id) {
      onSkipRef.current?.(prev.trackId)
    }

    if (spotify.connected) {
      const query = `${track.title} ${track.artist}`.replace(/\(.*?\)/g, '').trim()
      try {
        await spotify.searchAndPlay(query)
        activeSourceRef.current = 'spotify'
        setState({ activeSource: 'spotify', playing: true, trackId: track.id })
      } catch (err) {
        console.warn('[router] Spotify searchAndPlay failed:', err)
      }
      return
    }

    await spotify.connect()
  }, [preference, isAvailable, playVia, spotify, youtube])

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

  return { play, pause, stop, state }
}