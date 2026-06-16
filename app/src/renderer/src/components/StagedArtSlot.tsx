/**
 * components/StagedArtSlot.tsx
 *
 * An artwork picker for the metadata editors (Label folder / Add details). Unlike
 * <LocalArtThumb>, which sets art immediately under a fixed key, this slot only
 * *stages* a chosen image — the caller commits it under the final artist/album
 * key on save (so renaming the artist/album before saving never orphans art).
 *
 * Two ways to choose:
 *   • a local file (the OS image picker), or
 *   • an online result (third-party search via the `onSearch` prop) — shown as a
 *     thumbnail grid; everything is a data URL so it renders under the app's CSP.
 *
 * What it shows, in priority order:
 *   1. the staged pick (local or remote, not yet saved),
 *   2. otherwise any art already stored for `artKey`,
 *   3. otherwise a placeholder.
 *
 * A small ✕ clears a staged pick. When `disabled` (e.g. the artist/album name
 * isn't filled in yet) the slot is inert and explains why via `disabledHint`.
 */

import { useEffect, useRef, useState } from 'react'
import { useLocalMusic, type ArtCandidate, type ArtScope } from '../providers/LocalMusicProvider'

const FG2 = 'var(--fg2)'
const FG3 = 'var(--fg3)'
const FG4 = 'var(--fg4)'
const BG1 = 'var(--bg1)'
const BG2 = 'var(--bg2)'
const ACCENT = 'var(--accent)'
const BORDER = 'var(--border)'
const BORDER2 = 'var(--border2)'
const MONO = 'var(--font-mono,"Fragment Mono","DM Mono",monospace)'

/** A staged (not-yet-saved) image: a local file path, or a remote URL. Both carry
 *  a `dataUrl` preview the slot renders immediately. */
export type StagedArt =
  | { source: 'local'; path: string; dataUrl: string }
  | { source: 'remote'; url: string; dataUrl: string }

export function StagedArtSlot({
  scope, shape, label, artKey, staged, onPick, onClear, onSearch,
  size = 64, disabled = false, disabledHint,
}: {
  scope: ArtScope
  shape: 'square' | 'circle'
  label: string
  /** Key for art already stored for the current (in-progress) names. */
  artKey: string
  staged: StagedArt | null
  onPick: (art: StagedArt) => void
  onClear: () => void
  /** Runs a third-party lookup for this scope; enables the "Online" button. */
  onSearch?: () => Promise<ArtCandidate[]>
  size?: number
  disabled?: boolean
  disabledHint?: string
}) {
  const lm = useLocalMusic()
  const [storedUrl, setStoredUrl] = useState<string | null>(null)

  // Online-search popover state.
  const [open, setOpen] = useState(false)
  const [searching, setSearching] = useState(false)
  const [results, setResults] = useState<ArtCandidate[] | null>(null)
  const wrapRef = useRef<HTMLDivElement | null>(null)

  // Fall back to whatever art is already stored under the current key — only when
  // nothing is staged (a staged pick always wins) and the slot is usable.
  useEffect(() => {
    if (staged || disabled || !artKey.trim()) { setStoredUrl(null); return }
    let cancelled = false
    lm.getArt(scope, artKey).then((u) => { if (!cancelled) setStoredUrl(u) })
    return () => { cancelled = true }
  }, [staged, disabled, scope, artKey, lm.artRev, lm.getArt])

  // Close the popover on outside click / Escape.
  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey) }
  }, [open])

  const url = staged?.dataUrl ?? storedUrl
  const radius = shape === 'circle' ? '50%' : 4

  const pickLocal = async () => {
    if (disabled) return
    const art = await lm.pickImage(scope)
    if (art) onPick({ source: 'local', path: art.path, dataUrl: art.dataUrl })
  }

  const runSearch = async () => {
    if (disabled || !onSearch) return
    setOpen(true)
    setSearching(true)
    setResults(null)
    try {
      setResults(await onSearch())
    } catch {
      setResults([])
    } finally {
      setSearching(false)
    }
  }

  const chooseRemote = (c: ArtCandidate) => {
    onPick({ source: 'remote', url: c.fullUrl, dataUrl: c.thumbDataUrl })
    setOpen(false)
  }

  const box: React.CSSProperties = {
    width: size, height: size, flexShrink: 0, borderRadius: radius,
    background: BG2, border: `1px solid ${BORDER2}`, overflow: 'hidden',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: 0, position: 'relative', cursor: disabled ? 'default' : 'pointer',
    opacity: disabled ? 0.5 : 1,
  }

  const inner = url ? (
    <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
  ) : (
    <svg width={Math.round(size * 0.5)} height={Math.round(size * 0.5)} viewBox="0 0 24 24" fill="none" stroke={FG4} strokeWidth="1.5" aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <path d="M21 15l-5-5L5 21" />
    </svg>
  )

  const glyph = url ? '⟳' : '+'

  return (
    <div ref={wrapRef} style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
      <div style={{ position: 'relative' }}>
        <button
          type="button"
          onClick={pickLocal}
          disabled={disabled}
          title={disabled ? (disabledHint ?? `Set ${label.toLowerCase()}`) : url ? `Replace ${label.toLowerCase()} (choose a file)` : `Add ${label.toLowerCase()} (choose a file)`}
          className="staged-art-slot"
          style={box}
        >
          {inner}
          {!disabled && (
            <span
              aria-hidden
              className="staged-art-slot__hint"
              style={{
                position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'rgba(0,0,0,0.45)', color: '#fff', fontSize: Math.max(13, size * 0.32), lineHeight: 1,
                opacity: 0, transition: 'opacity 0.14s ease', borderRadius: radius,
              }}
            >{glyph}</span>
          )}
        </button>
        {staged && (
          <button
            type="button"
            onClick={onClear}
            title="Remove chosen image"
            style={{
              position: 'absolute', top: -6, right: -6, width: 18, height: 18, borderRadius: '50%',
              background: ACCENT, color: '#fff', border: 'none', cursor: 'pointer',
              fontFamily: MONO, fontSize: 10, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >✕</button>
        )}
        <style>{`
          .staged-art-slot:hover .staged-art-slot__hint,
          .staged-art-slot:focus-visible .staged-art-slot__hint { opacity: 1; }
        `}</style>
      </div>

      <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase', color: staged ? ACCENT : FG3 }}>
        {label}
      </span>

      {/* Two ways to choose: a local file (the thumb above) or an online result. */}
      {onSearch && !disabled && (
        <button
          type="button"
          onClick={runSearch}
          title={`Search online for ${label.toLowerCase()}`}
          style={{
            background: 'none', border: `1px solid ${BORDER2}`, color: FG3, fontFamily: MONO,
            fontSize: 9, letterSpacing: '0.06em', textTransform: 'uppercase', padding: '3px 8px', cursor: 'pointer',
          }}
        >⌕ Online</button>
      )}

      {open && (
        <ResultsPopover
          searching={searching}
          results={results}
          shape={shape}
          onChoose={chooseRemote}
          onClose={() => setOpen(false)}
          onRetry={runSearch}
        />
      )}
    </div>
  )
}

// ─── Online results popover ─────────────────────────────────────────────────────

function ResultsPopover({
  searching, results, shape, onChoose, onClose, onRetry,
}: {
  searching: boolean
  results: ArtCandidate[] | null
  shape: 'square' | 'circle'
  onChoose: (c: ArtCandidate) => void
  onClose: () => void
  onRetry: () => void
}) {
  const radius = shape === 'circle' ? '50%' : 3
  return (
    <div
      style={{
        position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)', marginTop: 6, zIndex: 40,
        width: 248, maxHeight: 300, overflowY: 'auto', background: BG1,
        border: `1px solid ${BORDER}`, boxShadow: '0 10px 30px rgba(0,0,0,0.4)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', borderBottom: `1px solid ${BORDER2}` }}>
        <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: FG4 }}>
          {searching ? 'Searching…' : 'Pick an image'}
        </span>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: FG4, fontFamily: MONO, fontSize: 12, cursor: 'pointer', lineHeight: 1 }}>✕</button>
      </div>

      {searching && (
        <div style={{ padding: 18, textAlign: 'center', fontFamily: MONO, fontSize: 10.5, color: FG3 }}>Looking online…</div>
      )}

      {!searching && results && results.length === 0 && (
        <div style={{ padding: '16px 12px', textAlign: 'center' }}>
          <div style={{ fontFamily: MONO, fontSize: 10.5, color: FG3 }}>No results.</div>
          <button
            onClick={onRetry}
            style={{ marginTop: 10, background: 'none', border: `1px solid ${BORDER2}`, color: FG2, fontFamily: MONO, fontSize: 9.5, letterSpacing: '0.06em', textTransform: 'uppercase', padding: '4px 10px', cursor: 'pointer' }}
          >Retry</button>
        </div>
      )}

      {!searching && results && results.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, padding: 10 }}>
          {results.map((c, i) => (
            <button
              key={`${c.fullUrl}:${i}`}
              type="button"
              onClick={() => onChoose(c)}
              title={`${c.label} · ${c.source}`}
              style={{ padding: 0, border: `1px solid ${BORDER2}`, background: BG2, borderRadius: radius, overflow: 'hidden', cursor: 'pointer', aspectRatio: '1 / 1' }}
            >
              <img src={c.thumbDataUrl} alt={c.label} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
            </button>
          ))}
        </div>
      )}

      {!searching && results && results.length > 0 && (
        <div style={{ padding: '0 10px 10px', fontFamily: MONO, fontSize: 8.5, color: FG4, textAlign: 'center' }}>
          via {results[0].source}
        </div>
      )}
    </div>
  )
}
