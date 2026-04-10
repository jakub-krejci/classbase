'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'

const EDITOR_LABELS: Record<string, string> = {
  python:    '🐍 Python',
  html:      '🌐 HTML',
  jupyter:   '📓 Jupyter',
  sql:       '🗄️ SQL',
  microbit:  '🔬 micro:bit',
  vex:       '🤖 VEX IQ',
  builder:   '🧱 3D Builder',
  flowchart: '📊 Flowchart',
}

const EDITOR_PATHS: Record<string, string> = {
  python:    '/student/python',
  html:      '/student/html',
  jupyter:   '/student/jupyter',
  sql:       '/student/sql',
  microbit:  '/student/microbit',
  vex:       '/student/vex',
  builder:   '/student/builder',
  flowchart: '/student/flowchart',
}

const EDITOR_COLORS: Record<string, string> = {
  python: '#3b82f6', html: '#f59e0b', jupyter: '#f97316',
  sql: '#22c55e', microbit: '#06b6d4', vex: '#8b5cf6',
  builder: '#ec4899', flowchart: '#14b8a6',
}

interface Props {
  profile: any
  assignments: any[]
  submissions: any[]
}

export default function StudentTasksClient({ profile, assignments, submissions: initSubs }: Props) {
  const [submissions, setSubmissions] = useState(initSubs)
  const [filter, setFilter] = useState<'all'|'active'|'submitted'|'returned'>('all')
  const [detail, setDetail] = useState<any | null>(null)
  const supabase = createClient()

  const subMap = useMemo(() => {
    const m: Record<string, any> = {}
    submissions.forEach(s => { m[s.assignment_id] = s })
    return m
  }, [submissions])

  async function refreshSubs() {
    const { data } = await supabase.from('task_submissions').select('*').eq('student_id', profile.id)
    setSubmissions(data ?? [])
  }

  function getSub(aId: string) { return subMap[aId] }

  function getStatus(a: any) {
    const sub = getSub(a.id)
    if (!sub) return 'not_started'
    return sub.status
  }

  function getStatusLabel(status: string) {
    return { not_started:'Nezačato', in_progress:'Rozpracováno', submitted:'Odevzdáno', returned:'Vráceno', graded:'Ohodnoceno' }[status] ?? status
  }

  function getStatusColor(status: string) {
    return { not_started:'#6b7280', in_progress:'#f59e0b', submitted:'#3b82f6', returned:'#a855f7', graded:'#22c55e' }[status] ?? '#6b7280'
  }

  function isOverdue(a: any) {
    return a.deadline && new Date(a.deadline) < new Date() && !['submitted','graded'].includes(getStatus(a))
  }

  function daysLeft(deadline: string) {
    const diff = new Date(deadline).getTime() - Date.now()
    const days = Math.ceil(diff / 86400000)
    if (days < 0) return `${Math.abs(days)} dní po deadline`
    if (days === 0) return 'Dnes!'
    if (days === 1) return 'Zítra'
    return `Za ${days} dní`
  }

  const filtered = assignments.filter(a => {
    const s = getStatus(a)
    if (filter === 'active')    return ['not_started','in_progress'].includes(s)
    if (filter === 'submitted') return s === 'submitted'
    if (filter === 'returned')  return ['returned','graded'].includes(s)
    return true
  })

  const accent = profile?.accent_color ?? '#7C3AED'

  // Open task in editor
  function openInEditor(a: any) {
    const sub = getSub(a.id)
    const path = EDITOR_PATHS[a.editor_type]
    if (!path) return
    window.location.href = `${path}?assignment=${a.id}`
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '32px 36px', maxWidth: 860, margin: '0 auto', width: '100%' }}>

      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: '#fff', margin: 0 }}>📋 Moje úkoly</h1>
        <p style={{ color: '#a1a7b3', margin: '6px 0 0', fontSize: 14 }}>
          {assignments.length} {assignments.length === 1 ? 'úkol' : assignments.length < 5 ? 'úkoly' : 'úkolů'} celkem
        </p>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
        {([
          ['all',       'Vše',          assignments.length],
          ['active',    'Aktivní',      assignments.filter(a => ['not_started','in_progress'].includes(getStatus(a))).length],
          ['submitted', 'Odevzdané',    assignments.filter(a => getStatus(a) === 'submitted').length],
          ['returned',  'Vrácené',      assignments.filter(a => ['returned','graded'].includes(getStatus(a))).length],
        ] as [string,string,number][]).map(([val, label, count]) => (
          <button key={val} onClick={() => setFilter(val as any)}
            style={{ padding: '7px 14px', borderRadius: 9, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 600, transition: 'all .15s',
              background: filter === val ? accent : 'rgba(255,255,255,.06)',
              color: filter === val ? '#fff' : '#a1a7b3' }}>
            {label} {count > 0 && <span style={{ marginLeft: 4, padding: '1px 6px', borderRadius: 10, background: 'rgba(0,0,0,.2)', fontSize: 10 }}>{count}</span>}
          </button>
        ))}
      </div>

      {/* Task list */}
      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '80px 0', color: '#6b7280' }}>
          <div style={{ fontSize: 44, marginBottom: 12 }}>✅</div>
          <div style={{ fontSize: 16, fontWeight: 600, color: '#a1a7b3' }}>Žádné úkoly v této kategorii</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {filtered.map(a => {
            const sub = getSub(a.id)
            const status = getStatus(a)
            const editorColor = EDITOR_COLORS[a.editor_type] ?? accent
            const overdue = isOverdue(a)

            return (
              <div key={a.id}
                style={{ background: '#14171F', border: `1px solid ${overdue ? 'rgba(239,68,68,.3)' : 'rgba(255,255,255,.06)'}`, borderRadius: 14, padding: '20px 24px', transition: 'border-color .2s', cursor: 'pointer' }}
                onClick={() => setDetail(a)}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
                  {/* Editor badge */}
                  <div style={{ width: 44, height: 44, borderRadius: 12, background: editorColor+'20', border: `1px solid ${editorColor}40`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>
                    {EDITOR_LABELS[a.editor_type]?.split(' ')[0]}
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5, flexWrap: 'wrap' as const }}>
                      <span style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>{a.title}</span>
                      <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: getStatusColor(status)+'20', color: getStatusColor(status), fontWeight: 600 }}>
                        {getStatusLabel(status)}
                      </span>
                      {sub?.grade && (
                        <span style={{ fontSize: 12, fontWeight: 700, color: '#22c55e', padding: '2px 8px', background: 'rgba(34,197,94,.1)', borderRadius: 6 }}>
                          {sub.grade}
                        </span>
                      )}
                    </div>

                    {a.description && (
                      <p style={{ color: '#a1a7b3', fontSize: 13, margin: '0 0 8px', lineHeight: 1.5, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as any, maxWidth: 540 }}>
                        {a.description}
                      </p>
                    )}

                    <div style={{ display: 'flex', gap: 14, fontSize: 11, color: '#6b7280', flexWrap: 'wrap' as const }}>
                      <span>👤 {a.teacher_name}</span>
                      <span style={{ color: editorColor }}>{EDITOR_LABELS[a.editor_type]}</span>
                      {a.deadline && (
                        <span style={{ color: overdue ? '#ef4444' : a.deadline && new Date(a.deadline).getTime() - Date.now() < 86400000*2 ? '#f59e0b' : '#6b7280', fontWeight: overdue ? 700 : 400 }}>
                          ⏰ {daysLeft(a.deadline)}
                        </span>
                      )}
                      {sub?.teacher_comment && <span style={{ color: '#a855f7' }}>💬 Komentář od učitele</span>}
                    </div>
                  </div>

                  {/* Action button */}
                  <button onClick={e => { e.stopPropagation(); openInEditor(a) }}
                    style={{ padding: '9px 18px', background: status === 'not_started' ? accent : status === 'returned' ? 'rgba(168,85,247,.15)' : 'rgba(255,255,255,.06)', color: status === 'not_started' ? '#fff' : status === 'returned' ? '#a855f7' : '#a1a7b3', border: 'none', borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: 'pointer', flexShrink: 0, whiteSpace: 'nowrap' as const }}>
                    {status === 'not_started' ? '▶ Začít' : status === 'in_progress' ? '✏ Pokračovat' : status === 'returned' ? '↩ Opravit' : '👁 Zobrazit'}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Detail modal */}
      {detail && (
        <TaskDetailModal
          assignment={detail}
          submission={getSub(detail.id)}
          profile={profile}
          accent={accent}
          onClose={() => setDetail(null)}
          onOpen={() => { openInEditor(detail); setDetail(null) }}
          onRefresh={refreshSubs}
          supabase={supabase}
        />
      )}
    </div>
  )
}

// ── Task Detail Modal ─────────────────────────────────────────────────────────
function TaskDetailModal({ assignment: a, submission: sub, profile, accent, onClose, onOpen, onRefresh, supabase }: any) {
  const status = sub?.status ?? 'not_started'
  const editorColor = EDITOR_COLORS[a.editor_type] ?? accent

  const canResubmit = sub && ['returned'].includes(status) &&
    (sub.allow_resubmit_override ?? a.allow_resubmit)

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.75)', zIndex: 9998, backdropFilter: 'blur(4px)' }} />
      <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', zIndex: 9999, width: '90%', maxWidth: 560, background: '#14171F', border: '1px solid rgba(255,255,255,.1)', borderRadius: 18, overflow: 'hidden', boxShadow: '0 32px 80px rgba(0,0,0,.85)' }}>
        {/* Header */}
        <div style={{ padding: '22px 26px 18px', borderBottom: '1px solid rgba(255,255,255,.06)' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
            <div style={{ width: 46, height: 46, borderRadius: 12, background: editorColor+'20', border: `1px solid ${editorColor}40`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 }}>
              {EDITOR_LABELS[a.editor_type]?.split(' ')[0]}
            </div>
            <div style={{ flex: 1 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#fff' }}>{a.title}</h2>
              <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' as const }}>
                <span style={{ fontSize: 11, color: editorColor }}>{EDITOR_LABELS[a.editor_type]}</span>
                <span style={{ fontSize: 11, color: '#6b7280' }}>· od {a.teacher_name}</span>
                {a.deadline && (
                  <span style={{ fontSize: 11, color: new Date(a.deadline) < new Date() ? '#ef4444' : '#6b7280' }}>
                    · ⏰ {new Date(a.deadline).toLocaleString('cs-CZ', { dateStyle: 'medium', timeStyle: 'short' })}
                  </span>
                )}
              </div>
            </div>
            <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', fontSize: 20, padding: 4, lineHeight: 1 }}>×</button>
          </div>
        </div>

        {/* Description */}
        <div style={{ padding: '20px 26px', maxHeight: 280, overflowY: 'auto' }}>
          {a.description ? (
            <div style={{ color: '#e2e8f0', fontSize: 14, lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{a.description}</div>
          ) : (
            <div style={{ color: '#6b7280', fontStyle: 'italic', fontSize: 13 }}>Bez popisu</div>
          )}

          {/* Teacher comment */}
          {sub?.teacher_comment && (
            <div style={{ marginTop: 18, padding: '14px 16px', background: 'rgba(168,85,247,.08)', border: '1px solid rgba(168,85,247,.2)', borderRadius: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#a855f7', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.06em' }}>💬 Zpětná vazba od učitele</div>
              <div style={{ color: '#e2e8f0', fontSize: 13, lineHeight: 1.6 }}>{sub.teacher_comment}</div>
              {sub.grade && <div style={{ marginTop: 8, fontSize: 13, fontWeight: 700, color: '#22c55e' }}>Hodnocení: {sub.grade}</div>}
            </div>
          )}
        </div>

        {/* Actions */}
        <div style={{ padding: '16px 26px 22px', borderTop: '1px solid rgba(255,255,255,.06)', display: 'flex', gap: 10 }}>
          {['not_started','in_progress'].includes(status) && (
            <button onClick={onOpen}
              style={{ flex: 1, padding: '12px', background: accent, color: '#fff', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
              {status === 'not_started' ? '▶ Otevřít a začít' : '✏ Pokračovat v práci'}
            </button>
          )}
          {status === 'submitted' && (
            <div style={{ flex: 1, padding: '12px', background: 'rgba(59,130,246,.1)', border: '1px solid rgba(59,130,246,.2)', borderRadius: 10, textAlign: 'center' as const, color: '#3b82f6', fontSize: 13, fontWeight: 600 }}>
              ✓ Odevzdáno — čeká na hodnocení
            </div>
          )}
          {status === 'returned' && (
            <button onClick={onOpen}
              style={{ flex: 1, padding: '12px', background: 'rgba(168,85,247,.15)', color: '#a855f7', border: '1px solid rgba(168,85,247,.3)', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
              ↩ Opravit a znovu odevzdat
            </button>
          )}
          {status === 'graded' && (
            <button onClick={onOpen}
              style={{ flex: 1, padding: '12px', background: 'rgba(255,255,255,.06)', color: '#a1a7b3', border: '1px solid rgba(255,255,255,.1)', borderRadius: 10, fontSize: 14, cursor: 'pointer' }}>
              👁 Zobrazit odevzdané
            </button>
          )}
          <button onClick={onClose}
            style={{ padding: '12px 18px', background: 'rgba(255,255,255,.05)', color: '#6b7280', border: '1px solid rgba(255,255,255,.08)', borderRadius: 10, cursor: 'pointer' }}>
            Zavřít
          </button>
        </div>
      </div>
    </>
  )
}
