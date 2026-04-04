'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { DarkLayout, D } from '@/components/DarkLayout'

// ── Constants ─────────────────────────────────────────────────────────────────
const BUCKET = 'microbit-files'
const DEFAULT_PROJ = 'Vychozi'
const LS_LAST = 'cb_mb_last'

const DEFAULT_CODE = `# micro:bit MicroPython
from microbit import *

display.scroll("Ahoj!")

while True:
    if button_a.is_pressed():
        display.show(Image.HAPPY)
    elif button_b.is_pressed():
        display.show(Image.SAD)
    else:
        display.clear()
    sleep(100)
`

function sanitize(s: string) {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9._-]/g,'_').replace(/_+/g,'_').replace(/^_|_$/g,'') || 'soubor'
}
function fp(uid: string, proj: string, name: string) {
  return `zaci/${uid}/${sanitize(proj)}/${sanitize(name)}`
}

// ── Types ─────────────────────────────────────────────────────────────────────
interface MbFile { path: string; name: string; project: string; updatedAt: string }
interface Project { name: string; files: MbFile[] }

// ── micro:bit Simulator ───────────────────────────────────────────────────────
// LED brightness 0-9 → pixel color
function ledColor(val: number, accent: string): string {
  if (val === 0) return '#0a0a0a'
  const alpha = val / 9
  // Parse accent hex to rgb
  const r = parseInt(accent.slice(1,3)||'ff',16)
  const g = parseInt(accent.slice(3,5)||'00',16)
  const b = parseInt(accent.slice(5,7)||'00',16)
  return `rgba(${r},${g},${b},${alpha})`
}

// Built-in micro:bit images
const MB_IMAGES: Record<string, number[][]> = {
  HAPPY: [
    [0,0,0,0,0],[0,1,0,1,0],[0,0,0,0,0],[1,0,0,0,1],[0,1,1,1,0]
  ],
  SAD: [
    [0,0,0,0,0],[0,1,0,1,0],[0,0,0,0,0],[0,1,1,1,0],[1,0,0,0,1]
  ],
  HEART: [
    [0,1,0,1,0],[1,1,1,1,1],[1,1,1,1,1],[0,1,1,1,0],[0,0,1,0,0]
  ],
  YES: [
    [0,0,0,0,1],[0,0,0,1,0],[0,0,1,0,0],[1,0,1,0,0],[0,1,0,0,0]
  ],
  NO: [
    [1,0,0,0,1],[0,1,0,1,0],[0,0,1,0,0],[0,1,0,1,0],[1,0,0,0,1]
  ],
  ARROW_N: [
    [0,0,1,0,0],[0,1,1,1,0],[1,0,1,0,1],[0,0,1,0,0],[0,0,1,0,0]
  ],
  ARROW_E: [
    [0,0,1,0,0],[0,0,0,1,0],[1,1,1,1,1],[0,0,0,1,0],[0,0,1,0,0]
  ],
  CONFUSED: [
    [0,0,0,0,0],[0,1,0,1,0],[0,0,0,0,0],[0,0,1,0,0],[0,1,0,1,0]
  ],
  ASLEEP: [
    [0,0,0,0,0],[1,1,0,1,1],[0,0,0,0,0],[0,1,1,1,0],[0,0,0,0,0]
  ],
  SURPRISED: [
    [0,1,0,1,0],[0,0,0,0,0],[0,0,1,0,0],[0,1,0,1,0],[0,0,1,0,0]
  ],
  SKULL: [
    [0,1,1,1,0],[1,0,1,0,1],[1,1,1,1,1],[0,1,0,1,0],[0,1,1,1,0]
  ],
  MUSIC_CROTCHET: [
    [0,0,1,1,0],[0,0,1,1,0],[0,0,1,0,0],[1,1,1,0,0],[1,1,1,0,0]
  ],
  DIAMOND: [
    [0,0,1,0,0],[0,1,0,1,0],[1,0,0,0,1],[0,1,0,1,0],[0,0,1,0,0]
  ],
  CHESSBOARD: [
    [1,0,1,0,1],[0,1,0,1,0],[1,0,1,0,1],[0,1,0,1,0],[1,0,1,0,1]
  ],
  ALL_CLOCKS: Array(5).fill(Array(5).fill(1)),
}

// Simple MicroPython simulator — interprets a subset of micro:bit API
class MbSim {
  display: number[][] = Array(5).fill(null).map(()=>Array(5).fill(0))
  buttonA = false
  buttonB = false
  serialOut: string[] = []
  temperature = 21
  accelerometer = { x:0, y:0, z:-1024 }
  compass = 0
  running = false
  private scrollQueue: string[] = []
  private frameCallback: ((d: number[][], log: string[])=>void) | null = null
  private stopFlag = false
  private sleepMs = 0

  onFrame(cb: (d: number[][], log: string[])=>void) { this.frameCallback = cb }

  private emit() { this.frameCallback?.(this.display.map(r=>[...r]), [...this.serialOut]) }

  private setPixel(x: number, y: number, b: number) {
    if(x>=0&&x<5&&y>=0&&y<5) this.display[y][x]=Math.max(0,Math.min(9,b))
  }

  private showImage(img: number[][]) {
    for(let y=0;y<5;y++) for(let x=0;x<5;x++) this.display[y][x]=(img[y]?.[x]??0)*9
    this.emit()
  }

  private clearDisplay() { this.display=Array(5).fill(null).map(()=>Array(5).fill(0)); this.emit() }

  // Interpret a simplified subset of MicroPython micro:bit code
  async run(code: string, onFrame: (d:number[][],log:string[])=>void) {
    this.frameCallback = onFrame
    this.running = true
    this.stopFlag = false
    this.serialOut = []
    this.clearDisplay()

    const sim = this
    let lastYield = Date.now()

    // Yield to browser every 16ms minimum — prevents UI freeze
    const yieldToBrowser = () => new Promise<void>(r => setTimeout(r, 0))

    const delay = async (ms: number) => {
      if (sim.stopFlag) throw new Error('__STOPPED__')
      const end = Date.now() + Math.min(ms, 5000)
      while (Date.now() < end) {
        if (sim.stopFlag) throw new Error('__STOPPED__')
        const remaining = end - Date.now()
        await new Promise<void>(r => setTimeout(r, Math.min(remaining, 50)))
      }
    }

    // Wrap while(true) loops: check stopFlag + yield each iteration
    const checkStop = async () => {
      if (sim.stopFlag) throw new Error('__STOPPED__')
      const now = Date.now()
      if (now - lastYield > 16) {
        lastYield = now
        await yieldToBrowser()
      }
    }

    const ImageObj: any = { ...MB_IMAGES }
    for(const k of Object.keys(MB_IMAGES)) ImageObj[k] = k

    const context = {
      display: {
        scroll: async (text: string, delay_ms=150) => {
          if (sim.stopFlag) throw new Error('__STOPPED__')
          sim.serialOut.push(`[scroll] ${text}`)
          const msg = String(text)
          for(let i=0;i<msg.length;i++){
            if (sim.stopFlag) throw new Error('__STOPPED__')
            sim.clearDisplay()
            const charMap = getCharMap(msg[i])
            for(let y=0;y<5;y++) for(let x=0;x<5;x++) sim.display[y][x]=(charMap[y]?.[x]??0)*9
            sim.emit()
            await delay(delay_ms)
          }
          sim.clearDisplay()
        },
        show: async (img: any, delay_ms=400) => {
          if (sim.stopFlag) throw new Error('__STOPPED__')
          const digitMaps: Record<number,number[][]> = {
            0:[[1,1,1,1,0],[1,0,0,1,0],[1,0,0,1,0],[1,0,0,1,0],[1,1,1,1,0]],
            1:[[0,0,1,0,0],[0,1,1,0,0],[0,0,1,0,0],[0,0,1,0,0],[0,1,1,1,0]],
            2:[[1,1,1,0,0],[0,0,0,1,0],[0,1,1,0,0],[1,0,0,0,0],[1,1,1,1,0]],
            3:[[1,1,1,0,0],[0,0,0,1,0],[0,1,1,0,0],[0,0,0,1,0],[1,1,1,0,0]],
            4:[[1,0,0,1,0],[1,0,0,1,0],[1,1,1,1,0],[0,0,0,1,0],[0,0,0,1,0]],
            5:[[1,1,1,1,0],[1,0,0,0,0],[1,1,1,0,0],[0,0,0,1,0],[1,1,1,0,0]],
            6:[[0,1,1,1,0],[1,0,0,0,0],[1,1,1,1,0],[1,0,0,1,0],[0,1,1,1,0]],
            7:[[1,1,1,1,0],[0,0,0,1,0],[0,0,1,0,0],[0,1,0,0,0],[0,1,0,0,0]],
            8:[[0,1,1,0,0],[1,0,0,1,0],[0,1,1,0,0],[1,0,0,1,0],[0,1,1,0,0]],
            9:[[0,1,1,0,0],[1,0,0,1,0],[0,1,1,1,0],[0,0,0,1,0],[0,1,1,0,0]],
          }
          if (typeof img === 'string') {
            // String key like "HAPPY" or single character
            const imgData = MB_IMAGES[img]
            if (imgData) {
              sim.showImage(imgData)
            } else if (img.length === 1) {
              // Single character — use getCharMap
              const charMap = getCharMap(img)
              for(let y=0;y<5;y++) for(let x=0;x<5;x++) sim.display[y][x]=(charMap[y]?.[x]??0)*9
              sim.emit()
            }
          } else if (typeof img === 'number') {
            const m = digitMaps[img] ?? digitMaps[0]
            for(let y=0;y<5;y++) for(let x=0;x<5;x++) sim.display[y][x]=(m[y]?.[x]??0)*9
            sim.emit()
          }
          // Small delay so image is visible before next instruction
          await delay(50)
        },
        clear: () => { if(!sim.stopFlag) sim.clearDisplay() },
        set_pixel: (x:number,y:number,b:number) => { if(!sim.stopFlag){ sim.setPixel(x,y,b); sim.emit() } },
        get_pixel: (x:number,y:number) => sim.display[y]?.[x]??0,
      },
      button_a: { is_pressed: ()=>sim.buttonA, was_pressed: ()=>sim.buttonA, get_presses: ()=>sim.buttonA?1:0 },
      button_b: { is_pressed: ()=>sim.buttonB, was_pressed: ()=>sim.buttonB, get_presses: ()=>sim.buttonB?1:0 },
      pin_logo: { is_touched: ()=>sim.pinLogo, read_digital: ()=>sim.pinLogo?1:0 },
      // sleep MUST be awaited — transpiler adds 'await' prefix automatically
      sleep: delay,
      // __chk is injected into while loops by transpiler to allow stopping + yielding
      __chk: checkStop,
      running_time: () => Date.now(),
      temperature: () => sim.temperature,
      print: (...args: any[]) => { const msg=args.map(String).join(' '); sim.serialOut.push(msg); sim.emit() },
      Image: ImageObj,
      accelerometer: {
        get_x: () => sim.accelerometer.x,
        get_y: () => sim.accelerometer.y,
        get_z: () => sim.accelerometer.z,
        get_values: () => ({ x: sim.accelerometer.x, y: sim.accelerometer.y, z: sim.accelerometer.z }),
        current_gesture: () => 'still',
      },
      compass: {
        heading: () => sim.compass,
        calibrate: async () => { sim.serialOut.push('[compass] calibrating...'); sim.emit() },
      },
      True: true, False: false, None: null,
      range: (start: number, stop?: number, step=1) => {
        if(stop===undefined){stop=start;start=0}
        const arr=[];let i=start;while(step>0?i<stop!:i>stop!){arr.push(i);i+=step}; return arr
      },
      len: (x: any) => x?.length??0,
      str: (x: any) => String(x),
      int: (x: any) => parseInt(x),
      abs: Math.abs, min: Math.min, max: Math.max,
    }

    try {
      const js = transpileMicroPython(code, context)
      const fn = new Function(...Object.keys(context), js)
      await fn(...Object.values(context))
    } catch(e: any) {
      if (e.message !== '__STOPPED__') {
        sim.serialOut.push(`❌ Chyba: ${e.message}`)
        sim.emit()
      }
    }
    sim.running = false
    this.emit()
  }

  stop() { this.stopFlag = true; this.running = false }
  pressA(down: boolean) { this.buttonA = down }
  pressB(down: boolean) { this.buttonB = down }
  pinLogo = false
  pressLogo(down: boolean) { this.pinLogo = down }
  setAccel(x:number,y:number,z:number) { this.accelerometer={x,y,z} }
  setTemp(t:number) { this.temperature=t }
}

// Char maps — 5 columns wide for proper micro:bit display
function getCharMap(ch: string): number[][] {
  const maps: Record<string,number[][]> = {
    'A':[[0,1,1,0,0],[1,0,0,1,0],[1,1,1,1,0],[1,0,0,1,0],[1,0,0,1,0]],
    'B':[[1,1,1,0,0],[1,0,0,1,0],[1,1,1,0,0],[1,0,0,1,0],[1,1,1,0,0]],
    'C':[[0,1,1,1,0],[1,0,0,0,0],[1,0,0,0,0],[1,0,0,0,0],[0,1,1,1,0]],
    'D':[[1,1,1,0,0],[1,0,0,1,0],[1,0,0,1,0],[1,0,0,1,0],[1,1,1,0,0]],
    'E':[[1,1,1,1,0],[1,0,0,0,0],[1,1,1,0,0],[1,0,0,0,0],[1,1,1,1,0]],
    'H':[[1,0,0,1,0],[1,0,0,1,0],[1,1,1,1,0],[1,0,0,1,0],[1,0,0,1,0]],
    'I':[[1,1,1,0,0],[0,1,0,0,0],[0,1,0,0,0],[0,1,0,0,0],[1,1,1,0,0]],
    'J':[[0,0,1,1,0],[0,0,0,1,0],[0,0,0,1,0],[1,0,0,1,0],[0,1,1,0,0]],
    'O':[[0,1,1,0,0],[1,0,0,1,0],[1,0,0,1,0],[1,0,0,1,0],[0,1,1,0,0]],
    'K':[[1,0,0,1,0],[1,0,1,0,0],[1,1,0,0,0],[1,0,1,0,0],[1,0,0,1,0]],
    'L':[[1,0,0,0,0],[1,0,0,0,0],[1,0,0,0,0],[1,0,0,0,0],[1,1,1,1,0]],
    'M':[[1,0,0,0,1],[1,1,0,1,1],[1,0,1,0,1],[1,0,0,0,1],[1,0,0,0,1]],
    'N':[[1,0,0,0,1],[1,1,0,0,1],[1,0,1,0,1],[1,0,0,1,1],[1,0,0,0,1]],
    'P':[[1,1,1,0,0],[1,0,0,1,0],[1,1,1,0,0],[1,0,0,0,0],[1,0,0,0,0]],
    'R':[[1,1,1,0,0],[1,0,0,1,0],[1,1,1,0,0],[1,0,1,0,0],[1,0,0,1,0]],
    'S':[[0,1,1,1,0],[1,0,0,0,0],[0,1,1,0,0],[0,0,0,1,0],[1,1,1,0,0]],
    'T':[[1,1,1,1,1],[0,0,1,0,0],[0,0,1,0,0],[0,0,1,0,0],[0,0,1,0,0]],
    'U':[[1,0,0,1,0],[1,0,0,1,0],[1,0,0,1,0],[1,0,0,1,0],[0,1,1,0,0]],
    'V':[[1,0,0,0,1],[1,0,0,0,1],[0,1,0,1,0],[0,1,0,1,0],[0,0,1,0,0]],
    'W':[[1,0,0,0,1],[1,0,0,0,1],[1,0,1,0,1],[1,1,0,1,1],[1,0,0,0,1]],
    'X':[[1,0,0,0,1],[0,1,0,1,0],[0,0,1,0,0],[0,1,0,1,0],[1,0,0,0,1]],
    'Y':[[1,0,0,0,1],[0,1,0,1,0],[0,0,1,0,0],[0,0,1,0,0],[0,0,1,0,0]],
    'Z':[[1,1,1,1,0],[0,0,0,1,0],[0,0,1,0,0],[0,1,0,0,0],[1,1,1,1,0]],
    '!':[[0,1,0,0,0],[0,1,0,0,0],[0,1,0,0,0],[0,0,0,0,0],[0,1,0,0,0]],
    '?':[[0,1,1,0,0],[1,0,0,1,0],[0,0,1,0,0],[0,0,0,0,0],[0,0,1,0,0]],
    ' ':[[0,0,0,0,0],[0,0,0,0,0],[0,0,0,0,0],[0,0,0,0,0],[0,0,0,0,0]],
  }
  return maps[ch.toUpperCase()] ?? maps[' ']
}

// MicroPython → async JS transpiler
// Strategy: two passes.
// Pass 1: normalise indent to multiples of 4, tag each line with its indent level.
// Pass 2: emit JS, inserting closing braces when indent decreases.
// Key: inject `await __chk()` as first statement in every while loop body
// so the browser can process events and we can stop the loop.
function transpileMicroPython(code: string, _ctx: any): string {
  function expr(s: string): string {
    return s
      .replace(/\bTrue\b/g,'true').replace(/\bFalse\b/g,'false').replace(/\bNone\b/g,'null')
      .replace(/\band\b/g,'&&').replace(/\bor\b/g,'||').replace(/\bnot\b/g,'!')
      .replace(/==\s*True\b/g,'=== true').replace(/==\s*False\b/g,'=== false')
  }

  const raw = code.split('\n')
  interface Ln { indent: number; text: string }
  const lns: Ln[] = []
  for (const r of raw) {
    const t = r.trimStart()
    if (!t || t.startsWith('#')) continue
    if (t.startsWith('from microbit') || t.startsWith('import ')) continue
    lns.push({ indent: r.length - t.length, text: t })
  }

  const out: string[] = ['(async()=>{']
  const stack: number[] = []
  // Track whether the next line is the first inside a while loop body
  const whileIndents = new Set<number>()

  function closeUntil(targetIndent: number, isElseKind = false) {
    while (stack.length > 0) {
      const top = stack[stack.length - 1]
      if (top > targetIndent) {
        stack.pop()
        whileIndents.delete(top)
        out.push('  '.repeat(stack.length + 1) + '}')
      } else if (isElseKind && top === targetIndent) {
        stack.pop()
        whileIndents.delete(top)
        break
      } else {
        break
      }
    }
  }

  for (let i = 0; i < lns.length; i++) {
    const { indent, text } = lns[i]
    const isElse = text === 'else:'
    const isElif = text.startsWith('elif ')
    const isWhile = text.startsWith('while ')

    closeUntil(indent, isElse || isElif)

    const depth = stack.length + 1
    const pad = '  '.repeat(depth)

    let line = text
      .replace(/^while True:$/,  'while(true){')
      .replace(/^while False:$/, 'while(false){')
      .replace(/^while (.+):$/,  (_,c) => `while(${expr(c)}){`)
      .replace(/^if (.+):$/,     (_,c) => `if(${expr(c)}){`)
      .replace(/^elif (.+):$/,   (_,c) => `} else if(${expr(c)}){`)
      .replace(/^else:$/,        '} else {')
      .replace(/^for (\w+) in range\((.+)\):$/, (_,v,a) => `for(const ${v} of range(${a})){`)
      .replace(/^for (\w+) in (.+):$/,          (_,v,it) => `for(const ${v} of ${expr(it)}){`)
      .replace(/^def (\w+)\(([^)]*)\):$/,       (_,n,a) => `async function ${n}(${a}){`)
      .replace(/\bTrue\b/g,'true').replace(/\bFalse\b/g,'false').replace(/\bNone\b/g,'null')
      .replace(/\band\b/g,'&&').replace(/\bor\b/g,'||').replace(/\bnot\b/g,'!')
      .replace(/\bsleep\(/g, 'await sleep(')
      .replace(/^pass$/, '/* pass */')

    // Add await to display/compass
    if (!line.startsWith('await ') && !line.startsWith('}') && (
      line.includes('display.scroll(') || line.includes('display.show(') || line.includes('compass.calibrate()')
    )) line = 'await ' + line

    const opensBlock = line.endsWith('{')
    const closesBlock = line.startsWith('}')
    if (!opensBlock && !closesBlock && line.trim() && !line.endsWith(';')) line += ';'

    out.push(pad + line)

    if (opensBlock) {
      const newIndent = indent + 4
      if (!isElse && !isElif) {
        stack.push(indent)
      } else {
        stack.push(indent)
      }
      // If this was a while loop, inject __chk() as first statement in the body
      if (isWhile || line.startsWith('while(')) {
        out.push('  '.repeat(depth + 1) + 'await __chk();')
      }
    }
  }

  while (stack.length > 0) {
    stack.pop()
    out.push('  '.repeat(stack.length + 1) + '}')
  }

  out.push('})();')
  return out.join('\n')
}


// ── Main Editor Component ─────────────────────────────────────────────────────
export default function MicrobitEditor({ profile }: { profile: any }) {
  const supabase = createClient()
  const accent = profile?.accent_color ?? '#7C3AED'
  const uid = profile?.id as string

  // ── File state ─────────────────────────────────────────────────────────────
  const [projects, setProjects]     = useState<Project[]>([])
  const [loadingProj, setLP]        = useState(true)
  const [activeFile, setActiveFile] = useState<MbFile | null>(null)
  const [isDirty, setIsDirty]       = useState(false)
  const [expanded, setExpanded]     = useState<Set<string>>(new Set([DEFAULT_PROJ]))
  const [saving, setSaving]         = useState(false)
  const [saveMsg, setSaveMsg]       = useState('')

  // ── Editor state ───────────────────────────────────────────────────────────
  const [code, setCode]             = useState('')
  const codeRef = useRef('')
  const editorRef = useRef<any>(null)
  const monacoRef = useRef<any>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [monacoReady, setMonacoReady] = useState(false)

  // ── Simulator state ────────────────────────────────────────────────────────
  const simRef = useRef<MbSim>(new MbSim())
  const [simDisplay, setSimDisplay] = useState<number[][]>(Array(5).fill(null).map(()=>Array(5).fill(0)))
  const [simLog, setSimLog]         = useState<string[]>([])
  const [simRunning, setSimRunning] = useState(false)
  const [simTab, setSimTab]         = useState<'display'|'log'|'sensors'>('display')
  const [btnADown, setBtnADown]     = useState(false)
  const [btnBDown, setBtnBDown]     = useState(false)
  const [simTemp, setSimTemp]       = useState(21)
  const [simAccelX, setSimAccelX]   = useState(0)
  const [simAccelY, setSimAccelY]   = useState(0)

  // ── Web Serial state ───────────────────────────────────────────────────────
  const [serialConnected, setSerialConnected] = useState(false)
  const [serialStatus, setSerialStatus]       = useState('')
  const [flashMsg, setFlashMsg]               = useState('')
  const [flashing, setFlashing]               = useState(false)
  const serialPortRef = useRef<any>(null)

  // ── Modals ─────────────────────────────────────────────────────────────────
  const [nfm, setNFM] = useState(false); const [nfn, setNFN] = useState(''); const [nfp, setNFP] = useState(DEFAULT_PROJ)
  const [npm, setNPM] = useState(false); const [npn, setNPN] = useState('')
  const [dfm, setDFM] = useState<MbFile | null>(null)
  const [dpm, setDPM] = useState<string | null>(null)
  const [rfm, setRFM] = useState<MbFile | null>(null); const [rfv, setRFV] = useState('')
  const [rpm, setRPM] = useState<string | null>(null); const [rpv, setRPV] = useState('')

  // ── Storage ────────────────────────────────────────────────────────────────
  async function push(path: string, content: string) {
    const blob = new Blob([content], { type: 'text/plain' })
    // Try upsert first
    const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
      contentType: 'text/plain',
      upsert: true,
      cacheControl: '0',
    })
    if (error) {
      // Fallback: remove then re-upload
      await supabase.storage.from(BUCKET).remove([path])
      const { error: e2 } = await supabase.storage.from(BUCKET).upload(path, blob, {
        contentType: 'text/plain',
        cacheControl: '0',
      })
      return e2?.message ?? null
    }
    return null
  }
  async function pull(path: string) {
    const { data, error } = await supabase.storage.from(BUCKET).download(path)
    if (error || !data) return DEFAULT_CODE
    return data.text()
  }

  // ── Projects ───────────────────────────────────────────────────────────────
  const refresh = useCallback(async () => {
    setLP(true)
    const { data: top } = await supabase.storage.from(BUCKET).list(`zaci/${uid}`, { limit: 200, sortBy: { column: 'name', order: 'asc' } })
    if (!top) { setLP(false); return }
    const res: Project[] = []
    for (const item of top) {
      if (item.metadata != null) continue
      const { data: files } = await supabase.storage.from(BUCKET).list(`zaci/${uid}/${item.name}`, { limit: 200 })
      res.push({ name: item.name, files: (files ?? []).filter(f => f.name !== '.gitkeep' && f.metadata != null).map(f => ({
        path: `zaci/${uid}/${item.name}/${f.name}`, name: f.name, project: item.name, updatedAt: f.updated_at ?? ''
      })) })
    }
    if (res.length === 0) {
      // First time: create default project
      const blob = new Blob([DEFAULT_CODE], { type: 'text/plain' })
      const defaultPath = fp(uid, DEFAULT_PROJ, 'main.py')
      await supabase.storage.from(BUCKET).remove([defaultPath])
      await supabase.storage.from(BUCKET).upload(defaultPath, blob, { cacheControl: '0' })
      // Reload after creating
      const { data: top2 } = await supabase.storage.from(BUCKET).list(`zaci/${uid}`, { limit: 200, sortBy: { column: 'name', order: 'asc' } })
      if (top2) {
        for (const item of top2) {
          if (item.metadata != null) continue
          const { data: files2 } = await supabase.storage.from(BUCKET).list(`zaci/${uid}/${item.name}`, { limit: 200 })
          res.push({ name: item.name, files: (files2 ?? []).filter(f => f.name !== '.gitkeep' && f.metadata != null).map(f => ({
            path: `zaci/${uid}/${item.name}/${f.name}`, name: f.name, project: item.name, updatedAt: f.updated_at ?? ''
          })) })
        }
      }
    }
    setProjects(res)
    setNFP(res[0]?.name ?? DEFAULT_PROJ)
    setLP(false)
  }, [uid])
  useEffect(() => { refresh() }, [refresh])

  async function openFile(file: MbFile) {
    if (isDirty && !confirm('Neuložené změny budou ztraceny.')) return
    const content = await pull(file.path)
    setCode(content); codeRef.current = content
    if (editorRef.current) editorRef.current.setValue(content)
    setActiveFile(file); setIsDirty(false)
    localStorage.setItem(LS_LAST, JSON.stringify(file))
  }
  async function save() {
    if (!activeFile) { setNFM(true); return }
    setSaving(true)
    const err = await push(activeFile.path, code)
    setSaving(false)
    if (err) { setSaveMsg('❌ ' + err); return }
    setIsDirty(false); setSaveMsg('✓ Uloženo'); setTimeout(() => setSaveMsg(''), 2500)
    await refresh()
  }
  async function createFile() {
    const name = (nfn.trim() || 'main').replace(/\.py$/, '') + '.py'
    const proj = nfp || DEFAULT_PROJ
    const path = fp(uid, proj, name)
    const err = await push(path, DEFAULT_CODE)
    setNFM(false); setNFN('')
    if (err) { setSaveMsg('❌ ' + err); return }
    // Immediately show the new file in editor
    const file: MbFile = { path, name, project: proj, updatedAt: new Date().toISOString() }
    setCode(DEFAULT_CODE); codeRef.current = DEFAULT_CODE
    setActiveFile(file)
    setIsDirty(false)
    localStorage.setItem(LS_LAST, JSON.stringify(file))
    setExpanded(prev => new Set([...prev, proj]))
    await refresh()
  }
  async function createProject() {
    const name = npn.trim() || 'Projekt'
    const path = fp(uid, name, 'main.py')
    const err = await push(path, DEFAULT_CODE)
    setNPM(false); setNPN('')
    if (!err) {
      const file: MbFile = { path, name: 'main.py', project: name, updatedAt: new Date().toISOString() }
      setCode(DEFAULT_CODE); codeRef.current = DEFAULT_CODE
      setActiveFile(file)
      setIsDirty(false)
      setExpanded(prev => new Set([...prev, name]))
    }
    await refresh()
  }
  async function deleteFile(file: MbFile) {
    await supabase.storage.from(BUCKET).remove([file.path])
    if (activeFile?.path === file.path) { setCode(DEFAULT_CODE); setActiveFile(null) }
    setDFM(null); await refresh()
  }
  async function deleteProject(name: string) {
    const proj = projects.find(p => p.name === name)
    const paths = proj?.files.map(f => f.path) ?? []
    if (paths.length) await supabase.storage.from(BUCKET).remove(paths)
    if (activeFile?.project === name) { setCode(DEFAULT_CODE); setActiveFile(null) }
    setDPM(null); await refresh()
  }
  async function renameFile(file: MbFile, newName: string) {
    if (!newName.trim() || newName === file.name) return
    const fname = newName.trim().endsWith('.py') ? newName.trim() : newName.trim() + '.py'
    const newPath = `zaci/${uid}/${sanitize(file.project)}/${sanitize(fname)}`
    const cur = await pull(file.path)
    await push(newPath, cur)
    await supabase.storage.from(BUCKET).remove([file.path])
    if (activeFile?.path === file.path) setActiveFile({ ...file, path: newPath, name: fname })
    setRFM(null); await refresh()
  }
  async function renameProject(oldName: string, newName: string) {
    if (!newName.trim() || newName === oldName) return
    const proj = projects.find(p => p.name === oldName); if (!proj) return
    for (const file of proj.files) {
      const cur = await pull(file.path)
      const newPath = `zaci/${uid}/${sanitize(newName)}/${sanitize(file.name)}`
      await push(newPath, cur)
      await supabase.storage.from(BUCKET).remove([file.path])
      if (activeFile?.path === file.path) setActiveFile({ ...activeFile, path: newPath, project: newName })
    }
    setRPM(null); setExpanded(prev => { const n = new Set(prev); n.delete(oldName); n.add(newName); return n })
    await refresh()
  }

  useEffect(() => { codeRef.current = code }, [code])

  // ── Monaco Editor ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return
    let cancelled = false

    async function loadMonaco() {
      const monaco = await import('@monaco-editor/react').then(m => m.default)
      if (cancelled) return
      setMonacoReady(true)
    }
    loadMonaco()
    return () => { cancelled = true }
  }, [])

  // micro:bit autocomplete suggestions
  const MB_COMPLETIONS = [
    // display
    { label:'display.scroll', kind:'Method', insert:'display.scroll(${1:text})', doc:'Scrolls text across the display' },
    { label:'display.show', kind:'Method', insert:'display.show(${1:image})', doc:'Shows image or character' },
    { label:'display.clear', kind:'Method', insert:'display.clear()', doc:'Clears the display' },
    { label:'display.set_pixel', kind:'Method', insert:'display.set_pixel(${1:x}, ${2:y}, ${3:brightness})', doc:'Set pixel brightness 0-9' },
    { label:'display.get_pixel', kind:'Method', insert:'display.get_pixel(${1:x}, ${2:y})', doc:'Get pixel brightness' },
    // buttons
    { label:'button_a.is_pressed', kind:'Method', insert:'button_a.is_pressed()', doc:'Returns True if button A is pressed' },
    { label:'button_b.is_pressed', kind:'Method', insert:'button_b.is_pressed()', doc:'Returns True if button B is pressed' },
    { label:'button_a.was_pressed', kind:'Method', insert:'button_a.was_pressed()', doc:'Returns True if button A was pressed since last call' },
    { label:'button_b.was_pressed', kind:'Method', insert:'button_b.was_pressed()', doc:'Returns True if button B was pressed since last call' },
    // accelerometer
    { label:'accelerometer.get_x', kind:'Method', insert:'accelerometer.get_x()', doc:'Returns x acceleration in milli-g' },
    { label:'accelerometer.get_y', kind:'Method', insert:'accelerometer.get_y()', doc:'Returns y acceleration' },
    { label:'accelerometer.get_z', kind:'Method', insert:'accelerometer.get_z()', doc:'Returns z acceleration' },
    { label:'accelerometer.current_gesture', kind:'Method', insert:'accelerometer.current_gesture()', doc:'Returns gesture: shake, tilt_left, tilt_right, face_up, face_down, freefall' },
    // compass
    { label:'compass.heading', kind:'Method', insert:'compass.heading()', doc:'Returns compass heading 0-360' },
    { label:'compass.calibrate', kind:'Method', insert:'compass.calibrate()', doc:'Calibrate compass' },
    // misc
    { label:'sleep', kind:'Function', insert:'sleep(${1:ms})', doc:'Sleep for ms milliseconds' },
    { label:'running_time', kind:'Function', insert:'running_time()', doc:'Returns time since start in ms' },
    { label:'temperature', kind:'Function', insert:'temperature()', doc:'Returns temperature in °C' },
    // Images
    { label:'Image.HAPPY', kind:'Constant', insert:'Image.HAPPY', doc:'Happy face image' },
    { label:'Image.SAD', kind:'Constant', insert:'Image.SAD', doc:'Sad face image' },
    { label:'Image.HEART', kind:'Constant', insert:'Image.HEART', doc:'Heart image' },
    { label:'Image.YES', kind:'Constant', insert:'Image.YES', doc:'Tick/yes image' },
    { label:'Image.NO', kind:'Constant', insert:'Image.NO', doc:'X/no image' },
    { label:'Image.ARROW_N', kind:'Constant', insert:'Image.ARROW_N', doc:'North arrow' },
    { label:'Image.ARROW_E', kind:'Constant', insert:'Image.ARROW_E', doc:'East arrow' },
    { label:'Image.SKULL', kind:'Constant', insert:'Image.SKULL', doc:'Skull image' },
    { label:'Image.CONFUSED', kind:'Constant', insert:'Image.CONFUSED', doc:'Confused face' },
    { label:'Image.ASLEEP', kind:'Constant', insert:'Image.ASLEEP', doc:'Sleeping face' },
    { label:'Image.SURPRISED', kind:'Constant', insert:'Image.SURPRISED', doc:'Surprised face' },
    { label:'Image.DIAMOND', kind:'Constant', insert:'Image.DIAMOND', doc:'Diamond shape' },
    { label:'Image.CHESSBOARD', kind:'Constant', insert:'Image.CHESSBOARD', doc:'Chessboard pattern' },
    // pin_logo
    { label:'pin_logo.is_touched', kind:'Method', insert:'pin_logo.is_touched()', doc:'Returns True if logo is being touched (micro:bit V2)' },
    { label:'pin_logo.read_digital', kind:'Method', insert:'pin_logo.read_digital()', doc:'Read logo pin as digital (0 or 1)' },
  ]

  // ── Simulator ──────────────────────────────────────────────────────────────
  function runSim() {
    const sim = simRef.current
    if (sim.running) { sim.stop(); setSimRunning(false); return }
    setSimLog([]); setSimRunning(true)
    sim.setTemp(simTemp)
    sim.setAccel(simAccelX, simAccelY, -1024)
    sim.pressA(btnADown); sim.pressB(btnBDown)
    const currentCode = codeRef.current || code
    if (!currentCode.trim()) { setSimLog(['⚠️ Otevři soubor nebo napiš kód.']); setSimRunning(false); return }
    sim.run(currentCode, (disp, log) => {
      setSimDisplay(disp.map(r => [...r]))
      setSimLog([...log])
    }).then(() => setSimRunning(false))
  }
  function stopSim() { simRef.current.stop(); setSimRunning(false) }

  const [logoDown, setLogoDown] = useState(false)

  function pressBtn(btn: 'a'|'b'|'logo', down: boolean) {
    if (btn === 'a') { setBtnADown(down); simRef.current.pressA(down) }
    else if (btn === 'b') { setBtnBDown(down); simRef.current.pressB(down) }
    else { setLogoDown(down); simRef.current.pressLogo(down) }
  }

  // ── Web Serial ─────────────────────────────────────────────────────────────
  const hasSerial = typeof navigator !== 'undefined' && 'serial' in navigator

  async function connectSerial() {
    if (!hasSerial) return
    try {
      setSerialStatus('Vybírám port…')
      const port = await (navigator as any).serial.requestPort({ filters: [{ usbVendorId: 0x0D28 }] })
      await port.open({ baudRate: 115200 })
      serialPortRef.current = port
      setSerialConnected(true); setSerialStatus('Připojeno ✓')
    } catch (e: any) {
      setSerialStatus('Chyba: ' + e.message)
    }
  }

  async function disconnectSerial() {
    try {
      await serialPortRef.current?.close()
      serialPortRef.current = null; setSerialConnected(false); setSerialStatus('Odpojeno')
    } catch {}
  }

  async function flashToDevice() {
    if (!serialPortRef.current) { setFlashMsg('Nejprve se připoj k zařízení'); return }
    setFlashing(true); setFlashMsg('Připravuji REPL…')
    try {
      const port = serialPortRef.current
      const enc = new TextEncoder()
      const dec = new TextDecoder()
      const flashCode = codeRef.current || code
      if (!flashCode.trim()) { setFlashMsg('⚠️ Žádný kód'); setFlashing(false); return }

      const delay = (ms: number) => new Promise(r => setTimeout(r, ms))

      // Read with timeout — returns what was received
      async function readFor(ms: number): Promise<string> {
        if (!port.readable) return ''
        const reader = port.readable.getReader()
        let result = ''
        const deadline = Date.now() + ms
        try {
          while (Date.now() < deadline) {
            const timeout = new Promise<{done:true,value:undefined}>(r =>
              setTimeout(() => r({done:true,value:undefined}), Math.min(50, deadline - Date.now()))
            )
            const {done, value} = await Promise.race([reader.read(), timeout])
            if (done || !value) break
            result += dec.decode(value)
          }
        } catch {}
        reader.releaseLock()
        return result
      }

      // Write helper
      async function write(s: string) {
        const writer = port.writable.getWriter()
        await writer.write(enc.encode(s))
        writer.releaseLock()
      }

      // Step 1: Interrupt running code (send Ctrl+C twice)
      setFlashMsg('Přerušuji program…')
      await write('\r\x03\x03')
      await readFor(600)

      // Step 2: Enter raw REPL mode
      setFlashMsg('Vstupuji do raw REPL…')
      await write('\x01')
      const rawResp = await readFor(800)
      if (!rawResp.includes('raw REPL')) {
        // Try soft-reset first, then raw REPL
        await write('\x04')  // soft reset
        await readFor(1500)
        await write('\x01')
        await readFor(600)
      }

      // Step 3: Send code in small chunks
      setFlashMsg('Odesílám kód…')
      const CHUNK = 64
      for (let i = 0; i < flashCode.length; i += CHUNK) {
        await write(flashCode.slice(i, i + CHUNK))
        await delay(40)
      }

      // Step 4: Execute with Ctrl+D
      setFlashMsg('Spouštím…')
      await write('\x04')
      const execResp = await readFor(2000)

      // Check for error in response
      if (execResp.includes('Error') || execResp.includes('Traceback')) {
        const errLine = execResp.split('\n').find(l => l.includes('Error')) ?? 'Chyba v kódu'
        setFlashMsg('❌ ' + errLine.trim())
      } else {
        setFlashMsg('✓ Kód běží na micro:bit!')
      }
    } catch (e: any) {
      setFlashMsg('❌ ' + e.message)
    }
    setFlashing(false)
    setTimeout(() => setFlashMsg(''), 6000)
  }

  function downloadCode() {
    const blob = new Blob([codeRef.current || code], { type: 'text/plain' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = activeFile?.name ?? 'microbit.py'
    a.click()
  }

  // ── Keyboard shortcuts ─────────────────────────────────────────────────────
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); save() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [code, activeFile])

  // ── Styles ─────────────────────────────────────────────────────────────────
  const inp: React.CSSProperties = { padding:'8px 11px', background:D.bgMid, border:`1px solid ${D.border}`, borderRadius:8, fontSize:13, color:D.txtPri, fontFamily:'inherit', outline:'none', width:'100%', boxSizing:'border-box' }
  const btn = (col=accent): React.CSSProperties => ({ padding:'8px 16px', background:col, color:'#fff', border:'none', borderRadius:8, cursor:'pointer', fontFamily:'inherit', fontWeight:600, fontSize:12 })
  const ghost: React.CSSProperties = { padding:'7px 12px', background:'rgba(255,255,255,.06)', border:'1px solid rgba(255,255,255,.1)', borderRadius:8, cursor:'pointer', fontFamily:'inherit', fontSize:12, color:'rgba(255,255,255,.6)', transition:'all .12s' }

  function Modal({ title, onClose, children }: { title:string; onClose:()=>void; children:React.ReactNode }) {
    return <>
      <div onClick={onClose} style={{ position:'fixed',inset:0,background:'rgba(0,0,0,.7)',zIndex:9998,backdropFilter:'blur(4px)' }}/>
      <div style={{ position:'fixed',top:'50%',left:'50%',transform:'translate(-50%,-50%)',zIndex:9999,width:'100%',maxWidth:440,padding:'0 16px' }}>
        <div style={{ background:D.bgCard,borderRadius:16,padding:'24px',border:`1px solid ${D.border}`,boxShadow:'0 24px 60px rgba(0,0,0,.7)' }}>
          <div style={{ fontSize:15,fontWeight:700,color:D.txtPri,marginBottom:14 }}>{title}</div>
          {children}
        </div>
      </div>
    </>
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <DarkLayout profile={profile} activeRoute="/student/microbit" fullContent>
      <style>{`
        .mb-btn:hover{background:rgba(255,255,255,.12)!important;color:#fff!important;}
        .mb-file-row{display:flex;align-items:center;padding:5px 12px 5px 26px;cursor:pointer;gap:5px;transition:background .1s;}
        .mb-file-row:hover{background:rgba(255,255,255,.05)!important;}
        .mb-led{border-radius:50%;transition:background .12s;cursor:default;}
        .mb-btn-device{width:100%;height:28px;border-radius:5px;border:2px solid rgba(255,255,255,.15);background:rgba(255,255,255,.08);cursor:pointer;font-size:11px;font-weight:700;color:rgba(255,255,255,.7);transition:all .12s;letter-spacing:.03em;}
        .mb-btn-device:active,.mb-btn-device.pressed{background:rgba(255,255,255,.25)!important;border-color:rgba(255,255,255,.4)!important;}
        .mb-tab{padding:5px 12px;border:none;background:transparent;cursor:pointer;font-size:11px;font-weight:600;color:rgba(255,255,255,.4);border-bottom:2px solid transparent;transition:all .12s;}
        .mb-tab.active{color:#fff;border-bottom-color:var(--accent);}
      `}</style>

      {/* Modals */}
      {nfm && <Modal title="📄 Nový soubor" onClose={()=>setNFM(false)}>
        <div style={{display:'flex',flexDirection:'column',gap:10}}>
          <div><div style={{fontSize:11,color:D.txtSec,marginBottom:4}}>Název souboru</div><input value={nfn} onChange={e=>setNFN(e.target.value)} onKeyDown={e=>e.key==='Enter'&&createFile()} placeholder="main" autoFocus style={inp}/></div>
          <div><div style={{fontSize:11,color:D.txtSec,marginBottom:4}}>Projekt</div><select value={nfp} onChange={e=>setNFP(e.target.value)} style={{...inp,cursor:'pointer'}}>{projects.map(p=><option key={p.name} value={p.name}>{p.name}</option>)}</select></div>
          <div style={{display:'flex',gap:8,marginTop:4}}>
            <button onClick={createFile} style={btn()}>Vytvořit</button>
            <button onClick={()=>setNFM(false)} style={ghost}>Zrušit</button>
          </div>
        </div>
      </Modal>}
      {npm && <Modal title="📁 Nový projekt" onClose={()=>setNPM(false)}>
        <input value={npn} onChange={e=>setNPN(e.target.value)} onKeyDown={e=>e.key==='Enter'&&createProject()} placeholder="Název projektu" autoFocus style={{...inp,marginBottom:12}}/>
        <div style={{display:'flex',gap:8}}><button onClick={createProject} style={btn()}>Vytvořit</button><button onClick={()=>setNPM(false)} style={ghost}>Zrušit</button></div>
      </Modal>}
      {dfm && <Modal title="🗑️ Smazat soubor" onClose={()=>setDFM(null)}>
        <p style={{fontSize:13,color:D.txtSec,marginBottom:14}}>Smazat <strong style={{color:D.txtPri}}>{dfm.name}</strong>?</p>
        <div style={{display:'flex',gap:8}}><button onClick={()=>deleteFile(dfm)} style={btn('#EF4444')}>Smazat</button><button onClick={()=>setDFM(null)} style={ghost}>Zrušit</button></div>
      </Modal>}
      {dpm && <Modal title="🗑️ Smazat projekt" onClose={()=>setDPM(null)}>
        <p style={{fontSize:13,color:D.txtSec,marginBottom:14}}>Smazat projekt <strong style={{color:D.txtPri}}>{dpm}</strong>?</p>
        <div style={{display:'flex',gap:8}}><button onClick={()=>deleteProject(dpm)} style={btn('#EF4444')}>Smazat</button><button onClick={()=>setDPM(null)} style={ghost}>Zrušit</button></div>
      </Modal>}
      {rfm && <Modal title="✏️ Přejmenovat soubor" onClose={()=>setRFM(null)}>
        <input value={rfv} onChange={e=>setRFV(e.target.value)} onKeyDown={e=>e.key==='Enter'&&renameFile(rfm,rfv)} autoFocus style={{...inp,marginBottom:12}}/>
        <div style={{display:'flex',gap:8}}><button onClick={()=>renameFile(rfm,rfv)} style={btn()}>Uložit</button><button onClick={()=>setRFM(null)} style={ghost}>Zrušit</button></div>
      </Modal>}
      {rpm && <Modal title="✏️ Přejmenovat projekt" onClose={()=>setRPM(null)}>
        <input value={rpv} onChange={e=>setRPV(e.target.value)} onKeyDown={e=>e.key==='Enter'&&renameProject(rpm,rpv)} autoFocus style={{...inp,marginBottom:12}}/>
        <div style={{display:'flex',gap:8}}><button onClick={()=>renameProject(rpm,rpv)} style={btn()}>Uložit</button><button onClick={()=>setRPM(null)} style={ghost}>Zrušit</button></div>
      </Modal>}

      <div style={{display:'flex',flex:1,minHeight:0,overflow:'hidden'}}>

        {/* ═══ LEFT PANEL ═══ */}
        <div style={{width:200,flexShrink:0,borderRight:`1px solid ${D.border}`,background:D.bgCard,display:'flex',flexDirection:'column',overflow:'hidden'}}>
          <div style={{padding:'12px 12px 10px',borderBottom:`1px solid ${D.border}`,flexShrink:0}}>
            <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:8}}>
              <span style={{fontSize:16}}>🔬</span>
              <span style={{fontSize:13,fontWeight:700,color:D.txtPri}}>micro:bit</span>
              {isDirty&&<span style={{fontSize:9,color:D.warning,marginLeft:'auto'}}>● neuloženo</span>}
            </div>
            <div style={{display:'flex',gap:5}}>
              <button onClick={()=>setNFM(true)} className="mb-btn" style={ghost}>+ Soubor</button>
              <button onClick={()=>setNPM(true)} className="mb-btn" style={ghost} title="Nový projekt">📁</button>
            </div>
          </div>

          <div style={{flex:1,overflowY:'auto',padding:'3px 0'}}>
            {loadingProj
              ? <div style={{padding:'20px',textAlign:'center',color:D.txtSec,fontSize:12}}>Načítám…</div>
              : projects.map(proj=>(
                <div key={proj.name}>
                  <div style={{display:'flex',alignItems:'center',gap:5,padding:'5px 11px',cursor:'pointer',fontSize:12,fontWeight:600,color:D.txtSec}}
                    onClick={()=>setExpanded(prev=>{const n=new Set(prev);n.has(proj.name)?n.delete(proj.name):n.add(proj.name);return n})}>
                    <span style={{fontSize:9}}>{expanded.has(proj.name)?'▼':'▶'}</span>
                    <span style={{flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>📁 {proj.name}</span>
                    <button onClick={e=>{e.stopPropagation();setRPM(proj.name);setRPV(proj.name)}} style={{background:'none',border:'none',cursor:'pointer',color:'rgba(255,255,255,.4)',fontSize:11,padding:'0 2px'}}>✏</button>
                    <button onClick={e=>{e.stopPropagation();setDPM(proj.name)}} style={{background:'none',border:'none',cursor:'pointer',color:D.danger,fontSize:11,padding:'0 2px',opacity:.5}}>🗑</button>
                  </div>
                  {expanded.has(proj.name)&&proj.files.map(file=>(
                    <div key={file.path} className="mb-file-row" style={{background:activeFile?.path===file.path?accent+'15':'transparent',borderLeft:`2px solid ${activeFile?.path===file.path?accent:'transparent'}`}}>
                      <span style={{fontSize:9}}>🐍</span>
                      <span onClick={()=>openFile(file)} style={{fontSize:11,color:activeFile?.path===file.path?D.txtPri:D.txtSec,flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{file.name}</span>
                      <button onClick={()=>{setRFM(file);setRFV(file.name.replace('.py',''))}} style={{background:'none',border:'none',cursor:'pointer',color:'rgba(255,255,255,.4)',fontSize:11,padding:'0 2px'}}>✏</button>
                      <button onClick={()=>setDFM(file)} style={{background:'none',border:'none',cursor:'pointer',color:D.danger,fontSize:11,opacity:.5,padding:'0 2px'}}>🗑</button>
                    </div>
                  ))}
                </div>
              ))
            }
          </div>
          {saveMsg&&<div style={{padding:'6px 12px',borderTop:`1px solid ${D.border}`,fontSize:11,color:saveMsg.startsWith('❌')?D.danger:D.success}}>{saveMsg}</div>}
        </div>

        {/* ═══ EDITOR ═══ */}
        <div style={{flex:1,display:'flex',flexDirection:'column',minWidth:0}}>
          {/* Toolbar */}
          <div style={{display:'flex',alignItems:'center',gap:7,padding:'8px 12px',borderBottom:`1px solid ${D.border}`,flexShrink:0,flexWrap:'wrap'}}>
            <div style={{fontSize:12,fontWeight:600,color:D.txtPri,flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
              {activeFile?`${activeFile.project} / ${activeFile.name}${isDirty?' ●':''}`:'Bez souboru'}
            </div>
            <button onClick={save} disabled={saving} className="mb-btn" style={{...ghost,background:isDirty?accent+'25':undefined,borderColor:isDirty?accent+'50':undefined,color:isDirty?accent:undefined}}>{saving?'…':'💾 Uložit'}</button>
            <button onClick={downloadCode} className="mb-btn" style={ghost}>⬇ Stáhnout .py</button>
            <button onClick={runSim} className="mb-btn" style={{...ghost,color:D.success,borderColor:D.success+'50',background:D.success+'15'}}>
              ▶ Spustit
            </button>
            {simRunning && (
              <button onClick={stopSim} className="mb-btn" style={{...ghost,color:D.danger,borderColor:D.danger+'50',background:D.danger+'15'}}>
                ⏹ Zastavit
              </button>
            )}
          </div>

          {/* Monaco editor */}
          <div ref={containerRef} style={{flex:1,overflow:'hidden',position:'relative'}}>
            {!activeFile ? (
              <div style={{height:'100%',display:'flex',alignItems:'center',justifyContent:'center',flexDirection:'column',gap:14,color:'rgba(255,255,255,.25)'}}>
                <span style={{fontSize:52,opacity:.3}}>🔬</span>
                <div style={{fontSize:15,fontWeight:600,color:'rgba(255,255,255,.3)'}}>Vítej v micro:bit editoru</div>
                <div style={{fontSize:12,color:'rgba(255,255,255,.2)',textAlign:'center' as const,lineHeight:1.7}}>
                  Vytvoř nový soubor nebo otevři existující projekt<br/>
                  z levého panelu a začni programovat.
                </div>
                <button onClick={()=>setNFM(true)} style={{marginTop:8,padding:'10px 22px',background:`rgba(${parseInt(accent.slice(1,3)||'7C',16)},${parseInt(accent.slice(3,5)||'3A',16)},${parseInt(accent.slice(5,7)||'ED',16)},.15)`,border:`1px solid ${accent}40`,borderRadius:10,cursor:'pointer',color:accent,fontFamily:'inherit',fontWeight:600,fontSize:13}}>
                  + Vytvořit první soubor
                </button>
              </div>
            ) : (
              <MonacoPanel
                code={code}
                onChange={(v:string)=>{setCode(v);codeRef.current=v||'';setIsDirty(true)}}
                completions={MB_COMPLETIONS}
                onSave={save}
                onEditorMount={(e:any)=>{ editorRef.current = e }}
              />
            )}
          </div>
        </div>

        {/* ═══ RIGHT: Simulator + Serial ═══ */}
        <div style={{width:280,flexShrink:0,borderLeft:`1px solid ${D.border}`,background:D.bgCard,display:'flex',flexDirection:'column',overflow:'hidden'}}>

          {/* micro:bit device visual */}
          <div style={{padding:'16px',borderBottom:`1px solid ${D.border}`,flexShrink:0}}>
            <div style={{textAlign:'center',marginBottom:10}}>
              <div style={{fontSize:11,fontWeight:700,color:D.txtSec,textTransform:'uppercase',letterSpacing:'.06em',marginBottom:8}}>
                🔬 Simulátor {simRunning&&<span style={{color:D.success}}>● běží</span>}
              </div>
              {/* LED matrix */}
              <div style={{display:'inline-block',background:'#1a0a00',borderRadius:12,padding:10,border:'2px solid #3a2010'}}>
                <div style={{display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:4}}>
                  {simDisplay.flat().map((val,i)=>(
                    <div key={i} className="mb-led" style={{width:18,height:18,background:ledColor(val,accent)}}/>
                  ))}
                </div>
              </div>
            </div>

            {/* A/B/Logo buttons */}
            <div style={{display:'flex',gap:6,marginBottom:8}}>
              <button className={`mb-btn-device${btnADown?' pressed':''}`}
                onMouseDown={()=>pressBtn('a',true)} onMouseUp={()=>pressBtn('a',false)}
                onTouchStart={()=>pressBtn('a',true)} onTouchEnd={()=>pressBtn('a',false)}>
                A
              </button>
              <button className={`mb-btn-device${logoDown?' pressed':''}`}
                onMouseDown={()=>pressBtn('logo',true)} onMouseUp={()=>pressBtn('logo',false)}
                onTouchStart={()=>pressBtn('logo',true)} onTouchEnd={()=>pressBtn('logo',false)}
                style={{fontSize:14,letterSpacing:0}}>
                ▼
              </button>
              <button className={`mb-btn-device${btnBDown?' pressed':''}`}
                onMouseDown={()=>pressBtn('b',true)} onMouseUp={()=>pressBtn('b',false)}
                onTouchStart={()=>pressBtn('b',true)} onTouchEnd={()=>pressBtn('b',false)}>
                B
              </button>
            </div>

            <div style={{display:'flex',gap:6}}>
              <button onClick={runSim} disabled={simRunning}
                style={{...btn(D.success),flex:1,padding:'7px',fontSize:11,opacity:simRunning?.4:1}}>
                ▶ Spustit
              </button>
              <button onClick={stopSim} disabled={!simRunning}
                style={{...btn('#EF4444'),flex:1,padding:'7px',fontSize:11,opacity:!simRunning?.4:1}}>
                ⏹ Stop
              </button>
            </div>
          </div>

          {/* Tabs: log / sensors */}
          <div style={{display:'flex',borderBottom:`1px solid ${D.border}`,flexShrink:0}}>
            {(['display','log','sensors'] as const).map(t=>(
              <button key={t} className={`mb-tab${simTab===t?' active':''}`} onClick={()=>setSimTab(t)}
                style={{'--accent':accent} as any}>
                {t==='display'?'📟 Displej':t==='log'?'📄 Výstup':'🎛️ Senzory'}
              </button>
            ))}
          </div>

          <div style={{flex:1,overflowY:'auto',padding:'10px 12px'}}>
            {simTab==='display'&&(
              <div>
                <div style={{fontSize:11,color:D.txtSec,marginBottom:8}}>Stav LED matice (5×5)</div>
                <div style={{display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:3,marginBottom:8}}>
                  {simDisplay.flat().map((val,i)=>(
                    <div key={i} style={{aspectRatio:'1',background:ledColor(val,accent),borderRadius:3,display:'flex',alignItems:'center',justifyContent:'center'}}>
                      <span style={{fontSize:7,color:'rgba(255,255,255,.3)'}}>{val||''}</span>
                    </div>
                  ))}
                </div>
                {simLog.length>0&&<div style={{fontSize:11,color:D.txtSec}}>Posledních {Math.min(simLog.length,3)} zpráv: <span style={{color:D.txtPri}}>{simLog.slice(-3).join(', ')}</span></div>}
              </div>
            )}
            {simTab==='log'&&(
              <div>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6}}>
                  <span style={{fontSize:11,color:D.txtSec}}>Sériový výstup simulátoru</span>
                  <button onClick={()=>setSimLog([])} style={{...ghost,padding:'2px 8px',fontSize:10}}>Vyčistit</button>
                </div>
                <div style={{background:'#0d1117',borderRadius:8,padding:10,minHeight:120,maxHeight:300,overflowY:'auto',fontFamily:'ui-monospace,monospace',fontSize:11,lineHeight:1.7,color:'#a8d8a8'}}>
                  {simLog.length===0?<span style={{color:'rgba(255,255,255,.2)'}}>Žádný výstup…</span>:simLog.map((l,i)=><div key={i}>{l}</div>)}
                </div>
              </div>
            )}
            {simTab==='sensors'&&(
              <div style={{display:'flex',flexDirection:'column',gap:12}}>
                <div>
                  <div style={{fontSize:11,color:D.txtSec,marginBottom:4}}>🌡️ Teplota: {simTemp}°C</div>
                  <input type="range" min={-20} max={50} value={simTemp} onChange={e=>{const v=parseInt(e.target.value);setSimTemp(v);simRef.current.setTemp(v)}} style={{width:'100%',accentColor:accent}}/>
                </div>
                <div>
                  <div style={{fontSize:11,color:D.txtSec,marginBottom:4}}>📐 Akcelerometr X: {simAccelX}</div>
                  <input type="range" min={-1024} max={1024} value={simAccelX} onChange={e=>{const v=parseInt(e.target.value);setSimAccelX(v);simRef.current.setAccel(v,simAccelY,-1024)}} style={{width:'100%',accentColor:accent}}/>
                </div>
                <div>
                  <div style={{fontSize:11,color:D.txtSec,marginBottom:4}}>📐 Akcelerometr Y: {simAccelY}</div>
                  <input type="range" min={-1024} max={1024} value={simAccelY} onChange={e=>{const v=parseInt(e.target.value);setSimAccelY(v);simRef.current.setAccel(simAccelX,v,-1024)}} style={{width:'100%',accentColor:accent}}/>
                </div>
                <div style={{fontSize:10,color:'rgba(255,255,255,.25)',lineHeight:1.6}}>
                  Posunutím posuvníků simuluješ fyzické senzory micro:bit. Hodnoty akcelerometru jsou v milli-g.
                </div>
              </div>
            )}
          </div>

          {/* Web Serial section */}
          <div style={{borderTop:`1px solid ${D.border}`,padding:'12px',flexShrink:0}}>
            <div style={{fontSize:10,fontWeight:700,color:'rgba(255,255,255,.3)',textTransform:'uppercase',letterSpacing:'.07em',marginBottom:10}}>
              Připojení zařízení
            </div>

            {!hasSerial ? (
              /* ── No Web Serial support ── */
              <div style={{borderRadius:10,overflow:'hidden',marginBottom:8}}>
                <div style={{background:'rgba(251,191,36,.12)',border:'1px solid rgba(251,191,36,.25)',borderRadius:10,padding:'10px 12px'}}>
                  <div style={{display:'flex',gap:8,alignItems:'flex-start'}}>
                    <span style={{fontSize:18,flexShrink:0}}>⚠️</span>
                    <div>
                      <div style={{fontSize:12,fontWeight:700,color:D.warning,marginBottom:3}}>Web Serial není dostupné</div>
                      <div style={{fontSize:11,color:'rgba(251,191,36,.7)',lineHeight:1.55}}>
                        Pro nahrání kódu přímo do micro:bit použij prohlížeč <strong style={{color:D.warning}}>Google Chrome</strong> nebo <strong style={{color:D.warning}}>Microsoft Edge</strong>.
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : serialConnected ? (
              /* ── Connected state ── */
              <div style={{marginBottom:8}}>
                <div style={{display:'flex',alignItems:'center',gap:8,padding:'9px 12px',background:'rgba(34,197,94,.08)',border:'1px solid rgba(34,197,94,.2)',borderRadius:10,marginBottom:8}}>
                  <div style={{width:8,height:8,borderRadius:'50%',background:D.success,boxShadow:`0 0 6px ${D.success}`,flexShrink:0}}/>
                  <div style={{flex:1}}>
                    <div style={{fontSize:12,fontWeight:600,color:D.success}}>micro:bit připojen</div>
                    {serialStatus&&<div style={{fontSize:10,color:'rgba(34,197,94,.6)',marginTop:1}}>{serialStatus}</div>}
                  </div>
                  <button onClick={disconnectSerial} className="mb-btn"
                    style={{background:'none',border:'1px solid rgba(255,255,255,.1)',borderRadius:6,cursor:'pointer',color:'rgba(255,255,255,.4)',fontSize:10,padding:'3px 8px'}}>
                    Odpojit
                  </button>
                </div>
                <button onClick={flashToDevice} disabled={flashing} className="mb-btn"
                  style={{width:'100%',padding:'10px',background:`linear-gradient(135deg,${accent},${accent}dd)`,color:'#fff',border:'none',borderRadius:10,cursor:flashing?'wait':'pointer',fontFamily:'inherit',fontWeight:700,fontSize:13,boxShadow:`0 4px 14px ${accent}40`,transition:'all .15s',display:'flex',alignItems:'center',justifyContent:'center',gap:8}}>
                  {flashing
                    ? <><span style={{display:'inline-block',width:14,height:14,border:'2px solid rgba(255,255,255,.3)',borderTopColor:'#fff',borderRadius:'50%',animation:'spin .7s linear infinite'}}/>Nahrávám…</>
                    : <>⚡ Nahrát kód do micro:bit</>}
                </button>
                {flashMsg&&(
                  <div style={{marginTop:7,padding:'7px 10px',borderRadius:8,background:flashMsg.startsWith('❌')?'rgba(239,68,68,.1)':'rgba(34,197,94,.1)',border:`1px solid ${flashMsg.startsWith('❌')?'rgba(239,68,68,.2)':'rgba(34,197,94,.2)'}`,fontSize:11,color:flashMsg.startsWith('❌')?D.danger:D.success}}>
                    {flashMsg}
                  </div>
                )}
              </div>
            ) : (
              /* ── Disconnected state ── */
              <div style={{marginBottom:8}}>
                <button onClick={connectSerial} className="mb-btn"
                  style={{width:'100%',padding:'10px 12px',background:'rgba(255,255,255,.04)',border:'1px dashed rgba(255,255,255,.15)',borderRadius:10,cursor:'pointer',fontFamily:'inherit',color:'rgba(255,255,255,.55)',fontSize:12,display:'flex',alignItems:'center',gap:10,transition:'all .15s'}}>
                  <div style={{width:36,height:36,borderRadius:'50%',background:'rgba(255,255,255,.06)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:18,flexShrink:0}}>🔌</div>
                  <div style={{textAlign:'left' as const}}>
                    <div style={{fontWeight:600,marginBottom:2}}>Připojit micro:bit</div>
                    <div style={{fontSize:10,opacity:.6}}>Připoj přes USB a klikni zde</div>
                  </div>
                </button>

                {serialStatus&&<div style={{fontSize:10,color:'rgba(255,255,255,.3)',marginTop:5,textAlign:'center' as const}}>{serialStatus}</div>}
              </div>
            )}

            <button onClick={downloadCode} className="mb-btn"
              style={{width:'100%',padding:'8px 12px',background:'rgba(255,255,255,.04)',border:'1px solid rgba(255,255,255,.08)',borderRadius:9,cursor:'pointer',fontFamily:'inherit',color:'rgba(255,255,255,.45)',fontSize:11,display:'flex',alignItems:'center',justifyContent:'center',gap:6,transition:'all .15s'}}>
              ⬇ Stáhnout .py soubor
            </button>


          </div>
        </div>
      </div>
    </DarkLayout>
  )
}

// ── Monaco panel sub-component ────────────────────────────────────────────────
function MonacoPanel({ code, onChange, completions, onSave, onEditorMount }: {
  code: string; onChange: (v:string)=>void; completions: any[]; onSave: ()=>void; onEditorMount?: (e:any)=>void
}) {
  const [Editor, setEditor] = useState<any>(null)

  useEffect(() => {
    import('@monaco-editor/react').then(m => setEditor(()=>m.default))
  }, [])

  function handleMount(editor: any, monaco: any) {
    onEditorMount?.(editor)
    // Register micro:bit completions
    monaco.languages.registerCompletionItemProvider('python', {
      triggerCharacters: ['.'],
      provideCompletionItems: (model: any, position: any) => {
        const word = model.getWordUntilPosition(position)
        const range = { startLineNumber:position.lineNumber, endLineNumber:position.lineNumber, startColumn:word.startColumn, endColumn:word.endColumn }
        const items = completions.map(c => ({
          label: c.label,
          kind: monaco.languages.CompletionItemKind[c.kind] ?? 1,
          insertText: c.insert,
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: c.doc,
          range,
        }))
        return { suggestions: items }
      }
    })
    // Ctrl+S save
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, onSave)
    // Set dark theme
    monaco.editor.defineTheme('mb-dark', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token:'keyword', foreground:'c792ea' },
        { token:'string', foreground:'c3e88d' },
        { token:'comment', foreground:'546e7a', fontStyle:'italic' },
        { token:'number', foreground:'f78c6c' },
      ],
      colors: { 'editor.background':'#0d1117', 'editor.foreground':'#e6edf3', 'editorLineNumber.foreground':'#30363d', 'editor.lineHighlightBackground':'#161b22' }
    })
    monaco.editor.setTheme('mb-dark')
  }

  if (!Editor) return (
    <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',color:'rgba(255,255,255,.3)',fontSize:13}}>
      Načítám editor…
    </div>
  )

  return (
    <Editor
      height="100%"
      language="python"
      value={code}
      onChange={(v: string|undefined) => onChange(v??'')}
      onMount={handleMount}
      options={{
        fontSize:14, lineHeight:22, fontFamily:'"Cascadia Code","Fira Code",ui-monospace,monospace',
        fontLigatures:true, minimap:{enabled:false}, scrollBeyondLastLine:false,
        padding:{top:16,bottom:16}, wordWrap:'on', tabSize:4, insertSpaces:true,
        bracketPairColorization:{enabled:true}, renderWhitespace:'none',
        smoothScrolling:true, cursorBlinking:'smooth', suggest:{showSnippets:true},
      }}
    />
  )
}
