'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'

const TYPE_META: Record<string, { icon: string; color: string; label: string }> = {
  module:     { icon: '📚', color: '#185FA5', label: 'Modul' },
  lesson:     { icon: '📖', color: '#16a34a', label: 'Lekce' },
  assignment: { icon: '📝', color: '#d97706', label: 'Úkol' },
  test:       { icon: '🧪', color: '#6c47ff', label: 'Test' },
}

export default function GlobalSearch() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Keyboard shortcut: Ctrl+K / Cmd+K
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        setOpen(o => !o)
      }
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setQuery(''); setResults([]); setSelected(0)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  // Debounced search
  const search = useCallback((q: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (q.length < 2) { setResults([]); setLoading(false); return }
    setLoading(true)
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`)
        const data = await res.json()
        setResults(data.results ?? [])
        setSelected(0)
      } catch { setResults([]) }
      setLoading(false)
    }, 250)
  }, [])

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setQuery(e.target.value)
    search(e.target.value)
  }

  function navigate(href: string) {
    setOpen(false)
    router.push(href)
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelected(s => Math.min(s + 1, results.length - 1)) }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setSelected(s => Math.max(s - 1, 0)) }
    if (e.key === 'Enter' && results[selected]) navigate(results[selected].href)
  }

  if (!open) return (
    <button
      onClick={() => setOpen(true)}
      style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px', background: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: 8, cursor: 'pointer', fontSize: 12, color: '#888', whiteSpace: 'nowrap' }}>
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
        <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
      </svg>
      Hledat…
      <span style={{ fontSize: 10, padding: '1px 5px', background: '#e5e7eb', borderRadius: 4, letterSpacing: '.02em' }}>⌘K</span>
    </button>
  )

  return (
    <>
      {/* Backdrop */}
      <div onClick={() => setOpen(false)}
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', zIndex: 9998, backdropFilter: 'blur(2px)' }} />

      {/* Modal */}
      <div style={{ position: 'fixed', top: '15%', left: '50%', transform: 'translateX(-50%)', width: '100%', maxWidth: 560, zIndex: 9999, padding: '0 16px' }}>
        <div style={{ background: '#fff', borderRadius: 16, boxShadow: '0 24px 64px rgba(0,0,0,.2)', overflow: 'hidden' }}>

          {/* Input row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px', borderBottom: results.length > 0 || loading ? '1px solid #f3f4f6' : 'none' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#aaa" strokeWidth="2.5" strokeLinecap="round" style={{ flexShrink: 0 }}>
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
            </svg>
            <input
              ref={inputRef}
              value={query}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              placeholder="Hledat lekce, moduly, testy, úkoly…"
              style={{ flex: 1, border: 'none', outline: 'none', fontSize: 15, fontFamily: 'inherit', background: 'transparent', color: '#111' }}
            />
            {loading && <div style={{ width: 16, height: 16, border: '2px solid #e5e7eb', borderTopColor: '#185FA5', borderRadius: '50%', animation: 'spin .6s linear infinite', flexShrink: 0 }} />}
            <kbd onClick={() => setOpen(false)} style={{ fontSize: 11, padding: '2px 7px', background: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: 5, cursor: 'pointer', color: '#888' }}>Esc</kbd>
          </div>
          <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>

          {/* Results */}
          {results.length > 0 && (
            <div style={{ maxHeight: 380, overflowY: 'auto' }}>
              {results.map((r, i) => {
                const meta = TYPE_META[r.type] ?? { icon: '📄', color: '#555', label: r.type }
                return (
                  <div key={r.href}
                    onClick={() => navigate(r.href)}
                    onMouseEnter={() => setSelected(i)}
                    style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 18px', cursor: 'pointer', background: selected === i ? '#f5f8ff' : '#fff', borderBottom: '1px solid #f9fafb' }}>
                    <div style={{ width: 34, height: 34, borderRadius: 8, background: meta.color + '15', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>
                      {meta.icon}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: '#111', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title}</div>
                      <div style={{ fontSize: 11, color: '#aaa', marginTop: 1 }}>{r.excerpt}</div>
                    </div>
                    <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 7px', background: meta.color + '15', color: meta.color, borderRadius: 20, flexShrink: 0 }}>
                      {meta.label}
                    </span>
                  </div>
                )
              })}
            </div>
          )}

          {/* Empty state */}
          {query.length >= 2 && !loading && results.length === 0 && (
            <div style={{ padding: '28px 18px', textAlign: 'center', color: '#aaa', fontSize: 13 }}>
              Žádné výsledky pro „{query}"
            </div>
          )}

          {/* Hint */}
          {query.length < 2 && (
            <div style={{ padding: '14px 18px', display: 'flex', gap: 16, color: '#bbb', fontSize: 11 }}>
              <span>↑↓ navigace</span>
              <span>↵ otevřít</span>
              <span>Esc zavřít</span>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
