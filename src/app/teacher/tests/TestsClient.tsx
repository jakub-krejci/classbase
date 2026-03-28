'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { PageHeader, EmptyState } from '@/components/ui'

const STATUS_STYLES: Record<string, { bg: string; color: string; label: string }> = {
  draft:     { bg: '#f3f4f6', color: '#555',    label: 'Draft' },
  published: { bg: '#EAF3DE', color: '#27500A', label: 'Published' },
  closed:    { bg: '#fee2e2', color: '#991b1b',  label: 'Closed' },
}

export default function TestsClient({ tests: initial, teacherId }: { tests: any[]; teacherId: string }) {
  const supabase = createClient()
  const [tests, setTests] = useState(initial)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [showArchived, setShowArchived] = useState(false)
  const [archiving, setArchiving] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [tagFilter, setTagFilter] = useState<string>('')

  const activeTests = useMemo(() => tests.filter(t => showArchived ? !!t.archived : !t.archived), [tests, showArchived])

  // Collect all unique tags across active tests
  const allTags = useMemo(() => {
    const s = new Set<string>()
    activeTests.forEach(t => (t.tags ?? []).forEach((tag: string) => s.add(tag)))
    return [...s].sort()
  }, [activeTests])

  const filtered = useMemo(() => activeTests.filter(t => {
    if (statusFilter !== 'all' && t.status !== statusFilter) return false
    if (tagFilter && !(t.tags ?? []).includes(tagFilter)) return false
    if (search) {
      const q = search.toLowerCase()
      const inTitle = t.title.toLowerCase().includes(q)
      const inCat = (t.category ?? '').toLowerCase().includes(q)
      const inDesc = (t.description ?? '').toLowerCase().includes(q)
      const inTags = (t.tags ?? []).some((tag: string) => tag.toLowerCase().includes(q))
      if (!inTitle && !inCat && !inDesc && !inTags) return false
    }
    return true
  }), [tests, search, statusFilter, tagFilter])

  async function toggleArchive(t: any) {
    setArchiving(t.id)
    const newVal = !t.archived
    await supabase.from('tests').update({ archived: newVal }).eq('id', t.id)
    setTests(p => p.map(x => x.id === t.id ? { ...x, archived: newVal } : x))
    setArchiving(null)
  }

  async function deleteTest(id: string) {
    if (!confirm('Delete this test and all its data?')) return
    setDeleting(id)
    await supabase.from('tests').delete().eq('id', id)
    setTests(p => p.filter(t => t.id !== id))
    setDeleting(null)
  }

  async function duplicate(t: any) {
    const { data: newTest } = await supabase.from('tests').insert({
      teacher_id: teacherId, title: t.title + ' (copy)', description: t.description,
      category: t.category, status: 'draft', tags: t.tags ?? [],
    }).select().single()
    if (newTest) setTests(p => [newTest, ...p])
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <PageHeader title="Tests" sub="Create and manage tests for your students" />
        <div style={{ display: 'flex', gap: 8 }}>
          {tests.some(t => t.archived) && (
            <button onClick={() => setShowArchived(v => !v)}
              style={{ padding: '9px 16px', background: showArchived ? '#185FA5' : '#f3f4f6', color: showArchived ? '#fff' : '#555', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
              {showArchived ? '← Active tests' : `🗄 Archived (${tests.filter(t => t.archived).length})`}
            </button>
          )}
          {!showArchived && (
            <a href="/teacher/tests/new"
              style={{ padding: '10px 20px', background: '#185FA5', color: '#fff', borderRadius: 8, textDecoration: 'none', fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap' }}>
              + New Test
            </a>
          )}
        </div>
      </div>

      {/* ── Search & filters ── */}
      {activeTests.length > 0 && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
          <input type="text" placeholder="Search tests…" value={search} onChange={e => setSearch(e.target.value)}
            style={{ flex: '1 1 200px', padding: '8px 12px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, outline: 'none', fontFamily: 'inherit' }} />
          {/* Status filter */}
          <div style={{ display: 'flex', gap: 4 }}>
            {(['all', 'draft', 'published', 'closed'] as const).map(s => (
              <button key={s} onClick={() => setStatusFilter(s)}
                style={{ padding: '7px 12px', borderRadius: 7, border: `1.5px solid ${statusFilter === s ? '#185FA5' : '#e5e7eb'}`, background: statusFilter === s ? '#185FA5' : '#fff', color: statusFilter === s ? '#fff' : '#555', fontSize: 12, fontWeight: 500, cursor: 'pointer', textTransform: 'capitalize' }}>
                {s === 'all' ? 'All' : STATUS_STYLES[s]?.label ?? s}
              </button>
            ))}
          </div>
          {/* Tag filter */}
          {allTags.length > 0 && (
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              <button onClick={() => setTagFilter('')}
                style={{ padding: '5px 10px', borderRadius: 20, border: `1.5px solid ${tagFilter === '' ? '#185FA5' : '#e5e7eb'}`, background: tagFilter === '' ? '#E6F1FB' : '#fff', color: tagFilter === '' ? '#0C447C' : '#555', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                All tags
              </button>
              {allTags.map(tag => (
                <button key={tag} onClick={() => setTagFilter(tagFilter === tag ? '' : tag)}
                  style={{ padding: '5px 10px', borderRadius: 20, border: `1.5px solid ${tagFilter === tag ? '#185FA5' : '#e5e7eb'}`, background: tagFilter === tag ? '#E6F1FB' : '#fff', color: tagFilter === tag ? '#0C447C' : '#555', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                  {tag}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTests.length === 0 && !showArchived && <EmptyState message="No tests yet — create your first test to assess students" />}
      {activeTests.length === 0 && showArchived && <EmptyState message="No archived tests." />}

      {activeTests.length > 0 && filtered.length === 0 && (
        <div style={{ textAlign: 'center', padding: '48px 20px', color: '#aaa', border: '1px dashed #e5e7eb', borderRadius: 14 }}>
          No tests match your search.
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(320px,1fr))', gap: 16 }}>
        {filtered.map(t => {
          const ss = STATUS_STYLES[t.status] ?? STATUS_STYLES.draft
          const isScheduled = t.available_from || t.available_until
          return (
            <div key={t.id} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 15, color: '#111', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</div>
                  {t.category && <div style={{ fontSize: 11, color: '#888' }}>{t.category}</div>}
                </div>
                <span style={{ padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: ss.bg, color: ss.color, flexShrink: 0 }}>{ss.label}</span>
              </div>

              {t.description && (
                <div style={{ fontSize: 13, color: '#666', lineHeight: 1.5, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                  {t.description}
                </div>
              )}

              {/* Tags */}
              {(t.tags ?? []).length > 0 && (
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {(t.tags as string[]).map((tag: string) => (
                    <button key={tag} onClick={() => setTagFilter(tag === tagFilter ? '' : tag)}
                      style={{ padding: '2px 8px', background: tagFilter === tag ? '#E6F1FB' : '#f3f4f6', color: tagFilter === tag ? '#0C447C' : '#555', borderRadius: 20, fontSize: 11, fontWeight: 500, border: `1px solid ${tagFilter === tag ? '#93c5fd' : '#e5e7eb'}`, cursor: 'pointer' }}>
                      {tag}
                    </button>
                  ))}
                </div>
              )}

              <div style={{ fontSize: 11, color: '#aaa', marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span>Created {new Date(t.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                {isScheduled && (
                  <span style={{ color: '#6c47ff' }}>
                    🕐 {t.available_from ? `Opens ${new Date(t.available_from).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}` : ''}
                    {t.available_from && t.available_until ? ' · ' : ''}
                    {t.available_until ? `Closes ${new Date(t.available_until).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}` : ''}
                  </span>
                )}
                {t.retake_mode === 'practice' && <span style={{ color: '#16a34a' }}>📖 Practice mode</span>}
                {t.retake_mode === 'best' && t.max_attempts && <span style={{ color: '#d97706' }}>🔁 Best of {t.max_attempts}</span>}
              </div>

              <div style={{ display: 'flex', gap: 6, borderTop: '1px solid #f3f4f6', paddingTop: 10 }}>
                <a href={`/teacher/tests/${t.id}`}
                  style={{ flex: 1, padding: '7px 0', background: '#185FA5', color: '#fff', border: 'none', borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: 'pointer', textAlign: 'center', textDecoration: 'none' }}>
                  Edit
                </a>
                <button onClick={() => duplicate(t)}
                  style={{ padding: '7px 12px', background: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: 7, fontSize: 12, cursor: 'pointer', color: '#555' }} title="Duplicate">
                  ⎘
                </button>
                <button onClick={() => toggleArchive(t)} disabled={archiving === t.id}
                  style={{ padding: '7px 12px', background: t.archived ? '#E6F1FB' : '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 7, fontSize: 12, cursor: 'pointer', color: t.archived ? '#185FA5' : '#888' }}
                  title={t.archived ? 'Restore' : 'Archive'}>
                  {archiving === t.id ? '…' : t.archived ? '↩' : '🗄'}
                </button>
                <button onClick={() => deleteTest(t.id)} disabled={deleting === t.id}
                  style={{ padding: '7px 12px', background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 7, fontSize: 12, cursor: 'pointer', color: '#991b1b' }}>
                  {deleting === t.id ? '…' : '✕'}
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
