/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import AppShell from '@/components/AppShell'
import GroupsClient from './GroupsClient'

export default async function GroupsPage() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: pd } = await supabase.from('profiles').select('*').eq('id', (user as any).id).single()
  const profile = pd as any
  if (profile?.role !== 'teacher') redirect('/student/modules')

  const { data: groups } = await supabase.from('groups').select('*, group_members(student_id, profiles(full_name,email))').eq('teacher_id', (user as any).id)
  const { data: students } = await supabase.from('profiles').select('id,full_name,email').eq('role', 'student')

  return (
    <AppShell user={profile} role="teacher">
      <GroupsClient groups={(groups ?? []) as any[]} students={(students ?? []) as any[]} teacherId={(user as any).id} />
    </AppShell>
  )
}
