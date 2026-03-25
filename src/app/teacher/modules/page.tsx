/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function TeacherModulesPage() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profileData } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', (user as any).id)
    .single()

  const profile = profileData as any
  if (profile?.role !== 'teacher') redirect('/student/modules')

  const { data: modulesData } = await supabase
    .from('modules')
    .select('*, lessons(count), enrollments(count)')
    .eq('teacher_id', (user as any).id)
    .order('created_at', { ascending: false })

  const modules = (modulesData ?? []) as any[]
  const name: string = profile?.full_name ?? ''

  return (
    <main style={{ maxWidth: 800, margin: '0 auto', padding: '24px 16px', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 600 }}>My modules</h1>
          <p style={{ fontSize: 13, color: '#888', marginTop: 3 }}>Welcome back, {name}</p>
        </div>
        <a
          href="/teacher/modules/new"
          style={{ padding: '8px 16px', background: '#185FA5', color: '#fff', borderRadius: 8, fontSize: 13, fontWeight: 500, textDecoration: 'none' }}
        >
          + New module
        </a>
      </div>

      {modules.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 0', color: '#888', fontSize: 14, border: '1px dashed #e5e7eb', borderRadius: 12 }}>
          No modules yet. Create your first one to get started.
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {modules.map((m: any) => (
            <a
              key={m.id}
              href={`/teacher/modules/${m.id}`}
              style={{ display: 'block', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '14px 16px', textDecoration: 'none', color: 'inherit' }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontWeight: 500, fontSize: 14 }}>{m.title}</div>
                  <div style={{ fontSize: 11, color: '#888', marginTop: 3 }}>
                    {m.lessons?.[0]?.count ?? 0} lessons &middot;{' '}
                    {m.enrollments?.[0]?.count ?? 0} enrolled &middot;{' '}
                    Code: <code style={{ fontFamily: 'monospace', background: '#f3f4f6', padding: '1px 5px', borderRadius: 4 }}>{m.access_code}</code>
                  </div>
                </div>
                <span style={{ fontSize: 10, padding: '2px 8px', background: '#E6F1FB', color: '#0C447C', borderRadius: 20, fontWeight: 500, flexShrink: 0 }}>
                  {m.tag}
                </span>
              </div>
            </a>
          ))}
        </div>
      )}
    </main>
  )
}
