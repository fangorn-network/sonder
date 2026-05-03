import { useEffect } from 'react'
import type { Track } from '../types'
import './TrackDetails.css'

interface TrackDetailsProps {
  track: Track
  color: string
  onClose: () => void
  onCallAgent: (query?: string) => void;
}

export function TrackDetails({ track, onClose, onCallAgent }: TrackDetailsProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [onClose])

  return (
    <div className="td-backdrop" onClick={onClose}>
      <div
        className="td-panel"
        onClick={e => e.stopPropagation()}
        // style={{ '--td-color': color } as React.CSSProperties}
      >
        <div className="td-handle" aria-hidden />
        <button className="td-close" onClick={onClose} aria-label="Close">
          ✕
        </button>

        <div className="td-art">
          <span className="td-art-initial">
            {track.title.slice(0, 1).toUpperCase()}
          </span>
          {track.energy !== null && (
            <div
              className="td-energy-bar"
              style={{ width: `${Math.round(track.energy * 100)}%` }}
            />
          )}
        </div>

        <div className="td-info">
          <h2 className="td-title">{track.title}</h2>
          <p className="td-artist">
            {track.artist}
            {track.year !== null && <span className="td-year"> · {track.year}</span>}
          </p>

              {/* // Find one to five songs that are similar to the song ${track.title} by the artist ${track.artist}. */}
          <div>
            <button className="find-similar-btn" onClick={() => onCallAgent(
              `
              Find one to five tracks whose moods are semantically similar to ${track.moods}
              `
            )}>
              ✦ Find Similar
            </button>
          </div>

          {track.genres.length > 0 && (
            <div className="td-tags">
              {track.genres.map((g, i) => (
                <span
                  key={g}
                  className="td-tag td-tag--genre"
                  style={{
                    opacity: i === 0 ? 1 : 0.7,
                  }}
                >
                  {g}
                </span>
              ))}
            </div>
          )}

          {track.moods.length > 0 && (
            <div className="td-tags td-tags--moods">
              {track.moods.map(m => (
                <span key={m} className="td-tag td-tag--mood">{m}</span>
              ))}
            </div>
          )}

          {track.themes.length > 0 && (
            <div className="td-tags td-tags--themes">
              {track.themes.map(t => (
                <span key={t} className="td-tag td-tag--theme">{t}</span>
              ))}
            </div>
          )}

          {track.contexts.length > 0 && (
            <div className="td-tags td-tags--contexts">
              {track.contexts.map(c => (
                <span key={c} className="td-tag td-tag--context">{c}</span>
              ))}
            </div>
          )}

          <dl className="td-fields">
            {track.energy !== null && (
              <div className="td-field">
                <dt>energy</dt>
                <dd>
                  <div className="td-energy-track">
                    <div
                      className="td-energy-fill"
                      style={{ width: `${Math.round(track.energy * 100)}%` }}
                    />
                  </div>
                  <span className="td-energy-val">{Math.round(track.energy * 100)}</span>
                </dd>
              </div>
            )}
            {track.mbid && (
              <div className="td-field">
                <dt>mbid</dt>
                <dd className="td-mono">{track.mbid}</dd>
              </div>
            )}
            <div className="td-field">
              <dt>artist address</dt>
              <dd className="td-mono">{track.owner.slice(0, 6)}…{track.owner.slice(-4)}</dd>
            </div>
          </dl>
        </div>
      </div>
    </div>
  )
}