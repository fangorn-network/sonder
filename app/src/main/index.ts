import { app, shell, BrowserWindow, ipcMain, net, session } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { spawn } from 'child_process'
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
  const dir = process.platform === 'win32' ? 'win' : 'linux'
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

if (app.isPackaged) {
  dotenv.config({ path: path.join(process.resourcesPath, '.env') })
} else {
  dotenv.config({ path: path.resolve(process.cwd(), '.env') })
}

const SNAPSHOT_GATEWAY = "https://green-reasonable-heron-957.mypinata.cloud/ipfs"
// (import.meta as any).env?.VITE_PINATA_GATEWAY ?? 'https://gateway.pinata.cloud/ipfs'

// For now a pinned constant. Later: read the latest sond3r.embeddings.snapshot
// record off Fangorn and return its cid + checksum, so a new catalog ships
// without an app update. Keep this the single source of truth for the artifact.
async function resolveSnapshot(): Promise<{ cid: string; sha256: string }> {
  return {
    cid: 'bafybeih6bj6iakbm5nodxriddi4q7xhiw77ok53d67q7omkuvrvi7ta3mm',
    // sha256 of the DECOMPRESSED .snapshot ('' skips verification while testing)
    sha256: '99ebbd07cc80fb4cb755ad8c250ee99d0ec5ae59efe6460741cdc95053df9691',
  }
}

function qdrantBin(): string {
  const ext = process.platform === 'win32' ? '.exe' : ''
  return app.isPackaged
    ? path.join(process.resourcesPath, 'qdrant', `qdrant${ext}`)
    : path.join(app.getAppPath(), 'resources', 'qdrant', `qdrant${ext}`)
}

function startQdrant() {
  const storage = path.join(app.getPath('userData'), 'qdrant_storage')
  const snapshotsDir = path.join(app.getPath('userData'), 'qdrant_snapshots')
  fs.mkdirSync(storage, { recursive: true })
  fs.mkdirSync(snapshotsDir, { recursive: true })

  qdrantProc = spawn(qdrantBin(), [], {
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
  qdrantProc.stdout?.on('data', (d) => console.log('[qdrant]', d.toString().trimEnd()))
  qdrantProc.stderr?.on('data', (d) => console.error('[qdrant]', d.toString().trimEnd()))
  qdrantProc.on('error', (err) => console.error('[qdrant] failed to start:', err))
  qdrantProc.on('exit', (code) => console.log('[qdrant] exited with code', code))
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

// Download the gzipped snapshot from IPFS, streaming progress to the window.
async function downloadGz(cid: string, dest: string, win: BrowserWindow): Promise<void> {
  const res = await fetch(`${SNAPSHOT_GATEWAY}/${cid}`)   // global Node fetch
  if (!res.ok || !res.body) throw new Error(`snapshot download failed: ${res.status}`)

  const total = Number(res.headers.get('content-length')) || 0
  const out = createWriteStream(dest)
  let received = 0

  const reader = (res.body as any).getReader()
  for (; ;) {
    const { done, value } = await reader.read()
    if (done) break
    received += value.length
    out.write(Buffer.from(value))
    win.webContents.send('snapshot:progress', { received, total })
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

// First run: fetch + decompress + recover. Later runs: collection exists → skip.
async function ensureCollection(win: BrowserWindow): Promise<void> {
  const exists = await net.fetch('http://127.0.0.1:6333/collections/fangorn')
    .then((r) => r.ok).catch(() => false)
  if (exists) return

  const { cid, sha256 } = await resolveSnapshot()
  const userData = app.getPath('userData')
  const gzPath = path.join(userData, 'fangorn.snapshot.gz')

  // must live inside Qdrant's snapshots dir or recover 403s
  const snapDir = path.join(userData, 'qdrant_snapshots', 'fangorn')
  fs.mkdirSync(snapDir, { recursive: true })
  const snapPath = path.join(snapDir, 'fangorn.snapshot')

  win.webContents.send('snapshot:status', 'downloading')
  await downloadGz(cid, gzPath, win)

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
}

function startQueryServer() {
  const root = is.dev ? app.getAppPath() : process.resourcesPath
  const serverName = process.platform === 'win32' ? 'server.exe' : 'server'

  // Read-only: proxies Qdrant and embeds text queries with nomic. No schema args,
  // no chroma path, no checkpoint, no graph key — that all moved to the builder.
  const [bin, args, cwd]: [string, string[], string] = app.isPackaged
    ? [
      path.join(root, serverName),
      ['--collection', 'fangorn', '--dim', '256'],
      root,
    ]
    : [
      path.join(root, 'vectordb/venv/bin/python'),
      [
        path.join(root, 'vectordb/server.py'),
        '--collection', 'fangorn',
        '--dim', '256',
      ],
      path.join(root, 'vectordb'),
    ]

  pyProcess = spawn(bin, args, { cwd, env: { ...process.env } })

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

function createWindow(): BrowserWindow {
  const mainWindow = new BrowserWindow({
    width: 1200, height: 800,
    fullscreen: false, fullscreenable: true,
    show: false, darkTheme: true, movable: true, resizable: true,
    title: 'SOND3R', frame: false, titleBarStyle: 'hidden',
    titleBarOverlay: { color: 'black', symbolColor: '#ffffff', height: 40 },
    backgroundColor: '#1a1a1a', autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true, sandbox: false,
      nodeIntegration: false, webSecurity: true,
      partition: 'persist:main', webviewTag: true,
    },
  })

  mainWindow.webContents.openDevTools({ mode: 'detach' })
  mainWindow.on('ready-to-show', () => mainWindow.show())
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
    return net.fetch('http://127.0.0.1:8080/health').then(r => r.ok).catch(() => false)
  })
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
  electronApp.setAppUserModelId('com.electron')

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

  // Wait until the renderer is mounted so it can actually receive boot events.
  await new Promise<void>((r) => mainWindow.webContents.once('did-finish-load', () => r()))

  // Backend comes up behind the window: Qdrant ready → collection present
  // (download + decompress + recover on first run, skip if cached) → query server.
  try {
    await waitForReady('http://127.0.0.1:6333/readyz')
    await ensureCollection(mainWindow)
    startQueryServer()
    await waitForReady('http://127.0.0.1:8080/health')
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

app.on('before-quit', async () => {
  // Kill both child processes; /T on Windows takes their trees with them.
  for (const proc of [pyProcess, qdrantProc]) {
    if (proc && !proc.killed) {
      if (process.platform === 'win32') {
        spawn('taskkill', ['/PID', String(proc.pid), '/F', '/T'])
      } else {
        proc.kill()
      }
    }
  }
  if (rendererServer) {
    await new Promise<void>((resolve) => rendererServer?.close(() => resolve()))
  }
  await providerManager.shutdown()
})