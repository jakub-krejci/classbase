import { createServerClient, createAdminClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import AppShell from '@/components/AppShell'
import TestPlayer from './TestPlayer'

export default async function StudentTestPage({ params }: { params: any }) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const admin = createAdminClient()
  const { data: pd } = await admin.from('profiles').select('*').eq('id', user.id).single()
  if ((pd as any)?.role !== 'student') redirect('/teacher/modules')

  const { data: test } = await admin.from('tests').select('*').eq('id', params.id).single()
  if (!test) redirect('/student/tests')

  // Check assignment
  const { data: myGroups } = await admin.from('group_members').select('group_id').eq('student_id', user.id)
  const groupIds = (myGroups ?? []).map((g: any) => g.group_id)
  const { data: directA } = await admin.from('test_assignments').select('id').eq('test_id', params.id).eq('student_id', user.id)
  const { data: groupA } = groupIds.length ? await admin.from('test_assignments').select('id').eq('test_id', params.id).in('group_id', groupIds) : { data: [] }
  if (!(directA?.length || groupA?.length)) redirect('/student/tests')

  const { data: questions } = await admin.from('test_questions')
    .select('*, test_question_options(*)')
    .eq('test_id', params.id)
    .order('position')

  const { data: attempt } = await admin.from('test_attempts')
    .select('*').eq('test_id', params.id).eq('student_id', user.id).maybeSingle()

  const { data: answers } = attempt
    ? await admin.from('test_answers').select('*').eq('attempt_id', (attempt as any).id)
    : { data: [] }

  return (
    <AppShell user={pd} role="student" wide>
      <TestPlayer
        test={test as any}
        questions={(questions ?? []) as any[]}
        attempt={attempt as any}
        answers={(answers ?? []) as any[]}
        studentId={user.id}
      />
    </AppShell>
  )
}
