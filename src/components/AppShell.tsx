/* eslint-disable @typescript-eslint/no-explicit-any */
'use client'
import { useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { DarkContext } from '@/lib/darkMode'
import ChatWidget from './ChatWidget'

export default function AppShell({ user, role, children, wide }: { user: any; role: 'teacher' | 'student'; children: React.ReactNode; wide?: boolean }) {
  const path = usePathname()
  const supabase = createClient()
  const [menuOpen, setMenuOpen] = useState(false)
  const [unread, setUnread] = useState(0)
  const [notifs, setNotifs] = useState<any[]>([])
  const [notifOpen, setNotifOpen] = useState(false)
  const [contacts, setContacts] = useState<any[]>([])

  async function logout() {
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  // Ping last_seen_at every 2 min
  useEffect(() => {
    async function ping() {
      const { data: { user: u } } = await supabase.auth.getUser()
      if (u) await supabase.from('profiles').update({ last_seen_at: new Date().toISOString() } as any).eq('id', u.id)
    }
    ping()
    const t = setInterval(ping, 2 * 60 * 1000)
    return () => clearInterval(t)
  }, [])

  // Load contacts for chat widget
  useEffect(() => {
    async function loadContacts() {
      const { data: { user: u } } = await supabase.auth.getUser()
      if (!u) return
      // For teachers: all students
      // For students: their teachers (via enrollments) + classmates (same module)
      const { data: profiles } = await supabase.from('profiles')
        .select('id, full_name, role')
        .neq('id', u.id)
        .in('role', ['teacher', 'student'])
      setContacts((profiles ?? []).map((p: any) => ({
        id: p.id,
        full_name: p.full_name ?? p.email ?? 'User',
        role: p.role,
        initials: (p.full_name ?? '?').split(' ').map((w: string) => w[0] ?? '').join('').toUpperCase().slice(0, 2),
      })))
    }
    loadContacts()
  }, [])

  // Load notifications + subscribe realtime
  useEffect(() => {
    async function load() {
      const { data: { user: u } } = await supabase.auth.getUser()
      if (!u) return
      const { data: n } = await supabase.from('notifications')
        .select('*').eq('user_id', u.id).eq('read', false)
        .eq('type', 'announcement')
        .order('created_at', { ascending: false }).limit(20)
      setNotifs(n ?? [])
      setUnread((n ?? []).length)
      supabase.channel('notif-ann-' + u.id)
        .on('postgres_changes', {
          event: 'INSERT', schema: 'public', table: 'notifications',
          filter: `user_id=eq.${u.id}`,
        }, (payload: any) => {
          const n = payload.new
          if (n.type !== 'announcement') return
          setNotifs(prev => [n, ...prev].slice(0, 20))
          setUnread(c => c + 1)
        })
        .subscribe()
    }
    load()
  }, [])

  async function markAllRead() {
    const { data: { user: u } } = await supabase.auth.getUser()
    if (!u) return
    await supabase.from('notifications').update({ read: true } as any).eq('user_id', u.id).eq('read', false)
    setUnread(0)
    // Keep notifs visible in dropdown until closed — just mark visually
  }

  function closeNotifPanel() { setNotifOpen(false) }

  const teacherNav = [
    { label: 'Modules', href: '/teacher/modules' },
    { label: 'Grade', href: '/teacher/grade' },
    { label: 'Tests', href: '/teacher/tests' },
    { label: 'Groups', href: '/teacher/groups' },
  ]
  const studentNav = [
    { label: 'Modules', href: '/student/modules' },
    { label: 'Progress', href: '/student/progress' },
    { label: 'Tests', href: '/student/tests' },
    { label: 'Bookmarks', href: '/student/bookmarks' },
  ]
  const nav = role === 'teacher' ? teacherNav : studentNav
  const profileHref = role === 'teacher' ? '/teacher/profile' : '/student/profile'
  const homeHref = role === 'teacher' ? '/teacher/modules' : '/student/modules'
  const initials = (user?.full_name ?? user?.email ?? '?').split(' ').map((w: string) => w[0] ?? '').join('').toUpperCase().slice(0, 2)
  const roleColor = role === 'teacher' ? { bg: '#E6F1FB', text: '#0C447C' } : { bg: '#EAF3DE', text: '#27500A' }

  return (
    <div style={{ minHeight: '100vh', background: '#f9fafb', fontFamily: 'system-ui, sans-serif', color: '#111' }}>
      <style>{`
        @media (max-width: 640px) {
          .cb-desktop-nav { display: none !important; }
          .cb-hamburger { display: flex !important; }
          .cb-mobile-menu { display: block !important; }
        }
        .cb-hamburger { display: none; }
        .cb-mobile-menu { display: none; }
      `}</style>

      {/* Top bar */}
      <div className="cb-nav-bar" style={{ background: '#fff', borderBottom: '1px solid #e5e7eb', padding: '0 20px', display: 'flex', alignItems: 'center', gap: 8, height: 52, position: 'sticky', top: 0, zIndex: 50 }}>
        <a href={homeHref} style={{ fontWeight: 700, fontSize: 16, textDecoration: 'none', color: '#111', marginRight: 4 }}>ClassBase</a>
        <span style={{ fontSize: 10, fontWeight: 500, padding: '2px 8px', borderRadius: 20, background: roleColor.bg, color: roleColor.text, whiteSpace: 'nowrap' }}>{role}</span>
        <div style={{ flex: 1 }} />

        {/* Desktop nav */}
        <div className="cb-desktop-nav" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {nav.map(n => (
            <a key={n.href} href={n.href} className="cb-nav-link" style={{
              fontSize: 13, fontWeight: path.startsWith(n.href) ? 600 : 400, textDecoration: 'none',
              padding: '4px 8px', borderRadius: 6,
              color: path.startsWith(n.href) ? '#185FA5' : '#555',
              background: path.startsWith(n.href) ? '#E6F1FB' : 'transparent',
              whiteSpace: 'nowrap',
            }}>
              <span className="cb-nav-label">{n.label}</span>
            </a>
          ))}
          {/* Notification bell */}
          <div style={{ position: 'relative' }}>
            <button onClick={() => setNotifOpen(o => !o)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px 6px', fontSize: 16, lineHeight: 1, position: 'relative', color: '#555' }}>
              🔔
              {unread > 0 && (
                <span style={{ position: 'absolute', top: 0, right: 0, width: 16, height: 16, borderRadius: '50%', background: '#e53e3e', color: '#fff', fontSize: 9, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {unread > 9 ? '9+' : unread}
                </span>
              )}
            </button>
            {notifOpen && (
              <div style={{ position: 'absolute', right: 0, top: 36, width: 300, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, boxShadow: '0 8px 24px rgba(0,0,0,.12)', zIndex: 100, overflow: 'hidden' }}>
                <div style={{ padding: '10px 14px', borderBottom: '0.5px solid #f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontWeight: 600, fontSize: 13, color: '#111' }}>Notifications {unread > 0 && <span style={{ fontSize: 10, background: '#e53e3e', color: '#fff', padding: '1px 5px', borderRadius: 8, marginLeft: 4 }}>{unread}</span>}</span>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    {unread > 0 && <button onClick={markAllRead} style={{ fontSize: 11, color: '#185FA5', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}>Mark all read</button>}
                    <button onClick={closeNotifPanel} style={{ fontSize: 14, color: '#aaa', background: 'none', border: 'none', cursor: 'pointer', lineHeight: 1, padding: '0 2px' }}>✕</button>
                  </div>
                </div>
                {notifs.length === 0 && <div style={{ padding: '20px 14px', fontSize: 13, color: '#aaa', textAlign: 'center' }}>All caught up ✓</div>}
                <div style={{ maxHeight: 360, overflowY: 'auto' }}>
                {notifs.map((n: any) => (
                  <a key={n.id} href={n.link ?? '#'}
                    style={{ display: 'block', padding: '10px 14px', borderBottom: '0.5px solid #f9fafb', textDecoration: 'none', color: 'inherit', background: n.read ? 'transparent' : '#fafeff' }}>
                    <div style={{ fontSize: 13, fontWeight: n.read ? 400 : 600, color: '#111', marginBottom: 2 }}>{n.title}</div>
                    {n.body && <div style={{ fontSize: 12, color: '#888', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.body}</div>}
                    <div style={{ fontSize: 10, color: '#ccc', marginTop: 2 }}>{new Date(n.created_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</div>
                  </a>
                ))}
                </div>
              </div>
            )}
          </div>
          <a href={profileHref} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: '50%', background: roleColor.bg, color: roleColor.text, fontSize: 11, fontWeight: 600, textDecoration: 'none', flexShrink: 0, marginLeft: 4 }}>
            {initials}
          </a>
          <button onClick={logout} style={{ fontSize: 12, padding: '4px 10px', borderRadius: 6, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', color: '#111', whiteSpace: 'nowrap' }}>
            Sign out
          </button>
        </div>

        {/* Mobile: avatar + hamburger */}
        <a href={profileHref} className="cb-hamburger" style={{ display: 'none', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: '50%', background: roleColor.bg, color: roleColor.text, fontSize: 11, fontWeight: 600, textDecoration: 'none' }}>
          {initials}
        </a>
        <button className="cb-hamburger" onClick={() => setMenuOpen(o => !o)}
          style={{ display: 'none', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 6px', fontSize: 20, lineHeight: 1, color: '#555' }}
          aria-label="Open menu">
          {menuOpen ? '✕' : '☰'}
        </button>
      </div>

      {/* Mobile dropdown menu */}
      {menuOpen && (
        <div className="cb-mobile-menu" style={{ background: '#fff', borderBottom: '1px solid #e5e7eb', padding: '8px 16px 12px', position: 'sticky', top: 52, zIndex: 49 }}>
          {nav.map(n => (
            <a key={n.href} href={n.href} onClick={() => setMenuOpen(false)}
              style={{ display: 'flex', alignItems: 'center', padding: '10px 8px', textDecoration: 'none', fontSize: 15, fontWeight: path.startsWith(n.href) ? 600 : 400, color: path.startsWith(n.href) ? '#185FA5' : '#333', borderRadius: 8, background: path.startsWith(n.href) ? '#E6F1FB' : 'transparent', marginBottom: 2 }}>
              {n.label}
            </a>
          ))}
          <div style={{ borderTop: '1px solid #f3f4f6', marginTop: 8, paddingTop: 8 }}>
            <button onClick={logout} style={{ width: '100%', padding: '10px', fontSize: 14, color: '#555', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit' }}>
              Sign out
            </button>
          </div>
        </div>
      )}

      {/* Floating chat widget */}
      {user && <ChatWidget userId={user.id} userRole={role} contacts={contacts} />}

      {/* Page content */}
      <div className="cb-page-wrap" style={{ maxWidth: wide ? 1140 : 860, margin: '0 auto', padding: '28px 20px' }}>
        <DarkContext.Provider value={false}>
          {children}
        </DarkContext.Provider>
      </div>
    </div>
  )
}
