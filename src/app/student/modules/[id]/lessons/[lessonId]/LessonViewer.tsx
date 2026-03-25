'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { BackLink } from '@/components/ui'

// Python syntax highlighter
function highlightPython(code: string): string {
  const keywords = /\b(def|class|if|elif|else|for|while|return|import|from|as|in|not|and|or|is|None|True|False|pass|break|continue|with|try|except|finally|raise|lambda|yield|global|nonlocal|del|assert|async|await)\b/g
  const builtins = /\b(print|len|range|int|float|str|list|dict|set|tuple|bool|type|input|open|sum|max|min|abs|round|sorted|enumerate|zip|map|filter|isinstance|hasattr|getattr|setattr|repr|vars|dir|help)\b/g
  const strings = /("""[\s\S]*?"""|'''[\s\S]*?'''|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/g
  const comments = /(#[^\n]*)/g
  const numbers = /\b(\d+\.?\d*)\b/g

  // Process in order — use placeholders to avoid re-matching
  const placeholders: Record<string, string> = {}
  let i = 0
  function ph(tag: string, content: string) {
    const key = `\x00${i++}\x00`
    placeholders[key] = `<span class="${tag}">${content}</span>`
    return key
  }

  let result = code
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

  result = result
    .replace(strings, m => ph('py-str', m))
    .replace(comments, m => ph('py-cmt', m))
    .replace(keywords, m => ph('py-kw', m))
    .replace(builtins, m => ph('py-bi', m))
    .replace(numbers, m => ph('py-num', m))

  // Restore placeholders
  Object.entries(placeholders).forEach(([key, val]) => {
    result = result.replace(key, val)
  })
  return result
}

export default function LessonViewer({ lesson, moduleId, studentId, completed }: {
  lesson: any; moduleId: string; studentId: string; completed: boolean
}) {
  const supabase = createClient()
  const router = useRouter()
  const [done, setDone] = useState(completed)
  const [marking, setMarking] = useState(false)
  const contentRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = contentRef.current
    if (!el) return

    // 1. Apply Python syntax highlighting to all <pre><code> blocks
    el.querySelectorAll('pre code, pre').forEach(block => {
      if ((block as HTMLElement).dataset.highlighted) return
        ; (block as HTMLElement).dataset.highlighted = '1'
      const raw = block.textContent ?? ''
      block.innerHTML = highlightPython(raw)
    })

    // 2. Add copy buttons to code blocks
    el.querySelectorAll('pre').forEach(pre => {
      if (pre.querySelector('.copy-btn')) return
      const btn = document.createElement('button')
      btn.className = 'copy-btn'
      btn.textContent = 'Copy'
      btn.style.cssText = 'position:absolute;top:8px;right:10px;padding:3px 9px;font-size:11px;background:transparent;color:#7aa2f7;border:1px solid #7aa2f7;border-radius:5px;cursor:pointer;font-family:inherit'
      btn.onclick = () => {
        navigator.clipboard?.writeText(pre.textContent ?? '')
        btn.textContent = 'Copied!'
        setTimeout(() => btn.textContent = 'Copy', 1500)
      }
      pre.style.position = 'relative'
      pre.appendChild(btn)
    })

    // 3. Activate try-it Run buttons
    el.querySelectorAll('.tryit-widget, [data-tryit]').forEach(widget => {
      const btn = widget.querySelector('button')
      const ta = widget.querySelector('textarea')
      if (btn && ta && !btn.dataset.wired) {
        btn.dataset.wired = '1'
        btn.onclick = () => runPython(ta as HTMLTextAreaElement, widget as HTMLElement)
      }
    })

    // 4. Activate check-question widgets
    el.querySelectorAll('[data-cq], [data-q]').forEach(cq => initCQ(cq as HTMLElement))

    // 5. Wrap div-based code blocks to ensure header styling
    el.querySelectorAll('div.code-block').forEach(block => {
      const pre = block.querySelector('pre')
      if (pre) {
        pre.style.borderRadius = '0 0 8px 8px'
        pre.style.marginTop = '0'
      }
    })
  }, [])

  function runPython(ta: HTMLTextAreaElement, widget: HTMLElement) {
    const code = ta.value
    let output = ''
    try {
      const vars: Record<string, any> = {}
      code.split('\n').forEach(line => {
        const trimmed = line.trim()
        const pm = trimmed.match(/^print\((.+)\)$/)
        if (pm) {
          try {
            const r = pm[1]
            const fstr = r.match(/^f["'](.*)["']$/)
            if (fstr) {
              const res = fstr[1].replace(/\{([^}]+)\}/g, (_: any, v: string) => {
                try { return String(eval(v.replace(/\b(\w+)\b/g, (m: string) => vars[m] !== undefined ? JSON.stringify(vars[m]) : m))) }
                catch { return v }
              })
              output += res + '\n'
            } else {
              output += String(eval(r.replace(/\b(\w+)\b/g, (m: string) => vars[m] !== undefined ? JSON.stringify(vars[m]) : m))) + '\n'
            }
          } catch (e: any) { output += 'Error: ' + e.message + '\n' }
        }
        const asgn = trimmed.match(/^(\w+)\s*=\s*(.+)$/)
        if (asgn && !trimmed.startsWith('print')) {
          try { vars[asgn[1]] = eval(asgn[2].replace(/\b(\w+)\b/g, (m: string) => vars[m] !== undefined ? JSON.stringify(vars[m]) : m)) } catch { /* ignore */ }
        }
      })
    } catch (e: any) { output = 'Error: ' + e.message }

    let outEl = widget.querySelector('.tryit-output') as HTMLElement
    if (!outEl) {
      outEl = document.createElement('div')
      outEl.className = 'tryit-output'
      widget.appendChild(outEl)
    }
    outEl.textContent = output.trim() || '(no output)'
    outEl.style.display = 'block'
  }

  function initCQ(cq: HTMLElement) {
    if (cq.dataset.cqInit) return
    cq.dataset.cqInit = '1'
    const q = cq.dataset.q ?? cq.dataset.cq ?? ''
    const opts = (cq.dataset.opts ?? '').split('|').filter(Boolean)
    const correct = parseInt(cq.dataset.correct ?? '0')
    const explanation = cq.dataset.explanation ?? ''

    // Build the widget UI
    cq.innerHTML = `
      <div class="cq-solved-bar" style="display:none;align-items:center;gap:8px;padding:8px 12px;background:#EAF3DE;color:#27500A;border-radius:8px;font-size:13px;cursor:pointer">
        ✓ Answered correctly — click to review
      </div>
      <div class="cq-inner">
        <div style="font-size:10px;font-weight:700;color:#185FA5;text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px">✓ Check your understanding</div>
        <div style="font-size:14px;font-weight:500;margin-bottom:10px">${q}</div>
        <div class="cq-opts"></div>
        <div class="cq-feedback" style="font-size:12px;padding:7px 11px;border-radius:7px;margin-top:8px;display:none"></div>
      </div>
    `

    const optsEl = cq.querySelector('.cq-opts') as HTMLElement
    const solvedBar = cq.querySelector('.cq-solved-bar') as HTMLElement
    const inner = cq.querySelector('.cq-inner') as HTMLElement
    const fb = cq.querySelector('.cq-feedback') as HTMLElement

    solvedBar.onclick = () => {
      const isOpen = inner.style.display !== 'none'
      inner.style.display = isOpen ? 'none' : 'block'
      if (isOpen) {
        cq.style.padding = '0'
        cq.style.overflow = 'hidden'
      } else {
        cq.style.padding = '12px 14px'
      }
    }

    opts.forEach((o, i) => {
      const row = document.createElement('div')
      row.style.cssText = 'display:flex;align-items:center;gap:8px;padding:7px 10px;border:0.5px solid #e5e7eb;border-radius:8px;margin-bottom:6px;cursor:pointer;font-size:13px;background:#fff;transition:all .15s'
      row.innerHTML = `<div style="width:14px;height:14px;border-radius:50%;border:0.5px solid #ccc;flex-shrink:0"></div><span>${o}</span>`
      row.onclick = () => {
        if (cq.dataset.solved) return
        optsEl.querySelectorAll('div[style*="display:flex"]').forEach((r: any) => {
          r.style.borderColor = '#e5e7eb'; r.style.background = '#fff'
          const dot = r.querySelector('div'); if (dot) { dot.style.background = ''; dot.style.borderColor = '#ccc' }
        })
        row.style.borderColor = '#185FA5'
        const dot = row.querySelector('div') as HTMLElement
        if (i === correct) {
          dot.style.background = '#3B6D11'; dot.style.borderColor = '#3B6D11'
          row.style.background = '#EAF3DE'; row.style.borderColor = '#3B6D11'
          fb.textContent = '✓ ' + (explanation || 'Correct!')
          fb.style.cssText = 'font-size:12px;padding:7px 11px;border-radius:7px;margin-top:8px;display:block;background:#EAF3DE;color:#27500A'
          cq.dataset.solved = '1'
          setTimeout(() => {
            inner.style.display = 'none'
            solvedBar.style.display = 'flex'
            cq.style.padding = '0'
            cq.style.overflow = 'hidden'
          }, 900)
        } else {
          dot.style.background = '#A32D2D'; dot.style.borderColor = '#A32D2D'
          row.style.background = '#FCEBEB'; row.style.borderColor = '#A32D2D'
          // Highlight correct answer
          const correctRow = optsEl.querySelectorAll('div[style*="display:flex"]')[correct] as HTMLElement
          if (correctRow) { correctRow.style.background = '#EAF3DE'; correctRow.style.borderColor = '#3B6D11'; const d = correctRow.querySelector('div') as HTMLElement; if (d) { d.style.background = '#3B6D11'; d.style.borderColor = '#3B6D11' } }
          fb.textContent = '✗ ' + (explanation || 'Incorrect. The correct answer is highlighted above.')
          fb.style.cssText = 'font-size:12px;padding:7px 11px;border-radius:7px;margin-top:8px;display:block;background:#FCEBEB;color:#791F1F'
        }
      }
      optsEl.appendChild(row)
    })
  }

  async function markComplete() {
    setMarking(true)
    await supabase.from('lesson_progress').upsert({ student_id: studentId, lesson_id: lesson.id } as any)
    setDone(true)
    setMarking(false)
    router.refresh()
  }

  return (
    <div>
      <BackLink href={'/student/modules/' + moduleId} label="Back to module" />
      <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 16 }}>{lesson.title}</h1>
      <div style={{ background: '#fff', border: '0.5px solid #e5e7eb', borderRadius: 12, padding: '20px 22px', marginBottom: 16 }}>
        <div
          ref={contentRef}
          className="lesson-content"
          dangerouslySetInnerHTML={{ __html: lesson.content_html ?? '<p style="color:#aaa">This lesson has no content yet.</p>' }}
        />
      </div>
      <button
        onClick={markComplete}
        disabled={done || marking}
        style={{ padding: '10px 22px', background: done ? '#EAF3DE' : '#185FA5', color: done ? '#27500A' : '#E6F1FB', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: done ? 'default' : 'pointer', transition: 'all .2s' }}>
        {done ? '✓ Completed' : marking ? 'Marking…' : 'Mark as complete'}
      </button>
    </div>
  )
}
