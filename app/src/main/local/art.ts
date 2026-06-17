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
import { net } from 'electron'
import { getDb } from '../db'
import type { ArtScope } from './types'

function normKey(key: string): string {
  return key.trim().toLowerCase()
}

interface ArtRow { mime: string; data: Buffer }

function toDataUrl(row: ArtRow): string {
  return `data:${row.mime};base64,${row.data.toString('base64')}`
}

/** Read an image off disk and return it as a `data:` URL, without storing it.
 *  Used to preview a freshly picked image before it's committed under a key. */
export function imageFileToDataUrl(filePath: string): string {
  const data = fs.readFileSync(filePath)
  const m = (mime.lookup(filePath) || 'image/png') as string
  return toDataUrl({ mime: m, data })
}

/** The normalized keys that currently have stored artwork, grouped by scope.
 *  Lets the renderer flag which artists/albums still need art in one round-trip
 *  instead of probing each key. Keys are normalized (see normKey), so callers
 *  must compare against the same normalization. */
export function listArtKeys(): { artist: string[]; album: string[] } {
  const rows = getDb()
    .prepare('SELECT scope, art_key FROM local_art')
    .all() as { scope: ArtScope; art_key: string }[]
  const out: { artist: string[]; album: string[] } = { artist: [], album: [] }
  for (const r of rows) {
    if (r.scope === 'artist' || r.scope === 'album') out[r.scope].push(r.art_key)
  }
  return out
}

/** The stored artwork as a data URL, or null if none is set. */
export function getArt(scope: ArtScope, key: string): string | null {
  const row = getDb()
    .prepare('SELECT mime, data FROM local_art WHERE scope = ? AND art_key = ?')
    .get(scope, normKey(key)) as ArtRow | undefined
  return row ? toDataUrl(row) : null
}

/** Persist image bytes as the artwork for (scope, key); returns its data URL. */
function storeArt(scope: ArtScope, key: string, m: string, data: Buffer): string {
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

/** Read an image off disk and store it as the artwork for (scope, key). */
export function setArtFromFile(scope: ArtScope, key: string, filePath: string): string {
  const data = fs.readFileSync(filePath)
  const m = (mime.lookup(filePath) || 'image/png') as string
  return storeArt(scope, key, m, data)
}

/** Download an image over the network (via Electron's net stack, so it isn't
 *  subject to the renderer CSP) and return its bytes + content type. */
async function fetchImage(url: string): Promise<{ mime: string; data: Buffer }> {
  const res = await net.fetch(url)
  if (!res.ok) throw new Error(`Image fetch failed (${res.status})`)
  const buf = Buffer.from(await res.arrayBuffer())
  const ct = res.headers.get('content-type')?.split(';')[0]?.trim()
  const m = ct && ct.startsWith('image/') ? ct : (mime.lookup(url) || 'image/jpeg') as string
  return { mime: m, data: buf }
}

/** Fetch a remote image and return it as a `data:` URL, without storing it. */
export async function imageUrlToDataUrl(url: string): Promise<string> {
  const { mime: m, data } = await fetchImage(url)
  return toDataUrl({ mime: m, data })
}

/** Download a remote image and store it as the artwork for (scope, key). */
export async function setArtFromUrl(scope: ArtScope, key: string, url: string): Promise<string> {
  const { mime: m, data } = await fetchImage(url)
  return storeArt(scope, key, m, data)
}

export function clearArt(scope: ArtScope, key: string): void {
  getDb().prepare('DELETE FROM local_art WHERE scope = ? AND art_key = ?').run(scope, normKey(key))
}
