'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Breadcrumb, PageHeader } from '@/components/ui'

export default function MessagesClient({ sent: initSent, received: initReceived, groups, students, modules, senderId }: {
  sent: any[]; received: any[]; groups: any[]; students: any[]; modules: any[]; senderId: string
}) {
  const supabase = createClient()
  const [tab, setTab] = useState<'announcements' | 'direct' | 'inbox'>('announcements')
  const [to, setTo] = useState('all')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [sentList, setSentList] = useState(initSent)
  const [receivedList, setReceivedList] = useState(initReceived)
  const [activeThread, setActiveThread] = useState<any>(null)  // student object
  const [replyBody, setReplyBody] = useState('')
  const threadEndRef = useRef<HTMLDivElement>(null)

  // Realtime: incoming student replies
  useEffect(() => {
    const channel = supabase.channel('teacher-inbox-' + senderId)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'messages',
        filter: `recipient_id=eq.${senderId}`,
      }, async (payload: any) => {
        const m = payload.new
        if (m.recipient_type !== 'teacher') return
        // Fetch sender name
        const { data: p } = await supabase.from('profiles').select('full_name, email').eq('id', m.sender_id).single()
        const withName = { ...m, sender_name: (p as any)?.full_name ?? (p as any)?.email ?? 'Student' }
        setReceivedList(prev => [withName, ...prev])
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [senderId])

  // Scroll thread to bottom when active thread changes
  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [activeThread])

  const inp: React.CSSProperties = { width: '100%', padding: '8px 10px', border: '0.5px solid #e5e7eb', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', outline: 'none', marginBottom: 10, boxSizing: 'border-box' }
  const lbl: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: '#555', display: 'block', marginBottom: 4 }

  async function send(msgType: 'announcement' | 'direct') {
    if (!body.trim()) return
    setSending(true)
    let recipient_type = 'all', recipient_id = null as string | null
    if (to.startsWith('group:')) { recipient_type = 'group'; recipient_id = to.replace('group:', '') }
    else if (to.startsWith('student:')) { recipient_type = 'student'; recipient_id = to.replace('student:', '') }
    const res = await fetch('/api/messages', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipient_type, recipient_id, message_type: msgType, subject, text: body }),
    })
    if (res.ok) {
      const data = await res.json()
      const newMsg = { id: data.id, sender_id: senderId, recipient_type, recipient_id, message_type: msgType, subject, body, created_at: new Date().toISOString() }
      setSentList(prev => [newMsg, ...prev])
      setBody(''); setSubject('')
    }
    setSending(false)
  }

  async function sendThreadReply() {
    if (!replyBody.trim() || !activeThread) return
    setSending(true)
    const res = await fetch('/api/messages', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipient_type: 'student', recipient_id: activeThread.id, message_type: 'direct', subject: 'Re: ' + (activeThread.latestSubject || 'your message'), text: replyBody }),
    })
    if (res.ok) {
      const data = await res.json()
      const newMsg = { id: data.id, sender_id: senderId, recipient_type: 'student', recipient_id: activeThread.id, message_type: 'direct', body: replyBody, created_at: new Date().toISOString(), _mine: true }
      setSentList(prev => [newMsg, ...prev])
      setReplyBody('')
      setTimeout(() => threadEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
    }
    setSending(false)
  }

  async function deleteMsg(id: string, isSent: boolean) {
    await supabase.from('messages').delete().eq('id', id)
    if (isSent) setSentList(prev => prev.filter(m => m.id !== id))
    else setReceivedList(prev => prev.filter(m => m.id !== id))
  }

  const announcements = sentList.filter(m => m.message_type === 'announcement' || !m.message_type)
  const directs = sentList.filter(m => m.message_type === 'direct')

  // Build conversation threads grouped by student
  const threadMap: Record<string, any> = {}
  directs.forEach(m => {
    const sid = m.recipient_id
    if (!sid) return
    const s = students.find((st: any) => st.id === sid)
    if (!threadMap[sid]) threadMap[sid] = { student: s, messages: [], latestSubject: m.subject }
    threadMap[sid].messages.push({ ...m, _mine: true })
  })
  receivedList.forEach(m => {
    const sid = m.sender_id
    if (!threadMap[sid]) {
      const s = students.find((st: any) => st.id === sid) ?? { id: sid, full_name: m.sender_name }
      threadMap[sid] = { student: s, messages: [], latestSubject: m.subject }
    }
    threadMap[sid].messages.push({ ...m, _mine: false })
  })
  const threads = Object.values(threadMap).map((t: any) => ({
    ...t,
    messages: t.messages.sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()),
    last: t.messages[t.messages.length - 1],
  })).sort((a: any, b: any) => new Date(b.last?.created_at ?? 0).getTime() - new Date(a.last?.created_at ?? 0).getTime())

  const tabStyle = (t: string): React.CSSProperties => ({
    padding: '7px 16px', fontSize: 13, fontWeight: tab === t ? 600 : 400,
    color: tab === t ? '#185FA5' : '#888', background: 'none', border: 'none',
    borderBottom: tab === t ? '2px solid #185FA5' : '2px solid transparent',
    cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
  })

  return (
    <div>
      <Breadcrumb items={[{ label: 'Messages' }]} />
      <PageHeader title="Messages" sub="Send announcements and direct messages to students" />

      <div style={{ display: 'flex', borderBottom: '1px solid #e5e7eb', marginBottom: 20 }}>
        <button style={tabStyle('announcements')} onClick={() => setTab('announcements')}>📢 Announcements</button>
        <button style={tabStyle('direct')} onClick={() => setTab('direct')}>
          💬 Conversations {threads.length > 0 && <span style={{ fontSize: 10, background: '#E6F1FB', color: '#0C447C', padding: '1px 6px', borderRadius: 10, marginLeft: 4 }}>{threads.length}</span>}
        </button>
      </div>

      {/* Announcements tab */}
      {tab === 'announcements' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          <div style={{ background: '#fff', border: '0.5px solid #e5e7eb', borderRadius: 12, padding: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 14 }}>New announcement</div>
            <label style={lbl}>To</label>
            <select style={inp} value={to} onChange={e => setTo(e.target.value)}>
              <option value="all">📣 All students</option>
              {groups.map((g: any) => <option key={g.id} value={'group:' + g.id}>👥 Group: {g.name}</option>)}
            </select>
            <label style={lbl}>Subject</label>
            <input style={inp} value={subject} onChange={e => setSubject(e.target.value)} placeholder="e.g. Reminder: assignment due Friday" />
            <label style={lbl}>Message</label>
            <textarea style={{ ...inp, height: 100, resize: 'vertical' }} value={body} onChange={e => setBody(e.target.value)} placeholder="Write your announcement…" />
            <button onClick={() => send('announcement')} disabled={sending || !body.trim()}
              style={{ width: '100%', padding: 10, background: '#185FA5', color: '#E6F1FB', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: sending || !body.trim() ? .5 : 1, fontFamily: 'inherit' }}>
              {sending ? 'Sending…' : '📢 Send announcement'}
            </button>
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 10 }}>Sent ({announcements.length})</div>
            {announcements.length === 0 && <p style={{ fontSize: 13, color: '#aaa' }}>No announcements yet.</p>}
            {announcements.map((m: any) => (
              <div key={m.id} style={{ background: '#fff', border: '0.5px solid #e5e7eb', borderRadius: 10, padding: '12px 14px', marginBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    {m.subject && <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>{m.subject}</div>}
                    <div style={{ fontSize: 13, color: '#333', lineHeight: 1.5 }}>{m.body}</div>
                    <div style={{ fontSize: 10, color: '#aaa', marginTop: 6 }}>
                      To: {m.recipient_type === 'all' ? 'All students' : m.recipient_type} · {new Date(m.created_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                  <button onClick={() => deleteMsg(m.id, true)} style={{ color: '#ccc', background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, padding: '2px 4px', flexShrink: 0 }} title="Delete">✕</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Conversations tab */}
      {tab === 'direct' && (
        <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 0, border: '0.5px solid #e5e7eb', borderRadius: 12, overflow: 'hidden', minHeight: 480 }}>
          {/* Thread list sidebar */}
          <div style={{ borderRight: '0.5px solid #e5e7eb', overflowY: 'auto', background: '#fafafa' }}>
            <div style={{ padding: '12px 14px', borderBottom: '0.5px solid #e5e7eb' }}>
              <button onClick={() => { setActiveThread({ id: '__new__', student: null }); setTo('') }}
                style={{ width: '100%', padding: '7px', background: '#185FA5', color: '#fff', border: 'none', borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                + New message
              </button>
            </div>
            {threads.length === 0 && <div style={{ padding: '20px 14px', fontSize: 13, color: '#aaa', textAlign: 'center' }}>No conversations yet</div>}
            {threads.map((t: any) => {
              const s = t.student
              const initials = (s?.full_name ?? s?.email ?? '?').split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2)
              const isActive = activeThread?.id === s?.id
              const unreadCount = t.messages.filter((m: any) => !m._mine).length
              return (
                <div key={s?.id} onClick={() => setActiveThread({ ...s, messages: t.messages, latestSubject: t.latestSubject })}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', cursor: 'pointer', background: isActive ? '#E6F1FB' : 'transparent', borderBottom: '0.5px solid #f3f4f6', borderLeft: isActive ? '3px solid #185FA5' : '3px solid transparent' }}>
                  <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#E6F1FB', color: '#0C447C', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{initials}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#111', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s?.full_name ?? 'Student'}</div>
                    <div style={{ fontSize: 11, color: '#888', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.last?.body?.slice(0, 40)}</div>
                  </div>
                  {unreadCount > 0 && <span style={{ fontSize: 10, background: '#185FA5', color: '#fff', padding: '1px 5px', borderRadius: 10, flexShrink: 0 }}>{unreadCount}</span>}
                </div>
              )
            })}
          </div>

          {/* Thread / compose panel */}
          <div style={{ display: 'flex', flexDirection: 'column', background: '#fff' }}>
            {!activeThread && (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#aaa', fontSize: 13 }}>
                Select a conversation or start a new message
              </div>
            )}

            {/* New message compose */}
            {activeThread?.id === '__new__' && (
              <div style={{ padding: 20, flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 14, color: '#111' }}>New direct message</div>
                <label style={lbl}>To</label>
                <select style={inp} value={to} onChange={e => setTo(e.target.value)}>
                  <option value="">— Select student —</option>
                  {students.map((s: any) => <option key={s.id} value={'student:' + s.id}>{s.full_name ?? s.email}</option>)}
                </select>
                <label style={lbl}>Subject</label>
                <input style={inp} value={subject} onChange={e => setSubject(e.target.value)} placeholder="Subject" />
                <label style={lbl}>Message</label>
                <textarea style={{ ...inp, height: 120, resize: 'vertical' }} value={body} onChange={e => setBody(e.target.value)} placeholder="Write your message…" autoFocus />
                <button onClick={() => send('direct')} disabled={sending || !body.trim() || !to.startsWith('student:')}
                  style={{ padding: '9px 20px', background: '#185FA5', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: sending || !body.trim() || !to.startsWith('student:') ? .5 : 1, fontFamily: 'inherit' }}>
                  {sending ? 'Sending…' : '💬 Send'}
                </button>
              </div>
            )}

            {/* Existing thread view */}
            {activeThread && activeThread.id !== '__new__' && (() => {
              const threadMsgs = [
                ...directs.filter((m: any) => m.recipient_id === activeThread.id),
                ...receivedList.filter((m: any) => m.sender_id === activeThread.id),
              ].sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
              return (
                <>
                  <div style={{ padding: '12px 16px', borderBottom: '0.5px solid #f3f4f6', fontWeight: 600, fontSize: 14, color: '#111' }}>
                    {activeThread.full_name ?? 'Student'}
                  </div>
                  <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {threadMsgs.map((m: any) => {
                      const mine = m.sender_id === senderId
                      return (
                        <div key={m.id} style={{ display: 'flex', justifyContent: mine ? 'flex-end' : 'flex-start', gap: 6, alignItems: 'flex-end' }}>
                          {!mine && <div style={{ width: 26, height: 26, borderRadius: '50%', background: '#f3f4f6', color: '#555', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            {(activeThread.full_name ?? '?').split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2)}
                          </div>}
                          <div style={{ maxWidth: '70%' }}>
                            <div style={{ background: mine ? '#185FA5' : '#f3f4f6', color: mine ? '#fff' : '#111', borderRadius: mine ? '12px 12px 2px 12px' : '12px 12px 12px 2px', padding: '8px 12px', fontSize: 13, lineHeight: 1.5 }}>
                              {m.body}
                            </div>
                            <div style={{ fontSize: 10, color: '#bbb', marginTop: 3, textAlign: mine ? 'right' : 'left', display: 'flex', alignItems: 'center', justifyContent: mine ? 'flex-end' : 'flex-start', gap: 6 }}>
                              {new Date(m.created_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                              {mine && <button onClick={() => deleteMsg(m.id, true)} style={{ color: '#ddd', background: 'none', border: 'none', cursor: 'pointer', fontSize: 10, padding: 0, lineHeight: 1 }}>✕</button>}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                    <div ref={threadEndRef} />
                  </div>
                  <div style={{ borderTop: '0.5px solid #f3f4f6', padding: '12px 16px', display: 'flex', gap: 8 }}>
                    <textarea value={replyBody} onChange={e => setReplyBody(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendThreadReply() } }}
                      placeholder="Write a reply… (Enter to send, Shift+Enter for new line)"
                      style={{ flex: 1, padding: '8px 12px', border: '0.5px solid #e5e7eb', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', resize: 'none', height: 60, outline: 'none' }} />
                    <button onClick={sendThreadReply} disabled={sending || !replyBody.trim()}
                      style={{ padding: '8px 16px', background: '#185FA5', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: sending || !replyBody.trim() ? .5 : 1, fontFamily: 'inherit', alignSelf: 'flex-end', whiteSpace: 'nowrap' }}>
                      Send ↵
                    </button>
                  </div>
                </>
              )
            })()}
          </div>
        </div>
      )}
    </div>
  )
}
