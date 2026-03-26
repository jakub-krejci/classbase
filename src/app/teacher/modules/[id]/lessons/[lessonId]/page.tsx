'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useParams } from 'next/navigation'
import { BackLink } from '@/components/ui'
import { highlightCode, highlightPython, PYTHON_CSS, LANGUAGE_LABELS, type Language } from '@/lib/highlight'

// ─── Block types ──────────────────────────────────────────────────────────────
type BlockType = 'html' | 'code' | 'tryit' | 'math'
interface Block { id: string; type: BlockType; content: string; language?: Language }

function uid() { return Math.random().toString(36).slice(2) }

// ─── Serialize blocks → HTML string stored in DB ──────────────────────────────
function blocksToHtml(blocks: Block[]): string {
  return blocks.map(b => {
    if (b.type === 'html') return b.content
    if (b.type === 'code') {
      const enc = encodeURIComponent(b.content)
      return `<div class="cb-code" data-code="${enc}" data-lang="${b.language ?? 'python'}"></div>`
    }
    if (b.type === 'tryit') {
      const enc = encodeURIComponent(b.content)
      return `<div class="cb-tryit" data-code="${enc}"></div>`
    }
    if (b.type === 'math') {
      const enc = encodeURIComponent(b.content)
      return `<div class="cb-math" data-latex="${enc}"></div>`
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
    } else if (el.nodeType === 1 && el.classList?.contains('cb-math')) {
      flushHtml()
      try { blocks.push({ id: uid(), type: 'math', content: decodeURIComponent(el.getAttribute('data-latex') ?? '') }) }
      catch { blocks.push({ id: uid(), type: 'math', content: el.getAttribute('data-latex') ?? '' }) }
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

function RichBlock({ block, onChange, onMount, onAddAfter, onDelete, onMoveUp, onMoveDown, canDelete, onOpenMedia, onInsertQuiz, onDuplicate }: {
  block: Block; onChange: (content: string) => void
  onMount?: (el: HTMLDivElement) => void
  onAddAfter: (type: BlockType) => void; onDelete: () => void
  onMoveUp: () => void; onMoveDown: () => void; canDelete: boolean
  onOpenMedia: (type: 'image'|'video'|'file'|'link', insertFn: (html: string) => void) => void
  onInsertQuiz: (insertFn: (html: string) => void) => void
  onDuplicate: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [activeFormats, setActiveFormats] = useState<Set<string>>(new Set())
  const [showTableModal, setShowTableModal] = useState(false)
  const savedColorRange = useRef<Range | null>(null)

  // Sync content into div on first render / when block changes externally
  useEffect(() => {
    if (ref.current) {
      if (ref.current.innerHTML !== block.content) {
        ref.current.innerHTML = block.content || ''
      }
      onMount?.(ref.current)
    }
  }, [])

  function exec(cmd: string, val?: string) { ref.current?.focus(); document.execCommand(cmd, false, val ?? ''); requestAnimationFrame(() => updateActiveFormats()) }

  function updateActiveFormats() {
    try {
      const formats = new Set<string>()
      try { if (document.queryCommandState('bold')) formats.add('bold') } catch {}
      try { if (document.queryCommandState('italic')) formats.add('italic') } catch {}
      try { if (document.queryCommandState('underline')) formats.add('underline') } catch {}
      try { if (document.queryCommandState('insertUnorderedList')) formats.add('ul') } catch {}
      try { if (document.queryCommandState('insertOrderedList')) formats.add('ol') } catch {}
      try { if (document.queryCommandState('justifyLeft')) formats.add('justifyLeft') } catch {}
      try { if (document.queryCommandState('justifyCenter')) formats.add('justifyCenter') } catch {}
      try { if (document.queryCommandState('justifyRight')) formats.add('justifyRight') } catch {}
      try { if (document.queryCommandState('justifyFull')) formats.add('justifyFull') } catch {}
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
      <style>{`
        .cb-toolbar { display:flex; flex-wrap:wrap; gap:2px; padding:5px 8px; background:#f8f9fa; border:1px solid #e5e7eb; border-bottom:none; border-radius:8px 8px 0 0; align-items:center; }
        .cb-tb-group { display:flex; align-items:center; gap:2px; }
        .cb-tb-label { font-size:9px; color:#aaa; text-transform:uppercase; letter-spacing:.05em; padding:0 4px; user-select:none; }
        .cb-tb-sep { width:1px; background:#e0e0e0; height:18px; margin:0 4px; flex-shrink:0; }
        .cb-tb-row { display:flex; flex-wrap:wrap; gap:2px; align-items:center; width:100%; }
        .cb-tb-row + .cb-tb-row { margin-top:3px; padding-top:3px; border-top:1px solid #f0f0f0; }
      `}</style>
      <div className="cb-toolbar">

        {/* Row 1: Format + Headings + Align */}
        <div className="cb-tb-row">
          <div className="cb-tb-group">
            <button style={tbActive('bold')} title="Bold (Ctrl+B)" onMouseDown={e=>{e.preventDefault();exec('bold')}}><b>B</b></button>
            <button style={tbActive('italic')} title="Italic (Ctrl+I)" onMouseDown={e=>{e.preventDefault();exec('italic')}}><i>I</i></button>
            <button style={tbActive('underline')} title="Underline (Ctrl+U)" onMouseDown={e=>{e.preventDefault();exec('underline')}}><u>U</u></button>
            <button style={{...TB,textDecoration:'line-through',fontSize:12}} title="Strikethrough" onMouseDown={e=>{e.preventDefault();exec('strikeThrough')}}>S</button>
          </div>
          <div className="cb-tb-sep" />
          <div className="cb-tb-group">
            <button style={tbActive('h1',{fontWeight:700,fontSize:13})} title="Heading 1" onMouseDown={e=>{e.preventDefault();heading('h1')}}>H1</button>
            <button style={tbActive('h2',{fontWeight:700,fontSize:12})} title="Heading 2" onMouseDown={e=>{e.preventDefault();heading('h2')}}>H2</button>
            <button style={tbActive('h3',{fontWeight:700,fontSize:11})} title="Heading 3" onMouseDown={e=>{e.preventDefault();heading('h3')}}>H3</button>
            <button style={tbActive('p',{fontSize:11})} title="Normal paragraph" onMouseDown={e=>{e.preventDefault();heading('p')}}>¶</button>
          </div>
          <div className="cb-tb-sep" />
          <div className="cb-tb-group">
            <button style={tbActive('justifyLeft',{fontSize:13})} title="Align left" onMouseDown={e=>{e.preventDefault();exec('justifyLeft')}}>⬸</button>
            <button style={tbActive('justifyCenter',{fontSize:13})} title="Align center" onMouseDown={e=>{e.preventDefault();exec('justifyCenter')}}>≡</button>
            <button style={tbActive('justifyRight',{fontSize:13})} title="Align right" onMouseDown={e=>{e.preventDefault();exec('justifyRight')}}>⇥</button>
            <button style={tbActive('justifyFull',{fontSize:13})} title="Justify" onMouseDown={e=>{e.preventDefault();exec('justifyFull')}}>☰</button>
          </div>
          <div className="cb-tb-sep" />
          <div className="cb-tb-group">
            <button style={tbActive('ul')} title="Bullet list" onMouseDown={e=>{e.preventDefault();exec('insertUnorderedList')}}>• list</button>
            <button style={tbActive('ol')} title="Numbered list" onMouseDown={e=>{e.preventDefault();exec('insertOrderedList')}}>1. list</button>
            <button style={TB} title="Indent (increase list level)" onMouseDown={e=>{e.preventDefault();exec('indent')}}>→ in</button>
            <button style={TB} title="Outdent (decrease list level)" onMouseDown={e=>{e.preventDefault();exec('outdent')}}>← out</button>
            <button style={tbActive('blockquote')} title="Blockquote (Shift+Enter to exit)" onMouseDown={e=>{e.preventDefault();heading('blockquote')}}>" quote</button>
          </div>
          <div className="cb-tb-sep" />
          <div className="cb-tb-group">
            <button style={{...TB,fontFamily:'Consolas,monospace',fontSize:11,border:'1px solid #e5e7eb'}} title="Inline code (Consolas font)" onMouseDown={e=>{
              e.preventDefault()
              const sel = window.getSelection()
              const txt = sel?.toString() || 'code'
              exec('insertHTML', `<code style="font-family:Consolas,monospace;background:#f3f4f6;padding:1px 5px;border-radius:4px;font-size:92%">${txt}</code>`)
            }}>code</button>
          </div>
        </div>

        {/* Row 2: Highlight + Text color + Clear + Specials + Media */}
        <div className="cb-tb-row">
          <span className="cb-tb-label">Highlight</span>
          <div className="cb-tb-group">
            {([['#fff59d','#333'],['#bbdefb','#0d47a1'],['#b9f6ca','#1b5e20'],['#fce4ec','#880e4f'],['#e8d5ff','#4a1a7a'],['#ffe0b2','#7c3a00']] as [string,string][]).map(([bg,fg]) => (
              <button key={bg} style={{...TB,background:bg,color:fg,fontWeight:700,width:20,height:20,padding:0,fontSize:12,borderRadius:3}} title={`Highlight ${bg}`}
                onMouseDown={e=>{e.preventDefault();hl(bg)}}>A</button>
            ))}
            <button style={{...TB,fontSize:11,border:'1px solid #e5e7eb',color:'#555'}} title="Remove all highlighting from selection"
              onMouseDown={e=>{
                e.preventDefault()
                const sel = window.getSelection()
                if (!sel || !sel.rangeCount) return
                const range = sel.getRangeAt(0)
                const frag = range.extractContents()
                const tmp = document.createElement('div')
                tmp.appendChild(frag)
                // Strip background from all spans
                tmp.querySelectorAll('span').forEach(s => { s.style.background = ''; s.style.backgroundColor = '' })
                range.insertNode(tmp)
                const p = document.createElement('span'); range.insertNode(p)
                sel.removeAllRanges(); const r2 = document.createRange(); r2.selectNodeContents(tmp); sel.addRange(r2)
                onChange(ref.current?.innerHTML ?? '')
              }}>✕ hl</button>
          </div>
          <div className="cb-tb-sep" />
          <span className="cb-tb-label">Color</span>
          <div className="cb-tb-group">
            {(['#e53e3e','#dd6b20','#d69e2e','#38a169','#3182ce','#805ad5','#111'] as string[]).map(clr => (
              <button key={clr} style={{...TB,background:clr,width:20,height:20,padding:0,borderRadius:3,border:'1px solid rgba(0,0,0,.15)'}} title={`Text color ${clr}`}
                onMouseDown={e=>{e.preventDefault();exec('foreColor',clr)}} />
            ))}
            <label style={{...TB,border:'1px solid #e5e7eb',padding:'2px 5px',cursor:'pointer',fontSize:11,display:'inline-flex',alignItems:'center',gap:3}} title="Custom text color"
              onMouseDown={e=>{
                // Save selection before color picker steals focus
                const sel = window.getSelection()
                if (sel && sel.rangeCount) savedColorRange.current = sel.getRangeAt(0).cloneRange()
              }}>
              <input type="color" defaultValue="#111111"
                style={{width:16,height:16,padding:0,border:'none',background:'none',cursor:'pointer'}}
                onChange={e=>{
                  // Restore selection then apply color
                  const sel = window.getSelection()
                  if (savedColorRange.current) {
                    sel?.removeAllRanges()
                    sel?.addRange(savedColorRange.current)
                  }
                  ref.current?.focus()
                  document.execCommand('foreColor', false, (e.target as HTMLInputElement).value)
                  onChange(ref.current?.innerHTML ?? '')
                }} />
              <span>RGB</span>
            </label>
            <button style={{...TB,fontSize:11,border:'1px solid #e5e7eb',color:'#555'}} title="Remove text color"
              onMouseDown={e=>{e.preventDefault();exec('removeFormat')}}>✕ clr</button>
          </div>
          <div className="cb-tb-sep" />
          <div className="cb-tb-group">
            <button style={{...TB,background:'#FAEEDA',color:'#633806',fontSize:11}} title="Important callout" onMouseDown={e=>{e.preventDefault();insertHtml('<div contenteditable="false" style="background:#FAEEDA;border-left:3px solid #BA7517;border-radius:0 8px 8px 0;padding:10px 14px;margin:8px 0"><div style="font-size:10px;font-weight:700;color:#633806;text-transform:uppercase;letter-spacing:.06em;margin-bottom:3px">⚠ Important</div><div contenteditable="true" style="color:#412402">Write here.</div></div>')}}>! Callout</button>
            <button style={{...TB,background:'#E1F5EE',color:'#085041',fontSize:11}} title="Foldable section" onMouseDown={e=>{e.preventDefault();insertHtml('<details><summary>▶ Click to reveal</summary><div contenteditable="true">Hidden content.</div></details>')}}>▾ Fold</button>
            <button style={tbActive('table',{fontSize:11})} title="Insert table" onMouseDown={e=>{e.preventDefault();setShowTableModal(true)}}>⊞ Table</button>
            <button style={{...TB,fontSize:11}} title="Horizontal divider" onMouseDown={e=>{e.preventDefault();insertHtml('<hr style="border:none;border-top:2px solid #e5e7eb;margin:12px 0">')}}>— HR</button>
          </div>
          <div className="cb-tb-sep" />
          <div className="cb-tb-group">
            <button style={{...TB,fontSize:11}} title="Insert image" onMouseDown={e=>{e.preventDefault();onOpenMedia('image',insertHtml)}}>🖼 Img</button>
            <button style={{...TB,fontSize:11}} title="Embed video" onMouseDown={e=>{e.preventDefault();onOpenMedia('video',insertHtml)}}>▶ Video</button>
            <button style={{...TB,fontSize:11}} title="Attach file" onMouseDown={e=>{e.preventDefault();onOpenMedia('file',insertHtml)}}>📎 File</button>
            <button style={{...TB,fontSize:11}} title="Insert hyperlink" onMouseDown={e=>{e.preventDefault();onOpenMedia('link',insertHtml)}}>🔗 Link</button>
          </div>
          <div className="cb-tb-sep" />
          <div className="cb-tb-group">
            <button style={{...TB,background:'#1e1e2e',color:'#cdd6f4',fontSize:11}} title="Insert code block below" onMouseDown={e=>{e.preventDefault();onAddAfter('code')}}>+ Code</button>
            <button style={{...TB,background:'#1a1b26',color:'#7aa2f7',fontSize:11}} title="Insert try-it block below" onMouseDown={e=>{e.preventDefault();onAddAfter('tryit')}}>+ Try</button>
            <button style={{...TB,background:'#E6F1FB',color:'#0C447C',fontSize:11}} title="Insert quiz" onMouseDown={e=>{e.preventDefault();onInsertQuiz(insertHtml)}}>✓ Quiz</button>
          </div>
          <div style={{flex:1}}/>
          <div className="cb-tb-group">
            <button style={{...TB,fontSize:10,color:'#888'}} title="Duplicate block" onMouseDown={e=>{e.preventDefault();onDuplicate()}}>⎘</button>
            <button style={{...TB,fontSize:11,color:'#888'}} title="Move block up" onMouseDown={e=>{e.preventDefault();onMoveUp()}}>↑</button>
            <button style={{...TB,fontSize:11,color:'#888'}} title="Move block down" onMouseDown={e=>{e.preventDefault();onMoveDown()}}>↓</button>
            {canDelete && <button style={{...TB,fontSize:11,color:'#A32D2D'}} title="Delete block" onMouseDown={e=>{e.preventDefault();onDelete()}}>✕</button>}
          </div>
        </div>
      </div>

      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        className="cb-rich"
        onInput={() => onChange(ref.current?.innerHTML ?? '')}
        onKeyUp={updateActiveFormats}
        onMouseUp={e => {
          updateActiveFormats()
          const target = e.target as HTMLElement
          if (target.tagName === 'IMG') showImageToolbar(target as HTMLImageElement)
          else hideImageToolbar()
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
          if (e.key === 'Enter' && !e.shiftKey) {
            requestAnimationFrame(() => {
              const sel = window.getSelection()
              if (!sel || !sel.rangeCount) return
              let node: Node | null = sel.getRangeAt(0).startContainer
              while (node && node !== ref.current) {
                const el = node as HTMLElement
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
        style={{ minHeight: 80, padding: '10px 14px', border: '1px solid #e5e7eb', borderRadius: '0 0 8px 8px', background: '#fff', fontSize: 14, lineHeight: 1.75, outline: 'none', color: '#111', fontFamily: 'system-ui,sans-serif' }}
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

// ─── Shared: auto-indent on Enter ─────────────────────────────────────────────
function handleCodeKeyDown(
  e: React.KeyboardEvent<HTMLTextAreaElement>,
  onRun?: () => void,
  extraHandler?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void
) {
  const ta = e.currentTarget
  const s = ta.selectionStart, en = ta.selectionEnd, v = ta.value

  if (e.key === 'Tab') {
    e.preventDefault()
    if (e.shiftKey) {
      // Shift+Tab: remove up to 4 spaces from line start
      const lineStart = v.lastIndexOf('\n', s - 1) + 1
      const spaces = v.slice(lineStart).match(/^ {1,4}/)?.[0] ?? ''
      if (spaces) {
        const nv = v.slice(0, lineStart) + v.slice(lineStart + spaces.length)
        ta.value = nv; ta.selectionStart = ta.selectionEnd = s - spaces.length
        return nv
      }
    } else {
      const nv = v.slice(0, s) + '    ' + v.slice(en)
      ta.value = nv; ta.selectionStart = ta.selectionEnd = s + 4
      return nv
    }
  }

  if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) {
    e.preventDefault()
    // Auto-indent: match current line indent + add extra indent after : 
    const lineStart = v.lastIndexOf('\n', s - 1) + 1
    const currentLine = v.slice(lineStart, s)
    const indent = currentLine.match(/^(\s*)/)?.[1] ?? ''
    const extraIndent = currentLine.trimEnd().endsWith(':') ? '    ' : ''
    const nv = v.slice(0, s) + '\n' + indent + extraIndent + v.slice(en)
    ta.value = nv
    ta.selectionStart = ta.selectionEnd = s + 1 + indent.length + extraIndent.length
    return nv
  }

  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && onRun) {
    e.preventDefault(); onRun()
  }

  if (e.key === '(' || e.key === '[' || e.key === '{' || e.key === '"' || e.key === "'") {
    const pairs: Record<string, string> = { '(': ')', '[': ']', '{': '}', '"': '"', "'": "'" }
    const close = pairs[e.key]
    if (s === en) { // no selection
      e.preventDefault()
      const nv = v.slice(0, s) + e.key + close + v.slice(en)
      ta.value = nv; ta.selectionStart = ta.selectionEnd = s + 1
      return nv
    }
  }

  extraHandler?.(e)
  return null
}

// ─── Code block (teacher editor) ──────────────────────────────────────────────
function CodeBlock({ block, onChange, onDelete, onMoveUp, onMoveDown, onDuplicate, onLanguageChange }: {
  block: Block; onChange: (c: string) => void; onDelete: () => void
  onMoveUp: () => void; onMoveDown: () => void; onDuplicate: () => void
  onLanguageChange: (lang: Language) => void
}) {
  const [code, setCode] = useState(block.content)
  const lang: Language = block.language ?? 'python'
  const [fontSize, setFontSize] = useState(14)
  const taRef = useRef<HTMLTextAreaElement>(null)
  const preRef = useRef<HTMLPreElement>(null)

  function syncHL(val: string) {
    if (preRef.current) preRef.current.innerHTML = highlightCode(val, lang) + '\n'
  }
  function syncH() {
    if (taRef.current) { taRef.current.style.height = 'auto'; taRef.current.style.height = taRef.current.scrollHeight + 'px' }
  }
  useEffect(() => { syncHL(code); syncH() }, [lang])
  useEffect(() => { syncHL(code); syncH() }, [])

  function update(val: string) { setCode(val); onChange(val); syncHL(val); syncH() }

  const monoStyle: React.CSSProperties = {
    fontFamily: 'ui-monospace,"Cascadia Code","Fira Code",Consolas,monospace',
    fontSize, lineHeight: 1.7, padding: '14px 16px 14px 52px',
    whiteSpace: 'pre-wrap', wordBreak: 'break-all',
    display: 'block', boxSizing: 'border-box', width: '100%',
  }
  const lineCount = (code.match(/\n/g)?.length ?? 0) + 1

  const placeholders: Record<Language, string> = {
    python:     '# Write Python here\nprint("Hello, world!")',
    javascript: '// Write JavaScript here\nconsole.log("Hello, world!")',
    typescript: '// Write TypeScript here\nconst greet = (name: string) => `Hello, ${name}!`',
    sql:        '-- Write SQL here\nSELECT * FROM users WHERE active = true;',
    html:       '<!-- Write HTML here -->\n<h1>Hello, world!</h1>',
    css:        '/* Write CSS here */\nbody { font-family: sans-serif; }',
    pseudocode: '// Write pseudocode here\nFUNCTION greet(name)\n  PRINT "Hello, " + name\nEND FUNCTION',
  }

  return (
    <div style={{ background: '#1e1e2e', borderRadius: 8, overflow: 'hidden', margin: '8px 0', border: '2px solid #313244' }}>
      <div style={{ background: '#16213e', padding: '5px 10px', display: 'flex', alignItems: 'center', gap: 6 }}>
        <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#f38ba8', flexShrink: 0 }} />
        <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#f9e2af', flexShrink: 0 }} />
        <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#a6e3a1', flexShrink: 0 }} />
        {/* Language selector */}
        <select value={lang} onChange={e => { onLanguageChange(e.target.value as Language); syncHL(code) }}
          style={{ fontSize: 10, fontFamily: 'monospace', color: '#7aa2f7', background: 'transparent', border: 'none', outline: 'none', cursor: 'pointer', marginLeft: 4, letterSpacing: '.04em' }}>
          {(Object.entries(LANGUAGE_LABELS) as [Language, string][]).map(([k, v]) => (
            <option key={k} value={k} style={{ background: '#16213e' }}>{v}</option>
          ))}
        </select>
        <div style={{ flex: 1 }} />
        <button onClick={() => setFontSize(f => Math.max(10, f - 1))} style={{ fontSize: 10, color: '#6c7086', background: 'none', border: 'none', cursor: 'pointer', padding: '1px 4px' }} title="Decrease font size">A−</button>
        <button onClick={() => setFontSize(f => Math.min(20, f + 1))} style={{ fontSize: 12, color: '#6c7086', background: 'none', border: 'none', cursor: 'pointer', padding: '1px 4px' }} title="Increase font size">A+</button>
        <button onClick={() => { navigator.clipboard?.writeText(code) }} style={{ fontSize: 10, color: '#6c7086', background: 'none', border: 'none', cursor: 'pointer', padding: '1px 6px' }} title="Copy code">⎘ Copy</button>
        <button onClick={() => {
          const a = document.createElement('a')
          a.href = URL.createObjectURL(new Blob([code], { type: 'text/x-python' }))
          a.download = `code.${lang === 'python' ? 'py' : lang === 'javascript' ? 'js' : lang === 'typescript' ? 'ts' : lang === 'sql' ? 'sql' : lang === 'html' ? 'html' : lang === 'css' ? 'css' : 'txt'}`
          a.click(); URL.revokeObjectURL(a.href)
        }} style={{ fontSize: 10, color: '#6c7086', background: 'none', border: 'none', cursor: 'pointer', padding: '1px 6px' }} title="Download as file">⬇ Export</button>
        <label style={{ fontSize: 10, color: '#6c7086', cursor: 'pointer', padding: '1px 6px' }} title="Import file">⬆ Import
          <input type="file" accept=".py,.js,.ts,.sql,.html,.css,.txt" style={{ display: 'none' }} onChange={e => {
            const f = e.target.files?.[0]; if (!f) return
            const r = new FileReader(); r.onload = ev => update(ev.target?.result as string); r.readAsText(f)
            e.target.value = ''
          }} />
        </label>
        <button onClick={onDuplicate} style={{ fontSize: 10, color: '#6c7086', background: 'none', border: 'none', cursor: 'pointer', padding: '1px 5px' }} title="Duplicate block">⎘</button>
        <button onClick={onMoveUp} style={{ fontSize: 11, color: '#6c7086', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px' }}>↑</button>
        <button onClick={onMoveDown} style={{ fontSize: 11, color: '#6c7086', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px' }}>↓</button>
        <button onClick={onDelete} style={{ fontSize: 11, color: '#f38ba8', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px' }}>✕</button>
      </div>

      <div style={{ position: 'relative', background: '#1e1e2e', display: 'flex' }}>
        <div style={{ width: 40, flexShrink: 0, background: '#181825', padding: '14px 8px 14px 0', textAlign: 'right', fontFamily: 'ui-monospace,monospace', fontSize, lineHeight: 1.7, color: '#45475a', userSelect: 'none', pointerEvents: 'none', boxSizing: 'border-box' }}>
          {Array.from({ length: lineCount }, (_, i) => <div key={i}>{i + 1}</div>)}
        </div>
        <pre ref={preRef} aria-hidden="true"
          style={{ ...monoStyle, color: '#cdd6f4', background: 'transparent', pointerEvents: 'none', position: 'absolute', left: 40, top: 0, right: 0, bottom: 0, margin: 0, overflow: 'hidden' }} />
        <textarea
          ref={taRef}
          value={code}
          spellCheck={false}
          onChange={e => update(e.target.value)}
          onKeyDown={e => {
            const nv = handleCodeKeyDown(e)
            if (nv !== null) update(nv)
          }}
          style={{ ...monoStyle, flex: 1, color: 'transparent', caretColor: '#cdd6f4', background: 'transparent', border: 'none', outline: 'none', resize: 'none', overflow: 'hidden', position: 'relative', zIndex: 1, minHeight: 60, paddingLeft: 52 }}
          placeholder={placeholders[lang]}
        />
      </div>
    </div>
  )
}


function TryItBlock({ block, onChange, onDelete, onMoveUp, onMoveDown, onDuplicate }: {
  block: Block; onChange: (c: string) => void; onDelete: () => void; onMoveUp: () => void; onMoveDown: () => void; onDuplicate: () => void
}) {
  const [code, setCode] = useState(block.content)
  const [output, setOutput] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [running, setRunning] = useState(false)
  const [pyReady, setPyReady] = useState(false)
  const [pyLoading, setPyLoading] = useState(false)
  const [fontSize, setFontSize] = useState(14)
  const [expectedOutput, setExpectedOutput] = useState('')
  const [showExpected, setShowExpected] = useState(false)
  const [outputHistory, setOutputHistory] = useState<string[]>([])
  const taRef = useRef<HTMLTextAreaElement>(null)
  const preRef = useRef<HTMLPreElement>(null)
  const originalCode = useRef(block.content)

  function syncHL(val: string) { if (preRef.current) preRef.current.innerHTML = highlightPython(val) + '\n' }
  function syncH() { if (taRef.current) { taRef.current.style.height = 'auto'; taRef.current.style.height = taRef.current.scrollHeight + 'px' } }
  useEffect(() => { syncHL(code); syncH() }, [])

  // Eagerly start loading Pyodide
  useEffect(() => {
    import('@/lib/pyodide-runner').then(m => {
      setPyLoading(true)
      m.loadPyodide().then(() => { setPyReady(true); setPyLoading(false) }).catch(() => setPyLoading(false))
    })
  }, [])

  const [images, setImages] = useState<string[]>([])
  const [pkgStatus, setPkgStatus] = useState('')

  async function run() {
    if (running) return
    setRunning(true); setOutput(null); setError(null); setImages([])
    try {
      const { runPython } = await import('@/lib/pyodide-runner')
      const { output: out, error: err, images: imgs } = await runPython(code, () => {}, msg => setPkgStatus(msg))
      const result = out || (imgs.length ? '' : '(no output)')
      setOutput(result)
      if (err) setError(err)
      if (imgs.length) setImages(imgs)
      setOutputHistory(h => [result || `[${imgs.length} chart(s)]`, ...h.slice(0, 4)])
    } catch (e: any) {
      setError(e.message)
    }
    setRunning(false)
  }

  function update(val: string) { setCode(val); onChange(val); syncHL(val); syncH() }

  const checkResult = output && expectedOutput.trim()
    ? output.trim() === expectedOutput.trim() ? 'correct' : 'wrong'
    : null

  const monoStyle: React.CSSProperties = {
    fontFamily: 'ui-monospace,"Cascadia Code","Fira Code",Consolas,monospace',
    fontSize, lineHeight: 1.7, padding: '14px 16px 14px 52px',
    whiteSpace: 'pre-wrap', wordBreak: 'break-all',
    display: 'block', boxSizing: 'border-box', width: '100%',
  }
  const lineCount = (code.match(/\n/g)?.length ?? 0) + 1

  return (
    <div style={{ background: '#1a1b26', borderRadius: 8, overflow: 'hidden', margin: '8px 0', border: '2px solid #2a2a4a' }}>
      {/* Header */}
      <div style={{ background: '#16213e', padding: '5px 10px', display: 'flex', alignItems: 'center', gap: 6 }}>
        <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#f38ba8', flexShrink: 0 }} />
        <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#f9e2af', flexShrink: 0 }} />
        <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#a6e3a1', flexShrink: 0 }} />
        <span style={{ fontFamily: 'monospace', fontSize: 10, color: '#7aa2f7', letterSpacing: '.06em', flex: 1, marginLeft: 4 }}>
          ▶ TRY IT — Interactive Python
          {pyLoading && <span style={{ color: '#45475a', marginLeft: 8 }}>loading Pyodide…</span>}
          {pyReady && <span style={{ color: '#a6e3a1', marginLeft: 8 }}>● ready</span>}
        </span>
        <button onClick={() => setFontSize(f => Math.max(10, f-1))} style={{ fontSize:10, color:'#6c7086', background:'none', border:'none', cursor:'pointer', padding:'1px 4px' }}>A−</button>
        <button onClick={() => setFontSize(f => Math.min(20, f+1))} style={{ fontSize:12, color:'#6c7086', background:'none', border:'none', cursor:'pointer', padding:'1px 4px' }}>A+</button>
        <button onClick={() => setShowExpected(s => !s)} style={{ fontSize:10, color: showExpected?'#f9e2af':'#6c7086', background:'none', border:'none', cursor:'pointer', padding:'1px 6px' }} title="Set expected output">✓ Expected</button>
        <button onClick={() => { update(originalCode.current); syncHL(originalCode.current) }} style={{ fontSize:10, color:'#6c7086', background:'none', border:'none', cursor:'pointer', padding:'1px 6px' }} title="Reset to original code">↺ Reset</button>
        <button onClick={() => {
          const a = document.createElement('a')
          a.href = URL.createObjectURL(new Blob([code], { type: 'text/x-python' }))
          a.download = 'tryit.py'; a.click(); URL.revokeObjectURL(a.href)
        }} style={{ fontSize:10, color:'#6c7086', background:'none', border:'none', cursor:'pointer', padding:'1px 6px' }} title="Download as .py">⬇ .py</button>
        <label style={{ fontSize:10, color:'#6c7086', cursor:'pointer', padding:'1px 6px' }} title="Import .py file">⬆ .py
          <input type="file" accept=".py,.txt" style={{ display:'none' }} onChange={e => {
            const f = e.target.files?.[0]; if (!f) return
            const r = new FileReader(); r.onload = ev => update(ev.target?.result as string); r.readAsText(f)
            e.target.value = ''
          }} />
        </label>
        <button onClick={run} disabled={running}
          style={{ padding:'2px 10px', fontSize:11, background: pyReady?'#a6e3a1':'#7aa2f7', color:'#1a1b26', border:'none', borderRadius:4, cursor:'pointer', fontWeight:600 }}>
          {running ? (pkgStatus || '⏳') : '▶ Run'}
        </button>
        <button onClick={onMoveUp} style={{ fontSize:11, color:'#6c7086', background:'none', border:'none', cursor:'pointer', padding:'2px 4px' }}>↑</button>
        <button onClick={onMoveDown} style={{ fontSize:11, color:'#6c7086', background:'none', border:'none', cursor:'pointer', padding:'2px 4px' }}>↓</button>
        <button onClick={onDuplicate} style={{ fontSize:10, color:'#6c7086', background:'none', border:'none', cursor:'pointer', padding:'1px 5px' }} title="Duplicate block">⎘</button>
        <button onClick={onDelete} style={{ fontSize:11, color:'#f38ba8', background:'none', border:'none', cursor:'pointer', padding:'2px 4px' }}>✕</button>
      </div>

      {/* Expected output input */}
      {showExpected && (
        <div style={{ background:'#181825', padding:'8px 12px', borderBottom:'1px solid #2a2a4a', display:'flex', alignItems:'center', gap:8 }}>
          <span style={{ fontSize:11, color:'#f9e2af', fontFamily:'monospace', flexShrink:0 }}>Expected output:</span>
          <input value={expectedOutput} onChange={e=>setExpectedOutput(e.target.value)}
            style={{ flex:1, background:'#1e1e2e', border:'1px solid #45475a', borderRadius:5, padding:'3px 8px', color:'#cdd6f4', fontFamily:'monospace', fontSize:12, outline:'none' }}
            placeholder="e.g. Hello, world!" />
        </div>
      )}

      {/* Editor */}
      <div style={{ position: 'relative', background: '#1e1e2e', display: 'flex' }}>
        <div style={{ width:40, flexShrink:0, background:'#181825', padding:'14px 8px 14px 0', textAlign:'right', fontFamily:'ui-monospace,monospace', fontSize, lineHeight:1.7, color:'#45475a', userSelect:'none', pointerEvents:'none', boxSizing:'border-box' }}>
          {Array.from({ length: lineCount }, (_, i) => <div key={i}>{i+1}</div>)}
        </div>
        <pre ref={preRef} aria-hidden="true"
          style={{ ...monoStyle, color:'#cdd6f4', background:'transparent', pointerEvents:'none', position:'absolute', left:40, top:0, right:0, bottom:0, margin:0, overflow:'hidden' }} />
        <textarea ref={taRef} value={code} spellCheck={false}
          onChange={e => update(e.target.value)}
          onKeyDown={e => {
            const nv = handleCodeKeyDown(e, run)
            if (nv !== null) { update(nv) }
          }}
          style={{ ...monoStyle, flex:1, color:'transparent', caretColor:'#cdd6f4', background:'transparent', border:'none', outline:'none', resize:'none', overflow:'hidden', position:'relative', zIndex:1, minHeight:60, paddingLeft:52 }}
          placeholder="# Ctrl+Enter to run" />
      </div>

      {/* Output */}
      {(output !== null || error !== null || images.length > 0) && (
        <div style={{ background:'#0d1117', borderTop:'1px solid #2a2a4a', padding:'10px 14px' }}>
          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
            <span style={{ fontSize:10, color:'#6c7086', fontFamily:'monospace', letterSpacing:'.05em' }}>OUTPUT</span>
            {checkResult === 'correct' && <span style={{ fontSize:10, background:'#a6e3a1', color:'#1a1b26', padding:'1px 7px', borderRadius:10, fontWeight:700 }}>✓ Correct!</span>}
            {checkResult === 'wrong' && <span style={{ fontSize:10, background:'#f38ba8', color:'#1a1b26', padding:'1px 7px', borderRadius:10, fontWeight:700 }}>✗ Not matching</span>}
            {output && <button onClick={() => navigator.clipboard?.writeText(output!)} style={{ fontSize:10, color:'#6c7086', background:'none', border:'none', cursor:'pointer', marginLeft:'auto' }}>⎘ Copy</button>}
          </div>
          {output && <pre style={{ color:'#a6e3a1', fontFamily:'ui-monospace,monospace', fontSize:13, margin:0, whiteSpace:'pre-wrap' }}>{output}</pre>}
          {error && <pre style={{ color:'#f38ba8', fontFamily:'ui-monospace,monospace', fontSize:12, margin: output ? '6px 0 0' : 0, whiteSpace:'pre-wrap' }}>{error}</pre>}
          {images.map((img, i) => (
            <div key={i} style={{ marginTop: output || error ? 10 : 0 }}>
              <img src={'data:image/png;base64,' + img} alt={'Chart ' + (i+1)}
                style={{ maxWidth:'100%', borderRadius:6, display:'block' }} />
            </div>
          ))}
        </div>
      )}

      {/* History */}
      {outputHistory.length > 1 && (
        <details style={{ background:'#0a0a0f', borderTop:'1px solid #2a2a4a' }}>
          <summary style={{ fontSize:10, color:'#45475a', padding:'4px 14px', cursor:'pointer', userSelect:'none', listStyle:'none' }}>▸ {outputHistory.length-1} previous run{outputHistory.length > 2 ? 's' : ''}</summary>
          {outputHistory.slice(1).map((h, i) => (
            <pre key={i} style={{ color:'#585b70', fontFamily:'ui-monospace,monospace', fontSize:12, margin:0, padding:'4px 14px', borderTop:'1px solid #1a1a2e', whiteSpace:'pre-wrap' }}>{h}</pre>
          ))}
        </details>
      )}

      <div style={{ padding:'4px 14px 5px', fontSize:10, color:'#313244', display:'flex', gap:12 }}>
        <span>Ctrl+Enter run</span><span>Tab indent</span><span>Shift+Tab unindent</span>
      </div>
    </div>
  )
}

// ─── Math / LaTeX block ────────────────────────────────────────────────────────
// KaTeX loaded from CDN on first render
let katexLoaded = false
let katexLoading: Promise<void> | null = null

function ensureKatex(): Promise<void> {
  if (katexLoaded) return Promise.resolve()
  if (katexLoading) return katexLoading
  katexLoading = new Promise<void>((resolve, reject) => {
    // CSS
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = 'https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css'
    document.head.appendChild(link)
    // JS
    const script = document.createElement('script')
    script.src = 'https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.js'
    script.onload = () => { katexLoaded = true; resolve() }
    script.onerror = () => reject(new Error('KaTeX failed to load'))
    document.head.appendChild(script)
  })
  return katexLoading
}

function MathBlock({ block, onChange, onDelete, onMoveUp, onMoveDown, onDuplicate }: {
  block: Block; onChange: (c: string) => void; onDelete: () => void
  onMoveUp: () => void; onMoveDown: () => void; onDuplicate: () => void
}) {
  const [latex, setLatex] = useState(block.content || '\\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}')
  const [rendered, setRendered] = useState('')
  const [error, setError] = useState('')
  const [mode, setMode] = useState<'display' | 'inline'>('display')
  const previewRef = useRef<HTMLDivElement>(null)

  useEffect(() => { renderLatex(latex) }, [latex, mode])

  async function renderLatex(src: string) {
    try {
      await ensureKatex()
      const katex = (window as any).katex
      const html = katex.renderToString(src, { displayMode: mode === 'display', throwOnError: false, trust: true })
      setRendered(html); setError('')
    } catch (e: any) { setError(e.message) }
  }

  function update(val: string) { setLatex(val); onChange(val) }

  return (
    <div style={{ background: '#faf9ff', border: '2px solid #e9e4ff', borderRadius: 8, overflow: 'hidden', margin: '8px 0' }}>
      {/* Header */}
      <div style={{ background: '#f0ebff', padding: '5px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 14 }}>∑</span>
        <span style={{ fontSize: 11, fontWeight: 600, color: '#6b46c1', letterSpacing: '.04em', flex: 1 }}>MATH — LaTeX / KaTeX</span>
        <select value={mode} onChange={e => setMode(e.target.value as any)}
          style={{ fontSize: 11, border: '1px solid #d6bcfa', borderRadius: 4, padding: '2px 6px', background: '#fff', color: '#6b46c1', cursor: 'pointer' }}>
          <option value="display">Display (centered)</option>
          <option value="inline">Inline</option>
        </select>
        <button onClick={onDuplicate} style={{ fontSize: 10, color: '#6b46c1', background: 'none', border: 'none', cursor: 'pointer', padding: '1px 5px' }} title="Duplicate block">⎘</button>
        <button onClick={onMoveUp} style={{ fontSize: 11, color: '#9ca3af', background: 'none', border: 'none', cursor: 'pointer', padding: '1px 4px' }}>↑</button>
        <button onClick={onMoveDown} style={{ fontSize: 11, color: '#9ca3af', background: 'none', border: 'none', cursor: 'pointer', padding: '1px 4px' }}>↓</button>
        <button onClick={onDelete} style={{ fontSize: 11, color: '#f38ba8', background: 'none', border: 'none', cursor: 'pointer', padding: '1px 4px' }}>✕</button>
      </div>

      {/* Preview */}
      <div style={{ padding: '14px 20px', minHeight: 48, display: 'flex', alignItems: 'center', justifyContent: mode === 'display' ? 'center' : 'flex-start', background: '#fff', borderBottom: '1px solid #e9e4ff' }}>
        {error
          ? <span style={{ color: '#e53e3e', fontSize: 12, fontFamily: 'monospace' }}>{error}</span>
          : <span dangerouslySetInnerHTML={{ __html: rendered || '<span style="color:#ccc">Preview will appear here…</span>' }} />
        }
      </div>

      {/* Editor */}
      <div style={{ padding: '10px 12px', background: '#faf9ff' }}>
        <div style={{ fontSize: 10, color: '#9ca3af', marginBottom: 4 }}>LaTeX source:</div>
        <textarea
          value={latex}
          onChange={e => update(e.target.value)}
          spellCheck={false}
          style={{ width: '100%', minHeight: 72, fontFamily: 'ui-monospace,monospace', fontSize: 13, padding: '8px 10px', border: '1px solid #d6bcfa', borderRadius: 6, background: '#fff', color: '#1a1a2e', outline: 'none', resize: 'vertical', lineHeight: 1.5, boxSizing: 'border-box' }}
          placeholder="e.g. \frac{d}{dx}\left(x^n\right) = nx^{n-1}"
        />
        <div style={{ fontSize: 10, color: '#b794f4', marginTop: 4, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {['\frac{a}{b}', '\sqrt{x}', '\sum_{i=0}^{n}', '\int_a^b', '\lim_{x \to \infty}', 'x^{2}', '\alpha \beta \gamma', '\begin{matrix} a & b \\\\ c & d \end{matrix}'].map(s => (
            <button key={s} onClick={() => update(latex + ' ' + s)}
              style={{ fontSize: 10, color: '#6b46c1', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'monospace' }}>
              {s}
            </button>
          ))}
        </div>
      </div>
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
  const [q, setQ] = useState('')
  const [opts, setOpts] = useState(['', '', '', ''])
  const [correct, setCorrect] = useState(0)
  const [expl, setExpl] = useState(['', '', '', ''])
  const [err, setErr] = useState('')
  const inp: React.CSSProperties = { width:'100%', padding:'7px 9px', border:'1px solid #e5e7eb', borderRadius:7, fontSize:13, fontFamily:'inherit', outline:'none', marginBottom:8, boxSizing:'border-box' as const }

  function handleInsert() {
    const filledOpts = opts.filter(x => x.trim())
    if (!q.trim()) { setErr('Please enter a question.'); return }
    if (filledOpts.length < 2) { setErr('Please add at least 2 options.'); return }
    setErr('')
    const oE = JSON.stringify(filledOpts).replace(/"/g, '&quot;')
    const eE = JSON.stringify(expl.filter((_, i) => opts[i]?.trim()).slice(0, filledOpts.length)).replace(/"/g, '&quot;')
    const qE = q.replace(/"/g, '&quot;')
    const html = '<div class="cb-quiz" data-q="' + qE + '" data-opts="' + oE + '" data-correct="' + correct + '" data-expl="' + eE + '" contenteditable="false" style="background:#f0f7ff;border:1px solid #B5D4F4;border-radius:10px;margin:10px 0;padding:0;overflow:hidden"><div style="padding:9px 14px;background:#E6F1FB;font-size:10px;font-weight:700;color:#0C447C;text-transform:uppercase;letter-spacing:.06em">✓ Quiz — ' + q + '</div></div>'
    onInsert(html)
    onClose()
  }

  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.5)',zIndex:9000,display:'flex',alignItems:'center',justifyContent:'center',padding:20}}>
      <div style={{background:'#fff',borderRadius:14,padding:24,width:'100%',maxWidth:560,maxHeight:'90vh',overflowY:'auto'}}>
        <h2 style={{fontSize:16,fontWeight:600,marginBottom:14}}>Insert quiz question</h2>
        <label style={{fontSize:11,fontWeight:600,color:'#555',display:'block',marginBottom:3}}>Question</label>
        <input value={q} onChange={e=>{setQ(e.target.value);setErr('')}} style={inp} placeholder="e.g. What is Newton's first law?" />
        <label style={{fontSize:11,fontWeight:600,color:'#555',display:'block',margin:'10px 0 4px'}}>
          Options <span style={{fontWeight:400,color:'#888'}}>(click circle to mark correct answer)</span>
        </label>
        {opts.map((o, ii) => (
          <div key={ii} style={{display:'flex',alignItems:'center',gap:8,marginBottom:8}}>
            <div onClick={()=>setCorrect(ii)}
              style={{width:18,height:18,borderRadius:'50%',border:'2px solid',flexShrink:0,cursor:'pointer',
                borderColor:correct===ii?'#185FA5':'#ccc',background:correct===ii?'#185FA5':'#fff'}} />
            <input value={o} onChange={e=>setOpts(p=>p.map((x,j)=>j===ii?e.target.value:x))}
              style={{...inp,flex:2,marginBottom:0,borderColor:correct===ii?'#185FA5':'#e5e7eb'}}
              placeholder={'Option ' + (ii+1)} />
            <input value={expl[ii]} onChange={e=>setExpl(p=>p.map((x,j)=>j===ii?e.target.value:x))}
              style={{...inp,flex:2,marginBottom:0,background:'#fffbf0',borderColor:'#ffe4a0',fontSize:12}}
              placeholder="Explanation if wrong (optional)" />
          </div>
        ))}
        <button onClick={()=>{setOpts(p=>[...p,'']);setExpl(p=>[...p,''])}}
          style={{fontSize:12,color:'#185FA5',background:'none',border:'none',cursor:'pointer',marginBottom:8,padding:'2px 0'}}>
          + Add option
        </button>
        {err && <div style={{fontSize:12,color:'#791F1F',background:'#FCEBEB',borderRadius:7,padding:'7px 10px',marginBottom:10}}>{err}</div>}
        <div style={{display:'flex',gap:8,marginTop:4}}>
          <button onClick={handleInsert}
            style={{flex:1,padding:'10px',background:'#185FA5',color:'#fff',border:'none',borderRadius:8,fontSize:13,fontWeight:600,cursor:'pointer'}}>
            Insert quiz
          </button>
          <button onClick={onClose}
            style={{padding:'10px 18px',border:'1px solid #e5e7eb',borderRadius:8,fontSize:13,cursor:'pointer',background:'#fff'}}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
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
  const [autoSaveStatus, setAutoSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [showShortcuts, setShowShortcuts] = useState(false)
  const [lastSaved, setLastSaved] = useState<Date | null>(null)
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lessonIdRef = useRef<string | null>(isNew ? null : lessonId)
  const pendingInsertFn = useRef<((html: string) => void) | null>(null)
  const pendingQuizInsertFn = useRef<((html: string) => void) | null>(null)
  const blockDomRefs = useRef<Record<string, HTMLDivElement>>({})
  const [showQuiz, setShowQuiz] = useState(false)
  const [quizTargetId, setQuizTargetId] = useState<string | null>(null)
  const [mediaModal, setMediaModal] = useState<null | 'image' | 'video' | 'file' | 'link'>(null)
  const [mediaTargetId, setMediaTargetId] = useState<string | null>(null)
  const [activeFormats, setActiveFormats] = useState<Set<string>>(new Set())
  const [showTableModal, setShowTableModal] = useState(false)
  const savedColorRange = useRef<Range | null>(null)

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

  // Auto-save: debounce 30s after any change, only for existing lessons
  useEffect(() => {
    if (isNew || loading || !title.trim()) return
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current)
    autoSaveTimer.current = setTimeout(async () => {
      if (!lessonIdRef.current) return
      setAutoSaveStatus('saving')
      try {
        // Sync RichBlock DOM content into blocks state before serializing
    const syncedBlocks = blocks.map(b => {
      if (b.type === 'html' && blockDomRefs.current[b.id]) {
        return { ...b, content: blockDomRefs.current[b.id].innerHTML }
      }
      return b
    })
    const html = blocksToHtml(syncedBlocks)
        const { error } = await supabase.from('lessons').update({
          title: title.trim(), content_html: html, updated_at: new Date().toISOString()
        } as any).eq('id', lessonIdRef.current)
        if (error) { setAutoSaveStatus('error') }
        else { setAutoSaveStatus('saved'); setLastSaved(new Date()) }
      } catch { setAutoSaveStatus('error') }
      setTimeout(() => setAutoSaveStatus('idle'), 3000)
    }, 30000) // 30 second debounce
    return () => { if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current) }
  }, [blocks, title])

  function updateBlock(id: string, content: string) {
    setBlocks(prev => prev.map(b => b.id === id ? { ...b, content } : b))
  }
  function updateBlockLanguage(id: string, language: Language) {
    setBlocks(prev => prev.map(b => b.id === id ? { ...b, language } : b))
  }
  function addBlockAfter(afterId: string, type: BlockType) {
    setBlocks(prev => {
      const idx = prev.findIndex(b => b.id === afterId)
      const nb: Block = { id: uid(), type, content: type === 'tryit' ? 'print("Hello!")\n' : '# Python code\nprint("Hello, world!")\n', language: type === 'code' ? 'python' : undefined }
      const next = [...prev]; next.splice(idx + 1, 0, nb); return next
    })
  }
  function deleteBlock(id: string) {
    setBlocks(prev => prev.length <= 1 ? prev : prev.filter(b => b.id !== id))
  }
  function duplicateBlock(id: string) {
    setBlocks(prev => {
      const idx = prev.findIndex(b => b.id === id)
      if (idx === -1) return prev
      const copy: Block = { ...prev[idx], id: uid() }
      const next = [...prev]; next.splice(idx + 1, 0, copy); return next
    })
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
    // Sync RichBlock DOM content into blocks state before serializing
    const syncedBlocks = blocks.map(b => {
      if (b.type === 'html' && blockDomRefs.current[b.id]) {
        return { ...b, content: blockDomRefs.current[b.id].innerHTML }
      }
      return b
    })
    const html = blocksToHtml(syncedBlocks)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { window.location.href = '/login'; return }
    if (isNew) {
      const { data: last } = await supabase.from('lessons').select('position').eq('module_id', moduleId).order('position', { ascending: false }).limit(1)
      const pos = last && last.length > 0 ? ((last[0] as any).position ?? 0) + 1 : 0
      const { data: newLesson, error: err } = await supabase.from('lessons').insert({ module_id: moduleId, title: title.trim(), content_html: html, position: pos, author_id: authorId } as any).select('id').single()
      if (err) { setError(err.message); setSaving(false); return }
      if (newLesson) lessonIdRef.current = (newLesson as any).id
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
              onMount={(el: HTMLDivElement) => { blockDomRefs.current[block.id] = el }}
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
              onInsertQuiz={(insertFn) => {
                pendingQuizInsertFn.current = insertFn
                setShowQuiz(true)
              }}
              onDuplicate={() => duplicateBlock(block.id)}
            />
          )}
          {block.type === 'code' && (
            <CodeBlock block={block} onChange={c => updateBlock(block.id, c)}
              onLanguageChange={lang => updateBlockLanguage(block.id, lang)}
              onDuplicate={() => duplicateBlock(block.id)}
              onDelete={() => deleteBlock(block.id)}
              onMoveUp={() => moveBlock(block.id, -1)}
              onMoveDown={() => moveBlock(block.id, 1)} />
          )}
          {block.type === 'tryit' && (
            <TryItBlock block={block} onChange={c => updateBlock(block.id, c)}
              onDuplicate={() => duplicateBlock(block.id)}
              onDelete={() => deleteBlock(block.id)}
              onMoveUp={() => moveBlock(block.id, -1)}
              onMoveDown={() => moveBlock(block.id, 1)} />
          )}
          {block.type === 'math' && (
            <MathBlock block={block} onChange={c => updateBlock(block.id, c)}
              onDuplicate={() => duplicateBlock(block.id)}
              onDelete={() => deleteBlock(block.id)}
              onMoveUp={() => moveBlock(block.id, -1)}
              onMoveDown={() => moveBlock(block.id, 1)}
            />
          )}
          {/* Add block buttons between blocks */}
          <div style={{ display:'flex', gap:4, margin:'4px 0 4px', justifyContent:'center', opacity:0.5 }}>
            <button onClick={() => addHtmlBlock(block.id)} style={{ padding:'2px 8px', fontSize:10, border:'1px solid #e5e7eb', borderRadius:4, background:'#f9fafb', cursor:'pointer', color:'#555' }}>+ Text</button>
            <button onClick={() => addBlockAfter(block.id,'code')} style={{ padding:'2px 8px', fontSize:10, border:'1px solid #e5e7eb', borderRadius:4, background:'#1e1e2e', cursor:'pointer', color:'#cdd6f4' }}>+ Code</button>
            <button onClick={() => addBlockAfter(block.id,'tryit')} style={{ padding:'2px 8px', fontSize:10, border:'1px solid #e5e7eb', borderRadius:4, background:'#1a1b26', cursor:'pointer', color:'#7aa2f7' }}>+ Try it</button>
            <button onClick={() => addBlockAfter(block.id,'math')} style={{ padding:'2px 8px', fontSize:10, border:'1px solid #d6bcfa', borderRadius:4, background:'#faf9ff', cursor:'pointer', color:'#6b46c1' }}>+ Math</button>
            <button onClick={() => {
              // Create a new html block after this one and insert the quiz into it
              pendingQuizInsertFn.current = (html: string) => {
                setBlocks(prev => {
                  const idx = prev.findIndex(b => b.id === block.id)
                  const newBlock = { id: uid(), type: 'html' as const, content: html }
                  const next = [...prev]
                  next.splice(idx + 1, 0, newBlock)
                  return next
                })
              }
              setShowQuiz(true)
            }} style={{ padding:'2px 8px', fontSize:10, border:'1px solid #B5D4F4', borderRadius:4, background:'#E6F1FB', cursor:'pointer', color:'#0C447C' }}>+ Quiz</button>
          </div>
        </div>
      ))}

      {error && <div style={{ fontSize: 12, padding: '8px 11px', background: '#FCEBEB', color: '#791F1F', borderRadius: 8, margin: '12px 0' }}>{error}</div>}
      <div style={{ display: 'flex', gap: 8, marginTop: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <button onClick={save} disabled={saving}
          style={{ padding: '10px 22px', background: '#185FA5', color: '#E6F1FB', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 500, cursor: 'pointer', opacity: saving ? .6 : 1 }}>
          {saving ? 'Saving…' : 'Save lesson'}
        </button>
        <a href={'/teacher/modules/' + moduleId} style={{ padding: '10px 16px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 14, textDecoration: 'none', color: '#111', background: '#fff', display: 'inline-flex', alignItems: 'center' }}>Cancel</a>
        <div style={{ marginLeft: 8, fontSize: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
          {autoSaveStatus === 'saving' && <span style={{ color: '#888' }}>⟳ Auto-saving…</span>}
          {autoSaveStatus === 'saved' && <span style={{ color: '#27500A' }}>✓ Auto-saved {lastSaved ? lastSaved.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) : ''}</span>}
          {autoSaveStatus === 'error' && <span style={{ color: '#791F1F' }}>⚠ Auto-save failed</span>}
          {autoSaveStatus === 'idle' && !isNew && <span style={{ color: '#bbb' }}>Auto-saves every 30s</span>}
          <span style={{ color: '#ccc' }}>|</span>
          <span style={{ color: '#aaa' }}>{(() => {
            const tmp = document.createElement ? document.createElement('div') : null
            if (!tmp) return ''
            const html = blocksToHtml(blocks)
            tmp.innerHTML = html
            const words = (tmp.textContent ?? '').trim().split(/\s+/).filter(Boolean).length
            const codeBlocks = blocks.filter(b => b.type === 'code' || b.type === 'tryit').length
            return words + ' words' + (codeBlocks ? ' · ' + codeBlocks + ' code block' + (codeBlocks > 1 ? 's' : '') : '')
          })()}</span>
          <button onClick={() => setShowShortcuts(s => !s)}
            style={{ fontSize: 11, color: '#aaa', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px' }}
            title="Keyboard shortcuts">
            ⌨ Shortcuts
          </button>
        </div>
      </div>

      {showQuiz && <QuizModal onInsert={html => {
        if (pendingQuizInsertFn.current) {
          pendingQuizInsertFn.current(html)
          pendingQuizInsertFn.current = null
        }
        setShowQuiz(false)
      }} onClose={() => { setShowQuiz(false); pendingQuizInsertFn.current = null }} />}
      {showShortcuts && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)', zIndex:400, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}
          onClick={() => setShowShortcuts(false)}>
          <div onClick={e => e.stopPropagation()} style={{ background:'#fff', borderRadius:14, padding:24, width:'100%', maxWidth:500, maxHeight:'80vh', overflowY:'auto' }}>
            <h2 style={{ fontSize:16, fontWeight:600, marginBottom:16 }}>⌨ Keyboard shortcuts</h2>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'6px 20px' }}>
              {([
                ['Ctrl+B', 'Bold'],
                ['Ctrl+I', 'Italic'],
                ['Ctrl+U', 'Underline'],
                ['Ctrl+Z', 'Undo'],
                ['Ctrl+Y', 'Redo'],
                ['Ctrl+Enter', 'Run code (in code blocks)'],
                ['Tab', 'Indent (in code blocks)'],
                ['Shift+Tab', 'Unindent (in code blocks)'],
                ['Shift+Enter', 'Exit blockquote'],
                ['Ctrl+S', 'Save lesson (browser shortcut)'],
              ] as [string, string][]).map(([key, desc]) => (
                <div key={key} style={{ display:'flex', alignItems:'center', gap:8, padding:'5px 0', borderBottom:'0.5px solid #f3f4f6' }}>
                  <kbd style={{ background:'#f3f4f6', border:'1px solid #e5e7eb', borderRadius:5, padding:'2px 7px', fontSize:11, fontFamily:'monospace', whiteSpace:'nowrap', flexShrink:0 }}>{key}</kbd>
                  <span style={{ fontSize:13, color:'#555' }}>{desc}</span>
                </div>
              ))}
            </div>
            <button onClick={() => setShowShortcuts(false)}
              style={{ marginTop:16, width:'100%', padding:'9px', background:'#f3f4f6', border:'none', borderRadius:8, fontSize:13, cursor:'pointer' }}>
              Close
            </button>
          </div>
        </div>
      )}
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