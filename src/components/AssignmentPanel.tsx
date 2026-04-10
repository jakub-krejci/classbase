'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { D } from '@/components/DarkLayout'
import { getAssignmentForStudent, submitAssignment, unsubmitAssignment } from '@/app/student/tasks/actions'

interface Assignment {
  id: string
  title: string
  description: string
  editor_type: string
  deadline: string | null
  allow_resubmit: boolean
  teacher_name?: string
}

interface Submission {
  id: string
  status: string
  submitted_at: string | null
  teacher_comment: string | null
  grade: string | null
  allow_resubmit_override: boolean | null
}

interface Props {
  assignmentId: string
  studentId: string
  accent: string
  onSaveBeforeSubmit?: () => Promise<void>  // editor saves file before submit
}

export default function AssignmentPanel({ assignmentId, studentId, accent, onSaveBeforeSubmit }: Props) {
  const supabase = createClient()
  const [assignment, setAssignment] = useState<Assignment | null>(null)
  const [submission, setSubmission] = useState<Submission | null>(null)
  const [collapsed, setCollapsed] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [msg, setMsg] = useState('')
  const [confirmSubmit, setConfirmSubmit] = useState(false)
  const [confirmReturn, setConfirmReturn] = useState(false)

  useEffect(() => {
    loadData()
  }, [assignmentId])

  async function loadData() {
    const result = await getAssignmentForStudent(assignmentId)
    if (result.error || !result.assignment) return
    setAssignment({ ...result.assignment, teacher_name: result.assignment.teacher_name })
    if (result.submission) setSubmission(result.submission)
  }

  async function submit() {
    if (!submission) return
    setSubmitting(true)
    setConfirmSubmit(false)
    if (onSaveBeforeSubmit) {
      try { await onSaveBeforeSubmit() } catch {}
    }
    const res = await submitAssignment(assignmentId, submission.file_path ?? '')
    if (res.error) { flash('❌ Chyba při odevzdání'); setSubmitting(false); return }
    setSubmission((p: any) => ({ ...p, status: 'submitted', submitted_at: new Date().toISOString() }))
    flash('✓ Úkol byl úspěšně odevzdán!')
    setSubmitting(false)
  }

  async function unsubmit() {
    if (!submission) return
    const canResubmit = submission.allow_resubmit_override ?? assignment?.allow_resubmit
    if (!canResubmit) { flash('Učitel neumožnil vrácení odevzdání'); return }
    setSubmitting(true)
    setConfirmReturn(false)
    const res = await unsubmitAssignment(assignmentId)
    if (res.error) { flash(`Chyba: ${res.error}`); setSubmitting(false); return }
    setSubmission((p: any) => ({ ...p, status: 'in_progress' }))
    flash('✓ Odevzdání vráceno — můžeš upravit a znovu odevzdat')
    setSubmitting(false)
  }

  function flash(m: string) { setMsg(m); setTimeout(() => setMsg(''), 4000) }

  const status = submission?.status ?? 'not_started'
  const isSubmitted = ['submitted','graded'].includes(status)
  const isReturned  = status === 'returned'
  const canResubmit = isReturned && (submission?.allow_resubmit_override ?? assignment?.allow_resubmit)

  const deadlinePast = assignment?.deadline && new Date(assignment.deadline) < new Date()
  const deadlineStr  = assignment?.deadline
    ? new Date(assignment.deadline).toLocaleString('cs-CZ', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' })
    : null

  const statusColors: Record<string,string> = {
    not_started:'#6b7280', in_progress:'#f59e0b',
    submitted:'#3b82f6', returned:'#a855f7', graded:'#22c55e'
  }
  const statusLabels: Record<string,string> = {
    not_started:'Nezačato', in_progress:'Rozpracováno',
    submitted:'Odevzdáno', returned:'Vráceno', graded:'Ohodnoceno'
  }

  if (!assignment) return null

  return (
    <>
      {/* Confirm submit modal */}
      {confirmSubmit && (
        <>
          <div onClick={() => setConfirmSubmit(false)} style={{ position:'fixed',inset:0,background:'rgba(0,0,0,.7)',zIndex:9998,backdropFilter:'blur(4px)' }}/>
          <div style={{ position:'fixed',top:'50%',left:'50%',transform:'translate(-50%,-50%)',zIndex:9999,width:400,background:D.bgCard,border:`1px solid ${D.border}`,borderRadius:16,padding:28,boxShadow:'0 24px 60px rgba(0,0,0,.8)' }}>
            <div style={{ fontSize:16,fontWeight:800,color:'#fff',marginBottom:10 }}>📤 Odevzdat úkol?</div>
            <p style={{ color:'#a1a7b3',fontSize:13,lineHeight:1.6,marginBottom:20 }}>
              Odevzdáš aktuální verzi souboru učiteli. Ujisti se, že máš vše uloženo.
              {assignment.allow_resubmit && ' Po odevzdání lze odevzdání stáhnout a znovu odevzdat.'}
            </p>
            <div style={{ display:'flex',gap:10 }}>
              <button onClick={submit} disabled={submitting}
                style={{ flex:1,padding:'10px',background:accent,color:'#fff',border:'none',borderRadius:9,fontSize:14,fontWeight:700,cursor:'pointer' }}>
                {submitting ? 'Odevzdávám…' : '✓ Odevzdat'}
              </button>
              <button onClick={() => setConfirmSubmit(false)}
                style={{ padding:'10px 16px',background:D.bgMid,color:'#a1a7b3',border:`1px solid ${D.border}`,borderRadius:9,cursor:'pointer' }}>
                Zrušit
              </button>
            </div>
          </div>
        </>
      )}

      {confirmReturn && (
        <>
          <div onClick={() => setConfirmReturn(false)} style={{ position:'fixed',inset:0,background:'rgba(0,0,0,.7)',zIndex:9998,backdropFilter:'blur(4px)' }}/>
          <div style={{ position:'fixed',top:'50%',left:'50%',transform:'translate(-50%,-50%)',zIndex:9999,width:400,background:D.bgCard,border:`1px solid ${D.border}`,borderRadius:16,padding:28,boxShadow:'0 24px 60px rgba(0,0,0,.8)' }}>
            <div style={{ fontSize:16,fontWeight:800,color:'#fff',marginBottom:10 }}>↩ Vrátit odevzdání?</div>
            <p style={{ color:'#a1a7b3',fontSize:13,lineHeight:1.6,marginBottom:20 }}>
              Odevzdání bude vráceno do stavu "Rozpracováno". Budeš moci upravit soubor a znovu odevzdat.
            </p>
            <div style={{ display:'flex',gap:10 }}>
              <button onClick={unsubmit} disabled={submitting}
                style={{ flex:1,padding:'10px',background:'rgba(168,85,247,.2)',color:'#a855f7',border:'1px solid rgba(168,85,247,.4)',borderRadius:9,fontSize:14,fontWeight:700,cursor:'pointer' }}>
                {submitting ? '…' : '↩ Vrátit odevzdání'}
              </button>
              <button onClick={() => setConfirmReturn(false)}
                style={{ padding:'10px 16px',background:D.bgMid,color:'#a1a7b3',border:`1px solid ${D.border}`,borderRadius:9,cursor:'pointer' }}>
                Zrušit
              </button>
            </div>
          </div>
        </>
      )}

      {/* Panel */}
      <div style={{
        borderBottom: `1px solid ${D.border}`,
        background: D.bgCard,
        flexShrink: 0,
      }}>
        {/* Header bar */}
        <div style={{ display:'flex',alignItems:'center',gap:10,padding:'8px 14px', cursor:'pointer' }} onClick={() => setCollapsed(p=>!p)}>
          <span style={{ fontSize:14 }}>📋</span>
          <span style={{ fontSize:13,fontWeight:700,color:'#fff',flex:1 }}>{assignment.title}</span>
          <span style={{ fontSize:11,padding:'2px 8px',borderRadius:20,background:statusColors[status]+'20',color:statusColors[status],fontWeight:600 }}>
            {statusLabels[status]}
          </span>
          {deadlineStr && (
            <span style={{ fontSize:11,color:deadlinePast?'#ef4444':'#6b7280' }}>⏰ {deadlineStr}</span>
          )}
          {msg && <span style={{ fontSize:11,color:'#22c55e',maxWidth:200,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{msg}</span>}

          {/* Action buttons — always visible */}
          <div style={{ display:'flex',gap:6 }} onClick={e=>e.stopPropagation()}>
            {!isSubmitted && !isReturned && (
              <button onClick={() => setConfirmSubmit(true)} disabled={submitting}
                style={{ padding:'5px 14px',background:accent,color:'#fff',border:'none',borderRadius:7,fontSize:12,fontWeight:700,cursor:'pointer',whiteSpace:'nowrap' }}>
                📤 Odevzdat
              </button>
            )}
            {isSubmitted && (
              <span style={{ padding:'5px 12px',background:'rgba(59,130,246,.1)',color:'#3b82f6',border:'1px solid rgba(59,130,246,.2)',borderRadius:7,fontSize:12,fontWeight:600 }}>
                ✓ Odevzdáno
              </span>
            )}
            {isReturned && (
              <>
                <span style={{ padding:'5px 10px',background:'rgba(168,85,247,.1)',color:'#a855f7',border:'1px solid rgba(168,85,247,.2)',borderRadius:7,fontSize:12 }}>↩ Vráceno</span>
                {canResubmit && (
                  <button onClick={() => setConfirmReturn(true)}
                    style={{ padding:'5px 14px',background:accent,color:'#fff',border:'none',borderRadius:7,fontSize:12,fontWeight:700,cursor:'pointer' }}>
                    📤 Znovu odevzdat
                  </button>
                )}
              </>
            )}
            {status === 'graded' && submission?.grade && (
              <span style={{ padding:'5px 10px',background:'rgba(34,197,94,.1)',color:'#22c55e',border:'1px solid rgba(34,197,94,.25)',borderRadius:7,fontSize:12,fontWeight:700 }}>
                {submission.grade}
              </span>
            )}
          </div>

          <span style={{ color:'#6b7280',fontSize:16 }}>{collapsed ? '▸' : '▾'}</span>
        </div>

        {/* Expanded: description + teacher comment */}
        {!collapsed && (
          <div style={{ padding:'0 14px 14px',display:'flex',flexDirection:'column',gap:10 }}>
            {assignment.description && (
              <div style={{ padding:'12px 14px',background:D.bgMid,borderRadius:9,fontSize:13,color:'#e2e8f0',lineHeight:1.7,whiteSpace:'pre-wrap',maxHeight:200,overflowY:'auto' }}>
                {assignment.description}
              </div>
            )}
            {submission?.teacher_comment && (
              <div style={{ padding:'12px 14px',background:'rgba(168,85,247,.07)',border:'1px solid rgba(168,85,247,.2)',borderRadius:9 }}>
                <div style={{ fontSize:11,fontWeight:700,color:'#a855f7',marginBottom:5,textTransform:'uppercase',letterSpacing:'.06em' }}>💬 Zpětná vazba od učitele</div>
                <div style={{ fontSize:13,color:'#e2e8f0',lineHeight:1.6 }}>{submission.teacher_comment}</div>
                {submission.grade && <div style={{ marginTop:6,fontSize:13,fontWeight:700,color:'#22c55e' }}>Hodnocení: {submission.grade}</div>}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  )
}
