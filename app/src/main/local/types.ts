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
