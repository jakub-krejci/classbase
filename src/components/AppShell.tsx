/* eslint-disable @typescript-eslint/no-explicit-any */
'use client'
import { useRouter, usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useEffect, useState } from 'react'

export default function AppShell({ user, role, children }: { user: any; role: 'teacher' | 'student'; children: React.ReactNode }) {
  const router = useRouter()
  const path = usePathname()
  const supabase = createClient()

  // #13 — dark mode
  const [dark, setDark] = useState(false)
  useEffect(() => {
    const saved = localStorage.getItem('cb_dark')
    if (saved === '1') { setDark(true); document.documentElement.setAttribute('data-theme', 'dark') }
  }, [])
  function toggleDark() {
    const next = !dark
    setDark(next)
    localStorage.setItem('cb_dark', next ? '1' : '0')
    document.documentElement.setAttribute('data-theme', next ? 'dark' : 'light')
  }

  async function logout() {
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  const teacherNav = [
    { label: 'Modules', href: '/teacher/modules' },
    { label: 'Grade', href: '/teacher/grade' },
    { label: 'Groups', href: '/teacher/groups' },
    { label: 'Messages', href: '/teacher/messages' },
  ]
  const studentNav = [
    { label: 'Modules', href: '/student/modules' },
    { label: 'Progress', href: '/student/progress' },
    { label: 'Inbox', href: '/student/inbox' },
  ]
  const nav = role === 'teacher' ? teacherNav : studentNav
  const profileHref = role === 'teacher' ? '/teacher/profile' : '/student/profile'
  const homeHref = role === 'teacher' ? '/teacher/modules' : '/student/modules'
  const initials = (user?.full_name ?? user?.email ?? '?').split(' ').map((w: string) => w[0] ?? '').join('').toUpperCase().slice(0, 2)
  const roleColor = role === 'teacher' ? { bg: '#E6F1FB', text: '#0C447C' } : { bg: '#EAF3DE', text: '#27500A' }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg, #f9fafb)', fontFamily: 'system-ui, sans-serif', color: 'var(--text, #111)' }}>
      <style>{`
        [data-theme="dark"] { --bg:#111827; --surface:#1f2937; --border:#374151; --text:#f3f4f6; --muted:#9ca3af; --topbar:#111827; }
        [data-theme="light"], :root { --bg:#f9fafb; --surface:#fff; --border:#e5e7eb; --text:#111; --muted:#888; --topbar:#fff; }
      `}</style>
      {/* Top bar */}
      <div style={{ background: 'var(--topbar,#fff)', borderBottom: '1px solid var(--border,#e5e7eb)', padding: '0 20px', display: 'flex', alignItems: 'center', gap: 8, height: 52, position: 'sticky', top: 0, zIndex: 50 }}>
        {/* #15 — logo links to homepage */}
        <a href={homeHref} style={{ fontWeight: 700, fontSize: 16, textDecoration: 'none', color: 'var(--text,#111)', marginRight: 4 }}>ClassBase</a>
        <span style={{ fontSize: 10, fontWeight: 500, padding: '2px 8px', borderRadius: 20, background: roleColor.bg, color: roleColor.text }}>{role}</span>
        <div style={{ flex: 1 }} />
        {nav.map(n => (
          <a key={n.href} href={n.href} style={{ fontSize: 13, color: path.startsWith(n.href) ? '#185FA5' : 'var(--muted,#888)', fontWeight: path.startsWith(n.href) ? 600 : 400, textDecoration: 'none', padding: '4px 8px', borderRadius: 6, background: path.startsWith(n.href) ? '#E6F1FB' : 'transparent' }}>
            {n.label}
          </a>
        ))}
        {/* #13 — dark mode toggle */}
        <button onClick={toggleDark} title={dark ? 'Light mode' : 'Dark mode'}
          style={{ fontSize: 16, background: 'none', border: 'none', cursor: 'pointer', padding: '4px 6px', borderRadius: 6 }}>
          {dark ? '☀️' : '🌙'}
        </button>
        <a href={profileHref} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: '50%', background: roleColor.bg, color: roleColor.text, fontSize: 11, fontWeight: 600, textDecoration: 'none', flexShrink: 0 }}>{initials}</a>
        <button onClick={logout} style={{ fontSize: 12, padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border,#e5e7eb)', background: 'var(--surface,#fff)', cursor: 'pointer', color: 'var(--text,#111)' }}>Sign out</button>
      </div>
      <div style={{ maxWidth: 860, margin: '0 auto', padding: '28px 20px' }}>
        {children}
      </div>
    </div>
  )
}
