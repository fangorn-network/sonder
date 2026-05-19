import { useEffect, useRef } from 'react'

export default function CityCanvas() {
  const canvasRef = useRef(null)
  const containerRef = useRef(null)

  useEffect(() => {
    const cv = canvasRef.current
    const container = containerRef.current
    if (!cv || !container) return
    const ctx = cv.getContext('2d', { alpha: false })
    if (!ctx) return

    let W, H, dpr
    let stars = [], buildings = [], cars = []
    let winsByColor = []

    // Vivid cyberpunk neon palette — fully saturated, high-chroma
    const NEONS = [
      [0,   255, 240],   // electric cyan
      [255,  0,  180],   // hot magenta
      [255, 220,   0],   // plasma yellow
      [0,   255,  90],   // acid green
      [210,   0, 255],   // ultraviolet
      [255,  70,   0],   // neon orange
    ]

    const r  = (a, b) => a + Math.random() * (b - a)
    const ri = (a, b) => Math.floor(r(a, b))

    const initScene = () => {
      dpr = window.devicePixelRatio || 1
      W = container.clientWidth
      H = container.clientHeight
      cv.width  = W * dpr
      cv.height = H * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.imageSmoothingEnabled = false

      // Stars — more, slightly brighter
      stars = Array.from({ length: 150 }, () => ({
        x:  ri(0, W),
        y:  ri(0, H * 0.50),
        sz: Math.random() < 0.1 ? 2 : 1,
        a:  r(0.2, 0.75),
      }))

      buildings = []
      winsByColor = Array.from({ length: NEONS.length }, () => [])

      const layers = [
        { minW: 60,  maxW: 140, minH: H * 0.33, maxH: H * 0.72, col: '#020409', ov: -15, winP: 0.30, edgeP: 0.50 },
        { minW: 40,  maxW: 95,  minH: H * 0.20, maxH: H * 0.52, col: '#03050d', ov: -8,  winP: 0.26, edgeP: 0.38 },
        { minW: 28,  maxW: 68,  minH: H * 0.12, maxH: H * 0.30, col: '#050718', ov:  5,  winP: 0.22, edgeP: 0.28 },
      ]

      layers.forEach(def => {
        let x = -60
        while (x < W + 60) {
          const w = ri(def.minW, def.maxW)
          const h = ri(def.minH, def.maxH)
          const y = H - h
          const wins = []
          const cols = Math.max(1, (w - 10) / 8 | 0)
          const rows = Math.max(1, (h - 10) / 10 | 0)

          for (let rr = 0; rr < rows; rr++) {
            for (let c = 0; c < cols; c++) {
              if (Math.random() < def.winP) {
                const ci = ri(0, NEONS.length)
                const win = {
                  x: Math.floor(x + 6 + c * 8),
                  y: Math.floor(y + 6 + rr * 10),
                  ci,
                  a: r(0.6, 1.0),
                }
                wins.push(win)
                winsByColor[ci].push(win)
              }
            }
          }

          // Neon rooftop edge: which neon color (-1 = none)
          const edgeNeon = Math.random() < def.edgeP ? ri(0, NEONS.length) : -1

          buildings.push({
            x: Math.floor(x), y: Math.floor(y), w, h,
            col: def.col,
            wins,
            edgeNeon,
            ant:  Math.random() < 0.28,
            antX: ri(x + w * 0.3, x + w * 0.7),
            antH: ri(8, 24),
          })
          x += w + def.ov + ri(2, 9)
        }
      })

      cars = Array.from({ length: 14 }, (_, i) => ({
        x:  r(0, W),
        y:  ri(H * 0.43, H * 0.74),
        sp: (Math.random() > 0.5 ? 1 : -1) * r(0.7, 2.8),
        ci: i % NEONS.length,
      }))
    }

    let frameId

    const render = (t) => {
      // ── Sky — deep indigo→violet gradient ──────────────────────────────────
      const sky = ctx.createLinearGradient(0, 0, 0, H)
      sky.addColorStop(0,    '#01010f')
      sky.addColorStop(0.42, '#04021a')
      sky.addColorStop(0.70, '#0b0428')
      sky.addColorStop(1,    '#130626')
      ctx.fillStyle = sky
      ctx.fillRect(0, 0, W, H)

      // ── Horizon atmospheric bloom — magenta/cyan haze ─────────────────────
      const hY = H * 0.60
      const hg = ctx.createRadialGradient(W * 0.5, hY, 0, W * 0.5, hY, W * 0.70)
      hg.addColorStop(0,    'rgba(210,0,255,0.11)')
      hg.addColorStop(0.30, 'rgba(255,0,160,0.08)')
      hg.addColorStop(0.60, 'rgba(0,200,255,0.04)')
      hg.addColorStop(1,    'rgba(0,0,0,0)')
      ctx.fillStyle = hg
      ctx.fillRect(0, hY - H * 0.38, W, H)

      // ── Stars ─────────────────────────────────────────────────────────────
      ctx.shadowBlur = 0
      stars.forEach(s => {
        ctx.fillStyle = `rgba(255,255,255,${s.a})`
        ctx.fillRect(s.x, s.y, s.sz, s.sz)
      })

      // ── Building bases ────────────────────────────────────────────────────
      buildings.forEach(b => {
        ctx.shadowBlur = 0
        ctx.fillStyle  = b.col
        ctx.fillRect(b.x, b.y, b.w, b.h)
      })

      // ── Rooftop neon edges ────────────────────────────────────────────────
      buildings.forEach(b => {
        if (b.edgeNeon < 0) return
        const [nr, ng, nb] = NEONS[b.edgeNeon]
        ctx.shadowColor = `rgb(${nr},${ng},${nb})`
        ctx.shadowBlur  = 12
        ctx.fillStyle   = `rgba(${nr},${ng},${nb},0.95)`
        ctx.fillRect(b.x, b.y, b.w, 1)
        // Side edge flare on ~half of them
        if (b.edgeNeon % 2 === 0) {
          ctx.fillRect(b.x, b.y, 1, Math.min(b.h, 40))
        }
        ctx.shadowBlur = 0
      })

      // ── Windows — batched by neon color (one shadow-state per color) ──────
      NEONS.forEach(([nr, ng, nb], ci) => {
        const wins = winsByColor[ci]
        if (!wins.length) return
        ctx.shadowColor = `rgba(${nr},${ng},${nb},0.90)`
        ctx.shadowBlur  = 8
        wins.forEach(w => {
          ctx.fillStyle = `rgba(${nr},${ng},${nb},${w.a})`
          ctx.fillRect(w.x, w.y, 3, 4)
        })
      })
      ctx.shadowBlur = 0

      // ── Antennas ──────────────────────────────────────────────────────────
      buildings.forEach(b => {
        if (!b.ant) return
        ctx.fillStyle = '#0a0d20'
        ctx.fillRect(b.antX, b.y - b.antH, 1, b.antH)
        if ((t / 550 | 0) % 2) {
          ctx.shadowColor = 'rgba(255,30,30,0.95)'
          ctx.shadowBlur  = 12
          ctx.fillStyle   = '#ff1a1a'
          ctx.fillRect(b.antX - 1, b.y - b.antH, 2, 2)
          ctx.shadowBlur  = 0
        }
      })

      // ── Wet street / ground ───────────────────────────────────────────────
      const gY = Math.floor(H * 0.74)
      const grd = ctx.createLinearGradient(0, gY, 0, H)
      grd.addColorStop(0, '#040610')
      grd.addColorStop(1, '#02030a')
      ctx.fillStyle = grd
      ctx.fillRect(0, gY, W, H - gY)

      // Neon puddle reflections — static blobs at fixed proportional positions
      const puddles = [
        { px: 0.12, ci: 1, rad: 70 },
        { px: 0.38, ci: 0, rad: 90 },
        { px: 0.62, ci: 4, rad: 60 },
        { px: 0.85, ci: 2, rad: 75 },
      ]
      puddles.forEach(({ px, ci, rad }) => {
        const [nr, ng, nb] = NEONS[ci]
        const pg = ctx.createRadialGradient(W * px, gY + 5, 0, W * px, gY + 5, rad)
        pg.addColorStop(0, `rgba(${nr},${ng},${nb},0.14)`)
        pg.addColorStop(1, 'rgba(0,0,0,0)')
        ctx.fillStyle = pg
        ctx.fillRect(W * px - rad, gY, rad * 2, 22)
      })

      // ── Cars with glow trails ─────────────────────────────────────────────
      cars.forEach(c => {
        c.x += c.sp
        if (c.x > W + 25) c.x = -25
        if (c.x < -25)    c.x = W + 25
        const ix = Math.floor(c.x)
        const iy = Math.floor(c.y)
        const [nr, ng, nb] = NEONS[c.ci]
        const dir = c.sp > 0

        // Gradient trail
        const tx = dir ? ix - 28 : ix + 15
        const tg = ctx.createLinearGradient(tx, 0, tx + (dir ? 28 : -28), 0)
        tg.addColorStop(0, `rgba(${nr},${ng},${nb},0)`)
        tg.addColorStop(1, `rgba(${nr},${ng},${nb},0.35)`)
        ctx.fillStyle = tg
        ctx.fillRect(tx, iy + 1, 28, 2)

        // Car body
        ctx.shadowColor = `rgba(${nr},${ng},${nb},0.55)`
        ctx.shadowBlur  = 6
        ctx.fillStyle   = '#0d1220'
        ctx.fillRect(ix, iy, 15, 4)

        // Headlight bloom
        ctx.fillStyle   = '#e8f0ff'
        ctx.shadowColor = '#aaddff'
        ctx.shadowBlur  = 12
        ctx.fillRect(dir ? ix + 13 : ix, iy + 1, 2, 2)
        ctx.shadowBlur  = 0

        // Street reflection smear below car
        ctx.fillStyle = `rgba(${nr},${ng},${nb},0.08)`
        ctx.fillRect(ix, iy + 5, 15, 4)
      })

      // ── Scanlines ─────────────────────────────────────────────────────────
      ctx.shadowBlur  = 0
      ctx.fillStyle   = 'rgba(0,0,0,0.07)'
      for (let i = 0; i < H; i += 3) ctx.fillRect(0, i, W, 1)

      // ── Vignette ──────────────────────────────────────────────────────────
      const vig = ctx.createRadialGradient(W * 0.5, H * 0.5, H * 0.22, W * 0.5, H * 0.5, H * 0.88)
      vig.addColorStop(0, 'rgba(0,0,0,0)')
      vig.addColorStop(1, 'rgba(0,0,0,0.55)')
      ctx.fillStyle = vig
      ctx.fillRect(0, 0, W, H)

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
      <canvas
        ref={canvasRef}
        style={{ display: 'block', width: '100%', height: '100%' }}
      />
    </div>
  )
}