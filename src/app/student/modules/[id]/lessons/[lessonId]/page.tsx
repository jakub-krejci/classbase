/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerClient, createAdminClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import LessonViewer from './LessonViewer'
import VideoLessonViewer from './VideoLessonViewer'

export default async function StudentLessonPage({ params }: { params: any }) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const admin = createAdminClient()
  const { data: pd } = await admin.from('profiles').select('*').eq('id', (user as any).id).single()
  const profile = pd as any
  if (profile?.role !== 'student') redirect('/teacher/modules')

  const { data: lesson } = await admin.from('lessons').select('*').eq('id', params.lessonId).single()
  if (!lesson) redirect('/student/modules/' + params.id)
  if ((lesson as any).locked) redirect('/student/modules/' + params.id)

  const { data: modData } = await admin.from('modules').select('title').eq('id', params.id).single()
  const moduleTitle = (modData as any)?.title ?? 'Modul'

  const { data: allLessons } = await admin.from('lessons')
    .select('id,title,position,locked,parent_lesson_id,lesson_type')
    .eq('module_id', params.id)
    .is('parent_lesson_id', null)
    .order('position')

  const lessonIds = (allLessons ?? []).map((l: any) => l.id)
  const { data: progressRows } = lessonIds.length
    ? await admin.from('lesson_progress').select('lesson_id,status').eq('student_id', (user as any).id).in('lesson_id', lessonIds)
    : { data: [] }
  const completedIds = new Set((progressRows ?? []).filter((r: any) => r.status === 'completed').map((r: any) => r.lesson_id))

  const { data: prog } = await admin.from('lesson_progress')
    .select('id,status,notes').eq('student_id', (user as any).id).eq('lesson_id', params.lessonId).maybeSingle()

  const completionStatus = (prog as any)?.status ?? (completedIds.has(params.lessonId) ? 'completed' : 'none')
  const lessonWithTitle = { ...(lesson as any), module_title: moduleTitle }

  // ── Video lesson ──────────────────────────────────────────────────────────
  if ((lesson as any).lesson_type === 'video') {
    return (
      <VideoLessonViewer
        lesson={lessonWithTitle}
        moduleId={params.id}
        studentId={(user as any).id}
        completionStatus={completionStatus}
        allLessons={(allLessons ?? []) as any[]}
        completedIds={Array.from(completedIds) as string[]}
        profile={profile}
      />
    )
  }

  // ── Regular text lesson ───────────────────────────────────────────────────
  let authorName = ''
  if ((lesson as any).author_id) {
    const { data: author } = await admin.from('profiles').select('full_name').eq('id', (lesson as any).author_id).single()
    authorName = (author as any)?.full_name ?? ''
  }
  const { data: subLessons } = await admin.from('lessons')
    .select('*').eq('parent_lesson_id', params.lessonId).eq('locked', false).order('sub_position')

  return (
    <LessonViewer
      lesson={lessonWithTitle}
      moduleId={params.id}
      studentId={(user as any).id}
      completionStatus={completionStatus}
      allLessons={(allLessons ?? []) as any[]}
      completedIds={Array.from(completedIds) as string[]}
      authorName={authorName}
      subLessons={(subLessons ?? []) as any[]}
      profile={profile}
    />
  )
}
