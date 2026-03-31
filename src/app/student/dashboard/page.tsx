export const dynamic = 'force-dynamic'
/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerClient, createAdminClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import StudentDashboard from './StudentDashboard'

export default async function DashboardPage() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const admin = createAdminClient()

  const { data: pd } = await admin.from('profiles').select('*').eq('id', user.id).single()
  if ((pd as any)?.role !== 'student') redirect('/teacher/dashboard')

  const { data: enrollments } = await admin
    .from('enrollments')
    .select('*, modules(id, title, lessons(id), assignments(id))')
    .eq('student_id', user.id)

  const { data: progress } = await admin
    .from('lesson_progress').select('lesson_id, status').eq('student_id', user.id)

  const { data: myGroups } = await admin.from('group_members').select('group_id').eq('student_id', user.id)
  const groupIds = (myGroups ?? []).map((g: any) => g.group_id)
  const { data: directAssign } = await admin.from('test_assignments').select('test_id').eq('student_id', user.id)
  const { data: groupAssign } = groupIds.length
    ? await admin.from('test_assignments').select('test_id').in('group_id', groupIds)
    : { data: [] }
  const testIds = [...new Set([...(directAssign ?? []), ...(groupAssign ?? [])].map((a: any) => a.test_id))]

  const { data: tests } = testIds.length
    ? await admin.from('tests').select('id, title, category, status, available_until').in('id', testIds).eq('status', 'published').limit(6)
    : { data: [] }

  const { data: attempts } = testIds.length
    ? await admin.from('test_attempts').select('*').eq('student_id', user.id).in('test_id', testIds)
    : { data: [] }

  return (
    <StudentDashboard
      profile={pd as any}
      enrollments={(enrollments ?? []) as any[]}
      completedLessonIds={(progress ?? []).filter((p: any) => p.status === 'completed').map((p: any) => p.lesson_id)}
      tests={(tests ?? []) as any[]}
      attempts={(attempts ?? []) as any[]}
    />
  )
}
