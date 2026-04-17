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

export default function App() {
  const [view, setView] = useState<ViewName>('Browse')
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null)
  const { tracks, loading, loadingMore, error, hasMore, loadMore, search, setSearch } = useGraph()

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
          <span className="brand-mark" />
          <span className="brand-name">Fangorn<span className="brand-dot">.</span>Music</span>
        </div>
        <ConnectWallet />
      </header>

      <Nav view={view} setView={setView} />

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
        { view === 'Library' && <LibraryView /> }
        {view === 'Upload' && <UploadView />}
        <PlayerBar track={currentTrack} />
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