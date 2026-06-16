/**
 * main/local/playlists.ts
 *
 * User playlists for the local library, persisted in SQLite (main/db,
 * `local_playlists` + `local_playlist_tracks`). A playlist is a named, ordered
 * list of local file ids; the renderer resolves those ids against the current
 * scan, skipping any whose file is no longer present.
 */

import crypto from 'crypto'
import { getDb } from '../db'

export interface LocalPlaylist {
  id: string
  name: string
  /** Ordered local file ids (LocalLibrary.fileId). */
  trackIds: string[]
  createdAt: number
  updatedAt: number
}

interface PlaylistRow {
  id: string
  name: string
  created_at: number
  updated_at: number
}

/** All playlists with their ordered track ids. */
export function listPlaylists(): LocalPlaylist[] {
  const db = getDb()
  const rows = db
    .prepare('SELECT id, name, created_at, updated_at FROM local_playlists ORDER BY created_at')
    .all() as PlaylistRow[]

  const trackRows = db
    .prepare('SELECT playlist_id, local_id FROM local_playlist_tracks ORDER BY playlist_id, position')
    .all() as { playlist_id: string; local_id: string }[]
  const byPlaylist = new Map<string, string[]>()
  for (const r of trackRows) {
    const arr = byPlaylist.get(r.playlist_id)
    if (arr) arr.push(r.local_id)
    else byPlaylist.set(r.playlist_id, [r.local_id])
  }

  return rows.map((p) => ({
    id: p.id,
    name: p.name,
    trackIds: byPlaylist.get(p.id) ?? [],
    createdAt: p.created_at,
    updatedAt: p.updated_at,
  }))
}

export function createPlaylist(name: string): LocalPlaylist {
  const clean = name.trim() || 'Untitled playlist'
  const id = crypto.randomUUID()
  const now = Date.now()
  getDb()
    .prepare('INSERT INTO local_playlists (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)')
    .run(id, clean, now, now)
  return { id, name: clean, trackIds: [], createdAt: now, updatedAt: now }
}

export function renamePlaylist(id: string, name: string): void {
  const clean = name.trim()
  if (!clean) throw new Error('playlist name is required')
  getDb()
    .prepare('UPDATE local_playlists SET name = ?, updated_at = ? WHERE id = ?')
    .run(clean, Date.now(), id)
}

export function deletePlaylist(id: string): void {
  const db = getDb()
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM local_playlist_tracks WHERE playlist_id = ?').run(id)
    db.prepare('DELETE FROM local_playlists WHERE id = ?').run(id)
  })
  tx()
}

/** Append a track to a playlist (no-op if it's already there). */
export function addToPlaylist(playlistId: string, localId: string): void {
  const db = getDb()
  const tx = db.transaction(() => {
    const exists = db
      .prepare('SELECT 1 FROM local_playlist_tracks WHERE playlist_id = ? AND local_id = ?')
      .get(playlistId, localId)
    if (exists) return
    const { pos } = db
      .prepare('SELECT COALESCE(MAX(position), -1) + 1 AS pos FROM local_playlist_tracks WHERE playlist_id = ?')
      .get(playlistId) as { pos: number }
    db.prepare(
      'INSERT INTO local_playlist_tracks (playlist_id, local_id, position, added_at) VALUES (?, ?, ?, ?)',
    ).run(playlistId, localId, pos, Date.now())
    db.prepare('UPDATE local_playlists SET updated_at = ? WHERE id = ?').run(Date.now(), playlistId)
  })
  tx()
}

export function removeFromPlaylist(playlistId: string, localId: string): void {
  const db = getDb()
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM local_playlist_tracks WHERE playlist_id = ? AND local_id = ?')
      .run(playlistId, localId)
    db.prepare('UPDATE local_playlists SET updated_at = ? WHERE id = ?').run(Date.now(), playlistId)
  })
  tx()
}
