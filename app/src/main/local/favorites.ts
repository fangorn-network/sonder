/**
 * main/local/favorites.ts
 *
 * "Favorited" artists, albums, and songs for the local library, persisted in
 * SQLite (main/db, `local_favorites`). A favorite is just a (kind, ref) pair:
 *  - kind 'track'  → ref is the local file id (LocalLibrary.fileId)
 *  - kind 'artist' → ref is the artist name
 *  - kind 'album'  → ref is "<artist>\0<album>" (see favAlbumRef in the renderer)
 *
 * Refs are built and kept consistent by the renderer (LocalMusicView), so they're
 * stored verbatim here — membership is an exact-string match.
 */

import { getDb } from '../db'

export type FavKind = 'track' | 'artist' | 'album'

/** Favorited refs grouped by kind — loaded once and held in the renderer. */
export interface Favorites {
  track: string[]
  artist: string[]
  album: string[]
}

const KINDS: FavKind[] = ['track', 'artist', 'album']

export function listFavorites(): Favorites {
  const rows = getDb()
    .prepare('SELECT kind, ref FROM local_favorites')
    .all() as { kind: string; ref: string }[]
  const out: Favorites = { track: [], artist: [], album: [] }
  for (const r of rows) {
    if ((KINDS as string[]).includes(r.kind)) out[r.kind as FavKind].push(r.ref)
  }
  return out
}

/** Flip a favorite on/off. Returns the new state (true = now favorited). */
export function toggleFavorite(kind: FavKind, ref: string): boolean {
  const db = getDb()
  const existing = db
    .prepare('SELECT 1 FROM local_favorites WHERE kind = ? AND ref = ?')
    .get(kind, ref)
  if (existing) {
    db.prepare('DELETE FROM local_favorites WHERE kind = ? AND ref = ?').run(kind, ref)
    return false
  }
  db.prepare('INSERT INTO local_favorites (kind, ref, created_at) VALUES (?, ?, ?)')
    .run(kind, ref, Date.now())
  return true
}
