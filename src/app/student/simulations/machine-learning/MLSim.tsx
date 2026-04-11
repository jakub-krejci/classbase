'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useRef, useCallback } from 'react'

// ── Types ──────────────────────────────────────────────────────────────────────
type Tab = 'supervised' | 'unsupervised' | 'reinforcement'

const TAB_INFO = {
  supervised: {
    icon: '👨‍🏫',
    title: 'Dozorované učení',
    subtitle: 'Supervised Learning',
    color: '#3b82f6',
    tagline: 'Učení se správnými odpověďmi',
    description: 'Model se učí z dat, která mají správné odpovědi (štítky). Jako žák, kterému učitel říká co je správně a co špatně.',
    when: 'Kdy se používá: Klasifikace e-mailů (spam/ham), rozpoznávání obrázků, předpovídání cen nemovitostí.',
    steps: [
      '1. Dostaneme data s odpověďmi (štítky)',
      '2. Model se učí vzory z těchto dat',
      '3. Model předpoví odpověď pro nová data',
      '4. Porovnáme s správnou odpovědí → upravíme',
    ],
    pros: ['Přesné predikce', 'Jasný cíl optimalizace'],
    cons: ['Potřebuje označená data', 'Označování je drahé a pomalé'],
  },
  unsupervised: {
    icon: '🔍',
    title: 'Nedozorované učení',
    subtitle: 'Unsupervised Learning',
    color: '#22c55e',
    tagline: 'Hledání skryté struktury v datech',
    description: 'Model dostane data bez štítků a sám hledá vzory, skupiny nebo strukturu. Jako detektiv, který třídí stopy bez návodu.',
    when: 'Kdy se používá: Segmentace zákazníků, detekce anomálií, komprese dat, doporučovací systémy.',
    steps: [
      '1. Dostaneme data BEZ odpovědí',
      '2. Algoritmus hledá podobnosti v datech',
      '3. Vytvoří skupiny (clustery) podobných dat',
      '4. My pojmenujeme skupiny podle kontextu',
    ],
    pros: ['Nevyžaduje štítky', 'Odhalí skrytou strukturu'],
    cons: ['Těžko ověřit správnost', 'Výsledky mohou být neočekávané'],
  },
  reinforcement: {
    icon: '🎮',
    title: 'Posilované učení',
    subtitle: 'Reinforcement Learning',
    color: '#f59e0b',
    tagline: 'Učení pokusem, omylem a odměnami',
    description: 'Agent se učí jednat v prostředí tak, aby maximalizoval odměnu. Jako trénování psa — správné chování = pamlsek, špatné = žádná odměna.',
    when: 'Kdy se používá: Hry (AlphaGo, Chess), robotika, autonomní řízení, optimalizace reklam.',
    steps: [
      '1. Agent pozoruje stav prostředí',
      '2. Provede akci (pohyb, rozhodnutí)',
      '3. Dostane odměnu (+) nebo trest (−)',
      '4. Aktualizuje strategii → opakuje',
    ],
    pros: ['Nevyžaduje štítky', 'Může překonat lidský výkon'],
    cons: ['Potřebuje miliony iterací', 'Definování odměn je složité'],
  },
}

// ── Colors ─────────────────────────────────────────────────────────────────────
const C = {
  bg: '#090B10', card: '#11141D', border: 'rgba(255,255,255,0.07)',
  txt: '#fff', sec: '#8892a4',
}

// ── Supervised: animals falling with labels ────────────────────────────────────
interface Animal { id: number; x: number; y: number; vy: number; type: 'cat'|'dog'; labeled: boolean; settled: boolean; finalY: number }
interface DecisionBoundary { x: number; animating: boolean; progress: number }

function SupervisedSim({ playing, speed }: { playing: boolean; speed: number }) {
  const cvRef = useRef<HTMLCanvasElement>(null)
  const stateRef = useRef<{
    animals: Animal[]
    boundary: DecisionBoundary
    tick: number
    nextId: number
    learningProgress: number
  }>({
    animals: [],
    boundary: { x: 0, animating: false, progress: 0 },
    tick: 0,
    nextId: 0,
    learningProgress: 0,
  })
  const rafRef = useRef(0)
  const playRef = useRef(playing)
  useEffect(() => { playRef.current = playing }, [playing])
  const speedRef = useRef(speed)
  useEffect(() => { speedRef.current = speed }, [speed])

  useEffect(() => {
    const cv = cvRef.current
    if (!cv) return
    const ctx = cv.getContext('2d')!
    const W = cv.width, H = cv.height
    const st = stateRef.current

    // Reset
    st.animals = []; st.tick = 0; st.nextId = 0; st.learningProgress = 0
    st.boundary = { x: W * 0.5, animating: false, progress: 0 }

    // Pre-populate animals
    const spawnAnimal = (type: 'cat'|'dog') => {
      const isCat = type === 'cat'
      const xRange = isCat ? [0.08, 0.42] : [0.58, 0.92]
      const x = (xRange[0] + Math.random() * (xRange[1] - xRange[0])) * W
      const finalY = H * 0.28 + Math.random() * H * 0.5
      st.animals.push({
        id: st.nextId++, x, y: -30, vy: 0.8 + Math.random() * 0.5,
        type, labeled: false, settled: false, finalY,
      })
    }

    for (let i = 0; i < 6; i++) spawnAnimal('cat')
    for (let i = 0; i < 6; i++) spawnAnimal('dog')

    const draw = () => {
      if (playRef.current) {
        const s = speedRef.current
        st.tick += s

        // Move animals
        st.animals.forEach(a => {
          if (!a.settled) {
            a.y += a.vy * s
            if (a.y >= a.finalY) { a.y = a.finalY; a.settled = true; a.labeled = true }
          }
        })

        // All settled → animate learning
        const allSettled = st.animals.every(a => a.settled)
        if (allSettled && st.learningProgress < 1) {
          st.learningProgress = Math.min(1, st.learningProgress + 0.005 * s)
        }

        // Respawn if too few
        if (st.tick % (120 / s) < 1 && st.animals.length < 14) {
          spawnAnimal(Math.random() < 0.5 ? 'cat' : 'dog')
        }
      }

      ctx.clearRect(0, 0, W, H)

      // Background zones
      const bx = st.boundary.x
      // Cat zone (left)
      ctx.fillStyle = 'rgba(59,130,246,0.06)'
      ctx.fillRect(0, 0, bx, H)
      // Dog zone (right)
      ctx.fillStyle = 'rgba(249,115,22,0.06)'
      ctx.fillRect(bx, 0, W - bx, H)

      // Zone labels
      ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'center'
      ctx.fillStyle = 'rgba(59,130,246,0.5)'
      ctx.fillText('🐱 Kočky', bx * 0.5, 22)
      ctx.fillStyle = 'rgba(249,115,22,0.5)'
      ctx.fillText('🐶 Psi', bx + (W - bx) * 0.5, 22)

      // Learning progress bar at top
      if (st.learningProgress > 0) {
        const barW = W * 0.6
        const barX = W * 0.2
        ctx.fillStyle = 'rgba(255,255,255,0.05)'
        ctx.fillRect(barX, H - 28, barW, 8)
        ctx.fillStyle = '#3b82f6'
        ctx.fillRect(barX, H - 28, barW * st.learningProgress, 8)
        ctx.fillStyle = C.sec; ctx.font = '10px sans-serif'; ctx.textAlign = 'center'
        ctx.fillText(`Model se učí: ${Math.round(st.learningProgress * 100)}%`, W / 2, H - 34)
        if (st.learningProgress >= 0.98) {
          ctx.fillStyle = '#22c55e'; ctx.font = 'bold 11px sans-serif'
          ctx.fillText('✓ Natrénováno! Model umí rozlišit kočky od psů.', W / 2, H - 10)
        }
      }

      // Decision boundary (vertical line with glow)
      ctx.save()
      ctx.shadowColor = '#fff'
      ctx.shadowBlur = 8
      ctx.strokeStyle = 'rgba(255,255,255,0.6)'
      ctx.lineWidth = 2
      ctx.setLineDash([8, 5])
      ctx.beginPath(); ctx.moveTo(bx, 30); ctx.lineTo(bx, H - 40); ctx.stroke()
      ctx.setLineDash([])
      ctx.restore()
      ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.font = 'bold 9px monospace'; ctx.textAlign = 'center'
      ctx.fillText('HRANICE', bx, H - 42)

      // Animals
      st.animals.forEach(a => {
        const isCat = a.type === 'cat'
        const emoji = isCat ? '🐱' : '🐶'
        ctx.font = '22px sans-serif'; ctx.textAlign = 'center'
        ctx.fillText(emoji, a.x, a.y)

        // Label badge
        if (a.labeled) {
          const label = isCat ? 'Kočka' : 'Pes'
          const col = isCat ? '#60a5fa' : '#fb923c'
          const bw = 40, bh = 16
          ctx.fillStyle = col + '33'
          ctx.beginPath()
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ;(ctx as any).roundRect?.(a.x - bw/2, a.y + 12, bw, bh, 4) ?? ctx.fillRect(a.x - bw/2, a.y + 12, bw, bh)
          ctx.fill()
          ctx.fillStyle = col; ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'center'
          ctx.fillText(label, a.x, a.y + 23)
        }
      })

      rafRef.current = requestAnimationFrame(draw)
    }
    rafRef.current = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(rafRef.current)
  }, [])

  return <canvas ref={cvRef} width={500} height={380} style={{ width: '100%', height: '100%', maxWidth: 500, maxHeight: 380 }} />
}

// ── Unsupervised: k-means clustering ──────────────────────────────────────────
interface KPoint { x: number; y: number; cluster: number; targetCluster: number }
interface Centroid { x: number; y: number; color: string; tx: number; ty: number }

const CLUSTER_COLORS = ['#3b82f6', '#22c55e', '#f59e0b']

function UnsupervisedSim({ playing, speed }: { playing: boolean; speed: number }) {
  const cvRef = useRef<HTMLCanvasElement>(null)
  const stateRef = useRef<{
    points: KPoint[]
    centroids: Centroid[]
    phase: 'scatter'|'assign'|'move'|'done'
    phaseT: number
    iteration: number
  }>({ points: [], centroids: [], phase: 'scatter', phaseT: 0, iteration: 0 })
  const rafRef = useRef(0)
  const playRef = useRef(playing)
  useEffect(() => { playRef.current = playing }, [playing])
  const speedRef = useRef(speed)
  useEffect(() => { speedRef.current = speed }, [speed])

  const initState = useCallback((W: number, H: number) => {
    const st = stateRef.current
    const cx = W / 2, cy = H / 2
    const clusterCenters = [
      { x: cx * 0.5, y: cy * 0.6 },
      { x: cx * 1.5, y: cy * 0.6 },
      { x: cx, y: cy * 1.55 },
    ]
    st.points = []
    clusterCenters.forEach((c, ci) => {
      for (let i = 0; i < 12; i++) {
        st.points.push({
          x: c.x + (Math.random() - 0.5) * W * 0.22,
          y: c.y + (Math.random() - 0.5) * H * 0.22,
          cluster: -1,
          targetCluster: ci,
        })
      }
    })
    // Initial random centroids
    st.centroids = CLUSTER_COLORS.map((col, i) => ({
      x: W * 0.15 + Math.random() * W * 0.7,
      y: H * 0.15 + Math.random() * H * 0.7,
      color: col, tx: 0, ty: 0,
    }))
    st.phase = 'scatter'; st.phaseT = 0; st.iteration = 0
  }, [])

  useEffect(() => {
    const cv = cvRef.current; if (!cv) return
    const ctx = cv.getContext('2d')!
    const W = cv.width, H = cv.height
    initState(W, H)
    const st = stateRef.current

    const assignClusters = () => {
      st.points.forEach(p => {
        let minD = Infinity, best = 0
        st.centroids.forEach((c, i) => {
          const d = Math.hypot(p.x - c.x, p.y - c.y)
          if (d < minD) { minD = d; best = i }
        })
        p.cluster = best
      })
    }

    const computeNewCentroids = () => {
      st.centroids.forEach((c, i) => {
        const members = st.points.filter(p => p.cluster === i)
        if (members.length > 0) {
          c.tx = members.reduce((s, p) => s + p.x, 0) / members.length
          c.ty = members.reduce((s, p) => s + p.y, 0) / members.length
        }
      })
    }

    const draw = () => {
      if (playRef.current) {
        const s = speedRef.current
        st.phaseT += 0.02 * s

        if (st.phase === 'scatter' && st.phaseT > 1.5) {
          assignClusters(); st.phase = 'assign'; st.phaseT = 0
        } else if (st.phase === 'assign' && st.phaseT > 1.5) {
          computeNewCentroids(); st.phase = 'move'; st.phaseT = 0
        } else if (st.phase === 'move') {
          const t = Math.min(1, st.phaseT)
          st.centroids.forEach(c => {
            c.x += (c.tx - c.x) * 0.06 * s
            c.y += (c.ty - c.y) * 0.06 * s
          })
          if (st.phaseT > 2) {
            st.iteration++
            if (st.iteration >= 6) { st.phase = 'done'; st.phaseT = 0 }
            else { assignClusters(); st.phase = 'assign'; st.phaseT = 0 }
          }
        } else if (st.phase === 'done' && st.phaseT > 4) {
          initState(W, H); st.phase = 'scatter'; st.phaseT = 0
        }
      }

      ctx.clearRect(0, 0, W, H)

      // Draw cluster regions (Voronoi-like via colored semi-transparent circles)
      if (st.phase !== 'scatter') {
        st.centroids.forEach(c => {
          const grad = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, W * 0.35)
          grad.addColorStop(0, c.color + '18')
          grad.addColorStop(1, 'transparent')
          ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(c.x, c.y, W * 0.35, 0, Math.PI * 2); ctx.fill()
        })
      }

      // Points
      st.points.forEach(p => {
        const col = p.cluster >= 0 ? st.centroids[p.cluster].color : '#64748b'
        ctx.beginPath(); ctx.arc(p.x, p.y, 7, 0, Math.PI * 2)
        ctx.fillStyle = col + (p.cluster >= 0 ? 'cc' : '88'); ctx.fill()
        ctx.strokeStyle = p.cluster >= 0 ? col : '#334155'; ctx.lineWidth = 1.5; ctx.stroke()
      })

      // Lines from points to centroids (assign phase)
      if (st.phase === 'assign') {
        st.points.forEach(p => {
          const c = st.centroids[p.cluster]
          if (!c) return
          ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(c.x, c.y)
          ctx.strokeStyle = c.color + '44'; ctx.lineWidth = 1; ctx.setLineDash([3, 3]); ctx.stroke()
          ctx.setLineDash([])
        })
      }

      // Centroids
      st.centroids.forEach((c, i) => {
        // Glow
        ctx.beginPath(); ctx.arc(c.x, c.y, 14, 0, Math.PI * 2)
        ctx.fillStyle = c.color + '33'; ctx.fill()
        // Center
        ctx.beginPath(); ctx.arc(c.x, c.y, 10, 0, Math.PI * 2)
        ctx.fillStyle = c.color; ctx.fill()
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.5; ctx.stroke()
        // X marker
        ctx.fillStyle = '#fff'; ctx.font = 'bold 10px monospace'; ctx.textAlign = 'center'
        ctx.fillText('✕', c.x, c.y + 4)
        // Label
        ctx.fillStyle = c.color; ctx.font = 'bold 10px sans-serif'
        ctx.fillText(`Cluster ${i + 1}`, c.x, c.y - 16)
      })

      // Phase label
      const phaseLabels: Record<string, string> = {
        scatter: '⏳ Inicializace náhodných centroidů…',
        assign: `🔄 Přiřazuji body k nejbližšímu centroidu (iterace ${st.iteration + 1})`,
        move: `📍 Přesouvám centroidy do středu clusterů…`,
        done: '✓ Konvergováno! Clustery nalezeny.',
      }
      ctx.fillStyle = st.phase === 'done' ? '#22c55e' : C.sec
      ctx.font = `${st.phase === 'done' ? 'bold' : 'normal'} 11px sans-serif`
      ctx.textAlign = 'center'
      ctx.fillText(phaseLabels[st.phase] || '', W / 2, H - 10)

      // Iteration counter
      if (st.iteration > 0) {
        ctx.fillStyle = '#475569'; ctx.font = '10px monospace'; ctx.textAlign = 'left'
        ctx.fillText(`K-Means iterace: ${st.iteration}`, 10, 20)
      }

      rafRef.current = requestAnimationFrame(draw)
    }
    rafRef.current = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(rafRef.current)
  }, [initState])

  return <canvas ref={cvRef} width={500} height={380} style={{ width: '100%', height: '100%', maxWidth: 500, maxHeight: 380 }} />
}

// ── Reinforcement: maze agent ──────────────────────────────────────────────────
const MAZE_COLS = 8, MAZE_ROWS = 6
const CELL = 52

type MazeCell = 0 | 1  // 0=open, 1=wall
const MAZE: MazeCell[][] = [
  [0,0,0,1,0,0,0,0],
  [1,1,0,1,0,1,1,0],
  [0,0,0,0,0,0,1,0],
  [0,1,1,1,1,0,1,0],
  [0,0,0,0,1,0,0,0],
  [1,1,1,0,1,1,0,0],
]
const START = { r: 0, c: 0 }
const GOAL  = { r: 2, c: 7 }

const DIRS = [
  { dr: 0, dc: 1, label: '→' },
  { dr: 1, dc: 0, label: '↓' },
  { dr: 0, dc: -1, label: '←' },
  { dr: -1, dc: 0, label: '↑' },
]

function ReinforcementSim({ playing, speed }: { playing: boolean; speed: number }) {
  const cvRef = useRef<HTMLCanvasElement>(null)
  const stateRef = useRef<{
    agent: { r: number; c: number; x: number; y: number }
    Q: number[][][]
    episode: number
    step: number
    totalReward: number
    path: { r: number; c: number }[]
    rewardPops: { x: number; y: number; val: number; t: number }[]
    epsilon: number
    phaseT: number
    moving: boolean
    stepQueue: { r: number; c: number }[]
    episodeRewards: number[]
  }>({
    agent: { r: START.r, c: START.c, x: START.c * CELL + CELL/2, y: START.r * CELL + CELL/2 },
    Q: Array.from({ length: MAZE_ROWS }, () => Array.from({ length: MAZE_COLS }, () => Array(4).fill(0))),
    episode: 0, step: 0, totalReward: 0, path: [],
    rewardPops: [], epsilon: 1.0, phaseT: 0, moving: false, stepQueue: [], episodeRewards: [],
  })
  const rafRef = useRef(0)
  const playRef = useRef(playing)
  useEffect(() => { playRef.current = playing }, [playing])
  const speedRef = useRef(speed)
  useEffect(() => { speedRef.current = speed }, [speed])

  const cellX = (c: number) => c * CELL + CELL / 2
  const cellY = (r: number) => r * CELL + CELL / 2 + 30

  const isValid = (r: number, c: number) =>
    r >= 0 && r < MAZE_ROWS && c >= 0 && c < MAZE_COLS && MAZE[r][c] === 0

  const getEpsilonGreedy = (Q: number[][][], r: number, c: number, eps: number) => {
    if (Math.random() < eps) return Math.floor(Math.random() * 4)
    const qs = Q[r][c]
    return qs.indexOf(Math.max(...qs))
  }

  useEffect(() => {
    const cv = cvRef.current; if (!cv) return
    const ctx = cv.getContext('2d')!
    const W = cv.width, H = cv.height
    const st = stateRef.current
    const LR = 0.2, GAMMA = 0.9

    const runEpisode = () => {
      let r = START.r, c = START.c
      let episodeReward = 0
      const episodePath: { r: number; c: number }[] = [{ r, c }]
      for (let step = 0; step < 60; step++) {
        const action = getEpsilonGreedy(st.Q, r, c, st.epsilon)
        const { dr, dc } = DIRS[action]
        const nr = r + dr, nc = c + dc
        let reward = -0.1
        let nr2 = r, nc2 = c
        if (isValid(nr, nc)) { nr2 = nr; nc2 = nc }
        else { reward = -0.5 }
        if (nr2 === GOAL.r && nc2 === GOAL.c) { reward = 10 }
        const maxQ = Math.max(...st.Q[nr2][nc2])
        st.Q[r][c][action] += LR * (reward + GAMMA * maxQ - st.Q[r][c][action])
        r = nr2; c = nc2
        episodePath.push({ r, c })
        episodeReward += reward
        if (r === GOAL.r && c === GOAL.c) break
      }
      st.epsilon = Math.max(0.05, st.epsilon * 0.92)
      st.episode++
      st.episodeRewards.push(episodeReward)
      return episodePath
    }

    // Pre-train silently for visual quality
    for (let i = 0; i < 8; i++) runEpisode()

    const draw = () => {
      if (playRef.current) {
        const s = speedRef.current
        st.phaseT += 0.04 * s

        // Move agent along path
        if (st.moving && st.stepQueue.length > 0) {
          const target = st.stepQueue[0]
          const tx = cellX(target.c), ty = cellY(target.r)
          const dx = tx - st.agent.x, dy = ty - st.agent.y
          const dist = Math.hypot(dx, dy)
          const moveSpeed = CELL * 0.12 * s
          if (dist < moveSpeed) {
            st.agent.x = tx; st.agent.y = ty
            st.agent.r = target.r; st.agent.c = target.c
            st.stepQueue.shift()
            // Reward pop
            const isGoal = target.r === GOAL.r && target.c === GOAL.c
            if (isGoal || Math.random() < 0.3) {
              st.rewardPops.push({ x: tx, y: ty - 10, val: isGoal ? 10 : -0.1, t: 1.5 })
            }
          } else {
            st.agent.x += (dx / dist) * moveSpeed
            st.agent.y += (dy / dist) * moveSpeed
          }
        } else if (!st.moving || st.stepQueue.length === 0) {
          // Run new episode
          const path = runEpisode()
          st.stepQueue = path
          st.path = path
          st.moving = true
          st.agent.r = START.r; st.agent.c = START.c
          st.agent.x = cellX(START.c); st.agent.y = cellY(START.r)
        }

        // Update reward pops
        st.rewardPops = st.rewardPops.map(p => ({ ...p, t: p.t - 0.04 * s, y: p.y - 0.5 * s })).filter(p => p.t > 0)
      }

      ctx.clearRect(0, 0, W, H)

      // Header
      ctx.fillStyle = '#475569'; ctx.font = '10px sans-serif'; ctx.textAlign = 'left'
      ctx.fillText(`Epizoda: ${st.episode}  |  Epsilon (průzkum): ${(st.epsilon * 100).toFixed(0)}%`, 8, 18)
      ctx.fillStyle = '#334155'; ctx.font = '10px monospace'; ctx.textAlign = 'right'
      ctx.fillText(`ε klesá → Agent více využívá naučené znalosti`, W - 8, 18)

      // Maze
      for (let r = 0; r < MAZE_ROWS; r++) {
        for (let c = 0; c < MAZE_COLS; c++) {
          const x = c * CELL, y = r * CELL + 30
          if (MAZE[r][c] === 1) {
            ctx.fillStyle = '#1e293b'
            ctx.fillRect(x + 1, y + 1, CELL - 2, CELL - 2)
          } else {
            ctx.fillStyle = '#0f172a'
            ctx.fillRect(x + 1, y + 1, CELL - 2, CELL - 2)
            // Q-value heatmap
            const maxQ = Math.max(...st.Q[r][c])
            if (maxQ > 0.5) {
              const alpha = Math.min(0.4, maxQ * 0.08)
              ctx.fillStyle = `rgba(34,197,94,${alpha})`
              ctx.fillRect(x + 1, y + 1, CELL - 2, CELL - 2)
            }
            // Best action arrow
            if (!(r === GOAL.r && c === GOAL.c)) {
              const bestA = st.Q[r][c].indexOf(Math.max(...st.Q[r][c]))
              const qMax = st.Q[r][c][bestA]
              if (qMax > 0.3) {
                ctx.fillStyle = `rgba(148,163,184,${Math.min(0.7, qMax * 0.15)})`
                ctx.font = '14px sans-serif'; ctx.textAlign = 'center'
                ctx.fillText(DIRS[bestA].label, x + CELL/2, y + CELL/2 + 5)
              }
            }
          }
          ctx.strokeStyle = '#1e293b'; ctx.lineWidth = 1
          ctx.strokeRect(x, y + 30 - 30, CELL, CELL)
        }
      }

      // Goal
      ctx.font = '26px sans-serif'; ctx.textAlign = 'center'
      ctx.fillText('🏆', cellX(GOAL.c), cellY(GOAL.r) + 9)

      // Path trail
      if (st.path.length > 1) {
        ctx.beginPath(); ctx.moveTo(cellX(st.path[0].c), cellY(st.path[0].r))
        for (let i = 1; i < st.path.length; i++) {
          ctx.lineTo(cellX(st.path[i].c), cellY(st.path[i].r))
        }
        ctx.strokeStyle = '#f59e0b44'; ctx.lineWidth = 3; ctx.setLineDash([4, 3]); ctx.stroke()
        ctx.setLineDash([])
      }

      // Agent
      ctx.beginPath(); ctx.arc(st.agent.x, st.agent.y, 13, 0, Math.PI * 2)
      ctx.fillStyle = '#7c3aed'; ctx.fill()
      ctx.strokeStyle = '#a78bfa'; ctx.lineWidth = 2.5; ctx.stroke()
      ctx.font = '14px sans-serif'; ctx.textAlign = 'center'
      ctx.fillText('🤖', st.agent.x, st.agent.y + 5)

      // Reward pops
      st.rewardPops.forEach(p => {
        const alpha = Math.min(1, p.t)
        ctx.fillStyle = p.val > 0 ? `rgba(34,197,94,${alpha})` : `rgba(239,68,68,${alpha})`
        ctx.font = `bold ${p.val > 1 ? 15 : 11}px sans-serif`; ctx.textAlign = 'center'
        ctx.fillText(p.val > 0 ? `+${p.val.toFixed(1)}` : p.val.toFixed(1), p.x, p.y)
      })

      // Epsilon bar
      const barW = W * 0.55, barH = 7, barX = W * 0.22, barY = H - 20
      ctx.fillStyle = '#1e293b'; ctx.fillRect(barX, barY, barW, barH)
      ctx.fillStyle = `hsl(${st.epsilon * 45 + 15}, 80%, 55%)`
      ctx.fillRect(barX, barY, barW * st.epsilon, barH)
      ctx.fillStyle = '#475569'; ctx.font = '9px sans-serif'; ctx.textAlign = 'center'
      ctx.fillText(`Průzkum (ε=${(st.epsilon*100).toFixed(0)}%) ←→ Využívání znalostí`, W/2, H - 26)

      rafRef.current = requestAnimationFrame(draw)
    }
    rafRef.current = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(rafRef.current)
  }, [])

  return <canvas ref={cvRef} width={MAZE_COLS * CELL} height={MAZE_ROWS * CELL + 60}
    style={{ width: '100%', height: '100%', maxWidth: MAZE_COLS * CELL, maxHeight: MAZE_ROWS * CELL + 60 }} />
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function MLSim({ accentColor }: { accentColor: string }) {
  const [tab, setTab] = useState<Tab>('supervised')
  const [playing, setPlaying] = useState(true)
  const [speed, setSpeed] = useState(1)
  const info = TAB_INFO[tab]

  const TABS: { id: Tab; label: string; icon: string }[] = [
    { id: 'supervised',     label: 'Dozorované',    icon: '👨‍🏫' },
    { id: 'unsupervised',   label: 'Nedozorované',  icon: '🔍' },
    { id: 'reinforcement',  label: 'Posilované',    icon: '🎮' },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: C.bg, color: C.txt, fontFamily: 'inherit', overflow: 'hidden' }}>
      <style>{`
        @keyframes fadeIn { from { opacity:0; transform:translateY(8px) } to { opacity:1; transform:none } }
        .fi { animation: fadeIn .35s ease }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.4} }
      `}</style>

      {/* Header */}
      <div style={{ padding: '11px 22px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0, background: C.card }}>
        <a href="/student/simulations" style={{ color: C.sec, fontSize: 13, textDecoration: 'none' }}>← Simulace</a>
        <div style={{ width: 1, height: 14, background: C.border }} />
        <span style={{ fontSize: 14, fontWeight: 700 }}>🤖 Strojové učení — Typy učení</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          <button onClick={() => setPlaying(p => !p)}
            style={{ padding: '4px 12px', background: playing ? 'rgba(239,68,68,.12)' : 'rgba(255,255,255,.07)', color: playing ? '#f87171' : C.sec, border: `1px solid ${playing ? 'rgba(239,68,68,.25)' : C.border}`, borderRadius: 7, cursor: 'pointer', fontSize: 11, fontFamily: 'inherit' }}>
            {playing ? '⏸ Pauza' : '▶ Spustit'}
          </button>
          <label style={{ fontSize: 10, color: C.sec }}>Rychlost:
            <input type="range" min={0.3} max={3} step={0.1} value={speed} onChange={e => setSpeed(+e.target.value)}
              style={{ marginLeft: 6, width: 70, accentColor: accentColor }} />
            <span style={{ marginLeft: 4, color: C.txt }}>{speed.toFixed(1)}×</span>
          </label>
        </div>
      </div>

      {/* Tab bar */}
      <div style={{ display: 'flex', borderBottom: `1px solid ${C.border}`, flexShrink: 0, background: C.card }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{ flex: 1, padding: '12px 8px', background: 'transparent', border: 'none', borderBottom: `3px solid ${tab === t.id ? TAB_INFO[t.id].color : 'transparent'}`, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, transition: 'border-color .2s' }}>
            <span style={{ fontSize: 20 }}>{t.icon}</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: tab === t.id ? TAB_INFO[t.id].color : C.sec }}>{t.label}</span>
            <span style={{ fontSize: 9, color: '#475569' }}>{TAB_INFO[t.id].subtitle}</span>
          </button>
        ))}
      </div>

      {/* Main content */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0, overflow: 'hidden' }}>

        {/* Canvas */}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, position: 'relative', overflow: 'hidden' }}>
          {/* Accent banner */}
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: `linear-gradient(90deg, transparent, ${info.color}, transparent)` }} />

          <div key={tab} className="fi" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%' }}>
            {tab === 'supervised'   && <SupervisedSim     playing={playing} speed={speed} />}
            {tab === 'unsupervised' && <UnsupervisedSim   playing={playing} speed={speed} />}
            {tab === 'reinforcement'&& <ReinforcementSim  playing={playing} speed={speed} />}
          </div>
        </div>

        {/* Right info panel */}
        <div style={{ width: 300, flexShrink: 0, borderLeft: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: C.card }}>
          <div style={{ flex: 1, overflowY: 'auto', padding: 18 }}>
            <div key={tab} className="fi">
              {/* Title */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: info.color + '20', border: `1px solid ${info.color}40`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>
                  {info.icon}
                </div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: '#fff' }}>{info.title}</div>
                  <div style={{ fontSize: 10, color: info.color, fontWeight: 600 }}>{info.subtitle}</div>
                </div>
              </div>

              {/* Tagline */}
              <div style={{ padding: '8px 12px', background: info.color + '12', border: `1px solid ${info.color}30`, borderRadius: 8, marginBottom: 14 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: info.color }}>{info.tagline}</div>
              </div>

              {/* Description */}
              <p style={{ fontSize: 12.5, color: '#cbd5e1', lineHeight: 1.75, margin: '0 0 14px' }}>{info.description}</p>

              {/* How it works */}
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: C.sec, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>Jak funguje</div>
                {info.steps.map((s, i) => (
                  <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6, alignItems: 'flex-start' }}>
                    <div style={{ width: 18, height: 18, borderRadius: '50%', background: info.color + '25', border: `1px solid ${info.color}50`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, color: info.color, flexShrink: 0, marginTop: 1 }}>{i + 1}</div>
                    <span style={{ fontSize: 11.5, color: '#94a3b8', lineHeight: 1.6 }}>{s.replace(/^\d+\. /, '')}</span>
                  </div>
                ))}
              </div>

              {/* When used */}
              <div style={{ padding: '9px 11px', background: 'rgba(251,191,36,.05)', border: '1px solid rgba(251,191,36,.15)', borderRadius: 8, marginBottom: 14 }}>
                <p style={{ fontSize: 11, color: '#fcd34d', margin: 0, lineHeight: 1.65 }}>💡 {info.when}</p>
              </div>

              {/* Pros / Cons */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div style={{ padding: '8px 10px', background: 'rgba(34,197,94,.06)', border: '1px solid rgba(34,197,94,.18)', borderRadius: 8 }}>
                  <div style={{ fontSize: 9, fontWeight: 700, color: '#4ade80', textTransform: 'uppercase', marginBottom: 6 }}>✓ Výhody</div>
                  {info.pros.map((p, i) => <div key={i} style={{ fontSize: 10.5, color: '#86efac', marginBottom: 3, lineHeight: 1.5 }}>• {p}</div>)}
                </div>
                <div style={{ padding: '8px 10px', background: 'rgba(239,68,68,.06)', border: '1px solid rgba(239,68,68,.18)', borderRadius: 8 }}>
                  <div style={{ fontSize: 9, fontWeight: 700, color: '#f87171', textTransform: 'uppercase', marginBottom: 6 }}>✗ Nevýhody</div>
                  {info.cons.map((c, i) => <div key={i} style={{ fontSize: 10.5, color: '#fca5a5', marginBottom: 3, lineHeight: 1.5 }}>• {c}</div>)}
                </div>
              </div>

              {/* Comparison table at bottom */}
              <div style={{ marginTop: 16, borderTop: `1px solid ${C.border}`, paddingTop: 14 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: C.sec, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 10 }}>Srovnání všech typů</div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                      <th style={{ padding: '4px 6px', color: C.sec, fontWeight: 600, textAlign: 'left' }}>Typ</th>
                      <th style={{ padding: '4px 6px', color: C.sec, fontWeight: 600, textAlign: 'left' }}>Štítky?</th>
                      <th style={{ padding: '4px 6px', color: C.sec, fontWeight: 600, textAlign: 'left' }}>Příklad</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { name: '👨‍🏫 Dozor.',  labels: 'Ano', example: 'Spam filtr', id: 'supervised' },
                      { name: '🔍 Nedozor.', labels: 'Ne',  example: 'Clustering', id: 'unsupervised' },
                      { name: '🎮 Posilovaní', labels: 'Odměna', example: 'AlphaGo', id: 'reinforcement' },
                    ].map(row => (
                      <tr key={row.id} style={{ borderBottom: `1px solid ${C.border}`, background: tab === row.id ? TAB_INFO[row.id as Tab].color + '10' : 'transparent' }}>
                        <td style={{ padding: '5px 6px', color: tab === row.id ? TAB_INFO[row.id as Tab].color : '#64748b', fontWeight: tab === row.id ? 700 : 400 }}>{row.name}</td>
                        <td style={{ padding: '5px 6px', color: '#94a3b8' }}>{row.labels}</td>
                        <td style={{ padding: '5px 6px', color: '#94a3b8' }}>{row.example}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
