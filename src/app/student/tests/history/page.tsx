import { createServerClient, createAdminClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import AppShell from '@/components/AppShell'
import TestHistoryClient from './TestHistoryClient'

export default async function TestHistoryPage() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const admin = createAdminClient()
  const { data: pd } = await admin.from('profiles').select('*').eq('id', user.id).single()
  if ((pd as any)?.role !== 'student') redirect('/teacher/modules')

  // All submitted/timed_out attempts with test info and answers
  const { data: attempts } = await admin
    .from('test_attempts')
    .select('*, tests(id, title, category, time_limit_mins)')
    .eq('student_id', user.id)
    .in('status', ['submitted', 'timed_out'])
    .order('submitted_at', { ascending: false })

  // For each attempt, fetch answers with question info
  const attemptIds = (attempts ?? []).map((a: any) => a.id)
  const { data: answers } = attemptIds.length
    ? await admin.from('test_answers')
        .select('*, test_questions(id, type, body_html, points_correct, position)')
        .in('attempt_id', attemptIds)
    : { data: [] }

  return (
    <AppShell user={pd} role="student" wide>
      <TestHistoryClient
        attempts={(attempts ?? []) as any[]}
        answers={(answers ?? []) as any[]}
      />
    </AppShell>
  )
}
