import { createServerClient, createAdminClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import AppShell from '@/components/AppShell'
import StudentTestsClient from './StudentTestsClient'

export default async function StudentTestsPage() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const admin = createAdminClient()
  const { data: pd } = await admin.from('profiles').select('*').eq('id', user.id).single()
  if ((pd as any)?.role !== 'student') redirect('/teacher/modules')

  // Get groups this student belongs to
  const { data: myGroups } = await admin.from('group_members').select('group_id').eq('student_id', user.id)
  const groupIds = (myGroups ?? []).map((g: any) => g.group_id)

  // Get assigned tests
  const { data: directAssign } = await admin.from('test_assignments').select('test_id').eq('student_id', user.id)
  const { data: groupAssign } = groupIds.length
    ? await admin.from('test_assignments').select('test_id').in('group_id', groupIds)
    : { data: [] }

  const testIds = [...new Set([...(directAssign ?? []), ...(groupAssign ?? [])].map((a: any) => a.test_id))]

  const { data: tests } = testIds.length
    ? await admin.from('tests').select('id,title,description,category,status,available_from,available_until,time_limit_mins').in('id', testIds).eq('status', 'published')
    : { data: [] }

  // Get attempts
  const { data: attempts } = testIds.length
    ? await admin.from('test_attempts').select('*').eq('student_id', user.id).in('test_id', testIds)
    : { data: [] }

  return (
    <AppShell user={pd} role="student">
      <StudentTestsClient tests={(tests ?? []) as any[]} attempts={(attempts ?? []) as any[]} studentId={user.id} />
    </AppShell>
  )
}
