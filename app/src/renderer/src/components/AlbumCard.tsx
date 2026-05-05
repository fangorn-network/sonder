// import Avatar from 'boring-avatars'
// import type { Album } from '../types'

// const GENRE_VARIANT: Record<string, 'marble' | 'bauhaus' | 'ring' | 'pixel' | 'sunset'> = {
//   electronic: 'bauhaus',
//   ambient:    'marble',
//   lofi:       'sunset',
//   lfi:        'sunset',
//   jazz:       'ring',
//   classical:  'marble',
//   hiphop:     'bauhaus',
//   rock:       'bauhaus',
//   pop:        'sunset',
// }

// function variantForGenre(genre: string): 'marble' | 'bauhaus' | 'ring' | 'pixel' | 'sunset' {
//   const key = genre?.toLowerCase().replace(/[\s-]/g, '')
//   return GENRE_VARIANT[key] ?? 'marble'
// }

// function paletteFromHue(hue: number): string[] {
//   return [
//     `hsl(${hue},              60%, 18%)`,
//     `hsl(${(hue + 30) % 360}, 55%, 40%)`,
//     `hsl(${(hue + 60) % 360}, 70%, 62%)`,
//     `hsl(${(hue + 20) % 360}, 45%, 75%)`,
//     `hsl(${(hue + 90) % 360}, 65%, 85%)`,
//   ]
// }

// interface AlbumCardProps {
//   album: Album
//   onClick: (album: Album) => void
//   isActive: boolean
// }

// export function AlbumCard({ album, onClick, isActive }: AlbumCardProps) {
//   const hue     = (parseInt(album.owner.slice(2, 8), 16) * 67 + 180) % 360
//   const colors  = paletteFromHue(hue)
//   const variant = variantForGenre(album.genre)

//   return (
//     <article
//       className={`album-card ${isActive ? 'is-active' : ''}`}
//       onClick={() => onClick(album)}
//       style={{ '--hue': hue } as React.CSSProperties}
//     >
//       <div className="album-art">
//         {album.artwork
//           ? <img src={album.artwork} alt={album.title} className="album-art-img" />
//           : (
//             <Avatar
//               size="100%"
//               square
//               name={album.owner}
//               variant={variant}
//               colors={colors}
//             />
//           )
//         }
//         <div className="album-track-count">
//           {album.tracks.length} {album.tracks.length === 1 ? 'track' : 'tracks'}
//         </div>
//       </div>

//       <div className="album-body">
//         <div className="album-genre">{album.genre}</div>
//         <div className="album-title">{album.title}</div>
//         <div className="album-artist">{album.artist}</div>
//         <div className="album-footer">
//           {album.releaseDate && (
//             <span className="album-date">{album.releaseDate}</span>
//           )}
//           <span className="album-price">
//             {!album.price || album.price === '0' ? 'free' : `$${(Number(album.price) / 1_000_000).toFixed(2)}`}
//           </span>
//         </div>
//       </div>
//     </article>
//   )
// }