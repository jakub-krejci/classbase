'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useParams } from 'next/navigation'
import { BackLink } from '@/components/ui'
import { highlightPython, PYTHON_CSS } from '@/lib/highlight'

// ─── Block types ──────────────────────────────────────────────────────────────
type BlockType = 'html' | 'code' | 'tryit'
interface Block { id: string; type: BlockType; content: string }

function uid() { return Math.random().toString(36).slice(2) }

// ─── Serialize blocks → HTML string stored in DB ──────────────────────────────
function blocksToHtml(blocks: Block[]): string {
  return blocks.map(b => {
    if (b.type === 'html') return b.content
    if (b.type === 'code') {
      const enc = encodeURIComponent(b.content)
      return `<div class="cb-code" data-code="${enc}"></div>`
    }
    if (b.type === 'tryit') {
      const enc = encodeURIComponent(b.content)
      return `<div class="cb-tryit" data-code="${enc}"></div>`
    }
    return ''
  }).join('\n')
}

// ─── Parse HTML string → blocks ───────────────────────────────────────────────
function htmlToBlocks(html: string): Block[] {
  if (!html) return [{ id: uid(), type: 'html', content: '' }]
  const tmp = document.createElement('div')
  tmp.innerHTML = html
  const blocks: Block[] = []
  let htmlAcc: Node[] = []

  function flushHtml() {
    if (!htmlAcc.length) return
    const d = document.createElement('div')
    htmlAcc.forEach(n => d.appendChild(n.cloneNode(true)))
    const c = d.innerHTML.trim()
    if (c) blocks.push({ id: uid(), type: 'html', content: c })
    htmlAcc = []
  }

  tmp.childNodes.forEach(node => {
    const el = node as HTMLElement
    if (el.nodeType === 1 && el.classList?.contains('cb-code')) {
      flushHtml()
      try { blocks.push({ id: uid(), type: 'code', content: decodeURIComponent(el.getAttribute('data-code') ?? '') }) }
      catch { blocks.push({ id: uid(), type: 'code', content: el.getAttribute('data-code') ?? '' }) }
    } else if (el.nodeType === 1 && el.classList?.contains('cb-tryit')) {
      flushHtml()
      try { blocks.push({ id: uid(), type: 'tryit', content: decodeURIComponent(el.getAttribute('data-code') ?? '') }) }
      catch { blocks.push({ id: uid(), type: 'tryit', content: el.getAttribute('data-code') ?? '' }) }
    } else {
      htmlAcc.push(node)
    }
  })
  flushHtml()
  if (!blocks.length) blocks.push({ id: uid(), type: 'html', content: '' })
  return blocks
}

// ─── Rich text editor block ───────────────────────────────────────────────────
const EDITOR_CSS = `
.cb-rich h1{font-size:22px;font-weight:700;margin:14px 0 6px}
.cb-rich h2{font-size:18px;font-weight:700;margin:12px 0 5px}
.cb-rich h3{font-size:15px;font-weight:700;margin:10px 0 4px}
.cb-rich p{margin:4px 0}
.cb-rich ul{padding-left:22px;margin:6px 0;list-style:disc}
.cb-rich ol{padding-left:22px;margin:6px 0;list-style:decimal}
.cb-rich li{margin:3px 0}
.cb-rich blockquote{border-left:3px solid #185FA5;padding:4px 14px;margin:8px 0;color:#666;font-style:italic}
.cb-rich a{color:#185FA5;text-decoration:underline}
.cb-rich table{border-collapse:collapse;width:100%}
.cb-rich td,.cb-rich th{border:1px solid #e5e7eb;padding:6px 10px;min-width:50px}
.cb-rich th{background:#f9fafb;font-weight:600}
.cb-rich img{max-width:100%;border-radius:8px;margin:6px 0}
.cb-rich details{border:1px solid #e5e7eb;border-radius:8px;margin:8px 0;overflow:hidden}
.cb-rich summary{padding:9px 14px;background:#f9fafb;cursor:pointer;font-weight:500;list-style:none;user-select:none}
.cb-rich details[open] summary{border-bottom:1px solid #e5e7eb}
.cb-rich details > *:not(summary){padding:10px 14px}
`

function RichBlock({ block, onChange, onAddAfter, onDelete, onMoveUp, onMoveDown, canDelete, onOpenMedia }: {
  block: Block; onChange: (content: string) => void
  onAddAfter: (type: BlockType) => void; onDelete: () => void
  onMoveUp: () => void; onMoveDown: () => void; canDelete: boolean
  onOpenMedia: (type: 'image'|'video'|'file'|'link', insertFn: (html: string) => void) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [activeFormats, setActiveFormats] = useState<Set<string>>(new Set())
  const [showTableModal, setShowTableModal] = useState(false)

  // Sync content into div on first render / when block changes externally
  useEffect(() => {
    if (ref.current && ref.current.innerHTML !== block.content) {
      ref.current.innerHTML = block.content || ''
    }
  }, [])

  function exec(cmd: string, val?: string) { ref.current?.focus(); document.execCommand(cmd, false, val ?? ''); requestAnimationFrame(() => updateActiveFormats()) }

  function updateActiveFormats() {
    try {
      const formats = new Set<string>()
      // Use try/catch since queryCommandState may throw in some browsers
      try { if (document.queryCommandState('bold')) formats.add('bold') } catch {}
      try { if (document.queryCommandState('italic')) formats.add('italic') } catch {}
      try { if (document.queryCommandState('underline')) formats.add('underline') } catch {}
      try { if (document.queryCommandState('insertUnorderedList')) formats.add('ul') } catch {}
      try { if (document.queryCommandState('insertOrderedList')) formats.add('ol') } catch {}
      try {
        const block = document.queryCommandValue('formatBlock').toLowerCase().replace(/[<>]/g, '')
        if (block) formats.add(block)
      } catch {}
      // Also check by walking up the DOM tree for reliable results
      const sel = window.getSelection()
      if (sel && sel.rangeCount > 0) {
        let node: Node | null = sel.getRangeAt(0).startContainer
        while (node && node !== ref.current) {
          const tag = (node as HTMLElement).tagName?.toLowerCase()
          if (tag === 'b' || tag === 'strong') formats.add('bold')
          if (tag === 'i' || tag === 'em') formats.add('italic')
          if (tag === 'u') formats.add('underline')
          if (tag === 'h1') formats.add('h1')
          if (tag === 'h2') formats.add('h2')
          if (tag === 'h3') formats.add('h3')
          if (tag === 'ul') formats.add('ul')
          if (tag === 'ol') formats.add('ol')
          if (tag === 'blockquote') formats.add('blockquote')
          node = node.parentNode
        }
      }
      setActiveFormats(formats)
    } catch {}
  }

  // ── Image toolbar ────────────────────────────────────────────────────
  function showImageToolbar(img: HTMLImageElement) {
    document.getElementById('cb-img-toolbar')?.remove()
    const toolbar = document.createElement('div')
    toolbar.id = 'cb-img-toolbar'
    // Position fixed relative to viewport — outside contenteditable so clicks work
    const rect = img.getBoundingClientRect()
    toolbar.style.cssText = `position:fixed;top:${rect.top - 44 + window.scrollY}px;left:${rect.left}px;background:#1f2937;border-radius:8px;padding:4px 6px;display:flex;gap:3px;z-index:9999;box-shadow:0 4px 16px rgba(0,0,0,.4);align-items:center`

    const btnStyle = 'padding:3px 7px;font-size:11px;background:transparent;color:#e5e7eb;border:1px solid #374151;border-radius:4px;cursor:pointer;font-family:inherit;line-height:1.4'

    const addBtn = (label: string, action: () => void) => {
      const btn = document.createElement('button')
      btn.textContent = label
      btn.style.cssText = btnStyle
      // Use mousedown+preventDefault so click doesn't blur the editor
      btn.addEventListener('mousedown', (ev) => {
        ev.preventDefault()
        ev.stopPropagation()
        action()
        // Re-position after size change
        requestAnimationFrame(() => {
          const r2 = img.getBoundingClientRect()
          toolbar.style.top = `${r2.top - 44 + window.scrollY}px`
          toolbar.style.left = `${r2.left}px`
        })
      })
      toolbar.appendChild(btn)
    }

    // Size buttons
    ;[['25%','25%'],['50%','50%'],['75%','75%'],['100%','100%'],['300px','300px'],['500px','500px']].forEach(([label, val]) => {
      addBtn(label, () => { img.style.width = val; img.style.maxWidth = '100%'; onChange(ref.current?.innerHTML ?? '') })
    })

    // Divider
    const sep = document.createElement('div'); sep.style.cssText = 'width:1px;background:#374151;height:18px;margin:0 2px'; toolbar.appendChild(sep)

    // Align buttons
    ;[['◀ L','left'],['● C','center'],['▶ R','right']].forEach(([label, align]) => {
      addBtn(label, () => {
        img.style.display = 'block'
        if (align === 'left')   { img.style.float = 'left';  img.style.margin = '4px 12px 4px 0' }
        if (align === 'right')  { img.style.float = 'right'; img.style.margin = '4px 0 4px 12px' }
        if (align === 'center') { img.style.float = 'none';  img.style.margin = '8px auto' }
        onChange(ref.current?.innerHTML ?? '')
      })
    })

    // Highlight selected image
    img.style.outline = '2px solid #7aa2f7'
    document.body.appendChild(toolbar)

    const cleanup = (ev: MouseEvent) => {
      if (!(ev.target as HTMLElement).closest('#cb-img-toolbar') && ev.target !== img) {
        toolbar.remove()
        img.style.outline = ''
        document.removeEventListener('mousedown', cleanup)
      }
    }
    setTimeout(() => document.addEventListener('mousedown', cleanup), 50)
  }

  function hideImageToolbar() {
    document.getElementById('cb-img-toolbar')?.remove()
    ref.current?.querySelectorAll('img').forEach(i => { (i as HTMLElement).style.outline = '' })
  }

  // ── selectionchange ───────────────────────────────────────────────────────
    // Listen to selectionchange for reliable format detection
  useEffect(() => {
    const handler = () => updateActiveFormats()
    document.addEventListener('selectionchange', handler)
    return () => document.removeEventListener('selectionchange', handler)
  }, [])
  function heading(t: string) { ref.current?.focus(); document.execCommand('formatBlock', false, t); requestAnimationFrame(() => updateActiveFormats()) }
  function hl(color: string) {
    ref.current?.focus()
    const sel = window.getSelection()?.toString() || 'text'
    document.execCommand('insertHTML', false, `<span style="background:${color};border-radius:2px;padding:0 2px">${sel}</span>`)
  }

  function insertHtml(html: string) {
    ref.current?.focus()
    const sel = window.getSelection()
    if (!sel || !sel.rangeCount) { ref.current!.innerHTML += html; return }
    const r = sel.getRangeAt(0); r.deleteContents()
    const tmp = document.createElement('div'); tmp.innerHTML = html + '<p><br></p>'
    const frag = document.createDocumentFragment()
    let last: Node | null = null
    Array.from(tmp.childNodes).forEach(n => { last = frag.appendChild(n.cloneNode(true)) })
    r.insertNode(frag)
    if (last) { const nr = document.createRange(); nr.setStartAfter(last); nr.collapse(true); sel.removeAllRanges(); sel.addRange(nr) }
  }

  function insertTable(rows: number, cols: number) {
    const id = 'tbl' + Date.now()
    const hdr = Array.from({length:cols},(_,i)=>`<th contenteditable="true" style="border:1px solid #e5e7eb;padding:7px;background:#f9fafb;font-weight:600">H${i+1}</th>`).join('')
    const row = Array.from({length:cols},()=>`<td contenteditable="true" style="border:1px solid #e5e7eb;padding:7px">Cell</td>`).join('')
    const body = Array.from({length:rows-1},()=>`<tr>${row}</tr>`).join('')
    const bs = `padding:3px 8px;font-size:11px;border:1px solid #e5e7eb;border-radius:5px;background:#f9fafb;cursor:pointer`
    insertHtml(`<div contenteditable="false" style="margin:8px 0;overflow-x:auto"><table id="${id}" style="border-collapse:collapse;width:100%"><thead><tr>${hdr}</tr></thead><tbody>${body}</tbody></table><div style="display:flex;gap:5px;margin-top:4px"><button style="${bs}" onclick="(function(id){var t=document.getElementById(id);if(!t)return;var c=t.rows[0].cells.length;var tbody=t.tBodies[0]||t;var r=tbody.insertRow();for(var i=0;i<c;i++){var ce=r.insertCell();ce.contentEditable='true';ce.style='border:1px solid #e5e7eb;padding:7px';ce.textContent='Cell'}}('${id}'))">+Row</button><button style="${bs}" onclick="(function(id){var t=document.getElementById(id);if(!t||t.rows.length<=2)return;var b=t.tBodies[0];if(b&&b.rows.length>1)b.deleteRow(b.rows.length-1)}('${id}'))">−Row</button><button style="${bs}" onclick="(function(id){var t=document.getElementById(id);if(!t)return;Array.from(t.rows).forEach(function(r,i){var c=r.insertCell();c.contentEditable='true';c.style=i===0?'border:1px solid #e5e7eb;padding:7px;background:#f9fafb;font-weight:600':'border:1px solid #e5e7eb;padding:7px';c.textContent=i===0?'H':'Cell'})}('${id}'))">+Col</button><button style="${bs}" onclick="(function(id){var t=document.getElementById(id);if(!t)return;Array.from(t.rows).forEach(function(r){if(r.cells.length>1)r.deleteCell(r.cells.length-1)})}('${id}'))">−Col</button></div></div>`)
  }

  const TB: React.CSSProperties = { padding:'3px 7px', fontSize:12, border:'1px solid transparent', borderRadius:5, background:'none', cursor:'pointer', fontFamily:'inherit', lineHeight:1 }
  const tbActive = (key: string, extra?: React.CSSProperties): React.CSSProperties =>
    activeFormats.has(key)
      ? { ...TB, ...extra, background:'#E6F1FB', border:'1px solid #B5D4F4', color:'#0C447C' }
      : { ...TB, ...extra }
  const SEP = <span style={{ display:'inline-block', width:1, background:'#e5e7eb', margin:'0 3px', height:16, verticalAlign:'middle' }} />


  return (
    <div style={{ marginBottom: 6 }}>
      {/* Toolbar */}
      <div style={{ display:'flex', flexWrap:'wrap', gap:1, padding:'4px 8px', background:'#f9fafb', border:`1px solid #e5e7eb`, borderBottom:'none', borderRadius:'8px 8px 0 0', alignItems:'center' }}>
        <button style={tbActive('bold')} onMouseDown={e=>{e.preventDefault();exec('bold')}}><b>B</b></button>
        <button style={tbActive('italic')} onMouseDown={e=>{e.preventDefault();exec('italic')}}><i>I</i></button>
        <button style={tbActive('underline')} onMouseDown={e=>{e.preventDefault();exec('underline')}}><u>U</u></button>
        {SEP}
        <button style={tbActive('h1', {fontWeight:700,fontSize:13})} onMouseDown={e=>{e.preventDefault();heading('h1')}}>H1</button>
        <button style={tbActive('h2', {fontWeight:700,fontSize:12})} onMouseDown={e=>{e.preventDefault();heading('h2')}}>H2</button>
        <button style={tbActive('h3', {fontWeight:700,fontSize:11})} onMouseDown={e=>{e.preventDefault();heading('h3')}}>H3</button>
        {SEP}
        <button style={tbActive('ul')} onMouseDown={e=>{e.preventDefault();exec('insertUnorderedList')}}>• list</button>
        <button style={tbActive('ol')} onMouseDown={e=>{e.preventDefault();exec('insertOrderedList')}}>1. list</button>
        <button style={tbActive('blockquote')} onMouseDown={e=>{e.preventDefault();heading('blockquote')}} title="Shift+Enter to exit">" quote</button>
        {SEP}
        <button style={{...TB,background:'#fff59d',color:'#333',fontWeight:700}} onMouseDown={e=>{e.preventDefault();hl('#fff59d')}}>A</button>
        <button style={{...TB,background:'#bbdefb',color:'#0d47a1',fontWeight:700}} onMouseDown={e=>{e.preventDefault();hl('#bbdefb')}}>A</button>
        <button style={{...TB,background:'#b9f6ca',color:'#1b5e20',fontWeight:700}} onMouseDown={e=>{e.preventDefault();hl('#b9f6ca')}}>A</button>
        <button style={{...TB,background:'#fce4ec',color:'#880e4f',fontWeight:700}} onMouseDown={e=>{e.preventDefault();hl('#fce4ec')}}>A</button>
        {SEP}
        <button style={{...TB,background:'#FAEEDA',color:'#633806',fontSize:11}} onMouseDown={e=>{e.preventDefault();insertHtml('<div contenteditable="false" style="background:#FAEEDA;border-left:3px solid #BA7517;border-radius:0 8px 8px 0;padding:10px 14px;margin:8px 0"><div style="font-size:10px;font-weight:700;color:#633806;text-transform:uppercase;letter-spacing:.06em;margin-bottom:3px">⚠ Important</div><div contenteditable="true" style="color:#412402">Write here.</div></div>')}} >! Imp</button>
        <button style={{...TB,background:'#E1F5EE',color:'#085041',fontSize:11}} onMouseDown={e=>{e.preventDefault();insertHtml('<details><summary>▶ Click to reveal</summary><div contenteditable="true">Hidden content.</div></details>')}}>▾ Fold</button>
        <button style={tbActive('table')} onMouseDown={e=>{e.preventDefault(); setShowTableModal(true)}}>⊞ Table</button>
        {SEP}
        <button style={{...TB,fontSize:11}} onMouseDown={e=>{e.preventDefault(); onOpenMedia('image', insertHtml)}}>🖼 Image</button>
        <button style={{...TB,fontSize:11}} onMouseDown={e=>{e.preventDefault(); onOpenMedia('video', insertHtml)}}>▶ Video</button>
        <button style={{...TB,fontSize:11}} onMouseDown={e=>{e.preventDefault(); onOpenMedia('file', insertHtml)}}>📎 File</button>
        <button style={{...TB,fontSize:11}} onMouseDown={e=>{e.preventDefault(); onOpenMedia('link', insertHtml)}}>🔗 Link</button>
        <button style={TB} onMouseDown={e=>{e.preventDefault(); insertHtml('<hr style="border:none;border-top:2px solid #e5e7eb;margin:12px 0">')}} title="Horizontal divider">— HR</button>
        {SEP}
        <button style={{...TB,background:'#1e1e2e',color:'#cdd6f4',fontSize:11}} onMouseDown={e=>{e.preventDefault();onAddAfter('code')}}>+ Code</button>
        <button style={{...TB,background:'#1a1b26',color:'#7aa2f7',fontSize:11}} onMouseDown={e=>{e.preventDefault();onAddAfter('tryit')}}>+ Try it</button>
        <div style={{flex:1}}/>
        <button style={{...TB,fontSize:11,color:'#888'}} onMouseDown={e=>{e.preventDefault();onMoveUp()}} title="Move up">↑</button>
        <button style={{...TB,fontSize:11,color:'#888'}} onMouseDown={e=>{e.preventDefault();onMoveDown()}} title="Move down">↓</button>
        {canDelete && <button style={{...TB,fontSize:11,color:'#A32D2D'}} onMouseDown={e=>{e.preventDefault();onDelete()}} title="Delete block">✕</button>}
      </div>
      {/* Editable area */}
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        className="cb-rich"
        onInput={() => onChange(ref.current?.innerHTML ?? '')}
        onKeyUp={updateActiveFormats}
        onMouseUp={e => {
          updateActiveFormats()
          // Image click — show resize toolbar
          const target = e.target as HTMLElement
          if (target.tagName === 'IMG') {
            showImageToolbar(target as HTMLImageElement)
          } else {
            hideImageToolbar()
          }
        }}
        onClick={updateActiveFormats}
        onKeyDown={e => {
          if (e.key === 'Enter' && e.shiftKey) {
            let node: Node | null = window.getSelection()?.getRangeAt(0).startContainer ?? null
            while (node && (node as HTMLElement).tagName !== 'BLOCKQUOTE') node = node.parentElement
            if (node) {
              e.preventDefault()
              const p = document.createElement('p'); p.innerHTML = '<br>'
              ;(node as HTMLElement).after(p)
              const r = document.createRange(); r.setStart(p,0); r.collapse(true)
              const sel = window.getSelection(); sel?.removeAllRanges(); sel?.addRange(r)
            }
          }
          // On plain Enter: strip highlight background from the new paragraph after browser inserts it
          if (e.key === 'Enter' && !e.shiftKey) {
            requestAnimationFrame(() => {
              const sel = window.getSelection()
              if (!sel || !sel.rangeCount) return
              let node: Node | null = sel.getRangeAt(0).startContainer
              while (node && node !== ref.current) {
                const el = node as HTMLElement
                if (el.style && el.style.background && el.tagName !== 'SPAN') {
                  el.style.background = ''
                }
                // If cursor landed inside a highlight span, move out of it
                if (el.tagName === 'SPAN' && el.style.background) {
                  const after = document.createRange()
                  after.setStartAfter(el); after.collapse(true)
                  sel.removeAllRanges(); sel.addRange(after)
                  break
                }
                node = node.parentNode
              }
              onChange(ref.current?.innerHTML ?? '')
            })
          }
        }}
        style={{ minHeight: 80, padding: '10px 14px', border: `1px solid #e5e7eb`, borderRadius: '0 0 8px 8px', background: '#fff', fontSize: 14, lineHeight: 1.75, outline: 'none', color: '#111', fontFamily: 'system-ui,sans-serif' }}
      />
      {showTableModal && (
        <TableModal
          onInsert={(r, c) => { insertTable(r, c); setShowTableModal(false) }}
          onClose={() => setShowTableModal(false)}
        />
      )}
    </div>
  )
}

// ─── Code block ───────────────────────────────────────────────────────────────
function CodeBlock({ block, onChange, onDelete, onMoveUp, onMoveDown }: {
  block: Block; onChange: (c: string) => void; onDelete: () => void; onMoveUp: () => void; onMoveDown: () => void
}) {
  const [activeFormats, setActiveFormats] = useState<Set<string>>(new Set())
  const [showTableModal, setShowTableModal] = useState(false)
  const [code, setCode] = useState(block.content)
  const taRef = useRef<HTMLTextAreaElement>(null)
  function autoResize() { if (taRef.current) { taRef.current.style.height = 'auto'; taRef.current.style.height = taRef.current.scrollHeight + 'px' } }
  useEffect(() => { autoResize() }, [])
  return (
    <div style={{ background: '#1e1e2e', borderRadius: 8, overflow: 'hidden', margin: '8px 0', border: '2px solid #313244' }}>
      <div style={{ background: '#16213e', padding: '6px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontFamily: 'monospace', fontSize: 10, color: '#7aa2f7', letterSpacing: '.06em' }}>PYTHON — code block</span>
        <div style={{ display: 'flex', gap: 4 }}>
          <button onClick={onMoveUp} style={{ fontSize:11,color:'#6c7086',background:'none',border:'none',cursor:'pointer',padding:'2px 5px' }}>↑</button>
          <button onClick={onMoveDown} style={{ fontSize:11,color:'#6c7086',background:'none',border:'none',cursor:'pointer',padding:'2px 5px' }}>↓</button>
          <button onClick={onDelete} style={{ fontSize:11,color:'#f38ba8',background:'none',border:'none',cursor:'pointer',padding:'2px 5px' }}>✕</button>
        </div>
      </div>
      <textarea
        ref={taRef}
        value={code}
        spellCheck={false}
        onChange={e => { setCode(e.target.value); onChange(e.target.value); autoResize() }}
        onKeyDown={e => {
          if (e.key === 'Tab') { e.preventDefault(); const s=e.currentTarget.selectionStart,en=e.currentTarget.selectionEnd,v=e.currentTarget.value; e.currentTarget.value=v.slice(0,s)+'    '+v.slice(en); e.currentTarget.selectionStart=e.currentTarget.selectionEnd=s+4; setCode(e.currentTarget.value); onChange(e.currentTarget.value) }
        }}
        style={{ width: '100%', background: '#1e1e2e', color: '#cdd6f4', fontFamily: 'ui-monospace,"Cascadia Code","Fira Code",monospace', fontSize: 14, padding: '14px 16px', border: 'none', outline: 'none', resize: 'none', lineHeight: 1.7, display: 'block', boxSizing: 'border-box', minHeight: 60, overflow: 'hidden' }}
        placeholder="# Write Python here&#10;print('Hello, world!')"
      />
    </div>
  )
}

// ─── Try-it block ─────────────────────────────────────────────────────────────
function TryItBlock({ block, onChange, onDelete, onMoveUp, onMoveDown }: {
  block: Block; onChange: (c: string) => void; onDelete: () => void; onMoveUp: () => void; onMoveDown: () => void
}) {
  const [code, setCode] = useState(block.content)
  const [output, setOutput] = useState<string | null>(null)
  const [running, setRunning] = useState(false)
  const taRef = useRef<HTMLTextAreaElement>(null)
  const preRef = useRef<HTMLPreElement>(null)
  function syncHL(val: string) { if (preRef.current) preRef.current.innerHTML = highlightPython(val) + '\n' }
  function syncH() { if (taRef.current) { taRef.current.style.height = 'auto'; taRef.current.style.height = taRef.current.scrollHeight + 'px' } }
  useEffect(() => { syncHL(code); syncH() }, [])

  function run() {
    setRunning(true)
    let out = ''
    try {
      const vars: Record<string,any> = {}
      code.split('\n').forEach(line => {
        const t = line.trim()
        const pm = t.match(/^print\((.+)\)$/)
        if (pm) {
          try {
            const r = pm[1]; const fstr = r.match(/^f["'](.*)["']$/)
            if (fstr) {
              out += fstr[1].replace(/\{([^}]+)\}/g, (_:any, v:string) => {
                try { return String(eval(v.replace(/\b(\w+)\b/g,(m:string)=>vars[m]!==undefined?JSON.stringify(vars[m]):m))) } catch { return v }
              }) + '\n'
            } else {
              out += String(eval(r.replace(/\b(\w+)\b/g,(m:string)=>vars[m]!==undefined?JSON.stringify(vars[m]):m))) + '\n'
            }
          } catch(e:any) { out += 'Error: '+e.message+'\n' }
        }
        const asgn = t.match(/^(\w+)\s*=\s*(.+)$/)
        if (asgn && !t.startsWith('print')) {
          try { vars[asgn[1]] = eval(asgn[2].replace(/\b(\w+)\b/g,(m:string)=>vars[m]!==undefined?JSON.stringify(vars[m]):m)) } catch {}
        }
      })
    } catch(e:any) { out = 'Error: '+e.message }
    setOutput(out.trim() || '(no output)')
    setRunning(false)
  }

  return (
    <div style={{ background: '#1a1b26', borderRadius: 8, overflow: 'hidden', margin: '8px 0', border: '2px solid #2a2a4a' }}>
      <div style={{ background: '#16213e', padding: '6px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontFamily: 'monospace', fontSize: 10, color: '#7aa2f7', letterSpacing: '.06em' }}>▶ TRY IT — Interactive Python</span>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <button onClick={run} disabled={running} style={{ padding:'3px 10px', fontSize:11, background:'#7aa2f7', color:'#fff', border:'none', borderRadius:5, cursor:'pointer', fontFamily:'inherit' }}>
            {running ? '…' : 'Run ▶'}
          </button>
          <button onClick={onMoveUp} style={{ fontSize:11,color:'#6c7086',background:'none',border:'none',cursor:'pointer',padding:'2px 5px' }}>↑</button>
          <button onClick={onMoveDown} style={{ fontSize:11,color:'#6c7086',background:'none',border:'none',cursor:'pointer',padding:'2px 5px' }}>↓</button>
          <button onClick={onDelete} style={{ fontSize:11,color:'#f38ba8',background:'none',border:'none',cursor:'pointer',padding:'2px 5px' }}>✕</button>
        </div>
      </div>
      {/* Overlay: highlighted pre behind transparent textarea */}
      <div style={{ position:'relative', background:'#1e1e2e' }}>
        <pre ref={preRef} aria-hidden="true"
          style={{ fontFamily:'ui-monospace,"Cascadia Code","Fira Code",monospace', fontSize:14, lineHeight:1.7, padding:'14px 16px', margin:0, whiteSpace:'pre-wrap', wordBreak:'break-all', position:'absolute', inset:0, overflow:'hidden', color:'#cdd6f4', background:'transparent', pointerEvents:'none', minHeight:60, boxSizing:'border-box' }} />
        <textarea
          ref={taRef}
          value={code}
          spellCheck={false}
          onChange={e => { setCode(e.target.value); onChange(e.target.value); syncHL(e.target.value); syncH() }}
          onKeyDown={e => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); run() }
            if (e.key === 'Tab') {
              e.preventDefault()
              const s=e.currentTarget.selectionStart, en=e.currentTarget.selectionEnd, v=e.currentTarget.value
              const nv = v.slice(0,s)+'    '+v.slice(en)
              setCode(nv); onChange(nv); syncHL(nv)
              requestAnimationFrame(() => { if (taRef.current) { taRef.current.selectionStart = taRef.current.selectionEnd = s+4 } })
            }
          }}
          style={{ width:'100%', background:'transparent', color:'transparent', caretColor:'#cdd6f4', fontFamily:'ui-monospace,"Cascadia Code","Fira Code",monospace', fontSize:14, padding:'14px 16px', border:'none', outline:'none', resize:'none', lineHeight:1.7, display:'block', boxSizing:'border-box', minHeight:60, overflow:'hidden', position:'relative', zIndex:1 }}
          placeholder="# Ctrl+Enter to run&#10;print('Hello!')"
        />
      </div>
      {output !== null && (
        <div style={{ background:'#0d1117', color:'#a6e3a1', fontFamily:'ui-monospace,monospace', fontSize:13, padding:'10px 16px', borderTop:'1px solid #2a2a4a', whiteSpace:'pre-wrap' }}>
          <span style={{ color:'#6c7086', fontSize:10, display:'block', marginBottom:3 }}>OUTPUT</span>
          {output}
        </div>
      )}
      <div style={{ padding:'4px 12px', fontSize:10, color:'#4a4a6a' }}>Ctrl+Enter to run · Tab for indent</div>
    </div>
  )
}

// ─── Table modal ──────────────────────────────────────────────────────────────
function TableModal({ onInsert, onClose }: { onInsert: (r: number, c: number) => void; onClose: () => void }) {
  const [rows, setRows] = useState(3)
  const [cols, setCols] = useState(3)
  const ni: React.CSSProperties = { width: 70, padding: '6px 8px', border: '1px solid #e5e7eb', borderRadius: 7, fontSize: 13, outline: 'none', textAlign: 'center' }
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ background: '#fff', borderRadius: 12, padding: 24, width: 300 }}>
        <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 14 }}>Insert table</h2>
        {([['Rows', rows, setRows], ['Columns', cols, setCols]] as const).map(([lbl, val, set]) => (
          <div key={lbl} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
            <span style={{ width: 70, fontSize: 13 }}>{lbl}</span>
            <input type="number" min={1} max={20} value={val}
              onChange={e => (set as any)(Math.max(1, Math.min(20, +e.target.value || 1)))} style={ni} />
          </div>
        ))}
        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <button onClick={() => { onInsert(rows, cols); onClose() }}
            style={{ flex: 1, padding: '8px', background: '#185FA5', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>Insert</button>
          <button onClick={onClose}
            style={{ padding: '8px 14px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, cursor: 'pointer' }}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

// ─── Quiz modal ───────────────────────────────────────────────────────────────
function QuizModal({ onInsert, onClose }: { onInsert:(h:string)=>void; onClose:()=>void }) {
  const [q,setQ]=useState(''); const [opts,setOpts]=useState(['','','','']); const [correct,setCorrect]=useState(0); const [expl,setExpl]=useState(['','','',''])
  const i:React.CSSProperties={width:'100%',padding:'7px 9px',border:'1px solid #e5e7eb',borderRadius:7,fontSize:13,fontFamily:'inherit',outline:'none',marginBottom:8}
  function build(){const o=opts.filter(x=>x.trim());const oE=JSON.stringify(o).replace(/"/g,'&quot;');const eE=JSON.stringify(expl.slice(0,o.length)).replace(/"/g,'&quot;');return`<div class="cb-quiz" data-q="${q.replace(/"/g,'&quot;')}" data-opts="${oE}" data-correct="${correct}" data-expl="${eE}" contenteditable="false" style="background:#f0f7ff;border:1px solid #B5D4F4;border-radius:10px;margin:10px 0;padding:0;overflow:hidden"><div style="padding:9px 14px;background:#E6F1FB;font-size:10px;font-weight:700;color:#0C447C;text-transform:uppercase;letter-spacing:.06em">✓ Quiz — ${q}</div></div>`}
  return (<div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.5)',zIndex:300,display:'flex',alignItems:'center',justifyContent:'center',padding:20}}>
    <div style={{background:'#fff',borderRadius:14,padding:24,width:'100%',maxWidth:540,maxHeight:'90vh',overflowY:'auto'}}>
      <h2 style={{fontSize:16,fontWeight:600,marginBottom:14}}>Insert quiz question</h2>
      <input value={q} onChange={e=>setQ(e.target.value)} style={i} placeholder="Question text" />
      {opts.map((o,idx)=>(<div key={idx} style={{display:'flex',alignItems:'center',gap:8,marginBottom:7}}>
        <div onClick={()=>setCorrect(idx)} style={{width:16,height:16,borderRadius:'50%',border:'2px solid',borderColor:correct===idx?'#185FA5':'#ccc',background:correct===idx?'#185FA5':'#fff',cursor:'pointer',flexShrink:0}}/>
        <input value={o} onChange={e=>setOpts(p=>p.map((x,j)=>j===idx?e.target.value:x))} style={{...i,flex:1,marginBottom:0}} placeholder={`Option ${idx+1}`}/>
        <input value={expl[idx]} onChange={e=>setExpl(p=>p.map((x,j)=>j===idx?e.target.value:x))} style={{...i,flex:1,marginBottom:0,background:'#fff8f9',borderColor:'#fce4ec'}} placeholder="Explanation if wrong"/>
      </div>))}
      <button onClick={()=>setOpts(p=>[...p,''])} style={{fontSize:12,color:'#185FA5',background:'none',border:'none',cursor:'pointer',marginBottom:14}}>+ Add option</button>
      <div style={{display:'flex',gap:8}}>
        <button onClick={()=>{if(q.trim()&&opts.filter(x=>x.trim()).length>=2){onInsert(build());onClose()}}} style={{flex:1,padding:'9px',background:'#185FA5',color:'#fff',border:'none',borderRadius:8,fontSize:13,fontWeight:500,cursor:'pointer'}}>Insert quiz</button>
        <button onClick={onClose} style={{padding:'9px 16px',border:'1px solid #e5e7eb',borderRadius:8,fontSize:13,cursor:'pointer'}}>Cancel</button>
      </div>
    </div>
  </div>)
}

// ─── Media / Link modal ────────────────────────────────────────────────────────
function MediaModal({ type, lessons, moduleId: modId, onInsert, onClose }: {
  type: 'image' | 'video' | 'file' | 'link'
  lessons?: any[]
  moduleId?: string
  onInsert: (html: string) => void
  onClose: () => void
}) {
  const [url, setUrl] = useState('')
  const [label, setLabel] = useState('')
  const [imgWidth, setImgWidth] = useState('100%')
  const [uploading, setUploading] = useState(false)
  const [uploadErr, setUploadErr] = useState('')
  const [tab, setTab] = useState<'url' | 'upload' | 'storage'>('url')
  const [storageFiles, setStorageFiles] = useState<{name:string,url:string}[]>([])
  const [storageLoading, setStorageLoading] = useState(false)
  const [storageErr, setStorageErr] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const supabaseClient = createClient()

  async function loadStorageFiles() {
    setStorageLoading(true); setStorageErr('')
    try {
      const { data, error } = await supabaseClient.storage.from('lesson-assets').list('', { limit: 200, sortBy: { column: 'created_at', order: 'desc' } })
      if (error) { setStorageErr(error.message); setStorageLoading(false); return }
      const files = (data ?? []).filter(f => f.name !== '.emptyFolderPlaceholder').map(f => {
        const { data: urlData } = supabaseClient.storage.from('lesson-assets').getPublicUrl(f.name)
        return { name: f.name, url: urlData.publicUrl }
      })
      setStorageFiles(files)
    } catch(e: any) { setStorageErr(e.message) }
    setStorageLoading(false)
  }

  async function upload(f: File) {
    setUploading(true); setUploadErr('')
    const fd = new FormData(); fd.append('file', f)
    const res = await fetch('/api/upload', { method: 'POST', body: fd })
    const data = await res.json()
    if (!res.ok) { setUploadErr(data.error ?? 'Upload failed'); setUploading(false); return }
    setUrl(data.url); setLabel(f.name); setUploading(false)
  }

  function build(): string {
    if (type === 'image') {
      const w = imgWidth.trim() || '100%'
      const widthAttr = w.endsWith('%') || w.endsWith('px') ? w : w + 'px'
      return `<img src="${url}" alt="${label || 'image'}" style="width:${widthAttr};max-width:100%;border-radius:8px;margin:8px 0;display:block">`
    }
    if (type === 'video') {
      const yt = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([A-Za-z0-9_-]+)/)
      const vm = url.match(/vimeo\.com\/(\d+)/)
      const src = yt ? `https://www.youtube.com/embed/${yt[1]}` : vm ? `https://player.vimeo.com/video/${vm[1]}` : url
      return `<iframe src="${src}" allowfullscreen style="width:100%;aspect-ratio:16/9;border:none;border-radius:8px;margin:8px 0;display:block"></iframe>`
    }
    if (type === 'file') return `<a href="${url}" target="_blank" download style="display:inline-flex;align-items:center;gap:7px;padding:8px 14px;background:#f3f4f6;border:1px solid #e5e7eb;border-radius:8px;font-size:13px;color:#185FA5;text-decoration:none;margin:6px 0">📎 ${label || url.split('/').pop()}</a>`
    if (type === 'link') return `<a href="${url}" target="${url.startsWith('/') ? '_self' : '_blank'}" style="color:#185FA5;text-decoration:underline">${label || url}</a>`
    return ''
  }

  const titles: Record<string,string> = { image: 'Insert image / animation', video: 'Embed or upload video', file: 'Attach downloadable file', link: 'Insert hyperlink' }
  const inp: React.CSSProperties = { width:'100%', padding:'8px 10px', border:'1px solid #e5e7eb', borderRadius:8, fontSize:13, fontFamily:'inherit', outline:'none', marginBottom:10 }
  const lbl: React.CSSProperties = { fontSize:11, fontWeight:600, color:'#555', display:'block', marginBottom:3 }

  const showUploadTab = type === 'image' || type === 'file' || type === 'video'
  const showStorageTab = type === 'image' || type === 'video' || type === 'file'

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)', zIndex:300, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
      <div style={{ background:'#fff', borderRadius:14, padding:24, width:'100%', maxWidth:500, maxHeight:'90vh', overflowY:'auto' }}>
        <h2 style={{ fontSize:16, fontWeight:600, marginBottom:14 }}>{titles[type]}</h2>

        {showUploadTab && (
          <div style={{ display:'flex', borderBottom:'1px solid #e5e7eb', marginBottom:14, gap:0 }}>
            {[
              ['url', 'External URL'],
              ['upload', 'Upload file'],
              ...(showStorageTab ? [['storage', '☁ Supabase']] : []),
            ].map(([t, label]) => (
              <button key={t} onClick={() => { setTab(t as any); if (t === 'storage' && !storageFiles.length) loadStorageFiles() }}
                style={{ padding:'6px 12px', fontSize:12, fontWeight:500, background:'none', border:'none', borderBottom:tab===t?'2px solid #185FA5':'2px solid transparent', color:tab===t?'#185FA5':'#888', cursor:'pointer', whiteSpace:'nowrap' }}>
                {label}
              </button>
            ))}
          </div>
        )}

        {tab === 'storage' ? (
          <div>
            {storageLoading && <div style={{ textAlign:'center', padding:20, color:'#888', fontSize:13 }}>Loading files…</div>}
            {storageErr && <div style={{ fontSize:12, color:'#791F1F', marginBottom:8, padding:'8px 10px', background:'#FCEBEB', borderRadius:8 }}>
              {storageErr}<br/><span style={{ fontSize:11 }}>Make sure the lesson-assets bucket exists in Supabase Storage.</span>
            </div>}
            {!storageLoading && !storageErr && storageFiles.length === 0 && (
              <div style={{ textAlign:'center', padding:20, color:'#aaa', fontSize:13 }}>No files in storage yet. Upload files first.</div>
            )}
            {!storageLoading && storageFiles.length > 0 && (
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8, maxHeight:280, overflowY:'auto', marginBottom:12 }}>
                {storageFiles.map(f => {
                  const isImg = /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(f.name)
                  const isVid = /\.(mp4|webm|mov)$/i.test(f.name)
                  const selected = url === f.url
                  return (
                    <div key={f.name} onClick={() => { setUrl(f.url); setLabel(f.name.replace(/\.[^.]+$/, '')) }}
                      style={{ border: selected ? '2px solid #185FA5' : '1px solid #e5e7eb', borderRadius:8, overflow:'hidden', cursor:'pointer', background: selected ? '#E6F1FB' : '#fafafa', position:'relative' }}>
                      {isImg && <img src={f.url} alt={f.name} style={{ width:'100%', height:70, objectFit:'cover', display:'block' }} />}
                      {isVid && <div style={{ height:70, display:'flex', alignItems:'center', justifyContent:'center', fontSize:24 }}>🎬</div>}
                      {!isImg && !isVid && <div style={{ height:70, display:'flex', alignItems:'center', justifyContent:'center', fontSize:24 }}>📎</div>}
                      <div style={{ padding:'4px 6px', fontSize:10, color:'#555', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{f.name}</div>
                      {selected && <div style={{ position:'absolute', top:4, right:4, background:'#185FA5', color:'#fff', borderRadius:'50%', width:18, height:18, display:'flex', alignItems:'center', justifyContent:'center', fontSize:10 }}>✓</div>}
                    </div>
                  )
                })}
              </div>
            )}
            <button onClick={loadStorageFiles} style={{ fontSize:11, color:'#185FA5', background:'none', border:'none', cursor:'pointer', marginBottom:8 }}>↺ Refresh</button>
          </div>
        ) : tab === 'upload' && showUploadTab ? (
          <div>
            <div onClick={() => fileRef.current?.click()}
              style={{ border:'2px dashed #e5e7eb', borderRadius:10, padding:24, textAlign:'center', cursor:'pointer', color:url?'#27500A':'#888', fontSize:13, background:url?'#f0fff4':'#fafafa', marginBottom:10 }}>
              {uploading ? 'Uploading to Supabase Storage…' : url ? '✓ ' + (label || 'File uploaded — ready to insert') : 'Click to choose a file from your computer (saves to Supabase Storage)'}
            </div>
            <input ref={fileRef} type="file"
              accept={type === 'image' ? 'image/*,image/gif' : type === 'video' ? 'video/*' : undefined}
              style={{ display:'none' }}
              onChange={e => e.target.files?.[0] && upload(e.target.files[0])} />
            {uploadErr && <div style={{ fontSize:12, color:'#791F1F', marginBottom:8 }}>{uploadErr}</div>}
          </div>
        ) : (
          <>
            <label style={lbl}>
              {type === 'video' ? 'YouTube / Vimeo URL' : type === 'link' ? 'URL (https:// or /student/...)' : 'Image URL'}
            </label>
            <input value={url} onChange={e => setUrl(e.target.value)} style={inp}
              placeholder={type === 'video' ? 'https://youtube.com/watch?v=...' : 'https://'} />
          </>
        )}

        {type === 'image' && (
          <>
            <label style={lbl}>Alt text / label</label>
            <input value={label} onChange={e => setLabel(e.target.value)} style={inp} placeholder="Describe the image" />
            <label style={lbl}>Display width (e.g. 100%, 400px, 50%)</label>
            <input value={imgWidth} onChange={e => setImgWidth(e.target.value)} style={inp} placeholder="100%" />
            {url && (
              <div style={{ marginBottom:10 }}>
                <img src={url} alt="preview" style={{ maxWidth:'100%', maxHeight:120, borderRadius:8, border:'1px solid #e5e7eb', objectFit:'contain' }} />
              </div>
            )}
          </>
        )}
        {(type === 'file' || type === 'link') && (
          <>
            <label style={lbl}>{type === 'link' ? 'Link text' : 'Label'}</label>
            <input value={label} onChange={e => setLabel(e.target.value)} style={inp} placeholder={type === 'link' ? 'Click here' : 'Filename or description'} />
          </>
        )}
        {type === 'link' && lessons && lessons.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#555', marginBottom: 6 }}>Or link to a lesson in this module:</div>
            <div style={{ maxHeight: 160, overflowY: 'auto', border: '1px solid #e5e7eb', borderRadius: 8 }}>
              {lessons.map((l: any) => (
                <button key={l.id}
                  onClick={() => { setUrl(`/student/modules/${modId}/lessons/${l.id}`); setLabel(l.title) }}
                  style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', background: url.includes(l.id) ? '#E6F1FB' : 'transparent', border: 'none', borderBottom: '1px solid #f3f4f6', fontSize: 13, cursor: 'pointer', color: '#333' }}>
                  📄 {l.title}
                </button>
              ))}
            </div>
          </div>
        )}

        <div style={{ display:'flex', gap:8, marginTop:4 }}>
          <button onClick={() => { if (url) { onInsert(build()); onClose() } }}
            disabled={!url || uploading}
            style={{ flex:1, padding:'9px', background:'#185FA5', color:'#fff', border:'none', borderRadius:8, fontSize:13, fontWeight:500, cursor:'pointer', opacity:(!url||uploading)?.5:1 }}>
            Insert
          </button>
          <button onClick={onClose} style={{ padding:'9px 16px', border:'1px solid #e5e7eb', borderRadius:8, fontSize:13, cursor:'pointer' }}>Cancel</button>
        </div>
      </div>
    </div>
  )
}


// ─── Main editor page ─────────────────────────────────────────────────────────
export default function LessonEditorPage() {
  const supabase = createClient()
  const params = useParams() as any
  const moduleId = params?.id as string
  const lessonId = params?.lessonId as string
  const isNew = !lessonId || lessonId === 'new'

  const [title, setTitle] = useState('')
  const [authorName, setAuthorName] = useState('')
  const [authorId, setAuthorId] = useState('')
  const [blocks, setBlocks] = useState<Block[]>([{ id: uid(), type: 'html', content: '' }])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [lessonLinks, setLessonLinks] = useState<any[]>([])
  const pendingInsertFn = useRef<((html: string) => void) | null>(null)
  const [showQuiz, setShowQuiz] = useState(false)
  const [quizTargetId, setQuizTargetId] = useState<string | null>(null)
  const [mediaModal, setMediaModal] = useState<null | 'image' | 'video' | 'file' | 'link'>(null)
  const [mediaTargetId, setMediaTargetId] = useState<string | null>(null)
  const [activeFormats, setActiveFormats] = useState<Set<string>>(new Set())
  const [showTableModal, setShowTableModal] = useState(false)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        setAuthorId(user.id)
        const { data: prof } = await supabase.from('profiles').select('full_name').eq('id', user.id).single()
        setAuthorName((prof as any)?.full_name ?? user.email ?? '')
      }
      // Load lessons list for link-to-lesson in MediaModal
      const { data: lessonList } = await supabase.from('lessons').select('id,title,position').eq('module_id', moduleId).order('position')
      setLessonLinks((lessonList ?? []) as any[])
      if (!isNew && lessonId) {
        const { data, error: le } = await supabase.from('lessons').select('*').eq('id', lessonId).single()
        if (le) { setError('Failed to load: ' + le.message); setLoading(false); return }
        if (data) {
          setTitle((data as any).title ?? '')
          const parsed = htmlToBlocks((data as any).content_html ?? '')
          setBlocks(parsed)
        }
      }
      setLoading(false)
    }
    load()
  }, [])

  function updateBlock(id: string, content: string) {
    setBlocks(prev => prev.map(b => b.id === id ? { ...b, content } : b))
  }
  function addBlockAfter(afterId: string, type: BlockType) {
    setBlocks(prev => {
      const idx = prev.findIndex(b => b.id === afterId)
      const nb: Block = { id: uid(), type, content: type === 'tryit' ? 'print("Hello!")\n' : '# Python code\nprint("Hello, world!")\n' }
      const next = [...prev]; next.splice(idx + 1, 0, nb); return next
    })
  }
  function deleteBlock(id: string) {
    setBlocks(prev => prev.length <= 1 ? prev : prev.filter(b => b.id !== id))
  }
  function moveBlock(id: string, dir: -1 | 1) {
    setBlocks(prev => {
      const idx = prev.findIndex(b => b.id === id)
      const ni = idx + dir
      if (ni < 0 || ni >= prev.length) return prev
      const next = [...prev]; [next[idx], next[ni]] = [next[ni], next[idx]]; return next
    })
  }
  function addHtmlBlock(afterId: string) {
    setBlocks(prev => {
      const idx = prev.findIndex(b => b.id === afterId)
      const nb: Block = { id: uid(), type: 'html', content: '' }
      const next = [...prev]; next.splice(idx + 1, 0, nb); return next
    })
  }

  async function save() {
    if (!title.trim()) { setError('Title is required.'); return }
    setSaving(true); setError('')
    const html = blocksToHtml(blocks)
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

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#888', fontFamily: 'system-ui,sans-serif' }}>Loading lesson…</div>

  return (
    <div style={{ maxWidth: 860, margin: '24px auto', padding: '0 20px', fontFamily: 'system-ui, sans-serif', color: '#111' }}>
      <style>{EDITOR_CSS}{PYTHON_CSS}</style>
      <BackLink href={'/teacher/modules/' + moduleId} label="Back to module" />
      <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 4, color: '#111' }}>{isNew ? 'New lesson' : 'Edit lesson'}</h1>
      {authorName && <div style={{ fontSize: 12, color: '#888', marginBottom: 12 }}>Author: {authorName}</div>}

      <label style={{ fontSize: 11, fontWeight: 600, color: '#666', display: 'block', marginBottom: 3 }}>Lesson title</label>
      <input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Newton's Laws of Motion"
        style={{ width: '100%', maxWidth: 520, padding: '8px 11px', border: `1px solid #e5e7eb`, borderRadius: 8, fontSize: 14, fontFamily: 'inherit', marginBottom: 20, outline: 'none', background: '#fff', color: '#111' }} />

      {/* Blocks */}
      {blocks.map((block, i) => (
        <div key={block.id}>
          {block.type === 'html' && (
            <RichBlock
              block={block}
              onChange={c => updateBlock(block.id, c)}
              onAddAfter={type => addBlockAfter(block.id, type)}
              onDelete={() => deleteBlock(block.id)}
              onMoveUp={() => moveBlock(block.id, -1)}
              onMoveDown={() => moveBlock(block.id, 1)}
              canDelete={blocks.length > 1}
              onOpenMedia={(type, insertFn) => {
                pendingInsertFn.current = insertFn
                setMediaModal(type)
              }}
            />
          )}
          {block.type === 'code' && (
            <CodeBlock block={block} onChange={c => updateBlock(block.id, c)}
              onDelete={() => deleteBlock(block.id)}
              onMoveUp={() => moveBlock(block.id, -1)}
              onMoveDown={() => moveBlock(block.id, 1)} />
          )}
          {block.type === 'tryit' && (
            <TryItBlock block={block} onChange={c => updateBlock(block.id, c)}
              onDelete={() => deleteBlock(block.id)}
              onMoveUp={() => moveBlock(block.id, -1)}
              onMoveDown={() => moveBlock(block.id, 1)} />
          )}
          {/* Add block buttons between blocks */}
          <div style={{ display:'flex', gap:4, margin:'4px 0 4px', justifyContent:'center', opacity:0.5 }}>
            <button onClick={() => addHtmlBlock(block.id)} style={{ padding:'2px 8px', fontSize:10, border:'1px solid #e5e7eb', borderRadius:4, background:'#f9fafb', cursor:'pointer', color:'#555' }}>+ Text</button>
            <button onClick={() => addBlockAfter(block.id,'code')} style={{ padding:'2px 8px', fontSize:10, border:'1px solid #e5e7eb', borderRadius:4, background:'#1e1e2e', cursor:'pointer', color:'#cdd6f4' }}>+ Code</button>
            <button onClick={() => addBlockAfter(block.id,'tryit')} style={{ padding:'2px 8px', fontSize:10, border:'1px solid #e5e7eb', borderRadius:4, background:'#1a1b26', cursor:'pointer', color:'#7aa2f7' }}>+ Try it</button>
            <button onClick={() => { setQuizTargetId(block.id); setShowQuiz(true) }} style={{ padding:'2px 8px', fontSize:10, border:'1px solid #B5D4F4', borderRadius:4, background:'#E6F1FB', cursor:'pointer', color:'#0C447C' }}>+ Quiz</button>
          </div>
        </div>
      ))}

      {error && <div style={{ fontSize: 12, padding: '8px 11px', background: '#FCEBEB', color: '#791F1F', borderRadius: 8, margin: '12px 0' }}>{error}</div>}
      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        <button onClick={save} disabled={saving}
          style={{ padding: '10px 22px', background: '#185FA5', color: '#E6F1FB', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 500, cursor: 'pointer', opacity: saving ? .6 : 1 }}>
          {saving ? 'Saving…' : 'Save lesson'}
        </button>
        <a href={'/teacher/modules/' + moduleId} style={{ padding: '10px 16px', border: `1px solid #e5e7eb`, borderRadius: 8, fontSize: 14, textDecoration: 'none', color: '#111', background: '#fff', display: 'inline-flex', alignItems: 'center' }}>Cancel</a>
      </div>

      {showQuiz && <QuizModal onInsert={html => {
        if (quizTargetId) {
          setBlocks(prev => prev.map(b => b.id === quizTargetId ? { ...b, content: b.content + html } : b))
        }
        setShowQuiz(false)
      }} onClose={() => setShowQuiz(false)} />}
      {mediaModal && (
        <MediaModal
          type={mediaModal}
          lessons={lessonLinks}
          moduleId={moduleId}
          onInsert={html => {
            if (pendingInsertFn.current) pendingInsertFn.current(html)
            pendingInsertFn.current = null
            setMediaModal(null)
          }}
          onClose={() => { setMediaModal(null); pendingInsertFn.current = null }}
        />
      )}
    </div>
  )
}
