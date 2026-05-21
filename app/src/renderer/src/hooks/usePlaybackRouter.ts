import { useCallback, useRef, useState } from 'react'
import { useYouTubeContext } from './useYoutubeContext'
import type { PlaybackState } from '../types/playback'
import type { Track } from '../types'

export interface PlaybackRouterOptions {
  onSkip?: (trackId: string) => void
}

export function usePlaybackRouter({ onSkip }: PlaybackRouterOptions = {}) {
  const youtube = useYouTubeContext()

  const [state, setState] = useState<PlaybackState>({
    activeSource: null,
    playing:      false,
    trackId:      null,
  })

  const stateRef   = useRef(state)
  stateRef.current = state

  const onSkipRef   = useRef(onSkip)
  onSkipRef.current = onSkip

  const play = useCallback(async (track: Track) => {
    const prev = stateRef.current

    if (prev.trackId && prev.trackId !== track.id) {
      onSkipRef.current?.(prev.trackId)
    }

    // youtubeVideoId = bare YT video ID, SoundCloud URL, or any yt-dlp resolvable source
    // Falls back to "title artist" fuzzy search if not set
    const source = track.youtubeVideoId
      ?? `${track.title} ${track.artist}`.replace(/\(.*?\)/g, '').trim()

    console.log('[router] play', { id: track.id, title: track.title, source })

    try {
      await youtube.play(source, track.title, track.artist)
      setState({ activeSource: 'youtube', playing: true, trackId: track.id })
    } catch (e) {
      console.error('[router] play failed:', e)
    }
  }, [youtube])

  const pause = useCallback(() => {
    youtube.pause()
    setState(s => ({ ...s, playing: false }))
  }, [youtube])

  const resume = useCallback(() => {
    youtube.resume()
    setState(s => ({ ...s, playing: true }))
  }, [youtube])

  const stop = useCallback(() => {
    youtube.stop()
    setState({ activeSource: null, playing: false, trackId: null })
  }, [youtube])

  return { play, pause, stop, resume, state }
}