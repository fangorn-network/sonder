import type { Track, HueStyle } from '../types'

interface TrackCardProps {
  track: Track
  onPlay: (track: Track) => void
  isPlaying: boolean
}

export function TrackCard({ track, onPlay, isPlaying }: TrackCardProps) {
  const initials = track.artist.split(' ').map((w: string) => w[0]).join('').slice(0, 2)
  const hue = (parseInt(track.owner.slice(2, 8), 16) * 67 + 180) % 360

  return (
    <div
      className={`track-card ${isPlaying ? 'is-playing' : ''}`}
      onClick={() => onPlay(track)}
    >
      <div className="track-art" style={{ '--hue': hue } as HueStyle}>
        <span className="track-initials">{initials}</span>
        {isPlaying && (
          <div className="eq-bars">
            <span /><span /><span /><span />
          </div>
        )}
      </div>

      <div className="track-action">
        <button
          className={`btn-play ${isPlaying ? 'active' : ''}`}
          onClick={e => { e.stopPropagation(); onPlay(track) }}
          title={isPlaying ? 'Now playing' : `Play`}
        >
          {isPlaying ? '▐▐' : '▶'}
        </button>
      </div>

      <div className="track-body">
        <div className="track-title">{track.title}</div>
        <div className="track-artist">{track.artist}</div>
        <div className="track-footer">
          <span className="track-genre">{track.genre}</span>
          <span className="track-price">${track.price}</span>
        </div>
      </div>
    </div>
  )
}