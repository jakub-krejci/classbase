'use server'
/* eslint-disable @typescript-eslint/no-explicit-any */
import { createAdminClient, createServerClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

async function getStudent() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const admin = createAdminClient()
  return { user, admin }
}

// Load assignment details + student's submission (bypasses RLS)
export async function getAssignmentForStudent(assignmentId: string) {
  const { user, admin } = await getStudent()

  const { data: asg, error } = await admin
    .from('task_assignments')
    .select('*, profiles:teacher_id(full_name)')
    .eq('id', assignmentId)
    .single()

  if (error || !asg) return { error: 'Úkol nenalezen' }

  // Verify student is actually a target (security check)
  const { data: target } = await admin
    .from('task_targets')
    .select('id')
    .eq('assignment_id', assignmentId)
    .or(`student_id.eq.${user.id},group_id.in.(select group_id from group_members where student_id = '${user.id}')`)
    .maybeSingle()

  // Also check via group_members directly
  const { data: directTarget } = await admin
    .from('task_targets')
    .select('id, group_id')
    .eq('assignment_id', assignmentId)
    .eq('student_id', user.id)
    .maybeSingle()

  const { data: groupTarget } = await admin.rpc('check_student_assignment_access', {
    p_assignment_id: assignmentId,
    p_student_id: user.id,
  })

  // Simple access check: is the student in task_targets directly or via group?
  const { data: accessCheck } = await admin
    .from('task_targets')
    .select('id, student_id, group_id, group_members!left(student_id)')
    .eq('assignment_id', assignmentId)

  const hasAccess = (accessCheck ?? []).some((t: any) => {
    if (t.student_id === user.id) return true
    if (t.group_members?.some((gm: any) => gm.student_id === user.id)) return true
    return false
  })

  if (!hasAccess && asg.status !== 'published') {
    return { error: 'Nemáš přístup k tomuto úkolu' }
  }

  // Load or create submission
  const { data: existingSub } = await admin
    .from('task_submissions')
    .select('*')
    .eq('assignment_id', assignmentId)
    .eq('student_id', user.id)
    .maybeSingle()

  let submission = existingSub
  if (!submission) {
    const { data: newSub } = await admin
      .from('task_submissions')
      .insert({ assignment_id: assignmentId, student_id: user.id, status: 'in_progress' })
      .select()
      .single()
    submission = newSub
  }

  return {
    assignment: {
      ...asg,
      teacher_name: (asg.profiles as any)?.full_name ?? 'Učitel',
    },
    submission,
    studentId: user.id,
  }
}

// Submit assignment
export async function submitAssignment(assignmentId: string, filePath: string) {
  const { user, admin } = await getStudent()

  const { data: sub } = await admin
    .from('task_submissions')
    .select('id')
    .eq('assignment_id', assignmentId)
    .eq('student_id', user.id)
    .maybeSingle()

  if (!sub) return { error: 'Odevzdání nenalezeno' }

  const { error } = await admin
    .from('task_submissions')
    .update({ status: 'submitted', submitted_at: new Date().toISOString(), file_path: filePath })
    .eq('id', sub.id)

  if (error) return { error: error.message }
  return { ok: true }
}

// Unsubmit (return to in_progress)
export async function unsubmitAssignment(assignmentId: string) {
  const { user, admin } = await getStudent()

  const { data: sub } = await admin
    .from('task_submissions')
    .select('id, allow_resubmit_override')
    .eq('assignment_id', assignmentId)
    .eq('student_id', user.id)
    .maybeSingle()

  if (!sub) return { error: 'Odevzdání nenalezeno' }

  const { data: asg } = await admin
    .from('task_assignments')
    .select('allow_resubmit')
    .eq('id', assignmentId)
    .single()

  const canResubmit = sub.allow_resubmit_override ?? asg?.allow_resubmit ?? false
  if (!canResubmit) return { error: 'Vrácení odevzdání není povoleno' }

  await admin.from('task_submissions').update({ status: 'in_progress' }).eq('id', sub.id)
  return { ok: true }
}

// Get file content from storage (for assignment work file)
export async function getAssignmentFileContent(bucket: string, filePath: string): Promise<{ content: string | null; error?: string }> {
  const { admin } = await getStudent()
  const { data, error } = await admin.storage.from(bucket).download(filePath)
  if (error || !data) return { content: null }
  const content = await data.text()
  return { content }
}

// Save file content to storage
export async function saveAssignmentFile(bucket: string, filePath: string, content: string): Promise<{ ok?: boolean; error?: string }> {
  const { admin } = await getStudent()
  const blob = new Blob([content], { type: 'text/plain' })
  await admin.storage.from(bucket).remove([filePath])
  const { error } = await admin.storage.from(bucket).upload(filePath, blob, { cacheControl: '0' })
  if (error) return { error: error.message }
  return { ok: true }
}
