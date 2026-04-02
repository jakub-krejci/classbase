export const dynamic = 'force-dynamic'
/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerClient, createAdminClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import BookmarksClient from './BookmarksClient'

export default async function BookmarksPage() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const admin = createAdminClient()
  const { data: pd } = await admin.from('profiles').select('*').eq('id', (user as any).id).single()
  const profile = pd as any
  if (profile?.role !== 'student') redirect('/teacher/dashboard')

  const { data: bookmarks, error } = await admin
    .from('lesson_progress')
    .select('lesson_id, completed_at, lessons(id, title, module_id, position, modules(id, title, tag))')
    .eq('student_id', (user as any).id)
    .eq('status', 'bookmark')
    .order('completed_at', { ascending: false })

  if (error) console.error('Bookmarks query error:', error)

  return <BookmarksClient profile={profile} bookmarks={(bookmarks ?? []) as any[]} />
}
