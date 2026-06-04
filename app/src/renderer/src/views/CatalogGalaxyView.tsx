/**
 * CatalogGalaxyView.tsx  (v6 — Every Noise at Once playback model)
 *
 * Interaction model stolen from Glenn McDonald's Every Noise at Once:
 *   HOVER DOT  → iTunes 30-sec preview starts after 280ms debounce,
 *                fades in over 400ms via Web Audio GainNode.
 *                The dot pulses with expanding rings while audio plays.
 *                Move to another dot → old audio fades out, new one starts.
 *   LEAVE CANVAS → audio fades out and stops.
 *   CLICK DOT  → onTrackSelect fires (open wiki article) AND onPlayTrack
 *                fires (hand off to the real Spotify/native playback router).
 *                The dot stays "selected" (white, larger) after click.
 *
 * Audio architecture:
 *   One AudioContext, one GainNode. On hover-start we create an Audio element
 *   wired through the gain node. On hover-end we ramp gain to 0 over 400ms,
 *   then pause+disconnect. iTunes preview URLs are cached by track id so
 *   revisiting a dot is instant.
 *
 * Pulse animation:
 *   The playing dot emits 3 concentric rings that expand outward and fade.
 *   Ring phase is driven by `ts` (RAF timestamp) mod a period. Each ring is
 *   offset by period/3 so they cascade evenly. The ring colour matches the
 *   dot's genre colour.
 */

import { useRef, useEffect, useState, useMemo, useCallback } from 'react'

// ── Palette ───────────────────────────────────────────────────────────────────

const BG = '#050309'
const FG = '#f2f0ff'
const FG4 = 'rgba(255,255,255,0.45)'
const ACCENT = '#e8005a'
const TEAL = '#00ffe7'
const VIOLET = '#a78bfa'
const BORDER2 = 'rgba(255,255,255,0.08)'
const MONO = '"Fragment Mono","DM Mono",monospace'
const SANS = '"Geist","Inter",sans-serif'
const DISP = '"Bebas Neue",sans-serif'

const WORLD = 500   // normalised-space half-extent in px at zoom=1

const BASE_URL = (import.meta as any).env?.VITE_CHROMA_URL ?? 'http://localhost:8080'
const ITUNES_CORS = 'https://itunes.apple.com'   // no CORS issues from browser

// ── Rendering constants ───────────────────────────────────────────────────────

const DOT_R = 3.0
const DOT_R_PLAY = 5.0
const DOT_R_MATCH = 5.5
const DOT_R_SEL = 8.0
const DOT_R_HOV = 7.0
const MIN_LABEL_SEP = 72
const MAX_LABELS = 200
const SUB_ZOOM = 0.5
const SUB_N = 4

const Z_GENRE = 1.2
const Z_ARTIST = 3.5
const Z_TITLE = 6.0

// ── Preview audio constants ───────────────────────────────────────────────────

const HOVER_DEBOUNCE_MS = 280   // wait before starting preview
const FADE_IN_MS = 400
const FADE_OUT_MS = 400
const PREVIEW_VOLUME = 0.65
const RING_PERIOD_MS = 1800  // one full ring expansion per period
const RING_MAX_R = 28    // max ring radius in screen px

// ── Genre colours ─────────────────────────────────────────────────────────────

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
function genreHue(g: string | null | undefined): string {
    if (!g) return '#6a678a'
    const k = g.toLowerCase()
    for (const [p, v] of Object.entries(GENRE_PALETTE)) if (k.includes(p) || p.includes(k)) return v
    let h = 0; for (let i = 0; i < k.length; i++) h = (h * 31 + k.charCodeAt(i)) >>> 0
    return `hsl(${h % 360},65%,58%)`
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface CatalogTrack { id: string; title: string; artist: string; genres: string[]; moods: string[]; px: number; py: number }
interface GenreCentroid { genre: string; px: number; py: number; count: number }
export interface KernelState { mu: Float32Array; velocity: Float32Array; sigma: number }
export interface GalaxyTrackRef { id: string; title: string; artist: string; genres: string[] }
export interface CatalogGalaxyProps {
    kernelState?: KernelState
    playHistory?: GalaxyTrackRef[]
    onTrackSelect?: (t: GalaxyTrackRef) => void  // open wiki article
    onPlayTrack?: (t: GalaxyTrackRef) => void  // hand off to Spotify/native router
    onBack?: () => void
}

// ── Spatial grid ──────────────────────────────────────────────────────────────

const GC = 64, GS = 2 / GC
class SpatialGrid {
    private cells = new Map<number, CatalogTrack[]>()
    private key(cx: number, cy: number) { return cy * GC + cx }
    private cl(v: number) { return Math.max(0, Math.min(GC - 1, v)) }
    build(tracks: CatalogTrack[]) {
        this.cells.clear()
        for (const t of tracks) {
            const k = this.key(this.cl(Math.floor((t.px + 1) / GS)), this.cl(Math.floor((t.py + 1) / GS)))
            if (!this.cells.has(k)) this.cells.set(k, [])
            this.cells.get(k)!.push(t)
        }
    }
    query(px: number, py: number, r: number): CatalogTrack[] {
        const out: CatalogTrack[] = []
        const x0 = this.cl(Math.floor((px - r + 1) / GS)), x1 = this.cl(Math.floor((px + r + 1) / GS))
        const y0 = this.cl(Math.floor((py - r + 1) / GS)), y1 = this.cl(Math.floor((py + r + 1) / GS))
        for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
            const c = this.cells.get(this.key(cx, cy)); if (c) out.push(...c)
        }
        return out
    }
}

// ── Label placement ───────────────────────────────────────────────────────────

class LabelGrid {
    private slots = new Set<number>()
    private sep: number
    constructor(sep: number) { this.sep = sep }
    reset() { this.slots.clear() }
    try(sx: number, sy: number): boolean {
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
            const k = (Math.round(sy / this.sep) + dy) * 100000 + (Math.round(sx / this.sep) + dx)
            if (this.slots.has(k)) return false
        }
        this.slots.add((Math.round(sy / this.sep)) * 100000 + Math.round(sx / this.sep))
        return true
    }
}

// ── iTunes preview fetcher (cached) ──────────────────────────────────────────

const previewCache = new Map<string, string | null>()  // trackId → previewUrl | null

async function fetchPreviewUrl(track: CatalogTrack): Promise<string | null> {
    const cacheKey = track.id
    if (previewCache.has(cacheKey)) return previewCache.get(cacheKey)!
    try {
        const q = encodeURIComponent(`${track.artist} ${track.title}`)
        const res = await fetch(`${ITUNES_CORS}/search?term=${q}&media=music&entity=song&limit=5`)
        const json = await res.json()
        const results: any[] = json.results ?? []
        const hit = results.find((r: any) =>
            r.trackName?.toLowerCase() === track.title.toLowerCase() &&
            r.artistName?.toLowerCase() === track.artist.toLowerCase()
        ) ?? results.find((r: any) =>
            r.trackName?.toLowerCase().includes(track.title.toLowerCase())
        ) ?? results[0]
        const url = hit?.previewUrl ?? null
        previewCache.set(cacheKey, url)
        return url
    } catch {
        previewCache.set(cacheKey, null)
        return null
    }
}

// ── Audio engine ──────────────────────────────────────────────────────────────
// Singleton: one AudioContext + GainNode for the whole view.
// We lazily create it on first hover (browsers block AudioContext until gesture).

class PreviewEngine {
    private ctx: AudioContext | null = null
    private gain: GainNode | null = null
    private source: MediaElementAudioSourceNode | null = null
    private el: HTMLAudioElement | null = null
    private fadeTimer: ReturnType<typeof setTimeout> | null = null
    playingId: string | null = null
    progress: number = 0   // 0–1, updated from timeupdate

    private getCtx(): AudioContext {
        if (!this.ctx) {
            this.ctx = new AudioContext()
            this.gain = this.ctx.createGain()
            this.gain.gain.setValueAtTime(0, this.ctx.currentTime)
            this.gain.connect(this.ctx.destination)
        }
        return this.ctx
    }

    async play(track: CatalogTrack, url: string) {
        if (this.playingId === track.id) return   // already playing this one
        await this.stopNow()

        const ctx = this.getCtx()
        if (ctx.state === 'suspended') await ctx.resume()

        const el = new Audio()
        el.crossOrigin = 'anonymous'
        el.src = url
        el.addEventListener('timeupdate', () => {
            this.progress = el.currentTime / (el.duration || 30)
        })
        el.addEventListener('ended', () => { this.playingId = null; this.progress = 0 })

        const src = ctx.createMediaElementSource(el)
        src.connect(this.gain!)

        this.el = el
        this.source = src
        this.playingId = track.id
        this.progress = 0

        // Fade in
        this.gain!.gain.cancelScheduledValues(ctx.currentTime)
        this.gain!.gain.setValueAtTime(0, ctx.currentTime)
        this.gain!.gain.linearRampToValueAtTime(PREVIEW_VOLUME, ctx.currentTime + FADE_IN_MS / 1000)

        el.play().catch(() => { })
    }

    async fadeOut() {
        if (!this.ctx || !this.gain || !this.el) return
        const ctx = this.ctx
        this.gain.gain.cancelScheduledValues(ctx.currentTime)
        this.gain.gain.setValueAtTime(this.gain.gain.value, ctx.currentTime)
        this.gain.gain.linearRampToValueAtTime(0, ctx.currentTime + FADE_OUT_MS / 1000)
        const el = this.el
        this.fadeTimer = setTimeout(() => { el.pause(); }, FADE_OUT_MS + 50)
        this.playingId = null
        this.progress = 0
    }

    async stopNow() {
        if (this.fadeTimer) { clearTimeout(this.fadeTimer); this.fadeTimer = null }
        if (this.gain && this.ctx) {
            this.gain.gain.cancelScheduledValues(this.ctx.currentTime)
            this.gain.gain.setValueAtTime(0, this.ctx.currentTime)
        }
        if (this.el) { this.el.pause(); this.el = null }
        if (this.source) { try { this.source.disconnect() } catch { } this.source = null }
        this.playingId = null
        this.progress = 0
    }
}

// ── Zoom presets ──────────────────────────────────────────────────────────────

const ZOOM_LAYERS = [
    { label: 'ALL', zoom: 0.55 },
    { label: 'GENRE', zoom: 1.6 },
    { label: 'ARTIST', zoom: 4.0 },
    { label: 'TRACK', zoom: 7.5 },
]

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function CatalogGalaxyView({ kernelState, playHistory = [], onTrackSelect, onPlayTrack, onBack }: CatalogGalaxyProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const wrapperRef = useRef<HTMLDivElement>(null)
    const rafRef = useRef<number>(0)
    const viewRef = useRef({ ox: 0, oy: 0, zoom: 1 })
    const prevView = useRef<{ ox: number; oy: number; zoom: number } | null>(null)
    const panRef = useRef<{ sx: number; sy: number; ox0: number; oy0: number } | null>(null)
    const lassoRef = useRef<{ x0: number; y0: number; x1: number; y1: number } | null>(null)
    const mousePosRef = useRef<{ x: number; y: number } | null>(null)
    const gridRef = useRef(new SpatialGrid())
    const labelGrid = useRef(new LabelGrid(MIN_LABEL_SEP))
    const audioRef = useRef(new PreviewEngine())

    // Hover-debounce: timer id + last hovered track id
    const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const pendingHoverRef = useRef<CatalogTrack | null>(null)

    // Playing state for the RAF loop (read without React re-render)
    const playStateRef = useRef<{ id: string | null; progress: number; startTs: number }>({ id: null, progress: 0, startTs: 0 })

    const dataRef = useRef<{ tracks: CatalogTrack[]; genres: GenreCentroid[]; search: string; playIds: Set<string> }>(
        { tracks: [], genres: [], search: '', playIds: new Set() }
    )

    const [tracks, setTracks] = useState<CatalogTrack[]>([])
    const [genres, setGenres] = useState<GenreCentroid[]>([])
    const [loading, setLoading] = useState(true)
    const [computing, setComputing] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [search, setSearch] = useState('')
    const [cursor, setCursor] = useState<string>('grab')
    const [hovered, setHovered] = useState<CatalogTrack | null>(null)
    const [selected, setSelected] = useState<CatalogTrack | null>(null)
    const [mousePos, setMousePos] = useState({ x: 0, y: 0 })
    const [stats, setStats] = useState({ total: 0 })
    const [zoomLayer, setZoomLayer] = useState(0)
    const [lassoActive, setLassoActive] = useState(false)
    const [hasPrev, setHasPrev] = useState(false)
    // Reactive playing state for the tooltip UI only
    const [playingId, setPlayingId] = useState<string | null>(null)
    const [playProg, setPlayProg] = useState(0)

    const [selectedPos, setSelectedPos] = useState<{ x: number; y: number } | null>(null)

    // ── Fetch catalog ─────────────────────────────────────────────────────────
    useEffect(() => {
        let dead = false; setLoading(true); setError(null)
        const poll = async () => {
            try {
                const res = await fetch(`${BASE_URL}/catalog/map`)
                if (!res.ok) throw new Error(`HTTP ${res.status}`)
                const d = await res.json(); if (dead) return
                if (d.computing) { setComputing(true); setTimeout(poll, 3000); return }
                setComputing(false); setTracks(d.tracks ?? []); setGenres(d.genres ?? [])
                setStats({ total: d.total ?? 0 })
            } catch (e: any) { if (!dead) setError(e.message) }
            finally { if (!dead) setLoading(false) }
        }
        poll(); return () => { dead = true }
    }, [])

    const playIds = useMemo(() => new Set(playHistory.map(t => t.id)), [playHistory])
    useEffect(() => {
        dataRef.current = { tracks, genres, search, playIds }
        gridRef.current.build(tracks)
    }, [tracks, genres, search, playIds])

    // Cleanup audio on unmount
    useEffect(() => {
        const audio = audioRef.current
        return () => { audio.stopNow() }
    }, [])

    // ── Canvas sizing ─────────────────────────────────────────────────────────
    useEffect(() => {
        const cv = canvasRef.current, wr = wrapperRef.current; if (!cv || !wr) return
        const sync = () => {
            const dpr = window.devicePixelRatio || 1
            const { width: w, height: h } = wr.getBoundingClientRect()
            if (w && h) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr) }
        }
        const ro = new ResizeObserver(sync); ro.observe(wr); sync()
        return () => ro.disconnect()
    }, [])

    // ── Coord helpers ─────────────────────────────────────────────────────────
    const W2 = (sx: number, sy: number, W: number, H: number) => {
        const { ox, oy, zoom } = viewRef.current
        return { px: (sx - W / 2 - ox) / (WORLD * zoom), py: (sy - H / 2 - oy) / (WORLD * zoom) }
    }

    // ── Wheel zoom ────────────────────────────────────────────────────────────
    useEffect(() => {
        const cv = canvasRef.current; if (!cv) return
        const onWheel = (e: WheelEvent) => {
            e.preventDefault()
            const r = cv.getBoundingClientRect()
            const mx = e.clientX - r.left, my = e.clientY - r.top
            const { ox, oy, zoom } = viewRef.current
            const nz = Math.max(0.15, Math.min(40, zoom * (e.deltaY > 0 ? 0.82 : 1.22)))
            // Keep world point under cursor fixed:
            //   toSx(p) = W/2 + ox + p*WORLD*zoom  →  ox_new = (mx-W/2) - (mx-W/2-ox)*(nz/zoom)
            const dprW = cv.width / (window.devicePixelRatio || 1)
            const dprH = cv.height / (window.devicePixelRatio || 1)
            viewRef.current = {
                ox: (mx - dprW / 2) - (mx - dprW / 2 - ox) * (nz / zoom),
                oy: (my - dprH / 2) - (my - dprH / 2 - oy) * (nz / zoom),
                zoom: nz,
            }
        }
        cv.addEventListener('wheel', onWheel, { passive: false })
        return () => cv.removeEventListener('wheel', onWheel)
    }, [])

    // ── Keyboard navigation ───────────────────────────────────────────────────
    // Arrows: pan.  Ctrl+↑/↓: zoom in/out.  Ctrl+R or Shift+R: reset view.
    // Pan step scales with zoom so it always feels like ~80px of movement.
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            // Don't steal keys when focus is in an input
            if ((e.target as HTMLElement)?.tagName === 'INPUT') return

            const { ox, oy, zoom } = viewRef.current

            if (e.ctrlKey || e.metaKey) {
                switch (e.key) {
                    case 'ArrowUp': case '+': case '=': {
                        e.preventDefault()
                        const nz = Math.min(40, zoom * 1.22)
                        viewRef.current = { ox: ox * (nz / zoom), oy: oy * (nz / zoom), zoom: nz }
                        break
                    }
                    case 'ArrowDown': case '-': {
                        e.preventDefault()
                        const nz = Math.max(0.15, zoom * 0.82)
                        viewRef.current = { ox: ox * (nz / zoom), oy: oy * (nz / zoom), zoom: nz }
                        break
                    }
                    case 'r': case 'R': {
                        e.preventDefault()
                        prevView.current = { ...viewRef.current }; setHasPrev(true)
                        viewRef.current = { ox: 0, oy: 0, zoom: 1 }
                        break
                    }
                }
                return
            }

            switch (e.key) {
                case 'ArrowLeft': e.preventDefault(); viewRef.current = { ...viewRef.current, ox: ox + 80 }; break
                case 'ArrowRight': e.preventDefault(); viewRef.current = { ...viewRef.current, ox: ox - 80 }; break
                case 'ArrowUp': e.preventDefault(); viewRef.current = { ...viewRef.current, oy: oy + 80 }; break
                case 'ArrowDown': e.preventDefault(); viewRef.current = { ...viewRef.current, oy: oy - 80 }; break
                case 'Escape': setSelected(null); break
            }
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [])   // stable: only reads refs and stable setters

    // ── Hover + preview trigger ───────────────────────────────────────────────
    // We separate "hover candidate from RAF" from "trigger preview" so the
    // preview debounce doesn't block the hover tooltip.

    const triggerPreview = useCallback((track: CatalogTrack) => {
        if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current)
        pendingHoverRef.current = track
        hoverTimerRef.current = setTimeout(async () => {
            const t = pendingHoverRef.current; if (!t) return
            const url = await fetchPreviewUrl(t); if (!url) return
            // Check we still care about this track
            if (pendingHoverRef.current?.id !== t.id) return
            await audioRef.current.play(t, url)
            playStateRef.current = { id: t.id, progress: 0, startTs: performance.now() }
            setPlayingId(t.id)
        }, HOVER_DEBOUNCE_MS)
    }, [])

    const cancelPreview = useCallback(() => {
        if (hoverTimerRef.current) { clearTimeout(hoverTimerRef.current); hoverTimerRef.current = null }
        pendingHoverRef.current = null
        audioRef.current.fadeOut()
        playStateRef.current = { id: null, progress: 0, startTs: 0 }
        setPlayingId(null); setPlayProg(0)
    }, [])

    // ── Pointer events ────────────────────────────────────────────────────────
    const onPointerDown = useCallback((e: React.PointerEvent) => {
        ; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
        const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
        const lx = e.clientX - r.left, ly = e.clientY - r.top
        if (e.shiftKey) {
            lassoRef.current = { x0: lx, y0: ly, x1: lx, y1: ly }
            panRef.current = null; setCursor('crosshair'); setLassoActive(true)
        } else {
            panRef.current = { sx: e.clientX, sy: e.clientY, ox0: viewRef.current.ox, oy0: viewRef.current.oy }
            lassoRef.current = null; setCursor('grabbing')
        }
    }, [])

    const onPointerMove = useCallback((e: React.PointerEvent) => {
        const r = canvasRef.current?.getBoundingClientRect(); if (!r) return
        const lx = e.clientX - r.left, ly = e.clientY - r.top
        mousePosRef.current = { x: lx, y: ly }; setMousePos({ x: lx, y: ly })
        if (panRef.current) {
            const { sx, sy, ox0, oy0 } = panRef.current
            viewRef.current = { ...viewRef.current, ox: ox0 + e.clientX - sx, oy: oy0 + e.clientY - sy }
        }
        if (lassoRef.current) lassoRef.current = { ...lassoRef.current, x1: lx, y1: ly }
    }, [])

    const onPointerUp = useCallback(() => {
        const lasso = lassoRef.current
        if (lasso) {
            const cv = canvasRef.current
            if (cv) {
                const r = cv.getBoundingClientRect(); const W = r.width, H = r.height
                const sw = Math.abs(lasso.x1 - lasso.x0), sh = Math.abs(lasso.y1 - lasso.y0)
                if (sw > 12 && sh > 12) {
                    const { px: wx0, py: wy0 } = W2(Math.min(lasso.x0, lasso.x1), Math.min(lasso.y0, lasso.y1), W, H)
                    const { px: wx1, py: wy1 } = W2(Math.max(lasso.x0, lasso.x1), Math.max(lasso.y0, lasso.y1), W, H)
                    const ww = Math.abs(wx1 - wx0), wh = Math.abs(wy1 - wy0)
                    if (ww > 0 && wh > 0) {
                        const nz = Math.min(40, Math.min(W / (ww * WORLD), H / (wh * WORLD)) * 0.88)
                        const cx = (wx0 + wx1) / 2, cy = (wy0 + wy1) / 2
                        prevView.current = { ...viewRef.current }; setHasPrev(true)
                        // toSx(cx) must equal W/2 (put lasso centre at screen centre):
                        //   W/2 + ox + cx*WORLD*nz = W/2  →  ox = -cx*WORLD*nz
                        viewRef.current = { zoom: nz, ox: -cx * WORLD * nz, oy: -cy * WORLD * nz }
                    }
                }
            }
        }
        lassoRef.current = null; panRef.current = null; setLassoActive(false); setCursor('grab')
    }, [])

    const onPointerLeave = useCallback(() => {
        lassoRef.current = null; panRef.current = null; mousePosRef.current = null
        setLassoActive(false); setHovered(null); setCursor('grab')
        cancelPreview()
    }, [cancelPreview])

    const onDoubleClick = useCallback(() => {
        prevView.current = { ...viewRef.current }; setHasPrev(true)
        viewRef.current = { ox: 0, oy: 0, zoom: 1 }
    }, [])

    const onClick = useCallback(() => {
        if (panRef.current) return

        if (hovered) {
            setSelected(hovered)

            if (mousePosRef.current) {
                setSelectedPos({
                    x: mousePosRef.current.x,
                    y: mousePosRef.current.y,
                })
            }

            onPlayTrack?.(hovered)
        } else {
            setSelected(null)
            setSelectedPos(null)
        }
    }, [hovered, onPlayTrack])

    const goToLayer = useCallback((idx: number) => {
        const cv = canvasRef.current; if (!cv) return
        const r = cv.getBoundingClientRect(); const W = r.width, H = r.height
        const { ox, oy, zoom } = viewRef.current; const nz = ZOOM_LAYERS[idx].zoom
        prevView.current = { ox, oy, zoom }; setHasPrev(true)
        // Keep the world point currently at screen centre fixed:
        //   worldCx = -ox/(WORLD*zoom)  →  ox_new = -worldCx*WORLD*nz = ox*(nz/zoom)
        viewRef.current = { zoom: nz, ox: ox * (nz / zoom), oy: oy * (nz / zoom) }
        setZoomLayer(idx)
    }, [])

    const zoomOut = useCallback(() => {
        if (!prevView.current) return
        viewRef.current = prevView.current; prevView.current = null; setHasPrev(false)
    }, [])

    // ── RAF draw loop ─────────────────────────────────────────────────────────
    useEffect(() => {
        const cv = canvasRef.current; if (!cv) return
        const ctx = cv.getContext('2d')!
        let running = true
        let grouped = new Map<string, CatalogTrack[]>()
        let lastTkLen = -1

        const draw = (ts: number) => {
            if (!running) return
            const dpr = window.devicePixelRatio || 1
            const W = cv.width / dpr, H = cv.height / dpr
            const { ox, oy, zoom } = viewRef.current
            const { tracks: tks, genres: gens, search: sq, playIds: pids } = dataRef.current
            const mouse = mousePosRef.current
            const lasso = lassoRef.current
            const audio = audioRef.current

            // Sync audio progress to ref for tooltip
            if (audio.playingId) {
                playStateRef.current.progress = audio.progress
                setPlayProg(audio.progress)
            }

            if (tks.length !== lastTkLen) {
                lastTkLen = tks.length; grouped = new Map()
                for (const t of tks) {
                    const g = t.genres[0] ?? '__unknown'
                    if (!grouped.has(g)) grouped.set(g, [])
                    grouped.get(g)!.push(t)
                }
            }

            const toSx = (px: number) => W / 2 + ox + px * WORLD * zoom
            const toSy = (py: number) => H / 2 + oy + py * WORLD * zoom

            ctx.clearRect(0, 0, cv.width, cv.height)
            ctx.save(); ctx.scale(dpr, dpr)

            // Background
            ctx.fillStyle = BG; ctx.fillRect(0, 0, W, H)
            const bg = ctx.createRadialGradient(W / 2 + ox, H / 2 + oy, 0, W / 2 + ox, H / 2 + oy, Math.max(W, H) * 0.72)
            bg.addColorStop(0, 'rgba(14,10,26,0.9)'); bg.addColorStop(1, BG)
            ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H)

            if (tks.length === 0) { ctx.restore(); rafRef.current = requestAnimationFrame(draw); return }

            const hasSearch = sq.trim().length > 0
            const searchLow = sq.toLowerCase()
            const subsample = zoom < SUB_ZOOM
            const playingTrackId = audio.playingId

            // ── DOTS ──────────────────────────────────────────────────────────
            let hovCandidate: CatalogTrack | null = null
            let hovDist = 24
            let dotIdx = 0

            grouped.forEach((gTracks, genre) => {
                const col = genreHue(genre)
                ctx.fillStyle = col

                for (const t of gTracks) {
                    dotIdx++
                    if (subsample && dotIdx % SUB_N !== 0) continue

                    const sx = toSx(t.px), sy = toSy(t.py)
                    if (sx < -10 || sx > W + 10 || sy < -10 || sy > H + 10) continue

                    const isPlay = pids.has(t.id)
                    const isMatch = hasSearch && (
                        t.artist.toLowerCase().includes(searchLow) ||
                        t.title.toLowerCase().includes(searchLow)
                    )
                    const isSel = selected?.id === t.id
                    const isPlaying = playingTrackId === t.id
                    const dim = hasSearch && !isMatch && !isPlay

                    if (mouse) {
                        const d = Math.hypot(sx - mouse.x, sy - mouse.y)
                        if (d < hovDist) { hovDist = d; hovCandidate = t }
                    }

                    // ── Playing dot: expanding ring animation ──────────────────
                    if (isPlaying) {
                        const ringCol = genreHue(t.genres[0])
                        for (let ri = 0; ri < 3; ri++) {
                            // Phase-offset each ring by 1/3 period
                            const phase = ((ts % RING_PERIOD_MS) / RING_PERIOD_MS + ri / 3) % 1
                            const r2 = phase * RING_MAX_R
                            const alpha = (1 - phase) * 0.55
                            ctx.beginPath(); ctx.arc(sx, sy, r2, 0, Math.PI * 2)
                            ctx.strokeStyle = ringCol; ctx.globalAlpha = alpha
                            ctx.lineWidth = 1.5; ctx.stroke()
                        }
                        ctx.globalAlpha = 1; ctx.lineWidth = 1
                    }

                    const r = isSel ? DOT_R_SEL : isPlay ? DOT_R_PLAY : isMatch ? DOT_R_MATCH : isPlaying ? DOT_R_HOV : DOT_R
                    ctx.globalAlpha = dim ? 0.08 : isSel ? 1.0 : isPlaying ? 1.0 : isPlay ? 0.9 : isMatch ? 0.95 : 0.7

                    if (isSel) { ctx.shadowColor = '#fff'; ctx.shadowBlur = 18; ctx.fillStyle = '#fff' }
                    else if (isPlaying) { ctx.shadowColor = col; ctx.shadowBlur = 16; ctx.fillStyle = col }
                    else if (isPlay) { ctx.shadowColor = VIOLET; ctx.shadowBlur = 8; ctx.fillStyle = VIOLET }
                    else if (isMatch) { ctx.shadowColor = col; ctx.shadowBlur = 10; ctx.fillStyle = col }
                    else { ctx.shadowBlur = 0; ctx.fillStyle = col }

                    ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2); ctx.fill()
                    ctx.shadowBlur = 0; ctx.fillStyle = col; ctx.globalAlpha = 1
                }
            })

            // ── Hover glow ────────────────────────────────────────────────────
            if (hovCandidate) {
                const hc = hovCandidate as CatalogTrack
                const sx = toSx(hc.px), sy = toSy(hc.py)
                const col = genreHue(hc.genres[0])
                ctx.shadowColor = col; ctx.shadowBlur = 24
                ctx.fillStyle = col; ctx.globalAlpha = 1
                ctx.beginPath(); ctx.arc(sx, sy, DOT_R_HOV, 0, Math.PI * 2); ctx.fill()
                ctx.shadowBlur = 0
            }

            // Sync hover state + trigger preview if changed
            setHovered(prev => {
                const same = prev?.id === hovCandidate?.id
                if (!same) {
                    if (hovCandidate) {
                        triggerPreview(hovCandidate)
                    } else {
                        cancelPreview()
                    }
                }
                return same ? prev : hovCandidate
            })
            setCursor(prev =>
                prev === 'grabbing' || prev === 'crosshair' ? prev
                    : hovCandidate ? 'pointer' : 'grab'
            )

            // ── Kernel μ ──────────────────────────────────────────────────────
            const histTracks = tks.filter(t => pids.has(t.id))
            if (kernelState || histTracks.length > 0) {
                const kpx = histTracks.length ? histTracks.reduce((s, t) => s + t.px, 0) / histTracks.length : 0
                const kpy = histTracks.length ? histTracks.reduce((s, t) => s + t.py, 0) / histTracks.length : 0
                const kx = toSx(kpx), ky = toSy(kpy)
                const pulse = Math.sin(ts * 0.0018) * 0.5 + 0.5
                    ;[48, 28, 16].forEach((r, i) => {
                        ctx.beginPath(); ctx.arc(kx, ky, r + pulse * 6, 0, Math.PI * 2)
                        ctx.fillStyle = `rgba(0,255,231,${[0.04, 0.09, 0.16][i] + pulse * 0.05})`; ctx.fill()
                    })
                ctx.shadowColor = TEAL; ctx.shadowBlur = 20
                ctx.beginPath(); ctx.arc(kx, ky, 6, 0, Math.PI * 2)
                ctx.fillStyle = TEAL; ctx.fill(); ctx.shadowBlur = 0
                const lbl = kernelState ? 'μ  YOUR TASTE' : 'μ  PLAY CENTRE'
                const lw = 100, lh = 18, lx2 = kx - lw / 2, ly2 = ky - 30 - lh / 2
                ctx.fillStyle = 'rgba(0,255,231,0.14)'; ctx.strokeStyle = 'rgba(0,255,231,0.5)'
                ctx.lineWidth = 1; ctx.beginPath(); ctx.roundRect(lx2, ly2, lw, lh, 2); ctx.fill(); ctx.stroke()
                ctx.font = `bold 9px ${MONO}`; ctx.fillStyle = TEAL; ctx.textAlign = 'center'
                ctx.fillText(lbl, kx, ly2 + 12)
            }

            // ── Genre pills ───────────────────────────────────────────────────
            if (zoom >= Z_GENRE) {
                const alpha = Math.min(1, (zoom - Z_GENRE) / 0.5)
                gens.forEach(({ genre, px: gpx, py: gpy, count }) => {
                    const sx = toSx(gpx), sy = toSy(gpy)
                    if (sx < -120 || sx > W + 120 || sy < -30 || sy > H + 30) return
                    const fs = Math.max(11, Math.min(18, 10 + count * 0.02))
                    ctx.font = `bold ${fs}px ${DISP}`; ctx.textAlign = 'center'; ctx.letterSpacing = '0.06em'
                    const tw = ctx.measureText(genre.toUpperCase()).width + 14
                    ctx.globalAlpha = alpha * 0.82
                    ctx.fillStyle = 'rgba(5,3,9,0.85)'; ctx.strokeStyle = 'rgba(255,255,255,0.10)'
                    ctx.lineWidth = 1; ctx.beginPath(); ctx.roundRect(sx - tw / 2, sy - fs - 3, tw, fs + 9, 2)
                    ctx.fill(); ctx.stroke()
                    ctx.fillStyle = '#fff'; ctx.globalAlpha = alpha
                    ctx.fillText(genre.toUpperCase(), sx, sy + 2)
                    ctx.globalAlpha = 1; ctx.letterSpacing = '0'
                })
            }

            // ── Artist labels (separation-culled) ─────────────────────────────
            if (zoom >= Z_ARTIST) {
                const alpha = Math.min(1, (zoom - Z_ARTIST) / 1.2)
                labelGrid.current.reset()
                let placed = 0
                ctx.font = `bold 10px ${SANS}`; ctx.textAlign = 'center'
                for (const t of tks) {
                    if (placed >= MAX_LABELS) break
                    const sx = toSx(t.px), sy = toSy(t.py)
                    if (sx < 8 || sx > W - 8 || sy < 14 || sy > H - 4) continue
                    if (!labelGrid.current.try(sx, sy - 14)) continue
                    placed++
                    const lbl = t.artist.length > 18 ? t.artist.slice(0, 16) + '…' : t.artist
                    ctx.globalAlpha = alpha
                    ctx.shadowColor = BG; ctx.shadowBlur = 6; ctx.fillStyle = '#fff'
                    ctx.fillText(lbl, sx, sy - DOT_R - 5)
                    ctx.shadowBlur = 0; ctx.globalAlpha = 1
                }
            }

            // ── Track titles ──────────────────────────────────────────────────
            if (zoom >= Z_TITLE) {
                const alpha = Math.min(1, (zoom - Z_TITLE) / 1.5)
                const titleGrid = new LabelGrid(MIN_LABEL_SEP * 0.8)
                ctx.font = `9px ${SANS}`; ctx.textAlign = 'center'
                let placed = 0
                for (const t of tks) {
                    if (placed >= MAX_LABELS) break
                    const sx = toSx(t.px), sy = toSy(t.py)
                    if (sx < 8 || sx > W - 8 || sy < 4 || sy > H - 20) continue
                    if (!titleGrid.try(sx, sy + 14)) continue
                    placed++
                    const lbl = t.title.length > 22 ? t.title.slice(0, 20) + '…' : t.title
                    ctx.globalAlpha = alpha * 0.75
                    ctx.shadowColor = BG; ctx.shadowBlur = 5; ctx.fillStyle = genreHue(t.genres[0])
                    ctx.fillText(lbl, sx, sy + DOT_R + 12)
                    ctx.shadowBlur = 0; ctx.globalAlpha = 1
                }
            }

            // ── Lasso ─────────────────────────────────────────────────────────
            if (lasso) {
                const x0 = Math.min(lasso.x0, lasso.x1), y0 = Math.min(lasso.y0, lasso.y1)
                const sw = Math.abs(lasso.x1 - lasso.x0), sh = Math.abs(lasso.y1 - lasso.y0)
                ctx.strokeStyle = TEAL; ctx.lineWidth = 1.5; ctx.setLineDash([5, 3])
                ctx.strokeRect(x0, y0, sw, sh)
                ctx.fillStyle = 'rgba(0,255,231,0.05)'; ctx.fillRect(x0, y0, sw, sh)
                ctx.setLineDash([])
                const cs = 8; ctx.strokeStyle = TEAL; ctx.lineWidth = 1.5
                for (const [cx2, cy2] of [[x0, y0], [x0 + sw, y0], [x0, y0 + sh], [x0 + sw, y0 + sh]] as [number, number][]) {
                    ctx.beginPath(); ctx.moveTo(cx2 - cs, cy2); ctx.lineTo(cx2 + cs, cy2); ctx.stroke()
                    ctx.beginPath(); ctx.moveTo(cx2, cy2 - cs); ctx.lineTo(cx2, cy2 + cs); ctx.stroke()
                }
            }

            // ── HUD ───────────────────────────────────────────────────────────
            ctx.textAlign = 'left'; ctx.font = `9px ${MONO}`; ctx.fillStyle = 'rgba(255,255,255,0.13)'
            ctx.fillText(
                `${tks.length.toLocaleString()} tracks · SCROLL/CTRL+↑↓ zoom · DRAG/ARROWS pan · SHIFT+DRAG frame · HOVER preview · CLICK play`,
                12, H - 12
            )
            if (hasSearch) {
                const hits = tks.filter(t =>
                    t.artist.toLowerCase().includes(searchLow) || t.title.toLowerCase().includes(searchLow)
                ).length
                ctx.fillStyle = ACCENT
                ctx.fillText(`${hits} match${hits === 1 ? '' : 'es'} for "${sq}"`, 12, H - 26)
            }
            ctx.textAlign = 'right'; ctx.fillStyle = 'rgba(255,255,255,0.22)'
            ctx.fillText(`${zoom.toFixed(2)}×`, W - 12, H - 12)

            ctx.restore()
            rafRef.current = requestAnimationFrame(draw)
        }

        rafRef.current = requestAnimationFrame(draw)
        return () => { running = false; cancelAnimationFrame(rafRef.current) }
    }, [selected, kernelState, triggerPreview, cancelPreview])

    // ─────────────────────────────────────────────────────────────────────────
    // Render
    // ─────────────────────────────────────────────────────────────────────────

    const hovCol = hovered ? genreHue(hovered.genres[0]) : ACCENT
    const selCol = selected ? genreHue(selected.genres[0]) : ACCENT

    return (
        <div style={{ position: 'relative', width: '100%', height: '100%', background: BG, overflow: 'hidden', fontFamily: SANS }}>

            <div ref={wrapperRef} style={{ position: 'absolute', inset: 0 }}>
                <canvas ref={canvasRef}
                    onPointerDown={onPointerDown} onPointerMove={onPointerMove}
                    onPointerUp={onPointerUp} onPointerLeave={onPointerLeave}
                    onDoubleClick={onDoubleClick} onClick={onClick}
                    style={{ display: 'block', width: '100%', height: '100%', cursor, touchAction: 'none' }}
                />
            </div>

            {/* ── Top bar ──────────────────────────────────────────────────── */}
            <div style={{
                position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10,
                display: 'flex', alignItems: 'center', gap: 8, padding: '0 14px', height: 48,
                background: 'rgba(5,3,9,0.88)', borderBottom: `3px solid ${ACCENT}`,
                backdropFilter: 'blur(8px)',
            }}>
                {onBack && <button onClick={onBack} style={btn}>← BACK</button>}
                <div style={{ fontFamily: DISP, fontSize: 22, color: FG, letterSpacing: '0.06em', flexShrink: 0 }}>
                    EMBEDDING SPACE
                </div>
                <div style={{ fontFamily: MONO, fontSize: 9, color: FG4, flexShrink: 0 }}>
                    {stats.total > 0 ? `${stats.total.toLocaleString()} tracks` : ''}
                </div>
                <input value={search} onChange={e => setSearch(e.target.value)}
                    placeholder='search artist or title…'
                    style={{
                        flex: 1, maxWidth: 280, background: 'transparent', border: 'none',
                        borderBottom: `1px solid ${BORDER2}`, color: FG, fontSize: 12,
                        padding: '3px 0', outline: 'none', fontFamily: MONO, letterSpacing: '0.04em',
                    }}
                />
                {search && <button onClick={() => setSearch('')} style={{ background: 'none', border: 'none', color: FG4, fontSize: 11, cursor: 'pointer', fontFamily: MONO }}>✕</button>}

                <div style={{ display: 'flex', gap: 3, marginLeft: 4, flexShrink: 0 }}>
                    {ZOOM_LAYERS.map((l, i) => (
                        <button key={l.label} onClick={() => goToLayer(i)} style={{
                            ...btn,
                            background: i === zoomLayer ? `${ACCENT}28` : 'none',
                            borderColor: i === zoomLayer ? ACCENT : BORDER2,
                            color: i === zoomLayer ? ACCENT : FG4,
                        }}>{l.label}</button>
                    ))}
                </div>

                {hasPrev && <button onClick={zoomOut} style={{ ...btn, borderColor: TEAL, color: TEAL, flexShrink: 0 }}>← ZOOM OUT</button>}
                <button
                    onClick={() => fetch(`${BASE_URL}/catalog/map/refresh`, { method: 'POST' }).then(() => window.location.reload())}
                    style={{ ...btn, marginLeft: 'auto', flexShrink: 0 }}
                    title="Recompute UMAP projection"
                >REFRESH MAP</button>
            </div>

            {lassoActive && (
                <div style={{
                    position: 'absolute', bottom: 52, left: '50%', transform: 'translateX(-50%)',
                    fontFamily: MONO, fontSize: 9, color: TEAL, letterSpacing: '0.12em',
                    background: 'rgba(0,255,231,0.08)', border: `1px solid ${TEAL}55`,
                    padding: '4px 12px', pointerEvents: 'none', zIndex: 15,
                }}>RELEASE TO ZOOM INTO FRAME</div>
            )}

            {/* ── Loading overlay ───────────────────────────────────────────── */}
            {(loading || computing) && (
                <div style={{
                    position: 'absolute', inset: 0, zIndex: 20,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16,
                    background: 'rgba(5,3,9,0.93)',
                }}>
                    <div style={{ fontFamily: DISP, fontSize: 64, color: ACCENT, letterSpacing: '0.06em', lineHeight: 1 }}>
                        {computing ? 'PROJECTING' : 'LOADING'}
                    </div>
                    <div style={{ fontFamily: MONO, fontSize: 10, color: FG4, letterSpacing: '0.12em', textTransform: 'uppercase', maxWidth: 360, textAlign: 'center', lineHeight: 1.9 }}>
                        {computing ? 'UMAP computing the 2D projection — cached after first run.' : 'Fetching projection from server…'}
                    </div>
                    <div style={{ width: 24, height: 24, border: '2px solid white', borderTopColor: ACCENT, borderRadius: '50%', animation: 'gspin 0.7s linear infinite' }} />
                    <style>{`@keyframes gspin{to{transform:rotate(360deg)}}`}</style>
                </div>
            )}

            {error && (
                <div style={{ position: 'absolute', inset: 0, zIndex: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 10 }}>
                    <div style={{ fontFamily: DISP, fontSize: 32, color: ACCENT }}>ERROR</div>
                    <div style={{ fontFamily: MONO, fontSize: 11, color: FG }}>{error}</div>
                    <div style={{ fontFamily: MONO, fontSize: 10, color: FG4 }}>Backend not reachable — check /catalog/map</div>
                </div>
            )}

            {/* ── Hover tooltip — ephemeral, shows preview state ────────────── */}
            {hovered && !selected && !loading && (
                <div style={{
                    position: 'fixed',
                    left: Math.min(window.innerWidth - 234, mousePos.x + 18),
                    top: mousePos.y - 100 < 56 ? mousePos.y + 14 : mousePos.y - 96,
                    width: 226,
                    background: 'rgba(5,3,9,0.96)',
                    border: `1px solid ${hovCol}55`,
                    borderLeft: `3px solid ${hovCol}`,
                    padding: '10px 12px',
                    backdropFilter: 'blur(12px)',
                    pointerEvents: 'none',
                    zIndex: 28,
                }}>
                    <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 600, color: FG, marginBottom: 2 }}>{hovered.artist}</div>
                    <div style={{ fontFamily: MONO, fontSize: 10, color: FG4, marginBottom: 7 }}>{hovered.title}</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
                        {hovered.genres.slice(0, 3).map(g => (
                            <span key={g} style={{ fontFamily: MONO, fontSize: 8, letterSpacing: '0.10em', textTransform: 'uppercase', color: genreHue(g), background: genreHue(g) + '18', border: `1px solid ${genreHue(g)}35`, padding: '2px 6px' }}>{g}</span>
                        ))}
                    </div>
                    {/* Preview progress bar */}
                    {playingId === hovered.id ? (
                        <div>
                            <div style={{ height: 2, background: 'rgba(255,255,255,0.10)', marginBottom: 5 }}>
                                <div style={{ height: '100%', width: `${playProg * 100}%`, background: hovCol, transition: 'width 0.4s linear' }} />
                            </div>
                            <div style={{ fontFamily: MONO, fontSize: 8, color: hovCol, letterSpacing: '0.08em' }}>
                                ♪ PREVIEWING · CLICK TO PLAY IN FULL
                            </div>
                        </div>
                    ) : (
                        <div style={{ fontFamily: MONO, fontSize: 8, color: FG4, letterSpacing: '0.07em' }}>
                            {previewCache.has(hovered.id)
                                ? previewCache.get(hovered.id) ? '▸ loading preview…' : 'no preview available'
                                : '▸ fetching preview…'
                            }
                        </div>
                    )}
                    <div style={{ fontFamily: MONO, fontSize: 8, color: 'rgba(255,255,255,0.2)', marginTop: 6, letterSpacing: '0.06em' }}>
                        CLICK TO PLAY · SHIFT+DRAG TO FRAME
                    </div>
                </div>
            )}

            {/* ── Selected / now-playing panel ──────────────────────────────── */}
            {selected && !loading && (
                <div style={{
                    position: 'fixed',
                    left: selectedPos
                        ? Math.min(window.innerWidth - 264, selectedPos.x + 18)
                        : 14,
                    top: selectedPos
                        ? (selectedPos.y - 170 < 56
                            ? selectedPos.y + 14
                            : selectedPos.y - 160)
                        : window.innerHeight - 220,
                    width: 250,
                    zIndex: 30,
                    background: 'rgba(5,3,9,0.97)',
                    border: `1px solid ${selCol}66`,
                    borderLeft: `3px solid ${selCol}`,
                    padding: '12px 14px',
                    backdropFilter: 'blur(16px)',
                    boxShadow: `0 0 32px ${selCol}1a`,
                }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 6 }}>
                        <div>
                            <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: FG, marginBottom: 2 }}>{selected.artist}</div>
                            <div style={{ fontFamily: MONO, fontSize: 10, color: FG4 }}>{selected.title}</div>
                        </div>
                        <button onClick={() => {
                            setSelected(null)
                            setSelectedPos(null)
                        }} style={{ background: 'none', border: 'none', color: FG4, fontSize: 15, cursor: 'pointer', padding: '0 0 0 10px', flexShrink: 0, lineHeight: 1 }}>✕</button>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 12 }}>
                        {selected.genres.slice(0, 4).map(g => (
                            <span key={g} style={{ fontFamily: MONO, fontSize: 8, letterSpacing: '0.10em', textTransform: 'uppercase', color: genreHue(g), background: genreHue(g) + '18', border: `1px solid ${genreHue(g)}40`, padding: '2px 7px' }}>{g}</span>
                        ))}
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                        {onTrackSelect && (
                            <button
                                onClick={() => onTrackSelect({ id: selected.id, title: selected.title, artist: selected.artist, genres: selected.genres })}
                                style={{ flex: 1, padding: '7px 0', background: 'rgba(255,255,255,0.05)', border: `1px solid ${BORDER2}`, color: FG4, fontFamily: MONO, fontSize: 9, letterSpacing: '0.10em', textTransform: 'uppercase', cursor: 'pointer' }}
                            >WIKI →</button>
                        )}
                        {onPlayTrack && (
                            <button
                                onClick={() => onPlayTrack({ id: selected.id, title: selected.title, artist: selected.artist, genres: selected.genres })}
                                style={{ flex: 2, padding: '7px 0', background: `${selCol}20`, border: `1px solid ${selCol}88`, color: selCol, fontFamily: MONO, fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', cursor: 'pointer' }}
                            >▶ PLAY</button>
                        )}
                    </div>
                </div>
            )}

            {/* ── Legend ───────────────────────────────────────────────────── */}
            <div style={{
                position: 'absolute', bottom: 32, right: 14, zIndex: 10,
                display: 'flex', flexDirection: 'column', gap: 5,
                background: 'rgba(5,3,9,0.78)', border: `1px solid ${BORDER2}`,
                padding: '10px 13px', backdropFilter: 'blur(8px)',
            }}>
                <div style={{ fontFamily: MONO, fontSize: 8, color: FG4, letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 3 }}>Legend</div>
                {([
                    [TEAL, 'your taste (μ)'],
                    [VIOLET, 'play history'],
                    [ACCENT, 'search match'],
                    ['#fff', 'selected / playing'],
                ] as [string, string][]).map(([col, label]) => (
                    <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 8, height: 8, background: col, boxShadow: `0 0 4px ${col}`, flexShrink: 0 }} />
                        <span style={{ fontFamily: MONO, fontSize: 9, color: FG4, letterSpacing: '0.04em' }}>{label}</span>
                    </div>
                ))}
                <div style={{ marginTop: 5, borderTop: `1px solid ${BORDER2}`, paddingTop: 6, fontFamily: MONO, fontSize: 8, color: FG4, lineHeight: 1.9 }}>
                    <div>HOVER        30s preview</div>
                    <div>CLICK        play + select</div>
                    <div>SCROLL       zoom to cursor</div>
                    <div>ARROWS       pan</div>
                    <div>CTRL+↑↓      zoom in/out</div>
                    <div>CTRL+R       reset view</div>
                    <div>SHIFT+DRAG   zoom to frame</div>
                    <div>ESC          deselect</div>
                </div>
            </div>
        </div>
    )
}

const btn: React.CSSProperties = {
    background: 'none', border: `1px solid rgba(255,255,255,0.08)`,
    color: 'rgba(255,255,255,0.45)', fontSize: 9, padding: '4px 9px',
    cursor: 'pointer', fontFamily: '"Fragment Mono","DM Mono",monospace',
    letterSpacing: '0.08em', textTransform: 'uppercase',
}