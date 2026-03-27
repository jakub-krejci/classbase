'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect } from 'react'
import { Tag, PageHeader, EmptyState } from '@/components/ui'
import { useIsMobile } from '@/lib/useIsMobile'
import { createClient } from '@/lib/supabase/client'

export default function StudentHome({ profile, enrollments, progressMap, messages: initMessages }: {
  profile: any
  enrollments: any[]
  progressMap: Record<string, { done: number; total: number }>
  messages: any[]
}) {
  const isMobile = useIsMobile()
  const supabase = createClient()
  const [messages, setMessages] = useState(initMessages)
  const [dismissed, setDismissed] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem('cb_dismissed_announcements')
      return new Set(stored ? JSON.parse(stored) : [])
    } catch { return new Set() }
  })
  const [showEnroll, setShowEnroll] = useState(false)

  // Real-time: new announcements
  useEffect(() => {
    const ch = supabase.channel('student-home-ann')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, async (payload: any) => {
        const m = payload.new
        if (m.recipient_type !== 'all' || m.message_type !== 'announcement') return
        const { data: p } = await supabase.from('profiles').select('full_name').eq('id', m.sender_id).single()
        setMessages(prev => [{ ...m, sender_name: (p as any)?.full_name ?? 'Teacher' }, ...prev])
      })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [])

  function dismiss(id: string) {
    setDismissed(prev => {
      const next = new Set(prev).add(id)
      try { localStorage.setItem('cb_dismissed_announcements', JSON.stringify([...next])) } catch {}
      return next
    })
  }

  const visibleMessages = messages.filter(m => !dismissed.has(m.id))
  const [step, setStep] = useState<'code' | 'password'>('code')
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [pendingTitle, setPendingTitle] = useState('')
  const [enrollError, setEnrollError] = useState('')
  const [enrolling, setEnrolling] = useState(false)

  const name: string = profile?.full_name ?? ''
  const totalLessons = Object.values(progressMap).reduce((a, p) => a + p.total, 0)
  const doneLessons = Object.values(progressMap).reduce((a, p) => a + p.done, 0)
  const overallPct = totalLessons > 0 ? Math.round(doneLessons / totalLessons * 100) : 0

  function closeModal() {
    setShowEnroll(false); setStep('code'); setCode(''); setPassword(''); setPendingTitle(''); setEnrollError('')
  }

  async function submit() {
    const trimmedCode = code.trim().toUpperCase()
    const trimmedPass = password.trim()
    if (step === 'code' && !trimmedCode) return
    if (step === 'password' && !trimmedPass) return
    setEnrolling(true); setEnrollError('')

    try {
      const res = await fetch('/api/enroll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          access_code: trimmedCode,
          password: step === 'password' ? trimmedPass : undefined,
        }),
      })
      const data = await res.json()

      if (!res.ok) {
        if (res.status === 403 && data.needsPassword) {
          // Module found but needs password
          setPendingTitle(data.moduleTitle)
          setStep('password')
          setEnrolling(false)
          return
        }
        setEnrollError(data.error ?? 'Something went wrong.')
        setEnrolling(false)
        return
      }

      // Success
      closeModal()
      window.location.reload()
    } catch {
      setEnrollError('Network error. Please try again.')
      setEnrolling(false)
    }
  }

  const inpStyle: React.CSSProperties = {
    width: '100%', padding: '10px 12px', border: '1px solid #e5e7eb',
    borderRadius: 9, fontSize: 13, fontFamily: 'inherit', outline: 'none', marginBottom: 10,
  }

  return (
    <div>
      {/* Announcement banners */}
      {visibleMessages.map(m => (
        <div key={m.id} style={{ background: '#E6F1FB', border: '0.5px solid #B5D4F4', borderRadius: 10, padding: '10px 14px', marginBottom: 10, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#0C447C', marginBottom: 2 }}>📢 Announcement from your teacher</div>
            <div style={{ fontSize: 13, color: '#0C447C', lineHeight: 1.5 }}>{m.body}</div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
            <a href="/student/inbox" style={{ fontSize: 11, color: '#185FA5', fontWeight: 500, textDecoration: 'none', whiteSpace: 'nowrap' }}>View all →</a>
            <button onClick={() => dismiss(m.id)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: '#7da8cc', lineHeight: 1, padding: '0 2px' }} title="Dismiss">✕</button>
          </div>
        </div>
      ))}

      {/* Enroll modal */}
      {showEnroll && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: '#fff', borderRadius: 14, padding: 28, width: '100%', maxWidth: 360, boxShadow: '0 8px 40px rgba(0,0,0,.18)' }}>
            {step === 'code' ? (
              <>
                <h2 style={{ fontSize: 17, fontWeight: 600, marginBottom: 4 }}>Join a module</h2>
                <p style={{ fontSize: 13, color: '#888', marginBottom: 16 }}>Enter the access code your teacher shared</p>
                <input
                  value={code}
                  onChange={e => setCode(e.target.value.toUpperCase())}
                  onKeyDown={e => e.key === 'Enter' && submit()}
                  placeholder="e.g. PHY-2026"
                  autoFocus
                  style={{ ...inpStyle, fontFamily: 'monospace', letterSpacing: '.1em', fontSize: 15 }}
                />
              </>
            ) : (
              <>
                <h2 style={{ fontSize: 17, fontWeight: 600, marginBottom: 4 }}>Enter enrollment password</h2>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 11px', background: '#f3f4f6', borderRadius: 8, marginBottom: 14 }}>
                  <span style={{ fontSize: 13 }}>📘</span>
                  <span style={{ fontSize: 13, fontWeight: 500, color: '#333' }}>{pendingTitle}</span>
                </div>
                <p style={{ fontSize: 13, color: '#888', marginBottom: 12 }}>This module requires a password from your teacher.</p>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && submit()}
                  placeholder="Enrollment password"
                  autoFocus
                  style={inpStyle}
                />
              </>
            )}

            {enrollError && (
              <div style={{ fontSize: 12, padding: '8px 11px', background: '#FCEBEB', color: '#791F1F', borderRadius: 8, marginBottom: 10 }}>
                {enrollError}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={submit}
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
              <button onClick={() => { setStep('code'); setPassword(''); setEnrollError('') }}
                style={{ width: '100%', marginTop: 10, padding: '7px', fontSize: 12, color: '#888', background: 'none', border: 'none', cursor: 'pointer' }}>
                ← Try a different code
              </button>
            )}
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
                  <div style={{ height: '100%', width: pct + '%', background: '#185FA5', borderRadius: 3 }} />
                </div>
              </a>
            )
          })}
        </div>
      )}
    </div>
  )
}
