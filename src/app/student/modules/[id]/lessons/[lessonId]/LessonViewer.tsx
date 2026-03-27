'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, useEffect, useRef } from 'react'
import { useIsMobile } from '@/lib/useIsMobile'
import { createClient } from '@/lib/supabase/client'
import { BackLink } from '@/components/ui'
import { highlightCode, highlightPython, PYTHON_CSS, LANGUAGE_LABELS, type Language } from '@/lib/highlight'

// Parse lesson HTML into renderable blocks
type ViewBlock = { type: 'html' | 'code' | 'tryit' | 'math'; content: string; language?: Language }

function parseBlocks(html: string): ViewBlock[] {
  if (!html) return []
  const tmp = document.createElement('div')
  tmp.innerHTML = html
  const blocks: ViewBlock[] = []
  let htmlNodes: Node[] = []

  function flush() {
    if (!htmlNodes.length) return
    const d = document.createElement('div')
    htmlNodes.forEach(n => d.appendChild(n.cloneNode(true)))
    const c = d.innerHTML.trim()
    if (c) blocks.push({ type: 'html', content: c })
    htmlNodes = []
  }

  tmp.childNodes.forEach(node => {
    const el = node as HTMLElement
    if (el.nodeType === 1 && el.classList?.contains('cb-code')) {
      flush()
      let code = ''
      try { code = decodeURIComponent(el.getAttribute('data-code') ?? '') }
      catch { code = el.getAttribute('data-code') ?? '' }
      const lang = (el.getAttribute('data-lang') ?? 'python') as Language
      blocks.push({ type: 'code', content: code, language: lang })
    } else if (el.nodeType === 1 && el.classList?.contains('cb-tryit')) {
      flush()
      let code = ''
      try { code = decodeURIComponent(el.getAttribute('data-code') ?? '') }
      catch { code = el.getAttribute('data-code') ?? '' }
      blocks.push({ type: 'tryit', content: code })
    } else if (el.nodeType === 1 && el.classList?.contains('cb-math')) {
      flush()
      let latex = ''
      try { latex = decodeURIComponent(el.getAttribute('data-latex') ?? '') }
      catch { latex = el.getAttribute('data-latex') ?? '' }
      blocks.push({ type: 'math', content: latex })
    } else {
      htmlNodes.push(node)
    }
  })
  flush()
  return blocks
}

// Run Python subset
function runPy(code: string): string {
  let out = ''
  try {
    const vars: Record<string,any> = {}
    code.split('\n').forEach(line => {
      const t = line.trim()
      const pm = t.match(/^print\((.+)\)$/)
      if (pm) {
        try {
          const r = pm[1]; const fstr = r.match(/^f["'](.*)["']$/)
          if (fstr) {
            out += fstr[1].replace(/\{([^}]+)\}/g, (_:any,v:string) => {
              try { return String(eval(v.replace(/\b(\w+)\b/g,(m:string)=>vars[m]!==undefined?JSON.stringify(vars[m]):m))) } catch { return v }
            }) + '\n'
          } else {
            out += String(eval(r.replace(/\b(\w+)\b/g,(m:string)=>vars[m]!==undefined?JSON.stringify(vars[m]):m))) + '\n'
          }
        } catch(e:any){ out += 'Error: '+e.message+'\n' }
      }
      const asgn = t.match(/^(\w+)\s*=\s*(.+)$/)
      if (asgn && !t.startsWith('print')) {
        try { vars[asgn[1]] = eval(asgn[2].replace(/\b(\w+)\b/g,(m:string)=>vars[m]!==undefined?JSON.stringify(vars[m]):m)) } catch {}
      }
    })
  } catch(e:any){ out = 'Error: '+e.message }
  return out.trim() || '(no output)'
}

// ── Code block viewer (read-only, highlighted) ────────────────────────────────
function CodeViewer({ code, language = 'python' }: { code: string; language?: Language }) {
  const [copied, setCopied] = useState(false)
  const highlighted = highlightCode(code, language)
  const lineCount = (code.match(/\n/g)?.length ?? 0) + 1
  const langLabel = LANGUAGE_LABELS[language] ?? language
  const ext: Record<Language, string> = { python:'py', javascript:'js', typescript:'ts', sql:'sql', html:'html', css:'css', pseudocode:'txt' }
  return (
    <div style={{ background:'#1e1e2e', borderRadius:8, overflow:'hidden', margin:'12px 0' }}>
      <div style={{ background:'#16213e', padding:'6px 14px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <span style={{ fontFamily:'monospace', fontSize:10, color:'#7aa2f7', letterSpacing:'.06em' }}>{langLabel.toUpperCase()}</span>
        <div style={{ display:'flex', gap:6 }}>
          <button onClick={() => {
            const a = document.createElement('a')
            a.href = URL.createObjectURL(new Blob([code], { type: 'text/plain' }))
            a.download = `code.${ext[language] ?? 'txt'}`; a.click(); URL.revokeObjectURL(a.href)
          }} style={{ padding:'2px 8px', fontSize:10, background:'transparent', color:'#6c7086', border:'1px solid #313244', borderRadius:4, cursor:'pointer', fontFamily:'inherit' }}>⬇</button>
          <button onClick={() => { navigator.clipboard?.writeText(code); setCopied(true); setTimeout(()=>setCopied(false),1500) }}
            style={{ padding:'2px 8px', fontSize:10, background:'transparent', color:'#7aa2f7', border:'1px solid #7aa2f7', borderRadius:4, cursor:'pointer', fontFamily:'inherit' }}>
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
      </div>
      <div style={{ display:'flex', background:'#1e1e2e' }}>
        <div style={{ width:36, flexShrink:0, background:'#181825', padding:'14px 6px 14px 0', textAlign:'right', fontFamily:'ui-monospace,monospace', fontSize:13, lineHeight:1.7, color:'#45475a', userSelect:'none' }}>
          {Array.from({ length: lineCount }, (_, i) => <div key={i}>{i + 1}</div>)}
        </div>
        <pre style={{ flex:1, background:'transparent', color:'#cdd6f4', padding:'14px 16px', fontFamily:'ui-monospace,"Cascadia Code","Fira Code",monospace', fontSize:14, margin:0, whiteSpace:'pre-wrap', overflowX:'auto', lineHeight:1.7, wordBreak:'break-word' }}
          dangerouslySetInnerHTML={{ __html: highlighted }} />
      </div>
    </div>
  )
}

// ── Try-it viewer (Pyodide-powered Jupyter-style cell) ───────────────────────
function TryItViewer({ initialCode, expectedOutput }: { initialCode: string; expectedOutput?: string }) {
  const [code, setCode] = useState(initialCode)
  const [output, setOutput] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [running, setRunning] = useState(false)
  const [pyReady, setPyReady] = useState(false)
  const [pyLoading, setPyLoading] = useState(false)
  const [fontSize, setFontSize] = useState(14)
  const [outputHistory, setOutputHistory] = useState<string[]>([])
  const taRef = useRef<HTMLTextAreaElement>(null)
  const preRef = useRef<HTMLPreElement>(null)

  function syncHighlight(val: string) { if (preRef.current) preRef.current.innerHTML = highlightPython(val) + '\n' }
  function syncHeight() { if (!taRef.current) return; taRef.current.style.height = 'auto'; taRef.current.style.height = taRef.current.scrollHeight + 'px' }
  useEffect(() => { syncHighlight(code); syncHeight() }, [])

  useEffect(() => {
    import('@/lib/pyodide-runner').then(m => {
      setPyLoading(true)
      m.loadPyodide().then(() => { setPyReady(true); setPyLoading(false) }).catch(() => setPyLoading(false))
    })
  }, [])

  const [images, setImages] = useState<string[]>([])
  const [pkgStatus, setPkgStatus] = useState('')

  async function run() {
    if (running) return
    setRunning(true); setOutput(null); setError(null); setImages([])
    try {
      const { runPython } = await import('@/lib/pyodide-runner')
      const { output: out, error: err, images: imgs } = await runPython(code, () => {}, msg => setPkgStatus(msg))
      const result = out || (imgs.length ? '' : '(no output)')
      setOutput(result)
      if (err) setError(err)
      if (imgs.length) setImages(imgs)
      setOutputHistory(h => [result || `[${imgs.length} chart(s)]`, ...h.slice(0, 4)])
    } catch (e: any) { setError(e.message) }
    setRunning(false)
  }

  const checkResult = output && expectedOutput?.trim()
    ? output.trim() === expectedOutput.trim() ? 'correct' : 'wrong'
    : null

  const monoFont = 'ui-monospace,"Cascadia Code","Fira Code",Consolas,monospace'
  const monoStyle: React.CSSProperties = { fontFamily: monoFont, fontSize, lineHeight: 1.7, padding: '14px 16px 14px 52px', whiteSpace: 'pre-wrap', wordBreak: 'break-all', display: 'block', boxSizing: 'border-box', width: '100%' }
  const lineCount = (code.match(/\n/g)?.length ?? 0) + 1

  return (
    <div style={{ background:'#1a1b26', borderRadius:8, overflow:'hidden', margin:'12px 0', border:'1px solid #2a2a4a' }}>
      {/* Header */}
      <div style={{ background:'#16213e', padding:'6px 14px', display:'flex', alignItems:'center', gap:8 }}>
        <div style={{ width:9,height:9,borderRadius:'50%',background:'#f38ba8',flexShrink:0 }} />
        <div style={{ width:9,height:9,borderRadius:'50%',background:'#f9e2af',flexShrink:0 }} />
        <div style={{ width:9,height:9,borderRadius:'50%',background:'#a6e3a1',flexShrink:0 }} />
        <span style={{ fontFamily:'monospace', fontSize:10, color:'#7aa2f7', letterSpacing:'.06em', flex:1, marginLeft:4 }}>
          <span className="cb-tryit-title">▶ Try It</span>
          <span className="cb-tryit-subtitle"> — Python</span>
          {pyLoading && <span style={{ color:'#45475a', marginLeft:6, fontSize:9 }}>loading…</span>}
          {pyReady && <span style={{ color:'#a6e3a1', marginLeft:6 }}>●</span>}
        </span>
        <button onClick={() => setFontSize(f => Math.max(10, f-1))} style={{ fontSize:10, color:'#6c7086', background:'none', border:'none', cursor:'pointer', padding:'1px 4px' }}>A−</button>
        <button onClick={() => setFontSize(f => Math.min(20, f+1))} style={{ fontSize:12, color:'#6c7086', background:'none', border:'none', cursor:'pointer', padding:'1px 4px' }}>A+</button>
        <button onClick={() => { setCode(initialCode); syncHighlight(initialCode); syncHeight(); setOutput(null); setError(null) }}
          style={{ fontSize:10, color:'#6c7086', background:'none', border:'none', cursor:'pointer', padding:'1px 6px' }} title="Reset to starter code">↺ Reset</button>
        <button onClick={run} disabled={running}
          style={{ padding:'3px 12px', fontSize:12, background: pyReady?'#a6e3a1':'#7aa2f7', color:'#1a1b26', border:'none', borderRadius:5, cursor:'pointer', fontFamily:'inherit', fontWeight:600 }}>
          {running ? (pkgStatus || '⏳ Running…') : '▶ Run'}
        </button>
      </div>

      {/* Editor with line numbers */}
      <div style={{ position:'relative', background:'#1e1e2e', display:'flex' }}>
        <div style={{ width:40, flexShrink:0, background:'#181825', padding:'14px 8px 14px 0', textAlign:'right', fontFamily:'ui-monospace,monospace', fontSize, lineHeight:1.7, color:'#45475a', userSelect:'none', pointerEvents:'none', boxSizing:'border-box' }}>
          {Array.from({ length: lineCount }, (_, i) => <div key={i}>{i+1}</div>)}
        </div>
        <pre ref={preRef} aria-hidden="true"
          style={{ ...monoStyle, color:'#cdd6f4', background:'transparent', pointerEvents:'none', position:'absolute', left:40, top:0, right:0, bottom:0, margin:0, overflow:'hidden' }} />
        <textarea ref={taRef} value={code} spellCheck={false}
          onChange={e => { setCode(e.target.value); syncHighlight(e.target.value); syncHeight() }}
          onKeyDown={e => {
            const ta = e.currentTarget; const s=ta.selectionStart, en=ta.selectionEnd, v=ta.value
            if (e.key==='Enter' && (e.ctrlKey||e.metaKey)) { e.preventDefault(); run(); return }
            if (e.key==='Tab') {
              e.preventDefault()
              if (e.shiftKey) {
                const ls=v.lastIndexOf('\n',s-1)+1; const sp=v.slice(ls).match(/^ {1,4}/)?.[0]??''
                if (sp) { const nv=v.slice(0,ls)+v.slice(ls+sp.length); setCode(nv); syncHighlight(nv); requestAnimationFrame(()=>{ta.selectionStart=ta.selectionEnd=s-sp.length}) }
              } else {
                const nv=v.slice(0,s)+'    '+v.slice(en); setCode(nv); syncHighlight(nv); requestAnimationFrame(()=>{ta.selectionStart=ta.selectionEnd=s+4})
              }
              return
            }
            if (e.key==='Enter' && !e.shiftKey) {
              e.preventDefault()
              const ls=v.lastIndexOf('\n',s-1)+1; const cur=v.slice(ls,s)
              const indent=cur.match(/^(\s*)/)?.[1]??''; const extra=cur.trimEnd().endsWith(':')?'    ':''
              const nv=v.slice(0,s)+'\n'+indent+extra+v.slice(en); setCode(nv); syncHighlight(nv)
              requestAnimationFrame(()=>{ta.selectionStart=ta.selectionEnd=s+1+indent.length+extra.length})
            }
            // Auto-close brackets
            const pairs: Record<string,string> = {'(':')','{':'}','[':']','"':'"',"'":"'"}
            if (pairs[e.key] && s===en) {
              e.preventDefault()
              const nv=v.slice(0,s)+e.key+pairs[e.key]+v.slice(en); setCode(nv); syncHighlight(nv)
              requestAnimationFrame(()=>{ta.selectionStart=ta.selectionEnd=s+1})
            }
          }}
          style={{ ...monoStyle, flex:1, color:'transparent', caretColor:'#cdd6f4', background:'transparent', border:'none', outline:'none', resize:'none', overflow:'hidden', position:'relative', zIndex:1, minHeight:60, paddingLeft:52 }}
        />
      </div>

      {/* Output */}
      {(output !== null || error !== null || images.length > 0) && (
        <div style={{ background:'#0d1117', borderTop:'1px solid #2a2a4a', padding:'10px 16px' }}>
          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
            <span style={{ fontSize:10, color:'#6c7086', fontFamily:'monospace', letterSpacing:'.05em' }}>OUTPUT</span>
            {checkResult==='correct' && <span style={{ fontSize:10, background:'#a6e3a1', color:'#1a1b26', padding:'1px 7px', borderRadius:10, fontWeight:700 }}>✓ Correct!</span>}
            {checkResult==='wrong' && <span style={{ fontSize:10, background:'#f38ba8', color:'#1a1b26', padding:'1px 7px', borderRadius:10, fontWeight:700 }}>✗ Expected: {expectedOutput}</span>}
            {output && <button onClick={()=>navigator.clipboard?.writeText(output!)} style={{ fontSize:10, color:'#6c7086', background:'none', border:'none', cursor:'pointer', marginLeft:'auto' }}>⎘ Copy</button>}
          </div>
          {output && <pre style={{ color:'#a6e3a1', fontFamily:'ui-monospace,monospace', fontSize:13, margin:0, whiteSpace:'pre-wrap' }}>{output}</pre>}
          {error && <pre style={{ color:'#f38ba8', fontFamily:'ui-monospace,monospace', fontSize:12, margin: output?'6px 0 0':0, whiteSpace:'pre-wrap' }}>{error}</pre>}
          {images.map((img, i) => (
            <div key={i} style={{ marginTop: output || error ? 10 : 0 }}>
              <img src={'data:image/png;base64,' + img} alt={'Chart ' + (i+1)} style={{ maxWidth:'100%', borderRadius:6, display:'block' }} />
            </div>
          ))}
        </div>
      )}

      {/* Output history */}
      {outputHistory.length > 1 && (
        <details style={{ background:'#0a0a0f', borderTop:'1px solid #2a2a4a' }}>
          <summary style={{ fontSize:10, color:'#45475a', padding:'4px 14px', cursor:'pointer', userSelect:'none', listStyle:'none' }}>▸ {outputHistory.length-1} previous run{outputHistory.length>2?'s':''}</summary>
          {outputHistory.slice(1).map((h,i) => (
            <pre key={i} style={{ color:'#585b70', fontFamily:'ui-monospace,monospace', fontSize:12, margin:0, padding:'4px 14px', borderTop:'1px solid #1a1a2e', whiteSpace:'pre-wrap' }}>{h}</pre>
          ))}
        </details>
      )}
      <div style={{ padding:'4px 14px 5px', fontSize:10, color:'#313244', display:'flex', gap:12 }}>
        <span>Ctrl+Enter run</span><span>Tab indent</span><span>Shift+Tab unindent</span><span>Auto-closes brackets</span>
      </div>
    </div>
  )
}


// ── Math / LaTeX viewer ──────────────────────────────────────────────────────
let katexViewerLoaded = false
let katexViewerLoading: Promise<void> | null = null

function ensureKatexViewer(): Promise<void> {
  if (katexViewerLoaded) return Promise.resolve()
  if (katexViewerLoading) return katexViewerLoading
  katexViewerLoading = new Promise<void>((resolve, reject) => {
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = 'https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css'
    document.head.appendChild(link)
    const script = document.createElement('script')
    script.src = 'https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.js'
    script.onload = () => { katexViewerLoaded = true; resolve() }
    script.onerror = () => reject(new Error('KaTeX failed to load'))
    document.head.appendChild(script)
  })
  return katexViewerLoading
}

function MathViewer({ latex, mode }: { latex: string; mode?: 'display' | 'inline' }) {
  const [html, setHtml] = useState('')
  const [err, setErr] = useState('')

  useEffect(() => {
    ensureKatexViewer().then(() => {
      try {
        const rendered = (window as any).katex.renderToString(latex, {
          displayMode: mode !== 'inline',
          throwOnError: false,
          trust: true
        })
        setHtml(rendered)
      } catch (e: any) { setErr(e.message) }
    }).catch(e => setErr(e.message))
  }, [latex, mode])

  if (err) return <span style={{ color: '#e53e3e', fontSize: 12, fontFamily: 'monospace' }}>{err}</span>
  return (
    <div style={{ margin: '14px 0', textAlign: mode === 'inline' ? 'left' : 'center', overflowX: 'auto' }}
      dangerouslySetInnerHTML={{ __html: html }} />
  )
}

// ── HTML content block with quiz activation ───────────────────────────────────
const HtmlBlock = React.memo(function HtmlBlock({ html }: { html: string }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current; if (!el) return
    // Make everything non-editable
    el.querySelectorAll('[contenteditable]').forEach(n => n.setAttribute('contenteditable','false'))
    // Hide table edit buttons
    el.querySelectorAll('button[onclick*="tbl"]').forEach(b => (b as HTMLElement).style.display='none')
    // Activate quiz blocks
    el.querySelectorAll('.cb-quiz').forEach(quiz => activateQuiz(quiz as HTMLElement))
  }, [html])

  function activateQuiz(quiz: HTMLElement) {
    if (quiz.dataset.activated) return
    quiz.dataset.activated = '1'
    const q = quiz.dataset.q ?? ''
    let opts: string[] = []; let expl: string[] = []
    try { opts = JSON.parse(quiz.dataset.opts?.replace(/&quot;/g,'"') ?? '[]') } catch {}
    try { expl = JSON.parse(quiz.dataset.expl?.replace(/&quot;/g,'"') ?? '[]') } catch {}
    const correct = parseInt(quiz.dataset.correct ?? '0')

    quiz.innerHTML = `<details class="cb-quiz-details" style="border-radius:10px;overflow:hidden">
<summary style="padding:10px 14px;background:#E6F1FB;cursor:pointer;font-size:13px;font-weight:600;color:#0C447C;list-style:none;display:flex;align-items:center;gap:8px;user-select:none">
  <span>✓</span><span>Check your understanding</span><span style="margin-left:auto;font-weight:400;font-size:12px;opacity:.7">Click to expand ▸</span>
</summary>
<div class="qinner" style="padding:14px">
  <div style="font-size:14px;font-weight:600;margin-bottom:12px">${q}</div>
  <div class="qopts"></div>
  <div class="qfb" style="display:none;font-size:13px;padding:8px 11px;border-radius:8px;margin-top:10px"></div>
</div></details>`

    const summary = quiz.querySelector('summary')
    const inner = quiz.querySelector('.qinner') as HTMLElement
    const optsEl = quiz.querySelector('.qopts') as HTMLElement
    const fb = quiz.querySelector('.qfb') as HTMLElement

    opts.forEach((o, i) => {
      const row = document.createElement('div')
      row.style.cssText = 'display:flex;align-items:center;gap:10px;padding:9px 12px;border:1px solid #e5e7eb;border-radius:9px;margin-bottom:7px;cursor:pointer;font-size:14px;background:#fff;transition:all .15s;user-select:none'
      row.innerHTML = `<div class="dot" style="width:15px;height:15px;border-radius:50%;border:1.5px solid #ccc;flex-shrink:0;transition:all .15s"></div><span>${o}</span>`
      row.onclick = () => {
        if (quiz.dataset.solved) return
        optsEl.querySelectorAll('.dot').forEach((d:any)=>{d.style.background='';d.style.borderColor='#ccc'})
        optsEl.querySelectorAll('div[style*="display:flex"]').forEach((r:any)=>{r.style.background='#fff';r.style.borderColor='#e5e7eb'})
        const dot = row.querySelector('.dot') as HTMLElement
        if (i === correct) {
          dot.style.background='#27500A'; dot.style.borderColor='#27500A'
          row.style.background='#EAF3DE'; row.style.borderColor='#3B6D11'
          fb.textContent='✓ '+(expl[i]||'Correct!'); fb.style.cssText='display:block;background:#EAF3DE;color:#27500A;font-size:13px;padding:8px 11px;border-radius:8px;margin-top:10px'
          quiz.dataset.solved='1'
          if(summary){ const last=summary.querySelector('span:last-child') as HTMLElement; if(last)last.textContent='✓ Answered' }
        } else {
          dot.style.background='#791F1F'; dot.style.borderColor='#791F1F'
          row.style.background='#FCEBEB'; row.style.borderColor='#A32D2D'
          const cr = optsEl.querySelectorAll('div[style*="display:flex"]')[correct] as HTMLElement
          if(cr){const d2=cr.querySelector('.dot') as HTMLElement;if(d2){d2.style.background='#27500A';d2.style.borderColor='#27500A'}cr.style.background='#EAF3DE';cr.style.borderColor='#3B6D11'}
          fb.textContent='✗ '+(expl[i]||'Incorrect.'); fb.style.cssText='display:block;background:#FCEBEB;color:#791F1F;font-size:13px;padding:8px 11px;border-radius:8px;margin-top:10px'
        }
      }
      optsEl.appendChild(row)
    })
  }

  return (
    <div ref={ref} className="lesson-content"
      style={{ fontSize:14, lineHeight:1.75, color:'inherit' }}
      dangerouslySetInnerHTML={{ __html: html }} />
  )
})

// ── Main viewer ───────────────────────────────────────────────────────────────
export default function LessonViewer({ lesson, moduleId, studentId, completionStatus, allLessons, completedIds, authorName, subLessons = [] }: {
  lesson: any; moduleId: string; studentId: string
  completionStatus: 'completed' | 'bookmark' | 'none'
  allLessons: any[]; completedIds: string[]; authorName: string
  subLessons?: any[]
}) {
  const supabase = createClient()
  const isMobile = useIsMobile()
  const [activeTab, setActiveTab] = useState<string>('main')
  const [tocItems, setTocItems] = useState<{ id: string; text: string; level: number }[]>([])
  const [tocActiveId, setTocActiveId] = useState<string>('')
  const [tocOpen, setTocOpen] = useState(false)
  const [status, setStatus] = useState<'completed'|'bookmark'|'none'>(completionStatus)
  const [saving, setSaving] = useState(false)
  const [blocks, setBlocks] = useState<ViewBlock[]>([])
  const [navOpen, setNavOpen] = useState(false)

  // Scroll progress
  const [scrollPct, setScrollPct] = useState(0)
  const contentRef = useRef<HTMLDivElement>(null)
  const tocObserver = useRef<IntersectionObserver | null>(null)

  // allLessons from server is already filtered to top-level only (no parent_lesson_id)
  const topLevelLessons = allLessons
  const currentIndex = topLevelLessons.findIndex((l: any) => l.id === lesson.id)
  const prevLesson = currentIndex > 0 ? topLevelLessons[currentIndex - 1] : null
  const nextLesson = currentIndex < topLevelLessons.length - 1 ? topLevelLessons[currentIndex + 1] : null
  const completedSet = new Set(completedIds)

  // ── Estimated read time ────────────────────────────────────────────────────
  function calcReadTime(html: string): string {
    const tmp = document.createElement('div')
    tmp.innerHTML = html
    const text = tmp.textContent ?? ''
    const words = text.trim().split(/\s+/).filter(Boolean).length
    const codeBlocks = (html.match(/class="cb-code"|class="cb-tryit"/g) ?? []).length
    // ~200 wpm reading + 30s per code block
    const minutes = Math.ceil(words / 200 + codeBlocks * 0.5)
    return minutes <= 1 ? '< 1 min read' : `~${minutes} min read`
  }
  // The content currently shown: main lesson or a selected sub-lesson tab
  const activeLesson = activeTab === 'main' ? lesson : subLessons.find(s => s.id === activeTab) ?? lesson

  const readTime = blocks.length > 0 ? calcReadTime(activeLesson.content_html ?? '') : ''

  // ── Load blocks + existing progress ───────────────────────────────────────

  useEffect(() => {
    setBlocks(parseBlocks(activeLesson.content_html ?? ''))
    setTocItems([])
    setTocActiveId('')
  }, [activeTab])

  useEffect(() => {
    setBlocks(parseBlocks(lesson.content_html ?? ''))

    // Load existing scroll progress
    supabase.from('lesson_progress')
      .select('scroll_pct')
      .eq('student_id', studentId)
      .eq('lesson_id', lesson.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setScrollPct((data as any).scroll_pct ?? 0)
        }
      })
  }, [lesson.id])

  // ── Scroll tracking ────────────────────────────────────────────────────────
  // Use a ref to track pct without causing re-renders on every scroll event.
  // Only call setScrollPct when the integer value changes, and debounce DB save.
  const scrollPctRef = useRef(scrollPct)
  const scrollSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    scrollPctRef.current = scrollPct
  }, [scrollPct])

  useEffect(() => {
    function onScroll() {
      const el = contentRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const totalHeight = el.scrollHeight
      const viewportBottom = window.innerHeight
      const scrolled = Math.max(0, viewportBottom - rect.top)
      const pct = Math.min(100, Math.round((scrolled / totalHeight) * 100))
      if (pct > scrollPctRef.current) {
        scrollPctRef.current = pct
        // Batch visual update — only trigger React re-render every 5% to avoid
        // destroying quiz DOM on every scroll tick
        if (pct % 5 === 0 || pct === 100) {
          setScrollPct(pct)
        }
        // Debounce DB save separately
        if (scrollSaveTimer.current) clearTimeout(scrollSaveTimer.current)
        scrollSaveTimer.current = setTimeout(() => saveScrollPct(pct), 2000)
      }
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [lesson.id])

  async function saveScrollPct(pct: number) {
    await supabase.from('lesson_progress').upsert({
      student_id: studentId, lesson_id: lesson.id,
      status: status === 'none' ? 'completed' : status,
      scroll_pct: pct,
    } as any)
  }

  // ── Status toggle ──────────────────────────────────────────────────────────
  async function setProgress(newStatus: 'completed'|'bookmark'|'none') {
    setSaving(true)
    if (newStatus === 'none') {
      await supabase.from('lesson_progress').delete()
        .eq('student_id', studentId).eq('lesson_id', lesson.id)
    } else {
      await supabase.from('lesson_progress').upsert({
        student_id: studentId, lesson_id: lesson.id,
        status: newStatus, scroll_pct: scrollPct,
      } as any)
    }
    setStatus(newStatus); setSaving(false)
  }

  // ── Table of contents ─────────────────────────────────────────────────────
  useEffect(() => {
    if (blocks.length === 0) return
    // Small delay to let DOM render
    const timer = setTimeout(() => {
      const el = contentRef.current
      if (!el) return
      const allHeadings = el.querySelectorAll('h1, h2, h3')
      const items: { id: string; text: string; level: number }[] = []
      let tocIdx = 0
      allHeadings.forEach((h) => {
        // Skip headings inside quiz blocks, callouts, or other special components
        if (h.closest('.cb-quiz') || h.closest('[data-no-toc]')) return
        const id = 'toc-' + tocIdx++
        h.id = id
        const tag = h.tagName.toLowerCase()
        const level = tag === 'h1' ? 1 : tag === 'h2' ? 2 : 3
        const text = (h.textContent ?? '').trim()
        if (text) items.push({ id, text, level })
      })
      setTocItems(items)

      // IntersectionObserver to highlight active heading
      tocObserver.current?.disconnect()
      if (items.length > 0) {
        tocObserver.current = new IntersectionObserver(
          (entries) => {
            for (const entry of entries) {
              if (entry.isIntersecting) {
                setTocActiveId(entry.target.id)
                break
              }
            }
          },
          { rootMargin: '0px 0px -70% 0px', threshold: 0 }
        )
        items.forEach(item => {
          const el2 = document.getElementById(item.id)
          if (el2) tocObserver.current?.observe(el2)
        })
      }
    }, 150)
    return () => { clearTimeout(timer); tocObserver.current?.disconnect() }
  }, [blocks])

  // ── Export to PDF ──────────────────────────────────────────────────────────
  function exportPDF() {
    // Build a clean printable HTML document
    const katexCss = 'https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css'
    const contentHtml = activeLesson.content_html ?? ''

    // Parse the cb-code and cb-tryit blocks for display in PDF
    const tmp = document.createElement('div')
    tmp.innerHTML = contentHtml
    tmp.querySelectorAll('.cb-code').forEach(el => {
      const code = decodeURIComponent((el as HTMLElement).getAttribute('data-code') ?? '')
      const pre = document.createElement('pre')
      pre.style.cssText = 'background:#1e1e2e;color:#cdd6f4;padding:14px 16px;border-radius:8px;font-size:13px;font-family:monospace;white-space:pre-wrap;word-break:break-word;margin:12px 0'
      pre.textContent = code
      el.replaceWith(pre)
    })
    tmp.querySelectorAll('.cb-tryit').forEach(el => {
      const code = decodeURIComponent((el as HTMLElement).getAttribute('data-code') ?? '')
      const wrap = document.createElement('div')
      wrap.style.cssText = 'border:1px solid #7aa2f7;border-radius:8px;overflow:hidden;margin:12px 0'
      wrap.innerHTML = '<div style="background:#16213e;color:#7aa2f7;padding:5px 12px;font-size:10px;font-family:monospace;letter-spacing:.06em">▶ TRY IT — Python</div>'
      const pre = document.createElement('pre')
      pre.style.cssText = 'background:#1a1b26;color:#cdd6f4;padding:14px 16px;font-size:13px;font-family:monospace;white-space:pre-wrap;word-break:break-word;margin:0'
      pre.textContent = code
      wrap.appendChild(pre)
      el.replaceWith(wrap)
    })
    tmp.querySelectorAll('.cb-math').forEach(el => {
      const latex = decodeURIComponent((el as HTMLElement).getAttribute('data-latex') ?? '')
      const span = document.createElement('div')
      span.style.cssText = 'text-align:center;margin:16px 0;font-style:italic;color:#444'
      span.textContent = latex
      el.replaceWith(span)
    })

    const printHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${activeLesson.title}</title>
  <link rel="stylesheet" href="${katexCss}">
  <style>
    body { font-family: Georgia, serif; max-width: 720px; margin: 40px auto; color: #111; line-height: 1.7; font-size: 15px; }
    h1 { font-size: 26px; margin-bottom: 4px; }
    h2 { font-size: 20px; margin: 22px 0 6px; }
    h3 { font-size: 17px; margin: 18px 0 4px; }
    p { margin: 8px 0; }
    blockquote { border-left: 3px solid #185FA5; margin: 12px 0; padding: 4px 16px; color: #555; font-style: italic; }
    table { border-collapse: collapse; width: 100%; margin: 12px 0; }
    td, th { border: 1px solid #ddd; padding: 8px 12px; }
    th { background: #f5f5f5; font-weight: 600; }
    img { max-width: 100%; border-radius: 6px; }
    a { color: #185FA5; }
    ul, ol { padding-left: 24px; }
    .cb-quiz { background: #f0f7ff; border: 1px solid #B5D4F4; border-radius: 8px; padding: 12px 16px; margin: 12px 0; }
    details { border: 1px solid #ddd; border-radius: 6px; margin: 10px 0; }
    summary { padding: 8px 12px; background: #f9fafb; cursor: pointer; }
    .meta { font-size: 12px; color: #888; margin-bottom: 24px; border-bottom: 1px solid #eee; padding-bottom: 12px; }
    @media print { body { margin: 20px; } }
  </style>
</head>
<body>
  <h1>${activeLesson.title}</h1>
  <div class="meta">${authorName ? 'By ' + authorName + ' · ' : ''}${readTime}</div>
  ${tmp.innerHTML}
</body>
</html>`

    const blob = new Blob([printHtml], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    const win = window.open(url, '_blank')
    if (win) {
      win.onload = () => {
        win.focus()
        win.print()
        URL.revokeObjectURL(url)
      }
    }
  }

  return (
    <div style={{ display: isMobile ? 'block' : 'flex', gap: 18, alignItems: 'flex-start' }}>
      <style>{PYTHON_CSS}{`
        .lesson-content h1{font-size:22px;font-weight:700;margin:14px 0 6px}
        .lesson-content h2{font-size:18px;font-weight:700;margin:12px 0 5px}
        .lesson-content h3{font-size:15px;font-weight:700;margin:10px 0 4px}
        .lesson-content p{margin:5px 0}
        .lesson-content ul{padding-left:22px;margin:6px 0;list-style:disc}
        .lesson-content ol{padding-left:22px;margin:6px 0;list-style:decimal}
        .lesson-content li{margin:3px 0}
        .lesson-content blockquote{border-left:3px solid #185FA5;padding:4px 14px;margin:8px 0;color:#666;font-style:italic}
        .lesson-content table{border-collapse:collapse;width:100%;margin:10px 0}
        .lesson-content td,.lesson-content th{border:1px solid #e5e7eb;padding:7px 11px}
        .lesson-content th{background:#f9fafb;font-weight:600}
        .lesson-content img{max-width:100%;border-radius:8px;margin:8px 0;display:block}
        .lesson-content iframe{width:100%;aspect-ratio:16/9;border:none;border-radius:8px;margin:8px 0;display:block}
        .lesson-content a{color:#185FA5;text-decoration:underline}
        .lesson-content details{border:1px solid #e5e7eb;border-radius:8px;margin:10px 0;overflow:hidden}
        .lesson-content summary{padding:10px 14px;background:#f9fafb;cursor:pointer;font-weight:500;list-style:none}
        .lesson-content summary::-webkit-details-marker{display:none}
        .lesson-content details[open] summary{border-bottom:1px solid #e5e7eb}
        .lesson-content details > *:not(summary){padding:10px 14px}
        .cb-quiz{background:#f0f7ff;border:1px solid #B5D4F4;border-radius:10px;margin:12px 0;overflow:hidden}
        .cb-quiz-details summary::-webkit-details-marker{display:none}
      `}</style>

      {/* Scroll progress bar */}
      <div style={{ position:'fixed', top:52, left:0, right:0, height:3, background:'#f0f0f0', zIndex:49, pointerEvents:'none' }}>
        <div style={{ height:'100%', width: scrollPct + '%', background: scrollPct >= 100 ? '#27500A' : '#185FA5', transition:'width .4s ease', borderRadius:'0 2px 2px 0' }} />
      </div>

      {/* Left nav — hidden on mobile until toggled */}
      {!isMobile && (
        <div style={{ width:210, flexShrink:0, position:'sticky', top:80 }}>
          <div style={{ background:'#fff', border:'1px solid #e5e7eb', borderRadius:10, padding:'10px 0', maxHeight:'calc(100vh - 120px)', overflowY:'auto' }}>
            <div style={{ fontSize:10, fontWeight:700, color:'#888', textTransform:'uppercase', letterSpacing:'.06em', padding:'0 14px 8px' }}>Lessons</div>
            {topLevelLessons.map((l:any, i:number) => {
              const isCurrent = l.id === lesson.id
              const isDone = completedSet.has(l.id)
              const subs = allLessons.filter((s:any) => s.parent_lesson_id === l.id)
              return (
                <div key={l.id}>
                  {l.locked ? (
                    <div style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 14px', color:'#bbb', borderLeft:'3px solid transparent', fontSize:13, cursor:'not-allowed' }}>
                      <div style={{ width:20, height:20, borderRadius:'50%', background:'#f3f4f6', color:'#ccc', fontSize:10, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>🔒</div>
                      <span style={{ fontSize:12, lineHeight:1.4, color:'#ccc' }}>{l.title}</span>
                    </div>
                  ) : (
                    <a href={`/student/modules/${moduleId}/lessons/${l.id}`}
                      style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 14px', textDecoration:'none', background:isCurrent?'#E6F1FB':'transparent', color:isCurrent?'#0C447C':'#333', borderLeft:isCurrent?'3px solid #185FA5':'3px solid transparent', fontSize:13 }}>
                      <div style={{ width:20, height:20, borderRadius:'50%', background:isDone?'#EAF3DE':isCurrent?'#185FA5':'#f3f4f6', color:isDone?'#27500A':isCurrent?'#fff':'#888', fontSize:10, fontWeight:700, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                        {isDone ? '✓' : i+1}
                      </div>
                      <span style={{ fontSize:12, lineHeight:1.4, fontWeight:isCurrent?600:400 }}>{l.title}</span>
                    </a>
                  )}
                  {isCurrent && subs.length > 0 && subs.map((s:any) => (
                    <div key={s.id}
                      style={{ paddingLeft:28, paddingRight:8, paddingTop:2, paddingBottom:2 }}>
                      <button onClick={() => setActiveTab(s.id === activeTab ? 'main' : s.id)}
                        style={{ display:'flex', alignItems:'center', gap:6, width:'100%', padding:'5px 8px', background: activeTab===s.id?'#dbeafe':'transparent', borderLeft: activeTab===s.id?'2px solid #185FA5':'2px solid #e0e7ef', color: activeTab===s.id?'#185FA5':'#888', fontSize:11, cursor:'pointer', border:'none', fontFamily:'inherit', textAlign:'left', borderRadius:'0 4px 4px 0' }}>
                        <span style={{ fontSize:10, color: activeTab===s.id?'#185FA5':'#bbb' }}>↳</span>
                        <span style={{ fontWeight: activeTab===s.id?600:400 }}>{s.title}</span>
                      </button>
                    </div>
                  ))}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Main content */}
      <div style={{ flex:1, minWidth:0, width:'100%' }}>
        <BackLink href={`/student/modules/${moduleId}`} label="Back to module" />

        {/* Mobile: inline lesson nav */}
        {isMobile && (
          <div style={{ marginBottom:12 }}>
            <button onClick={() => setNavOpen(o => !o)}
              style={{ width:'100%', padding:'10px 14px', background:'#fff', border:'1px solid #e5e7eb', borderRadius:10, fontSize:13, display:'flex', alignItems:'center', justifyContent:'space-between', cursor:'pointer', fontFamily:'inherit', color:'#555' }}>
              <span>📚 Lesson {currentIndex+1} of {topLevelLessons.length}: <strong style={{ color:'#111' }}>{lesson.title}</strong></span>
              <span style={{ color:'#888' }}>{navOpen ? '▲' : '▼'}</span>
            </button>
            {navOpen && (
              <div style={{ background:'#fff', border:'1px solid #e5e7eb', borderTop:'none', borderRadius:'0 0 10px 10px', padding:'6px 0', maxHeight:260, overflowY:'auto' }}>
                {topLevelLessons.map((l:any, i:number) => {
                  const isCurrent = l.id === lesson.id
                  const isDone = completedSet.has(l.id)
                  const subs = allLessons.filter((s:any) => s.parent_lesson_id === l.id)
                  return (
                    <div key={l.id}>
                      {l.locked ? (
                        <div style={{ display:'flex', alignItems:'center', gap:8, padding:'9px 14px', borderLeft:'3px solid transparent', cursor:'not-allowed' }}>
                          <div style={{ width:20, height:20, borderRadius:'50%', background:'#f3f4f6', color:'#ccc', fontSize:10, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>🔒</div>
                          <span style={{ fontSize:13, lineHeight:1.4, color:'#ccc' }}>{l.title}</span>
                        </div>
                      ) : (
                        <a href={`/student/modules/${moduleId}/lessons/${l.id}`}
                          onClick={() => { setNavOpen(false); setActiveTab('main') }}
                          style={{ display:'flex', alignItems:'center', gap:8, padding:'9px 14px', textDecoration:'none', background:isCurrent?'#E6F1FB':'transparent', color:isCurrent?'#0C447C':'#333', borderLeft:isCurrent?'3px solid #185FA5':'3px solid transparent' }}>
                          <div style={{ width:20, height:20, borderRadius:'50%', background:isDone?'#EAF3DE':isCurrent?'#185FA5':'#f3f4f6', color:isDone?'#27500A':isCurrent?'#fff':'#888', fontSize:10, fontWeight:700, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                            {isDone ? '✓' : i+1}
                          </div>
                          <span style={{ fontSize:13, lineHeight:1.4, fontWeight:isCurrent?600:400 }}>{l.title}</span>
                        </a>
                      )}
                      {isCurrent && subs.length > 0 && subs.map((s:any) => (
                        <button key={s.id}
                          onClick={() => { setNavOpen(false); setActiveTab(s.id) }}
                          style={{ display:'flex', alignItems:'center', gap:6, width:'100%', padding:'7px 14px 7px 36px', background: activeTab===s.id?'#dbeafe':'transparent', borderLeft: activeTab===s.id?'3px solid #185FA5':'3px solid transparent', color: activeTab===s.id?'#0C447C':'#888', fontSize:12, cursor:'pointer', border:'none', fontFamily:'inherit', textAlign:'left' }}>
                          <span style={{ fontSize:10 }}>↳</span>
                          <span style={{ fontWeight: activeTab===s.id?600:400 }}>{s.title}</span>
                        </button>
                      ))}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* ── Lesson header ────────────────────────────────────────────── */}
        <div style={{ marginBottom:16 }}>
          {/* Row 1: title + export PDF */}
          <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:12, marginBottom:4, flexWrap:'wrap' }}>
            <h1 style={{ fontSize: isMobile ? 20 : 22, fontWeight:700, margin:0, flex:1, minWidth:0 }}>
              {activeLesson.title}
            </h1>
            <button onClick={exportPDF}
              style={{ padding:'5px 12px', fontSize:12, background:'#fff', border:'1px solid #e5e7eb', borderRadius:8, cursor:'pointer', color:'#888', display:'flex', alignItems:'center', gap:5, whiteSpace:'nowrap', flexShrink:0 }}
              title="Export lesson as printable PDF">
              ⬇ PDF
            </button>
          </div>
          {/* Row 2: author + read time */}
          <div style={{ display:'flex', alignItems:'center', gap:12, flexWrap:'wrap', marginBottom: subLessons.length > 0 ? 14 : 0 }}>
            {authorName && <span style={{ fontSize:12, color:'#aaa' }}>By {authorName}</span>}
            {authorName && readTime && <span style={{ color:'#e5e7eb' }}>·</span>}
            {readTime && <span style={{ fontSize:12, color:'#aaa' }}>🕐 {readTime}</span>}
          </div>
        </div>

        {/* ── Parts of this lesson (sub-lessons) ───────────────────────────── */}
        {subLessons.length > 0 && (
          <div style={{ marginBottom:20 }}>
            <div style={{ fontSize:11, fontWeight:600, color:'#888', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:8 }}>
              Parts of this lesson
            </div>
            <div style={{ display:'flex', flexDirection: isMobile ? 'column' : 'row', gap:8, flexWrap:'wrap' }}>
              {/* If we're on a sub-lesson, show "← Main lesson" link */}
              {activeTab !== 'main' && (
                <button onClick={() => setActiveTab('main')}
                  style={{ display:'flex', alignItems:'center', gap:10, padding:'9px 14px', background:'#fff', color:'#555', border:'2px solid #e5e7eb', borderRadius:10, cursor:'pointer', fontFamily:'inherit', textAlign:'left', flexShrink:0, transition:'all .15s' }}>
                  <div style={{ width:26, height:26, borderRadius:'50%', background:'#E6F1FB', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, flexShrink:0 }}>📖</div>
                  <div>
                    <div style={{ fontSize:12, fontWeight:500 }}>{lesson.title}</div>
                    <div style={{ fontSize:11, color:'#aaa' }}>Main lesson</div>
                  </div>
                </button>
              )}
              {/* Sub-lesson tabs */}
              {subLessons.map((s: any, i: number) => (
                <button key={s.id} onClick={() => setActiveTab(s.id)}
                  style={{ display:'flex', alignItems:'center', gap:10, padding:'9px 14px', background: activeTab===s.id ? '#185FA5' : '#fff', color: activeTab===s.id ? '#fff' : '#555', border: activeTab===s.id ? '2px solid #185FA5' : '2px solid #e5e7eb', borderRadius:10, cursor:'pointer', fontFamily:'inherit', textAlign:'left', flexShrink:0, transition:'all .15s' }}>
                  <div style={{ width:26, height:26, borderRadius:'50%', background: activeTab===s.id ? 'rgba(255,255,255,.2)' : '#f3f4f6', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, flexShrink:0 }}>
                    {i === 0 ? '📝' : i === 1 ? '💻' : '📄'}
                  </div>
                  <div>
                    <div style={{ fontSize:12, fontWeight:600 }}>{s.title}</div>
                    <div style={{ fontSize:11, opacity:0.75 }}>Part {i + 1}</div>
                  </div>
                  {activeTab===s.id && <span style={{ marginLeft:'auto', paddingLeft:8, fontSize:11 }}>✓</span>}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Scroll progress */}
        {scrollPct > 0 && scrollPct < 100 && (
          <div style={{ fontSize:11, color:'#aaa', marginBottom:10, display:'flex', alignItems:'center', gap:8 }}>
            <div style={{ flex:1, height:3, background:'#f0f0f0', borderRadius:2, overflow:'hidden', maxWidth:160 }}>
              <div style={{ height:'100%', width: scrollPct + '%', background:'#185FA5', borderRadius:2 }} />
            </div>
            <span>{scrollPct}% read</span>
          </div>
        )}

        {/* Mobile ToC toggle */}
        {isMobile && tocItems.length > 1 && (
          <div style={{ marginBottom:10 }}>
            <button onClick={() => setTocOpen(o => !o)}
              style={{ width:'100%', padding:'8px 14px', background:'#fff', border:'1px solid #e5e7eb', borderRadius:8, fontSize:13, display:'flex', alignItems:'center', justifyContent:'space-between', cursor:'pointer', fontFamily:'inherit', color:'#555' }}>
              <span>📋 Contents ({tocItems.length})</span>
              <span style={{ color:'#888', fontSize:11 }}>{tocOpen ? '▲ Hide' : '▼ Show'}</span>
            </button>
            {tocOpen && (
              <div style={{ background:'#fff', border:'1px solid #e5e7eb', borderTop:'none', borderRadius:'0 0 8px 8px', padding:'6px 0' }}>
                {tocItems.map(item => (
                  <button key={item.id}
                    onClick={() => {
                      setTocOpen(false)
                      setTimeout(() => {
                        const el = document.getElementById(item.id)
                        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
                      }, 100)
                    }}
                    style={{
                      display:'block', width:'100%', textAlign:'left',
                      padding: item.level === 1 ? '7px 14px' : item.level === 2 ? '6px 14px 6px 24px' : '5px 14px 5px 34px',
                      fontSize: item.level === 1 ? 13 : 12,
                      fontWeight: item.level === 1 ? 500 : 400,
                      color: item.level === 1 ? '#333' : '#666',
                      background:'none', border:'none', cursor:'pointer',
                      lineHeight:1.4, fontFamily:'inherit',
                    }}>
                    {item.level > 1 && <span style={{ color:'#ccc', marginRight:4 }}>{'—'.repeat(item.level - 1)}</span>}
                    {item.text}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Lesson content */}
        <div ref={contentRef} style={{ background:'#fff', border:'1px solid #e5e7eb', borderRadius:12, padding: isMobile ? '16px 14px' : '20px 24px', marginBottom:20 }}>
          {blocks.map((b, i) => (
            <div key={i}>
              {b.type === 'html'   && <HtmlBlock html={b.content} />}
              {b.type === 'code'   && <CodeViewer code={b.content} language={b.language} />}
              {b.type === 'tryit'  && <TryItViewer initialCode={b.content} />}
              {b.type === 'math'   && <MathViewer latex={b.content} />}
            </div>
          ))}
        </div>

        {/* Progress actions */}
        <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:20 }}>
          <button onClick={() => setProgress(status==='completed'?'none':'completed')} disabled={saving}
            style={{ padding:'9px 18px', background:status==='completed'?'#EAF3DE':'#185FA5', color:status==='completed'?'#27500A':'#E6F1FB', border:'none', borderRadius:8, fontSize:13, fontWeight:500, cursor:'pointer', flex: isMobile ? 1 : 'none' }}>
            {status==='completed' ? '✓ Completed' : 'Mark as complete'}
          </button>
          <button onClick={() => setProgress(status==='bookmark'?'none':'bookmark')} disabled={saving}
            style={{ padding:'9px 18px', background:status==='bookmark'?'#FFF3CD':'#f9fafb', color:status==='bookmark'?'#856404':'#555', border:'1px solid', borderColor:status==='bookmark'?'#FFCA2C':'#e5e7eb', borderRadius:8, fontSize:13, fontWeight:500, cursor:'pointer', flex: isMobile ? 1 : 'none' }}>
            {status==='bookmark' ? '🔖 Bookmarked' : '🔖 Save for later'}
          </button>
        </div>

        {/* Prev / Next */}
        <div style={{ display:'flex', flexDirection: isMobile ? 'column' : 'row', gap:10, justifyContent:'space-between' }}>
          <div style={{ width: isMobile ? '100%' : 'auto' }}>
            {prevLesson && (
              <a href={`/student/modules/${moduleId}/lessons/${prevLesson.id}`}
                style={{ display:'flex', alignItems:'center', gap:6, padding:'10px 16px', background:'#fff', border:'1px solid #e5e7eb', borderRadius:8, fontSize:13, textDecoration:'none', color:'#333', width: isMobile ? '100%' : 'auto', justifyContent: isMobile ? 'center' : 'flex-start', boxSizing:'border-box' }}>
                ← {prevLesson.title}
              </a>
            )}
          </div>
          <div style={{ width: isMobile ? '100%' : 'auto' }}>
            {nextLesson && (
              <a href={`/student/modules/${moduleId}/lessons/${nextLesson.id}`}
                style={{ display:'flex', alignItems:'center', gap:6, padding:'10px 16px', background:'#185FA5', color:'#E6F1FB', border:'none', borderRadius:8, fontSize:13, textDecoration:'none', width: isMobile ? '100%' : 'auto', justifyContent: isMobile ? 'center' : 'flex-end', boxSizing:'border-box' }}>
                {nextLesson.title} →
              </a>
            )}
          </div>
        </div>
      </div>


      {/* ── Table of contents sidebar (desktop only, shown when there are headings) */}
      {!isMobile && tocItems.length > 1 && (
        <div style={{ width:200, flexShrink:0, position:'sticky', top:80, maxHeight:'calc(100vh - 100px)', overflowY:'auto' }}>
          <div style={{ background:'#fff', border:'1px solid #e5e7eb', borderRadius:10, padding:'12px 0' }}>
            <div style={{ fontSize:10, fontWeight:700, color:'#888', textTransform:'uppercase', letterSpacing:'.06em', padding:'0 14px 8px' }}>Contents</div>
            {tocItems.map(item => (
              <button key={item.id}
                onClick={() => {
                  const el = document.getElementById(item.id)
                  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
                  setTocActiveId(item.id)
                }}
                style={{
                  display:'block', width:'100%', textAlign:'left',
                  padding: item.level === 1 ? '5px 14px' : item.level === 2 ? '4px 14px 4px 22px' : '3px 14px 3px 30px',
                  fontSize: item.level === 1 ? 12 : 11,
                  fontWeight: tocActiveId === item.id ? 600 : item.level === 1 ? 500 : 400,
                  color: tocActiveId === item.id ? '#185FA5' : item.level === 1 ? '#333' : '#666',
                  background: tocActiveId === item.id ? '#E6F1FB' : 'none',
                  border:'none', borderLeft: tocActiveId === item.id ? '2px solid #185FA5' : '2px solid transparent',
                  cursor:'pointer', lineHeight:1.4, fontFamily:'inherit',
                  whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis',
                }}>
                {item.text}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}