import { app, shell, BrowserWindow, ipcMain, net } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { spawn } from 'child_process'
import path from 'path'
import fs from 'fs'
import http from 'http'
import mime from 'mime-types'

import { AgentProviderManager } from './agent/agent-provider-manager'
import { AgentBridge } from './agent/agent-bridge'
import { registerAgentIpcHandlers } from './agent/ipc-handlers'
import { DataContext } from '@fangorn-network/agent-types'
import { existsSync } from 'fs'
import { ToolboxConfigManager } from './agent/toolbox-config-manager'

let pyProcess: ReturnType<typeof spawn> | null = null
let rendererServer: http.Server | null = null

// ─────────────────────────────────────────────────────────────
// Python backend
// ─────────────────────────────────────────────────────────────

function startPython() {
  const root = is.dev ? app.getAppPath() : process.resourcesPath

  // In dev the script lives at <root>/vectordb/server.py.
  // We set cwd to that directory so any relative imports / file lookups
  // inside server.py resolve the same way they do when you run it by hand.
  const [bin, args, cwd]: [string, string[], string] = app.isPackaged
    ? [
      path.join(root, 'server'),
      [
        '-s',
        'tony.test.invariants.track.2=0xdd2ff7c1afae71333aac86f18316093fb017e4a47e7c6ef2b1c37b8ca62d53a6',
        '-s',
        'tony.test.tags.track.0=0x43a911728ed43457b145f5c4c0d89145b7c8d352b2c6ba0d86fff1f005166935',
        '--primary',
        'tony.test.invariants.track.2',
        // '--reset',
      ],
      root,
    ]
    : [
      path.join(root, 'vectordb/venv/bin/python'),
      [
        path.join(root, 'vectordb/server.py'),
        '-s',
        'tony.test.invariants.track.2=0xdd2ff7c1afae71333aac86f18316093fb017e4a47e7c6ef2b1c37b8ca62d53a6',
        '-s',
        'tony.test.tags.track.0=0x43a911728ed43457b145f5c4c0d89145b7c8d352b2c6ba0d86fff1f005166935',
        '--primary',
        'tony.test.invariants.track.2',
        // '--reset',
      ],
      path.join(root, 'vectordb'),   // ← the fix: match the manual-run cwd
    ]

  pyProcess = spawn(bin, args, {
    cwd,
    env: {
      ...process.env,
      CHROMA_PATH: path.join(app.getPath('userData'), 'chroma_db'),
    },
  })

  pyProcess.stdout?.on('data', (d) => console.log('[py]', d.toString().trimEnd()))
  pyProcess.stderr?.on('data', (d) => console.error('[py]', d.toString().trimEnd()))
  pyProcess.on('error', (err) => console.error('[py] failed to start:', err))
  pyProcess.on('exit', (code) => console.log('[py] exited with code', code))
}

// ─────────────────────────────────────────────────────────────
// Local renderer HTTP server
// Serves built renderer at http://127.0.0.1:5173
// Gives Privy a stable http:// origin (not file://)
// ─────────────────────────────────────────────────────────────

function startRendererServer(): Promise<void> {
  return new Promise((resolve) => {
    const rendererPath = join(process.resourcesPath, 'renderer')

    rendererServer = http.createServer((req, res) => {
      let reqPath = req.url ?? '/'
      if (reqPath === '/') reqPath = '/index.html'

      const filePath = join(rendererPath, reqPath)

      fs.readFile(filePath, (err, data) => {
        if (err) {
          // SPA fallback
          fs.readFile(join(rendererPath, 'index.html'), (fallbackErr, fallback) => {
            if (fallbackErr) {
              res.writeHead(500)
              res.end('Internal server error')
              return
            }
            res.writeHead(200, { 'Content-Type': 'text/html' })
            res.end(fallback)
          })
          return
        }

        res.writeHead(200, {
          'Content-Type': mime.lookup(filePath) || 'application/octet-stream',
        })
        res.end(data)
      })
    })

    rendererServer.listen(5173, '127.0.0.1', () => {
      console.log('[renderer] http://127.0.0.1:5173')
      resolve()
    })
  })
}

// ─────────────────────────────────────────────────────────────
// Browser window
// ─────────────────────────────────────────────────────────────

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    fullscreen: false,
    fullscreenable: true,
    show: false,
    darkTheme: true,
    movable: true,
    resizable: true,
    title: 'SOND3R',
    frame: false,
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: 'black',
      symbolColor: '#ffffff',
      height: 40,
    },
    backgroundColor: '#1a1a1a',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: false,
      nodeIntegration: false,
      webSecurity: true,
      partition: 'persist:main',
      webviewTag: true
    },
  })

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

// ─────────────────────────────────────────────────────────────
// IPC handlers
// ─────────────────────────────────────────────────────────────

function registerIpcHandlers() {

  // generic proxy
  ipcMain.handle('fetch:proxy', async (_event, { url, options }) => {
    const res = await fetch(url, options ?? {})
    const text = await res.text()
    return { status: res.status, body: text }
  })

  ipcMain.handle('deezer:api', async (_event, { url }) => {
    const res = await fetch(url, {
      headers: { 'Accept': 'application/json' },
    })
    const text = await res.text()
    return { status: res.status, body: text }
  })

  // Spotify API calls proxied through main so Spotify doesn't see Electron UA
  ipcMain.handle('spotify:api', async (_event, { url, method, token, body }) => {
    const res = await fetch(url, {
      method: method ?? 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })

    const text = await res.text()
    console.log('[spotify]', method ?? 'GET', url, res.status, res.headers.get('retry-after'))

    return {
      status: res.status,
      body: text,
      retryAfter: res.headers.get('retry-after'),
    }
  })

  ipcMain.handle('rpc:arbitrum', async (_event, { method, params }) => {
    const body = JSON.stringify(
      { jsonrpc: '2.0', id: 1, method, params },
      (_, v) => (typeof v === 'bigint' ? '0x' + v.toString(16) : v)
    )

    const res = await net.fetch('https://sepolia-rollup.arbitrum.io/rpc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    })

    const text = await res.text()
    console.log('[rpc]', method, res.status, text.slice(0, 200))
    return text
  })

  // ── Spotify OAuth ────────────────────────────────────────────────────────────
  // Opens a dedicated BrowserWindow for the OAuth flow. Watches will-redirect
  // and will-navigate for the callback URI, destroys the window, and resolves
  // with the full callback URL as the invoke return value.
  // No HTTP server needed. No IPC events. Clean req/res via invoke.
  ipcMain.handle('spotify:oauth', (_event, authUrl: string, redirectUri: string) => {
    return new Promise<string>((resolve, reject) => {
      const win = new BrowserWindow({
        width: 520,
        height: 720,
        title: 'Connect Spotify',
        parent: BrowserWindow.getAllWindows()[0],
        modal: false,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
        },
      })

      win.loadURL(authUrl)

      const handleUrl = (url: string) => {
        if (url.startsWith(redirectUri)) {
          win.destroy()
          resolve(url)
        }
      }

      win.webContents.on('will-redirect', (_e, url) => handleUrl(url))
      win.webContents.on('will-navigate', (_e, url) => handleUrl(url))
      win.on('closed', () => reject(new Error('auth_cancelled')))
    })
  })

}

// ─────────────────────────────────────────────────────────────
// Arbitrum RPC proxy (local HTTP, port 8545)
// ─────────────────────────────────────────────────────────────

const rpcProxy = http.createServer(async (req, res) => {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(chunk)
  const body = Buffer.concat(chunks).toString()

  const result = await net.fetch('https://sepolia-rollup.arbitrum.io/rpc', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  })

  const text = await result.text()
  res.writeHead(200, { 'Content-Type': 'application/json' })
  res.end(text)
})

rpcProxy.listen(8545, '127.0.0.1', () => {
  console.log('[rpc-proxy] http://127.0.0.1:8545')
})

// ─────────────────────────────────────────────────────────────
// Agent bootstrap
// ─────────────────────────────────────────────────────────────

const providerManager = new AgentProviderManager()
const toolboxConfigManager = new ToolboxConfigManager()

function getToolboxDir(): string {
  const bundled = path.join(process.resourcesPath, 'toolboxes')
  if (existsSync(bundled)) return bundled

  return path.join(
    app.getAppPath(),
    'node_modules',
    '@fangorn-network',
    'agent-tools',
    'build',
    'toolboxes'
  )
}

const dataContextProvider = (): DataContext => ({} as DataContext)

const bridge = new AgentBridge(
  providerManager,
  toolboxConfigManager,
  getToolboxDir(),
  dataContextProvider
)

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

// ─────────────────────────────────────────────────────────────
// App lifecycle
// ─────────────────────────────────────────────────────────────

app.commandLine.appendSwitch('enable-unsafe-swiftshader')
app.commandLine.appendSwitch('use-gl', 'swiftshader')

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('com.electron')

  startPython()

  if (!is.dev) {
    await startRendererServer()
  }

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

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