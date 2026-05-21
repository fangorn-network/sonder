import { useEffect, useRef, useState } from 'react'
import { useSpotifyContext } from '../providers/SpotifyProvider'
import { useYouTubeContext } from '../hooks/useYoutubeContext'
import type { Track } from '../types'
import type { PlaybackState } from '../types/playback'
import './NowPlaying.css'
import { PublishModal } from './PublishModal'
import { useFangorn } from '../hooks/useFangorn'
import { TrackTagModal, type TrackTagData } from './TrackTag'
import { computeTrackId } from '../lib/trackId'

const CHROMA_URL = (import.meta as any).env.VITE_CHROMA_URL ?? 'http://localhost:8080'

// ── utils ─────────────────────────────────────────────────────────────────────

function fmtTime(ms: number) {
    if (!ms || !isFinite(ms)) return '0:00'
    const s = Math.floor(ms / 1000)
    return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`
}

// ── api ───────────────────────────────────────────────────────────────────────

interface NetworkTags {
    genres: string[]
    moods: string[]
    themes: string[]
    contexts: string[]
}

async function fetchTrackFromChroma(
    tagTrackId: string,
    spotifyTrackId: string | null,
    title: string,
    artist: string,
): Promise<{ exists: boolean; tags: NetworkTags | null }> {
    try {
        const q = encodeURIComponent(`${artist} ${title}`)
        const res = await fetch(`${CHROMA_URL}/search?q=${q}&n_results=5`)
        if (!res.ok) return { exists: false, tags: null }
        const data = await res.json()

        const hit = (data.results ?? []).find((h: any) => {
            const f = h.fields ?? {}
            if (f.trackId === tagTrackId) return true
            const hId = (f.externalId as string) ??
                (h.id?.startsWith('track:') ? h.id.slice(6) : null)
            if (spotifyTrackId && hId === spotifyTrackId) return true
            const hTitle = (f.title ?? f.name ?? '').toLowerCase()
            const hArtist = (f.byArtist ?? f.artist ?? '').toLowerCase()
            return hTitle === title.toLowerCase() && hArtist === artist.toLowerCase()
        })

        if (!hit) return { exists: false, tags: null }

        const f = hit.fields ?? {}
        const tags: NetworkTags = {
            genres: Array.isArray(f.genres) ? f.genres : [],
            moods: Array.isArray(f.moods) ? f.moods : [],
            themes: Array.isArray(f.themes) ? f.themes : [],
            contexts: Array.isArray(f.contexts) ? f.contexts : [],
        }
        const hasTags = Object.values(tags).some(arr => arr.length > 0)
        return { exists: true, tags: hasTags ? tags : null }
    } catch {
        return { exists: false, tags: null }
    }
}

async function embedTrack(artist: string, title: string): Promise<number[] | null> {
    try {
        const res = await fetch(`${CHROMA_URL}/embed`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: `${artist} - ${title}` }),
        })
        if (!res.ok) return null
        const data = await res.json()
        return data.embedding ?? null
    } catch {
        return null
    }
}

async function fetchSimilarTracks(
    embedding: number[],
    excludeId: string,
    excludeTitle: string,
    excludeArtist: string,
    n = 10,
): Promise<SimilarTrack[]> {
    try {
        const res = await fetch(`${CHROMA_URL}/search/vector`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ embedding, n_results: n + 20 }),
        })
        if (!res.ok) return []
        const data = await res.json()
        const seen = new Set<string>()
        return (data.results ?? [])
            .map((h: any) => parseHit(h))
            .filter((t: SimilarTrack) => {
                if (excludeId && t.id === excludeId) return false
                if (
                    t.title.toLowerCase() === excludeTitle.toLowerCase() &&
                    t.artist.toLowerCase() === excludeArtist.toLowerCase()
                ) return false
                const key = t.spotifyTrackId ?? t.id
                if (seen.has(key)) return false
                seen.add(key)
                return true
            })
            .slice(0, n)
    } catch {
        return []
    }
}

async function fetchArtistTracks(
    artist: string,
    excludeId: string,
    excludeTitle: string,
    n = 10,
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
                const key = t.spotifyTrackId ?? t.id
                if (seen.has(key)) return false
                seen.add(key)
                return true
            })
            .slice(0, n)
    } catch {
        return []
    }
}

function parseHit(h: any): SimilarTrack {
    const f: Record<string, any> = h.fields ?? {}
    const spotifyTrackId =
        (f.externalId as string) ??
        (h.id?.startsWith('track:') ? h.id.slice(6) : null)
    return {
        id: h.id,
        spotifyTrackId,
        title: (f.title as string) ?? (f.name as string) ?? 'Unknown',
        artist: (f.byArtist as string) ?? (f.artist as string) ?? '',
        year: typeof f.datePublished === 'string'
            ? parseInt(f.datePublished.slice(0, 4)) || null
            : (f.year as number) ?? null,
        genre: Array.isArray(f.genres) ? (f.genres[0] ?? null) : null,
        embedding: h.embedding ?? null,
        score: h.score ?? null,
    }
}

// ── types ─────────────────────────────────────────────────────────────────────

interface SimilarTrack {
    id: string
    spotifyTrackId: string | null
    title: string
    artist: string
    year: number | null
    genre: string | null
    embedding: number[] | null
    score: number | null
}

type RightTab = 'similar' | 'artist'

// ── component ─────────────────────────────────────────────────────────────────

interface NowPlayingProps {
    onCollapse: () => void
    lastPollTime: number
    track?: Track
    trackColor?: string
    onFilter?: (type: 'genre' | 'mood' | 'context', value: string) => void
    onCallAgent?: (query?: string) => void
    onTrackSelect?: (track: Track, color?: string) => void
    onPlay?: (track: Track) => void
    playbackState?: PlaybackState
}

export function NowPlaying({
    onCollapse,
    lastPollTime,
    track: propTrack,
    trackColor,
    onFilter,
    onTrackSelect,
    onPlay,
    playbackState,
}: NowPlayingProps) {
    const {
        currentTrack, isPlaying, connecting, error,
        togglePlay, seek, next, prev, onNext, onPrev, onSignal,
        play, searchAndPlay, connected, connect,
    } = useSpotifyContext()

    const {
        currentTitle: ytTitle,
        currentArtist: ytArtist,
        currentThumb: ytThumb,
        isPlaying: ytIsPlaying,
        progressMs: ytProgressMs,
        durationMs: ytDurationMs,
        pause: ytPause,
        resume: ytResume,
        seek: ytSeek,
    } = useYouTubeContext()

    const { fangorn, address } = useFangorn()

    const isYT = playbackState?.activeSource === 'youtube'

    // ── focusTrack — unified across Spotify and YouTube ───────────────────────

    const focusTrack: Track | null = propTrack ?? (
        isYT && ytTitle
            ? {
                id: '',
                trackId: '',
                owner: '',
                manifestCid: '',
                title: ytTitle,
                artist: ytArtist ?? '',
                year: null,
                durationMs: ytDurationMs || null,
                spotifyTrackId: null,
            } satisfies Track
            : currentTrack
                ? {
                    id: '',
                    trackId: '',
                    owner: '',
                    manifestCid: '',
                    title: currentTrack.name,
                    artist: currentTrack.artist,
                    year: null,
                    durationMs: currentTrack.durationMs ?? null,
                    spotifyTrackId: currentTrack.spotifyTrackId ?? null,
                } satisfies Track
                : null
    )

    const isThisTrackActive = isYT
        ? !!ytTitle && ytTitle.toLowerCase() === focusTrack?.title.toLowerCase()
        : !!(currentTrack && focusTrack &&
            currentTrack.name.toLowerCase() === focusTrack.title.toLowerCase() &&
            currentTrack.artist.toLowerCase() === focusTrack.artist.toLowerCase())

    // ── state ─────────────────────────────────────────────────────────────────

    const [liveProgressMs, setLiveProgressMs] = useState(0)
    const [albumArt, setAlbumArt] = useState<string | null>(
        !propTrack ? (currentTrack?.albumArt ?? null) : null
    )
    const [activeTab, setActiveTab] = useState<RightTab>('similar')
    const [similarTracks, setSimilarTracks] = useState<SimilarTrack[]>([])
    const [artistTracks, setArtistTracks] = useState<SimilarTrack[]>([])
    const [similarLoading, setSimilarLoading] = useState(false)
    const [artistLoading, setArtistLoading] = useState(false)
    const [playLoading, setPlayLoading] = useState(false)
    const [playingId, setPlayingId] = useState<string | null>(null)

    const rafRef = useRef<number | null>(null)
    const currentTrackRef = useRef(currentTrack)

    const [existsInIndex, setExistsInIndex] = useState<boolean | null>(null)
    const [showPublish, setShowPublish] = useState(false)

    // ── track id + network tags ───────────────────────────────────────────────

    const [tagTrackId, setTagTrackId] = useState<string | null>(null)
    const [networkTags, setNetworkTags] = useState<NetworkTags | null>(null)

    const [showTagModal, setShowTagModal] = useState(false)
    const [modalTrackId, setModalTrackId] = useState<string | null>(null)

    const openTagModal = () => {
        if (!tagTrackId) return
        setModalTrackId(tagTrackId)
        setShowTagModal(true)
    }

    useEffect(() => {
        if (!focusTrack?.artist || !focusTrack?.title) { setTagTrackId(null); return }
        computeTrackId(focusTrack.artist, focusTrack.title).then(setTagTrackId)
    }, [focusTrack?.artist, focusTrack?.title])

    useEffect(() => {
        if (!tagTrackId || !focusTrack?.title || !focusTrack?.artist) {
            setExistsInIndex(null)
            setNetworkTags(null)
            return
        }
        setExistsInIndex(null)
        setNetworkTags(null)
        fetchTrackFromChroma(
            tagTrackId,
            focusTrack.spotifyTrackId ?? null,
            focusTrack.title,
            focusTrack.artist,
        ).then(({ exists, tags }) => {
            setExistsInIndex(exists)
            setNetworkTags(tags)
        })
    }, [tagTrackId, focusTrack?.spotifyTrackId, focusTrack?.title, focusTrack?.artist])

    const allTags = networkTags
        ? [...networkTags.genres, ...networkTags.moods, ...networkTags.contexts, ...networkTags.themes]
        : []
    const tagged = allTags.length > 0

    // ── playback state ────────────────────────────────────────────────────────

    useEffect(() => { currentTrackRef.current = currentTrack }, [currentTrack])

    // ── album art ─────────────────────────────────────────────────────────────

    useEffect(() => {
        if (isYT && ytThumb) { setAlbumArt(ytThumb); return }
        if (!propTrack && currentTrack?.albumArt) setAlbumArt(currentTrack.albumArt)
    }, [currentTrack?.albumArt, propTrack, isYT, ytThumb])

    useEffect(() => {
        if (!focusTrack) return
        async function go() {
            try {
                const q = encodeURIComponent(`${focusTrack!.artist} ${focusTrack!.title}`)
                const res = await fetch(`https://itunes.apple.com/search?term=${q}&entity=song&limit=3`)
                const data = await res.json()
                const url = data.results?.[0]?.artworkUrl100
                if (url) setAlbumArt(url.replace('100x100bb', '600x600bb'))
            } catch { }
        }
        go()
    }, [focusTrack?.title, focusTrack?.artist])

    // ── progress ticker ───────────────────────────────────────────────────────

    useEffect(() => {
        if (isYT) {
            setLiveProgressMs(ytProgressMs)
            return
        }
        if (rafRef.current) cancelAnimationFrame(rafRef.current)
        if (!currentTrack) return
        const base = currentTrack.progressMs
        const pollTime = lastPollTime ?? Date.now()
        const tick = () => {
            const elapsed = isPlaying ? Date.now() - pollTime : 0
            setLiveProgressMs(Math.min(base + elapsed, currentTrack.durationMs))
            if (isPlaying) rafRef.current = requestAnimationFrame(tick)
        }
        rafRef.current = requestAnimationFrame(tick)
        return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
    }, [currentTrack?.progressMs, currentTrack?.durationMs, isPlaying, lastPollTime, isYT, ytProgressMs])

    // ── similar tracks ────────────────────────────────────────────────────────

    useEffect(() => {
        if (!focusTrack) return
        setSimilarLoading(true)
        setSimilarTracks([]);

        (async () => {
            const embedding: number[] | null =
                focusTrack.embedding
                    ? Array.from(focusTrack.embedding)
                    : await embedTrack(focusTrack.artist, focusTrack.title)
            if (!embedding) return
            const similar = await fetchSimilarTracks(
                embedding,
                focusTrack.id || '__none__',
                focusTrack.title,
                focusTrack.artist,
                10,
            )
            setSimilarTracks(similar)
        })().finally(() => setSimilarLoading(false))
    }, [focusTrack?.id, focusTrack?.title])

    // ── artist tracks ─────────────────────────────────────────────────────────

    useEffect(() => {
        if (!focusTrack?.artist) return
        setArtistLoading(true)
        setArtistTracks([])
        fetchArtistTracks(focusTrack.artist, focusTrack.id || '__none__', focusTrack.title, 10)
            .then(setArtistTracks)
            .finally(() => setArtistLoading(false))
    }, [focusTrack?.artist, focusTrack?.id])

    // ── keyboard + scroll lock ────────────────────────────────────────────────

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && !showTagModal) onCollapse()
        }
        window.addEventListener('keydown', onKey)
        document.body.style.overflow = 'hidden'
        return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = '' }
    }, [onCollapse, showTagModal])

    if (!focusTrack) return null

    const durationMs = isYT ? ytDurationMs : (currentTrack?.durationMs ?? 0)
    const progress = durationMs > 0 ? liveProgressMs / durationMs : 0
    const accentColor = trackColor ?? 'var(--accent)'
    const showPause = isThisTrackActive && (isYT ? ytIsPlaying : isPlaying)

    function scrubTo(e: React.MouseEvent<HTMLDivElement>) {
        const rect = e.currentTarget.getBoundingClientRect()
        const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
        if (isYT) ytSeek(ratio * ytDurationMs)
        else seek(ratio * durationMs)
    }

    const handlePlayPause = async () => {
        if (isYT) {
            ytIsPlaying ? ytPause() : ytResume()
            return
        }

        if (onPlay && !isThisTrackActive) {
            setPlayLoading(true)
            try { await onPlay(focusTrack) }
            finally { setPlayLoading(false) }
            return
        }
        if (!connected) { await connect(); return }
        if (isThisTrackActive) {
            await togglePlay()
        } else {
            setPlayLoading(true)
            try {
                if (focusTrack.spotifyTrackId) {
                    try { await play(`spotify:track:${focusTrack.spotifyTrackId}`) }
                    catch { await searchAndPlay(`${focusTrack.title} ${focusTrack.artist}`.replace(/\(.*?\)/g, '').trim()) }
                } else {
                    await searchAndPlay(`${focusTrack.title} ${focusTrack.artist}`.replace(/\(.*?\)/g, '').trim())
                }
            } finally { setPlayLoading(false) }
        }
    }

    const handleNext = () => {
        if (!isYT && currentTrackRef.current && onSignal) {
            const t = currentTrackRef.current
            onSignal({
                type: 'skip', weight: -1.0,
                track: {
                    id: '', trackId: '', owner: '', manifestCid: '',
                    title: t.name, artist: t.artist,
                    year: null, durationMs: null, spotifyTrackId: null,
                },
            })
        }
        ; (onNext ?? next)?.()
    }

    const handlePrev = () => { ; (onPrev ?? prev)?.() }

    const handlePlayRow = async (t: SimilarTrack) => {
        setPlayingId(t.id)
        const asTrack: Track = {
            id: t.id,
            trackId: t.id,
            owner: '',
            manifestCid: '',
            title: t.title,
            artist: t.artist,
            year: t.year,
            durationMs: null,
            spotifyTrackId: t.spotifyTrackId,
        }
        onTrackSelect?.(asTrack)
        try {
            if (onPlay) {
                await onPlay(asTrack)
                return
            }
            // Legacy fallback — router not wired
            if (!connected) { await connect(); return }
            if (t.spotifyTrackId) {
                try { await play(`spotify:track:${t.spotifyTrackId}`) }
                catch { await searchAndPlay(`${t.title} ${t.artist}`.replace(/\(.*?\)/g, '').trim()) }
            } else {
                await searchAndPlay(`${t.title} ${t.artist}`.replace(/\(.*?\)/g, '').trim())
            }
        } catch {
            setPlayingId(null)
        }
    }

    const activeList = activeTab === 'similar' ? similarTracks : artistTracks
    const activeLoading = activeTab === 'similar' ? similarLoading : artistLoading

    // ── render ────────────────────────────────────────────────────────────────

    return (
        <div className="np-overlay">
            {albumArt && <div className="np-bg" style={{ backgroundImage: `url(${albumArt})` }} />}
            <div className="np-bg-scrim" />

            <div className="np-layout">

                {/* ══ LEFT COL ══ */}
                <div className="np-col-left">
                    <button className="np-collapse" onClick={onCollapse} aria-label="Close">
                        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                            <path d="M18 6L6 18M6 6l12 12" />
                        </svg>
                    </button>

                    <div className="np-artist-hero">
                        <div className="np-artist-hero-name" style={{ '--np-accent': accentColor } as React.CSSProperties}>
                            {focusTrack.artist}
                        </div>
                        {focusTrack.year && <div className="np-artist-hero-year">{focusTrack.year}</div>}
                    </div>

                    <div className="np-art-wrap">
                        <div className="np-art">
                            {albumArt
                                ? <img src={albumArt} alt={focusTrack.title} className="np-art-img" />
                                : <span className="np-art-initial">{focusTrack.title.slice(0, 1).toUpperCase()}</span>
                            }
                        </div>
                    </div>

                    <div className="np-info">
                        <div className="np-name" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            {focusTrack.title}

                            {/* todo: uncomment this if we want to display the playback source */}
                            {/* {isYT && ( */}
                            {/* <span style={{ */}
                            {/* fontSize: 9, letterSpacing: '0.07em', textTransform: 'uppercase', */}
                            {/* color: 'rgba(248,113,113,0.75)', background: 'rgba(248,113,113,0.1)', */}
                            {/* border: '1px solid rgba(248,113,113,0.2)', borderRadius: 3, */}
                            {/* padding: '1px 5px', lineHeight: 1.4, flexShrink: 0, */}
                            {/* }}> */}
                            {/* youtube */}
                            {/* </span> */}
                            {/* )} */}
                            {existsInIndex === false && (
                                <button
                                    className="np-publish-btn"
                                    onClick={() => setShowPublish(true)}
                                    title="Add to Fangorn"
                                    aria-label="Publish to Fangorn"
                                >
                                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none"
                                        stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                                        <circle cx="12" cy="12" r="10" />
                                        <path d="M12 8v8M8 12h8" />
                                    </svg>
                                </button>
                            )}
                            {existsInIndex === null && (
                                <span className="upload-spinner"
                                    style={{ width: 12, height: 12, borderWidth: 1.5, opacity: 0.4 }} />
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
                                    {isYT ? (
                                        <div style={{
                                            height: '100%', width: `${progress * 100}%`,
                                            background: 'rgba(248,113,113,0.7)', borderRadius: 2,
                                        }} />
                                    ) : (
                                        <>
                                            <div className="np-progress-fill" style={{ width: `${progress * 100}%` }} />
                                            <div className="np-progress-thumb" style={{ left: `${progress * 100}%` }} />
                                        </>
                                    )}
                                </div>
                            </div>
                            <div className="np-times">
                                <span>{fmtTime(liveProgressMs)}</span>
                                <span>{fmtTime(durationMs)}</span>
                            </div>
                        </div>
                    )}

                    <div className="np-controls">
                        <button
                            className="np-btn np-btn--skip"
                            onClick={handlePrev}
                            style={{ opacity: isThisTrackActive && !isYT ? 1 : 0.2, pointerEvents: isThisTrackActive && !isYT ? 'auto' : 'none' }}
                            aria-label="Previous"
                        >
                            <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6 8.5 6V6z" /></svg>
                        </button>
                        <button
                            className={`np-btn np-btn--play${showPause ? ' np-btn--playing' : ''}`}
                            onClick={handlePlayPause}
                            disabled={connecting || playLoading}
                            aria-label={showPause ? 'Pause' : 'Play'}
                            style={{ background: isYT ? 'rgba(248,113,113,0.8)' : accentColor } as React.CSSProperties}
                        >
                            {connecting || playLoading
                                ? <span className="upload-spinner" style={{ width: 20, height: 20, borderWidth: 2, borderTopColor: 'var(--bg)' }} />
                                : showPause
                                    ? <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><rect x="5" y="4" width="4" height="16" rx="1" /><rect x="15" y="4" width="4" height="16" rx="1" /></svg>
                                    : <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M8 5.14v14l11-7-11-7z" /></svg>
                            }
                        </button>
                        <button
                            className="np-btn np-btn--skip"
                            onClick={handleNext}
                            style={{ opacity: isThisTrackActive && !isYT ? 1 : 0.2, pointerEvents: isThisTrackActive && !isYT ? 'auto' : 'none' }}
                            aria-label="Next"
                        >
                            <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M16 6h2v12h-2zM6 18l8.5-6L6 6v12z" /></svg>
                        </button>
                    </div>

                    {error && !isYT && <div className="np-error">{error}</div>}
                </div>

                {/* ══ RIGHT COL ══ */}
                <div className="np-col-right">
                    {showTagModal && modalTrackId && (
                        <TrackTagModal
                            trackId={modalTrackId}
                            trackTitle={focusTrack.title}
                            fangorn={fangorn}
                            onClose={() => setShowTagModal(false)}
                            onSave={() => { }}
                            accentColor={accentColor}
                        />
                    )}

                    <div className="np-right-body">

                        {/* ── Track Tags ── */}
                        {!showPublish && tagTrackId && (
                            <div className="np-tag-section">
                                {tagged ? (
                                    <div className="np-tag-row">
                                        <div className="np-tag-chips">
                                            {allTags.slice(0, 6).map(tag => (
                                                <span
                                                    key={tag}
                                                    className="np-tag-chip"
                                                    style={{ color: accentColor, background: `${accentColor}14`, borderColor: `${accentColor}40` }}
                                                >
                                                    {tag}
                                                </span>
                                            ))}
                                            {allTags.length > 6 && (
                                                <span className="np-tag-chip np-tag-chip--overflow">
                                                    +{allTags.length - 6}
                                                </span>
                                            )}
                                        </div>
                                        <button
                                            className="np-tag-edit-btn"
                                            onClick={openTagModal}
                                            title="Edit tags"
                                            aria-label="Edit track tags"
                                        >
                                            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                                            </svg>
                                        </button>
                                    </div>
                                ) : (
                                    <button
                                        className="np-tag-empty-btn"
                                        onClick={openTagModal}
                                    >
                                        <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                                            <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
                                            <line x1="7" y1="7" x2="7.01" y2="7" />
                                        </svg>
                                        tag this track
                                    </button>
                                )}
                            </div>
                        )}

                        {(focusTrack.spotifyTrackId || focusTrack.owner) && (
                            <div className="np-fields">
                                {focusTrack.spotifyTrackId && (
                                    <div className="np-field">
                                        <span className="np-field-key">spotify id</span>
                                        <span className="np-field-val np-mono">{focusTrack.spotifyTrackId}</span>
                                    </div>
                                )}
                                {focusTrack.owner && (
                                    <div className="np-field">
                                        <span className="np-field-key">artist address</span>
                                        <span className="np-field-val np-mono">
                                            {focusTrack.owner.slice(0, 6)}…{focusTrack.owner.slice(-4)}
                                        </span>
                                    </div>
                                )}
                            </div>
                        )}

                        <div className="np-tabs-section">
                            <div className="np-tabs">
                                <button
                                    className={`np-tab${activeTab === 'similar' ? ' np-tab--active' : ''}`}
                                    onClick={() => setActiveTab('similar')}
                                    style={activeTab === 'similar' ? { color: accentColor, borderBottomColor: accentColor } : undefined}
                                >
                                    You might also like
                                </button>
                                <button
                                    className={`np-tab${activeTab === 'artist' ? ' np-tab--active' : ''}`}
                                    onClick={() => setActiveTab('artist')}
                                    style={activeTab === 'artist' ? { color: accentColor, borderBottomColor: accentColor } : undefined}
                                >
                                    By {focusTrack.artist}
                                </button>
                            </div>

                            <div className="np-tab-body">
                                {activeLoading && (
                                    <div className="np-artist-loading">
                                        <span className="upload-spinner" style={{ width: 14, height: 14, borderWidth: 1.5 }} />
                                    </div>
                                )}

                                {!activeLoading && activeList.length === 0 && (
                                    <div className="np-artist-empty">
                                        {activeTab === 'similar'
                                            ? 'No similar tracks found'
                                            : `No other tracks by ${focusTrack.artist} on the network`
                                        }
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
                                                    <button
                                                        className="np-similar-play"
                                                        onClick={() => handlePlayRow(t)}
                                                        style={{ color: accentColor }}
                                                        aria-label={`Play ${t.title}`}
                                                    >
                                                        {isActive
                                                            ? <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><rect x="5" y="4" width="4" height="16" rx="1" /><rect x="15" y="4" width="4" height="16" rx="1" /></svg>
                                                            : <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
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
                    track={focusTrack}
                    fangorn={fangorn}
                    publisherAddress={address}
                    onClose={() => setShowPublish(false)}
                    onPublished={() => { setShowPublish(false); setExistsInIndex(true) }}
                    accentColor={accentColor}
                />
            )}
        </div>
    )
}