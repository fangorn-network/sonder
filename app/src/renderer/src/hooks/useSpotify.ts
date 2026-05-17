/**
 * useSpotify.ts
 *
 * Spotify playback hook. Token lifecycle is handled here and in ConnectorsView —
 * both read/write the same localStorage keys so they stay in sync automatically.
 *
 * Token storage keys (shared with ConnectorsView):
 *   sond3r:spotify:tokens       { accessToken, refreshToken, expiresAt, scope }
 *   sond3r:spotify:credentials  { clientId, clientSecret }
 *
 * connect() runs the same PKCE flow as ConnectorsView via
 * window.electron.ipcRenderer.invoke('spotify:oauth', ...) —
 * no custom preload entry needed, uses the standard electron-toolkit shape.
 */

import { useCallback, useEffect, useRef, useState } from 'react'

// ─── Token types (aligned with ConnectorsView) ────────────────────────────────

interface SpotifyTokens {
  accessToken: string
  refreshToken: string
  expiresAt: number   // unix ms
  scope: string
}

interface SpotifyCredentials {
  clientId: string
  clientSecret: string
  redirectUri?: string  // saved by ConnectorsView; falls back to default if absent
}

// ─── Playback state ───────────────────────────────────────────────────────────

interface SpotifyState {
  connected: boolean
  connecting: boolean
  error: string | null
  deviceId: string | null
  isPlaying: boolean
  currentTrack: {
    name: string
    artist: string
    albumArt: string
    durationMs: number
    progressMs: number
    spotifyTrackId: string | null
  } | null
}

interface UseSpotifyOptions {
  onTrackEnd?: () => void
}

// ─── Storage keys (must match ConnectorsView) ─────────────────────────────────

const SK_TOKENS  = 'sond3r:spotify:tokens'
const SK_CREDS   = 'sond3r:spotify:credentials'

// ─── Spotify OAuth constants ──────────────────────────────────────────────────

const DEFAULT_REDIRECT_URI = 'http://localhost:8080/callback'

const SPOTIFY_SCOPES = [
  'user-read-playback-state',
  'user-modify-playback-state',
  'user-read-currently-playing',
  'streaming',
  'playlist-read-private',
  'playlist-read-collaborative',
  'user-library-read',
  'user-top-read',
  'user-read-recently-played',
].join(' ')

// ─── PKCE helpers ─────────────────────────────────────────────────────────────
// Duplicated from ConnectorsView to keep the hook self-contained.
// Extract to src/utils/pkce.ts if you want a single source of truth.

function b64url(buf: Uint8Array): string {
  return btoa(String.fromCharCode(...buf))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}
async function makeVerifier(): Promise<string> {
  const a = new Uint8Array(32); crypto.getRandomValues(a); return b64url(a)
}
async function makeChallenge(v: string): Promise<string> {
  return b64url(new Uint8Array(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(v))
  ))
}
function makeState(): string {
  const a = new Uint8Array(16); crypto.getRandomValues(a); return b64url(a)
}

// ─── Storage helpers ──────────────────────────────────────────────────────────

function readTokens(): SpotifyTokens | null {
  try { const r = localStorage.getItem(SK_TOKENS); return r ? JSON.parse(r) : null }
  catch { return null }
}

function writeTokens(t: SpotifyTokens): void {
  localStorage.setItem(SK_TOKENS, JSON.stringify(t))
}

function readCreds(): SpotifyCredentials | null {
  try { const r = localStorage.getItem(SK_CREDS); return r ? JSON.parse(r) : null }
  catch { return null }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useSpotify({ onTrackEnd }: UseSpotifyOptions = {}) {
  const onTrackEndRef      = useRef(onTrackEnd)
  const userPausedRef      = useRef(false)
  const wasPlayingRef      = useRef(false)
  const transitioningRef   = useRef(false)
  const pollRef            = useRef<ReturnType<typeof setInterval> | null>(null)
  const lastPollTimeRef    = useRef<number>(Date.now())
  const isPlayingRef       = useRef(false)
  const inFlightRef        = useRef(false)
  const tokensRef          = useRef<SpotifyTokens | null>(null)

  useEffect(() => { onTrackEndRef.current = onTrackEnd }, [onTrackEnd])

  const [tokens, setTokensState] = useState<SpotifyTokens | null>(readTokens)
  const [state, setState] = useState<SpotifyState>({
    connected: false,
    connecting: false,
    error: null,
    deviceId: null,
    isPlaying: false,
    currentTrack: null,
  })

  // Keep ref in sync so callbacks don't close over stale tokens
  useEffect(() => { tokensRef.current = tokens }, [tokens])
  useEffect(() => { isPlayingRef.current = state.isPlaying }, [state.isPlaying])

  const persistTokens = useCallback((t: SpotifyTokens) => {
    writeTokens(t)
    setTokensState(t)
  }, [])

  // ── Listen for tokens written by ConnectorsView ────────────────────────────
  // When the user connects Spotify from the Connectors panel, this hook
  // hydrates automatically without needing a page reload.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== SK_TOKENS) return
      const t = readTokens()
      if (t) {
        setTokensState(t)
        setState(s => ({ ...s, connected: true, error: null }))
      } else {
        setTokensState(null)
        setState(s => ({ ...s, connected: false }))
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  // ── Token refresh ──────────────────────────────────────────────────────────

  const refreshTokens = useCallback(async (): Promise<SpotifyTokens> => {
    const current = tokensRef.current
    if (!current) throw new Error('Not connected to Spotify')

    const creds = readCreds()
    if (!creds) throw new Error('Spotify credentials not configured')

    const res = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${btoa(`${creds.clientId}:${creds.clientSecret}`)}`,
      },
      body: new URLSearchParams({
        grant_type:    'refresh_token',
        refresh_token: current.refreshToken,
        client_id:     creds.clientId,
      }),
    })

    if (!res.ok) {
      const b = await res.json().catch(() => ({}))
      throw new Error(b.error_description ?? `Token refresh failed (${res.status})`)
    }

    const data = await res.json()
    const next: SpotifyTokens = {
      accessToken:  data.access_token,
      refreshToken: data.refresh_token ?? current.refreshToken,  // Spotify may rotate
      expiresAt:    Date.now() + data.expires_in * 1000,
      scope:        data.scope ?? current.scope,
    }
    persistTokens(next)
    return next
  }, [persistTokens])

  // ── getToken — returns a valid access token, refreshing if needed ──────────

  const getToken = useCallback(async (): Promise<string> => {
    const t = tokensRef.current
    if (!t) throw new Error('Not connected to Spotify')
    if (Date.now() < t.expiresAt - 60_000) return t.accessToken
    const refreshed = await refreshTokens()
    return refreshed.accessToken
  }, [refreshTokens])

  // ── spotifyFetch ───────────────────────────────────────────────────────────

  const spotifyFetch = useCallback(async (
    path: string,
    method = 'GET',
    body?: any,
    retries = 2,
  ): Promise<{ status: number; data: any }> => {
    const token = await getToken()
    const { status, body: text } = await (window as any).electron.ipcRenderer.invoke(
      'spotify:api',
      { url: `https://api.spotify.com${path}`, method, token, body },
    )

    if (status === 429 && retries > 0) {
      await new Promise(r => setTimeout(r, 1000))
      return spotifyFetch(path, method, body, retries - 1)
    }

    try {
      return { status, data: text ? JSON.parse(text) : {} }
    } catch {
      return { status, data: {} }
    }
  }, [getToken])

  // ── Playback state processing ──────────────────────────────────────────────

  const processPlaybackState = useCallback((data: any) => {
    if (!data?.item) return

    const isPlaying: boolean = data.is_playing

    if (transitioningRef.current) {
      if (isPlaying) {
        transitioningRef.current = false
        wasPlayingRef.current = true
      }
      setState(s => ({
        ...s,
        connected: true,
        isPlaying,
        deviceId: data.device?.id ?? s.deviceId,
        currentTrack: {
          name:           data.item.name,
          artist:         data.item.artists.map((a: any) => a.name).join(', '),
          albumArt:       data.item.album.images[0]?.url ?? '',
          durationMs:     data.item.duration_ms,
          progressMs:     data.progress_ms,
          spotifyTrackId: data.item.id ?? null,
        },
      }))
      return
    }

    if (wasPlayingRef.current && !isPlaying && !userPausedRef.current) {
      onTrackEndRef.current?.()
    }
    wasPlayingRef.current = isPlaying

    setState(s => ({
      ...s,
      connected: true,
      isPlaying,
      deviceId: data.device?.id ?? s.deviceId,
      currentTrack: {
        name:           data.item.name,
        artist:         data.item.artists.map((a: any) => a.name).join(', '),
        albumArt:       data.item.album.images[0]?.url ?? '',
        durationMs:     data.item.duration_ms,
        progressMs:     data.progress_ms,
        spotifyTrackId: data.item.id ?? null,
      },
    }))
  }, [])

  // ── Polling ────────────────────────────────────────────────────────────────

  const forcePoll = useCallback(async () => {
    if (inFlightRef.current) return
    inFlightRef.current = true
    try {
      const { status, data } = await spotifyFetch('/v1/me/player')
      if (status === 204 || status === 202 || !data?.item) return
      lastPollTimeRef.current = Date.now()
      processPlaybackState(data)
    } catch { /* swallow */ } finally {
      inFlightRef.current = false
    }
  }, [spotifyFetch, processPlaybackState])

  const pollPlayback = useCallback(async () => {
    if (inFlightRef.current) return
    if (!isPlayingRef.current && !transitioningRef.current) return
    inFlightRef.current = true
    try {
      const { status, data } = await spotifyFetch('/v1/me/player')
      if (status === 204 || status === 202 || !data?.item) return
      lastPollTimeRef.current = Date.now()
      processPlaybackState(data)
    } catch { /* swallow */ } finally {
      inFlightRef.current = false
    }
  }, [spotifyFetch, processPlaybackState])

  // Start polling when tokens become available
  useEffect(() => {
    if (!tokens) return
    setState(s => ({ ...s, connected: true }))
    forcePoll()   // forcePoll bypasses the isPlaying guard — we need the initial device state
    pollRef.current = setInterval(pollPlayback, 30_000)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [tokens?.accessToken]) // eslint-disable-line react-hooks/exhaustive-deps

  // Pause polling when tab is hidden
  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) {
        if (pollRef.current) clearInterval(pollRef.current)
      } else {
        pollPlayback()
        pollRef.current = setInterval(pollPlayback, 30_000)
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [pollPlayback])

  // ── connect — PKCE OAuth via Electron BrowserWindow ───────────────────────
  // Same flow as ConnectorsView. Tokens land in the same localStorage key
  // so both stay in sync without any coordination needed.

  const connect = useCallback(async () => {
    const creds = readCreds()
    if (!creds) {
      setState(s => ({ ...s, error: 'Configure Spotify credentials in the Connectors panel first.' }))
      return
    }

    setState(s => ({ ...s, connecting: true, error: null }))

    try {
      const verifier  = await makeVerifier()
      const challenge = await makeChallenge(verifier)
      const state_    = makeState()
      const redir     = creds.redirectUri || DEFAULT_REDIRECT_URI

      const authUrl = 'https://accounts.spotify.com/authorize?' + new URLSearchParams({
        client_id:             creds.clientId,
        response_type:         'code',
        redirect_uri:          redir,
        state:                 state_,
        scope:                 SPOTIFY_SCOPES,
        code_challenge_method: 'S256',
        code_challenge:        challenge,
      })

      const callbackUrl: string = await (window as any).electron.ipcRenderer.invoke('spotify:oauth', authUrl, redir)
      const url  = new URL(callbackUrl)
      const code = url.searchParams.get('code')
      const err  = url.searchParams.get('error')

      if (err)                                      throw new Error(`Spotify denied: ${err}`)
      if (url.searchParams.get('state') !== state_) throw new Error('State mismatch')
      if (!code)                                    throw new Error('No authorization code returned')

      const res = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type:    'authorization_code',
          code,
          redirect_uri:  redir,
          client_id:     creds.clientId,
          code_verifier: verifier,
        }),
      })

      if (!res.ok) {
        const b = await res.json().catch(() => ({}))
        throw new Error(b.error_description ?? `Token exchange failed (${res.status})`)
      }

      const data = await res.json()
      const t: SpotifyTokens = {
        accessToken:  data.access_token,
        refreshToken: data.refresh_token,
        expiresAt:    Date.now() + data.expires_in * 1000,
        scope:        data.scope ?? '',
      }
      persistTokens(t)
      setState(s => ({ ...s, connected: true, connecting: false, error: null }))
    } catch (e: any) {
      const msg = e?.message ?? 'OAuth failed'
      if (msg !== 'auth_cancelled') {
        setState(s => ({ ...s, connecting: false, error: msg }))
      } else {
        setState(s => ({ ...s, connecting: false }))
      }
    }
  }, [persistTokens])

  // ── Playback controls ──────────────────────────────────────────────────────

  const getDevices = useCallback(async () => {
    const { data } = await spotifyFetch('/v1/me/player/devices')
    return (data.devices ?? []) as { id: string; name: string; is_active: boolean }[]
  }, [spotifyFetch])

  const play = useCallback(async (spotifyUri?: string) => {
    userPausedRef.current  = false
    wasPlayingRef.current  = false
    transitioningRef.current = true

    let deviceId = state.deviceId
    if (!deviceId) {
      const devices = await getDevices()
      if (devices.length === 0) {
        transitioningRef.current = false
        throw new Error('No active Spotify device. Open Spotify on any device first.')
      }
      const active = devices.find(d => d.is_active) ?? devices[0]
      deviceId = active.id
    }

    await spotifyFetch('/v1/me/player', 'PUT', { device_ids: [deviceId], play: false })
    await new Promise(r => setTimeout(r, 1000))

    const { status: playStatus } = await spotifyFetch('/v1/me/player/play', 'PUT', {
      device_id: deviceId,
      ...(spotifyUri ? { uris: [spotifyUri] } : {}),
    })

    // 204 = success; 202 = accepted (device waking); anything else is an error
    if (playStatus >= 400) {
      transitioningRef.current = false
      throw new Error(`Spotify play failed (${playStatus}). Is Spotify open on a device?`)
    }

    // Poll a few times to clear the transition guard once Spotify confirms is_playing
    const attempts = [600, 1200, 2000, 3500, 5000]
    attempts.forEach(delay => setTimeout(() => { if (transitioningRef.current) forcePoll() }, delay))

    // Safety: clear guard after 6s regardless
    setTimeout(() => {
      if (transitioningRef.current) {
        transitioningRef.current = false
        console.warn('[useSpotify] transition guard timed out')
      }
    },  3000)
  }, [spotifyFetch, getDevices, forcePoll, state.deviceId])

  const pause = useCallback(async () => {
    userPausedRef.current    = true
    transitioningRef.current = false
    await spotifyFetch('/v1/me/player/pause', 'PUT')
    setTimeout(() => forcePoll(), 500)
  }, [spotifyFetch, forcePoll])

  const togglePlay = useCallback(async () => {
    if (state.isPlaying) await pause()
    else await play()
  }, [state.isPlaying, play, pause])

  const next = useCallback(async () => {
    wasPlayingRef.current    = false
    transitioningRef.current = true
    await spotifyFetch('/v1/me/player/next', 'POST')
    setTimeout(() => forcePoll(), 500)
    setTimeout(() => { if (transitioningRef.current) forcePoll() }, 1500)
    setTimeout(() => { transitioningRef.current = false }, 4000)
  }, [spotifyFetch, forcePoll])

  const prev = useCallback(async () => {
    wasPlayingRef.current    = false
    transitioningRef.current = true
    await spotifyFetch('/v1/me/player/previous', 'POST')
    setTimeout(() => forcePoll(), 500)
    setTimeout(() => { if (transitioningRef.current) forcePoll() }, 1500)
    setTimeout(() => { transitioningRef.current = false }, 4000)
  }, [spotifyFetch, forcePoll])

  const seek = useCallback(async (positionMs: number) => {
    await spotifyFetch(`/v1/me/player/seek?position_ms=${Math.round(positionMs)}`, 'PUT')
  }, [spotifyFetch])

  const setVolume = useCallback(async (pct: number) => {
    await spotifyFetch(`/v1/me/player/volume?volume_percent=${Math.round(pct)}`, 'PUT')
  }, [spotifyFetch])

  const fetchAlbumArt = useCallback(async (query: string): Promise<string | null> => {
    const { data } = await spotifyFetch(`/v1/search?q=${encodeURIComponent(query)}&type=track&limit=1`)
    return data.tracks?.items?.[0]?.album.images[0]?.url ?? null
  }, [spotifyFetch])

  const searchAndPlay = useCallback(async (query: string) => {
    const clean = query.replace(/\(.*?\)/g, '').trim()
    const { data } = await spotifyFetch(`/v1/search?q=${encodeURIComponent(clean)}&type=track&limit=1`)
    const item = data.tracks?.items?.[0]
    if (!item) throw new Error(`No Spotify results for "${clean}"`)
    await play(item.uri)
    return {
      uri:      item.uri,
      name:     item.name,
      artist:   item.artists.map((a: any) => a.name).join(', '),
      albumArt: item.album.images[0]?.url ?? '',
    }
  }, [spotifyFetch, play])

  const disconnect = useCallback(() => {
    localStorage.removeItem(SK_TOKENS)
    setTokensState(null)
    transitioningRef.current = false
    wasPlayingRef.current    = false
    setState({
      connected: false, connecting: false, error: null,
      deviceId: null, isPlaying: false, currentTrack: null,
    })
  }, [])

  // ── Public interface ───────────────────────────────────────────────────────

  return {
    ...state,
    lastPollTime: lastPollTimeRef.current,
    connect,
    disconnect,
    play,
    pause,
    togglePlay,
    next,
    prev,
    seek,
    setVolume,
    fetchAlbumArt,
    searchAndPlay,
    spotifyFetch,
  }
}