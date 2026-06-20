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
import { BootProvider, useBoot, type SnapshotInfo } from './providers/BootProvider'
import { IndexingBar } from './components/IndexingBar'
import { useSessionKernel } from './hooks/useSessionKernel'
import { useTheme } from './hooks/useTheme'
import { ConnectorsView } from './views/ConnectorsView'
import { AccountView } from './views/AccountView'
import { BugReportFab } from './components/BugReportFab'
import type { TasteSignal } from './types'
import { type SessionEvent } from './kernel/Visualizer'
import { useChromaSync } from './hooks/useChromaSync'
import KernelDebugHUD from './kernel/HUD'
import { useAgentContext } from './context/useAgentContext'
import { useSpotify } from './hooks/useSpotifyContext'
import { usePlaybackRouter } from './hooks/usePlaybackRouter'
import { useAutoplay } from './hooks/useAutoplay'
import { TrackWikiView, type View, type SearchMode, viewLabel } from './views/TrackWikiView'
import { SoundTownView } from './views/SoundTownView'
import { LocalMusicView } from './views/LocalMusicView'
import { LocalMusicProvider } from './providers/LocalMusicProvider'
import { KernelStrip, type KernelStripProps } from './components/KernelStrip'
import { DEFAULTS } from './kernel/constants'
import type { KernelSnapshot } from './types/kernel'
import type { TrackNeighborData } from './kernel/neighborhoodAnalysis'

// ── Design tokens ─────────────────────────────────────────────────────────────
// Read from the shared CSS variables (App.css :root + the data-theme="dark"
// override) so the shell flips with the light/dark toggle. See hooks/useTheme.
const BG1    = 'var(--bg1)'
const BG2    = 'var(--bg2)'
const FG     = 'var(--fg)'
const FG2    = 'var(--fg2)'
const FG3    = 'var(--fg3)'
const FG4    = 'var(--fg4)'
const ACCENT = 'var(--accent)'
const ACCENT_DIM    = 'var(--accent-dim)'
const ACCENT_BORDER = 'var(--accent-border)'
const BORDER = 'var(--border)'
const BORDER2 = 'var(--border2)'
const MONO   = 'var(--font-mono,"Fragment Mono","DM Mono",monospace)'
const SANS   = 'var(--font-body,"Geist","Inter",sans-serif)'
const DISP   = 'var(--font-display,"Bebas Neue",sans-serif)'

const SNAPSHOT_HISTORY_DEPTH = 5
const MB_USER_AGENT = 'SOND3R/1.0.0 (https://fangorn.network)'

const onTrackEndedRef = { current: () => { } }

type AnalyzeTab = 'wiki' | 'neighborhood' | 'galaxy'
type DrawerSection = 'kernel' | 'account' | 'connectors' | 'agent' | 'data'

/** Status pip shown on the Search tab. Four states:
 *   - `failed`     → small × (snapshot download / index build failed)
 *   - `optimizing` → amber pulsing dot (search works, but the vector index is
 *                    still building, so results aren't fully optimized yet)
 *   - `ready`      → green check (warm + fully indexed)
 *   - otherwise    → spinning ring (still warming up; search not usable yet) */
function SearchStatus({ ready, optimizing, failed, needsDownload }: { ready: boolean; optimizing?: boolean; failed?: boolean; needsDownload?: boolean }) {
  if (failed) {
    return (
      <span aria-label="Search unavailable" style={{ color: 'var(--err)', fontSize: 12, lineHeight: 1, fontFamily: 'var(--font-mono, monospace)' }}>×</span>
    )
  }
  if (needsDownload) {
    return (
      <span aria-label="Catalog not downloaded" title="Catalog not downloaded" style={{ color: 'var(--fg4)', fontSize: 12, lineHeight: 1, fontFamily: 'var(--font-mono, monospace)' }}>↓</span>
    )
  }
  if (optimizing) {
    return (
      <span
        aria-label="Search ready — still optimizing"
        style={{
          width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)',
          display: 'inline-block', boxShadow: '0 0 5px var(--accent)',
          animation: 'fangornBootPulse 1.4s ease-in-out infinite',
        }}
      />
    )
  }
  if (ready) {
    return (
      <span aria-label="Search ready" style={{ color: 'var(--success)', fontSize: 12, lineHeight: 1, fontFamily: 'var(--font-mono, monospace)' }}>✓</span>
    )
  }
  return (
    <span
      aria-label="Warming up search"
      style={{
        width: 10, height: 10, boxSizing: 'border-box', borderRadius: '50%',
        border: '1.5px solid var(--border2)', borderTopColor: 'var(--accent)',
        display: 'inline-block', animation: 'spin 0.8s linear infinite',
      }}
    />
  )
}

// ─── Root ──────────────────────────────────────────────────────────────────────

export default function App() {
  // BootProvider wraps everything so the backend boot/index subscription is
  // shared and survives the splash → app transition (user can enter mid-index).
  return (
    <BootProvider>
      <AppRoot />
    </BootProvider>
  )
}

function AppRoot() {
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
  const { theme, toggleTheme } = useTheme()
  const spotify = useSpotify(() => onTrackEndedRef.current())

  // Search opens as soon as the backend is `searchable` (post-warmup); the
  // IndexingBar only stands in while it's still warming. Once searchable, the
  // header swaps in the real search field and `optimizing` drives a soft hint
  // that the vector index is still building (results valid but unoptimized).
  const { searchable, optimizing, needsDownload, ready: searchReady, stage: bootStage } = useBoot()
  // Snapshot download / index build failed — show an × on the Search tab.
  const searchFailed = bootStage === 'error'

  const [sessionHistory, setSessionHistory] = useState<SessionEvent[]>([])
  const [entropy, setEntropy] = useState(0.2)
  const kernel = useSessionKernel({ entropy })

  const [genreWeights, setGenreWeights] = useState<Record<string, number>>({})

  // ── Wiki navigation state (lifted from TrackWikiView) ─────────────────────
  const [wikiView, setWikiView] = useState<View>({ kind: 'search' })
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
  const [settingsSection, setSettingsSection] = useState<DrawerSection>('kernel')
  const [nowPlayingOpen, setNowPlayingOpen] = useState(false)
  const [showGalaxy, setShowGalaxy] = useState(false)
  // Home tab = Local Music (the default landing); Search tab = the catalog wiki.
  const [showLocal, setShowLocal] = useState(true)

  const openSettings = useCallback((section: DrawerSection) => {
    setSettingsSection(section)
    setShowSettings(true)
  }, [])

  // ── Kernel / chroma ───────────────────────────────────────────────────────

  const {
    tracks, loading,
    allGenres, allMoods, allContexts, allThemes,
    chromaReady, seeding, retryConnect,
    applyKernelQuery, roleMap,
  } = useChroma({ genreFilter: 'all', moodFilter: 'all', contextFilter: 'all' })

  // Kernel readout props, derived once from live kernel state. Shared by the
  // KernelStrip mounted above the wiki and the one inside the game view.
  const kernelStrip: KernelStripProps = useMemo(() => ({
    momentum:          Array.from(kernel.state.v ?? []),
    attractorDistance: kernel.state.sigma,
    entropyScore:      kernel.state.entropy,
    alpha:             DEFAULTS.alpha,
    gamma:             DEFAULTS.gamma_base,
    mutedCount:        kernel.state.muted?.size ?? 0,
    sessionLength:     kernel.state.t,
  }), [kernel.state])

  // Playback capability. Ideally gated on a `media` role (a playable handle),
  // but for now we also enable it whenever records are track-like — i.e. the
  // identity field is `trackId` — so the music catalog keeps its preview/Spotify
  // playback even with only the invariant/taxonomy schemas loaded (no
  // AudioSource → no media role). Non-track datasets (e.g. OSM) stay player-less.
  const canPlay = !!roleMap?.media || roleMap?.identity === 'trackId' || !roleMap

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

  // useChromaSync({ enabled: visible })

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
  // Play the exact track the user picked. The Spotify adapter resolves by
  // title + artist, so we pass those through verbatim — no fuzzy YouTube/
  // SoundCloud pre-search (which could surface an unrelated podcast/cover and
  // hand Spotify the wrong query).

  const handleWikiPlay = useCallback((track: TrackNeighborData) => {
    play({
      id: track.id, trackId: track.id, owner: '', manifestCid: '',
      title: track.title, artist: track.artist, year: null,
      durationMs: track.durationMs ?? null,
    })
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
  }, [play])

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
    // The UMAP projection (/catalog/map) is deliberately NOT prefetched here:
    // building it over 860k points is a multi-minute, CPU-saturating job, and
    // running it in the background during normal search pegs the machine. The
    // galaxy view (SoundTownView) builds it lazily on open — the only place it's
    // actually needed.
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

  const accountActive  = showSettings && settingsSection === 'account'
  const settingsActive = showSettings && settingsSection !== 'account'

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <SpotifyProvider value={{ ...spotify }}>
      <LocalMusicProvider>
      <PlayerProvider tracks={tracks}>
        <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--bg)', overflow: 'hidden', fontFamily: SANS }}>

          {/* ── Shell header (40px) ───────────────────────────────────────── */}
          <header style={{
            height: 40, flexShrink: 0, background: BG1,
            borderBottom: `1px solid ${BORDER}`,
            display: 'flex', alignItems: 'center', gap: 8,
            // Reserve the OS window-controls-overlay rect (titlebar-area-* env vars)
            // so the header's right-side cluster never sits under the native
            // min/max/close buttons. Wherever the controls live, the draggable
            // titlebar area excludes them: pad left up to its start and right past
            // its end. Falls back to a flat 14px when no overlay is present.
            paddingTop: 0, paddingBottom: 0,
            paddingLeft: 'calc(env(titlebar-area-x, 0px) + 14px)',
            paddingRight: 'calc(100vw - env(titlebar-area-width, 100vw) - env(titlebar-area-x, 0px) + 14px)',
            zIndex: 50,
            WebkitAppRegion: 'drag',
          } as React.CSSProperties}>

            {/* SOND3R wordmark — brand; also returns to Home (Local Music) */}
            <button
              onClick={() => setShowLocal(true)}
              style={{ fontFamily: DISP, fontSize: 20, color: FG, letterSpacing: '0.08em', background: 'none', border: 'none', cursor: 'pointer', flexShrink: 0, WebkitAppRegion: 'no-drag', lineHeight: 1 } as React.CSSProperties}>
              SOND3R
            </button>

            {/* Separator */}
            <span style={{ color: BORDER, fontSize: 14, flexShrink: 0 }}>|</span>

            {/* Primary tabs: Home (local music) ⇄ Search (catalog wiki). */}
            <button
              onClick={() => setShowLocal(true)}
              style={{ background: showLocal ? ACCENT_DIM : 'none', border: `1px solid ${showLocal ? ACCENT_BORDER : 'transparent'}`, color: showLocal ? ACCENT : FG3, fontFamily: MONO, fontSize: 11, letterSpacing: '0.10em', textTransform: 'uppercase', padding: '4px 12px', cursor: 'pointer', flexShrink: 0, lineHeight: 1, WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
              Home
            </button>
            <button
              onClick={() => setShowLocal(false)}
              title={searchFailed ? 'Search unavailable — catalog failed to load' : needsDownload ? 'Catalog not downloaded — enable it in Settings → Data' : optimizing ? 'Search ready — still optimizing the index, results improving' : searchReady ? 'Search ready' : 'Warming up search…'}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: !showLocal ? ACCENT_DIM : 'none', border: `1px solid ${!showLocal ? ACCENT_BORDER : 'transparent'}`, color: !showLocal ? ACCENT : FG3, fontFamily: MONO, fontSize: 11, letterSpacing: '0.10em', textTransform: 'uppercase', padding: '4px 12px', cursor: 'pointer', flexShrink: 0, lineHeight: 1, WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
              Search
              <SearchStatus ready={searchReady} optimizing={optimizing} failed={searchFailed} needsDownload={needsDownload} />
            </button>

            {/* Wiki navigation (back / breadcrumb / search box) — Search tab only.
                On Home, a flex spacer keeps the right-side controls right-aligned. */}
            {!showLocal ? (
              <>
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

                {/* Search input — hidden on the wiki's own home (it has its own
                    prominent search). Shown as soon as search is usable; only the
                    pre-warmup window (not yet searchable) gets the progress bar.
                    The not-downloaded gate shows neither (the pip + Home prompt
                    carry that state instead). */}
                {wikiView.kind !== 'search' && !searchable && !needsDownload && <IndexingBar variant="header" />}
                {wikiView.kind !== 'search' && searchable && (
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
              </>
            ) : (
              <span style={{ flex: 1 }} />
            )}

            {/* Theme toggle — light ⇄ dark */}
            <button
              onClick={toggleTheme}
              style={{ background: 'none', border: `1px solid ${BORDER2}`, color: FG4, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4px 8px', cursor: 'pointer', flexShrink: 0, WebkitAppRegion: 'no-drag' } as React.CSSProperties}
              title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}>
              <ThemeIcon theme={theme} />
            </button>

            {/* Settings icon */}
            <button
              onClick={() => {
                if (!showSettings) openSettings('kernel')
                else if (settingsSection === 'account') setSettingsSection('kernel')
                else setShowSettings(false)
              }}
              style={{ background: settingsActive ? ACCENT_DIM : 'none', border: `1px solid ${settingsActive ? ACCENT_BORDER : BORDER2}`, color: settingsActive ? ACCENT : FG4, fontFamily: MONO, fontSize: 11, padding: '3px 8px', cursor: 'pointer', flexShrink: 0, WebkitAppRegion: 'no-drag' } as React.CSSProperties}
              title="Settings">
              ⚙
            </button>

            {/* Now-playing dot — only when the dataset is playable */}
            {canPlay && <NowPlayingDot onOpen={() => setNowPlayingOpen(true)} />}

            {/* Account */}
            <button
              onClick={() => {
                if (!showSettings) openSettings('account')
                else if (settingsSection !== 'account') setSettingsSection('account')
                else setShowSettings(false)
              }}
              style={{ background: accountActive ? ACCENT_DIM : 'none', border: `1px solid ${accountActive ? ACCENT_BORDER : BORDER2}`, color: accountActive ? ACCENT : FG4, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4px 8px', cursor: 'pointer', flexShrink: 0, WebkitAppRegion: 'no-drag' } as React.CSSProperties}
              title="Account">
              <AccountIcon />
            </button>
          </header>

          {/* ── Content area ─────────────────────────────────────────────── */}
          <div style={{ flex: 1, overflow: 'hidden', position: 'relative', display: 'flex' }}>

            {/* Wiki — primary surface */}
            <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <KernelStrip {...kernelStrip} theme={theme} />
              {/* Soft, non-blocking hint while the catalog search index is still
                  optimizing — search already works, this just signals results are
                  still improving. Search tab only (local music needs no catalog). */}
              {optimizing && !showLocal && <IndexingBar variant="banner" />}
              {/* Content region below the Kernel view. LocalMusicView overlays
                  just this area (position:absolute inset:0), so the shell header
                  and KernelStrip stay visible — same chrome as the wiki. */}
              <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
                <TrackWikiView
                  view={wikiView}
                  stack={wikiStack}
                  searchBox={wikiSearchBox}
                  onNavigate={wikiNavigate}
                  onBack={wikiBack}
                  onGoTo={wikiGoTo}
                  onSearchBoxChange={setWikiSearchBox}
                  kernelState={kernel.state.t > 0 ? { mu: kernel.state.mu, velocity: kernel.state.v, sigma: kernel.state.sigma } : undefined}
                  onPlayTrack={canPlay ? handleWikiPlay : undefined}
                  kernelTopGenres={kernelTopGenres}
                  allGenres={allGenres}
                  kernelEntropy={kernel.state.t > 0 ? kernel.state.entropy : undefined}
                  kernelSessionLength={kernel.state.t}
                  kernelMutedCount={kernelStrip.mutedCount}
                />
                {showLocal && <LocalMusicView />}
              </div>
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
                  section={settingsSection}
                  onSectionChange={setSettingsSection}
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
                kernel={kernelStrip}
                onTrackSelect={track => {
                  wikiNavigate({ kind: 'track', artist: track.artist, title: track.title })
                  setShowGalaxy(false)
                }}
                onPlayTrack={track => {
                  play({
                    id: track.id, trackId: track.id, owner: '', manifestCid: '',
                    title: track.title, artist: track.artist, year: null, durationMs: null,
                  })
                }}
                onBack={() => setShowGalaxy(false)}
              />
            </div>,
            document.body,
          )}

          {/* ── Now-playing strip (24px) — playable datasets only ────────── */}
          {canPlay && (
            <NowPlayingStrip
              onNavigate={wikiNavigate}
              onExpand={() => setNowPlayingOpen(true)}
            />
          )}

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

          {/* Bug reporter — bottom-left corner, mirroring the HUD's anchor. */}
          <BugReportFab storageKey="app" style={{ position: 'fixed', left: 0, bottom: 0, zIndex: 200 }} />
        </div>
      </PlayerProvider >
      </LocalMusicProvider>
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

// ─── ThemeIcon ────────────────────────────────────────────────────────────────
// Shows the mode you'll switch *to*: a moon while in light mode, a sun while in
// dark mode.

function ThemeIcon({ theme }: { theme: 'light' | 'dark' }) {
  if (theme === 'dark') {
    // Sun — click to go light.
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
      </svg>
    )
  }
  // Moon — click to go dark.
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  )
}

// ─── AccountIcon ──────────────────────────────────────────────────────────────

function AccountIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  )
}

// ─── Settings drawer ──────────────────────────────────────────────────────────

function fmtBytes(n: number): string {
  if (n >= 1e9) return (n / 1e9).toFixed(2) + ' GB'
  if (n >= 1e6) return (n / 1e6).toFixed(1) + ' MB'
  if (n >= 1e3) return (n / 1e3).toFixed(0) + ' KB'
  return `${n} B`
}

// Settings → Data: opt-in catalog management. Shows install state + sizes, and
// lets the user download (if they skipped the startup prompt) or delete to
// reclaim the disk. Live install/optimize progress mirrors the boot state.
function DataSettings() {
  const boot = useBoot()
  const [info, setInfo] = useState<SnapshotInfo | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const refresh = useCallback(() => {
    window.sond3r?.getSnapshotInfo().then(setInfo).catch(() => { })
  }, [])
  // Refresh on mount and whenever boot crosses a stage boundary (install/delete).
  useEffect(() => { refresh() }, [refresh, boot.stage])

  const loading    = boot.stage === 'downloading' || boot.stage === 'decompressing' || boot.stage === 'recovering' || boot.stage === 'warming'
  const optimizing = boot.stage === 'indexing'
  const installed  = boot.ready || optimizing || (info?.installed ?? false)
  const lowDisk    = !!info && info.freeBytes < info.requiredBytes

  const onDownload = () => { setBusy(true); window.sond3r?.downloadSnapshot().finally(() => setBusy(false)) }
  const onDelete = () => {
    setBusy(true)
    window.sond3r?.deleteSnapshot().then(() => setConfirmDelete(false)).finally(() => { setBusy(false); refresh() })
  }

  const Row = ({ k, v, warn }: { k: string; v: string; warn?: boolean }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, fontFamily: MONO, fontSize: 11, color: warn ? 'var(--err)' : FG3, fontVariantNumeric: 'tabular-nums' }}>
      <span style={{ color: FG4, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{k}</span>
      <span>{v}</span>
    </div>
  )
  const btn = (primary: boolean, danger?: boolean): React.CSSProperties => ({
    marginTop: 8, padding: '9px 14px', fontFamily: MONO, fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase',
    color: danger ? 'var(--err)' : primary ? '#fff' : FG3,
    background: primary && !danger ? ACCENT : 'transparent',
    border: `1px solid ${danger ? 'var(--err)' : primary ? ACCENT : BORDER2}`,
    cursor: 'pointer', textAlign: 'left',
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <div style={{ fontFamily: MONO, fontSize: 8, color: FG4, letterSpacing: '0.18em', textTransform: 'uppercase', marginBottom: 6 }}>Search catalog</div>
        <div style={{ fontFamily: SANS, fontSize: 12, color: FG3, lineHeight: 1.55 }}>
          The catalog (10M+ tracks) powers Search. It's optional — local music works without it.
        </div>
      </div>

      {loading ? (
        <div style={{ fontFamily: MONO, fontSize: 11, color: FG2 }}>
          {boot.label}{boot.pct != null ? ` · ${boot.pct}%` : '…'}
        </div>
      ) : installed ? (
        <>
          <Row k="Status" v={optimizing ? 'Installed · optimizing' : 'Installed'} />
          {info && info.installedBytes > 0 && <Row k="On disk" v={fmtBytes(info.installedBytes)} />}
          {!confirmDelete ? (
            <button onClick={() => setConfirmDelete(true)} disabled={busy} style={btn(false, true)}>Delete catalog…</button>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, border: '1px solid var(--err)', padding: 12 }}>
              <div style={{ fontFamily: SANS, fontSize: 12, color: FG2, lineHeight: 1.5 }}>
                Delete the catalog and free {info && info.installedBytes > 0 ? fmtBytes(info.installedBytes) : 'this disk space'}? You'll need to re-download it to search again.
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={onDelete} disabled={busy} style={{ ...btn(false, true), marginTop: 0, flex: 1, textAlign: 'center' }}>{busy ? 'Deleting…' : 'Delete'}</button>
                <button onClick={() => setConfirmDelete(false)} disabled={busy} style={{ ...btn(false), marginTop: 0, flex: 1, textAlign: 'center' }}>Cancel</button>
              </div>
            </div>
          )}
        </>
      ) : (
        <>
          <Row k="Status" v="Not installed" />
          {info && <>
            <Row k="Download" v={fmtBytes(info.compressedBytes)} />
            <Row k="On disk (unpacked)" v={`≈ ${fmtBytes(info.uncompressedBytes)}`} />
            <Row k="Free disk needed" v={fmtBytes(info.requiredBytes)} warn={lowDisk} />
            <Row k="You have free" v={fmtBytes(info.freeBytes)} warn={lowDisk} />
          </>}
          <div style={{ fontFamily: SANS, fontSize: 11, color: FG4, lineHeight: 1.5 }}>
            Large download - best on a fast, unmetered connection.
          </div>
          {lowDisk && (
            <div style={{ fontFamily: MONO, fontSize: 10, color: 'var(--err)', lineHeight: 1.5 }}>Not enough free disk to install.</div>
          )}
          <button onClick={onDownload} disabled={busy || !info || lowDisk} style={btn(true)}>
            {busy ? 'Starting…' : `Download catalog${info ? ` · ${fmtBytes(info.compressedBytes)}` : ''}`}
          </button>
        </>
      )}
    </div>
  )
}

interface SettingsDrawerProps {
  kernelState: any
  entropy: number
  activeProfileName: string
  section: DrawerSection
  onSectionChange: (s: DrawerSection) => void
  onLoadKernel: (snap: KernelSnapshot) => void
  onClose: () => void
  onOpenGalaxy: () => void
}

function SettingsDrawer({ kernelState, entropy, activeProfileName, section, onSectionChange, onClose, onOpenGalaxy }: SettingsDrawerProps) {

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
          {(['kernel', 'account', 'connectors', 'agent', 'data'] as const).map(s => (
            <button key={s} onClick={() => onSectionChange(s)} style={{
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

        {section === 'account' && <AccountView />}
        {section === 'connectors' && <ConnectorsView />}
        {section === 'agent' && <AgentView />}
        {section === 'data' && <DataSettings />}
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
