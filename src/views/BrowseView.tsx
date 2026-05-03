import { useEffect, useRef, useState, useMemo } from 'react'
import type { RecommendedTracks, Track } from '../types'
import { TrackDetails } from './TrackDetails'
import { PolyHalftone } from './PolyHalftone'
import './mobile.css'
import './Browse-Filters.css'

const GENRE_PALETTE = [
  '#a78bfa', '#60a5fa', '#f472b6', '#22c55e',
  '#f97316', '#7c5de8', '#f87171', '#34d399',
]

// Stable color from any string (id, genre name, etc.)
function hashColor(str: string): string {
  let h = 0
  for (let i = 0; i < str.length; i++) h = (Math.imul(31, h) + str.charCodeAt(i)) | 0
  return GENRE_PALETTE[Math.abs(h) % GENRE_PALETTE.length]
}

// ─── Spotify deep-link routing ───────────────────────────────────────
type SpotifyRoute =
  | { kind: 'track'; url: string }
  | { kind: 'search'; url: string }

export function spotifyRoute(track: Track): SpotifyRoute {
  const q = encodeURIComponent(`${track.title} ${track.artist}`.trim())
  return { kind: 'search', url: `spotify:search:${q}` }
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
}

export function BrowseView({
  tracks, loading, loadingMore, error, hasMore, loadMore, search, setSearch,
  recommendedTracks, recommendLoading, onClearRecommendations, onCallAgent
}: BrowseViewProps) {
  const sentinelRef = useRef<HTMLDivElement>(null)
  const [genreFilter, setGenreFilter] = useState('all')
  const [moodFilter, setMoodFilter] = useState('all')
  const [contextFilter, setContextFilter] = useState('all')
  const [detailsTrack, setDetailsTrack] = useState<Track | null>(null)
  const [filterOpen, setFilterOpen] = useState(false)

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

  // ── client-side filter ───────────────────────────────────────────────
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

  // ── infinite scroll ──────────────────────────────────────────────────
  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      entries => { if (entries[0].isIntersecting) loadMore() },
      { rootMargin: '300px' }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [loadMore])

  // ── lock body scroll + esc-to-close while sheet is open ─────────────
  useEffect(() => {
    if (!filterOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFilterOpen(false)
    }
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
    const route = spotifyRoute(track)
    const playLabel = route.kind === 'track' ? 'Play on Spotify' : 'Find on Spotify'

    return (
      <div
        key={track.id}
        className="tg-card"
        style={{ borderTop: `2px solid ${primaryGenreColor}` }}
        onClick={() => setDetailsTrack(track)}
      >
        <div className="tg-art" style={{ backgroundImage: `url(https://dn711103.ca.archive.org/0/items/mbid-${track.mbid}.jpg)` }}>
          <span className="tg-art-initial" style={{ color: primaryGenreColor }}>
            {track.title.slice(0, 1).toUpperCase()}
          </span>

          <a
            href={route.url}
            rel={route.kind === 'search' ? 'noopener noreferrer' : undefined}
            className={`tg-play-btn${route.kind === 'search' ? ' tg-play-btn--search' : ''}`}
            aria-label={playLabel}
            title={playLabel}
            onClick={e => e.stopPropagation()}
            style={{ background: primaryGenreColor }}
          >
            <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true">
              <path d="M8 5v14l11-7z" />
            </svg>
          </a>

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
            {track.year !== null && (
              <span className="tg-year"> · {track.year}</span>
            )}
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
                >
                  {g}
                </span>
              ))}
            </div>
          )}

          {track.moods.length > 0 && (
            <div className="tg-meta tg-meta--moods">
              {track.moods.slice(0, 3).map(m => (
                <span
                  key={m}
                  className="tg-mood"
                  onClick={e => { e.stopPropagation(); setMoodFilter(m) }}
                >
                  {m}
                </span>
              ))}
            </div>
          )}

          {track.contexts.length > 0 && (
            <div className="tg-meta tg-meta--moods">
              {track.contexts.slice(0, 3).map(c => (
                <span
                  key={c}
                  className="tg-mood"
                  onClick={e => { e.stopPropagation(); setContextFilter(c) }}
                >
                  {c}
                </span>
              ))}
            </div>
          )}

          {track.energy !== null && (
            <div className="tg-energy">
              <span className="tg-energy-label">energy</span>
              <div className="tg-energy-track">
                <div
                  className="tg-energy-fill"
                  style={{
                    width: `${Math.round(track.energy * 100)}%`,
                    background: primaryGenreColor,
                  }}
                />
              </div>
              <span className="tg-energy-val">{Math.round(track.energy * 100)}</span>
            </div>
          )}
        </div>
      </div>
    )
  }

  // ── sheet section helper ─────────────────────────────────────────────
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
              style={active && c ? {
                background: c + '22',
                borderColor: c + '88',
                color: c,
              } : undefined}
            >{v}</button>
          )
        })}
      </div>
    </section>
  )

  return (
    <div className="browse-view">
      {/* Toolbar */}
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

        <span className="browse-count">{filtered.length} of {tracks.length}</span>
      </div>

      {/* Active filter chips — only shown when filters are applied */}
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

      {/* Recommendations */}
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

      {/* Main grid */}
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

      {/* Filter sheet */}
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
        />
      )}
    </div>
  )
}