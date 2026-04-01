import { useState } from 'react'
import { Nav } from './components/Nav'
import { ConnectWallet } from './components/ConnectWallet'
import { BrowseView } from './views/BrowseView'
// import { LibraryView } from './views/LibraryView'
// import { UploadView } from './views/UploadView'
import { useGraph } from './hooks/useGraph'
import type { Track, ViewName } from './types'
import './App.css'
import { UploadView } from './views/UploadView'

export default function App() {
  const [view, setView] = useState<ViewName>('Browse')
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null)
  const { tracks, loading, loadingMore, error, hasMore, loadMore, search, setSearch } = useGraph()

  return (
    <div className="app">
      <header className="header">
        <div className="header-brand">
          <span className="brand-mark">⬡</span>
          <span className="brand-name">Fangorn<span className="brand-dot">.</span>Music</span>
        </div>
        <Nav view={view} setView={setView} />
        <ConnectWallet />
      </header>
      <main className="main">
        {view === 'Browse' && (
          <BrowseView
            tracks={tracks}
            loading={loading}
            loadingMore={loadingMore}
            error={error}
            hasMore={hasMore}
            loadMore={loadMore}
            search={search}
            setSearch={setSearch}
            onPlay={setCurrentTrack}
            currentTrack={currentTrack}
          />
        )}
        {/* {view === 'Library' && (
          <LibraryView onPlay={setCurrentTrack} currentTrack={currentTrack} />
        )} */}
        {view === 'Upload' && (
          <UploadView />
        )}
      </main>
    </div>
  )
}

// import { useState, useEffect } from 'react'
// import { Nav } from './components/Nav'
// import { ConnectWallet } from './components/ConnectWallet'
// // import { PlayerBar } from './components/PlayerBar'
// import { BrowseView } from './views/BrowseView'
// import { LibraryView } from './views/LibraryView'
// import { UploadView } from './views/UploadView'
// // import { useFangornMiddleware } from './hooks/useX402fFetch'
// // import { useFangorn } from './hooks/useFangorn'
// import type { Track, ViewName } from './types'

// // Convert a manifest entry + context into a Track for the player
// function entryToTrack(
//   entry: any,
//   owner: string,
//   schemaId: string,
// ): Track {
//   const meta = entry.metadata ?? {}
//   return {
//     id:             `${owner}-${entry.tag}`,
//     title:          meta.title   ?? entry.tag,
//     artist:         meta.artist  ?? owner.slice(0, 8) + '…',
//     album:          schemaId,
//     duration:       meta.duration_seconds ? `${Math.floor(meta.duration_seconds / 60)}:${String(meta.duration_seconds % 60).padStart(2, '0')}` : '—',
//     price:          '0.50',
//     genre:          meta.genre   ?? '',
//     owner,
//     datasourceName: schemaId,
//     tag:            entry.tag,
//     art:            meta.cover_art_url ?? null,
//   }
// }

// export default function App() {
//   const [view, setView]               = useState<ViewName>('Browse')
//   const [currentTrack, setCurrentTrack] = useState<Track | null>(null)
//   // const { middleware }                = useFangornMiddleware()
//   // const { fangorn, musicSchemaId }    = useFangorn()

//   // // Handle share links: /play?owner=0x...&schema=0x...&tag=filename.mp3
//   // // On load, if these params are present, fetch the entry and auto-play it.
//   // useEffect(() => {
//   //   if (!fangorn || !musicSchemaId) return

//   //   const params = new URLSearchParams(window.location.search)
//   //   const owner  = params.get('owner')
//   //   const schema = params.get('schema')
//   //   const tag    = params.get('tag')

//   //   if (!owner || !schema || !tag) return

//   //   fangorn.getEntry(owner as `0x${string}`, schema as `0x${string}`, tag)
//   //     .then(entry => {
//   //       const track = entryToTrack(entry, owner, schema)
//   //       setCurrentTrack(track)
//   //       // Clear params from URL without reload
//   //       window.history.replaceState({}, '', '/')
//   //     })
//   //     .catch(console.error)
//   // }, [fangorn, musicSchemaId])

//   return (
//     <div className="app">
//       <header className="header">
//         <div className="header-brand">
//           <span className="brand-mark">⬡</span>
//           <span className="brand-name">Fangorn<span className="brand-dot">.</span>Music</span>
//         </div>
//         <Nav view={view} setView={setView} />
//         <ConnectWallet />
//       </header>

//       <main className="main">
//         {view === 'Browse' && (
//           <BrowseView onPlay={setCurrentTrack} currentTrack={currentTrack} />
//         )}
//         {view === 'Library' && (
//           <LibraryView onPlay={setCurrentTrack} currentTrack={currentTrack} />
//         )}
//         {view === 'Upload' && (
//           <UploadView />
//         )}
//       </main>

//       {/* <PlayerBar track={currentTrack} middleware={middleware} /> */}
//     </div>
//   )
// }