/* eslint-disable @typescript-eslint/no-explicit-any */
import { createAdminClient, createServerClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import AppShell from '@/components/AppShell'
import LessonViewer from '@/app/student/modules/[id]/lessons/[lessonId]/LessonViewer'

export default async function TeacherLessonPreviewPage({ params }: { params: any }) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const admin = createAdminClient()
  const { data: pd } = await admin.from('profiles').select('*').eq('id', (user as any).id).single()
  const profile = pd as any
  if (profile?.role !== 'teacher') redirect('/teacher/modules')

  const { data: lesson } = await admin.from('lessons').select('*').eq('id', params.lessonId).single()
  if (!lesson) redirect('/teacher/modules/' + params.id)

  const { data: allLessons } = await admin.from('lessons').select('id,title,position').eq('module_id', params.id).order('position')

  let authorName = ''
  if ((lesson as any).author_id) {
    const { data: author } = await admin.from('profiles').select('full_name').eq('id', (lesson as any).author_id).single()
    authorName = (author as any)?.full_name ?? ''
  }

  return (
    <AppShell user={profile} role="teacher">
      <div style={{ background: '#FFF3CD', border: '1px solid #FFE69C', borderRadius: 8, padding: '8px 14px', marginBottom: 16, fontSize: 13, color: '#856404', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span>👁 Preview mode — this is how students see this lesson</span>
        <a href={'/teacher/modules/' + params.id} style={{ fontSize: 12, color: '#856404', fontWeight: 600, textDecoration: 'none' }}>← Back to module</a>
      </div>
      <LessonViewer
        lesson={lesson as any}
        moduleId={params.id}
        studentId={(user as any).id}
        completionStatus="none"
        allLessons={(allLessons ?? []) as any[]}
        completedIds={[]}
        authorName={authorName}
      />
    </AppShell>
  )
}
