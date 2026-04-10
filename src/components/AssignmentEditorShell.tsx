'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useRef } from 'react'
import { D } from '@/components/DarkLayout'
import {
  getAssignmentForStudent,
  submitAssignment,
  unsubmitAssignment,
  getAssignmentFileContent,
  saveAssignmentFile,
} from '@/app/student/tasks/actions'

// ── Types ──────────────────────────────────────────────────────────────────────
export interface AssignmentInfo {
  id: string
  title: string
  description: string
  editor_type: string
  deadline: string | null
  allow_resubmit: boolean
  starter_code: string
  starter_filename: string
  teacher_name: string
}

// Extension per editor type
export const EDITOR_EXTENSIONS: Record<string, string> = {
  python:    'py',
  html:      'html',
  jupyter:   'json',
  sql:       'sql',
  microbit:  'py',
  vex:       'py',
  builder:   'json',
  flowchart: 'json',
}

export const EDITOR_BUCKETS: Record<string, string> = {
  python:    'python-files',
  html:      'web-files',
  jupyter:   'jupyter-files',
  sql:       'sql-files',
  microbit:  'microbit-files',
  vex:       'vex-files',
  builder:   'builder-files',
  flowchart: 'flowchart-files',
}

// Default starter content per editor type
const DEFAULT_STARTERS: Record<string, string> = {
  python:    '# Tvůj kód zde\n',
  html:      '<!DOCTYPE html>\n<html lang="cs">\n<head>\n  <meta charset="UTF-8">\n  <title>Úkol</title>\n</head>\n<body>\n  \n</body>\n</html>\n',
  jupyter:   '{"cells":[],"metadata":{"kernelspec":{"display_name":"Python 3","language":"python","name":"python3"}},"nbformat":4,"nbformat_minor":4}',
  sql:       '-- Tvůj SQL kód zde\n',
  microbit:  '# Tvůj micro:bit kód\nfrom microbit import *\n\nwhile True:\n    pass\n',
  vex:       '# Tvůj VEX IQ kód\nfrom vex import *\n\nbrain = Brain()\n',
  builder:   '{"objects":[],"groups":[]}',
  flowchart: '{"nodes":[],"edges":[]}',
}

// ── Hook: useAssignmentFile ────────────────────────────────────────────────────
export function useAssignmentFile(
  assignmentId: string | null,
  editorType: string,
) {
  const [assignment, setAssignment] = useState<AssignmentInfo | null>(null)
  const [submission, setSubmission] = useState<any | null>(null)
  const [studentId, setStudentId]   = useState<string | null>(null)
  const [fileContent, setFileContent] = useState<string | null>(null)
  const [filePath, setFilePath]     = useState<string | null>(null)
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState<string | null>(null)

  const bucket = EDITOR_BUCKETS[editorType] ?? 'python-files'
  const ext    = EDITOR_EXTENSIONS[editorType] ?? 'txt'

  useEffect(() => {
    if (!assignmentId) { setLoading(false); return }
    init()
  }, [assignmentId])

  async function init() {
    setLoading(true); setError(null)
    try {
      // Use server action to bypass RLS
      const result = await getAssignmentForStudent(assignmentId!)
      if (result.error || !result.assignment) {
        setError(result.error ?? 'Úkol nenalezen')
        setLoading(false); return
      }
      setAssignment(result.assignment as AssignmentInfo)
      setSubmission(result.submission)
      setStudentId(result.studentId ?? null)

      const sid = result.studentId!
      const workPath = `assignments/${assignmentId}/${sid}/work.${ext}`
      setFilePath(workPath)

      // Try to load existing file via server action
      const { content } = await getAssignmentFileContent(bucket, workPath)
      if (content !== null) {
        setFileContent(content)
      } else {
        // Create file from starter_code or default
        const starter = result.assignment.starter_code?.trim()
          ? result.assignment.starter_code
          : DEFAULT_STARTERS[editorType] ?? ''
        await saveAssignmentFile(bucket, workPath, starter)
        setFileContent(starter)
      }
    } catch (e: any) {
      setError(e?.message ?? 'Neznámá chyba')
    }
    setLoading(false)
  }

  async function saveFile(content: string) {
    if (!filePath) return
    await saveAssignmentFile(bucket, filePath, content)
    setFileContent(content)
  }

  async function submit(content: string) {
    if (!filePath || !assignmentId) return
    await saveAssignmentFile(bucket, filePath, content)
    await submitAssignment(assignmentId, filePath)
    setSubmission((p: any) => ({ ...p, status: 'submitted', submitted_at: new Date().toISOString() }))
  }

  async function unsubmit() {
    if (!assignmentId) return
    const result = await unsubmitAssignment(assignmentId)
    if (result.error) throw new Error(result.error)
    setSubmission((p: any) => ({ ...p, status: 'in_progress' }))
  }

  return {
    assignment, submission, studentId, fileContent, filePath, loading, error,
    saveFile, submit, unsubmit,
    bucket, ext,
  }
}

// ── AssignmentEditorShell ─────────────────────────────────────────────────────
interface ShellProps {
  assignmentId: string
  studentId?: string  // kept for compat but not used (server action gets it)
  editorType: string
  accent: string
  children: (props: {
    initialContent: string
    filePath: string
    onContentChange: (content: string) => void
    saveFile: (content: string) => Promise<void>
    readOnly: boolean
  }) => React.ReactNode
}

export function AssignmentEditorShell({ assignmentId, editorType, accent, children }: ShellProps) {
  const {
    assignment, submission, fileContent, filePath, loading, error,
    saveFile, submit, unsubmit,
  } = useAssignmentFile(assignmentId, editorType)

  const [confirmSubmit, setConfirmSubmit]   = useState(false)
  const [confirmUnsubmit, setConfirmUnsubmit] = useState(false)
  const [submitting, setSubmitting]         = useState(false)
  const [msg, setMsg]                       = useState('')
  const [collapsed, setCollapsed]           = useState(false)
  const contentRef = useRef<string>(fileContent ?? '')

  useEffect(() => {
    if (fileContent !== null) contentRef.current = fileContent
  }, [fileContent])

  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(''), 3500) }

  const status = submission?.status ?? 'not_started'
  const isSubmitted = ['submitted', 'graded'].includes(status)
  const isReturned  = status === 'returned'
  const canResubmit = isReturned && (submission?.allow_resubmit_override ?? assignment?.allow_resubmit)
  const readOnly    = isSubmitted

  async function handleSubmit() {
    setSubmitting(true)
    setConfirmSubmit(false)
    try {
      await submit(contentRef.current)
      flash('✓ Úkol byl úspěšně odevzdán!')
    } catch { flash('Chyba při odevzdání') }
    setSubmitting(false)
  }

  async function handleUnsubmit() {
    setSubmitting(true)
    setConfirmUnsubmit(false)
    await unsubmit()
    flash('✓ Odevzdání vráceno — můžeš upravit a znovu odevzdat')
    setSubmitting(false)
  }

  if (loading) return (
    <div style={{ display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 14, color: D.txtSec }}>
      <div style={{ width: 32, height: 32, border: `3px solid ${D.border}`, borderTopColor: accent, borderRadius: '50%', animation: 'spin .7s linear infinite' }} />
      <span>Načítám úkol…</span>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )

  if (error) return (
    <div style={{ display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12, color: D.danger }}>
      <div style={{ fontSize: 36 }}>⚠</div>
      <div style={{ fontSize: 15, fontWeight: 600 }}>Chyba při načítání úkolu</div>
      <div style={{ fontSize: 13, color: D.txtSec }}>{error}</div>
    </div>
  )

  if (!assignment || fileContent === null || !filePath) return null

  const deadlineStr = assignment.deadline
    ? new Date(assignment.deadline).toLocaleString('cs-CZ', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : null
  const deadlinePast = assignment.deadline && new Date(assignment.deadline) < new Date()

  const statusColors: Record<string, string> = {
    not_started: '#6b7280', in_progress: '#f59e0b',
    submitted: '#3b82f6', returned: '#a855f7', graded: '#22c55e',
  }
  const statusLabels: Record<string, string> = {
    not_started: 'Nezačato', in_progress: 'Rozpracováno',
    submitted: 'Odevzdáno', returned: 'Vráceno', graded: 'Ohodnoceno',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

      {/* ── Confirm modals ── */}
      {confirmSubmit && (
        <>
          <div onClick={() => setConfirmSubmit(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.75)', zIndex: 9998, backdropFilter: 'blur(4px)' }} />
          <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', zIndex: 9999, width: 420, background: D.bgCard, border: `1px solid ${D.border}`, borderRadius: 16, padding: 28, boxShadow: '0 24px 60px rgba(0,0,0,.8)' }}>
            <div style={{ fontSize: 17, fontWeight: 800, color: '#fff', marginBottom: 10 }}>📤 Odevzdat úkol?</div>
            <p style={{ color: D.txtSec, fontSize: 13, lineHeight: 1.7, marginBottom: 22 }}>
              Aktuální verze souboru bude odeslána učiteli.
              {assignment.allow_resubmit && ' Učitel povoluje opětovné odevzdání.'}
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={handleSubmit} disabled={submitting}
                style={{ flex: 1, padding: '11px', background: accent, color: '#fff', border: 'none', borderRadius: 9, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
                {submitting ? 'Odevzdávám…' : '✓ Odevzdat'}
              </button>
              <button onClick={() => setConfirmSubmit(false)}
                style={{ padding: '11px 18px', background: D.bgMid, color: D.txtSec, border: `1px solid ${D.border}`, borderRadius: 9, cursor: 'pointer' }}>
                Zrušit
              </button>
            </div>
          </div>
        </>
      )}

      {confirmUnsubmit && (
        <>
          <div onClick={() => setConfirmUnsubmit(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.75)', zIndex: 9998, backdropFilter: 'blur(4px)' }} />
          <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', zIndex: 9999, width: 420, background: D.bgCard, border: `1px solid ${D.border}`, borderRadius: 16, padding: 28, boxShadow: '0 24px 60px rgba(0,0,0,.8)' }}>
            <div style={{ fontSize: 17, fontWeight: 800, color: '#fff', marginBottom: 10 }}>↩ Vrátit odevzdání?</div>
            <p style={{ color: D.txtSec, fontSize: 13, lineHeight: 1.7, marginBottom: 22 }}>
              Soubor bude znovu editovatelný a budeš moci provést změny a znovu odevzdat.
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={handleUnsubmit} disabled={submitting}
                style={{ flex: 1, padding: '11px', background: 'rgba(168,85,247,.2)', color: '#a855f7', border: '1px solid rgba(168,85,247,.4)', borderRadius: 9, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
                ↩ Vrátit odevzdání
              </button>
              <button onClick={() => setConfirmUnsubmit(false)}
                style={{ padding: '11px 18px', background: D.bgMid, color: D.txtSec, border: `1px solid ${D.border}`, borderRadius: 9, cursor: 'pointer' }}>
                Zrušit
              </button>
            </div>
          </div>
        </>
      )}

      {/* ── Task panel ── */}
      <div style={{ background: D.bgCard, borderBottom: `1px solid ${D.border}`, flexShrink: 0 }}>
        {/* Header row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 16px', cursor: 'pointer' }}
          onClick={() => setCollapsed(p => !p)}>
          <span style={{ fontSize: 15 }}>📋</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>{assignment.title}</span>
            <span style={{ fontSize: 11, color: D.txtSec, marginLeft: 8 }}>od {assignment.teacher_name}</span>
          </div>

          {/* Status badge */}
          <span style={{ fontSize: 11, padding: '2px 9px', borderRadius: 20, background: statusColors[status] + '22', color: statusColors[status], fontWeight: 600, flexShrink: 0 }}>
            {statusLabels[status]}
          </span>

          {/* Deadline */}
          {deadlineStr && (
            <span style={{ fontSize: 11, color: deadlinePast ? '#ef4444' : D.txtSec, flexShrink: 0 }}>
              ⏰ {deadlineStr}
            </span>
          )}

          {/* Flash message */}
          {msg && <span style={{ fontSize: 11, color: '#22c55e', flexShrink: 0, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{msg}</span>}

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
            {!isSubmitted && !isReturned && (
              <button onClick={() => setConfirmSubmit(true)} disabled={submitting}
                style={{ padding: '5px 16px', background: accent, color: '#fff', border: 'none', borderRadius: 7, fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                📤 Odevzdat
              </button>
            )}
            {isSubmitted && (
              <span style={{ padding: '5px 12px', background: 'rgba(59,130,246,.12)', color: '#3b82f6', border: '1px solid rgba(59,130,246,.25)', borderRadius: 7, fontSize: 12, fontWeight: 600 }}>
                ✓ Odevzdáno
              </span>
            )}
            {isReturned && (
              <span style={{ padding: '5px 12px', background: 'rgba(168,85,247,.12)', color: '#a855f7', border: '1px solid rgba(168,85,247,.25)', borderRadius: 7, fontSize: 12 }}>
                ↩ Vráceno
              </span>
            )}
            {canResubmit && (
              <button onClick={() => setConfirmUnsubmit(true)}
                style={{ padding: '5px 16px', background: accent, color: '#fff', border: 'none', borderRadius: 7, fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                📤 Znovu odevzdat
              </button>
            )}
            {submission?.grade && (
              <span style={{ padding: '5px 10px', background: 'rgba(34,197,94,.12)', color: '#22c55e', border: '1px solid rgba(34,197,94,.25)', borderRadius: 7, fontSize: 12, fontWeight: 700 }}>
                {submission.grade}
              </span>
            )}
            <button onClick={async () => {
              await saveFile(contentRef.current)
              flash('✓ Uloženo')
            }} style={{ padding: '5px 12px', background: 'rgba(255,255,255,.06)', color: D.txtSec, border: `1px solid ${D.border}`, borderRadius: 7, fontSize: 12, cursor: 'pointer' }}>
              💾 Uložit
            </button>
          </div>

          <span style={{ color: D.txtSec, fontSize: 14, marginLeft: 4 }}>{collapsed ? '▸' : '▾'}</span>
        </div>

        {/* Expanded: description + teacher comment */}
        {!collapsed && (
          <div style={{ padding: '0 16px 14px', display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 250, overflowY: 'auto' }}>
            {assignment.description && (
              <div style={{ padding: '12px 14px', background: D.bgMid, borderRadius: 9, fontSize: 13, color: '#e2e8f0', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
                {assignment.description}
              </div>
            )}
            {submission?.teacher_comment && (
              <div style={{ padding: '12px 14px', background: 'rgba(168,85,247,.07)', border: '1px solid rgba(168,85,247,.2)', borderRadius: 9 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#a855f7', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '.06em' }}>💬 Zpětná vazba od učitele</div>
                <div style={{ fontSize: 13, color: '#e2e8f0', lineHeight: 1.6 }}>{submission.teacher_comment}</div>
                {submission.grade && <div style={{ marginTop: 6, fontSize: 13, fontWeight: 700, color: '#22c55e' }}>Hodnocení: {submission.grade}</div>}
              </div>
            )}
            {isSubmitted && (
              <div style={{ fontSize: 12, color: D.txtSec, fontStyle: 'italic' }}>
                Editor je v režimu čtení — úkol byl odevzdán. {!assignment.allow_resubmit && 'Vrácení odevzdání není povoleno.'}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Editor area ── */}
      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', position: 'relative' }}>
        {readOnly && (
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: 'linear-gradient(90deg,#3b82f6,#7c3aed)', zIndex: 10 }} />
        )}
        {children({
          initialContent: fileContent,
          filePath,
          onContentChange: (c) => { contentRef.current = c },
          saveFile,
          readOnly,
        })}
      </div>
    </div>
  )
}
