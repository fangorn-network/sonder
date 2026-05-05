import { app, shell, BrowserWindow, ipcMain, session } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { spawn } from 'child_process'
import path from 'path'
import { URL } from 'url'

let pyProcess: ReturnType<typeof spawn> | null = null

function startPython() {
  // app.getAppPath() = project root in dev, resources/ in packaged
  const root = is.dev ? app.getAppPath() : process.resourcesPath

  const [bin, args]: [string, string[]] = app.isPackaged
    ? [path.join(root, 'server'), []]
    : [
        path.join(root, 'vectordb/venv/bin/python'),
        [path.join(root, 'vectordb/main.py')]
      ]

  pyProcess = spawn(bin, args, {
    env: { ...process.env }
  })

  pyProcess.stdout!.on('data', (d) => console.log('[py]', d.toString()))
  pyProcess.stderr!.on('data', (d) => console.error('[py]', d.toString()))
  pyProcess.on('error', (err) => console.error('[py] failed to start:', err))
  pyProcess.on('exit', (code) => console.log('[py] exited with code', code))
}

async function waitForPython(url: string, retries = 20, delay = 300): Promise<void> {
  for (let i = 0; i < retries; i++) {
    try {
      await fetch(url)
      return
    } catch {
      await new Promise((r) => setTimeout(r, delay))
    }
  }
  throw new Error(`Python server never came up at ${url}`)
}

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    fullscreen: false,
    fullscreenable: true,
    show: false,
    darkTheme: true,
    movable: true,
    titleBarOverlay: {
      color: 'black',
      symbolColor: '#ffffff',
      height: 40
    },
    backgroundColor: '#1a1a1a',
    resizable: true,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      webSecurity: false,
      allowRunningInsecureContent: true,
      contextIsolation: true,
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('com.electron')

  startPython()
  await waitForPython('http://0.0.0.0:8080/health')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  ipcMain.on('ping', () => console.log('pong'))

  session.defaultSession.webRequest.onBeforeSendHeaders(
    { urls: ['https://*.privy.io/*', 'https://explorer-api.walletconnect.com/*'] },
    (details, callback) => {
      details.requestHeaders['Origin'] = 'http://localhost:5173'
      details.requestHeaders['Referer'] = 'http://localhost:5173/'
      details.requestHeaders['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
      callback({ requestHeaders: details.requestHeaders })
    }
  )

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const isPrivy = details.url.includes('privy.io') || details.url.includes('walletconnect.com')
    const isSpotify = details.url.includes('api.spotify.com')

    if (isSpotify) {
      callback({ responseHeaders: details.responseHeaders })
      return
    }

    const headers = { ...details.responseHeaders }

    if (isPrivy) {
      callback({
        responseHeaders: {
          ...headers,
          'Access-Control-Allow-Origin': ['http://localhost:5173'],
          'Access-Control-Allow-Headers': ['*'],
          'Access-Control-Allow-Methods': ['*'],
          'Content-Security-Policy': [
            "default-src * 'unsafe-inline' 'unsafe-eval' data: blob:; " +
            "connect-src * 'unsafe-inline'; " +
            "script-src * 'unsafe-inline' 'unsafe-eval' blob:; " +
            "worker-src * blob:; " +
            "frame-src *;"
          ]
        }
      })
      return
    }

    delete headers['content-security-policy']
    delete headers['Content-Security-Policy']
    callback({
      responseHeaders: {
        ...headers,
        'Content-Security-Policy': ["default-src * 'unsafe-inline' 'unsafe-eval' data: blob:; connect-src *; img-src * data:; frame-src *;"]
      }
    })
  })

  ipcMain.handle('spotify:api', async (_event, { url, method, token, body }) => {
    const res = await fetch(url, {
      method: method ?? 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      ...(body ? { body: JSON.stringify(body) } : {})
    })
    const text = await res.text()
    console.log('[spotify]', method ?? 'GET', url, res.status, res.headers.get('retry-after'))
    return { status: res.status, body: text, retryAfter: res.headers.get('retry-after') }
  })

  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  pyProcess?.kill()
})