/**
 * SoundTownView.tsx — SoundTown v2: a multimodal, multi-zone discovery RPG.
 *
 * The catalog IS the world.  Each genre is a town; the towns are wired by
 * embedding adjacency into a navigable overworld (open the World Map with M).
 * You walk an avatar (distinct from the locals), and the world affords DATA-
 * AGNOSTIC VERBS that each yield a track with a different musical character:
 *
 *     🌿 forage (tall grass)  — the genre's typical, near-centroid tracks
 *     ⛏  mine   (rock)        — deep cuts at the genre's far edge
 *     🎣 fish   (water)       — serendipity: catches drift in from other genres
 *     💬 talk   (artist NPC)  — an artist hands you their work
 *
 * What you *choose* to Keep enters your SONGLINE — the artifact you build: every
 * track stamped with where / how / when you found it (+ an optional note).  That
 * provenance is the point; a saved track with a story is autobiography, a saved
 * track without one is landfill.  Encounters you Run from are gone — collection
 * is deliberate, never automatic.
 *
 * Audio: one AudioContext (soundtown/audio.ts) — a synthesized per-genre drone
 * bed, the ducked encounter preview, and synth SFX.  World model + verbs +
 * songline are pure (soundtown/world.ts).  Rendering stays cheap 2D canvas
 * (pre-baked terrain blit + a handful of sprites, dirty-flag gated) because this
 * box has no GPU; each town is small, so we never bake a huge map.
 */

import { useRef, useEffect, useState, useCallback } from 'react'
import { SoundTownAudio } from './soundtown/audio'
import {
    buildWorld, reachableZones, genreInk,
    resolveForage, resolveMine, resolveFish, VERB_FLAVOR,
    readSongline, keepInSongline,
    type World, type CatalogTrack, type GenreCentroid, type VerbYield, type SonglineEntry,
} from './soundtown/world'

// ── Palette ───────────────────────────────────────────────────────────────────
const INK = '#1a1714'
const GRASS = '#6f9b54', GRASS_DK = '#5d8746'
const TALL = '#3f6e34', TALL_DK = '#356029'
const DIRT = '#c9a87a', DIRT_DK = '#b8966a'
const WATER = '#5b86b0', WATER_DK = '#4d77a0'
const TREE = '#2f5a3a', TREE_DK = '#244730', TRUNK = '#6b4a2f'
const ROCK = '#938d82', ROCK_DK = '#736d63'
const WOOD = '#b07a4a', WOOD_DK = '#8a5d38', ROOFA = '#c0563f'
const SHADOW = 'rgba(0,0,0,0.18)'
const SAND = '#f7f4ef'
const SANS = '"Geist","Inter",sans-serif'
const MONO = '"Fragment Mono","DM Mono",monospace'

const BASE_URL = (import.meta as any).env?.VITE_CHROMA_URL ?? 'http://localhost:8080'
const ITUNES_CORS = 'https://itunes.apple.com'

const TILE = 36
const STEP_MS = 150
const ENCOUNTER_CHANCE = 0.22

// ── Town template (shared by every genre, themed by accent) ───────────────────
//  #=tree ~=water .=grass ,=path T=tall-grass(forage) R=rock(mine)
//  H=house D=door B=shop S=sign N=npc @=spawn X=gate(world map)
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

interface Npc { tx: number; ty: number; artist: string; tracks: CatalogTrack[]; hue: string }
type Dir = 'up' | 'down' | 'left' | 'right'
const DELTA: Record<Dir, [number, number]> = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }

export interface SoundTownProps {
    onTrackSelect?: (t: { id: string; title: string; artist: string; genres: string[] }) => void
    onPlayTrack?: (t: { id: string; title: string; artist: string; genres: string[] }) => void
    onBack?: () => void
}

// ── iTunes preview (cached) ───────────────────────────────────────────────────
const previewCache = new Map<string, string | null>()
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

// ── Sprites (procedural) ──────────────────────────────────────────────────────
function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
    ctx.beginPath(); ctx.moveTo(x + r, y)
    ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r)
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath()
}
function dot(ctx: CanvasRenderingContext2D, x: number, y: number) { ctx.beginPath(); ctx.arc(x, y, 1.6, 0, Math.PI * 2); ctx.fill() }
function desaturate(hex: string): string {
    // mix any colour ~55% toward muted grey so NPCs recede behind the player
    const m = /^#([0-9a-f]{6})$/i.exec(hex); if (!m) return '#9a948c'
    const n = parseInt(m[1], 16), r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255
    const mix = (c: number) => Math.round(c * 0.45 + 0x9a * 0.55)
    return `rgb(${mix(r)},${mix(g)},${mix(b)})`
}
function drawAvatar(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, dir: Dir, bob: number, body: string, hair: string, isPlayer: boolean) {
    const cx = x + s / 2, feet = y + s - 3
    ctx.fillStyle = SHADOW
    ctx.beginPath(); ctx.ellipse(cx, feet, s * 0.28, s * 0.12, 0, 0, Math.PI * 2); ctx.fill()
    const top = y + 2 - bob
    const bw = s * 0.5, bh = s * 0.42, bx = cx - bw / 2, by = top + s * 0.4
    // cape — player only, sways opposite the walk-bob
    if (isPlayer) {
        ctx.fillStyle = '#b83030'
        ctx.beginPath()
        ctx.moveTo(cx - bw * 0.4, by); ctx.lineTo(cx + bw * 0.4, by)
        ctx.lineTo(cx + bw * 0.6 + bob, by + bh + 3); ctx.lineTo(cx - bw * 0.6 - bob, by + bh + 3)
        ctx.closePath(); ctx.fill()
    }
    // body
    ctx.fillStyle = body; roundRect(ctx, bx, by, bw, bh, 4); ctx.fill()
    if (isPlayer) { ctx.lineWidth = 1.5; ctx.strokeStyle = INK; ctx.stroke() }
    // head
    const hr = s * 0.24, hx = cx, hy = top + s * 0.34
    ctx.fillStyle = '#f0d6b8'; ctx.beginPath(); ctx.arc(hx, hy, hr, 0, Math.PI * 2); ctx.fill()
    if (isPlayer) { ctx.lineWidth = 1.5; ctx.strokeStyle = INK; ctx.stroke() }
    // hair / hat
    ctx.fillStyle = hair
    ctx.beginPath(); ctx.arc(hx, top + s * 0.30, hr, Math.PI, 0); ctx.fill()
    ctx.fillRect(hx - hr, top + s * 0.28, hr * 2, hr * 0.5)
    // eyes
    ctx.fillStyle = INK; const ey = hy + s * 0.02
    if (dir === 'down') { dot(ctx, hx - hr * 0.4, ey); dot(ctx, hx + hr * 0.4, ey) }
    else if (dir === 'left') dot(ctx, hx - hr * 0.5, ey)
    else if (dir === 'right') dot(ctx, hx + hr * 0.5, ey)
    // lantern — player only, on the facing side; doubles as "the light that reveals nearby sound"
    if (isPlayer) {
        const lx = dir === 'left' ? bx - 3 : dir === 'right' ? bx + bw + 3 : cx + (dir === 'up' ? -bw * 0.5 : bw * 0.5)
        const ly = by + bh * 0.5
        const glow = ctx.createRadialGradient(lx, ly, 0, lx, ly, 14)
        glow.addColorStop(0, 'rgba(255,210,122,0.35)'); glow.addColorStop(1, 'rgba(255,210,122,0)')
        ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(lx, ly, 14, 0, Math.PI * 2); ctx.fill()
        ctx.fillStyle = '#ffd27a'; ctx.beginPath(); ctx.arc(lx, ly, 2.2, 0, Math.PI * 2); ctx.fill()
    }
}

// ─────────────────────────────────────────────────────────────────────────────
export function SoundTownView({ onTrackSelect, onPlayTrack, onBack }: SoundTownProps) {
    const wrapRef = useRef<HTMLDivElement>(null)
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const bakeRef = useRef<HTMLCanvasElement | null>(null)
    const rafRef = useRef(0)
    const dirtyRef = useRef(true)

    const audioRef = useRef<SoundTownAudio | null>(null)
    if (!audioRef.current) audioRef.current = new SoundTownAudio()

    const worldRef = useRef<World | null>(null)
    const visitedRef = useRef<Set<string>>(new Set())
    const accentRef = useRef('#c0563f')
    const poolRef = useRef<CatalogTrack[]>([])
    const npcsRef = useRef<Npc[]>([])
    const npcSetRef = useRef<Set<string>>(new Set())

    const playerRef = useRef({ tx: 5, ty: 10, fromTx: 5, fromTy: 10, prog: 1, dir: 'down' as Dir, moving: false })
    const keysRef = useRef<Set<string>>(new Set())
    const camRef = useRef({ x: 0, y: 0 })
    const lastTsRef = useRef(0)

    const [loading, setLoading] = useState(true)
    const [computing, setComputing] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [townName, setTownName] = useState('')
    const [activeZone, setActiveZone] = useState('')
    const [, setVisitedV] = useState(0)

    const [encounter, setEncounter] = useState<VerbYield | null>(null)
    const [encounterNote, setEncounterNote] = useState('')
    const [nameRevealed, setNameRevealed] = useState(false)
    const [npcDialog, setNpcDialog] = useState<Npc | null>(null)
    const [sign, setSign] = useState<string | null>(null)
    const [toast, setToast] = useState<string | null>(null)
    const [songlineOpen, setSonglineOpen] = useState(false)
    const [mapOpen, setMapOpen] = useState(false)
    const [songlineCount, setSonglineCount] = useState(0)
    const [muted, setMuted] = useState(audioRef.current.muted)

    const blockedRef = useRef(false)
    blockedRef.current = !!(encounter || npcDialog || sign || songlineOpen || mapOpen)

    useEffect(() => { setSonglineCount(readSongline().length) }, [])
    const flash = useCallback((msg: string) => { setToast(msg); window.setTimeout(() => setToast(t => (t === msg ? null : t)), 1700) }, [])

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
                const w = buildWorld(d.tracks ?? [], genres)
                worldRef.current = w
                enterZone(w.order[0])
            } catch (e: any) { if (!dead) setError(e.message) }
            finally { if (!dead) setLoading(false) }
        }
        poll(); return () => { dead = true }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    // ── Enter / change zone ─────────────────────────────────────────────────────
    const enterZone = useCallback((key: string, viaWarp = false) => {
        const w = worldRef.current; if (!w) return
        const meta = w.zones.get(key); if (!meta) return
        accentRef.current = meta.accent
        setTownName(meta.genre)
        poolRef.current = w.pools.get(key) ?? []

        // NPCs ← distinct artists from the pool, one per 'N' tile.
        const byArtist = new Map<string, CatalogTrack[]>()
        for (const t of poolRef.current) { if (!t.artist) continue; (byArtist.get(t.artist) ?? byArtist.set(t.artist, []).get(t.artist)!).push(t) }
        const artists = [...byArtist.entries()].sort((a, b) => b[1].length - a[1].length).map(e => e[0])
        const spawns: { tx: number; ty: number }[] = []
        for (let ty = 0; ty < MAP_H; ty++) for (let tx = 0; tx < TOWN[ty].length; tx++) if (TOWN[ty][tx] === 'N') spawns.push({ tx, ty })
        npcsRef.current = spawns.map((s, i) => {
            const artist = artists[i % Math.max(1, artists.length)] || '—'
            const tracks = byArtist.get(artist) ?? []
            return { tx: s.tx, ty: s.ty, artist, tracks, hue: desaturate(genreInk(tracks[0]?.genres?.[0] ?? meta.genre)) }
        })
        npcSetRef.current = new Set(npcsRef.current.map(n => `${n.tx},${n.ty}`))

        const sp = findSpawn()
        playerRef.current = { tx: sp.tx, ty: sp.ty, fromTx: sp.tx, fromTy: sp.ty, prog: 1, dir: 'down', moving: false }
        bakeRef.current = bakeTerrain(meta.accent)
        visitedRef.current.add(key); setVisitedV(v => v + 1)
        setActiveZone(key)
        audioRef.current?.setBiome(meta.genre)
        if (viaWarp) audioRef.current?.warp()
        setEncounter(null); setNpcDialog(null); setSign(null); setMapOpen(false)
        dirtyRef.current = true
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    // ── Pre-bake static terrain ─────────────────────────────────────────────────
    const bakeTerrain = (accent: string): HTMLCanvasElement => {
        const cv = document.createElement('canvas'); cv.width = MAP_W * TILE; cv.height = MAP_H * TILE
        const g = cv.getContext('2d')!
        for (let ty = 0; ty < MAP_H; ty++) for (let tx = 0; tx < MAP_W; tx++) drawTile(g, tileAt(tx, ty), tx * TILE, ty * TILE, tx, ty, accent)
        return cv
    }
    const drawTile = (g: CanvasRenderingContext2D, c: string, x: number, y: number, tx: number, ty: number, accent: string) => {
        const checker = (tx + ty) % 2 === 0
        g.fillStyle = checker ? GRASS : GRASS_DK; g.fillRect(x, y, TILE, TILE)
        switch (c) {
            case ',': case 'X': {
                g.fillStyle = checker ? DIRT : DIRT_DK; g.fillRect(x, y, TILE, TILE)
                if (c === 'X') { g.fillStyle = WOOD_DK; g.fillRect(x, y, 4, TILE); g.fillRect(x + TILE - 4, y, 4, TILE); g.fillStyle = accent; g.fillRect(x, y, TILE, 5) }
                break
            }
            case 'T': {
                g.fillStyle = checker ? TALL : TALL_DK; g.fillRect(x, y, TILE, TILE)
                g.fillStyle = checker ? TALL_DK : TALL; for (let i = 0; i < 4; i++) g.fillRect(x + 4 + i * 8, y + TILE - 14, 3, 11); break
            }
            case '~': {
                g.fillStyle = checker ? WATER : WATER_DK; g.fillRect(x, y, TILE, TILE)
                g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(x + 6, y + 10, 12, 2); g.fillRect(x + 16, y + 22, 10, 2); break
            }
            case 'R': {
                g.fillStyle = ROCK_DK; roundRect(g, x + 4, y + 8, TILE - 8, TILE - 12, 6); g.fill()
                g.fillStyle = ROCK; roundRect(g, x + 6, y + 6, TILE - 14, TILE - 16, 5); g.fill(); break
            }
            case '#': {
                g.fillStyle = TRUNK; g.fillRect(x + TILE / 2 - 3, y + TILE - 12, 6, 10)
                g.fillStyle = TREE; g.beginPath(); g.arc(x + TILE / 2, y + TILE / 2 - 2, TILE * 0.42, 0, Math.PI * 2); g.fill()
                g.fillStyle = TREE_DK; g.beginPath(); g.arc(x + TILE / 2 + 4, y + TILE / 2 + 2, TILE * 0.26, 0, Math.PI * 2); g.fill(); break
            }
            case 'H': case 'B': {
                g.fillStyle = c === 'H' ? WOOD : WOOD_DK; g.fillRect(x, y, TILE, TILE)
                g.fillStyle = c === 'H' ? ROOFA : accent; g.fillRect(x, y, TILE, TILE * 0.4)
                g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(x, y + TILE * 0.4, TILE, 2); break
            }
            case 'D': {
                g.fillStyle = WOOD; g.fillRect(x, y, TILE, TILE)
                g.fillStyle = WOOD_DK; g.fillRect(x + 8, y + 6, TILE - 16, TILE - 6)
                g.fillStyle = '#e8c878'; g.beginPath(); g.arc(x + TILE - 12, y + TILE / 2 + 4, 2, 0, Math.PI * 2); g.fill(); break
            }
            case 'S': {
                g.fillStyle = TRUNK; g.fillRect(x + TILE / 2 - 2, y + TILE - 14, 4, 12)
                g.fillStyle = WOOD; g.fillRect(x + 6, y + 6, TILE - 12, 14)
                g.fillStyle = WOOD_DK; g.fillRect(x + 8, y + 9, TILE - 16, 2); g.fillRect(x + 8, y + 13, TILE - 16, 2); break
            }
        }
    }

    // ── Canvas sizing ───────────────────────────────────────────────────────────
    useEffect(() => {
        const wr = wrapRef.current; if (!wr) return
        const sync = () => {
            const dpr = window.devicePixelRatio || 1
            const { width: w, height: h } = wr.getBoundingClientRect()
            const cv = canvasRef.current; if (!cv || !w || !h) return
            cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr)
            cv.style.width = `${w}px`; cv.style.height = `${h}px`; dirtyRef.current = true
        }
        const ro = new ResizeObserver(sync); ro.observe(wr); sync(); return () => ro.disconnect()
    }, [])

    const stopPreview = () => audioRef.current?.stopPreview()
    const closeOverlays = useCallback(() => { setEncounter(null); setNpcDialog(null); setSign(null); setSonglineOpen(false); setMapOpen(false); stopPreview() }, [])

    // ── Verb yields → encounter ─────────────────────────────────────────────────
    const openEncounter = useCallback((y: VerbYield | null) => {
        if (!y) return
        setEncounter(y); setEncounterNote(''); setNameRevealed(false)
        window.setTimeout(() => setNameRevealed(true), 1100)
        if (y.verb === 'forage') audioRef.current?.rustle()
        fetchPreviewUrl(y.track).then(url => { if (url) audioRef.current?.playPreview(url) })
    }, [])

    // ── Interact (space): read the faced tile ───────────────────────────────────
    const interact = useCallback(() => {
        if (encounter || npcDialog || sign) { closeOverlays(); return }
        if (mapOpen || songlineOpen) { closeOverlays(); return }
        const w = worldRef.current; if (!w) return
        const p = playerRef.current; const [dx, dy] = DELTA[p.dir]
        const fx = p.tx + dx, fy = p.ty + dy
        const npc = npcsRef.current.find(n => n.tx === fx && n.ty === fy)
        if (npc) { setNpcDialog(npc); audioRef.current?.menu(); return }
        const c = tileAt(fx, fy)
        if (c === 'R') { audioRef.current?.menu(); openEncounter(resolveMine(w, activeZone)) }
        else if (c === '~') { audioRef.current?.menu(); openEncounter(resolveFish(w, activeZone)) }
        else if (c === 'S') setSign(`${townName.toUpperCase()} — pop. ${poolRef.current.length}. 🌿 grass to forage · ⛏ rock for deep cuts · 🎣 water for strange catches · 💬 talk to the locals. The south gate (X) opens the world map.`)
        else if (c === 'D') flash('The door is locked. (Interiors coming soon.)')
        else if (c === 'X') { setMapOpen(true); audioRef.current?.menu() }
    }, [encounter, npcDialog, sign, mapOpen, songlineOpen, townName, activeZone, closeOverlays, openEncounter, flash])

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

    // ── The game loop ───────────────────────────────────────────────────────────
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
                    if (dir) {
                        p.dir = dir; const [dx, dy] = DELTA[dir]; const nx = p.tx + dx, ny = p.ty + dy
                        if (!isWall(nx, ny, npcSetRef.current)) { p.fromTx = p.tx; p.fromTy = p.ty; p.tx = nx; p.ty = ny; p.prog = 0; p.moving = true }
                        dirtyRef.current = true
                    }
                }
                if (p.moving) {
                    p.prog += dt / STEP_MS; dirtyRef.current = true
                    if (p.prog >= 1) {
                        p.prog = 1; p.moving = false; p.fromTx = p.tx; p.fromTy = p.ty
                        audioRef.current?.footstep()
                        if (tileAt(p.tx, p.ty) === 'T' && Math.random() < ENCOUNTER_CHANCE) { audioRef.current?.rustle(); openEncounter(resolveForage(worldRef.current, activeZone)) }
                    }
                }
            }

            const px = (p.fromTx + (p.tx - p.fromTx) * p.prog) * TILE
            const py = (p.fromTy + (p.ty - p.fromTy) * p.prog) * TILE
            let camX = px + TILE / 2 - W / 2, camY = py + TILE / 2 - H / 2
            const maxX = MAP_W * TILE - W, maxY = MAP_H * TILE - H
            camX = maxX > 0 ? Math.max(0, Math.min(maxX, camX)) : maxX / 2
            camY = maxY > 0 ? Math.max(0, Math.min(maxY, camY)) : maxY / 2
            if (Math.abs(camX - camRef.current.x) > 0.01 || Math.abs(camY - camRef.current.y) > 0.01) dirtyRef.current = true
            camRef.current = { x: camX, y: camY }

            if (dirtyRef.current) {
                dirtyRef.current = false
                ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.imageSmoothingEnabled = false
                ctx.fillStyle = GRASS_DK; ctx.fillRect(0, 0, W, H)
                if (bakeRef.current) ctx.drawImage(bakeRef.current, camX, camY, W, H, 0, 0, W, H)
                const [fdx, fdy] = DELTA[p.dir]
                for (const n of npcsRef.current) {
                    const sx = n.tx * TILE - camX, sy = n.ty * TILE - camY
                    if (sx < -TILE || sx > W || sy < -TILE || sy > H) continue
                    drawAvatar(ctx, sx, sy, TILE, 'down', 0, n.hue, '#5a4a3a', false)
                    if (p.tx + fdx === n.tx && p.ty + fdy === n.ty) marker(ctx, sx, sy, accentRef.current, '💬')
                }
                // facing chevron on the tile ahead (where SPACE will act)
                const ahead = tileAt(p.tx + fdx, p.ty + fdy)
                if (ahead === 'R' || ahead === '~' || ahead === 'S' || ahead === 'X') {
                    marker(ctx, (p.tx + fdx) * TILE - camX, (p.ty + fdy) * TILE - camY, accentRef.current, ahead === 'R' ? '⛏' : ahead === '~' ? '🎣' : ahead === 'X' ? '🗺' : '👁')
                }
                const walkBob = p.moving ? Math.abs(Math.sin(p.prog * Math.PI)) * 2 : 0
                drawAvatar(ctx, px - camX, py - camY, TILE, p.dir, walkBob, accentRef.current, '#2a2a3a', true)
            }
            rafRef.current = requestAnimationFrame(loop)
        }
        rafRef.current = requestAnimationFrame(loop)
        return () => { running = false; cancelAnimationFrame(rafRef.current) }
    }, [openEncounter, activeZone])

    const marker = (ctx: CanvasRenderingContext2D, sx: number, sy: number, _accent: string, glyph: string) => {
        ctx.font = `13px ${SANS}`; ctx.textAlign = 'center'; ctx.fillText(glyph, sx + TILE / 2, sy - 4)
    }

    useEffect(() => () => audioRef.current?.dispose(), [])
    useEffect(() => { dirtyRef.current = true }, [encounter, npcDialog, sign, songlineOpen, mapOpen, activeZone])

    const keep = useCallback(() => {
        if (!encounter) return
        const ok = keepInSongline(encounter, activeZone, encounterNote)
        setSonglineCount(readSongline().length)
        if (ok) audioRef.current?.catch_()
        flash(ok ? `Kept “${encounter.track.title}” in your songline` : 'Already in your songline')
        closeOverlays()
    }, [encounter, activeZone, encounterNote, flash, closeOverlays])

    const toggleMute = () => { const m = !muted; setMuted(m); audioRef.current?.setMuted(m) }

    // ── Render ──────────────────────────────────────────────────────────────────
    const accent = accentRef.current
    const w = worldRef.current
    return (
        <div ref={wrapRef} style={{ position: 'absolute', inset: 0, background: '#1b2a18', overflow: 'hidden', userSelect: 'none' }}>
            <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: '100%', imageRendering: 'pixelated' }} />

            {/* Orientation contract */}
            <div style={{ position: 'absolute', top: 14, left: 14, pointerEvents: 'none' }}>
                <div style={{ background: accent, color: SAND, padding: '5px 12px', borderRadius: 7, fontFamily: SANS, fontWeight: 700, fontSize: 14, letterSpacing: 0.3, boxShadow: '0 2px 6px rgba(0,0,0,0.3)' }}>
                    {townName ? `${townName.toUpperCase()} TOWN` : 'loading…'}
                </div>
            </div>
            <div style={{ position: 'absolute', top: 16, right: 14, display: 'flex', gap: 8 }}>
                <button onClick={() => setMapOpen(true)} style={pillBtn(accent)}>🗺 map</button>
                <button onClick={() => { setSonglineCount(readSongline().length); setSonglineOpen(true) }} style={pillBtn(accent)}>🎒 satchel{songlineCount ? ` · ${songlineCount}` : ''}</button>
                <button onClick={toggleMute} style={pillBtn('#444')}>{muted ? '🔇' : '🔊'}</button>
                {onBack && <button onClick={() => { stopPreview(); onBack() }} style={pillBtn('#444')}>✕ leave</button>}
            </div>
            <div style={{ position: 'absolute', bottom: 12, left: 14, fontFamily: MONO, fontSize: 11, color: 'rgba(255,255,255,0.75)', textShadow: '0 1px 2px rgba(0,0,0,0.8)', pointerEvents: 'none', lineHeight: 1.6 }}>
                WASD/arrows — walk · space — act (forage/mine 🎣/talk) · M — world map · B — satchel<br />
                grass forages tracks · rock mines deep cuts · water fishes surprises · the gate (X) leaves town
            </div>

            {loading && !computing && <Center>entering the world…</Center>}
            {computing && <Center>the cartographer is drawing the land…<br /><span style={{ fontSize: 12, opacity: 0.7 }}>(projecting the catalog)</span></Center>}
            {error && <Center>⚠ {error}</Center>}

            {/* Encounter */}
            {encounter && (
                <Panel accent={accent}>
                    <div style={{ fontFamily: MONO, fontSize: 11, color: accent, letterSpacing: 1, marginBottom: 6 }}>
                        {VERB_FLAVOR[encounter.verb].icon} {VERB_FLAVOR[encounter.verb].line.toUpperCase()}
                    </div>
                    <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: 20, color: INK, minHeight: 26 }}>
                        {nameRevealed ? encounter.track.title : <span style={{ opacity: 0.35 }}>♪ listen…</span>}
                    </div>
                    <div style={{ fontFamily: SANS, fontSize: 14, color: '#5a544c', marginBottom: 4 }}>{nameRevealed ? encounter.track.artist : ' '}</div>
                    {nameRevealed && encounter.verb === 'fish' && encounter.homeZone !== encounter.fromZone && (
                        <div style={{ fontFamily: MONO, fontSize: 11, color: '#8a7a5a', marginBottom: 6 }}>a <b>{encounter.homeZone}</b> track, drifted into {encounter.fromZone}</div>
                    )}
                    {nameRevealed && encounter.track.genres?.length > 0 && (
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                            {encounter.track.genres.slice(0, 3).map(g => <span key={g} style={tag(accent)}>{g}</span>)}
                        </div>
                    )}
                    {nameRevealed && (
                        <input value={encounterNote} onChange={e => setEncounterNote(e.target.value)} placeholder="why this one? (optional — becomes part of the memory)"
                            style={{ width: '100%', boxSizing: 'border-box', marginBottom: 10, padding: '7px 10px', borderRadius: 8, border: '1px solid rgba(0,0,0,0.18)', fontFamily: SANS, fontSize: 13, background: '#fff', color: INK }} />
                    )}
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <button style={actBtn(accent, true)} onClick={keep}>Keep ↦ songline</button>
                        <button style={actBtn('#2a5ea8', false)} onClick={() => onPlayTrack?.(encounter.track)}>Play</button>
                        <button style={actBtn('#3a3a3a', false)} onClick={() => { const t = encounter.track; closeOverlays(); onTrackSelect?.(t) }}>Open wiki →</button>
                        <button style={actBtn('#8a3030', false)} onClick={closeOverlays}>Run</button>
                    </div>
                </Panel>
            )}

            {/* NPC */}
            {npcDialog && (
                <Panel accent={accent}>
                    <div style={{ fontFamily: MONO, fontSize: 11, color: accent, letterSpacing: 1, marginBottom: 4 }}>💬 LOCAL ARTIST</div>
                    <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: 20, color: INK, marginBottom: 10 }}>{npcDialog.artist}</div>
                    <div style={{ fontFamily: SANS, fontSize: 13, color: '#5a544c', marginBottom: 8 }}>“Stick around — here's what I've been working on.”</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 200, overflowY: 'auto' }}>
                        {npcDialog.tracks.slice(0, 8).map(t => (
                            <button key={t.id} style={trackRow} onClick={() => { closeOverlays(); onTrackSelect?.(t) }}>
                                <span style={{ color: INK, fontWeight: 600 }}>{t.title}</span>
                                <span style={{ color: '#9a948c', fontSize: 11 }}>{t.genres?.[0] ?? ''}</span>
                            </button>
                        ))}
                    </div>
                    <button style={{ ...actBtn('#3a3a3a', false), marginTop: 12 }} onClick={closeOverlays}>Goodbye</button>
                </Panel>
            )}

            {sign && (
                <div onClick={() => setSign(null)} style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', paddingBottom: 60, cursor: 'pointer' }}>
                    <div style={{ background: SAND, border: `2px solid ${INK}`, borderRadius: 10, padding: '16px 20px', maxWidth: 460, fontFamily: SANS, fontSize: 14, color: INK, lineHeight: 1.5, boxShadow: '0 8px 24px rgba(0,0,0,0.35)' }}>
                        {sign}<div style={{ fontFamily: MONO, fontSize: 10, opacity: 0.5, marginTop: 8 }}>▾ click to close</div>
                    </div>
                </div>
            )}

            {/* World map */}
            {mapOpen && w && <WorldMap world={w} visited={visitedRef.current} current={activeZone} accent={accent} onTravel={(k) => enterZone(k, true)} onClose={() => setMapOpen(false)} />}

            {/* Songline / satchel */}
            {songlineOpen && <SonglinePanel accent={accent} onClose={() => setSonglineOpen(false)} onOpen={t => { closeOverlays(); onTrackSelect?.(t) }} onPlay={t => onPlayTrack?.(t)} />}

            {toast && <div style={{ position: 'absolute', bottom: 70, left: '50%', transform: 'translateX(-50%)', background: INK, color: SAND, padding: '8px 16px', borderRadius: 20, fontFamily: SANS, fontSize: 13, boxShadow: '0 4px 14px rgba(0,0,0,0.4)' }}>{toast}</div>}
        </div>
    )
}

// ── World map overlay — the embedding as a navigable graph ────────────────────
function WorldMap({ world, visited, current, accent, onTravel, onClose }: {
    world: World; visited: Set<string>; current: string; accent: string
    onTravel: (k: string) => void; onClose: () => void
}) {
    const zones = [...world.zones.values()]
    const xs = zones.map(z => z.cx), ys = zones.map(z => z.cy)
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys)
    const PAD = 60, W = 720, H = 460
    const nx = (x: number) => PAD + ((x - minX) / (maxX - minX || 1)) * (W - PAD * 2)
    const ny = (y: number) => PAD + ((y - minY) / (maxY - minY || 1)) * (H - PAD * 2)
    const reach = reachableZones(world, visited)
    const edges: [ZoneXY, ZoneXY][] = []
    const seen = new Set<string>()
    for (const z of zones) for (const nk of z.neighbors) {
        const o = world.zones.get(nk); if (!o) continue
        const key = [z.key, nk].sort().join('|'); if (seen.has(key)) continue; seen.add(key)
        edges.push([{ x: nx(z.cx), y: ny(z.cy) }, { x: nx(o.cx), y: ny(o.cy) }])
    }
    return (
        <Overlay onClose={onClose}>
            <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: 18, color: INK, marginBottom: 2 }}>🗺 The World — your taste, mapped</div>
            <div style={{ fontFamily: MONO, fontSize: 11, color: '#7a746c', marginBottom: 10 }}>towns near each other sound alike. bright = visited · ringed = here · faded = unexplored frontier</div>
            <svg width={W} height={H} style={{ display: 'block', background: 'rgba(0,0,0,0.03)', borderRadius: 12 }}>
                {edges.map(([a, b], i) => <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="rgba(0,0,0,0.14)" strokeWidth={1.5} />)}
                {zones.map(z => {
                    const isCur = z.key === current, isVis = visited.has(z.key), canGo = reach.has(z.key) && !isCur
                    const r = Math.max(7, Math.min(20, Math.sqrt(z.count) * 1.4))
                    const op = isVis ? 1 : canGo ? 0.6 : 0.22
                    return (
                        <g key={z.key} style={{ cursor: canGo ? 'pointer' : 'default' }} onClick={() => canGo && onTravel(z.key)}>
                            {isCur && <circle cx={nx(z.cx)} cy={ny(z.cy)} r={r + 6} fill="none" stroke={accent} strokeWidth={2} opacity={0.9} />}
                            <circle cx={nx(z.cx)} cy={ny(z.cy)} r={r} fill={z.accent} opacity={op} stroke={isVis ? INK : 'none'} strokeWidth={1} />
                            {(isVis || canGo) && <text x={nx(z.cx)} y={ny(z.cy) + r + 12} textAnchor="middle" fontFamily={SANS} fontSize={11} fontWeight={isVis ? 700 : 400} fill={INK} opacity={op}>{z.genre}</text>}
                        </g>
                    )
                })}
            </svg>
            <div style={{ fontFamily: MONO, fontSize: 10, color: '#9a948c', marginTop: 10 }}>click a reachable town to travel · M / Esc — close</div>
        </Overlay>
    )
}
interface ZoneXY { x: number; y: number }

// ── Songline / satchel overlay — the artifact you build ───────────────────────
function SonglinePanel({ accent, onClose, onOpen, onPlay }: {
    accent: string; onClose: () => void
    onOpen: (t: { id: string; title: string; artist: string; genres: string[] }) => void
    onPlay: (t: { id: string; title: string; artist: string; genres: string[] }) => void
}) {
    const entries = readSongline()
    const sorted = [...entries].sort((a, b) => b.t - a.t)
    return (
        <Overlay onClose={onClose}>
            <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: 18, color: INK }}>🎒 Your Satchel — the songline you're walking</div>
            <div style={{ fontFamily: MONO, fontSize: 11, color: '#7a746c', margin: '4px 0 12px' }}>
                only tracks you chose to <b>Keep</b> land here — each stamped with where & how you found it. this is the artifact you're building.
            </div>
            {sorted.length === 0
                ? <div style={{ fontFamily: SANS, fontSize: 14, color: '#7a746c', padding: '24px 0' }}>Empty. Walk into the tall grass, mine a rock, cast into the water — then Keep what speaks to you.</div>
                : <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 420, overflowY: 'auto', width: 560 }}>
                    {sorted.map((e: SonglineEntry) => (
                        <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(0,0,0,0.03)', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 9, padding: '9px 12px' }}>
                            <div style={{ fontSize: 18 }} title={VERB_FLAVOR[e.verb]?.label}>{VERB_FLAVOR[e.verb]?.icon ?? '🌿'}</div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontFamily: SANS, fontWeight: 600, fontSize: 14, color: INK, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.title}</div>
                                <div style={{ fontFamily: SANS, fontSize: 12, color: '#7a746c' }}>{e.artist}</div>
                                <div style={{ fontFamily: MONO, fontSize: 10, color: '#9a948c', marginTop: 2 }}>
                                    {VERB_FLAVOR[e.verb]?.label ?? 'kept'} in {e.zone !== '?' ? e.zone : 'parts unknown'}{e.homeZone !== e.zone && e.homeZone !== '?' ? ` · a ${e.homeZone} track` : ''}{e.note ? ` — “${e.note}”` : ''}
                                </div>
                            </div>
                            <button style={{ ...actBtn(accent, false), padding: '4px 9px', fontSize: 12 }} onClick={() => onPlay(e)}>▶</button>
                            <button style={{ ...actBtn('#3a3a3a', false), padding: '4px 9px', fontSize: 12 }} onClick={() => onOpen(e)}>wiki</button>
                        </div>
                    ))}
                </div>}
            <div style={{ fontFamily: MONO, fontSize: 10, color: '#9a948c', marginTop: 12 }}>B / Esc — close</div>
        </Overlay>
    )
}

// ── Shared presentational helpers ─────────────────────────────────────────────
function Overlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
    return (
        <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(12,9,6,0.62)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 5 }}>
            <div onClick={e => e.stopPropagation()} style={{ background: SAND, borderRadius: 16, padding: 22, boxShadow: '0 16px 48px rgba(0,0,0,0.5)', maxWidth: '92%' }}>{children}</div>
        </div>
    )
}
function Center({ children }: { children: React.ReactNode }) {
    return <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', fontFamily: SANS, fontSize: 16, color: SAND, textShadow: '0 1px 3px rgba(0,0,0,0.7)' }}>{children}</div>
}
function Panel({ accent, children }: { accent: string; children: React.ReactNode }) {
    return <div style={{ position: 'absolute', bottom: 56, left: '50%', transform: 'translateX(-50%)', width: 'min(480px, 90%)', background: SAND, border: `3px solid ${accent}`, borderRadius: 14, padding: 18, boxShadow: '0 12px 36px rgba(0,0,0,0.45)', zIndex: 4 }}>{children}</div>
}
function pillBtn(bg: string): React.CSSProperties {
    return { background: bg, color: '#fff', border: 'none', borderRadius: 18, padding: '6px 13px', fontFamily: SANS, fontSize: 12, fontWeight: 600, cursor: 'pointer', boxShadow: '0 2px 6px rgba(0,0,0,0.3)' }
}
function actBtn(bg: string, primary: boolean): React.CSSProperties {
    return { background: primary ? bg : 'transparent', color: primary ? '#fff' : bg, border: `2px solid ${bg}`, borderRadius: 9, padding: '8px 14px', fontFamily: SANS, fontSize: 13, fontWeight: 600, cursor: 'pointer' }
}
function tag(accent: string): React.CSSProperties {
    return { fontFamily: MONO, fontSize: 11, color: accent, border: `1px solid ${accent}`, borderRadius: 5, padding: '2px 7px' }
}
const trackRow: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, background: 'rgba(0,0,0,0.03)', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 7, padding: '8px 11px', fontFamily: SANS, fontSize: 13, cursor: 'pointer', textAlign: 'left' }
