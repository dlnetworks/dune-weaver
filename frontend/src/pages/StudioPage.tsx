import { useState, useEffect, useRef, useCallback } from 'react'
import { toast } from 'sonner'
import { apiClient } from '@/lib/apiClient'
import { useLocation, useNavigate } from 'react-router-dom'

interface Point {
  x: number
  y: number
}

interface Transform {
  zoom: number
  rotation: number
  panX: number
  panY: number
  flipX: boolean
  flipY: boolean
}

export function StudioPage() {
  const location = useLocation()
  const navigate = useNavigate()

  // State
  const [originalPoints, setOriginalPoints] = useState<Point[]>([])
  const [transform, setTransform] = useState<Transform>({
    zoom: 1,
    rotation: 0,
    panX: 0,
    panY: 0,
    flipX: false,
    flipY: false,
  })
  const [fileName, setFileName] = useState('pattern')
  const [fileCategory, setFileCategory] = useState('')
  const [stats, setStats] = useState('Waiting for file...')
  const [isDragging, setIsDragging] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  // Refs
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const hiddenSvgRef = useRef<HTMLDivElement>(null)
  const lastPosRef = useRef({ x: 0, y: 0 })
  const isDrawingRef = useRef(false)

  // Load pattern from location state (when coming from Browse page)
  useEffect(() => {
    if (location.state?.patternPath) {
      loadPatternFromPath(location.state.patternPath)
    }
  }, [location.state])

  const loadPatternFromPath = async (path: string) => {
    try {
      const response = await fetch(apiClient.buildUrl(`/api/patterns/${path}`))
      if (!response.ok) throw new Error('Failed to load pattern')

      const content = await response.text()

      // Extract filename and category from path
      const parts = path.split('/')
      const name = parts[parts.length - 1].replace('.thr', '')
      const category = parts.slice(0, -1).join('/')

      setFileName(name)
      setFileCategory(category)
      parseTHR(content)
    } catch (error) {
      toast.error('Failed to load pattern')
      console.error('Error loading pattern:', error)
    }
  }

  // Canvas resize
  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const size = Math.min(window.innerWidth - 380, window.innerHeight - 40)
    canvas.width = size
    canvas.height = size
    requestDraw()
  }, [])

  useEffect(() => {
    window.addEventListener('resize', resizeCanvas)
    resizeCanvas()
    return () => window.removeEventListener('resize', resizeCanvas)
  }, [resizeCanvas])

  // Drawing
  const requestDraw = useCallback(() => {
    if (!isDrawingRef.current) {
      isDrawingRef.current = true
      requestAnimationFrame(draw)
    }
  }, [originalPoints, transform])

  const draw = useCallback(() => {
    isDrawingRef.current = false
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const w = canvas.width
    const h = canvas.height
    const cx = w / 2
    const cy = h / 2
    const radius = (w / 2) - 10

    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, w, h)

    // Boundary
    ctx.strokeStyle = '#333'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.arc(cx, cy, radius, 0, Math.PI * 2)
    ctx.stroke()

    if (originalPoints.length === 0) return

    ctx.lineWidth = 1.5
    let isFirst = true
    ctx.beginPath()

    let prevPt: Point | null = null

    for (let i = 0; i < originalPoints.length; i++) {
      const rawPt = originalPoints[i]
      const curr = applyTransform(rawPt.x, rawPt.y)

      if (isFirst) {
        const pol = getPolar(curr.x, curr.y)
        const r = Math.min(pol.r, 1.0)
        const sx = cx + (r * Math.cos(pol.theta) * radius)
        const sy = cy + (r * Math.sin(pol.theta) * radius)
        ctx.moveTo(sx, sy)
        prevPt = curr
        isFirst = false
        continue
      }

      if (!prevPt) continue

      const dist = Math.sqrt(Math.pow(curr.x - prevPt.x, 2) + Math.pow(curr.y - prevPt.y, 2))
      const steps = Math.ceil(dist / 0.05)

      for (let s = 1; s <= steps; s++) {
        const t = s / steps
        const lx = prevPt.x + (curr.x - prevPt.x) * t
        const ly = prevPt.y + (curr.y - prevPt.y) * t

        const pol = getPolar(lx, ly)

        if (pol.r > 1.0) ctx.strokeStyle = '#ff3333'
        else ctx.strokeStyle = '#4CAF50'

        const rViz = Math.min(pol.r, 1.0)

        const sx = cx + (rViz * Math.cos(pol.theta) * radius)
        const sy = cy + (rViz * Math.sin(pol.theta) * radius)

        ctx.lineTo(sx, sy)
        ctx.stroke()
        ctx.beginPath()
        ctx.moveTo(sx, sy)
      }
      prevPt = curr
    }
  }, [originalPoints, transform])

  useEffect(() => {
    requestDraw()
  }, [originalPoints, transform, requestDraw])

  // Geometry helpers
  const applyTransform = (x: number, y: number) => {
    x *= (transform.flipX ? -1 : 1)
    y *= (transform.flipY ? -1 : 1)
    x *= transform.zoom
    y *= transform.zoom

    const cos = Math.cos(transform.rotation)
    const sin = Math.sin(transform.rotation)
    const rx = x * cos - y * sin
    const ry = x * sin + y * cos

    return { x: rx + transform.panX, y: ry + transform.panY }
  }

  const getPolar = (x: number, y: number) => ({
    r: Math.sqrt(x * x + y * y),
    theta: Math.atan2(y, x)
  })

  // Parsers
  const parseTHR = (text: string) => {
    const points: Point[] = []
    const lines = text.split('\n')

    lines.forEach(line => {
      const parts = line.trim().split(/[\s,]+/)
      if (parts.length >= 2) {
        const theta = parseFloat(parts[0])
        const rho = parseFloat(parts[1])
        if (!isNaN(theta) && !isNaN(rho)) {
          points.push({ x: rho * Math.cos(theta), y: rho * Math.sin(theta) })
        }
      }
    })

    normalizeAndCenter(points, 'THR')
  }

  const parseGCode = (text: string) => {
    const points: Point[] = []
    const lines = text.split('\n')
    const xReg = /X\s*(-?\d+(\.\d+)?)/i
    const yReg = /Y\s*(-?\d+(\.\d+)?)/i
    let cx = 0, cy = 0

    lines.forEach(line => {
      line = line.split(';')[0].trim().toUpperCase()
      if (line.startsWith('G0') || line.startsWith('G1')) {
        const xMatch = line.match(xReg)
        const yMatch = line.match(yReg)
        let moved = false
        if (xMatch) { cx = parseFloat(xMatch[1]); moved = true }
        if (yMatch) { cy = parseFloat(yMatch[1]); moved = true }
        if (moved) points.push({ x: cx, y: -cy })
      }
    })

    normalizeAndCenter(points, 'G-Code')
  }

  const parseSVG = (text: string) => {
    const parser = new DOMParser()
    const doc = parser.parseFromString(text, 'image/svg+xml')
    const tempPoints: Point[] = []

    const samplePath = (pathEl: SVGPathElement) => {
      const len = pathEl.getTotalLength()
      const step = Math.max(1, len / 500)
      for (let l = 0; l <= len; l += step) {
        const pt = pathEl.getPointAtLength(l)
        tempPoints.push({ x: pt.x, y: pt.y })
      }
    }

    const container = hiddenSvgRef.current
    if (!container) return

    container.innerHTML = ''
    doc.querySelectorAll('path').forEach(p => {
      const clone = p.cloneNode(true) as SVGPathElement
      container.appendChild(clone)
      samplePath(clone)
    })
    container.innerHTML = ''

    doc.querySelectorAll('polyline, polygon').forEach(poly => {
      const pointsAttr = poly.getAttribute('points')
      if (pointsAttr) {
        const nums = pointsAttr.trim().split(/[\s,]+/).map(Number)
        for (let i = 0; i < nums.length; i += 2) {
          if (!isNaN(nums[i]) && !isNaN(nums[i + 1])) {
            tempPoints.push({ x: nums[i], y: nums[i + 1] })
          }
        }
      }
    })

    doc.querySelectorAll('line').forEach(line => {
      tempPoints.push({
        x: parseFloat(line.getAttribute('x1') || '0'),
        y: parseFloat(line.getAttribute('y1') || '0')
      })
      tempPoints.push({
        x: parseFloat(line.getAttribute('x2') || '0'),
        y: parseFloat(line.getAttribute('y2') || '0')
      })
    })

    normalizeAndCenter(tempPoints, 'SVG')
  }

  const normalizeAndCenter = (points: Point[], type: string) => {
    if (points.length === 0) return

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
    points.forEach(p => {
      if (p.x < minX) minX = p.x
      if (p.x > maxX) maxX = p.x
      if (p.y < minY) minY = p.y
      if (p.y > maxY) maxY = p.y
    })

    const centerX = (minX + maxX) / 2
    const centerY = (minY + maxY) / 2
    let maxR = 0

    points.forEach(p => {
      p.x -= centerX
      p.y -= centerY
      const r = Math.sqrt(p.x * p.x + p.y * p.y)
      if (r > maxR) maxR = r
    })

    if (maxR > 0) {
      points.forEach(p => {
        p.x /= maxR
        p.y /= maxR
      })
    }

    setOriginalPoints(points)
    setTransform({ zoom: 1, rotation: 0, panX: 0, panY: 0, flipX: false, flipY: false })
    setStats(`Loaded: <strong>${type}</strong><br>Points: ${points.length}<br><span style="color:#4CAF50">Ready.</span>`)
  }

  // File handling
  const handleFile = (file: File) => {
    const name = file.name.split('.').slice(0, -1).join('.')
    setFileName(name)
    setFileCategory('') // New file, no category

    const ext = file.name.split('.').pop()?.toLowerCase()
    const reader = new FileReader()

    reader.onload = (e) => {
      const content = e.target?.result as string
      if (ext === 'svg') parseSVG(content)
      else if (ext === 'thr') parseTHR(content)
      else parseGCode(content)
    }

    reader.readAsText(file)
  }

  // Export/Save
  const handleSave = async () => {
    if (originalPoints.length === 0) return

    setIsSaving(true)
    try {
      const newLines: string[] = []
      let prevTheta = 0
      let cumulativeTheta = 0
      let prevPt: Point | null = null

      for (let i = 0; i < originalPoints.length; i++) {
        const rawPt = originalPoints[i]
        const curr = applyTransform(rawPt.x, rawPt.y)

        if (i === 0) {
          prevPt = curr
          const p = getPolar(curr.x, curr.y)
          cumulativeTheta = p.theta
          prevTheta = p.theta
          const r = Math.min(p.r, 1.0)
          newLines.push(`${cumulativeTheta.toFixed(5)} ${r.toFixed(5)}`)
          continue
        }

        if (!prevPt) continue

        const dist = Math.sqrt(Math.pow(curr.x - prevPt.x, 2) + Math.pow(curr.y - prevPt.y, 2))
        const steps = Math.ceil(dist / 0.01)

        for (let s = 1; s <= steps; s++) {
          const t = s / steps
          const lx = prevPt.x + (curr.x - prevPt.x) * t
          const ly = prevPt.y + (curr.y - prevPt.y) * t

          const p = getPolar(lx, ly)
          let r = p.r

          if (r > 1.0) r = 1.0

          let rawTheta = p.theta
          let delta = rawTheta - prevTheta
          if (delta > Math.PI) delta -= 2 * Math.PI
          else if (delta < -Math.PI) delta += 2 * Math.PI

          cumulativeTheta += delta
          prevTheta = rawTheta

          newLines.push(`${cumulativeTheta.toFixed(5)} ${r.toFixed(5)}`)
        }
        prevPt = curr
      }

      // Save to backend
      const fullPath = fileCategory ? `${fileCategory}/${fileName}.thr` : `${fileName}.thr`

      await apiClient.post('/api/studio/save_pattern', {
        path: fullPath,
        content: newLines.join('\n')
      })

      toast.success(`Pattern saved: ${fileName}.thr`)
    } catch (error) {
      toast.error('Failed to save pattern')
      console.error('Save error:', error)
    } finally {
      setIsSaving(false)
    }
  }

  // Mouse handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true)
    lastPosRef.current = { x: e.clientX, y: e.clientY }
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return

    const canvas = canvasRef.current
    if (!canvas) return

    const dx = e.clientX - lastPosRef.current.x
    const dy = e.clientY - lastPosRef.current.y
    lastPosRef.current = { x: e.clientX, y: e.clientY }

    const radiusPx = (canvas.width / 2) - 10

    setTransform(prev => ({
      ...prev,
      panX: prev.panX + dx / radiusPx,
      panY: prev.panY + dy / radiusPx
    }))
  }

  const handleMouseUp = () => {
    setIsDragging(false)
  }

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    setTransform(prev => ({
      ...prev,
      zoom: Math.min(Math.max(prev.zoom + (-e.deltaY * 0.001), 0.1), 10.0)
    }))
  }

  return (
    <>
      <style>{`
        .studio-container {
          display: flex;
          flex-direction: row;
          height: calc(100dvh - 4rem - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px));
          background-color: #1a1a1a;
          color: #e0e0e0;
          overflow: hidden;
          user-select: none;
        }

        .studio-controls {
          width: 340px;
          background-color: #2d2d2d;
          padding: 20px;
          box-shadow: 2px 0 10px rgba(0,0,0,0.5);
          display: flex;
          flex-direction: column;
          z-index: 10;
          overflow-y: auto;
        }

        .studio-h1 { font-size: 1.3rem; margin-top: 0; color: #fff; margin-bottom: 0.2rem; }
        .studio-subtitle { font-size: 0.8rem; color: #888; margin-bottom: 1.5rem; }

        .studio-drop-zone {
          border: 2px dashed #555;
          border-radius: 8px;
          padding: 25px;
          text-align: center;
          cursor: pointer;
          margin-bottom: 20px;
          background: #333;
          transition: 0.2s;
        }
        .studio-drop-zone.dragover { border-color: #4CAF50; background: #3a4b3a; }
        .studio-drop-zone p { margin: 0; color: #aaa; font-size: 0.9rem; pointer-events: none; }

        .studio-control-group { margin-bottom: 15px; }
        .studio-label { display: flex; justify-content: space-between; font-size: 0.85rem; margin-bottom: 5px; color: #ccc; }
        .studio-range { width: 100%; cursor: pointer; }

        .studio-flip-group { display: flex; gap: 10px; margin-bottom: 20px; }
        .studio-btn-flip {
          flex: 1;
          padding: 8px;
          background: #444;
          color: #fff;
          border: 1px solid #555;
          border-radius: 4px;
          cursor: pointer;
          font-size: 0.85rem;
        }
        .studio-btn-flip:hover { background: #555; }
        .studio-btn-flip.active { background: #4CAF50; border-color: #4CAF50; font-weight: bold; }

        .studio-btn-group { margin-top: auto; display: flex; gap: 10px; flex-direction: column; }
        .studio-btn {
          padding: 12px;
          border: none;
          border-radius: 5px;
          font-weight: bold;
          cursor: pointer;
          width: 100%;
          font-size: 1rem;
        }
        .studio-btn-primary { background-color: #4CAF50; color: white; }
        .studio-btn-primary:hover { background-color: #45a049; }
        .studio-btn-secondary { background-color: #555; color: white; }
        .studio-btn-secondary:hover { background-color: #666; }
        .studio-btn:disabled { background-color: #444; color: #777; cursor: not-allowed; }

        .studio-stats {
          font-size: 0.8rem;
          color: #888;
          margin-top: 10px;
          margin-bottom: 10px;
          font-family: monospace;
          line-height: 1.4;
          background: #222;
          padding: 10px;
          border-radius: 4px;
          border: 1px solid #333;
        }

        .studio-hint {
          font-size: 0.75rem;
          color: #666;
          margin-top: -10px;
          margin-bottom: 15px;
          font-style: italic;
          text-align: center;
        }

        .studio-viewport {
          flex-grow: 1;
          position: relative;
          background-color: #111;
          display: flex;
          justify-content: center;
          align-items: center;
          overflow: hidden;
        }

        .studio-canvas {
          box-shadow: 0 0 60px rgba(0,0,0,0.8);
          border-radius: 50%;
          background-color: #000;
          max-width: 95%;
          max-height: 95%;
          cursor: grab;
        }
        .studio-canvas:active { cursor: grabbing; }

        .studio-hidden { position: absolute; top: -9999px; left: -9999px; visibility: hidden; }
      `}</style>

      <div className="studio-container">
        <div ref={hiddenSvgRef} className="studio-hidden" />

        <div className="studio-controls">
          <h1 className="studio-h1">Dune Weaver Studio</h1>
          <div className="studio-subtitle">Convert SVG, THR and Gcode</div>

          <div
            className={`studio-drop-zone ${dragOver ? 'dragover' : ''}`}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragOver(false)
              if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0])
            }}
          >
            <p>Drop file here or click to select<br /><span style={{ fontSize: '0.8em', color: '#666' }}>(.svg, .gcode, .nc, .thr)</span></p>
            <input
              ref={fileInputRef}
              type="file"
              style={{ display: 'none' }}
              accept=".svg,.gcode,.nc,.thr"
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
            />
          </div>

          <div className="studio-flip-group">
            <button
              className={`studio-btn-flip ${transform.flipX ? 'active' : ''}`}
              onClick={() => setTransform(prev => ({ ...prev, flipX: !prev.flipX }))}
            >
              Flip X
            </button>
            <button
              className={`studio-btn-flip ${transform.flipY ? 'active' : ''}`}
              onClick={() => setTransform(prev => ({ ...prev, flipY: !prev.flipY }))}
            >
              Flip Y
            </button>
          </div>

          <div className="studio-control-group">
            <label className="studio-label">Zoom <span>{transform.zoom.toFixed(2)}</span></label>
            <input
              type="range"
              className="studio-range"
              min="0.1"
              max="5.0"
              step="0.01"
              value={transform.zoom}
              onChange={(e) => setTransform(prev => ({ ...prev, zoom: parseFloat(e.target.value) }))}
            />
          </div>

          <div className="studio-control-group">
            <label className="studio-label">Rotate (Deg) <span>{(transform.rotation * 180 / Math.PI).toFixed(0)}</span></label>
            <input
              type="range"
              className="studio-range"
              min="-180"
              max="180"
              step="1"
              value={(transform.rotation * 180 / Math.PI).toFixed(0)}
              onChange={(e) => setTransform(prev => ({ ...prev, rotation: parseFloat(e.target.value) * Math.PI / 180 }))}
            />
          </div>

          <div className="studio-control-group">
            <label className="studio-label">Pan X <span>{transform.panX.toFixed(2)}</span></label>
            <input
              type="range"
              className="studio-range"
              min="-1.5"
              max="1.5"
              step="0.01"
              value={transform.panX}
              onChange={(e) => setTransform(prev => ({ ...prev, panX: parseFloat(e.target.value) }))}
            />
          </div>

          <div className="studio-control-group">
            <label className="studio-label">Pan Y <span>{transform.panY.toFixed(2)}</span></label>
            <input
              type="range"
              className="studio-range"
              min="-1.5"
              max="1.5"
              step="0.01"
              value={transform.panY}
              onChange={(e) => setTransform(prev => ({ ...prev, panY: parseFloat(e.target.value) }))}
            />
          </div>

          <div className="studio-hint">Red lines = Perimeter Travel (Clamped)</div>

          <button
            className="studio-btn studio-btn-secondary"
            onClick={() => setTransform({ zoom: 1, rotation: 0, panX: 0, panY: 0, flipX: false, flipY: false })}
          >
            Reset Transforms
          </button>

          <div className="studio-stats" dangerouslySetInnerHTML={{ __html: stats }} />

          <div className="studio-btn-group">
            <button
              className="studio-btn studio-btn-primary"
              onClick={handleSave}
              disabled={originalPoints.length === 0 || isSaving}
            >
              {isSaving ? 'Saving...' : 'Save Pattern'}
            </button>

            {(fileCategory || fileName !== 'pattern') && (
              <button
                className="studio-btn studio-btn-secondary"
                onClick={() => {
                  const patternPath = fileCategory ? `${fileCategory}/${fileName}.thr` : `${fileName}.thr`
                  navigate('/', { state: { openPattern: patternPath } })
                }}
              >
                Back to Browse
              </button>
            )}
          </div>
        </div>

        <div className="studio-viewport">
          <canvas
            ref={canvasRef}
            className="studio-canvas"
            width="1000"
            height="1000"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onWheel={handleWheel}
          />
        </div>
      </div>
    </>
  )
}
