import {
  createContext, useCallback, useContext,
  useEffect, useRef, useState,
} from 'react'

export interface YouTubeContextValue {
  play: (videoId: string, title?: string, artist?: string) => void
  pause: () => void
  resume: () => void
  stop: () => void
  ready: boolean
  currentVideoId: string | null
  currentTitle: string | null
  currentArtist: string | null
}

const YouTubeContext = createContext<YouTubeContextValue | null>(null)

declare global {
  interface Window {
    YT: any
    onYouTubeIframeAPIReady: () => void
  }
}

const YT_CUED      = 5
const YT_UNSTARTED = -1

export function YouTubeProvider({ children }: { children: React.ReactNode }) {
  const playerRef  = useRef<any>(null)
  const anchorEl   = useRef<HTMLDivElement | null>(null)
  const readyRef   = useRef(false)
  const pendingRef = useRef<{ videoId: string; title?: string; artist?: string } | null>(null)

  const [ready,          setReady]          = useState(false)
  const [currentVideoId, setCurrentVideoId] = useState<string | null>(null)
  const [currentTitle,   setCurrentTitle]   = useState<string | null>(null)
  const [currentArtist,  setCurrentArtist]  = useState<string | null>(null)

  // ── Hidden container — opacity:0 keeps it in the rendering context so YT's
  //    ABR algorithm doesn't treat it as an off-screen / abandoned player.
  //    640×360 tricks YT into selecting a high-bitrate stream.
  useEffect(() => {
    const el = document.createElement('div')
    el.id = 'yt-player-anchor'
    Object.assign(el.style, {
      position:      'fixed',
      width:         '640px',
      height:        '360px',
      top:           '0',
      left:          '0',
      opacity:       '0',         // visually hidden, still in layout context
      pointerEvents: 'none',
      zIndex:        '-1',
    })
    document.body.appendChild(el)
    anchorEl.current = el
    return () => {
      if (document.body.contains(el)) document.body.removeChild(el)
      anchorEl.current = null
    }
  }, [])

  // ── Init IFrame API ────────────────────────────────────────────────────────
  useEffect(() => {
    const initPlayer = () => {
      const el = anchorEl.current
      if (!el || playerRef.current) return

      playerRef.current = new window.YT.Player(el, {
        width:  640,
        height: 360,
        playerVars: {
          autoplay:       0,
          controls:       0,
          disablekb:      1,
          fs:             0,
          iv_load_policy: 3,
          modestbranding: 1,
          rel:            0,
          playsinline:    1,
          // NOTE: vq is not a recognized IFrame API playerVar — removed
          origin: window.location.origin,
        },
        events: {
          onReady: () => {
            readyRef.current = true
            setReady(true)
            console.log('[YT] ready')

            if (pendingRef.current) {
              const { videoId, title, artist } = pendingRef.current
              pendingRef.current = null
              _loadAndPlay(videoId)
              setCurrentVideoId(videoId)
              setCurrentTitle(title   ?? null)
              setCurrentArtist(artist ?? null)
            }
          },
          onStateChange: (e: any) => {
            // Fallback: if the player ends up in CUED or UNSTARTED, force play.
            // With loadVideoById this rarely fires, but keep as a safety net.
            if (e.data === YT_CUED || e.data === YT_UNSTARTED) {
              playerRef.current?.playVideo()
            }
          },
          onError: (e: any) => console.error('[YT] error:', e.data),
        },
      })
    }

    if (document.getElementById('yt-iframe-api')) {
      if (window.YT?.Player) initPlayer()
      else {
        const prev = window.onYouTubeIframeAPIReady
        window.onYouTubeIframeAPIReady = () => { prev?.(); initPlayer() }
      }
      return
    }

    const script = document.createElement('script')
    script.id  = 'yt-iframe-api'
    script.src = 'https://www.youtube.com/iframe_api'
    document.head.appendChild(script)
    window.onYouTubeIframeAPIReady = initPlayer
  }, [])

  // loadVideoById combines cue + play in a single call — no setTimeout race,
  // no extra CUED state, YT selects quality immediately on load.
  const _loadAndPlay = (videoId: string) => {
    playerRef.current?.loadVideoById({ videoId })
  }

  const play = useCallback((videoId: string, title?: string, artist?: string) => {
    setCurrentVideoId(videoId)
    setCurrentTitle(title   ?? null)
    setCurrentArtist(artist ?? null)

    if (!readyRef.current || !playerRef.current) {
      pendingRef.current = { videoId, title, artist }
      return
    }
    _loadAndPlay(videoId)
  }, [])

  const pause  = useCallback(() => { playerRef.current?.pauseVideo?.() }, [])
  const resume = useCallback(() => { playerRef.current?.playVideo?.()  }, [])
  const stop   = useCallback(() => {
    playerRef.current?.stopVideo?.()
    setCurrentVideoId(null)
    setCurrentTitle(null)
    setCurrentArtist(null)
  }, [])

  return (
    <YouTubeContext.Provider value={{
      play, pause, resume, stop, ready,
      currentVideoId, currentTitle, currentArtist,
    }}>
      {children}
    </YouTubeContext.Provider>
  )
}

export function useYouTubeContext() {
  const ctx = useContext(YouTubeContext)
  if (!ctx) throw new Error('useYouTubeContext must be used inside YouTubeProvider')
  return ctx
}