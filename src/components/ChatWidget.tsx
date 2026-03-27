'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'

type Contact = { id: string; full_name: string; role: 'teacher' | 'student'; initials: string }
type Msg = { id: string; sender_id: string; body: string; created_at: string; recipient_type: string; recipient_id: string }

function initials(name: string) {
  return name.split(' ').map(w => w[0] ?? '').join('').toUpperCase().slice(0, 2) || '?'
}

function Avatar({ name, size = 32, bg = '#E6F1FB', color = '#0C447C' }: { name: string; size?: number; bg?: string; color?: string }) {
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: bg, color, fontSize: size * 0.35, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      {initials(name)}
    </div>
  )
}

// Determine the correct recipient_type for a message
function recipientType(senderRole: 'teacher' | 'student', targetRole: 'teacher' | 'student') {
  if (senderRole === 'teacher') return targetRole === 'teacher' ? 'teacher' : 'student'
  return targetRole === 'teacher' ? 'teacher' : 'student_direct'
}

export default function ChatWidget({ userId, userName, userRole, contacts }: {
  userId: string
  userName: string
  userRole: 'teacher' | 'student'
  contacts: Contact[]
}) {
  const supabase = createClient()
  const [open, setOpen] = useState(false)
  const [activeContact, setActiveContact] = useState<Contact | null>(null)
  const [search, setSearch] = useState('')
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({})
  const [allMsgs, setAllMsgs] = useState<Msg[]>([])
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 640

  // Load all DM messages on mount
  useEffect(() => {
    async function load() {
      const { data } = await supabase.from('messages')
        .select('*')
        .or(`sender_id.eq.${userId},recipient_id.eq.${userId}`)
        .in('recipient_type', ['student', 'teacher', 'student_direct'])
        .order('created_at')
      setAllMsgs(data ?? [])

      // Count unread (received, not from me)
      const counts: Record<string, number> = {}
      ;(data ?? []).forEach((m: any) => {
        if (m.sender_id === userId) return
        const otherId = m.sender_id
        counts[otherId] = (counts[otherId] ?? 0) + 1
      })
      setUnreadCounts(counts)
    }
    load()
  }, [userId])

  // Realtime subscription for all DMs involving this user
  useEffect(() => {
    const channel = supabase.channel('chat-widget-' + userId)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, async (payload: any) => {
        const m = payload.new
        // Only DM types
        if (!['student', 'teacher', 'student_direct'].includes(m.recipient_type)) return
        // Must involve me
        if (m.sender_id !== userId && m.recipient_id !== userId) return
        setAllMsgs(prev => [...prev, m])
        // Update unread if not from me
        if (m.sender_id !== userId) {
          setUnreadCounts(prev => ({ ...prev, [m.sender_id]: (prev[m.sender_id] ?? 0) + 1 }))
        }
        // If this thread is open, append and scroll
        if (activeContactRef.current?.id === m.sender_id || activeContactRef.current?.id === m.recipient_id) {
          setMsgs(prev => [...prev, m])
          setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 30)
        }
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'messages' }, (payload: any) => {
        const id = payload.old?.id
        setAllMsgs(prev => prev.filter(m => m.id !== id))
        setMsgs(prev => prev.filter(m => m.id !== id))
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [userId])

  // Keep a ref to activeContact for use inside realtime callback
  const activeContactRef = useRef<Contact | null>(null)
  useEffect(() => { activeContactRef.current = activeContact }, [activeContact])

  // When contact is selected, filter messages for that thread
  const openThread = useCallback((contact: Contact) => {
    setActiveContact(contact)
    const threadMsgs = allMsgs.filter(m =>
      (m.sender_id === userId && m.recipient_id === contact.id) ||
      (m.sender_id === contact.id && m.recipient_id === userId)
    ).sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    setMsgs(threadMsgs)
    setUnreadCounts(prev => ({ ...prev, [contact.id]: 0 }))
    setTimeout(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); inputRef.current?.focus() }, 60)
  }, [allMsgs, userId])

  // Update thread messages when allMsgs changes (e.g. new realtime message)
  useEffect(() => {
    if (!activeContact) return
    const threadMsgs = allMsgs.filter(m =>
      (m.sender_id === userId && m.recipient_id === activeContact.id) ||
      (m.sender_id === activeContact.id && m.recipient_id === userId)
    ).sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    setMsgs(threadMsgs)
  }, [allMsgs, activeContact, userId])

  async function sendMsg() {
    if (!draft.trim() || !activeContact || sending) return
    setSending(true)
    const rType = recipientType(userRole, activeContact.role)
    const res = await fetch('/api/messages', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipient_type: rType, recipient_id: activeContact.id, message_type: 'direct', text: draft }),
    })
    if (res.ok) setDraft('')
    setSending(false)
    setTimeout(() => inputRef.current?.focus(), 30)
  }

  async function deleteMsg(id: string) {
    await supabase.from('messages').delete().eq('id', id)
  }

  const totalUnread = Object.values(unreadCounts).reduce((a, b) => a + b, 0)
  const filtered = contacts.filter(c => c.id !== userId && c.full_name.toLowerCase().includes(search.toLowerCase()))

  // Recent contacts sorted by last message time
  const recentContacts = [...contacts].filter(c => c.id !== userId && allMsgs.some(m =>
    (m.sender_id === userId && m.recipient_id === c.id) ||
    (m.sender_id === c.id && m.recipient_id === userId)
  )).sort((a, b) => {
    const la = allMsgs.filter(m => m.sender_id === a.id || m.recipient_id === a.id).pop()?.created_at ?? ''
    const lb = allMsgs.filter(m => m.sender_id === b.id || m.recipient_id === b.id).pop()?.created_at ?? ''
    return lb.localeCompare(la)
  })

  // Layout constants
  const W = isMobile ? '100vw' : 340
  const H = isMobile ? '100dvh' : 480
  const BOTTOM = isMobile ? 0 : 70
  const RIGHT = isMobile ? 0 : 20

  return (
    <>
      {/* Floating bubble button */}
      {!open && (
        <button onClick={() => setOpen(true)}
          style={{ position: 'fixed', bottom: 20, right: 20, zIndex: 999, width: 52, height: 52, borderRadius: '50%', background: '#185FA5', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 16px rgba(24,95,165,.4)', transition: 'transform .15s' }}
          onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.08)')}
          onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}>
          💬
          {totalUnread > 0 && (
            <span style={{ position: 'absolute', top: 0, right: 0, minWidth: 18, height: 18, borderRadius: 9, background: '#e53e3e', color: '#fff', fontSize: 9, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px', border: '2px solid #fff' }}>
              {totalUnread > 9 ? '9+' : totalUnread}
            </span>
          )}
        </button>
      )}

      {/* Chat panel */}
      {open && (
        <div style={{ position: 'fixed', bottom: BOTTOM, right: RIGHT, width: W, height: H, zIndex: 1000, background: '#fff', border: isMobile ? 'none' : '1px solid #e5e7eb', borderRadius: isMobile ? 0 : 16, boxShadow: '0 12px 40px rgba(0,0,0,.15)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

          {/* Header */}
          <div style={{ background: '#185FA5', color: '#fff', padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
            {activeContact ? (
              <>
                <button onClick={() => setActiveContact(null)} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 18, padding: 0, lineHeight: 1, opacity: .8 }}>←</button>
                <Avatar name={activeContact.full_name} size={28} bg="rgba(255,255,255,.2)" color="#fff" />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{activeContact.full_name}</div>
                  <div style={{ fontSize: 10, opacity: .75 }}>{activeContact.role === 'teacher' ? 'Teacher' : 'Student'}</div>
                </div>
              </>
            ) : (
              <>
                <span style={{ fontWeight: 700, fontSize: 15, flex: 1 }}>Messages</span>
              </>
            )}
            <button onClick={() => { setOpen(false); setActiveContact(null) }}
              style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 20, lineHeight: 1, opacity: .8, padding: '0 2px' }}>✕</button>
          </div>

          {/* Contact list */}
          {!activeContact && (
            <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
              {/* Search */}
              <div style={{ padding: '10px 12px', borderBottom: '0.5px solid #f3f4f6' }}>
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search people…"
                  style={{ width: '100%', padding: '7px 10px', border: '0.5px solid #e5e7eb', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />
              </div>
              <div style={{ flex: 1, overflowY: 'auto' }}>
                {/* Recent conversations */}
                {!search && recentContacts.length > 0 && (
                  <div>
                    <div style={{ padding: '8px 12px 4px', fontSize: 10, fontWeight: 700, color: '#aaa', textTransform: 'uppercase', letterSpacing: '.06em' }}>Recent</div>
                    {recentContacts.map(c => {
                      const lastMsg = allMsgs.filter(m => (m.sender_id === userId && m.recipient_id === c.id) || (m.sender_id === c.id && m.recipient_id === userId)).pop()
                      const uc = unreadCounts[c.id] ?? 0
                      const bg = c.role === 'teacher' ? '#E6F1FB' : '#EAF3DE'
                      const col = c.role === 'teacher' ? '#0C447C' : '#27500A'
                      return (
                        <div key={c.id} onClick={() => openThread(c)}
                          style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', cursor: 'pointer', borderBottom: '0.5px solid #f9fafb' }}
                          onMouseEnter={e => (e.currentTarget.style.background = '#f5f9ff')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                          <Avatar name={c.full_name} size={36} bg={bg} color={col} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: uc > 0 ? 700 : 500, fontSize: 13, color: '#111', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.full_name}</div>
                            <div style={{ fontSize: 11, color: '#888', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{lastMsg?.body?.slice(0, 45)}</div>
                          </div>
                          {uc > 0 && <span style={{ minWidth: 18, height: 18, borderRadius: 9, background: '#185FA5', color: '#fff', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px', flexShrink: 0 }}>{uc}</span>}
                        </div>
                      )
                    })}
                  </div>
                )}
                {/* All contacts */}
                <div>
                  <div style={{ padding: '8px 12px 4px', fontSize: 10, fontWeight: 700, color: '#aaa', textTransform: 'uppercase', letterSpacing: '.06em' }}>{search ? 'Results' : 'All contacts'}</div>
                  {filtered.length === 0 && <div style={{ padding: '16px 12px', fontSize: 13, color: '#aaa', textAlign: 'center' }}>No contacts found</div>}
                  {filtered.map(c => {
                    const bg = c.role === 'teacher' ? '#E6F1FB' : '#EAF3DE'
                    const col = c.role === 'teacher' ? '#0C447C' : '#27500A'
                    return (
                      <div key={c.id} onClick={() => openThread(c)}
                        style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', cursor: 'pointer', borderBottom: '0.5px solid #f9fafb' }}
                        onMouseEnter={e => (e.currentTarget.style.background = '#f5f9ff')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                        <Avatar name={c.full_name} size={32} bg={bg} color={col} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 500, color: '#111', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.full_name}</div>
                          <div style={{ fontSize: 11, color: '#aaa' }}>{c.role === 'teacher' ? '👨‍🏫 Teacher' : '🎓 Student'}</div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Thread view */}
          {activeContact && (
            <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
              <div style={{ flex: 1, overflowY: 'auto', padding: '12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {msgs.length === 0 && (
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ccc', fontSize: 13 }}>
                    Start the conversation 👋
                  </div>
                )}
                {msgs.map(m => {
                  const mine = m.sender_id === userId
                  return (
                    <div key={m.id} style={{ display: 'flex', justifyContent: mine ? 'flex-end' : 'flex-start', alignItems: 'flex-end', gap: 6 }}>
                      {!mine && <Avatar name={activeContact.full_name} size={22} bg={activeContact.role === 'teacher' ? '#E6F1FB' : '#EAF3DE'} color={activeContact.role === 'teacher' ? '#0C447C' : '#27500A'} />}
                      <div style={{ maxWidth: '78%' }}>
                        <div style={{ background: mine ? '#185FA5' : '#f0f2f5', color: mine ? '#fff' : '#111', borderRadius: mine ? '14px 14px 3px 14px' : '14px 14px 14px 3px', padding: '8px 11px', fontSize: 13, lineHeight: 1.45, wordBreak: 'break-word' }}>
                          {m.body}
                        </div>
                        <div style={{ fontSize: 9, color: '#bbb', marginTop: 2, textAlign: mine ? 'right' : 'left', display: 'flex', gap: 5, justifyContent: mine ? 'flex-end' : 'flex-start', alignItems: 'center' }}>
                          {new Date(m.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                          {mine && <button onClick={() => deleteMsg(m.id)} style={{ color: '#ddd', background: 'none', border: 'none', cursor: 'pointer', fontSize: 9, padding: 0, lineHeight: 1 }}>✕</button>}
                        </div>
                      </div>
                    </div>
                  )
                })}
                <div ref={bottomRef} />
              </div>
              {/* Input */}
              <div style={{ borderTop: '0.5px solid #f0f0f0', padding: '8px 10px', display: 'flex', gap: 8, alignItems: 'flex-end', flexShrink: 0 }}>
                <textarea ref={inputRef} value={draft} onChange={e => setDraft(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMsg() } }}
                  placeholder="Message… (Enter to send)"
                  rows={1}
                  style={{ flex: 1, padding: '8px 10px', border: '0.5px solid #e5e7eb', borderRadius: 18, fontSize: 13, fontFamily: 'inherit', resize: 'none', outline: 'none', lineHeight: 1.4, maxHeight: 80, overflowY: 'auto' }} />
                <button onClick={sendMsg} disabled={sending || !draft.trim()}
                  style={{ width: 34, height: 34, borderRadius: '50%', background: draft.trim() ? '#185FA5' : '#e5e7eb', color: draft.trim() ? '#fff' : '#aaa', border: 'none', cursor: draft.trim() ? 'pointer' : 'default', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'background .15s' }}>
                  ↑
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  )
}
