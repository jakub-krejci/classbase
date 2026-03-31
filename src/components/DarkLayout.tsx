'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export const D = {
  bgMain:   '#090B10',
  bgCard:   '#14171F',
  bgHover:  '#1A1E28',
  bgMid:    '#1E2230',
  success:  '#22C55E',
  warning:  '#FBBF24',
  danger:   '#EF4444',
  txtPri:   '#FFFFFF',
  txtSec:   '#A1A7B3',
  border:   'rgba(255,255,255,0.06)',
  radius:   '20px',
  radiusSm: '12px',
}

export function card(extra: any = {}): React.CSSProperties {
  return { background: D.bgCard, border: `1px solid ${D.border}`, borderRadius: D.radius, ...extra }
}

export function SectionLabel({ children, action }: { children: string; action?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: D.txtSec, textTransform: 'uppercase', letterSpacing: '.07em' }}>{children}</div>
      {action}
    </div>
  )
}

export function ProgressBar({ pct, color = 'var(--accent)', height = 5 }: { pct: number; color?: string; height?: number }) {
  return (
    <div style={{ height, background: 'rgba(255,255,255,.07)', borderRadius: 99, overflow: 'hidden', flexShrink: 0 }}>
      <div style={{ height: '100%', width: `${Math.min(pct, 100)}%`, background: color, borderRadius: 99, transition: 'width .6s ease' }} />
    </div>
  )
}

function SideIcon({ icon, active, href, label, accent, isImg }: { icon: string; active?: boolean; href: string; label: string; accent: string; isImg?: boolean }) {
  const bg    = active ? accent + '25' : 'transparent'
  const color = active ? accent : D.txtSec
  return (
    <a href={href} title={label}
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 40, height: 40, borderRadius: D.radiusSm, background: bg, color, textDecoration: 'none', fontSize: 18, transition: 'all .2s', flexShrink: 0 }}
      onMouseEnter={e => { if (!active) { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,.07)'; (e.currentTarget as HTMLElement).style.color = '#fff' } }}
      onMouseLeave={e => { if (!active) { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = D.txtSec } }}>
      {isImg ? <img src={icon} alt={label} style={{ width: 22, height: 22, objectFit: 'contain', filter: 'brightness(0) invert(0.6)' }} /> : icon}
    </a>
  )
}

export function DarkLayout({ profile, activeRoute, children, wide = false }: {
  profile: any; activeRoute: string; children: React.ReactNode; wide?: boolean
}) {
  const supabase = createClient()
  const router = useRouter()
  const accent = profile?.accent_color ?? '#7C3AED'

  async function logout() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const navItems = [
    { icon: '🏠', label: 'Domů',    href: '/student/dashboard' },
    { icon: '📖', label: 'Moduly',  href: '/student/modules' },
    { icon: '🧪', label: 'Testy',   href: '/student/tests' },
    { icon: '📊', label: 'Pokrok',  href: '/student/progress' },
    { icon: '🔖', label: 'Záložky', href: '/student/bookmarks' },
  ]

  const initials = (profile?.full_name || '?').split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300..800;1,9..40,300..800&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        :root { --accent: ${accent}; }
        html, body { background: ${D.bgMain}; color: ${D.txtPri}; font-family: 'DM Sans', system-ui, sans-serif; }
        ::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-thumb { background: rgba(255,255,255,.1); border-radius: 4px; }
        .dk-hover { transition: background .15s, border-color .15s; }
        .dk-hover:hover { background: ${D.bgHover} !important; border-color: rgba(255,255,255,.1) !important; }
        .icon-btn { background: none; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; border-radius: 10px; transition: background .15s; padding: 6px; color: ${D.txtSec}; font-size: 18px; }
        .icon-btn:hover { background: rgba(255,255,255,.06); }
        @keyframes spin { to { transform: rotate(360deg) } }
        @media (max-width: 640px) { .dk-sidebar { display: none !important; } }
      `}</style>

      <div style={{ display: 'flex', minHeight: '100vh', background: D.bgMain }}>

        {/* ── Sidebar ── */}
        <nav className="dk-sidebar" style={{ width: 64, flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '20px 0 16px', borderRight: `1px solid ${D.border}`, background: D.bgMain, position: 'sticky', top: 0, height: '100vh' }}>
          <a href="/student/dashboard" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 40, height: 40, textDecoration: 'none', marginBottom: 28, flexShrink: 0 }}>
            <img src="/logo_male.png" alt="ClassBase" style={{ width: 36, height: 36, objectFit: 'contain' }}
              onError={e => { const el = e.target as HTMLImageElement; el.style.display='none'; el.parentElement!.innerHTML='<div style="width:36px;height:36px;border-radius:10px;background:'+accent+';display:flex;align-items:center;justify-content:center;font-size:18px">📚</div>' }} />
          </a>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
            {navItems.map(({ icon, label, href }) => (
              <SideIcon key={href} icon={icon} label={label} href={href} accent={accent}
                active={href === activeRoute || (activeRoute === href)} />
            ))}
          </div>
          <button onClick={logout} title="Odhlásit se" className="icon-btn">↩</button>
        </nav>

        {/* ── Main ── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflowX: 'hidden' }}>

          {/* Topbar */}
          <div style={{ display: 'flex', alignItems: 'center', padding: '14px 20px', borderBottom: `1px solid ${D.border}`, gap: 12 }}>
            <div style={{ flex: 1 }} />
            <button className="icon-btn" style={{ position: 'relative' }}>
              🔔
              <div style={{ position: 'absolute', top: 5, right: 5, width: 7, height: 7, borderRadius: '50%', background: accent, border: `2px solid ${D.bgMain}` }} />
            </button>
            <a href="/student/profile" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {profile?.avatar_url
                ? <img src={profile.avatar_url} alt="avatar" style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover' }} />
                : <div style={{ width: 36, height: 36, borderRadius: '50%', background: accent + '30', color: accent, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700 }}>{initials}</div>
              }
            </a>
          </div>

          {/* Content */}
          <div style={{ flex: 1, padding: '28px', maxWidth: wide ? '100%' : 1000, width: '100%', margin: '0 auto', alignSelf: wide ? 'stretch' : undefined }}>
            {children}
          </div>
        </div>
      </div>
    </>
  )
}
