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

export type FieldValue = string | number | boolean | null

export interface ChromaHit {
    id: string
    score: number
    distance: number
    embedding: number[]
    document: string
    fields: Record<string, FieldValue>  // parsed from server payload
    // fangorn envelope fields still flat in metadata
    owner?: string
    manifestCid?: string
    trackId?: string
}
export interface WeightedHit extends ChromaHit {
  weight: number        // normalized importance weight
}