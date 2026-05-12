// import { useEffect, useState } from 'react'
// import type { Track } from '../types'
// import './TrackDetails.css'
// import { useSpotifyContext } from '../providers/SpotifyProvider'

// interface TrackDetailsProps {
//   track: Track
//   color: string
//   onClose: () => void
//   onCallAgent: (query?: string) => void
//   onFilter: (type: 'genre' | 'mood' | 'context', value: string) => void
// }

// const CHROMA_URL = (import.meta as any).env.VITE_CHROMA_URL ?? 'http://localhost:8080'

// // ── api ───────────────────────────────────────────────────────────────────────

// async function fetchAlbumArt(title: string, artist: string): Promise<string | null> {
//   try {
//     const q = encodeURIComponent(`${artist} ${title}`)
//     const res = await fetch(`https://itunes.apple.com/search?term=${q}&entity=song&limit=3`)
//     const data = await res.json()
//     const url = data.results?.[0]?.artworkUrl100
//     if (url) return url.replace('100x100bb', '600x600bb')
//   } catch { }
//   return null
// }

// /**
//  * Embed a track text string via the backend.
//  * Used when the track doesn't already have an embedding attached.
//  */
// async function embedTrack(artist: string, title: string): Promise<number[] | null> {
//   try {
//     const res = await fetch(`${CHROMA_URL}/embed`, {
//       method:  'POST',
//       headers: { 'Content-Type': 'application/json' },
//       body:    JSON.stringify({ text: `${artist} - ${title}` }),
//     })
//     if (!res.ok) return null
//     const data = await res.json()
//     return data.embedding ?? null
//   } catch {
//     return null
//   }
// }

// /**
//  * Find similar tracks by embedding vector.
//  * Uses /search/vector — returns tracks ordered by embedding proximity,
//  * excluding the source track.
//  */
// async function fetchSimilarTracks(
//   embedding: number[],
//   excludeId: string,
//   n = 12,
// ): Promise<Track[]> {
//   const res = await fetch(`${CHROMA_URL}/search/vector`, {
//     method:  'POST',
//     headers: { 'Content-Type': 'application/json' },
//     body:    JSON.stringify({ embedding, n_results: n + 1 }), // +1 to account for self
//   })
//   if (!res.ok) return []
//   const data = await res.json()

//   return (data.results ?? [])
//     .filter((h: any) => h.id !== excludeId)
//     .slice(0, n)
//     .map((h: any) => normalizeHit(h))
//     .filter(Boolean) as Track[]
// }

// function normalizeHit(h: any): Track | null {
//   const fields: Record<string, string> = {}
//   for (const part of (h.document ?? '').split(' | ')) {
//     const colon = part.indexOf(': ')
//     if (colon === -1) continue
//     fields[part.slice(0, colon).trim()] = part.slice(colon + 2).trim()
//   }
//   const num = (k: string) => { const v = parseFloat(fields[k] ?? ''); return isNaN(v) ? null : v }
//   const arr = (k: string) => fields[k]?.split(',').map((s: string) => s.trim()).filter(Boolean) ?? []

//   return {
//     id:              h.id,
//     title:           fields['title'] ?? fields['name'] ?? 'Unknown',
//     artist:          fields['artist'] ?? '',
//     year:            num('year'),
//     energy:          num('energy'),
//     genres:          arr('genres'),
//     moods:           arr('moods'),
//     themes:          arr('themes'),
//     contexts:        arr('contexts'),
//     owner:           h.owner ?? '',
//     manifestStateId: h.manifestCid ?? '',
//     datasourceName:  h.schemaId ?? '',
//     mbid:            fields['mbid'] ?? null,
//     name:            fields['name'] ?? fields['title'] ?? 'Unknown',
//     embedding:       h.embedding ?? undefined,
//   }
// }

// // ── component ─────────────────────────────────────────────────────────────────

// export function TrackDetails({ track, color, onClose, onCallAgent, onFilter }: TrackDetailsProps) {
//   const [albumArt, setAlbumArt]               = useState<string | null>(null)
//   const [similarTracks, setSimilarTracks]     = useState<Track[]>([])
//   const [similarLoading, setSimilarLoading]   = useState(true)
//   const [similarError, setSimilarError]       = useState(false)
//   const [playLoading, setPlayLoading]         = useState(false)
//   const [playingId, setPlayingId]             = useState<string | null>(null)

//   const {
//     searchAndPlay, connected, connect,
//     isPlaying, currentTrack, togglePlay,
//   } = useSpotifyContext()

//   const isThisTrack =
//     currentTrack?.name === track.title && currentTrack?.artist === track.artist

//   // ── keyboard + scroll lock ────────────────────────────────────────────────
//   useEffect(() => {
//     const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
//     window.addEventListener('keydown', onKey)
//     document.body.style.overflow = 'hidden'
//     return () => {
//       window.removeEventListener('keydown', onKey)
//       document.body.style.overflow = ''
//     }
//   }, [onClose])

//   // ── album art ─────────────────────────────────────────────────────────────
//   useEffect(() => {
//     fetchAlbumArt(track.title, track.artist).then(setAlbumArt)
//   }, [track.title, track.artist])

//   // ── similar tracks via embedding ──────────────────────────────────────────
//   useEffect(() => {
//     setSimilarLoading(true)
//     setSimilarError(false)
//     setSimilarTracks([])

//     async function load() {
//       // Use embedding already on track if available (kernel recommendation path),
//       // otherwise embed on demand — one /embed call.
//       const embedding: number[] | null =
//         (track as any).embedding
//           ? Array.from((track as any).embedding as number[])
//           : await embedTrack(track.artist, track.title)

//       if (!embedding) {
//         setSimilarError(true)
//         return
//       }

//       const similar = await fetchSimilarTracks(embedding, track.id, 10)
//       setSimilarTracks(similar)
//     }

//     load()
//       .catch(() => setSimilarError(true))
//       .finally(() => setSimilarLoading(false))
//   }, [track.id])

//   // ── handlers ──────────────────────────────────────────────────────────────
//   const handleFilter = (type: 'genre' | 'mood' | 'context', value: string) => {
//     onFilter(type, value)
//     onClose()
//   }

//   const handlePlayPause = async () => {
//     if (!connected) { await connect(); return }
//     if (isThisTrack) {
//       await togglePlay()
//     } else {
//       setPlayLoading(true)
//       try {
//         const query = `${track.title} ${track.artist}`.replace(/\(.*?\)/g, '').trim()
//         await searchAndPlay(query)
//       } finally {
//         setPlayLoading(false)
//       }
//     }
//   }

//   const handlePlaySimilar = async (t: Track) => {
//     if (!connected) { await connect(); return }
//     setPlayingId(t.id)
//     try {
//       const query = `${t.title} ${t.artist}`.replace(/\(.*?\)/g, '').trim()
//       await searchAndPlay(query)
//     } catch {
//       setPlayingId(null)
//     }
//   }

//   const showPause = isThisTrack && isPlaying

//   return (
//     <div className="td-backdrop" onClick={onClose}>
//       <div className="td-panel" onClick={e => e.stopPropagation()}>
//         <div className="td-handle" aria-hidden />
//         <button className="td-close" onClick={onClose} aria-label="Close">✕</button>

//         {/* ── art ── */}
//         <div className="td-art">
//           {albumArt
//             ? <img src={albumArt} alt={track.title} className="td-art-img" />
//             : <span className="td-art-initial">{track.title.slice(0, 1).toUpperCase()}</span>
//           }
//           {track.energy !== null && (
//             <div className="td-energy-bar" style={{ width: `${Math.round(track.energy * 100)}%` }} />
//           )}
//         </div>

//         {/* ── info ── */}
//         <div className="td-info">
//           <div className="td-title-row">
//             <div className="td-title-group">
//               <h2 className="td-title">{track.title}</h2>
//               <p className="td-artist">
//                 {track.artist}
//                 {track.year !== null && <span className="td-year"> · {track.year}</span>}
//               </p>
//             </div>
//             <button
//               className={`td-play-btn${showPause ? ' td-play-btn--playing' : ''}`}
//               onClick={handlePlayPause}
//               disabled={playLoading}
//               aria-label={showPause ? 'Pause' : 'Play'}
//               style={{ '--td-play-color': color } as React.CSSProperties}
//             >
//               {playLoading
//                 ? <span className="upload-spinner" style={{ width: 14, height: 14, borderWidth: 1.5 }} />
//                 : showPause
//                   ? <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><rect x="5" y="4" width="4" height="16" rx="1"/><rect x="15" y="4" width="4" height="16" rx="1"/></svg>
//                   : <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M8 5.14v14l11-7-11-7z"/></svg>
//               }
//             </button>
//           </div>

//           {track.genres.length > 0 && (
//             <div className="td-tags">
//               {track.genres.map((g, i) => (
//                 <span key={g} className="td-tag td-tag--genre"
//                   style={{ opacity: i === 0 ? 1 : 0.7, cursor: 'pointer' }}
//                   onClick={() => handleFilter('genre', g)}
//                 >{g}</span>
//               ))}
//             </div>
//           )}
//           {track.moods.length > 0 && (
//             <div className="td-tags td-tags--moods">
//               {track.moods.map(m => (
//                 <span key={m} className="td-tag td-tag--mood" style={{ cursor: 'pointer' }}
//                   onClick={() => handleFilter('mood', m)}>{m}</span>
//               ))}
//             </div>
//           )}
//           {track.themes.length > 0 && (
//             <div className="td-tags td-tags--themes">
//               {track.themes.map(t => (
//                 <span key={t} className="td-tag td-tag--theme">{t}</span>
//               ))}
//             </div>
//           )}
//           {track.contexts.length > 0 && (
//             <div className="td-tags td-tags--contexts">
//               {track.contexts.map(c => (
//                 <span key={c} className="td-tag td-tag--context" style={{ cursor: 'pointer' }}
//                   onClick={() => handleFilter('context', c)}>{c}</span>
//               ))}
//             </div>
//           )}

//           <dl className="td-fields">
//             {track.energy !== null && (
//               <div className="td-field">
//                 <dt>energy</dt>
//                 <dd>
//                   <div className="td-energy-track">
//                     <div className="td-energy-fill" style={{ width: `${Math.round(track.energy * 100)}%` }} />
//                   </div>
//                   <span className="td-energy-val">{Math.round(track.energy * 100)}</span>
//                 </dd>
//               </div>
//             )}
//             {track.mbid && (
//               <div className="td-field">
//                 <dt>mbid</dt>
//                 <dd className="td-mono">{track.mbid}</dd>
//               </div>
//             )}
//             <div className="td-field">
//               <dt>artist address</dt>
//               <dd className="td-mono">{track.owner.slice(0, 6)}…{track.owner.slice(-4)}</dd>
//             </div>
//           </dl>
//         </div>

//         {/* ── similar tracks ── */}
//         <div className="td-similar-section">
//           <h3 className="td-artist-section-title">Similar tracks</h3>

//           {similarLoading && (
//             <div className="td-artist-loading">
//               <span className="upload-spinner" />
//             </div>
//           )}

//           {!similarLoading && similarError && (
//             <p className="td-artist-empty">Couldn't load similar tracks.</p>
//           )}

//           {!similarLoading && !similarError && similarTracks.length === 0 && (
//             <p className="td-artist-empty">No similar tracks found.</p>
//           )}

//           {!similarLoading && similarTracks.length > 0 && (
//             <ul className="td-similar-list">
//               {similarTracks.map((t, i) => {
//                 const isThisPlaying = playingId === t.id
//                 return (
//                   <li key={t.id} className="td-similar-row">
//                     <span className="td-similar-rank">{i + 1}</span>

//                     <div className="td-similar-info">
//                       <span className="td-similar-title">{t.title}</span>
//                       <span className="td-similar-artist">{t.artist}</span>
//                       {t.genres.length > 0 && (
//                         <span className="td-similar-genre">{t.genres[0]}</span>
//                       )}
//                     </div>

//                     {t.energy !== null && (
//                       <div className="td-similar-energy">
//                         <div
//                           className="td-similar-energy-fill"
//                           style={{ height: `${Math.round(t.energy * 100)}%`, background: color }}
//                         />
//                       </div>
//                     )}

//                     <button
//                       className={`td-similar-play${isThisPlaying ? ' td-similar-play--active' : ''}`}
//                       onClick={() => handlePlaySimilar(t)}
//                       aria-label={`Play ${t.title}`}
//                       style={{ color }}
//                     >
//                       {isThisPlaying
//                         ? <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><rect x="5" y="4" width="4" height="16" rx="1"/><rect x="15" y="4" width="4" height="16" rx="1"/></svg>
//                         : <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
//                       }
//                     </button>
//                   </li>
//                 )
//               })}
//             </ul>
//           )}
//         </div>

//       </div>
//     </div>
//   )
// }