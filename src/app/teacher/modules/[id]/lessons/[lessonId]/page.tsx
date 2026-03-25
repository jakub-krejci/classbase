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

  function build() {
    const o = opts.filter(x => x.trim())
    const oEnc = JSON.stringify(o).replace(/"/g, '&quot;')
    const eEnc = JSON.stringify(expl.slice(0, o.length)).replace(/"/g, '&quot;')
    return `<div class="cb-quiz" data-q="${q.replace(/"/g,'&quot;')}" data-opts="${oEnc}" data-correct="${correct}" data-expl="${eEnc}" contenteditable="false" style="background:#f0f7ff;border:1px solid #B5D4F4;border-radius:10px;margin:12px 0;padding:0;overflow:hidden"><div style="padding:10px 14px;background:#E6F1FB;font-size:10px;font-weight:700;color:#0C447C;text-transform:uppercase;letter-spacing:.06em">✓ Quiz question</div><div style="padding:10px 14px;font-size:14px;font-weight:600;color:#333">${q}</div></div>`
  }

  const i: React.CSSProperties = { width: '100%', padding: '7px 9px', border: '1px solid #e5e7eb', borderRadius: 7, fontSize: 13, fontFamily: 'inherit', outline: 'none', marginBottom: 8 }
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ background: '#fff', borderRadius: 14, padding: 24, width: '100%', maxWidth: 540, maxHeight: '90vh', overflowY: 'auto' }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 14 }}>Insert quiz question</h2>
        <label style={{ fontSize: 11, fontWeight: 600, color: '#555', display: 'block', marginBottom: 3 }}>Question text</label>
        <input value={q} onChange={e => setQ(e.target.value)} style={i} placeholder="e.g. What does F = ma represent?" />
        <label style={{ fontSize: 11, fontWeight: 600, color: '#555', display: 'block', margin: '8px 0 6px' }}>Options <span style={{ fontWeight: 400, color: '#888' }}>(click the dot to mark the correct one)</span></label>
        {opts.map((o, idx) => (
          <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7 }}>
            <div onClick={() => setCorrect(idx)} style={{ width: 16, height: 16, borderRadius: '50%', border: '2px solid', borderColor: correct === idx ? '#185FA5' : '#ccc', background: correct === idx ? '#185FA5' : '#fff', cursor: 'pointer', flexShrink: 0 }} />
            <input value={o} onChange={e => setOpts(p => p.map((x, j) => j === idx ? e.target.value : x))} style={{ ...i, flex: 1, marginBottom: 0 }} placeholder={`Option ${idx + 1}`} />
            <input value={expl[idx]} onChange={e => setExpl(p => p.map((x, j) => j === idx ? e.target.value : x))} style={{ ...i, flex: 1, marginBottom: 0, background: '#fff8f9', borderColor: '#fce4ec' }} placeholder="Explanation if wrong" />
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
  const [rows, setRows] = useState(3)
  const [cols, setCols] = useState(3)
  const i: React.CSSProperties = { width: 70, padding: '6px 8px', border: '1px solid #e5e7eb', borderRadius: 7, fontSize: 13, outline: 'none', textAlign: 'center' }
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ background: '#fff', borderRadius: 12, padding: 24, width: 300 }}>
        <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 14 }}>Insert table</h2>
        {[['Rows', rows, setRows], ['Columns', cols, setCols]].map(([lbl, val, set]: any) => (
          <div key={lbl} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
            <span style={{ width: 70, fontSize: 13 }}>{lbl}</span>
            <input type="number" min={1} max={20} value={val} onChange={e => set(Math.max(1, Math.min(20, +e.target.value || 1)))} style={i} />
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
  type: 'image' | 'video' | 'file' | 'link'
  lessons: any[]; moduleId: string
  onInsert: (h: string) => void; onClose: () => void
}) {
  const [url, setUrl] = useState('')
  const [label, setLabel] = useState('')
  const [tab, setTab] = useState<'url' | 'upload'>('url')
  const [uploading, setUploading] = useState(false)
  const [err, setErr] = useState('')
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

  function build(): string {
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

  const titles = { image: 'Insert image / animation', video: 'Embed video', file: 'Attach downloadable file', link: 'Insert hyperlink' }
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
              {type === 'video' ? 'YouTube / Vimeo URL' : type === 'link' ? 'URL (https:// or /student/modules/...)' : 'Image URL'}
            </label>
            <input value={url} onChange={e => setUrl(e.target.value)} style={inp} placeholder={type === 'video' ? 'https://youtube.com/watch?v=...' : 'https://'} />
          </>
        )}

        {(type === 'image' || type === 'file' || type === 'link') && (
          <>
            <label style={{ fontSize: 11, fontWeight: 600, color: '#555', display: 'block', marginBottom: 3 }}>{type === 'link' ? 'Link text' : 'Label / alt text'}</label>
            <input value={label} onChange={e => setLabel(e.target.value)} style={inp} placeholder={type === 'link' ? 'Click here' : 'Describe this'} />
          </>
        )}

        {/* Internal lesson links */}
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

  // #10 — Load existing lesson content reliably
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
        if (data && editorRef.current) {
          setTitle((data as any).title ?? '')
          // #10 — set innerHTML directly (must happen after DOM is ready)
          editorRef.current.innerHTML = (data as any).content_html ?? '<p><br></p>'
          // Apply syntax highlighting to loaded code blocks
          editorRef.current.querySelectorAll('pre').forEach(pre => {
            const p = pre as HTMLElement
            if (!p.dataset.hl && !p.querySelector('span.py-kw')) {
              p.dataset.hl = '1'
              p.innerHTML = highlightPython(p.textContent ?? '')
            }
          })
        }
      } else if (isNew && editorRef.current) {
        editorRef.current.innerHTML = '<p><br></p>'
      }
      setLoading(false)
    }
    load()
  }, [])

  // Register global table helpers
  useEffect(() => {
    const w = window as any
    w.cbTblAddRow = (id: string) => {
      const t = document.getElementById(id) as HTMLTableElement; if (!t) return
      const cols = t.rows[0]?.cells.length ?? 1
      const tbody = t.tBodies[0] ?? t
      const r = tbody.insertRow()
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
    w.cbCopy = (id: string) => {
      const p = document.getElementById(id); if (!p) return
      navigator.clipboard?.writeText(p.textContent ?? '')
      const btn = document.querySelector(`[data-copy="${id}"]`) as HTMLButtonElement
      if (btn) { btn.textContent = 'Copied!'; setTimeout(() => btn.textContent = 'Copy', 1500) }
    }
  }, [])

  // ── Cursor helpers ────────────────────────────────────────────────────────
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

  // ── Commands ──────────────────────────────────────────────────────────────
  function exec(cmd: string, val?: string) { editorRef.current?.focus(); document.execCommand(cmd, false, val ?? '') }
  function heading(t: 'h1' | 'h2' | 'h3') { editorRef.current?.focus(); document.execCommand('formatBlock', false, t) }

  function insertBlockquote() {
    editorRef.current?.focus()
    document.execCommand('formatBlock', false, 'blockquote')
  }

  function highlight(color: string) {
    editorRef.current?.focus()
    const sel = window.getSelection()
    const text = sel?.toString() || 'highlighted text'
    document.execCommand('insertHTML', false, `<span style="background:${color};border-radius:2px;padding:0 2px">${text}</span>`)
  }

  function insertTable(rows: number, cols: number) {
    const id = 'tbl' + Date.now()
    const hdr = Array.from({ length: cols }, (_, i) => `<th style="border:1px solid #e5e7eb;padding:7px 11px;background:#f9fafb;font-weight:600" contenteditable="true">Header ${i + 1}</th>`).join('')
    const row = Array.from({ length: cols }, () => `<td style="border:1px solid #e5e7eb;padding:7px 11px" contenteditable="true">Cell</td>`).join('')
    const body = Array.from({ length: rows - 1 }, () => `<tr>${row}</tr>`).join('')
    const btnStyle = `padding:3px 9px;font-size:11px;border:1px solid #e5e7eb;border-radius:6px;background:#f9fafb;cursor:pointer;font-family:inherit`
    insertAtCursor(`<div contenteditable="false" style="margin:10px 0;overflow-x:auto">
<table id="${id}" style="border-collapse:collapse;width:100%;min-width:200px"><thead><tr>${hdr}</tr></thead><tbody>${body}</tbody></table>
<div style="display:flex;gap:6px;margin-top:5px">
  <button style="${btnStyle}" onclick="cbTblAddRow('${id}')">+ Row</button>
  <button style="${btnStyle}" onclick="cbTblDelRow('${id}')">− Row</button>
  <button style="${btnStyle}" onclick="cbTblAddCol('${id}')">+ Col</button>
  <button style="${btnStyle}" onclick="cbTblDelCol('${id}')">− Col</button>
</div></div>`)
  }

  function insertCodeBlock() {
    const id = 'pre' + Date.now()
    const defaultCode = `# Python example\nprint("Hello, world!")`
    const highlighted = highlightPython(defaultCode)
    insertAtCursor(`<div contenteditable="false" style="background:#1e1e2e;border-radius:8px;overflow:hidden;margin:10px 0;position:relative">
<div style="background:#16213e;padding:6px 14px;font-size:10px;color:#7aa2f7;font-family:monospace;letter-spacing:.06em;display:flex;align-items:center;justify-content:space-between">
  <span>PYTHON</span>
  <button data-copy="${id}" style="padding:2px 8px;font-size:10px;background:transparent;color:#7aa2f7;border:1px solid #7aa2f7;border-radius:4px;cursor:pointer;font-family:inherit" onclick="cbCopy('${id}')">Copy</button>
</div>
<pre id="${id}" contenteditable="true" spellcheck="false" data-lang="python" style="background:#1e1e2e;color:#cdd6f4;padding:14px;font-family:ui-monospace,monospace;font-size:13px;margin:0;white-space:pre;overflow-x:auto;border-radius:0;outline:none;line-height:1.6">${highlighted}</pre>
</div>`)
  }

  function insertTryIt() {
    const id = 'tryit' + Date.now()
    const defaultCode = `mass = 5\nacceleration = 3\nforce = mass * acceleration\nprint(f"Force = {force} N")`
    insertAtCursor(`<div class="tryit-widget" id="${id}" contenteditable="false" style="background:#1a1b26;border-radius:8px;overflow:hidden;margin:10px 0">
<div style="background:#16213e;padding:7px 14px;font-family:monospace;font-size:10px;color:#7aa2f7;letter-spacing:.06em;display:flex;align-items:center;justify-content:space-between">
  <span>▶ Try it — Python</span>
  <button style="padding:3px 10px;font-size:11px;background:#7aa2f7;color:#fff;border:none;border-radius:5px;cursor:pointer;font-family:inherit" onclick="(function(b){var w=b.closest('.tryit-widget');var ta=w.querySelector('textarea');var out=w.querySelector('.tryit-output');var code=ta.value;var output='';try{var vars={};code.split('\\n').forEach(function(line){var pm=line.trim().match(/^print\\((.+)\\)$/);if(pm){try{var r=pm[1];var f=r.match(/^f[\"\\'](.+)[\"\\']$/);if(f){output+=f[1].replace(/\\{([^}]+)\\}/g,function(_,v){try{return eval(v.replace(/\\b(\\w+)\\b/g,function(m){return vars[m]!==undefined?JSON.stringify(vars[m]):m}))}catch(e){return v}})+'\\n'}else{output+=String(eval(r.replace(/\\b(\\w+)\\b/g,function(m){return vars[m]!==undefined?JSON.stringify(vars[m]):m})))+'\\n'}}catch(e){output+='Error: '+e.message+'\\n'}}var a=line.trim().match(/^(\\w+)\\s*=\\s*(.+)$/);if(a&&!line.trim().startsWith('print')){try{vars[a[1]]=eval(a[2].replace(/\\b(\\w+)\\b/g,function(m){return vars[m]!==undefined?JSON.stringify(vars[m]):m}))}catch(e){}}})}catch(e){output='Error: '+e.message}out.textContent=output.trim()||'(no output)';out.style.display='block'})(this)">Run ▶</button>
</div>
<textarea spellcheck="false" style="width:100%;background:#1a1b26;color:#cdd6f4;font-family:ui-monospace,monospace;font-size:13px;padding:12px 14px;border:none;outline:none;resize:none;line-height:1.6;min-height:80px;display:block;box-sizing:border-box" oninput="this.style.height='auto';this.style.height=this.scrollHeight+'px'">${defaultCode}</textarea>
<div class="tryit-output" style="background:#0d1117;color:#a6e3a1;font-family:ui-monospace,monospace;font-size:13px;padding:8px 14px;white-space:pre-wrap;display:none;border-top:1px solid #2a2a4a"></div>
</div>`)
  }

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

  // ── Key handler ───────────────────────────────────────────────────────────
  function onKeyDown(e: React.KeyboardEvent) {
    const sel = window.getSelection()
    if (!sel || !sel.rangeCount) return
    const range = sel.getRangeAt(0)

    // Shift+Enter exits blockquote (#5)
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

    // Enter after contenteditable=false block — insert paragraph
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
  async function save() {
    if (!title.trim()) { setError('Title is required.'); return }
    if (!moduleId || moduleId === 'undefined') { setError('Module ID missing.'); return }
    setSaving(true); setError('')
    // Strip contenteditable before saving (#10)
    const clone = editorRef.current?.cloneNode(true) as HTMLElement
    clone?.querySelectorAll('[contenteditable]').forEach(el => el.removeAttribute('contenteditable'))
    // Strip data-hl so re-highlighting works on next load
    clone?.querySelectorAll('[data-hl]').forEach(el => el.removeAttribute('data-hl'))
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

  // ── Toolbar styles ─────────────────────────────────────────────────────────
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
        .cb-editor pre{position:relative}
        .cb-quiz{background:#f0f7ff;border:1px solid #B5D4F4;border-radius:10px;margin:12px 0;overflow:hidden}
      `}</style>

      <BackLink href={'/teacher/modules/' + moduleId} label="Back to module" />
      <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 4 }}>{isNew ? 'New lesson' : 'Edit lesson'}</h1>
      {/* #11 — show author */}
      {authorName && <div style={{ fontSize: 12, color: '#888', marginBottom: 12 }}>Author: {authorName}</div>}

      <label style={{ fontSize: 11, fontWeight: 600, color: '#666', display: 'block', marginBottom: 3 }}>Lesson title</label>
      <input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Newton's Laws of Motion"
        style={{ width: '100%', maxWidth: 520, padding: '8px 11px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 14, fontFamily: 'inherit', marginBottom: 16, outline: 'none' }} />

      <label style={{ fontSize: 11, fontWeight: 600, color: '#666', display: 'block', marginBottom: 3 }}>Content</label>

      {/* Toolbar */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2, padding: '6px 8px', border: '1px solid #e5e7eb', borderBottom: 'none', borderRadius: '8px 8px 0 0', background: '#f9fafb', alignItems: 'center' }}>
        <button style={TB} onMouseDown={e => { e.preventDefault(); exec('bold') }}><b>B</b></button>
        <button style={TB} onMouseDown={e => { e.preventDefault(); exec('italic') }}><i>I</i></button>
        <button style={TB} onMouseDown={e => { e.preventDefault(); exec('underline') }}><u>U</u></button>
        {SEP}
        <button style={{ ...TB, fontWeight: 700, fontSize: 13 }} onMouseDown={e => { e.preventDefault(); heading('h1') }}>H1</button>
        <button style={{ ...TB, fontWeight: 700, fontSize: 12 }} onMouseDown={e => { e.preventDefault(); heading('h2') }}>H2</button>
        <button style={{ ...TB, fontWeight: 700, fontSize: 11 }} onMouseDown={e => { e.preventDefault(); heading('h3') }}>H3</button>
        {SEP}
        <button style={TB} onMouseDown={e => { e.preventDefault(); exec('insertUnorderedList') }}>• list</button>
        <button style={TB} onMouseDown={e => { e.preventDefault(); exec('insertOrderedList') }}>1. list</button>
        <button style={TB} onMouseDown={e => { e.preventDefault(); insertBlockquote() }} title="Shift+Enter to exit quote">" quote</button>
        {SEP}
        <button style={{ ...TB, background: '#fff59d', color: '#333', fontWeight: 700 }} onMouseDown={e => { e.preventDefault(); highlight('#fff59d') }}>A</button>
        <button style={{ ...TB, background: '#bbdefb', color: '#0d47a1', fontWeight: 700 }} onMouseDown={e => { e.preventDefault(); highlight('#bbdefb') }}>A</button>
        <button style={{ ...TB, background: '#b9f6ca', color: '#1b5e20', fontWeight: 700 }} onMouseDown={e => { e.preventDefault(); highlight('#b9f6ca') }}>A</button>
        <button style={{ ...TB, background: '#fce4ec', color: '#880e4f', fontWeight: 700 }} onMouseDown={e => { e.preventDefault(); highlight('#fce4ec') }}>A</button>
        {SEP}
        <button style={{ ...TB, background: '#FAEEDA', color: '#633806' }} onMouseDown={e => { e.preventDefault(); insertImportant() }}>! Imp</button>
        <button style={{ ...TB, background: '#E1F5EE', color: '#085041' }} onMouseDown={e => { e.preventDefault(); insertAccordion() }}>▾ Fold</button>
        <button style={TB} onMouseDown={e => { e.preventDefault(); openModal('table') }}>⊞ Table</button>
        {SEP}
        <button style={{ ...TB, background: '#1e1e2e', color: '#cdd6f4' }} onMouseDown={e => { e.preventDefault(); insertCodeBlock() }}>&lt;/&gt; Code</button>
        <button style={{ ...TB, background: '#1a1b26', color: '#7aa2f7' }} onMouseDown={e => { e.preventDefault(); insertTryIt() }}>&gt;_ Try</button>
        <button style={{ ...TB, background: '#f0f7ff', color: '#185FA5' }} onMouseDown={e => { e.preventDefault(); openModal('quiz') }}>✓ Quiz</button>
        {SEP}
        <button style={TB} onMouseDown={e => { e.preventDefault(); openModal('image') }}>🖼 Image</button>
        <button style={TB} onMouseDown={e => { e.preventDefault(); openModal('video') }}>▶ Video</button>
        <button style={TB} onMouseDown={e => { e.preventDefault(); openModal('file') }}>📎 File</button>
        <button style={TB} onMouseDown={e => { e.preventDefault(); openModal('link') }}>🔗 Link</button>
      </div>

      {/* Editor */}
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        className="cb-editor"
        onKeyDown={onKeyDown}
        style={{ minHeight: 360, padding: '14px 16px', border: '1px solid #e5e7eb', borderRadius: '0 0 8px 8px', background: '#fff', fontSize: 14, lineHeight: 1.75, outline: 'none', color: '#111', fontFamily: 'system-ui,sans-serif' }}
      />

      {error && <div style={{ fontSize: 12, padding: '8px 11px', background: '#FCEBEB', color: '#791F1F', borderRadius: 8, margin: '12px 0' }}>{error}</div>}
      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
        <button onClick={save} disabled={saving}
          style={{ padding: '9px 20px', background: '#185FA5', color: '#E6F1FB', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer', opacity: saving ? .6 : 1 }}>
          {saving ? 'Saving…' : 'Save lesson'}
        </button>
        <a href={'/teacher/modules/' + moduleId}
          style={{ padding: '9px 16px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, textDecoration: 'none', color: '#555', background: '#fff', display: 'inline-flex', alignItems: 'center' }}>
          Cancel
        </a>
      </div>

      {/* Modals */}
      {modal === 'quiz' && <QuizModal onInsert={insertAtCursor} onClose={() => setModal(null)} />}
      {modal === 'table' && <TableModal onInsert={insertTable} onClose={() => setModal(null)} />}
      {(modal === 'image' || modal === 'video' || modal === 'file' || modal === 'link') && (
        <MediaModal type={modal} lessons={lessons} moduleId={moduleId} onInsert={insertAtCursor} onClose={() => setModal(null)} />
      )}
    </div>
  )
}
