export const dynamic = 'force-dynamic'

/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerClient, createAdminClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import AppShell from '@/components/AppShell'
import GroupsClient from './GroupsClient'

export default async function GroupsPage() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const admin = createAdminClient()
  const { data: pd } = await admin.from('profiles').select('*').eq('id', (user as any).id).single()
  const profile = pd as any
  if (profile?.role !== 'teacher') redirect('/student/modules')

  const { data: groups } = await admin.from('groups').select('*, group_members(student_id, profiles(full_name,email))').eq('teacher_id', (user as any).id)
  const { data: students } = await admin.from('profiles').select('id,full_name,email').eq('role', 'student')
  // Also fetch teacher's modules and which groups are assigned to each
  const { data: modules } = await admin.from('modules').select('id,title,tag,archived').eq('teacher_id', (user as any).id).eq('archived', false).order('created_at', { ascending: false })
  const { data: groupModules } = await admin.from('group_modules').select('group_id,module_id')

  return (
    <AppShell user={profile} role="teacher">
      <GroupsClient
        groups={(groups ?? []) as any[]}
        students={(students ?? []) as any[]}
        modules={(modules ?? []) as any[]}
        groupModules={(groupModules ?? []) as any[]}
        teacherId={(user as any).id}
      />
    </AppShell>
  )
}
