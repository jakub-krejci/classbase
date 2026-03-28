'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'

function Avatar({ url, name, size = 72, editable = false }: {
  url?: string | null; name: string; size?: number; editable?: boolean
}) {
  const [src, setSrc] = useState(url)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const supabase = createClient()

  const initials = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
  const colors = ['#185FA5', '#6c47ff', '#e06c75', '#27500A', '#d97706']
  const color = colors[name.charCodeAt(0) % colors.length]

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    const ext = file.name.split('.').pop()
    const path = `avatars/${crypto.randomUUID()}.${ext}`
    const { error } = await supabase.storage.from('avatars').upload(path, file, { upsert: true })
    if (!error) {
      const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path)
      await supabase.from('profiles').update({ avatar_url: publicUrl }).eq('id', (await supabase.auth.getUser()).data.user!.id)
      setSrc(publicUrl)
    }
    setUploading(false)
  }

  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      {src
        ? <img src={src} alt={name} style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', border: '3px solid #fff', boxShadow: '0 2px 12px rgba(0,0,0,.12)' }} />
        : <div style={{ width: size, height: size, borderRadius: '50%', background: color, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: size * 0.33, fontWeight: 700, border: '3px solid #fff', boxShadow: '0 2px 12px rgba(0,0,0,.12)' }}>
            {initials}
          </div>
      }
      {editable && (
        <>
          <button onClick={() => fileRef.current?.click()} disabled={uploading}
            style={{ position: 'absolute', bottom: 0, right: 0, width: 24, height: 24, borderRadius: '50%', background: '#185FA5', border: '2px solid #fff', color: '#fff', fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            title="Change photo">
            {uploading ? '…' : '✎'}
          </button>
          <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFile} />
        </>
      )}
    </div>
  )
}

function StatCard({ icon, label, value, color = '#185FA5', href }: { icon: string; label: string; value: string | number; color?: string; href?: string }) {
  const inner = (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, padding: '18px 20px', display: 'flex', alignItems: 'center', gap: 14, textDecoration: 'none', color: 'inherit' }}>
      <div style={{ width: 44, height: 44, borderRadius: 12, background: color + '18', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>
        {icon}
      </div>
      <div>
        <div style={{ fontSize: 22, fontWeight: 700, color, lineHeight: 1.1 }}>{value}</div>
        <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>{label}</div>
      </div>
    </div>
  )
  return href ? <a href={href} style={{ textDecoration: 'none', display: 'block' }}>{inner}</a> : inner
}

function ProgressRing({ pct, size = 48 }: { pct: number; size?: number }) {
  const r = (size - 6) / 2
  const circ = 2 * Math.PI * r
  const dash = (pct / 100) * circ
  const color = pct === 100 ? '#22c55e' : pct > 0 ? '#185FA5' : '#e5e7eb'
  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)', flexShrink: 0 }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#f3f4f6" strokeWidth={5} />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={5}
        strokeDasharray={`${dash} ${circ}`} strokeLinecap="round" style={{ transition: 'stroke-dasharray .5s' }} />
      <text x={size/2} y={size/2} textAnchor="middle" dominantBaseline="central"
        style={{ transform: `rotate(90deg)`, transformOrigin: `${size/2}px ${size/2}px`, fill: color, fontSize: size * 0.24, fontWeight: 700, fontFamily: 'inherit' }}>
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

  // Module stats
  const totalLessons = enrollments.reduce((s, e) => s + (e.modules?.lessons?.length ?? 0), 0)
  const completedLessons = enrollments.reduce((s, e) => {
    const lessonIds: string[] = (e.modules?.lessons ?? []).map((l: any) => l.id)
    return s + lessonIds.filter(id => completedSet.has(id)).length
  }, 0)
  const completedModules = enrollments.filter(e => {
    const lessonIds: string[] = (e.modules?.lessons ?? []).map((l: any) => l.id)
    return lessonIds.length > 0 && lessonIds.every(id => completedSet.has(id))
  }).length

  // Test stats
  const submittedAttempts = attempts.filter(a => a.status === 'submitted')
  const avgScore = submittedAttempts.length
    ? Math.round(submittedAttempts.reduce((s, a) => s + ((a.final_score ?? a.score ?? 0) / (a.max_score || 1)) * 100, 0) / submittedAttempts.length)
    : null
  const pendingTests = tests.filter(t => !attempts.find(a => a.test_id === t.id && ['submitted','timed_out'].includes(a.status)))

  // Greeting based on time
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto' }}>
      {/* ── Hero / profile strip ── */}
      <div style={{ background: 'linear-gradient(135deg, #185FA5 0%, #0c447c 100%)', borderRadius: 20, padding: '28px 32px', marginBottom: 28, color: '#fff', display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
        <Avatar url={profile.avatar_url} name={profile.full_name ?? 'S'} size={80} editable />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, opacity: .8, marginBottom: 4 }}>{greeting} 👋</div>
          <h1 style={{ fontSize: 26, fontWeight: 700, margin: '0 0 4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{profile.full_name}</h1>
          <div style={{ fontSize: 13, opacity: .75 }}>
            {enrollments.length} module{enrollments.length !== 1 ? 's' : ''} enrolled
            {tests.length > 0 && ` · ${tests.length} test${tests.length !== 1 ? 's' : ''} assigned`}
          </div>
        </div>
        {/* Overall progress ring */}
        {totalLessons > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
            <ProgressRing pct={totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0} size={64} />
            <div style={{ fontSize: 11, opacity: .8 }}>Overall progress</div>
          </div>
        )}
      </div>

      {/* ── Stat cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginBottom: 28 }}>
        <StatCard icon="📚" label="Modules enrolled" value={enrollments.length} href="/student/modules" />
        <StatCard icon="✅" label="Lessons completed" value={`${completedLessons} / ${totalLessons}`} color="#16a34a" href="/student/progress" />
        <StatCard icon="🏆" label="Modules finished" value={completedModules} color="#6c47ff" href="/student/progress" />
        {avgScore !== null && <StatCard icon="📊" label="Avg test score" value={`${avgScore}%`} color={avgScore >= 70 ? '#16a34a' : '#d97706'} href="/student/tests/history" />}
        {pendingTests.length > 0 && <StatCard icon="⏳" label="Tests pending" value={pendingTests.length} color="#d97706" href="/student/tests" />}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        {/* ── Modules ── */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>📚 My Modules</h2>
            <a href="/student/modules" style={{ fontSize: 12, color: '#185FA5', textDecoration: 'none' }}>View all →</a>
          </div>
          {enrollments.length === 0 && (
            <div style={{ background: '#fff', border: '1px dashed #e5e7eb', borderRadius: 12, padding: '32px 20px', textAlign: 'center', color: '#aaa', fontSize: 13 }}>
              No modules yet
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {enrollments.slice(0, 4).map(e => {
              const mod = e.modules
              if (!mod) return null
              const lessonIds: string[] = (mod.lessons ?? []).map((l: any) => l.id)
              const done = lessonIds.filter(id => completedSet.has(id)).length
              const total = lessonIds.length
              const pct = total > 0 ? Math.round((done / total) * 100) : 0
              return (
                <a key={e.id} href={`/student/modules/${mod.id}`} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, textDecoration: 'none', color: 'inherit' }}>
                  <ProgressRing pct={pct} size={44} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#111', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{mod.title}</div>
                    <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>{done}/{total} lessons</div>
                  </div>
                  {pct === 100 && <span style={{ fontSize: 16 }}>🏆</span>}
                </a>
              )
            })}
          </div>
        </div>

        {/* ── Tests + Bookmarks ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Tests */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>🧪 Upcoming Tests</h2>
              <a href="/student/tests" style={{ fontSize: 12, color: '#185FA5', textDecoration: 'none' }}>View all →</a>
            </div>
            {pendingTests.length === 0 && tests.length === 0 && (
              <div style={{ background: '#fff', border: '1px dashed #e5e7eb', borderRadius: 12, padding: '24px 20px', textAlign: 'center', color: '#aaa', fontSize: 13 }}>
                No tests assigned
              </div>
            )}
            {pendingTests.length === 0 && tests.length > 0 && (
              <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 12, padding: '16px 20px', textAlign: 'center', color: '#166534', fontSize: 13, fontWeight: 500 }}>
                🎉 All tests completed!
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {pendingTests.slice(0, 3).map(t => {
                const active = attempts.find(a => a.test_id === t.id && a.status === 'in_progress')
                return (
                  <a key={t.id} href={`/student/tests/${t.id}`} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', background: active ? '#fffbeb' : '#fff', border: `1px solid ${active ? '#fde68a' : '#e5e7eb'}`, borderRadius: 10, textDecoration: 'none', color: 'inherit' }}>
                    <span style={{ fontSize: 18 }}>{active ? '▶️' : '📝'}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</div>
                      {t.available_until && (
                        <div style={{ fontSize: 11, color: '#d97706', marginTop: 1 }}>
                          Due {new Date(t.available_until).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                        </div>
                      )}
                    </div>
                    {active && <span style={{ fontSize: 11, fontWeight: 700, color: '#92400e', background: '#fde68a', padding: '2px 8px', borderRadius: 20, flexShrink: 0 }}>In progress</span>}
                  </a>
                )
              })}
            </div>
          </div>

          {/* Quick links */}
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 12px' }}>🔗 Quick links</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {[
                { icon: '📖', label: 'Bookmarks', href: '/student/bookmarks', color: '#6c47ff' },
                { icon: '📈', label: 'Progress', href: '/student/progress', color: '#16a34a' },
                { icon: '📊', label: 'Test History', href: '/student/tests/history', color: '#185FA5' },
                { icon: '👤', label: 'My Profile', href: '/student/profile', color: '#d97706' },
              ].map(({ icon, label, href, color }) => (
                <a key={href} href={href} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, textDecoration: 'none', color: '#333', fontSize: 13, fontWeight: 500 }}>
                  <span style={{ fontSize: 18, width: 28, textAlign: 'center' }}>{icon}</span>
                  <span>{label}</span>
                </a>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
