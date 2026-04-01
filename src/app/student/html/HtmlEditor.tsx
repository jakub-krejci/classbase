'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { DarkLayout, D, card, SectionLabel } from '@/components/DarkLayout'

// ── Constants ────────────────────────────────────────────────────────────────
const BUCKET       = 'web-files'
const DEFAULT_PROJ = 'Muj_projekt'
const LS_RECENT    = 'cb_html_recent'
const LS_LAST      = 'cb_html_last'

const DEFAULT_HTML = `<!DOCTYPE html>
<html lang="cs">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Můj projekt</title>
</head>
<body>
  <h1>Ahoj, světe! 👋</h1>
  <p>Začni upravovat HTML, CSS a JS...</p>
</body>
</html>`

const DEFAULT_CSS = `body {
  font-family: system-ui, sans-serif;
  max-width: 800px;
  margin: 40px auto;
  padding: 0 20px;
  background: #f9fafb;
  color: #111;
}

h1 {
  color: #7C3AED;
}`

const DEFAULT_JS = `// JavaScript kód
console.log('Ahoj z JavaScriptu!');`

// ── Storage paths ─────────────────────────────────────────────────────────────
// web-files/zaci/{uid}/{project}/index.html
function sanitizeKey(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._\-]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '') || 'projekt'
}
function fp(uid: string, proj: string, file: 'index.html' | 'style.css' | 'script.js') {
  return `zaci/${uid}/${sanitizeKey(proj)}/${file}`
}

// ── Types ────────────────────────────────────────────────────────────────────
interface WebProject {
  name: string            // display name (may have diacritics)
  key: string             // sanitized key used in storage path
  hasHtml: boolean; hasCss: boolean; hasJs: boolean
  updatedAt: string
}
interface RecentEntry { name: string; key: string; openedAt: string }

// ── Build preview HTML ────────────────────────────────────────────────────────
function buildPreview(html: string, css: string, js: string): string {
  // Inject CSS and JS into the HTML document
  const withCss = html.replace('</head>', `<style>\n${css}\n</style>\n</head>`)
  const withJs  = withCss.replace('</body>', `<script>\n${js}\n</script>\n</body>`)
  return withJs
}

export default function HtmlEditor({ profile }: { profile: any }) {
  const supabase = createClient()
  const accent   = profile?.accent_color ?? '#7C3AED'
  const uid      = profile?.id as string

  // ── Editor content ────────────────────────────────────────────────────────
  const [html, setHtml]   = useState(DEFAULT_HTML)
  const [css, setCss]     = useState(DEFAULT_CSS)
  const [js, setJs]       = useState(DEFAULT_JS)
  const [isDirty, setIsDirty] = useState(false)
  const [livePreview, setLivePreview] = useState(true)

  // ── Panels: collapsed & widths ────────────────────────────────────────────
  const [collapsed, setCollapsed] = useState<{ html: boolean; css: boolean; js: boolean }>({ html: false, css: false, js: false })
  const [panelWidths, setPanelWidths] = useState<[number, number, number]>([33, 33, 34])
  const dragging = useRef<{ panel: number; startX: number; startWidths: [number, number, number] } | null>(null)

  // ── Monaco editors ────────────────────────────────────────────────────────
  const htmlContainerRef = useRef<HTMLDivElement>(null)
  const cssContainerRef  = useRef<HTMLDivElement>(null)
  const jsContainerRef   = useRef<HTMLDivElement>(null)
  const htmlEditorRef    = useRef<any>(null)
  const cssEditorRef     = useRef<any>(null)
  const jsEditorRef      = useRef<any>(null)
  const monacoRef        = useRef<any>(null)
  const [monacoReady, setMonacoReady] = useState(false)

  // ── Projects ──────────────────────────────────────────────────────────────
  const [projects, setProjects]         = useState<WebProject[]>([])
  const [loadingProj, setLoadingProj]   = useState(true)
  const [activeProject, setActiveProject] = useState<WebProject | null>(null)
  const [recent, setRecent]             = useState<RecentEntry[]>([])
  const [expanded, setExpanded]         = useState<Set<string>>(new Set())

  // ── UI state ──────────────────────────────────────────────────────────────
  const [saving, setSaving]           = useState(false)
  const [saveMsg, setSaveMsg]         = useState('')
  const [newProjModal, setNewProjModal]   = useState(false)
  const [newProjName, setNewProjName]     = useState('')
  const [deleteProjModal, setDeleteProjModal] = useState<WebProject | null>(null)
  const [renamingProj, setRenamingProj]   = useState<WebProject | null>(null)
  const [renameVal, setRenameVal]         = useState('')
  const [openProjModal, setOpenProjModal] = useState(false)

  // ── Preview ref ───────────────────────────────────────────────────────────
  const previewRef = useRef<HTMLIFrameElement>(null)
  const previewTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Storage helpers ───────────────────────────────────────────────────────
  async function pushFile(path: string, content: string): Promise<string | null> {
    const blob = new Blob([content], { type: 'text/plain' })
    let { error } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: 'text/plain', upsert: true, cacheControl: '0' })
    if (error) {
      await supabase.storage.from(BUCKET).remove([path])
      const r2 = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: 'text/plain', cacheControl: '0' })
      if (r2.error) return r2.error.message
    }
    return null
  }

  async function fetchFile(path: string): Promise<string> {
    const { data, error } = await supabase.storage.from(BUCKET).download(path + '?t=' + Date.now())
    if (error || !data) {
      const { data: d2 } = await supabase.storage.from(BUCKET).download(path)
      if (!d2) return ''
      return await d2.text()
    }
    return await data.text()
  }

  // ── Refresh project list ──────────────────────────────────────────────────
  const refreshProjects = useCallback(async (): Promise<WebProject[]> => {
    setLoadingProj(true)
    const { data: topLevel } = await supabase.storage.from(BUCKET).list(`zaci/${uid}`, {
      limit: 200, sortBy: { column: 'name', order: 'asc' }
    })
    if (!topLevel) { setLoadingProj(false); return [] }

    const result: WebProject[] = []
    for (const item of topLevel) {
      if (item.metadata !== null && item.metadata !== undefined) continue
      if (item.name.includes('.')) continue
      const { data: files } = await supabase.storage.from(BUCKET).list(`zaci/${uid}/${item.name}`, { limit: 20 })
      const names = (files ?? []).map(f => f.name)
      result.push({
        name: item.name,
        key: item.name,
        hasHtml: names.includes('index.html'),
        hasCss:  names.includes('style.css'),
        hasJs:   names.includes('script.js'),
        updatedAt: files?.[0]?.updated_at ?? new Date().toISOString(),
      })
    }
    setProjects(result)
    setLoadingProj(false)
    return result
  }, [uid])

  // ── Monaco loader ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (typeof window === 'undefined') return
    const s = document.createElement('script')
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs/loader.min.js'
    s.onload = () => {
      const w = window as any
      w.require.config({ paths: { vs: 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs' } })
      w.require(['vs/editor/editor.main'], (monaco: any) => {
        monacoRef.current = monaco
        const common = {
          theme: 'vs-dark', fontSize: 13,
          fontFamily: "'JetBrains Mono','Fira Code',monospace",
          minimap: { enabled: false }, lineNumbers: 'on' as const, wordWrap: 'on' as const,
          automaticLayout: true, scrollBeyondLastLine: false,
          renderLineHighlight: 'line' as const, padding: { top: 12, bottom: 12 },
          bracketPairColorization: { enabled: true },
        }
        if (htmlContainerRef.current) {
          htmlEditorRef.current = monaco.editor.create(htmlContainerRef.current, { ...common, value: DEFAULT_HTML, language: 'html' })
          htmlEditorRef.current.onDidChangeModelContent(() => { setHtml(htmlEditorRef.current.getValue()); setIsDirty(true); schedulePreview() })
        }
        if (cssContainerRef.current) {
          cssEditorRef.current = monaco.editor.create(cssContainerRef.current, { ...common, value: DEFAULT_CSS, language: 'css' })
          cssEditorRef.current.onDidChangeModelContent(() => { setCss(cssEditorRef.current.getValue()); setIsDirty(true); schedulePreview() })
        }
        if (jsContainerRef.current) {
          jsEditorRef.current = monaco.editor.create(jsContainerRef.current, { ...common, value: DEFAULT_JS, language: 'javascript' })
          jsEditorRef.current.onDidChangeModelContent(() => { setJs(jsEditorRef.current.getValue()); setIsDirty(true); schedulePreview() })
        }
        setMonacoReady(true)
      })
    }
    document.head.appendChild(s)
    return () => { htmlEditorRef.current?.dispose(); cssEditorRef.current?.dispose(); jsEditorRef.current?.dispose() }
  }, [])

  // ── Init: load projects ───────────────────────────────────────────────────
  useEffect(() => {
    try { setRecent(JSON.parse(localStorage.getItem(LS_RECENT) ?? '[]')) } catch {}
    ;(async () => {
      const projs = await refreshProjects()
      const lastKey = localStorage.getItem(LS_LAST)
      if (lastKey) {
        const p = projs.find(x => x.key === lastKey)
        if (p) { await openProject(p); return }
      }
      if (projs.length > 0) await openProject(projs[0])
      else await doCreateProject(DEFAULT_PROJ, true)
    })()
  }, [])

  // ── Live preview ──────────────────────────────────────────────────────────
  function schedulePreview() {
    if (!livePreview) return
    if (previewTimeout.current) clearTimeout(previewTimeout.current)
    previewTimeout.current = setTimeout(updatePreview, 500)
  }

  function updatePreview() {
    const h = htmlEditorRef.current?.getValue() ?? html
    const c = cssEditorRef.current?.getValue() ?? css
    const j = jsEditorRef.current?.getValue() ?? js
    const preview = buildPreview(h, c, j)
    if (previewRef.current) {
      previewRef.current.srcdoc = preview
    }
  }

  useEffect(() => { if (monacoReady) updatePreview() }, [monacoReady])

  // ── Open project ──────────────────────────────────────────────────────────
  async function openProject(proj: WebProject) {
    const [h, c, j] = await Promise.all([
      proj.hasHtml ? fetchFile(fp(uid, proj.key, 'index.html')) : Promise.resolve(DEFAULT_HTML),
      proj.hasCss  ? fetchFile(fp(uid, proj.key, 'style.css'))  : Promise.resolve(DEFAULT_CSS),
      proj.hasJs   ? fetchFile(fp(uid, proj.key, 'script.js'))  : Promise.resolve(DEFAULT_JS),
    ])
    setHtml(h); setCss(c); setJs(j); setIsDirty(false)
    htmlEditorRef.current?.setValue(h)
    cssEditorRef.current?.setValue(c)
    jsEditorRef.current?.setValue(j)
    setActiveProject(proj)
    // Update preview
    setTimeout(() => {
      if (previewRef.current) previewRef.current.srcdoc = buildPreview(h, c, j)
    }, 100)
    // Recent
    const entry: RecentEntry = { name: proj.name, key: proj.key, openedAt: new Date().toISOString() }
    setRecent(prev => {
      const next = [entry, ...prev.filter(r => r.key !== proj.key)].slice(0, 3)
      try { localStorage.setItem(LS_RECENT, JSON.stringify(next)) } catch {}
      return next
    })
    try { localStorage.setItem(LS_LAST, proj.key) } catch {}
    setExpanded(prev => new Set([...prev, proj.key]))
  }

  function flash(msg: string) { setSaveMsg(msg); setTimeout(() => setSaveMsg(''), 2800) }

  // ── Save ──────────────────────────────────────────────────────────────────
  async function saveProject() {
    if (!activeProject) return
    setSaving(true)
    const h = htmlEditorRef.current?.getValue() ?? html
    const c = cssEditorRef.current?.getValue() ?? css
    const j = jsEditorRef.current?.getValue() ?? js
    const [e1, e2, e3] = await Promise.all([
      pushFile(fp(uid, activeProject.key, 'index.html'), h),
      pushFile(fp(uid, activeProject.key, 'style.css'), c),
      pushFile(fp(uid, activeProject.key, 'script.js'), j),
    ])
    if (e1 || e2 || e3) flash('❌ Chyba při ukládání')
    else { flash('✓ Uloženo'); setIsDirty(false) }
    refreshProjects()
    setSaving(false)
  }

  // ── Create project ────────────────────────────────────────────────────────
  async function doCreateProject(projName: string, silent = false) {
    const name = projName.trim() || 'Nový projekt'
    setSaving(true)
    const key = sanitizeKey(name)
    const [e1, e2, e3] = await Promise.all([
      pushFile(fp(uid, key, 'index.html'), DEFAULT_HTML),
      pushFile(fp(uid, key, 'style.css'), DEFAULT_CSS),
      pushFile(fp(uid, key, 'script.js'), DEFAULT_JS),
    ])
    if (!e1 && !e2 && !e3) {
      const projs = await refreshProjects()
      const p = projs.find(x => x.key === key)
      if (p) await openProject(p)
      if (!silent) flash('✓ Projekt vytvořen')
    } else flash('❌ Chyba')
    setNewProjModal(false); setNewProjName(''); setSaving(false)
  }

  // ── Delete project ────────────────────────────────────────────────────────
  async function doDeleteProject(proj: WebProject) {
    setSaving(true)
    await supabase.storage.from(BUCKET).remove([
      fp(uid, proj.key, 'index.html'),
      fp(uid, proj.key, 'style.css'),
      fp(uid, proj.key, 'script.js'),
    ])
    const projs = await refreshProjects()
    if (activeProject?.key === proj.key) {
      if (projs.length > 0) await openProject(projs[0])
      else { setActiveProject(null); htmlEditorRef.current?.setValue(''); cssEditorRef.current?.setValue(''); jsEditorRef.current?.setValue('') }
    }
    setDeleteProjModal(null); setSaving(false)
  }

  // ── Rename project ────────────────────────────────────────────────────────
  async function doRenameProject(proj: WebProject) {
    const newName = renameVal.trim()
    if (!newName || newName === proj.name) { setRenamingProj(null); return }
    const newKey = sanitizeKey(newName)
    setSaving(true)
    // Load all 3 files, re-upload under new key, delete old
    const [h, c, j] = await Promise.all([
      fetchFile(fp(uid, proj.key, 'index.html')),
      fetchFile(fp(uid, proj.key, 'style.css')),
      fetchFile(fp(uid, proj.key, 'script.js')),
    ])
    await Promise.all([
      pushFile(fp(uid, newKey, 'index.html'), h),
      pushFile(fp(uid, newKey, 'style.css'), c),
      pushFile(fp(uid, newKey, 'script.js'), j),
    ])
    await supabase.storage.from(BUCKET).remove([
      fp(uid, proj.key, 'index.html'),
      fp(uid, proj.key, 'style.css'),
      fp(uid, proj.key, 'script.js'),
    ])
    const projs = await refreshProjects()
    if (activeProject?.key === proj.key) {
      const renamed = projs.find(x => x.key === newKey)
      if (renamed) {
        setActiveProject(renamed)
        setRecent(prev => {
          const next = prev.map(r => r.key === proj.key ? { ...r, name: newName, key: newKey } : r)
          try { localStorage.setItem(LS_RECENT, JSON.stringify(next)) } catch {}
          return next
        })
        try { localStorage.setItem(LS_LAST, newKey) } catch {}
      }
    }
    setRenamingProj(null); setSaving(false)
  }

  // ── Download ──────────────────────────────────────────────────────────────
  function downloadHtml() {
    const h = htmlEditorRef.current?.getValue() ?? html
    const c = cssEditorRef.current?.getValue() ?? css
    const j = jsEditorRef.current?.getValue() ?? js
    const blob = new Blob([buildPreview(h, c, j)], { type: 'text/html' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = (activeProject?.name ?? 'projekt') + '.html'
    a.click()
  }

  // ── Panel drag resize ─────────────────────────────────────────────────────
  function onDividerMouseDown(e: React.MouseEvent, afterPanel: 0 | 1) {
    e.preventDefault()
    dragging.current = { panel: afterPanel, startX: e.clientX, startWidths: [...panelWidths] as [number, number, number] }
    const onMove = (ev: MouseEvent) => {
      if (!dragging.current) return
      const { panel, startX, startWidths } = dragging.current
      const totalW = (e.target as HTMLElement).closest('.editor-row')?.clientWidth ?? 1
      const delta = ((ev.clientX - startX) / totalW) * 100
      const ws: [number, number, number] = [...startWidths] as [number, number, number]
      if (panel === 0) {
        ws[0] = Math.max(10, Math.min(80, startWidths[0] + delta))
        ws[1] = Math.max(10, Math.min(80, startWidths[1] - delta))
      } else {
        ws[1] = Math.max(10, Math.min(80, startWidths[1] + delta))
        ws[2] = Math.max(10, Math.min(80, startWidths[2] - delta))
      }
      setPanelWidths(ws)
    }
    const onUp = () => { dragging.current = null; window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  function toggleCollapse(panel: 'html' | 'css' | 'js') {
    setCollapsed(prev => ({ ...prev, [panel]: !prev[panel] }))
  }

  function fmtDate(iso: string) {
    return new Date(iso).toLocaleString('cs-CZ', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
  }

  const sideBtn: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 8, padding: '8px 11px',
    background: 'rgba(255,255,255,.04)', border: `1px solid ${D.border}`,
    borderRadius: D.radiusSm, color: D.txtSec, fontSize: 12, fontWeight: 500,
    cursor: 'pointer', fontFamily: 'inherit', width: '100%', textAlign: 'left' as const, transition: 'all .15s',
  }
  const modalInp: React.CSSProperties = {
    width: '100%', padding: '10px 13px', background: D.bgMid,
    border: `1px solid ${D.border}`, borderRadius: 10, fontSize: 14,
    color: D.txtPri, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' as const,
  }

  function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
    return (
      <>
        <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.72)', zIndex: 9998, backdropFilter: 'blur(5px)' }} />
        <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', zIndex: 9999, width: '100%', maxWidth: 400, padding: '0 16px' }}>
          <div style={{ background: D.bgCard, borderRadius: D.radius, padding: '28px 24px', border: `1px solid ${D.border}`, boxShadow: '0 28px 70px rgba(0,0,0,.75)' }}>
            <div style={{ fontSize: 17, fontWeight: 800, color: D.txtPri, marginBottom: 16 }}>{title}</div>
            {children}
          </div>
        </div>
      </>
    )
  }
  function MBtns({ onOk, onCancel, label, danger, disabled }: { onOk: () => void; onCancel: () => void; label: string; danger?: boolean; disabled?: boolean }) {
    return (
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={onOk} disabled={disabled || saving}
          style={{ flex: 1, padding: '10px', background: danger ? D.danger : accent, color: '#fff', border: 'none', borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: disabled || saving ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: disabled || saving ? .4 : 1 }}>
          {saving ? '…' : label}
        </button>
        <button onClick={onCancel} style={{ padding: '10px 14px', background: D.bgMid, color: D.txtSec, border: `1px solid ${D.border}`, borderRadius: 9, cursor: 'pointer', fontFamily: 'inherit' }}>Zrušit</button>
      </div>
    )
  }

  const PANEL_COLORS = { html: '#E34C26', css: '#264DE4', js: '#F7DF1E' }
  const PANEL_LABELS = { html: 'HTML', css: 'CSS', js: 'JavaScript' }

  return (
    <DarkLayout profile={profile} activeRoute="/student/html">

      {/* ── Modals ── */}
      {newProjModal && (
        <Modal title="🌐 Nový projekt" onClose={() => setNewProjModal(false)}>
          <p style={{ fontSize: 13, color: D.txtSec, marginBottom: 12 }}>Název projektu — automaticky se vytvoří soubory HTML, CSS a JS</p>
          <input value={newProjName} onChange={e => setNewProjName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && newProjName.trim() && doCreateProject(newProjName)}
            autoFocus placeholder="Můj web"
            style={{ ...modalInp, marginBottom: 14 }} />
          <MBtns onOk={() => doCreateProject(newProjName)} onCancel={() => setNewProjModal(false)} label="Vytvořit" disabled={!newProjName.trim()} />
        </Modal>
      )}

      {deleteProjModal && (
        <Modal title="🗑 Smazat projekt" onClose={() => setDeleteProjModal(null)}>
          <p style={{ fontSize: 13, color: D.txtSec, marginBottom: 6, lineHeight: 1.6 }}>
            Smazat projekt <strong style={{ color: D.txtPri }}>{deleteProjModal.name}</strong> včetně všech souborů?
          </p>
          <p style={{ fontSize: 12, color: D.danger, marginBottom: 18 }}>Tato akce je nevratná.</p>
          <MBtns onOk={() => doDeleteProject(deleteProjModal)} onCancel={() => setDeleteProjModal(null)} label="Smazat projekt" danger />
        </Modal>
      )}

      {renamingProj && (
        <Modal title="✏ Přejmenovat projekt" onClose={() => setRenamingProj(null)}>
          <p style={{ fontSize: 13, color: D.txtSec, marginBottom: 12 }}>Nový název projektu</p>
          <input value={renameVal} onChange={e => setRenameVal(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && renameVal.trim() && doRenameProject(renamingProj)}
            autoFocus placeholder={renamingProj.name}
            style={{ ...modalInp, marginBottom: 14 }} />
          <MBtns onOk={() => doRenameProject(renamingProj)} onCancel={() => setRenamingProj(null)} label="Přejmenovat" disabled={!renameVal.trim()} />
        </Modal>
      )}

      {openProjModal && (
        <Modal title="📂 Otevřít projekt" onClose={() => setOpenProjModal(false)}>
          <div style={{ maxHeight: 380, overflowY: 'auto' }}>
            {loadingProj
              ? <div style={{ fontSize: 13, color: D.txtSec, textAlign: 'center', padding: '20px 0' }}>Načítám…</div>
              : projects.length === 0
                ? <div style={{ fontSize: 13, color: D.txtSec }}>Žádné projekty.</div>
                : projects.map(proj => (
                    <div key={proj.key} onClick={() => { openProject(proj); setOpenProjModal(false) }}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 8, cursor: 'pointer', marginBottom: 4, background: proj.key === activeProject?.key ? accent+'15' : 'transparent' }}
                      className="html-row">
                      <span style={{ fontSize: 18 }}>🌐</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: proj.key === activeProject?.key ? accent : D.txtPri }}>{proj.name}</div>
                        <div style={{ fontSize: 10, color: D.txtSec }}>HTML · CSS · JS · {fmtDate(proj.updatedAt)}</div>
                      </div>
                    </div>
                  ))
            }
          </div>
          <div style={{ marginTop: 14 }}>
            <button onClick={() => setOpenProjModal(false)} style={{ width: '100%', padding: '10px', background: D.bgMid, color: D.txtSec, border: `1px solid ${D.border}`, borderRadius: 9, cursor: 'pointer', fontFamily: 'inherit' }}>Zavřít</button>
          </div>
        </Modal>
      )}

      <style>{`
        .html-sb:hover { background: rgba(255,255,255,.08) !important; color: #fff !important; }
        .html-row { transition: background .12s; }
        .html-row:hover { background: rgba(255,255,255,.05) !important; }
        .html-row:hover .html-acts { opacity: 1 !important; }
        .divider { width: 5px; background: transparent; cursor: col-resize; flex-shrink: 0; transition: background .15s; position: relative; z-index: 1; }
        .divider:hover, .divider:active { background: ${accent}60 !important; }
        @keyframes spin { to { transform: rotate(360deg) } }
      `}</style>

      {/* ── Page header ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18, flexWrap: 'wrap' }}>
        <div style={{ width: 40, height: 40, borderRadius: 11, background: '#E34C2615', border: `1px solid #E34C2620`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <img src="/icons/html.png" alt="HTML" style={{ width: 24, height: 24, objectFit: 'contain' }} onError={e => { (e.target as HTMLImageElement).style.display='none' }} />
        </div>
        <div>
          <h1 style={{ fontSize: 19, fontWeight: 800, color: D.txtPri, margin: '0 0 2px' }}>HTML Editor</h1>
          <p style={{ fontSize: 11, color: D.txtSec, margin: 0 }}>HTML · CSS · JavaScript editor s real-time náhledem</p>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          {saveMsg && <span style={{ fontSize: 12, color: saveMsg.startsWith('❌') ? D.danger : D.success, fontWeight: 600 }}>{saveMsg}</span>}
          {isDirty && !saveMsg && <span style={{ fontSize: 11, color: D.warning }}>● neuloženo</span>}
          {/* Live preview toggle */}
          <button onClick={() => { setLivePreview(p => !p) }}
            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', background: livePreview ? accent+'20' : 'rgba(255,255,255,.05)', color: livePreview ? accent : D.txtSec, border: `1px solid ${livePreview ? accent+'40' : D.border}`, borderRadius: 20, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>
            {livePreview ? '⚡ Live' : '⏸ Pauza'}
          </button>
        </div>
      </div>

      {/* ── 2-col: sidebar + main ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 14, height: 'calc(100vh - 200px)', minHeight: 600, alignItems: 'start' }}>

        {/* ══ LEFT: Sidebar ══ */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, height: '100%', overflowY: 'auto' }}>

          {/* File actions */}
          <div style={card({ padding: '13px' })}>
            <SectionLabel>Projekty</SectionLabel>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <button className="html-sb" style={sideBtn} onClick={() => setNewProjModal(true)}>
                <span>🌐</span> Nový projekt
              </button>
              <button className="html-sb" style={sideBtn} onClick={() => { setOpenProjModal(true); refreshProjects() }}>
                <span>📂</span> Otevřít projekt
              </button>
              <div style={{ height: 1, background: D.border, margin: '3px 0' }} />
              <button className="html-sb" style={{ ...sideBtn, opacity: !activeProject || saving ? .4 : 1 }}
                onClick={saveProject} disabled={!activeProject || saving}>
                <span>💾</span> Uložit projekt
              </button>
              <button className="html-sb" style={{ ...sideBtn, opacity: !activeProject ? .4 : 1 }}
                onClick={downloadHtml} disabled={!activeProject}>
                <span>⬇️</span> Stáhnout HTML
              </button>
              <button className="html-sb" style={{ ...sideBtn, opacity: !livePreview ? 1 : .4 }}
                onClick={updatePreview}>
                <span>▶</span> Obnovit náhled
              </button>
            </div>
          </div>

          {/* Recent */}
          <div style={card({ padding: '13px' })}>
            <SectionLabel>Nedávné projekty</SectionLabel>
            {recent.length === 0
              ? <div style={{ fontSize: 12, color: D.txtSec }}>Žádné nedávné projekty</div>
              : recent.map(r => (
                  <div key={r.key} className="html-row"
                    onClick={() => { const p = projects.find(x => x.key === r.key); if (p) openProject(p) }}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 7px', borderRadius: D.radiusSm, cursor: 'pointer', background: r.key === activeProject?.key ? accent+'15' : 'transparent', marginBottom: 2 }}>
                    <span style={{ fontSize: 14 }}>🌐</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: r.key === activeProject?.key ? accent : D.txtPri, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</div>
                      <div style={{ fontSize: 10, color: D.txtSec }}>{fmtDate(r.openedAt)}</div>
                    </div>
                  </div>
                ))
            }
          </div>

          {/* Projects tree */}
          <div style={{ ...card({ padding: '13px' }), flex: 1 }}>
            <SectionLabel>Moje projekty</SectionLabel>
            {loadingProj
              ? <div style={{ fontSize: 12, color: D.txtSec, display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0' }}>
                  <div style={{ width: 14, height: 14, border: `2px solid ${D.border}`, borderTopColor: accent, borderRadius: '50%', animation: 'spin .6s linear infinite' }} />Načítám…
                </div>
              : projects.length === 0
                ? <div style={{ fontSize: 12, color: D.txtSec }}>Žádné projekty</div>
                : projects.map(proj => (
                    <div key={proj.key} style={{ marginBottom: 4 }}>
                      {/* Project header */}
                      <div className="html-row"
                        style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 6px', borderRadius: 7, background: proj.key === activeProject?.key ? accent+'12' : 'transparent' }}>
                        <div onClick={() => { toggleExpand(proj.key); openProject(proj) }}
                          style={{ display: 'flex', alignItems: 'center', gap: 5, flex: 1, cursor: 'pointer' }}>
                          <span style={{ fontSize: 9, color: D.txtSec, display: 'inline-block', transform: expanded.has(proj.key) ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }}>▶</span>
                          <span style={{ fontSize: 14 }}>🌐</span>
                          <span style={{ fontSize: 12, fontWeight: 700, color: proj.key === activeProject?.key ? accent : D.txtPri, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{proj.name}</span>
                        </div>
                        <div className="html-acts" style={{ display: 'flex', gap: 1, opacity: 0, flexShrink: 0 }}>
                          <button onClick={e => { e.stopPropagation(); setRenamingProj(proj); setRenameVal(proj.name) }}
                            style={{ padding: '2px 5px', background: 'none', border: 'none', cursor: 'pointer', color: D.txtSec, fontSize: 11, borderRadius: 4 }} title="Přejmenovat">✏</button>
                          <button onClick={e => { e.stopPropagation(); setDeleteProjModal(proj) }}
                            style={{ padding: '2px 5px', background: 'none', border: 'none', cursor: 'pointer', color: D.danger, fontSize: 11, borderRadius: 4 }} title="Smazat">🗑</button>
                        </div>
                      </div>
                      {/* File list */}
                      {expanded.has(proj.key) && (
                        <div style={{ marginLeft: 20, marginTop: 2 }}>
                          {(['html', 'css', 'js'] as const).map(ext => {
                            const exists = ext === 'html' ? proj.hasHtml : ext === 'css' ? proj.hasCss : proj.hasJs
                            const fname  = ext === 'html' ? 'index.html' : ext === 'css' ? 'style.css' : 'script.js'
                            const color  = PANEL_COLORS[ext]
                            return (
                              <div key={ext} onClick={() => openProject(proj)}
                                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 7px', borderRadius: 6, cursor: 'pointer', marginBottom: 1, opacity: exists ? 1 : .4 }}>
                                <div style={{ width: 6, height: 6, borderRadius: '50%', background: color, flexShrink: 0 }} />
                                <span style={{ fontSize: 11, color: D.txtSec, fontFamily: 'monospace' }}>{fname}</span>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  ))
            }
          </div>
        </div>

        {/* ══ RIGHT: Editors + Preview ══ */}
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 0 }}>

          {/* Toolbar */}
          <div style={{ background: D.bgCard, border: `1px solid ${D.border}`, borderRadius: `${D.radius} ${D.radius} 0 0`, borderBottomWidth: 0, display: 'flex', alignItems: 'center', gap: 8, padding: '9px 14px', flexShrink: 0, flexWrap: 'wrap' as const }}>
            {/* Active project breadcrumb */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
              <span style={{ color: D.txtSec }}>🌐</span>
              <span style={{ color: D.txtPri, fontWeight: 600 }}>{activeProject?.name ?? '—'}</span>
              {isDirty && <span style={{ color: D.warning, fontSize: 10 }}>●</span>}
            </div>
            {/* Panel toggles */}
            <div style={{ display: 'flex', gap: 4 }}>
              {(['html', 'css', 'js'] as const).map(p => (
                <button key={p} onClick={() => toggleCollapse(p)}
                  style={{ padding: '3px 10px', borderRadius: 20, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 11, fontWeight: 600, background: collapsed[p] ? 'rgba(255,255,255,.06)' : PANEL_COLORS[p]+'25', color: collapsed[p] ? D.txtSec : PANEL_COLORS[p], transition: 'all .15s' }}>
                  {collapsed[p] ? '+ ' : ''}{PANEL_LABELS[p]}
                </button>
              ))}
            </div>
            <div style={{ flex: 1 }} />
            <button onClick={downloadHtml} disabled={!activeProject}
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', background: 'rgba(255,255,255,.04)', color: D.txtSec, border: `1px solid ${D.border}`, borderRadius: 7, fontSize: 12, cursor: activeProject ? 'pointer' : 'not-allowed', fontFamily: 'inherit', opacity: activeProject ? 1 : .4 }}>
              ⬇️ Stáhnout
            </button>
            <button onClick={() => { setLivePreview(p => !p) }}
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', background: livePreview ? accent+'18' : 'rgba(255,255,255,.04)', color: livePreview ? accent : D.txtSec, border: `1px solid ${livePreview ? accent+'30' : D.border}`, borderRadius: 7, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>
              {livePreview ? '⚡ Live' : '⏸ Live'}
            </button>
            <button onClick={saveProject} disabled={!activeProject || saving}
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 13px', background: isDirty ? accent+'20' : 'rgba(255,255,255,.04)', color: isDirty ? accent : D.txtSec, border: `1px solid ${isDirty ? accent+'40' : D.border}`, borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', transition: 'all .2s', opacity: !activeProject || saving ? .4 : 1 }}>
              {saving ? '…' : '💾 Uložit'}
            </button>
          </div>

          {/* Editor row */}
          <div className="editor-row" style={{ display: 'flex', height: '55%', minHeight: 280, border: `1px solid ${D.border}`, borderTop: 'none', background: '#1E1E1E' }}>
            {(['html', 'css', 'js'] as const).map((panel, idx) => {
              const ref = panel === 'html' ? htmlContainerRef : panel === 'css' ? cssContainerRef : jsContainerRef
              const color = PANEL_COLORS[panel]
              const label = PANEL_LABELS[panel]
              const col = collapsed[panel]
              return (
                <>
                  <div key={panel} style={{ display: 'flex', flexDirection: 'column', width: col ? '32px' : `${panelWidths[idx]}%`, minWidth: col ? 32 : 60, flexShrink: 0, transition: col ? 'width .2s' : 'none', overflow: 'hidden', borderRight: idx < 2 ? `1px solid rgba(255,255,255,.08)` : 'none' }}>
                    {/* Panel header */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', background: '#252526', borderBottom: `2px solid ${color}`, flexShrink: 0, cursor: col ? 'pointer' : 'default' }} onClick={() => col && toggleCollapse(panel)}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
                      {!col && <span style={{ fontSize: 11, fontWeight: 700, color, textTransform: 'uppercase', letterSpacing: '.06em' }}>{label}</span>}
                      <div style={{ flex: 1 }} />
                      <button onClick={e => { e.stopPropagation(); toggleCollapse(panel) }}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: D.txtSec, fontSize: 13, padding: '0 2px', lineHeight: 1 }} title={col ? 'Rozbalit' : 'Sbalit'}>
                        {col ? '→' : '←'}
                      </button>
                    </div>
                    {!col && <div ref={ref} style={{ flex: 1, overflow: 'hidden' }} />}
                  </div>
                  {idx < 2 && !col && (
                    <div className="divider" onMouseDown={e => onDividerMouseDown(e, idx as 0 | 1)}
                      style={{ width: 5, background: 'transparent', cursor: 'col-resize', flexShrink: 0 }} />
                  )}
                </>
              )
            })}
          </div>

          {/* Preview */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', border: `1px solid ${D.border}`, borderTop: 'none', borderRadius: `0 0 ${D.radius} ${D.radius}`, overflow: 'hidden', minHeight: 160 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', background: D.bgCard, borderBottom: `1px solid ${D.border}`, flexShrink: 0 }}>
              <div style={{ display: 'flex', gap: 5 }}>
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#FF5F56' }} />
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#FFBD2E' }} />
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#27C93F' }} />
              </div>
              <span style={{ fontSize: 11, color: D.txtSec, flex: 1, textAlign: 'center' as const }}>
                {activeProject ? `${activeProject.name} — náhled` : 'Náhled'}
              </span>
              {!livePreview && (
                <button onClick={updatePreview}
                  style={{ padding: '3px 10px', background: accent+'20', color: accent, border: `1px solid ${accent}30`, borderRadius: 6, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>
                  ▶ Obnovit
                </button>
              )}
            </div>
            <iframe
              ref={previewRef}
              sandbox="allow-scripts"
              style={{ flex: 1, border: 'none', background: '#fff' }}
              title="HTML Preview"
            />
          </div>
        </div>
      </div>
    </DarkLayout>
  )

  function toggleExpand(key: string) {
    setExpanded(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n })
  }
}
