'use client'
import { useIsMobile } from '@/lib/useIsMobile'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const supabase = createClient()
  const router = useRouter()
  const isMobile = useIsMobile()
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
      if (error) {
        setError(error.message)
      } else {
        router.push('/')
        router.refresh()
      }
    } else {
      if (!fullName.trim()) {
        setError('Please enter your full name.')
        setLoading(false)
        return
      }
      if (password.length < 6) {
        setError('Password must be at least 6 characters.')
        setLoading(false)
        return
      }
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName, role },
          emailRedirectTo: `${location.origin}/auth/callback`,
        },
      })
      if (error) {
        setError(error.message)
      } else {
        setSuccess('Account created! Check your email to confirm your address, then sign in.')
      }
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
    if (error) {
      setError(error.message)
      setLoading(false)
    }
    // On success the browser is redirected — no need to setLoading(false)
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '8px 10px',
    border: '1px solid #e5e7eb',
    borderRadius: 8,
    fontSize: 13,
    marginBottom: 8,
    fontFamily: 'inherit',
    outline: 'none',
    background: '#fff',
    color: '#111',
  }
  const labelStyle: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 500,
    color: '#555',
    display: 'block',
    marginBottom: 3,
  }

  return (
    <div style={{ maxWidth: 360, margin: '40px auto', padding: '0 16px', fontFamily: 'system-ui, sans-serif' }}>

      {/* Logo */}
      <div style={{ textAlign: 'center', marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 3 }}>ClassBase</h1>
        <p style={{ fontSize: 12, color: '#888' }}>Learning management system</p>
      </div>

      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 24 }}>
        <h2 style={{ fontSize: 17, fontWeight: 500, marginBottom: 3 }}>
          {mode === 'login' ? 'Sign in' : 'Create account'}
        </h2>
        <p style={{ fontSize: 12, color: '#888', marginBottom: 20 }}>
          {mode === 'login' ? 'Welcome back' : 'Join ClassBase today'}
        </p>

        {/* OAuth buttons */}
        <button
          onClick={() => handleOAuth('google')}
          disabled={loading}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9, width: '100%', padding: '9px 12px', border: '1px solid #e5e7eb', borderRadius: 8, background: '#fff', fontSize: 13, fontWeight: 500, cursor: 'pointer', marginBottom: 8 }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          Continue with Google
        </button>

        <button
          onClick={() => handleOAuth('azure')}
          disabled={loading}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9, width: '100%', padding: '9px 12px', border: '1px solid #e5e7eb', borderRadius: 8, background: '#fff', fontSize: 13, fontWeight: 500, cursor: 'pointer', marginBottom: 16 }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24">
            <rect x="1" y="1" width="10.5" height="10.5" fill="#F25022"/>
            <rect x="12.5" y="1" width="10.5" height="10.5" fill="#7FBA00"/>
            <rect x="1" y="12.5" width="10.5" height="10.5" fill="#00A4EF"/>
            <rect x="12.5" y="12.5" width="10.5" height="10.5" fill="#FFB900"/>
          </svg>
          Continue with Microsoft
        </button>

        {/* Divider */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, color: '#bbb', fontSize: 11 }}>
          <div style={{ flex: 1, height: 1, background: '#e5e7eb' }} />
          or with email
          <div style={{ flex: 1, height: 1, background: '#e5e7eb' }} />
        </div>

        {/* Role picker — register only */}
        {mode === 'register' && (
          <>
            <div style={{ ...labelStyle, marginBottom: 5 }}>I am a</div>
            <div style={{ display: 'flex', border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden', marginBottom: 14 }}>
              {(['student', 'teacher'] as const).map(r => (
                <div
                  key={r}
                  onClick={() => setRole(r)}
                  style={{ flex: 1, padding: '7px', textAlign: 'center', fontSize: 12, fontWeight: 500, cursor: 'pointer', background: role === r ? '#185FA5' : '#f9fafb', color: role === r ? '#E6F1FB' : '#666', transition: 'all .15s' }}
                >
                  {r === 'student' ? 'Student' : 'Teacher'}
                </div>
              ))}
            </div>

            <label style={labelStyle}>Full name</label>
            <input
              value={fullName}
              onChange={e => setFullName(e.target.value)}
              placeholder="Your full name"
              style={inputStyle}
            />
          </>
        )}

        <label style={labelStyle}>Email</label>
        <input
          value={email}
          onChange={e => setEmail(e.target.value)}
          type="email"
          placeholder="you@school.edu"
          style={inputStyle}
        />

        <label style={labelStyle}>Password</label>
        <input
          value={password}
          onChange={e => setPassword(e.target.value)}
          type="password"
          placeholder="••••••••"
          onKeyDown={e => e.key === 'Enter' && handleEmailAuth()}
          style={inputStyle}
        />

        {error && (
          <div style={{ fontSize: 12, padding: '7px 10px', background: '#FCEBEB', color: '#791F1F', borderRadius: 8, marginBottom: 10 }}>
            {error}
          </div>
        )}
        {success && (
          <div style={{ fontSize: 12, padding: '7px 10px', background: '#EAF3DE', color: '#27500A', borderRadius: 8, marginBottom: 10 }}>
            {success}
          </div>
        )}

        <button
          onClick={handleEmailAuth}
          disabled={loading}
          style={{ width: '100%', padding: '9px', background: '#185FA5', color: '#E6F1FB', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: loading ? 'default' : 'pointer', opacity: loading ? 0.7 : 1, marginTop: 2 }}
        >
          {loading ? '…' : mode === 'login' ? 'Sign in' : 'Create account'}
        </button>

        <div style={{ textAlign: 'center', fontSize: 12, color: '#888', marginTop: 14 }}>
          {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
          <a
            onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); setSuccess('') }}
            style={{ color: '#185FA5', cursor: 'pointer', fontWeight: 500 }}
          >
            {mode === 'login' ? 'Register' : 'Sign in'}
          </a>
        </div>
      </div>
    </div>
  )
}
