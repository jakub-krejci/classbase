export const dynamic = 'force-dynamic'
/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerClient, createAdminClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import AppShell from '@/components/AppShell'
import TeacherDashboard from './TeacherDashboard'

export default async function TeacherDashboardPage() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const admin = createAdminClient()

  const { data: pd } = await admin.from('profiles').select('*').eq('id', user.id).single()
  if ((pd as any)?.role !== 'teacher') redirect('/student/dashboard')

  // Modules with lesson + enrollment counts
  const { data: modules } = await admin
    .from('modules')
    .select('id, title, status, created_at, lessons(id), enrollments(id)')
    .eq('teacher_id', user.id)
    .eq('archived', false)
    .order('created_at', { ascending: false })

  // All enrollments across teacher's modules
  const moduleIds = (modules ?? []).map((m: any) => m.id)

  // Tests
  const { data: tests } = await admin
    .from('tests')
    .select('id, title, status, created_at, available_until')
    .eq('teacher_id', user.id)
    .eq('archived', false)
    .order('created_at', { ascending: false })
    .limit(20)

  const testIds = (tests ?? []).map((t: any) => t.id)

  // Pending (unreviewed) test attempts needing grading
  const { data: pendingAttempts } = testIds.length
    ? await admin.from('test_attempts')
        .select('id, test_id, student_id, submitted_at, status, tests(title), profiles(full_name)')
        .in('test_id', testIds)
        .in('status', ['submitted', 'timed_out'])
        .is('reviewed_at', null)
        .order('submitted_at', { ascending: false })
        .limit(8)
    : { data: [] }

  // Recent lesson progress across teacher's modules
  const { data: recentProgress } = moduleIds.length
    ? await admin.from('lesson_progress')
        .select('id, student_id, completed_at, lessons(title, module_id, modules(title)), profiles(full_name)')
        .in('lesson_id',
          (await admin.from('lessons').select('id').in('module_id', moduleIds)).data?.map((l: any) => l.id) ?? []
        )
        .order('completed_at', { ascending: false })
        .limit(6)
    : { data: [] }

  // Student count (unique students enrolled in any module)
  const { data: allEnrollments } = moduleIds.length
    ? await admin.from('enrollments').select('student_id').in('module_id', moduleIds)
    : { data: [] }
  const uniqueStudents = new Set((allEnrollments ?? []).map((e: any) => e.student_id)).size

  // Published tests count
  const publishedTests = (tests ?? []).filter((t: any) => t.status === 'published').length

  // Total submissions this week
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const { data: weekSubmissions } = testIds.length
    ? await admin.from('test_attempts')
        .select('id').in('test_id', testIds)
        .in('status', ['submitted', 'timed_out'])
        .gte('submitted_at', weekAgo)
    : { data: [] }

  return (
    <AppShell user={pd} role="teacher" wide>
      <TeacherDashboard
        profile={pd as any}
        modules={(modules ?? []) as any[]}
        tests={(tests ?? []) as any[]}
        pendingAttempts={(pendingAttempts ?? []) as any[]}
        recentProgress={(recentProgress ?? []) as any[]}
        stats={{
          totalModules: (modules ?? []).length,
          totalStudents: uniqueStudents,
          publishedTests,
          weekSubmissions: (weekSubmissions ?? []).length,
        }}
      />
    </AppShell>
  )
}
