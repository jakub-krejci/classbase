import { createServerClient, createAdminClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import AppShell from '@/components/AppShell'
import TestPlayer from './TestPlayer'

export default async function StudentTestPage({ params, searchParams }: { params: any; searchParams: any }) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const admin = createAdminClient()
  const { data: pd } = await admin.from('profiles').select('*').eq('id', user.id).single()
  if ((pd as any)?.role !== 'student') redirect('/teacher/modules')

  const { data: test } = await admin.from('tests').select('*').eq('id', params.id).single()
  if (!test) redirect('/student/tests')

  // ── Auto-scheduling: update status based on available_from / available_until ──
  const now = new Date()
  const t = test as any
  let autoStatus: string | null = null
  if (t.available_from && new Date(t.available_from) <= now && t.status === 'draft') autoStatus = 'published'
  if (t.available_until && new Date(t.available_until) <= now && t.status === 'published') autoStatus = 'closed'
  if (autoStatus) {
    await admin.from('tests').update({ status: autoStatus }).eq('id', t.id)
    ;(test as any).status = autoStatus
  }

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

  // If retake=1 is in the URL, force a new attempt (ignore in_progress check)
  const forceRetake = (await searchParams)?.retake === '1'

  // Fetch all attempts (for retake policy)
  const { data: allAttempts } = await admin.from('test_attempts')
    .select('*').eq('test_id', params.id).eq('student_id', user.id)
    .order('started_at', { ascending: false })

  // For retake policy: pick the "active" attempt (in_progress), or latest submitted
  const retakeMode = (test as any).retake_mode ?? 'single'
  const maxAttempts = (test as any).max_attempts ?? null
  const completedAttempts = (allAttempts ?? []).filter((a: any) => ['submitted','timed_out','locked'].includes(a.status))
  const activeAttempt = forceRetake ? null : ((allAttempts ?? []).find((a: any) => a.status === 'in_progress') ?? null)

  // Can start a new attempt?
  const canRetake = retakeMode === 'practice' ||
    (retakeMode === 'best' && (maxAttempts === null || completedAttempts.length < maxAttempts)) ||
    (retakeMode === 'single' && completedAttempts.length === 0)

  const attempt = activeAttempt ?? (completedAttempts[0] ?? null)

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
        canRetake={canRetake}
        completedCount={completedAttempts.length}
      />
    </AppShell>
  )
}
