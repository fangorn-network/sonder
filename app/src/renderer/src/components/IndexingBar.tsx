/**
 * IndexingBar.tsx
 *
 * Shown in place of the search UI while the backend is still building its search
 * index (see BootProvider). Two variants:
 *   - `home`   — prominent block that replaces the home page's search box.
 *   - `header` — compact inline bar that replaces the header search input.
 *
 * Reuses the splash's `sonderBootSlide` / `sonderBlink` keyframes (now global in
 * App.css) so the determinate/indeterminate bar matches the loading screen.
 */

import { useBoot } from '../providers/BootProvider'

// Editorial light tokens — match App.tsx / TrackWikiView.
const BG1     = 'var(--bg1)'
const FG2     = 'var(--fg2)'
const FG3     = 'var(--fg3)'
const FG4     = 'var(--fg4)'
const ACCENT  = 'var(--accent)'
const BORDER2 = 'var(--border2)'
const MONO    = 'var(--font-mono,"Fragment Mono","DM Mono",monospace)'

function fmtBytes(n: number): string {
  if (n >= 1e9) return (n / 1e9).toFixed(2) + ' GB'
  if (n >= 1e6) return (n / 1e6).toFixed(1) + ' MB'
  if (n >= 1e3) return (n / 1e3).toFixed(0) + ' KB'
  return `${n} B`
}

function Bar({ pct, height }: { pct: number | null; height: number }) {
  return (
    <div style={{ position: 'relative', height, background: 'rgba(0,0,0,0.10)', overflow: 'hidden' }}>
      {pct === null ? (
        <div style={{ position: 'absolute', top: 0, bottom: 0, width: '32%', background: ACCENT, animation: 'sonderBootSlide 1.25s ease-in-out infinite' }} />
      ) : (
        <div style={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: `${pct}%`, background: ACCENT, transition: 'width 0.25s linear' }} />
      )}
    </div>
  )
}

export function IndexingBar({ variant = 'home' }: { variant?: 'home' | 'header' | 'banner' }) {
  const { pct, label, warmup, index, stage, received, total } = useBoot()
  // Concrete units behind the bar, per phase: bytes while fetching the catalog,
  // lexical records during warmup, vectors during the HNSW build.
  const count = stage === 'downloading'
    ? (total > 0 ? `${fmtBytes(received)} / ${fmtBytes(total)}` : null)
    : stage === 'indexing'
    ? (index.total > 0 ? `${index.indexed.toLocaleString()} / ${index.total.toLocaleString()} vectors` : null)
    : (warmup.total > 0 ? `${warmup.indexed.toLocaleString()} / ${warmup.total.toLocaleString()} records` : null)

  // Slim, non-blocking strip: sits above live content while search already works
  // but the index is still optimizing. Communicates "results improving" without
  // taking over the view the way the home/header variants do.
  if (variant === 'banner') {
    return (
      <div
        title={count ? `${label} — ${count}` : label}
        style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 14px', background: BG1, borderBottom: `1px solid ${BORDER2}`, flexShrink: 0 }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: ACCENT, flexShrink: 0, animation: 'fangornBootPulse 1.4s ease-in-out infinite' }} />
        <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: FG3, whiteSpace: 'nowrap', flexShrink: 0 }}>
          optimizing search — results improving
        </span>
        <div style={{ flex: 1, minWidth: 40, maxWidth: 220 }}><Bar pct={pct} height={2} /></div>
        <span style={{ fontFamily: MONO, fontSize: 9, color: FG4, fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
          {pct !== null ? `${pct}%` : '——'}
        </span>
      </div>
    )
  }

  if (variant === 'header') {
    return (
      <div
        title={label}
        style={{ display: 'flex', alignItems: 'center', gap: 8, width: 252, flexShrink: 0, WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: FG3, whiteSpace: 'nowrap', flexShrink: 0 }}>
          {label}
        </span>
        <div style={{ flex: 1 }}><Bar pct={pct} height={3} /></div>
        <span style={{ fontFamily: MONO, fontSize: 9, color: FG4, fontVariantNumeric: 'tabular-nums', minWidth: 28, textAlign: 'right', flexShrink: 0 }}>
          {pct !== null ? `${pct}%` : '——'}
        </span>
      </div>
    )
  }

  return (
    <div style={{ marginBottom: 40 }}>
      <div style={{ border: `1px solid ${BORDER2}`, background: BG1, padding: '16px 16px 14px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10, fontFamily: MONO, fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: FG2 }}>
          <span>{label}<span style={{ animation: 'sonderBlink 1s step-end infinite' }}>_</span></span>
          <span style={{ color: FG3, fontVariantNumeric: 'tabular-nums' }}>{pct !== null ? `${pct}%` : '— —'}</span>
        </div>
        <Bar pct={pct} height={5} />
        {count && (
          <div style={{ marginTop: 10, fontFamily: MONO, fontSize: 10, letterSpacing: '0.04em', color: FG4, fontVariantNumeric: 'tabular-nums' }}>
            {count}
          </div>
        )}
      </div>
    </div>
  )
}
