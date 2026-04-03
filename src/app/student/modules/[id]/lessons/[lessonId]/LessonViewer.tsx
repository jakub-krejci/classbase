'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, useEffect, useRef } from 'react'
import { useIsMobile } from '@/lib/useIsMobile'
import { createClient } from '@/lib/supabase/client'
import { BackLink, Breadcrumb } from '@/components/ui'
import { DarkLayout, D } from '@/components/DarkLayout'
import AiTutor from '@/components/AiTutor'
import { highlightCode, highlightPython, PYTHON_CSS, LANGUAGE_LABELS, type Language } from '@/lib/highlight'

// Parse lesson HTML into renderable blocks
type ViewBlock = {
  type: 'html' | 'code' | 'tryit' | 'math' | 'embed' | 'flashcard' | 'callout'
  content: string; language?: Language
  embedUrl?: string
  front?: string; back?: string
  variant?: string
}

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
    } else if (el.nodeType === 1 && el.classList?.contains('cb-embed')) {
      flush()
      let url = ''
      try { url = decodeURIComponent(el.getAttribute('data-url') ?? '') } catch { url = el.getAttribute('data-url') ?? '' }
      blocks.push({ type: 'embed', content: '', embedUrl: url })
    } else if (el.nodeType === 1 && el.classList?.contains('cb-flashcard')) {
      flush()
      let front = '', back = ''
      try { front = decodeURIComponent(el.getAttribute('data-front') ?? '') } catch { front = el.getAttribute('data-front') ?? '' }
      try { back = decodeURIComponent(el.getAttribute('data-back') ?? '') } catch { back = el.getAttribute('data-back') ?? '' }
      blocks.push({ type: 'flashcard', content: '', front, back })
    } else if (el.nodeType === 1 && el.classList?.contains('cb-callout')) {
      flush()
      blocks.push({ type: 'callout', content: el.innerHTML, variant: el.getAttribute('data-variant') ?? 'info' })
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
    <div className="cb-code-wrapper" style={{ background:'#1c1f2b', borderRadius:10, overflow:'hidden', margin:'1.4em -4px', borderLeft:'3px solid #5b7fa6', boxShadow:'0 3px 12px rgba(0,0,0,.10), 0 1px 3px rgba(0,0,0,.06)' }}>
      <div style={{ background:'#161825', padding:'6px 14px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
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
        <div style={{ width:36, flexShrink:0, background:'#14161f', padding:'14px 6px 14px 0', textAlign:'right', fontFamily:'ui-monospace,monospace', fontSize:12, lineHeight:1.75, color:'#3d4660', userSelect:'none' }}>
          {Array.from({ length: lineCount }, (_, i) => <div key={i}>{i + 1}</div>)}
        </div>
        <pre style={{ flex:1, background:'transparent', color:'#d4d8e8', padding:'14px 16px', fontFamily:'ui-monospace,"Cascadia Code","Fira Code",monospace', fontSize:13.5, margin:0, whiteSpace:'pre-wrap', overflowX:'auto', lineHeight:1.75, wordBreak:'break-word' }}
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
    <div style={{ background:'#1a1b26', borderRadius:8, overflow:'hidden', margin:'1.2em 0', borderLeft:'3px solid #a6e3a1', boxShadow:'0 2px 8px rgba(0,0,0,.07)' }}>
      {/* Header */}
      <div style={{ background:'#161825', padding:'6px 14px', display:'flex', alignItems:'center', gap:8 }}>
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

// ── Embed viewer ──────────────────────────────────────────────────────────────
function EmbedViewer({ url }: { url: string }) {
  if (!url) return null
  function getEmbed(rawUrl: string) {
    const u = rawUrl.trim()
    const yt = u.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]+)/)
    if (yt) return `https://www.youtube.com/embed/${yt[1]}`
    const vi = u.match(/vimeo\.com\/(\d+)/)
    if (vi) return `https://player.vimeo.com/video/${vi[1]}`
    const cp = u.match(/codepen\.io\/([^/]+)\/pen\/([^/?]+)/)
    if (cp) return `https://codepen.io/${cp[1]}/embed/${cp[2]}?default-tab=result`
    return u
  }
  return (
    <div style={{ margin: '16px 0', borderRadius: 10, overflow: 'hidden', boxShadow: '0 2px 12px rgba(0,0,0,.08)' }}>
      <iframe src={getEmbed(url)} allow="accelerometer;autoplay;clipboard-write;encrypted-media;gyroscope;picture-in-picture" allowFullScreen
        style={{ width: '100%', aspectRatio: '16/9', border: 'none', display: 'block' }} />
    </div>
  )
}

// ── Flashcard viewer ───────────────────────────────────────────────────────────
function FlashcardViewer({ front, back }: { front: string; back: string }) {
  const [flipped, setFlipped] = useState(false)
  return (
    <div style={{ margin: '16px 0' }}>
      <style>{`
        .cb-fc-wrap { perspective: 1000px; height: 140px; cursor: pointer; }
        .cb-fc-inner { position: relative; width: 100%; height: 100%; transition: transform .45s cubic-bezier(.4,0,.2,1); transform-style: preserve-3d; }
        .cb-fc-wrap.flipped .cb-fc-inner { transform: rotateY(180deg); }
        .cb-fc-front, .cb-fc-back { position: absolute; inset: 0; backface-visibility: hidden; display: flex; align-items: center; justify-content: center; border-radius: 12px; padding: 20px 24px; font-size: 15px; font-weight: 500; text-align: center; }
        .cb-fc-front { background: rgba(255,255,255,.05); border: 2px solid rgba(255,255,255,.12); color: #F1F5F9; }
        .cb-fc-back  { background: rgba(24,95,165,.18); border: 2px solid rgba(24,95,165,.5); color: #93C5FD; transform: rotateY(180deg); }
      `}</style>
      <div className={`cb-fc-wrap${flipped ? ' flipped' : ''}`} onClick={() => setFlipped(f => !f)}>
        <div className="cb-fc-inner">
          <div className="cb-fc-front">{front || '(no front)'}</div>
          <div className="cb-fc-back">{back || '(no back)'}</div>
        </div>
      </div>
      <div style={{ textAlign: 'center', fontSize: 11, color: 'rgba(255,255,255,.3)', marginTop: 6 }}>
        {flipped ? '↩ Klikni pro otočení zpět' : '🖱 Klikni pro zobrazení odpovědi'}
      </div>
    </div>
  )
}

// ── Callout viewer ─────────────────────────────────────────────────────────────
const CALLOUT_VIEW: Record<string, { bg: string; border: string; icon: string; color: string }> = {
  tip:     { bg: 'rgba(34,197,94,.08)',   border: '#22C55E', icon: '💡', color: '#86efac' },
  warning: { bg: 'rgba(251,191,36,.08)',  border: '#FBBF24', icon: '⚠️', color: '#fde68a' },
  info:    { bg: 'rgba(59,130,246,.08)',  border: '#3B82F6', icon: 'ℹ️', color: '#93C5FD' },
  example: { bg: 'rgba(139,92,246,.08)', border: '#8B5CF6', icon: '✅', color: '#C4B5FD' },
}
function CalloutViewer({ content, variant }: { content: string; variant: string }) {
  const cs = CALLOUT_VIEW[variant] ?? CALLOUT_VIEW.info
  return (
    <div style={{ background: cs.bg, borderLeft: `4px solid ${cs.border}`, borderRadius: '0 8px 8px 0', padding: '12px 16px', margin: '14px 0', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
      <span style={{ fontSize: 18, flexShrink: 0, marginTop: 1 }}>{cs.icon}</span>
      <div style={{ fontSize: 14, lineHeight: 1.65, color: cs.color }} dangerouslySetInnerHTML={{ __html: content }} />
    </div>
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
    // Activate annotation tooltips
    el.querySelectorAll('.cb-annotation').forEach(span => {
      const s = span as HTMLElement
      let note = ''
      try { note = decodeURIComponent(s.getAttribute('data-note') ?? '') } catch { note = s.getAttribute('data-note') ?? '' }
      if (!note) return
      const tip = document.createElement('span')
      tip.className = 'cb-ann-tip'
      tip.textContent = note
      s.style.position = 'relative'
      s.appendChild(tip)
    })
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
<summary style="padding:10px 14px;background:rgba(24,95,165,.18);cursor:pointer;font-size:13px;font-weight:600;color:#93C5FD;list-style:none;display:flex;align-items:center;gap:8px;user-select:none">
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
      row.style.cssText = 'display:flex;align-items:center;gap:10px;padding:9px 12px;border:1px solid rgba(255,255,255,.1);border-radius:9px;margin-bottom:7px;cursor:pointer;font-size:14px;background:rgba(255,255,255,.04);transition:all .15s;user-select:none;color:#E2E8F0'
      row.innerHTML = `<div class="dot" style="width:15px;height:15px;border-radius:50%;border:1.5px solid rgba(255,255,255,.25);flex-shrink:0;transition:all .15s"></div><span>${o}</span>`
      row.onclick = () => {
        if (quiz.dataset.solved) return
        optsEl.querySelectorAll('.dot').forEach((d:any)=>{d.style.background='';d.style.borderColor='#ccc'})
        optsEl.querySelectorAll('div[style*="display:flex"]').forEach((r:any)=>{r.style.background='rgba(255,255,255,.04)';r.style.borderColor='rgba(255,255,255,.1)'})
        const dot = row.querySelector('.dot') as HTMLElement
        if (i === correct) {
          dot.style.background='#22C55E'; dot.style.borderColor='#22C55E'
          row.style.background='rgba(34,197,94,.12)'; row.style.borderColor='rgba(34,197,94,.35)'; row.style.color='#86efac'
          fb.textContent='✓ '+(expl[i]||'Correct!'); fb.style.cssText='display:block;background:rgba(34,197,94,.12);color:#86efac;font-size:13px;padding:8px 11px;border-radius:8px;margin-top:10px;border:1px solid rgba(34,197,94,.2)'
          quiz.dataset.solved='1'
          if(summary){ const last=summary.querySelector('span:last-child') as HTMLElement; if(last)last.textContent='✓ Answered' }
        } else {
          dot.style.background='#EF444460'; dot.style.borderColor='#EF4444'
          row.style.background='rgba(239,68,68,.1)'; row.style.borderColor='rgba(239,68,68,.3)'; row.style.color='#FCA5A5'
          const cr = optsEl.querySelectorAll('div[style*="display:flex"]')[correct] as HTMLElement
          if(cr){const d2=cr.querySelector('.dot') as HTMLElement;if(d2){d2.style.background='#22C55E';d2.style.borderColor='#22C55E'}cr.style.background='rgba(34,197,94,.12)';cr.style.borderColor='rgba(34,197,94,.35)';cr.style.color='#86efac'}
          fb.textContent='✗ '+(expl[i]||'Incorrect.'); fb.style.cssText='display:block;background:rgba(239,68,68,.12);color:#FCA5A5;font-size:13px;padding:8px 11px;border-radius:8px;margin-top:10px;border:1px solid rgba(239,68,68,.2)'
        }
      }
      optsEl.appendChild(row)
    })
  }

  return (
    <div ref={ref} className="lesson-content"
      dangerouslySetInnerHTML={{ __html: html }} />
  )
})

// ── Main viewer ───────────────────────────────────────────────────────────────
export default function LessonViewer({ lesson, moduleId, studentId, completionStatus, allLessons, completedIds, authorName, subLessons = [], profile }: {
  lesson: any; moduleId: string; studentId: string
  completionStatus: 'completed' | 'bookmark' | 'none'
  allLessons: any[]; completedIds: string[]; authorName: string
  subLessons?: any[]; profile?: any
}) {
  const supabase = createClient()
  const isMobile = useIsMobile()
  const [activeTab, setActiveTab] = useState<string>('main')
  const [tocItems, setTocItems] = useState<{ id: string; text: string; level: number }[]>([])
  const [tocActiveId, setTocActiveId] = useState<string>('')
  const [tocOpen, setTocOpen] = useState(false)
  const [status, setStatus] = useState<'completed'|'bookmark'|'none'>(completionStatus)
  const [saving, setSaving] = useState(false)
  const [aiOpen, setAiOpen] = useState(false)
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
    const timer = setTimeout(() => { // 400ms: wait for quiz activation
      const el = contentRef.current
      if (!el) return
      const allHeadings = el.querySelectorAll('h1, h2, h3')
      const items: { id: string; text: string; level: number }[] = []
      let tocIdx = 0
      allHeadings.forEach((h) => {
        // Skip headings inside quiz blocks, fold/collapsible blocks, or any special component
        if (
          h.closest('.cb-quiz') ||          // quiz blocks
          h.closest('details') ||           // fold/collapsible blocks (including quiz after activation)
          h.closest('[data-no-toc]') ||     // explicit opt-out
          h.closest('.cb-callout')          // callout blocks
        ) return
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
                // Update React state for ToC sidebar highlight
                setTocActiveId(entry.target.id)
                // Update DOM attribute for CSS heading highlight
                document.querySelectorAll('.lesson-content [data-toc-active]')
                  .forEach(el => el.removeAttribute('data-toc-active'))
                entry.target.setAttribute('data-toc-active', '1')
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
    }, 400)
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
    blockquote { border-left: 3px solid var(--accent); margin: 12px 0; padding: 4px 16px; color: #555; font-style: italic; }
    table { border-collapse: collapse; width: 100%; margin: 12px 0; }
    td, th { border: 1px solid #ddd; padding: 8px 12px; }
    th { background: #f5f5f5; font-weight: 600; }
    img { max-width: 100%; border-radius: 6px; }
    a { color: var(--accent); }
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
    <DarkLayout profile={profile} activeRoute="/student/modules" fullContent>
    <style>{PYTHON_CSS}{`
        /* ─────────────────────────────────────────────────────────────
           LESSON CONTENT TYPOGRAPHY
           Reading-optimised: literary serif, generous line-height,
           capped measure (~680 px), harmonious vertical rhythm.
        ───────────────────────────────────────────────────────────── */

        .lesson-content {
          font-family: 'Georgia', 'Charter', 'Palatino Linotype', serif;
          font-size: 16px;
          line-height: 1.85;
          color: #E2E8F0;
          max-width: 720px;
          margin: 0 auto;
        }

        /* Paragraphs */
        .lesson-content p { margin: 0 0 1.1em; }
        .lesson-content p:last-child { margin-bottom: 0; }

        /* ── Headings (sans-serif for contrast with body serif) ── */
        .lesson-content h1 {
          font-family: system-ui, -apple-system, sans-serif;
          font-size: 1.55em; font-weight: 700; line-height: 1.25;
          color: #F8FAFC; margin: 1.8em 0 0.45em;
          letter-spacing: -.02em;
        }
        .lesson-content h2 {
          font-family: system-ui, -apple-system, sans-serif;
          font-size: 1.25em; font-weight: 700; line-height: 1.3;
          color: #F1F5F9; margin: 1.6em 0 0.4em;
          letter-spacing: -.01em;
        }
        .lesson-content h3 {
          font-family: system-ui, -apple-system, sans-serif;
          font-size: 1.05em; font-weight: 600; line-height: 1.4;
          color: #E2E8F0; margin: 1.3em 0 0.3em;
        }
        .lesson-content h1:first-child,
        .lesson-content h2:first-child,
        .lesson-content h3:first-child { margin-top: 0; }

        /* ── Active heading — ToC scroll indicator ──────────────────
           Soft background wash + accent left dot.
           No layout shift (uses box-shadow instead of border-left).
        ──────────────────────────────────────────────────────────── */
        .lesson-content h1,
        .lesson-content h2,
        .lesson-content h3 {
          border-radius: 4px;
          padding: 2px 6px;
          margin-left: -6px;
          transition: background .25s, color .25s;
        }
        .lesson-content h1[data-toc-active],
        .lesson-content h2[data-toc-active],
        .lesson-content h3[data-toc-active] {
          background: rgba(24,95,165,.15);
          color: var(--accent);
          box-shadow: -3px 0 0 var(--accent);
        }

        /* ── Lists ── */
        .lesson-content ul { padding-left: 1.6em; margin: 0 0 1.1em; list-style: disc; }
        .lesson-content ol { padding-left: 1.6em; margin: 0 0 1.1em; list-style: decimal; }
        .lesson-content li { margin: 0.35em 0; }
        .lesson-content li > p { margin: 0; }

        /* ── Inline code ── */
        .lesson-content code {
          font-family: ui-monospace, 'Cascadia Code', monospace;
          font-size: 0.84em;
          background: rgba(255,255,255,.1);
          padding: 2px 6px;
          border-radius: 4px;
          color: #93C5FD;
          letter-spacing: 0;
        }

        /* ── Blockquote ── */
        .lesson-content blockquote {
          border-left: 3px solid var(--accent);
          padding: 8px 18px;
          margin: 1.2em 0;
          color: #94A3B8;
          font-style: italic;
          background: rgba(255,255,255,.04);
          border-radius: 0 8px 8px 0;
        }

        /* ── Links ── */
        .lesson-content a { color: var(--accent); text-decoration: underline; text-underline-offset: 3px; }
        .lesson-content a:hover { color: #60A5FA; }

        /* ── Tables ── */
        .lesson-content table { border-collapse: collapse; width: 100%; margin: 1.2em 0; font-size: 0.92em; font-family: system-ui, sans-serif; }
        .lesson-content td, .lesson-content th { border: 1px solid rgba(255,255,255,.1); padding: 9px 13px; }
        .lesson-content th { background: rgba(255,255,255,.06); font-weight: 600; color: #E2E8F0; }
        .lesson-content tr:nth-child(even) td { background: rgba(255,255,255,.02); }

        /* ── Images & embeds ── */
        .lesson-content img { max-width: 100%; border-radius: 8px; margin: 1.2em auto; display: block; box-shadow: 0 1px 6px rgba(0,0,0,.08); }
        .lesson-content iframe { width: 100%; aspect-ratio: 16/9; border: none; border-radius: 10px; margin: 1.2em 0; display: block; }

        /* ── Fold / collapsible ── */
        .lesson-content details { border: 1px solid rgba(255,255,255,.1); border-radius: 9px; margin: 1.2em 0; overflow: hidden; }
        .lesson-content summary { padding: 11px 15px; background: rgba(255,255,255,.05); cursor: pointer; font-weight: 500; list-style: none; font-family: system-ui, sans-serif; font-size: 0.95em; color: #CBD5E1; }
        .lesson-content summary::-webkit-details-marker { display: none; }
        .lesson-content details[open] summary { border-bottom: 1px solid rgba(255,255,255,.1); }
        .lesson-content details > *:not(summary) { padding: 12px 15px; }

        /* ── Code blocks ────────────────────────────────────────────
           Bridge the dark block into the #fafafa card:
           — warm dark background (#1c1f2b) instead of cold #1e1e2e
           — top/bottom breathing room
           — subtle shadow + left accent stripe
           — language label in matching tone
        ──────────────────────────────────────────────────────────── */
        .lesson-content .cb-code-wrapper {
          margin: 1.4em 0;
          border-radius: 10px;
          overflow: hidden;
          border-left: 3px solid #5b7fa6;
          box-shadow: 0 3px 12px rgba(0,0,0,.25);
        }

        /* ── Quiz ── */
        .cb-quiz { background: rgba(24,95,165,.08); border: 1px solid rgba(24,95,165,.3); border-radius: 10px; margin: 1.4em 0; overflow: hidden; }
        .cb-quiz-details summary::-webkit-details-marker { display: none; }

        /* ── Horizontal rule ── */
        .lesson-content hr { border: none; border-top: 1px solid rgba(255,255,255,.1); margin: 2em 0; }

        /* ── Annotation tooltips ── */
        .cb-annotation {
          border-bottom: 2px dotted var(--accent);
          cursor: help;
          position: relative;
        }
        .cb-ann-tip {
          display: none;
          position: absolute;
          bottom: calc(100% + 6px);
          left: 50%;
          transform: translateX(-50%);
          background: #1a1a2e;
          color: #fff;
          font-size: 12px;
          line-height: 1.5;
          padding: 7px 11px;
          border-radius: 7px;
          white-space: pre-wrap;
          max-width: 260px;
          min-width: 120px;
          text-align: left;
          z-index: 50;
          box-shadow: 0 4px 14px rgba(0,0,0,.25);
          pointer-events: none;
        }
        .cb-ann-tip::after {
          content: '';
          position: absolute;
          top: 100%;
          left: 50%;
          transform: translateX(-50%);
          border: 5px solid transparent;
          border-top-color: #1a1a2e;
        }
        .cb-annotation:hover .cb-ann-tip { display: block; }
        .lesson-content > p:first-of-type {
          font-size: 1.07em;
          color: #CBD5E1;
          line-height: 1.9;
        }

        /* ── Overlay sidebars ── */
        /* ── Left nav: sticky in-flow sidebar ── */
        .cb-sidebar-left {
          width: 210px;
          flex-shrink: 0;
          position: sticky;
          top: 80px;
          max-height: calc(100vh - 100px);
          overflow-y: auto;
          background: #fff;
          border: 1px solid #e5e7eb;
          border-radius: 10px;
          padding: 10px 0;
          align-self: flex-start;
        }

        /* ── Right ToC: hover-expand overlay ── */
        .cb-sidebar-right {
          position: fixed;
          top: 52px;
          right: 0;
          height: calc(100vh - 52px);
          z-index: 40;
          display: flex;
          align-items: stretch;
        }
        .cb-sidebar-strip {
          width: 28px;
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 16px 0;
          gap: 6px;
          cursor: pointer;
          flex-shrink: 0;
          background: #f0f4ff;
          border-left: 1px solid #dbe4ff;
          transition: background .15s;
        }
        .cb-sidebar-right:hover .cb-sidebar-strip { background: #e0eaff; }

        .cb-sidebar-panel {
          width: 0;
          overflow: hidden;
          transition: width .22s cubic-bezier(.4,0,.2,1);
          background: #fff;
          border-left: 1px solid #e5e7eb;
          box-shadow: -4px 0 16px rgba(0,0,0,.08);
        }
        .cb-sidebar-right:hover .cb-sidebar-panel { width: 200px; }

        .cb-sidebar-panel-inner {
          width: 200px;
          height: 100%;
          overflow-y: auto;
          padding: 14px 0;
        }

        /* Strip lines for ToC */
        .cb-strip-line {
          width: 14px; height: 2px;
          border-radius: 1px;
          background: #c7d3ff;
          flex-shrink: 0;
        }
        .cb-strip-line.h1 { width: 14px; }
        .cb-strip-line.h2 { width: 10px; }
        .cb-strip-line.h3 { width: 7px; }

        /* ── ToC + AI floating buttons ── */
        .cb-float-btns { position:sticky; top:16px; float:right; margin-left:12px; z-index:20;
          display:flex; flex-direction:column; gap:8px; margin-bottom:-120px; }
        .cb-toc-float { position:relative; }
        /* Wide invisible bridge so mouse can reach the popover without hover dropping */
        .cb-toc-float::before { content:''; position:absolute; right:0; top:-8px; width:260px; height:calc(100% + 16px); }
        .cb-toc-popover { display:none; position:absolute; right:42px; top:-8px; width:210px;
          background:#14171F; border:1px solid rgba(255,255,255,.09); border-radius:12px;
          padding:10px 0; box-shadow:0 12px 40px rgba(0,0,0,.6); z-index:50; }
        .cb-toc-float:hover .cb-toc-popover { display:block; }
        .cb-float-btn { width:32px; height:32px; border-radius:50%;
          background:rgba(255,255,255,.07); border:1px solid rgba(255,255,255,.12);
          color:rgba(255,255,255,.4); display:flex; align-items:center; justify-content:center;
          cursor:pointer; font-size:15px; transition:all .15s; }
        .cb-float-btn:hover { background:rgba(255,255,255,.14)!important; color:#fff!important; }
        .cb-float-btn.ai-active { background:rgba(139,92,246,.2)!important; border-color:rgba(139,92,246,.4)!important; color:#C4B5FD!important; }

        /* ── Fixed bottom footer (progress actions) ── */
        .lv-footer {
          position: fixed; bottom: 0; left: 64px; right: 272px;
          height: 56px; background: rgba(9,11,16,.92); backdrop-filter: blur(12px);
          border-top: 1px solid rgba(255,255,255,.08); z-index: 50;
          display: flex; align-items: center; justify-content: center; gap: 10px;
          padding: 0 24px;
        }

        /* ── Fixed AI Tutor button (bottom right, offset from right panel) ── */
        .lv-ai-btn {
          position: fixed; bottom: 70px; right: 288px; z-index: 60;
          width: 48px; height: 48px; border-radius: 50%;
          background: linear-gradient(135deg,#7c3aed,#4f46e5);
          border: none; cursor: pointer; font-size: 22px;
          display: flex; align-items: center; justify-content: center;
          box-shadow: 0 4px 20px rgba(124,58,237,.5);
          transition: transform .15s, box-shadow .15s;
        }
        .lv-ai-btn:hover { transform: scale(1.08); box-shadow: 0 6px 28px rgba(124,58,237,.65); }
        .lv-ai-btn.active { background: linear-gradient(135deg,#4f46e5,#7c3aed); }

        /* ── Progress dots (left of main content) ── */
        .lv-dots { position:sticky; top:80px; width:20px; flex-shrink:0; display:flex; flex-direction:column; align-items:center; gap:0; padding-top:4px; }
        .lv-dot { width:6px; height:6px; border-radius:50%; background:rgba(255,255,255,.12); cursor:pointer; flex-shrink:0; transition:all .2s; position:relative; }
        .lv-dot.h2 { width:5px; height:5px; }
        .lv-dot.h3 { width:4px; height:4px; }
        .lv-dot.active { background:var(--accent); box-shadow:0 0 6px var(--accent); transform:scale(1.3); }
        .lv-dot:hover { background:rgba(255,255,255,.5); transform:scale(1.4); }
        .lv-dot-line { width:1px; height:14px; background:rgba(255,255,255,.07); flex-shrink:0; }
        /* Tooltip on hover */
        .lv-dot::after { content:attr(data-title); position:absolute; left:14px; top:50%; transform:translateY(-50%); white-space:nowrap; background:#14171F; color:rgba(255,255,255,.75); font-size:11px; padding:4px 9px; border-radius:7px; border:1px solid rgba(255,255,255,.1); pointer-events:none; opacity:0; transition:opacity .15s; z-index:20; font-family:'DM Sans',system-ui,sans-serif; max-width:200px; overflow:hidden; text-overflow:ellipsis; }
        .lv-dot:hover::after { opacity:1; }

        /* ── Right panel ToC section ── */
        .lv-rp-toc-item { display:block; width:100%; text-align:left; border:none; background:none; cursor:pointer; font-family:inherit; transition:all .12s; }
        .lv-rp-toc-item:hover { background:rgba(255,255,255,.04) !important; }

        /* ── AI Tutor slide panel ── */
        .cb-ai-panel { position:fixed; bottom:60px; right:88px; width:380px; height:520px;
          background:#0D0F16; border:1px solid rgba(255,255,255,.08); border-bottom:none;
          border-radius:16px; display:flex; flex-direction:column;
          box-shadow:0 -8px 40px rgba(0,0,0,.6); z-index:100;
          transform:scale(.9); opacity:0; pointer-events:none; transition:all .25s cubic-bezier(.4,0,.2,1); overflow:hidden; }
        .cb-ai-panel.open { transform:scale(1); opacity:1; pointer-events:auto; }

        /* First paragraph dark */
        .lesson-content > p:first-of-type { font-size:1.05em; color:#CBD5E1; line-height:1.9; }

        /* ── Teacher-generated content overrides ── */
        /* Attached file links (📎 File button output) */
        .lesson-content a[download],
        .lesson-content a[style*="background:#f3f4f6"],
        .lesson-content a[style*="background: #f3f4f6"] {
          background: rgba(255,255,255,.06) !important;
          border-color: rgba(255,255,255,.1) !important;
          color: var(--accent) !important;
        }

        /* Inline code spans (Consolas font from editor) */
        .lesson-content [style*="font-family:Consolas"],
        .lesson-content [style*="font-family: Consolas"],
        .lesson-content [style*="font-family:monospace"],
        .lesson-content code {
          background: rgba(255,255,255,.1) !important;
          color: #93C5FD !important;
          border-radius: 4px !important;
          padding: 1px 5px !important;
        }

        /* Table headers (th) with light background from editor */
        .lesson-content th[style*="background"],
        .lesson-content th {
          background: rgba(255,255,255,.07) !important;
          color: #E2E8F0 !important;
          border-color: rgba(255,255,255,.1) !important;
        }
        .lesson-content td {
          border-color: rgba(255,255,255,.08) !important;
          color: #CBD5E1 !important;
        }
        .lesson-content tr:nth-child(even) td {
          background: rgba(255,255,255,.02) !important;
        }

        /* Quiz blocks from HtmlBlock (cb-quiz class) */
        .lesson-content .cb-quiz {
          background: rgba(24,95,165,.08) !important;
          border-color: rgba(24,95,165,.3) !important;
        }
        .lesson-content .cb-quiz summary {
          background: rgba(24,95,165,.18) !important;
          color: #93C5FD !important;
        }
        .lesson-content .cb-quiz .qinner {
          color: #E2E8F0 !important;
        }

        /* Inline code from quiz/HtmlBlock */
        .lesson-content .cb-quiz code,
        .lesson-content .qinner code {
          background: rgba(255,255,255,.12) !important;
          color: #93C5FD !important;
        }
      `}</style>

      {/* Scroll progress bar */}
      <div style={{ position:'fixed', top:0, left:64, right:0, height:3, background:'rgba(255,255,255,.07)', zIndex:49, pointerEvents:'none' }}>
        <div style={{ height:'100%', width: scrollPct + '%', background: scrollPct >= 100 ? '#22C55E' : 'var(--accent)', transition:'width .4s ease', borderRadius:'0 2px 2px 0' }} />
      </div>



      {/* ── New layout: flex row with scrollable main + sticky right panel ── */}
      {/* ── Three-column: ToC sidebar | main | right panel ── */}
      {/* All inside fullContent flex container from DarkLayout */}
      <div style={{ display:'flex', flex:1, minHeight:0, overflow:'hidden', width:'100%' }}>

      {/* ── Progress dots (left of main, sticky) ── */}
      {tocItems.length > 1 && (
        <div className="lv-dots">
          {tocItems.map((item, i) => (
            <React.Fragment key={item.id}>
              {i > 0 && <div className="lv-dot-line" />}
              <div
                className={`lv-dot${item.level===2?' h2':item.level===3?' h3':''}${tocActiveId===item.id?' active':''}`}
                data-title={item.text}
                onClick={() => {
                  const el = document.getElementById(item.id)
                  const main = document.querySelector('.lv-main') as HTMLElement
                  if (el && main) main.scrollTo({ top: el.offsetTop - 60, behavior: 'smooth' })
                  setTocActiveId(item.id)
                }}
              />
            </React.Fragment>
          ))}
        </div>
      )}

      {/* ── Main content (scrollable) ── */}
      <div className="lv-main" style={{ flex:1, minWidth:0, overflowY:'auto', padding:'24px 28px 100px' }}>
        {/* Breadcrumb */}
        <div style={{ fontSize:12, color:D.txtSec, marginBottom:14, display:'flex', gap:6, flexWrap:'wrap', alignItems:'center' }}>
          <a href="/student/modules" style={{ color:D.txtSec, textDecoration:'none' }}>Moduly</a>
          <span>/</span>
          <a href={`/student/modules/${moduleId}`} style={{ color:D.txtSec, textDecoration:'none' }}>{lesson.module_title ?? 'Modul'}</a>
          <span>/</span>
          <span style={{ color:D.txtPri }}>{lesson.title}</span>
        </div>

        {/* Mobile: inline lesson nav */}
        {isMobile && (
          <div style={{ marginBottom:12 }}>
            <button onClick={() => setNavOpen(o => !o)}
              style={{ width:'100%', padding:'10px 14px', background:'rgba(255,255,255,.06)', border:'1px solid rgba(255,255,255,.1)', borderRadius:10, fontSize:13, display:'flex', alignItems:'center', justifyContent:'space-between', cursor:'pointer', fontFamily:'inherit', color:'rgba(255,255,255,.6)' }}>
              <span>📚 Lesson {currentIndex+1} of {topLevelLessons.length}: <strong style={{ color:'#111' }}>{lesson.title}</strong></span>
              <span style={{ color:'rgba(255,255,255,.35)' }}>{navOpen ? '▲' : '▼'}</span>
            </button>
            {navOpen && (
              <div style={{ background:'#14171F', border:'1px solid rgba(255,255,255,.08)', borderTop:'none', borderRadius:'0 0 10px 10px', padding:'6px 0', maxHeight:260, overflowY:'auto' }}>
                {topLevelLessons.map((l:any, i:number) => {
                  const isCurrent = l.id === lesson.id
                  const isDone = completedSet.has(l.id)
                  const subs = allLessons.filter((s:any) => s.parent_lesson_id === l.id)
                  return (
                    <div key={l.id}>
                      {l.locked ? (
                        <div style={{ display:'flex', alignItems:'center', gap:8, padding:'9px 14px', borderLeft:'3px solid transparent', cursor:'not-allowed' }}>
                          <div style={{ width:20, height:20, borderRadius:'50%', background:'rgba(255,255,255,.06)', color:'rgba(255,255,255,.25)', fontSize:10, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>🔒</div>
                          <span style={{ fontSize:13, lineHeight:1.4, color:'#ccc' }}>{l.title}</span>
                        </div>
                      ) : (
                        <a href={`/student/modules/${moduleId}/lessons/${l.id}`}
                          onClick={() => { setNavOpen(false); setActiveTab('main') }}
                          style={{ display:'flex', alignItems:'center', gap:8, padding:'9px 14px', textDecoration:'none', background:isCurrent?'rgba(255,255,255,.08)':'transparent', color:isCurrent?'#fff':'rgba(255,255,255,.6)', borderLeft:isCurrent?'3px solid var(--accent)':'3px solid transparent' }}>
                          <div style={{ width:20, height:20, borderRadius:'50%', background:isDone?'#22C55E20':isCurrent?'var(--accent)':'rgba(255,255,255,.06)', color:isDone?'#22C55E':isCurrent?'#fff':'rgba(255,255,255,.4)', fontSize:10, fontWeight:700, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                            {isDone ? '✓' : i+1}
                          </div>
                          <span style={{ fontSize:13, lineHeight:1.4, fontWeight:isCurrent?600:400 }}>{l.title}</span>
                        </a>
                      )}
                      {isCurrent && subs.length > 0 && subs.map((s:any) => (
                        <button key={s.id}
                          onClick={() => { setNavOpen(false); setActiveTab(s.id) }}
                          style={{ display:'flex', alignItems:'center', gap:6, width:'100%', padding:'7px 14px 7px 36px', background: activeTab===s.id?'rgba(255,255,255,.06)':'transparent', borderLeft: activeTab===s.id?'3px solid var(--accent)':'3px solid transparent', color: activeTab===s.id?'var(--accent)':'rgba(255,255,255,.45)', fontSize:12, cursor:'pointer', border:'none', fontFamily:'inherit', textAlign:'left' }}>
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
              style={{ padding:'5px 12px', fontSize:12, background:'rgba(255,255,255,.06)', border:'1px solid rgba(255,255,255,.1)', borderRadius:8, cursor:'pointer', color:'rgba(255,255,255,.45)', display:'flex', alignItems:'center', gap:5, whiteSpace:'nowrap', flexShrink:0 }}
              title="Export lesson as printable PDF">
              ⬇ PDF
            </button>
          </div>
          {/* Row 2: author + read time */}
          <div style={{ display:'flex', alignItems:'center', gap:12, flexWrap:'wrap', marginBottom: subLessons.length > 0 ? 14 : 0 }}>
            {authorName && <span style={{ fontSize:12, color:'rgba(255,255,255,.4)' }}>✍ {authorName}</span>}
            {authorName && readTime && <span style={{ color:'rgba(255,255,255,.2)' }}>·</span>}
            {readTime && <span style={{ fontSize:12, color:'rgba(255,255,255,.35)' }}>🕐 {readTime}</span>}
          </div>
        </div>

        {/* ── Části lekce (sub-lessons) ───────────────────────────── */}
        {subLessons.length > 0 && (
          <div style={{ marginBottom:20 }}>
            <div style={{ fontSize:11, fontWeight:600, color:'rgba(255,255,255,.4)', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:8 }}>
              Části lekce
            </div>
            <div style={{ display:'flex', flexDirection: isMobile ? 'column' : 'row', gap:8, flexWrap:'wrap' }}>
              {/* If we're on a sub-lesson, show "← Hlavní lekce" link */}
              {activeTab !== 'main' && (
                <button onClick={() => setActiveTab('main')}
                  style={{ display:'flex', alignItems:'center', gap:10, padding:'9px 14px', background:'rgba(255,255,255,.05)', color:'rgba(255,255,255,.7)', border:'2px solid rgba(255,255,255,.1)', borderRadius:10, cursor:'pointer', fontFamily:'inherit', textAlign:'left', flexShrink:0, transition:'all .15s' }}>
                  <div style={{ width:26, height:26, borderRadius:'50%', background:'rgba(255,255,255,.1)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, flexShrink:0 }}>📖</div>
                  <div>
                    <div style={{ fontSize:12, fontWeight:500 }}>{lesson.title}</div>
                    <div style={{ fontSize:11, opacity:.5 }}>Hlavní lekce</div>
                  </div>
                </button>
              )}
              {/* Sub-lesson tabs */}
              {subLessons.map((s: any, i: number) => (
                <button key={s.id} onClick={() => setActiveTab(s.id)}
                  style={{ display:'flex', alignItems:'center', gap:10, padding:'9px 14px', background: activeTab===s.id ? 'var(--accent)' : 'rgba(255,255,255,.05)', color: activeTab===s.id ? '#fff' : 'rgba(255,255,255,.7)', border: activeTab===s.id ? '2px solid var(--accent)' : '2px solid rgba(255,255,255,.1)', borderRadius:10, cursor:'pointer', fontFamily:'inherit', textAlign:'left', flexShrink:0, transition:'all .15s' }}>
                  <div style={{ width:26, height:26, borderRadius:'50%', background: activeTab===s.id ? 'rgba(255,255,255,.2)' : 'rgba(255,255,255,.08)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, flexShrink:0 }}>
                    {i === 0 ? '📝' : i === 1 ? '💻' : '📄'}
                  </div>
                  <div>
                    <div style={{ fontSize:12, fontWeight:600 }}>{s.title}</div>
                    <div style={{ fontSize:11, opacity:0.6 }}>Část {i + 1}</div>
                  </div>
                  {activeTab===s.id && <span style={{ marginLeft:'auto', paddingLeft:8, fontSize:11 }}>✓</span>}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Scroll progress */}
        {scrollPct > 0 && scrollPct < 100 && (
          <div style={{ fontSize:11, color:'rgba(255,255,255,.3)', marginBottom:10, display:'flex', alignItems:'center', gap:8 }}>
            <div style={{ flex:1, height:3, background:'rgba(255,255,255,.08)', borderRadius:2, overflow:'hidden', maxWidth:160 }}>
              <div style={{ height:'100%', width: scrollPct + '%', background:'var(--accent)', borderRadius:2 }} />
            </div>
            <span>{scrollPct}% přečteno</span>
          </div>
        )}

        {/* Mobile ToC toggle */}
        {isMobile && tocItems.length > 1 && (
          <div style={{ marginBottom:10 }}>
            <button onClick={() => setTocOpen(o => !o)}
              style={{ width:'100%', padding:'8px 14px', background:'rgba(255,255,255,.05)', border:'1px solid rgba(255,255,255,.1)', borderRadius:8, fontSize:13, display:'flex', alignItems:'center', justifyContent:'space-between', cursor:'pointer', fontFamily:'inherit', color:'rgba(255,255,255,.5)' }}>
              <span>📋 Contents ({tocItems.length})</span>
              <span style={{ color:'rgba(255,255,255,.3)', fontSize:11 }}>{tocOpen ? '▲ Skrýt' : '▼ Zobrazit'}</span>
            </button>
            {tocOpen && (
              <div style={{ background:'#14171F', border:'1px solid rgba(255,255,255,.08)', borderTop:'none', borderRadius:'0 0 8px 8px', padding:'6px 0' }}>
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
                      color: item.level === 1 ? 'rgba(255,255,255,.7)' : 'rgba(255,255,255,.45)',
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
        <div ref={contentRef} style={{ background:'rgba(255,255,255,.03)', border:'1px solid rgba(255,255,255,.07)', borderRadius:14, padding:'32px 40px', marginBottom:20 }}>
          {blocks.map((b, i) => (
            <div key={i} style={{ maxWidth:720, margin:'0 auto' }}>
              {b.type === 'html'      && <HtmlBlock html={b.content} />}
              {b.type === 'code'      && <CodeViewer code={b.content} language={b.language} />}
              {b.type === 'tryit'     && <TryItViewer initialCode={b.content} />}
              {b.type === 'math'      && <MathViewer latex={b.content} />}
              {b.type === 'embed'     && <EmbedViewer url={b.embedUrl ?? ''} />}
              {b.type === 'flashcard' && <FlashcardViewer front={b.front ?? ''} back={b.back ?? ''} />}
              {b.type === 'callout'   && <CalloutViewer content={b.content} variant={b.variant ?? 'info'} />}
            </div>
          ))}
        </div>



        {/* Prev / Next */}
        <div style={{ display:'flex', flexDirection: isMobile ? 'column' : 'row', gap:10, justifyContent:'space-between' }}>
          <div style={{ width: isMobile ? '100%' : 'auto' }}>
            {prevLesson && (
              <a href={`/student/modules/${moduleId}/lessons/${prevLesson.id}`}
                style={{ display:'flex', alignItems:'center', gap:6, padding:'10px 16px', background:D.bgCard, border:`1px solid ${D.border}`, borderRadius:8, fontSize:13, textDecoration:'none', color:D.txtSec, boxSizing:'border-box' as const }}>
                ← {prevLesson.title}
              </a>
            )}
          </div>
          <div style={{ width: isMobile ? '100%' : 'auto' }}>
            {nextLesson && (
              <a href={`/student/modules/${moduleId}/lessons/${nextLesson.id}`}
                style={{ display:'flex', alignItems:'center', gap:6, padding:'10px 16px', background:'var(--accent)', color:'#fff', border:'none', borderRadius:8, fontSize:13, textDecoration:'none', boxSizing:'border-box' as const }}>
                {nextLesson.title} →
              </a>
            )}
          </div>
        </div>
      </div>

      {/* ── RIGHT PANEL ── */}
      <div style={{ width:272, flexShrink:0, borderLeft:`1px solid ${D.border}`, background:D.bgCard, display:'flex', flexDirection:'column', overflow:'hidden' }}>

        {/* Module header */}
        <div style={{ padding:'14px 16px 10px', borderBottom:`1px solid ${D.border}`, flexShrink:0 }}>
          <a href={`/student/modules/${moduleId}`} style={{ fontSize:11, color:D.txtSec, textDecoration:'none', display:'block', marginBottom:4 }}>← Zpět na modul</a>
          <div style={{ fontSize:13, fontWeight:700, color:D.txtPri, lineHeight:1.3 }}>{lesson.module_title ?? 'Modul'}</div>
          <div style={{ fontSize:11, color:D.txtSec, marginTop:2 }}>{topLevelLessons.length} lekcí</div>
        </div>

        {/* ToC in right panel — above lesson list */}
        {tocItems.length > 1 && (
          <div style={{ borderBottom:`1px solid ${D.border}`, flexShrink:0, maxHeight:220, overflowY:'auto' }}>
            <div style={{ padding:'10px 16px 6px', fontSize:10, fontWeight:700, color:'rgba(255,255,255,.3)', textTransform:'uppercase', letterSpacing:'.07em', display:'flex', alignItems:'center', gap:6 }}>
              <span>≡</span> Obsah lekce
            </div>
            {tocItems.map(item => (
              <button key={item.id} className="lv-rp-toc-item"
                onClick={() => {
                  const el = document.getElementById(item.id)
                  const main = document.querySelector('.lv-main') as HTMLElement
                  if (el && main) main.scrollTo({ top: el.offsetTop - 60, behavior: 'smooth' })
                  setTocActiveId(item.id)
                }}
                style={{ padding: item.level===1 ? '5px 16px' : item.level===2 ? '4px 16px 4px 26px' : '3px 16px 3px 36px', fontSize:11, fontWeight: tocActiveId===item.id ? 600 : 400, color: tocActiveId===item.id ? 'var(--accent)' : 'rgba(255,255,255,.45)', borderLeft:`2px solid ${tocActiveId===item.id ? 'var(--accent)' : 'transparent'}` }}>
                {item.text}
              </button>
            ))}
          </div>
        )}

        {/* Lesson list — scrollable */}
        <div style={{ flex:1, overflowY:'auto' }}>
          {topLevelLessons.map((l:any, i:number) => {
            const isCurrent = l.id === lesson.id
            const isDone = completedSet.has(l.id) || (isCurrent && status === 'completed')
            const isVid = l.lesson_type === 'video'
            const subs = allLessons.filter((s:any) => s.parent_lesson_id === l.id)
            if (l.locked) return (
              <div key={l.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 16px', opacity:.4, borderLeft:'3px solid transparent' }}>
                <div style={{ width:24, height:24, borderRadius:'50%', background:'rgba(255,255,255,.06)', color:D.txtSec, display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, flexShrink:0 }}>🔒</div>
                <span style={{ fontSize:12, color:D.txtSec, flex:1 }}>{l.title}</span>
              </div>
            )
            return (
              <div key={l.id}>
                <a href={`/student/modules/${moduleId}/lessons/${l.id}`}
                  style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 16px', textDecoration:'none', background:isCurrent?'var(--accent)15':'transparent', borderLeft:`3px solid ${isCurrent?'var(--accent)':'transparent'}`, transition:'background .12s' }}>
                  <div style={{ width:24, height:24, borderRadius:'50%', background:isDone?'#22C55E20':isCurrent?'rgba(255,255,255,.15)':'rgba(255,255,255,.06)', color:isDone?'#22C55E':isCurrent?'#fff':D.txtSec, display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:700, flexShrink:0 }}>
                    {isDone?'✓':isVid?'▶':i+1}
                  </div>
                  <span style={{ fontSize:12, color:isCurrent?'#fff':D.txtSec, fontWeight:isCurrent?600:400, flex:1, lineHeight:1.4 }}>{l.title}</span>
                </a>
                {isCurrent && subs.length > 0 && subs.map((s:any) => (
                  <button key={s.id} onClick={() => setActiveTab(s.id===activeTab?'main':s.id)}
                    style={{ display:'flex', alignItems:'center', gap:6, width:'100%', padding:'7px 16px 7px 50px', background:activeTab===s.id?'rgba(255,255,255,.05)':'transparent', borderLeft:`3px solid ${activeTab===s.id?'var(--accent)':'transparent'}`, color:activeTab===s.id?'var(--accent)':D.txtSec, fontSize:11, cursor:'pointer', border:'none', fontFamily:'inherit', textAlign:'left' }}>
                    <span style={{ fontSize:10, opacity:.6 }}>↳</span>
                    <span style={{ fontWeight:activeTab===s.id?600:400 }}>{s.title}</span>
                  </button>
                ))}
              </div>
            )
          })}
        </div>

      </div>

      {/* AI Tutor slide-up panel */}
      <div className={`cb-ai-panel${aiOpen?' open':''}`}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'14px 16px', borderBottom:`1px solid rgba(255,255,255,.08)`, flexShrink:0 }}>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <span style={{ fontSize:20 }}>🤖</span>
            <div>
              <div style={{ fontSize:13, fontWeight:700, color:'#fff' }}>AI Tutor</div>
              <div style={{ fontSize:10, color:'rgba(255,255,255,.4)' }}>{activeLesson.title}</div>
            </div>
          </div>
          <button onClick={() => setAiOpen(false)} style={{ background:'none', border:'none', cursor:'pointer', color:'rgba(255,255,255,.4)', fontSize:18, padding:4, lineHeight:1 }}>✕</button>
        </div>
        <div style={{ flex:1, overflow:'hidden', display:'flex', flexDirection:'column' }}>
          <AiTutor lessonTitle={activeLesson.title} contentHtml={activeLesson.content_html ?? ''} isMobile={false} />
        </div>
      </div>

      </div>{/* end flex row */}

      {/* ── Fixed bottom footer: progress actions ── */}
      <div className="lv-footer">
        <button onClick={() => setProgress(status==='completed'?'none':'completed')} disabled={saving}
          style={{ padding:'9px 28px', background:status==='completed'?'rgba(34,197,94,.15)':'var(--accent)', color:status==='completed'?'#22C55E':'#fff', border:`1px solid ${status==='completed'?'rgba(34,197,94,.3)':'transparent'}`, borderRadius:9, fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:'inherit' }}>
          {status==='completed' ? '✓ Dokončeno' : 'Označit jako dokončené'}
        </button>
        <button onClick={() => setProgress(status==='bookmark'?'none':'bookmark')} disabled={saving}
          title={status==='bookmark' ? 'Odebrat záložku' : 'Uložit na později'}
          style={{ padding:'9px 16px', background:status==='bookmark'?'rgba(251,191,36,.15)':'rgba(255,255,255,.06)', color:status==='bookmark'?'#FBBF24':'rgba(255,255,255,.4)', border:`1px solid ${status==='bookmark'?'rgba(251,191,36,.35)':'rgba(255,255,255,.1)'}`, borderRadius:9, fontSize:13, cursor:'pointer', fontFamily:'inherit', display:'flex', alignItems:'center', gap:6 }}>
          🔖 {status==='bookmark' ? 'Uloženo' : 'Uložit na později'}
        </button>
      </div>

      {/* ── Fixed AI Tutor button ── */}
      <button className={`lv-ai-btn${aiOpen?' active':''}`} onClick={() => setAiOpen(o=>!o)} title="AI Tutor">
        🎓
      </button>
    </DarkLayout>
  )
}