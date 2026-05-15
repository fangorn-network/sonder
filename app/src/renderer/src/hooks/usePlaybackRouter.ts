import { useCallback, useRef, useState } from 'react'
import { useSpotifyContext } from '../providers/SpotifyProvider'
import type { PlaybackState, SourceId } from '../types/playback'
import type { Track } from '../types'
import { useYouTubeContext } from '../providers/YoutubeProvider'

export type SourcePreference = 'auto' | SourceId

function resolveSources(track: Track): Array<{ id: SourceId; address: string }> {
  const sources: Array<{ id: SourceId; address: string }> = []
  if (track.spotifyTrackId) sources.push({ id: 'spotify', address: `spotify:track:${track.spotifyTrackId}` })
  if (track.youtubeVideoId)  sources.push({ id: 'youtube', address: track.youtubeVideoId })
  return sources
}

export function usePlaybackRouter(preference: SourcePreference = 'auto') {
  const spotify = useSpotifyContext()
  const youtube = useYouTubeContext()

  const [state, setState] = useState<PlaybackState>({
    activeSource: null,
    playing:      false,
    trackId:      null,
  })

  const activeSourceRef = useRef<SourceId | null>(null)

  const isAvailable = useCallback((id: SourceId): boolean => {
    if (id === 'spotify') return spotify.connected
    if (id === 'youtube') return youtube.ready
    return false
  }, [spotify.connected, youtube.ready])

  const playVia = useCallback((id: SourceId, address: string, track: Track) => {
    if (activeSourceRef.current === 'spotify') spotify.pause?.()
    if (activeSourceRef.current === 'youtube') youtube.pause()

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

    // ── No source addresses — fuzzy Spotify search, YT videoId fallback ─────
    // Track has neither spotifyTrackId nor youtubeVideoId (e.g. MB result).
    // Try Spotify search first. If that fails and YT is ready but we still
    // have no videoId, we can't do much — the caller should have resolved
    // a youtubeVideoId via search before calling play().
    const query = `${track.title} ${track.artist}`.replace(/\(.*?\)/g, '').trim()

    if (spotify.connected) {
      try {
        await spotify.searchAndPlay(query)
        activeSourceRef.current = 'spotify'
        setState({ activeSource: 'spotify', playing: true, trackId: track.id })
        return
      } catch (err) {
        console.warn('[router] Spotify searchAndPlay failed:', err)
        // fall through — no YT videoId available without a prior search
      }
    }

    // No Spotify, no addresses — prompt connect
    await spotify.connect()
  }, [preference, isAvailable, playVia, spotify, youtube])

  const pause = useCallback(() => {
    if (activeSourceRef.current === 'spotify') spotify.pause?.()
    if (activeSourceRef.current === 'youtube') youtube.pause()
    setState(s => ({ ...s, playing: false }))
  }, [spotify, youtube])

  const stop = useCallback(() => {
    if (activeSourceRef.current === 'spotify') spotify.pause?.()
    if (activeSourceRef.current === 'youtube') youtube.stop()
    activeSourceRef.current = null
    setState({ activeSource: null, playing: false, trackId: null })
  }, [spotify, youtube])

  return { play, pause, stop, state }
}