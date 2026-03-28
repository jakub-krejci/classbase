'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from 'react'

function Avatar({ url, name, size = 64, color = '#185FA5' }: {
  url?: string | null; name: string; size?: number; color?: string
}) {
  const initials = (name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
  if (url) return (
    <img src={url} alt={name}
      style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', border: '3px solid rgba(255,255,255,.3)', boxShadow: '0 2px 10px rgba(0,0,0,.1)', flexShrink: 0 }} />
  )
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: color + '22', color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.33, fontWeight: 700, border: `3px solid ${color}33`, flexShrink: 0 }}>
      {initials}
    </div>
  )
}

function ProgressRing({ pct, size = 48, color = '#185FA5' }: { pct: number; size?: number; color?: string }) {
  const r = (size - 6) / 2
  const circ = 2 * Math.PI * r
  const dash = (pct / 100) * circ
  const c = pct === 100 ? '#22c55e' : color
  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)', flexShrink: 0 }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#f3f4f6" strokeWidth={5} />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={c} strokeWidth={5}
        strokeDasharray={`${dash} ${circ}`} strokeLinecap="round" style={{ transition: 'stroke-dasharray .5s' }} />
      <text x={size/2} y={size/2} textAnchor="middle" dominantBaseline="central"
        style={{ transform: `rotate(90deg)`, transformOrigin: `${size/2}px ${size/2}px`, fill: c, fontSize: size * 0.24, fontWeight: 700, fontFamily: 'inherit' }}>
        {pct}%
      </text>
    </svg>
  )
}

export default function StudentDashboard({ profile, enrollments, completedLessonIds, tests, attempts }: {
  profile: any; enrollments: any[]; completedLessonIds: string[]
  tests: any[]; attempts: any[]
}) {
  const completedSet = new Set(completedLessonIds)
  const firstName = profile.full_name?.split(' ')[0] ?? 'Student'
  const accent = profile.accent_color ?? '#185FA5'

  // Module stats
  const totalLessons = enrollments.reduce((s, e) => s + (e.modules?.lessons?.length ?? 0), 0)
  const completedLessons = enrollments.reduce((s, e) => {
    const ids: string[] = (e.modules?.lessons ?? []).map((l: any) => l.id)
    return s + ids.filter(id => completedSet.has(id)).length
  }, 0)
  const completedModules = enrollments.filter(e => {
    const ids: string[] = (e.modules?.lessons ?? []).map((l: any) => l.id)
    return ids.length > 0 && ids.every(id => completedSet.has(id))
  }).length
  const overallPct = totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0

  // Test stats
  const submittedAttempts = attempts.filter(a => a.status === 'submitted')
  const avgScore = submittedAttempts.length
    ? Math.round(submittedAttempts.reduce((s, a) => s + ((a.final_score ?? a.score ?? 0) / (a.max_score || 1)) * 100, 0) / submittedAttempts.length)
    : null
  const pendingTests = tests.filter(t => !attempts.find(a => a.test_id === t.id && ['submitted','timed_out'].includes(a.status)))

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Dobré ráno' : hour < 17 ? 'Dobré odpoledne' : 'Dobrý večer'

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      {/* Mobile styles */}
      <style>{`
        @media (max-width: 640px) {
          .db-grid { grid-template-columns: 1fr !important; }
          .db-stats { grid-template-columns: 1fr 1fr !important; }
          .db-hero-right { display: none !important; }
        }
      `}</style>

      {/* ── Hero card ── */}
      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 20, marginBottom: 24, overflow: 'hidden', boxShadow: '0 2px 12px rgba(0,0,0,.04)' }}>
        {/* Banner or accent strip */}
        {profile.banner_url
          ? <div style={{ height: 80, background: `url(${profile.banner_url}) center/cover no-repeat`, position: 'relative' }}>
              <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.15)' }} />
            </div>
          : <div style={{ height: 6, background: accent }} />
        }
        <div className="db-hero-inner" style={{ padding: profile.banner_url ? '12px 24px 20px' : '20px 24px', display: 'flex', alignItems: 'center', gap: 16, marginTop: profile.banner_url ? -36 : 0 }}>
          {/* Avatar — always visible, never collapses */}
          <Avatar url={profile.avatar_url} name={profile.full_name ?? 'S'} size={64} color={accent} />

          {/* Name + meta — takes remaining space */}
          <div className="db-hero-text" style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, color: '#aaa', marginBottom: 2 }}>{greeting} 👋</div>
            <h1 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 4px', color: '#111', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {profile.full_name}
            </h1>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {profile.student_class && <span style={{ fontSize: 11, color: '#888' }}>🏫 {profile.student_class}</span>}
              {profile.grade_level && <span style={{ fontSize: 11, color: '#888' }}>📚 {profile.grade_level}</span>}
              {profile.pronouns && <span style={{ fontSize: 11, color: '#888' }}>({profile.pronouns})</span>}
              {!profile.student_class && !profile.grade_level && (
                <a href="/student/profile" style={{ fontSize: 11, color: accent, textDecoration: 'none' }}>+ Complete profile</a>
              )}
            </div>
          </div>

          {/* Progress ring + edit — on mobile becomes a bottom row */}
          <div className="db-hero-right" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, flexShrink: 0 }}>
            {totalLessons > 0 && (
              <div className="db-hero-ring-label" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                <ProgressRing pct={overallPct} size={54} color={accent} />
                <span style={{ fontSize: 10, color: '#aaa' }}>Overall</span>
              </div>
            )}
            <a href="/student/profile"
              style={{ padding: '6px 12px', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 11, fontWeight: 500, color: '#555', textDecoration: 'none', whiteSpace: 'nowrap' }}>
              ✎ Edit
            </a>
          </div>
        </div>
      </div>

      {/* ── Stat chips ── */}
      <div className="db-stats" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 24 }}>
        {[
          { icon: '📚', label: 'Moduly', value: enrollments.length, href: '/student/modules', color: accent },
          { icon: '✅', label: 'Splněné lekce', value: `${completedLessons}/${totalLessons}`, href: '/student/progress', color: '#16a34a' },
          { icon: '🏆', label: 'Dokončeno', value: completedModules, href: '/student/progress', color: '#6c47ff' },
          ...(avgScore !== null ? [{ icon: '📊', label: 'Průměr', value: `${avgScore}%`, href: '/student/tests/history', color: avgScore >= 70 ? '#16a34a' : '#d97706' }] : []),
          ...(pendingTests.length > 0 ? [{ icon: '⏳', label: 'Čekající testy', value: pendingTests.length, href: '/student/tests', color: '#d97706' }] : []),
        ].map(({ icon, label, value, href, color }) => (
          <a key={label} href={href} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, textDecoration: 'none', color: 'inherit' }}>
            <div style={{ width: 38, height: 38, borderRadius: 10, background: color + '15', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>{icon}</div>
            <div>
              <div style={{ fontSize: 20, fontWeight: 700, color, lineHeight: 1.1 }}>{value}</div>
              <div style={{ fontSize: 11, color: '#888', marginTop: 1 }}>{label}</div>
            </div>
          </a>
        ))}
      </div>

      {/* ── Two columns: modules left, tests + links right ── */}
      <div className="db-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>

        {/* Modules */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>📚 My Modules</h2>
            <a href="/student/modules" style={{ fontSize: 12, color: accent, textDecoration: 'none' }}>View all →</a>
          </div>
          {enrollments.length === 0
            ? <div style={{ background: '#fff', border: '1px dashed #e5e7eb', borderRadius: 12, padding: '32px 20px', textAlign: 'center', color: '#aaa', fontSize: 13 }}>No modules yet</div>
            : <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {enrollments.slice(0, 4).map(e => {
                  const mod = e.modules
                  if (!mod) return null
                  const ids: string[] = (mod.lessons ?? []).map((l: any) => l.id)
                  const done = ids.filter(id => completedSet.has(id)).length
                  const pct = ids.length > 0 ? Math.round((done / ids.length) * 100) : 0
                  return (
                    <a key={e.id} href={`/student/modules/${mod.id}`}
                      style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, textDecoration: 'none', color: 'inherit' }}>
                      <ProgressRing pct={pct} size={40} color={accent} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{mod.title}</div>
                        <div style={{ fontSize: 11, color: '#aaa', marginTop: 1 }}>{done}/{ids.length} lessons</div>
                      </div>
                      {pct === 100 && <span style={{ fontSize: 16 }}>🏆</span>}
                    </a>
                  )
                })}
              </div>
          }
        </div>

        {/* Right column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Tests */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h2 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>🧪 Upcoming Tests</h2>
              <a href="/student/tests" style={{ fontSize: 12, color: accent, textDecoration: 'none' }}>View all →</a>
            </div>
            {pendingTests.length === 0 && tests.length === 0 && (
              <div style={{ background: '#fff', border: '1px dashed #e5e7eb', borderRadius: 12, padding: '20px', textAlign: 'center', color: '#aaa', fontSize: 13 }}>No tests assigned</div>
            )}
            {pendingTests.length === 0 && tests.length > 0 && (
              <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 12, padding: '14px 16px', textAlign: 'center', color: '#166534', fontSize: 13, fontWeight: 500 }}>
                🎉 All tests completed!
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {pendingTests.slice(0, 3).map(t => {
                const active = attempts.find(a => a.test_id === t.id && a.status === 'in_progress')
                return (
                  <a key={t.id} href={`/student/tests/${t.id}`}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 13px', background: active ? '#fffbeb' : '#fff', border: `1px solid ${active ? '#fde68a' : '#e5e7eb'}`, borderRadius: 10, textDecoration: 'none', color: 'inherit' }}>
                    <span style={{ fontSize: 16 }}>{active ? '▶️' : '📝'}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</div>
                      {t.available_until && <div style={{ fontSize: 11, color: '#d97706', marginTop: 1 }}>Due {new Date(t.available_until).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</div>}
                    </div>
                    {active && <span style={{ fontSize: 10, fontWeight: 700, color: '#92400e', background: '#fde68a', padding: '2px 7px', borderRadius: 20, flexShrink: 0 }}>In progress</span>}
                  </a>
                )
              })}
            </div>
          </div>

          {/* Quick links */}
          <div>
            <h2 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 12px' }}>🔗 Quick links</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {[
                { icon: '📖', label: 'Záložky', href: '/student/bookmarks' },
                { icon: '📈', label: 'Pokrok', href: '/student/progress' },
                { icon: '📊', label: 'Historie testů', href: '/student/tests/history' },
                { icon: '👤', label: 'Můj profil', href: '/student/profile' },
              ].map(({ icon, label, href }) => (
                <a key={href} href={href}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, textDecoration: 'none', color: '#333', fontSize: 13, fontWeight: 500 }}>
                  <span style={{ fontSize: 17 }}>{icon}</span> {label}
                </a>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
