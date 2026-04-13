export const dynamic = 'force-dynamic'
import { createServerClient, createAdminClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { DarkLayout } from '@/components/DarkLayout'
import LayoutSim from './LayoutSim'

export default async function LayoutSimPage() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const admin = createAdminClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: pd } = await admin.from('profiles').select('*').eq('id', (user as any).id).single()
  return (
    <DarkLayout profile={pd} activeRoute="/student/simulations" fullContent>
      <LayoutSim accentColor={(pd as any)?.accent_color ?? '#06b6d4'} />
    </DarkLayout>
  )
}
