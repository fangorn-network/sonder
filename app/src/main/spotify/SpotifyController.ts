/**
 * spotifyController.ts  (main process)
 *
 * Controls the already-running Spotify desktop app.
 * Client Credentials for catalog search — no user login, no MAU limit.
 */

import { ipcMain, shell, net } from 'electron'
import { exec, execFile } from 'child_process'
import { promisify } from 'util'
import * as fs from 'fs'

const execAsync = promisify(exec)

// ─── Platform detection ───────────────────────────────────────────────────────

function isWSL(): boolean {
  try {
    return fs
      .readFileSync('/proc/version', 'utf-8')
      .toLowerCase()
      .includes('microsoft')
  } catch {
    return false
  }
}

const IS_WSL = isWSL()
const p = process.platform

const PS = '/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe'
const CMD = '/mnt/c/Windows/System32/cmd.exe'

// ─── Status ───────────────────────────────────────────────────────────────────

export interface SpotifyStatus {
  isPlaying: boolean
  progressMs: number
  durationMs: number
  trackId: string | null
  title: string | null
  artist: string | null
  thumb: string | null
}

const EMPTY: SpotifyStatus = {
  isPlaying: false,
  progressMs: 0,
  durationMs: 0,
  trackId: null,
  title: null,
  artist: null,
  thumb: null,
}

// ─── Client Credentials token ─────────────────────────────────────────────────

let _ccToken: string | null = null
let _ccExpiry = 0

async function getClientToken(): Promise<string> {
  if (_ccToken && Date.now() < _ccExpiry) {
    return _ccToken
  }

  // IMPORTANT:
  // Electron main process should use process.env
  const clientId =
    process.env.VITE_SPOTIFY_CLIENT_ID ?? ''

  const clientSecret =
    process.env.VITE_SPOTIFY_CLIENT_SECRET ?? ''

  if (!clientId || !clientSecret) {
    throw new Error(
      'VITE_SPOTIFY_CLIENT_ID / VITE_SPOTIFY_CLIENT_SECRET missing'
    )
  }

  console.log('[spotify] fetching token...')

  const credentials = Buffer
    .from(`${clientId}:${clientSecret}`)
    .toString('base64')

  const res = await net.fetch(
    'https://accounts.spotify.com/api/token',
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    }
  )

  const text = await res.text()

  console.log(
    '[spotify] token response:',
    res.status,
    text.slice(0, 200)
  )

  if (!res.ok) {
    throw new Error(
      `Spotify token failed: ${res.status} ${text}`
    )
  }

  const data = JSON.parse(text)

  _ccToken = data.access_token as string
  _ccExpiry = Date.now() + ((data.expires_in - 60) * 1000)

  console.log('[spotify] token OK')

  return _ccToken
}

// ─── Track resolution ─────────────────────────────────────────────────────────

interface Resolved {
  uri: string
  durationMs: number
}

async function resolveTrackUri(
  artist: string,
  title: string
): Promise<Resolved | null> {
  try {
    const token = await getClientToken()

    const q = encodeURIComponent(
      `track:${title} artist:${artist}`
    )

    const res = await net.fetch(
      `https://api.spotify.com/v1/search?q=${q}&type=track&limit=1`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    )

    if (!res.ok) {
      throw new Error(
        `Search ${res.status}: ${await res.text()}`
      )
    }

    const data = await res.json()

    const track = data.tracks?.items?.[0]

    if (!track) {
      throw new Error(
        `No result for: ${artist} - ${title}`
      )
    }

    console.log(
      `[spotify] resolved -> ${track.uri} (${track.name} by ${track.artists[0]?.name})`
    )

    return {
      uri: track.uri as string,
      durationMs: track.duration_ms as number,
    }
  } catch (e) {
    console.error('[spotify] resolution failed:', e)
    return null
  }
}

// ─── PowerShell helper ────────────────────────────────────────────────────────

function runPS(
  script: string
): Promise<{ stdout: string; stderr: string }> {
  const args = [
    '-NoProfile',
    '-NonInteractive',
    '-Command',
    script,
  ]

  return new Promise((resolve, reject) => {
    const proc = execFile(PS, args)

    let stdout = ''
    let stderr = ''

    proc.stdout?.on('data', (d: Buffer) => {
      stdout += d.toString()
    })

    proc.stderr?.on('data', (d: Buffer) => {
      stderr += d.toString()
    })

    proc.on('close', (code: number | null) => {
      if (code !== 0) {
        reject(
          new Error(stderr || `PS exited ${code}`)
        )
      } else {
        resolve({ stdout, stderr })
      }
    })

    proc.on('error', reject)
  })
}

// ─── WSL2 ─────────────────────────────────────────────────────────────────────

const wsl = {
  async play(
    artist: string,
    title: string
  ): Promise<{ durationMs: number } | null> {
    const resolved = await resolveTrackUri(
      artist,
      title
    )

    if (!resolved) {
      console.error(
        '[spotify] no URI — cannot play'
      )
      return null
    }

    console.log(
      '[spotify] opening URI:',
      resolved.uri
    )

    // Focus Spotify + dismiss search bar
    await runPS(
      '$w = New-Object -ComObject WScript.Shell; ' +
      '$w.AppActivate("Spotify"); ' +
      'Start-Sleep -Milliseconds 200; ' +
      '$w.SendKeys("{ESC}")'
    ).catch(() => { })

    // IMPORTANT:
    // Use cmd.exe /c start instead of explorer.exe
    // explorer.exe returns code 1 for protocol URIs in WSL.
    exec(
      `"${CMD}" /c start "" "${resolved.uri}"`,
      (err) => {
        if (err) {
          console.warn(
            '[spotify] start warning:',
            err.message
          )
        }
      }
    )

    // Give Spotify time to process URI
    await new Promise(r => setTimeout(r, 2000))

    // Detect whether autoplay happened
    try {
      const { stdout } = await runPS(
        '$p = Get-Process -Name Spotify -EA SilentlyContinue | ' +
        'Where-Object { $_.MainWindowTitle -ne "" } | ' +
        'Select-Object -First 1; ' +
        'if ($p) { $p.MainWindowTitle } else { "" }'
      )

      const winTitle = stdout.trim()

      const isPlaying =
        winTitle !== '' &&
        winTitle !== 'Spotify'

      console.log(
        '[spotify] after nav title:',
        JSON.stringify(winTitle),
        '| autoplayed:',
        isPlaying
      )

      // Send media play key if needed
      if (!isPlaying) {
        await runPS(
          '$w = New-Object -ComObject WScript.Shell; ' +
          '$w.SendKeys([char]179)'
        )
      }
    } catch {
      await runPS(
        '$w = New-Object -ComObject WScript.Shell; ' +
        '$w.SendKeys([char]179)'
      ).catch(() => { })
    }

    return {
      durationMs: resolved.durationMs,
    }
  },

  async pause() {
    await runPS(
      '$w = New-Object -ComObject WScript.Shell; ' +
      '$w.SendKeys([char]179)'
    )
  },

  async resume() {
    await runPS(
      '$w = New-Object -ComObject WScript.Shell; ' +
      '$w.SendKeys([char]179)'
    )
  },

  async seek(_ms: number) { },

  async volume(_pct: number) { },

  async status(): Promise<SpotifyStatus> {
    try {
      const { stdout } = await runPS(
        '$p = Get-Process -Name Spotify -ErrorAction SilentlyContinue | ' +
        'Where-Object { $_.MainWindowTitle -ne "" } | ' +
        'Select-Object -First 1; ' +
        'if ($p) { $p.MainWindowTitle } else { "" }'
      )

      const win = stdout.trim()

      if (!win || win === 'Spotify') {
        return EMPTY
      }

      const dash = win.indexOf(' - ')

      if (dash === -1) {
        return EMPTY
      }

      return {
        ...EMPTY,
        isPlaying: true,
        artist: win.slice(0, dash).trim(),
        title: win.slice(dash + 3).trim(),
      }
    } catch {
      return EMPTY
    }
  },
}

// ─── Linux — MPRIS2 ───────────────────────────────────────────────────────────

let _dbus: any = null

async function dbus() {
  if (!_dbus) {
    _dbus = await import('dbus-next')
  }

  return _dbus
}

async function mprisPlayer() {
  const db = await dbus()
  const bus = db.sessionBus()

  const obj = await bus.getProxyObject(
    'org.mpris.MediaPlayer2.spotify',
    '/org/mpris/MediaPlayer2'
  )

  return {
    player: obj.getInterface(
      'org.mpris.MediaPlayer2.Player'
    ),
    props: obj.getInterface(
      'org.freedesktop.DBus.Properties'
    ),
  }
}

const linux = {
  async play(
    artist: string,
    title: string
  ): Promise<{ durationMs: number } | null> {
    const resolved = await resolveTrackUri(
      artist,
      title
    )

    if (!resolved) {
      console.error(
        '[spotify] no URI — cannot play'
      )
      return null
    }

    const { player } = await mprisPlayer()

    await player.OpenUri(resolved.uri)

    await new Promise(r => setTimeout(r, 300))

    await player.Play()

    return {
      durationMs: resolved.durationMs,
    }
  },

  async pause() {
    ; (await mprisPlayer()).player.Pause()
  },

  async resume() {
    ; (await mprisPlayer()).player.Play()
  },

  async seek(ms: number) {
    const { player, props } =
      await mprisPlayer()

    const meta = await props.Get(
      'org.mpris.MediaPlayer2.Player',
      'Metadata'
    )

    const trackId =
      meta.value?.['mpris:trackid']?.value ?? '/'

    await player.SetPosition(
      trackId,
      BigInt(ms) * 1000n
    )
  },

  async volume(pct: number) {
    const { props } = await mprisPlayer()

    await props.Set(
      'org.mpris.MediaPlayer2.Player',
      'Volume',
      {
        type: 'd',
        value: pct / 100,
      }
    )
  },

  async status(): Promise<SpotifyStatus> {
    try {
      const { props } = await mprisPlayer()

      const iface =
        'org.mpris.MediaPlayer2.Player'

      const [
        statusVal,
        metaVal,
        posVal,
      ] = await Promise.all([
        props.Get(iface, 'PlaybackStatus'),
        props.Get(iface, 'Metadata'),
        props.Get(iface, 'Position'),
      ])

      const meta =
        metaVal.value as Record<string, any>

      return {
        isPlaying:
          statusVal.value === 'Playing',

        progressMs:
          Number(
            (posVal.value as bigint) / 1000n
          ),

        durationMs:
          Number(
            (
              (meta['mpris:length']
                ?.value ?? 0n) as bigint
            ) / 1000n
          ),

        trackId:
          (
            meta['mpris:trackid']
              ?.value as string
          )?.replace(
            'spotify:track:',
            ''
          ) ?? null,

        title:
          meta['xesam:title']?.value ?? null,

        artist:
          (
            meta['xesam:artist']
              ?.value as string[]
          )?.[0] ?? null,

        thumb:
          meta['mpris:artUrl']?.value ?? null,
      }
    } catch {
      return EMPTY
    }
  },
}

// ─── macOS ────────────────────────────────────────────────────────────────────

function osa(script: string) {
  return execAsync(
    `osascript -e '${script.replace(/'/g, "'\\''")}'`
  )
}

const macos = {
  async play(
    artist: string,
    title: string
  ): Promise<{ durationMs: number } | null> {
    const resolved = await resolveTrackUri(
      artist,
      title
    )

    if (!resolved) {
      console.error(
        '[spotify] no URI — cannot play'
      )
      return null
    }

    await osa(
      `tell application "Spotify" to play track "${resolved.uri}"`
    )

    return {
      durationMs: resolved.durationMs,
    }
  },

  async pause() {
    await osa(
      'tell application "Spotify" to pause'
    )
  },

  async resume() {
    await osa(
      'tell application "Spotify" to play'
    )
  },

  async seek(ms: number) {
    await osa(
      `tell application "Spotify" to set player position to ${ms / 1000}`
    )
  },

  async volume(pct: number) {
    await osa(
      `tell application "Spotify" to set sound volume to ${Math.round(pct)}`
    )
  },

  async status(): Promise<SpotifyStatus> {
    try {
      const { stdout } = await execAsync(`
        osascript -e '
        tell application "Spotify"
          return (player state as string) & "|" &
                 player position & "|" &
                 (duration of current track) & "|" &
                 (name of current track) & "|" &
                 (artist of current track) & "|" &
                 (artwork url of current track) & "|" &
                 (id of current track)
        end tell'
      `)

      const [
        state,
        pos,
        dur,
        title,
        artist,
        thumb,
        uri,
      ] = stdout.trim().split('|')

      return {
        isPlaying: state === 'playing',
        progressMs:
          Math.round(parseFloat(pos) * 1000),
        durationMs:
          Math.round(parseFloat(dur) * 1000),
        trackId:
          uri?.replace(
            'spotify:track:',
            ''
          ) ?? null,
        title: title ?? null,
        artist: artist ?? null,
        thumb: thumb ?? null,
      }
    } catch {
      return EMPTY
    }
  },
}

// ─── Windows ──────────────────────────────────────────────────────────────────

const windows = {
  async play(
    artist: string,
    title: string
  ): Promise<{ durationMs: number } | null> {
    const resolved = await resolveTrackUri(
      artist,
      title
    )

    if (!resolved) {
      console.error(
        '[spotify] no URI — cannot play'
      )
      return null
    }

    await shell.openExternal(resolved.uri)

    return {
      durationMs: resolved.durationMs,
    }
  },

  async pause() {
    await shell.openExternal('spotify:pause')
  },

  async resume() {
    await shell.openExternal('spotify:play')
  },

  async seek(_ms: number) { },

  async volume(_pct: number) { },

  async status(): Promise<SpotifyStatus> {
    return EMPTY
  },
}

// ─── Dispatch ─────────────────────────────────────────────────────────────────

function ctrl() {
  if (IS_WSL) {
    return wsl
  }

  if (p === 'linux') {
    return linux
  }

  if (p === 'darwin') {
    return macos
  }

  return windows
}

// ─── IPC Registration ─────────────────────────────────────────────────────────

export function registerSpotifyIpc() {
  console.log(
    '[spotify] platform:',
    p,
    '| WSL:',
    IS_WSL
  )

  ipcMain.handle(
    'spotify:play',
    async (_e, artist: string, title: string) => {
      try {
        // 1. Clear the deck: Kill any current music playback
        await ctrl().pause().catch(() => { })

        // Give Spotify 150ms to shut up its audio stream
        await new Promise((resolve) => setTimeout(resolve, 150))

        // 2. Fire the search / track load command
        const playResult = await ctrl().play(artist, title)

        // 3. THE KICKSTART: Wait for the Spotify client UI to register the track change...
        await new Promise((resolve) => setTimeout(resolve, 350))

        // ...and forcefully drop the needle by calling resume/play
        await ctrl().resume().catch(() => { })

        return playResult
      } catch (err) {
        console.error('[Spotify Main] Failed to execute play sequence:', err)
        throw err
      }
    }
  )

  ipcMain.handle(
    'spotify:pause',
    () => ctrl().pause()
  )

  ipcMain.handle(
    'spotify:resume',
    () => ctrl().resume()
  )

  ipcMain.handle(
    'spotify:seek',
    (_e, ms: number) =>
      ctrl().seek(ms)
  )

  ipcMain.handle(
    'spotify:volume',
    (_e, pct: number) =>
      ctrl().volume(pct)
  )

  ipcMain.handle(
    'spotify:status',
    () => ctrl().status()
  )
}