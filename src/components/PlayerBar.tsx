// import { useRef, useState, useEffect } from 'react'
// import { usePrivy } from '@privy-io/react-auth'
// import { useLibrary } from '../hooks/useLibrary'
// import type { Track, FangornMiddleware, PlayState, HueStyle } from '../types'
// import { computeSchemaId } from '@fangorn-network/sdk'

// interface PlayerBarProps {
//   track: Track | null
//   middleware: FangornMiddleware | null
// }

// export function PlayerBar({ track, middleware }: PlayerBarProps) {
//   const audioRef = useRef<HTMLAudioElement | null>(null)
//   const [state, setState] = useState<PlayState>('idle')
//   const [error, setError] = useState<string | null>(null)
//   const { authenticated, login } = usePrivy()
//   const { addToLibrary } = useLibrary()

//   useEffect(() => {
//     setState('idle')
//     setError(null)
//     if (audioRef.current) {
//       audioRef.current.pause()
//       audioRef.current.src = ''
//     }
//   }, [track?.id])

//   const handlePlay = async () => {
//     if (!authenticated) { login(); return }
//     if (!middleware || !track) return

//     if (state === 'playing') {
//       audioRef.current?.pause()
//       setState('idle')
//       return
//     }

//     setState('loading')
//     setError(null)

//     const result = await middleware.fetchResource({
//       owner: track.owner,
//       schemaId: computeSchemaId("test.fangorn.music.v1"),
//       tag: track.tag,
//       baseUrl: import.meta.env.VITE_RESOURCE_SERVER_URL as string,
//       // If already paid, signal middleware to skip payment
//       ...(track.owned ? { skipPayment: true } : {}),
//     })

//     if (!result.success) {
//       setState('error')
//       setError((result as any).error ?? 'Payment failed')
//       return
//     }

//     const bytes = Uint8Array.from(atob((result as any).dataString), (c: string) => c.charCodeAt(0))
//     const blob = new Blob([bytes], { type: 'audio/mpeg' })
//     const url = URL.createObjectURL(blob)
//     if (audioRef.current) {
//       audioRef.current.src = url
//       audioRef.current.play()
//     }
//     setState('playing')

//     // Add to library if this was a new payment (not already owned)
//     if (!track.owned) {
//       addToLibrary({
//         owner: track.owner,
//         schemaId: track.datasourceName,
//         tag: track.tag,
//         price: track.price,
//         title: track.title,
//         artist: track.artist,
//         genre: track.genre,
//         duration: track.duration,
//         art: track.art,
//       }).catch(console.error)
//     }
//   }

//   if (!track) return null

//   const hue = (parseInt(track.id) * 67 + 180) % 360

//   return (
//     <div className="player-bar">
//       <audio ref={audioRef} onEnded={() => setState('idle')} />

//       <div className="player-track">
//         <div className="player-art" style={{ '--hue': hue } as HueStyle}>
//           {track.artist.split(' ').map((w: string) => w[0]).join('').slice(0, 2)}
//         </div>
//         <div>
//           <div className="player-title">{track.title}</div>
//           <div className="player-artist">{track.artist}</div>
//         </div>
//       </div>

//       <div className="player-controls">
//         <button
//           className={`btn-play-large ${state === 'playing' ? 'active' : ''}`}
//           onClick={handlePlay}
//           disabled={state === 'loading'}
//         >
//           {state === 'loading' ? '…' : state === 'playing' ? '▐▐' : track.owned ? '▶ Owned' : `▶ $${track.price}`}
//         </button>
//         {error && <span className="player-error">{error}</span>}
//       </div>

//       <div className="player-meta">
//         <span className="player-genre">{track.genre}</span>
//         <span className="player-duration">{track.duration}</span>
//       </div>
//     </div>
//   )
// }