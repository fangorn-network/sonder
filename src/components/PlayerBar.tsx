import { useRef, useState, useEffect, useCallback } from 'react'
import { usePrivy } from '@privy-io/react-auth'
import type { Track, PlayState, HueStyle } from '../types'
import { useFangornMiddleware } from '../hooks/useX402fFetch'
import './PlayerBar.css'

interface PlayerBarProps {
  track: Track | null
}

export function PlayerBar({ track }: PlayerBarProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const blobUrlRef = useRef<string | null>(null)
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const fillRef = useRef<HTMLSpanElement | null>(null)

  const [state, setState] = useState<PlayState>('idle')
  const [error, setError] = useState<string | null>(null)
  const [holding, setHolding] = useState(false)

  const { authenticated, login } = usePrivy()
  const middleware = useFangornMiddleware()

  /* reset on track change */
  useEffect(() => {
    setState('idle')
    setError(null)
    setHolding(false)
    clearHold()
    if (audioRef.current) { audioRef.current.pause(); audioRef.current.src = '' }
    if (blobUrlRef.current) { URL.revokeObjectURL(blobUrlRef.current); blobUrlRef.current = null }
  }, [track?.id])

  useEffect(() => () => {
    if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current)
    clearHold()
  }, [])

  const clearHold = () => {
    if (holdTimer.current) { clearTimeout(holdTimer.current); holdTimer.current = null }
  }

  const doFetch = useCallback(async () => {
    if (!middleware || !track) return
    setState('loading')
    setError(null)
    try {
      const result = await middleware.fetchResource({
        owner: track.owner as `0x${string}`,
        schemaName: track.datasourceName,
        name: track.name,
        baseUrl: '/facilitator',
        ...(track.owned ? { skipPayment: true } : {}),
      })
      if (!result.success) {
        setState('error')
        setError((result as any).error ?? 'Payment failed')
        return
      }
      if (!result.data) { setState('error'); setError('No audio data returned'); return }

      const bytes = result.data instanceof Uint8Array
        ? result.data
        : new Uint8Array(result.data as ArrayBuffer)

      const blob = new Blob([bytes.buffer.slice(0) as ArrayBuffer], { type: 'audio/mpeg' })
      if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current)
      blobUrlRef.current = URL.createObjectURL(blob)

      if (audioRef.current) { audioRef.current.src = blobUrlRef.current; await audioRef.current.play() }
      setState('playing')
    } catch (e: any) {
      setState('error')
      setError(e?.message ?? 'Playback failed')
    }
  }, [middleware, track])

  /* press start */
  const handlePressStart = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault()
    if (!authenticated) { login(); return }
    if (!track) return

    /* already playing: toggle pause */
    if (state === 'playing') {
      audioRef.current?.pause()
      setState('idle')
      return
    }

    /* free or owned: play immediately */
    if (track.owned || !track.price || track.price === '0') {
      doFetch()
      return
    }

    /* paid: start hold */
    setHolding(true)
    holdTimer.current = setTimeout(() => {
      setHolding(false)
      doFetch()
    }, 1000)
  }, [authenticated, login, track, state, doFetch])

  /* press cancel */
  const handlePressEnd = useCallback(() => {
    if (!holding) return
    setHolding(false)
    clearHold()
    /* restart fill animation by forcing reflow */
    if (fillRef.current) {
      fillRef.current.classList.remove('hold-fill--animating')
      void fillRef.current.offsetWidth
    }
  }, [holding])

  useEffect(() => {
    window.addEventListener('mouseup', handlePressEnd)
    window.addEventListener('touchend', handlePressEnd)
    return () => {
      window.removeEventListener('mouseup', handlePressEnd)
      window.removeEventListener('touchend', handlePressEnd)
    }
  }, [handlePressEnd])

  if (!track) return null

  const hue = (parseInt(track.owner.slice(2, 8), 16) * 67 + 180) % 360
  const isFree = !track.price || track.price === '0'
  const isPaid = !track.owned && !isFree
  const isPlay = state === 'playing'
  const isLoad = state === 'loading'

  let btnLabel: string
  if (isLoad) btnLabel = '…'
  else if (isPlay) btnLabel = '▐▐'
  else if (holding) btnLabel = 'Hold…'
  else if (track.owned) btnLabel = '▶ Play'
  else if (isFree) btnLabel = '▶ Free'
  else btnLabel = `▶ ${parseFloat(track.price)/1_000_000} ${track.currency}`

  return (
    <div className="player-bar">
      <audio
        ref={audioRef}
        onEnded={() => setState('idle')}
        onError={() => { setState('error') }}
      />

      <div className="player-track">
        <div className="player-art" style={{ '--hue': hue } as HueStyle}>
          {/* {track.art
            ? <img src={track.art} alt="" className="player-art-img" />
            : <span className="player-art-initials">{track.title.slice(0, 1).toUpperCase()}</span>
          } */}
        </div>
        <div className="player-track-info">
          <div className="player-title">{track.title}</div>
          <div className="player-artist">{track.artist}</div>
        </div>
      </div>

      <div className="player-controls">
        <button
          className={[
            'btn-play-large',
            isPlay ? 'btn-play-large--playing' : '',
            isLoad ? 'btn-play-large--loading' : '',
            isPaid && holding ? 'btn-play-large--holding' : '',
          ].filter(Boolean).join(' ')}
          onMouseDown={handlePressStart}
          onTouchStart={handlePressStart}
          disabled={isLoad}
        >
          {isPaid && (
            <span
              ref={fillRef}
              className={`hold-fill ${holding ? 'hold-fill--animating' : ''}`}
            />
          )}
          <span className="btn-label">{btnLabel}</span>
        </button>
        {error && <span className="player-error">{error}</span>}
      </div>

      <div className="player-meta">
        {track.genre && <span className="player-genre">{track.genre}</span>}
        {track.album && <span className="player-album">{track.album}</span>}
        {track.duration && <span className="player-duration">{track.duration}</span>}
      </div>
    </div>
  )
}