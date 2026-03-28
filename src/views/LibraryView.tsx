// import { usePrivy } from '@privy-io/react-auth'
// import { TrackCard } from '../components/TrackCard'
// import { useLibrary } from '../hooks/useLibrary'
// import { useFangorn, MUSIC_SCHEMA_NAME } from '../hooks/useFangorn'
// import type { Track } from '../types'

// interface LibraryViewProps {
//   onPlay: (track: Track) => void
//   currentTrack: Track | null
// }

// function libraryEntryToTrack(entry: import('../hooks/useLibrary').LibraryEntry): Track {
//   return {
//     id:             `${entry.owner}-${entry.tag}`,
//     title:          entry.title,
//     artist:         entry.artist,
//     album:          MUSIC_SCHEMA_NAME,
//     duration:       entry.duration,
//     price:          entry.price,
//     genre:          entry.genre,
//     owner:          entry.owner,
//     datasourceName: entry.schemaId,
//     tag:            entry.tag,
//     art:            entry.art,
//     owned:          true,   // everything in the library is already paid
//   }
// }

// export function LibraryView({ onPlay, currentTrack }: LibraryViewProps) {
//   const { authenticated, login } = usePrivy()
//   const { library, loading, error, reload } = useLibrary()
//   const { ownerAddress } = useFangorn()

//   if (!authenticated) {
//     return (
//       <div className="view library-view">
//         <div className="empty-state">
//           <div className="empty-icon">🔒</div>
//           <p>Connect to see your library</p>
//           <button className="btn-primary" onClick={login}>Connect</button>
//         </div>
//       </div>
//     )
//   }

//   const tracks = library.map(libraryEntryToTrack)
//   // Sort by most recently paid
//   tracks.sort((a: any, b: any) => {
//     const at = library.find(e as any => e.tag === a.tag)?.paidAt ?? 0
//     const bt = library.find(e as any => e.tag === b.tag)?.paidAt ?? 0
//     return bt - at
//   })

//   return (
//     <div className="view library-view">
//       <div className="view-header">
//         <h2 className="view-title">Your Library</h2>
//         <button
//           className="btn-icon"
//           onClick={reload}
//           disabled={loading}
//           title="Refresh library"
//           style={{ marginLeft: 'auto', opacity: loading ? 0.5 : 1 }}
//         >
//           ↻
//         </button>
//       </div>

//       {loading && (
//         <div className="chain-loading">
//           <span className="upload-spinner" style={{ width: 14, height: 14 }} />
//           Decrypting your library…
//         </div>
//       )}

//       {error && (
//         <div className="upload-error" style={{ margin: '12px 0' }}>{error}</div>
//       )}

//       {!loading && tracks.length === 0 && (
//         <div className="empty-state">
//           <div className="empty-icon">🎵</div>
//           <p>No tracks yet.</p>
//           <p style={{ fontSize: '0.85rem', color: 'var(--text-dim)' }}>
//             Tracks you pay for in Browse will appear here.
//           </p>
//         </div>
//       )}

//       <div className="track-list">
//         {tracks.map(track => (
//           <TrackCard
//             key={track.id}
//             track={track}
//             onPlay={onPlay}
//             isPlaying={currentTrack?.id === track.id}
//           />
//         ))}
//       </div>
//     </div>
//   )
// }