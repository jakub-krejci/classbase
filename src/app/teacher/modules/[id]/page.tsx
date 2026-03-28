export const dynamic = 'force-dynamic'

/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerClient, createAdminClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import AppShell from '@/components/AppShell'
import ModuleDetail from './ModuleDetail'

export default async function ModuleDetailPage({ params }: { params: any }) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const admin = createAdminClient()

  const { data: pd } = await admin.from('profiles').select('*').eq('id', (user as any).id).single()
  const profile = pd as any
  if (profile?.role !== 'teacher') redirect('/student/modules')

  const moduleId = params.id
  const { data: mod } = await admin.from('modules').select('*').eq('id', moduleId).eq('teacher_id', (user as any).id).single()
  if (!mod) redirect('/teacher/modules')

  const { data: lessons } = await admin.from('lessons').select('*').eq('module_id', moduleId).order('position').order('sub_position')
  const { data: assignments } = await admin.from('assignments').select('*').eq('module_id', moduleId).order('created_at')
  const { data: enrollments } = await admin.from('enrollments')
    .select('student_id, banned, profiles(full_name, email, last_seen_at, avatar_url, accent_color, profile_visibility, student_class, grade_level, custom_status)')
    .eq('module_id', moduleId)

  // Fetch lesson progress for all enrolled students
  const lessonIds = (lessons ?? []).map((l: any) => l.id)
  const studentIds = (enrollments ?? []).map((e: any) => e.student_id)
  const { data: allProgress } = lessonIds.length && studentIds.length
    ? await admin.from('lesson_progress')
        .select('student_id, lesson_id, status, scroll_pct')
        .in('lesson_id', lessonIds)
        .in('student_id', studentIds)
    : { data: [] }

  return (
    <AppShell user={profile} role="teacher">
      <ModuleDetail
        module={mod as any}
        lessons={(lessons ?? []) as any[]}
        assignments={(assignments ?? []) as any[]}
        enrollments={(enrollments ?? []) as any[]}
        allProgress={(allProgress ?? []) as any[]}
      />
    </AppShell>
  )
}
