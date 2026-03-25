'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { BackLink } from '@/components/ui'
import { highlightPython, PYTHON_CSS } from '@/lib/highlight'

// Parse lesson HTML into renderable blocks
type ViewBlock = { type: 'html' | 'code' | 'tryit'; content: string }

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
      blocks.push({ type: 'code', content: code })
    } else if (el.nodeType === 1 && el.classList?.contains('cb-tryit')) {
      flush()
      let code = ''
      try { code = decodeURIComponent(el.getAttribute('data-code') ?? '') }
      catch { code = el.getAttribute('data-code') ?? '' }
      blocks.push({ type: 'tryit', content: code })
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
function CodeViewer({ code }: { code: string }) {
  const [copied, setCopied] = useState(false)
  const highlighted = highlightPython(code)
  return (
    <div style={{ background:'#1e1e2e', borderRadius:8, overflow:'hidden', margin:'12px 0' }}>
      <div style={{ background:'#16213e', padding:'6px 14px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <span style={{ fontFamily:'monospace', fontSize:10, color:'#7aa2f7', letterSpacing:'.06em' }}>PYTHON</span>
        <button onClick={() => { navigator.clipboard?.writeText(code); setCopied(true); setTimeout(()=>setCopied(false),1500) }}
          style={{ padding:'2px 8px', fontSize:10, background:'transparent', color:'#7aa2f7', border:'1px solid #7aa2f7', borderRadius:4, cursor:'pointer', fontFamily:'inherit' }}>
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
      <pre style={{ background:'#1e1e2e', color:'#cdd6f4', padding:'14px 16px', fontFamily:'ui-monospace,"Cascadia Code","Fira Code",monospace', fontSize:14, margin:0, whiteSpace:'pre', overflowX:'auto', lineHeight:1.7 }}
        dangerouslySetInnerHTML={{ __html: highlighted }} />
    </div>
  )
}

// ── Try-it viewer — highlighted overlay technique ────────────────────────────
// A <pre> with colored HTML sits behind a transparent <textarea>.
// The textarea captures input; the pre shows colors. They stay in sync.
function TryItViewer({ initialCode }: { initialCode: string }) {
  const [code, setCode] = useState(initialCode)
  const [output, setOutput] = useState<string | null>(null)
  const [running, setRunning] = useState(false)
  const taRef = useRef<HTMLTextAreaElement>(null)
  const preRef = useRef<HTMLPreElement>(null)

  function syncHighlight(val: string) {
    if (preRef.current) preRef.current.innerHTML = highlightPython(val) + '\n'
  }
  function syncHeight() {
    if (!taRef.current) return
    taRef.current.style.height = 'auto'
    taRef.current.style.height = taRef.current.scrollHeight + 'px'
  }
  useEffect(() => { syncHighlight(code); syncHeight() }, [])

  function run() {
    setRunning(true)
    setTimeout(() => { setOutput(runPy(code)); setRunning(false) }, 10)
  }

  const monoFont = 'ui-monospace,"Cascadia Code","Fira Code",monospace'
  const codeStyle: React.CSSProperties = {
    fontFamily: monoFont, fontSize: 14, lineHeight: 1.7,
    padding: '14px 16px', margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all',
    display: 'block', boxSizing: 'border-box', width: '100%',
  }

  return (
    <div style={{ background:'#1a1b26', borderRadius:8, overflow:'hidden', margin:'12px 0', border:'1px solid #2a2a4a' }}>
      <div style={{ background:'#16213e', padding:'7px 14px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <span style={{ fontFamily:'monospace', fontSize:10, color:'#7aa2f7', letterSpacing:'.06em' }}>▶ TRY IT YOURSELF — Python</span>
        <button onClick={run} disabled={running}
          style={{ padding:'4px 12px', fontSize:12, background:'#7aa2f7', color:'#fff', border:'none', borderRadius:5, cursor:'pointer', fontFamily:'inherit', fontWeight:500 }}>
          {running ? 'Running…' : '▶ Run'}
        </button>
      </div>

      {/* Stacked: highlighted pre behind transparent textarea */}
      <div style={{ position:'relative', background:'#1e1e2e' }}>
        {/* Highlighted layer */}
        <pre ref={preRef}
          aria-hidden="true"
          style={{ ...codeStyle, color:'#cdd6f4', background:'transparent', pointerEvents:'none', position:'absolute', inset:0, overflow:'hidden', minHeight:60 }} />
        {/* Editable layer */}
        <textarea
          ref={taRef}
          value={code}
          spellCheck={false}
          onChange={e => {
            setCode(e.target.value)
            syncHighlight(e.target.value)
            syncHeight()
          }}
          onKeyDown={e => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); run() }
            if (e.key === 'Tab') {
              e.preventDefault()
              const s = e.currentTarget.selectionStart, en = e.currentTarget.selectionEnd, v = e.currentTarget.value
              const nv = v.slice(0,s)+'    '+v.slice(en)
              setCode(nv); syncHighlight(nv)
              requestAnimationFrame(() => {
                if (taRef.current) { taRef.current.selectionStart = taRef.current.selectionEnd = s+4 }
              })
            }
          }}
          style={{ ...codeStyle, color:'transparent', caretColor:'#cdd6f4', background:'transparent', border:'none', outline:'none', resize:'none', overflow:'hidden', position:'relative', zIndex:1, minHeight:60 }}
        />
      </div>

      {output !== null && (
        <div style={{ background:'#0d1117', borderTop:'1px solid #2a2a4a', padding:'10px 16px' }}>
          <div style={{ fontSize:10, color:'#6c7086', marginBottom:4, fontFamily:'monospace', letterSpacing:'.05em' }}>OUTPUT</div>
          <pre style={{ color:'#a6e3a1', fontFamily:'ui-monospace,monospace', fontSize:13, margin:0, whiteSpace:'pre-wrap' }}>{output}</pre>
        </div>
      )}
      <div style={{ padding:'4px 14px 6px', fontSize:10, color:'#4a4a6a' }}>Ctrl+Enter to run · Tab for indent</div>
    </div>
  )
}

// ── HTML content block with quiz activation ───────────────────────────────────
function HtmlBlock({ html }: { html: string }) {
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
}

// ── Main viewer ───────────────────────────────────────────────────────────────
export default function LessonViewer({ lesson, moduleId, studentId, completionStatus, allLessons, completedIds, authorName }: {
  lesson: any; moduleId: string; studentId: string
  completionStatus: 'completed' | 'bookmark' | 'none'
  allLessons: any[]; completedIds: string[]; authorName: string
}) {
  const supabase = createClient()
  const [status, setStatus] = useState<'completed'|'bookmark'|'none'>(completionStatus)
  const [saving, setSaving] = useState(false)
  const [blocks, setBlocks] = useState<ViewBlock[]>([])

  const currentIndex = allLessons.findIndex(l => l.id === lesson.id)
  const prevLesson = currentIndex > 0 ? allLessons[currentIndex - 1] : null
  const nextLesson = currentIndex < allLessons.length - 1 ? allLessons[currentIndex + 1] : null
  const completedSet = new Set(completedIds)

  useEffect(() => {
    setBlocks(parseBlocks(lesson.content_html ?? ''))
  }, [lesson.id])

  async function setProgress(newStatus: 'completed'|'bookmark'|'none') {
    setSaving(true)
    if (newStatus === 'none') {
      await supabase.from('lesson_progress').delete().eq('student_id', studentId).eq('lesson_id', lesson.id)
    } else {
      await supabase.from('lesson_progress').upsert({ student_id: studentId, lesson_id: lesson.id, status: newStatus } as any)
    }
    setStatus(newStatus); setSaving(false)
  }

  return (
    <div style={{ display:'flex', gap:22, alignItems:'flex-start' }}>
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

      {/* Left nav */}
      <div style={{ width:210, flexShrink:0, position:'sticky', top:80 }}>
        <div className='dm-nav' style={{ background:'#fff', border:'1px solid #e5e7eb', borderRadius:10, padding:'10px 0', maxHeight:'calc(100vh - 120px)', overflowY:'auto' }}>
          <div style={{ fontSize:10, fontWeight:700, color:'#888', textTransform:'uppercase', letterSpacing:'.06em', padding:'0 14px 8px' }}>Lessons</div>
          {allLessons.map((l:any, i:number) => {
            const isCurrent = l.id === lesson.id
            const isDone = completedSet.has(l.id)
            return (
              <a key={l.id} href={`/student/modules/${moduleId}/lessons/${l.id}`}
                style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 14px', textDecoration:'none', background:isCurrent?'#E6F1FB':'transparent', color:isCurrent?'#0C447C':'#333', borderLeft:isCurrent?'3px solid #185FA5':'3px solid transparent', fontSize:13 }}>
                <div style={{ width:20, height:20, borderRadius:'50%', background:isDone?'#EAF3DE':isCurrent?'#185FA5':'#f3f4f6', color:isDone?'#27500A':isCurrent?'#fff':'#888', fontSize:10, fontWeight:700, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                  {isDone?'✓':i+1}
                </div>
                <span style={{ fontSize:12, lineHeight:1.4, fontWeight:isCurrent?600:400 }}>{l.title}</span>
              </a>
            )
          })}
        </div>
      </div>

      {/* Main content */}
      <div style={{ flex:1, minWidth:0 }}>
        <BackLink href={`/student/modules/${moduleId}`} label="Back to module" />
        <h1 style={{ fontSize:22, fontWeight:700, marginBottom:4 }}>{lesson.title}</h1>
        {authorName && <div style={{ fontSize:12, color:'#888', marginBottom:14 }}>Author: {authorName}</div>}

        <div className='dm-lesson-card' style={{ background:'#fff', border:'1px solid #e5e7eb', borderRadius:12, padding:'20px 24px', marginBottom:20 }}>
          {blocks.map((b, i) => (
            <div key={i}>
              {b.type === 'html' && <HtmlBlock html={b.content} />}
              {b.type === 'code' && <CodeViewer code={b.content} />}
              {b.type === 'tryit' && <TryItViewer initialCode={b.content} />}
            </div>
          ))}
        </div>

        {/* Progress actions */}
        <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:20 }}>
          <button onClick={() => setProgress(status==='completed'?'none':'completed')} disabled={saving}
            style={{ padding:'9px 18px', background:status==='completed'?'#EAF3DE':'#185FA5', color:status==='completed'?'#27500A':'#E6F1FB', border:'none', borderRadius:8, fontSize:13, fontWeight:500, cursor:'pointer' }}>
            {status==='completed' ? '✓ Completed — click to undo' : 'Mark as complete'}
          </button>
          <button onClick={() => setProgress(status==='bookmark'?'none':'bookmark')} disabled={saving}
            style={{ padding:'9px 18px', background:status==='bookmark'?'#FFF3CD':'#f9fafb', color:status==='bookmark'?'#856404':'#555', border:'1px solid', borderColor:status==='bookmark'?'#FFCA2C':'#e5e7eb', borderRadius:8, fontSize:13, fontWeight:500, cursor:'pointer' }}>
            {status==='bookmark' ? '🔖 Bookmarked — click to remove' : '🔖 Come back later'}
          </button>
        </div>

        {/* Prev / Next */}
        <div style={{ display:'flex', gap:10, justifyContent:'space-between' }}>
          <div>{prevLesson && <a href={`/student/modules/${moduleId}/lessons/${prevLesson.id}`} style={{ display:'inline-flex', alignItems:'center', gap:6, padding:'9px 16px', background:'#fff', border:'1px solid #e5e7eb', borderRadius:8, fontSize:13, textDecoration:'none', color:'#333' }}>← {prevLesson.title}</a>}</div>
          <div>{nextLesson && <a href={`/student/modules/${moduleId}/lessons/${nextLesson.id}`} style={{ display:'inline-flex', alignItems:'center', gap:6, padding:'9px 16px', background:'#185FA5', color:'#E6F1FB', border:'none', borderRadius:8, fontSize:13, textDecoration:'none' }}>{nextLesson.title} →</a>}</div>
        </div>
      </div>
    </div>
  )
}
