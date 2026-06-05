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

// Strip common YouTube title suffixes that never appear on Spotify
const YT_SUFFIX_RE = [
  /\s*[\(\[].*?(?:official|lyric|audio|video|visuali[sz]er|stream|premiere|hd|4k|remaster|uncensored|explicit|radio\s*edit|album\s*version|extended|instrumental|acoustic|live|tour|session).*?[\)\]]/gi,
  /\s*[\(\[][^\(\)\[\]]*[\)\]]\s*$/gi, // any trailing (…) or […]
  /\s*\/\/.*$/g,                        // // Label badge at end
  /\s*\|[^|]*$/g,                       // | Label badge at end
]

function cleanYoutubeTitle(raw: string): string {
  let s = raw
  for (const re of YT_SUFFIX_RE) s = s.replace(re, '')
  return s.replace(/\s+/g, ' ').trim()
}

// Many YouTube titles follow "Artist - Track Title" convention
function parseYoutubeArtistTitle(title: string): { artist: string; track: string } | null {
  const dash = title.indexOf(' - ')
  if (dash <= 0) return null
  return {
    artist: title.slice(0, dash).trim(),
    track:  title.slice(dash + 3).trim(),
  }
}

async function spotifySearch(token: string, q: string): Promise<Resolved | null> {
  try {
    const res = await net.fetch(
      `https://api.spotify.com/v1/search?q=${encodeURIComponent(q)}&type=track&limit=1`,
      { headers: { Authorization: `Bearer ${token}` } },
    )
    if (!res.ok) return null
    const data  = await res.json()
    const track = data.tracks?.items?.[0]
    if (!track)  return null
    console.log(`[spotify] found → ${track.uri}  (${track.name} · ${track.artists[0]?.name})`)
    return { uri: track.uri as string, durationMs: track.duration_ms as number }
  } catch {
    return null
  }
}

async function resolveTrackUri(
  channelOrArtist: string,
  rawTitle: string,
): Promise<Resolved | null> {
  try {
    const token  = await getClientToken()
    const clean  = cleanYoutubeTitle(rawTitle)
    const parsed = parseYoutubeArtistTitle(clean)

    // Build search queries from most-specific to most-lenient
    const queries: string[] = []

    if (parsed) {
      // Title was "Artist - Track (Official …)" — parsed values are most reliable
      queries.push(`track:${parsed.track} artist:${parsed.artist}`)
      queries.push(`${parsed.artist} ${parsed.track}`)
    }

    // Cleaned title with the supplied artist (might be correct, e.g. from catalogue)
    if (channelOrArtist && channelOrArtist !== (parsed?.artist ?? '')) {
      queries.push(`track:${clean} artist:${channelOrArtist}`)
    }

    // General search on the cleaned title alone
    queries.push(clean)

    for (const q of queries) {
      const result = await spotifySearch(token, q)
      if (result) return result
    }

    console.error(`[spotify] no result after ${queries.length} strategies for: ${rawTitle}`)
    return null
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

const PS_GET_TITLE =
  '$p = Get-Process -Name Spotify -EA SilentlyContinue | ' +
  'Where-Object { $_.MainWindowTitle -ne "" } | ' +
  'Select-Object -First 1; ' +
  'if ($p) { $p.MainWindowTitle } else { "" }'

const PS_SEND_PLAY =
  '$w = New-Object -ComObject WScript.Shell; $w.SendKeys([char]179)'

const wsl = {
  async play(
    artist: string,
    title: string
  ): Promise<{ durationMs: number } | null> {
    const resolved = await resolveTrackUri(artist, title)

    if (!resolved) {
      console.error('[spotify] no URI — cannot play')
      return null
    }

    console.log('[spotify] opening URI:', resolved.uri)

    // Capture the current window title *before* we do anything.
    // We use this to detect when the title actually changes to the new track,
    // preventing false-positives from the old track's title still being visible.
    let prevTitle = ''
    try {
      const { stdout } = await runPS(PS_GET_TITLE)
      prevTitle = stdout.trim()
    } catch { /* Spotify may not be open yet */ }

    const isCurrentlyPlaying = prevTitle !== '' && prevTitle !== 'Spotify'

    // If Spotify is actively playing, pause it before sending the URI.
    // Without an explicit pause, Spotify on Windows often queues the new track
    // instead of immediately replacing the current one.
    if (isCurrentlyPlaying) {
      console.log('[spotify] pausing current track before switch, title was:', JSON.stringify(prevTitle))
      await runPS(PS_SEND_PLAY).catch(() => { })   // toggle → pause
      await new Promise(r => setTimeout(r, 400))
    }

    // Open the track URI — Spotify will navigate to and play this track.
    exec(`"${CMD}" /c start "" "${resolved.uri}"`, err => {
      if (err) console.warn('[spotify] URI open warning:', err.message)
    })

    // Poll until the window title changes to the new track (up to 7s).
    // We require the title to differ from prevTitle — this is the key fix:
    // a title matching the old track means Spotify hasn't switched yet.
    const deadline = Date.now() + 7000
    let confirmed = false
    while (Date.now() < deadline) {
      await new Promise(r => setTimeout(r, 300))
      try {
        const { stdout } = await runPS(PS_GET_TITLE)
        const win = stdout.trim()
        const titleChanged = win !== prevTitle
        const isRealTrack  = win !== '' && win !== 'Spotify'
        if (titleChanged && isRealTrack) {
          confirmed = true
          console.log('[spotify] new track confirmed:', JSON.stringify(win))
          break
        }
      } catch { /* keep polling */ }
    }

    if (!confirmed) {
      // Spotify has the URI but hasn't auto-played — nudge with play key
      console.warn('[spotify] track switch not detected, sending play key')
      await runPS(PS_SEND_PLAY).catch(() => { })
    }

    return { durationMs: resolved.durationMs }
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
        // Opening a Spotify URI automatically stops the current track and starts
        // the new one. ctrl().play() polls until the title confirms playback.
        // Do NOT send a resume/toggle after — Spotify is already playing by the
        // time play() returns, and a toggle would immediately pause it.
        return await ctrl().play(artist, title)
      } catch (err) {
        console.error('[Spotify Main] Failed to play:', err)
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