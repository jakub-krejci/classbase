'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */

function formatDate(iso?: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'long', year: 'numeric' })
}
function formatDateTime(iso?: string | null) {
  if (!iso) return 'Nikdy'
  return new Date(iso).toLocaleString('cs-CZ', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}
function timeAgo(iso: string) {
  const d = Date.now() - new Date(iso).getTime()
  const m = Math.floor(d / 60000), h = Math.floor(m / 60), days = Math.floor(h / 24)
  if (m < 2) return 'právě teď'
  if (m < 60) return `před ${m} min`
  if (h < 24) return `před ${h} h`
  if (days === 1) return 'včera'
  return `před ${days} dny`
}

function ProgressBar({ pct, color }: { pct: number; color: string }) {
  const c = pct === 100 ? '#22c55e' : color
  return (
    <div style={{ height: 6, background: '#f3f4f6', borderRadius: 10, overflow: 'hidden', flex: 1 }}>
      <div style={{ height: '100%', width: `${pct}%`, background: c, borderRadius: 10, transition: 'width .4s ease' }} />
    </div>
  )
}

export default function TeacherStudentProfileClient({ student, enrollments, progressMap, attempts }: {
  student: any; enrollments: any[]; progressMap: Record<string, { done: number; total: number }>; attempts: any[]
}) {
  const accent = student.accent_color ?? '#185FA5'
  const initials = (student.full_name ?? '?').split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()

  const totalLessons = Object.values(progressMap).reduce((a, p) => a + p.total, 0)
  const doneLessons  = Object.values(progressMap).reduce((a, p) => a + p.done, 0)
  const overallPct   = totalLessons > 0 ? Math.round(doneLessons / totalLessons * 100) : 0
  const completedMods = enrollments.filter(e => {
    const p = progressMap[e.module_id]; return p && p.total > 0 && p.done === p.total
  }).length
  const gradedAttempts = attempts.filter(a => a.score != null)
  const avgScore = gradedAttempts.length
    ? Math.round(gradedAttempts.reduce((sum, a) => sum + (a.score / a.max_score * 100), 0) / gradedAttempts.length)
    : null

  return (
    <div style={{ maxWidth: 760, margin: '0 auto' }}>

      {/* Back link */}
      <a href="/teacher/modules" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#888', textDecoration: 'none', marginBottom: 20 }}>
        ← Zpět na moduly
      </a>

      {/* ── Profile header card ── */}
      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 20, overflow: 'hidden', marginBottom: 20, boxShadow: '0 2px 12px rgba(0,0,0,.04)' }}>
        {/* Banner */}
        <div style={{
          height: student.banner_url ? 120 : 8,
          background: student.banner_url ? `url(${student.banner_url}) center/cover no-repeat` : accent,
          position: 'relative',
        }}>
          {student.banner_url && <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.15)' }} />}
        </div>

        <div style={{ padding: student.banner_url ? '0 28px 24px' : '0 28px 24px' }}>
          {/* Avatar row */}
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: student.banner_url ? -44 : -20, marginBottom: 16 }}>
            {student.avatar_url
              ? <img src={student.avatar_url} alt={student.full_name}
                  style={{ width: 88, height: 88, borderRadius: '50%', objectFit: 'cover', border: '4px solid #fff', boxShadow: '0 2px 12px rgba(0,0,0,.1)' }} />
              : <div style={{ width: 88, height: 88, borderRadius: '50%', background: accent + '20', color: accent, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 30, fontWeight: 700, border: '4px solid #fff', boxShadow: '0 2px 12px rgba(0,0,0,.08)' }}>
                  {initials}
                </div>
            }
            {/* Privacy badge */}
            <div style={{ padding: '6px 12px', borderRadius: 20, background: student.profile_visibility ? '#dcfce7' : '#f3f4f6', fontSize: 12, fontWeight: 600, color: student.profile_visibility ? '#16a34a' : '#888' }}>
              {student.profile_visibility ? '🌐 Veřejný profil' : '🔒 Soukromý profil'}
            </div>
          </div>

          {/* Name + details */}
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 6px', color: '#111' }}>{student.full_name}</h1>
          <div style={{ fontSize: 13, color: '#888', marginBottom: 10 }}>{student.email}</div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
            {student.student_class && <span style={{ fontSize: 12, padding: '3px 10px', background: accent + '15', color: accent, borderRadius: 20, fontWeight: 600 }}>🏫 {student.student_class}</span>}
            {student.grade_level && <span style={{ fontSize: 12, padding: '3px 10px', background: accent + '15', color: accent, borderRadius: 20, fontWeight: 600 }}>📚 {student.grade_level}</span>}
            {student.pronouns && <span style={{ fontSize: 12, padding: '3px 10px', background: '#f3f4f6', color: '#666', borderRadius: 20 }}>{student.pronouns}</span>}
          </div>

          {student.show_status && student.custom_status && (
            <div style={{ fontSize: 13, color: '#555', background: '#f3f4f6', borderRadius: 20, padding: '4px 12px', display: 'inline-block', marginBottom: 10 }}>
              {student.custom_status}
            </div>
          )}
          {student.show_bio && student.bio && (
            <p style={{ fontSize: 13, color: '#666', lineHeight: 1.6, margin: '0 0 12px' }}>{student.bio}</p>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
        {/* Account info */}
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, padding: '18px 20px' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#aaa', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 12 }}>Informace o účtu</div>
          {[
            ['Člen od', formatDate(student.created_at)],
            ['Poslední přihlášení', formatDateTime(student.last_login_at)],
          ].map(([label, val]) => (
            <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid #f9fafb', fontSize: 13 }}>
              <span style={{ color: '#888' }}>{label}</span>
              <span style={{ color: '#111', fontWeight: 500 }}>{val}</span>
            </div>
          ))}
        </div>

        {/* Overall stats */}
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, padding: '18px 20px' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#aaa', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 12 }}>Přehled výsledků</div>
          {[
            ['Dokončeno lekcí', `${doneLessons} / ${totalLessons}`],
            ['Dokončeno modulů', `${completedMods} / ${enrollments.length}`],
            ['Průměrné skóre testů', avgScore != null ? `${avgScore}%` : '—'],
          ].map(([label, val]) => (
            <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid #f9fafb', fontSize: 13 }}>
              <span style={{ color: '#888' }}>{label}</span>
              <span style={{ color: '#111', fontWeight: 600 }}>{val}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Modules progress ── */}
      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, padding: '20px 24px', marginBottom: 20 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#111', marginBottom: 4 }}>📚 Pokrok v modulech</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <ProgressBar pct={overallPct} color={accent} />
          <span style={{ fontSize: 13, fontWeight: 700, color: accent, flexShrink: 0 }}>{overallPct}% celkem</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {enrollments.map((e: any) => {
            const m = e.modules as any
            const p = progressMap[e.module_id] ?? { done: 0, total: 0 }
            const pct = p.total > 0 ? Math.round(p.done / p.total * 100) : 0
            return (
              <div key={e.module_id}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5, fontSize: 13 }}>
                  <a href={`/teacher/modules/${e.module_id}`}
                    style={{ color: '#185FA5', textDecoration: 'none', fontWeight: 500, flex: 1, marginRight: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {m?.title ?? e.module_id}
                  </a>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
                    {e.banned && <span style={{ fontSize: 10, fontWeight: 700, color: '#856404', background: '#FFF3CD', padding: '1px 6px', borderRadius: 8 }}>Zablokován</span>}
                    <span style={{ fontSize: 12, color: pct === 100 ? '#16a34a' : '#888', fontWeight: 600 }}>{p.done}/{p.total} lekcí · {pct}%</span>
                  </div>
                </div>
                <ProgressBar pct={pct} color={accent} />
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Test attempts ── */}
      {attempts.length > 0 && (
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, padding: '20px 24px' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#111', marginBottom: 16 }}>🧪 Výsledky testů</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {attempts.map((a: any) => {
              const pct = a.max_score > 0 ? Math.round(a.score / a.max_score * 100) : null
              const isGraded = a.score != null
              return (
                <a key={a.id} href={`/teacher/tests/${a.test_id}/review/${a.id}`}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: '#f9fafb', borderRadius: 10, textDecoration: 'none', color: 'inherit', border: '1px solid #f3f4f6' }}>
                  <div style={{ width: 36, height: 36, borderRadius: 9, background: isGraded ? (pct! >= 70 ? '#dcfce7' : pct! >= 50 ? '#fef9c3' : '#fee2e2') : '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, flexShrink: 0 }}>
                    {isGraded ? (pct! >= 70 ? '✅' : pct! >= 50 ? '⚠️' : '❌') : '📝'}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#111', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {(a.tests as any)?.title ?? 'Test'}
                    </div>
                    <div style={{ fontSize: 11, color: '#aaa', marginTop: 2 }}>{timeAgo(a.submitted_at)}</div>
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: isGraded ? (pct! >= 70 ? '#16a34a' : pct! >= 50 ? '#d97706' : '#dc2626') : '#888', flexShrink: 0 }}>
                    {isGraded ? `${pct}%` : 'Nehodnoceno'}
                  </div>
                </a>
              )
            })}
          </div>
        </div>
      )}

      <style>{`@media (max-width: 600px) { div[style*="grid-template-columns: 1fr 1fr"] { grid-template-columns: 1fr !important; } }`}</style>
    </div>
  )
}
