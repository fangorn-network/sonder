
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
    // Categorical taste
    alpha_taste: 0.15,   // accumulation rate per play
    taste_decay: 0.05,   // per-play decay on all taste weights
    skip_taste_pen: 0.25,  // penalty subtracted from skipped tags

    // Artist affinity
    beta_artist: 0.7,    // EMA decay (higher = slower to forget/forgive)

    // Duration preference
    rho_duration: 0.25,   // EMA toward played duration
    dur_sigma_ms: 90_000, // ±90s preference band (1σ) — tune this to your catalog

    // Reweighting signal weights
    tau_cat: 2.0,    // categorical affinity log-weight scale
    tau_art: 1.5,    // artist affinity log-weight scale
    tau_dur: 0.5,    // duration affinity log-weight scale (intentionally weak)

    // Floors (prevent total suppression of unexplored space)
    cat_floor: 0.05,
    art_floor: 0.10,
}