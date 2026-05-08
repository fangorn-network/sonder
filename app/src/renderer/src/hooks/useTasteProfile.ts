// import { useCallback, useEffect, useRef, useState } from 'react'
// import type { TasteProfile, TasteSignal, Track } from '../types'

// const STORAGE_KEY = 'fangorn_taste_profile'
// const SIGNAL_WEIGHTS: Record<string, number> = {
//   play:    1.0,
//   skip:   -1.0,
//   like:    1.5,
//   filter:  0.5,
//   similar: 0.75,
// }
// const DECAY = 0.92

// function emptyProfile(): TasteProfile {
//   return {
//     genres: {},
//     moods: {},
//     contexts: {},
//     energyRange: null,
//     topArtists: [],
//     topTracks: [],
//     seededFromSpotify: false,
//     lastUpdated: Date.now(),
//     entropy: 0.2, // default: low-ish, comfort-forward
//   }
// }

// function clamp(v: number): number {
//   return Math.max(-1, Math.min(1, v))
// }

// function applySignalToMap(
//   map: Record<string, number>,
//   tags: string[],
//   weight: number
// ): Record<string, number> {
//   const next = { ...map }
//   for (const tag of tags) {
//     const current = next[tag] ?? 0
//     next[tag] = clamp(current * DECAY + weight * (1 - DECAY))
//   }
//   return next
// }

// // Weighted reservoir sample — used at high entropy to inject randomness
// // into tag selection rather than strict top-N
// function weightedSample(
//   map: Record<string, number>,
//   n: number,
//   entropy: number,
// ): string[] {
//   const entries = Object.entries(map)
//   if (entries.length === 0) return []

//   // At entropy 0: only include scores above threshold (0.6), sorted descending
//   // At entropy 1: include everything with score > -0.5 (avoid strong dislikes),
//   //               flatten weights toward uniform so low-scored tags have real shot
//   const threshold = (1 - entropy) * 0.6 - entropy * 0.5
//   const eligible = entries.filter(([, v]) => v > threshold)
//   if (eligible.length === 0) return entries.slice(0, n).map(([k]) => k)

//   // Flatten: mix actual score with uniform (1.0) based on entropy
//   // entropy=0 → pure score ranking; entropy=1 → nearly uniform
//   const withWeights = eligible.map(([k, v]) => {
//     const flattened = v * (1 - entropy) + 1.0 * entropy
//     return { k, w: Math.max(0.01, flattened) }
//   })

//   // Reservoir sample proportional to flattened weight
//   const selected: string[] = []
//   const pool = [...withWeights]
//   const take = Math.min(n, pool.length)

//   for (let i = 0; i < take; i++) {
//     const total = pool.reduce((sum, x) => sum + x.w, 0)
//     let r = Math.random() * total
//     let idx = 0
//     for (let j = 0; j < pool.length; j++) {
//       r -= pool[j].w
//       if (r <= 0) { idx = j; break }
//     }
//     selected.push(pool[idx].k)
//     pool.splice(idx, 1)
//   }

//   return selected
// }

// export function useTasteProfile() {
//   const [profile, setProfile] = useState<TasteProfile>(() => {
//     try {
//       const raw = localStorage.getItem(STORAGE_KEY)
//       const parsed = raw ? JSON.parse(raw) : emptyProfile()
//       // backfill entropy for existing profiles
//       if (parsed.entropy === undefined) parsed.entropy = 0.2
//       return parsed
//     } catch {
//       return emptyProfile()
//     }
//   })

//   const profileRef = useRef(profile)
//   useEffect(() => { profileRef.current = profile }, [profile])

//   const save = useCallback((p: TasteProfile) => {
//     localStorage.setItem(STORAGE_KEY, JSON.stringify(p))
//     setProfile(p)
//   }, [])

//   const applySignal = useCallback((signal: TasteSignal) => {
//     const { track, type } = signal
//     const weight = SIGNAL_WEIGHTS[type] ?? 0
//     if (weight === 0) return

//     const p = profileRef.current
//     save({
//       ...p,
//       genres:   applySignalToMap(p.genres,   track.genres,   weight),
//       moods:    applySignalToMap(p.moods,     track.moods,    weight),
//       contexts: applySignalToMap(p.contexts,  track.contexts, weight),
//       energyRange: track.energy !== null
//         ? updateEnergyRange(p.energyRange, track.energy, weight)
//         : p.energyRange,
//       lastUpdated: Date.now(),
//     })
//   }, [save])

//   const setEntropy = useCallback((entropy: number) => {
//     const clamped = Math.max(0, Math.min(1, entropy))
//     save({ ...profileRef.current, entropy: clamped })
//   }, [save])

//   const seedFromSpotify = useCallback(async (spotifyFetch: Function) => {
//     console.log('seeding ')
//     try {
//       const [tracksRes, artistsRes] = await Promise.all([
//         spotifyFetch('/v1/me/top/tracks?limit=50&time_range=medium_term'),
//         spotifyFetch('/v1/me/top/artists?limit=50&time_range=medium_term'),
//       ])

//       console.log('******************* in seed from spotify')
//       console.log(JSON.stringify(tracksRes))

//       const topTracks = (tracksRes.data?.items ?? []).map((t: any) => ({
//         title:   t.name,
//         artist:  t.artists[0]?.name ?? '',
//         genres:  [],
//       }))

//       const topArtists = (artistsRes.data?.items ?? []).map((a: any) => a.name)

//       const genreMap: Record<string, number> = {}
//       for (const artist of artistsRes.data?.items ?? []) {
//         for (const genre of artist.genres ?? []) {
//           genreMap[genre] = clamp((genreMap[genre] ?? 0) + 0.15)
//         }
//       }

//       const p = profileRef.current
//       save({
//         ...p,
//         genres: { ...genreMap, ...p.genres },
//         topArtists,
//         topTracks,
//         seededFromSpotify: true,
//         lastUpdated: Date.now(),
//       })

//       console.log('[taste] seeded from Spotify:', {
//         artists: topArtists.length,
//         genreSignals: Object.keys(genreMap).length,
//       })
//     } catch (e) {
//       console.error('[taste] spotify seed failed:', e)
//     }
//   }, [save])

//   /**
//    * Build a Chroma query string modulated by entropy.
//    *
//    * entropy=0  → strict comfort zone: high-confidence signals only,
//    *              tight energy range, sorted by score
//    * entropy=1  → discovery mode: broad sampling across all known tags,
//    *              weighted-random so surprising combos can surface,
//    *              wide energy range
//    */
//   const toChromaQuery = useCallback((entropyOverride?: number): string => {
//     const p = profileRef.current
//     const e = entropyOverride !== undefined
//       ? Math.max(0, Math.min(1, entropyOverride))
//       : (p.entropy ?? 0.2)

//     // How many tags to pull per dimension scales with entropy
//     const nGenres   = Math.round(3 + e * 9)   // 3–12
//     const nMoods    = Math.round(2 + e * 6)   // 2–8
//     const nContexts = Math.round(1 + e * 4)   // 1–5
//     const nArtists  = Math.round(1 + e * 4)   // 1–5

//     const genres   = weightedSample(p.genres,   nGenres,   e)
//     const moods    = weightedSample(p.moods,     nMoods,    e)
//     const contexts = weightedSample(p.contexts,  nContexts, e)

//     // Artists: at low entropy take the top ones; at high entropy shuffle
//     const artists = e < 0.5
//       ? p.topArtists.slice(0, nArtists)
//       : [...p.topArtists].sort(() => Math.random() - 0.5).slice(0, nArtists)

//     const parts = [...genres, ...moods, ...contexts, ...artists]

//     // At high entropy, shuffle the assembled parts too so Chroma doesn't
//     // over-weight whatever happens to appear first in the embedding
//     if (e > 0.5) parts.sort(() => Math.random() - 0.5)

//     return parts.length > 0 ? parts.join(' ') : 'music'
//   }, [])

//   /**
//    * Returns the energy range padded by entropy — used to widen/narrow
//    * what energy levels are considered acceptable in recommendations.
//    */
//   const effectiveEnergyRange = useCallback((entropyOverride?: number): [number, number] => {
//     const p = profileRef.current
//     const e = entropyOverride !== undefined
//       ? Math.max(0, Math.min(1, entropyOverride))
//       : (p.entropy ?? 0.2)

//     const pad = e * 0.35 // at max entropy, pad ±0.35 (nearly full range)
//     if (!p.energyRange) return [Math.max(0, 0.5 - pad), Math.min(1, 0.5 + pad)]
//     const [lo, hi] = p.energyRange
//     return [Math.max(0, lo - pad), Math.min(1, hi + pad)]
//   }, [])

//   const reset = useCallback(() => save(emptyProfile()), [save])

//   return {
//     profile,
//     applySignal,
//     setEntropy,
//     seedFromSpotify,
//     toChromaQuery,
//     effectiveEnergyRange,
//     reset,
//   }
// }

// function topN(map: Record<string, number>, n: number): string[] {
//   return Object.entries(map)
//     .filter(([, v]) => v > 0)
//     .sort(([, a], [, b]) => b - a)
//     .slice(0, n)
//     .map(([k]) => k)
// }

// function updateEnergyRange(
//   current: [number, number] | null,
//   energy: number,
//   weight: number
// ): [number, number] {
//   if (weight < 0) return current ?? [0, 1]
//   if (!current) return [Math.max(0, energy - 0.15), Math.min(1, energy + 0.15)]
//   const [lo, hi] = current
//   return [
//     clamp(lo * 0.9 + Math.max(0, energy - 0.15) * 0.1),
//     clamp(hi * 0.9 + Math.min(1, energy + 0.15) * 0.1),
//   ]
// }