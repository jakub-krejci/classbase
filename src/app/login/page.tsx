'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const LOGO_MAIN = `${SUPABASE_URL}/storage/v1/object/public/page_assets/logo_hlavni.png`

export default function LoginPage() {
  const supabase = createClient()
  const router = useRouter()
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [role, setRole] = useState<'student' | 'teacher'>('student')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState('')

  async function handleEmailAuth() {
    setError('')
    setLoading(true)
    if (mode === 'login') {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) { setError(error.message) } else { router.push('/'); router.refresh() }
    } else {
      if (!fullName.trim()) { setError('Zadejte prosím své celé jméno.'); setLoading(false); return }
      if (password.length < 6) { setError('Heslo musí mít alespoň 6 znaků.'); setLoading(false); return }
      const { error } = await supabase.auth.signUp({
        email, password,
        options: { data: { full_name: fullName, role }, emailRedirectTo: `${location.origin}/auth/callback` },
      })
      if (error) { setError(error.message) }
      else { setSuccess('Účet vytvořen! Zkontrolujte e-mail pro potvrzení, poté se přihlaste.') }
    }
    setLoading(false)
  }

  async function handleOAuth(provider: 'google' | 'azure') {
    setLoading(true)
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${location.origin}/auth/callback`,
        ...(provider === 'azure' && { queryParams: { prompt: 'select_account' } }),
      },
    })
    if (error) { setError(error.message); setLoading(false) }
  }

  const inp: React.CSSProperties = {
    width: '100%', padding: '9px 11px', border: '1px solid #e5e7eb', borderRadius: 8,
    fontSize: 13, marginBottom: 10, fontFamily: 'inherit', outline: 'none',
    background: '#fff', color: '#111', boxSizing: 'border-box',
  }
  const lbl: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: '#666', display: 'block', marginBottom: 3 }

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', display: 'flex', fontFamily: 'system-ui, sans-serif' }}>

      {/* ── Left panel — branding ── */}
      <div style={{ flex: 1, background: '#fff', borderRight: '1px solid #e5e7eb', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '48px 40px', minWidth: 0 }}
        className="cb-login-left">
        <img src={LOGO_MAIN} alt="ClassBase logo"
          style={{ maxWidth: 260, width: '100%', marginBottom: 36, objectFit: 'contain' }}
          onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
        <h1 style={{ fontSize: 28, fontWeight: 700, color: '#111', margin: '0 0 12px', textAlign: 'center' }}>
          Vítejte v ClassBase
        </h1>
        <p style={{ fontSize: 15, color: '#666', lineHeight: 1.7, textAlign: 'center', maxWidth: 340, margin: 0 }}>
          Moderní vzdělávací platforma pro školy.<br />
          Spravujte moduly, lekce a testy na jednom místě —
          jednoduše a přehledně pro učitele i studenty.
        </p>

        <div style={{ marginTop: 40, display: 'flex', flexDirection: 'column', gap: 14, width: '100%', maxWidth: 320 }}>
          {[
            { icon: '📚', title: 'Interaktivní lekce', desc: 'Bohatý editor s kódem, matematikou a multimédii' },
            { icon: '🧪', title: 'Testy a hodnocení', desc: 'Automatické i ruční hodnocení s okamžitou zpětnou vazbou' },
            { icon: '📊', title: 'Sledování pokroku', desc: 'Přehledné statistiky pro studenty i učitele' },
          ].map(({ icon, title, desc }) => (
            <div key={title} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <div style={{ fontSize: 20, marginTop: 1, flexShrink: 0 }}>{icon}</div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#111', marginBottom: 1 }}>{title}</div>
                <div style={{ fontSize: 12, color: '#888', lineHeight: 1.5 }}>{desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Right panel — form ── */}
      <div style={{ width: 400, flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 32px' }}>
        <div style={{ width: '100%', maxWidth: 360 }}>

          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4, color: '#111' }}>
            {mode === 'login' ? 'Přihlásit se' : 'Vytvořit účet'}
          </h2>
          <p style={{ fontSize: 13, color: '#888', marginBottom: 24 }}>
            {mode === 'login' ? 'Vítejte zpět — přihlaste se ke svému účtu' : 'Připojte se ke ClassBase ještě dnes'}
          </p>

          {/* OAuth */}
          <button onClick={() => handleOAuth('google')} disabled={loading}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9, width: '100%', padding: '10px 12px', border: '1px solid #e5e7eb', borderRadius: 8, background: '#fff', fontSize: 13, fontWeight: 500, cursor: 'pointer', marginBottom: 8 }}>
            <svg width="18" height="18" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Pokračovat přes Google
          </button>

          <button onClick={() => handleOAuth('azure')} disabled={loading}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9, width: '100%', padding: '10px 12px', border: '1px solid #e5e7eb', borderRadius: 8, background: '#fff', fontSize: 13, fontWeight: 500, cursor: 'pointer', marginBottom: 20 }}>
            <svg width="18" height="18" viewBox="0 0 24 24">
              <rect x="1" y="1" width="10.5" height="10.5" fill="#F25022"/>
              <rect x="12.5" y="1" width="10.5" height="10.5" fill="#7FBA00"/>
              <rect x="1" y="12.5" width="10.5" height="10.5" fill="#00A4EF"/>
              <rect x="12.5" y="12.5" width="10.5" height="10.5" fill="#FFB900"/>
            </svg>
            Pokračovat přes Microsoft
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20, color: '#bbb', fontSize: 11 }}>
            <div style={{ flex: 1, height: 1, background: '#e5e7eb' }} />
            nebo e-mailem
            <div style={{ flex: 1, height: 1, background: '#e5e7eb' }} />
          </div>

          {/* Role picker — register only */}
          {mode === 'register' && (
            <>
              <label style={lbl}>Jsem</label>
              <div style={{ display: 'flex', border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden', marginBottom: 14 }}>
                {(['student', 'teacher'] as const).map(r => (
                  <div key={r} onClick={() => setRole(r)}
                    style={{ flex: 1, padding: '8px', textAlign: 'center', fontSize: 13, fontWeight: 500, cursor: 'pointer', background: role === r ? '#185FA5' : '#f9fafb', color: role === r ? '#fff' : '#666', transition: 'all .15s' }}>
                    {r === 'student' ? 'Student' : 'Učitel'}
                  </div>
                ))}
              </div>
              <label style={lbl}>Celé jméno</label>
              <input value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Vaše celé jméno" style={inp} />
            </>
          )}

          <label style={lbl}>E-mail</label>
          <input value={email} onChange={e => setEmail(e.target.value)} type="email" placeholder="vas@email.cz" style={inp} />

          <label style={lbl}>Heslo</label>
          <input value={password} onChange={e => setPassword(e.target.value)} type="password" placeholder="••••••••"
            onKeyDown={e => e.key === 'Enter' && handleEmailAuth()} style={inp} />

          {error && <div style={{ fontSize: 12, padding: '8px 11px', background: '#fef2f2', color: '#dc2626', borderRadius: 8, marginBottom: 12 }}>{error}</div>}
          {success && <div style={{ fontSize: 12, padding: '8px 11px', background: '#f0fdf4', color: '#16a34a', borderRadius: 8, marginBottom: 12 }}>{success}</div>}

          <button onClick={handleEmailAuth} disabled={loading}
            style={{ width: '100%', padding: '10px', background: '#185FA5', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: loading ? 'default' : 'pointer', opacity: loading ? 0.7 : 1, marginBottom: 16 }}>
            {loading ? '…' : mode === 'login' ? 'Přihlásit se' : 'Vytvořit účet'}
          </button>

          <div style={{ textAlign: 'center', fontSize: 13, color: '#888' }}>
            {mode === 'login' ? 'Nemáte účet? ' : 'Již máte účet? '}
            <a onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); setSuccess('') }}
              style={{ color: '#185FA5', cursor: 'pointer', fontWeight: 600 }}>
              {mode === 'login' ? 'Registrovat se' : 'Přihlásit se'}
            </a>
          </div>
        </div>
      </div>

      {/* Mobile: hide left panel */}
      <style>{`
        @media (max-width: 700px) {
          .cb-login-left { display: none !important; }
        }
      `}</style>
    </div>
  )
}
