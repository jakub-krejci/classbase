'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Breadcrumb, PageHeader, Card, Btn, EmptyState } from '@/components/ui'

export default function GroupsClient({ groups: initialGroups, students, modules, groupModules: initialGroupModules, teacherId }: {
  groups: any[]; students: any[]; modules: any[]; groupModules: any[]; teacherId: string
}) {
  const supabase = createClient()
  const [groups, setGroups] = useState(initialGroups)
  const [groupModules, setGroupModules] = useState(initialGroupModules)
  const [creating, setCreating] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [desc, setDesc] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [saving, setSaving] = useState(false)

  const inp: React.CSSProperties = { width: '100%', padding: '7px 9px', border: '0.5px solid #e5e7eb', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', outline: 'none', marginBottom: 8, boxSizing: 'border-box' }
  const lbl: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: '#555', display: 'block', marginBottom: 4 }

  async function saveGroup() {
    if (!name.trim()) return
    setSaving(true)
    const { data: g } = await supabase.from('groups')
      .insert({ teacher_id: teacherId, name: name.trim(), description: desc.trim() || null } as any)
      .select('*, group_members(student_id, profiles(full_name,email))').single()
    if (g && selected.length) {
      await supabase.from('group_members').insert(selected.map(sid => ({ group_id: (g as any).id, student_id: sid })))
    }
    setGroups(prev => [...prev, { ...g, group_members: selected.map(sid => ({ student_id: sid, profiles: students.find(s => s.id === sid) })) }])
    setCreating(false); setName(''); setDesc(''); setSelected([]); setSaving(false)
  }

  async function deleteGroup(id: string) {
    if (!confirm('Delete this group and all its module assignments?')) return
    await supabase.from('groups').delete().eq('id', id)
    setGroups(prev => prev.filter(g => g.id !== id))
    setGroupModules(prev => prev.filter(gm => gm.group_id !== id))
  }

  async function toggleModuleAssign(groupId: string, moduleId: string) {
    const existing = groupModules.find(gm => gm.group_id === groupId && gm.module_id === moduleId)
    if (existing) {
      await supabase.from('group_modules').delete().eq('group_id', groupId).eq('module_id', moduleId)
      setGroupModules(prev => prev.filter(gm => !(gm.group_id === groupId && gm.module_id === moduleId)))
    } else {
      await supabase.from('group_modules').insert({ group_id: groupId, module_id: moduleId } as any)
      setGroupModules(prev => [...prev, { group_id: groupId, module_id: moduleId }])
    }
  }

  async function removeMember(groupId: string, studentId: string) {
    await supabase.from('group_members').delete().eq('group_id', groupId).eq('student_id', studentId)
    setGroups(prev => prev.map(g => g.id !== groupId ? g : {
      ...g, group_members: g.group_members.filter((m: any) => m.student_id !== studentId)
    }))
  }

  return (
    <div>
      <Breadcrumb items={[{ label: 'Groups' }]} />
      <PageHeader title="Student groups" sub="Organise students into cohorts and assign modules"
        action={!creating ? <Btn variant="primary" onClick={() => setCreating(true)}>+ New group</Btn> : undefined} />

      {/* Create group form */}
      {creating && (
        <Card style={{ maxWidth: 520, marginBottom: 20 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>New group</h3>
          <label style={lbl}>Group name</label>
          <input style={inp} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Class A — Morning" autoFocus />
          <label style={lbl}>Description (optional)</label>
          <input style={inp} value={desc} onChange={e => setDesc(e.target.value)} placeholder="Optional description" />
          <label style={{ ...lbl, marginBottom: 6 }}>Students to add</label>
          <div style={{ maxHeight: 200, overflowY: 'auto', border: '0.5px solid #e5e7eb', borderRadius: 8, marginBottom: 12 }}>
            {students.length === 0 && <div style={{ padding: 12, fontSize: 12, color: '#aaa' }}>No students registered yet.</div>}
            {students.map((s: any) => (
              <label key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', fontSize: 13, cursor: 'pointer', borderBottom: '0.5px solid #f3f4f6' }}>
                <input type="checkbox" checked={selected.includes(s.id)} onChange={e => setSelected(prev => e.target.checked ? [...prev, s.id] : prev.filter(x => x !== s.id))} style={{ width: 14, height: 14 }} />
                <div>
                  <div style={{ fontWeight: 500 }}>{s.full_name}</div>
                  <div style={{ fontSize: 11, color: '#888' }}>{s.email}</div>
                </div>
              </label>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Btn variant="primary" onClick={saveGroup} style={{ opacity: saving ? .6 : 1 }}>{saving ? 'Saving…' : 'Vytvořit skupinu'}</Btn>
            <Btn onClick={() => { setCreating(false); setName(''); setDesc(''); setSelected([]) }}>Cancel</Btn>
          </div>
        </Card>
      )}

      {groups.length === 0 && !creating && <EmptyState message="No groups yet. Create a group to organise your students." />}

      <div style={{ display: 'grid', gap: 14 }}>
        {groups.map((g: any) => {
          const assignedModuleIds = new Set(groupModules.filter(gm => gm.group_id === g.id).map(gm => gm.module_id))
          const memberCount = g.group_members?.length ?? 0
          return (
            <Card key={g.id} style={{ padding: 0, overflow: 'hidden' }}>
              {/* Group header */}
              <div style={{ padding: '14px 16px', borderBottom: '0.5px solid #f3f4f6', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 15, color: '#111' }}>{g.name}</div>
                  {g.description && <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>{g.description}</div>}
                  <div style={{ fontSize: 11, color: '#aaa', marginTop: 3 }}>{memberCount} student{memberCount !== 1 ? 's' : ''} · {assignedModuleIds.size} module{assignedModuleIds.size !== 1 ? 's' : ''} assigned</div>
                </div>
                <Btn variant="danger" onClick={() => deleteGroup(g.id)} style={{ padding: '3px 8px', fontSize: 11, flexShrink: 0 }}>Delete</Btn>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0 }}>
                {/* Members column */}
                <div style={{ padding: '12px 16px', borderRight: '0.5px solid #f3f4f6' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 8 }}>Members</div>
                  {(g.group_members ?? []).length === 0 && <div style={{ fontSize: 12, color: '#ccc' }}>No students</div>}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {(g.group_members ?? []).map((m: any) => {
                      const p = m.profiles as any
                      return (
                        <div key={m.student_id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, padding: '4px 8px', background: '#f9fafb', borderRadius: 7 }}>
                          <span style={{ fontSize: 12, color: '#333' }}>{p?.full_name ?? p?.email ?? '?'}</span>
                          <button onClick={() => removeMember(g.id, m.student_id)}
                            style={{ fontSize: 10, color: '#aaa', background: 'none', border: 'none', cursor: 'pointer', padding: '1px 4px', lineHeight: 1 }}>✕</button>
                        </div>
                      )
                    })}
                  </div>
                  {/* Add members */}
                  {editingId === g.id ? (
                    <div style={{ marginTop: 8, maxHeight: 160, overflowY: 'auto', border: '0.5px solid #e5e7eb', borderRadius: 7 }}>
                      {students.filter(s => !(g.group_members ?? []).some((m: any) => m.student_id === s.id)).map((s: any) => (
                        <label key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '6px 10px', fontSize: 12, cursor: 'pointer', borderBottom: '0.5px solid #f3f4f6' }}>
                          <input type="checkbox" onChange={async e => {
                            if (e.target.checked) {
                              await supabase.from('group_members').insert({ group_id: g.id, student_id: s.id } as any)
                              setGroups(prev => prev.map(gr => gr.id !== g.id ? gr : {
                                ...gr, group_members: [...(gr.group_members ?? []), { student_id: s.id, profiles: s }]
                              }))
                            }
                          }} style={{ width: 13, height: 13 }} />
                          <div>
                            <div style={{ fontWeight: 500 }}>{s.full_name}</div>
                            <div style={{ fontSize: 10, color: '#aaa' }}>{s.email}</div>
                          </div>
                        </label>
                      ))}
                    </div>
                  ) : (
                    <button onClick={() => setEditingId(g.id)}
                      style={{ marginTop: 8, fontSize: 11, color: '#185FA5', background: 'none', border: '0.5px dashed #B5D4F4', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontFamily: 'inherit' }}>
                      + Add student
                    </button>
                  )}
                  {editingId === g.id && (
                    <button onClick={() => setEditingId(null)}
                      style={{ marginTop: 6, fontSize: 11, color: '#888', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>Done</button>
                  )}
                </div>

                {/* Modules column */}
                <div style={{ padding: '12px 16px' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 8 }}>Assigned modules</div>
                  {modules.length === 0 && <div style={{ fontSize: 12, color: '#ccc' }}>No modules yet</div>}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {modules.map((mod: any) => {
                      const assigned = assignedModuleIds.has(mod.id)
                      return (
                        <label key={mod.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', background: assigned ? '#EAF3DE' : '#f9fafb', borderRadius: 7, cursor: 'pointer', border: assigned ? '0.5px solid #c3e0a8' : '0.5px solid transparent' }}>
                          <input type="checkbox" checked={assigned} onChange={() => toggleModuleAssign(g.id, mod.id)} style={{ width: 13, height: 13, flexShrink: 0 }} />
                          <span style={{ fontSize: 12, color: '#333' }}>{mod.title}</span>
                        </label>
                      )
                    })}
                  </div>
                </div>
              </div>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
