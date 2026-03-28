export const dynamic = 'force-dynamic'
/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerClient, createAdminClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import AppShell from '@/components/AppShell'
import PublicProfileClient from './PublicProfileClient'

export default async function PublicStudentProfilePage({ params }: { params: any }) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const admin = createAdminClient()

  // Get viewer profile
  const { data: viewer } = await admin.from('profiles').select('*').eq('id', user.id).single()
  if ((viewer as any)?.role !== 'student') redirect('/teacher/modules')

  // Get target profile — must be a student with visibility enabled
  const { data: target } = await admin
    .from('profiles')
    .select('id, full_name, avatar_url, banner_url, bio, custom_status, student_class, grade_level, pronouns, accent_color, role, created_at, profile_visibility, show_bio, show_status')
    .eq('id', params.id)
    .eq('role', 'student')
    .eq('profile_visibility', true)
    .single()

  if (!target) notFound()

  // Verify viewer shares at least one module with target
  const { data: viewerMods } = await admin.from('enrollments').select('module_id').eq('student_id', user.id)
  const { data: targetMods } = await admin.from('enrollments').select('module_id').eq('student_id', params.id)
  const viewerSet = new Set((viewerMods ?? []).map((e: any) => e.module_id))
  const sharedModules = (targetMods ?? []).filter((e: any) => viewerSet.has(e.module_id))
  if (sharedModules.length === 0) notFound()

  // Get shared module details
  const sharedModuleIds = sharedModules.map((e: any) => e.module_id)
  const { data: modules } = await admin
    .from('modules').select('id, title').in('id', sharedModuleIds)

  return (
    <AppShell user={viewer} role="student">
      <PublicProfileClient
        profile={target as any}
        sharedModules={(modules ?? []) as any[]}
        isOwnProfile={user.id === params.id}
      />
    </AppShell>
  )
}
