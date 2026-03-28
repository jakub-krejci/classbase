'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from 'react'
import { PageHeader } from '@/components/ui'

export default function StudentTestsClient({ tests, attempts, studentId: _ }: { tests: any[]; attempts: any[]; studentId: string }) {
  const [hidden, setHidden] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem('hidden_tests') ?? '[]')) } catch { return new Set() }
  })
  const [showHidden, setShowHidden] = useState(false)

  function toggleHide(testId: string) {
    setHidden(prev => {
      const next = new Set(prev)
      if (next.has(testId)) next.delete(testId); else next.add(testId)
      try { localStorage.setItem('hidden_tests', JSON.stringify([...next])) } catch {}
      return next
    })
  }

  // All attempts for a test (supports retakes)
  function getAttempts(testId: string) {
    return attempts.filter(a => a.test_id === testId)
  }

  function getActiveAttempt(testId: string) {
    return getAttempts(testId).find(a => a.status === 'in_progress') ?? null
  }

  function getLatestCompleted(testId: string) {
    return getAttempts(testId)
      .filter(a => ['submitted','timed_out','locked'].includes(a.status))
      .sort((a, b) => new Date(b.submitted_at ?? b.started_at).getTime() - new Date(a.submitted_at ?? a.started_at).getTime())[0] ?? null
  }

  function canRetake(t: any) {
    const mode = t.retake_mode ?? 'single'
    if (mode === 'practice') return true
    const completed = getAttempts(t.id).filter(a => ['submitted','timed_out','locked'].includes(a.status))
    if (mode === 'best') return t.max_attempts == null || completed.length < t.max_attempts
    return false // single
  }

  function getStatus(t: any) {
    const now = new Date()
    if (t.available_until && new Date(t.available_until) < now) return 'expired'
    if (t.available_from && new Date(t.available_from) > now) return 'upcoming'
    const active = getActiveAttempt(t.id)
    if (active) return 'in_progress'
    const completed = getAttempts(t.id).filter(a => ['submitted','timed_out','locked'].includes(a.status))
    if (completed.length === 0) return 'available'
    return completed[0]?.status ?? 'submitted'
  }

  const STATUS_INFO: Record<string, { label: string; bg: string; color: string }> = {
    available:   { label: 'Dostupný',   bg: '#EAF3DE', color: '#27500A' },
    in_progress: { label: 'Probíhá', bg: '#FEF3C7', color: '#92400E' },
    submitted:   { label: 'Odevzdáno',   bg: '#E6F1FB', color: '#0C447C' },
    locked:      { label: 'Zamčeno',      bg: '#fee2e2', color: '#991b1b' },
    timed_out:   { label: 'Čas vypršel',   bg: '#f3f4f6', color: '#555'    },
    expired:     { label: 'Prošlé',     bg: '#f3f4f6', color: '#888'    },
    upcoming:    { label: 'Nadcházející',    bg: '#f0f4ff', color: '#3730a3' },
  }

  const visibleTests = tests.filter(t => showHidden ? hidden.has(t.id) : !hidden.has(t.id))
  const hiddenCount = [...hidden].filter(id => tests.some(t => t.id === id)).length

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, gap: 10, flexWrap: 'wrap' }}>
        <PageHeader title="Moje testy" sub="Testy přiřazené tvými učiteli" />
        <div style={{ display: 'flex', gap: 8 }}>
          {hiddenCount > 0 && (
            <button onClick={() => setShowHidden(v => !v)}
              style={{ padding: '8px 14px', background: showHidden ? 'var(--accent)' : '#f3f4f6', color: showHidden ? '#fff' : '#555', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
              {showHidden ? '← Back' : `🗄 Archived (${hiddenCount})`}
            </button>
          )}
          <a href="/student/tests/history"
            style={{ padding: '8px 16px', background: '#f3f4f6', color: '#444', borderRadius: 8, textDecoration: 'none', fontSize: 13, fontWeight: 500, border: '1px solid #e5e7eb', whiteSpace: 'nowrap' }}>
            📊 History & Stats
          </a>
        </div>
      </div>

      {visibleTests.length === 0 && !showHidden && (
        <div style={{ textAlign: 'center', padding: '48px 20px', color: '#aaa', border: '1px dashed #e5e7eb', borderRadius: 12 }}>
          No tests assigned yet.
        </div>
      )}
      {visibleTests.length === 0 && showHidden && (
        <div style={{ textAlign: 'center', padding: '48px 20px', color: '#aaa', border: '1px dashed #e5e7eb', borderRadius: 12 }}>
          No archived tests.
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))', gap: 16 }}>
        {visibleTests.map(t => {
          const st = getStatus(t)
          const si = STATUS_INFO[st] ?? STATUS_INFO.available
          const active = getActiveAttempt(t.id)
          const latest = getLatestCompleted(t.id)
          const retakeMode = t.retake_mode ?? 'single'
          const completedCount = getAttempts(t.id).filter(a => ['submitted','timed_out','locked'].includes(a.status)).length
          const canStart = st === 'available' || st === 'in_progress'
          const canRetakeNow = !canStart && (st === 'submitted' || st === 'timed_out') && canRetake(t)
          const isHidden = hidden.has(t.id)

          return (
            <div key={t.id} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 20, display: 'flex', flexDirection: 'column', gap: 10, opacity: isHidden ? .8 : 1 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</div>
                  {t.category && <div style={{ fontSize: 11, color: '#888' }}>{t.category}</div>}
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
                  <span style={{ padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: si.bg, color: si.color }}>{si.label}</span>
                  <button onClick={() => toggleHide(t.id)} title={isHidden ? 'Restore' : 'Archive'}
                    style={{ padding: '2px 6px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: '#aaa', lineHeight: 1 }}>
                    {isHidden ? '↩' : '🗄'}
                  </button>
                </div>
              </div>

              {t.description && <div style={{ fontSize: 13, color: '#666', lineHeight: 1.5 }}>{t.description}</div>}

              <div style={{ fontSize: 11, color: '#aaa', display: 'flex', flexDirection: 'column', gap: 2 }}>
                {t.time_limit_mins && <span>⏱ {t.time_limit_mins} min</span>}
                {retakeMode === 'best' && <span>🔁 Best of {t.max_attempts ?? '∞'} · {completedCount} attempt{completedCount !== 1 ? 's' : ''} used</span>}
                {retakeMode === 'practice' && <span style={{ color: '#16a34a' }}>📖 Practice mode</span>}
                {t.available_from && <span>Opens: {new Date(t.available_from).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>}
                {t.available_until && <span>Closes: {new Date(t.available_until).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>}
              </div>

              {/* Start / Continue */}
              {canStart && (
                <a href={`/student/tests/${t.id}`}
                  style={{ display: 'block', padding: '9px 0', background: st === 'in_progress' ? '#FEF3C7' : 'var(--accent)', color: st === 'in_progress' ? '#92400E' : '#fff', textAlign: 'center', borderRadius: 8, textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>
                  {st === 'in_progress' ? '▶ Pokračovat v testu' : '▶ Spustit test'}
                </a>
              )}

              {/* Submitted / timed out */}
              {(st === 'submitted' || st === 'timed_out') && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {/* Grading status — only for non-practice */}
                  {st === 'submitted' && retakeMode !== 'practice' && (
                    <div style={{ fontSize: 12, color: latest?.reviewed_at ? '#27500A' : '#888', background: latest?.reviewed_at ? '#EAF3DE' : '#f9fafb', borderRadius: 8, padding: '6px 12px', textAlign: 'center', fontWeight: 500 }}>
                      {latest?.reviewed_at
                        ? <>✓ Graded — <strong>{latest.final_score ?? latest.score ?? '?'} / {latest.max_score ?? '?'} pts</strong></>
                        : '⏳ Zatím neohodnoceno'}
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 8 }}>
                    {/* Status badge */}
                    <div style={{ flex: canRetakeNow ? 0 : 1, padding: '9px 12px', background: st === 'timed_out' ? '#f3f4f6' : '#E6F1FB', color: st === 'timed_out' ? '#555' : '#0C447C', textAlign: 'center', borderRadius: 8, fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap' }}>
                      {st === 'timed_out' ? '⏰ Čas vypršel' : '✓ Odevzdáno'}
                    </div>
                    {/* My answers */}
                    <a href={`/student/tests/${t.id}`}
                      style={{ padding: '9px 12px', background: '#f3f4f6', color: '#444', textAlign: 'center', borderRadius: 8, fontSize: 13, fontWeight: 500, textDecoration: 'none', border: '1px solid #e5e7eb', whiteSpace: 'nowrap' }}>
                      👁 Answers
                    </a>
                    {/* Retake button */}
                    {canRetakeNow && (
                      <a href={`/student/tests/${t.id}?retake=1`}
                        style={{ flex: 1, padding: '9px 0', background: 'var(--accent)', color: '#fff', textAlign: 'center', borderRadius: 8, textDecoration: 'none', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap' }}>
                        🔁 Retake
                      </a>
                    )}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
