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
 *
 * v2: Replaced the contradictory "Where You Stand" + "The Competition"
 *     dual-metric layout with a single unified 2×2 positioning matrix.
 *     soundPosition (novelty) and density10 (crowding) are now explained
 *     together as orthogonal axes, with quadrant-specific actionable copy.
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
        byArtist?:     string
        trackId?:      string
        title?:        string
        isrcCode?:     string
        durationMs?:   number
        contributors?: string[]
        genres?:       string[]
        moods?:        string[]
        themes?:       string[]
        contexts?:     string[]
        artistId?:     string
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

// ── Quadrant logic ────────────────────────────────────────────────────────────
//
// Two independent axes:
//   soundPosition → how isolated the focal track is from its neighborhood centroid
//                   (high = eccentric/novel, low = sitting deep in a cluster)
//   density10     → count of neighbors within the closest-quartile radius (0-10)
//                   (high = locally crowded, low = open space around you)
//
// They're orthogonal. A track can be novel AND crowded (crossover: at the edge
// of a busy genre), or familiar AND open (hidden gem: doing a proven sound that
// most people aren't doing right now). Showing them as separate labels left the
// artist to reconcile the contradiction themselves. The quadrant does it for them.

type QuadrantKey = 'pioneer' | 'crossover' | 'hidden-gem' | 'in-the-pack'

interface QuadrantMeta {
    key:       QuadrantKey
    label:     string
    color:     string
    tagline:   string
    // Explains BOTH signals together so the artist never wonders "but it said X and Y..."
    narrative: string
    // What to actually do about this positioning
    action:    string
    // Normalised 0-1 position in the 2×2 for the matrix dot
    // qx: 0 = familiar, 1 = novel  |  qy: 0 = open, 1 = crowded
    qx: number
    qy: number
}

/**
 * Derive a quadrant from the two kernel metrics.
 *
 * soundPosition: raw value from NeighborhoodMetrics — we only need to know
 *   whether it's above or below the midpoint of its meaningful range.
 *   The kernel typically normalises this 0→1 or returns an average distance;
 *   either way, pass it raw and supply the threshold you calibrated for your
 *   embedding space (default 0.5 works for cosine-normalised distances).
 *
 * density10: 0-10 integer from NeighborhoodMetrics.
 */
function deriveQuadrant(
    soundPosition: number,
    density10: number,
    noveltyThreshold = 0.5,
    densityThreshold = 5,
): QuadrantMeta {
    const isNovel   = soundPosition >= noveltyThreshold
    const isCrowded = density10     >= densityThreshold

    // Continuous matrix position for the dot (clamped 0-1)
    const qx = Math.min(1, Math.max(0, soundPosition / (noveltyThreshold * 2)))
    const qy = density10 / 10

    if (isNovel && isCrowded) return {
        key:      'crossover',
        label:    'Crossover',
        color:    '#a78bfa',
        tagline:  'Fresh sound, busy neighbourhood',
        narrative:
            `Your sound sits at a real distance from the centroid of tracks around you — ` +
            `you're doing something the cluster isn't doing. But that cluster is dense. ` +
            `These aren't your direct competition; they're the audience pipeline. ` +
            `Recommendation systems will surface you to listeners already primed by that scene, ` +
            `and you'll be the different thing they didn't know they wanted.`,
        action:
            `Use the adjacency as distribution, not identity. Reference the genre in how you ` +
            `talk about the music, then show clearly how you diverge from it. ` +
            `The contrast is the pitch.`,
        qx, qy,
    }

    if (isNovel && !isCrowded) return {
        key:      'pioneer',
        label:    'Pioneer',
        color:    TEAL,
        tagline:  'Open territory — your rules',
        narrative:
            `Both signals point the same direction: you're operating in genuinely sparse space. ` +
            `The tracks nearest you are still meaningfully different, and there aren't many of ` +
            `them. There's no established playbook for what you're doing, no pre-formed audience, ` +
            `and no algorithm that already knows how to place you. ` +
            `That's the upside and the problem in the same sentence.`,
        action:
            `Discovery will come from you, not the platform. Build the listening context ` +
            `directly: playlists, editorial pitches, live pairings with adjacent artists. ` +
            `Define what this sounds like before someone else defines it around you.`,
        qx, qy,
    }

    if (!isNovel && !isCrowded) return {
        key:      'hidden-gem',
        label:    'Hidden Gem',
        color:    '#34d399',
        tagline:  'Proven sound, underserved market',
        narrative:
            `Your sound fits recognisably inside an established neighbourhood — listeners ` +
            `know what to expect — but the local density is low. Not many tracks are doing ` +
            `exactly what you're doing right now. This is one of the more quietly powerful ` +
            `positions: the taste exists, the audience is trained, and the supply is thin.`,
        action:
            `Algorithmic placement should work for you. Focus on metadata hygiene, ` +
            `playlist pitching, and sync opportunities — there's demand with room to grow into. ` +
            `Don't over-innovate; consistency here is leverage.`,
        qx, qy,
    }

    // !isNovel && isCrowded
    return {
        key:      'in-the-pack',
        label:    'In The Pack',
        color:    '#fb923c',
        tagline:  'Familiar sound, crowded field',
        narrative:
            `Your sound sits close to a lot of other tracks, and those tracks sit close to ` +
            `each other too. A clear audience exists and knows exactly what they want from ` +
            `this space. That audience is also being offered a lot of options. ` +
            `The sound won't differentiate you here — everything else will.`,
        action:
            `Story, visual identity, live presence, community, and release cadence matter ` +
            `more than a production tweak. Look at the map: is there a direction you could ` +
            `push the sound that opens up space without losing the core audience?`,
        qx, qy,
    }
}

// ── 2×2 Position Matrix ───────────────────────────────────────────────────────

interface MatrixProps { qx: number; qy: number; color: string }

function PositionMatrix({ qx, qy, color }: MatrixProps) {
    const W = 108, H = 96, pad = 16
    // qx: 0 = familiar (left), 1 = novel (right)
    // qy: 0 = open (bottom), 1 = crowded (top)
    const dotX = pad + qx * (W - 2 * pad)
    const dotY = (H - pad) - qy * (H - 2 * pad)

    return (
        <svg
            width={W} height={H}
            style={{ display: 'block', flexShrink: 0, overflow: 'visible' }}
            aria-hidden="true"
        >
            {/* Quadrant background fills */}
            <rect x={0}   y={0}   width={W/2} height={H/2} fill="rgba(255,255,255,0.015)" />
            <rect x={W/2} y={0}   width={W/2} height={H/2} fill="rgba(255,255,255,0.02)"  />
            <rect x={0}   y={H/2} width={W/2} height={H/2} fill="rgba(255,255,255,0.02)"  />
            <rect x={W/2} y={H/2} width={W/2} height={H/2} fill="rgba(255,255,255,0.015)" />

            {/* Axis lines */}
            <line x1={W/2} y1={2}   x2={W/2} y2={H-2} stroke="rgba(255,255,255,0.1)" strokeWidth={0.8} />
            <line x1={2}   y1={H/2} x2={W-2} y2={H/2} stroke="rgba(255,255,255,0.1)" strokeWidth={0.8} />

            {/* Axis labels */}
            <text x={4}   y={H/2-3} fontSize={7} fill="rgba(255,255,255,0.22)" dominantBaseline="auto">Familiar</text>
            <text x={W-4} y={H/2-3} fontSize={7} fill="rgba(255,255,255,0.22)" dominantBaseline="auto" textAnchor="end">Novel</text>
            <text x={W/2} y={8}     fontSize={7} fill="rgba(255,255,255,0.22)" textAnchor="middle">Crowded</text>
            <text x={W/2} y={H-3}   fontSize={7} fill="rgba(255,255,255,0.22)" textAnchor="middle" dominantBaseline="auto">Open</text>

            {/* Glow halo */}
            <circle cx={dotX} cy={dotY} r={11} fill={color} opacity={0.12} />
            <circle cx={dotX} cy={dotY} r={7}  fill={color} opacity={0.20} />
            {/* Dot */}
            <circle cx={dotX} cy={dotY} r={4}  fill={color} opacity={0.95} />
        </svg>
    )
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface Tooltip   { visible: boolean; x: number; y: number; point: ProjectedPoint | null }
interface ViewState { ox: number; oy: number; scale: number }
interface Props     { initialQuery?: string; onQueryConsumed?: () => void }

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

    // Unified 2×2 quadrant — replaces the two separate metric labels
    const quadrant = useMemo(
        () => metrics ? deriveQuadrant(parseFloat(metrics.soundPosition), metrics.density10) : null,
        [metrics],
    )

    // soundPositionMeta still used for the "Your Sound" section color + genre purity copy
    const posMeta    = metrics ? soundPositionMeta(metrics.soundPosition) : null
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
                            {/* Quadrant badge — echoes the panel label on the map itself */}
                            {quadrant && (
                                <div style={{ position: 'absolute', top: 12, left: 14, zIndex: 10, display: 'flex', alignItems: 'center', gap: 6, background: `${quadrant.color}18`, border: `1px solid ${quadrant.color}44`, padding: '4px 10px' }}>
                                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: quadrant.color, flexShrink: 0 }}/>
                                    <span style={{ fontSize: 10, fontWeight: 700, color: quadrant.color, letterSpacing: '0.07em', textTransform: 'uppercase' }}>
                                        {quadrant.label}
                                    </span>
                                </div>
                            )}

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

                    {metrics && quadrant && (
                        <>
                            {/* ── Your Position (unified 2×2) ──────────────────── */}
                            <div>
                                <SectionLabel>Your Position</SectionLabel>

                                {/* Header row: matrix + label + tagline */}
                                <div style={{ border: `1px solid ${quadrant.color}33`, background: `${quadrant.color}09` }}>
                                    <div style={{ padding: '14px 16px 12px', display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                                        <PositionMatrix qx={quadrant.qx} qy={quadrant.qy} color={quadrant.color} />
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ fontSize: 22, fontWeight: 700, color: quadrant.color, letterSpacing: '-0.03em', lineHeight: 1 }}>
                                                {quadrant.label}
                                            </div>
                                            <div style={{ fontSize: 11, color: quadrant.color, opacity: 0.6, fontStyle: 'italic', marginTop: 4, marginBottom: 10 }}>
                                                {quadrant.tagline}
                                            </div>
                                            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.42)', lineHeight: 1.75 }}>
                                                {quadrant.narrative}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Action footer */}
                                    <div style={{ borderTop: `1px solid ${quadrant.color}1e`, padding: '10px 16px', background: `${quadrant.color}07`, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                                        {/* Arrow icon */}
                                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ marginTop: 1, flexShrink: 0 }}>
                                            <path d="M2 7h10M8 3l4 4-4 4" stroke={quadrant.color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" opacity={0.7}/>
                                        </svg>
                                        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.46)', lineHeight: 1.65 }}>
                                            {quadrant.action}
                                        </div>
                                    </div>
                                </div>

                                {/* Nearest sound-alike — framed as "who the algorithm puts you next to" */}
                                {metrics.nearestNeighbor && (
                                    <div style={{ marginTop: 8, background: 'rgba(255,255,255,0.02)', border: `1px solid ${BORDER}`, padding: '10px 12px' }}>
                                        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 6 }}>
                                            Nearest track — who the algorithm puts you next to
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
                            {metrics.primaryGenre && posMeta && (
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
                                            ? `Most tracks around you are firmly in ${metrics.primaryGenre}. You're speaking directly to that audience.`
                                            : metrics.genrePurity >= 0.4
                                                ? `You sit at the edge of ${metrics.primaryGenre}, mixing in other influences. That crossover appeal can be leveraged.`
                                                : `You're at a genre crossroads — ${metrics.primaryGenre} is nearby but you're not locked in. Listeners from multiple scenes may find you.`
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