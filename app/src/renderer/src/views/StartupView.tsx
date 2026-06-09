import { useEffect, useState, ReactNode } from 'react'

// ── Boot sequence ─────────────────────────────────────────────────────────────
// Driven by the real backend boot lifecycle (main → preload `window.sond3r`):
// first run fetches a ~1.5GB catalog snapshot from IPFS, decompresses it, and
// recovers it into the local Qdrant instance. We surface download progress as a
// determinate bar and the decompress/recover stages as an indeterminate one.

type BootStage = 'init' | 'downloading' | 'decompressing' | 'recovering' | 'ready' | 'error'

const STAGE_LABEL: Record<BootStage, string> = {
  init:         'initializing',
  downloading:  'fetching catalog from ipfs',
  decompressing:'decompressing snapshot',
  recovering:   'loading into vector store',
  ready:        'ready',
  error:        'connection failed',
}

function fmtBytes(n: number): string {
  if (n >= 1e9) return (n / 1e9).toFixed(2) + ' GB'
  if (n >= 1e6) return (n / 1e6).toFixed(1) + ' MB'
  if (n >= 1e3) return (n / 1e3).toFixed(0) + ' KB'
  return `${n} B`
}

interface BootState {
  stage: BootStage
  pct: number | null          // download %, null when total is unknown / not downloading
  received: number
  total: number
  error: string | null
  done: boolean
}

function useBootSequence(): BootState {
  const [stage, setStage] = useState<BootStage>('init')
  const [progress, setProgress] = useState<{ received: number; total: number }>({ received: 0, total: 0 })
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const s = window.sond3r
    // No bridge (e.g. a plain browser dev session) → nothing to wait on.
    if (!s) { setStage('ready'); return }

    s.onSnapshotProgress((d) => { setStage('downloading'); setProgress(d) })
    s.onSnapshotStatus((status) => {
      if (status === 'downloading' || status === 'decompressing' || status === 'recovering') {
        setStage(status as BootStage)
      }
    })
    s.onBackendReady(() => setStage('ready'))
    s.onBackendError((msg) => { setStage('error'); setError(msg) })

    // Cached fast path: the backend may already be up (and `backend:ready` may
    // have fired) before our listeners attached. Reconcile once on mount.
    s.isBackendReady()
      .then((ready) => { if (ready) setStage((cur) => (cur === 'init' ? 'ready' : cur)) })
      .catch(() => { })

    return () => s.offBootEvents()
  }, [])

  const { received, total } = progress
  const pct = stage === 'downloading' && total > 0
    ? Math.min(100, Math.round((received / total) * 100))
    : null

  return { stage, pct, received, total, error, done: stage === 'ready' }
}

// ── Main Startup View ──────────────────────────────────────────────────────────
// Editorial / wiki aesthetic: paper surface, ink type, one brick-red accent,
// sharp corners. The catalog load is shown as a real progress bar rather than a
// spinner — determinate while bytes stream from IPFS, an indeterminate sweep for
// the decompress/recover stages where there's no byte count to report.
interface StartupViewProps {
  onReady: () => void
  children?: ReactNode
}

export function StartupView({ onReady, children }: StartupViewProps) {
  const [exiting, setExiting] = useState(false)
  const { stage, pct, received, total, error, done } = useBootSequence()

  // Let the user through once the catalog is ready, or if the boot failed (so a
  // backend hiccup never hard-locks the splash — the app surfaces its own retry).
  const revealed = done || stage === 'error'

  // The bar shows for the whole boot so there's always a visible indicator
  // (incl. the init gap before the first event). Indeterminate when we have no
  // byte count (init, decompress/recover, or a download with no content-length).
  const showBar = !revealed
  const indeterminate = pct === null

  const handleExit = () => {
    if (!revealed || exiting) return
    setExiting(true)
    setTimeout(onReady, 700)
  }

  const isErr = stage === 'error'

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      display: 'flex',
      flexDirection: 'column',
      opacity: exiting ? 0 : 1,
      transition: 'opacity 0.7s ease',
      zIndex: 9999,
      background: 'var(--bg)',
      color: 'var(--fg)',
    }}>
      {/* Hairline frame for the editorial "page" feel */}
      <div style={{ position: 'absolute', inset: 0, border: '1px solid var(--border2)', pointerEvents: 'none' }} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '34px', userSelect: 'none', padding: '0 32px' }}>

        {/* Wordmark + tagline */}
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(80px, 13vw, 120px)', letterSpacing: '0.18em', lineHeight: 1, color: 'var(--fg)' }}>
            SOND3R
          </div>
          <div style={{ marginTop: '10px', fontFamily: 'var(--font-mono)', fontSize: '10px', letterSpacing: '0.42em', textTransform: 'uppercase', color: 'var(--fg3)' }}>
            a music encyclopedia
          </div>
        </div>

        {/* ── Progress block (fixed footprint so nothing jumps on stage change) ── */}
        <div style={{ width: 'min(480px, 72vw)', minHeight: '54px' }}>
          {!revealed && (
            <>
              {/* Stage label + percent */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '8px', fontFamily: 'var(--font-mono)', fontSize: '11px', letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--fg2)' }}>
                <span>
                  {STAGE_LABEL[stage]}<span style={{ animation: 'sonderBlink 1s step-end infinite' }}>_</span>
                </span>
                <span style={{ color: 'var(--fg3)', fontVariantNumeric: 'tabular-nums' }}>
                  {pct !== null ? `${pct}%` : '— —'}
                </span>
              </div>

              {/* Bar */}
              <div style={{ position: 'relative', height: '5px', background: 'rgba(0,0,0,0.10)', overflow: 'hidden' }}>
                {showBar && (indeterminate ? (
                  <div style={{ position: 'absolute', top: 0, bottom: 0, width: '32%', background: 'var(--accent)', animation: 'sonderBootSlide 1.25s ease-in-out infinite' }} />
                ) : (
                  <div style={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: `${pct}%`, background: 'var(--accent)', transition: 'width 0.25s linear' }} />
                ))}
              </div>

              {/* Byte readout */}
              <div style={{ marginTop: '8px', fontFamily: 'var(--font-mono)', fontSize: '10px', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--fg4)', fontVariantNumeric: 'tabular-nums' }}>
                {stage === 'downloading' && total > 0 ? `${fmtBytes(received)} / ${fmtBytes(total)}` : ' '}
              </div>
            </>
          )}

          {isErr && error && (
            <div style={{ marginTop: '4px', fontFamily: 'var(--font-mono)', fontSize: '11px', letterSpacing: '0.04em', color: 'var(--accent)', textAlign: 'center', lineHeight: 1.6 }}>
              {error}
            </div>
          )}
        </div>

        {/* Enter affordance — flat, sharp, ink. Hover inverts to ink fill. */}
        <div
          onClick={handleExit}
          style={{
            opacity: revealed ? 1 : 0,
            transform: revealed ? 'translateY(0)' : 'translateY(8px)',
            transition: 'opacity 0.5s ease, transform 0.5s ease',
            pointerEvents: revealed ? 'auto' : 'none',
            cursor: 'pointer',
          }}
        >
          {children ?? (
            <button
              className="sonder-enter"
              style={{
                padding: '12px 44px',
                fontFamily: 'var(--font-mono)',
                fontSize: '12px',
                letterSpacing: '0.34em',
                textTransform: 'uppercase',
                color: 'var(--fg)',
                background: 'transparent',
                border: '1px solid var(--fg)',
                cursor: 'pointer',
              }}
            >
              {isErr ? 'continue' : 'enter'}
            </button>
          )}
        </div>
      </div>

      {/* Footer */}
      <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', padding: '16px 32px', borderTop: '1px solid var(--border2)', fontFamily: 'var(--font-mono)', fontSize: '10px', letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--fg3)' }}>
        <div>Built by Fangorn</div>
        <div>v0.1.0</div>
      </div>

      <style>{`
        @keyframes sonderBlink { 0%,100% { opacity: 1; } 50% { opacity: 0; } }
        @keyframes sonderBootSlide { 0% { left: -32%; } 100% { left: 100%; } }
        .sonder-enter { transition: background 0.18s ease, color 0.18s ease; }
        .sonder-enter:hover { background: var(--fg); color: var(--bg); }
      `}</style>
    </div>
  )
}
