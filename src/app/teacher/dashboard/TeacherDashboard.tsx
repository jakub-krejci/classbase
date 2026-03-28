'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */

function StatCard({ icon, label, value, color = '#185FA5', href }: {
  icon: string; label: string; value: string | number; color?: string; href?: string
}) {
  const inner = (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, padding: '18px 20px', display: 'flex', alignItems: 'center', gap: 14 }}>
      <div style={{ width: 44, height: 44, borderRadius: 12, background: color + '15', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>
        {icon}
      </div>
      <div>
        <div style={{ fontSize: 24, fontWeight: 700, color, lineHeight: 1.1 }}>{value}</div>
        <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>{label}</div>
      </div>
    </div>
  )
  return href
    ? <a href={href} style={{ textDecoration: 'none', display: 'block' }}>{inner}</a>
    : inner
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  const hrs = Math.floor(mins / 60)
  const days = Math.floor(hrs / 24)
  if (mins < 2) return 'právě teď'
  if (mins < 60) return `před ${mins} min`
  if (hrs < 24) return `před ${hrs} h`
  if (days === 1) return 'včera'
  return `před ${days} dny`
}

export default function TeacherDashboard({ profile, modules, tests, pendingAttempts, recentProgress, stats }: {
  profile: any; modules: any[]; tests: any[]
  pendingAttempts: any[]; recentProgress: any[]
  stats: { totalModules: number; totalStudents: number; publishedTests: number; weekSubmissions: number }
}) {
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Dobré ráno' : hour < 17 ? 'Dobré odpoledne' : 'Dobrý večer'
  const firstName = profile.full_name?.split(' ')[0] ?? 'učiteli'

  const activeTests = tests.filter(t => t.status === 'published')
  const recentModules = modules.slice(0, 4)

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto' }}>

      {/* ── Hero ── */}
      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 20, marginBottom: 24, overflow: 'hidden', boxShadow: '0 2px 12px rgba(0,0,0,.04)' }}>
        <div style={{ height: 5, background: '#185FA5' }} />
        <div style={{ padding: '22px 28px', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          {/* Avatar */}
          <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#E6F1FB', color: '#185FA5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 700, flexShrink: 0, border: '2px solid #c5dcf5' }}>
            {profile.avatar_url
              ? <img src={profile.avatar_url} alt="" style={{ width: 56, height: 56, borderRadius: '50%', objectFit: 'cover' }} />
              : (profile.full_name ?? 'T').split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()
            }
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, color: '#aaa', marginBottom: 2 }}>{greeting} 👋</div>
            <h1 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 3px', color: '#111' }}>{profile.full_name}</h1>
            <div style={{ fontSize: 12, color: '#888' }}>
              {profile.subject_specialty ?? 'Učitel'} · {stats.totalStudents} studentů zapsáno
            </div>
          </div>
          {/* Quick actions */}
          <div style={{ display: 'flex', gap: 8, flexShrink: 0, flexWrap: 'wrap' }}>
            <a href="/teacher/modules/new"
              style={{ padding: '8px 16px', background: '#185FA5', color: '#fff', borderRadius: 8, textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>
              + Nový modul
            </a>
            <a href="/teacher/tests/new"
              style={{ padding: '8px 16px', background: '#f3f4f6', color: '#333', border: '1px solid #e5e7eb', borderRadius: 8, textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>
              + Nový test
            </a>
          </div>
        </div>
      </div>

      {/* ── Stats ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 24 }}>
        <StatCard icon="📚" label="Aktivní moduly"   value={stats.totalModules}     color="#185FA5" href="/teacher/modules" />
        <StatCard icon="👥" label="Celkem studentů"  value={stats.totalStudents}    color="#16a34a" href="/teacher/groups" />
        <StatCard icon="🧪" label="Zveřejněné testy" value={stats.publishedTests}   color="#6c47ff" href="/teacher/tests" />
        <StatCard icon="📥" label="Odevzdání tento týden" value={stats.weekSubmissions} color="#d97706" href="/teacher/grade" />
      </div>

      {/* ── Main grid ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>

        {/* LEFT: Pending grading + Modules */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Needs grading */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h2 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>
                ✏️ Čeká na hodnocení
                {pendingAttempts.length > 0 && (
                  <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 700, background: '#dc2626', color: '#fff', borderRadius: 20, padding: '1px 7px' }}>
                    {pendingAttempts.length}
                  </span>
                )}
              </h2>
              <a href="/teacher/grade" style={{ fontSize: 12, color: '#185FA5', textDecoration: 'none' }}>Zobrazit vše →</a>
            </div>
            {pendingAttempts.length === 0
              ? <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 12, padding: '16px 18px', fontSize: 13, color: '#166534', fontWeight: 500 }}>
                  🎉 Vše ohodnoceno! Žádné čekající testy.
                </div>
              : <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {pendingAttempts.map((a: any) => (
                    <a key={a.id} href={`/teacher/tests/${a.test_id}/review/${a.id}`}
                      style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 14px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, textDecoration: 'none', color: 'inherit' }}>
                      <div style={{ width: 32, height: 32, borderRadius: 8, background: '#fef3c7', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, flexShrink: 0 }}>✏️</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {(a.profiles as any)?.full_name ?? 'Student'}
                        </div>
                        <div style={{ fontSize: 11, color: '#92400e', marginTop: 1 }}>
                          {(a.tests as any)?.title ?? 'Test'} · {timeAgo(a.submitted_at)}
                        </div>
                      </div>
                      <span style={{ fontSize: 11, color: '#185FA5', fontWeight: 600, flexShrink: 0 }}>Ohodnotit →</span>
                    </a>
                  ))}
                </div>
            }
          </div>

          {/* My modules */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h2 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>📚 Moje moduly</h2>
              <a href="/teacher/modules" style={{ fontSize: 12, color: '#185FA5', textDecoration: 'none' }}>Zobrazit vše →</a>
            </div>
            {recentModules.length === 0
              ? <div style={{ background: '#fff', border: '1px dashed #e5e7eb', borderRadius: 12, padding: '28px', textAlign: 'center', color: '#aaa', fontSize: 13 }}>
                  Zatím žádné moduly.<br />
                  <a href="/teacher/modules/new" style={{ color: '#185FA5', textDecoration: 'none', fontWeight: 600 }}>Vytvořte první modul →</a>
                </div>
              : <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {recentModules.map((m: any) => {
                    const lessonCount = (m.lessons ?? []).length
                    const studentCount = (m.enrollments ?? []).length
                    return (
                      <a key={m.id} href={`/teacher/modules/${m.id}`}
                        style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 14px', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, textDecoration: 'none', color: 'inherit' }}>
                        <div style={{ width: 32, height: 32, borderRadius: 8, background: '#E6F1FB', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>📚</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.title}</div>
                          <div style={{ fontSize: 11, color: '#aaa', marginTop: 1 }}>{lessonCount} lekcí · {studentCount} studentů</div>
                        </div>
                        <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: m.status === 'published' ? '#EAF3DE' : '#f3f4f6', color: m.status === 'published' ? '#27500A' : '#888', fontWeight: 600, flexShrink: 0 }}>
                          {m.status === 'published' ? 'Aktivní' : 'Koncept'}
                        </span>
                      </a>
                    )
                  })}
                </div>
            }
          </div>
        </div>

        {/* RIGHT: Active tests + Recent activity */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Active tests */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h2 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>🧪 Aktivní testy</h2>
              <a href="/teacher/tests" style={{ fontSize: 12, color: '#185FA5', textDecoration: 'none' }}>Zobrazit vše →</a>
            </div>
            {activeTests.length === 0
              ? <div style={{ background: '#fff', border: '1px dashed #e5e7eb', borderRadius: 12, padding: '20px', textAlign: 'center', color: '#aaa', fontSize: 13 }}>
                  Žádné zveřejněné testy.
                </div>
              : <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {activeTests.slice(0, 4).map((t: any) => (
                    <a key={t.id} href={`/teacher/tests/${t.id}`}
                      style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 14px', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, textDecoration: 'none', color: 'inherit' }}>
                      <div style={{ width: 32, height: 32, borderRadius: 8, background: '#f5f3ff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>🧪</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</div>
                        {t.available_until && (
                          <div style={{ fontSize: 11, color: '#d97706', marginTop: 1 }}>
                            Uzavírá se {new Date(t.available_until).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                          </div>
                        )}
                      </div>
                      <a href={`/teacher/tests/${t.id}/bulk-grade`}
                        onClick={e => e.stopPropagation()}
                        style={{ fontSize: 11, padding: '4px 10px', background: '#6c47ff', color: '#fff', borderRadius: 6, textDecoration: 'none', fontWeight: 600, flexShrink: 0 }}>
                        Hodnotit
                      </a>
                    </a>
                  ))}
                </div>
            }
          </div>

          {/* Recent student activity */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h2 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>📈 Nedávná aktivita studentů</h2>
            </div>
            {recentProgress.length === 0
              ? <div style={{ background: '#fff', border: '1px dashed #e5e7eb', borderRadius: 12, padding: '20px', textAlign: 'center', color: '#aaa', fontSize: 13 }}>
                  Zatím žádná aktivita.
                </div>
              : <div style={{ display: 'flex', flexDirection: 'column', gap: 0, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden' }}>
                  {recentProgress.map((p: any, i: number) => (
                    <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: i < recentProgress.length - 1 ? '1px solid #f9fafb' : 'none' }}>
                      <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#EAF3DE', color: '#27500A', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
                        {((p.profiles as any)?.full_name ?? 'S').split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, color: '#111', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          <strong>{(p.profiles as any)?.full_name ?? 'Student'}</strong> dokončil lekci <strong>{(p.lessons as any)?.title ?? ''}</strong>
                        </div>
                        <div style={{ fontSize: 10, color: '#aaa', marginTop: 1 }}>{(p.lessons as any)?.modules?.title ?? ''}</div>
                      </div>
                      <div style={{ fontSize: 10, color: '#bbb', flexShrink: 0 }}>{timeAgo(p.completed_at)}</div>
                    </div>
                  ))}
                </div>
            }
          </div>

          {/* Quick links */}
          <div>
            <h2 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 12px' }}>🔗 Rychlé akce</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {[
                { icon: '👥', label: 'Skupiny', href: '/teacher/groups' },
                { icon: '📊', label: 'Hodnocení', href: '/teacher/grade' },
                { icon: '📚', label: 'Banka otázek', href: '/teacher/question-bank' },
                { icon: '💬', label: 'Zprávy', href: '/teacher/messages' },
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

      {/* Mobile fix */}
      <style>{`
        @media (max-width: 640px) {
          div[style*="grid-template-columns: 1fr 1fr"] { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  )
}
