import { createAdminClient, createServerClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { NextRequest } from 'next/server'

export async function POST(req: NextRequest) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const url = new URL(req.url)
  const id = url.searchParams.get('id')
  const archive = url.searchParams.get('archive') !== 'false'
  if (!id) return new Response('Missing id', { status: 400 })

  const admin = createAdminClient()
  // Verify ownership
  const { data: mod } = await admin.from('modules').select('teacher_id').eq('id', id).single()
  if (!mod || (mod as any).teacher_id !== user.id) return new Response('Forbidden', { status: 403 })

  await admin.from('modules').update({ archived: archive } as any).eq('id', id)
  return Response.redirect(new URL('/teacher/modules', req.url), 303)
}
