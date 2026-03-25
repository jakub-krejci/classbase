/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import AppShell from '@/components/AppShell'
import AssignmentView from './AssignmentView'

export default async function StudentAssignmentPage({ params }: { params: any }) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: pd } = await supabase.from('profiles').select('*').eq('id', (user as any).id).single()
  const profile = pd as any
  if (profile?.role !== 'student') redirect('/teacher/modules')

  const { data: assignment } = await supabase.from('assignments').select('*').eq('id', params.assignmentId).single()
  if (!assignment) redirect('/student/modules/' + params.id)

  const { data: existingSub } = await supabase.from('submissions')
    .select('*').eq('student_id', (user as any).id).eq('assignment_id', params.assignmentId).single()

  return (
    <AppShell user={profile} role="student">
      <AssignmentView
        assignment={assignment as any}
        moduleId={params.id}
        studentId={(user as any).id}
        existingSubmission={existingSub as any ?? null}
      />
    </AppShell>
  )
}
