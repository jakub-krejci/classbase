/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerClient, createAdminClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import AppShell from '@/components/AppShell'
import LessonViewer from './LessonViewer'

export default async function StudentLessonPage({ params }: { params: any }) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const admin = createAdminClient()
  const { data: pd } = await admin.from('profiles').select('*').eq('id', (user as any).id).single()
  const profile = pd as any
  if (profile?.role !== 'student') redirect('/teacher/modules')

  const { data: lesson } = await admin.from('lessons').select('*').eq('id', params.lessonId).single()
  if (!lesson) redirect('/student/modules/' + params.id)

  const { data: prog } = await admin.from('lesson_progress')
    .select('id').eq('student_id', (user as any).id).eq('lesson_id', params.lessonId).single()

  return (
    <AppShell user={profile} role="student">
      <LessonViewer
        lesson={lesson as any}
        moduleId={params.id}
        studentId={(user as any).id}
        completed={!!prog}
      />
    </AppShell>
  )
}
