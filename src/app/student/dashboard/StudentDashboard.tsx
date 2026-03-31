'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

// ── Design tokens ─────────────────────────────────────────────────────────────
const D = {
  bgMain:   '#090B10',
  bgCard:   '#14171F',
  bgHover:  '#1A1E28',
  accent:   'var(--accent, #7C3AED)',
  success:  '#22C55E',
  warning:  '#FBBF24',
  danger:   '#EF4444',
  txtPri:   '#FFFFFF',
  txtSec:   '#A1A7B3',
  border:   'rgba(255,255,255,0.06)',
  radius:   '20px',
  radiusSm: '12px',
}

// ── Small helpers ──────────────────────────────────────────────────────────────
function card(extra: any = {}): React.CSSProperties {
  return { background: D.bgCard, border: `1px solid ${D.border}`, borderRadius: D.radius, ...extra }
}
function pill(color: string): React.CSSProperties {
  return { display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 10px', borderRadius: 30, background: color + '20', color, fontSize: 11, fontWeight: 600 }
}

function ProgressBar({ pct, color = D.accent, height = 5 }: { pct: number; color?: string; height?: number }) {
  return (
    <div style={{ height, background: 'rgba(255,255,255,.07)', borderRadius: 99, overflow: 'hidden' }}>
      <div style={{ height: '100%', width: `${Math.min(pct, 100)}%`, background: color, borderRadius: 99, transition: 'width .6s ease' }} />
    </div>
  )
}

function Avatar({ src, name, size = 32, accent = D.accent }: { src?: string | null; name: string; size?: number; accent?: string }) {
  const initials = (name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
  if (src) return <img src={src} alt={name} style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: accent + '30', color: accent, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * .33, fontWeight: 700, flexShrink: 0 }}>
      {initials}
    </div>
  )
}

// ── Sidebar icon ──────────────────────────────────────────────────────────────
function SideIcon({ icon, active, href, label }: { icon: string; active?: boolean; href: string; label: string }) {
  return (
    <a href={href} title={label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 40, height: 40, borderRadius: D.radiusSm, background: active ? D.accent + '25' : 'transparent', color: active ? D.accent : D.txtSec, textDecoration: 'none', fontSize: 18, transition: 'all .15s', flexShrink: 0 }}>
      {icon}
    </a>
  )
}

export default function StudentDashboard({ profile, enrollments, completedLessonIds, tests, attempts }: {
  profile: any; enrollments: any[]; completedLessonIds: string[]; tests: any[]; attempts: any[]
}) {
  const supabase = createClient()
  const router = useRouter()
  const [searchOpen, setSearchOpen] = useState(false)
  const [now, setNow] = useState(new Date())

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60000)
    return () => clearInterval(t)
  }, [])

  // Data calcs
  const accent = profile?.accent_color ?? '#7C3AED'
  const firstName = profile?.full_name?.split(' ')[0] ?? 'studente'
  const hour = now.getHours()
  const greeting = hour < 12 ? 'Dobré ráno' : hour < 17 ? 'Dobré odpoledne' : 'Dobrý večer'

  const completedSet = new Set(completedLessonIds)
  const totalLessons = enrollments.reduce((a, e) => a + ((e.modules?.lessons ?? []).length), 0)
  const doneLessons  = completedLessonIds.length
  const overallPct   = totalLessons > 0 ? Math.round(doneLessons / totalLessons * 100) : 0

  // Find "continue learning" module — first not 100% done
  const continueModule = enrollments.find(e => {
    const total = (e.modules?.lessons ?? []).length
    const done  = (e.modules?.lessons ?? []).filter((l: any) => completedSet.has(l.id)).length
    return total > 0 && done < total
  }) ?? enrollments[0]
  const continueMod = continueModule?.modules as any
  const continueTotal = (continueMod?.lessons ?? []).length
  const continueDone  = (continueMod?.lessons ?? []).filter((l: any) => completedSet.has(l.id)).length
  const continuePct   = continueTotal > 0 ? Math.round(continueDone / continueTotal * 100) : 0

  // Upcoming test
  const pendingAttempts = new Set(attempts.filter((a: any) => ['submitted','timed_out'].includes(a.status)).map((a: any) => a.test_id))
  const openTests = tests.filter(t => !pendingAttempts.has(t.id))

  async function logout() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  // Calendar helpers
  const year = now.getFullYear(), month = now.getMonth()
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const monthName = now.toLocaleDateString('cs-CZ', { month: 'long', year: 'numeric' })

  // Module grid (up to 4 modules for the course feed)
  const moduleCards = enrollments.slice(0, 4).map(e => {
    const m = e.modules as any
    const total = (m?.lessons ?? []).length
    const done  = (m?.lessons ?? []).filter((l: any) => completedSet.has(l.id)).length
    const pct   = total > 0 ? Math.round(done / total * 100) : 0
    return { id: e.module_id, title: m?.title ?? '—', pct, total, done }
  })

  const S: Record<string, React.CSSProperties> = {
    root: { display: 'flex', minHeight: '100vh', background: D.bgMain, fontFamily: "'DM Sans', 'Instrument Sans', system-ui, sans-serif", color: D.txtPri, overflowX: 'hidden' },
    sidebar: { width: 64, flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '20px 0', gap: 6, borderRight: `1px solid ${D.border}`, background: D.bgMain, position: 'sticky', top: 0, height: '100vh', overflowY: 'auto' },
    main: { flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 },
    topbar: { display: 'flex', alignItems: 'center', gap: 12, padding: '16px 20px', borderBottom: `1px solid ${D.border}` },
    grid: { flex: 1, padding: '20px', display: 'grid', gridTemplateColumns: '1fr 2fr', gridTemplateRows: 'auto 1fr', gap: 16 },
    rightPanel: { width: 260, flexShrink: 0, padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: 14, borderLeft: `1px solid ${D.border}`, background: D.bgMain },
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700;800&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        :root { --accent: ${accent}; }
        body { background: ${D.bgMain}; color: ${D.txtPri}; }
        ::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-track { background: transparent; } ::-webkit-scrollbar-thumb { background: rgba(255,255,255,.12); border-radius: 4px; }
        .bento-hover { transition: background .15s, border-color .15s; }
        .bento-hover:hover { background: ${D.bgHover} !important; border-color: rgba(255,255,255,.1) !important; }
        .icon-btn { background: none; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; border-radius: 10px; transition: background .15s; padding: 6px; }
        .icon-btn:hover { background: rgba(255,255,255,.06); }
        @media (max-width: 900px) {
          .right-panel { display: none !important; }
          .main-grid { grid-template-columns: 1fr !important; }
        }
        @media (max-width: 640px) {
          .sidebar-full { display: none !important; }
        }
      `}</style>

      <div style={S.root}>
        {/* ── Left Sidebar ── */}
        <nav style={S.sidebar} className="sidebar-full">
          <a href="/student/dashboard" style={{ display: 'block', marginBottom: 12 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: accent, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>📚</div>
          </a>
          <SideIcon icon="🏠" active href="/student/dashboard" label="Domů" />
          <SideIcon icon="📚" href="/student/modules" label="Moduly" />
          <SideIcon icon="🧪" href="/student/tests" label="Testy" />
          <SideIcon icon="📊" href="/student/progress" label="Pokrok" />
          <SideIcon icon="🔖" href="/student/bookmarks" label="Záložky" />
          <div style={{ flex: 1 }} />
          <SideIcon icon="👤" href="/student/profile" label="Profil" />
          <button onClick={logout} title="Odhlásit se" className="icon-btn" style={{ color: D.txtSec, fontSize: 18, width: 40, height: 40 }}>↩</button>
        </nav>

        {/* ── Main content ── */}
        <div style={S.main}>

          {/* ── Topbar ── */}
          <div style={S.topbar}>
            {/* Search */}
            <button onClick={() => setSearchOpen(true)}
              style={{ flex: 1, maxWidth: 420, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 8, padding: '9px 14px', background: D.bgCard, border: `1px solid ${D.border}`, borderRadius: 30, cursor: 'text', color: D.txtSec, fontSize: 13 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
              <span style={{ flex: 1, textAlign: 'left' }}>Hledat...</span>
              <kbd style={{ fontSize: 10, padding: '2px 6px', background: 'rgba(255,255,255,.08)', borderRadius: 5, color: D.txtSec }}>⌘K</kbd>
            </button>
            <div style={{ flex: 1 }} />
            {/* Notifications placeholder */}
            <button className="icon-btn" style={{ color: D.txtSec, fontSize: 18, position: 'relative' }}>
              🔔
              <div style={{ position: 'absolute', top: 4, right: 4, width: 7, height: 7, borderRadius: '50%', background: accent, border: `2px solid ${D.bgMain}` }} />
            </button>
            {/* Avatar */}
            <a href="/student/profile" style={{ textDecoration: 'none' }}>
              <Avatar src={profile?.avatar_url} name={profile?.full_name ?? ''} size={36} accent={accent} />
            </a>
          </div>

          {/* ── Bento Grid ── */}
          <div style={{ flex: 1, padding: '20px', display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 16 }} className="main-grid">

            {/* ── LEFT COLUMN ── */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

              {/* Greeting card */}
              <div style={{ ...card({ padding: '22px 24px', overflow: 'hidden', position: 'relative', minHeight: 120 }) }}>
                {/* Glow */}
                <div style={{ position: 'absolute', top: -40, right: -40, width: 140, height: 140, borderRadius: '50%', background: accent + '18', filter: 'blur(40px)', pointerEvents: 'none' }} />
                {profile?.banner_url && (
                  <div style={{ position: 'absolute', inset: 0, background: `url(${profile.banner_url}) center/cover`, opacity: .08, borderRadius: D.radius }} />
                )}
                <div style={{ position: 'relative' }}>
                  <div style={{ fontSize: 12, color: D.txtSec, marginBottom: 4 }}>{greeting} 👋</div>
                  <h1 style={{ fontSize: 22, fontWeight: 800, color: D.txtPri, lineHeight: 1.2, marginBottom: 10 }}>{firstName}</h1>
                  {profile?.custom_status && (
                    <div style={{ fontSize: 12, color: accent, background: accent + '15', padding: '3px 10px', borderRadius: 20, display: 'inline-block' }}>{profile.custom_status}</div>
                  )}
                </div>
              </div>

              {/* Continue CTA */}
              {continueModule && (
                <a href={`/student/modules/${continueModule.module_id}`}
                  style={{ ...card({ padding: '20px 22px', background: accent, border: 'none', textDecoration: 'none', display: 'block' }), cursor: 'pointer' }}>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,.7)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.08em' }}>Pokračovat</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: '#fff', marginBottom: 6, lineHeight: 1.3 }}>{continueMod?.title ?? 'Modul'}</div>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,.7)', marginBottom: 12 }}>{continueDone}/{continueTotal} lekcí · {continuePct}%</div>
                  <ProgressBar pct={continuePct} color="rgba(255,255,255,.9)" height={4} />
                </a>
              )}

              {/* Overall stats */}
              <div style={card({ padding: '18px 20px' })}>
                <div style={{ fontSize: 11, color: D.txtSec, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 14 }}>Přehled pokroku</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontSize: 13, color: D.txtSec }}>Celkový pokrok</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: accent }}>{overallPct}%</span>
                </div>
                <ProgressBar pct={overallPct} color={accent} height={6} />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginTop: 16 }}>
                  {[
                    { icon: '📚', val: enrollments.length, lbl: 'Modulů' },
                    { icon: '✅', val: doneLessons, lbl: 'Lekcí' },
                    { icon: '🧪', val: openTests.length, lbl: 'Testů' },
                  ].map(({ icon, val, lbl }) => (
                    <div key={lbl} style={{ background: 'rgba(255,255,255,.04)', borderRadius: D.radiusSm, padding: '12px 8px', textAlign: 'center' }}>
                      <div style={{ fontSize: 18, marginBottom: 4 }}>{icon}</div>
                      <div style={{ fontSize: 20, fontWeight: 800, color: D.txtPri }}>{val}</div>
                      <div style={{ fontSize: 10, color: D.txtSec }}>{lbl}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Quick links */}
              <div style={card({ padding: '18px 20px' })}>
                <div style={{ fontSize: 11, color: D.txtSec, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 12 }}>Rychlé akce</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {[
                    { icon: '📚', label: 'Moje moduly', href: '/student/modules' },
                    { icon: '🧪', label: 'Moje testy', href: '/student/tests' },
                    { icon: '📊', label: 'Pokrok', href: '/student/progress' },
                    { icon: '🔖', label: 'Záložky', href: '/student/bookmarks' },
                  ].map(({ icon, label, href }) => (
                    <a key={href} href={href} className="bento-hover"
                      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', background: 'rgba(255,255,255,.03)', borderRadius: D.radiusSm, textDecoration: 'none', color: D.txtSec, fontSize: 13, fontWeight: 500, border: `1px solid ${D.border}` }}>
                      <span style={{ fontSize: 16 }}>{icon}</span>
                      {label}
                      <span style={{ marginLeft: 'auto', opacity: .4 }}>→</span>
                    </a>
                  ))}
                </div>
              </div>
            </div>

            {/* ── RIGHT COLUMN ── */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

              {/* Hero continue card (big) */}
              {continueModule ? (
                <a href={`/student/modules/${continueModule.module_id}`}
                  style={{ ...card({ padding: '28px 28px 24px', position: 'relative', overflow: 'hidden', textDecoration: 'none', display: 'block', minHeight: 180 }), cursor: 'pointer' }}
                  className="bento-hover">
                  {/* Gradient glow */}
                  <div style={{ position: 'absolute', top: -60, right: -60, width: 220, height: 220, borderRadius: '50%', background: accent + '20', filter: 'blur(60px)', pointerEvents: 'none' }} />
                  <div style={{ position: 'relative', display: 'flex', alignItems: 'flex-start', gap: 20 }}>
                    {/* Module icon */}
                    <div style={{ width: 60, height: 60, borderRadius: 16, background: accent + '20', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, flexShrink: 0, border: `1px solid ${accent}30` }}>
                      📖
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ ...pill(accent), marginBottom: 10 }}>▶ Pokračuj ve studiu</div>
                      <h2 style={{ fontSize: 20, fontWeight: 800, color: D.txtPri, marginBottom: 6, lineHeight: 1.3 }}>{continueMod?.title ?? 'Modul'}</h2>
                      <div style={{ fontSize: 13, color: D.txtSec, marginBottom: 16 }}>
                        {continueDone} z {continueTotal} lekcí dokončeno
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <ProgressBar pct={continuePct} color={accent} height={6} />
                        <span style={{ fontSize: 13, fontWeight: 700, color: accent, flexShrink: 0 }}>{continuePct}%</span>
                      </div>
                    </div>
                  </div>
                </a>
              ) : (
                <div style={card({ padding: '28px', textAlign: 'center' })}>
                  <div style={{ fontSize: 40, marginBottom: 12 }}>🎯</div>
                  <div style={{ fontSize: 16, fontWeight: 600, color: D.txtPri, marginBottom: 8 }}>Připrav se na nový modul</div>
                  <div style={{ fontSize: 13, color: D.txtSec, marginBottom: 16 }}>Požádej učitele o přístupový kód a začni studovat.</div>
                  <a href="/student/modules" style={{ display: 'inline-block', padding: '9px 20px', background: accent, color: '#fff', borderRadius: 10, textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>Zobrazit moduly →</a>
                </div>
              )}

              {/* Module grid */}
              {moduleCards.length > 0 && (
                <div>
                  <div style={{ fontSize: 11, color: D.txtSec, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 12 }}>Všechny moduly</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
                    {moduleCards.map(m => (
                      <a key={m.id} href={`/student/modules/${m.id}`} className="bento-hover"
                        style={{ ...card({ padding: '16px 18px', textDecoration: 'none', display: 'block' }), cursor: 'pointer' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                          <div style={{ width: 36, height: 36, borderRadius: 10, background: accent + '20', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>📚</div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: D.txtPri, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.title}</div>
                            <div style={{ fontSize: 11, color: D.txtSec }}>{m.done}/{m.total} lekcí</div>
                          </div>
                        </div>
                        <ProgressBar pct={m.pct} color={m.pct === 100 ? D.success : accent} height={4} />
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
                          <span style={{ fontSize: 11, color: D.txtSec }}>{m.pct === 100 ? '✅ Dokončeno' : `${m.pct}%`}</span>
                          {m.pct === 100 && <span style={{ fontSize: 11, color: D.success }}>🏆</span>}
                        </div>
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {/* Tests section */}
              {openTests.length > 0 && (
                <div>
                  <div style={{ fontSize: 11, color: D.txtSec, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 12 }}>Nadcházející testy</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {openTests.slice(0, 3).map(t => (
                      <a key={t.id} href={`/student/tests/${t.id}`} className="bento-hover"
                        style={{ ...card({ padding: '14px 18px', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 12 }), cursor: 'pointer' }}>
                        <div style={{ width: 36, height: 36, borderRadius: 10, background: '#7C3AED20', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17, flexShrink: 0 }}>🧪</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: D.txtPri, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</div>
                          <div style={{ fontSize: 11, color: D.txtSec }}>{t.category ?? 'Test'}{t.available_until ? ` · uzavírá ${new Date(t.available_until).toLocaleDateString('cs-CZ')}` : ''}</div>
                        </div>
                        <span style={{ ...pill(accent) }}>Spustit</span>
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Right sidebar ── */}
        <aside style={S.rightPanel} className="right-panel">

          {/* Streak widget */}
          <div style={card({ padding: '16px 18px' })}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <div style={{ width: 38, height: 38, borderRadius: 12, background: '#FBBF2420', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>🔥</div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: D.txtPri }}>Série</div>
                <div style={{ fontSize: 11, color: D.txtSec }}>Přihlašuj se každý den</div>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
              <div>
                <div style={{ fontSize: 36, fontWeight: 800, color: D.warning, lineHeight: 1 }}>—</div>
                <div style={{ fontSize: 11, color: D.txtSec, marginTop: 2 }}>dní v řadě</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 13, color: D.txtSec }}>🎮 XP</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: D.txtPri }}>—</div>
                <div style={{ fontSize: 10, color: D.txtSec }}>Brzy k dispozici</div>
              </div>
            </div>
            <div style={{ marginTop: 12, padding: '6px 10px', background: 'rgba(255,255,255,.04)', borderRadius: 8, fontSize: 11, color: D.txtSec, textAlign: 'center' }}>
              Gamifikace — připravujeme 🚀
            </div>
          </div>

          {/* Friends / community placeholder */}
          <div style={card({ padding: '16px 18px', flex: 1 })}>
            <div style={{ fontSize: 12, fontWeight: 600, color: D.txtSec, textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 12 }}>Aktivita spolužáků</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[
                { name: 'Spolužák 1', status: 'Sleduje: Lekce 3', online: true },
                { name: 'Spolužák 2', status: 'Právě se přihlásil', online: true },
                { name: 'Spolužák 3', status: 'Dokončil test', online: false },
              ].map((f, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, opacity: .6 }}>
                  <div style={{ position: 'relative', flexShrink: 0 }}>
                    <div style={{ width: 30, height: 30, borderRadius: '50%', background: `hsl(${i * 80 + 200}, 40%, 30%)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: D.txtSec }}>
                      {f.name[0]}
                    </div>
                    {f.online && <div style={{ position: 'absolute', bottom: 0, right: 0, width: 8, height: 8, borderRadius: '50%', background: D.success, border: `2px solid ${D.bgCard}` }} />}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 500, color: D.txtPri, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</div>
                    <div style={{ fontSize: 10, color: D.txtSec, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.status}</div>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 12, padding: '6px 10px', background: 'rgba(255,255,255,.04)', borderRadius: 8, fontSize: 11, color: D.txtSec, textAlign: 'center' }}>
              Profily spolužáků — v beta verzi 🔒
            </div>
          </div>

          {/* Mini calendar */}
          <div style={card({ padding: '14px 16px' })}>
            <div style={{ fontSize: 11, fontWeight: 600, color: D.txtSec, textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 10, textAlign: 'center' }}>
              {monthName}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, textAlign: 'center' }}>
              {['Po','Út','St','Čt','Pá','So','Ne'].map(d => (
                <div key={d} style={{ fontSize: 9, color: D.txtSec, padding: '2px 0', fontWeight: 600 }}>{d}</div>
              ))}
              {Array.from({ length: (firstDay === 0 ? 6 : firstDay - 1) }).map((_, i) => <div key={`e${i}`} />)}
              {Array.from({ length: daysInMonth }, (_, i) => {
                const d = i + 1
                const isToday = d === now.getDate()
                return (
                  <div key={d} style={{ fontSize: 10, padding: '3px 0', borderRadius: 6, background: isToday ? accent : 'transparent', color: isToday ? '#fff' : d < now.getDate() ? D.txtSec + '80' : D.txtSec, fontWeight: isToday ? 700 : 400 }}>
                    {d}
                  </div>
                )
              })}
            </div>
          </div>
        </aside>
      </div>
    </>
  )
}
