/**
 * components/LocalArtThumb.tsx
 *
 * Renders the stored album/artist artwork for a (scope, key), lazily fetched and
 * cached via LocalMusicProvider. Falls back to a placeholder when none is set.
 *
 * `hint` controls the interaction:
 *   - 'edit' — always clickable; hover shows + (add) or ⟳ (replace).
 *   - 'view' — clickable only when art exists; hover shows ⤢ (open full size).
 */

import { useEffect, useState } from 'react'
import { useLocalMusic, type ArtScope } from '../providers/LocalMusicProvider'

const FG4 = 'var(--fg4)'
const BG2 = 'var(--bg2)'
const BORDER2 = 'var(--border2)'

export function LocalArtThumb({
  scope, artKey, size = 40, shape = 'square', onClick, hint = 'edit', title,
}: {
  scope: ArtScope
  artKey: string
  size?: number
  shape?: 'square' | 'circle'
  onClick?: () => void
  hint?: 'edit' | 'view'
  title?: string
}) {
  const lm = useLocalMusic()
  const [url, setUrl] = useState<string | null | undefined>(undefined)

  useEffect(() => {
    let cancelled = false
    lm.getArt(scope, artKey).then((u) => { if (!cancelled) setUrl(u) })
    return () => { cancelled = true }
    // artRev bumps on set/clear so the thumb refreshes after edits.
  }, [scope, artKey, lm.artRev, lm.getArt])

  const radius = shape === 'circle' ? '50%' : 2
  const base: React.CSSProperties = {
    width: size, height: size, flexShrink: 0, borderRadius: radius,
    background: BG2, border: `1px solid ${BORDER2}`, overflow: 'hidden',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: 0, position: 'relative',
  }

  const inner = url ? (
    <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
  ) : (
    // Placeholder: faint image glyph. A "+" overlay hints at adding when clickable.
    <svg width={Math.round(size * 0.5)} height={Math.round(size * 0.5)} viewBox="0 0 24 24" fill="none" stroke={FG4} strokeWidth="1.5" aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <path d="M21 15l-5-5L5 21" />
    </svg>
  )

  // In 'view' mode there's nothing to open until art exists, so an empty thumb
  // stays a non-interactive placeholder.
  const interactive = !!onClick && (hint === 'edit' || !!url)
  if (!interactive) {
    return <div style={base} title={title}>{inner}</div>
  }

  const glyph = hint === 'view' ? '⤢' : url ? '⟳' : '+'
  const fallbackTitle = hint === 'view' ? 'View full size' : url ? 'Replace artwork' : 'Add artwork'

  return (
    <button
      type="button"
      onClick={onClick}
      title={title ?? fallbackTitle}
      className="local-art-thumb"
      style={{ ...base, cursor: hint === 'view' ? 'zoom-in' : 'pointer' }}
    >
      {inner}
      <span
        aria-hidden
        className="local-art-thumb__hint"
        style={{
          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(0,0,0,0.45)', color: '#fff', fontSize: Math.max(12, size * 0.35), lineHeight: 1,
          opacity: 0, transition: 'opacity 0.14s ease',
        }}
      >
        {glyph}
      </span>
      <style>{`
        .local-art-thumb:hover .local-art-thumb__hint,
        .local-art-thumb:focus-visible .local-art-thumb__hint { opacity: 1; }
      `}</style>
    </button>
  )
}
