/**
 * KernelDebugHUD.tsx
 *
 * Fixed bottom-right trigger that expands upward into the kernel visualizer.
 * Self-contained — manages its own open state and Ctrl+K shortcut.
 *
 * Usage in App.tsx:
 *   <KernelDebugHUD state={kernel.state} history={sessionHistory} />
 */

import { createPortal } from 'react-dom'
import { useState, useEffect } from 'react'
import { KernelVisualizer, type SessionEvent } from './Visualizer'
import type { KernelState } from '../kernel/types'

// ─── tokens ───────────────────────────────────────────────────────────────────

const T = {
  bg:         '#0c0d14',
  bgHover:    '#11121e',
  border:     'rgba(255,255,255,0.07)',
  borderHi:   'rgba(255,255,255,0.13)',
  textMid:    '#9090b0',
  textLo:     '#44445e',
  sans:       "system-ui, -apple-system, 'Segoe UI', sans-serif",
}

// entropy → { color, label }
const entropyMeta = (h: number) =>
  h > 0.65
    ? { color: '#e05840', label: 'exploring' }
    : h > 0.33
    ? { color: '#c49020', label: 'learning'  }
    : { color: '#4880f0', label: 'focused'   }

// ─── tiny bar — 4 segments representing entropy level ─────────────────────────

function EntropyBar({ entropy, color }: { entropy: number; color: string }) {
  const filled = Math.round(entropy * 4)
  return (
    <div style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
      {[0, 1, 2, 3].map(i => (
        <div
          key={i}
          style={{
            width:      4,
            height:     8,
            background: i < filled ? color : 'rgba(255,255,255,0.08)',
            transition: 'background 0.4s ease',
          }}
        />
      ))}
    </div>
  )
}

// ─── types ────────────────────────────────────────────────────────────────────

interface Props {
  state:         KernelState
  history:       SessionEvent[]
  bottomOffset?: number
}

// ─── component ────────────────────────────────────────────────────────────────

export function KernelDebugHUD({ state, history, bottomOffset = 0 }: Props) {
  const [open,    setOpen]    = useState(false)
  const [hovered, setHovered] = useState(false)

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

  const entropy  = state?.entropy ?? 0.2
  const timestep = state?.t       ?? 0
  const nSkips   = state?.skips?.length ?? 0
  const { color, label } = entropyMeta(entropy)

  return createPortal(
    // Outer shell — full panel width so KernelVisualizer fits; trigger is
    // narrower and right-aligned inside.
    <div style={{
      position:      'fixed',
      bottom:        bottomOffset,
      right:         0,
      zIndex:        200,
      width:         440,
      display:       'flex',
      flexDirection: 'column',
      alignItems:    'stretch',
    }}>

      {/* ── Slide-up panel ────────────────────────────────────────────────── */}
      <div style={{
        overflowY:     'auto',
        maxHeight:     open ? 'calc(100vh - 140px)' : 0,
        opacity:       open ? 1 : 0,
        transform:     open ? 'translateY(0)' : 'translateY(6px)',
        pointerEvents: open ? 'auto' : 'none',
        transition: [
          'max-height 0.28s cubic-bezier(0.4,0,0.2,1)',
          'opacity 0.18s ease',
          'transform 0.22s ease',
        ].join(', '),
        background:   T.bg,
        border:       `1px solid ${T.border}`,
        borderBottom: 'none',
        boxShadow:    '0 -8px 48px rgba(0,0,0,0.6)',
      }}>

        {/* Friendly panel header */}
        <div style={{
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'space-between',
          padding:        '10px 14px 9px',
          borderBottom:   `1px solid ${T.border}`,
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{
              fontFamily:    T.sans,
              fontSize:      11,
              fontWeight:    600,
              letterSpacing: '0.04em',
              color:         '#c8c8e0',
            }}>
              Taste Engine
            </span>
            <span style={{
              fontFamily: T.sans,
              fontSize:   10,
              color:      T.textLo,
            }}>
              {timestep} {timestep === 1 ? 'session' : 'sessions'}
              {nSkips > 0 && ` · ${nSkips} ${nSkips === 1 ? 'skip' : 'skips'}`}
            </span>
          </div>

          {/* Live state pill */}
          <div style={{
            display:      'flex',
            alignItems:   'center',
            gap:          6,
            padding:      '3px 8px',
            background:   `${color}18`,
            border:       `1px solid ${color}40`,
          }}>
            <div style={{
              width:      5,
              height:     5,
              borderRadius: '50%',
              background: color,
              boxShadow:  `0 0 6px ${color}`,
            }} />
            <span style={{
              fontFamily:    T.sans,
              fontSize:      10,
              color,
              fontWeight:    500,
              letterSpacing: '0.05em',
            }}>
              {label}
            </span>
          </div>
        </div>

        <KernelVisualizer state={state} history={history} />
      </div>

      {/* ── Trigger — narrow, right-aligned ───────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button
          onClick={() => setOpen(v => !v)}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          style={{
            display:     'flex',
            alignItems:  'center',
            gap:         7,
            padding:     '7px 10px 7px 9px',
            width:       152,
            background:  hovered ? T.bgHover : T.bg,
            border:      `1px solid ${open || hovered ? T.borderHi : T.border}`,
            borderTop:   open ? 'none' : `1px solid ${open || hovered ? T.borderHi : T.border}`,
            cursor:      'pointer',
            userSelect:  'none',
            transition:  'background 0.15s ease, border-color 0.15s ease',
          }}
        >
          {/* Status dot */}
          <div style={{
            width:        6,
            height:       6,
            borderRadius: '50%',
            background:   color,
            flexShrink:   0,
            boxShadow:    `0 0 7px ${color}99`,
            transition:   'background 0.4s ease, box-shadow 0.4s ease',
          }} />

          {/* "taste" wordmark */}
          <span style={{
            fontFamily:    T.sans,
            fontSize:      10,
            fontWeight:    500,
            letterSpacing: '0.06em',
            color:         T.textMid,
          }}>
            taste
          </span>

          {/* Entropy bar */}
          <EntropyBar entropy={entropy} color={color} />

          {/* Spacer + chevron */}
          <span style={{ flex: 1 }} />
          <span style={{
            color:      T.textLo,
            fontSize:   8,
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