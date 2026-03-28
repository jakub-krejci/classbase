'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useRef, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Breadcrumb } from '@/components/ui'

type QType = 'single' | 'multiple' | 'descriptive' | 'truefalse' | 'coding'
type Tab = 'settings' | 'questions' | 'assign' | 'grading' | 'preview'

const Q_LABELS: Record<QType, string> = {
  single: 'Single choice', multiple: 'Multiple choice',
  descriptive: 'Descriptive', truefalse: 'True / False', coding: 'Coding',
}
const Q_ICONS: Record<QType, string> = { single: '◉', multiple: '☑', descriptive: '✏️', truefalse: '⇄', coding: '💻' }

function uid() { return Math.random().toString(36).slice(2) }

// ── Mini rich-text editor ──────────────────────────────────────────────────────
function RichInput({ value, onChange, placeholder, minHeight = 48 }: {
  value: string; onChange: (v: string) => void; placeholder?: string; minHeight?: number
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => { if (ref.current && ref.current.innerHTML !== value) ref.current.innerHTML = value }, [])
  function exec(cmd: string) { ref.current?.focus(); document.execCommand(cmd, false, '') }
  const TB: React.CSSProperties = { padding: '2px 7px', fontSize: 11, background: 'transparent', border: '1px solid #e5e7eb', borderRadius: 4, cursor: 'pointer', color: '#444' }
  return (
    <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden' }}>
      <div style={{ background: '#f9fafb', borderBottom: '1px solid #f0f0f0', padding: '3px 6px', display: 'flex', gap: 3 }}>
        <button style={{ ...TB, fontWeight: 700 }} onMouseDown={e => { e.preventDefault(); exec('bold') }}><b>B</b></button>
        <button style={{ ...TB, fontStyle: 'italic' }} onMouseDown={e => { e.preventDefault(); exec('italic') }}><i>I</i></button>
        <button style={{ ...TB, textDecoration: 'underline' }} onMouseDown={e => { e.preventDefault(); exec('underline') }}><u>U</u></button>
        <button style={{ ...TB, fontFamily: 'monospace', color: '#b31d28' }}
          onMouseDown={e => {
            e.preventDefault()
            const sel = window.getSelection(); if (!sel?.rangeCount) return
            const r = sel.getRangeAt(0)
            const code = document.createElement('code')
            code.style.cssText = 'background:#f0f2f5;padding:1px 5px;border-radius:3px;font-size:.9em;color:#b31d28'
            code.textContent = r.toString() || 'code'
            r.deleteContents(); r.insertNode(code)
            onChange(ref.current?.innerHTML ?? '')
          }}>{'<>'}</button>
      </div>
      <div ref={ref} contentEditable suppressContentEditableWarning
        data-placeholder={placeholder}
        onInput={() => onChange(ref.current?.innerHTML ?? '')}
        style={{ minHeight, padding: '8px 10px', fontSize: 13, outline: 'none', lineHeight: 1.6, color: '#111', background: '#fff' }} />
      <style>{`[data-placeholder]:empty:before{content:attr(data-placeholder);color:#bbb;pointer-events:none}`}</style>
    </div>
  )
}

// ── Question editor ────────────────────────────────────────────────────────────
function QuestionEditor({ q, onChange, onDelete, onMove, total, idx }: {
  q: any; onChange: (q: any) => void; onDelete: () => void; onMove: (d: -1|1) => void; total: number; idx: number
}) {
  const [expanded, setExpanded] = useState(true)
  const BC: React.CSSProperties = { padding: '3px 8px', fontSize: 11, border: '1px solid #e5e7eb', borderRadius: 5, cursor: 'pointer', background: '#f9fafb', color: '#555' }
  const NI: React.CSSProperties = { width: 64, padding: '5px 8px', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 13, outline: 'none', textAlign: 'center' }

  function addOption() {
    onChange({ ...q, options: [...(q.options ?? []), { id: uid(), body_html: '', is_correct: false, position: q.options?.length ?? 0 }] })
  }
  function toggleCorrect(id: string) {
    if (q.type === 'single') onChange({ ...q, options: q.options.map((o: any) => ({ ...o, is_correct: o.id === id })) })
    else onChange({ ...q, options: q.options.map((o: any) => o.id === id ? { ...o, is_correct: !o.is_correct } : o) })
  }

  return (
    <div style={{ border: '1px solid #e5e7eb', borderRadius: 10, overflow: 'hidden', background: '#fff', marginBottom: 12 }}>
      <div style={{ background: '#f9fafb', padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', borderBottom: expanded ? '1px solid #f0f0f0' : 'none' }}
        onClick={() => setExpanded(e => !e)}>
        <span style={{ fontSize: 14, color: '#185FA5', fontWeight: 700, minWidth: 28 }}>Q{idx + 1}</span>
        <span style={{ fontSize: 11, padding: '2px 8px', background: '#E6F1FB', color: '#0C447C', borderRadius: 10, fontWeight: 600 }}>{Q_ICONS[q.type as QType]} {Q_LABELS[q.type as QType]}</span>
        <div style={{ flex: 1, fontSize: 13, color: '#555', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          dangerouslySetInnerHTML={{ __html: q.body_html || '<span style="color:#bbb">No question text</span>' }} />
        <div style={{ display: 'flex', gap: 4 }} onClick={e => e.stopPropagation()}>
          <button style={BC} disabled={idx === 0} onClick={() => onMove(-1)}>↑</button>
          <button style={BC} disabled={idx === total - 1} onClick={() => onMove(1)}>↓</button>
          <button style={{ ...BC, color: '#991b1b', background: '#fee2e2', border: '1px solid #fca5a5' }} onClick={onDelete}>✕ Delete</button>
        </div>
        <span style={{ fontSize: 11, color: '#aaa' }}>{expanded ? '▲' : '▼'}</span>
      </div>
      {expanded && (
        <div style={{ padding: 16 }}>
          {/* Type selector */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
            {(Object.keys(Q_LABELS) as QType[]).map(t => (
              <button key={t} onClick={() => {
                const opts = t === 'truefalse'
                  ? [{ id: uid(), body_html: 'True', is_correct: true, position: 0 }, { id: uid(), body_html: 'False', is_correct: false, position: 1 }]
                  : (t === 'descriptive' || t === 'coding') ? [] : (q.options ?? [])
                onChange({ ...q, type: t, options: opts })
              }}
                style={{ padding: '4px 12px', fontSize: 12, borderRadius: 6, border: `1.5px solid ${q.type === t ? '#185FA5' : '#e5e7eb'}`, background: q.type === t ? '#E6F1FB' : '#fff', color: q.type === t ? '#0C447C' : '#555', cursor: 'pointer', fontWeight: q.type === t ? 600 : 400 }}>
                {Q_ICONS[t]} {Q_LABELS[t]}
              </button>
            ))}
          </div>
          {/* Body */}
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: '#888', display: 'block', marginBottom: 6 }}>QUESTION TEXT</label>
            <RichInput value={q.body_html} onChange={v => onChange({ ...q, body_html: v })} placeholder="Enter your question…" minHeight={56} />
          </div>
          {/* Options */}
          {q.type !== 'descriptive' && (
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: '#888', display: 'block', marginBottom: 8 }}>
                {q.type === 'truefalse' ? 'CORRECT ANSWER' : 'OPTIONS — click dot to mark correct'}
              </label>
              {(q.options ?? []).map((o: any) => (
                <div key={o.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 8 }}>
                  <button onClick={() => q.type !== 'truefalse' && toggleCorrect(o.id)}
                    style={{ width: 20, height: 20, borderRadius: q.type === 'multiple' ? 4 : '50%', border: `2px solid ${o.is_correct ? '#185FA5' : '#ccc'}`, background: o.is_correct ? '#185FA5' : '#fff', cursor: q.type === 'truefalse' ? 'default' : 'pointer', flexShrink: 0, marginTop: 12 }} />
                  {q.type === 'truefalse' ? (
                    <div style={{ padding: '9px 10px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, flex: 1 }}>{o.body_html}</div>
                  ) : (
                    <div style={{ flex: 1 }}>
                      <RichInput value={o.body_html} onChange={v => onChange({ ...q, options: q.options.map((x: any) => x.id === o.id ? { ...x, body_html: v } : x) })} placeholder={`Option ${o.position + 1}…`} minHeight={36} />
                    </div>
                  )}
                  {q.type !== 'truefalse' && (
                    <button onClick={() => onChange({ ...q, options: q.options.filter((x: any) => x.id !== o.id) })}
                      style={{ ...BC, marginTop: 6 }}>✕</button>
                  )}
                </div>
              ))}
              {q.type !== 'truefalse' && (
                <button onClick={addOption} style={{ fontSize: 12, color: '#185FA5', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0' }}>+ Add option</button>
              )}
            </div>
          )}
          {q.type === 'descriptive' && (
            <div style={{ background: '#f9fafb', border: '1px dashed #e5e7eb', borderRadius: 8, padding: 14, marginBottom: 14, fontSize: 13, color: '#888', textAlign: 'center' }}>
              Students type a free-text answer. You grade it manually in the results.
            </div>
          )}
          {q.type === 'coding' && (
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: '#888', display: 'block', marginBottom: 6 }}>STARTER CODE (shown to student)</label>
              <textarea
                value={q.starter_code ?? ''}
                onChange={e => onChange({ ...q, starter_code: e.target.value })}
                placeholder={'# Write starter code here (optional)\n# Students will see this when they open the question\n'}
                spellCheck={false}
                style={{ width: '100%', minHeight: 140, padding: '10px 12px', border: '1px solid #e5e7eb', borderRadius: 8, fontFamily: 'ui-monospace,monospace', fontSize: 13, lineHeight: 1.6, resize: 'vertical', outline: 'none', background: '#1e1e2e', color: '#cdd6f4', boxSizing: 'border-box' as const }} />
              <div style={{ background: '#f0f4ff', border: '1px solid #c7d7fd', borderRadius: 8, padding: '8px 12px', marginTop: 8, fontSize: 12, color: '#3730a3' }}>
                💻 Students get a live Python editor pre-filled with your starter code. They can run and test their solution, then click "Submit as answer" to save it.
              </div>
            </div>
          )}
          {/* Meta */}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', borderTop: '1px solid #f3f4f6', paddingTop: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <label style={{ fontSize: 12, color: '#666' }}>✓ Points</label>
              <input type="number" min={0} step={0.5} value={q.points_correct} onChange={e => onChange({ ...q, points_correct: +e.target.value })} style={NI} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <label style={{ fontSize: 12, color: '#666' }}>✗ Penalty</label>
              <input type="number" min={0} step={0.5} value={q.points_incorrect} onChange={e => onChange({ ...q, points_incorrect: +e.target.value })} style={NI} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <label style={{ fontSize: 12, color: '#666' }}>⏱ Time (min)</label>
              <input type="number" min={0} value={q.time_limit_mins ?? ''} placeholder="—"
                onChange={e => onChange({ ...q, time_limit_mins: e.target.value ? +e.target.value : null })} style={NI} />
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12, color: '#666' }}>
              <input type="checkbox" checked={q.is_required} onChange={e => onChange({ ...q, is_required: e.target.checked })} />
              Required
            </label>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Save status indicator ──────────────────────────────────────────────────────
function SaveBtn({ onClick, saving, saved, label = 'Save', savedLabel = '✓ Saved' }: any) {
  return (
    <button onClick={onClick} disabled={saving}
      style={{ padding: '9px 22px', background: saved ? '#27500A' : '#185FA5', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? .7 : 1, transition: 'background .2s' }}>
      {saving ? 'Saving…' : saved ? savedLabel : label}
    </button>
  )
}

// ── Main editor ────────────────────────────────────────────────────────────────
export default function TestEditorClient({ test: initial, questions: initQ, groups, students, assignments: initAssign, attempts: initAttempts }: {
  test: any; questions: any[]; groups: any[]; students: any[]; assignments: any[]; attempts: any[]
}) {
  const supabase = createClient()
  const [tab, setTab] = useState<Tab>('settings')
  const [test, setTest] = useState(initial)
  const [questions, setQuestions] = useState(() =>
    initQ.map(q => ({ ...q, _dbId: q.id, options: (q.test_question_options ?? []).sort((a: any, b: any) => a.position - b.position) }))
  )
  const [assignments, setAssignments] = useState(initAssign)
  const [attempts, setAttempts] = useState(initAttempts)
  const [settingsSaving, setSettingsSaving] = useState(false)
  const [settingsSaved, setSettingsSaved] = useState(false)
  const [qSaving, setQSaving] = useState(false)
  const [qSaved, setQSaved] = useState(false)
  const [error, setError] = useState('')

  async function unlockAttempt(attemptId: string) {
    setError('')
    const { error: err } = await supabase.from('test_attempts')
      .update({ status: 'in_progress', locked_at: null, warning_count: 0 })
      .eq('id', attemptId)
    if (err) { setError('Unlock failed: ' + err.message); return }
    setAttempts((p: any[]) => p.map(a =>
      a.id === attemptId ? { ...a, status: 'in_progress', locked_at: null, warning_count: 0 } : a
    ))
  }

  // ── Save settings ──────────────────────────────────────────────────────────
  async function saveSettings() {
    setSettingsSaving(true); setError('')
    const { error: err } = await supabase.from('tests').update({
      title: test.title, description: test.description, category: test.category,
      status: test.status, start_page_html: test.start_page_html ?? '',
      time_limit_mins: test.time_limit_mins || null,
      time_mode: test.time_mode ?? 'none',
      max_warnings: test.max_warnings,
      available_from: test.available_from || null,
      available_until: test.available_until || null,
      updated_at: new Date().toISOString(),
    }).eq('id', test.id)
    setSettingsSaving(false)
    if (err) { setError('Settings save failed: ' + err.message); return }
    setSettingsSaved(true); setTimeout(() => setSettingsSaved(false), 3000)
  }

  // ── Save questions ─────────────────────────────────────────────────────────
  async function saveQuestions() {
    setQSaving(true); setError('')

    // Delete questions that were removed (track by comparing _dbId)
    const currentDbIds = new Set(questions.map(q => q._dbId).filter(Boolean))
    const originalDbIds = initQ.map(q => q.id)
    for (const origId of originalDbIds) {
      if (!currentDbIds.has(origId)) {
        await supabase.from('test_questions').delete().eq('id', origId)
      }
    }

    const saved: any[] = []
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i]
      let dbId = q._dbId

      if (dbId) {
        // Update existing
        const { error: err } = await supabase.from('test_questions').update({
          type: q.type, body_html: q.body_html,
          starter_code: q.starter_code ?? '',
          points_correct: q.points_correct, points_incorrect: q.points_incorrect,
          is_required: q.is_required, position: i,
          time_limit_mins: q.time_limit_mins ?? null,
        }).eq('id', dbId)
        if (err) { setError('Error saving question ' + (i + 1) + ': ' + err.message); setQSaving(false); return }
      } else {
        // Insert new
        const { data: nq, error: err } = await supabase.from('test_questions').insert({
          test_id: test.id, type: q.type, body_html: q.body_html,
          starter_code: q.starter_code ?? '',
          points_correct: q.points_correct, points_incorrect: q.points_incorrect,
          is_required: q.is_required, position: i,
          time_limit_mins: q.time_limit_mins ?? null,
        }).select('id').single()
        if (err || !nq) { setError('Error inserting question ' + (i + 1) + ': ' + (err?.message ?? 'unknown')); setQSaving(false); return }
        dbId = (nq as any).id
      }

      // Replace options
      await supabase.from('test_question_options').delete().eq('question_id', dbId)
      for (let j = 0; j < (q.options ?? []).length; j++) {
        const o = q.options[j]
        await supabase.from('test_question_options').insert({
          question_id: dbId, body_html: o.body_html, is_correct: o.is_correct, position: j,
        })
      }
      saved.push({ ...q, id: dbId, _dbId: dbId })
    }

    setQuestions(saved)
    setQSaving(false); setQSaved(true); setTimeout(() => setQSaved(false), 3000)
  }

  // ── Add / delete question ──────────────────────────────────────────────────
  function addQuestion(type: QType) {
    const opts =
      type === 'truefalse' ? [{ id: uid(), body_html: 'True', is_correct: true, position: 0 }, { id: uid(), body_html: 'False', is_correct: false, position: 1 }]
      : (type === 'descriptive' || type === 'coding') ? []
      : [{ id: uid(), body_html: '', is_correct: true, position: 0 }, { id: uid(), body_html: '', is_correct: false, position: 1 }]
    setQuestions(p => [...p, { id: uid(), _dbId: null, type, body_html: '', starter_code: '', points_correct: 1, points_incorrect: 0, is_required: true, time_limit_mins: null, options: opts }])
  }

  function moveQuestion(idx: number, dir: -1 | 1) {
    const arr = [...questions]; const swap = idx + dir
    if (swap < 0 || swap >= arr.length) return
    ;[arr[idx], arr[swap]] = [arr[swap], arr[idx]]
    setQuestions(arr)
  }

  // ── Assignments ────────────────────────────────────────────────────────────
  async function toggleGroupAssign(groupId: string) {
    const existing = assignments.find(a => a.group_id === groupId)
    if (existing) {
      const { error: err } = await supabase.from('test_assignments').delete().eq('id', existing.id)
      if (err) { setError('Remove failed: ' + err.message); return }
      setAssignments(p => p.filter(a => a.id !== existing.id))
    } else {
      const { data, error: err } = await supabase.from('test_assignments')
        .insert({ test_id: test.id, group_id: groupId }).select().single()
      if (err) { setError('Assign failed: ' + err.message); return }
      if (data) setAssignments(p => [...p, data])
    }
  }

  async function toggleStudentAssign(studentId: string) {
    const existing = assignments.find(a => a.student_id === studentId)
    if (existing) {
      const { error: err } = await supabase.from('test_assignments').delete().eq('id', existing.id)
      if (err) { setError('Remove failed: ' + err.message); return }
      setAssignments(p => p.filter(a => a.id !== existing.id))
    } else {
      const { data, error: err } = await supabase.from('test_assignments')
        .insert({ test_id: test.id, student_id: studentId }).select().single()
      if (err) { setError('Assign failed: ' + err.message); return }
      if (data) setAssignments(p => [...p, data])
    }
  }

  const totalPoints = questions.reduce((s, q) => s + (q.points_correct ?? 0), 0)
  const inp: React.CSSProperties = { width: '100%', padding: '8px 10px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' as const }
  const lbl: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: '#666', display: 'block', marginBottom: 4 }
  const CARD: React.CSSProperties = { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 20 }
  const TAB: React.CSSProperties = { padding: '8px 18px', fontSize: 13, background: 'none', border: 'none', borderBottom: '2px solid transparent', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap', color: '#666' }
  const ATAB: React.CSSProperties = { ...TAB, color: '#185FA5', fontWeight: 600, borderBottom: '2px solid #185FA5' }

  return (
    <div>
      <Breadcrumb items={[{ label: 'Tests', href: '/teacher/tests' }, { label: test.title }]} />

      {/* Top bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>{test.title}</h1>
          <div style={{ fontSize: 12, color: '#aaa', marginTop: 2 }}>
            {questions.length} question{questions.length !== 1 ? 's' : ''} · {totalPoints} pts ·
            <span style={{ marginLeft: 6, fontWeight: 600, color: test.status === 'published' ? '#27500A' : test.status === 'closed' ? '#991b1b' : '#888' }}>
              {test.status.charAt(0).toUpperCase() + test.status.slice(1)}
            </span>
          </div>
        </div>
        {/* Status quick actions */}
        <div style={{ display: 'flex', gap: 6 }}>
          {test.status !== 'published' && (
            <button onClick={async () => {
              const updated = { ...test, status: 'published' }
              setTest(updated)
              setSettingsSaving(true)
              const { error: err } = await supabase.from('tests').update({ status: 'published', updated_at: new Date().toISOString() }).eq('id', test.id)
              setSettingsSaving(false)
              if (err) setError('Publish failed: ' + err.message)
              else { setSettingsSaved(true); setTimeout(() => setSettingsSaved(false), 3000) }
            }}
              style={{ padding: '8px 16px', background: '#EAF3DE', color: '#27500A', border: '1px solid #86efac', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              📢 Publish
            </button>
          )}
          {test.status === 'published' && (
            <button onClick={async () => {
              const updated = { ...test, status: 'closed' }
              setTest(updated)
              setSettingsSaving(true)
              const { error: err } = await supabase.from('tests').update({ status: 'closed', updated_at: new Date().toISOString() }).eq('id', test.id)
              setSettingsSaving(false)
              if (err) setError('Close failed: ' + err.message)
            }}
              style={{ padding: '8px 16px', background: '#fee2e2', color: '#991b1b', border: '1px solid #fca5a5', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              🔒 Close test
            </button>
          )}
          {test.status === 'closed' && (
            <button onClick={async () => {
              const updated = { ...test, status: 'draft' }
              setTest(updated)
              const { error: err } = await supabase.from('tests').update({ status: 'draft', updated_at: new Date().toISOString() }).eq('id', test.id)
              if (err) setError('Reopen failed: ' + err.message)
            }}
              style={{ padding: '8px 16px', background: '#f3f4f6', color: '#555', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              ↩ Reopen as draft
            </button>
          )}
          {settingsSaving && <span style={{ fontSize: 12, color: '#888', alignSelf: 'center' }}>Saving…</span>}
          {settingsSaved && <span style={{ fontSize: 12, color: '#27500A', alignSelf: 'center' }}>✓ Saved</span>}
        </div>
      </div>

      {error && (
        <div style={{ background: '#fee2e2', color: '#991b1b', padding: '10px 14px', borderRadius: 8, fontSize: 13, marginBottom: 12 }}>
          ⚠️ {error} <button onClick={() => setError('')} style={{ marginLeft: 8, background: 'none', border: 'none', cursor: 'pointer', color: '#991b1b', fontSize: 14 }}>✕</button>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid #e5e7eb', marginBottom: 24 }}>
        {([['settings','⚙️ Settings'],['questions','❓ Questions'],['assign','👥 Assign'],['grading','📊 Grading'],['preview','👁 Preview']] as [Tab,string][]).map(([t, label]) => (
          <button key={t} onClick={() => setTab(t)} style={tab === t ? ATAB : TAB}>{label}</button>
        ))}
      </div>

      {/* ── SETTINGS ── */}
      {tab === 'settings' && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={CARD}>
                <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 16 }}>Basic info</div>
                <label style={lbl}>Test name</label>
                <input value={test.title} onChange={e => setTest((t: any) => ({ ...t, title: e.target.value }))} style={{ ...inp, marginBottom: 12 }} placeholder="e.g. Chapter 3 Quiz" />
                <label style={lbl}>Category / Subject</label>
                <input value={test.category ?? ''} onChange={e => setTest((t: any) => ({ ...t, category: e.target.value }))} style={{ ...inp, marginBottom: 12 }} placeholder="e.g. Mathematics" />
                <label style={lbl}>Description</label>
                <textarea value={test.description ?? ''} onChange={e => setTest((t: any) => ({ ...t, description: e.target.value }))}
                  style={{ ...inp, height: 80, resize: 'vertical' }} placeholder="Short description visible to students" />
              </div>
              <div style={CARD}>
                <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 16 }}>⏰ Availability window</div>
                <label style={lbl}>Opens at (leave blank = immediate)</label>
                <input type="datetime-local" value={test.available_from ? test.available_from.slice(0,16) : ''}
                  onChange={e => setTest((t: any) => ({ ...t, available_from: e.target.value || null }))} style={{ ...inp, marginBottom: 12 }} />
                <label style={lbl}>Closes at (leave blank = no deadline)</label>
                <input type="datetime-local" value={test.available_until ? test.available_until.slice(0,16) : ''}
                  onChange={e => setTest((t: any) => ({ ...t, available_until: e.target.value || null }))} style={inp} />
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={CARD}>
                <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12 }}>⏱ Time limit system</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
                  {([['none','No time limit','Students can take as long as they need'],['total','Total test time','One countdown for the entire test'],['per_question','Per-question timers','Each question has its own countdown — expires = question locked']] as [string,string,string][]).map(([val, label, desc]) => (
                    <label key={val} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', padding: '10px 12px', borderRadius: 8, border: `1.5px solid ${(test.time_mode ?? 'none') === val ? '#185FA5' : '#e5e7eb'}`, background: (test.time_mode ?? 'none') === val ? '#E6F1FB' : '#fff' }}>
                      <input type="radio" checked={(test.time_mode ?? 'none') === val} onChange={() => setTest((t: any) => ({ ...t, time_mode: val, time_limit_mins: val === 'none' ? null : t.time_limit_mins }))} style={{ marginTop: 2 }} />
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#111' }}>{label}</div>
                        <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>{desc}</div>
                      </div>
                    </label>
                  ))}
                </div>
                {(test.time_mode === 'total') && (
                  <div>
                    <label style={lbl}>Total time (minutes)</label>
                    <input type="number" min={1} value={test.time_limit_mins ?? ''} placeholder="e.g. 60"
                      onChange={e => setTest((t: any) => ({ ...t, time_limit_mins: e.target.value ? +e.target.value : null }))} style={inp} />
                  </div>
                )}
                {(test.time_mode === 'per_question') && (
                  <div style={{ fontSize: 12, color: '#888', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '8px 12px' }}>
                    ⏱ Set time limits per question in the Questions tab. Questions without a time limit are unlimited.
                  </div>
                )}
              </div>
              <div style={CARD}>
                <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8 }}>🛡 Anti-cheat</div>
                <div style={{ fontSize: 12, color: '#888', marginBottom: 12 }}>Students get a warning each time they switch tabs or leave the page.</div>
                <label style={lbl}>Max warnings before test is locked</label>
                <input type="number" min={1} max={20} value={test.max_warnings ?? 3}
                  onChange={e => setTest((t: any) => ({ ...t, max_warnings: +e.target.value }))} style={{ ...inp, marginBottom: 12 }} />
              </div>
              <div style={CARD}>
                <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8 }}>📄 Test start page</div>
                <div style={{ fontSize: 12, color: '#888', marginBottom: 12 }}>Instructions students see before starting.</div>
                <RichInput value={test.start_page_html ?? ''} onChange={v => setTest((t: any) => ({ ...t, start_page_html: v }))}
                  placeholder="Write instructions… (optional)" minHeight={100} />
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <SaveBtn onClick={saveSettings} saving={settingsSaving} saved={settingsSaved} label="Save settings" savedLabel="✓ Settings saved" />
          </div>
        </div>
      )}

      {/* ── QUESTIONS ── */}
      {tab === 'questions' && (
        <div>
          {questions.length === 0 && (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: '#aaa', border: '1px dashed #e5e7eb', borderRadius: 12, marginBottom: 20 }}>
              No questions yet — add one below.
            </div>
          )}
          {questions.map((q, i) => (
            <QuestionEditor key={q.id} q={q} idx={i} total={questions.length}
              onChange={updated => setQuestions(p => p.map(x => x.id === q.id ? updated : x))}
              onDelete={() => setQuestions(p => p.filter(x => x.id !== q.id))}
              onMove={dir => moveQuestion(i, dir)} />
          ))}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', padding: '12px 0', borderTop: '1px solid #f3f4f6', marginBottom: 16 }}>
            <span style={{ fontSize: 12, color: '#aaa', alignSelf: 'center' }}>Add:</span>
            {(Object.keys(Q_LABELS) as QType[]).map(t => (
              <button key={t} onClick={() => addQuestion(t)}
                style={{ padding: '7px 14px', fontSize: 12, border: '1px solid #e5e7eb', borderRadius: 7, background: '#f9fafb', cursor: 'pointer', color: '#444' }}>
                {Q_ICONS[t]} {Q_LABELS[t]}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <SaveBtn onClick={saveQuestions} saving={qSaving} saved={qSaved} label="Save all questions" savedLabel="✓ Questions saved" />
          </div>
        </div>
      )}

      {/* ── ASSIGN ── */}
      {tab === 'assign' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          <div style={CARD}>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>👥 Groups</div>
            <div style={{ fontSize: 12, color: '#888', marginBottom: 14 }}>Assign to all students in a group. Students are notified.</div>
            {groups.length === 0 && <div style={{ fontSize: 13, color: '#aaa' }}>No groups yet.</div>}
            {groups.map(g => {
              const assigned = assignments.some(a => a.group_id === g.id)
              return (
                <div key={g.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #f9fafb' }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{g.name}</div>
                    {assigned && <div style={{ fontSize: 11, color: '#27500A' }}>✓ Assigned</div>}
                  </div>
                  <button onClick={() => toggleGroupAssign(g.id)}
                    style={{ padding: '6px 16px', fontSize: 13, fontWeight: 600, border: 'none', borderRadius: 7, cursor: 'pointer', background: assigned ? '#fee2e2' : '#185FA5', color: assigned ? '#991b1b' : '#fff' }}>
                    {assigned ? 'Unassign' : 'Assign'}
                  </button>
                </div>
              )
            })}
          </div>
          <div style={CARD}>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>👤 Individual students</div>
            <div style={{ fontSize: 12, color: '#888', marginBottom: 14 }}>Assign to specific students.</div>
            <div style={{ maxHeight: 420, overflowY: 'auto' }}>
              {students.map(s => {
                const assigned = assignments.some(a => a.student_id === s.id)
                return (
                  <div key={s.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f9fafb' }}>
                    <div>
                      <div style={{ fontSize: 13 }}>{s.full_name ?? s.email}</div>
                      {assigned && <div style={{ fontSize: 11, color: '#27500A' }}>✓ Assigned</div>}
                    </div>
                    <button onClick={() => toggleStudentAssign(s.id)}
                      style={{ padding: '5px 14px', fontSize: 12, fontWeight: 600, border: 'none', borderRadius: 7, cursor: 'pointer', background: assigned ? '#fee2e2' : '#E6F1FB', color: assigned ? '#991b1b' : '#0C447C' }}>
                      {assigned ? 'Remove' : 'Assign'}
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {tab === 'grading' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          <div style={CARD}>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 16 }}>📊 Test summary</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {[['Total questions', questions.length], ['Total points', totalPoints], ['Required', questions.filter(q => q.is_required).length], ['Optional', questions.filter(q => !q.is_required).length]].map(([l, v]) => (
                <div key={l as string} style={{ background: '#f9fafb', borderRadius: 8, padding: '12px 14px' }}>
                  <div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>{l}</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: '#111' }}>{v}</div>
                </div>
              ))}
            </div>
          </div>
          <div style={CARD}>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12 }}>Questions</div>
            <div style={{ maxHeight: 260, overflowY: 'auto' }}>
              {questions.length === 0 && <div style={{ color: '#aaa', fontSize: 13 }}>No questions yet.</div>}
              {questions.map((q, i) => (
                <div key={q.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid #f9fafb', fontSize: 13 }}>
                  <span style={{ color: '#185FA5', fontWeight: 700, minWidth: 28 }}>Q{i + 1}</span>
                  <span style={{ fontSize: 11, padding: '1px 6px', background: '#E6F1FB', color: '#0C447C', borderRadius: 8, flexShrink: 0 }}>{Q_LABELS[q.type as QType]}</span>
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#555' }}
                    dangerouslySetInnerHTML={{ __html: q.body_html || '<em style="color:#bbb">No text</em>' }} />
                  <span style={{ fontWeight: 600, color: '#27500A', flexShrink: 0 }}>{q.points_correct}pt</span>
                </div>
              ))}
            </div>
          </div>
          </div>

          {/* Attempts table */}
          <div style={CARD}>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>👥 Student attempts ({attempts.length})</div>
            <div style={{ fontSize: 12, color: '#888', marginBottom: 14 }}>Locked attempts can be unlocked — warning count resets to 0.</div>
            {attempts.length === 0 && <div style={{ fontSize: 13, color: '#aaa', textAlign: 'center', padding: '20px 0' }}>No students have started this test yet.</div>}
            {attempts.length > 0 && (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid #f3f4f6' }}>
                      {['Student', 'Status', 'Started', 'Submitted', 'Score', 'Warnings', 'Action'].map(h => (
                        <th key={h} style={{ textAlign: 'left', padding: '8px 10px', fontSize: 11, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '.04em' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {attempts.map((a: any) => {
                      const ST: Record<string,{bg:string;color:string;label:string}> = {
                        in_progress: { bg: '#FEF3C7', color: '#92400E', label: 'In progress' },
                        submitted:   { bg: '#EAF3DE', color: '#27500A', label: 'Submitted' },
                        locked:      { bg: '#fee2e2', color: '#991b1b', label: 'Locked ⚠️' },
                        timed_out:   { bg: '#f3f4f6', color: '#555',    label: 'Timed out' },
                      }
                      const st = ST[a.status] ?? ST.in_progress
                      const name = a.profiles?.full_name ?? a.profiles?.email ?? a.student_id.slice(0, 8)
                      return (
                        <tr key={a.id} style={{ borderBottom: '1px solid #f9fafb' }}>
                          <td style={{ padding: '10px 10px', fontWeight: 500 }}>{name}</td>
                          <td style={{ padding: '10px 10px' }}>
                            <span style={{ padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: st.bg, color: st.color }}>{st.label}</span>
                          </td>
                          <td style={{ padding: '10px 10px', color: '#666' }}>{new Date(a.started_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
                          <td style={{ padding: '10px 10px', color: '#666' }}>{a.submitted_at ? new Date(a.submitted_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                          <td style={{ padding: '10px 10px', fontWeight: 600, color: '#185FA5' }}>{a.score != null ? `${a.score} / ${a.max_score}` : '—'}</td>
                          <td style={{ padding: '10px 10px', color: a.warning_count > 0 ? '#991b1b' : '#888', fontWeight: a.warning_count > 0 ? 700 : 400 }}>{a.warning_count}</td>
                          <td style={{ padding: '10px 10px' }}>
                            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                              {a.status === 'submitted' && (
                                <>
                                  {a.reviewed_at && (
                                    <span style={{ fontSize: 11, fontWeight: 600, color: '#27500A', background: '#EAF3DE', padding: '2px 8px', borderRadius: 20 }}>
                                      ✓ Graded
                                    </span>
                                  )}
                                  <a href={`/teacher/tests/${test.id}/review/${a.id}`}
                                    style={{ padding: '4px 12px', fontSize: 12, fontWeight: 600, background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', textDecoration: 'none' }}>
                                    ✏️ Review
                                  </a>
                                </>
                              )}
                              {(a.status === 'locked' || a.status === 'timed_out') && (
                                <button onClick={() => unlockAttempt(a.id)}
                                  style={{ padding: '4px 12px', fontSize: 12, fontWeight: 600, background: '#E6F1FB', color: '#0C447C', border: '1px solid #93c5fd', borderRadius: 6, cursor: 'pointer' }}>
                                  🔓 Unlock
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
      {/* ── PREVIEW ── */}
      {tab === 'preview' && (
        <div>
          <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: '12px 16px', marginBottom: 20, fontSize: 13, color: '#92400E' }}>
            👁 Preview — this is exactly how students will see the test. Answers are not saved.
          </div>
          <div style={{ maxWidth: 760, margin: '0 auto' }}>
            {test.start_page_html && (
              <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, padding: '28px 32px', marginBottom: 20 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#888', marginBottom: 12, textTransform: 'uppercase' as const }}>Test start page</div>
                <div dangerouslySetInnerHTML={{ __html: test.start_page_html }} style={{ fontSize: 14, lineHeight: 1.7 }} />
              </div>
            )}
            {questions.length === 0 && (
              <div style={{ textAlign: 'center', padding: '40px', color: '#aaa', border: '1px dashed #e5e7eb', borderRadius: 12 }}>No questions yet.</div>
            )}
            {questions.map((q, i) => {
              const opts = (q.options ?? []).sort((a: any, b: any) => a.position - b.position)
              return (
                <div key={q.id} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, padding: '24px 28px', marginBottom: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#185FA5', background: '#E6F1FB', padding: '3px 10px', borderRadius: 20 }}>Q{i + 1} / {questions.length}</span>
                    <span style={{ fontSize: 11, color: '#888' }}>{q.points_correct} pt{q.points_correct !== 1 ? 's' : ''}</span>
                    {!q.is_required && <span style={{ fontSize: 11, color: '#aaa', background: '#f3f4f6', padding: '2px 7px', borderRadius: 10 }}>optional</span>}
                    {q.time_limit_mins && <span style={{ fontSize: 11, color: '#92400E', background: '#fffbeb', padding: '2px 7px', borderRadius: 10 }}>⏱ {q.time_limit_mins} min</span>}
                  </div>
                  <div style={{ fontSize: 15, lineHeight: 1.7, color: '#111', marginBottom: 20 }} dangerouslySetInnerHTML={{ __html: q.body_html || '<em style="color:#bbb">No question text</em>' }} />
                  {q.type !== 'descriptive' && q.type !== 'coding' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {opts.map((o: any) => (
                        <div key={o.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', border: '2px solid #e5e7eb', borderRadius: 10, fontSize: 14, color: '#111' }}>
                          <div style={{ width: 18, height: 18, borderRadius: q.type === 'multiple' ? 4 : '50%', border: '2px solid #ccc', flexShrink: 0 }} />
                          <span dangerouslySetInnerHTML={{ __html: o.body_html }} />
                        </div>
                      ))}
                    </div>
                  )}
                  {q.type === 'descriptive' && (
                    <div style={{ border: '1.5px solid #e5e7eb', borderRadius: 10, padding: '12px 14px', minHeight: 80, color: '#bbb', fontSize: 14 }}>Student answer here…</div>
                  )}
                  {q.type === 'coding' && (
                    <div style={{ background: '#1a1b26', borderRadius: 8, padding: '14px 16px', fontFamily: 'ui-monospace,monospace', fontSize: 13, minHeight: 80 }}>
                      {q.starter_code ? <pre style={{ margin: 0, color: '#cdd6f4', whiteSpace: 'pre-wrap' }}>{q.starter_code}</pre> : <span style={{ color: '#6c7086' }}># Starter code here</span>}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
