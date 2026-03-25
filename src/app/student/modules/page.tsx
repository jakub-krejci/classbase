import { createServerClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function StudentModulesPage() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if ((profile as any)?.role !== 'student') redirect('/teacher/modules')

  const { data: enrollments } = await supabase
    .from('enrollments')
    .select('module_id, modules(*)')
    .eq('student_id', user.id)

  return (
    <main style={{ maxWidth: 800, margin: '0 auto', padding: '24px 16px', fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 4 }}>My learning</h1>
      <p style={{ fontSize: 13, color: '#888', marginBottom: 24 }}>Hello, {profile?.full_name ?? ''}</p>

      {!enrollments?.length ? (
        <div style={{ textAlign: 'center', padding: '48px 0', color: '#888', fontSize: 14, border: '1px dashed #e5e7eb', borderRadius: 12 }}>
          You are not enrolled in any modules yet.<br />Ask your teacher for an access code.
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {enrollments.map(e => {
            const m = e.modules as any
            return (
              <a
                key={e.module_id}
                href={`/student/modules/${e.module_id}`}
                style={{ display: 'block', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '14px 16px', textDecoration: 'none', color: 'inherit' }}
              >
                <div style={{ fontWeight: 500, fontSize: 14 }}>{m?.title}</div>
                <div style={{ fontSize: 12, color: '#888', marginTop: 3 }}>{m?.description}</div>
              </a>
            )
          })}
        </div>
      )}
    </main>
  )
}
