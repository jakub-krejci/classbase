'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { BackLink } from '@/components/ui'

export default function AssignmentView({ assignment, moduleId, studentId, existingSubmission }: {
  assignment: any; moduleId: string; studentId: string; existingSubmission: any
}) {
  const supabase = createClient()
  const router = useRouter()
  const [answers, setAnswers] = useState<Record<string, any>>({})
  const [openAnswers, setOpenAnswers] = useState<Record<number, string>>({})
  const [hwText, setHwText] = useState('')
  const [fileName, setFileName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(!!existingSubmission)
  const [result, setResult] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  if (existingSubmission) {
    const sub = existingSubmission
    const isGraded = sub.status === 'graded'
    return (
      <div>
        <BackLink href={'/student/modules/' + moduleId} label="Back to module" />
        <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 4 }}>{assignment.title}</h1>
        <div style={{ fontSize: 13, color: '#888', marginBottom: 16 }}>{assignment.type} · Already submitted</div>
        <div style={{ padding: '10px 14px', background: '#EAF3DE', color: '#27500A', borderRadius: 10, fontSize: 13, marginBottom: 12 }}>
          ✓ Submitted successfully{isGraded ? ` · Grade: ${sub.teacher_score}%` : ' · Awaiting teacher review'}
        </div>
        {isGraded && sub.teacher_feedback && (
          <div style={{ padding: '10px 14px', background: '#f9fafb', border: '0.5px solid #e5e7eb', borderRadius: 10, fontSize: 13 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#888', marginBottom: 4, textTransform: 'uppercase' }}>Teacher feedback</div>
            {sub.teacher_feedback}
          </div>
        )}
      </div>
    )
  }

  async function submit() {
    setSubmitting(true)
    let autoScore: number | null = null
    const payload: any = { student_id: studentId, assignment_id: assignment.id, status: 'submitted', answers: {} }

    if (assignment.type === 'homework') {
      payload.answers = { text: hwText.trim(), file_name: fileName || null }
      payload.status = 'submitted'
    } else {
      const qs = assignment.questions ?? []
      let correct = 0
      let autoCount = 0
      const answersMap: any = {}
      qs.forEach((q: any, i: number) => {
        if (q.type === 'open') {
          answersMap['open_' + i] = openAnswers[i] ?? ''
        } else {
          const selected = answers[i] ?? -1
          answersMap['closed_' + i] = selected
          if (selected === (q.correct?.[0] ?? 0)) correct++
          autoCount++
        }
      })
      payload.answers = { ...answersMap, open: openAnswers }
      const hasOpen = qs.some((q: any) => q.type === 'open')
      autoScore = autoCount > 0 ? Math.round(correct / autoCount * 100) : null
      payload.auto_score = autoScore
      payload.status = hasOpen ? 'submitted' : 'graded'
      if (!hasOpen && autoScore !== null) {
        payload.teacher_score = autoScore
      }
      setResult(autoCount > 0 ? `Auto-graded: ${correct}/${autoCount} correct (${autoScore}%)` + (hasOpen ? ' · Open answers sent for review' : '') : 'Submitted for teacher review.')
    }

    const { error } = await supabase.from('submissions').insert(payload)
    if (error) { setSubmitting(false); return }
    setSubmitted(true)
    setSubmitting(false)
    router.refresh()
  }

  const qs = assignment.questions ?? []
  const inp: React.CSSProperties = { width: '100%', padding: '8px 10px', border: '0.5px solid #e5e7eb', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', outline: 'none' }

  return (
    <div>
      <BackLink href={'/student/modules/' + moduleId} label="Back to module" />
      <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 4 }}>{assignment.title}</h1>
      <div style={{ fontSize: 13, color: '#888', marginBottom: 16 }}>
        {assignment.type}
        {assignment.deadline ? ' · Due ' + new Date(assignment.deadline).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}
      </div>

      {submitted ? (
        <div style={{ padding: '12px 16px', background: '#EAF3DE', color: '#27500A', borderRadius: 10, fontSize: 13 }}>
          ✓ {result || 'Submitted successfully!'}
        </div>
      ) : (
        <>
          {assignment.type === 'homework' ? (
            <div>
              {assignment.instructions && (
                <div style={{ padding: '12px 14px', background: '#f9fafb', border: '0.5px solid #e5e7eb', borderRadius: 10, fontSize: 13, marginBottom: 16 }}>
                  {assignment.instructions}
                </div>
              )}
              <label style={{ fontSize: 11, fontWeight: 500, color: '#666', display: 'block', marginBottom: 4 }}>Your answer</label>
              <textarea value={hwText} onChange={e => setHwText(e.target.value)}
                style={{ ...inp, height: 120, resize: 'vertical', marginBottom: 12 }} placeholder="Write your answer here…" />
              <label style={{ fontSize: 11, fontWeight: 500, color: '#666', display: 'block', marginBottom: 4 }}>Attach file (optional)</label>
              <div onClick={() => fileRef.current?.click()}
                style={{ padding: '14px', border: '1px dashed #e5e7eb', borderRadius: 8, textAlign: 'center', fontSize: 13, color: fileName ? '#27500A' : '#888', background: fileName ? '#EAF3DE' : '#f9fafb', cursor: 'pointer', marginBottom: 14 }}>
                {fileName ? '📎 ' + fileName : 'Click to upload a file'}
              </div>
              <input ref={fileRef} type="file" style={{ display: 'none' }} onChange={e => setFileName(e.target.files?.[0]?.name ?? '')} />
            </div>
          ) : (
            qs.map((q: any, i: number) => (
              <div key={i} style={{ background: '#fff', border: '0.5px solid #e5e7eb', borderRadius: 10, padding: '14px', marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <div style={{ fontWeight: 500, fontSize: 14, flex: 1 }}>{i + 1}. {q.q}</div>
                  <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 20, background: q.type === 'open' ? '#FAEEDA' : '#E6F1FB', color: q.type === 'open' ? '#633806' : '#0C447C', fontWeight: 500 }}>
                    {q.type === 'open' ? 'Open-ended' : 'Closed'}
                  </span>
                </div>
                {q.type === 'open' ? (
                  <textarea value={openAnswers[i] ?? ''} onChange={e => setOpenAnswers(p => ({ ...p, [i]: e.target.value }))}
                    style={{ ...inp, height: 80, resize: 'vertical' }} placeholder="Your answer…" />
                ) : (
                  (q.opts ?? []).map((o: string, oi: number) => (
                    <label key={oi} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', border: '0.5px solid', borderColor: answers[i] === oi ? '#185FA5' : '#e5e7eb', borderRadius: 8, marginBottom: 5, cursor: 'pointer', fontSize: 13, background: answers[i] === oi ? '#E6F1FB' : '#fff' }}>
                      <input type="radio" name={'q' + i} checked={answers[i] === oi} onChange={() => setAnswers(p => ({ ...p, [i]: oi }))} style={{ width: 14, height: 14 }} />
                      {o}
                    </label>
                  ))
                )}
              </div>
            ))
          )}

          <button onClick={submit} disabled={submitting}
            style={{ marginTop: 8, padding: '10px 24px', background: '#185FA5', color: '#E6F1FB', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer', opacity: submitting ? .6 : 1 }}>
            {submitting ? 'Submitting…' : 'Submit'}
          </button>
        </>
      )}
    </div>
  )
}
