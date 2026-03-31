'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

const D = {
  bgMain:   '#090B10',
  bgCard:   '#14171F',
  bgHover:  '#1A1E28',
  bgMid:    '#1E2230',
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

function card(extra: any = {}): React.CSSProperties {
  return { background: D.bgCard, border: `1px solid ${D.border}`, borderRadius: D.radius, ...extra }
}

function ProgressBar({ pct, color = D.accent, height = 5 }: { pct: number; color?: string; height?: number }) {
  return (
    <div style={{ height, background: 'rgba(255,255,255,.07)', borderRadius: 99, overflow: 'hidden', flexShrink: 0 }}>
      <div style={{ height: '100%', width: `${Math.min(pct, 100)}%`, background: color, borderRadius: 99, transition: 'width .6s ease' }} />
    </div>
  )
}

function Avatar({ src, name, size = 32, accent = '#7C3AED' }: { src?: string | null; name: string; size?: number; accent?: string }) {
  const initials = (name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
  if (src) return <img src={src} alt={name} style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: accent + '30', color: accent, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * .33, fontWeight: 700, flexShrink: 0 }}>
      {initials}
    </div>
  )
}

function SideIcon({ icon, active, href, label, accent }: { icon: string; active?: boolean; href: string; label: string; accent: string }) {
  return (
    <a href={href} title={label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 40, height: 40, borderRadius: D.radiusSm, background: active ? accent + '25' : 'transparent', color: active ? accent : D.txtSec, textDecoration: 'none', fontSize: 18, transition: 'all .15s', flexShrink: 0 }}>
      {icon}
    </a>
  )
}

function SectionLabel({ children }: { children: string }) {
  return <div style={{ fontSize: 11, color: D.txtSec, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '.07em', marginBottom: 10 }}>{children}</div>
}

function ActionBtn({ icon, label, color, onClick }: { icon: string; label: string; color?: string; onClick?: () => void }) {
  return (
    <button onClick={onClick} className="bento-hover" style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '10px 14px', background: 'rgba(255,255,255,.04)', border: `1px solid ${D.border}`, borderRadius: D.radiusSm, color: color ?? D.txtSec, fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', width: '100%', textAlign: 'left' as const }}>
      <span style={{ fontSize: 16 }}>{icon}</span>
      <span style={{ flex: 1 }}>{label}</span>
    </button>
  )
}

// Module status config
function moduleStatus(pct: number, total: number) {
  if (total === 0) return { label: 'Bez lekcí', color: D.txtSec, bg: 'rgba(255,255,255,.06)' }
  if (pct === 100)  return { label: 'Dokončeno', color: D.success,  bg: D.success + '20' }
  if (pct > 0)      return { label: 'Probíhá',   color: D.warning,  bg: D.warning + '20' }
  return               { label: 'Začít',      color: D.accent,   bg: D.accent + '20' }
}

// Estimate study time (3 min per lesson)
function studyTime(total: number) {
  const mins = total * 3
  if (mins < 60) return `${mins} min`
  return `${Math.round(mins / 60)} h`
}

export default function StudentDashboard({ profile, enrollments, completedLessonIds, tests, attempts }: {
  profile: any; enrollments: any[]; completedLessonIds: string[]; tests: any[]; attempts: any[]
}) {
  const supabase = createClient()
  const router = useRouter()
  const [now, setNow] = useState(new Date())
  const [enrollOpen, setEnrollOpen] = useState(false)
  const [enrollCode, setEnrollCode] = useState('')
  const [enrolling, setEnrolling] = useState(false)
  const [enrollErr, setEnrollErr] = useState('')

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60000)
    return () => clearInterval(t)
  }, [])

  const accent = profile?.accent_color ?? '#7C3AED'
  const firstName = profile?.full_name?.split(' ')[0] ?? 'studente'
  const hour = now.getHours()
  const greeting = hour < 12 ? 'Dobré ráno' : hour < 17 ? 'Dobré odpoledne' : 'Dobrý večer'

  const completedSet = new Set(completedLessonIds)

  // Continue module
  const continueEnrollment = enrollments.find(e => {
    const total = (e.modules?.lessons ?? []).length
    const done  = (e.modules?.lessons ?? []).filter((l: any) => completedSet.has(l.id)).length
    return total > 0 && done < total
  }) ?? enrollments[0]
  const continueMod = continueEnrollment?.modules as any
  const continueTotal = (continueMod?.lessons ?? []).length
  const continueDone  = (continueMod?.lessons ?? []).filter((l: any) => completedSet.has(l.id)).length
  const continuePct   = continueTotal > 0 ? Math.round(continueDone / continueTotal * 100) : 0

  const pendingSet = new Set(attempts.filter((a: any) => ['submitted','timed_out'].includes(a.status)).map((a: any) => a.test_id))
  const openTests  = tests.filter(t => !pendingSet.has(t.id))

  // Calendar
  const year = now.getFullYear(), month = now.getMonth()
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const monthName = now.toLocaleDateString('cs-CZ', { month: 'long', year: 'numeric' })

  // All module cards
  const moduleCards = enrollments.map(e => {
    const m = e.modules as any
    const total = (m?.lessons ?? []).length
    const done  = (m?.lessons ?? []).filter((l: any) => completedSet.has(l.id)).length
    const pct   = total > 0 ? Math.round(done / total * 100) : 0
    return { id: e.module_id, title: m?.title ?? '—', pct, total, done }
  })

  async function logout() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  async function handleEnroll() {
    if (!enrollCode.trim()) return
    setEnrolling(true); setEnrollErr('')
    try {
      const res = await fetch('/api/enroll', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ access_code: enrollCode.trim().toUpperCase() }) })
      const data = await res.json()
      if (!res.ok) { setEnrollErr(data.error ?? 'Chyba'); setEnrolling(false); return }
      setEnrollOpen(false); window.location.reload()
    } catch { setEnrollErr('Chyba sítě'); setEnrolling(false) }
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300..800;1,9..40,300..800&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        :root { --accent: ${accent}; }
        html, body { background: ${D.bgMain}; color: ${D.txtPri}; font-family: 'DM Sans', system-ui, sans-serif; }
        ::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-thumb { background: rgba(255,255,255,.1); border-radius: 4px; }
        .bento-hover { transition: background .15s, border-color .15s, box-shadow .15s; }
        .bento-hover:hover { background: ${D.bgHover} !important; border-color: rgba(255,255,255,.1) !important; }
        .icon-btn { background: none; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; border-radius: 10px; transition: background .15s; padding: 6px; color: ${D.txtSec}; }
        .icon-btn:hover { background: rgba(255,255,255,.06); }
        .mod-card:hover .mod-overlay { opacity: 1 !important; }
        @media (max-width: 1100px) { .right-panel { display: none !important; } }
        @media (max-width: 860px)  { .main-grid  { grid-template-columns: 1fr !important; } }
        @media (max-width: 640px)  { .sidebar-full { display: none !important; } }
      `}</style>

      {/* Enroll modal */}
      {enrollOpen && (
        <>
          <div onClick={() => setEnrollOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', zIndex: 9998, backdropFilter: 'blur(4px)' }} />
          <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', zIndex: 9999, width: '100%', maxWidth: 380, padding: '0 16px' }}>
            <div style={{ background: D.bgCard, borderRadius: D.radius, padding: '32px 28px', border: `1px solid ${D.border}`, boxShadow: `0 0 60px ${accent}30` }}>
              <div style={{ fontSize: 36, textAlign: 'center', marginBottom: 12 }}>🔑</div>
              <h2 style={{ fontSize: 18, fontWeight: 700, textAlign: 'center', marginBottom: 6, color: D.txtPri }}>Přihlásit se do modulu</h2>
              <p style={{ fontSize: 13, color: D.txtSec, textAlign: 'center', marginBottom: 20 }}>Zadejte kód, který vám dal učitel</p>
              <input value={enrollCode} onChange={e => setEnrollCode(e.target.value.toUpperCase())}
                onKeyDown={e => e.key === 'Enter' && handleEnroll()} placeholder="např. MAT-2026" autoFocus
                style={{ width: '100%', padding: '11px 14px', background: D.bgMid, border: `1px solid ${D.border}`, borderRadius: D.radiusSm, fontSize: 16, color: D.txtPri, fontFamily: 'monospace', textAlign: 'center', letterSpacing: '.1em', outline: 'none', marginBottom: 8 }} />
              {enrollErr && <div style={{ fontSize: 12, color: D.danger, marginBottom: 10, textAlign: 'center' }}>{enrollErr}</div>}
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={handleEnroll} disabled={enrolling || !enrollCode.trim()}
                  style={{ flex: 1, padding: '11px', background: accent, color: '#fff', border: 'none', borderRadius: D.radiusSm, fontSize: 14, fontWeight: 600, cursor: 'pointer', opacity: enrolling ? .6 : 1, fontFamily: 'inherit' }}>
                  {enrolling ? '…' : 'Pokračovat'}
                </button>
                <button onClick={() => setEnrollOpen(false)} style={{ padding: '11px 16px', background: 'rgba(255,255,255,.06)', color: D.txtSec, border: `1px solid ${D.border}`, borderRadius: D.radiusSm, cursor: 'pointer', fontFamily: 'inherit' }}>Zrušit</button>
              </div>
            </div>
          </div>
        </>
      )}

      <div style={{ display: 'flex', minHeight: '100vh', background: D.bgMain, color: D.txtPri, overflowX: 'hidden' }}>

        {/* ── Left sidebar ── */}
        <nav className="sidebar-full" style={{ width: 64, flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '20px 0 16px', borderRight: `1px solid ${D.border}`, background: D.bgMain, position: 'sticky', top: 0, height: '100vh' }}>
          {/* Logo with big gap below */}
          <a href="/student/dashboard" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 40, height: 40, borderRadius: 12, background: accent, fontSize: 20, textDecoration: 'none', flexShrink: 0, marginBottom: 28 }}>
            📚
          </a>
          {/* Nav icons */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
            <SideIcon icon="🏠" active href="/student/dashboard" label="Domů" accent={accent} />
            <SideIcon icon="📖" href="/student/modules" label="Moduly" accent={accent} />
            <SideIcon icon="🧪" href="/student/tests" label="Testy" accent={accent} />
            <SideIcon icon="📊" href="/student/progress" label="Pokrok" accent={accent} />
            <SideIcon icon="🔖" href="/student/bookmarks" label="Záložky" accent={accent} />
          </div>
          {/* Bottom */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <SideIcon icon="👤" href="/student/profile" label="Profil" accent={accent} />
            <button onClick={logout} title="Odhlásit se" className="icon-btn" style={{ width: 40, height: 40, fontSize: 18 }}>↩</button>
          </div>
        </nav>

        {/* ── Main ── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>

          {/* ── Topbar: centered search ── */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', padding: '14px 20px', borderBottom: `1px solid ${D.border}`, gap: 12 }}>
            {/* Left spacer */}
            <div />
            {/* Centered search */}
            <a href="/student/modules"
              onClick={e => { e.preventDefault(); document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true })) }}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 16px', background: D.bgCard, border: `1px solid ${D.border}`, borderRadius: 30, cursor: 'text', color: D.txtSec, fontSize: 13, textDecoration: 'none', width: 360 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
              <span style={{ flex: 1 }}>Hledat...</span>
              <kbd style={{ fontSize: 10, padding: '2px 6px', background: 'rgba(255,255,255,.08)', borderRadius: 5 }}>⌘K</kbd>
            </a>
            {/* Right: bell + avatar */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'flex-end' }}>
              <button className="icon-btn" style={{ fontSize: 18, position: 'relative' }}>
                🔔
                <div style={{ position: 'absolute', top: 5, right: 5, width: 7, height: 7, borderRadius: '50%', background: accent, border: `2px solid ${D.bgMain}` }} />
              </button>
              <a href="/student/profile" style={{ textDecoration: 'none' }}>
                <Avatar src={profile?.avatar_url} name={profile?.full_name ?? ''} size={36} accent={accent} />
              </a>
            </div>
          </div>

          {/* ── Bento grid ── */}
          <div style={{ flex: 1, padding: '20px', display: 'grid', gridTemplateColumns: '300px 1fr', gap: 16, alignItems: 'start' }} className="main-grid">

            {/* ══ LEFT COLUMN ══ */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

              {/* Row 1: Greeting + Continue side by side */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                {/* Greeting */}
                <div style={{ ...card({ padding: '18px 16px', overflow: 'hidden', position: 'relative', minHeight: 110 }) }}>
                  <div style={{ position: 'absolute', top: -30, right: -30, width: 100, height: 100, borderRadius: '50%', background: accent + '18', filter: 'blur(30px)', pointerEvents: 'none' }} />
                  {profile?.banner_url && <div style={{ position: 'absolute', inset: 0, background: `url(${profile.banner_url}) center/cover`, opacity: .07, borderRadius: D.radius }} />}
                  <div style={{ position: 'relative' }}>
                    <div style={{ fontSize: 11, color: D.txtSec, marginBottom: 3 }}>{greeting} 👋</div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: D.txtPri, lineHeight: 1.2, marginBottom: 6 }}>{firstName}</div>
                    {profile?.custom_status && <div style={{ fontSize: 11, color: accent, background: accent + '15', padding: '2px 8px', borderRadius: 20, display: 'inline-block' }}>{profile.custom_status}</div>}
                  </div>
                </div>
                {/* Continue CTA */}
                {continueEnrollment ? (
                  <a href={`/student/modules/${continueEnrollment.module_id}`}
                    style={{ ...card({ padding: '16px', background: accent, border: 'none', textDecoration: 'none', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: 110 }), cursor: 'pointer' }}>
                    <div>
                      <div style={{ fontSize: 10, color: 'rgba(255,255,255,.65)', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 4 }}>Pokračovat</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', lineHeight: 1.3, marginBottom: 4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as any, overflow: 'hidden' }}>{continueMod?.title ?? 'Modul'}</div>
                      <div style={{ fontSize: 11, color: 'rgba(255,255,255,.6)' }}>{continueDone}/{continueTotal} lekcí</div>
                    </div>
                    <ProgressBar pct={continuePct} color="rgba(255,255,255,.85)" height={3} />
                  </a>
                ) : (
                  <a href="/student/modules" style={{ ...card({ padding: '16px', border: `1px dashed ${D.border}`, textDecoration: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 110, gap: 8 }) }}>
                    <div style={{ fontSize: 24 }}>➕</div>
                    <div style={{ fontSize: 12, color: D.txtSec, textAlign: 'center' }}>Přihlásit se do modulu</div>
                  </a>
                )}
              </div>

              {/* Quick actions — editor tools */}
              <div style={card({ padding: '16px 18px' })}>
                <SectionLabel>Rychlé akce</SectionLabel>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {[
                    { icon: '🐍', label: 'Python editor',    color: '#3B82F6' },
                    { icon: '📓', label: 'Jupyter Notebook', color: '#F97316' },
                    { icon: '🌐', label: 'HTML editor',       color: '#E34C26' },
                    { icon: '🗄️',  label: 'SQL editor',       color: '#00758F' },
                  ].map(({ icon, label, color }) => (
                    <button key={label} className="bento-hover"
                      style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', background: color + '15', border: `1px solid ${color}30`, borderRadius: D.radiusSm, color: color, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' as const }}>
                      <span style={{ fontSize: 17 }}>{icon}</span>
                      <span>{label.split(' ')[0]}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Other tools */}
              <div style={card({ padding: '16px 18px' })}>
                <SectionLabel>Další nástroje</SectionLabel>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                  {[
                    { icon: '📁', label: 'Moje soubory', href: '#' },
                    { icon: '🔖', label: 'Záložky',       href: '/student/bookmarks' },
                    { icon: '💬', label: 'Chat',           href: '#' },
                  ].map(({ icon, label, href }) => (
                    <a key={label} href={href} className="bento-hover"
                      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '12px 8px', background: 'rgba(255,255,255,.04)', border: `1px solid ${D.border}`, borderRadius: D.radiusSm, textDecoration: 'none', color: D.txtSec, fontSize: 11, fontWeight: 500, textAlign: 'center' as const }}>
                      <span style={{ fontSize: 20 }}>{icon}</span>
                      {label}
                    </a>
                  ))}
                </div>
              </div>

              {/* Tests section */}
              <div style={card({ padding: '16px 18px' })}>
                <SectionLabel>Testy</SectionLabel>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {/* Left col: two stacked buttons */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <a href="/student/tests"
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '11px', background: 'rgba(255,255,255,.05)', border: `1px solid ${D.border}`, borderRadius: D.radiusSm, textDecoration: 'none', color: D.txtPri, fontSize: 12, fontWeight: 600, textAlign: 'center' as const }}
                      className="bento-hover">
                      🧪 Spustit test
                    </a>
                    <a href="/student/tests/history"
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '11px', background: 'rgba(255,255,255,.05)', border: `1px solid ${D.border}`, borderRadius: D.radiusSm, textDecoration: 'none', color: D.txtSec, fontSize: 12, fontWeight: 500, textAlign: 'center' as const }}
                      className="bento-hover">
                      📊 Historie testů
                    </a>
                  </div>
                  {/* Right col: big Practice button */}
                  <a href="/student/tests"
                    style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '14px 10px', background: accent + '20', border: `1px solid ${accent}40`, borderRadius: D.radiusSm, textDecoration: 'none', color: accent, fontSize: 13, fontWeight: 700, textAlign: 'center' as const }}
                    className="bento-hover">
                    <span style={{ fontSize: 26 }}>🎯</span>
                    Procvičování
                  </a>
                </div>
              </div>

            </div>

            {/* ══ RIGHT COLUMN ══ */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

              {/* All modules section */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <SectionLabel>Všechny moduly</SectionLabel>
                  <span style={{ fontSize: 11, color: D.txtSec }}>{enrollments.length} modulů</span>
                </div>

                {moduleCards.length === 0 ? (
                  <div style={{ ...card({ padding: '40px 20px', textAlign: 'center' }) }}>
                    <div style={{ fontSize: 36, marginBottom: 12 }}>📚</div>
                    <div style={{ fontSize: 14, color: D.txtSec, marginBottom: 16 }}>Zatím nejsi zapsán v žádném modulu.</div>
                    <button onClick={() => setEnrollOpen(true)}
                      style={{ padding: '10px 20px', background: accent, color: '#fff', border: 'none', borderRadius: D.radiusSm, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                      + Přihlásit se do modulu
                    </button>
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 14 }}>
                    {moduleCards.map(m => {
                      const st = moduleStatus(m.pct, m.total)
                      return (
                        <a key={m.id} href={`/student/modules/${m.id}`} className="mod-card bento-hover"
                          style={{ ...card({ textDecoration: 'none', display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative', cursor: 'pointer' }) }}>
                          {/* Image area */}
                          <div style={{ height: 120, background: `linear-gradient(135deg, ${accent}25 0%, rgba(255,255,255,.04) 100%)`, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            {/* Status badge top-left */}
                            <div style={{ position: 'absolute', top: 10, left: 10, padding: '3px 9px', borderRadius: 20, background: st.bg, color: st.color, fontSize: 10, fontWeight: 700 }}>
                              {st.label}
                            </div>
                            {/* Lesson count top-right */}
                            <div style={{ position: 'absolute', top: 10, right: 10, fontSize: 10, color: D.txtSec, background: 'rgba(0,0,0,.3)', padding: '2px 7px', borderRadius: 20 }}>
                              {m.total} lekcí
                            </div>
                            {/* Module icon */}
                            <div style={{ fontSize: 44, opacity: .8 }}>📚</div>
                            {/* Study time bottom-right */}
                            <div style={{ position: 'absolute', bottom: 8, right: 10, fontSize: 10, color: D.txtSec, background: 'rgba(0,0,0,.3)', padding: '2px 7px', borderRadius: 20 }}>
                              ⏱ {studyTime(m.total)}
                            </div>
                          </div>
                          {/* Info */}
                          <div style={{ padding: '12px 14px 14px' }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: D.txtPri, marginBottom: 8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.title}</div>
                            <ProgressBar pct={m.pct} color={m.pct === 100 ? D.success : accent} height={4} />
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 11, color: D.txtSec }}>
                              <span>{m.done}/{m.total} dokončeno</span>
                              <span style={{ color: m.pct === 100 ? D.success : accent, fontWeight: 600 }}>{m.pct}%</span>
                            </div>
                          </div>
                        </a>
                      )
                    })}
                  </div>
                )}

                {/* Join module button */}
                <button onClick={() => setEnrollOpen(true)}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', marginTop: 12, padding: '11px', background: 'transparent', border: `1px dashed rgba(255,255,255,.15)`, borderRadius: D.radiusSm, color: D.txtSec, fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', transition: 'border-color .15s, color .15s' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = accent; (e.currentTarget as HTMLElement).style.color = accent }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,.15)'; (e.currentTarget as HTMLElement).style.color = D.txtSec }}>
                  ➕ Přihlásit se do dalšího modulu
                </button>
              </div>

              {/* Open tests — if any */}
              {openTests.length > 0 && (
                <div>
                  <SectionLabel>Nadcházející testy</SectionLabel>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {openTests.slice(0, 3).map(t => (
                      <a key={t.id} href={`/student/tests/${t.id}`} className="bento-hover"
                        style={{ ...card({ padding: '12px 16px', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 12 }), cursor: 'pointer' }}>
                        <div style={{ width: 34, height: 34, borderRadius: 10, background: accent + '20', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>🧪</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: D.txtPri, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</div>
                          <div style={{ fontSize: 11, color: D.txtSec }}>{t.category ?? 'Test'}{t.available_until ? ` · do ${new Date(t.available_until).toLocaleDateString('cs-CZ')}` : ''}</div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 20, background: accent + '20', color: accent, fontSize: 11, fontWeight: 700, flexShrink: 0 }}>Spustit</div>
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Right sidebar ── */}
        <aside className="right-panel" style={{ width: 256, flexShrink: 0, padding: '20px 14px', display: 'flex', flexDirection: 'column', gap: 14, borderLeft: `1px solid ${D.border}`, background: D.bgMain, overflowY: 'auto', maxHeight: '100vh', position: 'sticky', top: 0 }}>

          {/* Streak */}
          <div style={card({ padding: '16px' })}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: '#FBBF2420', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>🔥</div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: D.txtPri }}>Série</div>
                <div style={{ fontSize: 10, color: D.txtSec }}>Přihlašuj se každý den</div>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 10 }}>
              <div><div style={{ fontSize: 32, fontWeight: 800, color: D.warning, lineHeight: 1 }}>—</div><div style={{ fontSize: 10, color: D.txtSec }}>dní v řadě</div></div>
              <div style={{ textAlign: 'right' }}><div style={{ fontSize: 11, color: D.txtSec }}>🎮 XP</div><div style={{ fontSize: 18, fontWeight: 700, color: D.txtPri }}>—</div></div>
            </div>
            <div style={{ padding: '5px 8px', background: 'rgba(255,255,255,.04)', borderRadius: 8, fontSize: 10, color: D.txtSec, textAlign: 'center' }}>Gamifikace — připravujeme 🚀</div>
          </div>

          {/* Friends */}
          <div style={{ ...card({ padding: '16px' }), flex: 1 }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: D.txtSec, textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 12 }}>Aktivita spolužáků</div>
            {[{ name: 'Spolužák 1', st: 'Sleduje: Lekce 3', on: true }, { name: 'Spolužák 2', st: 'Právě online', on: true }, { name: 'Spolužák 3', st: 'Dokončil test', on: false }].map((f, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, opacity: .55 }}>
                <div style={{ position: 'relative', flexShrink: 0 }}>
                  <div style={{ width: 28, height: 28, borderRadius: '50%', background: `hsl(${i * 80 + 200},35%,28%)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: D.txtSec }}>{f.name[0]}</div>
                  {f.on && <div style={{ position: 'absolute', bottom: 0, right: 0, width: 7, height: 7, borderRadius: '50%', background: D.success, border: `2px solid ${D.bgCard}` }} />}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, fontWeight: 500, color: D.txtPri, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</div>
                  <div style={{ fontSize: 10, color: D.txtSec, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.st}</div>
                </div>
              </div>
            ))}
            <div style={{ padding: '5px 8px', background: 'rgba(255,255,255,.04)', borderRadius: 8, fontSize: 10, color: D.txtSec, textAlign: 'center' }}>Profily spolužáků — beta 🔒</div>
          </div>

          {/* Calendar */}
          <div style={card({ padding: '14px' })}>
            <div style={{ fontSize: 10, fontWeight: 600, color: D.txtSec, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 10, textAlign: 'center' }}>{monthName}</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 2, textAlign: 'center' }}>
              {['Po','Út','St','Čt','Pá','So','Ne'].map(d => <div key={d} style={{ fontSize: 8, color: D.txtSec, padding: '2px 0', fontWeight: 600 }}>{d}</div>)}
              {Array.from({ length: firstDay === 0 ? 6 : firstDay - 1 }).map((_, i) => <div key={`e${i}`} />)}
              {Array.from({ length: daysInMonth }, (_, i) => {
                const d = i + 1, isToday = d === now.getDate()
                return <div key={d} style={{ fontSize: 10, padding: '3px 0', borderRadius: 5, background: isToday ? accent : 'transparent', color: isToday ? '#fff' : d < now.getDate() ? D.txtSec + '60' : D.txtSec, fontWeight: isToday ? 700 : 400 }}>{d}</div>
              })}
            </div>
          </div>
        </aside>
      </div>
    </>
  )
}
