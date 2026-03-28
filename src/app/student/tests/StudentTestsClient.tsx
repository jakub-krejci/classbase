'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */
import { PageHeader } from '@/components/ui'

export default function StudentTestsClient({ tests, attempts, studentId: _ }: { tests: any[]; attempts: any[]; studentId: string }) {
  const attemptMap = Object.fromEntries(attempts.map(a => [a.test_id, a]))

  function getStatus(t: any) {
    const attempt = attemptMap[t.id]
    const now = new Date()
    if (t.available_until && new Date(t.available_until) < now) return 'expired'
    if (t.available_from && new Date(t.available_from) > now) return 'upcoming'
    if (!attempt) return 'available'
    return attempt.status
  }

  const STATUS_INFO: Record<string, { label: string; bg: string; color: string }> = {
    available:   { label: 'Available',  bg: '#EAF3DE', color: '#27500A' },
    in_progress: { label: 'In progress', bg: '#FEF3C7', color: '#92400E' },
    submitted:   { label: 'Submitted',  bg: '#E6F1FB', color: '#0C447C' },
    locked:      { label: 'Locked',     bg: '#fee2e2', color: '#991b1b' },
    timed_out:   { label: 'Timed out',  bg: '#f3f4f6', color: '#555' },
    expired:     { label: 'Expired',    bg: '#f3f4f6', color: '#888' },
    upcoming:    { label: 'Upcoming',   bg: '#f0f4ff', color: '#3730a3' },
  }

  return (
    <div>
      <PageHeader title="My Tests" sub="Tests assigned to you by your teachers" />
      {tests.length === 0 && (
        <div style={{ textAlign: 'center', padding: '48px 20px', color: '#aaa', border: '1px dashed #e5e7eb', borderRadius: 12 }}>
          No tests assigned yet.
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))', gap: 16 }}>
        {tests.map(t => {
          const st = getStatus(t)
          const si = STATUS_INFO[st] ?? STATUS_INFO.available
          const attempt = attemptMap[t.id]
          const canStart = st === 'available' || st === 'in_progress'
          return (
            <div key={t.id} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>{t.title}</div>
                  {t.category && <div style={{ fontSize: 11, color: '#888' }}>{t.category}</div>}
                </div>
                <span style={{ padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: si.bg, color: si.color, flexShrink: 0 }}>{si.label}</span>
              </div>
              {t.description && <div style={{ fontSize: 13, color: '#666', lineHeight: 1.5 }}>{t.description}</div>}
              <div style={{ fontSize: 11, color: '#aaa', display: 'flex', flexDirection: 'column', gap: 2 }}>
                {t.time_limit_mins && <span>⏱ {t.time_limit_mins} minute{t.time_limit_mins !== 1 ? 's' : ''}</span>}
                {t.available_from && <span>Opens: {new Date(t.available_from).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>}
                {t.available_until && <span>Closes: {new Date(t.available_until).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>}
                {attempt?.score != null && <span style={{ color: '#185FA5', fontWeight: 600 }}>Score: {attempt.score} / {attempt.max_score}</span>}
              </div>
              {canStart && (
                <a href={`/student/tests/${t.id}`}
                  style={{ display: 'block', padding: '9px 0', background: st === 'in_progress' ? '#FEF3C7' : '#185FA5', color: st === 'in_progress' ? '#92400E' : '#fff', textAlign: 'center', borderRadius: 8, textDecoration: 'none', fontSize: 13, fontWeight: 600, marginTop: 'auto' }}>
                  {st === 'in_progress' ? '▶ Continue test' : '▶ Start test'}
                </a>
              )}
              {st === 'submitted' && (
                <div style={{ padding: '9px 0', background: '#E6F1FB', color: '#0C447C', textAlign: 'center', borderRadius: 8, fontSize: 13, fontWeight: 600 }}>
                  ✓ Submitted
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
