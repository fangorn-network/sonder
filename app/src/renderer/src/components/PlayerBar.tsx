import { useEffect, useRef, useState } from 'react'
import { useSpotifyContext } from '../providers/SpotifyProvider'
import { useYouTubeContext } from '../providers/YoutubeProvider'
import type { PlaybackState } from '../types/playback'
import './PlayerBar.css'

function fmtTime(ms: number) {
  if (!ms || !isFinite(ms)) return '0:00'
  const s = Math.floor(ms / 1000)
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${m}:${sec.toString().padStart(2, '0')}`
}

interface PlayerBarProps {
  onExpand: () => void
  hidden?: boolean
  playbackState?: PlaybackState
}

export function PlayerBar({ onExpand, hidden, playbackState }: PlayerBarProps) {
  const {
    currentTrack, isPlaying, lastPollTime,
    connecting, error, togglePlay, seek, next, prev, onNext, onPrev, onSignal,
  } = useSpotifyContext()

  const { currentTitle, currentArtist, currentVideoId, pause, resume } = useYouTubeContext()

  const isYT     = playbackState?.activeSource === 'youtube'
  const ytPlaying = isYT && (playbackState?.playing ?? false)

  // ── Progress (Spotify only) ────────────────────────────────────────────────
  const [liveProgressMs, setLiveProgressMs] = useState(0)
  const rafRef = useRef<number | null>(null)
  const currentTrackRef = useRef(currentTrack)
  useEffect(() => { currentTrackRef.current = currentTrack }, [currentTrack])

  useEffect(() => {
    if (isYT) { if (rafRef.current) cancelAnimationFrame(rafRef.current); return }
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    if (!currentTrack) return
    const base     = currentTrack.progressMs
    const pollTime = lastPollTime ?? Date.now()
    const tick = () => {
      const elapsed = isPlaying ? Date.now() - pollTime : 0
      const clamped = Math.min(base + elapsed, currentTrack.durationMs)
      setLiveProgressMs(clamped)
      if (isPlaying) rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [currentTrack?.progressMs, currentTrack?.durationMs, isPlaying, lastPollTime, isYT])

  // ── Derived display ────────────────────────────────────────────────────────
  const name       = isYT ? (currentTitle  ?? '—') : (currentTrack?.name   ?? '')
  const artist     = isYT ? (currentArtist ?? '—') : (currentTrack?.artist ?? '')
  const albumArt   = isYT ? null : currentTrack?.albumArt
  const durationMs = isYT ? 0 : (currentTrack?.durationMs ?? 0)
  const progress   = durationMs > 0 ? liveProgressMs / durationMs : 0

  // hide if nothing active
  if (!isYT && !currentTrack) return null
  if (isYT && !currentVideoId) return null

  function scrubTo(e: React.MouseEvent<HTMLDivElement>) {
    if (isYT) return
    const rect  = e.currentTarget.getBoundingClientRect()
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    seek(ratio * durationMs)
  }

  const handleTogglePlay = () => {
    if (isYT) { ytPlaying ? pause() : resume() }
    else togglePlay()
  }

  const handleNext = () => {
    if (!isYT && currentTrackRef.current && onSignal) {
      const t = currentTrackRef.current
      onSignal({
        type: 'skip', weight: -1.0,
        track: {
          id: '', trackId: '', title: t.name, artist: t.artist, year: null,
          genres: [], moods: [], contexts: [], themes: [],
          owner: '', manifestCid: '', durationMs: 0, spotifyTrackId: null,
        }
      })
    }
    ;(onNext ?? next)?.()
  }

  const handlePrev = () => { ;(onPrev ?? prev)?.() }

  return (
    <div className="player-bar" style={hidden ? { display: 'none' } : undefined}>

      {/* ── Track info ───────────────────────────────────────────────────── */}
      <div className="player-track" onClick={onExpand} style={{ cursor: 'pointer' }}>
        {albumArt
          ? <img className="player-art" src={albumArt} alt={name} />
          : (
            <div
              className="player-art player-art--fallback"
              style={isYT ? { background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.2)' } : undefined}
            >
              {isYT
                ? <YtIcon />
                : <span className="player-art-initials">{name.slice(0, 1).toUpperCase()}</span>
              }
            </div>
          )
        }
        <div className="player-track-info">
          <div className="player-title">{name}</div>
          <div className="player-artist" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span>{artist}</span>
            {isYT && (
              <span style={{
                fontSize: 9, letterSpacing: '0.07em', textTransform: 'uppercase',
                color: 'rgba(248,113,113,0.75)', background: 'rgba(248,113,113,0.1)',
                border: '1px solid rgba(248,113,113,0.2)', borderRadius: 3,
                padding: '1px 5px', lineHeight: 1.4, flexShrink: 0,
              }}>
                youtube
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── Controls + progress ──────────────────────────────────────────── */}
      <div className="player-center">
        <div className="player-controls">
          <button className="player-btn player-btn--skip" onClick={handlePrev} title="Previous" disabled={isYT}>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
              <path d="M6 6h2v12H6zm3.5 6 8.5 6V6z"/>
            </svg>
          </button>

          <button
            className={`player-btn player-btn--play${(isYT ? ytPlaying : isPlaying) ? ' player-btn--playing' : ''}`}
            onClick={handleTogglePlay}
            disabled={connecting}
            title={(isYT ? ytPlaying : isPlaying) ? 'Pause' : 'Play'}
          >
            {connecting
              ? <span className="upload-spinner" />
              : (isYT ? ytPlaying : isPlaying)
                ? <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><rect x="5" y="4" width="4" height="16" rx="1"/><rect x="15" y="4" width="4" height="16" rx="1"/></svg>
                : <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M8 5.14v14l11-7-11-7z"/></svg>
            }
          </button>

          <button className="player-btn player-btn--skip" onClick={handleNext} title="Next" disabled={isYT}>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
              <path d="M16 6h2v12h-2zM6 18l8.5-6L6 6v12z"/>
            </svg>
          </button>
        </div>

        <div className="player-progress-row">
          <span className="player-time">{isYT ? '—' : fmtTime(liveProgressMs)}</span>
          <div className="player-progress" onClick={scrubTo} style={isYT ? { cursor: 'default' } : undefined}>
            <div className="player-progress-track">
              {isYT
                ? (
                  <div style={{
                    height: '100%', width: '100%', borderRadius: 2,
                    background: 'linear-gradient(90deg, rgba(248,113,113,0.15), rgba(248,113,113,0.45), rgba(248,113,113,0.15))',
                    backgroundSize: '200% 100%',
                    animation: ytPlaying ? 'ytBarPulse 2s ease-in-out infinite' : 'none',
                  }} />
                ) : (
                  <>
                    <div className="player-progress-fill" style={{ width: `${progress * 100}%` }} />
                    <div className="player-progress-thumb" style={{ left: `${progress * 100}%` }} />
                  </>
                )
              }
            </div>
          </div>
          <span className="player-time">{isYT ? '—' : fmtTime(durationMs)}</span>
        </div>

        {error && !isYT && <div className="player-error">{error}</div>}
      </div>

      <style>{`
        @keyframes ytBarPulse {
          0%,100% { background-position: 200% 0; }
          50%      { background-position:   0% 0; }
        }
      `}</style>
    </div>
  )
}

function YtIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path
        d="M21.8 8s-.2-1.4-.8-2c-.8-.8-1.6-.8-2-.9C16.8 5 12 5 12 5s-4.8 0-7 .1c-.4.1-1.2.1-2 .9-.6.6-.8 2-.8 2S2 9.6 2 11.2v1.5c0 1.6.2 3.2.2 3.2s.2 1.4.8 2c.8.8 1.8.8 2.2.8C6.8 19 12 19 12 19s4.8 0 7-.2c.4-.1 1.2-.1 2-.9.6-.6.8-2 .8-2s.2-1.6.2-3.2v-1.5C22 9.6 21.8 8 21.8 8zM10 15V9l5.2 3-5.2 3z"
        fill="rgba(248,113,113,0.8)"
      />
    </svg>
  )
}