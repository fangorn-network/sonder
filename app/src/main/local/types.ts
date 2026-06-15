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
