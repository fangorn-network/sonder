/**
 * KernelStrip.tsx
 *
 * A 48px instrument readout for the session kernel, rendered at the top of both
 * the wiki view and the game view. It reframes values the kernel already
 * computes (momentum vector, drift from centroid, entropy, suppression count);
 * it does not fetch or mutate anything.
 *
 * Surfaces differ in base colour, so the strip carries a `theme`: light for the
 * wiki, dark for the game. Layout and copy are identical across both.
 */

import { useMemo } from 'react'

const MONO = 'var(--font-mono,"Fragment Mono","DM Mono",monospace)'

// Palette anchors: teal (the FAMILIAR readout) and red (the playback bar).
const TEAL = '#207860'
const RED  = '#b83030'

interface Theme {
  bg:     string
  border: string
  label:  string
  value:  string
  line:   string
  hatch:  string
  teal:   string
  red:    string
}

const THEMES: Record<'light' | 'dark', Theme> = {
  light: {
    bg:     '#f0ece5',
    border: 'rgba(0,0,0,0.12)',
    label:  '#a09890',
    value:  '#4a4440',
    line:   'rgba(0,0,0,0.14)',
    hatch:  'rgba(0,0,0,0.22)',
    teal:   TEAL,
    red:    RED,
  },
  dark: {
    bg:     '#0a0b10',
    border: 'rgba(255,255,255,0.08)',
    label:  'rgba(255,255,255,0.32)',
    value:  'rgba(232,238,242,0.9)',
    line:   'rgba(255,255,255,0.10)',
    hatch:  'rgba(255,255,255,0.16)',
    teal:   '#3fae8e',
    red:    RED,
  },
}

const PULSE_CSS = `@keyframes kernelStripPulse {
  0%,100% { opacity: 0.4;  transform: scale(1); }
  50%     { opacity: 1;    transform: scale(1.22); }
}`

export interface KernelStripProps {
  momentum:          number[]
  attractorDistance: number
  entropyScore:      number
  alpha:             number
  gamma:             number
  mutedCount:        number
  sessionLength:     number
  theme?:            'light' | 'dark'
}

// Deterministic 2D projection of the high-dimensional momentum vector: even dims
// fold into x, odd dims into y, normalised to a unit direction. Cosmetic only.
function project2D(v: number[] | undefined): { x: number; y: number; mag: number } {
  if (!v || v.length === 0) return { x: 0, y: 0, mag: 0 }
  let x = 0, y = 0
  for (let i = 0; i < v.length; i++) (i % 2 === 0 ? (x += v[i]) : (y += v[i]))
  const mag = Math.hypot(x, y)
  if (mag < 1e-9) return { x: 0, y: 0, mag: 0 }
  return { x: x / mag, y: y / mag, mag }
}

const LABEL: React.CSSProperties = {
  fontFamily: MONO, fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase',
}

export function KernelStrip({
  momentum,
  attractorDistance,
  entropyScore,
  mutedCount,
  sessionLength,
  theme = 'dark',
}: KernelStripProps) {
  const t = THEMES[theme]

  const dir = useMemo(() => project2D(momentum), [momentum])

  const shell: React.CSSProperties = {
    position: 'sticky', top: 0, zIndex: 50,
    height: 48, flexShrink: 0, boxSizing: 'border-box',
    display: 'flex', alignItems: 'center', gap: 16,
    padding: '0 14px',
    background: t.bg,
    borderBottom: `0.5px solid ${t.border}`,
  }

  const hasData =
    Array.isArray(momentum) &&
    typeof attractorDistance === 'number' && Number.isFinite(attractorDistance) &&
    typeof entropyScore === 'number' && Number.isFinite(entropyScore)

  if (!hasData) {
    return (
      <div style={shell}>
        <span style={{ ...LABEL, color: t.label }}>No kernel data.</span>
      </div>
    )
  }

  // Momentum tail + attractor laid along the projected direction within the
  // visualization box. Travel scales with momentum magnitude (saturated).
  const VIZ_W = 200, VIZ_H = 48, cy = VIZ_H / 2
  const travel = Math.tanh(dir.mag) * 56
  const originX = 18
  const tailX = originX + dir.x * travel * 0.5 + 56
  const attractorX = tailX + 16
  const clampX = (x: number) => Math.max(8, Math.min(VIZ_W - 44, x))

  return (
    <div style={shell}>
      <style>{PULSE_CSS}</style>

      {/* Identity */}
      <span style={{ ...LABEL, color: t.label, flexShrink: 0 }}>Kernel</span>

      {/* Visualization */}
      <div style={{ position: 'relative', width: VIZ_W, height: VIZ_H, flexShrink: 0 }}>
        {/* baseline */}
        <div style={{ position: 'absolute', left: 8, right: 8, top: cy, height: 0.5, background: t.line }} />
        {/* momentum line, origin → tail */}
        <div style={{
          position: 'absolute', left: originX, top: cy,
          width: Math.max(0, clampX(tailX) - originX), height: 0.5,
          background: t.teal, opacity: 0.7,
        }} />
        {/* momentum tail dot */}
        <div style={{
          position: 'absolute', left: clampX(tailX) - 2, top: cy - 2,
          width: 4, height: 4, background: t.teal,
        }} />
        {/* attractor — pulsing dot slightly ahead */}
        <div style={{
          position: 'absolute', left: clampX(attractorX) - 3, top: cy - 3,
          width: 6, height: 6, background: t.teal,
          animation: 'kernelStripPulse 2.6s ease-in-out infinite',
        }} />
        {/* suppression zone — hatched rect + muted count */}
        <div style={{
          position: 'absolute', right: 4, top: cy - 9, width: 36, height: 18,
          border: `0.5px solid ${t.line}`,
          backgroundImage: `repeating-linear-gradient(45deg, ${t.hatch} 0, ${t.hatch} 0.5px, transparent 0.5px, transparent 4px)`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <span style={{ ...LABEL, fontSize: 9, letterSpacing: '0.04em', color: t.value }}>{mutedCount}</span>
        </div>
      </div>

      <span style={{ flex: 1 }} />

      {/* Stats */}
      <Stat label="Spread" value={attractorDistance.toFixed(2)} t={t} />
      <Stat label="Curiosity" value={entropyScore.toFixed(2)} t={t} />
      <Stat label="Plays" value={String(sessionLength)} t={t} />
    </div>
  )
}

function Stat({ label, value, t }: { label: string; value: string; t: Theme }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2, flexShrink: 0 }}>
      <span style={{ ...LABEL, fontSize: 8, color: t.label }}>{label}</span>
      <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 500, color: t.value }}>{value}</span>
    </div>
  )
}

export default KernelStrip
