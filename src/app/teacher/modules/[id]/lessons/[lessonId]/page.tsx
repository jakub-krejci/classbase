'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useParams } from 'next/navigation'
import { BackLink } from '@/components/ui'
import { highlightPython, PYTHON_CSS } from '@/lib/highlight'

// ── Modals ────────────────────────────────────────────────────────────────────
function QuizModal({ onInsert, onClose }: { onInsert: (h: string) => void; onClose: () => void }) {
  const [q, setQ] = useState('')
  const [opts, setOpts] = useState(['', '', '', ''])
  const [correct, setCorrect] = useState(0)
  const [expl, setExpl] = useState(['', '', '', ''])
  const inp: React.CSSProperties = { width: '100%', padding: '7px 9px', border: '1px solid #e5e7eb', borderRadius: 7, fontSize: 13, fontFamily: 'inherit', outline: 'none', marginBottom: 8 }
  function build() {
    const o = opts.filter(x => x.trim())
    const oE = JSON.stringify(o).replace(/"/g, '&quot;')
    const eE = JSON.stringify(expl.slice(0, o.length)).replace(/"/g, '&quot;')
    return `<div class="cb-quiz" data-q="${q.replace(/"/g, '&quot;')}" data-opts="${oE}" data-correct="${correct}" data-expl="${eE}" contenteditable="false" style="background:#f0f7ff;border:1px solid #B5D4F4;border-radius:10px;margin:12px 0;padding:0;overflow:hidden"><div style="padding:10px 14px;background:#E6F1FB;font-size:10px;font-weight:700;color:#0C447C;text-transform:uppercase;letter-spacing:.06em">✓ Quiz — ${q}</div></div>`
  }
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ background: '#fff', borderRadius: 14, padding: 24, width: '100%', maxWidth: 540, maxHeight: '90vh', overflowY: 'auto' }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 14 }}>Insert quiz question</h2>
        <label style={{ fontSize: 11, fontWeight: 600, color: '#555', display: 'block', marginBottom: 3 }}>Question</label>
        <input value={q} onChange={e => setQ(e.target.value)} style={inp} placeholder="What does F = ma represent?" />
        <label style={{ fontSize: 11, fontWeight: 600, color: '#555', display: 'block', margin: '8px 0 6px' }}>Options <span style={{ fontWeight: 400, color: '#888' }}>(● = correct answer)</span></label>
        {opts.map((o, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7 }}>
            <div onClick={() => setCorrect(i)} style={{ width: 16, height: 16, borderRadius: '50%', border: '2px solid', borderColor: correct === i ? '#185FA5' : '#ccc', background: correct === i ? '#185FA5' : '#fff', cursor: 'pointer', flexShrink: 0 }} />
            <input value={o} onChange={e => setOpts(p => p.map((x, j) => j === i ? e.target.value : x))} style={{ ...inp, flex: 1, marginBottom: 0 }} placeholder={`Option ${i + 1}`} />
            <input value={expl[i]} onChange={e => setExpl(p => p.map((x, j) => j === i ? e.target.value : x))} style={{ ...inp, flex: 1, marginBottom: 0, background: '#fff8f9', borderColor: '#fce4ec' }} placeholder="Explanation if wrong" />
          </div>
        ))}
        <button onClick={() => setOpts(p => [...p, ''])} style={{ fontSize: 12, color: '#185FA5', background: 'none', border: 'none', cursor: 'pointer', marginBottom: 14 }}>+ Add option</button>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => { if (q.trim() && opts.filter(x => x.trim()).length >= 2) { onInsert(build()); onClose() } }}
            style={{ flex: 1, padding: '9px', background: '#185FA5', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>Insert quiz</button>
          <button onClick={onClose} style={{ padding: '9px 16px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, cursor: 'pointer' }}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

function TableModal({ onInsert, onClose }: { onInsert: (r: number, c: number) => void; onClose: () => void }) {
  const [rows, setRows] = useState(3); const [cols, setCols] = useState(3)
  const n: React.CSSProperties = { width: 70, padding: '6px 8px', border: '1px solid #e5e7eb', borderRadius: 7, fontSize: 13, outline: 'none', textAlign: 'center' }
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ background: '#fff', borderRadius: 12, padding: 24, width: 300 }}>
        <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 14 }}>Insert table</h2>
        {[['Rows', rows, setRows] as const, ['Columns', cols, setCols] as const].map(([lbl, val, set]) => (
          <div key={lbl} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
            <span style={{ width: 70, fontSize: 13 }}>{lbl}</span>
            <input type="number" min={1} max={20} value={val} onChange={e => (set as any)(Math.max(1, Math.min(20, +e.target.value || 1)))} style={n} />
          </div>
        ))}
        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <button onClick={() => { onInsert(rows, cols); onClose() }} style={{ flex: 1, padding: '8px', background: '#185FA5', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>Insert</button>
          <button onClick={onClose} style={{ padding: '8px 14px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, cursor: 'pointer' }}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

function MediaModal({ type, lessons, moduleId, onInsert, onClose }: {
  type: 'image' | 'video' | 'file' | 'link'; lessons: any[]; moduleId: string
  onInsert: (h: string) => void; onClose: () => void
}) {
  const [url, setUrl] = useState(''); const [label, setLabel] = useState('')
  const [tab, setTab] = useState<'url' | 'upload'>('url')
  const [uploading, setUploading] = useState(false); const [err, setErr] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const inp: React.CSSProperties = { width: '100%', padding: '8px 10px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', outline: 'none', marginBottom: 10 }
  async function upload(f: File) {
    setUploading(true); setErr('')
    const fd = new FormData(); fd.append('file', f)
    const res = await fetch('/api/upload', { method: 'POST', body: fd })
    const data = await res.json()
    if (!res.ok) { setErr(data.error); setUploading(false); return }
    setUrl(data.url); setLabel(f.name); setUploading(false)
  }
  function build() {
    if (type === 'image') return `<img src="${url}" alt="${label || 'image'}" style="max-width:100%;border-radius:8px;margin:8px 0;display:block">`
    if (type === 'video') {
      const yt = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([A-Za-z0-9_-]+)/)
      const vm = url.match(/vimeo\.com\/(\d+)/)
      const src = yt ? `https://www.youtube.com/embed/${yt[1]}` : vm ? `https://player.vimeo.com/video/${vm[1]}` : url
      return `<iframe src="${src}" allowfullscreen style="width:100%;aspect-ratio:16/9;border:none;border-radius:8px;margin:8px 0;display:block"></iframe>`
    }
    if (type === 'file') return `<a href="${url}" target="_blank" download style="display:inline-flex;align-items:center;gap:7px;padding:8px 14px;background:#f3f4f6;border:1px solid #e5e7eb;border-radius:8px;font-size:13px;color:#185FA5;text-decoration:none;margin:6px 0">📎 ${label || url.split('/').pop()}</a>`
    if (type === 'link') return `<a href="${url}" target="${url.startsWith('/') ? '_self' : '_blank'}">${label || url}</a>`
    return ''
  }
  const titles: any = { image: 'Insert image / animation', video: 'Embed video', file: 'Attach file', link: 'Insert hyperlink' }
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ background: '#fff', borderRadius: 14, padding: 24, width: '100%', maxWidth: 460 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 14 }}>{titles[type]}</h2>
        {(type === 'image' || type === 'file') && (
          <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid #e5e7eb', marginBottom: 14 }}>
            {(['url', 'upload'] as const).map(t => (
              <button key={t} onClick={() => setTab(t)} style={{ padding: '6px 14px', fontSize: 12, fontWeight: 500, background: 'none', border: 'none', borderBottom: tab === t ? '2px solid #185FA5' : '2px solid transparent', color: tab === t ? '#185FA5' : '#888', cursor: 'pointer' }}>
                {t === 'url' ? 'External URL' : 'Upload file'}
              </button>
            ))}
          </div>
        )}
        {tab === 'upload' && (type === 'image' || type === 'file') ? (
          <div>
            <div onClick={() => fileRef.current?.click()} style={{ border: '2px dashed #e5e7eb', borderRadius: 10, padding: 20, textAlign: 'center', cursor: 'pointer', color: url ? '#27500A' : '#888', fontSize: 13, background: url ? '#f0fff4' : '#fafafa', marginBottom: 10 }}>
              {uploading ? 'Uploading…' : url ? '✓ ' + (label || 'Uploaded') : 'Click to choose a file'}
            </div>
            <input ref={fileRef} type="file" style={{ display: 'none' }} onChange={e => e.target.files?.[0] && upload(e.target.files[0])} />
          </div>
        ) : (
          <>
            <label style={{ fontSize: 11, fontWeight: 600, color: '#555', display: 'block', marginBottom: 3 }}>
              {type === 'video' ? 'YouTube / Vimeo URL' : type === 'link' ? 'URL or /student/modules/...' : 'Image URL'}
            </label>
            <input value={url} onChange={e => setUrl(e.target.value)} style={inp} placeholder={type === 'video' ? 'https://youtube.com/watch?v=...' : 'https://'} />
          </>
        )}
        {(type === 'image' || type === 'file' || type === 'link') && (
          <>
            <label style={{ fontSize: 11, fontWeight: 600, color: '#555', display: 'block', marginBottom: 3 }}>{type === 'link' ? 'Link text' : 'Label / alt text'}</label>
            <input value={label} onChange={e => setLabel(e.target.value)} style={inp} placeholder={type === 'link' ? 'Click here' : 'Description'} />
          </>
        )}
        {type === 'link' && lessons.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#555', marginBottom: 6 }}>Or link to a lesson in this module:</div>
            {lessons.map(l => (
              <button key={l.id} onClick={() => { setUrl(`/student/modules/${moduleId}/lessons/${l.id}`); setLabel(l.title) }}
                style={{ display: 'block', width: '100%', textAlign: 'left', padding: '6px 10px', background: url.includes(l.id) ? '#E6F1FB' : '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 7, fontSize: 12, cursor: 'pointer', marginBottom: 4, color: '#333' }}>
                📄 {l.title}
              </button>
            ))}
          </div>
        )}
        {err && <div style={{ fontSize: 12, color: '#791F1F', marginBottom: 8 }}>{err}</div>}
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => { if (url) { onInsert(build()); onClose() } }} disabled={!url || uploading}
            style={{ flex: 1, padding: '9px', background: '#185FA5', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer', opacity: (!url || uploading) ? .5 : 1 }}>Insert</button>
          <button onClick={onClose} style={{ padding: '9px 16px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, cursor: 'pointer' }}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

// ── Main editor ───────────────────────────────────────────────────────────────
export default function LessonEditorPage() {
  const supabase = createClient()
  const params = useParams() as any
  const moduleId = params?.id as string
  const lessonId = params?.lessonId as string
  const isNew = !lessonId || lessonId === 'new'

  const [title, setTitle] = useState('')
  const [authorName, setAuthorName] = useState('')
  const [authorId, setAuthorId] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [lessons, setLessons] = useState<any[]>([])
  const [modal, setModal] = useState<null | 'quiz' | 'table' | 'image' | 'video' | 'file' | 'link'>(null)
  const editorRef = useRef<HTMLDivElement>(null)
  const savedRange = useRef<Range | null>(null)

  // #6 / #10 — Load existing lesson content
  // Key fix: we set innerHTML via ref, and re-render highlighted code blocks
  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        setAuthorId(user.id)
        const { data: prof } = await supabase.from('profiles').select('full_name').eq('id', user.id).single()
        setAuthorName((prof as any)?.full_name ?? user.email ?? '')
      }
      const { data: ls } = await supabase.from('lessons').select('id,title,position').eq('module_id', moduleId).order('position')
      setLessons((ls ?? []) as any[])

      if (!isNew && lessonId) {
        const { data, error: le } = await supabase.from('lessons').select('*').eq('id', lessonId).single()
        if (le) { setError('Failed to load lesson: ' + le.message); setLoading(false); return }
        if (data) {
          setTitle((data as any).title ?? '')
          // Store HTML to inject after state update causes re-render
          const html = (data as any).content_html ?? '<p><br></p>'
          setLoading(false)
          // Wait for next tick so ref is available
          setTimeout(() => {
            if (editorRef.current) {
              editorRef.current.innerHTML = html
              // Render code block previews (highlighted but read-only display — actual code in textarea)
              editorRef.current.querySelectorAll('.cb-code-preview').forEach(el => {
                const raw = el.getAttribute('data-code') ?? ''
                el.innerHTML = highlightPython(raw)
              })
            }
          }, 0)
          return
        }
      }
      setLoading(false)
      setTimeout(() => {
        if (editorRef.current && !editorRef.current.innerHTML.trim()) {
          editorRef.current.innerHTML = '<p><br></p>'
        }
      }, 0)
    }
    load()
  }, [])

  // Table helpers
  useEffect(() => {
    const w = window as any
    w.cbTblAddRow = (id: string) => {
      const t = document.getElementById(id) as HTMLTableElement; if (!t) return
      const cols = t.rows[0]?.cells.length ?? 1
      const tbody = t.tBodies[0] ?? t; const r = tbody.insertRow()
      for (let i = 0; i < cols; i++) { const c = r.insertCell(); c.contentEditable = 'true'; c.style.cssText = 'border:1px solid #e5e7eb;padding:7px 11px'; c.textContent = 'Cell' }
    }
    w.cbTblDelRow = (id: string) => {
      const t = document.getElementById(id) as HTMLTableElement; if (!t) return
      const tbody = t.tBodies[0]; if (tbody && tbody.rows.length > 1) tbody.deleteRow(tbody.rows.length - 1)
    }
    w.cbTblAddCol = (id: string) => {
      const t = document.getElementById(id) as HTMLTableElement; if (!t) return
      Array.from(t.rows).forEach((row, ri) => {
        const c = row.insertCell(); c.contentEditable = 'true'
        c.style.cssText = ri === 0 ? 'border:1px solid #e5e7eb;padding:7px 11px;background:#f9fafb;font-weight:600' : 'border:1px solid #e5e7eb;padding:7px 11px'
        c.textContent = ri === 0 ? 'Header' : 'Cell'
      })
    }
    w.cbTblDelCol = (id: string) => {
      const t = document.getElementById(id) as HTMLTableElement; if (!t) return
      Array.from(t.rows).forEach(r => { if (r.cells.length > 1) r.deleteCell(r.cells.length - 1) })
    }
  }, [])

  // ── Cursor helpers ─────────────────────────────────────────────────────────
  function saveRange() {
    const sel = window.getSelection()
    if (sel && sel.rangeCount) savedRange.current = sel.getRangeAt(0).cloneRange()
  }
  function restoreRange() {
    const sel = window.getSelection()
    if (sel && savedRange.current) { sel.removeAllRanges(); sel.addRange(savedRange.current) }
  }
  function openModal(m: typeof modal) { saveRange(); setModal(m) }

  function insertAtCursor(html: string) {
    restoreRange()
    editorRef.current?.focus()
    const sel = window.getSelection()
    if (!sel || !sel.rangeCount) {
      editorRef.current!.innerHTML += html + '<p><br></p>'; return
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
      const r = document.createRange(); r.setStartAfter(last); r.collapse(true)
      sel.removeAllRanges(); sel.addRange(r)
    }
    editorRef.current?.focus()
  }

  function exec(cmd: string, val?: string) { editorRef.current?.focus(); document.execCommand(cmd, false, val ?? '') }
  function heading(t: 'h1' | 'h2' | 'h3') { editorRef.current?.focus(); document.execCommand('formatBlock', false, t) }
  function insertBlockquote() { editorRef.current?.focus(); document.execCommand('formatBlock', false, 'blockquote') }
  function highlight(color: string) {
    editorRef.current?.focus()
    const text = window.getSelection()?.toString() || 'highlighted text'
    document.execCommand('insertHTML', false, `<span style="background:${color};border-radius:2px;padding:0 2px">${text}</span>`)
  }

  function insertTable(rows: number, cols: number) {
    const id = 'tbl' + Date.now()
    const hdr = Array.from({ length: cols }, (_, i) => `<th style="border:1px solid #e5e7eb;padding:7px 11px;background:#f9fafb;font-weight:600" contenteditable="true">Header ${i + 1}</th>`).join('')
    const row = Array.from({ length: cols }, () => `<td style="border:1px solid #e5e7eb;padding:7px 11px" contenteditable="true">Cell</td>`).join('')
    const body = Array.from({ length: rows - 1 }, () => `<tr>${row}</tr>`).join('')
    const bs = `padding:3px 9px;font-size:11px;border:1px solid #e5e7eb;border-radius:6px;background:#f9fafb;cursor:pointer;font-family:inherit`
    insertAtCursor(`<div contenteditable="false" style="margin:10px 0;overflow-x:auto">
<table id="${id}" style="border-collapse:collapse;width:100%;min-width:200px"><thead><tr>${hdr}</tr></thead><tbody>${body}</tbody></table>
<div style="display:flex;gap:6px;margin-top:5px">
<button style="${bs}" onclick="cbTblAddRow('${id}')">+ Row</button>
<button style="${bs}" onclick="cbTblDelRow('${id}')">− Row</button>
<button style="${bs}" onclick="cbTblAddCol('${id}')">+ Col</button>
<button style="${bs}" onclick="cbTblDelCol('${id}')">− Col</button>
</div></div>`)
  }

  // #3 #4 #5 — CODE BLOCKS: use textarea for editing, data-code for storage
  // The raw code is stored in data-code attribute.
  // A preview div shows highlighted HTML. Never use contenteditable pre.
  function insertCodeBlock() {
    const id = 'code' + Date.now()
    const defaultCode = '# Write Python here\nprint("Hello, world!")'
    const highlighted = highlightPython(defaultCode)
    insertAtCursor(`<div class="cb-code-block" contenteditable="false" data-code="${encodeURIComponent(defaultCode)}" style="background:#1e1e2e;border-radius:8px;overflow:hidden;margin:10px 0">
<div style="background:#16213e;padding:6px 14px;font-size:10px;color:#7aa2f7;font-family:monospace;letter-spacing:.06em;display:flex;align-items:center;justify-content:space-between">
  <span>PYTHON</span>
  <button onclick="cbToggleCodeEdit('${id}')" style="padding:2px 8px;font-size:10px;background:transparent;color:#7aa2f7;border:1px solid #7aa2f7;border-radius:4px;cursor:pointer;font-family:inherit">Edit</button>
</div>
<pre id="${id}_pre" style="background:#1e1e2e;color:#cdd6f4;padding:14px;font-family:ui-monospace,monospace;font-size:13px;margin:0;white-space:pre;overflow-x:auto;border-radius:0;line-height:1.6">${highlighted}</pre>
<textarea id="${id}_ta" spellcheck="false" style="display:none;width:100%;background:#1a1b26;color:#cdd6f4;font-family:ui-monospace,monospace;font-size:13px;padding:14px;border:none;outline:none;resize:vertical;min-height:100px;line-height:1.6;box-sizing:border-box">${defaultCode}</textarea>
</div>`)
    // Register toggle function
    const w = window as any
    if (!w.cbToggleCodeEdit) {
      w.cbToggleCodeEdit = (id: string) => {
        const pre = document.getElementById(id + '_pre')
        const ta = document.getElementById(id + '_ta') as HTMLTextAreaElement
        const block = pre?.closest('.cb-code-block') as HTMLElement
        if (!pre || !ta || !block) return
        if (ta.style.display === 'none') {
          // Switch to edit mode
          ta.value = block.getAttribute('data-code') ? decodeURIComponent(block.getAttribute('data-code')!) : (pre.textContent ?? '')
          ta.style.display = 'block'; pre.style.display = 'none'
          ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 'px'
          ta.oninput = () => { ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 'px' }
        } else {
          // Switch back to preview mode — save code and re-highlight
          const code = ta.value
          block.setAttribute('data-code', encodeURIComponent(code))
          // Dynamically import highlighter
          const highlighted = (window as any).__highlightPython?.(code) ?? code
          pre.innerHTML = highlighted; ta.style.display = 'none'; pre.style.display = 'block'
        }
      }
    }
  }

  // Expose highlightPython to window so onclick can use it
  useEffect(() => {
    (window as any).__highlightPython = highlightPython
  }, [])

  // #4 — TRY-IT: textarea is editable, code stored in data-code
  function insertTryIt() {
    const defaultCode = `mass = 5\nacceleration = 3\nforce = mass * acceleration\nprint(f"Force = {force} N")`
    const enc = encodeURIComponent(defaultCode)
    insertAtCursor(`<div class="tryit-widget" contenteditable="false" data-code="${enc}" style="background:#1a1b26;border-radius:8px;overflow:hidden;margin:10px 0">
<div style="background:#16213e;padding:7px 14px;font-family:monospace;font-size:10px;color:#7aa2f7;letter-spacing:.06em;display:flex;align-items:center;justify-content:space-between">
  <span>▶ Try it — Python</span>
  <button style="padding:3px 10px;font-size:11px;background:#7aa2f7;color:#fff;border:none;border-radius:5px;cursor:pointer;font-family:inherit" onclick="cbRunTryIt(this)">Run ▶</button>
</div>
<textarea class="tryit-code" spellcheck="false" style="width:100%;background:#1a1b26;color:#cdd6f4;font-family:ui-monospace,monospace;font-size:13px;padding:12px 14px;border:none;outline:none;resize:none;line-height:1.6;min-height:80px;display:block;box-sizing:border-box;overflow:hidden" oninput="this.style.height='auto';this.style.height=this.scrollHeight+'px'">${defaultCode}</textarea>
<div class="tryit-output" style="background:#0d1117;color:#a6e3a1;font-family:ui-monospace,monospace;font-size:13px;padding:8px 14px;white-space:pre-wrap;display:none;border-top:1px solid #2a2a4a"></div>
</div>`)
  }

  // Register tryit runner globally
  useEffect(() => {
    (window as any).cbRunTryIt = (btn: HTMLElement) => {
      const w = btn.closest('.tryit-widget')!
      const ta = w.querySelector('textarea') as HTMLTextAreaElement
      const out = w.querySelector('.tryit-output') as HTMLElement
      const code = ta.value; let output = ''
      try {
        const vars: Record<string, any> = {}
        code.split('\n').forEach(line => {
          const t = line.trim()
          const pm = t.match(/^print\((.+)\)$/)
          if (pm) {
            try {
              const r = pm[1]; const fstr = r.match(/^f["'](.*)["']$/)
              if (fstr) {
                output += fstr[1].replace(/\{([^}]+)\}/g, (_: any, v: string) => {
                  try { return String(eval(v.replace(/\b(\w+)\b/g, (m: string) => vars[m] !== undefined ? JSON.stringify(vars[m]) : m))) } catch { return v }
                }) + '\n'
              } else {
                output += String(eval(r.replace(/\b(\w+)\b/g, (m: string) => vars[m] !== undefined ? JSON.stringify(vars[m]) : m))) + '\n'
              }
            } catch (e: any) { output += 'Error: ' + e.message + '\n' }
          }
          const asgn = t.match(/^(\w+)\s*=\s*(.+)$/)
          if (asgn && !t.startsWith('print')) {
            try { vars[asgn[1]] = eval(asgn[2].replace(/\b(\w+)\b/g, (m: string) => vars[m] !== undefined ? JSON.stringify(vars[m]) : m)) } catch {}
          }
        })
      } catch (e: any) { output = 'Error: ' + e.message }
      out.textContent = output.trim() || '(no output)'; out.style.display = 'block'
    }
  }, [])

  function insertAccordion() {
    insertAtCursor(`<details style="border:1px solid #e5e7eb;border-radius:8px;margin:10px 0;overflow:hidden">
<summary style="padding:10px 14px;background:#f9fafb;cursor:pointer;font-weight:500;font-size:14px;list-style:none;user-select:none">▶ Click to reveal</summary>
<div style="padding:12px 14px;font-size:14px" contenteditable="true">Write hidden content here.</div>
</details>`)
  }

  function insertImportant() {
    insertAtCursor(`<div contenteditable="false" style="background:#FAEEDA;border-left:3px solid #BA7517;border-radius:0 8px 8px 0;padding:10px 14px;margin:10px 0">
<div style="font-size:10px;font-weight:700;color:#633806;text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px">⚠ Important</div>
<div style="font-size:14px;color:#412402" contenteditable="true">Write important content here.</div>
</div>`)
  }

  // ── Key handler ────────────────────────────────────────────────────────────
  function onKeyDown(e: React.KeyboardEvent) {
    const sel = window.getSelection()
    if (!sel || !sel.rangeCount) return
    const range = sel.getRangeAt(0)

    if (e.key === 'Enter' && e.shiftKey) {
      let node: Node | null = range.startContainer
      while (node && (node as HTMLElement).tagName !== 'BLOCKQUOTE') node = node.parentElement
      if (node) {
        e.preventDefault()
        const p = document.createElement('p'); p.innerHTML = '<br>'
        ;(node as HTMLElement).after(p)
        const r = document.createRange(); r.setStart(p, 0); r.collapse(true)
        sel.removeAllRanges(); sel.addRange(r)
        return
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      let node: Node | null = range.startContainer
      while (node && node !== editorRef.current) {
        if ((node as HTMLElement).contentEditable === 'false') {
          e.preventDefault()
          const p = document.createElement('p'); p.innerHTML = '<br>'
          ;(node as HTMLElement).after(p)
          const r = document.createRange(); r.setStart(p, 0); r.collapse(true)
          sel.removeAllRanges(); sel.addRange(r)
          return
        }
        node = node.parentElement
      }
    }
  }

  // ── Save ──────────────────────────────────────────────────────────────────
  // #3 #4: Before saving, sync textarea values to data-code attributes on code blocks and try-it widgets
  async function save() {
    if (!title.trim()) { setError('Title is required.'); return }
    if (!moduleId || moduleId === 'undefined') { setError('Module ID missing.'); return }
    setSaving(true); setError('')

    // Sync code block textareas → data-code (in case user edited without clicking back to preview)
    editorRef.current?.querySelectorAll('.cb-code-block').forEach(block => {
      const ta = block.querySelector('textarea') as HTMLTextAreaElement
      if (ta && ta.style.display !== 'none') {
        block.setAttribute('data-code', encodeURIComponent(ta.value))
        const pre = block.querySelector('pre')
        if (pre) pre.innerHTML = highlightPython(ta.value)
        ta.style.display = 'none'
        if (pre) pre.style.display = 'block'
      }
    })

    // Sync try-it textareas → data-code
    editorRef.current?.querySelectorAll('.tryit-widget').forEach(block => {
      const ta = block.querySelector('textarea') as HTMLTextAreaElement
      if (ta) block.setAttribute('data-code', encodeURIComponent(ta.value))
    })

    const clone = editorRef.current?.cloneNode(true) as HTMLElement
    // Strip contenteditable attrs from clone before saving
    clone?.querySelectorAll('[contenteditable]').forEach(el => el.removeAttribute('contenteditable'))
    const html = clone?.innerHTML ?? ''

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { window.location.href = '/login'; return }

    if (isNew) {
      const { data: last } = await supabase.from('lessons').select('position').eq('module_id', moduleId).order('position', { ascending: false }).limit(1)
      const pos = last && last.length > 0 ? ((last[0] as any).position ?? 0) + 1 : 0
      const { error: err } = await supabase.from('lessons').insert({ module_id: moduleId, title: title.trim(), content_html: html, position: pos, author_id: authorId } as any)
      if (err) { setError(err.message); setSaving(false); return }
    } else {
      const { error: err } = await supabase.from('lessons').update({ title: title.trim(), content_html: html, updated_at: new Date().toISOString() } as any).eq('id', lessonId)
      if (err) { setError(err.message); setSaving(false); return }
    }
    window.location.href = '/teacher/modules/' + moduleId
  }

  const TB: React.CSSProperties = { padding: '4px 8px', fontSize: 12, border: '1px solid transparent', borderRadius: 5, background: 'none', cursor: 'pointer', fontFamily: 'inherit', lineHeight: 1 }
  const SEP = <div style={{ width: 1, background: '#e5e7eb', margin: '2px 3px', alignSelf: 'stretch' }} />

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#888', fontFamily: 'system-ui,sans-serif' }}>Loading lesson…</div>

  return (
    <div style={{ maxWidth: 880, margin: '24px auto', padding: '0 20px', fontFamily: 'system-ui, sans-serif' }}>
      <style>{PYTHON_CSS}{`
        .cb-editor h1{font-size:22px;font-weight:700;margin:14px 0 6px}
        .cb-editor h2{font-size:18px;font-weight:700;margin:12px 0 5px}
        .cb-editor h3{font-size:15px;font-weight:700;margin:10px 0 4px}
        .cb-editor p{margin:4px 0}
        .cb-editor blockquote{border-left:3px solid #185FA5;padding:4px 0 4px 14px;margin:8px 0;color:#555;font-style:italic}
        .cb-editor ul{padding-left:22px;margin:6px 0;list-style:disc}
        .cb-editor ol{padding-left:22px;margin:6px 0;list-style:decimal}
        .cb-editor li{margin:3px 0}
        .cb-editor a{color:#185FA5;text-decoration:underline}
        .cb-editor table{border-collapse:collapse;width:100%}
        .cb-editor td,.cb-editor th{border:1px solid #e5e7eb;padding:6px 10px;min-width:50px}
        .cb-editor th{background:#f9fafb;font-weight:600}
        .cb-quiz{background:#f0f7ff;border:1px solid #B5D4F4;border-radius:10px;margin:12px 0;overflow:hidden}
      `}</style>

      <BackLink href={'/teacher/modules/' + moduleId} label="Back to module" />
      <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 4 }}>{isNew ? 'New lesson' : 'Edit lesson'}</h1>
      {authorName && <div style={{ fontSize: 12, color: '#888', marginBottom: 12 }}>Author: {authorName}</div>}

      <label style={{ fontSize: 11, fontWeight: 600, color: '#666', display: 'block', marginBottom: 3 }}>Lesson title</label>
      <input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Newton's Laws of Motion"
        style={{ width: '100%', maxWidth: 520, padding: '8px 11px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 14, fontFamily: 'inherit', marginBottom: 16, outline: 'none' }} />

      <label style={{ fontSize: 11, fontWeight: 600, color: '#666', display: 'block', marginBottom: 3 }}>Content</label>

      {/* Toolbar */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2, padding: '6px 8px', border: '1px solid #e5e7eb', borderBottom: 'none', borderRadius: '8px 8px 0 0', background: '#f9fafb', alignItems: 'center' }}>
        <button style={TB} onMouseDown={e=>{e.preventDefault();exec('bold')}}><b>B</b></button>
        <button style={TB} onMouseDown={e=>{e.preventDefault();exec('italic')}}><i>I</i></button>
        <button style={TB} onMouseDown={e=>{e.preventDefault();exec('underline')}}><u>U</u></button>
        {SEP}
        <button style={{...TB,fontWeight:700,fontSize:13}} onMouseDown={e=>{e.preventDefault();heading('h1')}}>H1</button>
        <button style={{...TB,fontWeight:700,fontSize:12}} onMouseDown={e=>{e.preventDefault();heading('h2')}}>H2</button>
        <button style={{...TB,fontWeight:700,fontSize:11}} onMouseDown={e=>{e.preventDefault();heading('h3')}}>H3</button>
        {SEP}
        <button style={TB} onMouseDown={e=>{e.preventDefault();exec('insertUnorderedList')}}>• list</button>
        <button style={TB} onMouseDown={e=>{e.preventDefault();exec('insertOrderedList')}}>1. list</button>
        <button style={TB} onMouseDown={e=>{e.preventDefault();insertBlockquote()}} title="Shift+Enter to exit">" quote</button>
        {SEP}
        <button style={{...TB,background:'#fff59d',color:'#333',fontWeight:700}} onMouseDown={e=>{e.preventDefault();highlight('#fff59d')}}>A</button>
        <button style={{...TB,background:'#bbdefb',color:'#0d47a1',fontWeight:700}} onMouseDown={e=>{e.preventDefault();highlight('#bbdefb')}}>A</button>
        <button style={{...TB,background:'#b9f6ca',color:'#1b5e20',fontWeight:700}} onMouseDown={e=>{e.preventDefault();highlight('#b9f6ca')}}>A</button>
        <button style={{...TB,background:'#fce4ec',color:'#880e4f',fontWeight:700}} onMouseDown={e=>{e.preventDefault();highlight('#fce4ec')}}>A</button>
        {SEP}
        <button style={{...TB,background:'#FAEEDA',color:'#633806'}} onMouseDown={e=>{e.preventDefault();insertImportant()}}>! Imp</button>
        <button style={{...TB,background:'#E1F5EE',color:'#085041'}} onMouseDown={e=>{e.preventDefault();insertAccordion()}}>▾ Fold</button>
        <button style={TB} onMouseDown={e=>{e.preventDefault();openModal('table')}}>⊞ Table</button>
        {SEP}
        <button style={{...TB,background:'#1e1e2e',color:'#cdd6f4'}} onMouseDown={e=>{e.preventDefault();insertCodeBlock()}}>&lt;/&gt; Code</button>
        <button style={{...TB,background:'#1a1b26',color:'#7aa2f7'}} onMouseDown={e=>{e.preventDefault();insertTryIt()}}>&gt;_ Try</button>
        <button style={{...TB,background:'#f0f7ff',color:'#185FA5'}} onMouseDown={e=>{e.preventDefault();openModal('quiz')}}>✓ Quiz</button>
        {SEP}
        <button style={TB} onMouseDown={e=>{e.preventDefault();openModal('image')}}>🖼 Image</button>
        <button style={TB} onMouseDown={e=>{e.preventDefault();openModal('video')}}>▶ Video</button>
        <button style={TB} onMouseDown={e=>{e.preventDefault();openModal('file')}}>📎 File</button>
        <button style={TB} onMouseDown={e=>{e.preventDefault();openModal('link')}}>🔗 Link</button>
      </div>

      <div ref={editorRef} contentEditable suppressContentEditableWarning className="cb-editor" onKeyDown={onKeyDown}
        style={{ minHeight: 360, padding: '14px 16px', border: '1px solid #e5e7eb', borderRadius: '0 0 8px 8px', background: '#fff', fontSize: 14, lineHeight: 1.75, outline: 'none', color: '#111', fontFamily: 'system-ui,sans-serif' }} />

      {error && <div style={{ fontSize: 12, padding: '8px 11px', background: '#FCEBEB', color: '#791F1F', borderRadius: 8, margin: '12px 0' }}>{error}</div>}
      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
        <button onClick={save} disabled={saving}
          style={{ padding: '9px 20px', background: '#185FA5', color: '#E6F1FB', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer', opacity: saving ? .6 : 1 }}>
          {saving ? 'Saving…' : 'Save lesson'}
        </button>
        <a href={'/teacher/modules/' + moduleId} style={{ padding: '9px 16px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, textDecoration: 'none', color: '#555', background: '#fff', display: 'inline-flex', alignItems: 'center' }}>Cancel</a>
      </div>

      {modal === 'quiz' && <QuizModal onInsert={insertAtCursor} onClose={() => setModal(null)} />}
      {modal === 'table' && <TableModal onInsert={insertTable} onClose={() => setModal(null)} />}
      {(modal === 'image' || modal === 'video' || modal === 'file' || modal === 'link') && (
        <MediaModal type={modal} lessons={lessons} moduleId={moduleId} onInsert={insertAtCursor} onClose={() => setModal(null)} />
      )}
    </div>
  )
}
