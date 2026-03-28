'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useRef, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Breadcrumb } from '@/components/ui'

type QType = 'single' | 'multiple' | 'descriptive' | 'truefalse'
type Tab = 'settings' | 'questions' | 'assign' | 'grading'

const Q_LABELS: Record<QType, string> = {
  single: 'Single choice', multiple: 'Multiple choice',
  descriptive: 'Descriptive', truefalse: 'True / False',
}
const Q_ICONS: Record<QType, string> = {
  single: '◉', multiple: '☑', descriptive: '✏️', truefalse: '⇄',
}

function uid() { return Math.random().toString(36).slice(2) }

// ── Mini rich-text editor for questions/answers ────────────────────────────────
function RichInput({ value, onChange, placeholder, minHeight = 48 }: {
  value: string; onChange: (v: string) => void; placeholder?: string; minHeight?: number
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (ref.current && ref.current.innerHTML !== value) ref.current.innerHTML = value
  }, [])
  function exec(cmd: string, val?: string) { ref.current?.focus(); document.execCommand(cmd, false, val ?? '') }
  const TB: React.CSSProperties = { padding: '2px 7px', fontSize: 11, background: 'transparent', border: '1px solid #e5e7eb', borderRadius: 4, cursor: 'pointer', color: '#444' }
  return (
    <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden', background: '#fff' }}>
      <div style={{ background: '#f9fafb', borderBottom: '1px solid #f0f0f0', padding: '3px 6px', display: 'flex', gap: 3 }}>
        <button style={{ ...TB, fontWeight: 700 }} onMouseDown={e => { e.preventDefault(); exec('bold') }}><b>B</b></button>
        <button style={{ ...TB, fontStyle: 'italic' }} onMouseDown={e => { e.preventDefault(); exec('italic') }}><i>I</i></button>
        <button style={{ ...TB, textDecoration: 'underline' }} onMouseDown={e => { e.preventDefault(); exec('underline') }}><u>U</u></button>
        <button style={{ ...TB, fontFamily: 'monospace', background: '#f0f2f5', color: '#b31d28' }}
          onMouseDown={e => { e.preventDefault()
            const sel = window.getSelection()
            if (!sel || !sel.rangeCount) return
            const range = sel.getRangeAt(0)
            const code = document.createElement('code')
            code.style.cssText = 'background:#f0f2f5;padding:1px 5px;border-radius:3px;font-size:.9em;color:#b31d28'
            code.textContent = range.toString() || 'code'
            range.deleteContents(); range.insertNode(code)
          }}>{'<>'}</button>
      </div>
      <div ref={ref} contentEditable suppressContentEditableWarning
        data-placeholder={placeholder}
        onInput={() => onChange(ref.current?.innerHTML ?? '')}
        style={{ minHeight, padding: '8px 10px', fontSize: 13, outline: 'none', lineHeight: 1.6, color: '#111' }}
      />
      <style>{`[data-placeholder]:empty:before{content:attr(data-placeholder);color:#bbb;pointer-events:none}`}</style>
    </div>
  )
}

// ── Question editor ────────────────────────────────────────────────────────────
function QuestionEditor({ q, onChange, onDelete, onMove, total, idx }: {
  q: any; onChange: (q: any) => void; onDelete: () => void
  onMove: (dir: -1|1) => void; total: number; idx: number
}) {
  const [expanded, setExpanded] = useState(true)

  function addOption() {
    onChange({ ...q, options: [...(q.options ?? []), { id: uid(), body_html: '', is_correct: false, position: (q.options?.length ?? 0) }] })
  }
  function updateOption(id: string, patch: any) {
    onChange({ ...q, options: q.options.map((o: any) => o.id === id ? { ...o, ...patch } : o) })
  }
  function deleteOption(id: string) {
    onChange({ ...q, options: q.options.filter((o: any) => o.id !== id) })
  }
  function toggleCorrect(id: string) {
    if (q.type === 'single') {
      onChange({ ...q, options: q.options.map((o: any) => ({ ...o, is_correct: o.id === id })) })
    } else {
      onChange({ ...q, options: q.options.map((o: any) => o.id === id ? { ...o, is_correct: !o.is_correct } : o) })
    }
  }

  const BC: React.CSSProperties = { padding: '3px 8px', fontSize: 11, border: '1px solid #e5e7eb', borderRadius: 5, cursor: 'pointer', background: '#f9fafb', color: '#555' }
  const NI: React.CSSProperties = { width: 64, padding: '5px 8px', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 13, outline: 'none', textAlign: 'center' }

  return (
    <div style={{ border: '1px solid #e5e7eb', borderRadius: 10, overflow: 'hidden', background: '#fff', marginBottom: 12 }}>
      {/* Header */}
      <div style={{ background: '#f9fafb', padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 8, borderBottom: expanded ? '1px solid #f0f0f0' : 'none', cursor: 'pointer' }}
        onClick={() => setExpanded(e => !e)}>
        <span style={{ fontSize: 14, color: '#185FA5', fontWeight: 700, minWidth: 24 }}>Q{idx + 1}</span>
        <span style={{ fontSize: 11, padding: '2px 8px', background: '#E6F1FB', color: '#0C447C', borderRadius: 10, fontWeight: 600 }}>{Q_ICONS[q.type as QType]} {Q_LABELS[q.type as QType]}</span>
        <div style={{ flex: 1, fontSize: 13, color: '#555', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          dangerouslySetInnerHTML={{ __html: q.body_html || '<span style="color:#bbb">No question text</span>' }} />
        <div style={{ display: 'flex', gap: 4, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
          <button style={BC} disabled={idx === 0} onClick={() => onMove(-1)}>↑</button>
          <button style={BC} disabled={idx === total - 1} onClick={() => onMove(1)}>↓</button>
          <button style={{ ...BC, color: '#991b1b', background: '#fee2e2', border: '1px solid #fca5a5' }} onClick={onDelete}>✕</button>
        </div>
        <span style={{ fontSize: 12, color: '#aaa', marginLeft: 4 }}>{expanded ? '▲' : '▼'}</span>
      </div>

      {expanded && (
        <div style={{ padding: 16 }}>
          {/* Type selector */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
            {(Object.keys(Q_LABELS) as QType[]).map(t => (
              <button key={t} onClick={() => onChange({ ...q, type: t, options: t === 'truefalse' ? [{ id: uid(), body_html: 'True', is_correct: true, position: 0 }, { id: uid(), body_html: 'False', is_correct: false, position: 1 }] : (t === 'descriptive' ? [] : q.options ?? []) })}
                style={{ padding: '4px 12px', fontSize: 12, borderRadius: 6, border: `1.5px solid ${q.type === t ? '#185FA5' : '#e5e7eb'}`, background: q.type === t ? '#E6F1FB' : '#fff', color: q.type === t ? '#0C447C' : '#555', cursor: 'pointer', fontWeight: q.type === t ? 600 : 400 }}>
                {Q_ICONS[t]} {Q_LABELS[t]}
              </button>
            ))}
          </div>

          {/* Question body */}
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: '#888', display: 'block', marginBottom: 6 }}>QUESTION</label>
            <RichInput value={q.body_html} onChange={v => onChange({ ...q, body_html: v })} placeholder="Enter your question…" minHeight={56} />
          </div>

          {/* Options */}
          {q.type !== 'descriptive' && (
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: '#888', display: 'block', marginBottom: 8 }}>
                {q.type === 'truefalse' ? 'ANSWER' : 'OPTIONS — click circle to mark correct'}
              </label>
              {(q.options ?? []).map((o: any) => (
                <div key={o.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 8 }}>
                  <button onClick={() => toggleCorrect(o.id)}
                    style={{ width: 20, height: 20, borderRadius: q.type === 'multiple' ? 4 : '50%', border: `2px solid ${o.is_correct ? '#185FA5' : '#ccc'}`, background: o.is_correct ? '#185FA5' : '#fff', cursor: q.type === 'truefalse' ? 'default' : 'pointer', flexShrink: 0, marginTop: 12 }} />
                  {q.type === 'truefalse' ? (
                    <div style={{ padding: '8px 10px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, color: '#111', flex: 1 }}>{o.body_html}</div>
                  ) : (
                    <div style={{ flex: 1 }}>
                      <RichInput value={o.body_html} onChange={v => updateOption(o.id, { body_html: v })} placeholder={`Option ${o.position + 1}…`} minHeight={36} />
                    </div>
                  )}
                  {q.type !== 'truefalse' && (
                    <button onClick={() => deleteOption(o.id)} style={{ padding: '4px 8px', fontSize: 11, color: '#999', border: '1px solid #e5e7eb', borderRadius: 5, cursor: 'pointer', background: '#f9fafb', marginTop: 6 }}>✕</button>
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
              Students will type their answer in a text area. Teacher grades manually.
            </div>
          )}

          {/* Settings row */}
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

// ── Main editor ────────────────────────────────────────────────────────────────
export default function TestEditorClient({ test: initial, questions: initQ, groups, students, assignments: initAssign }: {
  test: any; questions: any[]; groups: any[]; students: any[]; assignments: any[]
}) {
  const supabase = createClient()
  const [tab, setTab] = useState<Tab>('settings')
  const [test, setTest] = useState(initial)
  const [questions, setQuestions] = useState(initQ.map(q => ({
    ...q, options: (q.test_question_options ?? []).sort((a: any, b: any) => a.position - b.position)
  })))
  const [assignments, setAssignments] = useState(initAssign)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [startPageHtml, setStartPageHtml] = useState(initial.start_page_html ?? '')

  // ── Auto-save test settings ────────────────────────────────────────────────
  const saveTimer = useRef<any>(null)
  const saveTest = useCallback(async (t: any) => {
    await supabase.from('tests').update({
      title: t.title, description: t.description, category: t.category,
      status: t.status, start_page_html: t.start_page_html,
      time_limit_mins: t.time_limit_mins, max_warnings: t.max_warnings,
      available_from: t.available_from || null, available_until: t.available_until || null,
      updated_at: new Date().toISOString(),
    }).eq('id', t.id)
  }, [])

  function patchTest(patch: any) {
    const updated = { ...test, ...patch }
    setTest(updated)
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => saveTest(updated), 800)
  }

  // ── Save questions ─────────────────────────────────────────────────────────
  async function saveQuestions() {
    setSaving(true)
    for (let i = 0; i < questions.length; i++) {
      const q = { ...questions[i], position: i }
      const isNew = !q._saved
      if (isNew) {
        const { data: nq } = await supabase.from('test_questions').insert({
          test_id: test.id, type: q.type, body_html: q.body_html,
          points_correct: q.points_correct, points_incorrect: q.points_incorrect,
          is_required: q.is_required, position: i, time_limit_mins: q.time_limit_mins ?? null,
        }).select('id').single()
        if (nq) {
          q.id = (nq as any).id; q._saved = true
          for (let j = 0; j < (q.options ?? []).length; j++) {
            const o = q.options[j]
            await supabase.from('test_question_options').insert({ question_id: q.id, body_html: o.body_html, is_correct: o.is_correct, position: j })
          }
        }
      } else {
        await supabase.from('test_questions').update({
          type: q.type, body_html: q.body_html, points_correct: q.points_correct,
          points_incorrect: q.points_incorrect, is_required: q.is_required,
          position: i, time_limit_mins: q.time_limit_mins ?? null,
        }).eq('id', q.id)
        // Replace options
        await supabase.from('test_question_options').delete().eq('question_id', q.id)
        for (let j = 0; j < (q.options ?? []).length; j++) {
          const o = q.options[j]
          await supabase.from('test_question_options').insert({ question_id: q.id, body_html: o.body_html, is_correct: o.is_correct, position: j })
        }
      }
      questions[i] = q
    }
    setQuestions([...questions])
    setSaving(false); setSaved(true); setTimeout(() => setSaved(false), 2000)
  }

  async function deleteQuestion(id: string) {
    if (id && !id.startsWith('tmp')) await supabase.from('test_questions').delete().eq('id', id)
    setQuestions(p => p.filter(q => q.id !== id))
  }

  function addQuestion(type: QType) {
    const defaults: any = { id: 'tmp-' + uid(), _saved: false, type, body_html: '', points_correct: 1, points_incorrect: 0, is_required: true, time_limit_mins: null, position: questions.length }
    if (type === 'single' || type === 'multiple') defaults.options = [{ id: uid(), body_html: '', is_correct: true, position: 0 }, { id: uid(), body_html: '', is_correct: false, position: 1 }]
    else if (type === 'truefalse') defaults.options = [{ id: uid(), body_html: 'True', is_correct: true, position: 0 }, { id: uid(), body_html: 'False', is_correct: false, position: 1 }]
    else defaults.options = []
    setQuestions(p => [...p, defaults])
  }

  function moveQuestion(idx: number, dir: -1 | 1) {
    const arr = [...questions]
    const swap = idx + dir
    if (swap < 0 || swap >= arr.length) return
    ;[arr[idx], arr[swap]] = [arr[swap], arr[idx]]
    setQuestions(arr)
  }

  // ── Assignments ────────────────────────────────────────────────────────────
  async function toggleGroupAssign(groupId: string) {
    const existing = assignments.find(a => a.group_id === groupId)
    if (existing) {
      await supabase.from('test_assignments').delete().eq('id', existing.id)
      setAssignments(p => p.filter(a => a.id !== existing.id))
    } else {
      const { data } = await supabase.from('test_assignments').insert({ test_id: test.id, group_id: groupId }).select().single()
      if (data) {
        setAssignments(p => [...p, data])
        // Create notification for group members
        await fetch('/api/messages', { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ recipient_type: 'group', recipient_id: groupId, message_type: 'announcement', subject: 'New test assigned', text: `A new test "${test.title}" has been assigned to you.` }) })
      }
    }
  }

  async function toggleStudentAssign(studentId: string) {
    const existing = assignments.find(a => a.student_id === studentId)
    if (existing) {
      await supabase.from('test_assignments').delete().eq('id', existing.id)
      setAssignments(p => p.filter(a => a.id !== existing.id))
    } else {
      const { data } = await supabase.from('test_assignments').insert({ test_id: test.id, student_id: studentId }).select().single()
      if (data) setAssignments(p => [...p, data])
    }
  }

  const totalPoints = questions.reduce((s, q) => s + (q.points_correct ?? 0), 0)
  const inp: React.CSSProperties = { width: '100%', padding: '8px 10px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' as const }
  const lbl: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: '#666', display: 'block', marginBottom: 4 }
  const TAB: React.CSSProperties = { padding: '8px 18px', fontSize: 13, background: 'none', border: 'none', borderBottom: '2px solid transparent', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }
  const ACTIVE_TAB: React.CSSProperties = { ...TAB, color: '#185FA5', fontWeight: 600, borderBottom: '2px solid #185FA5' }

  return (
    <div>
      <Breadcrumb items={[{ label: 'Tests', href: '/teacher/tests' }, { label: test.title }]} />

      {/* Top bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>{test.title}</h1>
          <div style={{ fontSize: 12, color: '#aaa', marginTop: 2 }}>
            {questions.length} question{questions.length !== 1 ? 's' : ''} · {totalPoints} pts total
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <select value={test.status} onChange={e => patchTest({ status: e.target.value })}
            style={{ padding: '7px 12px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
            <option value="draft">Draft</option>
            <option value="published">Published</option>
            <option value="closed">Closed</option>
          </select>
          {tab === 'questions' && (
            <button onClick={saveQuestions} disabled={saving}
              style={{ padding: '8px 20px', background: '#185FA5', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: saving ? .6 : 1 }}>
              {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save questions'}
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid #e5e7eb', marginBottom: 24, gap: 2 }}>
        {([['settings','⚙️ Settings'],['questions','❓ Questions'],['assign','👥 Assign'],['grading','📊 Grading']] as [Tab,string][]).map(([t, label]) => (
          <button key={t} onClick={() => setTab(t)} style={tab === t ? ACTIVE_TAB : { ...TAB, color: '#666' }}>{label}</button>
        ))}
      </div>

      {/* ── SETTINGS TAB ── */}
      {tab === 'settings' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 20 }}>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 16 }}>Basic info</div>
              <label style={lbl}>Test name</label>
              <input value={test.title} onChange={e => patchTest({ title: e.target.value })} style={{ ...inp, marginBottom: 12 }} placeholder="e.g. Chapter 3 Quiz" />
              <label style={lbl}>Category / Subject</label>
              <input value={test.category} onChange={e => patchTest({ category: e.target.value })} style={{ ...inp, marginBottom: 12 }} placeholder="e.g. Mathematics" />
              <label style={lbl}>Description</label>
              <textarea value={test.description} onChange={e => patchTest({ description: e.target.value })}
                style={{ ...inp, height: 80, resize: 'vertical' }} placeholder="Short description visible to students" />
            </div>

            <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 20 }}>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 16 }}>⏰ Availability</div>
              <label style={lbl}>Opens at</label>
              <input type="datetime-local" value={test.available_from ? test.available_from.slice(0,16) : ''}
                onChange={e => patchTest({ available_from: e.target.value || null })} style={{ ...inp, marginBottom: 12 }} />
              <label style={lbl}>Closes at</label>
              <input type="datetime-local" value={test.available_until ? test.available_until.slice(0,16) : ''}
                onChange={e => patchTest({ available_until: e.target.value || null })} style={inp} />
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 20 }}>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 16 }}>⏱ Time limits</div>
              <label style={lbl}>Total test time (minutes) — leave blank for no limit</label>
              <input type="number" min={1} value={test.time_limit_mins ?? ''} placeholder="e.g. 60"
                onChange={e => patchTest({ time_limit_mins: e.target.value ? +e.target.value : null })} style={{ ...inp, marginBottom: 12 }} />
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: '#444' }}>
                <input type="checkbox" checked={test.question_time_limits ?? false} onChange={e => patchTest({ question_time_limits: e.target.checked })} />
                Enable per-question time limits (set in each question)
              </label>
            </div>

            <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 20 }}>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>🛡 Anti-cheat</div>
              <div style={{ fontSize: 12, color: '#888', marginBottom: 14 }}>If a student switches tabs or leaves the page, they receive a warning. After the limit, the test is locked.</div>
              <label style={lbl}>Max warnings before lock</label>
              <input type="number" min={1} max={20} value={test.max_warnings}
                onChange={e => patchTest({ max_warnings: +e.target.value })} style={{ ...inp, marginBottom: 12 }} />
              <div style={{ fontSize: 12, color: '#888', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '8px 12px' }}>
                ⚠️ Students are warned each time they leave fullscreen or switch tabs. Warning count is shown to teacher in results.
              </div>
            </div>

            <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 20 }}>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>📄 Test start page</div>
              <div style={{ fontSize: 12, color: '#888', marginBottom: 12 }}>Students see this before starting. Use it for instructions, rules, or an introduction.</div>
              <RichInput value={startPageHtml} onChange={v => { setStartPageHtml(v); patchTest({ start_page_html: v }) }}
                placeholder="Write instructions here… (optional)" minHeight={100} />
            </div>
          </div>
        </div>
      )}

      {/* ── QUESTIONS TAB ── */}
      {tab === 'questions' && (
        <div>
          {questions.length === 0 && (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: '#aaa', border: '1px dashed #e5e7eb', borderRadius: 12, marginBottom: 20 }}>
              No questions yet. Add one below.
            </div>
          )}
          {questions.map((q, i) => (
            <QuestionEditor key={q.id} q={q} idx={i} total={questions.length}
              onChange={updated => setQuestions(p => p.map(x => x.id === q.id ? updated : x))}
              onDelete={() => deleteQuestion(q.id)}
              onMove={dir => moveQuestion(i, dir)} />
          ))}

          {/* Add question buttons */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', padding: '16px 0', borderTop: '1px solid #f3f4f6' }}>
            <span style={{ fontSize: 12, color: '#aaa', marginRight: 4, alignSelf: 'center' }}>Add question:</span>
            {(Object.keys(Q_LABELS) as QType[]).map(t => (
              <button key={t} onClick={() => addQuestion(t)}
                style={{ padding: '7px 14px', fontSize: 12, border: '1px solid #e5e7eb', borderRadius: 7, background: '#f9fafb', cursor: 'pointer', color: '#444', fontWeight: 500 }}>
                {Q_ICONS[t]} {Q_LABELS[t]}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── ASSIGN TAB ── */}
      {tab === 'assign' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 20 }}>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>👥 Groups</div>
            <div style={{ fontSize: 12, color: '#888', marginBottom: 14 }}>Assign to all students in a group</div>
            {groups.length === 0 && <div style={{ fontSize: 13, color: '#aaa' }}>No groups yet. Create groups first.</div>}
            {groups.map(g => {
              const assigned = assignments.some(a => a.group_id === g.id)
              return (
                <div key={g.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #f9fafb' }}>
                  <span style={{ fontSize: 13, color: '#111' }}>{g.name}</span>
                  <button onClick={() => toggleGroupAssign(g.id)}
                    style={{ padding: '5px 14px', fontSize: 12, border: `1px solid ${assigned ? '#fca5a5' : '#e5e7eb'}`, borderRadius: 7, background: assigned ? '#fee2e2' : '#f3f4f6', color: assigned ? '#991b1b' : '#555', cursor: 'pointer', fontWeight: 600 }}>
                    {assigned ? 'Unassign' : 'Assign'}
                  </button>
                </div>
              )
            })}
          </div>
          <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 20 }}>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>👤 Individual students</div>
            <div style={{ fontSize: 12, color: '#888', marginBottom: 14 }}>Assign to specific students</div>
            <div style={{ maxHeight: 400, overflowY: 'auto' }}>
              {students.map(s => {
                const assigned = assignments.some(a => a.student_id === s.id)
                return (
                  <div key={s.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f9fafb' }}>
                    <span style={{ fontSize: 13, color: '#111' }}>{s.full_name ?? s.email}</span>
                    <button onClick={() => toggleStudentAssign(s.id)}
                      style={{ padding: '4px 12px', fontSize: 12, border: `1px solid ${assigned ? '#fca5a5' : '#e5e7eb'}`, borderRadius: 7, background: assigned ? '#fee2e2' : '#f3f4f6', color: assigned ? '#991b1b' : '#555', cursor: 'pointer' }}>
                      {assigned ? 'Remove' : 'Add'}
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── GRADING TAB ── */}
      {tab === 'grading' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 20 }}>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 16 }}>📊 Summary</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {[
                ['Total questions', questions.length],
                ['Total points', totalPoints],
                ['Required questions', questions.filter(q => q.is_required).length],
                ['Question types', [...new Set(questions.map(q => Q_LABELS[q.type as QType]))].join(', ') || '—'],
              ].map(([label, val]) => (
                <div key={label as string} style={{ background: '#f9fafb', borderRadius: 8, padding: '12px 14px' }}>
                  <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>{label}</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: '#111' }}>{val}</div>
                </div>
              ))}
            </div>
          </div>
          <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 20 }}>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 16 }}>Questions breakdown</div>
            {questions.length === 0 && <div style={{ color: '#aaa', fontSize: 13 }}>No questions added yet.</div>}
            {questions.map((q, i) => (
              <div key={q.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid #f9fafb', fontSize: 13 }}>
                <span style={{ color: '#185FA5', fontWeight: 700, minWidth: 28 }}>Q{i + 1}</span>
                <span style={{ fontSize: 11, padding: '1px 6px', background: '#E6F1FB', color: '#0C447C', borderRadius: 8 }}>{Q_LABELS[q.type as QType]}</span>
                <span style={{ flex: 1, color: '#555', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                  dangerouslySetInnerHTML={{ __html: q.body_html || '<em style="color:#bbb">No text</em>' }} />
                <span style={{ fontWeight: 600, color: '#27500A', flexShrink: 0 }}>{q.points_correct}pt</span>
                {!q.is_required && <span style={{ fontSize: 10, color: '#888', flexShrink: 0 }}>optional</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
