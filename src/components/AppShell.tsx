/* eslint-disable @typescript-eslint/no-explicit-any */
'use client'
import { useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { DarkContext } from '@/lib/darkMode'

export default function AppShell({ user, role, children, wide }: { user: any; role: 'teacher' | 'student'; children: React.ReactNode; wide?: boolean }) {
  const path = usePathname()
  const supabase = createClient()
  const [menuOpen, setMenuOpen] = useState(false)

  async function logout() {
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  // Update last_seen_at on mount and every 2 minutes
  useEffect(() => {
    async function ping() {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        await supabase.from('profiles').update({ last_seen_at: new Date().toISOString() } as any).eq('id', user.id)
      }
    }
    ping()
    const interval = setInterval(ping, 2 * 60 * 1000)
    return () => clearInterval(interval)
  }, [])

  const teacherNav = [
    { label: 'Modules', href: '/teacher/modules' },
    { label: 'Grade', href: '/teacher/grade' },
    { label: 'Groups', href: '/teacher/groups' },
    { label: 'Messages', href: '/teacher/messages' },
  ]
  const studentNav = [
    { label: 'Modules', href: '/student/modules' },
    { label: 'Progress', href: '/student/progress' },
    { label: 'Bookmarks', href: '/student/bookmarks' },
    { label: 'Inbox', href: '/student/inbox' },
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

      {/* Page content */}
      <div className="cb-page-wrap" style={{ maxWidth: wide ? 1140 : 860, margin: '0 auto', padding: '28px 20px' }}>
        <DarkContext.Provider value={false}>
          {children}
        </DarkContext.Provider>
      </div>
    </div>
  )
}
