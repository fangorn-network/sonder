import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BrowseView } from './views/BrowseView'
import { AgentView } from './views/AgentView'
import type { RecommendedTracks, Track, ViewName } from './types'
import './App.css'
import { PlayerBar } from './components/PlayerBar'
import { NowPlaying } from './components/NowPlaying'
import { createPortal } from 'react-dom'
import { usePrivy } from '@privy-io/react-auth'
import { PlayerProvider } from './providers/PlayerProvider'
import { useFangornAgent } from './hooks/useFangornAgent'
import { agentResultToTracks } from './utils/agentToTrack'
import { useChroma } from './hooks/useChroma'
import { StartupView } from './views/StartupView'
import { useSessionKernel } from './hooks/useSessionKernel'
import { ConnectorsView } from './views/ConnectorsView'
import type { TasteSignal } from './types'
import { ConnectWallet } from './components/ConnectWallet'
import { type SessionEvent } from './kernel/Visualizer'
import { useChromaSync } from './hooks/useChromaSync'
import KernelDebugHUD from './kernel/HUD'
import { useAgentContext } from './context/useAgentContext'
// import { ContextBar } from './views/ContextBar'
import { useYouTubeSearch } from './hooks/useYoutubeSearch'
import { useSoundCloudSearch } from './hooks/useSoundcloudSearch'
import { YouTubeProvider } from './hooks/useYoutubeContext'
import { usePlaybackRouter } from './hooks/usePlaybackRouter'
import { useAutoplay } from './hooks/useAutoplay'
import { useMediaSearch } from './hooks/useMediaSearch'
import { ArtistNeighborhoodView } from './views/ArtistNeighborhoodView'

// ─── CHANGE: Add 'Analyze' to ViewName in ./types.ts ─────────────────────────
// export type ViewName = 'Discover' | 'Agent' | 'Analyze'

const SNAPSHOT_HISTORY_DEPTH = 5
const SCROLL_THRESHOLD = 10
const MB_USER_AGENT = 'SOND3R/1.0.0 (https://fangorn.network)'

window.addEventListener('scroll', () => {
  document.querySelector('.header')!
    .classList.toggle('scrolled', window.scrollY > SCROLL_THRESHOLD)
}, { passive: true })

// ─── Root ──────────────────────────────────────────────────────────────────────

export default function App() {
  const [booted, setBooted] = useState(() => localStorage.getItem('booted') === 'true')
  const { ready, authenticated, login } = usePrivy()

  const handleBooted = useCallback(() => { setBooted(true) }, [])

  if (!booted) {
    return (
      <StartupView onReady={handleBooted}>
        <ConnectButton
          ready={ready}
          authenticated={authenticated}
          onLogin={login}
          onEnter={handleBooted}
        />
      </StartupView>
    )
  }

  if (!ready) return <BootSplash />

  return (
    <YouTubeProvider onEnded={() => onYtEndedRef.current()}>
      <Main />
    </YouTubeProvider>
  )
}

// ─── onYtEndedRef lives outside React so YouTubeProvider and Main can share it
const onYtEndedRef = { current: () => { } }

// ─── Main ─────────────────────────────────────────────────────────────────────

function Main() {
  const [sessionHistory, setSessionHistory] = useState<SessionEvent[]>([])
  const [entropy, setEntropy] = useState(0.2)
  const kernel = useSessionKernel({ entropy })

  const [genreWeights, setGenreWeights] = useState<Record<string, number>>({})

  const [showConnectors, setShowConnectors] = useState(false)
  const [view, setView] = useState<ViewName>('Discover')
  const [nowPlaying, setNowPlaying] = useState<null | 'player' | { track: Track; color: string }>(null)

  // ─── Analyze view: pre-populated query passed from NowPlaying ─────────────
  // When the user taps "Analyze" on a track in NowPlaying, we:
  //   1. Close NowPlaying
  //   2. Switch to the Analyze tab
  //   3. Pass the track query string as initialQuery — ArtistNeighborhoodView
  //      auto-fires its search when it receives this.
  const [analyzeQuery, setAnalyzeQuery] = useState<string | null>(null)

  const handleAnalyzeTrack = useCallback((track: Track) => {
    const q = [track.artist, track.title].filter(Boolean).join(' – ')
    setAnalyzeQuery(q)
    setView('Analyze')
    setShowConnectors(false)
    setNowPlaying(null)
  }, [])

  // Clear analyzeQuery once ArtistNeighborhoodView has consumed it,
  // so navigating away and back doesn't re-trigger the search.
  const handleAnalyzeQueryConsumed = useCallback(() => {
    setAnalyzeQuery(null)
  }, [])

  const [genreFilter, setGenreFilter] = useState('all')
  const [moodFilter, setMoodFilter] = useState('all')
  const [contextFilter, setContextFilter] = useState('all')

  const {
    tracks, loading, loadingMore, error, hasMore, loadMore,
    applyKernelQuery, search, setSearch,
    allGenres, allMoods, allContexts, allThemes,
    chromaReady, seeding, retryConnect,
  } = useChroma({ genreFilter, moodFilter, contextFilter })

  const { tracks: ytTracks, loading: ytLoading, search: ytSearch, clear: ytClear } = useMediaSearch()

  // ─── Agent context ──────────────────────────────────────────────────────────

  const { sendMessage } = useFangornAgent()

  const contextHints = useMemo(() => ({
    moods: allMoods, contexts: allContexts, genres: allGenres, themes: allThemes,
  }), [allMoods, allContexts, allGenres, allThemes])

  const agentContext = useAgentContext(sendMessage, contextHints)

  // ─── MusicBrainz fallback ───────────────────────────────────────────────────

  const [fallbackTracks, setFallbackTracks] = useState<Track[]>([])
  const [fallbackLoading, setFallbackLoading] = useState(false)

  const handleSetSearch = useCallback((q: string) => {
    setSearch(q)
    if (!q.trim()) { setFallbackTracks([]); setFallbackLoading(false) }
  }, [setSearch])

  const handleFallbackClear = useCallback(() => {
    setFallbackTracks([])
    setFallbackLoading(false)
  }, [])

  const handleMusicBrainzSearch = useCallback(async (query: string) => {
    if (!query.trim()) return
    setFallbackLoading(true)
    setFallbackTracks([])
    try {
      const fallbackQuery = `recording:"${query.trim()}"`
      const url = `https://musicbrainz.org/ws/2/recording?query=${encodeURIComponent(fallbackQuery)}&limit=25&fmt=json`
      const { body } = await (window as any).electron.ipcRenderer.invoke('fetch:proxy', {
        url,
        options: { headers: { 'User-Agent': MB_USER_AGENT } },
      })
      const data = JSON.parse(body)
      const toTrack = (rec: any): Track => {
        const artist = (rec['artist-credit'] ?? [])
          .map((c: any) => c.name ?? c.artist?.name ?? '')
          .filter(Boolean).join(', ') || 'Unknown Artist'
        const yearInt = parseInt((rec.releases?.[0]?.date ?? '').split('-')[0], 10)
        return {
          id: rec.id, trackId: rec.id, owner: '', manifestCid: '',
          title: rec.title, artist,
          year: isNaN(yearInt) ? null : yearInt,
          durationMs: rec.length ?? null,
        }
      }
      setFallbackTracks((data.recordings ?? []).map(toTrack))
    } catch (e) {
      console.warn('[mb] search failed:', e)
    } finally {
      setFallbackLoading(false)
    }
  }, [])

  // ─── Recommendations ────────────────────────────────────────────────────────

  const [recommendedTracks, setRecommendedTracks] = useState<RecommendedTracks | null>(null)
  const [recommendLoading, setRecommendLoading] = useState(false)

  const filteredTracksRef = useRef<Track[]>([])
  const playingIdRef = useRef<string | null>(null)
  const recentPlaysRef = useRef<string[]>([])
  const recentSkipsRef = useRef<string[]>([])

  const pushPlay = useCallback((label: string) => {
    recentPlaysRef.current = [label, ...recentPlaysRef.current].slice(0, SNAPSHOT_HISTORY_DEPTH)
  }, [])
  const pushSkip = useCallback((label: string) => {
    recentSkipsRef.current = [label, ...recentSkipsRef.current].slice(0, SNAPSHOT_HISTORY_DEPTH)
  }, [])

  const [visible, setVisible] = useState(true)
  useEffect(() => {
    const handler = () => setVisible(document.visibilityState === 'visible')
    document.addEventListener('visibilitychange', handler)
    return () => document.removeEventListener('visibilitychange', handler)
  }, [])

  useChromaSync({ enabled: visible })

  // ─── Signals ────────────────────────────────────────────────────────────────

  const handleSignal = useCallback(async (signal: TasteSignal) => {
    const { type, track } = signal
    if (type !== 'play' && type !== 'skip') return
    const label = `${track.artist} - ${track.title}`
    try {
      const embedding = (track as any).embedding
        ? new Float32Array((track as any).embedding)
        : await kernel.embedText(label)
      const meta = {
        trackId: track.id,
        artistId: track.artist,
        genres: (track as any).genres ?? [],
        moods: (track as any).moods ?? [],
        themes: (track as any).themes ?? [],
        contexts: (track as any).contexts ?? [],
        durationMs: track.durationMs ?? 0,
      }
      if (type === 'play') {
        kernel.onTrackPlay(embedding, meta)
        pushPlay(label)
        if (meta.genres.length > 0) {
          setGenreWeights(prev => {
            const next = { ...prev }
            for (const genre of meta.genres) next[genre] = (next[genre] ?? 0) + 1
            return next
          })
        }
      }
      if (type === 'skip') { kernel.onTrackSkip(embedding, meta); pushSkip(label) }
      setSessionHistory(h => [...h, {
        type, t: Date.now(),
        trackTitle: track.title, artistId: track.artist,
        entropySnapshot: kernel.state.entropy,
      }])
      applyKernelQuery(Array.from(kernel.getQueryVector()), true)
    } catch (e) {
      console.warn('[app] kernel signal failed:', e)
    }
  }, [kernel, pushPlay, pushSkip, applyKernelQuery])

  const handleSignalRef = useRef(handleSignal)
  handleSignalRef.current = handleSignal

  const ytTracksRef = useRef(ytTracks)
  const fallbackTracksRef = useRef(fallbackTracks)
  useEffect(() => { ytTracksRef.current = ytTracks }, [ytTracks])
  useEffect(() => { fallbackTracksRef.current = fallbackTracks }, [fallbackTracks])

  // ─── Playback router ─────────────────────────────────────────────────────────

  const { play, state: playbackState } = usePlaybackRouter({
    onSkip: useCallback((trackId: string) => {
      const skipped =
        filteredTracksRef.current.find(t => t.id === trackId) ??
        ytTracksRef.current.find(t => t.id === trackId) ??
        fallbackTracksRef.current.find(t => t.id === trackId)
      if (skipped) handleSignalRef.current({ type: 'skip', track: skipped, weight: 1.0 })
    }, []),
  })

  // ─── Autoplay ────────────────────────────────────────────────────────────────

  const { nextTrack, prefetchNext, playNext } = useAutoplay(kernel, play)

  useEffect(() => {
    if (playbackState.trackId) prefetchNext()
  }, [playbackState.trackId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    onYtEndedRef.current = playNext
  }, [playNext])

  // ─── Agent context entropy ───────────────────────────────────────────────────

  useEffect(() => {
    setEntropy(agentContext.context?.kernelOverrides?.entropy ?? 0.2)
  }, [agentContext.context])

  // ─── Startup prefetch ────────────────────────────────────────────────────────

  const startupFiredRef = useRef(false)

  const kernelTopGenres = Object.entries(genreWeights)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([genre]) => genre)

  useEffect(() => {
    if (!chromaReady) return
    if (loading) return
    if (startupFiredRef.current) return

    startupFiredRef.current = true
    const query = buildStartupQuery(kernelTopGenres)
    console.log('[app] startup prefetch →', query)

    kernel.embedText(query)
      .then(vec => applyKernelQuery(Array.from(vec), true))
      .catch(e => console.warn('[app] startup embed failed:', e))
  }, [chromaReady, loading, kernelTopGenres])

  function buildStartupQuery(kernelTopGenres?: string[]): string {
    const slot = getTimeSlot()
    const mood = pick(slot.moods)
    const genrePool = kernelTopGenres && kernelTopGenres.length > 0
      ? kernelTopGenres.slice(0, 4)
      : slot.genres
    const genre = pick(genrePool)
    return `${mood} ${genre}`
  }

  interface TimeSlot { moods: string[]; genres: string[] }

  function getTimeSlot(): TimeSlot {
    const h = new Date().getHours()
    if (h >= 5 && h < 11) return { moods: ['energetic', 'uplifting', 'focused', 'bright'], genres: ['indie pop', 'math rock', 'post-rock', 'funk', 'electronic'] }
    if (h >= 11 && h < 14) return { moods: ['driving', 'confident', 'punchy'], genres: ['alternative', 'rock', 'electronic', 'hip hop'] }
    if (h >= 14 && h < 18) return { moods: ['focused', 'deep', 'hypnotic', 'complex'], genres: ['post-rock', 'math rock', 'prog', 'industrial', 'ambient'] }
    if (h >= 18 && h < 22) return { moods: ['chill', 'warm', 'melodic', 'emotional'], genres: ['shoegaze', 'dream pop', 'indie', 'post-hardcore', 'chillwave'] }
    return { moods: ['dark', 'introspective', 'atmospheric', 'melancholic'], genres: ['darkwave', 'ambient', 'post-punk', 'industrial', 'doom'] }
  }

  function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)] }

  // ─── UI callbacks ────────────────────────────────────────────────────────────

  const handleTrackClick = useCallback((track: Track, color: string) => {
    setNowPlaying({ track, color })
  }, [])

  const handleFindSimilar = useCallback(async (query?: string) => {
    setView('Discover')
    try {
      const result = await sendMessage(query?.trim() || 'I have dream pop fever')
      const tracks = agentResultToTracks(result?.mcpResults)
      setRecommendedTracks(
        tracks.length > 0 ? { tracks, sourceId: '', sourceTitle: result?.agentMessage! } : null
      )
    } catch (e) {
      console.error('Recommendation failed:', e)
      setRecommendedTracks(null)
    } finally {
      setRecommendLoading(false)
    }
  }, [sendMessage])

  const clearRecommendations = useCallback(() => setRecommendedTracks(null), [])

  const [showScrollTop, setShowScrollTop] = useState(false)
  useEffect(() => {
    const onScroll = () => setShowScrollTop(window.scrollY > 400)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const handleFilter = useCallback((type: 'genre' | 'mood' | 'context', value: string) => {
    if (type === 'genre') setGenreFilter(value)
    if (type === 'mood') setMoodFilter(value)
    if (type === 'context') setContextFilter(value)
  }, [])

  const nowPlayingOpen = nowPlaying !== null

  // ─── Nav tabs ─────────────────────────────────────────────────────────────────
  // 'Analyze' sits after 'Agent'. It's a tool tab — distinct in purpose from
  // Discover (listener) and Agent (conversational). The listener entry point
  // is the "Analyze" button on the NowPlaying overlay (see onAnalyze below).
  const NAV_TABS: ViewName[] = ['Discover', 'Agent', 'Analyze']

  return (
    <PlayerProvider tracks={tracks}>
      <div className="app">

        <header className="header">
          <div className="header-brand">
            <span className="brand-name">SOND3R</span>
            <nav style={{ display: 'flex', gap: '16px', marginLeft: '24px' }}>
              {NAV_TABS.map(v => (
                <button
                  key={v}
                  onClick={() => { setView(v); setShowConnectors(false) }}
                  className={`app-nav-tab ${view === v && !showConnectors ? 'active' : ''}`}
                >{v}</button>
              ))}
              <button
                onClick={() => setShowConnectors(true)}
                className={`app-nav-tab ${showConnectors ? 'active' : ''}`}
              >Connectors</button>
            </nav>
            <ConnectWallet />
          </div>
        </header>

        <KernelDebugHUD state={kernel.state} history={sessionHistory} />

        <main className="main">
          {showConnectors && <ConnectorsView />}

          {!showConnectors && view === 'Discover' && (
            <BrowseView
              tracks={tracks}
              kernelTopGenres={kernelTopGenres}
              loading={loading}
              loadingMore={loadingMore}
              error={error}
              hasMore={hasMore}
              loadMore={loadMore}
              search={search}
              setSearch={handleSetSearch}
              chromaReady={chromaReady}
              seeding={seeding}
              retryConnect={retryConnect}
              recommendedTracks={recommendedTracks}
              recommendLoading={recommendLoading}
              onClearRecommendations={clearRecommendations}
              onCallAgent={handleFindSimilar}
              onFilteredChange={f => { filteredTracksRef.current = f }}
              onPlayingIdChange={id => { playingIdRef.current = id }}
              onSignal={handleSignal}
              onTrackClick={handleTrackClick}
              genreFilter={genreFilter}
              moodFilter={moodFilter}
              contextFilter={contextFilter}
              onGenreFilter={setGenreFilter}
              onMoodFilter={setMoodFilter}
              onContextFilter={setContextFilter}
              allGenres={allGenres}
              allMoods={allMoods}
              allContexts={allContexts}
              fallbackTracks={fallbackTracks}
              fallbackLoading={fallbackLoading}
              onFallbackSearch={handleMusicBrainzSearch}
              onFallbackClear={handleFallbackClear}
              // contextBar={
              //   <ContextBar
              //     context={agentContext.context}
              //     loading={agentContext.loading}
              //     error={agentContext.error}
              //     onActivate={agentContext.activate}
              //     onClear={agentContext.clear}
              //   />
              // }
              ytTracks={ytTracks}
            ytLoading={ytLoading}
              onYtSearch={ytSearch}
              onYtClear={ytClear}
              playbackState={playbackState}
              onPlay={play}
            />
          )}

          {!showConnectors && view === 'Agent' && <AgentView />}

          {/* ── Analyze view ────────────────────────────────────────────────── */}
          {/* Mounted/unmounted with the tab — state resets on each visit unless
              initialQuery is passed, in which case it auto-fires a fresh search. */}
          {!showConnectors && view === 'Analyze' && (
            <ArtistNeighborhoodView
              initialQuery={analyzeQuery ?? undefined}
              onQueryConsumed={handleAnalyzeQueryConsumed}
            />
          )}
        </main>

        <PlayerBar
          onTrackClick={handleTrackClick}
          hidden={nowPlayingOpen}
          playbackState={playbackState}
          nextTrack={nextTrack}
          onPlayNext={playNext}
        />

        {nowPlayingOpen && createPortal(
          <NowPlaying
            playbackState={playbackState}
            onPlay={play}
            onCollapse={() => setNowPlaying(null)}
            track={nowPlaying !== 'player' ? nowPlaying.track : undefined}
            trackColor={nowPlaying !== 'player' ? nowPlaying.color : undefined}
            onFilter={(type, value) => { handleFilter(type, value); setNowPlaying(null) }}
            onCallAgent={handleFindSimilar}
            onTrackSelect={(track, color) => setNowPlaying({ track, color: color ?? '' })}
            // ── New: opens Analyze tab pre-loaded with this track ──────────
            onAnalyze={handleAnalyzeTrack}
          />,
          document.body
        )}

        {showScrollTop && createPortal(
          <button
            className="scroll-top-btn"
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            title="Back to top"
          >↑</button>,
          document.body
        )}

      </div>
    </PlayerProvider>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

interface ConnectButtonProps {
  ready: boolean; authenticated: boolean; onLogin: () => void; onEnter: () => void
}

function ConnectButton({ ready, authenticated, onLogin, onEnter }: ConnectButtonProps) {
  const [hovered, setHovered] = useState(false)
  const label = !ready ? '...' : authenticated ? 'enter' : 'connect'
  return (
    <button
      onClick={() => { if (!ready) return; authenticated ? onEnter() : onLogin() }}
      disabled={!ready}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: 'relative', zIndex: 1, marginTop: '8px',
        color: 'rgba(167,139,250,0.85)', background: 'rgba(167,139,250,0.08)',
        fontFamily: '"DM Mono", "Courier New", monospace', fontSize: '11px',
        letterSpacing: '0.2em', textTransform: 'uppercase', padding: '10px 28px',
        cursor: ready ? 'pointer' : 'default', transition: 'all 0.25s ease',
        boxShadow: hovered
          ? '0 0 20px rgba(199,232,179,0.12), inset 0 0 12px rgba(199,232,179,0.04)'
          : 'none',
      }}
    >{label}</button>
  )
}

function BootSplash() {
  return (
    <div style={{ position: 'fixed', inset: 0, background: '#0a0f0a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ color: '#a3c9a8', animation: 'fangornBootPulse 1.4s ease-in-out infinite' }}>
        <svg viewBox="0 0 40 40" width="32" height="32" aria-hidden="true">
          <path d="M20 4 Q 32 14, 28 26 Q 24 34, 20 36 Q 16 34, 12 26 Q 8 14, 20 4 Z" fill="none" stroke="currentColor" strokeWidth="1" />
          <path d="M20 6 L 20 34" stroke="currentColor" strokeWidth="0.5" opacity="0.6" />
          <path d="M20 14 L 15 18 M20 18 L 14 22 M20 22 L 15 26" stroke="currentColor" strokeWidth="0.5" opacity="0.5" />
          <path d="M20 14 L 25 18 M20 18 L 26 22 M20 22 L 25 26" stroke="currentColor" strokeWidth="0.5" opacity="0.5" />
        </svg>
      </div>
      <style>{`@keyframes fangornBootPulse { 0%,100%{opacity:0.3;transform:scale(1)} 50%{opacity:1;transform:scale(1.08)} }`}</style>
    </div>
  )
}