import { useCallback, useEffect, useState } from 'react'
import { Nav } from './components/Nav'
import { ConnectWallet } from './components/ConnectWallet'
import { BrowseView } from './views/BrowseView'
import { useGraph } from './hooks/useGraph'
import type { Track, ViewName } from './types'
import './App.css'
import { UploadView } from './views/UploadView'
import { PlayerBar } from './components/PlayerBar'
import { createPortal } from 'react-dom'
import { LibraryView } from './views/LibraryView'
import { useLibrary } from './hooks/useLibrary'

export default function App() {
  const [view, setView] = useState<ViewName>('Discover')
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null)
  const { tracks, loading, loadingMore, error, hasMore, loadMore, search, setSearch } = useGraph()

  const { ids: libraryIds } = useLibrary()

  const handlePlay = useCallback((track: Track) => {
    console.log('the track ' + track.id)
    setCurrentTrack({ ...track, owned: libraryIds.includes(track.id) })
  }, [libraryIds])

  // add inside the component, near the top with other state
  const [showScrollTop, setShowScrollTop] = useState(false)

  // add this effect
  useEffect(() => {
    const onScroll = () => setShowScrollTop(window.scrollY > 400)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const scrollToTop = useCallback(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [])


  return (
    <div className="app">
      <header className="header">
        <div className="header-brand">
          <span className="brand-name">Fangorn<span className="brand-dot">.</span>Music</span>
        </div>
        <ConnectWallet />
      </header>

      <Nav view={view} setView={setView} />

      <main className="main">
        {view === 'Discover' && (
          <BrowseView
            tracks={tracks}
            loading={loading}
            loadingMore={loadingMore}
            error={error}
            hasMore={hasMore}
            loadMore={loadMore}
            search={search}
            setSearch={setSearch}
            onPlay={handlePlay}
            currentTrack={currentTrack}
          />
        )}
        {view === 'Library' && (
          <LibraryView
            tracks={tracks}
            loading={loading}
            onPlay={handlePlay}
            currentTrack={currentTrack}
          />
        )}
        {view === 'Upload' && <UploadView />}
        <PlayerBar
          track={currentTrack}
          tracks={tracks}
          onTrackChange={handlePlay}
        />
      </main>
      {showScrollTop && createPortal(
        <button className="scroll-top-btn" onClick={scrollToTop} title="Back to top">
          ↑
        </button>,
        document.body
      )}
    </div>
  )
}