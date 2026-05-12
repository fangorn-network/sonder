import { useEffect, useRef, useState } from 'react'
import { useSpotifyContext } from '../providers/SpotifyProvider'
import type { Track } from '../types'
import './NowPlaying.css'
import { PublishModal } from './PublishModal'
import { useFangorn } from '../hooks/useFangorn'

const CHROMA_URL = (import.meta as any).env.VITE_CHROMA_URL ?? 'http://localhost:8080'

// ── utils ─────────────────────────────────────────────────────────────────────

function fmtTime(ms: number) {
    if (!ms || !isFinite(ms)) return '0:00'
    const s = Math.floor(ms / 1000)
    return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`
}

// ── api ───────────────────────────────────────────────────────────────────────

async function checkExistsInChroma(
    spotifyTrackId: string | null,
    title: string,
    artist: string,
): Promise<boolean> {
    try {
        const q = encodeURIComponent(`${artist} ${title}`)
        const res = await fetch(`${CHROMA_URL}/search?q=${q}&n_results=5`)
        if (!res.ok) return false
        const data = await res.json()
        return (data.results ?? []).some((h: any) => {
            const f = h.fields ?? {}
            const hId = (f.externalId as string) ?? (h.id?.startsWith('track:') ? h.id.slice(6) : null)
            if (spotifyTrackId && hId === spotifyTrackId) return true
            // fallback: title+artist match
            const hTitle = (f.title ?? f.name ?? '').toLowerCase()
            const hArtist = (f.byArtist ?? f.artist ?? '').toLowerCase()
            return hTitle === title.toLowerCase() && hArtist === artist.toLowerCase()
        })
    } catch {
        return false
    }
}

async function fetchAlbumArt(title: string, artist: string): Promise<string | null> {
    try {
        const q = encodeURIComponent(`${artist} ${title}`)
        const res = await fetch(`https://itunes.apple.com/search?term=${q}&entity=song&limit=3`)
        const data = await res.json()
        const url = data.results?.[0]?.artworkUrl100
        if (url) return url.replace('100x100bb', '600x600bb')
    } catch { }
    return null
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
}

export function NowPlaying({
    onCollapse,
    lastPollTime,
    track: propTrack,
    trackColor,
    onFilter,
}: NowPlayingProps) {
    const {
        currentTrack, isPlaying, connecting, error,
        togglePlay, seek, next, prev, onNext, onPrev, onSignal,
        play, searchAndPlay, connected, connect,
    } = useSpotifyContext()

    const { fangorn, address, loading: fangornLoading } = useFangorn()

    const focusTrack: Track | null = propTrack ?? (
        currentTrack ? {
            id: '',
            trackId: '',
            owner: '',
            manifestCid: '',
            title: currentTrack.name,
            artist: currentTrack.artist,
            year: null,
            durationMs: currentTrack.durationMs ?? null,
            spotifyTrackId: currentTrack.spotifyTrackId ?? null,  // ← was null
            // genres: [], moods: [], themes: [], contexts: [],
        } satisfies Track : null
    )

    const isThisTrackActive =
        currentTrack && focusTrack &&
        currentTrack.name.toLowerCase() === focusTrack.title.toLowerCase() &&
        currentTrack.artist.toLowerCase() === focusTrack.artist.toLowerCase()

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

    useEffect(() => {
        if (!focusTrack) return
        setExistsInIndex(null)
        checkExistsInChroma(
            focusTrack.spotifyTrackId,
            focusTrack.title,
            focusTrack.artist,
        ).then(setExistsInIndex)

        console.log("UPDATED")
        console.log(existsInIndex)
    }, [focusTrack?.spotifyTrackId, focusTrack?.title, focusTrack?.artist])

    useEffect(() => { currentTrackRef.current = currentTrack }, [currentTrack])

    // ── album art ─────────────────────────────────────────────────────────────

    useEffect(() => {
        if (!propTrack && currentTrack?.albumArt) setAlbumArt(currentTrack.albumArt)
    }, [currentTrack?.albumArt, propTrack])

    useEffect(() => {
        if (!focusTrack) return
        fetchAlbumArt(focusTrack.title, focusTrack.artist).then(art => {
            if (art) setAlbumArt(art)
        })
    }, [focusTrack?.title, focusTrack?.artist])

    // ── progress ticker ───────────────────────────────────────────────────────

    useEffect(() => {
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
    }, [currentTrack?.progressMs, currentTrack?.durationMs, isPlaying, lastPollTime])

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
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCollapse() }
        window.addEventListener('keydown', onKey)
        document.body.style.overflow = 'hidden'
        return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = '' }
    }, [onCollapse])

    if (!focusTrack) return null

    const durationMs = currentTrack?.durationMs ?? 0
    const progress = durationMs > 0 ? liveProgressMs / durationMs : 0
    const accentColor = trackColor ?? 'var(--accent)'
    // const hasMeta = (
    //     focusTrack.genres.length > 0 ||
    //     focusTrack.moods.length > 0 ||
    //     focusTrack.contexts.length > 0 ||
    //     focusTrack.themes.length > 0
    // )

    function scrubTo(e: React.MouseEvent<HTMLDivElement>) {
        const rect = e.currentTarget.getBoundingClientRect()
        seek(Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)) * durationMs)
    }

    const handlePlayPause = async () => {
        if (!connected) { await connect(); return }
        if (isThisTrackActive) {
            await togglePlay()
        } else {
            setPlayLoading(true)
            try {
                if (focusTrack.spotifyTrackId) {
                    await play(`spotify:track:${focusTrack.spotifyTrackId}`)
                } else {
                    await searchAndPlay(
                        `${focusTrack.title} ${focusTrack.artist}`.replace(/\(.*?\)/g, '').trim()
                    )
                }
            } finally {
                setPlayLoading(false)
            }
        }
    }

    const handleNext = () => {
        if (currentTrackRef.current && onSignal) {
            const t = currentTrackRef.current
            onSignal({
                type: 'skip', weight: -1.0,
                track: {
                    id: '',
                    trackId: '',
                    owner: '',
                    manifestCid: '',
                    title: t.name,
                    artist: t.artist,
                    year: null,
                    durationMs: null,
                    spotifyTrackId: null,
                    // genres: [], moods: [], themes: [], contexts: [],
                },
            })
        }
        ; (onNext ?? next)?.()
    }

    const handlePrev = () => { ; (onPrev ?? prev)?.() }

    const handleFilterTag = (type: 'genre' | 'mood' | 'context', value: string) => {
        onFilter?.(type, value); onCollapse()
    }

    const handlePlayRow = async (t: SimilarTrack) => {
        if (!connected) { await connect(); return }
        setPlayingId(t.id)
        try {
            if (t.spotifyTrackId) {
                await play(`spotify:track:${t.spotifyTrackId}`)
            } else {
                await searchAndPlay(
                    `${t.title} ${t.artist}`.replace(/\(.*?\)/g, '').trim()
                )
            }
        } catch {
            setPlayingId(null)
        }
    }

    const showPause = isThisTrackActive && isPlaying
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
                                    <div className="np-progress-fill" style={{ width: `${progress * 100}%` }} />
                                    <div className="np-progress-thumb" style={{ left: `${progress * 100}%` }} />
                                </div>
                            </div>
                            <div className="np-times">
                                <span>{fmtTime(liveProgressMs)}</span>
                                <span>{fmtTime(durationMs)}</span>
                            </div>
                        </div>
                    )}

                    <div className="np-controls">
                        <button className="np-btn np-btn--skip" onClick={handlePrev}
                            style={{ opacity: isThisTrackActive ? 1 : 0.2, pointerEvents: isThisTrackActive ? 'auto' : 'none' }}
                            aria-label="Previous">
                            <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6 8.5 6V6z" /></svg>
                        </button>
                        <button
                            className={`np-btn np-btn--play${showPause ? ' np-btn--playing' : ''}`}
                            onClick={handlePlayPause}
                            disabled={connecting || playLoading}
                            aria-label={showPause ? 'Pause' : 'Play'}
                            style={{ background: accentColor } as React.CSSProperties}
                        >
                            {connecting || playLoading
                                ? <span className="upload-spinner" style={{ width: 20, height: 20, borderWidth: 2, borderTopColor: 'var(--bg)' }} />
                                : showPause
                                    ? <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><rect x="5" y="4" width="4" height="16" rx="1" /><rect x="15" y="4" width="4" height="16" rx="1" /></svg>
                                    : <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M8 5.14v14l11-7-11-7z" /></svg>
                            }
                        </button>
                        <button className="np-btn np-btn--skip" onClick={handleNext}
                            style={{ opacity: isThisTrackActive ? 1 : 0.2, pointerEvents: isThisTrackActive ? 'auto' : 'none' }}
                            aria-label="Next">
                            <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M16 6h2v12h-2zM6 18l8.5-6L6 6v12z" /></svg>
                        </button>
                    </div>

                    {error && <div className="np-error">{error}</div>}
                </div>

                {/* ══ RIGHT COL ══ */}
                <div className="np-col-right">
                    <div className="np-right-body">

                        {/* {hasMeta && (
                            <div className="np-tags-section">
                                {focusTrack.genres.length > 0 && (
                                    <div className="np-tags">
                                        {focusTrack.genres.map((g, i) => (
                                            <button key={g} className="np-tag np-tag--genre"
                                                style={{ opacity: i === 0 ? 1 : 0.75, color: accentColor, background: `${accentColor}15`, borderColor: `${accentColor}30` }}
                                                onClick={() => handleFilterTag('genre', g)}>{g}</button>
                                        ))}
                                    </div>
                                )}
                                {focusTrack.moods.length > 0 && (
                                    <div className="np-tags">
                                        {focusTrack.moods.map(m => (
                                            <button key={m} className="np-tag np-tag--mood"
                                                onClick={() => handleFilterTag('mood', m)}>{m}</button>
                                        ))}
                                    </div>
                                )}
                                {focusTrack.contexts.length > 0 && (
                                    <div className="np-tags">
                                        {focusTrack.contexts.map(c => (
                                            <button key={c} className="np-tag np-tag--context"
                                                onClick={() => handleFilterTag('context', c)}>{c}</button>
                                        ))}
                                    </div>
                                )}
                                {focusTrack.themes.length > 0 && (
                                    <div className="np-tags">
                                        {focusTrack.themes.map(t => (
                                            <span key={t} className="np-tag np-tag--theme">{t}</span>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )} */}

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