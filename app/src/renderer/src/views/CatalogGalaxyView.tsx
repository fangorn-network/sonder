/**
 * CatalogGalaxyView.tsx  (v7 — the Night Market)
 *
 * A rewrite around three goals from the design dialogue:
 *
 *  1. THREE COMPOSITED LAYERS, each repainting at its own rate:
 *       bg  — genre atmosphere (district glow + taste light).   Repaints only
 *             when the zoom "band" changes or the camera drifts far.
 *       mid — the track terrain (TEXT, not dots).               Repaints when
 *             the camera moves, ~throttled.  Viewport-culled + capped.
 *       fg  — the user's light, hover, audio rings.             Every frame (cheap).
 *
 *  2. NO DOTS.  A track is a short run of letters placed at its UMAP coordinate.
 *     Up close they are artist names and titles; far back they are tiny genre
 *     glyphs that pack into a textural "word terrain" — paragraphs of sound you
 *     read by zooming, the way you'd read a dense page held at arm's length.
 *
 *  3. MOMENTUM NAVIGATION.  Drag throws the camera; it glides and eases to rest.
 *     The wheel sets a zoom *target* the camera smoothly descends toward, anchored
 *     under the cursor, with no cap — you can fall all the way to a single track.
 *
 * One RAF loop owns the camera and conditionally repaints each layer, so the
 * layers never fight over a frame.
 */

import { useRef, useEffect, useState, useMemo, useCallback } from 'react'

// ── Palette — warm dark earth, candlelight, no neon ───────────────────────────

const BG       = '#0c0906'
const FG       = '#f0e8d4'
const FG3      = 'rgba(240,232,212,0.55)'
const FG4      = 'rgba(240,232,212,0.34)'
const ACCENT   = '#c93b3b'
const CAMPFIRE = '#f59e0b'
const BORDER2  = 'rgba(255,255,255,0.09)'
const MONO     = '"Fragment Mono","DM Mono",monospace'
const SANS     = '"Geist","Inter",sans-serif'

const WORLD = 500   // world half-extent in px at zoom = 1

const BASE_URL    = (import.meta as any).env?.VITE_CHROMA_URL ?? 'http://localhost:8080'
const ITUNES_CORS = 'https://itunes.apple.com'

// ── Camera ────────────────────────────────────────────────────────────────────

const ZOOM_MIN = 0.18
const ZOOM_MAX = 220          // far enough that a single track fills the frame
const ZOOM_LERP = 0.18        // how quickly current zoom chases the target
const PAN_FRICTION = 0.90     // inertia decay per frame
const GLIDE_MIN = 0.04        // below this, inertia snaps to rest

// ── The walker ──────────────────────────────────────────────────────────────
const AVATAR_SPEED = 0.55      // world-units (px-space) per second at zoom 1
const WALK_ARRIVE = 0.004      // close enough to the click-to-walk target
const DEADZONE_FRAC = 0.22     // half-extent of the camera dead-zone (× viewport)
const FOLLOW_EASE = 0.12       // how fast the camera re-centres on the walker
const BREATH_MS = 90_000       // a breath-trail point's lifetime
const BREATH_SAMPLE_MS = 90    // how often we drop a breath point
const BREATH_MAX = 400         // hard cap on breath points

// Zoom bands decide what the terrain shows.
const Z_GLYPH  = 2.4          // below: districts only.  above: per-track glyphs
const Z_ARTIST = 6.0          // above: artist names
const Z_TITLE  = 15.0         // above: track titles

const MID_CULL_CAP = 900      // hard cap on text items painted per frame
const LABEL_SEP    = 64       // min px between artist/title labels

// ── Preview audio constants ───────────────────────────────────────────────────

const HOVER_DEBOUNCE_MS = 200
const PREVIEW_VOLUME = 0.7
const RELEASE_MS = 260              // fade-out when the cursor leaves a track

// Hover pick radius (px) for the cursor tooltip/halo + click-to-open. Audio is
// driven by the walker's world proximity, not the cursor.
const HOVER_PICK_PX = 20

const RING_PERIOD_MS = 2600
const RING_MAX_R = 26
// Hold the title back briefly after audio begins — hear first, know second.
const NAME_REVEAL_MS = 1100

// ── Genre ink — warm, lower-saturation lights against the dark earth ──────────

const GENRE_INK: Record<string, string> = {
    electronic: '#6fb3c9', house: '#5fa8c0', techno: '#4f97b0',
    ambient: '#8fb0c4', drone: '#7a9db5', experimental: '#9a8fc4',
    'hip-hop': '#d98a6a', rap: '#cf7a5a', trap: '#e09a72',
    pop: '#e0a0b8', 'indie pop': '#e0b0c8',
    rock: '#d98a5a', 'indie rock': '#e0a070', metal: '#b06a4a',
    jazz: '#d8c070', soul: '#d8b060', blues: '#c0a050', funk: '#e0b050',
    classical: '#c0b8d8', orchestral: '#b0a8c8',
    'r&b': '#d8a0a0', 'neo-soul': '#e0b0a0',
    folk: '#a0b878', country: '#b8c078', acoustic: '#a8b888',
    reggae: '#78c098', ska: '#68b888',
    latin: '#e0a070', salsa: '#e09060',
}
function genreInk(g: string | null | undefined): string {
    if (!g) return '#9a8f7e'
    const k = g.toLowerCase()
    for (const [p, v] of Object.entries(GENRE_INK)) if (k.includes(p) || p.includes(k)) return v
    // Deterministic warm fallback: hues biased toward amber/sage/rose, modest sat.
    let h = 0; for (let i = 0; i < k.length; i++) h = (h * 31 + k.charCodeAt(i)) >>> 0
    const hue = 20 + (h % 320)          // skip cold cyan/blue band loosely
    return `hsl(${hue},42%,64%)`
}

// Short text run that stands in for a track at the "glyph terrain" zoom band.
function glyphFor(t: CatalogTrack): string {
    const g = t.genres[0]
    if (g) return g.slice(0, 3).toLowerCase()
    const a = (t.artist || '').replace(/[^a-zA-Z]/g, '')
    return (a.slice(0, 2) || '~~').toLowerCase()
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface CatalogTrack { id: string; title: string; artist: string; genres: string[]; moods: string[]; px: number; py: number }
interface GenreCentroid { genre: string; px: number; py: number; count: number }
export interface KernelState { mu: Float32Array; velocity: Float32Array; sigma: number }
export interface GalaxyTrackRef { id: string; title: string; artist: string; genres: string[] }
export interface CatalogGalaxyProps {
    kernelState?: KernelState
    playHistory?: GalaxyTrackRef[]
    onTrackSelect?: (t: GalaxyTrackRef) => void
    onPlayTrack?: (t: GalaxyTrackRef) => void
    onBack?: () => void
}

// ── Spatial grid — viewport culling ───────────────────────────────────────────

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
    // All tracks whose cells intersect the world-rect [x0,x1]×[y0,y1].
    queryRect(x0: number, y0: number, x1: number, y1: number): CatalogTrack[] {
        const out: CatalogTrack[] = []
        const cx0 = this.cl(Math.floor((x0 + 1) / GS)), cx1 = this.cl(Math.floor((x1 + 1) / GS))
        const cy0 = this.cl(Math.floor((y0 + 1) / GS)), cy1 = this.cl(Math.floor((y1 + 1) / GS))
        for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
            const c = this.cells.get(this.key(cx, cy)); if (c) out.push(...c)
        }
        return out
    }
}

// Greedy label separation so artist/title text doesn't overlap.
class LabelGrid {
    private slots = new Set<number>()
    private sep: number
    constructor(sep: number) { this.sep = sep }
    reset() { this.slots.clear() }
    try(sx: number, sy: number): boolean {
        const cx = Math.round(sx / this.sep), cy = Math.round(sy / this.sep)
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++)
            if (this.slots.has((cy + dy) * 100000 + (cx + dx))) return false
        this.slots.add(cy * 100000 + cx)
        return true
    }
}

// ── iTunes preview fetcher (cached) ───────────────────────────────────────────

const previewCache = new Map<string, string | null>()

async function fetchPreviewUrl(track: CatalogTrack): Promise<string | null> {
    if (previewCache.has(track.id)) return previewCache.get(track.id)!
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
        previewCache.set(track.id, url)
        return url
    } catch {
        previewCache.set(track.id, null)
        return null
    }
}

// ── Audio engine — one context, lock + mute, lazy on first gesture ────────────

class PreviewEngine {
    private ctx: AudioContext | null = null
    private gain: GainNode | null = null
    private source: MediaElementAudioSourceNode | null = null
    private el: HTMLAudioElement | null = null
    private fadeTimer: ReturnType<typeof setTimeout> | null = null
    playingId: string | null = null
    lockedId: string | null = null
    muted = false
    progress = 0

    private getCtx(): AudioContext {
        if (!this.ctx) {
            this.ctx = new AudioContext()
            this.gain = this.ctx.createGain()
            this.gain.gain.setValueAtTime(0, this.ctx.currentTime)
            this.gain.connect(this.ctx.destination)
        }
        return this.ctx
    }

    lock(trackId: string) {
        this.lockedId = trackId
        if (this.fadeTimer) { clearTimeout(this.fadeTimer); this.fadeTimer = null }
        this.setGain(1)
    }
    unlock() { this.lockedId = null }

    setMuted(muted: boolean) {
        this.muted = muted
        if (!this.gain || !this.ctx) return
        const target = muted ? 0 : PREVIEW_VOLUME
        this.gain.gain.cancelScheduledValues(this.ctx.currentTime)
        this.gain.gain.setValueAtTime(this.gain.gain.value, this.ctx.currentTime)
        this.gain.gain.linearRampToValueAtTime(target, this.ctx.currentTime + 0.15)
    }

    // Proximity volume: 0..1, scaled by master volume and mute. Smoothed.
    setGain(target01: number) {
        if (!this.gain || !this.ctx) return
        const v = (this.muted ? 0 : 1) * PREVIEW_VOLUME * Math.max(0, Math.min(1, target01))
        this.gain.gain.cancelScheduledValues(this.ctx.currentTime)
        this.gain.gain.setValueAtTime(this.gain.gain.value, this.ctx.currentTime)
        this.gain.gain.linearRampToValueAtTime(v, this.ctx.currentTime + 0.10)
    }

    async play(track: CatalogTrack, url: string) {
        if (this.playingId === track.id) return
        await this.stopNow()
        const ctx = this.getCtx()
        if (ctx.state === 'suspended') await ctx.resume()

        const el = new Audio()
        el.crossOrigin = 'anonymous'
        el.src = url
        el.addEventListener('timeupdate', () => { this.progress = el.currentTime / (el.duration || 30) })
        el.addEventListener('ended', () => { this.playingId = null; this.lockedId = null; this.progress = 0 })

        const src = ctx.createMediaElementSource(el)
        src.connect(this.gain!)
        this.el = el; this.source = src
        this.playingId = track.id; this.progress = 0

        // Start silent; proximity (setGain) raises the volume based on cursor distance.
        this.gain!.gain.cancelScheduledValues(ctx.currentTime)
        this.gain!.gain.setValueAtTime(0, ctx.currentTime)
        el.play().catch(() => { })
    }

    // Cursor left the track — fade out quickly and stop (unless locked).
    release() {
        if (this.lockedId && this.lockedId === this.playingId) return
        if (!this.ctx || !this.gain) { this.playingId = null; return }
        const el = this.el
        this.gain.gain.cancelScheduledValues(this.ctx.currentTime)
        this.gain.gain.setValueAtTime(this.gain.gain.value, this.ctx.currentTime)
        this.gain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + RELEASE_MS / 1000)
        // Pause the captured element after the fade; a fresh play() swaps this.el first.
        setTimeout(() => { if (el && el !== this.el) el.pause(); else if (el && !this.playingId) el.pause() }, RELEASE_MS + 40)
        this.playingId = null; this.progress = 0
    }

    async stopNow() {
        if (this.fadeTimer) { clearTimeout(this.fadeTimer); this.fadeTimer = null }
        if (this.gain && this.ctx) {
            this.gain.gain.cancelScheduledValues(this.ctx.currentTime)
            this.gain.gain.setValueAtTime(0, this.ctx.currentTime)
        }
        if (this.el) { this.el.pause(); this.el = null }
        if (this.source) { try { this.source.disconnect() } catch { } this.source = null }
        this.playingId = null; this.lockedId = null; this.progress = 0
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

type Camera = { ox: number; oy: number; zoom: number }

export function CatalogGalaxyView({ playHistory = [], onTrackSelect, onPlayTrack, onBack }: CatalogGalaxyProps) {
    const wrapperRef = useRef<HTMLDivElement>(null)
    const bgRef = useRef<HTMLCanvasElement>(null)
    const midRef = useRef<HTMLCanvasElement>(null)
    const fgRef = useRef<HTMLCanvasElement>(null)
    const rafRef = useRef(0)

    // Camera: current (rendered) + zoom target the current value chases.
    const camRef = useRef<Camera>({ ox: 0, oy: 0, zoom: 1.6 })
    const zTargetRef = useRef(1.6)
    const zAnchorRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 })
    const glideRef = useRef({ vx: 0, vy: 0 })

    // Drag state + a small velocity sampler for momentum throw.
    const dragRef = useRef<{ active: boolean; lastX: number; lastY: number; moved: boolean } | null>(null)
    const velSamplesRef = useRef<{ dx: number; dy: number; t: number }[]>([])
    const mouseRef = useRef<{ x: number; y: number } | null>(null)

    const gridRef = useRef(new SpatialGrid())
    const labelGrid = useRef(new LabelGrid(LABEL_SEP))
    const audioRef = useRef(new PreviewEngine())

    const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const pendingHoverRef = useRef<CatalogTrack | null>(null)
    const audioTargetRef = useRef<string | null>(null)   // track the avatar is "near enough" to hear

    // ── The walker — you are the lantern, not the camera ────────────────────────
    const avatarRef = useRef<{ wx: number; wy: number } | null>(null)   // world position
    const walkTargetRef = useRef<{ wx: number; wy: number } | null>(null) // click-to-walk goal
    const keysRef = useRef<Set<string>>(new Set())
    const lastTsRef = useRef(0)
    // Breath trail — an ephemeral wake (in-memory, ~BREATH_MS lifetime). The
    // permanent "songline" comes later; this is just "I just came from there".
    const breathRef = useRef<{ wx: number; wy: number; t: number }[]>([])
    const breathSampleRef = useRef(0)

    // Eased camera move (recenter / fly-to a world point). When set, the loop
    // tweens the camera so that (wx,wy) settles at screen centre at `zoom`.
    const panTargetRef = useRef<{ wx: number; wy: number; zoom: number } | null>(null)
    const reduceMotion = useRef(typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)

    const dataRef = useRef<{ tracks: CatalogTrack[]; genres: GenreCentroid[]; search: string; playIds: Set<string>; visitedGenres: Set<string> }>(
        { tracks: [], genres: [], search: '', playIds: new Set(), visitedGenres: new Set() }
    )

    // Per-layer repaint bookkeeping.
    const bgStateRef = useRef<{ band: number; ox: number; oy: number; zoom: number } | null>(null)
    const midPaintRef = useRef(0)
    const camSaveRef = useRef(0)   // throttle localStorage writes

    const [tracks, setTracks] = useState<CatalogTrack[]>([])
    const [genres, setGenres] = useState<GenreCentroid[]>([])
    const [loading, setLoading] = useState(true)
    const [computing, setComputing] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [search, setSearch] = useState('')
    const [cursor, setCursor] = useState('grab')
    const [hovered, setHovered] = useState<CatalogTrack | null>(null)
    const [selected, setSelected] = useState<CatalogTrack | null>(null)
    const [selectedPos, setSelectedPos] = useState<{ x: number; y: number } | null>(null)
    const [mousePos, setMousePos] = useState({ x: 0, y: 0 })
    const [stats, setStats] = useState({ total: 0 })
    const [band, setBand] = useState(0)           // 0 districts · 1 glyphs · 2 artists · 3 titles
    const [playingId, setPlayingId] = useState<string | null>(null)
    const [playProg, setPlayProg] = useState(0)
    const [nameRevealed, setNameRevealed] = useState(true)
    const [lockedTrack, setLockedTrack] = useState<CatalogTrack | null>(null)
    const [previewMuted, setPreviewMuted] = useState(false)

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
    // Genres the user has actually listened in — these districts go "matte" (visited);
    // the rest glow faintly (unvisited, undecidable-ahead).
    const visitedGenres = useMemo(() => {
        const s = new Set<string>()
        for (const t of playHistory) for (const g of (t.genres ?? [])) s.add(g.toLowerCase())
        return s
    }, [playHistory])
    useEffect(() => {
        dataRef.current = { tracks, genres, search, playIds, visitedGenres }
        gridRef.current.build(tracks)
        // Force both lower layers to repaint on the next frame even if the camera
        // is at rest — otherwise async-loaded genres/tracks never appear until
        // the user moves, which looks like a stuck render.
        bgStateRef.current = null
        midPaintRef.current = 0
        // Drop the walker in at the campfire (taste centroid) on first data.
        if (!avatarRef.current && tracks.length) {
            const hist = tracks.filter(t => playIds.has(t.id))
            avatarRef.current = hist.length
                ? { wx: hist.reduce((s, t) => s + t.px, 0) / hist.length, wy: hist.reduce((s, t) => s + t.py, 0) / hist.length }
                : { wx: 0, wy: 0 }
        }
    }, [tracks, genres, search, playIds, visitedGenres])

    useEffect(() => { const a = audioRef.current; return () => { a.stopNow() } }, [])

    // Resume-on-return: restore the last camera so you land where you left off.
    useEffect(() => {
        try {
            const raw = localStorage.getItem('sond3r:galaxy:cam')
            if (raw) {
                const c = JSON.parse(raw)
                if (typeof c.ox === 'number' && typeof c.oy === 'number' && typeof c.zoom === 'number') {
                    camRef.current = { ox: c.ox, oy: c.oy, zoom: c.zoom }
                    zTargetRef.current = c.zoom
                }
            }
        } catch { /* ignore */ }
    }, [])

    // ── Canvas sizing (all three layers) ────────────────────────────────────────
    useEffect(() => {
        const wr = wrapperRef.current; if (!wr) return
        const sync = () => {
            const dpr = window.devicePixelRatio || 1
            const { width: w, height: h } = wr.getBoundingClientRect()
            if (!w || !h) return
            for (const cv of [bgRef.current, midRef.current, fgRef.current]) {
                if (!cv) continue
                cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr)
            }
            bgStateRef.current = null
            midPaintRef.current = 0
        }
        const ro = new ResizeObserver(sync); ro.observe(wr); sync()
        return () => ro.disconnect()
    }, [])

    // ── Coordinate helpers (read live camera) ───────────────────────────────────
    const screenToWorld = useCallback((sx: number, sy: number, W: number, H: number) => {
        const c = camRef.current
        return { px: (sx - W / 2 - c.ox) / (WORLD * c.zoom), py: (sy - H / 2 - c.oy) / (WORLD * c.zoom) }
    }, [])

    // ── Wheel: set a smooth zoom target anchored under the cursor ───────────────
    useEffect(() => {
        const cv = fgRef.current; if (!cv) return
        const onWheel = (e: WheelEvent) => {
            e.preventDefault()
            const r = cv.getBoundingClientRect()
            panTargetRef.current = null      // user took the wheel — cancel any fly
            zAnchorRef.current = { x: e.clientX - r.left, y: e.clientY - r.top }
            const factor = e.deltaY > 0 ? 0.82 : 1.22
            zTargetRef.current = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, zTargetRef.current * factor))
        }
        cv.addEventListener('wheel', onWheel, { passive: false })
        return () => cv.removeEventListener('wheel', onWheel)
    }, [])

    // ── Navigation helpers (eased fly-to + home) ────────────────────────────────
    const flyToWorld = useCallback((wx: number, wy: number, zoom: number) => {
        panTargetRef.current = { wx, wy, zoom: Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, zoom)) }
        zTargetRef.current = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, zoom))
        glideRef.current = { vx: 0, vy: 0 }
    }, [])

    // The campfire — centroid of listened tracks, or the origin when cold.
    const homeWorld = useCallback(() => {
        const { tracks: tks, playIds: pids } = dataRef.current
        const hist = tks.filter(t => pids.has(t.id))
        if (!hist.length) return { x: 0, y: 0 }
        return {
            x: hist.reduce((s, t) => s + t.px, 0) / hist.length,
            y: hist.reduce((s, t) => s + t.py, 0) / hist.length,
        }
    }, [])

    const recenterHome = useCallback(() => { const h = homeWorld(); flyToWorld(h.x, h.y, 0.8) }, [homeWorld, flyToWorld])

    // "Take me somewhere good" — the escape hatch for when you don't want to wander.
    // Seeds discovery without predicting taste: a not-yet-played track, biased toward
    // somewhere other than where you already are, picked with real randomness.
    const takeMeSomewhere = useCallback(() => {
        const { tracks: tks, playIds: pids } = dataRef.current
        if (!tks.length) return
        const cam = camRef.current
        const cx = -cam.ox / (WORLD * cam.zoom), cy = -cam.oy / (WORLD * cam.zoom)
        const pool = tks.filter(t => !pids.has(t.id))
        const src = pool.length ? pool : tks
        let pick = src[Math.floor(Math.random() * src.length)]
        for (let i = 0; i < 10; i++) {
            const c = src[Math.floor(Math.random() * src.length)]
            const d = Math.hypot(c.px - cx, c.py - cy)
            if (d > 0.18 && d < 1.3) { pick = c; break }   // "somewhere else", not the void
        }
        flyToWorld(pick.px, pick.py, 16)
        setSelected(pick); setSelectedPos(null)
        fetchPreviewUrl(pick).then(url => {
            if (!url) return
            audioRef.current.play(pick, url).then(() => {
                audioRef.current.lock(pick.id); setLockedTrack(pick); setPlayingId(pick.id)
            })
        })
    }, [flyToWorld])

    // Centre the camera on the walker (eased).
    const centerOnAvatar = useCallback(() => {
        const a = avatarRef.current; if (!a) return
        panTargetRef.current = { wx: a.wx, wy: a.wy, zoom: zTargetRef.current }
    }, [])

    // ── Keyboard: WASD/arrows walk the lantern, +/- zoom, Space recentres ───────
    const MOVE_KEYS = new Set(['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'])
    useEffect(() => {
        const onDown = (e: KeyboardEvent) => {
            if ((e.target as HTMLElement)?.tagName === 'INPUT') return
            const k = e.key.toLowerCase()
            if (MOVE_KEYS.has(k)) { keysRef.current.add(k); walkTargetRef.current = null; panTargetRef.current = null; e.preventDefault(); return }
            switch (k) {
                case '+': case '=': panTargetRef.current = null; zTargetRef.current = Math.min(ZOOM_MAX, zTargetRef.current * 1.3); break
                case '-': case '_': panTargetRef.current = null; zTargetRef.current = Math.max(ZOOM_MIN, zTargetRef.current * 0.77); break
                case ' ': case 'home': case 'h': centerOnAvatar(); break
                case 'escape': setSelected(null); setSelectedPos(null); break
                default: return
            }
            if (k === '+' || k === '=' || k === '-' || k === '_') {
                const cv = fgRef.current
                if (cv) { const dpr = window.devicePixelRatio || 1; zAnchorRef.current = { x: cv.width / dpr / 2, y: cv.height / dpr / 2 } }
            }
            e.preventDefault()
        }
        const onUp = (e: KeyboardEvent) => { keysRef.current.delete(e.key.toLowerCase()) }
        window.addEventListener('keydown', onDown)
        window.addEventListener('keyup', onUp)
        return () => { window.removeEventListener('keydown', onDown); window.removeEventListener('keyup', onUp) }
    }, [centerOnAvatar]) // eslint-disable-line react-hooks/exhaustive-deps

    // ── Preview triggers ────────────────────────────────────────────────────────
    const triggerPreview = useCallback((track: CatalogTrack) => {
        if (audioRef.current.lockedId) return
        if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current)
        pendingHoverRef.current = track
        hoverTimerRef.current = setTimeout(async () => {
            const t = pendingHoverRef.current; if (!t) return
            const url = await fetchPreviewUrl(t); if (!url) return
            if (pendingHoverRef.current?.id !== t.id) return
            await audioRef.current.play(t, url)
            setPlayingId(t.id)
            // Hear first, know second — hold the name back briefly.
            setNameRevealed(false)
            setTimeout(() => { if (audioRef.current.playingId === t.id) setNameRevealed(true) }, NAME_REVEAL_MS)
        }, HOVER_DEBOUNCE_MS)
    }, [])

    const cancelPreview = useCallback(() => {
        if (hoverTimerRef.current) { clearTimeout(hoverTimerRef.current); hoverTimerRef.current = null }
        pendingHoverRef.current = null
        if (audioRef.current.lockedId) return
        audioRef.current.release()
        setPlayingId(null); setPlayProg(0); setNameRevealed(true)
    }, [])

    const stopLockedPreview = useCallback(() => {
        audioRef.current.unlock(); audioRef.current.stopNow()
        setLockedTrack(null); setPlayingId(null); setPlayProg(0)
    }, [])

    const toggleMute = useCallback(() => {
        const next = !previewMuted; setPreviewMuted(next); audioRef.current.setMuted(next)
    }, [previewMuted])

    // ── Pointer: momentum drag ───────────────────────────────────────────────────
    const onPointerDown = useCallback((e: React.PointerEvent) => {
        ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
        panTargetRef.current = null      // grabbing cancels any fly
        dragRef.current = { active: true, lastX: e.clientX, lastY: e.clientY, moved: false }
        velSamplesRef.current = []
        glideRef.current = { vx: 0, vy: 0 }
        setCursor('grabbing')
    }, [])

    const onPointerMove = useCallback((e: React.PointerEvent) => {
        const r = fgRef.current?.getBoundingClientRect(); if (!r) return
        const lx = e.clientX - r.left, ly = e.clientY - r.top
        mouseRef.current = { x: lx, y: ly }; setMousePos({ x: lx, y: ly })

        const drag = dragRef.current
        if (drag?.active) {
            const dx = e.clientX - drag.lastX, dy = e.clientY - drag.lastY
            if (Math.abs(dx) + Math.abs(dy) > 2) drag.moved = true
            camRef.current = { ...camRef.current, ox: camRef.current.ox + dx, oy: camRef.current.oy + dy }
            drag.lastX = e.clientX; drag.lastY = e.clientY
            const now = performance.now()
            velSamplesRef.current.push({ dx, dy, t: now })
            // keep only the last ~90ms of samples for the throw velocity
            velSamplesRef.current = velSamplesRef.current.filter(s => now - s.t < 90)
        }
    }, [])

    const onPointerUp = useCallback(() => {
        const drag = dragRef.current
        if (drag?.active) {
            // Throw: average recent per-sample delta becomes glide velocity.
            const s = velSamplesRef.current
            if (s.length) {
                let dx = 0, dy = 0
                for (const v of s) { dx += v.dx; dy += v.dy }
                glideRef.current = { vx: (dx / s.length) * 1.4, vy: (dy / s.length) * 1.4 }
            }
        }
        dragRef.current = null
        setCursor(mouseRef.current ? 'grab' : 'grab')
    }, [])

    const onPointerLeave = useCallback(() => {
        dragRef.current = null; mouseRef.current = null
        setHovered(null); setCursor('grab'); cancelPreview()
    }, [cancelPreview])

    const onDoubleClick = useCallback((e: React.MouseEvent) => {
        const r = fgRef.current?.getBoundingClientRect(); if (!r) return
        // Double-click empty space recenters home; on a track, dives toward it.
        if (!hovered) { recenterHome(); return }
        zAnchorRef.current = { x: e.clientX - r.left, y: e.clientY - r.top }
        panTargetRef.current = null
        zTargetRef.current = Math.min(ZOOM_MAX, zTargetRef.current * 2.4)
    }, [hovered, recenterHome])

    const onClick = useCallback((e: React.MouseEvent) => {
        if (dragRef.current?.moved) return    // a throw, not a tap
        if (hovered) {
            // Tap a track → open it (select + lock its preview).
            setSelected(hovered)
            if (mouseRef.current) setSelectedPos({ x: mouseRef.current.x, y: mouseRef.current.y })
            const audio = audioRef.current
            if (audio.playingId === hovered.id) {
                audio.lock(hovered.id); setLockedTrack(hovered)
            } else {
                fetchPreviewUrl(hovered).then(url => {
                    if (!url) return
                    audio.play(hovered, url).then(() => {
                        audio.lock(hovered.id); setLockedTrack(hovered); setPlayingId(hovered.id)
                    })
                })
            }
        } else {
            // Tap empty space → walk the lantern there.
            const r = fgRef.current?.getBoundingClientRect()
            if (r) {
                const W = r.width, H = r.height
                const { px, py } = screenToWorld(e.clientX - r.left, e.clientY - r.top, W, H)
                walkTargetRef.current = { wx: px, wy: py }
                panTargetRef.current = null
            }
            setSelected(null); setSelectedPos(null)
        }
    }, [hovered, screenToWorld])

    // ── The one RAF loop: advance camera, repaint layers conditionally ──────────
    useEffect(() => {
        const bg = bgRef.current, mid = midRef.current, fg = fgRef.current
        if (!bg || !mid || !fg) return
        const bgx = bg.getContext('2d')!, midx = mid.getContext('2d')!, fgx = fg.getContext('2d')!
        let running = true

        const zoomBand = (z: number) => z < Z_GLYPH ? 0 : z < Z_ARTIST ? 1 : z < Z_TITLE ? 2 : 3

        // Advance the camera. Returns true if anything changed this frame.
        const advance = (W: number, H: number) => {
            const cam = camRef.current
            let changed = false
            const flying = !!panTargetRef.current

            // Smooth zoom toward target. Anchor under the cursor for manual zoom;
            // during a programmatic fly, let the pan tween own the offset instead.
            if (Math.abs(zTargetRef.current - cam.zoom) > 1e-4) {
                const old = cam.zoom
                cam.zoom += (zTargetRef.current - cam.zoom) * ZOOM_LERP
                if (Math.abs(zTargetRef.current - cam.zoom) < 1e-4) cam.zoom = zTargetRef.current
                if (!flying) {
                    const a = zAnchorRef.current
                    const wx = (a.x - W / 2 - cam.ox) / (WORLD * old)
                    const wy = (a.y - H / 2 - cam.oy) / (WORLD * old)
                    cam.ox = (a.x - W / 2) - wx * WORLD * cam.zoom
                    cam.oy = (a.y - H / 2) - wy * WORLD * cam.zoom
                }
                changed = true
            }

            if (flying) {
                // Ease the camera so (wx,wy) sits at screen centre, recomputed each
                // frame against the live zoom so the point stays centred mid-flight.
                const pt = panTargetRef.current!
                const tox = -pt.wx * WORLD * cam.zoom, toy = -pt.wy * WORLD * cam.zoom
                cam.ox += (tox - cam.ox) * 0.14
                cam.oy += (toy - cam.oy) * 0.14
                if (Math.hypot(tox - cam.ox, toy - cam.oy) < 0.6 && Math.abs(zTargetRef.current - cam.zoom) < 1e-3) {
                    cam.ox = tox; cam.oy = toy; cam.zoom = zTargetRef.current
                    panTargetRef.current = null
                }
                changed = true
            } else if (!dragRef.current?.active) {
                // Inertial pan.
                const g = glideRef.current
                if (Math.abs(g.vx) > GLIDE_MIN || Math.abs(g.vy) > GLIDE_MIN) {
                    cam.ox += g.vx; cam.oy += g.vy
                    g.vx *= PAN_FRICTION; g.vy *= PAN_FRICTION
                    if (Math.abs(g.vx) < GLIDE_MIN) g.vx = 0
                    if (Math.abs(g.vy) < GLIDE_MIN) g.vy = 0
                    changed = true
                }
            } else changed = true
            return changed
        }

        // Move the walker (WASD or click-to-walk), trail its breath, and let the
        // dead-zone camera follow. Returns true if anything moved.
        const stepWalker = (W: number, H: number, dt: number) => {
            const a = avatarRef.current; if (!a) return false
            const cam = camRef.current
            const keys = keysRef.current
            let moved = false

            // Direction from held keys; else ease toward the click-to-walk target.
            let dx = 0, dy = 0
            if (keys.has('w') || keys.has('arrowup')) dy -= 1
            if (keys.has('s') || keys.has('arrowdown')) dy += 1
            if (keys.has('a') || keys.has('arrowleft')) dx -= 1
            if (keys.has('d') || keys.has('arrowright')) dx += 1
            const step = AVATAR_SPEED * dt
            if (dx || dy) {
                const l = Math.hypot(dx, dy)
                a.wx += (dx / l) * step; a.wy += (dy / l) * step
                walkTargetRef.current = null; moved = true
            } else if (walkTargetRef.current) {
                const t = walkTargetRef.current
                const ddx = t.wx - a.wx, ddy = t.wy - a.wy
                const dist = Math.hypot(ddx, ddy)
                if (dist < WALK_ARRIVE) walkTargetRef.current = null
                else { const s = Math.min(dist, step); a.wx += (ddx / dist) * s; a.wy += (ddy / dist) * s; moved = true }
            }

            // Breath trail — sample while moving, expire old points.
            const now = performance.now()
            if (moved && now - breathSampleRef.current > BREATH_SAMPLE_MS) {
                breathSampleRef.current = now
                breathRef.current.push({ wx: a.wx, wy: a.wy, t: now })
                if (breathRef.current.length > BREATH_MAX) breathRef.current.shift()
            }
            const cutoff = now - BREATH_MS
            while (breathRef.current.length && breathRef.current[0].t < cutoff) breathRef.current.shift()

            // Dead-zone follow: nudge the camera only when the walker leaves the box.
            if (!panTargetRef.current && !dragRef.current?.active) {
                const sx = W / 2 + cam.ox + a.wx * WORLD * cam.zoom
                const sy = H / 2 + cam.oy + a.wy * WORLD * cam.zoom
                const dzx = W * DEADZONE_FRAC, dzy = H * DEADZONE_FRAC
                let tox = cam.ox, toy = cam.oy
                if (sx < W / 2 - dzx) tox += (W / 2 - dzx) - sx
                else if (sx > W / 2 + dzx) tox += (W / 2 + dzx) - sx
                if (sy < H / 2 - dzy) toy += (H / 2 - dzy) - sy
                else if (sy > H / 2 + dzy) toy += (H / 2 + dzy) - sy
                if (tox !== cam.ox || toy !== cam.oy) {
                    cam.ox += (tox - cam.ox) * FOLLOW_EASE
                    cam.oy += (toy - cam.oy) * FOLLOW_EASE
                    moved = true
                }
            }
            return moved
        }

        // ── BG layer: atmosphere — district glow + taste light + dawn ────────────
        const drawBg = (W: number, H: number) => {
            const cam = camRef.current
            const { genres: gens, playIds: pids, tracks: tks } = dataRef.current
            const toSx = (px: number) => W / 2 + cam.ox + px * WORLD * cam.zoom
            const toSy = (py: number) => H / 2 + cam.oy + py * WORLD * cam.zoom
            const dpr = window.devicePixelRatio || 1

            bgx.setTransform(dpr, 0, 0, dpr, 0, 0)
            bgx.clearRect(0, 0, W, H)
            bgx.fillStyle = BG; bgx.fillRect(0, 0, W, H)

            // Soft central warmth so the dark never feels like void.
            const warm = bgx.createRadialGradient(W / 2 + cam.ox, H / 2 + cam.oy, 0, W / 2 + cam.ox, H / 2 + cam.oy, Math.max(W, H) * 0.55)
            warm.addColorStop(0, 'rgba(28,18,8,0.55)'); warm.addColorStop(1, 'rgba(0,0,0,0)')
            bgx.fillStyle = warm; bgx.fillRect(0, 0, W, H)

            // Genre districts — broad coloured haze. The "lit quarters" of the market.
            const districtFade = Math.min(1, Math.max(0, (Z_ARTIST - cam.zoom) / Z_ARTIST))
            if (districtFade > 0.01) {
                for (const { genre, px, py, count } of gens) {
                    const sx = toSx(px), sy = toSy(py)
                    const radius = Math.max(50, Math.min(260, Math.sqrt(count) * 11)) * Math.max(0.6, cam.zoom)
                    if (sx < -radius || sx > W + radius || sy < -radius || sy > H + radius) continue
                    const ink = genreInk(genre)
                    const halo = bgx.createRadialGradient(sx, sy, 0, sx, sy, radius)
                    halo.addColorStop(0, ink); halo.addColorStop(1, 'rgba(0,0,0,0)')
                    bgx.globalAlpha = districtFade * 0.09
                    bgx.fillStyle = halo
                    bgx.beginPath(); bgx.arc(sx, sy, radius, 0, Math.PI * 2); bgx.fill()
                }
                bgx.globalAlpha = 1
            }

            // Taste light — where you've been. A warm hearth, not a pin.
            const hist = tks.filter(t => pids.has(t.id))
            if (hist.length) {
                const kpx = hist.reduce((s, t) => s + t.px, 0) / hist.length
                const kpy = hist.reduce((s, t) => s + t.py, 0) / hist.length
                const kx = toSx(kpx), ky = toSy(kpy)
                const r = 120 * Math.max(0.7, Math.min(2.4, cam.zoom))
                const hearth = bgx.createRadialGradient(kx, ky, 0, kx, ky, r)
                hearth.addColorStop(0, CAMPFIRE); hearth.addColorStop(1, 'rgba(0,0,0,0)')
                bgx.globalAlpha = 0.10
                bgx.fillStyle = hearth
                bgx.beginPath(); bgx.arc(kx, ky, r, 0, Math.PI * 2); bgx.fill()
                bgx.globalAlpha = 1

                // Dawn — faint brightening toward where taste has been drifting.
                if (hist.length >= 2) {
                    const a = hist[0], b = hist[hist.length - 1]
                    let dx = b.px - a.px, dy = b.py - a.py
                    const len = Math.hypot(dx, dy) || 1
                    dx /= len; dy /= len
                    const dawn = bgx.createLinearGradient(kx, ky, kx + dx * W * 0.6, ky + dy * H * 0.6)
                    dawn.addColorStop(0, 'rgba(245,158,11,0.05)'); dawn.addColorStop(1, 'rgba(0,0,0,0)')
                    bgx.fillStyle = dawn; bgx.fillRect(0, 0, W, H)
                }
            }
        }

        // ── MID layer: the text terrain — no dots, only letters ──────────────────
        const drawMid = (W: number, H: number) => {
            const cam = camRef.current
            const { genres: gens, search: sq, playIds: pids } = dataRef.current
            const dpr = window.devicePixelRatio || 1
            const toSx = (px: number) => W / 2 + cam.ox + px * WORLD * cam.zoom
            const toSy = (py: number) => H / 2 + cam.oy + py * WORLD * cam.zoom

            midx.setTransform(dpr, 0, 0, dpr, 0, 0)
            midx.clearRect(0, 0, W, H)
            midx.textAlign = 'center'; midx.textBaseline = 'middle'

            const b = zoomBand(cam.zoom)
            const hasSearch = sq.trim().length > 0
            const searchLow = sq.toLowerCase()
            const playId = audioRef.current.playingId
            void gens

            if (b === 0) return   // districts only (drawn on fg layer) — no per-track terrain yet

            // Cull to viewport (+ margin), then paint text per track.
            const margin = 0.15
            const tl = screenToWorld(-W * margin, -H * margin, W, H)
            const br = screenToWorld(W * (1 + margin), H * (1 + margin), W, H)
            let visible = gridRef.current.queryRect(
                Math.min(tl.px, br.px), Math.min(tl.py, br.py),
                Math.max(tl.px, br.px), Math.max(tl.py, br.py),
            )
            // Budget: subsample if we're over the per-frame cap.
            let stride = 1
            if (visible.length > MID_CULL_CAP) stride = Math.ceil(visible.length / MID_CULL_CAP)

            const separated = b >= 2 ? labelGrid.current : null
            separated?.reset()

            if (b === 1) {
                // Glyph terrain: tiny genre runs packing into "paragraphs of sound".
                midx.font = `500 10px ${MONO}`
                for (let i = 0; i < visible.length; i += stride) {
                    const t = visible[i]
                    const sx = toSx(t.px), sy = toSy(t.py)
                    if (sx < -20 || sx > W + 20 || sy < -12 || sy > H + 12) continue
                    const isPlay = playId === t.id
                    const isHist = pids.has(t.id)
                    const match = hasSearch && (t.artist.toLowerCase().includes(searchLow) || t.title.toLowerCase().includes(searchLow))
                    midx.globalAlpha = hasSearch && !match ? 0.10 : isPlay ? 1 : isHist ? 0.85 : 0.62
                    midx.fillStyle = isPlay ? FG : genreInk(t.genres[0])
                    midx.fillText(glyphFor(t), sx, sy)
                }
            } else {
                // Artist (b===2) or title (b===3): readable, separation-culled text.
                midx.font = b === 2 ? `600 12px ${SANS}` : `500 11px ${SANS}`
                for (let i = 0; i < visible.length; i += stride) {
                    const t = visible[i]
                    const sx = toSx(t.px), sy = toSy(t.py)
                    if (sx < 0 || sx > W || sy < 0 || sy > H) continue
                    if (separated && !separated.try(sx, sy)) continue
                    const isPlay = playId === t.id
                    const isHist = pids.has(t.id)
                    const match = hasSearch && (t.artist.toLowerCase().includes(searchLow) || t.title.toLowerCase().includes(searchLow))
                    midx.globalAlpha = hasSearch && !match ? 0.12 : isPlay ? 1 : isHist ? 0.92 : 0.72
                    midx.fillStyle = isPlay ? FG : genreInk(t.genres[0])
                    const label = b === 2
                        ? (t.artist.length > 22 ? t.artist.slice(0, 20) + '…' : t.artist)
                        : (t.title.length > 26 ? t.title.slice(0, 24) + '…' : t.title)
                    midx.fillText(label, sx, sy)
                    if (b === 3) {
                        midx.globalAlpha = (hasSearch && !match ? 0.10 : 0.5)
                        midx.font = `400 8px ${MONO}`; midx.fillStyle = FG4
                        midx.fillText(t.artist, sx, sy + 12)
                        midx.font = `500 11px ${SANS}`
                    }
                }
            }
            midx.globalAlpha = 1
        }

        // ── FG layer: the user's light, hover, audio rings ───────────────────────
        const drawFg = (W: number, H: number, ts: number) => {
            const cam = camRef.current
            const { tracks: tks, playIds: pids } = dataRef.current
            const dpr = window.devicePixelRatio || 1
            const toSx = (px: number) => W / 2 + cam.ox + px * WORLD * cam.zoom
            const toSy = (py: number) => H / 2 + cam.oy + py * WORLD * cam.zoom

            fgx.setTransform(dpr, 0, 0, dpr, 0, 0)
            fgx.clearRect(0, 0, W, H)

            // ── District labels — the towers on the horizon ──────────────────
            // Visited genres rest (matte); unvisited glow and breathe faintly —
            // the pull toward where you haven't been. Lives on fg so it can
            // animate at 60fps and always renders (never a "blank" load).
            {
                const { genres: gens, visitedGenres: vg } = dataRef.current
                const b = cam.zoom < Z_GLYPH ? 0 : cam.zoom < Z_ARTIST ? 1 : cam.zoom < Z_TITLE ? 2 : 3
                const baseAlpha = b === 0 ? 0.9 : b === 1 ? 0.5 : 0.22
                fgx.textAlign = 'center'; fgx.textBaseline = 'middle'
                fgx.font = `600 ${b === 0 ? 17 : 13}px ${SANS}`
                for (const { genre, px, py, count } of gens) {
                    const sx = toSx(px), sy = toSy(py)
                    if (sx < -90 || sx > W + 90 || sy < -30 || sy > H + 30) continue
                    const visited = vg.has(genre.toLowerCase())
                    const weight = Math.min(1, 0.5 + count / 400)
                    let a = baseAlpha * weight
                    if (visited) {
                        a *= 0.55                                  // visited rests
                    } else if (!reduceMotion.current) {
                        // gentle breath: ~7s period, ±12%
                        a *= 0.9 + 0.12 * Math.sin(ts * 0.0009 + px * 7 + py * 13)
                    } else {
                        a *= 1.05                                  // static brighter when reduced-motion
                    }
                    fgx.globalAlpha = Math.max(0, Math.min(1, a))
                    fgx.fillStyle = genreInk(genre)
                    fgx.fillText(genre.toLowerCase(), sx, sy)
                }
                fgx.globalAlpha = 1
            }

            // Nearest track to cursor — hover pick only (tooltip/halo + click-to-open).
            const mouse = mouseRef.current
            let nearest: CatalogTrack | null = null
            let nd = Infinity
            if (mouse && !dragRef.current?.active && tks.length) {
                const m = screenToWorld(mouse.x, mouse.y, W, H)
                const rad = (HOVER_PICK_PX * 1.5) / (WORLD * cam.zoom)
                const near = gridRef.current.queryRect(m.px - rad, m.py - rad, m.px + rad, m.py + rad)
                for (const t of near) {
                    const d = Math.hypot(toSx(t.px) - mouse.x, toSy(t.py) - mouse.y)
                    if (d < nd) { nd = d; nearest = t }
                }
            }
            const hov: CatalogTrack | null = nearest && nd < HOVER_PICK_PX ? nearest : null

            // ── Proximity audio — driven by the WALKER, not the cursor ────────
            // You hear what you walk near; the cursor only inspects. Volume rises
            // as the lantern closes on a track; leave its radius → fade + stop.
            const audio = audioRef.current
            const av = avatarRef.current
            if (!audio.lockedId && av && tks.length) {
                const AUD_W = 0.05   // audible world radius around the lantern
                const near2 = gridRef.current.queryRect(av.wx - AUD_W, av.wy - AUD_W, av.wx + AUD_W, av.wy + AUD_W)
                let an: CatalogTrack | null = null, abd = Infinity
                for (const t of near2) { const dd = Math.hypot(t.px - av.wx, t.py - av.wy); if (dd < abd) { abd = dd; an = t } }
                if (an && abd < AUD_W) {
                    if (audioTargetRef.current !== an.id) { audioTargetRef.current = an.id; triggerPreview(an) }
                    if (audio.playingId === an.id) { const g = 1 - abd / AUD_W; audio.setGain(g * g) }
                } else if (audioTargetRef.current !== null) { audioTargetRef.current = null; cancelPreview() }
            }

            // Campfire — the taste hearth's bright core (glow lives on the bg layer).
            const hist = tks.filter(t => pids.has(t.id))
            if (hist.length) {
                const kpx = hist.reduce((s, t) => s + t.px, 0) / hist.length
                const kpy = hist.reduce((s, t) => s + t.py, 0) / hist.length
                const kx = toSx(kpx), ky = toSy(kpy)
                const flick = Math.sin(ts * 0.007) * 0.15 + Math.sin(ts * 0.013) * 0.08
                fgx.shadowColor = CAMPFIRE; fgx.shadowBlur = 14
                fgx.fillStyle = '#fde68a'; fgx.globalAlpha = 0.9
                fgx.beginPath(); fgx.arc(kx, ky, 3.2 + flick, 0, Math.PI * 2); fgx.fill()
                fgx.shadowBlur = 0; fgx.globalAlpha = 1

                // Edge compass — when home is off-screen, a warm arrow points the way.
                const off = kx < 8 || kx > W - 8 || ky < 48 || ky > H - 8
                if (off) {
                    const cx = W / 2, cy = H / 2
                    const ang = Math.atan2(ky - cy, kx - cx)
                    const mx = 26, myTop = 56, myBot = 26
                    const ex = Math.max(mx, Math.min(W - mx, cx + Math.cos(ang) * W))
                    const ey = Math.max(myTop, Math.min(H - myBot, cy + Math.sin(ang) * H))
                    fgx.save()
                    fgx.translate(ex, ey); fgx.rotate(ang)
                    fgx.globalAlpha = 0.7; fgx.fillStyle = CAMPFIRE
                    fgx.beginPath(); fgx.moveTo(7, 0); fgx.lineTo(-5, -5); fgx.lineTo(-5, 5); fgx.closePath(); fgx.fill()
                    fgx.restore()
                    fgx.globalAlpha = 1
                }
            }

            // ── Breath trail — the fading wake behind the walker ──────────────
            const breath = breathRef.current
            if (breath.length > 1) {
                fgx.lineWidth = 2; fgx.lineCap = 'round'; fgx.lineJoin = 'round'; fgx.strokeStyle = CAMPFIRE
                for (let i = 1; i < breath.length; i++) {
                    const p0 = breath[i - 1], p1 = breath[i]
                    const a = Math.max(0, 1 - (ts - p1.t) / BREATH_MS) * 0.5
                    if (a <= 0.01) continue
                    fgx.globalAlpha = a
                    fgx.beginPath(); fgx.moveTo(toSx(p0.wx), toSy(p0.wy)); fgx.lineTo(toSx(p1.wx), toSy(p1.wy)); fgx.stroke()
                }
                fgx.globalAlpha = 1
            }

            // ── The walker (lantern) — you are this light ─────────────────────
            const av2 = avatarRef.current
            if (av2) {
                const ax = toSx(av2.wx), ay = toSy(av2.wy)
                const halo = fgx.createRadialGradient(ax, ay, 0, ax, ay, 26)
                halo.addColorStop(0, 'rgba(253,230,138,0.30)'); halo.addColorStop(1, 'rgba(0,0,0,0)')
                fgx.fillStyle = halo; fgx.beginPath(); fgx.arc(ax, ay, 26, 0, Math.PI * 2); fgx.fill()
                fgx.shadowColor = CAMPFIRE; fgx.shadowBlur = 12
                fgx.fillStyle = '#fff7e0'; fgx.beginPath(); fgx.arc(ax, ay, 4.5, 0, Math.PI * 2); fgx.fill()
                fgx.shadowBlur = 0
                // Off-screen arrow back to the walker — you can never lose yourself.
                const offA = ax < 10 || ax > W - 10 || ay < 50 || ay > H - 10
                if (offA) {
                    const cx2 = W / 2, cy2 = H / 2
                    const ang = Math.atan2(ay - cy2, ax - cx2)
                    const ex = Math.max(24, Math.min(W - 24, cx2 + Math.cos(ang) * W))
                    const ey = Math.max(56, Math.min(H - 24, cy2 + Math.sin(ang) * H))
                    fgx.save(); fgx.translate(ex, ey); fgx.rotate(ang)
                    fgx.globalAlpha = 0.85; fgx.fillStyle = '#fde68a'
                    fgx.beginPath(); fgx.moveTo(8, 0); fgx.lineTo(-5, -5); fgx.lineTo(-5, 5); fgx.closePath(); fgx.fill()
                    fgx.restore(); fgx.globalAlpha = 1
                }
            }

            // Playing track — soft expanding rings, like sound leaving a source.
            const playId = audioRef.current.playingId
            if (playId) {
                const pt = tks.find(t => t.id === playId)
                if (pt) {
                    const sx = toSx(pt.px), sy = toSy(pt.py)
                    const ink = genreInk(pt.genres[0])
                    for (let ri = 0; ri < 3; ri++) {
                        const phase = ((ts % RING_PERIOD_MS) / RING_PERIOD_MS + ri / 3) % 1
                        fgx.beginPath(); fgx.arc(sx, sy, phase * RING_MAX_R, 0, Math.PI * 2)
                        fgx.strokeStyle = ink; fgx.globalAlpha = (1 - phase) * 0.32
                        fgx.lineWidth = 1.2; fgx.stroke()
                    }
                    fgx.globalAlpha = 1
                }
            }

            // Hover halo — a ring of light around the text, never a dot.
            if (hov) {
                const sx = toSx(hov.px), sy = toSy(hov.py)
                const ink = genreInk(hov.genres[0])
                fgx.strokeStyle = ink; fgx.globalAlpha = 0.8; fgx.lineWidth = 1.4
                fgx.beginPath(); fgx.arc(sx, sy, 13, 0, Math.PI * 2); fgx.stroke()
                fgx.globalAlpha = 0.18; fgx.fillStyle = ink
                fgx.beginPath(); fgx.arc(sx, sy, 13, 0, Math.PI * 2); fgx.fill()
                fgx.globalAlpha = 1
            }

            // Sync hover → React (tooltip/halo only; audio is driven by proximity above).
            setHovered(prev => (prev?.id === hov?.id ? prev : hov))
            const wantCursor = dragRef.current?.active ? 'grabbing' : hov ? 'pointer' : 'grab'
            setCursor(prev => prev === wantCursor ? prev : wantCursor)
        }

        const loop = (ts: number) => {
            if (!running) return
            const dpr = window.devicePixelRatio || 1
            const W = fg.width / dpr, H = fg.height / dpr

            const dt = lastTsRef.current ? Math.min(0.05, (ts - lastTsRef.current) / 1000) : 0.016
            lastTsRef.current = ts
            const camMoved = advance(W, H)
            const walkMoved = stepWalker(W, H, dt)
            const moved = camMoved || walkMoved
            const cam = camRef.current
            const curBand = zoomBand(cam.zoom)

            // BG: repaint on band change or significant camera drift.
            const bs = bgStateRef.current
            const bgDrift = bs ? Math.hypot(cam.ox - bs.ox, cam.oy - bs.oy) + Math.abs(cam.zoom - bs.zoom) * 200 : Infinity
            if (!bs || bs.band !== curBand || bgDrift > 80) {
                drawBg(W, H)
                bgStateRef.current = { band: curBand, ox: cam.ox, oy: cam.oy, zoom: cam.zoom }
            }

            // MID: repaint when the camera moved, throttled to ~33ms.
            if ((moved || midPaintRef.current === 0) && ts - midPaintRef.current > 33) {
                drawMid(W, H)
                midPaintRef.current = ts
            }

            // FG: every frame (cheap).
            drawFg(W, H, ts)

            // surface band + audio progress to React (throttled-ish via state diff)
            setBand(prev => prev === curBand ? prev : curBand)
            if (audioRef.current.playingId) setPlayProg(audioRef.current.progress)

            // Resume-on-return: persist camera, but no more than ~twice a second.
            if (moved && ts - camSaveRef.current > 500) {
                camSaveRef.current = ts
                try { localStorage.setItem('sond3r:galaxy:cam', JSON.stringify(cam)) } catch { /* ignore */ }
            }

            rafRef.current = requestAnimationFrame(loop)
        }
        rafRef.current = requestAnimationFrame(loop)
        return () => { running = false; cancelAnimationFrame(rafRef.current) }
    }, [screenToWorld, triggerPreview, cancelPreview])

    // ─────────────────────────────────────────────────────────────────────────
    // Render
    // ─────────────────────────────────────────────────────────────────────────

    const hovInk = hovered ? genreInk(hovered.genres[0]) : ACCENT
    const selInk = selected ? genreInk(selected.genres[0]) : ACCENT
    const bandLabels = ['overview', 'districts', 'streets', 'stalls']

    return (
        <div style={{ position: 'relative', width: '100%', height: '100%', background: BG, overflow: 'hidden', fontFamily: SANS }}>

            <div ref={wrapperRef} style={{ position: 'absolute', inset: 0 }}>
                <canvas ref={bgRef}  style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block', pointerEvents: 'none' }} />
                <canvas ref={midRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block', pointerEvents: 'none' }} />
                <canvas ref={fgRef}
                    onPointerDown={onPointerDown} onPointerMove={onPointerMove}
                    onPointerUp={onPointerUp} onPointerLeave={onPointerLeave}
                    onDoubleClick={onDoubleClick} onClick={onClick}
                    style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block', cursor, touchAction: 'none' }}
                />
            </div>

            {/* ── Top bar ───────────────────────────────────────────────────── */}
            <div style={{
                position: 'absolute', top: 0, left: 0, right: 0, zIndex: 25,
                display: 'flex', alignItems: 'center', gap: 8, padding: '0 12px', height: 40,
                background: 'rgba(12,9,6,0.86)', borderBottom: `1px solid ${BORDER2}`,
            }}>
                {onBack && <button onClick={onBack} style={btn}>← back</button>}
                <span style={{ fontFamily: MONO, fontSize: 10, color: FG4, letterSpacing: '0.10em' }}>
                    sound map{stats.total > 0 ? ` · ${stats.total.toLocaleString()} tracks` : ''}
                </span>
                <span style={{ fontFamily: MONO, fontSize: 9, color: `rgba(245,158,11,0.7)`, letterSpacing: '0.10em', flexShrink: 0 }}>
                    {bandLabels[band]}
                </span>
                <input value={search} onChange={e => setSearch(e.target.value)}
                    placeholder='search…'
                    style={{
                        flex: 1, maxWidth: 220, background: 'transparent', border: 'none',
                        borderBottom: `1px solid ${BORDER2}`, color: FG, fontSize: 11,
                        padding: '2px 0', outline: 'none', fontFamily: MONO,
                    }}
                />
                {search && <button onClick={() => setSearch('')} style={{ background: 'none', border: 'none', color: FG4, fontSize: 10, cursor: 'pointer', fontFamily: MONO }}>✕</button>}
                {/* The escape hatch — for when you'd rather be taken than wander. */}
                <button onClick={takeMeSomewhere} disabled={!tracks.length}
                    style={{ ...btn, marginLeft: 'auto', borderColor: `${CAMPFIRE}66`, color: CAMPFIRE, flexShrink: 0 }}>
                    ✦ take me somewhere
                </button>
            </div>

            {/* ── Loading overlay ───────────────────────────────────────────── */}
            {(loading || computing) && (
                <div style={{
                    position: 'absolute', inset: 0, zIndex: 20,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16,
                    background: 'rgba(12,9,6,0.93)',
                }}>
                    <div style={{ fontFamily: MONO, fontSize: 13, color: FG3, letterSpacing: '0.18em', textTransform: 'uppercase' }}>
                        {computing ? 'mapping the sound space…' : 'loading…'}
                    </div>
                    {computing && <div style={{ fontFamily: MONO, fontSize: 10, color: FG4, maxWidth: 320, textAlign: 'center', lineHeight: 1.8 }}>computing positions — cached after first run</div>}
                    <div style={{ width: 20, height: 20, border: `1.5px solid rgba(255,255,255,0.12)`, borderTopColor: CAMPFIRE, borderRadius: '50%', animation: 'gspin 0.9s linear infinite' }} />
                    <style>{`@keyframes gspin{to{transform:rotate(360deg)}}`}</style>
                    {onBack && (
                        <button onClick={onBack} style={{ marginTop: 8, background: 'none', border: `1px solid ${BORDER2}`, color: FG4, fontFamily: MONO, fontSize: 9, letterSpacing: '0.12em', padding: '6px 14px', cursor: 'pointer' }}>
                            navigate away
                        </button>
                    )}
                </div>
            )}

            {error && (
                <div style={{ position: 'absolute', inset: 0, zIndex: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 10 }}>
                    <div style={{ fontFamily: MONO, fontSize: 12, color: ACCENT }}>couldn't reach the map server</div>
                    <div style={{ fontFamily: MONO, fontSize: 10, color: FG4 }}>{error}</div>
                </div>
            )}

            {/* ── Hover tooltip — name held back until preview is heard ──────── */}
            {hovered && !selected && !loading && (
                <div style={{
                    position: 'fixed',
                    left: Math.min(window.innerWidth - 220, mousePos.x + 16),
                    top: mousePos.y - 80 < 48 ? mousePos.y + 14 : mousePos.y - 76,
                    width: 208, background: 'rgba(12,9,6,0.95)',
                    border: `1px solid ${hovInk}44`, borderLeft: `2px solid ${hovInk}`,
                    padding: '9px 11px', pointerEvents: 'none', zIndex: 28,
                }}>
                    {playingId === hovered.id && !nameRevealed ? (
                        <div style={{ fontFamily: MONO, fontSize: 9, color: hovInk, letterSpacing: '0.06em' }}>♪ listening…</div>
                    ) : (
                        <>
                            <div style={{ fontFamily: SANS, fontSize: 12, fontWeight: 600, color: FG, lineHeight: 1.3, marginBottom: 1 }}>{hovered.title}</div>
                            <div style={{ fontFamily: MONO, fontSize: 9, color: FG4, marginBottom: 6 }}>{hovered.artist}</div>
                        </>
                    )}
                    {playingId === hovered.id ? (
                        <div style={{ height: 1.5, background: 'rgba(255,255,255,0.08)', marginTop: 4 }}>
                            <div style={{ height: '100%', width: `${playProg * 100}%`, background: hovInk, transition: 'width 0.4s linear' }} />
                        </div>
                    ) : (
                        <div style={{ fontFamily: MONO, fontSize: 8, color: FG4 }}>
                            {previewCache.has(hovered.id) ? (previewCache.get(hovered.id) ? '▸ loading…' : 'no preview') : '▸ approaching…'}
                        </div>
                    )}
                </div>
            )}

            {/* ── Selected panel ────────────────────────────────────────────── */}
            {selected && !loading && (
                <div style={{
                    position: 'fixed',
                    left: selectedPos ? Math.min(window.innerWidth - 240, selectedPos.x + 16) : 12,
                    top: selectedPos ? (selectedPos.y - 150 < 48 ? selectedPos.y + 14 : selectedPos.y - 140) : window.innerHeight - 200,
                    width: 232, zIndex: 30, background: 'rgba(12,9,6,0.97)',
                    border: `1px solid ${selInk}55`, borderLeft: `2px solid ${selInk}`, padding: '12px 13px',
                }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 }}>
                        <div style={{ minWidth: 0, flex: 1 }}>
                            <div style={{ fontFamily: SANS, fontSize: 13, fontWeight: 600, color: FG, lineHeight: 1.3, marginBottom: 2 }}>{selected.title}</div>
                            <div style={{ fontFamily: MONO, fontSize: 9, color: FG4 }}>{selected.artist}</div>
                        </div>
                        <button onClick={() => { setSelected(null); setSelectedPos(null); audioRef.current.unlock(); setLockedTrack(null) }}
                            style={{ background: 'none', border: 'none', color: FG4, fontSize: 14, cursor: 'pointer', padding: '0 0 0 8px', flexShrink: 0 }}>✕</button>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 12 }}>
                        {selected.genres.slice(0, 3).map(g => (
                            <span key={g} style={{ fontFamily: MONO, fontSize: 8, color: genreInk(g), border: `1px solid ${genreInk(g)}38`, padding: '2px 6px' }}>{g}</span>
                        ))}
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                        {onTrackSelect && (
                            <button onClick={() => onTrackSelect({ id: selected.id, title: selected.title, artist: selected.artist, genres: selected.genres })}
                                style={{ flex: 1, padding: '7px 0', background: 'rgba(255,255,255,0.04)', border: `1px solid ${BORDER2}`, color: FG4, fontFamily: MONO, fontSize: 8, letterSpacing: '0.10em', textTransform: 'uppercase', cursor: 'pointer' }}>
                                open wiki
                            </button>
                        )}
                        {onPlayTrack && (
                            <button onClick={() => onPlayTrack({ id: selected.id, title: selected.title, artist: selected.artist, genres: selected.genres })}
                                style={{ flex: 2, padding: '7px 0', background: `${selInk}18`, border: `1px solid ${selInk}66`, color: selInk, fontFamily: MONO, fontSize: 8, letterSpacing: '0.10em', textTransform: 'uppercase', cursor: 'pointer' }}>
                                ▶ play on spotify
                            </button>
                        )}
                    </div>
                </div>
            )}

            {/* ── Locked preview bar ────────────────────────────────────────── */}
            {lockedTrack && (
                <div style={{
                    position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 22,
                    display: 'flex', alignItems: 'center', gap: 10,
                    background: 'rgba(12,9,6,0.94)', borderTop: `1px solid ${BORDER2}`,
                    padding: '0 14px', height: 36,
                }}>
                    <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 2, background: 'rgba(255,255,255,0.06)' }}>
                        <div style={{ height: '100%', width: `${playProg * 100}%`, background: genreInk(lockedTrack.genres[0]), transition: 'width 0.4s linear' }} />
                    </div>
                    <span style={{ fontFamily: MONO, fontSize: 9, color: genreInk(lockedTrack.genres[0]), flexShrink: 0 }}>♪</span>
                    <span style={{ fontFamily: SANS, fontSize: 11, color: FG, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{lockedTrack.title}</span>
                    <span style={{ fontFamily: MONO, fontSize: 9, color: FG4, flexShrink: 0 }}>{lockedTrack.artist}</span>
                    <button onClick={toggleMute} title={previewMuted ? 'unmute' : 'mute'}
                        style={{ background: 'none', border: 'none', color: previewMuted ? FG4 : FG, fontSize: 12, cursor: 'pointer', padding: '0 2px', flexShrink: 0 }}>
                        {previewMuted ? '🔇' : '🔊'}
                    </button>
                    <button onClick={stopLockedPreview} title="stop preview"
                        style={{ background: 'none', border: `1px solid ${BORDER2}`, color: FG4, fontFamily: MONO, fontSize: 8, letterSpacing: '0.10em', cursor: 'pointer', padding: '3px 8px', flexShrink: 0 }}>
                        ■ stop
                    </button>
                </div>
            )}

            {/* Faint control hint — minimal, never a HUD. */}
            {!loading && !error && (
                <div style={{ position: 'absolute', bottom: 12, right: 14, zIndex: 14, fontFamily: MONO, fontSize: 8, color: 'rgba(240,232,212,0.22)', letterSpacing: '0.06em', pointerEvents: 'none', textAlign: 'right', lineHeight: 1.7 }}>
                    click or WASD to walk · scroll to zoom<br />space = recentre on you · click a track to open
                </div>
            )}

            {/* ── Now-playing chip — orientation contract: what's sounding is ALWAYS legible ── */}
            {(() => {
                if (lockedTrack) return null   // the locked bar already shows it
                const np = playingId ? tracks.find(t => t.id === playingId) : null
                if (!np) return null
                return (
                    <div style={{
                        position: 'absolute', bottom: 12, left: 12, zIndex: 18,
                        maxWidth: 280, display: 'flex', alignItems: 'center', gap: 8,
                        background: 'rgba(12,9,6,0.9)', border: `1px solid ${genreInk(np.genres[0])}33`,
                        borderLeft: `2px solid ${genreInk(np.genres[0])}`, padding: '6px 10px',
                        pointerEvents: 'none',
                    }}>
                        <span style={{ fontFamily: MONO, fontSize: 9, color: genreInk(np.genres[0]), flexShrink: 0 }}>♪</span>
                        <span style={{ fontFamily: SANS, fontSize: 11, color: FG, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {nameRevealed ? np.title : 'listening…'}
                        </span>
                        {nameRevealed && <span style={{ fontFamily: MONO, fontSize: 9, color: FG4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 1 }}>{np.artist}</span>}
                    </div>
                )
            })()}
        </div>
    )
}

const btn: React.CSSProperties = {
    background: 'none', border: `1px solid rgba(255,255,255,0.10)`,
    color: 'rgba(240,232,212,0.5)', fontSize: 9, padding: '4px 9px',
    cursor: 'pointer', fontFamily: '"Fragment Mono","DM Mono",monospace',
    letterSpacing: '0.08em', textTransform: 'uppercase',
}
