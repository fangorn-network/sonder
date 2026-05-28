/**
 * KernelDebugHUD.tsx  (v2 — Taste Engine)
 *
 * Replaces the debug-oriented HUD with user-facing taste controls.
 * Drop-in replacement — same portal + Ctrl+K shortcut.
 *
 * New props:
 *   onCuriosityChange  → kernel temperature γ  (higher = more exploration)
 *   onMomentumChange   → EMA decay α           (higher = more reactive)
 *   onReset            → clear session state
 *
 * Usage:
 *   <KernelDebugHUD
 *     state={kernel.state}
 *     onCuriosityChange={kernel.setTemperature}
 *     onMomentumChange={kernel.setAlpha}
 *     onReset={kernel.reset}
 *   />
 */

import { createPortal } from 'react-dom'
import { useState, useEffect, useCallback } from 'react'
import type { KernelState } from '../kernel/types'

// ─── design tokens ────────────────────────────────────────────────────────────

const T = {
  bg:       '#0a0b11',
  bgHover:  '#0f1018',
  border:   'rgba(255,255,255,0.06)',
  borderHi: 'rgba(255,255,255,0.12)',
  text:     'rgba(200,200,224,0.9)',
  textMid:  'rgba(120,120,160,0.8)',
  textLo:   'rgba(58,58,88,0.9)',
  teal:     '#00e5c8',
  magenta:  '#e040fb',
  amber:    '#ffa726',
  blue:     '#4480f0',
  mono:     "'DM Mono', 'Courier New', monospace",
  sans:     "'DM Sans', system-ui, sans-serif",
} as const

// ─── vibe mapping ─────────────────────────────────────────────────────────────

const vibeOf = (entropy: number) =>
  entropy > 0.65
    ? { color: T.magenta, label: 'WANDERING',   desc: 'pushing past familiar territory — discovery mode' }
    : entropy > 0.33
    ? { color: T.amber,   label: 'CALIBRATING', desc: 'finding your sound — kernel is sharpening' }
    : { color: T.blue,    label: 'LOCKED IN',   desc: 'taste model converged — deep in your groove' }

// ─── global slider CSS (injected once) ────────────────────────────────────────

const STYLE_ID = 'sond3r-hud-styles'

function injectStyles() {
  if (document.getElementById(STYLE_ID)) return
  const el = document.createElement('style')
  el.id = STYLE_ID
  el.textContent = `
    .snd-range {
      -webkit-appearance: none;
      appearance: none;
      width: 100%;
      height: 24px;
      background: transparent;
      outline: none;
      cursor: ew-resize;
      display: block;
      margin: 0;
    }
    .snd-range::-webkit-slider-runnable-track {
      height: 2px;
      background: linear-gradient(
        to right,
        var(--fill, #00e5c8) 0%,
        var(--fill, #00e5c8) var(--pct, 50%),
        rgba(255,255,255,0.08) var(--pct, 50%)
      );
    }
    .snd-range::-webkit-slider-thumb {
      -webkit-appearance: none;
      width: 10px;
      height: 10px;
      border-radius: 0;
      background: var(--fill, #00e5c8);
      margin-top: -4px;
      cursor: ew-resize;
    }
    .snd-range::-moz-range-track {
      height: 2px;
      background: rgba(255,255,255,0.08);
      border-radius: 0;
    }
    .snd-range::-moz-range-progress {
      height: 2px;
      background: var(--fill, #00e5c8);
    }
    .snd-range::-moz-range-thumb {
      width: 10px;
      height: 10px;
      border-radius: 0;
      background: var(--fill, #00e5c8);
      border: none;
      cursor: ew-resize;
    }
  `
  document.head.appendChild(el)
}

// ─── Slider ───────────────────────────────────────────────────────────────────

interface SliderProps {
  label:      string
  leftLabel:  string
  rightLabel: string
  value:      number     // 0–1
  color:      string
  onChange:   (v: number) => void
}

function Slider({ label, leftLabel, rightLabel, value, color, onChange }: SliderProps) {
  const pct = `${Math.round(value * 100)}%`
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 2 }}>
        <span style={{ fontFamily: T.mono, fontSize: 9, letterSpacing: '0.1em', color: T.textMid }}>
          {label}
        </span>
        <span style={{ fontFamily: T.mono, fontSize: 10, color, fontWeight: 500 }}>
          {pct}
        </span>
      </div>

      <input
        type="range"
        min={0}
        max={100}
        value={Math.round(value * 100)}
        className="snd-range"
        onChange={e => onChange(parseInt(e.target.value) / 100)}
        style={{ '--fill': color, '--pct': pct } as React.CSSProperties}
      />

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: -2 }}>
        <span style={{ fontFamily: T.sans, fontSize: 9, color: T.textLo }}>{leftLabel}</span>
        <span style={{ fontFamily: T.sans, fontSize: 9, color: T.textLo }}>{rightLabel}</span>
      </div>
    </div>
  )
}

// ─── types ────────────────────────────────────────────────────────────────────

interface Props {
  state:               KernelState
  bottomOffset?:       number
  /** Sets kernel temperature γ. Higher → more exploration / entropy. */
  onCuriosityChange?:  (value: number) => void
  /** Sets EMA decay α. Higher → kernel adapts faster to recent plays. */
  onMomentumChange?:   (value: number) => void
  onReset?:            () => void
}

// ─── component ────────────────────────────────────────────────────────────────

export function KernelDebugHUD({
  state,
  bottomOffset = 0,
  onCuriosityChange,
  onMomentumChange,
  onReset,
}: Props) {
  const [open,      setOpen]      = useState(false)
  const [hovered,   setHovered]   = useState(false)
  const [curiosity, setCuriosity] = useState(state?.entropy ?? 0.5)
  const [momentum,  setMomentum]  = useState(0.4)

  // While panel is closed, keep curiosity display in sync with live kernel entropy.
  // Once the user opens and drags, their intent takes over.
  useEffect(() => {
    if (!open) setCuriosity(state?.entropy ?? 0.5)
  }, [state?.entropy, open])

  useEffect(() => { injectStyles() }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen(v => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const handleCuriosity = useCallback((v: number) => {
    setCuriosity(v)
    onCuriosityChange?.(v)
  }, [onCuriosityChange])

  const handleMomentum = useCallback((v: number) => {
    setMomentum(v)
    onMomentumChange?.(v)
  }, [onMomentumChange])

  const entropy  = state?.entropy ?? curiosity
  const nSkips   = state?.skips?.length ?? 0
  const timestep = state?.t ?? 0
  const vibe     = vibeOf(entropy)
  const segs     = Math.round(entropy * 4)

  const handleResetHover = (on: boolean) => (e: React.MouseEvent<HTMLButtonElement>) => {
    const btn = e.currentTarget
    btn.style.borderColor = on ? T.borderHi : T.border
    btn.style.color       = on ? T.textMid  : T.textLo
  }

  return createPortal(
    <div style={{
      position:      'fixed',
      bottom:        bottomOffset,
      right:         0,
      zIndex:        200,
      width:         380,
      display:       'flex',
      flexDirection: 'column',
    }}>

      {/* ── Panel ─────────────────────────────────────────────────────────── */}
      <div style={{
        overflow:      'hidden',
        maxHeight:     open ? 520 : 0,
        opacity:       open ? 1 : 0,
        transform:     open ? 'translateY(0)' : 'translateY(4px)',
        pointerEvents: open ? 'auto' : 'none',
        transition: [
          'max-height 0.32s cubic-bezier(0.4,0,0.2,1)',
          'opacity 0.2s ease',
          'transform 0.22s ease',
        ].join(', '),
        background:   T.bg,
        border:       `1px solid ${T.border}`,
        borderBottom: 'none',
      }}>

        {/* Header */}
        <div style={{
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'space-between',
          padding:        '12px 16px',
          borderBottom:   `1px solid ${T.border}`,
        }}>
          <div>
            <div style={{ fontFamily: T.mono, fontSize: 10, color: T.text, letterSpacing: '0.05em' }}>
              {timestep} {timestep === 1 ? 'track' : 'tracks'}
              {nSkips > 0 && ` · ${nSkips} passed`}
            </div>
            <div style={{ fontFamily: T.sans, fontSize: 9, color: T.textLo, marginTop: 2 }}>
              this session
            </div>
          </div>

          <div style={{
            display:    'flex',
            alignItems: 'center',
            gap:        6,
            padding:    '4px 10px',
            background: `${vibe.color}18`,
            border:     `1px solid ${vibe.color}44`,
          }}>
            <div style={{ width: 4, height: 4, background: vibe.color, flexShrink: 0 }} />
            <span style={{
              fontFamily:    T.mono,
              fontSize:      9,
              color:         vibe.color,
              letterSpacing: '0.1em',
              fontWeight:    500,
            }}>
              {vibe.label}
            </span>
          </div>
        </div>

        {/* Vibe description */}
        <div style={{
          padding:      '8px 16px',
          fontFamily:   T.sans,
          fontSize:     10,
          color:        T.textMid,
          borderBottom: `1px solid ${T.border}`,
          fontStyle:    'italic',
        }}>
          {vibe.desc}
        </div>

        {/* Controls */}
        <div style={{ padding: '18px 16px', display: 'flex', flexDirection: 'column', gap: 24 }}>
          <Slider
            label="CURIOSITY"
            leftLabel="familiar"
            rightLabel="surprise me"
            value={curiosity}
            color={vibe.color}
            onChange={handleCuriosity}
          />
          <Slider
            label="MOMENTUM"
            leftLabel="gradual"
            rightLabel="reactive"
            value={momentum}
            color={T.teal}
            onChange={handleMomentum}
          />
        </div>

        {/* Reset */}
        <div style={{ padding: '0 16px 16px' }}>
          <button
            onClick={onReset}
            onMouseEnter={handleResetHover(true)}
            onMouseLeave={handleResetHover(false)}
            style={{
              width:         '100%',
              padding:       9,
              background:    'transparent',
              border:        `1px solid ${T.border}`,
              color:         T.textLo,
              fontFamily:    T.mono,
              fontSize:      9,
              letterSpacing: '0.1em',
              cursor:        'pointer',
              transition:    'border-color 0.15s, color 0.15s',
            }}
          >
            RESET TASTE PROFILE
          </button>
        </div>
      </div>

      {/* ── Trigger ───────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button
          onClick={() => setOpen(v => !v)}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          style={{
            display:     'flex',
            alignItems:  'center',
            gap:         8,
            padding:     '8px 10px',
            width:       184,
            background:  hovered ? T.bgHover : T.bg,
            border:      `1px solid ${open || hovered ? T.borderHi : T.border}`,
            borderTop:   open ? 'none' : `1px solid ${open || hovered ? T.borderHi : T.border}`,
            cursor:      'pointer',
            userSelect:  'none',
            transition:  'background 0.15s ease, border-color 0.15s ease',
          }}
        >
          <div style={{ width: 6, height: 6, background: vibe.color, flexShrink: 0 }} />

          <span style={{
            fontFamily:    T.mono,
            fontSize:      9,
            letterSpacing: '0.08em',
            color:         T.textMid,
          }}>
            {vibe.label}
          </span>

          <div style={{ display: 'flex', gap: 2 }}>
            {[0, 1, 2, 3].map(i => (
              <div
                key={i}
                style={{ width: 3, height: 9, background: i < segs ? vibe.color : 'rgba(255,255,255,0.07)' }}
              />
            ))}
          </div>

          <span style={{ flex: 1 }} />

          <span style={{
            color:      T.textLo,
            fontSize:   7,
            display:    'inline-block',
            transition: 'transform 0.2s ease',
            transform:  open ? 'scaleY(-1)' : 'scaleY(1)',
          }}>
            ▲
          </span>
        </button>
      </div>

    </div>,
    document.body,
  )
}

export default KernelDebugHUD