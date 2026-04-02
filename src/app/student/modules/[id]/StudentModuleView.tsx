'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { DarkLayout, D, card, ProgressBar, SectionLabel } from '@/components/DarkLayout'

// ── Tag colour map ──────────────────────────────────────────────────────────────
const TAG_COLORS: Record<string, string> = {
  Math: '#6366F1', Programming: '#3B82F6', Science: '#10B981',
  Language: '#F59E0B', History: '#EF4444', Art: '#EC4899', Other: '#8B5CF6',
}
function tagColor(tag?: string) { return TAG_COLORS[tag ?? ''] ?? TAG_COLORS.Other }

function Avatar({ src, name, size = 32, accent = '#7C3AED' }: { src?: string; name: string; size?: number; accent?: string }) {
  const initials = (name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
  if (src) return <img src={src} alt={name} style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
  return <div style={{ width: size, height: size, borderRadius: '50%', background: accent + '30', color: accent, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * .34, fontWeight: 700, flexShrink: 0 }}>{initials}</div>
}

export default function StudentModuleView({ module, lessons, assignments, completedIds, bookmarkedIds, submissions, studentId, classmates = [], profile }: {
  module: any; lessons: any[]; assignments: any[]; completedIds: string[]; bookmarkedIds: string[]
  submissions: any[]; studentId: string; classmates?: any[]; profile?: any
}) {
  const supabase = createClient()
  const accent   = profile?.accent_color ?? '#7C3AED'

  const [tab, setTab]       = useState<'lessons' | 'assignments'>('lessons')
  const [search, setSearch] = useState('')

  const done      = new Set(completedIds)
  const bookmarked = new Set(bookmarkedIds)
  const visibleLessons = lessons.filter((l: any) => !l.parent_lesson_id)
  const pct = visibleLessons.length > 0 ? Math.round(done.size / visibleLessons.length * 100) : 0
  const filteredLessons = search.trim()
    ? visibleLessons.filter((l: any) => l.title.toLowerCase().includes(search.toLowerCase()))
    : visibleLessons

  function isUnlocked(i: number): boolean {
    if (module.unlock_mode !== 'sequential') return true
    if (i === 0) return true
    return done.has(visibleLessons[i - 1]?.id)
  }

  const subMap: Record<string, any> = {}
  submissions.forEach((s: any) => { subMap[s.assignment_id] = s })

  const tc = tagColor(module.tag)

  const statusOfAssignment = (a: any) => {
    const sub = subMap[a.id]
    if (!sub) return { label: 'Neodevzdáno', color: D.txtSec, bg: 'rgba(255,255,255,.06)' }
    if (sub.grade !== null && sub.grade !== undefined) return { label: `Hodnocení: ${sub.grade}`, color: D.success, bg: D.success + '15' }
    return { label: 'Odevzdáno', color: D.warning, bg: D.warning + '15' }
  }

  return (
    <DarkLayout profile={profile} activeRoute="/student/modules">
      <style>{`
        .smv-row { transition: background .12s, border-color .12s; }
        .smv-row:hover { background: rgba(255,255,255,.04) !important; border-color: rgba(255,255,255,.12) !important; }
        .smv-chip { transition: all .15s; }
        .smv-chip:hover { background: rgba(255,255,255,.08) !important; }
      `}</style>

      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 22, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
            <a href="/student/modules" style={{ fontSize: 12, color: D.txtSec, textDecoration: 'none' }}>← Moduly</a>
            {module.tag && (
              <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 20, background: tc + '20', color: tc, fontWeight: 700 }}>
                {module.tag}
              </span>
            )}
            {module.unlock_mode === 'sequential' && (
              <span style={{ fontSize: 10, padding: '3px 8px', borderRadius: 20, background: 'rgba(255,255,255,.06)', color: D.txtSec }}>🔒 Sekvenční</span>
            )}
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: D.txtPri, marginBottom: 6, lineHeight: 1.3 }}>{module.title}</h1>
          {module.description && <p style={{ fontSize: 13, color: D.txtSec, lineHeight: 1.6 }}>{module.description}</p>}
        </div>
      </div>

      {/* ── Progress card ── */}
      <div style={{ ...card({ padding: '18px 22px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }) }}>
        <div>
          <div style={{ fontSize: 32, fontWeight: 800, color: D.txtPri, lineHeight: 1 }}>{pct}<span style={{ fontSize: 18, color: D.txtSec }}>%</span></div>
          <div style={{ fontSize: 11, color: D.txtSec, marginTop: 3 }}>dokončeno</div>
        </div>
        <div style={{ flex: 1, minWidth: 140 }}>
          <ProgressBar pct={pct} color={accent} height={8} />
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
            <span style={{ fontSize: 11, color: D.txtSec }}>{done.size} splněno</span>
            <span style={{ fontSize: 11, color: D.txtSec }}>{visibleLessons.length - done.size} zbývá</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 16, flexShrink: 0, flexWrap: 'wrap' }}>
          <div style={{ textAlign: 'center' as const }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: D.txtPri }}>{visibleLessons.length}</div>
            <div style={{ fontSize: 10, color: D.txtSec }}>lekcí</div>
          </div>
          <div style={{ textAlign: 'center' as const }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: D.txtPri }}>{assignments.length}</div>
            <div style={{ fontSize: 10, color: D.txtSec }}>úkolů</div>
          </div>
          {classmates.length > 0 && (
            <div style={{ textAlign: 'center' as const }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: D.txtPri }}>{classmates.length}</div>
              <div style={{ fontSize: 10, color: D.txtSec }}>spolužáků</div>
            </div>
          )}
        </div>
      </div>

      {/* ── Tabs ── */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 20 }}>
        {([
          { id: 'lessons',     label: `📖 Lekce (${visibleLessons.length})` },
          { id: 'assignments', label: `📝 Úkoly (${assignments.length})` },
        ] as const).map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{ padding: '8px 18px', borderRadius: 20, border: `1px solid ${tab === t.id ? accent + '60' : D.border}`, background: tab === t.id ? accent + '18' : 'transparent', color: tab === t.id ? accent : D.txtSec, fontSize: 13, fontWeight: tab === t.id ? 700 : 400, cursor: 'pointer', fontFamily: 'inherit', transition: 'all .15s' }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Search (lessons only) ── */}
      {tab === 'lessons' && visibleLessons.length > 4 && (
        <div style={{ position: 'relative', marginBottom: 16, maxWidth: 360 }}>
          <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 13, color: D.txtSec, pointerEvents: 'none' }}>🔍</span>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Hledat lekce…"
            style={{ width: '100%', padding: '9px 12px 9px 36px', background: D.bgCard, border: `1px solid ${D.border}`, borderRadius: 10, fontSize: 13, color: D.txtPri, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' as const }} />
          {search && <button onClick={() => setSearch('')} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: D.txtSec, fontSize: 14 }}>✕</button>}
        </div>
      )}

      {/* ── Lessons tab ── */}
      {tab === 'lessons' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filteredLessons.length === 0 && (
            <div style={{ ...card({ padding: '32px', textAlign: 'center' as const, color: D.txtSec, fontSize: 13 }) }}>
              Žádné lekce neodpovídají hledání.
            </div>
          )}
          {filteredLessons.map((l: any, i: number) => {
            const idx      = visibleLessons.indexOf(l)
            const unlocked = isUnlocked(idx)
            const isDone   = done.has(l.id)
            const isBm     = bookmarked.has(l.id)
            const isVideo  = l.lesson_type === 'video'
            const href     = unlocked ? `/student/modules/${module.id}/lessons/${l.id}` : undefined

            return (
              <div key={l.id} className="smv-row"
                style={{ ...card({ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14, opacity: unlocked ? 1 : .5, cursor: href ? 'pointer' : 'default', textDecoration: 'none' }) }}
                onClick={() => href && (window.location.href = href)}>
                {/* Status circle */}
                <div style={{ width: 36, height: 36, borderRadius: '50%', background: isDone ? D.success + '20' : isBm ? D.warning + '20' : unlocked ? accent + '15' : 'rgba(255,255,255,.06)', color: isDone ? D.success : isBm ? D.warning : unlocked ? accent : D.txtSec, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: isDone ? 16 : 13, fontWeight: 700, flexShrink: 0 }}>
                  {!unlocked ? '🔒' : isDone ? '✓' : isBm ? '🔖' : isVideo ? '▶' : idx + 1}
                </div>
                {/* Content */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: D.txtPri, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.title}</div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
                    {isVideo && <span style={{ fontSize: 10, color: '#F59E0B', background: '#F59E0B18', padding: '1px 7px', borderRadius: 10, fontWeight: 600 }}>🎬 Video</span>}
                    {isDone && <span style={{ fontSize: 10, color: D.success }}>Splněno</span>}
                    {isBm && !isDone && <span style={{ fontSize: 10, color: D.warning }}>Uloženo na později</span>}
                    {!unlocked && <span style={{ fontSize: 10, color: D.txtSec }}>Dokončete předchozí lekci</span>}
                  </div>
                </div>
                {/* Arrow */}
                {href && <span style={{ color: D.txtSec, fontSize: 16, flexShrink: 0 }}>→</span>}
              </div>
            )
          })}
        </div>
      )}

      {/* ── Assignments tab ── */}
      {tab === 'assignments' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {assignments.length === 0 && (
            <div style={{ ...card({ padding: '32px', textAlign: 'center' as const, color: D.txtSec, fontSize: 13 }) }}>
              Žádné úkoly v tomto modulu.
            </div>
          )}
          {assignments.map((a: any) => {
            const st = statusOfAssignment(a)
            return (
              <a key={a.id} href={`/student/modules/${module.id}/assignments/${a.id}`} className="smv-row"
                style={{ ...card({ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14, textDecoration: 'none' }) }}>
                <div style={{ width: 36, height: 36, borderRadius: '50%', background: accent + '15', color: accent, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>
                  {a.type === 'homework' ? '📝' : a.type === 'quiz' ? '🧩' : '🧪'}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: D.txtPri, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.title}</div>
                  <div style={{ fontSize: 11, color: D.txtSec, marginTop: 3, display: 'flex', gap: 8 }}>
                    <span style={{ padding: '1px 7px', borderRadius: 10, background: st.bg, color: st.color, fontWeight: 600 }}>{st.label}</span>
                  </div>
                </div>
                <span style={{ color: D.txtSec, fontSize: 16 }}>→</span>
              </a>
            )
          })}
        </div>
      )}

      {/* ── Classmates ── */}
      {classmates.length > 0 && (
        <div style={{ ...card({ padding: '18px 22px', marginTop: 24 }) }}>
          <SectionLabel>Spolužáci v modulu</SectionLabel>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {classmates.map((c: any) => (
              <a key={c.id} href={`/student/profile/${c.id}`}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: D.bgMid, border: `1px solid ${D.border}`, borderRadius: 10, textDecoration: 'none', transition: 'all .15s' }}
                className="smv-chip">
                <Avatar src={c.avatar_url} name={c.full_name} size={28} accent={c.accent_color ?? '#7C3AED'} />
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: D.txtPri }}>{c.full_name}</div>
                  {c.student_class && <div style={{ fontSize: 10, color: D.txtSec }}>{c.student_class}</div>}
                </div>
              </a>
            ))}
          </div>
        </div>
      )}
    </DarkLayout>
  )
}
