/**
 * useSessionKernel.ts
 *
 * React wrapper around the corrected sessionKernel.
 *
 * Skip disambiguation:
 *   onTrackSkip() passes through to onSkip() in the kernel, which checks
 *   artists[a] at skip time and classifies the signal automatically:
 *     - artists[a] > fatigue_threshold → session mute (not a blacklist vote)
 *     - artists[a] ≤ fatigue_threshold → genuine dislike (neg accumulates)
 *   No separate UI signal needed. The muted set clears on session start.
 *
 * Suppression hierarchy (most to least severe):
 *   blacklist  — permanent, persisted, requires pardonArtist() to lift
 *   muted      — session-scoped, cleared on cold start or clearMuted()
 *
 * Both sets are excluded from candidates inside reweight() automatically.
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
  serialiseState,
  deserialiseState,
} from '../kernel/SessionKernel'
import type { KernelSnapshot } from '../kernel/SessionKernel'
import type {
  KernelState,
  KernelStateJSON,
  KernelParams,
  ChromaHit,
  WeightedHit,
  TrackFeatures,
} from '../kernel/types'
import type { Vec } from '../kernel/Vec'

export type { KernelSnapshot }

// ── config ────────────────────────────────────────────────────────────────────

const BASE_URL           = 'http://localhost:8080'
const KERNEL_STORAGE_KEY = 'sonder_kernel_state_v3'

// ── persistence ───────────────────────────────────────────────────────────────

function saveKernel(state: KernelState): void {
  try {
    localStorage.setItem(KERNEL_STORAGE_KEY, JSON.stringify(serialiseState(state)))
  } catch (e) {
    console.warn('[kernel] persist failed:', e)
  }
}

function loadKernel(): KernelState | null {
  try {
    const raw = localStorage.getItem(KERNEL_STORAGE_KEY)
    if (!raw) return null
    const json = JSON.parse(raw) as KernelStateJSON
    if (!Array.isArray(json.mu) || json.mu.length !== 384) return null
    // muted is always empty on load — session fatigue never survives a restart
    return deserialiseState(json)
  } catch (e) {
    console.warn('[kernel] load failed:', e)
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

  const kernelRef  = useRef<KernelState>(loadKernel() ?? emptyKernel(params))
  const muPriorRef = useRef<Vec | null>(kernelRef.current.mu ?? null)

  const [state, setState] = useState<KernelState>(kernelRef.current)

  const commit = useCallback((next: KernelState) => {
    kernelRef.current = next
    saveKernel(next)
    setState(next)
  }, [])

  useEffect(() => {
    commit({ ...kernelRef.current, entropy })
  }, [entropy]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── seeding ───────────────────────────────────────────────────────────────

  /**
   * Seed the kernel from pre-assembled TrackFeatures.
   * Embeddings + optional categorical metadata — callers source these however
   * they like (local library, MusicBrainz, Last.fm, etc.).
   * Returns the initial query vector so callers can immediately fire a Chroma search.
   */
  const seedFromTracks = useCallback((tracks: TrackFeatures[]): Vec => {
    if (tracks.length === 0) {
      console.warn('[kernel] seedFromTracks: empty, kernel unchanged')
      return queryVector(kernelRef.current, params)
    }
    const next = initFromSeeds(tracks, params)
    muPriorRef.current = next.mu
    commit({ ...next, entropy })
    const q = queryVector(kernelRef.current, params)
    console.log('[kernel] seeded:', { n: tracks.length, sigma: next.sigma })
    return q
  }, [params, entropy, commit])

  // ── signal handlers ───────────────────────────────────────────────────────

  /**
   * Signal a played track.
   * The muted set is not affected by plays — if you play a muted artist,
   * they remain muted for the session (you can explicitly unmute them).
   */
  const onTrackPlay = useCallback((embedding: Vec, meta?: TrackSignalMeta) => {
    const track = toTrackFeatures(embedding, meta)
    commit(onPlay(kernelRef.current, track, muPriorRef.current, params))
    console.log('[kernel] play:', describe(kernelRef.current, params))
  }, [params, commit])

  /**
   * Signal a skipped track.
   *
   * The kernel classifies the skip automatically:
   *   - If artists[a] > fatigue_threshold: session mute (no blacklist progression)
   *   - Otherwise: genuine dislike (neg accumulates toward theta_B)
   *
   * Geometric repulsion fires in both cases — the track region is avoided
   * for the remainder of the session regardless of classification.
   */
  const onTrackSkip = useCallback((embedding: Vec, meta?: TrackSignalMeta) => {
    const track = toTrackFeatures(embedding, meta)
    const next  = onSkip(kernelRef.current, track, params)

    // Log the classification so it's visible during development
    const artistId = meta?.artistId ?? ''
    const priorEma = kernelRef.current.artists[artistId] ?? 0
    const threshold = params.fatigue_threshold ?? 0.3
    const wasFatigue = artistId !== '' && priorEma > threshold

    commit(next)
    console.log(
      `[kernel] skip (${wasFatigue ? 'fatigue→muted' : 'dislike→neg'}):`,
      describe(kernelRef.current, params),
    )
  }, [params, commit])

  /**
   * Signal a manual jump. Records the play then resets velocity and spread.
   */
  const onTrackJump = useCallback((embedding: Vec, meta?: TrackSignalMeta) => {
    const track     = toTrackFeatures(embedding, meta)
    const afterPlay = onPlay(kernelRef.current, track, muPriorRef.current, params)
    commit(onJump(afterPlay, params))
    console.log('[kernel] jump:', describe(kernelRef.current, params))
  }, [params, commit])

  // ── suppression management ────────────────────────────────────────────────

  /**
   * Remove an artist from the permanent blacklist and reset their neg accumulator.
   * Also neutralises their artist EMA (clean slate for future interactions).
   */
  const pardonArtist = useCallback((artistId: string) => {
    const curr       = kernelRef.current
    const blacklist1 = new Set(curr.blacklist)
    blacklist1.delete(artistId)
    const neg1 = { ...curr.neg }
    delete neg1[artistId]
    commit({
      ...curr,
      blacklist: blacklist1,
      neg:       neg1,
      artists:   { ...curr.artists, [artistId]: 0 },
    })
    console.log(`[kernel] pardoned: ${artistId}`)
  }, [commit])

  /**
   * Clear the permanent blacklist and all neg accumulators.
   * Does not reset artist EMAs.
   */
  const clearBlacklist = useCallback(() => {
    commit({ ...kernelRef.current, blacklist: new Set(), neg: {} })
    console.log('[kernel] blacklist cleared')
  }, [commit])

  /**
   * Remove one artist from the session muted set.
   * They can now resurface as candidates for the rest of the session.
   * Has no effect on neg or blacklist.
   */
  const unmuteArtist = useCallback((artistId: string) => {
    const curr    = kernelRef.current
    const muted1  = new Set(curr.muted)
    muted1.delete(artistId)
    commit({ ...curr, muted: muted1 })
    console.log(`[kernel] unmuted: ${artistId}`)
  }, [commit])

  /**
   * Clear the entire session muted set.
   * All fatigue-muted artists become available as candidates again.
   * Has no effect on the permanent blacklist.
   */
  const clearMuted = useCallback(() => {
    commit({ ...kernelRef.current, muted: new Set() })
    console.log('[kernel] muted cleared')
  }, [commit])

  // ── query ─────────────────────────────────────────────────────────────────

  const getQueryVector = useCallback((): Vec =>
    queryVector(kernelRef.current, params),
  [params])

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
    return { pick: sampleHit(candidates), candidates }
  }, [getNextCandidates])

  // ── utilities ─────────────────────────────────────────────────────────────

  const getDiagnostics = useCallback(
    (): KernelSnapshot => describe(kernelRef.current, params),
    [params],
  )

  const embedText = useCallback(
    (text: string): Promise<Vec> => fetchEmbedding(text),
    [],
  )

  const reset = useCallback(() => {
    muPriorRef.current = null
    localStorage.removeItem(KERNEL_STORAGE_KEY)
    commit(resetKernel(params))
    console.log('[kernel] reset')
  }, [params, commit])

  // ── return ────────────────────────────────────────────────────────────────

  return {
    state,

    // Seeding
    seedFromTracks,

    // Interaction signals
    onTrackPlay,
    onTrackSkip,
    onTrackJump,

    // Suppression management
    pardonArtist,       // lift permanent blacklist for one artist
    clearBlacklist,     // clear all permanent suppression
    unmuteArtist,       // lift session fatigue mute for one artist
    clearMuted,         // clear all session fatigue mutes

    // Query
    getQueryVector,
    getNextCandidates,
    sampleNext,

    // Utilities
    getDiagnostics,
    embedText,
    reset,
  }
}