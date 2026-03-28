'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

// NEXT_PUBLIC_ vars are inlined at build time — safe in client components
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const LOGO_URL = SUPABASE_URL + '/storage/v1/object/public/page_assets/logo_hlavni.png'

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
    background: '#fff', color: '#111', boxSizing: 'border-box' as const,
  }
  const lbl: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: '#666', display: 'block', marginBottom: 3 }

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui, sans-serif', padding: '24px 16px' }}>
      <div style={{ width: '100%', maxWidth: 400 }}>

        {/* Logo + tagline */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <img
            src={LOGO_URL}
            alt="ClassBase"
            style={{ maxWidth: 200, width: '100%', height: 'auto', marginBottom: 16, objectFit: 'contain' }}
            onError={e => {
              const el = e.target as HTMLImageElement
              el.style.display = 'none'
              const fallback = el.nextElementSibling as HTMLElement | null
              if (fallback) fallback.style.display = 'block'
            }}
          />
          {/* Text fallback if image fails */}
          <div style={{ display: 'none', fontSize: 24, fontWeight: 700, color: '#111', marginBottom: 8 }}>ClassBase</div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: '#111', margin: '0 0 6px' }}>Vítejte v ClassBase</h1>
          <p style={{ fontSize: 13, color: '#888', margin: 0, lineHeight: 1.5 }}>
            Moderní vzdělávací platforma pro žáky GJB a SPgŠ.
          </p>
        </div>

        {/* Card */}
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, padding: '28px 28px 24px', boxShadow: '0 2px 12px rgba(0,0,0,.04)' }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 4px', color: '#111' }}>
            {mode === 'login' ? 'Přihlásit se' : 'Vytvořit účet'}
          </h2>
          <p style={{ fontSize: 12, color: '#aaa', margin: '0 0 20px' }}>
            {mode === 'login' ? 'Vítejte zpět' : 'Připojte se ke ClassBase'}
          </p>

          {/* OAuth */}
          <button onClick={() => handleOAuth('google')} disabled={loading}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9, width: '100%', padding: '9px 12px', border: '1px solid #e5e7eb', borderRadius: 8, background: '#fff', fontSize: 13, fontWeight: 500, cursor: 'pointer', marginBottom: 8 }}>
            <svg width="18" height="18" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Pokračovat přes Google
          </button>
          <button onClick={() => handleOAuth('azure')} disabled={loading}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9, width: '100%', padding: '9px 12px', border: '1px solid #e5e7eb', borderRadius: 8, background: '#fff', fontSize: 13, fontWeight: 500, cursor: 'pointer', marginBottom: 18 }}>
            <svg width="18" height="18" viewBox="0 0 24 24">
              <rect x="1" y="1" width="10.5" height="10.5" fill="#F25022"/>
              <rect x="12.5" y="1" width="10.5" height="10.5" fill="#7FBA00"/>
              <rect x="1" y="12.5" width="10.5" height="10.5" fill="#00A4EF"/>
              <rect x="12.5" y="12.5" width="10.5" height="10.5" fill="#FFB900"/>
            </svg>
            Pokračovat přes Microsoft
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18, color: '#bbb', fontSize: 11 }}>
            <div style={{ flex: 1, height: 1, background: '#e5e7eb' }} />
            nebo e-mailem
            <div style={{ flex: 1, height: 1, background: '#e5e7eb' }} />
          </div>

          {mode === 'register' && (
            <>
              <label style={lbl}>Jsem</label>
              <div style={{ display: 'flex', border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden', marginBottom: 12 }}>
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
            onKeyDown={e => e.key === 'Enter' && handleEmailAuth()} style={{ ...inp, marginBottom: 14 }} />

          {error && <div style={{ fontSize: 12, padding: '8px 11px', background: '#fef2f2', color: '#dc2626', borderRadius: 8, marginBottom: 12 }}>{error}</div>}
          {success && <div style={{ fontSize: 12, padding: '8px 11px', background: '#f0fdf4', color: '#16a34a', borderRadius: 8, marginBottom: 12 }}>{success}</div>}

          <button onClick={handleEmailAuth} disabled={loading}
            style={{ width: '100%', padding: '10px', background: '#185FA5', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: loading ? 'default' : 'pointer', opacity: loading ? 0.7 : 1, marginBottom: 14 }}>
            {loading ? '…' : mode === 'login' ? 'Přihlásit se' : 'Vytvořit účet'}
          </button>

          <div style={{ textAlign: 'center', fontSize: 12, color: '#888' }}>
            {mode === 'login' ? 'Nemáte účet? ' : 'Již máte účet? '}
            <a onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); setSuccess('') }}
              style={{ color: '#185FA5', cursor: 'pointer', fontWeight: 600 }}>
              {mode === 'login' ? 'Registrovat se' : 'Přihlásit se'}
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
