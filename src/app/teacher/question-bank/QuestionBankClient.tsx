'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Breadcrumb, PageHeader } from '@/components/ui'

const Q_LABELS: Record<string, string> = {
  single: 'Single choice', multiple: 'Multiple choice',
  descriptive: 'Descriptive', truefalse: 'True / False', coding: 'Coding',
}
const TYPE_COLORS: Record<string, string> = {
  single: '#E6F1FB', multiple: '#f5f3ff', descriptive: '#fff7ed',
  truefalse: '#f0fdf4', coding: '#1a1b26',
}
const TYPE_TEXT: Record<string, string> = {
  single: '#0C447C', multiple: '#6c47ff', descriptive: '#92400e',
  truefalse: '#166534', coding: '#a6e3a1',
}

function uid() { return Math.random().toString(36).slice(2) }

export default function QuestionBankClient({ questions: initQuestions, tests, teacherId }: {
  questions: any[]; tests: any[]; teacherId: string
}) {
  const supabase = createClient()
  const [questions, setQuestions] = useState(initQuestions)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [importing, setImporting] = useState<Record<string, boolean>>({})
  const [imported, setImported] = useState<Record<string, boolean>>({})
  const [deleting, setDeleting] = useState<Record<string, boolean>>({})
  const [selectedTest, setSelectedTest] = useState(tests[0]?.id ?? '')
  const [expandedQ, setExpandedQ] = useState<string | null>(null)

  const filtered = questions.filter(q => {
    const matchType = typeFilter === 'all' || q.type === typeFilter
    const matchSearch = !search || q.body_html.toLowerCase().replace(/<[^>]*>/g, '').includes(search.toLowerCase())
    return matchType && matchSearch
  })

  async function importToTest(q: any) {
    if (!selectedTest) { alert('Select a test first'); return }
    setImporting(p => ({ ...p, [q.id]: true }))
    // Get current max position
    const { data: existing } = await supabase.from('test_questions')
      .select('position').eq('test_id', selectedTest).order('position', { ascending: false }).limit(1)
    const pos = (existing?.[0]?.position ?? -1) + 1
    const { data: nq, error } = await supabase.from('test_questions').insert({
      test_id: selectedTest, type: q.type, body_html: q.body_html,
      points_correct: q.points_correct, points_incorrect: q.points_incorrect,
      starter_code: q.starter_code ?? '', is_required: true, position: pos,
    }).select('id').single()
    if (error || !nq) { alert('Import failed: ' + error?.message); setImporting(p => ({ ...p, [q.id]: false })); return }
    // Import options
    const opts = (q.question_bank_options ?? []).sort((a: any, b: any) => a.position - b.position)
    for (let i = 0; i < opts.length; i++) {
      await supabase.from('test_question_options').insert({
        question_id: nq.id, body_html: opts[i].body_html, is_correct: opts[i].is_correct, position: i,
      })
    }
    setImporting(p => ({ ...p, [q.id]: false }))
    setImported(p => ({ ...p, [q.id]: true }))
    setTimeout(() => setImported(p => ({ ...p, [q.id]: false })), 3000)
  }

  async function deleteQuestion(id: string) {
    if (!confirm('Delete this question from the bank?')) return
    setDeleting(p => ({ ...p, [id]: true }))
    await supabase.from('question_bank').delete().eq('id', id)
    setQuestions(p => p.filter(q => q.id !== id))
  }

  return (
    <div style={{ maxWidth: 960, margin: '0 auto' }}>
      <Breadcrumb items={[{ label: 'Tests', href: '/teacher/tests' }, { label: 'Question Bank' }]} />
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20, gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 4px' }}>📚 Question Bank</h1>
          <div style={{ fontSize: 13, color: '#888' }}>{questions.length} saved question{questions.length !== 1 ? 's' : ''} — reuse across any test</div>
        </div>
        {/* Import target selector */}
        {tests.length > 0 && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, color: '#666', whiteSpace: 'nowrap' }}>Import into:</span>
            <select value={selectedTest} onChange={e => setSelectedTest(e.target.value)}
              style={{ padding: '7px 10px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', background: '#fff', minWidth: 160 }}>
              {tests.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
            </select>
          </div>
        )}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <input type="text" placeholder="Search questions…" value={search} onChange={e => setSearch(e.target.value)}
          style={{ padding: '8px 12px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, flex: '1 1 200px', outline: 'none', fontFamily: 'inherit' }} />
        {['all', 'single', 'multiple', 'truefalse', 'descriptive', 'coding'].map(t => (
          <button key={t} onClick={() => setTypeFilter(t)}
            style={{ padding: '6px 12px', borderRadius: 8, border: `1.5px solid ${typeFilter === t ? '#185FA5' : '#e5e7eb'}`, background: typeFilter === t ? '#185FA5' : '#fff', color: typeFilter === t ? '#fff' : '#555', fontSize: 12, fontWeight: 500, cursor: 'pointer', textTransform: 'capitalize' as const }}>
            {t === 'all' ? 'All types' : Q_LABELS[t] ?? t}
          </button>
        ))}
      </div>

      {questions.length === 0 && (
        <div style={{ textAlign: 'center', padding: '60px 20px', border: '1px dashed #e5e7eb', borderRadius: 14 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📚</div>
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>Your bank is empty</div>
          <div style={{ fontSize: 13, color: '#888', marginBottom: 16 }}>When editing a test, click "💾 Save to bank" on any question to add it here.</div>
          <a href="/teacher/tests" style={{ padding: '9px 20px', background: '#185FA5', color: '#fff', borderRadius: 8, textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>← Back to tests</a>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {filtered.map(q => {
          const opts = (q.question_bank_options ?? []).sort((a: any, b: any) => a.position - b.position)
          const expanded = expandedQ === q.id
          return (
            <div key={q.id} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden' }}>
              {/* Header row */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px', cursor: 'pointer' }}
                onClick={() => setExpandedQ(expanded ? null : q.id)}>
                <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 8, background: TYPE_COLORS[q.type] ?? '#f3f4f6', color: TYPE_TEXT[q.type] ?? '#555', flexShrink: 0 }}>
                  {Q_LABELS[q.type] ?? q.type}
                </span>
                <div style={{ flex: 1, fontSize: 14, color: '#111', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                  dangerouslySetInnerHTML={{ __html: q.body_html.replace(/<[^>]*>/g, '').slice(0, 100) + (q.body_html.replace(/<[^>]*>/g, '').length > 100 ? '…' : '') }} />
                <span style={{ fontSize: 11, color: '#888', flexShrink: 0 }}>{q.points_correct} pt{q.points_correct !== 1 ? 's' : ''}</span>
                <span style={{ fontSize: 13, color: '#aaa', flexShrink: 0 }}>{expanded ? '▲' : '▼'}</span>
              </div>

              {/* Expanded content */}
              {expanded && (
                <div style={{ padding: '0 18px 16px', borderTop: '1px solid #f3f4f6' }}>
                  <div style={{ fontSize: 14, lineHeight: 1.7, color: '#111', margin: '14px 0', paddingTop: 8 }}
                    dangerouslySetInnerHTML={{ __html: q.body_html }} />
                  {opts.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 12 }}>
                      {opts.map((o: any) => (
                        <div key={o.id} style={{ display: 'flex', gap: 8, padding: '6px 10px', borderRadius: 7, background: o.is_correct ? '#f0fdf4' : '#f9fafb', border: `1px solid ${o.is_correct ? '#86efac' : '#f3f4f6'}`, fontSize: 13 }}>
                          <span>{o.is_correct ? '✓' : '○'}</span>
                          <span dangerouslySetInnerHTML={{ __html: o.body_html }} />
                        </div>
                      ))}
                    </div>
                  )}
                  {q.starter_code && (
                    <pre style={{ background: '#1a1b26', color: '#cdd6f4', borderRadius: 8, padding: '10px 14px', fontSize: 12, whiteSpace: 'pre-wrap', marginBottom: 12 }}>{q.starter_code}</pre>
                  )}
                  {/* Actions */}
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => importToTest(q)} disabled={importing[q.id] || !selectedTest}
                      style={{ padding: '7px 16px', background: imported[q.id] ? '#16a34a' : '#185FA5', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: importing[q.id] ? .6 : 1 }}>
                      {importing[q.id] ? 'Importing…' : imported[q.id] ? '✓ Imported!' : '⊕ Import to test'}
                    </button>
                    <button onClick={() => deleteQuestion(q.id)} disabled={deleting[q.id]}
                      style={{ padding: '7px 14px', background: '#fff', color: '#dc2626', border: '1px solid #fca5a5', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
                      {deleting[q.id] ? '…' : 'Delete'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
        {filtered.length === 0 && questions.length > 0 && (
          <div style={{ textAlign: 'center', padding: '40px', color: '#aaa', border: '1px dashed #e5e7eb', borderRadius: 12 }}>
            No questions match your filter.
          </div>
        )}
      </div>
    </div>
  )
}
