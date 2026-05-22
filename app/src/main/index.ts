import { app, shell, BrowserWindow, ipcMain, net, session } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { spawn } from 'child_process'
import path from 'path'
import fs from 'fs'
import http from 'http'
import mime from 'mime-types'
import dotenv from 'dotenv'
import { AgentProviderManager } from './agent/agent-provider-manager'
import { AgentBridge } from './agent/agent-bridge'
import { registerAgentIpcHandlers } from './agent/ipc-handlers'
import { DataContext } from '@fangorn-network/agent-types'
import { existsSync } from 'fs'
import { ToolboxConfigManager } from './agent/toolbox-config-manager'

// ─── yt-dlp helpers ───────────────────────────────────────────────────────────

function getYtDlpBin(): string {
  const updatable = path.join(app.getPath('userData'), 'yt-dlp')
  if (fs.existsSync(updatable)) return updatable
  if (app.isPackaged) return path.join(process.resourcesPath, 'bin', 'yt-dlp')
  return path.join(app.getAppPath(), 'resources', 'bin', 'yt-dlp')
}

async function updateYtDlp(): Promise<void> {
  return new Promise((resolve) => {
    const updatable = path.join(app.getPath('userData'), 'yt-dlp')
    const bin = getYtDlpBin()

    if (!fs.existsSync(updatable)) {
      try { fs.copyFileSync(bin, updatable); fs.chmodSync(updatable, 0o755) }
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

// ─── Stream cache ─────────────────────────────────────────────────────────────

interface StreamEntry {
  url: string
  headers: Record<string, string>
}
const streamCache = new Map<string, StreamEntry>()

// ─── Stream proxy — serves cached URLs with yt-dlp headers ───────────────────

let streamServer: http.Server | null = null
let streamPort = 0

function startYtStreamProxy() {
  streamServer = http.createServer(async (req, res) => {
    const videoId = req.url?.slice(1)
    if (!videoId) { res.writeHead(400); res.end(); return }

    const entry = streamCache.get(videoId)
    if (!entry) { res.writeHead(404); res.end(); return }

    res.on('error', () => { })

    try {
      const fetchHeaders: Record<string, string> = { ...entry.headers }
      if (req.headers.range) fetchHeaders['Range'] = req.headers.range as string

      const upstream = await fetch(entry.url, { headers: fetchHeaders })

      const status = req.headers.range ? 206 : 200
      const outHeaders: Record<string, string> = {
        'Content-Type': upstream.headers.get('content-type') || 'audio/mp4',
        'Accept-Ranges': 'bytes',
      }
      const cl = upstream.headers.get('content-length')
      const cr = upstream.headers.get('content-range')
      if (cl) outHeaders['Content-Length'] = cl
      if (cr) outHeaders['Content-Range'] = cr

      res.writeHead(status, outHeaders)

      const reader = upstream.body!.getReader()
      req.on('close', () => reader.cancel().catch(() => { }))

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        if (res.writableEnded) break
        const ok = res.write(Buffer.from(value))
        if (!ok) await new Promise(r => res.once('drain', r))
      }
      if (!res.writableEnded) res.end()
    } catch {
      if (!res.writableEnded) res.end()
    }
  })

  streamServer.listen(0, '127.0.0.1', () => {
    streamPort = (streamServer!.address() as any).port
    console.log(`[yt-stream] :${streamPort}`)
  })
}

// ─── resolveYt ────────────────────────────────────────────────────────────────
// function resolveYt(query: string): Promise<YtResolveResult> {
//   return new Promise((resolve, reject) => {
//     // Accept: 11-char YouTube IDs, SoundCloud URLs, or freeform search strings
//     const isBareId = /^[A-Za-z0-9_-]{11}$/.test(query)
//     const isUrl = query.startsWith('http')
//     const target = (isBareId || isUrl) ? query : `ytsearch1:${query} music`

//     const proc = spawn(getYtDlpBin(), [
//       target,
//       '--dump-json',
//       '--no-playlist',
//       '--no-warnings',
//       '--cookies-from-browser', 'chrome',
//       // '--extractor-args', 'youtube:player_client=tv_embedded',
//     ])

//     //     // tv_embedded client only helps with YouTube — skip for SoundCloud and other URLs
// //     if (isYouTube || (!isUrl && !isSoundCloud)) {
// //       args.push('--extractor-args', 'youtube:player_client=tv_embedded')
// //     }

//     let out = '', err = ''
//     proc.stdout.on('data', (d: Buffer) => { out += d.toString() })
//     proc.stderr.on('data', (d: Buffer) => { console.error('[yt:search]', d.toString().trim()) })
//     proc.on('error', reject)
//     proc.on('close', (code: number) => {
//       if (code !== 0) { reject(new Error(`yt-dlp exited ${code}: ${err.slice(0, 200)}`)); return }
//       try {
//         const info = JSON.parse(out.trim().split('\n')[0])

//         const fmt = (info.formats ?? [])
//           .filter((f: any) => f.url && f.acodec !== 'none' && (!f.vcodec || f.vcodec === 'none'))
//           .sort((a: any, b: any) => (b.abr ?? b.tbr ?? 0) - (a.abr ?? a.tbr ?? 0))[0]

//         if (!fmt?.url) throw new Error('No audio format found')

//         streamCache.set(info.id, {
//           url: fmt.url,
//           headers: fmt.http_headers ?? {},
//         })

//         resolve({
//           streamUrl: `http://127.0.0.1:${streamPort}/${info.id}`,
//           videoId: info.id,
//           title: info.title ?? 'Unknown Title',
//           artist: info.uploader ?? info.channel ?? 'Unknown Artist',
//           thumbnail: info.thumbnail ?? '',
//           durationMs: Math.round((info.duration ?? 0) * 1000),
//         })
//       } catch (e: any) {
//         reject(new Error(`resolve failed: ${e.message}`))
//       }
//     })
//   })
// }
function resolveYt(query: string): Promise<YtResolveResult> {
  return new Promise((resolve, reject) => {
    const isBareId = /^[A-Za-z0-9_-]{11}$/.test(query)
    const isUrl = query.startsWith('http')
    const isYouTube =
      isBareId ||
      (isUrl && (query.includes('youtube.com') || query.includes('youtu.be')))

    const target = (isBareId || isUrl)
      ? query
      : `ytsearch1:${query} music`

    const args: string[] = [
      target,
      '--dump-json',
      '--no-playlist',
      '--no-warnings',
    ]

    if (isYouTube) {
      args.push('--extractor-args', 'youtube:player_client=tv_embedded')
    }

    const proc = spawn(getYtDlpBin(), args)

    let out = ''
    let err = ''

    proc.stdout.on('data', (d: Buffer) => { out += d.toString() })
    proc.stderr.on('data', (d: Buffer) => { err += d.toString() })
    proc.on('error', reject)

    proc.on('close', (code: number) => {
      if (code !== 0) {
        reject(new Error(`yt-dlp exited ${code}: ${err.slice(0, 300)}`))
        return
      }

      try {
        const info = JSON.parse(out.trim().split('\n')[0])

        const formats = (info.formats ?? [])
          .filter((f: any) => {
            if (!f.url) return false
            if (f.acodec === 'none') return false
            if (f.vcodec && f.vcodec !== 'none') return false

            // 🚨 CRITICAL: exclude streaming manifests
            if (f.protocol?.includes('m3u8')) return false
            if (f.protocol?.includes('m3u8_native')) return false
            if (f.protocol?.includes('dash')) return false

            return true
          })
          .sort((a: any, b: any) =>
            (b.abr ?? b.tbr ?? 0) - (a.abr ?? a.tbr ?? 0)
          )

        const fmt = formats[0]

        if (!fmt?.url) {
          throw new Error('No compatible progressive audio format found')
        }

        streamCache.set(info.id, {
          url: fmt.url,
          headers: fmt.http_headers ?? {},
        })

        resolve({
          streamUrl: `http://127.0.0.1:${streamPort}/${info.id}`,
          videoId: info.id,
          title: info.title ?? 'Unknown Title',
          artist: info.uploader ?? info.channel ?? 'Unknown Artist',
          thumbnail: info.thumbnail ?? '',
          durationMs: Math.round((info.duration ?? 0) * 1000),
        })
      } catch (e: any) {
        reject(new Error(`resolve failed: ${e.message}`))
      }
    })
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

  const apiKey = (import.meta as any).env.VITE_GRAPH_API_KEY ?? "";
  const [bin, args, cwd]: [string, string[], string] = app.isPackaged
    ? [
      path.join(root, 'server'),
      [
        '--graph-api-key', apiKey,
        '-s', 'tony.test.invariants.track.2=0xdd2ff7c1afae71333aac86f18316093fb017e4a47e7c6ef2b1c37b8ca62d53a6',
        '-s', 'tony.test.tags.track.0=0x43a911728ed43457b145f5c4c0d89145b7c8d352b2c6ba0d86fff1f005166935',
        '-s', 'tony.test.source.track.0=0x8dfc44d7707713b38bc3fa714f1b256ce6899e8e3f1fc3bfa3d62d5cefad26e4',
        '--primary', 'tony.test.invariants.track.2',
      ],
      root,
    ]
    : [
      path.join(root, 'vectordb/venv/bin/python'),
      [
        path.join(root, 'vectordb/server.py'),
        '--graph-api-key', apiKey,
        '-s', 'tony.test.invariants.track.2=0xdd2ff7c1afae71333aac86f18316093fb017e4a47e7c6ef2b1c37b8ca62d53a6',
        '-s', 'tony.test.tags.track.0=0x43a911728ed43457b145f5c4c0d89145b7c8d352b2c6ba0d86fff1f005166935',
        '-s', 'tony.test.source.track.0=0x8dfc44d7707713b38bc3fa714f1b256ce6899e8e3f1fc3bfa3d62d5cefad26e4',
        '--primary', 'tony.test.invariants.track.2',
      ],
      path.join(root, 'vectordb'),
    ]

  pyProcess = spawn(bin, args, {
    cwd,
    env: { ...process.env, CHROMA_PATH: path.join(app.getPath('userData'), 'chroma_db') },
  })

  pyProcess.stdout?.on('data', (d) => console.log('[py]', d.toString().trimEnd()))
  pyProcess.stderr?.on('data', (d) => console.error('[py]', d.toString().trimEnd()))
  pyProcess.on('error', (err) => console.error('[py] failed to start:', err))
  pyProcess.on('exit', (code) => console.log('[py] exited with code', code))
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

function createWindow(): void {
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
}

// ─── IPC handlers ─────────────────────────────────────────────────────────────

function registerIpcHandlers() {
  ipcMain.handle('fetch:proxy', async (_event, { url, options }) => {
    const res = await fetch(url, options ?? {})
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

  // ── yt-dlp ──────────────────────────────────────────────────────────────────

  ipcMain.handle('yt:resolve', async (_event, query: string): Promise<YtResolveResult> => {
    return resolveYt(query)
  })

  ipcMain.handle('yt:prefetch', async (_event, query: string) => {
    try { await resolveYt(query) } catch { /* non-fatal */ }
  })

  ipcMain.handle('yt:search:music', async (_event, query: string): Promise<any[]> => {
    return new Promise((resolve) => {
      const proc = spawn(getYtDlpBin(), [
        `ytmsearch15:${query}`,
        '--dump-json',
        '--no-playlist',
        '--no-warnings',
        '--flat-playlist',
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
        '--dump-json',
        '--no-playlist',
        '--no-warnings',
        '--flat-playlist',
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

// ─── App lifecycle ────────────────────────────────────────────────────────────

app.commandLine.appendSwitch('enable-unsafe-swiftshader')
app.commandLine.appendSwitch('use-gl', 'swiftshader')
app.commandLine.appendSwitch('audio-output-rate', '48000')
app.commandLine.appendSwitch('disable-audio-output-resampler')

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('com.electron')

  startPython()
  updateYtDlp()
  startYtStreamProxy()

  if (!is.dev) await startRendererServer()

  const targetSession = session.fromPartition('persist:main')
  const ytFilter = { urls: ['https://*.youtube.com/*', 'https://*.youtube-nocookie.com/*'] }

  targetSession.webRequest.onBeforeSendHeaders(ytFilter, (details, callback) => {
    details.requestHeaders['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    details.requestHeaders['Cookie'] = 'PREF=f4=4000000&f6=40000000&volume=100;'
    callback({ requestHeaders: details.requestHeaders })
  })

  app.on('browser-window-created', (_, window) => optimizer.watchWindowShortcuts(window))

  registerIpcHandlers()
  await bootstrap()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', async () => {
  pyProcess?.kill()
  if (rendererServer) {
    await new Promise<void>((resolve) => rendererServer?.close(() => resolve()))
  }
  await providerManager.shutdown()
})