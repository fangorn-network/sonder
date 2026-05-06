import { useCallback, useEffect, useRef, useState } from 'react'
import { useOAuthTokens } from '@privy-io/react-auth'

const STORAGE_KEY = 'spotify_tokens'

interface SpotifyTokens {
    access_token: string
    refresh_token: string
    expires_at: number
}

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
    } | null
}

interface UseSpotifyOptions {
    onTrackEnd?: () => void
}

export function useSpotify({ onTrackEnd }: UseSpotifyOptions = {}) {
    const onTrackEndRef = useRef(onTrackEnd)
    useEffect(() => { onTrackEndRef.current = onTrackEnd }, [onTrackEnd])

    const userPausedRef = useRef(false)
    const wasPlayingRef = useRef(false)
    const [tokens, setTokens] = useState<SpotifyTokens | null>(() => {
        try {
            const raw = localStorage.getItem(STORAGE_KEY)
            return raw ? JSON.parse(raw) : null
        } catch {
            return null
        }
    })

    const [state, setState] = useState<SpotifyState>({
        connected: false,
        connecting: false,
        error: null,
        deviceId: null,
        isPlaying: false,
        currentTrack: null,
    })

    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
    const tokensRef = useRef(tokens)
    const lastPollTimeRef = useRef<number>(Date.now())
    const isPlayingRef = useRef(state.isPlaying)
    const inFlightRef = useRef(false)

    useEffect(() => { tokensRef.current = tokens }, [tokens])
    useEffect(() => { isPlayingRef.current = state.isPlaying }, [state.isPlaying])

    const saveTokens = useCallback((t: SpotifyTokens) => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(t))
        setTokens(t)
    }, [])

    const { reauthorize } = useOAuthTokens({
        onOAuthTokenGrant: ({ oAuthTokens }) => {
            if (oAuthTokens.provider !== 'spotify') return
            const t: SpotifyTokens = {
                access_token: oAuthTokens.accessToken,
                refresh_token: oAuthTokens.refreshToken ?? '',
                expires_at: Date.now() + (oAuthTokens.accessTokenExpiresInSeconds ?? 0) * 1000,
            }
            saveTokens(t)
            setState(s => ({ ...s, connected: true, connecting: false, error: null }))
        }
    })

    const getToken = useCallback(async (): Promise<string> => {
        const t = tokensRef.current
        if (!t) throw new Error('Not connected to Spotify')
        if (Date.now() < t.expires_at - 60_000) return t.access_token
        await reauthorize({ provider: 'spotify' })
        return tokensRef.current!.access_token
    }, [reauthorize])

    const spotifyFetch = useCallback(async (
        path: string,
        method = 'GET',
        body?: any,
        retries = 2
    ): Promise<{ status: number; data: any }> => {
        const token = await getToken()
        const { status, body: text } = await (window.api as any).spotifyApi({
            url: `https://api.spotify.com${path}`,
            method,
            token,
            body
        })

        if (status === 429 && retries > 0) {
            const retryAfter = parseInt('1', 10)
            await new Promise(r => setTimeout(r, retryAfter * 1000))
            return spotifyFetch(path, method, body, retries - 1)
        }

        try {
            const data = text ? JSON.parse(text) : {}
            return { status, data }
        } catch {
            return { status, data: {} }
        }
    }, [getToken])

    // forcePoll — bypasses isPlaying guard, used right after play()
    const forcePoll = useCallback(async () => {
        if (inFlightRef.current) return

        inFlightRef.current = true

        try {
            const { status, data } = await spotifyFetch('/v1/me/player')
            if (status === 204 || status === 202 || !data?.item) return
            lastPollTimeRef.current = Date.now()
            setState(s => ({
                ...s,
                connected: true,
                isPlaying: data.is_playing,
                deviceId: data.device?.id ?? s.deviceId,
                currentTrack: {
                    name: data.item.name,
                    artist: data.item.artists.map((a: any) => a.name).join(', '),
                    albumArt: data.item.album.images[0]?.url ?? '',
                    durationMs: data.item.duration_ms,
                    progressMs: data.progress_ms,
                }
            }))
            if (wasPlayingRef.current && !data.is_playing && !userPausedRef.current) {
                onTrackEndRef.current?.()
            }
            wasPlayingRef.current = data.is_playing
        } catch {
            // swallow
        } finally {
            inFlightRef.current = false
        }
    }, [spotifyFetch])

    const pollPlayback = useCallback(async () => {
        if (inFlightRef.current) return
        if (!isPlayingRef.current) return
        inFlightRef.current = true
        try {
            const { status, data } = await spotifyFetch('/v1/me/player')
            if (status === 204 || status === 202 || !data?.item) return
            lastPollTimeRef.current = Date.now()
            setState(s => ({
                ...s,
                connected: true,
                isPlaying: data.is_playing,
                deviceId: data.device?.id ?? s.deviceId,
                currentTrack: {
                    name: data.item.name,
                    artist: data.item.artists.map((a: any) => a.name).join(', '),
                    albumArt: data.item.album.images[0]?.url ?? '',
                    durationMs: data.item.duration_ms,
                    progressMs: data.progress_ms,
                }
            }))
            // detect natural track end (not user pause)
            if (wasPlayingRef.current && !data.is_playing && !userPausedRef.current) {
                onTrackEndRef.current?.()
            }
            wasPlayingRef.current = data.is_playing
        } catch {
            // swallow
        } finally {
            inFlightRef.current = false
        }
    }, [spotifyFetch])

    useEffect(() => {
        if (!tokens) return
        setState(s => ({ ...s, connected: true }))
        pollPlayback()
        pollRef.current = setInterval(pollPlayback, 30_000)
        return () => { if (pollRef.current) clearInterval(pollRef.current) }
    }, [tokens?.access_token])

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

    const connect = useCallback(async () => {
        setState(s => ({ ...s, connecting: true, error: null }))
        try {
            await reauthorize({ provider: 'spotify' })
        } catch (e: any) {
            setState(s => ({ ...s, connecting: false, error: e.message }))
        }
    }, [reauthorize])

    const getDevices = useCallback(async () => {
        const { data } = await spotifyFetch('/v1/me/player/devices')
        return (data.devices ?? []) as { id: string; name: string; is_active: boolean }[]
    }, [spotifyFetch])

    const play = useCallback(async (spotifyUri?: string) => {
        userPausedRef.current = false
        let deviceId = state.deviceId
        if (!deviceId) {
            const devices = await getDevices()
            if (devices.length === 0) {
                setState(s => ({ ...s, error: 'No active Spotify device. Open Spotify on any device first.' }))
                return
            }
            const activeDevice = devices.find(d => d.is_active) ?? devices[0]
            deviceId = activeDevice.id
        }

        // transfer playback to device first
        await spotifyFetch('/v1/me/player', 'PUT', {
            device_ids: [deviceId],
            play: false,
        })

        await new Promise(r => setTimeout(r, 500))

        const { status } = await spotifyFetch('/v1/me/player/play', 'PUT', {
            device_id: deviceId,
            ...(spotifyUri ? { uris: [spotifyUri] } : {})
        })
        console.log('play status:', status)

        // force poll bypasses isPlaying guard so PlayerBar appears immediately
        setTimeout(() => forcePoll(), 600)
    }, [spotifyFetch, getDevices, forcePoll, state.deviceId])

    const pause = useCallback(async () => {
        userPausedRef.current = true  // ← mark as user-initiated
        await spotifyFetch('/v1/me/player/pause', 'PUT')
        setTimeout(() => forcePoll(), 500)
    }, [spotifyFetch, forcePoll])

    const togglePlay = useCallback(async () => {
        if (state.isPlaying) await pause()
        else await play()
    }, [state.isPlaying, play, pause])

    const next = useCallback(async () => {
        await spotifyFetch('/v1/me/player/next', 'POST')
        setTimeout(() => forcePoll(), 500)
    }, [spotifyFetch, forcePoll])

    const prev = useCallback(async () => {
        await spotifyFetch('/v1/me/player/previous', 'POST')
        setTimeout(() => forcePoll(), 500)
    }, [spotifyFetch, forcePoll])

    const seek = useCallback(async (positionMs: number) => {
        await spotifyFetch(`/v1/me/player/seek?position_ms=${Math.round(positionMs)}`, 'PUT')
    }, [spotifyFetch])

    const setVolume = useCallback(async (pct: number) => {
        await spotifyFetch(`/v1/me/player/volume?volume_percent=${Math.round(pct)}`, 'PUT')
    }, [spotifyFetch])

    const fetchAlbumArt = useCallback(async (query: string): Promise<string | null> => {
        const { data } = await spotifyFetch(
            `/v1/search?q=${encodeURIComponent(query)}&type=track&limit=1`
        )
        return data.tracks?.items?.[0]?.album.images[0]?.url ?? null
    }, [spotifyFetch])

    const searchAndPlay = useCallback(async (query: string) => {
        const cleanQuery = query.replace(/\(.*?\)/g, '').trim()
        console.log('searching:', cleanQuery)
        const { data } = await spotifyFetch(
            `/v1/search?q=${encodeURIComponent(cleanQuery)}&type=track&limit=1`
        )
        console.log('search result', JSON.stringify(data))
        const item = data.tracks?.items?.[0]
        if (!item) return null
        await play(item.uri)
        return {
            uri: item.uri,
            name: item.name,
            artist: item.artists.map((a: any) => a.name).join(', '),
            albumArt: item.album.images[0]?.url ?? '',
        }
    }, [spotifyFetch, play])

    const disconnect = useCallback(() => {
        localStorage.removeItem(STORAGE_KEY)
        setTokens(null)
        setState({
            connected: false,
            connecting: false,
            error: null,
            deviceId: null,
            isPlaying: false,
            currentTrack: null,
        })
    }, [])

    return {
        ...state,
        lastPollTime: lastPollTimeRef.current,
        connect,
        disconnect,
        fetchAlbumArt,
        play,
        pause,
        togglePlay,
        next,
        prev,
        seek,
        setVolume,
        searchAndPlay,
        spotifyFetch
    }
}