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
import { useSpotify } from './hooks/useSpotify'
import { SpotifyProvider } from './providers/SpotifyProvider'
import { useSessionKernel } from './hooks/useSessionKernel'
import { useSpotifyConfig } from './hooks/useSpotifyConfig'
import { ConnectorsView } from './views/ConnectorsView'
import { useAmbientAgent } from './hooks/useAmbientAgent'
import type { KernelSnapshot } from './hooks/useAmbientAgent'
import type { TasteSignal } from './types'
import { ConnectWallet } from './components/ConnectWallet'

const SNAPSHOT_HISTORY_DEPTH = 5
const SCROLL_THRESHOLD = 10

window.addEventListener('scroll', () => {
  document.querySelector('.header')!
    .classList.toggle('scrolled', window.scrollY > SCROLL_THRESHOLD)
}, { passive: true })

export default function App() {

  const { ready, authenticated, login } = usePrivy()
  const { config, hasConfig, saveConfig } = useSpotifyConfig()

  const [entropy, setEntropy] = useState(0.2)
  const kernel = useSessionKernel({ entropy })

  const [booted, setBooted]         = useState(() => localStorage.getItem('booted') === 'true')
  const [showConnectors, setShowConnectors] = useState(false)
  const [nudgeDismissed, setNudgeDismissed] = useState(() => localStorage.getItem('sond3r:nudge:spotify') === '1')
  const [view, setView]             = useState<ViewName>('Discover')

  const [nowPlaying, setNowPlaying] = useState<null | 'player' | { track: Track; color: string }>(null)

  const [genreFilter,   setGenreFilter]   = useState('all')
  const [moodFilter,    setMoodFilter]    = useState('all')
  const [contextFilter, setContextFilter] = useState('all')

  const {
    tracks, loading, loadingMore, error, hasMore, loadMore,
    applyKernelQuery, search, setSearch,
    allGenres, allMoods, allContexts,
  } = useChroma({ genreFilter, moodFilter, contextFilter })

  const [recommendedTracks, setRecommendedTracks] = useState<RecommendedTracks | null>(null)
  const [recommendLoading, setRecommendLoading]   = useState(false)
  const { sendMessage } = useFangornAgent()

  type AutoplayMode = 'none' | 'sequential' | 'agent' | 'similar'
  const [autoplayMode, setAutoplayMode] = useState<AutoplayMode>('agent')
  const filteredTracksRef = useRef<Track[]>([])
  const playingIdRef      = useRef<string | null>(null)
  const spotifyRef        = useRef<ReturnType<typeof useSpotify> | null>(null)
  const seededRef         = useRef(false)

  const recentPlaysRef = useRef<string[]>([])
  const recentSkipsRef = useRef<string[]>([])

  const pushPlay = useCallback((label: string) => {
    recentPlaysRef.current = [label, ...recentPlaysRef.current].slice(0, SNAPSHOT_HISTORY_DEPTH)
  }, [])

  const pushSkip = useCallback((label: string) => {
    recentSkipsRef.current = [label, ...recentSkipsRef.current].slice(0, SNAPSHOT_HISTORY_DEPTH)
  }, [])

  const kernelSnapshot = useMemo<KernelSnapshot>(() => ({
    entropy,
    centroidLabel:   (() => { const d = kernel.getDiagnostics(); return typeof d === 'string' ? d : JSON.stringify(d) })(),
    recentPlays:     [...recentPlaysRef.current],
    recentSkips:     [...recentSkipsRef.current],
    uncertaintyHint: undefined,
  }), [entropy, kernel])

  const ambientAgent = useAmbientAgent({
    kernel: kernelSnapshot,
    enabled: autoplayMode === 'agent',
  })

  useEffect(() => {
    if (autoplayMode === 'agent') ambientAgent.prime()
  }, [autoplayMode]) // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Playback ────────────────────────────────────────────────────────────────

  const handleNext = useCallback(() => {
    const tracks = filteredTracksRef.current
    const idx  = tracks.findIndex(t => t.id === playingIdRef.current)
    const next = tracks[idx + 1]
    if (next) {
      playingIdRef.current = next.id
      spotifyRef.current?.searchAndPlay(`${next.title} ${next.artist}`)
    }
  }, [])

  const handlePrev = useCallback(() => {
    const tracks = filteredTracksRef.current
    const idx  = tracks.findIndex(t => t.id === playingIdRef.current)
    const prev = tracks[idx - 1]
    if (prev) {
      playingIdRef.current = prev.id
      spotifyRef.current?.searchAndPlay(`${prev.title} ${prev.artist}`)
    }
  }, [])

  const handleTrackEnd = useCallback(() => {
    if (autoplayMode === 'none') return

    if (autoplayMode === 'sequential') { handleNext(); return }

    if (autoplayMode === 'agent') {
      const next = ambientAgent.consume()
      if (next) {
        playingIdRef.current = next.id
        spotifyRef.current?.searchAndPlay(`${next.title} ${next.artist}`)
      } else {
        console.warn('[ambient] queue empty on track end, falling back to sequential')
        handleNext()
      }
      return
    }
  }, [autoplayMode, handleNext, ambientAgent])

  const spotify = useSpotify({ onTrackEnd: handleTrackEnd })
  useEffect(() => { spotifyRef.current = spotify }, [spotify])

  useEffect(() => {
    if (!spotify.connected || seededRef.current) return
    seededRef.current = true
    kernel.seedFromSpotify(spotify.spotifyFetch).then((q) => {
      if (!q) return
      applyKernelQuery(Array.from(q))
    })
  }, [spotify.connected]) // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Signals ─────────────────────────────────────────────────────────────────

  const handleSignal = useCallback(async (signal: TasteSignal) => {
    const { type, track } = signal
    if (type !== 'play' && type !== 'skip') return
    const label = `${track.artist} - ${track.title}`
    try {
      const embedding = (track as any).embedding
        ? new Float32Array((track as any).embedding)
        : await kernel.embedText(label)
      if (type === 'play') { kernel.onTrackPlay(embedding); pushPlay(label) }
      if (type === 'skip') { kernel.onTrackSkip(embedding); pushSkip(label) }
    } catch (e) {
      console.warn('[app] kernel signal failed:', e)
    }
  }, [kernel, pushPlay, pushSkip])

  // ─── Connectors callbacks ─────────────────────────────────────────────────────
  // ConnectorsView manages its own localStorage, but we still call saveConfig
  // so useSpotifyConfig's hasConfig reactive flag updates in-session.

  const handleSpotifyConfigSaved = useCallback((cfg: { clientId: string; clientSecret: string }) => {
    saveConfig(cfg)           // keeps useSpotifyConfig in sync
    setBooted(true)
    // setShowConnectors(false)
  }, [saveConfig])

  const handleConnectorsBack = useCallback(() => {
    setShowConnectors(false)
  }, [])

  // ─── Misc ─────────────────────────────────────────────────────────────────────

  const handleBooted = useCallback(() => { setBooted(true) }, [])

  const dismissNudge = useCallback(() => {
    localStorage.setItem('sond3r:nudge:spotify', '1')
    setNudgeDismissed(true)
  }, [])

  const handleFindSimilar = useCallback(async (query?: string) => {
    setView('Discover')
    try {
      const userIntent = query?.trim() || 'I have dream pop fever'
      const result = await sendMessage(userIntent)
      const tracks = agentResultToTracks(result?.mcpResults)
      const agentMessage = result?.agentMessage
      setRecommendedTracks(tracks.length > 0 ? { tracks, sourceId: '', sourceTitle: agentMessage! } : null)
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

  const scrollToTop = useCallback(() => window.scrollTo({ top: 0, behavior: 'smooth' }), [])

  const handleFilter = useCallback((type: 'genre' | 'mood' | 'context', value: string) => {
    if (type === 'genre')   setGenreFilter(value)
    if (type === 'mood')    setMoodFilter(value)
    if (type === 'context') setContextFilter(value)
  }, [])

  // ─── Guards ───────────────────────────────────────────────────────────────────

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

  const nowPlayingOpen = nowPlaying !== null

  return (
    <SpotifyProvider value={{ ...spotify, onNext: handleNext, onPrev: handlePrev, onSignal: handleSignal }}>
      <PlayerProvider tracks={tracks}>
        <div className="app">
          <header className="header">
            <div className="header-brand">
              <span className="brand-name">SOND3R</span>

              <nav style={{ display: 'flex', gap: '16px', marginLeft: '24px'}}>
                {(['Discover', 'Agent'] as ViewName[]).map((v) => (
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

          <main className="main">
            {showConnectors && (
              <ConnectorsView onSpotifyConfigSaved={handleSpotifyConfigSaved} />
            )}
            {!showConnectors && view === 'Discover' && (
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
                onFilteredChange={f => { filteredTracksRef.current = f }}
                onPlayingIdChange={id => { playingIdRef.current = id }}
                onSignal={handleSignal}
                onTrackClick={(track, color) => setNowPlaying({ track, color })}
                genreFilter={genreFilter}
                moodFilter={moodFilter}
                contextFilter={contextFilter}
                onGenreFilter={setGenreFilter}
                onMoodFilter={setMoodFilter}
                onContextFilter={setContextFilter}
                allGenres={allGenres}
                allMoods={allMoods}
                allContexts={allContexts}
                ambientStatus={ambientAgent.status}
                ambientQueueSize={ambientAgent.queue.length}
                ambientLastReason={ambientAgent.lastReason ?? undefined}
                // Spotify nudge — shown only when not configured and not dismissed
                showSpotifyNudge={!hasConfig && !nudgeDismissed}
                onSpotifyNudgeConnect={() => setShowConnectors(true)}
                onSpotifyNudgeDismiss={dismissNudge}
              />
            )}
            {!showConnectors && view === 'Agent' && <AgentView />}
          </main>

          <PlayerBar
            onExpand={() => setNowPlaying('player')}
            hidden={nowPlayingOpen}
          />

          {nowPlayingOpen && createPortal(
            <NowPlaying
              onCollapse={() => setNowPlaying(null)}
              lastPollTime={spotify.lastPollTime}
              track={nowPlaying !== 'player' ? nowPlaying.track : undefined}
              trackColor={nowPlaying !== 'player' ? nowPlaying.color : undefined}
              onFilter={(type, value) => { handleFilter(type, value); setNowPlaying(null) }}
              onCallAgent={handleFindSimilar}
            />,
            document.body
          )}

          {showScrollTop && createPortal(
            <button className="scroll-top-btn" onClick={scrollToTop} title="Back to top">↑</button>,
            document.body
          )}
        </div>
      </PlayerProvider>
    </SpotifyProvider>
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
        boxShadow: hovered ? '0 0 20px rgba(199,232,179,0.12), inset 0 0 12px rgba(199,232,179,0.04)' : 'none',
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