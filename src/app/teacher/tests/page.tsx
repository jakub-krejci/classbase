import { createServerClient, createAdminClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import AppShell from '@/components/AppShell'
import TestsClient from './TestsClient'

export default async function TeacherTestsPage() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const admin = createAdminClient()
  const { data: pd } = await admin.from('profiles').select('*').eq('id', user.id).single()
  if ((pd as any)?.role !== 'teacher') redirect('/student/modules')
  const { data: tests } = await admin.from('tests')
    .select('id,title,description,category,status,available_from,available_until,created_at')
    .eq('teacher_id', user.id)
    .order('created_at', { ascending: false })
  return (
    <AppShell user={pd} role="teacher" wide>
      <TestsClient tests={(tests ?? []) as any[]} teacherId={user.id} />
    </AppShell>
  )
}
