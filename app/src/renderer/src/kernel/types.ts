import { Vec } from "./Vec"

export interface KernelState {
  mu:        Vec       // current position
  v:         Vec       // velocity
  sigma:     number    // spread
  skips:     Vec[]     // recent skip embeddings (capped at skip_window)
  t:         number    // timestep counter (for prior pull decay)
  entropy:   number    // [0,1] — injected from useTasteProfile
}

export interface KernelParams {
  alpha?:       number
  beta?:        number
  lambda_max?:  number
  sigma_base?:  number
  rho?:         number
  gamma_coeff?: number
  epsilon?:     number
  prior_k?:     number
  skip_window?: number
  temp_base?:   number
  temp_max?:    number
}

export interface ChromaHit {
  id:        string
  embedding: number[]   // float[384] from backend
  distance:  number     // L2 distance
  document:  string
  metadata:  Record<string, unknown>
}

export interface WeightedHit extends ChromaHit {
  weight: number        // normalized importance weight
}