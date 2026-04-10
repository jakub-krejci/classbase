'use server'
/* eslint-disable @typescript-eslint/no-explicit-any */
import { createAdminClient, createServerClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

async function getTeacher() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const admin = createAdminClient()
  const { data: pd } = await admin.from('profiles').select('role').eq('id', user.id).single()
  if ((pd as any)?.role !== 'teacher') throw new Error('Not a teacher')
  return { user, admin }
}

export async function getSubmissionsForAssignment(assignmentId: string) {
  const { admin } = await getTeacher()
  const { data } = await admin
    .from('task_submissions')
    .select('*, profiles:student_id(full_name, email)')
    .eq('assignment_id', assignmentId)
    .order('submitted_at', { ascending: false })
  return data ?? []
}

export async function getAssignments() {
  const { user, admin } = await getTeacher()
  const { data } = await admin
    .from('task_assignments')
    .select(`id,title,description,editor_type,deadline,allow_resubmit,status,published_at,created_at,
             task_targets(id,student_id,group_id),
             task_submissions(id,status,student_id)`)
    .eq('teacher_id', user.id)
    .order('created_at', { ascending: false })
  return data ?? []
}

export async function saveAssignment(payload: {
  editId: string | null
  title: string
  description: string
  editor_type: string
  deadline: string | null
  allow_resubmit: boolean
  publishNow: boolean
  studentIds: string[]
  groupIds: string[]
  starter_code?: string
  starter_filename?: string
}) {
  const { user, admin } = await getTeacher()

  const asgPayload: any = {
    teacher_id:       user.id,
    title:            payload.title,
    description:      payload.description,
    editor_type:      payload.editor_type,
    deadline:         payload.deadline,
    allow_resubmit:   payload.allow_resubmit,
    status:           payload.publishNow ? 'published' : 'draft',
    starter_code:     payload.starter_code ?? '',
    starter_filename: payload.starter_filename ?? '',
  }
  if (payload.publishNow) asgPayload.published_at = new Date().toISOString()

  let asgId = payload.editId

  if (payload.editId) {
    const { error } = await admin.from('task_assignments').update(asgPayload).eq('id', payload.editId).eq('teacher_id', user.id)
    if (error) return { error: error.message }
    await admin.from('task_targets').delete().eq('assignment_id', payload.editId)
  } else {
    const { data, error } = await admin.from('task_assignments').insert(asgPayload).select('id').single()
    if (error || !data) return { error: error?.message ?? 'Insert failed' }
    asgId = data.id
  }

  // Insert targets
  const targets: any[] = []
  payload.studentIds.forEach(sid => targets.push({ assignment_id: asgId, student_id: sid }))
  payload.groupIds.forEach(gid => targets.push({ assignment_id: asgId, group_id: gid }))
  if (targets.length > 0) {
    const { error } = await admin.from('task_targets').insert(targets)
    if (error) return { error: error.message }
  }

  return { ok: true, id: asgId }
}

export async function changeAssignmentStatus(id: string, status: string) {
  const { user, admin } = await getTeacher()
  const patch: any = { status }
  if (status === 'published') patch.published_at = new Date().toISOString()
  const { error } = await admin.from('task_assignments').update(patch).eq('id', id).eq('teacher_id', user.id)
  if (error) return { error: error.message }
  return { ok: true }
}

export async function deleteAssignmentAction(id: string) {
  const { user, admin } = await getTeacher()
  const { error } = await admin.from('task_assignments').delete().eq('id', id).eq('teacher_id', user.id)
  if (error) return { error: error.message }
  return { ok: true }
}

export async function gradeSubmission(submissionId: string, data: {
  status: 'returned' | 'graded'
  teacher_comment: string
  grade: string
}) {
  const { admin } = await getTeacher()
  const patch: any = {
    status: data.status,
    teacher_comment: data.teacher_comment || null,
    grade: data.grade || null,
  }
  if (data.status === 'returned') patch.returned_at = new Date().toISOString()
  if (data.status === 'graded') patch.graded_at = new Date().toISOString()
  const { error } = await admin.from('task_submissions').update(patch).eq('id', submissionId)
  if (error) return { error: error.message }
  return { ok: true }
}

export async function toggleResubmitAction(submissionId: string, allow: boolean) {
  const { admin } = await getTeacher()
  const { error } = await admin.from('task_submissions').update({ allow_resubmit_override: allow }).eq('id', submissionId)
  if (error) return { error: error.message }
  return { ok: true }
}
