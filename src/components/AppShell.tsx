/* eslint-disable @typescript-eslint/no-explicit-any */
'use client'
import { useRouter, usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useEffect, useState } from 'react'

// Inject global dark-mode styles once
const DARK_CSS = `
  body[data-theme="dark"] { background: #111827 !important; color: #f3f4f6 !important; }
  body[data-theme="dark"] .cb-surface { background: #1f2937 !important; border-color: #374151 !important; }
  body[data-theme="dark"] input, body[data-theme="dark"] textarea, body[data-theme="dark"] select {
    background: #1f2937 !important; color: #f3f4f6 !important; border-color: #374151 !important;
  }
  body[data-theme="dark"] a { color: #93c5fd; }
  .dm-bg   { background: var(--dm-bg, #f9fafb); }
  .dm-card { background: var(--dm-card, #fff); border-color: var(--dm-border, #e5e7eb); }
`

export default function AppShell({ user, role, children }: { user: any; role: 'teacher' | 'student'; children: React.ReactNode }) {
  const path = usePathname()
  const supabase = createClient()
  const [dark, setDark] = useState(false)

  // Apply dark mode by toggling a class on <body>
  useEffect(() => {
    const saved = localStorage.getItem('cb_dark') === '1'
    setDark(saved)
    document.body.setAttribute('data-theme', saved ? 'dark' : 'light')
  }, [])

  function toggleDark() {
    const next = !dark
    setDark(next)
    localStorage.setItem('cb_dark', next ? '1' : '0')
    document.body.setAttribute('data-theme', next ? 'dark' : 'light')
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

  // Inline styles respond to dark mode via JS-toggled body attribute
  const topbarBg = dark ? '#1f2937' : '#fff'
  const topbarBorder = dark ? '#374151' : '#e5e7eb'
  const pageBg = dark ? '#111827' : '#f9fafb'
  const textColor = dark ? '#f3f4f6' : '#111'
  const mutedColor = dark ? '#9ca3af' : '#888'
  const btnBorder = dark ? '#374151' : '#e5e7eb'

  return (
    <div style={{ minHeight: '100vh', background: pageBg, fontFamily: 'system-ui, sans-serif', color: textColor, transition: 'background .2s, color .2s' }}>
      <style>{DARK_CSS}</style>
      {/* Top bar */}
      <div style={{ background: topbarBg, borderBottom: `1px solid ${topbarBorder}`, padding: '0 20px', display: 'flex', alignItems: 'center', gap: 8, height: 52, position: 'sticky', top: 0, zIndex: 50, transition: 'background .2s' }}>
        {/* #15 — logo links to homepage */}
        <a href={homeHref} style={{ fontWeight: 700, fontSize: 16, textDecoration: 'none', color: textColor, marginRight: 4 }}>ClassBase</a>
        <span style={{ fontSize: 10, fontWeight: 500, padding: '2px 8px', borderRadius: 20, background: roleColor.bg, color: roleColor.text }}>{role}</span>
        <div style={{ flex: 1 }} />
        {nav.map(n => (
          <a key={n.href} href={n.href} style={{
            fontSize: 13, fontWeight: path.startsWith(n.href) ? 600 : 400, textDecoration: 'none',
            padding: '4px 8px', borderRadius: 6,
            color: path.startsWith(n.href) ? '#185FA5' : mutedColor,
            background: path.startsWith(n.href) ? '#E6F1FB' : 'transparent',
          }}>
            {n.label}
          </a>
        ))}
        {/* #13 — dark mode toggle */}
        <button onClick={toggleDark} title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
          style={{ fontSize: 16, background: 'none', border: 'none', cursor: 'pointer', padding: '4px 6px', borderRadius: 6, lineHeight: 1 }}>
          {dark ? '☀️' : '🌙'}
        </button>
        <a href={profileHref} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: '50%', background: roleColor.bg, color: roleColor.text, fontSize: 11, fontWeight: 600, textDecoration: 'none', flexShrink: 0 }}>
          {initials}
        </a>
        <button onClick={logout} style={{ fontSize: 12, padding: '4px 10px', borderRadius: 6, border: `1px solid ${btnBorder}`, background: topbarBg, cursor: 'pointer', color: textColor }}>
          Sign out
        </button>
      </div>
      <div style={{ maxWidth: 860, margin: '0 auto', padding: '28px 20px' }}>
        {children}
      </div>
    </div>
  )
}
