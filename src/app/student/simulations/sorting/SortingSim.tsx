'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useRef, useCallback } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────
type AlgoId = 'bubble' | 'selection' | 'insertion' | 'merge' | 'quick'

interface Bar {
  value: number
  state: 'default' | 'comparing' | 'swapping' | 'sorted' | 'pivot' | 'selected' | 'inserting'
}

interface SortStep {
  bars: Bar[]
  description: string
  phase: string
  comparisons: number
  swaps: number
  highlight?: number[]
}

// ─── Algorithm info ───────────────────────────────────────────────────────────
const ALGO_INFO: Record<AlgoId, {
  name: string; icon: string; color: string
  complexity: { best: string; avg: string; worst: string; space: string }
  description: string
  howItWorks: string[]
  pros: string[]; cons: string[]
  usedIn: string
}> = {
  bubble: {
    name: 'Bubble Sort', icon: '🫧', color: '#3b82f6',
    complexity: { best:'O(n)', avg:'O(n²)', worst:'O(n²)', space:'O(1)' },
    description: 'Opakovaně prochází pole a vyměňuje sousední prvky ve špatném pořadí. Větší prvky "probublávají" doprava.',
    howItWorks: [
      'Porovnej sousední dvojice prvků',
      'Pokud jsou ve špatném pořadí, vyměň je',
      'Opakuj pro celé pole (jeden průchod = jeden prvek na správné místo)',
      'Pokračuj dokud není celé pole seřazeno',
    ],
    pros: ['Jednoduchá implementace', 'Stabilní řazení', 'Detekuje již seřazené pole (O(n))'],
    cons: ['Velmi pomalý na velkých datech', 'Mnoho zbytečných porovnání'],
    usedIn: 'Výuka algoritmů, detekce již seřazených dat.',
  },
  selection: {
    name: 'Selection Sort', icon: '🎯', color: '#f59e0b',
    complexity: { best:'O(n²)', avg:'O(n²)', worst:'O(n²)', space:'O(1)' },
    description: 'V každém průchodu najde minimum z neseřazené části a přesune ho na správné místo.',
    howItWorks: [
      'Najdi minimum v neseřazené části pole',
      'Vyměň ho s prvním prvkem neseřazené části',
      'Posuň hranici seřazené části o 1 doprava',
      'Opakuj pro zbývající neseřazenou část',
    ],
    pros: ['Minimální počet swapů (max n-1)', 'Jednoduchý', 'Dobré pro malá data'],
    cons: ['Vždy O(n²) porovnání', 'Nestabilní řazení'],
    usedIn: 'Situace kde swap je drahý (flash paměť).',
  },
  insertion: {
    name: 'Insertion Sort', icon: '🃏', color: '#ec4899',
    complexity: { best:'O(n)', avg:'O(n²)', worst:'O(n²)', space:'O(1)' },
    description: 'Staví seřazenou část pole postupně — každý nový prvek vloží na správné místo v již seřazené části.',
    howItWorks: [
      'Vezmi první neseřazený prvek (klíč)',
      'Porovnej ho se seřazenou částí zprava doleva',
      'Posouvej větší prvky o jedno místo doprava',
      'Vlož klíč na nalezené místo',
    ],
    pros: ['Efektivní pro malá a téměř seřazená data', 'Stabilní', 'In-place', 'Online algoritmus'],
    cons: ['Pomalý pro velká neseřazená data'],
    usedIn: 'Malá pole, online třídění, součást Timsort.',
  },
  merge: {
    name: 'Merge Sort', icon: '🔀', color: '#8b5cf6',
    complexity: { best:'O(n log n)', avg:'O(n log n)', worst:'O(n log n)', space:'O(n)' },
    description: 'Rozděl a panuj: rekurzivně rozdělí pole na poloviny, seřadí je a pak je sloučí dohromady.',
    howItWorks: [
      'Rozděl pole na dvě poloviny',
      'Rekurzivně seřaď každou polovinu',
      'Slučuj (merge) dvě seřazené poloviny do jednoho seřazeného pole',
      'Opakuj dokud není celé pole seřazeno',
    ],
    pros: ['Garantovaný O(n log n)', 'Stabilní', 'Skvělý pro linked listy a externí třídění'],
    cons: ['Potřebuje O(n) extra paměti', 'Pomalejší než quicksort v praxi'],
    usedIn: 'Třídění linked listů, TimSort (Python, Java), velká data.',
  },
  quick: {
    name: 'Quick Sort', icon: '⚡', color: '#22c55e',
    complexity: { best:'O(n log n)', avg:'O(n log n)', worst:'O(n²)', space:'O(log n)' },
    description: 'Zvolí pivot a přeskupí pole tak, aby vlevo byl menší a vpravo větší. Rekurzivně třídí obě části.',
    howItWorks: [
      'Zvol pivot (poslední prvek)',
      'Partition: menší prvky vlevo od pivota, větší vpravo',
      'Pivot je na správném místě',
      'Rekurzivně opakuj pro levou a pravou část',
    ],
    pros: ['Nejrychlejší v praxi (cache-friendly)', 'In-place (O(log n) stack)', 'Snadno paralelizovatelný'],
    cons: ['Worst case O(n²) pro seřazená data', 'Nestabilní', 'Citlivý na výběr pivota'],
    usedIn: 'Prakticky všude — std::sort v C++, Arrays.sort pro primitiva v Java.',
  },
}

// ─── Step generators ──────────────────────────────────────────────────────────
function mkBars(values: number[]): Bar[] {
  return values.map(v => ({ value: v, state: 'default' as const }))
}
function clone(bars: Bar[]): Bar[] {
  return bars.map(b => ({ ...b }))
}
function addStep(steps: SortStep[], bars: Bar[], desc: string, phase: string, comps: number, swaps: number) {
  steps.push({ bars: clone(bars), description: desc, phase, comparisons: comps, swaps })
}

function bubbleSteps(values: number[]): SortStep[] {
  const steps: SortStep[] = []
  const bars = mkBars(values)
  let comps = 0, swaps = 0
  const n = bars.length
  addStep(steps, bars, 'Začínám Bubble Sort', 'init', 0, 0)
  for (let i = 0; i < n - 1; i++) {
    let swapped = false
    for (let j = 0; j < n - i - 1; j++) {
      bars[j].state = 'comparing'; bars[j+1].state = 'comparing'
      comps++
      addStep(steps, bars, `Porovnávám [${bars[j].value}] a [${bars[j+1].value}]`, `Průchod ${i+1}`, comps, swaps)
      if (bars[j].value > bars[j+1].value) {
        bars[j].state = 'swapping'; bars[j+1].state = 'swapping'
        addStep(steps, bars, `Vyměňuji ${bars[j].value} ↔ ${bars[j+1].value}`, `Průchod ${i+1}`, comps, swaps)
        const tmp = bars[j].value; bars[j].value = bars[j+1].value; bars[j+1].value = tmp
        swaps++; swapped = true
      }
      bars[j].state = 'default'; bars[j+1].state = 'default'
    }
    bars[n-i-1].state = 'sorted'
    addStep(steps, bars, `${bars[n-i-1].value} je na správném místě ✓`, `Průchod ${i+1}`, comps, swaps)
    if (!swapped) {
      for (let k = 0; k < n-i-1; k++) bars[k].state = 'sorted'
      addStep(steps, bars, 'Žádný swap → pole je seřazeno!', 'Hotovo', comps, swaps)
      break
    }
  }
  bars.forEach(b => b.state = 'sorted')
  addStep(steps, bars, '✓ Pole je seřazeno!', 'Hotovo', comps, swaps)
  return steps
}

function selectionSteps(values: number[]): SortStep[] {
  const steps: SortStep[] = []
  const bars = mkBars(values)
  let comps = 0, swaps = 0
  const n = bars.length
  addStep(steps, bars, 'Začínám Selection Sort', 'init', 0, 0)
  for (let i = 0; i < n - 1; i++) {
    let minIdx = i
    bars[i].state = 'selected'
    addStep(steps, bars, `Hledám minimum od pozice ${i}`, `Průchod ${i+1}`, comps, swaps)
    for (let j = i + 1; j < n; j++) {
      bars[j].state = 'comparing'
      comps++
      addStep(steps, bars, `Porovnávám ${bars[j].value} s aktuálním min ${bars[minIdx].value}`, `Průchod ${i+1}`, comps, swaps)
      if (bars[j].value < bars[minIdx].value) {
        if (minIdx !== i) bars[minIdx].state = 'default'
        minIdx = j
        bars[minIdx].state = 'selected'
        addStep(steps, bars, `Nové minimum: ${bars[minIdx].value}`, `Průchod ${i+1}`, comps, swaps)
      } else {
        bars[j].state = 'default'
      }
    }
    if (minIdx !== i) {
      bars[i].state = 'swapping'; bars[minIdx].state = 'swapping'
      addStep(steps, bars, `Vyměňuji minimum ${bars[minIdx].value} na pozici ${i}`, `Průchod ${i+1}`, comps, swaps)
      const tmp = bars[i].value; bars[i].value = bars[minIdx].value; bars[minIdx].value = tmp
      swaps++
    }
    for (let k = i; k < n; k++) bars[k].state = 'default'
    for (let k = 0; k <= i; k++) bars[k].state = 'sorted'
    addStep(steps, bars, `${bars[i].value} na správném místě ✓`, `Průchod ${i+1}`, comps, swaps)
  }
  bars.forEach(b => b.state = 'sorted')
  addStep(steps, bars, '✓ Pole je seřazeno!', 'Hotovo', comps, swaps)
  return steps
}

function insertionSteps(values: number[]): SortStep[] {
  const steps: SortStep[] = []
  const bars = mkBars(values)
  let comps = 0, swaps = 0
  const n = bars.length
  bars[0].state = 'sorted'
  addStep(steps, bars, 'Začínám Insertion Sort — první prvek je seřazen', 'init', 0, 0)
  for (let i = 1; i < n; i++) {
    const key = bars[i].value
    bars[i].state = 'inserting'
    addStep(steps, bars, `Vkládám klíč: ${key}`, `Prvek ${i+1}`, comps, swaps)
    let j = i - 1
    while (j >= 0) {
      bars[j].state = 'comparing'
      comps++
      addStep(steps, bars, `Porovnávám klíč ${key} s ${bars[j].value}`, `Prvek ${i+1}`, comps, swaps)
      if (bars[j].value > key) {
        bars[j+1].value = bars[j].value
        bars[j+1].state = 'swapping'
        bars[j].state = 'swapping'
        swaps++
        addStep(steps, bars, `Posunuji ${bars[j].value} doprava`, `Prvek ${i+1}`, comps, swaps)
        bars[j].state = 'sorted'
        bars[j+1].state = 'sorted'
        j--
      } else {
        bars[j].state = 'sorted'
        break
      }
    }
    bars[j+1].value = key
    bars[j+1].state = 'sorted'
    for (let k = 0; k <= i; k++) bars[k].state = 'sorted'
    addStep(steps, bars, `Klíč ${key} vložen na pozici ${j+1} ✓`, `Prvek ${i+1}`, comps, swaps)
  }
  bars.forEach(b => b.state = 'sorted')
  addStep(steps, bars, '✓ Pole je seřazeno!', 'Hotovo', comps, swaps)
  return steps
}

function mergeSteps(values: number[]): SortStep[] {
  const steps: SortStep[] = []
  const bars = mkBars(values)
  let comps = 0, swaps = 0
  addStep(steps, bars, 'Začínám Merge Sort', 'init', 0, 0)

  function mergeSort(lo: number, hi: number, depth: number) {
    if (lo >= hi) return
    const mid = Math.floor((lo + hi) / 2)
    // Highlight split
    for (let k = lo; k <= hi; k++) bars[k].state = 'comparing'
    addStep(steps, bars, `Dělit [${lo}..${hi}] na [${lo}..${mid}] a [${mid+1}..${hi}]`, `Hloubka ${depth}`, comps, swaps)
    for (let k = lo; k <= hi; k++) bars[k].state = 'default'
    mergeSort(lo, mid, depth + 1)
    mergeSort(mid + 1, hi, depth + 1)
    // Merge
    const left = bars.slice(lo, mid+1).map(b=>b.value)
    const right = bars.slice(mid+1, hi+1).map(b=>b.value)
    let i2 = 0, j2 = 0, k2 = lo
    for (let k = lo; k <= hi; k++) bars[k].state = 'comparing'
    addStep(steps, bars, `Slučuji [${lo}..${mid}] a [${mid+1}..${hi}]`, `Merge hloubka ${depth}`, comps, swaps)
    while (i2 < left.length && j2 < right.length) {
      comps++
      if (left[i2] <= right[j2]) {
        bars[k2].value = left[i2]; bars[k2].state = 'swapping'; i2++
      } else {
        bars[k2].value = right[j2]; bars[k2].state = 'swapping'; j2++
        swaps++
      }
      k2++
      addStep(steps, bars, `Vkládám ${bars[k2-1].value} na pozici ${k2-1}`, `Merge hloubka ${depth}`, comps, swaps)
      bars[k2-1].state = 'sorted'
    }
    while (i2 < left.length) { bars[k2].value = left[i2]; bars[k2].state = 'sorted'; i2++; k2++ }
    while (j2 < right.length) { bars[k2].value = right[j2]; bars[k2].state = 'sorted'; j2++; k2++ }
    addStep(steps, bars, `Sloučeno [${lo}..${hi}] ✓`, `Merge hloubka ${depth}`, comps, swaps)
  }

  mergeSort(0, bars.length - 1, 0)
  bars.forEach(b => b.state = 'sorted')
  addStep(steps, bars, '✓ Pole je seřazeno!', 'Hotovo', comps, swaps)
  return steps
}

function quickSteps(values: number[]): SortStep[] {
  const steps: SortStep[] = []
  const bars = mkBars(values)
  let comps = 0, swaps = 0
  addStep(steps, bars, 'Začínám Quick Sort', 'init', 0, 0)

  function partition(lo: number, hi: number): number {
    const pivot = bars[hi].value
    bars[hi].state = 'pivot'
    addStep(steps, bars, `Pivot = ${pivot} (poslední prvek)`, `Partition [${lo}..${hi}]`, comps, swaps)
    let i2 = lo - 1
    for (let j2 = lo; j2 < hi; j2++) {
      bars[j2].state = 'comparing'
      comps++
      addStep(steps, bars, `Porovnávám ${bars[j2].value} s pivotem ${pivot}`, `Partition [${lo}..${hi}]`, comps, swaps)
      if (bars[j2].value <= pivot) {
        i2++
        bars[i2].state = 'swapping'; bars[j2].state = 'swapping'
        const tmp = bars[i2].value; bars[i2].value = bars[j2].value; bars[j2].value = tmp
        swaps++
        addStep(steps, bars, `Vyměňuji ${bars[j2].value} ↔ ${bars[i2].value}`, `Partition [${lo}..${hi}]`, comps, swaps)
        bars[i2].state = 'selected'
      }
      if (bars[j2].state !== 'selected') bars[j2].state = 'default'
    }
    // Place pivot
    const pivotPos = i2 + 1
    bars[pivotPos].state = 'swapping'; bars[hi].state = 'swapping'
    const tmp = bars[pivotPos].value; bars[pivotPos].value = bars[hi].value; bars[hi].value = tmp
    swaps++
    addStep(steps, bars, `Pivot ${pivot} na správném místě (pozice ${pivotPos})`, `Partition [${lo}..${hi}]`, comps, swaps)
    bars[pivotPos].state = 'sorted'
    for (let k = lo; k <= hi; k++) if (bars[k].state !== 'sorted') bars[k].state = 'default'
    return pivotPos
  }

  function quickSort(lo: number, hi: number) {
    if (lo >= hi) {
      if (lo === hi) bars[lo].state = 'sorted'
      return
    }
    const p = partition(lo, hi)
    quickSort(lo, p - 1)
    quickSort(p + 1, hi)
  }

  quickSort(0, bars.length - 1)
  bars.forEach(b => b.state = 'sorted')
  addStep(steps, bars, '✓ Pole je seřazeno!', 'Hotovo', comps, swaps)
  return steps
}

// ─── Color per state ──────────────────────────────────────────────────────────
const STATE_COLOR: Record<Bar['state'], string> = {
  default:   '#1e3a5f',
  comparing: '#f59e0b',
  swapping:  '#ef4444',
  sorted:    '#22c55e',
  pivot:     '#a855f7',
  selected:  '#06b6d4',
  inserting: '#ec4899',
}
const STATE_LABEL: Record<Bar['state'], string> = {
  default:   'Nezpracovaný',
  comparing: 'Porovnávaný',
  swapping:  'Vyměňovaný',
  sorted:    'Seřazený',
  pivot:     'Pivot',
  selected:  'Vybraný min',
  inserting: 'Vkládaný klíč',
}

// ─── Compare mode: all 5 running simultaneously ───────────────────────────────
const ALGOS: AlgoId[] = ['bubble','selection','insertion','merge','quick']

const C = {
  bg:'#090B10', card:'#11141D', border:'rgba(255,255,255,0.07)',
  txt:'#fff', sec:'#8892a4',
}

// ─── Main component ────────────────────────────────────────────────────────────
export default function SortingSim({ accentColor }: { accentColor: string }) {
  const [tab, setTab] = useState<AlgoId | 'compare'>('compare')
  const [arraySize, setArraySize] = useState(24)
  const [speed, setSpeed] = useState(1)
  const [running, setRunning] = useState(false)
  const [finished, setFinished] = useState(false)
  const [inputType, setInputType] = useState<'random'|'nearly'|'reversed'|'few'>('random')

  // Single algo state
  const [steps, setSteps] = useState<SortStep[]>([])
  const [stepIdx, setStepIdx] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)

  // Compare mode: each algo has its own step stream
  const [compareSteps, setCompareSteps] = useState<Record<AlgoId, SortStep[]>>({} as any)
  const [compareIdx, setCompareIdx] = useState<Record<AlgoId, number>>({} as any)
  const [comparePlaying, setComparePlaying] = useState(false)

  const containerRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 900, h: 480 })
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const el = containerRef.current; if (!el) return
    const ro = new ResizeObserver(e => {
      const { width, height } = e[0].contentRect
      setSize({ w: Math.floor(width), h: Math.floor(height) })
    })
    ro.observe(el); return () => ro.disconnect()
  }, [])

  // Generate initial array
  const makeArray = useCallback((size: number, type: string): number[] => {
    const arr = Array.from({ length: size }, (_, i) => i + 1)
    if (type === 'reversed') return arr.reverse()
    if (type === 'nearly') {
      // Shuffle only 20% of elements
      for (let i = 0; i < Math.floor(size * 0.2); i++) {
        const a = Math.floor(Math.random() * size)
        const b = Math.floor(Math.random() * size)
        ;[arr[a], arr[b]] = [arr[b], arr[a]]
      }
      return arr
    }
    if (type === 'few') {
      // Only 5 distinct values
      return Array.from({ length: size }, () => Math.floor(Math.random() * 5) + 1)
    }
    // random
    for (let i = size - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[arr[i], arr[j]] = [arr[j], arr[i]]
    }
    return arr
  }, [])

  const genSteps = useCallback((algo: AlgoId, values: number[]): SortStep[] => {
    switch (algo) {
      case 'bubble':    return bubbleSteps(values)
      case 'selection': return selectionSteps(values)
      case 'insertion': return insertionSteps(values)
      case 'merge':     return mergeSteps(values)
      case 'quick':     return quickSteps(values)
    }
  }, [])

  // Init
  useEffect(() => { reset() }, [tab, arraySize, inputType])

  const reset = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    setIsPlaying(false); setComparePlaying(false); setFinished(false); setRunning(false)
    const values = makeArray(arraySize, inputType)
    if (tab === 'compare') {
      const cs: Record<AlgoId, SortStep[]> = {} as any
      const ci: Record<AlgoId, number> = {} as any
      ALGOS.forEach(a => { cs[a] = genSteps(a, [...values]); ci[a] = 0 })
      setCompareSteps(cs); setCompareIdx(ci)
    } else {
      const s = genSteps(tab, [...values])
      setSteps(s); setStepIdx(0)
    }
  }, [tab, arraySize, inputType, makeArray, genSteps])

  // Single algo auto-play
  useEffect(() => {
    if (!isPlaying || tab === 'compare') return
    if (stepIdx >= steps.length - 1) { setIsPlaying(false); setFinished(true); return }
    const delay = Math.max(20, 350 / speed)
    timerRef.current = setTimeout(() => setStepIdx(i => i + 1), delay)
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [isPlaying, stepIdx, steps.length, speed, tab])

  // Compare mode auto-play
  useEffect(() => {
    if (!comparePlaying || tab !== 'compare') return
    const allDone = ALGOS.every(a => compareIdx[a] >= (compareSteps[a]?.length ?? 0) - 1)
    if (allDone) { setComparePlaying(false); setFinished(true); return }
    const delay = Math.max(20, 300 / speed)
    timerRef.current = setTimeout(() => {
      setCompareIdx(prev => {
        const next = { ...prev }
        ALGOS.forEach(a => {
          if (next[a] < (compareSteps[a]?.length ?? 0) - 1) next[a]++
        })
        return next
      })
    }, delay)
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [comparePlaying, compareIdx, compareSteps, speed, tab])

  const currentStep = tab !== 'compare' ? steps[stepIdx] : null
  const info = tab !== 'compare' ? ALGO_INFO[tab] : null

  // ── Canvas rendering ────────────────────────────────────────────────────────
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const cv = canvasRef.current; if (!cv) return
    const ctx = cv.getContext('2d')!
    const W = cv.width, H = cv.height
    ctx.clearRect(0, 0, W, H)
    ctx.fillStyle = '#0a0d14'; ctx.fillRect(0, 0, W, H)

    if (tab === 'compare') {
      // 5 mini panels
      const panelW = Math.floor(W / 5)
      ALGOS.forEach((algo, pi) => {
        const s = compareSteps[algo]
        if (!s) return
        const si = Math.min(compareIdx[algo] ?? 0, s.length - 1)
        const step = s[si]
        if (!step) return
        const px = pi * panelW
        const algoInfo = ALGO_INFO[algo]
        // Panel bg
        ctx.fillStyle = '#0d1117'
        ctx.fillRect(px + 2, 0, panelW - 4, H)
        // Title
        ctx.fillStyle = algoInfo.color; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center'
        ctx.fillText(`${algoInfo.icon} ${algoInfo.name}`, px + panelW / 2, 16)
        // Complexity
        ctx.fillStyle = '#475569'; ctx.font = '8px monospace'
        ctx.fillText(algoInfo.complexity.avg, px + panelW / 2, 27)
        // Progress bar
        const prog = si / (s.length - 1)
        ctx.fillStyle = '#1e293b'; ctx.fillRect(px + 4, 32, panelW - 8, 4)
        ctx.fillStyle = algoInfo.color; ctx.fillRect(px + 4, 32, (panelW - 8) * prog, 4)
        // Bars
        drawBars(ctx, step.bars, px + 4, 40, panelW - 8, H - 75)
        // Stats
        ctx.fillStyle = '#475569'; ctx.font = '8px monospace'; ctx.textAlign = 'left'
        ctx.fillText(`↕ ${step.swaps}`, px + 5, H - 22)
        ctx.fillText(`= ${step.comparisons}`, px + 5, H - 12)
        const isDone = step.phase === 'Hotovo' || si === s.length - 1
        if (isDone) {
          ctx.fillStyle = algoInfo.color + 'cc'; ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'center'
          ctx.fillText('✓ Hotovo', px + panelW / 2, H - 6)
        }
      })
    } else if (currentStep) {
      // Single algo — full width
      const PAD = 20
      drawBars(ctx, currentStep.bars, PAD, 24, W - PAD * 2, H - 60)
      // Phase label
      ctx.fillStyle = info!.color; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'left'
      ctx.fillText(currentStep.phase, PAD, H - 38)
      ctx.fillStyle = '#94a3b8'; ctx.font = '10px sans-serif'
      ctx.fillText(currentStep.description, PAD, H - 24)
      // Stats bottom right
      ctx.textAlign = 'right'
      ctx.fillStyle = '#f59e0b'; ctx.fillText(`Porovnání: ${currentStep.comparisons}`, W - PAD, H - 38)
      ctx.fillStyle = '#ef4444'; ctx.fillText(`Výměny: ${currentStep.swaps}`, W - PAD, H - 24)
    }
  }, [tab, currentStep, compareSteps, compareIdx, info, size])

  function drawBars(ctx: CanvasRenderingContext2D, bars: Bar[], x: number, y: number, w: number, h: number) {
    const n = bars.length
    const barW = Math.max(1, (w - n + 1) / n)
    const maxVal = Math.max(...bars.map(b => b.value))
    bars.forEach((b, i) => {
      const bh = Math.max(2, (b.value / maxVal) * h)
      const bx = x + i * (barW + 1)
      const by = y + h - bh
      ctx.fillStyle = STATE_COLOR[b.state]
      ctx.fillRect(bx, by, barW, bh)
      // Value label for small arrays
      if (barW >= 14 && n <= 30) {
        ctx.fillStyle = 'rgba(255,255,255,0.7)'
        ctx.font = `${Math.min(9, barW * 0.55)}px monospace`
        ctx.textAlign = 'center'
        ctx.fillText(String(b.value), bx + barW / 2, by - 2)
      }
    })
  }

  const W = size.w, H = size.h
  const TOOLBAR_H = 44
  const canvasH = H - TOOLBAR_H

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', background:C.bg, color:C.txt, fontFamily:'inherit', overflow:'hidden' }}>
      <style>{`@keyframes fadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}.fi{animation:fadeIn .3s ease}`}</style>

      {/* ── Header ── */}
      <div style={{ padding:'10px 20px', borderBottom:`1px solid ${C.border}`, display:'flex', alignItems:'center', gap:12, flexShrink:0, background:C.card }}>
        <a href="/student/simulations" style={{ color:C.sec, fontSize:13, textDecoration:'none' }}>← Simulace</a>
        <div style={{ width:1, height:14, background:C.border }}/>
        <span style={{ fontSize:14, fontWeight:700 }}>📊 Třídící algoritmy</span>
        <div style={{ marginLeft:'auto', display:'flex', gap:8, alignItems:'center' }}>
          <label style={{ fontSize:10, color:C.sec, display:'flex', alignItems:'center', gap:5 }}>
            n:
            <input type="range" min={8} max={60} step={4} value={arraySize} onChange={e=>setArraySize(+e.target.value)}
              style={{ width:70, accentColor }} />
            <span style={{ color:C.txt, minWidth:20 }}>{arraySize}</span>
          </label>
          <label style={{ fontSize:10, color:C.sec, display:'flex', alignItems:'center', gap:5 }}>
            ×
            <input type="range" min={0.5} max={8} step={0.5} value={speed} onChange={e=>setSpeed(+e.target.value)}
              style={{ width:60, accentColor }} />
            <span style={{ color:C.txt, minWidth:24 }}>{speed}×</span>
          </label>
          <select value={inputType} onChange={e=>setInputType(e.target.value as any)}
            style={{ padding:'3px 8px', background:'#1a2035', color:'#fff', border:`1px solid ${C.border}`, borderRadius:6, fontSize:11, fontFamily:'inherit', cursor:'pointer' }}>
            <option value="random">🎲 Náhodné</option>
            <option value="nearly">〰 Skoro seřazené</option>
            <option value="reversed">🔽 Obrácené</option>
            <option value="few">🔢 Málo hodnot</option>
          </select>
          <button onClick={reset}
            style={{ padding:'5px 12px', background:'rgba(255,255,255,.07)', color:C.sec, border:`1px solid ${C.border}`, borderRadius:7, cursor:'pointer', fontSize:12, fontFamily:'inherit' }}>
            🔀 Nové pole
          </button>
        </div>
      </div>

      {/* ── Tab bar ── */}
      <div style={{ display:'flex', borderBottom:`1px solid ${C.border}`, flexShrink:0, background:C.card, overflowX:'auto' }}>
        {([['compare','🔀','Porovnat vše',''] as const, ...ALGOS.map(a=>[a, ALGO_INFO[a].icon, ALGO_INFO[a].name, ALGO_INFO[a].complexity.avg] as const)]).map(([id, icon, name, cplx])=>(
          <button key={id} onClick={()=>setTab(id as any)}
            style={{ flexShrink:0, padding:'9px 10px', background:'transparent', border:'none', borderBottom:`3px solid ${tab===id?(id==='compare'?accentColor:ALGO_INFO[id as AlgoId].color):'transparent'}`, cursor:'pointer', fontFamily:'inherit', display:'flex', flexDirection:'column', alignItems:'center', gap:2 }}>
            <span style={{ fontSize:18 }}>{icon}</span>
            <span style={{ fontSize:10, fontWeight:700, color:tab===id?(id==='compare'?accentColor:ALGO_INFO[id as AlgoId].color):C.sec, whiteSpace:'nowrap' }}>{name}</span>
            {cplx && <span style={{ fontSize:8, color:'#475569', fontFamily:'monospace' }}>{cplx}</span>}
          </button>
        ))}
      </div>

      {/* ── Main ── */}
      <div style={{ flex:1, display:'flex', minHeight:0, overflow:'hidden' }}>

        {/* Canvas + controls */}
        <div ref={containerRef} style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }}>
          {/* Play controls */}
          <div style={{ display:'flex', alignItems:'center', gap:8, padding:'6px 14px', borderBottom:`1px solid ${C.border}`, flexShrink:0, background:C.card }}>
            {tab === 'compare' ? (<>
              <button onClick={()=>setComparePlaying(p=>!p)} disabled={finished}
                style={{ padding:'5px 16px', background:comparePlaying?'rgba(239,68,68,.15)':'rgba(34,197,94,.15)', color:comparePlaying?'#f87171':'#4ade80', border:`1px solid ${comparePlaying?'rgba(239,68,68,.3)':'rgba(34,197,94,.3)'}`, borderRadius:7, cursor:finished?'not-allowed':'pointer', fontSize:12, fontWeight:700, fontFamily:'inherit' }}>
                {comparePlaying ? '⏸ Pauza' : (finished ? '✓ Hotovo' : '▶ Spustit všechny')}
              </button>
              <button onClick={reset} style={{ padding:'5px 10px', background:'rgba(255,255,255,.07)', color:C.sec, border:`1px solid ${C.border}`, borderRadius:7, cursor:'pointer', fontSize:11, fontFamily:'inherit' }}>
                ↺ Reset
              </button>
              {/* Compare legend */}
              <div style={{ display:'flex', gap:10, marginLeft:8 }}>
                {ALGOS.map(a=>(
                  <span key={a} style={{ fontSize:9, color:ALGO_INFO[a].color }}>● {ALGO_INFO[a].name}</span>
                ))}
              </div>
            </>) : (<>
              <button onClick={()=>setIsPlaying(p=>!p)} disabled={finished || steps.length === 0}
                style={{ padding:'5px 16px', background:isPlaying?'rgba(239,68,68,.15)':'rgba(34,197,94,.15)', color:isPlaying?'#f87171':'#4ade80', border:`1px solid ${isPlaying?'rgba(239,68,68,.3)':'rgba(34,197,94,.3)'}`, borderRadius:7, cursor:(finished||steps.length===0)?'not-allowed':'pointer', fontSize:12, fontWeight:700, fontFamily:'inherit' }}>
                {isPlaying ? '⏸ Pauza' : (finished ? '✓ Hotovo' : '▶ Spustit')}
              </button>
              <button onClick={()=>setStepIdx(i=>Math.min(i+1,steps.length-1))} disabled={isPlaying||stepIdx>=steps.length-1}
                style={{ padding:'5px 10px', background:'rgba(255,255,255,.07)', color:C.sec, border:`1px solid ${C.border}`, borderRadius:7, cursor:'pointer', fontSize:12, fontFamily:'inherit' }}>
                › Krok
              </button>
              <button onClick={reset}
                style={{ padding:'5px 10px', background:'rgba(255,255,255,.07)', color:C.sec, border:`1px solid ${C.border}`, borderRadius:7, cursor:'pointer', fontSize:11, fontFamily:'inherit' }}>
                ↺ Reset
              </button>
              {/* Progress */}
              <div style={{ flex:1, height:4, background:'rgba(255,255,255,.08)', borderRadius:2, overflow:'hidden', maxWidth:300 }}>
                <div style={{ height:'100%', width:`${steps.length>1?(stepIdx/(steps.length-1))*100:0}%`, background:info?.color??accentColor, transition:'width .15s', borderRadius:2 }}/>
              </div>
              <span style={{ fontSize:10, color:C.sec }}>{stepIdx}/{steps.length-1}</span>
            </>)}

            {/* State legend */}
            <div style={{ marginLeft:'auto', display:'flex', gap:8, flexWrap:'wrap' as const }}>
              {(Object.entries(STATE_COLOR) as [Bar['state'],string][])
                .filter(([s])=>s!=='default')
                .map(([state,col])=>(
                  <span key={state} style={{ fontSize:9, color:col, display:'flex', alignItems:'center', gap:3 }}>
                    <span style={{ width:8, height:8, background:col, display:'inline-block', borderRadius:2 }}/>
                    {STATE_LABEL[state]}
                  </span>
                ))}
            </div>
          </div>

          {/* Canvas */}
          <div style={{ flex:1, position:'relative', overflow:'hidden' }}>
            <canvas ref={canvasRef} width={W} height={canvasH}
              style={{ width:'100%', height:'100%', display:'block' }}/>

            {/* Overlay for compare: show finish times */}
            {tab==='compare' && finished && (
              <div style={{ position:'absolute', bottom:8, left:0, right:0, display:'flex', justifyContent:'center', gap:12, pointerEvents:'none' }}>
                {ALGOS.map(a=>{
                  const s = compareSteps[a]
                  const last = s?.[s.length-1]
                  return last ? (
                    <div key={a} style={{ padding:'4px 10px', background:ALGO_INFO[a].color+'22', border:`1px solid ${ALGO_INFO[a].color}44`, borderRadius:8, textAlign:'center' }}>
                      <div style={{ fontSize:9, color:ALGO_INFO[a].color, fontWeight:700 }}>{ALGO_INFO[a].icon} {ALGO_INFO[a].name}</div>
                      <div style={{ fontSize:8, color:'#94a3b8' }}>↕ {last.swaps} · = {last.comparisons}</div>
                    </div>
                  ) : null
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── Right info panel ── */}
        <div style={{ width:272, flexShrink:0, borderLeft:`1px solid ${C.border}`, display:'flex', flexDirection:'column', overflow:'hidden', background:C.card }}>
          <div style={{ flex:1, overflowY:'auto', padding:14 }}>
            <div key={tab} className="fi">
              {tab === 'compare' ? (
                <>
                  <div style={{ fontSize:14, fontWeight:800, color:'#fff', marginBottom:10 }}>🔀 Porovnat všechny</div>
                  <p style={{ fontSize:11.5, color:'#cbd5e1', lineHeight:1.75, margin:'0 0 12px' }}>
                    Všechny algoritmy běží současně na stejném poli. Sleduj kdo doběhne první a kolik potřeboval porovnání a výměn.
                  </p>

                  {/* Complexity table */}
                  <div style={{ fontSize:9, fontWeight:700, color:C.sec, textTransform:'uppercase', letterSpacing:'.06em', marginBottom:8 }}>Složitost</div>
                  <table style={{ width:'100%', borderCollapse:'collapse', fontSize:10, marginBottom:14 }}>
                    <thead><tr style={{ borderBottom:`1px solid ${C.border}` }}>
                      <th style={{ padding:'3px 5px', color:C.sec, textAlign:'left' }}>Algo</th>
                      <th style={{ padding:'3px 5px', color:C.sec }}>Nejl.</th>
                      <th style={{ padding:'3px 5px', color:C.sec }}>Avg</th>
                      <th style={{ padding:'3px 5px', color:C.sec }}>Nejh.</th>
                      <th style={{ padding:'3px 5px', color:C.sec }}>Paměť</th>
                    </tr></thead>
                    <tbody>
                      {ALGOS.map(a=>{
                        const ai=ALGO_INFO[a]
                        return (
                          <tr key={a} style={{ borderBottom:`1px solid ${C.border}`, cursor:'pointer' }}
                            onClick={()=>setTab(a)}>
                            <td style={{ padding:'4px 5px', color:ai.color, fontWeight:700 }}>{ai.icon} {ai.name.split(' ')[0]}</td>
                            <td style={{ padding:'4px 5px', textAlign:'center', color:'#22c55e', fontFamily:'monospace', fontSize:9 }}>{ai.complexity.best}</td>
                            <td style={{ padding:'4px 5px', textAlign:'center', color:'#f59e0b', fontFamily:'monospace', fontSize:9 }}>{ai.complexity.avg}</td>
                            <td style={{ padding:'4px 5px', textAlign:'center', color:'#ef4444', fontFamily:'monospace', fontSize:9 }}>{ai.complexity.worst}</td>
                            <td style={{ padding:'4px 5px', textAlign:'center', color:C.sec, fontFamily:'monospace', fontSize:9 }}>{ai.complexity.space}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>

                  <div style={{ padding:'8px 10px', background:'rgba(251,191,36,.05)', border:'1px solid rgba(251,191,36,.15)', borderRadius:8 }}>
                    <p style={{ fontSize:11, color:'#fcd34d', margin:0, lineHeight:1.65 }}>
                      💡 Klikni na řádek tabulky pro detail algoritmu. Zkus různé typy vstupů — "skoro seřazené" zvýhodní Insertion Sort!
                    </p>
                  </div>
                </>
              ) : info ? (
                <>
                  <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:12 }}>
                    <div style={{ width:36, height:36, borderRadius:9, background:info.color+'22', border:`1px solid ${info.color}44`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:20 }}>{info.icon}</div>
                    <div>
                      <div style={{ fontSize:14, fontWeight:800, color:'#fff' }}>{info.name}</div>
                      <div style={{ display:'flex', gap:6 }}>
                        <span style={{ fontSize:9, color:'#22c55e', fontFamily:'monospace' }}>Best: {info.complexity.best}</span>
                        <span style={{ fontSize:9, color:'#f59e0b', fontFamily:'monospace' }}>Avg: {info.complexity.avg}</span>
                      </div>
                    </div>
                  </div>

                  <p style={{ fontSize:11.5, color:'#cbd5e1', lineHeight:1.75, margin:'0 0 12px' }}>{info.description}</p>

                  {/* Complexity badges */}
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:5, marginBottom:12 }}>
                    {([['Nejlepší',info.complexity.best,'#22c55e'],['Průměrný',info.complexity.avg,'#f59e0b'],['Nejhorší',info.complexity.worst,'#ef4444'],['Paměť',info.complexity.space,'#06b6d4']] as [string,string,string][]).map(([lbl,val,col])=>(
                      <div key={lbl} style={{ padding:'6px 8px', background:col+'0d', border:`1px solid ${col}30`, borderRadius:7, textAlign:'center' }}>
                        <div style={{ fontSize:8, color:C.sec, marginBottom:2 }}>{lbl}</div>
                        <div style={{ fontSize:12, fontWeight:800, color:col, fontFamily:'monospace' }}>{val}</div>
                      </div>
                    ))}
                  </div>

                  {/* How it works */}
                  <div style={{ marginBottom:12 }}>
                    <div style={{ fontSize:9, fontWeight:700, color:C.sec, textTransform:'uppercase', letterSpacing:'.06em', marginBottom:7 }}>Jak funguje</div>
                    {info.howItWorks.map((s,i)=>(
                      <div key={i} style={{ display:'flex', gap:7, marginBottom:5, alignItems:'flex-start' }}>
                        <div style={{ width:16,height:16,borderRadius:'50%',background:info.color+'22',border:`1px solid ${info.color}44`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:8,fontWeight:700,color:info.color,flexShrink:0,marginTop:1 }}>{i+1}</div>
                        <span style={{ fontSize:10.5, color:'#94a3b8', lineHeight:1.6 }}>{s}</span>
                      </div>
                    ))}
                  </div>

                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6, marginBottom:12 }}>
                    <div style={{ padding:'7px 8px', background:'rgba(34,197,94,.06)', border:'1px solid rgba(34,197,94,.17)', borderRadius:7 }}>
                      <div style={{ fontSize:8, fontWeight:700, color:'#4ade80', textTransform:'uppercase', marginBottom:4 }}>✓ Výhody</div>
                      {info.pros.map((p,i)=><div key={i} style={{ fontSize:10, color:'#86efac', marginBottom:2, lineHeight:1.5 }}>• {p}</div>)}
                    </div>
                    <div style={{ padding:'7px 8px', background:'rgba(239,68,68,.06)', border:'1px solid rgba(239,68,68,.17)', borderRadius:7 }}>
                      <div style={{ fontSize:8, fontWeight:700, color:'#f87171', textTransform:'uppercase', marginBottom:4 }}>✗ Nevýhody</div>
                      {info.cons.map((c,i)=><div key={i} style={{ fontSize:10, color:'#fca5a5', marginBottom:2, lineHeight:1.5 }}>• {c}</div>)}
                    </div>
                  </div>

                  <div style={{ padding:'7px 9px', background:'rgba(251,191,36,.05)', border:'1px solid rgba(251,191,36,.15)', borderRadius:7, marginBottom:12 }}>
                    <p style={{ fontSize:10.5, color:'#fcd34d', margin:0, lineHeight:1.6 }}>💡 {info.usedIn}</p>
                  </div>

                  {/* Live step info */}
                  {currentStep && (
                    <div style={{ padding:'8px 10px', background:info.color+'0d', border:`1px solid ${info.color}25`, borderRadius:8 }}>
                      <div style={{ fontSize:9, fontWeight:700, color:info.color, textTransform:'uppercase', marginBottom:5 }}>{currentStep.phase}</div>
                      <div style={{ fontSize:11, color:'#e2e8f0', lineHeight:1.6 }}>{currentStep.description}</div>
                      <div style={{ display:'flex', gap:12, marginTop:6 }}>
                        <span style={{ fontSize:10, color:'#f59e0b' }}>= {currentStep.comparisons} porovnání</span>
                        <span style={{ fontSize:10, color:'#ef4444' }}>↕ {currentStep.swaps} výměn</span>
                      </div>
                    </div>
                  )}
                </>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
