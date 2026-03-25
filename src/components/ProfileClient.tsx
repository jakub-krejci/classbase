'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Card, PageHeader } from '@/components/ui'

export default function ProfileClient({ profile }: { profile: any }) {
  const supabase = createClient()
  const router = useRouter()
  const [fullName, setFullName] = useState(profile?.full_name ?? '')
  const [subject, setSubject] = useState(profile?.subject_specialty ?? '')
  const [bio, setBio] = useState(profile?.bio ?? '')
  const [newPass, setNewPass] = useState('')
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState('')
  const [error, setError] = useState('')

  const initials = (fullName || '?').split(' ').map((w: string) => w[0] ?? '').join('').toUpperCase().slice(0, 2)
  const avatarBg = profile?.role === 'teacher' ? { bg: '#E6F1FB', color: '#0C447C' } : { bg: '#EAF3DE', color: '#27500A' }

  const inp: React.CSSProperties = { width: '100%', padding: '8px 10px', border: '0.5px solid #e5e7eb', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', marginBottom: 10, color: '#111', background: '#fff', outline: 'none' }
  const lbl: React.CSSProperties = { display: 'block', fontSize: 11, fontWeight: 500, color: '#666', marginBottom: 3 }

  async function save() {
    if (!fullName.trim()) { setError('Name is required.'); return }
    setSaving(true); setError(''); setSuccess('')
    const { error: err } = await supabase.from('profiles').update({
      full_name: fullName.trim(),
      subject_specialty: subject.trim() || null,
      bio: bio.trim() || null,
      updated_at: new Date().toISOString(),
    }).eq('id', profile.id)
    if (err) { setError(err.message); setSaving(false); return }
    if (newPass.trim()) {
      if (newPass.length < 6) { setError('Password must be at least 6 characters.'); setSaving(false); return }
      const { error: perr } = await supabase.auth.updateUser({ password: newPass })
      if (perr) { setError(perr.message); setSaving(false); return }
      setNewPass('')
    }
    setSuccess('Profile saved.')
    setSaving(false)
    router.refresh()
  }

  return (
    <div>
      <PageHeader title="Profile settings" sub="Update your information" />
      <Card style={{ maxWidth: 460 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
          <div style={{ width: 52, height: 52, borderRadius: '50%', background: avatarBg.bg, color: avatarBg.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 600, flexShrink: 0 }}>
            {initials}
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 500 }}>{fullName || 'Your name'}</div>
            <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>{profile?.role} · {profile?.email}</div>
          </div>
        </div>

        <label style={lbl}>Full name</label>
        <input style={inp} value={fullName} onChange={e => setFullName(e.target.value)} />

        {profile?.role === 'teacher' && (
          <>
            <label style={lbl}>Subject specialty</label>
            <input style={inp} value={subject} onChange={e => setSubject(e.target.value)} placeholder="e.g. Physics & Natural Sciences" />
            <label style={lbl}>Bio (visible to students)</label>
            <textarea style={{ ...inp, height: 72, resize: 'vertical' }} value={bio} onChange={e => setBio(e.target.value)} placeholder="A short bio…" />
          </>
        )}

        <label style={lbl}>New password (leave blank to keep current)</label>
        <input style={inp} type="password" value={newPass} onChange={e => setNewPass(e.target.value)} placeholder="••••••••" />

        {error && <div style={{ fontSize: 12, padding: '7px 10px', background: '#FCEBEB', color: '#791F1F', borderRadius: 8, marginBottom: 10 }}>{error}</div>}
        {success && <div style={{ fontSize: 12, padding: '7px 10px', background: '#EAF3DE', color: '#27500A', borderRadius: 8, marginBottom: 10 }}>{success}</div>}

        <button onClick={save} disabled={saving}
          style={{ width: '100%', padding: '9px', background: '#185FA5', color: '#E6F1FB', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer', opacity: saving ? .6 : 1 }}>
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      </Card>
    </div>
  )
}
