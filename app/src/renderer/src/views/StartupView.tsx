import { useEffect, useState, useRef, ReactNode } from 'react'

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

// ── Sharp City Background ─────────────────────────────────────────────────────
function CityCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const cv = canvasRef.current
    const container = containerRef.current
    if (!cv || !container) return
    const ctx = cv.getContext('2d', { alpha: false })
    if (!ctx) return

    let W: number, H: number, dpr: number
    let stars: any[] = [], buildings: any[] = [], cars: any[] = []
    const NEONS = [[0, 240, 220], [255, 0, 170], [255, 220, 0], [0, 210, 100], [190, 80, 255]]
    const r = (a: number, b: number) => a + Math.random() * (b - a)

    const initScene = () => {
      dpr = window.devicePixelRatio || 1
      W = container.clientWidth
      H = container.clientHeight
      
      // Sharpness: Scale internal buffer by DPR, scale display by CSS
      cv.width = W * dpr
      cv.height = H * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.imageSmoothingEnabled = false

      stars = Array.from({ length: 80 }, () => ({
        x: Math.floor(r(0, W)),
        y: Math.floor(r(0, H * 0.5)),
        sz: Math.random() < 0.1 ? 2 : 1,
        a: r(0.1, 0.4)
      }))

      buildings = []
      const layers = [
        { minW: 60, maxW: 130, minH: H * 0.3, maxH: H * 0.7, col: '#04060b', ov: -15 },
        { minW: 40, maxW: 90, minH: H * 0.2, maxH: H * 0.5, col: '#060814', ov: -8 },
        { minW: 30, maxW: 70, minH: H * 0.1, maxH: H * 0.3, col: '#080a1c', ov: 5 }
      ]

      layers.forEach((def) => {
        let x = -50
        while (x < W + 50) {
          const w = Math.floor(r(def.minW, def.maxW))
          const h = Math.floor(r(def.minH, def.maxH))
          const y = H - h
          const wins = []
          const cols = Math.max(1, (w - 10) / 8 | 0)
          const rows = Math.max(1, (h - 10) / 10 | 0)
          
          for (let rr = 0; rr < rows; rr++) {
            for (let c = 0; c < cols; c++) {
              if (Math.random() < 0.22) {
                wins.push({
                  x: Math.floor(x + 6 + c * 8),
                  y: Math.floor(y + 6 + rr * 10),
                  n: NEONS[Math.floor(Math.random() * NEONS.length)],
                  a: r(0.5, 1)
                })
              }
            }
          }
          buildings.push({ x, y, w, h, col: def.col, wins, ant: Math.random() < 0.3, antX: Math.floor(x + w * r(0.3, 0.7)), antH: Math.floor(r(8, 20)) })
          x += w + def.ov + (r(2, 8) | 0)
        }
      })

      cars = Array.from({ length: 10 }, (_, i) => ({
        x: r(0, W),
        y: Math.floor(r(H * 0.4, H * 0.7)),
        sp: (Math.random() > 0.5 ? 1 : -1) * r(1, 3),
        n: NEONS[i % NEONS.length]
      }))
    }

    let frameId: number
    const render = (t: number) => {
      ctx.fillStyle = '#020408'
      ctx.fillRect(0, 0, W, H)

      stars.forEach(s => {
        ctx.fillStyle = `rgba(255,255,255,${s.a})`;
        ctx.fillRect(s.x, s.y, s.sz, s.sz)
      })

      buildings.forEach(b => {
        ctx.fillStyle = b.col; ctx.fillRect(b.x, b.y, b.w, b.h)
        b.wins.forEach((w: any) => {
          ctx.fillStyle = `rgba(${w.n[0]},${w.n[1]},${w.n[2]},${w.a})`;
          ctx.fillRect(w.x, w.y, 3, 4)
        })
        if (b.ant) {
          ctx.fillStyle = '#0a0e23'; ctx.fillRect(b.antX, b.y - b.antH, 1, b.antH)
          if ((t / 500 | 0) % 2) { ctx.fillStyle = '#ff1a1a'; ctx.fillRect(b.antX - 1, b.y - b.antH, 2, 2) }
        }
      })

      cars.forEach(c => {
        c.x += c.sp
        if (c.x > W + 20) c.x = -20; if (c.x < -20) c.x = W + 20
        const ix = Math.floor(c.x), iy = Math.floor(c.y)
        ctx.fillStyle = `rgba(${c.n[0]},${c.n[1]},${c.n[2]},0.15)`; ctx.fillRect(c.sp > 0 ? ix - 12 : ix + 15, iy + 2, 12, 1)
        ctx.fillStyle = '#111827'; ctx.fillRect(ix, iy, 15, 4)
        ctx.fillStyle = '#fff'; ctx.fillRect(c.sp > 0 ? ix + 13 : ix, iy + 1, 2, 2)
      })

      ctx.fillStyle = 'rgba(0,0,0,0.1)'
      for (let i = 0; i < H; i += 2) ctx.fillRect(0, i, W, 1)
      frameId = requestAnimationFrame(render)
    }

    initScene()
    frameId = requestAnimationFrame(render)

    const ro = new ResizeObserver(initScene)
    ro.observe(container)

    return () => {
      cancelAnimationFrame(frameId)
      ro.disconnect()
    }
  }, [])

  return (
    <div ref={containerRef} style={{ position: 'absolute', inset: 0, zIndex: 0 }}>
      <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: '100%' }} />
    </div>
  )
}

// ── Main Startup View ──────────────────────────────────────────────────────────
interface StartupViewProps {
  onReady: () => void
  children?: ReactNode
}

export function StartupView({ onReady, children }: StartupViewProps) {
  const [exiting, setExiting] = useState(false)
  const { status, done } = useBootSequence()

  const handleExit = () => {
    if (!done || exiting) return
    setExiting(true)
    setTimeout(onReady, 900)
  }

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      display: 'flex',
      flexDirection: 'column',
      opacity: exiting ? 0 : 1,
      transition: 'opacity 0.9s ease',
      zIndex: 9999,
      background: '#030509',
      color: '#e4e2ec'
    }}>
      <CityCanvas />

      {/* Main UI */}
      <div style={{ position: 'relative', zIndex: 10, flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '18px', userSelect: 'none' }}>
        <div style={{ fontFamily: '"Bebas Neue", sans-serif', fontSize: 'clamp(72px, 14vw, 108px)', letterSpacing: '0.2em', animation: 'sonderPulse 3.5s ease infinite', textAlign: 'center' }}>
          SOND3R
        </div>

        <div style={{ fontFamily: '"DM Mono", monospace', fontSize: '10px', letterSpacing: '0.18em', color: 'rgba(228,226,236,0.3)', textTransform: 'uppercase' }}>
          {status}<span style={{ animation: 'blink 1s step-end infinite' }}>_</span>
        </div>

        <div onClick={handleExit} style={{ marginTop: '4px', opacity: done ? 1 : 0, transform: done ? 'translateY(0)' : 'translateY(8px)', transition: 'all 0.6s ease', pointerEvents: done ? 'auto' : 'none', cursor: 'pointer' }}>
          {children ?? (
            <div style={{ padding: '10px 36px', fontFamily: '"DM Mono", monospace', fontSize: '11px', letterSpacing: '0.16em', color: 'rgba(255,185,80,0.9)', background: 'rgba(255,185,80,0.05)', border: '1px solid rgba(255,185,80,0.2)', borderRadius: '4px' }}>
              ENTER
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div style={{ position: 'relative', zIndex: 10, width: '100%', display: 'flex', justifyContent: 'space-between', padding: '16px 32px', borderTop: '1px solid rgba(255,255,255,0.05)', fontFamily: '"DM Mono", monospace', fontSize: '9px', letterSpacing: '0.1em', color: 'rgba(228,226,236,0.1)' }}>
        <div>BUILT BY FANGORN NETWORK</div>
        <div>v0.1.0</div>
      </div>

      <style>{`
        @keyframes sonderPulse { 0%,100% { opacity: .8; } 50% { opacity: 1; } }
        @keyframes blink { 0%,100% { opacity: 1; } 50% { opacity: 0; } }
      `}</style>
    </div>
  )
}