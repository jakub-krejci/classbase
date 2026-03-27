export const dynamic = 'force-dynamic'
/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerClient, createAdminClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import AppShell from '@/components/AppShell'
import StudentInboxClient from './StudentInboxClient'

export default async function StudentInboxPage() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const admin = createAdminClient()
  const { data: pd } = await admin.from('profiles').select('*').eq('id', (user as any).id).single()
  const profile = pd as any
  if (profile?.role !== 'student') redirect('/teacher/modules')

  // Messages addressed to all, to this student directly
  const { data: allMsgs } = await admin.from('messages')
    .select('*, profiles!sender_id(id, full_name)')
    .eq('recipient_type', 'all')
    .order('created_at', { ascending: false })

  const { data: directMsgs } = await admin.from('messages')
    .select('*, profiles!sender_id(id, full_name)')
    .eq('recipient_type', 'student')
    .eq('recipient_id', (user as any).id)
    .order('created_at', { ascending: false })

  const messages = [...(allMsgs ?? []), ...(directMsgs ?? [])]
    .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .map((m: any) => ({ ...m, sender_name: m.profiles?.full_name ?? 'Teacher', teacher_id: m.profiles?.id }))

  // Mark notifications as read
  await admin.from('notifications')
    .update({ read: true } as any)
    .eq('user_id', (user as any).id)
    .in('type', ['announcement', 'message'])

  return (
    <AppShell user={profile} role="student">
      <StudentInboxClient messages={messages} studentId={(user as any).id} />
    </AppShell>
  )
}
