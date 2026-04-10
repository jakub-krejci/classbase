'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { saveAssignment, changeAssignmentStatus, deleteAssignmentAction, gradeSubmission, toggleResubmitAction, getAssignments, getSubmissionsForAssignment } from './actions'

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

const STATUS_LABELS: Record<string, string> = {
  draft:     'Koncept',
  published: 'Publikováno',
  closed:    'Uzavřeno',
}

const STATUS_COLORS: Record<string, string> = {
  draft:     '#6b7280',
  published: '#22c55e',
  closed:    '#ef4444',
}

const SUB_STATUS_LABELS: Record<string, string> = {
  not_started: 'Nezačato',
  in_progress: 'Rozpracováno',
  submitted:   'Odevzdáno',
  returned:    'Vráceno',
  graded:      'Hodnoceno',
}

const SUB_STATUS_COLORS: Record<string, string> = {
  not_started: '#6b7280',
  in_progress: '#f59e0b',
  submitted:   '#3b82f6',
  returned:    '#a855f7',
  graded:      '#22c55e',
}

interface Props {
  teacherId: string
  assignments: any[]
  students: any[]
  groups: any[]
}

export default function TeacherTasksClient({ teacherId, assignments: init, students, groups }: Props) {
  const supabase = createClient()
  const [assignments, setAssignments] = useState<any[]>(init)
  const [view, setView] = useState<'list' | 'new' | 'detail'>('list')
  const [detailId, setDetailId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  // ── Form state ────────────────────────────────────────────────────────────
  const blank = { title:'', description:'', editor_type:'python', deadline:'', allow_resubmit:false, status:'draft', starter_code:'', starter_filename:'' }
  const [form, setForm] = useState<any>(blank)
  const [selStudents, setSelStudents] = useState<Set<string>>(new Set())
  const [selGroups, setSelGroups]     = useState<Set<string>>(new Set())
  const [editId, setEditId] = useState<string | null>(null)

  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(''), 3000) }

  // ── Refresh ───────────────────────────────────────────────────────────────
  const refresh = useCallback(async () => {
    const data = await getAssignments()
    setAssignments(data as any[])
  }, [])

  // ── Save assignment via server action ────────────────────────────────────
  async function save(publishNow = false) {
    if (!form.title.trim()) { flash('Vyplň název úkolu'); return }
    if (selStudents.size === 0 && selGroups.size === 0) { flash('Vyber alespoň jednoho žáka nebo skupinu'); return }
    setSaving(true)
    try {
      const result = await saveAssignment({
        editId: editId,
        title: form.title.trim(),
        description: form.description.trim(),
        editor_type: form.editor_type,
        deadline: form.deadline ? new Date(form.deadline).toISOString() : null,
        allow_resubmit: form.allow_resubmit,
        publishNow,
        studentIds: [...selStudents],
        groupIds: [...selGroups],
        starter_code: form.starter_code ?? '',
        starter_filename: form.starter_filename ?? '',
      })
      if (result.error) {
        flash(`Chyba: ${result.error}`)
        setSaving(false); return
      }
      flash(publishNow ? '✓ Úkol publikován' : '✓ Uloženo')
      await refresh()
      setView('list')
      resetForm()
    } catch (e: any) {
      flash(`Neočekávaná chyba: ${e?.message ?? e}`)
    } finally {
      setSaving(false)
    }
  }

  async function deleteAssignment(id: string) {
    if (!confirm('Opravdu smazat tento úkol? Tato akce je nevratná.')) return
    await deleteAssignmentAction(id)
    await refresh()
  }

  async function changeStatus(id: string, status: string) {
    const result = await changeAssignmentStatus(id, status)
    if (result.error) { flash(`Chyba: ${result.error}`); return }
    await refresh()
    flash(`✓ Stav změněn na: ${STATUS_LABELS[status]}`)
  }

  function resetForm() {
    setForm(blank); setSelStudents(new Set()); setSelGroups(new Set()); setEditId(null)
  }

  function openEdit(a: any) {
    setForm({
      title: a.title, description: a.description, editor_type: a.editor_type,
      deadline: a.deadline ? a.deadline.slice(0,16) : '',
      allow_resubmit: a.allow_resubmit, status: a.status,
      starter_code: a.starter_code ?? '',
      starter_filename: a.starter_filename ?? '',
    })
    const ss = new Set<string>(), sg = new Set<string>()
    ;(a.task_targets ?? []).forEach((t: any) => {
      if (t.student_id) ss.add(t.student_id)
      if (t.group_id) sg.add(t.group_id)
    })
    setSelStudents(ss); setSelGroups(sg); setEditId(a.id)
    setView('new')
  }

  function toggleStudent(id: string) {
    setSelStudents(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }
  function toggleGroup(id: string) {
    setSelGroups(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  const detail = assignments.find(a => a.id === detailId)

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ padding: '32px 40px', maxWidth: 1100, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 800, color: '#fff', margin: 0 }}>📋 Úkoly</h1>
          <p style={{ color: '#a1a7b3', margin: '4px 0 0', fontSize: 14 }}>Zadávání a správa úkolů pro žáky</p>
        </div>
        {view === 'list' && (
          <button onClick={() => { resetForm(); setView('new') }}
            style={{ padding: '10px 20px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
            + Nový úkol
          </button>
        )}
        {view !== 'list' && (
          <button onClick={() => { setView('list'); setDetailId(null); resetForm() }}
            style={{ padding: '8px 16px', background: 'rgba(255,255,255,.08)', color: '#a1a7b3', border: '1px solid rgba(255,255,255,.1)', borderRadius: 8, fontSize: 13, cursor: 'pointer' }}>
            ← Zpět
          </button>
        )}
      </div>

      {msg && (
        <div style={{ marginBottom: 16, padding: '10px 16px', background: 'rgba(34,197,94,.12)', border: '1px solid rgba(34,197,94,.3)', borderRadius: 8, color: '#22c55e', fontSize: 13 }}>
          {msg}
        </div>
      )}

      {/* ══ LIST VIEW ══ */}
      {view === 'list' && (
        <>
          {assignments.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '80px 0', color: '#6b7280' }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>📋</div>
              <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>Zatím žádné úkoly</div>
              <div style={{ fontSize: 13 }}>Klikni na „+ Nový úkol" a zadej první úkol svým žákům</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {assignments.map(a => {
                const subs = a.task_submissions ?? []
                const submitted = subs.filter((s: any) => ['submitted','returned','graded'].includes(s.status)).length
                const total = (a.task_targets ?? []).length  // approximate
                const isPast = a.deadline && new Date(a.deadline) < new Date()
                return (
                  <div key={a.id} style={{ background: '#14171F', border: '1px solid rgba(255,255,255,.06)', borderRadius: 14, padding: '18px 22px' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>{a.title}</span>
                          <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: STATUS_COLORS[a.status]+'20', color: STATUS_COLORS[a.status], fontWeight: 600 }}>
                            {STATUS_LABELS[a.status]}
                          </span>
                          <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: 'rgba(255,255,255,.06)', color: '#a1a7b3' }}>
                            {EDITOR_LABELS[a.editor_type]}
                          </span>
                        </div>
                        {a.description && (
                          <p style={{ color: '#a1a7b3', fontSize: 12, margin: '0 0 8px', lineHeight: 1.5, maxWidth: 600, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as any }}>
                            {a.description}
                          </p>
                        )}
                        <div style={{ display: 'flex', gap: 16, fontSize: 11, color: '#6b7280' }}>
                          {a.deadline && (
                            <span style={{ color: isPast ? '#ef4444' : '#a1a7b3' }}>
                              ⏰ Deadline: {new Date(a.deadline).toLocaleString('cs-CZ', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' })}
                              {isPast && ' (prošlé)'}
                            </span>
                          )}
                          <span>👥 {subs.length} odevzdání</span>
                          {a.allow_resubmit && <span>🔄 Znovu odevzdat povoleno</span>}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 8, flexShrink: 0, flexWrap: 'wrap' as const, justifyContent: 'flex-end' }}>
                        {a.status !== 'published' && (
                          <button onClick={() => changeStatus(a.id, 'published')}
                            style={{ padding: '6px 12px', background: 'rgba(34,197,94,.12)', color: '#22c55e', border: '1px solid rgba(34,197,94,.3)', borderRadius: 7, fontSize: 11, cursor: 'pointer', fontWeight: 600 }}>
                            Publikovat
                          </button>
                        )}
                        {a.status === 'published' && (
                          <button onClick={() => changeStatus(a.id, 'closed')}
                            style={{ padding: '6px 12px', background: 'rgba(239,68,68,.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,.25)', borderRadius: 7, fontSize: 11, cursor: 'pointer' }}>
                            Uzavřít
                          </button>
                        )}
                        <button onClick={() => { setDetailId(a.id); setView('detail') }}
                          style={{ padding: '6px 12px', background: 'rgba(255,255,255,.06)', color: '#a1a7b3', border: '1px solid rgba(255,255,255,.1)', borderRadius: 7, fontSize: 11, cursor: 'pointer' }}>
                          📊 Odevzdání
                        </button>
                        <button onClick={() => openEdit(a)}
                          style={{ padding: '6px 12px', background: 'rgba(255,255,255,.06)', color: '#a1a7b3', border: '1px solid rgba(255,255,255,.1)', borderRadius: 7, fontSize: 11, cursor: 'pointer' }}>
                          ✏ Upravit
                        </button>
                        <button onClick={() => deleteAssignment(a.id)}
                          style={{ padding: '6px 12px', background: 'rgba(239,68,68,.08)', color: '#ef4444', border: '1px solid rgba(239,68,68,.2)', borderRadius: 7, fontSize: 11, cursor: 'pointer' }}>
                          🗑
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}

      {/* ══ NEW/EDIT FORM ══ */}
      {view === 'new' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 24 }}>
          {/* Left: form */}
          <div style={{ background: '#14171F', border: '1px solid rgba(255,255,255,.06)', borderRadius: 16, padding: 28, display: 'flex', flexDirection: 'column', gap: 20 }}>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#fff' }}>
              {editId ? '✏ Upravit úkol' : '+ Nový úkol'}
            </h2>

            <Field label="Název úkolu *">
              <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })}
                placeholder="Např. Úvod do podmínek if/else" style={inputStyle} />
            </Field>

            <Field label="Zadání / popis úkolu">
              <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
                placeholder="Popiš co má žák udělat, jaký výstup se očekává, případné tipy..."
                style={{ ...inputStyle, minHeight: 200, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.6 }} />
            </Field>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <Field label="Editor *">
                <select value={form.editor_type} onChange={e => setForm({ ...form, editor_type: e.target.value })}
                  style={{ ...inputStyle, cursor: 'pointer' }}>
                  {Object.entries(EDITOR_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </Field>

              <Field label="Deadline">
                <input type="datetime-local" value={form.deadline} onChange={e => setForm({ ...form, deadline: e.target.value })}
                  style={{ ...inputStyle, colorScheme: 'dark' }} />
              </Field>
            </div>

            <Field label="Starter kód (volitelné — výchozí obsah souboru pro žáka)">
              <textarea value={form.starter_code ?? ''} onChange={e => setForm({ ...form, starter_code: e.target.value })}
                placeholder={form.editor_type === 'python'
                  ? '# Váš starter kód zde\n\ndef main():\n    pass\n'
                  : form.editor_type === 'sql'
                  ? '-- Váš starter SQL dotaz\nSELECT * FROM ...'
                  : 'Výchozí obsah souboru pro žáky...'}
                style={{ ...inputStyle, minHeight: 140, resize: 'vertical', fontFamily: 'monospace', fontSize: 12, lineHeight: 1.5 }} />
              <div style={{ fontSize: 11, color: D.txtSec ?? '#a1a7b3', marginTop: 4 }}>
                Pokud nevyplníš, žák začne s prázdným souborem. Použij pro šablony, příklady nebo částečná řešení.
              </div>
            </Field>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none' }}>
                <input type="checkbox" checked={form.allow_resubmit} onChange={e => setForm({ ...form, allow_resubmit: e.target.checked })}
                  style={{ width: 16, height: 16, accentColor: 'var(--accent)', cursor: 'pointer' }} />
                <span style={{ fontSize: 13, color: '#a1a7b3' }}>Povolit žákům znovu odevzdat po vrácení</span>
              </label>
            </div>

            <div style={{ display: 'flex', gap: 10, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,.06)' }}>
              <button onClick={() => save(false)} disabled={saving}
                style={{ padding: '10px 20px', background: 'rgba(255,255,255,.08)', color: '#fff', border: '1px solid rgba(255,255,255,.15)', borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                {saving ? 'Ukládám…' : '💾 Uložit jako koncept'}
              </button>
              <button onClick={() => save(true)} disabled={saving}
                style={{ padding: '10px 24px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                {saving ? 'Ukládám…' : '🚀 Publikovat'}
              </button>
            </div>
          </div>

          {/* Right: recipients */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {groups.length > 0 && (
              <div style={{ background: '#14171F', border: '1px solid rgba(255,255,255,.06)', borderRadius: 16, padding: 20 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#a1a7b3', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 12 }}>
                  Skupiny ({selGroups.size} vybráno)
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {groups.map((g: any) => (
                    <label key={g.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', background: selGroups.has(g.id) ? 'var(--accent)12' : 'rgba(255,255,255,.03)', borderRadius: 8, cursor: 'pointer', border: `1px solid ${selGroups.has(g.id) ? 'var(--accent)30' : 'transparent'}` }}>
                      <input type="checkbox" checked={selGroups.has(g.id)} onChange={() => toggleGroup(g.id)}
                        style={{ accentColor: 'var(--accent)', flexShrink: 0 }} />
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 600, color: '#fff' }}>{g.name}</div>
                        <div style={{ fontSize: 10, color: '#6b7280' }}>{(g.group_members ?? []).length} žáků</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            )}

            <div style={{ background: '#14171F', border: '1px solid rgba(255,255,255,.06)', borderRadius: 16, padding: 20, flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#a1a7b3', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 12 }}>
                Žáci ({selStudents.size} vybráno)
              </div>
              <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                <button onClick={() => setSelStudents(new Set(students.map((s: any) => s.id)))}
                  style={{ padding: '4px 10px', background: 'rgba(255,255,255,.06)', color: '#a1a7b3', border: '1px solid rgba(255,255,255,.1)', borderRadius: 6, fontSize: 11, cursor: 'pointer' }}>
                  Vybrat vše
                </button>
                <button onClick={() => setSelStudents(new Set())}
                  style={{ padding: '4px 10px', background: 'rgba(255,255,255,.06)', color: '#a1a7b3', border: '1px solid rgba(255,255,255,.1)', borderRadius: 6, fontSize: 11, cursor: 'pointer' }}>
                  Zrušit výběr
                </button>
              </div>
              <div style={{ overflowY: 'auto', flex: 1, maxHeight: 400, display: 'flex', flexDirection: 'column', gap: 4 }}>
                {students.map((s: any) => (
                  <label key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', background: selStudents.has(s.id) ? 'var(--accent)12' : 'rgba(255,255,255,.03)', borderRadius: 7, cursor: 'pointer', border: `1px solid ${selStudents.has(s.id) ? 'var(--accent)30' : 'transparent'}` }}>
                    <input type="checkbox" checked={selStudents.has(s.id)} onChange={() => toggleStudent(s.id)}
                      style={{ accentColor: 'var(--accent)', flexShrink: 0 }} />
                    <div style={{ overflow: 'hidden' }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.full_name}</div>
                      <div style={{ fontSize: 10, color: '#6b7280', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.email}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══ DETAIL / SUBMISSIONS VIEW ══ */}
      {view === 'detail' && detail && (
        <SubmissionsDetail
          assignment={detail}
          onRefresh={refresh}
        />
      )}
    </div>
  )
}

// ── Submissions Detail ────────────────────────────────────────────────────────
function SubmissionsDetail({ assignment, onRefresh }: { assignment: any; onRefresh: () => void }) {
  const supabase = createClient()
  const [submissions, setSubmissions] = useState<any[]>(assignment.task_submissions ?? [])
  const [selected, setSelected] = useState<any | null>(null)
  const [comment, setComment] = useState('')
  const [grade, setGrade] = useState('')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(''), 3000) }

  async function refreshSubs() {
    // Use admin-level server action to bypass RLS for teacher
    const data = await getSubmissionsForAssignment(assignment.id)
    setSubmissions(data as any[])
  }

  async function returnSubmission(sub: any) {
    setSaving(true)
    const result = await gradeSubmission(sub.id, { status: 'returned', teacher_comment: comment, grade })
    if (result.error) flash(`Chyba: ${result.error}`)
    else { flash('✓ Vráceno žákovi'); setSelected(null); await refreshSubs() }
    setSaving(false)
  }

  async function gradeSubmissionHandler(sub: any) {
    setSaving(true)
    const result = await gradeSubmission(sub.id, { status: 'graded', teacher_comment: comment, grade })
    if (result.error) flash(`Chyba: ${result.error}`)
    else { flash('✓ Ohodnoceno'); setSelected(null); await refreshSubs() }
    setSaving(false)
  }

  async function handleToggleResubmit(sub: any) {
    const newVal = !(sub.allow_resubmit_override ?? assignment.allow_resubmit)
    await toggleResubmitAction(sub.id, newVal)
    await refreshSubs()
  }

  const EDITOR_PATHS: Record<string, string> = {
    python: '/student/python', html: '/student/html', jupyter: '/student/jupyter',
    sql: '/student/sql', microbit: '/student/microbit', vex: '/student/vex',
    builder: '/student/builder', flowchart: '/student/flowchart',
  }

  return (
    <div>
      <div style={{ background: '#14171F', border: '1px solid rgba(255,255,255,.06)', borderRadius: 14, padding: '20px 24px', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#fff' }}>{assignment.title}</h2>
          <span style={{ fontSize: 12, padding: '3px 10px', borderRadius: 20, background: STATUS_COLORS[assignment.status]+'20', color: STATUS_COLORS[assignment.status] }}>
            {STATUS_LABELS[assignment.status]}
          </span>
          <span style={{ fontSize: 12, color: '#6b7280' }}>{EDITOR_LABELS[assignment.editor_type]}</span>
        </div>
        {assignment.description && (
          <p style={{ color: '#a1a7b3', fontSize: 13, margin: '0 0 8px', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{assignment.description}</p>
        )}
        {assignment.deadline && (
          <div style={{ fontSize: 12, color: '#6b7280' }}>
            ⏰ Deadline: {new Date(assignment.deadline).toLocaleString('cs-CZ', { dateStyle: 'medium', timeStyle: 'short' })}
          </div>
        )}
      </div>

      {msg && <div style={{ marginBottom: 12, padding: '10px 16px', background: 'rgba(34,197,94,.12)', border: '1px solid rgba(34,197,94,.3)', borderRadius: 8, color: '#22c55e', fontSize: 13 }}>{msg}</div>}

      {submissions.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#6b7280' }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>📭</div>
          <div>Zatím žádná odevzdání</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {submissions.map(sub => (
            <div key={sub.id} style={{ background: '#14171F', border: '1px solid rgba(255,255,255,.06)', borderRadius: 12, padding: '16px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, color: '#fff', fontSize: 14 }}>{sub.profiles?.full_name ?? sub.student_id}</div>
                  <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>{sub.profiles?.email}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 20, background: SUB_STATUS_COLORS[sub.status]+'20', color: SUB_STATUS_COLORS[sub.status], fontWeight: 600 }}>
                    {SUB_STATUS_LABELS[sub.status]}
                  </span>
                  {sub.grade && <span style={{ fontSize: 12, fontWeight: 700, color: '#22c55e', padding: '2px 8px', background: 'rgba(34,197,94,.1)', borderRadius: 6 }}>{sub.grade}</span>}
                  {sub.submitted_at && (
                    <span style={{ fontSize: 11, color: '#6b7280' }}>
                      {new Date(sub.submitted_at).toLocaleString('cs-CZ', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {sub.file_path && (
                    <a href={`${EDITOR_PATHS[assignment.editor_type]}?assignment=${assignment.id}&student=${sub.student_id}&readonly=1`}
                      target="_blank"
                      style={{ padding: '6px 12px', background: 'rgba(59,130,246,.12)', color: '#3b82f6', border: '1px solid rgba(59,130,246,.25)', borderRadius: 7, fontSize: 11, textDecoration: 'none', fontWeight: 600 }}>
                      👁 Zobrazit
                    </a>
                  )}
                  {['submitted','returned'].includes(sub.status) && (
                    <button onClick={() => { setSelected(sub); setComment(sub.teacher_comment ?? ''); setGrade(sub.grade ?? '') }}
                      style={{ padding: '6px 12px', background: 'rgba(255,255,255,.06)', color: '#a1a7b3', border: '1px solid rgba(255,255,255,.1)', borderRadius: 7, fontSize: 11, cursor: 'pointer' }}>
                      ✍ Hodnotit
                    </button>
                  )}
                  <button onClick={() => handleToggleResubmit(sub)} title="Přepnout povolení znovu odevzdat"
                    style={{ padding: '6px 10px', background: (sub.allow_resubmit_override ?? assignment.allow_resubmit) ? 'rgba(168,85,247,.12)' : 'rgba(255,255,255,.04)', color: (sub.allow_resubmit_override ?? assignment.allow_resubmit) ? '#a855f7' : '#6b7280', border: '1px solid rgba(255,255,255,.08)', borderRadius: 7, fontSize: 11, cursor: 'pointer' }}>
                    🔄
                  </button>
                </div>
              </div>
              {sub.teacher_comment && (
                <div style={{ marginTop: 10, padding: '8px 12px', background: 'rgba(255,255,255,.04)', borderRadius: 7, fontSize: 12, color: '#a1a7b3', borderLeft: '3px solid rgba(255,255,255,.1)' }}>
                  💬 {sub.teacher_comment}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Grade modal */}
      {selected && (
        <>
          <div onClick={() => setSelected(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)', zIndex: 9998, backdropFilter: 'blur(4px)' }} />
          <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', zIndex: 9999, width: 480, background: '#14171F', border: '1px solid rgba(255,255,255,.1)', borderRadius: 16, padding: 28, boxShadow: '0 24px 60px rgba(0,0,0,.8)' }}>
            <h3 style={{ margin: '0 0 20px', color: '#fff', fontSize: 16 }}>
              ✍ Hodnocení — {selected.profiles?.full_name}
            </h3>
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: '#a1a7b3', textTransform: 'uppercase', letterSpacing: '.06em', display: 'block', marginBottom: 6 }}>Hodnocení / Známka</label>
              <input value={grade} onChange={e => setGrade(e.target.value)}
                placeholder="Např. 1, A, Výborně, 85/100..."
                style={{ ...inputStyle, marginBottom: 0 }} />
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: '#a1a7b3', textTransform: 'uppercase', letterSpacing: '.06em', display: 'block', marginBottom: 6 }}>Komentář pro žáka</label>
              <textarea value={comment} onChange={e => setComment(e.target.value)}
                placeholder="Zpětná vazba, co udělal dobře / co zlepšit..."
                style={{ ...inputStyle, minHeight: 120, resize: 'vertical', fontFamily: 'inherit', marginBottom: 0, lineHeight: 1.6 }} />
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => returnSubmission(selected)} disabled={saving}
                style={{ flex: 1, padding: '10px', background: 'rgba(168,85,247,.15)', color: '#a855f7', border: '1px solid rgba(168,85,247,.3)', borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                {saving ? '…' : '↩ Vrátit žákovi'}
              </button>
              <button onClick={() => gradeSubmissionHandler(selected)} disabled={saving}
                style={{ flex: 1, padding: '10px', background: 'rgba(34,197,94,.12)', color: '#22c55e', border: '1px solid rgba(34,197,94,.3)', borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                {saving ? '…' : '✓ Uzavřít hodnocení'}
              </button>
              <button onClick={() => setSelected(null)}
                style={{ padding: '10px 16px', background: 'rgba(255,255,255,.06)', color: '#a1a7b3', border: '1px solid rgba(255,255,255,.1)', borderRadius: 9, cursor: 'pointer' }}>
                Zrušit
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#a1a7b3', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 7 }}>{label}</label>
      {children}
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 14px',
  background: '#1E2230', border: '1px solid rgba(255,255,255,.08)',
  borderRadius: 9, fontSize: 13, color: '#fff', fontFamily: 'inherit',
  outline: 'none', boxSizing: 'border-box',
}
