/**
 * KernelDebugHUD.tsx
 *
 * Fixed bottom-right trigger that expands upward into the kernel visualizer.
 * Self-contained — manages its own open state and Ctrl+K shortcut.
 *
 * Usage in App.tsx (replaces the old showKernelDebug block):
 *   <KernelDebugHUD state={kernel.state} history={sessionHistory} />
 *
 * Remove from App.tsx:
 *   - const [showKernelDebug, setShowKernelDebug] = useState(false)
 *   - the Ctrl+K useEffect
 *   - the sidebar / overlay render block
 */

import { createPortal } from 'react-dom'
import { useState, useEffect } from 'react'
import { KernelVisualizer, type SessionEvent } from './Visualizer'
import type { KernelState } from '../kernel/types'

// ─── tokens (kept minimal — KernelVisualizer owns its own palette) ────────────

const H = {
  bg:          '#07090e',
  bgHover:     '#0c1020',
  border:      '#1a2540',
  borderHi:    '#253560',
  cobalt:      '#4080f8',
  orange:      '#e06830',
  amber:       '#c07830',
  textMid:     '#6878a0',
  textLo:      '#2a3555',
  mono:        "'JetBrains Mono', 'Fira Mono', monospace",
}

// ─── types ────────────────────────────────────────────────────────────────────

interface Props {
  state:        KernelState
  history:      SessionEvent[]
  bottomOffset?: number   // px above bottom of viewport (default: 72 — clears PlayerBar)
}

// ─── component ────────────────────────────────────────────────────────────────

export function KernelDebugHUD({ state, history, bottomOffset = 72 }: Props) {
  const [open, setOpen] = useState(false)
  const [hovered, setHovered] = useState(false)

  // Ctrl+K / Cmd+K toggle
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

  const entropy      = state?.entropy ?? 0.2
  const timestep     = state?.t ?? 0
  const nSkips       = state?.skips?.length ?? 0
  const entropyColor = entropy > 0.65 ? H.orange : entropy > 0.33 ? H.amber : H.cobalt

  return createPortal(
    <div style={{
      position:      'fixed',
      bottom:        bottomOffset,
      right:         16,
      zIndex:        200,
      display:       'flex',
      flexDirection: 'column',
      alignItems:    'stretch',
      width:         440,
    }}>

      {/* ── Panel ─────────────────────────────────────────────────────────── */}
      <div style={{
        overflowY:    'auto',
        maxHeight:    open ? 'calc(100vh - 140px)' : 0,
        opacity:      open ? 1 : 0,
        // slide up from trigger when opening
        transform:    open ? 'translateY(0)' : 'translateY(4px)',
        pointerEvents: open ? 'auto' : 'none',
        transition:   [
          'max-height 0.28s cubic-bezier(0.4,0,0.2,1)',
          'opacity 0.18s ease',
          'transform 0.2s ease',
        ].join(', '),
        // border on three sides — bottom handled by trigger's top border
        borderTop:    `1px solid ${H.border}`,
        borderLeft:   `1px solid ${H.border}`,
        borderRight:  `1px solid ${H.border}`,
        borderBottom: 'none',
        boxShadow:    '0 -8px 40px rgba(0,0,0,0.55)',
      }}>
        <KernelVisualizer state={state} history={history} />
      </div>

      {/* ── Trigger ───────────────────────────────────────────────────────── */}
      <button
        onClick={() => setOpen(v => !v)}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          display:       'flex',
          alignItems:    'center',
          gap:           10,
          padding:       '7px 12px 7px 10px',
          background:    hovered ? H.bgHover : H.bg,
          // full border — forms a seamless bottom cap when panel is open
          border:        `1px solid ${open || hovered ? H.borderHi : H.border}`,
          color:         H.textMid,
          fontFamily:    H.mono,
          fontSize:      10,
          letterSpacing: '0.08em',
          cursor:        'pointer',
          borderRadius:  0,
          width:         '100%',
          textAlign:     'left',
          transition:    'background 0.15s ease, border-color 0.15s ease',
          userSelect:    'none',
        }}
      >
        {/* live entropy indicator — colored square, straight edges */}
        <div style={{
          width:      7,
          height:     7,
          background: entropyColor,
          flexShrink: 0,
          transition: 'background 0.4s ease',
          boxShadow:  `0 0 8px ${entropyColor}66`,
        }} />

        {/* label */}
        <span style={{ color: H.textMid, letterSpacing: '0.12em' }}>KERNEL</span>

        {/* live values */}
        <span style={{ color: entropyColor, transition: 'color 0.4s ease' }}>
          H:{entropy.toFixed(3)}
        </span>

        <span style={{ color: H.textLo }}>t={timestep}</span>

        {nSkips > 0 && (
          <span style={{ color: H.orange, opacity: 0.8 }}>
            {nSkips}sk
          </span>
        )}

        {/* shortcut hint + chevron */}
        <span style={{ flex: 1 }} />
        <span style={{ color: H.textLo, fontSize: 8, letterSpacing: '0.05em' }}>
          ⌘K
        </span>
        <span style={{
          color:      H.textMid,
          fontSize:   8,
          marginLeft: 6,
          transition: 'transform 0.2s ease',
          display:    'inline-block',
          transform:  open ? 'scaleY(-1)' : 'scaleY(1)',
        }}>
          ▲
        </span>
      </button>

    </div>,
    document.body,
  )
}

export default KernelDebugHUD