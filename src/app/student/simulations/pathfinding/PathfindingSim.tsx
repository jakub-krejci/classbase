'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useRef, useCallback } from 'react'

// ─── Constants ─────────────────────────────────────────────────────────────────
const COLS = 28
const ROWS = 18
const C = {
  bg:'#090B10', card:'#11141D', border:'rgba(255,255,255,0.07)',
  txt:'#fff', sec:'#8892a4',
  wall:'#1e293b', empty:'#0f172a',
  open:'rgba(59,130,246,0.25)',   // open set
  closed:'rgba(124,58,237,0.22)', // closed set
  path:'#f97316',
  start:'#22c55e', goal:'#ef4444',
  weight:'#f59e0b',
}

type CellType = 'empty' | 'wall' | 'start' | 'goal' | 'weight'
type CellState = 'none' | 'open' | 'closed' | 'path' | 'current'
type AlgoId = 'astar' | 'dijkstra' | 'bfs' | 'dfs' | 'greedy'
type DrawMode = 'wall' | 'weight' | 'erase' | 'start' | 'goal'
type Heuristic = 'manhattan' | 'euclidean' | 'chebyshev' | 'zero'

interface Cell {
  type: CellType
  state: CellState
  g: number      // cost from start
  h: number      // heuristic to goal
  f: number      // g + h
  weight: number // terrain cost (1 = normal, 3 = mud etc.)
  parent: number | null
  animDelay: number
}

interface StepFrame {
  cells: Cell[]
  current: number | null
  openSet: number[]
  closedSet: number[]
  pathFound: boolean
  pathCells: number[]
  stats: { steps: number; opened: number; pathLen: number; pathCost: number }
}

// ─── Heuristics ───────────────────────────────────────────────────────────────
function heuristic(id: number, goalId: number, type: Heuristic): number {
  const r1 = Math.floor(id / COLS), c1 = id % COLS
  const r2 = Math.floor(goalId / COLS), c2 = goalId % COLS
  const dx = Math.abs(c1 - c2), dy = Math.abs(r1 - r2)
  switch (type) {
    case 'manhattan':  return dx + dy
    case 'euclidean':  return Math.sqrt(dx*dx + dy*dy)
    case 'chebyshev':  return Math.max(dx, dy)
    case 'zero':       return 0
  }
}

// ─── Neighbours (4 or 8 directional) ─────────────────────────────────────────
function neighbours(id: number, diagonal: boolean): number[] {
  const r = Math.floor(id / COLS), c = id % COLS
  const dirs4 = [[0,1],[0,-1],[1,0],[-1,0]]
  const dirs8 = [...dirs4, [1,1],[1,-1],[-1,1],[-1,-1]]
  const dirs = diagonal ? dirs8 : dirs4
  return dirs
    .map(([dr,dc]) => [r+dr, c+dc])
    .filter(([nr,nc]) => nr>=0 && nr<ROWS && nc>=0 && nc<COLS)
    .map(([nr,nc]) => nr*COLS+nc)
}

// ─── Pathfinding step generator ──────────────────────────────────────────────
function* runAlgo(
  initial: Cell[],
  startId: number,
  goalId: number,
  algo: AlgoId,
  heuristicType: Heuristic,
  diagonal: boolean,
): Generator<StepFrame> {
  const cells = initial.map(c => ({ ...c, g:Infinity, h:0, f:Infinity, parent:null, state:'none' as CellState }))
  cells[startId].g = 0
  cells[startId].h = heuristic(startId, goalId, heuristicType)
  cells[startId].f = cells[startId].h

  // Priority queue using array (good enough for demo grids)
  let openSet: number[] = [startId]
  const openSetHash = new Set<number>([startId])
  const closedSet = new Set<number>()
  cells[startId].state = 'open'

  let steps = 0
  const emitFrame = (current: number | null, pathFound = false, pathCells: number[] = []): StepFrame => ({
    cells: cells.map(c => ({ ...c })),
    current,
    openSet: [...openSetHash],
    closedSet: [...closedSet],
    pathFound,
    pathCells,
    stats: {
      steps,
      opened: openSetHash.size + closedSet.size,
      pathLen: pathCells.length,
      pathCost: pathCells.reduce((s, id) => s + cells[id].weight, 0),
    },
  })

  yield emitFrame(null)

  while (openSet.length > 0) {
    steps++

    // Pick best node depending on algorithm
    let currentIdx: number
    if (algo === 'astar' || algo === 'greedy') {
      const pickF = algo === 'greedy'
        ? (id: number) => cells[id].h
        : (id: number) => cells[id].f
      currentIdx = openSet.reduce((best, id) => pickF(id) < pickF(best) ? id : best, openSet[0])
    } else if (algo === 'dijkstra') {
      currentIdx = openSet.reduce((best, id) => cells[id].g < cells[best].g ? id : best, openSet[0])
    } else if (algo === 'bfs') {
      currentIdx = openSet[0]  // FIFO queue
    } else {
      currentIdx = openSet[openSet.length - 1]  // DFS: LIFO stack
    }

    if (currentIdx === goalId) {
      // Reconstruct path
      const path: number[] = []
      let cur: number | null = goalId
      while (cur !== null) { path.unshift(cur); cur = cells[cur].parent }
      path.forEach(id => cells[id].state = 'path')
      yield emitFrame(currentIdx, true, path)
      return
    }

    openSet = openSet.filter(id => id !== currentIdx)
    openSetHash.delete(currentIdx)
    closedSet.add(currentIdx)
    cells[currentIdx].state = 'closed'

    yield emitFrame(currentIdx)

    for (const nb of neighbours(currentIdx, diagonal)) {
      if (cells[nb].type === 'wall') continue
      if (closedSet.has(nb)) continue

      const moveCost = diagonal
        ? (Math.floor(currentIdx/COLS) !== Math.floor(nb/COLS) && currentIdx%COLS !== nb%COLS ? 1.414 : 1)
        : 1
      const tentativeG = cells[currentIdx].g + moveCost * cells[nb].weight

      if (tentativeG < cells[nb].g) {
        cells[nb].parent = currentIdx
        cells[nb].g = tentativeG
        cells[nb].h = heuristic(nb, goalId, heuristicType)
        cells[nb].f = cells[nb].g + cells[nb].h

        if (!openSetHash.has(nb)) {
          openSet.push(nb)
          openSetHash.add(nb)
          cells[nb].state = 'open'
        }
      }
    }
  }

  // No path found
  yield emitFrame(null, false, [])
}

// ─── Preset mazes ─────────────────────────────────────────────────────────────
function emptyGrid(): Cell[] {
  return Array.from({ length: COLS * ROWS }, () => ({
    type: 'empty', state: 'none', g: Infinity, h: 0, f: Infinity,
    weight: 1, parent: null, animDelay: 0,
  }))
}

function makeMaze(type: 'empty'|'random'|'maze'|'weights'): { cells: Cell[]; start: number; goal: number } {
  const cells = emptyGrid()
  const start = Math.floor(ROWS/2) * COLS + 2
  const goal  = Math.floor(ROWS/2) * COLS + COLS - 3

  if (type === 'empty') {
    // Nothing
  } else if (type === 'random') {
    for (let i = 0; i < COLS * ROWS; i++) {
      if (i === start || i === goal) continue
      if (Math.random() < 0.28) cells[i].type = 'wall'
    }
  } else if (type === 'maze') {
    // Recursive division maze
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (r === 0 || c === 0 || r === ROWS-1 || c === COLS-1) cells[r*COLS+c].type = 'wall'
      }
    }
    const divide = (r1:number,c1:number,r2:number,c2:number,horiz:boolean) => {
      if (r2-r1 < 2 || c2-c1 < 2) return
      if (horiz) {
        const wallR = r1+1+Math.floor(Math.random()*(r2-r1-1))
        const passC = c1+Math.floor(Math.random()*(c2-c1+1))
        for (let c=c1;c<=c2;c++) if(c!==passC) cells[wallR*COLS+c].type='wall'
        divide(r1,c1,wallR-1,c2,!horiz)
        divide(wallR+1,c1,r2,c2,!horiz)
      } else {
        const wallC = c1+1+Math.floor(Math.random()*(c2-c1-1))
        const passR = r1+Math.floor(Math.random()*(r2-r1+1))
        for (let r=r1;r<=r2;r++) if(r!==passR) cells[r*COLS+wallC].type='wall'
        divide(r1,c1,r2,wallC-1,!horiz)
        divide(r1,wallC+1,r2,c2,!horiz)
      }
    }
    divide(1,1,ROWS-2,COLS-2, ROWS>COLS)
  } else if (type === 'weights') {
    // Terrain weights
    for (let i = 0; i < COLS * ROWS; i++) {
      if (i === start || i === goal) continue
      const r = Math.random()
      if (r < 0.12) { cells[i].type = 'wall' }
      else if (r < 0.25) { cells[i].weight = 5; cells[i].type = 'weight' }
      else if (r < 0.35) { cells[i].weight = 3; cells[i].type = 'weight' }
    }
  }

  cells[start].type = 'start'
  cells[goal].type  = 'goal'
  return { cells, start, goal }
}

// ─── Algorithm info ───────────────────────────────────────────────────────────
const ALGO_INFO: Record<AlgoId,{name:string;icon:string;color:string;desc:string;complexity:string;optimal:boolean;complete:boolean}> = {
  astar:    {name:'A* Search',         icon:'⭐',color:'#f97316',desc:'Kombinuje g(n) (vzdálenost od startu) a h(n) (heuristika k cíli). Garantuje optimální cestu pokud h je admissible.',complexity:'O(b^d)',optimal:true,complete:true},
  dijkstra: {name:'Dijkstra',           icon:'🎯',color:'#3b82f6',desc:'Prochází uzly od nejnižší kumulativní ceny. Garantuje optimální cestu, ale nepoužívá heuristiku — prozkoumá více buněk.',complexity:'O(V log V)',optimal:true,complete:true},
  bfs:      {name:'BFS',               icon:'🌊',color:'#22c55e',desc:'Prochází vrstvu po vrstvě (FIFO). Najde cestu s nejmenším počtem kroků, ale nerespektuje váhy terénu.',complexity:'O(V+E)',optimal:false,complete:true},
  dfs:      {name:'DFS',               icon:'🔍',color:'#a855f7',desc:'Prochází do hloubky (LIFO stack). Rychle najde NĚJAKOU cestu, ale ne nutně optimální. Může procházet celý graf.',complexity:'O(V+E)',optimal:false,complete:false},
  greedy:   {name:'Greedy Best-First', icon:'🐇',color:'#f59e0b',desc:'Vždy jde k uzlu s nejlepší heuristikou (ignoruje g). Rychlý, ale neoptimální — může jít "slepou uličkou".',complexity:'O(b^m)',optimal:false,complete:false},
}

const HEURISTIC_INFO: Record<Heuristic,{name:string;desc:string}> = {
  manhattan: {name:'Manhattan',   desc:'|dx|+|dy| — ideální pro 4-směrový pohyb (město, mřížka)'},
  euclidean: {name:'Euclidean',   desc:'√(dx²+dy²) — přímá vzdálenost, vhodná pro 8-směrový pohyb'},
  chebyshev: {name:'Chebyshev',   desc:'max(|dx|,|dy|) — diagonální pohyb stejné ceny'},
  zero:      {name:'Zero (=Dijkstra)',desc:'h=0 — A* se chová jako Dijkstra, nepoužívá heuristiku'},
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════
export default function PathfindingSim({ accentColor }: { accentColor: string }) {
  const [algo, setAlgo]           = useState<AlgoId>('astar')
  const [heuristicType, setHeuristicType] = useState<Heuristic>('manhattan')
  const [diagonal, setDiagonal]   = useState(false)
  const [drawMode, setDrawMode]   = useState<DrawMode>('wall')
  const [speed, setSpeed]         = useState(3)   // steps per frame

  const [grid, setGrid]           = useState<{ cells:Cell[]; start:number; goal:number }>(() => makeMaze('empty'))
  const [frames, setFrames]       = useState<StepFrame[]>([])
  const [frameIdx, setFrameIdx]   = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isRunning, setIsRunning] = useState(false)
  const [isDone, setIsDone]       = useState(false)

  const canvasRef     = useRef<HTMLCanvasElement>(null)
  const containerRef  = useRef<HTMLDivElement>(null)
  const [canvasSize, setCanvasSize] = useState({ w: 700, h: 420 })
  const rafRef        = useRef(0)
  const playRef       = useRef(false)
  const frameIdxRef   = useRef(0)
  const framesRef     = useRef<StepFrame[]>([])
  const speedRef      = useRef(3)
  const isDrawing     = useRef(false)
  const lastDrawCell  = useRef(-1)

  useEffect(() => { speedRef.current = speed }, [speed])
  useEffect(() => { playRef.current = isPlaying }, [isPlaying])
  useEffect(() => { framesRef.current = frames }, [frames])
  useEffect(() => { frameIdxRef.current = frameIdx }, [frameIdx])

  // Measure canvas container
  useEffect(() => {
    const el = containerRef.current; if (!el) return
    const ro = new ResizeObserver(e => {
      const { width, height } = e[0].contentRect
      setCanvasSize({ w: Math.floor(width), h: Math.floor(height) })
    })
    ro.observe(el); return () => ro.disconnect()
  }, [])

  const CELL_W = canvasSize.w / COLS
  const CELL_H = canvasSize.h / ROWS

  // ── Compute all steps upfront ──────────────────────────────────────────────
  const computeSteps = useCallback(() => {
    setIsRunning(true)
    setIsPlaying(false)
    setIsDone(false)
    setFrameIdx(0)

    const gen = runAlgo(grid.cells, grid.start, grid.goal, algo, heuristicType, diagonal)
    const allFrames: StepFrame[] = []
    for (const frame of gen) allFrames.push(frame)

    setFrames(allFrames)
    framesRef.current = allFrames
    setIsRunning(false)
  }, [grid, algo, heuristicType, diagonal])

  // ── Auto-play animation ────────────────────────────────────────────────────
  useEffect(() => {
    if (!isPlaying) return
    const step = () => {
      if (!playRef.current) return
      const next = frameIdxRef.current + speedRef.current
      if (next >= framesRef.current.length - 1) {
        frameIdxRef.current = framesRef.current.length - 1
        setFrameIdx(framesRef.current.length - 1)
        setIsPlaying(false)
        setIsDone(true)
        return
      }
      frameIdxRef.current = next
      setFrameIdx(next)
      rafRef.current = requestAnimationFrame(step)
    }
    rafRef.current = requestAnimationFrame(step)
    return () => cancelAnimationFrame(rafRef.current)
  }, [isPlaying])

  // ── Draw canvas ────────────────────────────────────────────────────────────
  useEffect(() => {
    const cv = canvasRef.current; if (!cv) return
    const ctx = cv.getContext('2d')!
    const W = canvasSize.w, H = canvasSize.h
    ctx.clearRect(0, 0, W, H)

    const current = frames.length > 0 ? frames[frameIdx] : null
    const displayCells = current ? current.cells : grid.cells

    displayCells.forEach((cell, id) => {
      const r = Math.floor(id / COLS), col = id % COLS
      const x = col * CELL_W, y = r * CELL_H
      const cw = CELL_W - 1, ch = CELL_H - 1

      // Background
      let bg = C.empty
      if (cell.type === 'wall') bg = C.wall
      else if (cell.state === 'path')    bg = C.path + '33'
      else if (cell.state === 'closed')  bg = C.closed
      else if (cell.state === 'open')    bg = C.open
      else if (cell.type === 'weight')   {
        const wt = cell.weight
        bg = wt >= 5 ? 'rgba(239,68,68,.15)' : 'rgba(245,158,11,.12)'
      }

      ctx.fillStyle = bg
      ctx.fillRect(x, y, cw, ch)

      // Current cell highlight
      if (current && id === current.current) {
        ctx.fillStyle = 'rgba(255,255,255,0.15)'
        ctx.fillRect(x, y, cw, ch)
        ctx.strokeStyle = '#fff'
        ctx.lineWidth = 1.5
        ctx.strokeRect(x+0.5, y+0.5, cw-1, ch-1)
      }

      // Path highlight
      if (cell.state === 'path') {
        ctx.fillStyle = C.path + 'cc'
        ctx.fillRect(x+2, y+2, cw-4, ch-4)
      }

      // Weight terrain
      if (cell.type === 'weight' && cell.state !== 'path') {
        ctx.fillStyle = cell.weight >= 5 ? '#ef444499' : '#f59e0b88'
        ctx.font = `bold ${Math.min(CELL_W*0.55, 11)}px sans-serif`
        ctx.textAlign = 'center'
        ctx.fillText(cell.weight >= 5 ? '🪨' : '〰', x + CELL_W/2, y + CELL_H/2 + 4)
      }

      // f/g/h values (show if large enough)
      if (CELL_W >= 22 && current && cell.state !== 'none' && cell.type !== 'wall' && cell.g !== Infinity && cell.type !== 'start' && cell.type !== 'goal') {
        ctx.fillStyle = 'rgba(255,255,255,0.45)'
        ctx.font = `${Math.min(CELL_W*0.28, 7)}px monospace`
        ctx.textAlign = 'left'
        ctx.fillText(`g:${cell.g.toFixed(0)}`, x+1, y+7)
        ctx.textAlign = 'right'
        ctx.fillText(`h:${cell.h.toFixed(0)}`, x+cw-1, y+7)
        ctx.textAlign = 'center'
        ctx.font = `bold ${Math.min(CELL_W*0.3, 8)}px monospace`
        ctx.fillStyle = cell.state==='path'?'#fff':'rgba(255,255,255,0.65)'
        ctx.fillText(`f:${cell.f.toFixed(0)}`, x+CELL_W/2, y+ch-2)
      }

      // Start / Goal
      if (cell.type === 'start') {
        ctx.fillStyle = C.start
        ctx.fillRect(x, y, cw, ch)
        ctx.fillStyle = '#fff'
        ctx.font = `bold ${Math.min(CELL_W*0.7,16)}px sans-serif`
        ctx.textAlign = 'center'
        ctx.fillText('S', x+CELL_W/2, y+CELL_H/2+4)
      }
      if (cell.type === 'goal') {
        ctx.fillStyle = C.goal
        ctx.fillRect(x, y, cw, ch)
        ctx.fillStyle = '#fff'
        ctx.font = `bold ${Math.min(CELL_W*0.7,16)}px sans-serif`
        ctx.textAlign = 'center'
        ctx.fillText('G', x+CELL_W/2, y+CELL_H/2+4)
      }
    })

    // Draw path as polyline on top
    if (current && current.pathFound && current.pathCells.length > 1) {
      ctx.beginPath()
      current.pathCells.forEach((id, i) => {
        const r = Math.floor(id / COLS), col = id % COLS
        const x = col * CELL_W + CELL_W/2, y = r * CELL_H + CELL_H/2
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
      })
      ctx.strokeStyle = C.path
      ctx.lineWidth = Math.max(2, CELL_W * 0.18)
      ctx.lineJoin = 'round'
      ctx.lineCap = 'round'
      ctx.stroke()
    }

    // Grid lines (subtle)
    ctx.strokeStyle = 'rgba(255,255,255,0.03)'
    ctx.lineWidth = 0.5
    for (let r = 0; r <= ROWS; r++) { ctx.beginPath(); ctx.moveTo(0, r*CELL_H); ctx.lineTo(W, r*CELL_H); ctx.stroke() }
    for (let c = 0; c <= COLS; c++) { ctx.beginPath(); ctx.moveTo(c*CELL_W, 0); ctx.lineTo(c*CELL_W, H); ctx.stroke() }
  }, [frames, frameIdx, grid, canvasSize, CELL_W, CELL_H])

  // ── Mouse draw on canvas ───────────────────────────────────────────────────
  const getCellFromEvent = (e: React.MouseEvent<HTMLCanvasElement>): number => {
    const rect = canvasRef.current!.getBoundingClientRect()
    const scaleX = canvasSize.w / rect.width
    const scaleY = canvasSize.h / rect.height
    const col = Math.floor((e.clientX - rect.left) * scaleX / CELL_W)
    const row = Math.floor((e.clientY - rect.top) * scaleY / CELL_H)
    if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return -1
    return row * COLS + col
  }

  const applyDraw = useCallback((cellId: number) => {
    if (cellId < 0 || cellId === lastDrawCell.current) return
    lastDrawCell.current = cellId
    setGrid(prev => {
      if (drawMode === 'start') {
        if (prev.cells[cellId].type === 'goal') return prev
        const cells = prev.cells.map((c, i) => {
          if (i === prev.start) return { ...c, type: 'empty' as CellType }
          if (i === cellId) return { ...c, type: 'start' as CellType, weight: 1 }
          return c
        })
        return { cells, start: cellId, goal: prev.goal }
      }
      if (drawMode === 'goal') {
        if (prev.cells[cellId].type === 'start') return prev
        const cells = prev.cells.map((c, i) => {
          if (i === prev.goal) return { ...c, type: 'empty' as CellType }
          if (i === cellId) return { ...c, type: 'goal' as CellType, weight: 1 }
          return c
        })
        return { cells, start: prev.start, goal: cellId }
      }
      if (prev.cells[cellId].type === 'start' || prev.cells[cellId].type === 'goal') return prev
      const cells = prev.cells.map((c, i) => {
        if (i !== cellId) return c
        if (drawMode === 'wall')   return { ...c, type: 'wall' as CellType, weight: 1 }
        if (drawMode === 'weight') return { ...c, type: 'weight' as CellType, weight: 5 }
        if (drawMode === 'erase') return { ...c, type: 'empty' as CellType, weight: 1 }
        return c
      })
      return { ...prev, cells }
    })
    setFrames([]); setFrameIdx(0); setIsDone(false)
  }, [drawMode])

  const onMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    isDrawing.current = true; lastDrawCell.current = -1
    applyDraw(getCellFromEvent(e))
  }
  const onMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing.current) return
    applyDraw(getCellFromEvent(e))
  }
  const onMouseUp = () => { isDrawing.current = false; lastDrawCell.current = -1 }

  const loadPreset = (type: 'empty'|'random'|'maze'|'weights') => {
    setGrid(makeMaze(type))
    setFrames([]); setFrameIdx(0); setIsPlaying(false); setIsDone(false)
  }

  const reset = () => {
    setFrames([]); setFrameIdx(0); setIsPlaying(false); setIsDone(false)
    setGrid(g => ({ ...g, cells: g.cells.map(c => ({ ...c, state:'none', g:Infinity, h:0, f:Infinity, parent:null })) }))
  }

  const currentFrame = frames[frameIdx]
  const stats = currentFrame?.stats
  const ai = ALGO_INFO[algo]
  const hi = HEURISTIC_INFO[heuristicType]

  const ALGOS: AlgoId[] = ['astar','dijkstra','bfs','dfs','greedy']
  const DRAW_MODES: {id:DrawMode;icon:string;label:string}[] = [
    {id:'wall',   icon:'🧱', label:'Zeď'},
    {id:'weight', icon:'🪨', label:'Těžký terén'},
    {id:'erase',  icon:'🧹', label:'Mazat'},
    {id:'start',  icon:'🟢', label:'Start'},
    {id:'goal',   icon:'🔴', label:'Cíl'},
  ]

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', background:C.bg, color:C.txt, fontFamily:'inherit', overflow:'hidden' }}>
      <style>{`@keyframes fadeIn{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:none}}.fi{animation:fadeIn .25s ease}`}</style>

      {/* ── Header ── */}
      <div style={{ padding:'9px 18px', borderBottom:`1px solid ${C.border}`, display:'flex', alignItems:'center', gap:12, flexShrink:0, background:C.card }}>
        <a href="/student/simulations" style={{ color:C.sec, fontSize:13, textDecoration:'none' }}>← Simulace</a>
        <div style={{ width:1, height:14, background:C.border }}/>
        <span style={{ fontSize:14, fontWeight:700 }}>🗺️ Pathfinding — A* a další algoritmy</span>
        <div style={{ marginLeft:'auto', display:'flex', gap:8, alignItems:'center' }}>
          <label style={{ fontSize:10, color:C.sec, display:'flex', alignItems:'center', gap:5 }}>
            Rychlost:
            <input type="range" min={1} max={20} value={speed} onChange={e=>setSpeed(+e.target.value)}
              style={{ width:70, accentColor }}/>
            <span style={{ color:C.txt, minWidth:20 }}>{speed}×</span>
          </label>
        </div>
      </div>

      {/* ── Algorithm selector ── */}
      <div style={{ display:'flex', borderBottom:`1px solid ${C.border}`, flexShrink:0, background:C.card, overflowX:'auto' }}>
        {ALGOS.map(a => {
          const ai2 = ALGO_INFO[a]
          return (
            <button key={a} onClick={()=>{ setAlgo(a); reset() }}
              style={{ flexShrink:0, padding:'8px 12px', background:'transparent', border:'none', borderBottom:`3px solid ${algo===a?ai2.color:'transparent'}`, cursor:'pointer', fontFamily:'inherit', display:'flex', flexDirection:'column', alignItems:'center', gap:2, minWidth:90 }}>
              <span style={{ fontSize:18 }}>{ai2.icon}</span>
              <span style={{ fontSize:10, fontWeight:700, color:algo===a?ai2.color:C.sec, whiteSpace:'nowrap' }}>{ai2.name}</span>
            </button>
          )
        })}
      </div>

      {/* ── Main ── */}
      <div style={{ flex:1, display:'flex', minHeight:0, overflow:'hidden' }}>

        {/* ── Controls sidebar ── */}
        <div style={{ width:180, flexShrink:0, borderRight:`1px solid ${C.border}`, display:'flex', flexDirection:'column', padding:10, gap:10, overflowY:'auto', background:C.card }}>

          {/* Draw tools */}
          <div>
            <div style={{ fontSize:9, fontWeight:700, color:C.sec, textTransform:'uppercase', letterSpacing:'.06em', marginBottom:6 }}>Kreslit</div>
            <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
              {DRAW_MODES.map(m => (
                <button key={m.id} onClick={()=>setDrawMode(m.id)}
                  style={{ padding:'6px 8px', background:drawMode===m.id?accentColor+'22':'rgba(255,255,255,.04)', color:drawMode===m.id?accentColor:'#94a3b8', border:`1px solid ${drawMode===m.id?accentColor+'44':C.border}`, borderRadius:7, cursor:'pointer', fontFamily:'inherit', fontSize:11, fontWeight:drawMode===m.id?700:400, textAlign:'left' as const, display:'flex', alignItems:'center', gap:6 }}>
                  <span>{m.icon}</span>{m.label}
                </button>
              ))}
            </div>
          </div>

          {/* Presets */}
          <div>
            <div style={{ fontSize:9, fontWeight:700, color:C.sec, textTransform:'uppercase', letterSpacing:'.06em', marginBottom:6 }}>Preset mapy</div>
            <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
              {([['empty','🌿','Prázdná'],['random','🎲','Náhodná'],['maze','🌀','Bludiště'],['weights','⛰','Terén']] as const).map(([t,icon,label]) => (
                <button key={t} onClick={()=>loadPreset(t)}
                  style={{ padding:'5px 8px', background:'rgba(255,255,255,.04)', color:'#94a3b8', border:`1px solid ${C.border}`, borderRadius:7, cursor:'pointer', fontFamily:'inherit', fontSize:11, textAlign:'left' as const, display:'flex', alignItems:'center', gap:6 }}>
                  {icon} {label}
                </button>
              ))}
            </div>
          </div>

          {/* Options */}
          <div>
            <div style={{ fontSize:9, fontWeight:700, color:C.sec, textTransform:'uppercase', letterSpacing:'.06em', marginBottom:6 }}>Nastavení</div>
            <label style={{ display:'flex', alignItems:'center', gap:6, cursor:'pointer', marginBottom:8 }}>
              <input type="checkbox" checked={diagonal} onChange={e=>{ setDiagonal(e.target.checked); reset() }}
                style={{ accentColor }}/>
              <span style={{ fontSize:11, color:'#94a3b8' }}>Diagonální pohyb</span>
            </label>
            <div style={{ fontSize:9, fontWeight:700, color:C.sec, marginBottom:4 }}>Heuristika</div>
            {(Object.keys(HEURISTIC_INFO) as Heuristic[]).map(h => (
              <button key={h} onClick={()=>{ setHeuristicType(h); reset() }}
                style={{ display:'block', width:'100%', padding:'4px 8px', marginBottom:3, background:heuristicType===h?accentColor+'22':'transparent', color:heuristicType===h?accentColor:'#64748b', border:`1px solid ${heuristicType===h?accentColor+'44':C.border}`, borderRadius:6, cursor:'pointer', fontFamily:'inherit', fontSize:10, textAlign:'left' as const }}>
                {HEURISTIC_INFO[h].name}
              </button>
            ))}
          </div>

          {/* Legend */}
          <div>
            <div style={{ fontSize:9, fontWeight:700, color:C.sec, textTransform:'uppercase', letterSpacing:'.06em', marginBottom:6 }}>Legenda</div>
            {[
              {col:C.start,     lbl:'Start'},
              {col:C.goal,      lbl:'Cíl'},
              {col:C.open+'cc', lbl:'Open set'},
              {col:C.closed+'cc',lbl:'Closed set'},
              {col:C.path,      lbl:'Nalezená cesta'},
              {col:C.wall,      lbl:'Zeď'},
              {col:'#f59e0b66', lbl:'Těžký terén'},
            ].map(({col,lbl}) => (
              <div key={lbl} style={{ display:'flex', alignItems:'center', gap:6, marginBottom:4 }}>
                <div style={{ width:14, height:14, borderRadius:3, background:col, flexShrink:0 }}/>
                <span style={{ fontSize:10, color:C.sec }}>{lbl}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Canvas ── */}
        <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }}>

          {/* Canvas toolbar */}
          <div style={{ display:'flex', alignItems:'center', gap:8, padding:'6px 12px', borderBottom:`1px solid ${C.border}`, flexShrink:0, background:C.card, flexWrap:'wrap' as const }}>
            <button onClick={computeSteps} disabled={isRunning}
              style={{ padding:'5px 14px', background:ai.color, color:'#000', border:'none', borderRadius:7, cursor:'pointer', fontSize:12, fontWeight:700, fontFamily:'inherit' }}>
              {ai.icon} Spustit {ai.name}
            </button>
            {frames.length > 0 && (<>
              <button onClick={()=>{ setIsPlaying(p=>!p) }} disabled={isDone && !isPlaying}
                style={{ padding:'5px 12px', background:isPlaying?'rgba(239,68,68,.15)':'rgba(34,197,94,.15)', color:isPlaying?'#f87171':'#4ade80', border:`1px solid ${isPlaying?'rgba(239,68,68,.3)':'rgba(34,197,94,.3)'}`, borderRadius:7, cursor:'pointer', fontSize:12, fontFamily:'inherit' }}>
                {isPlaying ? '⏸' : '▶'} {isPlaying ? 'Pauza' : 'Play'}
              </button>
              <button onClick={()=>setFrameIdx(i=>Math.min(i+Math.max(1,speed),frames.length-1))} disabled={isPlaying||frameIdx>=frames.length-1}
                style={{ padding:'5px 10px', background:'rgba(255,255,255,.07)', color:C.sec, border:`1px solid ${C.border}`, borderRadius:7, cursor:'pointer', fontSize:12, fontFamily:'inherit' }}>
                › Krok
              </button>
              <button onClick={()=>{ setFrameIdx(frames.length-1); setIsPlaying(false); setIsDone(true) }}
                style={{ padding:'5px 10px', background:'rgba(255,255,255,.07)', color:C.sec, border:`1px solid ${C.border}`, borderRadius:7, cursor:'pointer', fontSize:11, fontFamily:'inherit' }}>
                ⏭ Konec
              </button>
              {/* Progress */}
              <div style={{ flex:1, height:4, background:'rgba(255,255,255,.08)', borderRadius:2, overflow:'hidden', maxWidth:200 }}>
                <div style={{ height:'100%', width:`${frames.length>1?(frameIdx/(frames.length-1))*100:0}%`, background:ai.color, borderRadius:2 }}/>
              </div>
              <span style={{ fontSize:10, color:C.sec }}>{frameIdx}/{frames.length-1}</span>
            </>)}
            <button onClick={reset}
              style={{ padding:'5px 10px', background:'rgba(255,255,255,.06)', color:C.sec, border:`1px solid ${C.border}`, borderRadius:7, cursor:'pointer', fontSize:11, fontFamily:'inherit', marginLeft:'auto' }}>
              ↺ Reset
            </button>
          </div>

          {/* Stats bar */}
          {stats && (
            <div style={{ display:'flex', gap:16, padding:'5px 14px', background:'#0a0d14', borderBottom:`1px solid ${C.border}`, flexShrink:0, flexWrap:'wrap' as const }}>
              <Stat label="Kroky" value={stats.steps} color={ai.color}/>
              <Stat label="Otevřeno" value={stats.opened} color='#60a5fa'/>
              {currentFrame.pathFound && <>
                <Stat label="Délka cesty" value={currentFrame.pathCells.length} color={C.path}/>
                <Stat label="Cena cesty" value={stats.pathCost.toFixed(1)} color={C.path}/>
              </>}
              {currentFrame.current !== null && frames[frameIdx].cells[currentFrame.current] && (
                <>
                  <Stat label="g (od startu)" value={frames[frameIdx].cells[currentFrame.current].g.toFixed(1)} color='#a78bfa'/>
                  <Stat label="h (k cíli)" value={frames[frameIdx].cells[currentFrame.current].h.toFixed(1)} color='#fbbf24'/>
                  <Stat label="f = g+h" value={frames[frameIdx].cells[currentFrame.current].f.toFixed(1)} color={ai.color}/>
                </>
              )}
              {currentFrame.pathFound && (
                <span style={{ fontSize:11, fontWeight:700, color:C.green, marginLeft:'auto' }}>✓ Cesta nalezena!</span>
              )}
              {frames.length > 0 && frameIdx === frames.length-1 && !currentFrame.pathFound && (
                <span style={{ fontSize:11, fontWeight:700, color:C.red, marginLeft:'auto' }}>✗ Cesta neexistuje</span>
              )}
            </div>
          )}

          {/* Canvas */}
          <div ref={containerRef} style={{ flex:1, overflow:'hidden', cursor:'crosshair' }}>
            <canvas ref={canvasRef}
              width={canvasSize.w} height={canvasSize.h}
              style={{ width:'100%', height:'100%', display:'block' }}
              onMouseDown={onMouseDown}
              onMouseMove={onMouseMove}
              onMouseUp={onMouseUp}
              onMouseLeave={onMouseUp}
            />
          </div>
        </div>

        {/* ── Right info panel ── */}
        <div style={{ width:268, flexShrink:0, borderLeft:`1px solid ${C.border}`, display:'flex', flexDirection:'column', overflow:'hidden', background:C.card }}>
          <div style={{ flex:1, overflowY:'auto', padding:14 }}>
            <div key={algo} className="fi">

              {/* Algo header */}
              <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:12 }}>
                <div style={{ width:38, height:38, borderRadius:9, background:ai.color+'22', border:`1px solid ${ai.color}44`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:22 }}>{ai.icon}</div>
                <div>
                  <div style={{ fontSize:14, fontWeight:800, color:'#fff' }}>{ai.name}</div>
                  <div style={{ fontSize:10, color:ai.color, fontWeight:600 }}>{ai.complexity}</div>
                </div>
              </div>

              <p style={{ fontSize:11.5, color:'#cbd5e1', lineHeight:1.75, margin:'0 0 12px' }}>{ai.desc}</p>

              {/* Properties */}
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6, marginBottom:12 }}>
                <div style={{ padding:'7px 9px', background:ai.optimal?'rgba(34,197,94,.07)':'rgba(239,68,68,.07)', border:`1px solid ${ai.optimal?'rgba(34,197,94,.2)':'rgba(239,68,68,.2)'}`, borderRadius:7, textAlign:'center' as const }}>
                  <div style={{ fontSize:9, color:C.sec, marginBottom:2 }}>Optimální</div>
                  <div style={{ fontSize:13, color:ai.optimal?C.green:C.red }}>{ai.optimal?'✓':'✗'}</div>
                </div>
                <div style={{ padding:'7px 9px', background:ai.complete?'rgba(34,197,94,.07)':'rgba(239,68,68,.07)', border:`1px solid ${ai.complete?'rgba(34,197,94,.2)':'rgba(239,68,68,.2)'}`, borderRadius:7, textAlign:'center' as const }}>
                  <div style={{ fontSize:9, color:C.sec, marginBottom:2 }}>Kompletní</div>
                  <div style={{ fontSize:13, color:ai.complete?C.green:C.red }}>{ai.complete?'✓':'✗'}</div>
                </div>
              </div>

              {/* Heuristic info */}
              <div style={{ marginBottom:12, padding:'9px 10px', background:accentColor+'0d', border:`1px solid ${accentColor}25`, borderRadius:8 }}>
                <div style={{ fontSize:9, fontWeight:700, color:accentColor, textTransform:'uppercase', marginBottom:4 }}>Heuristika: {hi.name}</div>
                <div style={{ fontSize:10.5, color:'#94a3b8', lineHeight:1.6 }}>{hi.desc}</div>
              </div>

              {/* A* formula */}
              {algo === 'astar' && (
                <div style={{ background:'#0d1117', borderRadius:8, padding:'10px 12px', fontFamily:'monospace', fontSize:11, color:'#94a3b8', lineHeight:2, marginBottom:12 }}>
                  <div style={{ color:ai.color }}>f(n) = g(n) + h(n)</div>
                  <div>g(n) = <span style={{color:'#a78bfa'}}>cena od startu</span></div>
                  <div>h(n) = <span style={{color:'#fbbf24'}}>heuristika k cíli</span></div>
                  <div>f(n) = <span style={{color:ai.color}}>celkové skóre uzlu</span></div>
                </div>
              )}

              {/* Open/Closed explanation */}
              <div style={{ marginBottom:12 }}>
                <div style={{ fontSize:9, fontWeight:700, color:C.sec, textTransform:'uppercase', marginBottom:6 }}>Open vs Closed set</div>
                <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
                  <div style={{ display:'flex', gap:8, alignItems:'flex-start' }}>
                    <div style={{ width:12, height:12, borderRadius:2, background:C.open, flexShrink:0, marginTop:1 }}/>
                    <span style={{ fontSize:10.5, color:'#94a3b8', lineHeight:1.5 }}>Open = čekají na prozkoumání (kandidáti)</span>
                  </div>
                  <div style={{ display:'flex', gap:8, alignItems:'flex-start' }}>
                    <div style={{ width:12, height:12, borderRadius:2, background:C.closed, flexShrink:0, marginTop:1 }}/>
                    <span style={{ fontSize:10.5, color:'#94a3b8', lineHeight:1.5 }}>Closed = již prozkoumány (vyřazeny)</span>
                  </div>
                  <div style={{ display:'flex', gap:8, alignItems:'flex-start' }}>
                    <div style={{ width:12, height:12, borderRadius:2, background:C.path, flexShrink:0, marginTop:1 }}/>
                    <span style={{ fontSize:10.5, color:'#94a3b8', lineHeight:1.5 }}>Path = rekonstruovaná optimální cesta</span>
                  </div>
                </div>
              </div>

              {/* Tips */}
              <div style={{ padding:'8px 10px', background:'rgba(251,191,36,.05)', border:'1px solid rgba(251,191,36,.15)', borderRadius:8, marginBottom:12 }}>
                <p style={{ fontSize:11, color:'#fcd34d', margin:0, lineHeight:1.65 }}>
                  💡 Nakresli zdi myší a pak spusť algoritmus. Zkus porovnat A* vs DFS vs Dijkstra — uvidíš jak A* prozkoumá méně buněk díky heuristice!
                </p>
              </div>

              {/* Algorithm comparison */}
              <div style={{ borderTop:`1px solid ${C.border}`, paddingTop:12 }}>
                <div style={{ fontSize:9, fontWeight:700, color:C.sec, textTransform:'uppercase', marginBottom:8 }}>Porovnání algoritmů</div>
                <table style={{ width:'100%', borderCollapse:'collapse' as const, fontSize:10 }}>
                  <thead><tr style={{ borderBottom:`1px solid ${C.border}` }}>
                    <th style={{ padding:'3px 4px', color:C.sec, textAlign:'left' as const }}>Algo</th>
                    <th style={{ padding:'3px 4px', color:C.sec }}>Opt.</th>
                    <th style={{ padding:'3px 4px', color:C.sec }}>Heur.</th>
                  </tr></thead>
                  <tbody>
                    {ALGOS.map(a => {
                      const ai3 = ALGO_INFO[a]
                      return (
                        <tr key={a} onClick={()=>{ setAlgo(a); reset() }}
                          style={{ borderBottom:`1px solid ${C.border}`, background:algo===a?ai3.color+'12':'transparent', cursor:'pointer' }}>
                          <td style={{ padding:'4px 4px', color:algo===a?ai3.color:'#64748b', fontWeight:algo===a?700:400 }}>{ai3.icon} {ai3.name}</td>
                          <td style={{ padding:'4px 4px', textAlign:'center' as const, color:ai3.optimal?C.green:C.red }}>{ai3.optimal?'✓':'✗'}</td>
                          <td style={{ padding:'4px 4px', textAlign:'center' as const, color:C.sec }}>{a==='astar'||a==='greedy'?'✓':'✗'}</td>
                        </tr>
                      )
                    })}
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

function Stat({ label, value, color }: { label:string; value:string|number; color:string }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center' }}>
      <div style={{ fontSize:8, color:'#475569', textTransform:'uppercase' }}>{label}</div>
      <div style={{ fontSize:13, fontWeight:700, color, fontFamily:'monospace' }}>{value}</div>
    </div>
  )
}
