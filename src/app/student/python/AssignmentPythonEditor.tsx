'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef, useState } from 'react'
import { DarkLayout, D } from '@/components/DarkLayout'
import { AssignmentEditorShell } from '@/components/AssignmentEditorShell'
import { runPython } from '@/lib/pyodide-runner'

interface Props {
  profile: any
  assignmentId: string
}

export default function AssignmentPythonEditor({ profile, assignmentId }: Props) {
  const accent = profile?.accent_color ?? '#7C3AED'
  const uid    = profile?.id as string

  return (
    <DarkLayout profile={profile} activeRoute="/student/tasks" fullContent>
      <AssignmentEditorShell
        assignmentId={assignmentId}
        studentId={uid}
        editorType="python"
        accent={accent}
      >
        {({ initialContent, onContentChange, saveFile, readOnly }) => (
          <PythonCodeEditor
            initialContent={initialContent}
            readOnly={readOnly}
            accent={accent}
            onContentChange={onContentChange}
            onSave={saveFile}
          />
        )}
      </AssignmentEditorShell>
    </DarkLayout>
  )
}

// ── Minimal Monaco Python editor ──────────────────────────────────────────────
function PythonCodeEditor({ initialContent, readOnly, accent, onContentChange, onSave }: {
  initialContent: string
  readOnly: boolean
  accent: string
  onContentChange: (c: string) => void
  onSave: (c: string) => Promise<void>
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const editorRef    = useRef<any>(null)
  const [monacoReady, setMonacoReady] = useState(false)
  const [running, setRunning] = useState(false)
  const [output, setOutput]   = useState<string[]>([])
  const [runErr, setRunErr]   = useState<string | null>(null)
  const [saving, setSaving]   = useState(false)
  const [saveMsg, setSaveMsg] = useState('')

  // Load Monaco
  useEffect(() => {
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
          ],
          colors: { 'editor.background': '#0d1117' },
        })
        const ed = monaco.editor.create(containerRef.current, {
          value: initialContent,
          language: 'python',
          theme: 'cb-dark',
          fontSize: 14,
          minimap: { enabled: false },
          readOnly,
          automaticLayout: true,
          scrollBeyondLastLine: false,
          lineNumbers: 'on',
          wordWrap: 'on',
          padding: { top: 12, bottom: 12 },
        })
        ed.onDidChangeModelContent(() => {
          onContentChange(ed.getValue())
        })
        ed.addCommand((window as any).monaco?.KeyMod?.CtrlCmd | 83, async () => {
          const content = ed.getValue()
          setSaving(true)
          await onSave(content)
          setSaveMsg('✓ Uloženo'); setTimeout(() => setSaveMsg(''), 2000)
          setSaving(false)
        })
        editorRef.current = ed
        setMonacoReady(true)
      })
    }
    document.head.appendChild(s)
    return () => { editorRef.current?.dispose() }
  }, [])

  async function run() {
    if (!editorRef.current) return
    setRunning(true); setOutput([]); setRunErr(null)
    const code = editorRef.current.getValue()
    try {
      const result = await runPython(code, () => '', lines => setOutput(p => [...p, ...lines]))
      if (result.error) setRunErr(result.error)
    } catch (e: any) { setRunErr(e.message) }
    setRunning(false)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', borderBottom: `1px solid ${D.border}`, flexShrink: 0, background: D.bgCard }}>
        {!readOnly && (
          <>
            <button onClick={run} disabled={running}
              style={{ padding: '5px 16px', background: accent, color: '#fff', border: 'none', borderRadius: 7, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
              {running ? '⏳ Spouštím…' : '▶ Spustit'}
            </button>
            <button onClick={async () => {
              if (!editorRef.current) return
              setSaving(true)
              await onSave(editorRef.current.getValue())
              setSaveMsg('✓ Uloženo'); setTimeout(() => setSaveMsg(''), 2000)
              setSaving(false)
            }} disabled={saving}
              style={{ padding: '5px 12px', background: 'rgba(255,255,255,.06)', color: D.txtSec, border: `1px solid ${D.border}`, borderRadius: 7, fontSize: 12, cursor: 'pointer' }}>
              {saving ? '…' : '💾 Uložit'}
            </button>
          </>
        )}
        {readOnly && <span style={{ fontSize: 12, color: '#3b82f6', fontWeight: 600 }}>👁 Režim čtení — úkol byl odevzdán</span>}
        <div style={{ flex: 1 }} />
        {saveMsg && <span style={{ fontSize: 12, color: '#22c55e' }}>{saveMsg}</span>}
      </div>

      {/* Editor */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        {!monacoReady && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0d1117', color: D.txtSec, fontSize: 13 }}>
            Načítám editor…
          </div>
        )}
        <div ref={containerRef} style={{ width: '100%', height: output.length > 0 || runErr ? 'calc(100% - 160px)' : '100%', minHeight: 0 }} />

        {/* Output */}
        {(output.length > 0 || runErr || running) && (
          <div style={{ height: 160, borderTop: `1px solid ${D.border}`, background: '#0a0d13', fontFamily: 'monospace', fontSize: 12, overflowY: 'auto', padding: 10 }}>
            {output.map((l, i) => <div key={i} style={{ color: '#e2e8f0', lineHeight: 1.6 }}>{l}</div>)}
            {runErr && <div style={{ color: '#ef4444', marginTop: 4 }}>{runErr}</div>}
            {running && <div style={{ color: D.txtSec }}>⏳ Spouštím…</div>}
          </div>
        )}
      </div>
    </div>
  )
}
