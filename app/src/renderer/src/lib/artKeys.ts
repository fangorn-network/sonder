/**
 * lib/artKeys.ts
 *
 * Artwork keys, shared by the library views and the metadata editors so stored
 * art lines up no matter where it's set. Artist art is keyed by artist name;
 * album art by artist + album (album names aren't globally unique). Main
 * normalizes (trim + lowercase) before matching, so callers pass the
 * human-readable names as-is.
 */

// Separator between artist and album in an album art key. Historically a NUL
// (U+0000), and kept that way so art already stored under the old key still
// resolves. better-sqlite3 binds TEXT with an explicit length, so the embedded
// NUL round-trips intact. Built via fromCharCode so there's no raw NUL byte in
// source (which would make git treat this file as binary).
const ALBUM_ART_SEP = String.fromCharCode(0)

export const artistArtKey = (name: string): string => name
export const albumArtKeyOf = (artist: string, album: string): string =>
  `${artist}${ALBUM_ART_SEP}${album}`

/** Match main's normKey (trim + lowercase) so a built key can be checked against
 *  the stored-key set from `listArtKeys` to tell whether art already exists. */
export const normalizeArtKey = (key: string): string => key.trim().toLowerCase()
