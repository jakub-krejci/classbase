'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { PageHeader, EmptyState, Card, Btn, Pill } from '@/components/ui'

export default function GradeClient({ submissions }: { submissions: any[] }) {
  const supabase = createClient()
  const router = useRouter()
  const [scores, setScores] = useState<Record<string, string>>({})
  const [feedback, setFeedback] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState<Record<string, boolean>>({})

  async function returnGrade(sub: any) {
    const score = parseInt(scores[sub.id] ?? '')
    if (isNaN(score) || score < 0 || score > 100) { alert('Enter a grade between 0 and 100.'); return }
    setSaving(prev => ({ ...prev, [sub.id]: true }))
    await supabase.from('submissions').update({
      teacher_score: score,
      teacher_feedback: feedback[sub.id] ?? '',
      status: 'graded',
      graded_at: new Date().toISOString(),
    } as any).eq('id', sub.id)
    setSaving(prev => ({ ...prev, [sub.id]: false }))
    router.refresh()
  }

  return (
    <div>
      <PageHeader title="Grading" sub="Review open-ended answers and homework submissions" />
      {submissions.length === 0 ? (
        <EmptyState message="No submissions pending review. Open-ended answers and homework appear here after students submit." />
      ) : (
        submissions.map((sub: any) => {
          const student = sub.profiles as any
          const assignment = sub.assignments as any
          const openQs = (assignment?.questions ?? []).filter((q: any) => q.type === 'open')
          return (
            <Card key={sub.id} style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 }}>
                <div>
                  <div style={{ fontWeight: 500, fontSize: 14 }}>{assignment?.title}</div>
                  <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>
                    {student?.full_name ?? student?.email} · Submitted {new Date(sub.submitted_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
                <Pill label="Pending review" color="amber" />
              </div>

              {/* Homework text */}
              {assignment?.type === 'homework' && sub.answers?.text && (
                <div style={{ fontSize: 13, padding: '8px 10px', background: '#f9fafb', borderRadius: 8, border: '0.5px solid #e5e7eb', marginBottom: 8 }}>
                  {sub.answers.text}
                </div>
              )}
              {sub.answers?.file_name && (
                <div style={{ fontSize: 12, color: '#185FA5', marginBottom: 8 }}>📎 {sub.answers.file_name}</div>
              )}

              {/* Open-ended answers */}
              {openQs.map((q: any, i: number) => (
                <div key={i} style={{ marginBottom: 8, padding: '8px 10px', background: '#f9fafb', borderRadius: 8, border: '0.5px solid #e5e7eb' }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#888', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '.04em' }}>Open Q{i + 1}</div>
                  <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 4 }}>{q.q}</div>
                  <div style={{ fontSize: 13, color: '#333' }}>{sub.answers?.open?.[i] ?? '(no answer)'}</div>
                </div>
              ))}

              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                <input type="number" min={0} max={100} placeholder="Grade 0–100"
                  value={scores[sub.id] ?? ''}
                  onChange={e => setScores(p => ({ ...p, [sub.id]: e.target.value }))}
                  style={{ width: 110, padding: '6px 9px', border: '0.5px solid #e5e7eb', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', outline: 'none' }} />
                <input placeholder="Optional feedback"
                  value={feedback[sub.id] ?? ''}
                  onChange={e => setFeedback(p => ({ ...p, [sub.id]: e.target.value }))}
                  style={{ flex: 1, minWidth: 160, padding: '6px 9px', border: '0.5px solid #e5e7eb', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', outline: 'none' }} />
                <Btn variant="primary" onClick={() => returnGrade(sub)} style={{ opacity: saving[sub.id] ? .6 : 1 }}>
                  {saving[sub.id] ? 'Saving…' : 'Return grade'}
                </Btn>
              </div>
            </Card>
          )
        })
      )}
    </div>
  )
}
