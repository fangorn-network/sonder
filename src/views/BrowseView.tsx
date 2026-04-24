import { useEffect, useRef, useState, useMemo } from 'react'
import type { Track } from '../types'
import { useFangornMiddleware } from '../hooks/useX402fFetch'
import { usePrivy } from '@privy-io/react-auth'
import { useFirebase } from '../hooks/useFirebase'
import './mobile.css'

const toUsdc = (raw: string | undefined): number => {
  if (!raw || raw === '0') return 0
  return Number(raw) / 1_000_000
}

const fmtUsdc = (raw: string | undefined): string => {
  const n = toUsdc(raw)
  if (n === 0) return 'free'
  return n < 0.01
    ? `$${n.toFixed(6)}`
    : `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}`
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
  onPlay: (track: Track) => void
  currentTrack: Track | null
}

type PriceFilter = 'all' | 'free' | 'paid'

const GENRE_PALETTE = [
  '#a78bfa',
  '#60a5fa',
  '#f472b6',
  '#22c55e',
  '#f97316',
  '#7c5de8',
  '#f87171',
  '#34d399',
]

export function BrowseView({
  tracks, loading, loadingMore, error, hasMore, loadMore,
  search, setSearch, onPlay, currentTrack
}: BrowseViewProps) {
  const sentinelRef = useRef<HTMLDivElement>(null)
  const [buying, setBuying] = useState<string | null>(null)
  const [buyError, setBuyError] = useState<string | null>(null)
  const [justBought, setJustBought] = useState<string | null>(null)
  const [genreFilter, setGenreFilter] = useState('all')
  const [priceFilter, setPriceFilter] = useState<PriceFilter>('all')
  const [maxPrice, setMaxPrice] = useState('')
  const [ownerFilter, setOwnerFilter] = useState('')

  const middleware = useFangornMiddleware()
  const { user } = usePrivy()
  const { addToLibrary, isInLibrary } = useFirebase(user?.id ?? null)

  const genres = useMemo(() => {
    const set = new Set<string>()
    tracks.forEach(t => { if (t.genre) set.add(t.genre) })
    return Array.from(set).sort()
  }, [tracks])

  const genreColor = useMemo(() => {
    const map: Record<string, string> = {}
    genres.forEach((g, i) => { map[g] = GENRE_PALETTE[i % GENRE_PALETTE.length] })
    return map
  }, [genres])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const maxUsdc = maxPrice !== '' ? parseFloat(maxPrice) : null
    return tracks.filter(t => {
      if (q && ![t.title, t.artist, t.album, t.genre].some(s => s?.toLowerCase().includes(q))) return false
      if (genreFilter !== 'all' && t.genre !== genreFilter) return false
      const isFree = !t.price || t.price === '0'
      if (priceFilter === 'free' && !isFree) return false
      if (priceFilter === 'paid' && isFree) return false
      if (maxUsdc !== null && !isFree && toUsdc(t.price) > maxUsdc) return false
      if (ownerFilter.trim() && !t.owner.toLowerCase().includes(ownerFilter.trim().toLowerCase())) return false
      return true
    })
  }, [tracks, search, genreFilter, priceFilter, maxPrice, ownerFilter])

  const hasActiveFilter = genreFilter !== 'all' || priceFilter !== 'all' || maxPrice !== '' || ownerFilter !== ''

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

  async function handleBuy(e: React.MouseEvent, track: Track) {
    e.stopPropagation()
    if (!middleware) return

    setBuyError(null)
    setBuying(track.id)

    try {
      console.log('x402f fetch')
      const result = await middleware.fetchResource({
        owner: track.owner as `0x${string}`,
        schemaName: track.datasourceName,
        name: track.name,
        baseUrl: '/facilitator'
      })

      if (!result.data) {
        console.log(JSON.stringify(result))
        throw new Error('No data returned')
      }

      const bytes = result.data instanceof Uint8Array
        ? result.data
        : new Uint8Array(result.data as ArrayBuffer)

      // todo: check result status
      // write to library
      console.log('writing to library: ' + track.id + ' with nullifier ' + result.paymentResponse)
      // payment response = nullifier
      addToLibrary(track.id, result.paymentResponse as string)
      setJustBought(track.id)
      setTimeout(() => setJustBought(null), 2000)

      const magic = bytes.slice(0, 4)
      const isMP3 = (magic[0] === 0x49 && magic[1] === 0x44 && magic[2] === 0x33)
        || (magic[0] === 0xFF && (magic[1] & 0xE0) === 0xE0)
      const isWAV = magic[0] === 0x52 && magic[1] === 0x49 && magic[2] === 0x46 && magic[3] === 0x46
      if (!isMP3 && !isWAV) throw new Error('Downloaded file does not appear to be valid audio')

      // // TODO: do we need to download here?
      // const blob = new Blob([bytes.buffer.slice(0) as ArrayBuffer], { type: 'audio/mpeg' })
      // const url = URL.createObjectURL(blob)
      // const a = document.createElement('a')
      // a.href = url; a.download = `${track.title}.mp3`; a.click()
      // URL.revokeObjectURL(url)

    } catch (e: any) {
      setBuyError(e?.message ?? 'Purchase failed')
    } finally {
      setBuying(null)
    }
  }

  const col = (track: Track) => genreColor[track.genre ?? ''] ?? '#888780'

  return (
    <div className="browse-view">

      {/* toolbar */}
      <div className="browse-toolbar">
        <div className="search-box">
          <span className="search-icon">⌕</span>
          <input
            className="search-input"
            type="text"
            placeholder="Search title, artist, album…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            spellCheck={false}
          />
          {search && <button className="search-clear" onClick={() => setSearch('')}>✕</button>}
        </div>
        <span className="browse-count">{filtered.length} of {tracks.length}</span>
      </div>

      {/* filters */}
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
                  background: genreColor[g] + '22',
                  borderColor: genreColor[g] + '88',
                  color: genreColor[g],
                } : {}}
              >{g}</button>
            ))}
          </div>
        </div>

        <div className="bf-group">
          <span className="bf-label">Price</span>
          <div className="bf-row">
            {(['all', 'free', 'paid'] as PriceFilter[]).map(p => (
              <button
                key={p}
                className={`bf-pill ${priceFilter === p ? 'bf-pill--active' : ''}`}
                onClick={() => setPriceFilter(p)}
              >{p}</button>
            ))}
            {priceFilter !== 'free' && (
              <div className="bf-max-wrap">
                <span className="bf-max-symbol">$</span>
                <input
                  className="bf-max-input"
                  type="number" min="0" step="0.01" placeholder="max"
                  value={maxPrice}
                  onChange={e => setMaxPrice(e.target.value)}
                />
              </div>
            )}
          </div>
        </div>

        <div className="bf-group">
          <span className="bf-label">Artist address</span>
          <div className="bf-addr-wrap">
            <input
              className="bf-addr-input"
              type="text" placeholder="0x…"
              value={ownerFilter}
              onChange={e => setOwnerFilter(e.target.value)}
              spellCheck={false}
            />
            {ownerFilter && <button className="search-clear" onClick={() => setOwnerFilter('')}>✕</button>}
          </div>
        </div>

        {hasActiveFilter && (
          <button className="bf-clear-all" onClick={() => {
            setGenreFilter('all'); setPriceFilter('all'); setMaxPrice(''); setOwnerFilter('')
          }}>Clear filters</button>
        )}
      </div>

      {error && <div className="upload-error">{error}</div>}
      {buyError && <div className="upload-error">{buyError}</div>}

      {!loading && filtered.length === 0 && (
        <div className="empty-state">
          <div className="empty-icon">♪</div>
          <p>{search || hasActiveFilter ? 'No tracks match your filters.' : 'No tracks published yet.'}</p>
        </div>
      )}

      {/* grid */}
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
                    <div className="tg-skel tg-skel--price" />
                  </div>
                </div>
              </div>
            ))
            : filtered.map(track => {
              const isPlaying = currentTrack?.id === track.id
              const isFree = !track.price || track.price === '0'
              const isBuying = buying === track.id
              const owned = isInLibrary(track.id)
              const justGot = justBought === track.id
              const color = col(track)

              return (
                <div
                  key={track.id}
                  className={`tg-card ${isPlaying ? 'tg-card--playing' : ''} ${owned ? 'tg-card--owned' : ''}`}
                  style={{ borderTop: `2px solid ${color}` }}
                  onClick={() => onPlay(track)}
                >
                  {/* art */}
                  <div className="tg-art" style={{ background: `${color}40` }}>
                    {false ? <div /> : (
                      <span className="tg-art-initial" style={{ color }}>
                        {track.title.slice(0, 1).toUpperCase()}
                      </span>
                    )}
                    {isPlaying && (
                      <div className="tg-eq" style={{ '--eq-color': color } as React.CSSProperties}>
                        <span /><span /><span />
                      </div>
                    )}
                    {owned && !isPlaying && (
                      <div className="tg-owned-badge">✓</div>
                    )}
                  </div>

                  {/* info */}
                  <div className="tg-body">
                    <div className="tg-title">{track.title}</div>
                    <div className="tg-artist">{track.artist}</div>
                    {track.genre && (
                      <div className="tg-meta">
                        <span
                          className="tg-genre"
                          style={{ color, background: `${color}15`, borderColor: `${color}30` }}
                        >
                          {track.genre}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* action row — always visible, replaces price in meta */}
                  {owned ? (
                    <div className="tg-action tg-action--owned">
                      <span className="tg-action-label">owned</span>
                      <span className="tg-action-verb">✓</span>
                    </div>
                  ) : justGot ? (
                    <div className="tg-action tg-action--owned">
                      <span className="tg-action-label">saved</span>
                      <span className="tg-action-verb">✦</span>
                    </div>
                  ) : (
                    <button
                      className={`tg-action tg-action--buy ${isFree ? 'tg-action--free' : ''}`}
                      disabled={isBuying}
                      onClick={e => handleBuy(e, track)}
                      style={!isFree ? { '--action-color': color } as React.CSSProperties : undefined}
                    >
                      {isBuying ? (
                        <>
                          <span className="upload-spinner" />
                          <span className="tg-action-verb">processing</span>
                        </>
                      ) : (
                        <>
                          <span className="tg-action-label">
                            {isFree ? 'free' : fmtUsdc(track.price)}
                          </span>
                          <span className="tg-action-verb">{isFree ? 'get →' : 'buy →'}</span>
                        </>
                      )}
                    </button>
                  )}

                  {/* info */}
                  {/* <div className="tg-body">
                    <div className="tg-title">{track.title}</div>
                    <div className="tg-artist">{track.artist}</div>
                    <div className="tg-meta">
                      {track.genre && (
                        <span
                          className="tg-genre"
                          style={{ color, background: `${color}15`, borderColor: `${color}30` }}
                        >
                          {track.genre}
                        </span>
                      )}
                      <span className={`tg-price ${isFree ? 'tg-price--free' : ''} ${owned ? 'tg-price--owned' : ''}`}>
                        {owned ? 'owned' : fmtUsdc(track.price)}
                      </span>
                    </div>
                  </div> */}

                  {/* buy / owned state */}
                  {/* {!owned && (
                    <button
                      className="tg-buy"
                      disabled={isBuying}
                      onClick={e => handleBuy(e, track)}
                      title={`Buy ${track.title}`}
                    >
                      {isBuying ? <span className="upload-spinner" /> : 'Buy'}
                    </button>
                  )} */}
                  {/* {justGot && (
                    <div className="tg-buy-confirm">saved ✦</div>
                  )} */}
                </div>
              )
            })
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
    </div>
  )
}