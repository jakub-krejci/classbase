export const dynamic = 'force-dynamic'

/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerClient, createAdminClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import AppShell from '@/components/AppShell'
import GradeClient from './GradeClient'

export default async function GradePage() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const admin = createAdminClient()
  const { data: pd } = await admin.from('profiles').select('*').eq('id', (user as any).id).single()
  const profile = pd as any
  if (profile?.role !== 'teacher') redirect('/student/modules')

  const { data: subs } = await supabase
    .from('submissions')
    .select('*, profiles!student_id(full_name,email), assignments(title,type,module_id,questions)')
    .eq('status', 'submitted')
    .order('submitted_at', { ascending: false })

  return (
    <AppShell user={profile} role="teacher">
      <GradeClient submissions={(subs ?? []) as any[]} />
    </AppShell>
  )
}
