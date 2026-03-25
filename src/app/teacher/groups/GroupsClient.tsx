'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { PageHeader, Card, Btn, EmptyState } from '@/components/ui'

export default function GroupsClient({ groups, students, teacherId }: { groups: any[]; students: any[]; teacherId: string }) {
  const supabase = createClient()
  const router = useRouter()
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [desc, setDesc] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [saving, setSaving] = useState(false)

  const inp: React.CSSProperties = { width: '100%', padding: '7px 9px', border: '0.5px solid #e5e7eb', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', outline: 'none', marginBottom: 8 }
  const lbl: React.CSSProperties = { fontSize: 11, fontWeight: 500, color: '#666', display: 'block', marginBottom: 3 }

  async function saveGroup() {
    if (!name.trim()) return
    setSaving(true)
    const { data: g } = await supabase.from('groups').insert({ teacher_id: teacherId, name: name.trim(), description: desc.trim() || null } as any).select().single()
    if (g && selected.length) {
      await supabase.from('group_members').insert(selected.map(sid => ({ group_id: (g as any).id, student_id: sid })))
    }
    setCreating(false); setName(''); setDesc(''); setSelected([]); setSaving(false)
    window.location.reload()
  }

  async function deleteGroup(id: string) {
    if (!confirm('Delete this group?')) return
    await supabase.from('groups').delete().eq('id', id)
    window.location.reload()
  }

  return (
    <div>
      <PageHeader title="Student groups" sub="Organise students into classes or groups"
        action={!creating ? <Btn variant="primary" onClick={() => setCreating(true)}>+ New group</Btn> : undefined} />

      {creating && (
        <Card style={{ maxWidth: 460, marginBottom: 20 }}>
          <label style={lbl}>Group name</label>
          <input style={inp} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Class A — Morning" />
          <label style={lbl}>Description (optional)</label>
          <input style={inp} value={desc} onChange={e => setDesc(e.target.value)} placeholder="Optional description" />
          <label style={{ ...lbl, marginBottom: 6 }}>Students</label>
          {students.map((s: any) => (
            <label key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '5px 0', fontSize: 13, cursor: 'pointer', borderBottom: '0.5px solid #f3f4f6' }}>
              <input type="checkbox" checked={selected.includes(s.id)} onChange={e => setSelected(prev => e.target.checked ? [...prev, s.id] : prev.filter(x => x !== s.id))} style={{ width: 13, height: 13 }} />
              {s.full_name ?? s.email}
            </label>
          ))}
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <Btn variant="primary" onClick={saveGroup} style={{ opacity: saving ? .6 : 1 }}>{saving ? 'Saving…' : 'Create group'}</Btn>
            <Btn onClick={() => setCreating(false)}>Cancel</Btn>
          </div>
        </Card>
      )}

      {groups.length === 0 && !creating && <EmptyState message="No groups yet. Create a group to organise your students." />}
      {groups.map((g: any) => (
        <Card key={g.id} style={{ marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 }}>
            <div>
              <div style={{ fontWeight: 500, fontSize: 14 }}>{g.name}</div>
              {g.description && <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>{g.description}</div>}
            </div>
            <Btn variant="danger" onClick={() => deleteGroup(g.id)} style={{ padding: '3px 8px', fontSize: 11 }}>Delete</Btn>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
            {(g.group_members ?? []).map((m: any) => {
              const p = m.profiles as any
              return <span key={m.student_id} style={{ fontSize: 11, padding: '2px 9px', background: '#f3f4f6', borderRadius: 20, border: '0.5px solid #e5e7eb' }}>{p?.full_name ?? p?.email ?? '?'}</span>
            })}
            {g.group_members?.length === 0 && <span style={{ fontSize: 12, color: '#aaa' }}>No students in this group.</span>}
          </div>
        </Card>
      ))}
    </div>
  )
}
