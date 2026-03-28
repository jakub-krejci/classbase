'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Breadcrumb } from '@/components/ui'
import { highlightPython, PYTHON_CSS } from '@/lib/highlight'

const Q_LABELS: Record<string, string> = {
  single: 'Jeden výběr', multiple: 'Více výběrů',
  descriptive: 'Popisná', truefalse: 'Pravda / Nepravda', coding: 'Kódování',
}

// Per-student editable card — isolated component so hooks are legal
function StudentAnswerCard({ att, currentQ, opts, correctIds, answer, onSave }: {
  att: any; currentQ: any; opts: any[]; correctIds: Set<string>
  answer: any; onSave: (pts: number, note: string) => Promise<void>
}) {
  const [localPts, setLocalPts] = useState<string>(String(answer?.teacher_points ?? ''))
  const [localNote, setLocalNote] = useState<string>(answer?.teacher_note ?? '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const name = att.profiles?.full_name ?? att.profiles?.email ?? att.student_id.slice(0, 8)

  function isAutoCorrect(): boolean | null {
    if (!answer || currentQ.type === 'descriptive' || currentQ.type === 'coding') return null
    const sel: string[] = answer.selected_option_ids ?? []
    if (currentQ.type === 'single' || currentQ.type === 'truefalse')
      return sel.length > 0 && sel[0] === [...correctIds][0]
    if (currentQ.type === 'multiple')
      return sel.length === correctIds.size && sel.every((id: string) => correctIds.has(id))
    return null
  }

  const autoCorrect = isAutoCorrect()
  const cardBorder = autoCorrect === true ? '#86efac' : autoCorrect === false ? '#fca5a5' : '#e5e7eb'
  const cardBg = autoCorrect === true ? '#f0fdf4' : autoCorrect === false ? '#fef2f2' : '#fff'

  async function handleSave() {
    setSaving(true)
    await onSave(parseFloat(localPts) || 0, localNote)
    setSaving(false); setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div style={{ background: cardBg, border: `1.5px solid ${cardBorder}`, borderRadius: 12, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontWeight: 600, fontSize: 13 }}>{name}</div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {autoCorrect === true  && <span style={{ fontSize: 11, fontWeight: 700, color: '#16a34a', background: '#dcfce7', padding: '2px 7px', borderRadius: 20 }}>✓ Correct</span>}
          {autoCorrect === false && <span style={{ fontSize: 11, fontWeight: 700, color: '#dc2626', background: '#fee2e2', padding: '2px 7px', borderRadius: 20 }}>✗ Incorrect</span>}
          {saved && <span style={{ fontSize: 11, color: '#16a34a', fontWeight: 600 }}>✓ Saved</span>}
        </div>
      </div>

      {/* Answer */}
      {!answer && <div style={{ fontSize: 13, color: '#aaa', fontStyle: 'italic' }}>No answer submitted</div>}

      {answer && (currentQ.type === 'single' || currentQ.type === 'multiple' || currentQ.type === 'truefalse') && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {opts.map((o: any) => {
            const sel = (answer.selected_option_ids ?? []).includes(o.id)
            const correct = correctIds.has(o.id)
            const bg = sel && correct ? '#dcfce7' : sel && !correct ? '#fee2e2' : !sel && correct ? '#fffbeb' : '#f9fafb'
            const border = sel && correct ? '#86efac' : sel && !correct ? '#fca5a5' : !sel && correct ? '#fde68a' : '#f3f4f6'
            return (
              <div key={o.id} style={{ padding: '5px 8px', borderRadius: 6, background: bg, border: `1px solid ${border}`, fontSize: 12, display: 'flex', gap: 6 }}>
                <span>{sel ? (correct ? '✓' : '✗') : (correct ? '○' : '·')}</span>
                <span dangerouslySetInnerHTML={{ __html: o.body_html }} />
              </div>
            )
          })}
        </div>
      )}

      {answer && currentQ.type === 'descriptive' && (
        <div style={{ fontSize: 13, color: '#333', lineHeight: 1.6, padding: '8px 10px', background: '#f9fafb', borderRadius: 8, minHeight: 60, whiteSpace: 'pre-wrap' }}>
          {answer.answer_text || <em style={{ color: '#bbb' }}>Empty</em>}
        </div>
      )}

      {answer && currentQ.type === 'coding' && (
        <div style={{ borderRadius: 8, overflow: 'hidden', border: '1px solid #2a2a4a' }}>
          <div style={{ background: '#161825', padding: '4px 10px', fontSize: 10, color: '#6c7086' }}>Python</div>
          <pre style={{ margin: 0, padding: '8px 12px', background: '#1a1b26', color: '#cdd6f4', fontSize: 12, lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: 180, overflowY: 'auto' }}
            dangerouslySetInnerHTML={{ __html: highlightPython(answer.answer_text ?? '') }} />
        </div>
      )}

      {/* Points + note */}
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <span style={{ fontSize: 12, color: '#666' }}>Points:</span>
        <input type="number" min={0} max={currentQ.points_correct} step={0.5}
          value={localPts} onChange={e => setLocalPts(e.target.value)}
          style={{ width: 60, padding: '4px 6px', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 12 }} />
        <span style={{ fontSize: 11, color: '#aaa' }}>/ {currentQ.points_correct}</span>
        <button onClick={handleSave} disabled={saving}
          style={{ marginLeft: 'auto', padding: '4px 14px', background: '#185FA5', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer', opacity: saving ? .6 : 1 }}>
          {saving ? '…' : 'Uložit'}
        </button>
      </div>
      <input type="text" placeholder="Teacher note (optional)…" value={localNote} onChange={e => setLocalNote(e.target.value)}
        style={{ padding: '5px 8px', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 12, width: '100%', boxSizing: 'border-box' as const }} />
    </div>
  )
}

export default function BulkGradeClient({ test, questions, attempts, answers, initialQ }: {
  test: any; questions: any[]; attempts: any[]; answers: any[]; initialQ: number
}) {
  const supabase = createClient()
  const [qIdx, setQIdx] = useState(Math.min(initialQ, Math.max(0, questions.length - 1)))
  const [localAnswers, setLocalAnswers] = useState<Record<string, any>>(
    Object.fromEntries(answers.map(a => [a.attempt_id + '|' + a.question_id, a]))
  )
  const [bulkSaving, setBulkSaving] = useState(false)

  const currentQ = questions[qIdx]
  if (!currentQ) return <div style={{ padding: 40, textAlign: 'center', color: '#aaa' }}>No questions.</div>

  const opts = (currentQ.test_question_options ?? []).sort((a: any, b: any) => a.position - b.position)
  const correctIds = new Set<string>(opts.filter((o: any) => o.is_correct).map((o: any) => o.id))

  function getAnswer(attemptId: string) {
    return localAnswers[attemptId + '|' + currentQ.id] ?? null
  }

  async function savePoints(attemptId: string, questionId: string, pts: number, note: string) {
    const key = attemptId + '|' + questionId
    const ans = getAnswer(attemptId)
    if (ans?.id) {
      await supabase.from('test_answers').update({
        teacher_points: pts, teacher_note: note, reviewed_at: new Date().toISOString(),
      }).eq('id', ans.id)
    } else {
      const { data } = await supabase.from('test_answers').upsert({
        attempt_id: attemptId, question_id: questionId,
        teacher_points: pts, teacher_note: note, reviewed_at: new Date().toISOString(),
      }, { onConflict: 'attempt_id,question_id' }).select().single()
      if (data) setLocalAnswers(p => ({ ...p, [key]: data }))
    }
    setLocalAnswers(p => ({ ...p, [key]: { ...(p[key] ?? {}), teacher_points: pts, teacher_note: note } }))
  }

  async function bulkSetPoints(pts: number) {
    setBulkSaving(true)
    for (const att of attempts) {
      await savePoints(att.id, currentQ.id, pts, getAnswer(att.id)?.teacher_note ?? '')
    }
    setBulkSaving(false)
  }

  // Stats for current question
  const answeredCount = attempts.filter(a => getAnswer(a.id) !== null).length
  const gradedCount = attempts.filter(a => getAnswer(a.id)?.teacher_points != null).length

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto' }}>
      <style>{PYTHON_CSS}</style>
      <Breadcrumb items={[
        { label: 'Testy', href: '/teacher/tests' },
        { label: test.title, href: `/teacher/tests/${test.id}` },
        { label: 'Hromadné hodnocení' },
      ]} />

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, gap: 12, flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>✏️ Bulk Grade — {test.title}</h1>
        <div style={{ fontSize: 13, color: '#888' }}>
          {attempts.length} submission{attempts.length !== 1 ? 's' : ''} · {gradedCount}/{attempts.length} graded for this question
        </div>
      </div>

      {/* Question pills */}
      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, padding: '14px 18px', marginBottom: 20 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#888', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '.05em' }}>Question</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {questions.map((q, i) => (
            <button key={q.id} onClick={() => setQIdx(i)}
              style={{ padding: '6px 12px', borderRadius: 8, border: `1.5px solid ${i === qIdx ? '#185FA5' : '#e5e7eb'}`, background: i === qIdx ? '#185FA5' : '#fff', color: i === qIdx ? '#fff' : '#555', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
              Q{i + 1}
            </button>
          ))}
        </div>
      </div>

      {/* Current question header */}
      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, padding: '20px 24px', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#185FA5', background: '#E6F1FB', padding: '3px 10px', borderRadius: 20 }}>Q{qIdx + 1}</span>
          <span style={{ fontSize: 11, background: '#f3f4f6', color: '#555', padding: '2px 8px', borderRadius: 8 }}>{Q_LABELS[currentQ.type] ?? currentQ.type}</span>
          <span style={{ fontSize: 11, color: '#888' }}>Max: {currentQ.points_correct} pts</span>
          <span style={{ fontSize: 11, color: '#888', marginLeft: 'auto' }}>
            {answeredCount}/{attempts.length} answered · {gradedCount}/{attempts.length} graded
          </span>
        </div>
        <div style={{ fontSize: 15, lineHeight: 1.7, color: '#111', marginBottom: 12 }} dangerouslySetInnerHTML={{ __html: currentQ.body_html }} />
        {opts.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
            {opts.map((o: any) => (
              <div key={o.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, padding: '6px 10px', borderRadius: 8, background: correctIds.has(o.id) ? '#f0fdf4' : '#fafafa', border: `1px solid ${correctIds.has(o.id) ? '#86efac' : '#f3f4f6'}` }}>
                <span>{correctIds.has(o.id) ? '✓' : '○'}</span>
                <span dangerouslySetInnerHTML={{ __html: o.body_html }} />
              </div>
            ))}
          </div>
        )}
        {/* Bulk assign */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', background: '#f9fafb', borderRadius: 8 }}>
          <span style={{ fontSize: 12, color: '#555' }}>Bulk assign all students:</span>
          {[0, Math.round(currentQ.points_correct / 2 * 2) / 2, currentQ.points_correct].filter((v, i, a) => a.indexOf(v) === i).map(pts => (
            <button key={pts} onClick={() => bulkSetPoints(pts)} disabled={bulkSaving}
              style={{ padding: '4px 14px', fontSize: 12, fontWeight: 600, background: '#185FA5', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', opacity: bulkSaving ? .6 : 1 }}>
              {pts} pts
            </button>
          ))}
          {bulkSaving && <span style={{ fontSize: 12, color: '#888' }}>Saving…</span>}
        </div>
      </div>

      {/* Student cards grid */}
      {attempts.length === 0 && (
        <div style={{ textAlign: 'center', padding: 40, color: '#aaa', border: '1px dashed #e5e7eb', borderRadius: 12 }}>No submissions yet.</div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 14 }}>
        {attempts.map((att: any) => (
          <StudentAnswerCard
            key={att.id + '|' + currentQ.id}
            att={att}
            currentQ={currentQ}
            opts={opts}
            correctIds={correctIds}
            answer={getAnswer(att.id)}
            onSave={(pts, note) => savePoints(att.id, currentQ.id, pts, note)}
          />
        ))}
      </div>
    </div>
  )
}
