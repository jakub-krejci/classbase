'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

function ProgressRing({ pct, size = 52, color = '#185FA5' }: { pct: number; size?: number; color?: string }) {
  const r = (size - 6) / 2
  const circ = 2 * Math.PI * r
  const dash = (pct / 100) * circ
  const c = pct === 100 ? '#22c55e' : color
  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)', flexShrink: 0 }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#f3f4f6" strokeWidth={5} />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={c} strokeWidth={5}
        strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
        style={{ transition: 'stroke-dasharray .5s ease' }} />
      <text x={size/2} y={size/2} textAnchor="middle" dominantBaseline="central"
        style={{ transform: `rotate(90deg)`, transformOrigin: `${size/2}px ${size/2}px`,
          fill: c, fontSize: size * 0.22, fontWeight: 700, fontFamily: 'inherit' }}>
        {pct}%
      </text>
    </svg>
  )
}

function EnrollModal({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState<'code' | 'password'>('code')
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [pendingTitle, setPendingTitle] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const inp: React.CSSProperties = { width: '100%', padding: '10px 12px', border: '1px solid #e5e7eb', borderRadius: 9, fontSize: 13, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' as const }

  async function submit() {
    setLoading(true); setError('')
    try {
      const res = await fetch('/api/enroll', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ access_code: code.trim().toUpperCase(), password: step === 'password' ? password.trim() : undefined }),
      })
      const data = await res.json()
      if (!res.ok) {
        if (res.status === 403 && data.needsPassword) { setPendingTitle(data.moduleTitle); setStep('password'); setLoading(false); return }
        setError(data.error ?? 'Něco se pokazilo.'); setLoading(false); return
      }
      onClose(); window.location.reload()
    } catch { setError('Chyba sítě. Zkuste to znovu.'); setLoading(false) }
  }

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 9998, backdropFilter: 'blur(3px)' }} />
      <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', zIndex: 9999, width: '100%', maxWidth: 380, padding: '0 16px' }}>
        <div style={{ background: '#fff', borderRadius: 16, padding: '32px 28px', boxShadow: '0 24px 64px rgba(0,0,0,.2)' }}>
          {step === 'code' ? (
            <>
              <div style={{ fontSize: 36, textAlign: 'center', marginBottom: 12 }}>🔑</div>
              <h2 style={{ fontSize: 18, fontWeight: 700, textAlign: 'center', margin: '0 0 6px' }}>Přihlásit se do modulu</h2>
              <p style={{ fontSize: 13, color: '#888', textAlign: 'center', margin: '0 0 20px', lineHeight: 1.5 }}>Zadejte přístupový kód, který vám dal váš učitel</p>
              <input value={code} onChange={e => setCode(e.target.value.toUpperCase())}
                onKeyDown={e => e.key === 'Enter' && submit()} placeholder="např. PHY-2026" autoFocus
                style={{ ...inp, fontFamily: 'monospace', letterSpacing: '.12em', fontSize: 16, textAlign: 'center', marginBottom: 4 }} />
            </>
          ) : (
            <>
              <div style={{ fontSize: 36, textAlign: 'center', marginBottom: 12 }}>🔐</div>
              <h2 style={{ fontSize: 18, fontWeight: 700, textAlign: 'center', margin: '0 0 6px' }}>Heslo modulu</h2>
              <div style={{ background: '#f3f4f6', borderRadius: 8, padding: '8px 12px', marginBottom: 14, textAlign: 'center', fontSize: 13, fontWeight: 600, color: '#333' }}>📘 {pendingTitle}</div>
              <p style={{ fontSize: 13, color: '#888', textAlign: 'center', margin: '0 0 14px' }}>Tento modul vyžaduje heslo od učitele.</p>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && submit()} placeholder="Heslo pro zápis" autoFocus
                style={{ ...inp, marginBottom: 4 }} />
            </>
          )}
          {error && <div style={{ fontSize: 12, padding: '8px 11px', background: '#fef2f2', color: '#dc2626', borderRadius: 8, margin: '8px 0' }}>{error}</div>}
          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <button onClick={submit} disabled={loading || (step === 'code' && !code.trim()) || (step === 'password' && !password.trim())}
              style={{ flex: 1, padding: '11px', background: '#185FA5', color: '#fff', border: 'none', borderRadius: 9, fontSize: 14, fontWeight: 600, cursor: 'pointer', opacity: loading ? .6 : 1 }}>
              {loading ? '…' : step === 'code' ? 'Pokračovat' : 'Vstoupit do modulu'}
            </button>
            <button onClick={onClose} style={{ padding: '11px 16px', border: '1px solid #e5e7eb', borderRadius: 9, fontSize: 14, background: '#fff', cursor: 'pointer', color: '#555' }}>
              Zrušit
            </button>
          </div>
          {step === 'password' && (
            <button onClick={() => { setStep('code'); setPassword(''); setError('') }}
              style={{ width: '100%', marginTop: 10, padding: '7px', fontSize: 12, color: '#888', background: 'none', border: 'none', cursor: 'pointer' }}>
              ← Zkusit jiný kód
            </button>
          )}
        </div>
      </div>
    </>
  )
}

export default function StudentHome({ profile, enrollments, progressMap, messages: initMessages }: {
  profile: any; enrollments: any[]
  progressMap: Record<string, { done: number; total: number }>
  messages: any[]
}) {
  const supabase = createClient()
  const [messages, setMessages] = useState(initMessages)
  const [dismissed, setDismissed] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem('cb_dismissed_announcements') ?? '[]')) } catch { return new Set() }
  })
  const [showEnroll, setShowEnroll] = useState(false)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | 'inprogress' | 'completed'>('all')
  const accent = profile?.accent_color ?? '#185FA5'

  useEffect(() => {
    const ch = supabase.channel('student-home-ann')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, async (payload: any) => {
        const m = payload.new
        if (m.recipient_type !== 'all' || m.message_type !== 'announcement') return
        const { data: p } = await supabase.from('profiles').select('full_name').eq('id', m.sender_id).single()
        setMessages(prev => [{ ...m, sender_name: (p as any)?.full_name ?? 'Učitel' }, ...prev])
      }).subscribe()
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

  // Stats
  const totalLessons = Object.values(progressMap).reduce((a, p) => a + p.total, 0)
  const doneLessons  = Object.values(progressMap).reduce((a, p) => a + p.done, 0)
  const overallPct   = totalLessons > 0 ? Math.round(doneLessons / totalLessons * 100) : 0
  const completedModules = enrollments.filter(e => {
    const p = progressMap[e.module_id]; return p && p.total > 0 && p.done === p.total
  }).length

  // Filter + search
  const filtered = enrollments.filter(e => {
    const m = e.modules as any; if (!m) return false
    const p = progressMap[e.module_id] ?? { done: 0, total: 0 }
    const pct = p.total > 0 ? Math.round(p.done / p.total * 100) : 0
    if (filter === 'completed' && pct < 100) return false
    if (filter === 'inprogress' && (pct === 0 || pct === 100)) return false
    if (search && !m.title.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  return (
    <div style={{ maxWidth: 960, margin: '0 auto' }}>
      {showEnroll && <EnrollModal onClose={() => setShowEnroll(false)} />}

      {/* ── Announcements ── */}
      {visibleMessages.map(m => (
        <div key={m.id} style={{ background: '#E6F1FB', border: '1px solid #B5D4F4', borderRadius: 12, padding: '12px 16px', marginBottom: 12, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#0C447C', marginBottom: 3 }}>📢 Oznámení od učitele</div>
            <div style={{ fontSize: 13, color: '#0C447C', lineHeight: 1.55 }}>{m.body}</div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
            <a href="/student/inbox" style={{ fontSize: 11, color: '#185FA5', fontWeight: 600, textDecoration: 'none' }}>Zobrazit vše →</a>
            <button onClick={() => dismiss(m.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: '#7da8cc', lineHeight: 1 }}>✕</button>
          </div>
        </div>
      ))}

      {/* ── Header + stats strip ── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 4px', color: '#111' }}>Moje moduly</h1>
          <p style={{ fontSize: 13, color: '#888', margin: 0 }}>
            {enrollments.length} modulů zapsáno · {doneLessons}/{totalLessons} lekcí dokončeno
          </p>
        </div>
        <button onClick={() => setShowEnroll(true)}
          style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '10px 18px', background: accent, color: '#fff', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer', flexShrink: 0 }}>
          <span style={{ fontSize: 16 }}>+</span> Přihlásit se do modulu
        </button>
      </div>

      {/* ── Overall progress bar ── */}
      {totalLessons > 0 && (
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, padding: '16px 20px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#111' }}>Celkový pokrok</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: accent }}>{overallPct}%</span>
            </div>
            <div style={{ height: 8, background: '#f3f4f6', borderRadius: 10, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${overallPct}%`, background: accent, borderRadius: 10, transition: 'width .5s ease' }} />
            </div>
            <div style={{ display: 'flex', gap: 20, marginTop: 10, fontSize: 12, color: '#888' }}>
              <span>✅ {doneLessons} lekcí splněno</span>
              <span>🏆 {completedModules} modulů dokončeno</span>
              <span>📚 {enrollments.length} modulů celkem</span>
            </div>
          </div>
        </div>
      )}

      {/* ── Search + filter ── */}
      {enrollments.length > 0 && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: '1 1 200px' }}>
            <svg style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#bbb' }} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
            </svg>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Hledat moduly…"
              style={{ width: '100%', padding: '8px 12px 8px 30px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' as const }} />
          </div>
          <div style={{ display: 'flex', gap: 4, background: '#f3f4f6', borderRadius: 9, padding: 3 }}>
            {([['all', 'Vše'], ['inprogress', 'Probíhá'], ['completed', 'Dokončeno']] as const).map(([val, label]) => (
              <button key={val} onClick={() => setFilter(val)}
                style={{ padding: '6px 14px', borderRadius: 7, border: 'none', fontSize: 12, fontWeight: 500, cursor: 'pointer', background: filter === val ? '#fff' : 'transparent', color: filter === val ? '#111' : '#666', boxShadow: filter === val ? '0 1px 3px rgba(0,0,0,.08)' : 'none', transition: 'all .15s' }}>
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Empty states ── */}
      {enrollments.length === 0 && (
        <div style={{ textAlign: 'center', padding: '64px 20px', border: '2px dashed #e5e7eb', borderRadius: 16 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>📚</div>
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 8px', color: '#111' }}>Zatím nejste zapsáni v žádném modulu</h2>
          <p style={{ fontSize: 14, color: '#888', margin: '0 0 24px', lineHeight: 1.6 }}>Požádejte svého učitele o přístupový kód a přihlaste se do modulu.</p>
          <button onClick={() => setShowEnroll(true)}
            style={{ padding: '11px 24px', background: accent, color: '#fff', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
            + Přihlásit se do modulu
          </button>
        </div>
      )}

      {enrollments.length > 0 && filtered.length === 0 && (
        <div style={{ textAlign: 'center', padding: '40px 20px', color: '#aaa', border: '1px dashed #e5e7eb', borderRadius: 12 }}>
          Žádné moduly neodpovídají hledání.
        </div>
      )}

      {/* ── Module cards grid ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
        {filtered.map((e: any) => {
          const m = e.modules as any
          if (!m) return null
          const p = progressMap[e.module_id] ?? { done: 0, total: 0 }
          const pct = p.total > 0 ? Math.round(p.done / p.total * 100) : 0
          const lessonCount = (m.lessons ?? []).length
          const assignmentCount = (m.assignments ?? []).length
          const isComplete = pct === 100 && p.total > 0
          const isStarted = pct > 0 && pct < 100

          return (
            <a key={e.module_id} href={`/student/modules/${e.module_id}`}
              style={{ display: 'flex', flexDirection: 'column', background: '#fff', border: `1px solid ${isComplete ? '#86efac' : '#e5e7eb'}`, borderRadius: 14, overflow: 'hidden', textDecoration: 'none', color: 'inherit', boxShadow: '0 1px 6px rgba(0,0,0,.04)', transition: 'box-shadow .15s, transform .15s' }}
              onMouseEnter={ev => { (ev.currentTarget as HTMLElement).style.boxShadow = '0 4px 20px rgba(0,0,0,.1)'; (ev.currentTarget as HTMLElement).style.transform = 'translateY(-2px)' }}
              onMouseLeave={ev => { (ev.currentTarget as HTMLElement).style.boxShadow = '0 1px 6px rgba(0,0,0,.04)'; (ev.currentTarget as HTMLElement).style.transform = 'none' }}>

              {/* Color bar + progress */}
              <div style={{ height: 5, background: isComplete ? '#22c55e' : isStarted ? accent : '#e5e7eb' }} />

              <div style={{ padding: '18px 18px 14px', flex: 1, display: 'flex', flexDirection: 'column' }}>
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 12 }}>
                  <ProgressRing pct={pct} size={48} color={accent} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#111', lineHeight: 1.3, marginBottom: 4, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as any }}>
                      {m.title}
                    </div>
                    {isComplete && <span style={{ fontSize: 10, fontWeight: 700, color: '#16a34a', background: '#dcfce7', padding: '2px 7px', borderRadius: 20 }}>🏆 Dokončeno</span>}
                    {isStarted && <span style={{ fontSize: 10, fontWeight: 700, color: accent, background: accent + '15', padding: '2px 7px', borderRadius: 20 }}>▶ Probíhá</span>}
                    {!isStarted && !isComplete && <span style={{ fontSize: 10, fontWeight: 600, color: '#aaa', background: '#f3f4f6', padding: '2px 7px', borderRadius: 20 }}>Nezahájeno</span>}
                  </div>
                </div>

                {/* Description */}
                {m.description && (
                  <div style={{ fontSize: 12, color: '#888', lineHeight: 1.5, marginBottom: 12, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as any }}>
                    {m.description}
                  </div>
                )}

                {/* Stats row */}
                <div style={{ display: 'flex', gap: 12, fontSize: 11, color: '#aaa', marginTop: 'auto', paddingTop: 10, borderTop: '1px solid #f9fafb' }}>
                  <span>📖 {p.done}/{p.total} lekcí</span>
                  {assignmentCount > 0 && <span>📝 {assignmentCount} úkol{assignmentCount > 1 ? 'ů' : ''}</span>}
                  {m.tag && <span style={{ marginLeft: 'auto', padding: '1px 7px', background: '#f3f4f6', borderRadius: 20, color: '#666' }}>{m.tag}</span>}
                </div>
              </div>

              {/* Progress bar at bottom */}
              <div style={{ height: 4, background: '#f3f4f6' }}>
                <div style={{ height: '100%', width: `${pct}%`, background: isComplete ? '#22c55e' : accent, transition: 'width .5s ease' }} />
              </div>
            </a>
          )
        })}
      </div>
    </div>
  )
}
