import { createServerClient, createAdminClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function NewTestPage() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const admin = createAdminClient()
  const { data: pd } = await admin.from('profiles').select('role').eq('id', user.id).single()
  if ((pd as any)?.role !== 'teacher') redirect('/student/modules')
  // Create a blank draft and redirect to its editor
  const { data: t } = await admin.from('tests').insert({ teacher_id: user.id, title: 'Untitled Test' }).select('id').single()
  if (t) redirect(`/teacher/tests/${(t as any).id}`)
  redirect('/teacher/tests')
}
