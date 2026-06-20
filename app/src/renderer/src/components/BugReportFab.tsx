/**
 * BugReportFab.tsx
 *
 * "Report a bug" pill — an early-access affordance that owns its own modal
 * state. It's placed in two spots: the splash screen (above the footer line)
 * and the running app (bottom-left, mirroring the kernel HUD's corner anchor).
 * Callers supply the initial anchor via `style`; this component owns the look,
 * the modal, and drag-to-reposition.
 *
 * Drag: press and move past a small threshold to reposition (pinned to the
 * viewport, clamped on-screen); a plain click still opens the modal. Pass
 * `storageKey` to remember the dragged spot across reloads.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { BugReportModal } from './BugReportModal'

const DRAG_THRESHOLD = 4 // px of movement before a press becomes a drag

interface Pos { x: number; y: number }

export function BugReportFab({ style, storageKey }: { style?: React.CSSProperties; storageKey?: string }) {
  const [open, setOpen] = useState(false)
  const [dragging, setDragging] = useState(false)
  const btnRef = useRef<HTMLButtonElement | null>(null)

  const lsKey = storageKey ? `sond3r:bugfab:${storageKey}` : null

  const [pos, setPos] = useState<Pos | null>(() => {
    if (!lsKey) return null
    try {
      const raw = localStorage.getItem(lsKey)
      if (raw) {
        const p = JSON.parse(raw)
        if (typeof p?.x === 'number' && typeof p?.y === 'number') return p
      }
    } catch { /* ignore */ }
    return null
  })

  // Pointer-grab bookkeeping; `moved` flips once we pass the threshold, which
  // both starts repositioning and suppresses the click that would open the modal.
  const grab = useRef<{ startX: number; startY: number; offX: number; offY: number; w: number; h: number; moved: boolean } | null>(null)
  const justDragged = useRef(false)

  const clamp = useCallback((p: Pos, w: number, h: number): Pos => ({
    x: Math.max(0, Math.min(p.x, window.innerWidth - w)),
    y: Math.max(0, Math.min(p.y, window.innerHeight - h)),
  }), [])

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return
    const el = btnRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    grab.current = {
      startX: e.clientX, startY: e.clientY,
      offX: e.clientX - r.left, offY: e.clientY - r.top,
      w: r.width, h: r.height, moved: false,
    }
    el.setPointerCapture(e.pointerId)
  }, [])

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    const g = grab.current
    if (!g) return
    if (!g.moved && Math.hypot(e.clientX - g.startX, e.clientY - g.startY) < DRAG_THRESHOLD) return
    g.moved = true
    justDragged.current = true
    setDragging(true)
    setPos(clamp({ x: e.clientX - g.offX, y: e.clientY - g.offY }, g.w, g.h))
  }, [clamp])

  const onPointerUp = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    const el = btnRef.current
    if (el?.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId)
    grab.current = null
    setDragging(false)
  }, [])

  const onClick = useCallback(() => {
    // Swallow the click that trails a drag; a real click opens the modal.
    if (justDragged.current) { justDragged.current = false; return }
    setOpen(true)
  }, [])

  // Persist the dragged position, and keep it on-screen across window resizes.
  useEffect(() => {
    if (lsKey && pos) {
      try { localStorage.setItem(lsKey, JSON.stringify(pos)) } catch { /* ignore */ }
    }
  }, [lsKey, pos])

  useEffect(() => {
    const onResize = () => {
      const el = btnRef.current
      if (!el) return
      const r = el.getBoundingClientRect()
      setPos((p) => (p ? clamp(p, r.width, r.height) : p))
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [clamp])

  // Once dragged, pin to the viewport (overriding the caller's anchor).
  const dragStyle: React.CSSProperties = pos
    ? { position: 'fixed', left: pos.x, top: pos.y, right: 'auto', bottom: 'auto' }
    : {}

  return (
    <>
      <button
        ref={btnRef}
        className="bug-fab"
        onClick={onClick}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        title="Report a bug — drag to move"
        style={{
          // Default anchor; callers override position via `style`.
          position: 'fixed', left: 0, bottom: 0, zIndex: 200,
          display: 'flex', alignItems: 'center', gap: 7,
          padding: '8px 14px',
          background: 'var(--bg1)',
          border: '1px solid var(--accent)',
          color: 'var(--accent)',
          fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase',
          boxShadow: '0 4px 18px rgba(0,0,0,0.38)',
          WebkitAppRegion: 'no-drag',
          ...style,
          ...dragStyle,
          cursor: dragging ? 'grabbing' : 'grab',
          touchAction: 'none',
        } as React.CSSProperties}
      >
        <svg aria-hidden width="13" height="13" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0, pointerEvents: 'none' }}>
          <path fillRule="evenodd" clipRule="evenodd" d="M8 9V13.017C8 15.2261 9.79086 17.017 12 17.017C14.2091 17.017 16 15.2261 16 13.017V9H8Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M9.25 9C9.25 9.41421 9.58579 9.75 10 9.75C10.4142 9.75 10.75 9.41421 10.75 9H9.25ZM13.25 9C13.25 9.41421 13.5858 9.75 14 9.75C14.4142 9.75 14.75 9.41421 14.75 9H13.25ZM12.75 13.017C12.75 12.6028 12.4142 12.267 12 12.267C11.5858 12.267 11.25 12.6028 11.25 13.017H12.75ZM11.25 17.034C11.25 17.4482 11.5858 17.784 12 17.784C12.4142 17.784 12.75 17.4482 12.75 17.034H11.25ZM5 12.267C4.58579 12.267 4.25 12.6028 4.25 13.017C4.25 13.4312 4.58579 13.767 5 13.767V12.267ZM8 13.767C8.41421 13.767 8.75 13.4312 8.75 13.017C8.75 12.6028 8.41421 12.267 8 12.267V13.767ZM6.53205 6.45839C6.2401 6.16455 5.76523 6.16301 5.47139 6.45495C5.17755 6.7469 5.17601 7.22177 5.46795 7.51561L6.53205 6.45839ZM7.46795 9.52861C7.7599 9.82245 8.23477 9.82399 8.52861 9.53205C8.82245 9.2401 8.82399 8.76523 8.53205 8.47139L7.46795 9.52861ZM9.70345 16.3862C9.99572 16.0927 9.99472 15.6178 9.70121 15.3255C9.40769 15.0333 8.93282 15.0343 8.64055 15.3278L9.70345 16.3862ZM6.51955 17.4578C6.22728 17.7513 6.22828 18.2262 6.52179 18.5185C6.81531 18.8107 7.29018 18.8097 7.58245 18.5162L6.51955 17.4578ZM19 13.767C19.4142 13.767 19.75 13.4312 19.75 13.017C19.75 12.6028 19.4142 12.267 19 12.267V13.767ZM16 12.267C15.5858 12.267 15.25 12.6028 15.25 13.017C15.25 13.4312 15.5858 13.767 16 13.767V12.267ZM18.532 7.51561C18.824 7.22177 18.8224 6.7469 18.5286 6.45495C18.2348 6.16301 17.7599 6.16455 17.468 6.45839L18.532 7.51561ZM15.468 8.47139C15.176 8.76523 15.1776 9.2401 15.4714 9.53205C15.7652 9.82399 16.2401 9.82245 16.532 9.52861L15.468 8.47139ZM15.3595 15.3278C15.0672 15.0343 14.5923 15.0333 14.2988 15.3255C14.0053 15.6178 14.0043 16.0927 14.2965 16.3862L15.3595 15.3278ZM16.4175 18.5162C16.7098 18.8097 17.1847 18.8107 17.4782 18.5185C17.7717 18.2262 17.7727 17.7513 17.4805 17.4578L16.4175 18.5162ZM10.75 9V8H9.25V9H10.75ZM10.75 8C10.75 7.30964 11.3096 6.75 12 6.75V5.25C10.4812 5.25 9.25 6.48122 9.25 8H10.75ZM12 6.75C12.6904 6.75 13.25 7.30964 13.25 8H14.75C14.75 6.48122 13.5188 5.25 12 5.25V6.75ZM13.25 8V9H14.75V8H13.25ZM11.25 13.017V17.034H12.75V13.017H11.25ZM5 13.767H8V12.267H5V13.767ZM5.46795 7.51561L7.46795 9.52861L8.53205 8.47139L6.53205 6.45839L5.46795 7.51561ZM8.64055 15.3278L6.51955 17.4578L7.58245 18.5162L9.70345 16.3862L8.64055 15.3278ZM19 12.267H16V13.767H19V12.267ZM17.468 6.45839L15.468 8.47139L16.532 9.52861L18.532 7.51561L17.468 6.45839ZM14.2965 16.3862L16.4175 18.5162L17.4805 17.4578L15.3595 15.3278L14.2965 16.3862Z" fill="currentColor" />
        </svg>
      </button>

      {open && <BugReportModal onClose={() => setOpen(false)} />}

      <style>{`
        .bug-fab { transition: background 0.16s ease, color 0.16s ease, box-shadow 0.16s ease; }
        .bug-fab:hover { background: var(--accent); color: #fff; }
        .bug-fab:active { box-shadow: 0 6px 22px rgba(0,0,0,0.5); }
      `}</style>
    </>
  )
}
