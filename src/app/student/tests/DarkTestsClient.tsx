'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from 'react'
import { DarkLayout, D, card, SectionLabel } from '@/components/DarkLayout'

const STATUS_CFG: Record<string, { label: string; bg: string; color: string }> = {
  available:   { label: 'Dostupný',    bg: 'rgba(124,58,237,.2)',  color: 'var(--accent)' },
  in_progress: { label: 'Probíhá',     bg: 'rgba(251,191,36,.15)', color: '#FBBF24' },
  submitted:   { label: 'Odevzdáno',   bg: 'rgba(34,197,94,.15)',  color: '#22C55E' },
  timed_out:   { label: 'Čas vypršel', bg: 'rgba(239,68,68,.12)',  color: '#EF4444' },
  locked:      { label: 'Zamčeno',     bg: 'rgba(239,68,68,.12)',  color: '#EF4444' },
  expired:     { label: 'Prošlé',      bg: 'rgba(255,255,255,.06)',color: D.txtSec },
  upcoming:    { label: 'Nadcházející',bg: 'rgba(99,102,241,.15)', color: '#818CF8' },
}

export default function DarkTestsClient({ profile, tests, attempts, studentId: _ }: {
  profile: any; tests: any[]; attempts: any[]; studentId: string
}) {
  const accent = profile?.accent_color ?? '#7C3AED'
  const [hidden, setHidden] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem('hidden_tests') ?? '[]')) } catch { return new Set() }
  })
  const [showHidden, setShowHidden] = useState(false)
  const [filter, setFilter] = useState<'all'|'available'|'done'>('all')

  function toggleHide(id: string) {
    setHidden(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      try { localStorage.setItem('hidden_tests', JSON.stringify([...next])) } catch {}
      return next
    })
  }

  function getAttempts(testId: string) { return attempts.filter(a => a.test_id === testId) }
  function getActive(testId: string) { return getAttempts(testId).find(a => a.status === 'in_progress') ?? null }
  function getLatest(testId: string) {
    return getAttempts(testId).filter(a => ['submitted','timed_out','locked'].includes(a.status))
      .sort((a, b) => new Date(b.submitted_at ?? b.started_at).getTime() - new Date(a.submitted_at ?? a.started_at).getTime())[0] ?? null
  }
  function canRetake(t: any) {
    const mode = t.retake_mode ?? 'single'
    if (mode === 'practice') return true
    const done = getAttempts(t.id).filter(a => ['submitted','timed_out','locked'].includes(a.status)).length
    return mode === 'best' && (t.max_attempts == null || done < t.max_attempts)
  }
  function getStatus(t: any) {
    const now = new Date()
    if (t.available_until && new Date(t.available_until) < now) return 'expired'
    if (t.available_from && new Date(t.available_from) > now) return 'upcoming'
    if (getActive(t.id)) return 'in_progress'
    const done = getAttempts(t.id).filter(a => ['submitted','timed_out','locked'].includes(a.status))
    if (done.length === 0) return 'available'
    return done[0]?.status ?? 'submitted'
  }

  const visible = tests.filter(t => showHidden ? hidden.has(t.id) : !hidden.has(t.id))
  const filtered = visible.filter(t => {
    const st = getStatus(t)
    if (filter === 'available') return ['available','in_progress','upcoming'].includes(st)
    if (filter === 'done') return ['submitted','timed_out','expired'].includes(st)
    return true
  })
  const hiddenCount = [...hidden].filter(id => tests.some(t => t.id === id)).length

  const availableCount = tests.filter(t => ['available','in_progress'].includes(getStatus(t))).length
  const doneCount      = tests.filter(t => ['submitted','timed_out'].includes(getStatus(t))).length

  return (
    <DarkLayout profile={profile} activeRoute="/student/tests">

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: D.txtPri, margin: '0 0 4px' }}>Moje testy</h1>
          <p style={{ fontSize: 13, color: D.txtSec, margin: 0 }}>Testy přiřazené tvými učiteli</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {hiddenCount > 0 && (
            <button onClick={() => setShowHidden(v => !v)}
              style={{ padding: '8px 14px', background: showHidden ? accent : D.bgCard, color: showHidden ? '#fff' : D.txtSec, border: `1px solid ${D.border}`, borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}>
              {showHidden ? '← Zpět' : `📦 Archiv (${hiddenCount})`}
            </button>
          )}
          <a href="/student/tests/history"
            style={{ padding: '8px 16px', background: D.bgCard, color: D.txtSec, border: `1px solid ${D.border}`, borderRadius: 8, textDecoration: 'none', fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap' }}>
            📊 Historie
          </a>
        </div>
      </div>

      {/* Stat strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
        {[
          { icon: '🧪', label: 'Celkem testů',  val: tests.length,   color: accent },
          { icon: '▶',  label: 'Dostupné',       val: availableCount, color: D.warning },
          { icon: '✅', label: 'Odevzdáno',      val: doneCount,      color: D.success },
        ].map(({ icon, label, val, color }) => (
          <div key={label} style={card({ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 })}>
            <div style={{ width: 38, height: 38, borderRadius: 10, background: color + '20', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>{icon}</div>
            <div>
              <div style={{ fontSize: 22, fontWeight: 800, color, lineHeight: 1.1 }}>{val}</div>
              <div style={{ fontSize: 11, color: D.txtSec }}>{label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Filter tabs */}
      {tests.length > 0 && (
        <div style={{ display: 'flex', gap: 3, background: D.bgCard, borderRadius: 9, padding: 3, border: `1px solid ${D.border}`, width: 'fit-content', marginBottom: 20 }}>
          {([['all','Vše'],['available','Dostupné'],['done','Dokončené']] as const).map(([val, label]) => (
            <button key={val} onClick={() => setFilter(val)}
              style={{ padding: '6px 16px', borderRadius: 7, border: 'none', fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', background: filter === val ? D.bgMid : 'transparent', color: filter === val ? D.txtPri : D.txtSec, transition: 'all .15s' }}>
              {label}
            </button>
          ))}
        </div>
      )}

      {/* Empty states */}
      {tests.length === 0 && (
        <div style={{ ...card({ padding: '64px 20px', textAlign: 'center' }) }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🧪</div>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: D.txtPri, margin: '0 0 8px' }}>Zatím nemáš žádné testy</h2>
          <p style={{ fontSize: 13, color: D.txtSec, margin: 0 }}>Učitel ti přiřadí testy, jakmile budou připraveny.</p>
        </div>
      )}
      {tests.length > 0 && filtered.length === 0 && (
        <div style={{ ...card({ padding: '32px', textAlign: 'center' }), color: D.txtSec, fontSize: 13 }}>Žádné testy neodpovídají filtru.</div>
      )}

      {/* Test cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
        {filtered.map(t => {
          const st      = getStatus(t)
          const si      = STATUS_CFG[st] ?? STATUS_CFG.available
          const latest  = getLatest(t.id)
          const canStart = st === 'available' || st === 'in_progress'
          const canRetakeNow = !canStart && (st === 'submitted' || st === 'timed_out') && canRetake(t)
          const retakeMode = t.retake_mode ?? 'single'
          const doneCount2 = getAttempts(t.id).filter((a: any) => ['submitted','timed_out','locked'].includes(a.status)).length
          const isHidden = hidden.has(t.id)

          return (
            <div key={t.id} style={{ ...card({ display: 'flex', flexDirection: 'column', gap: 0, overflow: 'hidden', opacity: isHidden ? .7 : 1 }) }}>
              {/* Top color bar */}
              <div style={{ height: 3, background: si.color }} />

              <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }}>
                {/* Title row */}
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 15, color: D.txtPri, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 2 }}>{t.title}</div>
                    {t.category && <div style={{ fontSize: 11, color: D.txtSec }}>{t.category}</div>}
                  </div>
                  <div style={{ display: 'flex', gap: 5, alignItems: 'center', flexShrink: 0 }}>
                    <span style={{ padding: '2px 8px', borderRadius: 20, fontSize: 10, fontWeight: 700, background: si.bg, color: si.color }}>{si.label}</span>
                    <button onClick={() => toggleHide(t.id)} title={isHidden ? 'Obnovit' : 'Archivovat'}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: D.txtSec, padding: '1px 3px' }}>
                      {isHidden ? '↩' : '📦'}
                    </button>
                  </div>
                </div>

                {t.description && <div style={{ fontSize: 12, color: D.txtSec, lineHeight: 1.5 }}>{t.description}</div>}

                {/* Meta */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11, color: D.txtSec }}>
                  {t.time_limit_mins && <span>⏱ {t.time_limit_mins} min</span>}
                  {retakeMode === 'best' && <span>🔁 Nejlepší z {t.max_attempts ?? '∞'} · {doneCount2} použito</span>}
                  {retakeMode === 'practice' && <span style={{ color: D.success }}>📖 Procvičovací režim</span>}
                  {t.available_until && <span>Uzavírá: {new Date(t.available_until).toLocaleString('cs-CZ', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>}
                </div>

                {/* Actions */}
                {canStart && (
                  <a href={`/student/tests/${t.id}`}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '10px', background: st === 'in_progress' ? D.warning + '20' : accent, color: st === 'in_progress' ? D.warning : '#fff', borderRadius: 9, textDecoration: 'none', fontSize: 13, fontWeight: 700, marginTop: 'auto' }}>
                    {st === 'in_progress' ? '▶ Pokračovat' : '▶ Spustit test'}
                  </a>
                )}

                {(st === 'submitted' || st === 'timed_out') && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 'auto' }}>
                    {st === 'submitted' && retakeMode !== 'practice' && (
                      <div style={{ fontSize: 12, padding: '7px 12px', background: latest?.reviewed_at ? 'rgba(34,197,94,.12)' : D.bgMid, color: latest?.reviewed_at ? D.success : D.txtSec, borderRadius: 8, textAlign: 'center', fontWeight: 500, border: `1px solid ${latest?.reviewed_at ? 'rgba(34,197,94,.2)' : D.border}` }}>
                        {latest?.reviewed_at ? `✓ Ohodnoceno — ${latest.final_score ?? latest.score ?? '?'} / ${latest.max_score ?? '?'} bodů` : '⏳ Zatím neohodnoceno'}
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: 7 }}>
                      <div style={{ flex: canRetakeNow ? 0 : 1, padding: '9px 12px', background: si.bg, color: si.color, textAlign: 'center', borderRadius: 8, fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' }}>
                        {st === 'timed_out' ? '⏰ Čas vypršel' : '✓ Odevzdáno'}
                      </div>
                      <a href={`/student/tests/${t.id}`}
                        style={{ padding: '9px 12px', background: D.bgMid, color: D.txtSec, textAlign: 'center', borderRadius: 8, fontSize: 12, fontWeight: 500, textDecoration: 'none', border: `1px solid ${D.border}`, whiteSpace: 'nowrap' }}>
                        👁 Odpovědi
                      </a>
                      {canRetakeNow && (
                        <a href={`/student/tests/${t.id}?retake=1`}
                          style={{ flex: 1, padding: '9px 0', background: accent, color: '#fff', textAlign: 'center', borderRadius: 8, textDecoration: 'none', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' }}>
                          🔁 Znovu
                        </a>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </DarkLayout>
  )
}
