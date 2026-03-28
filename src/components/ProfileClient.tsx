'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'

const ACCENT_COLORS = [
  { label: 'Oceán',     value: '#185FA5' },
  { label: 'Fialová',  value: '#6c47ff' },
  { label: 'Les',      value: '#16a34a' },
  { label: 'Jantarová',value: '#d97706' },
  { label: 'Růžová',   value: '#e06c75' },
  { label: 'Tyrkysová',value: '#0d9488' },
  { label: 'Břidlice', value: '#475569' },
  { label: 'Fuchsie',  value: '#a21caf' },
  { label: 'Červená',  value: '#dc2626' },
  { label: 'Indigo',   value: '#4338ca' },
]

const TABS_STUDENT = ['Profil', 'Vzhled', 'Zabezpečení'] as const
const TABS_TEACHER = ['Profil', 'Zabezpečení'] as const

function Avatar({ src, name, accent, size = 80 }: { src?: string | null; name: string; accent: string; size?: number }) {
  const initials = (name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
  if (src) return <img src={src} alt={name} style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', border: `3px solid ${accent}44`, boxShadow: '0 2px 12px rgba(0,0,0,.1)' }} />
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: accent + '20', color: accent, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.32, fontWeight: 700, border: `3px solid ${accent}33`, boxShadow: '0 2px 12px rgba(0,0,0,.06)' }}>
      {initials}
    </div>
  )
}

export default function ProfileClient({ profile }: { profile: any }) {
  const supabase = createClient()
  const isStudent = profile?.role === 'student'
  const tabs = isStudent ? TABS_STUDENT : TABS_TEACHER
  const [activeTab, setActiveTab] = useState<string>(tabs[0])

  // Profile fields
  const [fullName,     setFullName]     = useState(profile?.full_name ?? '')
  const [bio,          setBio]          = useState(profile?.bio ?? '')
  const [subject,      setSubject]      = useState(profile?.subject_specialty ?? '')
  const [studentClass, setStudentClass] = useState(profile?.student_class ?? '')
  const [gradeLevel,   setGradeLevel]   = useState(profile?.grade_level ?? '')
  const [pronouns,     setPronouns]     = useState(profile?.pronouns ?? '')
  // Appearance
  const [accentColor,  setAccentColor]  = useState(profile?.accent_color ?? '#185FA5')
  const [avatarUrl,    setAvatarUrl]    = useState(profile?.avatar_url ?? '')
  // Security
  const [newPass,      setNewPass]      = useState('')
  const [confirmPass,  setConfirmPass]  = useState('')
  const [resetSent,    setResetSent]    = useState(false)
  // State
  const [saving,       setSaving]       = useState(false)
  const [uploading,    setUploading]    = useState(false)
  const [success,      setSuccess]      = useState('')
  const [error,        setError]        = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const inp: React.CSSProperties = { width: '100%', padding: '9px 12px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', color: '#111', background: '#fff', outline: 'none', boxSizing: 'border-box' as const }
  const lbl: React.CSSProperties = { display: 'block', fontSize: 11, fontWeight: 700, color: '#555', marginBottom: 5, textTransform: 'uppercase' as const, letterSpacing: '.04em' }
  const fieldWrap: React.CSSProperties = { marginBottom: 18 }

  async function uploadAvatar(e: React.ChangeEvent<HTMLInputElement>) {
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
    setAvatarUrl(publicUrl); setUploading(false)
    setSuccess('Fotka aktualizována!')
    setTimeout(() => setSuccess(''), 3000)
  }

  async function saveProfile() {
    if (!fullName.trim()) { setError('Jméno je povinné.'); return }
    setSaving(true); setError(''); setSuccess('')
    const update: any = { full_name: fullName.trim(), bio: bio.trim() || null, updated_at: new Date().toISOString() }
    if (isStudent) {
      Object.assign(update, { student_class: studentClass.trim() || null, grade_level: gradeLevel.trim() || null, pronouns: pronouns.trim() || null, accent_color: accentColor })
    } else {
      update.subject_specialty = subject.trim() || null
    }
    const { error: err } = await supabase.from('profiles').update(update).eq('id', profile.id)
    if (err) { setError(err.message); setSaving(false); return }
    setSuccess('Profil uložen!'); setSaving(false)
    setTimeout(() => setSuccess(''), 3000)
  }

  async function saveAppearance() {
    setSaving(true); setError(''); setSuccess('')
    const { error: err } = await supabase.from('profiles').update({ accent_color: accentColor, updated_at: new Date().toISOString() }).eq('id', profile.id)
    if (err) { setError(err.message) } else { setSuccess('Vzhled uložen!') }
    setSaving(false); setTimeout(() => setSuccess(''), 3000)
  }

  async function changePassword() {
    setError(''); setSuccess('')
    if (newPass.length < 6) { setError('Heslo musí mít alespoň 6 znaků.'); return }
    if (newPass !== confirmPass) { setError('Hesla se neshodují.'); return }
    setSaving(true)
    const { error: err } = await supabase.auth.updateUser({ password: newPass })
    if (err) { setError(err.message) } else { setSuccess('Heslo změněno!'); setNewPass(''); setConfirmPass('') }
    setSaving(false); setTimeout(() => setSuccess(''), 3000)
  }

  async function sendReset() {
    const { error: err } = await supabase.auth.resetPasswordForEmail(profile?.email ?? '', {
      redirectTo: `${window.location.origin}/auth/callback`,
    })
    if (!err) setResetSent(true)
    else setError(err.message)
  }

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>

      {/* ── Page header ── */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 4px', color: '#111' }}>Nastavení profilu</h1>
        <p style={{ fontSize: 13, color: '#888', margin: 0 }}>Spravuj svůj účet a přizpůsob si prostředí</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 24, alignItems: 'start' }}>

        {/* ── LEFT: Profile card preview ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Preview card */}
          <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 16, overflow: 'hidden', boxShadow: '0 2px 12px rgba(0,0,0,.04)' }}>
            <div style={{ height: 6, background: isStudent ? accentColor : '#185FA5' }} />
            <div style={{ padding: '24px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
              {/* Avatar with upload button */}
              <div style={{ position: 'relative', marginBottom: 16 }}>
                <Avatar src={avatarUrl} name={fullName || 'Jméno'} accent={isStudent ? accentColor : '#185FA5'} size={88} />
                <button onClick={() => fileRef.current?.click()} disabled={uploading}
                  style={{ position: 'absolute', bottom: 2, right: 2, width: 26, height: 26, borderRadius: '50%', background: isStudent ? accentColor : '#185FA5', border: '2px solid #fff', color: '#fff', fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 8px rgba(0,0,0,.2)' }}>
                  {uploading ? '…' : '✎'}
                </button>
                <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={uploadAvatar} />
              </div>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#111', marginBottom: 2 }}>{fullName || 'Tvoje jméno'}</div>
              <div style={{ fontSize: 12, color: '#888', marginBottom: 6 }}>{profile?.email}</div>
              {bio && <div style={{ fontSize: 12, color: '#666', lineHeight: 1.5, marginBottom: 6 }}>{bio}</div>}
              {isStudent && (studentClass || gradeLevel) && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'center', marginTop: 4 }}>
                  {studentClass && <span style={{ fontSize: 11, padding: '2px 8px', background: accentColor + '15', color: accentColor, borderRadius: 20, fontWeight: 600 }}>🏫 {studentClass}</span>}
                  {gradeLevel && <span style={{ fontSize: 11, padding: '2px 8px', background: accentColor + '15', color: accentColor, borderRadius: 20, fontWeight: 600 }}>📚 {gradeLevel}</span>}
                  {pronouns && <span style={{ fontSize: 11, padding: '2px 8px', background: '#f3f4f6', color: '#666', borderRadius: 20 }}>({pronouns})</span>}
                </div>
              )}
              {!isStudent && subject && (
                <div style={{ fontSize: 12, color: '#185FA5', fontWeight: 500, marginTop: 4 }}>{subject}</div>
              )}
            </div>
            <div style={{ borderTop: '1px solid #f3f4f6', padding: '10px 16px' }}>
              <div style={{ fontSize: 10, color: '#bbb', textAlign: 'center', textTransform: 'uppercase', letterSpacing: '.06em' }}>
                {isStudent ? 'Student' : 'Učitel'} · ClassBase
              </div>
            </div>
          </div>

          {/* Upload hint */}
          <div style={{ fontSize: 11, color: '#aaa', textAlign: 'center', lineHeight: 1.5 }}>
            Klikni na ✎ pro změnu fotky<br />JPG, PNG · max 2 MB
          </div>
        </div>

        {/* ── RIGHT: Tabbed settings ── */}
        <div>
          {/* Tabs */}
          <div style={{ display: 'flex', gap: 2, background: '#f3f4f6', borderRadius: 10, padding: 4, marginBottom: 24, width: 'fit-content' }}>
            {tabs.map(tab => (
              <button key={tab} onClick={() => { setActiveTab(tab); setError(''); setSuccess('') }}
                style={{ padding: '7px 18px', borderRadius: 7, border: 'none', fontSize: 13, fontWeight: 500, cursor: 'pointer', background: activeTab === tab ? '#fff' : 'transparent', color: activeTab === tab ? '#111' : '#666', boxShadow: activeTab === tab ? '0 1px 4px rgba(0,0,0,.08)' : 'none', transition: 'all .15s' }}>
                {tab}
              </button>
            ))}
          </div>

          {/* ── TAB: Profil ── */}
          {activeTab === 'Profil' && (
            <div>
              <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, padding: '24px 28px', marginBottom: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#111', marginBottom: 20, paddingBottom: 12, borderBottom: '1px solid #f3f4f6' }}>Základní informace</div>
                <div style={fieldWrap}>
                  <label style={lbl}>Celé jméno</label>
                  <input style={inp} value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Vaše celé jméno" />
                </div>
                <div style={fieldWrap}>
                  <label style={lbl}>E-mail</label>
                  <input style={{ ...inp, background: '#f9fafb', color: '#aaa', cursor: 'not-allowed' }} value={profile?.email ?? ''} readOnly />
                  <div style={{ fontSize: 11, color: '#bbb', marginTop: 4 }}>E-mail nelze změnit</div>
                </div>
                <div style={{ ...fieldWrap, marginBottom: 0 }}>
                  <label style={lbl}>Krátký popis <span style={{ fontWeight: 400, textTransform: 'none', color: '#bbb' }}>(nepovinné)</span></label>
                  <textarea style={{ ...inp, height: 80, resize: 'vertical' }} value={bio} onChange={e => setBio(e.target.value)} placeholder="Pár slov o sobě…" />
                </div>
              </div>

              {isStudent && (
                <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, padding: '24px 28px', marginBottom: 16 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#111', marginBottom: 20, paddingBottom: 12, borderBottom: '1px solid #f3f4f6' }}>Studijní údaje</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                    <div>
                      <label style={lbl}>Třída / Skupina</label>
                      <input style={inp} value={studentClass} onChange={e => setStudentClass(e.target.value)} placeholder="např. 3B" />
                    </div>
                    <div>
                      <label style={lbl}>Ročník</label>
                      <input style={inp} value={gradeLevel} onChange={e => setGradeLevel(e.target.value)} placeholder="např. 3. ročník" />
                    </div>
                  </div>
                  <div>
                    <label style={lbl}>Zájmena <span style={{ fontWeight: 400, textTransform: 'none', color: '#bbb' }}>(nepovinné)</span></label>
                    <input style={inp} value={pronouns} onChange={e => setPronouns(e.target.value)} placeholder="např. on/jeho, ona/její, oni/jejich" />
                  </div>
                </div>
              )}

              {!isStudent && (
                <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, padding: '24px 28px', marginBottom: 16 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#111', marginBottom: 20, paddingBottom: 12, borderBottom: '1px solid #f3f4f6' }}>Učitelské údaje</div>
                  <div>
                    <label style={lbl}>Aprobace / Předmět</label>
                    <input style={inp} value={subject} onChange={e => setSubject(e.target.value)} placeholder="např. Matematika, Fyzika" />
                  </div>
                </div>
              )}

              {error   && <div style={{ fontSize: 13, padding: '10px 14px', background: '#fef2f2', color: '#dc2626', borderRadius: 10, marginBottom: 12 }}>⚠ {error}</div>}
              {success && <div style={{ fontSize: 13, padding: '10px 14px', background: '#f0fdf4', color: '#16a34a', borderRadius: 10, marginBottom: 12 }}>✓ {success}</div>}

              <button onClick={saveProfile} disabled={saving}
                style={{ padding: '11px 28px', background: isStudent ? accentColor : '#185FA5', color: '#fff', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? .7 : 1 }}>
                {saving ? 'Ukládání…' : 'Uložit změny'}
              </button>
            </div>
          )}

          {/* ── TAB: Vzhled (students only) ── */}
          {activeTab === 'Vzhled' && isStudent && (
            <div>
              <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, padding: '24px 28px', marginBottom: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#111', marginBottom: 6, paddingBottom: 12, borderBottom: '1px solid #f3f4f6' }}>Barva motivu</div>
                <div style={{ fontSize: 13, color: '#888', margin: '16px 0 20px' }}>
                  Vybraná barva se projeví v dashboardu, kruzích pokroku a zvýrazněných prvcích.
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 20 }}>
                  {ACCENT_COLORS.map(({ label, value }) => (
                    <button key={value} onClick={() => setAccentColor(value)} title={label}
                      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '10px 6px', border: `2px solid ${accentColor === value ? value : '#e5e7eb'}`, borderRadius: 10, background: accentColor === value ? value + '10' : '#fff', cursor: 'pointer', transition: 'all .15s' }}>
                      <div style={{ width: 28, height: 28, borderRadius: '50%', background: value, boxShadow: accentColor === value ? `0 0 0 3px #fff, 0 0 0 5px ${value}` : 'none' }} />
                      <span style={{ fontSize: 10, color: accentColor === value ? value : '#888', fontWeight: accentColor === value ? 700 : 400 }}>{label}</span>
                    </button>
                  ))}
                </div>

                {/* Live preview strip */}
                <div style={{ background: '#f9fafb', borderRadius: 10, padding: '14px 16px', marginBottom: 4 }}>
                  <div style={{ fontSize: 11, color: '#aaa', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '.05em' }}>Náhled</div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    <div style={{ width: 36, height: 36, borderRadius: '50%', background: accentColor + '20', color: accentColor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700 }}>
                      {(fullName || 'Jméno').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ height: 6, borderRadius: 10, background: '#f0f0f0', overflow: 'hidden', marginBottom: 4 }}>
                        <div style={{ height: '100%', width: '65%', background: accentColor, borderRadius: 10 }} />
                      </div>
                      <div style={{ fontSize: 11, color: accentColor, fontWeight: 600 }}>65% dokončeno</div>
                    </div>
                    <span style={{ fontSize: 12, padding: '3px 10px', background: accentColor, color: '#fff', borderRadius: 20, fontWeight: 600 }}>Aktivní</span>
                  </div>
                </div>
              </div>

              {error   && <div style={{ fontSize: 13, padding: '10px 14px', background: '#fef2f2', color: '#dc2626', borderRadius: 10, marginBottom: 12 }}>⚠ {error}</div>}
              {success && <div style={{ fontSize: 13, padding: '10px 14px', background: '#f0fdf4', color: '#16a34a', borderRadius: 10, marginBottom: 12 }}>✓ {success}</div>}

              <button onClick={saveAppearance} disabled={saving}
                style={{ padding: '11px 28px', background: accentColor, color: '#fff', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? .7 : 1 }}>
                {saving ? 'Ukládání…' : 'Uložit vzhled'}
              </button>
            </div>
          )}

          {/* ── TAB: Zabezpečení ── */}
          {activeTab === 'Zabezpečení' && (
            <div>
              <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, padding: '24px 28px', marginBottom: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#111', marginBottom: 20, paddingBottom: 12, borderBottom: '1px solid #f3f4f6' }}>Změna hesla</div>
                <div style={fieldWrap}>
                  <label style={lbl}>Nové heslo</label>
                  <input style={inp} type="password" value={newPass} onChange={e => setNewPass(e.target.value)} placeholder="Alespoň 6 znaků" />
                </div>
                <div style={{ ...fieldWrap, marginBottom: 0 }}>
                  <label style={lbl}>Nové heslo znovu</label>
                  <input style={{ ...inp, borderColor: confirmPass && newPass !== confirmPass ? '#fca5a5' : confirmPass && newPass === confirmPass ? '#86efac' : '#e5e7eb' }}
                    type="password" value={confirmPass} onChange={e => setConfirmPass(e.target.value)} placeholder="Zopakujte heslo" />
                  {confirmPass && newPass !== confirmPass && <div style={{ fontSize: 11, color: '#dc2626', marginTop: 4 }}>Hesla se neshodují</div>}
                  {confirmPass && newPass === confirmPass && <div style={{ fontSize: 11, color: '#16a34a', marginTop: 4 }}>✓ Hesla se shodují</div>}
                </div>
              </div>

              {error   && <div style={{ fontSize: 13, padding: '10px 14px', background: '#fef2f2', color: '#dc2626', borderRadius: 10, marginBottom: 12 }}>⚠ {error}</div>}
              {success && <div style={{ fontSize: 13, padding: '10px 14px', background: '#f0fdf4', color: '#16a34a', borderRadius: 10, marginBottom: 12 }}>✓ {success}</div>}

              <button onClick={changePassword} disabled={saving || !newPass || newPass !== confirmPass}
                style={{ padding: '11px 28px', background: '#185FA5', color: '#fff', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer', opacity: saving || !newPass || newPass !== confirmPass ? .5 : 1, marginBottom: 24 }}>
                {saving ? 'Ukládání…' : 'Změnit heslo'}
              </button>

              <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, padding: '24px 28px' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#111', marginBottom: 6 }}>Zapomenuté heslo</div>
                <div style={{ fontSize: 13, color: '#888', marginBottom: 16, lineHeight: 1.5 }}>
                  Pošleme vám odkaz pro obnovení hesla na <strong>{profile?.email}</strong>.
                </div>
                {resetSent
                  ? <div style={{ fontSize: 13, padding: '10px 14px', background: '#f0fdf4', color: '#16a34a', borderRadius: 10 }}>✓ E-mail odeslán — zkontrolujte svou schránku.</div>
                  : <button onClick={sendReset}
                      style={{ padding: '9px 20px', background: '#f9fafb', color: '#333', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
                      Odeslat odkaz pro obnovení
                    </button>
                }
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Mobile: stack columns */}
      <style>{`
        @media (max-width: 700px) {
          div[style*="grid-template-columns: 260px"] { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  )
}
