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
// Supabase storage keys must be ASCII — sanitize Czech characters
function sanitizeKey(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')   // strip diacritics
    .replace(/[^a-zA-Z0-9._\-]/g, '_') // replace non-ASCII/special with _
    .replace(/_+/g, '_')               // collapse multiple underscores
    .replace(/^_|_$/g, '')             // trim leading/trailing underscores
    || 'soubor'
}
function fp(uid: string, proj: string, name: string) {
  return `zaci/${uid}/${sanitizeKey(proj)}/${sanitizeKey(name)}`
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
  const [outputHeight, setOutputHeight] = useState(180)
  const outputResizingRef = useRef<{startY:number;startH:number}|null>(null)
  const [rightTab, setRightTab] = useState<'vars'|'snippets'|'docs'>('snippets')
  const [pyVars, setPyVars]     = useState<{name:string;type:string;value:string}[]>([])
  const [docQuery, setDocQuery] = useState('')
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
  const [newFileProj, setNewFileProj]       = useState('')  // set from projects on load
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
    // Initialize newFileProj to first real project name if not set yet
    if (result.length > 0) {
      setNewFileProj(prev => prev || result[0].name)
    }
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
        monaco.editor.defineTheme('cb-dark', {
          base: 'vs-dark', inherit: true,
          rules: [
            { token: 'keyword', foreground: 'c792ea' },
            { token: 'string',  foreground: 'c3e88d' },
            { token: 'comment', foreground: '546e7a', fontStyle: 'italic' },
            { token: 'number',  foreground: 'f78c6c' },
          ],
          colors: {
            'editor.background':              '#0d1117',
            'editor.foreground':              '#e6edf3',
            'editorLineNumber.foreground':    '#30363d',
            'editor.lineHighlightBackground': '#161b22',
          },
        })
        const ed = monaco.editor.create(containerRef.current, {
          value: DEFAULT_CODE, language: 'python', theme: 'cb-dark',
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

    // Load all other .py files in the same project into Pyodide's FS
    // so `import other_module` works between files in the same project
    const extraFiles: Record<string, string> = {}
    if (activeFile) {
      const proj = projects.find(p => p.name === activeFile.project)
      if (proj) {
        const siblings = proj.files.filter(f => f.path !== activeFile.path)
        await Promise.all(siblings.map(async sibling => {
          const content = await fetchContent(sibling.path)
          if (content) extraFiles[sibling.name] = content
        }))
      }
    }

    const lines: string[] = []
    try {
      const result = await runPython(code,
        (l: string) => { lines.push(l); setOutputLines([...lines]) },
        (s: string) => setPyStatus(s),
        extraFiles
      )
      setOutputLines(result.output ? result.output.split('\n') : lines)
      setRunError(result.error); setFigures(result.images ?? [])
    } catch (e: any) { setRunError(String(e)) }
    // Extract variables for inspector via separate runPython call
    try {
      const varResult = await runPython(
        `import json as _j
_skip={'__name__','__doc__','__package__','__loader__','__spec__','__builtins__','_cb_figures','_cb_capture_show','input','warnings','plt','matplotlib','io','base64','sys'}
_out=[]
for _k,_v in list(globals().items()):
    if _k.startswith('_') or _k in _skip: continue
    try:
        _t=type(_v).__name__
        if _t in('module','function','type','builtin_function_or_method','JsProxy','coroutine'): continue
        _s=repr(_v)
        if len(_s)>200: _s=_s[:200]+'…'
        _out.append({'name':_k,'type':_t,'value':_s})
    except: pass
print(_j.dumps(_out))`,
        () => {},
        undefined
      )
      if (varResult.output && varResult.output.trim()) {
        const parsed = JSON.parse(varResult.output.trim())
        setPyVars(parsed)
      }
    } catch {}
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
    <DarkLayout profile={profile} activeRoute="/student/python" fullContent>

      {/* ── input() modal ── */}
      {inputResolve && (
        <>
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.72)', zIndex: 9998, backdropFilter: 'blur(5px)' }} />
          <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', zIndex: 9999, width: '100%', maxWidth: 400, padding: '0 16px' }}>
            <div style={{ background: D.bgCard, borderRadius: D.radius, padding: '28px 24px', border: `1px solid ${D.border}`, boxShadow: '0 28px 70px rgba(0,0,0,.75)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: '#3B82F615', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><img src="/icons/python.png" alt="Python" style={{ width: 22, height: 22, objectFit: 'contain' }} /></div>
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
                            <img src="/icons/python.png" alt="" style={{ width: 16, height: 16, objectFit: 'contain', flexShrink: 0 }} />
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

      {/* ── 3-col layout ── */}
      <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>

        {/* ══ LEFT: Sidebar ══ */}
        <div style={{ width: 210, flexShrink: 0, borderRight: `1px solid ${D.border}`, background: D.bgCard, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

          {/* Header */}
          <div style={{ padding: '12px 12px 10px', borderBottom: `1px solid ${D.border}`, flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <img src="/icons/python.png" alt="Python" style={{ width: 18, height: 18, objectFit: 'contain' }} />
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: D.txtPri, lineHeight: 1.2 }}>PyEditor</div>
                <div style={{ fontSize: 9, fontWeight: 400, color: D.txtSec, lineHeight: 1.2 }}>by Jakub Krejčí</div>
              </div>
              {isDirty && <span style={{ fontSize: 9, color: D.warning, marginLeft: 'auto' }}>● neuloženo</span>}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <button className="py-sb" style={{...sideBtn}} onClick={() => setNewFileModal(true)}>
                <span>📄</span> Nový soubor
              </button>
              <button className="py-sb" style={{...sideBtn}}
                onClick={() => { setSaveAsName(activeFile?.name.replace(/\.py$/, '') ?? ''); setSaveAsProj(activeFile?.project ?? DEFAULT_PROJ); setSaveAsModal(true) }}>
                <span>📋</span> Uložit jako…
              </button>
              <div style={{ height: 1, background: D.border, margin: '2px 0' }} />
              <button className="py-sb" style={{...sideBtn}} onClick={() => setNewProjModal(true)}>
                <span>📁</span> Nový projekt
              </button>
              <button className="py-sb" style={{...sideBtn}} onClick={() => { setOpenProjModal(true); refreshProjects() }}>
                <span>📂</span> Otevřít projekt
              </button>
            </div>
          </div>

          {/* Scrollable: projects */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '6px 0' }}>
            <div style={{ padding: '6px 12px 3px', fontSize: 10, fontWeight: 700, color: D.txtSec, textTransform: 'uppercase', letterSpacing: '.06em' }}>Moje projekty</div>
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
                              <img src="/icons/python.png" alt="" style={{ width: 14, height: 14, objectFit: 'contain', flexShrink: 0 }} />
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

        {/* ══ CENTER: Editor + Output (resizable) ══ */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          {/* Toolbar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderBottom: `1px solid ${D.border}`, flexShrink: 0, flexWrap: 'wrap' as const }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, flex: 1, minWidth: 0 }}>
              <span style={{ color: D.txtSec, flexShrink: 0 }}>📁 {activeFile?.project ?? '—'}</span>
              <span style={{ color: D.txtSec, opacity: .4 }}>{'/'}</span>
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
                  style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', cursor: activeFile ? 'pointer' : 'default', padding: '2px 5px', borderRadius: 5, color: D.txtPri, fontSize: 12, fontWeight: 600, fontFamily: 'inherit', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}
                  className="py-row">
                  {activeFile?.name ?? 'Bez souboru'}
                  {isDirty && <span style={{ color: D.warning, fontSize: 10 }}>●</span>}
                </button>
              )}
            </div>
            {pyStatus && <span style={{ fontSize: 11, color: D.txtSec, display: 'flex', alignItems: 'center', gap: 5 }}>
              <div style={{ width: 11, height: 11, border: `2px solid ${D.border}`, borderTopColor: accent, borderRadius: '50%', animation: 'spin .6s linear infinite' }} />{pyStatus}
            </span>}
            <button onClick={downloadFile} disabled={!activeFile}
              style={{ padding: '5px 10px', background: 'rgba(255,255,255,.04)', color: D.txtSec, border: `1px solid ${D.border}`, borderRadius: 7, fontSize: 12, cursor: activeFile ? 'pointer' : 'not-allowed', fontFamily: 'inherit', opacity: activeFile ? 1 : .4 }}>
              ⬇ {activeFile?.name ?? '.py'}
            </button>
            <button id="py-save-btn" onClick={saveCurrentFile} disabled={!activeFile || saving}
              style={{ padding: '5px 11px', background: isDirty ? accent+'20' : 'rgba(255,255,255,.04)', color: isDirty ? accent : D.txtSec, border: `1px solid ${isDirty ? accent+'40' : D.border}`, borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', transition: 'all .2s', opacity: !activeFile || saving ? .4 : 1 }}>
              {saving ? '…' : '💾 Uložit'}
            </button>
            <button id="py-run-btn" onClick={runCode} disabled={running}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 16px', background: running ? D.bgMid : accent, color: running ? D.txtSec : '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: running ? 'not-allowed' : 'pointer', fontFamily: 'inherit', transition: 'all .2s' }}>
              {running ? <><div style={{ width: 12, height: 12, border: `2px solid ${D.border}`, borderTopColor: D.txtSec, borderRadius: '50%', animation: 'spin .6s linear infinite' }} />Spouštím…</> : '▶ Spustit'}
            </button>
          </div>

          {/* Monaco — fills remaining space */}
          <div style={{ flex: 1, background: '#0d1117', overflow: 'hidden', position: 'relative', minHeight: 0 }}>
            {!activeFile && monacoReady && (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 14, background: '#090B10', zIndex: 10 }}>
                <img src="/icons/python.png" alt="Python" style={{ width: 48, height: 48, objectFit: 'contain', opacity: .25 }} />
                <div style={{ fontSize: 15, fontWeight: 600, color: 'rgba(255,255,255,.3)' }}>Vítej v PyEditor</div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,.2)', textAlign: 'center' as const, lineHeight: 1.7 }}>
                  Vytvoř nový soubor nebo otevři existující projekt<br/>z levého panelu a začni programovat.
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                  <button onClick={() => setNewFileModal(true)}
                    style={{ padding: '9px 18px', background: accent+'20', border: `1px solid ${accent}50`, borderRadius: 9, cursor: 'pointer', color: accent, fontFamily: 'inherit', fontWeight: 600, fontSize: 13 }}>
                    + Nový soubor
                  </button>
                  <button onClick={() => setNewProjModal(true)}
                    style={{ padding: '9px 18px', background: 'rgba(255,255,255,.05)', border: `1px solid rgba(255,255,255,.1)`, borderRadius: 9, cursor: 'pointer', color: 'rgba(255,255,255,.5)', fontFamily: 'inherit', fontWeight: 600, fontSize: 13 }}>
                    📁 Nový projekt
                  </button>
                </div>
              </div>
            )}
            {!monacoReady && (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0d1117', flexDirection: 'column', gap: 10 }}>
                <div style={{ width: 26, height: 26, border: `3px solid rgba(255,255,255,.06)`, borderTopColor: accent, borderRadius: '50%', animation: 'spin .8s linear infinite' }} />
                <span style={{ fontSize: 12, color: D.txtSec }}>Načítám editor…</span>
              </div>
            )}
            <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
          </div>

          {/* Resize handle */}
          <div
            style={{ height: 6, background: 'rgba(255,255,255,.04)', borderTop: `1px solid ${D.border}`, borderBottom: `1px solid ${D.border}`, cursor: 'ns-resize', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background .15s' }}
            onMouseEnter={e => (e.currentTarget.style.background = accent+'30')}
            onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,.04)')}
            onMouseDown={e => {
              e.preventDefault()
              outputResizingRef.current = { startY: e.clientY, startH: outputHeight }
              const onMove = (ev: MouseEvent) => {
                if (!outputResizingRef.current) return
                const delta = outputResizingRef.current.startY - ev.clientY
                setOutputHeight(Math.max(80, Math.min(500, outputResizingRef.current.startH + delta)))
              }
              const onUp = () => { outputResizingRef.current = null; window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
              window.addEventListener('mousemove', onMove)
              window.addEventListener('mouseup', onUp)
            }}>
            <div style={{ width: 32, height: 3, borderRadius: 2, background: 'rgba(255,255,255,.2)' }} />
          </div>

          {/* Output panel */}
          <div style={{ height: outputHeight, flexShrink: 0, display: 'flex', flexDirection: 'column', borderTop: 'none', overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', borderBottom: `1px solid ${D.border}`, flexShrink: 0, background: D.bgCard }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: D.txtPri }}>Výstup</span>
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
            <div style={{ flex: 1, overflowY: 'auto', padding: '8px 12px', fontFamily: "'JetBrains Mono','Fira Code',monospace", fontSize: 12, lineHeight: 1.7, background: '#0a0c12' }}>
              {!hasRun && <div style={{ color: D.txtSec, fontSize: 11, opacity: .5 }}>Stiskni ▶ Spustit nebo Ctrl+Enter…</div>}
              {running && outputLines.length === 0 && (
                <div style={{ color: D.txtSec, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 12, height: 12, border: `2px solid ${D.border}`, borderTopColor: accent, borderRadius: '50%', animation: 'spin .6s linear infinite', flexShrink: 0 }} />
                  {pyStatus || 'Inicializuji Python…'}
                </div>
              )}
              {outputLines.map((line, i) => (
                <div key={i} style={{ color: line.startsWith('⚠') ? D.warning : '#a8d8a8', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{line || '\u00A0'}</div>
              ))}
              {runError && (
                <div style={{ marginTop: 8, padding: '8px 10px', background: 'rgba(239,68,68,.1)', border: `1px solid rgba(239,68,68,.2)`, borderRadius: 7 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: D.danger, marginBottom: 3 }}>❌ Chyba</div>
                  <pre style={{ fontSize: 11, color: '#FCA5A5', whiteSpace: 'pre-wrap', margin: 0, fontFamily: 'inherit' }}>{runError}</pre>
                </div>
              )}
              {figures.map((b64, i) => (
                <div key={i} style={{ marginTop: 8 }}>
                  <div style={{ fontSize: 10, color: D.txtSec, marginBottom: 3 }}>📊 Graf {figures.length > 1 ? i+1 : ''}</div>
                  <img src={`data:image/png;base64,${b64}`} alt={`Graf ${i+1}`} style={{ maxWidth: '100%', borderRadius: 7, border: `1px solid ${D.border}` }} />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ══ RIGHT: Tools ══ */}
        <div style={{ width: 260, flexShrink: 0, borderLeft: `1px solid ${D.border}`, background: D.bgCard, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Tab bar */}
          <div style={{ display: 'flex', borderBottom: `1px solid ${D.border}`, flexShrink: 0 }}>
            {([['vars','📦','Proměnné'],['snippets','🧩','Snippety'],['docs','📖','Docs']] as const).map(([tab, icon, label]) => (
              <button key={tab} onClick={() => setRightTab(tab)}
                style={{ flex: 1, padding: '8px 4px', background: rightTab === tab ? D.bgMid : 'transparent', border: 'none', borderBottom: `2px solid ${rightTab === tab ? accent : 'transparent'}`, cursor: 'pointer', fontFamily: 'inherit', fontSize: 10, fontWeight: 600, color: rightTab === tab ? D.txtPri : D.txtSec, transition: 'all .12s', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                <span style={{ fontSize: 14 }}>{icon}</span>
                {label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div style={{ flex: 1, overflowY: 'auto' }}>

            {/* ── Proměnné ── */}
            {rightTab === 'vars' && (
              <div style={{ padding: '10px 12px' }}>
                {pyVars.length === 0 ? (
                  <div style={{ color: D.txtSec, fontSize: 11, textAlign: 'center' as const, marginTop: 24, lineHeight: 1.7 }}>
                    <div style={{ fontSize: 24, marginBottom: 8 }}>🔍</div>
                    Spusť kód pro zobrazení<br/>proměnných z programu
                  </div>
                ) : pyVars.map(v => (
                  <div key={v.name} style={{ marginBottom: 8, background: D.bgMid, borderRadius: 8, padding: '7px 10px', border: `1px solid ${D.border}` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: accent, fontFamily: 'monospace' }}>{v.name}</span>
                      <span style={{ fontSize: 9, padding: '1px 5px', background: accent+'20', color: accent, borderRadius: 4, fontWeight: 600 }}>{v.type}</span>
                    </div>
                    <div style={{ fontSize: 11, color: '#a8d8a8', fontFamily: 'monospace', wordBreak: 'break-all' }}>{v.value}</div>
                  </div>
                ))}
              </div>
            )}

            {/* ── Snippety ── */}
            {rightTab === 'snippets' && (
              <div style={{ padding: '8px 0' }}>
                {[
                  { label: 'print()', desc: 'Výstup na konzoli', code: 'print("Hello, world!")' },
                  { label: 'input()', desc: 'Vstup od uživatele', code: 'jmeno = input("Zadej jméno: ")\nprint(f"Ahoj, {jmeno}!")' },
                  { label: 'for smyčka', desc: 'Iterace přes rozsah', code: 'for i in range(10):\n    print(i)' },
                  { label: 'while smyčka', desc: 'Podmíněná smyčka', code: 'i = 0\nwhile i < 10:\n    print(i)\n    i += 1' },
                  { label: 'if / elif / else', desc: 'Podmíněný výraz', code: 'x = 42\nif x > 0:\n    print("kladné")\nelif x == 0:\n    print("nula")\nelse:\n    print("záporné")' },
                  { label: 'def funkce', desc: 'Definice funkce', code: 'def pozdrav(jmeno):\n    return f"Ahoj, {jmeno}!"\n\nprint(pozdrav("světe"))' },
                  { label: 'list', desc: 'Práce se seznamem', code: 'cisla = [1, 2, 3, 4, 5]\nprint(sum(cisla))\nprint(max(cisla))' },
                  { label: 'dict', desc: 'Slovník (klíč → hodnota)', code: 'student = {\n    "jmeno": "Jan",\n    "vek": 15\n}\nprint(student["jmeno"])' },
                  { label: 'try / except', desc: 'Ošetření chyb', code: 'try:\n    x = int(input("Zadej číslo: "))\n    print(f"Dvojnásobek: {x * 2}")\nexcept ValueError:\n    print("To není číslo!")' },
                  { label: 'list comprehension', desc: 'Generátor seznamu', code: 'kvadraty = [x**2 for x in range(1, 11)]\nprint(kvadraty)' },
                  { label: 'matplotlib graf', desc: 'Vykreslení grafu', code: 'import matplotlib.pyplot as plt\n\nx = [1, 2, 3, 4, 5]\ny = [1, 4, 9, 16, 25]\n\nplt.plot(x, y, marker="o")\nplt.title("Kvadratická funkce")\nplt.xlabel("x")\nplt.ylabel("y")\nplt.show()' },
                  { label: 'numpy pole', desc: 'Numerické výpočty', code: 'import numpy as np\n\na = np.array([1, 2, 3, 4, 5])\nprint("Průměr:", np.mean(a))\nprint("Součet:", np.sum(a))' },
                ].map(s => (
                  <div key={s.label} className="py-row"
                    onClick={() => {
                      const ed = editorRef.current
                      if (!ed) return
                      const pos = ed.getPosition()
                      ed.executeEdits('snippet', [{ range: { startLineNumber: pos.lineNumber, startColumn: pos.column, endLineNumber: pos.lineNumber, endColumn: pos.column }, text: '\n' + s.code + '\n' }])
                      ed.focus()
                    }}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 12px', cursor: 'pointer', borderBottom: `1px solid ${D.border}10` }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: D.txtPri, fontFamily: 'monospace' }}>{s.label}</div>
                      <div style={{ fontSize: 10, color: D.txtSec }}>{s.desc}</div>
                    </div>
                    <span style={{ fontSize: 10, color: D.txtSec, flexShrink: 0 }}>↵</span>
                  </div>
                ))}
              </div>
            )}

            {/* ── Dokumentace ── */}
            {rightTab === 'docs' && (
              <div style={{ padding: '8px 12px' }}>
                <input
                  value={docQuery} onChange={e => setDocQuery(e.target.value)} placeholder="Hledat funkci…"
                  style={{ width: '100%', padding: '7px 10px', background: D.bgMid, border: `1px solid ${D.border}`, borderRadius: 8, fontSize: 12, color: D.txtPri, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' as const, marginBottom: 8 }} />
                {[
                  { name: 'print()', sig: 'print(*objects, sep=" ", end="\\n")', desc: 'Vypíše objekty na standardní výstup.', ex: 'print("Ahoj", "světe")\nprint(42, end="")' },
                  { name: 'input()', sig: 'input(prompt="")', desc: 'Přečte řádek ze vstupu, vrátí string.', ex: 'jmeno = input("Jméno: ")\nprint(jmeno)' },
                  { name: 'len()', sig: 'len(s)', desc: 'Vrátí délku objektu (seznam, string, tuple…).', ex: 'len([1,2,3])  # 3\nlen("ahoj")  # 4' },
                  { name: 'range()', sig: 'range(stop) / range(start, stop, step)', desc: 'Generuje sekvenci čísel.', ex: 'list(range(5))    # [0,1,2,3,4]\nlist(range(2,8,2)) # [2,4,6]' },
                  { name: 'int()', sig: 'int(x)', desc: 'Převede hodnotu na celé číslo.', ex: 'int("42")   # 42\nint(3.9)    # 3' },
                  { name: 'float()', sig: 'float(x)', desc: 'Převede hodnotu na desetinné číslo.', ex: 'float("3.14") # 3.14\nfloat(2)      # 2.0' },
                  { name: 'str()', sig: 'str(x)', desc: 'Převede hodnotu na řetězec.', ex: 'str(42)    # "42"\nstr(True)  # "True"' },
                  { name: 'bool()', sig: 'bool(x)', desc: 'Převede hodnotu na bool (True/False).', ex: 'bool(0)    # False\nbool(1)    # True\nbool("")   # False' },
                  { name: 'list()', sig: 'list(iterable)', desc: 'Vytvoří seznam z iterovatelného objektu.', ex: 'list(range(3))  # [0,1,2]\nlist("abc")     # ["a","b","c"]' },
                  { name: 'tuple()', sig: 'tuple(iterable)', desc: 'Vytvoří neměnnou n-tici.', ex: 'tuple([1,2,3])  # (1,2,3)\nt = (1, 2, 3)\nprint(t[0])    # 1' },
                  { name: 'dict()', sig: 'dict(**kwargs)', desc: 'Vytvoří slovník.', ex: 'd = dict(a=1, b=2)\nprint(d)  # {"a":1,"b":2}' },
                  { name: 'set()', sig: 'set(iterable)', desc: 'Vytvoří množinu (unikátní hodnoty).', ex: 's = set([1,2,2,3])\nprint(s)  # {1,2,3}' },
                  { name: 'sum()', sig: 'sum(iterable, start=0)', desc: 'Vrátí součet prvků.', ex: 'sum([1,2,3,4])  # 10\nsum(range(101)) # 5050' },
                  { name: 'max() / min()', sig: 'max(iterable) / min(iterable)', desc: 'Vrátí největší / nejmenší prvek.', ex: 'max([3,1,4,1,5])  # 5\nmin([3,1,4,1,5])  # 1' },
                  { name: 'abs()', sig: 'abs(x)', desc: 'Absolutní hodnota čísla.', ex: 'abs(-5)  # 5\nabs(3)   # 3' },
                  { name: 'round()', sig: 'round(number, ndigits=0)', desc: 'Zaokrouhlí číslo.', ex: 'round(3.14159, 2)  # 3.14\nround(2.5)         # 2' },
                  { name: 'type()', sig: 'type(object)', desc: 'Vrátí typ objektu.', ex: 'type(42)     # <class "int">\ntype("ahoj") # <class "str">' },
                  { name: 'isinstance()', sig: 'isinstance(obj, class)', desc: 'Ověří, zda je objekt instancí třídy.', ex: 'isinstance(42, int)    # True\nisinstance("x", str)   # True' },
                  { name: 'sorted()', sig: 'sorted(iterable, key=None, reverse=False)', desc: 'Vrátí seřazený seznam.', ex: 'sorted([3,1,4,1,5])        # [1,1,3,4,5]\nsorted([3,1,5], reverse=True) # [5,3,1]' },
                  { name: 'reversed()', sig: 'reversed(sequence)', desc: 'Vrátí iterátor v obráceném pořadí.', ex: 'list(reversed([1,2,3]))  # [3,2,1]' },
                  { name: 'enumerate()', sig: 'enumerate(iterable, start=0)', desc: 'Vrátí indexy spolu s hodnotami.', ex: 'for i, v in enumerate(["a","b","c"]):\n    print(i, v)  # 0 a, 1 b, 2 c' },
                  { name: 'zip()', sig: 'zip(*iterables)', desc: 'Spojí více sekvencí prvek po prvku.', ex: 'a = [1,2,3]\nb = ["a","b","c"]\nfor x,y in zip(a,b):\n    print(x, y)' },
                  { name: 'map()', sig: 'map(function, iterable)', desc: 'Aplikuje funkci na každý prvek.', ex: 'list(map(str, [1,2,3]))   # ["1","2","3"]\nlist(map(abs, [-1,2,-3]))  # [1,2,3]' },
                  { name: 'filter()', sig: 'filter(function, iterable)', desc: 'Vrátí prvky splňující podmínku.', ex: 'list(filter(lambda x: x>0, [-1,2,-3,4]))  # [2,4]' },
                  { name: 'any() / all()', sig: 'any(iterable) / all(iterable)', desc: 'Ověří zda alespoň jeden / všechny prvky jsou True.', ex: 'any([False, True, False])  # True\nall([True, True, True])    # True' },
                  { name: '.append()', sig: 'list.append(item)', desc: 'Přidá prvek na konec seznamu.', ex: 'lst = [1,2]\nlst.append(3)\nprint(lst)  # [1,2,3]' },
                  { name: '.extend()', sig: 'list.extend(iterable)', desc: 'Rozšíří seznam o všechny prvky.', ex: 'lst = [1,2]\nlst.extend([3,4])\nprint(lst)  # [1,2,3,4]' },
                  { name: '.pop()', sig: 'list.pop(index=-1)', desc: 'Odebere a vrátí prvek na indexu.', ex: 'lst = [1,2,3]\nlst.pop()   # 3\nlst.pop(0)  # 1' },
                  { name: '.split()', sig: 'str.split(sep=None)', desc: 'Rozdělí řetězec na seznam.', ex: '"a,b,c".split(",")  # ["a","b","c"]\n"ahoj svete".split()  # ["ahoj","svete"]' },
                  { name: '.join()', sig: 'sep.join(iterable)', desc: 'Spojí seznam řetězců.', ex: '",".join(["a","b","c"])  # "a,b,c"\n" ".join(["ahoj","světe"])' },
                  { name: '.strip()', sig: 'str.strip(chars=None)', desc: 'Odstraní bílé znaky (nebo zadané znaky) z okrajů.', ex: '"  ahoj  ".strip()    # "ahoj"\n"..hello..".strip(".")' },
                  { name: '.replace()', sig: 'str.replace(old, new)', desc: 'Nahradí výskyt podřetězce.', ex: '"ahoj světe".replace("světe","Pythone")' },
                  { name: '.upper() / .lower()', sig: 'str.upper() / str.lower()', desc: 'Převede na velká / malá písmena.', ex: '"ahoj".upper()  # "AHOJ"\n"SVĚT".lower()  # "svět"' },
                  { name: 'f-string', sig: 'f"text {výraz}"', desc: 'Formátovaný řetězec s vloženými výrazy.', ex: 'jmeno = "Jan"\nprint(f"Ahoj, {jmeno}!")\nprint(f"2+2 = {2+2}")' },
                  { name: 'lambda', sig: 'lambda args: výraz', desc: 'Anonymní funkce (jedna linka).', ex: 'double = lambda x: x * 2\nprint(double(5))  # 10\nsorted([3,1,2], key=lambda x: -x)' },
                  { name: 'open()', sig: 'open(file, mode="r")', desc: 'Otevře soubor. Použij with pro automatické zavření.', ex: 'with open("soubor.txt", "w") as f:\n    f.write("Ahoj!\\n")\nwith open("soubor.txt") as f:\n    print(f.read())' },
                  { name: 'math modul', sig: 'import math', desc: 'Matematické funkce a konstanty.', ex: 'import math\nprint(math.pi)       # 3.14159…\nprint(math.sqrt(16))  # 4.0\nprint(math.floor(3.7)) # 3' },
                  { name: 'random modul', sig: 'import random', desc: 'Generování náhodných čísel.', ex: 'import random\nprint(random.randint(1, 6))  # hod kostkou\nprint(random.random())       # 0.0 – 1.0\nrandom.shuffle([1,2,3,4,5])' },
                ].filter(doc => !docQuery || doc.name.toLowerCase().includes(docQuery.toLowerCase()) || doc.desc.toLowerCase().includes(docQuery.toLowerCase()))
                  .map(doc => (
                  <div key={doc.name} style={{ marginBottom: 10, background: D.bgMid, borderRadius: 9, padding: '9px 11px', border: `1px solid ${D.border}` }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: accent, fontFamily: 'monospace', marginBottom: 2 }}>{doc.name}</div>
                    <div style={{ fontSize: 10, color: D.txtSec, fontFamily: 'monospace', marginBottom: 5 }}>{doc.sig}</div>
                    <div style={{ fontSize: 11, color: D.txtPri, marginBottom: 6, lineHeight: 1.5 }}>{doc.desc}</div>
                    <pre style={{ margin: 0, padding: '5px 8px', background: '#0d1117', borderRadius: 6, fontSize: 10, color: '#a8d8a8', fontFamily: 'monospace', whiteSpace: 'pre-wrap', cursor: 'pointer', border: `1px solid ${D.border}` }}
                      onClick={() => {
                        const ed = editorRef.current
                        if (!ed) return
                        const pos = ed.getPosition()
                        ed.executeEdits('doc', [{ range: { startLineNumber: pos.lineNumber, startColumn: pos.column, endLineNumber: pos.lineNumber, endColumn: pos.column }, text: '\n' + doc.ex + '\n' }])
                        ed.focus()
                      }}
                      title="Klikni pro vložení příkladu">
                      {doc.ex}
                    </pre>
                  </div>
                ))}
              </div>
            )}

          </div>
        </div>

      </div>
    </DarkLayout>
  )
}
