/**
 * TrackWikiView.tsx — v4
 *
 * A living music space explorer, not a data dashboard.
 * The Markov kernel is the gravitational center — the user's taste state
 * visualized as a pulsing body in 2D space. Every track orbits around it.
 *
 * DATA SOURCES (all free, no auth required):
 *   iTunes Search  — art 600px, preview, album, release year, track #/total,
 *                    genre, explicit, country, duration           (no key)
 *   MusicBrainz    — ISRC, label, country, community tags,        (no key;
 *                    artist origin/years/type/area               User-Agent req'd)
 *   Wikipedia      — track page first, artist page fallback       (no key)
 *
 * KERNEL SPACE MATH:
 *   Project embedding e into the 2D subspace (v̂, v̂⊥):
 *     x = dot(e − μ, v̂) / σ      — alignment with kernel momentum
 *     y = dot(e − μ, v̂⊥) / σ     — perpendicular variation
 *   distNorm = √(x²+y²); σ rings are literal circles at r=1,2,3.
 */

import {
    useState, useRef, useEffect, useMemo, useCallback,
    type ReactNode,
} from 'react'
import {
    buildNeighborhood,
    genreColor,
    soundSimilarity,
    type TrackNeighborData,
    type ProjectedPoint,
    type NeighborhoodMetrics,
} from '../kernel/neighborhoodAnalysis'

// ── Config — SOND3R design tokens ────────────────────────────────────────────

const BASE_URL    = 'http://localhost:8080'
const N_NEIGHBORS = 50
const MB_UA       = 'SOND3R/1.0.0 (https://fangorn.network)'

const BG      = '#050309'
const BG1     = '#08060f'
const BG2     = '#0c0a17'
const BG3     = '#100d1e'
const FG      = '#f2f0ff'
const FG2     = '#b0adcc'
const FG3     = '#6a678a'
const FG4     = '#3c3a55'
const ACCENT  = '#e8005a'
const CYAN    = '#00d4ff'
const TEAL    = '#00ffe7'
const SUCCESS = '#00ff88'
const YELLOW  = '#f0e040'
const VIOLET  = '#a78bfa'
const AMBER   = '#fbbf24'

const MAGENTA  = ACCENT
const DARK_BG  = BG
const PANEL_BG = BG1
const CARD_BG  = BG2
const BORDER   = 'rgba(255,255,255,0.13)'
const BORDER2  = 'rgba(255,255,255,0.08)'
const DIM      = 'rgba(255,255,255,0.38)'
const DIMMER   = 'rgba(255,255,255,0.20)'
const GLASS    = 'rgba(255,255,255,0.04)'
const GLASS_HI = 'rgba(255,255,255,0.07)'
const GLASS_BD = 'rgba(255,255,255,0.10)'

const MONO  = 'var(--font-mono,"Fragment Mono","DM Mono",monospace)'
const SANS  = 'var(--font-body,"Geist","Inter",sans-serif)'
const DISP  = 'var(--font-display,"Bebas Neue",sans-serif)'

// ── External API types ────────────────────────────────────────────────────────

interface ItunesData {
    artworkUrl:    string | null
    previewUrl:    string | null
    albumName:     string | null
    releaseYear:   string | null
    releaseDate:   string | null      // full ISO date
    explicit:      boolean
    trackNumber:   number | null
    trackCount:    number | null
    discNumber:    number | null
    discCount:     number | null
    primaryGenre:  string | null
    country:       string | null      // 2-letter store country
    durationMs:    number | null
    artistUrl:     string | null
    trackUrl:      string | null
}

interface MBRecording {
    mbid:          string | null
    isrcs:         string[]
    label:         string | null
    country:       string | null      // country of earliest release
    releaseDate:   string | null      // earliest release date
    trackNumber:   string | null
    totalTracks:   number | null
    mbTags:        string[]           // community genre tags, sorted by vote
    disambig:      string | null
}

interface MBArtist {
    mbid:          string | null
    country:       string | null      // ISO country code
    area:          string | null      // city/region name
    beginYear:     string | null
    endYear:       string | null
    ended:         boolean
    type:          string | null      // 'Person' | 'Group' | 'Orchestra' etc.
    mbTags:        string[]
    disambig:      string | null
}

interface WikiData {
    extract:       string | null
    thumbnail:     string | null
    url:           string | null
    isTrackPage:   boolean            // true if we found a track-specific page
}

// ── Free API fetchers ─────────────────────────────────────────────────────────

async function fetchItunes(artist: string, title: string): Promise<ItunesData> {
    const empty: ItunesData = {
        artworkUrl: null, previewUrl: null, albumName: null,
        releaseYear: null, releaseDate: null, explicit: false,
        trackNumber: null, trackCount: null, discNumber: null, discCount: null,
        primaryGenre: null, country: null, durationMs: null,
        artistUrl: null, trackUrl: null,
    }
    try {
        const q   = encodeURIComponent(`${artist} ${title}`)
        const res = await fetch(`https://itunes.apple.com/search?term=${q}&media=music&entity=song&limit=5`)
        const json = await res.json()
        // Pick the best hit: prefer exact title + artist match
        const results: any[] = json.results ?? []
        const hit = results.find(r =>
            r.trackName?.toLowerCase() === title.toLowerCase() &&
            r.artistName?.toLowerCase() === artist.toLowerCase()
        ) ?? results.find(r =>
            r.trackName?.toLowerCase().includes(title.toLowerCase())
        ) ?? results[0]
        if (!hit) return empty
        return {
            artworkUrl:   hit.artworkUrl100?.replace('100x100bb', '600x600bb') ?? null,
            previewUrl:   hit.previewUrl ?? null,
            albumName:    hit.collectionName ?? null,
            releaseYear:  hit.releaseDate ? new Date(hit.releaseDate).getFullYear().toString() : null,
            releaseDate:  hit.releaseDate ?? null,
            explicit:     hit.trackExplicitness === 'explicit',
            trackNumber:  hit.trackNumber ?? null,
            trackCount:   hit.trackCount ?? null,
            discNumber:   hit.discNumber ?? null,
            discCount:    hit.discCount ?? null,
            primaryGenre: hit.primaryGenreName ?? null,
            country:      hit.country ?? null,
            durationMs:   hit.trackTimeMillis ?? null,
            artistUrl:    hit.artistViewUrl ?? null,
            trackUrl:     hit.trackViewUrl ?? null,
        }
    } catch { return empty }
}

async function fetchMBRecording(artist: string, title: string): Promise<MBRecording> {
    const empty: MBRecording = {
        mbid: null, isrcs: [], label: null, country: null,
        releaseDate: null, trackNumber: null, totalTracks: null, mbTags: [], disambig: null,
    }
    try {
        // MusicBrainz requires a User-Agent header (rate: 1 req/s unauthed)
        const q   = encodeURIComponent(`recording:"${title}" AND artist:"${artist}"`)
        const res = await fetch(
            `https://musicbrainz.org/ws/2/recording?query=${q}&fmt=json&limit=5&inc=isrcs+releases+tags`,
            { headers: { 'User-Agent': MB_UA, 'Accept': 'application/json' } }
        )
        if (!res.ok) return empty
        const json = await res.json()
        const recs: any[] = json.recordings ?? []
        if (!recs.length) return empty

        // Best match: prefer exact artist + title
        const rec = recs.find(r =>
            r['artist-credit']?.[0]?.artist?.name?.toLowerCase() === artist.toLowerCase()
        ) ?? recs[0]

        // Find the earliest release with label info
        const releases: any[] = rec.releases ?? []
        releases.sort((a, b) => (a.date ?? '9999') < (b.date ?? '9999') ? -1 : 1)
        const rel = releases[0]
        const labelInfo = rel?.['label-info']?.[0]
        const media     = rel?.media?.[0]
        const track     = media?.track?.[0]

        const tags: string[] = (rec.tags ?? [])
            .sort((a: any, b: any) => (b.count ?? 0) - (a.count ?? 0))
            .slice(0, 10)
            .map((t: any) => t.name as string)

        return {
            mbid:         rec.id ?? null,
            isrcs:        rec.isrcs ?? [],
            label:        labelInfo?.label?.name ?? null,
            country:      rel?.country ?? null,
            releaseDate:  rel?.date ?? null,
            trackNumber:  track?.number ?? null,
            totalTracks:  media?.['track-count'] ?? null,
            mbTags:       tags,
            disambig:     rec.disambiguation ?? null,
        }
    } catch { return empty }
}

async function fetchMBArtist(artist: string): Promise<MBArtist> {
    const empty: MBArtist = {
        mbid: null, country: null, area: null,
        beginYear: null, endYear: null, ended: false,
        type: null, mbTags: [], disambig: null,
    }
    try {
        const q   = encodeURIComponent(`artist:"${artist}"`)
        const res = await fetch(
            `https://musicbrainz.org/ws/2/artist?query=${q}&fmt=json&limit=3&inc=tags`,
            { headers: { 'User-Agent': MB_UA, 'Accept': 'application/json' } }
        )
        if (!res.ok) return empty
        const json = await res.json()
        const artists: any[] = json.artists ?? []
        if (!artists.length) return empty

        // Best match: exact name, or highest score
        const a = artists.find(x => x.name?.toLowerCase() === artist.toLowerCase()) ?? artists[0]

        const lifeSpan = a['life-span'] ?? {}
        const tags: string[] = (a.tags ?? [])
            .sort((x: any, y: any) => (y.count ?? 0) - (x.count ?? 0))
            .slice(0, 8)
            .map((t: any) => t.name as string)

        return {
            mbid:      a.id ?? null,
            country:   a.country ?? null,
            area:      a['begin-area']?.name ?? a.area?.name ?? null,
            beginYear: lifeSpan.begin ? String(lifeSpan.begin).slice(0, 4) : null,
            endYear:   lifeSpan.end   ? String(lifeSpan.end).slice(0, 4)   : null,
            ended:     lifeSpan.ended ?? false,
            type:      a.type ?? null,
            mbTags:    tags,
            disambig:  a.disambiguation ?? null,
        }
    } catch { return empty }
}

async function fetchWikipedia(artist: string, title?: string): Promise<WikiData> {
    const empty: WikiData = { extract: null, thumbnail: null, url: null, isTrackPage: false }
    const tryPage = async (term: string, isTrack: boolean): Promise<WikiData | null> => {
        try {
            const res  = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(term)}`)
            if (!res.ok) return null
            const json = await res.json()
            if (json.type === 'disambiguation' || !json.extract) return null
            return {
                extract:   json.extract,
                thumbnail: json.thumbnail?.source ?? null,
                url:       json.content_urls?.desktop?.page ?? null,
                isTrackPage: isTrack,
            }
        } catch { return null }
    }

    // Try track page first (e.g. "Karma Police" or "Karma Police (song)")
    if (title) {
        const trackPage = await tryPage(`${title} (song)`, true)
            ?? await tryPage(title, true)
        if (trackPage && trackPage.extract && trackPage.extract.length > 80) return trackPage
    }

    // Fall back to artist page
    return (await tryPage(artist, false)) ?? empty
}

// ── Hooks ─────────────────────────────────────────────────────────────────────

function useItunesData(artist: string, title: string) {
    const [data, setData] = useState<ItunesData | null>(null)
    useEffect(() => {
        if (!artist || !title) { setData(null); return }
        setData(null)
        fetchItunes(artist, title).then(setData)
    }, [artist, title])
    return data
}

function useMBRecording(artist: string, title: string) {
    const [data, setData] = useState<MBRecording | null>(null)
    useEffect(() => {
        if (!artist || !title) { setData(null); return }
        setData(null)
        // MusicBrainz rate-limit: delay slightly so iTunes hits first
        const t = setTimeout(() => fetchMBRecording(artist, title).then(setData), 400)
        return () => clearTimeout(t)
    }, [artist, title])
    return data
}

function useMBArtist(artist: string) {
    const [data, setData] = useState<MBArtist | null>(null)
    useEffect(() => {
        if (!artist) { setData(null); return }
        setData(null)
        // Stagger after recording request to stay within 1 req/s
        const t = setTimeout(() => fetchMBArtist(artist).then(setData), 900)
        return () => clearTimeout(t)
    }, [artist])
    return data
}

function useWikipediaData(artist: string, title?: string) {
    const [data, setData] = useState<WikiData | null>(null)
    useEffect(() => {
        if (!artist) { setData(null); return }
        setData(null)
        fetchWikipedia(artist, title).then(setData)
    }, [artist, title])
    return data
}

// ── Core API ──────────────────────────────────────────────────────────────────

interface RawChromaHit {
    id: string; embedding: number[]; distance: number
    fields?: {
        byArtist?: string; title?: string; isrcCode?: string
        durationMs?: number; genres?: string[]; moods?: string[]
        themes?: string[]; contexts?: string[]
    }
}

async function apiEmbed(text: string): Promise<Float32Array> {
    const res = await fetch(`${BASE_URL}/embed`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
    })
    if (!res.ok) throw new Error(`Embed failed (${res.status})`)
    return new Float32Array((await res.json()).embedding)
}

async function apiSearchVector(embedding: Float32Array, n: number): Promise<RawChromaHit[]> {
    const res = await fetch(`${BASE_URL}/search/vector`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ embedding: Array.from(embedding), n_results: n }),
    })
    if (!res.ok) throw new Error(`Search failed (${res.status})`)
    return (await res.json()).results as RawChromaHit[]
}

function toNeighborData(hit: RawChromaHit, dist: number): TrackNeighborData {
    const m = hit.fields ?? {}
    return {
        id: hit.id, artist: m.byArtist ?? 'Unknown', title: m.title ?? hit.id,
        isrc: m.isrcCode, durationMs: m.durationMs ?? 0,
        genres: m.genres ?? [], moods: m.moods ?? [], themes: m.themes ?? [], contexts: m.contexts ?? [],
        embedding: new Float32Array(hit.embedding), distance: dist,
    }
}

// ── Kernel types + math ───────────────────────────────────────────────────────

export interface KernelState {
    mu:       Float32Array
    velocity: Float32Array
    sigma:    number
}

interface KernelAttitude {
    x: number; y: number; distNorm: number; alignment: number
    zone: 'groove' | 'familiar' | 'stretch' | 'averse'
    direction: 'toward' | 'adjacent' | 'sideways' | 'against'
    label: string; color: string
}

function projectToKernelSpace(e: Float32Array, mu: Float32Array, velocity: Float32Array, sigma: number) {
    const n = Math.min(e.length, mu.length, velocity.length)
    let vn2 = 0
    for (let i = 0; i < n; i++) vn2 += velocity[i] ** 2
    const vn = Math.sqrt(vn2)
    if (vn < 1e-8) return { x: 0, y: 0 }
    const diff = new Float32Array(n)
    for (let i = 0; i < n; i++) diff[i] = e[i] - mu[i]
    let x = 0
    for (let i = 0; i < n; i++) x += diff[i] * (velocity[i] / vn)
    const vhat0 = velocity[0] / vn
    const perp  = new Float32Array(n)
    perp[0] = 1.0 - vhat0 * (velocity[0] / vn)
    for (let i = 1; i < n; i++) perp[i] = -(vhat0 * (velocity[i] / vn))
    let pn2 = 0
    for (let i = 0; i < n; i++) pn2 += perp[i] ** 2
    let pn = Math.sqrt(pn2)
    if (pn < 0.1) {
        const vh1 = velocity[1] / vn
        perp.fill(0)
        perp[1] = 1.0 - vh1 * (velocity[1] / vn)
        for (let i = 0; i < n; i++) { if (i !== 1) perp[i] = -(vh1 * (velocity[i] / vn)) }
        pn2 = 0; for (let i = 0; i < n; i++) pn2 += perp[i] ** 2
        pn = Math.sqrt(pn2)
    }
    let y = 0
    if (pn > 1e-8) for (let i = 0; i < n; i++) y += diff[i] * (perp[i] / pn)
    return { x: x / (sigma || 1), y: y / (sigma || 1) }
}

function computeAttitude(e: Float32Array, k: KernelState): KernelAttitude {
    const { x, y } = projectToKernelSpace(e, k.mu, k.velocity, k.sigma)
    const distNorm  = Math.sqrt(x ** 2 + y ** 2)
    const alignment = distNorm > 1e-8 ? x / distNorm : 0
    const zone: KernelAttitude['zone'] =
        distNorm < 0.5 ? 'groove' : distNorm < 1.2 ? 'familiar' : distNorm < 2.5 ? 'stretch' : 'averse'
    const direction: KernelAttitude['direction'] =
        alignment > 0.45 ? 'toward' : alignment > 0.1 ? 'adjacent' : alignment > -0.2 ? 'sideways' : 'against'
    const L: Record<string, [string, string]> = {
        'groove-toward':    ['Exactly where your taste is heading', TEAL],
        'groove-adjacent':  ['Deep in your current groove', TEAL],
        'groove-sideways':  ['Core comfort zone', TEAL],
        'groove-against':   ['Home turf — pulling against momentum', '#34d399'],
        'familiar-toward':  ['Within range, moving this way', '#34d399'],
        'familiar-adjacent':['Within your taste window', '#34d399'],
        'familiar-sideways':['Adjacent — kernel is neutral', DIM],
        'familiar-against': ['Known territory, wrong direction', AMBER],
        'stretch-toward':   ['Ambitious reach — headed here', VIOLET],
        'stretch-adjacent': ['A stretch, direction compatible', VIOLET],
        'stretch-sideways': ['Outside comfort zone, perpendicular', DIMMER],
        'stretch-against':  ['Kernel would resist this', AMBER],
        'averse-toward':    ['Far out — but reaching this way', VIOLET],
        'averse-adjacent':  ['Kernel is cold on this', MAGENTA],
        'averse-sideways':  ['Far outside your groove', MAGENTA],
        'averse-against':   ['Kernel actively resists this', MAGENTA],
    }
    const [label, color] = L[`${zone}-${direction}`] ?? ['Unknown', DIMMER]
    return { x, y, distNorm, alignment, zone, direction, label, color }
}

function crowdingLabel(pts: ProjectedPoint[]) {
    const dists = pts.filter(p => !p.isFocal).map(p => p.distance).sort((a, b) => a - b)
    if (!dists.length) return { label: '—', color: DIMMER, detail: '' }
    const nearest = dists[0], median = dists[Math.floor(dists.length / 2)]
    const ratio = nearest / (median || 1)
    if (ratio < 0.18) return { label: 'Very Crowded',  color: MAGENTA,   detail: `${nearest.toFixed(3)} nearest · ${median.toFixed(3)} median` }
    if (ratio < 0.32) return { label: 'Competitive',   color: AMBER,     detail: `${nearest.toFixed(3)} nearest · ${median.toFixed(3)} median` }
    if (ratio < 0.52) return { label: 'Moderate',      color: '#34d399', detail: `${nearest.toFixed(3)} nearest · ${median.toFixed(3)} median` }
    return                    { label: 'Open Territory', color: TEAL,     detail: `${nearest.toFixed(3)} nearest · ${median.toFixed(3)} median` }
}

// ─────────────────────────────────────────────────────────────────────────────
// SpaceCanvas
// ─────────────────────────────────────────────────────────────────────────────

interface HistoryPoint { x: number; y: number; label: string; genre: string | null }

interface SpaceCanvasProps {
    pts:            ProjectedPoint[]
    focalLabel:     string
    focalAttitude?: KernelAttitude
    history?:       HistoryPoint[]
    hasVelocity?:   boolean
    highlightId?:   string
}

function SpaceCanvas({ pts, focalLabel, focalAttitude, history = [], hasVelocity = false, highlightId = "" }: SpaceCanvasProps) {
    const canvasRef   = useRef<HTMLCanvasElement>(null)
    const stateRef    = useRef({ pts, focalLabel, focalAttitude, history, hasVelocity, highlightId })
    const rafRef      = useRef<number>(0)
    const viewRef     = useRef({ ox: 0, oy: 0, zoom: 1 })
    const mousePosRef = useRef<{ x: number; y: number } | null>(null)
    const dragRef     = useRef<{ sx: number; sy: number; ox: number; oy: number } | null>(null)
    const [cursor, setCursor] = useState<'grab' | 'grabbing'>('grab')

    useEffect(() => {
        stateRef.current = { pts, focalLabel, focalAttitude, history, hasVelocity, highlightId }
    }, [pts, focalLabel, focalAttitude, history, hasVelocity, highlightId])

    useEffect(() => { viewRef.current = { ox: 0, oy: 0, zoom: 1 } }, [focalLabel])

    useEffect(() => {
        const canvas = canvasRef.current
        if (!canvas) return
        const sync = () => {
            const dpr = window.devicePixelRatio || 1
            const w = canvas.clientWidth, h = canvas.clientHeight
            if (w === 0 || h === 0) return
            if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
                canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr)
            }
        }
        const ro = new ResizeObserver(sync)
        ro.observe(canvas); sync()
        return () => ro.disconnect()
    }, [])

    const onPointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
        dragRef.current = { sx: e.clientX, sy: e.clientY, ox: viewRef.current.ox, oy: viewRef.current.oy }
        canvasRef.current?.setPointerCapture(e.pointerId); setCursor('grabbing')
    }, [])
    const onPointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
        if (dragRef.current) {
            const { sx, sy, ox, oy } = dragRef.current
            viewRef.current = { ...viewRef.current, ox: ox + e.clientX - sx, oy: oy + e.clientY - sy }
        }
        const rect = canvasRef.current?.getBoundingClientRect()
        if (rect) mousePosRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top }
    }, [])
    const onPointerUp    = useCallback(() => { dragRef.current = null; setCursor('grab') }, [])
    const onPointerLeave = useCallback(() => { dragRef.current = null; setCursor('grab'); mousePosRef.current = null }, [])

    useEffect(() => {
        const canvas = canvasRef.current
        if (!canvas) return
        const ctx = canvas.getContext('2d')!
        let running = true

        const draw = (ts: number) => {
            if (!running) return
            const dpr = window.devicePixelRatio || 1
            const W = canvas.width / dpr, H = canvas.height / dpr
            const { ox, oy, zoom } = viewRef.current
            const { pts: allPts, focalLabel: fl, focalAttitude: fa, history: hist, hasVelocity: hv, highlightId: hlId } = stateRef.current
            ctx.clearRect(0, 0, canvas.width, canvas.height)
            ctx.save(); ctx.scale(dpr, dpr)
            ctx.save(); ctx.translate(ox, oy); ctx.scale(zoom, zoom)
            const cx = W / 2, cy = H / 2

            if (fa) {
                // MODE B — KERNEL SPACE
                const allKPts = [{ x: fa.x, y: fa.y }, ...hist]
                const maxDist = Math.max(2.5, ...allKPts.map(p => Math.sqrt(p.x ** 2 + p.y ** 2)))
                const SPX = Math.min(100, (Math.min(W, H) * 0.40) / maxDist)
                const toK = (kx: number, ky: number) => ({ px: cx + kx * SPX, py: cy - ky * SPX })
                ctx.restore(); ctx.restore()
                ctx.save(); ctx.scale(dpr, dpr)
                const bg = ctx.createRadialGradient(cx + ox, cy + oy, 0, cx, cy, W * 0.9)
                bg.addColorStop(0, BG2); bg.addColorStop(1, BG)
                ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H)
                const gg = ctx.createRadialGradient(cx + ox, cy + oy, 0, cx + ox, cy + oy, SPX * zoom * 1.1)
                gg.addColorStop(0, 'rgba(0,255,231,0.05)'); gg.addColorStop(1, 'rgba(0,255,231,0)')
                ctx.fillStyle = gg; ctx.fillRect(0, 0, W, H)
                ctx.restore()
                ctx.save(); ctx.scale(dpr, dpr); ctx.translate(ox, oy); ctx.scale(zoom, zoom)
                ctx.setLineDash([3 / zoom, 9 / zoom])
                ;[1, 2, 3].forEach((s, i) => {
                    ctx.beginPath(); ctx.arc(cx, cy, s * SPX, 0, Math.PI * 2)
                    ctx.strokeStyle = `rgba(255,255,255,${0.07 - i * 0.016})`
                    ctx.lineWidth = 0.8 / zoom; ctx.stroke()
                })
                ctx.setLineDash([])
                ctx.restore(); ctx.restore()
                ctx.save(); ctx.scale(dpr, dpr)
                ;[1, 2, 3].forEach(s => {
                    const sx = cx + ox + s * SPX * zoom, sy = cy + oy
                    ctx.fillStyle = 'rgba(255,255,255,0.1)'; ctx.font = `10px ${MONO}`
                    ctx.textAlign = 'left'; ctx.fillText(`${s}σ`, sx + 4, sy - 3)
                })
                ctx.restore()
                ctx.save(); ctx.scale(dpr, dpr); ctx.translate(ox, oy); ctx.scale(zoom, zoom)
                if (hv) {
                    const axLen = SPX * 3.0
                    ctx.beginPath(); ctx.moveTo(cx - axLen, cy); ctx.lineTo(cx + axLen, cy)
                    ctx.strokeStyle = 'rgba(0,255,231,0.09)'; ctx.lineWidth = 1 / zoom; ctx.stroke()
                    ctx.beginPath(); ctx.moveTo(cx + axLen, cy)
                    ctx.lineTo(cx + axLen - 9 / zoom, cy - 4 / zoom)
                    ctx.lineTo(cx + axLen - 9 / zoom, cy + 4 / zoom)
                    ctx.closePath(); ctx.fillStyle = 'rgba(0,255,231,0.15)'; ctx.fill()
                }
                if (hist.length > 1) {
                    ctx.beginPath()
                    hist.forEach(({ x, y }, i) => {
                        const { px, py } = toK(x, y); i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)
                    })
                    ctx.strokeStyle = 'rgba(167,139,250,0.11)'; ctx.lineWidth = 1 / zoom; ctx.stroke()
                }
                hist.forEach(({ x, y }, i) => {
                    const age = i / hist.length
                    const { px, py } = toK(x, y)
                    ctx.beginPath(); ctx.arc(px, py, Math.max(1, (4.5 - age * 3) / zoom), 0, Math.PI * 2)
                    ctx.fillStyle = `rgba(167,139,250,${(1 - age) * 0.5})`; ctx.fill()
                })
                const { px: fx, py: fy } = toK(fa.x, fa.y)
                ctx.shadowColor = fa.color; ctx.shadowBlur = 18 / zoom
                ctx.beginPath(); ctx.arc(fx, fy, 7 / zoom, 0, Math.PI * 2)
                ctx.fillStyle = fa.color; ctx.fill(); ctx.shadowBlur = 0
                ctx.font = `bold ${11 / zoom}px ${SANS}`; ctx.textAlign = 'center'
                ctx.fillStyle = fa.color
                ctx.fillText(fl.length > 22 ? fl.slice(0, 20) + '…' : fl, fx, fy - 14 / zoom)
                ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(fx, fy)
                ctx.strokeStyle = `${fa.color}25`; ctx.lineWidth = 0.8 / zoom; ctx.stroke()
                ctx.shadowColor = TEAL; ctx.shadowBlur = 12 / zoom
                ctx.beginPath(); ctx.arc(cx, cy, 5 / zoom, 0, Math.PI * 2)
                ctx.fillStyle = TEAL; ctx.fill(); ctx.shadowBlur = 0
                const pulse = Math.sin(ts * 0.0018) * 0.5 + 0.5
                ctx.restore(); ctx.restore()
                ctx.save(); ctx.scale(dpr, dpr)
                const mcx = cx + ox, mcy = cy + oy
                ctx.beginPath(); ctx.arc(mcx, mcy, (10 + pulse * 7) * Math.min(zoom, 2), 0, Math.PI * 2)
                ctx.strokeStyle = `rgba(0,255,231,${0.18 + pulse * 0.14})`; ctx.lineWidth = 1.5; ctx.stroke()
                ctx.font = `11px ${MONO}`; ctx.fillStyle = 'rgba(0,255,231,0.45)'
                ctx.textAlign = 'center'; ctx.fillText('μ', mcx, mcy + 20)
                ctx.font = `9px ${MONO}`; ctx.fillStyle = 'rgba(0,255,231,0.2)'
                ctx.fillText('your taste', mcx, mcy + 31)
                if (hv) {
                    const axLen = SPX * 3.0 * zoom
                    ctx.font = `9px ${MONO}`; ctx.fillStyle = 'rgba(0,255,231,0.2)'
                    ctx.textAlign = 'right'; ctx.fillText('toward →', mcx + axLen - 2, mcy - 8)
                    ctx.textAlign = 'left'; ctx.fillText('← against', mcx - axLen + 2, mcy - 8)
                }
                ctx.restore()
            } else {
                // MODE A — NEIGHBOURHOOD
                const nbrs  = allPts.filter(p => !p.isFocal)
                const focal = allPts.find(p => p.isFocal)
                if (!nbrs.length) { ctx.restore(); ctx.restore(); rafRef.current = requestAnimationFrame(draw); return }
                const fpx = focal?.px ?? 0, fpy = focal?.py ?? 0
                const maxD = Math.max(1, ...nbrs.map(p => Math.sqrt((p.px - fpx) ** 2 + (p.py - fpy) ** 2)))
                const PAD = 56, SCALE = (Math.min(W, H) / 2 - PAD) / maxD
                const toN = (px: number, py: number) => ({ nx: cx + (px - fpx) * SCALE, ny: cy - (py - fpy) * SCALE })
                ctx.restore(); ctx.restore()
                ctx.save(); ctx.scale(dpr, dpr)
                const bg = ctx.createRadialGradient(cx, cy, 0, cx, cy, W * 0.8)
                bg.addColorStop(0, BG2); bg.addColorStop(1, BG)
                ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H)
                const gx = cx + ox, gy = cy + oy
                const fg2 = ctx.createRadialGradient(gx, gy, 0, gx, gy, SCALE * maxD * 0.5 * zoom)
                fg2.addColorStop(0, 'rgba(0,255,231,0.08)'); fg2.addColorStop(1, 'rgba(0,255,231,0)')
                ctx.fillStyle = fg2; ctx.fillRect(0, 0, W, H)
                ctx.restore()
                ctx.save(); ctx.scale(dpr, dpr); ctx.translate(ox, oy); ctx.scale(zoom, zoom)
                const mouse = mousePosRef.current
                let hoveredPt: ProjectedPoint | null = null
                if (mouse) {
                    let bestD = 22
                    nbrs.forEach(p => {
                        const { nx, ny } = toN(p.px, p.py)
                        const sx2 = ox + nx * zoom, sy2 = oy + ny * zoom
                        const d = Math.sqrt((sx2 - mouse.x) ** 2 + (sy2 - mouse.y) ** 2)
                        if (d < bestD) { bestD = d; hoveredPt = p }
                    })
                }
                const sorted = [...nbrs].sort((a, b) => b.distance - a.distance)
                sorted.forEach(p => {
                    const { nx, ny } = toN(p.px, p.py)
                    const isHl = p.id === hlId, isHov = hoveredPt !== null && (hoveredPt as ProjectedPoint).id === p.id
                    const col = isHl ? VIOLET : genreColor(p.genres?.[0] ?? null)
                    const normD = Math.min(1, p.distance / (maxD || 1))
                    const baseR = (7 - normD * 4) / zoom
                    const r = isHov ? baseR * 1.9 : isHl ? baseR * 1.4 : baseR
                    const baseOp = 0.55 + (1 - normD) * 0.40
                    const opacity = isHov ? 1.0 : isHl ? 0.92 : baseOp
                    if (isHov) {
                        ctx.beginPath(); ctx.arc(nx, ny, r * 2.2, 0, Math.PI * 2)
                        ctx.fillStyle = col + '22'; ctx.fill()
                        ctx.beginPath(); ctx.arc(nx, ny, r * 1.5, 0, Math.PI * 2)
                        ctx.fillStyle = col + '44'; ctx.fill()
                        ctx.shadowColor = col; ctx.shadowBlur = 18 / zoom
                    } else if (hoveredPt) { ctx.globalAlpha = 0.3 }
                    ctx.beginPath(); ctx.arc(nx, ny, r, 0, Math.PI * 2)
                    ctx.fillStyle = col + Math.round(opacity * 255).toString(16).padStart(2, '0')
                    ctx.fill(); ctx.shadowBlur = 0; ctx.globalAlpha = 1
                })
                const pulse = Math.sin(ts * 0.0022) * 0.5 + 0.5
                ;[28, 18].forEach((r, i) => {
                    ctx.beginPath(); ctx.arc(cx, cy, (r + pulse * 6) / zoom, 0, Math.PI * 2)
                    ctx.fillStyle = `rgba(0,255,231,${[0.04, 0.09][i] + pulse * 0.04})`; ctx.fill()
                })
                ctx.shadowColor = TEAL; ctx.shadowBlur = (16 + pulse * 10) / zoom
                ctx.beginPath(); ctx.arc(cx, cy, 9 / zoom, 0, Math.PI * 2)
                ctx.fillStyle = TEAL; ctx.fill(); ctx.shadowBlur = 0
                ctx.font = `bold ${11 / zoom}px ${MONO}`; ctx.textAlign = 'center'
                ctx.fillStyle = TEAL; ctx.shadowColor = BG; ctx.shadowBlur = 6 / zoom
                ctx.fillText(fl.length > 20 ? fl.slice(0, 18) + '…' : fl, cx, cy - 17 / zoom)
                ctx.shadowBlur = 0
                ctx.restore(); ctx.restore()
                ctx.save(); ctx.scale(dpr, dpr)
                if (hoveredPt) {
                    const hp = hoveredPt as ProjectedPoint
                    const col = hp.id === hlId ? VIOLET : genreColor(hp.genres?.[0] ?? null)
                    const mx2 = mouse!.x, my2 = mouse!.y
                    const cw = 190, ch = 58
                    const cx2 = Math.min(W - cw - 8, Math.max(8, mx2 + 14))
                    const cy2 = my2 - ch - 10 < 8 ? my2 + 14 : my2 - ch - 10
                    ctx.fillStyle = 'rgba(5,3,9,0.88)'; ctx.fillRect(cx2, cy2, cw, ch)
                    ctx.strokeStyle = col + '55'; ctx.lineWidth = 1; ctx.strokeRect(cx2, cy2, cw, ch)
                    ctx.fillStyle = col; ctx.fillRect(cx2, cy2, 3, ch)
                    ctx.fillStyle = FG; ctx.font = `600 11px ${SANS}`; ctx.textAlign = 'left'
                    ctx.fillText(hp.artist.length > 22 ? hp.artist.slice(0, 20) + '…' : hp.artist, cx2 + 10, cy2 + 18)
                    ctx.fillStyle = FG3; ctx.font = `10px ${SANS}`
                    ctx.fillText(hp.title?.length > 24 ? hp.title.slice(0, 22) + '…' : (hp.title ?? ''), cx2 + 10, cy2 + 33)
                    ctx.fillStyle = col; ctx.font = `9px ${MONO}`
                    ctx.fillText(soundSimilarity(hp.distance), cx2 + 10, cy2 + 48)
                    if (hp.genres?.[0]) {
                        const gw = ctx.measureText(hp.genres[0]).width + 14
                        ctx.fillStyle = col + '22'; ctx.fillRect(cx2 + cw - gw - 8, cy2 + 38, gw, 14)
                        ctx.fillStyle = col; ctx.font = `8px ${MONO}`; ctx.textAlign = 'right'
                        ctx.fillText(hp.genres[0], cx2 + cw - 10, cy2 + 48)
                    }
                }
                ctx.textAlign = 'left'; ctx.font = `9px ${MONO}`
                ctx.fillStyle = 'rgba(255,255,255,0.08)'
                ctx.fillText('hover to explore · scroll to zoom · drag to pan', 12, H - 12)
                ctx.restore()
            }
            rafRef.current = requestAnimationFrame(draw)
        }

        const handleWheel = (e: WheelEvent) => {
            e.preventDefault(); e.stopPropagation()
            const rect = canvas.getBoundingClientRect()
            const mx = e.clientX - rect.left, my = e.clientY - rect.top
            const { ox, oy, zoom } = viewRef.current
            const nz = Math.max(0.25, Math.min(12, zoom * (e.deltaY > 0 ? 0.82 : 1.22)))
            viewRef.current = { ox: mx - (mx - ox) * (nz / zoom), oy: my - (my - oy) * (nz / zoom), zoom: nz }
        }
        canvas.addEventListener('wheel', handleWheel, { passive: false })
        rafRef.current = requestAnimationFrame(draw)
        return () => { running = false; cancelAnimationFrame(rafRef.current); canvas.removeEventListener('wheel', handleWheel) }
    }, [])

    return (
        <canvas ref={canvasRef} onPointerDown={onPointerDown} onPointerMove={onPointerMove}
            onPointerUp={onPointerUp} onPointerLeave={onPointerLeave}
            style={{ display: 'block', width: '100%', height: '100%', cursor, touchAction: 'none' }}
            aria-label={focalAttitude ? 'Kernel space' : 'Sound neighbourhood'}
        />
    )
}

// ── Audio preview hook ────────────────────────────────────────────────────────

function useAudioPreview(previewUrl: string | null) {
    const audioRef = useRef<HTMLAudioElement | null>(null)
    const [playing, setPlaying]   = useState(false)
    const [progress, setProgress] = useState(0)
    useEffect(() => { audioRef.current?.pause(); audioRef.current = null; setPlaying(false); setProgress(0) }, [previewUrl])
    useEffect(() => () => { audioRef.current?.pause() }, [])
    const toggle = useCallback(() => {
        if (!previewUrl) return
        if (!audioRef.current) {
            const a = new Audio(previewUrl)
            a.addEventListener('timeupdate', () => setProgress(a.currentTime / (a.duration || 30)))
            a.addEventListener('ended', () => { setPlaying(false); setProgress(0) })
            audioRef.current = a
        }
        if (playing) { audioRef.current.pause(); setPlaying(false) }
        else { audioRef.current.play(); setPlaying(true) }
    }, [previewUrl, playing])
    return { playing, progress, toggle }
}

// ── Article state ─────────────────────────────────────────────────────────────

interface ArticleState {
    focal: TrackNeighborData; nbrs: TrackNeighborData[]
    pts: ProjectedPoint[]; metrics: NeighborhoodMetrics; query: string
}

interface Props {
    initialQuery?:    string
    onQueryConsumed?: () => void
    kernelState?:     KernelState
    playHistory?:     TrackNeighborData[]
    onPlayTrack?:     (track: TrackNeighborData, previewUrl?: string) => void
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

export function TrackWikiView({ initialQuery, onQueryConsumed, kernelState, playHistory, onPlayTrack }: Props) {
    const [query,    setQuery]    = useState('')
    const [loading,  setLoading]  = useState(false)
    const [error,    setError]    = useState<string | null>(null)
    const [article,  setArticle]  = useState<ArticleState | null>(null)
    const [navStack, setNavStack] = useState<ArticleState[]>([])

    const [compareQuery,   setCompareQuery]   = useState('')
    const [compareLoading, setCompareLoading] = useState(false)
    const [compareError,   setCompareError]   = useState<string | null>(null)
    const [compareArticle, setCompareArticle] = useState<ArticleState | null>(null)
    const [compareOpen,    setCompareOpen]    = useState(false)

    const loadArticle = useCallback(async (q: string, embOverride?: Float32Array) => {
        const t = q.trim(); if (!t) return null
        const emb  = embOverride ?? await apiEmbed(t)
        const hits = await apiSearchVector(emb, N_NEIGHBORS + 1)
        if (!hits.length) throw new Error('Track not found. Try "Artist – Title".')
        const focal = toNeighborData(hits[0], 0)
        const nbrs  = hits.slice(1).filter(h => h.id !== hits[0].id).slice(0, N_NEIGHBORS).map(h => toNeighborData(h, Math.sqrt(h.distance)))
        const { points, metrics } = buildNeighborhood(focal, nbrs)
        return { focal, nbrs, pts: points, metrics, query: t } as ArticleState
    }, [])

    const runSearch = useCallback(async (q: string) => {
        setLoading(true); setError(null); setNavStack([])
        setCompareArticle(null); setCompareOpen(false); setCompareQuery('')
        try { const a = await loadArticle(q); if (a) { setArticle(a); setQuery(q) } }
        catch (e: any) { setError(e.message) }
        finally { setLoading(false) }
    }, [loadArticle])

    const navigateTo = useCallback(async (track: TrackNeighborData) => {
        if (article) setNavStack(s => [...s, article])
        setLoading(true); setError(null)
        const q = `${track.artist} – ${track.title}`; setQuery(q)
        try { const a = await loadArticle(q, track.embedding); if (a) setArticle(a) }
        catch (e: any) { setError(e.message) }
        finally { setLoading(false) }
    }, [article, loadArticle])

    const navigateBack = useCallback(() => {
        const prev = navStack[navStack.length - 1]; if (!prev) return
        setNavStack(s => s.slice(0, -1)); setArticle(prev); setQuery(prev.query)
    }, [navStack])

    const runCompare = useCallback(async () => {
        if (!compareQuery.trim()) return
        setCompareLoading(true); setCompareError(null)
        try { const a = await loadArticle(compareQuery); if (a) setCompareArticle(a) }
        catch (e: any) { setCompareError(e.message) }
        finally { setCompareLoading(false) }
    }, [compareQuery, loadArticle])

    useEffect(() => {
        if (!initialQuery) return
        setQuery(initialQuery); runSearch(initialQuery); onQueryConsumed?.()
    }, [initialQuery])

    // ── External data ─────────────────────────────────────────────────────────
    const itunes   = useItunesData(article?.focal.artist ?? '', article?.focal.title ?? '')
    const mbTrack  = useMBRecording(article?.focal.artist ?? '', article?.focal.title ?? '')
    const mbArtist = useMBArtist(article?.focal.artist ?? '')
    const wiki     = useWikipediaData(article?.focal.artist ?? '', article?.focal.title ?? '')
    const preview  = useAudioPreview(itunes?.previewUrl ?? null)

    // ── Derived ───────────────────────────────────────────────────────────────
    const attitude = useMemo(() =>
        article && kernelState ? computeAttitude(article.focal.embedding, kernelState) : null,
        [article, kernelState])

    const attitude2 = useMemo(() =>
        compareArticle && kernelState ? computeAttitude(compareArticle.focal.embedding, kernelState) : null,
        [compareArticle, kernelState])

    const historyPoints = useMemo((): HistoryPoint[] => {
        if (!kernelState || !playHistory?.length) return []
        return playHistory.slice(0, 30).map(t => {
            const { x, y } = projectToKernelSpace(t.embedding, kernelState.mu, kernelState.velocity, kernelState.sigma)
            return { x, y, label: t.artist, genre: t.genres[0] ?? null }
        })
    }, [playHistory, kernelState])

    const soundsLike = useMemo(() =>
        article ? article.pts.filter(p => !p.isFocal).sort((a, b) => a.distance - b.distance) : [],
        [article])

    const crowding = useMemo(() => article ? crowdingLabel(article.pts) : null, [article])

    const compareHighlightId = useMemo(() => {
        if (!compareArticle || !article) return undefined
        return article.pts.find(p =>
            p.artist.toLowerCase() === compareArticle.focal.artist.toLowerCase() &&
            p.title?.toLowerCase() === compareArticle.focal.title?.toLowerCase()
        )?.id
    }, [compareArticle, article])

    const tagDiff = useMemo(() => {
        if (!compareArticle || !article) return null
        const diff = <T extends string>(a: T[], b: T[]) => {
            const bs = new Set(b.map(x => x.toLowerCase()))
            const as_ = new Set(a.map(x => x.toLowerCase()))
            return { shared: a.filter(x => bs.has(x.toLowerCase())), onlyA: a.filter(x => !bs.has(x.toLowerCase())), onlyB: b.filter(x => !as_.has(x.toLowerCase())) }
        }
        return {
            genres:   diff(article.focal.genres,   compareArticle.focal.genres),
            moods:    diff(article.focal.moods,     compareArticle.focal.moods),
            themes:   diff(article.focal.themes,    compareArticle.focal.themes),
            contexts: diff(article.focal.contexts,  compareArticle.focal.contexts),
        }
    }, [article, compareArticle])

    const compareDistance = useMemo(() => {
        if (!article || !compareArticle) return null
        const a = article.focal.embedding, b = compareArticle.focal.embedding
        const n = Math.min(a.length, b.length)
        let s = 0; for (let i = 0; i < n; i++) { const d = a[i] - b[i]; s += d * d }
        return Math.sqrt(s)
    }, [article, compareArticle])

    const canvasColRef = useRef<HTMLDivElement>(null)
    useEffect(() => {
        const el = canvasColRef.current; if (!el) return
        const stop = (e: WheelEvent) => e.preventDefault()
        el.addEventListener('wheel', stop, { passive: false })
        return () => el.removeEventListener('wheel', stop)
    }, [])

    // ── Merged tags: Fangorn stored + MusicBrainz community ──────────────────
    const allMBTags = useMemo(() => {
        if (!mbTrack?.mbTags.length && !mbArtist?.mbTags.length) return []
        const stored = new Set([
            ...(article?.focal.genres ?? []),
            ...(article?.focal.moods  ?? []),
        ].map(t => t.toLowerCase()))
        return [...new Set([...( mbTrack?.mbTags ?? []), ...(mbArtist?.mbTags ?? [])])]
            .filter(t => !stored.has(t.toLowerCase()))
            .slice(0, 8)
    }, [mbTrack, mbArtist, article])

    // ── Duration: prefer stored, fall back to iTunes, then MusicBrainz ───────
    const displayDuration = useMemo(() => {
        const ms = (article?.focal.durationMs ?? 0) > 0
            ? article!.focal.durationMs
            : itunes?.durationMs ?? null
        if (!ms) return null
        return `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, '0')}`
    }, [article, itunes])

    // ── ISRC: prefer stored, fall back to MusicBrainz ─────────────────────────
    const displayIsrc = article?.focal.isrc || mbTrack?.isrcs[0] || null

    // ── Release date: prefer MusicBrainz (more precise), fall back iTunes ─────
    const displayRelease = useMemo(() => {
        const d = mbTrack?.releaseDate ?? itunes?.releaseDate ?? null
        if (!d) return itunes?.releaseYear ?? null
        return d.slice(0, 4) === (itunes?.releaseYear ?? '') ? d : d   // show full date if available
    }, [mbTrack, itunes])

    // ─────────────────────────────────────────────────────────────────────────
    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: BG, color: FG, fontFamily: SANS, overflow: 'hidden' }}>

            {/* ── Search bar ───────────────────────────────────────────────── */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 16px', height: 52, borderBottom: `3px solid ${ACCENT}`, background: BG1, flexShrink: 0 }}>
                {navStack.length > 0 && (
                    <button onClick={navigateBack} style={{ background: 'none', border: `1px solid ${BORDER2}`, color: FG3, fontSize: 10, padding: '4px 10px', cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: MONO, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                        ← {navStack[navStack.length - 1].focal.artist}
                    </button>
                )}
                <input value={query} onChange={e => setQuery(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && runSearch(query)}
                    placeholder='Artist – Title'
                    style={{ flex: 1, background: 'transparent', border: 'none', borderBottom: `1px solid ${BORDER2}`, color: FG, fontSize: 12, padding: '4px 0', outline: 'none', fontFamily: MONO, letterSpacing: '0.04em' }} />
                <button onClick={() => runSearch(query)} disabled={loading || !query.trim()}
                    style={{ background: loading ? 'transparent' : ACCENT, border: `1px solid ${loading ? BORDER2 : ACCENT}`, color: loading ? FG3 : '#fff', fontSize: 9, fontWeight: 500, letterSpacing: '0.18em', fontFamily: MONO, padding: '6px 14px', cursor: loading ? 'default' : 'pointer', textTransform: 'uppercase', flexShrink: 0 }}>
                    {loading ? '···' : 'OPEN'}
                </button>
                {article && itunes?.previewUrl && (
                    <button onClick={preview.toggle}
                        style={{ background: preview.playing ? ACCENT : 'transparent', border: `1px solid ${preview.playing ? ACCENT : BORDER2}`, color: preview.playing ? '#fff' : FG3, fontSize: 11, padding: '5px 12px', cursor: 'pointer', flexShrink: 0 }}>
                        {preview.playing ? '⏸' : '▶'}
                    </button>
                )}
                {article && onPlayTrack && (
                    <button onClick={() => onPlayTrack(article.focal, itunes?.previewUrl ?? undefined)}
                        style={{ background: 'transparent', border: `1px solid ${BORDER2}`, color: FG3, fontSize: 9, fontFamily: MONO, letterSpacing: '0.12em', textTransform: 'uppercase', padding: '5px 10px', cursor: 'pointer', flexShrink: 0 }}>
                        PLAY
                    </button>
                )}
            </div>

            {preview.playing && (
                <div style={{ height: 2, background: BG2, flexShrink: 0 }}>
                    <div style={{ height: '100%', width: `${preview.progress * 100}%`, background: ACCENT, transition: 'width 0.5s linear' }}/>
                </div>
            )}
            {error && <div style={{ padding: '8px 16px', background: `${ACCENT}12`, color: ACCENT, fontSize: 11, fontFamily: MONO, borderBottom: `1px solid ${ACCENT}30`, flexShrink: 0 }}>{error}</div>}

            {!article && !loading && (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12 }}>
                    <div style={{ fontFamily: DISP, fontSize: 72, color: FG4, letterSpacing: '0.06em', lineHeight: 1 }}>SOND3R</div>
                    <div style={{ fontFamily: MONO, fontSize: 9, color: FG4, letterSpacing: '0.22em', textTransform: 'uppercase' }}>Search a track to open its article</div>
                </div>
            )}
            {loading && (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 14 }}>
                    <div style={{ width: 18, height: 18, border: `1.5px solid ${BG3}`, borderTopColor: ACCENT, borderRadius: '50%', animation: 'wiki-spin 0.65s linear infinite' }}/>
                    <style>{`@keyframes wiki-spin{to{transform:rotate(360deg)}}`}</style>
                    <div style={{ fontFamily: MONO, fontSize: 9, color: FG4, letterSpacing: '0.18em', textTransform: 'uppercase' }}>Loading…</div>
                </div>
            )}

            {article && !loading && (
                <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

                    {/* ═══ COL 1: Article ═════════════════════════════════════ */}
                    <div style={{ width: 320, flexShrink: 0, overflowY: 'auto', borderRight: `1px solid ${BORDER2}`, display: 'flex', flexDirection: 'column', position: 'relative', background: BG }}>

                        {/* Album art */}
                        <div style={{ position: 'relative', width: '100%', aspectRatio: '1', flexShrink: 0, overflow: 'hidden' }}>
                            {itunes?.artworkUrl && (
                                <div style={{ position: 'absolute', inset: 0, backgroundImage: `url(${itunes.artworkUrl})`, backgroundSize: 'cover', backgroundPosition: 'center', filter: 'blur(28px) brightness(0.20) saturate(1.4)', transform: 'scale(1.12)', zIndex: 0 }}/>
                            )}
                            {itunes?.artworkUrl
                                ? <img src={itunes.artworkUrl} alt="" style={{ position: 'relative', zIndex: 1, display: 'block', width: '100%', height: '100%', objectFit: 'cover' }}/>
                                : <div style={{ position: 'relative', zIndex: 1, width: '100%', height: '100%', background: BG2, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <span style={{ fontFamily: DISP, fontSize: 64, color: FG4 }}>{article.focal.title.slice(0, 1)}</span>
                                  </div>
                            }
                            {/* Identity card overlay */}
                            <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 2, padding: '14px 16px 12px', background: 'rgba(5,3,9,0.82)', backdropFilter: 'blur(16px)', borderTop: `1px solid ${GLASS_BD}` }}>
                                <div style={{ fontFamily: DISP, fontSize: 26, letterSpacing: '0.04em', lineHeight: 1.05, color: FG, marginBottom: 2 }}>
                                    {article.focal.title}
                                </div>
                                <div style={{ fontFamily: MONO, fontSize: 10, color: ACCENT, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6 }}>
                                    {article.focal.artist}
                                    {mbArtist?.type && <span style={{ color: FG4, marginLeft: 8 }}>· {mbArtist.type}</span>}
                                </div>
                                {/* Track position + release + duration */}
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px' }}>
                                    {itunes?.albumName && <Meta>{itunes.albumName}</Meta>}
                                    {itunes?.trackNumber && itunes.trackCount && (
                                        <Meta>Track {itunes.trackNumber} of {itunes.trackCount}</Meta>
                                    )}
                                    {displayRelease && <Meta>{displayRelease}</Meta>}
                                    {displayDuration && <Meta>{displayDuration}</Meta>}
                                    {itunes?.primaryGenre && <Meta color={CYAN}>{itunes.primaryGenre}</Meta>}
                                    {itunes?.explicit && <Meta color={YELLOW}>EXPLICIT</Meta>}
                                </div>
                            </div>
                        </div>

                        {/* Article body */}
                        <div style={{ padding: '20px 18px 32px', display: 'flex', flexDirection: 'column', gap: 20 }}>

                            {/* Sound Profile — Fangorn tags */}
                            {(article.focal.genres.length + article.focal.moods.length + article.focal.themes.length + article.focal.contexts.length) > 0 && (
                                <div>
                                    <SectionLabel>Sound Profile</SectionLabel>
                                    {[
                                        { tags: article.focal.genres,   colorFn: (t: string) => genreColor(t) },
                                        { tags: article.focal.moods,    colorFn: () => CYAN   },
                                        { tags: article.focal.themes,   colorFn: () => SUCCESS },
                                        { tags: article.focal.contexts, colorFn: () => YELLOW },
                                    ].filter(r => r.tags.length).map((r, i) => (
                                        <div key={i} style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 4 }}>
                                            {r.tags.map(t => <GlassTag key={t} text={t} color={r.colorFn(t)}/>)}
                                        </div>
                                    ))}
                                    {/* MusicBrainz community tags — only show if they add something new */}
                                    {allMBTags.length > 0 && (
                                        <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
                                            <span style={{ fontFamily: MONO, fontSize: 8, color: FG4, letterSpacing: '0.08em', marginRight: 2 }}>MB</span>
                                            {allMBTags.map(t => <GlassTag key={t} text={t} color={FG4}/>)}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Track Record — ISRC, label, country, MusicBrainz link */}
                            {(displayIsrc || mbTrack?.label || mbTrack?.country || mbTrack?.mbid) && (
                                <div>
                                    <SectionLabel>Track Record</SectionLabel>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                        {displayIsrc && (
                                            <KVRow label="ISRC">
                                                <code style={{ fontFamily: MONO, fontSize: 10, color: FG2, letterSpacing: '0.06em' }}>{displayIsrc}</code>
                                            </KVRow>
                                        )}
                                        {mbTrack?.label && (
                                            <KVRow label="Label">{mbTrack.label}</KVRow>
                                        )}
                                        {mbTrack?.country && (
                                            <KVRow label="Released in">{mbTrack.country}</KVRow>
                                        )}
                                        {mbTrack?.disambig && (
                                            <KVRow label="Note"><em style={{ color: FG4 }}>{mbTrack.disambig}</em></KVRow>
                                        )}
                                        {mbTrack?.mbid && (
                                            <KVRow label="MusicBrainz">
                                                <a href={`https://musicbrainz.org/recording/${mbTrack.mbid}`}
                                                    target="_blank" rel="noopener noreferrer"
                                                    style={{ fontFamily: MONO, fontSize: 9, color: CYAN, textDecoration: 'none', letterSpacing: '0.04em' }}>
                                                    {mbTrack.mbid.slice(0, 8)}… ↗
                                                </a>
                                            </KVRow>
                                        )}
                                        {itunes?.trackUrl && (
                                            <KVRow label="iTunes">
                                                <a href={itunes.trackUrl} target="_blank" rel="noopener noreferrer"
                                                    style={{ fontFamily: MONO, fontSize: 9, color: CYAN, textDecoration: 'none', letterSpacing: '0.04em' }}>
                                                    Open ↗
                                                </a>
                                            </KVRow>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Kernel attitude */}
                            {attitude && (
                                <div>
                                    <SectionLabel>Kernel</SectionLabel>
                                    <div style={{ background: GLASS, border: `1px solid ${GLASS_BD}`, borderLeft: `3px solid ${attitude.color}`, padding: '12px 14px', backdropFilter: 'blur(8px)' }}>
                                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 5 }}>
                                            <span style={{ fontFamily: DISP, fontSize: 22, color: attitude.color, letterSpacing: '0.04em' }}>
                                                {attitude.zone === 'groove' ? 'IN YOUR GROOVE' : attitude.zone === 'familiar' ? 'FAMILIAR' : attitude.zone === 'stretch' ? 'STRETCH' : 'AVERSE'}
                                            </span>
                                            <span style={{ fontFamily: MONO, fontSize: 9, color: attitude.color, opacity: 0.6, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{attitude.direction}</span>
                                        </div>
                                        <div style={{ fontFamily: SANS, fontSize: 11, color: FG2, lineHeight: 1.65, marginBottom: 6 }}>{attitude.label}</div>
                                        <div style={{ fontFamily: MONO, fontSize: 9, color: FG4 }}>
                                            {attitude.distNorm.toFixed(2)}σ · align {attitude.alignment > 0 ? '+' : ''}{attitude.alignment.toFixed(2)}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Compare */}
                            <div>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, paddingBottom: 6, borderBottom: `1px solid ${BORDER2}` }}>
                                    <SectionLabel style={{ marginBottom: 0, paddingBottom: 0, borderBottom: 'none' }}>Compare</SectionLabel>
                                    {compareArticle && (
                                        <button onClick={() => { setCompareArticle(null); setCompareQuery(''); setCompareOpen(false) }}
                                            style={{ background: 'none', border: 'none', color: FG4, fontSize: 10, cursor: 'pointer', fontFamily: MONO }}>clear</button>
                                    )}
                                </div>
                                {!compareOpen && !compareArticle && (
                                    <button onClick={() => setCompareOpen(true)}
                                        style={{ width: '100%', background: GLASS, border: `1px dashed ${GLASS_BD}`, color: FG3, fontSize: 10, padding: '9px', cursor: 'pointer', textAlign: 'left', fontFamily: MONO, letterSpacing: '0.06em' }}>
                                        + compare with another track…
                                    </button>
                                )}
                                {compareOpen && !compareArticle && (
                                    <div style={{ display: 'flex', gap: 6 }}>
                                        <input value={compareQuery} onChange={e => setCompareQuery(e.target.value)}
                                            onKeyDown={e => e.key === 'Enter' && runCompare()}
                                            placeholder='Artist – Title' autoFocus
                                            style={{ flex: 1, background: GLASS, border: `1px solid ${GLASS_BD}`, color: FG, fontSize: 11, padding: '6px 10px', outline: 'none', fontFamily: MONO }} />
                                        <button onClick={runCompare} disabled={compareLoading || !compareQuery.trim()}
                                            style={{ background: VIOLET, border: 'none', color: '#fff', fontSize: 9, fontFamily: MONO, letterSpacing: '0.12em', textTransform: 'uppercase', padding: '6px 10px', cursor: compareLoading ? 'default' : 'pointer' }}>
                                            {compareLoading ? '···' : 'LOAD'}
                                        </button>
                                        <button onClick={() => setCompareOpen(false)}
                                            style={{ background: 'none', border: `1px solid ${BORDER2}`, color: FG4, fontSize: 11, padding: '6px 9px', cursor: 'pointer' }}>✕</button>
                                    </div>
                                )}
                                {compareError && <div style={{ marginTop: 6, fontSize: 10, color: ACCENT, fontFamily: MONO }}>{compareError}</div>}
                                {compareArticle && tagDiff && (
                                    <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 12 }}>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 8, alignItems: 'center' }}>
                                            <div>
                                                <div style={{ fontFamily: MONO, fontSize: 10, fontWeight: 600, color: TEAL }}>{article.focal.artist}</div>
                                                <div style={{ fontFamily: MONO, fontSize: 9, color: FG3 }}>{article.focal.title}</div>
                                                {attitude && <div style={{ fontFamily: MONO, fontSize: 9, color: attitude.color, marginTop: 2 }}>{attitude.zone} · {attitude.direction}</div>}
                                            </div>
                                            <div style={{ textAlign: 'center' }}>
                                                <div style={{ fontFamily: DISP, fontSize: 16, color: FG4, letterSpacing: '0.08em' }}>VS</div>
                                                {compareDistance !== null && (
                                                    <>
                                                        <div style={{ height: 2, width: 48, background: BG3, margin: '4px auto' }}>
                                                            <div style={{ height: '100%', width: `${Math.max(5, (1 - Math.min(1, compareDistance)) * 100)}%`, background: compareDistance < 0.4 ? TEAL : compareDistance < 0.8 ? VIOLET : ACCENT }}/>
                                                        </div>
                                                        <div style={{ fontFamily: MONO, fontSize: 8, color: FG4 }}>d={compareDistance.toFixed(3)}</div>
                                                    </>
                                                )}
                                            </div>
                                            <div style={{ textAlign: 'right' }}>
                                                <div style={{ fontFamily: MONO, fontSize: 10, fontWeight: 600, color: VIOLET }}>{compareArticle.focal.artist}</div>
                                                <div style={{ fontFamily: MONO, fontSize: 9, color: FG3 }}>{compareArticle.focal.title}</div>
                                                {attitude2 && <div style={{ fontFamily: MONO, fontSize: 9, color: attitude2.color, marginTop: 2 }}>{attitude2.zone} · {attitude2.direction}</div>}
                                            </div>
                                        </div>
                                        {(['genres', 'moods', 'themes', 'contexts'] as const).map(key => {
                                            const d = tagDiff[key]
                                            if (!d.shared.length && !d.onlyA.length && !d.onlyB.length) return null
                                            return (
                                                <div key={key}>
                                                    <div style={{ fontFamily: MONO, fontSize: 8, color: FG4, letterSpacing: '0.18em', textTransform: 'uppercase', marginBottom: 5 }}>{key}</div>
                                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                                                        {d.shared.map(t => <GlassTag key={`s-${t}`} text={t} color={key === 'genres' ? genreColor(t) : key === 'moods' ? CYAN : key === 'themes' ? SUCCESS : YELLOW}/>)}
                                                        {d.onlyA.map(t  => <GlassTag key={`a-${t}`} text={`${t} ↖`} color={TEAL}/>)}
                                                        {d.onlyB.map(t  => <GlassTag key={`b-${t}`} text={`↗ ${t}`} color={VIOLET}/>)}
                                                    </div>
                                                </div>
                                            )
                                        })}
                                        <div style={{ display: 'flex', gap: 12, fontFamily: MONO, fontSize: 8, color: FG4 }}>
                                            <span><span style={{ color: FG3 }}>■</span> shared</span>
                                            <span><span style={{ color: TEAL }}>■</span> A only</span>
                                            <span><span style={{ color: VIOLET }}>■</span> B only</span>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* About — wiki extract + artist details from MusicBrainz */}
                            {(wiki?.extract || mbArtist?.area || mbArtist?.country || mbArtist?.beginYear) && (
                                <div>
                                    <SectionLabel>
                                        {wiki?.isTrackPage ? `About "${article.focal.title}"` : `About ${article.focal.artist}`}
                                    </SectionLabel>

                                    {/* MusicBrainz artist metadata */}
                                    {(mbArtist?.area || mbArtist?.country || mbArtist?.beginYear) && (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 10 }}>
                                            {(mbArtist.area || mbArtist.country) && (
                                                <KVRow label="Origin">
                                                    {[mbArtist.area, mbArtist.country].filter(Boolean).join(', ')}
                                                </KVRow>
                                            )}
                                            {mbArtist.beginYear && (
                                                <KVRow label="Active">
                                                    {mbArtist.beginYear}
                                                    {mbArtist.ended && mbArtist.endYear
                                                        ? ` – ${mbArtist.endYear}`
                                                        : mbArtist.beginYear ? ' – present' : ''}
                                                </KVRow>
                                            )}
                                            {mbArtist.disambig && (
                                                <KVRow label="Note"><em style={{ color: FG4 }}>{mbArtist.disambig}</em></KVRow>
                                            )}
                                            {mbArtist.mbid && (
                                                <KVRow label="MusicBrainz">
                                                    <a href={`https://musicbrainz.org/artist/${mbArtist.mbid}`}
                                                        target="_blank" rel="noopener noreferrer"
                                                        style={{ fontFamily: MONO, fontSize: 9, color: CYAN, textDecoration: 'none' }}>
                                                        {mbArtist.mbid.slice(0, 8)}… ↗
                                                    </a>
                                                </KVRow>
                                            )}
                                        </div>
                                    )}

                                    {/* Wikipedia extract */}
                                    {wiki?.extract && (
                                        <>
                                            <div style={{ fontFamily: SANS, fontSize: 11, color: FG3, lineHeight: 1.8, display: '-webkit-box', WebkitLineClamp: 7, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                                                {wiki.extract}
                                            </div>
                                            {wiki.url && (
                                                <a href={wiki.url} target="_blank" rel="noopener noreferrer"
                                                    style={{ display: 'inline-block', marginTop: 6, fontFamily: MONO, fontSize: 8, color: FG4, textDecoration: 'none', letterSpacing: '0.10em', textTransform: 'uppercase' }}>
                                                    Wikipedia →
                                                </a>
                                            )}
                                        </>
                                    )}
                                </div>
                            )}

                        </div>
                    </div>

                    {/* ═══ COL 2: Canvas ══════════════════════════════════════ */}
                    <div ref={canvasColRef} style={{ flex: 1, position: 'relative', overflow: 'hidden', background: BG1 }}>
                        <SpaceCanvas
                            pts={article.pts}
                            focalLabel={article.focal.artist}
                            focalAttitude={attitude ?? undefined}
                            history={historyPoints}
                            hasVelocity={kernelState ? kernelState.velocity.some(v => Math.abs(v) > 1e-8) : false}
                            highlightId={compareHighlightId}
                        />
                        <div style={{ position: 'absolute', top: 12, left: 14, background: 'rgba(5,3,9,0.7)', border: `1px solid ${BORDER2}`, padding: '4px 10px', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', gap: 6 }}>
                            <div style={{ width: 5, height: 5, background: attitude ? TEAL : ACCENT }}/>
                            <span style={{ fontFamily: MONO, fontSize: 8, color: FG3, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
                                {attitude ? 'kernel space' : 'sound neighbourhood'}
                            </span>
                        </div>
                        <div style={{ position: 'absolute', bottom: 10, right: 12, fontFamily: MONO, fontSize: 8, color: FG4, pointerEvents: 'none' }}>
                            scroll to zoom · drag to pan
                        </div>
                        {attitude && (
                            <div style={{ position: 'absolute', bottom: 10, left: 14, background: 'rgba(5,3,9,0.72)', border: `1px solid ${attitude.color}30`, padding: '8px 12px', backdropFilter: 'blur(8px)', maxWidth: 200 }}>
                                <div style={{ fontFamily: DISP, fontSize: 16, color: attitude.color, letterSpacing: '0.04em', marginBottom: 2 }}>
                                    {attitude.zone === 'groove' ? 'IN YOUR GROOVE' : attitude.zone === 'familiar' ? 'FAMILIAR' : attitude.zone === 'stretch' ? 'STRETCH' : 'AVERSE'}
                                </div>
                                <div style={{ fontFamily: MONO, fontSize: 9, color: attitude.color, opacity: 0.65 }}>
                                    {attitude.distNorm.toFixed(2)}σ · {attitude.direction}
                                </div>
                            </div>
                        )}
                        {historyPoints.length > 0 && attitude && (
                            <div style={{ position: 'absolute', top: 12, right: 14, background: 'rgba(5,3,9,0.7)', border: `1px solid ${BORDER2}`, padding: '4px 10px', backdropFilter: 'blur(8px)' }}>
                                <span style={{ fontFamily: MONO, fontSize: 8, color: FG4 }}>{historyPoints.length} in history</span>
                            </div>
                        )}
                    </div>

                    {/* ═══ COL 3: Sounds Like + Stats ════════════════════════ */}
                    <div style={{ width: 256, flexShrink: 0, borderLeft: `1px solid ${BORDER2}`, overflowY: 'auto', background: BG1, display: 'flex', flexDirection: 'column' }}>
                        {crowding && (
                            <div style={{ padding: '16px 16px 14px', borderBottom: `1px solid ${BORDER2}`, background: BG2 }}>
                                <SectionLabel>Neighbourhood</SectionLabel>
                                <div style={{ fontFamily: DISP, fontSize: 20, color: crowding.color, letterSpacing: '0.04em', marginBottom: 3 }}>{crowding.label.toUpperCase()}</div>
                                <div style={{ fontFamily: MONO, fontSize: 9, color: FG4, lineHeight: 1.7 }}>{crowding.detail}</div>
                                {article.metrics.primaryGenre && (
                                    <div style={{ marginTop: 6, fontFamily: MONO, fontSize: 9, color: FG3 }}>
                                        {Math.round(article.metrics.genrePurity * 100)}% in{' '}
                                        <span style={{ color: genreColor(article.metrics.primaryGenre) }}>{article.metrics.primaryGenre}</span>
                                    </div>
                                )}
                            </div>
                        )}
                        {article.metrics.nearestNeighbor && (
                            <div style={{ padding: '12px 16px', borderBottom: `1px solid ${BORDER2}` }}>
                                <SectionLabel>Nearest Match</SectionLabel>
                                <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 600, color: FG, marginBottom: 1 }}>{article.metrics.nearestNeighbor.artist}</div>
                                <div style={{ fontFamily: MONO, fontSize: 10, color: FG3, marginBottom: 4 }}>{article.metrics.nearestNeighbor.title}</div>
                                <div style={{ fontFamily: MONO, fontSize: 9, color: FG4, fontStyle: 'italic' }}>{soundSimilarity(article.metrics.nearestDistance)}</div>
                            </div>
                        )}
                        <div style={{ padding: '14px 0 0' }}>
                            <div style={{ padding: '0 16px 10px' }}><SectionLabel>Sounds Like</SectionLabel></div>
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                {soundsLike.slice(0, 20).map((p, i) => {
                                    const col = genreColor(p.genres?.[0] ?? null)
                                    const isCompare = p.id === compareHighlightId
                                    return (
                                        <div key={p.id} onClick={() => navigateTo(p as any)}
                                            style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 16px', background: isCompare ? `${VIOLET}10` : 'transparent', borderLeft: isCompare ? `3px solid ${VIOLET}` : '3px solid transparent', cursor: 'pointer', transition: 'background 0.08s' }}
                                            onMouseEnter={e => { if (!isCompare) (e.currentTarget as HTMLElement).style.background = GLASS }}
                                            onMouseLeave={e => { if (!isCompare) (e.currentTarget as HTMLElement).style.background = 'transparent' }}>
                                            <span style={{ fontFamily: MONO, fontSize: 9, color: FG4, width: 16, textAlign: 'right', flexShrink: 0 }}>{i + 1}</span>
                                            <div style={{ width: 5, height: 5, background: isCompare ? VIOLET : col, flexShrink: 0 }}/>
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ fontFamily: MONO, fontSize: 10, fontWeight: 600, color: isCompare ? VIOLET : FG, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{p.artist}</div>
                                                <div style={{ fontFamily: MONO, fontSize: 9, color: FG4, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{p.title}</div>
                                            </div>
                                            <span style={{ fontFamily: MONO, fontSize: 8, color: FG4, flexShrink: 0 }}>{soundSimilarity(p.distance).split(' ')[0]}</span>
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionLabel({ children, style }: { children: ReactNode; style?: React.CSSProperties }) {
    return (
        <div style={{ fontFamily: MONO, fontSize: 8, fontWeight: 500, letterSpacing: '0.22em', textTransform: 'uppercase', color: FG4, marginBottom: 10, paddingBottom: 6, borderBottom: `1px solid ${BORDER2}`, ...style }}>
            {children}
        </div>
    )
}

const WikiLabel = SectionLabel
const InfoLabel = SectionLabel

function GlassTag({ text, color }: { text: string; color: string }) {
    return (
        <span style={{ fontFamily: MONO, fontSize: 9, fontWeight: 500, letterSpacing: '0.10em', textTransform: 'uppercase', color, padding: '3px 8px', background: `${color}14`, border: `1px solid ${color}35` }}>
            {text}
        </span>
    )
}

const Tag = GlassTag

/** Inline metadata label — used in the identity card */
function Meta({ children, color = FG4 }: { children: ReactNode; color?: string }) {
    return (
        <span style={{ fontFamily: MONO, fontSize: 9, color, letterSpacing: '0.04em' }}>
            {children}
        </span>
    )
}

/** Key-value row — used in Track Record and About sections */
function KVRow({ label, children }: { label: string; children: ReactNode }) {
    return (
        <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
            <span style={{ fontFamily: MONO, fontSize: 8, letterSpacing: '0.12em', textTransform: 'uppercase', color: FG4, width: 80, flexShrink: 0 }}>
                {label}
            </span>
            <span style={{ fontFamily: MONO, fontSize: 10, color: FG2, flex: 1 }}>
                {children}
            </span>
        </div>
    )
}