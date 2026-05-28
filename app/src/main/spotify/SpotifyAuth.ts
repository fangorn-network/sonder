/**
 * main/spotifyAuth.ts
 *
 * Main process side of Spotify PKCE auth.
 *
 * Setup in main.ts:
 *   import { registerSpotifyAuth, handleSpotifyCallback } from './spotifyAuth'
 *
 *   if (!app.isDefaultProtocolClient('sond3r')) app.setAsDefaultProtocolClient('sond3r')
 *
 *   app.on('ready', () => registerSpotifyAuth(mainWindow))
 *   app.on('open-url', (_e, url) => handleSpotifyCallback(url))           // macOS
 *   app.on('second-instance', (_e, argv) => {                             // win/linux
 *     const url = argv.find(a => a.startsWith('sond3r://'))
 *     if (url) handleSpotifyCallback(url)
 *   })
 *
 * Redirect URI to register in Spotify dashboard: sond3r://callback
 */

import { ipcMain, shell, BrowserWindow } from 'electron'
import { createHash, randomBytes }        from 'crypto'
import * as fs                            from 'fs'
import * as path                          from 'path'
import { app }                            from 'electron'

// ─── Config ───────────────────────────────────────────────────────────────────

const CLIENT_ID    = process.env.SPOTIFY_CLIENT_ID ?? ''
const REDIRECT_URI = 'sond3r://callback'
const SCOPES       = [
  'user-read-playback-state',
  'user-modify-playback-state',
  'user-read-currently-playing',
  'streaming',
  'user-read-email',
  'user-read-private',
].join(' ')

// ─── Token store ──────────────────────────────────────────────────────────────

interface TokenStore {
  accessToken:  string
  refreshToken: string
  expiresAt:    number
}

const TOKEN_PATH = path.join(app.getPath('userData'), 'spotify-tokens.json')

function readTokens(): TokenStore | null {
  try { return JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf-8')) }
  catch { return null }
}

function writeTokens(t: TokenStore) {
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(t), 'utf-8')
}

function clearTokens() {
  try { fs.unlinkSync(TOKEN_PATH) } catch {}
}

// ─── PKCE ─────────────────────────────────────────────────────────────────────

function generateVerifier(len = 64) {
  return randomBytes(len).toString('base64url').slice(0, len)
}

function generateChallenge(verifier: string) {
  return createHash('sha256').update(verifier).digest('base64url')
}

// ─── Token refresh ────────────────────────────────────────────────────────────

async function refreshToken(refreshToken: string): Promise<TokenStore> {
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token', refresh_token: refreshToken, client_id: CLIENT_ID,
    }),
  })
  if (!res.ok) throw new Error(`Refresh failed: ${res.status}`)
  const data  = await res.json()
  const store = {
    accessToken:  data.access_token,
    refreshToken: data.refresh_token ?? refreshToken,
    expiresAt:    Date.now() + (data.expires_in - 60) * 1000,
  }
  writeTokens(store)
  return store
}

async function getValidToken(): Promise<string | null> {
  const stored = readTokens()
  if (!stored) return null
  if (Date.now() < stored.expiresAt) return stored.accessToken
  try {
    return (await refreshToken(stored.refreshToken)).accessToken
  } catch {
    clearTokens()
    return null
  }
}

// ─── Module state ─────────────────────────────────────────────────────────────

let _verifier:   string | null      = null
let _mainWindow: BrowserWindow | null = null

// ─── Callback handler (called from app event in main.ts) ─────────────────────

export async function handleSpotifyCallback(url: string) {
  if (!url.startsWith('sond3r://callback')) return
  const params = new URL(url.replace('sond3r://', 'http://x/')).searchParams
  const code   = params.get('code')
  const error  = params.get('error')

  if (error || !code || !_verifier) {
    _mainWindow?.webContents.send('spotify-auth:error', error ?? 'Auth cancelled')
    return
  }

  try {
    const res = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type:    'authorization_code',
        code,
        redirect_uri:  REDIRECT_URI,
        client_id:     CLIENT_ID,
        code_verifier: _verifier,
      }),
    })
    if (!res.ok) throw new Error(`Code exchange failed: ${res.status}`)
    const data  = await res.json()
    const store = {
      accessToken:  data.access_token,
      refreshToken: data.refresh_token,
      expiresAt:    Date.now() + (data.expires_in - 60) * 1000,
    }
    writeTokens(store)
    _verifier = null
    _mainWindow?.webContents.send('spotify-auth:success', store.accessToken)
  } catch (e: any) {
    _mainWindow?.webContents.send('spotify-auth:error', e.message)
  }
}

// ─── IPC registration ─────────────────────────────────────────────────────────

export function registerSpotifyAuth(win: BrowserWindow) {
  _mainWindow = win

  ipcMain.handle('spotify-auth:login', async () => {
    _verifier       = generateVerifier()
    const challenge = generateChallenge(_verifier)
    const params    = new URLSearchParams({
      client_id:             CLIENT_ID,
      response_type:         'code',
      redirect_uri:          REDIRECT_URI,
      scope:                 SCOPES,
      code_challenge_method: 'S256',
      code_challenge:        challenge,
    })
    await shell.openExternal(`https://accounts.spotify.com/authorize?${params}`)
  })

  ipcMain.handle('spotify-auth:get-token', () => getValidToken())
  ipcMain.handle('spotify-auth:check',     async () => ({ isAuthenticated: !!(await getValidToken()) }))
  ipcMain.handle('spotify-auth:logout',    () => clearTokens())
}