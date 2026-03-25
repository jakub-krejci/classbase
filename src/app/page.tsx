/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerClient, createAdminClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function RootPage() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profileData } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', (user as any).id)
    .single()

  const profile = profileData as any
  if (profile?.role === 'teacher') {
    redirect('/teacher/modules')
  } else {
    redirect('/student/modules')
  }
}
