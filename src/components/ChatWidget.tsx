'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { emitChatBus, onChatBus } from '@/lib/chatBus'

type Contact = { id: string; full_name: string; role: 'teacher' | 'student'; initials: string }
type Msg = { id: string; sender_id: string; body: string; created_at: string; recipient_type: string; recipient_id: string }

function mkInitials(name: string) {
  return name.split(' ').map(w => w[0] ?? '').join('').toUpperCase().slice(0, 2) || '?'
}

function Avatar({ name, size = 32, bg = '#E6F1FB', color = '#0C447C' }: { name: string; size?: number; bg?: string; color?: string }) {
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: bg, color, fontSize: Math.round(size * 0.35), fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      {mkInitials(name)}
    </div>
  )
}

function recipientType(senderRole: 'teacher' | 'student', targetRole: 'teacher' | 'student') {
  if (senderRole === 'teacher') return targetRole === 'teacher' ? 'teacher' : 'student'
  return targetRole === 'teacher' ? 'teacher' : 'student_direct'
}

// Stable channel name for a conversation between two users (order-independent)
function threadChannel(a: string, b: string) {
  return 'chat:' + [a, b].sort().join(':')
}

export default function ChatWidget({ userId, userRole, contacts }: {
  userId: string
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
  // readUpTo[contactId] = latest created_at we've seen while their thread was open
  // Persisted to localStorage so it survives page navigation and refresh
  const [readUpTo, setReadUpToState] = useState<Record<string, string>>(() => {
    if (typeof window === 'undefined') return {}
    try {
      const stored = localStorage.getItem('cb_read_up_to_' + userId)
      return stored ? JSON.parse(stored) : {}
    } catch { return {} }
  })

  function setReadUpTo(updater: (prev: Record<string, string>) => Record<string, string>) {
    setReadUpToState(prev => {
      const next = updater(prev)
      try { localStorage.setItem('cb_read_up_to_' + userId, JSON.stringify(next)) } catch {}
      return next
    })
  }
  const [allMsgs, setAllMsgs] = useState<Msg[]>([])
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const activeContactRef = useRef<Contact | null>(null)
  const broadcastChannels = useRef<Record<string, any>>({})

  const isMobile = typeof window !== 'undefined' && window.innerWidth < 640

  function scrollBottom() {
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 30)
  }

  // Load historical messages once
  useEffect(() => {
    supabase.from('messages')
      .select('*')
      .or(`sender_id.eq.${userId},recipient_id.eq.${userId}`)
      .in('recipient_type', ['student', 'teacher', 'student_direct'])
      .order('created_at')
      .then(({ data }) => setAllMsgs(data ?? []))
  }, [userId])

  // Sync activeContactRef
  useEffect(() => { activeContactRef.current = activeContact }, [activeContact])

  // Derive thread messages whenever allMsgs or activeContact changes
  useEffect(() => {
    if (!activeContact) return
    const thread = allMsgs.filter(m =>
      (m.sender_id === userId && m.recipient_id === activeContact.id) ||
      (m.sender_id === activeContact.id && m.recipient_id === userId)
    ).sort((a, b) => a.created_at.localeCompare(b.created_at))
    setMsgs(thread)
  }, [allMsgs, activeContact, userId])

  // Subscribe to a broadcast channel for a specific conversation
  function subscribeToBroadcast(contactId: string) {
    const chName = threadChannel(userId, contactId)
    if (broadcastChannels.current[chName]) return // already subscribed

    const ch = supabase.channel(chName)
      .on('broadcast', { event: 'new_message' }, ({ payload }: any) => {
        const m: Msg = payload
        // Ignore own messages (already added optimistically)
        if (m.sender_id === userId) return
        setAllMsgs(prev => {
          if (prev.some(x => x.id === m.id)) return prev
          return [...prev, m]
        })
        // If thread open, mark as read immediately and scroll
        if (activeContactRef.current?.id === m.sender_id) {
          setReadUpTo(prev => ({ ...prev, [m.sender_id]: m.created_at }))
          scrollBottom()
        }
      })
      .on('broadcast', { event: 'delete_message' }, ({ payload }: any) => {
        setAllMsgs(prev => prev.filter(m => m.id !== payload.id))
        setMsgs(prev => prev.filter(m => m.id !== payload.id))
      })
      .subscribe()

    broadcastChannels.current[chName] = ch
  }

  // Subscribe to broadcast channels for all existing conversations
  useEffect(() => {
    const contactsWithHistory = new Set<string>()
    allMsgs.forEach(m => {
      const other = m.sender_id === userId ? m.recipient_id : m.sender_id
      if (other) contactsWithHistory.add(other)
    })
    contactsWithHistory.forEach(cid => subscribeToBroadcast(cid))
  }, [allMsgs])

  // Clean up all channels on unmount
  useEffect(() => {
    return () => {
      Object.values(broadcastChannels.current).forEach(ch => supabase.removeChannel(ch))
    }
  }, [])

  function openThread(contact: Contact) {
    setActiveContact(contact)
    subscribeToBroadcast(contact.id)
    // Mark all messages from this contact as read
    const latest = allMsgs
      .filter(m => m.sender_id === contact.id && m.recipient_id === userId)
      .pop()?.created_at
    if (latest) setReadUpTo(prev => ({ ...prev, [contact.id]: latest }))
    scrollBottom()
    setTimeout(() => inputRef.current?.focus(), 60)
  }

  async function sendMsg() {
    if (!draft.trim() || !activeContact || sending) return
    setSending(true)
    const text = draft.trim()
    setDraft('')

    const rType = recipientType(userRole, activeContact.role)

    // Optimistic message (temp id)
    const optimistic: Msg = {
      id: 'tmp-' + Date.now(),
      sender_id: userId,
      recipient_id: activeContact.id,
      recipient_type: rType,
      body: text,
      created_at: new Date().toISOString(),
    }
    setAllMsgs(prev => [...prev, optimistic])
    scrollBottom()

    const res = await fetch('/api/messages', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipient_type: rType, recipient_id: activeContact.id, message_type: 'direct', text }),
    })

    if (res.ok) {
      const { id: realId } = await res.json()
      const realMsg: Msg = { ...optimistic, id: realId }

      // Replace optimistic with real message
      setAllMsgs(prev => prev.map(m => m.id === optimistic.id ? realMsg : m))

      // Broadcast to recipient's channel so they see it instantly
      const chName = threadChannel(userId, activeContact.id)
      const ch = broadcastChannels.current[chName] ?? supabase.channel(chName)
      broadcastChannels.current[chName] = ch
      await ch.send({ type: 'broadcast', event: 'new_message', payload: realMsg })
      emitChatBus({ event: 'new_message', payload: realMsg })
    } else {
      // Rollback optimistic on error
      setAllMsgs(prev => prev.filter(m => m.id !== optimistic.id))
    }

    setSending(false)
    setTimeout(() => inputRef.current?.focus(), 30)
  }

  async function deleteMsg(id: string) {
    await supabase.from('messages').delete().eq('id', id)
    setAllMsgs(prev => prev.filter(m => m.id !== id))
    // Broadcast deletion to the other side
    if (activeContact) {
      const chName = threadChannel(userId, activeContact.id)
      const ch = broadcastChannels.current[chName]
      if (ch) ch.send({ type: 'broadcast', event: 'delete_message', payload: { id } })
    }
  }

  // Unread count: messages from contact received after readUpTo[contact.id]
  function unreadCount(contactId: string) {
    // Suppress badge if the full Messages/Inbox page currently has this thread open
    try {
      const pageActive = sessionStorage.getItem('cb_page_active_thread')
      if (pageActive === contactId) return 0
    } catch {}
    const readTs = readUpTo[contactId] ?? ''
    return allMsgs.filter(m =>
      m.sender_id === contactId &&
      m.recipient_id === userId &&
      m.created_at > readTs
    ).length
  }

  const totalUnread = contacts.reduce((sum, c) => sum + unreadCount(c.id), 0)

  const recentContacts = contacts.filter(c => c.id !== userId && allMsgs.some(m =>
    (m.sender_id === userId && m.recipient_id === c.id) ||
    (m.sender_id === c.id && m.recipient_id === userId)
  )).sort((a, b) => {
    const getMsgTs = (cid: string) => allMsgs.filter(m =>
      (m.sender_id === userId && m.recipient_id === cid) ||
      (m.sender_id === cid && m.recipient_id === userId)
    ).pop()?.created_at ?? ''
    return getMsgTs(b.id).localeCompare(getMsgTs(a.id))
  })

  const filtered = contacts.filter(c =>
    c.id !== userId &&
    c.full_name.toLowerCase().includes(search.toLowerCase())
  )

  const W = isMobile ? '100vw' : 340
  const H = isMobile ? '100dvh' : 480
  const BOTTOM = isMobile ? 0 : 70
  const RIGHT = isMobile ? 0 : 20

  return (
    <>
      {/* Bubble */}
      {!open && (
        <button onClick={() => setOpen(true)}
          style={{ position: 'fixed', bottom: 20, right: 20, zIndex: 999, width: 52, height: 52, borderRadius: '50%', background: '#185FA5', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 16px rgba(24,95,165,.4)' }}>
          💬
          {totalUnread > 0 && (
            <span style={{ position: 'absolute', top: 0, right: 0, minWidth: 18, height: 18, borderRadius: 9, background: '#e53e3e', color: '#fff', fontSize: 9, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px', border: '2px solid #fff' }}>
              {totalUnread > 9 ? '9+' : totalUnread}
            </span>
          )}
        </button>
      )}

      {/* Panel */}
      {open && (
        <div style={{ position: 'fixed', bottom: BOTTOM, right: RIGHT, width: W, height: H, zIndex: 1000, background: '#fff', border: isMobile ? 'none' : '1px solid #e5e7eb', borderRadius: isMobile ? 0 : 16, boxShadow: '0 12px 40px rgba(0,0,0,.15)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

          {/* Header */}
          <div style={{ background: '#185FA5', color: '#fff', padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
            {activeContact ? (
              <>
                <button onClick={() => setActiveContact(null)} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 18, padding: 0, lineHeight: 1, opacity: .85 }}>←</button>
                <Avatar name={activeContact.full_name} size={28} bg="rgba(255,255,255,.2)" color="#fff" />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{activeContact.full_name}</div>
                  <div style={{ fontSize: 10, opacity: .75 }}>{activeContact.role === 'teacher' ? 'Teacher' : 'Student'}</div>
                </div>
              </>
            ) : (
              <span style={{ fontWeight: 700, fontSize: 15, flex: 1 }}>Messages</span>
            )}
            <button onClick={() => { setOpen(false); setActiveContact(null) }}
              style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 20, lineHeight: 1, opacity: .8, padding: '0 2px' }}>✕</button>
          </div>

          {/* Contact list */}
          {!activeContact && (
            <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
              <div style={{ padding: '10px 12px', borderBottom: '0.5px solid #f3f4f6' }}>
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search people…"
                  style={{ width: '100%', padding: '7px 10px', border: '0.5px solid #e5e7eb', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />
              </div>
              <div style={{ flex: 1, overflowY: 'auto' }}>
                {!search && recentContacts.length > 0 && (
                  <div>
                    <div style={{ padding: '8px 12px 4px', fontSize: 10, fontWeight: 700, color: '#aaa', textTransform: 'uppercase', letterSpacing: '.06em' }}>Recent</div>
                    {recentContacts.map(c => {
                      const lastMsg = allMsgs.filter(m =>
                        (m.sender_id === userId && m.recipient_id === c.id) ||
                        (m.sender_id === c.id && m.recipient_id === userId)
                      ).pop()
                      const uc = unreadCount(c.id)
                      const bg = c.role === 'teacher' ? '#E6F1FB' : '#EAF3DE'
                      const col = c.role === 'teacher' ? '#0C447C' : '#27500A'
                      return (
                        <div key={c.id} onClick={() => openThread(c)}
                          style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', cursor: 'pointer', borderBottom: '0.5px solid #f9fafb', background: 'transparent' }}
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
                <div>
                  <div style={{ padding: '8px 12px 4px', fontSize: 10, fontWeight: 700, color: '#aaa', textTransform: 'uppercase', letterSpacing: '.06em' }}>{search ? 'Results' : 'All contacts'}</div>
                  {filtered.length === 0 && <div style={{ padding: '16px 12px', fontSize: 13, color: '#aaa', textAlign: 'center' }}>No contacts found</div>}
                  {filtered.map(c => {
                    const bg = c.role === 'teacher' ? '#E6F1FB' : '#EAF3DE'
                    const col = c.role === 'teacher' ? '#0C447C' : '#27500A'
                    return (
                      <div key={c.id} onClick={() => openThread(c)}
                        style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', cursor: 'pointer', borderBottom: '0.5px solid #f9fafb', background: 'transparent' }}
                        onMouseEnter={e => (e.currentTarget.style.background = '#f5f9ff')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                        <Avatar name={c.full_name} size={32} bg={bg} color={col} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 500, color: '#111', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.full_name}</div>
                          <div style={{ fontSize: 11, color: '#aaa' }}>{c.role === 'teacher' ? '👨‍🏫 Teacher' : '🎓 Student'}</div>
                        </div>
                        {unreadCount(c.id) > 0 && <span style={{ minWidth: 18, height: 18, borderRadius: 9, background: '#185FA5', color: '#fff', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px', flexShrink: 0 }}>{unreadCount(c.id)}</span>}
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
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ccc', fontSize: 13, paddingTop: 60 }}>
                    Start the conversation 👋
                  </div>
                )}
                {msgs.map(m => {
                  const mine = m.sender_id === userId
                  const isOptimistic = m.id.startsWith('tmp-')
                  return (
                    <div key={m.id} style={{ display: 'flex', justifyContent: mine ? 'flex-end' : 'flex-start', alignItems: 'flex-end', gap: 6 }}>
                      {!mine && <Avatar name={activeContact.full_name} size={22} bg={activeContact.role === 'teacher' ? '#E6F1FB' : '#EAF3DE'} color={activeContact.role === 'teacher' ? '#0C447C' : '#27500A'} />}
                      <div style={{ maxWidth: '78%' }}>
                        <div style={{ background: mine ? '#185FA5' : '#f0f2f5', color: mine ? '#fff' : '#111', borderRadius: mine ? '14px 14px 3px 14px' : '14px 14px 14px 3px', padding: '8px 11px', fontSize: 13, lineHeight: 1.45, wordBreak: 'break-word', opacity: isOptimistic ? .6 : 1 }}>
                          {m.body}
                        </div>
                        <div style={{ fontSize: 9, color: '#bbb', marginTop: 2, textAlign: mine ? 'right' : 'left', display: 'flex', gap: 5, justifyContent: mine ? 'flex-end' : 'flex-start', alignItems: 'center' }}>
                          {isOptimistic ? '…' : new Date(m.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                          {mine && !isOptimistic && <button onClick={() => deleteMsg(m.id)} style={{ color: '#ddd', background: 'none', border: 'none', cursor: 'pointer', fontSize: 9, padding: 0, lineHeight: 1 }}>✕</button>}
                        </div>
                      </div>
                    </div>
                  )
                })}
                <div ref={bottomRef} />
              </div>
              <div style={{ borderTop: '0.5px solid #f0f0f0', padding: '8px 10px', display: 'flex', gap: 8, alignItems: 'flex-end', flexShrink: 0 }}>
                <textarea ref={inputRef} value={draft} onChange={e => setDraft(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMsg() } }}
                  placeholder="Message… (Enter to send)"
                  rows={1}
                  style={{ flex: 1, padding: '8px 10px', border: '0.5px solid #e5e7eb', borderRadius: 18, fontSize: 13, fontFamily: 'inherit', resize: 'none', outline: 'none', lineHeight: 1.4, maxHeight: 80, overflowY: 'auto', boxSizing: 'border-box' }} />
                <button onClick={sendMsg} disabled={sending || !draft.trim()}
                  style={{ width: 34, height: 34, borderRadius: '50%', background: draft.trim() ? '#185FA5' : '#e5e7eb', color: draft.trim() ? '#fff' : '#aaa', border: 'none', cursor: draft.trim() ? 'pointer' : 'default', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'background .15s' }}>
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
