'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */
/* ============================================================
   MNIST Neuronová síť – interaktivní vizualizace
   Architektura: 784 → 16 → 16 → 10
   Toy engine: Forward + Backpropagation v čistém JS
   ============================================================ */

import { useState, useEffect, useRef, useCallback } from 'react'

// ── Konstanty architektury ────────────────────────────────────────────────────
const INPUT_SIZE  = 784   // 28×28 pixelů
const HIDDEN1     = 16    // první skrytá vrstva
const HIDDEN2     = 16    // druhá skrytá vrstva
const OUTPUT_SIZE = 10    // čísla 0–9
const LEARN_RATE  = 0.05

// ── Matematické utility ───────────────────────────────────────────────────────
const relu     = (x: number) => Math.max(0, x)
const reluD    = (x: number) => x > 0 ? 1 : 0
const sigmoid  = (x: number) => 1 / (1 + Math.exp(-x))
const sigmoidD = (y: number) => y * (1 - y)

/** Softmax – výstupní vrstva (pravděpodobnosti) */
function softmax(arr: number[]): number[] {
  const max = Math.max(...arr)
  const exps = arr.map(x => Math.exp(x - max))
  const sum = exps.reduce((a, b) => a + b, 0)
  return exps.map(e => e / sum)
}

/** Xavier inicializace vah */
function xavier(rows: number, cols: number): number[][] {
  const limit = Math.sqrt(6 / (rows + cols))
  return Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => (Math.random() * 2 - 1) * limit)
  )
}

/** Náhodný vektor biasů */
const randBias = (n: number) => Array.from({ length: n }, () => (Math.random() - 0.5) * 0.1)

/** Maticový součin vektoru × matice */
function dotVecMat(vec: number[], mat: number[][]): number[] {
  return mat.map(row => row.reduce((s, w, i) => s + w * vec[i], 0))
}

// ── Typ sítě ──────────────────────────────────────────────────────────────────
interface Network {
  W1: number[][]   // [HIDDEN1 × INPUT_SIZE]
  b1: number[]
  W2: number[][]   // [HIDDEN2 × HIDDEN1]
  b2: number[]
  W3: number[][]   // [OUTPUT_SIZE × HIDDEN2]
  b3: number[]
}

/** Vytvoř novou náhodnou síť */
function makeNetwork(): Network {
  return {
    W1: xavier(HIDDEN1, INPUT_SIZE), b1: randBias(HIDDEN1),
    W2: xavier(HIDDEN2, HIDDEN1),    b2: randBias(HIDDEN2),
    W3: xavier(OUTPUT_SIZE, HIDDEN2),b3: randBias(OUTPUT_SIZE),
  }
}

/** Forward propagation – vrátí aktivace všech vrstev */
function forward(net: Network, inputs: number[]) {
  // Skrytá vrstva 1 – ReLU
  const z1 = net.W1.map((row, i) => row.reduce((s, w, j) => s + w * inputs[j], 0) + net.b1[i])
  const a1 = z1.map(relu)
  // Skrytá vrstva 2 – ReLU
  const z2 = net.W2.map((row, i) => row.reduce((s, w, j) => s + w * a1[j], 0) + net.b2[i])
  const a2 = z2.map(relu)
  // Výstupní vrstva – Softmax
  const z3 = net.W3.map((row, i) => row.reduce((s, w, j) => s + w * a2[j], 0) + net.b3[i])
  const a3 = softmax(z3)
  return { z1, a1, z2, a2, z3, a3 }
}

/** Backpropagation – vrátí novou aktualizovanou síť + ztrátu */
function backprop(
  net: Network,
  inputs: number[],
  target: number,   // správná třída 0–9
  { z1, a1, z2, a2, a3 }: ReturnType<typeof forward>
): { net: Network; loss: number } {
  // Ztráta – Cross-Entropy
  const loss = -Math.log(Math.max(a3[target], 1e-9))

  // Δ výstupu (softmax + cross-entropy derivace)
  const dz3 = a3.map((p, i) => p - (i === target ? 1 : 0))

  // Gradienty W3, b3
  const dW3 = dz3.map(d => a2.map(a => d * a))
  const db3 = [...dz3]

  // Δ skrytá vrstva 2
  const da2 = a2.map((_, j) => dz3.reduce((s, d, i) => s + d * net.W3[i][j], 0))
  const dz2 = da2.map((d, i) => d * reluD(z2[i]))

  // Gradienty W2, b2
  const dW2 = dz2.map(d => a1.map(a => d * a))
  const db2 = [...dz2]

  // Δ skrytá vrstva 1
  const da1 = a1.map((_, j) => dz2.reduce((s, d, i) => s + d * net.W2[i][j], 0))
  const dz1 = da1.map((d, i) => d * reluD(z1[i]))

  // Gradienty W1, b1
  const dW1 = dz1.map(d => inputs.map(x => d * x))
  const db1 = [...dz1]

  // Aktualizace gradient descent
  const upd = (w: number[][], dw: number[][]) =>
    w.map((row, i) => row.map((v, j) => v - LEARN_RATE * dw[i][j]))
  const updV = (b: number[], db: number[]) => b.map((v, i) => v - LEARN_RATE * db[i])

  return {
    loss,
    net: {
      W1: upd(net.W1, dW1), b1: updV(net.b1, db1),
      W2: upd(net.W2, dW2), b2: updV(net.b2, db2),
      W3: upd(net.W3, dW3), b3: updV(net.b3, db3),
    },
  }
}

/** Zmenší 280×280 canvas na 28×28 float[] */
function sampleCanvas(canvas: HTMLCanvasElement): number[] {
  const ctx = canvas.getContext('2d')!
  const imgData = ctx.getImageData(0, 0, 280, 280)
  const result: number[] = []
  for (let row = 0; row < 28; row++) {
    for (let col = 0; col < 28; col++) {
      let sum = 0
      for (let dy = 0; dy < 10; dy++) {
        for (let dx = 0; dx < 10; dx++) {
          const px = ((row * 10 + dy) * 280 + (col * 10 + dx)) * 4
          sum += imgData.data[px] / 255  // R-kanál (grayscale)
        }
      }
      result.push(sum / 100)
    }
  }
  return result
}

// ── Typ animované částice ────────────────────────────────────────────────────
interface Particle {
  id: number; x: number; y: number; tx: number; ty: number
  t: number; color: string; reverse: boolean
}

// ── Vizuální layout sítě ──────────────────────────────────────────────────────
const NET_W = 620, NET_H = 420
const LAYER_X = [80, 220, 400, 570]

function layerY(layerIdx: number, nodeIdx: number, total: number): number {
  const spacing = Math.min((NET_H - 40) / total, 34)
  return NET_H / 2 - ((total - 1) * spacing) / 2 + nodeIdx * spacing + 20
}

// Reprezentativní vzorky z 784 vstupů pro vizualizaci
const SAMPLE_INPUTS = Array.from({ length: 20 }, (_, i) => Math.floor(i * 784 / 20))

// ── Barvy ─────────────────────────────────────────────────────────────────────
const NEON_GREEN = '#39ff14'
const NEON_BLUE  = '#00f5ff'
const NEON_PINK  = '#ff2d78'
const NEON_GOLD  = '#ffd700'

// ═══════════════════════════════════════════════════════════════════════════════
//  HLAVNÍ KOMPONENTA
// ═══════════════════════════════════════════════════════════════════════════════
export default function MNISTSim() {
  // ── Stav sítě ────────────────────────────────────────────────────────────────
  const [net, setNet]             = useState<Network>(() => makeNetwork())
  const [inputs, setInputs]       = useState<number[]>(Array(INPUT_SIZE).fill(0))
  const [activations, setActs]    = useState<ReturnType<typeof forward> | null>(null)
  const [prediction, setPred]     = useState<number | null>(null)
  const [confidence, setConf]     = useState<number[]>(Array(OUTPUT_SIZE).fill(0.1))
  const [correctLabel, setCorr]   = useState<number | null>(null)
  const [loss, setLoss]           = useState<number[]>([])
  const [accuracy, setAcc]        = useState<number[]>([])
  const [trainCount, setTrain]    = useState(0)
  const [activePanel, setPanel]   = useState(0)

  // ── Animační stav ─────────────────────────────────────────────────────────────
  const [particles, setParticles] = useState<Particle[]>([])
  const [backAnim, setBackAnim]   = useState(false)
  const [shake, setShake]         = useState(false)
  const [highlight, setHighlight] = useState<number[]>([])
  const partIdRef = useRef(0)
  const rafRef    = useRef(0)
  const particlesRef = useRef<Particle[]>([])

  // ── Canvas kreslení ──────────────────────────────────────────────────────────
  const canvasRef    = useRef<HTMLCanvasElement>(null)
  const netCanvasRef = useRef<HTMLCanvasElement>(null)
  const isDrawing    = useRef(false)
  const lastPos      = useRef<{ x: number; y: number } | null>(null)

  // ── Animace částic ───────────────────────────────────────────────────────────
  useEffect(() => {
    let running = true
    const step = () => {
      if (!running) return
      particlesRef.current = particlesRef.current
        .map(p => ({ ...p, t: p.t + (p.reverse ? -0.025 : 0.025) }))
        .filter(p => p.reverse ? p.t > 0 : p.t < 1)
      setParticles([...particlesRef.current])
      rafRef.current = requestAnimationFrame(step)
    }
    rafRef.current = requestAnimationFrame(step)
    return () => { running = false; cancelAnimationFrame(rafRef.current) }
  }, [])

  // ── Spuštění forward pass animace ────────────────────────────────────────────
  const launchForwardParticles = useCallback((layerPairs: [number,number,number,number,string][]) => {
    const newParts: Particle[] = layerPairs.map(([x1,y1,x2,y2,col]) => ({
      id: partIdRef.current++, x:x1, y:y1, tx:x2, ty:y2,
      t: -(Math.random() * 0.4), color: col, reverse: false,
    }))
    particlesRef.current = [...particlesRef.current, ...newParts]
    setParticles([...particlesRef.current])
  }, [])

  // ── Kreslení na canvas ────────────────────────────────────────────────────────
  const getPos = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  const runNetwork = useCallback((inputs: number[]) => {
    const acts = forward(net, inputs)
    setActs(acts)
    setConf(acts.a3)
    const pred = acts.a3.indexOf(Math.max(...acts.a3))
    setPred(pred)

    // Spusť forward animaci
    const pairs: [number,number,number,number,string][] = []
    // Vstup → H1
    SAMPLE_INPUTS.forEach((si, vi) => {
      const x1 = LAYER_X[0], y1 = layerY(0, vi, SAMPLE_INPUTS.length)
      acts.a1.slice(0, 8).forEach((a, hi) => {
        if (Math.abs(a) > 0.1) {
          pairs.push([x1, y1, LAYER_X[1], layerY(1, hi, HIDDEN1), NEON_BLUE])
        }
      })
    })
    // H1 → H2
    acts.a1.slice(0, 8).forEach((a1v, i) => {
      if (a1v > 0.2) acts.a2.forEach((_, j) => {
        if (j < 8) pairs.push([LAYER_X[1], layerY(1, i, HIDDEN1), LAYER_X[2], layerY(2, j, HIDDEN2), NEON_GREEN])
      })
    })
    // H2 → Výstup
    acts.a2.slice(0, 8).forEach((a2v, i) => {
      if (a2v > 0.2) {
        pairs.push([LAYER_X[2], layerY(2, i, HIDDEN2), LAYER_X[3], layerY(3, pred, OUTPUT_SIZE), NEON_GOLD])
      }
    })
    launchForwardParticles(pairs.slice(0, 60))
  }, [net, launchForwardParticles])

  const draw = useCallback((x: number, y: number) => {
    const cv = canvasRef.current; if (!cv) return
    const ctx = cv.getContext('2d')!
    ctx.lineWidth = 22; ctx.lineCap = 'round'
    ctx.strokeStyle = 'white'
    ctx.beginPath()
    if (lastPos.current) { ctx.moveTo(lastPos.current.x, lastPos.current.y) }
    else { ctx.moveTo(x, y) }
    ctx.lineTo(x, y); ctx.stroke()
    lastPos.current = { x, y }

    // Aktualizuj vstupy a spusť síť
    const newInputs = sampleCanvas(cv)
    setInputs(newInputs)
    runNetwork(newInputs)
  }, [runNetwork])

  const onMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    isDrawing.current = true; lastPos.current = null; draw(...Object.values(getPos(e)) as [number,number])
  }
  const onMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => { if (isDrawing.current) draw(...Object.values(getPos(e)) as [number,number]) }
  const onMouseUp   = () => { isDrawing.current = false; lastPos.current = null }

  const clearCanvas = () => {
    const cv = canvasRef.current; if (!cv) return
    cv.getContext('2d')!.clearRect(0, 0, 280, 280)
    setInputs(Array(INPUT_SIZE).fill(0)); setActs(null); setPred(null); setConf(Array(OUTPUT_SIZE).fill(0.1)); setCorrect(null)
  }
  const setCorrect = (v: number | null) => { setCorr(v) }

  // ── Backpropagation ──────────────────────────────────────────────────────────
  const doBackprop = useCallback(() => {
    if (correctLabel === null || !activations) return
    setBackAnim(true); setShake(true)

    // Animace zpětného toku
    const reverseParts: [number,number,number,number,string][] = []
    for (let i = 0; i < 8; i++) {
      reverseParts.push([LAYER_X[3], layerY(3, correctLabel, OUTPUT_SIZE), LAYER_X[2], layerY(2, i, HIDDEN2), NEON_PINK])
      reverseParts.push([LAYER_X[2], layerY(2, i, HIDDEN2), LAYER_X[1], layerY(1, i, HIDDEN1), NEON_PINK])
    }
    const bpParts: Particle[] = reverseParts.map(([x1,y1,x2,y2,col]) => ({
      id: partIdRef.current++, x:x1, y:y1, tx:x2, ty:y2, t:1, color:col, reverse:true,
    }))
    particlesRef.current = [...particlesRef.current, ...bpParts]

    // Spusť backprop
    const { net: newNet, loss: l } = backprop(net, inputs, correctLabel, activations)
    setNet(newNet)

    // Aktualizuj metriky
    const isCorrect = prediction === correctLabel
    setLoss(prev => [...prev.slice(-29), l])
    setAcc(prev => [...prev.slice(-29), isCorrect ? 1 : 0])
    setTrain(t => t + 1)

    // Highlight upravených neuronů
    setHighlight(Array.from({ length: HIDDEN1 }, (_, i) => i))
    setTimeout(() => { setBackAnim(false); setShake(false); setHighlight([]) }, 2500)

    // Spusť znovu forward s novou sítí
    setTimeout(() => {
      const newActs = forward(newNet, inputs)
      setActs(newActs); setConf(newActs.a3)
      setPred(newActs.a3.indexOf(Math.max(...newActs.a3)))
    }, 1200)
  }, [correctLabel, activations, net, inputs, prediction])

  // ── Kreslení neuronové sítě na canvas ────────────────────────────────────────
  useEffect(() => {
    const cv = netCanvasRef.current; if (!cv) return
    const ctx = cv.getContext('2d')!
    ctx.clearRect(0, 0, NET_W, NET_H)

    // ── Pozadí a mřížka ──────────────────────────────────────────────────────
    ctx.fillStyle = '#0a0e1a'; ctx.fillRect(0, 0, NET_W, NET_H)

    // ── Spoje vstupy → H1 ────────────────────────────────────────────────────
    SAMPLE_INPUTS.forEach((si, vi) => {
      const x1 = LAYER_X[0], y1 = layerY(0, vi, SAMPLE_INPUTS.length)
      for (let hi = 0; hi < HIDDEN1; hi++) {
        const w = net.W1[hi][si]
        const a = activations?.a1[hi] ?? 0
        const opacity = Math.min(0.6, Math.abs(w) * 0.4 + 0.05) * (backAnim ? 0.3 : 1)
        const col = w > 0 ? `rgba(0,245,255,${opacity})` : `rgba(255,45,120,${opacity})`
        ctx.strokeStyle = col; ctx.lineWidth = Math.min(2, Math.abs(w) * 1.5 + 0.3)
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(LAYER_X[1], layerY(1, hi, HIDDEN1)); ctx.stroke()
      }
    })

    // ── Spoje H1 → H2 ────────────────────────────────────────────────────────
    for (let i = 0; i < HIDDEN1; i++) {
      for (let j = 0; j < HIDDEN2; j++) {
        const w = net.W2[j][i]
        const opacity = Math.min(0.55, Math.abs(w) * 0.35 + 0.04) * (backAnim ? 0.35 : 1)
        const col = w > 0 ? `rgba(57,255,20,${opacity})` : `rgba(255,215,0,${opacity})`
        ctx.strokeStyle = col; ctx.lineWidth = Math.min(1.8, Math.abs(w) * 1.2 + 0.2)
        // Třesení při backpropu
        const jitter = backAnim ? (Math.random() - 0.5) * 2 : 0
        ctx.beginPath()
        ctx.moveTo(LAYER_X[1], layerY(1, i, HIDDEN1) + jitter)
        ctx.lineTo(LAYER_X[2], layerY(2, j, HIDDEN2) + jitter)
        ctx.stroke()
      }
    }

    // ── Spoje H2 → výstup ────────────────────────────────────────────────────
    for (let i = 0; i < HIDDEN2; i++) {
      for (let j = 0; j < OUTPUT_SIZE; j++) {
        const w = net.W3[j][i]
        const opacity = Math.min(0.6, Math.abs(w) * 0.4 + 0.05)
        const isWinner = prediction === j
        const col = isWinner ? `rgba(255,215,0,${opacity+0.2})` : w > 0 ? `rgba(57,255,20,${opacity})` : `rgba(255,45,120,${opacity})`
        ctx.strokeStyle = col; ctx.lineWidth = isWinner ? 2 : Math.min(1.5, Math.abs(w) * 1.2 + 0.2)
        ctx.beginPath(); ctx.moveTo(LAYER_X[2], layerY(2, i, HIDDEN2)); ctx.lineTo(LAYER_X[3], layerY(3, j, OUTPUT_SIZE)); ctx.stroke()
      }
    }

    // ── Vstupní neurony (vzorky) ──────────────────────────────────────────────
    SAMPLE_INPUTS.forEach((si, vi) => {
      const x = LAYER_X[0], y = layerY(0, vi, SAMPLE_INPUTS.length)
      const v = inputs[si]
      ctx.beginPath(); ctx.arc(x, y, 7, 0, Math.PI * 2)
      ctx.fillStyle = v > 0.1 ? `rgba(0,245,255,${0.3 + v * 0.7})` : '#1a2035'
      ctx.fill(); ctx.strokeStyle = NEON_BLUE + '66'; ctx.lineWidth = 1; ctx.stroke()
    })
    ctx.fillStyle = '#64748b'; ctx.font = '9px monospace'; ctx.textAlign = 'center'
    ctx.fillText('784 vstupů', LAYER_X[0], NET_H - 6)

    // ── Skrytá vrstva 1 ───────────────────────────────────────────────────────
    for (let i = 0; i < HIDDEN1; i++) {
      const x = LAYER_X[1], y = layerY(1, i, HIDDEN1)
      const a = activations?.a1[i] ?? 0
      const isHL = highlight.includes(i)
      ctx.beginPath(); ctx.arc(x, y, 10, 0, Math.PI * 2)
      if (isHL) { ctx.shadowColor = NEON_GREEN; ctx.shadowBlur = 16 }
      ctx.fillStyle = a > 0.01 ? `rgba(57,255,20,${0.15 + a * 0.75})` : '#1a2035'
      ctx.fill()
      ctx.strokeStyle = isHL ? NEON_GREEN : (a > 0.3 ? NEON_GREEN + 'bb' : '#1e3a2a')
      ctx.lineWidth = isHL ? 2.5 : 1.5; ctx.stroke()
      ctx.shadowBlur = 0
      if (a > 0.05) {
        ctx.fillStyle = '#fff'; ctx.font = 'bold 7px monospace'; ctx.textAlign = 'center'
        ctx.fillText(a.toFixed(2), x, y + 3)
      }
    }
    ctx.fillStyle = '#64748b'; ctx.font = '9px monospace'; ctx.textAlign = 'center'
    ctx.fillText('Skrytá 1 (ReLU)', LAYER_X[1], NET_H - 6)

    // ── Skrytá vrstva 2 ───────────────────────────────────────────────────────
    for (let i = 0; i < HIDDEN2; i++) {
      const x = LAYER_X[2], y = layerY(2, i, HIDDEN2)
      const a = activations?.a2[i] ?? 0
      ctx.beginPath(); ctx.arc(x, y, 10, 0, Math.PI * 2)
      ctx.fillStyle = a > 0.01 ? `rgba(0,245,255,${0.15 + a * 0.75})` : '#1a2035'
      ctx.fill()
      ctx.strokeStyle = a > 0.3 ? NEON_BLUE + 'bb' : '#1a2e38'; ctx.lineWidth = 1.5; ctx.stroke()
      if (a > 0.05) {
        ctx.fillStyle = '#fff'; ctx.font = 'bold 7px monospace'; ctx.textAlign = 'center'
        ctx.fillText(a.toFixed(2), x, y + 3)
      }
    }
    ctx.fillStyle = '#64748b'; ctx.font = '9px monospace'; ctx.textAlign = 'center'
    ctx.fillText('Skrytá 2 (ReLU)', LAYER_X[2], NET_H - 6)

    // ── Výstupní vrstva ───────────────────────────────────────────────────────
    for (let i = 0; i < OUTPUT_SIZE; i++) {
      const x = LAYER_X[3], y = layerY(3, i, OUTPUT_SIZE)
      const p = confidence[i]
      const isWinner = prediction === i
      const isCorrect2 = correctLabel === i
      ctx.beginPath(); ctx.arc(x, y, 12, 0, Math.PI * 2)
      if (isWinner) { ctx.shadowColor = NEON_GOLD; ctx.shadowBlur = 20 }
      const col = isWinner ? `rgba(255,215,0,${0.2 + p * 0.8})`
        : isCorrect2 && correctLabel !== null ? `rgba(57,255,20,0.3)` : '#1a2035'
      ctx.fillStyle = col; ctx.fill()
      ctx.strokeStyle = isWinner ? NEON_GOLD : isCorrect2 && correctLabel !== null ? NEON_GREEN : '#1e293b'
      ctx.lineWidth = isWinner ? 2.5 : 1.5; ctx.stroke()
      ctx.shadowBlur = 0
      ctx.fillStyle = isWinner ? NEON_GOLD : '#e2e8f0'
      ctx.font = `bold ${isWinner ? 10 : 9}px monospace`; ctx.textAlign = 'center'
      ctx.fillText(String(i), x, y + 4)
      // Pravděpodobnost label vpravo
      ctx.fillStyle = isWinner ? NEON_GOLD : '#475569'; ctx.font = '8px monospace'
      ctx.textAlign = 'left'
      ctx.fillText(`${(p * 100).toFixed(0)}%`, x + 18, y + 3)
    }
    ctx.fillStyle = '#64748b'; ctx.font = '9px monospace'; ctx.textAlign = 'center'
    ctx.fillText('Výstup 0–9 (Softmax)', LAYER_X[3], NET_H - 6)

    // ── Animované částice ─────────────────────────────────────────────────────
    particles.forEach(p => {
      const t = Math.max(0, Math.min(1, p.t))
      if (t <= 0) return
      const px = p.x + (p.tx - p.x) * t, py = p.y + (p.ty - p.y) * t
      const alpha = t < 0.1 ? t * 10 : t > 0.85 ? (1 - t) * 6.67 : 1
      ctx.beginPath(); ctx.arc(px, py, 3.5, 0, Math.PI * 2)
      ctx.fillStyle = p.color + Math.round(alpha * 200).toString(16).padStart(2, '0')
      ctx.shadowColor = p.color; ctx.shadowBlur = 8; ctx.fill(); ctx.shadowBlur = 0
    })

    // ── Šipky toku ────────────────────────────────────────────────────────────
    if (activations) {
      ['→','→','→'].forEach((arr, i) => {
        ctx.fillStyle = '#334155'; ctx.font = '14px sans-serif'; ctx.textAlign = 'center'
        ctx.fillText(arr, (LAYER_X[i] + LAYER_X[i+1]) / 2, NET_H / 2)
      })
    }

    // Nadpisy vrstev nahoře
    ctx.fillStyle = NEON_BLUE + 'aa'; ctx.font = 'bold 10px monospace'; ctx.textAlign = 'center'
    ctx.fillText('INPUT', LAYER_X[0], 14)
    ctx.fillStyle = NEON_GREEN + 'aa'; ctx.fillText('HIDDEN 1', LAYER_X[1], 14)
    ctx.fillStyle = NEON_BLUE + 'aa'; ctx.fillText('HIDDEN 2', LAYER_X[2], 14)
    ctx.fillStyle = NEON_GOLD + 'aa'; ctx.fillText('OUTPUT', LAYER_X[3], 14)
  }, [net, inputs, activations, particles, prediction, confidence, correctLabel, highlight, backAnim])

  // ── Vzdělávací panely ─────────────────────────────────────────────────────────
  const PANELS = [
    {
      title: 'Jak počítač vidí tvůj obrázek',
      subtitle: 'Vstupní vrstva (Input Layer) – „Oči sítě"',
      icon: '👁️',
      color: NEON_BLUE,
      text: 'Tvé nakreslené číslo jsme rozdělili na mřížku 28×28 malých čtverečků (pixelů). Každý pixel je pro síť jen číslo: 0 pro černou a 1 pro bílou. Celkem je to 784 čísel, která vstupují do sítě najednou.',
    },
    {
      title: 'Váhy (Weights) a cesty',
      subtitle: 'Váhy a spoje – „Důležitost signálu"',
      icon: '🔗',
      color: NEON_GREEN,
      text: 'Každá čára, kterou vidíš, má svou „váhu". Je to číslo, kterým se násobí signál z předchozího neuronu. Silnější, zářící čára znamená, že tento pixel je pro rozpoznání daného čísla velmi důležitý. Tenké čáry síť ignoruje.',
    },
    {
      title: 'Uvnitř neuronu (z = Σ w·x + b)',
      subtitle: 'Výpočet v neuronu – „Sčítání a Bias"',
      icon: '⚙️',
      color: NEON_GOLD,
      text: 'Neuron funguje jako malá sčítačka. Posčítá všechny přicházející signály vynásobené jejich vahami. K výsledku přičte Bias (předpětí) – to je taková vnitřní citlivost neuronu, která určuje, jak snadno se neuron „rozsvítí".',
    },
    {
      title: 'Funkce ReLU / Sigmoid',
      subtitle: 'Aktivační funkce – „Rozhodnutí"',
      icon: '⚡',
      color: NEON_PINK,
      text: 'Výsledek sčítání projde filtrem (aktivační funkcí). Pokud je výsledek nízký, neuron zůstane zhasnutý (vysílá 0). Pokud překročí určitou mez, „vystřelí" signál dál do další vrstvy. Tato nelinearita umožňuje síti učit se složité vzory.',
    },
    {
      title: 'Kdo vyhrál?',
      subtitle: 'Výstupní vrstva – „Pravděpodobnost"',
      icon: '🏆',
      color: NEON_GOLD,
      text: 'Posledních 10 neuronů reprezentuje číslice 0 až 9. Ten, který září nejvíc, má nejvyšší pravděpodobnost. Síť ti neříká „Je to sedmička", ale říká „Jsem si na 92 % jistá, že je to sedmička".',
    },
    {
      title: 'Oprava chyb (Backpropagation)',
      subtitle: 'Zpětné šíření – „Učení z chyb"',
      icon: '🔁',
      color: NEON_PINK,
      text: 'Když síť udělá chybu, podívá se, které neurony k té chybě přispěly nejvíce. Algoritmus pak projde síť pozpátku a jemně upraví váhy a biasy tak, aby příště byla chyba menší. Tomuto procesu se říká „Gradientní sestup".',
    },
  ]

  // ── Průměrná loss/accuracy ─────────────────────────────────────────────────
  const avgLoss = loss.length > 0 ? (loss.reduce((a,b)=>a+b,0)/loss.length).toFixed(3) : '—'
  const avgAcc  = accuracy.length > 0 ? `${Math.round(accuracy.reduce((a,b)=>a+b,0)/accuracy.length*100)}%` : '—'

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════════
  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', background:'#060b14', color:'#e2e8f0', fontFamily:'monospace', overflow:'hidden' }}>
      <style>{`
        @keyframes fadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
        @keyframes pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.7;transform:scale(1.05)}}
        @keyframes shake{0%,100%{transform:none}20%,60%{transform:translateX(-2px)}40%,80%{transform:translateX(2px)}}
        @keyframes glow{0%,100%{box-shadow:0 0 6px ${NEON_GREEN}55}50%{box-shadow:0 0 22px ${NEON_GREEN}cc}}
        .panel-fade{animation:fadeIn .3s ease}
        .shaking{animation:shake .4s infinite}
        .pulse-node{animation:pulse 1s ease-in-out infinite}
        .glow-border{animation:glow 1.5s ease-in-out infinite}
        input[type=range]{accentColor:${NEON_BLUE};cursor:pointer}
        ::-webkit-scrollbar{width:4px}::-webkit-scrollbar-thumb{background:#1e293b;border-radius:4px}
      `}</style>

      {/* ── Header ── */}
      <div style={{ padding:'10px 20px', borderBottom:'1px solid #1e293b', display:'flex', alignItems:'center', gap:14, flexShrink:0, background:'#080d18' }}>
        <a href="/student/simulations" style={{ color:'#64748b', fontSize:13, textDecoration:'none' }}>← Simulace</a>
        <div style={{ width:1, height:14, background:'#1e293b' }}/>
        <span style={{ fontSize:14, fontWeight:700, color:NEON_GREEN }}>🧠 MNIST Neural Network – Forward & Backpropagation</span>
        <div style={{ marginLeft:'auto', display:'flex', gap:16, fontSize:11 }}>
          <span style={{ color:'#475569' }}>Trénováno: <strong style={{ color:NEON_GREEN }}>{trainCount}×</strong></span>
          <span style={{ color:'#475569' }}>Avg Loss: <strong style={{ color:NEON_GOLD }}>{avgLoss}</strong></span>
          <span style={{ color:'#475569' }}>Avg Acc: <strong style={{ color:NEON_BLUE }}>{avgAcc}</strong></span>
        </div>
      </div>

      {/* ── Main layout ── */}
      <div style={{ flex:1, display:'flex', minHeight:0, overflow:'hidden', gap:0 }}>

        {/* ══ LEVÝ PANEL: kreslení ══ */}
        <div style={{ width:320, flexShrink:0, borderRight:'1px solid #1e293b', display:'flex', flexDirection:'column', background:'#080d18', overflow:'hidden' }}>

          {/* Canvas kreslení */}
          <div style={{ padding:'14px 14px 0', flexShrink:0 }}>
            <div style={{ fontSize:10, fontWeight:700, color:NEON_BLUE, textTransform:'uppercase', letterSpacing:'.08em', marginBottom:8 }}>
              ✏️ Nakresli číslici (0–9)
            </div>
            <div style={{ position:'relative', border:`2px solid ${NEON_BLUE}44`, borderRadius:10, overflow:'hidden', display:'inline-block', background:'#000' }}>
              <canvas ref={canvasRef} width={280} height={280}
                style={{ display:'block', cursor:'crosshair' }}
                onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseLeave={onMouseUp}/>
              {/* Overlay hint */}
              {inputs.every(v=>v<0.01) && (
                <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', pointerEvents:'none' }}>
                  <span style={{ fontSize:13, color:'#1e3a5f', fontFamily:'monospace' }}>← kresli zde</span>
                </div>
              )}
            </div>
            <button onClick={clearCanvas}
              style={{ marginTop:8, width:280, padding:'7px', background:'rgba(239,68,68,.1)', color:'#f87171', border:'1px solid rgba(239,68,68,.3)', borderRadius:8, cursor:'pointer', fontFamily:'monospace', fontSize:11, fontWeight:700 }}>
              🗑 Smazat
            </button>
          </div>

          {/* 28×28 digitalizační náhled */}
          <div style={{ padding:'12px 14px', flexShrink:0 }}>
            <div style={{ fontSize:9, fontWeight:700, color:'#64748b', textTransform:'uppercase', marginBottom:6 }}>
              28×28 digitalizace (každý čtverec = 1 pixel sítě)
            </div>
            <div style={{
              display:'grid', gridTemplateColumns:'repeat(28,1fr)',
              width:280, height:280, gap:0,
              border:'1px solid #1e293b', borderRadius:4, overflow:'hidden',
            }}>
              {inputs.map((v,i) => (
                <div key={i} style={{
                  background: v > 0.01 ? `rgba(0,245,255,${v})` : '#0a0e1a',
                  transition:'background .05s',
                }}/>
              ))}
            </div>
          </div>

          {/* Predikce */}
          {prediction !== null && (
            <div style={{ padding:'0 14px 12px', flexShrink:0 }}>
              <div style={{ padding:'10px 14px', background: confidence[prediction] > 0.7 ? 'rgba(57,255,20,.08)' : 'rgba(255,215,0,.07)', border:`1px solid ${confidence[prediction] > 0.7 ? NEON_GREEN : NEON_GOLD}44`, borderRadius:9 }}>
                <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                  <div style={{ fontSize:36, fontWeight:900, color: confidence[prediction] > 0.7 ? NEON_GREEN : NEON_GOLD }}>{prediction}</div>
                  <div>
                    <div style={{ fontSize:11, color:'#94a3b8' }}>Predikce sítě</div>
                    <div style={{ fontSize:14, fontWeight:700, color: confidence[prediction] > 0.7 ? NEON_GREEN : NEON_GOLD }}>
                      {(confidence[prediction] * 100).toFixed(1)}% jistota
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Pravděpodobnostní bar grafy */}
          <div style={{ padding:'0 14px', flex:1, overflowY:'auto' }}>
            <div style={{ fontSize:9, fontWeight:700, color:'#64748b', textTransform:'uppercase', marginBottom:6 }}>Pravděpodobnosti výstupu</div>
            {confidence.map((p, i) => (
              <div key={i} style={{ display:'flex', alignItems:'center', gap:6, marginBottom:4 }}>
                <span style={{ fontSize:11, fontWeight:700, color: prediction===i ? NEON_GOLD : '#475569', minWidth:14, textAlign:'right' }}>{i}</span>
                <div style={{ flex:1, height:14, background:'#0f172a', borderRadius:3, overflow:'hidden', border:`1px solid ${prediction===i?NEON_GOLD+'44':'#1e293b'}` }}>
                  <div style={{
                    height:'100%', borderRadius:3,
                    width:`${p * 100}%`,
                    background: prediction===i ? `linear-gradient(90deg,${NEON_GOLD},${NEON_GREEN})` : '#1e3a5f',
                    transition:'width .3s',
                    boxShadow: prediction===i ? `0 0 8px ${NEON_GOLD}88` : 'none',
                  }}/>
                </div>
                <span style={{ fontSize:9, fontFamily:'monospace', color: prediction===i ? NEON_GOLD : '#334155', minWidth:34 }}>
                  {(p * 100).toFixed(1)}%
                </span>
              </div>
            ))}
          </div>

          {/* Backpropagation sekce */}
          <div style={{ padding:'12px 14px', borderTop:'1px solid #1e293b', flexShrink:0 }}>
            <div style={{ fontSize:9, fontWeight:700, color:NEON_PINK, textTransform:'uppercase', marginBottom:8 }}>🔁 Backpropagation – oprava chyby</div>
            <div style={{ fontSize:10, color:'#64748b', marginBottom:8 }}>Jaká je správná číslice?</div>
            <div style={{ display:'flex', flexWrap:'wrap', gap:4, marginBottom:8 }}>
              {Array.from({length:10},(_,i)=>(
                <button key={i} onClick={()=>setCorr(i===correctLabel?null:i)}
                  style={{ width:28, height:28, borderRadius:6, border:`1.5px solid ${correctLabel===i?NEON_GREEN:NEON_PINK+'44'}`, background:correctLabel===i?NEON_GREEN+'22':'rgba(255,45,120,.06)', color:correctLabel===i?NEON_GREEN:NEON_PINK, fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:'monospace', transition:'all .15s' }}>
                  {i}
                </button>
              ))}
            </div>
            <button onClick={doBackprop} disabled={correctLabel===null||backAnim}
              className={backAnim?'shaking':''}
              style={{ width:'100%', padding:'8px', background:backAnim?'rgba(255,45,120,.2)':'rgba(255,45,120,.1)', color:NEON_PINK, border:`1px solid ${NEON_PINK}55`, borderRadius:8, cursor:correctLabel===null?'not-allowed':'pointer', fontFamily:'monospace', fontSize:12, fontWeight:700, opacity:correctLabel===null?0.5:1 }}>
              {backAnim ? '⚡ Učím se…' : '🎯 Spustit backpropagation'}
            </button>
          </div>
        </div>

        {/* ══ STŘED: neuronová síť ══ */}
        <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }}>
          {/* Síťový canvas */}
          <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', overflow:'hidden', background:'#0a0e1a' }}>
            <canvas ref={netCanvasRef} width={NET_W} height={NET_H}
              style={{ maxWidth:'100%', maxHeight:'100%' }}/>
          </div>

          {/* Metrika tab */}
          <div style={{ borderTop:'1px solid #1e293b', padding:'8px 16px', background:'#080d18', flexShrink:0, display:'flex', gap:20, alignItems:'center' }}>
            <div style={{ fontSize:9, fontWeight:700, color:'#475569', textTransform:'uppercase' }}>Trénování</div>
            {/* Mini loss chart */}
            <div style={{ display:'flex', gap:1, alignItems:'flex-end', height:24 }}>
              {loss.slice(-20).map((l, i) => (
                <div key={i} style={{
                  width:6, borderRadius:2,
                  height:`${Math.min(24, l * 12 + 2)}px`,
                  background: l < 0.5 ? NEON_GREEN : l < 1.5 ? NEON_GOLD : NEON_PINK,
                  opacity:0.7 + i/30,
                }}/>
              ))}
              {loss.length === 0 && <span style={{ fontSize:9, color:'#334155' }}>Po backpropu se zobrazí graf...</span>}
            </div>
            <div style={{ marginLeft:'auto', display:'flex', gap:16, fontSize:10 }}>
              <span style={{ color:'#475569' }}>Sessions: <strong style={{ color:NEON_BLUE }}>{trainCount}</strong></span>
              <span style={{ color:'#475569' }}>Loss: <strong style={{ color:NEON_GOLD }}>{avgLoss}</strong></span>
              <span style={{ color:'#475569' }}>Acc: <strong style={{ color:NEON_GREEN }}>{avgAcc}</strong></span>
            </div>
          </div>
        </div>

        {/* ══ PRAVÝ PANEL: vzdělávací texty ══ */}
        <div style={{ width:280, flexShrink:0, borderLeft:'1px solid #1e293b', display:'flex', flexDirection:'column', background:'#080d18', overflow:'hidden' }}>
          {/* Navigační tabs */}
          <div style={{ display:'flex', flexDirection:'column', borderBottom:'1px solid #1e293b', flexShrink:0 }}>
            <div style={{ padding:'8px 12px', fontSize:9, fontWeight:700, color:'#475569', textTransform:'uppercase', letterSpacing:'.08em' }}>
              📚 Vzdělávací průvodce
            </div>
            <div style={{ display:'flex', overflowX:'auto', padding:'0 8px 8px' }}>
              {PANELS.map((p, i) => (
                <button key={i} onClick={()=>setPanel(i)}
                  style={{ flexShrink:0, padding:'4px 8px', marginRight:4, borderRadius:6, border:`1px solid ${activePanel===i?p.color+'55':'#1e293b'}`, background:activePanel===i?p.color+'15':'transparent', color:activePanel===i?p.color:'#475569', cursor:'pointer', fontFamily:'monospace', fontSize:9, fontWeight:700 }}>
                  {p.icon}
                </button>
              ))}
            </div>
          </div>

          {/* Panel obsah */}
          <div key={activePanel} className="panel-fade" style={{ flex:1, overflowY:'auto', padding:14 }}>
            <div style={{ fontSize:8, fontWeight:700, color:PANELS[activePanel].color, textTransform:'uppercase', letterSpacing:'.08em', marginBottom:4 }}>
              {PANELS[activePanel].subtitle}
            </div>
            <h3 style={{ fontSize:14, fontWeight:800, color:'#fff', margin:'0 0 10px', lineHeight:1.4 }}>
              {PANELS[activePanel].title}
            </h3>
            <p style={{ fontSize:11.5, color:'#94a3b8', lineHeight:1.8, margin:'0 0 14px' }}>
              {PANELS[activePanel].text}
            </p>

            {/* Vizuální doplněk podle panelu */}
            {activePanel === 0 && (
              <div style={{ background:'#0d1117', borderRadius:8, padding:10, fontFamily:'monospace', fontSize:10, color:'#94a3b8', lineHeight:1.9 }}>
                <div style={{ color:NEON_BLUE }}>pixel[0] = 0.0 ← černá</div>
                <div style={{ color:NEON_GREEN }}>pixel[392] = 0.87 ← světlá</div>
                <div style={{ color:'#fff' }}>pixel[783] = 1.0 ← bílá</div>
                <div style={{ marginTop:6, color:'#475569' }}>Celkem: 28×28 = <span style={{ color:NEON_GOLD }}>784 vstupů</span></div>
              </div>
            )}
            {activePanel === 1 && (
              <div>
                <div style={{ display:'flex', gap:8, marginBottom:8 }}>
                  {[['Kladná váha',NEON_GREEN,'zesiluje signál'],['Záporná váha',NEON_PINK,'tlumí signál'],['Slabá váha','#334155','ignorováno']].map(([l,c,d])=>(
                    <div key={l} style={{ flex:1, padding:6, background:c+'12', border:`1px solid ${c}33`, borderRadius:6 }}>
                      <div style={{ fontSize:9, fontWeight:700, color:c as string, marginBottom:2 }}>{l}</div>
                      <div style={{ fontSize:8, color:'#64748b' }}>{d}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {activePanel === 2 && (
              <div style={{ background:'#0d1117', borderRadius:8, padding:10, fontFamily:'monospace', fontSize:11, color:'#94a3b8', lineHeight:2 }}>
                <div style={{ color:NEON_GOLD }}>z = Σ(wᵢ · xᵢ) + b</div>
                <div>w = váhy spojů</div>
                <div>x = vstupní hodnoty</div>
                <div style={{ color:NEON_BLUE }}>b = bias (předpětí)</div>
              </div>
            )}
            {activePanel === 3 && (
              <div>
                <div style={{ background:'#0d1117', borderRadius:8, padding:10, marginBottom:8 }}>
                  <div style={{ fontSize:9, color:NEON_GREEN, fontFamily:'monospace', marginBottom:4 }}>ReLU (skrytá vrstva)</div>
                  <div style={{ fontSize:10, fontFamily:'monospace', color:'#94a3b8' }}>f(z) = max(0, z)</div>
                  <div style={{ display:'flex', gap:1, alignItems:'flex-end', height:30, marginTop:6 }}>
                    {[-2,-1.5,-1,-.5,0,.5,1,1.5,2].map(z=>(
                      <div key={z} style={{ flex:1, background:NEON_GREEN, borderRadius:1, height:`${Math.max(0,z)/2*30}px`, opacity:.8 }}/>
                    ))}
                  </div>
                </div>
                <div style={{ background:'#0d1117', borderRadius:8, padding:10 }}>
                  <div style={{ fontSize:9, color:NEON_BLUE, fontFamily:'monospace', marginBottom:4 }}>Softmax (výstup)</div>
                  <div style={{ fontSize:10, fontFamily:'monospace', color:'#94a3b8' }}>P(i) = e^zᵢ / Σe^zⱼ</div>
                  <div style={{ fontSize:9, color:'#64748b', marginTop:4 }}>Výstup vždy sečte na 100%</div>
                </div>
              </div>
            )}
            {activePanel === 4 && confidence.some(c=>c>0.05) && (
              <div>
                <div style={{ fontSize:9, color:'#64748b', marginBottom:6 }}>Aktuální výstup sítě:</div>
                {confidence.map((p, i) => (
                  <div key={i} style={{ display:'flex', alignItems:'center', gap:5, marginBottom:3 }}>
                    <span style={{ fontSize:10, color:prediction===i?NEON_GOLD:'#334155', minWidth:12 }}>{i}</span>
                    <div style={{ flex:1, height:8, background:'#0f172a', borderRadius:2 }}>
                      <div style={{ height:'100%', width:`${p*100}%`, background:prediction===i?NEON_GOLD:NEON_BLUE+'55', borderRadius:2 }}/>
                    </div>
                    <span style={{ fontSize:8, color:prediction===i?NEON_GOLD:'#334155', minWidth:30, fontFamily:'monospace' }}>{(p*100).toFixed(0)}%</span>
                  </div>
                ))}
              </div>
            )}
            {activePanel === 5 && (
              <div style={{ background:'#0d1117', borderRadius:8, padding:10 }}>
                <div style={{ fontSize:10, fontFamily:'monospace', color:'#94a3b8', lineHeight:2 }}>
                  <div style={{ color:NEON_PINK }}>Gradient descent:</div>
                  <div>w ← w − η·∂L/∂w</div>
                  <div>b ← b − η·∂L/∂b</div>
                  <div style={{ color:NEON_BLUE, marginTop:4 }}>η = {LEARN_RATE} (learning rate)</div>
                  {loss.length > 0 && <div style={{ color:NEON_GREEN, marginTop:4 }}>Poslední loss: {loss[loss.length-1]?.toFixed(4)}</div>}
                </div>
              </div>
            )}
          </div>

          {/* Metriky tabulka */}
          {trainCount > 0 && (
            <div style={{ padding:'10px 14px', borderTop:'1px solid #1e293b', flexShrink:0 }}>
              <div style={{ fontSize:9, fontWeight:700, color:'#475569', textTransform:'uppercase', marginBottom:6 }}>📊 Metriky</div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6 }}>
                {[
                  { l:'Sessions', v:trainCount, c:NEON_BLUE },
                  { l:'Avg Loss',  v:avgLoss,    c:NEON_GOLD },
                  { l:'Accuracy', v:avgAcc,      c:NEON_GREEN },
                  { l:'Poslední', v:loss.length>0?loss[loss.length-1].toFixed(3):'—', c:NEON_PINK },
                ].map(s=>(
                  <div key={s.l} style={{ padding:'6px 8px', background:s.c+'0d', border:`1px solid ${s.c}22`, borderRadius:7 }}>
                    <div style={{ fontSize:8, color:'#475569' }}>{s.l}</div>
                    <div style={{ fontSize:13, fontWeight:800, color:s.c, fontFamily:'monospace' }}>{s.v}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
