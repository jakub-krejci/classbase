'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { DarkLayout, D, card, SectionLabel, ProgressBar } from '@/components/DarkLayout'

function studyTime(total: number) {
  const m = total * 3; return m < 60 ? `${m} min` : `${Math.round(m/60)} h`
}

function EnrollModal({ accent, onClose }: { accent: string; onClose: () => void }) {
  const [step, setStep]     = useState<'code'|'password'>('code')
  const [code, setCode]     = useState('')
  const [pass, setPass]     = useState('')
  const [title, setTitle]   = useState('')
  const [error, setError]   = useState('')
  const [loading, setLoading] = useState(false)
  const inp: React.CSSProperties = { width: '100%', padding: '11px 14px', background: D.bgMid, border: `1px solid ${D.border}`, borderRadius: 10, fontSize: 16, color: D.txtPri, fontFamily: 'monospace', textAlign: 'center', letterSpacing: '.1em', outline: 'none' }

  async function submit() {
    setLoading(true); setError('')
    try {
      const res = await fetch('/api/enroll', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ access_code: code.trim().toUpperCase(), password: step === 'password' ? pass.trim() : undefined }) })
      const data = await res.json()
      if (!res.ok) {
        if (res.status === 403 && data.needsPassword) { setTitle(data.moduleTitle); setStep('password'); setLoading(false); return }
        setError(data.error ?? 'Chyba'); setLoading(false); return
      }
      onClose(); window.location.reload()
    } catch { setError('Chyba sítě'); setLoading(false) }
  }

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)', zIndex: 9998, backdropFilter: 'blur(4px)' }} />
      <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', zIndex: 9999, width: '100%', maxWidth: 380, padding: '0 16px' }}>
        <div style={{ background: D.bgCard, borderRadius: D.radius, padding: '32px 28px', border: `1px solid ${D.border}`, boxShadow: `0 0 60px ${accent}25` }}>
          <div style={{ fontSize: 36, textAlign: 'center', marginBottom: 12 }}>🔑</div>
          <h2 style={{ fontSize: 18, fontWeight: 700, textAlign: 'center', color: D.txtPri, marginBottom: 6 }}>{step === 'code' ? 'Přihlásit se do modulu' : 'Heslo modulu'}</h2>
          {step === 'password' && <div style={{ background: D.bgMid, borderRadius: 8, padding: '8px 12px', marginBottom: 12, textAlign: 'center', fontSize: 13, color: D.txtPri, fontWeight: 600 }}>📘 {title}</div>}
          <p style={{ fontSize: 13, color: D.txtSec, textAlign: 'center', marginBottom: 20 }}>{step === 'code' ? 'Zadejte přístupový kód od učitele' : 'Tento modul vyžaduje heslo'}</p>
          <input value={step === 'code' ? code : pass} onChange={e => step === 'code' ? setCode(e.target.value.toUpperCase()) : setPass(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && submit()}
            type={step === 'password' ? 'password' : 'text'} placeholder={step === 'code' ? 'např. MAT-2026' : 'Heslo pro zápis'} autoFocus
            style={{ ...inp, marginBottom: 8 }} />
          {error && <div style={{ fontSize: 12, color: D.danger, marginBottom: 8, textAlign: 'center' }}>{error}</div>}
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button onClick={submit} disabled={loading} style={{ flex: 1, padding: '11px', background: accent, color: '#fff', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', opacity: loading ? .6 : 1 }}>
              {loading ? '…' : step === 'code' ? 'Pokračovat' : 'Vstoupit'}
            </button>
            <button onClick={onClose} style={{ padding: '11px 14px', background: D.bgMid, color: D.txtSec, border: `1px solid ${D.border}`, borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit' }}>Zrušit</button>
          </div>
        </div>
      </div>
    </>
  )
}

export default function DarkModulesClient({ profile, enrollments, progressMap, messages: initMessages }: {
  profile: any; enrollments: any[]
  progressMap: Record<string, { done: number; total: number }>
  messages: any[]
}) {
  const supabase = createClient()
  const [messages, setMessages] = useState(initMessages)
  const [dismissed, setDismissed] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem('cb_dismissed_ann') ?? '[]')) } catch { return new Set() }
  })
  const [enrollOpen, setEnrollOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all'|'inprogress'|'completed'>('all')
  const accent = profile?.accent_color ?? '#7C3AED'

  useEffect(() => {
    const ch = supabase.channel('dark-mods')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, async (payload: any) => {
        const m = payload.new
        if (m.recipient_type !== 'all') return
        const { data: p } = await supabase.from('profiles').select('full_name').eq('id', m.sender_id).single()
        setMessages(prev => [{ ...m, sender_name: (p as any)?.full_name ?? 'Učitel' }, ...prev])
      }).subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [])

  function dismiss(id: string) {
    setDismissed(prev => {
      const next = new Set(prev).add(id)
      try { localStorage.setItem('cb_dismissed_ann', JSON.stringify([...next])) } catch {}
      return next
    })
  }

  const visible = messages.filter(m => !dismissed.has(m.id))
  const totalLessons = Object.values(progressMap).reduce((a, p) => a + p.total, 0)
  const doneLessons  = Object.values(progressMap).reduce((a, p) => a + p.done, 0)
  const overallPct   = totalLessons > 0 ? Math.round(doneLessons / totalLessons * 100) : 0
  const completedMods = enrollments.filter(e => { const p = progressMap[e.module_id]; return p && p.total > 0 && p.done === p.total }).length

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
    <DarkLayout profile={profile} activeRoute="/student/modules" wide>
      {enrollOpen && <EnrollModal accent={accent} onClose={() => setEnrollOpen(false)} />}

      {/* Announcements */}
      {visible.map(m => (
        <div key={m.id} style={{ background: 'rgba(124,58,237,.1)', border: '1px solid rgba(124,58,237,.2)', borderRadius: 12, padding: '12px 16px', marginBottom: 14, display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <span style={{ fontSize: 16 }}>📢</span>
          <div style={{ flex: 1, fontSize: 13, color: D.txtSec, lineHeight: 1.5 }}>{m.body}</div>
          <button onClick={() => dismiss(m.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: D.txtSec, fontSize: 16 }}>✕</button>
        </div>
      ))}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: D.txtPri, margin: '0 0 4px' }}>Moje moduly</h1>
          <p style={{ fontSize: 13, color: D.txtSec, margin: 0 }}>{enrollments.length} modulů · {doneLessons}/{totalLessons} lekcí dokončeno</p>
        </div>
        <button onClick={() => setEnrollOpen(true)}
          style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '10px 18px', background: accent, color: '#fff', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}>
          + Přihlásit se do modulu
        </button>
      </div>

      {/* Overall progress */}
      {totalLessons > 0 && (
        <div style={{ ...card({ padding: '16px 20px', marginBottom: 20 }), display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: D.txtPri }}>Celkový pokrok</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: accent }}>{overallPct}%</span>
            </div>
            <ProgressBar pct={overallPct} color={accent} height={8} />
            <div style={{ display: 'flex', gap: 20, marginTop: 10, fontSize: 12, color: D.txtSec }}>
              <span>✅ {doneLessons} lekcí splněno</span>
              <span>🏆 {completedMods} modulů dokončeno</span>
              <span>📚 {enrollments.length} modulů celkem</span>
            </div>
          </div>
        </div>
      )}

      {/* Search + filter */}
      {enrollments.length > 0 && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: '1 1 200px' }}>
            <svg style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: D.txtSec }} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
            </svg>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Hledat moduly…"
              style={{ width: '100%', padding: '8px 12px 8px 30px', background: D.bgCard, border: `1px solid ${D.border}`, borderRadius: 8, fontSize: 13, color: D.txtPri, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' as const }} />
          </div>
          <div style={{ display: 'flex', gap: 3, background: D.bgCard, borderRadius: 9, padding: 3, border: `1px solid ${D.border}` }}>
            {([['all','Vše'],['inprogress','Probíhá'],['completed','Dokončeno']] as const).map(([val, label]) => (
              <button key={val} onClick={() => setFilter(val)}
                style={{ padding: '6px 14px', borderRadius: 7, border: 'none', fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', background: filter === val ? D.bgMid : 'transparent', color: filter === val ? D.txtPri : D.txtSec, transition: 'all .15s' }}>
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Empty states */}
      {enrollments.length === 0 && (
        <div style={{ ...card({ padding: '64px 20px', textAlign: 'center' }) }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>📚</div>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: D.txtPri, margin: '0 0 8px' }}>Zatím nejsi zapsán v žádném modulu</h2>
          <p style={{ fontSize: 14, color: D.txtSec, margin: '0 0 24px' }}>Požádej učitele o přístupový kód.</p>
          <button onClick={() => setEnrollOpen(true)} style={{ padding: '11px 24px', background: accent, color: '#fff', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>+ Přihlásit se do modulu</button>
        </div>
      )}
      {enrollments.length > 0 && filtered.length === 0 && (
        <div style={{ ...card({ padding: '40px', textAlign: 'center' }), color: D.txtSec, fontSize: 13 }}>Žádné moduly neodpovídají.</div>
      )}

      {/* Module cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(270px, 1fr))', gap: 16 }}>
        {filtered.map((e: any) => {
          const m = e.modules as any; if (!m) return null
          const p = progressMap[e.module_id] ?? { done: 0, total: 0 }
          const pct = p.total > 0 ? Math.round(p.done / p.total * 100) : 0
          const isComplete = pct === 100 && p.total > 0
          const isStarted  = pct > 0 && pct < 100
          const barColor = isComplete ? D.success : accent
          const stLabel  = isComplete ? { label: 'Dokončeno', bg: D.success + '20', color: D.success }
                         : isStarted  ? { label: 'Probíhá',   bg: D.warning + '20', color: D.warning }
                         :               { label: 'Začít',     bg: accent + '20',    color: accent }

          return (
            <a key={e.module_id} href={`/student/modules/${e.module_id}`}
              style={{ ...card({ textDecoration: 'none', display: 'flex', flexDirection: 'column', overflow: 'hidden', cursor: 'pointer' }), transition: 'transform .15s, box-shadow .15s' }}
              onMouseEnter={ev => { (ev.currentTarget as HTMLElement).style.transform = 'translateY(-3px)'; (ev.currentTarget as HTMLElement).style.boxShadow = `0 8px 30px rgba(0,0,0,.4)` }}
              onMouseLeave={ev => { (ev.currentTarget as HTMLElement).style.transform = 'none'; (ev.currentTarget as HTMLElement).style.boxShadow = 'none' }}>
              {/* Image area */}
              <div style={{ height: 130, background: `linear-gradient(135deg, ${accent}20 0%, rgba(255,255,255,.02) 100%)`, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ position: 'absolute', top: 10, left: 10, padding: '3px 9px', borderRadius: 20, background: stLabel.bg, color: stLabel.color, fontSize: 10, fontWeight: 700 }}>{stLabel.label}</div>
                <div style={{ position: 'absolute', top: 10, right: 10, fontSize: 10, color: D.txtSec, background: 'rgba(0,0,0,.4)', padding: '2px 7px', borderRadius: 20 }}>{p.total} lekcí</div>
                <div style={{ fontSize: 48, opacity: .7 }}>📚</div>
                <div style={{ position: 'absolute', bottom: 8, right: 10, fontSize: 10, color: D.txtSec, background: 'rgba(0,0,0,.4)', padding: '2px 7px', borderRadius: 20 }}>⏱ {studyTime(p.total)}</div>
              </div>
              {/* Info */}
              <div style={{ padding: '14px 16px 16px', flex: 1, display: 'flex', flexDirection: 'column' }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: D.txtPri, marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.title}</div>
                {m.description && <div style={{ fontSize: 12, color: D.txtSec, marginBottom: 10, lineHeight: 1.5, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as any }}>{m.description}</div>}
                <div style={{ marginTop: 'auto' }}>
                  <ProgressBar pct={pct} color={barColor} height={4} />
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 11, color: D.txtSec }}>
                    <span>{p.done}/{p.total} dokončeno</span>
                    <span style={{ color: barColor, fontWeight: 600 }}>{pct}%</span>
                  </div>
                </div>
              </div>
              {/* Bottom accent line */}
              <div style={{ height: 3, background: barColor }} />
            </a>
          )
        })}
      </div>
    </DarkLayout>
  )
}
