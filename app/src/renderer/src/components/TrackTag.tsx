import { useEffect, useRef, useState, KeyboardEvent } from 'react'
import { usePrivy } from '@privy-io/react-auth'
import type { Fangorn } from '@fangorn-network/sdk'

const CHROMA_URL = (import.meta as any).env.VITE_CHROMA_URL ?? 'http://localhost:8080'

// ── Taxonomy ──────────────────────────────────────────────────────────────────

const TAXONOMY = {
  genres: [
    'ambient', 'art rock', 'avant-garde', 'black metal', 'bluegrass',
    'blues', 'bossa nova', 'chiptune', 'classical', 'darkwave',
    'death metal', 'disco', 'doom metal', 'dream pop', 'drone',
    'dub', 'electronic', 'emo', 'experimental', 'field recordings',
    'folk', 'footwork', 'funk', 'garage rock', 'gothic rock',
    'grunge', 'hardcore', 'hip-hop', 'house', 'industrial',
    'jazz', 'krautrock', 'lo-fi', 'math-rock', 'metalcore',
    'minimal techno', 'new wave', 'noise rock', 'post-metal', 'post-punk',
    'post-rock', 'power electronics', 'progressive rock', 'psychedelic', 'punk',
    'r&b', 'reggae', 'shoegaze', 'slowcore', 'soul',
    'space rock', 'spiritual jazz', 'stoner rock', 'synthwave', 'techno',
    'thrash metal', 'trip-hop', 'vaporwave', 'witch house',
  ],
  moods: [
    'aggressive', 'anxious', 'bitter', 'cathartic', 'cinematic',
    'cold', 'dark', 'defiant', 'dissonant', 'dreamy',
    'ecstatic', 'euphoric', 'frantic', 'hopeful', 'hypnotic',
    'introspective', 'lonely', 'meditative', 'melancholic', 'mournful',
    'nostalgic', 'otherworldly', 'peaceful', 'playful', 'raw',
    'restless', 'serene', 'solemn', 'tender', 'tense',
    'triumphant', 'unsettling', 'warm', 'weary', 'wistful',
  ],
  contexts: [
    'background', 'commute', 'creative work', 'deep focus', 'driving',
    'exploration', 'gaming', 'heartbreak', 'insomnia', 'late night',
    'meditation', 'movement', 'party', 'pre-show', 'ritual',
    'running', 'social', 'solitude', 'study', 'walking', 'workout',
  ],
  themes: [
    'absurdity', 'body', 'chaos', 'class', 'community',
    'death', 'dreams', 'empire', 'excess', 'faith',
    'fear', 'freedom', 'grief', 'home', 'hunger',
    'identity', 'isolation', 'love', 'memory', 'myth',
    'nature', 'obsession', 'place', 'power', 'rage',
    'resistance', 'ritual', 'shadow', 'spirituality', 'technology',
    'time', 'urban', 'war', 'work', 'youth',
  ],
} as const

type Dimension = keyof typeof TAXONOMY

const DIMENSION_LABELS: Record<Dimension, string> = {
  genres:   'Genres',
  moods:    'Moods',
  contexts: 'Contexts',
  themes:   'Themes',
}

const DIMENSION_ORDER: Dimension[] = ['genres', 'moods', 'contexts', 'themes']

const MAX_PER_DIM = 3

// ── Schema ────────────────────────────────────────────────────────────────────

const TAG_SCHEMA_NAME = 'tony.test.tags.track.0'

export interface TrackTagData {
  schemaVersion: number
  trackId:       string
  genres:        string[]
  moods:         string[]
  themes:        string[]
  contexts:      string[]
}

const SCHEMA_VERSION = 1

function empty(trackId: string): TrackTagData {
  return { schemaVersion: SCHEMA_VERSION, trackId, genres: [], moods: [], themes: [], contexts: [] }
}

// ── Storage ───────────────────────────────────────────────────────────────────

const sk = (trackId: string) => `sond3r:tags:${trackId}`

export function readTrackTags(trackId: string): TrackTagData {
  try {
    const raw = localStorage.getItem(sk(trackId))
    if (!raw) return empty(trackId)
    const p = JSON.parse(raw)
    return {
      schemaVersion: p.schemaVersion ?? SCHEMA_VERSION,
      trackId,
      genres:   Array.isArray(p.genres)   ? p.genres   : [],
      moods:    Array.isArray(p.moods)     ? p.moods    : [],
      themes:   Array.isArray(p.themes)    ? p.themes   : [],
      contexts: Array.isArray(p.contexts)  ? p.contexts : [],
    }
  } catch { return empty(trackId) }
}

export function writeTrackTags(data: TrackTagData): void {
  localStorage.setItem(sk(data.trackId), JSON.stringify(data))
}

export function isTrackTagged(trackId: string): boolean {
  const t = readTrackTags(trackId)
  return t.genres.length + t.moods.length + t.themes.length + t.contexts.length > 0
}

// ── Publish status ────────────────────────────────────────────────────────────

type PublishStatus = 'idle' | 'publishing' | 'published' | 'error'

// ── Component ─────────────────────────────────────────────────────────────────

interface TrackTagModalProps {
  trackId:      string
  trackTitle:   string
  fangorn?:     Fangorn | null
  onClose:      () => void
  onSave:       (data: TrackTagData) => void
  accentColor?: string
}

export function TrackTagModal({
  trackId,
  trackTitle,
  fangorn,
  onClose,
  onSave,
  accentColor = 'var(--accent)',
}: TrackTagModalProps) {
  const { getAccessToken } = usePrivy()

  const [tags, setTags]     = useState<TrackTagData>(() => readTrackTags(trackId))
  const [inputs, setInputs] = useState<Record<Dimension, string>>({
    genres: '', moods: '', contexts: '', themes: '',
  })
  const [publishStatus, setPublishStatus] = useState<PublishStatus>('idle')
  const [publishError, setPublishError]   = useState<string | null>(null)
  const overlayRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setTags(readTrackTags(trackId))
    setInputs({ genres: '', moods: '', contexts: '', themes: '' })
    setPublishStatus('idle')
    setPublishError(null)
  }, [trackId])

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // ── tag manipulation ───────────────────────────────────────────────────────

  const toggle = (dim: Dimension, term: string) => {
    setTags(t => {
      const cur = t[dim] as string[]
      if (cur.includes(term)) return { ...t, [dim]: cur.filter(x => x !== term) }
      if (cur.length >= MAX_PER_DIM) return t
      return { ...t, [dim]: [...cur, term] }
    })
  }

  const addCustom = (dim: Dimension) => {
    const raw = inputs[dim].trim().toLowerCase()
    if (!raw) return
    setTags(t => {
      const cur = t[dim] as string[]
      if (cur.includes(raw) || cur.length >= MAX_PER_DIM) return t
      return { ...t, [dim]: [...cur, raw] }
    })
    setInputs(i => ({ ...i, [dim]: '' }))
  }

  const onInputKey = (e: KeyboardEvent<HTMLInputElement>, dim: Dimension) => {
    if (e.key === 'Enter') { e.preventDefault(); addCustom(dim) }
  }

  // ── save + publish ─────────────────────────────────────────────────────────

  const handleSave = async () => {
    // 1. Always persist locally first — publish is best-effort
    writeTrackTags(tags)
    onSave(tags)

    // 2. Publish to Fangorn if available
    if (!fangorn) { onClose(); return }

    setPublishStatus('publishing')
    setPublishError(null)

    try {
      await getAccessToken()
      await fangorn.publisher.upload(
        {
          records: [{
            name: `${trackId}-tags`,
            fields: {
              schemaVersion: tags.schemaVersion,
              trackId:       tags.trackId,
              genres:        tags.genres,
              moods:         tags.moods,
              themes:        tags.themes,
              contexts:      tags.contexts,
            } as any,
          }],
          schemaName: TAG_SCHEMA_NAME,
        },
        0n,
      )
      setPublishStatus('published')
      // Give subgraph ~45s to index, then trigger server reingest
      setTimeout(() => {
        fetch(`${CHROMA_URL}/reingest`, { method: 'POST' }).catch(() => {})
      }, 45_000)
      setTimeout(onClose, 900)
    } catch (e: any) {
      console.log(e)
      setPublishError(e?.message ?? 'Publish failed')
      setPublishStatus('error')
      // Don't close — let user see the error and decide
    }
  }

  const handleClear = () => {
    setTags(empty(trackId))
    setInputs({ genres: '', moods: '', contexts: '', themes: '' })
  }

  const totalSelected =
    tags.genres.length + tags.moods.length +
    tags.themes.length + tags.contexts.length

  const saving = publishStatus === 'publishing'

  return (
    <div
      className="ttm-overlay"
      ref={overlayRef}
      onClick={e => { if (e.target === overlayRef.current) onClose() }}
    >
      <div className="ttm-modal">

        {/* ── header ── */}
        <div className="ttm-header">
          <div className="ttm-header-left">
            <span className="ttm-title">tag track</span>
            <span className="ttm-track-name">{trackTitle}</span>
          </div>
          <div className="ttm-header-right">
            {totalSelected > 0 && !saving && (
              <button className="ttm-clear" onClick={handleClear}>clear</button>
            )}
            <button className="ttm-close" onClick={onClose} disabled={saving} aria-label="Close">
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* ── dimensions ── */}
        <div className="ttm-body">
          {DIMENSION_ORDER.map(dim => {
            const selected = tags[dim] as string[]
            const atLimit  = selected.length >= MAX_PER_DIM

            return (
              <div key={dim} className="ttm-section">
                <div className="ttm-section-label">
                  {DIMENSION_LABELS[dim]}
                  <span
                    className={`ttm-section-count${atLimit ? ' ttm-section-count--full' : ''}`}
                    style={selected.length > 0 && !atLimit ? { color: accentColor } : undefined}
                  >
                    {selected.length}/{MAX_PER_DIM}
                  </span>
                </div>

                <div className="ttm-chips">
                  {TAXONOMY[dim].map(term => {
                    const active   = selected.includes(term)
                    const disabled = !active && atLimit
                    return (
                      <button
                        key={term}
                        className={`ttm-chip${active ? ' ttm-chip--active' : ''}${disabled ? ' ttm-chip--disabled' : ''}`}
                        style={active ? {
                          color: accentColor,
                          background: `${accentColor}18`,
                          borderColor: `${accentColor}60`,
                        } : undefined}
                        onClick={() => !disabled && toggle(dim, term)}
                        disabled={disabled || saving}
                      >
                        {term}
                      </button>
                    )
                  })}

                  {/* custom tags not in taxonomy */}
                  {selected
                    .filter(t => !(TAXONOMY[dim] as readonly string[]).includes(t))
                    .map(term => (
                      <button
                        key={term}
                        className="ttm-chip ttm-chip--active ttm-chip--custom"
                        style={{ color: accentColor, background: `${accentColor}18`, borderColor: `${accentColor}60` }}
                        onClick={() => toggle(dim, term)}
                        disabled={saving}
                      >
                        {term}
                        <svg viewBox="0 0 24 24" width="9" height="9" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ marginLeft: 4, opacity: 0.7 }}>
                          <path d="M18 6L6 18M6 6l12 12" />
                        </svg>
                      </button>
                    ))
                  }
                </div>

                <div className={`ttm-input-row${atLimit || saving ? ' ttm-input-row--disabled' : ''}`}>
                  <input
                    className="ttm-input"
                    type="text"
                    placeholder={atLimit ? 'limit reached' : 'add custom…'}
                    value={inputs[dim]}
                    disabled={atLimit || saving}
                    onChange={e => setInputs(i => ({ ...i, [dim]: e.target.value }))}
                    onKeyDown={e => onInputKey(e, dim)}
                  />
                  <button
                    className="ttm-input-add"
                    onClick={() => addCustom(dim)}
                    disabled={atLimit || saving || !inputs[dim].trim()}
                    aria-label="Add custom tag"
                  >
                    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                      <path d="M12 5v14M5 12h14" />
                    </svg>
                  </button>
                </div>
              </div>
            )
          })}
        </div>

        {/* ── footer ── */}
        <div className="ttm-footer">
          <div className="ttm-footer-left">
            {publishStatus === 'idle' && (
              <span className="ttm-footer-hint">
                {totalSelected > 0
                  ? `${totalSelected} tag${totalSelected !== 1 ? 's' : ''} · enriches recommendations`
                  : 'enriches the network for everyone'}
              </span>
            )}
            {publishStatus === 'publishing' && (
              <span className="ttm-publish-status ttm-publish-status--publishing">
                <span className="upload-spinner" style={{ width: 10, height: 10, borderWidth: 1.5 }} />
                publishing…
              </span>
            )}
            {publishStatus === 'published' && (
              <span className="ttm-publish-status ttm-publish-status--ok" style={{ color: accentColor }}>
                <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12" /></svg>
                published
              </span>
            )}
            {publishStatus === 'error' && (
              <span className="ttm-publish-status ttm-publish-status--error" title={publishError ?? undefined}>
                saved locally · publish failed
              </span>
            )}
          </div>

          <button
            className="ttm-save"
            onClick={handleSave}
            disabled={saving || publishStatus === 'published'}
            style={{ background: accentColor }}
          >
            {saving
              ? <span className="upload-spinner" style={{ width: 12, height: 12, borderWidth: 2, borderTopColor: 'var(--bg, #000)' }} />
              : fangorn ? 'save & publish' : 'save'
            }
          </button>
        </div>

      </div>

      <style>{`
        .ttm-overlay {
          position: fixed;
          inset: 0;
          z-index: 200;
          display: flex;
          align-items: flex-start;
          justify-content: flex-end;
          background: transparent;
        }
        .ttm-modal {
          width: 380px;
          max-height: 100vh;
          display: flex;
          flex-direction: column;
          background: var(--surface, #111);
          border-left: 1px solid var(--border, rgba(255,255,255,0.08));
          overflow: hidden;
          animation: ttm-in 0.18s cubic-bezier(0.16, 1, 0.3, 1);
        }
        @keyframes ttm-in {
          from { transform: translateX(16px); opacity: 0; }
          to   { transform: translateX(0);    opacity: 1; }
        }
        .ttm-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 18px 20px 14px;
          border-bottom: 1px solid var(--border, rgba(255,255,255,0.06));
          flex-shrink: 0;
          gap: 12px;
        }
        .ttm-header-left { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
        .ttm-header-right { display: flex; align-items: center; gap: 12px; flex-shrink: 0; }
        .ttm-title {
          font-size: 10px;
          font-weight: 600;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--text-muted, rgba(255,255,255,0.35));
        }
        .ttm-track-name {
          font-size: 13px;
          font-weight: 500;
          color: var(--text, rgba(255,255,255,0.85));
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .ttm-clear {
          font-size: 11px;
          color: var(--text-muted, rgba(255,255,255,0.3));
          background: none;
          border: none;
          cursor: pointer;
          padding: 0;
          letter-spacing: 0.06em;
          transition: color 0.15s;
        }
        .ttm-clear:hover { color: rgba(255,255,255,0.7); }
        .ttm-close {
          background: none;
          border: none;
          cursor: pointer;
          color: var(--text-muted, rgba(255,255,255,0.3));
          padding: 2px;
          display: flex;
          align-items: center;
          transition: color 0.15s;
        }
        .ttm-close:not(:disabled):hover { color: rgba(255,255,255,0.8); }
        .ttm-body {
          flex: 1;
          overflow-y: auto;
          padding: 4px 0;
          scrollbar-width: thin;
          scrollbar-color: rgba(255,255,255,0.07) transparent;
        }
        .ttm-section {
          padding: 13px 20px 12px;
          border-bottom: 1px solid var(--border, rgba(255,255,255,0.04));
        }
        .ttm-section:last-child { border-bottom: none; }
        .ttm-section-label {
          font-size: 10px;
          font-weight: 600;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--text-muted, rgba(255,255,255,0.28));
          margin-bottom: 9px;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .ttm-section-count {
          font-size: 10px;
          font-weight: 700;
          color: rgba(255,255,255,0.2);
          transition: color 0.15s;
        }
        .ttm-section-count--full { color: rgba(255,255,255,0.15) !important; }
        .ttm-chips { display: flex; flex-wrap: wrap; gap: 5px; margin-bottom: 9px; }
        .ttm-chip {
          font-size: 11px;
          padding: 3px 9px;
          border-radius: 2px;
          border: 1px solid var(--border, rgba(255,255,255,0.09));
          background: transparent;
          color: var(--text-muted, rgba(255,255,255,0.4));
          cursor: pointer;
          letter-spacing: 0.03em;
          transition: color 0.12s, background 0.12s, border-color 0.12s, opacity 0.12s;
          white-space: nowrap;
          display: inline-flex;
          align-items: center;
        }
        .ttm-chip:hover:not(.ttm-chip--active):not(.ttm-chip--disabled) {
          color: rgba(255,255,255,0.72);
          border-color: rgba(255,255,255,0.18);
        }
        .ttm-chip--active { font-weight: 600; }
        .ttm-chip--disabled { opacity: 0.18; cursor: default; pointer-events: none; }
        .ttm-chip--custom { font-style: italic; }
        .ttm-input-row {
          display: flex;
          align-items: center;
          gap: 6px;
          transition: opacity 0.15s;
        }
        .ttm-input-row--disabled { opacity: 0.25; pointer-events: none; }
        .ttm-input {
          flex: 1;
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 2px;
          padding: 4px 9px;
          font-size: 11px;
          color: rgba(255,255,255,0.65);
          letter-spacing: 0.03em;
          outline: none;
          transition: border-color 0.15s;
        }
        .ttm-input::placeholder { color: rgba(255,255,255,0.2); }
        .ttm-input:focus { border-color: rgba(255,255,255,0.2); }
        .ttm-input-add {
          background: none;
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 2px;
          padding: 4px 7px;
          cursor: pointer;
          color: rgba(255,255,255,0.3);
          display: flex;
          align-items: center;
          transition: color 0.15s, border-color 0.15s;
        }
        .ttm-input-add:not(:disabled):hover {
          color: rgba(255,255,255,0.7);
          border-color: rgba(255,255,255,0.18);
        }
        .ttm-input-add:disabled { opacity: 0.22; cursor: default; }
        .ttm-footer {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 13px 20px;
          border-top: 1px solid var(--border, rgba(255,255,255,0.06));
          flex-shrink: 0;
          gap: 12px;
        }
        .ttm-footer-left { display: flex; align-items: center; min-width: 0; flex: 1; }
        .ttm-footer-hint {
          font-size: 10px;
          color: rgba(255,255,255,0.22);
          letter-spacing: 0.03em;
          line-height: 1.4;
        }
        .ttm-publish-status {
          font-size: 10px;
          letter-spacing: 0.06em;
          display: flex;
          align-items: center;
          gap: 5px;
        }
        .ttm-publish-status--publishing { color: rgba(255,255,255,0.35); }
        .ttm-publish-status--ok { font-weight: 600; }
        .ttm-publish-status--error { color: rgba(255,80,80,0.8); }
        .ttm-save {
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          padding: 6px 16px;
          border: none;
          border-radius: 2px;
          cursor: pointer;
          color: var(--bg, #000);
          transition: opacity 0.15s;
          display: flex;
          align-items: center;
          gap: 6px;
          flex-shrink: 0;
          white-space: nowrap;
        }
        .ttm-save:not(:disabled):hover { opacity: 0.82; }
        .ttm-save:disabled { opacity: 0.5; cursor: default; }
      `}</style>
    </div>
  )
}