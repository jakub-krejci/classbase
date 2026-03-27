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

export default function AiTutor({ lessonTitle, contentHtml, isMobile }: {
  lessonTitle: string
  contentHtml: string
  isMobile?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [msgs, setMsgs] = useState<Message[]>([])
  const [draft, setDraft] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const BOTTOM = isMobile ? 0 : 80
  const RIGHT = isMobile ? 0 : 82  // offset from chat bubble (52px + gap)

  useEffect(() => {
    if (open && msgs.length === 0) {
      // Greeting on first open
      setMsgs([{
        role: 'assistant',
        content: `Hi! I've read **${lessonTitle}** and I'm here to help. Ask me anything — to explain a concept differently, give examples, test your understanding, or go deeper on any topic.`
      }])
    }
  }, [open])

  useEffect(() => {
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 30)
  }, [msgs])

  async function send() {
    if (!draft.trim() || loading) return
    const userMsg: Message = { role: 'user', content: draft.trim() }
    const newMsgs = [...msgs, userMsg]
    setMsgs(newMsgs)
    setDraft('')
    setLoading(true)
    setTimeout(() => inputRef.current?.focus(), 30)

    try {
      const lessonContext = stripHtml(contentHtml)
      const systemPrompt = `You are an expert tutor helping a student understand a lesson.

LESSON TITLE: ${lessonTitle}

LESSON CONTENT:
${lessonContext}

Your role:
- Answer questions about this lesson clearly and helpfully
- Explain concepts in different ways if the student is confused
- Give concrete examples and analogies
- Ask follow-up questions to check understanding when appropriate
- If asked to quiz the student, generate relevant questions from the lesson
- Stay focused on the lesson topic but draw on broader knowledge when it helps
- Be encouraging and patient
- Use markdown formatting: **bold** for key terms, \`code\` for code

Keep responses concise but complete. If a question is unrelated to the lesson, gently redirect.`

      const response = await fetch('/api/ai-tutor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system: systemPrompt,
          messages: newMsgs.map(m => ({ role: m.role, content: m.content })),
        }),
      })

      const data = await response.json()
      if (!response.ok) {
        console.error('AI tutor error:', data)
        setMsgs(prev => [...prev, { role: 'assistant', content: `Error: ${data.error ?? response.status}. Check browser console for details.` }])
      } else {
        const text = data.text || 'No response received.'
        setMsgs(prev => [...prev, { role: 'assistant', content: text }])
      }
    } catch (e: any) {
      console.error('AI tutor fetch error:', e)
      setMsgs(prev => [...prev, { role: 'assistant', content: `Network error: ${e?.message ?? 'unknown'}` }])
    }
    setLoading(false)
  }

  function renderContent(text: string) {
    // Escape HTML first
    const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

    const lines = text.split('\n')
    const out: string[] = []
    let i = 0

    while (i < lines.length) {
      const line = lines[i]

      // Fenced code block ```
      if (line.trimStart().startsWith('```')) {
        const lang = line.replace(/^`+/, '').trim()
        const codeLines: string[] = []
        i++
        while (i < lines.length && !lines[i].trimStart().startsWith('```')) {
          codeLines.push(escape(lines[i]))
          i++
        }
        out.push(`<pre style="background:#1e1e2e;color:#cdd6f4;padding:12px 14px;border-radius:8px;font-size:12px;overflow-x:auto;margin:8px 0;font-family:ui-monospace,monospace;line-height:1.6">${codeLines.join('\n')}</pre>`)
        i++
        continue
      }

      // Heading #
      const h3 = line.match(/^### (.+)/)
      const h2 = line.match(/^## (.+)/)
      const h1 = line.match(/^# (.+)/)
      if (h1) { out.push(`<div style="font-weight:700;font-size:15px;margin:10px 0 4px;color:#1a1a2e">${inline(h1[1])}</div>`); i++; continue }
      if (h2) { out.push(`<div style="font-weight:700;font-size:14px;margin:8px 0 3px;color:#1a1a2e">${inline(h2[1])}</div>`); i++; continue }
      if (h3) { out.push(`<div style="font-weight:600;font-size:13px;margin:6px 0 2px;color:#1a1a2e">${inline(h3[1])}</div>`); i++; continue }

      // Bullet list
      if (line.match(/^[\-\*] /)) {
        const items: string[] = []
        while (i < lines.length && lines[i].match(/^[\-\*] /)) {
          items.push(`<li style="margin:2px 0">${inline(lines[i].replace(/^[\-\*] /, ''))}</li>`)
          i++
        }
        out.push(`<ul style="margin:4px 0;padding-left:18px">${items.join('')}</ul>`)
        continue
      }

      // Numbered list
      if (line.match(/^\d+\. /)) {
        const items: string[] = []
        while (i < lines.length && lines[i].match(/^\d+\. /)) {
          items.push(`<li style="margin:2px 0">${inline(lines[i].replace(/^\d+\. /, ''))}</li>`)
          i++
        }
        out.push(`<ol style="margin:4px 0;padding-left:18px">${items.join('')}</ol>`)
        continue
      }

      // Blank line
      if (line.trim() === '') { out.push('<div style="height:6px"></div>'); i++; continue }

      // Regular paragraph
      out.push(`<div style="margin:1px 0">${inline(line)}</div>`)
      i++
    }

    return out.join('')
  }

  function inline(text: string) {
    const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    return escape(text)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/`([^`]+)`/g, '<code style="background:#f0f2f5;padding:1px 5px;border-radius:3px;font-size:.88em;font-family:ui-monospace,monospace;color:#b31d28">$1</code>')
  }

  const W = isMobile ? '100vw' : 360
  const H = isMobile ? '100dvh' : 500

  return (
    <>
      {/* Tutor button */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          title="Ask AI Tutor"
          style={{
            position: 'fixed', bottom: 20, right: isMobile ? 82 : 82, zIndex: 999,
            width: 52, height: 52, borderRadius: '50%',
            background: 'linear-gradient(135deg, #7c3aed, #4f46e5)',
            color: '#fff', border: 'none', cursor: 'pointer',
            fontSize: 22, display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 4px 16px rgba(124,58,237,.4)',
          }}
        >
          🎓
        </button>
      )}

      {/* Tutor panel */}
      {open && (
        <div style={{
          position: 'fixed', bottom: BOTTOM, right: RIGHT,
          width: W, height: H, zIndex: 1000,
          background: '#fff',
          border: isMobile ? 'none' : '1px solid #e5e7eb',
          borderRadius: isMobile ? 0 : 16,
          boxShadow: '0 12px 40px rgba(0,0,0,.15)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}>
          {/* Header */}
          <div style={{
            background: 'linear-gradient(135deg, #7c3aed, #4f46e5)',
            color: '#fff', padding: '12px 14px',
            display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0,
          }}>
            <span style={{ fontSize: 20 }}>🎓</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 14 }}>AI Tutor</div>
              <div style={{ fontSize: 10, opacity: .75, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {lessonTitle}
              </div>
            </div>
            <button
              onClick={() => { setOpen(false); setMsgs([]) }}
              style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 20, lineHeight: 1, opacity: .8, padding: '0 2px' }}
            >✕</button>
          </div>

          {/* Messages */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '14px 14px 8px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {msgs.map((m, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start', gap: 8, alignItems: 'flex-start' }}>
                {m.role === 'assistant' && (
                  <div style={{ width: 26, height: 26, borderRadius: '50%', background: 'linear-gradient(135deg,#7c3aed,#4f46e5)', color: '#fff', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 }}>🎓</div>
                )}
                <div style={{ maxWidth: '82%' }}>
                  <div style={{
                    background: m.role === 'user' ? '#4f46e5' : '#f8f7ff',
                    color: m.role === 'user' ? '#fff' : '#1a1a2e',
                    borderRadius: m.role === 'user' ? '14px 14px 3px 14px' : '14px 14px 14px 3px',
                    padding: '9px 12px', fontSize: 13, lineHeight: 1.55,
                    border: m.role === 'assistant' ? '1px solid #ede9fe' : 'none',
                  }}
                    dangerouslySetInnerHTML={{ __html: renderContent(m.content) }}
                  />
                </div>
              </div>
            ))}
            {loading && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <div style={{ width: 26, height: 26, borderRadius: '50%', background: 'linear-gradient(135deg,#7c3aed,#4f46e5)', color: '#fff', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>🎓</div>
                <div style={{ background: '#f8f7ff', border: '1px solid #ede9fe', borderRadius: '14px 14px 14px 3px', padding: '10px 14px' }}>
                  <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                    {[0,1,2].map(i => (
                      <div key={i} style={{
                        width: 7, height: 7, borderRadius: '50%', background: '#7c3aed',
                        animation: `bounce 1s infinite ${i * 0.15}s`,
                        opacity: 0.7,
                      }} />
                    ))}
                  </div>
                  <style>{`@keyframes bounce { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-4px)} }`}</style>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Quick prompts */}
          {msgs.length <= 1 && !loading && (
            <div style={{ padding: '0 14px 8px', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {['Explain in simple terms', 'Give me an example', 'Quiz me on this', 'What are the key points?'].map(p => (
                <button key={p} onClick={() => { setDraft(p); setTimeout(() => inputRef.current?.focus(), 10) }}
                  style={{ padding: '4px 10px', fontSize: 11, background: '#f3f0ff', color: '#6d28d9', border: '1px solid #ddd6fe', borderRadius: 20, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
                  {p}
                </button>
              ))}
            </div>
          )}

          {/* Input */}
          <div style={{ borderTop: '0.5px solid #f0f0f0', padding: '8px 10px', display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
            <input
              ref={inputRef}
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') send() }}
              placeholder="Ask about this lesson…"
              style={{ flex: 1, padding: '9px 14px', border: '1px solid #ede9fe', borderRadius: 22, fontSize: 13, fontFamily: 'inherit', outline: 'none', background: '#faf8ff' }}
            />
            <button onClick={send} disabled={loading || !draft.trim()}
              style={{ width: 36, height: 36, borderRadius: '50%', background: draft.trim() && !loading ? 'linear-gradient(135deg,#7c3aed,#4f46e5)' : '#e5e7eb', color: draft.trim() && !loading ? '#fff' : '#aaa', border: 'none', cursor: draft.trim() && !loading ? 'pointer' : 'default', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              ↑
            </button>
          </div>
        </div>
      )}
    </>
  )
}
