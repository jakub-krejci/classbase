'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { runPython } from '@/lib/pyodide-runner'
import { DarkLayout, D, card, SectionLabel } from '@/components/DarkLayout'

// ── Constants ────────────────────────────────────────────────────────────────
const BUCKET       = 'python-files'
const DEFAULT_PROJ = 'Výchozí'
const DEFAULT_CODE = `# Vítej v ClassBase Python editoru! 🐍\nprint("Ahoj, světe!")\n`
const LS_RECENT    = 'cb_py_recent'
const LS_LAST      = 'cb_py_last'

// zaci/{uid}/{project}/{filename}
function fp(uid: string, proj: string, name: string) {
  return `zaci/${uid}/${proj}/${name}`
}

interface PyFile     { path: string; name: string; project: string; size?: number; updatedAt: string }
interface Project    { name: string; files: PyFile[] }
interface RecentEntry{ path: string; name: string; project: string; openedAt: string }

export default function PythonEditor({ profile }: { profile: any }) {
  const supabase = createClient()
  const accent   = profile?.accent_color ?? '#7C3AED'
  const uid      = profile?.id as string

  // ── State ──────────────────────────────────────────────────────────────────
  const [projects, setProjects]   = useState<Project[]>([])
  const [loadingProj, setLoadingProj] = useState(true)
  const [activeFile, setActiveFile]   = useState<PyFile | null>(null)
  const [isDirty, setIsDirty]     = useState(false)
  const [recent, setRecent]       = useState<RecentEntry[]>([])
  const [expanded, setExpanded]   = useState<Set<string>>(new Set([DEFAULT_PROJ]))

  const editorRef    = useRef<any>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [monacoReady, setMonacoReady] = useState(false)

  const [running, setRunning]     = useState(false)
  const [pyStatus, setPyStatus]   = useState('')
  const [outputLines, setOutputLines] = useState<string[]>([])
  const [runError, setRunError]   = useState<string | null>(null)
  const [figures, setFigures]     = useState<string[]>([])
  const [hasRun, setHasRun]       = useState(false)

  // input() modal
  const [inputPrompt, setInputPrompt]   = useState('')
  const [inputValue, setInputValue]     = useState('')
  const [inputResolve, setInputResolve] = useState<((v: string | null) => void) | null>(null)

  const [saving, setSaving]       = useState(false)
  const [saveMsg, setSaveMsg]     = useState('')
  const [renaming, setRenaming]   = useState<{ path: string; val: string } | null>(null)
  const [renamingBreadcrumb, setRenamingBreadcrumb] = useState(false)
  const [breadcrumbVal, setBreadcrumbVal] = useState('')
  const [deleteFileModal, setDeleteFileModal] = useState<PyFile | null>(null)
  const [deleteProjModal, setDeleteProjModal] = useState<string | null>(null)
  const [newFileModal, setNewFileModal]     = useState(false)
  const [newFileName, setNewFileName]       = useState('')
  const [newFileProj, setNewFileProj]       = useState(DEFAULT_PROJ)
  const [saveAsModal, setSaveAsModal]       = useState(false)
  const [saveAsName, setSaveAsName]         = useState('')
  const [saveAsProj, setSaveAsProj]         = useState('')
  const [newProjModal, setNewProjModal]     = useState(false)
  const [newProjName, setNewProjName]       = useState('')
  const [openProjModal, setOpenProjModal]   = useState(false)

  // ── Supabase helpers ───────────────────────────────────────────────────────
  // Save a file — pure upsert, no pre-delete (pre-delete caused races)
  async function pushContent(path: string, content: string): Promise<string | null> {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
    // First attempt: upsert
    let { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
      contentType: 'text/plain',
      upsert: true,
      cacheControl: '0',
    })
    if (error) {
      // If error is "already exists" style (row-level duplicate), remove then re-upload
      await supabase.storage.from(BUCKET).remove([path])
      const res2 = await supabase.storage.from(BUCKET).upload(path, blob, {
        contentType: 'text/plain',
        cacheControl: '0',
      })
      if (res2.error) return res2.error.message
    }
    return null
  }

  async function fetchContent(path: string): Promise<string> {
    // Add cache-busting query to avoid browser caching old content
    const { data, error } = await supabase.storage.from(BUCKET).download(path + '?t=' + Date.now())
    if (error || !data) {
      // Try without query param (some clients strip it)
      const { data: d2, error: e2 } = await supabase.storage.from(BUCKET).download(path)
      if (e2 || !d2) return ''
      return await d2.text()
    }
    return await data.text()
  }

  // ── Refresh project tree ───────────────────────────────────────────────────
  const refreshProjects = useCallback(async (): Promise<Project[]> => {
    setLoadingProj(true)
    const { data: topLevel } = await supabase.storage.from(BUCKET).list(`zaci/${uid}`, {
      limit: 200, sortBy: { column: 'name', order: 'asc' }
    })
    if (!topLevel) { setLoadingProj(false); return [] }

    const result: Project[] = []
    for (const item of topLevel) {
      // Skip: items that look like files (have metadata with size), or non-folder placeholders
      // In Supabase storage, folder entries have metadata === null
      if (item.metadata !== null && item.metadata !== undefined) continue
      // Only process items that look like directory names (not .py files at root)
      if (item.name.endsWith('.py') || item.name.includes('.')) continue

      const { data: files } = await supabase.storage.from(BUCKET).list(`zaci/${uid}/${item.name}`, {
        limit: 200, sortBy: { column: 'updated_at', order: 'desc' }
      })
      const pyFiles: PyFile[] = (files ?? [])
        .filter(f => f.name.endsWith('.py') && f.metadata !== null)
        .map(f => ({
          path: fp(uid, item.name, f.name),
          name: f.name,
          project: item.name,
          size: f.metadata?.size,
          updatedAt: f.updated_at ?? new Date().toISOString(),
        }))
      result.push({ name: item.name, files: pyFiles })
    }
    setProjects(result)
    setLoadingProj(false)
    return result
  }, [uid])

  // ── Monaco ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (typeof window === 'undefined') return
    const s = document.createElement('script')
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs/loader.min.js'
    s.onload = () => {
      const w = window as any
      w.require.config({ paths: { vs: 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs' } })
      w.require(['vs/editor/editor.main'], (monaco: any) => {
        if (!containerRef.current || editorRef.current) return
        const ed = monaco.editor.create(containerRef.current, {
          value: DEFAULT_CODE, language: 'python', theme: 'vs-dark',
          fontSize: 14, fontFamily: "'JetBrains Mono','Fira Code',monospace",
          fontLigatures: true, minimap: { enabled: false }, lineNumbers: 'on',
          wordWrap: 'on', automaticLayout: true, scrollBeyondLastLine: false,
          renderLineHighlight: 'line', cursorBlinking: 'smooth', smoothScrolling: true,
          padding: { top: 16, bottom: 16 }, bracketPairColorization: { enabled: true },
        })
        editorRef.current = ed
        ed.onDidChangeModelContent(() => setIsDirty(true))
        ed.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => document.getElementById('py-run-btn')?.click())
        ed.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => document.getElementById('py-save-btn')?.click())
        setMonacoReady(true)
      })
    }
    document.head.appendChild(s)
    return () => { editorRef.current?.dispose() }
  }, [])

  // ── Register input() handler on window for pyodide ────────────────────────
  useEffect(() => {
    ;(window as any).__cb_input = (prompt: string) =>
      new Promise<string | null>(resolve => {
        setInputPrompt(prompt)
        setInputValue('')
        setInputResolve(() => resolve)
      })
    return () => { delete (window as any).__cb_input }
  }, [])

  // ── Init ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    try {
      const r = JSON.parse(localStorage.getItem(LS_RECENT) ?? '[]')
      setRecent(r)
    } catch {}
    ;(async () => {
      const projs = await refreshProjects()
      const lastPath = localStorage.getItem(LS_LAST)
      if (lastPath) {
        for (const p of projs) {
          const f = p.files.find(x => x.path === lastPath)
          if (f) { await openFile(f); return }
        }
      }
      if (projs.length > 0 && projs[0].files.length > 0) {
        await openFile(projs[0].files[0])
      } else {
        await doCreateProject(DEFAULT_PROJ, true)
      }
    })()
  }, [])

  // ── File operations ────────────────────────────────────────────────────────
  async function openFile(file: PyFile) {
    const content = await fetchContent(file.path)
    setActiveFile(file)
    setIsDirty(false)
    editorRef.current?.setValue(content)
    clearOutput()
    const entry: RecentEntry = { path: file.path, name: file.name, project: file.project, openedAt: new Date().toISOString() }
    setRecent(prev => {
      const next = [entry, ...prev.filter(r => r.path !== file.path)].slice(0, 3)
      try { localStorage.setItem(LS_RECENT, JSON.stringify(next)) } catch {}
      return next
    })
    try { localStorage.setItem(LS_LAST, file.path) } catch {}
    setExpanded(prev => new Set([...prev, file.project]))
  }

  function clearOutput() {
    setHasRun(false); setOutputLines([]); setRunError(null); setFigures([])
  }

  function flash(msg: string) {
    setSaveMsg(msg); setTimeout(() => setSaveMsg(''), 2800)
  }

  async function saveCurrentFile() {
    if (!activeFile) return
    setSaving(true)
    const content = editorRef.current?.getValue() ?? ''
    const err = await pushContent(activeFile.path, content)
    if (err) flash('❌ ' + err)
    else { flash('✓ Uloženo'); setIsDirty(false) }
    setSaving(false)
    refreshProjects()  // non-blocking refresh
  }

  async function doSaveAs() {
    let name = saveAsName.trim()
    if (!name) return
    if (!name.endsWith('.py')) name += '.py'
    const proj = saveAsProj || activeFile?.project || DEFAULT_PROJ
    setSaving(true)
    const content = editorRef.current?.getValue() ?? ''
    const path = fp(uid, proj, name)
    const err = await pushContent(path, content)
    if (!err) {
      flash('✓ Uloženo jako ' + name)
      const projs = await refreshProjects()
      const newF = projs.flatMap(p => p.files).find(f => f.path === path)
      if (newF) await openFile(newF)
    } else flash('❌ ' + err)
    setSaveAsModal(false); setSaveAsName(''); setSaving(false)
  }

  async function doNewFile() {
    let name = newFileName.trim() || 'nový_skript'
    if (!name.endsWith('.py')) name += '.py'
    const proj = newFileProj || DEFAULT_PROJ
    setSaving(true)
    const path = fp(uid, proj, name)
    const err = await pushContent(path, DEFAULT_CODE)
    if (!err) {
      const projs = await refreshProjects()
      const newF = projs.flatMap(p => p.files).find(f => f.path === path)
      if (newF) await openFile(newF)
    } else flash('❌ ' + err)
    setNewFileModal(false); setNewFileName(''); setSaving(false)
  }

  async function doCreateProject(projName: string, silent = false) {
    const name = projName.trim() || 'Nový projekt'
    const path = fp(uid, name, 'main.py')
    setSaving(true)
    const err = await pushContent(path, DEFAULT_CODE)
    if (!err) {
      const projs = await refreshProjects()
      const proj = projs.find(p => p.name === name)
      if (proj?.files[0]) await openFile(proj.files[0])
      if (!silent) flash('✓ Projekt vytvořen')
    } else flash('❌ ' + err)
    setNewProjModal(false); setNewProjName(''); setSaving(false)
  }

  async function doRenameFile(file: PyFile, newName: string) {
    if (!newName.trim() || newName === file.name.replace(/\.py$/, '')) { setRenaming(null); setRenamingBreadcrumb(false); return }
    let nn = newName.trim()
    if (!nn.endsWith('.py')) nn += '.py'
    setSaving(true)
    const content = await fetchContent(file.path)
    const newPath = fp(uid, file.project, nn)
    const err = await pushContent(newPath, content)
    if (!err) {
      await supabase.storage.from(BUCKET).remove([file.path])
      const projs = await refreshProjects()
      if (activeFile?.path === file.path) {
        const renamed = projs.flatMap(p => p.files).find(f => f.path === newPath)
        if (renamed) {
          setActiveFile(renamed)
          setRecent(prev => {
            const next = prev.map(r => r.path === file.path ? { ...r, path: newPath, name: nn } : r)
            try { localStorage.setItem(LS_RECENT, JSON.stringify(next)) } catch {}
            return next
          })
          try { localStorage.setItem(LS_LAST, newPath) } catch {}
        }
      }
    } else flash('❌ ' + err)
    setRenaming(null); setRenamingBreadcrumb(false); setSaving(false)
  }

  async function doDeleteFile(file: PyFile) {
    setSaving(true)
    await supabase.storage.from(BUCKET).remove([file.path])
    const projs = await refreshProjects()
    if (activeFile?.path === file.path) {
      const all = projs.flatMap(p => p.files)
      if (all.length > 0) await openFile(all[0])
      else { setActiveFile(null); editorRef.current?.setValue('') }
    }
    setRecent(prev => { const n = prev.filter(r => r.path !== file.path); try { localStorage.setItem(LS_RECENT, JSON.stringify(n)) } catch {}; return n })
    setDeleteFileModal(null); setSaving(false)
  }

  async function doDeleteProject(projName: string) {
    setSaving(true)
    // Delete all files in the project
    const proj = projects.find(p => p.name === projName)
    if (proj?.files.length) {
      await supabase.storage.from(BUCKET).remove(proj.files.map(f => f.path))
    }
    const projs = await refreshProjects()
    if (activeFile?.project === projName) {
      const all = projs.flatMap(p => p.files)
      if (all.length > 0) await openFile(all[0])
      else { setActiveFile(null); editorRef.current?.setValue('') }
    }
    setDeleteProjModal(null); setSaving(false)
  }

  // ── Download ──────────────────────────────────────────────────────────────
  function downloadFile() {
    const content = editorRef.current?.getValue() ?? ''
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([content], { type: 'text/x-python' }))
    a.download = activeFile?.name ?? 'skript.py'; a.click()
  }

  // ── Run Python ────────────────────────────────────────────────────────────
  async function runCode() {
    setRunning(true); clearOutput(); setHasRun(true)
    const code = editorRef.current?.getValue() ?? ''
    const lines: string[] = []
    try {
      const result = await runPython(code,
        (l: string) => { lines.push(l); setOutputLines([...lines]) },
        (s: string) => setPyStatus(s)
      )
      setOutputLines(result.output ? result.output.split('\n') : lines)
      setRunError(result.error); setFigures(result.images ?? [])
    } catch (e: any) { setRunError(String(e)) }
    setRunning(false); setPyStatus('')
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  function fmtDate(iso: string) {
    return new Date(iso).toLocaleString('cs-CZ', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
  }
  function fmtSize(b?: number) {
    if (!b) return ''; return b < 1024 ? `${b}B` : `${(b/1024).toFixed(1)}kB`
  }
  function toggleExpand(name: string) {
    setExpanded(prev => { const n = new Set(prev); n.has(name) ? n.delete(name) : n.add(name); return n })
  }

  // ── Styles ────────────────────────────────────────────────────────────────
  const sideBtn: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 8, padding: '8px 11px',
    background: 'rgba(255,255,255,.04)', border: `1px solid ${D.border}`,
    borderRadius: D.radiusSm, color: D.txtSec, fontSize: 12, fontWeight: 500,
    cursor: 'pointer', fontFamily: 'inherit', width: '100%', textAlign: 'left' as const, transition: 'all .15s',
  }
  const modalInp: React.CSSProperties = {
    width: '100%', padding: '10px 13px', background: D.bgMid,
    border: `1px solid ${D.border}`, borderRadius: 10, fontSize: 14,
    color: D.txtPri, fontFamily: 'monospace', outline: 'none', boxSizing: 'border-box' as const,
  }
  const projSel: React.CSSProperties = {
    width: '100%', padding: '8px 10px', background: D.bgMid,
    border: `1px solid ${D.border}`, borderRadius: 8, fontSize: 13,
    color: D.txtPri, fontFamily: 'inherit', outline: 'none', marginTop: 8,
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

  return (
    <DarkLayout profile={profile} activeRoute="/student/python">

      {/* ── input() modal ── */}
      {inputResolve && (
        <>
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.72)', zIndex: 9998, backdropFilter: 'blur(5px)' }} />
          <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', zIndex: 9999, width: '100%', maxWidth: 400, padding: '0 16px' }}>
            <div style={{ background: D.bgCard, borderRadius: D.radius, padding: '28px 24px', border: `1px solid ${D.border}`, boxShadow: '0 28px 70px rgba(0,0,0,.75)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: accent + '20', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>🐍</div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: D.txtPri }}>Vstup programu</div>
                  <div style={{ fontSize: 11, color: D.txtSec }}>Python čeká na váš vstup</div>
                </div>
              </div>
              {inputPrompt && (
                <div style={{ fontFamily: 'monospace', fontSize: 13, color: accent, background: accent + '12', border: `1px solid ${accent}25`, borderRadius: 8, padding: '8px 12px', marginBottom: 12 }}>
                  {inputPrompt}
                </div>
              )}
              <input
                autoFocus
                value={inputValue}
                onChange={e => setInputValue(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    const r = inputResolve; setInputResolve(null)
                    r(inputValue)
                  }
                  if (e.key === 'Escape') {
                    const r = inputResolve; setInputResolve(null)
                    r(null)
                  }
                }}
                placeholder="Zadejte vstup…"
                style={{ ...modalInp, fontFamily: 'monospace', marginBottom: 14 }}
              />
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => { const r = inputResolve; setInputResolve(null); r(inputValue) }}
                  style={{ flex: 1, padding: '10px', background: accent, color: '#fff', border: 'none', borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                  ↵ Potvrdit
                </button>
                <button
                  onClick={() => { const r = inputResolve; setInputResolve(null); r(null) }}
                  style={{ padding: '10px 14px', background: D.bgMid, color: D.txtSec, border: `1px solid ${D.border}`, borderRadius: 9, cursor: 'pointer', fontFamily: 'inherit' }}>
                  Zrušit
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── Modals ── */}
      {newProjModal && (
        <Modal title="📁 Nový projekt" onClose={() => setNewProjModal(false)}>
          <p style={{ fontSize: 13, color: D.txtSec, marginBottom: 12 }}>Název projektu — automaticky se vytvoří soubor main.py</p>
          <input value={newProjName} onChange={e => setNewProjName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && newProjName.trim() && doCreateProject(newProjName)} autoFocus placeholder="Můj projekt"
            style={{ ...modalInp, marginBottom: 14 }} />
          <MBtns onOk={() => doCreateProject(newProjName)} onCancel={() => setNewProjModal(false)} label="Vytvořit" disabled={!newProjName.trim()} />
        </Modal>
      )}

      {openProjModal && (
        <Modal title="📂 Otevřít soubor" onClose={() => setOpenProjModal(false)}>
          <div style={{ maxHeight: 360, overflowY: 'auto' }}>
            {loadingProj
              ? <div style={{ fontSize: 13, color: D.txtSec, textAlign: 'center', padding: '20px 0' }}>Načítám…</div>
              : projects.map(proj => (
                  <div key={proj.name} style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: D.txtSec, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6 }}>📁 {proj.name}</div>
                    {proj.files.length === 0
                      ? <div style={{ fontSize: 12, color: D.txtSec, paddingLeft: 16 }}>Prázdný projekt</div>
                      : proj.files.map(f => (
                          <div key={f.path} onClick={() => { openFile(f); setOpenProjModal(false) }}
                            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px 8px 20px', borderRadius: 8, cursor: 'pointer', marginBottom: 2, background: f.path === activeFile?.path ? accent+'15' : 'transparent' }}
                            className="py-row">
                            <span>🐍</span>
                            <span style={{ fontSize: 13, color: f.path === activeFile?.path ? accent : D.txtPri, fontWeight: f.path === activeFile?.path ? 600 : 400, flex: 1 }}>{f.name}</span>
                            <span style={{ fontSize: 10, color: D.txtSec }}>{fmtDate(f.updatedAt)}</span>
                          </div>
                        ))
                    }
                  </div>
                ))
            }
          </div>
          <div style={{ marginTop: 14 }}>
            <button onClick={() => setOpenProjModal(false)} style={{ width: '100%', padding: '10px', background: D.bgMid, color: D.txtSec, border: `1px solid ${D.border}`, borderRadius: 9, cursor: 'pointer', fontFamily: 'inherit' }}>Zavřít</button>
          </div>
        </Modal>
      )}

      {newFileModal && (
        <Modal title="📄 Nový soubor" onClose={() => setNewFileModal(false)}>
          <p style={{ fontSize: 13, color: D.txtSec, marginBottom: 10 }}>Název souboru</p>
          <input value={newFileName} onChange={e => setNewFileName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && newFileName.trim() && doNewFile()} autoFocus placeholder="skript.py"
            style={{ ...modalInp }} />
          <p style={{ fontSize: 12, color: D.txtSec, marginTop: 12, marginBottom: 6 }}>Projekt</p>
          <select value={newFileProj} onChange={e => setNewFileProj(e.target.value)} style={projSel}>
            {projects.map(p => <option key={p.name} value={p.name}>{p.name}</option>)}
          </select>
          <div style={{ marginTop: 14 }}>
            <MBtns onOk={doNewFile} onCancel={() => setNewFileModal(false)} label="Vytvořit" disabled={!newFileName.trim()} />
          </div>
        </Modal>
      )}

      {saveAsModal && (
        <Modal title="💾 Uložit jako…" onClose={() => setSaveAsModal(false)}>
          <p style={{ fontSize: 13, color: D.txtSec, marginBottom: 10 }}>Nový název souboru</p>
          <input value={saveAsName} onChange={e => setSaveAsName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && saveAsName.trim() && doSaveAs()} autoFocus placeholder="kopie.py"
            style={{ ...modalInp }} />
          <p style={{ fontSize: 12, color: D.txtSec, marginTop: 12, marginBottom: 6 }}>Projekt</p>
          <select value={saveAsProj || activeFile?.project || DEFAULT_PROJ} onChange={e => setSaveAsProj(e.target.value)} style={projSel}>
            {projects.map(p => <option key={p.name} value={p.name}>{p.name}</option>)}
          </select>
          <div style={{ marginTop: 14 }}>
            <MBtns onOk={doSaveAs} onCancel={() => setSaveAsModal(false)} label="Uložit" disabled={!saveAsName.trim()} />
          </div>
        </Modal>
      )}

      {deleteFileModal && (
        <Modal title="🗑 Smazat soubor" onClose={() => setDeleteFileModal(null)}>
          <p style={{ fontSize: 13, color: D.txtSec, marginBottom: 6, lineHeight: 1.6 }}>
            Smazat <strong style={{ color: D.txtPri }}>{deleteFileModal.project}/{deleteFileModal.name}</strong>?
          </p>
          <p style={{ fontSize: 12, color: D.danger, marginBottom: 18 }}>Tato akce je nevratná.</p>
          <MBtns onOk={() => doDeleteFile(deleteFileModal)} onCancel={() => setDeleteFileModal(null)} label="Smazat" danger />
        </Modal>
      )}

      {deleteProjModal && (
        <Modal title="🗑 Smazat projekt" onClose={() => setDeleteProjModal(null)}>
          <p style={{ fontSize: 13, color: D.txtSec, marginBottom: 6, lineHeight: 1.6 }}>
            Smazat projekt <strong style={{ color: D.txtPri }}>{deleteProjModal}</strong> a všechny jeho soubory?
          </p>
          <p style={{ fontSize: 12, color: D.danger, marginBottom: 18 }}>Tato akce je nevratná.</p>
          <MBtns onOk={() => doDeleteProject(deleteProjModal)} onCancel={() => setDeleteProjModal(null)} label="Smazat projekt" danger />
        </Modal>
      )}

      <style>{`
        .py-sb:hover { background: rgba(255,255,255,.08) !important; color: #fff !important; }
        .py-row { transition: background .12s; }
        .py-row:hover { background: rgba(255,255,255,.05) !important; }
        .py-row:hover .py-acts { opacity: 1 !important; }
        @keyframes spin { to { transform: rotate(360deg) } }
      `}</style>

      {/* ── Page header ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18, flexWrap: 'wrap' }}>
        <div style={{ width: 40, height: 40, borderRadius: 11, background: '#3B82F612', border: `1px solid #3B82F620`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <img src="/icons/python.png" alt="Python" style={{ width: 24, height: 24, objectFit: 'contain' }} onError={e => { (e.target as HTMLImageElement).style.display='none' }} />
        </div>
        <div>
          <h1 style={{ fontSize: 19, fontWeight: 800, color: D.txtPri, margin: '0 0 2px' }}>Python Editor</h1>
          <p style={{ fontSize: 11, color: D.txtSec, margin: 0 }}>Ctrl+S uložit · Ctrl+Enter spustit · soubory uloženy v cloudu</p>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          {saveMsg && <span style={{ fontSize: 12, color: saveMsg.startsWith('❌') ? D.danger : D.success, fontWeight: 600 }}>{saveMsg}</span>}
          {isDirty && !saveMsg && <span style={{ fontSize: 11, color: D.warning }}>● neuloženo</span>}
          <span style={{ fontSize: 11, padding: '3px 9px', background: '#3B82F612', color: '#60A5FA', borderRadius: 20, fontWeight: 600 }}>🐍 Python 3.11</span>
        </div>
      </div>

      {/* ── 2-col layout ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '230px 1fr', gap: 14, height: 'calc(100vh - 200px)', minHeight: 560, alignItems: 'start' }}>

        {/* ══ LEFT: Sidebar ══ */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, height: '100%', overflowY: 'auto' }}>

          {/* File actions */}
          <div style={card({ padding: '13px' })}>
            <SectionLabel>Soubory</SectionLabel>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <button className="py-sb" style={sideBtn} onClick={() => setNewFileModal(true)}>
                <span>📄</span> Nový soubor
              </button>
              <button className="py-sb" style={sideBtn}
                onClick={() => { setSaveAsName(activeFile?.name.replace(/\.py$/, '') ?? ''); setSaveAsProj(activeFile?.project ?? DEFAULT_PROJ); setSaveAsModal(true) }}>
                <span>📋</span> Uložit jako…
              </button>
              <div style={{ height: 1, background: D.border, margin: '3px 0' }} />
              <button className="py-sb" style={sideBtn} onClick={() => setNewProjModal(true)}>
                <span>📁</span> Nový projekt
              </button>
              <button className="py-sb" style={sideBtn} onClick={() => { setOpenProjModal(true); refreshProjects() }}>
                <span>📂</span> Otevřít projekt
              </button>
            </div>
          </div>

          {/* Recent files */}
          <div style={card({ padding: '13px' })}>
            <SectionLabel>Nedávné soubory</SectionLabel>
            {recent.length === 0
              ? <div style={{ fontSize: 12, color: D.txtSec }}>Žádné nedávné soubory</div>
              : recent.map(r => (
                  <div key={r.path} className="py-row"
                    onClick={async () => {
                      const f = projects.flatMap(p => p.files).find(x => x.path === r.path)
                      if (f) await openFile(f)
                    }}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 7px', borderRadius: D.radiusSm, cursor: 'pointer', background: r.path === activeFile?.path ? accent+'15' : 'transparent', marginBottom: 2 }}>
                    <span style={{ fontSize: 13 }}>🐍</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: r.path === activeFile?.path ? accent : D.txtPri, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</div>
                      <div style={{ fontSize: 10, color: D.txtSec }}>{r.project} · {fmtDate(r.openedAt)}</div>
                    </div>
                  </div>
                ))
            }
          </div>

          {/* Projects tree */}
          <div style={{ ...card({ padding: '13px' }), flex: 1, minHeight: 0 }}>
            <SectionLabel>Moje projekty</SectionLabel>
            {loadingProj
              ? <div style={{ fontSize: 12, color: D.txtSec, textAlign: 'center', padding: '12px 0', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                  <div style={{ width: 14, height: 14, border: `2px solid ${D.border}`, borderTopColor: accent, borderRadius: '50%', animation: 'spin .6s linear infinite' }} />
                  Načítám…
                </div>
              : projects.length === 0
                ? <div style={{ fontSize: 12, color: D.txtSec }}>Žádné projekty</div>
                : projects.map(proj => (
                    <div key={proj.name} style={{ marginBottom: 3 }}>
                      {/* Project header */}
                      <div className="py-row"
                        style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 6px', borderRadius: 7, background: proj.name === activeFile?.project ? accent+'10' : 'transparent' }}>
                        <div onClick={() => toggleExpand(proj.name)} style={{ display: 'flex', alignItems: 'center', gap: 5, flex: 1, cursor: 'pointer' }}>
                          <span style={{ fontSize: 9, color: D.txtSec, display: 'inline-block', transform: expanded.has(proj.name) ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }}>▶</span>
                          <span style={{ fontSize: 14 }}>📁</span>
                          <span style={{ fontSize: 12, fontWeight: 700, color: proj.name === activeFile?.project ? accent : D.txtPri, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{proj.name}</span>
                          <span style={{ fontSize: 10, color: D.txtSec }}>{proj.files.length}</span>
                        </div>
                        <div className="py-acts" style={{ display: 'flex', gap: 1, opacity: 0, flexShrink: 0 }}>
                          <button onClick={e => { e.stopPropagation(); setDeleteProjModal(proj.name) }}
                            style={{ padding: '2px 5px', background: 'none', border: 'none', cursor: 'pointer', color: D.danger, fontSize: 11, borderRadius: 4 }} title="Smazat projekt">🗑</button>
                        </div>
                      </div>

                      {/* Files in project */}
                      {expanded.has(proj.name) && proj.files.map(f => (
                        <div key={f.path} className="py-row"
                          style={{ borderRadius: 7, background: f.path === activeFile?.path ? accent+'15' : 'transparent', marginBottom: 1, marginLeft: 16 }}>
                          {renaming?.path === f.path ? (
                            <div style={{ display: 'flex', gap: 4, padding: '4px 6px' }}>
                              <input value={renaming.val}
                                onChange={e => setRenaming({ path: f.path, val: e.target.value })}
                                onKeyDown={e => { if (e.key === 'Enter') doRenameFile(f, renaming.val); if (e.key === 'Escape') setRenaming(null) }}
                                autoFocus style={{ flex: 1, padding: '2px 6px', background: D.bgMid, border: `1px solid ${D.border}`, borderRadius: 5, fontSize: 11, color: D.txtPri, fontFamily: 'monospace', outline: 'none' }} />
                              <button onClick={() => doRenameFile(f, renaming.val)} style={{ padding: '2px 7px', background: accent, color: '#fff', border: 'none', borderRadius: 5, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>✓</button>
                              <button onClick={() => setRenaming(null)} style={{ padding: '2px 5px', background: D.bgMid, color: D.txtSec, border: `1px solid ${D.border}`, borderRadius: 5, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>✕</button>
                            </div>
                          ) : (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 7px', cursor: 'pointer' }} onClick={() => openFile(f)}>
                              <span style={{ fontSize: 12 }}>🐍</span>
                              <span style={{ flex: 1, fontSize: 11, color: f.path === activeFile?.path ? accent : D.txtPri, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: f.path === activeFile?.path ? 600 : 400 }}>{f.name}</span>
                              {f.size ? <span style={{ fontSize: 9, color: D.txtSec }}>{fmtSize(f.size)}</span> : null}
                              <div className="py-acts" style={{ display: 'flex', gap: 1, opacity: 0, flexShrink: 0 }}>
                                <button onClick={e => { e.stopPropagation(); setRenaming({ path: f.path, val: f.name.replace(/\.py$/, '') }) }}
                                  style={{ padding: '1px 4px', background: 'none', border: 'none', cursor: 'pointer', color: D.txtSec, fontSize: 11, borderRadius: 4 }} title="Přejmenovat">✏</button>
                                <button onClick={e => { e.stopPropagation(); setDeleteFileModal(f) }}
                                  style={{ padding: '1px 4px', background: 'none', border: 'none', cursor: 'pointer', color: D.danger, fontSize: 11, borderRadius: 4 }} title="Smazat">🗑</button>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ))
            }
          </div>
        </div>

        {/* ══ RIGHT: Editor + Output ══ */}
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 10 }}>

          {/* Toolbar */}
          <div style={{ background: D.bgCard, border: `1px solid ${D.border}`, borderRadius: `${D.radius} ${D.radius} 0 0`, borderBottomWidth: 0, display: 'flex', alignItems: 'center', gap: 8, padding: '9px 14px', flexShrink: 0, flexWrap: 'wrap' as const }}>
            {/* Breadcrumb with inline rename */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12 }}>
              <span style={{ color: D.txtSec }}>📁 {activeFile?.project ?? '—'}</span>
              <span style={{ color: D.txtSec, opacity: .4 }}>/</span>
              {renamingBreadcrumb && activeFile ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <input value={breadcrumbVal}
                    onChange={e => setBreadcrumbVal(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') doRenameFile(activeFile, breadcrumbVal); if (e.key === 'Escape') setRenamingBreadcrumb(false) }}
                    autoFocus
                    style={{ padding: '2px 8px', background: D.bgMid, border: `1px solid ${accent}50`, borderRadius: 6, fontSize: 12, color: D.txtPri, fontFamily: 'monospace', outline: 'none', width: 140 }} />
                  <button onClick={() => doRenameFile(activeFile, breadcrumbVal)}
                    style={{ padding: '2px 8px', background: accent, color: '#fff', border: 'none', borderRadius: 5, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>✓</button>
                  <button onClick={() => setRenamingBreadcrumb(false)}
                    style={{ padding: '2px 6px', background: D.bgMid, color: D.txtSec, border: `1px solid ${D.border}`, borderRadius: 5, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>✕</button>
                </div>
              ) : (
                <button onClick={() => { if (activeFile) { setBreadcrumbVal(activeFile.name.replace(/\.py$/, '')); setRenamingBreadcrumb(true) } }}
                  title="Kliknout pro přejmenování"
                  style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', cursor: activeFile ? 'pointer' : 'default', padding: '2px 5px', borderRadius: 5, color: D.txtPri, fontSize: 12, fontWeight: 600, fontFamily: 'inherit' }}
                  className="py-row">
                  {activeFile?.name ?? 'main.py'}
                  {isDirty && <span style={{ color: D.warning, fontSize: 10 }}>●</span>}
                  {activeFile && <span style={{ fontSize: 10, color: D.txtSec, opacity: 0 }} className="py-acts">✏</span>}
                </button>
              )}
            </div>
            <div style={{ flex: 1 }} />
            {pyStatus && (
              <span style={{ fontSize: 11, color: D.txtSec, display: 'flex', alignItems: 'center', gap: 5 }}>
                <div style={{ width: 11, height: 11, border: `2px solid ${D.border}`, borderTopColor: accent, borderRadius: '50%', animation: 'spin .6s linear infinite' }} />{pyStatus}
              </span>
            )}
            <button onClick={downloadFile} disabled={!activeFile}
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', background: 'rgba(255,255,255,.04)', color: D.txtSec, border: `1px solid ${D.border}`, borderRadius: 7, fontSize: 12, cursor: activeFile ? 'pointer' : 'not-allowed', fontFamily: 'inherit', opacity: activeFile ? 1 : .4 }}>
              ⬇️ Stáhnout .py
            </button>
            <button id="py-save-btn" onClick={saveCurrentFile} disabled={!activeFile || saving}
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 13px', background: isDirty ? accent+'20' : 'rgba(255,255,255,.04)', color: isDirty ? accent : D.txtSec, border: `1px solid ${isDirty ? accent+'40' : D.border}`, borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', transition: 'all .2s', opacity: !activeFile || saving ? .4 : 1 }}>
              {saving ? '…' : '💾 Uložit'}
            </button>
            <button id="py-run-btn" onClick={runCode} disabled={running}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 16px', background: running ? D.bgMid : accent, color: running ? D.txtSec : '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: running ? 'not-allowed' : 'pointer', fontFamily: 'inherit', transition: 'all .2s' }}>
              {running ? <><div style={{ width: 12, height: 12, border: `2px solid ${D.border}`, borderTopColor: D.txtSec, borderRadius: '50%', animation: 'spin .6s linear infinite' }} />Spouštím…</> : '▶ Spustit'}
            </button>
            <span style={{ fontSize: 10, color: D.txtSec, opacity: .4 }}>Ctrl+Enter</span>
          </div>

          {/* Monaco */}
          <div style={{ flex: '0 0 56%', background: '#1E1E1E', border: `1px solid ${D.border}`, borderTop: 'none', borderRadius: `0 0 ${D.radius} ${D.radius}`, overflow: 'hidden', position: 'relative' }}>
            {!monacoReady && (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#1E1E1E', flexDirection: 'column', gap: 10 }}>
                <div style={{ width: 26, height: 26, border: `3px solid rgba(255,255,255,.06)`, borderTopColor: accent, borderRadius: '50%', animation: 'spin .8s linear infinite' }} />
                <span style={{ fontSize: 12, color: D.txtSec }}>Načítám Monaco Editor…</span>
              </div>
            )}
            <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
          </div>

          {/* Output */}
          <div style={{ ...card({ overflow: 'hidden', display: 'flex', flexDirection: 'column' }), flex: 1, minHeight: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 14px', borderBottom: `1px solid ${D.border}`, flexShrink: 0 }}>
              <span>⚡</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: D.txtPri }}>Výstup</span>
              {hasRun && !running && (
                <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 20, background: runError ? D.danger+'20' : D.success+'20', color: runError ? D.danger : D.success, fontWeight: 700 }}>
                  {runError ? '✗ Chyba' : '✓ OK'}
                </span>
              )}
              <div style={{ flex: 1 }} />
              {(outputLines.length > 0 || figures.length > 0 || runError) && (
                <button onClick={clearOutput} style={{ padding: '2px 8px', background: 'none', border: `1px solid ${D.border}`, borderRadius: 6, fontSize: 11, color: D.txtSec, cursor: 'pointer', fontFamily: 'inherit' }}>Vymazat</button>
              )}
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', fontFamily: "'JetBrains Mono','Fira Code',monospace", fontSize: 12, lineHeight: 1.7 }}>
              {!hasRun && (
                <div style={{ color: D.txtSec, display: 'flex', alignItems: 'center', gap: 14, padding: '6px 0' }}>
                  <div style={{ fontSize: 26, opacity: .3 }}>🐍</div>
                  <div>
                    <div style={{ fontSize: 12 }}>Stiskni ▶ Spustit nebo Ctrl+Enter</div>
                    <div style={{ fontSize: 11, opacity: .55 }}>Výstup print(), grafy matplotlib a chyby se zobrazí zde</div>
                  </div>
                </div>
              )}
              {running && outputLines.length === 0 && (
                <div style={{ color: D.txtSec, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 13, height: 13, border: `2px solid ${D.border}`, borderTopColor: accent, borderRadius: '50%', animation: 'spin .6s linear infinite', flexShrink: 0 }} />
                  {pyStatus || 'Inicializuji Python…'}
                </div>
              )}
              {outputLines.map((line, i) => (
                <div key={i} style={{ color: line.startsWith('⚠') ? D.warning : D.txtPri, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{line || '\u00A0'}</div>
              ))}
              {runError && (
                <div style={{ marginTop: 10, padding: '10px 13px', background: 'rgba(239,68,68,.1)', border: `1px solid rgba(239,68,68,.2)`, borderRadius: 9 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: D.danger, marginBottom: 4 }}>❌ Chyba</div>
                  <pre style={{ fontSize: 11, color: '#FCA5A5', whiteSpace: 'pre-wrap', margin: 0, fontFamily: 'inherit' }}>{runError}</pre>
                </div>
              )}
              {figures.map((b64, i) => (
                <div key={i} style={{ marginTop: 10 }}>
                  <div style={{ fontSize: 10, color: D.txtSec, marginBottom: 4 }}>📊 Graf {figures.length > 1 ? i+1 : ''}</div>
                  <img src={`data:image/png;base64,${b64}`} alt={`Graf ${i+1}`} style={{ maxWidth: '100%', borderRadius: 8, border: `1px solid ${D.border}` }} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </DarkLayout>
  )
}
