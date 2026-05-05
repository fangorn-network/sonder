import { useEffect, useRef, useState, ReactNode } from 'react'

// ── Pure-canvas icosahedron halftone ─────────────────────────────────────────

const PHI = (1 + Math.sqrt(5)) / 2
const RAW_VERTS: [number, number, number][] = [
  [-1,  PHI, 0], [ 1,  PHI, 0], [-1, -PHI, 0], [ 1, -PHI, 0],
  [ 0, -1,  PHI], [ 0,  1,  PHI], [ 0, -1, -PHI], [ 0,  1, -PHI],
  [ PHI, 0, -1], [ PHI, 0,  1], [-PHI, 0, -1], [-PHI, 0,  1],
]
const NORM = Math.sqrt(1 + PHI * PHI)
const VERTS = RAW_VERTS.map(([x, y, z]) => [x / NORM, y / NORM, z / NORM] as [number, number, number])
const FACES: [number, number, number][] = [
  [0,11,5],[0,5,1],[0,1,7],[0,7,10],[0,10,11],
  [1,5,9],[5,11,4],[11,10,2],[10,7,6],[7,1,8],
  [3,9,4],[3,4,2],[3,2,6],[3,6,8],[3,8,9],
  [4,9,5],[2,4,11],[6,2,10],[8,6,7],[9,8,1],
]

function rotateY(v: [number,number,number], a: number): [number,number,number] {
  const c = Math.cos(a), s = Math.sin(a)
  return [c*v[0]+s*v[2], v[1], -s*v[0]+c*v[2]]
}
function rotateX(v: [number,number,number], a: number): [number,number,number] {
  const c = Math.cos(a), s = Math.sin(a)
  return [v[0], c*v[1]-s*v[2], s*v[1]+c*v[2]]
}
function project(v: [number,number,number], fov: number, cx: number, cy: number, scale: number): [number,number,number] {
  const z = v[2] + 3
  const f = fov / z
  return [cx + v[0]*f*scale, cy + v[1]*f*scale, z]
}
function faceNormal(a: [number,number,number], b: [number,number,number], c: [number,number,number]): [number,number,number] {
  const ux = b[0]-a[0], uy = b[1]-a[1], uz = b[2]-a[2]
  const vx = c[0]-a[0], vy = c[1]-a[1], vz = c[2]-a[2]
  const nx = uy*vz-uz*vy, ny = uz*vx-ux*vz, nz = ux*vy-uy*vx
  const len = Math.sqrt(nx*nx+ny*ny+nz*nz) || 1
  return [nx/len, ny/len, nz/len]
}
function dot(a: [number,number,number], b: [number,number,number]) {
  return a[0]*b[0]+a[1]*b[1]+a[2]*b[2]
}

function PolyHalftone({ opacity }: { opacity: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const cnv = canvasRef.current
    if (!cnv) return
    const ctx = cnv.getContext('2d')
    if (!ctx) return

    let raf: number
    const t0 = performance.now()

    function resize() {
      cnv!.width  = cnv!.offsetWidth  * window.devicePixelRatio
      cnv!.height = cnv!.offsetHeight * window.devicePixelRatio
    }
    resize()
    window.addEventListener('resize', resize)

    const buf = document.createElement('canvas')
    const bctx = buf.getContext('2d')!
    const light: [number,number,number] = [0.3, 0.6, 1]
    const llen = Math.sqrt(dot(light, light))
    const ln: [number,number,number] = [light[0]/llen, light[1]/llen, light[2]/llen]

    function frame() {
      const W = cnv!.width, H = cnv!.height
      buf.width = W; buf.height = H

      const t = (performance.now() - t0) / 1000
      const tv = VERTS.map(v => rotateX(rotateY(v, t * 0.22), Math.sin(t * 0.13) * 0.35))
      const cx = W/2, cy = H/2
      const scale = Math.min(W, H) * 0.34

      const pv = tv.map(v => project(v, 2.8, cx, cy, scale))

      const sorted = [...FACES].sort((fa, fb) => {
        const za = (tv[fa[0]][2]+tv[fa[1]][2]+tv[fa[2]][2])/3
        const zb = (tv[fb[0]][2]+tv[fb[1]][2]+tv[fb[2]][2])/3
        return za - zb
      })

      bctx.fillStyle = '#000'
      bctx.fillRect(0, 0, W, H)

      for (const [ai, bi, ci] of sorted) {
        const n = faceNormal(tv[ai], tv[bi], tv[ci])
        if (n[2] < 0) continue
        const bright = 0.15 + Math.max(0, dot(n, ln)) * 0.85
        const nr = n[0]*0.5+0.5, ng = n[1]*0.5+0.5, nb = n[2]*0.5+0.5
        const r = Math.round((nr*0.6+0.2)*bright*220)
        const g = Math.round((ng*0.5+0.35)*bright*230)
        const b = Math.round((nb*0.7+0.15)*bright*255)
        bctx.fillStyle = `rgb(${r},${g},${b})`
        bctx.beginPath()
        bctx.moveTo(pv[ai][0], pv[ai][1])
        bctx.lineTo(pv[bi][0], pv[bi][1])
        bctx.lineTo(pv[ci][0], pv[ci][1])
        bctx.closePath()
        bctx.fill()
        bctx.strokeStyle = 'rgba(255,255,255,0.04)'
        bctx.lineWidth = 0.5
        bctx.stroke()
      }

      const imgData = bctx.getImageData(0, 0, W, H).data
      ctx!.fillStyle = '#000'
      ctx!.fillRect(0, 0, W, H)

      const GRID = Math.max(3, Math.round(Math.min(W, H) / 110))
      const DOT_MAX = GRID * 0.58

      for (let y = GRID/2; y < H; y += GRID) {
        for (let x = GRID/2; x < W; x += GRID) {
          const i = ((y|0) * W + (x|0)) * 4
          const br = Math.max(imgData[i], imgData[i+1], imgData[i+2]) / 255
          if (br < 0.04) continue
          ctx!.fillStyle = `rgba(${imgData[i]},${imgData[i+1]},${imgData[i+2]},${br})`
          ctx!.beginPath()
          ctx!.arc(x, y, br * DOT_MAX, 0, Math.PI*2)
          ctx!.fill()
        }
      }

      raf = requestAnimationFrame(frame)
    }

    raf = requestAnimationFrame(frame)
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize) }
  }, [])

  return (
    <canvas ref={canvasRef} style={{
      position: 'absolute', inset: 0,
      width: '100%', height: '100%',
      opacity, transition: 'opacity 1.2s ease',
    }} />
  )
}

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

  // Called by the slotted button when user clicks connect/enter
  const handleExit = () => {
    if (exiting) return
    setExiting(true)
    setTimeout(onReady, 900)
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: '#000',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      opacity: exiting ? 0 : 1,
      transition: 'opacity 0.9s ease',
      zIndex: 9999, overflow: 'hidden',
    }}>
      <PolyHalftone opacity={exiting ? 0 : 1} />

      <div style={{
        position: 'relative', zIndex: 1,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', gap: '24px',
        userSelect: 'none',
      }}>
        {/* wordmark */}
        <div style={{
          fontFamily: '"Bebas Neue", "Arial Narrow", sans-serif',
          fontSize: 'clamp(48px, 9vw, 88px)',
          letterSpacing: '0.2em', color: '#c7e8b3',
          lineHeight: 1, textShadow: '0 0 48px rgba(199,232,179,0.4)',
          animation: 'sonderPulse 3.5s ease-in-out infinite',
        }}>
          SOND3R
        </div>

        {/* status line */}
        <div style={{
          fontFamily: '"DM Mono", "Courier New", monospace',
          fontSize: '11px', letterSpacing: '0.14em',
          color: 'rgba(199,232,179,0.4)',
          textTransform: 'uppercase', minHeight: '18px',
        }}>
          {status}<span style={{ animation: 'blink 1s step-end infinite' }}>_</span>
        </div>

        {/* button slot — fades in when sequence completes, triggers exit on click */}
        <div
          onClick={handleExit}
          style={{
            opacity: done ? 1 : 0,
            transform: done ? 'translateY(0)' : 'translateY(8px)',
            transition: 'opacity 0.6s ease, transform 0.6s ease',
            pointerEvents: done ? 'auto' : 'none',
            cursor: 'pointer',
          }}
        >
          {children}
        </div>
      </div>

      <style>{`
        @keyframes sonderPulse {
          0%,100% { opacity:.8; text-shadow:0 0 48px rgba(199,232,179,.2); }
          50%      { opacity:1;  text-shadow:0 0 72px rgba(199,232,179,.6); }
        }
        @keyframes blink {
          0%,100% { opacity:1; } 50% { opacity:0; }
        }
      `}</style>
    </div>
  )
}