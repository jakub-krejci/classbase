import { createAdminClient, createServerClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  const body = await req.json()
  const { recipient_type, recipient_id, message_type, subject, text, module_id } = body

  // Insert the message
  const { data: msg, error } = await admin.from('messages').insert({
    sender_id: user.id,
    recipient_type,
    recipient_id: recipient_id || null,
    message_type,
    module_id: module_id || null,
    subject: subject || null,
    body: text,
    read_by: [],
  } as any).select('id').single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Get sender name
  const { data: sender } = await admin.from('profiles').select('full_name').eq('id', user.id).single()
  const senderName = (sender as any)?.full_name ?? 'Teacher'

  // Create notifications for recipients
  const notifLink = '/student/inbox'
  const notifTitle = message_type === 'announcement'
    ? `📢 ${senderName}: ${subject || 'New announcement'}`
    : `💬 ${senderName}: ${subject || 'New message'}`

  if (recipient_type === 'all') {
    // All students
    const { data: students } = await admin.from('profiles').select('id').eq('role', 'student')
    if (students?.length) {
      await admin.from('notifications').insert(
        (students as any[]).map(s => ({
          user_id: s.id,
          type: message_type === 'announcement' ? 'announcement' : 'message',
          title: notifTitle,
          body: text.slice(0, 120),
          link: notifLink,
          read: false,
        }))
      )
    }
  } else if (recipient_type === 'group' && recipient_id) {
    // Group members
    const { data: members } = await admin.from('group_members').select('student_id').eq('group_id', recipient_id)
    if (members?.length) {
      await admin.from('notifications').insert(
        (members as any[]).map(m => ({
          user_id: m.student_id,
          type: message_type === 'announcement' ? 'announcement' : 'message',
          title: notifTitle,
          body: text.slice(0, 120),
          link: notifLink,
          read: false,
        }))
      )
    }
  } else if (recipient_type === 'student' && recipient_id) {
    await admin.from('notifications').insert({
      user_id: recipient_id,
      type: 'message',
      title: notifTitle,
      body: text.slice(0, 120),
      link: notifLink,
      read: false,
    } as any)
  } else if (recipient_type === 'teacher' && recipient_id) {
    // Student reply to teacher
    await admin.from('notifications').insert({
      user_id: recipient_id,
      type: 'reply',
      title: `💬 Reply from ${senderName}`,
      body: text.slice(0, 120),
      link: '/teacher/messages',
      read: false,
    } as any)
  }

  return NextResponse.json({ id: (msg as any).id })
}
