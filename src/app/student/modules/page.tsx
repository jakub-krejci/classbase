/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import AppShell from '@/components/AppShell'
import StudentHome from './StudentHome'

export default async function StudentModulesPage() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: pd } = await supabase.from('profiles').select('*').eq('id', (user as any).id).single()
  const profile = pd as any
  if (profile?.role !== 'student') redirect('/teacher/modules')

  const { data: enr } = await supabase
    .from('enrollments')
    .select('module_id, modules(id,title,description,tag,unlock_mode)')
    .eq('student_id', (user as any).id)
  const enrollments = (enr ?? []) as any[]

  const progressMap: Record<string, { done: number; total: number }> = {}
  await Promise.all(enrollments.map(async (e: any) => {
    const mid = e.module_id
    const { data: lessonIds } = await supabase.from('lessons').select('id').eq('module_id', mid)
    const ids = (lessonIds ?? []).map((l: any) => l.id)
    const [{ count: total }, { count: done }] = await Promise.all([
      supabase.from('lessons').select('*', { count: 'exact', head: true }).eq('module_id', mid),
      ids.length
        ? supabase.from('lesson_progress').select('*', { count: 'exact', head: true }).eq('student_id', (user as any).id).in('lesson_id', ids)
        : Promise.resolve({ count: 0 }),
    ])
    progressMap[mid] = { done: (done as number) ?? 0, total: (total as number) ?? 0 }
  }))

  const { data: msgs } = await supabase
    .from('messages').select('id,body,created_at,recipient_type')
    .eq('recipient_type', 'all').order('created_at', { ascending: false }).limit(3)

  return (
    <AppShell user={profile} role="student">
      <StudentHome
        profile={profile}
        enrollments={enrollments}
        progressMap={progressMap}
        messages={(msgs ?? []) as any[]}
        studentId={(user as any).id}
      />
    </AppShell>
  )
}
