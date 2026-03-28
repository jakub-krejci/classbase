import { createServerClient, createAdminClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import AppShell from '@/components/AppShell'
import BulkGradeClient from './BulkGradeClient'

export default async function BulkGradePage({ params, searchParams }: { params: any; searchParams: any }) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const admin = createAdminClient()
  const { data: pd } = await admin.from('profiles').select('*').eq('id', user.id).single()
  if ((pd as any)?.role !== 'teacher') redirect('/student/modules')

  const { data: test } = await admin.from('tests').select('*').eq('id', params.id).single()
  if (!test || (test as any).teacher_id !== user.id) redirect('/teacher/tests')

  const { data: questions } = await admin.from('test_questions')
    .select('*, test_question_options(*)')
    .eq('test_id', params.id)
    .order('position')

  const { data: attempts } = await admin.from('test_attempts')
    .select('*, profiles(full_name, email)')
    .eq('test_id', params.id)
    .in('status', ['submitted', 'timed_out'])
    .order('submitted_at', { ascending: true })

  const attemptIds = (attempts ?? []).map((a: any) => a.id)
  const { data: answers } = attemptIds.length
    ? await admin.from('test_answers').select('*').in('attempt_id', attemptIds)
    : { data: [] }

  const initialQ = parseInt(searchParams?.q ?? '0') || 0

  return (
    <AppShell user={pd} role="teacher" wide>
      <BulkGradeClient
        test={test as any}
        questions={(questions ?? []) as any[]}
        attempts={(attempts ?? []) as any[]}
        answers={(answers ?? []) as any[]}
        initialQ={initialQ}
      />
    </AppShell>
  )
}
