'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from 'react'
import { useIsMobile } from '@/lib/useIsMobile'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Tag, Btn, BackLink, Breadcrumb, Pill } from '@/components/ui'

export default function ModuleDetail({ module, lessons, assignments, enrollments, allProgress }: {
  module: any; lessons: any[]; assignments: any[]; enrollments: any[]; allProgress?: any[]
}) {
  const isMobile = useIsMobile()
  const [tab, setTab] = useState<'lessons' | 'assignments' | 'students'>('lessons')
  const [lessonList, setLessonList] = useState(lessons)
  const [enrollmentList, setEnrollmentList] = useState(enrollments)
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

  async function removeStudent(studentId: string) {
    if (!confirm('Remove this student from the module? Their progress will be deleted.')) return
    await supabase.from('enrollments').delete().eq('student_id', studentId).eq('module_id', module.id)
    await supabase.from('lesson_progress').delete().eq('student_id', studentId).in('lesson_id', lessons.map(l => l.id))
    setEnrollmentList(prev => prev.filter(e => e.student_id !== studentId))
  }

  async function toggleBan(studentId: string, currentlyBanned: boolean) {
    await supabase.from('enrollments').update({ banned: !currentlyBanned } as any)
      .eq('student_id', studentId).eq('module_id', module.id)
    setEnrollmentList(prev => prev.map(e => e.student_id === studentId ? { ...e, banned: !currentlyBanned } : e))
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
    // Insert copy after the original — use max position + 1 (DB requires integer)
    const maxPos = Math.max(...lessonList.map(l => l.position ?? 0))
    const pos = maxPos + 1
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
      <Breadcrumb items={[{ label: 'Modules', href: '/teacher/modules' }, { label: module.title }]} />

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
              <Btn onClick={() => duplicateLesson(l.id)} style={{ padding: '3px 9px', fontSize: 11 }}>⎘ Copy</Btn>
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
          <Btn href={"/teacher/modules/" + module.id + "/lessons/new"} variant="primary" style={{ marginTop: 6, marginRight: 8 }}>+ Add lesson</Btn><Btn href={"/teacher/modules/" + module.id + "/lessons/new-video"} variant="default" style={{ marginTop: 6 }}>🎬 Video lekce</Btn>
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
          {enrollmentList.length === 0 && (
            <div style={{ textAlign:'center', padding:'40px 20px', color:'#aaa', fontSize:13, border:'1px dashed #e5e7eb', borderRadius:12 }}>
              No students enrolled yet. Share the access code <strong style={{ color:'#333' }}>{module.access_code}</strong> to invite students.
            </div>
          )}

          {enrollmentList.length > 0 && (
            <div>
              {/* Summary bar */}
              <div style={{ display:'flex', gap:16, marginBottom:16, flexWrap:'wrap' }}>
                <span style={{ fontSize:13, color:'#555' }}>
                  <strong>{enrollmentList.filter((e:any)=>!e.banned).length}</strong> active
                </span>
                {enrollmentList.filter((e:any)=>e.banned).length > 0 && (
                  <span style={{ fontSize:13, color:'#856404' }}>
                    <strong>{enrollmentList.filter((e:any)=>e.banned).length}</strong> banned
                  </span>
                )}
                <span style={{ fontSize:13, color:'#888' }}>
                  <strong>{enrollmentList.filter((e:any)=>(allProgress??[]).some((p:any)=>p.student_id===e.student_id&&p.status==='completed')).length}</strong> with completed lessons
                </span>
              </div>

              {/* Student cards */}
              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                {enrollmentList.map((e: any) => {
                  const p = e.profiles as any
                  const initials = (p?.full_name ?? p?.email ?? '?').split(' ').map((w:string)=>w[0]).join('').toUpperCase().slice(0,2)
                  const studentProgress = (allProgress??[]).filter((r:any)=>r.student_id===e.student_id)
                  const completedCount = studentProgress.filter((r:any)=>r.status==='completed').length
                  const topLevelLessons = lessons.filter((l:any)=>!l.parent_lesson_id)
                  const overallPct = topLevelLessons.length > 0 ? Math.round(completedCount/topLevelLessons.length*100) : 0
                  const lastSeen = p?.last_seen_at ? new Date(p.last_seen_at) : null
                  const msSince = lastSeen ? Date.now() - lastSeen.getTime() : Infinity
                  const isOnline = msSince < 3 * 60 * 1000          // online = seen in last 3 min
                  const isRecent = msSince < 10 * 60 * 1000          // recent = last 10 min
                  const lastSeenStr = !lastSeen ? 'Never'
                    : isOnline ? 'Online now'
                    : isRecent ? 'Just now'
                    : msSince < 3600000 ? Math.floor(msSince/60000) + 'm ago'
                    : msSince < 86400000 ? Math.floor(msSince/3600000) + 'h ago'
                    : msSince < 7*86400000 ? Math.floor(msSince/86400000) + 'd ago'
                    : lastSeen.toLocaleDateString()

                  return (
                    <div key={e.student_id}
                      style={{ background: e.banned ? '#fffbf0' : '#fff', border: e.banned ? '0.5px solid #FFE69C' : '0.5px solid #e5e7eb', borderRadius:10, padding:'12px 14px', opacity: e.banned ? 0.85 : 1 }}>
                      <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                        {/* Avatar */}
                        <div style={{ position:'relative', flexShrink:0 }}>
                          {p?.avatar_url && !e.banned
                            ? <a href={`/teacher/students/${e.student_id}`} style={{ display:'block' }}>
                                <img src={p.avatar_url} alt={p.full_name} style={{ width:38, height:38, borderRadius:'50%', objectFit:'cover', border:'2px solid #e5e7eb', display:'block' }} />
                              </a>
                            : <a href={`/teacher/students/${e.student_id}`} style={{ display:'block', textDecoration:'none' }}>
                                <div style={{ width:38, height:38, borderRadius:'50%', background: e.banned ? '#f3f4f6' : (p?.accent_color ?? '#E6F1FB'), color: e.banned ? '#bbb' : '#fff', fontSize:13, fontWeight:700, display:'flex', alignItems:'center', justifyContent:'center' }}>
                                  {e.banned ? '🚫' : initials}
                                </div>
                              </a>
                          }
                          {/* Online/offline dot */}
                          <div style={{
                            position:'absolute', bottom:0, right:0,
                            width:11, height:11, borderRadius:'50%',
                            background: e.banned ? '#ccc' : isOnline ? '#22c55e' : isRecent ? '#f59e0b' : '#d1d5db',
                            border:'2px solid #fff',
                          }} title={e.banned ? 'Banned' : isOnline ? 'Online now' : isRecent ? 'Active recently' : 'Offline'} />
                        </div>

                        {/* Name + meta */}
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
                            {p?.profile_visibility && !e.banned
                              ? <a href={`/teacher/students/${e.student_id}`}
                                  style={{ fontSize:14, fontWeight:600, color:'#185FA5', textDecoration:'none' }}>
                                  {p?.full_name ?? 'Unknown'}
                                </a>
                              : <a href={`/teacher/students/${e.student_id}`}
                                  style={{ fontSize:14, fontWeight:600, color: e.banned ? '#888' : '#111', textDecoration:'none' }}>
                                  {p?.full_name ?? 'Unknown'}
                                </a>
                            }
                            {p?.student_class && <span style={{ fontSize:10, color:'#888', background:'#f3f4f6', padding:'1px 6px', borderRadius:10 }}>🏫 {p.student_class}</span>}
                            {p?.custom_status && !e.banned && <span style={{ fontSize:10, color:'#666', maxWidth:120, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{p.custom_status}</span>}
                            {!p?.profile_visibility && !e.banned && <span style={{ fontSize:9, color:'#ccc' }}>🔒</span>}
                            {e.banned && (
                              <span style={{ fontSize:10, fontWeight:600, color:'#856404', background:'#FFF3CD', padding:'2px 7px', borderRadius:8 }}>
                                BANNED
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize:11, color:'#888', marginTop:2 }}>{p?.email}</div>
                          <div style={{ display:'flex', alignItems:'center', gap:12, marginTop:6, flexWrap:'wrap' }}>
                            {/* Progress bar */}
                            <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                              <div style={{ width:80, height:5, background:'#f0f0f0', borderRadius:3, overflow:'hidden' }}>
                                <div style={{ height:'100%', width:overallPct+'%', background: overallPct===100?'#27500A':'#185FA5', borderRadius:3 }} />
                              </div>
                              <span style={{ fontSize:11, color:'#555' }}>{overallPct}%</span>
                            </div>
                            <span style={{ fontSize:11, color:'#aaa' }}>
                              {completedCount}/{topLevelLessons.length} lessons
                            </span>
                            <span style={{ fontSize:11, color:'#aaa' }}>
                              <span style={{ color: isOnline ? '#16a34a' : isRecent ? '#d97706' : '#aaa', fontWeight: isOnline ? 600 : 400 }}>
                              {isOnline ? '● Online' : isRecent ? '◐ ' + lastSeenStr : lastSeenStr}
                            </span>
                            </span>
                          </div>
                          {/* Per-lesson dots */}
                          {topLevelLessons.length > 0 && (
                            <div style={{ display:'flex', gap:3, marginTop:7, flexWrap:'wrap' }}>
                              {topLevelLessons.map((l:any, i:number) => {
                                const prog = studentProgress.find((r:any)=>r.lesson_id===l.id)
                                const status = prog?.status
                                const scroll = prog?.scroll_pct ?? 0
                                const bg = status==='completed' ? '#27500A' : status==='bookmark' ? '#f59e0b' : scroll>0 ? '#185FA5' : '#e5e7eb'
                                const title = l.title + ': ' + (status==='completed'?'Completed':status==='bookmark'?'Bookmarked':scroll>0?scroll+'% read':'Not started')
                                return (
                                  <div key={l.id} title={title}
                                    style={{ width:10, height:10, borderRadius:'50%', background:bg, flexShrink:0 }} />
                                )
                              })}
                            </div>
                          )}
                        </div>

                        {/* Action buttons */}
                        <div style={{ display:'flex', flexDirection:'column', gap:5, flexShrink:0 }}>
                          <button onClick={() => toggleBan(e.student_id, e.banned)}
                            style={{ padding:'5px 12px', fontSize:12, fontWeight:500, borderRadius:7, border:'1px solid', cursor:'pointer', fontFamily:'inherit', whiteSpace:'nowrap',
                              background: e.banned ? '#EAF3DE' : '#FFF3CD',
                              color: e.banned ? '#27500A' : '#856404',
                              borderColor: e.banned ? '#a7d68a' : '#FFE69C' }}>
                            {e.banned ? '✓ Unban' : '⊘ Ban'}
                          </button>
                          <button onClick={() => removeStudent(e.student_id)}
                            style={{ padding:'5px 12px', fontSize:12, fontWeight:500, borderRadius:7, border:'1px solid #F09595', background:'#FCEBEB', color:'#791F1F', cursor:'pointer', fontFamily:'inherit', whiteSpace:'nowrap' }}>
                            ✕ Remove
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Legend */}
              <div style={{ display:'flex', gap:14, marginTop:14, fontSize:11, color:'#888', flexWrap:'wrap' }}>
                <span><span style={{ display:'inline-block', width:10, height:10, borderRadius:'50%', background:'#27500A', verticalAlign:'middle', marginRight:4 }} />Completed</span>
                <span><span style={{ display:'inline-block', width:10, height:10, borderRadius:'50%', background:'#f59e0b', verticalAlign:'middle', marginRight:4 }} />Bookmarked</span>
                <span><span style={{ display:'inline-block', width:10, height:10, borderRadius:'50%', background:'#185FA5', verticalAlign:'middle', marginRight:4 }} />In progress</span>
                <span><span style={{ display:'inline-block', width:10, height:10, borderRadius:'50%', background:'#e5e7eb', verticalAlign:'middle', marginRight:4 }} />Not started</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
