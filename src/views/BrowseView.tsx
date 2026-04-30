import { useEffect, useRef, useState, useMemo } from 'react'
import type { RecommendedTracks, Track } from '../types'
import { TrackDetails } from './TrackDetails'
import './mobile.css'

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
}

export function BrowseView({
  tracks, loading, loadingMore, error, hasMore, loadMore, search, setSearch,
  recommendedTracks, recommendLoading, onClearRecommendations,
}: BrowseViewProps) {
  const sentinelRef = useRef<HTMLDivElement>(null)
  const [genreFilter, setGenreFilter] = useState('all')
  const [moodFilter, setMoodFilter] = useState('all')
  const [detailsTrack, setDetailsTrack] = useState<Track | null>(null)

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

  const genreColor = useMemo(() => {
    const map: Record<string, string> = {}
    genres.forEach((g, i) => { map[g] = GENRE_PALETTE[i % GENRE_PALETTE.length] })
    return map
  }, [genres])

  // ── client-side filter ───────────────────────────────────────────────
  const filtered = useMemo(() => {
    return tracks.filter(t => {
      if (genreFilter !== 'all' && !t.genres.includes(genreFilter)) return false
      if (moodFilter !== 'all' && !t.moods.includes(moodFilter)) return false
      return true
    })
  }, [tracks, genreFilter, moodFilter])

  const hasActiveFilter = genreFilter !== 'all' || moodFilter !== 'all'

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

  // ── card ─────────────────────────────────────────────────────────────
  const renderCard = (track: Track) => {
    const accentColor = hashColor(track.id)
    const primaryGenre = track.genres[0] ?? null
    const primaryGenreColor = primaryGenre ? (genreColor[primaryGenre] ?? accentColor) : accentColor

    return (
      <div
        key={track.id}
        className="tg-card"
        style={{ borderTop: `2px solid ${primaryGenreColor}` }}
        onClick={() => setDetailsTrack(track)}
      >
        {/* Art / initial block */}
        <div className="tg-art" style={{ background: `${primaryGenreColor}40` }}>
          <span className="tg-art-initial" style={{ color: primaryGenreColor }}>
            {track.title.slice(0, 1).toUpperCase()}
          </span>
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

        {/* Body */}
        <div className="tg-body">
          <div className="tg-title">{track.title}</div>
          <div className="tg-artist">
            {track.artist}
            {track.year !== null && (
              <span className="tg-year"> · {track.year}</span>
            )}
          </div>

          {/* Genres */}
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

          {/* Moods */}
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

          {/* Energy */}
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

        <div className="tg-action tg-action--browse">
          <span className="tg-action-verb">view →</span>
        </div>
      </div>
    )
  }

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
        <span className="browse-count">{filtered.length} of {tracks.length}</span>
      </div>

      {/* Filters */}
      <div className="browse-filters">
        <div className="bf-group">
          <span className="bf-label">Genre</span>
          <div className="bf-pills">
            <button
              className={`bf-pill ${genreFilter === 'all' ? 'bf-pill--active' : ''}`}
              onClick={() => setGenreFilter('all')}
            >All</button>
            {genres.map(g => (
              <button
                key={g}
                className={`bf-pill ${genreFilter === g ? 'bf-pill--active' : ''}`}
                onClick={() => setGenreFilter(g)}
                style={genreFilter === g ? {
                  background: (genreColor[g] ?? '#888') + '22',
                  borderColor: (genreColor[g] ?? '#888') + '88',
                  color: genreColor[g] ?? '#888',
                } : {}}
              >{g}</button>
            ))}
          </div>
        </div>

        <div className="bf-group">
          <span className="bf-label">Mood</span>
          <div className="bf-pills">
            <button
              className={`bf-pill ${moodFilter === 'all' ? 'bf-pill--active' : ''}`}
              onClick={() => setMoodFilter('all')}
            >All</button>
            {moods.map(m => (
              <button
                key={m}
                className={`bf-pill ${moodFilter === m ? 'bf-pill--active' : ''}`}
                onClick={() => setMoodFilter(m)}
              >{m}</button>
            ))}
          </div>
        </div>

        {hasActiveFilter && (
          <button
            className="bf-clear-all"
            onClick={() => { setGenreFilter('all'); setMoodFilter('all') }}
          >Clear filters</button>
        )}
      </div>

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
                <div className="tg-art tg-skel" />
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

      {detailsTrack && (
        <TrackDetails
          track={detailsTrack}
          color={hashColor(detailsTrack.id)}
          onClose={() => setDetailsTrack(null)}
        />
      )}
    </div>
  )
}