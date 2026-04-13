import Avatar from 'boring-avatars'
import type { Track } from '../types'

const GENRE_VARIANT: Record<string, 'marble' | 'bauhaus' | 'ring' | 'pixel' | 'sunset'> = {
  electronic: 'bauhaus',
  ambient:    'marble',
  'lofi':     'sunset',
  'lo-fi':    'sunset',
  jazz:       'ring',
  classical:  'marble',
  hiphop:     'bauhaus',
  rock:       'bauhaus',
  pop:        'sunset',
}

function variantForGenre(genre: string): 'marble' | 'bauhaus' | 'ring' | 'pixel' | 'sunset' {
  const key = genre?.toLowerCase().replace(/[\s-]/g, '')
  return GENRE_VARIANT[key] ?? 'marble'
}

function paletteFromHue(hue: number): string[] {
  return [
    `hsl(${hue},             60%, 18%)`,
    `hsl(${(hue + 30) % 360}, 55%, 40%)`,
    `hsl(${(hue + 60) % 360}, 70%, 62%)`,
    `hsl(${(hue + 20) % 360}, 45%, 75%)`,
    `hsl(${(hue + 90) % 360}, 65%, 85%)`,
  ]
}

interface TrackCardProps {
  track: Track
  onPlay: (track: Track) => void
  isPlaying: boolean
}

export function TrackCard({ track, onPlay, isPlaying }: TrackCardProps) {
  const hue     = (parseInt(track.owner.slice(2, 8), 16) * 67 + 180) % 360
  const colors  = paletteFromHue(hue)
  const variant = variantForGenre(track.genre)

  return (
    <article
      className={`track-card ${isPlaying ? 'is-playing' : ''}`}
      onClick={() => onPlay(track)}
      style={{ '--hue': hue } as React.CSSProperties}
    >
      {/* Art panel */}
      <div className="track-art">
        <Avatar
          size="100%"
          square
          name={track.owner}
          variant={variant}
          colors={colors}
        />

        {/* Play button */}
        <div className="track-action">
          <button
            className={`btn-play ${isPlaying ? 'active' : ''}`}
            onClick={e => { e.stopPropagation(); onPlay(track) }}
            aria-label={isPlaying ? 'Now playing' : `Play ${track.title}`}
          >
            {isPlaying ? '▐▐' : '▶'}
          </button>
        </div>

        {/* EQ bars while playing */}
        {isPlaying && (
          <div className="eq-bars" aria-label="Now playing">
            <span /><span /><span /><span />
          </div>
        )}
      </div>

      {/* Body */}
      <div className="track-body">
        <div className="track-meta-top">
          <span className="track-genre">{track.genre}</span>
          {isPlaying && (
            <span className="track-now-playing">now playing</span>
          )}
        </div>

        <div className="track-title">{track.title}</div>
        <div className="track-artist">{track.artist}</div>

        <div className="track-footer">
          {track.duration && (
            <span className="track-duration">{track.duration}</span>
          )}
          <span className="track-price">${track.price}</span>
        </div>
      </div>
    </article>
  )
}