/**
 * providers/LocalMusicProvider.tsx
 *
 * Standalone player for on-disk music. Owns its own HTML5 <audio> element and
 * transport so it stays alive while the user moves around the app, and is
 * deliberately isolated from the catalog player / kernel / agent — local tracks
 * just play. Files are located + served by the main process (main/local/*); this
 * only points <audio> at the localhost stream URL each track carries.
 */

import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
  type ReactNode,
} from 'react'

/** A credited contributor — mirrors `contributors[]` in TrackInvariantSchema.json. */
export interface Contributor {
  role: string | null
  name: string | null
  id: string | null
}

/** What a piece of artwork is attached to. Mirror of main/local/types.ts. */
export type ArtScope = 'album' | 'artist'

/** What can be favorited. Mirror of main/local/favorites.ts `FavKind`. */
export type FavKind = 'track' | 'artist' | 'album'

/** Favorited refs grouped by kind, held as Sets for O(1) membership checks. */
export interface FavState {
  track: Set<string>
  artist: Set<string>
  album: Set<string>
}

/** A user playlist. Mirror of main/local/playlists.ts `LocalPlaylist`. */
export interface LocalPlaylist {
  id: string
  name: string
  /** Ordered local file ids. */
  trackIds: string[]
  createdAt: number
  updatedAt: number
}

/** Mirror of main/local/types.ts `LocalTrack` (structurally identical). */
export interface LocalTrack {
  id: string
  path: string
  title: string
  artist: string | null
  album: string | null
  ext: string
  streamUrl: string
  /** True once structured metadata exists (title + artist) — splits the
   *  library into Library vs Unlabeled. */
  labeled: boolean
  trackId?: string | null
  isrcCode?: string | null
  datePublished?: string | null
  durationMs?: number | null
  contributors?: Contributor[]
}

/** Editable, schema-shaped metadata — what the editor submits. Mirror of
 *  main/local/types.ts `LocalTrackMeta`. */
export interface LocalTrackMeta {
  title: string
  byArtist: string
  albumName: string | null
  datePublished: string | null
  isrcCode: string | null
  durationMs: number | null
  contributors: Contributor[]
}

/** Semantic taxonomy tags — what the tag editor submits. Shaped to
 *  schemas/TrackTaxonomySchema.json. Mirror of main/local/types.ts
 *  `LocalTrackTags`. Stored locally only; not published or embedded yet. */
export interface LocalTrackTags {
  genres: string[]
  moods: string[]
  themes: string[]
  contexts: string[]
}

interface LocalMusicContextValue {
  dir: string | null
  tracks: LocalTrack[]
  /** Tracks with structured metadata (title + artist). */
  libraryTracks: LocalTrack[]
  /** Tracks still missing metadata. */
  unlabeledTracks: LocalTrack[]
  loading: boolean
  error: string | null

  current: LocalTrack | null
  isPlaying: boolean
  currentTime: number
  duration: number
  progress: number // 0–1

  /** Scan the saved/default folder once, lazily (called when the view opens). */
  ensureLoaded: () => void
  /** Re-scan the current folder. */
  rescan: () => Promise<void>
  /** Open the native folder picker, then scan the chosen folder. */
  chooseFolder: () => Promise<void>

  /** Best-effort metadata from the file's embedded tags, for prefilling the editor. */
  readTags: (localId: string) => Promise<LocalTrackMeta>
  /** Save (insert/update) a track's metadata; moves it into the Library in place. */
  saveMeta: (localId: string, meta: LocalTrackMeta) => Promise<void>
  /** Save many tracks at once (e.g. "Label all" on a folder), in one state update. */
  saveMetaMany: (entries: { localId: string; meta: LocalTrackMeta }[]) => Promise<void>
  /** Remove a track's metadata; returns it to Unlabeled (re-scans to re-derive). */
  removeMeta: (localId: string) => Promise<void>

  /** Taxonomy tags keyed by local id, for every track that carries any — drives
   *  the "tagged" indicator in track lists without a per-row IPC round-trip. */
  trackTagsById: Map<string, LocalTrackTags>
  /** Stored taxonomy tags for a track (genres/moods/themes/contexts), or null. */
  getTrackTags: (localId: string) => Promise<LocalTrackTags | null>
  /** Save (insert/update) a track's taxonomy tags. Local-only — not published. */
  saveTrackTags: (localId: string, tags: LocalTrackTags) => Promise<void>
  /** Remove a track's taxonomy tags. */
  deleteTrackTags: (localId: string) => Promise<void>

  /** Bumps whenever artwork changes — consumers re-read to refresh. */
  artRev: number
  /** Stored album/artist artwork as a data URL (cached), or null. */
  getArt: (scope: ArtScope, key: string) => Promise<string | null>
  /** Open the image picker and set artwork for (scope, key); returns its URL. */
  setArt: (scope: ArtScope, key: string) => Promise<string | null>
  /** Remove the stored artwork for (scope, key). */
  clearArt: (scope: ArtScope, key: string) => Promise<void>

  // ── Favorites ───────────────────────────────────────────────────────────
  /** Favorited refs by kind. */
  favorites: FavState
  /** Whether (kind, ref) is currently favorited. */
  isFavorite: (kind: FavKind, ref: string) => boolean
  /** Flip a favorite on/off (optimistic, persisted in main). */
  toggleFavorite: (kind: FavKind, ref: string) => Promise<void>

  // ── Playlists ───────────────────────────────────────────────────────────
  playlists: LocalPlaylist[]
  createPlaylist: (name: string) => Promise<LocalPlaylist>
  renamePlaylist: (id: string, name: string) => Promise<void>
  deletePlaylist: (id: string) => Promise<void>
  addToPlaylist: (id: string, localId: string) => Promise<void>
  removeFromPlaylist: (id: string, localId: string) => Promise<void>

  /** Play a track. An optional `queue` makes next/prev step through that list
   *  (e.g. a playlist) instead of the full scanned library. */
  playTrack: (track: LocalTrack, queue?: LocalTrack[]) => void
  togglePlay: () => void
  next: () => void
  prev: () => void
  seek: (ratio: number) => void
}

const LocalMusicContext = createContext<LocalMusicContextValue | null>(null)

/** Merge a saved metadata row onto a track, flipping it into the Library. */
function applyStored(t: LocalTrack, s: {
  title: string; byArtist: string; albumName: string | null; trackId: string
  isrcCode: string | null; datePublished: string | null; durationMs: number | null
  contributors: Contributor[]
}): LocalTrack {
  return {
    ...t,
    labeled: true,
    title: s.title,
    artist: s.byArtist,
    album: s.albumName,
    trackId: s.trackId,
    isrcCode: s.isrcCode,
    datePublished: s.datePublished,
    durationMs: s.durationMs,
    contributors: s.contributors,
  }
}

export function useLocalMusic(): LocalMusicContextValue {
  const ctx = useContext(LocalMusicContext)
  if (!ctx) throw new Error('useLocalMusic must be used within LocalMusicProvider')
  return ctx
}

export function LocalMusicProvider({ children }: { children: ReactNode }) {
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const [dir, setDir] = useState<string | null>(null)
  const [tracks, setTracks] = useState<LocalTrack[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const loadedRef = useRef(false)

  const [current, setCurrent] = useState<LocalTrack | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)

  // Show the saved/default folder path on mount; scanning stays lazy.
  useEffect(() => {
    window.localMusic?.getDir().then(setDir).catch(() => {})
  }, [])

  const scanDir = useCallback(async (target?: string) => {
    setLoading(true)
    setError(null)
    try {
      const found = await window.localMusic.scan(target)
      setTracks(found)
      if (target) setDir(target)
      else window.localMusic.getDir().then(setDir).catch(() => {})
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not scan folder')
    } finally {
      // Mark the lazy first-load as attempted even on failure, so `ensureLoaded`
      // doesn't retry-loop. Explicit rescan/chooseFolder still re-scan freely.
      loadedRef.current = true
      setLoading(false)
    }
  }, [])

  const ensureLoaded = useCallback(() => {
    if (loadedRef.current || loading) return
    void scanDir()
  }, [loading, scanDir])

  const rescan = useCallback(() => scanDir(dir ?? undefined), [scanDir, dir])

  const chooseFolder = useCallback(async () => {
    const picked = await window.localMusic.pickDir()
    if (!picked) return
    await scanDir(picked)
  }, [scanDir])

  // ── Metadata library ──────────────────────────────────────────────────
  const libraryTracks = useMemo(() => tracks.filter((t) => t.labeled), [tracks])
  const unlabeledTracks = useMemo(() => tracks.filter((t) => !t.labeled), [tracks])

  const readTags = useCallback((localId: string) => window.localMusic.readTags(localId), [])

  const saveMeta = useCallback(async (localId: string, meta: LocalTrackMeta) => {
    const stored = await window.localMusic.saveMeta(localId, meta)
    // Patch the track in place so it flips into the Library bucket without a
    // full re-scan (keeps bulk auto-labeling snappy).
    setTracks((prev) => prev.map((t) => (t.id === localId ? applyStored(t, stored) : t)))
  }, [])

  const saveMetaMany = useCallback(async (entries: { localId: string; meta: LocalTrackMeta }[]) => {
    const stored = await Promise.all(entries.map((e) => window.localMusic.saveMeta(e.localId, e.meta)))
    setTracks((prev) => prev.map((t) => {
      const s = stored.find((r) => r.localId === t.id)
      return s ? applyStored(t, s) : t
    }))
  }, [])

  const removeMeta = useCallback(async (localId: string) => {
    await window.localMusic.deleteMeta(localId)
    // Re-scan so the track's title/artist revert to the filename-derived guess.
    await scanDir(dir ?? undefined)
  }, [scanDir, dir])

  // ── Taxonomy tags ─────────────────────────────────────────────────────────
  // Local-only enrichment; doesn't change a track's labeled/title state, so there's
  // nothing to patch into `tracks` — the editor reads on open and writes on save.
  // We do keep a lightweight id→tags map loaded once, so track rows can show a
  // "tagged" badge; it's kept in sync on save/delete rather than re-fetched.
  const [trackTagsById, setTrackTagsById] = useState<Map<string, LocalTrackTags>>(new Map())

  useEffect(() => {
    window.localMusic.listTrackTags().then((all) => {
      setTrackTagsById(new Map(all.map((t) => [t.localId, {
        genres: t.genres, moods: t.moods, themes: t.themes, contexts: t.contexts,
      }])))
    }).catch(() => {})
  }, [])

  const getTrackTags = useCallback(async (localId: string): Promise<LocalTrackTags | null> => {
    const stored = await window.localMusic.getTrackTags(localId)
    if (!stored) return null
    return {
      genres: stored.genres,
      moods: stored.moods,
      themes: stored.themes,
      contexts: stored.contexts,
    }
  }, [])

  const saveTrackTags = useCallback(async (localId: string, tags: LocalTrackTags) => {
    await window.localMusic.saveTrackTags(localId, tags)
    setTrackTagsById((prev) => new Map(prev).set(localId, tags))
  }, [])

  const deleteTrackTags = useCallback(async (localId: string) => {
    await window.localMusic.deleteTrackTags(localId)
    setTrackTagsById((prev) => {
      if (!prev.has(localId)) return prev
      const next = new Map(prev)
      next.delete(localId)
      return next
    })
  }, [])

  // ── Album / artist artwork ──────────────────────────────────────────────
  // Data URLs are cached by `${scope}:${key}` (with in-flight de-dupe) so the
  // same art isn't re-fetched per row. `artRev` bumps on set/clear to nudge
  // <LocalArtThumb> to re-read.
  const artCache = useRef(new Map<string, string | null>())
  const artInflight = useRef(new Map<string, Promise<string | null>>())
  const [artRev, setArtRev] = useState(0)

  const getArt = useCallback((scope: ArtScope, key: string): Promise<string | null> => {
    const id = `${scope}:${key}`
    const cached = artCache.current.get(id)
    if (cached !== undefined) return Promise.resolve(cached)
    const existing = artInflight.current.get(id)
    if (existing) return existing
    const p = window.localMusic.getArt(scope, key)
      .then((url) => { artCache.current.set(id, url); artInflight.current.delete(id); return url })
      .catch(() => { artInflight.current.delete(id); return null })
    artInflight.current.set(id, p)
    return p
  }, [])

  const setArt = useCallback(async (scope: ArtScope, key: string): Promise<string | null> => {
    const url = await window.localMusic.pickArt(scope, key)
    if (url) { artCache.current.set(`${scope}:${key}`, url); setArtRev((r) => r + 1) }
    return url
  }, [])

  const clearArt = useCallback(async (scope: ArtScope, key: string): Promise<void> => {
    await window.localMusic.clearArt(scope, key)
    artCache.current.set(`${scope}:${key}`, null)
    setArtRev((r) => r + 1)
  }, [])

  // ── Favorites ───────────────────────────────────────────────────────────
  const [favorites, setFavorites] = useState<FavState>({
    track: new Set(), artist: new Set(), album: new Set(),
  })

  useEffect(() => {
    window.localMusic.listFavorites().then((f) => setFavorites({
      track: new Set(f.track), artist: new Set(f.artist), album: new Set(f.album),
    })).catch(() => {})
  }, [])

  const isFavorite = useCallback(
    (kind: FavKind, ref: string) => favorites[kind].has(ref),
    [favorites],
  )

  const toggleFavorite = useCallback(async (kind: FavKind, ref: string) => {
    // Optimistic flip — clone the affected Set so React sees a new reference.
    const flip = () => setFavorites((prev) => {
      const next = { ...prev, [kind]: new Set(prev[kind]) } as FavState
      if (next[kind].has(ref)) next[kind].delete(ref)
      else next[kind].add(ref)
      return next
    })
    flip()
    try {
      await window.localMusic.toggleFavorite(kind, ref)
    } catch {
      flip() // revert on failure
    }
  }, [])

  // ── Playlists ───────────────────────────────────────────────────────────
  const [playlists, setPlaylists] = useState<LocalPlaylist[]>([])

  const refreshPlaylists = useCallback(async () => {
    try { setPlaylists(await window.localMusic.listPlaylists()) } catch { /* ignore */ }
  }, [])

  useEffect(() => { void refreshPlaylists() }, [refreshPlaylists])

  const createPlaylist = useCallback(async (name: string) => {
    const pl = await window.localMusic.createPlaylist(name)
    await refreshPlaylists()
    return pl
  }, [refreshPlaylists])

  const renamePlaylist = useCallback(async (id: string, name: string) => {
    await window.localMusic.renamePlaylist(id, name)
    await refreshPlaylists()
  }, [refreshPlaylists])

  const deletePlaylist = useCallback(async (id: string) => {
    await window.localMusic.deletePlaylist(id)
    await refreshPlaylists()
  }, [refreshPlaylists])

  const addToPlaylist = useCallback(async (id: string, localId: string) => {
    await window.localMusic.addToPlaylist(id, localId)
    await refreshPlaylists()
  }, [refreshPlaylists])

  const removeFromPlaylist = useCallback(async (id: string, localId: string) => {
    await window.localMusic.removeFromPlaylist(id, localId)
    await refreshPlaylists()
  }, [refreshPlaylists])

  // Playback queue for next/prev. Null → step through the full library; set to a
  // specific list (e.g. a playlist) to sequence within it. A ref so changing it
  // doesn't re-wire the <audio> event effect.
  const queueRef = useRef<LocalTrack[] | null>(null)

  const playTrack = useCallback((track: LocalTrack, queue?: LocalTrack[]) => {
    const audio = audioRef.current
    if (!audio) return
    queueRef.current = queue && queue.length ? queue : null
    // Toggle when re-selecting the current track.
    if (current?.id === track.id) {
      if (audio.paused) void audio.play()
      else audio.pause()
      return
    }
    setCurrent(track)
    setError(null)
    audio.src = track.streamUrl
    void audio.play().catch((e) => setError(e instanceof Error ? e.message : 'Playback failed'))
  }, [current])

  const togglePlay = useCallback(() => {
    const audio = audioRef.current
    if (!audio || !current) return
    if (audio.paused) void audio.play()
    else audio.pause()
  }, [current])

  const step = useCallback((delta: number) => {
    if (!current) return
    const list = queueRef.current ?? tracks
    const idx = list.findIndex((t) => t.id === current.id)
    const nextTrack = list[idx + delta]
    if (nextTrack) playTrack(nextTrack, queueRef.current ?? undefined)
  }, [current, tracks, playTrack])

  const next = useCallback(() => step(1), [step])
  const prev = useCallback(() => step(-1), [step])

  const seek = useCallback((ratio: number) => {
    const audio = audioRef.current
    if (audio && duration) {
      audio.currentTime = Math.max(0, Math.min(1, ratio)) * duration
    }
  }, [duration])

  // ── <audio> event wiring ──────────────────────────────────────────────
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    const onPlay = () => setIsPlaying(true)
    const onPause = () => setIsPlaying(false)
    const onTime = () => setCurrentTime(audio.currentTime)
    const onDuration = () => setDuration(Number.isFinite(audio.duration) ? audio.duration : 0)
    const onEnded = () => next()
    const onError = () => {
      if (!audio.src) return
      setError('Could not play this file')
      setIsPlaying(false)
    }

    audio.addEventListener('play', onPlay)
    audio.addEventListener('pause', onPause)
    audio.addEventListener('timeupdate', onTime)
    audio.addEventListener('durationchange', onDuration)
    audio.addEventListener('ended', onEnded)
    audio.addEventListener('error', onError)
    return () => {
      audio.removeEventListener('play', onPlay)
      audio.removeEventListener('pause', onPause)
      audio.removeEventListener('timeupdate', onTime)
      audio.removeEventListener('durationchange', onDuration)
      audio.removeEventListener('ended', onEnded)
      audio.removeEventListener('error', onError)
    }
  }, [next])

  const value: LocalMusicContextValue = {
    dir, tracks, libraryTracks, unlabeledTracks, loading, error,
    current, isPlaying, currentTime, duration,
    progress: duration ? currentTime / duration : 0,
    ensureLoaded, rescan, chooseFolder,
    readTags, saveMeta, saveMetaMany, removeMeta,
    trackTagsById, getTrackTags, saveTrackTags, deleteTrackTags,
    artRev, getArt, setArt, clearArt,
    favorites, isFavorite, toggleFavorite,
    playlists, createPlaylist, renamePlaylist, deletePlaylist, addToPlaylist, removeFromPlaylist,
    playTrack, togglePlay, next, prev, seek,
  }

  return (
    <LocalMusicContext.Provider value={value}>
      <audio ref={audioRef} />
      {children}
    </LocalMusicContext.Provider>
  )
}
