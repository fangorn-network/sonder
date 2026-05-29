import { useEffect, useMemo, useRef, useState } from 'react'
import { useSpotify } from '../hooks/useSpotifyContext'
import type { Track } from '../types'
import type { PlaybackState } from '../types/playback'
import './NowPlaying.css'
import { PublishModal } from './PublishModal'
import { useFangorn } from '../hooks/useFangorn'
import { TrackTagModal } from './TrackTag'
import { computeTrackId } from '../lib/trackId'
import { useSpotifyContext } from '../context/SpotifyContext'

const CHROMA_URL = (import.meta as any).env.VITE_CHROMA_URL ?? 'http://localhost:8080'

function fmtTime(ms: number) {
    if (!ms || !isFinite(ms)) return '0:00'
    const s = Math.floor(ms / 1000)
    return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`
}

interface NetworkTags {
    genres: string[]
    moods: string[]
    themes: string[]
    contexts: string[]
}

// ── Kernel types (local — no cross-module import needed yet) ──────────────────

interface KernelState {
    sigma: number    // spread: low = locked-in, high = exploratory
}

interface HistoryTrack {
    genres:    string[]
    moods:     string[]
    themes?:   string[]
    contexts?: string[]
}

// ── API helpers ───────────────────────────────────────────────────────────────

async function fetchTrackFromChroma(
    tagTrackId: string, title: string, artist: string,
): Promise<{ exists: boolean; tags: NetworkTags | null }> {
    try {
        const q = encodeURIComponent(`${artist} ${title}`)
        const res = await fetch(`${CHROMA_URL}/search?q=${q}&n_results=5`)
        if (!res.ok) return { exists: false, tags: null }
        const data = await res.json()
        const hit = (data.results ?? []).find((h: any) => {
            const f = h.fields ?? {}
            if (f.trackId === tagTrackId) return true
            const hTitle  = (f.title ?? f.name ?? '').toLowerCase()
            const hArtist = (f.byArtist ?? f.artist ?? '').toLowerCase()
            return hTitle === title.toLowerCase() && hArtist === artist.toLowerCase()
        })
        if (!hit) return { exists: false, tags: null }
        const f = hit.fields ?? {}
        const tags: NetworkTags = {
            genres: Array.isArray(f.genres) ? f.genres : [],
            moods:  Array.isArray(f.moods)  ? f.moods  : [],
            themes: Array.isArray(f.themes) ? f.themes : [],
            contexts: Array.isArray(f.contexts) ? f.contexts : [],
        }
        return { exists: true, tags: Object.values(tags).some(a => a.length) ? tags : null }
    } catch { return { exists: false, tags: null } }
}

async function embedTrack(artist: string, title: string): Promise<number[] | null> {
    try {
        const res = await fetch(`${CHROMA_URL}/embed`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: `${artist} - ${title}` }),
        })
        if (!res.ok) return null
        return (await res.json()).embedding ?? null
    } catch { return null }
}

async function fetchSimilarTracks(
    embedding: number[], excludeId: string,
    excludeTitle: string, excludeArtist: string, n = 10,
): Promise<SimilarTrack[]> {
    try {
        const res = await fetch(`${CHROMA_URL}/search/vector`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ embedding, n_results: n + 20 }),
        })
        if (!res.ok) return []
        const data = await res.json()
        const seen = new Set<string>()
        return (data.results ?? [])
            .map((h: any) => parseHit(h))
            .filter((t: SimilarTrack) => {
                if (excludeId && t.id === excludeId) return false
                if (t.title.toLowerCase() === excludeTitle.toLowerCase() &&
                    t.artist.toLowerCase() === excludeArtist.toLowerCase()) return false
                if (seen.has(t.id)) return false
                seen.add(t.id); return true
            })
            .slice(0, n)
    } catch { return [] }
}

async function fetchArtistTracks(
    artist: string, excludeId: string, excludeTitle: string, n = 10,
): Promise<SimilarTrack[]> {
    try {
        const params = new URLSearchParams({ q: artist, n_results: String(100) })
        const res = await fetch(`${CHROMA_URL}/search?${params}`)
        if (!res.ok) return []
        const data = await res.json()
        const seen = new Set<string>()
        return (data.results ?? [])
            .map((h: any) => parseHit(h))
            .filter((t: SimilarTrack) => {
                if (t.id === excludeId) return false
                if (t.title.toLowerCase() === excludeTitle.toLowerCase()) return false
                if (t.artist.toLowerCase() !== artist.toLowerCase()) return false
                if (seen.has(t.id)) return false
                seen.add(t.id); return true
            })
            .slice(0, n)
    } catch { return [] }
}

function parseHit(h: any): SimilarTrack {
    const f: Record<string, any> = h.fields ?? {}
    return {
        id: h.id,
        youtubeVideoId: (f.platformId as string) ?? undefined,
        title:  (f.title as string) ?? (f.name as string) ?? 'Unknown',
        artist: (f.byArtist as string) ?? (f.artist as string) ?? '',
        year:   typeof f.datePublished === 'string'
            ? parseInt(f.datePublished.slice(0, 4)) || null
            : (f.year as number) ?? null,
        genre:     Array.isArray(f.genres) ? (f.genres[0] ?? null) : null,
        embedding: h.embedding ?? null,
        score:     h.score ?? null,
    }
}

interface SimilarTrack {
    id: string; youtubeVideoId?: string; title: string; artist: string
    year: number | null; genre: string | null; embedding: number[] | null; score: number | null
}

type RightTab = 'similar' | 'artist'

// ─────────────────────────────────────────────────────────────────────────────
// KernelDriftStrip
//
// A 3px ambient strip. σ controls glow width:
//   tight σ → narrow bright teal peak (locked-in groove)
//   wide  σ → diffuse violet bloom    (exploratory / drifting)
// ─────────────────────────────────────────────────────────────────────────────

function KernelDriftStrip({ sigma }: { sigma: number }) {
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const rafRef    = useRef<number>(0)
    const sigmaRef  = useRef(sigma)
    useEffect(() => { sigmaRef.current = sigma }, [sigma])

    useEffect(() => {
        const canvas = canvasRef.current
        if (!canvas) return
        const sync = () => {
            const dpr = window.devicePixelRatio || 1
            canvas.width  = Math.round(canvas.clientWidth  * dpr)
            canvas.height = Math.round(canvas.clientHeight * dpr)
        }
        const ro = new ResizeObserver(sync)
        ro.observe(canvas); sync()
        return () => ro.disconnect()
    }, [])

    useEffect(() => {
        const canvas = canvasRef.current
        if (!canvas) return
        const ctx = canvas.getContext('2d')!
        let running = true

        const draw = (ts: number) => {
            if (!running) return
            const dpr = window.devicePixelRatio || 1
            const W   = canvas.width / dpr, H = canvas.height / dpr
            const s   = sigmaRef.current
            const pulse = Math.sin(ts * 0.0016) * 0.5 + 0.5

            ctx.clearRect(0, 0, canvas.width, canvas.height)
            ctx.save(); ctx.scale(dpr, dpr)

            const spreadFrac = Math.min(0.92, 0.12 + s * 0.85)
            const halfW = (W / 2) * spreadFrac, cx = W / 2
            const tealness = Math.max(0, 1 - s * 1.2)
            const r = Math.round(167 * (1 - tealness))
            const g = Math.round(139 * (1 - tealness) + 255 * tealness)
            const b = Math.round(250 * (1 - tealness) + 231 * tealness)
            const peak = 0.55 + pulse * 0.28

            const grad = ctx.createLinearGradient(cx - halfW, 0, cx + halfW, 0)
            grad.addColorStop(0,    `rgba(${r},${g},${b},0)`)
            grad.addColorStop(0.35, `rgba(${r},${g},${b},${peak * 0.45})`)
            grad.addColorStop(0.5,  `rgba(${r},${g},${b},${peak})`)
            grad.addColorStop(0.65, `rgba(${r},${g},${b},${peak * 0.45})`)
            grad.addColorStop(1,    `rgba(${r},${g},${b},0)`)
            ctx.fillStyle = grad; ctx.fillRect(0, 0, W, H)
            ctx.restore()

            rafRef.current = requestAnimationFrame(draw)
        }
        rafRef.current = requestAnimationFrame(draw)
        return () => { running = false; cancelAnimationFrame(rafRef.current) }
    }, [])

    return <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: '3px', flexShrink: 0 }}/>
}

// ─────────────────────────────────────────────────────────────────────────────
// WaveformRibbon
//
// Kernel-reactive waveform. Amplitude = kernel probability of current track:
//   prob → 1.0 : tall vivid teal  (kernel wants this)
//   prob → 0.0 : flat grey        (kernel is cold on it)
//
// Uses sin-wave simulation now. Wire `analyserNode` from SpotifyContext
// when the audio element is accessible to get real FFT data.
// ─────────────────────────────────────────────────────────────────────────────

function WaveformRibbon({
    prob, isPlaying, analyserNode,
}: { prob: number; isPlaying: boolean; analyserNode?: AnalyserNode }) {
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const rafRef    = useRef<number>(0)
    const stateRef  = useRef({ prob, isPlaying, analyserNode })
    const freqRef   = useRef<Uint8Array | null>(null)
    useEffect(() => { stateRef.current = { prob, isPlaying, analyserNode } }, [prob, isPlaying, analyserNode])

    useEffect(() => {
        const canvas = canvasRef.current
        if (!canvas) return
        const sync = () => {
            const dpr = window.devicePixelRatio || 1
            canvas.width  = Math.round(canvas.clientWidth  * dpr)
            canvas.height = Math.round(canvas.clientHeight * dpr)
        }
        const ro = new ResizeObserver(sync)
        ro.observe(canvas); sync()
        return () => ro.disconnect()
    }, [])

    useEffect(() => {
        const canvas = canvasRef.current
        if (!canvas) return
        const ctx = canvas.getContext('2d')!
        let running = true
        const BARS = 52

        const draw = (ts: number) => {
            if (!running) return
            const dpr  = window.devicePixelRatio || 1
            const W    = canvas.width / dpr, H = canvas.height / dpr
            const { prob: p, isPlaying: playing, analyserNode: an } = stateRef.current

            ctx.clearRect(0, 0, canvas.width, canvas.height)
            ctx.save(); ctx.scale(dpr, dpr)

            // Scrim: dark at bottom, transparent at top
            const scrim = ctx.createLinearGradient(0, 0, 0, H)
            scrim.addColorStop(0, 'rgba(0,0,0,0)')
            scrim.addColorStop(1, 'rgba(0,0,0,0.62)')
            ctx.fillStyle = scrim; ctx.fillRect(0, 0, W, H)

            const barW = W / BARS
            const maxH = H * 0.88
            const amp  = playing ? p : 0.04      // kernel collapses bars when cold
            const colR = Math.round(200 * (1 - p))
            const colG = Math.round(180 * (1 - p) + 255 * p)
            const colB = Math.round(180 * (1 - p) + 231 * p)

            for (let i = 0; i < BARS; i++) {
                let barAmp: number
                if (an && freqRef.current) {
                    an.getByteFrequencyData(freqRef.current as Uint8Array<ArrayBuffer>)
                    barAmp = amp * (freqRef.current[Math.floor((i / BARS) * freqRef.current.length)] / 255)
                } else {
                    const t  = ts * 0.001
                    const f1 = 1.1 + (i / BARS) * 2.2
                    const f2 = 0.6 + (i / BARS) * 0.9
                    barAmp = amp * (0.45 + 0.35 * Math.sin(t * f1 + i * 0.42) + 0.20 * Math.sin(t * f2 + i * 0.18 + 1.1))
                }
                const bH = Math.max(1, maxH * barAmp)
                const x  = i * barW + barW * 0.12, w = barW * 0.72
                const bg = ctx.createLinearGradient(0, H - bH, 0, H)
                bg.addColorStop(0, `rgba(${colR},${colG},${colB},${0.5 + p * 0.4})`)
                bg.addColorStop(1, `rgba(${colR},${colG},${colB},${0.15 + p * 0.2})`)
                ctx.fillStyle = bg
                ctx.fillRect(x, H - bH, w, bH)
            }

            ctx.restore()
            rafRef.current = requestAnimationFrame(draw)
        }

        if (analyserNode && !freqRef.current)
            freqRef.current = new Uint8Array(analyserNode.frequencyBinCount)

        rafRef.current = requestAnimationFrame(draw)
        return () => { running = false; cancelAnimationFrame(rafRef.current) }
    }, [analyserNode])

    return <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: '48px', flexShrink: 0 }}/>
}

// ── NowPlayingProps ───────────────────────────────────────────────────────────

interface NowPlayingProps {
    onCollapse:     () => void
    lastPollTime?:  number
    track?:         Track
    trackColor?:    string
    onFilter?:      (type: 'genre' | 'mood' | 'context', value: string) => void
    onCallAgent?:   (query?: string) => void
    onTrackSelect?: (track: Track, color?: string) => void
    onPlay?:        (track: Track) => Promise<void>
    playbackState?: PlaybackState
    onAnalyze?:     (track: Track) => void
    // ── Kernel additions ──────────────────────────────────────────────────────
    kernelState?:       KernelState              // { sigma } from Zustand store
    currentTrackProb?:  number                   // kernel prob for the playing track
    playHistory?:       HistoryTrack[]           // for tag-heat; newest first
    analyserNode?:      AnalyserNode             // Web Audio node from SpotifyContext
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

export function NowPlaying({
    onCollapse, track: propTrack, trackColor, onTrackSelect, onPlay,
    playbackState, onAnalyze,
    kernelState, currentTrackProb = 0.5, playHistory = [], analyserNode,
}: NowPlayingProps) {
    const {
        currentTitle: ytTitle, currentArtist: ytArtist, currentThumb: ytThumb,
        isPlaying: ytIsPlaying, progressMs: ytProgressMs, durationMs: ytDurationMs,
        pause: ytPause, resume: ytResume, seek: ytSeek,
    } = useSpotifyContext()

    const { fangorn, address } = useFangorn()

    const focusTrack: Track | null = propTrack ?? (
        ytTitle ? {
            id: '', trackId: '', owner: '', manifestCid: '',
            title: ytTitle, artist: ytArtist ?? '',
            year: null, durationMs: ytDurationMs || null,
        } satisfies Track : null
    )

    const isThisTrackActive = !!ytTitle && ytTitle.toLowerCase() === focusTrack?.title.toLowerCase()

    const [liveProgressMs, setLiveProgressMs] = useState(0)
    const [albumArt,       setAlbumArt]       = useState<string | null>(null)
    const [activeTab,      setActiveTab]      = useState<RightTab>('similar')
    const [similarTracks,  setSimilarTracks]  = useState<SimilarTrack[]>([])
    const [artistTracks,   setArtistTracks]   = useState<SimilarTrack[]>([])
    const [similarLoading, setSimilarLoading] = useState(false)
    const [artistLoading,  setArtistLoading]  = useState(false)
    const [playLoading,    setPlayLoading]    = useState(false)
    const [playingId,      setPlayingId]      = useState<string | null>(null)
    const [existsInIndex,  setExistsInIndex]  = useState<boolean | null>(null)
    const [showPublish,    setShowPublish]    = useState(false)
    const [tagTrackId,     setTagTrackId]     = useState<string | null>(null)
    const [networkTags,    setNetworkTags]    = useState<NetworkTags | null>(null)
    const [showTagModal,   setShowTagModal]   = useState(false)
    const [modalTrackId,   setModalTrackId]   = useState<string | null>(null)

    // ── Tag heat from play history ─────────────────────────────────────────────
    // Heat = how frequently each tag appeared in recent plays (0–1, normalised).
    // Hot tags render vivid; cold tags render muted.
    const tagHeat = useMemo<Record<string, number>>(() => {
        if (!playHistory.length) return {}
        const counts: Record<string, number> = {}
        for (const t of playHistory) {
            const tags = [
                ...(t.genres ?? []), ...(t.moods ?? []),
                ...(t.themes ?? []), ...(t.contexts ?? []),
            ]
            for (const tag of tags) counts[tag] = (counts[tag] ?? 0) + 1
        }
        const max = Math.max(1, ...Object.values(counts))
        return Object.fromEntries(Object.entries(counts).map(([k, v]) => [k, v / max]))
    }, [playHistory])

    const openTagModal = () => { if (tagTrackId) { setModalTrackId(tagTrackId); setShowTagModal(true) } }

    useEffect(() => {
        if (!focusTrack?.artist || !focusTrack?.title) { setTagTrackId(null); return }
        computeTrackId(focusTrack.artist, focusTrack.title).then(setTagTrackId)
    }, [focusTrack?.artist, focusTrack?.title])

    useEffect(() => {
        if (!tagTrackId || !focusTrack?.title || !focusTrack?.artist) {
            setExistsInIndex(null); setNetworkTags(null); return
        }
        setExistsInIndex(null); setNetworkTags(null)
        fetchTrackFromChroma(tagTrackId, focusTrack.title, focusTrack.artist)
            .then(({ exists, tags }) => { setExistsInIndex(exists); setNetworkTags(tags) })
    }, [tagTrackId, focusTrack?.title, focusTrack?.artist])

    const allTags = networkTags
        ? [...networkTags.genres, ...networkTags.moods, ...networkTags.contexts, ...networkTags.themes]
        : []
    const tagged = allTags.length > 0

    // Album art: YouTube thumb first, fall back to iTunes (CORS ok in Electron with correct CSP)
    useEffect(() => { if (ytThumb) setAlbumArt(ytThumb) }, [ytThumb])
    useEffect(() => {
        if (ytThumb || !focusTrack) return
        const q = encodeURIComponent(`${focusTrack.artist} ${focusTrack.title}`)
        fetch(`https://itunes.apple.com/search?term=${q}&entity=song&limit=3`)
            .then(r => r.json())
            .then(d => {
                const url = d.results?.[0]?.artworkUrl100
                if (url) setAlbumArt(url.replace('100x100bb', '600x600bb'))
            })
            .catch(() => {})
    }, [focusTrack?.title, focusTrack?.artist, ytThumb])

    useEffect(() => { setLiveProgressMs(ytProgressMs) }, [ytProgressMs])

    useEffect(() => {
        if (!focusTrack) return
        setSimilarLoading(true); setSimilarTracks([]);
        (async () => {
            const emb = focusTrack.embedding
                ? Array.from(focusTrack.embedding)
                : await embedTrack(focusTrack.artist, focusTrack.title)
            if (!emb) return
            setSimilarTracks(await fetchSimilarTracks(emb, focusTrack.id || '__none__', focusTrack.title, focusTrack.artist, 10))
        })().finally(() => setSimilarLoading(false))
    }, [focusTrack?.id, focusTrack?.title])

    useEffect(() => {
        if (!focusTrack?.artist) return
        setArtistLoading(true); setArtistTracks([])
        fetchArtistTracks(focusTrack.artist, focusTrack.id || '__none__', focusTrack.title, 10)
            .then(setArtistTracks).finally(() => setArtistLoading(false))
    }, [focusTrack?.artist, focusTrack?.id])

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !showTagModal) onCollapse() }
        window.addEventListener('keydown', onKey)
        document.body.style.overflow = 'hidden'
        return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = '' }
    }, [onCollapse, showTagModal])

    if (!focusTrack) return null

    const durationMs  = ytDurationMs
    const progress    = durationMs > 0 ? liveProgressMs / durationMs : 0
    const accentColor = trackColor ?? 'var(--accent)'
    const showPause   = isThisTrackActive && ytIsPlaying

    function scrubTo(e: React.MouseEvent<HTMLDivElement>) {
        const rect = e.currentTarget.getBoundingClientRect()
        ytSeek(Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)) * durationMs)
    }

    const handlePlayPause = async () => {
        if (isThisTrackActive) { ytIsPlaying ? ytPause() : ytResume(); return }
        if (onPlay && focusTrack) {
            setPlayLoading(true)
            try { await onPlay(focusTrack) } finally { setPlayLoading(false) }
        }
    }

    const handlePlayRow = async (t: SimilarTrack) => {
        setPlayingId(t.id)
        const asTrack: Track = {
            id: t.id, trackId: t.id, owner: '', manifestCid: '',
            title: t.title, artist: t.artist, year: t.year,
            durationMs: null, youtubeVideoId: t.youtubeVideoId,
        }
        onTrackSelect?.(asTrack)
        try { if (onPlay) { await onPlay(asTrack); return } setPlayingId(null) }
        catch { setPlayingId(null) }
    }

    const activeList    = activeTab === 'similar' ? similarTracks : artistTracks
    const activeLoading = activeTab === 'similar' ? similarLoading : artistLoading

    return (
        <div className="np-overlay">
            {albumArt && <div className="np-bg" style={{ backgroundImage: `url(${albumArt})` }}/>}
            <div className="np-bg-scrim"/>

            <div className="np-layout">
                {/* ══ LEFT COL ══ */}
                <div className="np-col-left">
                    <button className="np-collapse" onClick={onCollapse} aria-label="Close">
                        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                            <path d="M18 6L6 18M6 6l12 12"/>
                        </svg>
                    </button>

                    <div className="np-artist-hero">
                        <div className="np-artist-hero-name" style={{ '--np-accent': accentColor } as React.CSSProperties}>
                            {focusTrack.artist}
                        </div>
                        {focusTrack.year && <div className="np-artist-hero-year">{focusTrack.year}</div>}
                    </div>

                    {/* Album art + waveform ribbon overlay */}
                    <div className="np-art-wrap">
                        <div className="np-art">
                            {albumArt
                                ? <img src={albumArt} alt={focusTrack.title} className="np-art-img"/>
                                : <span className="np-art-initial">{focusTrack.title.slice(0, 1).toUpperCase()}</span>
                            }
                            {/* Waveform sits over the bottom of the art.
                                Amplitude = kernel probability — collapses when kernel is cold. */}
                            <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, pointerEvents: 'none' }}>
                                <WaveformRibbon
                                    prob={currentTrackProb}
                                    isPlaying={isThisTrackActive && ytIsPlaying}
                                    analyserNode={analyserNode}
                                />
                            </div>
                        </div>
                    </div>

                    <div className="np-info">
                        <div className="np-name" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            {focusTrack.title}
                            {existsInIndex === false && (
                                <button className="np-publish-btn" onClick={() => setShowPublish(true)} title="Add to Fangorn">
                                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                                        <circle cx="12" cy="12" r="10"/><path d="M12 8v8M8 12h8"/>
                                    </svg>
                                </button>
                            )}
                            {existsInIndex === null && (
                                <span className="upload-spinner" style={{ width: 12, height: 12, borderWidth: 1.5, opacity: 0.4 }}/>
                            )}
                        </div>
                        {focusTrack.durationMs && (
                            <div className="np-duration">{fmtTime(focusTrack.durationMs)}</div>
                        )}
                    </div>

                    {isThisTrackActive && (
                        <div className="np-scrubber-wrap">
                            <div className="np-progress" onClick={scrubTo}>
                                <div className="np-progress-track">
                                    <div style={{ height: '100%', width: `${progress * 100}%`, background: 'rgba(248,113,113,0.7)', borderRadius: 2 }}/>
                                </div>
                            </div>
                            <div className="np-times">
                                <span>{fmtTime(liveProgressMs)}</span>
                                <span>{fmtTime(durationMs)}</span>
                            </div>
                        </div>
                    )}

                    {/* Kernel drift strip — σ width shows how specific/broad your groove is.
                        Teal + narrow = locked-in. Violet + wide = exploring. */}
                    {kernelState && (
                        <KernelDriftStrip sigma={kernelState.sigma}/>
                    )}

                    <div className="np-controls">
                        <button className="np-btn np-btn--skip" disabled style={{ opacity: 0.2 }}>
                            <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6 8.5 6V6z"/></svg>
                        </button>
                        <button
                            className={`np-btn np-btn--play${showPause ? ' np-btn--playing' : ''}`}
                            onClick={handlePlayPause} disabled={playLoading}
                            style={{ background: 'rgba(248,113,113,0.8)' } as React.CSSProperties}
                        >
                            {playLoading
                                ? <span className="upload-spinner" style={{ width: 20, height: 20, borderWidth: 2, borderTopColor: 'var(--bg)' }}/>
                                : showPause
                                    ? <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><rect x="5" y="4" width="4" height="16" rx="1"/><rect x="15" y="4" width="4" height="16" rx="1"/></svg>
                                    : <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M8 5.14v14l11-7-11-7z"/></svg>
                            }
                        </button>
                        <button className="np-btn np-btn--skip" disabled style={{ opacity: 0.2 }}>
                            <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M16 6h2v12h-2zM6 18l8.5-6L6 6v12z"/></svg>
                        </button>
                    </div>

                    {onAnalyze && focusTrack && (
                        <button
                            onClick={() => onAnalyze(focusTrack)}
                            title="View where this track sits in the embedding space"
                            onMouseEnter={e => {
                                const b = e.currentTarget as HTMLButtonElement
                                b.style.background = 'rgba(0,255,231,0.13)'
                                b.style.borderColor = 'rgba(0,255,231,0.4)'
                            }}
                            onMouseLeave={e => {
                                const b = e.currentTarget as HTMLButtonElement
                                b.style.background = 'rgba(0,255,231,0.07)'
                                b.style.borderColor = 'rgba(0,255,231,0.2)'
                            }}
                        >
                            Deep Dive
                        </button>
                    )}
                </div>

                {/* ══ RIGHT COL ══ */}
                <div className="np-col-right">
                    {showTagModal && modalTrackId && (
                        <TrackTagModal
                            trackId={modalTrackId} trackTitle={focusTrack.title}
                            fangorn={fangorn} onClose={() => setShowTagModal(false)}
                            onSave={() => {}} accentColor={accentColor}
                        />
                    )}

                    <div className="np-right-body">
                        {!showPublish && tagTrackId && (
                            <div className="np-tag-section">
                                {tagged ? (
                                    <div className="np-tag-row">
                                        <div className="np-tag-chips">
                                            {allTags.slice(0, 6).map(tag => {
                                                // Tag heat: 0 (cold, unseen in history) → 1 (hot, frequent in history)
                                                const heat = tagHeat[tag] ?? 0
                                                // Opacity 0.45 (cold) → 1.0 (hot); border/bg intensity scales with heat
                                                const opacity   = 0.45 + heat * 0.55
                                                const bgHex     = Math.round(14 + heat * 22).toString(16).padStart(2, '0')
                                                const borderHex = Math.round(40 + heat * 72).toString(16).padStart(2, '0')
                                                return (
                                                    <span key={tag} className="np-tag-chip"
                                                        style={{
                                                            color:       accentColor,
                                                            background:  `${accentColor}${bgHex}`,
                                                            borderColor: `${accentColor}${borderHex}`,
                                                            opacity,
                                                            fontWeight:  heat > 0.55 ? 600 : 400,
                                                            transition:  'opacity 0.4s, font-weight 0.3s',
                                                        }}>
                                                        {tag}
                                                    </span>
                                                )
                                            })}
                                            {allTags.length > 6 && (
                                                <span className="np-tag-chip np-tag-chip--overflow">+{allTags.length - 6}</span>
                                            )}
                                        </div>
                                        <button className="np-tag-edit-btn" onClick={openTagModal} title="Edit tags">
                                            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                                            </svg>
                                        </button>
                                    </div>
                                ) : (
                                    <button className="np-tag-empty-btn" onClick={openTagModal}>
                                        <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                                            <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/>
                                            <line x1="7" y1="7" x2="7.01" y2="7"/>
                                        </svg>
                                        tag this track
                                    </button>
                                )}
                            </div>
                        )}

                        {focusTrack.owner && (
                            <div className="np-fields">
                                <div className="np-field">
                                    <span className="np-field-key">artist address</span>
                                    <span className="np-field-val np-mono">
                                        {focusTrack.owner.slice(0, 6)}…{focusTrack.owner.slice(-4)}
                                    </span>
                                </div>
                            </div>
                        )}

                        <div className="np-tabs-section">
                            <div className="np-tabs">
                                <button className={`np-tab${activeTab === 'similar' ? ' np-tab--active' : ''}`}
                                    onClick={() => setActiveTab('similar')}
                                    style={activeTab === 'similar' ? { color: accentColor, borderBottomColor: accentColor } : undefined}>
                                    You might also like
                                </button>
                                <button className={`np-tab${activeTab === 'artist' ? ' np-tab--active' : ''}`}
                                    onClick={() => setActiveTab('artist')}
                                    style={activeTab === 'artist' ? { color: accentColor, borderBottomColor: accentColor } : undefined}>
                                    By {focusTrack.artist}
                                </button>
                            </div>

                            <div className="np-tab-body">
                                {activeLoading && (
                                    <div className="np-artist-loading">
                                        <span className="upload-spinner" style={{ width: 14, height: 14, borderWidth: 1.5 }}/>
                                    </div>
                                )}
                                {!activeLoading && activeList.length === 0 && (
                                    <div className="np-artist-empty">
                                        {activeTab === 'similar'
                                            ? 'No similar tracks found'
                                            : `No other tracks by ${focusTrack.artist} on the network`}
                                    </div>
                                )}
                                {!activeLoading && activeList.length > 0 && (
                                    <ul className="np-similar-list">
                                        {activeList.map((t, i) => {
                                            const isActive = playingId === t.id
                                            return (
                                                <li key={t.id} className={`np-similar-row${isActive ? ' np-similar-row--active' : ''}`}>
                                                    <span className="np-similar-rank">{i + 1}</span>
                                                    <div className="np-similar-info">
                                                        <span className="np-similar-title">{t.title}</span>
                                                        <span className="np-similar-meta">
                                                            {activeTab === 'similar' ? t.artist : (t.year ?? '')}
                                                            {t.genre && activeTab === 'similar' && (
                                                                <> · <span className="np-similar-genre">{t.genre}</span></>
                                                            )}
                                                        </span>
                                                    </div>
                                                    <button className="np-similar-play" onClick={() => handlePlayRow(t)}
                                                        style={{ color: accentColor }}>
                                                        {isActive
                                                            ? <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><rect x="5" y="4" width="4" height="16" rx="1"/><rect x="15" y="4" width="4" height="16" rx="1"/></svg>
                                                            : <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                                                        }
                                                    </button>
                                                </li>
                                            )
                                        })}
                                    </ul>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {showPublish && focusTrack && (
                <PublishModal
                    track={focusTrack} fangorn={fangorn} publisherAddress={address}
                    onClose={() => setShowPublish(false)}
                    onPublished={() => { setShowPublish(false); setExistsInIndex(true) }}
                    accentColor={accentColor}
                />
            )}
        </div>
    )
}