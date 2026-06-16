/**
 * main/local/types.ts
 *
 * The shape of a local on-disk audio track, shared by the main process (scanner +
 * file server) and the preload bridge. The renderer plays these in-app through an
 * HTML5 <audio> element pointed at `streamUrl` — a localhost endpoint served by
 * ./LocalLibrary.ts. Deliberately decoupled from the catalog `Track` type: local
 * playback is standalone and does not feed the kernel / agent / taste machinery.
 */

export interface LocalTrack {
  /** Stable, URL-safe id derived from the absolute path. */
  id: string
  /** Absolute path on disk (shown to the user; never sent to the network). */
  path: string
  title: string
  artist: string | null
  album: string | null
  /** Lowercased file extension incl. dot, e.g. ".mp3". */
  ext: string
  /** http://127.0.0.1:<port>/<id> — fed straight into <audio>.src. */
  streamUrl: string

  // ── Metadata library (see ./catalog.ts) ────────────────────────────────────
  /** True once structured metadata exists (title + artist). Drives the
   *  Library vs Unlabeled split in the renderer. */
  labeled: boolean
  /** Canonical track id (computeTrackId) once labeled — matches PublishModal. */
  trackId?: string | null
  isrcCode?: string | null
  datePublished?: string | null
  durationMs?: number | null
  contributors?: Contributor[]
}

/** What a piece of artwork is attached to. */
export type ArtScope = 'album' | 'artist'

/** A query for third-party artwork. `album` is required for album lookups and
 *  ignored for artist lookups. */
export interface ArtQuery {
  artist: string
  album?: string | null
}

/**
 * A third-party artwork candidate (e.g. from Deezer). `thumbDataUrl` is a small
 * preview inlined as a data URL so the renderer can show it under the app's CSP
 * (which blocks remote <img>); `fullUrl` is the full-resolution image, fetched in
 * main only when the user commits the pick.
 */
export interface ArtCandidate {
  /** Human label for the provider, e.g. "Deezer". */
  source: string
  /** What this image depicts, e.g. "Daft Punk — Discovery" or "Daft Punk". */
  label: string
  /** Small inline preview (data URL), safe to render under CSP. */
  thumbDataUrl: string
  /** Full-resolution image URL, downloaded + stored on commit. */
  fullUrl: string
  width?: number | null
  height?: number | null
}

/** How a bulk import treats the source files: copy them into the library folder
 *  (survives the source being disconnected) or reference them where they are. */
export type ImportMode = 'copy' | 'reference'

/** Per-file progress for a copy import. */
export interface ImportProgress {
  total: number
  processed: number
  /** Basename of the file currently being copied. */
  file: string
}

/** Outcome of a bulk import. */
export interface ImportSummary {
  mode: ImportMode
  source: string
  /** Destination root for copy imports. */
  dest?: string
  total: number
  copied: number
  /** Files already present at the destination (copy) — left untouched. */
  skipped: number
  failed: number
  /** True when a reference-in-place root was newly added (false if it was a
   *  duplicate / overlapped an existing root). */
  referenced: boolean
}

/** The library's scan roots: the primary folder (where copies land) plus any
 *  referenced-in-place folders. */
export interface LibraryRoots {
  primary: string
  extra: string[]
}

/** A credited contributor — mirrors `contributors[]` in TrackInvariantSchema.json. */
export interface Contributor {
  role: string | null
  name: string | null
  id: string | null
}

/**
 * Editable, schema-shaped metadata for a local track — what the metadata editor
 * submits and what `local:meta:get` / tag-reads return. Mirrors the user-facing
 * fields of schemas/TrackInvariantSchema.json (schemaVersion, trackId and
 * timestamps are managed in main, not edited here).
 */
export interface LocalTrackMeta {
  title: string
  byArtist: string
  albumName: string | null
  datePublished: string | null
  isrcCode: string | null
  durationMs: number | null
  contributors: Contributor[]
}

/**
 * Semantic taxonomy tags for a local track — what the tag editor submits and what
 * `local:tags:get` returns. Shaped to schemas/TrackTaxonomySchema.json
 * (schemaVersion + trackId are managed in main, not edited here). Persisted
 * locally; not published or embedded yet.
 */
export interface LocalTrackTags {
  genres: string[]
  moods: string[]
  themes: string[]
  contexts: string[]
}

/**
 * Extensions we surface. Restricted to formats Chromium's <audio> can decode, so
 * a listed track actually plays. (WMA/AIFF are intentionally omitted — Chromium
 * can't decode them, and listing unplayable files is worse than hiding them.)
 */
export const AUDIO_EXTENSIONS = new Set([
  '.mp3',
  '.m4a',
  '.aac',
  '.flac',
  '.wav',
  '.ogg',
  '.oga',
  '.opus',
  '.weba',
])
