export const dynamic = 'force-dynamic'
/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerClient, createAdminClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import AppShell from '@/components/AppShell'
import TeacherTasksClient from './TeacherTasksClient'

export default async function TeacherTasksPage() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const admin = createAdminClient()

  const { data: pd } = await admin.from('profiles').select('*').eq('id', user.id).single()
  if ((pd as any)?.role !== 'teacher') redirect('/student/dashboard')

  // All teacher's assignments with submission counts
  const { data: assignments } = await admin
    .from('task_assignments')
    .select(`
      id, title, description, editor_type, deadline,
      allow_resubmit, status, published_at, created_at,
      task_targets(id, student_id, group_id),
      task_submissions(id, status, student_id)
    `)
    .eq('teacher_id', user.id)
    .order('created_at', { ascending: false })

  // All students and groups for assignment form
  const { data: students } = await admin
    .from('profiles')
    .select('id, full_name, email')
    .eq('role', 'student')
    .order('full_name')

  const { data: groups } = await admin
    .from('groups')
    .select('id, name, group_members(student_id)')
    .eq('teacher_id', user.id)
    .order('name')

  return (
    <AppShell user={pd} role="teacher" wide>
      <TeacherTasksClient
        teacherId={user.id}
        assignments={(assignments ?? []) as any[]}
        students={(students ?? []) as any[]}
        groups={(groups ?? []) as any[]}
      />
    </AppShell>
  )
}
