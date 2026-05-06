import { useEffect, useState } from 'react'
import type { Track } from '../types'
import './TrackDetails.css'
import { useSpotifyContext } from '../providers/SpotifyProvider'

interface TrackDetailsProps {
  track: Track
  color: string
  onClose: () => void
  onCallAgent: (query?: string) => void
  onFilter: (type: 'genre' | 'mood' | 'context', value: string) => void
}

const CHROMA_URL = (import.meta as any).env.VITE_CHROMA_URL ?? 'http://localhost:8080'

async function fetchAlbumArt(title: string, artist: string): Promise<string | null> {
  try {
    const q = encodeURIComponent(`${artist} ${title}`)
    const res = await fetch(`https://itunes.apple.com/search?term=${q}&entity=song&limit=3`)
    const data = await res.json()
    const url = data.results?.[0]?.artworkUrl100
    if (url) return url.replace('100x100bb', '600x600bb')
  } catch { }
  return null
}

async function fetchArtistTracks(artist: string, excludeId: string): Promise<Track[]> {
  const params = new URLSearchParams({ q: artist, n_results: '20' })
  const resp = await fetch(`${CHROMA_URL}/search?${params}`)
  if (!resp.ok) return []
  const data = await resp.json()
  return (data.results ?? [])
    .filter((h: any) => h.id !== excludeId && h.owner === h.owner)
    .slice(0, 8)
    .map((h: any) => {
      const fields: Record<string, string> = {}
      for (const part of (h.document ?? '').split(' | ')) {
        const colon = part.indexOf(': ')
        if (colon === -1) continue
        fields[part.slice(0, colon).trim()] = part.slice(colon + 2).trim()
      }
      return {
        id: h.id,
        title: fields['title'] ?? fields['name'] ?? 'Unknown',
        artist: fields['artist'] ?? artist,
        year: parseFloat(fields['year']) || null,
        energy: parseFloat(fields['energy']) || null,
        genres: fields['genres']?.split(',').map((s: string) => s.trim()).filter(Boolean) ?? [],
        moods: fields['moods']?.split(',').map((s: string) => s.trim()).filter(Boolean) ?? [],
        themes: fields['themes']?.split(',').map((s: string) => s.trim()).filter(Boolean) ?? [],
        contexts: fields['contexts']?.split(',').map((s: string) => s.trim()).filter(Boolean) ?? [],
        owner: h.owner ?? '',
        manifestStateId: h.manifestCid ?? '',
        datasourceName: h.schemaId ?? '',
        mbid: fields['mbid'] ?? null,
        name: fields['name'] ?? fields['title'] ?? 'Unknown',
      }
    })
    .filter((t: Track) => t.artist.toLowerCase() === artist.toLowerCase() && t.id !== excludeId)
}

export function TrackDetails({ track, color, onClose, onCallAgent, onFilter }: TrackDetailsProps) {
  const [albumArt, setAlbumArt] = useState<string | null>(null)
  const [artistTracks, setArtistTracks] = useState<Track[]>([])
  const [artistTracksLoading, setArtistTracksLoading] = useState(true)
  const { searchAndPlay, connected, connect } = useSpotifyContext()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [onClose])

  useEffect(() => {
    fetchAlbumArt(track.title, track.artist).then(setAlbumArt)
  }, [track.title, track.artist])

  useEffect(() => {
    setArtistTracksLoading(true)
    fetchArtistTracks(track.artist, track.id)
      .then(setArtistTracks)
      .finally(() => setArtistTracksLoading(false))
  }, [track.artist, track.id])

  const handleFilter = (type: 'genre' | 'mood' | 'context', value: string) => {
    onFilter(type, value)
    onClose()
  }

  return (
    <div className="td-backdrop" onClick={onClose}>
      <div className="td-panel" onClick={e => e.stopPropagation()}>
        <div className="td-handle" aria-hidden />
        <button className="td-close" onClick={onClose} aria-label="Close">✕</button>

        <div className="td-art">
          {albumArt
            ? <img src={albumArt} alt={track.title} className="td-art-img" />
            : <span className="td-art-initial">{track.title.slice(0, 1).toUpperCase()}</span>
          }
          {track.energy !== null && (
            <div className="td-energy-bar" style={{ width: `${Math.round(track.energy * 100)}%` }} />
          )}
        </div>

        <div className="td-info">
          <h2 className="td-title">{track.title}</h2>
          <p className="td-artist">
            {track.artist}
            {track.year !== null && <span className="td-year"> · {track.year}</span>}
          </p>

          {/* <div>
            <button className="find-similar-btn" onClick={() => onCallAgent(
              `Find one to five tracks whose moods are semantically similar to ${track.moods}`
            )}>
              ✦ Find Similar
            </button> 
          </div> */}

          {track.genres.length > 0 && (
            <div className="td-tags">
              {track.genres.map((g, i) => (
                <span
                  key={g}
                  className="td-tag td-tag--genre"
                  style={{ opacity: i === 0 ? 1 : 0.7, cursor: 'pointer' }}
                  onClick={() => handleFilter('genre', g)}
                >{g}</span>
              ))}
            </div>
          )}

          {track.moods.length > 0 && (
            <div className="td-tags td-tags--moods">
              {track.moods.map(m => (
                <span key={m} className="td-tag td-tag--mood" style={{ cursor: 'pointer' }} onClick={() => handleFilter('mood', m)}>{m}</span>
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
                <span key={c} className="td-tag td-tag--context" style={{ cursor: 'pointer' }} onClick={() => handleFilter('context', c)}>{c}</span>
              ))}
            </div>
          )}

          <dl className="td-fields">
            {track.energy !== null && (
              <div className="td-field">
                <dt>energy</dt>
                <dd>
                  <div className="td-energy-track">
                    <div className="td-energy-fill" style={{ width: `${Math.round(track.energy * 100)}%` }} />
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

        {/* ── more by this artist ── */}
        <div className="td-artist-section">
          <h3 className="td-artist-section-title">More by {track.artist}</h3>
          {artistTracksLoading ? (
            <div className="td-artist-loading">
              <span className="upload-spinner" />
            </div>
          ) : artistTracks.length === 0 ? (
            <p className="td-artist-empty">No other tracks found.</p>
          ) : (
            <div className="td-artist-grid">
              {artistTracks.map(t => (
                <div key={t.id} className="td-artist-card" onClick={async () => {
                  if (!connected) await connect()
                  const query = `${t.title} ${t.artist}`.replace(/\(.*?\)/g, '').trim()
                  searchAndPlay(query)
                  onClose()
                }}>
                  <div className="td-artist-card-art">
                    <span>{t.title.slice(0, 1).toUpperCase()}</span>
                  </div>
                  <div className="td-artist-card-info">
                    <div className="td-artist-card-title">{t.title}</div>
                    {t.year && <div className="td-artist-card-year">{t.year}</div>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}