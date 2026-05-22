import { useEffect, useRef, useState } from 'react'
import { useYouTubeContext } from '../hooks/useYoutubeContext'
import type { PlaybackState } from '../types/playback'
import './PlayerBar.css'

function fmtTime(ms: number) {
  if (!ms || !isFinite(ms) || ms <= 0) return '0:00'
  const s = Math.floor(ms / 1000)
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`
}

interface PlayerBarProps {
  onExpand:       () => void
  hidden?:        boolean
  playbackState?: PlaybackState
  nextTrack?:     { title: string; artist: string } | null
  onPlayNext?:    () => void
}

export function PlayerBar({
  onExpand,
  hidden,
  playbackState,
  nextTrack,
  onPlayNext,
}: PlayerBarProps) {
  const {
    currentTitle,
    currentArtist,
    currentVideoId,
    currentThumb,
    isPlaying,
    progressMs,
    durationMs,
    pause,
    resume,
    seek,
  } = useYouTubeContext()

  const progress = durationMs > 0 ? Math.min(progressMs / durationMs, 1) : 0

  if (!currentVideoId) return null

  function scrubTo(e: React.MouseEvent<HTMLDivElement>) {
    const rect  = e.currentTarget.getBoundingClientRect()
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    seek(ratio * durationMs)
  }

  return (
    <div className="player-bar" style={hidden ? { display: 'none' } : undefined}>

      {/* ── Left: track info ─────────────────────────────────────────────── */}
      <div className="player-track" onClick={onExpand} style={{ cursor: 'pointer' }}>
        <div className="player-art-wrap">
          {currentThumb
            ? <img className="player-art" src={currentThumb} alt={currentTitle ?? ''} />
            : (
              <div className="player-art player-art--fallback" style={{
                background: 'rgba(248,113,113,0.1)',
                border: '1px solid rgba(248,113,113,0.2)',
              }}>
                <YtIcon />
              </div>
            )
          }
        </div>
        <div className="player-track-info">
          <div className="player-title">{currentTitle ?? '—'}</div>
          <div className="player-artist">{currentArtist ?? '—'}</div>
        </div>
      </div>

      {/* ── Center: controls + progress ──────────────────────────────────── */}
      <div className="player-center">
        <div className="player-controls">
          <button
            className="player-btn player-btn--skip"
            disabled
            style={{ opacity: 0.2 }}
            title="Previous"
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
              <path d="M6 6h2v12H6zm3.5 6 8.5 6V6z"/>
            </svg>
          </button>

          <button
            className={`player-btn player-btn--play${isPlaying ? ' player-btn--playing' : ''}`}
            onClick={() => isPlaying ? pause() : resume()}
            title={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying
              ? <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                  <rect x="5" y="4" width="4" height="16" rx="1"/>
                  <rect x="15" y="4" width="4" height="16" rx="1"/>
                </svg>
              : <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                  <path d="M8 5.14v14l11-7-11-7z"/>
                </svg>
            }
          </button>

          <button
            className="player-btn player-btn--skip"
            onClick={onPlayNext}
            title="Next"
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
              <path d="M16 6h2v12h-2zM6 18l8.5-6L6 6v12z"/>
            </svg>
          </button>
        </div>

        <div className="player-progress-row">
          <span className="player-time">{fmtTime(progressMs)}</span>
          <div className="player-progress" onClick={scrubTo}>
            <div className="player-progress-track">
              <div
                className="player-progress-fill"
                style={{
                  width: `${progress * 100}%`,
                  background: 'rgba(248,113,113,0.8)',
                }}
              />
              <div
                className="player-progress-thumb"
                style={{
                  left: `${progress * 100}%`,
                  background: 'rgba(248,113,113,0.9)',
                }}
              />
            </div>
          </div>
          <span className="player-time">{fmtTime(durationMs)}</span>
        </div>
      </div>

      {/* ── Right: up next ───────────────────────────────────────────────── */}
      <div className="player-upnext">
        {nextTrack ? (
          <button
            className="player-upnext-btn"
            onClick={onPlayNext}
            title={`Play next: ${nextTrack.title}`}
          >
            <span className="player-upnext-track">
              <span className="player-upnext-label">up next</span>
              <span className="player-upnext-title">{nextTrack.title}</span>
              <span className="player-upnext-artist">{nextTrack.artist}</span>
            </span>
          </button>
        ) : null}
      </div>

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