'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Breadcrumb, PageHeader } from '@/components/ui'

export default function StudentInboxClient({ messages: initial, studentId, teacherName }: {
  messages: any[]; studentId: string; teacherName?: string
}) {
  const supabase = createClient()
  const [messages, setMessages] = useState(initial)
  const [activeThread, setActiveThread] = useState<any>(null)
  const [replyBody, setReplyBody] = useState('')
  const [sending, setSending] = useState(false)
  const threadEndRef = useRef<HTMLDivElement>(null)

  // Realtime: new messages arriving
  useEffect(() => {
    const channel = supabase.channel('student-inbox-' + studentId)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'messages',
      }, async (payload: any) => {
        const m = payload.new
        // Only care about messages to this student or all
        if (m.recipient_type === 'student' && m.recipient_id !== studentId) return
        if (m.recipient_type !== 'student' && m.recipient_type !== 'all') return
        if (m.sender_id === studentId) return
        const { data: p } = await supabase.from('profiles').select('id, full_name').eq('id', m.sender_id).single()
        const withMeta = { ...m, sender_name: (p as any)?.full_name ?? 'Teacher', teacher_id: (p as any)?.id }
        setMessages(prev => [withMeta, ...prev])
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [studentId])

  // Realtime: teacher replies in active thread
  useEffect(() => {
    if (!activeThread?.teacher_id) return
    const channel = supabase.channel('thread-' + activeThread.teacher_id + '-' + studentId)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'messages',
        filter: `sender_id=eq.${activeThread.teacher_id}`,
      }, (payload: any) => {
        const m = payload.new
        if (m.recipient_type !== 'student' || m.recipient_id !== studentId) return
        setActiveThread((prev: any) => prev ? { ...prev, messages: [...(prev.messages ?? []), { ...m, _mine: false }] } : prev)
        setTimeout(() => threadEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [activeThread?.teacher_id, studentId])

  async function sendReply() {
    if (!replyBody.trim() || !activeThread?.teacher_id) return
    setSending(true)
    const res = await fetch('/api/messages', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recipient_type: 'teacher',
        recipient_id: activeThread.teacher_id,
        message_type: 'direct',
        subject: 'Re: ' + (activeThread.subject || 'your message'),
        text: replyBody,
      }),
    })
    if (res.ok) {
      const data = await res.json()
      const newMsg = { id: data.id, sender_id: studentId, body: replyBody, created_at: new Date().toISOString(), _mine: true }
      setActiveThread((prev: any) => prev ? { ...prev, messages: [...(prev.messages ?? []), newMsg] } : prev)
      setReplyBody('')
      setTimeout(() => threadEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
    }
    setSending(false)
  }

  async function deleteMsg(id: string) {
    await supabase.from('messages').delete().eq('id', id)
    setMessages(prev => prev.filter(m => m.id !== id))
    if (activeThread) {
      setActiveThread((prev: any) => prev ? { ...prev, messages: (prev.messages ?? []).filter((m: any) => m.id !== id) } : prev)
    }
  }

  const announcements = messages.filter(m => m.message_type === 'announcement' || !m.message_type)
  const directs = messages.filter(m => m.message_type === 'direct')

  // Build thread per teacher
  const threadMap: Record<string, any> = {}
  directs.forEach((m: any) => {
    const tid = m.teacher_id
    if (!tid) return
    if (!threadMap[tid]) threadMap[tid] = { teacher_id: tid, sender_name: m.sender_name, messages: [], subject: m.subject }
    threadMap[tid].messages.push({ ...m, _mine: false })
  })
  const threads = Object.values(threadMap)

  function openThread(t: any) {
    setActiveThread({ ...t, messages: t.messages.sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()) })
    setTimeout(() => threadEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
  }

  if (activeThread) {
    const tName = activeThread.sender_name ?? 'Teacher'
    const tInitials = tName.split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2)
    return (
      <div>
        <Breadcrumb items={[{ label: 'Inbox', href: '/student/inbox' }, { label: tName }]} />
        <div style={{ background: '#fff', border: '0.5px solid #e5e7eb', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', borderBottom: '0.5px solid #f3f4f6', display: 'flex', alignItems: 'center', gap: 10 }}>
            <button onClick={() => setActiveThread(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: '#555', padding: 0, lineHeight: 1 }}>←</button>
            <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#E6F1FB', color: '#0C447C', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{tInitials}</div>
            <span style={{ fontWeight: 600, fontSize: 14 }}>{tName}</span>
          </div>
          <div style={{ maxHeight: 420, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {(activeThread.messages ?? []).map((m: any) => {
              const mine = m._mine || m.sender_id === studentId
              return (
                <div key={m.id} style={{ display: 'flex', justifyContent: mine ? 'flex-end' : 'flex-start', alignItems: 'flex-end', gap: 6 }}>
                  {!mine && <div style={{ width: 26, height: 26, borderRadius: '50%', background: '#E6F1FB', color: '#0C447C', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{tInitials}</div>}
                  <div style={{ maxWidth: '70%' }}>
                    <div style={{ background: mine ? '#185FA5' : '#f3f4f6', color: mine ? '#fff' : '#111', borderRadius: mine ? '12px 12px 2px 12px' : '12px 12px 12px 2px', padding: '8px 12px', fontSize: 13, lineHeight: 1.5 }}>
                      {m.body}
                    </div>
                    <div style={{ fontSize: 10, color: '#bbb', marginTop: 3, textAlign: mine ? 'right' : 'left', display: 'flex', gap: 6, justifyContent: mine ? 'flex-end' : 'flex-start' }}>
                      {new Date(m.created_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      {mine && <button onClick={() => deleteMsg(m.id)} style={{ color: '#ddd', background: 'none', border: 'none', cursor: 'pointer', fontSize: 10, padding: 0 }}>✕</button>}
                    </div>
                  </div>
                </div>
              )
            })}
            <div ref={threadEndRef} />
          </div>
          <div style={{ borderTop: '0.5px solid #f3f4f6', padding: '12px 16px', display: 'flex', gap: 8 }}>
            <textarea value={replyBody} onChange={e => setReplyBody(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendReply() } }}
              placeholder="Write a reply… (Enter to send)"
              style={{ flex: 1, padding: '8px 12px', border: '0.5px solid #e5e7eb', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', resize: 'none', height: 56, outline: 'none' }} />
            <button onClick={sendReply} disabled={sending || !replyBody.trim()}
              style={{ padding: '8px 14px', background: '#185FA5', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: sending || !replyBody.trim() ? .5 : 1, fontFamily: 'inherit', alignSelf: 'flex-end' }}>
              Send ↵
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div>
      <Breadcrumb items={[{ label: 'Inbox' }]} />
      <PageHeader title="Inbox" sub="Messages and announcements from your teachers" />

      {messages.length === 0 && (
        <div style={{ textAlign: 'center', padding: '48px 20px', color: '#aaa', fontSize: 13, border: '1px dashed #e5e7eb', borderRadius: 12 }}>No messages yet.</div>
      )}

      {threads.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 10 }}>Conversations</div>
          {threads.map((t: any) => {
            const last = t.messages[t.messages.length - 1]
            const initials = (t.sender_name ?? '?').split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2)
            return (
              <div key={t.teacher_id} onClick={() => openThread(t)}
                style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#fff', border: '0.5px solid #e5e7eb', borderRadius: 12, padding: '12px 16px', marginBottom: 8, cursor: 'pointer' }}>
                <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#E6F1FB', color: '#0C447C', fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{initials}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14, color: '#111' }}>{t.sender_name}</div>
                  <div style={{ fontSize: 12, color: '#888', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{last?.body}</div>
                </div>
                <div style={{ fontSize: 11, color: '#aaa', flexShrink: 0 }}>
                  {new Date(last?.created_at).toLocaleString('en-GB', { day: 'numeric', month: 'short' })}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {announcements.length > 0 && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 10 }}>Announcements</div>
          {announcements.map((m: any) => (
            <div key={m.id} style={{ background: '#fff', border: '0.5px solid #e5e7eb', borderRadius: 12, padding: '14px 16px', marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#EAF3DE', color: '#27500A', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>📢</div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{m.sender_name}</div>
                    <div style={{ fontSize: 11, color: '#aaa' }}>{new Date(m.created_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</div>
                  </div>
                </div>
                <button onClick={() => deleteMsg(m.id)} style={{ color: '#ddd', background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, padding: '2px 4px' }}>✕</button>
              </div>
              {m.subject && <div style={{ fontSize: 13, fontWeight: 600, color: '#333', marginBottom: 4 }}>{m.subject}</div>}
              <div style={{ fontSize: 14, color: '#222', lineHeight: 1.65 }}>{m.body}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
