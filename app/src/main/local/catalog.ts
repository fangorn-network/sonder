/**
 * main/local/catalog.ts
 *
 * Structured metadata for on-disk tracks, persisted in SQLite (main/db). A track
 * is "labeled" once it has a title + artist; the renderer uses that to split the
 * local library into Library vs Unlabeled. Metadata is keyed by the local file id
 * (LocalLibrary.fileId — a hash of the absolute path).
 *
 * Three sources feed the editor: embedded file tags (readEmbeddedTags), an online
 * lookup (renderer-side MusicBrainz), and manual entry. Only what the user saves
 * lands here.
 */

import crypto from 'crypto'
import path from 'path'
import { getDb } from '../db'
import type { Contributor, LocalTrackMeta } from './types'

const SCHEMA_VERSION = 1

/** Stored row, shaped for merging into LocalTrack during a scan. */
export interface StoredMeta extends LocalTrackMeta {
  localId: string
  path: string
  trackId: string
}

interface Row {
  local_id: string
  path: string
  schema_version: number
  track_id: string | null
  isrc_code: string | null
  title: string
  by_artist: string
  album_name: string | null
  date_published: string | null
  duration_ms: number | null
  contributors: string | null
  created_at: number
  updated_at: number
}

/**
 * Canonical track id — SHA-256 of `${artist}:${title}`, first 24 hex chars.
 * Must stay identical to the renderer's computeTrackId (src/renderer/src/lib/
 * trackId.ts) so a locally-labeled track resolves to the same id PublishModal uses.
 */
export function computeTrackId(artist: string, title: string): string {
  return crypto.createHash('sha256').update(`${artist}:${title}`).digest('hex').slice(0, 24)
}

function rowToStored(r: Row): StoredMeta {
  return {
    localId: r.local_id,
    path: r.path,
    trackId: r.track_id ?? computeTrackId(r.by_artist, r.title),
    title: r.title,
    byArtist: r.by_artist,
    albumName: r.album_name,
    datePublished: r.date_published,
    isrcCode: r.isrc_code,
    durationMs: r.duration_ms,
    contributors: parseContributors(r.contributors),
  }
}

function parseContributors(json: string | null): Contributor[] {
  if (!json) return []
  try {
    const v = JSON.parse(json)
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}

// ─── CRUD ─────────────────────────────────────────────────────────────────────

export function getMeta(localId: string): StoredMeta | null {
  const row = getDb()
    .prepare('SELECT * FROM local_track_meta WHERE local_id = ?')
    .get(localId) as Row | undefined
  return row ? rowToStored(row) : null
}

/** All stored metadata, keyed by local id — loaded once per scan to merge in. */
export function listMeta(): Map<string, StoredMeta> {
  const rows = getDb().prepare('SELECT * FROM local_track_meta').all() as Row[]
  return new Map(rows.map((r) => [r.local_id, rowToStored(r)]))
}

/**
 * Insert or update a track's metadata. Requires title + artist (the "labeled"
 * threshold); returns the stored result (with computed trackId).
 */
export function upsertMeta(localId: string, filePath: string, meta: LocalTrackMeta): StoredMeta {
  const title = meta.title.trim()
  const byArtist = meta.byArtist.trim()
  if (!title || !byArtist) throw new Error('title and artist are required')

  const trackId = computeTrackId(byArtist, title)
  const now = Date.now()
  getDb()
    .prepare(
      `INSERT INTO local_track_meta
         (local_id, path, schema_version, track_id, isrc_code, title, by_artist,
          album_name, date_published, duration_ms, contributors, created_at, updated_at)
       VALUES
         (@local_id, @path, @schema_version, @track_id, @isrc_code, @title, @by_artist,
          @album_name, @date_published, @duration_ms, @contributors, @now, @now)
       ON CONFLICT(local_id) DO UPDATE SET
         path           = excluded.path,
         schema_version = excluded.schema_version,
         track_id       = excluded.track_id,
         isrc_code      = excluded.isrc_code,
         title          = excluded.title,
         by_artist      = excluded.by_artist,
         album_name     = excluded.album_name,
         date_published = excluded.date_published,
         duration_ms    = excluded.duration_ms,
         contributors   = excluded.contributors,
         updated_at     = excluded.updated_at`,
    )
    .run({
      local_id: localId,
      path: filePath,
      schema_version: SCHEMA_VERSION,
      track_id: trackId,
      isrc_code: meta.isrcCode || null,
      title,
      by_artist: byArtist,
      album_name: meta.albumName || null,
      date_published: meta.datePublished || null,
      duration_ms: meta.durationMs ?? null,
      contributors: meta.contributors?.length ? JSON.stringify(meta.contributors) : null,
      now,
    })

  return {
    localId, path: filePath, trackId,
    title, byArtist,
    albumName: meta.albumName || null,
    datePublished: meta.datePublished || null,
    isrcCode: meta.isrcCode || null,
    durationMs: meta.durationMs ?? null,
    contributors: meta.contributors ?? [],
  }
}

export function deleteMeta(localId: string): void {
  getDb().prepare('DELETE FROM local_track_meta WHERE local_id = ?').run(localId)
}

/**
 * Rewrite a labeled track's artist — used when merging duplicate artist spellings
 * (e.g. "God Smack" → "Godsmack"). Recomputes trackId (which is derived from
 * artist + title) so the track still resolves to the right canonical id. No-op if
 * the track has no stored row or the new name is blank.
 */
export function setArtistName(localId: string, byArtist: string): void {
  const artist = byArtist.trim()
  if (!artist) return
  const row = getDb()
    .prepare('SELECT title FROM local_track_meta WHERE local_id = ?')
    .get(localId) as { title: string } | undefined
  if (!row) return
  getDb()
    .prepare('UPDATE local_track_meta SET by_artist = ?, track_id = ?, updated_at = ? WHERE local_id = ?')
    .run(artist, computeTrackId(artist, row.title), Date.now(), localId)
}

// ─── Embedded tags ──────────────────────────────────────────────────────────

/**
 * Best-effort metadata from the file's embedded tags (ID3/Vorbis/MP4) via
 * music-metadata. Used to prefill the editor and to power bulk auto-label. Falls
 * back to the filename for the title so the form is never blank. music-metadata
 * is ESM-only, hence the dynamic import.
 */
export async function readEmbeddedTags(absPath: string): Promise<LocalTrackMeta> {
  const fallbackTitle = path.basename(absPath, path.extname(absPath))
  try {
    const mm = await import('music-metadata')
    const { common, format } = await mm.parseFile(absPath, { duration: true })

    const contributors: Contributor[] = (common.composer ?? []).map((name) => ({
      role: 'composer', name, id: null,
    }))

    return {
      title: (common.title || fallbackTitle).trim(),
      byArtist: (common.artist || common.albumartist || '').trim(),
      albumName: common.album?.trim() || null,
      datePublished: common.date || (common.year ? String(common.year) : null),
      isrcCode: common.isrc?.[0] || null,
      durationMs: format.duration ? Math.round(format.duration * 1000) : null,
      contributors,
    }
  } catch {
    // Unreadable / no tags — hand back just the filename title.
    return {
      title: fallbackTitle,
      byArtist: '',
      albumName: null,
      datePublished: null,
      isrcCode: null,
      durationMs: null,
      contributors: [],
    }
  }
}
