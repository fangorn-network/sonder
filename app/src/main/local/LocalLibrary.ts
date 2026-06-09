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
import { AUDIO_EXTENSIONS, type LocalTrack } from './types'

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

/** The last folder the user picked, falling back to the OS music dir. */
export function getSavedDir(): string {
  try {
    const saved = JSON.parse(fs.readFileSync(settingsPath(), 'utf-8'))
    if (typeof saved.dir === 'string' && saved.dir) return saved.dir
  } catch {
    /* no saved dir yet */
  }
  return getDefaultMusicDir()
}

export function saveDir(dir: string): void {
  try {
    fs.writeFileSync(settingsPath(), JSON.stringify({ dir }))
  } catch (e) {
    console.warn('[local-music] could not persist dir:', e)
  }
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

/** Recursively scan `dir`, (re)build the serve registry, return playable tracks. */
export async function scan(dir: string): Promise<LocalTrack[]> {
  await startLocalFileServer()

  const files: string[] = []
  await walk(dir, files)
  files.sort((a, b) => a.localeCompare(b))

  registry.clear()
  return files.map((absPath) => {
    const id = fileId(absPath)
    const ext = path.extname(absPath).toLowerCase()
    const contentType = (mime.lookup(absPath) || 'application/octet-stream') as string
    registry.set(id, { path: absPath, contentType })
    const meta = deriveMeta(absPath)
    return {
      id,
      path: absPath,
      title: meta.title,
      artist: meta.artist,
      album: meta.album,
      ext,
      streamUrl: `http://127.0.0.1:${port}/${id}`,
    }
  })
}
