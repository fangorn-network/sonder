/**
 * sessionKernel.ts  (v2)
 *
 * Markov kernel over the all-MiniLM-L6-v2 embedding space (d=384, L2),
 * now augmented with categorical taste tracking across taxonomy dimensions.
 *
 * State: (μ, v, σ, taste, artists, durationPref, entropy)
 *
 *   μ ∈ ℝ^d              current position (EMA of play embeddings)
 *   v ∈ ℝ^d              velocity (EMA of displacement — direction of travel)
 *   σ ∈ ℝ^+              spread (width of query Gaussian)
 *   taste                leaky accumulators over {genres, moods, themes, contexts}
 *   artists              EMA affinity map over artistId strings
 *   durationPref         EMA of played duration (ms), null until first play
 *   entropy              dynamically updated: rises on skips (explore), falls on plays (exploit)
 *
 * Composite reweighting (log-additive, numerically stable softmax):
 *
 *   logW_i = – d_i²/(2σ²)                        geometric proximity to query
 *            – γ/(‖e_i – e_skip‖² + ε) per skip  skip repulsion
 *            + τ_cat · log(taxonomy_affinity_i)   categorical taste match
 *            + τ_art · log(artist_affinity_i)     artist preference
 *            + τ_dur · log(duration_affinity_i)   soft duration preference
 *
 * Entropy temperature flattens the full composite (not just the geometric term).
 *
 * ─── Breaking changes from v1 ────────────────────────────────────────────────
 *  - onPlay / onSkip now accept TrackFeatures instead of bare Vec
 *  - initFromSeeds now accepts TrackFeatures[] instead of Vec[]
 *  - KernelState gains: taste, artists, durationPref
 *  - ChromaHit should include a metadata field (TrackMetadata) populated by Chroma
 *  - Add new DEFAULTS entries: tau_cat, tau_art, tau_dur, cat_floor, art_floor,
 *    dur_sigma_ms, alpha_taste, taste_decay, skip_taste_pen, beta_artist, rho_duration
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { statusNetworkSepolia } from 'viem/chains'
import { D, DEFAULTS } from './constants'
import {
  ChromaHit, KernelParams, KernelState, WeightedHit,
  TrackFeatures, TasteWeights,
} from './types'
import {
  Vec,
  zeros, clone, add, sub, scale, norm,
  weightedMean, projectOut, l2dist,
} from './Vec'

// ── taste helpers ─────────────────────────────────────────────────────────────

function emptyTaste(): TasteWeights {
  return { genres: {}, moods: {}, themes: {}, contexts: {} }
}

/**
 * Decay all leaky-accumulator weights by factor (1 – decay).
 * Applied on every play so stale preferences fade over time.
 */
function decayTaste(taste: TasteWeights, decay: number): TasteWeights {
  const k = 1 - decay
  const d = (rec: Record<string, number>) =>
    Object.fromEntries(Object.entries(rec).map(([tag, w]) => [tag, w * k]))
  return {
    genres: d(taste.genres),
    moods: d(taste.moods),
    themes: d(taste.themes),
    contexts: d(taste.contexts),
  }
}

/**
 * Add `rate` to each tag present in the played track.
 */
function accumulateTaste(
  taste: TasteWeights,
  track: Pick<TrackFeatures, 'genres' | 'moods' | 'themes' | 'contexts'>,
  rate: number,
): TasteWeights {
  const acc = (rec: Record<string, number>, tags: string[]) => {
    const out = { ...rec }
    for (const tag of tags) out[tag] = (out[tag] ?? 0) + rate
    return out
  }
  return {
    genres: acc(taste.genres, track.genres),
    moods: acc(taste.moods, track.moods),
    themes: acc(taste.themes, track.themes),
    contexts: acc(taste.contexts, track.contexts),
  }
}

/**
 * Subtract `penalty` from each tag in the skipped track, clamped to zero.
 */
function penalizeTaste(
  taste: TasteWeights,
  track: Pick<TrackFeatures, 'genres' | 'moods' | 'themes' | 'contexts'>,
  penalty: number,
): TasteWeights {
  const pen = (rec: Record<string, number>, tags: string[]) => {
    const out = { ...rec }
    for (const tag of tags) out[tag] = Math.max((out[tag] ?? 0) - penalty, 0)
    return out
  }
  return {
    genres: pen(taste.genres, track.genres),
    moods: pen(taste.moods, track.moods),
    themes: pen(taste.themes, track.themes),
    contexts: pen(taste.contexts, track.contexts),
  }
}

/**
 * Normalized average taste weight for a set of tags in one dimension.
 *
 * Returns `floor` when the dimension is empty or no known tags are present —
 * this prevents total suppression of unexplored tag space during early sessions.
 */
function dimScore(weights: Record<string, number>, tags: string[], floor: number): number {
  if (tags.length === 0) return floor
  const total = Object.values(weights).reduce((s, w) => s + w, 0)
  if (total < 1e-10) return floor
  let score = 0
  for (const tag of tags) score += (weights[tag] ?? 0) / total
  return Math.max(score / tags.length, floor)
}

/**
 * Composite taxonomy affinity — simple average across all four dimensions.
 * Range: [floor, 1].
 */
function taxonomyAffinity(
  taste: TasteWeights,
  track: Pick<TrackFeatures, 'genres' | 'moods' | 'themes' | 'contexts'>,
  floor: number,
): number {
  const g = dimScore(taste.genres, track.genres, floor)
  const m = dimScore(taste.moods, track.moods, floor)
  const t = dimScore(taste.themes, track.themes, floor)
  const c = dimScore(taste.contexts, track.contexts, floor)
  return (g + m + t + c) / 4
}

/**
 * Artist affinity from the EMA map, clamped to [floor, ∞).
 * floor prevents an artist from being permanently zeroed if never seen.
 */
function artistAffinity(
  artists: Record<string, number>,
  artistId: string,
  floor: number,
): number {
  return Math.max(artists[artistId] ?? 0, floor)
}

/**
 * Soft Gaussian preference over track duration.
 * Returns 1.0 when no preference has been established yet (null durationPref).
 */
function durationAffinity(
  pref: number | null,
  durationMs: number,
  durSigmaMs: number,
): number {
  if (pref === null) return 1.0
  const delta = durationMs - pref
  return Math.exp(-(delta * delta) / (2 * durSigmaMs * durSigmaMs))
}

// ── init ──────────────────────────────────────────────────────────────────────

/**
 * Cold start from seed tracks (e.g. Spotify top tracks).
 *
 * Geometric position: harmonic-weighted mean of embeddings (rank-1 dominates but gently).
 * Categorical: each seed contributes equally to the initial taste distribution.
 * Velocity starts at zero — no direction until plays accumulate.
 */
export function initFromSeeds(
  tracks: TrackFeatures[],
  params: KernelParams = {},
): KernelState {
  const { sigma_base = DEFAULTS.sigma_base } = params

  const harmonicWeights = tracks.map((_, i) => 1 / Math.log(i + 2))
  const mu = weightedMean(tracks.map(t => t.embedding), harmonicWeights)

  const seedRate = 1 / Math.max(tracks.length, 1)
  let taste = emptyTaste()
  const artists: Record<string, number> = {}

  for (const track of tracks) {
    taste = accumulateTaste(taste, track, seedRate)
    artists[track.artistId] = (artists[track.artistId] ?? 0) + seedRate
  }

  return {
    mu,
    v: zeros(D),
    sigma: sigma_base,
    skips: [],
    t: 0,
    entropy: 0.2,
    taste,
    artists,
    durationPref: null,
  }
}

/**
 * Fallback: empty kernel centered at origin.
 * Prior pull will drag it toward mu_prior once established.
 */
export function emptyKernel(params: KernelParams = {}): KernelState {
  const { sigma_base = DEFAULTS.sigma_base } = params
  return {
    mu: zeros(D),
    v: zeros(D),
    sigma: sigma_base,
    skips: [],
    t: 0,
    entropy: 0.2,
    taste: emptyTaste(),
    artists: {},
    durationPref: null,
  }
}

// ── query ─────────────────────────────────────────────────────────────────────

/**
 * Returns the lookahead query vector q to send to Chroma.
 *
 * q = μ + λ_max · tanh(‖v‖) · v̂
 *
 * Unchanged from v1 — this only touches (μ, v).
 */
export function queryVector(state: KernelState, params: KernelParams = {}): Vec {
  const { lambda_max = DEFAULTS.lambda_max } = params
  const vnorm = norm(state.v)
  if (vnorm < 1e-10) return clone(state.mu)
  const lambda = lambda_max * Math.tanh(vnorm)
  const vhat = scale(state.v, 1 / vnorm)
  return add(state.mu, scale(vhat, lambda))
}

// ── reweighting ───────────────────────────────────────────────────────────────

/**
 * Multi-signal importance reweighting via log-additive scoring.
 *
 * Log-weight for hit i (before temperature):
 *
 *   logW_i = – d_i²/(2σ²)                        geometric proximity
 *            – γ/(‖e_i – e_skip‖² + ε) per skip  skip repulsion  (γ > 0, so this subtracts)
 *            + τ_cat · log(taxonomy_affinity_i)   categorical taste match
 *            + τ_art · log(artist_affinity_i)     artist preference
 *            + τ_dur · log(duration_affinity_i)   soft duration preference
 *
 * Temperature flattening: logW → logW / temp, where temp = temp_base + entropy·(temp_max – temp_base).
 * Converted to probabilities via numerically stable softmax.
 *
 * Note: hit.metadata must be populated. Pass include=['embeddings','distances','metadatas']
 * in your Chroma query. Hits without metadata fall back to geometry + skip repulsion only.
 *
 * Note on hit.distance: Chroma's L2 space returns squared Euclidean distance directly.
 * We therefore use hit.distance as d² in the Gaussian — do not square it again.
 */
export function reweight(
  hits: ChromaHit[],
  state: KernelState,
  params: KernelParams = {},
): WeightedHit[] {
  const {
    gamma_coeff = DEFAULTS.gamma_coeff,
    epsilon = DEFAULTS.epsilon,
    temp_base = DEFAULTS.temp_base,
    temp_max = DEFAULTS.temp_max,
    tau_cat = DEFAULTS.tau_cat,
    tau_art = DEFAULTS.tau_art,
    tau_dur = DEFAULTS.tau_dur,
    cat_floor = DEFAULTS.cat_floor,
    art_floor = DEFAULTS.art_floor,
    dur_sigma_ms = DEFAULTS.dur_sigma_ms,
  } = params

  const sigma = state.sigma
  const gamma = gamma_coeff * sigma    // gamma_coeff > 0; repulsion is subtracted below
  const temp = temp_base + state.entropy * (temp_max - temp_base)

  const logWeights = hits.map(hit => {
    const e = new Float32Array(hit.embedding)

    // 1. Geometric: Gaussian proximity to query point
    //    hit.distance is squared L2 from Chroma — use directly as d²
    let logW = -hit.distance / (2 * sigma * sigma)

    // 2. Skip repulsion — subtract so hits near skips are down-weighted
    for (const skip of state.skips) {
      const ds2 = l2dist(e, skip) ** 2
      logW -= gamma / (ds2 + epsilon)
    }

    // 3–5. Categorical signals (require metadata)
    const meta = hit.metadata
    if (meta) {
      // Taxonomy: does this track match what the user has been playing?
      const catScore = taxonomyAffinity(state.taste, meta, cat_floor)
      logW += tau_cat * Math.log(catScore)

      // Artist: has the user signaled preference for this artist?
      const artScore = artistAffinity(state.artists, meta.artistId, art_floor)
      logW += tau_art * Math.log(artScore)

      // Duration: is this track close to the user's recent duration preference?
      const durScore = durationAffinity(state.durationPref, meta.durationMs, dur_sigma_ms)
      logW += tau_dur * Math.log(Math.max(durScore, 1e-9))
    }

    return logW
  })

  // Temperature flattening in log space (equivalent to w^(1/temp) in weight space)
  const tempered = logWeights.map(lw => lw / temp)

  // Numerically stable softmax: subtract max before exp to prevent overflow
  const maxLW = Math.max(...tempered)
  const raw = tempered.map(lw => Math.exp(lw - maxLW))
  const total = raw.reduce((s, w) => s + w, 0)

  if (total < 1e-12) {
    const u = 1 / hits.length
    return hits.map(h => ({ ...h, weight: u }))
  }

  return hits.map((h, i) => ({ ...h, weight: raw[i] / total }))
}

/**
 * Sample one hit from the weighted candidates.
 */
export function sampleHit(weighted: WeightedHit[]): WeightedHit {
  let r = Math.random()
  for (const h of weighted) {
    r -= h.weight
    if (r <= 0) return h
  }
  return weighted[weighted.length - 1]
}

// ── state transitions ─────────────────────────────────────────────────────────

/**
 * κ(play): update state on a completed play.
 *
 * Geometric (unchanged):
 *   μ_t = α·e_t + (1–α)·μ_{t-1}         position EMA
 *   v_t = β·v_{t-1} + (1–β)·(e_t – μ_{t-1})  velocity EMA
 *   σ_t = ρ·σ_{t-1} + (1–ρ)·σ_base       spread contracts (more confident)
 *
 * Categorical (new):
 *   taste ← decay(taste) then accumulate(track tags, alpha_taste)
 *   artists[id] ← β_art · artists[id] + (1–β_art) · 1.0
 *   durationPref ← EMA toward track.durationMs
 *
 * Entropy: decreases slightly on play (exploitation signal → converge)
 */
export function onPlay(
  state: KernelState,
  track: TrackFeatures,
  muPrior: Vec | null = null,
  params: KernelParams = {},
): KernelState {
  const {
    alpha = DEFAULTS.alpha,
    beta = DEFAULTS.beta,
    sigma_base = DEFAULTS.sigma_base,
    rho = DEFAULTS.rho,
    prior_k = DEFAULTS.prior_k,
    alpha_taste = DEFAULTS.alpha_taste,
    taste_decay = DEFAULTS.taste_decay,
    beta_artist = DEFAULTS.beta_artist,
    rho_duration = DEFAULTS.rho_duration,
  } = params

  const e = track.embedding
  const mu0 = state.mu
  const t1 = state.t + 1

  // ── Geometric ─────────────────────────────────────────────────────────────
  let mu1 = add(scale(e, alpha), scale(mu0, 1 - alpha))

  if (muPrior !== null) {
    // Prior pull decays as 1/t — matters early, irrelevant after a few plays
    const pull = prior_k / t1
    mu1 = add(mu1, scale(sub(muPrior, mu1), pull))
  }

  const v1 = add(scale(state.v, beta), scale(sub(e, mu0), 1 - beta))
  const sigma1 = rho * state.sigma + (1 - rho) * sigma_base

  // ── Categorical ───────────────────────────────────────────────────────────
  // Decay first so stale preferences lose weight, then accumulate new signal
  const taste1 = accumulateTaste(decayTaste(state.taste, taste_decay), track, alpha_taste)

  const artistId = track.artistId
  const artists1 = {
    ...state.artists,
    [artistId]: beta_artist * (state.artists[artistId] ?? 0) + (1 - beta_artist),
  }

  const durationPref1 = state.durationPref === null
    ? track.durationMs
    : rho_duration * state.durationPref + (1 - rho_duration) * track.durationMs

  // ── Entropy ───────────────────────────────────────────────────────────────
  // Play = user is satisfied → narrow toward exploitation
  const entropy1 = Math.max(state.entropy * 0.95, 0.05)

  return {
    ...state,
    mu: mu1,
    v: v1,
    sigma: sigma1,
    t: t1,
    taste: taste1,
    artists: artists1,
    durationPref: durationPref1,
    entropy: entropy1,
  }
}

/**
 * κ(skip): update state on a skipped track.
 *
 * Geometric (unchanged):
 *   1. Velocity deflection — project out component pointing toward skip region
 *   2. Position repulsion — push μ away from skip embedding
 *   3. Spread expansion  — skip = uncertainty, widen the distribution
 *   4. Append to skip buffer (capped at skip_window)
 *
 * Categorical (new):
 *   taste ← penalize(track tags, skip_taste_pen)
 *   artists[id] ← β_art · artists[id] + (1–β_art) · (–0.5)  (weak negative signal)
 *
 * Entropy: increases on skip (exploration signal → open up)
 *
 * Note: artist negative signal uses –0.5 not –1.0 so repeated skips of an artist
 * don't fully zero them out. The same artist can resurface if they pivot style.
 */
export function onSkip(
  state: KernelState,
  track: TrackFeatures,
  params: KernelParams = {},
): KernelState {
  const {
    sigma_base = DEFAULTS.sigma_base,
    gamma_coeff = DEFAULTS.gamma_coeff,
    skip_window = DEFAULTS.skip_window,
    skip_taste_pen = DEFAULTS.skip_taste_pen,
    beta_artist = DEFAULTS.beta_artist,
  } = params

  const e = track.embedding
  const mu = state.mu
  const sigma = state.sigma
  const gamma = gamma_coeff * sigma    // gamma > 0; used as magnitude below

  // ── Geometric ─────────────────────────────────────────────────────────────
  // 1. Gram-Schmidt deflection: remove v component pointing toward skip
  const skip_dir = sub(e, mu)
  const v1 = norm(skip_dir) < 1e-10
    ? state.v
    : projectOut(state.v, skip_dir)

  // 2. Push μ away from skip (gamma as positive magnitude)
  const away = sub(mu, e)
  const away_norm = norm(away)
  const mu1 = away_norm < 1e-10
    ? mu
    : add(mu, scale(away, gamma / away_norm))

  // 3. Widen spread
  const sigma1 = Math.min(sigma * 1.1, sigma_base * 2)

  // 4. Append to skip buffer
  const skips1 = [...state.skips, clone(e)]
  if (skips1.length > skip_window) skips1.shift()

  // ── Categorical ───────────────────────────────────────────────────────────
  const taste1 = penalizeTaste(state.taste, track, skip_taste_pen)

  const artistId = track.artistId
  const artists1 = {
    ...state.artists,
    [artistId]: beta_artist * (state.artists[artistId] ?? 0) + (1 - beta_artist) * (-0.5),
  }

  // ── Entropy ───────────────────────────────────────────────────────────────
  // Skip = user is dissatisfied → push toward exploration
  const entropy1 = Math.min(state.entropy * 1.1 + 0.02, 1.0)

  return {
    ...state,
    mu: mu1,
    v: v1,
    sigma: sigma1,
    skips: skips1,
    taste: taste1,
    artists: artists1,
    entropy: entropy1,
  }
}

/**
 * Reset velocity and spread on a manual jump.
 * We know where the user is but not where they're going.
 */
export function onJump(state: KernelState, params: KernelParams = {}): KernelState {
  const { sigma_base = DEFAULTS.sigma_base } = params
  return { ...state, v: zeros(D), sigma: sigma_base }
}

export function resetKernel(params: KernelParams = {}): KernelState {
  return emptyKernel(params)
}

// ── diagnostics ───────────────────────────────────────────────────────────────

/**
 * Human-readable summary of kernel state.
 * Now includes top categorical preferences for agent-layer interpretation.
 */
export function describe(state: KernelState): {
  speed: number
  lookahead: number
  spread: number
  nSkips: number
  timestep: number
  entropy: number
  topGenres: [string, number][]
  topMoods: [string, number][]
  topThemes: [string, number][]
  topArtists: [string, number][]
  durationPref: string | null
} {
  const vn = norm(state.v)
  const lambda = DEFAULTS.lambda_max * Math.tanh(vn)

  const topN = (rec: Record<string, number>, n = 3): [string, number][] => {
    if (!rec) {
      const out: [string, number][] = []
      return out
    }

    return Object.entries(rec)
      .sort(([, a], [, b]) => b - a)
      .slice(0, n)
      .map(([k, v]) => [k, Math.round(v * 1000) / 1000])
  }

  const taste = state.taste
  let topGenres: [string, number][] = []
  let topMoods: [string, number][] = []
  let topThemes: [string, number][] = []
  if (taste) {
    topGenres = topN(state.taste.genres)
    topMoods = topN(state.taste.moods)
    topThemes = topN(state.taste.themes)
  }

  return {
    speed: Math.round(vn * 1000) / 1000,
    lookahead: Math.round(lambda * 1000) / 1000,
    spread: Math.round(state.sigma * 1000) / 1000,
    nSkips: state.skips.length,
    timestep: state.t,
    entropy: Math.round(state.entropy * 1000) / 1000,
    topGenres,
    topMoods,
    topThemes,
    topArtists: topN(state.artists),
    durationPref: state.durationPref !== null
      ? `${Math.round(state.durationPref / 1000)}s`
      : null,
  }
}