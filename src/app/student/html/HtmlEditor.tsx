'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { DarkLayout, D, card, SectionLabel } from '@/components/DarkLayout'

// ── Constants ─────────────────────────────────────────────────────────────────
const BUCKET    = 'web-files'
const LS_RECENT = 'cb_html_recent'
const LS_LAST   = 'cb_html_last'
const LS_LAST2  = 'cb_html_last2'  // second split-view file

const DEFAULT_HTML = `<!DOCTYPE html>\n<html lang="cs">\n<head>\n  <meta charset="UTF-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n  <title>Můj projekt</title>\n  <link rel="stylesheet" href="style.css">\n</head>\n<body>\n  <h1>Ahoj, světe! 👋</h1>\n  <p>Začni upravovat HTML, CSS a JS...</p>\n  <script src="script.js"></script>\n</body>\n</html>`
const DEFAULT_CSS  = `body {\n  font-family: system-ui, sans-serif;\n  max-width: 800px;\n  margin: 40px auto;\n  padding: 0 20px;\n  background: #f9fafb;\n  color: #111;\n}\n\nh1 { color: #7C3AED; }`
const DEFAULT_JS   = `// JavaScript\nconsole.log('Ahoj z JavaScriptu!');`

// ── Types ─────────────────────────────────────────────────────────────────────
type FileType = 'html' | 'css' | 'js' | 'img' | 'folder'
interface WebFile {
  path: string      // full storage path
  name: string      // filename
  folder: string    // subfolder within project ('' = root, 'img' = img/, 'css' = css/, etc.)
  type: FileType
  size?: number
  updatedAt: string
}
interface WebProject { name: string; key: string; files: WebFile[]; updatedAt: string }
interface RecentEntry { name: string; key: string; openedAt: string }

// ── Helpers ───────────────────────────────────────────────────────────────────
function sanitizeKey(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._\-]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '') || 'soubor'
}
function storagePath(uid: string, projKey: string, folder: string, name: string) {
  return folder ? `zaci/${uid}/${projKey}/${folder}/${name}` : `zaci/${uid}/${projKey}/${name}`
}
function getFileType(name: string): FileType {
  const ext = name.split('.').pop()?.toLowerCase()
  if (ext === 'html' || ext === 'htm') return 'html'
  if (ext === 'css') return 'css'
  if (ext === 'js') return 'js'
  if (['png','jpg','jpeg','gif','webp','svg','ico'].includes(ext ?? '')) return 'img'
  return 'html'
}
function getMonacoLanguage(type: FileType): string {
  if (type === 'html') return 'html'
  if (type === 'css')  return 'css'
  if (type === 'js')   return 'javascript'
  return 'html'
}
function getFileColor(type: FileType): string {
  if (type === 'html') return '#E34C26'
  if (type === 'css')  return '#264DE4'
  if (type === 'js')   return '#F7DF1E'
  if (type === 'img')  return '#22C55E'
  return D.txtSec
}
function getFileIcon(name: string, type: FileType): string {
  if (type === 'img') return '🖼'
  if (type === 'html') return '📄'
  if (type === 'css') return '🎨'
  if (type === 'js') return '⚡'
  return '📄'
}

// ── Build preview ─────────────────────────────────────────────────────────────
// Escapes special regex chars in a string so it can be used in RegExp
function reEsc(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
function buildPreview(files: WebFile[], contents: Map<string, string>): string {
  const htmlFile = files.find(f => f.name === 'index.html' && f.folder === '')
    ?? files.find(f => f.type === 'html')
  if (!htmlFile) return '<p style="font-family:sans-serif;padding:20px;color:#888">Žádný HTML soubor v projektu</p>'

  let html = contents.get(htmlFile.path) ?? ''

  // Inline all CSS files referenced by <link href="..."> 
  // Matches both bare filename and folder/filename
  for (const f of files.filter(f => f.type === 'css')) {
    const css = contents.get(f.path) ?? ''
    const refPaths = [
      reEsc(f.name),
      f.folder ? reEsc(f.folder + '/' + f.name) : null,
    ].filter(Boolean).join('|')
    html = html.replace(
      new RegExp(`<link[^>]*href=["']?(${refPaths})["']?[^>]*>`, 'gi'),
      `<style>/* ${f.folder ? f.folder + '/' : ''}${f.name} */\n${css}\n</style>`
    )
  }

  // Inline all JS files referenced by <script src="...">
  for (const f of files.filter(f => f.type === 'js')) {
    const js = contents.get(f.path) ?? ''
    const refPaths = [
      reEsc(f.name),
      f.folder ? reEsc(f.folder + '/' + f.name) : null,
    ].filter(Boolean).join('|')
    html = html.replace(
      new RegExp(`<script[^>]*src=["']?(${refPaths})["']?[^>]*>\\s*</script>`, 'gi'),
      `<script>/* ${f.folder ? f.folder + '/' : ''}${f.name} */\n${js}\n</script>`
    )
  }

  // Inline images: replace src references with base64 data URLs
  for (const f of files.filter(f => f.type === 'img')) {
    const dataUrl = contents.get(f.path)
    if (!dataUrl || !dataUrl.startsWith('data:')) continue
    const refs: string[] = [f.name]
    if (f.folder) {
      refs.push(f.folder + '/' + f.name)
      refs.push('./' + f.folder + '/' + f.name)
    }
    for (const ref of refs) {
      const esc = reEsc(ref)
      // Use string concat to avoid template literal escaping issues
      html = html.replace(new RegExp('src="' + esc + '"', 'gi'), 'src="' + dataUrl + '"')
      html = html.replace(new RegExp("src='" + esc + "'", 'gi'), 'src="' + dataUrl + '"')
    }
  }

  return html
}

export default function HtmlEditor({ profile }: { profile: any }) {
  const supabase = createClient()
  const accent   = profile?.accent_color ?? '#7C3AED'
  const uid      = profile?.id as string

  // ── Projects & files ──────────────────────────────────────────────────────
  const [projects, setProjects]         = useState<WebProject[]>([])
  const [loadingProj, setLoadingProj]   = useState(true)
  const [activeProject, setActiveProject] = useState<WebProject | null>(null)
  const [recent, setRecent]             = useState<RecentEntry[]>([])
  const [expanded, setExpanded]         = useState<Set<string>>(new Set(['']))  // expanded folders
  // file contents cache: path → string content (or data URL for images)
  const [contents, setContents]         = useState<Map<string, string>>(new Map())
  const [activeFile, setActiveFile]     = useState<WebFile | null>(null)
  const [splitFile, setSplitFile]       = useState<WebFile | null>(null)
  const [splitView, setSplitView]       = useState(false)
  const [splitRatio, setSplitRatio]     = useState(50)
  const splitDragRef   = useRef<{ startX: number; startRatio: number } | null>(null)
  const editorAreaRef  = useRef<HTMLDivElement>(null)
  const [isDirty, setIsDirty]           = useState(false)
  const contentsRef      = useRef<Map<string, string>>(new Map())
  const livePreviewRef   = useRef(true)    // mirror of livePreview for closures
  const activeProjectRef = useRef<WebProject | null>(null)  // mirror for closures
  const [livePreview, setLivePreview]   = useState(true)

  // ── Editor refs ───────────────────────────────────────────────────────────
  const editorContainerRef  = useRef<HTMLDivElement>(null)
  const splitContainerRef   = useRef<HTMLDivElement>(null)
  const editorRef           = useRef<any>(null)
  const splitEditorRef      = useRef<any>(null)
  const monacoRef           = useRef<any>(null)
  const [monacoReady, setMonacoReady] = useState(false)
  // Track which file each editor is showing (to avoid infinite setValue loops)
  const editorFilePath      = useRef<string>('')
  const splitEditorFilePath = useRef<string>('')

  // ── Preview ───────────────────────────────────────────────────────────────
  const previewRef          = useRef<HTMLIFrameElement>(null)
  const [previewHeight, setPreviewHeight] = useState(280)
  const previewDragRef = useRef<{ startY: number; startH: number } | null>(null)
  const previewTimer        = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── UI state ──────────────────────────────────────────────────────────────
  const [saving, setSaving]     = useState(false)
  const [saveMsg, setSaveMsg]   = useState('')
  const [draggingFile, setDraggingFile] = useState<WebFile | null>(null)
  const [dragOverFolder, setDragOverFolder] = useState<string | null>(null)
  // Modals
  const [newProjModal, setNewProjModal]     = useState(false)
  const [newProjName, setNewProjName]       = useState('')
  const [deleteProjModal, setDeleteProjModal] = useState<WebProject | null>(null)
  const [renameProjModal, setRenameProjModal] = useState<WebProject | null>(null)
  const [renameProjVal, setRenameProjVal]   = useState('')
  const [openProjModal, setOpenProjModal]   = useState(false)
  const [newItemModal, setNewItemModal]     = useState<{ folder: string } | null>(null)
  const [newItemName, setNewItemName]       = useState('')
  const [newItemType, setNewItemType]       = useState<'html'|'css'|'js'|'folder'>('html')
  const [renameModal, setRenameModal]       = useState<WebFile | null>(null)
  const [renameVal, setRenameVal]           = useState('')
  const [deleteModal, setDeleteModal]       = useState<WebFile | null>(null)
  const [uploadingImg, setUploadingImg]     = useState(false)
  const imgInputRef = useRef<HTMLInputElement>(null)
  const [splitPickOpen, setSplitPickOpen]   = useState(false)

  // ── Storage helpers ───────────────────────────────────────────────────────
  async function pushFile(path: string, content: string | Blob): Promise<string | null> {
    const blob = typeof content === 'string' ? new Blob([content], { type: 'text/plain' }) : content
    let { error } = await supabase.storage.from(BUCKET).upload(path, blob, { upsert: true, cacheControl: '0' })
    if (error) {
      await supabase.storage.from(BUCKET).remove([path])
      const r2 = await supabase.storage.from(BUCKET).upload(path, blob, { cacheControl: '0' })
      if (r2.error) return r2.error.message
    }
    return null
  }
  async function fetchText(path: string): Promise<string> {
    const { data } = await supabase.storage.from(BUCKET).download(path + '?t=' + Date.now())
    if (!data) return ''
    return await data.text()
  }
  async function fetchAsDataUrl(path: string): Promise<string> {
    const { data } = await supabase.storage.from(BUCKET).download(path)
    if (!data) return ''
    return new Promise(resolve => {
      const r = new FileReader(); r.onload = () => resolve(r.result as string); r.readAsDataURL(data)
    })
  }

  // ── Refresh project tree ──────────────────────────────────────────────────
  const refreshProjects = useCallback(async (): Promise<WebProject[]> => {
    setLoadingProj(true)
    const { data: top } = await supabase.storage.from(BUCKET).list(`zaci/${uid}`, { limit: 200 })
    if (!top) { setLoadingProj(false); return [] }

    const result: WebProject[] = []
    for (const item of top) {
      if ((item.metadata !== null && item.metadata !== undefined) || item.name.includes('.')) continue
      // List root files
      const files: WebFile[] = []
      await listFolder(`zaci/${uid}/${item.name}`, '', item.name, files)
      result.push({ name: item.name, key: item.name, files, updatedAt: files[0]?.updatedAt ?? new Date().toISOString() })
    }
    setProjects(result)
    setLoadingProj(false)
    return result
  }, [uid])

  async function listFolder(storagePfx: string, folderRelative: string, projKey: string, out: WebFile[]) {
    const { data } = await supabase.storage.from(BUCKET).list(storagePfx, { limit: 200 })
    if (!data) return
    for (const item of data) {
      if (item.metadata === null || item.metadata === undefined) {
        // subfolder
        if (!item.name.includes('.')) {
          await listFolder(`${storagePfx}/${item.name}`, folderRelative ? `${folderRelative}/${item.name}` : item.name, projKey, out)
        }
      } else {
        const name = item.name
        const type = getFileType(name)
        out.push({
          path: `${storagePfx}/${name}`,
          name, folder: folderRelative, type,
          size: item.metadata?.size,
          updatedAt: item.updated_at ?? new Date().toISOString(),
        })
      }
    }
  }

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
        const commonOpts = {
          theme: 'vs-dark', fontSize: 14,
          fontFamily: "'JetBrains Mono','Fira Code',monospace",
          minimap: { enabled: false }, lineNumbers: 'on' as const,
          wordWrap: 'off' as const, automaticLayout: false,
          scrollBeyondLastLine: false,
          renderLineHighlight: 'line' as const,
          padding: { top: 14, bottom: 14 },
          bracketPairColorization: { enabled: true },
        }
        if (editorContainerRef.current) {
          editorRef.current = monaco.editor.create(editorContainerRef.current, { ...commonOpts, value: DEFAULT_HTML, language: 'html', wordWrap: 'off', scrollbar: { horizontal: 'auto', vertical: 'auto' } })
          editorRef.current.onDidChangeModelContent(() => {
            const path = editorFilePath.current
            if (!path) return
            const val = editorRef.current.getValue()
            contentsRef.current.set(path, val)
            setContents(prev => { const n = new Map(prev); n.set(path, val); return n })
            setIsDirty(true)
            schedulePreview()
          })
          editorRef.current.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => document.getElementById('html-save-btn')?.click())
        }
        setMonacoReady(true)
      })
    }
    document.head.appendChild(s)
    return () => { editorRef.current?.dispose(); splitEditorRef.current?.dispose() }
  }, [])

  // ── Create/destroy split editor when splitView toggles ────────────────────
  useEffect(() => {
    if (!monacoReady || !monacoRef.current) return
    if (splitView && splitContainerRef.current && !splitEditorRef.current) {
      const monaco = monacoRef.current
      splitEditorRef.current = monaco.editor.create(splitContainerRef.current, {
        theme: 'vs-dark', fontSize: 14,
        fontFamily: "'JetBrains Mono','Fira Code',monospace",
        minimap: { enabled: false }, lineNumbers: 'on' as const,
        wordWrap: 'off' as const, automaticLayout: false,
        scrollBeyondLastLine: false,
        renderLineHighlight: 'line' as const,
        padding: { top: 14, bottom: 14 },
        bracketPairColorization: { enabled: true },
        scrollbar: { horizontal: 'auto', vertical: 'auto' },
        value: splitFile ? (contents.get(splitFile.path) ?? '') : '',
        language: splitFile ? getMonacoLanguage(splitFile.type) : 'html',
      })
      splitEditorRef.current.onDidChangeModelContent(() => {
        const path = splitEditorFilePath.current
        if (!path) return
        const val = splitEditorRef.current.getValue()
        contentsRef.current.set(path, val)
        setContents(prev => { const n = new Map(prev); n.set(path, val); return n })
        setIsDirty(true)
        schedulePreview()
      })
    }
    if (!splitView && splitEditorRef.current) {
      splitEditorRef.current.dispose()
      splitEditorRef.current = null
      splitEditorFilePath.current = ''
    }
  }, [splitView, monacoReady])

  // ── Open file in primary editor ───────────────────────────────────────────
  function openInEditor(file: WebFile) {
    if (file.type === 'img') return  // images don't open in Monaco
    const content = contents.get(file.path) ?? ''
    if (editorFilePath.current !== file.path) {
      editorFilePath.current = file.path
      const monaco = monacoRef.current
      if (monaco && editorRef.current) {
        const lang = getMonacoLanguage(file.type)
        const model = monaco.editor.createModel(content, lang)
        editorRef.current.setModel(model)
      }
    }
    setActiveFile(file)
  }

  // ── Open file in split editor ─────────────────────────────────────────────
  function openInSplit(file: WebFile) {
    if (file.type === 'img') return
    const content = contents.get(file.path) ?? ''
    splitEditorFilePath.current = file.path
    const monaco = monacoRef.current
    if (monaco && splitEditorRef.current) {
      const lang = getMonacoLanguage(file.type)
      const model = monaco.editor.createModel(content, lang)
      splitEditorRef.current.setModel(model)
    }
    setSplitFile(file)
    setSplitPickOpen(false)
    try { localStorage.setItem(LS_LAST2, file.path) } catch {}
  }

  // ── Load file content ─────────────────────────────────────────────────────
  async function loadFileContent(file: WebFile): Promise<string | null> {
    if (contents.has(file.path)) return null  // already cached
    if (file.type === 'img') {
      const url = await fetchAsDataUrl(file.path)
      setContents(prev => { const n = new Map(prev); n.set(file.path, url); return n })
      return null
    }
    const text = await fetchText(file.path)
    setContents(prev => { const n = new Map(prev); n.set(file.path, text); return n })
    return text
  }

  // ── Click file in sidebar ────────────────────────────────────────────────
  async function clickFile(file: WebFile) {
    await loadFileContent(file)
    openInEditor(file)
  }

  // ── Open project ──────────────────────────────────────────────────────────
  async function openProject(proj: WebProject) {
    setActiveProject(proj)
    setContents(new Map())
    setIsDirty(false)
    setActiveFile(null)
    setSplitFile(null)
    editorFilePath.current = ''
    splitEditorFilePath.current = ''
    setExpanded(new Set(['', 'img']))

    // Preload all text files
    const newContents = new Map<string, string>()
    await Promise.all(proj.files.filter(f => f.type !== 'img').map(async f => {
      const text = await fetchText(f.path)
      newContents.set(f.path, text)
    }))
    setContents(newContents)
    contentsRef.current = newContents

    // Open index.html or first HTML file
    const firstHtml = proj.files.find(f => f.name === 'index.html' && f.folder === '')
      ?? proj.files.find(f => f.type === 'html')
    if (firstHtml) {
      const content = newContents.get(firstHtml.path) ?? ''
      editorFilePath.current = firstHtml.path
      const monaco = monacoRef.current
      if (monaco && editorRef.current) {
        editorRef.current.setModel(monaco.editor.createModel(content, 'html'))
      }
      setActiveFile(firstHtml)
    }

    // Restore split file if saved
    const lastSplit = localStorage.getItem(LS_LAST2)
    if (splitView && lastSplit) {
      const sf = proj.files.find(f => f.path === lastSplit)
      if (sf) {
        const sc = newContents.get(sf.path) ?? ''
        splitEditorFilePath.current = sf.path
        const monaco = monacoRef.current
        if (monaco && splitEditorRef.current) splitEditorRef.current.setModel(monaco.editor.createModel(sc, getMonacoLanguage(sf.type)))
        setSplitFile(sf)
      }
    }

    // Update preview
    setTimeout(() => updatePreview(newContents, proj.files), 100)

    // Recent list
    const entry: RecentEntry = { name: proj.name, key: proj.key, openedAt: new Date().toISOString() }
    setRecent(prev => { const n = [entry, ...prev.filter(r => r.key !== proj.key)].slice(0, 3); try { localStorage.setItem(LS_RECENT, JSON.stringify(n)) } catch {}; return n })
    try { localStorage.setItem(LS_LAST, proj.key) } catch {}
  }

  // Keep refs in sync with state for use in closures (timers, event handlers)
  useEffect(() => { livePreviewRef.current = livePreview }, [livePreview])
  useEffect(() => { activeProjectRef.current = activeProject }, [activeProject])

  // ── Preview ───────────────────────────────────────────────────────────────
  function schedulePreview() {
    if (!livePreviewRef.current) return
    if (previewTimer.current) clearTimeout(previewTimer.current)
    previewTimer.current = setTimeout(() => updatePreview(), 600)
  }
  function updatePreview(c?: Map<string, string>, files?: WebFile[]) {
    const cc = c ?? contentsRef.current
    const ff = files ?? activeProjectRef.current?.files ?? []
    if (previewRef.current) previewRef.current.srcdoc = buildPreview(ff, cc)
  }
  useEffect(() => { if (monacoReady && activeProject) updatePreview() }, [monacoReady])

  // ── Flash ─────────────────────────────────────────────────────────────────
  function flash(msg: string) { setSaveMsg(msg); setTimeout(() => setSaveMsg(''), 2800) }

  // ── Save active file ──────────────────────────────────────────────────────
  async function saveActiveFile() {
    if (!activeFile || activeFile.type === 'img') return
    setSaving(true)
    const content = contents.get(activeFile.path) ?? ''
    const err = await pushFile(activeFile.path, content)
    if (err) flash('❌ ' + err)
    else { flash('✓ Uloženo'); setIsDirty(false) }
    setSaving(false)
  }

  // ── Save all files ────────────────────────────────────────────────────────
  async function saveAll() {
    if (!activeProject) return
    setSaving(true)
    const errs: string[] = []
    await Promise.all(activeProject.files.filter(f => f.type !== 'img').map(async f => {
      const c = contents.get(f.path); if (!c) return
      const e = await pushFile(f.path, c); if (e) errs.push(e)
    }))
    if (errs.length) flash('❌ ' + errs[0])
    else { flash('✓ Vše uloženo'); setIsDirty(false) }
    setSaving(false)
  }

  // ── Create project ────────────────────────────────────────────────────────
  async function doCreateProject(name: string, silent = false) {
    const key = sanitizeKey(name.trim() || 'projekt')
    setSaving(true)
    await Promise.all([
      pushFile(`zaci/${uid}/${key}/index.html`, DEFAULT_HTML),
      pushFile(`zaci/${uid}/${key}/style.css`, DEFAULT_CSS),
      pushFile(`zaci/${uid}/${key}/script.js`, DEFAULT_JS),
      pushFile(`zaci/${uid}/${key}/img/.gitkeep`, ''),
    ])
    const projs = await refreshProjects()
    const p = projs.find(x => x.key === key)
    if (p) await openProject(p)
    if (!silent) flash('✓ Projekt vytvořen')
    setNewProjModal(false); setNewProjName(''); setSaving(false)
  }

  // ── Delete project ────────────────────────────────────────────────────────
  async function doDeleteProject(proj: WebProject) {
    setSaving(true)
    await supabase.storage.from(BUCKET).remove(proj.files.map(f => f.path))
    const projs = await refreshProjects()
    if (activeProject?.key === proj.key) {
      if (projs.length > 0) await openProject(projs[0])
      else setActiveProject(null)
    }
    // Remove from recent list
    setRecent(prev => {
      const n = prev.filter(r => r.key !== proj.key)
      try { localStorage.setItem(LS_RECENT, JSON.stringify(n)) } catch {}
      return n
    })
    setDeleteProjModal(null); setSaving(false)
  }

  // ── Rename project ────────────────────────────────────────────────────────
  async function doRenameProject(proj: WebProject) {
    const newKey = sanitizeKey(renameProjVal.trim() || proj.name)
    if (newKey === proj.key) { setRenameProjModal(null); return }
    setSaving(true)
    await Promise.all(proj.files.map(async f => {
      const newPath = f.path.replace(`zaci/${uid}/${proj.key}/`, `zaci/${uid}/${newKey}/`)
      const content = f.type === 'img' ? null : (contents.get(f.path) ?? await fetchText(f.path))
      if (content !== null) await pushFile(newPath, content)
    }))
    await supabase.storage.from(BUCKET).remove(proj.files.map(f => f.path))
    const projs = await refreshProjects()
    if (activeProject?.key === proj.key) {
      const p = projs.find(x => x.key === newKey); if (p) await openProject(p)
    }
    setRenameProjModal(null); setSaving(false)
  }

  // ── Create new file/folder ────────────────────────────────────────────────
  async function doNewItem() {
    if (!activeProject || !newItemModal) return
    const folder = newItemModal.folder
    setSaving(true)
    if (newItemType === 'folder') {
      const folderName = sanitizeKey(newItemName.trim() || 'slozka')
      await pushFile(storagePath(uid, activeProject.key, folder ? `${folder}/${folderName}` : folderName, '.gitkeep'), '')
    } else {
      const ext = newItemType
      const rawName = newItemName.trim() || `novy.${ext}`
      const fileName = rawName.includes('.') ? rawName : `${rawName}.${ext}`
      const content = ext === 'html' ? DEFAULT_HTML : ext === 'css' ? DEFAULT_CSS : DEFAULT_JS
      await pushFile(storagePath(uid, activeProject.key, folder, fileName), content)
    }
    const projs = await refreshProjects()
    const p = projs.find(x => x.key === activeProject.key)
    if (p) { setActiveProject(p); setContents(prev => { const n = new Map(prev); return n }) }
    setNewItemModal(null); setNewItemName(''); setSaving(false)
  }

  // ── Rename file ───────────────────────────────────────────────────────────
  async function doRenameFile(file: WebFile) {
    const newName = renameVal.trim()
    if (!newName || !activeProject) { setRenameModal(null); return }
    const finalName = newName.includes('.') ? newName : `${newName}.${file.name.split('.').pop()}`
    const newPath = storagePath(uid, activeProject.key, file.folder, finalName)
    setSaving(true)
    const content = file.type === 'img' ? null : (contents.get(file.path) ?? await fetchText(file.path))
    if (content !== null) await pushFile(newPath, content)
    await supabase.storage.from(BUCKET).remove([file.path])
    const projs = await refreshProjects()
    const p = projs.find(x => x.key === activeProject.key); if (p) setActiveProject(p)
    if (activeFile?.path === file.path) {
      const newFile = p?.files.find(f => f.path === newPath)
      if (newFile) { setActiveFile(newFile); editorFilePath.current = newPath; setContents(prev => { const n = new Map(prev); if (content) n.set(newPath, content); n.delete(file.path); return n }) }
    }
    setRenameModal(null); setSaving(false)
  }

  // ── Delete file ───────────────────────────────────────────────────────────
  async function doDeleteFile(file: WebFile) {
    if (!activeProject) { setDeleteModal(null); return }
    setSaving(true)
    await supabase.storage.from(BUCKET).remove([file.path])
    const projs = await refreshProjects()
    const p = projs.find(x => x.key === activeProject.key); if (p) setActiveProject(p)
    if (activeFile?.path === file.path) {
      const first = p?.files.find(f => f.type !== 'img')
      if (first) clickFile(first); else setActiveFile(null)
    }
    setDeleteModal(null); setSaving(false)
  }

  // ── Upload images ─────────────────────────────────────────────────────────
  async function uploadImages(files: FileList) {
    if (!activeProject) return
    setUploadingImg(true)
    const uploadErrors: string[] = []
    for (const file of Array.from(files)) {
      const path = storagePath(uid, activeProject.key, 'img', file.name)
      await supabase.storage.from(BUCKET).remove([path])
      const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
        contentType: 'application/octet-stream',
        cacheControl: '0',
      })
      if (error) uploadErrors.push(file.name + ': ' + error.message)
    }
    if (uploadErrors.length > 0) { flash('❌ ' + uploadErrors[0]); setUploadingImg(false); return }
    const projs = await refreshProjects()
    const p = projs.find(x => x.key === activeProject.key); if (p) setActiveProject(p)
    flash(`✓ ${files.length} obrázek nahrán`)
    setUploadingImg(false)
  }

  // ── Drag & drop between folders ───────────────────────────────────────────
  async function dropFileOnFolder(file: WebFile, targetFolder: string) {
    if (!activeProject || file.folder === targetFolder) return
    setSaving(true)
    const newPath = storagePath(uid, activeProject.key, targetFolder, file.name)
    const content = file.type === 'img' ? null : (contents.get(file.path) ?? await fetchText(file.path))
    if (content !== null) await pushFile(newPath, content)
    await supabase.storage.from(BUCKET).remove([file.path])
    const projs = await refreshProjects()
    const p = projs.find(x => x.key === activeProject.key); if (p) setActiveProject(p)
    setDraggingFile(null); setDragOverFolder(null); setSaving(false)
  }

  // ── Download project as ZIP ─────────────────────────────────────────────────
  async function downloadProject() {
    if (!activeProject) return
    // Dynamically import JSZip via fetch+eval (avoids CDN script tag issues)
    const w = window as any
    if (!w.JSZip) {
      try {
        const res = await fetch('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js')
        if (!res.ok) throw new Error('fetch failed')
        const code = await res.text()
        // eslint-disable-next-line no-new-func
        // eslint-disable-next-line no-new-func
        const f = new Function('self','window', code + ';return typeof JSZip!=="undefined"?JSZip:null')
        const cls = f(w, w); if (cls) w.JSZip = cls
      } catch (e: any) {
        flash('❌ JSZip chyba: ' + (e?.message ?? '')); return
      }
    }
    if (!w.JSZip) { flash('❌ JSZip nedostupný'); return }
    const zip = new w.JSZip()
    for (const file of activeProject.files.filter(f => f.name !== '.gitkeep')) {
      if (file.type === 'img') {
        const { data } = await supabase.storage.from(BUCKET).download(file.path)
        if (data) {
          const buf = await data.arrayBuffer()
          const folder = file.folder ? file.folder + '/' : ''
          zip.file(folder + file.name, buf)
        }
      } else {
        const content = contents.get(file.path) ?? await fetchText(file.path)
        const folder = file.folder ? file.folder + '/' : ''
        zip.file(folder + file.name, content)
      }
    }
    const blob = await zip.generateAsync({ type: 'blob' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${activeProject.name}.zip`
    a.style.display = 'none'
    document.body.appendChild(a)
    a.click()
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(a.href) }, 1000)
  }

  // ── Init ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    try { setRecent(JSON.parse(localStorage.getItem(LS_RECENT) ?? '[]')) } catch {}
    ;(async () => {
      const projs = await refreshProjects()
      const lastKey = localStorage.getItem(LS_LAST)
      if (lastKey) { const p = projs.find(x => x.key === lastKey); if (p) { await openProject(p); return } }
      if (projs.length > 0) await openProject(projs[0])
      else await doCreateProject('Muj_web', true)
    })()
  }, [])

  // ── Format helpers ────────────────────────────────────────────────────────
  function fmtDate(iso: string) { return new Date(iso).toLocaleString('cs-CZ', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) }
  function fmtSize(b?: number) { if (!b) return ''; return b < 1024 ? `${b}B` : `${(b/1024).toFixed(1)}kB` }

  // ── Styles ────────────────────────────────────────────────────────────────
  const sideBtn: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, padding: '8px 11px', background: 'rgba(255,255,255,.04)', border: `1px solid ${D.border}`, borderRadius: D.radiusSm, color: D.txtSec, fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', width: '100%', textAlign: 'left' as const, transition: 'all .15s' }
  const modalInp: React.CSSProperties = { width: '100%', padding: '10px 13px', background: D.bgMid, border: `1px solid ${D.border}`, borderRadius: 10, fontSize: 14, color: D.txtPri, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' as const }

  function Modal({ title, children, onClose, width = 400 }: { title: string; children: React.ReactNode; onClose: () => void; width?: number }) {
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

  // Folder display names
  const folderLabel = (folder: string) => folder === '' ? '/' : `📁 ${folder}`

  // Group files by folder
  const filesByFolder = () => {
    if (!activeProject) return new Map<string, WebFile[]>()
    const m = new Map<string, WebFile[]>()
    for (const f of activeProject.files) {
      if (!m.has(f.folder)) m.set(f.folder, [])
      m.get(f.folder)!.push(f)
    }
    return m
  }
  const folders = activeProject ? [...new Set(activeProject.files.map(f => f.folder))].sort() : []

  function onSplitDividerDown(e: React.MouseEvent) {
    e.preventDefault()
    const areaW = editorAreaRef.current?.clientWidth ?? 800
    splitDragRef.current = { startX: e.clientX, startRatio: splitRatio }
    const mv = (ev: MouseEvent) => { if (!splitDragRef.current) return; const r = Math.min(80,Math.max(20, splitDragRef.current.startRatio+((ev.clientX-splitDragRef.current.startX)/areaW)*100)); setSplitRatio(r); requestAnimationFrame(()=>{ editorRef.current?.layout(); splitEditorRef.current?.layout() }) }
    const up = () => { splitDragRef.current=null; window.removeEventListener('mousemove',mv); window.removeEventListener('mouseup',up) }
    window.addEventListener('mousemove',mv); window.addEventListener('mouseup',up)
  }
  function onPreviewDividerDown(e: React.MouseEvent) {
    e.preventDefault()
    previewDragRef.current = { startY: e.clientY, startH: previewHeight }
    const mv = (ev: MouseEvent) => { if (!previewDragRef.current) return; setPreviewHeight(Math.min(700,Math.max(100, previewDragRef.current.startH+(previewDragRef.current.startY-ev.clientY)))) }
    const up = () => { previewDragRef.current=null; window.removeEventListener('mousemove',mv); window.removeEventListener('mouseup',up) }
    window.addEventListener('mousemove',mv); window.addEventListener('mouseup',up)
  }

  return (
    <DarkLayout profile={profile} activeRoute="/student/html">

      {/* ── Modals ── */}
      {newProjModal && (
        <Modal title="🌐 Nový projekt" onClose={() => setNewProjModal(false)}>
          <p style={{ fontSize: 13, color: D.txtSec, marginBottom: 12 }}>Název projektu</p>
          <input value={newProjName} onChange={e => setNewProjName(e.target.value)} onKeyDown={e => e.key === 'Enter' && newProjName.trim() && doCreateProject(newProjName)} autoFocus placeholder="Můj web" style={{ ...modalInp, marginBottom: 14 }} />
          <MBtns onOk={() => doCreateProject(newProjName)} onCancel={() => setNewProjModal(false)} label="Vytvořit" disabled={!newProjName.trim()} />
        </Modal>
      )}
      {deleteProjModal && (
        <Modal title="🗑 Smazat projekt" onClose={() => setDeleteProjModal(null)}>
          <p style={{ fontSize: 13, color: D.txtSec, marginBottom: 6, lineHeight: 1.6 }}>Smazat <strong style={{ color: D.txtPri }}>{deleteProjModal.name}</strong> a všechny soubory?</p>
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
      {openProjModal && (
        <Modal title="📂 Otevřít projekt" onClose={() => setOpenProjModal(false)}>
          <div style={{ maxHeight: 360, overflowY: 'auto', marginBottom: 14 }}>
            {projects.map(proj => (
              <div key={proj.key} onClick={() => { openProject(proj); setOpenProjModal(false) }}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 8, cursor: 'pointer', marginBottom: 4, background: proj.key === activeProject?.key ? accent+'15' : 'transparent' }} className="w-row">
                <span>🌐</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: proj.key === activeProject?.key ? accent : D.txtPri }}>{proj.name}</div>
                  <div style={{ fontSize: 10, color: D.txtSec }}>{proj.files.filter(f => f.name !== '.gitkeep').length} souborů</div>
                </div>
              </div>
            ))}
          </div>
          <button onClick={() => setOpenProjModal(false)} style={{ width: '100%', padding: '10px', background: D.bgMid, color: D.txtSec, border: `1px solid ${D.border}`, borderRadius: 9, cursor: 'pointer', fontFamily: 'inherit' }}>Zavřít</button>
        </Modal>
      )}
      {newItemModal !== null && (
        <Modal title="➕ Nová položka" onClose={() => setNewItemModal(null)}>
          <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' as const }}>
            {(['html','css','js','folder'] as const).map(t => (
              <button key={t} onClick={() => setNewItemType(t)}
                style={{ padding: '5px 14px', borderRadius: 20, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 600, background: newItemType === t ? (t === 'folder' ? D.txtSec+'20' : getFileColor(t as FileType)+'25') : D.bgMid, color: newItemType === t ? (t === 'folder' ? D.txtSec : getFileColor(t as FileType)) : D.txtSec }}>
                {t === 'folder' ? '📁 Složka' : t.toUpperCase()}
              </button>
            ))}
          </div>
          <input value={newItemName} onChange={e => setNewItemName(e.target.value)} onKeyDown={e => e.key === 'Enter' && doNewItem()} autoFocus
            placeholder={newItemType === 'folder' ? 'nazev_slozky' : `soubor.${newItemType}`}
            style={{ ...modalInp, marginBottom: 14 }} />
          <MBtns onOk={doNewItem} onCancel={() => setNewItemModal(null)} label="Vytvořit" disabled={!newItemName.trim()} />
        </Modal>
      )}
      {renameModal && (
        <Modal title="✏ Přejmenovat soubor" onClose={() => setRenameModal(null)}>
          <input value={renameVal} onChange={e => setRenameVal(e.target.value)} onKeyDown={e => e.key === 'Enter' && renameVal.trim() && doRenameFile(renameModal)} autoFocus placeholder={renameModal.name} style={{ ...modalInp, marginBottom: 14 }} />
          <MBtns onOk={() => doRenameFile(renameModal)} onCancel={() => setRenameModal(null)} label="Přejmenovat" disabled={!renameVal.trim()} />
        </Modal>
      )}
      {deleteModal && (
        <Modal title="🗑 Smazat soubor" onClose={() => setDeleteModal(null)}>
          <p style={{ fontSize: 13, color: D.txtSec, marginBottom: 6 }}>Smazat <strong style={{ color: D.txtPri }}>{deleteModal.name}</strong>?</p>
          <p style={{ fontSize: 12, color: D.danger, marginBottom: 18 }}>Tato akce je nevratná.</p>
          <MBtns onOk={() => doDeleteFile(deleteModal)} onCancel={() => setDeleteModal(null)} label="Smazat" danger />
        </Modal>
      )}
      {/* Split file picker */}
      {splitPickOpen && (
        <Modal title="📄 Otevřít ve druhém editoru" onClose={() => setSplitPickOpen(false)}>
          <div style={{ maxHeight: 360, overflowY: 'auto', marginBottom: 14 }}>
            {activeProject?.files.filter(f => f.type !== 'img' && f.name !== '.gitkeep').map(f => (
              <div key={f.path} onClick={() => openInSplit(f)}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 8, cursor: 'pointer', marginBottom: 3, background: f.path === splitFile?.path ? accent+'15' : 'transparent' }} className="w-row">
                <img src={`/icons/${f.type}.png`} alt={f.type} style={{ width: 16, height: 16, objectFit: 'contain', flexShrink: 0 }} onError={e => { (e.target as HTMLImageElement).style.display='none' }} />
                <span style={{ fontSize: 13, color: f.path === splitFile?.path ? accent : D.txtPri }}>{f.folder ? f.folder + '/' : ''}{f.name}</span>
              </div>
            ))}
          </div>
          <button onClick={() => setSplitPickOpen(false)} style={{ width: '100%', padding: '10px', background: D.bgMid, color: D.txtSec, border: `1px solid ${D.border}`, borderRadius: 9, cursor: 'pointer', fontFamily: 'inherit' }}>Zavřít</button>
        </Modal>
      )}

      <input ref={imgInputRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={e => e.target.files && uploadImages(e.target.files)} />

      <style>{`
        .w-sb:hover { background: rgba(255,255,255,.08) !important; color: #fff !important; }
        .w-row { transition: background .12s; }
        .w-row:hover { background: rgba(255,255,255,.05) !important; }
        .w-row:hover .w-acts { opacity: 1 !important; }
        .drop-target { border: 1px dashed ${accent} !important; background: ${accent}10 !important; }
        @keyframes spin { to { transform: rotate(360deg) } }
      `}</style>

      {/* ── Page header ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18, flexWrap: 'wrap' }}>
        <div style={{ width: 40, height: 40, borderRadius: 11, background: '#E34C2615', border: `1px solid #E34C2620`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <img src="/icons/html.png" alt="HTML" style={{ width: 24, height: 24, objectFit: 'contain' }} onError={e => { (e.target as HTMLImageElement).style.display='none' }} />
        </div>
        <div>
          <h1 style={{ fontSize: 19, fontWeight: 800, color: D.txtPri, margin: '0 0 2px' }}>HTML Editor</h1>
          <p style={{ fontSize: 11, color: D.txtSec, margin: 0 }}>HTML · CSS · JavaScript · Ctrl+S uložit</p>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          {saveMsg && <span style={{ fontSize: 12, color: saveMsg.startsWith('❌') ? D.danger : D.success, fontWeight: 600 }}>{saveMsg}</span>}
          {isDirty && !saveMsg && <span style={{ fontSize: 11, color: D.warning }}>● neuloženo</span>}
        </div>
      </div>

      {/* ── 2-col layout ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '230px minmax(0,1fr)', gap: 14, alignItems: 'start' }}>

        {/* ══ LEFT: Sidebar ══ */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

          {/* Project actions */}
          <div style={card({ padding: '13px' })}>
            <SectionLabel>Projekt</SectionLabel>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <button className="w-sb" style={sideBtn} onClick={() => setNewProjModal(true)}><span>🌐</span> Nový projekt</button>
              <button className="w-sb" style={sideBtn} onClick={() => { setOpenProjModal(true); refreshProjects() }}><span>📂</span> Otevřít projekt</button>
              <div style={{ height: 1, background: D.border, margin: '3px 0' }} />
              <button className="w-sb" style={{ ...sideBtn, opacity: !activeProject || saving ? .4 : 1 }} disabled={!activeProject || saving} onClick={saveAll}><span>💾</span> Uložit vše</button>

              <button className="w-sb" style={{ ...sideBtn, opacity: !activeProject ? .4 : 1 }} disabled={!activeProject} onClick={() => imgInputRef.current?.click()}>
                <span>🖼</span> {uploadingImg ? 'Nahrávám…' : 'Nahrát obrázky'}
              </button>
            </div>
          </div>

          {/* Nedávné */}
          <div style={card({ padding: '13px' })}>
            <SectionLabel>Nedávné projekty</SectionLabel>
            {recent.length === 0
              ? <div style={{ fontSize: 12, color: D.txtSec }}>Žádné nedávné projekty</div>
              : recent.map(r => (
                  <div key={r.key} className="w-row" onClick={() => { const p = projects.find(x => x.key === r.key); if (p) openProject(p) }}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 7px', borderRadius: D.radiusSm, cursor: 'pointer', background: r.key === activeProject?.key ? accent+'15' : 'transparent', marginBottom: 2 }}>
                    <span>🌐</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: r.key === activeProject?.key ? accent : D.txtPri, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</div>
                      <div style={{ fontSize: 10, color: D.txtSec }}>{fmtDate(r.openedAt)}</div>
                    </div>
                  </div>
                ))
            }
          </div>

          {/* File tree */}
          <div style={{ ...card({ padding: '13px' }), flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: D.txtSec, textTransform: 'uppercase', letterSpacing: '.07em' }}>
                {activeProject ? activeProject.name : 'Soubory'}
              </div>
              {activeProject && (
                <div style={{ display: 'flex', gap: 4 }}>
                  <button onClick={() => setNewItemModal({ folder: '' })} title="Přidat soubor/složku"
                    style={{ padding: '2px 7px', background: accent+'20', color: accent, border: 'none', borderRadius: 5, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700 }}>+</button>
                  <button onClick={() => { setRenameProjModal(activeProject); setRenameProjVal(activeProject.name) }}
                    style={{ padding: '2px 6px', background: 'none', border: 'none', cursor: 'pointer', color: D.txtSec, fontSize: 11 }} title="Přejmenovat projekt">✏</button>
                  <button onClick={() => setDeleteProjModal(activeProject)}
                    style={{ padding: '2px 6px', background: 'none', border: 'none', cursor: 'pointer', color: D.danger, fontSize: 11 }} title="Smazat projekt">🗑</button>
                </div>
              )}
            </div>

            {loadingProj
              ? <div style={{ fontSize: 12, color: D.txtSec, display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0' }}>
                  <div style={{ width: 14, height: 14, border: `2px solid ${D.border}`, borderTopColor: accent, borderRadius: '50%', animation: 'spin .6s linear infinite' }} />Načítám…
                </div>
              : !activeProject
                ? <div style={{ fontSize: 12, color: D.txtSec }}>Žádný projekt není otevřen</div>
                : folders.map(folder => (
                    <div key={folder} style={{ marginBottom: 4 }}>
                      {/* Folder header */}
                      <div className="w-row"
                        onDragOver={e => { e.preventDefault(); setDragOverFolder(folder) }}
                        onDragLeave={() => setDragOverFolder(null)}
                        onDrop={e => { e.preventDefault(); if (draggingFile) dropFileOnFolder(draggingFile, folder) }}
                        style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 6px', borderRadius: 7, cursor: 'pointer', background: dragOverFolder === folder ? accent+'15' : 'transparent' }}
                        onClick={() => setExpanded(prev => { const n = new Set(prev); n.has(folder) ? n.delete(folder) : n.add(folder); return n })}>
                        <span style={{ fontSize: 9, color: D.txtSec, display: 'inline-block', transform: expanded.has(folder) ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }}>▶</span>
                        <span style={{ fontSize: 12, fontWeight: 600, color: D.txtSec, flex: 1 }}>{folderLabel(folder)}</span>
                        <button onClick={e => { e.stopPropagation(); setNewItemModal({ folder }) }}
                          style={{ opacity: 0, padding: '1px 5px', background: 'none', border: 'none', cursor: 'pointer', color: accent, fontSize: 12, fontWeight: 700 }} className="w-acts">+</button>
                      </div>
                      {/* Files */}
                      {expanded.has(folder) && (filesByFolder().get(folder) ?? []).filter(f => f.name !== '.gitkeep').map(f => (
                        <div key={f.path} className="w-row"
                          draggable onDragStart={() => setDraggingFile(f)} onDragEnd={() => { setDraggingFile(null); setDragOverFolder(null) }}
                          style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 7px 4px 16px', borderRadius: 7, cursor: 'pointer', marginBottom: 1, background: f.path === activeFile?.path ? accent+'18' : 'transparent', border: `1px solid ${f.path === activeFile?.path ? accent+'30' : 'transparent'}` }}
                          onClick={() => clickFile(f)}>
                          <img src={f.type === 'img' ? '/icons/img.png' : `/icons/${f.type}.png`} alt={f.type} style={{ width: 14, height: 14, objectFit: 'contain', flexShrink: 0 }} onError={e => { (e.target as HTMLImageElement).style.display='none' }} />
                          <span style={{ fontSize: 12, color: f.path === activeFile?.path ? accent : D.txtPri, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: f.path === activeFile?.path ? 600 : 400 }}>{f.name}</span>
                          {f.size ? <span style={{ fontSize: 9, color: D.txtSec }}>{fmtSize(f.size)}</span> : null}
                          <div className="w-acts" style={{ display: 'flex', gap: 1, opacity: 0, flexShrink: 0 }}>
                            {f.type !== 'img' && (
                              <button onClick={e => { e.stopPropagation(); setSplitView(true); openInSplit(f) }}
                                style={{ padding: '1px 4px', background: 'none', border: 'none', cursor: 'pointer', color: D.txtSec, fontSize: 10, borderRadius: 4 }} title="Otevřít v druhém editoru">⊞</button>
                            )}
                            <button onClick={e => { e.stopPropagation(); setRenameModal(f); setRenameVal(f.name.split('.')[0]) }}
                              style={{ padding: '1px 4px', background: 'none', border: 'none', cursor: 'pointer', color: D.txtSec, fontSize: 11, borderRadius: 4 }} title="Přejmenovat">✏</button>
                            <button onClick={e => { e.stopPropagation(); setDeleteModal(f) }}
                              style={{ padding: '1px 4px', background: 'none', border: 'none', cursor: 'pointer', color: D.danger, fontSize: 11, borderRadius: 4 }} title="Smazat">🗑</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ))
            }
          </div>
        </div>

        {/* ══ RIGHT: Editor + Preview ══ */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0, minWidth: 0, overflow: 'hidden' }}>

          {/* Toolbar */}
          <div style={{ background: D.bgCard, border: `1px solid ${D.border}`, borderRadius: `${D.radius} ${D.radius} 0 0`, borderBottomWidth: 0, display: 'flex', alignItems: 'center', gap: 8, padding: '9px 14px', flexShrink: 0, flexWrap: 'wrap' as const }}>
            {/* Active file tab */}
            {activeFile && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 10px', background: D.bgMid, borderRadius: 7, fontSize: 12 }}>
                {activeFile.type === 'img' ? <span style={{ fontSize: 13 }}>🖼</span> : <img src={`/icons/${activeFile.type}.png`} alt={activeFile.type} style={{ width: 15, height: 15, objectFit: 'contain', flexShrink: 0 }} />}
                <span style={{ color: D.txtPri, fontWeight: 600 }}>{activeFile.folder ? activeFile.folder + '/' : ''}{activeFile.name}</span>
                {isDirty && <span style={{ color: D.warning, fontSize: 10 }}>●</span>}
              </div>
            )}
            <div style={{ flex: 1 }} />
            {/* Split view */}
            <button onClick={() => { if (splitView) { setSplitView(false); setSplitFile(null) } else { setSplitView(true) } }}
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', background: splitView ? accent+'20' : 'rgba(255,255,255,.04)', color: splitView ? accent : D.txtSec, border: `1px solid ${splitView ? accent+'40' : D.border}`, borderRadius: 7, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>
              ⊞ {splitView ? 'Split ON' : 'Split OFF'}
            </button>
            <button onClick={() => setLivePreview(p => !p)}
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', background: livePreview ? D.success+'18' : 'rgba(255,255,255,.04)', color: livePreview ? D.success : D.txtSec, border: `1px solid ${livePreview ? D.success+'40' : D.border}`, borderRadius: 7, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>
              {livePreview ? '⚡ Live' : '⏸ Live'}
            </button>
            {!livePreview && (
              <button onClick={() => updatePreview()}
                style={{ padding: '5px 12px', background: accent+'20', color: accent, border: `1px solid ${accent}40`, borderRadius: 7, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>▶ Obnovit</button>
            )}
            <button onClick={downloadProject} disabled={!activeProject}
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', background: 'rgba(255,255,255,.04)', color: D.txtSec, border: `1px solid ${D.border}`, borderRadius: 7, fontSize: 11, cursor: activeProject ? 'pointer' : 'not-allowed', fontFamily: 'inherit', opacity: activeProject ? 1 : .4 }}>⬇️ ZIP</button>
            <button id="html-save-btn" onClick={saveActiveFile} disabled={!activeFile || saving}
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 13px', background: isDirty ? accent+'20' : 'rgba(255,255,255,.04)', color: isDirty ? accent : D.txtSec, border: `1px solid ${isDirty ? accent+'40' : D.border}`, borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', transition: 'all .2s', opacity: !activeFile || saving ? .4 : 1 }}>
              {saving ? '…' : '💾 Uložit'}
            </button>
          </div>

          {/* Editor area */}
          <div ref={editorAreaRef} style={{ display: 'flex', height: '380px', background: '#1E1E1E', border: `1px solid ${D.border}`, borderTop: 'none', overflow: 'hidden', width: '100%', boxSizing: 'border-box' as const }}>
            {/* Primary editor */}
            <div style={{ display: 'flex', flexDirection: 'column', width: splitView ? `${splitRatio}%` : '100%', flexShrink: 0, overflow: 'hidden' }}>
              {activeFile?.type === 'img'
                ? <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#252526', flexDirection: 'column', gap: 12 }}>
                    {contents.get(activeFile.path)
                      ? <img src={contents.get(activeFile.path)} alt={activeFile.name} style={{ maxWidth: '80%', maxHeight: 300, borderRadius: 8, border: `1px solid ${D.border}` }} />
                      : <div style={{ fontSize: 13, color: D.txtSec }}>Načítám obrázek…</div>}
                    <div style={{ fontSize: 12, color: D.txtSec }}>{activeFile.name}</div>
                  </div>
                : <div ref={editorContainerRef} style={{ flex: 1, overflow: 'hidden' }} />
              }
            </div>
            {/* Split divider */}
            {splitView && (
              <div onMouseDown={onSplitDividerDown}
                style={{ width: 5, flexShrink: 0, cursor: 'col-resize', background: 'rgba(255,255,255,.07)' }}
                onMouseEnter={e => (e.currentTarget.style.background = accent+'80')}
                onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,.07)')} />
            )}
            {/* Split editor */}
            {splitView && (
              <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0, overflow: 'hidden' }}>
                {/* Split header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px', background: '#252526', borderBottom: '1px solid rgba(255,255,255,.08)', borderLeft: '1px solid rgba(255,255,255,.06)', flexShrink: 0 }}>
                  {splitFile
                    ? <><img src={`/icons/${splitFile.type}.png`} alt={splitFile.type} style={{ width: 13, height: 13, objectFit: 'contain', flexShrink: 0 }} onError={e=>{(e.target as HTMLImageElement).style.display='none'}} />
                       <span style={{ fontSize: 11, color: D.txtSec }}>{splitFile.name}</span></>
                    : <span style={{ fontSize: 11, color: D.txtSec }}>Druhý editor</span>
                  }
                  <button onClick={() => setSplitPickOpen(true)}
                    style={{ marginLeft: 'auto', padding: '2px 8px', background: accent+'20', color: accent, border: 'none', borderRadius: 5, fontSize: 10, cursor: 'pointer', fontFamily: 'inherit' }}>
                    Otevřít soubor
                  </button>
                </div>
                <div ref={splitContainerRef} style={{ height: 'calc(100% - 30px)', overflow: 'hidden' }} />
              </div>
            )}
          </div>

          {/* Preview resize handle */}
          <div onMouseDown={onPreviewDividerDown} title="Táhněte pro změnu výšky"
            style={{ height: 7, cursor: 'ns-resize', background: 'rgba(255,255,255,.03)', border: `1px solid ${D.border}`, borderTop: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
            onMouseEnter={e => (e.currentTarget.style.background = accent+'22')}
            onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,.03)')}>
            <div style={{ width: 28, height: 2, borderRadius: 2, background: 'rgba(255,255,255,.15)' }} />
          </div>
          {/* Preview */}
          <div style={{ height: `${previewHeight}px`, display: 'flex', flexDirection: 'column', border: `1px solid ${D.border}`, borderTop: 'none', borderRadius: `0 0 ${D.radius} ${D.radius}`, overflow: 'hidden', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 14px', background: D.bgCard, borderBottom: `1px solid ${D.border}`, flexShrink: 0 }}>
              <div style={{ display: 'flex', gap: 5 }}>
                <div style={{ width: 9, height: 9, borderRadius: '50%', background: '#FF5F56' }} />
                <div style={{ width: 9, height: 9, borderRadius: '50%', background: '#FFBD2E' }} />
                <div style={{ width: 9, height: 9, borderRadius: '50%', background: '#27C93F' }} />
              </div>
              <span style={{ fontSize: 11, color: D.txtSec, flex: 1, textAlign: 'center' as const }}>
                {activeProject ? `${activeProject.name} — náhled` : 'Náhled'}
              </span>
              <button onClick={() => updatePreview()} style={{ padding: '2px 8px', background: D.bgMid, color: D.txtSec, border: `1px solid ${D.border}`, borderRadius: 5, fontSize: 10, cursor: 'pointer', fontFamily: 'inherit' }}>↺ Obnovit</button>
            </div>
            <iframe ref={previewRef} sandbox="allow-scripts" style={{ flex: 1, border: 'none', background: '#fff' }} title="HTML Preview" />
          </div>
        </div>
      </div>
    </DarkLayout>
  )
}
