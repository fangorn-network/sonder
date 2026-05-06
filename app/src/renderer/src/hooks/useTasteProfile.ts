import { useCallback, useEffect, useRef, useState } from 'react'
import type { TasteProfile, TasteSignal, Track } from '../types'

const STORAGE_KEY = 'fangorn_taste_profile'
const SIGNAL_WEIGHTS: Record<string, number> = {
  play:    1.0,
  skip:   -1.0,
  like:    1.5,
  filter:  0.5,
  similar: 0.75,
}
const DECAY = 0.92  // existing weights decay slightly on each update

function emptyProfile(): TasteProfile {
  return {
    genres: {},
    moods: {},
    contexts: {},
    energyRange: null,
    topArtists: [],
    topTracks: [],
    seededFromSpotify: false,
    lastUpdated: Date.now(),
  }
}

function clamp(v: number): number {
  return Math.max(-1, Math.min(1, v))
}

function applySignalToMap(
  map: Record<string, number>,
  tags: string[],
  weight: number
): Record<string, number> {
  const next = { ...map }
  for (const tag of tags) {
    const current = next[tag] ?? 0
    next[tag] = clamp(current * DECAY + weight * (1 - DECAY))
  }
  return next
}

export function useTasteProfile() {
  const [profile, setProfile] = useState<TasteProfile>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      return raw ? JSON.parse(raw) : emptyProfile()
    } catch {
      return emptyProfile()
    }
  })

  const profileRef = useRef(profile)
  useEffect(() => { profileRef.current = profile }, [profile])

  const save = useCallback((p: TasteProfile) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(p))
    setProfile(p)
  }, [])

  // apply a single interaction signal
  const applySignal = useCallback((signal: TasteSignal) => {
    const { track, type } = signal
    const weight = SIGNAL_WEIGHTS[type] ?? 0
    if (weight === 0) return

    const p = profileRef.current
    save({
      ...p,
      genres:   applySignalToMap(p.genres,   track.genres,   weight),
      moods:    applySignalToMap(p.moods,     track.moods,    weight),
      contexts: applySignalToMap(p.contexts,  track.contexts, weight),
      energyRange: track.energy !== null
        ? updateEnergyRange(p.energyRange, track.energy, weight)
        : p.energyRange,
      lastUpdated: Date.now(),
    })
  }, [save])

  // seed from spotify top tracks/artists
  const seedFromSpotify = useCallback(async (spotifyFetch: Function) => {
    try {
      // top tracks — medium term gives best taste signal
      const [tracksRes, artistsRes] = await Promise.all([
        spotifyFetch('/v1/me/top/tracks?limit=50&time_range=medium_term'),
        spotifyFetch('/v1/me/top/artists?limit=50&time_range=medium_term'),
      ])

      const topTracks = (tracksRes.data?.items ?? []).map((t: any) => ({
        title:   t.name,
        artist:  t.artists[0]?.name ?? '',
        genres:  [], // spotify tracks don't have genres, artists do
      }))

      const topArtists = (artistsRes.data?.items ?? []).map((a: any) => a.name)

      // build genre map from artist genres — this is the rich signal
      const genreMap: Record<string, number> = {}
      for (const artist of artistsRes.data?.items ?? []) {
        for (const genre of artist.genres ?? []) {
          genreMap[genre] = clamp((genreMap[genre] ?? 0) + 0.15)
        }
      }

      const p = profileRef.current
      save({
        ...p,
        genres: { ...genreMap, ...p.genres }, // don't overwrite existing signals
        topArtists,
        topTracks,
        seededFromSpotify: true,
        lastUpdated: Date.now(),
      })

      console.log('[taste] seeded from Spotify:', {
        artists: topArtists.length,
        genreSignals: Object.keys(genreMap).length,
      })
    } catch (e) {
      console.error('[taste] spotify seed failed:', e)
    }
  }, [save])

  // build a chroma query string from the profile
  const toChromaQuery = useCallback((): string => {
    const p = profileRef.current

    // take top positive signals, sorted by weight
    const topGenres = topN(p.genres, 5)
    const topMoods  = topN(p.moods,  4)
    const topContexts = topN(p.contexts, 3)

    const parts = [
      ...topGenres,
      ...topMoods,
      ...topContexts,
      ...p.topArtists.slice(0, 3),
    ]

    return parts.length > 0 ? parts.join(' ') : 'music'
  }, [])

  const reset = useCallback(() => save(emptyProfile()), [save])

  return { profile, applySignal, seedFromSpotify, toChromaQuery, reset }
}

function topN(map: Record<string, number>, n: number): string[] {
  return Object.entries(map)
    .filter(([, v]) => v > 0)
    .sort(([, a], [, b]) => b - a)
    .slice(0, n)
    .map(([k]) => k)
}

function updateEnergyRange(
  current: [number, number] | null,
  energy: number,
  weight: number
): [number, number] {
  if (weight < 0) return current ?? [0, 1] // skips don't update energy range
  if (!current) return [Math.max(0, energy - 0.15), Math.min(1, energy + 0.15)]
  const [lo, hi] = current
  // gradually pull the range toward the new energy value
  return [
    clamp(lo * 0.9 + Math.max(0, energy - 0.15) * 0.1),
    clamp(hi * 0.9 + Math.min(1, energy + 0.15) * 0.1),
  ]
}