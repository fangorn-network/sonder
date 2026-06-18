import { app, shell, BrowserWindow, ipcMain, net, session } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { spawn, execSync } from 'child_process'
import { Socket as NetSocket } from 'net'
import path from 'path'
import fs, { createWriteStream, createReadStream } from 'fs'
import http from 'http'
import zlib from 'zlib'
import crypto from 'crypto'
import { Transform } from 'stream'
import { pipeline } from 'stream/promises'
import mime from 'mime-types'
import dotenv from 'dotenv'
import { AgentProviderManager } from './agent/agent-provider-manager'
import { AgentBridge } from './agent/agent-bridge'
import { registerAgentIpcHandlers } from './agent/ipc-handlers'
import { DataContext } from '@fangorn-network/agent-types'
import { existsSync } from 'fs'
import { ToolboxConfigManager } from './agent/toolbox-config-manager'
import { registerSpotifyAuth, handleSpotifyCallback } from './spotify/SpotifyAuth'
import { registerPlaybackIpc } from './playback/ipc'
import { registerLocalMusicIpc } from './local/ipc'
import { installLogCapture, registerBugReportIpc } from './bug-report'
// import snapshotManifest from './snapshot-manifest.json'
import snapshotManifest from './small.json'

// ─── Stream cache ─────────────────────────────────────────────────────────────
interface StreamEntry {
  tmpPath: string
  contentType: string
  sourceQuery: string
}

const streamCache = new Map<string, StreamEntry>()

// ─── Stream proxy — serves complete files only ────────────────────────────────

let streamServer: http.Server | null = null
let streamPort = 0

function startYtStreamProxy() {
  streamServer = http.createServer((req, res) => {
    const videoId = req.url?.slice(1)
    if (!videoId) { res.writeHead(400); res.end(); return }

    const entry = streamCache.get(videoId)
    if (!entry) { res.writeHead(404); res.end(); return }

    res.on('error', () => { })

    let fileSize: number
    try { fileSize = fs.statSync(entry.tmpPath).size }
    catch { res.writeHead(503); res.end(); return }

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

    if (req.method === 'HEAD') { res.end(); return }

    const stream = fs.createReadStream(entry.tmpPath, {
      start,
      end,
      highWaterMark: 256 * 1024,
    })
    stream.pipe(res)
    req.on('close', () => stream.destroy())
  })

  streamServer.listen(0, '127.0.0.1', () => {
    streamPort = (streamServer!.address() as any).port
    console.log(`[yt-stream] :${streamPort}`)
  })
}

// ─── yt-dlp helpers ───────────────────────────────────────────────────────────

function getYtDlpBin(): string {
  const ext = process.platform === 'win32' ? '.exe' : ''
  const updatable = path.join(app.getPath('userData'), `yt-dlp${ext}`)
  if (fs.existsSync(updatable)) return updatable
  if (app.isPackaged) return path.join(process.resourcesPath, 'bin', `yt-dlp${ext}`)
  const dir = process.platform === 'win32' ? 'win' : process.platform === 'darwin' ? 'mac' : 'linux'
  return path.join(app.getAppPath(), 'resources', 'bin', dir, `yt-dlp${ext}`)
}

async function updateYtDlp(): Promise<void> {
  return new Promise((resolve) => {
    const ext = process.platform === 'win32' ? '.exe' : ''
    const updatable = path.join(app.getPath('userData'), `yt-dlp${ext}`)
    const bin = getYtDlpBin()

    if (!fs.existsSync(updatable)) {
      try { fs.copyFileSync(bin, updatable); if (process.platform !== 'win32') fs.chmodSync(updatable, 0o755) }
      catch { resolve(); return }
    }

    console.log('[yt-dlp] checking for updates...')
    const proc = spawn(updatable, ['--update-to', 'nightly'])
    proc.on('close', (code) => { console.log(`[yt-dlp] update exited ${code}`); resolve() })
    proc.on('error', () => resolve())
  })
}

export interface YtResolveResult {
  streamUrl: string
  videoId: string
  title: string
  artist: string
  thumbnail: string
  durationMs: number
}

// ─── resolveYt ────────────────────────────────────────────────────────────────

function resolveYt(query: string): Promise<YtResolveResult> {
  return new Promise((resolve, reject) => {
    const isBareId = /^[A-Za-z0-9_-]{11}$/.test(query)
    const isUrl = query.startsWith('http')
    const isYouTube =
      isBareId || (isUrl && (query.includes('youtube.com') || query.includes('youtu.be')))

    const target = (isBareId || isUrl) ? query : `ytsearch1:${query} music`

    const infoArgs = ['--dump-json', '--no-playlist', '--no-warnings', target]
    if (isYouTube) infoArgs.push('--extractor-args', 'youtube:player_client=tv_embedded')

    const infoProc = spawn(getYtDlpBin(), infoArgs)
    let out = '', err = ''
    infoProc.stdout.on('data', (d: Buffer) => { out += d.toString() })
    infoProc.stderr.on('data', (d: Buffer) => { err += d.toString() })
    infoProc.on('error', reject)

    infoProc.on('close', (code: number) => {
      if (code !== 0) {
        reject(new Error(`yt-dlp info exited ${code}: ${err.slice(0, 300)}`))
        return
      }

      try {
        const info = JSON.parse(out.trim().split('\n')[0])

        const result: YtResolveResult = {
          streamUrl: `http://127.0.0.1:${streamPort}/${info.id}`,
          videoId: info.id,
          title: info.title ?? 'Unknown Title',
          artist: info.uploader ?? info.channel ?? 'Unknown Artist',
          thumbnail: info.thumbnail ?? '',
          durationMs: Math.round((info.duration ?? 0) * 1000),
        }

        if (streamCache.has(info.id)) return resolve(result)

        const formats: any[] = (info.formats ?? [])
          .filter((f: any) => {
            if (!f.format_id) return false
            if (f.acodec === 'none') return false
            if (f.vcodec && f.vcodec !== 'none') return false
            if (f.protocol?.includes('m3u8')) return false
            if (f.protocol?.includes('dash')) return false
            return true
          })
          .sort((a: any, b: any) => {
            const aBr = a.abr ?? a.tbr ?? 0
            const bBr = b.abr ?? b.tbr ?? 0
            const aScore = (aBr >= 128 ? 10000 : aBr * 10) + (a.acodec?.startsWith('opus') ? 50 : 0)
            const bScore = (bBr >= 128 ? 10000 : bBr * 10) + (b.acodec?.startsWith('opus') ? 50 : 0)
            return bScore - aScore
          })

        const fmt = formats[0]
        if (!fmt?.format_id) throw new Error('No compatible audio format found')

        const ext = fmt.ext ?? 'm4a'
        const contentType = ext === 'webm' ? 'audio/webm'
          : ext === 'opus' ? 'audio/ogg'
            : 'audio/mp4'
        const sourceUrl = isUrl
          ? query
          : `https://www.youtube.com/watch?v=${info.id}`
        const tmpPath = path.join(app.getPath('userData'), `sond3r-${info.id}.${ext}`)

        if (fs.existsSync(tmpPath)) {
          const size = fs.statSync(tmpPath).size
          if (size > 32 * 1024) {
            streamCache.set(info.id, { tmpPath, contentType, sourceQuery: query })
            return resolve(result)
          }
          try { fs.unlinkSync(tmpPath) } catch { }
        }

        const dlArgs = [
          sourceUrl,
          '-f', fmt.format_id,
          '--no-playlist', '--no-warnings',
          '--no-part',
          '-o', tmpPath,
        ]
        if (isYouTube) dlArgs.push('--extractor-args', 'youtube:player_client=tv_embedded')

        console.log(`[yt:dl] starting: ${info.id} (${fmt.format_id} ${ext})`)
        const dlProc = spawn(getYtDlpBin(), dlArgs)
        dlProc.stderr.on('data', (d: Buffer) => console.error('[yt:dl]', d.toString().trimEnd()))
        dlProc.on('error', reject)
        dlProc.on('close', (code) => {
          if (code !== 0) {
            try { fs.unlinkSync(tmpPath) } catch { }
            reject(new Error(`yt-dlp download exited ${code}`))
            return
          }
          console.log(`[yt:dl] done: ${info.id}`)
          streamCache.set(info.id, { tmpPath, contentType, sourceQuery: query })
          resolve(result)
        })
      } catch (e: any) {
        reject(new Error(`resolve failed: ${e.message}`))
      }
    })
  })
}

// ─── Qdrant sidecar + query server ─────────────────────────────────────────────
// The catalog is built offline (embeddings.py) and published as a GZIPPED QDRANT
// SNAPSHOT pinned to IPFS. On first run the app downloads the .gz by CID,
// decompresses it to a .snapshot, recovers it into the local Qdrant sidecar, and
// caches the result in qdrant_storage. Every later run finds the collection
// already present and skips the network entirely. Nothing leaves the machine
// after the one-time fetch; both processes bind to localhost only.

let qdrantProc: ReturnType<typeof spawn> | null = null
let pyProcess: ReturnType<typeof spawn> | null = null
let rendererServer: http.Server | null = null
// Set once we're shutting down so the qdrant exit handler doesn't try to respawn
// a sidecar we just deliberately killed.
let quitting = false
let qdrantRetries = 0

if (app.isPackaged) {
  dotenv.config({ path: path.join(process.resourcesPath, '.env') })
} else {
  dotenv.config({ path: path.resolve(process.cwd(), '.env') })
}

const SNAPSHOT_GATEWAY = "https://green-reasonable-heron-957.mypinata.cloud/ipfs"
// (import.meta as any).env?.VITE_PINATA_GATEWAY ?? 'https://gateway.pinata.cloud/ipfs'

// For now a pinned constant. Later: read the latest sond3r.embeddings.snapshot
// record off Fangorn and return its checksum, so a new catalog ships without an
// app update. Keep this the single source of truth for the artifact identity.
//
// The .gz is too big for a single Pinata object (14 GB), so it was split into N
// parts with `pinata upload-split`, each part pinned separately. The reassembled
// .gz exceeds Pinata's limits too, so the MANIFEST listing the part CIDs is NOT
// pinned — it ships as a bundled local resource (`resources/snapshot.manifest.json`,
// rebuilt with `embeddings/src/rebuild-manifest.mjs`). downloadGz reads that local
// manifest, then streams each part back-to-back into one .gz (the runtime
// equivalent of `cat ...part* > ...gz`).
//
// `sha256` (of the DECOMPRESSED .snapshot) is the catalog's identity: it gates
// the snapshot marker and keys the query server's cache, so a new catalog = a new
// sha256. ('' skips verification while testing.)
async function resolveSnapshot(): Promise<{ sha256: string }> {
  return {
    sha256: '',
  }
}

// One entry from the `parts` array of a `pinata upload-split` manifest. Only
// `index` (ordering) and `cid` (where to fetch the bytes) are load-bearing here;
// `size` lets us report accurate aggregate download progress.
interface SnapshotPart {
  index: number
  name: string
  id: string
  cid: string
  size: number
}
interface SnapshotManifest {
  name: string
  total_size: number
  part_size: number
  parts: SnapshotPart[]
}

// Load and validate the committed split-upload manifest (the part-CID list).
// `snapshot-manifest.json` is checked into this repo next to this file and bundled
// into the build automatically, so the app ships with the CIDs and never needs a
// Pinata key at runtime — it fetches each part from the public gateway by CID.
// When a new catalog ships, regenerate this file from the part names with
// `node scripts/build-snapshot-manifest.mjs <name-prefix>` (needs PINATA_JWT).
// Returns the parts sorted into index order and sanity-checked for completeness,
// so a partial or reordered manifest fails loudly here rather than producing a
// corrupt .gz.
function loadManifest(): SnapshotPart[] {
  const manifest = snapshotManifest as SnapshotManifest
  const parts = [...(manifest.parts ?? [])].sort((a, b) => a.index - b.index)
  if (!parts.length) throw new Error('snapshot manifest has no parts')
  parts.forEach((p, i) => {
    if (p.index !== i) throw new Error(`snapshot manifest missing part ${i} (got index ${p.index})`)
    if (!p.cid) throw new Error(`snapshot manifest part ${i} has no cid`)
  })
  return parts
}

function qdrantBin(): string {
  const ext = process.platform === 'win32' ? '.exe' : ''
  if (app.isPackaged) return path.join(process.resourcesPath, 'qdrant', `qdrant${ext}`)
  const dir = process.platform === 'win32' ? 'win' : process.platform === 'darwin' ? 'mac' : 'linux'
  return path.join(app.getAppPath(), 'resources', 'qdrant', dir, `qdrant${ext}`)
}

// Localhost ports owned exclusively by our sidecars: Qdrant HTTP/gRPC and the
// Python query server. If one is busy at boot it's an orphan from a previous run
// that didn't exit cleanly (a crash, a SIGKILL, or a `yarn dev` restart that
// raced its own teardown). A busy 6333 makes a freshly-spawned Qdrant die
// instantly with "Address already in use", which wedges the whole boot.
const SIDECAR_PORTS = [6333, 6334, 8080]

const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

// Is anything accepting connections on this localhost port?
function probePortInUse(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const sock = new NetSocket()
    const finish = (inUse: boolean): void => { sock.destroy(); resolve(inUse) }
    sock.setTimeout(500)
    sock.once('connect', () => finish(true))
    sock.once('timeout', () => finish(false))
    sock.once('error', () => finish(false))   // ECONNREFUSED ⇒ free
    sock.connect(port, '127.0.0.1')
  })
}

// Kill whatever is listening on `port` (best-effort, cross-platform). Only ever
// used to reclaim our own orphaned sidecars at boot.
function killPort(port: number): void {
  try {
    if (process.platform === 'win32') {
      const out = execSync('netstat -ano -p tcp', { encoding: 'utf8' })
      const pids = new Set<string>()
      for (const line of out.split('\n')) {
        if (line.includes(`:${port} `) && /LISTENING/i.test(line)) {
          const pid = line.trim().split(/\s+/).pop()
          if (pid && pid !== '0') pids.add(pid)
        }
      }
      for (const pid of pids) { try { execSync(`taskkill /PID ${pid} /F /T`) } catch { /* gone */ } }
    } else {
      let pids: string[] = []
      try {
        pids = execSync(`lsof -ti tcp:${port}`, { encoding: 'utf8' }).split('\n').map((s) => s.trim()).filter(Boolean)
      } catch { /* lsof missing, or nothing on the port */ }
      if (pids.length) {
        for (const pid of pids) { try { process.kill(Number(pid), 'SIGKILL') } catch { /* gone */ } }
      } else {
        try { execSync(`fuser -k ${port}/tcp`) } catch { /* fuser missing, or nothing on the port */ }
      }
    }
  } catch { /* best effort — startQdrant's retry is the backstop */ }
}

// Pre-flight before spawning Qdrant: guarantee our sidecar ports are free. Give a
// still-tearing-down orphan a brief grace period to release the port on its own
// (the common restart-race case), then kill it, then wait for the OS to actually
// release the socket before we let Qdrant try to bind.
async function reclaimSidecarPorts(): Promise<void> {
  for (const port of SIDECAR_PORTS) {
    if (!(await probePortInUse(port))) continue
    console.warn(`[boot] port ${port} busy — a previous sidecar didn't exit cleanly`)
    for (let i = 0; i < 5 && (await probePortInUse(port)); i++) await delay(200)   // grace
    if (await probePortInUse(port)) {
      console.warn(`[boot] reclaiming port ${port}`)
      killPort(port)
    }
    for (let i = 0; i < 25 && (await probePortInUse(port)); i++) await delay(200)   // wait for release
    if (await probePortInUse(port)) console.error(`[boot] port ${port} still busy after reclaim — Qdrant may fail to start`)
  }
}

function startQdrant() {
  const storage = path.join(app.getPath('userData'), 'qdrant_storage')
  const snapshotsDir = path.join(app.getPath('userData'), 'qdrant_snapshots')
  fs.mkdirSync(storage, { recursive: true })
  fs.mkdirSync(snapshotsDir, { recursive: true })

  qdrantProc = spawn(qdrantBin(), [], {
    detached: process.platform !== 'win32',
    env: {
      ...process.env,
      QDRANT__STORAGE__STORAGE_PATH: storage,
      QDRANT__STORAGE__SNAPSHOTS_PATH: snapshotsDir,
      QDRANT__SERVICE__HTTP_PORT: '6333',
      QDRANT__SERVICE__GRPC_PORT: '6334',
      QDRANT__SERVICE__HOST: '127.0.0.1',   // localhost only, never exposed
      QDRANT__TELEMETRY_DISABLED: 'true',   // no phone-home; matches the ethos
    },
  })
  const spawnedAt = Date.now()
  qdrantProc.stdout?.on('data', (d) => console.log('[qdrant]', d.toString().trimEnd()))
  qdrantProc.stderr?.on('data', (d) => console.error('[qdrant]', d.toString().trimEnd()))
  qdrantProc.on('error', (err) => console.error('[qdrant] failed to start:', err))
  qdrantProc.on('exit', (code) => {
    console.log('[qdrant] exited with code', code)
    // Died almost immediately and we're not shutting down → something grabbed the
    // port between our pre-flight and bind (e.g. an orphan that outraced reclaim).
    // Reclaim and respawn a few times before letting the boot surface the failure.
    if (!quitting && code !== 0 && Date.now() - spawnedAt < 5000 && qdrantRetries < 3) {
      qdrantRetries++
      console.warn(`[qdrant] died on startup; reclaiming ports and retrying (${qdrantRetries}/3)`)
      void reclaimSidecarPorts().then(() => { if (!quitting) startQdrant() })
    }
  })
}

async function waitForReady(url: string, timeoutMs = 60000): Promise<void> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await net.fetch(url)
      if (r.ok) return
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 300))
  }
  throw new Error(`timed out waiting for ${url}`)
}

// Like waitForReady, but forwards the /ready 503 body to the splash so it can
// show real warmup progress (records scanned during the lexical build) instead
// of a blind spinner. Resolves when /ready flips to 200.
async function waitForWarmup(url: string, win: BrowserWindow, timeoutMs = 300000): Promise<void> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await net.fetch(url)
      if (r.ok) return
      if (r.status === 503) {
        const body = await r.json().catch(() => null)
        if (body && !win.isDestroyed()) {
          win.webContents.send('snapshot:warmup', {
            phase:   typeof body.phase === 'string' ? body.phase : null,
            pct:     typeof body.pct === 'number' ? body.pct : null,
            indexed: typeof body.indexed === 'number' ? body.indexed : 0,
            total:   typeof body.total === 'number' ? body.total : 0,
          })
        }
      }
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 300))
  }
  throw new Error(`timed out waiting for ${url}`)
}

// Download the gzipped snapshot from IPFS, streaming progress to the window.
// Reads the bundled split-upload manifest, then streams every part back-to-back
// into one .gz — the runtime equivalent of `cat ...part* > ...gz`. Aggregate
// progress is reported against the manifest's known total size, so the bar
// reflects the whole reassembled file rather than restarting per part.
async function downloadGz(dest: string, win: BrowserWindow): Promise<void> {
  const parts = loadManifest()
  const total = parts.reduce((sum, p) => sum + (p.size || 0), 0)

  const out = createWriteStream(dest)
  let received = 0

  try {
    for (const part of parts) {
      const res = await fetch(`${SNAPSHOT_GATEWAY}/${part.cid}`)   // global Node fetch
      if (!res.ok || !res.body) {
        throw new Error(`snapshot part ${part.index} download failed: ${res.status}`)
      }

      const reader = (res.body as any).getReader()
      for (; ;) {
        const { done, value } = await reader.read()
        if (done) break
        received += value.length
        // Respect stream backpressure so a fast gateway can't outrun the disk.
        if (!out.write(Buffer.from(value))) {
          await new Promise<void>((r) => out.once('drain', () => r()))
        }
        win.webContents.send('snapshot:progress', { received, total })
      }
    }
  } catch (e) {
    out.destroy()
    throw e
  }

  out.end()
  await new Promise<void>((r) => out.on('finish', () => r()))
}

// Decompress .gz → .snapshot, hashing the output so we can verify the artifact.
async function gunzipVerify(gzPath: string, outPath: string, sha256: string): Promise<void> {
  const hash = crypto.createHash('sha256')
  const tap = new Transform({
    transform(chunk: Buffer, _enc, cb) { hash.update(chunk); cb(null, chunk) },
  })
  await pipeline(createReadStream(gzPath), zlib.createGunzip(), tap, createWriteStream(outPath))
  if (sha256 && hash.digest('hex') !== sha256) {
    fs.unlinkSync(outPath)
    throw new Error('snapshot checksum mismatch after decompression')
  }
}

// Records which snapshot is currently recovered into qdrant_storage, so a later
// launch can tell "same snapshot" (reuse everything, including the query server's
// on-disk lexical-index cache → no re-warm) from "new snapshot" (wipe +
// re-download + re-warm). The identity is the decompressed snapshot's sha256.
// Lives in userData alongside qdrant_storage. (`cid` is read for backward compat
// with markers written before the manifest stopped being pinned.)
function snapshotMarkerPath(): string {
  return path.join(app.getPath('userData'), 'catalog-snapshot.json')
}
function readSnapshotMarker(): { sha256?: string; cid?: string } | null {
  try {
    const m = JSON.parse(fs.readFileSync(snapshotMarkerPath(), 'utf8'))
    return m && typeof m === 'object' ? m : null
  } catch {
    return null
  }
}
function writeSnapshotMarker(sha256: string): void {
  try {
    fs.writeFileSync(snapshotMarkerPath(), JSON.stringify({ sha256 }))
  } catch (e) {
    console.error('[snapshot] marker write failed:', e)
  }
}

// Ensure the catalog for `snapshot` is recovered. Unchanged snapshot → no-op (the
// query server reuses its cached lexical index, so warmup is near-instant). New
// snapshot → remove the stale collection first, then fetch + decompress + recover
// the new one and stamp the marker so the next launch knows it's current.
async function ensureCollection(win: BrowserWindow, snapshot: { sha256: string }): Promise<void> {
  const { sha256 } = snapshot
  const exists = await net.fetch('http://127.0.0.1:6333/collections/fangorn')
    .then((r) => r.ok).catch(() => false)
  const marker = readSnapshotMarker()
  // Old markers (pre-unpinned-manifest) keyed on cid and have no sha256; treat
  // such a collection as current rather than forcing a needless 14 GB re-fetch.
  const markedId = marker?.sha256

  // Already on this snapshot — or a pre-existing/legacy collection we adopt as
  // current. Either way nothing to fetch.
  if (exists && (!marker || !markedId || markedId === sha256)) {
    if (!markedId) writeSnapshotMarker(sha256)
    return
  }

  // A different snapshot is live → drop the old collection's data before pulling
  // the new one, so stale vectors don't linger in qdrant_storage.
  if (exists && markedId && markedId !== sha256) {
    console.log(`[snapshot] new catalog ${sha256} (was ${markedId}) — removing old collection`)
    await net.fetch('http://127.0.0.1:6333/collections/fangorn', { method: 'DELETE' })
      .catch((e) => console.error('[snapshot] failed to delete old collection:', e))
  }

  const userData = app.getPath('userData')
  const gzPath = path.join(userData, 'fangorn.snapshot.gz')

  // must live inside Qdrant's snapshots dir or recover 403s
  const snapDir = path.join(userData, 'qdrant_snapshots', 'fangorn')
  fs.mkdirSync(snapDir, { recursive: true })
  const snapPath = path.join(snapDir, 'fangorn.snapshot')

  win.webContents.send('snapshot:status', 'downloading')
  await downloadGz(gzPath, win)

  win.webContents.send('snapshot:status', 'decompressing')
  await gunzipVerify(gzPath, snapPath, sha256)
  try { fs.unlinkSync(gzPath) } catch { }

  win.webContents.send('snapshot:status', 'recovering')
  const res = await net.fetch('http://127.0.0.1:6333/collections/fangorn/snapshots/recover', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ location: `file://${snapPath}` }),
  })
  if (!res.ok) throw new Error(`recover failed: ${res.status} ${await res.text()}`)

  try { fs.unlinkSync(snapPath) } catch { }

  // Stamp only after a successful recover, so an interrupted upgrade retries.
  writeSnapshotMarker(sha256)
}

function startQueryServer() {
  const root = is.dev ? app.getAppPath() : process.resourcesPath
  const serverName = process.platform === 'win32' ? 'server.exe' : 'server'

  // Read-only: proxies Qdrant and embeds text queries with nomic. No schema args,
  // no chroma path, no checkpoint, no graph key — that all moved to the builder.
  // The vector dim is read from the recovered snapshot's collection (and query
  // embeddings are Matryoshka-truncated to match), so nothing is hardcoded here.
  // Text search is served by Qdrant full-text payload indexes (built on first
  // launch, persisted in qdrant_storage), so there's no lexical-index cache to key.
  const [bin, args, cwd]: [string, string[], string] = app.isPackaged
    ? [
      path.join(root, serverName),
      ['--collection', 'fangorn'],
      root,
    ]
    : [
      path.join(root, 'vectordb/venv/bin/python'),
      [
        path.join(root, 'vectordb/server.py'),
        '--collection', 'fangorn',
      ],
      path.join(root, 'vectordb'),
    ]

  pyProcess = spawn(bin, args, { cwd, detached: process.platform !== 'win32', env: { ...process.env } })

  pyProcess.stdout?.on('data', (d) => console.log('[py]', d.toString().trimEnd()))
  pyProcess.stderr?.on('data', (d) => console.error('[py]', d.toString().trimEnd()))
  pyProcess.on('error', (err) => console.error('[py] failed to start:', err))
  pyProcess.on('exit', (code) => console.log('[py] exited with code', code))

  const pyLog = createWriteStream(path.join(app.getPath('userData'), 'py-stderr.log'))
  pyProcess.stderr?.on('data', (d) => pyLog.write(d))
  pyProcess.stdout?.on('data', (d) => pyLog.write(d))
}

// ─── Local renderer server ────────────────────────────────────────────────────

function startRendererServer(): Promise<void> {
  return new Promise((resolve) => {
    const rendererPath = join(process.resourcesPath, 'renderer')

    rendererServer = http.createServer((req, res) => {
      let reqPath = req.url ?? '/'
      if (reqPath === '/') reqPath = '/index.html'
      const filePath = join(rendererPath, reqPath)

      fs.readFile(filePath, (err, data) => {
        if (err) {
          fs.readFile(join(rendererPath, 'index.html'), (fbErr, fb) => {
            if (fbErr) { res.writeHead(500); res.end('Internal server error'); return }
            res.writeHead(200, { 'Content-Type': 'text/html' })
            res.end(fb)
          })
          return
        }
        res.writeHead(200, { 'Content-Type': mime.lookup(filePath) || 'application/octet-stream' })
        res.end(data)
      })
    })

    rendererServer.listen(5173, '127.0.0.1', () => {
      console.log('[renderer] http://127.0.0.1:5173')
      resolve()
    })
  })
}

// ─── Browser window ───────────────────────────────────────────────────────────

// Native window-controls-overlay tint per theme. `color` is the overlay strip
// background (matches the header --bg1), `symbolColor` the min/max/close glyphs
// (matches --fg). Keep these in sync with the palettes in renderer App.css.
const TITLEBAR_OVERLAY = {
  light: { color: '#f0ece5', symbolColor: '#1a1714' },
  dark:  { color: '#1b1714', symbolColor: '#f0ece5' },
} as const

function createWindow(): BrowserWindow {
  const mainWindow = new BrowserWindow({
    width: 1200, height: 800,
    fullscreen: false, fullscreenable: true,
    show: false, darkTheme: true, movable: true, resizable: true,
    title: 'SOND3R', frame: false, titleBarStyle: 'hidden',
    // Native window-controls overlay tinted to match the light editorial header
    // (App.tsx BG1 background / FG symbols) so min/max/close read as part of the
    // app instead of black boxes. Height matches the 40px header.
    titleBarOverlay: { ...TITLEBAR_OVERLAY.light, height: 40 },
    backgroundColor: '#1a1a1a', autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true, sandbox: false,
      nodeIntegration: false, webSecurity: true,
      partition: 'persist:main', webviewTag: true,
    },
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
    // Auto-open DevTools in development only (`yarn dev`); never in packaged
    // builds. Docked (not detached) — detached can silently no-op on Linux.
    if (is.dev) mainWindow.webContents.openDevTools()
  })
  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadURL('http://127.0.0.1:5173')
  }

  return mainWindow
}

// ─── IPC handlers ─────────────────────────────────────────────────────────────

function registerIpcHandlers() {
  // Escape hatch for a wedged client-side auth state (e.g. the Privy user was
  // deleted server-side but this device still holds their session, blocking a
  // clean re-login). Wipes all storage — cookies, localStorage, IndexedDB,
  // cache — for the renderer's `persist:main` partition, then reloads. The
  // account + embedded wallet live server-side and are restored on next login.
  ipcMain.handle('session:reset', async (event) => {
    await session.fromPartition('persist:main').clearStorageData()
    BrowserWindow.fromWebContents(event.sender)?.webContents.reload()
    return { success: true }
  })

  // Re-tint the native window-controls overlay (min/max/close) to match the
  // active light/dark theme. Windows/Linux only — macOS draws traffic lights
  // the OS themes itself, and calling setTitleBarOverlay there throws.
  ipcMain.handle('window:set-theme', (event, theme: 'light' | 'dark') => {
    if (process.platform === 'darwin') return
    const overlay = TITLEBAR_OVERLAY[theme] ?? TITLEBAR_OVERLAY.light
    try {
      BrowserWindow.fromWebContents(event.sender)?.setTitleBarOverlay({ ...overlay, height: 40 })
    } catch (e) {
      console.warn('[main] setTitleBarOverlay failed:', e)
    }
  })

  ipcMain.handle('shell:open-external', (_event, url: string) => {
    if (typeof url === 'string' && (url.startsWith('https://') || url.startsWith('http://'))) {
      shell.openExternal(url)
    }
  })

  ipcMain.handle('fetch:proxy', async (_event, { url, options }) => {
    const res = await net.fetch(url, options ?? {})
    return { status: res.status, body: await res.text() }
  })

  ipcMain.handle('deezer:api', async (_event, { url }) => {
    const res = await fetch(url, { headers: { 'Accept': 'application/json' } })
    return { status: res.status, body: await res.text() }
  })

  ipcMain.handle('spotify:api', async (_event, { url, method, token, body }) => {
    const res = await fetch(url, {
      method: method ?? 'GET',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })
    console.log('[spotify]', method ?? 'GET', url, res.status)
    return { status: res.status, body: await res.text(), retryAfter: res.headers.get('retry-after') }
  })

  ipcMain.handle('rpc:arbitrum', async (_event, { method, params }) => {
    const body = JSON.stringify(
      { jsonrpc: '2.0', id: 1, method, params },
      (_, v) => (typeof v === 'bigint' ? '0x' + v.toString(16) : v)
    )
    const rpcUrl = (import.meta as any).env.VITE_ARBITRUM_SEPOLIA_RPC_URL
    const res = await net.fetch(rpcUrl, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body,
    })
    const text = await res.text()
    console.log('[rpc]', method, res.status, text.slice(0, 200))
    return text
  })

  ipcMain.handle('yt:resolve', async (_event, query: string): Promise<YtResolveResult> => {
    return resolveYt(query)
  })

  ipcMain.handle('yt:prefetch', async (_event, query: string) => {
    try { await resolveYt(query) } catch { /* non-fatal */ }
  })

  ipcMain.handle('yt:search:music', async (_event, query: string): Promise<any[]> => {
    return new Promise((resolve) => {
      const proc = spawn(getYtDlpBin(), [
        `ytsearch15:${query}`,
        '--dump-json', '--no-playlist', '--no-warnings', '--flat-playlist',
      ])
      let out = ''
      proc.stdout.on('data', (d: Buffer) => { out += d.toString() })
      proc.stderr.on('data', (d: Buffer) => { console.error('[yt:search:music]', d.toString().trim()) })
      proc.on('error', () => resolve([]))
      proc.on('close', (code) => {
        if (code !== 0) { resolve([]); return }
        const results = out.trim().split('\n')
          .filter(Boolean)
          .map(line => { try { return JSON.parse(line) } catch { return null } })
          .filter(Boolean)
        resolve(results)
      })
    })
  })

  ipcMain.handle('yt:search:sc', async (_event, query: string): Promise<any[]> => {
    return new Promise((resolve) => {
      const proc = spawn(getYtDlpBin(), [
        `scsearch30:${query}`,
        '--dump-json', '--no-playlist', '--no-warnings', '--flat-playlist',
      ])
      let out = ''
      proc.stdout.on('data', (d: Buffer) => { out += d.toString() })
      proc.on('error', () => resolve([]))
      proc.on('close', (code) => {
        if (code !== 0) { resolve([]); return }
        const results = out.trim().split('\n')
          .filter(Boolean)
          .map(line => { try { return JSON.parse(line) } catch { return null } })
          .filter(Boolean)
        resolve(results)
      })
    })
  })

  ipcMain.handle('backend:is-ready', async () => {
    return net.fetch('http://127.0.0.1:8080/ready').then(r => r.ok).catch(() => false)
  })

  registerBugReportIpc()   // bug:submit / bug:diagnostics (in-app problem reporter)
}

// ─── Arbitrum RPC proxy ───────────────────────────────────────────────────────

const rpcProxy = http.createServer(async (req, res) => {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(chunk)
  const body = Buffer.concat(chunks).toString()
  const result = await net.fetch('https://sepolia-rollup.arbitrum.io/rpc', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body,
  })
  res.writeHead(200, { 'Content-Type': 'application/json' })
  res.end(await result.text())
})

rpcProxy.listen(8545, '127.0.0.1', () => {
  console.log('[rpc-proxy] http://127.0.0.1:8545')
})

// ─── Agent bootstrap ──────────────────────────────────────────────────────────

const providerManager = new AgentProviderManager()
const toolboxConfigManager = new ToolboxConfigManager()

function getToolboxDir(): string {
  const bundled = path.join(process.resourcesPath, 'toolboxes')
  if (existsSync(bundled)) return bundled
  return path.join(app.getAppPath(), 'node_modules', '@fangorn-network', 'agent-tools', 'build', 'toolboxes')
}

const dataContextProvider = (): DataContext => ({} as DataContext)
const bridge = new AgentBridge(providerManager, toolboxConfigManager, getToolboxDir(), dataContextProvider)

async function bootstrap() {
  const existingConfig = await providerManager.loadConfig()
  const toolboxDir = getToolboxDir()

  toolboxConfigManager.discoverRegistry(toolboxDir)
  await toolboxConfigManager.load()
  registerAgentIpcHandlers(providerManager, bridge, toolboxConfigManager)

  if (existingConfig) {
    const status = await providerManager.initialise()
    console.log('[agent] Provider status:', status)
    console.log('[agent] Toolbox dir:', toolboxDir)

    if (status.ready && existingConfig.provider !== 'none') {
      try {
        await bridge.initialise()
        console.log('[agent] Agent bridge initialised successfully.')
      } catch (err) {
        console.error('[agent] Agent bridge failed to initialise:', err)
      }
    }
  } else {
    console.log('[agent] No provider configured — setup wizard will appear.')
  }
}

// ─── Dev sandbox (Linux) ─────────────────────────────────────────────────────
// In dev we run unsandboxed so onboarding needs no root `chown/chmod 4755` on
// node_modules/electron/dist/chrome-sandbox. Packaged builds keep the sandbox.
if (is.dev && process.platform === 'linux') {
  app.commandLine.appendSwitch('no-sandbox')
}

// ─── GPU acceleration (WSL2 / Linux) ─────────────────────────────────────────
if (process.platform === 'linux' && process.env.SOND3R_DISABLE_GPU !== '1') {
  app.commandLine.appendSwitch('ignore-gpu-blocklist')
  app.commandLine.appendSwitch('enable-gpu-rasterization')
  app.commandLine.appendSwitch('enable-zero-copy')
  if (process.env.SOND3R_GPU_ANGLE === '1') {
    app.commandLine.appendSwitch('use-gl', 'angle')
    app.commandLine.appendSwitch('use-angle', 'gl')
  }
}

// ─── Protocol + single-instance lock (must be before whenReady) ──────────────

if (!app.isDefaultProtocolClient('sond3r')) {
  app.setAsDefaultProtocolClient('sond3r')
}

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
}

// ─── App lifecycle ────────────────────────────────────────────────────────────
// Order matters: the WINDOW comes up first so the first-run download has a UI to
// report into. The data backend (Qdrant + snapshot fetch + query server) is
// brought up afterwards, behind a boot screen the renderer renders.

app.whenReady().then(async () => {
  installLogCapture()   // tee console output into the bug-report ring buffer first
  electronApp.setAppUserModelId('com.electron')

  // Reclaim any sidecar ports an unclean previous exit left orphaned, so the new
  // Qdrant doesn't die on "Address already in use" and wedge the boot.
  await reclaimSidecarPorts()
  startQdrant()
  startYtStreamProxy()
  updateYtDlp()

  if (!is.dev) await startRendererServer()

  // ── Session setup — must happen before createWindow ──────────────────────
  const targetSession = session.fromPartition('persist:main')

  targetSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    const allowed = ['media', 'notifications', 'clipboard-read', 'clipboard-sanitized-write']
    callback(allowed.includes(permission))
  })

  targetSession.webRequest.onBeforeRequest(
    { urls: ['http://127.0.0.1:8080/*', 'http://0.0.0.0:8080/*'] },
    (details, callback) => { callback({}) }
  )

  const ytFilter = { urls: ['https://*.youtube.com/*', 'https://*.youtube-nocookie.com/*'] }
  targetSession.webRequest.onBeforeSendHeaders(ytFilter, (details, callback) => {
    details.requestHeaders['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    details.requestHeaders['Cookie'] = 'PREF=f4=4000000&f6=40000000&volume=100;'
    callback({ requestHeaders: details.requestHeaders })
  })

  app.on('browser-window-created', (_, window) => optimizer.watchWindowShortcuts(window))

  registerIpcHandlers()
  await bootstrap()

  const mainWindow = createWindow()

  registerSpotifyAuth(mainWindow)   // spotify-auth:* IPC handlers (PKCE OAuth)
  registerPlaybackIpc()             // playback:* IPC handlers (source-agnostic; Spotify default)
  registerLocalMusicIpc()           // local:* IPC handlers (on-disk music + localhost file server)

  // Wait until the renderer is mounted so it can actually receive boot events.
  await new Promise<void>((r) => mainWindow.webContents.once('did-finish-load', () => r()))

  // Backend comes up behind the window: Qdrant ready → collection present
  // (download + decompress + recover on first run, skip if cached) → query server.
  try {
    const snapshot = await resolveSnapshot()
    // Generous timeout: on a cold start Qdrant mmaps a large (10M-point) collection
    // and rebuilds any payload indexes baked into the config before it serves
    // /readyz — that can take a couple of minutes. The default 60s aborts the boot
    // mid-rebuild (and a stale full-text index makes this much worse until the query
    // server's startup drops it).
    await waitForReady('http://127.0.0.1:6333/readyz', 300000)
    await ensureCollection(mainWindow, snapshot)
    startQueryServer()
    await waitForReady('http://127.0.0.1:8080/health')
    // Hold the splash through warmup. /health is up as soon as the server binds,
    // but its lexical index + embedding model + vector index aren't hot yet —
    // /ready flips to 200 only when warmup finishes. Gating here means the user
    // can't reach the search box until the very first query is fast, which is
    // the whole point of a local-first search. Generous timeout: building the
    // 860k-record lexical index can take a bit on a cold disk.
    mainWindow.webContents.send('snapshot:status', 'warming')
    await waitForWarmup('http://127.0.0.1:8080/ready', mainWindow, 300000)
    console.log('[boot] data backend ready')
    mainWindow.webContents.send('backend:ready')
  } catch (err) {
    console.error('[boot] backend failed to come up:', err)
    mainWindow.webContents.send('backend:error', String(err))
  }

  app.on('second-instance', (_e, argv) => {
    const url = argv.find((a: string) => a.startsWith('sond3r://'))
    if (url) handleSpotifyCallback(url)
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// macOS: protocol URI arrives via open-url on the existing instance
app.on('open-url', (_e, url) => handleSpotifyCallback(url))

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// Tear down the sidecars (Qdrant + Python query server). Both are spawned
// `detached` on POSIX so each leads its own process group — killing the
// negative PID takes the whole group (and any grandchildren) with it. SIGKILL
// can't be trapped, so a busy or mid-graceful-shutdown uvicorn can't linger and
// keep pegging the CPU. Idempotent: the nulled refs make repeat calls
// (before-quit → exit) no-ops. /T on Windows takes the child's tree instead.
function killSidecars(): void {
  for (const proc of [pyProcess, qdrantProc]) {
    if (!proc || proc.pid == null || proc.killed) continue
    try {
      if (process.platform === 'win32') {
        spawn('taskkill', ['/PID', String(proc.pid), '/F', '/T'])
      } else {
        process.kill(-proc.pid, 'SIGKILL')
      }
    } catch {
      try { proc.kill('SIGKILL') } catch { /* already gone */ }
    }
  }
  pyProcess = null
  qdrantProc = null
}

app.on('before-quit', async () => {
  quitting = true
  killSidecars()
  if (rendererServer) {
    await new Promise<void>((resolve) => rendererServer?.close(() => resolve()))
  }
  await providerManager.shutdown()
})

// `before-quit` doesn't fire on every exit path: when `electron-vite dev`
// restarts the main process on a file change — or you Ctrl-C the dev server —
// Electron receives a raw signal instead. Without these, each restart orphans
// the previous Qdrant + Python pair, which keep running and pile up until they
// saturate the CPU. `exit` is the last-ditch synchronous safety net.
process.on('exit', killSidecars)
process.on('SIGINT', () => { quitting = true; killSidecars(); process.exit(0) })
process.on('SIGTERM', () => { quitting = true; killSidecars(); process.exit(0) })