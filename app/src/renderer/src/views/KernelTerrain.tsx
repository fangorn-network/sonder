/**
 * KernelTerrain.tsx  — pure Canvas 2D, zero new dependencies.
 *
 * Replaces the Three.js version. Same concept:
 *   Ground plane  = UMAP neighbourhood
 *   Height        = kernel probability at each point
 *   μ marker      = where your taste is right now (glowing peak)
 *   σ ring        = your comfort zone radius at ground level
 *   v arrow       = direction your taste is drifting
 *   History trail = where you've been
 *
 * Perspective: oblique projection with Z-rotation for orbit.
 * Drag to rotate, scroll to zoom, double-click to reset.
 *
 * Degrades cleanly when kernelState is not provided —
 * height becomes sonic similarity to the focal track instead.
 */

import { useRef, useEffect, useState, useMemo, useCallback } from 'react'
import type { TrackNeighborData } from '../kernel/neighborhoodAnalysis'

// ── Kernel state ──────────────────────────────────────────────────────────────

export interface KernelState {
    mu:       Float32Array
    velocity: Float32Array
    sigma:    number
}

// ── Constants ─────────────────────────────────────────────────────────────────

const GRID     = 26       // terrain resolution (26×26 cells)
const WORLD_R  = 5.5      // world half-width in scene units
const T_SCALE  = 2.8      // kernel prob → height scale
const TEAL     = '#00ffe7'
const VIOLET   = '#a78bfa'
const DARK_BG  = '#07070f'
const MONO     = '"DM Mono", monospace'
const SANS     = '"DM Sans", system-ui, sans-serif'

// ── Math helpers ──────────────────────────────────────────────────────────────

function kProb(e: Float32Array, mu: Float32Array, sigma: number): number {
    const n = Math.min(e.length, mu.length)
    let d2 = 0
    for (let i = 0; i < n; i++) { const d = e[i] - mu[i]; d2 += d * d }
    return Math.exp(-d2 / (2 * (sigma || 0.5) ** 2))
}

function idw(
    gx: number, gy: number,
    pts: { px: number; py: number; prob: number }[],
    power = 2.5,
): number {
    let wSum = 0, vSum = 0
    for (const { px, py, prob } of pts) {
        const d = Math.sqrt((gx - px) ** 2 + (gy - py) ** 2)
        if (d < 1e-6) return prob
        const w = 1 / d ** power
        wSum += w; vSum += w * prob
    }
    return wSum > 0 ? vSum / wSum : 0
}

/** Kernel prob [0,1] → CSS rgb string (deep navy → teal → white) */
function probToCSS(p: number): string {
    let r: number, g: number, b: number
    if (p < 0.35) {
        const t = p / 0.35
        r = Math.round(10 * (1 - t))
        g = Math.round(10 + 50 * t)
        b = Math.round(26 + 50 * t)
    } else if (p < 0.72) {
        const t = (p - 0.35) / 0.37
        r = 0
        g = Math.round(60 + 140 * t)
        b = Math.round(76 + 135 * t)
    } else {
        const t = (p - 0.72) / 0.28
        r = Math.round(0 + 155 * t)
        g = Math.round(200 + 55 * t)
        b = Math.round(211 + 44 * t)
    }
    return `rgb(${r},${g},${b})`
}

// ── Oblique perspective projection ────────────────────────────────────────────
//
// World: X=right, Y=depth(forward), Z=up(height)
// Camera: above-front looking slightly down.
// Orbit: rotate world around Z axis by `angle`.

interface Pt2D { x: number; y: number; depth: number; scale: number }

function project(
    wx: number, wy: number, wz: number,
    angle: number,
    W: number, H: number,
    zoom: number,
): Pt2D {
    const cos = Math.cos(angle), sin = Math.sin(angle)
    const rx =  wx * cos - wy * sin
    const ry =  wx * sin + wy * cos

    // Soft perspective: objects further back (ry > 0) appear slightly smaller
    const BASE   = Math.min(W, H) / 14
    const TILT   = 0.50
    const PERSP  = 0.038
    const sc     = zoom * BASE / (1 + Math.max(0, ry) * PERSP)

    return {
        x:     W / 2 + rx * sc,
        y:     H * 0.54 + ry * sc * TILT - wz * sc * 0.86,
        depth: ry,
        scale: sc,
    }
}

// ── UMAP → scene world position ───────────────────────────────────────────────

function umapToWorld(
    px: number, py: number,
    xMin: number, xMax: number,
    yMin: number, yMax: number,
): { wx: number; wy: number } {
    const tj = xMax > xMin ? (px - xMin) / (xMax - xMin) : 0.5
    const ti = yMax > yMin ? (py - yMin) / (yMax - yMin) : 0.5
    return { wx: (tj * 2 - 1) * WORLD_R, wy: (ti * 2 - 1) * WORLD_R }
}

// ── Approximate UMAP position for a track (fallback when pts lack px/py) ──────
//  Uses its distance + a deterministic angle from its id hash.

function hashAngle(id: string): number {
    let h = 0
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
    return (h % 1000) / 1000 * Math.PI * 2
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface PtProb { px: number; py: number; prob: number }

interface TrackScenePt {
    wx: number; wy: number; wz: number
    prob: number
    track: TrackNeighborData
}

export interface KernelTerrainProps {
    nbrs:         TrackNeighborData[]
    focalTrack:   TrackNeighborData
    focalPt?:     { px: number; py: number }   // UMAP position of focal track
    kernelState?: KernelState
    playHistory?: TrackNeighborData[]
    onBack?:      () => void
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

export function KernelTerrain({
    nbrs, focalTrack, focalPt, kernelState, playHistory = [], onBack,
}: KernelTerrainProps) {
    const canvasRef  = useRef<HTMLCanvasElement>(null)
    const rafRef     = useRef<number>(0)

    // View state in a ref (no re-render on every mouse move)
    const viewRef    = useRef({ angle: 0.55, zoom: 1, dragging: false })
    const dragRef    = useRef<{ sx: number; sy: number; a0: number } | null>(null)
    const [cursor,   setCursor]   = useState<'grab' | 'grabbing'>('grab')
    const [hovered,  setHovered]  = useState<TrackScenePt | null>(null)
    const [mousePos, setMousePos] = useState({ x: 0, y: 0 })

    // ── Compute merged pts with UMAP positions + kernel probabilities ──────────
    const mergedPts = useMemo<PtProb[]>(() => {
        if (!nbrs.length) return []
        const hasUmap = nbrs.some(n => (n as any).px !== undefined)
        const maxD = Math.max(1, ...nbrs.map(n => n.distance))

        return nbrs.map(n => {
            const prob = kernelState
                ? kProb(n.embedding, kernelState.mu, kernelState.sigma)
                : 1 - n.distance / maxD

            const px = hasUmap ? (n as any).px : Math.cos(hashAngle(n.id)) * (n.distance / maxD) * 4
            const py = hasUmap ? (n as any).py : Math.sin(hashAngle(n.id)) * (n.distance / maxD) * 4

            return { px, py, prob }
        })
    }, [nbrs, kernelState])

    // UMAP bounds
    const bounds = useMemo(() => {
        if (!mergedPts.length) return null
        const xs = mergedPts.map(p => p.px), ys = mergedPts.map(p => p.py)
        return {
            xMin: Math.min(...xs), xMax: Math.max(...xs) || 1,
            yMin: Math.min(...ys), yMax: Math.max(...ys) || 1,
        }
    }, [mergedPts])

    // Height map (computed once, not per frame)
    const heightMap = useMemo<number[][] | null>(() => {
        if (!mergedPts.length || !bounds) return null
        const { xMin, xMax, yMin, yMax } = bounds
        const map: number[][] = []
        for (let i = 0; i < GRID; i++) {
            map[i] = []
            for (let j = 0; j < GRID; j++) {
                const tj = j / (GRID - 1), ti = i / (GRID - 1)
                const umapX = xMin + tj * (xMax - xMin)
                const umapY = yMin + ti * (yMax - yMin)
                map[i][j] = idw(umapX, umapY, mergedPts)
            }
        }
        return map
    }, [mergedPts, bounds])

    // Track positions in scene space
    const trackPts = useMemo<TrackScenePt[]>(() => {
        if (!mergedPts.length || !bounds) return []
        const { xMin, xMax, yMin, yMax } = bounds
        return mergedPts.map((pt, i) => {
            const { wx, wy } = umapToWorld(pt.px, pt.py, xMin, xMax, yMin, yMax)
            return { wx, wy, wz: pt.prob * T_SCALE + 0.18, prob: pt.prob, track: nbrs[i] }
        }).filter(p => p.track)
    }, [mergedPts, bounds, nbrs])

    // Focal track position
    const focalProb = useMemo(() =>
        kernelState ? kProb(focalTrack.embedding, kernelState.mu, kernelState.sigma) : 0.9,
        [focalTrack, kernelState])

    const focalScenePt = useMemo<TrackScenePt>(() => {
        if (!bounds) return { wx: 0, wy: 0, wz: focalProb * T_SCALE + 0.25, prob: focalProb, track: focalTrack }
        const { xMin, xMax, yMin, yMax } = bounds
        const { wx, wy } = focalPt
            ? umapToWorld(focalPt.px, focalPt.py, xMin, xMax, yMin, yMax)
            : { wx: 0, wy: 0 }
        return { wx, wy, wz: focalProb * T_SCALE + 0.25, prob: focalProb, track: focalTrack }
    }, [focalPt, focalProb, focalTrack, bounds])

    // μ position (weighted centroid of mergedPts by prob)
    const muPt = useMemo<{ wx: number; wy: number; wz: number } | null>(() => {
        if (!kernelState || !mergedPts.length || !bounds) return null
        let sx = 0, sy = 0, sw = 0
        for (const p of mergedPts) { sx += p.prob * p.px; sy += p.prob * p.py; sw += p.prob }
        if (sw < 1e-8) return null
        const { xMin, xMax, yMin, yMax } = bounds
        const { wx, wy } = umapToWorld(sx/sw, sy/sw, xMin, xMax, yMin, yMax)
        return { wx, wy, wz: T_SCALE + 0.5 }
    }, [kernelState, mergedPts, bounds])

    // v direction (approximate from forward-aligned tracks)
    const vDir = useMemo<{ dwx: number; dwy: number } | null>(() => {
        if (!kernelState || !mergedPts.length || !muPt || !bounds) return null
        const { mu, velocity } = kernelState
        const n = Math.min(mu.length, velocity.length)
        let vn2 = 0; for (let k = 0; k < n; k++) vn2 += velocity[k] ** 2
        const vn = Math.sqrt(vn2)
        if (vn < 1e-8) return null
        let sx = 0, sy = 0, sw = 0
        nbrs.forEach((nbr, i) => {
            const pt = mergedPts[i]; if (!pt) return
            let align = 0, dn2 = 0
            const m = Math.min(nbr.embedding.length, n)
            for (let k = 0; k < m; k++) { const d = nbr.embedding[k]-mu[k]; dn2+=d*d; align+=d*velocity[k]/vn }
            const dn = Math.sqrt(dn2); align = dn > 1e-8 ? align/dn : 0
            if (align <= 0) return
            sx += align * pt.px; sy += align * pt.py; sw += align
        })
        if (sw < 1e-8) return null
        const { xMin, xMax, yMin, yMax } = bounds
        const { wx: tx, wy: ty } = umapToWorld(sx/sw, sy/sw, xMin, xMax, yMin, yMax)
        const dx = tx - muPt.wx, dy = ty - muPt.wy
        const mag = Math.sqrt(dx*dx + dy*dy)
        return mag > 0.05 ? { dwx: dx/mag * 1.6, dwy: dy/mag * 1.6 } : null
    }, [kernelState, mergedPts, muPt, nbrs, bounds])

    // HUD stats
    const hudStats = useMemo(() => {
        if (!kernelState) return null
        const s = kernelState.sigma
        const state  = s < 0.28 ? 'LOCKED IN' : s < 0.52 ? 'FOCUSED' : s < 0.78 ? 'OPEN' : 'DRIFTING'
        const verdict = focalProb > 0.72 ? 'Play it — right in your groove'
            : focalProb > 0.45 ? 'Fits where you are right now'
            : focalProb > 0.20 ? 'A stretch from your current state'
            : 'Not the moment — save for later'
        return { state, verdict, pct: Math.round(focalProb * 100) }
    }, [kernelState, focalProb])

    // ── DPR-correct canvas sizing ─────────────────────────────────────────────
    useEffect(() => {
        const canvas = canvasRef.current
        if (!canvas) return
        const sync = () => {
            const dpr = window.devicePixelRatio || 1
            const w = canvas.clientWidth, h = canvas.clientHeight
            if (w && h) { canvas.width = Math.round(w*dpr); canvas.height = Math.round(h*dpr) }
        }
        const ro = new ResizeObserver(sync)
        ro.observe(canvas); sync()
        return () => ro.disconnect()
    }, [])

    // ── Pointer events ────────────────────────────────────────────────────────
    const onPointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
        dragRef.current = { sx: e.clientX, sy: e.clientY, a0: viewRef.current.angle }
        canvasRef.current?.setPointerCapture(e.pointerId)
        setCursor('grabbing'); viewRef.current.dragging = true
    }, [])

    const onPointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
        setMousePos({ x: e.clientX, y: e.clientY })
        if (!dragRef.current) return
        viewRef.current.angle = dragRef.current.a0 - (e.clientX - dragRef.current.sx) * 0.012
    }, [])

    const onPointerUp = useCallback(() => {
        dragRef.current = null; setCursor('grab'); viewRef.current.dragging = false
    }, [])

    // ── Animation loop ────────────────────────────────────────────────────────
    // Keep a data ref so the loop doesn't restart on data changes
    const dataRef = useRef({ heightMap, trackPts, focalScenePt, muPt, vDir, playHistory, mergedPts, bounds, kernelState, nbrs })
    useEffect(() => { dataRef.current = { heightMap, trackPts, focalScenePt, muPt, vDir, playHistory, mergedPts, bounds, kernelState, nbrs } }, [heightMap, trackPts, focalScenePt, muPt, vDir, playHistory, mergedPts, bounds, kernelState, nbrs])

    useEffect(() => {
        const canvas = canvasRef.current
        if (!canvas) return
        const ctx = canvas.getContext('2d')!
        let running = true
        let autoAngle = viewRef.current.angle

        // Non-passive wheel handler
        const onWheel = (e: WheelEvent) => {
            e.preventDefault()
            viewRef.current.zoom = Math.max(0.4, Math.min(2.8, viewRef.current.zoom * (e.deltaY > 0 ? 0.88 : 1.14)))
        }
        canvas.addEventListener('wheel', onWheel, { passive: false })

        const draw = (ts: number) => {
            if (!running) return
            const dpr  = window.devicePixelRatio || 1
            const W    = canvas.width  / dpr
            const H    = canvas.height / dpr
            const { angle, zoom, dragging } = viewRef.current
            const d = dataRef.current

            // Slow auto-rotate when idle
            if (!dragging) {
                autoAngle += 0.0005
                viewRef.current.angle = autoAngle
            } else {
                autoAngle = angle
            }

            const a = viewRef.current.angle
            const z = zoom
            const proj = (wx: number, wy: number, wz: number) => project(wx, wy, wz, a, W, H, z)

            ctx.clearRect(0, 0, canvas.width, canvas.height)
            ctx.save(); ctx.scale(dpr, dpr)

            // ── Background ────────────────────────────────────────────────
            const bg = ctx.createRadialGradient(W/2, H*0.48, 0, W/2, H*0.48, Math.max(W,H)*0.75)
            bg.addColorStop(0, '#0d0d1f'); bg.addColorStop(1, '#050509')
            ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H)

            // ── Terrain ───────────────────────────────────────────────────
            if (d.heightMap) {
                const map = d.heightMap
                // Build cells sorted back-to-front
                const cells: Array<{ i: number; j: number; depth: number }> = []
                for (let i = 0; i < GRID-1; i++) {
                    for (let j = 0; j < GRID-1; j++) {
                        const cx = -WORLD_R + ((j+0.5)/(GRID-1)) * 2 * WORLD_R
                        const cy = -WORLD_R + ((i+0.5)/(GRID-1)) * 2 * WORLD_R
                        cells.push({ i, j, depth: proj(cx, cy, 0).depth })
                    }
                }
                cells.sort((a, b) => a.depth - b.depth)

                for (const { i, j } of cells) {
                    const wx0 = -WORLD_R + (j/(GRID-1)) * 2*WORLD_R
                    const wy0 = -WORLD_R + (i/(GRID-1)) * 2*WORLD_R
                    const wx1 = -WORLD_R + ((j+1)/(GRID-1)) * 2*WORLD_R
                    const wy1 = -WORLD_R + ((i+1)/(GRID-1)) * 2*WORLD_R
                    const h00 = map[i][j]*T_SCALE,    h10 = map[i][j+1]*T_SCALE
                    const h11 = map[i+1][j+1]*T_SCALE, h01 = map[i+1][j]*T_SCALE
                    const p00 = proj(wx0,wy0,h00), p10 = proj(wx1,wy0,h10)
                    const p11 = proj(wx1,wy1,h11), p01 = proj(wx0,wy1,h01)
                    const avgP = (map[i][j]+map[i][j+1]+map[i+1][j+1]+map[i+1][j])/4
                    ctx.beginPath()
                    ctx.moveTo(p00.x,p00.y); ctx.lineTo(p10.x,p10.y)
                    ctx.lineTo(p11.x,p11.y); ctx.lineTo(p01.x,p01.y)
                    ctx.closePath()
                    ctx.fillStyle = probToCSS(avgP)
                    ctx.fill()
                    if (avgP > 0.12) {
                        ctx.strokeStyle = 'rgba(0,255,231,0.045)'; ctx.lineWidth = 0.4; ctx.stroke()
                    }
                }
            }

            // ── σ ring at μ (ground level, world-space circle → polyline) ──
            if (d.muPt && d.kernelState) {
                const { wx: mx, wy: my } = d.muPt
                const sigR = d.kernelState.sigma * WORLD_R * 1.3
                const pulse = Math.sin(ts * 0.0018) * 0.5 + 0.5
                const N = 48
                ctx.beginPath()
                for (let k = 0; k <= N; k++) {
                    const a2 = (k / N) * Math.PI * 2
                    const p = proj(mx + Math.cos(a2)*sigR, my + Math.sin(a2)*sigR, 0.05)
                    k === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)
                }
                ctx.strokeStyle = `rgba(0,255,231,${0.18 + pulse * 0.14})`
                ctx.lineWidth = 1.2; ctx.setLineDash([4, 7]); ctx.stroke(); ctx.setLineDash([])
            }

            // ── History trail ──────────────────────────────────────────────
            if (d.kernelState && d.playHistory.length > 1 && d.bounds) {
                const { xMin, xMax, yMin, yMax } = d.bounds
                const histPts = d.playHistory.slice(0, 18).map(t => {
                    const p = kProb(t.embedding, d.kernelState!.mu, d.kernelState!.sigma)
                    // Approximate UMAP pos: nearest neighbour in embedding space
                    let bestI = 0, bestD = Infinity
                    d.mergedPts.forEach((mp, i) => {
                        if (!d.nbrs[i]) return
                        let d2 = 0
                        const m2 = Math.min(d.nbrs[i].embedding.length, t.embedding.length)
                        for (let k = 0; k < m2; k++) { const dd = d.nbrs[i].embedding[k]-t.embedding[k]; d2+=dd*dd }
                        if (d2 < bestD) { bestD=d2; bestI=i }
                    })
                    const mp = d.mergedPts[bestI]
                    if (!mp) return null
                    const { wx, wy } = umapToWorld(mp.px, mp.py, xMin, xMax, yMin, yMax)
                    return proj(wx, wy, p*T_SCALE+0.1)
                }).filter(Boolean) as Pt2D[]

                if (histPts.length > 1) {
                    ctx.beginPath()
                    histPts.forEach((p, i) => i===0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y))
                    ctx.strokeStyle = 'rgba(167,139,250,0.3)'; ctx.lineWidth = 1.2; ctx.stroke()
                    histPts.forEach((p, i) => {
                        const age = i / histPts.length
                        ctx.beginPath(); ctx.arc(p.x, p.y, 3.5*(1-age*0.6), 0, Math.PI*2)
                        ctx.fillStyle = `rgba(167,139,250,${(1-age)*0.55})`; ctx.fill()
                    })
                }
            }

            // ── Neighbour track dots (back to front) ──────────────────────
            const screenPts = d.trackPts.map(tp => ({ ...tp, screen: proj(tp.wx, tp.wy, tp.wz) }))
            screenPts.sort((a, b) => a.screen.depth - b.screen.depth)
            screenPts.forEach(sp => {
                const r = (0.06 + sp.prob * 0.20) * sp.screen.scale * 6
                const col = probToCSS(sp.prob)
                ctx.beginPath(); ctx.arc(sp.screen.x, sp.screen.y, r, 0, Math.PI*2)
                ctx.fillStyle = col; ctx.fill()
            })

            // ── v arrow from μ ─────────────────────────────────────────────
            if (d.muPt && d.vDir) {
                const from = proj(d.muPt.wx, d.muPt.wy, 0.1)
                const to   = proj(d.muPt.wx + d.vDir.dwx, d.muPt.wy + d.vDir.dwy, 0.1)
                const dx = to.x - from.x, dy = to.y - from.y
                const mag = Math.sqrt(dx*dx + dy*dy)
                if (mag > 4) {
                    ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.lineTo(to.x, to.y)
                    ctx.strokeStyle = 'rgba(0,255,231,0.55)'; ctx.lineWidth = 1.8; ctx.stroke()
                    // Arrowhead
                    const nx = dx/mag, ny = dy/mag
                    const hs = 9
                    ctx.beginPath()
                    ctx.moveTo(to.x, to.y)
                    ctx.lineTo(to.x - nx*hs + ny*hs*0.4, to.y - ny*hs - nx*hs*0.4)
                    ctx.lineTo(to.x - nx*hs - ny*hs*0.4, to.y - ny*hs + nx*hs*0.4)
                    ctx.closePath(); ctx.fillStyle = 'rgba(0,255,231,0.55)'; ctx.fill()
                }
            }

            // ── μ marker ───────────────────────────────────────────────────
            if (d.muPt) {
                const mp  = proj(d.muPt.wx, d.muPt.wy, d.muPt.wz)
                const pulse = Math.sin(ts * 0.0018) * 0.5 + 0.5
                // Outer glow rings
                ;[22, 14, 8].forEach((r, i) => {
                    ctx.beginPath(); ctx.arc(mp.x, mp.y, r + pulse*4, 0, Math.PI*2)
                    ctx.fillStyle = `rgba(0,255,231,${[0.04,0.09,0.18][i] + pulse*0.05})`; ctx.fill()
                })
                // Core
                ctx.beginPath(); ctx.arc(mp.x, mp.y, 5, 0, Math.PI*2)
                ctx.fillStyle = TEAL; ctx.fill()
                // μ label
                ctx.font = `10px ${MONO}`; ctx.fillStyle = 'rgba(0,255,231,0.5)'
                ctx.textAlign = 'center'; ctx.fillText('μ', mp.x, mp.y - 16)

                // Vertical beam (ground → μ)
                const ground = proj(d.muPt.wx, d.muPt.wy, 0)
                ctx.beginPath(); ctx.moveTo(ground.x, ground.y); ctx.lineTo(mp.x, mp.y)
                ctx.strokeStyle = 'rgba(0,255,231,0.12)'; ctx.lineWidth = 1; ctx.stroke()
            }

            // ── Focal track marker ─────────────────────────────────────────
            {
                const fp = proj(d.focalScenePt.wx, d.focalScenePt.wy, d.focalScenePt.wz)
                const pulse = Math.sin(ts * 0.0022 + 1) * 0.5 + 0.5
                ctx.beginPath(); ctx.arc(fp.x, fp.y, 14 + pulse*5, 0, Math.PI*2)
                ctx.fillStyle = `rgba(0,255,231,${0.05 + pulse*0.04})`; ctx.fill()
                ctx.beginPath(); ctx.arc(fp.x, fp.y, 7, 0, Math.PI*2)
                ctx.fillStyle = TEAL; ctx.fill()
                ctx.font = `bold 10px ${SANS}`; ctx.fillStyle = TEAL
                ctx.textAlign = 'center'
                const lbl = d.focalScenePt.track.artist
                ctx.fillText(lbl.length > 20 ? lbl.slice(0,18)+'…' : lbl, fp.x, fp.y - 14)
            }

            // ── Hover: nearest track in screen-space ───────────────────────
            // (done in onPointerMove via state — just draw the label here)

            ctx.restore()
            rafRef.current = requestAnimationFrame(draw)
        }

        rafRef.current = requestAnimationFrame(draw)
        return () => {
            running = false
            cancelAnimationFrame(rafRef.current)
            canvas.removeEventListener('wheel', onWheel)
        }
    }, [])  // reads from dataRef + viewRef — no restarts

    // ── Hover detection (screen-space nearest) ────────────────────────────────
    const onMouseMoveHover = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
        const canvas = canvasRef.current
        if (!canvas) return
        const rect  = canvas.getBoundingClientRect()
        const mx = e.clientX - rect.left, my = e.clientY - rect.top
        const W = canvas.clientWidth, H = canvas.clientHeight
        const a = viewRef.current.angle, z = viewRef.current.zoom

        let best: TrackScenePt | null = null, bestD = 24 ** 2
        for (const tp of trackPts) {
            const sp = project(tp.wx, tp.wy, tp.wz, a, W, H, z)
            const d2 = (sp.x - mx)**2 + (sp.y - my)**2
            if (d2 < bestD) { bestD = d2; best = tp }
        }
        setHovered(best)
        setMousePos({ x: e.clientX, y: e.clientY })
    }, [trackPts])

    // ─────────────────────────────────────────────────────────────────────────
    const probPct     = Math.round(focalProb * 100)
    const verdictColor = focalProb > 0.68 ? TEAL : focalProb > 0.40 ? '#34d399' : focalProb > 0.20 ? '#fbbf24' : '#ff7090'

    return (
        <div style={{ position: 'relative', width: '100%', height: '100%', background: DARK_BG, overflow: 'hidden', fontFamily: SANS }}>

            <canvas
                ref={canvasRef}
                onPointerDown={onPointerDown}
                onPointerMove={(e) => { onPointerMove(e); onMouseMoveHover(e) }}
                onPointerUp={onPointerUp}
                onPointerLeave={onPointerUp}
                onDoubleClick={() => { viewRef.current.zoom = 1; viewRef.current.angle = 0.55 }}
                style={{ display: 'block', width: '100%', height: '100%', cursor, touchAction: 'none' }}
            />

            {/* ── Back + title ──────────────────────────────────────── */}
            <div style={{ position: 'absolute', top: 14, left: 14, display: 'flex', alignItems: 'center', gap: 10, zIndex: 10 }}>
                {onBack && (
                    <button onClick={onBack} style={{ background: 'rgba(0,0,0,0.55)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.5)', fontSize: 11, padding: '5px 10px', cursor: 'pointer', backdropFilter: 'blur(8px)', fontFamily: MONO }}>
                        ← back
                    </button>
                )}
                <div style={{ background: 'rgba(0,0,0,0.55)', border: '1px solid rgba(255,255,255,0.08)', padding: '7px 12px', backdropFilter: 'blur(8px)' }}>
                    <div style={{ fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(0,255,231,0.45)', fontFamily: MONO, marginBottom: 2 }}>
                        {kernelState ? 'taste terrain' : 'sonic map'}
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#eeeef8' }}>{focalTrack.artist}</div>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{focalTrack.title}</div>
                </div>
            </div>

            {/* ── Kernel state HUD ──────────────────────────────────── */}
            {hudStats && (
                <div style={{ position: 'absolute', top: 14, right: 14, display: 'flex', flexDirection: 'column', gap: 7, zIndex: 10 }}>
                    <HUDCard label="Your state now" value={hudStats.state} color={TEAL}/>
                </div>
            )}

            {/* ── Recommendation bar ────────────────────────────────── */}
            <div style={{ position: 'absolute', bottom: 18, left: '50%', transform: 'translateX(-50%)', zIndex: 10, textAlign: 'center', whiteSpace: 'nowrap' }}>
                <div style={{ display: 'inline-block', background: 'rgba(0,0,0,0.68)', border: `1px solid ${verdictColor}30`, padding: '11px 22px', backdropFilter: 'blur(12px)' }}>
                    <div style={{ fontSize: 10, fontFamily: MONO, color: 'rgba(0,255,231,0.4)', letterSpacing: '0.08em', marginBottom: 4 }}>
                        KERNEL PROBABILITY · {probPct}%
                    </div>
                    {hudStats && (
                        <div style={{ fontSize: 13, fontWeight: 600, color: verdictColor }}>{hudStats.verdict}</div>
                    )}
                    {!kernelState && (
                        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', fontFamily: MONO }}>
                            showing sonic similarity · wire kernelState for taste terrain
                        </div>
                    )}
                </div>
            </div>

            {/* ── Controls hint ─────────────────────────────────────── */}
            <div style={{ position: 'absolute', bottom: 14, right: 14, fontSize: 9, color: 'rgba(255,255,255,0.12)', fontFamily: MONO, textAlign: 'right', lineHeight: 1.9, zIndex: 10 }}>
                drag to orbit · scroll to zoom<br/>double-click to reset
            </div>

            {/* ── Hover tooltip ─────────────────────────────────────── */}
            {hovered && (
                <div style={{ position: 'fixed', left: mousePos.x + 14, top: mousePos.y - 10, background: 'rgba(8,8,20,0.92)', border: '1px solid rgba(255,255,255,0.09)', padding: '9px 13px', pointerEvents: 'none', zIndex: 20, backdropFilter: 'blur(10px)', maxWidth: 210 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#eeeef8', marginBottom: 2 }}>{hovered.track.artist}</div>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', marginBottom: 7 }}>{hovered.track.title}</div>
                    <div style={{ fontSize: 10, fontFamily: MONO }}>
                        <span style={{ color: 'rgba(255,255,255,0.28)' }}>kernel prob </span>
                        <span style={{ color: hovered.prob > 0.6 ? TEAL : hovered.prob > 0.3 ? '#34d399' : '#fbbf24' }}>
                            {Math.round(hovered.prob * 100)}%
                        </span>
                    </div>
                </div>
            )}
        </div>
    )
}

// ── HUD card ──────────────────────────────────────────────────────────────────

function HUDCard({ label, value, color }: { label: string; value: string; color: string }) {
    return (
        <div style={{ background: 'rgba(0,0,0,0.58)', border: `1px solid ${color}20`, padding: '8px 12px', backdropFilter: 'blur(8px)', minWidth: 130 }}>
            <div style={{ fontSize: 9, fontFamily: MONO, letterSpacing: '0.09em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.22)', marginBottom: 3 }}>{label}</div>
            <div style={{ fontSize: 13, fontWeight: 700, color }}>{value}</div>
        </div>
    )
}