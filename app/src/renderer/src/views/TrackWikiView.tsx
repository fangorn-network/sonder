/**
 * TrackWikiView.tsx — v5  (Wikipedia-style redesign; drop-in replacement)
 *
 * DROP-IN: same filename, same export name (TrackWikiView), same import path,
 * same props as v4 (playHistory is accepted but no longer used). Overwrite the
 * old file with this one — no other code changes needed in the app shell.
 *
 * A music encyclopedia, not a dashboard. Discovery works the way Wikipedia
 * works: you SEARCH, you land on a RESULTS page (not a random jump), you open
 * an ARTICLE, and you wander by following LINKS — related tracks, the artist,
 * the genre, the label. A breadcrumb trail remembers your path.
 *
 * WHAT CHANGED FROM v4
 *   • Search no longer auto-jumps to one nearest vector. It returns a grouped,
 *     refinable results page. "the beatles" → every Beatles track we have.
 *   • Two retrieval modes, because known-item and vibe search are different jobs:
 *       lexical  — text match on artist/title           (search bar default)
 *       semantic — embedding nearest-neighbour (vibe)    (genre/mood chips)
 *   • The full-bleed particle canvas is gone as the default surface. The kernel
 *     survives as (a) a compact "attitude" line and (b) an OPT-IN, navigable
 *     mini sound-map you can expand inline.
 *   • Artist articles exist — a real home for "all of them".
 *   • Breadcrumb trail + back for the rabbit-hole feel.
 *   • Heavy compare panel removed (can return as its own view).
 *
 * BACKEND CONTRACT
 *   Existing (unchanged):
 *     POST /embed          { text }                        -> { embedding:number[] }
 *     POST /search/vector  { embedding, n_results }        -> { results: RawChromaHit[] }
 *   NEW — required for good lexical search (degrades to semantic if absent):
 *     POST /search/text    { q, limit }                    -> { results: TextHit[] }
 *       TextHit mirrors the Chroma metadata fields:
 *         { id, byArtist, title, isrcCode?, durationMs?,
 *           genres?, moods?, themes?, contexts?, embedding? }
 *       Rank by lexical relevance on byArtist + title (e.g. Chroma `where`
 *       contains-match, or a small FTS index). `embedding` is optional; if
 *       omitted, the article view resolves it via /embed + /search/vector.
 *
 * KERNEL SPACE MATH (unchanged, used only for the attitude badge + mini-map)
 *   x = dot(e − μ, v̂) / σ      — alignment with kernel momentum
 *   y = dot(e − μ, v̂⊥) / σ     — perpendicular variation
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
} from '../kernel/neighborhoodAnalysis'

// Open a URL in the OS default browser via the preload bridge
function openExternal(url: string) {
    ;(window as any).electronAPI?.openExternal(url)
}

// ── Config — SOND3R design tokens ────────────────────────────────────────────

const BASE_URL    = 'http://localhost:8080'
const N_NEIGHBORS = 40
const N_RESULTS   = 60
const MB_UA       = 'SOND3R/1.0.0 (https://fangorn.network)'

const BG      = '#f7f4ef'
const BG1     = '#f0ece5'
const BG2     = '#e8e3da'
const BG3     = '#ddd8ce'
const FG      = '#1a1714'
const FG2     = '#4a4440'
const FG3     = '#766e66'
const FG4     = '#a09890'
const ACCENT  = '#b83030'
const CYAN    = '#2878b0'
const TEAL    = '#207860'
const SUCCESS = '#2a7a48'
const YELLOW  = '#a07828'
const VIOLET  = '#5a3d9e'
const AMBER   = '#9a6820'
const LINK    = '#2a5ea8'          // Wikipedia-blue for light backgrounds

const BORDER   = 'rgba(0,0,0,0.12)'
const BORDER2  = 'rgba(0,0,0,0.07)'
const DIM      = 'rgba(0,0,0,0.35)'
const DIMMER   = 'rgba(0,0,0,0.20)'
const GLASS    = 'rgba(0,0,0,0.03)'
const GLASS_BD = 'rgba(0,0,0,0.07)'

// Canvas-specific dark colours for MiniSoundMap (always dark regardless of page theme)
const CANVAS_BG  = '#111110'
const CANVAS_BG2 = '#1e1d1a'
const CANVAS_FG  = '#e8e4d9'

const MONO  = 'var(--font-mono,"Fragment Mono","DM Mono",monospace)'
const SANS  = 'var(--font-body,"Geist","Inter",sans-serif)'
const DISP  = 'var(--font-display,"Bebas Neue",sans-serif)'

const READING_MAX = 720            // comfortable reading measure for the article body

// ─────────────────────────────────────────────────────────────────────────────
// External API types + fetchers (iTunes / MusicBrainz / Wikipedia) — kept as-is
// ─────────────────────────────────────────────────────────────────────────────

interface ItunesData {
    artworkUrl: string | null; previewUrl: string | null; albumName: string | null
    releaseYear: string | null; releaseDate: string | null; explicit: boolean
    trackNumber: number | null; trackCount: number | null
    primaryGenre: string | null; durationMs: number | null
    artistUrl: string | null; trackUrl: string | null
}
interface MBRecording {
    mbid: string | null; isrcs: string[]; label: string | null
    country: string | null; releaseDate: string | null; mbTags: string[]; disambig: string | null
}
interface MBArtist {
    mbid: string | null; country: string | null; area: string | null
    beginYear: string | null; endYear: string | null; ended: boolean
    type: string | null; mbTags: string[]; disambig: string | null
}
interface WikiData {
    extract: string | null; thumbnail: string | null; url: string | null; isTrackPage: boolean
}

async function fetchItunes(artist: string, title: string): Promise<ItunesData> {
    const empty: ItunesData = {
        artworkUrl: null, previewUrl: null, albumName: null, releaseYear: null,
        releaseDate: null, explicit: false, trackNumber: null, trackCount: null,
        primaryGenre: null, durationMs: null, artistUrl: null, trackUrl: null,
    }
    try {
        const q = encodeURIComponent(`${artist} ${title}`)
        const res = await fetch(`https://itunes.apple.com/search?term=${q}&media=music&entity=song&limit=5`)
        const json = await res.json()
        const results: any[] = json.results ?? []
        const hit = results.find(r =>
            r.trackName?.toLowerCase() === title.toLowerCase() &&
            r.artistName?.toLowerCase() === artist.toLowerCase()
        ) ?? results.find(r => r.trackName?.toLowerCase().includes(title.toLowerCase())) ?? results[0]
        if (!hit) return empty
        return {
            artworkUrl: hit.artworkUrl100?.replace('100x100bb', '600x600bb') ?? null,
            previewUrl: hit.previewUrl ?? null,
            albumName: hit.collectionName ?? null,
            releaseYear: hit.releaseDate ? new Date(hit.releaseDate).getFullYear().toString() : null,
            releaseDate: hit.releaseDate ?? null,
            explicit: hit.trackExplicitness === 'explicit',
            trackNumber: hit.trackNumber ?? null,
            trackCount: hit.trackCount ?? null,
            primaryGenre: hit.primaryGenreName ?? null,
            durationMs: hit.trackTimeMillis ?? null,
            artistUrl: hit.artistViewUrl ?? null,
            trackUrl: hit.trackViewUrl ?? null,
        }
    } catch { return empty }
}

async function fetchMBRecording(artist: string, title: string): Promise<MBRecording> {
    const empty: MBRecording = { mbid: null, isrcs: [], label: null, country: null, releaseDate: null, mbTags: [], disambig: null }
    try {
        const q = encodeURIComponent(`recording:"${title}" AND artist:"${artist}"`)
        const res = await fetch(
            `https://musicbrainz.org/ws/2/recording?query=${q}&fmt=json&limit=5&inc=isrcs+releases+tags`,
            { headers: { 'User-Agent': MB_UA, 'Accept': 'application/json' } },
        )
        if (!res.ok) return empty
        const json = await res.json()
        const recs: any[] = json.recordings ?? []
        if (!recs.length) return empty
        const rec = recs.find(r => r['artist-credit']?.[0]?.artist?.name?.toLowerCase() === artist.toLowerCase()) ?? recs[0]
        const releases: any[] = rec.releases ?? []
        releases.sort((a, b) => ((a.date ?? '9999') < (b.date ?? '9999') ? -1 : 1))
        const rel = releases[0]
        const tags: string[] = (rec.tags ?? [])
            .sort((a: any, b: any) => (b.count ?? 0) - (a.count ?? 0)).slice(0, 10).map((t: any) => t.name as string)
        return {
            mbid: rec.id ?? null, isrcs: rec.isrcs ?? [],
            label: rel?.['label-info']?.[0]?.label?.name ?? null,
            country: rel?.country ?? null, releaseDate: rel?.date ?? null,
            mbTags: tags, disambig: rec.disambiguation ?? null,
        }
    } catch { return empty }
}

async function fetchMBArtist(artist: string): Promise<MBArtist> {
    const empty: MBArtist = { mbid: null, country: null, area: null, beginYear: null, endYear: null, ended: false, type: null, mbTags: [], disambig: null }
    try {
        const q = encodeURIComponent(`artist:"${artist}"`)
        const res = await fetch(
            `https://musicbrainz.org/ws/2/artist?query=${q}&fmt=json&limit=3&inc=tags`,
            { headers: { 'User-Agent': MB_UA, 'Accept': 'application/json' } },
        )
        if (!res.ok) return empty
        const json = await res.json()
        const artists: any[] = json.artists ?? []
        if (!artists.length) return empty
        const a = artists.find(x => x.name?.toLowerCase() === artist.toLowerCase()) ?? artists[0]
        const lifeSpan = a['life-span'] ?? {}
        const tags: string[] = (a.tags ?? [])
            .sort((x: any, y: any) => (y.count ?? 0) - (x.count ?? 0)).slice(0, 8).map((t: any) => t.name as string)
        return {
            mbid: a.id ?? null, country: a.country ?? null,
            area: a['begin-area']?.name ?? a.area?.name ?? null,
            beginYear: lifeSpan.begin ? String(lifeSpan.begin).slice(0, 4) : null,
            endYear: lifeSpan.end ? String(lifeSpan.end).slice(0, 4) : null,
            ended: lifeSpan.ended ?? false, type: a.type ?? null, mbTags: tags, disambig: a.disambiguation ?? null,
        }
    } catch { return empty }
}

async function fetchWikipedia(artist: string, title?: string): Promise<WikiData> {
    const empty: WikiData = { extract: null, thumbnail: null, url: null, isTrackPage: false }
    const tryPage = async (term: string, isTrack: boolean): Promise<WikiData | null> => {
        try {
            const res = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(term)}`)
            if (!res.ok) return null
            const json = await res.json()
            if (json.type === 'disambiguation' || !json.extract) return null
            return { extract: json.extract, thumbnail: json.thumbnail?.source ?? null, url: json.content_urls?.desktop?.page ?? null, isTrackPage: isTrack }
        } catch { return null }
    }
    if (title) {
        const trackPage = (await tryPage(`${title} (song)`, true)) ?? (await tryPage(title, true))
        if (trackPage?.extract && trackPage.extract.length > 80) return trackPage
    }
    return (await tryPage(artist, false)) ?? empty
}

// ── Hooks for the external sources ───────────────────────────────────────────

function useItunesData(artist: string, title: string) {
    const [data, setData] = useState<ItunesData | null>(null)
    useEffect(() => {
        if (!artist || !title) { setData(null); return }
        setData(null); fetchItunes(artist, title).then(setData)
    }, [artist, title])
    return data
}
function useMBRecording(artist: string, title: string) {
    const [data, setData] = useState<MBRecording | null>(null)
    useEffect(() => {
        if (!artist || !title) { setData(null); return }
        setData(null)
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
        const t = setTimeout(() => fetchMBArtist(artist).then(setData), 900)
        return () => clearTimeout(t)
    }, [artist])
    return data
}
function useWikipediaData(artist: string, title?: string) {
    const [data, setData] = useState<WikiData | null>(null)
    useEffect(() => {
        if (!artist) { setData(null); return }
        setData(null); fetchWikipedia(artist, title).then(setData)
    }, [artist, title])
    return data
}

function useAudioPreview(previewUrl: string | null) {
    const audioRef = useRef<HTMLAudioElement | null>(null)
    const [playing, setPlaying] = useState(false)
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

// ─────────────────────────────────────────────────────────────────────────────
// Backend API
// ─────────────────────────────────────────────────────────────────────────────

interface RawChromaHit {
    id: string; embedding: number[]; distance: number
    fields?: {
        byArtist?: string; title?: string; isrcCode?: string; durationMs?: number
        genres?: string[]; moods?: string[]; themes?: string[]; contexts?: string[]
    }
}

interface TextHit {
    id: string; byArtist?: string; title?: string; isrcCode?: string; durationMs?: number
    genres?: string[]; moods?: string[]; themes?: string[]; contexts?: string[]
    embedding?: number[]
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

/** Lexical search. Returns whether it fell back to semantic so the UI can say so. */
async function apiSearchText(q: string, limit: number): Promise<{ hits: TextHit[]; degraded: boolean }> {
    try {
        const res = await fetch(`${BASE_URL}/search/text`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ q, limit }),
        })
        if (!res.ok) throw new Error(String(res.status))
        const json = await res.json()
        return { hits: (json.results ?? []) as TextHit[], degraded: false }
    } catch {
        // Graceful degradation: lexical endpoint missing -> semantic nearest-neighbour.
        const emb = await apiEmbed(q)
        const hits = await apiSearchVector(emb, limit)
        return { hits: hits.map(chromaToTextHit), degraded: true }
    }
}

function chromaToTextHit(h: RawChromaHit): TextHit {
    const m = h.fields ?? {}
    return {
        id: h.id, byArtist: m.byArtist, title: m.title, isrcCode: m.isrcCode,
        durationMs: m.durationMs, genres: m.genres, moods: m.moods, themes: m.themes,
        contexts: m.contexts, embedding: h.embedding,
    }
}

function textHitToNeighbor(h: TextHit, distance = 0): TrackNeighborData {
    return {
        id: h.id, artist: h.byArtist ?? 'Unknown', title: h.title ?? h.id,
        isrc: h.isrcCode, durationMs: h.durationMs ?? 0,
        genres: h.genres ?? [], moods: h.moods ?? [], themes: h.themes ?? [], contexts: h.contexts ?? [],
        embedding: new Float32Array(h.embedding ?? []), distance,
    }
}

function chromaToNeighbor(hit: RawChromaHit, dist: number): TrackNeighborData {
    const m = hit.fields ?? {}
    return {
        id: hit.id, artist: m.byArtist ?? 'Unknown', title: m.title ?? hit.id,
        isrc: m.isrcCode, durationMs: m.durationMs ?? 0,
        genres: m.genres ?? [], moods: m.moods ?? [], themes: m.themes ?? [], contexts: m.contexts ?? [],
        embedding: new Float32Array(hit.embedding), distance: dist,
    }
}

// ── Kernel attitude (compact signal only) ────────────────────────────────────

export interface KernelState { mu: Float32Array; velocity: Float32Array; sigma: number }

interface KernelAttitude {
    distNorm: number; alignment: number
    zone: 'groove' | 'familiar' | 'stretch' | 'averse'
    direction: 'toward' | 'adjacent' | 'sideways' | 'against'
    label: string; color: string
}

function projectToKernelSpace(e: Float32Array, mu: Float32Array, velocity: Float32Array, sigma: number) {
    const n = Math.min(e.length, mu.length, velocity.length)
    if (n === 0) return { x: 0, y: 0 }
    let vn2 = 0
    for (let i = 0; i < n; i++) vn2 += velocity[i] ** 2
    const vn = Math.sqrt(vn2)
    if (vn < 1e-8) return { x: 0, y: 0 }
    const diff = new Float32Array(n)
    for (let i = 0; i < n; i++) diff[i] = e[i] - mu[i]
    let x = 0
    for (let i = 0; i < n; i++) x += diff[i] * (velocity[i] / vn)
    const vhat0 = velocity[0] / vn
    const perp = new Float32Array(n)
    perp[0] = 1.0 - vhat0 * (velocity[0] / vn)
    for (let i = 1; i < n; i++) perp[i] = -(vhat0 * (velocity[i] / vn))
    let pn2 = 0
    for (let i = 0; i < n; i++) pn2 += perp[i] ** 2
    let pn = Math.sqrt(pn2)
    if (pn < 0.1) {
        const vh1 = velocity[1] / vn
        perp.fill(0); perp[1] = 1.0 - vh1 * (velocity[1] / vn)
        for (let i = 0; i < n; i++) if (i !== 1) perp[i] = -(vh1 * (velocity[i] / vn))
        pn2 = 0; for (let i = 0; i < n; i++) pn2 += perp[i] ** 2
        pn = Math.sqrt(pn2)
    }
    let y = 0
    if (pn > 1e-8) for (let i = 0; i < n; i++) y += diff[i] * (perp[i] / pn)
    return { x: x / (sigma || 1), y: y / (sigma || 1) }
}

function computeAttitude(e: Float32Array, k: KernelState): KernelAttitude | null {
    if (!e.length) return null
    const { x, y } = projectToKernelSpace(e, k.mu, k.velocity, k.sigma)
    const distNorm = Math.sqrt(x ** 2 + y ** 2)
    const alignment = distNorm > 1e-8 ? x / distNorm : 0
    const zone: KernelAttitude['zone'] =
        distNorm < 0.5 ? 'groove' : distNorm < 1.2 ? 'familiar' : distNorm < 2.5 ? 'stretch' : 'averse'
    const direction: KernelAttitude['direction'] =
        alignment > 0.45 ? 'toward' : alignment > 0.1 ? 'adjacent' : alignment > -0.2 ? 'sideways' : 'against'
    const L: Record<string, [string, string]> = {
        'groove-toward': ['exactly where your taste is heading', TEAL],
        'groove-adjacent': ['deep in your current groove', TEAL],
        'groove-sideways': ['squarely in your comfort zone', TEAL],
        'groove-against': ['home turf, pulling against your momentum', SUCCESS],
        'familiar-toward': ['within range and moving your way', SUCCESS],
        'familiar-adjacent': ['inside your taste window', SUCCESS],
        'familiar-sideways': ['adjacent — the kernel is neutral here', DIM],
        'familiar-against': ['known territory, wrong direction', AMBER],
        'stretch-toward': ['an ambitious reach, but headed this way', VIOLET],
        'stretch-adjacent': ['a stretch with a compatible direction', VIOLET],
        'stretch-sideways': ['outside your comfort zone, perpendicular', DIMMER],
        'stretch-against': ['the kernel would resist this', AMBER],
        'averse-toward': ['far out — but you are reaching this way', VIOLET],
        'averse-adjacent': ['the kernel runs cold on this', ACCENT],
        'averse-sideways': ['far outside your groove', ACCENT],
        'averse-against': ['the kernel actively resists this', ACCENT],
    }
    const [label, color] = L[`${zone}-${direction}`] ?? ['unknown', DIMMER]
    return { distNorm, alignment, zone, direction, label, color }
}

const ZONE_TITLE: Record<KernelAttitude['zone'], string> = {
    groove: 'In your groove', familiar: 'Familiar', stretch: 'A stretch', averse: 'Against the grain',
}

// ─────────────────────────────────────────────────────────────────────────────
// Navigation model — Wikipedia-style view stack
// ─────────────────────────────────────────────────────────────────────────────

export type SearchMode = 'lexical' | 'semantic'

export type View =
    | { kind: 'home' }
    | { kind: 'results'; query: string; mode: SearchMode }
    | { kind: 'track'; artist: string; title: string; embedding?: Float32Array }
    | { kind: 'artist'; name: string }

export function viewLabel(v: View): string {
    switch (v.kind) {
        case 'home': return 'Home'
        case 'results': return `”${v.query}”`
        case 'track': return v.title
        case 'artist': return v.name
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Atoms
// ─────────────────────────────────────────────────────────────────────────────

function WikiLink({ children, onClick, color = LINK, weight = 400, size }: {
    children: ReactNode; onClick: () => void; color?: string; weight?: number; size?: number
}) {
    const [hover, setHover] = useState(false)
    return (
        <span
            role="link" tabIndex={0}
            onClick={onClick}
            onKeyDown={e => { if (e.key === 'Enter') onClick() }}
            onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
            style={{
                color, cursor: 'pointer', fontWeight: weight, fontSize: size,
                textDecoration: hover ? 'underline' : 'none', textUnderlineOffset: 3,
                textDecorationColor: `${color}99`, transition: 'color .1s',
                opacity: hover ? 0.85 : 1,
            }}
        >
            {children}
        </span>
    )
}

function SectionLabel({ children, style }: { children: ReactNode; style?: React.CSSProperties }) {
    return (
        <div style={{
            fontFamily: MONO, fontSize: 8, fontWeight: 500, letterSpacing: '0.22em',
            textTransform: 'uppercase', color: FG4, marginBottom: 10, paddingBottom: 6,
            borderBottom: `1px solid ${BORDER2}`, ...style,
        }}>
            {children}
        </div>
    )
}

/** A genre/mood/theme/context chip that is itself a (semantic) search link. */
function TagLink({ text, color, onClick }: { text: string; color: string; onClick: () => void }) {
    const [hover, setHover] = useState(false)
    return (
        <span
            role="link" tabIndex={0} onClick={onClick}
            onKeyDown={e => { if (e.key === 'Enter') onClick() }}
            onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
            style={{
                fontFamily: MONO, fontSize: 9, fontWeight: 500, letterSpacing: '0.10em',
                textTransform: 'uppercase', color, padding: '3px 8px', cursor: 'pointer',
                background: hover ? `${color}26` : `${color}12`,
                border: `1px solid ${color}${hover ? '66' : '33'}`, transition: 'all .1s',
            }}
        >
            {text}
        </span>
    )
}

function KVRow({ label, children }: { label: string; children: ReactNode }) {
    return (
        <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', padding: '5px 0', borderBottom: `1px solid ${BORDER2}` }}>
            <span style={{ fontFamily: MONO, fontSize: 8, letterSpacing: '0.12em', textTransform: 'uppercase', color: FG4, width: 78, flexShrink: 0 }}>{label}</span>
            <span style={{ fontFamily: MONO, fontSize: 10, color: FG2, flex: 1, lineHeight: 1.5 }}>{children}</span>
        </div>
    )
}

function Spinner({ label = 'Loading' }: { label?: string }) {
    return (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 14 }}>
            <div style={{ width: 18, height: 18, border: `1.5px solid ${BG3}`, borderTopColor: ACCENT, borderRadius: '50%', animation: 'wiki-spin .65s linear infinite' }} />
            <style>{`@keyframes wiki-spin{to{transform:rotate(360deg)}}`}</style>
            <div style={{ fontFamily: MONO, fontSize: 9, color: FG4, letterSpacing: '0.18em', textTransform: 'uppercase' }}>{label}…</div>
        </div>
    )
}

function fmtDuration(ms: number | null | undefined): string | null {
    if (!ms || ms <= 0) return null
    return `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, '0')}`
}

// ─────────────────────────────────────────────────────────────────────────────
// Search results — the new "see what's available, then refine" experience
// ─────────────────────────────────────────────────────────────────────────────

interface ArtistGroup { artist: string; tracks: TextHit[] }

function groupByArtist(hits: TextHit[]): ArtistGroup[] {
    const map = new Map<string, ArtistGroup>()
    for (const h of hits) {
        const key = (h.byArtist ?? 'Unknown').toLowerCase()
        if (!map.has(key)) map.set(key, { artist: h.byArtist ?? 'Unknown', tracks: [] })
        map.get(key)!.tracks.push(h)
    }
    return [...map.values()].sort((a, b) => b.tracks.length - a.tracks.length || a.artist.localeCompare(b.artist))
}

function deriveGenreFacets(hits: TextHit[]): { genre: string; count: number }[] {
    const counts = new Map<string, number>()
    for (const h of hits) for (const g of h.genres ?? []) counts.set(g, (counts.get(g) ?? 0) + 1)
    return [...counts.entries()].map(([genre, count]) => ({ genre, count }))
        .sort((a, b) => b.count - a.count).slice(0, 12)
}

function ResultsView({ query, mode, onNavigate, onSetMode }: {
    query: string
    mode: SearchMode
    onNavigate: (v: View) => void
    onSetMode: (m: SearchMode) => void
}) {
    const [loading, setLoading] = useState(true)
    const [hits, setHits] = useState<TextHit[]>([])
    const [degraded, setDegraded] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [activeGenre, setActiveGenre] = useState<string | null>(null)

    useEffect(() => {
        let live = true
        setLoading(true); setError(null); setActiveGenre(null)
        const run = async () => {
            try {
                if (mode === 'lexical') {
                    const { hits, degraded } = await apiSearchText(query, N_RESULTS)
                    if (!live) return
                    setHits(hits); setDegraded(degraded)
                } else {
                    const emb = await apiEmbed(query)
                    const raw = await apiSearchVector(emb, N_RESULTS)
                    if (!live) return
                    setHits(raw.map(chromaToTextHit)); setDegraded(false)
                }
            } catch (e: any) {
                if (live) setError(e?.message ?? 'Search failed')
            } finally {
                if (live) setLoading(false)
            }
        }
        run()
        return () => { live = false }
    }, [query, mode])

    const filtered = useMemo(
        () => (activeGenre ? hits.filter(h => (h.genres ?? []).includes(activeGenre)) : hits),
        [hits, activeGenre],
    )
    const groups = useMemo(() => groupByArtist(filtered), [filtered])
    const facets = useMemo(() => deriveGenreFacets(hits), [hits])

    // Does the query name an artist that's actually in the catalog?
    const featuredArtist = useMemo(() => {
        const norm = query.trim().toLowerCase()
        if (mode !== 'lexical' || !norm) return null
        const g = groups.find(g => g.artist.toLowerCase() === norm)
            ?? groups.find(g => g.artist.toLowerCase().includes(norm) && g.tracks.length >= 3)
        return g ?? null
    }, [groups, query, mode])

    if (loading) return <Spinner label={mode === 'lexical' ? 'Searching the catalog' : 'Finding the vibe'} />

    return (
        <div style={{ flex: 1, overflowY: 'auto', background: BG }}>
            <div style={{ maxWidth: 860, margin: '0 auto', padding: '28px 28px 80px' }}>

                {/* Header */}
                <div style={{ marginBottom: 6, fontFamily: MONO, fontSize: 9, color: FG4, letterSpacing: '0.18em', textTransform: 'uppercase' }}>
                    {mode === 'lexical' ? 'Search results' : 'Sounds like'}
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 4 }}>
                    <h1 style={{ fontFamily: SANS, fontSize: 30, fontWeight: 700, color: FG, letterSpacing: '-0.01em', lineHeight: 1.1, margin: 0 }}>{query}</h1>
                    {/* mode toggle — lexical vs semantic */}
                    <div style={{ display: 'flex', border: `1px solid ${BORDER}`, fontFamily: MONO, fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                        {(['lexical', 'semantic'] as SearchMode[]).map(m => (
                            <button key={m} onClick={() => onSetMode(m)}
                                style={{
                                    background: mode === m ? ACCENT : 'transparent', color: mode === m ? '#fff' : FG3,
                                    border: 'none', padding: '6px 12px', cursor: 'pointer',
                                }}>
                                {m === 'lexical' ? 'matching text' : 'sounds like'}
                            </button>
                        ))}
                    </div>
                </div>
                <div style={{ fontFamily: MONO, fontSize: 10, color: FG3, marginBottom: 18 }}>
                    {filtered.length} {filtered.length === 1 ? 'track' : 'tracks'} · {groups.length} {groups.length === 1 ? 'artist' : 'artists'}
                    {activeGenre && <> · filtered to <span style={{ color: genreColor(activeGenre) }}>{activeGenre}</span></>}
                </div>

                {degraded && (
                    <div style={{ marginBottom: 18, padding: '8px 12px', background: `${AMBER}10`, border: `1px solid ${AMBER}30`, fontFamily: MONO, fontSize: 10, color: AMBER, lineHeight: 1.6 }}>
                        Text search endpoint unavailable — showing semantic matches instead. Wire up <code>POST /search/text</code> for exact artist/title lookups.
                    </div>
                )}
                {error && (
                    <div style={{ marginBottom: 18, padding: '8px 12px', background: `${ACCENT}12`, border: `1px solid ${ACCENT}30`, fontFamily: MONO, fontSize: 11, color: ACCENT }}>{error}</div>
                )}

                {/* Genre facets — refine */}
                {facets.length > 0 && (
                    <div style={{ marginBottom: 24, display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                        <span style={{ fontFamily: MONO, fontSize: 8, color: FG4, letterSpacing: '0.18em', textTransform: 'uppercase', marginRight: 4 }}>refine</span>
                        {activeGenre && (
                            <span onClick={() => setActiveGenre(null)} role="button" tabIndex={0}
                                style={{ fontFamily: MONO, fontSize: 9, color: FG3, padding: '3px 8px', border: `1px solid ${BORDER}`, cursor: 'pointer' }}>
                                clear ✕
                            </span>
                        )}
                        {facets.map(({ genre, count }) => {
                            const on = activeGenre === genre
                            const c = genreColor(genre)
                            return (
                                <span key={genre} role="button" tabIndex={0}
                                    onClick={() => setActiveGenre(on ? null : genre)}
                                    onKeyDown={e => { if (e.key === 'Enter') setActiveGenre(on ? null : genre) }}
                                    style={{
                                        fontFamily: MONO, fontSize: 9, letterSpacing: '0.06em', textTransform: 'uppercase',
                                        color: on ? '#fff' : c, padding: '3px 8px', cursor: 'pointer', transition: 'all .1s',
                                        background: on ? c : `${c}12`, border: `1px solid ${c}${on ? '' : '33'}`,
                                    }}>
                                    {genre} <span style={{ opacity: 0.6 }}>{count}</span>
                                </span>
                            )
                        })}
                    </div>
                )}

                {/* Featured artist card — "all of them" lives here */}
                {featuredArtist && (
                    <div
                        onClick={() => onNavigate({ kind: 'artist', name: featuredArtist.artist })}
                        style={{
                            marginBottom: 24, padding: '16px 18px', cursor: 'pointer',
                            background: `linear-gradient(135deg, ${ACCENT}14, ${VIOLET}0c)`,
                            border: `1px solid ${ACCENT}40`, borderLeft: `3px solid ${ACCENT}`,
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
                        }}>
                        <div>
                            <div style={{ fontFamily: MONO, fontSize: 8, color: ACCENT, letterSpacing: '0.18em', textTransform: 'uppercase', marginBottom: 4 }}>Artist</div>
                            <div style={{ fontFamily: DISP, fontSize: 30, color: FG, letterSpacing: '0.03em', lineHeight: 1 }}>{featuredArtist.artist}</div>
                            <div style={{ fontFamily: MONO, fontSize: 10, color: FG3, marginTop: 4 }}>{featuredArtist.tracks.length} tracks in the catalog</div>
                        </div>
                        <div style={{ fontFamily: MONO, fontSize: 11, color: LINK, whiteSpace: 'nowrap' }}>open artist →</div>
                    </div>
                )}

                {/* Grouped results */}
                {groups.length === 0 && !error && (
                    <div style={{ padding: '60px 0', textAlign: 'center', fontFamily: MONO, fontSize: 11, color: FG4, letterSpacing: '0.06em' }}>
                        Nothing matched. Try a different spelling, or switch to “sounds like”.
                    </div>
                )}
                {groups.map(group => (
                    <ResultGroup key={group.artist} group={group} onNavigate={onNavigate} />
                ))}
            </div>
        </div>
    )
}

function ResultGroup({ group, onNavigate }: { group: ArtistGroup; onNavigate: (v: View) => void }) {
    const many = group.tracks.length > 6
    const [expanded, setExpanded] = useState(false)
    const shown = expanded ? group.tracks : group.tracks.slice(0, 6)
    return (
        <div style={{ marginBottom: 18 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 6, paddingBottom: 6, borderBottom: `1px solid ${BORDER2}` }}>
                <WikiLink onClick={() => onNavigate({ kind: 'artist', name: group.artist })} color={FG} weight={600} size={15}>
                    {group.artist}
                </WikiLink>
                <span style={{ fontFamily: MONO, fontSize: 9, color: FG4 }}>{group.tracks.length} {group.tracks.length === 1 ? 'track' : 'tracks'}</span>
            </div>
            <div>
                {shown.map(t => {
                    const c = genreColor(t.genres?.[0] ?? null)
                    const dur = fmtDuration(t.durationMs)
                    return (
                        <div key={t.id}
                            onClick={() => onNavigate({ kind: 'track', artist: t.byArtist ?? 'Unknown', title: t.title ?? '', embedding: t.embedding ? new Float32Array(t.embedding) : undefined })}
                            style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 8px', cursor: 'pointer', borderRadius: 2, transition: 'background .08s' }}
                            onMouseEnter={e => (e.currentTarget.style.background = GLASS)}
                            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                            <div style={{ width: 6, height: 6, borderRadius: '50%', background: c, flexShrink: 0 }} />
                            <span style={{ flex: 1, fontFamily: SANS, fontSize: 13, color: FG2 }}>{t.title}</span>
                            {t.genres?.[0] && <span style={{ fontFamily: MONO, fontSize: 8, color: c, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{t.genres[0]}</span>}
                            {dur && <span style={{ fontFamily: MONO, fontSize: 9, color: FG4, width: 36, textAlign: 'right' }}>{dur}</span>}
                        </div>
                    )
                })}
            </div>
            {many && (
                <button onClick={() => setExpanded(x => !x)}
                    style={{ marginTop: 4, marginLeft: 8, background: 'none', border: 'none', color: LINK, fontFamily: MONO, fontSize: 10, cursor: 'pointer', padding: '4px 0' }}>
                    {expanded ? '− show fewer' : `+ show all ${group.tracks.length}`}
                </button>
            )}
        </div>
    )
}

// ─────────────────────────────────────────────────────────────────────────────
// Mini sound-map — opt-in, navigable. The kernel lives on, but earns its space.
// ─────────────────────────────────────────────────────────────────────────────

function MiniSoundMap({ focal, neighbors, onPick }: {
    focal: TrackNeighborData; neighbors: TrackNeighborData[]; onPick: (n: TrackNeighborData) => void
}) {
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const stateRef = useRef({ focal, neighbors })
    const rafRef = useRef(0)
    const mouseRef = useRef<{ x: number; y: number } | null>(null)
    const hoverRef = useRef<{ pt: ProjectedPoint; nx: number; ny: number } | null>(null)

    useEffect(() => { stateRef.current = { focal, neighbors } }, [focal, neighbors])

    const onMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
        const r = canvasRef.current?.getBoundingClientRect()
        if (r) mouseRef.current = { x: e.clientX - r.left, y: e.clientY - r.top }
    }, [])
    const onLeave = useCallback(() => { mouseRef.current = null }, [])
    const onClick = useCallback(() => { if (hoverRef.current) onPick(hoverRef.current.pt as any) }, [onPick])

    useEffect(() => {
        const canvas = canvasRef.current
        if (!canvas) return
        const ctx = canvas.getContext('2d')!
        let running = true
        const sync = () => {
            const dpr = window.devicePixelRatio || 1
            const w = canvas.clientWidth, h = canvas.clientHeight
            if (w && h && (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr))) {
                canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr)
            }
        }
        const ro = new ResizeObserver(sync); ro.observe(canvas); sync()

        const draw = (ts: number) => {
            if (!running) return
            const dpr = window.devicePixelRatio || 1
            const W = canvas.width / dpr, H = canvas.height / dpr
            const { focal, neighbors } = stateRef.current
            const { points } = buildNeighborhood(focal, neighbors)
            const nbrs = points.filter(p => !p.isFocal)
            const f = points.find(p => p.isFocal)
            const fpx = f?.px ?? 0, fpy = f?.py ?? 0
            const maxD = Math.max(1, ...nbrs.map(p => Math.sqrt((p.px - fpx) ** 2 + (p.py - fpy) ** 2)))
            const cx = W / 2, cy = H / 2
            const SCALE = (Math.min(W, H) / 2 - 28) / maxD
            const toN = (px: number, py: number) => ({ nx: cx + (px - fpx) * SCALE, ny: cy - (py - fpy) * SCALE })

            ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
            const bg = ctx.createRadialGradient(cx, cy, 0, cx, cy, W * 0.7)
            bg.addColorStop(0, CANVAS_BG2); bg.addColorStop(1, CANVAS_BG)
            ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H)

            // hover detection
            const mouse = mouseRef.current
            let hovered: { pt: ProjectedPoint; nx: number; ny: number } | null = null
            if (mouse) {
                let best = 16
                for (const p of nbrs) {
                    const { nx, ny } = toN(p.px, p.py)
                    const d = Math.hypot(nx - mouse.x, ny - mouse.y)
                    if (d < best) { best = d; hovered = { pt: p, nx, ny } }
                }
            }
            hoverRef.current = hovered

            for (const p of [...nbrs].sort((a, b) => b.distance - a.distance)) {
                const { nx, ny } = toN(p.px, p.py)
                const isHov = hovered?.pt.id === p.id
                const col = genreColor(p.genres?.[0] ?? null)
                const normD = Math.min(1, p.distance / maxD)
                const r = (isHov ? 6 : 4 - normD * 1.5)
                ctx.globalAlpha = hovered && !isHov ? 0.35 : 0.55 + (1 - normD) * 0.4
                if (isHov) { ctx.shadowColor = col; ctx.shadowBlur = 14 }
                ctx.beginPath(); ctx.arc(nx, ny, r, 0, Math.PI * 2); ctx.fillStyle = col; ctx.fill()
                ctx.shadowBlur = 0; ctx.globalAlpha = 1
            }

            const pulse = Math.sin(ts * 0.0022) * 0.5 + 0.5
            ctx.beginPath(); ctx.arc(cx, cy, (16 + pulse * 5), 0, Math.PI * 2)
            ctx.fillStyle = `rgba(0,255,231,${0.05 + pulse * 0.04})`; ctx.fill()
            ctx.shadowColor = TEAL; ctx.shadowBlur = 12
            ctx.beginPath(); ctx.arc(cx, cy, 6, 0, Math.PI * 2); ctx.fillStyle = TEAL; ctx.fill(); ctx.shadowBlur = 0

            if (hovered) {
                const { pt, nx, ny } = hovered
                const label = `${pt.artist} — ${pt.title ?? ''}`
                ctx.font = `11px ${SANS}`
                const w = Math.min(260, ctx.measureText(label).width + 18)
                const bx = Math.min(W - w - 6, Math.max(6, nx + 10)), by = Math.max(6, ny - 30)
                ctx.fillStyle = 'rgba(17,17,16,0.94)'; ctx.fillRect(bx, by, w, 24)
                ctx.strokeStyle = genreColor(pt.genres?.[0] ?? null) + '66'; ctx.strokeRect(bx, by, w, 24)
                ctx.fillStyle = CANVAS_FG; ctx.textAlign = 'left'
                ctx.fillText(label.length > 36 ? label.slice(0, 34) + '…' : label, bx + 8, by + 16)
            }
            ctx.font = `9px ${MONO}`; ctx.fillStyle = 'rgba(255,255,255,0.1)'; ctx.textAlign = 'left'
            ctx.fillText('hover to read · click to open', 10, H - 10)
            rafRef.current = requestAnimationFrame(draw)
        }
        rafRef.current = requestAnimationFrame(draw)
        return () => { running = false; cancelAnimationFrame(rafRef.current); ro.disconnect() }
    }, [])

    return (
        <canvas ref={canvasRef} onPointerMove={onMove} onPointerLeave={onLeave} onClick={onClick}
            style={{ display: 'block', width: '100%', height: 320, cursor: 'pointer', border: `1px solid ${BORDER2}` }}
            aria-label="Sound map" />
    )
}

// ─────────────────────────────────────────────────────────────────────────────
// Track article — the Wikipedia page
// ─────────────────────────────────────────────────────────────────────────────

interface TrackArticleData {
    focal: TrackNeighborData
    neighbors: TrackNeighborData[]   // sorted nearest-first
}

async function resolveTrackArticle(artist: string, title: string, embOverride?: Float32Array): Promise<TrackArticleData> {
    const emb = embOverride && embOverride.length ? embOverride : await apiEmbed(`${artist} – ${title}`)
    const hits = await apiSearchVector(emb, N_NEIGHBORS + 1)
    if (!hits.length) throw new Error('Track not found.')
    const focal = chromaToNeighbor(hits[0], 0)
    // keep the chosen identity even if the nearest record drifts slightly
    focal.artist = artist || focal.artist
    focal.title = title || focal.title
    const neighbors = hits.slice(1)
        .filter(h => h.id !== hits[0].id)
        .slice(0, N_NEIGHBORS)
        .map(h => chromaToNeighbor(h, Math.sqrt(h.distance)))
        .sort((a, b) => a.distance - b.distance)
    return { focal, neighbors }
}

function TrackArticle({ view, kernelState, onNavigate, onPlayTrack }: {
    view: Extract<View, { kind: 'track' }>
    kernelState?: KernelState
    onNavigate: (v: View) => void
    onPlayTrack?: (t: TrackNeighborData, previewUrl?: string) => void
}) {
    const [data, setData] = useState<TrackArticleData | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [mapOpen, setMapOpen] = useState(false)

    useEffect(() => {
        let live = true
        setLoading(true); setError(null); setMapOpen(false)
        resolveTrackArticle(view.artist, view.title, view.embedding)
            .then(d => { if (live) setData(d) })
            .catch(e => { if (live) setError(e?.message ?? 'Failed to load') })
            .finally(() => { if (live) setLoading(false) })
        return () => { live = false }
    }, [view.artist, view.title])

    const focal = data?.focal
    const itunes = useItunesData(focal?.artist ?? '', focal?.title ?? '')
    const mbTrack = useMBRecording(focal?.artist ?? '', focal?.title ?? '')
    const mbArtist = useMBArtist(focal?.artist ?? '')
    const wiki = useWikipediaData(focal?.artist ?? '', focal?.title ?? '')
    const preview = useAudioPreview(itunes?.previewUrl ?? null)

    const attitude = useMemo(
        () => (focal && kernelState ? computeAttitude(focal.embedding, kernelState) : null),
        [focal, kernelState],
    )

    const allMBTags = useMemo(() => {
        if (!mbTrack?.mbTags.length && !mbArtist?.mbTags.length) return []
        const stored = new Set([...(focal?.genres ?? []), ...(focal?.moods ?? [])].map(t => t.toLowerCase()))
        return [...new Set([...(mbTrack?.mbTags ?? []), ...(mbArtist?.mbTags ?? [])])]
            .filter(t => !stored.has(t.toLowerCase())).slice(0, 8)
    }, [mbTrack, mbArtist, focal])

    const displayDuration = fmtDuration((focal?.durationMs ?? 0) > 0 ? focal!.durationMs : itunes?.durationMs ?? null)
    const displayIsrc = focal?.isrc || mbTrack?.isrcs[0] || null
    const displayRelease = mbTrack?.releaseDate ?? itunes?.releaseDate ?? itunes?.releaseYear ?? null

    if (loading) return <Spinner label="Opening article" />
    if (error || !focal) {
        return (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 10 }}>
                <div style={{ fontFamily: MONO, fontSize: 11, color: ACCENT }}>{error ?? 'Not found'}</div>
            </div>
        )
    }

    const semanticLink = (term: string) => onNavigate({ kind: 'results', query: term, mode: 'semantic' })

    return (
        <div style={{ flex: 1, overflowY: 'auto', background: BG }}>
            {/* preview progress */}
            {preview.playing && (
                <div style={{ position: 'sticky', top: 0, height: 2, background: BG2, zIndex: 5 }}>
                    <div style={{ height: '100%', width: `${preview.progress * 100}%`, background: ACCENT, transition: 'width .5s linear' }} />
                </div>
            )}

            <div style={{ maxWidth: 1040, margin: '0 auto', padding: '28px 28px 90px', display: 'flex', gap: 36, alignItems: 'flex-start' }}>

                {/* ── Reading column ─────────────────────────────────────────── */}
                <article style={{ flex: 1, maxWidth: READING_MAX, minWidth: 0 }}>
                    {/* Title block */}
                    <div style={{ fontFamily: MONO, fontSize: 9, color: FG4, letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: 6 }}>Track</div>
                    <h1 style={{ fontFamily: DISP, fontSize: 56, color: FG, letterSpacing: '0.01em', lineHeight: 0.98, margin: '0 0 8px' }}>{focal.title}</h1>
                    <div style={{ fontFamily: SANS, fontSize: 16, color: FG2, marginBottom: 18 }}>
                        by <WikiLink onClick={() => onNavigate({ kind: 'artist', name: focal.artist })} color={LINK} weight={600}>{focal.artist}</WikiLink>
                        {itunes?.albumName && <> · from <span style={{ color: FG3 }}>{itunes.albumName}</span></>}
                        {displayRelease && <> · {String(displayRelease).slice(0, 4)}</>}
                    </div>

                    {/* Actions */}
                    <div style={{ display: 'flex', gap: 8, marginBottom: 26, flexWrap: 'wrap' }}>
                        {itunes?.previewUrl && (
                            <button onClick={preview.toggle}
                                style={{ background: preview.playing ? ACCENT : 'transparent', border: `1px solid ${preview.playing ? ACCENT : BORDER}`, color: preview.playing ? '#fff' : FG2, fontFamily: MONO, fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', padding: '7px 14px', cursor: 'pointer' }}>
                                {preview.playing ? '⏸ preview' : '▶ preview'}
                            </button>
                        )}
                        {onPlayTrack && (
                            <button onClick={() => onPlayTrack(focal, itunes?.previewUrl ?? undefined)}
                                style={{ background: 'transparent', border: `1px solid ${BORDER}`, color: FG2, fontFamily: MONO, fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', padding: '7px 14px', cursor: 'pointer' }}>
                                play in app
                            </button>
                        )}
                        <button onClick={() => setMapOpen(o => !o)}
                            style={{ background: mapOpen ? GLASS : 'transparent', border: `1px solid ${BORDER}`, color: mapOpen ? TEAL : FG3, fontFamily: MONO, fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', padding: '7px 14px', cursor: 'pointer' }}>
                            {mapOpen ? 'hide sound map' : 'show sound map'}
                        </button>
                    </div>

                    {/* Optional, navigable sound map */}
                    {mapOpen && data && (
                        <div style={{ marginBottom: 28 }}>
                            <MiniSoundMap focal={focal} neighbors={data.neighbors}
                                onPick={n => onNavigate({ kind: 'track', artist: n.artist, title: n.title, embedding: n.embedding })} />
                        </div>
                    )}

                    {/* Kernel attitude — one compact line */}
                    {attitude && (
                        <div style={{ borderLeft: `3px solid ${attitude.color}`, background: GLASS, padding: '12px 16px', marginBottom: 28 }}>
                            <span style={{ fontFamily: DISP, fontSize: 18, color: attitude.color, letterSpacing: '0.03em', marginRight: 10 }}>{ZONE_TITLE[attitude.zone]}.</span>
                            <span style={{ fontFamily: SANS, fontSize: 14, color: FG2, lineHeight: 1.6 }}>
                                Relative to your taste, this track is {attitude.label}.
                            </span>
                            <div style={{ fontFamily: MONO, fontSize: 9, color: FG4, marginTop: 6 }}>
                                {attitude.distNorm.toFixed(2)}σ from centre · alignment {attitude.alignment > 0 ? '+' : ''}{attitude.alignment.toFixed(2)}
                            </div>
                        </div>
                    )}

                    {/* About */}
                    {wiki?.extract && (
                        <section style={{ marginBottom: 30 }}>
                            <h2 style={{ fontFamily: SANS, fontSize: 14, fontWeight: 600, color: FG, letterSpacing: '0', margin: '0 0 10px', paddingBottom: 8, borderBottom: `1px solid ${BORDER2}` }}>
                                {wiki.isTrackPage ? 'About this track' : `About ${focal.artist}`}
                            </h2>
                            <p style={{ fontFamily: SANS, fontSize: 15, color: FG2, lineHeight: 1.75, margin: 0 }}>{wiki.extract}</p>
                            {wiki.url && (
                                <button onClick={() => openExternal(wiki.url!)}
                                    style={{ display: 'inline-block', marginTop: 8, fontFamily: MONO, fontSize: 9, color: FG4, letterSpacing: '0.1em', textTransform: 'uppercase', textDecoration: 'none', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                                    Read on Wikipedia →
                                </button>
                            )}
                        </section>
                    )}

                    {/* Sound profile — every tag is a semantic link */}
                    {(focal.genres.length + focal.moods.length + focal.themes.length + focal.contexts.length) > 0 && (
                        <section style={{ marginBottom: 30 }}>
                            <h2 style={{ fontFamily: SANS, fontSize: 14, fontWeight: 600, color: FG, letterSpacing: '0', margin: '0 0 12px', paddingBottom: 8, borderBottom: `1px solid ${BORDER2}` }}>Sound profile</h2>
                            {[
                                { label: 'Genre', tags: focal.genres, colorFn: (t: string) => genreColor(t) },
                                { label: 'Mood', tags: focal.moods, colorFn: () => CYAN },
                                { label: 'Theme', tags: focal.themes, colorFn: () => SUCCESS },
                                { label: 'Context', tags: focal.contexts, colorFn: () => YELLOW },
                            ].filter(r => r.tags.length).map(r => (
                                <div key={r.label} style={{ display: 'flex', gap: 8, alignItems: 'baseline', marginBottom: 8 }}>
                                    <span style={{ fontFamily: MONO, fontSize: 8, color: FG4, letterSpacing: '0.12em', textTransform: 'uppercase', width: 56, flexShrink: 0 }}>{r.label}</span>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                                        {r.tags.map(t => <TagLink key={t} text={t} color={r.colorFn(t)} onClick={() => semanticLink(t)} />)}
                                    </div>
                                </div>
                            ))}
                            {allMBTags.length > 0 && (
                                <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', marginTop: 4 }}>
                                    <span style={{ fontFamily: MONO, fontSize: 8, color: FG4, letterSpacing: '0.12em', textTransform: 'uppercase', width: 56, flexShrink: 0 }}>Community</span>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                                        {allMBTags.map(t => <TagLink key={t} text={t} color={FG3} onClick={() => semanticLink(t)} />)}
                                    </div>
                                </div>
                            )}
                        </section>
                    )}

                    {/* See also — the rabbit hole */}
                    {data && data.neighbors.length > 0 && (
                        <section>
                            <h2 style={{ fontFamily: SANS, fontSize: 14, fontWeight: 600, color: FG, letterSpacing: '0', margin: '0 0 4px', paddingBottom: 8, borderBottom: `1px solid ${BORDER2}` }}>See also</h2>
                            <div style={{ fontFamily: MONO, fontSize: 9, color: FG4, letterSpacing: '0.06em', marginBottom: 10 }}>Tracks that sound nearest to this one</div>
                            <ol style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                                {data.neighbors.slice(0, 18).map((n, i) => {
                                    const c = genreColor(n.genres?.[0] ?? null)
                                    return (
                                        <li key={n.id}
                                            onClick={() => onNavigate({ kind: 'track', artist: n.artist, title: n.title, embedding: n.embedding })}
                                            style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '8px 8px', cursor: 'pointer', borderRadius: 2, transition: 'background .08s' }}
                                            onMouseEnter={e => (e.currentTarget.style.background = GLASS)}
                                            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                                            <span style={{ fontFamily: MONO, fontSize: 9, color: FG4, width: 18, textAlign: 'right', flexShrink: 0 }}>{i + 1}</span>
                                            <div style={{ width: 6, height: 6, borderRadius: '50%', background: c, flexShrink: 0 }} />
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ fontFamily: SANS, fontSize: 13, color: LINK, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{n.title}</div>
                                                <div style={{ fontFamily: MONO, fontSize: 9, color: FG4 }}>{n.artist}</div>
                                            </div>
                                            <span style={{ fontFamily: MONO, fontSize: 8, color: FG4, flexShrink: 0 }}>{soundSimilarity(n.distance).split(' ')[0]}</span>
                                        </li>
                                    )
                                })}
                            </ol>
                        </section>
                    )}
                </article>

                {/* ── Infobox rail (Wikipedia-style) ─────────────────────────── */}
                <aside style={{ width: 268, flexShrink: 0, position: 'sticky', top: 16 }}>
                    <div style={{ border: `1px solid ${BORDER}`, background: BG1 }}>
                        {/* art */}
                        <div style={{ position: 'relative', width: '100%', aspectRatio: '1', overflow: 'hidden' }}>
                            {itunes?.artworkUrl ? (
                                <img src={itunes.artworkUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                            ) : (
                                <div style={{ width: '100%', height: '100%', background: BG2, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <span style={{ fontFamily: DISP, fontSize: 72, color: FG4 }}>{focal.title.slice(0, 1)}</span>
                                </div>
                            )}
                        </div>
                        {/* facts */}
                        <div style={{ padding: '12px 14px' }}>
                            <div style={{ fontFamily: DISP, fontSize: 18, color: FG, letterSpacing: '0.03em', lineHeight: 1.05, marginBottom: 2 }}>{focal.title}</div>
                            <div style={{ fontFamily: MONO, fontSize: 9, color: ACCENT, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 10 }}>{focal.artist}</div>
                            <div>
                                {itunes?.albumName && <KVRow label="Album">{itunes.albumName}</KVRow>}
                                {itunes?.trackNumber && itunes.trackCount && <KVRow label="Track">{itunes.trackNumber} of {itunes.trackCount}</KVRow>}
                                {displayRelease && <KVRow label="Released">{displayRelease}</KVRow>}
                                {displayDuration && <KVRow label="Length">{displayDuration}</KVRow>}
                                {itunes?.primaryGenre && <KVRow label="iTunes genre"><span style={{ color: CYAN }}>{itunes.primaryGenre}</span></KVRow>}
                                {mbTrack?.label && <KVRow label="Label">{mbTrack.label}</KVRow>}
                                {mbTrack?.country && <KVRow label="Country">{mbTrack.country}</KVRow>}
                                {displayIsrc && <KVRow label="ISRC"><code style={{ letterSpacing: '0.05em' }}>{displayIsrc}</code></KVRow>}
                                {itunes?.explicit && <KVRow label="Advisory"><span style={{ color: YELLOW }}>Explicit</span></KVRow>}
                            </div>
                            {/* links out */}
                            <div style={{ display: 'flex', gap: 12, marginTop: 12, flexWrap: 'wrap' }}>
                                {mbTrack?.mbid && (
                                    <button onClick={() => openExternal(`https://musicbrainz.org/recording/${mbTrack.mbid}`)}
                                        style={{ fontFamily: MONO, fontSize: 9, color: CYAN, textDecoration: 'none', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>MusicBrainz ↗</button>
                                )}
                                {itunes?.trackUrl && (
                                    <button onClick={() => openExternal(itunes.trackUrl!)}
                                        style={{ fontFamily: MONO, fontSize: 9, color: CYAN, textDecoration: 'none', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>iTunes ↗</button>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* artist mini-card → links to the artist page */}
                    <div style={{ marginTop: 14, border: `1px solid ${BORDER2}`, background: BG1, padding: '12px 14px' }}>
                        <SectionLabel style={{ marginBottom: 8 }}>Explore</SectionLabel>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            <WikiLink onClick={() => onNavigate({ kind: 'artist', name: focal.artist })} color={LINK} size={12}>More by {focal.artist} →</WikiLink>
                            {focal.genres[0] && <WikiLink onClick={() => semanticLink(focal.genres[0])} color={genreColor(focal.genres[0])} size={12}>More {focal.genres[0]} →</WikiLink>}
                            {mbTrack?.label && <WikiLink onClick={() => onNavigate({ kind: 'results', query: mbTrack.label!, mode: 'lexical' })} color={FG2} size={12}>{mbTrack.label} catalog →</WikiLink>}
                        </div>
                    </div>
                </aside>
            </div>
        </div>
    )
}

// ─────────────────────────────────────────────────────────────────────────────
// Artist article — "all of them" lives here
// ─────────────────────────────────────────────────────────────────────────────

function ArtistArticle({ view, onNavigate }: { view: Extract<View, { kind: 'artist' }>; onNavigate: (v: View) => void }) {
    const [tracks, setTracks] = useState<TextHit[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        let live = true
        setLoading(true)
        apiSearchText(view.name, 120)
            .then(({ hits }) => {
                if (!live) return
                const norm = view.name.toLowerCase()
                const mine = hits.filter(h => (h.byArtist ?? '').toLowerCase() === norm)
                setTracks((mine.length ? mine : hits).slice(0, 80))
            })
            .finally(() => { if (live) setLoading(false) })
        return () => { live = false }
    }, [view.name])

    const mbArtist = useMBArtist(view.name)
    const wiki = useWikipediaData(view.name)

    const topGenres = useMemo(() => {
        const c = new Map<string, number>()
        for (const t of tracks) for (const g of t.genres ?? []) c.set(g, (c.get(g) ?? 0) + 1)
        return [...c.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([g]) => g)
    }, [tracks])

    const semanticLink = (term: string) => onNavigate({ kind: 'results', query: term, mode: 'semantic' })

    return (
        <div style={{ flex: 1, overflowY: 'auto', background: BG }}>
            <div style={{ maxWidth: 1040, margin: '0 auto', padding: '28px 28px 90px', display: 'flex', gap: 36, alignItems: 'flex-start' }}>
                <article style={{ flex: 1, maxWidth: READING_MAX, minWidth: 0 }}>
                    <div style={{ fontFamily: MONO, fontSize: 9, color: FG4, letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: 6 }}>
                        Artist{mbArtist?.type ? ` · ${mbArtist.type}` : ''}
                    </div>
                    <h1 style={{ fontFamily: DISP, fontSize: 58, color: FG, letterSpacing: '0.02em', lineHeight: 0.96, margin: '0 0 14px' }}>{view.name}</h1>

                    {wiki?.extract && (
                        <section style={{ marginBottom: 30 }}>
                            <p style={{ fontFamily: SANS, fontSize: 15, color: FG2, lineHeight: 1.75, margin: 0 }}>{wiki.extract}</p>
                            {wiki.url && (
                                <button onClick={() => openExternal(wiki.url!)}
                                    style={{ display: 'inline-block', marginTop: 8, fontFamily: MONO, fontSize: 9, color: FG4, letterSpacing: '0.1em', textTransform: 'uppercase', textDecoration: 'none', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                                    Read on Wikipedia →
                                </button>
                            )}
                        </section>
                    )}

                    {topGenres.length > 0 && (
                        <section style={{ marginBottom: 26 }}>
                            <h2 style={{ fontFamily: SANS, fontSize: 14, fontWeight: 600, color: FG, letterSpacing: '0', margin: '0 0 10px', paddingBottom: 8, borderBottom: `1px solid ${BORDER2}` }}>Sounds in</h2>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                {topGenres.map(g => <TagLink key={g} text={g} color={genreColor(g)} onClick={() => semanticLink(g)} />)}
                            </div>
                        </section>
                    )}

                    <section>
                        <h2 style={{ fontFamily: SANS, fontSize: 14, fontWeight: 600, color: FG, letterSpacing: '0', margin: '0 0 4px', paddingBottom: 8, borderBottom: `1px solid ${BORDER2}` }}>
                            In the catalog
                        </h2>
                        <div style={{ fontFamily: MONO, fontSize: 9, color: FG4, marginBottom: 8 }}>{tracks.length} tracks</div>
                        {loading ? <Spinner label="Loading tracks" /> : (
                            <div>
                                {tracks.map(t => {
                                    const c = genreColor(t.genres?.[0] ?? null)
                                    const dur = fmtDuration(t.durationMs)
                                    return (
                                        <div key={t.id}
                                            onClick={() => onNavigate({ kind: 'track', artist: t.byArtist ?? view.name, title: t.title ?? '', embedding: t.embedding ? new Float32Array(t.embedding) : undefined })}
                                            style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '8px 8px', cursor: 'pointer', borderRadius: 2, transition: 'background .08s' }}
                                            onMouseEnter={e => (e.currentTarget.style.background = GLASS)}
                                            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                                            <div style={{ width: 6, height: 6, borderRadius: '50%', background: c, flexShrink: 0 }} />
                                            <span style={{ flex: 1, fontFamily: SANS, fontSize: 13, color: LINK }}>{t.title}</span>
                                            {t.genres?.[0] && <span style={{ fontFamily: MONO, fontSize: 8, color: c, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{t.genres[0]}</span>}
                                            {dur && <span style={{ fontFamily: MONO, fontSize: 9, color: FG4, width: 36, textAlign: 'right' }}>{dur}</span>}
                                        </div>
                                    )
                                })}
                            </div>
                        )}
                    </section>
                </article>

                {/* Infobox */}
                <aside style={{ width: 268, flexShrink: 0, position: 'sticky', top: 16 }}>
                    <div style={{ border: `1px solid ${BORDER}`, background: BG1, padding: '14px 14px' }}>
                        <div style={{ fontFamily: DISP, fontSize: 22, color: FG, letterSpacing: '0.03em', marginBottom: 10 }}>{view.name}</div>
                        {(mbArtist?.area || mbArtist?.country) && <KVRow label="Origin">{[mbArtist.area, mbArtist.country].filter(Boolean).join(', ')}</KVRow>}
                        {mbArtist?.type && <KVRow label="Type">{mbArtist.type}</KVRow>}
                        {mbArtist?.beginYear && (
                            <KVRow label="Active">
                                {mbArtist.beginYear}{mbArtist.ended && mbArtist.endYear ? ` – ${mbArtist.endYear}` : ' – present'}
                            </KVRow>
                        )}
                        {mbArtist?.disambig && <KVRow label="Note"><em style={{ color: FG4 }}>{mbArtist.disambig}</em></KVRow>}
                        {mbArtist?.mbid && (
                            <div style={{ marginTop: 12 }}>
                                <button onClick={() => openExternal(`https://musicbrainz.org/artist/${mbArtist.mbid}`)}
                                    style={{ fontFamily: MONO, fontSize: 9, color: CYAN, textDecoration: 'none', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>MusicBrainz ↗</button>
                            </div>
                        )}
                    </div>
                </aside>
            </div>
        </div>
    )
}

// ─────────────────────────────────────────────────────────────────────────────
// Home / landing
// ─────────────────────────────────────────────────────────────────────────────

function getTimeSlotMoods(): { moods: string[]; label: string } {
    const h = new Date().getHours()
    if (h >= 5  && h < 11) return { moods: ['energetic', 'uplifting', 'bright'], label: 'morning' }
    if (h >= 11 && h < 14) return { moods: ['driving', 'focused', 'confident'], label: 'midday' }
    if (h >= 14 && h < 18) return { moods: ['focused', 'deep', 'hypnotic'], label: 'afternoon' }
    if (h >= 18 && h < 22) return { moods: ['chill', 'warm', 'melodic'], label: 'evening' }
    return { moods: ['dark', 'introspective', 'atmospheric'], label: 'late night' }
}

function kernelPhrase(entropy?: number): string | null {
    if (entropy === undefined) return null
    if (entropy > 0.65) return 'You\'re in wandering mode.'
    if (entropy > 0.33) return 'You\'re finding your sound.'
    return 'You\'re deep in your groove.'
}

function Chip({ label, color = FG3, onClick }: { label: string; color?: string; onClick: () => void }) {
    const [hov, setHov] = useState(false)
    return (
        <span
            role="button" tabIndex={0}
            onClick={onClick}
            onKeyDown={e => { if (e.key === 'Enter') onClick() }}
            onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
            style={{
                fontFamily: MONO, fontSize: 11, color: hov ? FG : color,
                padding: '5px 13px', border: `1px solid ${hov ? BORDER : BORDER2}`,
                cursor: 'pointer', transition: 'color .1s, border-color .1s',
                background: hov ? GLASS : 'transparent',
            }}>
            {label}
        </span>
    )
}

function SectionHeader({ children }: { children: React.ReactNode }) {
    return (
        <div style={{
            fontFamily: MONO, fontSize: 9, color: FG4,
            letterSpacing: '0.18em', textTransform: 'uppercase',
            marginBottom: 12, paddingBottom: 6, borderBottom: `1px solid ${BORDER2}`,
        }}>
            {children}
        </div>
    )
}

function HomeSearch({ onNavigate }: { onNavigate: (v: View) => void }) {
    const [q, setQ] = useState('')
    const [focused, setFocused] = useState(false)

    const submit = (mode: SearchMode) => {
        const t = q.trim()
        if (!t) return
        onNavigate({ kind: 'results', query: t, mode })
    }

    return (
        <div style={{ marginBottom: 40 }}>
            {/* Input */}
            <div style={{
                display: 'flex', alignItems: 'center',
                border: `1px solid ${focused ? ACCENT : BORDER}`,
                background: BG1,
                transition: 'border-color .15s',
                marginBottom: 10,
            }}>
                <span style={{ padding: '0 14px', color: FG4, fontSize: 16, flexShrink: 0, lineHeight: 1 }}>⌕</span>
                <input
                    value={q}
                    onChange={e => setQ(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') submit('lexical') }}
                    onFocus={() => setFocused(true)}
                    onBlur={() => setFocused(false)}
                    placeholder="Search an artist, track, or vibe…"
                    autoFocus
                    style={{
                        flex: 1, border: 'none', background: 'transparent',
                        color: FG, fontSize: 16, fontFamily: SANS,
                        padding: '14px 14px 14px 0',
                        outline: 'none',
                    }}
                />
                {q && (
                    <button onClick={() => setQ('')}
                        style={{ background: 'none', border: 'none', color: FG4, fontSize: 13, cursor: 'pointer', padding: '0 12px', flexShrink: 0 }}>
                        ✕
                    </button>
                )}
            </div>
            {/* Action row */}
            <div style={{ display: 'flex', gap: 8 }}>
                <button
                    onClick={() => submit('lexical')}
                    disabled={!q.trim()}
                    style={{
                        background: q.trim() ? ACCENT : 'transparent',
                        border: `1px solid ${q.trim() ? ACCENT : BORDER2}`,
                        color: q.trim() ? '#fff' : FG4,
                        fontFamily: MONO, fontSize: 10, letterSpacing: '0.12em',
                        textTransform: 'uppercase', padding: '7px 18px',
                        cursor: q.trim() ? 'pointer' : 'default',
                        transition: 'background .1s, border-color .1s, color .1s',
                    }}>
                    Search
                </button>
                <button
                    onClick={() => submit('semantic')}
                    disabled={!q.trim()}
                    style={{
                        background: 'transparent',
                        border: `1px solid ${BORDER2}`,
                        color: q.trim() ? FG3 : FG4,
                        fontFamily: MONO, fontSize: 10, letterSpacing: '0.12em',
                        textTransform: 'uppercase', padding: '7px 18px',
                        cursor: q.trim() ? 'pointer' : 'default',
                        transition: 'color .1s',
                    }}>
                    ~ Sounds like
                </button>
            </div>
        </div>
    )
}

function Home({ onNavigate, kernelTopGenres, allGenres, kernelEntropy }: {
    onNavigate: (v: View) => void
    kernelTopGenres?: string[]
    allGenres?: string[]
    kernelEntropy?: number
}) {
    const slot = getTimeSlotMoods()
    const phrase = kernelPhrase(kernelEntropy)

    const stretchGenres = useMemo(() => {
        if (!allGenres?.length || !kernelTopGenres?.length) return []
        const known = new Set(kernelTopGenres.map(g => g.toLowerCase()))
        const outside = allGenres.filter(g => !known.has(g.toLowerCase()))
        return [...outside].sort(() => Math.random() - 0.5).slice(0, 5)
    }, [allGenres, kernelTopGenres])

    const hasKernel = kernelTopGenres && kernelTopGenres.length > 0

    return (
        <div style={{ flex: 1, overflowY: 'auto', background: BG }}>
            <div style={{ maxWidth: 600, margin: '0 auto', padding: '48px 32px 80px' }}>

                {/* Tagline */}
                <p style={{ fontFamily: MONO, fontSize: 10, color: FG4, letterSpacing: '0.18em', textTransform: 'uppercase', marginBottom: 20 }}>
                    a music encyclopedia
                </p>

                {/* ── Prominent search ─────────────────────────────────────── */}
                <HomeSearch onNavigate={onNavigate} />

                {/* Kernel phrase — sits below the search as context */}
                {phrase && (
                    <p style={{ fontFamily: SANS, fontSize: 13, color: FG3, marginBottom: 32, lineHeight: 1.5 }}>
                        {phrase}
                    </p>
                )}

                {/* For you */}
                {hasKernel && (
                    <section style={{ marginBottom: 28 }}>
                        <SectionHeader>for you</SectionHeader>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                            {kernelTopGenres!.map(g => (
                                <Chip key={g} label={g} color={FG2}
                                    onClick={() => onNavigate({ kind: 'results', query: g, mode: 'semantic' })} />
                            ))}
                        </div>
                    </section>
                )}

                {/* Right now */}
                <section style={{ marginBottom: 28 }}>
                    <SectionHeader>right now · {slot.label}</SectionHeader>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {slot.moods.map(m => (
                            <Chip key={m} label={m} color={FG3}
                                onClick={() => onNavigate({ kind: 'results', query: m, mode: 'semantic' })} />
                        ))}
                    </div>
                </section>

                {/* Somewhere new */}
                {stretchGenres.length > 0 && (
                    <section style={{ marginBottom: 28 }}>
                        <SectionHeader>somewhere new</SectionHeader>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                            {stretchGenres.map(g => (
                                <Chip key={g} label={g} color={FG4}
                                    onClick={() => onNavigate({ kind: 'results', query: g, mode: 'semantic' })} />
                            ))}
                        </div>
                    </section>
                )}

                {/* Fallback suggestions when kernel is cold */}
                {!hasKernel && (
                    <section style={{ marginBottom: 28 }}>
                        <SectionHeader>start here</SectionHeader>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                            {['Radiohead', 'shoegaze', 'late-night drive', 'dream pop', 'post-rock', 'lo-fi'].map(s => (
                                <Chip key={s} label={s} color={FG3}
                                    onClick={() => onNavigate({ kind: 'results', query: s, mode: s[0] === s[0].toUpperCase() ? 'lexical' : 'semantic' })} />
                            ))}
                        </div>
                    </section>
                )}
            </div>
        </div>
    )
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

export interface WikiNavState {
    view: View
    stack: View[]
    searchBox: string
    onNavigate: (v: View) => void
    onBack: () => void
    onGoTo: (index: number) => void
    onSearchBoxChange: (v: string) => void
}

interface Props extends WikiNavState {
    kernelState?: KernelState
    onPlayTrack?: (track: TrackNeighborData, previewUrl?: string) => void
    kernelTopGenres?: string[]
    allGenres?: string[]
    kernelEntropy?: number
}

export function TrackWikiView({ view, stack: _stack, searchBox: _searchBox, onNavigate, onBack: _onBack, onGoTo: _onGoTo, onSearchBoxChange: _onSearchBoxChange, kernelState, onPlayTrack, kernelTopGenres, allGenres, kernelEntropy }: Props) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: BG, color: FG, fontFamily: SANS, overflow: 'hidden' }}>
            {view.kind === 'home' && <Home onNavigate={onNavigate} kernelTopGenres={kernelTopGenres} allGenres={allGenres} kernelEntropy={kernelEntropy} />}
            {view.kind === 'results' && (
                <ResultsView
                    key={`${view.query}|${view.mode}`}
                    query={view.query} mode={view.mode}
                    onNavigate={onNavigate}
                    onSetMode={m => onNavigate({ kind: 'results', query: view.query, mode: m })}
                />
            )}
            {view.kind === 'track' && (
                <TrackArticle key={`${view.artist}|${view.title}`} view={view} kernelState={kernelState} onNavigate={onNavigate} onPlayTrack={onPlayTrack} />
            )}
            {view.kind === 'artist' && (
                <ArtistArticle key={view.name} view={view} onNavigate={onNavigate} />
            )}
        </div>
    )
}

export { TrackWikiView as MusicWikiView }
export default TrackWikiView