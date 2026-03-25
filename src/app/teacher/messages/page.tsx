export const dynamic = 'force-dynamic'

/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import AppShell from '@/components/AppShell'
import MessagesClient from './MessagesClient'

export default async function MessagesPage() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: pd } = await supabase.from('profiles').select('*').eq('id', (user as any).id).single()
  const profile = pd as any
  if (profile?.role !== 'teacher') redirect('/student/modules')

  const { data: msgs } = await supabase.from('messages').select('*').eq('sender_id', (user as any).id).order('created_at', { ascending: false })
  const { data: grps } = await supabase.from('groups').select('id,name').eq('teacher_id', (user as any).id)
  const { data: students } = await supabase.from('profiles').select('id,full_name,email').eq('role', 'student')

  return (
    <AppShell user={profile} role="teacher">
      <MessagesClient
        messages={(msgs ?? []) as any[]}
        groups={(grps ?? []) as any[]}
        students={(students ?? []) as any[]}
        senderId={(user as any).id}
      />
    </AppShell>
  )
}
