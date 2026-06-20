/**
 * main/local/taxonomy.ts
 *
 * Semantic taxonomy tags for on-disk tracks (genres / moods / themes / contexts),
 * persisted in SQLite (main/db). Shaped to schemas/TrackTaxonomySchema.json and
 * keyed by the local file id (LocalLibrary.fileId), the same key as the metadata
 * catalog (main/local/catalog.ts).
 *
 * This is the local-first replacement for the old network tagging flow
 * (renderer TrackTag.tsx), which published tags to the network and triggered
 * embedding reingest. Here we only store: nothing is published or embedded. The
 * row carries schema_version + track_id so it's ready to feed embeddings once
 * that capability is turned on for users.
 */

import { getDb } from '../db'
import { computeTrackId } from './catalog'
import type { LocalTrackTags } from './types'

const SCHEMA_VERSION = 1

/** Stored row, including the managed schema/track fields. */
export interface StoredTags extends LocalTrackTags {
  localId: string
  schemaVersion: number
  trackId: string | null
}

interface Row {
  local_id: string
  schema_version: number
  track_id: string | null
  genres: string
  moods: string
  themes: string
  contexts: string
  created_at: number
  updated_at: number
}

function parseList(json: string | null): string[] {
  if (!json) return []
  try {
    const v = JSON.parse(json)
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

function rowToStored(r: Row): StoredTags {
  return {
    localId: r.local_id,
    schemaVersion: r.schema_version,
    trackId: r.track_id,
    genres: parseList(r.genres),
    moods: parseList(r.moods),
    themes: parseList(r.themes),
    contexts: parseList(r.contexts),
  }
}

// ─── CRUD ─────────────────────────────────────────────────────────────────────

export function getTags(localId: string): StoredTags | null {
  const row = getDb()
    .prepare('SELECT * FROM local_track_tags WHERE local_id = ?')
    .get(localId) as Row | undefined
  return row ? rowToStored(row) : null
}

/** All stored tags, keyed by local id — loaded once per scan to merge in. */
export function listTags(): Map<string, StoredTags> {
  const rows = getDb().prepare('SELECT * FROM local_track_tags').all() as Row[]
  return new Map(rows.map((r) => [r.local_id, rowToStored(r)]))
}

/**
 * Insert or update a track's taxonomy tags. `trackId` is the labeled track's
 * canonical id (or null if it hasn't been labeled). Storing an all-empty set is
 * allowed and simply persists an empty tag row; callers that want to clear should
 * use deleteTags instead.
 */
export function upsertTags(
  localId: string,
  trackId: string | null,
  tags: LocalTrackTags,
): StoredTags {
  const now = Date.now()
  const genres = JSON.stringify(tags.genres ?? [])
  const moods = JSON.stringify(tags.moods ?? [])
  const themes = JSON.stringify(tags.themes ?? [])
  const contexts = JSON.stringify(tags.contexts ?? [])

  getDb()
    .prepare(
      `INSERT INTO local_track_tags
         (local_id, schema_version, track_id, genres, moods, themes, contexts, created_at, updated_at)
       VALUES
         (@local_id, @schema_version, @track_id, @genres, @moods, @themes, @contexts, @now, @now)
       ON CONFLICT(local_id) DO UPDATE SET
         schema_version = excluded.schema_version,
         track_id       = excluded.track_id,
         genres         = excluded.genres,
         moods          = excluded.moods,
         themes         = excluded.themes,
         contexts       = excluded.contexts,
         updated_at     = excluded.updated_at`,
    )
    .run({
      local_id: localId,
      schema_version: SCHEMA_VERSION,
      track_id: trackId,
      genres,
      moods,
      themes,
      contexts,
      now,
    })

  return {
    localId,
    schemaVersion: SCHEMA_VERSION,
    trackId,
    genres: tags.genres ?? [],
    moods: tags.moods ?? [],
    themes: tags.themes ?? [],
    contexts: tags.contexts ?? [],
  }
}

export function deleteTags(localId: string): void {
  getDb().prepare('DELETE FROM local_track_tags WHERE local_id = ?').run(localId)
}

// Re-export so callers can derive a track id without reaching into catalog.ts.
export { computeTrackId }
