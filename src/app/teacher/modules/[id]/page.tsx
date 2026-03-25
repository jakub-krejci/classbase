export const dynamic = 'force-dynamic'

/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerClient, createAdminClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import AppShell from '@/components/AppShell'
import ModuleDetail from './ModuleDetail'

export default async function ModuleDetailPage({ params }: { params: any }) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const admin = createAdminClient()

  const { data: pd } = await admin.from('profiles').select('*').eq('id', (user as any).id).single()
  const profile = pd as any
  if (profile?.role !== 'teacher') redirect('/student/modules')

  const moduleId = params.id
  const { data: mod } = await admin.from('modules').select('*').eq('id', moduleId).eq('teacher_id', (user as any).id).single()
  if (!mod) redirect('/teacher/modules')

  const { data: lessons } = await admin.from('lessons').select('*').eq('module_id', moduleId).order('position')
  const { data: assignments } = await admin.from('assignments').select('*').eq('module_id', moduleId).order('created_at')
  const { data: enrollments } = await admin.from('enrollments').select('student_id, profiles(full_name, email)').eq('module_id', moduleId)

  return (
    <AppShell user={profile} role="teacher">
      <ModuleDetail
        module={mod as any}
        lessons={(lessons ?? []) as any[]}
        assignments={(assignments ?? []) as any[]}
        enrollments={(enrollments ?? []) as any[]}
      />
    </AppShell>
  )
}
