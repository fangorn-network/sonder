import { useEffect, useRef, useState } from 'react'
import { useSpotifyContext } from '../providers/SpotifyProvider'
import type { TasteSignal } from '../types'
import './PlayerBar.css'

function fmtTime(ms: number) {
  if (!ms || !isFinite(ms)) return '0:00'
  const s = Math.floor(ms / 1000)
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${m}:${sec.toString().padStart(2, '0')}`
}

export function PlayerBar() {
  const {
    currentTrack,
    isPlaying,
    lastPollTime,
    connecting,
    error,
    togglePlay,
    seek,
    next,
    prev,
    onNext,
    onPrev,
    onSignal,
  } = useSpotifyContext()

  const [liveProgressMs, setLiveProgressMs] = useState(0)
  const rafRef = useRef<number | null>(null)
  const currentTrackRef = useRef(currentTrack)
  useEffect(() => { currentTrackRef.current = currentTrack }, [currentTrack])

  useEffect(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    if (!currentTrack) return
    const base = currentTrack.progressMs
    const pollTime = lastPollTime ?? Date.now()
    const tick = () => {
      const elapsed = isPlaying ? Date.now() - pollTime : 0
      const clamped = Math.min(base + elapsed, currentTrack.durationMs)
      setLiveProgressMs(clamped)
      if (isPlaying) rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [currentTrack?.progressMs, currentTrack?.durationMs, isPlaying, lastPollTime])

  if (!currentTrack) return null

  const { name, artist, albumArt, durationMs } = currentTrack
  const progress = durationMs > 0 ? liveProgressMs / durationMs : 0

  function scrubTo(e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    seek(ratio * durationMs)
  }

  const handleNext = () => {
    // skip = negative signal on current track
    if (currentTrackRef.current && onSignal) {
      const t = currentTrackRef.current
      onSignal({
        type: 'skip',
        weight: -1.0,
        track: {
          id: '', title: t.name, artist: t.artist, year: null, energy: null,
          genres: [], moods: [], contexts: [], themes: [],
          owner: '', manifestStateId: '', datasourceName: '', mbid: null, name: t.name,
        }
      })
    }
    ;(onNext ?? next)?.()
  }

  const handlePrev = () => {
    ;(onPrev ?? prev)?.()
  }

  return (
    <div className="player-bar">
      <div className="player-track">
        {albumArt
          ? <img className="player-art" src={albumArt} alt={name} />
          : (
            <div className="player-art player-art--fallback">
              <span className="player-art-initials">{name.slice(0, 1).toUpperCase()}</span>
            </div>
          )
        }
        <div className="player-track-info">
          <div className="player-title">{name}</div>
          <div className="player-artist">{artist}</div>
        </div>
      </div>
      <div className="player-center">
        <div className="player-controls">
          <button className="player-btn player-btn--skip" onClick={handlePrev} title="Previous">⏮</button>
          <button
            className={`player-btn player-btn--play ${isPlaying ? 'player-btn--playing' : ''}`}
            onClick={togglePlay}
            disabled={connecting}
            title={isPlaying ? 'Pause' : 'Play'}
          > 
            {connecting ? <span className="upload-spinner" /> : isPlaying ? '▐▐' : '▶'}
          </button>
          <button className="player-btn player-btn--skip" onClick={handleNext} title="Next">⏭</button>
        </div>
        <div className="player-progress-row">
          <span className="player-time">{fmtTime(liveProgressMs)}</span>
          <div className="player-progress" onClick={scrubTo}>
            <div className="player-progress-track">
              <div className="player-progress-fill" style={{ width: `${progress * 100}%` }} />
              <div className="player-progress-thumb" style={{ left: `${progress * 100}%` }} />
            </div>
          </div>
          <span className="player-time">{fmtTime(durationMs)}</span>
        </div>
        {error && <div className="player-error">{error}</div>}
      </div>
    </div>
  )
}