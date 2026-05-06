import { useEffect, useRef, useState } from 'react'
import { useSpotifyContext } from '../providers/SpotifyProvider'
import type { Track } from '../types'
import './NowPlaying.css'

const CHROMA_URL = (import.meta as any).env.VITE_CHROMA_URL ?? 'http://localhost:8080'

function fmtTime(ms: number) {
    if (!ms || !isFinite(ms)) return '0:00'
    const s = Math.floor(ms / 1000)
    const m = Math.floor(s / 60)
    const sec = s % 60
    return `${m}:${sec.toString().padStart(2, '0')}`
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

async function fetchArtistTracks(artist: string, excludeTitle: string): Promise<{ id: string; title: string; year: number | null; artist: string }[]> {
    try {
        const params = new URLSearchParams({ q: artist, n_results: '20' })
        const resp = await fetch(`${CHROMA_URL}/search?${params}`)
        if (!resp.ok) return []
        const data = await resp.json()
        return (data.results ?? [])
            .map((h: any) => {
                const fields: Record<string, string> = {}
                for (const part of (h.document ?? '').split(' | ')) {
                    const colon = part.indexOf(': ')
                    if (colon === -1) continue
                    fields[part.slice(0, colon).trim()] = part.slice(colon + 2).trim()
                }
                return {
                    id: h.id,
                    title: fields['title'] ?? fields['name'] ?? 'Unknown',
                    artist: fields['artist'] ?? '',
                    year: parseFloat(fields['year']) || null,
                }
            })
            .filter((t: any) =>
                t.artist.toLowerCase() === artist.toLowerCase() &&
                t.title.toLowerCase() !== excludeTitle.toLowerCase()
            )
            .slice(0, 6)
    } catch {
        return []
    }
}

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
    track: browseTrack,
    trackColor,
    onFilter,
}: NowPlayingProps) {
    const {
        currentTrack, isPlaying, connecting, error,
        togglePlay, seek, next, prev, onNext, onPrev, onSignal,
        searchAndPlay, connected, connect,
    } = useSpotifyContext()

    const focusTrack = browseTrack ?? (currentTrack ? {
        id: '', title: currentTrack.name, artist: currentTrack.artist,
        year: null, energy: null, genres: [] as string[], moods: [] as string[],
        themes: [] as string[], contexts: [] as string[],
        owner: '', manifestStateId: '', datasourceName: '', mbid: null, name: currentTrack.name,
    } satisfies Track : null)

    const isThisTrackPlaying =
        currentTrack && focusTrack &&
        currentTrack.name.toLowerCase() === focusTrack.title.toLowerCase() &&
        currentTrack.artist.toLowerCase() === focusTrack.artist.toLowerCase()

    const [liveProgressMs, setLiveProgressMs] = useState(0)
    const [albumArt, setAlbumArt] = useState<string | null>(
        !browseTrack ? (currentTrack?.albumArt ?? null) : null
    )
    const [artistTracks, setArtistTracks] = useState<{ id: string; title: string; year: number | null; artist: string }[]>([])
    const [artistLoading, setArtistLoading] = useState(false)
    const [playLoading, setPlayLoading] = useState(false)
    const rafRef = useRef<number | null>(null)
    const currentTrackRef = useRef(currentTrack)
    useEffect(() => { currentTrackRef.current = currentTrack }, [currentTrack])

    useEffect(() => {
        if (!browseTrack && currentTrack?.albumArt) setAlbumArt(currentTrack.albumArt)
    }, [currentTrack?.albumArt, browseTrack])

    useEffect(() => {
        if (!browseTrack) return
        fetchAlbumArt(browseTrack.title, browseTrack.artist).then(art => { if (art) setAlbumArt(art) })
    }, [browseTrack?.title, browseTrack?.artist])

    useEffect(() => {
        if (rafRef.current) cancelAnimationFrame(rafRef.current)
        if (!currentTrack) return
        const base = currentTrack.progressMs
        const pollTime = lastPollTime ?? Date.now()
        const tick = () => {
            const elapsed = isPlaying ? Date.now() - pollTime : 0
            const clamped = Math.min(base + elapsed, currentTrack.durationMs)
            setLiveProgressMs(clamped)
            if (isPlaying) rafRef.current = requestAnimationFrame(tick)
        }
        rafRef.current = requestAnimationFrame(tick)
        return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
    }, [currentTrack?.progressMs, currentTrack?.durationMs, isPlaying, lastPollTime])

    useEffect(() => {
        if (!focusTrack) return
        setArtistLoading(true)
        setArtistTracks([])
        fetchArtistTracks(focusTrack.artist, focusTrack.title)
            .then(setArtistTracks)
            .finally(() => setArtistLoading(false))
    }, [focusTrack?.artist, focusTrack?.title])

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCollapse() }
        window.addEventListener('keydown', onKey)
        document.body.style.overflow = 'hidden'
        return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = '' }
    }, [onCollapse])

    if (!focusTrack) return null

    const durationMs = currentTrack?.durationMs ?? 0
    const progress = durationMs > 0 ? liveProgressMs / durationMs : 0

    function scrubTo(e: React.MouseEvent<HTMLDivElement>) {
        const rect = e.currentTarget.getBoundingClientRect()
        seek(Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)) * durationMs)
    }

    const handleNext = () => {
        if (currentTrackRef.current && onSignal) {
            const t = currentTrackRef.current
            onSignal({ type: 'skip', weight: -1.0, track: { id: '', title: t.name, artist: t.artist, year: null, energy: null, genres: [], moods: [], contexts: [], themes: [], owner: '', manifestStateId: '', datasourceName: '', mbid: null, name: t.name } })
        }
        ;(onNext ?? next)?.()
    }

    const handlePrev = () => { ;(onPrev ?? prev)?.() }

    const handlePlayPause = async () => {
        if (!connected) { await connect(); return }
        if (isThisTrackPlaying) {
            await togglePlay()
        } else {
            setPlayLoading(true)
            try { await searchAndPlay(`${focusTrack.title} ${focusTrack.artist}`) }
            finally { setPlayLoading(false) }
        }
    }

    const handleFilterTag = (type: 'genre' | 'mood' | 'context', value: string) => {
        onFilter?.(type, value)
        onCollapse()
    }

    const accentColor = trackColor ?? 'var(--accent)'
    const hasMeta = browseTrack && (
        browseTrack.genres.length > 0 || browseTrack.moods.length > 0 ||
        browseTrack.contexts.length > 0 || browseTrack.themes.length > 0 ||
        browseTrack.energy !== null || browseTrack.mbid || browseTrack.owner
    )

    return (
        <div className="np-overlay">
            {albumArt && <div className="np-bg" style={{ backgroundImage: `url(${albumArt})` }} />}
            <div className="np-bg-scrim" />

            <div className="np-layout">

                {/* ════════════════ LEFT COL ════════════════ */}
                <div className="np-col-left">

                    <button className="np-collapse" onClick={onCollapse} aria-label="Close">
                        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                            <path d="M18 6L6 18M6 6l12 12" />
                        </svg>
                    </button>

                    {/* ── prominent artist nameplate ── */}
                    <div className="np-artist-hero">
                        <div
                            className="np-artist-hero-name"
                            style={{ '--np-accent': accentColor } as React.CSSProperties}
                        >
                            {focusTrack.artist}
                        </div>
                        {focusTrack.year && (
                            <div className="np-artist-hero-year">{focusTrack.year}</div>
                        )}
                    </div>

                    <div className="np-art-wrap">
                        <div className="np-art">
                            {albumArt
                                ? <img src={albumArt} alt={focusTrack.title} className="np-art-img" />
                                : <span className="np-art-initial">{focusTrack.title.slice(0, 1).toUpperCase()}</span>
                            }
                            {focusTrack.energy !== null && (
                                <div className="np-art-energy" style={{ width: `${Math.round(focusTrack.energy * 100)}%`, background: accentColor }} />
                            )}
                        </div>
                    </div>

                    <div className="np-info">
                        <div className="np-name">{focusTrack.title}</div>
                    </div>

                    {isThisTrackPlaying && (
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
                        <button className="np-btn np-btn--skip" onClick={handlePrev} aria-label="Previous"
                            style={{ opacity: isThisTrackPlaying ? 1 : 0.2, pointerEvents: isThisTrackPlaying ? 'auto' : 'none' }}>
                            <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
                                <path d="M6 6h2v12H6zm3.5 6 8.5 6V6z" />
                            </svg>
                        </button>

                        <button
                            className={`np-btn np-btn--play${isThisTrackPlaying && isPlaying ? ' np-btn--playing' : ''}`}
                            onClick={handlePlayPause}
                            disabled={connecting || playLoading}
                            aria-label={isThisTrackPlaying && isPlaying ? 'Pause' : 'Play'}
                            style={{ background: accentColor } as React.CSSProperties}
                        >
                            {connecting || playLoading
                                ? <span className="upload-spinner" style={{ width: 20, height: 20, borderWidth: 2, borderTopColor: 'var(--bg)' }} />
                                : isThisTrackPlaying && isPlaying
                                    ? <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><rect x="5" y="4" width="4" height="16" rx="1" /><rect x="15" y="4" width="4" height="16" rx="1" /></svg>
                                    : <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M8 5.14v14l11-7-11-7z" /></svg>
                            }
                        </button>

                        <button className="np-btn np-btn--skip" onClick={handleNext} aria-label="Next"
                            style={{ opacity: isThisTrackPlaying ? 1 : 0.2, pointerEvents: isThisTrackPlaying ? 'auto' : 'none' }}>
                            <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
                                <path d="M16 6h2v12h-2zM6 18l8.5-6L6 6v12z" />
                            </svg>
                        </button>
                    </div>

                    {error && <div className="np-error">{error}</div>}
                </div>

                {/* ════════════════ RIGHT COL ════════════════ */}
                <div className="np-col-right">
                    <div className="np-right-body">

                        {hasMeta && (
                            <div className="np-tags-section">
                                {browseTrack!.genres.length > 0 && (
                                    <div className="np-tags">
                                        {browseTrack!.genres.map((g, i) => (
                                            <button key={g} className="np-tag np-tag--genre"
                                                style={{ opacity: i === 0 ? 1 : 0.75, color: accentColor, background: `${accentColor}15`, borderColor: `${accentColor}30` }}
                                                onClick={() => handleFilterTag('genre', g)}>{g}</button>
                                        ))}
                                    </div>
                                )}
                                {browseTrack!.moods.length > 0 && (
                                    <div className="np-tags">
                                        {browseTrack!.moods.map(m => (
                                            <button key={m} className="np-tag np-tag--mood" onClick={() => handleFilterTag('mood', m)}>{m}</button>
                                        ))}
                                    </div>
                                )}
                                {browseTrack!.contexts.length > 0 && (
                                    <div className="np-tags">
                                        {browseTrack!.contexts.map(c => (
                                            <button key={c} className="np-tag np-tag--context" onClick={() => handleFilterTag('context', c)}>{c}</button>
                                        ))}
                                    </div>
                                )}
                                {browseTrack!.themes.length > 0 && (
                                    <div className="np-tags">
                                        {browseTrack!.themes.map(t => <span key={t} className="np-tag np-tag--theme">{t}</span>)}
                                    </div>
                                )}
                                {browseTrack!.energy !== null && (
                                    <div className="np-energy-row">
                                        <span className="np-energy-label">energy</span>
                                        <div className="np-energy-track">
                                            <div className="np-energy-fill" style={{ width: `${Math.round(browseTrack!.energy * 100)}%`, background: accentColor }} />
                                        </div>
                                        <span className="np-energy-val">{Math.round(browseTrack!.energy * 100)}</span>
                                    </div>
                                )}
                            </div>
                        )}

                        {browseTrack && (browseTrack.mbid || browseTrack.owner) && (
                            <div className="np-fields">
                                {browseTrack.mbid && (
                                    <div className="np-field">
                                        <span className="np-field-key">mbid</span>
                                        <span className="np-field-val np-mono">{browseTrack.mbid}</span>
                                    </div>
                                )}
                                {browseTrack.owner && (
                                    <div className="np-field">
                                        <span className="np-field-key">artist address</span>
                                        <span className="np-field-val np-mono">{browseTrack.owner.slice(0, 6)}…{browseTrack.owner.slice(-4)}</span>
                                    </div>
                                )}
                            </div>
                        )}

                        <div className="np-artist-section">
                            <div className="np-artist-section-label">more by {focusTrack.artist}</div>
                            {artistLoading ? (
                                <div className="np-artist-loading">
                                    <span className="upload-spinner" style={{ width: 14, height: 14, borderWidth: 1.5 }} />
                                </div>
                            ) : artistTracks.length === 0 ? (
                                <div className="np-artist-empty">No other tracks on the network</div>
                            ) : (
                                <div className="np-artist-list">
                                    {artistTracks.map((t, i) => (
                                        <button key={t.id || i} className="np-artist-row"
                                            onClick={async () => { if (!connected) await connect(); await searchAndPlay(`${t.title} ${t.artist}`) }}>
                                            <div className="np-artist-row-initial" style={{ color: accentColor }}>{t.title.slice(0, 1).toUpperCase()}</div>
                                            <div className="np-artist-row-info">
                                                <span className="np-artist-row-title">{t.title}</span>
                                                {t.year && <span className="np-artist-row-year">{t.year}</span>}
                                            </div>
                                            <svg className="np-artist-row-play" viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                                                <path d="M8 5.14v14l11-7-11-7z" />
                                            </svg>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                    </div>
                </div>

            </div>
        </div>
    )
}