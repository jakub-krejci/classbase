import { createServerClient, createAdminClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import AppShell from '@/components/AppShell'
import TestEditorClient from './TestEditorClient'

export default async function TestEditorPage({ params }: { params: any }) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const admin = createAdminClient()
  const { data: pd } = await admin.from('profiles').select('*').eq('id', user.id).single()
  if ((pd as any)?.role !== 'teacher') redirect('/student/modules')

  const { data: test } = await admin.from('tests').select('*').eq('id', params.id).single()
  if (!test || (test as any).teacher_id !== user.id) redirect('/teacher/tests')

  // Auto-scheduling: keep status in sync with dates
  const now = new Date()
  const t = test as any
  let autoStatus: string | null = null
  if (t.available_from && new Date(t.available_from) <= now && t.status === 'draft') autoStatus = 'published'
  if (t.available_until && new Date(t.available_until) <= now && t.status === 'published') autoStatus = 'closed'
  if (autoStatus) {
    await admin.from('tests').update({ status: autoStatus }).eq('id', t.id)
    ;(test as any).status = autoStatus
  }

  const { data: questions } = await admin.from('test_questions')
    .select('*, test_question_options(*)')
    .eq('test_id', params.id)
    .order('position')

  const { data: groups } = await admin.from('groups').select('id,name').eq('teacher_id', user.id)
  const { data: students } = await admin.from('profiles').select('id,full_name,email').eq('role','student')
  const { data: assignments } = await admin.from('test_assignments').select('*').eq('test_id', params.id)
  const { data: attempts } = await admin.from('test_attempts')
    .select('*, profiles(full_name, email)')
    .eq('test_id', params.id)
    .order('started_at', { ascending: false })

  return (
    <AppShell user={pd} role="teacher" wide>
      <TestEditorClient
        test={test as any}
        questions={(questions ?? []) as any[]}
        groups={(groups ?? []) as any[]}
        students={(students ?? []) as any[]}
        assignments={(assignments ?? []) as any[]}
        attempts={(attempts ?? []) as any[]}
      />
    </AppShell>
  )
}
