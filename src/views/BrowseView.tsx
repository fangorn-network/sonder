import { useEffect, useRef, useState } from 'react'
import type { Track } from '../types'
import { useFangornMiddleware } from '../hooks/useX402fFetch'
import { useWallets } from '@privy-io/react-auth'
import { FangornConfig } from '@fangorn-network/sdk'
import { FangornX402Middleware } from '@fangorn-network/fetch'
import { getAddress, type Hex } from 'viem'

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
  // onBuy: (track: Track) => void
  currentTrack: Track | null
}

export function BrowseView({
  tracks, loading, loadingMore, error, hasMore, loadMore,
  search, setSearch, onPlay, currentTrack
}: BrowseViewProps) {
  const sentinelRef = useRef<HTMLDivElement>(null)
  const [buying, setBuying] = useState<string | null>(null)
  const [buyError, setBuyError] = useState<string | null>(null)

  const middleware = useFangornMiddleware()

  async function handleBuy(track: Track) {
    console.log('start buy')
    if (!middleware) return
    setBuyError(null)
    setBuying(track.id)
    try {
      const result = await middleware.fetchResource({
        owner: '0x147c24c5Ea2f1EE1ac42AD16820De23bBba45Ef6',
        schemaName: 'fangorn.music.demo.v0',
        tag: track.tag,
        baseUrl: '/facilitator',
      });

      console.log('result status ' + JSON.stringify(result))

      const bytes = result.data!
      const magic = bytes.slice(0, 4)
      const isMP3 = magic[0] === 0x49 && magic[1] === 0x44 && magic[2] === 0x33
        || magic[0] === 0xFF && (magic[1] & 0xE0) === 0xE0
      const isWAV = magic[0] === 0x52 && magic[1] === 0x49 && magic[2] === 0x46 && magic[3] === 0x46
      if (!isMP3 && !isWAV) throw new Error('Downloaded file does not appear to be valid audio')

      const blob = new Blob([bytes.buffer.slice(0) as ArrayBuffer], { type: 'audio/mpeg' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${track.title}.mp3`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e: any) {
      setBuyError(e?.message ?? 'Purchase failed')
    } finally {
      setBuying(null)
    }
  }

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

      {error && <div className="upload-error">{error}</div>}
      {buyError && <div className="upload-error">{buyError}</div>}

      {!loading && !error && tracks.length === 0 && (
        <div className="empty-state">
          <div className="empty-icon">♪</div>
          <p>{search ? `No results for "${search}"` : 'No tracks published yet.'}</p>
        </div>
      )}

      {(loading || tracks.length > 0) && (
        <table className="track-table">
          <thead>
            <tr>
              <th className="tt-col-num">#</th>
              <th className="tt-col-title">Title</th>
              <th className="tt-col-album">Album</th>
              <th className="tt-col-genre">Genre</th>
              <th className="tt-col-dur">Duration</th>
              <th className="tt-col-price">Price</th>
              <th className="tt-col-buy"></th>
            </tr>
          </thead>
          <tbody>
            {loading
              ? Array.from({ length: 6 }).map((_, i) => (
                <tr key={i} className="tt-row tt-row--skeleton">
                  <td><div className="tt-skel tt-skel--sm" /></td>
                  <td>
                    <div className="tt-row-title-wrap">
                      <div className="tt-skel tt-skel--art" />
                      <div>
                        <div className="tt-skel tt-skel--md" />
                        <div className="tt-skel tt-skel--sm" style={{ marginTop: 5 }} />
                      </div>
                    </div>
                  </td>
                  <td><div className="tt-skel tt-skel--md" /></td>
                  <td><div className="tt-skel tt-skel--sm" /></td>
                  <td><div className="tt-skel tt-skel--sm" /></td>
                  <td><div className="tt-skel tt-skel--sm" /></td>
                  <td />
                </tr>
              ))
              : tracks.map((track, i) => {
                const isPlaying = currentTrack?.id === track.id
                const isFree = !track.price || track.price === '0'
                const isBuying = buying === track.id
                return (
                  <tr
                    key={track.id}
                    className={`tt-row ${isPlaying ? 'tt-row--playing' : ''}`}
                    onClick={() => onPlay(track)}
                  >
                    <td className="tt-cell-num">
                      {isPlaying
                        ? <span className="tt-eq"><span /><span /><span /></span>
                        : <span className="tt-num">{i + 1}</span>
                      }
                    </td>

                    <td className="tt-cell-title">
                      <div className="tt-row-title-wrap">
                        <div className="tt-art" style={{ '--hue': (parseInt(track.owner.slice(2, 8), 16) * 67 + 180) % 360 } as React.CSSProperties}>
                          {track.art
                            ? <img src={track.art} alt="" className="tt-art-img" />
                            : <span className="tt-art-initials">{track.title.slice(0, 1).toUpperCase()}</span>
                          }
                        </div>
                        <div>
                          <div className="tt-title">{track.title}</div>
                          <div className="tt-artist">{track.artist}</div>
                        </div>
                      </div>
                    </td>

                    <td className="tt-cell-album">
                      <span className="tt-album">{track.album ?? '—'}</span>
                    </td>

                    <td className="tt-cell-genre">
                      {track.genre && <span className="tt-genre">{track.genre}</span>}
                    </td>

                    <td className="tt-cell-dur">
                      <span className="tt-dur">{track.duration ?? '—'}</span>
                    </td>

                    <td className="tt-cell-price">
                      {isFree
                        ? <span className="tt-price tt-price--free">free</span>
                        : <span className="tt-price">{track.price} {track.currency}</span>
                      }
                    </td>

                    <td className="tt-cell-buy" onClick={e => e.stopPropagation()}>
                      {!isFree && (
                        <button
                          className="tt-buy-btn"
                          disabled={isBuying}
                          onClick={() => handleBuy(track)}
                          title={`Buy ${track.title}`}
                        >
                          {isBuying ? <span className="upload-spinner" /> : 'Buy'}
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })
            }
          </tbody>
        </table>
      )}

      <div ref={sentinelRef} style={{ height: 1 }} />

      {loadingMore && (
        <div className="chain-loading" style={{ padding: '20px 0' }}>
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