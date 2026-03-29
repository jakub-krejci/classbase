'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from 'react'

function StatCard({ icon, label, value, sub }: { icon: string; label: string; value: number; sub?: string }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 14 }}>
      <div style={{ width: 42, height: 42, borderRadius: 12, background: '#185FA510', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>
        {icon}
      </div>
      <div>
        <div style={{ fontSize: 24, fontWeight: 700, color: '#111', lineHeight: 1.1 }}>{value}</div>
        <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>{label}</div>
        {sub && <div style={{ fontSize: 11, color: '#bbb', marginTop: 1 }}>{sub}</div>}
      </div>
    </div>
  )
}

export default function TeacherModulesClient({ profile, modules, counts }: {
  profile: any
  modules: any[]
  counts: Record<string, { lessons: number; enrollments: number }>
}) {
  const [search, setSearch] = useState('')
  const [showArchived, setShowArchived] = useState(false)

  const activeModules   = modules.filter(m => !m.archived)
  const archivedModules = modules.filter(m => m.archived)

  const totalLessons = activeModules.reduce((a, m) => a + (counts[m.id]?.lessons ?? 0), 0)
  const totalEnr     = activeModules.reduce((a, m) => a + (counts[m.id]?.enrollments ?? 0), 0)

  const filtered = (showArchived ? archivedModules : activeModules).filter(m =>
    !search || m.title.toLowerCase().includes(search.toLowerCase()) ||
    m.description?.toLowerCase().includes(search.toLowerCase()) ||
    m.tag?.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto' }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 4px', color: '#111' }}>Moje moduly</h1>
          <p style={{ fontSize: 13, color: '#888', margin: 0 }}>
            {activeModules.length} aktivních modulů · {totalLessons} lekcí · {totalEnr} zapsaných studentů
          </p>
        </div>
        <a href="/teacher/modules/new"
          style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '10px 18px', background: '#185FA5', color: '#fff', borderRadius: 10, textDecoration: 'none', fontSize: 14, fontWeight: 600, flexShrink: 0 }}>
          <span style={{ fontSize: 18 }}>+</span> Nový modul
        </a>
      </div>

      {/* ── Stats ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 24 }}>
        <StatCard icon="📚" label="Aktivní moduly"  value={activeModules.length} />
        <StatCard icon="📖" label="Celkem lekcí"    value={totalLessons} />
        <StatCard icon="👥" label="Zapsaní studenti" value={totalEnr} />
        <StatCard icon="📦" label="Archivováno"     value={archivedModules.length} />
      </div>

      {/* ── Search + filter bar ── */}
      {modules.length > 0 && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: '1 1 240px' }}>
            <svg style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#bbb' }} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
            </svg>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Hledat moduly…"
              style={{ width: '100%', padding: '8px 12px 8px 30px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' as const }} />
          </div>
          <div style={{ display: 'flex', gap: 4, background: '#f3f4f6', borderRadius: 9, padding: 3 }}>
            {[false, true].map(archived => (
              <button key={String(archived)} onClick={() => { setShowArchived(archived); setSearch('') }}
                style={{ padding: '6px 14px', borderRadius: 7, border: 'none', fontSize: 12, fontWeight: 500, cursor: 'pointer', background: showArchived === archived ? '#fff' : 'transparent', color: showArchived === archived ? '#111' : '#666', boxShadow: showArchived === archived ? '0 1px 3px rgba(0,0,0,.08)' : 'none', transition: 'all .15s' }}>
                {archived ? `📦 Archivováno (${archivedModules.length})` : `Aktivní (${activeModules.length})`}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Empty states ── */}
      {modules.length === 0 && (
        <div style={{ textAlign: 'center', padding: '72px 20px', border: '2px dashed #e5e7eb', borderRadius: 16 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>📚</div>
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 8px', color: '#111' }}>Zatím nemáte žádné moduly</h2>
          <p style={{ fontSize: 14, color: '#888', margin: '0 0 24px' }}>Vytvořte svůj první modul a začněte přidávat lekce.</p>
          <a href="/teacher/modules/new"
            style={{ padding: '11px 24px', background: '#185FA5', color: '#fff', borderRadius: 10, textDecoration: 'none', fontSize: 14, fontWeight: 600 }}>
            + Vytvořit první modul
          </a>
        </div>
      )}

      {modules.length > 0 && filtered.length === 0 && (
        <div style={{ textAlign: 'center', padding: '40px 20px', color: '#aaa', border: '1px dashed #e5e7eb', borderRadius: 12 }}>
          Žádné moduly neodpovídají hledání.
        </div>
      )}

      {/* ── Module cards grid ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16, opacity: showArchived ? 0.85 : 1 }}>
        {filtered.map(m => {
          const lessonCount  = counts[m.id]?.lessons ?? 0
          const studentCount = counts[m.id]?.enrollments ?? 0
          const isPublished  = m.status === 'published'

          return (
            <div key={m.id}
              style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 1px 4px rgba(0,0,0,.04)', transition: 'box-shadow .15s, transform .15s' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 20px rgba(0,0,0,.09)'; (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.boxShadow = '0 1px 4px rgba(0,0,0,.04)'; (e.currentTarget as HTMLElement).style.transform = 'none' }}>

              {/* Top accent bar */}
              <div style={{ height: 4, background: showArchived ? '#e5e7eb' : '#185FA5' }} />

              {/* Main clickable area */}
              <a href={`/teacher/modules/${m.id}`}
                style={{ display: 'block', padding: '16px 18px 12px', textDecoration: 'none', color: 'inherit', flex: 1 }}>

                {/* Title + tag row */}
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 15, color: '#111', lineHeight: 1.3, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as any, marginBottom: 4 }}>
                      {m.title}
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                      <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20, background: isPublished ? '#dcfce7' : '#f3f4f6', color: isPublished ? '#16a34a' : '#888' }}>
                        {isPublished ? '● Zveřejněno' : '○ Koncept'}
                      </span>
                      {m.tag && <span style={{ fontSize: 11, padding: '2px 8px', background: '#f0f4ff', color: '#3730a3', borderRadius: 20 }}>{m.tag}</span>}
                      {m.unlock_mode === 'sequential' && <span style={{ fontSize: 10, color: '#aaa' }}>🔒 Sekvenční</span>}
                    </div>
                  </div>
                </div>

                {/* Description */}
                {m.description && (
                  <div style={{ fontSize: 12, color: '#888', lineHeight: 1.5, marginBottom: 10, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as any }}>
                    {m.description}
                  </div>
                )}

                {/* Stats row */}
                <div style={{ display: 'flex', gap: 14, fontSize: 12, color: '#aaa', paddingTop: 10, borderTop: '1px solid #f9fafb' }}>
                  <span>📖 {lessonCount} lekcí</span>
                  <span>👥 {studentCount} studentů</span>
                  <span style={{ marginLeft: 'auto', fontFamily: 'monospace', fontSize: 11, background: '#f3f4f6', padding: '1px 6px', borderRadius: 5, color: '#666', letterSpacing: '.05em' }}>
                    {m.access_code}
                  </span>
                </div>
              </a>

              {/* Quick actions footer */}
              <div style={{ display: 'flex', gap: 0, borderTop: '1px solid #f3f4f6', background: '#fafafa' }}>
                <a href={`/teacher/modules/${m.id}/lessons/new`}
                  style={{ flex: 1, padding: '9px 0', textAlign: 'center', fontSize: 12, fontWeight: 600, color: '#185FA5', textDecoration: 'none', borderRight: '1px solid #f3f4f6' }}
                  title="Přidat lekci">
                  + Lekce
                </a>
                <a href={`/teacher/modules/${m.id}/edit`}
                  style={{ flex: 1, padding: '9px 0', textAlign: 'center', fontSize: 12, color: '#555', textDecoration: 'none', borderRight: '1px solid #f3f4f6' }}
                  title="Upravit modul">
                  ✏ Upravit
                </a>
                <a href={`/teacher/modules/${m.id}`}
                  style={{ flex: 1, padding: '9px 0', textAlign: 'center', fontSize: 12, color: '#555', textDecoration: 'none', borderRight: '1px solid #f3f4f6' }}
                  title="Spravovat modul">
                  ⚙ Detail
                </a>
                {!showArchived
                  ? <form method="POST" action={`/api/module-archive?id=${m.id}&archive=true`} style={{ flex: 1 }}>
                      <button title="Archivovat" style={{ width: '100%', padding: '9px 0', fontSize: 12, color: '#aaa', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
                        📦 Arch.
                      </button>
                    </form>
                  : <form method="POST" action={`/api/module-archive?id=${m.id}&archive=false`} style={{ flex: 1 }}>
                      <button title="Obnovit" style={{ width: '100%', padding: '9px 0', fontSize: 12, color: '#16a34a', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
                        ↩ Obnovit
                      </button>
                    </form>
                }
              </div>
            </div>
          )
        })}
      </div>

      <style>{`@media (max-width: 600px) { div[style*="grid-template-columns: repeat(auto-fill"] { grid-template-columns: 1fr !important; } }`}</style>
    </div>
  )
}
