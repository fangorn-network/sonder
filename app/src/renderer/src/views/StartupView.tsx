import { useEffect, useState, ReactNode } from 'react'

// ── Boot sequence ─────────────────────────────────────────────────────────────

const STEPS = ['initializing renderer', 'loading index', 'connecting to network', 'ready']
const DELAYS = [700, 1000, 800]

function useBootSequence() {
  const [step, setStep] = useState(0)
  const done = step >= STEPS.length - 1

  useEffect(() => {
    if (done) return
    const timer = setTimeout(() => setStep(s => s + 1), DELAYS[step] ?? 700)
    return () => clearTimeout(timer)
  }, [step, done])

  return { status: STEPS[Math.min(step, STEPS.length - 1)], done }
}

// ── StartupView ───────────────────────────────────────────────────────────────

interface StartupViewProps {
  onReady: () => void
  children?: ReactNode
}

export function StartupView({ onReady, children }: StartupViewProps) {
  const [exiting, setExiting] = useState(false)
  const { status, done } = useBootSequence()

  const handleExit = () => {
    if (exiting) return
    setExiting(true)
    setTimeout(onReady, 900)
  }

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      opacity: exiting ? 0 : 1,
      transition: 'opacity 0.9s ease',
      zIndex: 9999,
      overflow: 'hidden',
      background: `
        radial-gradient(ellipse 80% 60% at 90% 10%, rgba(167,139,250,0.10) 0%, transparent 60%),
        radial-gradient(ellipse 60% 50% at 10% 90%, rgba(96,165,250,0.07) 0%, transparent 60%),
        #08080a
      `,
    }}>

      {/* centered content */}
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '18px',
        width: '100%',
        userSelect: 'none',
      }}>
        {/* wordmark */}
        <div style={{
          fontFamily: '"Bebas Neue", "Arial Narrow", sans-serif',
          fontSize: 'clamp(72px, 14vw, 108px)',
          letterSpacing: '0.2em',
          color: '#e4e2ec',
          lineHeight: 1,
          textAlign: 'center',
          animation: 'sonderPulse 3.5s ease-in-out infinite',
        }}>
          SOND3R
        </div>

        {/* status line */}
        <div style={{
          fontFamily: '"DM Mono", "Courier New", monospace',
          fontSize: '10px',
          letterSpacing: '0.18em',
          color: 'rgba(228,226,236,0.28)',
          textTransform: 'uppercase',
          textAlign: 'center',
          minHeight: '16px',
        }}>
          {status}<span style={{ animation: 'blink 1s step-end infinite' }}>_</span>
        </div>

        {/* button slot */}
        <div
          onClick={handleExit}
          style={{
            marginTop: '4px',
            opacity: done ? 1 : 0,
            transform: done ? 'translateY(0)' : 'translateY(8px)',
            transition: 'opacity 0.6s ease, transform 0.6s ease',
            pointerEvents: done ? 'auto' : 'none',
            cursor: 'pointer',
          }}
        >
          {children ?? (
            <div style={{
              padding: '9px 32px',
              fontFamily: '"DM Mono", "Courier New", monospace',
              fontSize: '10px',
              fontWeight: 500,
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
              color: 'rgba(167,139,250,0.85)',
              background: 'rgba(167,139,250,0.08)',
              border: '1px solid rgba(167,139,250,0.25)',
              borderRadius: '4px',
            }}>
              Enter
            </div>
          )}
        </div>
      </div>

      {/* footer */}
      <div style={{
        width: '100%',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '14px 28px',
        borderTop: '1px solid rgba(255,255,255,0.05)',
        fontFamily: '"DM Mono", "Courier New", monospace',
      }}>
        <div style={{
          fontSize: '9px',
          letterSpacing: '0.14em',
          color: 'rgba(228,226,236,0.18)',
          textTransform: 'uppercase',
        }}>
          Built by{' '}
          <a
            href="https://fangorn.network"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              color: 'rgba(167,139,250,0.32)',
              textDecoration: 'none',
              borderBottom: '1px solid rgba(167,139,250,0.12)',
            }}
          >
            Fangorn Network
          </a>
        </div>
        <div style={{
          fontSize: '9px',
          letterSpacing: '0.1em',
          color: 'rgba(228,226,236,0.10)',
        }}>
          v0.1.0
        </div>
      </div>

      <style>{`
        @keyframes sonderPulse {
          0%,100% { opacity: .82; }
          50%      { opacity: 1; }
        }
        @keyframes blink {
          0%,100% { opacity: 1; } 50% { opacity: 0; }
        }
      `}</style>
    </div>
  )
}