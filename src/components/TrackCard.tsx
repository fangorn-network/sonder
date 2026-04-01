import Avatar from 'boring-avatars'
import type { Track, HueStyle } from '../types'

// ─── Palette + variant derived from owner + genre ────────────────────────────

const GENRE_VARIANT: Record<string, 'marble' | 'bauhaus' | 'ring' | 'pixel' | 'sunset'> = {
  electronic: 'bauhaus',
  ambient:    'marble',
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

/** 5-stop palette derived from a base hue — dark anchor → bright highlights */
function paletteFromHue(hue: number): string[] {
  return [
    `hsl(${hue},             60%, 18%)`,
    `hsl(${(hue + 30) % 360}, 55%, 40%)`,
    `hsl(${(hue + 60) % 360}, 70%, 62%)`,
    `hsl(${(hue + 20) % 360}, 45%, 75%)`,
    `hsl(${(hue + 90) % 360}, 65%, 85%)`,
  ]
}

// ─── Component ───────────────────────────────────────────────────────────────

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
    <div
      className={`track-card ${isPlaying ? 'is-playing' : ''}`}
      onClick={() => onPlay(track)}
    >
      <div className="track-art" style={{ '--hue': hue } as HueStyle}>
        <Avatar
          size="100%"
          square
          name={track.owner}
          variant={variant}
          colors={colors}
        />
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
          title={isPlaying ? 'Now playing' : 'Play'}
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