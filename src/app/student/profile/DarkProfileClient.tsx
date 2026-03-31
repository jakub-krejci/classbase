'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { DarkLayout, D, card, SectionLabel } from '@/components/DarkLayout'

const ACCENT_COLORS = [
  { label: 'Oceán',     value: '#185FA5' },
  { label: 'Fialová',  value: '#7C3AED' },
  { label: 'Les',      value: '#16a34a' },
  { label: 'Jantarová',value: '#d97706' },
  { label: 'Růžová',   value: '#e06c75' },
  { label: 'Tyrkysová',value: '#0d9488' },
  { label: 'Břidlice', value: '#475569' },
  { label: 'Fuchsie',  value: '#a21caf' },
  { label: 'Červená',  value: '#dc2626' },
  { label: 'Indigo',   value: '#4338ca' },
]

const TABS = ['Profil', 'Vzhled', 'Soukromí', 'Zabezpečení', 'Účet'] as const

function DeleteModal({ onConfirm, onCancel, loading }: { onConfirm: () => void; onCancel: () => void; loading: boolean }) {
  const [typed, setTyped] = useState('')
  return (
    <>
      <div onClick={onCancel} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)', zIndex: 9998, backdropFilter: 'blur(4px)' }} />
      <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', zIndex: 9999, width: '100%', maxWidth: 440, padding: '0 16px' }}>
        <div style={{ background: D.bgCard, borderRadius: D.radius, padding: '32px', border: `1px solid rgba(239,68,68,.3)`, boxShadow: '0 24px 64px rgba(0,0,0,.5)' }}>
          <div style={{ fontSize: 36, textAlign: 'center', marginBottom: 12 }}>⚠️</div>
          <h2 style={{ fontSize: 18, fontWeight: 700, textAlign: 'center', margin: '0 0 8px', color: D.txtPri }}>Smazat účet</h2>
          <p style={{ fontSize: 13, color: D.txtSec, textAlign: 'center', lineHeight: 1.6, margin: '0 0 16px' }}>Tato akce je <strong style={{ color: D.txtPri }}>nevratná</strong>. Všechna data budou trvale smazána.</p>
          <div style={{ background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.2)', borderRadius: 10, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: D.danger }}>Napište <strong>SMAZAT</strong> pro potvrzení:</div>
          <input value={typed} onChange={e => setTyped(e.target.value)} placeholder="SMAZAT"
            style={{ width: '100%', padding: '10px 12px', background: D.bgMid, border: `2px solid ${typed === 'SMAZAT' ? D.danger : D.border}`, borderRadius: 8, fontSize: 14, color: D.txtPri, fontFamily: 'inherit', outline: 'none', textAlign: 'center', letterSpacing: '.1em', fontWeight: 700, marginBottom: 16 }} />
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={onCancel} style={{ flex: 1, padding: '10px', background: 'rgba(255,255,255,.06)', color: D.txtSec, border: `1px solid ${D.border}`, borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Zrušit</button>
            <button onClick={onConfirm} disabled={typed !== 'SMAZAT' || loading}
              style={{ flex: 1, padding: '10px', background: D.danger, color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: typed === 'SMAZAT' ? 'pointer' : 'not-allowed', opacity: typed === 'SMAZAT' && !loading ? 1 : .4, fontFamily: 'inherit' }}>
              {loading ? 'Mazání…' : 'Smazat účet'}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

export default function DarkProfileClient({ profile }: { profile: any }) {
  const supabase = createClient()
  const accent = profile?.accent_color ?? '#7C3AED'
  const [activeTab, setActiveTab] = useState<string>('Profil')

  const [fullName,     setFullName]     = useState(profile?.full_name ?? '')
  const [bio,          setBio]          = useState(profile?.bio ?? '')
  const [studentClass, setStudentClass] = useState(profile?.student_class ?? '')
  const [gradeLevel,   setGradeLevel]   = useState(profile?.grade_level ?? '')
  const [pronouns,     setPronouns]     = useState(profile?.pronouns ?? '')
  const [customStatus, setCustomStatus] = useState(profile?.custom_status ?? '')
  const [accentColor,  setAccentColor]  = useState(accent)
  const [avatarUrl,    setAvatarUrl]    = useState(profile?.avatar_url ?? '')
  const [bannerUrl,    setBannerUrl]    = useState(profile?.banner_url ?? '')
  const [profileVis,   setProfileVis]   = useState<boolean>(profile?.profile_visibility ?? false)
  const [showBio,      setShowBio]      = useState<boolean>(profile?.show_bio ?? false)
  const [showStatus,   setShowStatus]   = useState<boolean>(profile?.show_status ?? true)
  const [newPass,      setNewPass]      = useState('')
  const [confirmPass,  setConfirmPass]  = useState('')
  const [resetSent,    setResetSent]    = useState(false)
  const [saving,       setSaving]       = useState(false)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [uploadingBanner, setUploadingBanner] = useState(false)
  const [success,      setSuccess]      = useState('')
  const [error,        setError]        = useState('')
  const [showDelete,   setShowDelete]   = useState(false)
  const [deleting,     setDeleting]     = useState(false)
  const avatarRef = useRef<HTMLInputElement>(null)
  const bannerRef  = useRef<HTMLInputElement>(null)

  const inp: React.CSSProperties = { width: '100%', padding: '10px 13px', background: D.bgMid, border: `1px solid ${D.border}`, borderRadius: 10, fontSize: 13, fontFamily: 'inherit', color: D.txtPri, outline: 'none', boxSizing: 'border-box' as const }
  const lbl: React.CSSProperties = { display: 'block', fontSize: 10, fontWeight: 700, color: D.txtSec, textTransform: 'uppercase' as const, letterSpacing: '.06em', marginBottom: 6 }
  const fw: React.CSSProperties  = { marginBottom: 16 }

  function flash(msg: string, isError = false) {
    if (isError) { setError(msg); setTimeout(() => setError(''), 4000) }
    else { setSuccess(msg); setTimeout(() => setSuccess(''), 3000) }
  }

  async function uploadFile(file: File, folder: string) {
    if (file.size > 5 * 1024 * 1024) { flash('Max 5 MB', true); return null }
    const ext = file.name.split('.').pop()
    const path = `${folder}/${crypto.randomUUID()}.${ext}`
    const { error: e } = await supabase.storage.from('avatars').upload(path, file, { upsert: true })
    if (e) { flash(e.message, true); return null }
    return supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl
  }

  async function uploadAvatar(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return
    setUploadingAvatar(true)
    const url = await uploadFile(file, 'avatars')
    if (url) { await supabase.from('profiles').update({ avatar_url: url }).eq('id', profile.id); setAvatarUrl(url); flash('Fotka aktualizována!') }
    setUploadingAvatar(false)
  }

  async function uploadBanner(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return
    setUploadingBanner(true)
    const url = await uploadFile(file, 'banners')
    if (url) { await supabase.from('profiles').update({ banner_url: url }).eq('id', profile.id); setBannerUrl(url); flash('Banner aktualizován!') }
    setUploadingBanner(false)
  }

  async function saveProfile() {
    if (!fullName.trim()) { flash('Jméno je povinné.', true); return }
    setSaving(true)
    const { error: e } = await supabase.from('profiles').update({ full_name: fullName.trim(), bio: bio.trim() || null, custom_status: customStatus.trim() || null, student_class: studentClass.trim() || null, grade_level: gradeLevel.trim() || null, pronouns: pronouns.trim() || null, updated_at: new Date().toISOString() }).eq('id', profile.id)
    if (e) flash(e.message, true); else flash('Profil uložen!')
    setSaving(false)
  }

  async function saveAppearance() {
    setSaving(true)
    const { error: e } = await supabase.from('profiles').update({ accent_color: accentColor, updated_at: new Date().toISOString() }).eq('id', profile.id)
    if (e) flash(e.message, true); else { flash('Vzhled uložen!'); document.documentElement.style.setProperty('--accent', accentColor) }
    setSaving(false)
  }

  async function savePrivacy() {
    setSaving(true)
    const { error: e } = await supabase.from('profiles').update({ profile_visibility: profileVis, show_bio: showBio, show_status: showStatus }).eq('id', profile.id)
    if (e) flash(e.message, true); else flash('Nastavení soukromí uloženo!')
    setSaving(false)
  }

  async function changePassword() {
    if (newPass.length < 6) { flash('Min. 6 znaků.', true); return }
    if (newPass !== confirmPass) { flash('Hesla se neshodují.', true); return }
    setSaving(true)
    const { error: e } = await supabase.auth.updateUser({ password: newPass })
    if (e) flash(e.message, true); else { flash('Heslo změněno!'); setNewPass(''); setConfirmPass('') }
    setSaving(false)
  }

  async function deleteAccount() {
    setDeleting(true)
    const res = await fetch('/api/delete-account', { method: 'DELETE' })
    if (!res.ok) { const d = await res.json(); flash(d.error ?? 'Chyba', true); setDeleting(false); setShowDelete(false); return }
    await supabase.auth.signOut(); window.location.href = '/login'
  }

  function formatDate(iso?: string | null) {
    if (!iso) return '—'
    return new Date(iso).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'long', year: 'numeric' })
  }

  const initials = (profile?.full_name || '?').split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()

  return (
    <DarkLayout profile={{ ...profile, accent_color: accentColor }} activeRoute="/student/profile">
      {showDelete && <DeleteModal onConfirm={deleteAccount} onCancel={() => setShowDelete(false)} loading={deleting} />}

      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        <div style={{ marginBottom: 28 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: D.txtPri, margin: '0 0 4px' }}>Nastavení profilu</h1>
          <p style={{ fontSize: 13, color: D.txtSec, margin: 0 }}>Spravuj svůj účet a přizpůsob si prostředí</p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr', gap: 20, alignItems: 'start' }}>

          {/* ── Left: Preview card ── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ ...card({ overflow: 'hidden' }) }}>
              {/* Banner */}
              <div style={{ height: bannerUrl ? 80 : 6, background: bannerUrl ? `url(${bannerUrl}) center/cover` : accentColor, position: 'relative', flexShrink: 0 }}>
                {bannerUrl && <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.2)' }} />}
              </div>
              <div style={{ padding: '0 18px 18px' }}>
                {/* Avatar overlapping banner */}
                <div style={{ position: 'relative', marginTop: bannerUrl ? -32 : -18, marginBottom: 12, width: 'fit-content' }}>
                  {avatarUrl
                    ? <img src={avatarUrl} alt={fullName} style={{ width: 64, height: 64, borderRadius: '50%', objectFit: 'cover', border: `3px solid ${D.bgCard}` }} />
                    : <div style={{ width: 64, height: 64, borderRadius: '50%', background: accentColor + '30', color: accentColor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 700, border: `3px solid ${D.bgCard}` }}>{initials}</div>
                  }
                  <button onClick={() => avatarRef.current?.click()} disabled={uploadingAvatar}
                    style={{ position: 'absolute', bottom: 2, right: 2, width: 22, height: 22, borderRadius: '50%', background: accentColor, border: `2px solid ${D.bgCard}`, color: '#fff', fontSize: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {uploadingAvatar ? '…' : '✎'}
                  </button>
                  <input ref={avatarRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={uploadAvatar} />
                </div>
                <div style={{ fontSize: 15, fontWeight: 700, color: D.txtPri, marginBottom: 2 }}>{fullName || 'Tvoje jméno'}</div>
                <div style={{ fontSize: 11, color: D.txtSec, marginBottom: customStatus ? 8 : 0 }}>{profile?.email}</div>
                {customStatus && <div style={{ fontSize: 11, color: accentColor, background: accentColor + '15', padding: '2px 8px', borderRadius: 20, display: 'inline-block', marginBottom: 8 }}>{customStatus}</div>}
                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                  {studentClass && <span style={{ fontSize: 10, padding: '2px 7px', background: accentColor + '15', color: accentColor, borderRadius: 20, fontWeight: 600 }}>🏫 {studentClass}</span>}
                  {gradeLevel && <span style={{ fontSize: 10, padding: '2px 7px', background: accentColor + '15', color: accentColor, borderRadius: 20, fontWeight: 600 }}>📚 {gradeLevel}</span>}
                </div>
              </div>
            </div>

            {/* Account info */}
            <div style={card({ padding: '14px 16px' })}>
              <div style={{ fontSize: 10, fontWeight: 700, color: D.txtSec, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 10 }}>Účet</div>
              {[
                ['Člen od', formatDate(profile?.created_at)],
                ['Poslední přihlášení', profile?.last_login_at ? new Date(profile.last_login_at).toLocaleDateString('cs-CZ') : '—'],
              ].map(([label, val]) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '5px 0', borderBottom: `1px solid ${D.border}` }}>
                  <span style={{ color: D.txtSec }}>{label}</span>
                  <span style={{ color: D.txtPri, fontWeight: 500 }}>{val}</span>
                </div>
              ))}
            </div>

            <div style={{ fontSize: 10, color: D.txtSec, textAlign: 'center', lineHeight: 1.5 }}>Klikni ✎ pro změnu fotky · max 5 MB</div>
          </div>

          {/* ── Right: Tabs ── */}
          <div>
            {/* Tab bar */}
            <div style={{ display: 'flex', gap: 2, background: D.bgMid, borderRadius: 12, padding: 4, marginBottom: 20, width: 'fit-content' }}>
              {TABS.map(tab => (
                <button key={tab} onClick={() => { setActiveTab(tab); setError(''); setSuccess('') }}
                  style={{ padding: '7px 16px', borderRadius: 9, border: 'none', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', background: activeTab === tab ? D.bgCard : 'transparent', color: activeTab === tab ? D.txtPri : D.txtSec, boxShadow: activeTab === tab ? '0 1px 4px rgba(0,0,0,.3)' : 'none', transition: 'all .15s' }}>
                  {tab}
                </button>
              ))}
            </div>

            {/* ── Profil ── */}
            {activeTab === 'Profil' && (
              <div>
                <div style={card({ padding: '22px 24px', marginBottom: 14 })}>
                  <SectionLabel>Základní informace</SectionLabel>
                  <div style={fw}><label style={lbl}>Celé jméno</label><input style={inp} value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Vaše celé jméno" /></div>
                  <div style={fw}><label style={lbl}>E-mail</label><input style={{ ...inp, opacity: .4, cursor: 'not-allowed' }} value={profile?.email ?? ''} readOnly /></div>
                  <div style={fw}><label style={lbl}>Vlastní status</label>
                    <input style={{ ...inp, marginBottom: 8 }} value={customStatus} onChange={e => setCustomStatus(e.target.value)} placeholder="📖 Čtu kapitolu 4…" maxLength={60} />
                    <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                      {['📖 Čtu kapitolu…','🎯 Připravuji se na zkoušku','💻 Pracuji na projektu','✅ Vše hotovo!'].map(s => (
                        <button key={s} onClick={() => setCustomStatus(s)}
                          style={{ padding: '2px 8px', fontSize: 11, background: customStatus === s ? accentColor + '25' : D.bgMid, color: customStatus === s ? accentColor : D.txtSec, border: `1px solid ${customStatus === s ? accentColor : D.border}`, borderRadius: 20, cursor: 'pointer', fontFamily: 'inherit' }}>{s}</button>
                      ))}
                    </div>
                  </div>
                  <div style={{ ...fw, marginBottom: 0 }}><label style={lbl}>Bio</label>
                    <textarea style={{ ...inp, height: 72, resize: 'vertical' as const }} value={bio} onChange={e => setBio(e.target.value)} placeholder="Pár slov o sobě…" />
                  </div>
                </div>
                <div style={card({ padding: '22px 24px', marginBottom: 14 })}>
                  <SectionLabel>Studijní údaje</SectionLabel>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
                    <div><label style={lbl}>Třída</label><input style={inp} value={studentClass} onChange={e => setStudentClass(e.target.value)} placeholder="např. 3B" /></div>
                    <div><label style={lbl}>Ročník</label><input style={inp} value={gradeLevel} onChange={e => setGradeLevel(e.target.value)} placeholder="např. 3. ročník" /></div>
                  </div>
                  <div><label style={lbl}>Zájmena</label><input style={inp} value={pronouns} onChange={e => setPronouns(e.target.value)} placeholder="on/jeho, ona/její…" /></div>
                </div>
                {error   && <div style={{ fontSize: 13, padding: '10px 14px', background: 'rgba(239,68,68,.12)', color: D.danger, borderRadius: 10, marginBottom: 12, border: `1px solid rgba(239,68,68,.2)` }}>⚠ {error}</div>}
                {success && <div style={{ fontSize: 13, padding: '10px 14px', background: 'rgba(34,197,94,.12)', color: D.success, borderRadius: 10, marginBottom: 12, border: `1px solid rgba(34,197,94,.2)` }}>✓ {success}</div>}
                <button onClick={saveProfile} disabled={saving} style={{ padding: '11px 28px', background: accentColor, color: '#fff', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer', opacity: saving ? .6 : 1, fontFamily: 'inherit' }}>
                  {saving ? 'Ukládání…' : 'Uložit změny'}
                </button>
              </div>
            )}

            {/* ── Vzhled ── */}
            {activeTab === 'Vzhled' && (
              <div>
                {/* Banner */}
                <div style={card({ padding: '22px 24px', marginBottom: 14 })}>
                  <SectionLabel>Profilový banner</SectionLabel>
                  <div style={{ height: 90, borderRadius: 12, background: bannerUrl ? `url(${bannerUrl}) center/cover` : `linear-gradient(135deg, ${accentColor}25, ${accentColor}08)`, border: `1px dashed ${D.border}`, marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden' }}>
                    {!bannerUrl && <span style={{ fontSize: 12, color: D.txtSec }}>Náhled banneru</span>}
                    {bannerUrl && <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span style={{ fontSize: 12, color: '#fff', fontWeight: 600 }}>Banner nastaven ✓</span></div>}
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => bannerRef.current?.click()} disabled={uploadingBanner}
                      style={{ padding: '8px 16px', background: accentColor, color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', opacity: uploadingBanner ? .6 : 1 }}>
                      {uploadingBanner ? 'Nahrávání…' : bannerUrl ? '🖼 Změnit' : '🖼 Nahrát banner'}
                    </button>
                    {bannerUrl && <button onClick={async () => { await supabase.from('profiles').update({ banner_url: null }).eq('id', profile.id); setBannerUrl('') }}
                      style={{ padding: '8px 14px', background: 'rgba(239,68,68,.15)', color: D.danger, border: `1px solid rgba(239,68,68,.2)`, borderRadius: 8, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>Odebrat</button>}
                    <input ref={bannerRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={uploadBanner} />
                  </div>
                  <div style={{ fontSize: 11, color: D.txtSec, marginTop: 8 }}>Doporučeno: 1200×300 px · max 5 MB</div>
                </div>

                {/* Accent colors */}
                <div style={card({ padding: '22px 24px', marginBottom: 14 })}>
                  <SectionLabel>Barva motivu</SectionLabel>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10, marginBottom: 18 }}>
                    {ACCENT_COLORS.map(({ label, value }) => (
                      <button key={value} onClick={() => { setAccentColor(value); document.documentElement.style.setProperty('--accent', value) }} title={label}
                        style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '10px 6px', border: `2px solid ${accentColor === value ? value : D.border}`, borderRadius: 10, background: accentColor === value ? value + '12' : D.bgMid, cursor: 'pointer', fontFamily: 'inherit', transition: 'all .15s' }}>
                        <div style={{ width: 26, height: 26, borderRadius: '50%', background: value, boxShadow: accentColor === value ? `0 0 0 3px ${D.bgCard}, 0 0 0 5px ${value}` : 'none' }} />
                        <span style={{ fontSize: 9, color: accentColor === value ? value : D.txtSec, fontWeight: accentColor === value ? 700 : 400 }}>{label}</span>
                      </button>
                    ))}
                  </div>
                  {/* Live preview */}
                  <div style={{ background: D.bgMid, borderRadius: 12, padding: '14px 16px' }}>
                    <div style={{ fontSize: 10, color: D.txtSec, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '.05em' }}>Náhled</div>
                    <div style={{ height: 4, borderRadius: 10, background: accentColor, marginBottom: 10 }} />
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <div style={{ width: 30, height: 30, borderRadius: '50%', background: accentColor + '25', color: accentColor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700 }}>{initials}</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ height: 5, borderRadius: 10, background: 'rgba(255,255,255,.07)', overflow: 'hidden', marginBottom: 4 }}>
                          <div style={{ height: '100%', width: '65%', background: accentColor }} />
                        </div>
                        <span style={{ fontSize: 10, color: accentColor, fontWeight: 600 }}>65% dokončeno</span>
                      </div>
                      <span style={{ fontSize: 11, padding: '2px 8px', background: accentColor, color: '#fff', borderRadius: 20, fontWeight: 600 }}>Aktivní</span>
                    </div>
                  </div>
                </div>
                {error   && <div style={{ fontSize: 13, padding: '10px 14px', background: 'rgba(239,68,68,.12)', color: D.danger, borderRadius: 10, marginBottom: 12 }}>⚠ {error}</div>}
                {success && <div style={{ fontSize: 13, padding: '10px 14px', background: 'rgba(34,197,94,.12)', color: D.success, borderRadius: 10, marginBottom: 12 }}>✓ {success}</div>}
                <button onClick={saveAppearance} disabled={saving} style={{ padding: '11px 28px', background: accentColor, color: '#fff', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', opacity: saving ? .6 : 1 }}>{saving ? 'Ukládání…' : 'Uložit vzhled'}</button>
              </div>
            )}

            {/* ── Soukromí ── */}
            {activeTab === 'Soukromí' && (
              <div>
                <div style={card({ padding: '22px 24px', marginBottom: 14 })}>
                  <SectionLabel>Viditelnost profilu</SectionLabel>
                  <p style={{ fontSize: 13, color: D.txtSec, marginBottom: 18, lineHeight: 1.6 }}>Spolužáci ve stejném modulu uvidí tvoje základní informace. Žádný pokrok ani výsledky testů se nesdílí.</p>
                  {[
                    { key: 'profileVis', val: profileVis, set: setProfileVis, label: 'Veřejný profil', desc: 'Spolužáci tě mohou najít a zobrazit tvůj profil', icon: '👤' },
                    { key: 'showStatus', val: showStatus, set: setShowStatus, label: 'Zobrazit status', desc: 'Tvůj status bude viditelný pro ostatní', icon: '💬' },
                    { key: 'showBio',    val: showBio,    set: setShowBio,    label: 'Zobrazit bio',    desc: 'Tvůj popis bude viditelný pro ostatní', icon: '📝' },
                  ].map(({ key, val, set, label, desc, icon }) => (
                    <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 0', borderBottom: `1px solid ${D.border}` }}>
                      <div style={{ width: 36, height: 36, borderRadius: 10, background: val ? accentColor + '20' : D.bgMid, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17, flexShrink: 0 }}>{icon}</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: D.txtPri, marginBottom: 2 }}>{label}</div>
                        <div style={{ fontSize: 11, color: D.txtSec }}>{desc}</div>
                      </div>
                      <button onClick={() => set(!val)}
                        style={{ width: 44, height: 24, borderRadius: 12, border: 'none', background: val ? accentColor : D.bgMid, cursor: 'pointer', position: 'relative', transition: 'background .2s', flexShrink: 0 }}>
                        <div style={{ width: 18, height: 18, borderRadius: '50%', background: '#fff', position: 'absolute', top: 3, left: val ? 23 : 3, transition: 'left .2s', boxShadow: '0 1px 3px rgba(0,0,0,.4)' }} />
                      </button>
                    </div>
                  ))}
                </div>
                {profileVis && (
                  <div style={{ background: 'rgba(34,197,94,.1)', border: '1px solid rgba(34,197,94,.2)', borderRadius: 12, padding: '12px 16px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 16 }}>✓</span>
                    <div style={{ flex: 1, fontSize: 13, color: D.success }}>Profil je veřejný</div>
                    <a href={`/student/profile/${profile.id}`} target="_blank" style={{ padding: '5px 12px', background: D.success, color: '#fff', borderRadius: 7, textDecoration: 'none', fontSize: 11, fontWeight: 600 }}>Zobrazit →</a>
                  </div>
                )}
                {error   && <div style={{ fontSize: 13, padding: '10px 14px', background: 'rgba(239,68,68,.12)', color: D.danger, borderRadius: 10, marginBottom: 12 }}>⚠ {error}</div>}
                {success && <div style={{ fontSize: 13, padding: '10px 14px', background: 'rgba(34,197,94,.12)', color: D.success, borderRadius: 10, marginBottom: 12 }}>✓ {success}</div>}
                <button onClick={savePrivacy} disabled={saving} style={{ padding: '11px 28px', background: accentColor, color: '#fff', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', opacity: saving ? .6 : 1 }}>{saving ? 'Ukládání…' : 'Uložit nastavení'}</button>
              </div>
            )}

            {/* ── Zabezpečení ── */}
            {activeTab === 'Zabezpečení' && (
              <div>
                <div style={card({ padding: '22px 24px', marginBottom: 14 })}>
                  <SectionLabel>Změna hesla</SectionLabel>
                  <div style={fw}><label style={lbl}>Nové heslo</label><input style={inp} type="password" value={newPass} onChange={e => setNewPass(e.target.value)} placeholder="Min. 6 znaků" /></div>
                  <div>
                    <label style={lbl}>Nové heslo znovu</label>
                    <input style={{ ...inp, borderColor: confirmPass && newPass !== confirmPass ? D.danger : confirmPass && newPass === confirmPass ? D.success : D.border }}
                      type="password" value={confirmPass} onChange={e => setConfirmPass(e.target.value)} placeholder="Zopakujte heslo" />
                    {confirmPass && newPass !== confirmPass && <div style={{ fontSize: 11, color: D.danger, marginTop: 4 }}>Hesla se neshodují</div>}
                    {confirmPass && newPass === confirmPass && <div style={{ fontSize: 11, color: D.success, marginTop: 4 }}>✓ Hesla se shodují</div>}
                  </div>
                </div>
                {error   && <div style={{ fontSize: 13, padding: '10px 14px', background: 'rgba(239,68,68,.12)', color: D.danger, borderRadius: 10, marginBottom: 12 }}>⚠ {error}</div>}
                {success && <div style={{ fontSize: 13, padding: '10px 14px', background: 'rgba(34,197,94,.12)', color: D.success, borderRadius: 10, marginBottom: 12 }}>✓ {success}</div>}
                <button onClick={changePassword} disabled={saving || !newPass || newPass !== confirmPass}
                  style={{ padding: '11px 28px', background: accentColor, color: '#fff', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', opacity: saving || !newPass || newPass !== confirmPass ? .4 : 1, marginBottom: 20 }}>
                  {saving ? 'Ukládání…' : 'Změnit heslo'}
                </button>
                <div style={card({ padding: '22px 24px' })}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: D.txtPri, marginBottom: 6 }}>Zapomenuté heslo</div>
                  <p style={{ fontSize: 13, color: D.txtSec, marginBottom: 14, lineHeight: 1.5 }}>Odkaz na <strong style={{ color: D.txtPri }}>{profile?.email}</strong></p>
                  {resetSent
                    ? <div style={{ fontSize: 13, padding: '10px', background: 'rgba(34,197,94,.1)', color: D.success, borderRadius: 8, border: `1px solid rgba(34,197,94,.2)` }}>✓ Odkaz odeslán</div>
                    : <button onClick={async () => { const { error: e } = await supabase.auth.resetPasswordForEmail(profile?.email, { redirectTo: `${window.location.origin}/auth/callback` }); if (!e) setResetSent(true) }}
                        style={{ padding: '9px 20px', background: D.bgMid, color: D.txtSec, border: `1px solid ${D.border}`, borderRadius: 8, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>Odeslat odkaz</button>
                  }
                </div>
              </div>
            )}

            {/* ── Účet ── */}
            {activeTab === 'Účet' && (
              <div>
                <div style={card({ padding: '22px 24px', marginBottom: 14 })}>
                  <SectionLabel>Informace o účtu</SectionLabel>
                  {[['Role','Student'],['Člen od', formatDate(profile?.created_at)],['Poslední přihlášení', profile?.last_login_at ? new Date(profile.last_login_at).toLocaleString('cs-CZ') : '—'],['ID', profile?.id?.slice(0,8)+'…']].map(([l, v]) => (
                    <div key={l} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: `1px solid ${D.border}`, fontSize: 13 }}>
                      <span style={{ color: D.txtSec }}>{l}</span>
                      <span style={{ color: D.txtPri, fontWeight: 500 }}>{v}</span>
                    </div>
                  ))}
                </div>
                <div style={{ ...card({ padding: '22px 24px' }), border: `1px solid rgba(239,68,68,.2)` }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: D.danger, marginBottom: 8 }}>🗑 Smazat účet</div>
                  <p style={{ fontSize: 13, color: D.txtSec, lineHeight: 1.6, marginBottom: 16 }}>Nevratné smazání všech dat. V souladu s GDPR.</p>
                  <button onClick={() => setShowDelete(true)} style={{ padding: '9px 20px', background: 'rgba(239,68,68,.15)', color: D.danger, border: `1px solid rgba(239,68,68,.3)`, borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Smazat účet</button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </DarkLayout>
  )
}
