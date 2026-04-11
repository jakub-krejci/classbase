'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef, useState } from 'react'

const C = { bg:'#090B10', card:'#11141D', border:'rgba(255,255,255,0.07)', txt:'#fff', sec:'#8892a4' }

// ── Linear Regression Sim ──────────────────────────────────────────────────────
// Axes: x = "Plocha (m²)", y = "Cena (mil. Kč)"
// Points are added by clicking. Animated gradient descent fits the line.

interface Point { x: number; y: number }

function toCanvas(p: Point, W: number, H: number, PAD: number) {
  return { cx: PAD + p.x * (W - PAD * 2), cy: H - PAD - p.y * (H - PAD * 2) }
}
function fromCanvas(cx: number, cy: number, W: number, H: number, PAD: number) {
  return { x: (cx - PAD) / (W - PAD * 2), y: (H - PAD - cy) / (H - PAD * 2) }
}

export function LinearRegressionSim({ canvasSize, accentColor }: { canvasSize: { w: number; h: number }; accentColor: string }) {
  const cvRef = useRef<HTMLCanvasElement>(null)
  const st = useRef({
    points: [] as Point[],
    a: 0.5, b: 0.1,   // y = a*x + b
    targetA: 0.5, targetB: 0.1,
    mse: 0,
    animA: 0.5, animB: 0.1,
    training: false,
    iter: 0,
    lrSlider: 0.15,
  })
  const rafRef = useRef(0)
  const [mse, setMse] = useState(0)
  const [equation, setEquation] = useState('y = 0.50x + 0.10')
  const [iter, setIter] = useState(0)
  const [lr, setLr] = useState(0.15)
  const lrRef = useRef(0.15)
  const [points, setPoints] = useState(0)
  const [showResiduals, setShowResiduals] = useState(true)

  const W = canvasSize.w, H = canvasSize.h
  const PAD = Math.min(60, W * 0.1)

  // Pre-populate with house price demo data
  useEffect(() => {
    const demo: Point[] = [
      {x:0.18,y:0.22},{x:0.25,y:0.28},{x:0.32,y:0.38},{x:0.40,y:0.42},
      {x:0.48,y:0.50},{x:0.55,y:0.55},{x:0.63,y:0.68},{x:0.70,y:0.72},
      {x:0.78,y:0.80},{x:0.85,y:0.88},{x:0.15,y:0.30},{x:0.42,y:0.35},
      {x:0.60,y:0.75},{x:0.72,y:0.62},{x:0.35,y:0.45},
    ]
    st.current.points = demo
    // init line
    st.current.a = 0.05; st.current.b = 0.8
    st.current.animA = 0.05; st.current.animB = 0.8
    setPoints(demo.length)
  }, [])

  // Gradient descent step
  const gdStep = () => {
    const { points: pts, animA: a, animB: b } = st.current
    if (pts.length < 2) return
    const n = pts.length
    let dA = 0, dB = 0, mseSum = 0
    pts.forEach(p => {
      const pred = a * p.x + b
      const err = pred - p.y
      dA += err * p.x
      dB += err
      mseSum += err * err
    })
    const lr2 = lrRef.current
    st.current.animA = a - lr2 * dA / n
    st.current.animB = b - lr2 * dB / n
    st.current.mse = mseSum / n
    st.current.iter++
  }

  useEffect(() => {
    const cv = cvRef.current; if (!cv) return
    const ctx = cv.getContext('2d')!

    let frame = 0
    const draw = () => {
      // Do gradient descent step every few frames
      frame++
      if (st.current.points.length >= 2 && frame % 2 === 0) {
        gdStep()
        if (frame % 20 === 0) {
          setMse(+st.current.mse.toFixed(4))
          setEquation(`y = ${st.current.animA.toFixed(3)}x + ${st.current.animB.toFixed(3)}`)
          setIter(st.current.iter)
        }
      }

      ctx.clearRect(0, 0, W, H)

      // Background grid
      ctx.strokeStyle = 'rgba(255,255,255,0.04)'; ctx.lineWidth = 1
      for (let i = 0; i <= 10; i++) {
        const gx = PAD + i * (W - PAD * 2) / 10
        const gy = PAD + i * (H - PAD * 2) / 10
        ctx.beginPath(); ctx.moveTo(gx, PAD); ctx.lineTo(gx, H - PAD); ctx.stroke()
        ctx.beginPath(); ctx.moveTo(PAD, gy); ctx.lineTo(W - PAD, gy); ctx.stroke()
      }

      // Axes
      ctx.strokeStyle = 'rgba(255,255,255,0.2)'; ctx.lineWidth = 1.5
      ctx.beginPath(); ctx.moveTo(PAD, PAD); ctx.lineTo(PAD, H - PAD); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(PAD, H - PAD); ctx.lineTo(W - PAD, H - PAD); ctx.stroke()

      // Axis labels
      ctx.fillStyle = C.sec; ctx.font = '10px sans-serif'
      for (let i = 0; i <= 5; i++) {
        const v = i / 5
        const gx = PAD + v * (W - PAD * 2)
        const gy = H - PAD - v * (H - PAD * 2)
        ctx.textAlign = 'center'
        ctx.fillText(`${(20 + v * 80).toFixed(0)}m²`, gx, H - PAD + 14)
        ctx.textAlign = 'right'
        ctx.fillText(`${(v * 5).toFixed(1)} M`, PAD - 4, gy + 3)
      }
      ctx.textAlign = 'center'
      ctx.fillText('Plocha bytu', W / 2, H - 6)
      ctx.save(); ctx.translate(12, H / 2); ctx.rotate(-Math.PI / 2)
      ctx.fillText('Cena (mil. Kč)', 0, 0); ctx.restore()

      const { animA: a, animB: b } = st.current

      // Regression line
      if (st.current.points.length >= 2) {
        const x0 = 0, x1 = 1
        const y0 = a * x0 + b, y1 = a * x1 + b
        const p0 = toCanvas({ x: x0, y: y0 }, W, H, PAD)
        const p1 = toCanvas({ x: x1, y: y1 }, W, H, PAD)

        // Gradient fill under line
        const grad = ctx.createLinearGradient(p0.cx, p0.cy, p1.cx, p1.cy)
        grad.addColorStop(0, accentColor + '11')
        grad.addColorStop(1, accentColor + '22')
        ctx.beginPath()
        ctx.moveTo(p0.cx, p0.cy)
        ctx.lineTo(p1.cx, p1.cy)
        ctx.lineTo(p1.cx, H - PAD)
        ctx.lineTo(p0.cx, H - PAD)
        ctx.closePath()
        ctx.fillStyle = grad; ctx.fill()

        // Line
        ctx.beginPath(); ctx.moveTo(p0.cx, p0.cy); ctx.lineTo(p1.cx, p1.cy)
        ctx.strokeStyle = accentColor; ctx.lineWidth = 2.5; ctx.stroke()
      }

      // Residuals (vertical error lines)
      if (showResiduals) {
        st.current.points.forEach(p => {
          const pred = a * p.x + b
          const { cx, cy } = toCanvas(p, W, H, PAD)
          const { cy: predCy } = toCanvas({ x: p.x, y: pred }, W, H, PAD)
          const err = Math.abs(pred - p.y)
          ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx, predCy)
          ctx.strokeStyle = err > 0.1 ? '#ef444488' : '#22c55e88'
          ctx.lineWidth = 1.5; ctx.setLineDash([3, 2]); ctx.stroke(); ctx.setLineDash([])
        })
      }

      // Data points
      st.current.points.forEach(p => {
        const { cx, cy } = toCanvas(p, W, H, PAD)
        ctx.beginPath(); ctx.arc(cx, cy, 5, 0, Math.PI * 2)
        ctx.fillStyle = '#fff'; ctx.fill()
        ctx.strokeStyle = accentColor; ctx.lineWidth = 2; ctx.stroke()
      })

      // MSE label
      if (st.current.points.length >= 2) {
        const mseColor = st.current.mse < 0.005 ? '#22c55e' : st.current.mse < 0.02 ? '#f59e0b' : '#ef4444'
        ctx.fillStyle = mseColor; ctx.font = 'bold 11px monospace'; ctx.textAlign = 'left'
        ctx.fillText(`MSE: ${st.current.mse.toFixed(4)}`, PAD + 4, PAD - 8)
      }

      rafRef.current = requestAnimationFrame(draw)
    }
    rafRef.current = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(rafRef.current)
  }, [W, H, PAD, showResiduals, accentColor])

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = cvRef.current!.getBoundingClientRect()
    const scaleX = W / rect.width, scaleY = H / rect.height
    const cx = (e.clientX - rect.left) * scaleX
    const cy = (e.clientY - rect.top) * scaleY
    if (cx < PAD || cx > W - PAD || cy < PAD || cy > H - PAD) return
    const p = fromCanvas(cx, cy, W, H, PAD)
    if (p.x < 0 || p.x > 1 || p.y < 0 || p.y > 1) return
    st.current.points.push(p)
    st.current.iter = 0
    setPoints(st.current.points.length)
  }

  const reset = () => {
    st.current.points = []
    st.current.animA = 0.5; st.current.animB = 0.1
    st.current.iter = 0; st.current.mse = 0
    setPoints(0); setMse(0); setIter(0)
    setEquation('y = 0.50x + 0.10')
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%' }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '7px 14px', borderBottom: `1px solid ${C.border}`, flexShrink: 0, background: C.card, flexWrap: 'wrap' as const }}>
        <code style={{ fontSize: 13, color: accentColor, fontFamily: 'monospace', fontWeight: 700 }}>{equation}</code>
        <div style={{ display: 'flex', gap: 14, fontSize: 11, color: C.sec }}>
          <span>MSE: <strong style={{ color: mse < 0.005 ? '#22c55e' : mse < 0.02 ? '#f59e0b' : '#ef4444' }}>{mse.toFixed(4)}</strong></span>
          <span>Iterace: <strong style={{ color: C.txt }}>{iter}</strong></span>
          <span>Body: <strong style={{ color: C.txt }}>{points}</strong></span>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          <label style={{ fontSize: 10, color: C.sec, display: 'flex', alignItems: 'center', gap: 5 }}>
            <input type="checkbox" checked={showResiduals} onChange={e => setShowResiduals(e.target.checked)} style={{ accentColor }} />
            Residua
          </label>
          <label style={{ fontSize: 10, color: C.sec, display: 'flex', alignItems: 'center', gap: 5 }}>
            η (lr):
            <input type="range" min={0.02} max={0.5} step={0.01} value={lr}
              onChange={e => { setLr(+e.target.value); lrRef.current = +e.target.value }}
              style={{ width: 60, accentColor }} />
            <span style={{ color: C.txt, minWidth: 28 }}>{lr.toFixed(2)}</span>
          </label>
          <button onClick={reset} style={{ padding: '3px 10px', background: 'rgba(255,255,255,.07)', color: C.sec, border: `1px solid ${C.border}`, borderRadius: 6, cursor: 'pointer', fontSize: 11, fontFamily: 'inherit' }}>
            🗑 Reset
          </button>
        </div>
      </div>
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <canvas ref={cvRef} width={W} height={H - 42} onClick={handleClick}
          style={{ width: '100%', height: '100%', cursor: 'crosshair' }} />
        {points === 0 && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
            <div style={{ textAlign: 'center', color: C.sec }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>👆</div>
              <div style={{ fontSize: 13 }}>Klikni do grafu pro přidání bodů</div>
              <div style={{ fontSize: 11, marginTop: 4 }}>nebo počkej na demo data</div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Info panel content for Linear Regression ───────────────────────────────────
export function LinearRegressionInfo({ color }: { color: string }) {
  return (
    <>
      <p style={{ fontSize: 12, color: '#cbd5e1', lineHeight: 1.75, margin: '0 0 12px' }}>
        Lineární regrese hledá přímku y = ax + b, která nejlépe proloží datové body.
        Minimalizuje součet čtverců odchylek (<strong style={{ color }}>MSE</strong>).
      </p>
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 9, fontWeight: 700, color: '#8892a4', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 7 }}>Gradient descent</div>
        <div style={{ background: '#0d1117', borderRadius: 7, padding: '10px 12px', fontFamily: 'monospace', fontSize: 10.5, color: '#94a3b8', lineHeight: 2 }}>
          <div>MSE = <span style={{ color: '#f59e0b' }}>1/n · Σ(ŷᵢ − yᵢ)²</span></div>
          <div>a ← a − <span style={{ color }}>η</span> · ∂MSE/∂a</div>
          <div>b ← b − <span style={{ color }}>η</span> · ∂MSE/∂b</div>
          <div style={{ marginTop: 4, color: '#475569' }}><span style={{ color }}>η</span> = learning rate (slider)</div>
        </div>
      </div>
      <div style={{ padding: '8px 10px', background: 'rgba(251,191,36,.05)', border: '1px solid rgba(251,191,36,.15)', borderRadius: 8, marginBottom: 12 }}>
        <p style={{ fontSize: 11, color: '#fcd34d', margin: 0, lineHeight: 1.65 }}>
          💡 Červené residuální čáry = chyba predikce. Čím kratší, tím lepší model.<br />
          Zkus změnit learning rate — příliš velké způsobí nestabilitu!
        </p>
      </div>
      <div style={{ padding: '8px 10px', background: `rgba(99,102,241,.08)`, border: `1px solid rgba(99,102,241,.2)`, borderRadius: 8 }}>
        <div style={{ fontSize: 10, color: '#a5b4fc', lineHeight: 1.6 }}>
          👆 <strong>Klikej do grafu</strong> pro přidání vlastních bodů.<br />
          Sleduj jak se přímka přizpůsobuje a MSE klesá.
        </div>
      </div>
    </>
  )
}
