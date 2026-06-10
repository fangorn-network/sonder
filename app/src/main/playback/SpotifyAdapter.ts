/**
 * main/playback/SpotifyAdapter.ts
 *
 * PlaybackAdapter for Spotify. Controls the already-running Spotify *desktop app*
 * (URI open + MPRIS / AppleScript / PowerShell media keys). Track resolution uses
 * the Spotify Web API with Client Credentials (no user login, no MAU limit).
 *
 * NOTE on transport: the Web API playback-control endpoints (`/v1/me/player/*`) and
 * the Web Playback SDK require a Premium account. For Free accounts the only way to
 * drive playback is the desktop app, which is what this adapter does. `playViaWebApi`
 * is a documented seam for a future Premium path (see play()).
 *
 * .env keys (VITE_ prefix for electron-vite):
 *   VITE_SPOTIFY_CLIENT_ID=...
 *   VITE_SPOTIFY_CLIENT_SECRET=...
 */

import { shell, net } from 'electron'
import { exec, execFile } from 'child_process'
import { promisify } from 'util'
import * as fs from 'fs'
import type {
  PlaybackAdapter,
  PlaybackStatus,
  PlaybackTrack,
  PlayResult,
} from './types'
import { EMPTY_STATUS } from './types'

const execAsync = promisify(exec)

// ─── Platform detection ───────────────────────────────────────────────────────

function isWSL(): boolean {
  try {
    return fs.readFileSync('/proc/version', 'utf-8').toLowerCase().includes('microsoft')
  } catch {
    return false
  }
}

const IS_WSL = isWSL()
const p = process.platform
const PS = '/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe'

// ─── Client Credentials token (resolution only) ─────────────────────────────────

let _ccToken: string | null = null
let _ccExpiry = 0

async function getClientToken(): Promise<string> {
  if (_ccToken && Date.now() < _ccExpiry) return _ccToken

  // electron-vite statically replaces import.meta.env.VITE_* at build time, so this
  // is safe regardless of when dotenv.config() runs in the main process.
  const clientId     = (import.meta as any).env.VITE_SPOTIFY_CLIENT_ID     ?? ''
  const clientSecret = (import.meta as any).env.VITE_SPOTIFY_CLIENT_SECRET ?? ''

  if (!clientId || !clientSecret) {
    throw new Error('VITE_SPOTIFY_CLIENT_ID / VITE_SPOTIFY_CLIENT_SECRET not set in .env')
  }

  console.log('[spotify] fetching token...')
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
  const res = await net.fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  })
  const text = await res.text()
  console.log('[spotify] token response:', res.status, text.slice(0, 200))
  if (!res.ok) throw new Error(`Spotify token failed: ${res.status} ${text}`)
  const data = JSON.parse(text)
  _ccToken = data.access_token as string
  _ccExpiry = Date.now() + (data.expires_in - 60) * 1000
  console.log('[spotify] token OK')
  return _ccToken
}

// ─── Track resolution ─────────────────────────────────────────────────────────

interface Resolved {
  uri: string
  durationMs: number
  /** Real name/artist from Spotify — used to confirm the desktop app switched to it. */
  name?: string
  artist?: string
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
    track: title.slice(dash + 3).trim(),
  }
}

// ─── Window-title matching (WSL desktop confirmation) ───────────────────────────

/** What track the desktop app should show once it has switched. */
interface Expected {
  title: string
  artist: string
}

function normalizeTitlePart(s: string | null | undefined): string {
  if (!s) return ''
  return s
    .toLowerCase()
    .replace(/\(.*?\)/g, '')
    .replace(/\[.*?\]/g, '')
    .replace(/feat\..*/gi, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function fuzzyIncludes(a: string, b: string): boolean {
  if (!a || !b) return false
  return a === b || a.includes(b) || b.includes(a)
}

/**
 * The Windows Spotify window title is "Artist - Track" while a real track is active,
 * and one of "Spotify" / "Spotify Premium" / "Spotify Free" / "" when idle or paused.
 */
function isRealTrackTitle(win: string): boolean {
  return win.includes(' - ') && !/^spotify( premium| free)?$/i.test(win.trim())
}

/** Does the current window title correspond to the track we asked for? */
function titleMatchesExpected(win: string, expected: Expected): boolean {
  if (!isRealTrackTitle(win)) return false
  const dash = win.indexOf(' - ')
  const winArtist = normalizeTitlePart(win.slice(0, dash))
  const winTitle = normalizeTitlePart(win.slice(dash + 3))
  const expTitle = normalizeTitlePart(expected.title)
  const expArtist = normalizeTitlePart(expected.artist)
  const titleOk = fuzzyIncludes(winTitle, expTitle)
  // Artist is a softer check — some titles render "Track - Artist" or omit it.
  const artistOk = !expArtist || fuzzyIncludes(winArtist, expArtist) || fuzzyIncludes(winTitle, expArtist)
  return titleOk && artistOk
}

async function spotifySearch(token: string, q: string): Promise<Resolved | null> {
  try {
    const res = await net.fetch(
      `https://api.spotify.com/v1/search?q=${encodeURIComponent(q)}&type=track&limit=1`,
      { headers: { Authorization: `Bearer ${token}` } },
    )
    if (!res.ok) return null
    const data = await res.json()
    const track = data.tracks?.items?.[0]
    if (!track) return null
    console.log(`[spotify] found → ${track.uri}  (${track.name} · ${track.artists[0]?.name})`)
    return {
      uri: track.uri as string,
      durationMs: track.duration_ms as number,
      name: track.name as string,
      artist: track.artists?.[0]?.name as string | undefined,
    }
  } catch {
    return null
  }
}

async function resolveTrack(track: PlaybackTrack): Promise<Resolved | null> {
  // Honour an explicit URI hint when present — skip the search entirely.
  if (track.spotifyUri) {
    return { uri: track.spotifyUri, durationMs: track.durationMs ?? 0 }
  }

  try {
    const token = await getClientToken()
    const clean = cleanYoutubeTitle(track.title)
    const parsed = parseYoutubeArtistTitle(clean)
    const channelOrArtist = track.artist

    // Build search queries from most-specific to most-lenient
    const queries: string[] = []

    if (parsed) {
      queries.push(`track:${parsed.track} artist:${parsed.artist}`)
      queries.push(`${parsed.artist} ${parsed.track}`)
    }

    if (channelOrArtist && channelOrArtist !== (parsed?.artist ?? '')) {
      queries.push(`track:${clean} artist:${channelOrArtist}`)
    }

    queries.push(clean)

    for (const q of queries) {
      const result = await spotifySearch(token, q)
      if (result) return result
    }

    console.error(`[spotify] no result after ${queries.length} strategies for: ${track.title}`)
    return null
  } catch (e) {
    console.error('[spotify] resolution failed:', e)
    return null
  }
}

// ─── PowerShell helper ────────────────────────────────────────────────────────

function runPS(script: string): Promise<{ stdout: string; stderr: string }> {
  const args = ['-NoProfile', '-NonInteractive', '-Command', script]
  return new Promise((resolve, reject) => {
    const proc = execFile(PS, args)
    let stdout = ''
    let stderr = ''
    proc.stdout?.on('data', (d: Buffer) => { stdout += d.toString() })
    proc.stderr?.on('data', (d: Buffer) => { stderr += d.toString() })
    proc.on('close', (code: number | null) => {
      if (code !== 0) reject(new Error(stderr || `PS exited ${code}`))
      else resolve({ stdout, stderr })
    })
    proc.on('error', reject)
  })
}

// ─── Per-OS controllers ─────────────────────────────────────────────────────────

interface OsController {
  play(resolved: Resolved, expected: Expected): Promise<PlayResult | null>
  pause(): Promise<void>
  resume(): Promise<void>
  seek(ms: number): Promise<void>
  volume(pct: number): Promise<void>
  status(): Promise<PlaybackStatus>
}

// ─── WSL2 ─────────────────────────────────────────────────────────────────────

const PS_GET_TITLE =
  '$p = Get-Process -Name Spotify -EA SilentlyContinue | ' +
  'Where-Object { $_.MainWindowTitle -ne "" } | ' +
  'Select-Object -First 1; ' +
  'if ($p) { $p.MainWindowTitle } else { "" }'

const PS_SEND_PLAY =
  '$w = New-Object -ComObject WScript.Shell; $w.SendKeys([char]179)'

async function readTitle(): Promise<string> {
  try {
    const { stdout } = await runPS(PS_GET_TITLE)
    return stdout.trim()
  } catch {
    return ''
  }
}

const wsl: OsController = {
  async play(resolved, expected) {
    console.log('[spotify] opening URI:', resolved.uri)

    // Capture the current window title first. Only "Artist - Track" means a real track
    // is active — idle/paused states show "Spotify" / "Spotify Premium" / "Spotify Free".
    const prevTitle = await readTitle()
    const wasPlayingRealTrack = isRealTrackTitle(prevTitle)

    // Only pause when a real track is actually playing — opening a new URI while another
    // track plays can otherwise get queued instead of replacing it. Crucially, we must
    // NOT toggle when idle: media key 179 is a play/pause toggle, so toggling an idle
    // client *starts* whatever was queued (this was the wrong-track bug).
    if (wasPlayingRealTrack) {
      console.log('[spotify] pausing current track before switch, title was:', JSON.stringify(prevTitle))
      await runPS(PS_SEND_PLAY).catch(() => {})
      await new Promise((r) => setTimeout(r, 400))
    }

    // Open the track URI. PowerShell Start-Process is the most reliable way to invoke a
    // Windows URI protocol handler from WSL2 (cmd.exe `start` misbehaves from UNC cwd).
    runPS(`Start-Process '${resolved.uri}'`).catch((err) =>
      console.warn('[spotify] URI open warning:', err?.message),
    )

    // Poll until the window title MATCHES the requested track. Matching the expected
    // title (not merely "changed") is what prevents confirming a different/queued song.
    const deadline = Date.now() + 8000
    let confirmed = false
    let nudged = false
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 300))
      const win = await readTitle()

      if (titleMatchesExpected(win, expected)) {
        confirmed = true
        console.log('[spotify] correct track confirmed:', JSON.stringify(win))
        break
      }

      // If a *different* real track is showing, the URI got queued behind it rather
      // than replacing it — re-issue the URI once to force the switch.
      if (!nudged && isRealTrackTitle(win)) {
        console.warn('[spotify] wrong track showing, re-issuing URI:', JSON.stringify(win))
        runPS(`Start-Process '${resolved.uri}'`).catch(() => {})
        nudged = true
      }
    }

    if (!confirmed) {
      // The URI may have loaded the right track but left it paused — one play nudge.
      const win = await readTitle()
      if (!isRealTrackTitle(win)) {
        console.warn('[spotify] track loaded but not playing, sending play key')
        await runPS(PS_SEND_PLAY).catch(() => {})
      } else {
        console.warn('[spotify] could not confirm requested track; current title:', JSON.stringify(win))
      }
    }

    return { durationMs: resolved.durationMs }
  },

  async pause() {
    await runPS(PS_SEND_PLAY)
  },

  async resume() {
    await runPS(PS_SEND_PLAY)
  },

  async seek(_ms) {},
  async volume(_pct) {},

  async status() {
    const win = await readTitle()
    if (!isRealTrackTitle(win)) return EMPTY_STATUS
    const dash = win.indexOf(' - ')
    return {
      ...EMPTY_STATUS,
      isPlaying: true,
      artist: win.slice(0, dash).trim(),
      title: win.slice(dash + 3).trim(),
    }
  },
}

// ─── Linux — MPRIS2 ───────────────────────────────────────────────────────────

let _dbus: any = null
async function dbus() {
  if (!_dbus) _dbus = await import('dbus-final')
  return _dbus
}

async function mprisPlayer() {
  const db = await dbus()
  const bus = db.sessionBus()
  const obj = await bus.getProxyObject('org.mpris.MediaPlayer2.spotify', '/org/mpris/MediaPlayer2')
  return {
    player: obj.getInterface('org.mpris.MediaPlayer2.Player'),
    props: obj.getInterface('org.freedesktop.DBus.Properties'),
  }
}

const linux: OsController = {
  async play(resolved, _expected) {
    const { player } = await mprisPlayer()
    await player.OpenUri(resolved.uri)
    await new Promise((r) => setTimeout(r, 300))
    await player.Play()
    return { durationMs: resolved.durationMs }
  },
  async pause() { (await mprisPlayer()).player.Pause() },
  async resume() { (await mprisPlayer()).player.Play() },
  async seek(ms) {
    const { player, props } = await mprisPlayer()
    const meta = await props.Get('org.mpris.MediaPlayer2.Player', 'Metadata')
    const trackId = meta.value?.['mpris:trackid']?.value ?? '/'
    await player.SetPosition(trackId, BigInt(ms) * 1000n)
  },
  async volume(pct) {
    const { props } = await mprisPlayer()
    await props.Set('org.mpris.MediaPlayer2.Player', 'Volume', { type: 'd', value: pct / 100 })
  },
  async status() {
    try {
      const { props } = await mprisPlayer()
      const iface = 'org.mpris.MediaPlayer2.Player'
      const [statusVal, metaVal, posVal] = await Promise.all([
        props.Get(iface, 'PlaybackStatus'),
        props.Get(iface, 'Metadata'),
        props.Get(iface, 'Position'),
      ])
      const meta = metaVal.value as Record<string, any>
      return {
        isPlaying: statusVal.value === 'Playing',
        progressMs: Number((posVal.value as bigint) / 1000n),
        durationMs: Number(((meta['mpris:length']?.value ?? 0n) as bigint) / 1000n),
        trackId: (meta['mpris:trackid']?.value as string)?.replace('spotify:track:', '') ?? null,
        title: meta['xesam:title']?.value ?? null,
        artist: (meta['xesam:artist']?.value as string[])?.[0] ?? null,
        thumb: meta['mpris:artUrl']?.value ?? null,
      }
    } catch {
      return EMPTY_STATUS
    }
  },
}

// ─── macOS — AppleScript ──────────────────────────────────────────────────────

function osa(script: string) {
  return execAsync(`osascript -e '${script.replace(/'/g, "'\\''")}'`)
}

const macos: OsController = {
  async play(resolved, _expected) {
    await osa(`tell application "Spotify" to play track "${resolved.uri}"`)
    return { durationMs: resolved.durationMs }
  },
  async pause() { await osa('tell application "Spotify" to pause') },
  async resume() { await osa('tell application "Spotify" to play') },
  async seek(ms) { await osa(`tell application "Spotify" to set player position to ${ms / 1000}`) },
  async volume(pct) { await osa(`tell application "Spotify" to set sound volume to ${Math.round(pct)}`) },
  async status() {
    try {
      const { stdout } = await execAsync(`osascript -e '
        tell application "Spotify"
          return (player state as string) & "|" & player position & "|" & (duration of current track) & "|" & (name of current track) & "|" & (artist of current track) & "|" & (artwork url of current track) & "|" & (id of current track)
        end tell'`)
      const [state, pos, dur, title, artist, thumb, uri] = stdout.trim().split('|')
      return {
        isPlaying: state === 'playing',
        progressMs: Math.round(parseFloat(pos) * 1000),
        durationMs: Math.round(parseFloat(dur) * 1000),
        trackId: uri?.replace('spotify:track:', '') ?? null,
        title: title ?? null,
        artist: artist ?? null,
        thumb: thumb ?? null,
      }
    } catch {
      return EMPTY_STATUS
    }
  },
}

// ─── Windows native ───────────────────────────────────────────────────────────

const windows: OsController = {
  async play(resolved, _expected) {
    await shell.openExternal(resolved.uri)
    return { durationMs: resolved.durationMs }
  },
  async pause() { await shell.openExternal('spotify:pause') },
  async resume() { await shell.openExternal('spotify:play') },
  async seek(_ms) {},
  async volume(_pct) {},
  async status() { return EMPTY_STATUS },
}

function osController(): OsController {
  if (IS_WSL) return wsl
  if (p === 'linux') return linux
  if (p === 'darwin') return macos
  return windows
}

// ─── Adapter ─────────────────────────────────────────────────────────────────

export class SpotifyAdapter implements PlaybackAdapter {
  readonly id = 'spotify'
  readonly label = 'Spotify'

  private os = osController()

  constructor() {
    console.log(`[spotify] adapter ready — platform: ${p}, WSL: ${IS_WSL}`)
  }

  async isAvailable(): Promise<boolean> {
    // Desktop control is attempted on every platform; the desktop app just needs
    // to be installed/running, which we can't cheaply verify here.
    return true
  }

  async play(track: PlaybackTrack): Promise<PlayResult | null> {
    // TODO (Premium): if a user OAuth token with `user-modify-playback-state` exists,
    // try playViaWebApi(resolved.uri) first and fall back to desktop control on 403.
    const resolved = await resolveTrack(track)
    if (!resolved) {
      console.error('[spotify] no URI — cannot play')
      return null
    }
    // Prefer the resolved track's real name/artist for desktop-title confirmation;
    // fall back to the requested values when playing from a raw URI hint.
    const expected: Expected = {
      title: resolved.name ?? track.title,
      artist: resolved.artist ?? track.artist,
    }
    // Opening a Spotify URI stops the current track and starts the new one; the OS
    // controller confirms playback. Do NOT send a resume/toggle after.
    return this.os.play(resolved, expected)
  }

  pause() { return this.os.pause() }
  resume() { return this.os.resume() }
  stop() { return this.os.pause() }
  seek(ms: number) { return this.os.seek(ms) }
  setVolume(pct: number) { return this.os.volume(pct) }
  status(): Promise<PlaybackStatus> { return this.os.status() }
}
