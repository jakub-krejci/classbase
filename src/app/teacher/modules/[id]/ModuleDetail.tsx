'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Tag, Btn, BackLink, Pill } from '@/components/ui'

export default function ModuleDetail({ module, lessons, assignments, enrollments }: {
  module: any; lessons: any[]; assignments: any[]; enrollments: any[]
}) {
  const [tab, setTab] = useState<'lessons' | 'assignments' | 'students'>('lessons')
  const [lessonList, setLessonList] = useState(lessons)
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const supabase = createClient()
  const router = useRouter()

  const codeBox: React.CSSProperties = { fontFamily: 'monospace', fontSize: 13, fontWeight: 600, letterSpacing: '.08em', background: '#f3f4f6', padding: '6px 12px', borderRadius: 8, border: '0.5px solid #e5e7eb', display: 'inline-block' }
  const tabStyle = (t: string): React.CSSProperties => ({ padding: '8px 14px', fontSize: 13, cursor: 'pointer', color: tab === t ? '#111' : '#888', borderBottom: tab === t ? '2px solid #185FA5' : '2px solid transparent', borderTop: 'none', borderLeft: 'none', borderRight: 'none', fontWeight: tab === t ? 600 : 400, background: 'none' })

  async function deleteModule() {
    if (!confirm('Delete this module and all its content?')) return
    await supabase.from('modules').delete().eq('id', module.id)
    window.location.href = '/teacher/modules'
  }

  async function deleteLesson(id: string) {
    if (!confirm('Delete this lesson?')) return
    await supabase.from('lessons').delete().eq('id', id)
    setLessonList(prev => prev.filter(l => l.id !== id))
  }

  async function deleteAssignment(id: string) {
    if (!confirm('Delete this assignment?')) return
    await supabase.from('assignments').delete().eq('id', id)
    window.location.reload()
  }

  async function saveOrder(newList: any[]) {
    setLessonList(newList)
    await Promise.all(newList.map((l, i) =>
      supabase.from('lessons').update({ position: i } as any).eq('id', l.id)
    ))
  }

  function onDrop(targetIdx: number) {
    if (dragIdx === null || dragIdx === targetIdx) return
    const next = [...lessonList]
    const [moved] = next.splice(dragIdx, 1)
    next.splice(targetIdx, 0, moved)
    setDragIdx(null)
    saveOrder(next)
  }

  const aTypePill: any = { quiz: 'blue', test: 'blue', homework: 'amber' }
  const aTypeLabel: any = { quiz: 'Quiz', test: 'Test', homework: 'Homework' }

  return (
    <div>
      <BackLink href="/teacher/modules" label="All modules" />

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8, gap: 12 }}>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 3 }}>{module.title}</h1>
          <p style={{ fontSize: 13, color: '#888' }}>{module.description}</p>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontSize: 10, color: '#888', marginBottom: 3 }}>Access code</div>
          <div style={codeBox}>{module.access_code}</div>
        {module.enrollment_password && <div style={{ fontSize: 11, color: '#633806', background: '#FAEEDA', borderRadius: 6, padding: '3px 8px', marginTop: 4 }}>🔑 Password protected</div>}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <Tag tag={module.tag} />
        <Pill label={module.unlock_mode === 'sequential' ? '🔒 Sequential' : 'All visible'} color="gray" />
        <Btn href={"/teacher/modules/" + module.id + "/edit"}>Edit module</Btn>
        <Btn variant="danger" onClick={deleteModule}>Delete</Btn>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '0.5px solid #e5e7eb', marginBottom: 16 }}>
        {(['lessons', 'assignments', 'students'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={tabStyle(t)}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {/* Lessons tab */}
      {tab === 'lessons' && (
        <div>
          {lessonList.length === 0 && <p style={{ color: '#aaa', fontSize: 13, marginBottom: 12 }}>No lessons yet.</p>}
          {lessonList.map((l: any, i: number) => (
            <div key={l.id} draggable
              onDragStart={() => setDragIdx(i)}
              onDragOver={e => e.preventDefault()}
              onDrop={() => onDrop(i)}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', background: '#f9fafb', border: '0.5px solid #e5e7eb', borderRadius: 10, marginBottom: 6, cursor: 'grab' }}>
              <span style={{ color: '#bbb', fontSize: 14, cursor: 'grab' }}>⠿</span>
              <div style={{ width: 20, height: 20, borderRadius: '50%', background: '#E6F1FB', color: '#0C447C', fontSize: 10, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{i + 1}</div>
              <span style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>{l.title}</span>
              <Btn href={"/teacher/modules/" + module.id + "/lessons/" + l.id} style={{ padding: '3px 9px', fontSize: 11 }}>Edit</Btn>
              <Btn variant="danger" onClick={() => deleteLesson(l.id)} style={{ padding: '3px 9px', fontSize: 11 }}>Del</Btn>
            </div>
          ))}
          <Btn href={"/teacher/modules/" + module.id + "/lessons/new"} variant="primary" style={{ marginTop: 6 }}>+ Add lesson</Btn>
        </div>
      )}

      {/* Assignments tab */}
      {tab === 'assignments' && (
        <div>
          {assignments.length === 0 && <p style={{ color: '#aaa', fontSize: 13, marginBottom: 12 }}>No assignments yet.</p>}
          {assignments.map((a: any) => (
            <div key={a.id} style={{ background: '#fff', border: '0.5px solid #e5e7eb', borderRadius: 10, padding: '12px 14px', marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 6 }}>
                <div>
                  <div style={{ fontWeight: 500, fontSize: 14 }}>{a.title}</div>
                  <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>
                    {aTypeLabel[a.type] ?? a.type}
                    {a.deadline ? ' · Due ' + new Date(a.deadline).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : ''}
                    {a.questions?.length ? ' · ' + a.questions.length + ' questions' : ''}
                  </div>
                </div>
                <Pill label={aTypeLabel[a.type] ?? a.type} color={aTypePill[a.type] ?? 'blue'} />
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <Btn href={"/teacher/modules/" + module.id + "/assignments/" + a.id + "/edit"} style={{ padding: '3px 9px', fontSize: 11 }}>Edit</Btn>
                <Btn variant="danger" onClick={() => deleteAssignment(a.id)} style={{ padding: '3px 9px', fontSize: 11 }}>Delete</Btn>
              </div>
            </div>
          ))}
          <Btn href={"/teacher/modules/" + module.id + "/assignments/new"} variant="primary" style={{ marginTop: 6 }}>+ New assignment</Btn>
        </div>
      )}

      {/* Students tab */}
      {tab === 'students' && (
        <div>
          {enrollments.length === 0 && <p style={{ color: '#aaa', fontSize: 13 }}>No students enrolled yet.</p>}
          {enrollments.map((e: any, i: number) => {
            const p = e.profiles as any
            const initials = (p?.full_name ?? p?.email ?? '?').split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2)
            return (
              <div key={e.student_id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '0.5px solid #f3f4f6' }}>
                <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#E6F1FB', color: '#0C447C', fontSize: 10, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{initials}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{p?.full_name ?? 'Unknown'}</div>
                  <div style={{ fontSize: 11, color: '#888' }}>{p?.email}</div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
