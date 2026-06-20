/**
 * components/LocalTrackTagEditor.tsx
 *
 * Modal for tagging a local track with semantic taxonomy (genres / moods /
 * themes / contexts), shaped to schemas/TrackTaxonomySchema.json. The local-first
 * replacement for the network tag flow (components/TrackTag.tsx): tags are saved
 * to the local SQLite store via LocalMusicProvider and are NOT published or used
 * to generate embeddings — that capability is intentionally left off for users.
 *
 * Shares its controlled vocabulary with the network editor via
 * constants/taxonomy.ts.
 */

import { useCallback, useEffect, useMemo, useState, type KeyboardEvent } from 'react'
import { useLocalMusic, type LocalTrack, type LocalTrackTags } from '../providers/LocalMusicProvider'
import {
  TAXONOMY, DIMENSION_LABELS, DIMENSION_ORDER, MAX_PER_DIM, type Dimension,
} from '../constants/taxonomy'

const BG1 = 'var(--bg1)'
const BG2 = 'var(--bg2)'
const FG = 'var(--fg)'
const FG2 = 'var(--fg2)'
const FG3 = 'var(--fg3)'
const FG4 = 'var(--fg4)'
const ACCENT = 'var(--accent)'
const ACCENT_DIM = 'var(--accent-dim)'
const ACCENT_BORDER = 'var(--accent-border)'
const BORDER = 'var(--border)'
const BORDER2 = 'var(--border2)'
const MONO = 'var(--font-mono,"Fragment Mono","DM Mono",monospace)'
const SANS = 'var(--font-body,"Geist","Inter",sans-serif)'
const DISP = 'var(--font-display,"Bebas Neue",sans-serif)'

const EMPTY: LocalTrackTags = { genres: [], moods: [], themes: [], contexts: [] }

function totalSelected(t: LocalTrackTags): number {
  return t.genres.length + t.moods.length + t.themes.length + t.contexts.length
}

export function LocalTrackTagEditor({ track, onClose }: { track: LocalTrack; onClose: () => void }) {
  const lm = useLocalMusic()

  const [tags, setTags] = useState<LocalTrackTags>(EMPTY)
  const [inputs, setInputs] = useState<Record<Dimension, string>>({
    genres: '', moods: '', contexts: '', themes: '',
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Load any existing tags on open.
  useEffect(() => {
    let live = true
    lm.getTrackTags(track.id)
      .then((t) => { if (live) setTags(t ?? EMPTY) })
      .catch(() => { /* none yet — leave empty */ })
      .finally(() => { if (live) setLoading(false) })
    return () => { live = false }
  }, [lm, track.id])

  // ── tag manipulation ────────────────────────────────────────────────────────
  const toggle = useCallback((dim: Dimension, term: string) => {
    setTags((t) => {
      const cur = t[dim]
      if (cur.includes(term)) return { ...t, [dim]: cur.filter((x) => x !== term) }
      if (cur.length >= MAX_PER_DIM) return t
      return { ...t, [dim]: [...cur, term] }
    })
  }, [])

  const addCustom = useCallback((dim: Dimension) => {
    const raw = inputs[dim].trim().toLowerCase()
    if (!raw) return
    setTags((t) => {
      const cur = t[dim]
      if (cur.includes(raw) || cur.length >= MAX_PER_DIM) return t
      return { ...t, [dim]: [...cur, raw] }
    })
    setInputs((i) => ({ ...i, [dim]: '' }))
  }, [inputs])

  const onInputKey = (e: KeyboardEvent<HTMLInputElement>, dim: Dimension) => {
    if (e.key === 'Enter') { e.preventDefault(); addCustom(dim) }
  }

  const count = useMemo(() => totalSelected(tags), [tags])

  // ── save / clear ──────────────────────────────────────────────────────────
  const save = useCallback(async () => {
    setSaving(true)
    setError(null)
    try {
      // An empty selection clears the row rather than persisting an empty one.
      if (totalSelected(tags) === 0) await lm.deleteTrackTags(track.id)
      else await lm.saveTrackTags(track.id, tags)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save tags')
      setSaving(false)
    }
  }, [tags, lm, track.id, onClose])

  const clearAll = useCallback(() => {
    setTags(EMPTY)
    setInputs({ genres: '', moods: '', contexts: '', themes: '' })
  }, [])

  return (
    <div
      onClick={onClose}
      style={{
        position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 30, padding: 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 520, maxWidth: '100%', maxHeight: '100%', display: 'flex', flexDirection: 'column',
          background: BG1, border: `1px solid ${BORDER}`, fontFamily: SANS, color: FG,
        }}
      >
        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: DISP, fontSize: 22, letterSpacing: '0.05em' }}>TAG TRACK</div>
            <div style={{ fontFamily: MONO, fontSize: 11, color: FG3, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {track.title}{track.artist ? `  •  ${track.artist}` : ''}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: FG4, fontSize: 18, cursor: 'pointer', fontFamily: MONO }}>✕</button>
        </div>

        {/* Dimensions */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loading ? (
            <div style={{ padding: '28px 20px', fontFamily: MONO, fontSize: 11, color: FG3 }}>Loading…</div>
          ) : (
            DIMENSION_ORDER.map((dim) => {
              const selected = tags[dim]
              const atLimit = selected.length >= MAX_PER_DIM
              const custom = selected.filter((t) => !(TAXONOMY[dim] as readonly string[]).includes(t))
              return (
                <div key={dim} style={{ padding: '14px 20px', borderBottom: `1px solid ${BORDER2}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                    <Label>{DIMENSION_LABELS[dim]}</Label>
                    <span style={{ fontFamily: MONO, fontSize: 9, color: atLimit ? ACCENT : FG4 }}>
                      {selected.length}/{MAX_PER_DIM}
                    </span>
                  </div>

                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {TAXONOMY[dim].map((term) => {
                      const active = selected.includes(term)
                      const disabled = !active && atLimit
                      return (
                        <Chip
                          key={term}
                          label={term}
                          active={active}
                          disabled={disabled || saving}
                          onClick={() => toggle(dim, term)}
                        />
                      )
                    })}
                    {custom.map((term) => (
                      <Chip
                        key={term}
                        label={term}
                        active
                        custom
                        disabled={saving}
                        onClick={() => toggle(dim, term)}
                      />
                    ))}
                  </div>

                  {/* custom entry */}
                  <div style={{ display: 'flex', gap: 6, marginTop: 10, opacity: atLimit || saving ? 0.4 : 1 }}>
                    <input
                      value={inputs[dim]}
                      placeholder={atLimit ? 'limit reached' : 'add custom…'}
                      disabled={atLimit || saving}
                      onChange={(e) => setInputs((i) => ({ ...i, [dim]: e.target.value }))}
                      onKeyDown={(e) => onInputKey(e, dim)}
                      style={{
                        flex: 1, background: BG2, border: `1px solid ${BORDER2}`, color: FG,
                        fontFamily: MONO, fontSize: 12, padding: '6px 10px', outline: 'none',
                      }}
                    />
                    <button
                      onClick={() => addCustom(dim)}
                      disabled={atLimit || saving || !inputs[dim].trim()}
                      style={{
                        background: 'none', border: `1px solid ${BORDER}`, color: FG3, cursor: 'pointer',
                        fontFamily: MONO, fontSize: 13, padding: '0 12px',
                      }}
                    >+</button>
                  </div>
                </div>
              )
            })
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '14px 20px', borderTop: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', gap: 12 }}>
          {error
            ? <span style={{ flex: 1, color: ACCENT, fontFamily: MONO, fontSize: 11 }}>{error}</span>
            : (
              <span style={{ flex: 1, fontFamily: MONO, fontSize: 10, color: FG4, letterSpacing: '0.04em' }}>
                {count > 0 ? `${count} tag${count === 1 ? '' : 's'} · saved on this device` : 'stays on this device'}
              </span>
            )}
          {count > 0 && !saving && <SmallBtn label="Clear" onClick={clearAll} />}
          <SmallBtn label="Cancel" onClick={onClose} />
          <button
            onClick={save}
            disabled={saving || loading}
            style={{
              background: ACCENT, border: `1px solid ${ACCENT}`, color: '#fff', fontFamily: MONO,
              fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', padding: '8px 18px',
              cursor: saving || loading ? 'default' : 'pointer', opacity: saving || loading ? 0.6 : 1,
            }}
          >{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
    </div>
  )
}

// ─── bits ───────────────────────────────────────────────────────────────────

function Label({ children }: { children: React.ReactNode }) {
  return <div style={{ fontFamily: MONO, fontSize: 9, color: FG4, letterSpacing: '0.16em', textTransform: 'uppercase' }}>{children}</div>
}

function Chip({
  label, active, disabled, custom, onClick,
}: {
  label: string; active: boolean; disabled?: boolean; custom?: boolean; onClick: () => void
}) {
  return (
    <button
      onClick={() => { if (!disabled) onClick() }}
      disabled={disabled}
      style={{
        fontFamily: MONO, fontSize: 11, letterSpacing: '0.02em', padding: '4px 9px',
        cursor: disabled ? 'default' : 'pointer',
        background: active ? ACCENT_DIM : 'none',
        border: `1px solid ${active ? ACCENT_BORDER : BORDER2}`,
        color: active ? ACCENT : FG2,
        fontStyle: custom ? 'italic' : 'normal',
        opacity: disabled && !active ? 0.35 : 1,
        whiteSpace: 'nowrap',
      }}
    >
      {label}{custom && active ? ' ✕' : ''}
    </button>
  )
}

function SmallBtn({ label, onClick, disabled }: { label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        background: 'none', border: `1px solid ${BORDER}`, color: FG2, fontFamily: MONO,
        fontSize: 10, letterSpacing: '0.10em', textTransform: 'uppercase', padding: '7px 12px',
        cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.5 : 1, whiteSpace: 'nowrap',
      }}
    >{label}</button>
  )
}
