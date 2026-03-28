import { useState, useEffect, useRef } from 'react'
import { TrackCard } from '../components/TrackCard'
import type { Track } from '../types'

interface BrowseViewProps {
  tracks: Track[]
  loading: boolean
  loadingMore: boolean
  error: string | null
  hasMore: boolean
  loadMore: () => void
  search: string
  setSearch: (s: string) => void
  onPlay: (track: Track) => void
  currentTrack: Track | null
}

export function BrowseView({
  tracks, loading, loadingMore, error, hasMore, loadMore,
  search, setSearch, onPlay, currentTrack
}: BrowseViewProps) {
  const sentinelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      entries => { if (entries[0].isIntersecting) loadMore() },
      { rootMargin: '200px' }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [loadMore])

  return (
    <div className="browse-view">

      <div className="browse-toolbar">
        <div className="search-box">
          <span className="search-icon">⌕</span>
          <input
            className="search-input"
            type="text"
            placeholder="Search artists or titles…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            spellCheck={false}
          />
          {search && (
            <button className="search-clear" onClick={() => setSearch('')}>✕</button>
          )}
        </div>
        <span className="browse-count">{tracks.length} tracks</span>
      </div>

      {loading && (
        <div className="chain-loading">
          <span className="upload-spinner" />
          {search ? 'Searching…' : 'Loading tracks…'}
        </div>
      )}

      {error && <div className="upload-error">{error}</div>}

      {!loading && !error && tracks.length === 0 && (
        <div className="empty-state">
          <div className="empty-icon">♪</div>
          <p>{search ? `No results for "${search}"` : 'No tracks published yet.'}</p>
        </div>
      )}

      <div className="track-grid">
        {tracks.map(track => (
          <TrackCard
            key={track.id}
            track={track}
            onPlay={onPlay}
            isPlaying={currentTrack?.id === track.id}
          />
        ))}
      </div>

      <div ref={sentinelRef} style={{ height: 1 }} />

      {loadingMore && (
        <div className="chain-loading" style={{ padding: '24px 0' }}>
          <span className="upload-spinner" />
          Loading more…
        </div>
      )}

      {!hasMore && !search && tracks.length > 0 && (
        <div className="end-of-list">that's everything ✦</div>
      )}
    </div>
  )
}