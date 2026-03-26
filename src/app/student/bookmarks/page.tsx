/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerClient, createAdminClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import AppShell from '@/components/AppShell'
import { BackLink } from '@/components/ui'

export const dynamic = 'force-dynamic'

export default async function BookmarksPage() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const admin = createAdminClient()
  const { data: pd } = await admin.from('profiles').select('*').eq('id', (user as any).id).single()
  const profile = pd as any
  if (profile?.role !== 'student') redirect('/teacher/modules')

  // Fetch all bookmarked lessons
  const { data: bookmarks } = await admin
    .from('lesson_progress')
    .select('lesson_id, lessons(id, title, module_id, position, modules(id, title, tag))')
    .eq('student_id', (user as any).id)
    .eq('status', 'bookmark')
    .order('completed_at', { ascending: false })

  const items = (bookmarks ?? []) as any[]

  return (
    <AppShell user={profile} role="student">
      <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 4 }}>Bookmarks</h1>
      <p style={{ fontSize: 13, color: '#888', marginBottom: 20 }}>Lessons you've marked to come back to</p>

      {items.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 20px', color: '#aaa', fontSize: 14, border: '1px dashed #e5e7eb', borderRadius: 12 }}>
          No bookmarks yet. When reading a lesson, click "🔖 Come back later" to save it here.
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {items.map((item: any) => {
            const lesson = item.lessons as any
            const mod = lesson?.modules as any
            if (!lesson || !mod) return null
            return (
              <a key={item.lesson_id}
                href={`/student/modules/${mod.id}/lessons/${lesson.id}`}
                style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, textDecoration: 'none', color: 'inherit' }}>
                <div style={{ fontSize: 20, flexShrink: 0 }}>🔖</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 500, fontSize: 14 }}>{lesson.title}</div>
                  <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>{mod.title}</div>
                </div>
                <div style={{ fontSize: 11, padding: '3px 10px', background: '#FFF3CD', color: '#856404', borderRadius: 20, fontWeight: 500, flexShrink: 0, border: '1px solid #FFE69C' }}>
                  Not completed
                </div>
              </a>
            )
          })}
        </div>
      )}
    </AppShell>
  )
}
