import { createAdminClient, createServerClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import AppShell from '@/components/AppShell'
import ReviewClient from './ReviewClient'

export default async function ReviewPage({ params }: { params: any }) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const admin = createAdminClient()
  const { data: pd } = await admin.from('profiles').select('*').eq('id', user.id).single()
  if ((pd as any)?.role !== 'teacher') redirect('/student/modules')

  const { data: attempt } = await admin.from('test_attempts')
    .select('*, profiles(full_name, email)')
    .eq('id', params.attemptId).single()
  if (!attempt) redirect('/teacher/tests')

  const { data: test } = await admin.from('tests').select('*').eq('id', (attempt as any).test_id).single()
  if (!test || (test as any).teacher_id !== user.id) redirect('/teacher/tests')

  const { data: questions } = await admin.from('test_questions')
    .select('*, test_question_options(*)')
    .eq('test_id', (attempt as any).test_id)
    .order('position')

  const { data: answers } = await admin.from('test_answers')
    .select('*').eq('attempt_id', params.attemptId)

  return (
    <AppShell user={pd} role="teacher" wide>
      <ReviewClient
        test={test as any}
        attempt={attempt as any}
        questions={(questions ?? []) as any[]}
        answers={(answers ?? []) as any[]}
      />
    </AppShell>
  )
}
