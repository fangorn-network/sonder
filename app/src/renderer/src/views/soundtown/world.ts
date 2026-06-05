/**
 * soundtown/world.ts — pure world model + data-agnostic verb system + the artifact store.
 *
 * No rendering, no React, no audio.  This is the "what the world IS" layer:
 *   · buildWorld()  turns the catalog (tracks + genre centroids) into ZONES
 *     (one town per genre) wired by embedding adjacency (k-NN routes).
 *   · the VERB system resolves an action (forage / mine / fish / talk) at a place
 *     into a YIELD.  A track is just one kind of yield — verbs don't hard-code
 *     "music", so adding new verbs/yields later touches nothing here.
 *   · the SONGLINE is the persisted artifact: every track you *choose* to keep,
 *     stamped with where / how / when you found it.  Provenance is the meaning.
 */

// ── Data from /catalog/map ────────────────────────────────────────────────────
export interface CatalogTrack { id: string; title: string; artist: string; genres: string[]; moods?: string[]; px: number; py: number }
export interface GenreCentroid { genre: string; px: number; py: number; count: number }

// ── A zone = one genre's town ─────────────────────────────────────────────────
export interface ZoneMeta {
    key: string            // == genre (lowercased)
    genre: string          // display
    accent: string         // theme colour
    cx: number; cy: number // centroid in embedding space (for the world map)
    count: number
    neighbors: string[]    // nearest genres by embedding distance (route network)
}
export interface World {
    zones: Map<string, ZoneMeta>
    pools: Map<string, CatalogTrack[]>   // tracks nearest each centroid (sampled)
    order: string[]                       // zone keys, biggest genre first
    allTracks: CatalogTrack[]
}

const ZONE_POOL_CAP = 600
const KNN = 4

// ── Genre ink — warm accents (shared with the renderer) ───────────────────────
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
    reggae: '#78c098', ska: '#68b888', latin: '#e0a070', salsa: '#e09060',
}
export function genreInk(g: string | null | undefined): string {
    if (!g) return '#c0563f'
    const k = g.toLowerCase()
    for (const [p, v] of Object.entries(GENRE_INK)) if (k.includes(p) || p.includes(k)) return v
    let h = 0; for (let i = 0; i < k.length; i++) h = (h * 31 + k.charCodeAt(i)) >>> 0
    return `hsl(${20 + (h % 320)},50%,58%)`
}

const dist2 = (ax: number, ay: number, bx: number, by: number) => (ax - bx) ** 2 + (ay - by) ** 2

// ── Build the world from the catalog ──────────────────────────────────────────
export function buildWorld(tracks: CatalogTrack[], genres: GenreCentroid[]): World {
    const order = [...genres].sort((a, b) => b.count - a.count).map(g => g.genre.toLowerCase())
    const byKey = new Map<string, GenreCentroid>()
    for (const g of genres) byKey.set(g.genre.toLowerCase(), g)

    // Assign every track to its NEAREST centroid → that genre's pool.
    const pools = new Map<string, CatalogTrack[]>()
    for (const k of byKey.keys()) pools.set(k, [])
    for (const t of tracks) {
        let bestK = '', bd = Infinity
        for (const g of genres) { const d = dist2(g.px, g.py, t.px, t.py); if (d < bd) { bd = d; bestK = g.genre.toLowerCase() } }
        if (bestK) pools.get(bestK)!.push(t)
    }
    // Sample each pool down to a cap (deterministic stride).
    for (const [k, arr] of pools) {
        if (arr.length > ZONE_POOL_CAP) {
            const stride = Math.ceil(arr.length / ZONE_POOL_CAP)
            pools.set(k, arr.filter((_, i) => i % stride === 0))
        }
    }

    // k-NN routes between centroids → the navigable graph.
    const zones = new Map<string, ZoneMeta>()
    for (const g of genres) {
        const k = g.genre.toLowerCase()
        const others = genres.filter(o => o.genre.toLowerCase() !== k)
            .map(o => ({ key: o.genre.toLowerCase(), d: dist2(g.px, g.py, o.px, o.py) }))
            .sort((a, b) => a.d - b.d)
            .slice(0, KNN).map(o => o.key)
        zones.set(k, { key: k, genre: g.genre, accent: genreInk(g.genre), cx: g.px, cy: g.py, count: g.count, neighbors: others })
    }
    return { zones, pools, order, allTracks: tracks }
}

// Zones you can travel to: ones you've visited + their immediate neighbours (the frontier).
export function reachableZones(world: World, visited: Set<string>): Set<string> {
    const out = new Set<string>(visited)
    for (const k of visited) { const z = world.zones.get(k); if (z) for (const n of z.neighbors) out.add(n) }
    return out
}

// ── Verbs — data-agnostic.  Each resolves a place+action into a track yield. ──
export type VerbKind = 'forage' | 'mine' | 'fish' | 'talk'
export interface VerbYield { track: CatalogTrack; verb: VerbKind; fromZone: string; homeZone: string }

export const VERB_FLAVOR: Record<VerbKind, { label: string; icon: string; line: string }> = {
    forage: { label: 'foraged', icon: '🌿', line: 'A track surfaced in the tall grass' },
    mine:   { label: 'mined',   icon: '⛏',  line: 'You dug a deep cut out of the rock' },
    fish:   { label: 'fished',  icon: '🎣', line: 'Something drifted in from far water' },
    talk:   { label: 'shared',  icon: '💬', line: 'A local pressed a track into your hand' },
}

const rand = <T,>(a: T[]): T => a[(Math.random() * a.length) | 0]

/** FORAGE — the genre's bread-and-butter: a typical track near the centroid. */
export function resolveForage(world: World, zoneKey: string): VerbYield | null {
    const pool = world.pools.get(zoneKey); if (!pool?.length) return null
    return { track: rand(pool), verb: 'forage', fromZone: zoneKey, homeZone: zoneKey }
}

/** MINE — a DEEP CUT: a track at the genre's edge, far from the centroid. */
export function resolveMine(world: World, zoneKey: string): VerbYield | null {
    const pool = world.pools.get(zoneKey); const z = world.zones.get(zoneKey)
    if (!pool?.length || !z) return null
    const ranked = [...pool].sort((a, b) => dist2(b.px, b.py, z.cx, z.cy) - dist2(a.px, a.py, z.cx, z.cy))
    const deep = ranked.slice(0, Math.max(1, Math.ceil(ranked.length * 0.3)))
    return { track: rand(deep), verb: 'mine', fromZone: zoneKey, homeZone: zoneKey }
}

/** FISH — SERENDIPITY: a track pulled from another, often distant, genre. */
export function resolveFish(world: World, zoneKey: string): VerbYield | null {
    const otherKeys = world.order.filter(k => k !== zoneKey && (world.pools.get(k)?.length ?? 0) > 0)
    if (!otherKeys.length) return resolveForage(world, zoneKey)
    // 60% distant surprise, 40% a bordering neighbour (a true blend catch).
    const z = world.zones.get(zoneKey)
    const pickFrom = Math.random() < 0.4 && z?.neighbors.length
        ? rand(z.neighbors.filter(n => (world.pools.get(n)?.length ?? 0) > 0)) ?? rand(otherKeys)
        : rand(otherKeys)
    const pool = world.pools.get(pickFrom)!
    return { track: rand(pool), verb: 'fish', fromZone: zoneKey, homeZone: pickFrom }
}

// ── The Songline — the persisted artifact you build ───────────────────────────
const SONGLINE_KEY = 'sond3r:songline'
const OLD_SATCHEL_KEY = 'sond3r:satchel'

export interface SonglineEntry {
    id: string; title: string; artist: string; genres: string[]
    zone: string            // where you were standing
    homeZone: string        // the track's own genre (differs from zone for fished catches)
    verb: VerbKind
    t: number               // timestamp
    note?: string           // optional one-line "why this one"
}

export function readSongline(): SonglineEntry[] {
    try {
        const raw = localStorage.getItem(SONGLINE_KEY)
        if (raw) return JSON.parse(raw)
        // Migrate the old flat satchel (no provenance) into the songline once.
        const old = localStorage.getItem(OLD_SATCHEL_KEY)
        if (old) {
            const arr = JSON.parse(old) as { id: string; title: string; artist: string; genres: string[] }[]
            const migrated: SonglineEntry[] = arr.map(x => ({ ...x, zone: '?', homeZone: '?', verb: 'forage', t: 0 }))
            localStorage.setItem(SONGLINE_KEY, JSON.stringify(migrated))
            return migrated
        }
    } catch { /* ignore */ }
    return []
}

/** Returns false if the track is already in the songline (no duplicates). */
export function keepInSongline(y: VerbYield, zone: string, note?: string): boolean {
    const cur = readSongline()
    if (cur.some(e => e.id === y.track.id)) return false
    cur.push({
        id: y.track.id, title: y.track.title, artist: y.track.artist, genres: y.track.genres ?? [],
        zone, homeZone: y.homeZone, verb: y.verb, t: Date.now(), note: note?.trim() || undefined,
    })
    localStorage.setItem(SONGLINE_KEY, JSON.stringify(cur))
    return true
}

export function songlineHas(id: string): boolean { return readSongline().some(e => e.id === id) }
