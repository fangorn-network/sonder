/**
 * neighborhoodAnalysis.ts
 *
 * Pure analysis functions for the artist sound map.
 * No React, no D3, no external dependencies.
 *
 * The central questions, in plain English:
 *   - Who sounds most like this track?
 *   - How crowded is this artist's sonic territory?
 *   - Are they in unexplored space, or deep in a well-worn genre?
 *
 * All geometry is computed in the true high-dimensional space.
 * The 2D map is for display only — it's a faithful projection, not exact.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TrackNeighborData {
  id:         string
  artist:     string
  title:      string
  isrc?:      string
  durationMs: number
  genres:     string[]
  moods:      string[]
  themes:     string[]
  contexts:   string[]
  embedding:  Float32Array
  distance:   number    // internal similarity distance; 0 = this track
}

export interface ProjectedPoint extends TrackNeighborData {
  px:      number
  py:      number
  isFocal: boolean
}

export type SoundPosition = 'frontier' | 'periphery' | 'midfield' | 'core'

export interface NeighborhoodMetrics {
  peripherality:     number          // 0 = center of crowd, 1+ = out on your own
  soundPosition:     SoundPosition
  density10:         number          // how many artists are almost identical in sound
  density25:         number          // how many artists are in the same sonic territory
  nearestDistance:   number
  nearestNeighbor:   TrackNeighborData | null
  primaryGenre:      string | null
  genrePurity:       number          // 0 = genre crossroads, 1 = firmly in one genre
  explainedVariance: [number, number] // internal — not shown to users
}

// ── PCA via gram matrix ───────────────────────────────────────────────────────

/**
 * Projects N tracks into 2D for the sound map.
 *
 * Uses the gram matrix trick (N×N instead of d×d) —
 * fast for small N (50 tracks), large d (384 dimensions).
 */
export function pca2d(embeddings: Float32Array[]): {
  coords:            [number, number][]
  explainedVariance: [number, number]
} {
  const N = embeddings.length
  if (N === 0) return { coords: [], explainedVariance: [0, 0] }
  if (N === 1) return { coords: [[0, 0]], explainedVariance: [1, 0] }

  const d = embeddings[0].length

  const mean = new Float32Array(d)
  for (const e of embeddings) for (let j = 0; j < d; j++) mean[j] += e[j]
  for (let j = 0; j < d; j++) mean[j] /= N

  const Xc: Float32Array[] = embeddings.map(e => {
    const c = new Float32Array(d)
    for (let j = 0; j < d; j++) c[j] = e[j] - mean[j]
    return c
  })

  const G: number[][] = Array.from({ length: N }, (_, i) => {
    const row = new Array<number>(N)
    for (let j = 0; j < N; j++) {
      let s = 0
      for (let k = 0; k < d; k++) s += Xc[i][k] * Xc[j][k]
      row[j] = s
    }
    return row
  })

  const [u1, λ1] = powerIterate(G, N)
  const G2 = deflate(G, u1, λ1, N)
  const [u2, λ2] = powerIterate(G2, N)

  const traceG = G.reduce((s, row, i) => s + row[i], 0)
  const ev1 = traceG > 1e-12 ? λ1 / traceG : 0
  const ev2 = traceG > 1e-12 ? λ2 / traceG : 0

  const s1 = Math.sqrt(Math.max(λ1, 0))
  const s2 = Math.sqrt(Math.max(λ2, 0))

  return {
    coords: Array.from({ length: N }, (_, i) => [u1[i] * s1, u2[i] * s2]),
    explainedVariance: [ev1, ev2],
  }
}

function powerIterate(G: number[][], N: number, iters = 80): [number[], number] {
  let v: number[] = Array.from({ length: N }, (_, i) => Math.sin(i + 1))
  let λ = 0
  for (let iter = 0; iter < iters; iter++) {
    const vNext = new Array<number>(N).fill(0)
    for (let i = 0; i < N; i++)
      for (let j = 0; j < N; j++)
        vNext[i] += G[i][j] * v[j]
    λ = Math.sqrt(vNext.reduce((s, x) => s + x * x, 0))
    if (λ < 1e-14) break
    v = vNext.map(x => x / λ)
  }
  return [v, λ]
}

function deflate(G: number[][], u: number[], λ: number, N: number): number[][] {
  return Array.from({ length: N }, (_, i) =>
    Array.from({ length: N }, (_, j) => G[i][j] - λ * u[i] * u[j])
  )
}

// ── Metrics ───────────────────────────────────────────────────────────────────

export function computeMetrics(
  focal:     TrackNeighborData,
  neighbors: TrackNeighborData[],
  evFrac:    [number, number],
): NeighborhoodMetrics {
  if (neighbors.length === 0) {
    return {
      peripherality: 0, soundPosition: 'core',
      density10: 0, density25: 0,
      nearestDistance: Infinity, nearestNeighbor: null,
      primaryGenre: null, genrePurity: 0,
      explainedVariance: evFrac,
    }
  }

  const dists = neighbors.map(n => n.distance).sort((a, b) => a - b)
  const N     = dists.length
  const d     = focal.embedding.length

  const centroid = new Float32Array(d)
  for (const n of neighbors)
    for (let j = 0; j < d; j++) centroid[j] += n.embedding[j] / N

  let distFocalToCentroid = 0
  for (let j = 0; j < d; j++) {
    const diff = focal.embedding[j] - centroid[j]
    distFocalToCentroid += diff * diff
  }
  distFocalToCentroid = Math.sqrt(distFocalToCentroid)

  const meanDist     = dists.reduce((s, d) => s + d, 0) / N
  const peripherality = meanDist > 1e-12
    ? Math.min(distFocalToCentroid / meanDist, 2)
    : 0

  const soundPosition: SoundPosition =
    peripherality > 0.7 ? 'frontier' :
    peripherality > 0.5 ? 'periphery' :
    peripherality > 0.3 ? 'midfield' :
    'core'

  const p10 = dists[Math.floor(0.10 * N)] ?? dists[N - 1]
  const p25 = dists[Math.floor(0.25 * N)] ?? dists[N - 1]

  const top10 = [...neighbors].sort((a, b) => a.distance - b.distance).slice(0, 10)
  const genreCounts: Record<string, number> = {}
  for (const n of top10)
    for (const g of n.genres)
      genreCounts[g] = (genreCounts[g] ?? 0) + 1

  const primaryGenre = Object.keys(genreCounts).length > 0
    ? Object.entries(genreCounts).sort(([, a], [, b]) => b - a)[0][0]
    : null

  return {
    peripherality,
    soundPosition,
    density10:       dists.filter(d => d <= p10).length,
    density25:       dists.filter(d => d <= p25).length,
    nearestDistance: neighbors.reduce((a, b) => a.distance < b.distance ? a : b).distance,
    nearestNeighbor: neighbors.reduce((a, b) => a.distance < b.distance ? a : b),
    primaryGenre,
    genrePurity: primaryGenre && top10.length > 0
      ? top10.filter(n => n.genres.includes(primaryGenre)).length / top10.length
      : 0,
    explainedVariance: evFrac,
  }
}

// ── Main entry point ──────────────────────────────────────────────────────────

export function buildNeighborhood(
  focal:     TrackNeighborData,
  neighbors: TrackNeighborData[],
): { points: ProjectedPoint[]; metrics: NeighborhoodMetrics } {
  const all    = [{ ...focal, distance: 0 }, ...neighbors]
  const embeds = all.map(t => t.embedding)

  const { coords, explainedVariance } = pca2d(embeds)
  const metrics = computeMetrics(focal, neighbors, explainedVariance)

  return {
    points: all.map((t, i) => ({ ...t, px: coords[i][0], py: coords[i][1], isFocal: i === 0 })),
    metrics,
  }
}

// ── Display helpers ───────────────────────────────────────────────────────────

/** Deterministic genre → color. Same genre is always the same color. */
export function genreColor(genre: string | null | undefined): string {
  if (!genre) return '#666680'
  let h = 0
  for (let i = 0; i < genre.length; i++) h = (h * 31 + genre.charCodeAt(i)) >>> 0
  return `hsl(${h % 360}, 65%, 55%)`
}

/**
 * Human-readable similarity descriptor.
 * Shows how close two tracks are in sound — no numbers shown to users.
 */
export function soundSimilarity(d: number): string {
  if (d < 0.2) return 'nearly identical sound'
  if (d < 0.4) return 'sounds very similar'
  if (d < 0.6) return 'similar vibe'
  if (d < 0.9) return 'same general territory'
  if (d < 1.3) return 'loosely related'
  return 'different direction'
}

/**
 * How crowded is the immediate sonic space?
 * Based on how many near-identical tracks exist.
 */
export function competitionLabel(density10: number): {
  label:       string
  description: string
  color:       string
} {
  if (density10 <= 2) return {
    label:       'Wide open',
    description: 'Very few tracks sound this similar. You have room to breathe.',
    color:       '#4ade80',
  }
  if (density10 <= 5) return {
    label:       'Some company',
    description: 'A handful of tracks in your immediate sonic space.',
    color:       '#a3e635',
  }
  if (density10 <= 9) return {
    label:       'Competitive',
    description: 'Quite a few tracks sound like this. Standing out will take work.',
    color:       '#fbbf24',
  }
  return {
    label:       'Very crowded',
    description: 'This sound is heavily represented. You\'re fighting for ears with a lot of similar music.',
    color:       '#f87171',
  }
}

/**
 * Plain-English position card.
 * Artists see this as the headline insight about where their track sits.
 */
export function soundPositionMeta(pos: SoundPosition): {
  label:       string
  tagline:     string
  description: string
  color:       string
} {
  switch (pos) {
    case 'frontier': return {
      label:       'Breaking New Ground',
      tagline:     'You\'re in territory where few others have gone.',
      description: 'Listeners who venture into your sonic space will find you first, before the crowd. That\'s a real advantage — discovery algorithms and adventurous listeners are more likely to surface something genuinely new.',
      color:       '#00ffe7',
    }
    case 'periphery': return {
      label:       'On the Edge',
      tagline:     'Distinctive within your scene.',
      description: 'You sit where your genre meets something new. Listeners exploring outward from familiar territory will hit your music before they hit the mainstream. A great place to bridge audiences.',
      color:       '#7dd3fc',
    }
    case 'midfield': return {
      label:       'In the Mix',
      tagline:     'Solid company, room to grow.',
      description: 'You\'re surrounded by tracks you\'d be happy to be compared to. Not buried, not isolated — positioned well to be discovered alongside artists in your lane.',
      color:       '#fbbf24',
    }
    case 'core': return {
      label:       'Deep in the Scene',
      tagline:     'Right at the heart of your genre.',
      description: 'You\'re in the most-explored part of this sound. Lots of competition, but also where dedicated fans of this style will be looking. You\'ll need a strong identity to cut through.',
      color:       '#f87171',
    }
  }
}