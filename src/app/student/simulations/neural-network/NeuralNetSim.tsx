'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useRef, useCallback } from 'react'

// ── Shape definitions ─────────────────────────────────────────────────────────
const GRID = 8  // 8×8 pixel grid

function makeShape(type: 'square' | 'circle' | 'triangle'): number[] {
  const g: number[] = []
  for (let r = 0; r < GRID; r++) {
    for (let c = 0; c < GRID; c++) {
      if (type === 'square') {
        g.push(r >= 1 && r <= 6 && c >= 1 && c <= 6 ? 1 : 0)
      } else if (type === 'circle') {
        const dx = c - 3.5, dy = r - 3.5
        g.push(dx*dx + dy*dy <= 10 ? 1 : 0)
      } else {
        // triangle
        const mid = GRID / 2
        const slope = (mid - 1) / (GRID - 2)
        const left  = mid - slope * (r - 1)
        const right = mid + slope * (r - 1)
        g.push(r >= 1 && r <= 6 && c >= left && c <= right ? 1 : 0)
      }
    }
  }
  return g
}

const SHAPES = {
  square:   { pixels: makeShape('square'),   label: 'Čtverec',   emoji: '⬛', color: '#3b82f6' },
  circle:   { pixels: makeShape('circle'),   label: 'Kolečko',   emoji: '🔵', color: '#22c55e' },
  triangle: { pixels: makeShape('triangle'), label: 'Trojúhelník', emoji: '🔺', color: '#f59e0b' },
}
type ShapeKey = keyof typeof SHAPES

// ── Neural net config ─────────────────────────────────────────────────────────
// Architecture: 8 inputs → 4 hidden → 3 output
// (We sample 8 pixels from the 64 to keep visualization clean)
const SAMPLE_INDICES = [0, 9, 18, 27, 36, 45, 54, 63]  // diagonal
const N_INPUT  = 8
const N_HIDDEN = 4
const N_OUTPUT = 3

function sigmoid(x: number) { return 1 / (1 + Math.exp(-x)) }
function relu(x: number) { return Math.max(0, x) }
function dsigmoid(y: number) { return y * (1 - y) }

function initWeights(rows: number, cols: number): number[][] {
  return Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => (Math.random() - 0.5) * 2)
  )
}

// ── Step types ────────────────────────────────────────────────────────────────
type Phase =
  | 'choose'          // choose a shape
  | 'pixels'          // show image → pixel grid
  | 'input_layer'     // pixels flow into input neurons
  | 'weights_h'       // show weights to hidden layer
  | 'hidden_calc'     // compute hidden layer values
  | 'activation'      // apply activation function
  | 'weights_o'       // show weights to output layer
  | 'output_calc'     // compute output layer
  | 'prediction'      // show prediction
  | 'backprop'        // if wrong — backpropagation
  | 'weight_update'   // update weights
  | 'done'            // correct prediction

const PHASE_INFO: Record<Phase, { title: string; explanation: string; tip: string }> = {
  choose:       { title: 'Vyber tvar', explanation: 'Vyber tvar, který má neuronová síť rozpoznat. Síť bude trénována dokud ho správně neklasifikuje.', tip: '💡 Neuronová síť se učí z příkladů — stejně jako ty!' },
  pixels:       { title: '1. Pixely obrazu', explanation: 'Obrázek se rozdělí na jednotlivé pixely. Každý pixel má hodnotu 0 (bílý) nebo 1 (černý). Tato data budou vstupem sítě.', tip: '💡 Počítač "vidí" obrázky jako mřížku čísel, ne jako tvary.' },
  input_layer:  { title: '2. Vstupní vrstva', explanation: 'Vybraných 8 pixelů vstupuje do vstupní vrstvy. Každý neuron dostane jednu hodnotu (0 nebo 1). Neurony jen předávají data dál — nepočítají.', tip: '💡 Vstupní vrstva = smysly sítě. Jen přijímá data.' },
  weights_h:    { title: '3. Váhy spojení', explanation: 'Každé spojení mezi neurony má svou váhu (číslo). Kladná váha zesiluje signál, záporná ho tlumí. Na začátku jsou váhy náhodné.', tip: '💡 Váhy jsou to co se síť "učí" — mění se při trénování.' },
  hidden_calc:  { title: '4. Výpočet skryté vrstvy', explanation: 'Každý skrytý neuron spočítá: součet(vstup × váha) + bias. Bias je jako "prahová hodnota" — posouvá výsledek.', tip: '💡 Vzorec: z = x₁w₁ + x₂w₂ + ... + b' },
  activation:   { title: '5. Aktivační funkce', explanation: 'Výsledek se pošle přes aktivační funkci sigmoid: σ(z) = 1/(1+e⁻ᶻ). Funkce "zmáčkne" hodnotu do rozsahu (0, 1). Simuluje "zapnutý/vypnutý" neuron.', tip: '💡 Bez aktivační funkce by síť počítala jen lineární rovnice.' },
  weights_o:    { title: '6. Váhy → výstup', explanation: 'Aktivované hodnoty skryté vrstvy jdou dál přes další sadu vah do výstupní vrstvy. Každý výstupní neuron odpovídá jedné třídě.', tip: '💡 Čím více skrytých vrstev, tím složitější vzory síť rozpozná.' },
  output_calc:  { title: '7. Výstupní vrstva', explanation: 'Výstupní vrstva má 3 neurony — jeden pro každý tvar. Nejvyšší hodnota určuje predikci sítě.', tip: '💡 Softmax by normalizoval výstupy na pravděpodobnosti, zde používáme sigmoid.' },
  prediction:   { title: '8. Predikce', explanation: 'Neuron s nejvyšší hodnotou je predikovaná třída. Pokud je predikce správná, jsme hotovi! Pokud ne, spustí se backpropagation.', tip: '💡 Správnost závisí na aktuálních vahách sítě.' },
  backprop:     { title: '9. Backpropagation', explanation: 'Síť spočítala chybu (rozdíl mezi predikcí a správnou odpovědí). Chyba se šíří zpět sítí — každá váha dostane "vinu" za chybu (gradient).', tip: '💡 Backprop = pravidlo řetězce z matematiky aplikované na síť.' },
  weight_update: { title: '10. Aktualizace vah', explanation: 'Váhy se upraví ve směru který snižuje chybu: w = w - η × gradient. η (eta) je learning rate — jak velký krok uděláme. Menší = přesnější, pomalejší.', tip: '💡 Learning rate 0.1 znamená: udělej 10% kroku správným směrem.' },
  done:         { title: '✓ Hotovo!', explanation: 'Síť správně rozpoznala tvar! Po dostatečném trénování se váhy ustálí a síť rozpozná tvar spolehlivě i s drobnými odchylkami.', tip: '💡 Reálné sítě trénují na milionech příkladů po tisíce epoch.' },
}

// ── Colors ────────────────────────────────────────────────────────────────────
const C = {
  bg: '#090B10', card: '#12151E', border: 'rgba(255,255,255,0.07)',
  txt: '#fff', sec: '#8892a4', accent: '#7c3aed',
  neuron: '#1e2a3a', neuronActive: '#1e3a5f', neuronFire: '#3b82f6',
  w_pos: '#22c55e', w_neg: '#ef4444', w_neu: '#6b7280',
  correct: '#22c55e', wrong: '#ef4444', info: '#f59e0b',
}

export default function NeuralNetSim({ accentColor }: { accentColor: string }) {
  const accent = accentColor

  // ── State ─────────────────────────────────────────────────────────────────
  const [selectedShape, setSelectedShape] = useState<ShapeKey | null>(null)
  const [phase, setPhase] = useState<Phase>('choose')
  const [epoch, setEpoch] = useState(0)
  const [autoPlay, setAutoPlay] = useState(false)
  const autoRef = useRef(false)

  // Network state
  const [wH, setWH] = useState<number[][]>(() => initWeights(N_HIDDEN, N_INPUT))
  const [wO, setWO] = useState<number[][]>(() => initWeights(N_OUTPUT, N_HIDDEN))
  const [bH, setBH] = useState<number[]>(() => Array(N_HIDDEN).fill(0))
  const [bO, setBO] = useState<number[]>(() => Array(N_OUTPUT).fill(0))

  // Forward pass values
  const [inputs, setInputs]   = useState<number[]>(Array(N_INPUT).fill(0))
  const [zH, setZH]           = useState<number[]>(Array(N_HIDDEN).fill(0))
  const [aH, setAH]           = useState<number[]>(Array(N_HIDDEN).fill(0))
  const [zO, setZO]           = useState<number[]>(Array(N_OUTPUT).fill(0))
  const [aO, setAO]           = useState<number[]>(Array(N_OUTPUT).fill(0))
  const [prediction, setPrediction] = useState<number>(-1)

  // Animation
  const [animStep, setAnimStep]   = useState(0)
  const [highlightedConns, setHighlightedConns] = useState<[number,number][]>([])
  const [animatingPulse, setAnimatingPulse]     = useState<{from:'input'|'hidden',idx:number}|null>(null)

  // ── Canvas ────────────────────────────────────────────────────────────────
  const canvasRef    = useRef<HTMLCanvasElement>(null)
  const netCanvasRef = useRef<HTMLCanvasElement>(null)

  const shapeKeys: ShapeKey[] = ['square', 'circle', 'triangle']
  const targetIdx = selectedShape ? shapeKeys.indexOf(selectedShape) : 0

  // ── Forward pass ──────────────────────────────────────────────────────────
  const forward = useCallback((inp: number[], wh: number[][], wo: number[][], bh: number[], bo: number[]) => {
    const newZH = wh.map((row, i) => row.reduce((s, w, j) => s + w * inp[j], 0) + bh[i])
    const newAH = newZH.map(sigmoid)
    const newZO = wo.map((row, i) => row.reduce((s, w, j) => s + w * newAH[j], 0) + bo[i])
    const newAO = newZO.map(sigmoid)
    const pred  = newAO.indexOf(Math.max(...newAO))
    return { newZH, newAH, newZO, newAO, pred }
  }, [])

  // ── Backward pass ─────────────────────────────────────────────────────────
  const backward = useCallback((inp: number[], aH_: number[], aO_: number[], target: number,
    wO_: number[][], wH_: number[][], bH_: number[], bO_: number[], lr = 0.3) => {
    const tVec = Array(N_OUTPUT).fill(0); tVec[target] = 1
    const dO = aO_.map((a, i) => (a - tVec[i]) * dsigmoid(a))
    const dH = aH_.map((a, j) => wO_.reduce((s, row, i) => s + row[j] * dO[i], 0) * dsigmoid(a))
    const newWO = wO_.map((row, i) => row.map((w, j) => w - lr * dO[i] * aH_[j]))
    const newWH = wH_.map((row, i) => row.map((w, j) => w - lr * dH[i] * inp[j]))
    const newBO = bO_.map((b, i) => b - lr * dO[i])
    const newBH = bH_.map((b, i) => b - lr * dH[i])
    return { newWO, newWH, newBO, newBH }
  }, [])

  // ── Draw pixel canvas ──────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !selectedShape) return
    const ctx = canvas.getContext('2d')!
    const pixels = SHAPES[selectedShape].pixels
    const size = canvas.width / GRID
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    pixels.forEach((v, i) => {
      const r = Math.floor(i / GRID), c = i % GRID
      const isSampled = SAMPLE_INDICES.includes(i)
      ctx.fillStyle = v === 1 ? '#fff' : '#0d1117'
      ctx.fillRect(c * size, r * size, size - 1, size - 1)
      if (isSampled && phase !== 'pixels' && phase !== 'choose') {
        ctx.strokeStyle = accent + 'cc'
        ctx.lineWidth = 2
        ctx.strokeRect(c * size + 1, r * size + 1, size - 3, size - 3)
      }
    })
    // Draw sample indices in later phases
    if (phase !== 'choose' && phase !== 'pixels') {
      SAMPLE_INDICES.forEach((idx, i) => {
        const r = Math.floor(idx / GRID), c = idx % GRID
        ctx.fillStyle = inputs[i] > 0.5 ? accent : '#6b7280'
        ctx.font = `${size * 0.4}px monospace`
        ctx.textAlign = 'center'
        ctx.fillText(inputs[i].toFixed(0), c * size + size/2, r * size + size * 0.7)
      })
    }
  }, [selectedShape, phase, inputs, accent])

  // ── Draw neural net canvas ─────────────────────────────────────────────────
  useEffect(() => {
    const canvas = netCanvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    const W = canvas.width, H = canvas.height
    ctx.clearRect(0, 0, W, H)

    // Layout
    const layers = [N_INPUT, N_HIDDEN, N_OUTPUT]
    const layerX = [W * 0.15, W * 0.5, W * 0.85]
    const layerY = (layerIdx: number, nodeIdx: number) => {
      const n = layers[layerIdx]
      const spacing = Math.min(H / (n + 1), 52)
      const totalH = (n - 1) * spacing
      return H/2 - totalH/2 + nodeIdx * spacing
    }

    const phaseNum = ['choose','pixels','input_layer','weights_h','hidden_calc','activation','weights_o','output_calc','prediction','backprop','weight_update','done'].indexOf(phase)

    // ── Draw connections ──────────────────────────────────────────────────
    const drawConn = (x1: number, y1: number, x2: number, y2: number, w: number, active: boolean, pulse: boolean) => {
      const alpha = active ? 0.85 : 0.18
      const col = w > 0.3 ? C.w_pos : w < -0.3 ? C.w_neg : C.w_neu
      ctx.strokeStyle = active ? col + Math.round(alpha * 255).toString(16).padStart(2,'0') : 'rgba(255,255,255,0.08)'
      ctx.lineWidth = active ? Math.min(3, Math.abs(w) * 2 + 0.5) : 0.5
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke()
      if (pulse) {
        const grad = ctx.createLinearGradient(x1, y1, x2, y2)
        grad.addColorStop(0, 'transparent')
        grad.addColorStop(0.5, accent + 'dd')
        grad.addColorStop(1, 'transparent')
        ctx.strokeStyle = grad; ctx.lineWidth = 2
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke()
      }
    }

    // Input → Hidden connections
    if (phaseNum >= 3) {
      for (let h = 0; h < N_HIDDEN; h++) {
        for (let i = 0; i < N_INPUT; i++) {
          const active = phaseNum >= 3
          const pulse = animatingPulse?.from === 'input' && animatingPulse.idx === i
          drawConn(layerX[0], layerY(0, i), layerX[1], layerY(1, h), wH[h]?.[i] ?? 0, active, pulse)
        }
      }
    }

    // Hidden → Output connections
    if (phaseNum >= 6) {
      for (let o = 0; o < N_OUTPUT; o++) {
        for (let h = 0; h < N_HIDDEN; h++) {
          const active = phaseNum >= 6
          const pulse = animatingPulse?.from === 'hidden' && animatingPulse.idx === h
          drawConn(layerX[1], layerY(1, h), layerX[2], layerY(2, o), wO[o]?.[h] ?? 0, active, pulse)
        }
      }
    }

    // ── Draw neurons ─────────────────────────────────────────────────────
    const drawNeuron = (x: number, y: number, val: number, label: string, active: boolean, isOutput: boolean, outputIdx?: number) => {
      const r = 18
      const fillCol = active
        ? (val > 0.5 ? C.neuronFire : C.neuronActive)
        : C.neuron
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2)
      ctx.fillStyle = fillCol; ctx.fill()
      if (active) {
        ctx.strokeStyle = val > 0.5 ? '#60a5fa' : 'rgba(255,255,255,0.2)'
        ctx.lineWidth = 2; ctx.stroke()
      }
      // Value
      if (active && phaseNum >= 4) {
        ctx.fillStyle = '#fff'; ctx.font = 'bold 9px monospace'; ctx.textAlign = 'center'
        ctx.fillText(val.toFixed(2), x, y + 3)
      }
      // Label
      ctx.fillStyle = '#8892a4'; ctx.font = '9px monospace'; ctx.textAlign = 'center'
      ctx.fillText(label, x, y + r + 11)

      // Output: shape label
      if (isOutput && phaseNum >= 8 && outputIdx !== undefined) {
        const sk = shapeKeys[outputIdx]
        const isWinner = aO.indexOf(Math.max(...aO)) === outputIdx
        const isTarget = outputIdx === targetIdx
        ctx.font = 'bold 10px sans-serif'
        ctx.fillStyle = isWinner ? (isTarget ? C.correct : C.wrong) : '#8892a4'
        ctx.fillText(SHAPES[sk].emoji + ' ' + (val * 100).toFixed(0) + '%', x + 28, y + 3)
      }
    }

    // Input neurons
    for (let i = 0; i < N_INPUT; i++) {
      const active = phaseNum >= 2
      drawNeuron(layerX[0], layerY(0, i), inputs[i], `x${i+1}`, active, false)
    }

    // Hidden neurons
    for (let h = 0; h < N_HIDDEN; h++) {
      const active = phaseNum >= 4
      drawNeuron(layerX[1], layerY(1, h), active ? aH[h] : 0, `h${h+1}`, active, false)
      // Show z value before activation
      if (phaseNum === 4 || phaseNum === 5) {
        const y = layerY(1, h)
        ctx.fillStyle = '#f59e0b'; ctx.font = '8px monospace'; ctx.textAlign = 'left'
        ctx.fillText(`z=${zH[h]?.toFixed(1) ?? '?'}`, layerX[1] + 22, y)
      }
    }

    // Output neurons
    for (let o = 0; o < N_OUTPUT; o++) {
      const active = phaseNum >= 7
      const isWinner = prediction === o && phaseNum >= 8
      const isCorrect = prediction === targetIdx
      if (isWinner) {
        ctx.beginPath(); ctx.arc(layerX[2], layerY(2, o), 22, 0, Math.PI * 2)
        ctx.fillStyle = isCorrect ? C.correct + '22' : C.wrong + '22'
        ctx.fill()
      }
      drawNeuron(layerX[2], layerY(2, o), active ? aO[o] : 0, `y${o+1}`, active, true, o)
    }

    // Layer labels
    const LAYER_NAMES = ['Vstupní\nvrstva', 'Skrytá\nvrstva', 'Výstupní\nvrstva']
    layerX.forEach((x, i) => {
      ctx.fillStyle = '#6b7280'; ctx.font = '10px sans-serif'; ctx.textAlign = 'center'
      LAYER_NAMES[i].split('\n').forEach((line, li) => ctx.fillText(line, x, 14 + li * 12))
    })

    // Backprop: draw error arrows going backward
    if (phaseNum === 9) {
      ctx.strokeStyle = C.wrong + 'cc'; ctx.lineWidth = 2
      ctx.setLineDash([5, 4])
      for (let h = 0; h < N_HIDDEN; h++) {
        for (let o = 0; o < N_OUTPUT; o++) {
          ctx.beginPath()
          ctx.moveTo(layerX[2] - 20, layerY(2, o))
          ctx.lineTo(layerX[1] + 20, layerY(1, h))
          ctx.stroke()
        }
      }
      ctx.setLineDash([])
    }

  }, [phase, inputs, zH, aH, zO, aO, prediction, wH, wO, epoch, animatingPulse, selectedShape, targetIdx])

  // ── Step logic ────────────────────────────────────────────────────────────
  const nextPhase = useCallback(() => {
    const order: Phase[] = ['choose','pixels','input_layer','weights_h','hidden_calc','activation','weights_o','output_calc','prediction','backprop','weight_update','done']

    setPhase(prev => {
      if (prev === 'choose') return prev

      if (prev === 'pixels') {
        // Compute inputs
        const pixels = SHAPES[selectedShape!].pixels
        const inp = SAMPLE_INDICES.map(i => pixels[i])
        setInputs(inp)
        return 'input_layer'
      }

      if (prev === 'input_layer') return 'weights_h'

      if (prev === 'weights_h') {
        // Trigger connection pulse animation
        let i = 0
        const interval = setInterval(() => {
          setAnimatingPulse({ from: 'input', idx: i })
          i++
          if (i >= N_INPUT) { clearInterval(interval); setAnimatingPulse(null) }
        }, 120)
        // Compute z values
        const pixels = SHAPES[selectedShape!].pixels
        const inp = SAMPLE_INDICES.map(idx => pixels[idx])
        const newZH = wH.map((row, hi) => row.reduce((s, w, j) => s + w * inp[j], 0) + bH[hi])
        setZH(newZH)
        return 'hidden_calc'
      }

      if (prev === 'hidden_calc') {
        const newAH = zH.map(sigmoid)
        setAH(newAH)
        return 'activation'
      }

      if (prev === 'activation') return 'weights_o'

      if (prev === 'weights_o') {
        let h = 0
        const interval = setInterval(() => {
          setAnimatingPulse({ from: 'hidden', idx: h })
          h++
          if (h >= N_HIDDEN) { clearInterval(interval); setAnimatingPulse(null) }
        }, 150)
        const newZO = wO.map((row, oi) => row.reduce((s, w, j) => s + w * aH[j], 0) + bO[oi])
        setZO(newZO)
        return 'output_calc'
      }

      if (prev === 'output_calc') {
        const newAO = zO.map(sigmoid)
        setAO(newAO)
        const pred = newAO.indexOf(Math.max(...newAO))
        setPrediction(pred)
        return 'prediction'
      }

      if (prev === 'prediction') {
        const pred = aO.indexOf(Math.max(...aO))
        if (pred === targetIdx) return 'done'
        return 'backprop'
      }

      if (prev === 'backprop') {
        // Do backward pass
        const { newWO, newWH, newBO, newBH } = backward(inputs, aH, aO, targetIdx, wO, wH, bH, bO)
        setWO(newWO); setWH(newWH); setBO(newBO); setBH(newBH)
        return 'weight_update'
      }

      if (prev === 'weight_update') {
        // Run full forward again to check
        setEpoch(e => e + 1)
        const pixels = SHAPES[selectedShape!].pixels
        const inp = SAMPLE_INDICES.map(i => pixels[i])
        const { newWO: wo2, newWH: wh2, newBO: bo2, newBH: bh2 } = backward(inp, aH, aO, targetIdx, wO, wH, bH, bO)
        const { newZH, newAH, newZO, newAO, pred } = forward(inp, wh2, wo2, bh2, bo2)
        setInputs(inp); setZH(newZH); setAH(newAH); setZO(newZO); setAO(newAO); setPrediction(pred)
        if (pred === targetIdx) return 'done'
        // Another round needed — go back to forward pass start
        return 'input_layer'
      }

      if (prev === 'done') {
        // Reset for new shape
        setSelectedShape(null)
        setPhase('choose')
        setEpoch(0)
        setWH(initWeights(N_HIDDEN, N_INPUT))
        setWO(initWeights(N_OUTPUT, N_HIDDEN))
        setBH(Array(N_HIDDEN).fill(0))
        setBO(Array(N_OUTPUT).fill(0))
        setInputs(Array(N_INPUT).fill(0))
        setZH(Array(N_HIDDEN).fill(0))
        setAH(Array(N_HIDDEN).fill(0))
        setZO(Array(N_OUTPUT).fill(0))
        setAO(Array(N_OUTPUT).fill(0))
        setPrediction(-1)
        return 'choose'
      }

      const idx = order.indexOf(prev)
      return order[idx + 1] ?? prev
    })
  }, [selectedShape, wH, wO, bH, bO, zH, aH, zO, aO, inputs, targetIdx, forward, backward])

  // Auto play
  useEffect(() => {
    autoRef.current = autoPlay
    if (!autoPlay) return
    const id = setInterval(() => {
      if (autoRef.current) nextPhase()
    }, 1800)
    return () => clearInterval(id)
  }, [autoPlay, nextPhase])

  const info = PHASE_INFO[phase]
  const phaseNum = ['choose','pixels','input_layer','weights_h','hidden_calc','activation','weights_o','output_calc','prediction','backprop','weight_update','done'].indexOf(phase)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: C.bg, color: C.txt, fontFamily: 'inherit' }}>
      <style>{`
        @keyframes pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.6;transform:scale(1.08)} }
        @keyframes fadeIn { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:none} }
        @keyframes flow { 0%{stroke-dashoffset:20} 100%{stroke-dashoffset:0} }
        .step-bubble { animation: fadeIn .35s ease; }
        .pulse-dot { animation: pulse 1s ease-in-out infinite; }
      `}</style>

      {/* ── Header ── */}
      <div style={{ padding: '14px 28px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 16, flexShrink: 0 }}>
        <a href="/student/simulations" style={{ color: C.sec, fontSize: 13, textDecoration: 'none' }}>← Simulace</a>
        <div style={{ width: 1, height: 16, background: C.border }} />
        <span style={{ fontSize: 15, fontWeight: 700 }}>🧠 Neuronová síť — vizualizace trénování</span>
        {epoch > 0 && <span style={{ marginLeft: 'auto', fontSize: 12, color: C.sec }}>Epoch: <strong style={{ color: '#fff' }}>{epoch}</strong></span>}
      </div>

      <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>

        {/* ── LEFT: Image + pixel grid ── */}
        <div style={{ width: 220, flexShrink: 0, borderRight: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', padding: 16, gap: 14, overflowY: 'auto' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.sec, textTransform: 'uppercase', letterSpacing: '.06em' }}>Vstupní obrázek</div>

          {/* Shape selector */}
          {phase === 'choose' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {shapeKeys.map(sk => (
                <button key={sk} onClick={() => { setSelectedShape(sk); setPhase('pixels') }}
                  style={{ padding: '12px', background: SHAPES[sk].color + '15', border: `1px solid ${SHAPES[sk].color}40`, borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 22 }}>{SHAPES[sk].emoji}</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>{SHAPES[sk].label}</span>
                </button>
              ))}
            </div>
          )}

          {selectedShape && (
            <>
              <div style={{ textAlign: 'center', fontSize: 12, color: C.sec }}>
                {SHAPES[selectedShape].emoji} {SHAPES[selectedShape].label}
              </div>
              <canvas ref={canvasRef} width={192} height={192}
                style={{ width: '100%', imageRendering: 'pixelated', borderRadius: 8, border: `1px solid ${C.border}` }} />

              {/* Sampled pixels list */}
              {phaseNum >= 2 && (
                <div style={{ background: C.card, borderRadius: 8, padding: 10, border: `1px solid ${C.border}` }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: C.sec, marginBottom: 6, textTransform: 'uppercase' }}>Vzorkované pixely (8)</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {inputs.map((v, i) => (
                      <div key={i} style={{ width: 28, height: 28, borderRadius: 5, background: v > 0.5 ? '#fff' : '#1a1e2a', border: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: v > 0.5 ? '#000' : C.sec, fontWeight: 700 }}>
                        {v.toFixed(0)}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* ── CENTER: Neural net visualization ── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Network canvas */}
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, minHeight: 0 }}>
            {phase === 'choose' ? (
              <div style={{ textAlign: 'center', color: C.sec }}>
                <div style={{ fontSize: 56, marginBottom: 16 }}>🧠</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#fff', marginBottom: 8 }}>Neuronová síť</div>
                <div style={{ fontSize: 14, lineHeight: 1.7 }}>Vyber tvar vlevo a sleduj<br/>jak síť postupně trénuje.</div>
              </div>
            ) : (
              <canvas ref={netCanvasRef} width={580} height={340}
                style={{ width: '100%', height: '100%', maxWidth: 620, maxHeight: 360 }} />
            )}
          </div>

          {/* ── Computation panel ── */}
          {phaseNum >= 4 && phaseNum <= 8 && (
            <div style={{ borderTop: `1px solid ${C.border}`, padding: '12px 20px', background: C.card, flexShrink: 0 }}>
              <div style={{ display: 'flex', gap: 16, overflowX: 'auto' }}>
                {/* Hidden layer computation */}
                {phaseNum >= 4 && (
                  <div style={{ flexShrink: 0 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: C.sec, textTransform: 'uppercase', marginBottom: 6 }}>Skrytá vrstva — výpočet</div>
                    {zH.slice(0, 2).map((z, i) => (
                      <div key={i} style={{ fontSize: 10, fontFamily: 'monospace', color: C.sec, marginBottom: 3 }}>
                        <span style={{ color: '#60a5fa' }}>h{i+1}</span>: z = {wH[i]?.slice(0,3).map((w,j) => `${w.toFixed(2)}×${inputs[j]?.toFixed(0) ?? '0'}`).join(' + ')}... + {bH[i]?.toFixed(2)} = <span style={{ color: '#f59e0b' }}>{z.toFixed(3)}</span>
                      </div>
                    ))}
                  </div>
                )}
                {/* Sigmoid */}
                {phaseNum >= 5 && (
                  <div style={{ flexShrink: 0 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: C.sec, textTransform: 'uppercase', marginBottom: 6 }}>Aktivační funkce σ(z)</div>
                    {aH.slice(0, 2).map((a, i) => (
                      <div key={i} style={{ fontSize: 10, fontFamily: 'monospace', marginBottom: 3 }}>
                        <span style={{ color: '#60a5fa' }}>h{i+1}</span>: σ({zH[i]?.toFixed(2)}) = 1/(1+e<sup>-{zH[i]?.toFixed(2)}</sup>) = <span style={{ color: '#22c55e', fontWeight: 700 }}>{a.toFixed(3)}</span>
                      </div>
                    ))}
                    <SigmoidMiniChart values={aH} />
                  </div>
                )}
                {/* Output */}
                {phaseNum >= 8 && (
                  <div style={{ flexShrink: 0 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: C.sec, textTransform: 'uppercase', marginBottom: 6 }}>Výstupní vrstva</div>
                    {aO.map((a, i) => {
                      const isWinner = aO.indexOf(Math.max(...aO)) === i
                      const isTarget = i === targetIdx
                      return (
                        <div key={i} style={{ fontSize: 10, fontFamily: 'monospace', marginBottom: 3, color: isWinner ? (isTarget ? C.correct : C.wrong) : C.sec, fontWeight: isWinner ? 700 : 400 }}>
                          {SHAPES[shapeKeys[i]].emoji} {SHAPES[shapeKeys[i]].label}: {(a * 100).toFixed(1)}% {isWinner ? '← predikce' : ''}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Controls ── */}
          <div style={{ borderTop: `1px solid ${C.border}`, padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
            {/* Progress pills */}
            <div style={{ display: 'flex', gap: 4 }}>
              {['pixels','input_layer','weights_h','hidden_calc','activation','weights_o','output_calc','prediction','backprop','weight_update'].map((p, i) => (
                <div key={p} style={{ width: 8, height: 8, borderRadius: '50%', background: phaseNum > i + 1 ? accent : phaseNum === i + 1 ? accent + 'aa' : 'rgba(255,255,255,.1)' }} />
              ))}
            </div>
            <div style={{ flex: 1 }} />
            {phase !== 'choose' && (
              <>
                <button onClick={() => setAutoPlay(p => !p)}
                  style={{ padding: '6px 14px', background: autoPlay ? 'rgba(239,68,68,.15)' : 'rgba(255,255,255,.06)', color: autoPlay ? '#ef4444' : C.sec, border: `1px solid ${autoPlay ? 'rgba(239,68,68,.3)' : C.border}`, borderRadius: 8, cursor: 'pointer', fontSize: 12, fontFamily: 'inherit' }}>
                  {autoPlay ? '⏸ Pauza' : '▶ Auto'}
                </button>
                <button onClick={nextPhase}
                  style={{ padding: '8px 22px', background: phase === 'done' ? C.correct : accent, color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 700, fontFamily: 'inherit' }}>
                  {phase === 'done' ? '🔄 Znovu' : 'Další krok →'}
                </button>
              </>
            )}
          </div>
        </div>

        {/* ── RIGHT: Info bubble ── */}
        <div style={{ width: 280, flexShrink: 0, borderLeft: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ flex: 1, overflowY: 'auto', padding: 18 }}>
            <div key={phase} className="step-bubble">
              {/* Step indicator */}
              {phase !== 'choose' && phase !== 'done' && (
                <div style={{ fontSize: 10, fontWeight: 700, color: accent, textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 8 }}>
                  Krok {phaseNum} z 10
                </div>
              )}
              <h3 style={{ fontSize: 15, fontWeight: 800, color: '#fff', margin: '0 0 10px' }}>{info.title}</h3>
              <p style={{ fontSize: 13, color: '#cbd5e1', lineHeight: 1.75, margin: '0 0 14px' }}>{info.explanation}</p>

              {/* Tip bubble */}
              <div style={{ padding: '10px 12px', background: 'rgba(251,191,36,.06)', border: '1px solid rgba(251,191,36,.2)', borderRadius: 9 }}>
                <p style={{ fontSize: 12, color: '#fcd34d', margin: 0, lineHeight: 1.6 }}>{info.tip}</p>
              </div>

              {/* Phase-specific extras */}
              {phase === 'weights_h' && <WeightLegend />}
              {phase === 'activation' && <SigmoidCurve />}
              {phase === 'prediction' && (
                <PredictionBadge
                  prediction={prediction}
                  target={targetIdx}
                  shapes={shapeKeys.map(k => ({ label: SHAPES[k].label, emoji: SHAPES[k].emoji, color: SHAPES[k].color }))}
                />
              )}
              {phase === 'backprop' && <BackpropFormula />}
              {phase === 'weight_update' && <UpdateFormula />}
              {phase === 'done' && (
                <div style={{ marginTop: 12, padding: '12px', background: 'rgba(34,197,94,.1)', border: '1px solid rgba(34,197,94,.3)', borderRadius: 9, textAlign: 'center' }}>
                  <div style={{ fontSize: 28, marginBottom: 6 }}>🎉</div>
                  <div style={{ fontSize: 13, color: '#86efac', fontWeight: 600 }}>Síť se naučila rozpoznat {selectedShape ? SHAPES[selectedShape].label : ''}!</div>
                  <div style={{ fontSize: 11, color: C.sec, marginTop: 4 }}>Trvalo to {epoch} epoch{epoch === 1 ? 'u' : epoch < 5 ? 'y' : ''}.</div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Small helper components ───────────────────────────────────────────────────
function WeightLegend() {
  return (
    <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#8892a4', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 2 }}>Váhy</div>
      {[['Silná kladná váha', '#22c55e', 'zesiluje signál'],['Silná záporná váha', '#ef4444', 'tlumí signál'],['Slabá váha', '#6b7280', 'malý vliv']].map(([label, color, desc]) => (
        <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 32, height: 3, background: color as string, borderRadius: 2 }} />
          <div>
            <div style={{ fontSize: 11, color: '#fff' }}>{label}</div>
            <div style={{ fontSize: 10, color: '#8892a4' }}>{desc}</div>
          </div>
        </div>
      ))}
    </div>
  )
}

function SigmoidCurve() {
  const W = 200, H = 80
  const pts = Array.from({ length: W }, (_, i) => {
    const x = (i / W) * 10 - 5
    const y = 1 / (1 + Math.exp(-x))
    return `${i},${H - y * H}`
  }).join(' ')
  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#8892a4', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6 }}>Sigmoid: σ(z) = 1/(1+e⁻ᶻ)</div>
      <svg width={W} height={H + 20} style={{ display: 'block' }}>
        <line x1={0} y1={H/2} x2={W} y2={H/2} stroke="rgba(255,255,255,.1)" strokeWidth={1} />
        <line x1={W/2} y1={0} x2={W/2} y2={H} stroke="rgba(255,255,255,.1)" strokeWidth={1} />
        <polyline points={pts} fill="none" stroke="#7c3aed" strokeWidth={2} />
        <text x={0} y={H+16} fill="#6b7280" fontSize={9}>-5</text>
        <text x={W/2-3} y={H+16} fill="#6b7280" fontSize={9}>0</text>
        <text x={W-12} y={H+16} fill="#6b7280" fontSize={9}>+5</text>
        <text x={W+2} y={8} fill="#6b7280" fontSize={9}>1</text>
        <text x={W+2} y={H/2+3} fill="#6b7280" fontSize={9}>.5</text>
      </svg>
    </div>
  )
}

function SigmoidMiniChart({ values }: { values: number[] }) {
  return (
    <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
      {values.map((v, i) => (
        <div key={i} style={{ textAlign: 'center' }}>
          <div style={{ width: 24, height: 40, background: 'rgba(255,255,255,.06)', borderRadius: 4, position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', bottom: 0, width: '100%', height: `${v * 100}%`, background: v > 0.5 ? '#3b82f6' : '#374151', borderRadius: 4, transition: 'height .4s' }} />
          </div>
          <div style={{ fontSize: 8, color: '#6b7280', marginTop: 2 }}>{v.toFixed(2)}</div>
        </div>
      ))}
    </div>
  )
}

function PredictionBadge({ prediction, target, shapes }: { prediction: number; target: number; shapes: { label: string; emoji: string; color: string }[] }) {
  const correct = prediction === target
  return (
    <div style={{ marginTop: 12, padding: 14, background: correct ? 'rgba(34,197,94,.08)' : 'rgba(239,68,68,.08)', border: `1px solid ${correct ? 'rgba(34,197,94,.25)' : 'rgba(239,68,68,.25)'}`, borderRadius: 10 }}>
      <div style={{ fontSize: 11, color: correct ? '#22c55e' : '#ef4444', fontWeight: 700, marginBottom: 8 }}>
        {correct ? '✓ Správná predikce!' : '✗ Chybná predikce'}
      </div>
      <div style={{ fontSize: 12, color: '#cbd5e1' }}>
        Predikce: <strong>{shapes[prediction]?.emoji} {shapes[prediction]?.label}</strong>
      </div>
      {!correct && (
        <div style={{ fontSize: 12, color: '#cbd5e1', marginTop: 4 }}>
          Správně: <strong>{shapes[target]?.emoji} {shapes[target]?.label}</strong>
        </div>
      )}
      {!correct && <div style={{ fontSize: 12, color: '#f59e0b', marginTop: 8 }}>→ Spouštím backpropagation...</div>}
    </div>
  )
}

function BackpropFormula() {
  return (
    <div style={{ marginTop: 12, background: 'rgba(239,68,68,.06)', border: '1px solid rgba(239,68,68,.2)', borderRadius: 9, padding: 12 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#f87171', marginBottom: 8 }}>Chyba (Loss)</div>
      <div style={{ fontFamily: 'monospace', fontSize: 11, color: '#cbd5e1', lineHeight: 1.8 }}>
        L = ½ × (predikce - cíl)²<br/>
        gradient = ∂L/∂w<br/>
        <span style={{ color: '#f87171' }}>← šíří se zpět sítí</span>
      </div>
    </div>
  )
}

function UpdateFormula() {
  return (
    <div style={{ marginTop: 12, background: 'rgba(34,197,94,.06)', border: '1px solid rgba(34,197,94,.2)', borderRadius: 9, padding: 12 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#4ade80', marginBottom: 8 }}>Aktualizace vah</div>
      <div style={{ fontFamily: 'monospace', fontSize: 11, color: '#cbd5e1', lineHeight: 1.8 }}>
        w<sub>nové</sub> = w<sub>staré</sub> - η × ∇L<br/>
        η (eta) = 0.3 (learning rate)<br/>
        <span style={{ color: '#4ade80' }}>✓ váhy upraveny</span>
      </div>
    </div>
  )
}
