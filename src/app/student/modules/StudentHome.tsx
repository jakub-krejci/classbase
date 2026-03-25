'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Tag, PageHeader, EmptyState } from '@/components/ui'

export default function StudentHome({ profile, enrollments, progressMap, messages, studentId }: {
  profile: any; enrollments: any[]; progressMap: Record<string, { done: number; total: number }>; messages: any[]; studentId: string
}) {
  const supabase = createClient()
  const router = useRouter()
  const [showEnroll, setShowEnroll] = useState(false)
  const [code, setCode] = useState('')
  const [enrollError, setEnrollError] = useState('')
  const [enrolling, setEnrolling] = useState(false)
  const [enrollSuccess, setEnrollSuccess] = useState('')

  const name: string = profile?.full_name ?? ''

  async function joinModule() {
    if (!code.trim()) return
    setEnrolling(true); setEnrollError(''); setEnrollSuccess('')
    const { data: mod } = await supabase.from('modules').select('id,title').eq('access_code', code.trim().toUpperCase()).single()
    if (!mod) { setEnrollError('Invalid access code. Please check with your teacher.'); setEnrolling(false); return }
    const { error } = await supabase.from('enrollments').insert({ student_id: studentId, module_id: (mod as any).id } as any)
    if (error?.code === '23505') { setEnrollError('You are already enrolled in this module.'); setEnrolling(false); return }
    if (error) { setEnrollError(error.message); setEnrolling(false); return }
    setEnrollSuccess('Enrolled in ' + (mod as any).title + '!')
    setCode('')
    setEnrolling(false)
    setTimeout(() => { setShowEnroll(false); setEnrollSuccess(''); router.refresh() }, 1500)
  }

  const totalLessons = Object.values(progressMap).reduce((a, p) => a + p.total, 0)
  const doneLessons = Object.values(progressMap).reduce((a, p) => a + p.done, 0)
  const overallPct = totalLessons > 0 ? Math.round(doneLessons / totalLessons * 100) : 0

  return (
    <div>
      {/* Notification banner */}
      {messages.length > 0 && (
        <div style={{ background: '#E6F1FB', border: '0.5px solid #B5D4F4', borderRadius: 10, padding: '10px 14px', marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#0C447C', marginBottom: 2 }}>Message from your teacher</div>
            <div style={{ fontSize: 13, color: '#0C447C' }}>{messages[0].body}</div>
          </div>
          <a href="/student/inbox" style={{ fontSize: 11, color: '#185FA5', fontWeight: 500, textDecoration: 'none', whiteSpace: 'nowrap' }}>View all →</a>
        </div>
      )}

      <PageHeader
        title={`Hello, ${name}`}
        sub={enrollments.length > 0 ? `${enrollments.length} module${enrollments.length !== 1 ? 's' : ''} · ${overallPct}% overall progress` : 'Welcome to ClassBase'}
        action={
          <button onClick={() => setShowEnroll(true)}
            style={{ padding: '7px 14px', background: '#185FA5', color: '#E6F1FB', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>
            + Join module
          </button>
        }
      />

      {/* Enroll modal */}
      {showEnroll && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 24, width: '100%', maxWidth: 340, border: '0.5px solid #e5e7eb' }}>
            <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>Join a module</h2>
            <p style={{ fontSize: 13, color: '#888', marginBottom: 16 }}>Enter the access code your teacher shared</p>
            <input value={code} onChange={e => setCode(e.target.value.toUpperCase())}
              onKeyDown={e => e.key === 'Enter' && joinModule()}
              placeholder="e.g. PHY-2026"
              style={{ width: '100%', padding: '9px 11px', border: '0.5px solid #e5e7eb', borderRadius: 8, fontSize: 14, fontFamily: 'monospace', letterSpacing: '.08em', marginBottom: 8, outline: 'none' }} />
            {enrollError && <div style={{ fontSize: 12, padding: '7px 10px', background: '#FCEBEB', color: '#791F1F', borderRadius: 8, marginBottom: 8 }}>{enrollError}</div>}
            {enrollSuccess && <div style={{ fontSize: 12, padding: '7px 10px', background: '#EAF3DE', color: '#27500A', borderRadius: 8, marginBottom: 8 }}>{enrollSuccess}</div>}
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={joinModule} disabled={enrolling || !code.trim()}
                style={{ flex: 1, padding: '9px', background: '#185FA5', color: '#E6F1FB', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer', opacity: enrolling ? .6 : 1 }}>
                {enrolling ? 'Joining…' : 'Join'}
              </button>
              <button onClick={() => { setShowEnroll(false); setCode(''); setEnrollError('') }}
                style={{ padding: '9px 14px', border: '0.5px solid #e5e7eb', borderRadius: 8, fontSize: 13, background: '#fff', cursor: 'pointer' }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {enrollments.length === 0 ? (
        <EmptyState message="You are not enrolled in any modules yet. Ask your teacher for an access code and click '+ Join module'." />
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {enrollments.map((e: any) => {
            const m = e.modules as any
            if (!m) return null
            const p = progressMap[e.module_id] ?? { done: 0, total: 0 }
            const pct = p.total > 0 ? Math.round(p.done / p.total * 100) : 0
            return (
              <a key={e.module_id} href={'/student/modules/' + e.module_id}
                style={{ display: 'block', background: '#fff', border: '0.5px solid #e5e7eb', borderRadius: 12, padding: '14px 16px', textDecoration: 'none', color: 'inherit' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 500, fontSize: 14, marginBottom: 3 }}>{m.title}</div>
                    <div style={{ fontSize: 11, color: '#888' }}>{p.done}/{p.total} lessons · {pct}% complete</div>
                  </div>
                  <Tag tag={m.tag} />
                </div>
                <div style={{ height: 5, background: '#f3f4f6', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: pct + '%', background: '#185FA5', borderRadius: 3, transition: 'width .3s' }} />
                </div>
              </a>
            )
          })}
        </div>
      )}
    </div>
  )
}
