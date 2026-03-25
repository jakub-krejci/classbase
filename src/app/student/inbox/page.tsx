export const dynamic = 'force-dynamic'

/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerClient, createAdminClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import AppShell from '@/components/AppShell'
import { PageHeader } from '@/components/ui'

export default async function StudentInboxPage() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const admin = createAdminClient()
  const { data: pd } = await admin.from('profiles').select('*').eq('id', (user as any).id).single()
  const profile = pd as any
  if (profile?.role !== 'student') redirect('/teacher/modules')

  // Fetch messages for 'all' or directly to this student
  const { data: allMsgs } = await admin.from('messages').select('*, profiles!sender_id(full_name)').eq('recipient_type', 'all').order('created_at', { ascending: false })
  const { data: directMsgs } = await admin.from('messages').select('*, profiles!sender_id(full_name)').eq('recipient_type', 'student').eq('recipient_id', (user as any).id).order('created_at', { ascending: false })

  const messages = [...(allMsgs ?? []), ...(directMsgs ?? [])].sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()) as any[]

  return (
    <AppShell user={profile} role="student">
      <PageHeader title="Inbox" sub="Messages from your teachers" />
      {messages.length === 0 ? (
        <p style={{ fontSize: 13, color: '#aaa', textAlign: 'center', padding: '40px 0' }}>No messages yet.</p>
      ) : (
        messages.map((m: any) => {
          const sender = m.profiles as any
          return (
            <div key={m.id} style={{ background: '#fff', border: '0.5px solid #e5e7eb', borderRadius: 12, padding: '14px 16px', marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <div style={{ width: 26, height: 26, borderRadius: '50%', background: '#E6F1FB', color: '#0C447C', fontSize: 10, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {(sender?.full_name ?? 'T').split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2)}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 500 }}>{sender?.full_name ?? 'Teacher'}</div>
                  <div style={{ fontSize: 11, color: '#aaa' }}>
                    {new Date(m.created_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    {m.recipient_type === 'all' ? ' · To all students' : ' · Direct message'}
                  </div>
                </div>
              </div>
              <div style={{ fontSize: 13, color: '#222', lineHeight: 1.6 }}>{m.body}</div>
            </div>
          )
        })
      )}
    </AppShell>
  )
}
