export const dynamic = 'force-dynamic'
/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerClient, createAdminClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import BuilderEditor from './BuilderEditor'

export default async function VexPage() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const admin = createAdminClient()
  const { data: pd } = await admin.from('profiles').select('*').eq('id', (user as any).id).single()
  if ((pd as any)?.role !== 'student') redirect('/teacher/dashboard')
  const sp = await searchParams
  return <BuilderEditor profile={pd as any} assignmentId={sp?.assignment ?? null} />
}
