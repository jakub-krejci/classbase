'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from 'react'
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
      category: t.category, status: 'draft',
    }).select().single()
    if (newTest) setTests(p => [newTest, ...p])
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <PageHeader title="Tests" sub="Create and manage tests for your students" />
        <a href="/teacher/tests/new"
          style={{ padding: '10px 20px', background: '#185FA5', color: '#fff', borderRadius: 8, textDecoration: 'none', fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap' }}>
          + New Test
        </a>
      </div>

      {tests.length === 0 && (
        <EmptyState message="No tests yet — create your first test to assess students" />
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(320px,1fr))', gap: 16 }}>
        {tests.map(t => {
          const ss = STATUS_STYLES[t.status] ?? STATUS_STYLES.draft
          return (
            <div key={t.id} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 15, color: '#111', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</div>
                  {t.category && <div style={{ fontSize: 11, color: '#888' }}>{t.category}</div>}
                </div>
                <span style={{ padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: ss.bg, color: ss.color, flexShrink: 0 }}>{ss.label}</span>
              </div>
              {t.description && <div style={{ fontSize: 13, color: '#666', lineHeight: 1.5, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{t.description}</div>}
              <div style={{ fontSize: 11, color: '#aaa', marginTop: 'auto' }}>
                Created {new Date(t.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                {t.available_from && ` · Opens ${new Date(t.available_from).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`}
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
