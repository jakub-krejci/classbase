export const dynamic = 'force-dynamic'

/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerClient, createAdminClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import StudentModuleView from './StudentModuleView'

export default async function StudentModuleDetailPage({ params }: { params: any }) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const admin = createAdminClient()
  const { data: pd } = await admin.from('profiles').select('*').eq('id', (user as any).id).single()
  const profile = pd as any
  if (profile?.role !== 'student') redirect('/teacher/modules')

  const moduleId = params.id
  const { data: mod } = await admin.from('modules').select('*').eq('id', moduleId).single()
  if (!mod) redirect('/student/modules')

  // verify enrolled
  const { data: enr } = await admin.from('enrollments').select('id, banned').eq('student_id', (user as any).id).eq('module_id', moduleId).single()
  if (!enr) redirect('/student/modules')
  if ((enr as any).banned) redirect('/student/modules?banned=1')

  const { data: lessons } = await admin.from('lessons').select('*').eq('module_id', moduleId).order('position')
  const { data: assignments } = await admin.from('assignments').select('*').eq('module_id', moduleId).order('created_at')

  // progress
  const lessonIds = (lessons ?? []).map((l: any) => l.id)
  const { data: progressRows } = lessonIds.length
    ? await admin.from('lesson_progress').select('lesson_id,status').eq('student_id', (user as any).id).in('lesson_id', lessonIds)
    : { data: [] }
  const completedIds = new Set((progressRows ?? []).filter((r: any) => r.status === 'completed').map((r: any) => r.lesson_id))
  const bookmarkedIds = new Set((progressRows ?? []).filter((r: any) => r.status === 'bookmark').map((r: any) => r.lesson_id))

  // submissions for this student
  const assignmentIds = (assignments ?? []).map((a: any) => a.id)
  const { data: submissions } = assignmentIds.length
    ? await admin.from('submissions').select('*').eq('student_id', (user as any).id).in('assignment_id', assignmentIds)
    : { data: [] }

  // Classmates — other students in this module with public profiles
  const { data: otherEnrollments } = await admin
    .from('enrollments')
    .select('student_id')
    .eq('module_id', moduleId)
    .neq('student_id', (user as any).id)
    .limit(30)

  const otherIds = (otherEnrollments ?? []).map((e: any) => e.student_id)
  const { data: classmates } = otherIds.length
    ? await admin.from('profiles')
        .select('id, full_name, avatar_url, accent_color, custom_status, show_status, student_class')
        .in('id', otherIds)
        .eq('profile_visibility', true)
    : { data: [] }

  return (
    <StudentModuleView
      module={mod as any}
      lessons={(lessons ?? []) as any[]}
      assignments={(assignments ?? []) as any[]}
      completedIds={Array.from(completedIds) as string[]}
      bookmarkedIds={Array.from(bookmarkedIds) as string[]}
      submissions={(submissions ?? []) as any[]}
      studentId={(user as any).id}
      classmates={(classmates ?? []) as any[]}
      profile={profile}
    />
  )
}
