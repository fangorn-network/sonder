/**
 * useSessionKernel.ts
 *
 * React wrapper around sessionKernel.ts.
 *
 * - State lives in a ref (not useState) so kernel updates don't trigger re-renders.
 * - seedFromSpotify batch-embeds top tracks in one /embed call, returns the
 *   lookahead query vector so callers can immediately personalize browse.
 * - Kernel state persisted to localStorage on every mutation.
 */

import { useCallback, useEffect, useRef } from 'react'
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
import {
    KernelState,
    KernelParams,
    ChromaHit,
    WeightedHit,
} from '../kernel/types'
import { Vec } from '../kernel/Vec'

// ── config ────────────────────────────────────────────────────────────────────

const BASE_URL = 'http://localhost:8080'
const SEED_TRACK_LIMIT = 20
const KERNEL_STORAGE_KEY = 'sonder_kernel_state'

// ── persistence ───────────────────────────────────────────────────────────────

function saveKernel(state: KernelState): void {
    try {
        localStorage.setItem(KERNEL_STORAGE_KEY, JSON.stringify({
            mu:      Array.from(state.mu),
            v:       Array.from(state.v),
            sigma:   state.sigma,
            skips:   state.skips.map(s => Array.from(s)),
            t:       state.t,
            entropy: state.entropy,
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
            mu:      new Float32Array(p.mu),
            v:       new Float32Array(p.v),
            sigma:   p.sigma   ?? 0.3,
            skips:   (p.skips  ?? []).map((s: number[]) => new Float32Array(s)),
            t:       p.t       ?? 0,
            entropy: p.entropy ?? 0.2,
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

// ── types ─────────────────────────────────────────────────────────────────────

export interface UseSessionKernelOptions {
    params?:  KernelParams
    entropy?: number
}

// ── hook ──────────────────────────────────────────────────────────────────────

export function useSessionKernel(opts: UseSessionKernelOptions = {}) {
    const { params = {}, entropy = 0.2 } = opts

    const kernelRef  = useRef<KernelState>(loadKernel(params) ?? emptyKernel(params))
    const muPriorRef = useRef<Vec | null>(kernelRef.current.mu ?? null)

    useEffect(() => {
        kernelRef.current = { ...kernelRef.current, entropy }
        saveKernel(kernelRef.current)
    }, [entropy])

    // ── seed from Spotify ───────────────────────────────────────────────────────

    /**
     * Seed kernel from Spotify top tracks.
     * Returns the lookahead query vector q immediately after seeding —
     * callers should pass this to useChroma.applyKernelQuery() to
     * personalize the browse grid.
     *
     * Returns null if seeding fails or no tracks available.
     */
    const seedFromSpotify = useCallback(async (
        spotifyFetch: Function
    ): Promise<Vec | null> => {
        console.log('[kernel] seeding from Spotify...')

        try {
            const tracksRes = await spotifyFetch(
                '/v1/me/top/tracks?limit=50&time_range=medium_term'
            )

            const items = tracksRes.data?.items ?? []
            if (items.length === 0) {
                console.warn('[kernel] Spotify returned no top tracks')
                return null
            }

            const texts: string[] = items
                .slice(0, SEED_TRACK_LIMIT)
                .map((t: any) => `${t.artists[0]?.name ?? ''} - ${t.name}`)

            console.log(`[kernel] batch embedding ${texts.length} tracks...`)

            const embeddings = await fetchEmbeddingsBatch(texts)
            if (embeddings.length === 0) {
                console.warn('[kernel] no embeddings retrieved')
                return null
            }

            const state = initFromSeeds(embeddings, params)
            kernelRef.current  = { ...state, entropy }
            muPriorRef.current = state.mu
            saveKernel(kernelRef.current)

            // Return the lookahead query vector for immediate browse personalization
            const q = queryVector(kernelRef.current, params)

            console.log('[kernel] seeded:', {
                tracksEmbedded: embeddings.length,
                sigma:          state.sigma,
            })

            return q
        } catch (e) {
            console.error('[kernel] spotify seed failed:', e)
            return null
        }
    }, [params, entropy])

    // ── signal handlers ─────────────────────────────────────────────────────────

    const onTrackPlay = useCallback((embedding: Vec) => {
        kernelRef.current = onPlay(
            kernelRef.current,
            embedding,
            muPriorRef.current,
            params,
        )
        saveKernel(kernelRef.current)
        console.log('[kernel] play:', describe(kernelRef.current))
    }, [params])

    const onTrackSkip = useCallback((embedding: Vec) => {
        kernelRef.current = onSkip(kernelRef.current, embedding, params)
        saveKernel(kernelRef.current)
        console.log('[kernel] skip:', describe(kernelRef.current))
    }, [params])

    const onTrackJump = useCallback((embedding: Vec) => {
        kernelRef.current = onPlay(kernelRef.current, embedding, muPriorRef.current, params)
        kernelRef.current = onJump(kernelRef.current, params)
        saveKernel(kernelRef.current)
        console.log('[kernel] jump:', describe(kernelRef.current))
    }, [params])

    // ── query ───────────────────────────────────────────────────────────────────

    /**
     * Returns the current lookahead query vector q = μ + λ·v̂.
     * Use this to re-personalize browse after plays/skips accumulate.
     */
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

    // ── utilities ───────────────────────────────────────────────────────────────

    const getDiagnostics = useCallback(() => describe(kernelRef.current), [])

    const embedText = useCallback(
        (text: string): Promise<Vec> => fetchEmbedding(text),
        [],
    )

    const reset = useCallback(() => {
        kernelRef.current  = resetKernel(params)
        muPriorRef.current = null
        localStorage.removeItem(KERNEL_STORAGE_KEY)
        console.log('[kernel] reset')
    }, [params])

    return {
        seedFromSpotify,    // now returns Vec | null
        onTrackPlay,
        onTrackSkip,
        onTrackJump,
        getQueryVector,     // new — raw lookahead vector for browse personalization
        getNextCandidates,
        sampleNext,
        getDiagnostics,
        embedText,
        reset,
    }
}