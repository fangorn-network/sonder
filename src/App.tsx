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
// import { LibraryView } from './views/LibraryView'
import { usePrivy } from '@privy-io/react-auth'
import Landing from './views/LandingView'
import { PlayerProvider } from './providers/PlayerProvider'
import { useFangornAgent } from './hooks/useFangornAgent'
import { agentResultToTracks } from './utils/agentToTrack'

export default function App() {
  const { ready, authenticated } = usePrivy()

  // Hooks above any early return so they run on every render regardless
  // of auth state. useGraph is cheap when unauthenticated (public reads).
  const [view, setView] = useState<ViewName>('Discover')
  const { tracks, loading, loadingMore, error, hasMore, loadMore, search, setSearch } = useGraph()
  const [recommendedTracks, setRecommendedTracks] = useState<RecommendedTracks | null>(null)
  const [recommendLoading, setRecommendLoading] = useState(false)
  const { sendMessage } = useFangornAgent()

  // add handler
  const handleFindSimilar = useCallback(async (query?: string) => {
    // setRecommendLoading(true)
    // setView('Discover')

    try {
      const userIntent = query?.trim() || 'I have dream pop fever'

      const prompt = userIntent
      const result = await sendMessage(prompt)
      const tracks = agentResultToTracks(result?.mcpResults)
      console.log('WE GOT THE TRACKS: ' + JSON.stringify(tracks))
      // const tracks = agentResultToTracks(result)
      const agentMessage = result?.agentMessage

      // const id = track?.id ?? "
      // c"

      const id = ""
      const recommendedTracks: RecommendedTracks = {
        tracks,
        sourceId: id,
        sourceTitle: agentMessage!
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

  // ─── Authenticated app shell ────────────────────────────────────────
  // PlayerProvider wraps everything that needs it: views consume
  // selectTrack/loadFromBytes, PlayerBar reads transport state. The
  // <audio> element lives inside the provider, so it survives view
  // switches without remounting.
  return (
    <PlayerProvider tracks={tracks}>
      <div className="app">
        <header className="header">
          <div className="header-brand">
            <span className="brand-name">SOND3R</span>
          </div>
          <ConnectWallet />
        </header>
        {/* <Nav view={view} setView={setView} /> */}
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
              recommendedTracks={recommendedTracks}
              recommendLoading={recommendLoading}
              onClearRecommendations={clearRecommendations}
              onCallAgent={handleFindSimilar} 
            />
          )}
          {/* {view === 'Library' && (
            <LibraryView
              // tracks={tracks}
              // loading={loading}
              onFindSimilar={handleFindSimilar}
            />
          )} */}
          {/* {view === 'Upload' && <UploadView />} */}
        </main>
        <PlayerBar />
        {showScrollTop && createPortal(
          <button className="scroll-top-btn" onClick={scrollToTop} title="Back to top">
            ↑
          </button>,
          document.body
        )}
      </div>
    </PlayerProvider>
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