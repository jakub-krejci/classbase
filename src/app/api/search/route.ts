import { createServerClient, createAdminClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ results: [] }, { status: 401 })

  const q = req.nextUrl.searchParams.get('q')?.trim() ?? ''
  if (q.length < 2) return NextResponse.json({ results: [] })

  const admin = createAdminClient()

  // Get enrolled module IDs
  const { data: enrollments } = await admin
    .from('enrollments').select('module_id').eq('student_id', user.id)
  const moduleIds = (enrollments ?? []).map((e: any) => e.module_id)

  const results: any[] = []

  // Search modules
  const { data: modules } = await admin
    .from('modules').select('id, title, description')
    .in('id', moduleIds)
    .or(`title.ilike.%${q}%,description.ilike.%${q}%`)
    .limit(4)

  for (const m of modules ?? []) {
    results.push({
      type: 'module',
      id: m.id,
      title: m.title,
      excerpt: m.description ?? '',
      href: `/student/modules/${m.id}`,
    })
  }

  // Search lessons (only in enrolled modules)
  if (moduleIds.length > 0) {
    const { data: lessons } = await admin
      .from('lessons').select('id, title, module_id, modules(title)')
      .in('module_id', moduleIds)
      .ilike('title', `%${q}%`)
      .limit(6)

    for (const l of lessons ?? []) {
      results.push({
        type: 'lesson',
        id: l.id,
        title: l.title,
        excerpt: `Modul: ${(l.modules as any)?.title ?? ''}`,
        href: `/student/modules/${l.module_id}/lessons/${l.id}`,
      })
    }

    // Search lesson content (body stored as JSON blocks — search by title match in lessons table)
    // Also search assignments
    const { data: assignments } = await admin
      .from('assignments').select('id, title, description, module_id, modules(title)')
      .in('module_id', moduleIds)
      .or(`title.ilike.%${q}%,description.ilike.%${q}%`)
      .limit(4)

    for (const a of assignments ?? []) {
      results.push({
        type: 'assignment',
        id: a.id,
        title: a.title,
        excerpt: `Úkol · ${(a.modules as any)?.title ?? ''}`,
        href: `/student/modules/${a.module_id}/assignments/${a.id}`,
      })
    }
  }

  // Search tests assigned to the student
  const { data: myGroups } = await admin.from('group_members').select('group_id').eq('student_id', user.id)
  const groupIds = (myGroups ?? []).map((g: any) => g.group_id)
  const { data: directAssign } = await admin.from('test_assignments').select('test_id').eq('student_id', user.id)
  const { data: groupAssign } = groupIds.length
    ? await admin.from('test_assignments').select('test_id').in('group_id', groupIds)
    : { data: [] }
  const testIds = [...new Set([...(directAssign ?? []), ...(groupAssign ?? [])].map((a: any) => a.test_id))]

  if (testIds.length > 0) {
    const { data: tests } = await admin
      .from('tests').select('id, title, description, category')
      .in('id', testIds)
      .or(`title.ilike.%${q}%,description.ilike.%${q}%,category.ilike.%${q}%`)
      .limit(4)

    for (const t of tests ?? []) {
      results.push({
        type: 'test',
        id: t.id,
        title: t.title,
        excerpt: t.category ? `Kategorie: ${t.category}` : 'Test',
        href: `/student/tests/${t.id}`,
      })
    }
  }

  return NextResponse.json({ results: results.slice(0, 12) })
}
