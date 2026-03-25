/* eslint-disable @typescript-eslint/no-explicit-any */
'use client'
import { useRouter, usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function AppShell({ user, role, children }: { user: any; role: 'teacher' | 'student'; children: React.ReactNode }) {
  const router = useRouter()
  const path = usePathname()
  const supabase = createClient()

  async function logout() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
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
  const initials = (user?.full_name ?? user?.email ?? '?').split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2)
  const roleColor = role === 'teacher' ? { bg: '#E6F1FB', text: '#0C447C' } : { bg: '#EAF3DE', text: '#27500A' }

  return (
    <div style={{ minHeight: '100vh', background: '#f9fafb', fontFamily: 'system-ui, sans-serif' }}>
      {/* Top bar */}
      <div style={{ background: '#fff', borderBottom: '0.5px solid #e5e7eb', padding: '0 20px', display: 'flex', alignItems: 'center', gap: 8, height: 52, position: 'sticky', top: 0, zIndex: 50, flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 600, fontSize: 15, marginRight: 4 }}>ClassBase</span>
        <span style={{ fontSize: 10, fontWeight: 500, padding: '2px 8px', borderRadius: 20, background: roleColor.bg, color: roleColor.text }}>{role}</span>
        <div style={{ flex: 1 }} />
        {nav.map(n => (
          <a key={n.href} href={n.href} style={{ fontSize: 13, color: path.startsWith(n.href) ? '#185FA5' : '#555', fontWeight: path.startsWith(n.href) ? 600 : 400, textDecoration: 'none', padding: '4px 8px', borderRadius: 6, background: path.startsWith(n.href) ? '#E6F1FB' : 'transparent' }}>
            {n.label}
          </a>
        ))}
        <a href={profileHref} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: '50%', background: roleColor.bg, color: roleColor.text, fontSize: 11, fontWeight: 600, textDecoration: 'none', flexShrink: 0 }}>{initials}</a>
        <button onClick={logout} style={{ fontSize: 12, padding: '4px 10px', borderRadius: 6, border: '0.5px solid #e5e7eb', background: '#fff', cursor: 'pointer', color: '#555' }}>Sign out</button>
      </div>
      {/* Page content */}
      <div style={{ maxWidth: 860, margin: '0 auto', padding: '28px 20px' }}>
        {children}
      </div>
    </div>
  )
}
