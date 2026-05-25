/**
 * neighborhoodAnalysis.ts
 *
 * Pure analysis functions for the artist neighborhood map.
 * No React, no D3, no external dependencies.
 *
 * The central questions:
 *   - Where in the embedding space does this track sit?
 *   - How crowded is its immediate neighborhood?
 *   - Is it in the interior of a cluster or on a frontier?
 *   - Which genre region dominates its neighborhood?
 *
 * All geometry is computed in ℝ^384 (the true embedding space).
 * The 2D projection is for display only.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

/** A track from ChromaDB with full metadata, including its L2 distance to the
 *  focal track in ℝ^384. distance=0 for the focal track itself. */
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
  distance:   number    // L2 distance to focal track in ℝ^384; 0 for focal
}

/** A TrackNeighborData augmented with its 2D PCA coordinates. */
export interface ProjectedPoint extends TrackNeighborData {
  px:      number   // PCA component 1 (horizontal)
  py:      number   // PCA component 2 (vertical)
  isFocal: boolean
}

export type ClusterPosition = 'frontier' | 'periphery' | 'midfield' | 'core'

export interface NeighborhoodMetrics {
  /** How far the focal track is from the centroid of its neighborhood,
   *  normalised by mean neighbor distance.
   *  High (> 0.6) = frontier — facing open space.
   *  Low  (< 0.3) = core    — buried in cluster interior.
   */
  peripherality:   number
  /** Qualitative label derived from peripherality. */
  clusterPosition: ClusterPosition

  /** Number of tracks within the 10th / 25th percentile L2 distance.
   *  High density → heavy competition in that shell. */
  density10:       number
  density25:       number

  /** L2 distance to the single closest neighbor in ℝ^384. */
  nearestDistance: number
  nearestNeighbor: TrackNeighborData | null

  /** Most common genre among the 10 nearest neighbors. */
  primaryGenre:    string | null
  /** Fraction of top-10 neighbors sharing the primary genre. [0, 1] */
  genrePurity:     number

  /** Fraction of variance explained by PC1 and PC2. */
  explainedVariance: [number, number]
}

// ── PCA via gram matrix ───────────────────────────────────────────────────────

/**
 * Project N embeddings to ℝ² using PCA.
 *
 * Uses the gram matrix (N×N) rather than the covariance matrix (d×d),
 * making this O(N²d + N³) instead of O(Nd² + d³) — fast for small N, large d.
 *
 * Returns:
 *   coords           — the N projected points
 *   explainedVariance — [fraction for PC1, fraction for PC2]
 */
export function pca2d(embeddings: Float32Array[]): {
  coords:           [number, number][]
  explainedVariance: [number, number]
} {
  const N = embeddings.length
  if (N === 0) return { coords: [], explainedVariance: [0, 0] }
  if (N === 1) return { coords: [[0, 0]], explainedVariance: [1, 0] }

  const d = embeddings[0].length

  // ── 1. Center the data ────────────────────────────────────────────────────
  const mean = new Float32Array(d)
  for (const e of embeddings) for (let j = 0; j < d; j++) mean[j] += e[j]
  for (let j = 0; j < d; j++) mean[j] /= N

  const Xc: Float32Array[] = embeddings.map(e => {
    const c = new Float32Array(d)
    for (let j = 0; j < d; j++) c[j] = e[j] - mean[j]
    return c
  })

  // ── 2. Gram matrix G = Xc Xc^T ∈ ℝ^{N×N} ────────────────────────────────
  const G: number[][] = Array.from({ length: N }, (_, i) => {
    const row = new Array<number>(N)
    for (let j = 0; j < N; j++) {
      let s = 0
      for (let k = 0; k < d; k++) s += Xc[i][k] * Xc[j][k]
      row[j] = s
    }
    return row
  })

  // ── 3. Power iteration for top 2 eigenvectors of G ────────────────────────
  // G = U Λ U^T (since G is symmetric PSD)
  // The 2D PCA projection is Y[n] = [U[n,0]·√λ₀,  U[n,1]·√λ₁]
  // (equivalent to the first two columns of U Σ from the thin SVD X = U Σ V^T)

  const [u1, λ1] = powerIterate(G, N)
  const G2 = deflate(G, u1, λ1, N)
  const [u2, λ2] = powerIterate(G2, N)

  // ── 4. Explained variance ─────────────────────────────────────────────────
  // Total variance = trace(G) = Σλᵢ
  const traceG = G.reduce((s, row, i) => s + row[i], 0)
  const ev1 = traceG > 1e-12 ? λ1 / traceG : 0
  const ev2 = traceG > 1e-12 ? λ2 / traceG : 0

  const s1 = Math.sqrt(Math.max(λ1, 0))
  const s2 = Math.sqrt(Math.max(λ2, 0))

  const coords: [number, number][] = Array.from({ length: N }, (_, i) => [
    u1[i] * s1,
    u2[i] * s2,
  ])

  return { coords, explainedVariance: [ev1, ev2] }
}

/** Power iteration: returns the dominant eigenvector and eigenvalue of a
 *  symmetric matrix. Converges in ~60 iterations for well-separated spectra. */
function powerIterate(G: number[][], N: number, iters = 80): [number[], number] {
  // Random initialisation — seeded deterministically for stability
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

/** Deflation: subtract the rank-1 outer product λ·u·uᵀ from G. */
function deflate(G: number[][], u: number[], λ: number, N: number): number[][] {
  return Array.from({ length: N }, (_, i) =>
    Array.from({ length: N }, (_, j) => G[i][j] - λ * u[i] * u[j])
  )
}

// ── Metrics ───────────────────────────────────────────────────────────────────

/**
 * Compute all neighborhood metrics from the focal track and its neighbors.
 *
 * All distance calculations use the true ℝ^384 L2 distances stored on
 * TrackNeighborData — NOT the projected 2D distances.
 */
export function computeMetrics(
  focal:     TrackNeighborData,
  neighbors: TrackNeighborData[],
  evFrac:    [number, number],
): NeighborhoodMetrics {
  if (neighbors.length === 0) {
    return {
      peripherality:    0,
      clusterPosition:  'core',
      density10:        0,
      density25:        0,
      nearestDistance:  Infinity,
      nearestNeighbor:  null,
      primaryGenre:     null,
      genrePurity:      0,
      explainedVariance: evFrac,
    }
  }

  const dists = neighbors.map(n => n.distance).sort((a, b) => a - b)
  const N     = dists.length

  // ── Peripherality ─────────────────────────────────────────────────────────
  // Centroid of the neighbor embeddings in ℝ^384
  const d = focal.embedding.length
  const centroid = new Float32Array(d)
  for (const n of neighbors)
    for (let j = 0; j < d; j++) centroid[j] += n.embedding[j] / N

  // Distance from focal to centroid
  let distFocalToCentroid = 0
  for (let j = 0; j < d; j++) {
    const diff = focal.embedding[j] - centroid[j]
    distFocalToCentroid += diff * diff
  }
  distFocalToCentroid = Math.sqrt(distFocalToCentroid)

  const meanDist = dists.reduce((s, d) => s + d, 0) / N
  const peripherality = meanDist > 1e-12
    ? Math.min(distFocalToCentroid / meanDist, 2)  // cap at 2 for display
    : 0

  // ── Cluster position label ────────────────────────────────────────────────
  const clusterPosition: ClusterPosition =
    peripherality > 0.7 ? 'frontier' :
    peripherality > 0.5 ? 'periphery' :
    peripherality > 0.3 ? 'midfield' :
    'core'

  // ── Density shells ────────────────────────────────────────────────────────
  const p10 = dists[Math.floor(0.10 * N)] ?? dists[N - 1]
  const p25 = dists[Math.floor(0.25 * N)] ?? dists[N - 1]
  const density10 = dists.filter(d => d <= p10).length
  const density25 = dists.filter(d => d <= p25).length

  // ── Nearest neighbor ──────────────────────────────────────────────────────
  const nearest = neighbors.reduce((a, b) => a.distance < b.distance ? a : b)

  // ── Genre profile (top 10 neighbors) ─────────────────────────────────────
  const top10 = [...neighbors].sort((a, b) => a.distance - b.distance).slice(0, 10)
  const genreCounts: Record<string, number> = {}
  for (const n of top10)
    for (const g of n.genres)
      genreCounts[g] = (genreCounts[g] ?? 0) + 1

  const primaryGenre = Object.keys(genreCounts).length > 0
    ? Object.entries(genreCounts).sort(([, a], [, b]) => b - a)[0][0]
    : null

  const genrePurity = primaryGenre && top10.length > 0
    ? top10.filter(n => n.genres.includes(primaryGenre)).length / top10.length
    : 0

  return {
    peripherality,
    clusterPosition,
    density10,
    density25,
    nearestDistance:  nearest.distance,
    nearestNeighbor:  nearest,
    primaryGenre,
    genrePurity,
    explainedVariance: evFrac,
  }
}

// ── Projection builder ────────────────────────────────────────────────────────

/**
 * Project the focal track and its neighbors into ℝ² and compute metrics.
 * This is the main entry point — call this once after fetching from Chroma.
 */
export function buildNeighborhood(
  focal:     TrackNeighborData,
  neighbors: TrackNeighborData[],
): {
  points:  ProjectedPoint[]
  metrics: NeighborhoodMetrics
} {
  const all   = [{ ...focal, distance: 0 }, ...neighbors]
  const embeds = all.map(t => t.embedding)

  const { coords, explainedVariance } = pca2d(embeds)
  const metrics = computeMetrics(focal, neighbors, explainedVariance)

  const points: ProjectedPoint[] = all.map((t, i) => ({
    ...t,
    px:      coords[i][0],
    py:      coords[i][1],
    isFocal: i === 0,
  }))

  return { points, metrics }
}

// ── Color utilities ───────────────────────────────────────────────────────────

/** Deterministic genre → color mapping.
 *  Same genre always gets the same color, regardless of what's in the neighborhood. */
export function genreColor(genre: string | null | undefined): string {
  if (!genre) return '#666680'
  // Consistent hash → hue
  let h = 0
  for (let i = 0; i < genre.length; i++) {
    h = (h * 31 + genre.charCodeAt(i)) >>> 0
  }
  const hue = h % 360
  return `hsl(${hue}, 65%, 55%)`
}

/** Format a raw L2 distance into a human-readable proximity descriptor. */
export function formatDistance(d: number): string {
  if (d < 0.2)  return 'extremely close'
  if (d < 0.4)  return 'very close'
  if (d < 0.6)  return 'close'
  if (d < 0.9)  return 'moderate'
  if (d < 1.3)  return 'distant'
  return 'very distant'
}

export function clusterPositionMeta(pos: ClusterPosition): {
  label: string
  description: string
  color: string
} {
  switch (pos) {
    case 'frontier': return {
      label:       'Frontier',
      description: 'You sit at the edge of your cluster, facing open space. Listener kernels moving outward from your genre region will encounter you with less competition.',
      color:       '#00ffe7',
    }
    case 'periphery': return {
      label:       'Periphery',
      description: 'On the outer ring of a cluster. You have some breathing room and a reasonable chance of being the first track a kernel encounters from this direction.',
      color:       '#7dd3fc',
    }
    case 'midfield': return {
      label:       'Midfield',
      description: 'Solidly inside the cluster but not at the center. Moderate competition — you share kernel candidate sets with many other tracks.',
      color:       '#fbbf24',
    }
    case 'core': return {
      label:       'Core',
      description: 'At the dense interior of your cluster. High competition — many similar tracks vie for kernel weight in the same candidate sets.',
      color:       '#f87171',
    }
  }
}