/**
 * main/local/art.ts
 *
 * User-supplied album / artist artwork. The user picks a local image; we read it
 * and stash the bytes inline in SQLite (main/db, `local_art`). Stored inline
 * rather than by path so artwork survives the source image being moved or
 * deleted, and there's no file cache to manage. Returned to the renderer as a
 * `data:` URL ready to drop into an <img>.
 *
 * Art is keyed by a scope ('album' | 'artist') plus a normalized key the renderer
 * builds (artist name, or artist + album). Normalizing here keeps "Artist" and
 * "artist " pointing at the same artwork.
 */

import fs from 'fs'
import mime from 'mime-types'
import { getDb } from '../db'
import type { ArtScope } from './types'

function normKey(key: string): string {
  return key.trim().toLowerCase()
}

interface ArtRow { mime: string; data: Buffer }

function toDataUrl(row: ArtRow): string {
  return `data:${row.mime};base64,${row.data.toString('base64')}`
}

/** The stored artwork as a data URL, or null if none is set. */
export function getArt(scope: ArtScope, key: string): string | null {
  const row = getDb()
    .prepare('SELECT mime, data FROM local_art WHERE scope = ? AND art_key = ?')
    .get(scope, normKey(key)) as ArtRow | undefined
  return row ? toDataUrl(row) : null
}

/** Read an image off disk and store it as the artwork for (scope, key). */
export function setArtFromFile(scope: ArtScope, key: string, filePath: string): string {
  const data = fs.readFileSync(filePath)
  const m = (mime.lookup(filePath) || 'image/png') as string
  getDb()
    .prepare(
      `INSERT INTO local_art (scope, art_key, mime, data, updated_at)
       VALUES (@scope, @key, @mime, @data, @now)
       ON CONFLICT(scope, art_key) DO UPDATE SET
         mime = excluded.mime, data = excluded.data, updated_at = excluded.updated_at`,
    )
    .run({ scope, key: normKey(key), mime: m, data, now: Date.now() })
  return toDataUrl({ mime: m, data })
}

export function clearArt(scope: ArtScope, key: string): void {
  getDb().prepare('DELETE FROM local_art WHERE scope = ? AND art_key = ?').run(scope, normKey(key))
}
