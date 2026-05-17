/**
 * contextScoring.ts
 *
 * Pure scoring functions that combine kernel ordering with active context biases.
 * No async, no side effects — safe to call inside handleNext.
 */

import type { Track } from '../types'
import type { AgentContext } from './useAgentContext'

// ─── energy curve ─────────────────────────────────────────────────────────────

/**
 * Returns a 0-1 target energy level based on session time and the curve shape.
 *
 * flat:          always 0.6 (moderate-high)
 * build:         ramps from 0.3 → 0.9 over 40 minutes
 * peak-and-drop: ramps to 0.9 over 25 min, drops to 0.2 over next 15 min
 */
export function energyTarget(curve: AgentContext['energyCurve'], startedAt: number): number {
  const elapsedMin = (Date.now() - startedAt) / 60_000

  switch (curve) {
    case 'flat':
      return 0.6

    case 'build': {
      const t = Math.min(elapsedMin / 40, 1)   // saturates at 40 min
      return 0.3 + t * 0.6
    }

    case 'peak-and-drop': {
      if (elapsedMin <= 25) {
        const t = elapsedMin / 25
        return 0.4 + t * 0.5                   // 0.4 → 0.9
      } else {
        const t = Math.min((elapsedMin - 25) / 15, 1)
        return 0.9 - t * 0.7                   // 0.9 → 0.2
      }
    }
  }
}

/**
 * How well a track's mood set matches a target energy level.
 * Energetic/aggressive moods score high; calm/melancholic score low.
 * Returns 0-1.
 */
const HIGH_ENERGY_MOODS = new Set([
  'energetic', 'aggressive', 'intense', 'driving', 'powerful',
  'euphoric', 'frantic', 'urgent', 'anthemic', 'triumphant',
])

const LOW_ENERGY_MOODS = new Set([
  'calm', 'peaceful', 'melancholic', 'dreamy', 'ambient',
  'gentle', 'meditative', 'intimate', 'tender', 'nostalgic',
])

export function energyMatch(trackMoods: string[], target: number): number {
  if (trackMoods.length === 0) return 0.5

  const highCount = trackMoods.filter(m => HIGH_ENERGY_MOODS.has(m)).length
  const lowCount = trackMoods.filter(m => LOW_ENERGY_MOODS.has(m)).length
  const trackEnergy = 0.5
    + (highCount / trackMoods.length) * 0.5
    - (lowCount / trackMoods.length) * 0.5

  // distance from target, inverted (closer = higher score)
  return 1 - Math.abs(trackEnergy - target)
}

// ─── main scorer ──────────────────────────────────────────────────────────────

/**
 * Combined score for a track given its kernel rank and an active context.
 *
 * finalScore = kernelScore × (1 + contextWeight × contextAffinity)
 *
 * kernelScore decays with rank so the kernel ordering is the foundation.
 * contextAffinity pulls tracks matching the current activity to the top.
 */
export function scoreTrack(
  track: Track,
  rank: number,
  total: number,    // pass tracks.length so we can normalize
  context: AgentContext,
): number {
  // kernel score normalized to [0,1]: rank 0 = 1.0, last rank → 0
  const kernelScore = total > 1 ? (total - 1 - rank) / (total - 1) : 1

  const moods = (track as any).moods ?? []
  const contexts = (track as any).contexts ?? []
  const genres = (track as any).genres ?? []

  const moodScore = overlap(moods, context.moodBias)
  const ctxScore = overlap(contexts, context.contextBias)
  const genreScore = overlap(genres, context.genreBias)
  const target = energyTarget(context.energyCurve, context.startedAt)
  const energyScore = energyMatch(moods, target)

  const contextAffinity = (
    moodScore * 0.35 +
    ctxScore * 0.30 +
    genreScore * 0.10 +
    energyScore * 0.25
  )

  // Additive blend — context weight of 0.7 means context genuinely overrides kernel
  // when active. Tune toward 0.5 if you want kernel to stay more influential.
  const w = 0.7
  return (1 - w) * kernelScore + w * contextAffinity
}

// ─── re-rank ──────────────────────────────────────────────────────────────────

/**
 * Re-rank a kernel-ordered track list using the active context.
 * Input list is assumed to already be in kernel order (position = kernel rank).
 * Returns a new array sorted by combined score, descending.
 */

// export function rankWithContext(
//   tracks: Track[],
//   context: AgentContext | null,
// ): Track[] {
//   if (!context) return tracks
//   const total = tracks.length
//   return tracks
//     .map((t, i) => ({ track: t, score: scoreTrack(t, i, total, context) }))
//     .sort((a, b) => b.score - a.score)
//     .map(({ track }) => track)
// }

function overlap(trackTags: string[], bias: string[]): number {
  if (bias.length === 0) return 0.5
  const normalizedBias = bias.map(t => t.toLowerCase().trim())
  const hits = trackTags.filter(t => normalizedBias.includes(t.toLowerCase().trim())).length
  return hits / bias.length
}

function hasAnyOverlap(track: Track, context: AgentContext): boolean {
  const moods = (track as any).moods ?? []
  const contexts = (track as any).contexts ?? []
  const genres = (track as any).genres ?? []
  const all = [...moods, ...contexts, ...genres].map((t: string) => t.toLowerCase().trim())
  const biases = [
    ...context.moodBias,
    ...context.contextBias,
    ...context.genreBias,
  ].map(t => t.toLowerCase().trim())
  return all.some(t => biases.includes(t))
}

export function rankWithContext(tracks: Track[], context: AgentContext | null): Track[] {
  if (!context) return tracks

  const total = tracks.length

  const scored = tracks.map((t, i) => ({
    track: t,
    score: scoreTrack(t, i, total, context),
    hasOverlap: hasAnyOverlap(t, context),
  }))

  const byScore = (a: typeof scored[0], b: typeof scored[0]) => b.score - a.score

  // Matching tracks always come first, sorted by score within each group.
  // Non-matching tracks follow, also sorted by score (= kernel order when affinity is 0).
  return [
    ...scored.filter(x => x.hasOverlap).sort(byScore),
    ...scored.filter(x => !x.hasOverlap).sort(byScore),
  ].map(x => x.track)
}