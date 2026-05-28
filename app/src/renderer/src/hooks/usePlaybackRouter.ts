import { useCallback, useRef, useState } from 'react'
import { useSpotify }                    from './useSpotifyContext'
import type { PlaybackState }            from '../types/playback'
import type { Track }                    from '../types'

export interface PlaybackRouterOptions {
  onSkip?: (trackId: string) => void
}

export function usePlaybackRouter(
  spotify: ReturnType<typeof useSpotify>,
  { onSkip }: PlaybackRouterOptions = {},
) {
  const [state, setState] = useState<PlaybackState>({
    activeSource: null,
    playing:      false,
    trackId:      null,
  })

  const stateRef    = useRef(state)
  stateRef.current  = state
  const onSkipRef   = useRef(onSkip)
  onSkipRef.current = onSkip

  const play = useCallback(async (track: Track) => {
    const prev = stateRef.current
    if (prev.trackId && prev.trackId !== track.id) {
      onSkipRef.current?.(prev.trackId)
    }

    const source = track.youtubeVideoId
      ?? `${track.title} ${track.artist}`.replace(/\(.*?\)/g, '').trim()

    console.log('[router] play', { id: track.id, title: track.title, source })

    try {
      await spotify.play(source, track.title, track.artist)
      setState({ activeSource: 'spotify', playing: true, trackId: track.id })
    } catch (e) {
      console.error('[router] play failed:', e)
    }
  }, [spotify])

  const pause  = useCallback(() => { spotify.pause();  setState(s => ({ ...s, playing: false })) }, [spotify])
  const resume = useCallback(() => { spotify.resume(); setState(s => ({ ...s, playing: true  })) }, [spotify])
  const stop   = useCallback(() => { spotify.stop();   setState({ activeSource: null, playing: false, trackId: null }) }, [spotify])

  return { play, pause, stop, resume, state }
}