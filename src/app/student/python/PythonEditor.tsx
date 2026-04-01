'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { runPython } from '@/lib/pyodide-runner'
import { DarkLayout, D, card, SectionLabel } from '@/components/DarkLayout'

// ── Constants ────────────────────────────────────────────────────────────────
const BUCKET = 'python-files'
const DEFAULT_PROJECT = 'Výchozí'
const DEFAULT_CODE = `# Vítej v ClassBase Python editoru! 🐍\nprint("Ahoj, světe!")\n\n# for i in range(5):\n#     print(f"Číslo: {i}")\n`
const LS_RECENT = 'cb_py_recent'   // recent: [{path, name, project, openedAt}]
const LS_LAST   = 'cb_py_last'     // last opened path

// ── Storage paths ─────────────────────────────────────────────────────────────
// zaci/{uid}/{project}/{filename}
function filePath(uid: string, project: string, name: string) {
  return `zaci/${uid}/${project}/${name}`
}

// ── Types ────────────────────────────────────────────────────────────────────
interface PyFile { path: string; name: string; project: string; size?: number; updatedAt: string }
interface Project { name: string; files: PyFile[] }
interface RecentEntry { path: string; name: string; project: string; openedAt: string }

// ── Snippets ─────────────────────────────────────────────────────────────────
const SNIPPETS = [
  { label: 'Hello World',  code: 'print("Ahoj, světe!")' },
  { label: 'For cyklus',   code: 'for i in range(10):\n    print(f"i = {i}")' },
  { label: 'Matplotlib',   code: 'import matplotlib.pyplot as plt\nimport numpy as np\n\nx = np.linspace(0, 2*np.pi, 100)\ny = np.sin(x)\n\nplt.figure(figsize=(8,4))\nplt.plot(x, y, color="purple", linewidth=2)\nplt.title("Sinusovka")\nplt.grid(True, alpha=0.3)\nplt.tight_layout()\nplt.show()' },
  { label: 'NumPy',        code: 'import numpy as np\n\na = np.array([1,2,3,4,5])\nprint("Pole:", a)\nprint("Součet:", np.sum(a))\nprint("Průměr:", np.mean(a))\nprint("Std:", np.std(a).round(3))' },
  { label: 'input()',      code: 'jmeno = input("Jak se jmenuješ? ")\nprint(f"Ahoj, {jmeno}! 👋")' },
]

export default function PythonEditor({ profile }: { profile: any }) {
  const supabase  = createClient()
  const accent    = profile?.accent_color ?? '#7C3AED'
  const uid       = profile?.id as string

  // ── Project/file state ────────────────────────────────────────────────────
  const [projects, setProjects]       = useState<Project[]>([])
  const [loadingProjects, setLP]      = useState(true)
  const [activeFile, setActiveFile]   = useState<PyFile | null>(null)
  const [activeCode, setActiveCode]   = useState(DEFAULT_CODE)    // what editor shows
  const [isDirty, setIsDirty]         = useState(false)
  const [recent, setRecent]           = useState<RecentEntry[]>([])
  const [expandedProjects, setExpP]   = useState<Set<string>>(new Set([DEFAULT_PROJECT]))

  // ── Editor refs ───────────────────────────────────────────────────────────
  const editorRef    = useRef<any>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [monacoReady, setMonacoReady] = useState(false)

  // ── Runner ────────────────────────────────────────────────────────────────
  const [running, setRunning]         = useState(false)
  const [pyStatus, setPyStatus]       = useState('')
  const [outputLines, setOutputLines] = useState<string[]>([])
  const [runError, setRunError]       = useState<string | null>(null)
  const [figures, setFigures]         = useState<string[]>([])
  const [hasRun, setHasRun]           = useState(false)

  // ── UI state ──────────────────────────────────────────────────────────────
  const [saving, setSaving]           = useState(false)
  const [saveMsg, setSaveMsg]         = useState('')
  const [renamingPath, setRenamingPath] = useState<string | null>(null)
  const [renameVal, setRenameVal]     = useState('')
  const [deleteModal, setDeleteModal] = useState<PyFile | null>(null)
  const [newFileModal, setNewFileModal] = useState(false)
  const [newFileName, setNewFileName]   = useState('')
  const [newFileProject, setNewFileProject] = useState(DEFAULT_PROJECT)
  const [saveAsModal, setSaveAsModal] = useState(false)
  const [saveAsName, setSaveAsName]   = useState('')
  const [saveAsProject, setSaveAsProject] = useState('')
  const [newProjModal, setNewProjModal] = useState(false)
  const [newProjName, setNewProjName]   = useState('')
  const [openProjModal, setOpenProjModal] = useState(false)

  // ── Load projects from Supabase ───────────────────────────────────────────
  const refreshProjects = useCallback(async (): Promise<Project[]> => {
    setLP(true)
    // List the root folder for this user: zaci/{uid}/
    const { data: topLevel } = await supabase.storage.from(BUCKET).list(`zaci/${uid}`, {
      limit: 200, sortBy: { column: 'name', order: 'asc' }
    })
    if (!topLevel) { setLP(false); return [] }

    const projectList: Project[] = []
    for (const item of topLevel) {
      // Each item is a "folder" (Supabase returns placeholder files for folders)
      // We list inside it to get files
      const { data: files } = await supabase.storage.from(BUCKET).list(`zaci/${uid}/${item.name}`, {
        limit: 200, sortBy: { column: 'updated_at', order: 'desc' }
      })
      const pyFiles: PyFile[] = (files ?? [])
        .filter(f => f.name !== '.gitkeep' && f.name.endsWith('.py'))
        .map(f => ({
          path: filePath(uid, item.name, f.name),
          name: f.name,
          project: item.name,
          size: f.metadata?.size,
          updatedAt: f.updated_at ?? new Date().toISOString(),
        }))
      projectList.push({ name: item.name, files: pyFiles })
    }
    setProjects(projectList)
    setLP(false)
    return projectList
  }, [uid])

  // ── Download a file's content from storage ────────────────────────────────
  async function fetchContent(path: string): Promise<string> {
    const { data, error } = await supabase.storage.from(BUCKET).download(path)
    if (error || !data) return ''
    return await data.text()
  }

  // ── Upload content to storage (always upsert) ─────────────────────────────
  async function pushContent(path: string, content: string): Promise<string | null> {
    // Supabase storage: to upsert, first remove then upload (upsert:true can be finicky)
    await supabase.storage.from(BUCKET).remove([path])
    const blob = new Blob([content], { type: 'text/plain' })
    const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
      contentType: 'text/plain',
      upsert: true,
    })
    if (error) return error.message
    return null
  }

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
        ed.onDidChangeModelContent(() => { setActiveCode(ed.getValue()); setIsDirty(true) })
        ed.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => document.getElementById('py-run-btn')?.click())
        ed.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => document.getElementById('py-save-btn')?.click())
        setMonacoReady(true)
      })
    }
    document.head.appendChild(s)
    return () => { editorRef.current?.dispose() }
  }, [])

  // ── Init: load localStorage recent list, then load projects ──────────────
  useEffect(() => {
    try {
      const r = JSON.parse(localStorage.getItem(LS_RECENT) ?? '[]')
      setRecent(r)
    } catch {}
    ;(async () => {
      const projs = await refreshProjects()
      const lastPath = localStorage.getItem(LS_LAST)
      if (lastPath) {
        // Try to find and open the last opened file
        for (const proj of projs) {
          const f = proj.files.find(x => x.path === lastPath)
          if (f) { await openFile(f); return }
        }
      }
      // Fall back to first file of first project
      if (projs.length > 0 && projs[0].files.length > 0) {
        await openFile(projs[0].files[0])
      } else {
        // Create default project + main.py
        await createProject(DEFAULT_PROJECT, true)
      }
    })()
  }, [])

  // ── Open a file ────────────────────────────────────────────────────────────
  async function openFile(file: PyFile) {
    const content = await fetchContent(file.path)
    setActiveFile(file)
    setActiveCode(content)
    setIsDirty(false)
    editorRef.current?.setValue(content)
    clearOutput()
    // Update recent list (keep last 3 unique paths)
    const entry: RecentEntry = { path: file.path, name: file.name, project: file.project, openedAt: new Date().toISOString() }
    setRecent(prev => {
      const next = [entry, ...prev.filter(r => r.path !== file.path)].slice(0, 3)
      try { localStorage.setItem(LS_RECENT, JSON.stringify(next)) } catch {}
      return next
    })
    try { localStorage.setItem(LS_LAST, file.path) } catch {}
    // Expand the project in sidebar
    setExpP(prev => new Set([...prev, file.project]))
  }

  function clearOutput() {
    setHasRun(false); setOutputLines([]); setRunError(null); setFigures([])
  }

  function flash(msg: string, dur = 2500) {
    setSaveMsg(msg); setTimeout(() => setSaveMsg(''), dur)
  }

  // ── Save current file ──────────────────────────────────────────────────────
  async function saveCurrentFile() {
    if (!activeFile) return
    setSaving(true)
    const content = editorRef.current?.getValue() ?? activeCode
    const err = await pushContent(activeFile.path, content)
    if (err) flash('❌ ' + err)
    else { flash('✓ Uloženo'); setIsDirty(false) }
    await refreshProjects()
    setSaving(false)
  }

  // ── Save As ────────────────────────────────────────────────────────────────
  async function doSaveAs() {
    let name = saveAsName.trim()
    if (!name) return
    if (!name.endsWith('.py')) name += '.py'
    const proj = saveAsProject || activeFile?.project || DEFAULT_PROJECT
    setSaving(true)
    const content = editorRef.current?.getValue() ?? activeCode
    const path = filePath(uid, proj, name)
    const err = await pushContent(path, content)
    if (!err) {
      flash('✓ Uloženo jako ' + name)
      const projs = await refreshProjects()
      const newF = projs.flatMap(p => p.files).find(f => f.path === path)
      if (newF) { await openFile(newF) }
    } else flash('❌ ' + err)
    setSaveAsModal(false); setSaveAsName(''); setSaving(false)
  }

  // ── Create new file ────────────────────────────────────────────────────────
  async function doNewFile() {
    let name = newFileName.trim() || 'nový_skript'
    if (!name.endsWith('.py')) name += '.py'
    const proj = newFileProject || DEFAULT_PROJECT
    setSaving(true)
    const path = filePath(uid, proj, name)
    const err = await pushContent(path, `# ${name}\n\n`)
    if (!err) {
      const projs = await refreshProjects()
      const newF = projs.flatMap(p => p.files).find(f => f.path === path)
      if (newF) await openFile(newF)
    } else flash('❌ ' + err)
    setNewFileModal(false); setNewFileName(''); setSaving(false)
  }

  // ── Create new project ─────────────────────────────────────────────────────
  async function createProject(projName: string, silent = false) {
    const name = projName.trim() || 'Nový projekt'
    const mainPath = filePath(uid, name, 'main.py')
    setSaving(true)
    const err = await pushContent(mainPath, DEFAULT_CODE)
    if (!err) {
      const projs = await refreshProjects()
      const proj = projs.find(p => p.name === name)
      if (proj?.files[0]) await openFile(proj.files[0])
      if (!silent) flash('✓ Projekt vytvořen')
    } else flash('❌ ' + err)
    setNewProjModal(false); setNewProjName(''); setSaving(false)
  }

  // ── Rename file ────────────────────────────────────────────────────────────
  async function renameFile(file: PyFile) {
    let newName = renameVal.trim()
    if (!newName) { setRenamingPath(null); return }
    if (!newName.endsWith('.py')) newName += '.py'
    if (newName === file.name) { setRenamingPath(null); return }
    setSaving(true)
    const content = await fetchContent(file.path)
    const newPath = filePath(uid, file.project, newName)
    const err = await pushContent(newPath, content)
    if (!err) {
      await supabase.storage.from(BUCKET).remove([file.path])
      const projs = await refreshProjects()
      if (activeFile?.path === file.path) {
        const renamed = projs.flatMap(p => p.files).find(f => f.path === newPath)
        if (renamed) {
          setActiveFile(renamed)
          setRecent(prev => {
            const next = prev.map(r => r.path === file.path ? { ...r, path: newPath, name: newName } : r)
            try { localStorage.setItem(LS_RECENT, JSON.stringify(next)) } catch {}
            return next
          })
          try { localStorage.setItem(LS_LAST, newPath) } catch {}
        }
      }
    } else flash('❌ ' + err)
    setRenamingPath(null); setSaving(false)
  }

  // ── Delete file ────────────────────────────────────────────────────────────
  async function deleteFile(file: PyFile) {
    setSaving(true)
    await supabase.storage.from(BUCKET).remove([file.path])
    const projs = await refreshProjects()
    if (activeFile?.path === file.path) {
      const allFiles = projs.flatMap(p => p.files)
      if (allFiles.length > 0) await openFile(allFiles[0])
      else { setActiveFile(null); setActiveCode(''); editorRef.current?.setValue('') }
    }
    setRecent(prev => {
      const next = prev.filter(r => r.path !== file.path)
      try { localStorage.setItem(LS_RECENT, JSON.stringify(next)) } catch {}
      return next
    })
    setDeleteModal(null); setSaving(false)
  }

  // ── Download ──────────────────────────────────────────────────────────────
  function downloadFile() {
    const content = editorRef.current?.getValue() ?? activeCode
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([content], { type: 'text/x-python' }))
    a.download = activeFile?.name ?? 'skript.py'; a.click()
  }

  // ── Run Python ────────────────────────────────────────────────────────────
  async function runCode() {
    setRunning(true); clearOutput(); setHasRun(true)
    const code = editorRef.current?.getValue() ?? activeCode
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
  function toggleProject(name: string) {
    setExpP(prev => { const n = new Set(prev); n.has(name) ? n.delete(name) : n.add(name); return n })
  }

  // ── Shared styles ─────────────────────────────────────────────────────────
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
  const divider = <div style={{ height: 1, background: D.border, margin: '6px 0' }} />

  function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
    return (
      <>
        <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)', zIndex: 9998, backdropFilter: 'blur(4px)' }} />
        <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', zIndex: 9999, width: '100%', maxWidth: 400, padding: '0 16px' }}>
          <div style={{ background: D.bgCard, borderRadius: D.radius, padding: '28px 24px', border: `1px solid ${D.border}`, boxShadow: '0 24px 64px rgba(0,0,0,.7)' }}>
            <div style={{ fontSize: 17, fontWeight: 800, color: D.txtPri, marginBottom: 16 }}>{title}</div>
            {children}
          </div>
        </div>
      </>
    )
  }

  function ModalBtns({ onOk, onCancel, okLabel, okDisabled }: { onOk: () => void; onCancel: () => void; okLabel: string; okDisabled?: boolean }) {
    return (
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={onOk} disabled={okDisabled || saving}
          style={{ flex: 1, padding: '10px', background: accent, color: '#fff', border: 'none', borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: okDisabled || saving ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: okDisabled || saving ? .4 : 1 }}>
          {saving ? '…' : okLabel}
        </button>
        <button onClick={onCancel} style={{ padding: '10px 14px', background: D.bgMid, color: D.txtSec, border: `1px solid ${D.border}`, borderRadius: 9, cursor: 'pointer', fontFamily: 'inherit' }}>Zrušit</button>
      </div>
    )
  }

  const projSelectStyle: React.CSSProperties = {
    width: '100%', padding: '8px 10px', background: D.bgMid,
    border: `1px solid ${D.border}`, borderRadius: 8, fontSize: 13,
    color: D.txtPri, fontFamily: 'inherit', outline: 'none', marginTop: 10,
  }

  return (
    <DarkLayout profile={profile} activeRoute="/student/python">

      {/* ── Modals ── */}
      {newProjModal && (
        <Modal title="📁 Nový projekt" onClose={() => setNewProjModal(false)}>
          <p style={{ fontSize: 13, color: D.txtSec, marginBottom: 12 }}>Název projektu. Automaticky se vytvoří soubor main.py.</p>
          <input value={newProjName} onChange={e => setNewProjName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && createProject(newProjName)} autoFocus placeholder="Můj projekt"
            style={{ ...modalInp, marginBottom: 14 }} />
          <ModalBtns onOk={() => createProject(newProjName)} onCancel={() => setNewProjModal(false)} okLabel="Vytvořit" okDisabled={!newProjName.trim()} />
        </Modal>
      )}

      {openProjModal && (
        <Modal title="📂 Otevřít projekt" onClose={() => setOpenProjModal(false)}>
          {loadingProjects
            ? <div style={{ fontSize: 13, color: D.txtSec, textAlign: 'center', padding: '20px 0' }}>Načítám…</div>
            : projects.length === 0
              ? <div style={{ fontSize: 13, color: D.txtSec }}>Žádné projekty.</div>
              : projects.map(proj => (
                  <div key={proj.name} style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: D.txtSec, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 6 }}>
                      📁 {proj.name}
                    </div>
                    {proj.files.length === 0
                      ? <div style={{ fontSize: 12, color: D.txtSec, paddingLeft: 16 }}>Prázdný projekt</div>
                      : proj.files.map(f => (
                          <div key={f.path} onClick={() => { openFile(f); setOpenProjModal(false) }}
                            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px 7px 20px', borderRadius: 8, cursor: 'pointer', background: f.path === activeFile?.path ? accent+'15' : 'transparent' }}
                            className="py-file-row">
                            <span style={{ fontSize: 13 }}>🐍</span>
                            <span style={{ fontSize: 13, color: f.path === activeFile?.path ? accent : D.txtPri, fontWeight: f.path === activeFile?.path ? 600 : 400 }}>{f.name}</span>
                            <span style={{ fontSize: 10, color: D.txtSec, marginLeft: 'auto' }}>{fmtDate(f.updatedAt)}</span>
                          </div>
                        ))
                    }
                  </div>
                ))
          }
          <div style={{ marginTop: 14 }}>
            <button onClick={() => setOpenProjModal(false)} style={{ width: '100%', padding: '10px', background: D.bgMid, color: D.txtSec, border: `1px solid ${D.border}`, borderRadius: 9, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13 }}>Zavřít</button>
          </div>
        </Modal>
      )}

      {newFileModal && (
        <Modal title="📄 Nový soubor" onClose={() => setNewFileModal(false)}>
          <p style={{ fontSize: 13, color: D.txtSec, marginBottom: 10 }}>Název souboru</p>
          <input value={newFileName} onChange={e => setNewFileName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && doNewFile()} autoFocus placeholder="skript.py"
            style={{ ...modalInp, marginBottom: 10 }} />
          <p style={{ fontSize: 12, color: D.txtSec, marginBottom: 6 }}>Projekt</p>
          <select value={newFileProject} onChange={e => setNewFileProject(e.target.value)} style={projSelectStyle}>
            {projects.map(p => <option key={p.name} value={p.name}>{p.name}</option>)}
          </select>
          <div style={{ marginTop: 14 }}>
            <ModalBtns onOk={doNewFile} onCancel={() => setNewFileModal(false)} okLabel="Vytvořit" okDisabled={!newFileName.trim()} />
          </div>
        </Modal>
      )}

      {saveAsModal && (
        <Modal title="💾 Uložit jako…" onClose={() => setSaveAsModal(false)}>
          <p style={{ fontSize: 13, color: D.txtSec, marginBottom: 10 }}>Nový název souboru</p>
          <input value={saveAsName} onChange={e => setSaveAsName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && doSaveAs()} autoFocus placeholder="kopie.py"
            style={{ ...modalInp, marginBottom: 10 }} />
          <p style={{ fontSize: 12, color: D.txtSec, marginBottom: 6 }}>Projekt</p>
          <select value={saveAsProject || activeFile?.project || DEFAULT_PROJECT} onChange={e => setSaveAsProject(e.target.value)} style={projSelectStyle}>
            {projects.map(p => <option key={p.name} value={p.name}>{p.name}</option>)}
          </select>
          <div style={{ marginTop: 14 }}>
            <ModalBtns onOk={doSaveAs} onCancel={() => setSaveAsModal(false)} okLabel="Uložit" okDisabled={!saveAsName.trim()} />
          </div>
        </Modal>
      )}

      {deleteModal && (
        <Modal title="🗑 Smazat soubor" onClose={() => setDeleteModal(null)}>
          <p style={{ fontSize: 13, color: D.txtSec, marginBottom: 6, lineHeight: 1.6 }}>
            Smazat <strong style={{ color: D.txtPri }}>{deleteModal.project}/{deleteModal.name}</strong>?
          </p>
          <p style={{ fontSize: 12, color: D.danger, marginBottom: 18 }}>Tato akce je nevratná.</p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => deleteFile(deleteModal)} disabled={saving}
              style={{ flex: 1, padding: '10px', background: D.danger, color: '#fff', border: 'none', borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', opacity: saving ? .6 : 1 }}>
              {saving ? '…' : 'Smazat'}
            </button>
            <button onClick={() => setDeleteModal(null)} style={{ padding: '10px 14px', background: D.bgMid, color: D.txtSec, border: `1px solid ${D.border}`, borderRadius: 9, cursor: 'pointer', fontFamily: 'inherit' }}>Zrušit</button>
          </div>
        </Modal>
      )}

      <style>{`
        .py-side-btn:hover { background: rgba(255,255,255,.08) !important; color: #fff !important; }
        .py-file-row { transition: background .12s; }
        .py-file-row:hover { background: rgba(255,255,255,.05) !important; }
        .py-file-row:hover .py-acts { opacity: 1 !important; }
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
              <button className="py-side-btn" style={sideBtn} onClick={() => setNewFileModal(true)}>
                <span style={{ fontSize: 14 }}>📄</span> Nový soubor
              </button>
              <button className="py-side-btn" style={sideBtn}
                onClick={() => { setSaveAsName(activeFile?.name.replace(/\.py$/, '') ?? ''); setSaveAsProject(activeFile?.project ?? DEFAULT_PROJECT); setSaveAsModal(true) }}>
                <span style={{ fontSize: 14 }}>📋</span> Uložit jako…
              </button>
              {divider}
              <button className="py-side-btn" style={sideBtn} onClick={() => setNewProjModal(true)}>
                <span style={{ fontSize: 14 }}>📁</span> Nový projekt
              </button>
              <button className="py-side-btn" style={sideBtn} onClick={() => { setOpenProjModal(true); refreshProjects() }}>
                <span style={{ fontSize: 14 }}>📂</span> Otevřít projekt
              </button>
            </div>
          </div>

          {/* Snippets */}
          <div style={card({ padding: '13px' })}>
            <SectionLabel>Snippety</SectionLabel>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {SNIPPETS.map(({ label, code }) => (
                <button key={label} className="py-side-btn"
                  onClick={() => { editorRef.current?.setValue(code); setActiveCode(code); setIsDirty(true) }}
                  style={{ ...sideBtn, fontSize: 11, padding: '6px 9px' }}>
                  <span style={{ fontSize: 12 }}>📋</span>{label}
                </button>
              ))}
            </div>
          </div>

          {/* Recent files */}
          <div style={card({ padding: '13px' })}>
            <SectionLabel>Nedávné soubory</SectionLabel>
            {recent.length === 0
              ? <div style={{ fontSize: 12, color: D.txtSec }}>Žádné nedávné soubory</div>
              : recent.map(r => (
                  <div key={r.path} className="py-file-row"
                    onClick={async () => {
                      const proj = projects.find(p => p.name === r.project)
                      const f = proj?.files.find(x => x.path === r.path)
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
          <div style={{ ...card({ padding: '13px' }), flex: 1 }}>
            <SectionLabel>Moje projekty</SectionLabel>
            {loadingProjects
              ? <div style={{ fontSize: 12, color: D.txtSec, textAlign: 'center', padding: '12px 0' }}>
                  <div style={{ width: 16, height: 16, border: `2px solid ${D.border}`, borderTopColor: accent, borderRadius: '50%', animation: 'spin .6s linear infinite', margin: '0 auto 6px' }} />
                  Načítám…
                </div>
              : projects.length === 0
                ? <div style={{ fontSize: 12, color: D.txtSec }}>Žádné projekty — vytvořte první!</div>
                : projects.map(proj => (
                    <div key={proj.name} style={{ marginBottom: 4 }}>
                      {/* Project header */}
                      <div onClick={() => toggleProject(proj.name)}
                        style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 6px', borderRadius: 7, cursor: 'pointer', background: proj.name === activeFile?.project ? accent+'10' : 'transparent' }}
                        className="py-file-row">
                        <span style={{ fontSize: 10, color: D.txtSec, transition: 'transform .15s', display: 'inline-block', transform: expandedProjects.has(proj.name) ? 'rotate(90deg)' : 'none' }}>▶</span>
                        <span style={{ fontSize: 14 }}>📁</span>
                        <span style={{ fontSize: 12, fontWeight: 700, color: proj.name === activeFile?.project ? accent : D.txtPri, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{proj.name}</span>
                        <span style={{ fontSize: 10, color: D.txtSec }}>{proj.files.length}</span>
                      </div>
                      {/* Files in project */}
                      {expandedProjects.has(proj.name) && proj.files.map(f => (
                        <div key={f.path} className="py-file-row"
                          style={{ borderRadius: 7, background: f.path === activeFile?.path ? accent+'15' : 'transparent', marginBottom: 1, marginLeft: 16 }}>
                          {renamingPath === f.path ? (
                            <div style={{ display: 'flex', gap: 4, padding: '4px 6px' }}>
                              <input value={renameVal} onChange={e => setRenameVal(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') renameFile(f); if (e.key === 'Escape') setRenamingPath(null) }}
                                autoFocus style={{ flex: 1, padding: '2px 6px', background: D.bgMid, border: `1px solid ${D.border}`, borderRadius: 5, fontSize: 11, color: D.txtPri, fontFamily: 'monospace', outline: 'none' }} />
                              <button onClick={() => renameFile(f)} style={{ padding: '2px 7px', background: accent, color: '#fff', border: 'none', borderRadius: 5, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>✓</button>
                              <button onClick={() => setRenamingPath(null)} style={{ padding: '2px 5px', background: D.bgMid, color: D.txtSec, border: `1px solid ${D.border}`, borderRadius: 5, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>✕</button>
                            </div>
                          ) : (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 7px', cursor: 'pointer' }} onClick={() => openFile(f)}>
                              <span style={{ fontSize: 12 }}>🐍</span>
                              <span style={{ flex: 1, fontSize: 11, color: f.path === activeFile?.path ? accent : D.txtPri, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: f.path === activeFile?.path ? 600 : 400 }}>{f.name}</span>
                              {f.size && <span style={{ fontSize: 9, color: D.txtSec }}>{fmtSize(f.size)}</span>}
                              <div className="py-acts" style={{ display: 'flex', gap: 1, opacity: 0, flexShrink: 0 }}>
                                <button onClick={e => { e.stopPropagation(); setRenamingPath(f.path); setRenameVal(f.name.replace(/\.py$/, '')) }}
                                  style={{ padding: '1px 4px', background: 'none', border: 'none', cursor: 'pointer', color: D.txtSec, fontSize: 11, borderRadius: 4 }} title="Přejmenovat">✏</button>
                                <button onClick={e => { e.stopPropagation(); setDeleteModal(f) }}
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

          {/* Editor toolbar */}
          <div style={{ background: D.bgCard, border: `1px solid ${D.border}`, borderRadius: `${D.radius} ${D.radius} 0 0`, borderBottomWidth: 0, display: 'flex', alignItems: 'center', gap: 8, padding: '9px 14px', flexShrink: 0, flexWrap: 'wrap' as const }}>
            {/* Breadcrumb: project / file */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: D.txtSec, marginRight: 4 }}>
              <span>📁</span>
              <span style={{ color: activeFile ? D.txtSec : D.txtSec }}>{activeFile?.project ?? '—'}</span>
              <span style={{ opacity: .4 }}>/</span>
              <span style={{ color: D.txtPri, fontWeight: 600 }}>{activeFile?.name ?? 'main.py'}</span>
              {isDirty && <span style={{ color: D.warning, fontSize: 10 }}>●</span>}
            </div>
            <div style={{ flex: 1 }} />
            {pyStatus && (
              <span style={{ fontSize: 11, color: D.txtSec, display: 'flex', alignItems: 'center', gap: 5 }}>
                <div style={{ width: 11, height: 11, border: `2px solid ${D.border}`, borderTopColor: accent, borderRadius: '50%', animation: 'spin .6s linear infinite' }} />
                {pyStatus}
              </span>
            )}
            {/* Download */}
            <button onClick={downloadFile} disabled={!activeFile}
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 11px', background: 'rgba(255,255,255,.04)', color: D.txtSec, border: `1px solid ${D.border}`, borderRadius: 7, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>
              ⬇️ .py
            </button>
            {/* Save */}
            <button id="py-save-btn" onClick={saveCurrentFile} disabled={!activeFile || saving}
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 13px', background: isDirty ? accent+'20' : 'rgba(255,255,255,.04)', color: isDirty ? accent : D.txtSec, border: `1px solid ${isDirty ? accent+'40' : D.border}`, borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', transition: 'all .2s' }}>
              {saving ? '…' : '💾 Uložit'}
            </button>
            {/* Run */}
            <button id="py-run-btn" onClick={runCode} disabled={running}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 16px', background: running ? D.bgMid : accent, color: running ? D.txtSec : '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: running ? 'not-allowed' : 'pointer', fontFamily: 'inherit', transition: 'all .2s' }}>
              {running
                ? <><div style={{ width: 12, height: 12, border: `2px solid ${D.border}`, borderTopColor: D.txtSec, borderRadius: '50%', animation: 'spin .6s linear infinite' }} />Spouštím…</>
                : '▶ Spustit'}
            </button>
            <span style={{ fontSize: 10, color: D.txtSec, opacity: .4 }}>Ctrl+Enter</span>
          </div>

          {/* Monaco — 60% */}
          <div style={{ flex: '0 0 56%', background: '#1E1E1E', border: `1px solid ${D.border}`, borderTop: 'none', borderRadius: `0 0 ${D.radius} ${D.radius}`, overflow: 'hidden', position: 'relative' }}>
            {!monacoReady && (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#1E1E1E', flexDirection: 'column', gap: 10 }}>
                <div style={{ width: 26, height: 26, border: `3px solid rgba(255,255,255,.06)`, borderTopColor: accent, borderRadius: '50%', animation: 'spin .8s linear infinite' }} />
                <span style={{ fontSize: 12, color: D.txtSec }}>Načítám Monaco Editor…</span>
              </div>
            )}
            <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
          </div>

          {/* Output — remaining */}
          <div style={{ ...card({ overflow: 'hidden', display: 'flex', flexDirection: 'column' }), flex: 1, minHeight: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 14px', borderBottom: `1px solid ${D.border}`, flexShrink: 0 }}>
              <span style={{ fontSize: 13 }}>⚡</span>
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
                  <div style={{ fontSize: 26, opacity: .35 }}>🐍</div>
                  <div>
                    <div style={{ fontSize: 12 }}>Stiskni ▶ Spustit nebo Ctrl+Enter</div>
                    <div style={{ fontSize: 11, opacity: .55 }}>Výstup print(), grafy a chyby se zobrazí zde</div>
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
