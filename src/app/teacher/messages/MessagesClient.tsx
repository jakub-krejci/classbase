'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Breadcrumb } from '@/components/ui'

// ── helpers ──────────────────────────────────────────────────────────────────
function mkInitials(name: string) {
  return name.split(' ').map(w => w[0] ?? '').join('').toUpperCase().slice(0, 2) || '?'
}
function Avatar({ name, size = 34, bg = '#E6F1FB', col = '#0C447C' }: { name: string; size?: number; bg?: string; col?: string }) {
  return <div style={{ width: size, height: size, borderRadius: '50%', background: bg, color: col, fontSize: Math.round(size * 0.35), fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{mkInitials(name)}</div>
}
function fmtTime(ts: string) {
  const d = new Date(ts)
  const now = new Date()
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}
function threadChannel(a: string, b: string) { return 'chat:' + [a, b].sort().join(':') }

// ── component ─────────────────────────────────────────────────────────────────
export default function MessagesClient({ sent: initSent, received: initReceived, groups, students, senderId }: {
  sent: any[]; received: any[]; groups: any[]; students: any[]; senderId: string
}) {
  const supabase = createClient()

  // ── tab / layout ──────────────────────────────────────────────────────────
  const [tab, setTab] = useState<'messages' | 'announcements'>('messages')
  const [activeContact, setActiveContact] = useState<any>(null)
  const [search, setSearch] = useState('')
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 640

  // ── all DM messages (sent + received) ────────────────────────────────────
  const initDMs = [
    ...initSent.filter(m => m.message_type === 'direct'),
    ...initReceived,
  ]
  const [dmMsgs, setDmMsgs] = useState<any[]>(initDMs)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const activeContactRef = useRef<any>(null)
  const broadcastChannels = useRef<Record<string, any>>({})

  // ── announcements ─────────────────────────────────────────────────────────
  const [announcements, setAnnouncements] = useState(initSent.filter(m => m.message_type === 'announcement' || !m.message_type))
  const [annTo, setAnnTo] = useState('all')
  const [annSubject, setAnnSubject] = useState('')
  const [annBody, setAnnBody] = useState('')
  const [annSending, setAnnSending] = useState(false)

  useEffect(() => { activeContactRef.current = activeContact }, [activeContact])

  function scrollBottom() { setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 30) }

  // ── subscribe to broadcast for a contact ──────────────────────────────────
  function subscribeTo(contactId: string) {
    const chName = threadChannel(senderId, contactId)
    if (broadcastChannels.current[chName]) return
    const ch = supabase.channel(chName)
      .on('broadcast', { event: 'new_message' }, ({ payload }: any) => {
        if (payload.sender_id === senderId) return
        setDmMsgs(prev => prev.some(m => m.id === payload.id) ? prev : [...prev, payload])
        if (activeContactRef.current?.id === payload.sender_id) scrollBottom()
      })
      .on('broadcast', { event: 'delete_message' }, ({ payload }: any) => {
        setDmMsgs(prev => prev.filter(m => m.id !== payload.id))
      })
      .subscribe()
    broadcastChannels.current[chName] = ch
  }

  useEffect(() => {
    const ids = new Set<string>()
    dmMsgs.forEach(m => {
      const other = m.sender_id === senderId ? m.recipient_id : m.sender_id
      if (other) ids.add(other)
    })
    ids.forEach(subscribeTo)
  }, [dmMsgs])

  useEffect(() => () => { Object.values(broadcastChannels.current).forEach(ch => supabase.removeChannel(ch)) }, [])

  // ── thread messages for active contact ───────────────────────────────────
  const threadMsgs = activeContact
    ? dmMsgs.filter(m =>
        (m.sender_id === senderId && m.recipient_id === activeContact.id) ||
        (m.sender_id === activeContact.id && m.recipient_id === senderId)
      ).sort((a, b) => a.created_at.localeCompare(b.created_at))
    : []

  function openContact(contact: any) {
    setActiveContact(contact)
    subscribeTo(contact.id)
    setTimeout(scrollBottom, 80)
    setTimeout(() => inputRef.current?.focus(), 80)
  }

  async function sendMsg() {
    if (!draft.trim() || !activeContact || sending) return
    setSending(true)
    const text = draft.trim()
    setDraft('')
    const optimistic = { id: 'tmp-' + Date.now(), sender_id: senderId, recipient_id: activeContact.id, recipient_type: 'student', message_type: 'direct', body: text, created_at: new Date().toISOString() }
    setDmMsgs(prev => [...prev, optimistic])
    scrollBottom()
    const res = await fetch('/api/messages', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipient_type: 'student', recipient_id: activeContact.id, message_type: 'direct', text }),
    })
    if (res.ok) {
      const { id } = await res.json()
      const real = { ...optimistic, id }
      setDmMsgs(prev => prev.map(m => m.id === optimistic.id ? real : m))
      const chName = threadChannel(senderId, activeContact.id)
      const ch = broadcastChannels.current[chName] ?? supabase.channel(chName)
      broadcastChannels.current[chName] = ch
      await ch.send({ type: 'broadcast', event: 'new_message', payload: real })
    } else {
      setDmMsgs(prev => prev.filter(m => m.id !== optimistic.id))
    }
    setSending(false)
  }

  async function deleteMsg(id: string) {
    await supabase.from('messages').delete().eq('id', id)
    setDmMsgs(prev => prev.filter(m => m.id !== id))
    if (activeContact) {
      const ch = broadcastChannels.current[threadChannel(senderId, activeContact.id)]
      if (ch) ch.send({ type: 'broadcast', event: 'delete_message', payload: { id } })
    }
  }

  async function sendAnnouncement() {
    if (!annBody.trim()) return
    setAnnSending(true)
    let recipient_type = 'all', recipient_id = null as string | null
    if (annTo.startsWith('group:')) { recipient_type = 'group'; recipient_id = annTo.replace('group:', '') }
    const res = await fetch('/api/messages', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipient_type, recipient_id, message_type: 'announcement', subject: annSubject, text: annBody }),
    })
    if (res.ok) {
      const { id } = await res.json()
      setAnnouncements(prev => [{ id, sender_id: senderId, recipient_type, recipient_id, message_type: 'announcement', subject: annSubject, body: annBody, created_at: new Date().toISOString() }, ...prev])
      setAnnSubject(''); setAnnBody('')
    }
    setAnnSending(false)
  }

  async function deleteAnn(id: string) {
    await supabase.from('messages').delete().eq('id', id)
    setAnnouncements(prev => prev.filter(m => m.id !== id))
  }

  // ── conversation list ─────────────────────────────────────────────────────
  const contactMap: Record<string, any> = {}
  dmMsgs.forEach(m => {
    const otherId = m.sender_id === senderId ? m.recipient_id : m.sender_id
    if (!otherId || otherId === senderId) return
    const s = students.find((st: any) => st.id === otherId) ?? { id: otherId, full_name: m.sender_name ?? 'Student', email: '' }
    if (!contactMap[otherId]) contactMap[otherId] = { ...s, lastMsg: m, lastTs: m.created_at }
    else if (m.created_at > contactMap[otherId].lastTs) { contactMap[otherId].lastMsg = m; contactMap[otherId].lastTs = m.created_at }
  })
  const conversations = Object.values(contactMap).sort((a: any, b: any) => b.lastTs.localeCompare(a.lastTs))
  const filteredStudents = students.filter((s: any) => s.full_name?.toLowerCase().includes(search.toLowerCase()) || s.email?.toLowerCase().includes(search.toLowerCase()))

  // ── styles ────────────────────────────────────────────────────────────────
  const tabBtn = (t: string): React.CSSProperties => ({
    padding: '8px 18px', fontSize: 13, fontWeight: tab === t ? 600 : 400,
    color: tab === t ? '#185FA5' : '#666', background: tab === t ? '#E6F1FB' : 'none',
    border: 'none', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
  })
  const inp: React.CSSProperties = { width: '100%', padding: '8px 10px', border: '0.5px solid #e5e7eb', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', outline: 'none', marginBottom: 10, boxSizing: 'border-box' }
  const lbl: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: '#555', display: 'block', marginBottom: 4 }

  const SIDEBAR = 260

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 120px)', minHeight: 500 }}>
      <Breadcrumb items={[{ label: tab === 'messages' ? 'Messages' : 'Announcements' }]} />

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 14, padding: '4px', background: '#f3f4f6', borderRadius: 10, alignSelf: 'flex-start' }}>
        <button style={tabBtn('messages')} onClick={() => { setTab('messages'); setActiveContact(null) }}>💬 Messages</button>
        <button style={tabBtn('announcements')} onClick={() => setTab('announcements')}>📢 Announcements</button>
      </div>

      {/* ── MESSAGES tab ── */}
      {tab === 'messages' && (
        <div style={{ display: 'flex', flex: 1, border: '0.5px solid #e5e7eb', borderRadius: 14, overflow: 'hidden', background: '#fff', minHeight: 0 }}>

          {/* Sidebar */}
          {(!isMobile || !activeContact) && (
            <div style={{ width: SIDEBAR, flexShrink: 0, borderRight: '0.5px solid #f0f0f0', display: 'flex', flexDirection: 'column', background: '#fafafa' }}>
              <div style={{ padding: '12px 10px', borderBottom: '0.5px solid #f0f0f0' }}>
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search students…"
                  style={{ width: '100%', padding: '7px 10px', border: '0.5px solid #e5e7eb', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box', background: '#fff' }} />
              </div>
              <div style={{ flex: 1, overflowY: 'auto' }}>
                {/* Recent conversations */}
                {!search && conversations.length > 0 && (
                  <>
                    <div style={{ padding: '8px 12px 4px', fontSize: 10, fontWeight: 700, color: '#bbb', textTransform: 'uppercase', letterSpacing: '.06em' }}>Recent</div>
                    {conversations.map((c: any) => {
                      const active = activeContact?.id === c.id
                      const lastBody = c.lastMsg?.body ?? ''
                      const isFromMe = c.lastMsg?.sender_id === senderId
                      return (
                        <div key={c.id} onClick={() => openContact(c)}
                          style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', cursor: 'pointer', background: active ? '#E6F1FB' : 'transparent', borderLeft: active ? '3px solid #185FA5' : '3px solid transparent' }}
                          onMouseEnter={e => { if (!active) e.currentTarget.style.background = '#f0f4ff' }}
                          onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent' }}>
                          <Avatar name={c.full_name} size={34} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: '#111', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.full_name}</div>
                            <div style={{ fontSize: 11, color: '#888', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {isFromMe ? 'You: ' : ''}{lastBody.slice(0, 36)}
                            </div>
                          </div>
                          <div style={{ fontSize: 10, color: '#bbb', flexShrink: 0 }}>{fmtTime(c.lastTs)}</div>
                        </div>
                      )
                    })}
                    <div style={{ height: 1, background: '#f0f0f0', margin: '4px 0' }} />
                  </>
                )}
                {/* All students */}
                <div style={{ padding: '8px 12px 4px', fontSize: 10, fontWeight: 700, color: '#bbb', textTransform: 'uppercase', letterSpacing: '.06em' }}>
                  {search ? 'Results' : 'All students'}
                </div>
                {filteredStudents.length === 0 && <div style={{ padding: '12px', fontSize: 12, color: '#bbb', textAlign: 'center' }}>No students found</div>}
                {filteredStudents.map((s: any) => {
                  const active = activeContact?.id === s.id
                  return (
                    <div key={s.id} onClick={() => openContact(s)}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', cursor: 'pointer', background: active ? '#E6F1FB' : 'transparent', borderLeft: active ? '3px solid #185FA5' : '3px solid transparent' }}
                      onMouseEnter={e => { if (!active) e.currentTarget.style.background = '#f0f4ff' }}
                      onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent' }}>
                      <Avatar name={s.full_name} size={30} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 500, color: '#111', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.full_name}</div>
                        <div style={{ fontSize: 11, color: '#aaa', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.email}</div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Thread panel */}
          {(!isMobile || activeContact) && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
              {!activeContact ? (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#ccc', gap: 10 }}>
                  <div style={{ fontSize: 40 }}>💬</div>
                  <div style={{ fontSize: 14 }}>Select a student to start messaging</div>
                </div>
              ) : (
                <>
                  {/* Thread header */}
                  <div style={{ padding: '12px 16px', borderBottom: '0.5px solid #f0f0f0', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                    {isMobile && <button onClick={() => setActiveContact(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: '#555', padding: 0 }}>←</button>}
                    <Avatar name={activeContact.full_name} size={32} />
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 14, color: '#111' }}>{activeContact.full_name}</div>
                      <div style={{ fontSize: 11, color: '#aaa' }}>{activeContact.email}</div>
                    </div>
                  </div>
                  {/* Messages */}
                  <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {threadMsgs.length === 0 && (
                      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ddd', fontSize: 13, paddingTop: 60 }}>
                        No messages yet — say hello 👋
                      </div>
                    )}
                    {threadMsgs.map(m => {
                      const mine = m.sender_id === senderId
                      const opt = m.id.startsWith('tmp-')
                      return (
                        <div key={m.id} style={{ display: 'flex', justifyContent: mine ? 'flex-end' : 'flex-start', alignItems: 'flex-end', gap: 6 }}>
                          {!mine && <Avatar name={activeContact.full_name} size={24} />}
                          <div style={{ maxWidth: '72%' }}>
                            <div style={{ background: mine ? '#185FA5' : '#f0f2f5', color: mine ? '#fff' : '#111', borderRadius: mine ? '14px 14px 3px 14px' : '14px 14px 14px 3px', padding: '9px 13px', fontSize: 13, lineHeight: 1.5, wordBreak: 'break-word', opacity: opt ? .6 : 1 }}>
                              {m.body}
                            </div>
                            <div style={{ fontSize: 10, color: '#bbb', marginTop: 3, textAlign: mine ? 'right' : 'left', display: 'flex', gap: 5, justifyContent: mine ? 'flex-end' : 'flex-start', alignItems: 'center' }}>
                              {opt ? '…' : fmtTime(m.created_at)}
                              {mine && !opt && <button onClick={() => deleteMsg(m.id)} style={{ color: '#ddd', background: 'none', border: 'none', cursor: 'pointer', fontSize: 10, padding: 0 }}>✕</button>}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                    <div ref={bottomRef} />
                  </div>
                  {/* Input */}
                  <div style={{ borderTop: '0.5px solid #f0f0f0', padding: '10px 14px', display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
                    <input ref={inputRef} value={draft} onChange={e => setDraft(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); sendMsg() } }}
                      placeholder={`Message ${activeContact.full_name}…`}
                      style={{ flex: 1, padding: '9px 14px', border: '0.5px solid #e5e7eb', borderRadius: 22, fontSize: 13, fontFamily: 'inherit', outline: 'none' }} />
                    <button onClick={sendMsg} disabled={sending || !draft.trim()}
                      style={{ width: 36, height: 36, borderRadius: '50%', background: draft.trim() ? '#185FA5' : '#e5e7eb', color: draft.trim() ? '#fff' : '#aaa', border: 'none', cursor: draft.trim() ? 'pointer' : 'default', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>↑</button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── ANNOUNCEMENTS tab ── */}
      {tab === 'announcements' && (
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '380px 1fr', gap: 16, flex: 1, minHeight: 0 }}>
          {/* Compose */}
          <div style={{ background: '#fff', border: '0.5px solid #e5e7eb', borderRadius: 14, padding: 20, display: 'flex', flexDirection: 'column', gap: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#111', marginBottom: 16 }}>New announcement</div>
            <label style={lbl}>To</label>
            <select style={inp} value={annTo} onChange={e => setAnnTo(e.target.value)}>
              <option value="all">📣 All students</option>
              {groups.map((g: any) => <option key={g.id} value={'group:' + g.id}>👥 {g.name}</option>)}
            </select>
            <label style={lbl}>Subject <span style={{ fontWeight: 400, color: '#bbb' }}>(optional)</span></label>
            <input style={inp} value={annSubject} onChange={e => setAnnSubject(e.target.value)} placeholder="e.g. Assignment reminder" />
            <label style={lbl}>Message</label>
            <textarea style={{ ...inp, height: 120, resize: 'vertical', marginBottom: 14 }} value={annBody} onChange={e => setAnnBody(e.target.value)} placeholder="Write your announcement…" />
            <button onClick={sendAnnouncement} disabled={annSending || !annBody.trim()}
              style={{ padding: '10px', background: '#185FA5', color: '#fff', border: 'none', borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: annBody.trim() ? 'pointer' : 'default', opacity: !annBody.trim() || annSending ? .5 : 1, fontFamily: 'inherit' }}>
              {annSending ? 'Sending…' : '📢 Send announcement'}
            </button>
          </div>
          {/* Sent list */}
          <div style={{ overflowY: 'auto', paddingRight: 2 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#bbb', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 10 }}>Sent ({announcements.length})</div>
            {announcements.length === 0 && (
              <div style={{ textAlign: 'center', padding: '40px 20px', color: '#ccc', fontSize: 13, border: '1px dashed #e5e7eb', borderRadius: 12 }}>No announcements sent yet.</div>
            )}
            {announcements.map((m: any) => (
              <div key={m.id} style={{ background: '#fff', border: '0.5px solid #e5e7eb', borderRadius: 12, padding: '14px 16px', marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: m.subject ? 6 : 4 }}>
                      <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 8, background: '#EAF3DE', color: '#27500A' }}>
                        {m.recipient_type === 'all' ? '📣 All students' : m.recipient_type === 'group' ? '👥 Group' : m.recipient_type}
                      </span>
                      <span style={{ fontSize: 11, color: '#bbb' }}>{fmtTime(m.created_at)}</span>
                    </div>
                    {m.subject && <div style={{ fontWeight: 600, fontSize: 14, color: '#111', marginBottom: 4 }}>{m.subject}</div>}
                    <div style={{ fontSize: 13, color: '#444', lineHeight: 1.6 }}>{m.body}</div>
                  </div>
                  <button onClick={() => deleteAnn(m.id)} style={{ color: '#ddd', background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, padding: '2px 4px', flexShrink: 0, lineHeight: 1 }}>✕</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
