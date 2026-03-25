'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { BackLink } from '@/components/ui'
import { highlightPython, PYTHON_CSS } from '@/lib/highlight'

// Run a tiny Python subset in-browser
function runPython(code: string): string {
  let output = ''
  try {
    const vars: Record<string, any> = {}
    code.split('\n').forEach(line => {
      const t = line.trim()
      const pm = t.match(/^print\((.+)\)$/)
      if (pm) {
        try {
          const r = pm[1]
          const fstr = r.match(/^f["'](.*)["']$/)
          if (fstr) {
            output += fstr[1].replace(/\{([^}]+)\}/g, (_: any, v: string) => {
              try { return String(eval(v.replace(/\b(\w+)\b/g, (m: string) => vars[m] !== undefined ? JSON.stringify(vars[m]) : m))) } catch { return v }
            }) + '\n'
          } else {
            output += String(eval(r.replace(/\b(\w+)\b/g, (m: string) => vars[m] !== undefined ? JSON.stringify(vars[m]) : m))) + '\n'
          }
        } catch (e: any) { output += 'Error: ' + e.message + '\n' }
      }
      const asgn = t.match(/^(\w+)\s*=\s*(.+)$/)
      if (asgn && !t.startsWith('print')) {
        try { vars[asgn[1]] = eval(asgn[2].replace(/\b(\w+)\b/g, (m: string) => vars[m] !== undefined ? JSON.stringify(vars[m]) : m)) } catch {}
      }
    })
  } catch (e: any) { output = 'Error: ' + e.message }
  return output.trim() || '(no output)'
}

export default function LessonViewer({ lesson, moduleId, studentId, completionStatus, allLessons, completedIds, authorName }: {
  lesson: any
  moduleId: string
  studentId: string
  completionStatus: 'completed' | 'bookmark' | 'none'
  allLessons: any[]
  completedIds: string[]
  authorName: string
}) {
  const supabase = createClient()
  const [status, setStatus] = useState<'completed' | 'bookmark' | 'none'>(completionStatus)
  const [saving, setSaving] = useState(false)
  const contentRef = useRef<HTMLDivElement>(null)

  const currentIndex = allLessons.findIndex(l => l.id === lesson.id)
  const prevLesson = currentIndex > 0 ? allLessons[currentIndex - 1] : null
  const nextLesson = currentIndex < allLessons.length - 1 ? allLessons[currentIndex + 1] : null
  const completedSet = new Set(completedIds)

  // ── Activate interactive elements after render ────────────────────────────
  useEffect(() => {
    const el = contentRef.current
    if (!el) return

    // #2 — Make everything strictly read-only
    el.setAttribute('contenteditable', 'false')
    el.querySelectorAll('[contenteditable]').forEach(n => {
      n.setAttribute('contenteditable', 'false')
    })
    // Remove edit buttons (table +row/col buttons, etc.)
    el.querySelectorAll('button[onclick^="cbTable"]').forEach(b => (b as HTMLElement).style.display = 'none')

    // #1 — Apply Python syntax highlighting
    // Handle new format: code stored in data-code on .cb-code-block
    el.querySelectorAll('.cb-code-block').forEach(block => {
      const b = block as HTMLElement
      const pre = b.querySelector('pre')
      const enc = b.getAttribute('data-code')
      if (pre && enc) {
        try { pre.innerHTML = highlightPython(decodeURIComponent(enc)) } catch { pre.innerHTML = highlightPython(enc) }
      } else if (pre && !b.dataset.hl) {
        b.dataset.hl = '1'
        pre.innerHTML = highlightPython(pre.textContent ?? '')
      }
      // Hide edit button in student view
      const editBtn = b.querySelector('button')
      if (editBtn) editBtn.style.display = 'none'
    })
    // Also highlight any plain <pre> blocks not in .cb-code-block
    el.querySelectorAll('pre').forEach(pre => {
      const p = pre as HTMLElement
      if (p.closest('.cb-code-block')) return // already handled
      if (p.dataset.highlighted) return
      p.dataset.highlighted = '1'
      p.innerHTML = highlightPython(p.textContent ?? '')
    })
    // Restore try-it content from data-code
    el.querySelectorAll('.tryit-widget').forEach(widget => {
      const w = widget as HTMLElement
      const enc = w.getAttribute('data-code')
      const ta = w.querySelector('textarea') as HTMLTextAreaElement
      if (ta && enc) {
        try { ta.value = decodeURIComponent(enc) } catch { ta.value = enc }
        ta.style.height = 'auto'
        ta.style.height = ta.scrollHeight + 'px'
      }
    })

    // Add copy buttons to code blocks
    el.querySelectorAll('.cb-code, div[style*="background:#1e1e2e"]').forEach(block => {
      if (block.querySelector('.viewer-copy-btn')) return
      const btn = document.createElement('button')
      btn.className = 'viewer-copy-btn'
      btn.textContent = 'Copy'
      btn.style.cssText = 'position:absolute;top:8px;right:10px;padding:3px 8px;font-size:11px;background:transparent;color:#7aa2f7;border:1px solid #7aa2f7;border-radius:5px;cursor:pointer;z-index:5'
      btn.onclick = () => {
        const pre = block.querySelector('pre')
        navigator.clipboard?.writeText(pre?.textContent ?? '')
        btn.textContent = 'Copied!'
        setTimeout(() => btn.textContent = 'Copy', 1500)
      }
      ;(block as HTMLElement).style.position = 'relative'
      block.appendChild(btn)
    })

    // #16 — Try-it widgets: auto-resize + syntax highlight + run
    el.querySelectorAll('.tryit-widget, [class*="tryit"]').forEach(widget => {
      const ta = widget.querySelector('textarea')
      if (ta) {
        // Make textarea non-editable is wrong — keep editable for try-it
        ta.removeAttribute('contenteditable') // ensure it's a real textarea

        // Auto-resize (#16)
        const autoResize = () => { ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 'px' }
        ta.addEventListener('input', autoResize)
        autoResize()

        // Wire up Run button
        const btn = widget.querySelector('button')
        if (btn && !btn.dataset.wired) {
          btn.dataset.wired = '1'
          btn.onclick = () => {
            const out = widget.querySelector('.tryit-output') as HTMLElement
            if (out) {
              out.textContent = runPython(ta.value)
              out.style.display = 'block'
            }
          }
        }
      }
    })

    // #3 — Activate quiz questions
    el.querySelectorAll('.cb-quiz').forEach(quiz => activateQuiz(quiz as HTMLElement))

  }, [lesson.id])

  function activateQuiz(quiz: HTMLElement) {
    if (quiz.dataset.activated) return
    quiz.dataset.activated = '1'

    const q = quiz.dataset.q ?? ''
    let opts: string[] = []
    let expl: string[] = []
    try { opts = JSON.parse(quiz.dataset.opts?.replace(/&quot;/g, '"') ?? '[]') } catch {}
    try { expl = JSON.parse(quiz.dataset.expl?.replace(/&quot;/g, '"') ?? '[]') } catch {}
    const correct = parseInt(quiz.dataset.correct ?? '0')

    // Build collapsible quiz UI (#3 — collapsed by default)
    quiz.innerHTML = `
      <details class="cb-quiz-details" style="border-radius:8px;overflow:hidden">
        <summary style="padding:10px 14px;background:#E6F1FB;cursor:pointer;font-size:13px;font-weight:600;color:#0C447C;list-style:none;display:flex;align-items:center;gap:8px;user-select:none">
          <span>✓</span> <span>Check your understanding</span> <span style="margin-left:auto;font-weight:400;font-size:12px">Click to expand ▸</span>
        </summary>
        <div class="cb-quiz-inner" style="padding:14px">
          <div style="font-size:14px;font-weight:600;margin-bottom:12px">${q}</div>
          <div class="cb-quiz-opts"></div>
          <div class="cb-quiz-feedback" style="display:none;font-size:13px;padding:8px 11px;border-radius:8px;margin-top:10px"></div>
        </div>
      </details>
    `

    const optsEl = quiz.querySelector('.cb-quiz-opts') as HTMLElement
    const fb = quiz.querySelector('.cb-quiz-feedback') as HTMLElement
    const details = quiz.querySelector('details') as HTMLDetailsElement
    const summary = quiz.querySelector('summary')

    opts.forEach((o, i) => {
      const row = document.createElement('div')
      row.style.cssText = 'display:flex;align-items:center;gap:10px;padding:9px 12px;border:1px solid #e5e7eb;border-radius:9px;margin-bottom:7px;cursor:pointer;font-size:13px;background:#fff;transition:all .15s;user-select:none'
      row.innerHTML = `<div class="opt-dot" style="width:15px;height:15px;border-radius:50%;border:1.5px solid #ccc;flex-shrink:0;transition:all .15s"></div><span>${o}</span>`
      row.onclick = () => {
        if (quiz.dataset.solved) return
        // Reset all
        optsEl.querySelectorAll('div').forEach((r: any) => { r.style.borderColor = '#e5e7eb'; r.style.background = '#fff'; const d = r.querySelector('.opt-dot'); if (d) { d.style.background = ''; d.style.borderColor = '#ccc' } })
        const dot = row.querySelector('.opt-dot') as HTMLElement
        if (i === correct) {
          dot.style.background = '#27500A'; dot.style.borderColor = '#27500A'
          row.style.background = '#EAF3DE'; row.style.borderColor = '#3B6D11'
          fb.textContent = '✓ ' + (expl[i] || 'Correct!')
          fb.style.cssText = fb.style.cssText + ';display:block;background:#EAF3DE;color:#27500A'
          fb.style.display = 'block'
          quiz.dataset.solved = '1'
          if (summary) summary.querySelector('span:last-child')!.textContent = '✓ Answered correctly'
        } else {
          dot.style.background = '#791F1F'; dot.style.borderColor = '#791F1F'
          row.style.background = '#FCEBEB'; row.style.borderColor = '#A32D2D'
          // Show correct
          const rows = optsEl.querySelectorAll('div')
          const correctRow = rows[correct] as HTMLElement
          if (correctRow) { const d2 = correctRow.querySelector('.opt-dot') as HTMLElement; if (d2) { d2.style.background = '#27500A'; d2.style.borderColor = '#27500A' }; correctRow.style.background = '#EAF3DE'; correctRow.style.borderColor = '#3B6D11' }
          fb.textContent = '✗ ' + (expl[i] || 'Incorrect. The correct answer is highlighted above.')
          fb.style.display = 'block'
          fb.style.background = '#FCEBEB'; fb.style.color = '#791F1F'
        }
      }
      optsEl.appendChild(row)
    })
  }

  // ── Progress actions (#12) ────────────────────────────────────────────────
  async function setProgress(newStatus: 'completed' | 'bookmark' | 'none') {
    setSaving(true)
    if (newStatus === 'none') {
      await supabase.from('lesson_progress').delete().eq('student_id', studentId).eq('lesson_id', lesson.id)
    } else {
      await supabase.from('lesson_progress').upsert({
        student_id: studentId, lesson_id: lesson.id, status: newStatus
      } as any)
    }
    setStatus(newStatus)
    setSaving(false)
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
      <style>{PYTHON_CSS}{`
        .lesson-content h1{font-size:22px;font-weight:700;margin:14px 0 6px}
        .lesson-content h2{font-size:18px;font-weight:700;margin:12px 0 5px}
        .lesson-content h3{font-size:15px;font-weight:700;margin:10px 0 4px}
        .lesson-content p{margin:5px 0}
        .lesson-content ul{padding-left:22px;margin:6px 0;list-style:disc}
        .lesson-content ol{padding-left:22px;margin:6px 0;list-style:decimal}
        .lesson-content li{margin:3px 0}
        .lesson-content blockquote{border-left:3px solid #185FA5;padding:4px 0 4px 14px;margin:8px 0;color:#555;font-style:italic}
        .lesson-content table{border-collapse:collapse;width:100%;margin:10px 0}
        .lesson-content td,.lesson-content th{border:1px solid #e5e7eb;padding:7px 11px}
        .lesson-content th{background:#f9fafb;font-weight:600}
        .lesson-content img{max-width:100%;border-radius:8px;margin:8px 0;display:block}
        .lesson-content iframe{width:100%;aspect-ratio:16/9;border:none;border-radius:8px;margin:8px 0;display:block}
        .lesson-content pre{background:#1e1e2e;color:#cdd6f4;border-radius:8px;padding:14px;font-family:ui-monospace,monospace;font-size:13px;white-space:pre;overflow-x:auto;margin:8px 0;line-height:1.6;position:relative}
        .lesson-content details{border:1px solid #e5e7eb;border-radius:8px;margin:10px 0;overflow:hidden}
        .lesson-content summary{padding:10px 14px;background:#f9fafb;cursor:pointer;font-weight:500;list-style:none}
        .lesson-content summary::-webkit-details-marker{display:none}
        .lesson-content details[open] summary{border-bottom:1px solid #e5e7eb}
        .lesson-content a{color:#185FA5;text-decoration:underline}
        .tryit-widget textarea{width:100%;background:#1a1b26;color:#cdd6f4;font-family:ui-monospace,monospace;font-size:13px;padding:12px 14px;border:none;outline:none;resize:none;line-height:1.6;display:block;min-height:60px;overflow:hidden}
        .tryit-output{background:#0d1117;color:#a6e3a1;font-family:ui-monospace,monospace;font-size:13px;padding:8px 14px;white-space:pre-wrap;display:none;border-top:1px solid #2a2a4a}
        .cb-quiz-details summary::-webkit-details-marker{display:none}
        .cb-quiz{background:#f0f7ff;border:1px solid #B5D4F4;border-radius:10px;padding:0;margin:12px 0;overflow:hidden}
      `}</style>

      {/* #9 — Left nav panel */}
      <div style={{ width: 220, flexShrink: 0, position: 'sticky', top: 80 }}>
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: '12px 0', maxHeight: 'calc(100vh - 120px)', overflowY: 'auto' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '.06em', padding: '0 14px 8px' }}>Lessons</div>
          {allLessons.map((l: any, i: number) => {
            const isCurrent = l.id === lesson.id
            const isDone = completedSet.has(l.id)
            return (
              <a key={l.id} href={`/student/modules/${moduleId}/lessons/${l.id}`}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', textDecoration: 'none', background: isCurrent ? '#E6F1FB' : 'transparent', color: isCurrent ? '#0C447C' : '#333', borderLeft: isCurrent ? '3px solid #185FA5' : '3px solid transparent', fontSize: 13 }}>
                <div style={{ width: 20, height: 20, borderRadius: '50%', background: isDone ? '#EAF3DE' : isCurrent ? '#185FA5' : '#f3f4f6', color: isDone ? '#27500A' : isCurrent ? '#fff' : '#888', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {isDone ? '✓' : i + 1}
                </div>
                <span style={{ fontSize: 12, lineHeight: 1.4, fontWeight: isCurrent ? 600 : 400 }}>{l.title}</span>
              </a>
            )
          })}
        </div>
      </div>

      {/* Main content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <BackLink href={`/student/modules/${moduleId}`} label="Back to module" />
        <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>{lesson.title}</h1>
        {authorName && <div style={{ fontSize: 12, color: '#888', marginBottom: 14 }}>Author: {authorName}</div>}

        {/* Lesson content — strictly read-only (#2) */}
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '20px 24px', marginBottom: 20 }}>
          <div
            ref={contentRef}
            className="lesson-content"
            style={{ fontSize: 14, lineHeight: 1.75, color: '#111', userSelect: 'text', pointerEvents: 'auto' }}
            dangerouslySetInnerHTML={{ __html: lesson.content_html ?? '<p style="color:#aaa">This lesson has no content yet.</p>' }}
          />
        </div>

        {/* #12 — Progress actions (reversible) */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 24 }}>
          <button onClick={() => setProgress(status === 'completed' ? 'none' : 'completed')} disabled={saving}
            style={{ padding: '9px 18px', background: status === 'completed' ? '#EAF3DE' : '#185FA5', color: status === 'completed' ? '#27500A' : '#E6F1FB', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer', transition: 'all .2s' }}>
            {status === 'completed' ? '✓ Completed — click to undo' : 'Mark as complete'}
          </button>
          <button onClick={() => setProgress(status === 'bookmark' ? 'none' : 'bookmark')} disabled={saving}
            style={{ padding: '9px 18px', background: status === 'bookmark' ? '#FAEEDA' : '#f9fafb', color: status === 'bookmark' ? '#633806' : '#555', border: '1px solid', borderColor: status === 'bookmark' ? '#BA7517' : '#e5e7eb', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer', transition: 'all .2s' }}>
            {status === 'bookmark' ? '🔖 Bookmarked — click to remove' : '🔖 Come back to this later'}
          </button>
        </div>

        {/* #9 — Prev / Next navigation */}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between' }}>
          <div>
            {prevLesson && (
              <a href={`/student/modules/${moduleId}/lessons/${prevLesson.id}`}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 16px', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, textDecoration: 'none', color: '#333' }}>
                ← {prevLesson.title}
              </a>
            )}
          </div>
          <div>
            {nextLesson && (
              <a href={`/student/modules/${moduleId}/lessons/${nextLesson.id}`}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 16px', background: '#185FA5', color: '#E6F1FB', border: 'none', borderRadius: 8, fontSize: 13, textDecoration: 'none' }}>
                {nextLesson.title} →
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
