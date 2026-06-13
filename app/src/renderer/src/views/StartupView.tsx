import { useState, ReactNode } from 'react'
import { useBoot } from '../providers/BootProvider'
import { BugReportFab } from '../components/BugReportFab'

// ── Boot sequence ─────────────────────────────────────────────────────────────
// The backend boot lifecycle now lives in BootProvider (shared with the running
// app's IndexingBar). This view just renders it: first run fetches a ~1.5GB
// catalog snapshot from IPFS, recovers it into Qdrant, then warms the search
// index. Download progress is a determinate bar; decompress/recover are an
// indeterminate sweep.

function fmtBytes(n: number): string {
  if (n >= 1e9) return (n / 1e9).toFixed(2) + ' GB'
  if (n >= 1e6) return (n / 1e6).toFixed(1) + ' MB'
  if (n >= 1e3) return (n / 1e3).toFixed(0) + ' KB'
  return `${n} B`
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
  // `label` reflects the real backend step ("building text index", …); `canEnter`
  // flips on once the index build starts so we can show Enter early.
  const { stage, pct, received, total, error, ready, warmup, canEnter, label } = useBoot()

  // The bar keeps running until the backend is actually ready (or errors) — the
  // loading screen looks the same as before for anyone who waits it out.
  const revealed = ready || stage === 'error'

  // The bar shows for the whole boot so there's always a visible indicator
  // (incl. the init gap before the first event). Indeterminate when we have no
  // byte count (init, decompress/recover, or a download with no content-length).
  const showBar = !revealed
  const indeterminate = pct === null

  // Enter is offered the moment warmup begins (the "building text index" phase),
  // not just at full ready — the user can enter and let the index finish inside
  // the app, where IndexingBar takes over the progress display.
  const handleExit = () => {
    if (!canEnter || exiting) return
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
      // Frameless window: the loading screen has no OS titlebar, so make the
      // whole splash a drag region (the main app's header does the same). The
      // Enter affordance below opts back out with no-drag so it stays clickable.
      WebkitAppRegion: 'drag',
    } as React.CSSProperties}>
      {/* Hairline frame for the editorial "page" feel */}
      <div style={{ position: 'absolute', inset: 0, border: '1px solid var(--border2)', pointerEvents: 'none' }} />

      <div style={{ position: 'relative', flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '34px', userSelect: 'none', padding: '0 32px' }}>

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
                  {label}<span style={{ animation: 'sonderBlink 1s step-end infinite' }}>_</span>
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

              {/* Raw count readout — verifiable units behind the bar: bytes while
                  downloading, records while the lexical index builds. */}
              <div style={{ marginTop: '8px', fontFamily: 'var(--font-mono)', fontSize: '10px', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--fg4)', fontVariantNumeric: 'tabular-nums' }}>
                {stage === 'downloading' && total > 0
                  ? `${fmtBytes(received)} / ${fmtBytes(total)}`
                  : stage === 'warming' && warmup.total > 0
                  ? `${warmup.indexed.toLocaleString()} / ${warmup.total.toLocaleString()} records`
                  :' '}
              </div>

            </>
          )}

          {isErr && error && (
            <div style={{ marginTop: '4px', fontFamily: 'var(--font-mono)', fontSize: '11px', letterSpacing: '0.04em', color: 'var(--accent)', textAlign: 'center', lineHeight: 1.6 }}>
              {error}
            </div>
          )}
        </div>
        
        <div style={{ textAlign: "center", marginTop: '10px', fontFamily: 'var(--font-mono)', fontSize: '9px', letterSpacing: '0.28em', textTransform: 'uppercase', color: 'var(--accent)' }}>
            Early Access Preview
        </div>

        {/* Enter affordance — flat, sharp, ink. Hover inverts to ink fill.
            Revealed at `canEnter` (warmup started), so users can enter while the
            index is still building. */}
        <div
          onClick={handleExit}
          style={{
            opacity: canEnter ? 1 : 0,
            transform: canEnter ? 'translateY(0)' : 'translateY(8px)',
            transition: 'opacity 0.5s ease, transform 0.5s ease',
            pointerEvents: canEnter ? 'auto' : 'none',
            cursor: 'pointer',
            WebkitAppRegion: 'no-drag',
          } as React.CSSProperties}
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

        {/* Bug reporter — bottom-left of the content area, above the footer line
            and aligned with "Built by Fangorn" (32px gutter). */}
        <BugReportFab style={{ position: 'absolute', left: 32, bottom: 16, zIndex: 1 }} />
      </div>

      {/* Footer */}
      <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', padding: '16px 32px', borderTop: '1px solid var(--border2)', fontFamily: 'var(--font-mono)', fontSize: '10px', letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--fg3)' }}>
        <div>Built by Fangorn</div>
        <div>v0.0.1</div>
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
