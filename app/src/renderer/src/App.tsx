import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AgentView } from './views/AgentView'
import type { Track } from './types'
import './App.css'
import { NowPlaying } from './components/NowPlaying'
import { NowPlayingStrip } from './components/NowPlayingStrip'
import { createPortal } from 'react-dom'
import { usePrivy } from '@privy-io/react-auth'
import { PlayerProvider } from './providers/PlayerProvider'
import { SpotifyAuthProvider } from './providers/SpotifyAuthProvider'
import { SpotifyProvider, useSpotifyContext } from './context/SpotifyContext'
import { useFangornAgent } from './hooks/useFangornAgent'
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
import { useSpotify } from './hooks/useSpotifyContext'
import { usePlaybackRouter } from './hooks/usePlaybackRouter'
import { useAutoplay } from './hooks/useAutoplay'
import { useMediaSearch } from './hooks/useMediaSearch'
import { TrackWikiView, type View, type SearchMode, viewLabel } from './views/TrackWikiView'
import { SoundTownView } from './views/SoundTownView'
import type { KernelSnapshot } from './types/kernel'
import type { TrackNeighborData } from './kernel/neighborhoodAnalysis'

// ── Design tokens (light editorial) ──────────────────────────────────────────
const BG1    = '#f0ece5'
const BG2    = '#e8e3da'
const FG     = '#1a1714'
const FG2    = '#4a4440'
const FG3    = '#766e66'
const FG4    = '#a09890'
const ACCENT = '#b83030'
const BORDER = 'rgba(0,0,0,0.12)'
const BORDER2 = 'rgba(0,0,0,0.07)'
const MONO   = 'var(--font-mono,"Fragment Mono","DM Mono",monospace)'
const SANS   = 'var(--font-body,"Geist","Inter",sans-serif)'
const DISP   = 'var(--font-display,"Bebas Neue",sans-serif)'
const CHROMA_URL = 'http://localhost:8080'

const SNAPSHOT_HISTORY_DEPTH = 5
const MB_USER_AGENT = 'SOND3R/1.0.0 (https://fangorn.network)'

const onTrackEndedRef = { current: () => { } }

type AnalyzeTab = 'wiki' | 'neighborhood' | 'galaxy'

// ─── Root ──────────────────────────────────────────────────────────────────────

export default function App() {
  const [booted, setBooted] = useState(() => localStorage.getItem('booted') === 'true')
  const { ready, authenticated, login } = usePrivy()

  const handleBooted = useCallback(() => { setBooted(true) }, [])

  if (!booted) {
    return (
      <StartupView onReady={handleBooted}>
        <ConnectButton ready={ready} authenticated={authenticated} onLogin={login} onEnter={handleBooted} />
      </StartupView>
    )
  }

  if (!ready) return <BootSplash />

  return (
    <SpotifyAuthProvider>
      <Main />
    </SpotifyAuthProvider>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

function Main() {
  const spotify = useSpotify(() => onTrackEndedRef.current())

  const [sessionHistory, setSessionHistory] = useState<SessionEvent[]>([])
  const [entropy, setEntropy] = useState(0.2)
  const kernel = useSessionKernel({ entropy })

  const [genreWeights, setGenreWeights] = useState<Record<string, number>>({})

  // ── Wiki navigation state (lifted from TrackWikiView) ─────────────────────
  const [wikiView, setWikiView] = useState<View>({ kind: 'home' })
  const [wikiStack, setWikiStack] = useState<View[]>([])
  const [wikiSearchBox, setWikiSearchBox] = useState('')

  const wikiNavigate = useCallback((next: View) => {
    setWikiStack(s => [...s, wikiView])
    setWikiView(next)
    if (next.kind === 'results') setWikiSearchBox(next.query)
  }, [wikiView])

  const wikiBack = useCallback(() => {
    setWikiStack(s => {
      if (!s.length) return s
      const prev = s[s.length - 1]
      setWikiView(prev)
      if (prev.kind === 'results') setWikiSearchBox(prev.query)
      return s.slice(0, -1)
    })
  }, [])

  const wikiGoTo = useCallback((index: number) => {
    setWikiStack(s => {
      const full = [...s, wikiView]
      const target = full[index]
      if (target) {
        setWikiView(target)
        if (target.kind === 'results') setWikiSearchBox(target.query)
      }
      return full.slice(0, index)
    })
  }, [wikiView])

  const wikiRunSearch = useCallback((q: string, mode: SearchMode = 'lexical') => {
    const t = q.trim(); if (!t) return
    wikiNavigate({ kind: 'results', query: t, mode })
  }, [wikiNavigate])

  const wikiCrumbs = useMemo(() => [...wikiStack, wikiView], [wikiStack, wikiView])

  // ── UI state ──────────────────────────────────────────────────────────────
  const [showSettings, setShowSettings] = useState(false)
  const [nowPlayingOpen, setNowPlayingOpen] = useState(false)
  const [showGalaxy, setShowGalaxy] = useState(false)

  // ── Kernel / chroma ───────────────────────────────────────────────────────

  const {
    tracks, loading,
    allGenres, allMoods, allContexts, allThemes,
    chromaReady, seeding, retryConnect,
    applyKernelQuery,
  } = useChroma({ genreFilter: 'all', moodFilter: 'all', contextFilter: 'all' })

  const { tracks: ytTracks, search: ytSearch, clear: ytClear } = useMediaSearch()
  const { sendMessage } = useFangornAgent()

  const contextHints = useMemo(() => ({
    moods: allMoods, contexts: allContexts, genres: allGenres, themes: allThemes,
  }), [allMoods, allContexts, allGenres, allThemes])

  const agentContext = useAgentContext(sendMessage, contextHints)

  // ── Signals ───────────────────────────────────────────────────────────────

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

  // ── Taste profile ─────────────────────────────────────────────────────────

  const [activeProfileName, setActiveProfileName] = useState<string>(() => {
    const id = localStorage.getItem('sond3r:activeProfile')
    if (!id) return 'default'
    try {
      const profiles = JSON.parse(localStorage.getItem('sond3r:profiles') ?? '[]')
      return profiles.find((p: any) => p.id === id)?.name ?? 'default'
    } catch { return 'default' }
  })

  useEffect(() => {
    const id = localStorage.getItem('sond3r:activeProfile')
    if (!id) return
    try {
      const profiles = JSON.parse(localStorage.getItem('sond3r:profiles') ?? '[]')
      const snap = profiles.find((p: any) => p.id === id)
      if (snap?.queryVector?.length > 0) {
        applyKernelQuery(snap.queryVector, true)
        setEntropy(snap.entropy ?? 0.2)
        setGenreWeights(snap.genreWeights ?? {})
      }
    } catch { /* ignore */ }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

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
        genres: (track as any).genres ?? [], moods: (track as any).moods ?? [],
        themes: (track as any).themes ?? [], contexts: (track as any).contexts ?? [],
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
  useEffect(() => { ytTracksRef.current = ytTracks }, [ytTracks])

  // ── Playback router ───────────────────────────────────────────────────────

  const { play, markNaturalEnd, state: playbackState } = usePlaybackRouter(spotify, {
    onSkip: useCallback((_trackId: string) => {
      // skip signals from wiki play wired up via handleWikiPlay below
    }, []),
  })

  const { nextTrack, prefetchNext, playNext } = useAutoplay(kernel, play)

  useEffect(() => {
    if (playbackState.trackId) prefetchNext()
  }, [playbackState.trackId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    onTrackEndedRef.current = () => { markNaturalEnd(); playNext() }
  }, [playNext, markNaturalEnd])

  useEffect(() => {
    setEntropy(agentContext.context?.kernelOverrides?.entropy ?? 0.2)
  }, [agentContext.context])

  // ── Wiki play adapter (TrackNeighborData → playback router) ───────────────

  const pendingWikiPlayRef = useRef<{ artist: string; title: string } | null>(null)

  useEffect(() => {
    if (!pendingWikiPlayRef.current || ytTracks.length === 0) return
    const pending = pendingWikiPlayRef.current
    const first = ytTracks.find(t => t.youtubeVideoId)
    if (first) {
      play({
        id: first.youtubeVideoId ?? first.id,
        trackId: first.youtubeVideoId ?? first.id,
        owner: '', manifestCid: '',
        title: first.title ?? pending.title,
        artist: first.artist ?? pending.artist,
        year: null, durationMs: null,
        youtubeVideoId: first.youtubeVideoId,
      })
    }
    pendingWikiPlayRef.current = null
    ytClear()
  }, [ytTracks, play, ytClear])

  const handleWikiPlay = useCallback((track: TrackNeighborData) => {
    pendingWikiPlayRef.current = { artist: track.artist, title: track.title }
    ytSearch(`${track.artist} ${track.title}`)
    handleSignalRef.current({
      type: 'play', weight: 1.0,
      track: {
        id: track.id, trackId: track.id, owner: '', manifestCid: '',
        title: track.title, artist: track.artist, year: null,
        durationMs: track.durationMs ?? null,
        genres: track.genres, moods: track.moods,
        themes: track.themes, contexts: track.contexts,
      },
    })
  }, [ytSearch])

  // ── Startup prefetch ──────────────────────────────────────────────────────

  const startupFiredRef = useRef(false)
  const kernelTopGenres = Object.entries(genreWeights)
    .sort((a, b) => b[1] - a[1]).slice(0, 6).map(([g]) => g)

  useEffect(() => {
    if (!chromaReady || loading || startupFiredRef.current) return
    startupFiredRef.current = true
    const query = buildStartupQuery(kernelTopGenres)
    kernel.embedText(query)
      .then(vec => applyKernelQuery(Array.from(vec), true))
      .catch(e => console.warn('[app] startup embed failed:', e))
    // Warm the UMAP projection cache so the galaxy view loads faster
    fetch(`${CHROMA_URL}/catalog/map`).catch(() => {})
  }, [chromaReady, loading, kernelTopGenres]) // eslint-disable-line react-hooks/exhaustive-deps

  function buildStartupQuery(topGenres?: string[]): string {
    const slot = getTimeSlot()
    const mood = pick(slot.moods)
    const genrePool = topGenres && topGenres.length > 0 ? topGenres.slice(0, 4) : slot.genres
    return `${mood} ${pick(genrePool)}`
  }

  interface TimeSlot { moods: string[]; genres: string[] }
  function getTimeSlot(): TimeSlot {
    const h = new Date().getHours()
    if (h >= 5 && h < 11)  return { moods: ['energetic', 'uplifting', 'focused', 'bright'], genres: ['indie pop', 'math rock', 'post-rock', 'funk', 'electronic'] }
    if (h >= 11 && h < 14) return { moods: ['driving', 'confident', 'punchy'], genres: ['alternative', 'rock', 'electronic', 'hip hop'] }
    if (h >= 14 && h < 18) return { moods: ['focused', 'deep', 'hypnotic', 'complex'], genres: ['post-rock', 'math rock', 'prog', 'industrial', 'ambient'] }
    if (h >= 18 && h < 22) return { moods: ['chill', 'warm', 'melodic', 'emotional'], genres: ['shoegaze', 'dream pop', 'indie', 'post-hardcore', 'chillwave'] }
    return { moods: ['dark', 'introspective', 'atmospheric', 'melancholic'], genres: ['darkwave', 'ambient', 'post-punk', 'industrial', 'doom'] }
  }
  function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)] }

  const handleLoadKernel = useCallback((snap: KernelSnapshot) => {
    if (snap.queryVector.length > 0) applyKernelQuery(snap.queryVector, true)
    setEntropy(snap.entropy)
    setGenreWeights(snap.genreWeights)
    setActiveProfileName(snap.name)
    localStorage.setItem('sond3r:activeProfile', snap.id)
  }, [applyKernelQuery])

  const handleFindSimilar = useCallback(async (query?: string) => {
    const q = query?.trim() || 'I have dream pop fever'
    wikiNavigate({ kind: 'results', query: q, mode: 'semantic' })
  }, [wikiNavigate])

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <SpotifyProvider value={{ ...spotify }}>
      <PlayerProvider tracks={tracks}>
        <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#050309', overflow: 'hidden', fontFamily: SANS }}>

          {/* ── Shell header (40px) ───────────────────────────────────────── */}
          <header style={{
            height: 40, flexShrink: 0, background: BG1,
            borderBottom: `1px solid ${BORDER}`,
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '0 14px', zIndex: 50,
            WebkitAppRegion: 'drag',
          } as React.CSSProperties}>

            {/* SOND3R wordmark */}
            <button
              onClick={() => { setWikiView({ kind: 'home' }); setWikiStack([]); setWikiSearchBox('') }}
              style={{ fontFamily: DISP, fontSize: 20, color: FG, letterSpacing: '0.08em', background: 'none', border: 'none', cursor: 'pointer', flexShrink: 0, WebkitAppRegion: 'no-drag', lineHeight: 1 } as React.CSSProperties}>
              SOND3R
            </button>

            {/* Separator */}
            <span style={{ color: BORDER, fontSize: 14, flexShrink: 0 }}>|</span>

            {/* Back button — only when there's history */}
            {wikiStack.length > 0 && (
              <button
                onClick={wikiBack}
                style={{ background: 'none', border: `1px solid ${BORDER2}`, color: FG3, fontFamily: MONO, fontSize: 11, padding: '2px 8px', cursor: 'pointer', flexShrink: 0, WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
                ←
              </button>
            )}

            {/* Breadcrumb trail — inherits drag from header; buttons individually opt out */}
            <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 5, overflow: 'hidden', whiteSpace: 'nowrap' }}>
              {wikiCrumbs.slice(-5).map((c, i, arr) => {
                const realIndex = wikiCrumbs.length - arr.length + i
                const isLast = i === arr.length - 1
                return (
                  <span key={realIndex} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, minWidth: 0, flexShrink: isLast ? 1 : 0 }}>
                    {i > 0 && <span style={{ color: FG4, fontSize: 9 }}>›</span>}
                    {isLast
                      ? <span style={{ fontFamily: MONO, fontSize: 10, color: FG2, letterSpacing: '0.04em', overflow: 'hidden', textOverflow: 'ellipsis' }}>{viewLabel(c)}</span>
                      : <button onClick={() => wikiGoTo(realIndex)}
                          style={{ background: 'none', border: 'none', color: FG4, fontFamily: MONO, fontSize: 10, cursor: 'pointer', padding: 0, letterSpacing: '0.04em', flexShrink: 0, WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
                          {viewLabel(c)}
                        </button>}
                  </span>
                )
              })}
            </div>

            {/* Search input — hidden on home (the home page has its own prominent search) */}
            {wikiView.kind !== 'home' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 0, flexShrink: 0, WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
                <input
                  value={wikiSearchBox}
                  onChange={e => setWikiSearchBox(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') wikiRunSearch(wikiSearchBox) }}
                  placeholder="artist, track, or vibe…"
                  style={{
                    width: 220, background: BG2, border: `1px solid ${BORDER2}`,
                    borderRight: 'none', color: FG, fontSize: 11, padding: '5px 9px',
                    outline: 'none', fontFamily: MONO, letterSpacing: '0.02em',
                  }} />
                <button
                  onClick={() => wikiRunSearch(wikiSearchBox)}
                  disabled={!wikiSearchBox.trim()}
                  style={{
                    background: wikiSearchBox.trim() ? ACCENT : 'transparent',
                    border: `1px solid ${wikiSearchBox.trim() ? ACCENT : BORDER2}`,
                    color: wikiSearchBox.trim() ? '#fff' : FG4,
                    fontFamily: MONO, fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase',
                    padding: '6px 10px', cursor: wikiSearchBox.trim() ? 'pointer' : 'default',
                  }}>
                  ↵
                </button>
              </div>
            )}

            {/* Settings icon */}
            <button
              onClick={() => setShowSettings(s => !s)}
              style={{ background: showSettings ? `${ACCENT}18` : 'none', border: `1px solid ${showSettings ? ACCENT + '44' : BORDER2}`, color: showSettings ? ACCENT : FG4, fontFamily: MONO, fontSize: 11, padding: '3px 8px', cursor: 'pointer', flexShrink: 0, WebkitAppRegion: 'no-drag' } as React.CSSProperties}
              title="Settings">
              ⚙
            </button>

            {/* Now-playing dot */}
            <NowPlayingDot onOpen={() => setNowPlayingOpen(true)} />

            {/* Wallet */}
            <div style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
              <ConnectWallet />
            </div>
          </header>

          {/* ── Content area ─────────────────────────────────────────────── */}
          <div style={{ flex: 1, overflow: 'hidden', position: 'relative', display: 'flex' }}>

            {/* Wiki — primary surface */}
            <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <TrackWikiView
                view={wikiView}
                stack={wikiStack}
                searchBox={wikiSearchBox}
                onNavigate={wikiNavigate}
                onBack={wikiBack}
                onGoTo={wikiGoTo}
                onSearchBoxChange={setWikiSearchBox}
                kernelState={kernel.state.t > 0 ? { mu: kernel.state.mu, velocity: kernel.state.v, sigma: kernel.state.sigma } : undefined}
                onPlayTrack={handleWikiPlay}
                kernelTopGenres={kernelTopGenres}
                allGenres={allGenres}
                kernelEntropy={kernel.state.t > 0 ? kernel.state.entropy : undefined}
              />
            </div>

            {/* Settings drawer — slides in from right */}
            {showSettings && (
              <div style={{
                width: 360, flexShrink: 0, background: BG1, borderLeft: `1px solid ${BORDER}`,
                display: 'flex', flexDirection: 'column', overflowY: 'auto',
                zIndex: 40,
              }}>
                <SettingsDrawer
                  kernelState={kernel.state}
                  entropy={entropy}
                  activeProfileName={activeProfileName}
                  onLoadKernel={handleLoadKernel}
                  onClose={() => setShowSettings(false)}
                  onOpenGalaxy={() => { setShowGalaxy(true); setShowSettings(false) }}
                />
              </div>
            )}
          </div>

          {/* ── Galaxy overlay ────────────────────────────────────────────── */}
          {showGalaxy && createPortal(
            <div style={{ position: 'fixed', inset: 0, zIndex: 60, background: '#0c0906' }}>
              <SoundTownView
                onTrackSelect={track => {
                  wikiNavigate({ kind: 'track', artist: track.artist, title: track.title })
                  setShowGalaxy(false)
                }}
                onPlayTrack={track => {
                  ytSearch(`${track.artist} ${track.title}`)
                  pendingWikiPlayRef.current = { artist: track.artist, title: track.title }
                }}
                onBack={() => setShowGalaxy(false)}
              />
            </div>,
            document.body,
          )}

          {/* ── Now-playing strip (24px) ─────────────────────────────────── */}
          <NowPlayingStrip
            onNavigate={wikiNavigate}
            onExpand={() => setNowPlayingOpen(true)}
          />

          {/* ── NowPlaying full-screen sheet (portal) ────────────────────── */}
          {nowPlayingOpen && createPortal(
            <NowPlaying
              playbackState={playbackState}
              onPlay={play}
              onCollapse={() => setNowPlayingOpen(false)}
              onFilter={() => { }}
              onCallAgent={handleFindSimilar}
              onTrackSelect={() => { }}
              onAnalyze={(track: Track) => {
                wikiNavigate({ kind: 'track', artist: track.artist, title: track.title })
                setNowPlayingOpen(false)
              }}
            />,
            document.body,
          )}

          {/* KernelDebugHUD — Ctrl+K accessible */}
          <KernelDebugHUD state={kernel.state} />
        </div>
      </PlayerProvider >
    </SpotifyProvider >
  )
}

// ─── NowPlayingDot ────────────────────────────────────────────────────────────

function NowPlayingDot({ onOpen }: { onOpen: () => void }) {
  // Use the shared context instance — calling useSpotify() here would spin up a
  // second 500ms status-polling loop disconnected from the main player.
  const { currentVideoId, isPlaying } = useSpotifyContext()
  const active = !!currentVideoId
  return (
    <button
      onClick={active ? onOpen : undefined}
      style={{
        width: 8, height: 8, borderRadius: '50%', padding: 0, border: 'none',
        background: active ? (isPlaying ? ACCENT : FG3) : FG4,
        cursor: active ? 'pointer' : 'default',
        flexShrink: 0,
        boxShadow: active && isPlaying ? `0 0 6px ${ACCENT}` : 'none',
        transition: 'background 0.2s, box-shadow 0.2s',
        WebkitAppRegion: 'no-drag',
      } as React.CSSProperties}
      title={active ? 'Now playing' : 'Nothing playing'}
    />
  )
}

// ─── Settings drawer ──────────────────────────────────────────────────────────

interface SettingsDrawerProps {
  kernelState: any
  entropy: number
  activeProfileName: string
  onLoadKernel: (snap: KernelSnapshot) => void
  onClose: () => void
  onOpenGalaxy: () => void
}

function SettingsDrawer({ kernelState, entropy, activeProfileName, onClose, onOpenGalaxy }: SettingsDrawerProps) {
  const [section, setSection] = useState<'kernel' | 'connectors' | 'agent'>('kernel')

  const vibeLabel = entropy > 0.65
    ? { label: 'Wandering', desc: 'Discovery mode — pushing past familiar territory', color: '#5a3d9e' }
    : entropy > 0.33
    ? { label: 'Calibrating', desc: 'Finding your sound — kernel is sharpening', color: '#9a6820' }
    : { label: 'Locked in', desc: 'Deep in your groove — taste model converged', color: '#207860' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

      {/* Drawer header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 14px', height: 40, borderBottom: `1px solid ${BORDER}`, flexShrink: 0 }}>
        <div style={{ display: 'flex', gap: 0 }}>
          {(['kernel', 'connectors', 'agent'] as const).map(s => (
            <button key={s} onClick={() => setSection(s)} style={{
              background: 'none', border: 'none', borderBottom: `1px solid ${section === s ? ACCENT : 'transparent'}`,
              color: section === s ? FG : FG4, fontFamily: MONO, fontSize: 9, letterSpacing: '0.16em',
              textTransform: 'uppercase', padding: '10px 10px 9px', cursor: 'pointer',
            }}>{s}</button>
          ))}
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: FG4, fontSize: 14, cursor: 'pointer', fontFamily: MONO, padding: '0 4px' }}>✕</button>
      </div>

      {/* Section content */}
      <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>

        {section === 'kernel' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Vibe state */}
            <div style={{ borderLeft: `3px solid ${vibeLabel.color}`, padding: '10px 12px', background: 'rgba(255,255,255,0.02)' }}>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, color: vibeLabel.color, letterSpacing: '0.03em', lineHeight: 1 }}>{vibeLabel.label}</div>
              <div style={{ fontFamily: MONO, fontSize: 10, color: FG3, marginTop: 4, lineHeight: 1.6 }}>{vibeLabel.desc}</div>
            </div>

            {/* Profile */}
            <div>
              <div style={{ fontFamily: MONO, fontSize: 8, color: FG4, letterSpacing: '0.18em', textTransform: 'uppercase', marginBottom: 6 }}>Active profile</div>
              <div style={{ fontFamily: SANS, fontSize: 13, color: FG2 }}>{activeProfileName}</div>
            </div>

            {/* Collection map link */}
            <button
              onClick={onOpenGalaxy}
              style={{ background: 'none', border: `1px solid ${BORDER}`, color: FG3, fontFamily: MONO, fontSize: 10, letterSpacing: '0.10em', textTransform: 'uppercase', padding: '8px 12px', cursor: 'pointer', textAlign: 'left' }}>
              Browse the collection map →
            </button>
          </div>
        )}

        {section === 'connectors' && <ConnectorsView />}
        {section === 'agent' && <AgentView />}
      </div>
    </div>
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
