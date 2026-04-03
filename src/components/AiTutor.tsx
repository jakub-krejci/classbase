'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useRef, useEffect } from 'react'

type Message = { role: 'user' | 'assistant'; content: string }

function stripHtml(html: string): string {
  if (typeof document === 'undefined') return html
  const tmp = document.createElement('div')
  tmp.innerHTML = html
  return (tmp.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 6000)
}

// Inline markdown renderer (dark-mode aware)
function renderContent(text: string) {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  function inline(t: string) {
    return esc(t)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/`([^`]+)`/g, '<code style="background:rgba(255,255,255,.12);padding:1px 5px;border-radius:3px;font-size:.88em;font-family:ui-monospace,monospace;color:#93C5FD">$1</code>')
  }
  const lines = text.split('\n')
  const out: string[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (line.trimStart().startsWith('```')) {
      const codeLines: string[] = []
      i++
      while (i < lines.length && !lines[i].trimStart().startsWith('```')) { codeLines.push(esc(lines[i])); i++ }
      out.push(`<pre style="background:#1e1e2e;color:#cdd6f4;padding:10px 12px;border-radius:8px;font-size:12px;overflow-x:auto;margin:6px 0;font-family:ui-monospace,monospace;line-height:1.6">${codeLines.join('\n')}</pre>`)
      i++; continue
    }
    const hm = line.match(/^(#{1,3}) (.+)/)
    if (hm) { const s = hm[1].length; out.push(`<div style="font-weight:700;font-size:${15-s}px;margin:8px 0 3px;color:#F1F5F9">${inline(hm[2])}</div>`); i++; continue }
    if (line.match(/^[-*] /)) {
      const items: string[] = []
      while (i < lines.length && lines[i].match(/^[-*] /)) { items.push(`<li style="margin:2px 0">${inline(lines[i].replace(/^[-*] /,''))}</li>`); i++ }
      out.push(`<ul style="margin:4px 0;padding-left:18px">${items.join('')}</ul>`); continue
    }
    if (line.match(/^\d+\. /)) {
      const items: string[] = []
      while (i < lines.length && lines[i].match(/^\d+\. /)) { items.push(`<li style="margin:2px 0">${inline(lines[i].replace(/^\d+\. /,''))}</li>`); i++ }
      out.push(`<ol style="margin:4px 0;padding-left:18px">${items.join('')}</ol>`); continue
    }
    if (line.startsWith('|') && lines[i+1]?.match(/^\|[-| :]+\|/)) {
      const headers = line.split('|').slice(1,-1).map(h => h.trim()); i+=2
      const rows: string[][] = []
      while (i < lines.length && lines[i].startsWith('|')) { rows.push(lines[i].split('|').slice(1,-1).map(c => c.trim())); i++ }
      const thead = `<tr>${headers.map(h=>`<th style="padding:5px 8px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.06);font-weight:600;font-size:11px;text-align:left;color:#E2E8F0">${inline(h)}</th>`).join('')}</tr>`
      const tbody = rows.map(r=>`<tr>${r.map(c=>`<td style="padding:5px 8px;border:1px solid rgba(255,255,255,.1);font-size:11px;color:#CBD5E1">${inline(c)}</td>`).join('')}</tr>`).join('')
      out.push(`<div style="overflow-x:auto;margin:6px 0"><table style="border-collapse:collapse;width:100%">${thead}${tbody}</table></div>`); continue
    }
    if (line.trim() === '') { out.push('<div style="height:5px"></div>'); i++; continue }
    out.push(`<div style="margin:1px 0">${inline(line)}</div>`); i++
  }
  return out.join('')
}

// ── Embedded chat UI (no floating bubble) ────────────────────────────────────
export default function AiTutor({ lessonTitle, contentHtml }: {
  lessonTitle: string
  contentHtml: string
  isMobile?: boolean  // kept for compatibility but unused
}) {
  const [msgs, setMsgs]     = useState<Message[]>([])
  const [draft, setDraft]   = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef  = useRef<HTMLInputElement>(null)

  // Greeting on mount
  useEffect(() => {
    setMsgs([{
      role: 'assistant',
      content: `Ahoj! Přečetl jsem si **${lessonTitle}** a jsem tu abych ti pomohl. Zeptej se na cokoliv — vysvětlím jinak, dám příklady, nebo tě vyzkouším.`
    }])
  }, [lessonTitle])

  useEffect(() => {
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 30)
  }, [msgs])

  async function send() {
    if (!draft.trim() || loading) return
    const userMsg: Message = { role: 'user', content: draft.trim() }
    const newMsgs = [...msgs, userMsg]
    setMsgs(newMsgs); setDraft(''); setLoading(true)
    setTimeout(() => inputRef.current?.focus(), 30)
    try {
      const lessonContext = stripHtml(contentHtml)
      const systemPrompt = `Jsi expert tutor pomáhající studentovi pochopit lekci. NÁZEV LEKCE: ${lessonTitle}\n\nOBSAH LEKCE:\n${lessonContext}\n\nTvoje role: Odpovídej jasně a pomocně na otázky k lekci. Vysvětluj koncepty různými způsoby pokud je student zmatený. Dávej konkrétní příklady. Buď stručný ale kompletní. Odpovídej česky.`
      const res = await fetch('/api/ai-tutor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ system: systemPrompt, messages: newMsgs.map(m => ({ role: m.role, content: m.content })) }),
      })
      const data = await res.json()
      setMsgs(prev => [...prev, { role: 'assistant', content: res.ok ? (data.text || 'Žádná odpověď.') : `Chyba: ${data.error ?? res.status}` }])
    } catch (e: any) {
      setMsgs(prev => [...prev, { role: 'assistant', content: `Chyba sítě: ${e?.message ?? 'neznámá'}` }])
    }
    setLoading(false)
  }

  const D = { bg: '#0D0F16', card: '#14171F', border: 'rgba(255,255,255,.07)', txtSec: '#A1A7B3' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: D.bg }}>
      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '14px 14px 8px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {msgs.map((m, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start', gap: 8, alignItems: 'flex-start' }}>
            {m.role === 'assistant' && (
              <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'linear-gradient(135deg,#7c3aed,#4f46e5)', color: '#fff', fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 }}>🎓</div>
            )}
            <div style={{ maxWidth: '85%' }}>
              <div style={{ background: m.role === 'user' ? '#4f46e5' : 'rgba(255,255,255,.06)', color: m.role === 'user' ? '#fff' : '#E2E8F0', borderRadius: m.role === 'user' ? '14px 14px 3px 14px' : '14px 14px 14px 3px', padding: '8px 11px', fontSize: 13, lineHeight: 1.55, border: m.role === 'assistant' ? '1px solid rgba(255,255,255,.08)' : 'none' }}
                dangerouslySetInnerHTML={{ __html: renderContent(m.content) }} />
            </div>
          </div>
        ))}
        {loading && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'linear-gradient(135deg,#7c3aed,#4f46e5)', fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>🎓</div>
            <div style={{ background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.08)', borderRadius: '14px 14px 14px 3px', padding: '10px 14px', display: 'flex', gap: 4 }}>
              {[0,1,2].map(j => <div key={j} style={{ width: 6, height: 6, borderRadius: '50%', background: '#7c3aed', animation: `bounce 1s infinite ${j*.15}s` }} />)}
              <style>{`@keyframes bounce{0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)}}`}</style>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Quick prompts */}
      {msgs.length <= 1 && !loading && (
        <div style={{ padding: '0 12px 8px', display: 'flex', gap: 5, flexWrap: 'wrap' }}>
          {['Vysvětli jednodušeji', 'Dej mi příklad', 'Vyzkoušej mě', 'Co jsou klíčové body?'].map(p => (
            <button key={p} onClick={() => { setDraft(p); setTimeout(() => inputRef.current?.focus(), 10) }}
              style={{ padding: '4px 10px', fontSize: 11, background: 'rgba(124,58,237,.15)', color: '#C4B5FD', border: '1px solid rgba(124,58,237,.3)', borderRadius: 20, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
              {p}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div style={{ borderTop: `1px solid ${D.border}`, padding: '8px 10px', display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
        <input ref={inputRef} value={draft} onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') send() }}
          placeholder="Zeptej se na lekci…"
          style={{ flex: 1, padding: '9px 13px', border: '1px solid rgba(255,255,255,.1)', borderRadius: 22, fontSize: 13, fontFamily: 'inherit', outline: 'none', background: 'rgba(255,255,255,.05)', color: '#E2E8F0' }} />
        <button onClick={send} disabled={loading || !draft.trim()}
          style={{ width: 34, height: 34, borderRadius: '50%', background: draft.trim() && !loading ? 'linear-gradient(135deg,#7c3aed,#4f46e5)' : 'rgba(255,255,255,.06)', color: draft.trim() && !loading ? '#fff' : '#555', border: 'none', cursor: draft.trim() && !loading ? 'pointer' : 'default', fontSize: 15, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          ↑
        </button>
      </div>
    </div>
  )
}
