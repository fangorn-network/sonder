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
import { PlayerBar } from './components/PlayerBar'

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

        <PlayerBar
          track={currentTrack}
        />
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
