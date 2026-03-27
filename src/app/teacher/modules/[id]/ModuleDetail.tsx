'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from 'react'
import { useIsMobile } from '@/lib/useIsMobile'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Tag, Btn, BackLink, Pill } from '@/components/ui'

export default function ModuleDetail({ module, lessons, assignments, enrollments, allProgress }: {
  module: any; lessons: any[]; assignments: any[]; enrollments: any[]; allProgress?: any[]
}) {
  const isMobile = useIsMobile()
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

  async function toggleLock(id: string, currentlyLocked: boolean) {
    await supabase.from('lessons').update({ locked: !currentlyLocked } as any).eq('id', id)
    setLessonList(prev => prev.map(l => l.id === id ? { ...l, locked: !currentlyLocked } : l))
  }

  async function addSubLesson(parentId: string, parentTitle: string) {
    const siblings = lessonList.filter(l => l.parent_lesson_id === parentId)
    const subPos = siblings.length
    const defaultTitle = subPos === 0 ? 'Theoretical part' : subPos === 1 ? 'Practical part' : 'Part ' + (subPos + 1)
    const title = prompt('Sub-lesson title:', defaultTitle)
    if (!title) return
    const { data, error } = await supabase.from('lessons').insert({
      module_id: module.id, title, content_html: '', position: 0,
      parent_lesson_id: parentId, sub_position: subPos
    } as any).select('*').single()
    if (error) { alert('Error: ' + error.message); return }
    setLessonList(prev => [...prev, data as any])
  }

  async function removeSubLesson(id: string) {
    if (!confirm('Remove this sub-lesson?')) return
    await supabase.from('lessons').delete().eq('id', id)
    setLessonList(prev => prev.filter(l => l.id !== id))
  }

  async function duplicateLesson(id: string) {
    const src = lessonList.find(l => l.id === id)
    if (!src) return
    // Insert copy after the original
    const pos = (src.position ?? 0) + 0.5   // will be re-ordered by DB position
    const { data, error } = await supabase.from('lessons').insert({
      module_id: module.id,
      title: src.title + ' (copy)',
      content_html: src.content_html ?? '',
      position: pos,
      locked: false,
      parent_lesson_id: src.parent_lesson_id ?? null,
      sub_position: src.sub_position ?? 0,
    } as any).select('*').single()
    if (error) { alert('Error: ' + error.message); return }
    // Also duplicate its sub-lessons
    const subs = lessonList.filter(l => l.parent_lesson_id === id)
    const newSubs: any[] = []
    for (const sub of subs) {
      const { data: subData } = await supabase.from('lessons').insert({
        module_id: module.id,
        title: sub.title,
        content_html: sub.content_html ?? '',
        position: 0,
        locked: false,
        parent_lesson_id: (data as any).id,
        sub_position: sub.sub_position ?? 0,
      } as any).select('*').single()
      if (subData) newSubs.push(subData)
    }
    // Insert new lesson after the original in local state
    setLessonList(prev => {
      const idx = prev.findIndex(l => l.id === id)
      const next = [...prev]
      next.splice(idx + 1, 0, data as any, ...newSubs)
      return next
    })
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
      <div style={{ display: 'flex', borderBottom: '0.5px solid #e5e7eb', marginBottom: 16, overflowX: isMobile ? 'auto' : 'visible' }}>
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
          {lessonList.filter((l: any) => !l.parent_lesson_id).map((l: any, i: number) => {
            const subLessons = lessonList.filter((s: any) => s.parent_lesson_id === l.id)
            return (
            <div key={l.id}>
            <div draggable
              onDragStart={() => setDragIdx(i)}
              onDragOver={e => e.preventDefault()}
              onDrop={() => onDrop(i)}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', background: '#f9fafb', border: '0.5px solid #e5e7eb', borderRadius: 10, marginBottom: 6, cursor: 'grab' }}>
              <span style={{ color: '#bbb', fontSize: 14, cursor: 'grab' }}>⠿</span>
              <div style={{ width: 20, height: 20, borderRadius: '50%', background: '#E6F1FB', color: '#0C447C', fontSize: 10, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{i + 1}</div>
              <span style={{ flex: 1, fontSize: 13, fontWeight: 500, color: l.locked ? '#aaa' : 'inherit', display: 'flex', alignItems: 'center', gap: 6 }}>
                {l.locked && <span title="Locked — hidden from students" style={{ fontSize: 12 }}>🔒</span>}
                {l.title}
              </span>
              <button
                onClick={() => toggleLock(l.id, l.locked)}
                title={l.locked ? 'Unlock lesson' : 'Lock lesson (hide from students)'}
                style={{ padding: '3px 8px', fontSize: 11, background: l.locked ? '#FFF3CD' : '#f3f4f6', color: l.locked ? '#856404' : '#555', border: '1px solid', borderColor: l.locked ? '#FFCA2C' : '#e5e7eb', borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
                {l.locked ? '🔒 Locked' : '🔓 Lock'}
              </button>
              <Btn href={"/teacher/modules/" + module.id + "/lessons/" + l.id + "/preview"} style={{ padding: '3px 9px', fontSize: 11 }}>View</Btn>
              <Btn href={"/teacher/modules/" + module.id + "/lessons/" + l.id} style={{ padding: '3px 9px', fontSize: 11 }}>Edit</Btn>
              <Btn onClick={() => duplicateLesson(l.id)} style={{ padding: '3px 9px', fontSize: 11 }} title="Duplicate this lesson and its sub-lessons">⎘ Copy</Btn>
              <Btn variant="danger" onClick={() => deleteLesson(l.id)} style={{ padding: '3px 9px', fontSize: 11 }}>Del</Btn>
            </div>
              {/* Sub-lessons */}
              {subLessons.map((s: any) => (
                <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px 7px 36px', background: '#fff', border: '0.5px solid #e5e7eb', borderRadius: 8, marginBottom: 4, marginLeft: 24, borderLeft: '2px solid #185FA5' }}>
                  <span style={{ fontSize: 11, color: '#888', marginRight: 2 }}>↳</span>
                  <span style={{ flex: 1, fontSize: 12, color: '#333' }}>{s.title}</span>
                  <Btn href={"/teacher/modules/" + module.id + "/lessons/" + s.id + "/preview"} style={{ padding: '2px 7px', fontSize: 10 }}>View</Btn>
                  <Btn href={"/teacher/modules/" + module.id + "/lessons/" + s.id} style={{ padding: '2px 7px', fontSize: 10 }}>Edit</Btn>
                  <Btn variant="danger" onClick={() => removeSubLesson(s.id)} style={{ padding: '2px 7px', fontSize: 10 }}>Del</Btn>
                </div>
              ))}
              <button onClick={() => addSubLesson(l.id, l.title)}
                style={{ marginLeft: 24, marginBottom: 8, fontSize: 11, color: '#185FA5', background: 'none', border: '1px dashed #B5D4F4', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontFamily: 'inherit' }}>
                + Add sub-lesson
              </button>
            </div>
          )})}
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
          {enrollments.length > 0 && (
            <div className='cb-progress-grid' style={{ overflowX: 'auto' }}>
              {/* Header row */}
              <div style={{ display: 'grid', gridTemplateColumns: '200px repeat(' + lessons.length + ', 1fr)', gap: 0, marginBottom: 4, minWidth: 400 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '.05em', padding: '4px 8px' }}>Student</div>
                {lessons.map((l: any, i: number) => (
                  <div key={l.id} title={l.title} style={{ fontSize: 9, color: '#888', padding: '4px 4px', textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', borderLeft: '1px solid #f3f4f6' }}>
                    {i + 1}. {l.title.slice(0, 12)}{l.title.length > 12 ? '…' : ''}
                  </div>
                ))}
              </div>
              {/* Student rows */}
              {enrollments.map((e: any) => {
                const p = e.profiles as any
                const initials = (p?.full_name ?? p?.email ?? '?').split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2)
                // Build progress map for this student
                const studentProgress = (allProgress ?? []).filter((r: any) => r.student_id === e.student_id)
                const progressMap: Record<string, any> = {}
                studentProgress.forEach((r: any) => { progressMap[r.lesson_id] = r })
                const completedCount = studentProgress.filter((r: any) => r.status === 'completed').length
                const overallPct = lessons.length > 0 ? Math.round(completedCount / lessons.length * 100) : 0
                return (
                  <div key={e.student_id} style={{ display: 'grid', gridTemplateColumns: '200px repeat(' + lessons.length + ', 1fr)', gap: 0, borderTop: '0.5px solid #f3f4f6', alignItems: 'center', minWidth: 400 }}>
                    {/* Student name cell */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 8px' }}>
                      <div style={{ width: 26, height: 26, borderRadius: '50%', background: '#E6F1FB', color: '#0C447C', fontSize: 10, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{initials}</div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p?.full_name ?? 'Unknown'}</div>
                        <div style={{ fontSize: 10, color: '#888' }}>{overallPct}% done</div>
                      </div>
                    </div>
                    {/* Per-lesson progress cells */}
                    {lessons.map((l: any) => {
                      const prog = progressMap[l.id]
                      const status = prog?.status
                      const scroll = prog?.scroll_pct ?? 0
                      const bg = status === 'completed' ? '#EAF3DE' : status === 'bookmark' ? '#FFF3CD' : scroll > 0 ? '#E6F1FB' : '#f9fafb'
                      const icon = status === 'completed' ? '✓' : status === 'bookmark' ? '🔖' : scroll > 0 ? scroll + '%' : '—'
                      const color = status === 'completed' ? '#27500A' : status === 'bookmark' ? '#856404' : scroll > 0 ? '#0C447C' : '#ccc'
                      return (
                        <div key={l.id} title={status === 'completed' ? 'Completed' : status === 'bookmark' ? 'Bookmarked' : scroll > 0 ? scroll + '% read' : 'Not started'}
                          style={{ background: bg, borderLeft: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', height: 36, fontSize: 10, fontWeight: 600, color }}>
                          {icon}
                        </div>
                      )
                    })}
                  </div>
                )
              })}
              {/* Legend */}
              <div style={{ display: 'flex', gap: 16, marginTop: 12, fontSize: 11, color: '#888', flexWrap: 'wrap' }}>
                <span><span style={{ display: 'inline-block', width: 12, height: 12, background: '#EAF3DE', borderRadius: 2, verticalAlign: 'middle', marginRight: 4 }} />Completed</span>
                <span><span style={{ display: 'inline-block', width: 12, height: 12, background: '#FFF3CD', borderRadius: 2, verticalAlign: 'middle', marginRight: 4 }} />Bookmarked</span>
                <span><span style={{ display: 'inline-block', width: 12, height: 12, background: '#E6F1FB', borderRadius: 2, verticalAlign: 'middle', marginRight: 4 }} />In progress (% read)</span>
                <span><span style={{ display: 'inline-block', width: 12, height: 12, background: '#f9fafb', borderRadius: 2, verticalAlign: 'middle', marginRight: 4 }} />Not started</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
