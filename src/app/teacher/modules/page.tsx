export const dynamic = 'force-dynamic'
/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerClient, createAdminClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import AppShell from '@/components/AppShell'
import { Tag, Btn, PageHeader, StatGrid, EmptyState } from '@/components/ui'

export default async function TeacherModulesPage() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const admin = createAdminClient()
  const { data: pd } = await admin.from('profiles').select('*').eq('id', (user as any).id).single()
  const profile = pd as any
  if (profile?.role !== 'teacher') redirect('/student/modules')

  const { data: mods } = await admin
    .from('modules').select('id,title,description,tag,access_code,unlock_mode,created_at')
    .eq('teacher_id', (user as any).id).order('created_at', { ascending: false })
  const modules = (mods ?? []) as any[]

  const counts: Record<string, { lessons: number; enrollments: number }> = {}
  await Promise.all(modules.map(async (m: any) => {
    const [l, e] = await Promise.all([
      admin.from('lessons').select('*', { count: 'exact', head: true }).eq('module_id', m.id),
      admin.from('enrollments').select('*', { count: 'exact', head: true }).eq('module_id', m.id),
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
            <div key={m.id} style={{ position: 'relative', background: '#fff', border: '0.5px solid #e5e7eb', borderRadius: 12, textDecoration: 'none', color: 'inherit', transition: 'border-color .15s, box-shadow .15s' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = '#b5cce0'; (e.currentTarget as HTMLElement).style.boxShadow = '0 2px 8px rgba(0,0,0,.06)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = '#e5e7eb'; (e.currentTarget as HTMLElement).style.boxShadow = 'none' }}>
              {/* Clickable main area */}
              <a href={"/teacher/modules/" + m.id}
                style={{ display: 'block', padding: '14px 16px 12px', textDecoration: 'none', color: 'inherit' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 8 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 3, color: '#111' }}>{m.title}</div>
                    <div style={{ fontSize: 11, color: '#888' }}>
                      {counts[m.id]?.lessons ?? 0} lessons · {counts[m.id]?.enrollments ?? 0} enrolled · Code: <code style={{ fontFamily: 'monospace', background: '#f3f4f6', padding: '1px 5px', borderRadius: 4 }}>{m.access_code}</code>
                    </div>
                  </div>
                  <Tag tag={m.tag} />
                </div>
              </a>
              {/* Quick action bar */}
              <div style={{ display: 'flex', gap: 6, padding: '0 16px 10px', borderTop: '0.5px solid #f3f4f6' }}>
                <a href={"/teacher/modules/" + m.id + "/lessons/new"}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px', fontSize: 11, fontWeight: 500, background: '#185FA5', color: '#E6F1FB', borderRadius: 6, textDecoration: 'none', border: 'none', cursor: 'pointer' }}>
                  + New lesson
                </a>
                <a href={"/teacher/modules/" + m.id + "/edit"}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px', fontSize: 11, fontWeight: 500, background: '#f3f4f6', color: '#555', borderRadius: 6, textDecoration: 'none' }}>
                  ✏ Edit module
                </a>
                <a href={"/teacher/modules/" + m.id}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px', fontSize: 11, fontWeight: 500, background: '#f3f4f6', color: '#555', borderRadius: 6, textDecoration: 'none' }}>
                  ⚙ Manage
                </a>
              </div>
            </div>
          ))}
        </div>
      )}
    </AppShell>
  )
}
