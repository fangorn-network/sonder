/**
 * BugReportFab.tsx
 *
 * "Report a bug" pill — an early-access affordance that owns its own modal
 * state. It's placed in two spots: the splash screen (above the footer line)
 * and the running app (bottom-left, mirroring the kernel HUD's corner anchor).
 * Callers supply positioning via `style`; this component owns the look + modal.
 */

import { useState } from 'react'
import { BugReportModal } from './BugReportModal'

export function BugReportFab({ style }: { style?: React.CSSProperties }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        className="bug-fab"
        onClick={() => setOpen(true)}
        title="Report a bug"
        style={{
          // Default anchor; callers override position via `style`.
          position: 'fixed', left: 0, bottom: 0, zIndex: 200,
          display: 'flex', alignItems: 'center', gap: 7,
          padding: '8px 14px',
          background: 'var(--bg1)',
          border: '1px solid var(--accent)',
          color: 'var(--accent)',
          fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase',
          cursor: 'pointer',
          boxShadow: '0 4px 18px rgba(0,0,0,0.38)',
          WebkitAppRegion: 'no-drag',
          ...style,
        } as React.CSSProperties}
      >
        <span aria-hidden style={{ fontSize: 12, lineHeight: 1 }}>⚐</span>
        report a bug
      </button>

      {open && <BugReportModal onClose={() => setOpen(false)} />}

      <style>{`
        .bug-fab { transition: background 0.16s ease, color 0.16s ease, transform 0.16s ease; }
        .bug-fab:hover { background: var(--accent); color: #fff; transform: translateY(-1px); }
      `}</style>
    </>
  )
}
