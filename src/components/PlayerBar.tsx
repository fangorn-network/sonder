// import { usePlayer } from '../state/PlayerProvider'
import { usePlayer } from '../providers/PlayerProvider'
import type { HueStyle } from '../types'
import './PlayerBar.css'

function fmtTime(s: number) {
  if (!s || !isFinite(s)) return '0:00'
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${sec.toString().padStart(2, '0')}`
}

export function PlayerBar() {
  const {
    currentTrack: track, status, error, progress, currentTime, duration,
    queue, queueIdx, hasPrev, hasNext,
    togglePlay, seek, next, prev,
  } = usePlayer()

  if (!track) return null

  const hue = (parseInt(track.owner.slice(2, 8), 16) * 67 + 180) % 360
  const isPlaying = status === 'playing'
  const isLoading = status === 'loading'

  function scrubTo(e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    seek(ratio)
  }

  return (
    <div className="player-bar">
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

      <div className="player-center">
        <div className="player-controls">
          <button
            className="player-btn player-btn--skip"
            onClick={prev}
            disabled={!hasPrev}
            title="Previous"
          >⏮</button>

          <button
            className={`player-btn player-btn--play ${isPlaying ? 'player-btn--playing' : ''}`}
            onClick={togglePlay}
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
            onClick={next}
            disabled={!hasNext}
            title="Next"
          >⏭</button>
        </div>

        <div className="player-progress-row">
          <span className="player-time">{fmtTime(currentTime)}</span>
          <div className="player-progress" onClick={scrubTo}>
            <div className="player-progress-track">
              <div className="player-progress-fill" style={{ width: `${progress * 100}%` }} />
              <div className="player-progress-thumb" style={{ left: `${progress * 100}%` }} />
            </div>
          </div>
          <span className="player-time">{fmtTime(duration)}</span>
        </div>

        {error && <div className="player-error">{error}</div>}
      </div>

      <div className="player-meta">
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