'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useRef, useEffect } from 'react'
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
  const imgFilter = active ? 'brightness(1)' : 'brightness(0.6)'
  return (
    <a href={href} title={label}
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 40, height: 40, borderRadius: D.radiusSm, background: bg, color, textDecoration: 'none', fontSize: 18, transition: 'all .2s', flexShrink: 0 }}
      onMouseEnter={e => {
        if (!active) {
          (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,.07)'
          const img = (e.currentTarget as HTMLElement).querySelector('img')
          if (img) img.style.filter = 'brightness(1)'
        }
      }}
      onMouseLeave={e => {
        if (!active) {
          (e.currentTarget as HTMLElement).style.background = 'transparent'
          const img = (e.currentTarget as HTMLElement).querySelector('img')
          if (img) img.style.filter = imgFilter
        }
      }}>
      {isImg
        ? <img src={icon} alt={label} style={{ width: 22, height: 22, objectFit: 'contain', filter: imgFilter, transition: 'filter .2s' }} />
        : icon}
    </a>
  )
}

export function DarkLayout({ profile, activeRoute, children, wide = false, fullContent = false }: {
  profile: any; activeRoute: string; children: React.ReactNode; wide?: boolean; fullContent?: boolean
}) {
  const supabase = createClient()
  const router   = useRouter()
  const accent   = profile?.accent_color ?? '#7C3AED'

  // Search state
  const [searchOpen, setSearchOpen]     = useState(false)
  const [searchQuery, setSearchQuery]   = useState('')
  const [searchResults, setSearchResults] = useState<any[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchSel, setSearchSel]       = useState(0)
  const searchRef = useRef<HTMLInputElement>(null)
  const debounce  = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); setSearchOpen(o => !o) }
      if (e.key === 'Escape') setSearchOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (searchOpen) { setSearchQuery(''); setSearchResults([]); setTimeout(() => searchRef.current?.focus(), 50) }
  }, [searchOpen])

  function runSearch(q: string) {
    if (debounce.current) clearTimeout(debounce.current)
    if (q.length < 2) { setSearchResults([]); setSearchLoading(false); return }
    setSearchLoading(true)
    debounce.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`)
        const data = await res.json()
        setSearchResults(data.results ?? []); setSearchSel(0)
      } catch { setSearchResults([]) }
      setSearchLoading(false)
    }, 250)
  }

  async function logout() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const navItems = [
    { icon: '🏠',                    label: 'Domů',         href: '/student/dashboard' },
    { icon: '📖',                    label: 'Moduly',       href: '/student/modules' },
    { icon: '🧪',                    label: 'Testy',        href: '/student/tests' },
    { icon: '📊',                    label: 'Pokrok',       href: '/student/progress' },
    { icon: '🔖',                    label: 'Záložky',      href: '/student/bookmarks' },
    { icon: '/icons/python.png',     label: 'Python',       href: '/student/python' },
    { icon: '/icons/html.png',       label: 'HTML',         href: '/student/html' },
    { icon: '/icons/jupyter.png',    label: 'Jupyter',      href: '/student/jupyter' },
    { icon: '/icons/database.png',   label: 'SQL',          href: '/student/sql' },
    { icon: '🔬',                    label: 'micro:bit',    href: '/student/microbit' },
    { icon: '🤖',                    label: 'VEX IQ',       href: '/student/vex' },
    { icon: '📊',                    label: 'Flowchart',    href: '/student/flowchart' },
    { icon: '📁',                    label: 'Moje soubory', href: '/student/files' },
  ]

  const initials = (profile?.full_name || '?').split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()

  const searchTypeColors: Record<string, { icon: string; color: string }> = {
    module:     { icon: '📚', color: '#6c47ff' },
    lesson:     { icon: '📖', color: '#22C55E' },
    assignment: { icon: '📝', color: '#FBBF24' },
    test:       { icon: '🧪', color: '#EF4444' },
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300..800;1,9..40,300..800&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        :root { --accent: ${accent}; }
        html, body { height: 100%; overflow: hidden; background: ${D.bgMain}; color: ${D.txtPri}; font-family: 'DM Sans', system-ui, sans-serif; }
        ::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-thumb { background: rgba(255,255,255,.1); border-radius: 4px; }
        .dk-hover { transition: background .15s, border-color .15s; }
        .dk-hover:hover { background: ${D.bgHover} !important; border-color: rgba(255,255,255,.1) !important; }
        .icon-btn { background: none; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; border-radius: 10px; transition: background .15s; padding: 6px; color: ${D.txtSec}; font-size: 18px; }
        .icon-btn:hover { background: rgba(255,255,255,.06); }
        @keyframes spin { to { transform: rotate(360deg) } }
        @media (max-width: 640px) { .dk-sidebar { display: none !important; } }
        .dk-search-inp:focus { outline: none; }
      `}</style>

      {/* ── Search overlay ── */}
      {searchOpen && (
        <>
          <div onClick={() => setSearchOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', zIndex: 9998, backdropFilter: 'blur(3px)' }} />
          <div style={{ position: 'fixed', top: '14%', left: '50%', transform: 'translateX(-50%)', width: '100%', maxWidth: 580, zIndex: 9999, padding: '0 16px' }}>
            <div style={{ background: D.bgCard, borderRadius: 16, boxShadow: '0 24px 64px rgba(0,0,0,.5)', overflow: 'hidden', border: `1px solid ${D.border}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px', borderBottom: searchResults.length > 0 || searchLoading ? `1px solid ${D.border}` : 'none' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={D.txtSec} strokeWidth="2.5" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                <input ref={searchRef} value={searchQuery} className="dk-search-inp"
                  onChange={e => { setSearchQuery(e.target.value); runSearch(e.target.value) }}
                  onKeyDown={e => {
                    if (e.key === 'ArrowDown') { e.preventDefault(); setSearchSel(s => Math.min(s+1, searchResults.length-1)) }
                    if (e.key === 'ArrowUp')   { e.preventDefault(); setSearchSel(s => Math.max(s-1, 0)) }
                    if (e.key === 'Enter' && searchResults[searchSel]) { setSearchOpen(false); router.push(searchResults[searchSel].href) }
                  }}
                  placeholder="Hledat lekce, moduly, testy…"
                  style={{ flex: 1, border: 'none', fontSize: 15, fontFamily: 'inherit', background: 'transparent', color: D.txtPri }} />
                {searchLoading && <div style={{ width: 16, height: 16, border: `2px solid ${D.border}`, borderTopColor: accent, borderRadius: '50%', animation: 'spin .6s linear infinite', flexShrink: 0 }} />}
                <kbd onClick={() => setSearchOpen(false)} style={{ fontSize: 11, padding: '2px 7px', background: 'rgba(255,255,255,.08)', border: `1px solid ${D.border}`, borderRadius: 5, cursor: 'pointer', color: D.txtSec }}>Esc</kbd>
              </div>
              {searchResults.length > 0 && (
                <div style={{ maxHeight: 380, overflowY: 'auto' }}>
                  {searchResults.map((r, i) => {
                    const meta = searchTypeColors[r.type] ?? { icon: '📄', color: D.txtSec }
                    return (
                      <div key={r.href} onClick={() => { setSearchOpen(false); router.push(r.href) }} onMouseEnter={() => setSearchSel(i)}
                        style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 18px', cursor: 'pointer', background: searchSel === i ? 'rgba(255,255,255,.05)' : 'transparent', borderBottom: `1px solid ${D.border}` }}>
                        <div style={{ width: 34, height: 34, borderRadius: 8, background: meta.color+'20', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>{meta.icon}</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 14, fontWeight: 600, color: D.txtPri, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title}</div>
                          <div style={{ fontSize: 11, color: D.txtSec, marginTop: 1 }}>{r.excerpt}</div>
                        </div>
                        <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 7px', background: meta.color+'20', color: meta.color, borderRadius: 20, flexShrink: 0 }}>{r.type}</span>
                      </div>
                    )
                  })}
                </div>
              )}
              {searchQuery.length >= 2 && !searchLoading && searchResults.length === 0 && (
                <div style={{ padding: '28px 18px', textAlign: 'center', color: D.txtSec, fontSize: 13 }}>Žádné výsledky pro „{searchQuery}"</div>
              )}
              {searchQuery.length < 2 && (
                <div style={{ padding: '12px 18px', display: 'flex', gap: 16, color: D.txtSec, fontSize: 11 }}>
                  <span>↑↓ navigace</span><span>↵ otevřít</span><span>Esc zavřít</span>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* ── Root: full viewport, no scroll ── */}
      <div style={{ display: 'flex', height: '100vh', background: D.bgMain, overflow: 'hidden' }}>

        {/* ── Left sidebar (sticky, never scrolls) ── */}
        <nav className="dk-sidebar" style={{ width: 64, flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '20px 0 16px', borderRight: `1px solid ${D.border}`, background: D.bgMain, height: '100vh', overflowY: 'auto' }}>
          <a href="/student/dashboard" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 40, height: 40, textDecoration: 'none', marginBottom: 28, flexShrink: 0 }}>
            <img src="/logo_male.png" alt="ClassBase" style={{ width: 36, height: 36, objectFit: 'contain' }}
              onError={e => { const el = e.target as HTMLImageElement; el.style.display='none'; el.parentElement!.innerHTML='<div style="width:36px;height:36px;border-radius:10px;background:'+accent+';display:flex;align-items:center;justify-content:center;font-size:18px">📚</div>' }} />
          </a>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
            {navItems.map(({ icon, label, href }) => (
              <SideIcon key={href} icon={icon} label={label} href={href} accent={accent}
                active={href === activeRoute}
                isImg={icon.startsWith('/')} />
            ))}
          </div>
          <button onClick={logout} title="Odhlásit se" className="icon-btn">↩</button>
        </nav>

        {/* ── Right side: topbar + content ── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, height: '100vh', overflow: 'hidden' }}>

          {/* Topbar */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', padding: '12px 20px', borderBottom: `1px solid ${D.border}`, gap: 12, flexShrink: 0 }}>
            {/* Left spacer */}
            <div />
            {/* Center: search bar */}
            <button onClick={() => setSearchOpen(true)}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', background: D.bgMid, border: `1px solid ${D.border}`, borderRadius: 10, cursor: 'text', color: D.txtSec, fontSize: 13, fontFamily: 'inherit', minWidth: 240, maxWidth: 400, width: '100%' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={D.txtSec} strokeWidth="2.5" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
              <span style={{ flex: 1, textAlign: 'left' }}>Hledat…</span>
              <kbd style={{ fontSize: 10, padding: '1px 5px', background: 'rgba(255,255,255,.06)', border: `1px solid ${D.border}`, borderRadius: 4, color: D.txtSec }}>⌘K</kbd>
            </button>
            {/* Right: bell + avatar */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end' }}>
              <button className="icon-btn" style={{ position: 'relative' }}>
                🔔
                <div style={{ position: 'absolute', top: 5, right: 5, width: 7, height: 7, borderRadius: '50%', background: accent, border: `2px solid ${D.bgMain}` }} />
              </button>
              <a href="/student/profile" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {profile?.avatar_url
                  ? <img src={profile.avatar_url} alt="avatar" style={{ width: 34, height: 34, borderRadius: '50%', objectFit: 'cover', border: `2px solid ${accent}40` }} />
                  : <div style={{ width: 34, height: 34, borderRadius: '50%', background: accent + '30', color: accent, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700 }}>{initials}</div>
                }
              </a>
            </div>
          </div>

          {/* Content area — scrollable or full depending on fullContent */}
          {fullContent
            ? <div style={{ flex: 1, display: 'flex', minHeight: 0, overflow: 'hidden' }}>{children}</div>
            : <div style={{ flex: 1, overflowY: 'auto', padding: '28px', maxWidth: wide ? '100%' : 1000, width: '100%', margin: '0 auto', boxSizing: 'border-box' }}>{children}</div>
          }
        </div>
      </div>
    </>
  )
}
