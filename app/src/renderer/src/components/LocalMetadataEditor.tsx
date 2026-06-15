/**
 * components/LocalMetadataEditor.tsx
 *
 * Modal form for labeling a local track with schema metadata
 * (TrackInvariantSchema.json). Opens prefilled from the file's embedded tags;
 * the user can also pull from an online lookup (MusicBrainz) or type by hand.
 * Saving (title + artist required) persists via LocalMusicProvider and moves the
 * track into the Library.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  useLocalMusic, type Contributor, type LocalTrack, type LocalTrackMeta,
} from '../providers/LocalMusicProvider'
import { searchRecordings, type MetaCandidate } from '../lib/musicbrainz'

const BG1 = 'var(--bg1)'
const BG2 = 'var(--bg2)'
const FG = 'var(--fg)'
const FG2 = 'var(--fg2)'
const FG3 = 'var(--fg3)'
const FG4 = 'var(--fg4)'
const ACCENT = 'var(--accent)'
const ACCENT_DIM = 'var(--accent-dim)'
const BORDER = 'var(--border)'
const BORDER2 = 'var(--border2)'
const MONO = 'var(--font-mono,"Fragment Mono","DM Mono",monospace)'
const SANS = 'var(--font-body,"Geist","Inter",sans-serif)'
const DISP = 'var(--font-display,"Bebas Neue",sans-serif)'

export function LocalMetadataEditor({ track, onClose }: { track: LocalTrack; onClose: () => void }) {
  const lm = useLocalMusic()

  const [title, setTitle] = useState(track.title ?? '')
  const [artist, setArtist] = useState(track.artist ?? '')
  const [album, setAlbum] = useState(track.album ?? '')
  const [date, setDate] = useState(track.datePublished ?? '')
  const [isrc, setIsrc] = useState(track.isrcCode ?? '')
  const [durationMs, setDurationMs] = useState<number | null>(track.durationMs ?? null)
  const [contributors, setContributors] = useState<Contributor[]>(track.contributors ?? [])

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [candidates, setCandidates] = useState<MetaCandidate[] | null>(null)
  const [looking, setLooking] = useState(false)

  // Apply embedded tags into the form (fills blanks; used on first open for an
  // unlabeled track, and on demand via "Read tags").
  const applyTags = useCallback((overwrite: boolean) => {
    lm.readTags(track.id).then((tags) => {
      setTitle((p) => (overwrite || !p ? tags.title || p : p))
      setArtist((p) => (overwrite || !p ? tags.byArtist || p : p))
      setAlbum((p) => (overwrite || !p ? tags.albumName ?? p : p))
      setDate((p) => (overwrite || !p ? tags.datePublished ?? p : p))
      setIsrc((p) => (overwrite || !p ? tags.isrcCode ?? p : p))
      setDurationMs((p) => (overwrite || p == null ? tags.durationMs ?? p : p))
      if (tags.contributors.length) setContributors((p) => (overwrite || !p.length ? tags.contributors : p))
    }).catch(() => { /* no tags — leave fields */ })
  }, [lm, track.id])

  // On open, prefill an unlabeled track from its tags. Labeled tracks already
  // carry their stored fields, so we leave those as the user saved them.
  const didInit = useRef(false)
  useEffect(() => {
    if (didInit.current || track.labeled) return
    didInit.current = true
    applyTags(false)
  }, [track.labeled, applyTags])

  const runLookup = useCallback(async () => {
    setLooking(true)
    setError(null)
    try {
      const hits = await searchRecordings(artist, title)
      setCandidates(hits)
    } finally {
      setLooking(false)
    }
  }, [artist, title])

  const applyCandidate = useCallback((c: MetaCandidate) => {
    setTitle(c.title)
    setArtist(c.artist)
    if (c.album) setAlbum(c.album)
    if (c.datePublished) setDate(c.datePublished)
    if (c.isrcCode) setIsrc(c.isrcCode)
    if (c.durationMs != null) setDurationMs(c.durationMs)
    setCandidates(null)
  }, [])

  const canSave = useMemo(() => !!title.trim() && !!artist.trim(), [title, artist])

  const save = useCallback(async () => {
    if (!canSave) return
    setSaving(true)
    setError(null)
    const meta: LocalTrackMeta = {
      title: title.trim(),
      byArtist: artist.trim(),
      albumName: album.trim() || null,
      datePublished: date.trim() || null,
      isrcCode: isrc.trim() || null,
      durationMs,
      contributors: contributors.filter((c) => c.name?.trim()),
    }
    try {
      await lm.saveMeta(track.id, meta)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save')
      setSaving(false)
    }
  }, [canSave, title, artist, album, date, isrc, durationMs, contributors, lm, track.id, onClose])

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
          width: 520, maxWidth: '100%', maxHeight: '100%', overflowY: 'auto',
          background: BG1, border: `1px solid ${BORDER}`, fontFamily: SANS, color: FG,
        }}
      >
        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontFamily: DISP, fontSize: 22, letterSpacing: '0.05em' }}>
            {track.labeled ? 'EDIT DETAILS' : 'ADD DETAILS'}
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: FG4, fontSize: 18, cursor: 'pointer', fontFamily: MONO }}>✕</button>
        </div>

        {/* Source actions */}
        <div style={{ padding: '12px 20px', borderBottom: `1px solid ${BORDER2}`, display: 'flex', gap: 8 }}>
          <SmallBtn label="Read tags" onClick={() => applyTags(true)} />
          <SmallBtn label={looking ? 'Searching…' : 'Look up online'} onClick={runLookup} disabled={looking || (!title.trim() && !artist.trim())} />
        </div>

        {/* Online candidates */}
        {candidates && (
          <div style={{ borderBottom: `1px solid ${BORDER2}`, background: BG2 }}>
            {candidates.length === 0 && (
              <div style={{ padding: '12px 20px', fontFamily: MONO, fontSize: 11, color: FG3 }}>No matches found.</div>
            )}
            {candidates.map((c) => (
              <button
                key={c.sourceId}
                onClick={() => applyCandidate(c)}
                style={{
                  display: 'block', width: '100%', textAlign: 'left', cursor: 'pointer',
                  background: 'none', border: 'none', borderBottom: `1px solid ${BORDER2}`, padding: '9px 20px',
                }}
              >
                <div style={{ fontFamily: SANS, fontSize: 13, color: FG }}>{c.title}</div>
                <div style={{ fontFamily: MONO, fontSize: 10.5, color: FG3, marginTop: 2 }}>
                  {[c.artist, c.album, c.datePublished?.slice(0, 4)].filter(Boolean).join('  •  ')}
                  {c.isrcCode ? `  •  ${c.isrcCode}` : ''}
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Fields */}
        <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Field label="Title" required value={title} onChange={setTitle} />
          <Field label="Artist" required value={artist} onChange={setArtist} />
          <Field label="Album" value={album} onChange={setAlbum} />
          <div style={{ display: 'flex', gap: 12 }}>
            <div style={{ flex: 1 }}><Field label="Date published" value={date} onChange={setDate} placeholder="YYYY or YYYY-MM-DD" /></div>
            <div style={{ flex: 1 }}><Field label="ISRC" value={isrc} onChange={setIsrc} placeholder="e.g. USRC17607839" /></div>
          </div>

          {/* Contributors */}
          <div>
            <Label>Contributors</Label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6 }}>
              {contributors.map((c, i) => (
                <div key={i} style={{ display: 'flex', gap: 6 }}>
                  <input
                    value={c.role ?? ''} placeholder="role"
                    onChange={(e) => setContributors((prev) => prev.map((x, j) => j === i ? { ...x, role: e.target.value } : x))}
                    style={{ ...inputStyle, width: 120 }}
                  />
                  <input
                    value={c.name ?? ''} placeholder="name"
                    onChange={(e) => setContributors((prev) => prev.map((x, j) => j === i ? { ...x, name: e.target.value } : x))}
                    style={{ ...inputStyle, flex: 1 }}
                  />
                  <button
                    onClick={() => setContributors((prev) => prev.filter((_, j) => j !== i))}
                    style={{ background: 'none', border: `1px solid ${BORDER2}`, color: FG4, cursor: 'pointer', fontFamily: MONO, padding: '0 10px' }}
                  >✕</button>
                </div>
              ))}
              <button
                onClick={() => setContributors((prev) => [...prev, { role: null, name: '', id: null }])}
                style={{ alignSelf: 'flex-start', background: 'none', border: `1px dashed ${BORDER}`, color: FG3, cursor: 'pointer', fontFamily: MONO, fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', padding: '6px 12px' }}
              >+ Add contributor</button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: '14px 20px', borderTop: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', gap: 12 }}>
          {error && <span style={{ flex: 1, color: ACCENT, fontFamily: MONO, fontSize: 11 }}>{error}</span>}
          {!error && <span style={{ flex: 1 }} />}
          <SmallBtn label="Cancel" onClick={onClose} />
          <button
            onClick={save}
            disabled={!canSave || saving}
            style={{
              background: canSave ? ACCENT : ACCENT_DIM, border: `1px solid ${canSave ? ACCENT : BORDER}`,
              color: canSave ? '#fff' : FG4, fontFamily: MONO, fontSize: 10, letterSpacing: '0.12em',
              textTransform: 'uppercase', padding: '8px 18px', cursor: canSave && !saving ? 'pointer' : 'default',
            }}
          >{saving ? 'Saving…' : track.labeled ? 'Save' : 'Add to library'}</button>
        </div>
      </div>
    </div>
  )
}

// ─── bits ───────────────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  background: BG2, border: `1px solid ${BORDER2}`, color: FG, fontFamily: MONO,
  fontSize: 12, padding: '8px 10px', outline: 'none', width: '100%',
}

function Label({ children }: { children: React.ReactNode }) {
  return <div style={{ fontFamily: MONO, fontSize: 9, color: FG4, letterSpacing: '0.16em', textTransform: 'uppercase' }}>{children}</div>
}

function Field({
  label, value, onChange, required, placeholder,
}: {
  label: string; value: string; onChange: (v: string) => void; required?: boolean; placeholder?: string
}) {
  return (
    <div>
      <Label>{label}{required && <span style={{ color: ACCENT }}> *</span>}</Label>
      <input
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        style={{ ...inputStyle, marginTop: 6 }}
      />
    </div>
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
