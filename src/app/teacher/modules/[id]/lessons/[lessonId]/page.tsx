'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useParams } from 'next/navigation'
import { Btn, BackLink } from '@/components/ui'

export default function LessonEditorPage() {
  const supabase = createClient()
  const router = useRouter()
  const params = useParams() as any
  const moduleId = params.id as string
  const lessonId = params.lessonId as string
  const isNew = lessonId === 'new'

  const [title, setTitle] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(!isNew)
  const editorRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isNew) {
      supabase.from('lessons').select('*').eq('id', lessonId).single().then(({ data }) => {
        if (data) { setTitle(data.title); if (editorRef.current) editorRef.current.innerHTML = (data as any).content_html ?? '' }
        setLoading(false)
      })
    }
  }, [])

  function fmt(cmd: string, val?: string) { editorRef.current?.focus(); document.execCommand(cmd, false, val) }
  function hl(c: string) { editorRef.current?.focus(); document.execCommand('insertHTML', false, '<span style="background:' + c + ';border-radius:2px;padding:0 2px">' + (window.getSelection()?.toString() || 'text') + '</span>') }
  function insBlock(html: string) { editorRef.current?.focus(); document.execCommand('insertHTML', false, html + '<p></p>') }

  async function save() {
    if (!title.trim()) { setError('Title is required.'); return }
    setSaving(true); setError('')
    const html = editorRef.current?.innerHTML ?? ''
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    if (isNew) {
      const { data: existing } = await supabase.from('lessons').select('id').eq('module_id', moduleId).order('position', { ascending: false }).limit(1).single()
      const pos = (existing as any)?.position != null ? (existing as any).position + 1 : 0
      const { error: err } = await supabase.from('lessons').insert({ module_id: moduleId, title: title.trim(), content_html: html, position: pos } as any)
      if (err) { setError(err.message); setSaving(false); return }
    } else {
      const { error: err } = await supabase.from('lessons').update({ title: title.trim(), content_html: html, updated_at: new Date().toISOString() } as any).eq('id', lessonId)
      if (err) { setError(err.message); setSaving(false); return }
    }
    router.push('/teacher/modules/' + moduleId)
    router.refresh()
  }

  const tbBtn: React.CSSProperties = { padding: '3px 7px', fontSize: 11, border: '0.5px solid transparent', borderRadius: 5, background: 'none', cursor: 'pointer', fontFamily: 'inherit' }
  const sep = <div style={{ width: 1, background: '#e5e7eb', margin: '0 2px', alignSelf: 'stretch' }} />

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#888' }}>Loading…</div>

  return (
    <div style={{ maxWidth: 780, margin: '32px auto', padding: '0 20px', fontFamily: 'system-ui, sans-serif' }}>
      <BackLink href={'/teacher/modules/' + moduleId} label="Back to module" />
      <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 16 }}>{isNew ? 'New lesson' : 'Edit lesson'}</h1>

      <label style={{ fontSize: 11, fontWeight: 500, color: '#666', display: 'block', marginBottom: 3 }}>Lesson title</label>
      <input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Newton's Laws of Motion"
        style={{ width: '100%', maxWidth: 500, padding: '8px 10px', border: '0.5px solid #e5e7eb', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', marginBottom: 14, outline: 'none' }} />

      <label style={{ fontSize: 11, fontWeight: 500, color: '#666', display: 'block', marginBottom: 3 }}>Content</label>

      {/* Toolbar */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2, padding: 6, border: '0.5px solid #e5e7eb', borderBottom: 'none', borderRadius: '8px 8px 0 0', background: '#f9fafb' }}>
        <button style={tbBtn} onClick={() => fmt('bold')}><b>B</b></button>
        <button style={tbBtn} onClick={() => fmt('italic')}><i>I</i></button>
        <button style={tbBtn} onClick={() => fmt('underline')}><u>U</u></button>
        {sep}
        <button style={{ ...tbBtn, fontWeight: 600 }} onClick={() => fmt('formatBlock', 'H1')}>H1</button>
        <button style={{ ...tbBtn, fontWeight: 600 }} onClick={() => fmt('formatBlock', 'H2')}>H2</button>
        <button style={{ ...tbBtn, fontWeight: 600 }} onClick={() => fmt('formatBlock', 'H3')}>H3</button>
        {sep}
        <button style={tbBtn} onClick={() => fmt('insertUnorderedList')}>• list</button>
        <button style={tbBtn} onClick={() => fmt('insertOrderedList')}>1. list</button>
        <button style={tbBtn} onClick={() => fmt('formatBlock', 'BLOCKQUOTE')}>" quote</button>
        {sep}
        <button style={{ ...tbBtn, background: '#fff59d', color: '#333' }} onClick={() => hl('#fff59d')}>A</button>
        <button style={{ ...tbBtn, background: '#bbdefb', color: '#0d47a1' }} onClick={() => hl('#bbdefb')}>A</button>
        <button style={{ ...tbBtn, background: '#b9f6ca', color: '#1b5e20' }} onClick={() => hl('#b9f6ca')}>A</button>
        <button style={{ ...tbBtn, background: '#fce4ec', color: '#880e4f' }} onClick={() => hl('#fce4ec')}>A</button>
        {sep}
        <button style={{ ...tbBtn, background: '#FAEEDA', color: '#633806' }}
          onClick={() => insBlock('<div style="background:#FAEEDA;border-left:3px solid #BA7517;border-radius:0 8px 8px 0;padding:10px 13px;margin:8px 0"><div style="font-size:10px;font-weight:600;color:#633806;text-transform:uppercase;letter-spacing:.06em;margin-bottom:3px">⚠ Important</div><div>Write important content here.</div></div>')}>
          ! Imp
        </button>
        <button style={{ ...tbBtn, background: '#E1F5EE', color: '#085041' }}
          onClick={() => insBlock('<details style="border:0.5px solid #e5e7eb;border-radius:8px;margin:8px 0;overflow:hidden"><summary style="padding:9px 12px;background:#f9fafb;cursor:pointer;font-weight:500">▶ Click to reveal</summary><div style="padding:10px 12px">Hidden content here.</div></details>')}>
          ▾ Fold
        </button>
        <button style={{ ...tbBtn, background: '#1e1e2e', color: '#cdd6f4' }}
          onClick={() => insBlock('<pre style="background:#1e1e2e;color:#cdd6f4;border-radius:8px;padding:12px;font-family:monospace;font-size:12px;overflow-x:auto;white-space:pre"># Python code\nprint("Hello, world!")</pre>')}>
          &lt;/&gt; Code
        </button>
        <button style={{ ...tbBtn, background: '#1a1b26', color: '#7aa2f7' }}
          onClick={() => insBlock('<div style="background:#1a1b26;border-radius:8px;overflow:hidden;margin:8px 0"><div style="background:#16213e;padding:6px 12px;font-size:10px;color:#7aa2f7;font-family:monospace">▶ Try it — Python</div><textarea style="width:100%;background:#1a1b26;color:#cdd6f4;font-family:monospace;font-size:12px;padding:10px 12px;border:none;outline:none;resize:vertical;min-height:72px">print("Hello!")</textarea></div>')}>
          &gt;_ Try
        </button>
      </div>

      {/* Editor */}
      <div ref={editorRef} contentEditable suppressContentEditableWarning
        style={{ minHeight: 280, padding: 14, border: '0.5px solid #e5e7eb', borderRadius: '0 0 8px 8px', background: '#fff', fontSize: 13, lineHeight: 1.7, outline: 'none', color: '#111' }}
        onFocus={e => (e.target as HTMLElement).style.borderColor = '#185FA5'}
        onBlur={e => (e.target as HTMLElement).style.borderColor = '#e5e7eb'}
      />

      {error && <div style={{ fontSize: 12, padding: '7px 10px', background: '#FCEBEB', color: '#791F1F', borderRadius: 8, margin: '10px 0' }}>{error}</div>}
      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
        <Btn variant="primary" onClick={save} style={{ opacity: saving ? .6 : 1 }}>{saving ? 'Saving…' : 'Save lesson'}</Btn>
        <Btn href={'/teacher/modules/' + moduleId}>Cancel</Btn>
      </div>
    </div>
  )
}
