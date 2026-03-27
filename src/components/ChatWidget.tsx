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
function threadChannel(a: string, b: string) { return 'chat:' + [a, b].sort().join(':') }
function recipientType(senderRole: 'teacher' | 'student', targetRole: 'teacher' | 'student') {
  if (senderRole === 'teacher') return targetRole === 'teacher' ? 'teacher' : 'student'
  return targetRole === 'teacher' ? 'teacher' : 'student_direct'
}

export default function ChatWidget({ userId, userRole, contacts }: {
  userId: string; userRole: 'teacher' | 'student'; contacts: Contact[]
}) {
  const supabase = createClient()
  const [open, setOpen] = useState(false)
  const [activeContact, setActiveContact] = useState<Contact | null>(null)
  const [search, setSearch] = useState('')
  const [allMsgs, setAllMsgs] = useState<Msg[]>([])
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [online, setOnline] = useState<Record<string, boolean>>({})

  // readUpTo[contactId] = ISO timestamp of last message we've seen from them
  const [readUpTo, setReadUpToRaw] = useState<Record<string, string>>(() => {
    try { const s = localStorage.getItem('cb_rut_' + userId); return s ? JSON.parse(s) : {} } catch { return {} }
  })
  function setReadUpTo(fn: (p: Record<string, string>) => Record<string, string>) {
    setReadUpToRaw(p => {
      const n = fn(p)
      try { localStorage.setItem('cb_rut_' + userId, JSON.stringify(n)) } catch {}
      return n
    })
  }

  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const activeContactRef = useRef<Contact | null>(null)
  const openRef = useRef(false)
  // broadcast channels for optimistic delivery (best-effort, not relied upon for unread)
  const bcastChannels = useRef<Record<string, any>>({})

  const isMobile = typeof window !== 'undefined' && window.innerWidth < 640
  function scrollBottom() { setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 30) }
  useEffect(() => { activeContactRef.current = activeContact }, [activeContact])
  useEffect(() => { openRef.current = open }, [open])

  // ── Load historical messages once ──────────────────────────────────────
  useEffect(() => {
    supabase.from('messages')
      .select('*')
      .or(`sender_id.eq.${userId},recipient_id.eq.${userId}`)
      .in('recipient_type', ['student', 'teacher', 'student_direct'])
      .order('created_at')
      .then(({ data }) => setAllMsgs(data ?? []))
  }, [userId])

  // ── postgres_changes: reliable delivery for incoming messages ──────────
  // This fires regardless of when we subscribe — messages are stored in DB first.
  useEffect(() => {
    const ch = supabase.channel('widget-inbox-' + userId)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'messages',
      }, (payload: any) => {
        const m = payload.new as Msg
        // Only DMs addressed to me
        if (m.recipient_id !== userId) return
        if (!['student', 'teacher', 'student_direct'].includes(m.recipient_type)) return
        // Don't add my own sent messages (already in state via optimistic)
        if (m.sender_id === userId) return
        setAllMsgs(prev => prev.some(x => x.id === m.id) ? prev : [...prev, m])
        // Mark read if thread is open
        if (activeContactRef.current?.id === m.sender_id && openRef.current) {
          setReadUpTo(prev => ({ ...prev, [m.sender_id]: m.created_at }))
          scrollBottom()
        }
      })
      .on('postgres_changes', {
        event: 'DELETE', schema: 'public', table: 'messages',
      }, (payload: any) => {
        const id = payload.old?.id
        if (id) setAllMsgs(prev => prev.filter(m => m.id !== id))
      })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [userId])

  // ── Bus: sync with Messages/Inbox page ────────────────────────────────
  useEffect(() => {
    return onChatBus(({ event, payload }) => {
      if (event === 'new_message') {
        const involves = payload.sender_id === userId || payload.recipient_id === userId
        if (!involves) return
        setAllMsgs(prev => prev.some(m => m.id === payload.id) ? prev : [...prev, payload])
        const other = payload.sender_id === userId ? payload.recipient_id : payload.sender_id
        if (activeContactRef.current?.id === other && openRef.current && payload.sender_id !== userId) {
          setReadUpTo(prev => ({ ...prev, [other]: payload.created_at }))
          scrollBottom()
        }
      } else if (event === 'delete_message') {
        setAllMsgs(prev => prev.filter(m => m.id !== payload.id))
      }
    })
  }, [userId])

  // ── Presence: broadcast ping every 60s, listen to contacts ────────────
  useEffect(() => {
    if (!contacts.length) return
    // Announce ourselves
    const myCh = supabase.channel('presence:' + userId)
    const ping = () => myCh.send({ type: 'broadcast', event: 'ping', payload: { ts: Date.now() } })
    myCh.subscribe(s => { if (s === 'SUBSCRIBED') { ping(); } })
    const t = setInterval(ping, 60_000)

    // Listen to each contact's presence channel
    const chs: any[] = []
    contacts.forEach(c => {
      const ch = supabase.channel('presence:' + c.id)
        .on('broadcast', { event: 'ping' }, ({ payload }: any) => {
          setOnline(prev => ({ ...prev, [c.id]: Date.now() - (payload.ts ?? 0) < 3 * 60_000 }))
        })
        .subscribe()
      chs.push(ch)
    })

    return () => {
      clearInterval(t)
      supabase.removeChannel(myCh)
      chs.forEach(ch => supabase.removeChannel(ch))
    }
  }, [contacts.map(c => c.id).join(',')])

  // ── Thread messages for active contact ─────────────────────────────────
  const threadMsgs = activeContact
    ? allMsgs
        .filter(m =>
          (m.sender_id === userId && m.recipient_id === activeContact.id) ||
          (m.sender_id === activeContact.id && m.recipient_id === userId)
        )
        .sort((a, b) => a.created_at.localeCompare(b.created_at))
    : []

  function openThread(contact: Contact) {
    setActiveContact(contact)
    const latest = allMsgs
      .filter(m => m.sender_id === contact.id && m.recipient_id === userId)
      .pop()?.created_at
    if (latest) setReadUpTo(prev => ({ ...prev, [contact.id]: latest }))
    scrollBottom()
    setTimeout(() => inputRef.current?.focus(), 60)
  }

  // ── Send ───────────────────────────────────────────────────────────────
  async function sendMsg() {
    if (!draft.trim() || !activeContact || sending) return
    setSending(true)
    const text = draft.trim()
    setDraft('')
    const rType = recipientType(userRole, activeContact.role)
    const optimistic: Msg = {
      id: 'tmp-' + Date.now(), sender_id: userId,
      recipient_id: activeContact.id, recipient_type: rType,
      body: text, created_at: new Date().toISOString(),
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
      setAllMsgs(prev => prev.map(m => m.id === optimistic.id ? realMsg : m))

      // Best-effort broadcast for faster delivery (recipient may or may not be subscribed)
      const chName = threadChannel(userId, activeContact.id)
      if (!bcastChannels.current[chName]) {
        bcastChannels.current[chName] = supabase.channel(chName)
        bcastChannels.current[chName].subscribe()
      }
      bcastChannels.current[chName].send({ type: 'broadcast', event: 'msg', payload: realMsg })
      emitChatBus({ event: 'new_message', payload: realMsg })
    } else {
      setAllMsgs(prev => prev.filter(m => m.id !== optimistic.id))
    }
    setSending(false)
    setTimeout(() => inputRef.current?.focus(), 30)
  }

  async function deleteMsg(id: string) {
    await supabase.from('messages').delete().eq('id', id)
    // postgres_changes DELETE will handle removal for both sides
    setAllMsgs(prev => prev.filter(m => m.id !== id))
    emitChatBus({ event: 'delete_message', payload: { id } })
  }

  // ── Unread count ───────────────────────────────────────────────────────
  function unreadCount(contactId: string) {
    // Thread open in widget → 0
    if (activeContactRef.current?.id === contactId && openRef.current) return 0
    // Thread open on full page → 0
    try { if (sessionStorage.getItem('cb_page_active_thread') === contactId) return 0 } catch {}
    const readTs = readUpTo[contactId] ?? ''
    return allMsgs.filter(m =>
      m.sender_id === contactId &&
      m.recipient_id === userId &&
      m.created_at > readTs
    ).length
  }

  const totalUnread = (() => {
    if (open) return 0
    try { if (sessionStorage.getItem('cb_page_active_thread')) return 0 } catch {}
    const senders = new Set(
      allMsgs.filter(m => m.sender_id !== userId && m.recipient_id === userId).map(m => m.sender_id)
    )
    return [...senders].reduce((sum, sid) => sum + unreadCount(sid), 0)
  })()

  // ── Conversation list ──────────────────────────────────────────────────
  const contactMap: Record<string, any> = {}
  allMsgs.forEach(m => {
    const other = m.sender_id === userId ? m.recipient_id : m.sender_id
    if (!other || other === userId) return
    const contact = contacts.find(c => c.id === other)
    if (!contactMap[other]) {
      contactMap[other] = { id: other, full_name: contact?.full_name ?? 'User', role: contact?.role ?? 'student', lastMsg: m, lastTs: m.created_at }
    } else if (m.created_at > contactMap[other].lastTs) {
      contactMap[other].lastMsg = m; contactMap[other].lastTs = m.created_at
    }
  })
  const recentContacts = Object.values(contactMap).sort((a: any, b: any) => b.lastTs.localeCompare(a.lastTs))
  const filtered = contacts.filter(c => c.id !== userId && c.full_name.toLowerCase().includes(search.toLowerCase()))

  const W = isMobile ? '100vw' : 340, H = isMobile ? '100dvh' : 480
  const BOTTOM = isMobile ? 0 : 70, RIGHT = isMobile ? 0 : 20

  function OnlineDot({ uid, size = 10 }: { uid: string; size?: number }) {
    return <div style={{ width: size, height: size, borderRadius: '50%', background: online[uid] ? '#22c55e' : '#d1d5db', border: '1.5px solid #fff', flexShrink: 0 }} title={online[uid] ? 'Online' : 'Offline'} />
  }

  return (
    <>
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

      {open && (
        <div style={{ position: 'fixed', bottom: BOTTOM, right: RIGHT, width: W, height: H, zIndex: 1000, background: '#fff', border: isMobile ? 'none' : '1px solid #e5e7eb', borderRadius: isMobile ? 0 : 16, boxShadow: '0 12px 40px rgba(0,0,0,.15)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Header */}
          <div style={{ background: '#185FA5', color: '#fff', padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
            {activeContact ? (
              <>
                <button onClick={() => setActiveContact(null)} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 18, padding: 0, lineHeight: 1, opacity: .85 }}>←</button>
                <div style={{ position: 'relative' }}>
                  <Avatar name={activeContact.full_name} size={28} bg="rgba(255,255,255,.2)" color="#fff" />
                  <div style={{ position: 'absolute', bottom: -1, right: -1 }}><OnlineDot uid={activeContact.id} size={9} /></div>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{activeContact.full_name}</div>
                  <div style={{ fontSize: 10, opacity: .75 }}>{online[activeContact.id] ? '● Online' : activeContact.role === 'teacher' ? 'Teacher' : 'Student'}</div>
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
                    {recentContacts.map((c: any) => {
                      const contact = contacts.find(x => x.id === c.id) ?? c
                      const uc = unreadCount(c.id)
                      const bg = c.role === 'teacher' ? '#E6F1FB' : '#EAF3DE'
                      const col = c.role === 'teacher' ? '#0C447C' : '#27500A'
                      return (
                        <div key={c.id} onClick={() => openThread(contact)}
                          style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', cursor: 'pointer', borderBottom: '0.5px solid #f9fafb', background: 'transparent' }}
                          onMouseEnter={e => (e.currentTarget.style.background = '#f5f9ff')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                          <div style={{ position: 'relative' }}>
                            <Avatar name={c.full_name} size={36} bg={bg} color={col} />
                            <div style={{ position: 'absolute', bottom: 0, right: 0 }}><OnlineDot uid={c.id} /></div>
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: uc > 0 ? 700 : 500, fontSize: 13, color: '#111', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.full_name}</div>
                            <div style={{ fontSize: 11, color: '#888', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.lastMsg?.body?.slice(0, 42)}</div>
                          </div>
                          {uc > 0 && <span style={{ minWidth: 18, height: 18, borderRadius: 9, background: '#e53e3e', color: '#fff', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px', flexShrink: 0 }}>{uc}</span>}
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
                    const uc = unreadCount(c.id)
                    return (
                      <div key={c.id} onClick={() => openThread(c)}
                        style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', cursor: 'pointer', borderBottom: '0.5px solid #f9fafb', background: 'transparent' }}
                        onMouseEnter={e => (e.currentTarget.style.background = '#f5f9ff')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                        <div style={{ position: 'relative' }}>
                          <Avatar name={c.full_name} size={32} bg={bg} color={col} />
                          <div style={{ position: 'absolute', bottom: 0, right: 0 }}><OnlineDot uid={c.id} size={9} /></div>
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 500, color: '#111', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.full_name}</div>
                          <div style={{ fontSize: 11, color: '#aaa' }}>{online[c.id] ? '● Online' : c.role === 'teacher' ? 'Teacher' : 'Student'}</div>
                        </div>
                        {uc > 0 && <span style={{ minWidth: 18, height: 18, borderRadius: 9, background: '#e53e3e', color: '#fff', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px', flexShrink: 0 }}>{uc}</span>}
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
                {threadMsgs.length === 0 && (
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ccc', fontSize: 13, paddingTop: 60 }}>
                    Start the conversation 👋
                  </div>
                )}
                {threadMsgs.map(m => {
                  const mine = m.sender_id === userId
                  const isOpt = m.id.startsWith('tmp-')
                  return (
                    <div key={m.id} style={{ display: 'flex', justifyContent: mine ? 'flex-end' : 'flex-start', alignItems: 'flex-end', gap: 6 }}>
                      {!mine && <Avatar name={activeContact.full_name} size={22} bg={activeContact.role === 'teacher' ? '#E6F1FB' : '#EAF3DE'} color={activeContact.role === 'teacher' ? '#0C447C' : '#27500A'} />}
                      <div style={{ maxWidth: '78%' }}>
                        <div style={{ background: mine ? '#185FA5' : '#f0f2f5', color: mine ? '#fff' : '#111', borderRadius: mine ? '14px 14px 3px 14px' : '14px 14px 14px 3px', padding: '8px 11px', fontSize: 13, lineHeight: 1.45, wordBreak: 'break-word', opacity: isOpt ? .6 : 1 }}>
                          {m.body}
                        </div>
                        <div style={{ fontSize: 9, color: '#bbb', marginTop: 2, textAlign: mine ? 'right' : 'left', display: 'flex', gap: 5, justifyContent: mine ? 'flex-end' : 'flex-start', alignItems: 'center' }}>
                          {isOpt ? '…' : new Date(m.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                          {mine && !isOpt && <button onClick={() => deleteMsg(m.id)} style={{ color: '#ddd', background: 'none', border: 'none', cursor: 'pointer', fontSize: 9, padding: 0, lineHeight: 1 }}>✕</button>}
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
                  placeholder="Message… (Enter to send)" rows={1}
                  style={{ flex: 1, padding: '8px 10px', border: '0.5px solid #e5e7eb', borderRadius: 18, fontSize: 13, fontFamily: 'inherit', resize: 'none', outline: 'none', lineHeight: 1.4, maxHeight: 80, overflowY: 'auto', boxSizing: 'border-box' }} />
                <button onClick={sendMsg} disabled={sending || !draft.trim()}
                  style={{ width: 34, height: 34, borderRadius: '50%', background: draft.trim() ? '#185FA5' : '#e5e7eb', color: draft.trim() ? '#fff' : '#aaa', border: 'none', cursor: draft.trim() ? 'pointer' : 'default', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
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
