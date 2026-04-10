'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef, useState } from 'react'
import { DarkLayout, D } from '@/components/DarkLayout'
import { AssignmentEditorShell, EDITOR_EXTENSIONS } from '@/components/AssignmentEditorShell'

const LANGUAGE_MAP: Record<string, string> = {
  python:    'python',
  html:      'html',
  jupyter:   'json',
  sql:       'sql',
  microbit:  'python',
  vex:       'python',
  builder:   'json',
  flowchart: 'json',
}

const EDITOR_LABELS: Record<string, string> = {
  python:    '🐍 Python',
  html:      '🌐 HTML',
  jupyter:   '📓 Jupyter',
  sql:       '🗄️ SQL',
  microbit:  '🔬 micro:bit',
  vex:       '🤖 VEX IQ',
  builder:   '🧱 3D Builder',
  flowchart: '📊 Flowchart',
}

interface Props {
  profile: any
  assignmentId: string
  editorType: string
}

export default function AssignmentGenericEditor({ profile, assignmentId, editorType }: Props) {
  const accent = profile?.accent_color ?? '#7C3AED'
  const uid    = profile?.id as string
  const lang   = LANGUAGE_MAP[editorType] ?? 'plaintext'

  return (
    <DarkLayout profile={profile} activeRoute="/student/tasks" fullContent>
      <AssignmentEditorShell
        assignmentId={assignmentId}
        studentId={uid}
        editorType={editorType}
        accent={accent}
      >
        {({ initialContent, onContentChange, saveFile, readOnly }) => (
          <GenericMonacoEditor
            initialContent={initialContent}
            language={lang}
            readOnly={readOnly}
            accent={accent}
            editorLabel={EDITOR_LABELS[editorType] ?? editorType}
            onContentChange={onContentChange}
            onSave={saveFile}
          />
        )}
      </AssignmentEditorShell>
    </DarkLayout>
  )
}

function GenericMonacoEditor({ initialContent, language, readOnly, accent, editorLabel, onContentChange, onSave }: {
  initialContent: string
  language: string
  readOnly: boolean
  accent: string
  editorLabel: string
  onContentChange: (c: string) => void
  onSave: (c: string) => Promise<void>
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const editorRef    = useRef<any>(null)
  const [monacoReady, setMonacoReady] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')

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
          language,
          theme: 'cb-dark',
          fontSize: 14,
          minimap: { enabled: false },
          readOnly,
          automaticLayout: true,
          scrollBeyondLastLine: false,
          wordWrap: language === 'html' ? 'on' : 'off',
          padding: { top: 12, bottom: 12 },
        })
        ed.onDidChangeModelContent(() => onContentChange(ed.getValue()))
        editorRef.current = ed
        setMonacoReady(true)
      })
    }
    document.head.appendChild(s)
    return () => { editorRef.current?.dispose() }
  }, [])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', borderBottom: `1px solid ${D.border}`, flexShrink: 0, background: D.bgCard }}>
        <span style={{ fontSize: 13, color: D.txtSec }}>{editorLabel}</span>
        <div style={{ flex: 1 }} />
        {readOnly
          ? <span style={{ fontSize: 12, color: '#3b82f6', fontWeight: 600 }}>👁 Režim čtení — úkol byl odevzdán</span>
          : (
            <button onClick={async () => {
              if (!editorRef.current) return
              setSaving(true)
              await onSave(editorRef.current.getValue())
              setSaveMsg('✓ Uloženo'); setTimeout(() => setSaveMsg(''), 2000)
              setSaving(false)
            }} disabled={saving}
              style={{ padding: '5px 14px', background: 'rgba(255,255,255,.06)', color: D.txtSec, border: `1px solid ${D.border}`, borderRadius: 7, fontSize: 12, cursor: 'pointer' }}>
              {saving ? '…' : '💾 Uložit'}
            </button>
          )
        }
        {saveMsg && <span style={{ fontSize: 12, color: '#22c55e' }}>{saveMsg}</span>}
      </div>

      {/* Editor */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        {!monacoReady && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0d1117', color: D.txtSec, fontSize: 13 }}>
            Načítám editor…
          </div>
        )}
        <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
      </div>
    </div>
  )
}
