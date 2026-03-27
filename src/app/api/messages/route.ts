import { createAdminClient, createServerClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  const body = await req.json()
  const { recipient_type, recipient_id, message_type, subject, text, module_id } = body

  const { data: msg, error } = await admin.from('messages').insert({
    sender_id: user.id,
    recipient_type,
    recipient_id: recipient_id || null,
    message_type: message_type || 'direct',
    module_id: module_id || null,
    subject: subject || null,
    body: text,
    read_by: [],
  } as any).select('id').single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { data: sender } = await admin.from('profiles').select('full_name').eq('id', user.id).single()
  const senderName = (sender as any)?.full_name ?? 'User'
  const msgId = (msg as any).id

  // Create notifications
  async function notify(userId: string, type: string, title: string, link: string) {
    await admin.from('notifications').insert({
      user_id: userId, type, title, body: text.slice(0, 120), link, read: false,
    } as any)
  }

  if (recipient_type === 'all') {
    const { data: students } = await admin.from('profiles').select('id').eq('role', 'student')
    if (students?.length) {
      await admin.from('notifications').insert(
        (students as any[]).filter(s => s.id !== user.id).map(s => ({
          user_id: s.id, type: 'announcement',
          title: `📢 ${senderName}: ${subject || 'New announcement'}`,
          body: text.slice(0, 120), link: '/student/inbox', read: false,
        }))
      )
    }
  } else if (recipient_type === 'group' && recipient_id) {
    const { data: members } = await admin.from('group_members').select('student_id').eq('group_id', recipient_id)
    if (members?.length) {
      await admin.from('notifications').insert(
        (members as any[]).filter(m => m.student_id !== user.id).map(m => ({
          user_id: m.student_id, type: 'announcement',
          title: `📢 ${senderName}: ${subject || 'New announcement'}`,
          body: text.slice(0, 120), link: '/student/inbox', read: false,
        }))
      )
    }
  } else if (recipient_type === 'student' && recipient_id) {
    await notify(recipient_id, 'message', `💬 ${senderName}`, '/student/inbox')
  } else if (recipient_type === 'student_direct' && recipient_id) {
    await notify(recipient_id, 'message', `💬 ${senderName}`, '/student/inbox')
  } else if (recipient_type === 'teacher' && recipient_id) {
    await notify(recipient_id, 'reply', `💬 ${senderName}`, '/teacher/messages')
  }

  return NextResponse.json({ id: msgId })
}
