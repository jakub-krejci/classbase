/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import AppShell from '@/components/AppShell'
import { Tag, Btn, PageHeader, StatGrid, EmptyState } from '@/components/ui'

export default async function TeacherModulesPage() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: pd } = await supabase.from('profiles').select('*').eq('id', (user as any).id).single()
  const profile = pd as any
  if (profile?.role !== 'teacher') redirect('/student/modules')

  const { data: mods } = await supabase
    .from('modules').select('id,title,description,tag,access_code,unlock_mode,created_at')
    .eq('teacher_id', (user as any).id).order('created_at', { ascending: false })
  const modules = (mods ?? []) as any[]

  const counts: Record<string, { lessons: number; enrollments: number }> = {}
  await Promise.all(modules.map(async (m: any) => {
    const [l, e] = await Promise.all([
      supabase.from('lessons').select('*', { count: 'exact', head: true }).eq('module_id', m.id),
      supabase.from('enrollments').select('*', { count: 'exact', head: true }).eq('module_id', m.id),
    ])
    counts[m.id] = { lessons: l.count ?? 0, enrollments: e.count ?? 0 }
  }))

  const totalLessons = Object.values(counts).reduce((a, c) => a + c.lessons, 0)
  const totalEnr = Object.values(counts).reduce((a, c) => a + c.enrollments, 0)

  return (
    <AppShell user={profile} role="teacher">
      <PageHeader title="My modules" sub={`Welcome back, ${profile?.full_name ?? ''}`}
        action={<Btn href="/teacher/modules/new" variant="primary">+ New module</Btn>} />
      <StatGrid stats={[
        { label: 'Modules', value: modules.length },
        { label: 'Total lessons', value: totalLessons },
        { label: 'Enrollments', value: totalEnr },
      ]} />
      {modules.length === 0 ? <EmptyState message="No modules yet. Create your first one." /> : (
        <div style={{ display: 'grid', gap: 10 }}>
          {modules.map((m: any) => (
            <a key={m.id} href={"/teacher/modules/" + m.id}
              style={{ display: 'block', background: '#fff', border: '0.5px solid #e5e7eb', borderRadius: 12, padding: '14px 16px', textDecoration: 'none', color: 'inherit' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 500, fontSize: 14, marginBottom: 3 }}>{m.title}</div>
                  <div style={{ fontSize: 11, color: '#888' }}>
                    {counts[m.id]?.lessons ?? 0} lessons · {counts[m.id]?.enrollments ?? 0} enrolled · Code: <code style={{ fontFamily: 'monospace', background: '#f3f4f6', padding: '1px 5px', borderRadius: 4 }}>{m.access_code}</code>
                  </div>
                </div>
                <Tag tag={m.tag} />
              </div>
            </a>
          ))}
        </div>
      )}
    </AppShell>
  )
}
