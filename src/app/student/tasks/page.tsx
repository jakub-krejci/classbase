export const dynamic = 'force-dynamic'
/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerClient, createAdminClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { DarkLayout } from '@/components/DarkLayout'
import StudentTasksClient from './StudentTasksClient'

export default async function StudentTasksPage() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const admin = createAdminClient()

  const { data: profile } = await admin.from('profiles').select('*').eq('id', user.id).single()
  if ((profile as any)?.role !== 'student') redirect('/teacher/dashboard')

  // Get all published assignments for this student (direct or via group)
  const { data: assignments } = await admin.rpc('get_student_assignments', { p_student_id: user.id })

  // Get student's submissions
  const { data: submissions } = await admin
    .from('task_submissions')
    .select('*')
    .eq('student_id', user.id)

  return (
    <DarkLayout profile={profile} activeRoute="/student/tasks">
      <StudentTasksClient
        profile={profile as any}
        assignments={(assignments ?? []) as any[]}
        submissions={(submissions ?? []) as any[]}
      />
    </DarkLayout>
  )
}
