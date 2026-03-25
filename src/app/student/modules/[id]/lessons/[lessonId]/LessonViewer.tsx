'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { BackLink } from '@/components/ui'

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

    // Activate accordions (details/summary built into HTML)
    // They work natively — no JS needed.

    // Activate try-it buttons
    el.querySelectorAll('textarea').forEach(ta => {
      const widget = ta.closest('[data-tryit]') ?? ta.parentElement?.parentElement
      const runBtn = widget?.querySelector('button')
      if (runBtn && runBtn.textContent?.includes('Run')) {
        runBtn.onclick = () => runPython(ta, widget as HTMLElement)
      }
    })

    // Activate check questions
    el.querySelectorAll('[data-cq]').forEach(cq => initCQ(cq as HTMLElement))
  }, [])

  function runPython(ta: HTMLTextAreaElement, widget: HTMLElement) {
    const code = ta.value
    let output = ''
    try {
      const lines = code.split('\n')
      const vars: Record<string, any> = {}
      lines.forEach(line => {
        const pm = line.trim().match(/^print\((.+)\)$/)
        if (pm) {
          try {
            const r = pm[1]
            const fstr = r.match(/^f["'](.*)["']$/)
            if (fstr) {
              output += fstr[1].replace(/\{([^}]+)\}/g, (_: any, v: string) => {
                try { return String(eval(v.replace(/\b(\w+)\b/g, (m: string) => vars[m] !== undefined ? JSON.stringify(vars[m]) : m))) }
                catch { return v }
              }) + '\n'
            } else {
              output += String(eval(r.replace(/\b(\w+)\b/g, (m: string) => vars[m] !== undefined ? JSON.stringify(vars[m]) : m))) + '\n'
            }
          } catch (e: any) { output += 'Error: ' + e.message + '\n' }
        }
        const asgn = line.trim().match(/^(\w+)\s*=\s*(.+)$/)
        if (asgn && !line.trim().startsWith('print')) {
          try { vars[asgn[1]] = eval(asgn[2].replace(/\b(\w+)\b/g, (m: string) => vars[m] !== undefined ? JSON.stringify(vars[m]) : m)) }
          catch { /* ignore */ }
        }
      })
    } catch (e: any) { output = 'Error: ' + e.message }

    let outEl = widget.querySelector('.tryit-output') as HTMLElement
    if (!outEl) {
      outEl = document.createElement('div')
      outEl.className = 'tryit-output'
      outEl.style.cssText = 'background:#0d1117;color:#a6e3a1;font-family:monospace;font-size:12px;padding:8px 12px;border-top:0.5px solid #2a2a4a;white-space:pre-wrap;max-height:100px;overflow-y:auto'
      widget.appendChild(outEl)
    }
    outEl.textContent = output.trim() || '(no output)'
    outEl.style.display = 'block'
  }

  function initCQ(cq: HTMLElement) {
    if (cq.dataset.cqInit) return
    cq.dataset.cqInit = '1'
    const opts = (cq.dataset.opts ?? '').split('|')
    const correct = parseInt(cq.dataset.correct ?? '0')
    const explanation = cq.dataset.explanation ?? ''
    const optsContainer = cq.querySelector('.cq-opts') as HTMLElement
    if (!optsContainer) return
    optsContainer.innerHTML = ''
    opts.forEach((o, i) => {
      const row = document.createElement('div')
      row.style.cssText = 'display:flex;align-items:center;gap:8px;padding:7px 10px;border:0.5px solid #e5e7eb;border-radius:8px;margin-bottom:5px;cursor:pointer;font-size:13px;background:#fff;transition:border-color .15s'
      row.innerHTML = '<div style="width:14px;height:14px;border-radius:50%;border:0.5px solid #e5e7eb;flex-shrink:0"></div><span>' + o + '</span>'
      row.onclick = () => {
        if (cq.dataset.solved) return
        optsContainer.querySelectorAll('div[style]').forEach(r => (r as HTMLElement).style.borderColor = '#e5e7eb')
        const fb = cq.querySelector('.cq-feedback') as HTMLElement
        if (i === correct) {
          row.style.cssText = row.style.cssText.replace('#e5e7eb', '#3B6D11') + ';background:#EAF3DE'
          if (fb) { fb.textContent = '✓ ' + (explanation || 'Correct!'); fb.style.cssText = 'font-size:12px;padding:7px 10px;background:#EAF3DE;color:#27500A;border-radius:8px;margin-top:6px;display:block' }
          cq.dataset.solved = '1'
          setTimeout(() => {
            const inner = cq.querySelector('.cq-inner') as HTMLElement
            const bar = cq.querySelector('.cq-solved-bar') as HTMLElement
            if (inner) inner.style.display = 'none'
            if (bar) { bar.style.display = 'flex'; bar.onclick = () => { if (inner) inner.style.display = inner.style.display === 'none' ? 'block' : 'none' } }
          }, 800)
        } else {
          row.style.borderColor = '#A32D2D'
          optsContainer.querySelectorAll('div').forEach((r, ri) => { if (ri === correct) (r as HTMLElement).style.cssText = (r as HTMLElement).style.cssText + ';background:#EAF3DE;border-color:#3B6D11' })
          if (fb) { fb.textContent = '✗ ' + (explanation || 'Incorrect. See the correct answer above.'); fb.style.cssText = 'font-size:12px;padding:7px 10px;background:#FCEBEB;color:#791F1F;border-radius:8px;margin-top:6px;display:block' }
        }
      }
      optsContainer.appendChild(row)
    })
  }

  async function markComplete() {
    setMarking(true)
    await supabase.from('lesson_progress').upsert({ student_id: studentId, lesson_id: lesson.id })
    setDone(true)
    setMarking(false)
    router.refresh()
  }

  return (
    <div>
      <BackLink href={'/student/modules/' + moduleId} label="Back to module" />
      <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 16 }}>{lesson.title}</h1>
      <div style={{ background: '#fff', border: '0.5px solid #e5e7eb', borderRadius: 12, padding: 20, marginBottom: 16 }}>
        <div
          ref={contentRef}
          className="lesson-content"
          dangerouslySetInnerHTML={{ __html: lesson.content_html ?? '' }}
          style={{ fontSize: 14, lineHeight: 1.75, color: '#111' }}
        />
      </div>
      <button onClick={markComplete} disabled={done || marking}
        style={{ padding: '9px 20px', background: done ? '#EAF3DE' : '#185FA5', color: done ? '#27500A' : '#E6F1FB', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: done ? 'default' : 'pointer' }}>
        {done ? '✓ Completed' : marking ? 'Marking…' : 'Mark as complete'}
      </button>
    </div>
  )
}
