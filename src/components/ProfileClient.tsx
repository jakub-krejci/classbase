'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { PageHeader } from '@/components/ui'

const ACCENT_COLORS = [
  { label: 'Oceán',    value: '#185FA5' },
  { label: 'Violet',  value: '#6c47ff' },
  { label: 'Les',  value: '#16a34a' },
  { label: 'Jantarová',   value: '#d97706' },
  { label: 'Růžová',    value: '#e06c75' },
  { label: 'Tyrkysová',    value: '#0d9488' },
  { label: 'Břidlicová',   value: '#475569' },
  { label: 'Fuchsiová', value: '#a21caf' },
]

function AvatarUpload({ url, name, accent, onUpload }: {
  url?: string | null; name: string; accent: string; onUpload: (newUrl: string) => void
}) {
  const [src, setSrc] = useState(url)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const supabase = createClient()
  const initials = (name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 2 * 1024 * 1024) { setError('Soubor musí být menší než 2 MB'); return }
    setUploading(true); setError('')
    const ext = file.name.split('.').pop()
    const path = `avatars/${crypto.randomUUID()}.${ext}`
    const { error: upErr } = await supabase.storage.from('avatars').upload(path, file, { upsert: true })
    if (upErr) { setError(upErr.message); setUploading(false); return }
    const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path)
    const { data: { user } } = await supabase.auth.getUser()
    if (user) await supabase.from('profiles').update({ avatar_url: publicUrl }).eq('id', user.id)
    setSrc(publicUrl)
    onUpload(publicUrl)
    setUploading(false)
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 20, padding: '20px 0', borderBottom: '1px solid #f3f4f6', marginBottom: 20 }}>
      <div style={{ position: 'relative', flexShrink: 0 }}>
        {src
          ? <img src={src} alt={name} style={{ width: 80, height: 80, borderRadius: '50%', objectFit: 'cover', border: `3px solid ${accent}33`, boxShadow: '0 2px 10px rgba(0,0,0,.08)' }} />
          : <div style={{ width: 80, height: 80, borderRadius: '50%', background: accent + '18', color: accent, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, fontWeight: 700, border: `3px solid ${accent}33` }}>{initials}</div>
        }
        <button onClick={() => fileRef.current?.click()} disabled={uploading}
          style={{ position: 'absolute', bottom: 0, right: 0, width: 26, height: 26, borderRadius: '50%', background: accent, border: '2px solid #fff', color: '#fff', fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 8px rgba(0,0,0,.15)' }}>
          {uploading ? '…' : '✎'}
        </button>
        <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFile} />
      </div>
      <div>
        <div style={{ fontSize: 14, fontWeight: 600, color: '#111', marginBottom: 4 }}>{name || 'Tvoje jméno'}</div>
        <div style={{ fontSize: 12, color: '#888', marginBottom: 8 }}>JPG, PNG or GIF · max 2 MB</div>
        <button onClick={() => fileRef.current?.click()} disabled={uploading}
          style={{ padding: '5px 14px', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 7, fontSize: 12, cursor: 'pointer', color: '#444' }}>
          {uploading ? 'Uploading…' : src ? 'Change photo' : 'Upload photo'}
        </button>
        {error && <div style={{ fontSize: 11, color: '#dc2626', marginTop: 4 }}>{error}</div>}
      </div>
    </div>
  )
}

export default function ProfileClient({ profile }: { profile: any }) {
  const supabase = createClient()
  const isStudent = profile?.role === 'student'

  const [fullName,     setFullName]     = useState(profile?.full_name ?? '')
  const [subject,      setSubject]      = useState(profile?.subject_specialty ?? '')
  const [bio,          setBio]          = useState(profile?.bio ?? '')
  const [studentClass, setStudentClass] = useState(profile?.student_class ?? '')
  const [gradeLevel,   setGradeLevel]   = useState(profile?.grade_level ?? '')
  const [pronouns,     setPronouns]     = useState(profile?.pronouns ?? '')
  const [accentColor,  setAccentColor]  = useState(profile?.accent_color ?? '#185FA5')
  const [avatarUrl,    setAvatarUrl]    = useState(profile?.avatar_url ?? '')
  const [newPass,      setNewPass]      = useState('')
  const [saving,       setSaving]       = useState(false)
  const [success,      setSuccess]      = useState('')
  const [error,        setError]        = useState('')
  const [resetEmail,   setResetEmail]   = useState(profile?.email ?? '')
  const [resetSent,    setResetSent]    = useState(false)
  const [resetting,    setResetting]    = useState(false)

  const inp: React.CSSProperties = { width: '100%', padding: '9px 11px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', marginBottom: 14, color: '#111', background: '#fff', outline: 'none', boxSizing: 'border-box' as const }
  const lbl: React.CSSProperties = { display: 'block', fontSize: 11, fontWeight: 600, color: '#666', marginBottom: 4 }
  const CARD: React.CSSProperties = { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, padding: '24px 28px', marginBottom: 16 }

  async function save() {
    if (!fullName.trim()) { setError('Name is required.'); return }
    setSaving(true); setError(''); setSuccess('')
    const update: any = {
      full_name: fullName.trim(),
      bio: bio.trim() || null,
      updated_at: new Date().toISOString(),
    }
    if (isStudent) {
      update.student_class = studentClass.trim() || null
      update.grade_level = gradeLevel.trim() || null
      update.pronouns = pronouns.trim() || null
      update.accent_color = accentColor
    } else {
      update.subject_specialty = subject.trim() || null
    }
    const { error: err } = await supabase.from('profiles').update(update).eq('id', profile.id)
    if (err) { setError(err.message); setSaving(false); return }
    if (newPass.trim()) {
      if (newPass.length < 6) { setError('Password must be at least 6 characters.'); setSaving(false); return }
      const { error: perr } = await supabase.auth.updateUser({ password: newPass })
      if (perr) { setError(perr.message); setSaving(false); return }
      setNewPass('')
    }
    setSuccess('Profile saved!')
    setSaving(false)
  }

  async function sendReset() {
    if (!resetEmail.trim()) return
    setResetting(true)
    const { error: err } = await supabase.auth.resetPasswordForEmail(resetEmail.trim(), {
      redirectTo: `${window.location.origin}/auth/callback?next=/student/profile`,
    })
    if (err) { setError(err.message) } else { setResetSent(true) }
    setResetting(false)
  }

  return (
    <div style={{ maxWidth: 560 }}>
      <PageHeader title="Nastavení profilu" sub="Spravuj svůj účet a přizpůsob si prostředí" />

      {/* ── Avatar ── */}
      <div style={CARD}>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 16 }}>Profile photo</div>
        <AvatarUpload url={avatarUrl} name={fullName || profile?.full_name} accent={accentColor} onUpload={setAvatarUrl} />
      </div>

      {/* ── Basic info ── */}
      <div style={CARD}>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 16 }}>Basic info</div>
        <label style={lbl}>Full name</label>
        <input style={inp} value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Your full name" />
        <label style={lbl}>Email</label>
        <input style={{ ...inp, background: '#f9fafb', color: '#888', cursor: 'not-allowed' }} value={profile?.email ?? ''} readOnly />
        <label style={lbl}>Bio (optional)</label>
        <textarea style={{ ...inp, height: 72, resize: 'vertical' }} value={bio} onChange={e => setBio(e.target.value)} placeholder="Pár slov o sobě…" />
      </div>

      {/* ── Student-only fields ── */}
      {isStudent && (
        <div style={CARD}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 16 }}>Student details</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 0 }}>
            <div>
              <label style={lbl}>Class / Group</label>
              <input style={{ ...inp, marginBottom: 0 }} value={studentClass} onChange={e => setStudentClass(e.target.value)} placeholder="např. 3B, Alfa" />
            </div>
            <div>
              <label style={lbl}>Grade / Year</label>
              <input style={{ ...inp, marginBottom: 0 }} value={gradeLevel} onChange={e => setGradeLevel(e.target.value)} placeholder="např. 10. ročník" />
            </div>
          </div>
          <div style={{ marginTop: 14 }}>
            <label style={lbl}>Pronouns (optional)</label>
            <input style={inp} value={pronouns} onChange={e => setPronouns(e.target.value)} placeholder="např. ona, on, oni" />
          </div>
        </div>
      )}

      {/* ── Teacher-only fields ── */}
      {!isStudent && (
        <div style={CARD}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 16 }}>Teacher details</div>
          <label style={lbl}>Subject specialty</label>
          <input style={inp} value={subject} onChange={e => setSubject(e.target.value)} placeholder="např. Fyzika a přírodní vědy" />
        </div>
      )}

      {/* ── Accent colour (students) ── */}
      {isStudent && (
        <div style={CARD}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6 }}>Theme colour</div>
          <div style={{ fontSize: 12, color: '#888', marginBottom: 14 }}>Personalises your dashboard and progress rings.</div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {ACCENT_COLORS.map(({ label, value }) => (
              <button key={value} onClick={() => setAccentColor(value)} title={label}
                style={{ width: 32, height: 32, borderRadius: '50%', background: value, border: accentColor === value ? '3px solid #111' : '3px solid transparent', cursor: 'pointer', boxShadow: accentColor === value ? `0 0 0 2px #fff, 0 0 0 4px ${value}` : 'none', transition: 'all .15s' }} />
            ))}
          </div>
          <div style={{ marginTop: 10, fontSize: 12, color: '#888' }}>
            Selected: <span style={{ fontWeight: 600, color: accentColor }}>{ACCENT_COLORS.find(c => c.value === accentColor)?.label ?? accentColor}</span>
          </div>
        </div>
      )}

      {/* ── Password ── */}
      <div style={CARD}>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 16 }}>Change password</div>
        <label style={lbl}>New password (leave blank to keep current)</label>
        <input style={inp} type="password" value={newPass} onChange={e => setNewPass(e.target.value)} placeholder="••••••••" />
      </div>

      {error   && <div style={{ fontSize: 13, padding: '10px 14px', background: '#fef2f2', color: '#dc2626', borderRadius: 10, marginBottom: 12 }}>{error}</div>}
      {success && <div style={{ fontSize: 13, padding: '10px 14px', background: '#f0fdf4', color: '#16a34a', borderRadius: 10, marginBottom: 12 }}>✓ {success}</div>}

      <button onClick={save} disabled={saving}
        style={{ width: '100%', padding: '11px', background: accentColor, color: '#fff', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? .7 : 1, marginBottom: 16 }}>
        {saving ? 'Saving…' : 'Save changes'}
      </button>

      {/* ── Forgot password ── */}
      <div style={CARD}>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6 }}>Forgot your password?</div>
        <div style={{ fontSize: 13, color: '#888', marginBottom: 12 }}>Send a reset link to your email.</div>
        <label style={lbl}>Email address</label>
        <input style={inp} value={resetEmail} onChange={e => setResetEmail(e.target.value)} type="email" />
        {resetSent
          ? <div style={{ fontSize: 13, padding: '9px 12px', background: '#f0fdf4', color: '#16a34a', borderRadius: 8 }}>✓ Reset email sent — check your inbox.</div>
          : <button onClick={sendReset} disabled={resetting || !resetEmail.trim()}
              style={{ width: '100%', padding: '9px', background: '#f9fafb', color: '#333', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer', opacity: resetting ? .6 : 1 }}>
              {resetting ? 'Sending…' : 'Send reset email'}
            </button>
        }
      </div>
    </div>
  )
}
