/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import AppShell from '@/components/AppShell'
import StudentModuleView from './StudentModuleView'

export default async function StudentModuleDetailPage({ params }: { params: any }) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: pd } = await supabase.from('profiles').select('*').eq('id', (user as any).id).single()
  const profile = pd as any
  if (profile?.role !== 'student') redirect('/teacher/modules')

  const moduleId = params.id
  const { data: mod } = await supabase.from('modules').select('*').eq('id', moduleId).single()
  if (!mod) redirect('/student/modules')

  // verify enrolled
  const { data: enr } = await supabase.from('enrollments').select('id').eq('student_id', (user as any).id).eq('module_id', moduleId).single()
  if (!enr) redirect('/student/modules')

  const { data: lessons } = await supabase.from('lessons').select('*').eq('module_id', moduleId).order('position')
  const { data: assignments } = await supabase.from('assignments').select('*').eq('module_id', moduleId).order('created_at')

  // progress
  const lessonIds = (lessons ?? []).map((l: any) => l.id)
  const { data: progressRows } = lessonIds.length
    ? await supabase.from('lesson_progress').select('lesson_id').eq('student_id', (user as any).id).in('lesson_id', lessonIds)
    : { data: [] }
  const completedIds = new Set((progressRows ?? []).map((r: any) => r.lesson_id))

  // submissions for this student
  const assignmentIds = (assignments ?? []).map((a: any) => a.id)
  const { data: submissions } = assignmentIds.length
    ? await supabase.from('submissions').select('*').eq('student_id', (user as any).id).in('assignment_id', assignmentIds)
    : { data: [] }

  return (
    <AppShell user={profile} role="student">
      <StudentModuleView
        module={mod as any}
        lessons={(lessons ?? []) as any[]}
        assignments={(assignments ?? []) as any[]}
        completedIds={Array.from(completedIds) as string[]}
        submissions={(submissions ?? []) as any[]}
        studentId={(user as any).id}
      />
    </AppShell>
  )
}
