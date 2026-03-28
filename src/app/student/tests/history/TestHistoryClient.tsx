'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from 'react'
import { Breadcrumb } from '@/components/ui'

function formatDuration(secs: number | null): string {
  if (!secs) return '—'
  const m = Math.floor(secs / 60), s = secs % 60
  return m > 0 ? `${m}m ${s}s` : `${s}s`
}

function ScoreRing({ pct, size = 64 }: { pct: number; size?: number }) {
  const r = (size - 8) / 2
  const circ = 2 * Math.PI * r
  const dash = (pct / 100) * circ
  const color = pct >= 80 ? '#22c55e' : pct >= 50 ? '#f59e0b' : '#ef4444'
  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#f3f4f6" strokeWidth={7} />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={7}
        strokeDasharray={`${dash} ${circ}`} strokeLinecap="round" style={{ transition: 'stroke-dasharray .5s ease' }} />
      <text x={size/2} y={size/2} textAnchor="middle" dominantBaseline="central"
        style={{ transform: 'rotate(90deg)', transformOrigin: `${size/2}px ${size/2}px`, fill: color, fontSize: size * 0.22, fontWeight: 700, fontFamily: 'inherit' }}>
        {Math.round(pct)}%
      </text>
    </svg>
  )
}

export default function TestHistoryClient({ attempts, answers }: {
  attempts: any[]; answers: any[]
}) {
  const [selected, setSelected] = useState<string | null>(attempts[0]?.id ?? null)
  const [view, setView] = useState<'overview' | 'questions'>('overview')

  const selectedAttempt = attempts.find(a => a.id === selected)
  const attemptAnswers = answers.filter(a => a.attempt_id === selected)

  // ── Group attempts by test for the sidebar ────────────────────────────────
  const byTest = attempts.reduce((acc: any, a: any) => {
    const tid = a.tests?.id ?? 'unknown'
    if (!acc[tid]) acc[tid] = { test: a.tests, attempts: [] }
    acc[tid].attempts.push(a)
    return acc
  }, {} as Record<string, { test: any; attempts: any[] }>)

  // ── Compute score trend across all attempts ───────────────────────────────
  const allScored = attempts.filter(a => a.score != null && a.max_score)
  const trendValues = allScored.map(a => (a.final_score ?? a.score) / a.max_score * 100)

  // ── Per-question stats for selected attempt ───────────────────────────────
  const qStats = attemptAnswers.map((ans: any) => {
    const q = ans.test_questions
    if (!q) return null
    const pts = ans.teacher_points ?? ans.auto_score ?? null
    const max = q.points_correct
    return { q, ans, pts, max, pct: pts != null && max ? (pts / max) * 100 : null }
  }).filter(Boolean)

  // ── Topic breakdown (by question position groupings as proxy) ─────────────
  const avgByType: Record<string, { sum: number; count: number }> = {}
  for (const s of qStats) {
    if (!s || s.pts == null) continue
    const t = s.q.type
    if (!avgByType[t]) avgByType[t] = { sum: 0, count: 0 }
    avgByType[t].sum += s.pct ?? 0
    avgByType[t].count++
  }

  const typeLabels: Record<string, string> = {
    single: 'Single choice', multiple: 'Multiple choice',
    truefalse: 'True/False', descriptive: 'Descriptive', coding: 'Coding'
  }

  if (!attempts.length) {
    return (
      <div style={{ maxWidth: 600, margin: '60px auto', textAlign: 'center' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>📊</div>
        <h2 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 8px' }}>No test history yet</h2>
        <p style={{ color: '#666', fontSize: 14 }}>Complete a test to see your history and statistics here.</p>
        <a href="/student/tests" style={{ display: 'inline-block', marginTop: 20, padding: '10px 24px', background: '#185FA5', color: '#fff', borderRadius: 8, textDecoration: 'none', fontSize: 14, fontWeight: 600 }}>← Back to tests</a>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      <Breadcrumb items={[{ label: 'Tests', href: '/student/tests' }, { label: 'History & Statistics' }]} />
      <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 24px' }}>📊 Test History & Statistics</h1>

      {/* ── Overall stats strip ── */}
      {trendValues.length > 0 && (() => {
        const avg = Math.round(trendValues.reduce((a, b) => a + b, 0) / trendValues.length)
        const best = Math.round(Math.max(...trendValues))
        const latest = Math.round(trendValues[trendValues.length - 1])
        // Trend: compare last 3 vs previous 3
        let trend: 'up' | 'down' | 'stable' = 'stable'
        if (trendValues.length >= 4) {
          const recent = trendValues.slice(-3).reduce((a, b) => a + b, 0) / 3
          const older = trendValues.slice(-6, -3).reduce((a, b) => a + b, 0) / Math.min(3, trendValues.length - 3)
          if (recent - older > 5) trend = 'up'
          else if (older - recent > 5) trend = 'down'
        }
        const trendInfo = {
          up:     { icon: '↑', label: 'Zlepšování', color: '#16a34a', bg: '#f0fdf4' },
          down:   { icon: '↓', label: 'Zhoršování',  color: '#dc2626', bg: '#fef2f2' },
          stable: { icon: '→', label: 'Stabilní',     color: '#2563eb', bg: '#eff6ff' },
        }[trend]
        const stats = [
          { label: 'Průměrné skóre', value: `${avg}%`, color: avg >= 80 ? '#16a34a' : avg >= 50 ? '#d97706' : '#dc2626' },
          { label: 'Nejlepší skóre',    value: `${best}%`, color: '#16a34a' },
          { label: 'Poslední skóre',  value: `${latest}%`, color: latest >= 80 ? '#16a34a' : latest >= 50 ? '#d97706' : '#dc2626' },
          { label: 'Celkem pokusů', value: `${attempts.length}`, color: '#185FA5' },
        ]
        return (
          <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, padding: '20px 24px', marginBottom: 24, display: 'flex', alignItems: 'center', gap: 0, flexWrap: 'wrap' }}>
            {stats.map(({ label, value, color }, i) => (
              <div key={label} style={{ flex: '1 1 120px', textAlign: 'center', padding: '8px 16px', borderRight: i < stats.length - 1 ? '1px solid #f3f4f6' : 'none' }}>
                <div style={{ fontSize: 26, fontWeight: 700, color, lineHeight: 1.1 }}>{value}</div>
                <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>{label}</div>
              </div>
            ))}
            {trendValues.length >= 4 && (
              <div style={{ flex: '1 1 120px', textAlign: 'center', padding: '8px 16px', borderLeft: '1px solid #f3f4f6' }}>
                <div style={{ fontSize: 26, fontWeight: 700, color: trendInfo.color, lineHeight: 1.1 }}>{trendInfo.icon}</div>
                <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>{trendInfo.label}</div>
              </div>
            )}
          </div>
        )
      })()}

      <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 20 }}>
        {/* ── Sidebar: grouped by test ── */}
        <div>
          {Object.values(byTest).map(({ test, attempts: tas }: any) => (
            <div key={test?.id ?? 'u'} style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#888', padding: '0 4px', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.05em' }}>
                {test?.title ?? 'Unknown test'}
              </div>
              {tas.map((a: any) => {
                const pct = a.max_score ? Math.round(((a.final_score ?? a.score ?? 0) / a.max_score) * 100) : null
                const isSelected = a.id === selected
                return (
                  <button key={a.id} onClick={() => { setSelected(a.id); setView('overview') }}
                    style={{ width: '100%', textAlign: 'left', padding: '10px 12px', borderRadius: 10, border: `1.5px solid ${isSelected ? '#185FA5' : '#e5e7eb'}`, background: isSelected ? '#E6F1FB' : '#fff', cursor: 'pointer', marginBottom: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: isSelected ? '#0C447C' : '#333' }}>
                        {new Date(a.submitted_at ?? a.started_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </div>
                      <div style={{ fontSize: 11, color: '#888', marginTop: 1 }}>
                        {a.status === 'timed_out' ? '⏰ Timed out' : '✓ Submitted'}
                        {a.time_spent_secs ? ` · ${formatDuration(a.time_spent_secs)}` : ''}
                      </div>
                    </div>
                    {pct != null && (
                      <span style={{ fontSize: 12, fontWeight: 700, color: pct >= 80 ? '#22c55e' : pct >= 50 ? '#f59e0b' : '#ef4444' }}>{pct}%</span>
                    )}
                  </button>
                )
              })}
            </div>
          ))}
        </div>

        {/* ── Main detail panel ── */}
        {selectedAttempt && (
          <div>
            {/* Header */}
            <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, padding: '20px 24px', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>{selectedAttempt.tests?.title}</div>
                  <div style={{ fontSize: 12, color: '#888' }}>
                    {new Date(selectedAttempt.submitted_at ?? selectedAttempt.started_at).toLocaleString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    {selectedAttempt.time_spent_secs ? ` · Time spent: ${formatDuration(selectedAttempt.time_spent_secs)}` : ''}
                  </div>
                </div>
                {selectedAttempt.max_score > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <ScoreRing pct={((selectedAttempt.final_score ?? selectedAttempt.score ?? 0) / selectedAttempt.max_score) * 100} />
                    <div style={{ fontSize: 11, color: '#888', marginTop: 4, textAlign: 'center' }}>
                      {selectedAttempt.final_score ?? selectedAttempt.score ?? 0} / {selectedAttempt.max_score} pts
                    </div>
                  </div>
                )}
              </div>

              {/* Stats row */}
              <div style={{ display: 'flex', gap: 16, marginTop: 16, flexWrap: 'wrap' }}>
                {[
                  ['Status', selectedAttempt.status === 'timed_out' ? '⏰ Timed out' : '✓ Submitted'],
                  ['Score', `${selectedAttempt.final_score ?? selectedAttempt.score ?? '—'} / ${selectedAttempt.max_score ?? '—'}`],
                  ['Graded', selectedAttempt.reviewed_at ? '✓ Ano' : '⏳ Čeká'],
                  ['Time', formatDuration(selectedAttempt.time_spent_secs)],
                ].map(([label, val]) => (
                  <div key={label} style={{ background: '#f9fafb', borderRadius: 10, padding: '10px 14px', minWidth: 90 }}>
                    <div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>{label}</div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#111' }}>{val}</div>
                  </div>
                ))}
              </div>

              {selectedAttempt.teacher_feedback && (
                <div style={{ marginTop: 14, background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 10, padding: '12px 16px', fontSize: 13, color: '#0c4a6e', lineHeight: 1.6 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#0284c7', marginBottom: 4 }}>💬 Teacher feedback</div>
                  {selectedAttempt.teacher_feedback}
                </div>
              )}
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
              {(['overview', 'questions'] as const).map(t => (
                <button key={t} onClick={() => setView(t)}
                  style={{ padding: '7px 16px', borderRadius: 8, border: `1.5px solid ${view === t ? '#185FA5' : '#e5e7eb'}`, background: view === t ? '#185FA5' : '#fff', color: view === t ? '#fff' : '#555', fontSize: 13, fontWeight: 600, cursor: 'pointer', textTransform: 'capitalize' }}>
                  {t === 'overview' ? '📈 Přehled' : '❓ Otázky'}
                </button>
              ))}
            </div>

            {/* ── Overview tab ── */}
            {view === 'overview' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {/* Performance by question type */}
                {Object.keys(avgByType).length > 0 && (
                  <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, padding: '20px 24px' }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#444', marginBottom: 16 }}>Performance by question type</div>
                    {Object.entries(avgByType).map(([type, { sum, count }]) => {
                      const avg = sum / count
                      const color = avg >= 80 ? '#22c55e' : avg >= 50 ? '#f59e0b' : '#ef4444'
                      return (
                        <div key={type} style={{ marginBottom: 12 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 13 }}>
                            <span style={{ color: '#555' }}>{typeLabels[type] ?? type}</span>
                            <span style={{ fontWeight: 600, color }}>{Math.round(avg)}%</span>
                          </div>
                          <div style={{ background: '#f3f4f6', borderRadius: 4, height: 8 }}>
                            <div style={{ background: color, width: `${avg}%`, height: '100%', borderRadius: 4, transition: 'width .5s ease' }} />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}

                {/* Strongest/weakest questions */}
                {qStats.filter((s: any) => s.pts != null).length > 0 && (() => {
                  const scored = qStats.filter((s: any) => s.pts != null && s.pct != null).sort((a: any, b: any) => a.pct - b.pct)
                  const weakest = scored.slice(0, 3)
                  const strongest = scored.slice(-3).reverse()
                  return (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                      {[{ label: '⚠️ Potřebuje procvičit', items: weakest, bg: '#fff7f7', border: '#fecaca', text: '#991b1b' },
                        { label: '✨ Silné oblasti', items: strongest, bg: '#f0fdf4', border: '#bbf7d0', text: '#166534' }].map(({ label, items, bg, border, text }) => (
                        <div key={label} style={{ background: bg, border: `1px solid ${border}`, borderRadius: 12, padding: '16px 18px' }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: text, marginBottom: 10 }}>{label}</div>
                          {(items as any[]).map((s: any, i: number) => (
                            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 6, gap: 8 }}>
                              <span style={{ color: '#555', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', flex: 1 }}>
                                Q{s.q.position + 1}: <span dangerouslySetInnerHTML={{ __html: s.q.body_html.replace(/<[^>]*>/g, '').slice(0, 40) + '…' }} />
                              </span>
                              <span style={{ fontWeight: 600, color: text, flexShrink: 0 }}>{Math.round(s.pct)}%</span>
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  )
                })()}
              </div>
            )}

            {/* ── Questions tab ── */}
            {view === 'questions' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {qStats.length === 0 && (
                  <div style={{ textAlign: 'center', padding: 32, color: '#aaa', border: '1px dashed #e5e7eb', borderRadius: 12 }}>No question data available.</div>
                )}
                {qStats.map((s: any, i: number) => {
                  const graded = s.pts != null
                  const pct = s.pct
                  const color = !graded ? '#888' : pct >= 80 ? '#22c55e' : pct >= 50 ? '#f59e0b' : '#ef4444'
                  return (
                    <div key={i} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '16px 20px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                            <span style={{ fontSize: 11, fontWeight: 700, color: '#185FA5', background: '#E6F1FB', padding: '2px 8px', borderRadius: 20 }}>Q{s.q.position + 1}</span>
                            <span style={{ fontSize: 11, color: '#888', background: '#f3f4f6', padding: '2px 8px', borderRadius: 10 }}>{typeLabels[s.q.type] ?? s.q.type}</span>
                            {!graded && <span style={{ fontSize: 11, color: '#888' }}>⏳ Not yet graded</span>}
                          </div>
                          <div style={{ fontSize: 14, color: '#333', lineHeight: 1.5 }} dangerouslySetInnerHTML={{ __html: s.q.body_html.replace(/<[^>]*>/g, '').slice(0, 120) + (s.q.body_html.replace(/<[^>]*>/g, '').length > 120 ? '…' : '') }} />
                        </div>
                        {graded && (
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
                            <ScoreRing pct={pct} size={48} />
                            <div style={{ fontSize: 10, color: '#888', marginTop: 2 }}>{s.pts} / {s.max} pt{s.max !== 1 ? 's' : ''}</div>
                          </div>
                        )}
                      </div>
                      {s.ans.teacher_note && (
                        <div style={{ marginTop: 10, background: '#f3f0ff', border: '1px solid #ddd6fe', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#5b21b6' }}>
                          💬 {s.ans.teacher_note}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
