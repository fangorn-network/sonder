import { useCallback, useEffect, useState } from 'react'
import { Nav } from './components/Nav'
import { ConnectWallet } from './components/ConnectWallet'
import { BrowseView } from './views/BrowseView'
import { useGraph } from './hooks/useGraph'
import type { RecommendedTracks, Track, ViewName } from './types'
import './App.css'
import { UploadView } from './views/UploadView'
import { PlayerBar } from './components/PlayerBar'
import { createPortal } from 'react-dom'
import { LibraryView } from './views/LibraryView'
import { usePrivy } from '@privy-io/react-auth'
import { useFirebase } from './hooks/useFirebase'
import Landing from './views/LandingView'
import { useFangornAgent } from './hooks/useFangornAgent'
import { agentResultToTracks } from './utils/agentToTrack'

export default function App() {
  const { ready, authenticated, user } = usePrivy()

  // All hooks must run on every render regardless of auth state, so they
  // stay above any early returns. useGraph + useFirebase are cheap when
  // unauthenticated (empty library, public subgraph reads).
  const [view, setView] = useState<ViewName>('Discover')
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null)
  const { tracks, loading, loadingMore, error, hasMore, loadMore, search, setSearch } = useGraph()
  const { ids: libraryIds } = useFirebase(user?.id ?? null)
	const [recommendedTracks, setRecommendedTracks] = useState<RecommendedTracks | null>(null)
	const [recommendLoading, setRecommendLoading] = useState(false)
	const { sendMessage } = useFangornAgent()

	// add handler
const handleFindSimilar = useCallback(async (track: Track) => {
  setRecommendLoading(true)
  setView('Discover')

  try {
    const prompt = `Find at most 7 files ${track.genre ? `with the genre: ${track.genre}` : `by artist ${track.artist}`}.`
    const result = await sendMessage(prompt)
    const tracks = agentResultToTracks(result)

		const recommendedTracks: RecommendedTracks = {
			tracks,
			sourceId: track.id,
			sourceTitle: track.title
		}

    setRecommendedTracks(tracks.length > 0 ? recommendedTracks : null)
  } catch (e) {
    console.error('Recommendation failed:', e)
    setRecommendedTracks(null)
  } finally {
    setRecommendLoading(false)
  }
}, [sendMessage])

const clearRecommendations = useCallback(() => {
  setRecommendedTracks(null)
}, [])

  const handlePlay = useCallback((track: Track) => {
    setCurrentTrack({ ...track, owned: libraryIds.includes(track.id) })
  }, [libraryIds])

  const [showScrollTop, setShowScrollTop] = useState(false)

  useEffect(() => {
    const onScroll = () => setShowScrollTop(window.scrollY > 400)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const scrollToTop = useCallback(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [])

  // ─── Privy rehydration gate ─────────────────────────────────────────
  // While Privy reads its refresh-token cookie (~100-300ms on page load),
  // render a minimal splash. Without this, the app paints the logged-out
  // Landing page for a moment before flipping to the authed shell, which
  // feels like "I got logged out again."
  if (!ready) {
    return <BootSplash />
  }

  // ─── Unauthenticated: show the landing page ─────────────────────────
  if (!authenticated) {
    return <Landing />
  }

  // ─── Authenticated app shell (your original markup, unchanged) ──────
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
						recommendedTracks={recommendedTracks}
  					recommendLoading={recommendLoading}
  					onClearRecommendations={clearRecommendations}
          />
        )}
        {view === 'Library' && (
          <LibraryView
            tracks={tracks}
            loading={loading}
            onPlay={handlePlay}
            currentTrack={currentTrack}
						onFindSimilar={handleFindSimilar}
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

// ────────────────────────────────────────────────────────────────────────
// Minimal splash shown during Privy rehydration. Matches the Landing page
// background so there's no color flash on page load.
// ────────────────────────────────────────────────────────────────────────

function BootSplash() {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: '#0a0f0a',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        style={{
          color: '#a3c9a8',
          animation: 'fangornBootPulse 1.4s ease-in-out infinite',
        }}
      >
        <svg viewBox="0 0 40 40" width="32" height="32" aria-hidden="true">
          <path
            d="M20 4 Q 32 14, 28 26 Q 24 34, 20 36 Q 16 34, 12 26 Q 8 14, 20 4 Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1"
          />
          <path d="M20 6 L 20 34" stroke="currentColor" strokeWidth="0.5" opacity="0.6" />
          <path d="M20 14 L 15 18 M20 18 L 14 22 M20 22 L 15 26"
            stroke="currentColor" strokeWidth="0.5" opacity="0.5" />
          <path d="M20 14 L 25 18 M20 18 L 26 22 M20 22 L 25 26"
            stroke="currentColor" strokeWidth="0.5" opacity="0.5" />
        </svg>
      </div>
      <style>{`
        @keyframes fangornBootPulse {
          0%, 100% { opacity: 0.3; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.08); }
        }
      `}</style>
    </div>
  )
}