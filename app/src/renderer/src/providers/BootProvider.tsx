/**
 * BootProvider.tsx
 *
 * Single subscription to the backend boot lifecycle (`window.sond3r`), shared by
 * the splash (StartupView) and the running app (IndexingBar). It has to live
 * above both because the preload bridge keeps only ONE listener per event
 * (`ipcRenderer.removeAllListeners` + `on`), and because warmup keeps streaming
 * after the user enters early — the splash unmounting must not tear the
 * subscription down.
 *
 * First run fetches a ~1.5GB catalog snapshot from IPFS, recovers it into the
 * local Qdrant instance, then warms the search index. The long warmup phase
 * ("building text index") is the point at which we let users into the app while
 * the index finishes building in the background.
 */

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

export type BootStage =
  | 'init' | 'downloading' | 'decompressing' | 'recovering' | 'warming' | 'ready' | 'error'

const STAGE_LABEL: Record<BootStage, string> = {
  init:          'initializing',
  downloading:   'fetching catalog from ipfs',
  decompressing: 'decompressing snapshot',
  recovering:    'loading into vector store',
  warming:       'warming search index',
  ready:         'ready',
  error:         'connection failed',
}

export interface WarmupState { phase: string | null; pct: number | null; indexed: number; total: number }

export interface BootState {
  stage: BootStage
  /** Determinate %, or null when there's no real number to show (indeterminate). */
  pct: number | null
  received: number
  total: number
  error: string | null
  warmup: WarmupState
  /** Backend fully warmed — /ready returned 200, so the first query is fast. */
  ready: boolean
  /** Backend still building its search index; the search UI is gated until done. */
  indexing: boolean
  /** Enough has loaded to let the user in — warmup (the text-index build) has begun. */
  canEnter: boolean
  /** Human-readable label for the current stage / warmup phase. */
  label: string
}

function useBootSequence(): BootState {
  const [stage, setStage] = useState<BootStage>('init')
  const [progress, setProgress] = useState<{ received: number; total: number }>({ received: 0, total: 0 })
  const [warmup, setWarmup] = useState<WarmupState>({ phase: null, pct: null, indexed: 0, total: 0 })
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const s = window.sond3r
    // No bridge (e.g. a plain browser dev session) → nothing to wait on.
    if (!s) { setStage('ready'); return }

    s.onSnapshotProgress((d) => { setStage('downloading'); setProgress(d) })
    s.onSnapshotStatus((status) => {
      if (status === 'downloading' || status === 'decompressing' || status === 'recovering' || status === 'warming') {
        setStage(status as BootStage)
      }
    })
    s.onWarmupProgress((d) => {
      setWarmup(d)
      setStage((cur) => (cur === 'ready' || cur === 'error') ? cur : 'warming')
    })
    s.onBackendReady(() => setStage('ready'))
    s.onBackendError((msg) => { setStage('error'); setError(msg) })

    // Cached fast path: the backend may already be up before our listeners
    // attached. Reconcile once on mount.
    s.isBackendReady()
      .then((ready) => { if (ready) setStage((cur) => (cur === 'init' ? 'ready' : cur)) })
      .catch(() => { })

    return () => s.offBootEvents()
  }, [])

  const { received, total } = progress
  // Determinate % only where it's a real measurement: download bytes, or — during
  // warmup — records scanned in the lexical build. The warmup tail steps report
  // pct=null, so the bar honestly falls back to an indeterminate sweep for them.
  const pct = stage === 'downloading' && total > 0
    ? Math.min(100, Math.round((received / total) * 100))
    : stage === 'warming'
    ? warmup.pct
    : null

  const ready = stage === 'ready'
  const indexing = !ready && stage !== 'error'
  // Let users in once the index build (warmup) has started — they don't need to
  // wait for the embedding model + vector index tail to finish.
  const canEnter = ready || stage === 'error' || stage === 'warming'
  const label = stage === 'warming' && warmup.phase ? warmup.phase : STAGE_LABEL[stage]

  return { stage, pct, received, total, error, warmup, ready, indexing, canEnter, label }
}

const BootContext = createContext<BootState | null>(null)

export function BootProvider({ children }: { children: ReactNode }) {
  const boot = useBootSequence()
  return <BootContext.Provider value={boot}>{children}</BootContext.Provider>
}

export function useBoot(): BootState {
  const ctx = useContext(BootContext)
  if (!ctx) throw new Error('useBoot must be used within <BootProvider>')
  return ctx
}
