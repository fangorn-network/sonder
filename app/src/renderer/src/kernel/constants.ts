
// Constants
export const D = 384 // embedding dimension

// Tuned for all-MiniLM-L6-v2 in L2 space.
// MiniLM outputs near-unit vectors so L2 distances live in [0, 2].
export const DEFAULTS = {
    alpha: 0.4,   // position learning rate: how fast μ tracks played embedding
    beta: 0.8,   // velocity EMA coefficient: momentum vs. reactivity
    lambda_max: 0.5,   // max lookahead distance (in L2 units, so ~25% of diameter)
    sigma_base: 0.3,   // baseline spread (~15% of diameter)
    rho: 0.95,  // spread decay toward baseline
    gamma_coeff: 0.1,   // repulsion strength = gamma_coeff * σ
    epsilon: 0.01,  // singularity guard in repulsion denominator
    prior_k: 0.05,  // prior pull strength (decays as 1/t)
    skip_window: 10,    // max skip embeddings to carry
    temp_base: 1.0,   // resampling temperature at entropy=0
    temp_max: 4.0,   // resampling temperature at entropy=1
}