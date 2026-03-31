'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { runPython } from '@/lib/pyodide-runner'
import { DarkLayout, D, card, SectionLabel } from '@/components/DarkLayout'

// ── Storage helpers (localStorage) ──────────────────────────────────────────
const LS_KEY = 'cb_py_files'
interface PyFile { id: string; name: string; content: string; updatedAt: string }

function loadFiles(): PyFile[] {
  try { return JSON.parse(localStorage.getItem(LS_KEY) ?? '[]') } catch { return [] }
}
function saveFiles(files: PyFile[]) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(files)) } catch {}
}

const DEFAULT_CODE = `# Vítej v ClassBase Python editoru! 🐍
# Zkus napsat svůj první skript:

print("Ahoj, světe!")

# Příklady:
# for i in range(5):
#     print(f"Číslo: {i}")
`

export default function PythonEditor({ profile }: { profile: any }) {
  const accent = profile?.accent_color ?? '#7C3AED'

  // Files
  const [files, setFiles]   = useState<PyFile[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [code, setCode]     = useState(DEFAULT_CODE)
  const [fileName, setFileName] = useState('main.py')

  // Editor
  const editorRef    = useRef<any>(null)
  const monacoRef    = useRef<any>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [monacoReady, setMonacoReady] = useState(false)

  // Runner
  const [running, setRunning]       = useState(false)
  const [pyStatus, setPyStatus]     = useState('')
  const [outputLines, setOutputLines] = useState<string[]>([])
  const [runError, setRunError]     = useState<string | null>(null)
  const [figures, setFigures]       = useState<string[]>([])
  const [hasRun, setHasRun]         = useState(false)

  // UI
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameVal, setRenameVal]   = useState('')
  const [newFileModal, setNewFileModal] = useState(false)
  const [newFileName, setNewFileName] = useState('')

  // ── Load files from localStorage on mount ──
  useEffect(() => {
    const stored = loadFiles()
    if (stored.length > 0) {
      setFiles(stored)
      const first = stored[0]
      setActiveId(first.id)
      setCode(first.content)
      setFileName(first.name)
    } else {
      // Create default file
      const defaultFile: PyFile = { id: crypto.randomUUID(), name: 'main.py', content: DEFAULT_CODE, updatedAt: new Date().toISOString() }
      setFiles([defaultFile])
      setActiveId(defaultFile.id)
      saveFiles([defaultFile])
    }
  }, [])

  // ── Load Monaco from CDN ──
  useEffect(() => {
    if (typeof window === 'undefined') return
    const script = document.createElement('script')
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs/loader.min.js'
    script.onload = () => {
      const w = window as any
      w.require.config({ paths: { vs: 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs' } })
      w.require(['vs/editor/editor.main'], (monaco: any) => {
        monacoRef.current = monaco
        if (containerRef.current) initEditor(monaco)
        setMonacoReady(true)
      })
    }
    document.head.appendChild(script)
    return () => { editorRef.current?.dispose() }
  }, [])

  function initEditor(monaco: any) {
    if (!containerRef.current) return
    const editor = monaco.editor.create(containerRef.current, {
      value: code,
      language: 'python',
      theme: 'vs-dark',
      fontSize: 14,
      fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
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
      suggest: { snippetsPreventQuickSuggestions: false },
    })
    editorRef.current = editor
    editor.onDidChangeModelContent(() => {
      setCode(editor.getValue())
    })
    // Ctrl+Enter to run
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
      document.getElementById('run-btn')?.click()
    })
    // Update editor with current code after it's initialized
    editor.setValue(code)
  }

  // Update editor value when active file changes
  useEffect(() => {
    if (editorRef.current && monacoReady) {
      editorRef.current.setValue(code)
    }
  }, [activeId, monacoReady])

  // ── File operations ──
  function switchFile(file: PyFile) {
    // Save current code first
    if (activeId) {
      const updated = files.map(f => f.id === activeId ? { ...f, content: editorRef.current?.getValue() ?? code, updatedAt: new Date().toISOString() } : f)
      setFiles(updated)
      saveFiles(updated)
    }
    setActiveId(file.id)
    setCode(file.content)
    setFileName(file.name)
    editorRef.current?.setValue(file.content)
    setHasRun(false); setOutputLines([]); setRunError(null); setFigures([])
  }

  function saveCurrentFile() {
    const currentCode = editorRef.current?.getValue() ?? code
    const updated = files.map(f => f.id === activeId ? { ...f, content: currentCode, updatedAt: new Date().toISOString() } : f)
    setFiles(updated)
    saveFiles(updated)
  }

  function createNewFile() {
    const name = (newFileName.trim() || 'nový_skript') + (newFileName.includes('.py') ? '' : '.py')
    const newFile: PyFile = { id: crypto.randomUUID(), name, content: `# ${name}\n\n`, updatedAt: new Date().toISOString() }
    const updated = [...files, newFile]
    setFiles(updated)
    saveFiles(updated)
    switchFile(newFile)
    setNewFileModal(false)
    setNewFileName('')
  }

  function deleteFile(id: string) {
    if (files.length <= 1) return
    const updated = files.filter(f => f.id !== id)
    setFiles(updated)
    saveFiles(updated)
    if (activeId === id) switchFile(updated[0])
  }

  function renameFile(id: string) {
    const name = (renameVal.trim() || 'skript') + (renameVal.includes('.py') ? '' : '.py')
    const updated = files.map(f => f.id === id ? { ...f, name } : f)
    setFiles(updated)
    saveFiles(updated)
    if (activeId === id) setFileName(name)
    setRenamingId(null)
  }

  function downloadFile() {
    const currentCode = editorRef.current?.getValue() ?? code
    const blob = new Blob([currentCode], { type: 'text/x-python' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = fileName
    a.click()
  }

  // ── Run Python ──
  async function runCode() {
    saveCurrentFile()
    setRunning(true); setOutputLines([]); setRunError(null); setFigures([]); setHasRun(true)
    const currentCode = editorRef.current?.getValue() ?? code
    const lines: string[] = []
    try {
      const result = await runPython(
        currentCode,
        (line: string) => { lines.push(line); setOutputLines([...lines]) },
        (status: string) => setPyStatus(status)
      )
      setOutputLines(result.output ? result.output.split('\n') : lines)
      setRunError(result.error)
      setFigures(result.images ?? [])
    } catch (e: any) {
      setRunError(String(e))
    }
    setRunning(false); setPyStatus('')
  }

  // Format timestamp
  function fmtDate(iso: string) {
    return new Date(iso).toLocaleString('cs-CZ', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
  }

  const activeFile = files.find(f => f.id === activeId)
  const recentFiles = [...files].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()).slice(0, 3)

  const sideBtn: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 9, padding: '9px 12px', background: 'rgba(255,255,255,.04)', border: `1px solid ${D.border}`, borderRadius: D.radiusSm, color: D.txtSec, fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', width: '100%', textAlign: 'left' as const, transition: 'all .15s' }

  return (
    <DarkLayout profile={profile} activeRoute="/student/python">
      {/* New file modal */}
      {newFileModal && (
        <>
          <div onClick={() => setNewFileModal(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.65)', zIndex: 9998, backdropFilter: 'blur(4px)' }} />
          <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', zIndex: 9999, width: '100%', maxWidth: 360, padding: '0 16px' }}>
            <div style={{ background: D.bgCard, borderRadius: D.radius, padding: '28px 24px', border: `1px solid ${D.border}`, boxShadow: `0 0 50px ${accent}20` }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: D.txtPri, marginBottom: 6 }}>📄 Nový soubor</div>
              <p style={{ fontSize: 13, color: D.txtSec, marginBottom: 16 }}>Název souboru (bez přípony .py)</p>
              <input value={newFileName} onChange={e => setNewFileName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && createNewFile()} autoFocus placeholder="muj_skript"
                style={{ width: '100%', padding: '10px 13px', background: D.bgMid, border: `1px solid ${D.border}`, borderRadius: 10, fontSize: 14, color: D.txtPri, fontFamily: 'monospace', outline: 'none', marginBottom: 14 }} />
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={createNewFile} style={{ flex: 1, padding: '10px', background: accent, color: '#fff', border: 'none', borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Vytvořit</button>
                <button onClick={() => setNewFileModal(false)} style={{ padding: '10px 14px', background: D.bgMid, color: D.txtSec, border: `1px solid ${D.border}`, borderRadius: 9, cursor: 'pointer', fontFamily: 'inherit' }}>Zrušit</button>
              </div>
            </div>
          </div>
        </>
      )}

      <style>{`
        .py-file-item:hover { background: rgba(255,255,255,.06) !important; }
        .py-side-btn:hover { background: rgba(255,255,255,.07) !important; color: #fff !important; }
        @keyframes spin { to { transform: rotate(360deg) } }
      `}</style>

      {/* ── Page header ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
        <div style={{ width: 42, height: 42, borderRadius: 12, background: '#3B82F615', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <img src="/icons/python.png" alt="Python" style={{ width: 26, height: 26, objectFit: 'contain' }}
            onError={e => { (e.target as HTMLImageElement).style.display='none' }} />
        </div>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: D.txtPri, margin: '0 0 2px' }}>Python Editor</h1>
          <p style={{ fontSize: 12, color: D.txtSec, margin: 0 }}>Piš a spouštěj Python skripty přímo v prohlížeči · Ctrl+Enter pro spuštění</p>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, padding: '3px 9px', background: '#3B82F620', color: '#60A5FA', borderRadius: 20, fontWeight: 600 }}>🐍 Python 3.11</span>
          <span style={{ fontSize: 11, padding: '3px 9px', background: 'rgba(255,255,255,.06)', color: D.txtSec, borderRadius: 20 }}>Pyodide WASM</span>
        </div>
      </div>

      {/* ── 3-column layout ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr 320px', gap: 14, alignItems: 'start', height: 'calc(100vh - 200px)', minHeight: 500 }}>

        {/* ══ LEFT: File panel ══ */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, height: '100%', overflowY: 'auto' }}>

          {/* Actions */}
          <div style={card({ padding: '14px 14px' })}>
            <SectionLabel>Soubory</SectionLabel>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {[
                { icon: '💾', label: 'Uložit soubor', action: saveCurrentFile },
                { icon: '📄', label: 'Nový soubor',   action: () => setNewFileModal(true) },
                { icon: '⬇️', label: 'Stáhnout .py',  action: downloadFile },
              ].map(({ icon, label, action }) => (
                <button key={label} onClick={action} className="py-side-btn" style={sideBtn}>
                  <span style={{ fontSize: 15 }}>{icon}</span>
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Recent files */}
          {recentFiles.length > 0 && (
            <div style={card({ padding: '14px 14px' })}>
              <SectionLabel>Nedávné</SectionLabel>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {recentFiles.map(f => (
                  <div key={f.id} className="py-file-item"
                    onClick={() => switchFile(f)}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 9px', borderRadius: D.radiusSm, cursor: 'pointer', background: f.id === activeId ? accent + '20' : 'transparent', border: `1px solid ${f.id === activeId ? accent + '40' : 'transparent'}`, transition: 'all .15s' }}>
                    <span style={{ fontSize: 14 }}>🐍</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: f.id === activeId ? accent : D.txtPri, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</div>
                      <div style={{ fontSize: 10, color: D.txtSec }}>{fmtDate(f.updatedAt)}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* All files */}
          <div style={{ ...card({ padding: '14px 14px' }), flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <SectionLabel>Všechny soubory</SectionLabel>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {files.map(f => (
                <div key={f.id} className="py-file-item"
                  style={{ borderRadius: D.radiusSm, background: f.id === activeId ? accent + '15' : 'transparent', border: `1px solid ${f.id === activeId ? accent + '30' : 'transparent'}`, transition: 'all .15s' }}>
                  {renamingId === f.id ? (
                    <div style={{ display: 'flex', gap: 5, padding: '5px 8px' }}>
                      <input value={renameVal} onChange={e => setRenameVal(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') renameFile(f.id); if (e.key === 'Escape') setRenamingId(null) }}
                        autoFocus style={{ flex: 1, padding: '3px 7px', background: D.bgMid, border: `1px solid ${D.border}`, borderRadius: 6, fontSize: 12, color: D.txtPri, fontFamily: 'monospace', outline: 'none' }} />
                      <button onClick={() => renameFile(f.id)} style={{ padding: '3px 7px', background: accent, color: '#fff', border: 'none', borderRadius: 6, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>✓</button>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 9px', cursor: 'pointer' }} onClick={() => switchFile(f)}>
                      <span style={{ fontSize: 13 }}>🐍</span>
                      <span style={{ flex: 1, fontSize: 12, color: f.id === activeId ? accent : D.txtPri, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: f.id === activeId ? 600 : 400 }}>{f.name}</span>
                      <div style={{ display: 'flex', gap: 2, flexShrink: 0, opacity: 0 }} className="file-actions">
                        <button onClick={e => { e.stopPropagation(); setRenamingId(f.id); setRenameVal(f.name.replace('.py','')) }}
                          style={{ padding: '2px 5px', background: 'none', border: 'none', cursor: 'pointer', color: D.txtSec, fontSize: 11 }} title="Přejmenovat">✏</button>
                        {files.length > 1 && <button onClick={e => { e.stopPropagation(); deleteFile(f.id) }}
                          style={{ padding: '2px 5px', background: 'none', border: 'none', cursor: 'pointer', color: D.danger, fontSize: 11 }} title="Smazat">🗑</button>}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ══ CENTER: Monaco Editor ══ */}
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 0 }}>
          {/* Editor topbar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: D.bgCard, borderRadius: `${D.radius} ${D.radius} 0 0`, borderBottom: `1px solid ${D.border}`, border: `1px solid ${D.border}`, borderBottomWidth: 0 }}>
            {/* Tab */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '4px 12px', background: D.bgMid, borderRadius: 7, fontSize: 13, color: D.txtPri, fontWeight: 500 }}>
              <span style={{ fontSize: 14 }}>🐍</span>
              {activeFile?.name ?? fileName}
            </div>
            <div style={{ flex: 1 }} />
            {/* Status */}
            {pyStatus && (
              <span style={{ fontSize: 11, color: D.txtSec, display: 'flex', alignItems: 'center', gap: 5 }}>
                <div style={{ width: 12, height: 12, border: `2px solid ${D.border}`, borderTopColor: accent, borderRadius: '50%', animation: 'spin .6s linear infinite' }} />
                {pyStatus}
              </span>
            )}
            {/* Run button */}
            <button id="run-btn" onClick={runCode} disabled={running}
              style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '7px 16px', background: running ? D.bgMid : accent, color: running ? D.txtSec : '#fff', border: `1px solid ${running ? D.border : 'transparent'}`, borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: running ? 'not-allowed' : 'pointer', fontFamily: 'inherit', transition: 'all .2s' }}>
              {running
                ? <><div style={{ width: 14, height: 14, border: `2px solid ${D.border}`, borderTopColor: D.txtSec, borderRadius: '50%', animation: 'spin .6s linear infinite' }} />Spouštím…</>
                : <>▶ Spustit</>
              }
            </button>
            <span style={{ fontSize: 10, color: D.txtSec, opacity: .6 }}>Ctrl+Enter</span>
          </div>

          {/* Monaco container */}
          <div style={{ flex: 1, background: '#1E1E1E', border: `1px solid ${D.border}`, borderTop: 'none', borderRadius: `0 0 ${D.radius} ${D.radius}`, overflow: 'hidden', position: 'relative' }}>
            {!monacoReady && (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#1E1E1E', flexDirection: 'column', gap: 12 }}>
                <div style={{ width: 28, height: 28, border: `3px solid rgba(255,255,255,.1)`, borderTopColor: accent, borderRadius: '50%', animation: 'spin .8s linear infinite' }} />
                <span style={{ fontSize: 13, color: D.txtSec }}>Načítám Monaco Editor…</span>
              </div>
            )}
            <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
          </div>
        </div>

        {/* ══ RIGHT: Output panel ══ */}
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 12 }}>

          {/* Output header */}
          <div style={card({ padding: '0', overflow: 'hidden', flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 })}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: `1px solid ${D.border}` }}>
              <span style={{ fontSize: 14 }}>⚡</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: D.txtPri }}>Výstup</span>
              {hasRun && !running && (
                <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 20, background: runError ? D.danger + '20' : D.success + '20', color: runError ? D.danger : D.success, fontWeight: 700, marginLeft: 'auto' }}>
                  {runError ? '✗ Chyba' : '✓ Hotovo'}
                </span>
              )}
              {(outputLines.length > 0 || figures.length > 0) && (
                <button onClick={() => { setOutputLines([]); setRunError(null); setFigures([]); setHasRun(false) }}
                  style={{ marginLeft: hasRun ? 6 : 'auto', padding: '2px 8px', background: 'none', border: `1px solid ${D.border}`, borderRadius: 6, fontSize: 11, color: D.txtSec, cursor: 'pointer', fontFamily: 'inherit' }}>
                  Vymazat
                </button>
              )}
            </div>

            {/* Output body */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '14px', fontFamily: "'JetBrains Mono', 'Fira Code', monospace", fontSize: 12, lineHeight: 1.7 }}>
              {!hasRun && (
                <div style={{ color: D.txtSec, textAlign: 'center', paddingTop: 40 }}>
                  <div style={{ fontSize: 32, marginBottom: 10 }}>🐍</div>
                  <div style={{ fontSize: 13, marginBottom: 6 }}>Stiskni ▶ Spustit pro spuštění kódu</div>
                  <div style={{ fontSize: 11, color: D.txtSec, opacity: .6 }}>nebo Ctrl+Enter v editoru</div>
                </div>
              )}

              {running && outputLines.length === 0 && (
                <div style={{ color: D.txtSec, display: 'flex', alignItems: 'center', gap: 10, paddingTop: 20 }}>
                  <div style={{ width: 16, height: 16, border: `2px solid ${D.border}`, borderTopColor: accent, borderRadius: '50%', animation: 'spin .6s linear infinite', flexShrink: 0 }} />
                  {pyStatus || 'Inicializuji Python…'}
                </div>
              )}

              {/* Output lines */}
              {outputLines.map((line, i) => (
                <div key={i} style={{ color: line.startsWith('⚠') ? D.warning : D.txtPri, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                  {line || '\u00A0'}
                </div>
              ))}

              {/* Error */}
              {runError && (
                <div style={{ marginTop: 12, padding: '12px 14px', background: 'rgba(239,68,68,.1)', border: `1px solid rgba(239,68,68,.25)`, borderRadius: 10 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: D.danger, marginBottom: 6 }}>❌ Chyba</div>
                  <pre style={{ fontSize: 11, color: '#FCA5A5', whiteSpace: 'pre-wrap', margin: 0, fontFamily: 'inherit' }}>{runError}</pre>
                </div>
              )}

              {/* Matplotlib figures */}
              {figures.map((b64, i) => (
                <div key={i} style={{ marginTop: 14 }}>
                  <div style={{ fontSize: 10, color: D.txtSec, marginBottom: 6 }}>📊 Graf {figures.length > 1 ? i + 1 : ''}</div>
                  <img src={`data:image/png;base64,${b64}`} alt={`Graf ${i+1}`}
                    style={{ width: '100%', borderRadius: 10, border: `1px solid ${D.border}` }} />
                </div>
              ))}
            </div>
          </div>

          {/* Quick snippets */}
          <div style={card({ padding: '12px 14px' })}>
            <SectionLabel>Rychlé snippety</SectionLabel>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {[
                { label: 'Hello World', code: 'print("Ahoj, světe!")' },
                { label: 'For cyklus',  code: 'for i in range(10):\n    print(f"i = {i}")' },
                { label: 'Matplotlib',  code: 'import matplotlib.pyplot as plt\nimport numpy as np\n\nx = np.linspace(0, 2*np.pi, 100)\ny = np.sin(x)\n\nplt.figure(figsize=(8, 4))\nplt.plot(x, y, color="purple")\nplt.title("Sinusovka")\nplt.grid(True)\nplt.show()' },
                { label: 'Numpy array', code: 'import numpy as np\n\na = np.array([1, 2, 3, 4, 5])\nprint("Pole:", a)\nprint("Součet:", np.sum(a))\nprint("Průměr:", np.mean(a))' },
              ].map(({ label, code: snippet }) => (
                <button key={label} className="py-side-btn"
                  onClick={() => { editorRef.current?.setValue(snippet); setCode(snippet) }}
                  style={{ ...sideBtn, fontSize: 11, padding: '7px 10px' }}>
                  <span style={{ fontSize: 13 }}>📋</span>
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <style>{`
        .file-actions { opacity: 0 !important; }
        .py-file-item:hover .file-actions { opacity: 1 !important; }
      `}</style>
    </DarkLayout>
  )
}
