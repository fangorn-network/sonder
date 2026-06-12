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
const BG1     = '#f0ece5'
const FG2     = '#4a4440'
const FG3     = '#766e66'
const FG4     = '#a09890'
const ACCENT  = '#b83030'
const BORDER2 = 'rgba(0,0,0,0.07)'
const MONO    = 'var(--font-mono,"Fragment Mono","DM Mono",monospace)'

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

export function IndexingBar({ variant = 'home' }: { variant?: 'home' | 'header' }) {
  const { pct, label, warmup } = useBoot()
  const count = warmup.total > 0
    ? `${warmup.indexed.toLocaleString()} / ${warmup.total.toLocaleString()} records`
    : null

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
