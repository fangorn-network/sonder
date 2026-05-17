/**
 * KernelVisualizer.tsx
 *
 * Mission-control diagnostic panel for the SOND3R session kernel.
 *
 * Fonts (add to index.html):
 *   <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500&family=JetBrains+Mono:wght@400;600&display=swap" rel="stylesheet" />
 */

import { useMemo, type CSSProperties, type ReactNode } from 'react'
import type { KernelState } from './types'
import { describe as describeKernel } from './SessionKernel'

// ─── public types ─────────────────────────────────────────────────────────────

export interface SessionEvent {
  type:             'play' | 'skip' | 'jump'
  t:                number
  trackTitle?:      string
  artistId?:        string
  entropySnapshot?: number
}

interface Props {
  state:      KernelState
  history?:   SessionEvent[]
  className?: string
  style?:     CSSProperties
}

// ─── design tokens ────────────────────────────────────────────────────────────

const T = {
  bg:          '#070911',
  bgPanel:     '#0c1020',
  bgPanelAlt:  '#0e1224',
  bgBar:       '#111828',
  border:      '#1a2540',
  borderSoft:  '#212d48',
  cobalt:      '#4080f8',
  cobaltSoft:  '#2255cc',
  cobaltGlow:  'rgba(64,128,248,0.18)',
  orange:      '#e06830',
  orangeSoft:  '#8a3510',
  orangeGlow:  'rgba(224,104,48,0.18)',
  emerald:     '#22bb88',
  textHi:      '#d4ddf5',
  textMid:     '#6878a0',
  textLo:      '#2a3555',
  mono:        "'JetBrains Mono', 'Fira Mono', monospace",
  sans:        "'Inter', system-ui, sans-serif",
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function topN(rec: Record<string, number>, n: number): Array<[string, number]> {
  return Object.entries(rec).sort(([, a], [, b]) => b - a).slice(0, n)
}

function fmtVal(v: number): string {
  if (v < 0.0005) return '0'
  if (v >= 100)   return v.toFixed(0)
  if (v >= 10)    return v.toFixed(1)
  return v.toFixed(3)
}

function fmtMs(ms: number): string {
  const s = Math.round(ms / 1000)
  return `${Math.floor(s / 60)}m ${(s % 60).toString().padStart(2, '0')}s`
}

// ─── arc gauge ────────────────────────────────────────────────────────────────

interface GaugeProps {
  value:  number
  max?:   number
  label:  string
  unit?:  string
  color?: string
}

function Gauge({ value, max = 1, label, unit, color = T.cobalt }: GaugeProps) {
  const pct   = Math.min(Math.max(value / max, 0), 1)
  const R     = 34
  const cx    = 50
  const cy    = 50
  const START = -115
  const SWEEP = 230

  function pt(deg: number, r: number = R): [number, number] {
    const a = (deg * Math.PI) / 180
    return [
      parseFloat((cx + r * Math.sin(a)).toFixed(2)),
      parseFloat((cy - r * Math.cos(a)).toFixed(2)),
    ]
  }

  function arc(from: number, to: number): string {
    const [sx, sy] = pt(from)
    const [ex, ey] = pt(to)
    return `M${sx},${sy} A${R},${R} 0 ${to - from > 180 ? 1 : 0},1 ${ex},${ey}`
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
      <svg viewBox="0 0 100 64" style={{ width: 80, height: 52, overflow: 'visible' }}>
        {/* track */}
        <path d={arc(START, START + SWEEP)} fill="none" stroke={T.border} strokeWidth={4} strokeLinecap="round" />
        {/* fill */}
        {pct > 0.004 && (
          <path
            d={arc(START, START + pct * SWEEP)}
            fill="none" stroke={color} strokeWidth={4} strokeLinecap="round"
            style={{ filter: `drop-shadow(0 0 5px ${color}90)` }}
          />
        )}
        {/* subtle ticks */}
        {[0, 0.5, 1].map((t) => {
          const deg      = START + t * SWEEP
          const [ox, oy] = pt(deg, R + 4)
          const [ix, iy] = pt(deg, R - 4)
          return <line key={t} x1={ix} y1={iy} x2={ox} y2={oy} stroke={T.textLo} strokeWidth={1} />
        })}
        {/* value */}
        <text x={cx} y={cy - 1} textAnchor="middle"
          style={{ fontFamily: T.mono, fontSize: '12px', fontWeight: 600, fill: color }}>
          {fmtVal(value)}
        </text>
        {unit && (
          <text x={cx} y={cy + 10} textAnchor="middle"
            style={{ fontFamily: T.sans, fontSize: '7px', fill: T.textMid, letterSpacing: '0.5px' }}>
            {unit}
          </text>
        )}
      </svg>
      <span style={{ fontFamily: T.sans, fontSize: 9, letterSpacing: '0.5px', color: T.textMid }}>
        {label}
      </span>
    </div>
  )
}

// ─── skip buffer ──────────────────────────────────────────────────────────────

function SkipBuffer({ count, max = 8 }: { count: number; max?: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
      <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', justifyContent: 'center', maxWidth: 70 }}>
        {Array.from({ length: max }, (_, i) => (
          <div key={i} style={{
            width: 8, height: 8, borderRadius: 3,
            background: i < count ? T.orange : T.border,
            boxShadow:  i < count ? `0 0 6px ${T.orange}80` : 'none',
            transition: 'all 0.3s ease',
          }} />
        ))}
      </div>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontFamily: T.mono, fontSize: 13, fontWeight: 600, color: count > 0 ? T.orange : T.textMid }}>
          {count}
        </div>
        <div style={{ fontFamily: T.sans, fontSize: 9, color: T.textMid, marginTop: 1 }}>
          skips
        </div>
      </div>
    </div>
  )
}

// ─── tag bars ─────────────────────────────────────────────────────────────────

function TagBars({ tags, label, color = T.cobalt }: { tags: Array<[string, number]>; label: string; color?: string }) {
  const peak = tags[0]?.[1] ?? 1

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
      <div style={{ fontFamily: T.sans, fontSize: 9, fontWeight: 500, color: T.textMid, letterSpacing: '0.5px', marginBottom: 2 }}>
        {label}
      </div>
      {tags.length === 0 ? (
        <span style={{ fontFamily: T.mono, fontSize: 9, color: T.textLo }}>—</span>
      ) : (
        tags.map(([tag, w]) => (
          <div key={tag} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{
              fontFamily: T.sans, fontSize: 10, color: T.textHi,
              width: 110, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 0,
            }}>
              {tag}
            </span>
            <div style={{ flex: 1, height: 3, background: T.bgBar, borderRadius: 99, position: 'relative', overflow: 'hidden' }}>
              <div style={{
                position: 'absolute', inset: 0,
                right:    `${(1 - w / peak) * 100}%`,
                background: `linear-gradient(90deg, ${color}cc, ${color}66)`,
                borderRadius: 99,
                transition: 'right 0.5s cubic-bezier(0.4,0,0.2,1)',
              }} />
            </div>
            <span style={{ fontFamily: T.mono, fontSize: 8, color: T.textMid, width: 34, textAlign: 'right', flexShrink: 0 }}>
              {w.toFixed(2)}
            </span>
          </div>
        ))
      )}
    </div>
  )
}

// ─── artist affinity ──────────────────────────────────────────────────────────

function ArtistAffinity({ artists }: { artists: Record<string, number> }) {
  const sorted = useMemo(
    () => Object.entries(artists)
      .filter(([k]) => k !== '')          // drop the empty-string fallback
      .sort(([, a], [, b]) => b - a)
      .slice(0, 7),
    [artists],
  )

  if (sorted.length === 0) {
    return <span style={{ fontFamily: T.mono, fontSize: 9, color: T.textLo }}>no plays yet</span>
  }

  const absMax = Math.max(...sorted.map(([, v]) => Math.abs(v)), 0.001)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {sorted.map(([name, aff]) => {
        const neg = aff < 0
        const pct = Math.abs(aff) / absMax
        const col = neg ? T.orange : T.cobalt
        return (
          <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{
              fontFamily: T.sans, fontSize: 10,
              color:      neg ? T.orange : T.textHi,
              width: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 0,
            }}>
              {name}
            </span>
            <div style={{ flex: 1, height: 3, background: T.bgBar, borderRadius: 99, position: 'relative', overflow: 'hidden' }}>
              <div style={{
                position: 'absolute', inset: 0, right: `${(1 - pct) * 100}%`,
                background: `linear-gradient(90deg, ${col}cc, ${col}44)`,
                borderRadius: 99,
                transition: 'right 0.5s cubic-bezier(0.4,0,0.2,1)',
              }} />
            </div>
            <span style={{ fontFamily: T.mono, fontSize: 8, color: neg ? T.orange : T.textMid, width: 38, textAlign: 'right', flexShrink: 0 }}>
              {aff >= 0 ? '+' : ''}{aff.toFixed(2)}
            </span>
          </div>
        )
      })}
    </div>
  )
}

// ─── session pulse ────────────────────────────────────────────────────────────

const EVENT_COLORS: Record<SessionEvent['type'], string> = {
  play: T.cobalt,
  skip: T.orange,
  jump: T.emerald,
}

const EVENT_TYPES = ['play', 'skip', 'jump'] as const

function SessionPulse({ history }: { history: SessionEvent[] }) {
  const recent = history.slice(-48)

  const sparkPath = useMemo(() => {
    const pts = history
      .filter((e) => e.entropySnapshot !== undefined)
      .map((e) => e.entropySnapshot as number)
    if (pts.length < 2) return ''
    const W = 240, H = 28
    const min = Math.min(...pts)
    const max = Math.max(...pts, min + 0.01)
    return pts
      .map((v, i) => {
        const x = (i / (pts.length - 1)) * W
        const y = H - ((v - min) / (max - min)) * H
        return `${x.toFixed(1)},${y.toFixed(1)}`
      })
      .join(' L ')
      .replace(/^/, 'M ')
  }, [history])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* event tiles */}
      <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', minHeight: 16 }}>
        {recent.length === 0 ? (
          <span style={{ fontFamily: T.mono, fontSize: 9, color: T.textLo }}>no events yet</span>
        ) : (
          recent.map((ev, i) => {
            const col = EVENT_COLORS[ev.type]
            return (
              <div key={i}
                title={`${ev.type}${ev.trackTitle ? ` · ${ev.trackTitle}` : ''}`}
                style={{
                  width: 12, height: 12, borderRadius: 3,
                  background: `${col}28`,
                  border:     `1px solid ${col}88`,
                  boxShadow:  `0 0 4px ${col}33`,
                  cursor:     'default',
                }}
              />
            )
          })
        )}
      </div>

      {/* entropy sparkline */}
      {sparkPath !== '' && (
        <svg viewBox="0 0 240 28" style={{ width: '100%', height: 28 }}>
          <defs>
            <linearGradient id="kv-spark" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"   stopColor={T.orange} stopOpacity={0.3} />
              <stop offset="100%" stopColor={T.orange} stopOpacity={0}   />
            </linearGradient>
          </defs>
          <path d={`${sparkPath} V28 L0,28 Z`} fill="url(#kv-spark)" />
          <path d={sparkPath} fill="none" stroke={T.orange} strokeWidth={1.5}
            style={{ filter: `drop-shadow(0 0 3px ${T.orange}88)` }} />
        </svg>
      )}

      {/* legend */}
      <div style={{ display: 'flex', gap: 14 }}>
        {EVENT_TYPES.map((ev) => (
          <div key={ev} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{ width: 8, height: 8, borderRadius: 2, background: EVENT_COLORS[ev] }} />
            <span style={{ fontFamily: T.sans, fontSize: 9, color: T.textMid }}>{ev}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── layout primitives ────────────────────────────────────────────────────────

function Panel({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div style={{
      background:    `linear-gradient(145deg, ${T.bgPanelAlt}, ${T.bgPanel})`,
      border:        `1px solid ${T.border}`,
      borderRadius:  10,
      padding:       '14px 16px',
      display:       'flex',
      flexDirection: 'column',
      gap:           12,
      ...style,
    }}>
      {children}
    </div>
  )
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div style={{
      fontFamily:  T.sans,
      fontSize:    9,
      fontWeight:  500,
      color:       T.textMid,
      letterSpacing: '1px',
      textTransform: 'uppercase',
      display:     'flex',
      alignItems:  'center',
      gap:         8,
    }}>
      <span style={{ flex: 1, height: '1px', background: `linear-gradient(90deg, ${T.border}, transparent)` }} />
      {children}
      <span style={{ flex: 1, height: '1px', background: `linear-gradient(270deg, ${T.border}, transparent)` }} />
    </div>
  )
}

function Stat({ label, value, color = T.textHi }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
      <span style={{ fontFamily: T.sans, fontSize: 10, color: T.textMid }}>{label}</span>
      <span style={{ fontFamily: T.mono, fontSize: 10, color }}>{value}</span>
    </div>
  )
}

// ─── main component ───────────────────────────────────────────────────────────

export function KernelVisualizer({ state, history = [], className, style }: Props) {
  const d = useMemo(() => describeKernel(state), [state])

  const taste = useMemo(() => ({
    genres:   topN(state.taste?.genres   ?? {}, 6),
    moods:    topN(state.taste?.moods    ?? {}, 6),
    themes:   topN(state.taste?.themes   ?? {}, 5),
    contexts: topN(state.taste?.contexts ?? {}, 5),
  }), [state.taste])

  const entropyColor = d.entropy > 0.65 ? T.orange : d.entropy > 0.33 ? '#c07830' : T.cobalt
  const exploreLabel = d.entropy < 0.33 ? 'exploit' : d.entropy < 0.66 ? 'mixed' : 'explore'

  return (
    <div className={className} style={{
      background:    T.bg,
      color:         T.textHi,
      display:       'flex',
      flexDirection: 'column',
      gap:           10,
      padding:       16,
      fontFamily:    T.sans,
      fontSize:      11,
      overflowY:     'auto',
      minHeight:     0,
      ...style,
    }}>

      {/* header */}
      <div style={{
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'space-between',
        paddingBottom:  12,
        borderBottom:   `1px solid ${T.border}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <span style={{
            fontFamily:  T.mono,
            fontSize:    13,
            fontWeight:  600,
            letterSpacing: '3px',
            color:       T.cobalt,
            textShadow:  `0 0 16px ${T.cobalt}60`,
          }}>
            SOND3R
          </span>
          <span style={{ fontFamily: T.sans, fontSize: 10, color: T.textMid }}>
            kernel diagnostics
          </span>
        </div>
        <div style={{ display: 'flex', gap: 16, alignItems: 'baseline' }}>
          <span style={{ fontFamily: T.mono, fontSize: 10, color: T.textMid }}>
            t=<span style={{ color: T.textHi }}>{d.timestep}</span>
          </span>
          <span style={{ fontFamily: T.mono, fontSize: 10, color: T.textMid }}>
            {'\u03c3'}=<span style={{ color: T.textHi }}>{d.spread}</span>
          </span>
          <span style={{
            fontFamily: T.mono, fontSize: 10,
            color:      entropyColor,
            textShadow: d.entropy > 0.65 ? `0 0 8px ${T.orange}` : 'none',
          }}>
            H={d.entropy.toFixed(3)}
          </span>
        </div>
      </div>

      {/* gauges */}
      <Panel>
        <SectionLabel>geometric state</SectionLabel>
        <div style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'flex-end' }}>
          <Gauge value={d.entropy}   max={1}   label="entropy"   unit="H"      color={entropyColor} />
          <Gauge value={d.speed}     max={1}   label="speed"     unit="‖v‖"    color={T.cobalt}     />
          <Gauge value={d.lookahead} max={0.5} label="lookahead" unit="λ"      color={T.cobalt}     />
          <Gauge value={d.spread}    max={0.5} label="spread"    unit="σ"      color={T.cobalt}     />
          <SkipBuffer count={d.nSkips} max={8} />
        </div>
      </Panel>

      {/* taste profile */}
      <Panel>
        <SectionLabel>taste profile</SectionLabel>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px 28px' }}>
          <TagBars tags={taste.genres}   label="Genres"   />
          <TagBars tags={taste.moods}    label="Moods"    />
          <TagBars tags={taste.themes}   label="Themes"   />
          <TagBars tags={taste.contexts} label="Contexts" />
        </div>
      </Panel>

      {/* bottom row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>

        <Panel>
          <SectionLabel>artist affinity</SectionLabel>
          <ArtistAffinity artists={state.artists ?? {}} />
        </Panel>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Panel style={{ flex: 1 }}>
            <SectionLabel>session pulse</SectionLabel>
            <SessionPulse history={history} />
          </Panel>

          <Panel>
            <SectionLabel>preferences</SectionLabel>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <Stat
                label="duration pref"
                value={state.durationPref != null ? fmtMs(state.durationPref) : '—'}
              />
              <Stat
                label="query offset"
                value={`μ + ${d.lookahead.toFixed(3)}·v̂`}
                color={T.cobalt}
              />
              <Stat
                label="mode"
                value={exploreLabel}
                color={entropyColor}
              />
            </div>
          </Panel>
        </div>

      </div>
    </div>
  )
}

export default KernelVisualizer