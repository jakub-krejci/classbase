import { createServerClient, createAdminClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import AppShell from '@/components/AppShell'
import QuestionBankClient from './QuestionBankClient'

export default async function QuestionBankPage() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const admin = createAdminClient()
  const { data: pd } = await admin.from('profiles').select('*').eq('id', user.id).single()
  if ((pd as any)?.role !== 'teacher') redirect('/student/modules')

  const { data: questions } = await admin
    .from('question_bank')
    .select('*, question_bank_options(*)')
    .eq('teacher_id', user.id)
    .order('created_at', { ascending: false })

  const { data: tests } = await admin
    .from('tests')
    .select('id, title')
    .eq('teacher_id', user.id)
    .in('status', ['draft', 'published'])
    .order('created_at', { ascending: false })

  return (
    <AppShell user={pd} role="teacher" wide>
      <QuestionBankClient
        questions={(questions ?? []) as any[]}
        tests={(tests ?? []) as any[]}
        teacherId={user.id}
      />
    </AppShell>
  )
}
