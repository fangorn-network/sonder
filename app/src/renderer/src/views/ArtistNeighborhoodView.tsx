/**
 * ArtistNeighborhoodView.tsx
 *
 * Visualises where a track sits in the embedding space relative to its
 * nearest neighbors.
 *
 * Entry points:
 *   1. Direct — user navigates to the Analyze tab, types a query, hits Analyze.
 *   2. Contextual — user taps "Analyze" on the NowPlaying overlay. App closes
 *      NowPlaying, switches to the Analyze tab, and passes `initialQuery`.
 *      This component auto-fires its search when initialQuery is set.
 *
 * Props:
 *   initialQuery     pre-populated search string; auto-fires when provided.
 *   onQueryConsumed  called once initialQuery has been consumed so the parent
 *                    can clear it (avoiding re-trigger on subsequent renders).
 */

import {
    useState, useRef, useEffect, useMemo, useCallback,
    type PointerEvent as ReactPointerEvent,
    type WheelEvent as ReactWheelEvent,
} from 'react'
import {
    buildNeighborhood, genreColor, formatDistance, clusterPositionMeta,
    type TrackNeighborData, type ProjectedPoint, type NeighborhoodMetrics,
} from '../kernel/neighborhoodAnalysis'

// ── Config ────────────────────────────────────────────────────────────────────

const BASE_URL = 'http://localhost:8080'
const N_NEIGHBORS = 50
const TEAL = '#00ffe7'
const DARK_BG = '#0d0d14'
const BORDER = 'rgba(255,255,255,0.08)'
const SVG_W = 600
const SVG_H = 520
const MARGIN = 48

// ── API ───────────────────────────────────────────────────────────────────────

interface RawChromaHit {
    id: string
    embedding: number[]
    distance: number
    fields?: {
        byArtist?: string;
        trackId?: string
        title?: string;
        isrcCode?: string
        durationMs?: number; contributors?: string[]
        genres?: string[];
        moods?: string[];
        themes?: string[]; contexts?: string[]
        artistId?: string
    }
}

async function apiEmbed(text: string): Promise<Float32Array> {
    const res = await fetch(`${BASE_URL}/embed`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
    })
    if (!res.ok) throw new Error(`/embed failed: ${res.status}`)
    return new Float32Array((await res.json()).embedding)
}

async function apiSearchVector(embedding: Float32Array, n: number): Promise<RawChromaHit[]> {
    const res = await fetch(`${BASE_URL}/search/vector`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ embedding: Array.from(embedding), n_results: n }),
    })
    if (!res.ok) throw new Error(`/search/vector failed: ${res.status}`)
    return (await res.json()).results as RawChromaHit[]
}

function toNeighborData(hit: RawChromaHit, dist: number): TrackNeighborData {
    const m = hit.fields ?? {}
    console.log(JSON.stringify(m))
    return {
        id: hit.id,
        artist: m.byArtist ?? 'Unknown Artist',
        title: m.title ?? hit.id,
        isrc: m.isrcCode,
        durationMs: m.durationMs ?? 0,
        genres: m.genres ?? [], moods: m.moods ?? [],
        themes: m.themes ?? [], contexts: m.contexts ?? [],
        embedding: new Float32Array(hit.embedding),
        distance: dist,
    }
}

// ── Scales ────────────────────────────────────────────────────────────────────

function buildScales(pts: ProjectedPoint[], w: number, h: number, margin: number) {
    const xs = pts.map(p => p.px), ys = pts.map(p => p.py)
    const xMin = Math.min(...xs), xMax = Math.max(...xs)
    const yMin = Math.min(...ys), yMax = Math.max(...ys)
    const xR = xMax - xMin || 1, yR = yMax - yMin || 1, pad = 0.18
    const xScale = (px: number) => margin + ((px - xMin + xR * pad) / (xR * (1 + 2 * pad))) * (w - 2 * margin)
    const yScale = (py: number) => (h - margin) - ((py - yMin + yR * pad) / (yR * (1 + 2 * pad))) * (h - 2 * margin)
    return { xScale, yScale }
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface Tooltip { visible: boolean; x: number; y: number; point: ProjectedPoint | null }
interface View { ox: number; oy: number; scale: number }
interface Props { initialQuery?: string; onQueryConsumed?: () => void }

// ─────────────────────────────────────────────────────────────────────────────

export function ArtistNeighborhoodView({ initialQuery, onQueryConsumed }: Props) {
    const [query, setQuery] = useState('')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [focal, setFocal] = useState<TrackNeighborData | null>(null)
    const [pts, setPts] = useState<ProjectedPoint[]>([])
    const [metrics, setMetrics] = useState<NeighborhoodMetrics | null>(null)
    const [tip, setTip] = useState<Tooltip>({ visible: false, x: 0, y: 0, point: null })
    const [view, setView] = useState<View>({ ox: 0, oy: 0, scale: 1 })
    const [hovered, setHovered] = useState<string | null>(null)

    const svgRef = useRef<SVGSVGElement>(null)
    const dragRef = useRef<{ sx: number; sy: number; ox: number; oy: number } | null>(null)

    // ── Core search ───────────────────────────────────────────────────────────
    const runSearch = useCallback(async (q: string) => {
        const query = q.trim()
        if (!query) return
        setLoading(true); setError(null); setPts([]); setMetrics(null)
        setFocal(null); setView({ ox: 0, oy: 0, scale: 1 })
        try {
            const emb = await apiEmbed(query)
            const hits = await apiSearchVector(emb, N_NEIGHBORS + 1)
            if (!hits.length) throw new Error('No results found in ChromaDB.')
            const focal = toNeighborData(hits[0], 0)
            const nbrs = hits.slice(1).map(h => toNeighborData(h, Math.sqrt(h.distance)))
            const { points, metrics } = buildNeighborhood(focal, nbrs)
            setFocal(focal); setPts(points); setMetrics(metrics)
        } catch (e: any) {
            setError(e?.message ?? 'Search failed.')
        } finally {
            setLoading(false)
        }
    }, [])

    const handleSearch = useCallback(() => runSearch(query), [query, runSearch])

    // ── Contextual entry from NowPlaying ──────────────────────────────────────
    useEffect(() => {
        if (!initialQuery) return
        setQuery(initialQuery)
        runSearch(initialQuery)
        onQueryConsumed?.()
    }, [initialQuery]) // deliberately narrow deps — fires only when initialQuery changes

    // ── Scales + rings ────────────────────────────────────────────────────────
    const { xScale, yScale } = useMemo(
        () => pts.length ? buildScales(pts, SVG_W, SVG_H, MARGIN)
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
        return [0.25, 0.5, 0.75].map(frac => d2[Math.floor(frac * d2.length)] ?? 0)
            .filter(r => r > 0)
    }, [pts, xScale, yScale])

    // ── Zoom / pan ────────────────────────────────────────────────────────────
    const onWheel = useCallback((e: ReactWheelEvent<SVGSVGElement>) => {
        e.preventDefault()
        const rect = svgRef.current!.getBoundingClientRect()
        const mx = e.clientX - rect.left, my = e.clientY - rect.top
        const d = e.deltaY > 0 ? 0.82 : 1.22
        const ns = Math.max(0.25, Math.min(20, view.scale * d))
        setView({ ox: mx - (mx - view.ox) * (ns / view.scale), oy: my - (my - view.oy) * (ns / view.scale), scale: ns })
    }, [view])

    const onPtrDown = useCallback((e: ReactPointerEvent<SVGSVGElement>) => {
        dragRef.current = { sx: e.clientX, sy: e.clientY, ox: view.ox, oy: view.oy }
        svgRef.current?.setPointerCapture(e.pointerId)
    }, [view])

    const onPtrMove = useCallback((e: ReactPointerEvent<SVGSVGElement>) => {
        if (!dragRef.current) return

        let dragox = dragRef.current!.ox ?? 0
        let dragoy = dragRef.current!.oy ?? 0
        let dragsx = dragRef.current!.sx ?? 0
        let dragsy = dragRef.current!.sy ?? 0

        setView(v => ({ ...v, ox: dragox + e.clientX - dragsx, oy: dragoy + e.clientY - dragsy }))
    }, [])

    const onPtrUp = useCallback(() => { dragRef.current = null }, [])

    // ── Tooltip ───────────────────────────────────────────────────────────────
    const onEnter = useCallback((e: React.MouseEvent, p: ProjectedPoint) => {
        const r = svgRef.current!.getBoundingClientRect()
        setTip({ visible: true, x: e.clientX - r.left, y: e.clientY - r.top, point: p })
        setHovered(p.id)
    }, [])
    const onLeave = useCallback(() => { setTip(t => ({ ...t, visible: false })); setHovered(null) }, [])

    const posMeta = metrics ? clusterPositionMeta(metrics.clusterPosition) : null
    const focalPt = pts.find(p => p.isFocal)

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: DARK_BG, color: 'var(--color-text-primary,#e8e8f0)', fontFamily: 'var(--font-sans,"DM Sans",sans-serif)', overflow: 'hidden' }}>

            {/* Header */}
            <div style={{ padding: '16px 20px', borderBottom: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.28)' }}>
                        Embedding Space Analysis
                    </span>
                    {focal && (
                        <span style={{ fontSize: 14, fontWeight: 500 }}>
                            <span style={{ color: TEAL }}>{focal.artist}</span>
                            <span style={{ color: 'rgba(255,255,255,0.28)', margin: '0 6px' }}>–</span>
                            {focal.title}
                            {focal.isrc && <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.22)', marginLeft: 10 }}>{focal.isrc}</span>}
                        </span>
                    )}
                </div>
                <input
                    value={query} onChange={e => setQuery(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleSearch()}
                    placeholder='Artist – Track title...'
                    style={{ background: 'rgba(255,255,255,0.05)', border: `1px solid ${BORDER}`, borderRadius: 0, color: 'inherit', fontSize: 13, padding: '7px 12px', width: 260, outline: 'none' }}
                />
                <button
                    onClick={handleSearch} disabled={loading || !query.trim()}
                    style={{ background: loading ? 'rgba(0,255,231,0.15)' : TEAL, border: 'none', borderRadius: 0, color: loading ? TEAL : '#0d0d14', fontSize: 12, fontWeight: 600, letterSpacing: '0.06em', padding: '7px 16px', cursor: loading ? 'default' : 'pointer', textTransform: 'uppercase' }}
                >
                    {loading ? 'Analysing...' : 'Analyze'}
                </button>
            </div>

            {error && <div style={{ padding: '10px 20px', background: 'rgba(248,113,113,0.1)', color: '#f87171', fontSize: 13, borderBottom: `1px solid ${BORDER}` }}>{error}</div>}

            <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

                {/* Scatter */}
                <div style={{ position: 'relative', flex: '0 0 62%', borderRight: `1px solid ${BORDER}`, overflow: 'hidden' }}>

                    {/* Empty state */}
                    {!pts.length && !loading && (
                        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, color: 'rgba(255,255,255,0.18)' }}>
                            <svg width="44" height="44" viewBox="0 0 44 44" fill="none">
                                <circle cx="22" cy="22" r="20" stroke="currentColor" strokeWidth="1.2" strokeDasharray="4 3" />
                                <circle cx="22" cy="22" r="3" fill="currentColor" />
                                <circle cx="11" cy="15" r="2" fill="currentColor" opacity=".5" />
                                <circle cx="33" cy="28" r="2" fill="currentColor" opacity=".5" />
                                <circle cx="29" cy="12" r="1.5" fill="currentColor" opacity=".4" />
                                <circle cx="14" cy="31" r="1.5" fill="currentColor" opacity=".4" />
                            </svg>
                            <span style={{ fontSize: 13 }}>Search for a track to map its neighborhood</span>
                            <span style={{ fontSize: 11 }}>or tap Analyze on any track in Now Playing</span>
                        </div>
                    )}

                    {/* Loading */}
                    {loading && (
                        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12, color: TEAL, fontSize: 12, letterSpacing: '0.08em' }}>
                            <div style={{ width: 24, height: 24, border: `2px solid ${TEAL}33`, borderTopColor: TEAL, borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                            Projecting neighborhood...
                            <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
                        </div>
                    )}

                    {pts.length > 0 && (
                        <>
                            <button onClick={() => setView({ ox: 0, oy: 0, scale: 1 })} style={{ position: 'absolute', top: 12, right: 12, zIndex: 10, background: 'rgba(255,255,255,0.06)', border: `1px solid ${BORDER}`, color: 'rgba(255,255,255,0.38)', fontSize: 10, padding: '4px 10px', cursor: 'pointer', borderRadius: 0, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                                Reset view
                            </button>

                            {metrics && (
                                <div style={{ position: 'absolute', bottom: 10, left: 12, zIndex: 10, fontSize: 10, color: 'rgba(255,255,255,0.2)', lineHeight: 1.6 }}>
                                    PC1 {(metrics.explainedVariance[0] * 100).toFixed(1)}%  ·  PC2 {(metrics.explainedVariance[1] * 100).toFixed(1)}%  ·  {N_NEIGHBORS} neighbors
                                </div>
                            )}

                            <svg ref={svgRef} width="100%" height="100%" viewBox={`0 0 ${SVG_W} ${SVG_H}`}
                                style={{ cursor: dragRef.current ? 'grabbing' : 'grab', display: 'block' }}
                                onWheel={onWheel} onPointerDown={onPtrDown} onPointerMove={onPtrMove}
                                onPointerUp={onPtrUp} onPointerLeave={onPtrUp}
                            >
                                <rect width={SVG_W} height={SVG_H} fill={DARK_BG} />
                                <g transform={`translate(${view.ox},${view.oy}) scale(${view.scale})`}>

                                    {/* Rings */}
                                    {focalPt && rings.map((r, i) => (
                                        <circle key={i} cx={xScale(focalPt.px)} cy={yScale(focalPt.py)} r={r}
                                            fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth={0.7} strokeDasharray="3 5" />
                                    ))}

                                    {/* Neighbors */}
                                    {pts.filter(p => !p.isFocal).map(p => {
                                        const col = genreColor(p.genres[0] ?? null)
                                        const isH = p.id === hovered
                                        return (
                                            <g key={p.id}>
                                                <circle cx={xScale(p.px)} cy={yScale(p.py)} r={isH ? 12 : 10}
                                                    fill="transparent" style={{ cursor: 'pointer' }}
                                                    onMouseEnter={e => onEnter(e, p)} onMouseLeave={onLeave} />
                                                <circle cx={xScale(p.px)} cy={yScale(p.py)} r={isH ? 7 : 5}
                                                    fill={col} opacity={isH ? 1 : 0.5}
                                                    stroke={isH ? 'rgba(255,255,255,0.7)' : 'none'} strokeWidth={1}
                                                    style={{ pointerEvents: 'none', transition: 'opacity 0.1s' }} />
                                                {isH && (
                                                    <text x={xScale(p.px)} y={yScale(p.py) - 13} textAnchor="middle"
                                                        fontSize={9} fill="rgba(255,255,255,0.65)"
                                                        style={{ pointerEvents: 'none', userSelect: 'none' }}>
                                                        {p.artist}
                                                    </text>
                                                )}
                                            </g>
                                        )
                                    })}

                                    {/* Focal */}
                                    {focalPt && (() => {
                                        const fx = xScale(focalPt.px), fy = yScale(focalPt.py)
                                        return (
                                            <g>
                                                <circle cx={fx} cy={fy} r={20} fill={TEAL} opacity={0.07} />
                                                <circle cx={fx} cy={fy} r={13} fill={TEAL} opacity={0.11} />
                                                <circle cx={fx} cy={fy} r={9} fill={TEAL} opacity={0.92}
                                                    onMouseEnter={e => onEnter(e, focalPt)} onMouseLeave={onLeave}
                                                    style={{ cursor: 'pointer' }} />
                                                <text x={fx} y={fy - 17} textAnchor="middle" fontSize={10} fill={TEAL}
                                                    fontFamily="var(--font-mono,'DM Mono',monospace)" fontWeight={600}
                                                    style={{ pointerEvents: 'none', userSelect: 'none' }}>
                                                    {focalPt.artist}
                                                </text>
                                            </g>
                                        )
                                    })()}
                                </g>
                            </svg>

                            {/* Tooltip */}
                            {tip.visible && tip.point && (
                                <div style={{ position: 'absolute', left: tip.x + 14, top: tip.y - 10, background: '#1a1a2e', border: `1px solid ${BORDER}`, padding: '8px 12px', fontSize: 12, lineHeight: 1.6, pointerEvents: 'none', zIndex: 20, maxWidth: 220, boxShadow: '0 4px 20px rgba(0,0,0,0.5)' }}>
                                    <div style={{ fontWeight: 600, color: TEAL, marginBottom: 2 }}>{tip.point.artist}</div>
                                    <div style={{ color: 'rgba(255,255,255,0.85)' }}>{tip.point.title}</div>
                                    {!tip.point.isFocal && (
                                        <div style={{ color: 'rgba(255,255,255,0.35)', marginTop: 4, fontSize: 11 }}>
                                            {formatDistance(tip.point.distance)} · {tip.point.distance.toFixed(3)} L2
                                        </div>
                                    )}
                                    {tip.point.genres.length > 0 && (
                                        <div style={{ marginTop: 4, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                                            {tip.point.genres.slice(0, 3).map(g => (
                                                <span key={g} style={{ fontSize: 9, padding: '1px 6px', background: genreColor(g) + '33', color: genreColor(g), border: `1px solid ${genreColor(g)}55` }}>{g}</span>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
                        </>
                    )}
                </div>

                {/* Stats panel */}
                <div style={{ flex: '0 0 38%', overflowY: 'auto', padding: '20px 18px', display: 'flex', flexDirection: 'column', gap: 20 }}>

                    {!metrics && !loading && (
                        <div style={{ color: 'rgba(255,255,255,0.18)', fontSize: 13, marginTop: 60, textAlign: 'center' }}>
                            Metrics appear after analysis
                        </div>
                    )}

                    {metrics && posMeta && (
                        <>
                            <Section label="Cluster Position">
                                <div style={{ border: `1px solid ${posMeta.color}44`, background: `${posMeta.color}11`, padding: '12px 14px' }}>
                                    <div style={{ fontSize: 20, fontWeight: 700, color: posMeta.color, letterSpacing: '-0.02em' }}>{posMeta.label}</div>
                                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.42)', marginTop: 6, lineHeight: 1.6 }}>{posMeta.description}</div>
                                </div>
                            </Section>

                            <Section label="Neighborhood Geometry">
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                                    <Stat label="Peripherality" value={(metrics.peripherality * 100).toFixed(0) + '%'} sub="0% = center, 100%+ = frontier" accent={TEAL} />
                                    <Stat label="Nearest competitor" value={formatDistance(metrics.nearestDistance)} sub={metrics.nearestDistance.toFixed(3) + ' L2'} accent="rgba(255,255,255,0.7)" />
                                    <Stat label="10th %ile shell" value={String(metrics.density10)} sub="tightest competition" accent={metrics.density10 > 8 ? '#f87171' : '#4ade80'} />
                                    <Stat label="25th %ile shell" value={String(metrics.density25)} sub="extended neighborhood" accent="rgba(255,255,255,0.5)" />
                                </div>
                            </Section>

                            <Section label="Genre Landscape">
                                {metrics.primaryGenre ? (
                                    <div>
                                        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.32)', marginBottom: 8 }}>Dominant genre in top-10 neighbors</div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                                            <div style={{ width: `${metrics.genrePurity * 100}%`, height: 3, background: genreColor(metrics.primaryGenre), minWidth: 4, flexShrink: 0, transition: 'width 0.5s' }} />
                                            <span style={{ fontSize: 13, color: genreColor(metrics.primaryGenre), whiteSpace: 'nowrap' }}>{metrics.primaryGenre}</span>
                                            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.28)' }}>{(metrics.genrePurity * 100).toFixed(0)}%</span>
                                        </div>
                                        {metrics.genrePurity < 0.5 && (
                                            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.28)', lineHeight: 1.6 }}>
                                                Mixed genre neighborhood — sits at a genre boundary. Kernels from multiple genre regions may discover this track.
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.28)' }}>No genre metadata in top neighbors.</div>
                                )}
                            </Section>

                            <Section label="Nearest Competitors">
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                    {pts.filter(p => !p.isFocal).sort((a, b) => a.distance - b.distance).slice(0, 12).map((p, i) => (
                                        <div key={p.id} onMouseEnter={() => setHovered(p.id)} onMouseLeave={() => setHovered(null)}
                                            style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 8px', background: p.id === hovered ? 'rgba(255,255,255,0.04)' : 'transparent', cursor: 'default', transition: 'background 0.1s' }}>
                                            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)', width: 16, textAlign: 'right', flexShrink: 0 }}>{i + 1}</span>
                                            <div style={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0, background: genreColor(p.genres[0] ?? null) }} />
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ fontSize: 12, fontWeight: 500, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{p.artist}</div>
                                                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{p.title}</div>
                                            </div>
                                            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.26)', flexShrink: 0 }}>{p.distance.toFixed(3)}</span>
                                        </div>
                                    ))}
                                </div>
                            </Section>
                        </>
                    )}
                </div>
            </div>
        </div>
    )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Section({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div>
            <div style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.09em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.26)', marginBottom: 10, paddingBottom: 6, borderBottom: `1px solid rgba(255,255,255,0.06)` }}>
                {label}
            </div>
            {children}
        </div>
    )
}

function Stat({ label, value, sub, accent }: { label: string; value: string; sub: string; accent: string }) {
    return (
        <div style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid rgba(255,255,255,0.07)`, padding: '10px 12px' }}>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginBottom: 4, letterSpacing: '0.04em' }}>{label}</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: accent, letterSpacing: '-0.02em', lineHeight: 1 }}>{value}</div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)', marginTop: 4 }}>{sub}</div>
        </div>
    )
}