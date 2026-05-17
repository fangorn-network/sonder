/**
 * useSessionKernel.ts
 *
 * React wrapper around sessionKernel.ts (v2).
 *
 * Changes from v1:
 * - onTrackPlay / onTrackSkip accept optional metadata (artist, genres, moods,
 *   themes, contexts, durationMs) alongside the embedding. Falls back cleanly
 *   when metadata isn't available — the geometric kernel still works.
 * - Persistence includes the new categorical fields (taste, artists, durationPref).
 * - `state` is now exposed as a useState mirror of the ref so the KernelVisualizer
 *   can subscribe to changes without polling.
 * - seedFromSpotify constructs TrackFeatures from Spotify items (categorical fields
 *   start empty and fill as the user plays tracks).
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import {
    initFromSeeds,
    emptyKernel,
    queryVector,
    reweight,
    sampleHit,
    onPlay,
    onSkip,
    onJump,
    resetKernel,
    describe,
} from '../kernel/SessionKernel'
import type {
    KernelState,
    KernelParams,
    ChromaHit,
    WeightedHit,
    TrackFeatures,
    TasteWeights,
} from '../kernel/types'
import type { Vec } from '../kernel/Vec'

// ── config ────────────────────────────────────────────────────────────────────

const BASE_URL          = 'http://localhost:8080'
const SEED_TRACK_LIMIT  = 20
const KERNEL_STORAGE_KEY = 'sonder_kernel_state_v2'   // bumped — v1 shape incompatible

// ── persistence ───────────────────────────────────────────────────────────────

function emptyTaste(): TasteWeights {
    return { genres: {}, moods: {}, themes: {}, contexts: {} }
}

function saveKernel(state: KernelState): void {
    try {
        localStorage.setItem(KERNEL_STORAGE_KEY, JSON.stringify({
            mu:           Array.from(state.mu),
            v:            Array.from(state.v),
            sigma:        state.sigma,
            skips:        state.skips.map(s => Array.from(s)),
            t:            state.t,
            entropy:      state.entropy,
            // v2 fields — plain objects, serialize trivially
            taste:        state.taste,
            artists:      state.artists,
            durationPref: state.durationPref,
        }))
    } catch (e) {
        console.warn('[kernel] failed to persist state:', e)
    }
}

function loadKernel(params: KernelParams): KernelState | null {
    try {
        const raw = localStorage.getItem(KERNEL_STORAGE_KEY)
        if (!raw) return null
        const p = JSON.parse(raw)
        if (!Array.isArray(p.mu) || p.mu.length !== 384) return null
        return {
            mu:           new Float32Array(p.mu),
            v:            new Float32Array(p.v),
            sigma:        p.sigma        ?? 0.3,
            skips:        (p.skips ?? []).map((s: number[]) => new Float32Array(s)),
            t:            p.t            ?? 0,
            entropy:      p.entropy      ?? 0.2,
            // v2 — fall back to empty if loading an old snapshot
            taste:        p.taste        ?? emptyTaste(),
            artists:      p.artists      ?? {},
            durationPref: p.durationPref ?? null,
        }
    } catch (e) {
        console.warn('[kernel] failed to load persisted state:', e)
        return null
    }
}

// ── api helpers ───────────────────────────────────────────────────────────────

async function fetchEmbedding(text: string): Promise<Vec> {
    const res = await fetch(`${BASE_URL}/embed`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ text }),
    })
    if (!res.ok) throw new Error(`/embed failed: ${res.status}`)
    const data = await res.json()
    return new Float32Array(data.embedding)
}

async function fetchEmbeddingsBatch(texts: string[]): Promise<Vec[]> {
    const res = await fetch(`${BASE_URL}/embed`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ texts }),
    })
    if (!res.ok) throw new Error(`/embed batch failed: ${res.status}`)
    const data = await res.json()
    return (data.embeddings as number[][]).map(e => new Float32Array(e))
}

async function searchByVector(
    embedding: Vec,
    nResults:  number = 20,
): Promise<ChromaHit[]> {
    const res = await fetch(`${BASE_URL}/search/vector`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
            embedding: Array.from(embedding),
            n_results: nResults,
        }),
    })
    if (!res.ok) throw new Error(`/search/vector failed: ${res.status}`)
    const data = await res.json()
    return data.results as ChromaHit[]
}

// ── signal metadata ───────────────────────────────────────────────────────────

/**
 * Partial track metadata that callers can attach to play/skip signals.
 * All fields are optional — the kernel degrades to geometry-only when absent.
 */
export interface TrackSignalMeta {
    artistId?:   string
    genres?:     string[]
    moods?:      string[]
    themes?:     string[]
    contexts?:   string[]
    durationMs?: number
}

function toTrackFeatures(embedding: Vec, meta: TrackSignalMeta = {}): TrackFeatures {
    return {
        embedding,
        artistId:   meta.artistId   ?? '',
        genres:     meta.genres     ?? [],
        moods:      meta.moods      ?? [],
        themes:     meta.themes     ?? [],
        contexts:   meta.contexts   ?? [],
        durationMs: meta.durationMs ?? 0,
    }
}

// ── options ───────────────────────────────────────────────────────────────────

export interface UseSessionKernelOptions {
    params?:  KernelParams
    entropy?: number
}

// ── hook ──────────────────────────────────────────────────────────────────────

export function useSessionKernel(opts: UseSessionKernelOptions = {}) {
    const { params = {}, entropy = 0.2 } = opts

    // Ref holds the live kernel — mutations don't trigger re-renders.
    // useState mirror is updated after every mutation for the visualizer.
    const kernelRef  = useRef<KernelState>(loadKernel(params) ?? emptyKernel(params))
    const muPriorRef = useRef<Vec | null>(kernelRef.current.mu ?? null)

    const [state, setState] = useState<KernelState>(kernelRef.current)

    // Helper: commit ref → storage → React state
    const commit = useCallback((next: KernelState) => {
        kernelRef.current = next
        saveKernel(next)
        setState(next)
    }, [])

    // Keep entropy in sync when the caller updates it externally
    useEffect(() => {
        commit({ ...kernelRef.current, entropy })
    }, [entropy]) // eslint-disable-line react-hooks/exhaustive-deps

    // ── seed from Spotify ─────────────────────────────────────────────────────

    /**
     * Seed kernel from Spotify top tracks.
     *
     * Constructs TrackFeatures with geometry from embeddings and artist IDs
     * from Spotify. Categorical fields (genres, moods, themes, contexts) start
     * empty — they accumulate as the user plays tracks from the library.
     *
     * Returns the lookahead query vector q so callers can immediately
     * personalize the browse grid.
     */
    const seedFromSpotify = useCallback(async (
        spotifyFetch: Function,
    ): Promise<Vec | null> => {
        console.log('[kernel] seeding from Spotify...')

        try {
            const tracksRes = await spotifyFetch(
                '/v1/me/top/tracks?limit=50&time_range=medium_term'
            )

            const items: any[] = tracksRes.data?.items ?? []
            if (items.length === 0) {
                console.warn('[kernel] Spotify returned no top tracks')
                return null
            }

            const sliced = items.slice(0, SEED_TRACK_LIMIT)
            const texts  = sliced.map((t: any) => `${t.artists[0]?.name ?? ''} - ${t.name}`)

            console.log(`[kernel] batch embedding ${texts.length} tracks...`)

            const embeddings = await fetchEmbeddingsBatch(texts)
            if (embeddings.length === 0) {
                console.warn('[kernel] no embeddings retrieved')
                return null
            }

            // Build TrackFeatures — categorical fields empty until user plays tracks
            const features: TrackFeatures[] = sliced.map((t: any, i: number) => ({
                embedding:   embeddings[i],
                artistId:    t.artists[0]?.name ?? '',
                genres:      [],
                moods:       [],
                themes:      [],
                contexts:    [],
                durationMs:  t.duration_ms ?? 0,
            }))

            const next     = initFromSeeds(features, params)
            muPriorRef.current = next.mu
            commit({ ...next, entropy })

            const q = queryVector(kernelRef.current, params)

            console.log('[kernel] seeded:', {
                tracksEmbedded: embeddings.length,
                sigma:          next.sigma,
            })

            return q
        } catch (e) {
            console.error('[kernel] spotify seed failed:', e)
            return null
        }
    }, [params, entropy, commit])

    // ── signal handlers ───────────────────────────────────────────────────────

    
    /**
     * Signal a played track.
     * Pass `meta` if you have taxonomy data — it feeds the categorical kernel.
     * The bare embedding path (no meta) still works exactly as in v1.
     */
    const onTrackPlay = useCallback((embedding: Vec, meta?: TrackSignalMeta) => {
        const track = toTrackFeatures(embedding, meta)
        commit(onPlay(kernelRef.current, track, muPriorRef.current, params))
        console.log('[kernel] play:', describe(kernelRef.current))
    }, [params, commit])

    /**
     * Signal a skipped track.
     * Pass `meta` if you have taxonomy data.
     */
    const onTrackSkip = useCallback((embedding: Vec, meta?: TrackSignalMeta) => {
        const track = toTrackFeatures(embedding, meta)
        commit(onSkip(kernelRef.current, track, params))
        console.log('[kernel] skip:', describe(kernelRef.current))
    }, [params, commit])

    /**
     * Signal a manual jump (user picks a very different track).
     * Records the play then resets velocity so the kernel doesn't
     * extrapolate the previous direction of travel.
     */
    const onTrackJump = useCallback((embedding: Vec, meta?: TrackSignalMeta) => {
        const track = toTrackFeatures(embedding, meta)
        const afterPlay = onPlay(kernelRef.current, track, muPriorRef.current, params)
        commit(onJump(afterPlay, params))
        console.log('[kernel] jump:', describe(kernelRef.current))
    }, [params, commit])

    // ── query ─────────────────────────────────────────────────────────────────

    const getQueryVector = useCallback((): Vec => {
        return queryVector(kernelRef.current, params)
    }, [params])

    const getNextCandidates = useCallback(async (
        nResults: number = 20,
    ): Promise<WeightedHit[]> => {
        const q    = queryVector(kernelRef.current, params)
        const hits = await searchByVector(q, nResults)
        if (hits.length === 0) return []
        const weighted = reweight(hits, kernelRef.current, params)
        return weighted.sort((a, b) => b.weight - a.weight)
    }, [params])

    const sampleNext = useCallback(async (
        nResults: number = 20,
    ): Promise<{ pick: WeightedHit; candidates: WeightedHit[] } | null> => {
        const candidates = await getNextCandidates(nResults)
        if (candidates.length === 0) return null
        const pick = sampleHit(candidates)
        return { pick, candidates }
    }, [getNextCandidates])

    // ── utilities ─────────────────────────────────────────────────────────────

    const getDiagnostics = useCallback(() => describe(kernelRef.current), [])

    const embedText = useCallback(
        (text: string): Promise<Vec> => fetchEmbedding(text),
        [],
    )

    const reset = useCallback(() => {
        const fresh = resetKernel(params)
        muPriorRef.current = null
        localStorage.removeItem(KERNEL_STORAGE_KEY)
        commit(fresh)
        console.log('[kernel] reset')
    }, [params, commit])

    return {
        // ── state (new) — subscribe for the visualizer ──────────────────────
        state,

        // ── signals ─────────────────────────────────────────────────────────
        onTrackPlay,        // now accepts optional TrackSignalMeta
        onTrackSkip,        // now accepts optional TrackSignalMeta
        onTrackJump,        // now accepts optional TrackSignalMeta

        // ── seeding ──────────────────────────────────────────────────────────
        seedFromSpotify,

        // ── query ────────────────────────────────────────────────────────────
        getQueryVector,
        getNextCandidates,
        sampleNext,

        // ── utilities ────────────────────────────────────────────────────────
        getDiagnostics,
        embedText,
        reset,
    }
}