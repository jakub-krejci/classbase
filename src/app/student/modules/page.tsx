export const dynamic = 'force-dynamic'
/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerClient, createAdminClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import DarkModulesClient from './DarkModulesClient'

export default async function StudentModulesPage() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const admin = createAdminClient()
  const { data: pd } = await admin.from('profiles').select('*').eq('id', (user as any).id).single()
  const profile = pd as any
  if (profile?.role !== 'student') redirect('/teacher/modules')

  const { data: enr } = await supabase
    .from('enrollments')
    .select('module_id, enrolled_at, modules(id,title,description,tag,unlock_mode,lessons(id),assignments(id))')
    .eq('student_id', (user as any).id)
  const enrollments = (enr ?? []) as any[]

  const progressMap: Record<string, { done: number; total: number }> = {}
  await Promise.all(enrollments.map(async (e: any) => {
    const ids = ((e.modules?.lessons) ?? []).map((l: any) => l.id)
    const total = ids.length
    const done = ids.length
      ? ((await supabase.from('lesson_progress').select('*', { count: 'exact', head: true }).eq('student_id', (user as any).id).in('lesson_id', ids)).count ?? 0)
      : 0
    progressMap[e.module_id] = { done: done as number, total }
  }))

  const { data: msgs } = await supabase
    .from('messages').select('id,body,created_at,recipient_type,sender_id')
    .eq('recipient_type', 'all').order('created_at', { ascending: false }).limit(3)

  return <DarkModulesClient profile={profile} enrollments={enrollments} progressMap={progressMap} messages={(msgs ?? []) as any[]} />
}
