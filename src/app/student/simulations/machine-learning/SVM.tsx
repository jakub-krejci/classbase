'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef, useState } from 'react'

const C = { bg:'#090B10', card:'#11141D', border:'rgba(255,255,255,0.07)', txt:'#fff', sec:'#8892a4' }

interface SVMPoint { x: number; y: number; cls: -1 | 1 }

export function SVMSim({ canvasSize, accentColor }: { canvasSize: { w: number; h: number }; accentColor: string }) {
  const cvRef = useRef<HTMLCanvasElement>(null)
  const st = useRef({
    points: [] as SVMPoint[],
    w0: 1, w1: 1, b: 0,   // decision: w0*x + w1*y + b = 0
    margin: 0,
    supportVectors: [] as SVMPoint[],
    iter: 0,
    animMargin: 0,
    showKernel: false,
  })
  const rafRef = useRef(0)
  const [mode, setMode] = useState<-1|1>(1)
  const [kernel, setKernel] = useState<'linear'|'rbf'>('linear')
  const kernelRef = useRef<'linear'|'rbf'>('linear')
  const [stats, setStats] = useState({ margin: 0, sv: 0, iter: 0 })

  const W = canvasSize.w, H = canvasSize.h
  const PAD = Math.min(50, W * 0.08)

  const rbfKernel = (x1: number, y1: number, x2: number, y2: number, gamma = 8) => {
    const d2 = (x1 - x2) ** 2 + (y1 - y2) ** 2
    return Math.exp(-gamma * d2)
  }

  // Demo data
  useEffect(() => {
    const pts: SVMPoint[] = []
    for (let i = 0; i < 12; i++) pts.push({ x: 0.12 + Math.random() * 0.3, y: 0.2 + Math.random() * 0.55, cls: -1 })
    for (let i = 0; i < 12; i++) pts.push({ x: 0.58 + Math.random() * 0.3, y: 0.25 + Math.random() * 0.55, cls: 1 })
    st.current.points = pts
    st.current.w0 = 1.5; st.current.w1 = 0.2; st.current.b = -1.2
  }, [])

  useEffect(() => {
    const cv = cvRef.current; if (!cv) return
    const ctx = cv.getContext('2d')!
    const imgW = W - PAD * 2, imgH = H - PAD * 2

    let frame = 0
    const draw = () => {
      frame++

      // Soft-margin SVM via SGD (simplified)
      if (st.current.points.length >= 4 && frame % 1 === 0) {
        const { points: pts } = st.current
        const C_reg = 1.0, lr = 0.015
        let { w0, w1, b } = st.current
        const norm2 = w0 * w0 + w1 * w1 + 1e-6

        pts.forEach(p => {
          const margin = p.cls * (w0 * p.x + w1 * p.y + b)
          if (margin < 1) {
            // hinge loss gradient
            w0 = w0 - lr * (w0 / norm2 - C_reg * p.cls * p.x)
            w1 = w1 - lr * (w1 / norm2 - C_reg * p.cls * p.y)
            b = b - lr * (-C_reg * p.cls)
          } else {
            w0 = w0 - lr * w0 / norm2
            w1 = w1 - lr * w1 / norm2
          }
        })

        st.current.w0 = w0; st.current.w1 = w1; st.current.b = b

        // Compute margin = 2 / ||w||
        const norm = Math.sqrt(w0 * w0 + w1 * w1)
        st.current.margin = norm > 0 ? 2 / norm : 0

        // Find support vectors (points within margin)
        st.current.supportVectors = pts.filter(p => {
          const d = Math.abs(w0 * p.x + w1 * p.y + b) / Math.sqrt(w0 ** 2 + w1 ** 2)
          return d < 1.0 / Math.sqrt(w0 ** 2 + w1 ** 2) + 0.06
        })

        // Animate margin growing
        st.current.animMargin += (st.current.margin - st.current.animMargin) * 0.03
        st.current.iter++

        if (frame % 40 === 0) {
          setStats({ margin: +st.current.margin.toFixed(3), sv: st.current.supportVectors.length, iter: st.current.iter })
        }
      }

      ctx.clearRect(0, 0, W, H)

      const { w0, w1, b, animMargin } = st.current
      const norm = Math.sqrt(w0 ** 2 + w1 ** 2) + 1e-6

      if (kernelRef.current === 'linear') {
        // Decision regions
        for (let px = 0; px < imgW; px += 3) {
          for (let py = 0; py < imgH; py += 3) {
            const nx = px / imgW, ny = 1 - py / imgH
            const score = w0 * nx + w1 * ny + b
            const cls = score > 0 ? 1 : -1
            const dist = Math.abs(score) / norm
            const inMargin = dist < 1 / norm + 0.03
            ctx.fillStyle = cls === 1
              ? (inMargin ? 'rgba(59,130,246,0.18)' : 'rgba(59,130,246,0.07)')
              : (inMargin ? 'rgba(249,115,22,0.18)' : 'rgba(249,115,22,0.07)')
            ctx.fillRect(PAD + px, PAD + py, 3, 3)
          }
        }

        // Draw decision boundary w0*x + w1*y + b = 0 → y = (-w0*x - b) / w1
        const drawBoundaryLine = (offset: number, style: string, dash: number[]) => {
          if (Math.abs(w1) < 0.001) return
          ctx.beginPath(); let first = true
          for (let px = 0; px <= imgW; px += 2) {
            const nx = px / imgW
            const ny = (-w0 * nx - b + offset) / w1
            const cy2 = PAD + (1 - ny) * imgH
            if (cy2 < PAD - 20 || cy2 > H - PAD + 20) { first = true; continue }
            first ? ctx.moveTo(PAD + px, cy2) : ctx.lineTo(PAD + px, cy2)
            first = false
          }
          ctx.strokeStyle = style; ctx.lineWidth = dash.length ? 1.5 : 2.5; ctx.setLineDash(dash); ctx.stroke(); ctx.setLineDash([])
        }

        // Margin lines
        const marginOffset = 1 / norm * w1 * imgH
        drawBoundaryLine(1 / norm * w1, 'rgba(59,130,246,0.7)', [6, 4])
        drawBoundaryLine(-1 / norm * w1, 'rgba(249,115,22,0.7)', [6, 4])

        // Center boundary
        ctx.save(); ctx.shadowColor = '#fff'; ctx.shadowBlur = 8
        drawBoundaryLine(0, '#fff', [])
        ctx.restore()

        // Margin width arrows
        if (Math.abs(w1) > 0.01 && animMargin > 0.05) {
          const midX = W / 2
          const ny_center = (-w0 * ((midX - PAD) / imgW) - b) / w1
          const ny_plus = (-w0 * ((midX - PAD) / imgW) - b + 1 / norm * w1) / w1
          const cy_center = PAD + (1 - ny_center) * imgH
          const cy_plus = PAD + (1 - ny_plus) * imgH
          const marginPx = Math.abs(cy_plus - cy_center)

          if (marginPx > 10 && cy_center > PAD && cy_center < H - PAD) {
            ctx.strokeStyle = '#f59e0b'; ctx.lineWidth = 1.5
            ctx.beginPath()
            ctx.moveTo(midX + 20, cy_center - marginPx); ctx.lineTo(midX + 20, cy_center + marginPx)
            ctx.stroke()
            // Arrow heads
            ctx.fillStyle = '#f59e0b'; ctx.font = '10px sans-serif'
            ctx.fillText('▲', midX + 14, cy_center - marginPx + 6)
            ctx.fillText('▼', midX + 14, cy_center + marginPx + 6)
            ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'left'
            ctx.fillText(`margin = ${animMargin.toFixed(2)}`, midX + 28, cy_center + 4)
          }
        }
      } else {
        // RBF kernel — show class boundaries via grid evaluation
        const pts2 = st.current.points
        for (let px = 0; px < imgW; px += 4) {
          for (let py = 0; py < imgH; py += 4) {
            const nx = px / imgW, ny = 1 - py / imgH
            let score = 0
            pts2.forEach(p => { score += p.cls * rbfKernel(nx, ny, p.x, p.y) })
            ctx.fillStyle = score > 0 ? 'rgba(59,130,246,0.12)' : 'rgba(249,115,22,0.12)'
            ctx.fillRect(PAD + px, PAD + py, 4, 4)
          }
        }
        // Boundary contour
        for (let px = 0; px < imgW - 4; px += 4) {
          for (let py = 0; py < imgH - 4; py += 4) {
            const nx1 = px / imgW, ny1 = 1 - py / imgH
            const nx2 = (px + 4) / imgW, ny2 = 1 - (py + 4) / imgH
            let s1 = 0, s2 = 0
            pts2.forEach(p => { s1 += p.cls * rbfKernel(nx1, ny1, p.x, p.y); s2 += p.cls * rbfKernel(nx2, ny2, p.x, p.y) })
            if (s1 * s2 < 0) {
              ctx.beginPath(); ctx.arc(PAD + px + 2, PAD + py + 2, 1.5, 0, Math.PI * 2)
              ctx.fillStyle = '#fff'; ctx.fill()
            }
          }
        }
      }

      // Axes
      ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.lineWidth = 1
      ctx.beginPath(); ctx.moveTo(PAD, PAD); ctx.lineTo(PAD, H - PAD); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(PAD, H - PAD); ctx.lineTo(W - PAD, H - PAD); ctx.stroke()
      ctx.fillStyle = C.sec; ctx.font = '10px sans-serif'; ctx.textAlign = 'center'
      ctx.fillText('Feature 1', W / 2, H - 4)
      ctx.save(); ctx.translate(12, H / 2); ctx.rotate(-Math.PI / 2); ctx.fillText('Feature 2', 0, 0); ctx.restore()

      // Points
      st.current.points.forEach(p => {
        const cx2 = PAD + p.x * imgW, cy2 = PAD + (1 - p.y) * imgH
        const isSV = st.current.supportVectors.includes(p)
        const col = p.cls === 1 ? '#3b82f6' : '#f97316'

        // Support vector ring
        if (isSV) {
          ctx.beginPath(); ctx.arc(cx2, cy2, 13, 0, Math.PI * 2)
          ctx.strokeStyle = col; ctx.lineWidth = 2.5; ctx.setLineDash([3, 2]); ctx.stroke(); ctx.setLineDash([])
        }
        ctx.beginPath(); ctx.arc(cx2, cy2, 7, 0, Math.PI * 2)
        ctx.fillStyle = col + 'cc'; ctx.fill()
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke()
        // Symbol
        ctx.fillStyle = '#fff'; ctx.font = 'bold 9px monospace'; ctx.textAlign = 'center'
        ctx.fillText(p.cls === 1 ? '+' : '−', cx2, cy2 + 3)
      })

      rafRef.current = requestAnimationFrame(draw)
    }
    rafRef.current = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(rafRef.current)
  }, [W, H, PAD, accentColor])

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = cvRef.current!.getBoundingClientRect()
    const scaleX = W / rect.width, scaleY = H / rect.height
    const cx = (e.clientX - rect.left) * scaleX
    const cy = (e.clientY - rect.top) * scaleY
    if (cx < PAD || cx > W - PAD || cy < PAD || cy > H - PAD) return
    const x = (cx - PAD) / (W - PAD * 2)
    const y = 1 - (cy - PAD) / (H - PAD * 2)
    st.current.points.push({ x, y, cls: mode })
    st.current.iter = 0
  }

  const reset = () => {
    st.current.points = []; st.current.w0 = 1; st.current.w1 = 1; st.current.b = 0; st.current.iter = 0
    setStats({ margin: 0, sv: 0, iter: 0 })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 14px', borderBottom: `1px solid ${C.border}`, flexShrink: 0, background: C.card, flexWrap: 'wrap' as const }}>
        <span style={{ fontSize: 11, color: C.sec }}>Margin: <strong style={{ color: '#f59e0b' }}>{stats.margin.toFixed(3)}</strong></span>
        <span style={{ fontSize: 11, color: C.sec }}>Support vektory: <strong style={{ color: accentColor }}>{stats.sv}</strong></span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' as const }}>
          <span style={{ fontSize: 10, color: C.sec }}>Přidej bod:</span>
          {([1, -1] as const).map(c => (
            <button key={c} onClick={() => setMode(c)}
              style={{ padding: '3px 10px', background: mode === c ? (c === 1 ? 'rgba(59,130,246,.2)' : 'rgba(249,115,22,.2)') : 'rgba(255,255,255,.05)', color: c === 1 ? '#60a5fa' : '#fb923c', border: `1px solid ${c === 1 ? '#3b82f644' : '#f9731644'}`, borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit', fontSize: 11, fontWeight: mode === c ? 700 : 400 }}>
              {c === 1 ? '+ Třída +' : '− Třída −'}
            </button>
          ))}
          <div style={{ display: 'flex', border: `1px solid ${C.border}`, borderRadius: 6, overflow: 'hidden' }}>
            {(['linear', 'rbf'] as const).map(k => (
              <button key={k} onClick={() => { setKernel(k); kernelRef.current = k; st.current.iter = 0 }}
                style={{ padding: '3px 10px', background: kernel === k ? accentColor + '33' : 'transparent', color: kernel === k ? accentColor : C.sec, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 11 }}>
                {k === 'linear' ? 'Linear' : 'RBF kernel'}
              </button>
            ))}
          </div>
          <button onClick={reset} style={{ padding: '3px 10px', background: 'rgba(255,255,255,.07)', color: C.sec, border: `1px solid ${C.border}`, borderRadius: 6, cursor: 'pointer', fontSize: 11, fontFamily: 'inherit' }}>
            🗑 Reset
          </button>
        </div>
      </div>
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <canvas ref={cvRef} width={W} height={H - 42} onClick={handleClick}
          style={{ width: '100%', height: '100%', cursor: 'crosshair' }} />
      </div>
    </div>
  )
}

export function SVMInfo({ color }: { color: string }) {
  return (
    <>
      <p style={{ fontSize: 12, color: '#cbd5e1', lineHeight: 1.75, margin: '0 0 12px' }}>
        SVM hledá nadrovinu která odděluje třídy s <strong style={{ color }}>maximálním marginem</strong>.
        Support vektory jsou body nejblíže hranici — jen ty ovlivňují polohu hranice.
      </p>
      <div style={{ background: '#0d1117', borderRadius: 7, padding: '10px 12px', fontFamily: 'monospace', fontSize: 10.5, color: '#94a3b8', lineHeight: 2, marginBottom: 12 }}>
        <div>Hranice: <span style={{ color }}>w·x + b = 0</span></div>
        <div>Margin = <span style={{ color: '#f59e0b' }}>2 / ||w||</span></div>
        <div>Cíl: <span style={{ color }}>maximalizovat margin</span></div>
        <div>SV: y<sub>i</sub>(w·x<sub>i</sub>+b) <span style={{ color: '#ef4444' }}>= 1</span></div>
      </div>
      <div style={{ padding: '8px 10px', background: 'rgba(251,191,36,.05)', border: '1px solid rgba(251,191,36,.15)', borderRadius: 8, marginBottom: 12 }}>
        <p style={{ fontSize: 11, color: '#fcd34d', margin: 0, lineHeight: 1.65 }}>
          💡 Přerušované čáry = okraje marginu. ⭕ = support vektory.<br />
          Zkus RBF kernel pro nelineárně separabilní data!
        </p>
      </div>
      <div style={{ padding: '8px 10px', background: 'rgba(168,85,247,.08)', border: '1px solid rgba(168,85,247,.2)', borderRadius: 8, marginBottom: 12 }}>
        <div style={{ fontSize: 10, color: '#c4b5fd', lineHeight: 1.6 }}>
          <strong>RBF kernel trick:</strong> Transformuje data do vyššího prostoru kde jsou lineárně separabilní.
          K(x,z) = exp(−γ‖x−z‖²)
        </div>
      </div>
      <div style={{ padding: '8px 10px', background: `rgba(99,102,241,.08)`, border: `1px solid rgba(99,102,241,.2)`, borderRadius: 8 }}>
        <div style={{ fontSize: 10, color: '#a5b4fc', lineHeight: 1.6 }}>
          👆 Přidávej body + a − a sleduj jak se mění hranice a margin.<br />
          Přidej body doprostřed pro overlap — model bude kompromisnější.
        </div>
      </div>
    </>
  )
}
