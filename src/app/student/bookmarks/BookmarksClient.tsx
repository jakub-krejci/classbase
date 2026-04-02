'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { DarkLayout, D, card, SectionLabel } from '@/components/DarkLayout'

// ── Types ──────────────────────────────────────────────────────────────────────
interface NormalizedBookmark {
  lesson_id: string
  updated_at: string
  lesson: { id: string; title: string; content?: string; module_id: string; position: number }
  module: { id: string; title: string; tag?: string; color?: string }
}
type Bookmark = NormalizedBookmark  // alias

function normalize(b: any): NormalizedBookmark | null {
  const lesson = Array.isArray(b.lessons) ? b.lessons[0] : b.lessons
  if (!lesson) return null
  const mod = Array.isArray(lesson.modules) ? lesson.modules[0] : lesson.modules
  if (!mod) return null
  return { lesson_id: b.lesson_id, updated_at: b.updated_at, lesson, module: mod }
}

function fmtDate(iso: string) {
  if (!iso) return ''
  const d = new Date(iso)
  const now = new Date()
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000)
  if (diffDays === 0) return 'Dnes'
  if (diffDays === 1) return 'Včera'
  if (diffDays < 7) return `Před ${diffDays} dny`
  return d.toLocaleDateString('cs-CZ', { day: 'numeric', month: 'short' })
}

function excerpt(content?: string, maxLen = 90): string {
  if (!content) return ''
  const text = content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  return text.length > maxLen ? text.slice(0, maxLen) + '…' : text
}

function tagColor(tag?: string): string {
  const map: Record<string, string> = {
    math: '#6366F1', programming: '#3B82F6', science: '#10B981',
    language: '#F59E0B', history: '#EF4444', art: '#EC4899',
    default: '#8B5CF6',
  }
  return map[tag?.toLowerCase() ?? ''] ?? map.default
}

export default function BookmarksClient({ profile, bookmarks: initial }: { profile: any; bookmarks: Bookmark[] }) {
  const supabase = createClient()
  const accent   = profile?.accent_color ?? '#7C3AED'

  const [bookmarks, setBookmarks]   = useState<NormalizedBookmark[]>((initial as any[]).map(normalize).filter(Boolean) as NormalizedBookmark[])
  const [removing, setRemoving]     = useState<Set<string>>(new Set())
  const [search, setSearch]         = useState('')
  const [filterModule, setFilterModule] = useState<string>('all')
  const [msg, setMsg]               = useState('')

  function flash(m: string) { setMsg(m); setTimeout(() => setMsg(''), 2500) }

  // Remove bookmark
  async function removeBookmark(lessonId: string) {
    setRemoving(prev => new Set([...prev, lessonId]))
    const { error } = await supabase
      .from('lesson_progress')
      .update({ status: 'not_started' })
      .eq('student_id', profile.id)
      .eq('lesson_id', lessonId)
    if (error) { flash('❌ Chyba při odebírání záložky'); setRemoving(prev => { const n = new Set(prev); n.delete(lessonId); return n }); return }
    setBookmarks(prev => prev.filter(b => b.lesson_id !== lessonId))
    setRemoving(prev => { const n = new Set(prev); n.delete(lessonId); return n })
    flash('✓ Záložka odebrána')
  }

  // Unique modules for filter
  const modules = useMemo(() => {
    const map = new Map<string, string>()
    bookmarks.forEach(b => map.set(b.module.id, b.module.title))
    return [...map.entries()]
  }, [bookmarks])

  // Filtered & searched bookmarks
  const filtered = useMemo(() => {
    let items = [...bookmarks]
    if (filterModule !== 'all') items = items.filter(b => b.module.id === filterModule)
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      items = items.filter(b => b.lesson.title.toLowerCase().includes(q) || b.module.title.toLowerCase().includes(q))
    }
    return items
  }, [bookmarks, filterModule, search])

  // Group by module
  const grouped = useMemo(() => {
    const map = new Map<string, { module: { id: string; title: string; tag?: string; color?: string }; items: NormalizedBookmark[] }>()
    filtered.forEach(b => {
      if (!map.has(b.module.id)) map.set(b.module.id, { module: b.module, items: [] })
      map.get(b.module.id)!.items.push(b)
    })
    return [...map.values()]
  }, [filtered])

  const hasAny = bookmarks.length > 0

  return (
    <DarkLayout profile={profile} activeRoute="/student/bookmarks">

      <style>{`
        .bm-card { transition: border-color .15s, background .15s; }
        .bm-card:hover { border-color: rgba(255,255,255,.14) !important; background: rgba(255,255,255,.03) !important; }
        .bm-card:hover .bm-remove { opacity: 1 !important; }
        .bm-chip { transition: all .15s; cursor: pointer; }
        .bm-chip:hover { opacity: .85; }
      `}</style>

      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20, flexWrap: 'wrap' }}>
        <div style={{ width: 40, height: 40, borderRadius: 11, background: D.warning + '18', border: `1px solid ${D.warning}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>🔖</div>
        <div>
          <h1 style={{ fontSize: 19, fontWeight: 800, color: D.txtPri, margin: '0 0 2px' }}>Záložky</h1>
          <p style={{ fontSize: 11, color: D.txtSec, margin: 0 }}>Lekce uložené pro pozdější čtení</p>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          {msg && <span style={{ fontSize: 12, color: msg.startsWith('❌') ? D.danger : D.success, fontWeight: 600 }}>{msg}</span>}
          {hasAny && (
            <span style={{ fontSize: 12, padding: '4px 12px', background: D.warning + '18', color: D.warning, borderRadius: 20, fontWeight: 600, border: `1px solid ${D.warning}30` }}>
              {bookmarks.length} {bookmarks.length === 1 ? 'záložka' : bookmarks.length < 5 ? 'záložky' : 'záložek'}
            </span>
          )}
        </div>
      </div>

      {!hasAny ? (
        /* ── Empty state ── */
        <div style={{ ...card({ padding: '60px 24px', textAlign: 'center' as const }) }}>
          <div style={{ fontSize: 52, marginBottom: 16, filter: 'grayscale(.4)', opacity: .7 }}>🔖</div>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: D.txtPri, marginBottom: 8 }}>Zatím žádné záložky</h2>
          <p style={{ fontSize: 13, color: D.txtSec, maxWidth: 340, margin: '0 auto 24px', lineHeight: 1.6 }}>
            Při čtení lekce klikni na tlačítko <strong style={{ color: D.warning }}>🔖 Uložit na později</strong> a lekce se zobrazí zde.
          </p>
          <a href="/student/modules" style={{ display: 'inline-block', padding: '10px 24px', background: accent, color: '#fff', borderRadius: 10, textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>
            Procházet moduly →
          </a>
        </div>
      ) : (
        <>
          {/* ── Search + filter ── */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
            {/* Search */}
            <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
              <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 13, color: D.txtSec, pointerEvents: 'none' }}>🔍</span>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Hledat záložky…"
                style={{ width: '100%', padding: '9px 12px 9px 36px', background: D.bgCard, border: `1px solid ${search ? accent + '50' : D.border}`, borderRadius: 10, fontSize: 13, color: D.txtPri, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' as const, transition: 'border-color .2s' }} />
              {search && <button onClick={() => setSearch('')} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: D.txtSec, fontSize: 14 }}>✕</button>}
            </div>
            {/* Module filter chips */}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {[{ id: 'all', title: 'Vše' }, ...modules.map(([id, title]) => ({ id, title }))].map(opt => {
                const active = filterModule === opt.id
                return (
                  <button key={opt.id} className="bm-chip" onClick={() => setFilterModule(opt.id)}
                    style={{ padding: '6px 13px', borderRadius: 20, border: `1px solid ${active ? accent + '60' : D.border}`, background: active ? accent + '18' : 'transparent', color: active ? accent : D.txtSec, fontSize: 12, fontWeight: active ? 700 : 400, fontFamily: 'inherit' }}>
                    {opt.title}
                    {opt.id !== 'all' && (
                      <span style={{ marginLeft: 5, fontSize: 10, padding: '1px 5px', background: active ? accent + '30' : 'rgba(255,255,255,.08)', borderRadius: 10, color: 'inherit' }}>
                        {bookmarks.filter(b => b.module.id === opt.id).length}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>

          {/* ── No results ── */}
          {filtered.length === 0 && (
            <div style={{ ...card({ padding: '40px 24px', textAlign: 'center' as const }) }}>
              <div style={{ fontSize: 28, marginBottom: 10, opacity: .4 }}>🔍</div>
              <div style={{ fontSize: 13, color: D.txtSec }}>Žádné záložky nevyhovují filtru</div>
              <button onClick={() => { setSearch(''); setFilterModule('all') }} style={{ marginTop: 12, padding: '6px 16px', background: D.bgMid, color: D.txtSec, border: `1px solid ${D.border}`, borderRadius: 8, cursor: 'pointer', fontSize: 12, fontFamily: 'inherit' }}>Zrušit filtry</button>
            </div>
          )}

          {/* ── Grouped by module ── */}
          {grouped.map(({ module: mod, items }) => {
            const color = mod.color ?? tagColor(mod.tag)
            return (
              <div key={mod.id} style={{ marginBottom: 24 }}>
                {/* Module header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: color, flexShrink: 0 }} />
                  <h2 style={{ fontSize: 14, fontWeight: 700, color: D.txtPri, margin: 0, flex: 1 }}>{mod.title}</h2>
                  {mod.tag && (
                    <span style={{ fontSize: 10, padding: '2px 8px', background: color + '20', color, borderRadius: 20, fontWeight: 600, border: `1px solid ${color}30` }}>{mod.tag}</span>
                  )}
                  <a href={`/student/modules/${mod.id}`} style={{ fontSize: 11, color: D.txtSec, textDecoration: 'none', opacity: .7 }}>Otevřít modul →</a>
                </div>

                {/* Bookmark cards */}
                <div style={{ display: 'grid', gap: 8 }}>
                  {items.map(b => {
                    const lesson = b.lesson
                    const isRemoving = removing.has(b.lesson_id)
                    const ex = excerpt(lesson.content)
                    return (
                      <div key={b.lesson_id} className="bm-card"
                        style={{ ...card({ padding: '14px 16px', display: 'flex', alignItems: 'flex-start', gap: 14, opacity: isRemoving ? .4 : 1, transition: 'opacity .2s' }) }}>
                        {/* Left accent strip */}
                        <div style={{ width: 3, borderRadius: 3, background: color, alignSelf: 'stretch', flexShrink: 0, minHeight: 40 }} />
                        {/* Icon */}
                        <div style={{ width: 36, height: 36, borderRadius: 9, background: color + '18', border: `1px solid ${color}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>🔖</div>
                        {/* Content */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 14, fontWeight: 700, color: D.txtPri, marginBottom: ex ? 4 : 0 }}>{lesson.title}</div>
                          {ex && <div style={{ fontSize: 11, color: D.txtSec, lineHeight: 1.5 }}>{ex}</div>}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                            <span style={{ fontSize: 10, color: D.txtSec }}>Lekce {lesson.position}</span>
                            <span style={{ fontSize: 10, color: 'rgba(255,255,255,.15)' }}>·</span>
                            <span style={{ fontSize: 10, color: D.txtSec }}>Uloženo: {fmtDate(b.updated_at)}</span>
                          </div>
                        </div>
                        {/* Actions */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
                          <a href={`/student/modules/${mod.id}/lessons/${lesson.id}`}
                            style={{ padding: '6px 14px', background: color + '20', color, border: `1px solid ${color}40`, borderRadius: 8, textDecoration: 'none', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' as const }}>
                            Číst lekci →
                          </a>
                          <button className="bm-remove" onClick={() => removeBookmark(b.lesson_id)} disabled={isRemoving}
                            style={{ padding: '5px 12px', background: 'rgba(239,68,68,.1)', color: D.danger, border: `1px solid rgba(239,68,68,.2)`, borderRadius: 8, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit', opacity: 0, transition: 'opacity .15s', whiteSpace: 'nowrap' as const }}>
                            {isRemoving ? '…' : '🗑 Odebrat'}
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </>
      )}
    </DarkLayout>
  )
}
