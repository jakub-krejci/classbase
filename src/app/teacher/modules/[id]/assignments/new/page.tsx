'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useParams } from 'next/navigation'
import { Btn, BackLink, Card } from '@/components/ui'

const inp: React.CSSProperties = { width: '100%', padding: '8px 10px', border: '0.5px solid #e5e7eb', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', marginBottom: 10, color: '#111', background: '#fff', outline: 'none' }
const lbl: React.CSSProperties = { display: 'block', fontSize: 11, fontWeight: 500, color: '#666', marginBottom: 3 }

export default function AssignmentEditorPage() {
  const supabase = createClient()
  const router = useRouter()
  const params = useParams() as any
  const moduleId = params.id as string
  const assignmentId = params.assignmentId as string
  const isNew = !assignmentId || assignmentId === 'new'

  const [title, setTitle] = useState('')
  const [type, setType] = useState<'quiz' | 'test' | 'homework'>('quiz')
  const [lessonId, setLessonId] = useState('')
  const [hwInstr, setHwInstr] = useState('')
  const [deadline, setDeadline] = useState('')
  const [questions, setQuestions] = useState<any[]>([])
  const [lessons, setLessons] = useState<any[]>([])
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const { data: ls } = await supabase.from('lessons').select('id,title').eq('module_id', moduleId).order('position')
      setLessons(ls ?? [])
      if (!isNew) {
        const { data: a } = await supabase.from('assignments').select('*').eq('id', assignmentId).single()
        if (a) { setTitle((a as any).title); setType((a as any).type); setLessonId((a as any).lesson_id ?? ''); setHwInstr((a as any).instructions ?? ''); setDeadline((a as any).deadline ?? ''); setQuestions((a as any).questions ?? []) }
      } else {
        setQuestions([newQ('closed')])
      }
      setLoading(false)
    }
    load()
  }, [])

  function newQ(qtype: string): any { return { type: qtype, q: '', opts: qtype !== 'open' ? ['', ''] : [], correct: [0], explanation: '' } }

  function addQ() { setQuestions(prev => [...prev, newQ('closed')]) }
  function removeQ(i: number) { setQuestions(prev => prev.filter((_, j) => j !== i)) }
  function updateQ(i: number, field: string, val: any) { setQuestions(prev => prev.map((q, j) => j === i ? { ...q, [field]: val } : q)) }
  function addOpt(qi: number) { setQuestions(prev => prev.map((q, j) => j === qi ? { ...q, opts: [...(q.opts ?? []), ''] } : q)) }
  function updateOpt(qi: number, oi: number, val: string) { setQuestions(prev => prev.map((q, j) => j === qi ? { ...q, opts: (q.opts ?? []).map((o: string, k: number) => k === oi ? val : o) } : q)) }
  function removeOpt(qi: number, oi: number) { setQuestions(prev => prev.map((q, j) => j === qi ? { ...q, opts: (q.opts ?? []).filter((_: string, k: number) => k !== oi), correct: [(q.correct?.[0] ?? 0) > oi ? (q.correct[0] - 1) : q.correct?.[0] ?? 0] } : q)) }

  async function save() {
    if (!title.trim()) { setError('Title is required.'); return }
    setSaving(true); setError('')
    const payload: any = { module_id: moduleId, title: title.trim(), type, lesson_id: lessonId || null, questions: type === 'homework' ? [] : questions, instructions: type === 'homework' ? hwInstr : null, deadline: deadline || null }
    const { error: err } = isNew
      ? await supabase.from('assignments').insert(payload)
      : await supabase.from('assignments').update(payload).eq('id', assignmentId)
    if (err) { setError(err.message); setSaving(false); return }
    router.push('/teacher/modules/' + moduleId)
    router.refresh()
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#888' }}>Loading…</div>

  return (
    <div style={{ maxWidth: 600, margin: '32px auto', padding: '0 20px', fontFamily: 'system-ui, sans-serif' }}>
      <BackLink href={'/teacher/modules/' + moduleId} label="Back to module" />
      <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 20 }}>{isNew ? 'New assignment' : 'Edit assignment'}</h1>
      <Card>
        <label style={lbl}>Title</label>
        <input style={inp} value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Chapter 1 Quiz" />

        <label style={lbl}>Type</label>
        <select style={inp} value={type} onChange={e => setType(e.target.value as any)}>
          <option value="quiz">Quiz</option>
          <option value="test">Test</option>
          <option value="homework">Homework</option>
        </select>

        <label style={lbl}>Link to lesson (optional)</label>
        <select style={inp} value={lessonId} onChange={e => setLessonId(e.target.value)}>
          <option value="">— none —</option>
          {lessons.map((l: any) => <option key={l.id} value={l.id}>{l.title}</option>)}
        </select>

        {type === 'homework' ? (
          <>
            <label style={lbl}>Instructions</label>
            <textarea style={{ ...inp, height: 80, resize: 'vertical' }} value={hwInstr} onChange={e => setHwInstr(e.target.value)} placeholder="What should students submit?" />
            <label style={lbl}>Deadline (optional)</label>
            <input style={inp} type="datetime-local" value={deadline} onChange={e => setDeadline(e.target.value)} />
          </>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <label style={{ ...lbl, margin: 0 }}>Questions</label>
              <select style={{ padding: '4px 8px', border: '0.5px solid #e5e7eb', borderRadius: 6, fontSize: 11, fontFamily: 'inherit' }} id="qtype">
                <option value="closed">Closed</option>
                <option value="open">Open-ended</option>
              </select>
            </div>
            {questions.map((q: any, qi: number) => (
              <div key={qi} style={{ background: '#f9fafb', border: '0.5px solid #e5e7eb', borderRadius: 10, padding: '12px', marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                  <span style={{ flex: 1, fontSize: 11, fontWeight: 500, color: '#888' }}>Q{qi + 1} · {q.type === 'open' ? 'Open-ended' : 'Closed'}</span>
                  <select value={q.type} onChange={e => updateQ(qi, 'type', e.target.value)} style={{ padding: '3px 7px', border: '0.5px solid #e5e7eb', borderRadius: 6, fontSize: 11, fontFamily: 'inherit' }}>
                    <option value="closed">Closed</option>
                    <option value="open">Open-ended</option>
                  </select>
                  <button onClick={() => removeQ(qi)} style={{ fontSize: 12, color: '#A32D2D', background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
                </div>
                <input placeholder="Question text" value={q.q} onChange={e => updateQ(qi, 'q', e.target.value)}
                  style={{ width: '100%', padding: '6px 8px', border: '0.5px solid #e5e7eb', borderRadius: 7, fontSize: 12, fontFamily: 'inherit', marginBottom: 8, outline: 'none' }} />
                {q.type !== 'open' && (
                  <>
                    {(q.opts ?? []).map((o: string, oi: number) => (
                      <div key={oi} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
                        <div onClick={() => updateQ(qi, 'correct', [oi])}
                          style={{ width: 14, height: 14, borderRadius: '50%', border: '0.5px solid #e5e7eb', background: (q.correct ?? [])[0] === oi ? '#3B6D11' : '#fff', cursor: 'pointer', flexShrink: 0 }} />
                        <input value={o} onChange={e => updateOpt(qi, oi, e.target.value)} placeholder={`Option ${oi + 1}`}
                          style={{ flex: 1, padding: '4px 7px', border: '0.5px solid #e5e7eb', borderRadius: 6, fontSize: 12, fontFamily: 'inherit', outline: 'none' }} />
                        <button onClick={() => removeOpt(qi, oi)} style={{ fontSize: 11, color: '#999', background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
                      </div>
                    ))}
                    <button onClick={() => addOpt(qi)} style={{ fontSize: 11, color: '#185FA5', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 0' }}>+ Add option</button>
                    <div style={{ marginTop: 8 }}>
                      <label style={{ ...lbl, fontSize: 10 }}>Explanation (shown when wrong)</label>
                      <input value={q.explanation ?? ''} onChange={e => updateQ(qi, 'explanation', e.target.value)} placeholder="Why is that the correct answer?"
                        style={{ width: '100%', padding: '5px 8px', border: '0.5px solid #e5e7eb', borderRadius: 6, fontSize: 12, fontFamily: 'inherit', outline: 'none' }} />
                    </div>
                  </>
                )}
                {q.type === 'open' && (
                  <div style={{ fontSize: 11, color: '#888', padding: '6px 10px', background: '#fff', borderRadius: 7, border: '0.5px solid #e5e7eb' }}>Students type a free-text answer — you grade manually.</div>
                )}
              </div>
            ))}
            <button onClick={addQ} style={{ fontSize: 12, color: '#185FA5', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0', marginBottom: 12 }}>+ Add question</button>
          </>
        )}

        {error && <div style={{ fontSize: 12, padding: '7px 10px', background: '#FCEBEB', color: '#791F1F', borderRadius: 8, marginBottom: 10 }}>{error}</div>}
        <div style={{ display: 'flex', gap: 8 }}>
          <Btn variant="primary" onClick={save} style={{ opacity: saving ? .6 : 1 }}>{saving ? 'Saving…' : 'Save assignment'}</Btn>
          <Btn href={'/teacher/modules/' + moduleId}>Cancel</Btn>
        </div>
      </Card>
    </div>
  )
}
