import { useEffect } from 'react'
import type { Track } from '../types'
import { usePrivy } from '@privy-io/react-auth'
import { useFirebase } from '../hooks/useFirebase'
import './TrackDetails.css'

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

interface TrackDetailsProps {
  track: Track
  color: string
  buying: boolean
  onBuy: () => void
  onClose: () => void
}

export function TrackDetails({ track, color, buying, onBuy, onClose }: TrackDetailsProps) {
  const { user } = usePrivy()
  const { isInLibrary } = useFirebase(user?.id ?? null)
  const owned = isInLibrary(track.id)
  const isFree = !track.price || track.price === '0'

  // ESC to close
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [onClose])

  return (
    <div className="td-backdrop" onClick={onClose}>
      <div
        className="td-panel"
        onClick={e => e.stopPropagation()}
        style={{ '--td-color': color } as React.CSSProperties}
      >
        <div className="td-handle" aria-hidden />

        <button className="td-close" onClick={onClose} aria-label="Close">✕</button>

        <div className="td-art" style={{ background: `${color}40` }}>
          <span className="td-art-initial" style={{ color }}>
            {track.title.slice(0, 1).toUpperCase()}
          </span>
        </div>

        <div className="td-info">
          <h2 className="td-title">{track.title}</h2>
          <p className="td-artist">{track.artist}</p>
          {track.album && <p className="td-album">{track.album}</p>}

          <div className="td-tags">
            {track.genre && (
              <span className="td-tag" style={{ color, borderColor: `${color}40` }}>
                {track.genre}
              </span>
            )}
          </div>

          <dl className="td-fields">
            <div className="td-field">
              <dt>price</dt>
              <dd>{fmtUsdc(track.price)}</dd>
            </div>
            <div className="td-field">
              <dt>artist address</dt>
              <dd className="td-mono">{track.owner.slice(0, 6)}…{track.owner.slice(-4)}</dd>
            </div>
          </dl>
        </div>

        <div className="td-action">
          {owned ? (
            <button className="td-btn td-btn--owned" disabled>
              ✓ in library
            </button>
          ) : (
            <button
              className="td-btn td-btn--buy"
              onClick={onBuy}
              disabled={buying}
            >
              {buying
                ? <><span className="upload-spinner" /> processing</>
                : <>{isFree ? 'get' : `buy · ${fmtUsdc(track.price)}`} →</>
              }
            </button>
          )}
        </div>
      </div>
    </div>
  )
}