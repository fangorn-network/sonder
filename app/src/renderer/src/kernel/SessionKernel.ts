/**
 * sessionKernel.ts
 *
 * Implements a Markov kernel over the all-MiniLM-L6-v2 embedding space (d=384, L2).
 * > "Manhattan" metric
 *
 * State: $(\mu, \nu, \sigma)$
 *   $\mu \in \mathbb{R}^d$ - current position (weighted mean of recent plays)
 *   $\nu \in \mathbb{R}^d$ - velocity (EMA of displacement, direction of travel)
 *   $\sigma \in \mathbb{R}^+$ - spread (controls how wide the query distribution is)
 *
 * The kernel κ(dy | μ, v, σ) = N(q, σ²I) where q = μ + λ·v̂ is the lookahead point.
 *
 * Chroma approximates sampling from κ by returning k-nearest neighbors to q,
 * which we then reweight and resample using importance weights.
 */

import { D, DEFAULTS } from './constants'
import { ChromaHit, KernelParams, KernelState, WeightedHit } from './types'
import {
  Vec,
  zeros, clone, add, sub, scale, dot, norm, normalize,
  weightedMean, projectOut, l2dist,
} from './Vec'

// ── init ─────────────────────────────────────────────────────────────────────

/**
 * Cold start: initialize kernel from a set of seed embeddings (e.g. Spotify top tracks).
 * Weights are harmonic by rank: w_i = 1 / log(i + 2)
 * so rank-1 dominates but not overwhelmingly.
 *
 * v starts at zero — no direction until plays accumulate.
 * σ starts at sigma_base.
 */
export function initFromSeeds(
  embeddings: Vec[],
  params: KernelParams = {},
): KernelState {
  const { sigma_base = DEFAULTS.sigma_base } = params

  const weights = embeddings.map((_, i) => 1 / Math.log(i + 2))
  const mu = weightedMean(embeddings, weights)

  return {
    mu,
    v:       zeros(D),
    sigma:   sigma_base,
    skips:   [],
    t:       0,
    entropy: 0.2,
  }
}

/**
 * Fallback: empty kernel centered at origin.
 * Used when no seeds available — prior pull will drag it toward
 * mu_prior once that's set.
 */
export function emptyKernel(params: KernelParams = {}): KernelState {
  const { sigma_base = DEFAULTS.sigma_base } = params
  return {
    mu:      zeros(D),
    v:       zeros(D),
    sigma:   sigma_base,
    skips:   [],
    t:       0,
    entropy: 0.2,
  }
}

// ── query ─────────────────────────────────────────────────────────────────────

/**
 * Returns the lookahead query vector q to send to Chroma.
 *
 * q = μ + λ_max · tanh(‖v‖) · v̂
 *
 * When v = 0: tanh(0) = 0, so q = μ (query where you are).
 * As velocity builds: tanh grows, lookahead extends in direction of travel.
 * tanh bounds λ regardless of ‖v‖ magnitude.
 */
export function queryVector(
  state: KernelState,
  params: KernelParams = {},
): Vec {
  const { lambda_max = DEFAULTS.lambda_max } = params
  const vnorm = norm(state.v)

  if (vnorm < 1e-10) return clone(state.mu)

  const lambda = lambda_max * Math.tanh(vnorm)
  const vhat   = scale(state.v, 1 / vnorm)
  return add(state.mu, scale(vhat, lambda))
}

// ── reweighting ───────────────────────────────────────────────────────────────

/**
 * Convert raw Chroma hits into importance-weighted candidates.
 *
 * Weight for hit i:
 *   w_i = exp(-d_i² / 2σ²) · ∏_{s ∈ skips} exp(γ / (‖e_i - e_s‖² + ε))
 *
 * The first term: Gaussian kernel centered at query — closer hits get higher weight.
 * The second term: repulsion from skip embeddings — hits near skips get down-weighted.
 *
 * Entropy flattens the weights by raising them to 1/(1 + η·(T_max - T_base)):
 * at entropy=0, pure weights; at entropy=1, nearly uniform → more surprise.
 */
export function reweight(
  hits: ChromaHit[],
  state: KernelState,
  params: KernelParams = {},
): WeightedHit[] {
  const {
    sigma_base  = DEFAULTS.sigma_base,
    gamma_coeff = DEFAULTS.gamma_coeff,
    epsilon     = DEFAULTS.epsilon,
    temp_base   = DEFAULTS.temp_base,
    temp_max    = DEFAULTS.temp_max,
  } = params

  const sigma  = state.sigma
  const gamma  = gamma_coeff * sigma
  const eta    = state.entropy
  const temp   = temp_base + eta * (temp_max - temp_base)

  const raw = hits.map(hit => {
    const e = new Float32Array(hit.embedding)

    // Gaussian kernel weight from distance
    const d2    = hit.distance * hit.distance
    let w = Math.exp(-d2 / (2 * sigma * sigma))

    // Repulsion from each skip embedding
    for (const skip of state.skips) {
      const ds2 = l2dist(e, skip) ** 2
      w *= Math.exp(gamma / (ds2 + epsilon))
    }

    return w
  })

  // Entropy temperature flattening: w → w^(1/temp)
  // At temp=1 (entropy=0): no change. At temp=4 (entropy=1): very flat.
  const tempered = raw.map(w => Math.pow(Math.max(w, 1e-12), 1 / temp))

  // Normalize
  const total = tempered.reduce((s, w) => s + w, 0)
  if (total < 1e-12) {
    // All weights collapsed — return uniform
    const u = 1 / hits.length
    return hits.map(h => ({ ...h, weight: u }))
  }

  return hits.map((h, i) => ({ ...h, weight: tempered[i] / total }))
}

/**
 * Sample one hit from the weighted candidates.
 * Used to pick the next track to play.
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
 * κ₁(play): update state on a played track.
 *
 * Position:  μ_t = α·e_t + (1-α)·μ_{t-1}
 * Velocity:  v_t = β·v_{t-1} + (1-β)·(e_t - μ_{t-1})
 * Spread:    σ_t = ρ·σ_{t-1} + (1-ρ)·σ_base
 *            (contracts toward baseline — consistent signal = more confident)
 *
 * Prior pull: weak attraction toward mu_prior, decays as 1/t.
 * Handles the window between cold start and first few plays.
 */
export function onPlay(
  state:     KernelState,
  embedding: Vec,
  muPrior:   Vec | null = null,
  params:    KernelParams = {},
): KernelState {
  const {
    alpha      = DEFAULTS.alpha,
    beta       = DEFAULTS.beta,
    sigma_base = DEFAULTS.sigma_base,
    rho        = DEFAULTS.rho,
    prior_k    = DEFAULTS.prior_k,
  } = params

  const e   = embedding
  const mu0 = state.mu
  const v0  = state.v
  const t1  = state.t + 1

  // Position update
  let mu1 = add(scale(e, alpha), scale(mu0, 1 - alpha))

  // Prior pull — decays as 1/t so it matters early, irrelevant later
  if (muPrior !== null && t1 > 0) {
    const pull = prior_k / t1
    mu1 = add(mu1, scale(sub(muPrior, mu1), pull))
  }

  // Velocity update — displacement from old μ to new observation
  const displacement = sub(e, mu0)
  const v1 = add(scale(v0, beta), scale(displacement, 1 - beta))

  // Spread contracts on play (consistent signal = narrowing distribution)
  const sigma1 = rho * state.sigma + (1 - rho) * sigma_base

  return {
    ...state,
    mu:    mu1,
    v:     v1,
    sigma: sigma1,
    t:     t1,
  }
}

/**
 * κ₁(skip): update state on a skipped track.
 *
 * Three operations:
 *
 * 1. Velocity deflection — remove the component of v pointing toward the skip:
 *      ŝ = (e_skip - μ) / ‖e_skip - μ‖
 *      v ← v - (v · ŝ)ŝ
 *    After this, v has no component toward the skip region.
 *
 * 2. Position repulsion — push μ away from the skip:
 *      μ ← μ + γ · (μ - e_skip) / ‖μ - e_skip‖
 *
 * 3. Spread expansion — skip = uncertainty, widen the distribution:
 *      σ ← min(σ · 1.1, σ_base · 2)
 *
 * 4. Append e_skip to the skip buffer (capped at skip_window).
 *    The buffer persists for future reweighting calls.
 */
export function onSkip(
  state:     KernelState,
  embedding: Vec,
  params:    KernelParams = {},
): KernelState {
  const {
    sigma_base  = DEFAULTS.sigma_base,
    gamma_coeff = DEFAULTS.gamma_coeff,
    skip_window = DEFAULTS.skip_window,
  } = params

  const e      = embedding
  const mu     = state.mu
  const v      = state.v
  const sigma  = state.sigma
  const gamma  = gamma_coeff * sigma

  // 1. Velocity deflection (Gram-Schmidt: project out skip direction)
  const skip_dir = sub(e, mu)
  const v1 = norm(skip_dir) < 1e-10
    ? v
    : projectOut(v, skip_dir)

  // 2. Position repulsion
  const away = sub(mu, e)
  const away_norm = norm(away)
  const mu1 = away_norm < 1e-10
    ? mu
    : add(mu, scale(away, gamma / away_norm))

  // 3. Spread expansion (capped at 2× baseline)
  const sigma1 = Math.min(sigma * 1.1, sigma_base * 2)

  // 4. Update skip buffer
  const skips1 = [...state.skips, clone(e)]
  if (skips1.length > skip_window) skips1.shift()

  return {
    ...state,
    mu:    mu1,
    v:     v1,
    sigma: sigma1,
    skips: skips1,
  }
}

/**
 * Reset velocity and spread (but keep position).
 * Useful when the user manually jumps to a very different track —
 * we know where they are but not where they're going.
 */
export function onJump(
  state:  KernelState,
  params: KernelParams = {},
): KernelState {
  const { sigma_base = DEFAULTS.sigma_base } = params
  return {
    ...state,
    v:     zeros(D),
    sigma: sigma_base,
  }
}

/**
 * Full session reset — returns empty kernel.
 */
export function resetKernel(params: KernelParams = {}): KernelState {
  return emptyKernel(params)
}

// ── diagnostics ───────────────────────────────────────────────────────────────

/**
 * Human-readable summary of kernel state.
 * Useful for the agent layer to interpret what's happening.
 */
export function describe(state: KernelState): {
  speed:     number   // ‖v‖ — how fast you're moving through the space
  lookahead: number   // how far ahead the query point is from μ
  spread:    number   // σ — current distribution width
  nSkips:    number   // how many skip embeddings are active
  timestep:  number   // how many plays in this session
} {
  const vn       = norm(state.v)
  const lambda   = DEFAULTS.lambda_max * Math.tanh(vn)

  return {
    speed:     Math.round(vn * 1000) / 1000,
    lookahead: Math.round(lambda * 1000) / 1000,
    spread:    Math.round(state.sigma * 1000) / 1000,
    nSkips:    state.skips.length,
    timestep:  state.t,
  }
}