/**
 * SoundTownView.tsx — SoundTown v3: the world sings, in the dark.
 *
 * Hollow Knight + Undertale, not Pokémon.  A dim, atmospheric world lit by your
 * lantern.  Every track is a SHADE — a glowing wisp resting at a fixed, seeded
 * position, quietly singing its own real preview.  You don't roll for encounters;
 * you HEAR something in the gloom, walk toward it (its song clears from muffled to
 * present), meet it (an Undertale dialogue beat with a characterful line), and
 * choose to Keep it or leave it.  Kept shades brighten into steady lanterns — your
 * songline, made spatial.  The songline is content-addressed (a tamper-evident
 * artifact you can export).
 *
 * Cheap on a no-GPU box: dark base + pre-baked vignette + pre-baked additive glow
 * sprites (never shadowBlur), terrain blit, a handful of sprites, dirty-gated.
 * Audio is real tracks via the proximity engine (soundtown/audio.ts); world model,
 * verbs, seeded placement + the artifact live in soundtown/world.ts.
 */

import { useRef, useEffect, useState, useCallback } from 'react'
import { SoundTownAudio, type SpiritAudio } from './soundtown/audio'
import {
    buildWorld, reachableZones, resolveMine, resolveFish, VERB_FLAVOR,
    readSongline, keepInSongline, songlineHas, mulberry32, hashStr, spiritLine, exportSongline,
    type World, type CatalogTrack, type GenreCentroid, type VerbKind, type SonglineEntry,
} from './soundtown/world'

// ── Palette — gloom-cool; warm colour is precious ─────────────────────────────
const VOID = '#0c0e14', FLOOR = '#161a24', FLOOR2 = '#12151d', PATH = '#1f2530'
const WALL = '#080910', STONE = '#0e1118', WATER = '#12243a', WATER2 = '#0e1d30'
const TEXT = '#e8eef2', TEXTDIM = '#8a94a4', FRAME = '#3a4458'
const PANEL = '#0a0b10', PRECIOUS = '#b83030', LANTERN = '#ffb347'
const SANS = '"Geist","Inter",sans-serif'
const MONO = '"Fragment Mono","DM Mono",monospace'
const BIO = ['#4fe0d0', '#9d6bff', '#ffb347', '#ff6f9c', '#6fd98a', '#62b6ff', '#c0a0ff']
function bioColor(g: string | null | undefined): string { return BIO[hashStr((g ?? 'x').toLowerCase()) % BIO.length] }

const BASE_URL = (import.meta as any).env?.VITE_CHROMA_URL ?? 'http://localhost:8080'
const ITUNES_CORS = 'https://itunes.apple.com'

const TILE = 36
const STEP_MS = 150
const LIT_R = 4.6          // tiles the lantern reveals
const MEET_R = 1.7         // tiles to meet a shade
const RECOG_R = 3.0        // tiles to read its name
const AUDIO_TICK_MS = 100

// ── Town template (themed dark per genre) ─────────────────────────────────────
//  #=tree ~=water .=floor ,=path T=glade R=rock H=house D=door B=shop S=sign N=npc @=spawn X=gate
const TOWN: string[] = [
    '############################',
    '#~~~~#..........#......#####',
    '#~~~~...TTTTT....,,,,,......#',
    '#~~~~..TTTTTTT...,...,......#',
    '#~~.S..TTTTTTT...,...,..BBB.#',
    '#......TTTTTTT...,...,..BDB.#',
    '#.......TTTTT...,,...,..,,,.#',
    '#..............,,,,,,...,...#',
    '#......N.......,.....N..,...#',
    '#..............,.......,,...#',
    '#....@........,,,,,,,,,,....#',
    '#.............,........,....#',
    '#.....RRR.....,...HHHH.,....#',
    '#.....RRR.....,...HDHH.,....#',
    '#.............,...,,,,.,....#',
    '#......N......,.....,..,....#',
    '#.............,,,,,,,,,,....#',
    '#..................,.......#',
    '#..................X.......#',
    '############################',
]
const MAP_W = Math.max(...TOWN.map(r => r.length))
const MAP_H = TOWN.length
function tileAt(tx: number, ty: number): string {
    if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) return '#'
    const row = TOWN[ty]; return tx < row.length ? row[tx] : '.'
}
const WALKABLE = new Set(['.', ',', 'T', '@', 'X', 'D', 'N'])
function isWall(tx: number, ty: number, npcSet: Set<string>): boolean {
    const c = tileAt(tx, ty)
    if (c === 'N' || npcSet.has(`${tx},${ty}`)) return true
    return !WALKABLE.has(c)
}
function findSpawn(): { tx: number; ty: number } {
    for (let ty = 0; ty < MAP_H; ty++) { const tx = TOWN[ty].indexOf('@'); if (tx >= 0) return { tx, ty } }
    return { tx: 5, ty: 10 }
}

interface Spirit { track: CatalogTrack; tx: number; ty: number; color: string; kept: boolean }
interface Npc { tx: number; ty: number; artist: string; tracks: CatalogTrack[] }
type Dir = 'up' | 'down' | 'left' | 'right'
const DELTA: Record<Dir, [number, number]> = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }

interface Enc { track: CatalogTrack; verb: VerbKind; fromZone: string; homeZone: string; color: string; line: string; spirit: Spirit | null }

export interface SoundTownProps {
    onTrackSelect?: (t: { id: string; title: string; artist: string; genres: string[] }) => void
    onPlayTrack?: (t: { id: string; title: string; artist: string; genres: string[] }) => void
    onBack?: () => void
}

// ── iTunes preview (cached + in-flight guard for prefetch) ────────────────────
const previewCache = new Map<string, string | null>()
const inflight = new Set<string>()
async function fetchPreviewUrl(t: CatalogTrack): Promise<string | null> {
    if (previewCache.has(t.id)) return previewCache.get(t.id)!
    try {
        const q = encodeURIComponent(`${t.artist} ${t.title}`)
        const res = await fetch(`${ITUNES_CORS}/search?term=${q}&media=music&entity=song&limit=5`)
        const json = await res.json(); const r: any[] = json.results ?? []
        const hit = r.find(x => x.trackName?.toLowerCase() === t.title.toLowerCase() && x.artistName?.toLowerCase() === t.artist.toLowerCase())
            ?? r.find(x => x.trackName?.toLowerCase().includes(t.title.toLowerCase())) ?? r[0]
        const url = hit?.previewUrl ?? null; previewCache.set(t.id, url); return url
    } catch { previewCache.set(t.id, null); return null }
}
function ensureUrl(t: CatalogTrack) {
    if (previewCache.has(t.id) || inflight.has(t.id)) return
    inflight.add(t.id); fetchPreviewUrl(t).finally(() => inflight.delete(t.id))
}

// ── Pre-baked glow sprites (additive; never shadowBlur in the loop) ───────────
const glowCache = new Map<string, HTMLCanvasElement>()
function glow(size: number, color: string): HTMLCanvasElement {
    const key = `${size}|${color}`; const hit = glowCache.get(key); if (hit) return hit
    const cv = document.createElement('canvas'); cv.width = cv.height = size
    const g = cv.getContext('2d')!; const r = size / 2
    const grad = g.createRadialGradient(r, r, 0, r, r, r)
    grad.addColorStop(0, color); grad.addColorStop(0.4, color + '88'); grad.addColorStop(1, color + '00')
    g.fillStyle = grad; g.fillRect(0, 0, size, size)
    glowCache.set(key, cv); return cv
}

// ── Seeded spirit placement (stable forever for a given zone) ─────────────────
function placeSpirits(zoneKey: string, pool: CatalogTrack[]): Spirit[] {
    if (!pool.length) return []
    const cand: { tx: number; ty: number }[] = []
    for (let ty = 0; ty < MAP_H; ty++) for (let tx = 0; tx < TOWN[ty].length; tx++) { const c = TOWN[ty][tx]; if (c === '.' || c === 'T') cand.push({ tx, ty }) }
    const rng = mulberry32(hashStr(zoneKey, 'spirits'))
    const tiles = cand.map(v => ({ v, k: rng() })).sort((a, b) => a.k - b.k).map(o => o.v)
    const trng = mulberry32(hashStr(zoneKey, 'tracks'))
    const tracks = pool.map(v => ({ v, k: trng() })).sort((a, b) => a.k - b.k).map(o => o.v)
    const out: Spirit[] = []
    const CAP = Math.min(18, tracks.length), MINSEP = 3
    for (const t of tiles) {
        if (out.length >= CAP) break
        if (out.some(p => Math.hypot(p.tx - t.tx, p.ty - t.ty) < MINSEP)) continue
        const track = tracks[out.length]
        out.push({ track, tx: t.tx, ty: t.ty, color: bioColor(track.genres?.[0]), kept: songlineHas(track.id) })
    }
    return out
}

// ─────────────────────────────────────────────────────────────────────────────
export function SoundTownView({ onTrackSelect, onPlayTrack, onBack }: SoundTownProps) {
    const wrapRef = useRef<HTMLDivElement>(null)
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const bakeRef = useRef<HTMLCanvasElement | null>(null)
    const vigRef = useRef<HTMLCanvasElement | null>(null)
    const rafRef = useRef(0)
    const dirtyRef = useRef(true)

    const audioRef = useRef<SoundTownAudio | null>(null)
    if (!audioRef.current) audioRef.current = new SoundTownAudio()

    const worldRef = useRef<World | null>(null)
    const visitedRef = useRef<Set<string>>(new Set())
    const accentRef = useRef('#4fe0d0')
    const spiritsRef = useRef<Spirit[]>([])
    const npcsRef = useRef<Npc[]>([])
    const npcSetRef = useRef<Set<string>>(new Set())
    const particlesRef = useRef<{ x: number; y: number; vy: number; ph: number; a: number }[]>([])

    const playerRef = useRef({ tx: 5, ty: 10, fromTx: 5, fromTy: 10, prog: 1, dir: 'down' as Dir, moving: false })
    const keysRef = useRef<Set<string>>(new Set())
    const camRef = useRef({ x: 0, y: 0 })
    const lastTsRef = useRef(0)
    const audioAccRef = useRef(0)

    const [loading, setLoading] = useState(true)
    const [computing, setComputing] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [townName, setTownName] = useState('')
    const [activeZone, setActiveZone] = useState('')
    const [, setVisitedV] = useState(0)

    const [enc, setEnc] = useState<Enc | null>(null)
    const [encNote, setEncNote] = useState('')
    const [typed, setTyped] = useState(0)            // chars revealed (Undertale type-on)
    const [npcDialog, setNpcDialog] = useState<Npc | null>(null)
    const [sign, setSign] = useState<string | null>(null)
    const [toast, setToast] = useState<string | null>(null)
    const [songlineOpen, setSonglineOpen] = useState(false)
    const [mapOpen, setMapOpen] = useState(false)
    const [songlineCount, setSonglineCount] = useState(0)
    const [muted, setMuted] = useState(audioRef.current.muted)

    const blockedRef = useRef(false)
    blockedRef.current = !!(enc || npcDialog || sign || songlineOpen || mapOpen)

    useEffect(() => { setSonglineCount(readSongline().length) }, [])
    const flash = useCallback((m: string) => { setToast(m); window.setTimeout(() => setToast(t => (t === m ? null : t)), 1700) }, [])

    // ── Fetch catalog → build world → enter the biggest genre ───────────────────
    useEffect(() => {
        let dead = false
        const poll = async () => {
            try {
                const res = await fetch(`${BASE_URL}/catalog/map`)
                if (!res.ok) throw new Error(`HTTP ${res.status}`)
                const d = await res.json(); if (dead) return
                if (d.computing) { setComputing(true); window.setTimeout(poll, 3000); return }
                setComputing(false)
                const genres: GenreCentroid[] = d.genres ?? []
                if (!genres.length) { setError('No genres in the catalog yet — ingest some tracks first.'); return }
                const w = buildWorld(d.tracks ?? [], genres); worldRef.current = w
                enterZone(w.order[0])
            } catch (e: any) { if (!dead) setError(e.message) }
            finally { if (!dead) setLoading(false) }
        }
        poll(); return () => { dead = true }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const enterZone = useCallback((key: string, viaWarp = false) => {
        const w = worldRef.current; if (!w) return
        const meta = w.zones.get(key); if (!meta) return
        audioRef.current?.silenceAll()
        accentRef.current = bioColor(meta.genre)
        setTownName(meta.genre)
        const pool = w.pools.get(key) ?? []
        spiritsRef.current = placeSpirits(key, pool)

        // NPCs ← distinct artists
        const byArtist = new Map<string, CatalogTrack[]>()
        for (const t of pool) { if (!t.artist) continue; if (!byArtist.has(t.artist)) byArtist.set(t.artist, []); byArtist.get(t.artist)!.push(t) }
        const artists = [...byArtist.entries()].sort((a, b) => b[1].length - a[1].length).map(e => e[0])
        const spawns: { tx: number; ty: number }[] = []
        for (let ty = 0; ty < MAP_H; ty++) for (let tx = 0; tx < TOWN[ty].length; tx++) if (TOWN[ty][tx] === 'N') spawns.push({ tx, ty })
        npcsRef.current = spawns.map((s, i) => { const a = artists[i % Math.max(1, artists.length)] || '—'; return { tx: s.tx, ty: s.ty, artist: a, tracks: byArtist.get(a) ?? [] } })
        npcSetRef.current = new Set(npcsRef.current.map(n => `${n.tx},${n.ty}`))

        const sp = findSpawn()
        playerRef.current = { tx: sp.tx, ty: sp.ty, fromTx: sp.tx, fromTy: sp.ty, prog: 1, dir: 'down', moving: false }
        bakeRef.current = bakeTerrain(accentRef.current)
        visitedRef.current.add(key); setVisitedV(v => v + 1)
        setActiveZone(key)
        if (viaWarp) audioRef.current?.warp()
        setEnc(null); setNpcDialog(null); setSign(null); setMapOpen(false)
        dirtyRef.current = true
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    // ── Terrain bake (dark) ─────────────────────────────────────────────────────
    const bakeTerrain = (accent: string): HTMLCanvasElement => {
        const cv = document.createElement('canvas'); cv.width = MAP_W * TILE; cv.height = MAP_H * TILE
        const g = cv.getContext('2d')!
        for (let ty = 0; ty < MAP_H; ty++) for (let tx = 0; tx < MAP_W; tx++) drawTile(g, tileAt(tx, ty), tx * TILE, ty * TILE, tx, ty, accent)
        return cv
    }
    const drawTile = (g: CanvasRenderingContext2D, c: string, x: number, y: number, tx: number, ty: number, accent: string) => {
        const checker = (tx + ty) % 2 === 0
        g.fillStyle = checker ? FLOOR : FLOOR2; g.fillRect(x, y, TILE, TILE)
        switch (c) {
            case ',': case 'X': {
                g.fillStyle = PATH; g.fillRect(x, y, TILE, TILE)
                if (c === 'X') { g.fillStyle = WALL; g.fillRect(x, y, 4, TILE); g.fillRect(x + TILE - 4, y, 4, TILE); g.fillStyle = accent; g.globalAlpha = 0.5; g.fillRect(x, y, TILE, 4); g.globalAlpha = 1 }
                break
            }
            case 'T': {
                g.fillStyle = checker ? '#13241a' : '#102017'; g.fillRect(x, y, TILE, TILE)
                g.fillStyle = '#1c3324'; for (let i = 0; i < 4; i++) g.fillRect(x + 4 + i * 8, y + TILE - 13, 2, 10); break
            }
            case '~': { g.fillStyle = checker ? WATER : WATER2; g.fillRect(x, y, TILE, TILE); g.fillStyle = 'rgba(120,180,230,0.10)'; g.fillRect(x + 6, y + 11, 12, 2); g.fillRect(x + 15, y + 22, 9, 2); break }
            case 'R': { g.fillStyle = '#05060a'; g.fillRect(x, y, TILE, TILE); g.fillStyle = STONE; roundRect(g, x + 4, y + 7, TILE - 8, TILE - 11, 6); g.fill(); g.fillStyle = '#161b26'; roundRect(g, x + 7, y + 6, TILE - 16, TILE - 16, 4); g.fill(); break }
            case '#': { g.fillStyle = WALL; g.fillRect(x, y, TILE, TILE); g.fillStyle = '#05060a'; g.beginPath(); g.arc(x + TILE / 2, y + TILE / 2, TILE * 0.42, 0, Math.PI * 2); g.fill(); break }
            case 'H': case 'B': {
                g.fillStyle = WALL; g.fillRect(x, y, TILE, TILE); g.fillStyle = '#10131c'; g.fillRect(x, y, TILE, TILE * 0.42)
                g.fillStyle = accent; g.globalAlpha = 0.5; g.fillRect(x + TILE * 0.3, y + TILE * 0.55, TILE * 0.4, TILE * 0.28); g.globalAlpha = 1; break
            }
            case 'D': { g.fillStyle = WALL; g.fillRect(x, y, TILE, TILE); g.fillStyle = accent; g.globalAlpha = 0.7; g.fillRect(x + 9, y + 7, TILE - 18, TILE - 7); g.globalAlpha = 1; break }
            case 'S': { g.fillStyle = '#2a2018'; g.fillRect(x + TILE / 2 - 2, y + TILE - 14, 4, 12); g.fillStyle = '#3a2e22'; g.fillRect(x + 6, y + 6, TILE - 12, 13); break }
        }
    }

    // ── Canvas sizing + vignette + particles ────────────────────────────────────
    useEffect(() => {
        const wr = wrapRef.current; if (!wr) return
        const sync = () => {
            const dpr = window.devicePixelRatio || 1
            const { width: w, height: h } = wr.getBoundingClientRect()
            const cv = canvasRef.current; if (!cv || !w || !h) return
            cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr)
            cv.style.width = `${w}px`; cv.style.height = `${h}px`
            // vignette
            const vg = document.createElement('canvas'); vg.width = w; vg.height = h
            const vc = vg.getContext('2d')!
            const grad = vc.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.25, w / 2, h / 2, Math.max(w, h) * 0.72)
            grad.addColorStop(0, 'rgba(5,6,10,0)'); grad.addColorStop(1, 'rgba(4,5,9,0.92)')
            vc.fillStyle = grad; vc.fillRect(0, 0, w, h); vigRef.current = vg
            // particles
            particlesRef.current = Array.from({ length: 16 }, () => ({ x: Math.random() * w, y: Math.random() * h, vy: 4 + Math.random() * 5, ph: Math.random() * 6.28, a: 0.08 + Math.random() * 0.22 }))
            dirtyRef.current = true
        }
        const ro = new ResizeObserver(sync); ro.observe(wr); sync(); return () => ro.disconnect()
    }, [])

    const closeOverlays = useCallback(() => { setEnc(null); setNpcDialog(null); setSign(null); setSonglineOpen(false); setMapOpen(false); audioRef.current?.unfocus() }, [])

    // ── Open an encounter (a met shade, or a mined / fished catch) ───────────────
    const openEncounter = useCallback((track: CatalogTrack, verb: VerbKind, homeZone: string, color: string, spirit: Spirit | null) => {
        const e: Enc = { track, verb, fromZone: activeZone, homeZone, color, line: spiritLine(track), spirit }
        setEnc(e); setEncNote(''); setTyped(0)
        fetchPreviewUrl(track).then(url => audioRef.current?.focusTrack(url))
    }, [activeZone])

    // ── Interact (space) ────────────────────────────────────────────────────────
    const interact = useCallback(() => {
        if (enc) { if (typed < enc.line.length) setTyped(enc.line.length); return }   // finish type-on, don't close
        if (npcDialog || sign) { closeOverlays(); return }
        if (mapOpen || songlineOpen) { closeOverlays(); return }
        const w = worldRef.current; if (!w) return
        const p = playerRef.current
        // nearest unkept shade within meeting range
        let near: Spirit | null = null, nd = MEET_R
        for (const s of spiritsRef.current) { if (s.kept) continue; const d = Math.hypot(s.tx - p.tx, s.ty - p.ty); if (d <= nd) { nd = d; near = s } }
        if (near) { audioRef.current?.menu(); openEncounter(near.track, 'forage', activeZone, near.color, near); return }
        const [dx, dy] = DELTA[p.dir]; const fx = p.tx + dx, fy = p.ty + dy
        const npc = npcsRef.current.find(n => n.tx === fx && n.ty === fy)
        if (npc) { setNpcDialog(npc); audioRef.current?.menu(); return }
        const c = tileAt(fx, fy)
        if (c === 'R') { const y = resolveMine(w, activeZone); if (y) { audioRef.current?.menu(); openEncounter(y.track, 'mine', y.homeZone, bioColor(y.track.genres?.[0]), null) } }
        else if (c === '~') { const y = resolveFish(w, activeZone); if (y) { audioRef.current?.menu(); openEncounter(y.track, 'fish', y.homeZone, bioColor(y.track.genres?.[0]), null) } }
        else if (c === 'S') setSign(`${townName.toUpperCase()} — pop. ${spiritsRef.current.length} shades. Each glow is a song, singing to no one. Walk toward what you hear. ⛏ rock for deep cuts · 🎣 water for strange catches · the gate (X) opens the map.`)
        else if (c === 'D') flash('The door is sealed. (Interiors are still dark.)')
        else if (c === 'X') { setMapOpen(true); audioRef.current?.menu() }
    }, [enc, typed, npcDialog, sign, mapOpen, songlineOpen, activeZone, townName, closeOverlays, openEncounter, flash])

    // ── Keyboard ────────────────────────────────────────────────────────────────
    useEffect(() => {
        const MOVE: Record<string, Dir> = { w: 'up', s: 'down', a: 'left', d: 'right', arrowup: 'up', arrowdown: 'down', arrowleft: 'left', arrowright: 'right' }
        const onDown = (e: KeyboardEvent) => {
            if ((e.target as HTMLElement)?.tagName === 'INPUT') return
            audioRef.current?.resume()
            const k = e.key.toLowerCase()
            if (k in MOVE) { keysRef.current.add(MOVE[k]); e.preventDefault(); return }
            if (k === ' ' || k === 'enter') { e.preventDefault(); interact() }
            else if (k === 'escape') closeOverlays()
            else if (k === 'b') { setSonglineCount(readSongline().length); setSonglineOpen(s => !s); audioRef.current?.menu() }
            else if (k === 'm') { setMapOpen(s => !s); audioRef.current?.menu() }
        }
        const onUp = (e: KeyboardEvent) => { const k = e.key.toLowerCase(); if (k in MOVE) keysRef.current.delete(MOVE[k]) }
        window.addEventListener('keydown', onDown); window.addEventListener('keyup', onUp)
        return () => { window.removeEventListener('keydown', onDown); window.removeEventListener('keyup', onUp) }
    }, [interact, closeOverlays])

    // ── Undertale type-on for the encounter line ────────────────────────────────
    useEffect(() => {
        if (!enc) return
        if (typed >= enc.line.length) return
        const id = window.setTimeout(() => {
            setTyped(t => {
                const n = Math.min(enc.line.length, t + 1)
                if (enc.line[n - 1] && enc.line[n - 1] !== ' ') audioRef.current?.voiceBlip(0.8 + (hashStr(enc.track.id) % 80) / 100)
                return n
            })
        }, enc.line[typed] && /[.,!?]/.test(enc.line[typed]) ? 160 : 26)
        return () => window.clearTimeout(id)
    }, [enc, typed])

    // ── Game loop ───────────────────────────────────────────────────────────────
    useEffect(() => {
        const cv = canvasRef.current; if (!cv) return
        const ctx = cv.getContext('2d')!; let running = true
        const loop = (ts: number) => {
            if (!running) return
            const dt = lastTsRef.current ? ts - lastTsRef.current : 16; lastTsRef.current = ts
            const dpr = window.devicePixelRatio || 1
            const W = cv.width / dpr, H = cv.height / dpr
            const p = playerRef.current

            if (!blockedRef.current && worldRef.current) {
                if (!p.moving) {
                    let dir: Dir | null = null
                    for (const d of ['up', 'down', 'left', 'right'] as Dir[]) if (keysRef.current.has(d)) { dir = d; break }
                    if (dir) { p.dir = dir; const [dx, dy] = DELTA[dir]; const nx = p.tx + dx, ny = p.ty + dy; if (!isWall(nx, ny, npcSetRef.current)) { p.fromTx = p.tx; p.fromTy = p.ty; p.tx = nx; p.ty = ny; p.prog = 0; p.moving = true } dirtyRef.current = true }
                }
                if (p.moving) { p.prog += dt / STEP_MS; dirtyRef.current = true; if (p.prog >= 1) { p.prog = 1; p.moving = false; p.fromTx = p.tx; p.fromTy = p.ty; audioRef.current?.footstep() } }
            }

            const px = (p.fromTx + (p.tx - p.fromTx) * p.prog) * TILE
            const py = (p.fromTy + (p.ty - p.fromTy) * p.prog) * TILE
            const pcx = px / TILE, pcy = py / TILE   // player tile-space centre-ish

            // proximity audio + prefetch (throttled, runs regardless of dirty)
            audioAccRef.current += dt
            if (audioAccRef.current >= AUDIO_TICK_MS && worldRef.current) {
                audioAccRef.current = 0
                const kept = new Set<string>(); const list: SpiritAudio[] = []
                for (const s of spiritsRef.current) {
                    const d = Math.hypot(s.tx - pcx, s.ty - pcy)
                    if (d < 8.5) ensureUrl(s.track)
                    if (s.kept) kept.add(s.track.id)
                    list.push({ id: s.track.id, tx: s.tx, ty: s.ty, url: previewCache.get(s.track.id) ?? null })
                }
                if (!blockedRef.current) audioRef.current?.updateProximity(pcx, pcy, list, kept)
            }
            dirtyRef.current = true   // glows/particles animate → repaint (cheap dark scene)

            let camX = px + TILE / 2 - W / 2, camY = py + TILE / 2 - H / 2
            const maxX = MAP_W * TILE - W, maxY = MAP_H * TILE - H
            camX = maxX > 0 ? Math.max(0, Math.min(maxX, camX)) : maxX / 2
            camY = maxY > 0 ? Math.max(0, Math.min(maxY, camY)) : maxY / 2
            camRef.current = { x: camX, y: camY }

            // ── render ──
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.imageSmoothingEnabled = false
            ctx.fillStyle = VOID; ctx.fillRect(0, 0, W, H)
            if (bakeRef.current) ctx.drawImage(bakeRef.current, camX, camY, W, H, 0, 0, W, H)

            // shades
            for (const s of spiritsRef.current) {
                const sx = s.tx * TILE + TILE / 2 - camX, sy = s.ty * TILE + TILE / 2 - camY
                if (sx < -40 || sx > W + 40 || sy < -40 || sy > H + 40) continue
                const d = Math.hypot(s.tx - pcx, s.ty - pcy)
                const reveal = Math.max(0.12, Math.min(1, (LIT_R - d) / 2.4 + 0.2))
                // Far, unrevealed shades: a single faint dot (no additive glow) — keeps
                // the 'lighter'-composite cost bounded to the few near the lantern.
                if (!s.kept && d > LIT_R + 2.5) {
                    ctx.globalAlpha = 0.18; ctx.fillStyle = s.color; ctx.beginPath(); ctx.arc(sx, sy, 2, 0, 6.28); ctx.fill(); ctx.globalAlpha = 1
                    continue
                }
                const breathe = 0.85 + 0.15 * Math.sin(ts * 0.0016 + s.tx * 2 + s.ty)
                ctx.globalCompositeOperation = 'lighter'
                if (s.kept) {
                    const gsz = 70; ctx.globalAlpha = 0.6; ctx.drawImage(glow(gsz, LANTERN), sx - gsz / 2, sy - gsz / 2)
                    ctx.globalAlpha = 1; ctx.fillStyle = LANTERN; ctx.beginPath(); ctx.arc(sx, sy, 3, 0, 6.28); ctx.fill()
                } else {
                    const gsz = 64 * (0.7 + reveal * 0.7); ctx.globalAlpha = reveal * breathe * 0.9
                    ctx.drawImage(glow(gsz, s.color), sx - gsz / 2, sy - gsz / 2)
                    ctx.globalAlpha = Math.min(1, reveal + 0.15); ctx.fillStyle = s.color
                    ctx.beginPath(); ctx.arc(sx, sy, 3.5, 0, 6.28); ctx.fill()
                    ctx.globalAlpha = reveal * 0.8; ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(sx, sy - 1, 1.4, 0, 6.28); ctx.fill()
                }
                ctx.globalCompositeOperation = 'source-over'
                if (d < RECOG_R && !s.kept) {
                    ctx.globalAlpha = Math.min(1, (RECOG_R - d) / 1.2); ctx.fillStyle = TEXT
                    ctx.font = `600 11px ${SANS}`; ctx.textAlign = 'center'
                    ctx.fillText(s.track.title.length > 24 ? s.track.title.slice(0, 22) + '…' : s.track.title, sx, sy - 16)
                    ctx.fillStyle = TEXTDIM; ctx.font = `10px ${SANS}`; ctx.fillText(s.track.artist, sx, sy - 4)
                    ctx.globalAlpha = 1
                }
            }

            // NPCs (dim figures)
            const [fdx, fdy] = DELTA[p.dir]
            for (const n of npcsRef.current) {
                const sx = n.tx * TILE - camX, sy = n.ty * TILE - camY
                if (sx < -TILE || sx > W || sy < -TILE || sy > H) continue
                drawFigure(ctx, sx, sy, TILE, 'down', 0, '#2a3040', '#1a2030', false, accentRef.current)
                if (p.tx + fdx === n.tx && p.ty + fdy === n.ty) { ctx.fillStyle = TEXT; ctx.font = `13px ${SANS}`; ctx.textAlign = 'center'; ctx.fillText('💬', sx + TILE / 2, sy - 4) }
            }
            // verb hint on faced tile
            const ahead = tileAt(p.tx + fdx, p.ty + fdy)
            if (ahead === 'R' || ahead === '~' || ahead === 'X') { ctx.fillStyle = TEXT; ctx.font = `13px ${SANS}`; ctx.textAlign = 'center'; ctx.fillText(ahead === 'R' ? '⛏' : ahead === '~' ? '🎣' : '🗺', (p.tx + fdx) * TILE - camX + TILE / 2, (p.ty + fdy) * TILE - camY - 4) }

            // particles (additive motes)
            ctx.globalCompositeOperation = 'lighter'
            for (const m of particlesRef.current) {
                m.y -= m.vy * dt / 1000; m.ph += dt / 1400; if (m.y < -10) { m.y = H + 10; m.x = Math.random() * W }
                const mx = m.x + Math.sin(m.ph) * 8; ctx.globalAlpha = m.a; ctx.drawImage(glow(10, '#9fb4d8'), mx - 5, m.y - 5)
            }
            ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'

            // player + lantern
            ctx.globalCompositeOperation = 'lighter'
            const lpulse = 0.78 + 0.18 * Math.sin(ts * 0.003)
            ctx.globalAlpha = lpulse; const lg = 150; ctx.drawImage(glow(lg, LANTERN), px - camX + TILE / 2 - lg / 2, py - camY + TILE / 2 - lg / 2)
            ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'
            const walkBob = p.moving ? Math.abs(Math.sin(p.prog * Math.PI)) * 2 : 0
            drawFigure(ctx, px - camX, py - camY, TILE, p.dir, walkBob, '#0a0b10', '#10131c', true, '#4fe0d0')

            // vignette
            if (vigRef.current) ctx.drawImage(vigRef.current, 0, 0, W, H)

            rafRef.current = requestAnimationFrame(loop)
        }
        rafRef.current = requestAnimationFrame(loop)
        return () => { running = false; cancelAnimationFrame(rafRef.current) }
    }, [activeZone, openEncounter])

    useEffect(() => () => audioRef.current?.dispose(), [])

    const keep = useCallback(() => {
        if (!enc) return
        const ok = keepInSongline({ track: enc.track, verb: enc.verb, fromZone: enc.fromZone, homeZone: enc.homeZone }, activeZone, encNote)
        setSonglineCount(readSongline().length)
        if (ok) { audioRef.current?.catch_(); if (enc.spirit) enc.spirit.kept = true }
        flash(ok ? `Kept “${enc.track.title}” — it brightens, and goes quiet` : 'Already in your songline')
        audioRef.current?.unfocus(); setEnc(null)
    }, [enc, activeZone, encNote, flash])

    const toggleMute = () => { const m = !muted; setMuted(m); audioRef.current?.setMuted(m) }
    const accent = accentRef.current
    const w = worldRef.current

    return (
        <div ref={wrapRef} style={{ position: 'absolute', inset: 0, background: VOID, overflow: 'hidden', userSelect: 'none' }}>
            <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: '100%', imageRendering: 'pixelated' }} />

            {/* Orientation contract */}
            <div style={{ position: 'absolute', top: 14, left: 14, pointerEvents: 'none' }}>
                <div style={{ background: 'rgba(10,11,16,0.75)', color: accent, border: `1px solid ${accent}55`, padding: '5px 12px', borderRadius: 7, fontFamily: SANS, fontWeight: 700, fontSize: 14, letterSpacing: 0.4, textShadow: `0 0 12px ${accent}99` }}>
                    {townName ? `${townName.toUpperCase()}` : 'loading…'}
                </div>
            </div>
            <div style={{ position: 'absolute', top: 16, right: 14, display: 'flex', gap: 8 }}>
                <button onClick={() => setMapOpen(true)} style={pillBtn(accent)}>🗺 map</button>
                <button onClick={() => { setSonglineCount(readSongline().length); setSonglineOpen(true) }} style={pillBtn(accent)}>🎒 {songlineCount}</button>
                <button onClick={toggleMute} style={pillBtn('#2a3040')}>{muted ? '🔇' : '🔊'}</button>
                {onBack && <button onClick={() => { audioRef.current?.silenceAll(); onBack() }} style={pillBtn('#2a3040')}>✕</button>}
            </div>
            <div style={{ position: 'absolute', bottom: 12, left: 14, fontFamily: MONO, fontSize: 11, color: 'rgba(200,210,225,0.6)', pointerEvents: 'none', lineHeight: 1.6 }}>
                WASD — walk into the dark · listen · space — meet what's glowing · M — map · B — songline
            </div>

            {loading && !computing && <Center>waking in the dark…</Center>}
            {computing && <Center>the cartographer is drawing the land…<br /><span style={{ fontSize: 12, opacity: 0.7 }}>(projecting the catalog)</span></Center>}
            {error && <Center>⚠ {error}</Center>}

            {/* Undertale dialogue — the encounter */}
            {enc && (
                <DialogueBox accent={enc.color}>
                    <div style={{ display: 'flex', gap: 14 }}>
                        <div style={{ width: 88, height: 88, flexShrink: 0, borderRadius: 8, border: `2px solid ${enc.color}`, background: 'radial-gradient(circle, ' + enc.color + '55, #05060a)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 30 }}>{VERB_FLAVOR[enc.verb].icon}</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontFamily: MONO, fontSize: 15, color: TEXT, lineHeight: 1.5, minHeight: 44 }}>{enc.line.slice(0, typed)}<span style={{ opacity: typed < enc.line.length ? 1 : 0 }}>▌</span></div>
                            {typed >= enc.line.length && (
                                <>
                                    <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: 17, color: TEXT, marginTop: 8 }}>{enc.track.title}</div>
                                    <div style={{ fontFamily: SANS, fontSize: 13, color: TEXTDIM }}>{enc.track.artist}{enc.verb === 'fish' && enc.homeZone !== enc.fromZone ? ` · a ${enc.homeZone} track, drifted in` : ''}</div>
                                </>
                            )}
                        </div>
                    </div>
                    {typed >= enc.line.length && (
                        <>
                            <input value={encNote} onChange={e => setEncNote(e.target.value)} placeholder="why this one? (optional — becomes part of the memory)"
                                style={{ width: '100%', boxSizing: 'border-box', margin: '12px 0 10px', padding: '7px 10px', borderRadius: 7, border: `1px solid ${FRAME}`, fontFamily: SANS, fontSize: 13, background: '#05060a', color: TEXT }} />
                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                <button style={actBtn(enc.color, true)} onClick={keep}>✦ Keep</button>
                                <button style={actBtn('#62b6ff', false)} onClick={() => onPlayTrack?.(enc.track)}>Play</button>
                                <button style={actBtn('#8a94a4', false)} onClick={() => { const t = enc.track; closeOverlays(); onTrackSelect?.(t) }}>Wiki →</button>
                                <button style={actBtn('#6a7080', false)} onClick={closeOverlays}>Leave</button>
                            </div>
                        </>
                    )}
                </DialogueBox>
            )}

            {/* NPC */}
            {npcDialog && (
                <DialogueBox accent={accent}>
                    <div style={{ fontFamily: MONO, fontSize: 11, color: accent, letterSpacing: 1, marginBottom: 4 }}>💬 A LOCAL VOICE</div>
                    <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: 18, color: TEXT, marginBottom: 8 }}>{npcDialog.artist}</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 190, overflowY: 'auto' }}>
                        {npcDialog.tracks.slice(0, 8).map(t => (
                            <button key={t.id} style={trackRow} onClick={() => { closeOverlays(); onTrackSelect?.(t) }}>
                                <span style={{ color: TEXT, fontWeight: 600 }}>{t.title}</span><span style={{ color: TEXTDIM, fontSize: 11 }}>{t.genres?.[0] ?? ''}</span>
                            </button>
                        ))}
                    </div>
                    <button style={{ ...actBtn('#6a7080', false), marginTop: 12 }} onClick={closeOverlays}>Goodbye</button>
                </DialogueBox>
            )}

            {sign && (
                <div onClick={() => setSign(null)} style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', paddingBottom: 56, cursor: 'pointer' }}>
                    <div style={{ background: PANEL, border: `3px solid ${TEXT}`, padding: '16px 20px', maxWidth: 470, fontFamily: MONO, fontSize: 14, color: TEXT, lineHeight: 1.55 }}>
                        {sign}<div style={{ fontSize: 10, opacity: 0.5, marginTop: 8 }}>▾ click to close</div>
                    </div>
                </div>
            )}

            {mapOpen && w && <WorldMap world={w} visited={visitedRef.current} current={activeZone} onTravel={k => enterZone(k, true)} onClose={() => setMapOpen(false)} />}
            {songlineOpen && <SonglinePanel onClose={() => setSonglineOpen(false)} onOpen={t => { closeOverlays(); onTrackSelect?.(t) }} onPlay={t => onPlayTrack?.(t)} />}

            {toast && <div style={{ position: 'absolute', bottom: 66, left: '50%', transform: 'translateX(-50%)', background: PANEL, color: TEXT, border: `1px solid ${FRAME}`, padding: '8px 16px', borderRadius: 20, fontFamily: SANS, fontSize: 13 }}>{toast}</div>}
        </div>
    )
}

// ── Figure sprite (player or NPC) ─────────────────────────────────────────────
function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, wd: number, h: number, r: number) {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + wd, y, x + wd, y + h, r); ctx.arcTo(x + wd, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + wd, y, r); ctx.closePath()
}
function drawFigure(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, dir: Dir, bob: number, body: string, hair: string, isPlayer: boolean, rim: string) {
    const cx = x + s / 2, feet = y + s - 3
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(cx, feet, s * 0.26, s * 0.1, 0, 0, 6.28); ctx.fill()
    const top = y + 2 - bob, bw = s * 0.5, bh = s * 0.42, bx = cx - bw / 2, by = top + s * 0.4
    if (isPlayer) { ctx.fillStyle = PRECIOUS; ctx.beginPath(); ctx.moveTo(cx - bw * 0.4, by); ctx.lineTo(cx + bw * 0.4, by); ctx.lineTo(cx + bw * 0.6 + bob, by + bh + 3); ctx.lineTo(cx - bw * 0.6 - bob, by + bh + 3); ctx.closePath(); ctx.fill() }
    ctx.fillStyle = body; roundRect(ctx, bx, by, bw, bh, 4); ctx.fill()
    if (isPlayer) { ctx.lineWidth = 1.4; ctx.strokeStyle = rim; ctx.stroke() }
    const hr = s * 0.23, hx = cx, hy = top + s * 0.34
    ctx.fillStyle = '#d8c2a0'; ctx.beginPath(); ctx.arc(hx, hy, hr, 0, 6.28); ctx.fill()
    if (isPlayer) { ctx.lineWidth = 1.4; ctx.strokeStyle = rim; ctx.stroke() }
    ctx.fillStyle = hair; ctx.beginPath(); ctx.arc(hx, top + s * 0.30, hr, Math.PI, 0); ctx.fill(); ctx.fillRect(hx - hr, top + s * 0.28, hr * 2, hr * 0.5)
    ctx.fillStyle = '#05060a'; const ey = hy + s * 0.02; const d = (a: number) => { ctx.beginPath(); ctx.arc(a, ey, 1.5, 0, 6.28); ctx.fill() }
    if (dir === 'down') { d(hx - hr * 0.4); d(hx + hr * 0.4) } else if (dir === 'left') d(hx - hr * 0.5); else if (dir === 'right') d(hx + hr * 0.5)
}

// ── World map — a constellation on the same dark void ─────────────────────────
function WorldMap({ world, visited, current, onTravel, onClose }: { world: World; visited: Set<string>; current: string; onTravel: (k: string) => void; onClose: () => void }) {
    const zones = [...world.zones.values()]
    const xs = zones.map(z => z.cx), ys = zones.map(z => z.cy)
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys)
    const PAD = 56, W = 720, H = 460
    const nx = (x: number) => PAD + ((x - minX) / (maxX - minX || 1)) * (W - PAD * 2)
    const ny = (y: number) => PAD + ((y - minY) / (maxY - minY || 1)) * (H - PAD * 2)
    const reach = reachableZones(world, visited)
    const edges: [number, number, number, number, boolean][] = []
    const seen = new Set<string>()
    for (const z of zones) for (const nk of z.neighbors) { const o = world.zones.get(nk); if (!o) continue; const key = [z.key, nk].sort().join('|'); if (seen.has(key)) continue; seen.add(key); edges.push([nx(z.cx), ny(z.cy), nx(o.cx), ny(o.cy), visited.has(z.key) && visited.has(nk)]) }
    return (
        <div onClick={onClose} style={overlayWrap}>
            <div onClick={e => e.stopPropagation()} style={{ background: VOID, border: `2px solid ${FRAME}`, padding: 20, boxShadow: '0 16px 60px rgba(0,0,0,0.7)' }}>
                <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: 17, color: TEXT }}>✦ The Constellation — your taste, mapped</div>
                <div style={{ fontFamily: MONO, fontSize: 11, color: TEXTDIM, margin: '3px 0 10px' }}>towns near each other sound alike · bright = walked · ringed = here · faint = unexplored</div>
                <svg width={W} height={H} style={{ display: 'block', background: '#070810', border: `1px solid ${FRAME}55` }}>
                    {edges.map(([x1, y1, x2, y2, solid], i) => <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#2a3344" strokeWidth={1} strokeDasharray={solid ? '0' : '3 4'} />)}
                    {zones.map(z => {
                        const isCur = z.key === current, isVis = visited.has(z.key), canGo = reach.has(z.key) && !isCur
                        const r = Math.max(6, Math.min(16, Math.sqrt(z.count) * 1.3)); const col = bioColor(z.genre)
                        const op = isVis ? 1 : canGo ? 0.55 : 0.18
                        return (
                            <g key={z.key} style={{ cursor: canGo ? 'pointer' : 'default' }} onClick={() => canGo && onTravel(z.key)}>
                                <circle cx={nx(z.cx)} cy={ny(z.cy)} r={r * 2.2} fill={col} opacity={op * 0.18} />
                                {isCur && <circle cx={nx(z.cx)} cy={ny(z.cy)} r={r + 6} fill="none" stroke={LANTERN} strokeWidth={1.5} opacity={0.9} />}
                                <circle cx={nx(z.cx)} cy={ny(z.cy)} r={r} fill={col} opacity={op} />
                                {(isVis || canGo) && <text x={nx(z.cx)} y={ny(z.cy) + r + 13} textAnchor="middle" fontFamily={SANS} fontSize={11} fontWeight={isVis ? 700 : 400} fill={TEXT} opacity={op}>{z.genre}</text>}
                            </g>
                        )
                    })}
                </svg>
                <div style={{ fontFamily: MONO, fontSize: 10, color: TEXTDIM, marginTop: 9 }}>click a reachable town to travel · M / Esc — close</div>
            </div>
        </div>
    )
}

// ── Songline / satchel — the artifact ─────────────────────────────────────────
function SonglinePanel({ onClose, onOpen, onPlay }: { onClose: () => void; onOpen: (t: any) => void; onPlay: (t: any) => void }) {
    const entries = readSongline()
    const sorted = [...entries].sort((a, b) => b.t - a.t)
    return (
        <div onClick={onClose} style={overlayWrap}>
            <div onClick={e => e.stopPropagation()} style={{ background: VOID, border: `2px solid ${FRAME}`, padding: 20, width: 600, boxShadow: '0 16px 60px rgba(0,0,0,0.7)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: 17, color: TEXT }}>✦ Your Songline</div>
                    <button style={{ ...actBtn('#62b6ff', false), padding: '4px 10px', fontSize: 12 }} disabled={!sorted.length} onClick={() => exportSongline(entries)}>⤓ export</button>
                </div>
                <div style={{ fontFamily: MONO, fontSize: 11, color: TEXTDIM, margin: '4px 0 12px' }}>only what you chose to <b style={{ color: TEXT }}>Keep</b> — each stamped with where & how you found it. content-addressed, yours, portable.</div>
                {sorted.length === 0
                    ? <div style={{ fontFamily: SANS, fontSize: 14, color: TEXTDIM, padding: '22px 0' }}>Empty. Walk toward a glow in the dark, meet it, and Keep what speaks to you.</div>
                    : <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 420, overflowY: 'auto' }}>
                        {sorted.map((e: SonglineEntry) => (
                            <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#0a0c12', border: `1px solid ${FRAME}44`, borderRadius: 8, padding: '9px 12px' }}>
                                <div style={{ fontSize: 17 }}>{VERB_FLAVOR[e.verb]?.icon ?? '🌿'}</div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontFamily: SANS, fontWeight: 600, fontSize: 14, color: TEXT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.title}</div>
                                    <div style={{ fontFamily: SANS, fontSize: 12, color: TEXTDIM }}>{e.artist}</div>
                                    <div style={{ fontFamily: MONO, fontSize: 10, color: '#6a7282', marginTop: 2 }}>{VERB_FLAVOR[e.verb]?.label ?? 'kept'} in {e.zone !== '?' ? e.zone : 'parts unknown'}{e.homeZone !== e.zone && e.homeZone !== '?' ? ` · a ${e.homeZone} track` : ''}{e.note ? ` — “${e.note}”` : ''}</div>
                                </div>
                                <button style={{ ...actBtn('#62b6ff', false), padding: '4px 9px', fontSize: 12 }} onClick={() => onPlay(e)}>▶</button>
                                <button style={{ ...actBtn('#8a94a4', false), padding: '4px 9px', fontSize: 12 }} onClick={() => onOpen(e)}>wiki</button>
                            </div>
                        ))}
                    </div>}
                <div style={{ fontFamily: MONO, fontSize: 10, color: TEXTDIM, marginTop: 12 }}>B / Esc — close</div>
            </div>
        </div>
    )
}

// ── Shared bits ───────────────────────────────────────────────────────────────
const overlayWrap: React.CSSProperties = { position: 'absolute', inset: 0, background: 'rgba(4,5,9,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 5 }
function Center({ children }: { children: React.ReactNode }) {
    return <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', fontFamily: SANS, fontSize: 16, color: TEXT, textShadow: '0 1px 6px rgba(0,0,0,0.8)' }}>{children}</div>
}
function DialogueBox({ accent, children }: { accent: string; children: React.ReactNode }) {
    return <div style={{ position: 'absolute', bottom: 48, left: '50%', transform: 'translateX(-50%)', width: 'min(560px, 92%)', background: PANEL, border: `4px solid ${TEXT}`, padding: 16, boxShadow: `0 0 0 2px #05060a, 0 12px 40px rgba(0,0,0,0.7), inset 0 0 24px ${accent}11`, zIndex: 6 }}>{children}</div>
}
function pillBtn(bg: string): React.CSSProperties {
    return { background: 'rgba(10,11,16,0.8)', color: bg.startsWith('#2') ? TEXT : bg, border: `1px solid ${bg}66`, borderRadius: 16, padding: '6px 12px', fontFamily: SANS, fontSize: 12, fontWeight: 600, cursor: 'pointer' }
}
function actBtn(bg: string, primary: boolean): React.CSSProperties {
    return { background: primary ? bg : 'transparent', color: primary ? '#05060a' : bg, border: `2px solid ${bg}`, borderRadius: 7, padding: '8px 14px', fontFamily: SANS, fontSize: 13, fontWeight: 700, cursor: 'pointer' }
}
const trackRow: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, background: '#0a0c12', border: `1px solid ${FRAME}44`, borderRadius: 7, padding: '8px 11px', fontFamily: SANS, fontSize: 13, cursor: 'pointer', textAlign: 'left' }
