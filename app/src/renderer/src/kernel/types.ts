import { Vec } from "./Vec"

export interface KernelParams {
  alpha?: number
  beta?: number
  lambda_max?: number
  sigma_base?: number
  rho?: number
  gamma_coeff?: number
  epsilon?: number
  prior_k?: number
  skip_window?: number
  temp_base?: number
  temp_max?: number
  // accumulation rate per play
  alpha_taste?: number
  // per-play decay on all taste weights
  taste_decay?: number
  // penalty subtracted from skipped tags
  skip_taste_pen?: number

  // Artist affinity
  // EMA decay (higher = slower to forget/forgive)
  beta_artist?: number

  // Duration preference
  // EMA toward played duration
  // ±90s preference band (1σ) — tune this to your catalog
  rho_duration?: number
  dur_sigma_ms?: number

  // Reweighting signal weights
  // categorical affinity log-weight scale
  tau_cat?: number
  // artist affinity log-weight scale
  tau_art?: number
  // duration affinity log-weight scale (intentionally weak)
  tau_dur?: number

  // Floors (prevent total suppression of unexplored space)
  cat_floor?: number
  art_floor?: number

}

export type FieldValue = string | number | boolean | null

export interface WeightedHit extends ChromaHit {
  // normalized importance weight
  weight: number
}

export interface TasteWeights {
  genres: Record<string, number>
  moods: Record<string, number>
  themes: Record<string, number>
  contexts: Record<string, number>
}

export interface TrackFeatures {
  embedding: Vec
  artistId: string         // byArtist field, or a canonical contributor ID
  genres: string[]
  moods: string[]
  themes: string[]
  contexts: string[]
  durationMs: number
}

// ChromaHit gains an optional metadata field
export interface ChromaHit {
  id: string
  embedding: number[] | Float32Array
  distance: number
  metadata?: {
    artistId: string
    genres: string[]
    moods: string[]
    themes: string[]
    contexts: string[]
    durationMs: number
  }
}

// KernelState gains three fields
export interface KernelState {
  mu: Vec
  v: Vec
  sigma: number
  skips: Vec[]
  t: number
  entropy: number
  taste: TasteWeights
  artists: Record<string, number>
  durationPref: number | null
}