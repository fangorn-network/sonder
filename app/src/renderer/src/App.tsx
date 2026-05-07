import { useCallback, useEffect, useRef, useState } from 'react'
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
import { useTasteProfile } from './hooks/useTasteProfile'
import { useSpotifyConfig } from './hooks/useSpotifyConfig'
import { SpotifyConfigView } from './views/SpotifyConfigView'

export default function App() {

  const { ready, authenticated, login } = usePrivy()
  const { profile, applySignal, seedFromSpotify, toChromaQuery } = useTasteProfile()
  const { config, hasConfig, saveConfig } = useSpotifyConfig()

  const [booted, setBooted] = useState(() => localStorage.getItem('booted') === 'true')
  const [showConfig, setShowConfig] = useState(false)
  const [view, setView] = useState<ViewName>('Discover')

  // NowPlaying overlay state — null = closed, 'player' = from player bar, Track = from card
  const [nowPlaying, setNowPlaying] = useState<null | 'player' | { track: Track; color: string }>(null)

  const { tracks, loading, loadingMore, error, hasMore, loadMore, search, setSearch } = useChroma({ initialQuery: toChromaQuery() })
  const [recommendedTracks, setRecommendedTracks] = useState<RecommendedTracks | null>(null)
  const [recommendLoading, setRecommendLoading] = useState(false)
  const { sendMessage } = useFangornAgent()

  type AutoplayMode = 'none' | 'sequential' | 'agent' | 'similar'
  const [autoplayMode, setAutoplayMode] = useState<AutoplayMode>('sequential')
  const filteredTracksRef = useRef<Track[]>([])
  const playingIdRef = useRef<string | null>(null)
  const spotifyRef = useRef<ReturnType<typeof useSpotify> | null>(null)

  // active genre filters — lifted so NowPlaying can close and filter
  const [genreFilter, setGenreFilter] = useState('all')
  const [moodFilter, setMoodFilter] = useState('all')
  const [contextFilter, setContextFilter] = useState('all')

  const handleNext = useCallback(() => {
    const tracks = filteredTracksRef.current
    const idx = tracks.findIndex(t => t.id === playingIdRef.current)
    const next = tracks[idx + 1]
    if (next) {
      playingIdRef.current = next.id
      spotifyRef.current?.searchAndPlay(`${next.title} ${next.artist}`)
    }
  }, [])

  const handlePrev = useCallback(() => {
    const tracks = filteredTracksRef.current
    const idx = tracks.findIndex(t => t.id === playingIdRef.current)
    const prev = tracks[idx - 1]
    if (prev) {
      playingIdRef.current = prev.id
      spotifyRef.current?.searchAndPlay(`${prev.title} ${prev.artist}`)
    }
  }, [])

  const handleTrackEnd = useCallback(() => {
    if (autoplayMode === 'none') return
    if (autoplayMode === 'sequential') handleNext()
  }, [autoplayMode, handleNext])

  const spotify = useSpotify({ onTrackEnd: handleTrackEnd })

  useEffect(() => { spotifyRef.current = spotify }, [spotify])

  const prevConnected = useRef(false)

  useEffect(() => {
    // if (spotify.connected && !prevConnected.current && !profile.seededFromSpotify) {
    // TODO: experiment - reseed on each connection (they may have listened to music outside of fangorn between visits)
    if (spotify.connected) {
      console.log('seeding from spotify ')
      seedFromSpotify(spotify.spotifyFetch)
    } else {
      console.log('NOT seeding anything')
    }
    prevConnected.current = spotify.connected
  }, [spotify.connected])

  const handleBooted = useCallback(() => { setBooted(true) }, [])

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
    if (type === 'genre') setGenreFilter(value)
    if (type === 'mood') setMoodFilter(value)
    if (type === 'context') setContextFilter(value)
  }, [])

  // ── Config gate ──────────────────────────────────────────────────────
  if ((booted && !hasConfig) || showConfig) {
    return (
      <SpotifyConfigView
        initial={config}
        onSave={(cfg) => { saveConfig(cfg); setShowConfig(false); setBooted(true) }}
        onBack={hasConfig ? () => setShowConfig(false) : undefined}
      />
    )
  }

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
    <SpotifyProvider value={{ ...spotify, onNext: handleNext, onPrev: handlePrev, onSignal: applySignal }}>
      <PlayerProvider tracks={tracks}>
        <div className="app">
          <header className="header">
            <div className="header-brand">
              <span className="brand-name">SOND3R</span>
              <nav style={{ display: 'flex', gap: '16px', marginLeft: '24px' }}>
                {(['Discover', 'Agent'] as ViewName[]).map((v) => (
                  <button
                    key={v}
                    onClick={() => setView(v)}
                    style={{
                      background: 'none',
                      border: 'none',
                      fontFamily: '"DM Mono", "Courier New", monospace',
                      fontSize: '10px',
                      letterSpacing: '0.2em',
                      textTransform: 'uppercase' as const,
                      color: view === v ? 'var(--fg2)' : 'var(--fg4)',
                      cursor: 'pointer',
                      padding: '4px 0',
                      borderBottom: view === v ? '1px solid var(--fg3)' : '1px solid transparent',
                      transition: 'all 0.2s ease',
                    }}
                  >
                    {v}
                  </button>
                ))}
              </nav>
            <button
              onClick={() => setShowConfig(true)}
              title="Spotify settings"
              style={{
                background: 'none', border: 'none', color: 'var(--fg4)',
                fontSize: '16px', cursor: 'pointer', padding: '4px 8px',
                lineHeight: 1, transition: 'color var(--t1)',
              }}
              onMouseEnter={e => (e.currentTarget.style.color = 'var(--fg2)')}
              onMouseLeave={e => (e.currentTarget.style.color = 'var(--fg4)')}
            >⚙</button>
            </div>

          </header>

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
                onFilteredChange={f => { filteredTracksRef.current = f }}
                onPlayingIdChange={id => { playingIdRef.current = id }}
                onSignal={applySignal}
                onTrackClick={(track, color) => setNowPlaying({ track, color })}
                genreFilter={genreFilter}
                moodFilter={moodFilter}
                contextFilter={contextFilter}
                onGenreFilter={setGenreFilter}
                onMoodFilter={setMoodFilter}
                onContextFilter={setContextFilter}
              />
            )}
            {view === 'Agent' && (<AgentView/>)}
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
          <path d="M20 4 Q 32 14, 28 26 Q 24 34, 20 36 Q 16 34, 12 26 Q 8 14, 20 4 Z" fill="none" stroke="currentColor" strokeWidth="1"/>
          <path d="M20 6 L 20 34" stroke="currentColor" strokeWidth="0.5" opacity="0.6"/>
          <path d="M20 14 L 15 18 M20 18 L 14 22 M20 22 L 15 26" stroke="currentColor" strokeWidth="0.5" opacity="0.5"/>
          <path d="M20 14 L 25 18 M20 18 L 26 22 M20 22 L 25 26" stroke="currentColor" strokeWidth="0.5" opacity="0.5"/>
        </svg>
      </div>
      <style>{`@keyframes fangornBootPulse { 0%,100%{opacity:0.3;transform:scale(1)} 50%{opacity:1;transform:scale(1.08)} }`}</style>
    </div>
  )
}