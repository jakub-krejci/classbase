'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

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

const STATUS_SUGGESTIONS = [
  '📖 Čtu kapitolu…',
  '🎯 Připravuji se na zkoušku',
  '💻 Pracuji na projektu',
  '🏖 Na dovolené',
  '📝 Píšu poznámky',
  '🔬 Laboratorní práce',
  '🤔 Přemýšlím…',
  '✅ Vše hotovo!',
]

const TABS_STUDENT = ['Profil', 'Vzhled', 'Zabezpečení', 'Účet'] as const
const TABS_TEACHER = ['Profil', 'Zabezpečení', 'Účet'] as const

function Avatar({ src, name, accent, size = 80 }: { src?: string | null; name: string; accent: string; size?: number }) {
  const initials = (name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
  if (src) return <img src={src} alt={name} style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', border: `3px solid rgba(255,255,255,.7)`, boxShadow: '0 2px 12px rgba(0,0,0,.15)' }} />
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: accent + '25', color: accent, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.32, fontWeight: 700, border: `3px solid rgba(255,255,255,.7)`, boxShadow: '0 2px 12px rgba(0,0,0,.1)' }}>
      {initials}
    </div>
  )
}

function formatDate(iso?: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'long', year: 'numeric' })
}

function formatDateTime(iso?: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('cs-CZ', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

// Delete confirmation modal
function DeleteModal({ onConfirm, onCancel, loading }: { onConfirm: () => void; onCancel: () => void; loading: boolean }) {
  const [typed, setTyped] = useState('')
  return (
    <>
      <div onClick={onCancel} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 9998, backdropFilter: 'blur(2px)' }} />
      <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', zIndex: 9999, width: '100%', maxWidth: 440, padding: '0 16px' }}>
        <div style={{ background: '#fff', borderRadius: 16, padding: '32px', boxShadow: '0 24px 64px rgba(0,0,0,.2)' }}>
          <div style={{ fontSize: 36, textAlign: 'center', marginBottom: 12 }}>⚠️</div>
          <h2 style={{ fontSize: 18, fontWeight: 700, textAlign: 'center', margin: '0 0 8px', color: '#111' }}>Smazat účet</h2>
          <p style={{ fontSize: 13, color: '#666', textAlign: 'center', lineHeight: 1.6, margin: '0 0 20px' }}>
            Tato akce je <strong>nevratná</strong>. Budou smazána všechna vaše data, pokrok, výsledky testů a nastavení.
          </p>
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '12px 16px', marginBottom: 20, fontSize: 13, color: '#dc2626', lineHeight: 1.5 }}>
            Pro potvrzení napište <strong>SMAZAT</strong> do pole níže:
          </div>
          <input
            value={typed} onChange={e => setTyped(e.target.value)}
            placeholder="SMAZAT"
            style={{ width: '100%', padding: '10px 12px', border: `2px solid ${typed === 'SMAZAT' ? '#dc2626' : '#e5e7eb'}`, borderRadius: 8, fontSize: 14, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box', marginBottom: 16, textAlign: 'center', letterSpacing: '.1em', fontWeight: 600, color: '#dc2626' }}
          />
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={onCancel} style={{ flex: 1, padding: '10px', background: '#f3f4f6', color: '#444', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
              Zrušit
            </button>
            <button onClick={onConfirm} disabled={typed !== 'SMAZAT' || loading}
              style={{ flex: 1, padding: '10px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: typed === 'SMAZAT' && !loading ? 'pointer' : 'not-allowed', opacity: typed === 'SMAZAT' && !loading ? 1 : .4 }}>
              {loading ? 'Mazání…' : 'Smazat účet'}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

export default function ProfileClient({ profile }: { profile: any }) {
  const supabase = createClient()
  const router = useRouter()
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
  const [customStatus, setCustomStatus] = useState(profile?.custom_status ?? '')
  // Appearance
  const [accentColor,  setAccentColor]  = useState(profile?.accent_color ?? '#185FA5')
  const [avatarUrl,    setAvatarUrl]    = useState(profile?.avatar_url ?? '')
  const [bannerUrl,    setBannerUrl]    = useState(profile?.banner_url ?? '')
  // Security
  const [newPass,      setNewPass]      = useState('')
  const [confirmPass,  setConfirmPass]  = useState('')
  const [resetSent,    setResetSent]    = useState(false)
  // UI state
  const [saving,       setSaving]       = useState(false)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [uploadingBanner, setUploadingBanner] = useState(false)
  const [success,      setSuccess]      = useState('')
  const [error,        setError]        = useState('')
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deleting,     setDeleting]     = useState(false)
  const avatarRef = useRef<HTMLInputElement>(null)
  const bannerRef = useRef<HTMLInputElement>(null)

  const accent = isStudent ? accentColor : '#185FA5'
  const inp: React.CSSProperties = { width: '100%', padding: '9px 12px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', color: '#111', background: '#fff', outline: 'none', boxSizing: 'border-box' as const }
  const lbl: React.CSSProperties = { display: 'block', fontSize: 11, fontWeight: 700, color: '#555', marginBottom: 5, textTransform: 'uppercase' as const, letterSpacing: '.04em' }
  const fw: React.CSSProperties = { marginBottom: 18 }

  function flash(msg: string, isError = false) {
    if (isError) { setError(msg); setTimeout(() => setError(''), 4000) }
    else { setSuccess(msg); setTimeout(() => setSuccess(''), 3000) }
  }

  async function uploadFile(file: File, folder: string): Promise<string | null> {
    if (file.size > 5 * 1024 * 1024) { flash('Soubor musí být menší než 5 MB', true); return null }
    const ext = file.name.split('.').pop()
    const path = `${folder}/${crypto.randomUUID()}.${ext}`
    const { error: upErr } = await supabase.storage.from('avatars').upload(path, file, { upsert: true })
    if (upErr) { flash(upErr.message, true); return null }
    return supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl
  }

  async function uploadAvatar(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return
    setUploadingAvatar(true)
    const url = await uploadFile(file, 'avatars')
    if (url) {
      await supabase.from('profiles').update({ avatar_url: url }).eq('id', profile.id)
      setAvatarUrl(url); flash('Fotka aktualizována!')
    }
    setUploadingAvatar(false)
  }

  async function uploadBanner(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return
    setUploadingBanner(true)
    const url = await uploadFile(file, 'banners')
    if (url) {
      await supabase.from('profiles').update({ banner_url: url }).eq('id', profile.id)
      setBannerUrl(url); flash('Banner aktualizován!')
    }
    setUploadingBanner(false)
  }

  async function removeBanner() {
    await supabase.from('profiles').update({ banner_url: null }).eq('id', profile.id)
    setBannerUrl(''); flash('Banner odstraněn')
  }

  async function saveProfile() {
    if (!fullName.trim()) { flash('Jméno je povinné.', true); return }
    setSaving(true)
    const update: any = { full_name: fullName.trim(), bio: bio.trim() || null, custom_status: customStatus.trim() || null, updated_at: new Date().toISOString() }
    if (isStudent) Object.assign(update, { student_class: studentClass.trim() || null, grade_level: gradeLevel.trim() || null, pronouns: pronouns.trim() || null, accent_color: accentColor })
    else update.subject_specialty = subject.trim() || null
    const { error: err } = await supabase.from('profiles').update(update).eq('id', profile.id)
    if (err) flash(err.message, true); else flash('Profil uložen!')
    setSaving(false)
  }

  async function saveAppearance() {
    setSaving(true)
    const { error: err } = await supabase.from('profiles').update({ accent_color: accentColor, updated_at: new Date().toISOString() }).eq('id', profile.id)
    if (err) flash(err.message, true); else flash('Vzhled uložen!')
    setSaving(false)
  }

  async function changePassword() {
    if (newPass.length < 6) { flash('Heslo musí mít alespoň 6 znaků.', true); return }
    if (newPass !== confirmPass) { flash('Hesla se neshodují.', true); return }
    setSaving(true)
    const { error: err } = await supabase.auth.updateUser({ password: newPass })
    if (err) flash(err.message, true); else { flash('Heslo změněno!'); setNewPass(''); setConfirmPass('') }
    setSaving(false)
  }

  async function sendReset() {
    const { error: err } = await supabase.auth.resetPasswordForEmail(profile?.email ?? '', { redirectTo: `${window.location.origin}/auth/callback` })
    if (err) flash(err.message, true); else setResetSent(true)
  }

  async function deleteAccount() {
    setDeleting(true)
    const res = await fetch('/api/delete-account', { method: 'DELETE' })
    if (!res.ok) { const d = await res.json(); flash(d.error ?? 'Chyba při mazání účtu', true); setDeleting(false); setShowDeleteModal(false); return }
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      {showDeleteModal && <DeleteModal onConfirm={deleteAccount} onCancel={() => setShowDeleteModal(false)} loading={deleting} />}

      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 4px', color: '#111' }}>Nastavení profilu</h1>
        <p style={{ fontSize: 13, color: '#888', margin: 0 }}>Spravuj svůj účet a přizpůsob si prostředí</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 24, alignItems: 'start' }} className="profile-grid">

        {/* ── LEFT: Preview card ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 16, overflow: 'hidden', boxShadow: '0 2px 12px rgba(0,0,0,.04)' }}>
            {/* Banner */}
            <div style={{ height: 80, background: bannerUrl ? `url(${bannerUrl}) center/cover no-repeat` : `linear-gradient(135deg, ${accent}40 0%, ${accent}15 100%)`, position: 'relative' }}>
              <button onClick={() => bannerRef.current?.click()} disabled={uploadingBanner}
                style={{ position: 'absolute', top: 8, right: 8, padding: '4px 10px', background: 'rgba(0,0,0,.45)', color: '#fff', border: 'none', borderRadius: 6, fontSize: 11, cursor: 'pointer', backdropFilter: 'blur(4px)' }}>
                {uploadingBanner ? '…' : '✎ Banner'}
              </button>
              {bannerUrl && (
                <button onClick={removeBanner}
                  style={{ position: 'absolute', top: 8, right: 80, padding: '4px 8px', background: 'rgba(0,0,0,.45)', color: '#fff', border: 'none', borderRadius: 6, fontSize: 11, cursor: 'pointer', backdropFilter: 'blur(4px)' }}>
                  ✕
                </button>
              )}
              <input ref={bannerRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={uploadBanner} />
            </div>
            {/* Avatar overlapping banner */}
            <div style={{ padding: '0 16px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
              <div style={{ position: 'relative', marginTop: -36, marginBottom: 12 }}>
                <Avatar src={avatarUrl} name={fullName || 'Jméno'} accent={accent} size={72} />
                <button onClick={() => avatarRef.current?.click()} disabled={uploadingAvatar}
                  style={{ position: 'absolute', bottom: 2, right: 2, width: 24, height: 24, borderRadius: '50%', background: accent, border: '2px solid #fff', color: '#fff', fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 8px rgba(0,0,0,.2)' }}>
                  {uploadingAvatar ? '…' : '✎'}
                </button>
                <input ref={avatarRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={uploadAvatar} />
              </div>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#111', marginBottom: 2 }}>{fullName || 'Tvoje jméno'}</div>
              <div style={{ fontSize: 11, color: '#aaa', marginBottom: customStatus ? 6 : 0 }}>{profile?.email}</div>
              {customStatus && (
                <div style={{ fontSize: 12, color: '#555', background: '#f3f4f6', borderRadius: 20, padding: '3px 10px', marginBottom: 6 }}>{customStatus}</div>
              )}
              {bio && <div style={{ fontSize: 12, color: '#666', lineHeight: 1.5, marginBottom: 6 }}>{bio}</div>}
              {isStudent && (studentClass || gradeLevel) && (
                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', justifyContent: 'center', marginTop: 4 }}>
                  {studentClass && <span style={{ fontSize: 11, padding: '2px 8px', background: accent + '15', color: accent, borderRadius: 20, fontWeight: 600 }}>🏫 {studentClass}</span>}
                  {gradeLevel && <span style={{ fontSize: 11, padding: '2px 8px', background: accent + '15', color: accent, borderRadius: 20, fontWeight: 600 }}>📚 {gradeLevel}</span>}
                  {pronouns && <span style={{ fontSize: 11, padding: '2px 8px', background: '#f3f4f6', color: '#666', borderRadius: 20 }}>({pronouns})</span>}
                </div>
              )}
              {!isStudent && subject && <div style={{ fontSize: 12, color: '#185FA5', fontWeight: 500, marginTop: 4 }}>{subject}</div>}
            </div>
            <div style={{ borderTop: '1px solid #f3f4f6', padding: '10px 16px' }}>
              <div style={{ fontSize: 10, color: '#bbb', textAlign: 'center', textTransform: 'uppercase', letterSpacing: '.06em' }}>
                {isStudent ? 'Student' : 'Učitel'} · ClassBase
              </div>
            </div>
          </div>

          {/* Account info */}
          <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '14px 16px', fontSize: 12 }}>
            <div style={{ color: '#aaa', marginBottom: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', fontSize: 10 }}>Informace o účtu</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ color: '#888' }}>Člen od</span>
              <span style={{ color: '#111', fontWeight: 500 }}>{formatDate(profile?.created_at)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#888' }}>Poslední přihlášení</span>
              <span style={{ color: '#111', fontWeight: 500 }}>{formatDateTime(profile?.last_login_at)}</span>
            </div>
          </div>

          <div style={{ fontSize: 11, color: '#bbb', textAlign: 'center', lineHeight: 1.5 }}>
            Klikni na ✎ pro změnu fotky nebo banneru<br />max 5 MB
          </div>
        </div>

        {/* ── RIGHT: Tabs ── */}
        <div>
          <div style={{ display: 'flex', gap: 2, background: '#f3f4f6', borderRadius: 10, padding: 4, marginBottom: 24, width: 'fit-content' }}>
            {tabs.map(tab => (
              <button key={tab} onClick={() => { setActiveTab(tab); setError(''); setSuccess('') }}
                style={{ padding: '7px 18px', borderRadius: 7, border: 'none', fontSize: 13, fontWeight: 500, cursor: 'pointer', background: activeTab === tab ? '#fff' : 'transparent', color: activeTab === tab ? '#111' : '#666', boxShadow: activeTab === tab ? '0 1px 4px rgba(0,0,0,.08)' : 'none', transition: 'all .15s' }}>
                {tab}
              </button>
            ))}
          </div>

          {/* ── Profil ── */}
          {activeTab === 'Profil' && (
            <div>
              <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, padding: '24px 28px', marginBottom: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#111', marginBottom: 20, paddingBottom: 12, borderBottom: '1px solid #f3f4f6' }}>Základní informace</div>
                <div style={fw}><label style={lbl}>Celé jméno</label><input style={inp} value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Vaše celé jméno" /></div>
                <div style={fw}>
                  <label style={lbl}>E-mail</label>
                  <input style={{ ...inp, background: '#f9fafb', color: '#aaa', cursor: 'not-allowed' }} value={profile?.email ?? ''} readOnly />
                  <div style={{ fontSize: 11, color: '#bbb', marginTop: 4 }}>E-mail nelze změnit</div>
                </div>
                <div style={fw}>
                  <label style={lbl}>Vlastní status <span style={{ fontWeight: 400, textTransform: 'none', color: '#bbb' }}>(nepovinné)</span></label>
                  <input style={{ ...inp, marginBottom: 8 }} value={customStatus} onChange={e => setCustomStatus(e.target.value)} placeholder="např. 📖 Čtu kapitolu 4" maxLength={60} />
                  <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                    {STATUS_SUGGESTIONS.map(s => (
                      <button key={s} onClick={() => setCustomStatus(s)}
                        style={{ padding: '3px 9px', fontSize: 11, background: customStatus === s ? accent + '20' : '#f3f4f6', color: customStatus === s ? accent : '#555', border: `1px solid ${customStatus === s ? accent : '#e5e7eb'}`, borderRadius: 20, cursor: 'pointer' }}>
                        {s}
                      </button>
                    ))}
                    {customStatus && <button onClick={() => setCustomStatus('')}
                      style={{ padding: '3px 9px', fontSize: 11, background: '#fee2e2', color: '#dc2626', border: '1px solid #fca5a5', borderRadius: 20, cursor: 'pointer' }}>✕ Smazat</button>}
                  </div>
                </div>
                <div style={{ ...fw, marginBottom: 0 }}>
                  <label style={lbl}>Krátký popis <span style={{ fontWeight: 400, textTransform: 'none', color: '#bbb' }}>(nepovinné)</span></label>
                  <textarea style={{ ...inp, height: 72, resize: 'vertical' }} value={bio} onChange={e => setBio(e.target.value)} placeholder="Pár slov o sobě…" />
                </div>
              </div>

              {isStudent && (
                <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, padding: '24px 28px', marginBottom: 16 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#111', marginBottom: 20, paddingBottom: 12, borderBottom: '1px solid #f3f4f6' }}>Studijní údaje</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                    <div><label style={lbl}>Třída / Skupina</label><input style={inp} value={studentClass} onChange={e => setStudentClass(e.target.value)} placeholder="např. 3B" /></div>
                    <div><label style={lbl}>Ročník</label><input style={inp} value={gradeLevel} onChange={e => setGradeLevel(e.target.value)} placeholder="např. 3. ročník" /></div>
                  </div>
                  <div><label style={lbl}>Zájmena <span style={{ fontWeight: 400, textTransform: 'none', color: '#bbb' }}>(nepovinné)</span></label><input style={inp} value={pronouns} onChange={e => setPronouns(e.target.value)} placeholder="např. on/jeho, ona/její" /></div>
                </div>
              )}

              {!isStudent && (
                <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, padding: '24px 28px', marginBottom: 16 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#111', marginBottom: 20, paddingBottom: 12, borderBottom: '1px solid #f3f4f6' }}>Učitelské údaje</div>
                  <div><label style={lbl}>Aprobace / Předmět</label><input style={inp} value={subject} onChange={e => setSubject(e.target.value)} placeholder="např. Matematika, Fyzika" /></div>
                </div>
              )}

              {error   && <div style={{ fontSize: 13, padding: '10px 14px', background: '#fef2f2', color: '#dc2626', borderRadius: 10, marginBottom: 12 }}>⚠ {error}</div>}
              {success && <div style={{ fontSize: 13, padding: '10px 14px', background: '#f0fdf4', color: '#16a34a', borderRadius: 10, marginBottom: 12 }}>✓ {success}</div>}
              <button onClick={saveProfile} disabled={saving} style={{ padding: '11px 28px', background: accent, color: '#fff', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? .7 : 1 }}>
                {saving ? 'Ukládání…' : 'Uložit změny'}
              </button>
            </div>
          )}

          {/* ── Vzhled (students) ── */}
          {activeTab === 'Vzhled' && isStudent && (
            <div>
              {/* Banner upload */}
              <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, padding: '24px 28px', marginBottom: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#111', marginBottom: 20, paddingBottom: 12, borderBottom: '1px solid #f3f4f6' }}>Profilový banner</div>
                <div style={{ height: 100, borderRadius: 10, background: bannerUrl ? `url(${bannerUrl}) center/cover no-repeat` : `linear-gradient(135deg, ${accentColor}30, ${accentColor}10)`, border: '2px dashed #e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12, position: 'relative', overflow: 'hidden' }}>
                  {!bannerUrl && <span style={{ fontSize: 13, color: '#bbb' }}>Náhled banneru</span>}
                  {bannerUrl && <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ fontSize: 12, color: '#fff', fontWeight: 600 }}>Banner nastaven ✓</span>
                  </div>}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => bannerRef.current?.click()} disabled={uploadingBanner}
                    style={{ padding: '8px 16px', background: '#185FA5', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: uploadingBanner ? .6 : 1 }}>
                    {uploadingBanner ? 'Nahrávání…' : bannerUrl ? '🖼 Změnit banner' : '🖼 Nahrát banner'}
                  </button>
                  {bannerUrl && <button onClick={removeBanner} style={{ padding: '8px 14px', background: '#fee2e2', color: '#dc2626', border: '1px solid #fca5a5', borderRadius: 8, fontSize: 13, cursor: 'pointer' }}>Odebrat</button>}
                  <input ref={bannerRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={uploadBanner} />
                </div>
                <div style={{ fontSize: 11, color: '#bbb', marginTop: 8 }}>Doporučený formát: 1200 × 300 px · max 5 MB</div>
              </div>

              {/* Accent color */}
              <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, padding: '24px 28px', marginBottom: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#111', marginBottom: 6, paddingBottom: 12, borderBottom: '1px solid #f3f4f6' }}>Barva motivu</div>
                <div style={{ fontSize: 13, color: '#888', margin: '16px 0 20px' }}>Vybraná barva se projeví v dashboardu, kruzích pokroku a banneru.</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10, marginBottom: 20 }}>
                  {ACCENT_COLORS.map(({ label, value }) => (
                    <button key={value} onClick={() => setAccentColor(value)} title={label}
                      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '10px 6px', border: `2px solid ${accentColor === value ? value : '#e5e7eb'}`, borderRadius: 10, background: accentColor === value ? value + '10' : '#fff', cursor: 'pointer', transition: 'all .15s' }}>
                      <div style={{ width: 28, height: 28, borderRadius: '50%', background: value, boxShadow: accentColor === value ? `0 0 0 3px #fff, 0 0 0 5px ${value}` : 'none' }} />
                      <span style={{ fontSize: 10, color: accentColor === value ? value : '#888', fontWeight: accentColor === value ? 700 : 400 }}>{label}</span>
                    </button>
                  ))}
                </div>
                {/* Live preview */}
                <div style={{ background: '#f9fafb', borderRadius: 10, padding: '14px 16px' }}>
                  <div style={{ fontSize: 11, color: '#aaa', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '.05em' }}>Náhled</div>
                  <div style={{ height: 4, borderRadius: 10, background: accentColor, marginBottom: 10 }} />
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <div style={{ width: 32, height: 32, borderRadius: '50%', background: accentColor + '20', color: accentColor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700 }}>
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
              <button onClick={saveAppearance} disabled={saving} style={{ padding: '11px 28px', background: accentColor, color: '#fff', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? .7 : 1 }}>
                {saving ? 'Ukládání…' : 'Uložit vzhled'}
              </button>
            </div>
          )}

          {/* ── Zabezpečení ── */}
          {activeTab === 'Zabezpečení' && (
            <div>
              <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, padding: '24px 28px', marginBottom: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#111', marginBottom: 20, paddingBottom: 12, borderBottom: '1px solid #f3f4f6' }}>Změna hesla</div>
                <div style={fw}><label style={lbl}>Nové heslo</label><input style={inp} type="password" value={newPass} onChange={e => setNewPass(e.target.value)} placeholder="Alespoň 6 znaků" /></div>
                <div>
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
                style={{ padding: '11px 28px', background: '#185FA5', color: '#fff', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer', opacity: saving || !newPass || newPass !== confirmPass ? .4 : 1, marginBottom: 24 }}>
                {saving ? 'Ukládání…' : 'Změnit heslo'}
              </button>

              <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, padding: '24px 28px' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#111', marginBottom: 6 }}>Zapomenuté heslo</div>
                <div style={{ fontSize: 13, color: '#888', marginBottom: 16, lineHeight: 1.5 }}>Pošleme odkaz na <strong>{profile?.email}</strong>.</div>
                {resetSent
                  ? <div style={{ fontSize: 13, padding: '10px 14px', background: '#f0fdf4', color: '#16a34a', borderRadius: 10 }}>✓ E-mail odeslán — zkontrolujte svou schránku.</div>
                  : <button onClick={sendReset} style={{ padding: '9px 20px', background: '#f9fafb', color: '#333', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>Odeslat odkaz pro obnovení</button>
                }
              </div>
            </div>
          )}

          {/* ── Účet ── */}
          {activeTab === 'Účet' && (
            <div>
              <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, padding: '24px 28px', marginBottom: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#111', marginBottom: 20, paddingBottom: 12, borderBottom: '1px solid #f3f4f6' }}>Informace o účtu</div>
                {[
                  ['Role', isStudent ? 'Student' : 'Učitel'],
                  ['Člen od', formatDate(profile?.created_at)],
                  ['Poslední přihlášení', formatDateTime(profile?.last_login_at)],
                  ['ID účtu', profile?.id?.slice(0, 8) + '…'],
                ].map(([label, value]) => (
                  <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #f9fafb' }}>
                    <span style={{ fontSize: 13, color: '#888' }}>{label}</span>
                    <span style={{ fontSize: 13, color: '#111', fontWeight: 500 }}>{value}</span>
                  </div>
                ))}
              </div>

              <div style={{ background: '#fff', border: '1px solid #fecaca', borderRadius: 14, padding: '24px 28px' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#dc2626', marginBottom: 8 }}>🗑 Smazat účet</div>
                <p style={{ fontSize: 13, color: '#666', lineHeight: 1.6, margin: '0 0 16px' }}>
                  Smazání účtu je <strong>nevratné</strong>. Budou odstraněna všechna vaše data včetně pokroku, výsledků testů a nastavení. Tato akce je v souladu s GDPR.
                </p>
                <button onClick={() => setShowDeleteModal(true)}
                  style={{ padding: '9px 20px', background: '#fee2e2', color: '#dc2626', border: '1px solid #fca5a5', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                  Smazat účet
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <style>{`
        @media (max-width: 700px) {
          .profile-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  )
}
