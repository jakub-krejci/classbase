'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef, useState } from 'react'

const C = { bg:'#090B10', card:'#11141D', border:'rgba(255,255,255,0.07)', txt:'#fff', sec:'#8892a4' }

interface LPoint { x: number; y: number; cls: 0 | 1 }

function sigmoid(z: number) { return 1 / (1 + Math.exp(-z)) }

export function LogisticRegressionSim({ canvasSize, accentColor }: { canvasSize: { w: number; h: number }; accentColor: string }) {
  const cvRef = useRef<HTMLCanvasElement>(null)
  const st = useRef({
    points: [] as LPoint[],
    w0: 0, w1: 0, b: 0,  // decision: sigmoid(w0*x + w1*y + b) > 0.5
    iter: 0,
    loss: 0,
    accuracy: 0,
  })
  const rafRef = useRef(0)
  const [mode, setMode] = useState<0|1>(0)
  const [threshold, setThreshold] = useState(0.5)
  const threshRef = useRef(0.5)
  const [stats, setStats] = useState({ loss: 0, acc: 0, iter: 0 })

  const W = canvasSize.w, H = canvasSize.h
  const PAD = Math.min(50, W * 0.08)

  // Demo data
  useEffect(() => {
    const pts: LPoint[] = []
    // Class 0 (bottom-left cluster)
    for (let i = 0; i < 14; i++) pts.push({ x: 0.15 + Math.random() * 0.3, y: 0.15 + Math.random() * 0.3, cls: 0 })
    // Class 1 (top-right cluster)
    for (let i = 0; i < 14; i++) pts.push({ x: 0.55 + Math.random() * 0.3, y: 0.55 + Math.random() * 0.3, cls: 1 })
    // Some overlap
    for (let i = 0; i < 4; i++) pts.push({ x: 0.35 + Math.random() * 0.25, y: 0.35 + Math.random() * 0.25, cls: i < 2 ? 0 : 1 })
    st.current.points = pts
    st.current.w0 = -1; st.current.w1 = -1; st.current.b = 0.5
  }, [])

  useEffect(() => {
    const cv = cvRef.current; if (!cv) return
    const ctx = cv.getContext('2d')!
    const imgW = W - PAD * 2, imgH = H - PAD * 2

    let frame = 0
    const draw = () => {
      frame++

      // Gradient descent every frame
      if (st.current.points.length >= 4 && frame % 1 === 0) {
        const { points: pts, w0, w1, b } = st.current
        const n = pts.length
        let dw0 = 0, dw1 = 0, db = 0, lossSum = 0
        pts.forEach(p => {
          const z = w0 * p.x + w1 * p.y + b
          const pred = sigmoid(z)
          const err = pred - p.cls
          dw0 += err * p.x; dw1 += err * p.y; db += err
          lossSum += -(p.cls * Math.log(pred + 1e-8) + (1 - p.cls) * Math.log(1 - pred + 1e-8))
        })
        const lr = 0.3
        st.current.w0 = w0 - lr * dw0 / n
        st.current.w1 = w1 - lr * dw1 / n
        st.current.b = b - lr * db / n
        st.current.loss = lossSum / n
        st.current.iter++

        // Accuracy
        const correct = pts.filter(p => {
          const pred = sigmoid(st.current.w0 * p.x + st.current.w1 * p.y + st.current.b)
          return (pred > threshRef.current ? 1 : 0) === p.cls
        }).length
        st.current.accuracy = correct / n

        if (frame % 30 === 0) setStats({ loss: +st.current.loss.toFixed(4), acc: +st.current.accuracy.toFixed(3), iter: st.current.iter })
      }

      ctx.clearRect(0, 0, W, H)

      // Decision boundary background — sample each pixel
      const { w0, w1, b } = st.current
      const resolution = 4
      for (let px = 0; px < imgW; px += resolution) {
        for (let py = 0; py < imgH; py += resolution) {
          const nx = px / imgW, ny = 1 - py / imgH
          const z = w0 * nx + w1 * ny + b
          const p = sigmoid(z)
          const above = p > threshRef.current
          ctx.fillStyle = above ? 'rgba(59,130,246,0.12)' : 'rgba(249,115,22,0.12)'
          ctx.fillRect(PAD + px, PAD + py, resolution, resolution)
        }
      }

      // Decision boundary line (where sigmoid = threshold → w0*x + w1*y + b = logit(threshold))
      if (Math.abs(w1) > 0.01) {
        const logit = Math.log(threshRef.current / (1 - threshRef.current))
        ctx.beginPath()
        let first = true
        for (let px = 0; px <= imgW; px += 2) {
          const nx = px / imgW
          const ny = (logit - w0 * nx - b) / w1
          const cy2 = PAD + (1 - ny) * imgH
          if (cy2 >= PAD && cy2 <= H - PAD) {
            first ? ctx.moveTo(PAD + px, cy2) : ctx.lineTo(PAD + px, cy2)
            first = false
          }
        }
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.5
        ctx.shadowColor = '#fff'; ctx.shadowBlur = 6; ctx.stroke()
        ctx.shadowBlur = 0
      }

      // Axes
      ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.lineWidth = 1
      ctx.beginPath(); ctx.moveTo(PAD, PAD); ctx.lineTo(PAD, H - PAD); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(PAD, H - PAD); ctx.lineTo(W - PAD, H - PAD); ctx.stroke()
      ctx.fillStyle = C.sec; ctx.font = '10px sans-serif'; ctx.textAlign = 'center'
      ctx.fillText('Feature 1 (x)', W / 2, H - 4)
      ctx.save(); ctx.translate(12, H / 2); ctx.rotate(-Math.PI / 2)
      ctx.fillText('Feature 2 (y)', 0, 0); ctx.restore()

      // Points
      st.current.points.forEach(p => {
        const cx2 = PAD + p.x * imgW, cy2 = PAD + (1 - p.y) * imgH
        const pred = sigmoid(w0 * p.x + w1 * p.y + b)
        const correct = (pred > threshRef.current ? 1 : 0) === p.cls
        const col = p.cls === 1 ? '#3b82f6' : '#f97316'

        // Misclassified: red ring
        if (!correct && st.current.iter > 20) {
          ctx.beginPath(); ctx.arc(cx2, cy2, 11, 0, Math.PI * 2)
          ctx.strokeStyle = '#ef4444'; ctx.lineWidth = 2; ctx.stroke()
        }
        ctx.beginPath(); ctx.arc(cx2, cy2, 7, 0, Math.PI * 2)
        ctx.fillStyle = col + 'cc'; ctx.fill()
        ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.stroke()
        // Shape: circle=1, square=0
        if (p.cls === 0) {
          ctx.fillStyle = '#fff'; ctx.font = 'bold 8px monospace'; ctx.textAlign = 'center'
          ctx.fillText('B', cx2, cy2 + 3)
        } else {
          ctx.fillStyle = '#fff'; ctx.font = 'bold 8px monospace'; ctx.textAlign = 'center'
          ctx.fillText('A', cx2, cy2 + 3)
        }
      })

      // Legend
      ctx.font = '11px sans-serif'; ctx.textAlign = 'left'
      ctx.fillStyle = '#f97316'; ctx.fillText('● Třída B', PAD + 2, PAD + 16)
      ctx.fillStyle = '#3b82f6'; ctx.fillText('● Třída A', PAD + 2, PAD + 30)
      ctx.fillStyle = C.sec; ctx.font = '9px sans-serif'
      ctx.fillText('⭕ = špatná predikce', PAD + 2, PAD + 44)

      // Threshold line on sigmoid mini-chart (bottom-right)
      const sigX = W - PAD - 80, sigY = H - PAD - 50, sigW = 76, sigH = 44
      ctx.fillStyle = '#0d1117'
      ctx.fillRect(sigX - 4, sigY - 4, sigW + 8, sigH + 8)
      ctx.strokeStyle = C.border; ctx.lineWidth = 1
      ctx.strokeRect(sigX - 4, sigY - 4, sigW + 8, sigH + 8)
      ctx.beginPath()
      for (let i = 0; i <= sigW; i++) {
        const z = (i / sigW) * 10 - 5
        const sy = sigY + sigH - sigmoid(z) * sigH
        i === 0 ? ctx.moveTo(sigX + i, sy) : ctx.lineTo(sigX + i, sy)
      }
      ctx.strokeStyle = accentColor; ctx.lineWidth = 1.5; ctx.stroke()
      // Threshold line
      const ty = sigY + sigH - threshRef.current * sigH
      ctx.beginPath(); ctx.moveTo(sigX, ty); ctx.lineTo(sigX + sigW, ty)
      ctx.strokeStyle = '#f59e0b88'; ctx.lineWidth = 1; ctx.setLineDash([3, 2]); ctx.stroke(); ctx.setLineDash([])
      ctx.fillStyle = '#f59e0b'; ctx.font = '8px sans-serif'; ctx.textAlign = 'right'
      ctx.fillText(`τ=${threshRef.current.toFixed(2)}`, sigX - 1, ty + 3)
      ctx.fillStyle = C.sec; ctx.font = '7px monospace'; ctx.textAlign = 'center'
      ctx.fillText('σ(z)', sigX + sigW / 2, sigY + sigH + 10)

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
    st.current.points = []; st.current.w0 = -1; st.current.w1 = -1; st.current.b = 0.5; st.current.iter = 0
    setStats({ loss: 0, acc: 0, iter: 0 })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 14px', borderBottom: `1px solid ${C.border}`, flexShrink: 0, background: C.card, flexWrap: 'wrap' as const }}>
        <span style={{ fontSize: 11, color: C.sec }}>
          Loss: <strong style={{ color: stats.loss < 0.3 ? '#22c55e' : stats.loss < 0.6 ? '#f59e0b' : '#ef4444' }}>{stats.loss.toFixed(4)}</strong>
        </span>
        <span style={{ fontSize: 11, color: C.sec }}>
          Přesnost: <strong style={{ color: stats.acc > 0.9 ? '#22c55e' : '#f59e0b' }}>{(stats.acc * 100).toFixed(0)}%</strong>
        </span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' as const }}>
          <span style={{ fontSize: 10, color: C.sec }}>Přidej bod jako:</span>
          {([0, 1] as const).map(c => (
            <button key={c} onClick={() => setMode(c)}
              style={{ padding: '3px 10px', background: mode === c ? (c === 0 ? 'rgba(249,115,22,.2)' : 'rgba(59,130,246,.2)') : 'rgba(255,255,255,.05)', color: c === 0 ? '#fb923c' : '#60a5fa', border: `1px solid ${c === 0 ? '#f9731644' : '#3b82f644'}`, borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit', fontSize: 11, fontWeight: mode === c ? 700 : 400 }}>
              {c === 0 ? '● Třída B' : '● Třída A'}
            </button>
          ))}
          <label style={{ fontSize: 10, color: C.sec, display: 'flex', alignItems: 'center', gap: 4 }}>
            Práh τ:
            <input type="range" min={0.1} max={0.9} step={0.05} value={threshold}
              onChange={e => { setThreshold(+e.target.value); threshRef.current = +e.target.value }}
              style={{ width: 60, accentColor }} />
            <span style={{ color: '#f59e0b', minWidth: 28 }}>{threshold.toFixed(2)}</span>
          </label>
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

export function LogisticRegressionInfo({ color }: { color: string }) {
  return (
    <>
      <p style={{ fontSize: 12, color: '#cbd5e1', lineHeight: 1.75, margin: '0 0 12px' }}>
        Logistická regrese klasifikuje body do dvou tříd pomocí sigmoid funkce.
        Výstupem je <strong style={{ color }}>pravděpodobnost</strong> příslušnosti ke třídě.
      </p>
      <div style={{ background: '#0d1117', borderRadius: 7, padding: '10px 12px', fontFamily: 'monospace', fontSize: 10.5, color: '#94a3b8', lineHeight: 2, marginBottom: 12 }}>
        <div>P(y=1) = <span style={{ color }}> σ(w₀x + w₁y + b)</span></div>
        <div>Loss = <span style={{ color: '#f59e0b' }}>−Σ[y·log(ŷ) + (1−y)·log(1−ŷ)]</span></div>
        <div>Hranice: <span style={{ color }}>w₀x + w₁y + b = 0</span></div>
      </div>
      <div style={{ padding: '8px 10px', background: 'rgba(251,191,36,.05)', border: '1px solid rgba(251,191,36,.15)', borderRadius: 8, marginBottom: 12 }}>
        <p style={{ fontSize: 11, color: '#fcd34d', margin: 0, lineHeight: 1.65 }}>
          💡 Bílá čára = rozhodovací hranice. ⭕ = chybná predikce.<br />
          Posuň slider τ (práh) a sleduj jak se mění hranice klasifikace.
        </p>
      </div>
      <div style={{ padding: '8px 10px', background: `rgba(99,102,241,.08)`, border: `1px solid rgba(99,102,241,.2)`, borderRadius: 8 }}>
        <div style={{ fontSize: 10, color: '#a5b4fc', lineHeight: 1.6 }}>
          👆 Klikej do grafu pro přidání bodů třídy A nebo B.<br />
          Vyzkoušej přidat body které nelze lineárně oddělit!
        </div>
      </div>
    </>
  )
}
