export const dynamic = 'force-dynamic'
import { createServerClient, createAdminClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { DarkLayout } from '@/components/DarkLayout'
import MLSim from './MLSim'

export default async function MLSimPage() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const admin = createAdminClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: pd } = await admin.from('profiles').select('*').eq('id', (user as any).id).single()
  return (
    <DarkLayout profile={pd} activeRoute="/student/simulations" fullContent>
      <MLSim accentColor={(pd as any)?.accent_color ?? '#7C3AED'} />
    </DarkLayout>
  )
}
