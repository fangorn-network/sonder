import { useEffect, useRef, useState } from 'react'
import type { RecommendedTracks, TasteSignal, Track } from '../types'
import './mobile.css'
import './Browse-Filters.css'
import { useSpotifyContext } from '../providers/SpotifyProvider'
import { PublishModal } from '../components/PublishModal'
import type { Fangorn } from '@fangorn-network/sdk'
import type { Hex } from 'viem'

const GENRE_PALETTE = [
  '#a78bfa', '#60a5fa', '#f472b6', '#22c55e',
  '#f97316', '#7c5de8', '#f87171', '#34d399',
]

function hashColor(str: string): string {
  let h = 0
  for (let i = 0; i < str.length; i++) h = (Math.imul(31, h) + str.charCodeAt(i)) | 0
  return GENRE_PALETTE[Math.abs(h) % GENRE_PALETTE.length]
}

type SearchTab = 'library' | 'mb'

interface BrowseViewProps {
  tracks: Track[]
  loading: boolean
  loadingMore: boolean
  error: string | null
  hasMore: boolean
  loadMore: () => void
  search: string
  setSearch: (s: string) => void
  chromaReady?: boolean
  seeding?: boolean
  retryConnect?: () => void
  recommendedTracks?: RecommendedTracks | null
  recommendLoading?: boolean
  onClearRecommendations?: () => void
  onCallAgent: (query?: string) => void
  onFilteredChange?: (tracks: Track[]) => void
  onPlayingIdChange?: (id: string) => void
  onSignal?: (signal: TasteSignal) => void
  onTrackClick: (track: Track, color: string) => void
  genreFilter: string
  moodFilter: string
  contextFilter: string
  onGenreFilter: (v: string) => void
  onMoodFilter: (v: string) => void
  onContextFilter: (v: string) => void
  allGenres: string[]
  allMoods: string[]
  allContexts: string[]
  ambientStatus?: 'idle' | 'fetching' | 'error'
  ambientQueueSize?: number
  ambientLastReason?: string
  showSpotifyNudge?: boolean
  onSpotifyNudgeConnect?: () => void
  onSpotifyNudgeDismiss?: () => void
  fallbackTracks?: Track[]
  fallbackLoading?: boolean
  onFallbackSearch?: (query: string) => void
  onFallbackClear?: () => void
  fangorn?: Fangorn | null
  publisherAddress?: Hex | null
}

async function fetchAlbumArt(title: string, artist: string): Promise<string | null> {
  try {
    const q = encodeURIComponent(`${artist} ${title}`)
    const { body } = await (window as any).electron.ipcRenderer.invoke('fetch:proxy', {
      url: `https://itunes.apple.com/search?term=${q}&entity=song&limit=3`
    })
    const data = JSON.parse(body)
    const url = data.results?.[0]?.artworkUrl100
    if (url) return url.replace('100x100bb', '600x600bb')
  } catch { }
  try {
    const q = encodeURIComponent(`artist:"${artist}" track:"${title}"`)
    const { body } = await (window as any).electron.ipcRenderer.invoke('fetch:proxy', {
      url: `https://api.deezer.com/search?q=${q}&limit=1`
    })
    const data = JSON.parse(body)
    const url = data.data?.[0]?.album?.cover_xl
    if (url) return url
  } catch { }
  return null
}

export function BrowseView({
  tracks, loading, loadingMore, error, hasMore, loadMore, search, setSearch,
  chromaReady = false,   // safe default — show connecting state until explicitly ready
  seeding = false,
  retryConnect,
  recommendedTracks, recommendLoading, onClearRecommendations, onCallAgent,
  onFilteredChange, onPlayingIdChange, onSignal, onTrackClick,
  ambientStatus, ambientQueueSize, ambientLastReason,
  showSpotifyNudge, onSpotifyNudgeConnect, onSpotifyNudgeDismiss,
  fallbackTracks, fallbackLoading, onFallbackSearch, onFallbackClear,
  fangorn, publisherAddress,
}: BrowseViewProps) {
  const sentinelRef = useRef<HTMLDivElement>(null)
  const [playingId, setPlayingId] = useState<string | null>(null)
  const [albumArtCache, setAlbumArtCache] = useState<Record<string, string>>({})
  const fetchingRef = useRef<Set<string>>(new Set())
  const [reasonExpanded, setReasonExpanded] = useState(false)
  const [publishingTrack, setPublishingTrack] = useState<{ track: Track; color: string } | null>(null)

  const [activeTab, setActiveTab] = useState<SearchTab>('library')
  const mbFetchedRef = useRef<string>('')

  const prevSearchRef = useRef(search)
  useEffect(() => {
    if (prevSearchRef.current !== search) {
      prevSearchRef.current = search
      setActiveTab('library')
      mbFetchedRef.current = ''
      onFallbackClear?.()
    }
  }, [search])

  const handleTabSwitch = (tab: SearchTab) => {
    setActiveTab(tab)
    if (tab === 'mb' && onFallbackSearch && mbFetchedRef.current !== search.trim()) {
      mbFetchedRef.current = search.trim()
      onFallbackSearch(search.trim())
    }
  }

  const showTabs = !!search.trim() && !!onFallbackSearch

  const { play, searchAndPlay, connect, connected } = useSpotifyContext()

  const handlePlay = async (e: React.MouseEvent, track: Track) => {
    e.stopPropagation()
    if (!connected) { await connect(); return }
    setPlayingId(track.id)
    onPlayingIdChange?.(track.id)
    onSignal?.({ type: 'play', track, weight: 1.0 })
    try {
      if (track.spotifyTrackId) {
        await play(`spotify:track:${track.spotifyTrackId}`)
      } else {
        const query = `${track.title} ${track.artist}`.replace(/\(.*?\)/g, '').trim()
        await searchAndPlay(query)
      }
    } catch (err) {
      console.error('play failed:', err)
      setPlayingId(null)
    }
  }

  const filtered = tracks

  useEffect(() => { onFilteredChange?.(filtered) }, [filtered])

  useEffect(() => {
    if (filtered.length === 0) return
    const missing = filtered.filter(t => !albumArtCache[t.id] && !fetchingRef.current.has(t.id))
    if (missing.length === 0) return
    missing.slice(0, 20).forEach((track, i) => {
      fetchingRef.current.add(track.id)
      setTimeout(async () => {
        const art = await fetchAlbumArt(track.title, track.artist)
        fetchingRef.current.delete(track.id)
        if (art) setAlbumArtCache(prev => ({ ...prev, [track.id]: art }))
      }, i * 50)
    })
  }, [filtered])

  useEffect(() => {
    if (!fallbackTracks || fallbackTracks.length === 0) return
    const missing = fallbackTracks.filter(t => !albumArtCache[t.id] && !fetchingRef.current.has(t.id))
    if (missing.length === 0) return
    missing.slice(0, 20).forEach((track, i) => {
      fetchingRef.current.add(track.id)
      setTimeout(async () => {
        const art = await fetchAlbumArt(track.title, track.artist)
        fetchingRef.current.delete(track.id)
        if (art) setAlbumArtCache(prev => ({ ...prev, [track.id]: art }))
      }, i * 50)
    })
  }, [fallbackTracks])

  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      entries => { if (entries[0].isIntersecting && activeTab === 'library') loadMore() },
      { rootMargin: '-100px' }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [loadMore, activeTab])

  useEffect(() => {
    if (ambientStatus === 'idle' && ambientLastReason) setReasonExpanded(false)
  }, [ambientLastReason])

  const showAmbientBar = ambientStatus !== undefined
  const isFetching = ambientStatus === 'fetching'
  const isAmbientError = ambientStatus === 'error'

  const renderCard = (track: Track) => {
    const accentColor = hashColor(track.id)
    const isThisPlaying = playingId === track.id
    const isMbTrack = !track.manifestCid
    const durationStr = track.durationMs
      ? `${Math.floor(track.durationMs / 60000)}:${String(Math.floor((track.durationMs % 60000) / 1000)).padStart(2, '0')}`
      : null

    return (
      <div
        key={track.id}
        className="tg-card"
        onClick={() => onTrackClick(track, accentColor)}
      >
        <div className="tg-art">
          {albumArtCache[track.id]
            ? <img src={albumArtCache[track.id]} alt={track.title} style={{ width: '100%', height: '100%', objectFit: 'cover', position: 'absolute', inset: 0, borderRadius: 4 }} />
            : <span className="tg-art-initial">{track.title.slice(0, 1).toUpperCase()}</span>
          }
          <button
            className={`tg-play-btn${isThisPlaying ? ' tg-play-btn--active' : ''}`}
            aria-label="Play on Spotify"
            title={connected ? 'Play on Spotify' : 'Connect Spotify to play'}
            onClick={e => handlePlay(e, track)}
            style={{ background: accentColor, border: 'none', cursor: 'pointer' }}
          >
            {isThisPlaying
              ? <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><rect x="5" y="4" width="4" height="16" rx="1" /><rect x="15" y="4" width="4" height="16" rx="1" /></svg>
              : <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg>
            }
          </button>
        </div>
        <div className="tg-body">
          <div className="tg-title">{track.title}</div>
          <div className="tg-artist">
            {track.artist}
            {track.year !== null && <span className="tg-year"> · {track.year}</span>}
            {durationStr && <span className="tg-year"> · {durationStr}</span>}
          </div>
          {isMbTrack && fangorn && (
            <button
              onClick={e => { e.stopPropagation(); setPublishingTrack({ track, color: accentColor }) }}
              style={{
                marginTop: 6, display: 'inline-flex', alignItems: 'center', gap: 4,
                background: 'none', border: `1px solid ${accentColor}44`,
                borderRadius: 4, color: accentColor, opacity: 0.7,
                fontSize: 9, letterSpacing: '0.07em', textTransform: 'uppercase',
                padding: '2px 7px', cursor: 'pointer', transition: 'all 0.15s ease',
              }}
              onMouseEnter={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.borderColor = accentColor + 'aa' }}
              onMouseLeave={e => { e.currentTarget.style.opacity = '0.7'; e.currentTarget.style.borderColor = accentColor + '44' }}
            >
              <svg viewBox="0 0 12 12" width="9" height="9" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <path d="M6 8V2M3 5l3-3 3 3M2 10h8" />
              </svg>
              publish
            </button>
          )}
        </div>
      </div>
    )
  }

  const renderSkeleton = (n = 12) =>
    Array.from({ length: n }).map((_, i) => (
      <div key={i} className="tg-card tg-card--skeleton">
        <div className="tg-skel" />
        <div className="tg-body">
          <div className="tg-skel tg-skel--title" />
          <div className="tg-skel tg-skel--sub" />
        </div>
      </div>
    ))

  // ── Connecting / error splash ───────────────────────────────────────────────
  // Shown until chromaReady flips true. If the backend is just slow to start,
  // the spinner shows and the view transitions automatically once it's up.
  // If it times out, the error state offers a retry button.

  if (!chromaReady) {
    const timedOut = !!error  // health check exhausted max attempts
    return (
      <div className="browse-view" style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', minHeight: 360, gap: 16,
      }}>
        {!timedOut ? (
          <>
            <div style={{
              width: 28, height: 28, borderRadius: '50%',
              border: '2px solid rgba(167,139,250,0.12)',
              borderTop: '2px solid rgba(167,139,250,0.65)',
              animation: 'chromaSpin 0.9s linear infinite',
            }} />
            <div style={{
              fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase',
              color: 'rgba(167,139,250,0.45)',
            }}>
              connecting to catalog
            </div>
          </>
        ) : (
          <>
            <div style={{ fontSize: 13, color: 'rgba(248,113,113,0.8)', textAlign: 'center', maxWidth: 280, lineHeight: 1.5 }}>
              {error}
            </div>
            {retryConnect && (
              <button
                onClick={retryConnect}
                style={{
                  marginTop: 4, padding: '7px 20px', borderRadius: 5, cursor: 'pointer',
                  background: 'rgba(167,139,250,0.1)', border: '1px solid rgba(167,139,250,0.25)',
                  color: 'rgba(167,139,250,0.8)', fontSize: 11, letterSpacing: '0.08em',
                  textTransform: 'uppercase', transition: 'all 0.15s ease', fontFamily: 'inherit',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(167,139,250,0.18)'; e.currentTarget.style.borderColor = 'rgba(167,139,250,0.45)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(167,139,250,0.1)'; e.currentTarget.style.borderColor = 'rgba(167,139,250,0.25)' }}
              >
                retry
              </button>
            )}
          </>
        )}
        <style>{`@keyframes chromaSpin { to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  // ── Main view ──────────────────────────────────────────────────────────────

  return (
    <div className="browse-view">

      <div className="browse-toolbar">
        <div className="search-box" style={{ flex: 1 }}>
          <span className="search-icon">⌕</span>
          <input
            className="search-input"
            type="text"
            placeholder="Search title, artist, genre, mood…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            spellCheck={false}
          />
          {search && <button className="search-clear" onClick={() => setSearch('')}>✕</button>}
        </div>
      </div>

      {seeding && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '6px 12px', marginBottom: 8, borderRadius: 6,
          background: 'rgba(167,139,250,0.06)', border: '1px solid rgba(167,139,250,0.15)',
          fontSize: 11, letterSpacing: '0.05em', color: 'rgba(167,139,250,0.7)',
        }}>
          <span style={{
            width: 6, height: 6, borderRadius: '50%', flexShrink: 0, background: '#a78bfa',
            boxShadow: '0 0 6px #a78bfa88', animation: 'ambientPulse 1.2s ease-in-out infinite',
          }} />
          personalizing your view…
        </div>
      )}

      {showTabs && (
        <div style={{ display: 'flex', gap: 4, marginBottom: 14, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          {([
            { id: 'library' as SearchTab, label: 'Library' },
            { id: 'mb' as SearchTab, label: 'MusicBrainz', icon: <MbIcon size={10} /> },
          ]).map(({ id, label, icon }) => {
            const active = activeTab === id
            return (
              <button
                key={id}
                onClick={() => handleTabSwitch(id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px',
                  background: 'none', border: 'none', cursor: 'pointer',
                  fontSize: 11, letterSpacing: '0.05em', textTransform: 'uppercase',
                  color: active ? '#a78bfa' : 'var(--fg3, #666)',
                  borderBottom: active ? '2px solid #a78bfa' : '2px solid transparent',
                  marginBottom: -1, transition: 'all 0.15s ease', fontFamily: 'inherit',
                }}
              >
                {icon}{label}
                {id === 'mb' && fallbackLoading && (
                  <span className="upload-spinner" style={{ width: 8, height: 8, borderWidth: 1.5, marginLeft: 2 }} />
                )}
              </button>
            )
          })}
        </div>
      )}

      {showSpotifyNudge && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '8px 12px', marginBottom: 10, borderRadius: 6,
          background: 'rgba(30,215,96,0.06)', border: '1px solid rgba(30,215,96,0.18)',
          fontSize: 11, letterSpacing: '0.03em', color: 'var(--fg3, #a3a3a3)',
        }}>
          <SpotifyIcon width={14} height={14} style={{ flexShrink: 0, opacity: 0.7 }} />
          <span style={{ flex: 1 }}>Connect Spotify to enable playback</span>
          <button
            onClick={onSpotifyNudgeConnect}
            style={{
              background: 'rgba(30,215,96,0.12)', border: '1px solid rgba(30,215,96,0.3)',
              borderRadius: 4, color: '#1DB954', fontFamily: 'var(--font-mono, monospace)',
              fontSize: 10, letterSpacing: '0.08em', padding: '3px 10px',
              cursor: 'pointer', flexShrink: 0,
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(30,215,96,0.22)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'rgba(30,215,96,0.12)')}
          >SET UP</button>
          <button
            onClick={onSpotifyNudgeDismiss}
            aria-label="Dismiss"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg3, #a3a3a3)', fontSize: 12, padding: '0 2px', lineHeight: 1, opacity: 0.5, flexShrink: 0 }}
            onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
            onMouseLeave={e => (e.currentTarget.style.opacity = '0.5')}
          >✕</button>
        </div>
      )}

      {showAmbientBar && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', margin: '0 0 8px',
          borderRadius: reasonExpanded ? '6px 6px 0 0' : 6, fontSize: 11, letterSpacing: '0.04em',
          background: isAmbientError ? 'rgba(248,113,113,0.07)' : 'rgba(167,139,250,0.07)',
          border: `1px solid ${isAmbientError ? 'rgba(248,113,113,0.18)' : 'rgba(167,139,250,0.18)'}`,
          color: isAmbientError ? '#f87171' : '#a78bfa', transition: 'all 0.25s ease',
        }}>
          <span style={{
            width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
            background: isAmbientError ? '#f87171' : isFetching ? '#a78bfa' : '#34d399',
            boxShadow: isFetching ? '0 0 6px #a78bfa88' : undefined,
            animation: isFetching ? 'ambientPulse 1.2s ease-in-out infinite' : undefined,
          }} />
          <span style={{ flex: 1, opacity: 0.85 }}>
            {isAmbientError ? 'agent · fetch failed' : isFetching ? 'agent · listening…' : `agent · ${ambientQueueSize ?? 0} queued`}
          </span>
          {ambientLastReason && !isAmbientError && (
            <button
              onClick={() => setReasonExpanded(v => !v)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontSize: 10, opacity: 0.65, padding: '0 2px', letterSpacing: '0.06em', textTransform: 'uppercase' }}
            >{reasonExpanded ? 'hide' : 'why?'}</button>
          )}
        </div>
      )}
      {showAmbientBar && reasonExpanded && ambientLastReason && (
        <div style={{
          margin: '-8px 0 8px', padding: '8px 12px', borderRadius: '0 0 6px 6px',
          background: 'rgba(167,139,250,0.05)', border: '1px solid rgba(167,139,250,0.12)', borderTop: 'none',
          fontSize: 11, lineHeight: 1.6, color: 'var(--fg3, #c4b5fd)', fontStyle: 'italic',
        }}>{ambientLastReason}</div>
      )}

      {/* Library tab */}
      {activeTab === 'library' && (
        <>
          {recommendedTracks?.tracks && recommendedTracks.tracks.length > 0 && !recommendLoading && (
            <div className="rec-section">
              <div className="rec-banner">
                <div className="rec-banner-left"><span className="rec-banner-icon">✦</span><span>Made for you</span></div>
                <button className="rec-banner-clear" onClick={onClearRecommendations}>✕ Clear</button>
              </div>
              <div className="track-grid">
                {recommendedTracks.tracks.filter(t => t.id !== recommendedTracks.sourceId).map(renderCard)}
              </div>
            </div>
          )}

          {!loading && filtered.length === 0 && (
            <div className="empty-state">
              <div className="empty-icon">♪</div>
              <p>{search ? 'No tracks in your library match.' : 'No tracks published yet.'}</p>
            </div>
          )}

          {(loading || filtered.length > 0) && (
            <div className="track-grid">
              {loading ? renderSkeleton(12) : filtered.map(renderCard)}
            </div>
          )}

          <div style={{ height: 200 }} />
          <div ref={sentinelRef} style={{ height: 1 }} />

          {loadingMore && (
            <div className="chain-loading" style={{ padding: '20px 0' }}>
              <span className="upload-spinner" />Loading more…
            </div>
          )}
          {!hasMore && !search && tracks.length > 0 && (
            <div className="end-of-list">that's everything ✦</div>
          )}
        </>
      )}

      {/* MusicBrainz tab */}
      {activeTab === 'mb' && (
        <>
          {fallbackLoading && <div className="track-grid">{renderSkeleton(6)}</div>}
          {!fallbackLoading && fallbackTracks && fallbackTracks.length > 0 && (
            <div className="track-grid">{fallbackTracks.map(renderCard)}</div>
          )}
          {!fallbackLoading && (!fallbackTracks || fallbackTracks.length === 0) && (
            <div className="empty-state">
              <div className="empty-icon">♪</div>
              <p>No results on MusicBrainz.</p>
            </div>
          )}
          <div style={{ height: 200 }} />
        </>
      )}

      <style>{`
        @keyframes ambientPulse { 0%,100%{opacity:.4;transform:scale(1)} 50%{opacity:1;transform:scale(1.3)} }
      `}</style>

      {publishingTrack && (
        <PublishModal
          track={publishingTrack.track}
          accentColor={publishingTrack.color}
          fangorn={fangorn ?? null}
          publisherAddress={publisherAddress ?? null}
          onClose={() => setPublishingTrack(null)}
          onPublished={() => setPublishingTrack(null)}
        />
      )}
    </div>
  )
}

function MbIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" style={{ flexShrink: 0 }}>
      <rect width="20" height="20" rx="3" fill="rgba(167,139,250,0.2)" />
      <text x="2" y="14" fontSize="11" fontWeight="700" fill="rgba(167,139,250,0.9)" fontFamily="monospace">mb</text>
    </svg>
  )
}

function SpotifyIcon({ width = 14, height = 14, style }: { width?: number; height?: number; style?: React.CSSProperties }) {
  return (
    <svg width={width} height={height} viewBox="0 0 24 24" fill="none" style={style}>
      <circle cx="12" cy="12" r="12" fill="#1DB954" />
      <path d="M17.25 16.5a.75.75 0 01-.41-.12C14.67 15 11.5 14.6 7.81 15.43a.75.75 0 01-.32-1.46c4.07-.9 7.57-.45 10.18 1.14a.75.75 0 01-.42 1.39zm1.26-2.89a.94.94 0 01-.52-.15c-2.66-1.63-6.71-2.1-9.85-1.15a.94.94 0 11-.54-1.8c3.57-1.07 8.01-.56 11.05 1.32a.94.94 0 01-.53 1.73l-.61.05zm.12-3a.94.94 0 01-.47-.12C15.31 8.81 10.22 8.6 7.18 9.52a.94.94 0 01-.56-1.79c3.47-1.08 9.23-.87 12.87 1.28a.94.94 0 01-.47 1.76l-.37-.27z" fill="white" />
    </svg>
  )
}