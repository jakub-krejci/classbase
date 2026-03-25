'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { PageHeader, Card } from '@/components/ui'

export default function MessagesClient({ messages, groups, students, senderId }: {
  messages: any[]; groups: any[]; students: any[]; senderId: string
}) {
  const supabase = createClient()
  const router = useRouter()
  const [to, setTo] = useState('all')
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)

  const inp: React.CSSProperties = { width: '100%', padding: '7px 9px', border: '0.5px solid #e5e7eb', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', outline: 'none', marginBottom: 8 }

  async function send() {
    if (!body.trim()) return
    setSending(true)
    let recipient_type: string = 'all'
    let recipient_id: string | null = null
    if (to.startsWith('group:')) { recipient_type = 'group'; recipient_id = to.replace('group:', '') }
    else if (to.startsWith('student:')) { recipient_type = 'student'; recipient_id = to.replace('student:', '') }
    await supabase.from('messages').insert({ sender_id: senderId, recipient_type, recipient_id, body: body.trim() })
    setBody('')
    setSending(false)
    router.refresh()
  }

  return (
    <div>
      <PageHeader title="Messages" sub="Send notifications to students or groups" />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <Card>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#888', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 10 }}>New message</div>
          <label style={{ fontSize: 11, fontWeight: 500, color: '#666', display: 'block', marginBottom: 3 }}>To</label>
          <select style={inp} value={to} onChange={e => setTo(e.target.value)}>
            <option value="all">All students</option>
            {groups.map((g: any) => <option key={g.id} value={'group:' + g.id}>Group: {g.name}</option>)}
            {students.map((s: any) => <option key={s.id} value={'student:' + s.id}>{s.full_name ?? s.email}</option>)}
          </select>
          <label style={{ fontSize: 11, fontWeight: 500, color: '#666', display: 'block', marginBottom: 3 }}>Message</label>
          <textarea style={{ ...inp, height: 90, resize: 'vertical' }} value={body} onChange={e => setBody(e.target.value)} placeholder="e.g. Reminder: assignment due Friday!" />
          <button onClick={send} disabled={sending || !body.trim()}
            style={{ width: '100%', padding: '9px', background: '#185FA5', color: '#E6F1FB', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer', opacity: sending ? .6 : 1 }}>
            {sending ? 'Sending…' : 'Send message'}
          </button>
        </Card>
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#888', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 10 }}>Sent</div>
          {messages.length === 0 && <p style={{ fontSize: 13, color: '#aaa' }}>No messages sent yet.</p>}
          {messages.map((m: any) => (
            <div key={m.id} style={{ background: '#E6F1FB', borderRadius: 10, padding: '10px 13px', marginBottom: 8, fontSize: 13, color: '#0C447C' }}>
              <div style={{ fontSize: 10, opacity: .7, marginBottom: 3 }}>
                To: {m.recipient_type === 'all' ? 'All students' : m.recipient_type} · {new Date(m.created_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
              </div>
              {m.body}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
