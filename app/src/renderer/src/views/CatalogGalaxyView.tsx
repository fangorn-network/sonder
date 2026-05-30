/**
 * CatalogGalaxyView.tsx
 *
 * The entire embedding space — every track in ChromaDB projected to 2D via
 * UMAP, rendered as an interactive constellation.
 *
 * What you can see here that no other service shows you:
 *   · Genre clusters emerge naturally from the embedding geometry — you can
 *     literally see where Electronic ends and Ambient begins.
 *   · Your kernel μ (if wired) marks your current taste centre.
 *   · Play history traces a path through the space.
 *   · Every dot is a track you can click into.
 *
 * Controls: scroll to zoom, drag to pan, double-click to reset.
 * Hover any dot for artist/title card. Click to open its wiki article.
 * Use the search bar to highlight matching tracks across the whole space.
 *
 * Backend dependency: GET /catalog/map   (see catalog_map.py)
 *
 * Props:
 *   kernelState   — { mu, velocity, sigma } from Zustand store (optional)
 *   playHistory   — TrackNeighborData[] recent plays (optional)
 *   onTrackSelect — called when a dot is clicked
 *   onBack        — navigation callback
 */

import { useRef, useEffect, useState, useMemo, useCallback } from 'react'

// ── SOND3R palette ────────────────────────────────────────────────────────────

const BG      = '#050309'
const BG1     = '#08060f'
const BG2     = '#0c0a17'
const FG      = '#f2f0ff'
const FG2     = '#b0adcc'
const FG3     = '#6a678a'
const FG4     = '#3c3a55'
const ACCENT  = '#e8005a'
const TEAL    = '#00ffe7'
const VIOLET  = '#a78bfa'
const BORDER2 = 'rgba(255,255,255,0.08)'
const MONO    = 'var(--font-mono,"Fragment Mono","DM Mono",monospace)'
const SANS    = 'var(--font-body,"Geist","Inter",sans-serif)'
const DISP    = 'var(--font-display,"Bebas Neue",sans-serif)'
const BASE_URL = (import.meta as any).env?.VITE_CHROMA_URL ?? 'http://localhost:8080'

// ── Genre → colour (hue wheel by broad category) ──────────────────────────────

const GENRE_PALETTE: Record<string, string> = {
    electronic: '#00d4ff', house: '#00baee', techno: '#0099dd',
    ambient: '#4466ff', drone: '#3355ee', experimental: '#5544ff',
    'hip-hop': '#e8005a', rap: '#cc0044', trap: '#ff2255',
    pop: '#ff69b4', 'indie pop': '#ff88cc',
    rock: '#ff6a00', 'indie rock': '#ff8833', metal: '#cc4400',
    jazz: '#f0e040', soul: '#f5c842', blues: '#e8b830', funk: '#ffaa00',
    classical: '#c0b0ff', orchestral: '#b0a0ee',
    'r&b': '#ff99aa', 'neo-soul': '#ffbbaa',
    folk: '#88cc66', country: '#aacc44', acoustic: '#99bb55',
    reggae: '#33cc77', ska: '#22bb66',
    latin: '#ff8844', salsa: '#ff6633',
}

function genreHue(genre: string | null | undefined): string {
    if (!genre) return '#6a678a'
    const key = genre.toLowerCase()
    for (const [k, v] of Object.entries(GENRE_PALETTE)) {
        if (key.includes(k) || k.includes(key)) return v
    }
    // Deterministic hue from string hash
    let h = 0
    for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0
    const hue = (h % 360)
    return `hsl(${hue},65%,58%)`
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface CatalogTrack {
    id:     string
    title:  string
    artist: string
    genres: string[]
    moods:  string[]
    px:     number   // normalised [-1, 1]
    py:     number
}

interface GenreCentroid {
    genre: string
    px:    number
    py:    number
    count: number
}

export interface KernelState {
    mu:       Float32Array
    velocity: Float32Array
    sigma:    number
}

export interface GalaxyTrackRef {
    id:     string
    title:  string
    artist: string
    genres: string[]
}

export interface CatalogGalaxyProps {
    kernelState?:   KernelState
    playHistory?:   GalaxyTrackRef[]   // must have id matching catalog
    onTrackSelect?: (t: GalaxyTrackRef) => void
    onBack?:        () => void
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

export function CatalogGalaxyView({ kernelState, playHistory = [], onTrackSelect, onBack }: CatalogGalaxyProps) {
    const canvasRef    = useRef<HTMLCanvasElement>(null)
    const wrapperRef   = useRef<HTMLDivElement>(null)   // observed for sizing — canvas may start 0×0
    const rafRef       = useRef<number>(0)
    const viewRef      = useRef({ ox: 0, oy: 0, zoom: 1 })
    const dragRef      = useRef<{ sx: number; sy: number; ox: number; oy: number } | null>(null)
    const mousePosRef  = useRef<{ x: number; y: number } | null>(null)
    const dataRef      = useRef<{ tracks: CatalogTrack[]; genres: GenreCentroid[]; search: string; playIds: Set<string> }>({
        tracks: [], genres: [], search: '', playIds: new Set(),
    })

    const [tracks,    setTracks]    = useState<CatalogTrack[]>([])
    const [genres,    setGenres]    = useState<GenreCentroid[]>([])
    const [loading,   setLoading]   = useState(true)
    const [computing, setComputing] = useState(false)
    const [error,     setError]     = useState<string | null>(null)
    const [search,    setSearch]    = useState('')
    const [cursor,    setCursor]    = useState<'grab' | 'grabbing' | 'pointer'>('grab')
    const [hovered,   setHovered]   = useState<CatalogTrack | null>(null)
    const [mousePos,  setMousePos]  = useState({ x: 0, y: 0 })
    const [stats,     setStats]     = useState({ total: 0 })

    // ── Fetch catalog map ─────────────────────────────────────────────────────
    useEffect(() => {
        let cancelled = false
        setLoading(true); setError(null)

        const poll = async () => {
            try {
                const res  = await fetch(`${BASE_URL}/catalog/map`)
                if (!res.ok) throw new Error(`HTTP ${res.status}`)
                const data = await res.json()
                if (cancelled) return

                if (data.computing) {
                    setComputing(true)
                    setTimeout(poll, 3000)  // retry while computing
                    return
                }
                setComputing(false)
                setTracks(data.tracks ?? [])
                setGenres(data.genres ?? [])
                setStats({ total: data.total ?? 0 })
            } catch (e: any) {
                if (!cancelled) setError(e.message)
            } finally {
                if (!cancelled) setLoading(false)
            }
        }
        poll()
        return () => { cancelled = true }
    }, [])

    // Keep dataRef in sync (no re-render cost for hot path)
    const playIds = useMemo(() => new Set(playHistory.map(t => t.id)), [playHistory])
    useEffect(() => {
        dataRef.current = { tracks, genres, search, playIds }
    }, [tracks, genres, search, playIds])

    // ── DPR-correct canvas sizing ─────────────────────────────────────────────
    // Watch the wrapper div, not the canvas — the canvas starts at 0×0 and
    // won't trigger ResizeObserver until it already has a size, which is
    // circular. The wrapper has concrete dimensions from the flex layout.
    useEffect(() => {
        const canvas  = canvasRef.current
        const wrapper = wrapperRef.current
        if (!canvas || !wrapper) return
        const sync = () => {
            const dpr = window.devicePixelRatio || 1
            const { width: w, height: h } = wrapper.getBoundingClientRect()
            if (w && h) {
                canvas.width  = Math.round(w * dpr)
                canvas.height = Math.round(h * dpr)
            }
        }
        const ro = new ResizeObserver(sync)
        ro.observe(wrapper); sync()
        return () => ro.disconnect()
    }, [])

    // Non-passive wheel (zoom, not scroll)
    useEffect(() => {
        const canvas = canvasRef.current
        if (!canvas) return
        const onWheel = (e: WheelEvent) => {
            e.preventDefault()
            const rect = canvas.getBoundingClientRect()
            const mx = e.clientX - rect.left, my = e.clientY - rect.top
            const { ox, oy, zoom } = viewRef.current
            const nz = Math.max(0.25, Math.min(40, zoom * (e.deltaY > 0 ? 0.82 : 1.22)))
            viewRef.current = { ox: mx - (mx - ox) * (nz / zoom), oy: my - (my - oy) * (nz / zoom), zoom: nz }
        }
        canvas.addEventListener('wheel', onWheel, { passive: false })
        return () => canvas.removeEventListener('wheel', onWheel)
    }, [])

    // ── Pointer handlers ──────────────────────────────────────────────────────
    const onPointerDown = useCallback((e: React.PointerEvent) => {
        dragRef.current = { sx: e.clientX, sy: e.clientY, ox: viewRef.current.ox, oy: viewRef.current.oy }
        ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
        setCursor('grabbing')
    }, [])

    const onPointerMove = useCallback((e: React.PointerEvent) => {
        const rect = canvasRef.current?.getBoundingClientRect()
        if (rect) {
            const mp = { x: e.clientX - rect.left, y: e.clientY - rect.top }
            mousePosRef.current = mp
            setMousePos(mp)
        }
        if (dragRef.current) {
            const { sx, sy, ox, oy } = dragRef.current
            viewRef.current = { ...viewRef.current, ox: ox + e.clientX - sx, oy: oy + e.clientY - sy }
        }
    }, [])

    const onPointerUp = useCallback(() => { dragRef.current = null; setCursor('grab') }, [])
    const onPointerLeave = useCallback(() => {
        dragRef.current = null; setCursor('grab')
        mousePosRef.current = null; setHovered(null)
    }, [])

    const onDoubleClick = useCallback(() => { viewRef.current = { ox: 0, oy: 0, zoom: 1 } }, [])

    const onClick = useCallback((e: React.MouseEvent) => {
        if (!hovered) return
        onTrackSelect?.({ id: hovered.id, title: hovered.title, artist: hovered.artist, genres: hovered.genres })
    }, [hovered, onTrackSelect])

    // ── Pre-compute screen positions for current data ─────────────────────────
    // Tracks are in [-1, 1] normalised space. Scale to a "world" of ±500px at zoom=1.
    const WORLD = 500

    // ── Animation loop ────────────────────────────────────────────────────────
    useEffect(() => {
        const canvas = canvasRef.current
        if (!canvas) return
        const ctx = canvas.getContext('2d')!
        let running = true

        // Pre-group tracks by primary genre for batch rendering
        let grouped: Map<string, CatalogTrack[]> = new Map()
        let lastTrackCount = 0

        const draw = (ts: number) => {
            if (!running) return
            const dpr  = window.devicePixelRatio || 1
            const W    = canvas.width  / dpr
            const H    = canvas.height / dpr
            const { ox, oy, zoom } = viewRef.current
            const { tracks: tks, genres: gens, search: sq, playIds: pids } = dataRef.current
            const mouse = mousePosRef.current

            // Rebuild genre groups when data changes
            if (tks.length !== lastTrackCount) {
                lastTrackCount = tks.length
                grouped = new Map()
                for (const t of tks) {
                    const g = t.genres[0] ?? '__unknown'
                    if (!grouped.has(g)) grouped.set(g, [])
                    grouped.get(g)!.push(t)
                }
            }

            // World → screen
            const toScreen = (px: number, py: number) => ({
                sx: W / 2 + ox + px * WORLD * zoom,
                sy: H / 2 + oy + py * WORLD * zoom,
            })

            ctx.clearRect(0, 0, canvas.width, canvas.height)
            ctx.save(); ctx.scale(dpr, dpr)

            // Background
            ctx.fillStyle = BG; ctx.fillRect(0, 0, W, H)

            // Very subtle radial gradient centred on view
            const radX = W / 2 + ox, radY = H / 2 + oy
            const bg = ctx.createRadialGradient(radX, radY, 0, radX, radY, Math.max(W, H) * 0.7)
            bg.addColorStop(0, 'rgba(12,10,23,0.9)'); bg.addColorStop(1, BG)
            ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H)

            if (tks.length === 0) {
                ctx.restore()
                rafRef.current = requestAnimationFrame(draw)
                return
            }

            const hasSearch  = sq.trim().length > 0
            const searchLow  = sq.toLowerCase()
            const dotR       = Math.max(1.2, Math.min(4.5, zoom * 2.8))  // dot radius scales with zoom

            // ── Draw dots — one batch per genre ──────────────────────────────
            let hovCandidate: CatalogTrack | null = null
            let hovDist      = 18   // px threshold

            grouped.forEach((tracks2, genre) => {
                const col = genreHue(genre)
                ctx.fillStyle = col

                tracks2.forEach(t => {
                    const { sx, sy } = toScreen(t.px, t.py)

                    // Cull off-screen
                    if (sx < -20 || sx > W + 20 || sy < -20 || sy > H + 20) return

                    const isPlay   = pids.has(t.id)
                    const isMatch  = hasSearch && (
                        t.artist.toLowerCase().includes(searchLow) ||
                        t.title.toLowerCase().includes(searchLow)
                    )
                    const dim      = hasSearch && !isMatch && !isPlay

                    // Hover detection
                    if (mouse) {
                        const d = Math.hypot(sx - mouse.x, sy - mouse.y)
                        if (d < hovDist) { hovDist = d; hovCandidate = t }
                    }

                    const isHov    = hovCandidate?.id === t.id
                    const r        = isHov ? dotR * 2.2 : isPlay ? dotR * 1.6 : isMatch ? dotR * 1.8 : dotR
                    const alpha    = dim ? 0.12 : isHov ? 1.0 : isPlay ? 0.9 : isMatch ? 0.95 : 0.62

                    ctx.globalAlpha = alpha

                    if (isHov) {
                        ctx.shadowColor = col; ctx.shadowBlur = 12
                    } else if (isPlay) {
                        ctx.shadowColor = VIOLET; ctx.shadowBlur = 6
                        ctx.fillStyle   = VIOLET
                    } else if (isMatch) {
                        ctx.shadowColor = col; ctx.shadowBlur = 8
                    } else {
                        ctx.shadowBlur = 0; ctx.fillStyle = col
                    }

                    ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2); ctx.fill()
                    ctx.shadowBlur = 0; ctx.fillStyle = col; ctx.globalAlpha = 1
                })
            })

            // ── Kernel μ ──────────────────────────────────────────────────────
            // We don't have the exact UMAP position of μ, so we show it at the
            // weighted centroid of history tracks (good enough approximation).
            if (pids.size > 0) {
                const histTracks = tks.filter(t => pids.has(t.id))
                if (histTracks.length) {
                    const mx2 = histTracks.reduce((s, t) => s + t.px, 0) / histTracks.length
                    const my2 = histTracks.reduce((s, t) => s + t.py, 0) / histTracks.length
                    const { sx: kx, sy: ky } = toScreen(mx2, my2)
                    const pulse = Math.sin(ts * 0.0018) * 0.5 + 0.5

                    ;[60, 36, 20].forEach((r, i) => {
                        ctx.beginPath(); ctx.arc(kx, ky, r * zoom + pulse * 8 * zoom, 0, Math.PI * 2)
                        ctx.fillStyle = `rgba(0,255,231,${[0.03, 0.06, 0.12][i] + pulse * 0.04})`
                        ctx.fill()
                    })
                    ctx.shadowColor = TEAL; ctx.shadowBlur = 16
                    ctx.beginPath(); ctx.arc(kx, ky, 7, 0, Math.PI * 2)
                    ctx.fillStyle = TEAL; ctx.fill(); ctx.shadowBlur = 0
                    ctx.font = `10px ${MONO}`; ctx.fillStyle = 'rgba(0,255,231,0.5)'
                    ctx.textAlign = 'center'; ctx.fillText('μ your taste', kx, ky - 13)
                }
            }

            // ── Genre labels (only when zoomed in enough) ─────────────────────
            const showGenreLabels = zoom > 0.6
            const showTrackLabels = zoom > 3.5

            if (showGenreLabels) {
                gens.forEach(({ genre, px: gpx, py: gpy, count }) => {
                    const { sx, sy } = toScreen(gpx, gpy)
                    if (sx < 0 || sx > W || sy < 0 || sy > H) return
                    const alpha = Math.min(1, (zoom - 0.6) / 0.8)
                    ctx.globalAlpha = alpha * 0.55
                    ctx.font        = `${Math.min(13, 8 + count * 0.02)}px ${DISP}`
                    ctx.fillStyle   = FG2
                    ctx.textAlign   = 'center'
                    ctx.letterSpacing = '0.08em'
                    ctx.fillText(genre.toUpperCase(), sx, sy)
                    ctx.globalAlpha = 1
                })
            }

            // ── Track labels when very zoomed in ─────────────────────────────
            if (showTrackLabels) {
                const alpha = Math.min(1, (zoom - 3.5) / 1.5)
                ctx.globalAlpha = alpha
                tks.forEach(t => {
                    const { sx, sy } = toScreen(t.px, t.py)
                    if (sx < 0 || sx > W || sy < 0 || sy > H) return
                    ctx.font      = `9px ${SANS}`
                    ctx.fillStyle = FG3
                    ctx.textAlign = 'center'
                    ctx.fillText(t.artist.length > 14 ? t.artist.slice(0, 12) + '…' : t.artist, sx, sy - dotR - 3)
                })
                ctx.globalAlpha = 1
            }

            // ── Update React hover state ──────────────────────────────────────
            // We do this via a ref check to avoid stale closure issues
            if (hovCandidate) {
                setHovered(prev => prev?.id === (hovCandidate as CatalogTrack).id ? prev : hovCandidate)
                setCursor(prev => prev === 'grabbing' ? prev : 'pointer')
            } else {
                setHovered(prev => prev ? null : prev)
                setCursor(prev => prev === 'grabbing' ? prev : 'grab')
            }

            // ── Stats HUD ─────────────────────────────────────────────────────
            ctx.font      = `9px ${MONO}`; ctx.textAlign = 'left'
            ctx.fillStyle = 'rgba(255,255,255,0.12)'
            ctx.fillText(`${tks.length.toLocaleString()} tracks · scroll to zoom · drag to pan · click to open`, 12, H - 12)
            if (hasSearch) {
                const hits = tks.filter(t =>
                    t.artist.toLowerCase().includes(searchLow) ||
                    t.title.toLowerCase().includes(searchLow)
                ).length
                ctx.fillStyle = ACCENT
                ctx.fillText(`${hits} match${hits === 1 ? '' : 'es'} for "${sq}"`, 12, H - 25)
            }

            ctx.restore()
            rafRef.current = requestAnimationFrame(draw)
        }

        rafRef.current = requestAnimationFrame(draw)
        return () => { running = false; cancelAnimationFrame(rafRef.current) }
    }, [])

    // ─────────────────────────────────────────────────────────────────────────
    return (
        <div style={{ position: 'relative', width: '100%', height: '100%', background: BG, overflow: 'hidden', fontFamily: SANS }}>

            {/* Canvas — position:absolute so it fills the wrapper regardless of
                inherited height. wrapperRef drives the ResizeObserver. */}
            <div ref={wrapperRef} style={{ position: 'absolute', inset: 0 }}>
                <canvas
                    ref={canvasRef}
                    onPointerDown={onPointerDown}
                    onPointerMove={onPointerMove}
                    onPointerUp={onPointerUp}
                    onPointerLeave={onPointerLeave}
                    onDoubleClick={onDoubleClick}
                    onClick={onClick}
                    style={{ display: 'block', width: '100%', height: '100%', cursor, touchAction: 'none' }}
                />
            </div>

            {/* </div> */}

            {/* ── Top bar ─────────────────────────────────────────────────── */}
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, display: 'flex', alignItems: 'center', gap: 10, padding: '0 14px', height: 48, background: 'rgba(5,3,9,0.85)', borderBottom: `3px solid ${ACCENT}`, backdropFilter: 'blur(8px)', zIndex: 10 }}>
                {onBack && (
                    <button onClick={onBack} style={{ background: 'none', border: `1px solid ${BORDER2}`, color: FG3, fontSize: 10, padding: '4px 10px', cursor: 'pointer', fontFamily: MONO, letterSpacing: '0.08em', textTransform: 'uppercase', flexShrink: 0 }}>
                        ← back
                    </button>
                )}
                <div style={{ fontFamily: DISP, fontSize: 22, color: FG, letterSpacing: '0.06em', flexShrink: 0 }}>
                    EMBEDDING SPACE
                </div>
                <div style={{ fontFamily: MONO, fontSize: 9, color: FG4, letterSpacing: '0.06em', flexShrink: 0 }}>
                    {stats.total > 0 ? `${stats.total.toLocaleString()} tracks` : ''}
                </div>
                {/* Search */}
                <input
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder='search artist or title…'
                    style={{ flex: 1, maxWidth: 280, background: 'transparent', border: 'none', borderBottom: `1px solid ${BORDER2}`, color: FG, fontSize: 12, padding: '3px 0', outline: 'none', fontFamily: MONO, letterSpacing: '0.04em' }}
                />
                {search && (
                    <button onClick={() => setSearch('')} style={{ background: 'none', border: 'none', color: FG4, fontSize: 11, cursor: 'pointer', fontFamily: MONO }}>✕</button>
                )}
                {/* Refresh */}
                <button
                    onClick={() => fetch(`${BASE_URL}/catalog/map/refresh`, { method: 'POST' }).then(() => window.location.reload())}
                    style={{ background: 'none', border: `1px solid ${BORDER2}`, color: FG4, fontSize: 9, padding: '4px 9px', cursor: 'pointer', fontFamily: MONO, letterSpacing: '0.08em', textTransform: 'uppercase', flexShrink: 0 }}
                    title="Recompute projection after adding new tracks"
                >
                    refresh map
                </button>
            </div>

            {/* ── Loading / computing ──────────────────────────────────────── */}
            {(loading || computing) && (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16, background: 'rgba(5,3,9,0.9)', zIndex: 20 }}>
                    <div style={{ fontFamily: DISP, fontSize: 64, color: ACCENT, letterSpacing: '0.06em', lineHeight: 1 }}>
                        {computing ? 'PROJECTING' : 'LOADING'}
                    </div>
                    <div style={{ fontFamily: MONO, fontSize: 10, color: FG4, letterSpacing: '0.14em', textTransform: 'uppercase', maxWidth: 340, textAlign: 'center', lineHeight: 1.8 }}>
                        {computing
                            ? 'UMAP is computing the 2D projection of your entire catalog.\nThis runs once and is cached — usually takes 30s–5min depending on catalog size.'
                            : 'Fetching projection from server…'
                        }
                    </div>
                    <div style={{ width: 24, height: 24, border: `2px solid white`, borderTopColor: ACCENT, borderRadius: '50%', animation: 'galaxy-spin 0.7s linear infinite' }}/>
                    <style>{`@keyframes galaxy-spin{to{transform:rotate(360deg)}}`}</style>
                </div>
            )}

            {error && (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 10, zIndex: 20 }}>
                    <div style={{ fontFamily: DISP, fontSize: 32, color: ACCENT }}>ERROR</div>
                    <div style={{ fontFamily: MONO, fontSize: 11, color: FG3 }}>{error}</div>
                    <div style={{ fontFamily: MONO, fontSize: 10, color: FG4 }}>
                        Make sure the backend is running and catalog_map.py is wired in.
                    </div>
                </div>
            )}

            {/* ── Hover tooltip ────────────────────────────────────────────── */}
            {hovered && !loading && (
                <div style={{
                    position:   'fixed',
                    left:       Math.min(window.innerWidth - 220, mousePos.x + 16),
                    top:        mousePos.y - 80 < 60 ? mousePos.y + 16 : mousePos.y - 76,
                    width:      210,
                    background: 'rgba(5,3,9,0.92)',
                    border:     `1px solid ${genreHue(hovered.genres[0])}55`,
                    borderLeft: `3px solid ${genreHue(hovered.genres[0])}`,
                    padding:    '10px 12px',
                    backdropFilter: 'blur(12px)',
                    pointerEvents:  'none',
                    zIndex:     30,
                }}>
                    <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 600, color: FG, marginBottom: 2 }}>{hovered.artist}</div>
                    <div style={{ fontFamily: MONO, fontSize: 10, color: FG3, marginBottom: 7 }}>{hovered.title}</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {hovered.genres.slice(0, 3).map(g => (
                            <span key={g} style={{ fontFamily: MONO, fontSize: 8, letterSpacing: '0.10em', textTransform: 'uppercase', color: genreHue(g), background: genreHue(g) + '18', border: `1px solid ${genreHue(g)}35`, padding: '2px 6px' }}>
                                {g}
                            </span>
                        ))}
                    </div>
                    {onTrackSelect && (
                        <div style={{ fontFamily: MONO, fontSize: 8, color: FG4, marginTop: 8, letterSpacing: '0.08em' }}>click to open article →</div>
                    )}
                </div>
            )}

            {/* ── Legend ───────────────────────────────────────────────────── */}
            <div style={{ position: 'absolute', bottom: 32, right: 14, display: 'flex', flexDirection: 'column', gap: 4, background: 'rgba(5,3,9,0.7)', border: `1px solid ${BORDER2}`, padding: '10px 12px', backdropFilter: 'blur(8px)', zIndex: 10 }}>
                <div style={{ fontFamily: MONO, fontSize: 8, color: FG4, letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 4 }}>Legend</div>
                {[
                    { col: TEAL,   label: 'your taste (μ)' },
                    { col: VIOLET, label: 'play history'   },
                    { col: ACCENT, label: 'search match'   },
                ].map(({ col, label }) => (
                    <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                        <div style={{ width: 7, height: 7, background: col, flexShrink: 0 }}/>
                        <span style={{ fontFamily: MONO, fontSize: 9, color: FG4, letterSpacing: '0.04em' }}>{label}</span>
                    </div>
                ))}
            </div>
        </div>
    )
}