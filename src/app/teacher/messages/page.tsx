export const dynamic = 'force-dynamic'
/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerClient, createAdminClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import AppShell from '@/components/AppShell'
import MessagesClient from './MessagesClient'

export default async function MessagesPage() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const admin = createAdminClient()
  const { data: pd } = await admin.from('profiles').select('*').eq('id', (user as any).id).single()
  const profile = pd as any
  if (profile?.role !== 'teacher') redirect('/student/modules')

  // Sent messages
  const { data: sent } = await admin.from('messages')
    .select('*')
    .eq('sender_id', (user as any).id)
    .order('created_at', { ascending: false })

  // Received: student replies to this teacher
  const { data: received } = await admin.from('messages')
    .select('*, profiles!sender_id(full_name, email)')
    .eq('recipient_type', 'teacher')
    .eq('recipient_id', (user as any).id)
    .order('created_at', { ascending: false })

  const receivedWithName = (received ?? []).map((m: any) => ({
    ...m,
    sender_name: m.profiles?.full_name ?? m.profiles?.email ?? 'Student',
  }))

  const { data: grps } = await admin.from('groups').select('id,name').eq('teacher_id', (user as any).id)
  const { data: students } = await admin.from('profiles').select('id,full_name,email').eq('role', 'student')
  return (
    <AppShell user={profile} role="teacher">
      <MessagesClient
        sent={(sent ?? []) as any[]}
        received={receivedWithName}
        groups={(grps ?? []) as any[]}
        students={(students ?? []) as any[]}
        senderId={(user as any).id}
      />
    </AppShell>
  )
}
