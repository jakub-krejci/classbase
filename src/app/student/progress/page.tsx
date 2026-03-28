export const dynamic = 'force-dynamic'

/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerClient, createAdminClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import AppShell from '@/components/AppShell'
import { Tag, PageHeader, StatGrid } from '@/components/ui'

export default async function StudentProgressPage() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const admin = createAdminClient()
  const { data: pd } = await admin.from('profiles').select('*').eq('id', (user as any).id).single()
  const profile = pd as any
  if (profile?.role !== 'student') redirect('/teacher/modules')

  const { data: enr } = await admin.from('enrollments').select('module_id, modules(id,title,tag)').eq('student_id', (user as any).id)
  const enrollments = (enr ?? []) as any[]

  let totalLessons = 0, doneLessons = 0, totalAssignments = 0, doneAssignments = 0
  const moduleStats: { mod: any; total: number; done: number; pct: number }[] = []

  for (const e of enrollments) {
    const m = e.modules as any
    const { data: ls } = await admin.from('lessons').select('id').eq('module_id', e.module_id)
    const ids = (ls ?? []).map((l: any) => l.id)
    const { count: doneC } = ids.length
      ? await admin.from('lesson_progress').select('*', { count: 'exact', head: true }).eq('student_id', (user as any).id).in('lesson_id', ids)
      : { count: 0 }
    const total = ids.length, done = (doneC as number) ?? 0
    totalLessons += total; doneLessons += done
    moduleStats.push({ mod: m, total, done, pct: total > 0 ? Math.round(done / total * 100) : 0 })

    const { data: assignments } = await admin.from('assignments').select('id').eq('module_id', e.module_id)
    const aIds = (assignments ?? []).map((a: any) => a.id)
    totalAssignments += aIds.length
    if (aIds.length) {
      const { count: subC } = await admin.from('submissions').select('*', { count: 'exact', head: true }).eq('student_id', (user as any).id).in('assignment_id', aIds)
      doneAssignments += (subC as number) ?? 0
    }
  }

  const overall = totalLessons > 0 ? Math.round(doneLessons / totalLessons * 100) : 0

  return (
    <AppShell user={profile} role="student">
      <PageHeader title="My progress" sub="Track your learning across all modules" />
      <StatGrid stats={[
        { label: 'Overall progress', value: overall + '%' },
        { label: 'Lessons complete', value: `${doneLessons} / ${totalLessons}` },
        { label: 'Assignments done', value: `${doneAssignments} / ${totalAssignments}` },
      ]} />
      <div style={{ fontSize: 11, fontWeight: 600, color: '#888', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 12 }}>By module</div>
      {moduleStats.length === 0 && <p style={{ fontSize: 13, color: '#aaa' }}>No modules enrolled yet.</p>}
      {moduleStats.map(({ mod, total, done, pct }) => (
        <a key={mod?.id} href={'/student/modules/' + mod?.id}
          style={{ display: 'block', background: '#fff', border: '0.5px solid #e5e7eb', borderRadius: 12, padding: '14px 16px', marginBottom: 10, textDecoration: 'none', color: 'inherit' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <div style={{ fontWeight: 500, fontSize: 14 }}>{mod?.title}</div>
            <Tag tag={mod?.tag} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ flex: 1, height: 6, background: '#f3f4f6', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: pct + '%', background: 'var(--accent)', borderRadius: 3 }} />
            </div>
            <span style={{ fontSize: 12, fontWeight: 500, color: '#555', minWidth: 36 }}>{pct}%</span>
          </div>
          <div style={{ fontSize: 11, color: '#aaa', marginTop: 4 }}>{done} of {total} lessons complete</div>
        </a>
      ))}
    </AppShell>
  )
}
