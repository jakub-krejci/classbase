'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { emitChatBus, onChatBus } from '@/lib/chatBus'
import { Breadcrumb } from '@/components/ui'

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

function OnlineDot({ isOn }: { isOn?: boolean }) {
  return <div style={{ width: 9, height: 9, borderRadius: '50%', background: isOn ? '#22c55e' : '#d1d5db', border: '1.5px solid #fff', flexShrink: 0 }} title={isOn ? 'Online' : 'Offline'} />
}

export default function StudentInboxClient({ messages: initial, announcements: initAnn, studentId }: {
  messages: any[]; announcements: any[]; studentId: string
}) {
  const supabase = createClient()
  const [tab, setTab] = useState<'messages' | 'announcements'>('messages')
  const [dmMsgs, setDmMsgs] = useState<any[]>(initial)
  const [annList, setAnnList] = useState<any[]>(initAnn)
  const [activeContact, setActiveContact] = useState<any>(null)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const activeContactRef = useRef<any>(null)
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 640

  useEffect(() => { activeContactRef.current = activeContact }, [activeContact])

  function scrollBottom() { setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 30) }


  // Online presence
  const [online, setOnline] = useState<Record<string, boolean>>({})
  useEffect(() => {
    const supaPresence = createClient()
    const chs: any[] = []
    Object.values(contactMap).forEach((c: any) => {
      const ch = supaPresence.channel('presence:' + c.id)
        .on('broadcast', { event: 'ping' }, ({ payload }: any) => {
          if (payload.userId !== c.id) return
          setOnline(prev => ({ ...prev, [c.id]: Date.now() - payload.ts < 3 * 60_000 }))
        }).subscribe()
      chs.push(ch)
    })
    return () => chs.forEach(ch => supaPresence.removeChannel(ch))
  }, [dmMsgs.length])

  // Sync messages from ChatWidget into this page
  useEffect(() => {
    const unsub = onChatBus(({ event, payload }) => {
      if (event === 'new_message') {
        const involves = payload.sender_id === studentId || payload.recipient_id === studentId
        if (!involves) return
        setDmMsgs(prev => prev.some(m => m.id === payload.id) ? prev : [...prev, payload])
        if (activeContactRef.current?.id === (payload.sender_id === studentId ? payload.recipient_id : payload.sender_id)) {
          setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 30)
        }
      } else if (event === 'delete_message') {
        setDmMsgs(prev => prev.filter(m => m.id !== payload.id))
      }
    })
    return unsub
  }, [studentId])

  const threadMsgs = activeContact
    ? dmMsgs.filter(m =>
        (m.sender_id === studentId && m.recipient_id === activeContact.id) ||
        (m.sender_id === activeContact.id && m.recipient_id === studentId)
      ).sort((a, b) => a.created_at.localeCompare(b.created_at))
    : []

  function openContact(contact: any) {
    setActiveContact(contact)
    subscribeTo(contact.id)
    setTimeout(scrollBottom, 80)
    setTimeout(() => inputRef.current?.focus(), 80)
    try { sessionStorage.setItem('cb_page_active_thread', contact.id) } catch {}
  }

  function closeContact() {
    setActiveContact(null)
    try { sessionStorage.removeItem('cb_page_active_thread') } catch {}
  }

  async function sendMsg() {
    if (!draft.trim() || !activeContact || sending) return
    setSending(true)
    const text = draft.trim()
    setDraft('')
    const optimistic = { id: 'tmp-' + Date.now(), sender_id: studentId, recipient_id: activeContact.id, recipient_type: activeContact.role === 'teacher' ? 'teacher' : 'student_direct', message_type: 'direct', body: text, created_at: new Date().toISOString() }
    setDmMsgs(prev => [...prev, optimistic])
    scrollBottom()
    const res = await fetch('/api/messages', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipient_type: optimistic.recipient_type, recipient_id: activeContact.id, message_type: 'direct', text }),
    })
    if (res.ok) {
      const { id } = await res.json()
      const real = { ...optimistic, id }
      setDmMsgs(prev => prev.map(m => m.id === optimistic.id ? real : m))
      emitChatBus({ event: 'new_message', payload: real })
    } else {
      setDmMsgs(prev => prev.filter(m => m.id !== optimistic.id))
    }
    setSending(false)
  }

  async function deleteMsg(id: string) {
    await supabase.from('messages').delete().eq('id', id)
    setDmMsgs(prev => prev.filter(m => m.id !== id))
    if (activeContact) {
    }
  }

  // Build conversation list from DMs
  const contactMap: Record<string, any> = {}
  dmMsgs.forEach(m => {
    const otherId = m.sender_id === studentId ? m.recipient_id : m.sender_id
    if (!otherId || otherId === studentId) return
    const senderName = m.sender_name ?? 'Teacher'
    if (!contactMap[otherId]) contactMap[otherId] = { id: otherId, full_name: senderName, role: m.recipient_type === 'teacher' || m.sender_id !== studentId ? 'teacher' : 'student', lastMsg: m, lastTs: m.created_at }
    else if (m.created_at > contactMap[otherId].lastTs) { contactMap[otherId].lastMsg = m; contactMap[otherId].lastTs = m.created_at }
  })
  const conversations = Object.values(contactMap).sort((a: any, b: any) => b.lastTs.localeCompare(a.lastTs))

  const tabBtn = (t: string): React.CSSProperties => ({
    padding: '8px 18px', fontSize: 13, fontWeight: tab === t ? 600 : 400,
    color: tab === t ? '#185FA5' : '#666', background: tab === t ? '#E6F1FB' : 'none',
    border: 'none', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
  })

  const SIDEBAR = 240


  // Real-time: receive new messages
  useEffect(() => {
    const ch = supabase.channel('pg-dm-' + studentId)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'messages',
        filter: `recipient_id=eq.${studentId}`,
      }, (payload: any) => {
        const m = payload.new
        if (!['student', 'teacher', 'student_direct'].includes(m.recipient_type)) return
        setDmMsgs(prev => prev.some((x: any) => x.id === m.id) ? prev : [...prev, m])
        if (activeContactRef.current?.id === m.sender_id) {
          setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 30)
        }
      })
      .on('postgres_changes', {
        event: 'DELETE', schema: 'public', table: 'messages',
      }, (payload: any) => {
        if (payload.old?.id) setDmMsgs((prev: any) => prev.filter((m: any) => m.id !== payload.old.id))
      })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [studentId])


  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 120px)', minHeight: 500 }}>
      <Breadcrumb items={[{ label: 'Inbox' }]} />

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 14, padding: '4px', background: '#f3f4f6', borderRadius: 10, alignSelf: 'flex-start' }}>
        <button style={tabBtn('messages')} onClick={() => { setTab('messages'); closeContact() }}>💬 Messages</button>
        <button style={tabBtn('announcements')} onClick={() => setTab('announcements')}>
          📢 Announcements {annList.length > 0 && <span style={{ fontSize: 10, background: '#E6F1FB', color: '#0C447C', padding: '1px 5px', borderRadius: 8, marginLeft: 4 }}>{annList.length}</span>}
        </button>
      </div>

      {/* ── MESSAGES tab ── */}
      {tab === 'messages' && (
        <div style={{ display: 'flex', flex: 1, border: '0.5px solid #e5e7eb', borderRadius: 14, overflow: 'hidden', background: '#fff', minHeight: 0 }}>

          {/* Sidebar */}
          {(!isMobile || !activeContact) && (
            <div style={{ width: SIDEBAR, flexShrink: 0, borderRight: '0.5px solid #f0f0f0', display: 'flex', flexDirection: 'column', background: '#fafafa' }}>
              <div style={{ padding: '14px 12px', borderBottom: '0.5px solid #f0f0f0' }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#888' }}>Conversations</div>
              </div>
              <div style={{ flex: 1, overflowY: 'auto' }}>
                {conversations.length === 0 && (
                  <div style={{ padding: '24px 12px', fontSize: 12, color: '#bbb', textAlign: 'center' }}>No conversations yet.<br />Use the 💬 chat bubble to start one.</div>
                )}
                {conversations.map((c: any) => {
                  const active = activeContact?.id === c.id
                  const isFromMe = c.lastMsg?.sender_id === studentId
                  const bg = c.role === 'teacher' ? '#E6F1FB' : '#EAF3DE'
                  const col = c.role === 'teacher' ? '#0C447C' : '#27500A'
                  return (
                    <div key={c.id} onClick={() => openContact(c)}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', cursor: 'pointer', background: active ? '#E6F1FB' : 'transparent', borderLeft: active ? '3px solid #185FA5' : '3px solid transparent' }}
                      onMouseEnter={e => { if (!active) e.currentTarget.style.background = '#f0f4ff' }}
                      onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent' }}>
                      <div style={{ position: 'relative' }}>
                        <Avatar name={c.full_name} size={34} bg={bg} col={col} />
                        <div style={{ position: 'absolute', bottom: 0, right: 0 }}><OnlineDot isOn={online[c.id]} /></div>
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#111', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.full_name}</div>
                        <div style={{ fontSize: 11, color: '#888', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {isFromMe ? 'You: ' : ''}{c.lastMsg?.body?.slice(0, 32)}
                        </div>
                      </div>
                      <div style={{ fontSize: 10, color: '#bbb', flexShrink: 0 }}>{fmtTime(c.lastTs)}</div>
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
                  <div style={{ fontSize: 14 }}>Select a conversation or use the chat bubble to start a new one</div>
                </div>
              ) : (
                <>
                  <div style={{ padding: '12px 16px', borderBottom: '0.5px solid #f0f0f0', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                    {isMobile && <button onClick={closeContact} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: '#555', padding: 0 }}>←</button>}
                    <Avatar name={activeContact.full_name} size={32} bg={activeContact.role === 'teacher' ? '#E6F1FB' : '#EAF3DE'} col={activeContact.role === 'teacher' ? '#0C447C' : '#27500A'} />
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 14, color: '#111' }}>{activeContact.full_name}</div>
                      <div style={{ fontSize: 11, color: '#aaa' }}>{activeContact.role === 'teacher' ? 'Teacher' : 'Student'}</div>
                    </div>
                  </div>
                  <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {threadMsgs.length === 0 && (
                      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ddd', fontSize: 13, paddingTop: 60 }}>No messages yet 👋</div>
                    )}
                    {threadMsgs.map(m => {
                      const mine = m.sender_id === studentId
                      const opt = m.id.startsWith('tmp-')
                      return (
                        <div key={m.id} style={{ display: 'flex', justifyContent: mine ? 'flex-end' : 'flex-start', alignItems: 'flex-end', gap: 6 }}>
                          {!mine && <Avatar name={activeContact.full_name} size={24} bg={activeContact.role === 'teacher' ? '#E6F1FB' : '#EAF3DE'} col={activeContact.role === 'teacher' ? '#0C447C' : '#27500A'} />}
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
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {annList.length === 0 && (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: '#bbb', fontSize: 14, border: '1px dashed #e5e7eb', borderRadius: 14 }}>No announcements yet.</div>
          )}
          {annList.map((m: any) => (
            <div key={m.id} style={{ background: '#fff', border: '0.5px solid #e5e7eb', borderRadius: 14, padding: '16px 18px', marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 10 }}>
                <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#EAF3DE', color: '#27500A', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>📢</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 14, color: '#111' }}>{m.sender_name ?? 'Teacher'}</div>
                  <div style={{ fontSize: 11, color: '#bbb' }}>{fmtTime(m.created_at)}</div>
                </div>
              </div>
              {m.subject && <div style={{ fontWeight: 600, fontSize: 14, color: '#111', marginBottom: 6 }}>{m.subject}</div>}
              <div style={{ fontSize: 14, color: '#333', lineHeight: 1.7 }}>{m.body}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
