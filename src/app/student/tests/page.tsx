/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerClient, createAdminClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import DarkTestsClient from './DarkTestsClient'

export default async function StudentTestsPage() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const admin = createAdminClient()
  const { data: pd } = await admin.from('profiles').select('*').eq('id', (user as any).id).single()
  const profile = pd as any
  if (profile?.role !== 'student') redirect('/teacher/tests')

  const { data: myGroups } = await admin.from('group_members').select('group_id').eq('student_id', user.id)
  const groupIds = (myGroups ?? []).map((g: any) => g.group_id)
  const { data: direct } = await admin.from('test_assignments').select('test_id').eq('student_id', user.id)
  const { data: group }  = groupIds.length ? await admin.from('test_assignments').select('test_id').in('group_id', groupIds) : { data: [] }
  const testIds = [...new Set([...(direct ?? []), ...(group ?? [])].map((a: any) => a.test_id))]

  const { data: tests } = testIds.length
    ? await admin.from('tests').select('id,title,description,category,status,time_limit_mins,available_from,available_until,retake_mode,max_attempts').in('id', testIds).eq('status', 'published')
    : { data: [] }
  const { data: attempts } = testIds.length
    ? await admin.from('test_attempts').select('*').eq('student_id', user.id).in('test_id', testIds)
    : { data: [] }

  return <DarkTestsClient profile={profile} tests={(tests ?? []) as any[]} attempts={(attempts ?? []) as any[]} studentId={user.id} />
}
