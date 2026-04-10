'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import AssignmentPanel from '@/components/AssignmentPanel'
import { DarkLayout, D } from '@/components/DarkLayout'

// ── Constants ──────────────────────────────────────────────────────────────────
const BUCKET       = 'vex-files'
const LS_LAST      = 'cb_vex_last'
const GRID_CELLS   = 6          // 6×6 grid
const CELL_MM      = 500        // 1 cell = 500 mm
const GRID_PX      = 420        // total canvas size in px
const CELL_PX      = GRID_PX / GRID_CELLS
const START_X      = 0.5        // start cell X (0-indexed, fractional = center of cell)
const START_Y      = GRID_CELLS - 0.5  // bottom center

function sanitize(s: string) {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9._-]/g,'_').replace(/_+/g,'_').replace(/^_|_$/g,'') || 'soubor'
}
function fp(uid: string, proj: string, name: string) {
  return `zaci/${uid}/${sanitize(proj)}/${sanitize(name)}`
}

interface VexFile { path: string; name: string; project: string; updatedAt: string }
interface Project  { name: string; files: VexFile[] }

// ── VEX Simulator ─────────────────────────────────────────────────────────────
interface SimStep {
  type: 'move' | 'turn' | 'print' | 'motor' | 'wait' | 'sensor_read'
  dx?: number     // delta in cells (for move)
  dy?: number
  angle?: number  // absolute heading after turn (degrees, 0=up)
  dAngle?: number // delta angle
  text?: string
  ms?: number
  label?: string
}

interface SimState {
  x: number          // position in cells (fractional)
  y: number
  heading: number    // degrees, 0=up(north), 90=right(east)
  trail: {x1:number;y1:number;x2:number;y2:number}[]
  log: string[]
  steps: SimStep[]
}

function parseVexCode(code: string): SimStep[] {
  const steps: SimStep[] = []
  const lines = code.split('\n')

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue

    // drivetrain.drive_for(FORWARD/REVERSE, dist, MM/INCHES, wait?)
    let m = line.match(/drivetrain\.drive_for\s*\(\s*(FORWARD|REVERSE|DirectionType\.FORWARD|DirectionType\.REVERSE)\s*,\s*([\d.]+)\s*,\s*(MM|INCHES|DistanceUnits\.MM|DistanceUnits\.INCHES)/i)
    if (m) {
      const dir = m[1].toUpperCase().includes('REVERSE') ? -1 : 1
      const rawDist = parseFloat(m[2])
      const dist = m[3].toUpperCase().includes('INCH') ? rawDist * 25.4 : rawDist
      const cells = (dist / CELL_MM) * dir
      steps.push({ type: 'move', dx: 0, dy: 0, label: `drive_for(${m[1].includes('.') ? m[1].split('.')[1] : m[1]}, ${rawDist} ${m[3].includes('.') ? m[3].split('.')[1] : m[3]})` })
      // dx/dy computed at playback based on heading
      steps[steps.length-1].dx = cells  // store cells, direction applied at runtime
      continue
    }

    // drivetrain.turn_for(RIGHT/LEFT, degrees, DEGREES)
    m = line.match(/drivetrain\.turn_for\s*\(\s*(RIGHT|LEFT|TurnType\.RIGHT|TurnType\.LEFT)\s*,\s*([\d.]+)/i)
    if (m) {
      const dir = m[1].toUpperCase().includes('LEFT') ? -1 : 1
      const deg = parseFloat(m[2]) * dir
      steps.push({ type: 'turn', dAngle: deg, label: `turn_for(${m[1].includes('.') ? m[1].split('.')[1] : m[1]}, ${m[2]}°)` })
      continue
    }

    // drivetrain.set_heading(value, DEGREES)
    m = line.match(/drivetrain\.set_heading\s*\(\s*([\d.]+)/i)
    if (m) {
      steps.push({ type: 'turn', angle: parseFloat(m[1]), label: `set_heading(${m[1]}°)` })
      continue
    }

    // motor_X.spin_for(direction, amount, unit)
    m = line.match(/(motor\w*)\.spin_for\s*\(\s*(FORWARD|REVERSE|DirectionType\.\w+)\s*,\s*([\d.]+)\s*,\s*(DEGREES|TURNS|RotationUnits\.\w+)/i)
    if (m) {
      steps.push({ type: 'motor', label: `${m[1]}.spin_for(${m[2].includes('.') ? m[2].split('.')[1] : m[2]}, ${m[3]} ${m[4].includes('.') ? m[4].split('.')[1] : m[4]})` })
      continue
    }

    // motor_X.set_velocity / motor_X.spin / motor_X.stop
    m = line.match(/(motor\w*)\.(spin|stop|set_velocity)\s*\(/)
    if (m) {
      steps.push({ type: 'motor', label: `${m[1]}.${m[2]}(…)` })
      continue
    }

    // brain.screen.print / print
    m = line.match(/(?:brain\.screen\.print|print)\s*\(\s*["']?([^"')]+)["']?\s*\)/)
    if (m) {
      steps.push({ type: 'print', text: m[1], label: `print("${m[1]}")` })
      continue
    }

    // wait(ms, MSEC) / wait(s, SECONDS)
    m = line.match(/wait\s*\(\s*([\d.]+)\s*,\s*(MSEC|SECONDS|TimeUnits\.\w+)/i)
    if (m) {
      const ms = m[2].toUpperCase().includes('SEC') && !m[2].toUpperCase().includes('MSEC')
        ? parseFloat(m[1]) * 1000
        : parseFloat(m[1])
      steps.push({ type: 'wait', ms, label: `wait(${m[1]} ${m[2].includes('.') ? m[2].split('.')[1] : m[2]})` })
      continue
    }

    // Sensor reads
    m = line.match(/(distance\w*|optical\w*|bumper\w*|touch_led\w*)\.(\w+)\s*\(/)
    if (m) {
      steps.push({ type: 'sensor_read', label: `${m[1]}.${m[2]}()` })
      continue
    }
  }
  return steps
}

function runSimulation(steps: SimStep[]): SimState {
  let x = START_X
  let y = START_Y
  let heading = 0  // 0 = up/north
  const trail: SimState['trail'] = []
  const log: string[] = []

  for (const step of steps) {
    if (step.type === 'move' && step.dx !== undefined) {
      const cells = step.dx  // already in cells with direction
      const rad = (heading - 90) * Math.PI / 180  // convert: 0=up means going -Y
      // heading 0 = north (y decreases), 90 = east (x increases)
      const hRad = heading * Math.PI / 180
      const nx = x + Math.sin(hRad) * cells
      const ny = y - Math.cos(hRad) * cells
      trail.push({ x1: x, y1: y, x2: nx, y2: ny })
      x = nx; y = ny
      log.push(`▶ ${step.label}  →  (${(x*CELL_MM).toFixed(0)}mm, ${((GRID_CELLS-y)*CELL_MM).toFixed(0)}mm)`)
    } else if (step.type === 'turn') {
      if (step.angle !== undefined) {
        heading = step.angle
      } else if (step.dAngle !== undefined) {
        heading = ((heading + step.dAngle) % 360 + 360) % 360
      }
      log.push(`↻ ${step.label}  →  ${heading.toFixed(0)}°`)
    } else if (step.type === 'print') {
      log.push(`🖥 Brain: ${step.text}`)
    } else if (step.type === 'motor') {
      log.push(`⚙ ${step.label}`)
    } else if (step.type === 'wait') {
      log.push(`⏱ ${step.label}`)
    } else if (step.type === 'sensor_read') {
      log.push(`📡 ${step.label}`)
    }
  }
  return { x, y, heading, trail, log, steps }
}

// ── Default code ───────────────────────────────────────────────────────────────
const DEFAULT_CODE = `# VEX IQ Python - Základní pohyb
from vex import *

brain = Brain()
drivetrain = Drivetrain(motor_1, motor_6, 200, 176, MM)

# Pohyb vpřed o 500 mm
drivetrain.drive_for(FORWARD, 500, MM)

# Otočení doprava o 90°
drivetrain.turn_for(RIGHT, 90, DEGREES)

# Pohyb vpřed o 1000 mm
drivetrain.drive_for(FORWARD, 1000, MM)

brain.screen.print("Hotovo!")
`

// ── Snippets ───────────────────────────────────────────────────────────────────
const SNIPPETS = [
  { label: 'Pohyb vpřed', code: 'drivetrain.drive_for(FORWARD, 500, MM)' },
  { label: 'Pohyb vzad', code: 'drivetrain.drive_for(REVERSE, 500, MM)' },
  { label: 'Otočit vpravo 90°', code: 'drivetrain.turn_for(RIGHT, 90, DEGREES)' },
  { label: 'Otočit vlevo 90°', code: 'drivetrain.turn_for(LEFT, 90, DEGREES)' },
  { label: 'Nastavit rychlost', code: 'drivetrain.set_drive_velocity(50, PERCENT)' },
  { label: 'Nastavit nadpis', code: 'drivetrain.set_heading(0, DEGREES)' },
  { label: 'Motor vpřed', code: 'motor_1.spin_for(FORWARD, 360, DEGREES)' },
  { label: 'Motor stop', code: 'motor_1.stop()' },
  { label: 'Čekat (ms)', code: 'wait(500, MSEC)' },
  { label: 'Čekat (s)', code: 'wait(1, SECONDS)' },
  { label: 'Brain print', code: 'brain.screen.print("text")' },
  { label: 'Brain clear', code: 'brain.screen.clear_screen()' },
  { label: 'Optical barva', code: 'optical_1.color()' },
  { label: 'Distance mm', code: 'distance_1.object_distance(MM)' },
  { label: 'Bumper stisk', code: 'bumper_1.pressed()' },
  { label: 'Touch LED svítit', code: 'touch_led_1.set_color(Color.RED)' },
  { label: 'if bumper', code: 'if bumper_1.pressed():\n    drivetrain.stop()' },
  { label: 'while True', code: 'while True:\n    pass' },
  { label: 'Kompletní setup', code: `from vex import *\n\nbrain = Brain()\nmotor_1 = Motor(Ports.PORT1, GearSetting.RATIO_18_1, False)\nmotor_6 = Motor(Ports.PORT6, GearSetting.RATIO_18_1, True)\ndrivetrain = Drivetrain(motor_1, motor_6, 200, 176, MM)\n\n# Váš kód zde` },
]

// ── VEX Brain screen renderer ──────────────────────────────────────────────────
function BrainScreen({ lines }: { lines: string[] }) {
  return (
    <div style={{ background: '#001a00', border: '2px solid #00aa00', borderRadius: 8, padding: '8px 10px', fontFamily: 'monospace', fontSize: 11, minHeight: 60, color: '#00ff00' }}>
      {lines.length === 0
        ? <span style={{ opacity: .3 }}>Brain Screen</span>
        : lines.slice(-4).map((l, i) => <div key={i}>{l}</div>)
      }
    </div>
  )
}

// ── Field renderer (SVG) ───────────────────────────────────────────────────────
function VexField({ simState, isRunning, accent }: { simState: SimState | null; isRunning: boolean; accent: string }) {
  const px = GRID_PX
  const cp = CELL_PX

  const robotX = simState ? simState.x * cp : START_X * cp
  const robotY = simState ? simState.y * cp : START_Y * cp
  const heading = simState?.heading ?? 0

  // Arrow shape (pointing up, rotated by heading)
  const arrowPath = `M 0 -12 L 7 8 L 0 4 L -7 8 Z`

  return (
    <svg width={px} height={px} style={{ background: '#1a2a1a', borderRadius: 10, border: `2px solid rgba(255,255,255,.15)`, display: 'block' }}>
      {/* Grid */}
      {Array.from({ length: GRID_CELLS + 1 }).map((_, i) => (
        <g key={i}>
          <line x1={i * cp} y1={0} x2={i * cp} y2={px} stroke="rgba(255,255,255,.12)" strokeWidth={1} />
          <line x1={0} y1={i * cp} x2={px} y2={i * cp} stroke="rgba(255,255,255,.12)" strokeWidth={1} />
        </g>
      ))}
      {/* Grid labels */}
      {Array.from({ length: GRID_CELLS }).map((_, i) => (
        <g key={i}>
          <text x={i * cp + cp/2} y={px - 4} textAnchor="middle" fontSize={9} fill="rgba(255,255,255,.3)">{i * CELL_MM}</text>
          <text x={4} y={(GRID_CELLS - 1 - i) * cp + cp/2 + 4} fontSize={9} fill="rgba(255,255,255,.3)">{i * CELL_MM}</text>
        </g>
      ))}
      {/* Start position marker */}
      <circle cx={START_X * cp} cy={START_Y * cp} r={6} fill="none" stroke="rgba(255,255,0,.4)" strokeWidth={1.5} strokeDasharray="3 2" />

      {/* Trail */}
      {simState?.trail.map((seg, i) => (
        <line key={i}
          x1={seg.x1 * cp} y1={seg.y1 * cp}
          x2={seg.x2 * cp} y2={seg.y2 * cp}
          stroke="#ef4444" strokeWidth={2.5} strokeLinecap="round"
          opacity={0.85}
        />
      ))}

      {/* Robot */}
      <g transform={`translate(${robotX}, ${robotY}) rotate(${heading})`}>
        {/* Body */}
        <rect x={-10} y={-10} width={20} height={20} rx={3} fill={accent} fillOpacity={0.9} />
        {/* Direction indicator */}
        <polygon points="0,-14 5,-6 -5,-6" fill="white" fillOpacity={0.9} />
        {/* Wheels hint */}
        <rect x={-13} y={-7} width={4} height={14} rx={2} fill="rgba(0,0,0,.5)" />
        <rect x={9} y={-7} width={4} height={14} rx={2} fill="rgba(0,0,0,.5)" />
      </g>

      {/* Running indicator */}
      {isRunning && (
        <circle cx={px - 12} cy={12} r={5} fill="#22c55e">
          <animate attributeName="opacity" values="1;0.3;1" dur="0.8s" repeatCount="indefinite" />
        </circle>
      )}
    </svg>
  )
}

// ── Main Component ─────────────────────────────────────────────────────────────
export default function VexEditor({ profile, assignmentId }: { profile: any; assignmentId?: string | null }) {
  const supabase = createClient()
  const accent   = profile?.accent_color ?? '#7C3AED'
  const uid      = profile?.id as string

  // ── Editor state ────────────────────────────────────────────────────────────
  const [code, setCode]             = useState(DEFAULT_CODE)
  const codeRef                     = useRef(DEFAULT_CODE)
  const containerRef                = useRef<HTMLDivElement>(null)
  const editorRef                   = useRef<any>(null)
  const [monacoReady, setMonacoReady] = useState(false)

  // ── File state ──────────────────────────────────────────────────────────────
  const [projects, setProjects]     = useState<Project[]>([])
  const [activeFile, setActiveFile] = useState<VexFile | null>(null)
  const [activeProject, setActiveProject] = useState<string>('')
  const [isDirty, setIsDirty]       = useState(false)
  const [saving, setSaving]         = useState(false)
  const [saveMsg, setSaveMsg]       = useState('')
  const [loadingProj, setLoadingProj] = useState(true)
  const [expanded, setExpanded]     = useState<Set<string>>(new Set())

  // ── Simulator state ─────────────────────────────────────────────────────────
  const [simState, setSimState]     = useState<SimState | null>(null)
  const [simRunning, setSimRunning] = useState(false)
  const [simStep, setSimStep]       = useState(-1)
  const [rightTab, setRightTab]     = useState<'sim'|'snippets'|'sensors'>('sim')
  const simTimeoutRef               = useRef<ReturnType<typeof setTimeout> | null>(null)
  const brainLines                  = simState?.log.filter(l => l.startsWith('🖥')).map(l => l.replace('🖥 Brain: ', '')) ?? []

  // ── Web Serial state ────────────────────────────────────────────────────────
  const hasSerial = typeof navigator !== 'undefined' && 'serial' in navigator
  const [serialConnected, setSerialConnected] = useState(false)
  const [serialStatus, setSerialStatus]       = useState('')
  const [flashing, setFlashing]               = useState(false)
  const [flashMsg, setFlashMsg]               = useState('')
  const serialPortRef = useRef<any>(null)

  // ── Modals ──────────────────────────────────────────────────────────────────
  const [newProjModal, setNewProjModal] = useState(false)
  const [newProjName, setNewProjName]   = useState('')
  const [newFileModal, setNewFileModal] = useState(false)
  const [newFileName, setNewFileName]   = useState('')
  const [newFileProj, setNewFileProj]   = useState('')

  // ── Sensor simulator state ──────────────────────────────────────────────────
  const [sensorDistance, setSensorDistance] = useState(300)
  const [sensorOptical, setSensorOptical]   = useState<'RED'|'GREEN'|'BLUE'|'YELLOW'|'NONE'>('NONE')
  const [sensorBumper, setSensorBumper]     = useState(false)
  const [touchLedColor, setTouchLedColor]   = useState<string>('#888888')

  // ── Monaco ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (typeof window === 'undefined') return
    const s = document.createElement('script')
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs/loader.min.js'
    s.onload = () => {
      const w = window as any
      w.require.config({ paths: { vs: 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs' } })
      w.require(['vs/editor/editor.main'], (monaco: any) => {
        if (!containerRef.current || editorRef.current) return
        monaco.editor.defineTheme('cb-dark', {
          base: 'vs-dark', inherit: true,
          rules: [
            { token: 'keyword',  foreground: 'c792ea' },
            { token: 'string',   foreground: 'c3e88d' },
            { token: 'comment',  foreground: '546e7a', fontStyle: 'italic' },
            { token: 'number',   foreground: 'f78c6c' },
          ],
          colors: {
            'editor.background': '#0d1117',
            'editor.foreground': '#e6edf3',
            'editorLineNumber.foreground': '#30363d',
            'editor.lineHighlightBackground': '#161b22',
          },
        })
        const ed = monaco.editor.create(containerRef.current, {
          value: DEFAULT_CODE,
          language: 'python',
          theme: 'cb-dark',
          fontSize: 13,
          fontFamily: "'JetBrains Mono','Fira Code',monospace",
          minimap: { enabled: false },
          lineNumbers: 'on' as const,
          wordWrap: 'on' as const,
          automaticLayout: true,
          scrollBeyondLastLine: false,
          padding: { top: 14, bottom: 14 },
          bracketPairColorization: { enabled: true },
        })
        editorRef.current = ed
        ed.onDidChangeModelContent(() => {
          codeRef.current = ed.getValue()
          setCode(ed.getValue())
          setIsDirty(true)
        })
        ed.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => document.getElementById('vex-save-btn')?.click())
        setMonacoReady(true)
      })
    }
    document.head.appendChild(s)
    return () => { editorRef.current?.dispose() }
  }, [])

  // ── Storage ──────────────────────────────────────────────────────────────────
  async function push(path: string, content: string) {
    const blob = new Blob([content], { type: 'text/plain' })
    await supabase.storage.from(BUCKET).remove([path])
    await supabase.storage.from(BUCKET).upload(path, blob, { contentType: 'text/plain', cacheControl: '0' })
  }
  async function fetchContent(path: string): Promise<string> {
    const { data } = await supabase.storage.from(BUCKET).download(path + '?t=' + Date.now())
    return data ? await data.text() : ''
  }

  // ── Refresh projects ─────────────────────────────────────────────────────────
  const refreshProjects = useCallback(async (): Promise<Project[]> => {
    setLoadingProj(true)
    try {
      const { data } = await supabase.storage.from(BUCKET).list(`zaci/${uid}`, { limit: 100 })
      const projs: Project[] = []
      for (const item of data ?? []) {
        if (item.id === null) {
          const { data: files } = await supabase.storage.from(BUCKET).list(`zaci/${uid}/${item.name}`, { limit: 100 })
          const pyFiles = (files ?? []).filter(f => f.name.endsWith('.py') && f.id !== null)
          projs.push({
            name: item.name,
            files: pyFiles.map(f => ({
              path: `zaci/${uid}/${item.name}/${f.name}`,
              name: f.name,
              project: item.name,
              updatedAt: f.updated_at ?? '',
            }))
          })
        }
      }
      setProjects(projs)
      return projs
    } finally { setLoadingProj(false) }
  }, [uid])

  useEffect(() => {
    (async () => {
      const projs = await refreshProjects()
      const last = localStorage.getItem(LS_LAST)
      if (last) {
        for (const p of projs) {
          const f = p.files.find(x => x.path === last)
          if (f) { await openFile(f); return }
        }
      }
    })()
  }, [])

  async function openFile(f: VexFile) {
    const content = await fetchContent(f.path)
    setActiveFile(f)
    setActiveProject(f.project)
    editorRef.current?.setValue(content)
    codeRef.current = content
    setCode(content)
    setIsDirty(false)
    setExpanded(prev => new Set([...prev, f.project]))
    localStorage.setItem(LS_LAST, f.path)
    setSimState(null)
  }

  async function save() {
    if (!activeFile) return
    setSaving(true)
    await push(activeFile.path, codeRef.current || code)
    setIsDirty(false)
    setSaveMsg('✓ Uloženo'); setTimeout(() => setSaveMsg(''), 2000)
    setSaving(false)
  }

  async function doCreateProject() {
    if (!newProjName.trim()) return
    const projKey = sanitize(newProjName.trim())
    const fileName = 'main.py'
    const path = fp(uid, projKey, fileName)
    await push(path, DEFAULT_CODE)
    const projs = await refreshProjects()
    const p = projs.find(x => x.name === projKey)
    if (p?.files[0]) await openFile(p.files[0])
    setNewProjModal(false); setNewProjName('')
  }

  async function doCreateFile() {
    if (!newFileName.trim()) return
    const proj = newFileProj || activeProject
    if (!proj) return
    let name = newFileName.trim()
    if (!name.endsWith('.py')) name += '.py'
    const path = fp(uid, proj, name)
    await push(path, '# VEX IQ Python\nfrom vex import *\n\nbrain = Brain()\n')
    const projs = await refreshProjects()
    const p = projs.find(x => x.name === proj)
    const f = p?.files.find(x => x.path === path)
    if (f) await openFile(f)
    setNewFileModal(false); setNewFileName('')
  }

  // ── Simulator ────────────────────────────────────────────────────────────────
  function runSim() {
    const currentCode = codeRef.current || code
    const steps = parseVexCode(currentCode)
    const result = runSimulation(steps)
    setSimState(result)
    setSimStep(-1)
    setRightTab('sim')
    animateSim(steps)
  }

  function animateSim(steps: SimStep[]) {
    setSimRunning(true)
    setSimState({ x: START_X, y: START_Y, heading: 0, trail: [], log: [], steps })
    let idx = 0
    let x = START_X, y = START_Y, heading = 0
    const trail: SimState['trail'] = []
    const log: string[] = []

    function runStep() {
      if (idx >= steps.length) {
        setSimRunning(false)
        setSimStep(-1)
        return
      }
      const step = steps[idx]
      setSimStep(idx)

      if (step.type === 'move' && step.dx !== undefined) {
        const cells = step.dx
        const hRad = heading * Math.PI / 180
        const nx = x + Math.sin(hRad) * cells
        const ny = y - Math.cos(hRad) * cells
        trail.push({ x1: x, y1: y, x2: nx, y2: ny })
        log.push(`▶ ${step.label}  →  (${(nx*CELL_MM).toFixed(0)}mm, ${((GRID_CELLS-ny)*CELL_MM).toFixed(0)}mm)`)
        x = nx; y = ny
        const stepMs = Math.min(1200, Math.abs(cells) * 600)
        setSimState({ x, y, heading, trail: [...trail], log: [...log], steps })
        idx++
        simTimeoutRef.current = setTimeout(runStep, stepMs)
      } else if (step.type === 'turn') {
        if (step.angle !== undefined) heading = step.angle
        else if (step.dAngle !== undefined) heading = ((heading + step.dAngle) % 360 + 360) % 360
        log.push(`↻ ${step.label}  →  ${heading.toFixed(0)}°`)
        setSimState({ x, y, heading, trail: [...trail], log: [...log], steps })
        idx++
        simTimeoutRef.current = setTimeout(runStep, 400)
      } else {
        if (step.type === 'print') log.push(`🖥 Brain: ${step.text}`)
        else if (step.type === 'motor') log.push(`⚙ ${step.label}`)
        else if (step.type === 'wait') log.push(`⏱ ${step.label}`)
        else if (step.type === 'sensor_read') log.push(`📡 ${step.label}`)
        setSimState({ x, y, heading, trail: [...trail], log: [...log], steps })
        idx++
        simTimeoutRef.current = setTimeout(runStep, step.type === 'wait' ? Math.min(step.ms ?? 200, 600) : 150)
      }
    }
    runStep()
  }

  function stopSim() {
    if (simTimeoutRef.current) clearTimeout(simTimeoutRef.current)
    setSimRunning(false)
  }

  function resetSim() {
    stopSim()
    setSimState(null)
    setSimStep(-1)
  }

  // ── Web Serial ───────────────────────────────────────────────────────────────
  async function connectSerial() {
    if (!hasSerial) return
    try {
      setSerialStatus('Vybírám port…')
      // VEX IQ Brain USB vendor ID: 0x2888
      const port = await (navigator as any).serial.requestPort({ filters: [{ usbVendorId: 0x2888 }] })
      await port.open({ baudRate: 115200 })
      serialPortRef.current = port
      setSerialConnected(true)
      setSerialStatus('VEX Brain připojen ✓')
    } catch (e: any) {
      if (e.name !== 'NotFoundError') setSerialStatus('Chyba: ' + e.message)
      else setSerialStatus('')
    }
  }

  async function disconnectSerial() {
    try {
      await serialPortRef.current?.close()
    } catch {}
    serialPortRef.current = null
    setSerialConnected(false)
    setSerialStatus('Odpojeno')
  }

  async function uploadToVex() {
    if (!serialPortRef.current) { setFlashMsg('Nejprve připoj VEX Brain přes USB'); return }
    setFlashing(true)
    setFlashMsg('Odesílám kód do VEX Brain…')
    try {
      const port = serialPortRef.current
      const enc  = new TextEncoder()
      const dec  = new TextDecoder()
      const src  = codeRef.current || code
      const delay = (ms: number) => new Promise(r => setTimeout(r, ms))

      async function readFor(ms: number): Promise<string> {
        if (!port.readable) return ''
        const reader = port.readable.getReader()
        let result = ''
        const deadline = Date.now() + ms
        try {
          while (Date.now() < deadline) {
            const timeout = new Promise<{done:true;value:undefined}>(r =>
              setTimeout(() => r({ done: true, value: undefined }), Math.min(50, deadline - Date.now()))
            )
            const { done, value } = await Promise.race([reader.read(), timeout])
            if (done || !value) break
            result += dec.decode(value)
          }
        } catch {}
        reader.releaseLock()
        return result
      }

      async function write(s: string) {
        const writer = port.writable.getWriter()
        await writer.write(enc.encode(s))
        writer.releaseLock()
      }

      // VEX IQ uses MicroPython REPL similar to micro:bit
      setFlashMsg('Přerušuji program…')
      await write('\r\x03\x03')
      await readFor(600)

      setFlashMsg('Vstupuji do raw REPL…')
      await write('\x01')
      const rawResp = await readFor(800)
      if (!rawResp.includes('raw REPL')) {
        await write('\x04')
        await readFor(1500)
        await write('\x01')
        await readFor(600)
      }

      setFlashMsg('Odesílám kód…')
      const CHUNK = 64
      for (let i = 0; i < src.length; i += CHUNK) {
        await write(src.slice(i, i + CHUNK))
        await delay(30)
      }

      setFlashMsg('Spouštím na VEX Brain…')
      await write('\x04')
      const execResp = await readFor(2000)

      if (execResp.includes('Error') || execResp.includes('Traceback')) {
        const errLine = execResp.split('\n').find(l => l.includes('Error') || l.includes('Traceback')) ?? 'Chyba v kódu'
        setFlashMsg('❌ ' + errLine.trim())
      } else {
        setFlashMsg('✓ Kód běží na VEX Brain!')
      }
    } catch (e: any) {
      setFlashMsg('❌ ' + e.message)
    }
    setFlashing(false)
    setTimeout(() => setFlashMsg(''), 6000)
  }

  // ── Styles ───────────────────────────────────────────────────────────────────
  const sideBtn: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px',
    background: 'rgba(255,255,255,.04)', border: `1px solid ${D.border}`,
    borderRadius: 7, color: D.txtSec, fontSize: 11, cursor: 'pointer',
    fontFamily: 'inherit', width: '100%', textAlign: 'left' as const, transition: 'all .15s',
  }

  function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
    return (
      <>
        <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.72)', zIndex: 9998, backdropFilter: 'blur(5px)' }} />
        <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', zIndex: 9999, width: '100%', maxWidth: 400, padding: '0 16px' }}>
          <div style={{ background: D.bgCard, borderRadius: 12, padding: '24px', border: `1px solid ${D.border}`, boxShadow: '0 28px 70px rgba(0,0,0,.75)' }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: D.txtPri, marginBottom: 14 }}>{title}</div>
            {children}
          </div>
        </div>
      </>
    )
  }

  const inp: React.CSSProperties = { width: '100%', padding: '9px 12px', background: D.bgMid, border: `1px solid ${D.border}`, borderRadius: 8, fontSize: 13, color: D.txtPri, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' as const, marginBottom: 12 }
  const modalBtns = (onOk: () => void, label: string, disabled = false) => (
    <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
      <button onClick={onOk} disabled={disabled} style={{ flex: 1, padding: '9px', background: disabled ? D.bgMid : accent, color: disabled ? D.txtSec : '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>{label}</button>
      <button onClick={() => { setNewProjModal(false); setNewFileModal(false) }} style={{ padding: '9px 14px', background: D.bgMid, color: D.txtSec, border: `1px solid ${D.border}`, borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit' }}>Zrušit</button>
    </div>
  )

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <DarkLayout profile={profile} activeRoute="/student/vex" fullContent>

      {newProjModal && (
        <Modal title="🤖 Nový VEX projekt" onClose={() => setNewProjModal(false)}>
          <input value={newProjName} onChange={e => setNewProjName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && newProjName.trim() && doCreateProject()}
            autoFocus placeholder="Název projektu" style={inp} />
          {modalBtns(doCreateProject, 'Vytvořit', !newProjName.trim())}
        </Modal>
      )}
      {newFileModal && (
        <Modal title="📄 Nový soubor" onClose={() => setNewFileModal(false)}>
          <input value={newFileName} onChange={e => setNewFileName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && newFileName.trim() && doCreateFile()}
            autoFocus placeholder="nazev.py" style={inp} />
          {projects.length > 1 && (
            <select value={newFileProj || activeProject} onChange={e => setNewFileProj(e.target.value)}
              style={{ ...inp, marginBottom: 12 }}>
              {projects.map(p => <option key={p.name} value={p.name}>{p.name}</option>)}
            </select>
          )}
          {modalBtns(doCreateFile, 'Vytvořit', !newFileName.trim())}
        </Modal>
      )}

      <style>{`
        .vex-sb:hover { background: rgba(255,255,255,.08) !important; color: #fff !important; }
        .vex-row { transition: background .12s; }
        .vex-row:hover { background: rgba(255,255,255,.05) !important; }
        .vex-row:hover .vex-acts { opacity: 1 !important; }
        @keyframes spin { to { transform: rotate(360deg) } }
        @keyframes pulse { 0%,100% { opacity:1 } 50% { opacity:.4 } }
      `}</style>


      {assignmentId&&<AssignmentPanel assignmentId={assignmentId} studentId={uid??profile?.id} accent={accent}/>}
      <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>

        {/* ══ LEFT: Sidebar ══ */}
        <div style={{ width: 210, flexShrink: 0, borderRight: `1px solid ${D.border}`, background: D.bgCard, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

          {/* Header */}
          <div style={{ padding: '12px 12px 10px', borderBottom: `1px solid ${D.border}`, flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <div style={{ width: 28, height: 28, borderRadius: 7, background: '#cc0000', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <span style={{ fontSize: 14 }}>🤖</span>
              </div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: D.txtPri, lineHeight: 1.2 }}>VEX IQ</div>
                <div style={{ fontSize: 9, color: D.txtSec, lineHeight: 1.2 }}>by Jakub Krejčí</div>
              </div>
              {isDirty && <span style={{ fontSize: 9, color: D.warning, marginLeft: 'auto' }}>● neuloženo</span>}
            </div>

            {/* File actions */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <button className="vex-sb" style={sideBtn} onClick={() => setNewProjModal(true)}><span>📁</span> Nový projekt</button>
              <button className="vex-sb" style={sideBtn} onClick={() => setNewFileModal(true)}><span>📄</span> Nový soubor</button>
              <div style={{ height: 1, background: D.border, margin: '2px 0' }} />
              <button id="vex-save-btn" className="vex-sb" style={{ ...sideBtn, opacity: !activeFile || saving ? .4 : 1 }} disabled={!activeFile || saving} onClick={save}>
                <span>💾</span> {saving ? 'Ukládám…' : 'Uložit'}
              </button>
            </div>

            {/* Connection status */}
            <div style={{ marginTop: 10, padding: '8px 10px', background: D.bgMid, borderRadius: 8, border: `1px solid ${D.border}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: serialConnected ? '#22c55e' : '#666', boxShadow: serialConnected ? '0 0 6px #22c55e' : 'none', flexShrink: 0 }} />
                <span style={{ fontSize: 11, fontWeight: 600, color: D.txtPri }}>{serialConnected ? 'Brain připojen' : 'Brain odpojen'}</span>
              </div>
              {serialStatus && <div style={{ fontSize: 10, color: D.txtSec, marginBottom: 6 }}>{serialStatus}</div>}
              <div style={{ display: 'flex', gap: 5 }}>
                {!serialConnected ? (
                  <button onClick={connectSerial} disabled={!hasSerial}
                    style={{ flex: 1, padding: '5px 8px', background: hasSerial ? '#22c55e20' : D.bgMid, color: hasSerial ? '#22c55e' : D.txtSec, border: `1px solid ${hasSerial ? '#22c55e40' : D.border}`, borderRadius: 6, fontSize: 10, fontWeight: 600, cursor: hasSerial ? 'pointer' : 'not-allowed', fontFamily: 'inherit' }}>
                    🔌 Připojit USB
                  </button>
                ) : (
                  <>
                    <button onClick={uploadToVex} disabled={flashing}
                      style={{ flex: 1, padding: '5px 8px', background: accent+'20', color: accent, border: `1px solid ${accent}40`, borderRadius: 6, fontSize: 10, fontWeight: 600, cursor: flashing ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
                      {flashing ? '⏳…' : '⬆ Nahrát'}
                    </button>
                    <button onClick={disconnectSerial}
                      style={{ padding: '5px 8px', background: 'none', border: `1px solid ${D.border}`, borderRadius: 6, fontSize: 10, cursor: 'pointer', color: D.txtSec, fontFamily: 'inherit' }}>
                      ✕
                    </button>
                  </>
                )}
              </div>
              {!hasSerial && <div style={{ fontSize: 9, color: D.warning, marginTop: 5 }}>Web Serial není dostupný (potřeba Chrome/Edge)</div>}
              {flashMsg && <div style={{ fontSize: 10, marginTop: 5, color: flashMsg.startsWith('❌') ? D.danger : D.success, fontWeight: 600 }}>{flashMsg}</div>}
            </div>
          </div>

          {/* Projects tree */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '6px 0' }}>
            <div style={{ padding: '5px 12px 3px', fontSize: 10, fontWeight: 700, color: D.txtSec, textTransform: 'uppercase', letterSpacing: '.06em' }}>Moje projekty</div>
            {loadingProj
              ? <div style={{ fontSize: 11, color: D.txtSec, padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ width: 11, height: 11, border: `2px solid ${D.border}`, borderTopColor: accent, borderRadius: '50%', animation: 'spin .6s linear infinite' }} />Načítám…
                </div>
              : projects.length === 0
                ? <div style={{ fontSize: 11, color: D.txtSec, padding: '4px 12px' }}>Žádné projekty</div>
                : projects.map(proj => (
                    <div key={proj.name} style={{ marginBottom: 2 }}>
                      <div className="vex-row"
                        onClick={() => setExpanded(prev => { const n = new Set(prev); n.has(proj.name) ? n.delete(proj.name) : n.add(proj.name); return n })}
                        style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 12px', cursor: 'pointer', background: proj.name === activeProject ? accent+'10' : 'transparent' }}>
                        <span style={{ fontSize: 9, color: D.txtSec, display: 'inline-block', transform: expanded.has(proj.name) ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }}>▶</span>
                        <span style={{ fontSize: 12 }}>📁</span>
                        <span style={{ fontSize: 11, fontWeight: 600, color: proj.name === activeProject ? accent : D.txtPri, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{proj.name}</span>
                      </div>
                      {expanded.has(proj.name) && proj.files.map(f => (
                        <div key={f.path} className="vex-row"
                          onClick={() => openFile(f)}
                          style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 12px 3px 26px', cursor: 'pointer', background: f.path === activeFile?.path ? accent+'18' : 'transparent', borderLeft: f.path === activeFile?.path ? `2px solid ${accent}` : '2px solid transparent' }}>
                          <span style={{ fontSize: 11 }}>🐍</span>
                          <span style={{ fontSize: 11, color: f.path === activeFile?.path ? accent : D.txtSec, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                        </div>
                      ))}
                    </div>
                  ))
            }
          </div>

          {saveMsg && <div style={{ padding: '6px 12px', borderTop: `1px solid ${D.border}`, fontSize: 11, color: D.success, flexShrink: 0 }}>{saveMsg}</div>}
        </div>

        {/* ══ CENTER: Editor ══ */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          {/* Toolbar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', borderBottom: `1px solid ${D.border}`, flexShrink: 0 }}>
            <span style={{ fontSize: 11, color: D.txtSec }}>
              {activeFile ? <><span style={{ color: D.txtSec }}>{activeFile.project} / </span><span style={{ color: D.txtPri, fontWeight: 600 }}>{activeFile.name}</span>{isDirty && <span style={{ color: D.warning }}> ●</span>}</> : <span style={{ opacity: .4 }}>Bez souboru</span>}
            </span>
            <div style={{ flex: 1 }} />
            <button onClick={resetSim}
              style={{ padding: '5px 10px', background: 'rgba(255,255,255,.04)', color: D.txtSec, border: `1px solid ${D.border}`, borderRadius: 7, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>
              ↺ Reset
            </button>
            {simRunning
              ? <button onClick={stopSim}
                  style={{ padding: '5px 12px', background: D.danger+'20', color: D.danger, border: `1px solid ${D.danger}40`, borderRadius: 7, fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                  ⏹ Stop
                </button>
              : <button onClick={runSim}
                  style={{ padding: '5px 14px', background: '#22c55e', color: '#fff', border: 'none', borderRadius: 7, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                  ▶ Simulovat
                </button>
            }
          </div>

          {/* Monaco editor */}
          <div ref={containerRef} style={{ flex: 1, background: '#0d1117', overflow: 'hidden', minHeight: 0 }} />
        </div>

        {/* ══ RIGHT: Simulator + Tools ══ */}
        <div style={{ width: 480, flexShrink: 0, borderLeft: `1px solid ${D.border}`, background: D.bgCard, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

          {/* Tab bar */}
          <div style={{ display: 'flex', borderBottom: `1px solid ${D.border}`, flexShrink: 0 }}>
            {([['sim','🤖','Simulátor'],['snippets','🧩','Snippety'],['sensors','📡','Senzory']] as const).map(([tab, icon, label]) => (
              <button key={tab} onClick={() => setRightTab(tab)}
                style={{ flex: 1, padding: '8px 4px', background: rightTab === tab ? D.bgMid : 'transparent', border: 'none', borderBottom: `2px solid ${rightTab === tab ? accent : 'transparent'}`, cursor: 'pointer', fontFamily: 'inherit', fontSize: 10, fontWeight: 600, color: rightTab === tab ? D.txtPri : D.txtSec, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                <span style={{ fontSize: 14 }}>{icon}</span>{label}
              </button>
            ))}
          </div>

          <div style={{ flex: 1, overflowY: 'auto' }}>

            {/* ── Simulátor ── */}
            {rightTab === 'sim' && (
              <div style={{ padding: '12px' }}>
                {/* Field */}
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
                  <VexField simState={simState} isRunning={simRunning} accent={accent} />
                </div>

                {/* Legend */}
                <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginBottom: 12, fontSize: 10, color: D.txtSec }}>
                  <span>🟡 Start</span>
                  <span style={{ color: '#ef4444' }}>— Trasa robota</span>
                  <span>1 čtverec = {CELL_MM}mm</span>
                </div>

                {/* Brain screen */}
                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: D.txtSec, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 5 }}>Brain Screen</div>
                  <BrainScreen lines={brainLines} />
                </div>

                {/* Step log */}
                {simState && simState.log.length > 0 && (
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: D.txtSec, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 5 }}>Průběh programu</div>
                    <div style={{ background: D.bgMid, borderRadius: 8, padding: '8px', maxHeight: 160, overflowY: 'auto', border: `1px solid ${D.border}` }}>
                      {simState.log.map((line, i) => (
                        <div key={i} style={{ fontSize: 10, fontFamily: 'monospace', color: i === simStep ? accent : D.txtSec, padding: '1px 0', background: i === simStep ? accent+'10' : 'transparent', borderRadius: 3 }}>
                          {line}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {!simState && (
                  <div style={{ textAlign: 'center' as const, color: D.txtSec, fontSize: 11, marginTop: 8 }}>
                    Klikni ▶ Simulovat pro spuštění
                  </div>
                )}
              </div>
            )}

            {/* ── Snippety ── */}
            {rightTab === 'snippets' && (
              <div style={{ padding: '6px 0' }}>
                {SNIPPETS.map(s => (
                  <div key={s.label} className="vex-row"
                    onClick={() => {
                      const ed = editorRef.current
                      if (!ed) return
                      const pos = ed.getPosition()
                      ed.executeEdits('snippet', [{ range: { startLineNumber: pos.lineNumber, startColumn: pos.column, endLineNumber: pos.lineNumber, endColumn: pos.column }, text: '\n' + s.code + '\n' }])
                      ed.focus()
                    }}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 12px', cursor: 'pointer', borderBottom: `1px solid ${D.border}10` }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: D.txtPri }}>{s.label}</div>
                      <code style={{ fontSize: 10, color: '#60A5FA', fontFamily: 'monospace' }}>{s.code.split('\n')[0].slice(0, 50)}</code>
                    </div>
                    <span style={{ fontSize: 10, color: D.txtSec, flexShrink: 0 }}>↵</span>
                  </div>
                ))}
              </div>
            )}

            {/* ── Senzory ── */}
            {rightTab === 'sensors' && (
              <div style={{ padding: '12px' }}>
                <div style={{ fontSize: 11, color: D.txtSec, marginBottom: 12, lineHeight: 1.6 }}>
                  Nastav hodnoty senzorů pro simulaci. Tyto hodnoty se použijí při parsování podmínek v kódu.
                </div>

                {/* Distance sensor */}
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: D.txtSec, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>📏 Distance sensor</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <input type="range" min={0} max={2000} value={sensorDistance} onChange={e => setSensorDistance(Number(e.target.value))} style={{ flex: 1, accentColor: accent }} />
                    <span style={{ fontSize: 12, fontWeight: 700, color: D.txtPri, minWidth: 55, fontFamily: 'monospace' }}>{sensorDistance} mm</span>
                  </div>
                  <div style={{ fontSize: 10, color: D.txtSec, marginTop: 3 }}>
                    {sensorDistance < 100 ? '⚠ Překážka blízko!' : sensorDistance < 500 ? 'Překážka v dosahu' : 'Volná cesta'}
                  </div>
                </div>

                {/* Optical sensor */}
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: D.txtSec, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>🔵 Optical sensor (barva)</div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' as const }}>
                    {(['NONE','RED','GREEN','BLUE','YELLOW'] as const).map(c => (
                      <button key={c} onClick={() => setSensorOptical(c)}
                        style={{ padding: '4px 10px', borderRadius: 6, border: `2px solid ${sensorOptical === c ? accent : D.border}`, background: c === 'NONE' ? D.bgMid : c === 'RED' ? '#ef444420' : c === 'GREEN' ? '#22c55e20' : c === 'BLUE' ? '#3b82f620' : '#eab30820', color: c === 'NONE' ? D.txtSec : c === 'RED' ? '#ef4444' : c === 'GREEN' ? '#22c55e' : c === 'BLUE' ? '#3b82f6' : '#eab308', cursor: 'pointer', fontSize: 11, fontWeight: 600, fontFamily: 'inherit' }}>
                        {c}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Bumper */}
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: D.txtSec, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>🔘 Bumper sensor</div>
                  <button onClick={() => setSensorBumper(p => !p)}
                    style={{ padding: '8px 20px', background: sensorBumper ? D.danger+'20' : D.bgMid, color: sensorBumper ? D.danger : D.txtSec, border: `2px solid ${sensorBumper ? D.danger+'50' : D.border}`, borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 600, userSelect: 'none' as const }}>
                    {sensorBumper ? '🔴 Stisknutý' : '⬜ Uvolněný'}
                  </button>
                </div>

                {/* Touch LED */}
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: D.txtSec, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>💡 Touch LED</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 32, height: 32, borderRadius: '50%', background: touchLedColor, border: '3px solid rgba(255,255,255,.2)', boxShadow: `0 0 12px ${touchLedColor}80` }} />
                    <input type="color" value={touchLedColor} onChange={e => setTouchLedColor(e.target.value)}
                      style={{ width: 40, height: 32, border: 'none', borderRadius: 6, cursor: 'pointer' }} />
                    <span style={{ fontSize: 11, color: D.txtSec }}>Barva LED</span>
                  </div>
                </div>

                {/* Sensor values summary */}
                <div style={{ background: D.bgMid, borderRadius: 8, padding: '10px', border: `1px solid ${D.border}`, fontSize: 10, fontFamily: 'monospace', color: D.txtSec }}>
                  <div style={{ fontWeight: 700, color: D.txtPri, marginBottom: 6 }}>Aktuální hodnoty senzorů:</div>
                  <div>distance_1.object_distance(MM) → <span style={{ color: '#60A5FA' }}>{sensorDistance}</span></div>
                  <div>optical_1.color() → <span style={{ color: '#60A5FA' }}>{sensorOptical}</span></div>
                  <div>bumper_1.pressed() → <span style={{ color: '#60A5FA' }}>{sensorBumper ? 'True' : 'False'}</span></div>
                </div>
              </div>
            )}

          </div>
        </div>

      </div>
    </DarkLayout>
  )
}
