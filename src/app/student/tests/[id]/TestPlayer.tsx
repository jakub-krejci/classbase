'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { highlightPython, PYTHON_CSS } from '@/lib/highlight'

type Phase = 'start' | 'playing' | 'submitted' | 'locked' | 'timed_out'

function formatTime(s: number) {
  const m = Math.floor(s / 60), sec = s % 60
  return `${m}:${sec.toString().padStart(2, '0')}`
}

// ── Confirm modal (replaces browser confirm()) ────────────────────────────────
function ConfirmModal({ title, body, confirmLabel, onConfirm, onCancel }: {
  title: string; body: string; confirmLabel: string; onConfirm: () => void; onCancel: () => void
}) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ background: '#fff', borderRadius: 16, padding: 32, maxWidth: 420, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,.2)' }}>
        <div style={{ fontSize: 40, textAlign: 'center', marginBottom: 16 }}>📋</div>
        <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 10px', textAlign: 'center' }}>{title}</h2>
        <p style={{ fontSize: 14, color: '#555', lineHeight: 1.7, margin: '0 0 24px', textAlign: 'center' }}>{body}</p>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onCancel}
            style={{ flex: 1, padding: '11px', border: '1px solid #e5e7eb', borderRadius: 10, background: '#f9fafb', cursor: 'pointer', fontSize: 14, fontWeight: 500 }}>
            Cancel
          </button>
          <button onClick={onConfirm}
            style={{ flex: 1, padding: '11px', border: 'none', borderRadius: 10, background: '#27500A', color: '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 700 }}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}


// ── Coding editor (Pyodide-powered) with submit ───────────────────────────────
function CodingEditor({ starterCode, savedCode, onSubmit }: {
  starterCode: string; savedCode: string; onSubmit: (code: string) => void
}) {
  const [code, setCode] = useState(savedCode || starterCode || '')
  const [output, setOutput] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [running, setRunning] = useState(false)
  const [pyReady, setPyReady] = useState(false)
  const [pyLoading, setPyLoading] = useState(false)
  const [fontSize, setFontSize] = useState(14)
  const [outputHistory, setOutputHistory] = useState<string[]>([])
  const [pkgStatus, setPkgStatus] = useState('')
  const [images, setImages] = useState<string[]>([])
  const [submitted, setSubmitted] = useState(!!savedCode)
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

  function handleSubmit() { onSubmit(code); setSubmitted(true) }

  const monoFont = 'ui-monospace,"Cascadia Code","Fira Code",Consolas,monospace'
  const monoStyle: React.CSSProperties = { fontFamily: monoFont, fontSize, lineHeight: 1.7, padding: '14px 16px 14px 52px', whiteSpace: 'pre-wrap', wordBreak: 'break-all', display: 'block', boxSizing: 'border-box', width: '100%' }
  const lineCount = (code.match(/\n/g)?.length ?? 0) + 1

  return (
    <div style={{ background: '#1a1b26', borderRadius: 8, overflow: 'hidden', margin: '1.2em 0', borderLeft: '3px solid #a6e3a1', boxShadow: '0 2px 8px rgba(0,0,0,.07)' }}>
      {/* Header */}
      <div style={{ background: '#161825', padding: '6px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ width:9,height:9,borderRadius:'50%',background:'#f38ba8',flexShrink:0 }} />
        <div style={{ width:9,height:9,borderRadius:'50%',background:'#f9e2af',flexShrink:0 }} />
        <div style={{ width:9,height:9,borderRadius:'50%',background:'#a6e3a1',flexShrink:0 }} />
        <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#45475a', flex: 1, marginLeft: 4 }}>
          Python
          {pyLoading && <span style={{ color: '#45475a', marginLeft: 6, fontSize: 9 }}>loading…</span>}
          {pyReady && <span style={{ color: '#a6e3a1', marginLeft: 6 }}>●</span>}
        </span>
        <button onClick={() => setFontSize(f => Math.max(10, f-1))} style={{ fontSize:10, color:'#6c7086', background:'none', border:'none', cursor:'pointer', padding:'1px 4px' }}>A−</button>
        <button onClick={() => setFontSize(f => Math.min(20, f+1))} style={{ fontSize:12, color:'#6c7086', background:'none', border:'none', cursor:'pointer', padding:'1px 4px' }}>A+</button>
        <button onClick={() => { setCode(starterCode); syncHighlight(starterCode); syncHeight(); setOutput(null); setError(null) }}
          style={{ fontSize:10, color:'#6c7086', background:'none', border:'none', cursor:'pointer', padding:'1px 6px' }} title="Reset to starter code">↺ Reset</button>
        <button onClick={run} disabled={running}
          style={{ padding:'3px 12px', fontSize:12, background: pyReady?'#a6e3a1':'#7aa2f7', color:'#1a1b26', border:'none', borderRadius:5, cursor:'pointer', fontFamily:'inherit', fontWeight:600 }}>
          {running ? (pkgStatus || '⏳ Running…') : '▶ Run'}
        </button>
      </div>

      {/* Editor with line numbers */}
      <div style={{ position: 'relative', background: '#1e1e2e', display: 'flex' }}>
        <div style={{ width:40, flexShrink:0, background:'#181825', padding:'14px 8px 14px 0', textAlign:'right', fontFamily:'ui-monospace,monospace', fontSize, lineHeight:1.7, color:'#45475a', userSelect:'none', pointerEvents:'none', boxSizing:'border-box' }}>
          {Array.from({ length: lineCount }, (_, i) => <div key={i}>{i+1}</div>)}
        </div>
        <pre ref={preRef} aria-hidden="true"
          style={{ ...monoStyle, color: '#cdd6f4', background: 'transparent', pointerEvents: 'none', position: 'absolute', left: 40, top: 0, right: 0, bottom: 0, margin: 0, overflow: 'hidden' }} />
        <textarea ref={taRef} value={code} spellCheck={false}
          onChange={e => { setCode(e.target.value); syncHighlight(e.target.value); syncHeight(); setSubmitted(false) }}
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
        <div style={{ background: '#0d1117', borderTop: '1px solid #2a2a4a', padding: '10px 16px' }}>
          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
            <span style={{ fontSize:10, color:'#6c7086', fontFamily:'monospace', letterSpacing:'.05em' }}>OUTPUT</span>
            {output && <button onClick={() => navigator.clipboard?.writeText(output!)} style={{ fontSize:10, color:'#6c7086', background:'none', border:'none', cursor:'pointer', marginLeft:'auto' }}>⎘ Copy</button>}
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

      {/* History */}
      {outputHistory.length > 1 && (
        <details style={{ background:'#0a0a0f', borderTop:'1px solid #2a2a4a' }}>
          <summary style={{ fontSize:10, color:'#45475a', padding:'4px 14px', cursor:'pointer', userSelect:'none', listStyle:'none' }}>▸ {outputHistory.length-1} previous run{outputHistory.length>2?'s':''}</summary>
          {outputHistory.slice(1).map((h,i) => (
            <pre key={i} style={{ color:'#585b70', fontFamily:'ui-monospace,monospace', fontSize:12, margin:0, padding:'4px 14px', borderTop:'1px solid #1a1a2e', whiteSpace:'pre-wrap' }}>{h}</pre>
          ))}
        </details>
      )}

      <div style={{ padding:'4px 14px 2px', fontSize:10, color:'#313244', display:'flex', gap:12 }}>
        <span>Ctrl+Enter run</span><span>Tab indent</span><span>Shift+Tab unindent</span><span>Auto-closes brackets</span>
      </div>

      {/* Submit */}
      <div style={{ background: '#1e1e2e', borderTop: '1px solid #2a2a4a', padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <span style={{ fontSize: 12, color: submitted ? '#a6e3a1' : '#6c7086' }}>
          {submitted ? '✓ Answer saved — you can still edit and re-submit' : 'Run your code to test it, then submit when ready'}
        </span>
        <button onClick={handleSubmit}
          style={{ padding: '7px 18px', background: submitted ? '#313244' : '#a6e3a1', color: submitted ? '#a6e3a1' : '#1a1b26', border: submitted ? '1px solid #a6e3a1' : 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
          {submitted ? '✓ Re-submit answer' : 'Submit as answer'}
        </button>
      </div>
    </div>
  )
}


export default function TestPlayer({ test, questions, attempt: initAttempt, answers: initAnswers, studentId }: {
  test: any; questions: any[]; attempt: any; answers: any[]; studentId: string
}) {
  const supabase = createClient()
  const [phase, setPhase] = useState<Phase>(() => {
    if (!initAttempt) return 'start'
    if (initAttempt.status === 'submitted') return 'submitted'
    if (initAttempt.status === 'locked') return 'locked'
    if (initAttempt.status === 'timed_out') return 'timed_out'
    return 'playing'
  })
  const [attempt, setAttempt] = useState(initAttempt)
  const [answers, setAnswers] = useState<Record<string, any>>(() => {
    const m: Record<string, any> = {}
    initAnswers.forEach((a: any) => { m[a.question_id] = a })
    return m
  })
  const [currentIdx, setCurrentIdx] = useState(0)
  const [warnings, setWarnings] = useState(initAttempt?.warning_count ?? 0)
  const [showWarning, setShowWarning] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)

  // ── Fullscreen ───────────────────────────────────────────────────────────────
  function enterFullscreen() {
    document.documentElement.requestFullscreen?.().catch(() => {})
    setIsFullscreen(true)
  }
  function exitFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {})
    setIsFullscreen(false)
  }

  useEffect(() => {
    function onFsChange() { if (!document.fullscreenElement) setIsFullscreen(false) }
    document.addEventListener('fullscreenchange', onFsChange)
    return () => document.removeEventListener('fullscreenchange', onFsChange)
  }, [])vives page refresh because started_at is in DB
  const timeLimitSecs = test.time_limit_mins ? test.time_limit_mins * 60 : null
  const [timeLeft, setTimeLeft] = useState<number | null>(() => {
    if (!timeLimitSecs || !initAttempt?.started_at) return timeLimitSecs
    const elapsed = Math.floor((Date.now() - new Date(initAttempt.started_at).getTime()) / 1000)
    return Math.max(0, timeLimitSecs - elapsed)
  })
  const timerRef = useRef<any>(null)

  useEffect(() => {
    if (phase !== 'playing' || timeLeft === null) return
    if (timeLeft <= 0) { handleTimedOut(); return }
    timerRef.current = setInterval(() => {
      setTimeLeft(r => {
        if (r === null || r <= 1) { clearInterval(timerRef.current); handleTimedOut(); return 0 }
        return r - 1
      })
    }, 1000)
    return () => clearInterval(timerRef.current)
  }, [phase])

  const sortedQ = [...questions].sort((a, b) => a.position - b.position)
  const currentQ = sortedQ[currentIdx]
  const maxWarnings = test.max_warnings ?? 3

  // ── Realtime: detect teacher unlock ─────────────────────────────────────────
  useEffect(() => {
    if (!attempt) return
    const ch = supabase.channel('attempt-' + attempt.id)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'test_attempts',
        filter: `id=eq.${attempt.id}`,
      }, (payload: any) => {
        const updated = payload.new
        if (updated.status === 'in_progress' && (phase === 'locked' || phase === 'timed_out')) {
          setWarnings(0)
          // Recalculate timer from new started_at if timer exists
          if (timeLimitSecs) {
            const elapsed = Math.floor((Date.now() - new Date(attempt.started_at).getTime()) / 1000)
            setTimeLeft(Math.max(0, timeLimitSecs - elapsed))
          }
          enterFullscreen()
          setPhase('playing')
        }
      })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [attempt?.id, phase])

  // ── Anti-cheat ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'playing') return
    function onVisChange() { if (document.hidden) issueWarning() }
    function onBlur() { issueWarning() }
    document.addEventListener('visibilitychange', onVisChange)
    window.addEventListener('blur', onBlur)
    return () => {
      document.removeEventListener('visibilitychange', onVisChange)
      window.removeEventListener('blur', onBlur)
    }
  }, [phase, warnings])

  async function issueWarning() {
    const newCount = warnings + 1
    setWarnings(newCount)
    setShowWarning(true)
    setTimeout(() => setShowWarning(false), 4000)
    if (attempt) await supabase.from('test_attempts').update({ warning_count: newCount }).eq('id', attempt.id)
    if (newCount >= maxWarnings) await lockAttempt('locked')
  }

  async function lockAttempt(status: 'locked' | 'timed_out') {
    if (attempt) await supabase.from('test_attempts').update({ status, locked_at: new Date().toISOString() }).eq('id', attempt.id)
    exitFullscreen()
    setPhase(status)
  }
  async function handleTimedOut() { await lockAttempt('timed_out') }

  // ── Start ────────────────────────────────────────────────────────────────────
  async function startTest() {
    const now = new Date().toISOString()
    const { data: att } = await supabase.from('test_attempts').insert({
      test_id: test.id, student_id: studentId, status: 'in_progress', started_at: now,
    }).select().single()
    setAttempt(att)
    if (timeLimitSecs) setTimeLeft(timeLimitSecs)
    enterFullscreen()
    setPhase('playing')
  }

  // ── Save answer ──────────────────────────────────────────────────────────────
  const saveAnswer = useCallback(async (questionId: string, ans: any) => {
    if (!attempt) return
    const existing = answers[questionId]
    if (existing?.id) {
      await supabase.from('test_answers').update(ans).eq('id', existing.id)
    } else {
      const { data } = await supabase.from('test_answers').insert({ attempt_id: attempt.id, question_id: questionId, ...ans }).select().single()
      if (data) setAnswers(p => ({ ...p, [questionId]: data }))
    }
  }, [attempt, answers])

  function setSelectedOptions(qId: string, optId: string, type: string) {
    const cur = answers[qId]?.selected_option_ids ?? []
    const next = (type === 'single' || type === 'truefalse') ? [optId]
      : cur.includes(optId) ? cur.filter((x: string) => x !== optId) : [...cur, optId]
    setAnswers(p => ({ ...p, [qId]: { ...p[qId], selected_option_ids: next, question_id: qId } }))
    saveAnswer(qId, { selected_option_ids: next })
  }

  function setDescriptiveAnswer(qId: string, text: string) {
    setAnswers(p => ({ ...p, [qId]: { ...p[qId], answer_text: text, question_id: qId } }))
    saveAnswer(qId, { answer_text: text })
  }

  // ── Submit ───────────────────────────────────────────────────────────────────
  async function doSubmit() {
    setShowConfirm(false)
    setSubmitting(true)
    let score = 0, maxScore = 0
    for (const q of sortedQ) {
      if (q.type === 'descriptive') { maxScore += q.points_correct; continue }
      maxScore += q.points_correct
      const ans = answers[q.id]
      const selected: string[] = ans?.selected_option_ids ?? []
      const opts = q.test_question_options ?? []
      if (q.type === 'single' || q.type === 'truefalse') {
        const correct = opts.find((o: any) => o.is_correct)?.id
        if (selected[0] === correct) score += q.points_correct
        else if (selected.length > 0) score -= (q.points_incorrect ?? 0)
      } else if (q.type === 'multiple') {
        const correctIds = opts.filter((o: any) => o.is_correct).map((o: any) => o.id)
        const allCorrect = correctIds.every((id: string) => selected.includes(id)) && selected.every((id: string) => correctIds.includes(id))
        if (allCorrect) score += q.points_correct
        else if (selected.length > 0) score -= (q.points_incorrect ?? 0)
      }
    }
    clearInterval(timerRef.current)
    await supabase.from('test_attempts').update({
      status: 'submitted', submitted_at: new Date().toISOString(), score, max_score: maxScore,
    }).eq('id', attempt.id)
    exitFullscreen()
    setAttempt((a: any) => ({ ...a, status: 'submitted', score, max_score: maxScore }))
    setPhase('submitted')
    setSubmitting(false)
  }

  const answered = Object.keys(answers).length
  const progress = sortedQ.length > 0 ? Math.round((answered / sortedQ.length) * 100) : 0

  // ── START ────────────────────────────────────────────────────────────────────
  if (phase === 'start') {
    return (
      <div style={{ maxWidth: 640, margin: '0 auto', paddingTop: 40 }}>
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 16, overflow: 'hidden', boxShadow: '0 4px 24px rgba(0,0,0,.06)' }}>
          <div style={{ background: 'linear-gradient(135deg,#185FA5,#0c447c)', padding: '32px 32px 24px', color: '#fff' }}>
            <div style={{ fontSize: 12, opacity: .75, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.08em' }}>{test.category || 'Test'}</div>
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>{test.title}</h1>
          </div>
          <div style={{ padding: 32 }}>
            {test.start_page_html ? (
              <div style={{ marginBottom: 24, fontSize: 14, lineHeight: 1.7, color: '#333' }} dangerouslySetInnerHTML={{ __html: test.start_page_html }} />
            ) : test.description ? (
              <div style={{ marginBottom: 24, fontSize: 14, color: '#555', lineHeight: 1.7 }}>{test.description}</div>
            ) : null}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 28 }}>
              {[['📝', 'Questions', sortedQ.length.toString()], ['⏱', 'Time limit', test.time_limit_mins ? `${test.time_limit_mins} min` : 'No limit'], ['🛡', 'Anti-cheat', `${maxWarnings} warning${maxWarnings !== 1 ? 's' : ''} max`], ['⚠️', 'Availability', test.available_until ? `Until ${new Date(test.available_until).toLocaleDateString('en-GB')}` : 'Open']].map(([icon, label, val]) => (
                <div key={label} style={{ background: '#f9fafb', borderRadius: 10, padding: '14px 16px' }}>
                  <div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>{icon} {label}</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#111' }}>{val}</div>
                </div>
              ))}
            </div>
            <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: '12px 16px', marginBottom: 24, fontSize: 13, color: '#92400E', lineHeight: 1.6 }}>
              ⚠️ Do not switch tabs or leave this page. Each detected attempt is logged as a warning. After {maxWarnings} warning{maxWarnings !== 1 ? 's' : ''} your test will be locked.
            </div>
            <button onClick={startTest} style={{ width: '100%', padding: '14px', background: '#185FA5', color: '#fff', border: 'none', borderRadius: 10, fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>
              ▶ Start Test
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── SUBMITTED ────────────────────────────────────────────────────────────────
  if (phase === 'submitted') {
    const att = attempt
    return (
      <div style={{ maxWidth: 760, margin: '0 auto' }}>
        <style>{PYTHON_CSS}</style>
        <div style={{ background: 'linear-gradient(135deg,#EAF3DE,#d1fae5)', border: '1px solid #86efac', borderRadius: 16, padding: '28px 32px', marginBottom: 28, textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
          <h2 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 8px' }}>Test submitted!</h2>
          <p style={{ color: '#4b5563', fontSize: 14, margin: 0 }}>Your answers have been recorded. Your teacher will review and finalize your score.</p>
          {att?.score != null && (
            <div style={{ marginTop: 16, fontSize: 18, fontWeight: 700, color: '#185FA5' }}>
              Auto-score: {att.score} / {att.max_score} pts
            </div>
          )}
          {att?.final_score != null && (
            <div style={{ marginTop: 8, fontSize: 18, fontWeight: 700, color: '#27500A' }}>
              Final score: {att.final_score} / {att.max_score} pts
            </div>
          )}
          {att?.teacher_feedback && (
            <div style={{ marginTop: 16, background: '#fff', borderRadius: 10, padding: '14px 18px', fontSize: 13, color: '#333', lineHeight: 1.7, textAlign: 'left' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#888', marginBottom: 6, textTransform: 'uppercase' }}>Teacher feedback</div>
              {att.teacher_feedback}
            </div>
          )}
        </div>

        {/* Answer review */}
        <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>Your answers</h3>
        {sortedQ.map((q, i) => {
          const ans = answers[q.id]
          const opts = (q.test_question_options ?? []).sort((a: any, b: any) => a.position - b.position)
          const selected: string[] = ans?.selected_option_ids ?? []
          const correctIds = opts.filter((o: any) => o.is_correct).map((o: any) => o.id)
          const isObjective = q.type !== 'descriptive' && q.type !== 'coding'
          const isCorrect = isObjective && selected.length > 0 && (
            q.type === 'multiple'
              ? correctIds.every((id: string) => selected.includes(id)) && selected.every((id: string) => correctIds.includes(id))
              : selected[0] === correctIds[0]
          )
          const hasAnswer = q.type === 'descriptive' ? (ans?.answer_text ?? '').trim() !== '' : selected.length > 0
          const border = !hasAnswer ? '#e5e7eb' : isObjective ? (isCorrect ? '#86efac' : '#fca5a5') : '#93c5fd'
          const bg = !hasAnswer ? '#f9fafb' : isObjective ? (isCorrect ? '#f0fdf4' : '#fff1f2') : '#eff6ff'

          return (
            <div key={q.id} style={{ border: `1.5px solid ${border}`, background: bg, borderRadius: 12, padding: '20px 24px', marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <span style={{ fontWeight: 700, color: '#185FA5', fontSize: 13 }}>Q{i + 1}</span>
                {isObjective && hasAnswer && <span style={{ fontSize: 12, fontWeight: 700, color: isCorrect ? '#16a34a' : '#dc2626' }}>{isCorrect ? '✓ Correct' : '✗ Incorrect'}</span>}
                {!hasAnswer && <span style={{ fontSize: 12, color: '#888' }}>— Not answered</span>}
                {q.type === 'descriptive' && hasAnswer && <span style={{ fontSize: 12, color: '#1d4ed8' }}>📝 Descriptive — awaiting grade</span>}
                {ans?.teacher_note && <span style={{ fontSize: 12, color: '#7c3aed', marginLeft: 'auto' }}>📌 Teacher note</span>}
              </div>
              <div style={{ fontSize: 14, lineHeight: 1.6, color: '#111', marginBottom: 14 }} dangerouslySetInnerHTML={{ __html: q.body_html }} />
              {isObjective && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {opts.map((o: any) => {
                    const isSel = selected.includes(o.id)
                    const isCorr = o.is_correct
                    const bg2 = isSel && isCorr ? '#dcfce7' : isSel && !isCorr ? '#fee2e2' : !isSel && isCorr ? '#fef9c3' : '#f9fafb'
                    const border2 = isSel && isCorr ? '#86efac' : isSel && !isCorr ? '#fca5a5' : !isSel && isCorr ? '#fde68a' : '#e5e7eb'
                    return (
                      <div key={o.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: bg2, border: `1.5px solid ${border2}`, borderRadius: 8, fontSize: 13 }}>
                        <span>{isSel ? (isCorr ? '✓' : '✗') : isCorr ? '○' : '·'}</span>
                        <span dangerouslySetInnerHTML={{ __html: o.body_html }} />
                        {isCorr && !isSel && <span style={{ marginLeft: 'auto', fontSize: 11, color: '#ca8a04', fontWeight: 600 }}>Correct answer</span>}
                      </div>
                    )
                  })}
                </div>
              )}
              {q.type === 'descriptive' && (
                <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#333', lineHeight: 1.65 }}>
                  {ans?.answer_text || <span style={{ color: '#aaa' }}>No answer provided</span>}
                </div>
              )}
              {q.type === 'coding' && (
                <div style={{ background: '#1a1b26', borderRadius: 8, overflow: 'hidden' }}>
                  <div style={{ background: '#161825', padding: '5px 12px', fontSize: 11, color: '#6c7086', fontFamily: 'ui-monospace,monospace' }}>💻 Submitted code</div>
                  {ans?.answer_text
                    ? <pre style={{ margin: 0, padding: '12px 14px', fontFamily: 'ui-monospace,monospace', fontSize: 13, lineHeight: 1.65, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}
                        dangerouslySetInnerHTML={{ __html: highlightPython(ans.answer_text) }} />
                    : <div style={{ padding: '12px 14px', color: '#6c7086', fontFamily: 'ui-monospace,monospace', fontSize: 13 }}>No code submitted</div>
                  }
                </div>
              )}
              {ans?.teacher_note && (
                <div style={{ marginTop: 10, background: '#f3f0ff', border: '1px solid #ddd6fe', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#5b21b6' }}>
                  💬 {ans.teacher_note}
                </div>
              )}
              {ans?.teacher_points != null && (
                <div style={{ marginTop: 6, fontSize: 12, color: '#27500A', fontWeight: 600 }}>Points awarded: {ans.teacher_points}</div>
              )}
            </div>
          )
        })}
        <a href="/student/tests" style={{ display: 'inline-block', marginTop: 8, padding: '10px 20px', background: '#185FA5', color: '#fff', borderRadius: 8, textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>← Back to tests</a>
      </div>
    )
  }

  // ── LOCKED / TIMED_OUT ───────────────────────────────────────────────────────
  if (phase === 'locked' || phase === 'timed_out') {
    const icons = { locked: '🔒', timed_out: '⏰' }
    const titles = { locked: 'Test locked', timed_out: 'Time expired' }
    const msgs = {
      locked: `Your test was locked after ${warnings} warning${warnings !== 1 ? 's' : ''} for potential academic dishonesty. Contact your teacher to unlock.`,
      timed_out: 'The time limit was reached. Your answers have been saved.',
    }
    return (
      <div style={{ maxWidth: 500, margin: '60px auto', textAlign: 'center' }}>
        <div style={{ fontSize: 60, marginBottom: 16 }}>{icons[phase]}</div>
        <h2 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 12px' }}>{titles[phase]}</h2>
        <p style={{ color: '#666', fontSize: 14, lineHeight: 1.7, margin: '0 0 24px' }}>{msgs[phase]}</p>
        <a href="/student/tests" style={{ padding: '10px 24px', background: '#185FA5', color: '#fff', borderRadius: 8, textDecoration: 'none', fontSize: 14, fontWeight: 600 }}>← Back to tests</a>
      </div>
    )
  }

  // ── PLAYING ──────────────────────────────────────────────────────────────────
  if (phase === 'playing' && currentQ) {
    const opts = (currentQ.test_question_options ?? []).sort((a: any, b: any) => a.position - b.position)
    const selected: string[] = answers[currentQ.id]?.selected_option_ids ?? []
    const descText: string = answers[currentQ.id]?.answer_text ?? ''

    return (
      <div style={isFullscreen ? {
        position: 'fixed', inset: 0, background: '#f9fafb', zIndex: 9990,
        overflowY: 'auto', padding: '24px 32px',
      } : { maxWidth: 800, margin: '0 auto' }}>
        <style>{PYTHON_CSS}</style>
        <div style={{ maxWidth: 800, margin: '0 auto' }}>
        {showConfirm && (
          <ConfirmModal
            title="Submit your test?"
            body={`You've answered ${answered} of ${sortedQ.length} questions. You cannot change your answers after submitting.`}
            confirmLabel="✓ Submit test"
            onConfirm={doSubmit}
            onCancel={() => setShowConfirm(false)}
          />
        )}
        {showWarning && (
          <div style={{ position: 'fixed', top: 64, left: '50%', transform: 'translateX(-50%)', background: '#991b1b', color: '#fff', padding: '12px 24px', borderRadius: 10, zIndex: 9998, fontWeight: 600, fontSize: 14, boxShadow: '0 4px 20px rgba(0,0,0,.3)' }}>
            ⚠️ Warning {warnings}/{maxWarnings} — Tab switch detected!{warnings >= maxWarnings ? ' Test locked.' : ''}
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 8 }}>
          <div style={{ fontWeight: 700, fontSize: 16 }}>{test.title}</div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            {warnings > 0 && (
              <span style={{ fontSize: 12, color: '#991b1b', fontWeight: 600, background: '#fee2e2', padding: '3px 10px', borderRadius: 20 }}>
                ⚠️ {warnings}/{maxWarnings} warnings
              </span>
            )}
            {timeLeft !== null && (
              <span style={{ fontSize: 14, fontWeight: 700, color: timeLeft < 120 ? '#991b1b' : '#185FA5', background: timeLeft < 120 ? '#fee2e2' : '#E6F1FB', padding: '5px 14px', borderRadius: 20 }}>
                ⏱ {formatTime(timeLeft)}
              </span>
            )}
          </div>
        </div>
        <div style={{ background: '#f3f4f6', borderRadius: 4, height: 6, marginBottom: 20 }}>
          <div style={{ background: '#185FA5', height: '100%', width: progress + '%', borderRadius: 4, transition: 'width .3s' }} />
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 20 }}>
          {sortedQ.map((q, i) => {
            const ans = answers[q.id]
            const done = q.type === 'descriptive' || q.type === 'coding' ? (ans?.answer_text ?? '').trim() !== '' : (ans?.selected_option_ids ?? []).length > 0
            return (
              <button key={q.id} onClick={() => setCurrentIdx(i)}
                style={{ width: 32, height: 32, borderRadius: '50%', border: `2px solid ${i === currentIdx ? '#185FA5' : done ? '#22c55e' : '#e5e7eb'}`, background: i === currentIdx ? '#185FA5' : done ? '#EAF3DE' : '#fff', color: i === currentIdx ? '#fff' : done ? '#27500A' : '#888', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                {i + 1}
              </button>
            )
          })}
        </div>
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, padding: '28px 32px', marginBottom: 20, boxShadow: '0 2px 12px rgba(0,0,0,.04)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#185FA5', background: '#E6F1FB', padding: '3px 10px', borderRadius: 20 }}>Q{currentIdx + 1} / {sortedQ.length}</span>
            <span style={{ fontSize: 11, color: '#888' }}>{currentQ.points_correct} pt{currentQ.points_correct !== 1 ? 's' : ''}</span>
            {!currentQ.is_required && <span style={{ fontSize: 11, color: '#aaa' }}>optional</span>}
          </div>
          <div style={{ fontSize: 16, lineHeight: 1.7, color: '#111', marginBottom: 24 }} dangerouslySetInnerHTML={{ __html: currentQ.body_html }} />
          {currentQ.type !== 'descriptive' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {opts.map((o: any) => {
                const isSel = selected.includes(o.id)
                return (
                  <button key={o.id} onClick={() => setSelectedOptions(currentQ.id, o.id, currentQ.type)}
                    style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', border: `2px solid ${isSel ? '#185FA5' : '#e5e7eb'}`, borderRadius: 10, background: isSel ? '#E6F1FB' : '#fff', cursor: 'pointer', textAlign: 'left', fontSize: 14, color: '#111', transition: 'all .15s' }}>
                    <div style={{ width: 20, height: 20, borderRadius: currentQ.type === 'multiple' ? 4 : '50%', border: `2px solid ${isSel ? '#185FA5' : '#ccc'}`, background: isSel ? '#185FA5' : '#fff', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {isSel && <div style={{ width: 8, height: 8, borderRadius: currentQ.type === 'multiple' ? 2 : '50%', background: '#fff' }} />}
                    </div>
                    <span dangerouslySetInnerHTML={{ __html: o.body_html }} />
                  </button>
                )
              })}
            </div>
          ) : (
            <textarea value={descText} onChange={e => setDescriptiveAnswer(currentQ.id, e.target.value)}
              placeholder="Write your answer here…"
              style={{ width: '100%', minHeight: 140, padding: '12px 14px', border: '1.5px solid #e5e7eb', borderRadius: 10, fontSize: 14, fontFamily: 'inherit', resize: 'vertical', outline: 'none', lineHeight: 1.65, boxSizing: 'border-box' }} />
          )}
          {currentQ.type === 'coding' && (
            <CodingEditor
              starterCode={currentQ.starter_code ?? ''}
              savedCode={answers[currentQ.id]?.answer_text ?? ''}
              onSubmit={(code) => {
                setAnswers(p => ({ ...p, [currentQ.id]: { ...p[currentQ.id], answer_text: code, question_id: currentQ.id } }))
                saveAnswer(currentQ.id, { answer_text: code })
              }}
            />
          )}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button onClick={() => setCurrentIdx(i => Math.max(0, i - 1))} disabled={currentIdx === 0}
            style={{ padding: '10px 20px', border: '1px solid #e5e7eb', borderRadius: 8, background: '#fff', cursor: currentIdx === 0 ? 'not-allowed' : 'pointer', fontSize: 13, color: '#555', opacity: currentIdx === 0 ? .4 : 1 }}>
            ← Previous
          </button>
          <span style={{ fontSize: 12, color: '#888' }}>{answered} / {sortedQ.length} answered</span>
          {currentIdx < sortedQ.length - 1 ? (
            <button onClick={() => setCurrentIdx(i => i + 1)}
              style={{ padding: '10px 20px', background: '#185FA5', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
              Next →
            </button>
          ) : (
            <button onClick={() => setShowConfirm(true)} disabled={submitting}
              style={{ padding: '10px 24px', background: '#27500A', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 700, opacity: submitting ? .6 : 1 }}>
              {submitting ? 'Submitting…' : '✓ Submit test'}
            </button>
          )}
        </div>
        </div>
      </div>
    )
  }

  return null
}
