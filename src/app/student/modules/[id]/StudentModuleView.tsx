'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from 'react'
import { Tag, BackLink, Pill } from '@/components/ui'
import { useIsMobile } from '@/lib/useIsMobile'

export default function StudentModuleView({ module, lessons, assignments, completedIds, bookmarkedIds, submissions, studentId }: {
  module: any; lessons: any[]; assignments: any[]; completedIds: string[]; bookmarkedIds: string[]; submissions: any[]; studentId: string
}) {
  const isMobile = useIsMobile()
  const [tab, setTab] = useState<'lessons' | 'assignments'>('lessons')
  const [search, setSearch] = useState('')
  const done = new Set(completedIds)
  const bookmarked = new Set(bookmarkedIds)
  // Show all top-level lessons (sub-lessons appear as tabs inside their parent)
  // Locked lessons appear in the list but are non-clickable
  const visibleLessons = lessons.filter((l: any) => !l.parent_lesson_id)
  const pct = visibleLessons.length > 0 ? Math.round(done.size / visibleLessons.length * 100) : 0
  const filteredLessons = search.trim()
    ? visibleLessons.filter((l: any) => l.title.toLowerCase().includes(search.toLowerCase()))
    : visibleLessons

  const tabStyle = (t: string): React.CSSProperties => ({
    padding: '8px 14px', fontSize: 13, cursor: 'pointer', background: 'none', border: 'none', fontFamily: 'inherit',
    color: tab === t ? '#111' : '#888', borderBottom: tab === t ? '2px solid #185FA5' : '2px solid transparent', fontWeight: tab === t ? 600 : 400
  })

  function isUnlocked(i: number): boolean {
    if (module.unlock_mode !== 'sequential') return true
    if (i === 0) return true
    return done.has(visibleLessons[i - 1]?.id)
  }

  const subMap: Record<string, any> = {}
  submissions.forEach((s: any) => { subMap[s.assignment_id] = s })

  const aTypePill: any = { quiz: 'blue', test: 'blue', homework: 'amber' }
  const aTypeLabel: any = { quiz: 'Quiz', test: 'Test', homework: 'Homework' }

  return (
    <div>
      <BackLink href="/student/modules" label="My modules" />
      <div style={{ display: 'flex', alignItems: isMobile ? 'flex-start' : 'flex-start', flexDirection: isMobile ? 'column' : 'row', justifyContent: 'space-between', gap: isMobile ? 6 : 0, marginBottom: 6 }}>
        <div>
          <h1 style={{ fontSize: isMobile ? 18 : 20, fontWeight: 600, marginBottom: 3 }}>{module.title}</h1>
          <p style={{ fontSize: 13, color: '#888' }}>{module.description}</p>
        </div>
        <Tag tag={module.tag} />
      </div>

      {/* Progress bar */}
      <div style={{ background: '#f3f4f6', borderRadius: 10, padding: '11px 14px', display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18, width: isMobile ? '100%' : 'auto', boxSizing: 'border-box', minWidth: isMobile ? 0 : 200 }}>
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
          {lessons.length > 4 && (
            <div style={{ marginBottom: 12, position: 'relative' }}>
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search lessons…"
                style={{ width: '100%', padding: '8px 12px 8px 32px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }}
              />
              <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#aaa', fontSize: 14, pointerEvents: 'none' }}>🔍</span>
              {search && <button onClick={() => setSearch('')} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#aaa', fontSize: 14 }}>✕</button>}
            </div>
          )}
          {filteredLessons.length === 0 && search && <p style={{ color: '#aaa', fontSize: 13 }}>No lessons match "{search}"</p>}
          {lessons.length === 0 && <p style={{ color: '#aaa', fontSize: 13 }}>No lessons yet.</p>}
          {filteredLessons.map((l: any, i: number) => {
            const realIndex = visibleLessons.findIndex((x: any) => x.id === l.id)
            const completed = done.has(l.id)
            const unlocked = isUnlocked(realIndex)
            return (
              <div key={l.id}>
                {l.locked ? (
                  // Locked: visible in list but not clickable
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: '#fafafa', border: '0.5px solid #e5e7eb', borderRadius: 10, marginBottom: 6, cursor: 'not-allowed' }}>
                    <div style={{ width: 22, height: 22, borderRadius: '50%', background: '#f3f4f6', color: '#bbb', fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>🔒</div>
                    <span style={{ flex: 1, fontSize: 13, fontWeight: 500, color: '#aaa' }}>{l.title}</span>
                    <span style={{ fontSize: 11, color: '#bbb', background: '#f3f4f6', padding: '2px 8px', borderRadius: 10, whiteSpace: 'nowrap' }}>Not available</span>
                  </div>
                ) : !unlocked ? (
                  // Sequentially locked
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: '#f9fafb', border: '0.5px solid #e5e7eb', borderRadius: 10, marginBottom: 6, opacity: 0.6 }}>
                    <div style={{ width: 22, height: 22, borderRadius: '50%', background: '#f3f4f6', color: '#aaa', fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>🔒</div>
                    <span style={{ flex: 1, fontSize: 13, fontWeight: 500, color: '#888' }}>{l.title}</span>
                    <Pill label="Locked" color="gray" />
                  </div>
                ) : (
                  <a href={'/student/modules/' + module.id + '/lessons/' + l.id}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: '#fff', border: '0.5px solid #e5e7eb', borderRadius: 10, marginBottom: 6, textDecoration: 'none', color: 'inherit' }}>
                    <div style={{ width: 22, height: 22, borderRadius: '50%', background: completed ? '#EAF3DE' : bookmarked.has(l.id) ? '#FFF3CD' : '#E6F1FB', color: completed ? '#27500A' : bookmarked.has(l.id) ? '#856404' : '#0C447C', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      {completed ? '✓' : bookmarked.has(l.id) ? '🔖' : (realIndex + 1)}
                    </div>
                    <span style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>{l.title}</span>
                    {completed && <Pill label="Done" color="green" />}
                    {!completed && bookmarked.has(l.id) && <Pill label="Not completed" color="amber" />}
                    {!completed && !bookmarked.has(l.id) && <Pill label="Read" color="blue" />}
                  </a>
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
