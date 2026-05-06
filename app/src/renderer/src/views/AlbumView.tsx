// import type { Album, Track, PlayableTrack } from '../types'

// interface AlbumViewProps {
//   album: Album
//   onBack: () => void
//   onPlay: (track: PlayableTrack) => void
//   currentTrack: PlayableTrack | null
// }

// export function AlbumView({ album, onBack, onPlay, currentTrack }: AlbumViewProps) {
//   return (
//     <div className="album-view">
//       <button className="album-view-back" onClick={onBack}>← Back</button>
//       <div className="album-view-header">
//         <div className="album-view-title">{album.title}</div>
//         <div className="album-view-artist">{album.artist}</div>
//         {album.releaseDate && (
//           <div className="album-view-date">{album.releaseDate}</div>
//         )}
//       </div>
//       <ol className="album-tracklist">
//         {album.tracks.map((track, i) => {
//           const id = `${album.id}-${i}`
//           const isPlaying = currentTrack?.id === id
//           const playable: PlayableTrack = { ...track, id, owner: album.owner }
//           return (
//             <li
//               key={id}
//               className={`tracklist-row ${isPlaying ? 'is-playing' : ''}`}
//               onClick={() => onPlay(playable)}
//             >
//               <span className="tracklist-num">{track.trackNumber ?? i + 1}</span>
//               <span className="tracklist-title">{track.title}</span>
//               {track.duration && (
//                 <span className="tracklist-duration">{track.duration}</span>
//               )}
//               <button
//                 className="tracklist-buy"
//                 disabled
//                 title="Purchase coming soon"
//                 onClick={e => e.stopPropagation()}
//               >
//                 Buy
//               </button>
//             </li>
//           )
//         })}
//       </ol>
//     </div>
//   )
// }