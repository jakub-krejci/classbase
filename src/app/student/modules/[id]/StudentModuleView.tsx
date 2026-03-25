'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from 'react'
import { Tag, BackLink, Pill } from '@/components/ui'

export default function StudentModuleView({ module, lessons, assignments, completedIds, submissions, studentId }: {
  module: any; lessons: any[]; assignments: any[]; completedIds: string[]; submissions: any[]; studentId: string
}) {
  const [tab, setTab] = useState<'lessons' | 'assignments'>('lessons')
  const done = new Set(completedIds)
  const pct = lessons.length > 0 ? Math.round(done.size / lessons.length * 100) : 0

  const tabStyle = (t: string): React.CSSProperties => ({
    padding: '8px 14px', fontSize: 13, cursor: 'pointer', background: 'none', border: 'none', fontFamily: 'inherit',
    color: tab === t ? '#111' : '#888', borderBottom: tab === t ? '2px solid #185FA5' : '2px solid transparent', fontWeight: tab === t ? 600 : 400
  })

  function isUnlocked(i: number): boolean {
    if (module.unlock_mode !== 'sequential') return true
    if (i === 0) return true
    return done.has(lessons[i - 1]?.id)
  }

  const subMap: Record<string, any> = {}
  submissions.forEach((s: any) => { subMap[s.assignment_id] = s })

  const aTypePill: any = { quiz: 'blue', test: 'blue', homework: 'amber' }
  const aTypeLabel: any = { quiz: 'Quiz', test: 'Test', homework: 'Homework' }

  return (
    <div>
      <BackLink href="/student/modules" label="My modules" />
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 6 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 3 }}>{module.title}</h1>
          <p style={{ fontSize: 13, color: '#888' }}>{module.description}</p>
        </div>
        <Tag tag={module.tag} />
      </div>

      {/* Progress bar */}
      <div style={{ background: '#f3f4f6', borderRadius: 10, padding: '11px 14px', display: 'inline-flex', alignItems: 'center', gap: 14, marginBottom: 18, minWidth: 200 }}>
        <div>
          <div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>Your progress</div>
          <div style={{ fontSize: 20, fontWeight: 600 }}>{pct}%</div>
        </div>
        <div style={{ flex: 1, minWidth: 80, height: 6, background: '#e5e7eb', borderRadius: 3, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: pct + '%', background: '#185FA5', borderRadius: 3, transition: 'width .3s' }} />
        </div>
        <div style={{ fontSize: 12, color: '#888' }}>{done.size}/{lessons.length}</div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '0.5px solid #e5e7eb', marginBottom: 16 }}>
        <button style={tabStyle('lessons')} onClick={() => setTab('lessons')}>Lessons</button>
        <button style={tabStyle('assignments')} onClick={() => setTab('assignments')}>Assignments</button>
      </div>

      {/* Lessons */}
      {tab === 'lessons' && (
        <div>
          {lessons.length === 0 && <p style={{ color: '#aaa', fontSize: 13 }}>No lessons yet.</p>}
          {lessons.map((l: any, i: number) => {
            const completed = done.has(l.id)
            const unlocked = isUnlocked(i)
            return (
              <div key={l.id}>
                {unlocked ? (
                  <a href={'/student/modules/' + module.id + '/lessons/' + l.id}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: '#fff', border: '0.5px solid #e5e7eb', borderRadius: 10, marginBottom: 6, textDecoration: 'none', color: 'inherit' }}>
                    <div style={{ width: 22, height: 22, borderRadius: '50%', background: completed ? '#EAF3DE' : '#E6F1FB', color: completed ? '#27500A' : '#0C447C', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      {completed ? '✓' : (i + 1)}
                    </div>
                    <span style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>{l.title}</span>
                    <Pill label={completed ? 'Done' : 'Read'} color={completed ? 'green' : 'blue'} />
                  </a>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: '#f9fafb', border: '0.5px solid #e5e7eb', borderRadius: 10, marginBottom: 6, opacity: 0.6 }}>
                    <div style={{ width: 22, height: 22, borderRadius: '50%', background: '#f3f4f6', color: '#aaa', fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>🔒</div>
                    <span style={{ flex: 1, fontSize: 13, fontWeight: 500, color: '#888' }}>{l.title}</span>
                    <Pill label="Locked" color="gray" />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Assignments */}
      {tab === 'assignments' && (
        <div>
          {assignments.length === 0 && <p style={{ color: '#aaa', fontSize: 13 }}>No assignments yet.</p>}
          {assignments.map((a: any) => {
            const sub = subMap[a.id]
            const isGraded = sub?.status === 'graded'
            const isSubmitted = !!sub
            const dueStr = a.deadline ? ' · Due ' + new Date(a.deadline).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : ''
            return (
              <div key={a.id} style={{ background: '#fff', border: '0.5px solid #e5e7eb', borderRadius: 10, padding: '12px 14px', marginBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 }}>
                  <div>
                    <div style={{ fontWeight: 500, fontSize: 14 }}>{a.title}</div>
                    <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>{aTypeLabel[a.type] ?? a.type}{dueStr}</div>
                  </div>
                  <Pill
                    label={isGraded ? 'Graded: ' + sub.teacher_score + '%' : isSubmitted ? 'Submitted' : aTypeLabel[a.type] ?? a.type}
                    color={isGraded ? 'green' : isSubmitted ? 'gray' : aTypePill[a.type] ?? 'blue'}
                  />
                </div>
                {isGraded && sub.teacher_feedback && (
                  <div style={{ fontSize: 12, padding: '6px 10px', background: '#EAF3DE', color: '#27500A', borderRadius: 8, marginBottom: 8 }}>
                    Feedback: {sub.teacher_feedback}
                  </div>
                )}
                {!isSubmitted && (
                  <a href={'/student/modules/' + module.id + '/assignments/' + a.id}
                    style={{ display: 'inline-flex', padding: '5px 12px', background: '#185FA5', color: '#E6F1FB', borderRadius: 8, fontSize: 12, fontWeight: 500, textDecoration: 'none' }}>
                    Start
                  </a>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
