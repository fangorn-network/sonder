/**
 * main/local/LocalLibrary.ts
 *
 * Local-disk music: find the OS music folder, scan it for audio files, and serve
 * those files to the renderer over a localhost HTTP endpoint with Range support
 * (so <audio> seeking works). Mirrors the yt-dlp stream proxy in main/index.ts —
 * same proven Range handling, a separate port so the two never collide.
 *
 * Files are addressed by an opaque id (a hash of the absolute path) and only ids
 * present in `registry` are served, so the endpoint can't be used to read
 * arbitrary paths off disk.
 */

import { app } from 'electron'
import http from 'http'
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import mime from 'mime-types'
import {
  AUDIO_EXTENSIONS,
  type ImportMode, type ImportProgress, type ImportSummary, type LibraryRoots, type LocalTrack,
} from './types'
import { listMeta } from './catalog'

// ─── File server ────────────────────────────────────────────────────────────

let server: http.Server | null = null
let port = 0

/** id → on-disk file. Rebuilt on every scan; only these ids are ever served. */
const registry = new Map<string, { path: string; contentType: string }>()

export function startLocalFileServer(): Promise<void> {
  if (server) return Promise.resolve()
  return new Promise((resolve) => {
    server = http.createServer((req, res) => {
      const id = decodeURIComponent((req.url ?? '/').slice(1))
      const entry = registry.get(id)
      if (!entry) {
        res.writeHead(404)
        res.end()
        return
      }

      res.on('error', () => {})

      let fileSize: number
      try {
        fileSize = fs.statSync(entry.path).size
      } catch {
        res.writeHead(404)
        res.end()
        return
      }

      const range = req.headers.range
      let start = 0
      let end = fileSize - 1

      if (range) {
        const m = range.match(/bytes=(\d*)-(\d*)/)
        if (m) {
          start = m[1] ? parseInt(m[1], 10) : 0
          end = m[2] ? Math.min(parseInt(m[2], 10), fileSize - 1) : fileSize - 1
        }
      }

      res.writeHead(range ? 206 : 200, {
        'Content-Type': entry.contentType,
        'Accept-Ranges': 'bytes',
        'Content-Length': end - start + 1,
        'Cache-Control': 'no-store',
        ...(range ? { 'Content-Range': `bytes ${start}-${end}/${fileSize}` } : {}),
      })

      if (req.method === 'HEAD') {
        res.end()
        return
      }

      const stream = fs.createReadStream(entry.path, { start, end, highWaterMark: 256 * 1024 })
      stream.pipe(res)
      req.on('close', () => stream.destroy())
    })

    server.listen(0, '127.0.0.1', () => {
      port = (server!.address() as { port: number }).port
      console.log(`[local-music] file server :${port}`)
      resolve()
    })
  })
}

/** Resolve a served id back to its on-disk path. Only ids from the last scan
 *  resolve, so metadata/tag IPC can't be pointed at arbitrary files. */
export function pathForId(id: string): string | undefined {
  return registry.get(id)?.path
}

/** Every file from the last scan as { id, path } — used by the auto-organizer. */
export function listRegistry(): { id: string; path: string }[] {
  return [...registry.entries()].map(([id, e]) => ({ id, path: e.path }))
}

/**
 * Drop a track from the library. The on-disk file is permanently deleted ONLY
 * when it lives inside the primary library folder (a copy made by import); files
 * under a referenced-in-place root (the user's source folder/drive) are left
 * untouched so the source stays intact. Either way the id is removed from the
 * serve registry so it stops streaming immediately. Returns whether the file was
 * deleted (false when it was a referenced source we left alone, or already gone).
 *
 * Caller is responsible for clearing any stored metadata/tags (see ipc).
 */
export function dropTrack(id: string): { deletedFile: boolean } {
  const entry = registry.get(id)
  registry.delete(id)
  if (!entry) return { deletedFile: false }
  if (!isInside(entry.path, getSavedDir())) return { deletedFile: false }
  try {
    fs.rmSync(entry.path)
    return { deletedFile: true }
  } catch (e) {
    console.warn('[local-music] could not delete file:', entry.path, e)
    return { deletedFile: false }
  }
}

// ─── Music directory (default + persisted override) ───────────────────────────

/** OS-standard music location: ~/Music, %USERPROFILE%\Music, etc. */
export function getDefaultMusicDir(): string {
  try {
    return app.getPath('music')
  } catch {
    return app.getPath('home')
  }
}

function settingsPath(): string {
  return path.join(app.getPath('userData'), 'local-music.json')
}

interface Settings {
  /** Primary library folder — where copy-imports land and "Change folder" sets. */
  dir: string
  /** Referenced-in-place folders (e.g. an external drive) scanned alongside dir. */
  extraRoots: string[]
}

function readSettings(): Settings {
  try {
    const s = JSON.parse(fs.readFileSync(settingsPath(), 'utf-8'))
    const dir = typeof s.dir === 'string' && s.dir ? s.dir : getDefaultMusicDir()
    const extraRoots = Array.isArray(s.extraRoots)
      ? s.extraRoots.filter((x: unknown): x is string => typeof x === 'string' && !!x)
      : []
    return { dir, extraRoots }
  } catch {
    return { dir: getDefaultMusicDir(), extraRoots: [] }
  }
}

function writeSettings(s: Settings): void {
  try {
    fs.writeFileSync(settingsPath(), JSON.stringify(s))
  } catch (e) {
    console.warn('[local-music] could not persist settings:', e)
  }
}

/** True when `child` is `parent` or nested inside it (path-wise). */
function isInside(child: string, parent: string): boolean {
  const rel = path.relative(path.resolve(parent), path.resolve(child))
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))
}

/** The primary library folder, falling back to the OS music dir. */
export function getSavedDir(): string {
  return readSettings().dir
}

/** Persist the primary library folder, keeping any referenced roots. */
export function saveDir(dir: string): void {
  const s = readSettings()
  s.dir = dir
  writeSettings(s)
}

/** Primary + referenced folders, for the renderer to display/manage. */
export function getRoots(): LibraryRoots {
  const s = readSettings()
  return { primary: s.dir, extra: s.extraRoots }
}

/** Every folder to scan (primary first), de-duped by resolved path. */
function getAllRoots(): string[] {
  const s = readSettings()
  const seen = new Set<string>()
  const out: string[] = []
  for (const r of [s.dir, ...s.extraRoots]) {
    const n = path.resolve(r)
    if (!seen.has(n)) { seen.add(n); out.push(r) }
  }
  return out
}

/** Add a referenced-in-place root. Returns false (no-op) if it overlaps the
 *  primary folder or an existing root, so the same tree isn't scanned twice. */
export function addExtraRoot(p: string): boolean {
  const s = readSettings()
  if (isInside(p, s.dir) || isInside(s.dir, p)) return false
  for (const r of s.extraRoots) {
    if (isInside(p, r) || isInside(r, p)) return false
  }
  s.extraRoots.push(p)
  writeSettings(s)
  return true
}

/** Drop a referenced-in-place root (its tracks stop appearing on next scan;
 *  their stored metadata rows are left intact). */
export function removeExtraRoot(p: string): void {
  const s = readSettings()
  const target = path.resolve(p)
  s.extraRoots = s.extraRoots.filter((r) => path.resolve(r) !== target)
  writeSettings(s)
}

// ─── Scan ──────────────────────────────────────────────────────────────────

function fileId(absPath: string): string {
  return crypto.createHash('sha1').update(absPath).digest('hex').slice(0, 16)
}

/**
 * Best-effort metadata from path alone — no tag-parsing dependency. Strips a
 * leading track number ("01 ", "01 - ", "01. ") and reads "Artist - Title" when
 * present; album falls back to the containing folder name.
 */
function deriveMeta(absPath: string): { title: string; artist: string | null; album: string | null } {
  const base = path.basename(absPath, path.extname(absPath))
  const album = path.basename(path.dirname(absPath)) || null
  const name = base.replace(/^\s*\d{1,3}\s*[-._)]?\s+/, '').trim() || base
  const dash = name.indexOf(' - ')
  if (dash > 0) {
    return { artist: name.slice(0, dash).trim(), title: name.slice(dash + 3).trim() || name, album }
  }
  return { artist: null, title: name, album }
}

async function walk(dir: string, out: string[], depth = 0): Promise<void> {
  if (depth > 8) return // guard against pathological / symlink-looped trees
  let entries: fs.Dirent[]
  try {
    entries = await fs.promises.readdir(dir, { withFileTypes: true })
  } catch {
    return // unreadable dir — skip silently
  }
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      await walk(full, out, depth + 1)
    } else if (entry.isFile() && AUDIO_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      out.push(full)
    }
  }
}

/**
 * Scan the library and (re)build the serve registry. With no `target`, scans
 * every root (primary + referenced); with a `target`, first makes it the primary
 * folder ("Change folder") and then scans. Returns the union of playable tracks,
 * de-duped by path (a file reachable from two roots appears once).
 */
export async function scan(target?: string): Promise<LocalTrack[]> {
  await startLocalFileServer()
  if (target) saveDir(target)

  const files: string[] = []
  for (const root of getAllRoots()) await walk(root, files)
  const seen = new Set<string>()
  const unique = files.filter((f) => {
    const n = path.resolve(f)
    return seen.has(n) ? false : (seen.add(n), true)
  })
  unique.sort((a, b) => a.localeCompare(b))

  // Stored metadata, loaded once and merged in below. A track with a row is
  // "labeled" (its stored title/artist/album override the filename guess) and
  // carries the extra schema fields; everything else is Unlabeled.
  const stored = listMeta()

  registry.clear()
  return unique.map((absPath) => {
    const id = fileId(absPath)
    const ext = path.extname(absPath).toLowerCase()
    const contentType = (mime.lookup(absPath) || 'application/octet-stream') as string
    registry.set(id, { path: absPath, contentType })
    const streamUrl = `http://127.0.0.1:${port}/${id}`

    const meta = stored.get(id)
    if (meta) {
      return {
        id, path: absPath, ext, streamUrl,
        title: meta.title,
        artist: meta.byArtist,
        album: meta.albumName,
        labeled: true,
        trackId: meta.trackId,
        isrcCode: meta.isrcCode,
        datePublished: meta.datePublished,
        durationMs: meta.durationMs,
        contributors: meta.contributors,
      }
    }

    const derived = deriveMeta(absPath)
    return {
      id, path: absPath, ext, streamUrl,
      title: derived.title,
      artist: derived.artist,
      album: derived.album,
      labeled: false,
    }
  })
}

// ─── Import ──────────────────────────────────────────────────────────────────

/** Count the audio files under `dir` (for the import dialog's preview). */
export async function countAudioFiles(dir: string): Promise<number> {
  const files: string[] = []
  await walk(dir, files)
  return files.length
}

/**
 * Bulk-import a folder (e.g. an external drive) into the library.
 *
 *  - 'reference' — add `source` as a referenced-in-place root (no copying).
 *  - 'copy'      — copy every audio file into `<primary>/<source basename>`,
 *                  preserving the subfolder structure (so the bulk labeler still
 *                  groups by folder) and skipping files already at the target.
 *
 * Either way the next scan surfaces the new tracks as Unlabeled. `onProgress`
 * fires per file for copy imports.
 */
export async function importFolder(
  source: string,
  mode: ImportMode,
  onProgress?: (p: ImportProgress) => void,
): Promise<ImportSummary> {
  const src = path.resolve(source)

  if (mode === 'reference') {
    const referenced = addExtraRoot(source)
    return { mode, source, total: 0, copied: 0, skipped: 0, failed: 0, referenced }
  }

  const dir = getSavedDir()
  if (isInside(src, dir) || isInside(dir, src)) {
    throw new Error('That folder overlaps your library folder — nothing to copy.')
  }

  const files: string[] = []
  await walk(src, files)
  const total = files.length
  const destRoot = path.join(dir, path.basename(src) || 'Imported')

  let copied = 0
  let skipped = 0
  let failed = 0
  for (const file of files) {
    const dest = path.join(destRoot, path.relative(src, file))
    try {
      let exists = false
      try { exists = fs.statSync(dest).isFile() } catch { /* not there yet */ }
      if (exists) {
        skipped++
      } else {
        await fs.promises.mkdir(path.dirname(dest), { recursive: true })
        await fs.promises.copyFile(file, dest)
        copied++
      }
    } catch (e) {
      console.warn('[local-music] import copy failed:', file, e)
      failed++
    }
    onProgress?.({ total, processed: copied + skipped + failed, file: path.basename(file) })
  }

  return { mode, source, dest: destRoot, total, copied, skipped, failed, referenced: false }
}
