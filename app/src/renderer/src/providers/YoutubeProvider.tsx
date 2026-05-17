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

  // ── Hidden 1×1 anchor — audio only, never visible ─────────────────────────
  useEffect(() => {
    const el = document.createElement('div')
    el.id = 'yt-player-anchor'
    Object.assign(el.style, {
      position: 'fixed',
      width:    '1px',
      height:   '1px',
      opacity:  '0',
      pointerEvents: 'none',
      left:     '0',
      top:      '0',
      zIndex:   '-1',
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
        width:  1,
        height: 1,
        playerVars: {
          autoplay:       0,
          controls:       0,
          disablekb:      1,
          fs:             0,
          iv_load_policy: 3,
          modestbranding: 1,
          rel:            0,
          playsinline:    1,
          origin:         'http://127.0.0.1:5173',
        },
        events: {
          onReady: () => {
            readyRef.current = true
            setReady(true)
            console.log('[YT] ready')
            if (pendingRef.current) {
              const { videoId, title, artist } = pendingRef.current
              pendingRef.current = null
              _cueAndPlay(videoId)
              setCurrentVideoId(videoId)
              setCurrentTitle(title   ?? null)
              setCurrentArtist(artist ?? null)
            }
          },
          onStateChange: (e: any) => {
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

  const _cueAndPlay = (videoId: string) => {
    playerRef.current?.cueVideoById(videoId)
    setTimeout(() => playerRef.current?.playVideo(), 200)
  }

  const play = useCallback((videoId: string, title?: string, artist?: string) => {
    setCurrentVideoId(videoId)
    setCurrentTitle(title   ?? null)
    setCurrentArtist(artist ?? null)

    if (!readyRef.current || !playerRef.current) {
      pendingRef.current = { videoId, title, artist }
      return
    }
    _cueAndPlay(videoId)
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