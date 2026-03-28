'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Breadcrumb } from '@/components/ui'

export default function ReviewClient({ test, attempt, questions, answers: initAnswers }: {
  test: any; attempt: any; questions: any[]; answers: any[]
}) {
  const supabase = createClient()
  const sortedQ = [...questions].sort((a, b) => a.position - b.position)

  // keyed by question_id
  const [answers, setAnswers] = useState<Record<string, any>>(() =>
    Object.fromEntries(initAnswers.map(a => [a.question_id, { ...a }]))
  )
  const [feedback, setFeedback] = useState(attempt.teacher_feedback ?? '')
  const [finalScore, setFinalScore] = useState<string>(attempt.final_score?.toString() ?? '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  function patchAnswer(qId: string, patch: any) {
    setAnswers(p => ({ ...p, [qId]: { ...p[qId], ...patch } }))
  }

  // ── Save all grades ──────────────────────────────────────────────────────────
  async function saveGrades() {
    setSaving(true); setError(''); setSaved(false)
    for (const q of sortedQ) {
      const ans = answers[q.id]
      if (!ans?.id) continue
      const { error: err } = await supabase.from('test_answers').update({
        teacher_points: ans.teacher_points ?? null,
        teacher_note: ans.teacher_note ?? null,
        reviewed_at: new Date().toISOString(),
      }).eq('id', ans.id)
      if (err) { setError('Save failed: ' + err.message); setSaving(false); return }
    }
    // Compute final score: use teacher_points if set, otherwise auto-grade
    let computed = 0
    for (const q of sortedQ) {
      const ans = answers[q.id]
      if (ans?.teacher_points != null) {
        computed += ans.teacher_points
      } else if (q.type !== 'descriptive') {
        const opts = q.test_question_options ?? []
        const selected: string[] = ans?.selected_option_ids ?? []
        const correctIds = opts.filter((o: any) => o.is_correct).map((o: any) => o.id)
        if (q.type === 'single' || q.type === 'truefalse') {
          if (selected[0] === correctIds[0]) computed += q.points_correct
          else if (selected.length > 0) computed -= (q.points_incorrect ?? 0)
        } else if (q.type === 'multiple') {
          const allRight = correctIds.every((id: string) => selected.includes(id)) && selected.every((id: string) => correctIds.includes(id))
          if (allRight) computed += q.points_correct
          else if (selected.length > 0) computed -= (q.points_incorrect ?? 0)
        }
      }
      // descriptive with no teacher_points stays 0
    }
    const fs = finalScore !== '' ? parseFloat(finalScore) : computed
    const { error: err2 } = await supabase.from('test_attempts').update({
      teacher_feedback: feedback,
      final_score: fs,
      reviewed_at: new Date().toISOString(),
    }).eq('id', attempt.id)
    if (err2) { setError('Save failed: ' + err2.message); setSaving(false); return }
    setSaving(false); setSaved(true); setTimeout(() => setSaved(false), 3000)
  }

  // ── Send results to student via notification ──────────────────────────────────
  async function sendToStudent() {
    setSending(true); setError('')
    await saveGrades()
    // Send notification
    const fs = finalScore !== '' ? parseFloat(finalScore) : attempt.score
    const res = await fetch('/api/notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: attempt.student_id,
        type: 'announcement',
        title: `Test graded: ${test.title}`,
        body: `Your test has been reviewed. Final score: ${fs} / ${attempt.max_score}.${feedback ? ' Your teacher left feedback.' : ''}`,
      }),
    })
    const result = await res.json()
    if (!res.ok) { setError('Notification failed: ' + result.error); setSending(false); return }
    setSending(false); setSent(true); setTimeout(() => setSent(false), 4000)
  }

  const maxScore = attempt.max_score ?? sortedQ.reduce((s: number, q: any) => s + q.points_correct, 0)
  const studentName = attempt.profiles?.full_name ?? attempt.profiles?.email ?? 'Student'

  const CARD: React.CSSProperties = { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 20 }

  return (
    <div>
      <Breadcrumb items={[
        { label: 'Tests', href: '/teacher/tests' },
        { label: test.title, href: `/teacher/tests/${test.id}` },
        { label: `Review — ${studentName}` },
      ]} />

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 4px' }}>{test.title}</h1>
          <div style={{ fontSize: 13, color: '#666' }}>
            Student: <strong>{studentName}</strong> ·
            Submitted: {attempt.submitted_at ? new Date(attempt.submitted_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'} ·
            Auto-score: <strong>{attempt.score ?? '—'} / {maxScore}</strong>
            {attempt.warning_count > 0 && <span style={{ marginLeft: 8, color: '#991b1b', fontWeight: 600 }}>⚠️ {attempt.warning_count} warnings</span>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={saveGrades} disabled={saving}
            style={{ padding: '9px 20px', background: saving ? '#aaa' : saved ? '#27500A' : '#185FA5', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save grades'}
          </button>
          <button onClick={sendToStudent} disabled={sending}
            style={{ padding: '9px 20px', background: sent ? '#27500A' : '#7c3aed', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            {sending ? 'Sending…' : sent ? '✓ Sent!' : '📨 Send to student'}
          </button>
        </div>
      </div>

      {error && (
        <div style={{ background: '#fee2e2', color: '#991b1b', padding: '10px 14px', borderRadius: 8, fontSize: 13, marginBottom: 16 }}>
          ⚠️ {error}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 20, alignItems: 'start' }}>
        {/* Questions */}
        <div>
          {sortedQ.map((q, i) => {
            const ans = answers[q.id]
            const opts = (q.test_question_options ?? []).sort((a: any, b: any) => a.position - b.position)
            const selected: string[] = ans?.selected_option_ids ?? []
            const correctIds = opts.filter((o: any) => o.is_correct).map((o: any) => o.id)
            const isObjective = q.type !== 'descriptive'

            // Determine correctness for objective
            let autoCorrect: boolean | null = null
            if (isObjective && selected.length > 0) {
              if (q.type === 'single' || q.type === 'truefalse') autoCorrect = selected[0] === correctIds[0]
              else autoCorrect = correctIds.every((id: string) => selected.includes(id)) && selected.every((id: string) => correctIds.includes(id))
            }

            const borderColor = isObjective
              ? (autoCorrect === true ? '#86efac' : autoCorrect === false ? '#fca5a5' : '#e5e7eb')
              : '#93c5fd'
            const bgColor = isObjective
              ? (autoCorrect === true ? '#f0fdf4' : autoCorrect === false ? '#fff1f2' : '#fff')
              : '#eff6ff'

            return (
              <div key={q.id} style={{ border: `1.5px solid ${borderColor}`, background: bgColor, borderRadius: 12, padding: '20px 24px', marginBottom: 14 }}>
                {/* Q header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                  <span style={{ fontWeight: 700, color: '#185FA5' }}>Q{i + 1}</span>
                  <span style={{ fontSize: 11, padding: '1px 7px', background: '#E6F1FB', color: '#0C447C', borderRadius: 8 }}>{q.type}</span>
                  <span style={{ fontSize: 11, color: '#888' }}>{q.points_correct} pt</span>
                  {isObjective && autoCorrect === true && <span style={{ fontSize: 12, fontWeight: 700, color: '#16a34a' }}>✓ Correct</span>}
                  {isObjective && autoCorrect === false && <span style={{ fontSize: 12, fontWeight: 700, color: '#dc2626' }}>✗ Incorrect</span>}
                  {!ans && <span style={{ fontSize: 12, color: '#aaa' }}>— Not answered</span>}
                </div>

                <div style={{ fontSize: 15, lineHeight: 1.7, marginBottom: 16, color: '#111' }}
                  dangerouslySetInnerHTML={{ __html: q.body_html }} />

                {/* Objective options */}
                {isObjective && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginBottom: 16 }}>
                    {opts.map((o: any) => {
                      const isSel = selected.includes(o.id)
                      const isCorr = o.is_correct
                      const bg2 = isSel && isCorr ? '#dcfce7' : isSel && !isCorr ? '#fee2e2' : !isSel && isCorr ? '#fef9c3' : '#f9fafb'
                      const bd2 = isSel && isCorr ? '#86efac' : isSel && !isCorr ? '#fca5a5' : !isSel && isCorr ? '#fde68a' : '#e5e7eb'
                      return (
                        <div key={o.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: bg2, border: `1.5px solid ${bd2}`, borderRadius: 8, fontSize: 13 }}>
                          <span style={{ fontWeight: 700, width: 16 }}>{isSel ? (isCorr ? '✓' : '✗') : isCorr ? '○' : ' '}</span>
                          <span style={{ flex: 1 }} dangerouslySetInnerHTML={{ __html: o.body_html }} />
                          {isCorr && !isSel && <span style={{ fontSize: 11, color: '#ca8a04', fontWeight: 600 }}>Correct answer</span>}
                          {isSel && <span style={{ fontSize: 11, color: '#555' }}>Student selected</span>}
                        </div>
                      )
                    })}
                  </div>
                )}

                {/* Descriptive answer */}
                {q.type === 'descriptive' && (
                  <div style={{ background: '#fff', border: '1px solid #dbeafe', borderRadius: 8, padding: '12px 14px', fontSize: 13, color: '#1e3a5f', lineHeight: 1.7, marginBottom: 16, minHeight: 60 }}>
                    {ans?.answer_text || <span style={{ color: '#aaa' }}>No answer provided</span>}
                  </div>
                )}

                {/* Teacher grading row */}
                <div style={{ borderTop: '1px solid #f0f0f0', paddingTop: 12, display: 'flex', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <label style={{ fontSize: 12, color: '#666', whiteSpace: 'nowrap' }}>
                      Points (max {q.points_correct}):
                    </label>
                    <input type="number" min={0} max={q.points_correct} step={0.5}
                      value={ans?.teacher_points ?? ''}
                      onChange={e => patchAnswer(q.id, { teacher_points: e.target.value === '' ? null : parseFloat(e.target.value) })}
                      placeholder={isObjective ? (autoCorrect ? q.points_correct.toString() : '0') : '—'}
                      style={{ width: 68, padding: '4px 8px', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 13, outline: 'none', textAlign: 'center' }} />
                    {isObjective && ans?.teacher_points == null && (
                      <span style={{ fontSize: 11, color: '#aaa' }}>auto: {autoCorrect ? q.points_correct : 0}</span>
                    )}
                  </div>
                  <div style={{ flex: 1 }}>
                    <input
                      value={ans?.teacher_note ?? ''}
                      onChange={e => patchAnswer(q.id, { teacher_note: e.target.value })}
                      placeholder="Add a note for the student… (optional)"
                      style={{ width: '100%', padding: '6px 10px', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 13, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' as const }} />
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* Right sidebar — overall grade */}
        <div style={{ position: 'sticky', top: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={CARD}>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 14 }}>📊 Grade summary</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13, color: '#555', marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Auto-score</span><strong>{attempt.score ?? '—'} / {maxScore}</strong></div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Descriptive pts</span><strong>{sortedQ.filter(q => q.type === 'descriptive').reduce((s, q) => s + (answers[q.id]?.teacher_points ?? 0), 0)}</strong></div>
            </div>
            <label style={{ fontSize: 11, fontWeight: 600, color: '#666', display: 'block', marginBottom: 4 }}>FINAL SCORE (override)</label>
            <input type="number" min={0} max={maxScore} step={0.5}
              value={finalScore}
              onChange={e => setFinalScore(e.target.value)}
              placeholder={`Auto: ${attempt.score ?? '—'}`}
              style={{ width: '100%', padding: '8px 10px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 15, fontWeight: 700, outline: 'none', textAlign: 'center', boxSizing: 'border-box' as const }} />
            <div style={{ fontSize: 11, color: '#aaa', marginTop: 4, textAlign: 'center' }}>Leave blank to use auto-computed score</div>
          </div>

          <div style={CARD}>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8 }}>💬 Overall feedback</div>
            <textarea value={feedback} onChange={e => setFeedback(e.target.value)}
              placeholder="Write overall feedback for the student…"
              style={{ width: '100%', minHeight: 100, padding: '8px 10px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', resize: 'vertical', outline: 'none', boxSizing: 'border-box' as const }} />
          </div>

          <div style={CARD}>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8 }}>📨 Send to student</div>
            <div style={{ fontSize: 12, color: '#888', lineHeight: 1.6, marginBottom: 12 }}>Saves grades and sends a notification to the student. They will see their score, feedback, and per-question notes.</div>
            <button onClick={sendToStudent} disabled={sending}
              style={{ width: '100%', padding: '10px', background: sent ? '#27500A' : '#7c3aed', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              {sending ? 'Sending…' : sent ? '✓ Sent to student!' : '📨 Send graded test'}
            </button>
          </div>

          <div style={CARD}>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8 }}>🖨 Print / PDF</div>
            <div style={{ fontSize: 12, color: '#888', marginBottom: 12 }}>Opens a print-friendly view of the reviewed test.</div>
            <button onClick={() => window.print()}
              style={{ width: '100%', padding: '10px', background: '#f3f4f6', color: '#444', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              🖨 Print / Save as PDF
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
