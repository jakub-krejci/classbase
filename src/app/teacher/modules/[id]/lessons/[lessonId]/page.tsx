'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { BackLink } from '@/components/ui'
import { useParams } from 'next/navigation'

// ── Python syntax highlighter ───────────────────────────────
function highlightPython(raw: string): string {
  const esc = raw.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
  const ph: Record<string,string> = {}
  let n = 0
  const save = (cls: string, txt: string) => { const k=`\x00${n++}\x00`; ph[k]=`<span class="${cls}">${txt}</span>`; return k }
  let r = esc
    .replace(/("""[\s\S]*?"""|'''[\s\S]*?'''|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/g, m => save('py-str',m))
    .replace(/(#[^\n]*)/g, m => save('py-cmt',m))
    .replace(/\b(def|class|if|elif|else|for|while|return|import|from|as|in|not|and|or|is|None|True|False|pass|break|continue|with|try|except|finally|raise|lambda|yield|global|nonlocal|del|assert|async|await)\b/g, m => save('py-kw',m))
    .replace(/\b(print|len|range|int|float|str|list|dict|set|tuple|bool|type|input|open|sum|max|min|abs|round|sorted|enumerate|zip|map|filter|isinstance)\b/g, m => save('py-bi',m))
    .replace(/\b(\d+\.?\d*)\b/g, m => save('py-num',m))
  Object.entries(ph).forEach(([k,v]) => { r = r.replaceAll(k,v) })
  return r
}

export default function LessonEditorPage() {
  const supabase = createClient()
  const params = useParams() as any
  const moduleId = params?.id as string
  const lessonId = params?.lessonId as string
  const isNew = !lessonId || lessonId === 'new'

  const [title, setTitle] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(!isNew)
  const editorRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isNew && lessonId) {
      supabase.from('lessons').select('*').eq('id', lessonId).single().then(({ data }) => {
        if (data && editorRef.current) {
          setTitle((data as any).title ?? '')
          editorRef.current.innerHTML = (data as any).content_html ?? ''
          // Re-apply syntax highlighting to existing code blocks
          editorRef.current.querySelectorAll('pre').forEach(pre => {
            if (!(pre as HTMLElement).dataset.hl) {
              ;(pre as HTMLElement).dataset.hl = '1'
              pre.innerHTML = highlightPython(pre.textContent ?? '')
            }
          })
        }
        setLoading(false)
      })
    }
  }, [])

  // ── Editor commands ────────────────────────────────────────
  const ed = () => editorRef.current

  function exec(cmd: string, value?: string) {
    ed()?.focus()
    document.execCommand(cmd, false, value ?? '')
  }

  // formatBlock needs angle-bracket tags in most browsers
  function heading(tag: 'h1'|'h2'|'h3') {
    ed()?.focus()
    document.execCommand('formatBlock', false, tag)
  }

  function blockquote() {
    ed()?.focus()
    document.execCommand('formatBlock', false, 'blockquote')
  }

  function insertAfterCursor(html: string) {
    ed()?.focus()
    const sel = window.getSelection()
    if (!sel || !sel.rangeCount) {
      // fallback: append to editor
      if (ed()) ed()!.innerHTML += html + '<p><br></p>'
      return
    }
    const range = sel.getRangeAt(0)
    range.deleteContents()
    const tmp = document.createElement('div')
    tmp.innerHTML = html + '<p><br></p>'
    const frag = document.createDocumentFragment()
    let last: Node | null = null
    Array.from(tmp.childNodes).forEach(n => { last = frag.appendChild(n.cloneNode(true)) })
    range.insertNode(frag)
    if (last) {
      const r = document.createRange()
      r.setStartAfter(last)
      r.collapse(true)
      sel.removeAllRanges()
      sel.addRange(r)
    }
  }

  function insertTable() {
    insertAfterCursor(`<table style="border-collapse:collapse;width:100%;margin:8px 0">
      <thead><tr>
        <th style="border:1px solid #e5e7eb;padding:7px 11px;background:#f9fafb;font-weight:600" contenteditable="true">Header 1</th>
        <th style="border:1px solid #e5e7eb;padding:7px 11px;background:#f9fafb;font-weight:600" contenteditable="true">Header 2</th>
        <th style="border:1px solid #e5e7eb;padding:7px 11px;background:#f9fafb;font-weight:600" contenteditable="true">Header 3</th>
      </tr></thead>
      <tbody>
        <tr>
          <td style="border:1px solid #e5e7eb;padding:7px 11px" contenteditable="true">Cell</td>
          <td style="border:1px solid #e5e7eb;padding:7px 11px" contenteditable="true">Cell</td>
          <td style="border:1px solid #e5e7eb;padding:7px 11px" contenteditable="true">Cell</td>
        </tr>
        <tr>
          <td style="border:1px solid #e5e7eb;padding:7px 11px" contenteditable="true">Cell</td>
          <td style="border:1px solid #e5e7eb;padding:7px 11px" contenteditable="true">Cell</td>
          <td style="border:1px solid #e5e7eb;padding:7px 11px" contenteditable="true">Cell</td>
        </tr>
      </tbody>
    </table>`)
  }

  function insertCodeBlock() {
    // Insert a highlighted code block — uses a textarea so it's editable
    insertAfterCursor(`<div class="code-editor-block" style="background:#1e1e2e;border-radius:8px;overflow:hidden;margin:10px 0" contenteditable="false">
      <div style="background:#16213e;padding:6px 14px;font-size:10px;color:#7aa2f7;font-family:monospace;letter-spacing:.06em;display:flex;align-items:center;justify-content:space-between">
        <span>PYTHON</span>
      </div>
      <pre style="background:#1e1e2e;color:#cdd6f4;padding:14px;font-family:monospace;font-size:13px;margin:0;white-space:pre;overflow-x:auto;border-radius:0" contenteditable="true" spellcheck="false"># Write your Python code here
print("Hello, world!")</pre>
    </div>`)
  }

  function insertTryIt() {
    insertAfterCursor(`<div class="tryit-widget" contenteditable="false" style="background:#1a1b26;border-radius:8px;overflow:hidden;margin:10px 0">
      <div class="tryit-header" style="background:#16213e;padding:7px 13px;font-family:monospace;font-size:10px;color:#7aa2f7;display:flex;align-items:center;justify-content:space-between">
        <span>&gt;_ Try it — Python</span>
        <button onclick="(function(btn){var w=btn.closest('.tryit-widget');var ta=w.querySelector('textarea');var out=w.querySelector('.tryit-output');var vars={};var output='';ta.value.split('\\n').forEach(function(line){var pm=line.trim().match(/^print\\((.+)\\)$/);if(pm){try{var r=pm[1];var f=r.match(/^f[\"\\'](.*)[\"\\']/);if(f){output+=f[1].replace(/\\{([^}]+)\\}/g,function(_,v){try{return eval(v)}catch(e){return v}})+'\\n'}else{output+=eval(r)+'\\n'}}catch(e){output+='Error: '+e.message+'\\n'}}var a=line.trim().match(/^(\\w+)\\s*=\\s*(.+)$/);if(a&&!line.trim().startsWith('print')){try{vars[a[1]]=eval(a[2])}catch(e){}}});out.textContent=output.trim()||'(no output)';out.style.display='block'})(this)" style="padding:3px 10px;font-size:11px;background:#7aa2f7;color:#fff;border:none;border-radius:5px;cursor:pointer;font-family:inherit">Run</button>
      </div>
      <textarea spellcheck="false" style="width:100%;background:#1a1b26;color:#cdd6f4;font-family:monospace;font-size:13px;padding:12px 14px;border:none;outline:none;resize:vertical;min-height:80px;line-height:1.6">mass = 5
acceleration = 3
force = mass * acceleration
print(f"Force = {force} N")</textarea>
      <div class="tryit-output" style="background:#0d1117;color:#a6e3a1;font-family:monospace;font-size:13px;padding:8px 14px;white-space:pre-wrap;display:none;border-top:1px solid #2a2a4a"></div>
    </div>`)
  }

  function insertAccordion() {
    insertAfterCursor(`<details style="border:1px solid #e5e7eb;border-radius:8px;margin:10px 0;overflow:hidden">
      <summary style="padding:10px 14px;background:#f9fafb;cursor:pointer;font-weight:500;font-size:14px;list-style:none;user-select:none">&#9654; Click to reveal solution</summary>
      <div style="padding:12px 14px;font-size:14px" contenteditable="true">Write the hidden content here.</div>
    </details>`)
  }

  function insertImportant() {
    insertAfterCursor(`<div style="background:#FAEEDA;border-left:3px solid #BA7517;border-radius:0 8px 8px 0;padding:10px 14px;margin:10px 0">
      <div style="font-size:10px;font-weight:700;color:#633806;text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px">⚠ Important</div>
      <div style="font-size:14px;color:#412402" contenteditable="true">Write important content here.</div>
    </div>`)
  }

  function highlight(color: string) {
    ed()?.focus()
    const sel = window.getSelection()
    const text = sel?.toString() || 'highlighted text'
    document.execCommand('insertHTML', false, `<span style="background:${color};border-radius:2px;padding:0 2px">${text}</span>`)
  }

  // ── Save ───────────────────────────────────────────────────
  async function save() {
    if (!title.trim()) { setError('Title is required.'); return }
    if (!moduleId || moduleId === 'undefined') { setError('Module ID is missing. Please go back and try again.'); return }
    setSaving(true); setError('')
    const html = ed()?.innerHTML ?? ''

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { window.location.href = '/login'; return }

    if (isNew) {
      // Get next position
      const { data: last } = await supabase
        .from('lessons').select('position').eq('module_id', moduleId)
        .order('position', { ascending: false }).limit(1)
      const pos = last && last.length > 0 ? ((last[0] as any).position ?? 0) + 1 : 0

      const { error: err } = await supabase.from('lessons').insert({
        module_id: moduleId,
        title: title.trim(),
        content_html: html,
        position: pos,
      } as any)
      if (err) { setError(err.message); setSaving(false); return }
    } else {
      const { error: err } = await supabase.from('lessons').update({
        title: title.trim(),
        content_html: html,
        updated_at: new Date().toISOString(),
      } as any).eq('id', lessonId)
      if (err) { setError(err.message); setSaving(false); return }
    }
    window.location.href = '/teacher/modules/' + moduleId
  }

  // ── Styles ─────────────────────────────────────────────────
  const TB: React.CSSProperties = { padding: '4px 8px', fontSize: 12, border: '0.5px solid transparent', borderRadius: 5, background: 'none', cursor: 'pointer', fontFamily: 'inherit', lineHeight: 1 }
  const SEP = <div style={{ width: 1, background: '#e5e7eb', margin: '2px 3px', alignSelf: 'stretch' }} />

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#888' }}>Loading…</div>

  return (
    <div style={{ maxWidth: 820, margin: '28px auto', padding: '0 20px', fontFamily: 'system-ui, sans-serif' }}>
      <BackLink href={'/teacher/modules/' + moduleId} label="Back to module" />
      <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 16 }}>{isNew ? 'New lesson' : 'Edit lesson'}</h1>

      <label style={{ fontSize: 11, fontWeight: 500, color: '#666', display: 'block', marginBottom: 3 }}>Lesson title</label>
      <input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Newton's Laws of Motion"
        style={{ width: '100%', maxWidth: 520, padding: '8px 11px', border: '0.5px solid #e5e7eb', borderRadius: 8, fontSize: 14, fontFamily: 'inherit', marginBottom: 16, outline: 'none' }} />

      <label style={{ fontSize: 11, fontWeight: 500, color: '#666', display: 'block', marginBottom: 3 }}>Content</label>

      {/* ── Toolbar ── */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2, padding: '6px 8px', border: '1px solid #e5e7eb', borderBottom: 'none', borderRadius: '8px 8px 0 0', background: '#f9fafb', alignItems: 'center' }}>
        {/* Text formatting */}
        <button style={TB} onMouseDown={e => { e.preventDefault(); exec('bold') }} title="Bold"><b>B</b></button>
        <button style={TB} onMouseDown={e => { e.preventDefault(); exec('italic') }} title="Italic"><i>I</i></button>
        <button style={TB} onMouseDown={e => { e.preventDefault(); exec('underline') }} title="Underline"><u>U</u></button>
        {SEP}
        {/* Headings */}
        <button style={{ ...TB, fontWeight: 700, fontSize: 13 }} onMouseDown={e => { e.preventDefault(); heading('h1') }} title="Heading 1">H1</button>
        <button style={{ ...TB, fontWeight: 700, fontSize: 12 }} onMouseDown={e => { e.preventDefault(); heading('h2') }} title="Heading 2">H2</button>
        <button style={{ ...TB, fontWeight: 700, fontSize: 11 }} onMouseDown={e => { e.preventDefault(); heading('h3') }} title="Heading 3">H3</button>
        {SEP}
        {/* Lists */}
        <button style={TB} onMouseDown={e => { e.preventDefault(); exec('insertUnorderedList') }} title="Bullet list">• list</button>
        <button style={TB} onMouseDown={e => { e.preventDefault(); exec('insertOrderedList') }} title="Numbered list">1. list</button>
        <button style={TB} onMouseDown={e => { e.preventDefault(); blockquote() }} title="Blockquote">" quote</button>
        {SEP}
        {/* Highlights */}
        <button style={{ ...TB, background: '#fff59d', color: '#333', fontWeight: 700 }} onMouseDown={e => { e.preventDefault(); highlight('#fff59d') }} title="Highlight yellow">A</button>
        <button style={{ ...TB, background: '#bbdefb', color: '#0d47a1', fontWeight: 700 }} onMouseDown={e => { e.preventDefault(); highlight('#bbdefb') }} title="Highlight blue">A</button>
        <button style={{ ...TB, background: '#b9f6ca', color: '#1b5e20', fontWeight: 700 }} onMouseDown={e => { e.preventDefault(); highlight('#b9f6ca') }} title="Highlight green">A</button>
        <button style={{ ...TB, background: '#fce4ec', color: '#880e4f', fontWeight: 700 }} onMouseDown={e => { e.preventDefault(); highlight('#fce4ec') }} title="Highlight pink">A</button>
        {SEP}
        {/* Block inserts */}
        <button style={{ ...TB, background: '#FAEEDA', color: '#633806' }} onMouseDown={e => { e.preventDefault(); insertImportant() }} title="Important callout">! Imp</button>
        <button style={{ ...TB, background: '#E1F5EE', color: '#085041' }} onMouseDown={e => { e.preventDefault(); insertAccordion() }} title="Accordion / reveal">▾ Fold</button>
        <button style={TB} onMouseDown={e => { e.preventDefault(); insertTable() }} title="Insert table">⊞ Table</button>
        {SEP}
        {/* Code */}
        <button style={{ ...TB, background: '#1e1e2e', color: '#cdd6f4' }} onMouseDown={e => { e.preventDefault(); insertCodeBlock() }} title="Python code block">&lt;/&gt; Code</button>
        <button style={{ ...TB, background: '#1a1b26', color: '#7aa2f7' }} onMouseDown={e => { e.preventDefault(); insertTryIt() }} title="Interactive Python">&gt;_ Try it</button>
      </div>

      {/* ── Editor area ── */}
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onKeyDown={e => {
          // Enter after a non-editable block: insert a new paragraph
          if (e.key === 'Enter') {
            const sel = window.getSelection()
            if (!sel || !sel.rangeCount) return
            const node = sel.getRangeAt(0).startContainer
            const block = (node as HTMLElement).closest?.('[contenteditable="false"]')
            if (block) {
              e.preventDefault()
              const p = document.createElement('p')
              p.innerHTML = '<br>'
              block.after(p)
              const r = document.createRange()
              r.setStart(p, 0)
              r.collapse(true)
              sel.removeAllRanges()
              sel.addRange(r)
            }
          }
        }}
        style={{
          minHeight: 340,
          padding: '14px 16px',
          border: '1px solid #e5e7eb',
          borderRadius: '0 0 8px 8px',
          background: '#fff',
          fontSize: 14,
          lineHeight: 1.75,
          outline: 'none',
          color: '#111',
          fontFamily: 'system-ui, sans-serif',
        }}
      />

      {/* Editor content CSS injected inline */}
      <style>{`
        [contenteditable] h1 { font-size:22px; font-weight:700; margin:14px 0 6px; }
        [contenteditable] h2 { font-size:18px; font-weight:700; margin:12px 0 5px; }
        [contenteditable] h3 { font-size:15px; font-weight:700; margin:10px 0 4px; }
        [contenteditable] blockquote { border-left:3px solid #185FA5; padding:4px 0 4px 14px; margin:8px 0; color:#555; font-style:italic; }
        [contenteditable] ul { padding-left:22px; margin:6px 0; list-style:disc; }
        [contenteditable] ol { padding-left:22px; margin:6px 0; list-style:decimal; }
        [contenteditable] li { margin:3px 0; }
        [contenteditable] table { border-collapse:collapse; width:100%; margin:8px 0; }
        [contenteditable] td, [contenteditable] th { border:1px solid #e5e7eb; padding:6px 10px; }
        [contenteditable] th { background:#f9fafb; font-weight:600; }
        [contenteditable] pre { background:#1e1e2e; color:#cdd6f4; border-radius:8px; padding:13px; font-family:monospace; font-size:13px; white-space:pre; overflow-x:auto; margin:8px 0; }
        [contenteditable] details > div { padding:10px 14px; }
        .py-kw{color:#cba6f7} .py-str{color:#a6e3a1} .py-num{color:#fab387} .py-cmt{color:#6c7086;font-style:italic} .py-bi{color:#89b4fa}
      `}</style>

      {error && <div style={{ fontSize: 12, padding: '8px 11px', background: '#FCEBEB', color: '#791F1F', borderRadius: 8, margin: '12px 0' }}>{error}</div>}
      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
        <button onClick={save} disabled={saving}
          style={{ padding: '9px 20px', background: '#185FA5', color: '#E6F1FB', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer', opacity: saving ? .6 : 1 }}>
          {saving ? 'Saving…' : 'Save lesson'}
        </button>
        <a href={'/teacher/modules/' + moduleId}
          style={{ padding: '9px 16px', border: '0.5px solid #e5e7eb', borderRadius: 8, fontSize: 13, textDecoration: 'none', color: '#555', background: '#fff', display: 'inline-flex', alignItems: 'center' }}>
          Cancel
        </a>
      </div>
    </div>
  )
}
