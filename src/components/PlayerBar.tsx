import { useRef, useState, useEffect, useCallback } from 'react'
import { usePrivy } from '@privy-io/react-auth'
import type { Track, PlayState, HueStyle } from '../types'
import { useFangornMiddleware } from '../hooks/useX402fFetch'
import './PlayerBar.css';
import { useFirebase } from '../hooks/useFirebase'

interface PlayerBarProps {
  track: Track | null
  tracks: Track[]
  onTrackChange: (track: Track) => void
}

export function PlayerBar({ track, tracks, onTrackChange }: PlayerBarProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const blobUrlRef = useRef<string | null>(null)
  const progressRef = useRef<HTMLDivElement | null>(null)

  const [state, setState] = useState<PlayState>('idle')
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState(0)   // 0–1
  const [duration, setDuration] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [dragging, setDragging] = useState(false)

  const { authenticated, user, login } = usePrivy()
    const { ids: libraryIds, getNullifier } = useFirebase(user?.id ?? null)
  const middleware = useFangornMiddleware()

  // ── library queue (owned tracks in catalog order) ──────────────────────
  const queue = tracks.filter(t => libraryIds.includes(t.id))
  const queueIdx = track ? queue.findIndex(t => t.id === track.id) : -1
  const hasPrev = queueIdx > 0
  const hasNext = queueIdx !== -1 && queueIdx < queue.length - 1

  // ── reset on track change ────d──────────────────────────────────────────
  useEffect(() => {
    setState('idle')
    setError(null)
    setProgress(0)
    setCurrentTime(0)
    setDuration(0)
    if (audioRef.current) { audioRef.current.pause(); audioRef.current.src = '' }
    if (blobUrlRef.current) { URL.revokeObjectURL(blobUrlRef.current); blobUrlRef.current = null }
  }, [track?.id])

  useEffect(() => () => {
    if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current)
  }, [])

  // ── audio event wiring ─────────────────────────────────────────────────
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    const onTimeUpdate = () => {
      if (dragging) return
      setCurrentTime(audio.currentTime)
      setProgress(audio.duration ? audio.currentTime / audio.duration : 0)
    }
    const onDurationChange = () => setDuration(audio.duration || 0)
    const onEnded = () => {
      setState('idle')
      setProgress(0)
      setCurrentTime(0)
      if (hasNext) onTrackChange(queue[queueIdx + 1])
    }

    // TODO: the error listener keeps setting setState('error') when I configure it below
    // will address later, ignoring for now ;)
    // const onError = () => { setState('error'); setError('Playback failed') }
    const onError = () => {
      if (!audioRef.current?.src || audioRef.current.src === window.location.href) return
      if (!audioRef.current?.error) return
      setState('error')
      setError('Playback failed')
    }

    audio.addEventListener('timeupdate', onTimeUpdate)
    audio.addEventListener('durationchange', onDurationChange)
    audio.addEventListener('ended', onEnded)
    audio.addEventListener('error', onError)
    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate)
      audio.removeEventListener('durationchange', onDurationChange)
      audio.removeEventListener('ended', onEnded)
      audio.removeEventListener('error', onError)
    }
  }, [dragging, hasNext, queueIdx, queue, onTrackChange])

  // ── fetch + play ───────────────────────────────────────────────────────
  const doFetch = useCallback(async () => {
    if (!middleware || !track) return

    console.log('ok ' + (!middleware === false) + !track)
    setState('loading')
    setError(null)

    try {
      // try to fetch the nullifier hash from storage
      const nullifier = getNullifier(track.id)

      const result = await middleware.fetchResource({
        owner: track.owner as `0x${string}`,
        schemaName: track.datasourceName,
        name: track.name,
        baseUrl: '/facilitator',
        ...(nullifier ? { nullifierHash: nullifier } : {}),
      })
      if (!result.success) {
        console.log('wtf')
        setState('error')
        setError((result as any).error ?? 'Fetch failed')
        return
      }
      if (!result.data) { setState('error'); setError('No audio data'); return }

      const bytes = result.data instanceof Uint8Array
        ? result.data
        : new Uint8Array(result.data as ArrayBuffer)

      const blob = new Blob([bytes.buffer.slice(0) as ArrayBuffer], { type: 'audio/mpeg' })
      if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current)
      blobUrlRef.current = URL.createObjectURL(blob)

      if (audioRef.current) {
        audioRef.current.src = blobUrlRef.current
        await audioRef.current.play()
      }
      setState('playing')
    } catch (e: any) {
      setState('error')
      setError(e?.message ?? 'Playback failed')
    }
  }, [middleware, track])

  // ── play / pause toggle ────────────────────────────────────────────────
  const handlePlayPause = useCallback(() => {
    if (!authenticated) { login(); return }
    if (!track) return

    if (state === 'playing') {
      audioRef.current?.pause()
      setState('idle')
      return
    }

    if (state === 'idle' && blobUrlRef.current && audioRef.current) {
      // already fetched, just resume
      audioRef.current.play()
      setState('playing')
      return
    }

    doFetch()
  }, [authenticated, login, track, state, doFetch])

  // ── prev / next ────────────────────────────────────────────────────────
  const handlePrev = useCallback(() => {
    if (hasPrev) onTrackChange(queue[queueIdx - 1])
  }, [hasPrev, queue, queueIdx, onTrackChange])

  const handleNext = useCallback(() => {
    if (hasNext) onTrackChange(queue[queueIdx + 1])
  }, [hasNext, queue, queueIdx, onTrackChange])

  // ── progress scrubbing ─────────────────────────────────────────────────
  function scrubTo(e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    if (audioRef.current && duration) {
      audioRef.current.currentTime = ratio * duration
      setProgress(ratio)
    }
  }

  function fmtTime(s: number) {
    if (!s || !isFinite(s)) return '0:00'
    const m = Math.floor(s / 60)
    const sec = Math.floor(s % 60)
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  if (!track) return null

  const hue = (parseInt(track.owner.slice(2, 8), 16) * 67 + 180) % 360
  const isPlaying = state === 'playing'
  const isLoading = state === 'loading'

  return (
    <div className="player-bar">
      <audio ref={audioRef} />

      {/* ── track info ── */}
      <div className="player-track">
        <div className="player-art" style={{ '--hue': hue } as HueStyle}>
          <span className="player-art-initials">
            {track.title.slice(0, 1).toUpperCase()}
          </span>
        </div>
        <div className="player-track-info">
          <div className="player-title">{track.title}</div>
          <div className="player-artist">{track.artist}</div>
        </div>
      </div>

      {/* ── controls + progress ── */}
      <div className="player-center">
        <div className="player-controls">
          <button
            className="player-btn player-btn--skip"
            onClick={handlePrev}
            disabled={!hasPrev}
            title="Previous"
          >
            ⏮
          </button>

          <button
            className={`player-btn player-btn--play ${isPlaying ? 'player-btn--playing' : ''}`}
            onClick={handlePlayPause}
            disabled={isLoading}
            title={isPlaying ? 'Pause' : 'Play'}
          >
            {isLoading
              ? <span className="upload-spinner" />
              : isPlaying ? '▐▐' : '▶'
            }
          </button>

          <button
            className="player-btn player-btn--skip"
            onClick={handleNext}
            disabled={!hasNext}
            title="Next"
          >
            ⏭
          </button>
        </div>

        {/* progress bar */}
        <div className="player-progress-row">
          <span className="player-time">{fmtTime(currentTime)}</span>
          <div
            className="player-progress"
            ref={progressRef}
            onClick={scrubTo}
          >
            <div className="player-progress-track">
              <div
                className="player-progress-fill"
                style={{ width: `${progress * 100}%` }}
              />
              <div
                className="player-progress-thumb"
                style={{ left: `${progress * 100}%` }}
              />
            </div>
          </div>
          <span className="player-time">{fmtTime(duration)}</span>
        </div>

        {error && <div className="player-error">{error}</div>}
      </div>

      {/* ── meta ── */}
      <div className="player-meta">
        {/* {!isFree && (
          <span className="player-price">
            ${(parseFloat(track.price) / 1_000_000).toFixed(2)}
          </span>
        )} */}
        {track.genre && <span className="player-genre">{track.genre}</span>}
        {queueIdx !== -1 && queue.length > 0 && (
          <span className="player-queue-pos">
            {queueIdx + 1} / {queue.length}
          </span>
        )}
      </div>
    </div>
  )
}