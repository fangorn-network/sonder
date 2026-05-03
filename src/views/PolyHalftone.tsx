import { useEffect, useRef } from 'react'

export function PolyHalftone({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const display = canvasRef.current
    if (!display) return

    const dctx = display.getContext('2d')
    if (!dctx) return

    const DW = 720, DH = 400
    display.width = DW
    display.height = DH

    // ---- EVERYTHING BELOW: lightly adapted from your HTML ----
    const THREE = (window as any).THREE
    if (!THREE) {
      console.error('Three.js not loaded')
      return
    }

    const RW = 240, RH = 135

    const glCnv = document.createElement('canvas')
    glCnv.width = RW
    glCnv.height = RH

    const renderer = new THREE.WebGLRenderer({
      canvas: glCnv,
      antialias: false,
      preserveDrawingBuffer: true
    })
    renderer.setSize(RW, RH, false)
    renderer.setClearColor(0x000000, 1)

    const samp = document.createElement('canvas')
    samp.width = RW
    samp.height = RH
    const sctx = samp.getContext('2d', { willReadFrequently: true })

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(38, RW / RH, 0.5, 30)
    camera.position.set(0, 0, 8)

    const geo = new THREE.IcosahedronGeometry(1.5, 1)
    const mat = new THREE.MeshNormalMaterial()
    const mesh = new THREE.Mesh(geo, mat)
    scene.add(mesh)

    const GRID = 5
    const DOT_MAX = 2.4

    let raf: number

    function frame(t: number) {
      mesh.rotation.y += 0.01
      mesh.rotation.x += 0.005

      renderer.render(scene, camera)

      sctx!.drawImage(glCnv, 0, 0)
      const data = sctx!.getImageData(0, 0, RW, RH).data

      dctx!.fillStyle = '#000'
      dctx!.fillRect(0, 0, DW, DH)

      for (let y = GRID / 2; y < DH; y += GRID) {
        for (let x = GRID / 2; x < DW; x += GRID) {
          const sx = (x * RW / DW) | 0
          const sy = (y * RH / DH) | 0
          const i = (sy * RW + sx) * 4
          const b = Math.max(data[i], data[i+1], data[i+2]) / 255

          if (b < 0.06) continue

          const r = b * DOT_MAX
          dctx!.fillStyle = `rgba(200,220,255,${b})`
          dctx!.beginPath()
          dctx!.arc(x, y, r, 0, Math.PI * 2)
          dctx!.fill()
        }
      }

      raf = requestAnimationFrame(frame)
    }

    raf = requestAnimationFrame(frame)

    return () => cancelAnimationFrame(raf)
  }, [])

  return <canvas ref={canvasRef} className={className} />
}