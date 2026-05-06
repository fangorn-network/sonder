import { useEffect, useRef, useState, useMemo } from 'react'
import type { RecommendedTracks, TasteSignal, Track } from '../types'
import { TrackDetails } from './TrackDetails'
import './mobile.css'
import './Browse-Filters.css'
import { useSpotifyContext } from '../providers/SpotifyProvider'

const GENRE_PALETTE = [
  '#a78bfa', '#60a5fa', '#f472b6', '#22c55e',
  '#f97316', '#7c5de8', '#f87171', '#34d399',
]

function hashColor(str: string): string {
  let h = 0
  for (let i = 0; i < str.length; i++) h = (Math.imul(31, h) + str.charCodeAt(i)) | 0
  return GENRE_PALETTE[Math.abs(h) % GENRE_PALETTE.length]
}

const EMPTY_TRACK: Track = {
  id: '', title: '', artist: '', year: null, energy: null,
  genres: [], moods: [], contexts: [], themes: [],
  owner: '', manifestStateId: '', datasourceName: '', mbid: null, name: '',
}

interface BrowseViewProps {
  tracks: Track[]
  loading: boolean
  loadingMore: boolean
  error: string | null
  hasMore: boolean
  loadMore: () => void
  search: string
  setSearch: (s: string) => void
  recommendedTracks?: RecommendedTracks | null
  recommendLoading?: boolean
  onClearRecommendations?: () => void
  onCallAgent: (query?: string) => void
  onFilteredChange?: (tracks: Track[]) => void
  onPlayingIdChange?: (id: string) => void
  onSignal?: (signal: TasteSignal) => void
}

async function fetchAlbumArt(title: string, artist: string): Promise<string | null> {
  try {
    const q = encodeURIComponent(`${artist} ${title}`)
    const res = await fetch(`https://itunes.apple.com/search?term=${q}&entity=song&limit=3`)
    const data = await res.json()
    const url = data.results?.[0]?.artworkUrl100
    if (url) return url.replace('100x100bb', '600x600bb')
  } catch { }

  try {
    const q = encodeURIComponent(`artist:"${artist}" track:"${title}"`)
    const res = await fetch(`https://api.deezer.com/search?q=${q}&limit=1`)
    const data = await res.json()
    const url = data.data?.[0]?.album?.cover_xl
    if (url) return url
  } catch { }

  return null
}

export function BrowseView({
  tracks, loading, loadingMore, error, hasMore, loadMore, search, setSearch,
  recommendedTracks, recommendLoading, onClearRecommendations, onCallAgent,
  onFilteredChange, onPlayingIdChange, onSignal
}: BrowseViewProps) {
  const sentinelRef = useRef<HTMLDivElement>(null)
  const [genreFilter, setGenreFilter] = useState('all')
  const [moodFilter, setMoodFilter] = useState('all')
  const [contextFilter, setContextFilter] = useState('all')
  const [detailsTrack, setDetailsTrack] = useState<Track | null>(null)
  const [filterOpen, setFilterOpen] = useState(false)
  const [playingId, setPlayingId] = useState<string | null>(null)
  const [albumArtCache, setAlbumArtCache] = useState<Record<string, string>>({})
  const fetchingRef = useRef<Set<string>>(new Set())

  const { searchAndPlay, connect, connected } = useSpotifyContext()

  const handlePlay = async (e: React.MouseEvent, track: Track) => {
    e.stopPropagation()
    if (!connected) { await connect(); return }
    setPlayingId(track.id)
    onPlayingIdChange?.(track.id)
    onSignal?.({ type: 'play', track, weight: 1.0 })
    try {
      const query = `${track.title} ${track.artist}`.replace(/\(.*?\)/g, '').trim()
      await searchAndPlay(query)
    } catch (err) {
      console.error('searchAndPlay failed:', err)
      setPlayingId(null)
    }
  }

  // ── derived filter sets ──────────────────────────────────────────────
  const genres = useMemo(() => {
    const set = new Set<string>()
    tracks.forEach(t => t.genres.forEach(g => set.add(g)))
    return Array.from(set).sort()
  }, [tracks])

  const moods = useMemo(() => {
    const set = new Set<string>()
    tracks.forEach(t => t.moods.forEach(m => set.add(m)))
    return Array.from(set).sort()
  }, [tracks])

  const contexts = useMemo(() => {
    const set = new Set<string>()
    tracks.forEach(t => t.contexts.forEach(c => set.add(c)))
    return Array.from(set).sort()
  }, [tracks])

  const genreColor = useMemo(() => {
    const map: Record<string, string> = {}
    genres.forEach((g, i) => { map[g] = GENRE_PALETTE[i % GENRE_PALETTE.length] })
    return map
  }, [genres])

  const filtered = useMemo(() => {
    return tracks.filter(t => {
      if (contextFilter !== 'all' && !t.contexts.includes(contextFilter)) return false
      if (genreFilter !== 'all' && !t.genres.includes(genreFilter)) return false
      if (moodFilter !== 'all' && !t.moods.includes(moodFilter)) return false
      return true
    })
  }, [tracks, contextFilter, genreFilter, moodFilter])

  const activeCount =
    (genreFilter !== 'all' ? 1 : 0) +
    (moodFilter !== 'all' ? 1 : 0) +
    (contextFilter !== 'all' ? 1 : 0)
  const hasActiveFilter = activeCount > 0

  const clearAll = () => {
    setGenreFilter('all')
    setMoodFilter('all')
    setContextFilter('all')
  }

  // ── taste signals from filter changes ────────────────────────────────
  useEffect(() => {
    if (genreFilter === 'all') return
    onSignal?.({ type: 'filter', weight: 0.5, track: { ...EMPTY_TRACK, genres: [genreFilter] } })
  }, [genreFilter])

  useEffect(() => {
    if (moodFilter === 'all') return
    onSignal?.({ type: 'filter', weight: 0.5, track: { ...EMPTY_TRACK, moods: [moodFilter] } })
  }, [moodFilter])

  useEffect(() => {
    if (contextFilter === 'all') return
    onSignal?.({ type: 'filter', weight: 0.5, track: { ...EMPTY_TRACK, contexts: [contextFilter] } })
  }, [contextFilter])

  // ── sync filtered tracks to parent ───────────────────────────────────
  useEffect(() => {
    onFilteredChange?.(filtered)
  }, [filtered])

  // ── album art fetching ───────────────────────────────────────────────
  useEffect(() => {
    if (filtered.length === 0) return
    const missing = filtered.filter(t => !albumArtCache[t.id] && !fetchingRef.current.has(t.id))
    if (missing.length === 0) return
    const batch = missing.slice(0, 20)
    batch.forEach((track, i) => {
      fetchingRef.current.add(track.id)
      setTimeout(async () => {
        const art = await fetchAlbumArt(track.title, track.artist)
        fetchingRef.current.delete(track.id)
        if (art) setAlbumArtCache(prev => ({ ...prev, [track.id]: art }))
      }, i * 50)
    })
  }, [filtered])

  // ── infinite scroll sentinel ─────────────────────────────────────────
  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      entries => { if (entries[0].isIntersecting) loadMore() },
      { rootMargin: '-100px' }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [loadMore])

  // ── filter sheet keyboard/scroll lock ────────────────────────────────
  useEffect(() => {
    if (!filterOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setFilterOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [filterOpen])

  // ── card ─────────────────────────────────────────────────────────────
  const renderCard = (track: Track) => {
    const accentColor = hashColor(track.id)
    const primaryGenre = track.genres[0] ?? null
    const primaryGenreColor = primaryGenre ? (genreColor[primaryGenre] ?? accentColor) : accentColor
    const isThisPlaying = playingId === track.id

    return (
      <div
        key={track.id}
        className="tg-card"
        onClick={() => setDetailsTrack(track)}
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
            style={{ background: primaryGenreColor, border: 'none', cursor: 'pointer' }}
          >
            {isThisPlaying
              ? <span style={{ fontSize: 10 }}>▐▐</span>
              : (
                <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true">
                  <path d="M8 5v14l11-7z" />
                </svg>
              )
            }
          </button>
          {track.energy !== null && (
            <div
              className="tg-energy-bar"
              style={{
                position: 'absolute',
                bottom: 0,
                left: 0,
                height: '3px',
                width: `${Math.round(track.energy * 100)}%`,
                background: primaryGenreColor,
                opacity: 0.8,
              }}
            />
          )}
        </div>

        <div className="tg-body">
          <div className="tg-title">{track.title}</div>
          <div className="tg-artist">
            {track.artist}
            {track.year !== null && <span className="tg-year"> · {track.year}</span>}
          </div>

          {track.genres.length > 0 && (
            <div className="tg-meta tg-meta--genres">
              {track.genres.slice(0, 3).map(g => (
                <span
                  key={g}
                  className="tg-genre"
                  style={{
                    color: genreColor[g] ?? accentColor,
                    background: `${genreColor[g] ?? accentColor}15`,
                    borderColor: `${genreColor[g] ?? accentColor}30`,
                  }}
                  onClick={e => { e.stopPropagation(); setGenreFilter(g) }}
                >{g}</span>
              ))}
            </div>
          )}

          {track.moods.length > 0 && (
            <div className="tg-meta tg-meta--moods">
              {track.moods.slice(0, 3).map(m => (
                <span
                  key={m}
                  className="tg-genre"
                  onClick={e => { e.stopPropagation(); setMoodFilter(m) }}
                >{m}</span>
              ))}
            </div>
          )}

          {track.contexts.length > 0 && (
            <div className="tg-meta tg-meta--moods">
              {track.contexts.slice(0, 3).map(c => (
                <span
                  key={c}
                  className="tg-genre"
                  onClick={e => { e.stopPropagation(); setContextFilter(c) }}
                >{c}</span>
              ))}
            </div>
          )}

          {track.energy !== null && (
            <div className="tg-energy">
              <span className="tg-energy-label">energy</span>
              <div className="tg-energy-track">
                <div
                  className="tg-energy-fill"
                  style={{ width: `${Math.round(track.energy * 100)}%`, background: primaryGenreColor }}
                />
              </div>
              <span className="tg-energy-val">{Math.round(track.energy * 100)}</span>
            </div>
          )}
        </div>
      </div>
    )
  }

  const renderSheetSection = (
    label: string,
    values: string[],
    current: string,
    setCurrent: (v: string) => void,
    colorize?: (v: string) => string,
  ) => (
    <section className="bv-sheet-section">
      <div className="bv-sheet-section-head">
        <span className="bv-sheet-section-label">{label}</span>
        <span className="bv-sheet-section-count">{values.length}</span>
      </div>
      <div className="bv-sheet-pills">
        <button
          className={`bf-pill ${current === 'all' ? 'bf-pill--active' : ''}`}
          onClick={() => setCurrent('all')}
        >All</button>
        {values.map(v => {
          const c = colorize?.(v)
          const active = current === v
          return (
            <button
              key={v}
              className={`bf-pill ${active ? 'bf-pill--active' : ''}`}
              onClick={() => setCurrent(v)}
              style={active && c ? { background: c + '22', borderColor: c + '88', color: c } : undefined}
            >{v}</button>
          )
        })}
      </div>
    </section>
  )

  return (
    <div className="browse-view">
      <div className="browse-toolbar">
        <div className="search-box">
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

        <button
          className={`bv-filter-btn${hasActiveFilter ? ' bv-filter-btn--active' : ''}`}
          onClick={() => setFilterOpen(true)}
          aria-label="Open filters"
        >
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M3 6h18M6 12h12M10 18h4" />
          </svg>
          <span>Filter</span>
          {hasActiveFilter && <span className="bv-filter-badge">{activeCount}</span>}
        </button>
      </div>

      {hasActiveFilter && (
        <div className="bv-active-chips">
          {genreFilter !== 'all' && (
            <button
              className="bv-active-chip"
              style={{
                color: genreColor[genreFilter],
                borderColor: `${genreColor[genreFilter] ?? '#888'}55`,
                background: `${genreColor[genreFilter] ?? '#888'}12`,
              }}
              onClick={() => setGenreFilter('all')}
              aria-label={`Remove genre: ${genreFilter}`}
            >
              <span className="bv-active-chip-cat">genre</span>
              <span className="bv-active-chip-val">{genreFilter}</span>
              <span className="bv-active-chip-x" aria-hidden="true">✕</span>
            </button>
          )}
          {moodFilter !== 'all' && (
            <button
              className="bv-active-chip"
              onClick={() => setMoodFilter('all')}
              aria-label={`Remove mood: ${moodFilter}`}
            >
              <span className="bv-active-chip-cat">mood</span>
              <span className="bv-active-chip-val">{moodFilter}</span>
              <span className="bv-active-chip-x" aria-hidden="true">✕</span>
            </button>
          )}
          {contextFilter !== 'all' && (
            <button
              className="bv-active-chip"
              onClick={() => setContextFilter('all')}
              aria-label={`Remove context: ${contextFilter}`}
            >
              <span className="bv-active-chip-cat">context</span>
              <span className="bv-active-chip-val">{contextFilter}</span>
              <span className="bv-active-chip-x" aria-hidden="true">✕</span>
            </button>
          )}
          <button className="bv-clear-link" onClick={clearAll}>Clear all</button>
        </div>
      )}

      {error && <div className="upload-error">{error}</div>}

      {!loading && filtered.length === 0 && (
        <div className="empty-state">
          <div className="empty-icon">♪</div>
          <p>{search || hasActiveFilter ? 'No tracks match your filters.' : 'No tracks published yet.'}</p>
        </div>
      )}

      {recommendedTracks?.tracks && recommendedTracks.tracks.length > 0 && !recommendLoading && (
        <div className="rec-section">
          <div className="rec-banner">
            <div className="rec-banner-left">
              <span className="rec-banner-icon">✦</span>
              <span>Made for you</span>
            </div>
            <button className="rec-banner-clear" onClick={onClearRecommendations}>✕ Clear</button>
          </div>
          <div className="track-grid">
            {recommendedTracks.tracks
              .filter(t => t.id !== recommendedTracks.sourceId)
              .map(renderCard)}
          </div>
        </div>
      )}

      {(loading || filtered.length > 0) && (
        <div className="track-grid">
          {loading
            ? Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="tg-card tg-card--skeleton">
                <div className="tg-skel" />
                <div className="tg-body">
                  <div className="tg-skel tg-skel--title" />
                  <div className="tg-skel tg-skel--sub" />
                  <div className="tg-meta">
                    <div className="tg-skel tg-skel--tag" />
                    <div className="tg-skel tg-skel--tag" />
                  </div>
                </div>
              </div>
            ))
            : filtered.map(renderCard)
          }
        </div>
      )}

      <div style={{ height: 200 }} />
      <div ref={sentinelRef} style={{ height: 1 }} />

      {loadingMore && (
        <div className="chain-loading" style={{ padding: '20px 0' }}>
          <span className="upload-spinner" />
          Loading more…
        </div>
      )}

      {!hasMore && !search && !hasActiveFilter && tracks.length > 0 && (
        <div className="end-of-list">that's everything ✦</div>
      )}

      {filterOpen && (
        <div
          className="bv-sheet-backdrop"
          onClick={() => setFilterOpen(false)}
          role="presentation"
        >
          <div
            className="bv-sheet"
            role="dialog"
            aria-modal="true"
            aria-label="Filters"
            onClick={e => e.stopPropagation()}
          >
            <div className="bv-sheet-handle" aria-hidden="true" />
            <header className="bv-sheet-header">
              <h2 className="bv-sheet-title">Filters</h2>
              <button
                className="bv-sheet-close"
                onClick={() => setFilterOpen(false)}
                aria-label="Close filters"
              >✕</button>
            </header>

            <div className="bv-sheet-body">
              {renderSheetSection('Genre', genres, genreFilter, setGenreFilter, g => genreColor[g])}
              {renderSheetSection('Mood', moods, moodFilter, setMoodFilter)}
              {renderSheetSection('Context', contexts, contextFilter, setContextFilter)}
            </div>

            <footer className="bv-sheet-footer">
              <button
                className="bv-sheet-btn bv-sheet-btn--ghost"
                onClick={clearAll}
                disabled={!hasActiveFilter}
              >Clear all</button>
              <button
                className="bv-sheet-btn bv-sheet-btn--primary"
                onClick={() => setFilterOpen(false)}
              >
                Show {filtered.length} {filtered.length === 1 ? 'track' : 'tracks'}
              </button>
            </footer>
          </div>
        </div>
      )}

      {detailsTrack && (
        <TrackDetails
          track={detailsTrack}
          color={hashColor(detailsTrack.id)}
          onClose={() => setDetailsTrack(null)}
          onCallAgent={onCallAgent}
          onFilter={(type, value) => {
            if (type === 'genre') setGenreFilter(value)
            if (type === 'mood') setMoodFilter(value)
            if (type === 'context') setContextFilter(value)
            setDetailsTrack(null)
          }}
        />
      )}
    </div>
  )
}