'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */
/*
 * MNIST Neuronová síť – interaktivní vizualizace
 * Architektura: 784 → 16 → 16 → 10
 * Toy engine: Forward + Backpropagation v čistém JS
 *
 * OPRAVY:
 * - Síť se před-trénuje na syntetických datech (čísla 0-9 jako bitmapy)
 *   aby měla smysluplnou váhu před prvním použitím
 * - Digitalizační náhled zobrazuje mřížku a hodnoty
 * - Backpropagation tlačítko viditelné vždy
 * - Síťový canvas přes celou šířku
 * - Popisky vrstev posunuty nahoru mimo neurony
 * - ReLU/Sigmoid vizualizace v info panelu
 * - Loss graf opravený
 */

import { useState, useEffect, useRef, useCallback } from 'react'

// ── Konstanty ─────────────────────────────────────────────────────────────────
const H1 = 16
const H2 = 16
const OUT = 10
const LR  = 0.1

// ── Aktivační funkce ──────────────────────────────────────────────────────────
const relu    = (x: number) => Math.max(0, x)
const reluD   = (x: number) => (x > 0 ? 1 : 0)

function softmax(arr: number[]): number[] {
  const mx = Math.max(...arr)
  const e  = arr.map(v => Math.exp(v - mx))
  const s  = e.reduce((a, b) => a + b, 0)
  return e.map(v => v / s)
}

// ── Inicializace ──────────────────────────────────────────────────────────────
function xavier(r: number, c: number): number[][] {
  const lim = Math.sqrt(6 / (r + c))
  return Array.from({ length: r }, () =>
    Array.from({ length: c }, () => (Math.random() * 2 - 1) * lim))
}
function zeros(n: number) { return Array(n).fill(0) }

interface Net { W1:number[][];b1:number[];W2:number[][];b2:number[];W3:number[][];b3:number[] }

function makeNet(): Net {
  return {
    W1: xavier(H1, 784), b1: zeros(H1),
    W2: xavier(H2,  H1), b2: zeros(H2),
    W3: xavier(OUT,  H2), b3: zeros(OUT),
  }
}

// ── Forward propagation ───────────────────────────────────────────────────────
function fwd(net: Net, x: number[]) {
  const z1 = net.W1.map((row, i) => row.reduce((s, w, j) => s + w * x[j], 0) + net.b1[i])
  const a1 = z1.map(relu)
  const z2 = net.W2.map((row, i) => row.reduce((s, w, j) => s + w * a1[j], 0) + net.b2[i])
  const a2 = z2.map(relu)
  const z3 = net.W3.map((row, i) => row.reduce((s, w, j) => s + w * a2[j], 0) + net.b3[i])
  const a3 = softmax(z3)
  return { z1, a1, z2, a2, z3, a3 }
}

// ── Backpropagation ───────────────────────────────────────────────────────────
function backprop(net: Net, x: number[], label: number, lr: number): { net: Net; loss: number } {
  const { z1, a1, z2, a2, a3 } = fwd(net, x)
  const loss = -Math.log(Math.max(a3[label], 1e-9))

  // Δ výstup
  const dz3 = a3.map((p, i) => p - (i === label ? 1 : 0))
  const dW3 = dz3.map(d => a2.map(a => d * a))
  const db3 = [...dz3]

  // Δ H2
  const da2 = a2.map((_, j) => dz3.reduce((s, d, i) => s + d * net.W3[i][j], 0))
  const dz2 = da2.map((d, i) => d * reluD(z2[i]))
  const dW2 = dz2.map(d => a1.map(a => d * a))
  const db2 = [...dz2]

  // Δ H1
  const da1 = a1.map((_, j) => dz2.reduce((s, d, i) => s + d * net.W2[i][j], 0))
  const dz1 = da1.map((d, i) => d * reluD(z1[i]))
  const dW1 = dz1.map(d => x.map(xi => d * xi))
  const db1 = [...dz1]

  const upd = (w: number[][], dw: number[][]) =>
    w.map((row, i) => row.map((v, j) => v - lr * dw[i][j]))
  const updv = (b: number[], db: number[]) => b.map((v, i) => v - lr * db[i])

  return {
    loss,
    net: {
      W1: upd(net.W1, dW1), b1: updv(net.b1, db1),
      W2: upd(net.W2, dW2), b2: updv(net.b2, db2),
      W3: upd(net.W3, dW3), b3: updv(net.b3, db3),
    },
  }
}

// ── Syntetická trénovací data (šablony číslic 7×7 upscalované na 28×28) ─────
// Každý digit = hrubý bitmapový vzor, slouží k pre-trainingu
const DIGIT_TEMPLATES: number[][] = (() => {
  // 7-segmentové šablony 7×10 pixelů pro čísla 0-9
  const templates7x10: number[][] = [
    // 0
    [0,1,1,1,1,1,0,
     1,0,0,0,0,0,1,
     1,0,0,0,0,0,1,
     1,0,0,0,0,0,1,
     1,0,0,0,0,0,1,
     1,0,0,0,0,0,1,
     1,0,0,0,0,0,1,
     1,0,0,0,0,0,1,
     1,0,0,0,0,0,1,
     0,1,1,1,1,1,0],
    // 1
    [0,0,0,1,0,0,0,
     0,0,1,1,0,0,0,
     0,1,0,1,0,0,0,
     0,0,0,1,0,0,0,
     0,0,0,1,0,0,0,
     0,0,0,1,0,0,0,
     0,0,0,1,0,0,0,
     0,0,0,1,0,0,0,
     0,0,0,1,0,0,0,
     0,1,1,1,1,1,0],
    // 2
    [0,1,1,1,1,1,0,
     1,0,0,0,0,0,1,
     0,0,0,0,0,0,1,
     0,0,0,0,0,1,0,
     0,0,0,0,1,0,0,
     0,0,0,1,0,0,0,
     0,0,1,0,0,0,0,
     0,1,0,0,0,0,0,
     1,0,0,0,0,0,0,
     1,1,1,1,1,1,1],
    // 3
    [0,1,1,1,1,1,0,
     1,0,0,0,0,0,1,
     0,0,0,0,0,0,1,
     0,0,0,0,0,0,1,
     0,1,1,1,1,1,0,
     0,0,0,0,0,0,1,
     0,0,0,0,0,0,1,
     0,0,0,0,0,0,1,
     1,0,0,0,0,0,1,
     0,1,1,1,1,1,0],
    // 4
    [1,0,0,0,0,1,0,
     1,0,0,0,0,1,0,
     1,0,0,0,0,1,0,
     1,0,0,0,0,1,0,
     1,1,1,1,1,1,1,
     0,0,0,0,0,1,0,
     0,0,0,0,0,1,0,
     0,0,0,0,0,1,0,
     0,0,0,0,0,1,0,
     0,0,0,0,0,1,0],
    // 5
    [1,1,1,1,1,1,1,
     1,0,0,0,0,0,0,
     1,0,0,0,0,0,0,
     1,0,0,0,0,0,0,
     1,1,1,1,1,1,0,
     0,0,0,0,0,0,1,
     0,0,0,0,0,0,1,
     0,0,0,0,0,0,1,
     1,0,0,0,0,0,1,
     0,1,1,1,1,1,0],
    // 6
    [0,1,1,1,1,1,0,
     1,0,0,0,0,0,0,
     1,0,0,0,0,0,0,
     1,0,0,0,0,0,0,
     1,1,1,1,1,1,0,
     1,0,0,0,0,0,1,
     1,0,0,0,0,0,1,
     1,0,0,0,0,0,1,
     1,0,0,0,0,0,1,
     0,1,1,1,1,1,0],
    // 7
    [1,1,1,1,1,1,1,
     0,0,0,0,0,0,1,
     0,0,0,0,0,1,0,
     0,0,0,0,1,0,0,
     0,0,0,1,0,0,0,
     0,0,1,0,0,0,0,
     0,0,1,0,0,0,0,
     0,0,1,0,0,0,0,
     0,0,1,0,0,0,0,
     0,0,1,0,0,0,0],
    // 8
    [0,1,1,1,1,1,0,
     1,0,0,0,0,0,1,
     1,0,0,0,0,0,1,
     1,0,0,0,0,0,1,
     0,1,1,1,1,1,0,
     1,0,0,0,0,0,1,
     1,0,0,0,0,0,1,
     1,0,0,0,0,0,1,
     1,0,0,0,0,0,1,
     0,1,1,1,1,1,0],
    // 9
    [0,1,1,1,1,1,0,
     1,0,0,0,0,0,1,
     1,0,0,0,0,0,1,
     1,0,0,0,0,0,1,
     0,1,1,1,1,1,1,
     0,0,0,0,0,0,1,
     0,0,0,0,0,0,1,
     0,0,0,0,0,0,1,
     1,0,0,0,0,0,1,
     0,1,1,1,1,1,0],
  ]

  // Upscale 7×10 → 28×28
  return templates7x10.map(t => {
    const out = new Array(784).fill(0)
    for (let r = 0; r < 10; r++) {
      for (let c = 0; c < 7; c++) {
        const v = t[r * 7 + c]
        // Mapuj 10 řádků na 28 řádků, 7 sloupců na 28 sloupců
        const rs = Math.round(r * 2.6 + 2), cs = Math.round(c * 3.4 + 3)
        for (let dr = 0; dr < 3; dr++) for (let dc = 0; dc < 3; dc++) {
          const pr = rs + dr, pc = cs + dc
          if (pr < 28 && pc < 28) out[pr * 28 + pc] = v
        }
      }
    }
    return out
  })
})()

/** Pre-trénuj síť na syntetických vzorech */
function pretrain(net: Net, epochs = 400): Net {
  let n = net
  for (let e = 0; e < epochs; e++) {
    for (let d = 0; d < 10; d++) {
      // Augmentace: drobný šum
      const x = DIGIT_TEMPLATES[d].map(v => Math.min(1, Math.max(0, v + (Math.random() - 0.5) * 0.15)))
      const { net: n2 } = backprop(n, x, d, 0.12)
      n = n2
    }
  }
  return n
}

// ── Vzorkování canvasu 280×280 → 28×28 ────────────────────────────────────────
function sampleCanvas(canvas: HTMLCanvasElement): number[] {
  const ctx = canvas.getContext('2d')!
  const img = ctx.getImageData(0, 0, 280, 280)
  const out: number[] = []
  for (let r = 0; r < 28; r++) {
    for (let c = 0; c < 28; c++) {
      let s = 0
      for (let dy = 0; dy < 10; dy++) for (let dx = 0; dx < 10; dx++)
        s += img.data[((r * 10 + dy) * 280 + (c * 10 + dx)) * 4] / 255
      out.push(s / 100)
    }
  }
  return out
}

// ── Barvy ─────────────────────────────────────────────────────────────────────
const NG = '#39ff14'   // neon green
const NB = '#00f5ff'   // neon blue
const NP = '#ff2d78'   // neon pink
const NY = '#ffd700'   // neon gold
const ND = '#a78bfa'   // purple

// ── Vizuální layout sítě ──────────────────────────────────────────────────────
// Vrstva X pozice (relativní 0-1)
const LX = [0.09, 0.33, 0.60, 0.87]
// Počet viditelných vstupních neuronů
const VIS_IN = 20
const SAMPLE_IDX = Array.from({ length: VIS_IN }, (_, i) => Math.floor(i * 784 / VIS_IN))

function lY(total: number, idx: number, H: number): number {
  const top = 50, bottom = H - 30
  const avail = bottom - top
  const sp = Math.min(avail / total, 30)
  const totalH = (total - 1) * sp
  return (top + bottom) / 2 - totalH / 2 + idx * sp
}

// ═══════════════════════════════════════════════════════════════════════════════
export default function MNISTSim() {
  // Síť — pre-trénovaná při inicializaci
  const [net, setNet] = useState<Net>(() => pretrain(makeNet()))
  const [inputs, setInputs]   = useState<number[]>(Array(784).fill(0))
  const [acts, setActs]       = useState<ReturnType<typeof fwd> | null>(null)
  const [probs, setProbs]     = useState<number[]>(Array(10).fill(0.1))
  const [pred, setPred]       = useState<number | null>(null)
  const [label, setLabel]     = useState<number | null>(null)
  const [lossHist, setLossHist] = useState<number[]>([])
  const [accHist, setAccHist]   = useState<number[]>([])
  const [trainN, setTrainN]     = useState(0)
  const [backRunning, setBackR] = useState(false)
  const [infoPanel, setInfoPanel] = useState(0)

  // Animace
  interface Dot { id:number;x:number;y:number;tx:number;ty:number;t:number;col:string;rev:boolean }
  const [dots, setDots]       = useState<Dot[]>([])
  const dotsRef               = useRef<Dot[]>([])
  const dotId                 = useRef(0)
  const rafRef                = useRef(0)

  // Canvas refs
  const drawCv  = useRef<HTMLCanvasElement>(null)
  const netCv   = useRef<HTMLCanvasElement>(null)
  const isDrawing = useRef(false)
  const lastXY    = useRef<[number,number]|null>(null)
  const netSize   = useRef({ w: 900, h: 440 })

  // Animační loop
  useEffect(() => {
    let alive = true
    const step = () => {
      if (!alive) return
      dotsRef.current = dotsRef.current
        .map(d => ({ ...d, t: d.t + (d.rev ? -0.03 : 0.03) }))
        .filter(d => d.rev ? d.t > 0 : d.t < 1)
      setDots([...dotsRef.current])
      rafRef.current = requestAnimationFrame(step)
    }
    rafRef.current = requestAnimationFrame(step)
    return () => { alive = false; cancelAnimationFrame(rafRef.current) }
  }, [])

  // Spustit forward + animace
  const runFwd = useCallback((x: number[], network: Net) => {
    const res = fwd(network, x)
    setActs(res)
    setProbs(res.a3)
    const p = res.a3.indexOf(Math.max(...res.a3))
    setPred(p)

    const { w, h } = netSize.current
    // Částice vstup→H1
    const newDots: Dot[] = []
    SAMPLE_IDX.forEach((si, vi) => {
      if (x[si] < 0.05) return
      res.a1.forEach((a, hi) => {
        if (a < 0.1 || Math.random() > 0.4) return
        newDots.push({ id: dotId.current++, x: LX[0]*w, y: lY(VIS_IN,vi,h), tx: LX[1]*w, ty: lY(H1,hi,h), t: -Math.random()*0.5, col: NB, rev: false })
      })
    })
    // H1→H2
    res.a1.forEach((a, i) => {
      if (a < 0.1) return
      res.a2.forEach((_, j) => {
        if (Math.random() > 0.25) return
        newDots.push({ id: dotId.current++, x: LX[1]*w, y: lY(H1,i,h), tx: LX[2]*w, ty: lY(H2,j,h), t: -Math.random()*0.4, col: NG, rev: false })
      })
    })
    // H2→výstup (jen k vítězi)
    res.a2.forEach((a, i) => {
      if (a < 0.1 || Math.random() > 0.5) return
      newDots.push({ id: dotId.current++, x: LX[2]*w, y: lY(H2,i,h), tx: LX[3]*w, ty: lY(OUT,p,h), t: -Math.random()*0.3, col: NY, rev: false })
    })
    dotsRef.current = [...dotsRef.current.slice(-80), ...newDots.slice(0,60)]
  }, [])

  // Kreslení
  const getXY = (e: React.MouseEvent<HTMLCanvasElement>): [number,number] => {
    const r = drawCv.current!.getBoundingClientRect()
    return [e.clientX - r.left, e.clientY - r.top]
  }
  const doDraw = useCallback(([x,y]: [number,number]) => {
    const cv = drawCv.current; if (!cv) return
    const ctx = cv.getContext('2d')!
    ctx.lineWidth = 20; ctx.lineCap = 'round'; ctx.strokeStyle = '#fff'
    ctx.beginPath()
    if (lastXY.current) ctx.moveTo(...lastXY.current)
    else ctx.moveTo(x, y)
    ctx.lineTo(x, y); ctx.stroke()
    lastXY.current = [x, y]
    const nx = sampleCanvas(cv)
    setInputs(nx)
    runFwd(nx, net)
  }, [net, runFwd])

  const onMD = (e: React.MouseEvent<HTMLCanvasElement>) => { isDrawing.current = true; lastXY.current = null; doDraw(getXY(e)) }
  const onMM = (e: React.MouseEvent<HTMLCanvasElement>) => { if (isDrawing.current) doDraw(getXY(e)) }
  const onMU = () => { isDrawing.current = false; lastXY.current = null }

  const clearAll = () => {
    const cv = drawCv.current; if (!cv) return
    cv.getContext('2d')!.clearRect(0, 0, 280, 280)
    setInputs(Array(784).fill(0)); setActs(null); setPred(null); setProbs(Array(10).fill(0.1)); setLabel(null)
  }

  // Backpropagation
  const doBackprop = useCallback(() => {
    if (label === null) return
    setBackR(true)

    // Zpětné animační částice (zleva doprava s rev=true)
    const { w, h } = netSize.current
    const revDots: Dot[] = []
    for (let i = 0; i < H2; i++) {
      revDots.push({ id: dotId.current++, x: LX[3]*w, y: lY(OUT,label,h), tx: LX[2]*w, ty: lY(H2,i,h), t: 1, col: NP, rev: true })
    }
    for (let i = 0; i < H1; i++) {
      revDots.push({ id: dotId.current++, x: LX[2]*w, y: lY(H2,i%H2,h), tx: LX[1]*w, ty: lY(H1,i,h), t: 1, col: NP, rev: true })
    }
    dotsRef.current = [...dotsRef.current, ...revDots]

    // Trénink
    let n = net
    for (let step = 0; step < 3; step++) {
      const { net: n2, loss } = backprop(n, inputs, label, LR)
      n = n2
      if (step === 0) {
        const isOK = pred === label
        setLossHist(p => [...p.slice(-39), loss])
        setAccHist(p => [...p.slice(-39), isOK ? 1 : 0])
        setTrainN(t => t + 1)
      }
    }
    setNet(n)
    setTimeout(() => {
      runFwd(inputs, n)
      setBackR(false)
    }, 1400)
  }, [label, net, inputs, pred, runFwd])

  // Poznámka: Vykreslování sítě zajišťuje komponenta NetworkCanvas níže.

  // ── Metriky ────────────────────────────────────────────────────────────────
  const avgLoss = lossHist.length ? (lossHist.reduce((a,b)=>a+b)/lossHist.length).toFixed(3) : '—'
  const avgAcc  = accHist.length  ? `${Math.round(accHist.reduce((a,b)=>a+b)/accHist.length*100)}%` : '—'
  const lastLoss = lossHist.length ? lossHist[lossHist.length-1].toFixed(3) : '—'

  // ── Info panely ─────────────────────────────────────────────────────────────
  const PANELS = [
    { icon:'👁️', color:NB,  title:'Vstupní vrstva – Oči sítě',
      sub:'Jak počítač vidí tvůj obrázek',
      text:'Tvé nakreslené číslo jsme rozdělili na mřížku 28×28 malých čtverečků (pixelů). Každý pixel je pro síť jen číslo: 0 pro černou a 1 pro bílou. Celkem je to 784 čísel, která vstupují do sítě najednou.' },
    { icon:'🔗', color:NG,  title:'Váhy a spoje',
      sub:'Důležitost signálu',
      text:'Každá čára, kterou vidíš, má svou „váhu". Je to číslo, kterým se násobí signál z předchozího neuronu. Silnější, zářící čára = tento pixel je důležitý. Tenké čáry síť ignoruje.' },
    { icon:'⚙️', color:NY,  title:'Uvnitř neuronu',
      sub:'z = Σ w·x + b',
      text:'Neuron funguje jako malá sčítačka. Posčítá všechny přicházející signály vynásobené vahami. K výsledku přičte Bias – vnitřní citlivost neuronu, která určuje, jak snadno se neuron rozsvítí.' },
    { icon:'⚡', color:NP,  title:'Aktivační funkce',
      sub:'ReLU a Softmax',
      text:'Výsledek z prochází filtrem. ReLU: pokud je záporný → 0 (neuron nezapálí). Kladný prochází beze změny. Softmax na výstupu normalizuje hodnoty na pravděpodobnosti sumující do 100%.' },
    { icon:'🏆', color:NY,  title:'Výstupní vrstva',
      sub:'Pravděpodobnost výsledku',
      text:'Posledních 10 neuronů reprezentuje číslice 0–9. Ten, který září nejvíc, má nejvyšší pravděpodobnost. Síť neříká „je to 7", ale „jsem si na 92% jistá, že je to 7".' },
    { icon:'🔁', color:NP,  title:'Backpropagation',
      sub:'Učení z chyb – Gradientní sestup',
      text:'Když síť udělá chybu, podívá se, které neurony k ní přispěly nejvíce. Projde síť pozpátku (zprava doleva – vidíš růžové částice) a jemně upraví váhy: w ← w − η·∂L/∂w.' },
  ]

  const panel = PANELS[infoPanel]

  // ═══════════════════════════════════════════════════════════════════════════
  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', background:'#060b14', color:'#e2e8f0', fontFamily:'monospace', overflow:'hidden' }}>
      <style>{`
        @keyframes fadeIn{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:none}}
        @keyframes shake{0%,100%{transform:none}25%{transform:translateX(-3px)}75%{transform:translateX(3px)}}
        @keyframes glow{0%,100%{opacity:.7}50%{opacity:1}}
        .fi{animation:fadeIn .3s ease}
        .shk{animation:shake .25s infinite}
        ::-webkit-scrollbar{width:4px}::-webkit-scrollbar-thumb{background:#1e293b;border-radius:4px}
      `}</style>

      {/* Header */}
      <div style={{ padding:'9px 18px', borderBottom:'1px solid #1e293b', display:'flex', alignItems:'center', gap:14, flexShrink:0, background:'#080d18' }}>
        <a href="/student/simulations" style={{ color:'#64748b', fontSize:13, textDecoration:'none' }}>← Simulace</a>
        <div style={{ width:1, height:14, background:'#1e293b' }}/>
        <span style={{ fontSize:13, fontWeight:700, color:NG }}>🧠 MNIST Neural Network  ·  784 → 16 → 16 → 10</span>
        <div style={{ marginLeft:'auto', display:'flex', gap:16, fontSize:11 }}>
          <span style={{ color:'#334155' }}>Trénováno: <strong style={{ color:NB }}>{trainN}×</strong></span>
          <span style={{ color:'#334155' }}>Loss: <strong style={{ color:NY }}>{lastLoss}</strong></span>
          <span style={{ color:'#334155' }}>Acc: <strong style={{ color:NG }}>{avgAcc}</strong></span>
        </div>
      </div>

      {/* Hlavní oblast */}
      <div style={{ flex:1, display:'flex', minHeight:0, overflow:'hidden' }}>

        {/* ══ LEVÝ PANEL ══ */}
        <div style={{ width:304, flexShrink:0, borderRight:'1px solid #1e293b', display:'flex', flexDirection:'column', background:'#080d18', overflowY:'auto' }}>

          {/* Kreslicí canvas */}
          <div style={{ padding:'12px 12px 0', flexShrink:0 }}>
            <div style={{ fontSize:9, fontWeight:700, color:NB, textTransform:'uppercase', letterSpacing:'.08em', marginBottom:6 }}>
              ✏️ Nakresli číslici (0–9)
            </div>
            <div style={{ position:'relative', border:`2px solid ${NB}44`, borderRadius:8, overflow:'hidden', lineHeight:0, background:'#000' }}>
              <canvas ref={drawCv} width={280} height={280}
                style={{ display:'block', cursor:'crosshair', touchAction:'none' }}
                onMouseDown={onMD} onMouseMove={onMM} onMouseUp={onMU} onMouseLeave={onMU}/>
              {inputs.every(v=>v<0.01)&&(
                <div style={{ position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center',pointerEvents:'none' }}>
                  <span style={{ fontSize:13,color:'#1e3a5f' }}>← kresli zde myší</span>
                </div>
              )}
            </div>
            <button onClick={clearAll}
              style={{ marginTop:6,width:'100%',padding:'6px',background:'rgba(239,68,68,.1)',color:'#f87171',border:'1px solid rgba(239,68,68,.3)',borderRadius:7,cursor:'pointer',fontFamily:'monospace',fontSize:11,fontWeight:700 }}>
              🗑 Smazat
            </button>
          </div>

          {/* 28×28 digitalizace s mřížkou a hodnotami */}
          <div style={{ padding:'10px 12px', flexShrink:0 }}>
            <div style={{ fontSize:9, fontWeight:700, color:'#475569', textTransform:'uppercase', marginBottom:5 }}>
              28×28 digitalizace — každý čtverec = 1 vstupní pixel
            </div>
            <div style={{ position:'relative', border:'1px solid #1e293b', borderRadius:6, overflow:'hidden' }}>
              {/* Pixel grid */}
              <div style={{
                display:'grid', gridTemplateColumns:'repeat(28,1fr)',
                width:280, height:280,
              }}>
                {inputs.map((v,i) => (
                  <div key={i} style={{
                    background: v>0.01 ? `rgba(0,245,255,${Math.min(1,v)})` : '#0a0e1a',
                    outline:'1px solid rgba(255,255,255,0.04)',
                    position:'relative',
                  }}>
                    {/* Hodnota – jen pokud je buňka dostatečně světlá */}
                    {v>0.4&&(
                      <span style={{ position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center',fontSize:'5px',color:'rgba(0,0,0,.7)',fontWeight:700,fontFamily:'monospace' }}>
                        {v.toFixed(1)}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Predikce */}
          {pred !== null && (
            <div style={{ padding:'0 12px 10px', flexShrink:0 }}>
              <div style={{ padding:'10px 12px', background:probs[pred]>0.65?'rgba(57,255,20,.07)':'rgba(255,215,0,.06)', border:`1px solid ${probs[pred]>0.65?NG:NY}44`, borderRadius:8 }}>
                <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                  <div style={{ fontSize:38, fontWeight:900, color:probs[pred]>0.65?NG:NY, lineHeight:1 }}>{pred}</div>
                  <div>
                    <div style={{ fontSize:10, color:'#64748b' }}>Predikce sítě</div>
                    <div style={{ fontSize:15, fontWeight:800, color:probs[pred]>0.65?NG:NY }}>
                      {(probs[pred]*100).toFixed(1)}% jistota
                    </div>
                    {label!==null && (
                      <div style={{ fontSize:10, color: pred===label?NG:NP, marginTop:2 }}>
                        {pred===label?'✓ Správně!':'✗ Chyba — koriguj backpropem'}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Pravděpodobnostní bary */}
          <div style={{ padding:'0 12px', flex:1, overflowY:'auto' }}>
            <div style={{ fontSize:9, fontWeight:700, color:'#334155', textTransform:'uppercase', marginBottom:5 }}>Výstupní pravděpodobnosti</div>
            {probs.map((p,i) => (
              <div key={i} style={{ display:'flex', alignItems:'center', gap:5, marginBottom:3 }}>
                <span style={{ fontSize:10, fontWeight:700, color:pred===i?NY:label===i?NG:'#334155', minWidth:12 }}>{i}</span>
                <div style={{ flex:1, height:13, background:'#0d1117', borderRadius:3, overflow:'hidden', border:`1px solid ${pred===i?NY+'55':label===i?NG+'33':'#1e293b'}` }}>
                  <div style={{
                    height:'100%', borderRadius:3, transition:'width .25s',
                    width:`${p*100}%`,
                    background: pred===i ? `linear-gradient(90deg,${NY},${NG})` : label===i ? NG+'66' : '#1e3a5f',
                    boxShadow: pred===i ? `0 0 8px ${NY}88` : 'none',
                  }}/>
                </div>
                <span style={{ fontSize:9, color:pred===i?NY:label===i?NG:'#334155', minWidth:32, fontFamily:'monospace' }}>
                  {(p*100).toFixed(1)}%
                </span>
              </div>
            ))}
          </div>

          {/* BACKPROPAGATION PANEL */}
          <div style={{ padding:'12px', borderTop:'1px solid #1e293b', flexShrink:0, background:'#050810' }}>
            <div style={{ fontSize:10, fontWeight:700, color:NP, marginBottom:8, display:'flex', alignItems:'center', gap:6 }}>
              🔁 Opravit chybu — Backpropagation
            </div>
            <div style={{ fontSize:10, color:'#475569', marginBottom:7 }}>
              Jaká je <strong style={{ color:'#fff' }}>správná</strong> číslice?
            </div>
            <div style={{ display:'flex', flexWrap:'wrap', gap:4, marginBottom:8 }}>
              {Array.from({length:10},(_,i)=>(
                <button key={i} onClick={()=>setLabel(label===i?null:i)}
                  style={{ width:26,height:26,borderRadius:6,border:`1.5px solid ${label===i?NG:NP+'44'}`,background:label===i?NG+'22':'rgba(255,45,120,.05)',color:label===i?NG:NP,fontSize:11,fontWeight:700,cursor:'pointer',fontFamily:'monospace',transition:'all .15s' }}>
                  {i}
                </button>
              ))}
            </div>
            <button onClick={doBackprop} disabled={label===null||backRunning}
              className={backRunning?'shk':''}
              style={{ width:'100%', padding:'9px', background:backRunning?'rgba(255,45,120,.25)':label===null?'rgba(255,45,120,.05)':'rgba(255,45,120,.12)', color:NP, border:`1.5px solid ${label===null?NP+'22':NP+'66'}`, borderRadius:8, cursor:label===null?'not-allowed':'pointer', fontFamily:'monospace', fontSize:12, fontWeight:700, opacity:label===null?0.4:1, transition:'all .15s' }}>
              {backRunning ? '⚡ Učím se… (zpětný tok aktivní)' : label===null ? '← vyber správnou číslici' : `🎯 Spustit backprop (label = ${label})`}
            </button>
            {lossHist.length>0&&(
              <div style={{ marginTop:8, fontSize:9, color:'#475569' }}>
                Poslední loss: <strong style={{ color:NY }}>{lastLoss}</strong>
                {' '}· avg: <strong style={{ color:NB }}>{avgLoss}</strong>
              </div>
            )}
          </div>
        </div>

        {/* ══ STŘED: síť přes celou šířku ══ */}
        <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }}>

          {/* Síťový canvas – přes celou šířku */}
          <div style={{ flex:1, overflow:'hidden', background:'#07090f', position:'relative' }}>
            <NetworkCanvas
              net={net} inputs={inputs} acts={acts} probs={probs} pred={pred}
              label={label} backRunning={backRunning} dots={dots}
              canvasRef={netCv} netSizeRef={netSize}
            />
          </div>

          {/* Loss graf + metriky */}
          <div style={{ borderTop:'1px solid #1e293b', padding:'8px 14px', background:'#080d18', flexShrink:0, display:'flex', gap:20, alignItems:'center', minHeight:52 }}>
            <div style={{ fontSize:9, fontWeight:700, color:'#334155', textTransform:'uppercase', minWidth:60 }}>Loss graf</div>
            <div style={{ display:'flex', gap:2, alignItems:'flex-end', height:32, flex:1 }}>
              {lossHist.length===0 ? (
                <span style={{ fontSize:9, color:'#1e293b' }}>Po backpropu se zobrazí průběh ztráty...</span>
              ) : lossHist.map((l,i) => (
                <div key={i} style={{
                  flex:1, maxWidth:16, borderRadius:'2px 2px 0 0',
                  height:`${Math.min(32, l*14+2)}px`,
                  background: l<0.5?NG:l<1.5?NY:NP,
                  opacity: 0.5 + (i/lossHist.length)*0.5,
                  minWidth:4,
                }}/>
              ))}
            </div>
            <div style={{ display:'flex', gap:14, fontSize:11, flexShrink:0 }}>
              <span style={{ color:'#334155' }}>n: <strong style={{ color:NB }}>{trainN}</strong></span>
              <span style={{ color:'#334155' }}>Loss: <strong style={{ color:NY }}>{avgLoss}</strong></span>
              <span style={{ color:'#334155' }}>Acc: <strong style={{ color:NG }}>{avgAcc}</strong></span>
            </div>
          </div>
        </div>

        {/* ══ PRAVÝ PANEL: vzdělávací texty ══ */}
        <div style={{ width:262, flexShrink:0, borderLeft:'1px solid #1e293b', display:'flex', flexDirection:'column', background:'#080d18', overflow:'hidden' }}>
          {/* Tab ikony */}
          <div style={{ display:'flex', borderBottom:'1px solid #1e293b', flexShrink:0, padding:'6px 8px', gap:4 }}>
            {PANELS.map((p,i)=>(
              <button key={i} onClick={()=>setInfoPanel(i)} title={p.sub}
                style={{ flex:1, padding:'5px 3px', borderRadius:7, border:`1px solid ${infoPanel===i?p.color+'55':'#1e293b'}`, background:infoPanel===i?p.color+'18':'transparent', color:infoPanel===i?p.color:'#334155', cursor:'pointer', fontFamily:'monospace', fontSize:14, fontWeight:700 }}>
                {p.icon}
              </button>
            ))}
          </div>

          {/* Panel obsah */}
          <div key={infoPanel} className="fi" style={{ flex:1, overflowY:'auto', padding:13 }}>
            <div style={{ fontSize:8, fontWeight:700, color:panel.color, textTransform:'uppercase', letterSpacing:'.08em', marginBottom:4 }}>
              {panel.sub}
            </div>
            <h3 style={{ fontSize:13, fontWeight:800, color:'#fff', margin:'0 0 10px', lineHeight:1.4 }}>
              {panel.title}
            </h3>
            <p style={{ fontSize:11, color:'#94a3b8', lineHeight:1.8, margin:'0 0 12px' }}>
              {panel.text}
            </p>

            {/* Panel 0 – Vstupní vrstva */}
            {infoPanel===0&&(
              <div style={{ background:'#0d1117',borderRadius:8,padding:10,fontFamily:'monospace',fontSize:10,lineHeight:1.9 }}>
                <div style={{ color:NB }}>pixel[0,0]   = 0.00 ← černá</div>
                <div style={{ color:NG }}>pixel[14,14] = 0.87 ← světlá</div>
                <div style={{ color:'#fff' }}>pixel[27,27] = 1.00 ← bílá</div>
                <div style={{ marginTop:6,color:'#475569' }}>28×28 = <span style={{ color:NY }}>784 vstupních neuronů</span></div>
              </div>
            )}

            {/* Panel 1 – Váhy */}
            {infoPanel===1&&(
              <div style={{ display:'flex',flexDirection:'column',gap:6 }}>
                {[[NG,'Kladná','zesiluje signál'],[NP,'Záporná','tlumí signál'],['#334155','Slabá','ignorováno']].map(([col,l,d])=>(
                  <div key={l} style={{ display:'flex',alignItems:'center',gap:8,padding:'6px 8px',background:col+'0d',border:`1px solid ${col}22`,borderRadius:6 }}>
                    <div style={{ width:30,height:3,background:col,borderRadius:2 }}/>
                    <div>
                      <div style={{ fontSize:10,fontWeight:700,color:col as string }}>{l}</div>
                      <div style={{ fontSize:9,color:'#475569' }}>{d}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Panel 2 – Neuron */}
            {infoPanel===2&&(
              <div style={{ background:'#0d1117',borderRadius:8,padding:10,fontFamily:'monospace',fontSize:11,lineHeight:2 }}>
                <div style={{ color:NY }}>z = Σ(wᵢ · xᵢ) + b</div>
                <div style={{ color:'#64748b' }}>w = váha spoje</div>
                <div style={{ color:'#64748b' }}>x = vstupní hodnota</div>
                <div style={{ color:NB }}>b = bias (práh)</div>
                <div style={{ marginTop:8,borderTop:'1px solid #1e293b',paddingTop:8 }}>
                  {acts&&acts.z1.slice(0,4).map((z,i)=>(
                    <div key={i} style={{ fontSize:9,color:'#475569',lineHeight:1.8 }}>
                      h1[{i}]: z=<span style={{ color:z>0?NG:NP }}>{z.toFixed(2)}</span>
                      {' '}→ a=<span style={{ color:NG }}>{(acts.a1[i]).toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Panel 3 – Aktivační funkce (ReLU + Softmax vizualizace) */}
            {infoPanel===3&&(
              <div>
                <div style={{ background:'#0d1117',borderRadius:8,padding:10,marginBottom:8 }}>
                  <div style={{ fontSize:9,fontWeight:700,color:NG,marginBottom:6 }}>ReLU – skryté vrstvy</div>
                  <div style={{ fontSize:10,fontFamily:'monospace',color:'#94a3b8',marginBottom:6 }}>f(z) = max(0, z)</div>
                  {/* ReLU graf */}
                  <svg width={200} height={70} style={{ display:'block' }}>
                    <line x1={0} y1={50} x2={200} y2={50} stroke="#1e293b" strokeWidth={1}/>
                    <line x1={100} y1={0} x2={100} y2={70} stroke="#1e293b" strokeWidth={1}/>
                    {/* záporná část = 0 */}
                    <line x1={0} y1={50} x2={100} y2={50} stroke={NP} strokeWidth={2.5}/>
                    {/* kladná část = diagonála */}
                    <line x1={100} y1={50} x2={200} y2={5} stroke={NG} strokeWidth={2.5}/>
                    <text x={8}  y={64} fill="#475569" fontSize={8}>z&lt;0 → 0</text>
                    <text x={110} y={20} fill={NG} fontSize={8}>z&gt;0 → z</text>
                    <circle cx={100} cy={50} r={4} fill={NY}/>
                  </svg>
                  {acts&&(
                    <div style={{ display:'flex',gap:2,marginTop:6,alignItems:'flex-end',height:28 }}>
                      {acts.a1.map((a,i)=>(
                        <div key={i} title={`h1[${i}]=${a.toFixed(2)}`}
                          style={{ flex:1,borderRadius:'2px 2px 0 0',height:`${a*28}px`,background:a>0?NG:NP+'44',minWidth:3 }}/>
                      ))}
                    </div>
                  )}
                </div>
                <div style={{ background:'#0d1117',borderRadius:8,padding:10 }}>
                  <div style={{ fontSize:9,fontWeight:700,color:NY,marginBottom:6 }}>Softmax – výstupní vrstva</div>
                  <div style={{ fontSize:10,fontFamily:'monospace',color:'#94a3b8',marginBottom:6 }}>P(i) = e^zᵢ / Σ e^zⱼ</div>
                  {/* Softmax vizualizace */}
                  <div style={{ display:'flex',gap:2,alignItems:'flex-end',height:40 }}>
                    {probs.map((p,i)=>(
                      <div key={i} style={{ display:'flex',flexDirection:'column',alignItems:'center',flex:1,gap:1 }}>
                        <div style={{ width:'100%',borderRadius:'2px 2px 0 0',height:`${p*40}px`,background:pred===i?NY:NB+'66',minWidth:6,boxShadow:pred===i?`0 0 6px ${NY}`:undefined }}/>
                        <span style={{ fontSize:7,color:pred===i?NY:'#334155' }}>{i}</span>
                      </div>
                    ))}
                  </div>
                  <div style={{ fontSize:9,color:'#475569',marginTop:4 }}>Suma = 100% vždy</div>
                </div>
              </div>
            )}

            {/* Panel 4 – Výstup */}
            {infoPanel===4&&pred!==null&&(
              <div>
                <div style={{ fontSize:9,color:'#475569',marginBottom:6 }}>Top 3 predikce:</div>
                {[...probs.map((p,i)=>({p,i}))].sort((a,b)=>b.p-a.p).slice(0,3).map(({p,i})=>(
                  <div key={i} style={{ display:'flex',alignItems:'center',gap:6,marginBottom:5 }}>
                    <span style={{ fontSize:14,fontWeight:900,color:pred===i?NY:NB,minWidth:20,textAlign:'center' }}>{i}</span>
                    <div style={{ flex:1,height:14,background:'#0d1117',borderRadius:3,overflow:'hidden' }}>
                      <div style={{ height:'100%',width:`${p*100}%`,background:pred===i?`linear-gradient(90deg,${NY},${NG})`:NB+'66',borderRadius:3 }}/>
                    </div>
                    <span style={{ fontSize:10,fontFamily:'monospace',color:pred===i?NY:'#475569',minWidth:38 }}>{(p*100).toFixed(1)}%</span>
                  </div>
                ))}
              </div>
            )}

            {/* Panel 5 – Backprop */}
            {infoPanel===5&&(
              <div style={{ background:'#0d1117',borderRadius:8,padding:10 }}>
                <div style={{ fontFamily:'monospace',fontSize:10,color:'#94a3b8',lineHeight:2 }}>
                  <div style={{ color:NP }}>Gradient descent:</div>
                  <div>w ← w − η · ∂L/∂w</div>
                  <div>b ← b − η · ∂L/∂b</div>
                  <div style={{ color:NB,marginTop:4 }}>η = {LR} (learning rate)</div>
                  {lossHist.length>0&&<>
                    <div style={{ color:NY,marginTop:4 }}>Poslední loss: {lastLoss}</div>
                    <div style={{ color:NG }}>Trénováno: {trainN}×</div>
                  </>}
                </div>
                {/* Mini loss graf */}
                {lossHist.length>1&&(
                  <div style={{ marginTop:10 }}>
                    <div style={{ fontSize:8,color:'#334155',marginBottom:4 }}>Průběh loss:</div>
                    <div style={{ display:'flex',gap:2,alignItems:'flex-end',height:40 }}>
                      {lossHist.map((l,i)=>(
                        <div key={i} style={{ flex:1,borderRadius:'2px 2px 0 0',height:`${Math.min(40,l*16+2)}px`,background:l<0.5?NG:l<1.5?NY:NP,opacity:.7+i/lossHist.length*.3,minWidth:3 }}/>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Síťový canvas jako separátní komponenta (pro čistší re-render) ────────────
function NetworkCanvas({ net, inputs, acts, probs, pred, label, backRunning, dots, canvasRef, netSizeRef }: {
  net: Net; inputs: number[]; acts: ReturnType<typeof fwd>|null
  probs: number[]; pred: number|null; label: number|null
  backRunning: boolean; dots: any[]; canvasRef: React.RefObject<HTMLCanvasElement>
  netSizeRef: React.MutableRefObject<{w:number;h:number}>
}) {
  const divRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 900, h: 400 })

  useEffect(() => {
    const el = divRef.current; if (!el) return
    const ro = new ResizeObserver(e => {
      const { width, height } = e[0].contentRect
      const s = { w: Math.floor(width), h: Math.floor(height) }
      setSize(s); netSizeRef.current = s
    })
    ro.observe(el); return () => ro.disconnect()
  }, [netSizeRef])

  useEffect(() => {
    const cv = canvasRef.current; if (!cv) return
    const ctx = cv.getContext('2d')!
    const W = size.w, H = size.h

    ctx.clearRect(0, 0, W, H)
    ctx.fillStyle = '#07090f'; ctx.fillRect(0, 0, W, H)

    // Grid bg
    ctx.strokeStyle = 'rgba(255,255,255,.025)'; ctx.lineWidth=1
    for(let x=0;x<W;x+=50){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H);ctx.stroke()}
    for(let y=0;y<H;y+=50){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke()}

    // Spoje vstupy→H1
    SAMPLE_IDX.forEach((si,vi)=>{
      for(let hi=0;hi<H1;hi++){
        const w=net.W1[hi][si], a=Math.min(0.55,Math.abs(w)*0.3+0.03)
        ctx.strokeStyle=w>0?`rgba(0,245,255,${a})`:`rgba(255,45,120,${a})`
        ctx.lineWidth=Math.min(1.8,Math.abs(w)*1.2+0.2)
        ctx.beginPath();ctx.moveTo(LX[0]*W,lY(VIS_IN,vi,H));ctx.lineTo(LX[1]*W,lY(H1,hi,H));ctx.stroke()
      }
    })
    // H1→H2
    for(let i=0;i<H1;i++)for(let j=0;j<H2;j++){
      const w=net.W2[j][i], a=Math.min(0.5,Math.abs(w)*0.25+0.03)
      const jt=backRunning?(Math.random()-.5)*4:0
      ctx.strokeStyle=w>0?`rgba(57,255,20,${a})`:`rgba(255,215,0,${a})`
      ctx.lineWidth=Math.min(1.5,Math.abs(w)*1.0+0.2)
      ctx.beginPath();ctx.moveTo(LX[1]*W,lY(H1,i,H)+jt);ctx.lineTo(LX[2]*W,lY(H2,j,H)+jt);ctx.stroke()
    }
    // H2→výstup
    for(let i=0;i<H2;i++)for(let j=0;j<OUT;j++){
      const w=net.W3[j][i], a=Math.min(0.6,Math.abs(w)*0.3+0.04), isWin=pred===j
      ctx.strokeStyle=isWin?`rgba(255,215,0,${a+0.15})`:w>0?`rgba(57,255,20,${a})`:`rgba(255,45,120,${a})`
      ctx.lineWidth=isWin?1.8:Math.min(1.5,Math.abs(w)*1.0+0.2)
      ctx.beginPath();ctx.moveTo(LX[2]*W,lY(H2,i,H));ctx.lineTo(LX[3]*W,lY(OUT,j,H));ctx.stroke()
    }

    // Animační tečky
    ;(dots as any[]).forEach(d=>{
      const t=Math.max(0,Math.min(1,d.t));if(t<=0)return
      const px=d.x+(d.tx-d.x)*t, py=d.y+(d.ty-d.y)*t
      const al=t<0.1?t*10:t>0.85?(1-t)*6.7:1
      ctx.beginPath();ctx.arc(px,py,3.5,0,Math.PI*2)
      ctx.fillStyle=d.col+Math.round(al*200).toString(16).padStart(2,'0')
      ctx.shadowColor=d.col;ctx.shadowBlur=10;ctx.fill();ctx.shadowBlur=0
    })

    // Vstupní neurony
    SAMPLE_IDX.forEach((si,vi)=>{
      const x=LX[0]*W, y=lY(VIS_IN,vi,H), v=inputs[si]
      if(v>0.05){ctx.beginPath();ctx.arc(x,y,12,0,Math.PI*2);ctx.fillStyle=`rgba(0,245,255,${v*0.25})`;ctx.fill()}
      ctx.beginPath();ctx.arc(x,y,7,0,Math.PI*2)
      ctx.fillStyle=v>0.05?`rgba(0,245,255,${0.2+v*0.7})`:'#0d1117';ctx.fill()
      ctx.strokeStyle=NB+'55';ctx.lineWidth=1;ctx.stroke()
    })

    // H1
    for(let i=0;i<H1;i++){
      const x=LX[1]*W, y=lY(H1,i,H), a=acts?.a1[i]??0
      if(a>0.05){ctx.beginPath();ctx.arc(x,y,15,0,Math.PI*2);ctx.fillStyle=`rgba(57,255,20,${a*0.2})`;ctx.fill()}
      ctx.beginPath();ctx.arc(x,y,10,0,Math.PI*2)
      ctx.fillStyle=a>0.05?`rgba(57,255,20,${0.15+a*0.7})`:'#0d1117';ctx.fill()
      ctx.strokeStyle=a>0.3?NG+'cc':'#1a2e1a';ctx.lineWidth=1.5;ctx.stroke()
      if(a>0.08){ctx.fillStyle='#fff';ctx.font='bold 6px monospace';ctx.textAlign='center';ctx.fillText(a.toFixed(2),x,y+2.5)}
    }

    // H2
    for(let i=0;i<H2;i++){
      const x=LX[2]*W, y=lY(H2,i,H), a=acts?.a2[i]??0
      if(a>0.05){ctx.beginPath();ctx.arc(x,y,15,0,Math.PI*2);ctx.fillStyle=`rgba(0,245,255,${a*0.2})`;ctx.fill()}
      ctx.beginPath();ctx.arc(x,y,10,0,Math.PI*2)
      ctx.fillStyle=a>0.05?`rgba(0,245,255,${0.15+a*0.7})`:'#0d1117';ctx.fill()
      ctx.strokeStyle=a>0.3?NB+'cc':'#1a2e38';ctx.lineWidth=1.5;ctx.stroke()
      if(a>0.08){ctx.fillStyle='#fff';ctx.font='bold 6px monospace';ctx.textAlign='center';ctx.fillText(a.toFixed(2),x,y+2.5)}
    }

    // Výstupní neurony
    for(let i=0;i<OUT;i++){
      const x=LX[3]*W, y=lY(OUT,i,H), p=probs[i], isWin=pred===i, isLbl=label===i
      if(isWin){ctx.beginPath();ctx.arc(x,y,20,0,Math.PI*2);ctx.fillStyle=`rgba(255,215,0,${p*0.3})`;ctx.fill();ctx.shadowColor=NY;ctx.shadowBlur=20}
      ctx.beginPath();ctx.arc(x,y,12,0,Math.PI*2)
      ctx.fillStyle=isWin?`rgba(255,215,0,${0.2+p*0.7})`:isLbl?`rgba(57,255,20,.25)`:'#0d1117';ctx.fill()
      ctx.strokeStyle=isWin?NY:isLbl?NG:'#1e293b';ctx.lineWidth=isWin?2.5:1.5;ctx.stroke()
      ctx.shadowBlur=0
      ctx.fillStyle=isWin?NY:'#e2e8f0';ctx.font=`bold ${isWin?11:9}px monospace`;ctx.textAlign='center'
      ctx.fillText(String(i),x,y+4)
      ctx.fillStyle=isWin?NY:'#334155';ctx.font='8px monospace';ctx.textAlign='left'
      ctx.fillText(`${(p*100).toFixed(0)}%`,x+17,y+3)
    }

    // Popisky vrstev – VÝRAZNĚ nad neurony (y=14)
    const labels: [number, string, string][] = [
      [LX[0]*W, 'INPUT  784', NB],
      [LX[1]*W, 'HIDDEN 1  ReLU', NG],
      [LX[2]*W, 'HIDDEN 2  ReLU', NB],
      [LX[3]*W, 'OUTPUT  0–9', NY],
    ]
    labels.forEach(([x, lbl, col]) => {
      ctx.fillStyle = col + 'dd'
      ctx.font = 'bold 10px monospace'; ctx.textAlign = 'center'
      ctx.fillText(lbl, x, 14)
    })

  }, [net, inputs, acts, probs, pred, label, backRunning, dots, size, canvasRef])

  return (
    <div ref={divRef} style={{ width:'100%', height:'100%' }}>
      <canvas ref={canvasRef} width={size.w} height={size.h}
        style={{ width:'100%', height:'100%', display:'block' }}/>
    </div>
  )
}
