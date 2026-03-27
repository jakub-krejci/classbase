import { createAdminClient, createServerClient } from '@/lib/supabase/server'
import { NextRequest } from 'next/server'

export async function POST(req: NextRequest) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const url = new URL(req.url)
  const id = url.searchParams.get('id')
  if (!id) return new Response('Missing id', { status: 400 })

  const admin = createAdminClient()
  // Verify ownership
  const { data: src } = await admin.from('modules').select('*').eq('id', id).eq('teacher_id', user.id).single()
  if (!src) return new Response('Forbidden', { status: 403 })

  // Generate unique access code
  const newCode = (src as any).access_code + '-copy-' + Math.random().toString(36).slice(2, 6).toUpperCase()

  // Create new module
  const { data: newMod, error } = await admin.from('modules').insert({
    teacher_id: user.id,
    title: (src as any).title + ' (copy)',
    description: (src as any).description,
    tag: (src as any).tag,
    access_code: newCode,
    unlock_mode: (src as any).unlock_mode,
    archived: false,
  } as any).select('id').single()

  if (error || !newMod) return new Response('Failed: ' + error?.message, { status: 500 })
  const newModId = (newMod as any).id

  // Copy all top-level lessons
  const { data: lessons } = await admin.from('lessons').select('*')
    .eq('module_id', id).is('parent_lesson_id', null).order('position')

  const lessonIdMap: Record<string, string> = {}
  for (const lesson of lessons ?? []) {
    const { data: newLesson } = await admin.from('lessons').insert({
      module_id: newModId,
      title: (lesson as any).title,
      content_html: (lesson as any).content_html,
      position: (lesson as any).position,
      locked: (lesson as any).locked,
      author_id: user.id,
    } as any).select('id').single()
    if (newLesson) {
      lessonIdMap[(lesson as any).id] = (newMod as any).id

      // Copy sub-lessons
      const { data: subs } = await admin.from('lessons').select('*')
        .eq('parent_lesson_id', (lesson as any).id).order('sub_position')
      for (const sub of subs ?? []) {
        await admin.from('lessons').insert({
          module_id: newModId,
          title: (sub as any).title,
          content_html: (sub as any).content_html,
          position: 0,
          locked: false,
          parent_lesson_id: (newLesson as any).id,
          sub_position: (sub as any).sub_position,
          author_id: user.id,
        } as any)
      }
    }
  }

  // Copy assignments
  const { data: assignments } = await admin.from('assignments').select('*').eq('module_id', id)
  for (const a of assignments ?? []) {
    await admin.from('assignments').insert({
      module_id: newModId,
      title: (a as any).title,
      description: (a as any).description,
      type: (a as any).type,
      questions: (a as any).questions,
      due_at: null, // don't copy deadline
    } as any)
  }

  return Response.redirect(new URL('/teacher/modules/' + newModId, req.url), 303)
}
