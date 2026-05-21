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
import type { TasteSignal } from './types'
import { ConnectWallet } from './components/ConnectWallet'
import { type SessionEvent } from './kernel/Visualizer'
import { useChromaSync } from './hooks/useChromaSync'
import KernelDebugHUD from './kernel/HUD'
import { AgentContext, useAgentContext } from './context/useAgentContext'
import { rankWithContext } from './context/ContextScoring'
import { ContextBar } from './views/ContextBar'
import { useYouTubeSearch } from './hooks/useYoutubeSearch'
import { YouTubeProvider } from './hooks/useYoutubeContext'
import { usePlaybackRouter } from './hooks/usePlaybackRouter'
import { useAutoplay } from './hooks/useAutoplay'

const SNAPSHOT_HISTORY_DEPTH = 5
const SCROLL_THRESHOLD = 10
const RECENTLY_PLAYED_MAX = 8
const MB_USER_AGENT = 'SOND3R/1.0.0 (https://fangorn.network)'

window.addEventListener('scroll', () => {
  document.querySelector('.header')!
    .classList.toggle('scrolled', window.scrollY > SCROLL_THRESHOLD)
}, { passive: true })

// ─── Root ──────────────────────────────────────────────────────────────────────

export default function App() {
  const { hasConfig, saveConfig } = useSpotifyConfig()
  const [booted, setBooted] = useState(() => localStorage.getItem('booted') === 'true')
  const { ready, authenticated, login } = usePrivy()

  const handleBooted = useCallback(() => { setBooted(true) }, [])
  const handleSpotifyConfigSaved = useCallback((cfg: { clientId: string; clientSecret: string }) => {
    saveConfig(cfg)
    setBooted(true)
  }, [saveConfig])

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
    <SpotifyProviderShell
      onSpotifyConfigSaved={handleSpotifyConfigSaved}
      hasConfig={hasConfig}
    />
  )
}

// ─── SpotifyProviderShell ──────────────────────────────────────────────────────

function SpotifyProviderShell({
  onSpotifyConfigSaved,
  hasConfig,
}: {
  onSpotifyConfigSaved: (cfg: { clientId: string; clientSecret: string }) => void
  hasConfig: boolean
}) {
  const onTrackEndRef  = useRef<() => void>(() => {})
  const onYtEndedRef   = useRef<() => void>(() => {})

  const spotify = useSpotify({ onTrackEnd: () => onTrackEndRef.current() })

  return (
    <SpotifyProvider value={{ ...spotify }}>
      <YouTubeProvider onEnded={() => onYtEndedRef.current()}>
        <AppContent
          spotify={spotify}
          onTrackEndRef={onTrackEndRef}
          onYtEndedRef={onYtEndedRef}
          onSpotifyConfigSaved={onSpotifyConfigSaved}
          hasConfig={hasConfig}
        />
      </YouTubeProvider>
    </SpotifyProvider>
  )
}

// ─── AppContent ────────────────────────────────────────────────────────────────

function AppContent({
  spotify,
  onTrackEndRef,
  onYtEndedRef,
  onSpotifyConfigSaved,
  hasConfig,
}: {
  spotify: ReturnType<typeof useSpotify>
  onTrackEndRef: React.MutableRefObject<() => void>
  onYtEndedRef:  React.MutableRefObject<() => void>
  onSpotifyConfigSaved: (cfg: { clientId: string; clientSecret: string }) => void
  hasConfig: boolean
}) {
  const [sessionHistory, setSessionHistory] = useState<SessionEvent[]>([])
  const [entropy, setEntropy] = useState(0.2)
  const kernel = useSessionKernel({ entropy })

  const [showConnectors, setShowConnectors] = useState(false)
  const [nudgeDismissed, setNudgeDismissed] = useState(
    () => localStorage.getItem('sond3r:nudge:spotify') === '1'
  )
  const [view, setView] = useState<ViewName>('Discover')
  const [nowPlaying, setNowPlaying] = useState<null | 'player' | { track: Track; color: string }>(null)

  const [genreFilter, setGenreFilter] = useState('all')
  const [moodFilter, setMoodFilter] = useState('all')
  const [contextFilter, setContextFilter] = useState('all')

  const {
    tracks, loading, loadingMore, error, hasMore, loadMore,
    applyKernelQuery, search, setSearch,
    allGenres, allMoods, allContexts, allThemes,
    chromaReady, seeding, retryConnect,
  } = useChroma({ genreFilter, moodFilter, contextFilter })

  const { ytTracks, ytLoading, search: ytSearch, clear: ytClear } = useYouTubeSearch()

  // ─── Agent context ───────────────────────────────────────────────────────────

  const { sendMessage } = useFangornAgent()

  const contextHints = useMemo(() => ({
    moods: allMoods, contexts: allContexts, genres: allGenres, themes: allThemes,
  }), [allMoods, allContexts, allGenres, allThemes])

  const agentContext = useAgentContext(sendMessage, contextHints)

  // ─── MusicBrainz fallback search ────────────────────────────────────────────

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
      const headers = { 'User-Agent': MB_USER_AGENT }
      const buildRecordingQuery = (input: string) => {
        const q = input.trim()
        const parts = q.split(/\s+/)
        if (parts.length >= 3) {
          const artist = parts.slice(-2).join(' ')
          const title = parts.slice(0, -2).join(' ')
          return `recording:"${title}" AND artist:"${artist}"`
        }
        return `recording:"${q}"`
      }
      const fallbackQuery = `recording:"${query.trim()}"`
      const [structuredResp, fallbackResp] = await Promise.all([
        fetch(`https://musicbrainz.org/ws/2/recording?query=${encodeURIComponent(buildRecordingQuery(query))}&limit=25&fmt=json`, { headers }),
        fetch(`https://musicbrainz.org/ws/2/recording?query=${encodeURIComponent(fallbackQuery)}&limit=10&fmt=json`, { headers }),
      ])
      const [structuredData, fallbackData] = await Promise.all([
        structuredResp.ok ? structuredResp.json() : { recordings: [] },
        fallbackResp.ok ? fallbackResp.json() : { recordings: [] },
      ])
      const toTrack = (rec: any): Track => {
        const artist = (rec['artist-credit'] ?? [])
          .map((c: any) => c.name ?? c.artist?.name ?? '')
          .filter(Boolean).join(', ') || 'Unknown Artist'
        const yearInt = parseInt((rec.releases?.[0]?.date ?? '').split('-')[0], 10)
        return {
          id: rec.id, trackId: rec.id, owner: '', manifestCid: '',
          title: rec.title, artist, spotifyTrackId: null,
          year: isNaN(yearInt) ? null : yearInt,
          durationMs: rec.length ?? null,
        }
      }
      const seen = new Set<string>()
      const merged: Track[] = []
      for (const rec of [...(structuredData.recordings ?? []), ...(fallbackData.recordings ?? [])]) {
        if (!seen.has(rec.id)) { seen.add(rec.id); merged.push(toTrack(rec)) }
      }
      setFallbackTracks(merged)
    } catch (e) {
      console.warn('[mb-fallback] search failed:', e)
      setFallbackTracks([])
    } finally {
      setFallbackLoading(false)
    }
  }, [])

  // ─── Recommendations ─────────────────────────────────────────────────────────

  const [recommendedTracks, setRecommendedTracks] = useState<RecommendedTracks | null>(null)
  const [recommendLoading, setRecommendLoading] = useState(false)

  type AutoplayMode = 'none' | 'sequential' | 'agent' | 'similar'
  const [autoplayMode] = useState<AutoplayMode>('agent')
  const filteredTracksRef = useRef<Track[]>([])
  const playingIdRef = useRef<string | null>(null)
  const spotifyRef = useRef<ReturnType<typeof useSpotify> | null>(null)
  const seededRef = useRef(false)
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

  // ─── Signals ─────────────────────────────────────────────────────────────────

  const handleSignal = useCallback(async (signal: TasteSignal) => {
    const { type, track } = signal
    if (type !== 'play' && type !== 'skip') return
    const label = `${track.artist} - ${track.title}`
    try {
      const embedding = (track as any).embedding
        ? new Float32Array((track as any).embedding)
        : await kernel.embedText(label)
      const meta = {
        trackId: track.id, artistId: track.artist,
        genres: (track as any).genres ?? [],
        moods: (track as any).moods ?? [],
        themes: (track as any).themes ?? [],
        contexts: (track as any).contexts ?? [],
        durationMs: track.durationMs ?? 0,
      }
      if (type === 'play') { kernel.onTrackPlay(embedding, meta); pushPlay(label) }
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

  // ─── Playback router ──────────────────────────────────────────────────────────

  const { play, pause, stop, state: playbackState } = usePlaybackRouter('auto', {
    onSkip: useCallback((trackId: string) => {
      const skipped =
        filteredTracksRef.current.find(t => t.id === trackId) ??
        ytTracksRef.current.find(t => t.id === trackId) ??
        fallbackTracksRef.current.find(t => t.id === trackId)
      if (skipped) {
        handleSignalRef.current({ type: 'skip', track: skipped, weight: 1.0 })
      }
    }, []),
  })

  // ─── Autoplay ─────────────────────────────────────────────────────────────────

  const { nextTrack, prefetchNext, playNext } = useAutoplay(kernel, play)

  // Prefetch next track whenever a new track starts playing
  useEffect(() => {
    if (playbackState.trackId) prefetchNext()
  }, [playbackState.trackId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Wire YouTube onEnded → playNext
  useEffect(() => {
    onYtEndedRef.current = playNext
  }, [playNext, onYtEndedRef])

  // ─── Playback internals ───────────────────────────────────────────────────────

  const recentlyPlayedIdsRef = useRef<Set<string>>(new Set())

  const handleNext = useCallback(() => {
    const raw = filteredTracksRef.current
    if (!raw.length) return
    if (playingIdRef.current) {
      recentlyPlayedIdsRef.current.add(playingIdRef.current)
      if (recentlyPlayedIdsRef.current.size > RECENTLY_PLAYED_MAX) {
        const oldest = recentlyPlayedIdsRef.current.values().next().value
        recentlyPlayedIdsRef.current.delete(oldest!)
      }
    }
    const ranked = rankWithContext(raw, agentContext.context)
    const next =
      ranked.find(t => t.id !== playingIdRef.current && !recentlyPlayedIdsRef.current.has(t.id)) ??
      ranked.find(t => t.id !== playingIdRef.current)
    if (!next) return
    playingIdRef.current = next.id
    handleSignal({ type: 'play', track: next, weight: 1.0 })
    spotifyRef.current?.searchAndPlay(`${next.title} ${next.artist}`)
  }, [handleSignal, agentContext.context])

  const handleNextRef = useRef(handleNext)
  useEffect(() => { handleNextRef.current = handleNext }, [handleNext])

  // Spotify onTrackEnd → kernel-driven autoplay
  useEffect(() => {
    onTrackEndRef.current = () => {
      if (autoplayMode !== 'none') playNext()
    }
  }, [autoplayMode, playNext, onTrackEndRef])

  const prevContextRef = useRef<AgentContext | null>(null)
  useEffect(() => {
    setEntropy(agentContext.context?.kernelOverrides?.entropy ?? 0.2)
    if (agentContext.context !== null && prevContextRef.current === null) handleNextRef.current()
    prevContextRef.current = agentContext.context
  }, [agentContext.context]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSkip = useCallback(() => {
    const currentTrack = filteredTracksRef.current.find(t => t.id === playingIdRef.current)
    if (currentTrack) handleSignal({ type: 'skip', track: currentTrack, weight: 1.0 })
    playNext()
  }, [handleSignal, playNext])

  const handlePrev = useCallback(() => {
    const list = filteredTracksRef.current
    const idx = list.findIndex(t => t.id === playingIdRef.current)
    const prev = list[idx - 1]
    if (prev) {
      playingIdRef.current = prev.id
      spotifyRef.current?.searchAndPlay(`${prev.title} ${prev.artist}`)
    }
  }, [])

  useEffect(() => { spotifyRef.current = spotify }, [spotify])

  useEffect(() => {
    if (!spotify.connected || seededRef.current) return
    seededRef.current = true
    kernel.seedFromSpotify(spotify.spotifyFetch).then(q => {
      if (q) applyKernelQuery(Array.from(q), true)
    })
  }, [spotify.connected]) // eslint-disable-line react-hooks/exhaustive-deps

  // ─── UI callbacks ─────────────────────────────────────────────────────────────

  const handleTrackClick = useCallback((track: Track, color: string) => {
    recentlyPlayedIdsRef.current.clear()
    setNowPlaying({ track, color })
  }, [])

  const dismissNudge = useCallback(() => {
    localStorage.setItem('sond3r:nudge:spotify', '1')
    setNudgeDismissed(true)
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

  return (
    <SpotifyProvider value={{ ...spotify, onNext: handleSkip, onPrev: handlePrev, onSignal: handleSignal }}>
      <PlayerProvider tracks={tracks}>
        <div className="app">

          <header className="header">
            <div className="header-brand">
              <span className="brand-name">SOND3R</span>
              <nav style={{ display: 'flex', gap: '16px', marginLeft: '24px' }}>
                {(['Discover', 'Agent'] as ViewName[]).map(v => (
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
            {showConnectors && (
              <ConnectorsView onSpotifyConfigSaved={onSpotifyConfigSaved} />
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
                showSpotifyNudge={!hasConfig && !nudgeDismissed}
                onSpotifyNudgeConnect={() => setShowConnectors(true)}
                onSpotifyNudgeDismiss={dismissNudge}
                fallbackTracks={fallbackTracks}
                fallbackLoading={fallbackLoading}
                onFallbackSearch={handleMusicBrainzSearch}
                onFallbackClear={handleFallbackClear}
                contextBar={
                  <ContextBar
                    context={agentContext.context}
                    loading={agentContext.loading}
                    error={agentContext.error}
                    onActivate={agentContext.activate}
                    onClear={agentContext.clear}
                  />
                }
                ytTracks={ytTracks}
                ytLoading={ytLoading}
                onYtSearch={ytSearch}
                onYtClear={ytClear}
                playbackState={playbackState}
                onPlay={play}
              />
            )}
            {!showConnectors && view === 'Agent' && <AgentView />}
          </main>

          <PlayerBar
            onExpand={() => setNowPlaying('player')}
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
              lastPollTime={spotify.lastPollTime}
              track={nowPlaying !== 'player' ? nowPlaying.track : undefined}
              trackColor={nowPlaying !== 'player' ? nowPlaying.color : undefined}
              onFilter={(type, value) => { handleFilter(type, value); setNowPlaying(null) }}
              onCallAgent={handleFindSimilar}
              onTrackSelect={(track, color) => setNowPlaying({ track, color: color ?? '' })}
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