'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Tag, PageHeader, EmptyState } from '@/components/ui'

export default function StudentHome({ profile, enrollments, progressMap, messages, studentId }: {
  profile: any; enrollments: any[]; progressMap: Record<string, { done: number; total: number }>; messages: any[]; studentId: string
}) {
  const supabase = createClient()
  const [showEnroll, setShowEnroll] = useState(false)
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [step, setStep] = useState<'code' | 'password'>('code')
  const [pendingModule, setPendingModule] = useState<any>(null)
  const [enrollError, setEnrollError] = useState('')
  const [enrolling, setEnrolling] = useState(false)
  const [enrollSuccess, setEnrollSuccess] = useState('')

  const name: string = profile?.full_name ?? ''
  const totalLessons = Object.values(progressMap).reduce((a, p) => a + p.total, 0)
  const doneLessons = Object.values(progressMap).reduce((a, p) => a + p.done, 0)
  const overallPct = totalLessons > 0 ? Math.round(doneLessons / totalLessons * 100) : 0

  function closeModal() {
    setShowEnroll(false); setCode(''); setPassword('')
    setStep('code'); setPendingModule(null)
    setEnrollError(''); setEnrollSuccess('')
  }

  async function lookupCode() {
    const trimmed = code.trim().toUpperCase()
    if (!trimmed) return
    setEnrolling(true); setEnrollError('')

    const { data: mod, error: modErr } = await supabase
      .from('modules')
      .select('id, title, enrollment_password')
      .eq('access_code', trimmed)
      .single()

    if (modErr || !mod) {
      setEnrollError('Access code not found. Double-check the code your teacher gave you.')
      setEnrolling(false)
      return
    }

    if ((mod as any).enrollment_password) {
      // Module requires a password — go to step 2
      setPendingModule(mod)
      setStep('password')
      setEnrolling(false)
      return
    }

    // No password needed — enroll immediately
    await doEnroll(mod, '')
  }

  async function doEnroll(mod: any, pw: string) {
    setEnrolling(true)
    // Verify password if the module requires one
    if (mod.enrollment_password && mod.enrollment_password !== pw.trim()) {
      setEnrollError('Incorrect enrollment password. Try again.')
      setEnrolling(false)
      return
    }

    // Check not already enrolled
    const { data: existing } = await supabase
      .from('enrollments')
      .select('id')
      .eq('student_id', studentId)
      .eq('module_id', mod.id)
      .single()

    if (existing) {
      setEnrollError('You are already enrolled in this module.')
      setEnrolling(false)
      return
    }

    const { error } = await supabase
      .from('enrollments')
      .insert({ student_id: studentId, module_id: mod.id } as any)

    if (error) {
      setEnrollError(error.message)
      setEnrolling(false)
      return
    }

    setEnrollSuccess('Enrolled in ' + mod.title + '! Loading…')
    setTimeout(() => { window.location.reload() }, 1200)
  }

  return (
    <div>
      {/* Teacher message banner */}
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
        sub={enrollments.length > 0
          ? `${enrollments.length} module${enrollments.length !== 1 ? 's' : ''} · ${overallPct}% overall progress`
          : 'Welcome to ClassBase'}
        action={
          <button onClick={() => setShowEnroll(true)}
            style={{ padding: '7px 14px', background: '#185FA5', color: '#E6F1FB', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>
            + Join module
          </button>
        }
      />

      {/* Enroll modal */}
      {showEnroll && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: '#fff', borderRadius: 14, padding: 26, width: '100%', maxWidth: 380, border: '0.5px solid #e5e7eb', boxShadow: '0 8px 32px rgba(0,0,0,.12)' }}>

            {step === 'code' ? (
              <>
                <h2 style={{ fontSize: 17, fontWeight: 600, marginBottom: 4 }}>Join a module</h2>
                <p style={{ fontSize: 13, color: '#888', marginBottom: 18 }}>
                  Enter the <strong>access code</strong> your teacher gave you.<br />
                  <span style={{ fontSize: 12 }}>It looks like <code style={{ fontFamily: 'monospace', background: '#f3f4f6', padding: '1px 5px', borderRadius: 4 }}>ABC-1234</code></span>
                </p>
                <input
                  value={code}
                  onChange={e => setCode(e.target.value.toUpperCase())}
                  onKeyDown={e => e.key === 'Enter' && lookupCode()}
                  placeholder="e.g. PHY-2026"
                  autoFocus
                  style={{ width: '100%', padding: '10px 12px', border: '1px solid #e5e7eb', borderRadius: 9, fontSize: 15, fontFamily: 'monospace', letterSpacing: '.1em', marginBottom: 10, outline: 'none', textTransform: 'uppercase' }}
                />
              </>
            ) : (
              <>
                <h2 style={{ fontSize: 17, fontWeight: 600, marginBottom: 4 }}>Enter enrollment password</h2>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 11px', background: '#f3f4f6', borderRadius: 8, marginBottom: 14 }}>
                  <span style={{ fontSize: 13 }}>📘</span>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{pendingModule?.title}</div>
                    <div style={{ fontSize: 11, color: '#888' }}>This module requires a password to join.</div>
                  </div>
                </div>
                <p style={{ fontSize: 13, color: '#888', marginBottom: 10 }}>
                  Ask your teacher for the <strong>enrollment password</strong> for this module.
                </p>
                <input
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && doEnroll(pendingModule, password)}
                  type="password"
                  placeholder="Enrollment password"
                  autoFocus
                  style={{ width: '100%', padding: '10px 12px', border: '1px solid #e5e7eb', borderRadius: 9, fontSize: 14, fontFamily: 'inherit', marginBottom: 10, outline: 'none' }}
                />
              </>
            )}

            {enrollError && (
              <div style={{ fontSize: 12, padding: '8px 11px', background: '#FCEBEB', color: '#791F1F', borderRadius: 8, marginBottom: 10 }}>
                {enrollError}
              </div>
            )}
            {enrollSuccess && (
              <div style={{ fontSize: 12, padding: '8px 11px', background: '#EAF3DE', color: '#27500A', borderRadius: 8, marginBottom: 10 }}>
                ✓ {enrollSuccess}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => step === 'code' ? lookupCode() : doEnroll(pendingModule, password)}
                disabled={enrolling || (step === 'code' && !code.trim()) || (step === 'password' && !password.trim())}
                style={{ flex: 1, padding: '10px', background: '#185FA5', color: '#E6F1FB', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer', opacity: enrolling ? .6 : 1 }}>
                {enrolling ? '…' : step === 'code' ? 'Continue' : 'Join module'}
              </button>
              <button onClick={closeModal}
                style={{ padding: '10px 16px', border: '0.5px solid #e5e7eb', borderRadius: 8, fontSize: 13, background: '#fff', cursor: 'pointer', color: '#555' }}>
                Cancel
              </button>
            </div>

            {step === 'password' && (
              <button
                onClick={() => { setStep('code'); setPassword(''); setEnrollError(''); setPendingModule(null) }}
                style={{ width: '100%', marginTop: 8, padding: '6px', fontSize: 12, color: '#888', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
                ← Use a different access code
              </button>
            )}
          </div>
        </div>
      )}

      {/* Module list */}
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
