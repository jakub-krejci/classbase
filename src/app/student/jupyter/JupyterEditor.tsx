'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useRef, useCallback, useId } from 'react'
import { createClient } from '@/lib/supabase/client'
import { runPython } from '@/lib/pyodide-runner'
import { DarkLayout, D, card, SectionLabel } from '@/components/DarkLayout'

// ── Constants ─────────────────────────────────────────────────────────────────
const BUCKET    = 'jupyter-files'
const LS_RECENT = 'cb_jup_recent'
const LS_LAST   = 'cb_jup_last'

// ── Types ─────────────────────────────────────────────────────────────────────
type CellType = 'code' | 'markdown'
type CellStatus = 'idle' | 'running' | 'done' | 'error'

interface Cell {
  id: string
  type: CellType
  source: string
  outputs: CellOutput[]
  executionCount: number | null
  status: CellStatus
}
interface CellOutput {
  type: 'text' | 'error' | 'image'
  text?: string
  b64?: string
}
interface Notebook {
  cells: Cell[]
  metadata: { kernelspec?: any; language_info?: any }
  nbformat: number
  nbformat_minor: number
}
interface NbFile { path: string; name: string; project: string; updatedAt: string }
interface FolderFile { name: string; path: string; size?: number }
interface FolderInfo  { name: string; files: FolderFile[] }
interface Project { name: string; key: string; files: NbFile[]; folders: FolderInfo[] }
interface RecentEntry { path: string; name: string; project: string; openedAt: string }

// ── Helpers ───────────────────────────────────────────────────────────────────
function sanitizeKey(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._\-]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '') || 'notebook'
}
function nbPath(uid: string, proj: string, name: string) {
  return `zaci/${uid}/${sanitizeKey(proj)}/${sanitizeKey(name)}`
}
function newCell(type: CellType = 'code'): Cell {
  return { id: Math.random().toString(36).slice(2), type, source: '', outputs: [], executionCount: null, status: 'idle' }
}
function emptyNotebook(): Notebook {
  return { cells: [newCell('code')], metadata: {}, nbformat: 4, nbformat_minor: 5 }
}
function notebookToJson(nb: Notebook): string {
  const ipynb = {
    nbformat: nb.nbformat, nbformat_minor: nb.nbformat_minor, metadata: nb.metadata,
    cells: nb.cells.map(c => ({
      cell_type: c.type,
      source: c.source.split('\n').map((l, i, a) => i < a.length - 1 ? l + '\n' : l),
      metadata: { executionCount: c.executionCount },
      outputs: c.type === 'code' ? c.outputs.map(o => {
        if (o.type === 'image') return { output_type: 'display_data', data: { 'image/png': o.b64 }, metadata: {} }
        if (o.type === 'error') return { output_type: 'error', ename: 'Error', evalue: o.text ?? '', traceback: [o.text ?? ''] }
        return { output_type: 'stream', name: 'stdout', text: (o.text ?? '').split('\n').map((l, i, a) => i < a.length - 1 ? l + '\n' : l) }
      }) : [],
      execution_count: c.executionCount,
    }))
  }
  return JSON.stringify(ipynb, null, 2)
}
function jsonToNotebook(json: string): Notebook {
  try {
    const ipynb = JSON.parse(json)
    const cells: Cell[] = (ipynb.cells ?? []).map((c: any) => {
      const source = Array.isArray(c.source) ? c.source.join('') : (c.source ?? '')
      const outputs: CellOutput[] = (c.outputs ?? []).map((o: any) => {
        if (o.output_type === 'display_data' && o.data?.['image/png'])
          return { type: 'image' as const, b64: o.data['image/png'] }
        if (o.output_type === 'error')
          return { type: 'error' as const, text: [o.ename, o.evalue, ...(o.traceback ?? [])].join('\n') }
        const text = Array.isArray(o.text) ? o.text.join('') : (o.text ?? '')
        return { type: 'text' as const, text }
      })
      return { id: Math.random().toString(36).slice(2), type: c.cell_type === 'markdown' ? 'markdown' : 'code', source, outputs, executionCount: c.execution_count ?? null, status: 'idle' as const }
    })
    return { cells: cells.length > 0 ? cells : [newCell()], metadata: ipynb.metadata ?? {}, nbformat: 4, nbformat_minor: 5 }
  } catch { return emptyNotebook() }
}

// ── Markdown renderer (simple) ─────────────────────────────────────────────────
function renderMarkdown(src: string): string {
  let h = src
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/^### (.+)$/gm, '<h3 style="margin:.4em 0;font-size:1.1em">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 style="margin:.5em 0;font-size:1.3em">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 style="margin:.5em 0;font-size:1.6em">$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code style="background:rgba(255,255,255,.1);padding:1px 5px;border-radius:4px;font-family:monospace">$1</code>')
    .replace(/^- (.+)$/gm, '<li style="margin-left:1.2em;list-style:disc">$1</li>')
    .replace(/^\d+\. (.+)$/gm, '<li style="margin-left:1.2em;list-style:decimal">$1</li>')
    .replace(/\n/g, '<br>')
  return h
}

// ── Main component ────────────────────────────────────────────────────────────
export default function JupyterEditor({ profile }: { profile: any }) {
  const supabase = createClient()
  const accent   = profile?.accent_color ?? '#7C3AED'
  const uid      = profile?.id as string

  // ── Notebook state ──────────────────────────────────────────────────────────
  const [notebook, setNotebook]         = useState<Notebook>(emptyNotebook())
  const [activeFile, setActiveFile]     = useState<NbFile | null>(null)
  const [isDirty, setIsDirty]           = useState(false)
  const [executionOrder, setExecOrder]  = useState(0)
  const [selectedCell, setSelectedCell] = useState<string | null>(null)
  const [editingCell, setEditingCell]   = useState<string | null>(null)
  const kernelRunning                   = useRef(false)
  const monacoRef    = useRef<any>(null)
  const [monacoLoaded, setMonacoLoaded] = useState(false)

  // ── Projects ────────────────────────────────────────────────────────────────
  const [projects, setProjects]         = useState<Project[]>([])
  const [loadingProj, setLoadingProj]   = useState(true)
  const [recent, setRecent]             = useState<RecentEntry[]>([])
  const [expandedProj, setExpandedProj] = useState<Set<string>>(new Set())

  // ── UI state ────────────────────────────────────────────────────────────────
  const [saving, setSaving]             = useState(false)
  const [saveMsg, setSaveMsg]           = useState('')
  const [uploadingFile, setUploadingFile] = useState(false)
  const imgInputRef = useRef<HTMLInputElement>(null)
  const uploadFolderTarget = useRef<string>('')

  // Modals
  const [newProjModal, setNewProjModal]     = useState(false)
  const [newProjName, setNewProjName]       = useState('')
  const [newFileModal, setNewFileModal]     = useState(false)
  const [newFileName, setNewFileName]       = useState('')
  const [newFileProj, setNewFileProj]       = useState('')
  const [openModal, setOpenModal]           = useState(false)
  const [newFolderModal, setNewFolderModal] = useState<string | null>(null) // project key
  const [newFolderName, setNewFolderName]   = useState('')
  const [deleteFileModal, setDeleteFileModal] = useState<NbFile | null>(null)
  const [deleteProjModal, setDeleteProjModal] = useState<Project | null>(null)
  const [renameProjModal, setRenameProjModal] = useState<Project | null>(null)
  const [renameProjVal, setRenameProjVal]   = useState('')
  const [renameFileModal, setRenameFileModal] = useState<NbFile | null>(null)
  const [renameFileVal, setRenameFileVal]   = useState('')
  const [renameFolderModal, setRenameFolderModal] = useState<{ proj: string; folder: FolderInfo } | null>(null)
  const [renameFolderVal, setRenameFolderVal] = useState('')
  const [deleteFolderModal, setDeleteFolderModal] = useState<{ proj: string; folder: FolderInfo } | null>(null)

  // ── Storage helpers ─────────────────────────────────────────────────────────
  async function pushText(path: string, content: string): Promise<string | null> {
    const blob = new Blob([content], { type: 'text/plain' })
    await supabase.storage.from(BUCKET).remove([path])
    const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: 'text/plain', cacheControl: '0' })
    return error ? error.message : null
  }
  async function fetchText(path: string): Promise<string> {
    const { data } = await supabase.storage.from(BUCKET).download(path + '?t=' + Date.now())
    if (!data) return ''
    return await data.text()
  }

  // ── Refresh projects ────────────────────────────────────────────────────────
  const refreshProjects = useCallback(async (): Promise<Project[]> => {
    setLoadingProj(true)
    const { data: top } = await supabase.storage.from(BUCKET).list(`zaci/${uid}`, { limit: 200 })
    if (!top) { setLoadingProj(false); return [] }
    const result: Project[] = []
    for (const item of top) {
      if ((item.metadata !== null && item.metadata !== undefined) || item.name.includes('.')) continue
      const { data: rootFiles } = await supabase.storage.from(BUCKET).list(`zaci/${uid}/${item.name}`, { limit: 200 })
      const files: NbFile[] = []
      const folders: FolderInfo[] = []
      for (const f of rootFiles ?? []) {
        if (f.metadata === null || f.metadata === undefined) {
          if (!f.name.includes('.')) {
            // List folder contents
            const { data: folderFiles } = await supabase.storage.from(BUCKET).list(`zaci/${uid}/${item.name}/${f.name}`, { limit: 200 })
            const fItems = (folderFiles ?? []).filter(x => x.name !== '.gitkeep' && x.metadata !== null)
            folders.push({ name: f.name, files: fItems.map(x => ({ name: x.name, path: `zaci/${uid}/${item.name}/${f.name}/${x.name}`, size: x.metadata?.size })) })
          }
        } else if (f.name.endsWith('.ipynb')) {
          files.push({ path: `zaci/${uid}/${item.name}/${f.name}`, name: f.name, project: item.name, updatedAt: f.updated_at ?? '' })
        }
      }
      result.push({ name: item.name, key: item.name, files, folders })
    }
    setProjects(result)
    setLoadingProj(false)
    return result
  }, [uid])

  // ── Open notebook ───────────────────────────────────────────────────────────
  async function openNotebook(file: NbFile) {
    const json = await fetchText(file.path)
    const nb = jsonToNotebook(json)
    setNotebook(nb)
    setActiveFile(file)
    setIsDirty(false)
    setSelectedCell(nb.cells[0]?.id ?? null)
    setEditingCell(null)
    const entry: RecentEntry = { path: file.path, name: file.name, project: file.project, openedAt: new Date().toISOString() }
    setRecent(prev => { const n = [entry, ...prev.filter(r => r.path !== file.path)].slice(0, 3); try { localStorage.setItem(LS_RECENT, JSON.stringify(n)) } catch {}; return n })
    try { localStorage.setItem(LS_LAST, file.path) } catch {}
    setExpandedProj(prev => new Set([...prev, file.project]))
    setOpenModal(false)
  }

  // ── Load Monaco ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (typeof window === 'undefined') return
    const s = document.createElement('script')
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs/loader.min.js'
    s.onload = () => {
      const w = window as any
      w.require.config({ paths: { vs: 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs' } })
      w.require(['vs/editor/editor.main'], (monaco: any) => {
        monacoRef.current = monaco
        setMonacoLoaded(true)
      })
    }
    document.head.appendChild(s)
  }, [])

  // ── Init ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    try { setRecent(JSON.parse(localStorage.getItem(LS_RECENT) ?? '[]')) } catch {}
    ;(async () => {
      const projs = await refreshProjects()
      const lastPath = localStorage.getItem(LS_LAST)
      if (lastPath) {
        for (const p of projs) {
          const f = p.files.find(x => x.path === lastPath)
          if (f) { await openNotebook(f); return }
        }
      }
      if (projs.length > 0 && projs[0].files.length > 0) await openNotebook(projs[0].files[0])
      else await doCreateProject('Muj_notebook', true)
    })()
  }, [])

  function flash(msg: string) { setSaveMsg(msg); setTimeout(() => setSaveMsg(''), 2800) }

  // ── Save notebook ───────────────────────────────────────────────────────────
  async function saveNotebook() {
    if (!activeFile) return
    setSaving(true)
    const json = notebookToJson(notebook)
    const err = await pushText(activeFile.path, json)
    if (err) flash('❌ ' + err)
    else { flash('✓ Uloženo'); setIsDirty(false) }
    setSaving(false)
  }

  // ── Download notebook ──────────────────────────────────────────────────────
  function downloadNotebook() {
    const json = notebookToJson(notebook)
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }))
    a.download = activeFile?.name ?? 'notebook.ipynb'
    a.style.display = 'none'
    document.body.appendChild(a); a.click()
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(a.href) }, 1000)
  }

  // ── Create project ──────────────────────────────────────────────────────────
  async function doCreateProject(name: string, silent = false) {
    const key = sanitizeKey(name.trim() || 'projekt')
    const path = `zaci/${uid}/${key}/notebook.ipynb`
    setSaving(true)
    const nb = emptyNotebook()
    const err = await pushText(path, notebookToJson(nb))
    if (!err) {
      const projs = await refreshProjects()
      const f = projs.find(p => p.key === key)?.files[0]
      if (f) await openNotebook(f)
      if (!silent) flash('✓ Projekt vytvořen')
    } else flash('❌ ' + err)
    setNewProjModal(false); setNewProjName(''); setSaving(false)
  }

  // ── Delete project ──────────────────────────────────────────────────────────
  async function doDeleteProject(proj: Project) {
    setSaving(true)
    const paths = proj.files.map(f => f.path)
    if (paths.length) await supabase.storage.from(BUCKET).remove(paths)
    const projs = await refreshProjects()
    if (activeFile?.project === proj.key) {
      const all = projs.flatMap(p => p.files)
      if (all.length) await openNotebook(all[0])
      else { setActiveFile(null); setNotebook(emptyNotebook()) }
    }
    setRecent(prev => { const n = prev.filter(r => r.project !== proj.key); try { localStorage.setItem(LS_RECENT, JSON.stringify(n)) } catch {}; return n })
    setDeleteProjModal(null); setSaving(false)
  }

  // ── Rename project ──────────────────────────────────────────────────────────
  async function doRenameProject(proj: Project) {
    const newKey = sanitizeKey(renameProjVal.trim() || proj.name)
    if (newKey === proj.key) { setRenameProjModal(null); return }
    setSaving(true)
    for (const f of proj.files) {
      const content = await fetchText(f.path)
      const newPath = f.path.replace(`/${proj.key}/`, `/${newKey}/`)
      await pushText(newPath, content)
      await supabase.storage.from(BUCKET).remove([f.path])
    }
    const projs = await refreshProjects()
    if (activeFile?.project === proj.key) {
      const p = projs.find(x => x.key === newKey)
      if (p?.files[0]) await openNotebook(p.files[0])
    }
    setRenameProjModal(null); setSaving(false)
  }

  // ── Create new notebook file ────────────────────────────────────────────────
  async function doNewFile() {
    let name = newFileName.trim() || 'notebook'
    if (!name.endsWith('.ipynb')) name += '.ipynb'
    const proj = newFileProj || projects[0]?.key || 'projekt'
    const path = nbPath(uid, proj, name)
    setSaving(true)
    const err = await pushText(path, notebookToJson(emptyNotebook()))
    if (!err) {
      const projs = await refreshProjects()
      const f = projs.flatMap(p => p.files).find(x => x.path === path)
      if (f) await openNotebook(f)
    } else flash('❌ ' + err)
    setNewFileModal(false); setNewFileName(''); setSaving(false)
  }

  // ── Create folder ───────────────────────────────────────────────────────────
  async function doNewFolder(projKey: string) {
    const name = sanitizeKey(newFolderName.trim() || 'soubory')
    setSaving(true)
    await pushText(`zaci/${uid}/${projKey}/${name}/.gitkeep`, '')
    await refreshProjects()
    setNewFolderModal(null); setNewFolderName(''); setSaving(false)
  }

  // ── Upload files to folder ──────────────────────────────────────────────────
  async function uploadFilesToFolder(fileList: FileList, projKey: string, folder: string) {
    setUploadingFile(true)
    for (const file of Array.from(fileList)) {
      const path = `zaci/${uid}/${projKey}/${folder}/${file.name}`
      await supabase.storage.from(BUCKET).remove([path])
      await supabase.storage.from(BUCKET).upload(path, file, { contentType: 'application/octet-stream', cacheControl: '0' })
    }
    await refreshProjects()
    flash(`✓ ${fileList.length} souborů nahráno`)
    setUploadingFile(false)
  }

  // ── Delete notebook file ────────────────────────────────────────────────────
  async function doDeleteFile(file: NbFile) {
    setSaving(true)
    await supabase.storage.from(BUCKET).remove([file.path])
    const projs = await refreshProjects()
    if (activeFile?.path === file.path) {
      const all = projs.flatMap(p => p.files)
      if (all.length) await openNotebook(all[0])
      else { setActiveFile(null); setNotebook(emptyNotebook()) }
    }
    setRecent(prev => { const n = prev.filter(r => r.path !== file.path); try { localStorage.setItem(LS_RECENT, JSON.stringify(n)) } catch {}; return n })
    setDeleteFileModal(null); setSaving(false)
  }

  // ── Rename notebook file ───────────────────────────────────────────────────
  async function doRenameFile(file: NbFile) {
    let name = renameFileVal.trim()
    if (!name) { setRenameFileModal(null); return }
    if (!name.endsWith('.ipynb')) name += '.ipynb'
    if (name === file.name) { setRenameFileModal(null); return }
    const newPath = `zaci/${uid}/${file.project}/${sanitizeKey(name)}`
    setSaving(true)
    const content = await fetchText(file.path)
    await pushText(newPath, content)
    await supabase.storage.from(BUCKET).remove([file.path])
    const projs = await refreshProjects()
    if (activeFile?.path === file.path) {
      const renamed = projs.flatMap(p => p.files).find(f => f.path === newPath)
      if (renamed) {
        setActiveFile(renamed)
        setRecent(prev => { const n = prev.map(r => r.path === file.path ? { ...r, path: newPath, name } : r); try { localStorage.setItem(LS_RECENT, JSON.stringify(n)) } catch {}; return n })
        try { localStorage.setItem(LS_LAST, newPath) } catch {}
      }
    }
    setRenameFileModal(null); setSaving(false)
  }

  // ── Rename folder ───────────────────────────────────────────────────────────
  async function doRenameFolder(projKey: string, folder: FolderInfo) {
    const newName = sanitizeKey(renameFolderVal.trim() || folder.name)
    if (newName === folder.name) { setRenameFolderModal(null); return }
    setSaving(true)
    // Move all files inside
    for (const f of folder.files) {
      const newPath = `zaci/${uid}/${projKey}/${newName}/${f.name}`
      const { data } = await supabase.storage.from(BUCKET).download(f.path)
      if (data) {
        await supabase.storage.from(BUCKET).remove([newPath])
        await supabase.storage.from(BUCKET).upload(newPath, data, { contentType: 'application/octet-stream', cacheControl: '0' })
        await supabase.storage.from(BUCKET).remove([f.path])
      }
    }
    // If folder was empty, create gitkeep in new location
    if (folder.files.length === 0) {
      await pushText(`zaci/${uid}/${projKey}/${newName}/.gitkeep`, '')
    }
    // Remove old gitkeep
    await supabase.storage.from(BUCKET).remove([`zaci/${uid}/${projKey}/${folder.name}/.gitkeep`])
    await refreshProjects()
    setRenameFolderModal(null); setSaving(false)
  }

  // ── Delete folder ───────────────────────────────────────────────────────────
  async function doDeleteFolder(projKey: string, folder: FolderInfo) {
    setSaving(true)
    const paths = [...folder.files.map(f => f.path), `zaci/${uid}/${projKey}/${folder.name}/.gitkeep`]
    await supabase.storage.from(BUCKET).remove(paths)
    await refreshProjects()
    setDeleteFolderModal(null); setSaving(false)
  }

  // ── Cell operations ─────────────────────────────────────────────────────────
  function updateCell(id: string, patch: Partial<Cell>) {
    setNotebook(prev => ({ ...prev, cells: prev.cells.map(c => c.id === id ? { ...c, ...patch } : c) }))
    setIsDirty(true)
  }
  function addCellAfter(id: string, type: CellType = 'code') {
    const c = newCell(type)
    setNotebook(prev => {
      const idx = prev.cells.findIndex(x => x.id === id)
      const cells = [...prev.cells]
      cells.splice(idx + 1, 0, c)
      return { ...prev, cells }
    })
    setSelectedCell(c.id); setEditingCell(c.id); setIsDirty(true)
  }
  function addCellBefore(id: string, type: CellType = 'code') {
    const c = newCell(type)
    setNotebook(prev => {
      const idx = prev.cells.findIndex(x => x.id === id)
      const cells = [...prev.cells]
      cells.splice(idx, 0, c)
      return { ...prev, cells }
    })
    setSelectedCell(c.id); setEditingCell(c.id); setIsDirty(true)
  }
  function deleteCell(id: string) {
    setNotebook(prev => {
      const cells = prev.cells.filter(c => c.id !== id)
      return { ...prev, cells: cells.length > 0 ? cells : [newCell()] }
    })
    setIsDirty(true)
  }
  function moveCellUp(id: string) {
    setNotebook(prev => {
      const idx = prev.cells.findIndex(c => c.id === id)
      if (idx <= 0) return prev
      const cells = [...prev.cells]
      ;[cells[idx - 1], cells[idx]] = [cells[idx], cells[idx - 1]]
      return { ...prev, cells }
    })
    setIsDirty(true)
  }
  function moveCellDown(id: string) {
    setNotebook(prev => {
      const idx = prev.cells.findIndex(c => c.id === id)
      if (idx >= prev.cells.length - 1) return prev
      const cells = [...prev.cells]
      ;[cells[idx], cells[idx + 1]] = [cells[idx + 1], cells[idx]]
      return { ...prev, cells }
    })
    setIsDirty(true)
  }
  function clearAllOutputs() {
    setNotebook(prev => ({ ...prev, cells: prev.cells.map(c => ({ ...c, outputs: [], status: 'idle' as CellStatus, executionCount: null })) }))
    setIsDirty(true)
  }

  // ── Run a single code cell ──────────────────────────────────────────────────
  async function runCell(id: string) {
    const cell = notebook.cells.find(c => c.id === id)
    if (!cell || cell.type !== 'code') return
    kernelRunning.current = true
    updateCell(id, { status: 'running', outputs: [] })
    const lines: string[] = []
    const order = executionOrder + 1
    setExecOrder(order)

    // Gather all other code cells for import support (cross-cell variables won't work in Pyodide
    // without a shared namespace, but we can at least run imports/defs from previous cells)
    // Build extraFiles from notebook name for module support
    try {
      const result = await runPython(
        cell.source,
        (line: string) => {
          lines.push(line)
          updateCell(id, { outputs: [...lines.map(l => ({ type: 'text' as const, text: l }))] })
        },
        () => {}
      )
      const outputs: CellOutput[] = []
      const outText = result.output ? result.output.split('\n') : lines
      if (outText.some(l => l.trim())) outputs.push(...outText.filter(l => l.trim()).map(l => ({ type: 'text' as const, text: l })))
      if (result.images?.length) outputs.push(...result.images.map(b64 => ({ type: 'image' as const, b64 })))
      if (result.error) outputs.push({ type: 'error', text: result.error })
      updateCell(id, { status: result.error ? 'error' : 'done', outputs, executionCount: order })
    } catch (e: any) {
      updateCell(id, { status: 'error', outputs: [{ type: 'error', text: String(e) }], executionCount: order })
    }
    kernelRunning.current = false
    setIsDirty(true)
  }

  // ── Run all cells ───────────────────────────────────────────────────────────
  async function runAllCells() {
    for (const cell of notebook.cells) {
      if (cell.type === 'code') await runCell(cell.id)
    }
  }

  // ── Keyboard shortcuts ──────────────────────────────────────────────────────
  function onCellKeyDown(e: React.KeyboardEvent, cell: Cell) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault(); runCell(cell.id)
      // Move to next cell or create new
      const idx = notebook.cells.findIndex(c => c.id === cell.id)
      const next = notebook.cells[idx + 1]
      if (next) { setSelectedCell(next.id); setEditingCell(null) }
      else addCellAfter(cell.id)
    }
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'Enter') {
      e.preventDefault(); runCell(cell.id)
    }
    if (e.key === 'Escape') setEditingCell(null)
  }

  // ── Styles ──────────────────────────────────────────────────────────────────
  const sideBtn: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, padding: '8px 11px', background: 'rgba(255,255,255,.04)', border: `1px solid ${D.border}`, borderRadius: D.radiusSm, color: D.txtSec, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', width: '100%', textAlign: 'left' as const, transition: 'all .15s' }
  const modalInp: React.CSSProperties = { width: '100%', padding: '10px 13px', background: D.bgMid, border: `1px solid ${D.border}`, borderRadius: 10, fontSize: 14, color: D.txtPri, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' as const }

  function Modal({ title, onClose, children, width = 420 }: { title: string; onClose: () => void; children: React.ReactNode; width?: number }) {
    return (
      <>
        <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.72)', zIndex: 9998, backdropFilter: 'blur(5px)' }} />
        <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', zIndex: 9999, width: '100%', maxWidth: width, padding: '0 16px' }}>
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
        <button onClick={onOk} disabled={disabled || saving} style={{ flex: 1, padding: '10px', background: danger ? D.danger : accent, color: '#fff', border: 'none', borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: disabled || saving ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: disabled || saving ? .4 : 1 }}>{saving ? '…' : label}</button>
        <button onClick={onCancel} style={{ padding: '10px 14px', background: D.bgMid, color: D.txtSec, border: `1px solid ${D.border}`, borderRadius: 9, cursor: 'pointer', fontFamily: 'inherit' }}>Zrušit</button>
      </div>
    )
  }

  const projSel: React.CSSProperties = { width: '100%', padding: '8px 10px', background: D.bgMid, border: `1px solid ${D.border}`, borderRadius: 8, fontSize: 13, color: D.txtPri, fontFamily: 'inherit', outline: 'none', marginTop: 8 }

  return (
    <DarkLayout profile={profile} activeRoute="/student/jupyter">

      {/* ── Modals ── */}
      {newProjModal && (
        <Modal title="📓 Nový projekt" onClose={() => setNewProjModal(false)}>
          <p style={{ fontSize: 13, color: D.txtSec, marginBottom: 12 }}>Název projektu — automaticky se vytvoří notebook.ipynb</p>
          <input value={newProjName} onChange={e => setNewProjName(e.target.value)} onKeyDown={e => e.key === 'Enter' && newProjName.trim() && doCreateProject(newProjName)} autoFocus placeholder="Můj projekt" style={{ ...modalInp, marginBottom: 14 }} />
          <MBtns onOk={() => doCreateProject(newProjName)} onCancel={() => setNewProjModal(false)} label="Vytvořit" disabled={!newProjName.trim()} />
        </Modal>
      )}
      {newFileModal && (
        <Modal title="📄 Nový notebook" onClose={() => setNewFileModal(false)}>
          <p style={{ fontSize: 13, color: D.txtSec, marginBottom: 10 }}>Název souboru</p>
          <input value={newFileName} onChange={e => setNewFileName(e.target.value)} onKeyDown={e => e.key === 'Enter' && newFileName.trim() && doNewFile()} autoFocus placeholder="notebook.ipynb" style={{ ...modalInp }} />
          <p style={{ fontSize: 12, color: D.txtSec, marginTop: 10, marginBottom: 6 }}>Projekt</p>
          <select value={newFileProj || projects[0]?.key || ''} onChange={e => setNewFileProj(e.target.value)} style={projSel}>
            {projects.map(p => <option key={p.key} value={p.key}>{p.name}</option>)}
          </select>
          <div style={{ marginTop: 14 }}>
            <MBtns onOk={doNewFile} onCancel={() => setNewFileModal(false)} label="Vytvořit" disabled={!newFileName.trim()} />
          </div>
        </Modal>
      )}
      {openModal && (
        <Modal title="📂 Otevřít notebook" onClose={() => setOpenModal(false)} width={460}>
          <div style={{ maxHeight: 380, overflowY: 'auto', marginBottom: 14 }}>
            {loadingProj
              ? <div style={{ fontSize: 13, color: D.txtSec, textAlign: 'center', padding: '20px 0' }}>Načítám…</div>
              : projects.map(proj => (
                  <div key={proj.key} style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: D.txtSec, textTransform: 'uppercase', marginBottom: 6 }}>📁 {proj.name}</div>
                    {proj.files.length === 0
                      ? <div style={{ fontSize: 12, color: D.txtSec, paddingLeft: 12 }}>Žádné notebooky</div>
                      : proj.files.map(f => (
                          <div key={f.path} onClick={() => openNotebook(f)}
                            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 8, cursor: 'pointer', marginBottom: 3, background: f.path === activeFile?.path ? accent+'15' : 'transparent' }} className="jup-row">
                            <span style={{ fontSize: 15 }}>📓</span>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: 13, fontWeight: 600, color: f.path === activeFile?.path ? accent : D.txtPri }}>{f.name}</div>
                            </div>
                          </div>
                        ))
                    }
                  </div>
                ))
            }
          </div>
          <button onClick={() => setOpenModal(false)} style={{ width: '100%', padding: '10px', background: D.bgMid, color: D.txtSec, border: `1px solid ${D.border}`, borderRadius: 9, cursor: 'pointer', fontFamily: 'inherit' }}>Zavřít</button>
        </Modal>
      )}
      {deleteProjModal && (
        <Modal title="🗑 Smazat projekt" onClose={() => setDeleteProjModal(null)}>
          <p style={{ fontSize: 13, color: D.txtSec, marginBottom: 6 }}>Smazat projekt <strong style={{ color: D.txtPri }}>{deleteProjModal.name}</strong> a všechny notebooky?</p>
          <p style={{ fontSize: 12, color: D.danger, marginBottom: 18 }}>Tato akce je nevratná.</p>
          <MBtns onOk={() => doDeleteProject(deleteProjModal)} onCancel={() => setDeleteProjModal(null)} label="Smazat" danger />
        </Modal>
      )}
      {renameProjModal && (
        <Modal title="✏ Přejmenovat projekt" onClose={() => setRenameProjModal(null)}>
          <input value={renameProjVal} onChange={e => setRenameProjVal(e.target.value)} onKeyDown={e => e.key === 'Enter' && renameProjVal.trim() && doRenameProject(renameProjModal)} autoFocus placeholder={renameProjModal.name} style={{ ...modalInp, marginBottom: 14 }} />
          <MBtns onOk={() => doRenameProject(renameProjModal)} onCancel={() => setRenameProjModal(null)} label="Přejmenovat" disabled={!renameProjVal.trim()} />
        </Modal>
      )}
      {deleteFileModal && (
        <Modal title="🗑 Smazat notebook" onClose={() => setDeleteFileModal(null)}>
          <p style={{ fontSize: 13, color: D.txtSec, marginBottom: 6 }}>Smazat <strong style={{ color: D.txtPri }}>{deleteFileModal.name}</strong>?</p>
          <p style={{ fontSize: 12, color: D.danger, marginBottom: 18 }}>Tato akce je nevratná.</p>
          <MBtns onOk={() => doDeleteFile(deleteFileModal)} onCancel={() => setDeleteFileModal(null)} label="Smazat" danger />
        </Modal>
      )}
      {renameFileModal && (
        <Modal title="✏ Přejmenovat notebook" onClose={() => setRenameFileModal(null)}>
          <input value={renameFileVal} onChange={e => setRenameFileVal(e.target.value)} onKeyDown={e => e.key === 'Enter' && renameFileVal.trim() && doRenameFile(renameFileModal)} autoFocus placeholder={renameFileModal.name} style={{ ...modalInp, marginBottom: 14 }} />
          <MBtns onOk={() => doRenameFile(renameFileModal)} onCancel={() => setRenameFileModal(null)} label="Přejmenovat" disabled={!renameFileVal.trim()} />
        </Modal>
      )}
      {renameFolderModal && (
        <Modal title="✏ Přejmenovat složku" onClose={() => setRenameFolderModal(null)}>
          <input value={renameFolderVal} onChange={e => setRenameFolderVal(e.target.value)} onKeyDown={e => e.key === 'Enter' && renameFolderVal.trim() && doRenameFolder(renameFolderModal.proj, renameFolderModal.folder)} autoFocus placeholder={renameFolderModal.folder.name} style={{ ...modalInp, marginBottom: 14 }} />
          <MBtns onOk={() => doRenameFolder(renameFolderModal.proj, renameFolderModal.folder)} onCancel={() => setRenameFolderModal(null)} label="Přejmenovat" disabled={!renameFolderVal.trim()} />
        </Modal>
      )}
      {deleteFolderModal && (
        <Modal title="🗑 Smazat složku" onClose={() => setDeleteFolderModal(null)}>
          <p style={{ fontSize: 13, color: D.txtSec, marginBottom: 6 }}>Smazat složku <strong style={{ color: D.txtPri }}>{deleteFolderModal.folder.name}</strong> a všechny soubory v ní?</p>
          <p style={{ fontSize: 12, color: D.danger, marginBottom: 18 }}>Tato akce je nevratná.</p>
          <MBtns onOk={() => doDeleteFolder(deleteFolderModal.proj, deleteFolderModal.folder)} onCancel={() => setDeleteFolderModal(null)} label="Smazat" danger />
        </Modal>
      )}
      {newFolderModal && (
        <Modal title="📁 Nová složka" onClose={() => setNewFolderModal(null)}>
          <p style={{ fontSize: 13, color: D.txtSec, marginBottom: 10 }}>Název složky pro soubory/obrázky</p>
          <input value={newFolderName} onChange={e => setNewFolderName(e.target.value)} onKeyDown={e => e.key === 'Enter' && newFolderName.trim() && doNewFolder(newFolderModal)} autoFocus placeholder="data" style={{ ...modalInp, marginBottom: 14 }} />
          <MBtns onOk={() => doNewFolder(newFolderModal)} onCancel={() => setNewFolderModal(null)} label="Vytvořit" disabled={!newFolderName.trim()} />
        </Modal>
      )}

      <input ref={imgInputRef} type="file" multiple style={{ display: 'none' }}
        onChange={e => { if (e.target.files && uploadFolderTarget.current) { const [proj, folder] = uploadFolderTarget.current.split('::'); uploadFilesToFolder(e.target.files, proj, folder) } }} />

      <style>{`
        .jup-sb:hover { background: rgba(255,255,255,.08) !important; color: #fff !important; }
        .jup-row { transition: background .12s; }
        .jup-row:hover { background: rgba(255,255,255,.05) !important; }
        .jup-row:hover .jup-acts { opacity: 1 !important; }
        .jup-cell:focus-within { border-color: ${accent}60 !important; }
        .jup-cell.selected { border-color: ${accent}90 !important; }
        .jup-cell.running { border-color: ${D.warning}80 !important; }
        .jup-cell.error { border-color: ${D.danger}60 !important; }
        textarea.jup-ta { resize: none; font-family: 'JetBrains Mono','Fira Code',monospace; font-size: 13px; line-height: 1.6; background: #1e1e2e; color: #cdd6f4; padding: 12px 14px; border: none; outline: none; width: 100%; box-sizing: border-box; }
        textarea.jup-ta::selection { background: ${accent}40; }
        @keyframes spin { to { transform: rotate(360deg) } }
        @keyframes pulse { 0%,100% { opacity: 1 } 50% { opacity: .5 } }
      `}</style>

      {/* ── Page header ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18, flexWrap: 'wrap' }}>
        <div style={{ width: 40, height: 40, borderRadius: 11, background: '#F37726' + '20', border: `1px solid #F37726` + '30', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <img src="/icons/jupyter.png" alt="Jupyter" style={{ width: 26, height: 26, objectFit: 'contain' }} onError={e => { (e.target as HTMLImageElement).style.display='none' }} />
        </div>
        <div>
          <h1 style={{ fontSize: 19, fontWeight: 800, color: D.txtPri, margin: '0 0 2px' }}>Jupyter Notebook</h1>
          <p style={{ fontSize: 11, color: D.txtSec, margin: 0 }}>Ctrl+Enter spustit buňku · Ctrl+S uložit · Python 3.11 via Pyodide</p>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          {saveMsg && <span style={{ fontSize: 12, color: saveMsg.startsWith('❌') ? D.danger : D.success, fontWeight: 600 }}>{saveMsg}</span>}
          {isDirty && !saveMsg && <span style={{ fontSize: 11, color: D.warning }}>● neuloženo</span>}
          {activeFile && <span style={{ fontSize: 11, color: D.txtSec }}>{activeFile.project} / {activeFile.name}</span>}
        </div>
      </div>

      {/* ── 2-col layout ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '230px minmax(0,1fr)', gap: 14, alignItems: 'start' }}>

        {/* ══ LEFT: sidebar ══ */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

          {/* Actions */}
          <div style={card({ padding: '13px' })}>
            <SectionLabel>Soubory</SectionLabel>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <button className="jup-sb" style={sideBtn} onClick={() => setNewProjModal(true)}><span>📁</span> Nový projekt</button>
              <button className="jup-sb" style={sideBtn} onClick={() => setNewFileModal(true)}><span>📄</span> Nový notebook</button>
              <button className="jup-sb" style={sideBtn} onClick={() => { setOpenModal(true); refreshProjects() }}><span>📂</span> Otevřít</button>
              <div style={{ height: 1, background: D.border, margin: '3px 0' }} />
              <button className="jup-sb" style={{ ...sideBtn, opacity: !activeFile || saving ? .4 : 1 }} disabled={!activeFile || saving} onClick={saveNotebook}><span>💾</span> Uložit</button>
              <button className="jup-sb" style={{ ...sideBtn, opacity: !activeFile ? .4 : 1 }} disabled={!activeFile} onClick={downloadNotebook}><span>⬇️</span> Stáhnout .ipynb</button>
            </div>
          </div>

          {/* Recent */}
          <div style={card({ padding: '13px' })}>
            <SectionLabel>Nedávné</SectionLabel>
            {recent.length === 0
              ? <div style={{ fontSize: 12, color: D.txtSec }}>Žádné nedávné soubory</div>
              : recent.map(r => (
                  <div key={r.path} className="jup-row"
                    onClick={() => { const f = projects.flatMap(p => p.files).find(x => x.path === r.path); if (f) openNotebook(f) }}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 7px', borderRadius: D.radiusSm, cursor: 'pointer', background: r.path === activeFile?.path ? accent+'15' : 'transparent', marginBottom: 2 }}>
                    <span style={{ fontSize: 13 }}>📓</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: r.path === activeFile?.path ? accent : D.txtPri, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</div>
                      <div style={{ fontSize: 10, color: D.txtSec }}>{r.project}</div>
                    </div>
                  </div>
                ))
            }
          </div>

          {/* Project tree */}
          <div style={{ ...card({ padding: '13px' }) }}>
            <SectionLabel>Moje projekty</SectionLabel>
            {loadingProj
              ? <div style={{ fontSize: 12, color: D.txtSec, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 14, height: 14, border: `2px solid ${D.border}`, borderTopColor: accent, borderRadius: '50%', animation: 'spin .6s linear infinite' }} />Načítám…
                </div>
              : projects.length === 0
                ? <div style={{ fontSize: 12, color: D.txtSec }}>Žádné projekty</div>
                : projects.map(proj => (
                    <div key={proj.key} style={{ marginBottom: 5 }}>
                      {/* Project header */}
                      <div className="jup-row" style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 6px', borderRadius: 7, background: proj.key === activeFile?.project ? accent+'10' : 'transparent' }}>
                        <div onClick={() => setExpandedProj(prev => { const n = new Set(prev); n.has(proj.key) ? n.delete(proj.key) : n.add(proj.key); return n })}
                          style={{ display: 'flex', alignItems: 'center', gap: 5, flex: 1, cursor: 'pointer' }}>
                          <span style={{ fontSize: 9, color: D.txtSec, display: 'inline-block', transform: expandedProj.has(proj.key) ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }}>▶</span>
                          <span style={{ fontSize: 13 }}>📁</span>
                          <span style={{ fontSize: 12, fontWeight: 700, color: proj.key === activeFile?.project ? accent : D.txtPri, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{proj.name}</span>
                        </div>
                        <div className="jup-acts" style={{ display: 'flex', gap: 1, opacity: 0, flexShrink: 0 }}>
                          <button onClick={e => { e.stopPropagation(); setNewFolderModal(proj.key) }} style={{ padding: '1px 4px', background: 'none', border: 'none', cursor: 'pointer', color: D.txtSec, fontSize: 11 }} title="Nová složka">📁+</button>
                          <button onClick={e => { e.stopPropagation(); setRenameProjModal(proj); setRenameProjVal(proj.name) }} style={{ padding: '1px 4px', background: 'none', border: 'none', cursor: 'pointer', color: D.txtSec, fontSize: 11 }} title="Přejmenovat">✏</button>
                          <button onClick={e => { e.stopPropagation(); setDeleteProjModal(proj) }} style={{ padding: '1px 4px', background: 'none', border: 'none', cursor: 'pointer', color: D.danger, fontSize: 11 }} title="Smazat">🗑</button>
                        </div>
                      </div>
                      {/* Notebooks */}
                      {expandedProj.has(proj.key) && (
                        <div style={{ marginLeft: 18 }}>
                          {proj.files.map(f => (
                            <div key={f.path} className="jup-row"
                              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 7px', borderRadius: 6, cursor: 'pointer', background: f.path === activeFile?.path ? accent+'15' : 'transparent', marginBottom: 1 }}
                              onClick={() => openNotebook(f)}>
                              <span style={{ fontSize: 13 }}>📓</span>
                              <span style={{ fontSize: 11, color: f.path === activeFile?.path ? accent : D.txtPri, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: f.path === activeFile?.path ? 600 : 400 }}>{f.name}</span>
                              <div className="jup-acts" style={{ display: 'flex', gap: 1, opacity: 0 }}>
                                <button onClick={e => { e.stopPropagation(); setRenameFileModal(f); setRenameFileVal(f.name.replace(/\.ipynb$/, '')) }}
                                  style={{ padding: '1px 4px', background: 'none', border: 'none', cursor: 'pointer', color: D.txtSec, fontSize: 11 }} title="Přejmenovat">✏</button>
                                <button onClick={e => { e.stopPropagation(); setDeleteFileModal(f) }} style={{ padding: '1px 4px', background: 'none', border: 'none', cursor: 'pointer', color: D.danger, fontSize: 11 }} title="Smazat">🗑</button>
                              </div>
                            </div>
                          ))}
                          {/* Folders */}
                          {proj.folders.map(folder => (
                            <div key={folder.name} style={{ marginBottom: 3 }}>
                              <div className="jup-row" style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 7px', borderRadius: 6 }}>
                                <span style={{ fontSize: 12 }}>📂</span>
                                <span style={{ fontSize: 11, color: D.txtSec, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{folder.name}</span>
                                <div className="jup-acts" style={{ display: 'flex', gap: 1, opacity: 0, flexShrink: 0 }}>
                                  <button onClick={e => { e.stopPropagation(); uploadFolderTarget.current = `${proj.key}::${folder.name}`; imgInputRef.current?.click() }}
                                    style={{ padding: '1px 5px', background: accent+'20', color: accent, border: 'none', borderRadius: 4, fontSize: 10, cursor: 'pointer', fontFamily: 'inherit' }} title="Nahrát soubory">
                                    {uploadingFile ? '…' : '⬆'}
                                  </button>
                                  <button onClick={e => { e.stopPropagation(); setRenameFolderModal({ proj: proj.key, folder }); setRenameFolderVal(folder.name) }}
                                    style={{ padding: '1px 4px', background: 'none', border: 'none', cursor: 'pointer', color: D.txtSec, fontSize: 10 }} title="Přejmenovat">✏</button>
                                  <button onClick={e => { e.stopPropagation(); setDeleteFolderModal({ proj: proj.key, folder }) }}
                                    style={{ padding: '1px 4px', background: 'none', border: 'none', cursor: 'pointer', color: D.danger, fontSize: 10 }} title="Smazat složku">🗑</button>
                                </div>
                              </div>
                              {folder.files.map(f => (
                                <div key={f.path} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '2px 7px 2px 22px', borderRadius: 5, marginBottom: 1 }}>
                                  <span style={{ fontSize: 10 }}>📄</span>
                                  <span style={{ fontSize: 10, color: D.txtSec, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={f.name}>{f.name}</span>
                                  {f.size && <span style={{ fontSize: 9, color: D.txtSec, opacity: .7 }}>{f.size < 1024 ? f.size + 'B' : (f.size/1024).toFixed(1) + 'kB'}</span>}
                                </div>
                              ))}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))
            }
          </div>
        </div>

        {/* ══ RIGHT: Notebook ══ */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>

          {/* Notebook toolbar */}
          <div style={{ background: D.bgCard, border: `1px solid ${D.border}`, borderRadius: `${D.radius} ${D.radius} 0 0`, borderBottomWidth: 0, display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', flexShrink: 0, flexWrap: 'wrap' as const }}>
            {/* Run controls */}
            <button onClick={() => selectedCell && runCell(selectedCell)} disabled={!selectedCell}
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', background: accent, color: '#fff', border: 'none', borderRadius: 7, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: !selectedCell ? .4 : 1 }}>
              ▶ Spustit
            </button>
            <button onClick={runAllCells}
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', background: 'rgba(255,255,255,.05)', color: D.txtSec, border: `1px solid ${D.border}`, borderRadius: 7, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>
              ⏩ Vše
            </button>
            <button onClick={clearAllOutputs}
              style={{ padding: '5px 12px', background: 'rgba(255,255,255,.04)', color: D.txtSec, border: `1px solid ${D.border}`, borderRadius: 7, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>
              ✕ Výstupy
            </button>
            <div style={{ width: 1, height: 20, background: D.border }} />
            {/* Add cell buttons */}
            <button onClick={() => { if (selectedCell) addCellAfter(selectedCell, 'code'); else { const c = newCell('code'); setNotebook(prev => ({ ...prev, cells: [...prev.cells, c] })); setSelectedCell(c.id); setEditingCell(c.id); setIsDirty(true) } }}
              style={{ padding: '5px 12px', background: 'rgba(255,255,255,.04)', color: D.txtSec, border: `1px solid ${D.border}`, borderRadius: 7, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>
              + Kód
            </button>
            <button onClick={() => { if (selectedCell) addCellAfter(selectedCell, 'markdown'); else { const c = newCell('markdown'); setNotebook(prev => ({ ...prev, cells: [...prev.cells, c] })); setSelectedCell(c.id); setEditingCell(c.id); setIsDirty(true) } }}
              style={{ padding: '5px 12px', background: 'rgba(255,255,255,.04)', color: D.txtSec, border: `1px solid ${D.border}`, borderRadius: 7, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>
              + Markdown
            </button>
            <div style={{ flex: 1 }} />
            <button onClick={() => { id: 'jup-save-btn' as any; saveNotebook() }} id="jup-save-btn" disabled={!activeFile || saving}
              style={{ padding: '5px 13px', background: isDirty ? accent+'20' : 'rgba(255,255,255,.04)', color: isDirty ? accent : D.txtSec, border: `1px solid ${isDirty ? accent+'40' : D.border}`, borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', opacity: !activeFile ? .4 : 1 }}>
              {saving ? '…' : '💾 Uložit'}
            </button>
          </div>

          {/* Notebook body */}
          <div style={{ background: '#13141b', border: `1px solid ${D.border}`, borderTop: 'none', borderRadius: `0 0 ${D.radius} ${D.radius}`, minHeight: 500, padding: '16px 0' }}>
            {notebook.cells.map((cell, idx) => (
              <CellView
                key={cell.id}
                cell={cell}
                idx={idx}
                isSelected={selectedCell === cell.id}
                isEditing={editingCell === cell.id}
                accent={accent}
                monaco={monacoRef.current}
                onSelect={() => setSelectedCell(cell.id)}
                onEdit={() => { setSelectedCell(cell.id); setEditingCell(cell.id) }}
                onBlur={() => setEditingCell(null)}
                onChange={source => updateCell(cell.id, { source })}
                onRun={() => runCell(cell.id)}
                onKeyDown={e => onCellKeyDown(e, cell)}
                onDelete={() => deleteCell(cell.id)}
                onMoveUp={() => moveCellUp(cell.id)}
                onMoveDown={() => moveCellDown(cell.id)}
                onAddAfter={type => addCellAfter(cell.id, type)}
                onToggleType={() => updateCell(cell.id, { type: cell.type === 'code' ? 'markdown' : 'code', outputs: [] })}
              />
            ))}
            {/* Add cell at bottom */}
            <div style={{ display: 'flex', justifyContent: 'center', gap: 8, padding: '8px 0 4px' }}>
              <button onClick={() => { const c = newCell('code'); setNotebook(prev => ({ ...prev, cells: [...prev.cells, c] })); setSelectedCell(c.id); setEditingCell(c.id); setIsDirty(true) }}
                style={{ padding: '4px 14px', background: 'rgba(255,255,255,.04)', color: D.txtSec, border: `1px dashed ${D.border}`, borderRadius: 6, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>
                + Kód
              </button>
              <button onClick={() => { const c = newCell('markdown'); setNotebook(prev => ({ ...prev, cells: [...prev.cells, c] })); setSelectedCell(c.id); setEditingCell(c.id); setIsDirty(true) }}
                style={{ padding: '4px 14px', background: 'rgba(255,255,255,.04)', color: D.txtSec, border: `1px dashed ${D.border}`, borderRadius: 6, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>
                + Markdown
              </button>
            </div>
          </div>
        </div>
      </div>
    </DarkLayout>
  )
}

// ── Cell component ────────────────────────────────────────────────────────────
function CellView({ cell, idx, isSelected, isEditing, accent, monaco, onSelect, onEdit, onBlur, onChange, onRun, onKeyDown, onDelete, onMoveUp, onMoveDown, onAddAfter, onToggleType }: {
  cell: Cell; idx: number; isSelected: boolean; isEditing: boolean; accent: string; monaco: any
  onSelect: () => void; onEdit: () => void; onBlur: () => void
  onChange: (s: string) => void; onRun: () => void
  onKeyDown: (e: React.KeyboardEvent) => void
  onDelete: () => void; onMoveUp: () => void; onMoveDown: () => void
  onAddAfter: (t: CellType) => void; onToggleType: () => void
}) {
  const textareaRef   = useRef<HTMLTextAreaElement>(null)
  const monacoContRef = useRef<HTMLDivElement>(null)
  const monacoEdRef   = useRef<any>(null)
  const isCode = cell.type === 'code'
  const statusColor = cell.status === 'running' ? D.warning : cell.status === 'error' ? D.danger : cell.status === 'done' ? D.success : 'transparent'

  // Auto-resize textarea (markdown only)
  function autoResize(el: HTMLTextAreaElement) {
    el.style.height = 'auto'
    el.style.height = Math.max(48, el.scrollHeight) + 'px'
  }

  // Monaco editor for code cells
  useEffect(() => {
    if (!isEditing || !isCode || !monaco || !monacoContRef.current) return
    if (monacoEdRef.current) return // already created
    const lines = cell.source.split('\n').length
    const height = Math.max(52, lines * 20 + 24)
    monacoContRef.current.style.height = height + 'px'
    const ed = monaco.editor.create(monacoContRef.current, {
      value: cell.source,
      language: 'python',
      theme: 'vs-dark',
      fontSize: 13,
      fontFamily: "'JetBrains Mono','Fira Code',monospace",
      minimap: { enabled: false },
      lineNumbers: 'off' as const,
      wordWrap: 'on' as const,
      automaticLayout: true,
      scrollBeyondLastLine: false,
      padding: { top: 10, bottom: 10 },
      scrollbar: { vertical: 'hidden', horizontal: 'hidden', alwaysConsumeMouseWheel: false },
      overviewRulerLanes: 0,
      glyphMargin: false,
      folding: false,
      renderLineHighlight: 'none' as const,
    })
    monacoEdRef.current = ed
    // Auto-resize on content change
    ed.onDidChangeModelContent(() => {
      const val = ed.getValue()
      onChange(val)
      const newLines = val.split('\n').length
      const newH = Math.max(52, newLines * 20 + 24)
      if (monacoContRef.current) monacoContRef.current.style.height = newH + 'px'
      ed.layout()
    })
    // Ctrl+Enter → run
    ed.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => { onRun() })
    // Escape → blur
    ed.addCommand(monaco.KeyCode.Escape, () => { onBlur() })
    ed.focus()
    return () => { ed.dispose(); monacoEdRef.current = null }
  }, [isEditing, isCode, monaco])

  useEffect(() => {
    if (isEditing && !isCode && textareaRef.current) {
      textareaRef.current.focus()
      autoResize(textareaRef.current)
    }
  }, [isEditing, isCode])

  const cellClasses = ['jup-cell', isSelected ? 'selected' : '', cell.status === 'running' ? 'running' : '', cell.status === 'error' ? 'error' : ''].filter(Boolean).join(' ')

  return (
    <div className={cellClasses}
      onClick={onSelect}
      style={{ margin: '0 16px 4px', border: `1px solid ${isSelected ? accent + '60' : 'rgba(255,255,255,.07)'}`, borderRadius: 10, overflow: 'hidden', transition: 'border-color .15s', position: 'relative' }}>

      {/* Cell header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px 4px 10px', background: 'rgba(255,255,255,.025)', borderBottom: `1px solid rgba(255,255,255,.05)` }}>
        {/* Execution count / status */}
        <div style={{ width: 28, textAlign: 'center' as const, fontSize: 10, color: D.txtSec, fontFamily: 'monospace', flexShrink: 0 }}>
          {isCode && (
            cell.status === 'running'
              ? <div style={{ width: 12, height: 12, border: `2px solid rgba(255,255,255,.2)`, borderTopColor: D.warning, borderRadius: '50%', animation: 'spin .6s linear infinite', margin: '0 auto' }} />
              : cell.executionCount !== null ? `[${cell.executionCount}]` : '[ ]'
          )}
        </div>
        {/* Type badge */}
        <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4, background: isCode ? accent+'20' : '#22C55E20', color: isCode ? accent : '#22C55E', fontWeight: 700, cursor: 'pointer' }} onClick={e => { e.stopPropagation(); onToggleType() }} title="Kliknout pro změnu typu">
          {isCode ? 'PY' : 'MD'}
        </span>
        <div style={{ flex: 1 }} />
        {/* Cell actions */}
        <div style={{ display: 'flex', gap: 2, opacity: isSelected ? 1 : 0, transition: 'opacity .15s' }}>
          {isCode && (
            <button onClick={e => { e.stopPropagation(); onRun() }}
              title="Spustit (Ctrl+Enter)"
              style={{ padding: '2px 7px', background: accent+'20', color: accent, border: 'none', borderRadius: 5, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700 }}>
              ▶
            </button>
          )}
          <button onClick={e => { e.stopPropagation(); onMoveUp() }}
            style={{ padding: '2px 5px', background: 'none', border: 'none', cursor: 'pointer', color: D.txtSec, fontSize: 11 }} title="Nahoru">↑</button>
          <button onClick={e => { e.stopPropagation(); onMoveDown() }}
            style={{ padding: '2px 5px', background: 'none', border: 'none', cursor: 'pointer', color: D.txtSec, fontSize: 11 }} title="Dolů">↓</button>
          <button onClick={e => { e.stopPropagation(); onAddAfter('code') }}
            style={{ padding: '2px 5px', background: 'none', border: 'none', cursor: 'pointer', color: D.txtSec, fontSize: 11 }} title="Přidat kód za">+PY</button>
          <button onClick={e => { e.stopPropagation(); onAddAfter('markdown') }}
            style={{ padding: '2px 5px', background: 'none', border: 'none', cursor: 'pointer', color: D.txtSec, fontSize: 11 }} title="Přidat markdown za">+MD</button>
          <button onClick={e => { e.stopPropagation(); onDelete() }}
            style={{ padding: '2px 5px', background: 'none', border: 'none', cursor: 'pointer', color: D.danger, fontSize: 11 }} title="Smazat buňku">🗑</button>
        </div>
      </div>

      {/* Cell body */}
      {isCode ? (
        <div>
          {/* Monaco container — always rendered when editing, hidden otherwise */}
          <div ref={monacoContRef} style={{ display: isEditing ? 'block' : 'none', minHeight: 52, background: '#1e1e2e' }} />
          {!isEditing && (
            <div
              onClick={onEdit}
              style={{ padding: '12px 14px', fontFamily: "'JetBrains Mono','Fira Code',monospace", fontSize: 13, lineHeight: 1.6, color: '#cdd6f4', background: '#1e1e2e', minHeight: 48, cursor: 'text', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {cell.source || <span style={{ color: 'rgba(255,255,255,.2)', fontStyle: 'italic' }}>Klikněte pro editaci…</span>}
            </div>
          )}
          {/* Outputs */}
          {cell.outputs.length > 0 && (
            <div style={{ borderTop: `1px solid rgba(255,255,255,.07)`, background: '#0d0e14' }}>
              {cell.outputs.map((out, i) => (
                <div key={i} style={{ padding: out.type === 'image' ? '10px 14px' : '4px 14px 4px 42px' }}>
                  {out.type === 'image'
                    ? <img src={`data:image/png;base64,${out.b64}`} alt="output" style={{ maxWidth: '100%', borderRadius: 6 }} />
                    : <pre style={{ margin: 0, fontFamily: "'JetBrains Mono',monospace", fontSize: 12, lineHeight: 1.6, color: out.type === 'error' ? '#f38ba8' : '#a6e3a1', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                        {out.text}
                      </pre>
                  }
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        /* Markdown cell */
        <div>
          {isEditing
            ? <textarea
                ref={textareaRef}
                className="jup-ta"
                value={cell.source}
                onChange={e => { onChange(e.target.value); autoResize(e.target) }}
                onKeyDown={e => { if (e.key === 'Escape') onBlur() }}
                onBlur={onBlur}
                spellCheck={false}
                style={{ minHeight: 48, background: '#1a1a2e', color: '#cba6f7' }}
              />
            : <div
                onClick={onEdit}
                style={{ padding: '12px 16px', color: D.txtPri, lineHeight: 1.7, cursor: 'text', minHeight: 48, background: 'transparent' }}
                dangerouslySetInnerHTML={{ __html: cell.source ? renderMarkdown(cell.source) : '<span style="color:rgba(255,255,255,.25);font-style:italic">Klikněte pro editaci markdownu…</span>' }}
              />
          }
        </div>
      )}

      {/* Left status bar */}
      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: statusColor, borderRadius: '10px 0 0 10px', transition: 'background .3s' }} />
    </div>
  )
}
