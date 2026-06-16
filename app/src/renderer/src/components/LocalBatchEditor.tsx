/**
 * components/LocalBatchEditor.tsx
 *
 * "Label all" for a folder of unlabeled tracks. The user sets the fields a folder
 * usually shares — Artist, Album (prefilled from the folder name), Date — once,
 * while each track keeps its own (editable) title. Saving labels every included
 * track in a single pass via LocalMusicProvider.saveMetaMany, moving them into the
 * Library. For per-track precision (ISRC, contributors, online lookup) the single
 * "Add details" editor still applies.
 */

import { useCallback, useMemo, useState } from 'react'
import { useLocalMusic, type LocalTrack, type LocalTrackMeta } from '../providers/LocalMusicProvider'
import { StagedArtSlot, type StagedArt } from './StagedArtSlot'
import { artistArtKey, albumArtKeyOf } from '../lib/artKeys'

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

const baseName = (p: string) => p.split(/[\\/]/).pop() ?? p

interface Row { id: string; title: string; include: boolean; filename: string }

export function LocalBatchEditor({
  tracks, folderName, onClose,
}: {
  tracks: LocalTrack[]
  folderName: string
  onClose: () => void
}) {
  const lm = useLocalMusic()

  const [artist, setArtist] = useState('')
  const [album, setAlbum] = useState(folderName)
  const [date, setDate] = useState('')
  // Staged artwork — committed under the final artist/album key on save.
  const [artistArt, setArtistArt] = useState<StagedArt | null>(null)
  const [albumArt, setAlbumArt] = useState<StagedArt | null>(null)
  const [rows, setRows] = useState<Row[]>(() =>
    tracks.map((t) => ({ id: t.id, title: t.title, include: true, filename: baseName(t.path) })))

  const [reading, setReading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const includedCount = useMemo(() => rows.filter((r) => r.include).length, [rows])
  const canSave = useMemo(
    () => !!artist.trim() && includedCount > 0 && rows.every((r) => !r.include || r.title.trim()),
    [artist, includedCount, rows],
  )

  const setRow = (id: string, patch: Partial<Row>) =>
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)))

  // Pull embedded tags for the whole folder at once: fill each title, and the
  // shared artist/album/date from the first track that has them (without
  // clobbering anything the user already typed).
  const readAll = useCallback(async () => {
    setReading(true)
    try {
      const results = await Promise.all(tracks.map(async (t) => ({ id: t.id, tags: await lm.readTags(t.id) })))
      setRows((prev) => prev.map((r) => {
        const hit = results.find((x) => x.id === r.id)
        return hit && hit.tags.title.trim() ? { ...r, title: hit.tags.title } : r
      }))
      const firstArtist = results.map((x) => x.tags.byArtist).find((a) => a.trim())
      if (firstArtist && !artist.trim()) setArtist(firstArtist)
      const firstAlbum = results.map((x) => x.tags.albumName).find((a) => a?.trim())
      if (firstAlbum && (!album.trim() || album === folderName)) setAlbum(firstAlbum)
      const firstDate = results.map((x) => x.tags.datePublished).find((d) => d?.trim())
      if (firstDate && !date.trim()) setDate(firstDate)
    } finally {
      setReading(false)
    }
  }, [tracks, lm, artist, album, date, folderName])

  const save = useCallback(async () => {
    if (!canSave) return
    setSaving(true)
    setError(null)
    const entries = rows.filter((r) => r.include).map((r) => ({
      localId: r.id,
      meta: {
        title: r.title.trim(),
        byArtist: artist.trim(),
        albumName: album.trim() || null,
        datePublished: date.trim() || null,
        isrcCode: null,
        durationMs: null,
        contributors: [],
      } satisfies LocalTrackMeta,
    }))
    try {
      await lm.saveMetaMany(entries)
      // Commit any staged artwork under the now-final keys. Best-effort: a tagged
      // folder shouldn't fail to label just because an image couldn't be stored.
      const a = artist.trim()
      const al = album.trim()
      const commit = (scope: 'artist' | 'album', key: string, s: StagedArt) =>
        s.source === 'local' ? lm.setArtFromPath(scope, key, s.path) : lm.setArtFromUrl(scope, key, s.url)
      try {
        if (artistArt && a) await commit('artist', artistArtKey(a), artistArt)
        if (albumArt && a && al) await commit('album', albumArtKeyOf(a, al), albumArt)
      } catch { /* art is optional — leave the label in place */ }
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save')
      setSaving(false)
    }
  }, [canSave, rows, artist, album, date, artistArt, albumArt, lm, onClose])

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
          width: 560, maxWidth: '100%', maxHeight: '100%', display: 'flex', flexDirection: 'column',
          background: BG1, border: `1px solid ${BORDER}`, fontFamily: SANS, color: FG,
        }}
      >
        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div>
            <div style={{ fontFamily: DISP, fontSize: 22, letterSpacing: '0.05em' }}>LABEL FOLDER</div>
            <div style={{ fontFamily: MONO, fontSize: 10.5, color: FG3, marginTop: 3 }} title={folderName}>
              {folderName}  •  {tracks.length} track{tracks.length === 1 ? '' : 's'}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: FG4, fontSize: 18, cursor: 'pointer', fontFamily: MONO }}>✕</button>
        </div>

        {/* Shared fields */}
        <div style={{ padding: '16px 20px', borderBottom: `1px solid ${BORDER2}`, flexShrink: 0 }}>
          <div style={{ display: 'flex', gap: 12 }}>
            <div style={{ flex: 1 }}><Field label="Artist" required value={artist} onChange={setArtist} /></div>
            <div style={{ flex: 1 }}><Field label="Album" value={album} onChange={setAlbum} /></div>
            <div style={{ width: 130 }}><Field label="Date" value={date} onChange={setDate} placeholder="YYYY" /></div>
          </div>
          <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
            <SmallBtn label={reading ? 'Reading…' : 'Read tags'} onClick={readAll} disabled={reading} />
            <span style={{ fontFamily: MONO, fontSize: 10, color: FG4 }}>
              Applies Artist / Album / Date to every checked track.
            </span>
          </div>

          {/* Artwork — staged here, saved under the final artist/album keys. */}
          <div style={{ marginTop: 16, display: 'flex', alignItems: 'flex-start', gap: 18 }}>
            <StagedArtSlot
              scope="album" shape="square" label="Album cover" size={64}
              artKey={albumArtKeyOf(artist.trim(), album.trim())}
              staged={albumArt} onPick={setAlbumArt} onClear={() => setAlbumArt(null)}
              onSearch={() => lm.searchArt('album', { artist: artist.trim(), album: album.trim() })}
              disabled={!artist.trim() || !album.trim()}
              disabledHint="Enter an artist and album first"
            />
            <StagedArtSlot
              scope="artist" shape="circle" label="Artist image" size={64}
              artKey={artistArtKey(artist.trim())}
              staged={artistArt} onPick={setArtistArt} onClear={() => setArtistArt(null)}
              onSearch={() => lm.searchArt('artist', { artist: artist.trim() })}
              disabled={!artist.trim()}
              disabledHint="Enter an artist first"
            />
            <span style={{ flex: 1, fontFamily: MONO, fontSize: 10, color: FG4, lineHeight: 1.5, paddingTop: 4 }}>
              Optional. Choose a file or search online. Shown as the album cover and artist image throughout your library.
            </span>
          </div>
        </div>

        {/* Per-track titles */}
        <div style={{ flex: 1, overflowY: 'auto', minHeight: 80 }}>
          <div style={{ padding: '10px 20px 4px', fontFamily: MONO, fontSize: 9, color: FG4, letterSpacing: '0.16em', textTransform: 'uppercase' }}>
            Titles ({includedCount} selected)
          </div>
          {rows.map((r) => (
            <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 20px' }}>
              <input
                type="checkbox"
                checked={r.include}
                onChange={(e) => setRow(r.id, { include: e.target.checked })}
                style={{ accentColor: '#b83030', flexShrink: 0, cursor: 'pointer' }}
                title="Include in this batch"
              />
              <input
                value={r.title}
                onChange={(e) => setRow(r.id, { title: e.target.value })}
                disabled={!r.include}
                style={{
                  flex: 1, background: BG2, border: `1px solid ${BORDER2}`,
                  color: r.include ? FG : FG4, fontFamily: MONO, fontSize: 12, padding: '6px 9px', outline: 'none',
                }}
              />
              <span title={r.filename} style={{ width: 150, flexShrink: 0, fontFamily: MONO, fontSize: 9.5, color: FG4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {r.filename}
              </span>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{ padding: '14px 20px', borderTop: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
          <span style={{ flex: 1, color: error ? ACCENT : FG4, fontFamily: MONO, fontSize: 11 }}>
            {error ?? (canSave ? '' : 'Enter an artist; every checked track needs a title.')}
          </span>
          <SmallBtn label="Cancel" onClick={onClose} />
          <button
            onClick={save}
            disabled={!canSave || saving}
            style={{
              background: canSave ? ACCENT : ACCENT_DIM, border: `1px solid ${canSave ? ACCENT : BORDER}`,
              color: canSave ? '#fff' : FG4, fontFamily: MONO, fontSize: 10, letterSpacing: '0.12em',
              textTransform: 'uppercase', padding: '8px 18px', cursor: canSave && !saving ? 'pointer' : 'default',
            }}
          >{saving ? 'Saving…' : `Label ${includedCount} track${includedCount === 1 ? '' : 's'}`}</button>
        </div>
      </div>
    </div>
  )
}

// ─── bits ───────────────────────────────────────────────────────────────────

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
        style={{
          width: '100%', marginTop: 6, background: BG2, border: `1px solid ${BORDER2}`,
          color: FG, fontFamily: MONO, fontSize: 12, padding: '8px 10px', outline: 'none',
        }}
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
