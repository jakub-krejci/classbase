export const dynamic = 'force-dynamic'
/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerClient, createAdminClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import PythonEditor from './PythonEditor'
import AssignmentPythonEditor from './AssignmentPythonEditor'

export default async function PythonEditorPage({ searchParams }: { searchParams: Promise<any> }) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const admin = createAdminClient()
  const { data: pd } = await admin.from('profiles').select('*').eq('id', (user as any).id).single()
  if ((pd as any)?.role !== 'student') redirect('/teacher/dashboard')
  const sp = await searchParams
  const assignmentId = sp?.assignment ?? null
  if (assignmentId) {
    return <AssignmentPythonEditor profile={pd as any} assignmentId={assignmentId} />
  }
  return <PythonEditor profile={pd as any} assignmentId={null} />
}
