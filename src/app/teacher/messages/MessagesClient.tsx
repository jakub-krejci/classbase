'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from 'react'
import { Breadcrumb, PageHeader } from '@/components/ui'

export default function MessagesClient({ sent, received, groups, students, modules, senderId }: {
  sent: any[]; received: any[]; groups: any[]; students: any[]; modules: any[]; senderId: string
}) {
  const [tab, setTab] = useState<'announcements' | 'direct' | 'inbox'>('announcements')
  const [to, setTo] = useState('all')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [sentList, setSentList] = useState(sent)
  const [receivedList, setReceivedList] = useState(received)
  const [replyTo, setReplyTo] = useState<any>(null)
  const [replyBody, setReplyBody] = useState('')

  const inp: React.CSSProperties = { width: '100%', padding: '8px 10px', border: '0.5px solid #e5e7eb', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', outline: 'none', marginBottom: 10, boxSizing: 'border-box' }
  const lbl: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: '#555', display: 'block', marginBottom: 4 }

  async function send(msgType: 'announcement' | 'direct') {
    if (!body.trim()) return
    setSending(true)
    let recipient_type = 'all', recipient_id = null as string | null
    if (to.startsWith('group:')) { recipient_type = 'group'; recipient_id = to.replace('group:', '') }
    else if (to.startsWith('student:')) { recipient_type = 'student'; recipient_id = to.replace('student:', '') }

    const res = await fetch('/api/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipient_type, recipient_id, message_type: msgType, subject, text: body }),
    })
    if (res.ok) {
      const newMsg = { id: (await res.json()).id, recipient_type, recipient_id, message_type: msgType, subject, body, created_at: new Date().toISOString() }
      setSentList(prev => [newMsg, ...prev])
      setBody(''); setSubject('')
    }
    setSending(false)
  }

  async function sendReply() {
    if (!replyBody.trim() || !replyTo) return
    setSending(true)
    await fetch('/api/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipient_type: 'student', recipient_id: replyTo.sender_id, message_type: 'direct', subject: 'Re: ' + (replyTo.subject || 'your message'), text: replyBody }),
    })
    setReplyBody(''); setReplyTo(null)
    setSending(false)
  }

  const announcements = sentList.filter(m => m.message_type === 'announcement' || !m.message_type)
  const directs = sentList.filter(m => m.message_type === 'direct')

  const tabStyle = (t: string): React.CSSProperties => ({
    padding: '7px 16px', fontSize: 13, fontWeight: tab === t ? 600 : 400,
    color: tab === t ? '#185FA5' : '#888', background: 'none', border: 'none',
    borderBottom: tab === t ? '2px solid #185FA5' : '2px solid transparent',
    cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
  })

  return (
    <div>
      <Breadcrumb items={[{ label: 'Messages' }]} />
      <PageHeader title="Messages" sub="Send announcements, direct messages, and reply to students" />

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid #e5e7eb', marginBottom: 20, gap: 0 }}>
        <button style={tabStyle('announcements')} onClick={() => setTab('announcements')}>📢 Announcements</button>
        <button style={tabStyle('direct')} onClick={() => setTab('direct')}>💬 Direct messages</button>
        <button style={tabStyle('inbox')} onClick={() => setTab('inbox')}>
          📥 Student replies {receivedList.length > 0 && <span style={{ background: '#FCEBEB', color: '#791F1F', fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 10, marginLeft: 4 }}>{receivedList.length}</span>}
        </button>
      </div>

      {/* Announcements tab */}
      {tab === 'announcements' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          <div>
            <div style={{ background: '#fff', border: '0.5px solid #e5e7eb', borderRadius: 12, padding: '16px' }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 14 }}>New announcement</div>
              <label style={lbl}>To</label>
              <select style={inp} value={to} onChange={e => setTo(e.target.value)}>
                <option value="all">📣 All students</option>
                {modules.map((m: any) => <option key={'mod:'+m.id} value={'all'}>📚 {m.title} — all enrolled</option>)}
                {groups.map((g: any) => <option key={g.id} value={'group:' + g.id}>👥 Group: {g.name}</option>)}
              </select>
              <label style={lbl}>Subject</label>
              <input style={inp} value={subject} onChange={e => setSubject(e.target.value)} placeholder="e.g. Reminder: assignment due Friday" />
              <label style={lbl}>Message</label>
              <textarea style={{ ...inp, height: 100, resize: 'vertical' }} value={body} onChange={e => setBody(e.target.value)} placeholder="Write your announcement…" />
              <button onClick={() => send('announcement')} disabled={sending || !body.trim()}
                style={{ width: '100%', padding: '10px', background: '#185FA5', color: '#E6F1FB', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: sending || !body.trim() ? .5 : 1 }}>
                {sending ? 'Sending…' : '📢 Send announcement'}
              </button>
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 10 }}>Sent announcements</div>
            {announcements.length === 0 && <p style={{ fontSize: 13, color: '#aaa' }}>No announcements yet.</p>}
            {announcements.map((m: any) => (
              <div key={m.id} style={{ background: '#fff', border: '0.5px solid #e5e7eb', borderRadius: 10, padding: '12px 14px', marginBottom: 8 }}>
                {m.subject && <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>{m.subject}</div>}
                <div style={{ fontSize: 13, color: '#333', lineHeight: 1.5 }}>{m.body}</div>
                <div style={{ fontSize: 10, color: '#aaa', marginTop: 6 }}>
                  To: {m.recipient_type === 'all' ? 'All students' : m.recipient_type} · {new Date(m.created_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Direct messages tab */}
      {tab === 'direct' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          <div>
            <div style={{ background: '#fff', border: '0.5px solid #e5e7eb', borderRadius: 12, padding: '16px' }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 14 }}>New direct message</div>
              <label style={lbl}>To</label>
              <select style={inp} value={to} onChange={e => setTo(e.target.value)}>
                <option value="">— Select student —</option>
                {students.map((s: any) => <option key={s.id} value={'student:' + s.id}>{s.full_name ?? s.email}</option>)}
              </select>
              <label style={lbl}>Subject</label>
              <input style={inp} value={subject} onChange={e => setSubject(e.target.value)} placeholder="Subject" />
              <label style={lbl}>Message</label>
              <textarea style={{ ...inp, height: 100, resize: 'vertical' }} value={body} onChange={e => setBody(e.target.value)} placeholder="Write your message…" />
              <button onClick={() => send('direct')} disabled={sending || !body.trim() || !to.startsWith('student:')}
                style={{ width: '100%', padding: '10px', background: '#185FA5', color: '#E6F1FB', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: sending || !body.trim() || !to.startsWith('student:') ? .5 : 1 }}>
                {sending ? 'Sending…' : '💬 Send message'}
              </button>
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 10 }}>Sent direct messages</div>
            {directs.length === 0 && <p style={{ fontSize: 13, color: '#aaa' }}>No direct messages sent yet.</p>}
            {directs.map((m: any) => {
              const student = students.find((s: any) => s.id === m.recipient_id)
              return (
                <div key={m.id} style={{ background: '#fff', border: '0.5px solid #e5e7eb', borderRadius: 10, padding: '12px 14px', marginBottom: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    {m.subject && <div style={{ fontWeight: 600, fontSize: 13 }}>{m.subject}</div>}
                    <div style={{ fontSize: 11, color: '#888' }}>To: {student?.full_name ?? 'Student'}</div>
                  </div>
                  <div style={{ fontSize: 13, color: '#333', lineHeight: 1.5 }}>{m.body}</div>
                  <div style={{ fontSize: 10, color: '#aaa', marginTop: 6 }}>
                    {new Date(m.created_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Student replies inbox */}
      {tab === 'inbox' && (
        <div style={{ maxWidth: 600 }}>
          {receivedList.length === 0 && <p style={{ fontSize: 13, color: '#aaa' }}>No replies from students yet.</p>}
          {replyTo && (
            <div style={{ background: '#EBF4FF', border: '1px solid #B5D4F4', borderRadius: 10, padding: '14px', marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>Replying to {replyTo.sender_name}…</div>
              <textarea style={{ ...inp, height: 80, marginBottom: 8, background: '#fff' }} value={replyBody} onChange={e => setReplyBody(e.target.value)} placeholder="Your reply…" autoFocus />
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={sendReply} disabled={sending || !replyBody.trim()}
                  style={{ padding: '7px 16px', background: '#185FA5', color: '#fff', border: 'none', borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: sending ? .5 : 1 }}>
                  {sending ? 'Sending…' : 'Send reply'}
                </button>
                <button onClick={() => setReplyTo(null)} style={{ padding: '7px 14px', background: '#f3f4f6', border: 'none', borderRadius: 7, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
              </div>
            </div>
          )}
          {receivedList.map((m: any) => (
            <div key={m.id} style={{ background: '#fff', border: '0.5px solid #e5e7eb', borderRadius: 12, padding: '14px 16px', marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 30, height: 30, borderRadius: '50%', background: '#E6F1FB', color: '#0C447C', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {(m.sender_name ?? '?').split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2)}
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{m.sender_name ?? 'Student'}</div>
                    <div style={{ fontSize: 11, color: '#aaa' }}>{new Date(m.created_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</div>
                  </div>
                </div>
                <button onClick={() => { setReplyTo(m); setReplyBody('') }}
                  style={{ padding: '5px 12px', fontSize: 12, background: '#E6F1FB', color: '#185FA5', border: '1px solid #B5D4F4', borderRadius: 7, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 500 }}>
                  ↩ Reply
                </button>
              </div>
              {m.subject && <div style={{ fontSize: 12, fontWeight: 600, color: '#555', marginBottom: 4 }}>{m.subject}</div>}
              <div style={{ fontSize: 13, color: '#222', lineHeight: 1.6 }}>{m.body}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
