import { useEffect, useRef } from 'react'

export default function CityCanvas() {
  const canvasRef = useRef(null)
  const containerRef = useRef(null)
  
  // Keep clean mutable tracking refs for performance inside loop (avoiding re-renders)
  const mouseRef = useRef({ x: -1000, y: -1000, targetBuilding: null })
  const clickDischargeRef = useRef(null)

  useEffect(() => {
    const cv = canvasRef.current
    const container = containerRef.current
    if (!cv || !container) return
    const ctx = cv.getContext('2d', { alpha: false })
    if (!ctx) return

    let W, H, dpr
    let buildings = [], traffic = [], stars = []

    const NEONS = [
      { rgb: '0, 255, 240', hex: '#00fff0' },  // Cyan
      { rgb: '255, 0, 150', hex: '#ff0096' },  // Magenta
      { rgb: '0, 255, 100', hex: '#00ff64' },  // Acid Green
      { rgb: '255, 210, 0', hex: '#ffd200' },  // Amber/Yellow
      { rgb: '160, 0, 255', hex: '#a000ff' }   // Violet
    ]

    const r = (a, b) => a + Math.random() * (b - a)
    const ri = (a, b) => Math.floor(r(a, b))

    const initScene = () => {
      dpr = window.devicePixelRatio || 1
      W = container.clientWidth
      H = container.clientHeight
      cv.width = W * dpr
      cv.height = H * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.imageSmoothingEnabled = false

      // 1. Distant Sharp Starfield (Your Tweak Preserved)
      stars = Array.from({ length: 60 }, () => ({
        x: r(0, W),
        y: r(0, H * 0.4),
        sz: Math.random() > 0.9 ? 1.5 : 1,
        a: r(0.1, 0.5)
      }))

      // 2. Structural Layered Architecture
      buildings = []
      const layerDefs = [
        { depth: 0, col: '#020207', winSize: 2, space: 5,  minW: 60,  maxW: 100, minH: 0.25, maxH: 0.55 },
        { depth: 1, col: '#050612', winSize: 2, space: 6,  minW: 80,  maxW: 150, minH: 0.40, maxH: 0.70 },
        { depth: 2, col: '#0a0c20', winSize: 3, space: 8,  minW: 140, maxW: 240, minH: 0.55, maxH: 0.88 }
      ]

      layerDefs.forEach(layer => {
        let x = -80
        while (x < W + 200) {
          const w = ri(layer.minW, layer.maxW)
          const h = ri(H * layer.minH, H * layer.maxH)
          const y = H - h

          const neonColor = NEONS[ri(0, NEONS.length)]
          const standardWindows = []
          const specialRooms = []

          if (layer.depth >= 1) {
            const numSpecialRooms = layer.depth === 2 ? ri(1, 3) : ri(0, 2)
            for (let i = 0; i < numSpecialRooms; i++) {
              specialRooms.push({
                x: ri(15, w - 55),
                y: ri(30, h - 60),
                w: ri(40, 50),
                h: ri(22, 26),
                theme: ri(0, 3), 
                lightOn: Math.random() > 0.1,
                people: Array.from({ length: ri(1, 3) }, () => ({
                  relX: r(8, 32),
                  state: Math.random() > 0.5 ? 'idle' : 'active',
                  seed: r(0, 100)
                }))
              })
            }
          }

          const colWidth = layer.winSize + layer.space
          const rowHeight = layer.winSize + layer.space + 3
          const cols = Math.floor((w - 20) / colWidth)
          const rows = Math.floor((h - 30) / rowHeight)

          if (cols > 0 && rows > 0) {
            for (let rG = 0; rG < rows; rG++) {
              if (Math.random() > 0.4) continue 
              for (let cG = 0; cG < cols; cG++) {
                if (Math.random() < 0.28) {
                  standardWindows.push({
                    x: Math.floor(10 + cG * colWidth),
                    y: Math.floor(20 + rG * rowHeight),
                    a: r(0.3, 0.95)
                  })
                }
              }
            }
          }

          buildings.push({
            id: `BLDG-${ri(1000, 9999)}`,
            x, y, w, h,
            depth: layer.depth,
            col: layer.col,
            standardWindows,
            specialRooms,
            neonColor,
            hasAntenna: Math.random() > 0.7 && layer.depth === 2,
            antennaX: ri(w * 0.4, w * 0.6),
            antennaH: ri(20, 40),
            glitchTimer: 0
          })

          x += w - ri(10, 30)
        }
      })

      // 3. Slower, Detailed Flying Cruisers
      const groundY = H * 0.92
      traffic = Array.from({ length: 9 }, (_, i) => ({
        x: r(0, W),
        y: r(H * 0.3, groundY - 40),
        w: r(20, 32),
        h: 5,
        sp: (i % 2 === 0 ? 1 : -1) * r(0.4, 0.9), 
        bobSpeed: r(0.001, 0.003),
        bobOffset: r(0, Math.PI * 2),
        color: NEONS[ri(0, NEONS.length)]
      }))
    }

    // ── FIXED EVENT LISTENERS (Listening on Window rather than the hidden layout container) ──
    const handleMouseMove = (e) => {
      const rect = cv.getBoundingClientRect()
      const mx = e.clientX - rect.left
      const my = e.clientY - rect.top

      // Bounds validation check
      if (mx < 0 || mx > W || my < 0 || my > H) {
        mouseRef.current.x = -1000
        mouseRef.current.y = -1000
        mouseRef.current.targetBuilding = null
        return
      }

      mouseRef.current.x = mx
      mouseRef.current.y = my

      let hit = null
      for (let i = buildings.length - 1; i >= 0; i--) {
        const b = buildings[i]
        if (mx >= b.x && mx <= b.x + b.w && my >= b.y && my <= b.y + b.h) {
          hit = b
          break
        }
      }
      mouseRef.current.targetBuilding = hit
    }

    const handleMouseLeave = () => {
      mouseRef.current.x = -1000
      mouseRef.current.y = -1000
      mouseRef.current.targetBuilding = null
    }

    const handleMouseClick = (e) => {
      const rect = cv.getBoundingClientRect()
      const mx = e.clientX - rect.left
      const my = e.clientY - rect.top

      if (mx < 0 || mx > W || my < 0 || my > H) return

      let hit = null
      for (let i = buildings.length - 1; i >= 0; i--) {
        const b = buildings[i]
        if (mx >= b.x && mx <= b.x + b.w && my >= b.y && my <= b.y + b.h) {
          hit = b
          break
        }
      }

      if (hit) {
        hit.glitchTimer = 25 
        clickDischargeRef.current = {
          startX: mx,
          startY: 0,
          endX: hit.x + (hit.w / 2),
          endY: hit.y,
          life: 12
        }
      }
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseout', handleMouseLeave)
    window.addEventListener('click', handleMouseClick)

    let frameId

    const render = (t) => {
      // ── Custom Preserved Backdrop Dark Base ────────────────────────────────
      ctx.globalCompositeOperation = 'source-over'
      ctx.fillStyle = '#292942'
      ctx.fillRect(0, 0, W, H)

      // Stars (Preserved customized deep glow amplification scaling multiplier)
      stars.forEach(s => {
        ctx.fillStyle = `rgba(255, 255, 255, ${s.a * 40})`
        ctx.fillRect(s.x, s.y, s.sz, s.sz)
      })

      // ── Render Buildings & Interior Life ───────────────────────────────────
      buildings.forEach(b => {
        ctx.globalCompositeOperation = 'source-over'
        
        if (b.glitchTimer > 0) {
          b.glitchTimer--
          ctx.fillStyle = b.glitchTimer % 2 === 0 ? '#1b1b3a' : b.col
        } else {
          ctx.fillStyle = b.col
        }
        ctx.fillRect(b.x, b.y, b.w, b.h)

        if (b.hasAntenna) {
          ctx.strokeStyle = b.col
          ctx.lineWidth = 2
          ctx.beginPath()
          ctx.moveTo(b.x + b.antennaX, b.y)
          ctx.lineTo(b.x + b.antennaX, b.y - b.antennaH)
          ctx.stroke()
          if ((t / 500 | 0) % 2) {
            ctx.fillStyle = '#ff2b55'
            ctx.fillRect(b.x + b.antennaX - 1, b.y - b.antennaH, 3, 3)
          }
        }

        // Draw standard windows
        ctx.fillStyle = b.glitchTimer > 0 && Math.random() > 0.4 ? '#ffffff' : b.neonColor.hex
        b.standardWindows.forEach(w => {
          const isOverlapped = b.specialRooms.some(r => 
            w.x >= r.x && w.x <= r.x + r.w && w.y >= r.y && w.y <= r.y + r.h
          )
          if (!isOverlapped) {
            ctx.fillRect(b.x + w.x, b.y + w.y, b.depth === 2 ? 3 : 2, b.depth === 2 ? 4 : 3)
          }
        })

        // Draw Special Detailed Rooms
        b.specialRooms.forEach(room => {
          if (!room.lightOn) return

          const rx = b.x + room.x
          const ry = b.y + room.y

          if (b.glitchTimer > 0 && Math.random() > 0.5) {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.95)'
          } else {
            if (room.theme === 0) ctx.fillStyle = 'rgba(0, 191, 255, 0.95)'
            else if (room.theme === 1) ctx.fillStyle = 'rgba(163, 0, 109, 0.95)'
            else ctx.fillStyle = 'rgba(156, 138, 0, 0.95)'
          }

          ctx.fillRect(rx, ry, room.w, room.h)
          ctx.strokeStyle = '#020205'
          ctx.lineWidth = 1
          ctx.strokeRect(rx, ry, room.w, room.h)

          room.people.forEach(p => {
            const wave = Math.sin(t * 0.002 + p.seed)
            let px = rx + p.relX
            let py = ry + room.h - 10

            if (p.state === 'active') px += wave * 1.5

            ctx.fillStyle = '#020206'
            ctx.fillRect(px, py, 4, 7)
            ctx.fillRect(px + 1, py - 3, 2, 2.5)

            if (room.theme === 0) {
              ctx.fillStyle = '#00ffc4'
              ctx.fillRect(px - 4, py + 2, 3, 1.5)
              if (wave > 0.2) {
                ctx.fillStyle = 'rgba(0, 255, 196, 0.4)'
                ctx.fillRect(px - 6, py - 4, 1, 4)
              }
            } else if (room.theme === 1) {
              ctx.fillStyle = '#ff007b'
              ctx.fillRect(rx + 4, ry + room.h - 4, room.w - 8, 1.5)
              ctx.fillStyle = '#ffcc00'
              ctx.fillRect(px + (wave > 0 ? 3 : -2), py + 2, 1.5, 1.5)
            }
          })
        })

        // Edge laser trim highlight accents
        if (b.depth === 2 && Math.sin(b.x + t * 0.0005) > 0.3) {
          ctx.globalCompositeOperation = 'screen'
          ctx.strokeStyle = b.neonColor.hex
          ctx.lineWidth = 1
          ctx.beginPath()
          ctx.moveTo(b.x, b.y)
          ctx.lineTo(b.x + b.w, b.y)
          ctx.stroke()
          ctx.globalCompositeOperation = 'source-over'
        }
      })

      // ── Ground Street ──────────────────────────────────────────────────────
      const groundY = Math.floor(H * 0.92)
      ctx.fillStyle = '#020205'
      ctx.fillRect(0, groundY, W, H - groundY)
      ctx.fillStyle = '#080a14'
      ctx.fillRect(0, groundY, W, 2)

      // ── Render Flying Traffic (Smooth Gliders) ─────────────────────────────
      ctx.globalCompositeOperation = 'screen'
      traffic.forEach(c => {
        c.x += c.sp
        if (c.x > W + 60) c.x = -60
        if (c.x < -60) c.x = W + 60

        const bobY = Math.sin(t * c.bobSpeed + c.bobOffset) * 6
        const cx = Math.floor(c.x)
        const cy = Math.floor(c.y + bobY)

        ctx.fillStyle = c.color.hex
        ctx.fillRect(cx, cy, c.w, c.h)

        ctx.fillStyle = '#000000'
        ctx.fillRect(cx + (c.sp > 0 ? c.w - 10 : 4), cy + 1, 6, 2)

        const trailX = c.sp > 0 ? cx - 25 : cx + c.w
        const tg = ctx.createLinearGradient(trailX, 0, trailX + 25, 0)
        tg.addColorStop(c.sp > 0 ? 0 : 1, 'rgba(0,0,0,0)')
        tg.addColorStop(c.sp > 0 ? 1 : 0, `rgba(${c.color.rgb}, 0.5)`)
        ctx.fillStyle = tg
        ctx.fillRect(trailX, cy + 2, 25, 1.5)

        ctx.fillStyle = c.sp > 0 ? '#ffffff' : '#ff1b58'
        ctx.fillRect(c.sp > 0 ? cx + c.w - 2 : cx, cy + 1.5, 2, 2)
      })

      // ── INTERACTIVE CANVAS UI OVERLAYS ─────────────────────────────────────
      const mouse = mouseRef.current
      if (mouse.x >= 0 && mouse.y >= 0) {
        ctx.globalCompositeOperation = 'screen'
        
        // 1. Precise Crosshair Reticle Tracker
        ctx.strokeStyle = 'rgba(0, 255, 240, 0.4)'
        ctx.lineWidth = 0.5
        
        ctx.beginPath()
        ctx.moveTo(mouse.x, 0); ctx.lineTo(mouse.x, H)
        ctx.moveTo(0, mouse.y); ctx.lineTo(W, mouse.y)
        ctx.stroke()

        // 2. Local Targeting Box Hud
        ctx.strokeStyle = '#00fff0'
        ctx.lineWidth = 1
        ctx.strokeRect(mouse.x - 6, mouse.y - 6, 12, 12)

        // 3. Dynamic Building Scanner telemetry data
        if (mouse.targetBuilding) {
          const tb = mouse.targetBuilding
          
          const scanY = tb.y + ((t * 0.1) % tb.h)
          ctx.strokeStyle = 'rgba(255, 0, 150, 0.6)'
          ctx.lineWidth = 1.5
          ctx.beginPath()
          ctx.moveTo(tb.x, scanY)
          ctx.lineTo(tb.x + tb.w, scanY)
          ctx.stroke()

          ctx.fillStyle = '#00fff0'
          ctx.font = '9px monospace'
          ctx.fillText(`SYS_ID: ${tb.id}`, mouse.x + 12, mouse.y - 12)
          ctx.fillText(`LAYER_ID: 0${tb.depth}`, mouse.x + 12, mouse.y - 2)
          ctx.fillText(`ELEV: ${tb.h}m`, mouse.x + 12, mouse.y + 8)
        }
      }

      // 4. Click Discharge Render Loop
      const discharge = clickDischargeRef.current
      if (discharge && discharge.life > 0) {
        discharge.life--
        ctx.globalCompositeOperation = 'screen'
        ctx.strokeStyle = '#ffffff'
        ctx.lineWidth = 1.5
        
        ctx.beginPath()
        ctx.moveTo(discharge.startX, discharge.startY)
        
        let curY = discharge.startY
        let curX = discharge.startX
        const steps = 5
        const stepSize = (discharge.endY - discharge.startY) / steps
        
        for (let i = 1; i < steps; i++) {
          curY += stepSize
          curX += r(-20, 20)
          ctx.lineTo(curX, curY)
        }
        ctx.lineTo(discharge.endX, discharge.endY)
        ctx.stroke()

        if (discharge.life === 0) clickDischargeRef.current = null
      }

      // ── Clean Scanning Line Layers ─────────────────────────────────────────
      ctx.globalCompositeOperation = 'source-over'
      ctx.fillStyle = 'rgba(0, 0, 0, 0.18)'
      for (let i = 0; i < H; i += 4) {
        ctx.fillRect(0, i, W, 1.5)
      }

      frameId = requestAnimationFrame(render)
    }

    initScene()
    frameId = requestAnimationFrame(render)

    const ro = new ResizeObserver(initScene)
    ro.observe(container)

    return () => {
      cancelAnimationFrame(frameId)
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseout', handleMouseLeave)
      window.removeEventListener('click', handleMouseClick)
      ro.disconnect()
    }
  }, [])

  return (
    <div ref={containerRef} style={{ position: 'absolute', inset: 0, backgroundColor: '#000000', overflow: 'hidden' }}>
      <canvas
        ref={canvasRef}
        style={{ display: 'block', width: '100%', height: '100%' }}
      />
    </div>
  )
}