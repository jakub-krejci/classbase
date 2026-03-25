'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useParams } from 'next/navigation'
import { Card, Btn, BackLink } from '@/components/ui'

const TAGS = ['Science', 'Math', 'Geography', 'Programming', 'History', 'Language', 'Graduation Exam', 'Other']
const inp: React.CSSProperties = { width: '100%', padding: '8px 10px', border: '0.5px solid #e5e7eb', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', marginBottom: 12, color: '#111', background: '#fff', outline: 'none' }
const lbl: React.CSSProperties = { display: 'block', fontSize: 11, fontWeight: 500, color: '#666', marginBottom: 3 }

export default function EditModulePage() {
  const supabase = createClient()
  const router = useRouter()
  const params = useParams() as any
  const id = params.id as string

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [tag, setTag] = useState('Science')
  const [unlock, setUnlock] = useState<'all' | 'sequential'>('all')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.from('modules').select('*').eq('id', id).single().then(({ data }) => {
      if (data) { setTitle(data.title); setDescription((data as any).description ?? ''); setTag((data as any).tag ?? 'Science'); setUnlock((data as any).unlock_mode ?? 'all') }
      setLoading(false)
    })
  }, [])

  async function save() {
    if (!title.trim()) { setError('Title is required.'); return }
    setSaving(true); setError('')
    const { error: err } = await supabase.from('modules').update({ title: title.trim(), description: description.trim() || null, tag, unlock_mode: unlock } as any).eq('id', id)
    if (err) { setError(err.message); setSaving(false); return }
    router.push('/teacher/modules/' + id)
    router.refresh()
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#888' }}>Loading…</div>

  return (
    <div style={{ maxWidth: 500, margin: '32px auto', padding: '0 20px', fontFamily: 'system-ui, sans-serif' }}>
      <BackLink href={'/teacher/modules/' + id} label="Back to module" />
      <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 20 }}>Edit module</h1>
      <Card>
        <label style={lbl}>Title</label>
        <input style={inp} value={title} onChange={e => setTitle(e.target.value)} />
        <label style={lbl}>Description</label>
        <textarea style={{ ...inp, height: 72, resize: 'vertical' }} value={description} onChange={e => setDescription(e.target.value)} />
        <label style={lbl}>Subject tag</label>
        <select style={inp} value={tag} onChange={e => setTag(e.target.value)}>
          {TAGS.map(t => <option key={t}>{t}</option>)}
        </select>
        <label style={lbl}>Lesson unlocking</label>
        <div style={{ display: 'flex', border: '0.5px solid #e5e7eb', borderRadius: 8, overflow: 'hidden', marginBottom: 16 }}>
          {(['all', 'sequential'] as const).map(v => (
            <div key={v} onClick={() => setUnlock(v)} style={{ flex: 1, padding: '7px', textAlign: 'center', fontSize: 12, fontWeight: 500, cursor: 'pointer', background: unlock === v ? '#185FA5' : '#f9fafb', color: unlock === v ? '#E6F1FB' : '#666' }}>
              {v === 'all' ? 'All visible' : 'Sequential'}
            </div>
          ))}
        </div>
        {error && <div style={{ fontSize: 12, padding: '7px 10px', background: '#FCEBEB', color: '#791F1F', borderRadius: 8, marginBottom: 10 }}>{error}</div>}
        <div style={{ display: 'flex', gap: 8 }}>
          <Btn variant="primary" onClick={save} style={{ opacity: saving ? .6 : 1 }}>{saving ? 'Saving…' : 'Save changes'}</Btn>
          <Btn href={'/teacher/modules/' + id}>Cancel</Btn>
        </div>
      </Card>
    </div>
  )
}
