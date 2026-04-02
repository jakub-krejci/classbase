'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from 'react'
import { D } from '@/components/DarkLayout'

// ── Teacher layout (mirrors DarkLayout but for teacher role) ───────────────────
const T = {
  accent: '#185FA5',
  accentLight: '#185FA515',
  accentBorder: '#185FA530',
}

// ── Tag colours ────────────────────────────────────────────────────────────────
const TAG_COLORS: Record<string, { bg: string; text: string }> = {
  Math:        { bg: '#6366F120', text: '#818CF8' },
  Programming: { bg: '#3B82F620', text: '#60A5FA' },
  Science:     { bg: '#10B98120', text: '#34D399' },
  Language:    { bg: '#F59E0B20', text: '#FCD34D' },
  History:     { bg: '#EF444420', text: '#FCA5A5' },
  Art:         { bg: '#EC489920', text: '#F9A8D4' },
  Other:       { bg: '#8B5CF620', text: '#C4B5FD' },
}

function tagStyle(tag?: string) {
  return TAG_COLORS[tag ?? ''] ?? TAG_COLORS.Other
}

function fmtDate(iso: string) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'short', year: 'numeric' })
}

// ── Stat card ─────────────────────────────────────────────────────────────────
function StatCard({ icon, label, value }: { icon: string; label: string; value: number }) {
  return (
    <div style={{ background: D.bgCard, border: `1px solid ${D.border}`, borderRadius: 16, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 14 }}>
      <div style={{ width: 42, height: 42, borderRadius: 12, background: T.accentLight, border: `1px solid ${T.accentBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>
        {icon}
      </div>
      <div>
        <div style={{ fontSize: 26, fontWeight: 800, color: D.txtPri, lineHeight: 1.1 }}>{value}</div>
        <div style={{ fontSize: 12, color: D.txtSec, marginTop: 2 }}>{label}</div>
      </div>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function TeacherModulesClient({ profile, modules, counts }: {
  profile: any
  modules: any[]
  counts: Record<string, { lessons: number; enrollments: number }>
}) {
  const [search, setSearch] = useState('')
  const accent = profile?.accent_color ?? T.accent

  const totalLessons = modules.reduce((a, m) => a + (counts[m.id]?.lessons ?? 0), 0)
  const totalEnr     = modules.reduce((a, m) => a + (counts[m.id]?.enrollments ?? 0), 0)

  const filtered = modules.filter(m =>
    !search ||
    m.title.toLowerCase().includes(search.toLowerCase()) ||
    m.description?.toLowerCase().includes(search.toLowerCase()) ||
    m.tag?.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300..800;1,9..40,300..800&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        :root { --accent: ${accent}; }
        html, body { background: ${D.bgMain}; color: ${D.txtPri}; font-family: 'DM Sans', system-ui, sans-serif; }
        ::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-thumb { background: rgba(255,255,255,.1); border-radius: 4px; }
        .mod-card { transition: border-color .15s, transform .15s, box-shadow .15s; }
        .mod-card:hover { border-color: ${accent}50 !important; transform: translateY(-2px); box-shadow: 0 8px 32px rgba(0,0,0,.3) !important; }
        .mod-action { transition: background .12s, color .12s; }
        .mod-action:hover { background: rgba(255,255,255,.06) !important; }
        .search-inp:focus { border-color: ${accent}80 !important; }
      `}</style>

      <div style={{ minHeight: '100vh', background: D.bgMain, padding: '32px 24px', maxWidth: 1200, margin: '0 auto' }}>

        {/* ── Header ── */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 28, flexWrap: 'wrap' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
              <div style={{ width: 40, height: 40, borderRadius: 11, background: T.accentLight, border: `1px solid ${T.accentBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>📚</div>
              <h1 style={{ fontSize: 22, fontWeight: 800, color: D.txtPri, margin: 0 }}>Moje moduly</h1>
            </div>
            <p style={{ fontSize: 12, color: D.txtSec, margin: 0, paddingLeft: 52 }}>
              {modules.length} {modules.length === 1 ? 'modul' : modules.length < 5 ? 'moduly' : 'modulů'} · {totalLessons} lekcí · {totalEnr} zapsaných studentů
            </p>
          </div>
          <a href="/teacher/modules/new"
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 20px', background: accent, color: '#fff', borderRadius: 12, textDecoration: 'none', fontSize: 14, fontWeight: 700, flexShrink: 0, boxShadow: `0 4px 16px ${accent}40` }}>
            <span style={{ fontSize: 18, lineHeight: 1 }}>+</span> Nový modul
          </a>
        </div>

        {/* ── Stats ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 28 }}>
          <StatCard icon="📚" label="Celkem modulů" value={modules.length} />
          <StatCard icon="📖" label="Celkem lekcí" value={totalLessons} />
          <StatCard icon="👥" label="Zapsaní studenti" value={totalEnr} />
        </div>

        {/* ── Search ── */}
        {modules.length > 0 && (
          <div style={{ position: 'relative', marginBottom: 24, maxWidth: 400 }}>
            <span style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', fontSize: 14, color: D.txtSec, pointerEvents: 'none' }}>🔍</span>
            <input className="search-inp" value={search} onChange={e => setSearch(e.target.value)} placeholder="Hledat moduly…"
              style={{ width: '100%', padding: '10px 14px 10px 38px', background: D.bgCard, border: `1px solid ${D.border}`, borderRadius: 11, fontSize: 13, color: D.txtPri, fontFamily: 'inherit', outline: 'none', transition: 'border-color .2s', boxSizing: 'border-box' as const }} />
            {search && <button onClick={() => setSearch('')} style={{ position: 'absolute', right: 11, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: D.txtSec, fontSize: 16 }}>✕</button>}
          </div>
        )}

        {/* ── Empty ── */}
        {modules.length === 0 && (
          <div style={{ background: D.bgCard, border: `2px dashed ${D.border}`, borderRadius: 20, padding: '72px 24px', textAlign: 'center' }}>
            <div style={{ fontSize: 52, marginBottom: 16, opacity: .5 }}>📚</div>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: D.txtPri, marginBottom: 8 }}>Zatím nemáte žádné moduly</h2>
            <p style={{ fontSize: 13, color: D.txtSec, marginBottom: 24 }}>Vytvořte svůj první modul a začněte přidávat lekce.</p>
            <a href="/teacher/modules/new"
              style={{ padding: '11px 28px', background: accent, color: '#fff', borderRadius: 11, textDecoration: 'none', fontSize: 14, fontWeight: 700 }}>
              + Vytvořit první modul
            </a>
          </div>
        )}

        {modules.length > 0 && filtered.length === 0 && (
          <div style={{ background: D.bgCard, border: `1px solid ${D.border}`, borderRadius: 16, padding: '40px 24px', textAlign: 'center', color: D.txtSec }}>
            <div style={{ fontSize: 28, marginBottom: 10, opacity: .4 }}>🔍</div>
            <div style={{ fontSize: 13 }}>Žádné moduly neodpovídají hledání</div>
            <button onClick={() => setSearch('')} style={{ marginTop: 12, padding: '6px 16px', background: D.bgMid, color: D.txtSec, border: `1px solid ${D.border}`, borderRadius: 8, cursor: 'pointer', fontSize: 12, fontFamily: 'inherit' }}>Zrušit hledání</button>
          </div>
        )}

        {/* ── Module grid ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
          {filtered.map(m => {
            const lessonCount  = counts[m.id]?.lessons ?? 0
            const studentCount = counts[m.id]?.enrollments ?? 0
            const tc = tagStyle(m.tag)

            return (
              <div key={m.id} className="mod-card"
                style={{ background: D.bgCard, border: `1px solid ${D.border}`, borderRadius: 18, overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 2px 8px rgba(0,0,0,.15)' }}>

                {/* Top accent bar */}
                <div style={{ height: 3, background: accent }} />

                {/* Main clickable area */}
                <a href={`/teacher/modules/${m.id}`}
                  style={{ display: 'block', padding: '18px 20px 14px', textDecoration: 'none', flex: 1 }}>

                  {/* Tag + unlock mode */}
                  <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
                    {m.tag && (
                      <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: tc.bg, color: tc.text }}>
                        {m.tag}
                      </span>
                    )}
                    {m.unlock_mode === 'sequential' && (
                      <span style={{ fontSize: 10, padding: '3px 8px', borderRadius: 20, background: 'rgba(255,255,255,.06)', color: D.txtSec }}>
                        🔒 Sekvenční
                      </span>
                    )}
                  </div>

                  {/* Title */}
                  <div style={{ fontSize: 16, fontWeight: 800, color: D.txtPri, lineHeight: 1.3, marginBottom: 8, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as any }}>
                    {m.title}
                  </div>

                  {/* Description */}
                  {m.description && (
                    <div style={{ fontSize: 12, color: D.txtSec, lineHeight: 1.55, marginBottom: 14, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as any }}>
                      {m.description}
                    </div>
                  )}

                  {/* Stats row */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14, paddingTop: 12, borderTop: `1px solid ${D.border}` }}>
                    <span style={{ fontSize: 12, color: D.txtSec, display: 'flex', alignItems: 'center', gap: 4 }}>📖 <strong style={{ color: D.txtPri }}>{lessonCount}</strong> lekcí</span>
                    <span style={{ fontSize: 12, color: D.txtSec, display: 'flex', alignItems: 'center', gap: 4 }}>👥 <strong style={{ color: D.txtPri }}>{studentCount}</strong> studentů</span>
                    <span style={{ marginLeft: 'auto', fontFamily: 'monospace', fontSize: 11, background: D.bgMid, padding: '2px 8px', borderRadius: 6, color: D.txtSec, letterSpacing: '.05em', border: `1px solid ${D.border}` }}>
                      {m.access_code}
                    </span>
                  </div>
                </a>

                {/* Date row */}
                <div style={{ padding: '6px 20px', borderTop: `1px solid ${D.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 10, color: D.txtSec, opacity: .6 }}>Vytvořeno {fmtDate(m.created_at)}</span>
                </div>

                {/* Quick action footer */}
                <div style={{ display: 'flex', borderTop: `1px solid ${D.border}`, background: D.bgMid }}>
                  {[
                    { href: `/teacher/modules/${m.id}/lessons/new`,       label: '+ Lekce',  color: accent },
                    { href: `/teacher/modules/${m.id}/lessons/new-video`, label: '🎬 Video',  color: '#F59E0B' },
                    { href: `/teacher/modules/${m.id}/edit`,               label: '✏ Upravit', color: D.txtSec },
                    { href: `/teacher/modules/${m.id}`,                    label: '⚙ Detail',  color: D.txtSec },
                  ].map((action, i) => (
                    <a key={i} href={action.href} className="mod-action"
                      style={{ flex: 1, padding: '10px 0', textAlign: 'center' as const, fontSize: 12, fontWeight: i === 0 ? 700 : 400, color: action.color, textDecoration: 'none', borderRight: i < 3 ? `1px solid ${D.border}` : 'none' }}>
                      {action.label}
                    </a>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </>
  )
}
