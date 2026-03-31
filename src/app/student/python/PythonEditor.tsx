'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { runPython } from '@/lib/pyodide-runner'
import { DarkLayout, D, card, SectionLabel } from '@/components/DarkLayout'

// ── Types ──────────────────────────────────────────────────────────────────
interface PyFile {
  id: string          // Supabase storage path: zaci/{uid}/{name}
  name: string
  updatedAt: string
  size?: number
  // loaded lazily
  content?: string
}

const DEFAULT_CODE = `# Vítej v ClassBase Python editoru! 🐍
print("Ahoj, světe!")

# Příklady:
# for i in range(5):
#     print(f"Číslo: {i}")
`

const BUCKET = 'python-files'
function storagePath(uid: string, name: string) { return `zaci/${uid}/${name}` }

// ── Snippets ───────────────────────────────────────────────────────────────
const SNIPPETS = [
  { label: 'Hello World', code: 'print("Ahoj, světe!")' },
  { label: 'For cyklus',  code: 'for i in range(10):\n    print(f"i = {i}")' },
  { label: 'Matplotlib',  code: 'import matplotlib.pyplot as plt\nimport numpy as np\n\nx = np.linspace(0, 2*np.pi, 100)\ny = np.sin(x)\n\nplt.figure(figsize=(8,4))\nplt.plot(x, y, color="purple", linewidth=2)\nplt.title("Sinusovka")\nplt.grid(True, alpha=0.3)\nplt.tight_layout()\nplt.show()' },
  { label: 'NumPy pole',  code: 'import numpy as np\n\na = np.array([1, 2, 3, 4, 5])\nprint("Pole:", a)\nprint("Součet:", np.sum(a))\nprint("Průměr:", np.mean(a))\nprint("Std:", np.std(a).round(3))' },
  { label: 'Input()',     code: 'jmeno = input("Jak se jmenuješ? ")\nprint(f"Ahoj, {jmeno}! 👋")' },
]

export default function PythonEditor({ profile }: { profile: any }) {
  const supabase = createClient()
  const accent = profile?.accent_color ?? '#7C3AED'
  const uid = profile?.id as string

  // ── File state ─────────────────────────────────────────────────────────
  const [files, setFiles]         = useState<PyFile[]>([])
  const [loadingFiles, setLoadingFiles] = useState(true)
  const [activeFile, setActiveFile]   = useState<PyFile | null>(null)
  const [code, setCode]           = useState(DEFAULT_CODE)
  const [isDirty, setIsDirty]     = useState(false)

  // ── Editor ─────────────────────────────────────────────────────────────
  const editorRef    = useRef<any>(null)
  const monacoRef    = useRef<any>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [monacoReady, setMonacoReady] = useState(false)

  // ── Runner ─────────────────────────────────────────────────────────────
  const [running, setRunning]         = useState(false)
  const [pyStatus, setPyStatus]       = useState('')
  const [outputLines, setOutputLines] = useState<string[]>([])
  const [runError, setRunError]       = useState<string | null>(null)
  const [figures, setFigures]         = useState<string[]>([])
  const [hasRun, setHasRun]           = useState(false)

  // ── UI state ───────────────────────────────────────────────────────────
  const [saving, setSaving]               = useState(false)
  const [saveMsg, setSaveMsg]             = useState('')
  const [renamingId, setRenamingId]       = useState<string | null>(null)
  const [renameVal, setRenameVal]         = useState('')
  // Modals
  const [newFileModal, setNewFileModal]   = useState(false)
  const [newFileName, setNewFileName]     = useState('')
  const [saveAsModal, setSaveAsModal]     = useState(false)
  const [saveAsName, setSaveAsName]       = useState('')
  const [deleteModal, setDeleteModal]     = useState<PyFile | null>(null)

  // ── Load files list from Supabase storage ──────────────────────────────
  const refreshFiles = useCallback(async () => {
    setLoadingFiles(true)
    const prefix = `zaci/${uid}/`
    const { data, error } = await supabase.storage.from(BUCKET).list(`zaci/${uid}`, {
      limit: 100, sortBy: { column: 'updated_at', order: 'desc' }
    })
    if (error || !data) { setLoadingFiles(false); return }
    const list: PyFile[] = data
      .filter(f => f.name.endsWith('.py'))
      .map(f => ({
        id: prefix + f.name,
        name: f.name,
        updatedAt: f.updated_at ?? new Date().toISOString(),
        size: f.metadata?.size,
      }))
    setFiles(list)
    setLoadingFiles(false)
    return list
  }, [uid])

  // ── Load file content from storage ─────────────────────────────────────
  async function loadFileContent(file: PyFile): Promise<string> {
    const { data, error } = await supabase.storage.from(BUCKET).download(file.id)
    if (error || !data) return ''
    return await data.text()
  }

  // ── Monaco loader ───────────────────────────────────────────────────────
  useEffect(() => {
    if (typeof window === 'undefined') return
    const s = document.createElement('script')
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs/loader.min.js'
    s.onload = () => {
      const w = window as any
      w.require.config({ paths: { vs: 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs' } })
      w.require(['vs/editor/editor.main'], (monaco: any) => {
        monacoRef.current = monaco
        if (containerRef.current) initEditor(monaco, DEFAULT_CODE)
        setMonacoReady(true)
      })
    }
    document.head.appendChild(s)
    return () => { editorRef.current?.dispose() }
  }, [])

  function initEditor(monaco: any, initialCode: string) {
    if (!containerRef.current || editorRef.current) return
    const editor = monaco.editor.create(containerRef.current, {
      value: initialCode,
      language: 'python',
      theme: 'vs-dark',
      fontSize: 14,
      fontFamily: "'JetBrains Mono','Fira Code','Cascadia Code',monospace",
      fontLigatures: true,
      minimap: { enabled: false },
      lineNumbers: 'on',
      wordWrap: 'on',
      automaticLayout: true,
      scrollBeyondLastLine: false,
      renderLineHighlight: 'line',
      cursorBlinking: 'smooth',
      smoothScrolling: true,
      padding: { top: 16, bottom: 16 },
      bracketPairColorization: { enabled: true },
    })
    editorRef.current = editor
    editor.onDidChangeModelContent(() => {
      setCode(editor.getValue())
      setIsDirty(true)
    })
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
      document.getElementById('py-run-btn')?.click()
    })
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      document.getElementById('py-save-btn')?.click()
    })
  }

  // ── Init: load files, open first one ───────────────────────────────────
  useEffect(() => {
    (async () => {
      const list = await refreshFiles()
      if (list && list.length > 0) {
        await openFile(list[0])
      } else {
        // No files yet — create a default one
        await uploadFile('main.py', DEFAULT_CODE, true)
      }
    })()
  }, [])

  // ── Open a file (load content + set editor) ─────────────────────────────
  async function openFile(file: PyFile) {
    const content = await loadFileContent(file)
    setActiveFile(file)
    setCode(content)
    setIsDirty(false)
    editorRef.current?.setValue(content)
    clearOutput()
  }

  function clearOutput() {
    setHasRun(false); setOutputLines([]); setRunError(null); setFigures([])
  }

  // ── Upload/save a file to Supabase storage ──────────────────────────────
  async function uploadFile(name: string, content: string, silent = false): Promise<boolean> {
    const path = storagePath(uid, name)
    const blob = new Blob([content], { type: 'text/x-python' })
    const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { upsert: true })
    if (error) { flashMsg('❌ ' + error.message); return false }
    if (!silent) flashMsg('✓ Uloženo')
    return true
  }

  function flashMsg(msg: string) {
    setSaveMsg(msg)
    setTimeout(() => setSaveMsg(''), 2500)
  }

  // ── Save current file ───────────────────────────────────────────────────
  async function saveCurrentFile() {
    if (!activeFile) return
    setSaving(true)
    const content = editorRef.current?.getValue() ?? code
    await uploadFile(activeFile.name, content)
    setIsDirty(false)
    await refreshFiles()
    setSaving(false)
  }

  // ── Save As ─────────────────────────────────────────────────────────────
  async function saveAs() {
    let name = saveAsName.trim()
    if (!name) return
    if (!name.endsWith('.py')) name += '.py'
    setSaving(true)
    const content = editorRef.current?.getValue() ?? code
    const ok = await uploadFile(name, content)
    if (ok) {
      const newList = await refreshFiles() ?? []
      const created = newList.find(f => f.name === name)
      if (created) { setActiveFile(created); setIsDirty(false) }
    }
    setSaveAsModal(false); setSaveAsName(''); setSaving(false)
  }

  // ── Create new file ─────────────────────────────────────────────────────
  async function createNewFile() {
    let name = newFileName.trim() || 'nový_skript'
    if (!name.endsWith('.py')) name += '.py'
    setSaving(true)
    const ok = await uploadFile(name, `# ${name}\n\n`, true)
    if (ok) {
      const newList = await refreshFiles() ?? []
      const created = newList.find(f => f.name === name)
      if (created) await openFile(created)
    }
    setNewFileModal(false); setNewFileName(''); setSaving(false)
  }

  // ── Rename file ─────────────────────────────────────────────────────────
  async function renameFile(file: PyFile) {
    let newName = renameVal.trim()
    if (!newName || newName === file.name.replace('.py','')) { setRenamingId(null); return }
    if (!newName.endsWith('.py')) newName += '.py'
    setSaving(true)
    // Download content, re-upload with new name, delete old
    const content = await loadFileContent(file)
    const newPath = storagePath(uid, newName)
    const blob = new Blob([content], { type: 'text/x-python' })
    const { error } = await supabase.storage.from(BUCKET).upload(newPath, blob, { upsert: true })
    if (!error) await supabase.storage.from(BUCKET).remove([file.id])
    const newList = await refreshFiles() ?? []
    if (activeFile?.id === file.id) {
      const renamed = newList.find(f => f.name === newName)
      if (renamed) setActiveFile(renamed)
    }
    setRenamingId(null); setSaving(false)
  }

  // ── Delete file ─────────────────────────────────────────────────────────
  async function deleteFile(file: PyFile) {
    setSaving(true)
    await supabase.storage.from(BUCKET).remove([file.id])
    const newList = await refreshFiles() ?? []
    if (activeFile?.id === file.id) {
      if (newList.length > 0) await openFile(newList[0])
      else { setActiveFile(null); setCode(''); editorRef.current?.setValue('') }
    }
    setDeleteModal(null); setSaving(false)
  }

  // ── Download ──────────────────────────────────────────────────────────
  function downloadFile() {
    const content = editorRef.current?.getValue() ?? code
    const blob = new Blob([content], { type: 'text/x-python' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob); a.download = activeFile?.name ?? 'skript.py'; a.click()
  }

  // ── Run Python ────────────────────────────────────────────────────────
  async function runCode() {
    setRunning(true); clearOutput(); setHasRun(true)
    const currentCode = editorRef.current?.getValue() ?? code
    const lines: string[] = []
    try {
      const result = await runPython(
        currentCode,
        (line: string) => { lines.push(line); setOutputLines([...lines]) },
        (s: string) => setPyStatus(s)
      )
      setOutputLines(result.output ? result.output.split('\n') : lines)
      setRunError(result.error); setFigures(result.images ?? [])
    } catch (e: any) { setRunError(String(e)) }
    setRunning(false); setPyStatus('')
  }

  // ── Helpers ────────────────────────────────────────────────────────────
  function fmtDate(iso: string) {
    return new Date(iso).toLocaleString('cs-CZ', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
  }
  function fmtSize(bytes?: number) {
    if (!bytes) return ''
    return bytes < 1024 ? `${bytes} B` : `${(bytes/1024).toFixed(1)} kB`
  }

  const recentFiles = files.slice(0, 3)

  // ── Shared styles ──────────────────────────────────────────────────────
  const sideBtn: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 9, padding: '9px 12px',
    background: 'rgba(255,255,255,.04)', border: `1px solid ${D.border}`,
    borderRadius: D.radiusSm, color: D.txtSec, fontSize: 12, fontWeight: 500,
    cursor: 'pointer', fontFamily: 'inherit', width: '100%',
    textAlign: 'left' as const, transition: 'all .15s',
  }

  const modalInp: React.CSSProperties = {
    width: '100%', padding: '10px 13px', background: D.bgMid,
    border: `1px solid ${D.border}`, borderRadius: 10, fontSize: 14,
    color: D.txtPri, fontFamily: 'monospace', outline: 'none', boxSizing: 'border-box' as const,
  }

  // ── Modal: generic reusable ────────────────────────────────────────────
  function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
    return (
      <>
        <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)', zIndex: 9998, backdropFilter: 'blur(4px)' }} />
        <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', zIndex: 9999, width: '100%', maxWidth: 380, padding: '0 16px' }}>
          <div style={{ background: D.bgCard, borderRadius: D.radius, padding: '28px 24px', border: `1px solid ${D.border}`, boxShadow: `0 24px 64px rgba(0,0,0,.6)` }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: D.txtPri, marginBottom: 16 }}>{title}</div>
            {children}
          </div>
        </div>
      </>
    )
  }

  return (
    <DarkLayout profile={profile} activeRoute="/student/python">

      {/* ── New file modal ── */}
      {newFileModal && (
        <Modal title="📄 Nový soubor" onClose={() => setNewFileModal(false)}>
          <p style={{ fontSize: 13, color: D.txtSec, marginBottom: 14 }}>Název souboru (přípona .py se přidá automaticky)</p>
          <input value={newFileName} onChange={e => setNewFileName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && createNewFile()} autoFocus placeholder="muj_skript"
            style={{ ...modalInp, marginBottom: 14 }} />
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={createNewFile} disabled={saving}
              style={{ flex: 1, padding: '10px', background: accent, color: '#fff', border: 'none', borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', opacity: saving ? .6 : 1 }}>
              {saving ? '…' : 'Vytvořit'}
            </button>
            <button onClick={() => setNewFileModal(false)} style={{ padding: '10px 14px', background: D.bgMid, color: D.txtSec, border: `1px solid ${D.border}`, borderRadius: 9, cursor: 'pointer', fontFamily: 'inherit' }}>Zrušit</button>
          </div>
        </Modal>
      )}

      {/* ── Save As modal ── */}
      {saveAsModal && (
        <Modal title="💾 Uložit jako…" onClose={() => setSaveAsModal(false)}>
          <p style={{ fontSize: 13, color: D.txtSec, marginBottom: 14 }}>Zadejte nový název souboru</p>
          <input value={saveAsName} onChange={e => setSaveAsName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && saveAs()} autoFocus placeholder={activeFile?.name ?? 'nový_skript.py'}
            style={{ ...modalInp, marginBottom: 14 }} />
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={saveAs} disabled={saving || !saveAsName.trim()}
              style={{ flex: 1, padding: '10px', background: accent, color: '#fff', border: 'none', borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', opacity: saving || !saveAsName.trim() ? .5 : 1 }}>
              {saving ? '…' : 'Uložit'}
            </button>
            <button onClick={() => setSaveAsModal(false)} style={{ padding: '10px 14px', background: D.bgMid, color: D.txtSec, border: `1px solid ${D.border}`, borderRadius: 9, cursor: 'pointer', fontFamily: 'inherit' }}>Zrušit</button>
          </div>
        </Modal>
      )}

      {/* ── Delete confirm modal ── */}
      {deleteModal && (
        <Modal title="🗑 Smazat soubor" onClose={() => setDeleteModal(null)}>
          <p style={{ fontSize: 13, color: D.txtSec, marginBottom: 8, lineHeight: 1.6 }}>
            Opravdu chcete smazat <strong style={{ color: D.txtPri }}>{deleteModal.name}</strong>?
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
        .py-file-row:hover .py-file-acts { opacity: 1 !important; }
        @keyframes spin { to { transform: rotate(360deg) } }
      `}</style>

      {/* ── Page header ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20, flexWrap: 'wrap' }}>
        <div style={{ width: 42, height: 42, borderRadius: 12, background: '#3B82F615', border: `1px solid #3B82F620`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <img src="/icons/python.png" alt="Python" style={{ width: 26, height: 26, objectFit: 'contain' }} onError={e => { (e.target as HTMLImageElement).style.display='none' }} />
        </div>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: D.txtPri, margin: '0 0 2px' }}>Python Editor</h1>
          <p style={{ fontSize: 12, color: D.txtSec, margin: 0 }}>Piš a spouštěj Python skripty · Ctrl+S uložit · Ctrl+Enter spustit</p>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          {saveMsg && <span style={{ fontSize: 12, color: saveMsg.startsWith('❌') ? D.danger : D.success, fontWeight: 600 }}>{saveMsg}</span>}
          {isDirty && !saveMsg && <span style={{ fontSize: 11, color: D.warning }}>● Neuloženo</span>}
          <span style={{ fontSize: 11, padding: '3px 9px', background: '#3B82F615', color: '#60A5FA', borderRadius: 20, fontWeight: 600 }}>🐍 Python 3.11</span>
          <span style={{ fontSize: 11, padding: '3px 9px', background: 'rgba(255,255,255,.05)', color: D.txtSec, borderRadius: 20 }}>Pyodide WASM</span>
        </div>
      </div>

      {/* ── Main 3-col: [sidebar] [editor + output] ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 14, alignItems: 'start', height: 'calc(100vh - 210px)', minHeight: 540 }}>

        {/* ══ LEFT: File panel ══ */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, height: '100%', overflowY: 'auto' }}>

          {/* File actions */}
          <div style={card({ padding: '14px' })}>
            <SectionLabel>Soubory</SectionLabel>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {[
                { icon: '💾', label: 'Uložit soubor',  id: 'py-save-btn', action: saveCurrentFile, disabled: !activeFile || saving },
                { icon: '📋', label: 'Uložit jako…',   id: 'py-saveas-btn', action: () => { setSaveAsName(activeFile?.name.replace('.py','') ?? ''); setSaveAsModal(true) }, disabled: saving },
                { icon: '📄', label: 'Nový soubor',    id: '', action: () => setNewFileModal(true), disabled: saving },
                { icon: '⬇️', label: 'Stáhnout .py',  id: '', action: downloadFile, disabled: !activeFile },
              ].map(({ icon, label, id, action, disabled }) => (
                <button key={label} id={id || undefined} onClick={action} disabled={disabled}
                  className="py-side-btn" style={{ ...sideBtn, opacity: disabled ? .4 : 1 }}>
                  <span style={{ fontSize: 15 }}>{icon}</span>{label}
                </button>
              ))}
            </div>
          </div>

          {/* Snippets */}
          <div style={card({ padding: '14px' })}>
            <SectionLabel>Snippety</SectionLabel>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {SNIPPETS.map(({ label, code: snippet }) => (
                <button key={label} className="py-side-btn"
                  onClick={() => { editorRef.current?.setValue(snippet); setCode(snippet); setIsDirty(true) }}
                  style={{ ...sideBtn, fontSize: 11, padding: '7px 10px' }}>
                  <span style={{ fontSize: 13 }}>📋</span>{label}
                </button>
              ))}
            </div>
          </div>

          {/* Recent files */}
          <div style={card({ padding: '14px' })}>
            <SectionLabel>Nedávné</SectionLabel>
            {loadingFiles
              ? <div style={{ fontSize: 12, color: D.txtSec, textAlign: 'center', padding: '10px 0' }}>Načítám…</div>
              : recentFiles.length === 0
                ? <div style={{ fontSize: 12, color: D.txtSec }}>Žádné soubory</div>
                : recentFiles.map(f => (
                    <div key={f.id} className="py-file-row"
                      onClick={() => openFile(f)}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 8px', borderRadius: D.radiusSm, cursor: 'pointer', background: f.id === activeFile?.id ? accent + '15' : 'transparent', marginBottom: 3 }}>
                      <span style={{ fontSize: 14 }}>🐍</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: f.id === activeFile?.id ? accent : D.txtPri, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</div>
                        <div style={{ fontSize: 10, color: D.txtSec }}>{fmtDate(f.updatedAt)}</div>
                      </div>
                    </div>
                  ))
            }
          </div>

          {/* All files */}
          <div style={{ ...card({ padding: '14px' }), flex: 1, minHeight: 0 }}>
            <SectionLabel>Všechny soubory</SectionLabel>
            {loadingFiles
              ? <div style={{ fontSize: 12, color: D.txtSec, textAlign: 'center', padding: '8px 0' }}>Načítám…</div>
              : files.length === 0
                ? <div style={{ fontSize: 12, color: D.txtSec }}>Žádné soubory v cloudovém úložišti</div>
                : files.map(f => (
                    <div key={f.id} className="py-file-row" style={{ borderRadius: D.radiusSm, background: f.id === activeFile?.id ? accent + '12' : 'transparent', marginBottom: 2 }}>
                      {renamingId === f.id ? (
                        <div style={{ display: 'flex', gap: 5, padding: '5px 7px' }}>
                          <input value={renameVal}
                            onChange={e => setRenameVal(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') renameFile(f); if (e.key === 'Escape') setRenamingId(null) }}
                            autoFocus
                            style={{ flex: 1, padding: '3px 7px', background: D.bgMid, border: `1px solid ${D.border}`, borderRadius: 6, fontSize: 12, color: D.txtPri, fontFamily: 'monospace', outline: 'none' }} />
                          <button onClick={() => renameFile(f)} style={{ padding: '3px 8px', background: accent, color: '#fff', border: 'none', borderRadius: 6, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>✓</button>
                          <button onClick={() => setRenamingId(null)} style={{ padding: '3px 7px', background: D.bgMid, color: D.txtSec, border: `1px solid ${D.border}`, borderRadius: 6, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>✕</button>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 8px', cursor: 'pointer' }} onClick={() => openFile(f)}>
                          <span style={{ fontSize: 13 }}>🐍</span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 12, color: f.id === activeFile?.id ? accent : D.txtPri, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: f.id === activeFile?.id ? 600 : 400 }}>{f.name}</div>
                            {f.size && <div style={{ fontSize: 10, color: D.txtSec }}>{fmtSize(f.size)}</div>}
                          </div>
                          <div className="py-file-acts" style={{ display: 'flex', gap: 1, opacity: 0, flexShrink: 0 }}>
                            <button onClick={e => { e.stopPropagation(); setRenamingId(f.id); setRenameVal(f.name.replace(/\.py$/, '')) }}
                              style={{ padding: '3px 5px', background: 'none', border: 'none', cursor: 'pointer', color: D.txtSec, fontSize: 12, borderRadius: 5 }} title="Přejmenovat">✏</button>
                            <button onClick={e => { e.stopPropagation(); setDeleteModal(f) }}
                              style={{ padding: '3px 5px', background: 'none', border: 'none', cursor: 'pointer', color: D.danger, fontSize: 12, borderRadius: 5 }} title="Smazat">🗑</button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))
            }
          </div>
        </div>

        {/* ══ RIGHT: Editor (top) + Output (bottom) ══ */}
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 12 }}>

          {/* Editor topbar */}
          <div style={{ background: D.bgCard, border: `1px solid ${D.border}`, borderRadius: `${D.radius} ${D.radius} 0 0`, borderBottomWidth: 0, display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', flexShrink: 0 }}>
            {/* File tab */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '4px 12px', background: D.bgMid, borderRadius: 7, fontSize: 13, color: D.txtPri, fontWeight: 500, maxWidth: 240, overflow: 'hidden' }}>
              <span>🐍</span>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {activeFile?.name ?? 'main.py'}{isDirty ? ' ●' : ''}
              </span>
            </div>
            <div style={{ flex: 1 }} />
            {/* Status spinner */}
            {pyStatus && (
              <span style={{ fontSize: 11, color: D.txtSec, display: 'flex', alignItems: 'center', gap: 5 }}>
                <div style={{ width: 12, height: 12, border: `2px solid ${D.border}`, borderTopColor: accent, borderRadius: '50%', animation: 'spin .6s linear infinite' }} />
                {pyStatus}
              </span>
            )}
            {/* Save button */}
            <button id="py-save-btn" onClick={saveCurrentFile} disabled={!activeFile || saving}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', background: 'rgba(255,255,255,.06)', color: isDirty ? D.warning : D.txtSec, border: `1px solid ${isDirty ? D.warning + '40' : D.border}`, borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', transition: 'all .2s' }}>
              💾 Uložit
            </button>
            {/* Run button */}
            <button id="py-run-btn" onClick={runCode} disabled={running}
              style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '7px 18px', background: running ? D.bgMid : accent, color: running ? D.txtSec : '#fff', border: `1px solid ${running ? D.border : 'transparent'}`, borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: running ? 'not-allowed' : 'pointer', fontFamily: 'inherit', transition: 'all .2s' }}>
              {running
                ? <><div style={{ width: 13, height: 13, border: `2px solid ${D.border}`, borderTopColor: D.txtSec, borderRadius: '50%', animation: 'spin .6s linear infinite' }} />Spouštím…</>
                : <>▶ Spustit</>}
            </button>
            <span style={{ fontSize: 10, color: D.txtSec, opacity: .5 }}>Ctrl+Enter</span>
          </div>

          {/* Monaco container — takes 60% of the column height */}
          <div style={{ flex: '0 0 58%', background: '#1E1E1E', border: `1px solid ${D.border}`, borderTop: 'none', borderRadius: `0 0 ${D.radius} ${D.radius}`, overflow: 'hidden', position: 'relative' }}>
            {!monacoReady && (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#1E1E1E', flexDirection: 'column', gap: 12 }}>
                <div style={{ width: 28, height: 28, border: `3px solid rgba(255,255,255,.08)`, borderTopColor: accent, borderRadius: '50%', animation: 'spin .8s linear infinite' }} />
                <span style={{ fontSize: 13, color: D.txtSec }}>Načítám Monaco Editor…</span>
              </div>
            )}
            <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
          </div>

          {/* Output panel — takes remaining space */}
          <div style={{ ...card({ overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 0 }), flex: 1 }}>
            {/* Output header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: `1px solid ${D.border}`, flexShrink: 0 }}>
              <span style={{ fontSize: 14 }}>⚡</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: D.txtPri }}>Výstup</span>
              {hasRun && !running && (
                <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 20, background: runError ? D.danger+'20' : D.success+'20', color: runError ? D.danger : D.success, fontWeight: 700 }}>
                  {runError ? '✗ Chyba' : '✓ Hotovo'}
                </span>
              )}
              <div style={{ flex: 1 }} />
              {(outputLines.length > 0 || figures.length > 0 || runError) && (
                <button onClick={clearOutput}
                  style={{ padding: '2px 9px', background: 'none', border: `1px solid ${D.border}`, borderRadius: 6, fontSize: 11, color: D.txtSec, cursor: 'pointer', fontFamily: 'inherit' }}>
                  Vymazat
                </button>
              )}
            </div>

            {/* Output body */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px', fontFamily: "'JetBrains Mono','Fira Code',monospace", fontSize: 12, lineHeight: 1.7 }}>
              {!hasRun && (
                <div style={{ color: D.txtSec, display: 'flex', alignItems: 'center', gap: 16, padding: '8px 0' }}>
                  <div style={{ fontSize: 28, opacity: .4 }}>🐍</div>
                  <div>
                    <div style={{ fontSize: 13 }}>Stiskni ▶ Spustit nebo Ctrl+Enter</div>
                    <div style={{ fontSize: 11, opacity: .6 }}>Výstup print(), grafy matplotlib a chyby se zobrazí zde</div>
                  </div>
                </div>
              )}
              {running && outputLines.length === 0 && (
                <div style={{ color: D.txtSec, display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 14, height: 14, border: `2px solid ${D.border}`, borderTopColor: accent, borderRadius: '50%', animation: 'spin .6s linear infinite', flexShrink: 0 }} />
                  {pyStatus || 'Inicializuji Python…'}
                </div>
              )}
              {outputLines.map((line, i) => (
                <div key={i} style={{ color: line.startsWith('⚠') ? D.warning : D.txtPri, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                  {line || '\u00A0'}
                </div>
              ))}
              {runError && (
                <div style={{ marginTop: 10, padding: '11px 14px', background: 'rgba(239,68,68,.1)', border: `1px solid rgba(239,68,68,.25)`, borderRadius: 10 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: D.danger, marginBottom: 5 }}>❌ Chyba</div>
                  <pre style={{ fontSize: 11, color: '#FCA5A5', whiteSpace: 'pre-wrap', margin: 0, fontFamily: 'inherit' }}>{runError}</pre>
                </div>
              )}
              {figures.map((b64, i) => (
                <div key={i} style={{ marginTop: 12 }}>
                  <div style={{ fontSize: 10, color: D.txtSec, marginBottom: 5 }}>📊 Graf {figures.length > 1 ? i+1 : ''}</div>
                  <img src={`data:image/png;base64,${b64}`} alt={`Graf ${i+1}`}
                    style={{ maxWidth: '100%', borderRadius: 10, border: `1px solid ${D.border}` }} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </DarkLayout>
  )
}
