export const dynamic = 'force-dynamic'
/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerClient, createAdminClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import AppShell from '@/components/AppShell'
import TeacherStudentProfileClient from './TeacherStudentProfileClient'

export default async function TeacherStudentProfilePage({ params }: { params: any }) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const admin = createAdminClient()

  const { data: teacher } = await admin.from('profiles').select('*').eq('id', user.id).single()
  if ((teacher as any)?.role !== 'teacher') redirect('/student/dashboard')

  // Fetch student profile
  const { data: student } = await admin
    .from('profiles')
    .select('id, full_name, email, avatar_url, banner_url, bio, custom_status, student_class, grade_level, pronouns, accent_color, created_at, last_login_at, profile_visibility, show_bio, show_status, role')
    .eq('id', params.id)
    .eq('role', 'student')
    .single()

  if (!student) notFound()

  // Verify this teacher has at least one shared module with the student
  const { data: teacherMods } = await admin.from('modules').select('id').eq('teacher_id', user.id)
  const teacherModIds = (teacherMods ?? []).map((m: any) => m.id)
  const { data: studentEnrollments } = await admin
    .from('enrollments')
    .select('module_id, enrolled_at, banned, modules(id, title)')
    .eq('student_id', params.id)
    .in('module_id', teacherModIds)

  if (!studentEnrollments?.length) notFound()

  // Progress across teacher's modules
  const moduleIds = studentEnrollments.map((e: any) => e.module_id)
  const { data: allLessons } = await admin.from('lessons').select('id, module_id').in('module_id', moduleIds)
  const lessonIds = (allLessons ?? []).map((l: any) => l.id)
  const { data: progress } = lessonIds.length
    ? await admin.from('lesson_progress').select('lesson_id, status, module_id:lessons(module_id)')
        .eq('student_id', params.id).in('lesson_id', lessonIds)
    : { data: [] }

  // Test attempts for this student in teacher's tests
  const { data: teacherTests } = await admin.from('tests').select('id, title').eq('teacher_id', user.id)
  const testIds = (teacherTests ?? []).map((t: any) => t.id)
  const { data: attempts } = testIds.length
    ? await admin.from('test_attempts')
        .select('id, test_id, score, max_score, status, submitted_at, tests(title)')
        .eq('student_id', params.id).in('test_id', testIds)
        .in('status', ['submitted', 'timed_out', 'graded'])
        .order('submitted_at', { ascending: false })
        .limit(10)
    : { data: [] }

  // Build progress map per module
  const progressMap: Record<string, { done: number; total: number }> = {}
  for (const mod of teacherMods ?? []) {
    const modLessons = (allLessons ?? []).filter((l: any) => l.module_id === mod.id)
    const done = (progress ?? []).filter((p: any) => {
      const lessonModId = Array.isArray(p.module_id) ? p.module_id[0] : p.module_id
      return lessonModId === mod.id && p.status === 'completed'
    }).length
    progressMap[mod.id] = { done, total: modLessons.length }
  }

  return (
    <AppShell user={teacher} role="teacher">
      <TeacherStudentProfileClient
        student={student as any}
        enrollments={(studentEnrollments ?? []) as any[]}
        progressMap={progressMap}
        attempts={(attempts ?? []) as any[]}
      />
    </AppShell>
  )
}
