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

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import type { SnapshotInfo } from '../../../preload/index.d'

export type { SnapshotInfo }

export type BootStage =
  | 'init' | 'needs-download' | 'downloading' | 'decompressing' | 'recovering' | 'warming' | 'indexing' | 'ready' | 'error'

const STAGE_LABEL: Record<BootStage, string> = {
  init:            'initializing',
  'needs-download': 'catalog not downloaded',
  downloading:     'fetching catalog from ipfs',
  decompressing:   'decompressing snapshot',
  recovering:      'loading into vector store',
  warming:         'warming search index',
  indexing:        'building search index',
  ready:           'ready',
  error:           'connection failed',
}

export interface WarmupState { phase: string | null; pct: number | null; indexed: number; total: number }
/** Background Qdrant HNSW build progress streamed after warmup. `pct` is clamped
 *  non-decreasing for display — the raw indexed count wobbles as segments merge. */
export interface IndexState { indexed: number; total: number; pct: number | null }

export interface BootState {
  stage: BootStage
  /** Determinate %, or null when there's no real number to show (indeterminate). */
  pct: number | null
  received: number
  total: number
  error: string | null
  warmup: WarmupState
  /** Background HNSW build progress (post-warmup); drives the indexing bar. */
  index: IndexState
  /** Backend fully warmed AND its vector index built — the first query is fast. */
  ready: boolean
  /** Backend still coming up (download → warmup → HNSW build). */
  indexing: boolean
  /** Query server answers, so search is usable — even if the HNSW build is still
   *  running (it brute-forces unindexed segments meanwhile). Gate search on this. */
  searchable: boolean
  /** Searchable, but Qdrant is still building the vector index in the background —
   *  results are valid but unoptimized. Drives the soft "still optimizing" hint. */
  optimizing: boolean
  /** Opt-in gate: catalog isn't downloaded and the user hasn't chosen to. The
   *  startup disclosure / Settings download prompt key off this. */
  needsDownload: boolean
  /** Sizes + install state behind the download disclosure (null until known). */
  snapshotInfo: SnapshotInfo | null
  /** Enough has loaded to let the user in — warmup (the text-index build) has begun. */
  canEnter: boolean
  /** Human-readable label for the current stage / warmup phase. */
  label: string
}

function useBootSequence(): BootState {
  const [stage, setStage] = useState<BootStage>('init')
  const [progress, setProgress] = useState<{ received: number; total: number }>({ received: 0, total: 0 })
  const [warmup, setWarmup] = useState<WarmupState>({ phase: null, pct: null, indexed: 0, total: 0 })
  const [index, setIndex] = useState<IndexState>({ indexed: 0, total: 0, pct: null })
  const [snapshotInfo, setSnapshotInfo] = useState<SnapshotInfo | null>(null)
  const [error, setError] = useState<string | null>(null)
  // The raw indexed count dips as Qdrant merges segments mid-build; clamp the
  // displayed pct non-decreasing so the bar never visibly runs backwards.
  const maxIndexPct = useRef(0)

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
      setStage((cur) => (cur === 'ready' || cur === 'error' || cur === 'indexing') ? cur : 'warming')
    })
    // Warmup done → query server answers, but Qdrant is still building the HNSW
    // index. Go 'ready' tentatively; the first not-done indexing tick (first run
    // only) drops us into 'indexing'. On a cached relaunch the index is already
    // built, so the only tick says done and we stay 'ready' — no bar flicker.
    s.onBackendReady(() => setStage((cur) => cur === 'error' ? cur : 'ready'))
    s.onIndexingProgress((d) => {
      let pct = d.pct
      if (pct != null) { maxIndexPct.current = Math.max(maxIndexPct.current, pct); pct = maxIndexPct.current }
      setIndex({ indexed: d.indexed, total: d.total, pct })
      setStage((cur) => (cur === 'error') ? cur : d.done ? 'ready' : 'indexing')
    })
    // Opt-in: catalog not installed → the backend hands us the size disclosure
    // and waits. The user downloads from the splash or Settings; a 'downloading'
    // status (or backend:ready) then moves us off this stage.
    s.onNeedsConsent((info) => {
      setSnapshotInfo(info)
      setStage((cur) => (cur === 'error' ? cur : 'needs-download'))
    })
    s.onBackendError((msg) => { setStage('error'); setError(msg) })

    // Cached fast path: the backend may already be up before our listeners
    // attached. Reconcile once on mount.
    s.isBackendReady()
      .then((ready) => { if (ready) setStage((cur) => (cur === 'init' ? 'ready' : cur)) })
      .catch(() => { })

    return () => s.offBootEvents()
  }, [])

  const { received, total } = progress
  // Determinate % only where it's a real measurement: download bytes, warmup
  // records scanned, or the HNSW vectors indexed. Stages with no real number
  // (recover, warmup tail) report null, so the bar falls back to an indeterminate
  // sweep rather than faking a value.
  const pct = stage === 'downloading' && total > 0
    ? Math.min(100, Math.round((received / total) * 100))
    : stage === 'warming'
    ? warmup.pct
    : stage === 'indexing'
    ? (index.pct == null ? null : Math.round(index.pct))
    : null

  const ready = stage === 'ready'
  const needsDownload = stage === 'needs-download'
  // "Loading" stages only — exclude the consent gate (nothing's downloading yet),
  // so the indeterminate bar doesn't stand in for the download prompt.
  const indexing = !ready && stage !== 'error' && stage !== 'needs-download'
  // Search is usable as soon as the query server answers (post-warmup), even
  // while Qdrant keeps building the HNSW index — it just brute-forces unindexed
  // segments meanwhile. So let people search during 'indexing' and surface a soft
  // hint rather than blocking them behind the progress bar.
  const searchable = stage === 'indexing' || stage === 'ready'
  const optimizing = stage === 'indexing'
  // Let users into the app as soon as boot is underway — including during the
  // long IPFS catalog fetch, not just once warmup starts. It's safe: the catalog
  // surfaces (header search, wiki home) self-gate on `searchable` and show the
  // live progress bar until the backend is up, and the default Home tab (local
  // music) needs no catalog at all. Only the pre-boot 'init' instant stays gated,
  // so Enter doesn't flash in before the first real stage has registered.
  const canEnter = stage !== 'init'
  const label = stage === 'warming' && warmup.phase ? warmup.phase : STAGE_LABEL[stage]

  return { stage, pct, received, total, error, warmup, index, ready, indexing, searchable, optimizing, needsDownload, snapshotInfo, canEnter, label }
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
