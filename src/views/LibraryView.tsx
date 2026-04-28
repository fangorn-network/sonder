import { useState, useMemo } from 'react'
import type { Track } from '../types'
import { usePrivy } from '@privy-io/react-auth'
import { useFirebase } from '../hooks/useFirebase'
// import { useLibrary } from '../hooks/useLibrary'

const GENRE_PALETTE = [
  '#a78bfa', '#60a5fa', '#f472b6', '#22c55e',
  '#f97316', '#7c5de8', '#f87171', '#34d399',
]

interface LibraryViewProps {
  tracks: Track[]
  loading: boolean
  onPlay: (track: Track) => void
  currentTrack: Track | null
	onFindSimilar: (track: Track) => void  // new
}

export function LibraryView({ tracks, loading, onPlay, currentTrack, onFindSimilar }: LibraryViewProps) {
  const [removing, setRemoving] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [activeGenres, setActiveGenres] = useState<Set<string>>(new Set())
  const [activeArtists, setActiveArtists] = useState<Set<string>>(new Set())
  const [showingOnly, setShowingOnly] = useState(false)
  const { user } = usePrivy()
  const { ids, removeFromLibrary } = useFirebase(user?.id ?? null)

  const owned = useMemo(() => {
    // console.log(tracks)
    return tracks.filter(t => ids.includes(t.id))
  },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tracks, ids.join(',')]
  )

  const genres = useMemo(() => {
    const set = new Set<string>()
    owned.forEach(t => { if (t.genre) set.add(t.genre) })
    return Array.from(set).sort()
  }, [owned])

  const artists = useMemo(() => {
    const set = new Set<string>()
    owned.forEach(t => { if (t.artist) set.add(t.artist) })
    return Array.from(set).sort()
  }, [owned])

  const genreColor = useMemo(() => {
    const map: Record<string, string> = {}
    genres.forEach((g, i) => { map[g] = GENRE_PALETTE[i % GENRE_PALETTE.length] })
    return map
  }, [genres])

  const col = (track: Track) => genreColor[track.genre ?? ''] ?? '#888780'

  const filtered = useMemo(() => {
    return owned.filter(t => {
      if (showingOnly && t.id !== currentTrack?.id) return false
      if (search && !t.title.toLowerCase().includes(search.toLowerCase())) return false
      if (activeGenres.size > 0 && (!t.genre || !activeGenres.has(t.genre))) return false
      if (activeArtists.size > 0 && (!t.artist || !activeArtists.has(t.artist))) return false
      return true
    })
  }, [owned, search, activeGenres, activeArtists, showingOnly, currentTrack])

  const hasActiveFilters = search || activeGenres.size > 0 || activeArtists.size > 0 || showingOnly

  function toggleGenre(g: string) {
    setActiveGenres(prev => {
      const next = new Set(prev)
      next.has(g) ? next.delete(g) : next.add(g)
      return next
    })
  }

  function toggleArtist(a: string) {
    setActiveArtists(prev => {
      const next = new Set(prev)
      next.has(a) ? next.delete(a) : next.add(a)
      return next
    })
  }

  function clearAll() {
    setSearch('')
    setActiveGenres(new Set())
    setActiveArtists(new Set())
    setShowingOnly(false)
  }

  function handleRemove(e: React.MouseEvent, track: Track) {
    e.stopPropagation()
    setRemoving(track.id)
    setTimeout(() => {
      removeFromLibrary(track.id)
      setRemoving(null)
    }, 300)
  }

  if (loading) {
    return (
      <div className="browse-view">
        <div className="chain-loading" style={{ padding: '60px 0' }}>
          <span className="upload-spinner" />
          Loading…
        </div>
      </div>
    )
  }

  return (
    <div className="browse-view">

      <div className="browse-toolbar">
        <span className="label-mono">Your Library</span>
        <span className="browse-count" style={{ marginLeft: 'auto' }}>
          {filtered.length}{filtered.length !== owned.length ? `/${owned.length}` : ''}{' '}
          {owned.length === 1 ? 'track' : 'tracks'}
        </span>
				{/* Update onFindSimilar to be more generic for mood buttons via a prompt builder. */}
					<button
						className="lib-row-similar"
						onClick={e => { e.stopPropagation(); onFindSimilar() }}
						title="Find similar in store"
					>
								  ✦
					</button>
      </div>

      {/* Filter bar */}
      {owned.length > 0 && (
        <div className="lib-filters">
          <div className="lib-search-wrap">
            <span className="lib-search-icon">⌕</span>
            <input
              className="lib-search"
              type="text"
              placeholder="Search titles…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            {search && (
              <button className="lib-search-clear" onClick={() => setSearch('')}>✕</button>
            )}
          </div>

          {currentTrack && ids.includes(currentTrack.id) && (
            <button
              className={`lib-pill lib-pill--playing ${showingOnly ? 'lib-pill--active' : ''}`}
              onClick={() => setShowingOnly(p => !p)}
            >
              ▶ Now playing
            </button>
          )}

          {genres.map(g => {
            const color = genreColor[g]
            const active = activeGenres.has(g)
            return (
              <button
                key={g}
                className={`lib-pill ${active ? 'lib-pill--active' : ''}`}
                style={active
                  ? { background: `${color}25`, borderColor: color, color }
                  : { borderColor: `${color}40`, color: 'var(--fg3)' }
                }
                onClick={() => toggleGenre(g)}
              >
                {g}
              </button>
            )
          })}

          {artists.length > 1 && artists.map(a => {
            const active = activeArtists.has(a)
            return (
              <button
                key={a}
                className={`lib-pill lib-pill--artist ${active ? 'lib-pill--active lib-pill--artist-active' : ''}`}
                onClick={() => toggleArtist(a)}
              >
                {a}
              </button>
            )
          })}

          {hasActiveFilters && (
            <button className="lib-pill lib-pill--clear" onClick={clearAll}>Clear</button>
          )}
        </div>
      )}

      {owned.length === 0 && (
        <div className="empty-state">
          <div className="empty-icon">♪</div>
          <p>Nothing here yet.</p>
          <p style={{ fontSize: 12, marginTop: 4, color: 'var(--fg3)' }}>
            Tracks you buy will appear here.
          </p>
        </div>
      )}

      {owned.length > 0 && filtered.length === 0 && (
        <div className="empty-state">
          <div className="empty-icon">∅</div>
          <p>No tracks match.</p>
          <button className="lib-pill lib-pill--clear" style={{ marginTop: 12 }} onClick={clearAll}>
            Clear filters
          </button>
        </div>
      )}

      {filtered.length > 0 && (
        <div className="lib-list">
          {filtered.map((track, i) => {
            const isPlaying = currentTrack?.id === track.id
            const isRemoving = removing === track.id
            const color = col(track)

            return (
              <div
                key={track.id}
                className={`lib-row ${isPlaying ? 'lib-row--playing' : ''} ${isRemoving ? 'lib-row--removing' : ''}`}
                onClick={() => onPlay(track)}
              >
                {/* index / eq indicator */}
                <div className="lib-row-num">
                  {isPlaying
                    ? <div className="lib-row-eq" style={{ '--eq-color': color } as React.CSSProperties}>
                      <span /><span /><span />
                    </div>
                    : <span className="lib-row-idx">{i + 1}</span>
                  }
                </div>

                {/* color accent swatch */}
                <div className="lib-row-swatch" style={{ background: color }} />

                {/* title + artist */}
                <div className="lib-row-info">
                  <span className="lib-row-title">{track.title}</span>
                  <span className="lib-row-artist">{track.artist}</span>
                </div>

                {/* genre */}
                {track.genre && (
                  <span className="lib-row-genre" style={{ color, borderColor: `${color}35` }}>
                    {track.genre}
                  </span>
                )}

                {/* remove */}
                <button
                  className="lib-row-remove"
                  onClick={e => handleRemove(e, track)}
                  title="Remove from library"
                >
                  ✕
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}