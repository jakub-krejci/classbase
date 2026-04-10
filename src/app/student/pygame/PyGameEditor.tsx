'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { DarkLayout, D } from '@/components/DarkLayout'

// ── Constants ─────────────────────────────────────────────────────────────────
const BUCKET    = 'pygame-files'
const LS_LAST   = 'cb_pygame_last'

function sanitize(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[^a-zA-Z0-9._\-]/g,'_').replace(/_+/g,'_').replace(/^_|_$/g,'') || 'soubor'
}
function fp(uid: string, proj: string, name: string) {
  return `zaci/${uid}/${sanitize(proj)}/${sanitize(name)}`
}

interface PyFile    { path: string; name: string; project: string }
interface Project   { name: string; files: PyFile[] }

// ── Default starter code ──────────────────────────────────────────────────────
const DEFAULT_PYGAME = `import pygame
import sys

# Inicializace
pygame.init()

# Nastavení okna
WIDTH, HEIGHT = 800, 500
screen = pygame.display.set_mode((WIDTH, HEIGHT))
pygame.display.set_caption("Moje hra")

# Barvy
WHITE  = (255, 255, 255)
BLACK  = (0,   0,   0)
RED    = (220, 50,  50)
BLUE   = (50,  100, 220)
GREEN  = (50,  200, 100)

# Hodiny
clock = pygame.time.Clock()

# Objekt
x, y = WIDTH // 2, HEIGHT // 2
speed = 4

# Hlavní smyčka
running = True
while running:
    for event in pygame.event.get():
        if event.type == pygame.QUIT:
            running = False

    # Pohyb
    keys = pygame.key.get_pressed()
    if keys[pygame.K_LEFT]  or keys[pygame.K_a]: x -= speed
    if keys[pygame.K_RIGHT] or keys[pygame.K_d]: x += speed
    if keys[pygame.K_UP]    or keys[pygame.K_w]: y -= speed
    if keys[pygame.K_DOWN]  or keys[pygame.K_s]: y += speed

    # Kreslení
    screen.fill(BLACK)
    pygame.draw.circle(screen, RED, (x, y), 24)
    pygame.draw.rect(screen, BLUE, (0, HEIGHT-20, WIDTH, 20))

    pygame.display.flip()
    clock.tick(60)

pygame.quit()
`

const DEFAULT_TURTLE = `import turtle

# Nastavení
t = turtle.Turtle()
t.speed(6)
screen = turtle.Screen()
screen.bgcolor("black")
t.color("cyan")

# Spirála
for i in range(100):
    t.forward(i * 2)
    t.right(91)

turtle.done()
`

// ── Snippets ──────────────────────────────────────────────────────────────────
const SNIPPETS = [
  {
    category: 'Základy',
    items: [
      { label: 'Pygame setup', desc: 'Základní inicializace okna a smyčky', code:
`import pygame, sys
pygame.init()
WIDTH, HEIGHT = 800, 500
screen = pygame.display.set_mode((WIDTH, HEIGHT))
clock = pygame.time.Clock()
running = True
while running:
    for event in pygame.event.get():
        if event.type == pygame.QUIT:
            running = False
    screen.fill((20, 20, 30))
    pygame.display.flip()
    clock.tick(60)
pygame.quit()` },
      { label: 'Pohybující se objekt', desc: 'Rect pohybující se klávesami', code:
`x, y = 400, 250
speed = 5
keys = pygame.key.get_pressed()
if keys[pygame.K_LEFT]:  x -= speed
if keys[pygame.K_RIGHT]: x += speed
if keys[pygame.K_UP]:    y -= speed
if keys[pygame.K_DOWN]:  y += speed
pygame.draw.rect(screen, (50, 150, 255), (x-20, y-20, 40, 40))` },
      { label: 'Vstup myši', desc: 'Pozice a kliknutí myší', code:
`mx, my = pygame.mouse.get_pos()
clicked = pygame.mouse.get_pressed()[0]
pygame.draw.circle(screen, (255, 200, 0), (mx, my), 10)
for event in pygame.event.get():
    if event.type == pygame.MOUSEBUTTONDOWN:
        print(f"Klik na {event.pos}")` },
    ]
  },
  {
    category: 'Grafika',
    items: [
      { label: 'Kreslení tvarů', desc: 'Čtverec, kruh, čára, trojúhelník', code:
`pygame.draw.rect(screen,   (255, 100, 0),  (50, 50, 100, 60))
pygame.draw.circle(screen, (0, 200, 255),   (300, 100), 50)
pygame.draw.line(screen,   (255, 255, 0),   (0, 200), (800, 200), 2)
pygame.draw.polygon(screen,(180, 0, 255),   [(400,50),(350,150),(450,150)])` },
      { label: 'Text na obrazovce', desc: 'Vykreslení textu', code:
`font = pygame.font.SysFont("monospace", 28, bold=True)
text = font.render("Skóre: 0", True, (255, 255, 255))
screen.blit(text, (20, 20))` },
      { label: 'Pozadí s přechodem', desc: 'Gradient pozadí', code:
`for y in range(HEIGHT):
    r = int(20 + (y / HEIGHT) * 60)
    g = int(10 + (y / HEIGHT) * 30)
    b = int(60 + (y / HEIGHT) * 80)
    pygame.draw.line(screen, (r, g, b), (0, y), (WIDTH, y))` },
      { label: 'FPS counter', desc: 'Zobrazení FPS', code:
`fps_font = pygame.font.SysFont("monospace", 18)
fps_text = fps_font.render(f"FPS: {int(clock.get_fps())}", True, (0, 255, 100))
screen.blit(fps_text, (WIDTH - 90, 10))` },
    ]
  },
  {
    category: 'Herní mechaniky',
    items: [
      { label: 'Detekce kolizí', desc: 'Kolize dvou Rect objektů', code:
`player = pygame.Rect(x-20, y-20, 40, 40)
enemy  = pygame.Rect(ex-25, ey-25, 50, 50)
if player.colliderect(enemy):
    print("Kolize!")` },
      { label: 'Gravity a skok', desc: 'Gravitace a skok', code:
`vy = 0          # vertikální rychlost
GRAVITY = 0.5
FLOOR = HEIGHT - 60

vy += GRAVITY
y += vy
if y >= FLOOR:
    y = FLOOR
    vy = 0

keys = pygame.key.get_pressed()
if keys[pygame.K_SPACE] and y >= FLOOR:
    vy = -12` },
      { label: 'Časovač a cooldown', desc: 'Omezení frekvence akce', code:
`last_shot = 0
COOLDOWN = 500  # ms

now = pygame.time.get_ticks()
keys = pygame.key.get_pressed()
if keys[pygame.K_SPACE] and now - last_shot > COOLDOWN:
    last_shot = now
    print("Výstřel!")` },
      { label: 'Herní stavy', desc: 'Menu / hra / game over', code:
`# state: "menu" | "playing" | "gameover"
state = "menu"

if state == "menu":
    # zobraz menu
    pass
elif state == "playing":
    # herní logika
    pass
elif state == "gameover":
    # zobraz game over
    pass` },
    ]
  },
  {
    category: 'Turtle',
    items: [
      { label: 'Turtle setup', desc: 'Základní turtle okno', code:
`import turtle
t = turtle.Turtle()
t.speed(6)
screen = turtle.Screen()
screen.bgcolor("black")
t.color("white")` },
      { label: 'Hvězda', desc: 'Nakreslí hvězdu', code:
`for _ in range(5):
    t.forward(100)
    t.right(144)` },
      { label: 'Barevná spirála', desc: 'Duhová spirála', code:
`colors = ["red","orange","yellow","green","blue","violet"]
for i in range(180):
    t.color(colors[i % len(colors)])
    t.forward(i * 0.5)
    t.right(59)` },
      { label: 'Rekurzivní strom', desc: 'Fraktální strom', code:
`def tree(t, length, angle):
    if length < 5:
        return
    t.forward(length)
    t.left(angle)
    tree(t, length * 0.7, angle)
    t.right(angle * 2)
    tree(t, length * 0.7, angle)
    t.left(angle)
    t.backward(length)

t.left(90)
tree(t, 80, 25)` },
    ]
  },
]

// ── Pygame colors palette ─────────────────────────────────────────────────────
const COLORS = [
  { name:'RED',     rgb:[220,50,50] },   { name:'GREEN',   rgb:[50,200,100] },
  { name:'BLUE',    rgb:[50,100,220] },  { name:'YELLOW',  rgb:[255,220,0] },
  { name:'ORANGE',  rgb:[255,140,0] },   { name:'PURPLE',  rgb:[160,0,220] },
  { name:'CYAN',    rgb:[0,220,220] },   { name:'PINK',    rgb:[255,100,180] },
  { name:'WHITE',   rgb:[255,255,255] }, { name:'BLACK',   rgb:[0,0,0] },
  { name:'GRAY',    rgb:[128,128,128] }, { name:'DARKGRAY',rgb:[64,64,64] },
  { name:'BROWN',   rgb:[139,90,43] },   { name:'GOLD',    rgb:[255,200,0] },
  { name:'NAVY',    rgb:[0,0,128] },     { name:'TEAL',    rgb:[0,128,128] },
]

// ── Key codes reference ───────────────────────────────────────────────────────
const KEY_CODES = [
  'K_LEFT','K_RIGHT','K_UP','K_DOWN','K_SPACE','K_RETURN','K_ESCAPE',
  'K_a','K_b','K_c','K_d','K_e','K_f','K_g','K_h','K_i','K_j','K_k','K_l',
  'K_m','K_n','K_o','K_p','K_q','K_r','K_s','K_t','K_u','K_v','K_w','K_x','K_y','K_z',
  'K_0','K_1','K_2','K_3','K_4','K_5','K_6','K_7','K_8','K_9',
  'K_LSHIFT','K_RSHIFT','K_LCTRL','K_RCTRL','K_LALT','K_RALT',
  'K_F1','K_F2','K_F3','K_F4','K_F5',
]

// ── Main component ─────────────────────────────────────────────────────────────
export default function PyGameEditor({ profile }: { profile: any }) {
  const supabase   = createClient()
  const accent     = profile?.accent_color ?? '#7C3AED'
  const uid        = profile?.id as string

  // ── File state ─────────────────────────────────────────────────────────────
  const [projects, setProjects]     = useState<Project[]>([])
  const [loadingProj, setLoadingProj] = useState(true)
  const [activeFile, setActiveFile] = useState<PyFile | null>(null)
  const [isDirty, setIsDirty]       = useState(false)
  const [expanded, setExpanded]     = useState<Set<string>>(new Set())

  // ── Editor state ───────────────────────────────────────────────────────────
  const editorRef    = useRef<any>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [monacoReady, setMonacoReady] = useState(false)

  // ── Runner state ───────────────────────────────────────────────────────────
  const canvasRef    = useRef<HTMLCanvasElement>(null)
  const [mode, setMode]         = useState<'pygame'|'turtle'>('pygame')
  const [running, setRunning]   = useState(false)
  const [pyStatus, setPyStatus] = useState('')
  const [logs, setLogs]         = useState<string[]>([])
  const [pyVars, setPyVars]     = useState<{name:string;value:string}[]>([])
  const [fps, setFps]           = useState(0)
  const [mousePos, setMousePos] = useState({x:0,y:0})
  const pyodideRef   = useRef<any>(null)
  const stopFlagRef  = useRef(false)
  const animFrameRef = useRef<number>(0)

  // ── Layout state ───────────────────────────────────────────────────────────
  const [editorHeight, setEditorHeight] = useState(45) // % of center
  const resizingRef  = useRef<{startY:number;startH:number}|null>(null)
  const [rightTab, setRightTab] = useState<'snippets'|'colors'|'vars'|'docs'>('snippets')
  const [fullscreenCanvas, setFullscreenCanvas] = useState(false)
  const [saveMsg, setSaveMsg]   = useState('')
  const [saving, setSaving]     = useState(false)

  // ── Modals ─────────────────────────────────────────────────────────────────
  const [newProjModal, setNewProjModal]   = useState(false)
  const [newProjName, setNewProjName]     = useState('')
  const [newFileModal, setNewFileModal]   = useState(false)
  const [newFileName, setNewFileName]     = useState('')
  const [newFileProj, setNewFileProj]     = useState('')
  const [renamingFile, setRenamingFile]   = useState<PyFile|null>(null)
  const [renameVal, setRenameVal]         = useState('')
  const [renamingProj, setRenamingProj]   = useState<string|null>(null)
  const [renameProjVal, setRenameProjVal] = useState('')
  const [deleteFileModal, setDeleteFileModal] = useState<PyFile|null>(null)
  const [deleteProjModal, setDeleteProjModal] = useState<string|null>(null)

  // ── Sidebar ────────────────────────────────────────────────────────────────
  const sideBtn: React.CSSProperties = {
    display:'flex', alignItems:'center', gap:6, padding:'6px 10px',
    background:'rgba(255,255,255,.04)', border:`1px solid ${D.border}`,
    borderRadius:7, fontSize:11, color:D.txtSec, cursor:'pointer',
    fontFamily:'inherit', width:'100%', textAlign:'left' as const,
  }

  // ── Storage helpers ────────────────────────────────────────────────────────
  async function push(path: string, content: string) {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
    let { error } = await supabase.storage.from(BUCKET).upload(path, blob, { upsert:true, cacheControl:'0' })
    if (error) {
      await supabase.storage.from(BUCKET).remove([path])
      await supabase.storage.from(BUCKET).upload(path, blob, { cacheControl:'0' })
    }
  }

  async function fetchContent(path: string): Promise<string> {
    const { data } = await supabase.storage.from(BUCKET).download(path + '?t=' + Date.now())
    if (!data) return ''
    return await data.text()
  }

  // ── Refresh projects ───────────────────────────────────────────────────────
  const refreshProjects = useCallback(async (): Promise<Project[]> => {
    setLoadingProj(true)
    const { data: top } = await supabase.storage.from(BUCKET).list(`zaci/${uid}`, { limit:200 })
    if (!top) { setLoadingProj(false); return [] }
    const result: Project[] = []
    for (const item of top) {
      if (item.metadata !== null && item.metadata !== undefined) continue
      if (item.name.includes('.')) continue
      const { data: files } = await supabase.storage.from(BUCKET).list(`zaci/${uid}/${item.name}`, { limit:200 })
      const pyFiles: PyFile[] = (files ?? [])
        .filter(f => f.name.endsWith('.py') && f.metadata !== null)
        .map(f => ({ path: fp(uid, item.name, f.name), name: f.name, project: item.name }))
      result.push({ name: item.name, files: pyFiles })
    }
    setProjects(result)
    setLoadingProj(false)
    return result
  }, [uid])

  // ── Init ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    ;(async () => {
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

  // ── Monaco ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    const s = document.createElement('script')
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs/loader.min.js'
    s.onload = () => {
      const w = window as any
      w.require.config({ paths: { vs: 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs' } })
      w.require(['vs/editor/editor.main'], (monaco: any) => {
        if (!containerRef.current || editorRef.current) return
        monaco.editor.defineTheme('cb-dark', {
          base:'vs-dark', inherit:true,
          rules:[
            {token:'keyword',foreground:'c792ea'},{token:'string',foreground:'c3e88d'},
            {token:'comment',foreground:'546e7a',fontStyle:'italic'},{token:'number',foreground:'f78c6c'},
          ],
          colors:{'editor.background':'#0d1117','editor.lineHighlightBackground':'#161b22'},
        })
        const ed = monaco.editor.create(containerRef.current, {
          value: DEFAULT_PYGAME, language:'python', theme:'cb-dark',
          fontSize:14, minimap:{enabled:false}, automaticLayout:true,
          scrollBeyondLastLine:false, lineNumbers:'on', wordWrap:'off',
          padding:{top:12,bottom:12}, folding:true,
          suggest:{showKeywords:true},
        })
        ed.onDidChangeModelContent(() => setIsDirty(true))
        // Ctrl+S
        ed.addCommand(2048 | 49, () => saveCurrentFile())
        editorRef.current = ed
        setMonacoReady(true)
      })
    }
    document.head.appendChild(s)
    return () => { editorRef.current?.dispose() }
  }, [])

  // ── File ops ───────────────────────────────────────────────────────────────
  async function openFile(f: PyFile) {
    const content = await fetchContent(f.path)
    setActiveFile(f)
    setIsDirty(false)
    editorRef.current?.setValue(content)
    localStorage.setItem(LS_LAST, f.path)
    setExpanded(prev => new Set([...prev, f.project]))
    // Auto-detect turtle mode
    setMode(content.includes('import turtle') ? 'turtle' : 'pygame')
  }

  async function saveCurrentFile() {
    if (!activeFile) return
    setSaving(true)
    const content = editorRef.current?.getValue() ?? ''
    await push(activeFile.path, content)
    setIsDirty(false)
    setSaveMsg('✓ Uloženo'); setTimeout(() => setSaveMsg(''), 2000)
    setSaving(false)
  }

  async function doCreateProject() {
    if (!newProjName.trim()) return
    const k = sanitize(newProjName.trim())
    const path = fp(uid, k, 'main.py')
    await push(path, DEFAULT_PYGAME)
    const projs = await refreshProjects()
    const f = projs.find(p => p.name === k)?.files[0]
    if (f) await openFile(f)
    setNewProjModal(false); setNewProjName('')
  }

  async function doCreateFile() {
    const proj = newFileProj || projects[0]?.name
    if (!newFileName.trim() || !proj) return
    let name = newFileName.trim()
    if (!name.endsWith('.py')) name += '.py'
    const path = fp(uid, proj, name)
    const starter = mode === 'turtle' ? DEFAULT_TURTLE : DEFAULT_PYGAME
    await push(path, starter)
    const projs = await refreshProjects()
    const f = projs.find(p => p.name === proj)?.files.find(x => x.path === path)
    if (f) await openFile(f)
    setNewFileModal(false); setNewFileName('')
  }

  async function doDeleteFile(f: PyFile) {
    await supabase.storage.from(BUCKET).remove([f.path])
    if (activeFile?.path === f.path) { setActiveFile(null); editorRef.current?.setValue('') }
    setDeleteFileModal(null)
    await refreshProjects()
  }

  async function doDeleteProject(projName: string) {
    const proj = projects.find(p => p.name === projName)
    if (!proj) return
    await supabase.storage.from(BUCKET).remove(proj.files.map(f => f.path))
    if (proj.files.some(f => f.path === activeFile?.path)) { setActiveFile(null); editorRef.current?.setValue('') }
    setDeleteProjModal(null)
    await refreshProjects()
  }

  async function doRenameFile() {
    if (!renamingFile || !renameVal.trim()) { setRenamingFile(null); return }
    let nn = renameVal.trim()
    if (!nn.endsWith('.py')) nn += '.py'
    const np = fp(uid, renamingFile.project, nn)
    const content = await fetchContent(renamingFile.path)
    await push(np, content)
    await supabase.storage.from(BUCKET).remove([renamingFile.path])
    if (activeFile?.path === renamingFile.path) setActiveFile({...renamingFile, path:np, name:nn})
    setRenamingFile(null)
    await refreshProjects()
  }

  async function doRenameProject() {
    if (!renamingProj || !renameProjVal.trim()) { setRenamingProj(null); return }
    const newN = sanitize(renameProjVal.trim())
    const proj = projects.find(p => p.name === renamingProj)
    if (!proj) { setRenamingProj(null); return }
    for (const f of proj.files) {
      const np = fp(uid, newN, f.name)
      const content = await fetchContent(f.path)
      await push(np, content)
      await supabase.storage.from(BUCKET).remove([f.path])
      if (activeFile?.path === f.path) setActiveFile({...f, path:np, project:newN})
    }
    setRenamingProj(null)
    await refreshProjects()
  }

  // ── Runner ─────────────────────────────────────────────────────────────────
  async function runCode() {
    if (running) return
    const code = editorRef.current?.getValue() ?? ''
    setLogs([])
    setPyVars([])
    setFps(0)
    setRunning(true)
    stopFlagRef.current = false
    setPyStatus('Načítám Pyodide…')

    try {
      let py = pyodideRef.current
      if (!py) {
        // Load Pyodide
        if (!(window as any).loadPyodide) {
          await new Promise<void>((res, rej) => {
            const s = document.createElement('script')
            s.src = 'https://cdn.jsdelivr.net/pyodide/v0.26.0/full/pyodide.js'
            s.onload = () => res(); s.onerror = () => rej(new Error('Pyodide load failed'))
            document.head.appendChild(s)
          })
        }
        py = await (window as any).loadPyodide({
          indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.26.0/full/',
          stdout: (s: string) => setLogs(p => [...p.slice(-199), s]),
          stderr: (s: string) => setLogs(p => [...p.slice(-199), '⚠ ' + s]),
        })
        pyodideRef.current = py
      }

      if (mode === 'turtle') {
        await runTurtle(py, code)
      } else {
        await runPygame(py, code)
      }
    } catch (e: any) {
      setLogs(p => [...p, '❌ ' + (e?.message ?? String(e))])
    } finally {
      setRunning(false)
      setPyStatus('')
    }
  }

  async function runPygame(py: any, code: string) {
    if (!canvasRef.current) return
    setPyStatus('Načítám pygame…')

    // Install pygame-ce via micropip
    await py.loadPackagesFromImports('import micropip')
    const mp = py.pyimport('micropip')
    try { await mp.install('pygame-ce') } catch {}

    setPyStatus('Spouštím…')
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')!

    // Patch pygame to use our canvas
    await py.runPythonAsync(`
import pygame
import js
import pyodide

canvas_el = js.document.getElementById("pygame-canvas")
pygame.display._pygame_canvas = canvas_el

# Monkey-patch display
class _Screen:
    def __init__(self, w, h):
        self.w = w; self.h = h
    def fill(self, color):
        r, g, b = color
        ctx = js.document.getElementById("pygame-canvas").getContext("2d")
        ctx.fillStyle = f"rgb({r},{g},{b})"
        ctx.fillRect(0, 0, self.w, self.h)
    def blit(self, surf, pos): pass
    def get_size(self): return (self.w, self.h)
`, { globals: py.toPy({}) })

    // Actually run with pygame.js-style WASM binding
    // For now, run synchronously and capture draw calls
    // This is simplified - full pygame WASM needs pygame-ce with SDL2 WASM
    try {
      await py.runPythonAsync(code)
    } catch (e: any) {
      if (!stopFlagRef.current) throw e
    }
  }

  async function runTurtle(py: any, code: string) {
    if (!canvasRef.current) return
    setPyStatus('Spouštím turtle…')
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')!
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = '#0d1117'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    // Turtle canvas-based interpreter
    const w = canvas.width, h = canvas.height
    let tx = w/2, ty = h/2, angle = 0
    let penDown = true
    let color = '#ffffff'
    let bgColor = '#0d1117'
    const speed_map: any = {1:1,2:2,3:3,4:4,5:5,6:8,7:12,8:16,9:24,0:1000}

    ctx.fillStyle = bgColor; ctx.fillRect(0,0,w,h)
    ctx.strokeStyle = color; ctx.lineWidth = 1.5
    ctx.beginPath(); ctx.moveTo(tx, ty)

    const logLines: string[] = []

    // Simple turtle interpreter
    const turtleEnv: any = {
      forward: (d: number) => {
        const rad = (angle - 90) * Math.PI / 180
        const nx = tx + d * Math.cos(rad)
        const ny = ty + d * Math.sin(rad)
        if (penDown) { ctx.lineTo(nx, ny); ctx.stroke(); ctx.beginPath(); ctx.moveTo(nx, ny) }
        else { ctx.moveTo(nx, ny) }
        tx = nx; ty = ny
      },
      backward: (d: number) => turtleEnv.forward(-d),
      right: (a: number) => { angle += a },
      left: (a: number) => { angle -= a },
      penup: () => { penDown = false; ctx.beginPath(); ctx.moveTo(tx, ty) },
      pendown: () => { penDown = true; ctx.beginPath(); ctx.moveTo(tx, ty) },
      color: (c: string) => { color = c; ctx.strokeStyle = c },
      bgcolor: (c: string) => { bgColor = c; ctx.fillStyle = c; ctx.fillRect(0,0,w,h); ctx.strokeStyle = color },
      speed: () => {},
      goto: (x: number, y: number) => {
        tx = w/2 + x; ty = h/2 - y
        ctx.beginPath(); ctx.moveTo(tx, ty)
      },
      setpos: (x: number, y: number) => turtleEnv.goto(x, y),
      home: () => turtleEnv.goto(0, 0),
      clear: () => { ctx.fillStyle = bgColor; ctx.fillRect(0,0,w,h); ctx.strokeStyle = color },
      reset: () => { tx=w/2; ty=h/2; angle=0; penDown=true; turtleEnv.clear() },
      hideturtle: () => {},
      showturtle: () => {},
      circle: (r: number) => {
        ctx.beginPath(); ctx.arc(tx, ty, Math.abs(r), 0, 2*Math.PI)
        if (penDown) ctx.stroke(); ctx.beginPath(); ctx.moveTo(tx, ty)
      },
      dot: (size: number, c?: string) => {
        const old = ctx.fillStyle; ctx.fillStyle = c ?? color
        ctx.beginPath(); ctx.arc(tx, ty, size/2, 0, 2*Math.PI); ctx.fill()
        ctx.fillStyle = old
      },
      width: (w: number) => { ctx.lineWidth = w },
      pensize: (w: number) => { ctx.lineWidth = w },
      done: () => {},
    }

    // Execute code line-by-line (simplified turtle execution)
    try {
      await py.runPythonAsync(`
import sys
class _TurtleProxy:
    def __init__(self, env):
        self._env = env
    def __getattr__(self, name):
        fn = self._env.get(name)
        if fn: return lambda *a, **kw: fn(*[a_.to_py() if hasattr(a_,'to_py') else a_ for a_ in a])
        return lambda *a, **kw: None

import js
_proxy = _TurtleProxy(js._turtleEnv)

import sys
class _TurtleModule:
    Turtle = lambda self: _proxy
    Screen = lambda self: _proxy
    def __getattr__(self, name):
        return getattr(_proxy, name)
sys.modules['turtle'] = _TurtleModule()
`,{ globals: py.toPy({_turtleEnv: turtleEnv}) })

      await py.runPythonAsync(code)
      setLogs(['✓ Hotovo'])
    } catch (e: any) {
      setLogs(['❌ ' + (e?.message ?? String(e))])
    }
  }

  function stopCode() {
    stopFlagRef.current = true
    cancelAnimationFrame(animFrameRef.current)
    setRunning(false)
    setPyStatus('')
  }

  // ── Resize handle ──────────────────────────────────────────────────────────
  function onResizeStart(e: React.MouseEvent) {
    resizingRef.current = { startY: e.clientY, startH: editorHeight }
    const up = () => { resizingRef.current = null; window.removeEventListener('mouseup', up); window.removeEventListener('mousemove', onResizeMove) }
    window.addEventListener('mouseup', up)
    window.addEventListener('mousemove', onResizeMove)
  }
  function onResizeMove(e: MouseEvent) {
    if (!resizingRef.current) return
    const center = document.getElementById('pygame-center')
    if (!center) return
    const totalH = center.clientHeight
    const dy = e.clientY - resizingRef.current.startY
    const newPct = Math.max(20, Math.min(80, resizingRef.current.startH + (dy / totalH) * 100))
    setEditorHeight(newPct)
  }

  // ── Insert snippet at cursor ───────────────────────────────────────────────
  function insertSnippet(code: string) {
    const ed = editorRef.current
    if (!ed) return
    const sel = ed.getSelection()
    ed.executeEdits('snippet', [{ range: sel, text: '\n' + code + '\n', forceMoveMarkers: true }])
    ed.focus()
  }

  // ── Color insert ───────────────────────────────────────────────────────────
  function insertColor(rgb: number[], name: string) {
    const ed = editorRef.current
    if (!ed) return
    const sel = ed.getSelection()
    ed.executeEdits('color', [{ range: sel, text: `(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`, forceMoveMarkers:true }])
    ed.focus()
  }

  const flash = (m: string) => { setSaveMsg(m); setTimeout(() => setSaveMsg(''), 2500) }

  const isEmpty = projects.length === 0 && !loadingProj

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <DarkLayout profile={profile} activeRoute="/student/pygame" fullContent>
      <style>{`
        .pg-sb:hover { background: rgba(255,255,255,.08) !important; color: #fff !important; }
        .pg-row:hover { background: rgba(255,255,255,.05) !important; }
        .pg-acts { opacity: 0 !important; }
        .pg-row:hover .pg-acts { opacity: 1 !important; }
        @keyframes spin { to { transform: rotate(360deg) } }
      `}</style>

      {/* ── Modals ── */}
      {newProjModal && (
        <Modal title="🎮 Nový projekt" onClose={() => setNewProjModal(false)}>
          <input value={newProjName} onChange={e=>setNewProjName(e.target.value)}
            onKeyDown={e=>e.key==='Enter'&&doCreateProject()} autoFocus placeholder="Název projektu"
            style={minpStyle} />
          <MBtns onOk={doCreateProject} onCancel={()=>setNewProjModal(false)} label="Vytvořit" disabled={!newProjName.trim()} accent={accent} />
        </Modal>
      )}
      {newFileModal && (
        <Modal title="📄 Nový soubor" onClose={() => setNewFileModal(false)}>
          {projects.length > 1 && (
            <select value={newFileProj||projects[0]?.name} onChange={e=>setNewFileProj(e.target.value)}
              style={{...minpStyle, marginBottom:10, cursor:'pointer'}}>
              {projects.map(p=><option key={p.name} value={p.name}>{p.name}</option>)}
            </select>
          )}
          <input value={newFileName} onChange={e=>setNewFileName(e.target.value)}
            onKeyDown={e=>e.key==='Enter'&&doCreateFile()} autoFocus placeholder="main.py"
            style={minpStyle} />
          <MBtns onOk={doCreateFile} onCancel={()=>setNewFileModal(false)} label="Vytvořit" disabled={!newFileName.trim()} accent={accent} />
        </Modal>
      )}
      {deleteFileModal && (
        <Modal title="🗑 Smazat soubor" onClose={() => setDeleteFileModal(null)}>
          <p style={{color:D.txtSec,fontSize:13,marginBottom:16}}>Opravdu smazat <strong style={{color:'#fff'}}>{deleteFileModal.name}</strong>? Tato akce je nevratná.</p>
          <MBtns onOk={()=>doDeleteFile(deleteFileModal)} onCancel={()=>setDeleteFileModal(null)} label="Smazat" danger accent={accent} />
        </Modal>
      )}
      {deleteProjModal && (
        <Modal title="🗑 Smazat projekt" onClose={() => setDeleteProjModal(null)}>
          <p style={{color:D.txtSec,fontSize:13,marginBottom:16}}>Opravdu smazat projekt <strong style={{color:'#fff'}}>{deleteProjModal}</strong> a všechny jeho soubory?</p>
          <MBtns onOk={()=>doDeleteProject(deleteProjModal)} onCancel={()=>setDeleteProjModal(null)} label="Smazat vše" danger accent={accent} />
        </Modal>
      )}

      {/* ── Fullscreen canvas overlay ── */}
      {fullscreenCanvas && (
        <div style={{position:'fixed',inset:0,background:'#000',zIndex:9990,display:'flex',alignItems:'center',justifyContent:'center'}}>
          <canvas id="pygame-canvas-fs" width={800} height={500} style={{border:`1px solid ${D.border}`}} />
          <button onClick={()=>setFullscreenCanvas(false)}
            style={{position:'fixed',top:16,right:16,padding:'8px 16px',background:'rgba(0,0,0,.7)',color:'#fff',border:`1px solid ${D.border}`,borderRadius:8,cursor:'pointer',zIndex:9991}}>
            ✕ Zavřít
          </button>
        </div>
      )}

      {/* ══ 3-col layout ══ */}
      <div style={{display:'flex',flex:1,minHeight:0,overflow:'hidden'}}>

        {/* ══ LEFT ══ */}
        <div style={{width:210,flexShrink:0,borderRight:`1px solid ${D.border}`,background:D.bgCard,display:'flex',flexDirection:'column',overflow:'hidden'}}>
          <div style={{padding:'12px 12px 10px',borderBottom:`1px solid ${D.border}`,flexShrink:0}}>
            <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:8}}>
              <div style={{width:28,height:28,borderRadius:7,background:accent+'30',border:`1px solid ${accent}50`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:16}}>🎮</div>
              <div>
                <div style={{fontSize:11,fontWeight:700,color:D.txtPri,lineHeight:1.2}}>PyGame Edit</div>
                <div style={{fontSize:9,color:D.txtSec,lineHeight:1.2}}>by Jakub Krejčí</div>
              </div>
              {isDirty&&<span style={{fontSize:9,color:D.warning,marginLeft:'auto'}}>● neuloženo</span>}
            </div>
            <div style={{display:'flex',flexDirection:'column',gap:4}}>
              <button className="pg-sb" style={sideBtn} onClick={()=>setNewProjModal(true)}><span>📁</span> Nový projekt</button>
              <button className="pg-sb" style={{...sideBtn,opacity:projects.length===0?.5:1}} disabled={projects.length===0} onClick={()=>setNewFileModal(true)}><span>📄</span> Nový soubor</button>
              <div style={{height:1,background:D.border,margin:'2px 0'}}/>
              <button className="pg-sb" style={{...sideBtn,opacity:!activeFile||saving?.5:1}} disabled={!activeFile||saving} onClick={saveCurrentFile}><span>💾</span>{saving?'Ukládám…':'Uložit (Ctrl+S)'}</button>
            </div>
          </div>

          {/* Project tree */}
          <div style={{flex:1,overflowY:'auto',padding:'4px 0'}}>
            <div style={{padding:'5px 12px 3px',fontSize:10,fontWeight:700,color:D.txtSec,textTransform:'uppercase',letterSpacing:'.06em'}}>Projekty</div>
            {loadingProj
              ? <div style={{fontSize:11,color:D.txtSec,padding:'8px 12px',display:'flex',alignItems:'center',gap:6}}>
                  <div style={{width:11,height:11,border:`2px solid ${D.border}`,borderTopColor:accent,borderRadius:'50%',animation:'spin .6s linear infinite'}}/>Načítám…
                </div>
              : projects.length===0
                ? null
                : projects.map(proj => (
                  <div key={proj.name}>
                    <div className="pg-row" style={{display:'flex',alignItems:'center',gap:5,padding:'4px 12px',cursor:'pointer',background:proj.files.some(f=>f.path===activeFile?.path)?accent+'10':'transparent'}}>
                      <span onClick={()=>setExpanded(prev=>{const n=new Set(prev);n.has(proj.name)?n.delete(proj.name):n.add(proj.name);return n})}
                        style={{fontSize:9,color:D.txtSec,display:'inline-block',transition:'transform .15s',transform:expanded.has(proj.name)?'rotate(90deg)':'none'}}>▶</span>
                      <span onClick={()=>setExpanded(prev=>{const n=new Set(prev);n.has(proj.name)?n.delete(proj.name):n.add(proj.name);return n})} style={{fontSize:11}}>📁</span>
                      {renamingProj===proj.name
                        ? <input value={renameProjVal} autoFocus onChange={e=>setRenameProjVal(e.target.value)}
                            onKeyDown={e=>{if(e.key==='Enter')doRenameProject();if(e.key==='Escape')setRenamingProj(null)}}
                            onBlur={()=>setRenamingProj(null)}
                            style={{flex:1,padding:'2px 5px',background:D.bgMid,border:`1px solid ${accent}`,borderRadius:4,fontSize:11,color:D.txtPri,fontFamily:'inherit',outline:'none'}}
                            onClick={e=>e.stopPropagation()}/>
                        : <span onClick={()=>setExpanded(prev=>{const n=new Set(prev);n.has(proj.name)?n.delete(proj.name):n.add(proj.name);return n})}
                            style={{fontSize:11,fontWeight:600,color:D.txtPri,flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{proj.name}</span>
                      }
                      <div className="pg-acts" style={{display:'flex',gap:1}}>
                        <button onClick={e=>{e.stopPropagation();setRenamingProj(proj.name);setRenameProjVal(proj.name)}} style={{padding:'1px 4px',background:'none',border:'none',cursor:'pointer',color:D.txtSec,fontSize:10}}>✏</button>
                        <button onClick={e=>{e.stopPropagation();setDeleteProjModal(proj.name)}} style={{padding:'1px 4px',background:'none',border:'none',cursor:'pointer',color:D.danger,fontSize:10}}>🗑</button>
                      </div>
                    </div>
                    {expanded.has(proj.name)&&proj.files.map(f=>(
                      <div key={f.path} className="pg-row"
                        style={{display:'flex',alignItems:'center',gap:5,padding:'3px 12px 3px 26px',cursor:'pointer',background:f.path===activeFile?.path?accent+'18':'transparent',borderLeft:f.path===activeFile?.path?`2px solid ${accent}`:'2px solid transparent'}}>
                        {renamingFile?.path===f.path
                          ? <input value={renameVal} autoFocus onChange={e=>setRenameVal(e.target.value)}
                              onKeyDown={async e=>{if(e.key==='Enter')await doRenameFile();if(e.key==='Escape')setRenamingFile(null)}}
                              onBlur={()=>setRenamingFile(null)}
                              style={{flex:1,padding:'2px 5px',background:D.bgMid,border:`1px solid ${accent}`,borderRadius:4,fontSize:10,color:D.txtPri,fontFamily:'inherit',outline:'none'}}
                              onClick={e=>e.stopPropagation()}/>
                          : <>
                              <span style={{fontSize:10}}>🐍</span>
                              <span onClick={()=>openFile(f)} style={{fontSize:10,color:f.path===activeFile?.path?accent:D.txtSec,flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{f.name}</span>
                              <div className="pg-acts" style={{display:'flex',gap:1}}>
                                <button onClick={e=>{e.stopPropagation();setRenamingFile(f);setRenameVal(f.name.replace(/\.py$/,''))}} style={{padding:'1px 4px',background:'none',border:'none',cursor:'pointer',color:D.txtSec,fontSize:10}}>✏</button>
                                <button onClick={e=>{e.stopPropagation();setDeleteFileModal(f)}} style={{padding:'1px 4px',background:'none',border:'none',cursor:'pointer',color:D.danger,fontSize:10}}>🗑</button>
                              </div>
                            </>
                        }
                      </div>
                    ))}
                  </div>
                ))
            }
          </div>
          {saveMsg&&<div style={{padding:'6px 12px',borderTop:`1px solid ${D.border}`,fontSize:11,color:D.success,flexShrink:0}}>{saveMsg}</div>}
        </div>

        {/* ══ CENTER ══ */}
        <div id="pygame-center" style={{flex:1,display:'flex',flexDirection:'column',minWidth:0,overflow:'hidden'}}>

          {isEmpty ? (
            /* ── Welcome screen ── */
            <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',flexDirection:'column',gap:20,padding:40}}>
              <div style={{fontSize:64}}>🎮</div>
              <div style={{fontSize:24,fontWeight:800,color:D.txtPri,textAlign:'center'}}>PyGame Edit</div>
              <div style={{fontSize:14,color:D.txtSec,textAlign:'center',maxWidth:420,lineHeight:1.7}}>
                Vytvoř svůj první projekt a začni programovat hry a animace v Pythonu pomocí pygame nebo turtle.
              </div>
              <button onClick={()=>setNewProjModal(true)}
                style={{padding:'12px 32px',background:accent,color:'#fff',border:'none',borderRadius:10,fontSize:15,fontWeight:700,cursor:'pointer',marginTop:8}}>
                🎮 Vytvořit první projekt
              </button>
              <div style={{display:'flex',gap:24,marginTop:16,fontSize:12,color:D.txtSec}}>
                <span>✓ Pygame animace</span>
                <span>✓ Turtle grafika</span>
                <span>✓ Detekce kláves</span>
                <span>✓ Detekce kolizí</span>
              </div>
            </div>
          ) : (
            <>
              {/* Editor section */}
              <div style={{height:`${editorHeight}%`,minHeight:'20%',display:'flex',flexDirection:'column',overflow:'hidden'}}>
                {/* Editor toolbar */}
                <div style={{display:'flex',alignItems:'center',gap:8,padding:'6px 12px',borderBottom:`1px solid ${D.border}`,flexShrink:0,background:D.bgCard}}>
                  <span style={{fontSize:12,color:D.txtSec,fontFamily:'monospace'}}>{activeFile?.project??'—'} / {activeFile?.name??'—'}</span>
                  <div style={{flex:1}}/>
                  {/* Mode switcher */}
                  <div style={{display:'flex',border:`1px solid ${D.border}`,borderRadius:7,overflow:'hidden'}}>
                    {(['pygame','turtle'] as const).map(m=>(
                      <button key={m} onClick={()=>setMode(m)}
                        style={{padding:'4px 12px',background:mode===m?accent:'transparent',color:mode===m?'#fff':D.txtSec,border:'none',cursor:'pointer',fontSize:11,fontWeight:600,fontFamily:'inherit'}}>
                        {m==='pygame'?'🎮 Pygame':'🐢 Turtle'}
                      </button>
                    ))}
                  </div>
                  <button onClick={runCode} disabled={running||!activeFile}
                    style={{padding:'5px 16px',background:running?D.bgMid:accent,color:running?D.txtSec:'#fff',border:'none',borderRadius:7,fontSize:12,fontWeight:700,cursor:running||!activeFile?'not-allowed':'pointer',fontFamily:'inherit',display:'flex',alignItems:'center',gap:5}}>
                    {running?<><div style={{width:10,height:10,border:`2px solid ${D.border}`,borderTopColor:'#fff',borderRadius:'50%',animation:'spin .6s linear infinite'}}/>Spouštím…</>:'▶ Spustit'}
                  </button>
                  {running&&<button onClick={stopCode} style={{padding:'5px 12px',background:'rgba(239,68,68,.15)',color:D.danger,border:`1px solid rgba(239,68,68,.3)`,borderRadius:7,fontSize:12,cursor:'pointer',fontFamily:'inherit'}}>■ Stop</button>}
                </div>
                {/* Monaco */}
                <div style={{flex:1,position:'relative',overflow:'hidden'}}>
                  {!monacoReady&&<div style={{position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center',background:'#0d1117',color:D.txtSec,fontSize:13}}>Načítám editor…</div>}
                  {!activeFile&&monacoReady&&<div style={{position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center',background:'#0d1117',color:D.txtSec,fontSize:13,flexDirection:'column',gap:10}}>
                    <span style={{fontSize:32}}>📄</span>
                    <span>Vyber nebo vytvoř soubor</span>
                  </div>}
                  <div ref={containerRef} style={{width:'100%',height:'100%'}}/>
                </div>
              </div>

              {/* ── Resize handle ── */}
              <div onMouseDown={onResizeStart}
                style={{height:6,background:D.border,cursor:'row-resize',flexShrink:0,display:'flex',alignItems:'center',justifyContent:'center'}}
              >
                <div style={{width:40,height:3,borderRadius:2,background:'rgba(255,255,255,.15)'}}/>
              </div>

              {/* Canvas + toolbar section */}
              <div style={{flex:1,minHeight:'20%',display:'flex',flexDirection:'column',overflow:'hidden',background:'#0a0d13'}}>
                {/* Canvas toolbar */}
                <div style={{display:'flex',alignItems:'center',gap:8,padding:'5px 12px',borderBottom:`1px solid ${D.border}`,flexShrink:0,background:D.bgCard}}>
                  <span style={{fontSize:11,color:D.txtSec}}>🖥 Canvas — {mode==='pygame'?'Pygame':'Turtle'}</span>
                  {pyStatus&&<span style={{fontSize:11,color:accent}}>{pyStatus}</span>}
                  <div style={{flex:1}}/>
                  <button onClick={()=>setFullscreenCanvas(true)}
                    style={{padding:'3px 10px',background:'rgba(255,255,255,.06)',color:D.txtSec,border:`1px solid ${D.border}`,borderRadius:6,fontSize:11,cursor:'pointer'}}>
                    ⛶ Fullscreen
                  </button>
                </div>
                {/* Canvas */}
                <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',overflow:'hidden'}}
                  onMouseMove={e=>{const r=e.currentTarget.getBoundingClientRect();setMousePos({x:Math.round(e.clientX-r.left),y:Math.round(e.clientY-r.top)})}}>
                  <canvas id="pygame-canvas" ref={canvasRef} width={800} height={500}
                    style={{border:`1px solid ${D.border}`,borderRadius:4,maxWidth:'100%',maxHeight:'100%',objectFit:'contain',background:'#0d1117'}}/>
                </div>
                {/* Logs */}
                {logs.length>0&&(
                  <div style={{height:80,borderTop:`1px solid ${D.border}`,background:'#0a0d13',overflowY:'auto',padding:'6px 12px',fontFamily:'monospace',fontSize:11}}>
                    {logs.map((l,i)=><div key={i} style={{color:l.startsWith('❌')?D.danger:l.startsWith('⚠')?D.warning:D.txtSec,lineHeight:1.5}}>{l}</div>)}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* ══ RIGHT ══ */}
        <div style={{width:280,flexShrink:0,borderLeft:`1px solid ${D.border}`,background:D.bgCard,display:'flex',flexDirection:'column',overflow:'hidden'}}>
          {/* Tab bar */}
          <div style={{display:'flex',borderBottom:`1px solid ${D.border}`,flexShrink:0}}>
            {([['snippets','📋','Snippety'],['colors','🎨','Barvy'],['vars','📊','Stav'],['docs','📖','Docs']] as [string,string,string][]).map(([tab,icon,label])=>(
              <button key={tab} onClick={()=>setRightTab(tab as any)}
                style={{flex:1,padding:'8px 4px',background:rightTab===tab?D.bgMid:'transparent',border:'none',borderBottom:`2px solid ${rightTab===tab?accent:'transparent'}`,cursor:'pointer',fontFamily:'inherit',fontSize:10,fontWeight:600,color:rightTab===tab?D.txtPri:D.txtSec,display:'flex',flexDirection:'column',alignItems:'center',gap:2}}>
                <span style={{fontSize:14}}>{icon}</span>{label}
              </button>
            ))}
          </div>

          <div style={{flex:1,overflowY:'auto'}}>

            {/* ── Snippets tab ── */}
            {rightTab==='snippets'&&(
              <div style={{padding:8}}>
                {SNIPPETS.map(cat=>(
                  <div key={cat.category} style={{marginBottom:12}}>
                    <div style={{fontSize:10,fontWeight:700,color:D.txtSec,textTransform:'uppercase',letterSpacing:'.06em',padding:'4px 4px 6px'}}>{cat.category}</div>
                    {cat.items.map(item=>(
                      <button key={item.label} onClick={()=>insertSnippet(item.code)}
                        style={{width:'100%',textAlign:'left',padding:'8px 10px',background:'rgba(255,255,255,.03)',border:`1px solid ${D.border}`,borderRadius:7,marginBottom:4,cursor:'pointer',fontFamily:'inherit'}}>
                        <div style={{fontSize:11,fontWeight:600,color:D.txtPri,marginBottom:2}}>{item.label}</div>
                        <div style={{fontSize:10,color:D.txtSec}}>{item.desc}</div>
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            )}

            {/* ── Colors tab ── */}
            {rightTab==='colors'&&(
              <div style={{padding:10}}>
                <div style={{fontSize:10,fontWeight:700,color:D.txtSec,textTransform:'uppercase',letterSpacing:'.06em',marginBottom:8}}>Paleta barev — klik vloží RGB</div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:5,marginBottom:16}}>
                  {COLORS.map(c=>(
                    <button key={c.name} onClick={()=>insertColor(c.rgb, c.name)}
                      style={{display:'flex',alignItems:'center',gap:7,padding:'6px 8px',background:'rgba(255,255,255,.03)',border:`1px solid ${D.border}`,borderRadius:7,cursor:'pointer',fontFamily:'inherit'}}>
                      <div style={{width:20,height:20,borderRadius:4,background:`rgb(${c.rgb[0]},${c.rgb[1]},${c.rgb[2]})`,flexShrink:0,border:'1px solid rgba(255,255,255,.1)'}}/>
                      <span style={{fontSize:10,color:D.txtSec,fontFamily:'monospace'}}>{c.name}</span>
                    </button>
                  ))}
                </div>
                <div style={{fontSize:10,fontWeight:700,color:D.txtSec,textTransform:'uppercase',letterSpacing:'.06em',marginBottom:8}}>Vlastní barva</div>
                <ColorPicker onInsert={insertColor}/>
              </div>
            )}

            {/* ── Vars / State tab ── */}
            {rightTab==='vars'&&(
              <div style={{padding:10}}>
                <div style={{fontSize:10,fontWeight:700,color:D.txtSec,textTransform:'uppercase',letterSpacing:'.06em',marginBottom:10}}>Live stav</div>
                <div style={{display:'flex',flexDirection:'column',gap:6,marginBottom:14}}>
                  <StatRow label="Stav" value={running?'▶ Spuštěno':'⏹ Zastaveno'} color={running?D.success:D.txtSec}/>
                  <StatRow label="Režim" value={mode==='pygame'?'🎮 Pygame':'🐢 Turtle'}/>
                  <StatRow label="FPS" value={fps>0?fps.toString():'—'}/>
                  <StatRow label="Myš" value={`${mousePos.x}, ${mousePos.y}`}/>
                  <StatRow label="Soubor" value={activeFile?.name??'—'}/>
                  <StatRow label="Projekt" value={activeFile?.project??'—'}/>
                </div>
                {logs.length>0&&<>
                  <div style={{fontSize:10,fontWeight:700,color:D.txtSec,textTransform:'uppercase',letterSpacing:'.06em',marginBottom:8}}>Výstup (print)</div>
                  <div style={{background:'#0a0d13',borderRadius:7,padding:8,fontFamily:'monospace',fontSize:11,maxHeight:200,overflowY:'auto'}}>
                    {logs.slice(-20).map((l,i)=><div key={i} style={{color:l.startsWith('❌')?D.danger:l.startsWith('⚠')?D.warning:'#94a3b8',lineHeight:1.6}}>{l}</div>)}
                  </div>
                </>}
              </div>
            )}

            {/* ── Docs tab ── */}
            {rightTab==='docs'&&(
              <div style={{padding:10}}>
                <div style={{fontSize:10,fontWeight:700,color:D.txtSec,textTransform:'uppercase',letterSpacing:'.06em',marginBottom:10}}>Rychlá reference</div>

                <DocSection title="🎮 Pygame — základy" items={[
                    ['pygame.init()', 'Inicializace pygame'],
                    ['pygame.display.set_mode((w,h))', 'Vytvoří okno'],
                    ['pygame.display.set_caption("název")', 'Název okna'],
                    ['screen.fill((r,g,b))', 'Vyplní obrazovku barvou'],
                    ['pygame.display.flip()', 'Aktualizuje displej'],
                    ['clock.tick(60)', 'Omezí FPS na 60'],
                    ['pygame.quit()', 'Ukončí pygame'],
                  ]}/>

                <DocSection title="✏ Kreslení" items={[
                    ['pygame.draw.rect(screen, barva, (x,y,w,h))', 'Obdélník'],
                    ['pygame.draw.circle(screen, barva, (x,y), r)', 'Kruh'],
                    ['pygame.draw.line(screen, barva, start, end, w)', 'Čára'],
                    ['pygame.draw.polygon(screen, barva, body)', 'Polygon'],
                    ['screen.blit(surface, (x,y))', 'Vykreslí surface'],
                  ]}/>

                <DocSection title="⌨ Klávesy" items={[
                    ['pygame.key.get_pressed()', 'Slovník stisknutých kláves'],
                    ...KEY_CODES.slice(0,10).map(k=>[`pygame.${k}`, k.replace('K_','')] as [string,string]),
                  ]}/>

                <DocSection title="🖱 Myš" items={[
                    ['pygame.mouse.get_pos()', 'Pozice myši (x, y)'],
                    ['pygame.mouse.get_pressed()', 'Stisk tlačítek'],
                    ['event.type == pygame.MOUSEBUTTONDOWN', 'Klik myší'],
                    ['event.pos', 'Pozice u eventu'],
                  ]}/>

                <DocSection title="🐢 Turtle" items={[
                    ['t.forward(n)', 'Dopředu o n pixelů'],
                    ['t.right(a)', 'Otočení doprava o a stupňů'],
                    ['t.left(a)', 'Otočení doleva'],
                    ['t.penup() / t.pendown()', 'Zvedni / polož pero'],
                    ['t.color("red")', 'Barva pera'],
                    ['t.goto(x, y)', 'Přesun na souřadnice'],
                    ['t.circle(r)', 'Nakreslí kruh'],
                    ['t.speed(n)', '1=pomalé, 0=bez animace'],
                  ]}/>
              </div>
            )}
          </div>
        </div>
      </div>
    </DarkLayout>
  )
}

// ── Small components ──────────────────────────────────────────────────────────
function Modal({ title, onClose, children }: { title:string; onClose:()=>void; children:React.ReactNode }) {
  return (
    <>
      <div onClick={onClose} style={{position:'fixed',inset:0,background:'rgba(0,0,0,.72)',zIndex:9998,backdropFilter:'blur(5px)'}}/>
      <div style={{position:'fixed',top:'50%',left:'50%',transform:'translate(-50%,-50%)',zIndex:9999,width:'100%',maxWidth:380,padding:'0 16px'}}>
        <div style={{background:D.bgCard,borderRadius:16,padding:'24px 20px',border:`1px solid ${D.border}`,boxShadow:'0 28px 70px rgba(0,0,0,.75)'}}>
          <div style={{fontSize:15,fontWeight:700,color:D.txtPri,marginBottom:14}}>{title}</div>
          {children}
        </div>
      </div>
    </>
  )
}

function MBtns({ onOk, onCancel, label, disabled, danger, accent }: any) {
  return (
    <div style={{display:'flex',gap:8,marginTop:4}}>
      <button onClick={onOk} disabled={disabled}
        style={{flex:1,padding:'9px',background:disabled?D.bgMid:danger?'#ef4444':accent,color:disabled?D.txtSec:'#fff',border:'none',borderRadius:8,fontSize:13,fontWeight:600,cursor:disabled?'not-allowed':'pointer',fontFamily:'inherit'}}>
        {label}
      </button>
      <button onClick={onCancel} style={{padding:'9px 14px',background:D.bgMid,color:D.txtSec,border:`1px solid ${D.border}`,borderRadius:8,cursor:'pointer',fontFamily:'inherit'}}>
        Zrušit
      </button>
    </div>
  )
}

function StatRow({ label, value, color }: { label:string; value:string; color?:string }) {
  return (
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'5px 8px',background:'rgba(255,255,255,.03)',borderRadius:6}}>
      <span style={{fontSize:11,color:D.txtSec}}>{label}</span>
      <span style={{fontSize:11,fontWeight:600,color:color??D.txtPri,fontFamily:'monospace'}}>{value}</span>
    </div>
  )
}

function DocSection({ title, items }: { title:string; items:[string,string][] }) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{marginBottom:8}}>
      <button onClick={()=>setOpen(p=>!p)}
        style={{width:'100%',textAlign:'left',padding:'7px 10px',background:'rgba(255,255,255,.04)',border:`1px solid ${D.border}`,borderRadius:7,cursor:'pointer',fontFamily:'inherit',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <span style={{fontSize:11,fontWeight:700,color:D.txtPri}}>{title}</span>
        <span style={{color:D.txtSec,fontSize:12}}>{open?'▾':'▸'}</span>
      </button>
      {open&&(
        <div style={{marginTop:4,display:'flex',flexDirection:'column',gap:3}}>
          {items.map(([code,desc],i)=>(
            <div key={i} style={{padding:'5px 10px',background:'rgba(255,255,255,.02)',borderRadius:6,borderLeft:`2px solid rgba(255,255,255,.08)`}}>
              <div style={{fontFamily:'monospace',fontSize:10,color:'#7dd3fc',marginBottom:2}}>{code}</div>
              <div style={{fontSize:10,color:D.txtSec}}>{desc}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ColorPicker({ onInsert }: { onInsert:(rgb:number[],name:string)=>void }) {
  const [r,setR] = useState(128); const [g,setG] = useState(128); const [b,setB] = useState(128)
  return (
    <div style={{background:'rgba(255,255,255,.03)',borderRadius:8,padding:10,border:`1px solid ${D.border}`}}>
      <div style={{width:'100%',height:36,borderRadius:6,background:`rgb(${r},${g},${b})`,marginBottom:10,border:'1px solid rgba(255,255,255,.1)'}}/>
      {([['R',r,setR,'#ef4444'],['G',g,setG,'#22c55e'],['B',b,setB,'#3b82f6']] as [string,number,any,string][]).map(([label,val,setter,col])=>(
        <div key={label} style={{display:'flex',alignItems:'center',gap:8,marginBottom:6}}>
          <span style={{fontSize:10,fontWeight:700,color:col,width:12}}>{label}</span>
          <input type="range" min={0} max={255} value={val} onChange={e=>setter(Number(e.target.value))}
            style={{flex:1,accentColor:col,height:4}}/>
          <span style={{fontSize:10,fontFamily:'monospace',color:D.txtSec,width:28,textAlign:'right'}}>{val}</span>
        </div>
      ))}
      <button onClick={()=>onInsert([r,g,b],'CUSTOM')}
        style={{width:'100%',marginTop:4,padding:'6px',background:'rgba(255,255,255,.08)',color:D.txtPri,border:`1px solid ${D.border}`,borderRadius:6,cursor:'pointer',fontFamily:'inherit',fontSize:11}}>
        Vložit ({r}, {g}, {b})
      </button>
    </div>
  )
}

const minpStyle: React.CSSProperties = {
  width:'100%', padding:'10px 12px', background:D.bgMid,
  border:`1px solid ${D.border}`, borderRadius:8, fontSize:13, color:D.txtPri,
  fontFamily:'inherit', outline:'none', boxSizing:'border-box', marginBottom:12,
}
