/**
 * views/LocalMusicView.tsx
 *
 * Full-surface view for on-disk music. Two tabs:
 *  - Library    — tracks with structured metadata (title + artist), browsable by
 *                 Tracks / Artists / Albums with drill-down.
 *  - Unlabeled  — tracks missing metadata, each with a way to label it (embedded
 *                 tags, online lookup, or manual), plus a bulk "auto-label from
 *                 tags" pass.
 *
 * Reads everything from LocalMusicProvider; holds no playback state of its own so
 * audio keeps going if the view is closed.
 */

import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { useLocalMusic, type ArtScope, type FavKind, type LocalTrack, type LocalTrackTags, type OrganizeReport } from '../providers/LocalMusicProvider'
import { LocalMetadataEditor } from '../components/LocalMetadataEditor'
import { LocalBatchEditor } from '../components/LocalBatchEditor'
import { LocalTrackTagEditor } from '../components/LocalTrackTagEditor'
import { LocalArtThumb } from '../components/LocalArtThumb'
import { LocalArtViewer } from '../components/LocalArtViewer'
import { LocalImportDialog } from '../components/LocalImportDialog'
import { OrganizeResults } from '../components/OrganizeResults'
import { ArtworkFixerGrid } from '../components/ArtworkFixerGrid'
import { artistArtKey, albumArtKeyOf } from '../lib/artKeys'
import { missingArtTargets, type ArtTarget } from '../lib/artTargets'

// ── Design tokens (shared theme vars — respects light/dark) ───────────────────
const BG1 = 'var(--bg1)'
const BG2 = 'var(--bg2)'
const FG = 'var(--fg)'
const FG2 = 'var(--fg2)'
const FG3 = 'var(--fg3)'
const FG4 = 'var(--fg4)'
const ACCENT = 'var(--accent)'
const ACCENT_DIM = 'var(--accent-dim)'
const ACCENT_BORDER = 'var(--accent-border)'
const SUCCESS = 'var(--success)'
const BORDER = 'var(--border)'
const BORDER2 = 'var(--border2)'
const MONO = 'var(--font-mono,"Fragment Mono","DM Mono",monospace)'
const SANS = 'var(--font-body,"Geist","Inter",sans-serif)'
const DISP = 'var(--font-display,"Bebas Neue",sans-serif)'

type Tab = 'library' | 'favorites' | 'playlists' | 'unlabeled' | 'artwork'
type GroupMode = 'artists' | 'albums' | 'tracks'

const UNKNOWN_ARTIST = 'Unknown artist'
const NO_ALBUM = 'Singles'

// Favorite refs. Tracks favorite by their local id; artists by name; albums by
// `${artist}${SEP}${album}` so the pair round-trips. The separator is the Unit
// Separator (U+001F): it can't appear in a name and is safe in SQLite TEXT
// (unlike NUL, which can truncate). Independent of the artwork keys above —
// favorites only need to be internally consistent across the views below.
const ALBUM_FAV_SEP = '\u001F'
const favArtistRef = (artist: string) => artist
const favAlbumRef = (artist: string, album: string) => `${artist}${ALBUM_FAV_SEP}${album}`
const parseFavAlbum = (ref: string): { artist: string; album: string } => {
  const i = ref.indexOf(ALBUM_FAV_SEP)
  return i >= 0
    ? { artist: ref.slice(0, i), album: ref.slice(i + 1) }
    : { artist: UNKNOWN_ARTIST, album: ref }
}

function fmtTime(sec: number): string {
  if (!sec || !isFinite(sec) || sec <= 0) return '0:00'
  const s = Math.floor(sec)
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`
}

const artistKey = (t: LocalTrack) => t.artist?.trim() || UNKNOWN_ARTIST
const albumKey = (t: LocalTrack) => t.album?.trim() || NO_ALBUM

// Artwork keys (artistArtKey / albumArtKeyOf) are shared with the metadata
// editors via ../lib/artKeys so art set while organizing lines up in these views.

const dirOf = (p: string) => { const i = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\')); return i > 0 ? p.slice(0, i) : p }
const baseName = (p: string) => p.split(/[\\/]/).filter(Boolean).pop() ?? p

interface FolderGroup { dir: string; name: string; tracks: LocalTrack[] }

function groupByFolder(tracks: LocalTrack[]): FolderGroup[] {
  const m = new Map<string, FolderGroup>()
  for (const t of tracks) {
    const dir = dirOf(t.path)
    let g = m.get(dir)
    if (!g) { g = { dir, name: baseName(dir), tracks: [] }; m.set(dir, g) }
    g.tracks.push(t)
  }
  return [...m.values()].sort((a, b) => a.name.localeCompare(b.name))
}

// ── Search ────────────────────────────────────────────────────────────────────
// A query is split into whitespace-separated terms; a candidate matches when ALL
// terms appear (case-insensitively) somewhere in its searchable text — so
// "dark beatles" narrows, it doesn't widen. Empty query matches everything.

/** Lowercased, de-blanked terms from a raw query string. */
const queryTerms = (q: string): string[] => q.trim().toLowerCase().split(/\s+/).filter(Boolean)

/** True when every term is present in `haystack` (which must already be lowercased). */
const matchesAll = (haystack: string, terms: string[]): boolean =>
  terms.every((t) => haystack.includes(t))

/** A track's searchable text: title, artist, album, and file name. */
const trackHaystack = (t: LocalTrack): string =>
  `${t.title} ${t.artist ?? ''} ${t.album ?? ''} ${baseName(t.path)}`.toLowerCase()

const trackMatches = (t: LocalTrack, terms: string[]): boolean =>
  matchesAll(trackHaystack(t), terms)

export function LocalMusicView() {
  const lm = useLocalMusic()

  const [tab, setTab] = useState<Tab>('library')
  const [groupMode, setGroupMode] = useState<GroupMode>('artists')
  const [selectedArtist, setSelectedArtist] = useState<string | null>(null)
  const [selectedAlbum, setSelectedAlbum] = useState<string | null>(null)
  const [editing, setEditing] = useState<LocalTrack | null>(null)
  const [tagging, setTagging] = useState<LocalTrack | null>(null)
  const [batch, setBatch] = useState<{ name: string; tracks: LocalTrack[] } | null>(null)
  const [preview, setPreview] = useState<{ scope: ArtScope; key: string; label: string } | null>(null)
  const [importing, setImporting] = useState(false)
  const [orgReport, setOrgReport] = useState<OrganizeReport | null>(null)
  // One search box in the header filters whichever tab is open. Persists across
  // tabs (a global "find") but is cleared when we jump to a specific artist/album
  // so the drill-down isn't masked by an active search.
  const [query, setQuery] = useState('')

  // Stored-art keys, for the Artwork tab + its "missing" badge. Refetched on
  // every artwork change so saved items drop off.
  const [artHave, setArtHave] = useState<{ artist: string[]; album: string[] } | null>(null)
  useEffect(() => {
    lm.listArtKeys().then(setArtHave).catch(() => setArtHave({ artist: [], album: [] }))
  }, [lm.listArtKeys, lm.artRev]) // eslint-disable-line react-hooks/exhaustive-deps
  const missingArtCount = useMemo(
    () => (artHave ? missingArtTargets(lm.libraryTracks, artHave).length : 0),
    [lm.libraryTracks, artHave],
  )

  // Scan lazily the first time the view is shown.
  useEffect(() => { lm.ensureLoaded() }, [lm.ensureLoaded]) // eslint-disable-line react-hooks/exhaustive-deps

  // Land on whichever tab has content (first populated scan only). If the
  // library is empty but there are files to label, open on Unlabeled.
  const settledRef = useRef(false)
  useEffect(() => {
    if (settledRef.current || lm.loading || lm.tracks.length === 0) return
    settledRef.current = true
    if (lm.libraryTracks.length === 0 && lm.unlabeledTracks.length > 0) setTab('unlabeled')
  }, [lm.loading, lm.tracks.length, lm.libraryTracks.length, lm.unlabeledTracks.length])

  const switchGroup = (mode: GroupMode) => {
    setGroupMode(mode)
    setSelectedArtist(null)
    setSelectedAlbum(null)
  }

  const favCount = lm.favorites.track.size + lm.favorites.artist.size + lm.favorites.album.size

  // Jump from the Favorites tab into the Library's drill-down for that thing.
  const openArtist = (name: string) => {
    setQuery(''); setTab('library'); setGroupMode('artists'); setSelectedArtist(name); setSelectedAlbum(null)
  }
  const openAlbum = (artist: string, album: string) => {
    setQuery(''); setTab('library'); setGroupMode('artists'); setSelectedArtist(artist); setSelectedAlbum(album)
  }

  // Per-tab placeholder so the search box hints at what it'll match.
  const searchPlaceholder = ({
    library: 'Search songs, artists, albums…',
    favorites: 'Search favorites…',
    playlists: 'Search playlists…',
    unlabeled: 'Search unlabeled files…',
    artwork: 'Search artists & albums…',
  } as Record<Tab, string>)[tab]

  // Smart auto-organize: resolve every unlabeled track from tags + filename +
  // folder, merge duplicate artist/album spellings, skip duplicate songs, and
  // label what it can. Runs in the main process; we surface the report.
  const runOrganize = async () => {
    setOrgReport(await lm.autoOrganize())
  }

  return (
    <div style={{
      position: 'absolute', inset: 0, background: BG1, color: FG,
      display: 'flex', flexDirection: 'column', fontFamily: SANS,
    }}>
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div style={{
        flexShrink: 0, borderBottom: `1px solid ${BORDER}`,
        // Embedded below the app's shell header now (not a full-window overlay),
        // so the OS window controls are already cleared upstream — plain padding.
        padding: '16px 22px 0',
      } as React.CSSProperties}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: DISP, fontSize: 26, letterSpacing: '0.06em', lineHeight: 1 }}>
              HOME
            </div>
            {/* <div
              title={lm.dir ?? ''}
              style={{
                fontFamily: MONO, fontSize: 10, color: FG3, marginTop: 5,
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '60vw',
              }}
            >
              {lm.dir ?? 'No folder selected'}
            </div> */}
          </div>

          <div style={{
            flex: 1, minWidth: 0, fontFamily: MONO, fontSize: 10.5, color: ACCENT,
            letterSpacing: '0.02em', lineHeight: 1.3, textAlign: 'center',
          }}>
            Local listening does not yet contribute to your algorithm
          </div>

          <HeaderBtn label="Import" onClick={() => setImporting(true)} />
          <HeaderBtn label="Change folder" onClick={lm.chooseFolder} />
          <HeaderBtn label={lm.loading ? 'Scanning…' : 'Rescan'} onClick={lm.rescan} disabled={lm.loading} />
        </div>

        {/* Search — filters whichever tab is active. */}
        <div style={{ marginTop: 12 }}>
          <SearchBox value={query} onChange={setQuery} placeholder={searchPlaceholder} />
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 0, marginTop: 14 }}>
          <Tab label="Library" count={lm.libraryTracks.length} active={tab === 'library'} onClick={() => setTab('library')} />
          <Tab label="Favorites" count={favCount} active={tab === 'favorites'} onClick={() => setTab('favorites')} />
          <Tab label="Playlists" count={lm.playlists.length} active={tab === 'playlists'} onClick={() => setTab('playlists')} />
          <Tab label="Unlabeled" count={lm.unlabeledTracks.length} active={tab === 'unlabeled'} onClick={() => setTab('unlabeled')} />
          <Tab label="Artwork" count={missingArtCount} active={tab === 'artwork'} onClick={() => setTab('artwork')} />
        </div>
      </div>

      {/* ── Body ───────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        {lm.error && (
          <div style={{ padding: '14px 22px', color: ACCENT, fontFamily: MONO, fontSize: 12 }}>{lm.error}</div>
        )}

        {(tab === 'library' || tab === 'unlabeled') && lm.loading && lm.tracks.length === 0 && (
          <EmptyState text="Scanning your music folder…" />
        )}

        {(tab === 'library' || tab === 'unlabeled') && !lm.loading && lm.tracks.length === 0 && !lm.error && (
          <EmptyState text="No audio files found here." hint="Try “Change folder” to point SOND3R at your music." />
        )}

        {lm.tracks.length > 0 && tab === 'unlabeled' && (
          <UnlabeledPane
            query={query}
            onEdit={setEditing}
            onLabelFolder={(name, tracks) => setBatch({ name, tracks })}
            onOrganize={runOrganize}
          />
        )}

        {lm.tracks.length > 0 && tab === 'library' && (
          <LibraryPane
            query={query}
            groupMode={groupMode}
            onGroupMode={switchGroup}
            selectedArtist={selectedArtist}
            selectedAlbum={selectedAlbum}
            onSelectArtist={setSelectedArtist}
            onSelectAlbum={setSelectedAlbum}
            onEdit={setEditing}
            onTag={setTagging}
            onPreview={(scope, key, label) => setPreview({ scope, key, label })}
          />
        )}

        {tab === 'favorites' && (
          <FavoritesPane
            query={query}
            onEdit={setEditing}
            onTag={setTagging}
            onPreview={(scope, key, label) => setPreview({ scope, key, label })}
            onOpenArtist={openArtist}
            onOpenAlbum={openAlbum}
          />
        )}

        {tab === 'playlists' && <PlaylistsPane query={query} />}

        {tab === 'artwork' && <ArtworkPane have={artHave} query={query} />}
      </div>

      {/* ── Player bar ─────────────────────────────────────────────────── */}
      {lm.current && <PlayerBar />}

      {/* ── Metadata editors ───────────────────────────────────────────── */}
      {editing && <LocalMetadataEditor track={editing} onClose={() => setEditing(null)} />}
      {tagging && <LocalTrackTagEditor track={tagging} onClose={() => setTagging(null)} />}
      {batch && <LocalBatchEditor tracks={batch.tracks} folderName={batch.name} onClose={() => setBatch(null)} />}

      {/* ── Full-resolution art viewer ─────────────────────────────────── */}
      {preview && (
        <LocalArtViewer scope={preview.scope} artKey={preview.key} label={preview.label} onClose={() => setPreview(null)} />
      )}

      {/* ── Bulk import ─────────────────────────────────────────────────── */}
      {importing && (
        <LocalImportDialog
          onClose={() => setImporting(false)}
          onImported={() => setTab('unlabeled')}
        />
      )}

      {/* ── Auto-organize report ────────────────────────────────────────── */}
      {orgReport && <OrganizeReportModal report={orgReport} onClose={() => setOrgReport(null)} />}
    </div>
  )
}

// ─── Unlabeled pane ────────────────────────────────────────────────────────────

function UnlabeledPane({
  query, onEdit, onLabelFolder, onOrganize,
}: {
  query: string
  onEdit: (t: LocalTrack) => void
  onLabelFolder: (name: string, tracks: LocalTrack[]) => void
  onOrganize: () => void
}) {
  const lm = useLocalMusic()
  const tracks = lm.unlabeledTracks
  const [selectedDir, setSelectedDir] = useState<string | null>(null)

  const folders = useMemo(() => groupByFolder(tracks), [tracks])
  const terms = useMemo(() => queryTerms(query), [query])
  const matches = useMemo(
    () => (terms.length ? tracks.filter((t) => trackMatches(t, terms)) : []),
    [tracks, terms],
  )

  if (tracks.length === 0) {
    return <EmptyState text="Everything here is labeled." hint="New unlabeled files will show up after a rescan." />
  }

  const organizeLabel = lm.organizing
    ? (lm.organizeProgress ? `Organizing ${lm.organizeProgress.processed}/${lm.organizeProgress.total}…` : 'Organizing…')
    : 'Auto-organize'
  const autoBtn = <HeaderBtn label={organizeLabel} onClick={onOrganize} disabled={lm.organizing} />
  const labelFolderBtn = (g: FolderGroup) => <HeaderBtn label={`Label all (${g.tracks.length})`} onClick={() => onLabelFolder(g.name, g.tracks)} />

  // Searching → a flat list of matching files across every folder.
  if (terms.length) {
    return (
      <>
        <SearchResultBar count={matches.length}>{autoBtn}</SearchResultBar>
        {matches.length === 0
          ? <EmptyState text="No unlabeled files match your search." hint="Try fewer or different words." />
          : matches.map((track, i) => (
            <TrackRow key={track.id} index={i + 1} track={track} actionLabel="Add details" onAction={() => onEdit(track)} />
          ))}
      </>
    )
  }

  // Drilled into a folder, or there's only one folder → show its tracks with a
  // "Label all" for that folder.
  const single = folders.length === 1 ? folders[0] : null
  const current = selectedDir ? folders.find((f) => f.dir === selectedDir) ?? null : single

  if (current) {
    return (
      <>
        <PaneToolbar>
          {selectedDir && (
            <button
              onClick={() => setSelectedDir(null)}
              style={{ background: 'none', border: `1px solid ${BORDER2}`, color: FG3, fontFamily: MONO, fontSize: 10, padding: '3px 8px', cursor: 'pointer' }}
            >← folders</button>
          )}
          <span title={current.dir} style={{ fontFamily: MONO, fontSize: 11, color: FG2 }}>{current.name}</span>
          <span style={{ flex: 1 }} />
          {labelFolderBtn(current)}
          {autoBtn}
        </PaneToolbar>
        {current.tracks.map((track, i) => (
          <TrackRow key={track.id} index={i + 1} track={track} actionLabel="Add details" onAction={() => onEdit(track)} />
        ))}
      </>
    )
  }

  // Multiple folders → folder list; each row drills in and carries its own
  // "Label all".
  return (
    <>
      <PaneToolbar>
        <span style={{ fontFamily: MONO, fontSize: 11, color: FG3 }}>
          {tracks.length} track{tracks.length === 1 ? '' : 's'} in {folders.length} folders need details
        </span>
        <span style={{ flex: 1 }} />
        {autoBtn}
      </PaneToolbar>
      {folders.map((g) => (
        <GroupRow
          key={g.dir}
          title={g.name}
          subtitle={`${g.tracks.length} track${g.tracks.length === 1 ? '' : 's'}`}
          onClick={() => setSelectedDir(g.dir)}
          action={{ label: `Label all (${g.tracks.length})`, onClick: () => onLabelFolder(g.name, g.tracks) }}
        />
      ))}
    </>
  )
}

// ─── Library pane ──────────────────────────────────────────────────────────────

function LibraryPane({
  query, groupMode, onGroupMode, selectedArtist, selectedAlbum, onSelectArtist, onSelectAlbum, onEdit, onTag, onPreview,
}: {
  query: string
  groupMode: GroupMode
  onGroupMode: (m: GroupMode) => void
  selectedArtist: string | null
  selectedAlbum: string | null
  onSelectArtist: (a: string | null) => void
  onSelectAlbum: (a: string | null) => void
  onEdit: (t: LocalTrack) => void
  onTag: (t: LocalTrack) => void
  onPreview: (scope: ArtScope, key: string, label: string) => void
}) {
  const lm = useLocalMusic()
  const tracks = lm.libraryTracks
  // Browse vs edit: in browse, clicking art opens it full-size and rows just
  // play; edit mode exposes art set/replace/remove and per-track Edit.
  const [editMode, setEditMode] = useState(false)

  // Switching Artists/Albums/Tracks rebuilds a large list. Defer that heavy render
  // so the GroupSwitch highlight + click stay responsive (the tab reflects the
  // urgent `groupMode`, the list catches up via `renderMode`). `switching` drives a
  // brief dim on the outgoing list so the change reads as intentional.
  const renderMode = useDeferredValue(groupMode)
  const switching = renderMode !== groupMode

  const terms = useMemo(() => queryTerms(query), [query])
  const matches = useMemo(
    () => (terms.length ? tracks.filter((t) => trackMatches(t, terms)) : []),
    [tracks, terms],
  )

  // Builds the leading artwork thumb for a group row, wired for the current mode.
  const artThumb = (scope: ArtScope, key: string, label: string, shape: 'square' | 'circle') => (
    <LocalArtThumb
      scope={scope} artKey={key} size={40} shape={shape}
      hint={editMode ? 'edit' : 'view'}
      onClick={editMode ? () => lm.setArt(scope, key) : () => onPreview(scope, key, label)}
      title={editMode ? `Set ${scope} image` : `View ${scope} image`}
    />
  )

  const artists = useMemo(() => {
    const m = new Map<string, LocalTrack[]>()
    for (const t of tracks) {
      const k = artistKey(t)
      const arr = m.get(k); if (arr) arr.push(t); else m.set(k, [t])
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [tracks])

  const albums = useMemo(() => {
    const m = new Map<string, { album: string; artists: Set<string>; tracks: LocalTrack[] }>()
    for (const t of tracks) {
      const k = albumKey(t)
      let g = m.get(k)
      if (!g) { g = { album: k, artists: new Set(), tracks: [] }; m.set(k, g) }
      if (t.artist?.trim()) g.artists.add(t.artist.trim())
      g.tracks.push(t)
    }
    return [...m.values()].sort((a, b) => a.album.localeCompare(b.album))
  }, [tracks])

  if (tracks.length === 0) {
    return <EmptyState text="Your library is empty." hint="Label tracks from the Unlabeled tab to build it out." />
  }

  const flatList = (list: LocalTrack[]) =>
    list.map((track, i) => (
      <TrackRow
        key={track.id}
        index={i + 1}
        track={track}
        queue={list}
        library
        actionLabel={editMode ? 'Edit' : undefined}
        onAction={editMode ? () => onEdit(track) : undefined}
        onTag={editMode ? () => onTag(track) : undefined}
      />
    ))

  const editToggle = (
    <button
      onClick={() => setEditMode((v) => !v)}
      title={editMode ? 'Done editing' : 'Edit library'}
      style={{
        background: editMode ? ACCENT_DIM : 'none', border: `1px solid ${editMode ? ACCENT_BORDER : BORDER2}`,
        color: editMode ? ACCENT : FG3, fontFamily: MONO, fontSize: 10, letterSpacing: '0.10em',
        textTransform: 'uppercase', padding: '5px 12px', cursor: 'pointer',
      }}
    >{editMode ? 'Done' : 'Edit'}</button>
  )

  // Searching → a flat list of matching songs across the whole library, so the
  // group mode and any drill-down are bypassed.
  if (terms.length) {
    return (
      <>
        <SearchResultBar count={matches.length}>{editToggle}</SearchResultBar>
        {matches.length === 0
          ? <EmptyState text="No songs match your search." hint="Try fewer or different words." />
          : flatList(matches)}
      </>
    )
  }

  // Drill-down breadcrumb. In Artists mode the trail is Artist › Album; in Albums
  // mode it's just the album. "Back" pops one level.
  const crumbs: { label: string; onClick?: () => void }[] = []
  if (groupMode === 'artists' && selectedArtist) {
    crumbs.push({ label: selectedArtist, onClick: selectedAlbum ? () => onSelectAlbum(null) : undefined })
  }
  if (selectedAlbum) crumbs.push({ label: selectedAlbum })
  const goBack = () => { if (selectedAlbum) onSelectAlbum(null); else if (selectedArtist) onSelectArtist(null) }

  return (
    <>
      <PaneToolbar>
        <GroupSwitch mode={groupMode} onMode={onGroupMode} />
        {crumbs.length > 0 && (
          <>
            <span style={{ color: FG4, fontSize: 11 }}>›</span>
            {crumbs.map((c, i) => (
              <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                {i > 0 && <span style={{ color: FG4, fontSize: 9 }}>›</span>}
                {c.onClick
                  ? <button onClick={c.onClick} style={{ background: 'none', border: 'none', color: FG3, fontFamily: MONO, fontSize: 11, cursor: 'pointer', padding: 0 }}>{c.label}</button>
                  : <span style={{ fontFamily: MONO, fontSize: 11, color: FG2 }}>{c.label}</span>}
              </span>
            ))}
            <button
              onClick={goBack}
              style={{ background: 'none', border: `1px solid ${BORDER2}`, color: FG3, fontFamily: MONO, fontSize: 10, padding: '3px 8px', cursor: 'pointer' }}
            >← back</button>
          </>
        )}
        <span style={{ flex: 1 }} />
        {editToggle}
      </PaneToolbar>

      <div style={{ opacity: switching ? 0.55 : 1, transition: 'opacity 0.12s ease' }}>
      {/* Tracks */}
      {renderMode === 'tracks' && flatList(tracks)}

      {/* Artists */}
      {renderMode === 'artists' && !selectedArtist && artists.map(([name, ts]) => (
        <GroupRow
          key={name}
          title={name}
          subtitle={`${ts.length} track${ts.length === 1 ? '' : 's'}`}
          onClick={() => onSelectArtist(name)}
          leading={artThumb('artist', artistArtKey(name), name, 'circle')}
          fav={{ kind: 'artist', ref: favArtistRef(name) }}
          discoverable={ts.some((t) => lm.discoverableIds.has(t.id))}
        />
      ))}
      {/* Artist → its albums (+ a Misc section for tracks with no album) */}
      {renderMode === 'artists' && selectedArtist && !selectedAlbum && (() => {
        const at = tracks.filter((t) => artistKey(t) === selectedArtist)
        const albumMap = new Map<string, LocalTrack[]>()
        const misc: LocalTrack[] = []
        for (const t of at) {
          const ak = albumKey(t)
          if (ak === NO_ALBUM) { misc.push(t); continue }
          const arr = albumMap.get(ak); if (arr) arr.push(t); else albumMap.set(ak, [t])
        }
        const albumList = [...albumMap.entries()].sort((a, b) => a[0].localeCompare(b[0]))
        const parts = [`${albumList.length} album${albumList.length === 1 ? '' : 's'}`]
        if (misc.length) parts.push(`${misc.length} loose track${misc.length === 1 ? '' : 's'}`)
        return (
          <>
            <DrillHeader
              scope="artist" shape="circle"
              artKey={artistArtKey(selectedArtist)}
              favRef={favArtistRef(selectedArtist)}
              title={selectedArtist}
              subtitle={parts.join('  •  ')}
              editMode={editMode}
              onPreview={onPreview}
              discoverable={at.some((t) => lm.discoverableIds.has(t.id))}
            />
            {albumList.map(([album, ts]) => (
              <GroupRow
                key={album}
                title={album}
                subtitle={`${ts.length} track${ts.length === 1 ? '' : 's'}`}
                onClick={() => onSelectAlbum(album)}
                leading={artThumb('album', albumArtKeyOf(selectedArtist, album), album, 'square')}
                fav={{ kind: 'album', ref: favAlbumRef(selectedArtist, album) }}
                discoverable={ts.some((t) => lm.discoverableIds.has(t.id))}
              />
            ))}
            {misc.length > 0 && (
              <>
                <SectionHeader label="Misc" hint="No album" />
                {flatList(misc)}
              </>
            )}
          </>
        )
      })()}

      {/* Artist → album → tracks */}
      {renderMode === 'artists' && selectedArtist && selectedAlbum && (() => {
        const inAlbum = tracks.filter((t) => artistKey(t) === selectedArtist && albumKey(t) === selectedAlbum)
        return (
          <>
            <DrillHeader
              scope="album" shape="square"
              artKey={albumArtKeyOf(selectedArtist, selectedAlbum)}
              favRef={favAlbumRef(selectedArtist, selectedAlbum)}
              title={selectedAlbum}
              subtitle={`${selectedArtist}  •  ${inAlbum.length} track${inAlbum.length === 1 ? '' : 's'}`}
              editMode={editMode}
              onPreview={onPreview}
              discoverable={inAlbum.some((t) => lm.discoverableIds.has(t.id))}
            />
            {flatList(inAlbum)}
          </>
        )
      })()}

      {/* Albums */}
      {renderMode === 'albums' && !selectedAlbum && albums.map((g) => {
        const artist = [...g.artists][0] || UNKNOWN_ARTIST
        return (
          <GroupRow
            key={g.album}
            title={g.album}
            subtitle={`${[...g.artists].join(', ') || UNKNOWN_ARTIST}  •  ${g.tracks.length} track${g.tracks.length === 1 ? '' : 's'}`}
            onClick={() => onSelectAlbum(g.album)}
            leading={artThumb('album', albumArtKeyOf(artist, g.album), g.album, 'square')}
            fav={{ kind: 'album', ref: favAlbumRef(artist, g.album) }}
            discoverable={g.tracks.some((t) => lm.discoverableIds.has(t.id))}
          />
        )
      })}
      {renderMode === 'albums' && selectedAlbum && (() => {
        const inAlbum = tracks.filter((t) => albumKey(t) === selectedAlbum)
        const artist = inAlbum[0] ? artistKey(inAlbum[0]) : UNKNOWN_ARTIST
        return (
          <>
            <DrillHeader
              scope="album" shape="square"
              artKey={albumArtKeyOf(artist, selectedAlbum)}
              favRef={favAlbumRef(artist, selectedAlbum)}
              title={selectedAlbum}
              subtitle={`${artist}  •  ${inAlbum.length} track${inAlbum.length === 1 ? '' : 's'}`}
              editMode={editMode}
              onPreview={onPreview}
              discoverable={inAlbum.some((t) => lm.discoverableIds.has(t.id))}
            />
            {flatList(inAlbum)}
          </>
        )
      })()}
      </div>
    </>
  )
}

// ─── Artwork pane ───────────────────────────────────────────────────────────────
// Manage album / artist artwork across the whole library, using the same picker
// (local file or online search) as the metadata editor. Defaults to the items
// still missing art; toggle to show everything to replace existing artwork.
// Albums and artists are split into their own collapsible sections (with an
// "Unknown" catch-all for anything that doesn't classify) so each can be tackled
// — and best-tried / saved — on its own.
function ArtworkPane({ have, query }: { have: { artist: string[]; album: string[] } | null; query: string }) {
  const lm = useLocalMusic()
  const [missingOnly, setMissingOnly] = useState(true)
  const terms = useMemo(() => queryTerms(query), [query])

  const targets = useMemo(() => {
    // An empty have-set means "nothing has art" → every artist/album shows.
    const haveSet = missingOnly ? (have ?? { artist: [], album: [] }) : { artist: [], album: [] }
    return missingArtTargets(lm.libraryTracks, haveSet)
  }, [lm.libraryTracks, have, missingOnly])

  // Narrow to the search (artist + album name), then best-effort split by scope.
  // `unknown` is a defensive bucket — with today's data every target is a known
  // artist/album, but anything we can't classify still surfaces here.
  const { artists, albums, unknown } = useMemo(() => {
    const shown = terms.length
      ? targets.filter((t) => matchesAll(`${t.artist} ${t.album ?? ''}`.toLowerCase(), terms))
      : targets
    const artists: ArtTarget[] = []
    const albums: ArtTarget[] = []
    const unknown: ArtTarget[] = []
    for (const t of shown) {
      if (t.scope === 'artist') artists.push(t)
      else if (t.scope === 'album') albums.push(t)
      else unknown.push(t)
    }
    return { artists, albums, unknown }
  }, [targets, terms])
  const shownCount = artists.length + albums.length + unknown.length

  if (lm.libraryTracks.length === 0) {
    return <EmptyState text="No artwork to manage yet." hint="Label some tracks first — artwork is keyed by artist and album." />
  }

  return (
    <div style={{ padding: '16px 22px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ flex: 1, fontFamily: MONO, fontSize: 10.5, color: FG3, lineHeight: 1.5 }}>
          {missingOnly
            ? 'Artists and albums in your library that don’t have artwork yet.'
            : 'Every artist and album. Pick a new image to replace existing artwork.'}
        </span>
        <button
          onClick={() => setMissingOnly((v) => !v)}
          style={{
            background: 'none', border: `1px solid ${BORDER2}`, color: FG2, fontFamily: MONO,
            fontSize: 9.5, letterSpacing: '0.08em', textTransform: 'uppercase', padding: '6px 12px', cursor: 'pointer', whiteSpace: 'nowrap',
          }}
        >{missingOnly ? 'Show all' : 'Missing only'}</button>
      </div>

      {shownCount === 0 ? (
        <div style={{ fontFamily: MONO, fontSize: 11, color: FG3, padding: '8px 0' }}>
          {terms.length
            ? 'No artists or albums match your search.'
            : missingOnly ? 'Every artist and album has artwork. 🎉' : 'Your library is empty.'}
        </div>
      ) : (
        <>
          {artists.length > 0 && (
            <ArtworkSection label="Artists" count={artists.length} defaultOpen>
              <ArtworkFixerGrid targets={artists} />
            </ArtworkSection>
          )}
          {albums.length > 0 && (
            <ArtworkSection label="Albums" count={albums.length} defaultOpen>
              <ArtworkFixerGrid targets={albums} />
            </ArtworkSection>
          )}
          {unknown.length > 0 && (
            <ArtworkSection label="Unknown" count={unknown.length} hint="couldn’t tell artist from album">
              <ArtworkFixerGrid targets={unknown} />
            </ArtworkSection>
          )}
        </>
      )}
    </div>
  )
}

/** A collapsible, titled group within the Artwork tab (Artists / Albums / Unknown). */
function ArtworkSection({
  label, count, hint, defaultOpen = false, children,
}: {
  label: string; count: number; hint?: string; defaultOpen?: boolean; children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div style={{ border: `1px solid ${BORDER2}` }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px',
          background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
        }}
      >
        <span style={{
          display: 'inline-block', fontSize: 8, color: FG3,
          transition: 'transform 120ms ease', transform: open ? 'rotate(90deg)' : 'rotate(0deg)',
        }}>▶</span>
        <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: FG2 }}>{label}</span>
        <span style={{ fontFamily: MONO, fontSize: 10, color: FG4 }}>{count}</span>
        {hint && <span style={{ flex: 1, textAlign: 'right', fontFamily: MONO, fontSize: 9, color: FG4, letterSpacing: '0.04em' }}>{hint}</span>}
      </button>
      {open && (
        <div style={{ padding: '6px 14px 16px', borderTop: `1px solid ${BORDER2}` }}>
          {children}
        </div>
      )}
    </div>
  )
}

// ─── Shared sub-components ──────────────────────────────────────────────────────

function Tab({ label, count, active, onClick }: { label: string; count: number; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: 'none', border: 'none', borderBottom: `2px solid ${active ? ACCENT : 'transparent'}`,
        color: active ? FG : FG4, fontFamily: MONO, fontSize: 11, letterSpacing: '0.10em', textTransform: 'uppercase',
        padding: '8px 14px 12px', cursor: 'pointer', marginBottom: -1,
      }}
    >
      {label} <span style={{ color: active ? ACCENT : FG4 }}>{count}</span>
    </button>
  )
}

function GroupSwitch({ mode, onMode }: { mode: GroupMode; onMode: (m: GroupMode) => void }) {
  const opts: GroupMode[] = ['artists', 'albums', 'tracks']
  return (
    <div style={{ display: 'flex', border: `1px solid ${BORDER2}` }}>
      {opts.map((o) => (
        <button
          key={o}
          onClick={() => onMode(o)}
          style={{
            background: mode === o ? ACCENT_DIM : 'none', border: 'none',
            borderRight: o !== 'albums' ? `1px solid ${BORDER2}` : 'none',
            color: mode === o ? ACCENT : FG3, fontFamily: MONO, fontSize: 10, letterSpacing: '0.10em',
            textTransform: 'uppercase', padding: '6px 12px', cursor: 'pointer',
          }}
        >{o}</button>
      ))}
    </div>
  )
}

function PaneToolbar({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10, padding: '12px 22px',
      borderBottom: `1px solid ${BORDER2}`,
    }}>{children}</div>
  )
}

/** The header search box. Controlled; clears on the ✕ or Escape. */
function SearchBox({ value, onChange, placeholder }: {
  value: string; onChange: (v: string) => void; placeholder: string
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8, background: BG2,
      border: `1px solid ${value ? ACCENT_BORDER : BORDER2}`, padding: '6px 10px',
    }}>
      <span aria-hidden style={{ color: value ? ACCENT : FG4, fontFamily: MONO, fontSize: 13, lineHeight: 1 }}>⌕</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Escape') onChange('') }}
        placeholder={placeholder}
        spellCheck={false}
        style={{ flex: 1, minWidth: 0, background: 'none', border: 'none', outline: 'none', color: FG, fontFamily: SANS, fontSize: 13 }}
      />
      {value && (
        <button
          onClick={() => onChange('')}
          title="Clear search (Esc)"
          style={{ flexShrink: 0, background: 'none', border: 'none', color: FG4, cursor: 'pointer', fontFamily: MONO, fontSize: 12, lineHeight: 1, padding: 0 }}
        >✕</button>
      )}
    </div>
  )
}

/** A toolbar that just reports how many items a search turned up. */
function SearchResultBar({ count, children }: { count: number; children?: React.ReactNode }) {
  return (
    <PaneToolbar>
      <span style={{ fontFamily: MONO, fontSize: 11, color: FG3 }}>
        {count} result{count === 1 ? '' : 's'}
      </span>
      <span style={{ flex: 1 }} />
      {children}
    </PaneToolbar>
  )
}

function HeaderBtn({ label, onClick, disabled }: { label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        background: 'none', border: `1px solid ${BORDER}`, color: FG2,
        fontFamily: MONO, fontSize: 10, letterSpacing: '0.10em', textTransform: 'uppercase',
        padding: '7px 12px', cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.5 : 1,
        whiteSpace: 'nowrap',
      }}
    >{label}</button>
  )
}

function EmptyState({ text, hint }: { text: string; hint?: string }) {
  return (
    <div style={{ padding: '60px 22px', textAlign: 'center', color: FG3 }}>
      <div style={{ fontFamily: SANS, fontSize: 14 }}>{text}</div>
      {hint && <div style={{ fontFamily: MONO, fontSize: 11, color: FG4, marginTop: 8 }}>{hint}</div>}
    </div>
  )
}

/** A small section divider, e.g. the "Misc" group in an artist's view. */
function SectionHeader({ label, hint }: { label: string; hint?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, padding: '14px 22px 6px', borderBottom: `1px solid ${BORDER2}` }}>
      <span style={{ fontFamily: MONO, fontSize: 9, color: FG3, letterSpacing: '0.18em', textTransform: 'uppercase' }}>{label}</span>
      {hint && <span style={{ fontFamily: MONO, fontSize: 9, color: FG4, letterSpacing: '0.06em' }}>· {hint}</span>}
    </div>
  )
}

/** A drill-down group (artist / album / folder), with an optional leading slot
 *  (e.g. artwork) and trailing action (e.g. "Label all"). A div, not a <button>,
 *  so the leading/action controls nest legally. */
function GroupRow({
  title, subtitle, onClick, action, leading, fav, discoverable,
}: {
  title: string
  subtitle: string
  onClick: () => void
  action?: { label: string; onClick: () => void }
  leading?: React.ReactNode
  /** When set, shows a heart that favorites this artist/album. */
  fav?: { kind: FavKind; ref: string }
  /** Shows the catalog "discoverable" badge beside the title. */
  discoverable?: boolean
}) {
  const lm = useLocalMusic()
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, borderBottom: `1px solid ${BORDER2}` }}>
      {leading && <span style={{ flexShrink: 0, paddingLeft: 22, display: 'flex' }}>{leading}</span>}
      <button
        onClick={onClick}
        style={{
          flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 14, padding: '11px 22px',
          ...(leading ? { paddingLeft: 12 } : null),
          background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
        }}
      >
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
            <span style={{ fontFamily: SANS, fontSize: 14, color: FG, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</span>
            {discoverable && <DiscoverableBadge small />}
          </span>
          <span style={{ display: 'block', fontFamily: MONO, fontSize: 10.5, color: FG3, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{subtitle}</span>
        </span>
        <span style={{ flexShrink: 0, color: FG4, fontFamily: MONO, fontSize: 13 }}>›</span>
      </button>
      {fav && (
        <FavBtn
          on={lm.isFavorite(fav.kind, fav.ref)}
          onClick={() => lm.toggleFavorite(fav.kind, fav.ref)}
          style={{ marginRight: action ? 0 : 16 }}
        />
      )}
      {action && (
        <button
          onClick={action.onClick}
          style={{
            flexShrink: 0, marginRight: 22, background: 'none', border: `1px solid ${BORDER2}`, color: FG3,
            fontFamily: MONO, fontSize: 9.5, letterSpacing: '0.08em', textTransform: 'uppercase',
            padding: '5px 10px', cursor: 'pointer',
          }}
        >{action.label}</button>
      )}
    </div>
  )
}

/** Header band shown when drilled into an artist or album. Art opens full-size in
 *  browse mode; in edit mode it gains Add/Change/Remove controls. */
function DrillHeader({
  scope, artKey, favRef, shape, title, subtitle, editMode, onPreview, discoverable,
}: {
  scope: ArtScope
  artKey: string
  /** Favorite ref for this artist/album (built via favArtistRef / favAlbumRef). */
  favRef: string
  shape: 'square' | 'circle'
  title: string
  subtitle: string
  editMode: boolean
  onPreview: (scope: ArtScope, key: string, label: string) => void
  /** Shows the catalog "discoverable" badge beside the title. */
  discoverable?: boolean
}) {
  const lm = useLocalMusic()
  const [hasArt, setHasArt] = useState(false)
  useEffect(() => {
    let cancelled = false
    lm.getArt(scope, artKey).then((u) => { if (!cancelled) setHasArt(!!u) })
    return () => { cancelled = true }
  }, [scope, artKey, lm.artRev, lm.getArt])

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '16px 22px', borderBottom: `1px solid ${BORDER2}` }}>
      <LocalArtThumb
        scope={scope} artKey={artKey} size={64} shape={shape}
        hint={editMode ? 'edit' : 'view'}
        onClick={editMode ? () => lm.setArt(scope, artKey) : () => onPreview(scope, artKey, title)}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <div style={{ fontFamily: DISP, fontSize: 24, letterSpacing: '0.04em', lineHeight: 1.05, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</div>
          {discoverable && <DiscoverableBadge />}
        </div>
        <div style={{ fontFamily: MONO, fontSize: 10.5, color: FG3, marginTop: 4 }}>{subtitle}</div>
      </div>
      <FavBtn
        size={22}
        on={lm.isFavorite(scope, favRef)}
        onClick={() => lm.toggleFavorite(scope, favRef)}
      />
      {editMode && <HeaderBtn label={hasArt ? 'Change art' : 'Add art'} onClick={() => lm.setArt(scope, artKey)} />}
      {editMode && hasArt && <HeaderBtn label="Remove" onClick={() => lm.clearArt(scope, artKey)} />}
    </div>
  )
}

/**
 * A track row. The main region plays on click; an optional trailing action
 * button (Add details / Edit) opens the metadata editor. Not a <button> wrapper,
 * so the action button can nest legally.
 */
function TrackRow({
  index, track, actionLabel, onAction, onTag, library, queue,
}: {
  index: number
  track: LocalTrack
  actionLabel?: string
  onAction?: () => void
  /** When set, shows a "Tags" button that opens the taxonomy tag editor. */
  onTag?: () => void
  /** Show the favorite heart + add-to-playlist control (library contexts). */
  library?: boolean
  /** List to sequence next/prev through when this row is played. */
  queue?: LocalTrack[]
}) {
  const lm = useLocalMusic()
  const active = lm.current?.id === track.id
  const playing = active && lm.isPlaying
  const tags = lm.trackTagsById.get(track.id)
  const discoverable = lm.discoverableIds.has(track.id)
  const subtitle = [track.artist, track.album].filter(Boolean).join('  •  ')
  // Show the album's artwork beside the title when the track belongs to one.
  // Keyed the same way as the album views so it shares their stored art (and the
  // provider's per-album art cache). No onClick → renders a plain <div>, so it
  // nests inside the play button and a tap on it just plays the track.
  const albumArtKey = track.album?.trim() ? albumArtKeyOf(artistKey(track), albumKey(track)) : null

  return (
    <div
      style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: 14,
        padding: '9px 22px', background: active ? ACCENT_DIM : 'none',
        borderBottom: `1px solid ${BORDER2}`,
      }}
    >
      <button
        onClick={() => lm.playTrack(track, queue)}
        style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 14, background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', padding: 0 }}
      >
        <span style={{ width: 22, flexShrink: 0, textAlign: 'right', fontFamily: MONO, fontSize: 11, color: active ? ACCENT : FG4 }}>
          {playing ? '▶' : index}
        </span>
        {albumArtKey && (
          <LocalArtThumb scope="album" artKey={albumArtKey} size={36} shape="square" hint="view" />
        )}
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: 'block', fontFamily: SANS, fontSize: 13.5, color: active ? ACCENT : FG, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {track.title}
          </span>
          {subtitle && (
            <span style={{ display: 'block', fontFamily: MONO, fontSize: 10.5, color: FG3, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {subtitle}
            </span>
          )}
        </span>
      </button>

      {discoverable && <DiscoverableBadge />}
      {tags && <TagIndicator tags={tags} />}
      <span style={{ flexShrink: 0, fontFamily: MONO, fontSize: 9.5, color: FG4, textTransform: 'uppercase' }}>
        {track.ext.replace('.', '')}
      </span>
      {library && (
        <>
          <FavBtn
            on={lm.isFavorite('track', track.id)}
            onClick={() => lm.toggleFavorite('track', track.id)}
          />
          <AddToPlaylistBtn localId={track.id} />
        </>
      )}
      {onTag && (
        <button
          onClick={onTag}
          title="Tag genres, moods, themes & contexts"
          style={{
            flexShrink: 0, background: 'none', border: `1px solid ${BORDER2}`, color: FG3,
            fontFamily: MONO, fontSize: 9.5, letterSpacing: '0.08em', textTransform: 'uppercase',
            padding: '5px 10px', cursor: 'pointer',
          }}
        >Tags</button>
      )}
      {onAction && actionLabel && (
        <button
          onClick={onAction}
          style={{
            flexShrink: 0, background: 'none', border: `1px solid ${BORDER2}`, color: FG3,
            fontFamily: MONO, fontSize: 9.5, letterSpacing: '0.08em', textTransform: 'uppercase',
            padding: '5px 10px', cursor: 'pointer',
          }}
        >{actionLabel}</button>
      )}
    </div>
  )
}

/** A small badge marking a track that carries local taxonomy tags. The tooltip
 *  lists the actual terms; styled like the accent chips used in the tag editor. */
function TagIndicator({ tags }: { tags: LocalTrackTags }) {
  const all = [...tags.genres, ...tags.moods, ...tags.contexts, ...tags.themes]
  if (all.length === 0) return null
  return (
    <span
      title={`Tagged · ${all.join(', ')}`}
      style={{
        flexShrink: 0, fontFamily: MONO, fontSize: 9, letterSpacing: '0.06em',
        color: ACCENT, background: ACCENT_DIM, border: `1px solid ${ACCENT_BORDER}`,
        padding: '2px 6px', lineHeight: 1.3, whiteSpace: 'nowrap',
      }}
    >◆ {all.length}</span>
  )
}

/** Marks a track/artist/album that has a vector in the local SOND3R catalog, i.e.
 *  it can be reached by semantic search. A small green pill so it reads as a
 *  status, not an action. */
function DiscoverableBadge({ small }: { small?: boolean }) {
  return (
    <span
      title="In the SOND3R catalog · semantically discoverable"
      style={{
        flexShrink: 0, display: 'inline-flex', alignItems: 'center',
        fontFamily: MONO, fontSize: small ? 8 : 8.5, lineHeight: 1, letterSpacing: '0.04em',
        color: '#fff', background: SUCCESS, padding: small ? '2px 6px' : '3px 7px',
        borderRadius: 999, whiteSpace: 'nowrap',
      }}
    >abc…</span>
  )
}

/** A heart toggle. Stops propagation so it works inside clickable rows. */
function FavBtn({
  on, onClick, size = 16, style,
}: {
  on: boolean
  onClick: () => void
  size?: number
  style?: React.CSSProperties
}) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick() }}
      title={on ? 'Remove from favorites' : 'Add to favorites'}
      style={{
        flexShrink: 0, background: 'none', border: 'none', cursor: 'pointer',
        padding: '4px 4px', lineHeight: 1, fontSize: size, fontFamily: MONO,
        color: on ? ACCENT : FG4, ...style,
      }}
    >{on ? '♥' : '♡'}</button>
  )
}

/** "＋" button that opens a popover to add a track to an existing playlist or a
 *  freshly created one. Closes on outside click / Escape. */
function AddToPlaylistBtn({ localId }: { localId: string }) {
  const lm = useLocalMusic()
  const [open, setOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const wrapRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false); setCreating(false); setName('')
      }
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const close = () => { setOpen(false); setCreating(false); setName('') }
  const add = async (pid: string) => { await lm.addToPlaylist(pid, localId); close() }
  const create = async () => {
    const n = name.trim()
    if (!n) return
    const pl = await lm.createPlaylist(n)
    await lm.addToPlaylist(pl.id, localId)
    close()
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative', flexShrink: 0 }}>
      <button
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o) }}
        title="Add to playlist"
        style={{ background: 'none', border: `1px solid ${BORDER2}`, color: FG3, fontFamily: MONO, fontSize: 12, lineHeight: 1, padding: '3px 7px', cursor: 'pointer' }}
      >＋</button>
      {open && (
        <div
          style={{
            position: 'absolute', right: 0, top: '100%', marginTop: 4, zIndex: 20,
            minWidth: 190, maxHeight: 260, overflowY: 'auto', background: BG2,
            border: `1px solid ${BORDER}`, boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
          }}
        >
          <div style={{ padding: '7px 10px', fontFamily: MONO, fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: FG4, borderBottom: `1px solid ${BORDER2}` }}>
            Add to playlist
          </div>
          {lm.playlists.length === 0 && !creating && (
            <div style={{ padding: 10, fontFamily: MONO, fontSize: 10.5, color: FG4 }}>No playlists yet.</div>
          )}
          {lm.playlists.map((pl) => {
            const has = pl.trackIds.includes(localId)
            return (
              <button
                key={pl.id}
                disabled={has}
                onClick={() => void add(pl.id)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                  width: '100%', background: 'none', border: 'none', textAlign: 'left',
                  padding: '8px 10px', cursor: has ? 'default' : 'pointer',
                  color: has ? FG4 : FG2, fontFamily: SANS, fontSize: 12.5,
                }}
              >
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pl.name}</span>
                {has && <span style={{ color: ACCENT, fontFamily: MONO, fontSize: 11 }}>✓</span>}
              </button>
            )
          })}
          {creating ? (
            <div style={{ padding: 8, borderTop: `1px solid ${BORDER2}`, display: 'flex', gap: 6 }}>
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') void create(); if (e.key === 'Escape') close() }}
                placeholder="Playlist name"
                style={{ flex: 1, minWidth: 0, background: BG1, border: `1px solid ${BORDER2}`, color: FG, fontFamily: MONO, fontSize: 11, padding: '5px 7px', outline: 'none' }}
              />
              <button onClick={() => void create()} disabled={!name.trim()} style={{ background: name.trim() ? ACCENT : 'transparent', border: `1px solid ${name.trim() ? ACCENT : BORDER2}`, color: name.trim() ? '#fff' : FG4, fontFamily: MONO, fontSize: 11, padding: '0 9px', cursor: name.trim() ? 'pointer' : 'default' }}>↵</button>
            </div>
          ) : (
            <button
              onClick={() => setCreating(true)}
              style={{ display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', borderTop: `1px solid ${BORDER2}`, color: ACCENT, fontFamily: MONO, fontSize: 10.5, letterSpacing: '0.04em', padding: '9px 10px', cursor: 'pointer' }}
            >＋ New playlist…</button>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Favorites pane ─────────────────────────────────────────────────────────────

function FavoritesPane({
  query, onEdit, onTag, onPreview, onOpenArtist, onOpenAlbum,
}: {
  query: string
  onEdit: (t: LocalTrack) => void
  onTag: (t: LocalTrack) => void
  onPreview: (scope: ArtScope, key: string, label: string) => void
  onOpenArtist: (name: string) => void
  onOpenAlbum: (artist: string, album: string) => void
}) {
  const lm = useLocalMusic()
  const terms = useMemo(() => queryTerms(query), [query])

  const allFavArtists = useMemo(
    () => [...lm.favorites.artist].sort((a, b) => a.localeCompare(b)),
    [lm.favorites],
  )
  const allFavAlbums = useMemo(
    () => [...lm.favorites.album].map(parseFavAlbum).sort((a, b) => a.album.localeCompare(b.album)),
    [lm.favorites],
  )
  const allFavTracks = useMemo(
    () => lm.tracks.filter((t) => lm.favorites.track.has(t.id)),
    [lm.tracks, lm.favorites],
  )

  // Apply the search to each section (artists by name; albums by album + artist).
  const favArtists = useMemo(
    () => allFavArtists.filter((name) => matchesAll(name.toLowerCase(), terms)),
    [allFavArtists, terms],
  )
  const favAlbums = useMemo(
    () => allFavAlbums.filter(({ artist, album }) => matchesAll(`${album} ${artist}`.toLowerCase(), terms)),
    [allFavAlbums, terms],
  )
  const favTracks = useMemo(
    () => allFavTracks.filter((t) => trackMatches(t, terms)),
    [allFavTracks, terms],
  )

  // Catalog discoverability for the favorited artists/albums, derived from which
  // of their local tracks have a vector (same rule as the Library pane).
  const discoverableArtists = useMemo(() => {
    const s = new Set<string>()
    for (const t of lm.tracks) if (lm.discoverableIds.has(t.id)) s.add(artistKey(t))
    return s
  }, [lm.tracks, lm.discoverableIds])
  const discoverableAlbums = useMemo(() => {
    const s = new Set<string>()
    for (const t of lm.tracks) if (lm.discoverableIds.has(t.id)) s.add(favAlbumRef(artistKey(t), albumKey(t)))
    return s
  }, [lm.tracks, lm.discoverableIds])

  if (allFavArtists.length === 0 && allFavAlbums.length === 0 && allFavTracks.length === 0) {
    return <EmptyState text="No favorites yet." hint="Tap the ♥ on any artist, album, or song to save it here." />
  }

  if (terms.length && favArtists.length === 0 && favAlbums.length === 0 && favTracks.length === 0) {
    return <EmptyState text="No favorites match your search." hint="Try fewer or different words." />
  }

  return (
    <>
      {favArtists.length > 0 && (
        <>
          <SectionHeader label="Artists" hint={`${favArtists.length}`} />
          {favArtists.map((name) => (
            <GroupRow
              key={name}
              title={name}
              subtitle="Artist"
              onClick={() => onOpenArtist(name)}
              leading={<LocalArtThumb scope="artist" artKey={artistArtKey(name)} size={40} shape="circle" hint="view" onClick={() => onPreview('artist', artistArtKey(name), name)} />}
              fav={{ kind: 'artist', ref: favArtistRef(name) }}
              discoverable={discoverableArtists.has(name)}
            />
          ))}
        </>
      )}

      {favAlbums.length > 0 && (
        <>
          <SectionHeader label="Albums" hint={`${favAlbums.length}`} />
          {favAlbums.map(({ artist, album }) => (
            <GroupRow
              key={`${artist}/${album}`}
              title={album}
              subtitle={artist}
              onClick={() => onOpenAlbum(artist, album)}
              leading={<LocalArtThumb scope="album" artKey={albumArtKeyOf(artist, album)} size={40} shape="square" hint="view" onClick={() => onPreview('album', albumArtKeyOf(artist, album), album)} />}
              fav={{ kind: 'album', ref: favAlbumRef(artist, album) }}
              discoverable={discoverableAlbums.has(favAlbumRef(artist, album))}
            />
          ))}
        </>
      )}

      {favTracks.length > 0 && (
        <>
          <SectionHeader label="Songs" hint={`${favTracks.length}`} />
          {favTracks.map((track, i) => (
            <TrackRow key={track.id} index={i + 1} track={track} queue={favTracks} library actionLabel="Edit" onAction={() => onEdit(track)} onTag={() => onTag(track)} />
          ))}
        </>
      )}
    </>
  )
}

// ─── Playlists pane ─────────────────────────────────────────────────────────────

function PlaylistsPane({ query }: { query: string }) {
  const lm = useLocalMusic()
  const [selected, setSelected] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [renaming, setRenaming] = useState(false)
  const [renameText, setRenameText] = useState('')

  const terms = useMemo(() => queryTerms(query), [query])
  const byId = useMemo(() => new Map(lm.tracks.map((t) => [t.id, t])), [lm.tracks])
  const current = selected ? lm.playlists.find((p) => p.id === selected) ?? null : null

  const createPl = async () => {
    const n = name.trim()
    if (!n) return
    await lm.createPlaylist(n)
    setName(''); setCreating(false)
  }

  // ── Drilled into one playlist ──
  if (current) {
    const tracks = current.trackIds.map((id) => byId.get(id)).filter((t): t is LocalTrack => !!t)
    const missing = current.trackIds.length - tracks.length
    // Search filters the rows shown within this playlist.
    const shown = terms.length ? tracks.filter((t) => trackMatches(t, terms)) : tracks
    const saveRename = async () => {
      const n = renameText.trim()
      if (n && n !== current.name) await lm.renamePlaylist(current.id, n)
      setRenaming(false)
    }
    return (
      <>
        <PaneToolbar>
          <button
            onClick={() => { setSelected(null); setRenaming(false) }}
            style={{ background: 'none', border: `1px solid ${BORDER2}`, color: FG3, fontFamily: MONO, fontSize: 10, padding: '3px 8px', cursor: 'pointer' }}
          >← playlists</button>
          {renaming ? (
            <input
              autoFocus
              value={renameText}
              onChange={(e) => setRenameText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void saveRename(); if (e.key === 'Escape') setRenaming(false) }}
              onBlur={() => void saveRename()}
              style={{ background: BG2, border: `1px solid ${BORDER2}`, color: FG, fontFamily: SANS, fontSize: 13, padding: '4px 8px', outline: 'none' }}
            />
          ) : (
            <button
              onClick={() => { setRenameText(current.name); setRenaming(true) }}
              title="Rename playlist"
              style={{ background: 'none', border: 'none', color: FG2, fontFamily: SANS, fontSize: 14, cursor: 'pointer', padding: 0 }}
            >{current.name}</button>
          )}
          <span style={{ fontFamily: MONO, fontSize: 10.5, color: FG4 }}>
            {current.trackIds.length} track{current.trackIds.length === 1 ? '' : 's'}
          </span>
          <span style={{ flex: 1 }} />
          <HeaderBtn label="Play all" onClick={() => { if (tracks[0]) lm.playTrack(tracks[0], tracks) }} disabled={tracks.length === 0} />
          <HeaderBtn label="Delete" onClick={() => { void lm.deletePlaylist(current.id); setSelected(null) }} />
        </PaneToolbar>
        {shown.length === 0 && (
          terms.length
            ? <EmptyState text="No tracks in this playlist match your search." hint="Try fewer or different words." />
            : <EmptyState text="This playlist is empty." hint="Add songs with the ＋ button on any track in your library." />
        )}
        {shown.map((track, i) => (
          <TrackRow
            key={track.id}
            index={i + 1}
            track={track}
            queue={shown}
            library
            actionLabel="Remove"
            onAction={() => lm.removeFromPlaylist(current.id, track.id)}
          />
        ))}
        {missing > 0 && (
          <div style={{ padding: '10px 22px', fontFamily: MONO, fontSize: 10, color: FG4 }}>
            {missing} track{missing === 1 ? '' : 's'} from this playlist aren’t in the current scan.
          </div>
        )}
      </>
    )
  }

  // ── Playlist list ──
  const shownPlaylists = terms.length
    ? lm.playlists.filter((pl) => matchesAll(pl.name.toLowerCase(), terms))
    : lm.playlists
  return (
    <>
      <PaneToolbar>
        <span style={{ fontFamily: MONO, fontSize: 11, color: FG3 }}>
          {terms.length
            ? `${shownPlaylists.length} of ${lm.playlists.length} playlist${lm.playlists.length === 1 ? '' : 's'}`
            : `${lm.playlists.length} playlist${lm.playlists.length === 1 ? '' : 's'}`}
        </span>
        <span style={{ flex: 1 }} />
        {creating ? (
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void createPl(); if (e.key === 'Escape') { setCreating(false); setName('') } }}
              placeholder="Playlist name"
              style={{ background: BG2, border: `1px solid ${BORDER2}`, color: FG, fontFamily: MONO, fontSize: 11, padding: '5px 8px', outline: 'none', width: 160 }}
            />
            <HeaderBtn label="Create" onClick={() => void createPl()} disabled={!name.trim()} />
          </div>
        ) : (
          <HeaderBtn label="New playlist" onClick={() => setCreating(true)} />
        )}
      </PaneToolbar>
      {lm.playlists.length === 0 && !creating && (
        <EmptyState text="No playlists yet." hint="Create one, then add songs with the ＋ button on any track." />
      )}
      {lm.playlists.length > 0 && shownPlaylists.length === 0 && (
        <EmptyState text="No playlists match your search." hint="Try fewer or different words." />
      )}
      {shownPlaylists.map((pl) => (
        <GroupRow
          key={pl.id}
          title={pl.name}
          subtitle={`${pl.trackIds.length} track${pl.trackIds.length === 1 ? '' : 's'}`}
          onClick={() => setSelected(pl.id)}
          action={{ label: 'Delete', onClick: () => void lm.deletePlaylist(pl.id) }}
        />
      ))}
    </>
  )
}

function PlayerBar() {
  const lm = useLocalMusic()
  const t = lm.current
  if (!t) return null

  function scrub(e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    lm.seek((e.clientX - rect.left) / rect.width)
  }

  return (
    <div style={{
      flexShrink: 0, borderTop: `1px solid ${BORDER}`, background: BG2,
      padding: '12px 22px', display: 'flex', alignItems: 'center', gap: 18,
    }}>
      {/* Track info */}
      <div style={{ width: 220, flexShrink: 0, minWidth: 0 }}>
        <div style={{ fontFamily: SANS, fontSize: 13, color: FG, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {t.title}
        </div>
        <div style={{ fontFamily: MONO, fontSize: 10, color: FG3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {t.artist ?? t.album ?? 'Local file'}
        </div>
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        <CtrlBtn onClick={lm.prev} title="Previous">⏮</CtrlBtn>
        <CtrlBtn onClick={lm.togglePlay} title={lm.isPlaying ? 'Pause' : 'Play'} primary>
          {lm.isPlaying ? '⏸' : '▶'}
        </CtrlBtn>
        <CtrlBtn onClick={lm.next} title="Next">⏭</CtrlBtn>
      </div>

      {/* Progress */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
        <span style={{ fontFamily: MONO, fontSize: 10, color: FG3, width: 36, textAlign: 'right' }}>
          {fmtTime(lm.currentTime)}
        </span>
        <div
          onClick={scrub}
          style={{ flex: 1, height: 14, display: 'flex', alignItems: 'center', cursor: 'pointer' }}
        >
          <div style={{ position: 'relative', width: '100%', height: 3, background: BORDER, borderRadius: 2 }}>
            <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${lm.progress * 100}%`, background: ACCENT, borderRadius: 2 }} />
          </div>
        </div>
        <span style={{ fontFamily: MONO, fontSize: 10, color: FG3, width: 36 }}>
          {fmtTime(lm.duration)}
        </span>
      </div>
    </div>
  )
}

function CtrlBtn({
  children, onClick, title, primary,
}: {
  children: React.ReactNode
  onClick: () => void
  title: string
  primary?: boolean
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        width: primary ? 34 : 28, height: primary ? 34 : 28, borderRadius: '50%',
        border: `1px solid ${primary ? ACCENT : BORDER}`,
        background: primary ? ACCENT : 'transparent',
        color: primary ? '#fff' : FG2,
        fontSize: primary ? 13 : 11, cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >{children}</button>
  )
}

/** Modal wrapper around the shared results screen (Unlabeled-tab "Auto-organize").
 *  Same component the import flow uses; with no import `summary` it shows just the
 *  report plus the finish-up artwork / review steps, scoped to the whole library. */
function OrganizeReportModal({ report, onClose }: { report: OrganizeReport; onClose: () => void }) {
  const lm = useLocalMusic()
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
        style={{ width: 480, maxWidth: '100%', maxHeight: '100%', display: 'flex', flexDirection: 'column', background: BG1, border: `1px solid ${BORDER}`, color: FG }}
      >
        <div style={{ padding: '16px 20px', borderBottom: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div style={{ fontFamily: DISP, fontSize: 22, letterSpacing: '0.05em' }}>AUTO-ORGANIZE</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: FG4, fontSize: 18, cursor: 'pointer', fontFamily: MONO }}>✕</button>
        </div>
        <OrganizeResults
          report={report}
          artScopeTracks={lm.libraryTracks}
          primaryLabel="Done"
          onPrimary={onClose}
        />
      </div>
    </div>
  )
}
