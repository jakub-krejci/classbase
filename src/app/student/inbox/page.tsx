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

  // DMs sent to or from this student
  const { data: dmReceived } = await admin.from('messages')
    .select('*, profiles!sender_id(id, full_name)')
    .eq('recipient_type', 'student')
    .eq('recipient_id', (user as any).id)
    .eq('message_type', 'direct')
    .order('created_at')

  const { data: dmSent } = await admin.from('messages')
    .select('*')
    .eq('sender_id', (user as any).id)
    .in('recipient_type', ['teacher', 'student_direct'])
    .order('created_at')

  const dms = [
    ...(dmReceived ?? []).map((m: any) => ({ ...m, sender_name: m.profiles?.full_name ?? 'Teacher' })),
    ...(dmSent ?? []),
  ]

  // Announcements (recipient_type = 'all')
  const { data: annMsgs } = await admin.from('messages')
    .select('*, profiles!sender_id(full_name)')
    .eq('recipient_type', 'all')
    .eq('message_type', 'announcement')
    .order('created_at', { ascending: false })

  const announcements = (annMsgs ?? []).map((m: any) => ({ ...m, sender_name: m.profiles?.full_name ?? 'Teacher' }))

  // Mark announcement notifications as read
  await admin.from('notifications')
    .update({ read: true } as any)
    .eq('user_id', (user as any).id)
    .eq('type', 'announcement')

  return (
    <AppShell user={profile} role="student">
      <StudentInboxClient messages={dms} announcements={announcements} studentId={(user as any).id} />
    </AppShell>
  )
}
