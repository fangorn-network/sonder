/**
 * ArtistNeighborhoodView.tsx
 *
 * Sound Map — shows where a track lives among similar music,
 * in plain language anyone can understand.
 *
 * Entry points:
 *   1. Direct — user navigates to the Analyze tab, types a query.
 *   2. Contextual — user taps "Explore sound map" on a NowPlaying track.
 *      App passes `initialQuery`; this component auto-fires its search.
 */

import {
    useState, useRef, useEffect, useMemo, useCallback,
    type PointerEvent as ReactPointerEvent,
    type WheelEvent as ReactWheelEvent,
} from 'react'
import {
    buildNeighborhood,
    genreColor,
    soundSimilarity,
    competitionLabel,
    soundPositionMeta,
    type TrackNeighborData,
    type ProjectedPoint,
    type NeighborhoodMetrics,
} from '../kernel/neighborhoodAnalysis'

// ── Config ────────────────────────────────────────────────────────────────────

const BASE_URL    = 'http://localhost:8080'
const N_NEIGHBORS = 50
const TEAL        = '#00ffe7'
const DARK_BG     = '#0d0d14'
const PANEL_BG    = '#111118'
const BORDER      = 'rgba(255,255,255,0.07)'
const SVG_W       = 600
const SVG_H       = 520
const MARGIN      = 52

// ── API ───────────────────────────────────────────────────────────────────────

interface RawChromaHit {
    id: string
    embedding: number[]
    distance: number
    fields?: {
        byArtist?:    string
        trackId?:     string
        title?:       string
        isrcCode?:    string
        durationMs?:  number
        contributors?: string[]
        genres?:      string[]
        moods?:       string[]
        themes?:      string[]
        contexts?:    string[]
        artistId?:    string
    }
}

async function apiEmbed(text: string): Promise<Float32Array> {
    const res = await fetch(`${BASE_URL}/embed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
    })
    if (!res.ok) throw new Error(`Search failed (${res.status})`)
    return new Float32Array((await res.json()).embedding)
}

async function apiSearchVector(embedding: Float32Array, n: number): Promise<RawChromaHit[]> {
    const res = await fetch(`${BASE_URL}/search/vector`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ embedding: Array.from(embedding), n_results: n }),
    })
    if (!res.ok) throw new Error(`Search failed (${res.status})`)
    return (await res.json()).results as RawChromaHit[]
}

function toNeighborData(hit: RawChromaHit, dist: number): TrackNeighborData {
    const m = hit.fields ?? {}
    return {
        id:         hit.id,
        artist:     m.byArtist  ?? 'Unknown Artist',
        title:      m.title     ?? hit.id,
        isrc:       m.isrcCode,
        durationMs: m.durationMs ?? 0,
        genres:     m.genres    ?? [],
        moods:      m.moods     ?? [],
        themes:     m.themes    ?? [],
        contexts:   m.contexts  ?? [],
        embedding:  new Float32Array(hit.embedding),
        distance:   dist,
    }
}

// ── Scales ────────────────────────────────────────────────────────────────────

function buildScales(pts: ProjectedPoint[], w: number, h: number, margin: number) {
    const xs = pts.map(p => p.px), ys = pts.map(p => p.py)
    const xMin = Math.min(...xs), xMax = Math.max(...xs)
    const yMin = Math.min(...ys), yMax = Math.max(...ys)
    const xR = xMax - xMin || 1, yR = yMax - yMin || 1, pad = 0.18
    const xScale = (px: number) =>
        margin + ((px - xMin + xR * pad) / (xR * (1 + 2 * pad))) * (w - 2 * margin)
    const yScale = (py: number) =>
        (h - margin) - ((py - yMin + yR * pad) / (yR * (1 + 2 * pad))) * (h - 2 * margin)
    return { xScale, yScale }
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface Tooltip { visible: boolean; x: number; y: number; point: ProjectedPoint | null }
interface ViewState { ox: number; oy: number; scale: number }
interface Props { initialQuery?: string; onQueryConsumed?: () => void }

// ─────────────────────────────────────────────────────────────────────────────

export function ArtistNeighborhoodView({ initialQuery, onQueryConsumed }: Props) {
    const [query,   setQuery]   = useState('')
    const [loading, setLoading] = useState(false)
    const [error,   setError]   = useState<string | null>(null)
    const [focal,   setFocal]   = useState<TrackNeighborData | null>(null)
    const [pts,     setPts]     = useState<ProjectedPoint[]>([])
    const [metrics, setMetrics] = useState<NeighborhoodMetrics | null>(null)
    const [tip,     setTip]     = useState<Tooltip>({ visible: false, x: 0, y: 0, point: null })
    const [view,    setView]    = useState<ViewState>({ ox: 0, oy: 0, scale: 1 })
    const [hovered, setHovered] = useState<string | null>(null)

    const svgRef  = useRef<SVGSVGElement>(null)
    const dragRef = useRef<{ sx: number; sy: number; ox: number; oy: number } | null>(null)

    // ── Search ────────────────────────────────────────────────────────────────
    const runSearch = useCallback(async (q: string) => {
        const query = q.trim()
        if (!query) return
        setLoading(true); setError(null); setPts([]); setMetrics(null)
        setFocal(null); setView({ ox: 0, oy: 0, scale: 1 })
        try {
            const emb  = await apiEmbed(query)
            const hits = await apiSearchVector(emb, N_NEIGHBORS + 1)
            if (!hits.length) throw new Error('We couldn\'t find that track. Try "Artist – Track title".')
            const focal = toNeighborData(hits[0], 0)
            const nbrs  = hits.slice(1).map(h => toNeighborData(h, Math.sqrt(h.distance)))
            const { points, metrics } = buildNeighborhood(focal, nbrs)
            setFocal(focal); setPts(points); setMetrics(metrics)
        } catch (e: any) {
            setError(e?.message ?? 'Something went wrong — try again.')
        } finally {
            setLoading(false)
        }
    }, [])

    const handleSearch = useCallback(() => runSearch(query), [query, runSearch])

    // ── Auto-fire from NowPlaying ─────────────────────────────────────────────
    useEffect(() => {
        if (!initialQuery) return
        setQuery(initialQuery)
        runSearch(initialQuery)
        onQueryConsumed?.()
    }, [initialQuery])

    // ── Scales + rings ────────────────────────────────────────────────────────
    const { xScale, yScale } = useMemo(
        () => pts.length
            ? buildScales(pts, SVG_W, SVG_H, MARGIN)
            : { xScale: (x: number) => x, yScale: (y: number) => y },
        [pts],
    )

    const rings = useMemo(() => {
        const f = pts.find(p => p.isFocal)
        if (!f) return []
        const fx = xScale(f.px), fy = yScale(f.py)
        const d2 = pts.filter(p => !p.isFocal)
            .map(p => Math.hypot(xScale(p.px) - fx, yScale(p.py) - fy))
            .sort((a, b) => a - b)
        return [0.25, 0.5, 0.75]
            .map(frac => d2[Math.floor(frac * d2.length)] ?? 0)
            .filter(r => r > 0)
    }, [pts, xScale, yScale])

    // ── Zoom / pan ────────────────────────────────────────────────────────────
    const onWheel = useCallback((e: ReactWheelEvent<SVGSVGElement>) => {
        e.preventDefault()
        const rect = svgRef.current!.getBoundingClientRect()
        const mx = e.clientX - rect.left, my = e.clientY - rect.top
        const ns = Math.max(0.25, Math.min(20, view.scale * (e.deltaY > 0 ? 0.82 : 1.22)))
        setView({
            ox: mx - (mx - view.ox) * (ns / view.scale),
            oy: my - (my - view.oy) * (ns / view.scale),
            scale: ns,
        })
    }, [view])

    const onPtrDown = useCallback((e: ReactPointerEvent<SVGSVGElement>) => {
        dragRef.current = { sx: e.clientX, sy: e.clientY, ox: view.ox, oy: view.oy }
        svgRef.current?.setPointerCapture(e.pointerId)
    }, [view])

    const onPtrMove = useCallback((e: ReactPointerEvent<SVGSVGElement>) => {
        if (!dragRef.current) return
        const { sx, sy, ox, oy } = dragRef.current
        setView(v => ({ ...v, ox: ox + e.clientX - sx, oy: oy + e.clientY - sy }))
    }, [])

    const onPtrUp = useCallback(() => { dragRef.current = null }, [])

    const onEnter = useCallback((e: React.MouseEvent, p: ProjectedPoint) => {
        const r = svgRef.current!.getBoundingClientRect()
        setTip({ visible: true, x: e.clientX - r.left, y: e.clientY - r.top, point: p })
        setHovered(p.id)
    }, [])

    const onLeave = useCallback(() => {
        setTip(t => ({ ...t, visible: false }))
        setHovered(null)
    }, [])

    // ── Derived ───────────────────────────────────────────────────────────────
    const posMeta    = metrics ? soundPositionMeta(metrics.soundPosition) : null
    const compMeta   = metrics ? competitionLabel(metrics.density10)       : null
    const focalPt    = pts.find(p => p.isFocal)
    const soundsLike = pts.filter(p => !p.isFocal).sort((a, b) => a.distance - b.distance)

    // ─────────────────────────────────────────────────────────────────────────
    // Render
    // ─────────────────────────────────────────────────────────────────────────

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: DARK_BG, color: 'var(--color-text-primary,#e8e8f0)', fontFamily: 'var(--font-sans,"DM Sans",sans-serif)', overflow: 'hidden' }}>

            {/* ── Header ─────────────────────────────────────────────────────── */}
            <div style={{ padding: '14px 20px', borderBottom: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
                <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-0.01em', lineHeight: 1.2 }}>
                        Sound Map
                    </div>
                    {focal ? (
                        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', marginTop: 2 }}>
                            <span style={{ color: TEAL }}>{focal.artist}</span>
                            <span style={{ margin: '0 5px', opacity: 0.4 }}>—</span>
                            {focal.title}
                        </div>
                    ) : (
                        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', marginTop: 2 }}>
                            see where a track lives among similar music
                        </div>
                    )}
                </div>

                <input
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleSearch()}
                    placeholder='Artist – Track title'
                    style={{ background: 'rgba(255,255,255,0.05)', border: `1px solid ${BORDER}`, borderRadius: 0, color: 'inherit', fontSize: 13, padding: '7px 12px', width: 240, outline: 'none' }}
                />
                <button
                    onClick={handleSearch}
                    disabled={loading || !query.trim()}
                    style={{ background: loading ? 'rgba(0,255,231,0.1)' : TEAL, border: 'none', borderRadius: 0, color: loading ? TEAL : '#0d0d14', fontSize: 12, fontWeight: 700, letterSpacing: '0.05em', padding: '7px 18px', cursor: loading ? 'default' : 'pointer', textTransform: 'uppercase' }}
                >
                    {loading ? 'Mapping...' : 'Map it'}
                </button>
            </div>

            {error && (
                <div style={{ padding: '10px 20px', background: 'rgba(248,113,113,0.08)', color: '#f87171', fontSize: 13, borderBottom: `1px solid ${BORDER}` }}>
                    {error}
                </div>
            )}

            <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

                {/* ── Map ──────────────────────────────────────────────────────── */}
                <div style={{ position: 'relative', flex: '0 0 62%', borderRight: `1px solid ${BORDER}`, overflow: 'hidden' }}>

                    {/* Empty state */}
                    {!pts.length && !loading && (
                        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, color: 'rgba(255,255,255,0.15)', padding: 40, textAlign: 'center' }}>
                            <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
                                <circle cx="24" cy="24" r="22" stroke="currentColor" strokeWidth="1" strokeDasharray="4 3"/>
                                <circle cx="24" cy="24" r="3.5" fill="currentColor"/>
                                <circle cx="12" cy="16" r="2.5" fill="currentColor" opacity=".5"/>
                                <circle cx="36" cy="30" r="2.5" fill="currentColor" opacity=".5"/>
                                <circle cx="32" cy="13" r="2" fill="currentColor" opacity=".35"/>
                                <circle cx="15" cy="34" r="2" fill="currentColor" opacity=".35"/>
                                <circle cx="38" cy="18" r="1.5" fill="currentColor" opacity=".25"/>
                                <circle cx="10" cy="28" r="1.5" fill="currentColor" opacity=".25"/>
                            </svg>
                            <div>
                                <div style={{ fontSize: 14, fontWeight: 500, color: 'rgba(255,255,255,0.28)', marginBottom: 6 }}>
                                    Where does this music live?
                                </div>
                                <div style={{ fontSize: 12, lineHeight: 1.6 }}>
                                    Enter an artist and track above to see who they sound like<br/>
                                    and whether they're in crowded or open sonic territory.
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Loading */}
                    {loading && (
                        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 14 }}>
                            <div style={{ width: 28, height: 28, border: `2px solid rgba(0,255,231,0.2)`, borderTopColor: TEAL, borderRadius: '50%', animation: 'spin 0.8s linear infinite' }}/>
                            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.04em' }}>
                                Building your sound map...
                            </div>
                            <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
                        </div>
                    )}

                    {pts.length > 0 && (
                        <>
                            {/* Reset view */}
                            <button
                                onClick={() => setView({ ox: 0, oy: 0, scale: 1 })}
                                style={{ position: 'absolute', top: 12, right: 12, zIndex: 10, background: 'rgba(255,255,255,0.05)', border: `1px solid ${BORDER}`, color: 'rgba(255,255,255,0.35)', fontSize: 10, padding: '4px 10px', cursor: 'pointer', borderRadius: 0, letterSpacing: '0.06em', textTransform: 'uppercase' }}
                            >
                                Reset view
                            </button>

                            {/* Map hint */}
                            <div style={{ position: 'absolute', bottom: 12, left: 16, zIndex: 10, fontSize: 10, color: 'rgba(255,255,255,0.18)', lineHeight: 1.7 }}>
                                Each dot is a track · closer = sounds more alike · scroll to zoom
                            </div>

                            <svg
                                ref={svgRef}
                                width="100%" height="100%"
                                viewBox={`0 0 ${SVG_W} ${SVG_H}`}
                                style={{ cursor: dragRef.current ? 'grabbing' : 'grab', display: 'block' }}
                                onWheel={onWheel} onPointerDown={onPtrDown} onPointerMove={onPtrMove}
                                onPointerUp={onPtrUp} onPointerLeave={onPtrUp}
                            >
                                <rect width={SVG_W} height={SVG_H} fill={DARK_BG}/>

                                <g transform={`translate(${view.ox},${view.oy}) scale(${view.scale})`}>

                                    {/* Distance rings */}
                                    {focalPt && rings.map((r, i) => (
                                        <circle
                                            key={i}
                                            cx={xScale(focalPt.px)} cy={yScale(focalPt.py)} r={r}
                                            fill="none"
                                            stroke="rgba(255,255,255,0.1)"
                                            strokeWidth={0.7}
                                            strokeDasharray="3 6"
                                        />
                                    ))}

                                    {/* Neighbor dots */}
                                    {pts.filter(p => !p.isFocal).map(p => {
                                        const col = genreColor(p.genres[0] ?? null)
                                        const isH = p.id === hovered
                                        return (
                                            <g key={p.id}>
                                                {/* Invisible hit target */}
                                                <circle
                                                    cx={xScale(p.px)} cy={yScale(p.py)} r={isH ? 12 : 10}
                                                    fill="transparent"
                                                    style={{ cursor: 'pointer' }}
                                                    onMouseEnter={e => onEnter(e, p)}
                                                    onMouseLeave={onLeave}
                                                />
                                                <circle
                                                    cx={xScale(p.px)} cy={yScale(p.py)} r={isH ? 7 : 5}
                                                    fill={col}
                                                    opacity={isH ? 0.95 : 0.48}
                                                    stroke={isH ? 'rgba(255,255,255,0.6)' : 'none'}
                                                    strokeWidth={1.2}
                                                    style={{ pointerEvents: 'none', transition: 'opacity 0.12s' }}
                                                />
                                                {isH && (
                                                    <text
                                                        x={xScale(p.px)} y={yScale(p.py) - 13}
                                                        textAnchor="middle" fontSize={9.5}
                                                        fill="rgba(255,255,255,0.7)"
                                                        style={{ pointerEvents: 'none', userSelect: 'none' }}
                                                    >
                                                        {p.artist}
                                                    </text>
                                                )}
                                            </g>
                                        )
                                    })}

                                    {/* Focal track — "you are here" */}
                                    {focalPt && (() => {
                                        const fx = xScale(focalPt.px), fy = yScale(focalPt.py)
                                        return (
                                            <g>
                                                <circle cx={fx} cy={fy} r={22} fill={TEAL} opacity={0.06}/>
                                                <circle cx={fx} cy={fy} r={15} fill={TEAL} opacity={0.10}/>
                                                <circle
                                                    cx={fx} cy={fy} r={9} fill={TEAL} opacity={0.95}
                                                    onMouseEnter={e => onEnter(e, focalPt)}
                                                    onMouseLeave={onLeave}
                                                    style={{ cursor: 'pointer' }}
                                                />
                                                <text
                                                    x={fx} y={fy - 18} textAnchor="middle"
                                                    fontSize={10.5} fill={TEAL} fontWeight={700}
                                                    fontFamily="var(--font-mono,'DM Mono',monospace)"
                                                    style={{ pointerEvents: 'none', userSelect: 'none' }}
                                                >
                                                    {focalPt.artist}
                                                </text>
                                                <text
                                                    x={fx} y={fy + 22} textAnchor="middle"
                                                    fontSize={8} fill="rgba(0,255,231,0.45)"
                                                    style={{ pointerEvents: 'none', userSelect: 'none' }}
                                                >
                                                    you are here
                                                </text>
                                            </g>
                                        )
                                    })()}
                                </g>
                            </svg>

                            {/* Tooltip */}
                            {tip.visible && tip.point && (
                                <div style={{ position: 'absolute', left: tip.x + 14, top: tip.y - 8, background: '#1c1c2a', border: `1px solid ${BORDER}`, padding: '9px 13px', fontSize: 12, lineHeight: 1.65, pointerEvents: 'none', zIndex: 20, maxWidth: 220, boxShadow: '0 6px 24px rgba(0,0,0,0.5)' }}>
                                    <div style={{ fontWeight: 600, color: tip.point.isFocal ? TEAL : 'rgba(255,255,255,0.9)', marginBottom: 2 }}>
                                        {tip.point.artist}
                                    </div>
                                    <div style={{ color: 'rgba(255,255,255,0.75)', marginBottom: tip.point.isFocal ? 0 : 5 }}>
                                        {tip.point.title}
                                    </div>
                                    {!tip.point.isFocal && (
                                        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.38)', fontStyle: 'italic' }}>
                                            {soundSimilarity(tip.point.distance)}
                                        </div>
                                    )}
                                    {tip.point.genres.length > 0 && (
                                        <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                                            {tip.point.genres.slice(0, 3).map(g => (
                                                <span key={g} style={{ fontSize: 9, padding: '2px 7px', background: genreColor(g) + '2a', color: genreColor(g), border: `1px solid ${genreColor(g)}4a`, borderRadius: 2 }}>
                                                    {g}
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
                        </>
                    )}
                </div>

                {/* ── Info panel ───────────────────────────────────────────────── */}
                <div style={{ flex: '0 0 38%', overflowY: 'auto', padding: '22px 20px', display: 'flex', flexDirection: 'column', gap: 24, background: PANEL_BG }}>

                    {!metrics && !loading && (
                        <div style={{ color: 'rgba(255,255,255,0.15)', fontSize: 13, marginTop: 80, textAlign: 'center', lineHeight: 1.7 }}>
                            Map a track to see<br/>where it fits
                        </div>
                    )}

                    {metrics && posMeta && compMeta && (
                        <>
                            {/* ── Where You Stand ──────────────────────────────── */}
                            <div>
                                <SectionLabel>Where You Stand</SectionLabel>
                                <div style={{ border: `1px solid ${posMeta.color}33`, background: `${posMeta.color}0d`, padding: '14px 16px' }}>
                                    <div style={{ fontSize: 18, fontWeight: 700, color: posMeta.color, letterSpacing: '-0.02em', marginBottom: 4 }}>
                                        {posMeta.label}
                                    </div>
                                    <div style={{ fontSize: 12, color: posMeta.color, opacity: 0.65, marginBottom: 8, fontStyle: 'italic' }}>
                                        {posMeta.tagline}
                                    </div>
                                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', lineHeight: 1.7 }}>
                                        {posMeta.description}
                                    </div>
                                </div>
                            </div>

                            {/* ── The Competition ──────────────────────────────── */}
                            <div>
                                <SectionLabel>The Competition</SectionLabel>

                                <div style={{ marginBottom: 12 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
                                        <span style={{ fontSize: 16, fontWeight: 700, color: compMeta.color }}>
                                            {compMeta.label}
                                        </span>
                                        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.22)', letterSpacing: '0.04em' }}>
                                            how crowded is your sound?
                                        </span>
                                    </div>
                                    {/* Density bar — filled segments = direct sound-alikes */}
                                    <div style={{ display: 'flex', gap: 3, marginBottom: 8 }}>
                                        {Array.from({ length: 10 }, (_, i) => (
                                            <div key={i} style={{
                                                flex: 1, height: 5,
                                                background: i < metrics.density10
                                                    ? compMeta.color
                                                    : 'rgba(255,255,255,0.07)',
                                                transition: 'background 0.3s',
                                            }}/>
                                        ))}
                                    </div>
                                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', lineHeight: 1.65 }}>
                                        {compMeta.description}
                                    </div>
                                </div>

                                {/* Nearest sound-alike */}
                                {metrics.nearestNeighbor && (
                                    <div style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid ${BORDER}`, padding: '10px 12px' }}>
                                        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.28)', letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 6 }}>
                                            Closest sound-alike
                                        </div>
                                        <div style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.85)' }}>
                                            {metrics.nearestNeighbor.artist}
                                        </div>
                                        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', marginBottom: 4 }}>
                                            {metrics.nearestNeighbor.title}
                                        </div>
                                        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.28)', fontStyle: 'italic' }}>
                                            {soundSimilarity(metrics.nearestDistance)}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* ── Your Sound ───────────────────────────────────── */}
                            {metrics.primaryGenre && (
                                <div>
                                    <SectionLabel>Your Sound</SectionLabel>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                                        <div style={{
                                            flex: 1, height: 4,
                                            background: `linear-gradient(to right, ${genreColor(metrics.primaryGenre)} ${metrics.genrePurity * 100}%, rgba(255,255,255,0.06) ${metrics.genrePurity * 100}%)`,
                                        }}/>
                                        <span style={{ fontSize: 13, fontWeight: 600, color: genreColor(metrics.primaryGenre), whiteSpace: 'nowrap' }}>
                                            {metrics.primaryGenre}
                                        </span>
                                    </div>
                                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', lineHeight: 1.65 }}>
                                        {metrics.genrePurity >= 0.7
                                            ? `Most of the tracks around you are firmly in ${metrics.primaryGenre}. You're speaking directly to that audience.`
                                            : metrics.genrePurity >= 0.4
                                                ? `Your sound sits at the edge of ${metrics.primaryGenre}, mixing in other influences. That crossover appeal can work in your favour.`
                                                : `You live at a genre crossroads — ${metrics.primaryGenre} is nearby but you're not locked in. Listeners from multiple scenes might find you.`
                                        }
                                    </div>
                                </div>
                            )}

                            {/* ── Sounds Like ──────────────────────────────────── */}
                            <div>
                                <SectionLabel>Sounds Like</SectionLabel>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                                    {soundsLike.slice(0, 14).map((p, i) => (
                                        <div
                                            key={p.id}
                                            onMouseEnter={() => setHovered(p.id)}
                                            onMouseLeave={() => setHovered(null)}
                                            style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 8px', background: p.id === hovered ? 'rgba(255,255,255,0.04)' : 'transparent', cursor: 'default', transition: 'background 0.1s' }}
                                        >
                                            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)', width: 16, textAlign: 'right', flexShrink: 0 }}>
                                                {i + 1}
                                            </span>
                                            <div style={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0, background: genreColor(p.genres[0] ?? null), opacity: 0.85 }}/>
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ fontSize: 12, fontWeight: 500, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', color: 'rgba(255,255,255,0.85)' }}>
                                                    {p.artist}
                                                </div>
                                                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                                                    {p.title}
                                                </div>
                                            </div>
                                            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.22)', flexShrink: 0, fontStyle: 'italic' }}>
                                                {soundSimilarity(p.distance).split(' ')[0]}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
    return (
        <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.25)', marginBottom: 12, paddingBottom: 7, borderBottom: `1px solid rgba(255,255,255,0.05)` }}>
            {children}
        </div>
    )
}