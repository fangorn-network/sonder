import { app, shell, BrowserWindow, ipcMain, net, session } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { spawn } from 'child_process'
import path from 'path'
import fs, { createWriteStream } from 'fs'
import http from 'http'
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

// ─── Python backend ───────────────────────────────────────────────────────────

let pyProcess: ReturnType<typeof spawn> | null = null
let rendererServer: http.Server | null = null

if (app.isPackaged) {
  dotenv.config({ path: path.join(process.resourcesPath, '.env') })
} else {
  dotenv.config({ path: path.resolve(process.cwd(), '.env') })
}

function startPython() {
  const root = is.dev ? app.getAppPath() : process.resourcesPath

  const serverName = process.platform === 'win32' ? 'server.exe' : 'server'

  const apiKey = (import.meta as any).env.VITE_GRAPH_API_KEY ?? "";
  const userDataPath = app.getPath('userData')
  const [bin, args, cwd]: [string, string[], string] = app.isPackaged
    ? [
      path.join(root, serverName),
      [
        '--graph-api-key', apiKey,
        '--chroma-path', path.join(userDataPath, 'chroma_db'),
        '--checkpoint-file', path.join(userDataPath, 'ingest_checkpoint.json'),
        '-s', 'test.sond3r.track.invariants.2=0xe3c81df02f63c4e1a39d7e451de1826da385b146152d516cc4951da49c779527',
        '-s', 'test.sond3r.track.taxonomy.1=0xccf6667bef466ee1aafe8a4dbc62f8c174a00fdefb5f99416d97a3f1b8d132f0',
        '--primary', 'test.sond3r.track.invariants.2',
      ],
      root,
    ]
    : [
      path.join(root, 'vectordb/venv/bin/python'),
      [
        path.join(root, 'vectordb/server.py'),
        '--graph-api-key', apiKey,
        '--chroma-path', path.join(root, 'vectordb/db/sond3r'),
        // 👇 FIX: Point this directly to the db directory where it actually lives!
        '--checkpoint-file', path.join(root, 'vectordb/db/ingest_checkpoint.json'),
        '-s', 'test.sond3r.track.invariants.2=0xe3c81df02f63c4e1a39d7e451de1826da385b146152d516cc4951da49c779527',
        '-s', 'test.sond3r.track.taxonomy.1=0xccf6667bef466ee1aafe8a4dbc62f8c174a00fdefb5f99416d97a3f1b8d132f0',
        '--primary', 'test.sond3r.track.invariants.2',
      ],
      path.join(root, 'vectordb'),
    ]

  // FIX 2: Align the environment variable with your actual choice
  const targetChromaPath = app.isPackaged
    ? path.join(userDataPath, 'chroma_db')
    : path.join(root, 'vectordb/db/sond3r');

  pyProcess = spawn(bin, args, {
    cwd,
    env: { ...process.env, CHROMA_PATH: targetChromaPath },
  })

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
  // Open a URL in the OS default browser — used by any renderer link
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
// WSLg exposes the GPU (e.g. RTX via /dev/dxg) but Chromium blocklists Mesa and
// falls back to SOFTWARE WebGL, which is why 3D/canvas were unusably slow.
// These switches tell Electron to use the GPU via ANGLE-over-EGL (Mesa d3d12).
// They only help once WSL provides /dev/dri/renderD128 — if it's missing, run
// `wsl --update` then `wsl --shutdown` on the Windows host. Set SOND3R_DISABLE_GPU=1
// to revert to software (e.g. if the window renders blank).
if (process.platform === 'linux' && process.env.SOND3R_DISABLE_GPU !== '1') {
  // Safe, non-breaking: let Chromium use the GPU if one becomes available;
  // these are no-ops on a pure software stack (they won't blank the window).
  app.commandLine.appendSwitch('ignore-gpu-blocklist')
  app.commandLine.appendSwitch('enable-gpu-rasterization')
  app.commandLine.appendSwitch('enable-zero-copy')
  // Forcing ANGLE-over-EGL (Mesa d3d12) is the strongest lever once /dev/dri
  // exists, but it can white-screen on a broken GL stack — opt in once the GPU
  // is confirmed: run with SOND3R_GPU_ANGLE=1.
  if (process.env.SOND3R_GPU_ANGLE === '1') {
    app.commandLine.appendSwitch('use-gl', 'angle')
    app.commandLine.appendSwitch('use-angle', 'gl')
  }
}

// ─── Protocol + single-instance lock (must be before whenReady) ──────────────

// sond3r:// is the OAuth redirect URI registered in the Spotify dashboard.
// On macOS it arrives via open-url; on Windows/Linux via second-instance argv.
if (!app.isDefaultProtocolClient('sond3r')) {
  app.setAsDefaultProtocolClient('sond3r')
}

// Ensures only one app instance handles the protocol callback on Win/Linux.
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
}

// ─── App lifecycle ────────────────────────────────────────────────────────────

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('com.electron')

  startPython()
  startYtStreamProxy()

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

  // createWindow() now returns the BrowserWindow so we can hand it to
  // registerSpotifyAuth, which needs it to send IPC events back to the renderer.
  const mainWindow = createWindow()

  registerSpotifyAuth(mainWindow)   // spotify-auth:* IPC handlers (PKCE OAuth)
  registerPlaybackIpc()             // playback:* IPC handlers (source-agnostic; Spotify default)

  // Windows / Linux: protocol URI arrives as argv of the second instance
  app.on('second-instance', (_e, argv) => {
    const url = argv.find((a: string) => a.startsWith('sond3r://'))
    if (url) handleSpotifyCallback(url)
    // Also focus the existing window
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
  if (pyProcess && !pyProcess.killed) {
    if (process.platform === 'win32') {
      spawn('taskkill', ['/PID', String(pyProcess.pid), '/F', '/T'])
    } else {
      pyProcess.kill()
    }
  }
  if (rendererServer) {
    await new Promise<void>((resolve) => rendererServer?.close(() => resolve()))
  }
  await providerManager.shutdown()
})