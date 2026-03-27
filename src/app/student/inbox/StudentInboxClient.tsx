'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from 'react'
import { Breadcrumb, PageHeader } from '@/components/ui'

export default function StudentInboxClient({ messages: initial, studentId }: { messages: any[]; studentId: string }) {
  const [messages] = useState(initial)
  const [replyTo, setReplyTo] = useState<any>(null)
  const [replyBody, setReplyBody] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState<string[]>([])

  const announcements = messages.filter(m => m.message_type === 'announcement' || !m.message_type)
  const directs = messages.filter(m => m.message_type === 'direct')

  async function sendReply() {
    if (!replyBody.trim() || !replyTo) return
    setSending(true)
    await fetch('/api/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recipient_type: 'teacher',
        recipient_id: replyTo.teacher_id,
        message_type: 'direct',
        subject: 'Re: ' + (replyTo.subject || replyTo.body?.slice(0, 40)),
        text: replyBody,
      }),
    })
    setSent(prev => [...prev, replyTo.id])
    setReplyBody('')
    setReplyTo(null)
    setSending(false)
  }

  const inp: React.CSSProperties = { width: '100%', padding: '8px 10px', border: '0.5px solid #e5e7eb', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }

  function MsgCard({ m }: { m: any }) {
    const isAnnouncement = m.message_type === 'announcement' || !m.message_type
    const hasSent = sent.includes(m.id)
    return (
      <div style={{ background: '#fff', border: '0.5px solid #e5e7eb', borderRadius: 12, padding: '14px 16px', marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 8 }}>
          <div style={{ width: 32, height: 32, borderRadius: '50%', background: isAnnouncement ? '#EAF3DE' : '#E6F1FB', color: isAnnouncement ? '#27500A' : '#0C447C', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            {isAnnouncement ? '📢' : (m.sender_name ?? '?').split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2)}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
              <div>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{m.sender_name ?? 'Teacher'}</span>
                <span style={{ fontSize: 11, color: '#aaa', marginLeft: 8 }}>
                  {new Date(m.created_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 10,
                background: isAnnouncement ? '#EAF3DE' : '#E6F1FB',
                color: isAnnouncement ? '#27500A' : '#0C447C' }}>
                {isAnnouncement ? 'Announcement' : 'Direct message'}
              </span>
            </div>
            {m.subject && <div style={{ fontSize: 12, fontWeight: 600, color: '#333', marginTop: 4 }}>{m.subject}</div>}
          </div>
        </div>
        <div style={{ fontSize: 14, color: '#222', lineHeight: 1.65, marginBottom: 10 }}>{m.body}</div>

        {/* Reply section */}
        {!isAnnouncement && m.teacher_id && (
          hasSent ? (
            <div style={{ fontSize: 12, color: '#27500A', background: '#EAF3DE', padding: '6px 10px', borderRadius: 7 }}>✓ Reply sent</div>
          ) : replyTo?.id === m.id ? (
            <div style={{ borderTop: '0.5px solid #f3f4f6', paddingTop: 10 }}>
              <textarea style={{ ...inp, height: 72, marginBottom: 8, resize: 'vertical' }} value={replyBody} onChange={e => setReplyBody(e.target.value)} placeholder="Write your reply…" autoFocus />
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={sendReply} disabled={sending || !replyBody.trim()}
                  style={{ padding: '6px 14px', background: '#185FA5', color: '#fff', border: 'none', borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: sending ? .5 : 1, fontFamily: 'inherit' }}>
                  {sending ? 'Sending…' : '↩ Send reply'}
                </button>
                <button onClick={() => setReplyTo(null)} style={{ padding: '6px 12px', background: '#f3f4f6', border: 'none', borderRadius: 7, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
              </div>
            </div>
          ) : (
            <button onClick={() => { setReplyTo(m); setReplyBody('') }}
              style={{ fontSize: 12, color: '#185FA5', background: '#E6F1FB', border: '1px solid #B5D4F4', padding: '5px 12px', borderRadius: 7, cursor: 'pointer', fontFamily: 'inherit' }}>
              ↩ Reply
            </button>
          )
        )}
      </div>
    )
  }

  return (
    <div>
      <Breadcrumb items={[{ label: 'Inbox' }]} />
      <PageHeader title="Inbox" sub="Messages and announcements from your teachers" />

      {messages.length === 0 && (
        <div style={{ textAlign: 'center', padding: '48px 20px', color: '#aaa', fontSize: 13, border: '1px dashed #e5e7eb', borderRadius: 12 }}>
          No messages yet.
        </div>
      )}

      {directs.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 10 }}>Direct messages</div>
          {directs.map(m => <MsgCard key={m.id} m={m} />)}
        </div>
      )}

      {announcements.length > 0 && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 10 }}>Announcements</div>
          {announcements.map(m => <MsgCard key={m.id} m={m} />)}
        </div>
      )}
    </div>
  )
}
