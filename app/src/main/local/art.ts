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
import type { ArtSaveItem, ArtSaveResult, ArtScope } from './types'

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

/** Read an image off disk as bytes + content type (async sibling of fetchImage). */
async function readImage(filePath: string): Promise<{ mime: string; data: Buffer }> {
  const data = await fs.promises.readFile(filePath)
  return { mime: (mime.lookup(filePath) || 'image/png') as string, data }
}

/** How many images a bulk save resolves at once. The remote downloads are the
 *  slow part, so this parallelizes them without flooding the network. */
const ART_SAVE_CONCURRENCY = 6

/**
 * Commit many staged artworks in one call. Bytes are resolved concurrently
 * (remote URLs downloaded, local files read), then every success is persisted in
 * a single SQLite transaction. Replaces the renderer awaiting one IPC + one
 * download/read per target. Failures are skipped; returns success/failure counts.
 */
export async function setArtMany(items: ArtSaveItem[]): Promise<ArtSaveResult> {
  interface Resolved { scope: ArtScope; key: string; mime: string; data: Buffer }
  const resolved: (Resolved | null)[] = new Array(items.length).fill(null)

  let next = 0
  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const i = next++
      const it = items[i]
      try {
        const img = it.source === 'remote' ? await fetchImage(it.src) : await readImage(it.src)
        resolved[i] = { scope: it.scope, key: it.key, mime: img.mime, data: img.data }
      } catch {
        /* skip — tallied as failed below */
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(ART_SAVE_CONCURRENCY, items.length) }, worker))

  const ok = resolved.filter((r): r is Resolved => r !== null)
  getDb().transaction((rows: Resolved[]) => {
    for (const r of rows) storeArt(r.scope, r.key, r.mime, r.data)
  })(ok)

  return { saved: ok.length, failed: items.length - ok.length }
}

export function clearArt(scope: ArtScope, key: string): void {
  getDb().prepare('DELETE FROM local_art WHERE scope = ? AND art_key = ?').run(scope, normKey(key))
}

// Album art keys are `artist` + NUL + `album` (see renderer lib/artKeys.ts). Built
// via fromCharCode so there's no raw NUL byte in this source file.
const ART_KEY_SEP = String.fromCharCode(0)

/**
 * Re-home stored artwork after an artist merge: move the artist photo and every
 * album cover keyed under an old artist spelling to the canonical artist. If the
 * canonical key already has art, the canonical wins (the old row is dropped). Old
 * spellings equal to the canonical (case-insensitively) are skipped. Album keys
 * are matched by their `<artist>NUL` prefix via substr — avoids escaping a NUL in
 * a LIKE pattern.
 */
export function renameArtistArt(oldNames: string[], canonical: string): void {
  const db = getDb()
  const canon = normKey(canonical)
  const has = db.prepare('SELECT 1 FROM local_art WHERE scope = ? AND art_key = ?')
  const del = db.prepare('DELETE FROM local_art WHERE scope = ? AND art_key = ?')
  const upd = db.prepare('UPDATE local_art SET art_key = ?, updated_at = ? WHERE scope = ? AND art_key = ?')
  const now = Date.now()
  for (const name of oldNames) {
    const old = normKey(name)
    if (!old || old === canon) continue

    // Artist photo.
    if (has.get('artist', canon)) del.run('artist', old)
    else upd.run(canon, now, 'artist', old)

    // Album covers prefixed with this artist (`<old>NUL…`).
    const prefix = old + ART_KEY_SEP
    const rows = db
      .prepare("SELECT art_key FROM local_art WHERE scope = 'album' AND substr(art_key, 1, ?) = ?")
      .all(prefix.length, prefix) as { art_key: string }[]
    for (const r of rows) {
      const newKey = canon + r.art_key.slice(old.length)
      if (has.get('album', newKey)) del.run('album', r.art_key)
      else upd.run(newKey, now, 'album', r.art_key)
    }
  }
}
