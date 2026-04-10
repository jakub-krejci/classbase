'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import AssignmentPanel from '@/components/AssignmentPanel'
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

export default function HtmlEditor({ profile, assignmentId }: { profile: any; assignmentId?: string | null }) {
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
  // Responsive preview: null = full width, otherwise px width
  const [previewWidth, setPreviewWidth]   = useState<number | null>(null)
  const previewTimer        = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── UI state ──────────────────────────────────────────────────────────────
  const [saving, setSaving]     = useState(false)
  const [saveMsg, setSaveMsg]   = useState('')
  const [rightTab, setRightTab] = useState<'validator'|'design'|'reference'>('validator')
  const [refSearch, setRefSearch]       = useState('')
  const [pickerColor, setPickerColor]   = useState('#7C3AED')
  const [contrastText, setContrastText] = useState('#ffffff')
  const [contrastBg, setContrastBg]     = useState('#7C3AED')
  const [shadowX, setShadowX]           = useState(0)
  const [shadowY, setShadowY]           = useState(4)
  const [shadowBlur, setShadowBlur]     = useState(20)
  const [shadowSpread, setShadowSpread] = useState(0)
  const [shadowColor, setShadowColor]   = useState('#000000')
  const [shadowAlpha, setShadowAlpha]   = useState(0.25)
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
    // Supabase returns blobs with content-type 'application/octet-stream' for images
    // uploaded that way. Browsers won't render <img src="data:application/octet-stream...">.
    // We must re-type the blob using the file extension so the data URL has the right MIME.
    const ext = path.split('.').pop()?.toLowerCase() ?? ''
    const mimeMap: Record<string, string> = {
      png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
      gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml',
      ico: 'image/x-icon', bmp: 'image/bmp',
    }
    const mime = mimeMap[ext] ?? data.type
    const correctBlob = mime !== data.type ? new Blob([data], { type: mime }) : data
    return new Promise(resolve => {
      const r = new FileReader()
      r.onload = () => resolve(r.result as string)
      r.readAsDataURL(correctBlob)
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
        monaco.editor.defineTheme('cb-dark', {
          base: 'vs-dark', inherit: true,
          rules: [
            { token: 'tag', foreground: 'f47067' },
            { token: 'attribute.name', foreground: 'c792ea' },
            { token: 'attribute.value', foreground: 'c3e88d' },
            { token: 'comment', foreground: '546e7a', fontStyle: 'italic' },
            { token: 'string', foreground: 'c3e88d' },
            { token: 'keyword', foreground: 'c792ea' },
            { token: 'number', foreground: 'f78c6c' },
          ],
          colors: {
            'editor.background': '#0d1117',
            'editor.foreground': '#e6edf3',
            'editorLineNumber.foreground': '#30363d',
            'editor.lineHighlightBackground': '#161b22',
          },
        })
        const commonOpts = {
          theme: 'cb-dark', fontSize: 14,
          fontFamily: "'JetBrains Mono','Fira Code',monospace",
          minimap: { enabled: false }, lineNumbers: 'on' as const,
          wordWrap: 'off' as const, automaticLayout: false,
          scrollBeyondLastLine: false,
          renderLineHighlight: 'line' as const,
          padding: { top: 14, bottom: 14 },
          bracketPairColorization: { enabled: true },
        }
        if (editorContainerRef.current) {
          // Enable Emmet for HTML and CSS (Monaco built-in)
          monaco.languages.html.htmlDefaults.setOptions({ format: { wrapLineLength: 0 } })
          editorRef.current = monaco.editor.create(editorContainerRef.current, { ...commonOpts, value: DEFAULT_HTML, language: 'html', wordWrap: 'off', scrollbar: { horizontal: 'auto', vertical: 'auto' }, emptySelectionClipboard: true })
          // Register Emmet Tab key handler for primary editor
          editorRef.current.addCommand(monaco.KeyCode.Tab, () => {
            const ed = editorRef.current
            if (!ed) return
            const model = ed.getModel()
            if (!model) return
            const pos = ed.getPosition()
            if (!pos) return
            const lineContent = model.getLineContent(pos.lineNumber)
            const textBefore = lineContent.substring(0, pos.column - 1).trimStart()
            // Only expand if there's an Emmet-like abbreviation (no spaces, ends with tag char)
            if (textBefore && /^[a-zA-Z.#>+*\[\]{}()^$@:"'0-9]+$/.test(textBefore.split(' ').pop() ?? '')) {
              // Trigger Emmet expand via suggestion widget or manual expansion
              ed.trigger('emmet', 'editor.emmet.action.expandAbbreviation', {})
            } else {
              ed.trigger('keyboard', 'tab', {})
            }
          }, 'editorTextFocus && !editorTabMovesFocus && !hasMultipleSelections')
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

    // Preload all text files AND images (images as data URLs for preview)
    const newContents = new Map<string, string>()
    await Promise.all(proj.files.map(async f => {
      if (f.name === '.gitkeep') return
      if (f.type === 'img') {
        const dataUrl = await fetchAsDataUrl(f.path)
        if (dataUrl) newContents.set(f.path, dataUrl)
      } else {
        const text = await fetchText(f.path)
        newContents.set(f.path, text)
      }
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
    if (file.type === 'img') {
      // For images: download raw blob and re-upload under new name
      const { data: imgData } = await supabase.storage.from(BUCKET).download(file.path)
      if (imgData) {
        await supabase.storage.from(BUCKET).remove([newPath])
        await supabase.storage.from(BUCKET).upload(newPath, imgData, { contentType: 'application/octet-stream', cacheControl: '0' })
      }
    } else {
      const content = contents.get(file.path) ?? await fetchText(file.path)
      await pushFile(newPath, content)
      // Update contents cache
      setContents(prev => { const n = new Map(prev); n.set(newPath, content); n.delete(file.path); return n })
      contentsRef.current.set(newPath, content); contentsRef.current.delete(file.path)
    }
    await supabase.storage.from(BUCKET).remove([file.path])
    const projs = await refreshProjects()
    const p = projs.find(x => x.key === activeProject.key); if (p) setActiveProject(p)
    if (activeFile?.path === file.path) {
      const newFile = p?.files.find(f => f.path === newPath)
      if (newFile) { setActiveFile(newFile); editorFilePath.current = newPath }
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
    // Load newly uploaded images as data URLs so preview can use them
    for (const file of Array.from(files)) {
      const path = storagePath(uid, activeProject.key, 'img', file.name)
      const dataUrl = await fetchAsDataUrl(path)
      if (dataUrl) { contentsRef.current.set(path, dataUrl); setContents(prev => { const n = new Map(prev); n.set(path, dataUrl); return n }) }
    }
    flash(`✓ ${files.length === 1 ? '1 obrázek nahrán' : files.length + ' obrázky nahrány'}`)
    setUploadingImg(false)
  }

  // ── Drag & drop between folders ───────────────────────────────────────────
  async function dropFileOnFolder(file: WebFile, targetFolder: string) {
    if (!activeProject || file.folder === targetFolder) return
    setSaving(true)
    const newPath = storagePath(uid, activeProject.key, targetFolder, file.name)
    if (file.type === 'img') {
      const { data: imgData } = await supabase.storage.from(BUCKET).download(file.path)
      if (imgData) {
        await supabase.storage.from(BUCKET).remove([newPath])
        await supabase.storage.from(BUCKET).upload(newPath, imgData, { contentType: 'application/octet-stream', cacheControl: '0' })
        // Update contents cache with new path (keep data URL)
        const dataUrl = contentsRef.current.get(file.path)
        if (dataUrl) { contentsRef.current.set(newPath, dataUrl); contentsRef.current.delete(file.path) }
      }
    } else {
      const content = contents.get(file.path) ?? await fetchText(file.path)
      await pushFile(newPath, content)
      setContents(prev => { const n = new Map(prev); n.set(newPath, content); n.delete(file.path); return n })
      contentsRef.current.set(newPath, content); contentsRef.current.delete(file.path)
    }
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
        if (!res.ok) throw new Error('HTTP ' + res.status)
        const code = await res.text()
        // Monaco registers window.define (AMD loader). JSZip detects it and tries to use
        // define() causing "only one anonymous define" error. Temporarily hide define.
        const savedDefine = w.define
        w.define = undefined
        try {
          // eslint-disable-next-line no-new-func
          new Function(code)()
        } finally {
          w.define = savedDefine
        }
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
    <DarkLayout profile={profile} activeRoute="/student/html" fullContent>

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

      {/* ── Assignment panel ── */}
      {assignmentId && (
        <AssignmentPanel
          assignmentId={assignmentId}
          studentId={uid ?? profile?.id}
          accent={accent}
        />
      )}
      {/* ── 3-col layout ── */}
      <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>

        {/* ══ LEFT: Sidebar ══ */}
        <div style={{ width: 210, flexShrink: 0, borderRight: `1px solid ${D.border}`, background: D.bgCard, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

          {/* Header */}
          <div style={{ padding: '12px 12px 10px', borderBottom: `1px solid ${D.border}`, flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <img src="/icons/html.png" alt="HTML" style={{ width: 18, height: 18, objectFit: 'contain' }} />
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: D.txtPri, lineHeight: 1.2 }}>WebEdit</div>
                <div style={{ fontSize: 9, fontWeight: 400, color: D.txtSec, lineHeight: 1.2 }}>by Jakub Krejčí</div>
              </div>
              {isDirty && <span style={{ fontSize: 9, color: D.warning, marginLeft: 'auto' }}>● neuloženo</span>}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <button className="w-sb" style={{...sideBtn}} onClick={() => setNewProjModal(true)}><span>🌐</span> Nový projekt</button>
              <button className="w-sb" style={{...sideBtn}} onClick={() => { setOpenProjModal(true); refreshProjects() }}><span>📂</span> Otevřít projekt</button>
              <div style={{ height: 1, background: D.border, margin: '2px 0' }} />
              <button className="w-sb" style={{...sideBtn, opacity: !activeProject || saving ? .4 : 1}} disabled={!activeProject || saving} onClick={saveAll}><span>💾</span> Uložit vše</button>
              <button className="w-sb" style={{...sideBtn, opacity: !activeProject ? .4 : 1}} disabled={!activeProject} onClick={() => imgInputRef.current?.click()}>
                <span>🖼</span> {uploadingImg ? 'Nahrávám…' : 'Nahrát obrázky'}
              </button>
            </div>
          </div>

          {/* Scrollable: Moje projekty */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
            <div style={{ padding: '6px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: D.txtSec, textTransform: 'uppercase', letterSpacing: '.06em' }}>{activeProject ? activeProject.name : 'Moje projekty'}</span>
              {activeProject && <div style={{ display: 'flex', gap: 3 }}>
                <button onClick={() => setNewItemModal({ folder: '' })} style={{ padding: '1px 6px', background: accent+'20', color: accent, border: 'none', borderRadius: 4, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700 }}>+</button>
                <button onClick={() => { setRenameProjModal(activeProject); setRenameProjVal(activeProject.name) }} style={{ padding: '1px 5px', background: 'none', border: 'none', cursor: 'pointer', color: D.txtSec, fontSize: 11 }}>✏</button>
                <button onClick={() => setDeleteProjModal(activeProject)} style={{ padding: '1px 5px', background: 'none', border: 'none', cursor: 'pointer', color: D.danger, fontSize: 11 }}>🗑</button>
              </div>}
            </div>
            {loadingProj
              ? <div style={{ fontSize: 12, color: D.txtSec, display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px' }}>
                  <div style={{ width: 13, height: 13, border: `2px solid ${D.border}`, borderTopColor: accent, borderRadius: '50%', animation: 'spin .6s linear infinite' }} />Načítám…
                </div>
              : !activeProject
                ? <div style={{ fontSize: 11, color: D.txtSec, padding: '4px 12px' }}>Žádný projekt není otevřen</div>
                : folders.map(folder => (
                    <div key={folder} style={{ marginBottom: 2 }}>
                      <div className="w-row"
                        onDragOver={e => { e.preventDefault(); setDragOverFolder(folder) }}
                        onDragLeave={() => setDragOverFolder(null)}
                        onDrop={e => { e.preventDefault(); if (draggingFile) dropFileOnFolder(draggingFile, folder) }}
                        style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 12px', cursor: 'pointer', background: dragOverFolder === folder ? accent+'15' : 'transparent' }}
                        onClick={() => setExpanded(prev => { const n = new Set(prev); n.has(folder) ? n.delete(folder) : n.add(folder); return n })}>
                        <span style={{ fontSize: 9, color: D.txtSec, display: 'inline-block', transform: expanded.has(folder) ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }}>▶</span>
                        <span style={{ fontSize: 11, fontWeight: 600, color: D.txtSec, flex: 1 }}>{folderLabel(folder)}</span>
                        <button onClick={e => { e.stopPropagation(); setNewItemModal({ folder }) }}
                          style={{ opacity: 0, padding: '1px 5px', background: 'none', border: 'none', cursor: 'pointer', color: accent, fontSize: 12, fontWeight: 700 }} className="w-acts">+</button>
                      </div>
                      {expanded.has(folder) && (filesByFolder().get(folder) ?? []).filter(f => f.name !== '.gitkeep').map(f => (
                        <div key={f.path} className="w-row"
                          draggable onDragStart={() => setDraggingFile(f)} onDragEnd={() => { setDraggingFile(null); setDragOverFolder(null) }}
                          style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 12px 4px 22px', borderRadius: 6, cursor: 'pointer', marginBottom: 1, background: f.path === activeFile?.path ? accent+'18' : 'transparent', border: `1px solid ${f.path === activeFile?.path ? accent+'30' : 'transparent'}` }}
                          onClick={() => clickFile(f)}>
                          <img src={f.type === 'img' ? '/icons/img.png' : `/icons/${f.type}.png`} alt={f.type} style={{ width: 13, height: 13, objectFit: 'contain', flexShrink: 0 }} onError={e => { (e.target as HTMLImageElement).style.display='none' }} />
                          <span style={{ fontSize: 11, color: f.path === activeFile?.path ? accent : D.txtPri, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: f.path === activeFile?.path ? 600 : 400 }}>{f.name}</span>
                          {f.size ? <span style={{ fontSize: 9, color: D.txtSec }}>{fmtSize(f.size)}</span> : null}
                          <div className="w-acts" style={{ display: 'flex', gap: 1, opacity: 0, flexShrink: 0 }}>
                            {f.type !== 'img' && <button onClick={e => { e.stopPropagation(); setSplitView(true); openInSplit(f) }} style={{ padding: '1px 4px', background: 'none', border: 'none', cursor: 'pointer', color: D.txtSec, fontSize: 10 }} title="Split">⊞</button>}
                            <button onClick={e => { e.stopPropagation(); setRenameModal(f); setRenameVal(f.name.split('.')[0]) }} style={{ padding: '1px 4px', background: 'none', border: 'none', cursor: 'pointer', color: D.txtSec, fontSize: 11 }}>✏</button>
                            <button onClick={e => { e.stopPropagation(); setDeleteModal(f) }} style={{ padding: '1px 4px', background: 'none', border: 'none', cursor: 'pointer', color: D.danger, fontSize: 11 }}>🗑</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ))
            }
          </div>
          {saveMsg && <div style={{ padding: '6px 12px', borderTop: `1px solid ${D.border}`, fontSize: 11, color: saveMsg.startsWith('❌') ? D.danger : D.success, flexShrink: 0 }}>{saveMsg}</div>}
        </div>

        {/* ══ CENTER: Editor + Preview ══ */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>

          {/* Toolbar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderBottom: `1px solid ${D.border}`, flexShrink: 0, flexWrap: 'wrap' as const }}>
            {/* Active file tab */}
            {activeFile && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 8px', background: D.bgMid, borderRadius: 6, fontSize: 12 }}>
                {activeFile.type === 'img' ? <span style={{ fontSize: 13 }}>🖼</span> : <img src={`/icons/${activeFile.type}.png`} alt={activeFile.type} style={{ width: 14, height: 14, objectFit: 'contain', flexShrink: 0 }} />}
                <span style={{ color: D.txtPri, fontWeight: 600 }}>{activeFile.folder ? activeFile.folder + '/' : ''}{activeFile.name}</span>
                {isDirty && <span style={{ color: D.warning, fontSize: 10 }}>●</span>}
              </div>
            )}
            <div style={{ flex: 1 }} />
            <button onClick={() => { if (splitView) { setSplitView(false); setSplitFile(null) } else { setSplitView(true) } }}
              style={{ padding: '5px 10px', background: splitView ? accent+'20' : 'rgba(255,255,255,.04)', color: splitView ? accent : D.txtSec, border: `1px solid ${splitView ? accent+'40' : D.border}`, borderRadius: 7, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>
              ⊞ {splitView ? 'Split ON' : 'Split OFF'}
            </button>
            <button onClick={() => setLivePreview(p => !p)}
              style={{ padding: '5px 10px', background: livePreview ? D.success+'18' : 'rgba(255,255,255,.04)', color: livePreview ? D.success : D.txtSec, border: `1px solid ${livePreview ? D.success+'40' : D.border}`, borderRadius: 7, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>
              {livePreview ? '⚡ Live' : '⏸ Live'}
            </button>
            {!livePreview && (
              <button onClick={() => updatePreview()}
                style={{ padding: '5px 10px', background: accent+'20', color: accent, border: `1px solid ${accent}40`, borderRadius: 7, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>▶ Obnovit</button>
            )}
            <button onClick={downloadProject} disabled={!activeProject}
              style={{ padding: '5px 10px', background: 'rgba(255,255,255,.04)', color: D.txtSec, border: `1px solid ${D.border}`, borderRadius: 7, fontSize: 11, cursor: activeProject ? 'pointer' : 'not-allowed', fontFamily: 'inherit', opacity: activeProject ? 1 : .4 }}>⬇ ZIP</button>
            <button id="html-save-btn" onClick={saveActiveFile} disabled={!activeFile || saving}
              style={{ padding: '5px 11px', background: isDirty ? accent+'20' : 'rgba(255,255,255,.04)', color: isDirty ? accent : D.txtSec, border: `1px solid ${isDirty ? accent+'40' : D.border}`, borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', transition: 'all .2s', opacity: !activeFile || saving ? .4 : 1 }}>
              {saving ? '…' : '💾 Uložit'}
            </button>
          </div>

          {/* Editor area */}
          <div ref={editorAreaRef} style={{ flex: 1, display: 'flex', background: '#0d1117', overflow: 'hidden', minHeight: 0 }}>
            <div style={{ display: 'flex', flexDirection: 'column', width: splitView ? `${splitRatio}%` : '100%', flexShrink: 0, overflow: 'hidden' }}>
              {activeFile?.type === 'img'
                ? <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0d1117', flexDirection: 'column', gap: 12 }}>
                    {contents.get(activeFile.path)
                      ? <img src={contents.get(activeFile.path)} alt={activeFile.name} style={{ maxWidth: '80%', maxHeight: 300, borderRadius: 8, border: `1px solid ${D.border}` }} />
                      : <div style={{ fontSize: 13, color: D.txtSec }}>Načítám obrázek…</div>}
                    <div style={{ fontSize: 12, color: D.txtSec }}>{activeFile.name}</div>
                  </div>
                : <div ref={editorContainerRef} style={{ flex: 1, overflow: 'hidden' }} />
              }
            </div>
            {splitView && (
              <div onMouseDown={onSplitDividerDown}
                style={{ width: 5, flexShrink: 0, cursor: 'col-resize', background: 'rgba(255,255,255,.07)' }}
                onMouseEnter={e => (e.currentTarget.style.background = accent+'80')}
                onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,.07)')} />
            )}
            {splitView && (
              <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0, overflow: 'hidden' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px', background: '#161b22', borderBottom: '1px solid rgba(255,255,255,.08)', flexShrink: 0 }}>
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
            style={{ height: 6, cursor: 'ns-resize', background: 'rgba(255,255,255,.03)', borderTop: `1px solid ${D.border}`, borderBottom: `1px solid ${D.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
            onMouseEnter={e => (e.currentTarget.style.background = accent+'22')}
            onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,.03)')}>
            <div style={{ width: 28, height: 2, borderRadius: 2, background: 'rgba(255,255,255,.2)' }} />
          </div>

          {/* Preview */}
          <div style={{ height: `${previewHeight}px`, flexShrink: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', background: D.bgCard, borderBottom: `1px solid ${D.border}`, flexShrink: 0 }}>
              <div style={{ display: 'flex', gap: 5 }}>
                <div style={{ width: 9, height: 9, borderRadius: '50%', background: '#FF5F56' }} />
                <div style={{ width: 9, height: 9, borderRadius: '50%', background: '#FFBD2E' }} />
                <div style={{ width: 9, height: 9, borderRadius: '50%', background: '#27C93F' }} />
              </div>
              <div style={{ display: 'flex', gap: 3, marginLeft: 6 }}>
                {([{ label: '📱', title: 'Mobil (375px)', w: 375 }, { label: '📟', title: 'Tablet (768px)', w: 768 }, { label: '🖥', title: 'Desktop', w: null }] as { label: string; title: string; w: number | null }[]).map(({ label, title, w }) => (
                  <button key={title} onClick={() => setPreviewWidth(w)} title={title}
                    style={{ padding: '2px 6px', background: previewWidth === w ? accent+'25' : 'none', color: previewWidth === w ? accent : D.txtSec, border: `1px solid ${previewWidth === w ? accent+'40' : D.border}`, borderRadius: 5, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>
                    {label}
                  </button>
                ))}
              </div>
              <span style={{ fontSize: 11, color: D.txtSec, flex: 1, textAlign: 'center' as const }}>
                {activeProject ? `${activeProject.name}${previewWidth ? ` — ${previewWidth}px` : ''}` : 'Náhled'}
              </span>
              <button onClick={() => updatePreview()} style={{ padding: '2px 8px', background: D.bgMid, color: D.txtSec, border: `1px solid ${D.border}`, borderRadius: 5, fontSize: 10, cursor: 'pointer', fontFamily: 'inherit' }}>↺ Obnovit</button>
            </div>
            <div style={{ flex: 1, overflow: 'auto', background: previewWidth ? '#1a1a2a' : '#fff', display: 'flex', justifyContent: 'center' }}>
              <iframe ref={previewRef} sandbox="allow-scripts"
                style={{ border: 'none', background: '#fff', display: 'block', width: previewWidth ? `${previewWidth}px` : '100%', height: '100%', flexShrink: 0, boxShadow: previewWidth ? '0 0 0 1px rgba(255,255,255,.1), 0 8px 32px rgba(0,0,0,.5)' : 'none' }}
                title="HTML Preview" />
            </div>
          </div>
        </div>

        {/* ══ RIGHT: Tools ══ */}
        <div style={{ width: 270, flexShrink: 0, borderLeft: `1px solid ${D.border}`, background: D.bgCard, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Tab bar */}
          <div style={{ display: 'flex', borderBottom: `1px solid ${D.border}`, flexShrink: 0 }}>
            {([['validator','🔍','Validátor'],['design','🎨','Design'],['reference','📖','Reference']] as const).map(([tab, icon, label]) => (
              <button key={tab} onClick={() => setRightTab(tab)}
                style={{ flex: 1, padding: '8px 2px', background: rightTab === tab ? D.bgMid : 'transparent', border: 'none', borderBottom: `2px solid ${rightTab === tab ? accent : 'transparent'}`, cursor: 'pointer', fontFamily: 'inherit', fontSize: 10, fontWeight: 600, color: rightTab === tab ? D.txtPri : D.txtSec, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                <span style={{ fontSize: 14 }}>{icon}</span>{label}
              </button>
            ))}
          </div>

          <div style={{ flex: 1, overflowY: 'auto' }}>

            {/* ── Validátor & SEO ── */}
            {rightTab === 'validator' && (() => {
              // Always analyse from an HTML file — either currently open, or first HTML file in project
              const htmlFile = activeFile?.type === 'html'
                ? activeFile
                : activeProject?.files.find(f => f.type === 'html') ?? null
              const html = htmlFile ? (contents.get(htmlFile.path) ?? '') : ''
              const noHtml = !html

              const checks = [
                { label: '<title> tag',      ok: /<title>[^<]+<\/title>/i.test(html),                    tip: 'Každá stránka by měla mít <title>' },
                { label: 'meta description', ok: /<meta[^>]+name=["']description["'][^>]*>/i.test(html), tip: 'Přidej <meta name="description" content="...">' },
                { label: 'lang atribut',     ok: /<html[^>]+lang=/i.test(html),                           tip: 'Přidej lang="cs" do <html>' },
                { label: 'meta charset',     ok: /<meta[^>]+charset/i.test(html),                        tip: 'Přidej <meta charset="UTF-8">' },
                { label: 'viewport meta',    ok: /<meta[^>]+viewport/i.test(html),                       tip: 'Přidej <meta name="viewport" ...>' },
                { label: 'alt u obrázků',    ok: !/<img(?![^>]*alt=)[^>]*>/i.test(html),                 tip: 'Všechny <img> by měly mít alt atribut' },
                { label: 'h1 nadpis',        ok: /<h1[^>]*>/i.test(html),                                tip: 'Stránka by měla mít právě jeden <h1>' },
                { label: 'doctype',          ok: /<!DOCTYPE html>/i.test(html),                          tip: 'Přidej <!DOCTYPE html> na začátek' },
              ]

              const pairedTags = ['div','section','article','header','footer','nav','main','aside','ul','ol','table','form']
              const tagErrors: string[] = []
              if (!noHtml) {
                for (const tag of pairedTags) {
                  const opens  = (html.match(new RegExp(`<${tag}[\\s>]`, 'gi')) ?? []).length
                  const closes = (html.match(new RegExp(`<\\/${tag}>`, 'gi')) ?? []).length
                  if (opens !== closes) tagErrors.push(`<${tag}>: ${opens}× otevřen, ${closes}× zavřen`)
                }
              }

              // DOM structure — extract top-level semantic tags
              const domTags = ['html','head','body','header','nav','main','section','article','aside','footer','h1','h2','h3','div','ul','ol','table','form']
              const domItems: {tag:string; count:number}[] = domTags
                .map(tag => ({ tag, count: (html.match(new RegExp(`<${tag}[\\s>]`, 'gi')) ?? []).length }))
                .filter(x => x.count > 0)

              // Links from all HTML files
              const allHtml = activeProject?.files.filter(f => f.type === 'html').map(f => contents.get(f.path) ?? '').join('\n') ?? ''
              const linkMatches = [...allHtml.matchAll(/<a[^>]+href=["']([^"']+)["'][^>]*>([^<]*)<\/a>/gi)]
              const links = linkMatches.map(m => ({ href: m[1], text: m[2].trim() || m[1] })).slice(0, 30)

              const passed = checks.filter(c => c.ok).length
              const analyzingFile = htmlFile?.name ?? 'index.html'

              return (
                <div style={{ padding: '10px 12px' }}>
                  {/* Which file is being analyzed */}
                  {activeFile?.type !== 'html' && htmlFile && (
                    <div style={{ padding: '5px 10px', background: D.warning+'15', border: `1px solid ${D.warning}30`, borderRadius: 7, fontSize: 10, color: D.warning, marginBottom: 10 }}>
                      Analyzuji: <strong>{analyzingFile}</strong> (otevři HTML soubor pro konkrétní analýzu)
                    </div>
                  )}
                  {noHtml && (
                    <div style={{ color: D.txtSec, fontSize: 11, textAlign: 'center' as const, marginTop: 24 }}>
                      Projekt neobsahuje žádný HTML soubor
                    </div>
                  )}

                  {!noHtml && <>
                    {/* SEO score */}
                    <div style={{ marginBottom: 12 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: D.txtSec, textTransform: 'uppercase', letterSpacing: '.06em' }}>SEO & Přístupnost</span>
                        <span style={{ fontSize: 12, fontWeight: 700, color: passed >= 7 ? D.success : passed >= 4 ? D.warning : D.danger }}>{passed}/{checks.length}</span>
                      </div>
                      <div style={{ height: 5, background: D.bgMid, borderRadius: 3, overflow: 'hidden', marginBottom: 8 }}>
                        <div style={{ height: '100%', width: `${(passed/checks.length)*100}%`, background: passed >= 7 ? D.success : passed >= 4 ? D.warning : D.danger, borderRadius: 3, transition: 'width .3s' }} />
                      </div>
                      {checks.map(c => (
                        <div key={c.label} style={{ display: 'flex', alignItems: 'flex-start', gap: 7, marginBottom: 4 }} title={c.tip}>
                          <span style={{ fontSize: 11, flexShrink: 0, marginTop: 1 }}>{c.ok ? '✅' : '❌'}</span>
                          <div>
                            <div style={{ fontSize: 11, color: c.ok ? D.txtPri : D.txtSec, fontFamily: 'monospace' }}>{c.label}</div>
                            {!c.ok && <div style={{ fontSize: 10, color: D.txtSec, lineHeight: 1.4 }}>{c.tip}</div>}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Tag balance */}
                    {tagErrors.length > 0 && (
                      <div style={{ marginBottom: 12 }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: D.danger, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 5 }}>⚠ Nespárované tagy</div>
                        {tagErrors.map(e => (
                          <div key={e} style={{ fontSize: 11, color: D.warning, fontFamily: 'monospace', marginBottom: 3, padding: '3px 8px', background: D.warning+'10', borderRadius: 5 }}>{e}</div>
                        ))}
                      </div>
                    )}

                    {/* DOM structure */}
                    <div style={{ marginBottom: 12 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: D.txtSec, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6 }}>Struktura stránky</div>
                      {domItems.length === 0
                        ? <div style={{ fontSize: 11, color: D.txtSec }}>Žádné elementy</div>
                        : domItems.map(({ tag, count }) => (
                          <div key={tag} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                            <code style={{ fontSize: 11, color: '#f47067', fontFamily: 'monospace', minWidth: 70 }}>&lt;{tag}&gt;</code>
                            <div style={{ flex: 1, height: 4, background: D.bgMid, borderRadius: 2, overflow: 'hidden' }}>
                              <div style={{ height: '100%', width: `${Math.min(100, count * 14)}%`, background: accent+'70', borderRadius: 2 }} />
                            </div>
                            <span style={{ fontSize: 10, color: D.txtSec, minWidth: 16, textAlign: 'right' as const }}>{count}</span>
                          </div>
                        ))
                      }
                    </div>

                    {/* Links */}
                    {links.length > 0 && (
                      <div>
                        <div style={{ fontSize: 10, fontWeight: 700, color: D.txtSec, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6 }}>Přehled odkazů ({links.length})</div>
                        {links.map((l, i) => (
                          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '4px 8px', background: D.bgMid, borderRadius: 6, marginBottom: 3 }}>
                            <span style={{ fontSize: 10, flexShrink: 0 }}>{l.href.startsWith('http') ? '🌐' : l.href.startsWith('#') ? '⚓' : '📄'}</span>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 10, fontWeight: 600, color: D.txtPri, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{l.text}</div>
                              <div style={{ fontSize: 9, color: D.txtSec, fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{l.href}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </>}
                </div>
              )
            })()}

            {/* ── Design ── */}
            {rightTab === 'design' && (() => {
              // Contrast ratio calculation (WCAG)
              function hexToRgb(hex: string) {
                const h = hex.replace('#','')
                const n = parseInt(h.length === 3 ? h.split('').map(c=>c+c).join('') : h, 16)
                return [(n>>16)&255, (n>>8)&255, n&255]
              }
              function relativeLuminance(hex: string) {
                const rgb = hexToRgb(hex).map(c => {
                  const s = c / 255
                  return s <= 0.03928 ? s/12.92 : Math.pow((s+0.055)/1.055, 2.4)
                })
                return 0.2126*rgb[0] + 0.7152*rgb[1] + 0.0722*rgb[2]
              }
              function contrastRatio(c1: string, c2: string) {
                try {
                  const l1 = relativeLuminance(c1), l2 = relativeLuminance(c2)
                  const lighter = Math.max(l1,l2), darker = Math.min(l1,l2)
                  return (lighter + 0.05) / (darker + 0.05)
                } catch { return 1 }
              }
              function hexToHsl(hex: string) {
                const [r,g,b] = hexToRgb(hex).map(c => c/255)
                const max = Math.max(r,g,b), min = Math.min(r,g,b)
                const l = (max+min)/2
                if (max === min) return `hsl(0, 0%, ${Math.round(l*100)}%)`
                const d = max-min
                const s = l > 0.5 ? d/(2-max-min) : d/(max+min)
                let h = 0
                if (max===r) h = ((g-b)/d + (g<b?6:0))/6
                else if (max===g) h = ((b-r)/d + 2)/6
                else h = ((r-g)/d + 4)/6
                return `hsl(${Math.round(h*360)}, ${Math.round(s*100)}%, ${Math.round(l*100)}%)`
              }
              function hexToRgbStr(hex: string) {
                const [r,g,b] = hexToRgb(hex)
                return `rgb(${r}, ${g}, ${b})`
              }

              const ratio = contrastRatio(contrastText, contrastBg)
              const aaLarge = ratio >= 3, aa = ratio >= 4.5, aaa = ratio >= 7
              const shadowCss = `box-shadow: ${shadowX}px ${shadowY}px ${shadowBlur}px ${shadowSpread}px ${shadowColor}${Math.round(shadowAlpha*255).toString(16).padStart(2,'0')};`

              const cssContent = activeProject?.files.filter(f => f.type === 'css').map(f => contents.get(f.path) ?? '').join('\n') ?? ''
              const paletteColors = [...new Set((cssContent.match(/#[0-9a-fA-F]{3,6}\b/g) ?? []))].slice(0, 16)
              const fontFamilies = [...new Set((cssContent.match(/font-family:\s*([^;]+)/g) ?? []).map(m => m.replace('font-family:','').trim().split(',')[0].replace(/['"]/g,'').trim()))].filter(Boolean).slice(0, 6)

              return (
                <div style={{ padding: '10px 12px' }}>

                  {/* Color picker */}
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: D.txtSec, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>Color picker</div>
                    <input type="color" value={pickerColor} onChange={e => setPickerColor(e.target.value)}
                      style={{ width: '100%', height: 44, border: 'none', borderRadius: 10, cursor: 'pointer', display: 'block' }} />
                    <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {[
                        { label: 'HEX', value: pickerColor },
                        { label: 'RGB', value: hexToRgbStr(pickerColor) },
                        { label: 'HSL', value: hexToHsl(pickerColor) },
                      ].map(({ label, value }) => (
                        <div key={label} onClick={() => navigator.clipboard?.writeText(value)}
                          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '5px 9px', background: D.bgMid, borderRadius: 7, cursor: 'pointer', border: `1px solid ${D.border}` }}
                          title="Klikni pro zkopírování">
                          <span style={{ fontSize: 10, color: D.txtSec, fontWeight: 700 }}>{label}</span>
                          <span style={{ fontSize: 11, color: D.txtPri, fontFamily: 'monospace' }}>{value}</span>
                          <span style={{ fontSize: 10, color: D.txtSec }}>📋</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Contrast checker */}
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: D.txtSec, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>Kontrastní checker (WCAG)</div>
                    <div style={{ padding: '10px', borderRadius: 9, background: contrastBg, marginBottom: 8, textAlign: 'center' as const }}>
                      <span style={{ color: contrastText, fontSize: 13, fontWeight: 600 }}>Ukázkový text</span>
                    </div>
                    <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 10, color: D.txtSec, marginBottom: 3 }}>Text</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <input type="color" value={contrastText} onChange={e => setContrastText(e.target.value)} style={{ width: 32, height: 28, border: 'none', borderRadius: 5, cursor: 'pointer', flexShrink: 0 }} />
                          <code style={{ fontSize: 10, color: D.txtSec, fontFamily: 'monospace' }}>{contrastText}</code>
                        </div>
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 10, color: D.txtSec, marginBottom: 3 }}>Pozadí</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <input type="color" value={contrastBg} onChange={e => setContrastBg(e.target.value)} style={{ width: 32, height: 28, border: 'none', borderRadius: 5, cursor: 'pointer', flexShrink: 0 }} />
                          <code style={{ fontSize: 10, color: D.txtSec, fontFamily: 'monospace' }}>{contrastBg}</code>
                        </div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px', background: D.bgMid, borderRadius: 8, marginBottom: 6 }}>
                      <span style={{ fontSize: 11, color: D.txtSec }}>Kontrast</span>
                      <span style={{ fontSize: 14, fontWeight: 700, color: aa ? D.success : aaLarge ? D.warning : D.danger }}>{ratio.toFixed(2)}:1</span>
                    </div>
                    <div style={{ display: 'flex', gap: 5 }}>
                      {[{label:'AA velký', pass: aaLarge},{label:'AA', pass: aa},{label:'AAA', pass: aaa}].map(({label,pass}) => (
                        <div key={label} style={{ flex: 1, padding: '4px', background: pass ? D.success+'20' : D.danger+'15', borderRadius: 6, textAlign: 'center' as const, border: `1px solid ${pass ? D.success+'40' : D.danger+'30'}` }}>
                          <div style={{ fontSize: 9, color: pass ? D.success : D.danger, fontWeight: 700 }}>{pass ? '✓' : '✗'} {label}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Shadow generator */}
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: D.txtSec, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>Generátor stínů</div>
                    <div style={{ height: 70, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff', borderRadius: 10, marginBottom: 8 }}>
                      <div style={{ width: 48, height: 48, borderRadius: 8, background: '#7C3AED', boxShadow: `${shadowX}px ${shadowY}px ${shadowBlur}px ${shadowSpread}px ${shadowColor}${Math.round(shadowAlpha*255).toString(16).padStart(2,'0')}` }} />
                    </div>
                    {[
                      { label: 'X', val: shadowX, set: setShadowX, min: -50, max: 50 },
                      { label: 'Y', val: shadowY, set: setShadowY, min: -50, max: 50 },
                      { label: 'Blur', val: shadowBlur, set: setShadowBlur, min: 0, max: 100 },
                      { label: 'Spread', val: shadowSpread, set: setShadowSpread, min: -30, max: 50 },
                    ].map(({ label, val, set, min, max }) => (
                      <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                        <span style={{ fontSize: 10, color: D.txtSec, minWidth: 36 }}>{label}</span>
                        <input type="range" min={min} max={max} value={val} onChange={e => set(Number(e.target.value))} style={{ flex: 1, height: 3, accentColor: accent }} />
                        <span style={{ fontSize: 10, color: D.txtPri, minWidth: 28, textAlign: 'right' as const, fontFamily: 'monospace' }}>{val}px</span>
                      </div>
                    ))}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                      <span style={{ fontSize: 10, color: D.txtSec, minWidth: 36 }}>Barva</span>
                      <input type="color" value={shadowColor} onChange={e => setShadowColor(e.target.value)} style={{ width: 32, height: 24, border: 'none', borderRadius: 4, cursor: 'pointer' }} />
                      <input type="range" min={0} max={1} step={0.01} value={shadowAlpha} onChange={e => setShadowAlpha(Number(e.target.value))} style={{ flex: 1, height: 3, accentColor: accent }} />
                      <span style={{ fontSize: 10, color: D.txtPri, minWidth: 28, textAlign: 'right' as const, fontFamily: 'monospace' }}>{Math.round(shadowAlpha*100)}%</span>
                    </div>
                    <div onClick={() => navigator.clipboard?.writeText(shadowCss)}
                      style={{ padding: '6px 9px', background: '#0d1117', borderRadius: 7, border: `1px solid ${D.border}`, cursor: 'pointer' }} title="Klikni pro zkopírování">
                      <code style={{ fontSize: 10, color: '#a8d8a8', fontFamily: 'monospace', wordBreak: 'break-all' as const }}>{shadowCss}</code>
                    </div>
                  </div>

                  {/* Palette from CSS */}
                  {paletteColors.length > 0 && (
                    <div style={{ marginBottom: 14 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: D.txtSec, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>Barvy z projektu</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 6 }}>
                        {paletteColors.map(color => (
                          <div key={color} onClick={() => { setPickerColor(color); navigator.clipboard?.writeText(color) }}
                            title={color} style={{ cursor: 'pointer', textAlign: 'center' as const }}>
                            <div style={{ width: 30, height: 30, borderRadius: 6, background: color, border: `1px solid rgba(255,255,255,.15)`, marginBottom: 2 }} />
                            <div style={{ fontSize: 8, color: D.txtSec, fontFamily: 'monospace' }}>{color.slice(0,7)}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Typography */}
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: D.txtSec, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>Typografie v projektu</div>
                    {fontFamilies.length === 0
                      ? <div style={{ fontSize: 11, color: D.txtSec }}>Žádné font-family v CSS</div>
                      : fontFamilies.map(f => (
                          <div key={f} style={{ padding: '8px 10px', background: D.bgMid, borderRadius: 8, marginBottom: 5, border: `1px solid ${D.border}` }}>
                            <div style={{ fontSize: 11, fontWeight: 600, color: D.txtPri, fontFamily: f, marginBottom: 2 }}>Aa Bb Cc 123</div>
                            <div style={{ fontSize: 10, color: D.txtSec, fontFamily: 'monospace' }}>{f}</div>
                          </div>
                        ))
                    }
                  </div>
                </div>
              )
            })()}

            {/* ── Reference ── */}
            {rightTab === 'reference' && (
              <div style={{ padding: '8px 12px' }}>
                <input value={refSearch} onChange={e => setRefSearch(e.target.value)} placeholder="Hledat…"
                  style={{ width: '100%', padding: '7px 10px', background: D.bgMid, border: `1px solid ${D.border}`, borderRadius: 8, fontSize: 12, color: D.txtPri, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' as const, marginBottom: 10 }} />

                {[
                  { tag: 'div', desc: 'Blokový kontejner', ex: '<div class="box">...</div>' },
                  { tag: 'span', desc: 'Řádkový kontejner', ex: '<span style="color:red">text</span>' },
                  { tag: 'h1–h6', desc: 'Nadpisy', ex: '<h1>Hlavní nadpis</h1>' },
                  { tag: 'p', desc: 'Odstavec textu', ex: '<p>Text odstavce.</p>' },
                  { tag: 'a', desc: 'Odkaz', ex: '<a href="https://example.com">Klikni</a>' },
                  { tag: 'img', desc: 'Obrázek', ex: '<img src="foto.jpg" alt="Popis">' },
                  { tag: 'ul / ol / li', desc: 'Seznamy', ex: '<ul>\n  <li>Položka</li>\n</ul>' },
                  { tag: 'table', desc: 'Tabulka', ex: '<table>\n  <tr><th>Název</th></tr>\n  <tr><td>Hodnota</td></tr>\n</table>' },
                  { tag: 'form', desc: 'Formulář', ex: '<form action="/odeslat" method="POST">\n  <input type="text" name="jmeno">\n  <button>Odeslat</button>\n</form>' },
                  { tag: 'input', desc: 'Vstupní pole', ex: '<input type="text" placeholder="Zadej text">' },
                  { tag: 'button', desc: 'Tlačítko', ex: '<button onclick="klik()">Klikni</button>' },
                  { tag: 'header / footer', desc: 'Záhlaví / zápatí', ex: '<header>\n  <nav>...</nav>\n</header>' },
                  { tag: 'nav', desc: 'Navigace', ex: '<nav>\n  <a href="/">Domů</a>\n</nav>' },
                  { tag: 'section / article', desc: 'Sekce / článek', ex: '<section>\n  <h2>Sekce</h2>\n</section>' },
                  { tag: 'main', desc: 'Hlavní obsah stránky', ex: '<main>\n  <h1>Obsah</h1>\n</main>' },
                ].filter(t => !refSearch || t.tag.toLowerCase().includes(refSearch.toLowerCase()) || t.desc.toLowerCase().includes(refSearch.toLowerCase()))
                  .length > 0 && <>
                  <div style={{ fontSize: 10, fontWeight: 700, color: D.txtSec, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6 }}>HTML tagy</div>
                  {[
                    { tag: 'div', desc: 'Blokový kontejner', ex: '<div class="box">...</div>' },
                    { tag: 'span', desc: 'Řádkový kontejner', ex: '<span style="color:red">text</span>' },
                    { tag: 'h1–h6', desc: 'Nadpisy', ex: '<h1>Hlavní nadpis</h1>' },
                    { tag: 'p', desc: 'Odstavec textu', ex: '<p>Text odstavce.</p>' },
                    { tag: 'a', desc: 'Odkaz', ex: '<a href="https://example.com">Klikni</a>' },
                    { tag: 'img', desc: 'Obrázek', ex: '<img src="foto.jpg" alt="Popis">' },
                    { tag: 'ul / ol / li', desc: 'Seznamy', ex: '<ul>\n  <li>Položka</li>\n</ul>' },
                    { tag: 'table', desc: 'Tabulka', ex: '<table>\n  <tr><th>Název</th></tr>\n  <tr><td>Hodnota</td></tr>\n</table>' },
                    { tag: 'form', desc: 'Formulář', ex: '<form action="/odeslat" method="POST">\n  <input type="text" name="jmeno">\n  <button>Odeslat</button>\n</form>' },
                    { tag: 'input', desc: 'Vstupní pole', ex: '<input type="text" placeholder="Zadej text">' },
                    { tag: 'button', desc: 'Tlačítko', ex: '<button onclick="klik()">Klikni</button>' },
                    { tag: 'header / footer', desc: 'Záhlaví / zápatí', ex: '<header>\n  <nav>...</nav>\n</header>' },
                    { tag: 'nav', desc: 'Navigace', ex: '<nav>\n  <a href="/">Domů</a>\n</nav>' },
                    { tag: 'section / article', desc: 'Sekce / článek', ex: '<section>\n  <h2>Sekce</h2>\n</section>' },
                    { tag: 'main', desc: 'Hlavní obsah stránky', ex: '<main>\n  <h1>Obsah</h1>\n</main>' },
                  ].filter(t => !refSearch || t.tag.toLowerCase().includes(refSearch.toLowerCase()) || t.desc.toLowerCase().includes(refSearch.toLowerCase()))
                    .map(t => (
                    <div key={t.tag} style={{ marginBottom: 8, background: D.bgMid, borderRadius: 8, padding: '8px 10px', border: `1px solid ${D.border}` }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                        <code style={{ fontSize: 11, fontWeight: 700, color: '#f47067', fontFamily: 'monospace' }}>{t.tag}</code>
                        <span style={{ fontSize: 10, color: D.txtSec }}>{t.desc}</span>
                      </div>
                      <pre onClick={() => { const ed = editorRef.current; if (!ed) return; const pos = ed.getPosition(); ed.executeEdits('ref', [{ range: { startLineNumber: pos.lineNumber, startColumn: pos.column, endLineNumber: pos.lineNumber, endColumn: pos.column }, text: t.ex }]); ed.focus() }}
                        style={{ margin: 0, padding: '4px 7px', background: '#0d1117', borderRadius: 5, fontSize: 10, color: '#a8d8a8', fontFamily: 'monospace', whiteSpace: 'pre-wrap', cursor: 'pointer', border: `1px solid ${D.border}` }}>
                        {t.ex}
                      </pre>
                    </div>
                  ))}
                </>}

                {[
                  { prop: 'color', desc: 'Barva textu', ex: 'color: #333;\ncolor: red;' },
                  { prop: 'background', desc: 'Pozadí elementu', ex: 'background: #f0f0f0;\nbackground: linear-gradient(135deg, #667eea, #764ba2)' },
                  { prop: 'font-size', desc: 'Velikost písma', ex: 'font-size: 16px;\nfont-size: 1.2rem;' },
                  { prop: 'font-weight', desc: 'Tloušťka písma', ex: 'font-weight: bold;\nfont-weight: 700;' },
                  { prop: 'margin / padding', desc: 'Vnější / vnitřní odsazení', ex: 'margin: 16px;\npadding: 8px 16px;' },
                  { prop: 'display', desc: 'Způsob zobrazení', ex: 'display: flex;\ndisplay: grid;\ndisplay: none;' },
                  { prop: 'flex', desc: 'Flexbox', ex: 'display: flex;\njustify-content: space-between;\nalign-items: center;' },
                  { prop: 'grid', desc: 'CSS Grid', ex: 'display: grid;\ngrid-template-columns: 1fr 2fr;\ngap: 20px;' },
                  { prop: 'width / height', desc: 'Rozměry', ex: 'width: 100%;\nheight: 200px;\nmin-height: 50px;' },
                  { prop: 'border', desc: 'Ohraničení', ex: 'border: 1px solid #ccc;\nborder-radius: 8px;' },
                  { prop: 'position', desc: 'Pozicování', ex: 'position: relative;\nposition: absolute;\ntop: 0; left: 0;' },
                  { prop: 'overflow', desc: 'Přetečení obsahu', ex: 'overflow: hidden;\noverflow-y: auto;' },
                  { prop: 'opacity', desc: 'Průhlednost (0–1)', ex: 'opacity: 0.5;' },
                  { prop: 'cursor', desc: 'Kurzor myši', ex: 'cursor: pointer;\ncursor: not-allowed;' },
                  { prop: 'transition', desc: 'Animace změn', ex: 'transition: all 0.3s ease;' },
                  { prop: 'box-shadow', desc: 'Stín elementu', ex: 'box-shadow: 0 2px 8px rgba(0,0,0,.2);' },
                  { prop: 'z-index', desc: 'Vrstvení elementů', ex: 'position: relative;\nz-index: 10;' },
                ].filter(t => !refSearch || t.prop.toLowerCase().includes(refSearch.toLowerCase()) || t.desc.toLowerCase().includes(refSearch.toLowerCase()))
                  .length > 0 && <>
                  <div style={{ fontSize: 10, fontWeight: 700, color: D.txtSec, textTransform: 'uppercase', letterSpacing: '.06em', margin: '10px 0 6px' }}>CSS vlastnosti</div>
                  {[
                    { prop: 'color', desc: 'Barva textu', ex: 'color: #333;\ncolor: red;' },
                    { prop: 'background', desc: 'Pozadí elementu', ex: 'background: #f0f0f0;\nbackground: linear-gradient(135deg, #667eea, #764ba2)' },
                    { prop: 'font-size', desc: 'Velikost písma', ex: 'font-size: 16px;\nfont-size: 1.2rem;' },
                    { prop: 'font-weight', desc: 'Tloušťka písma', ex: 'font-weight: bold;\nfont-weight: 700;' },
                    { prop: 'margin / padding', desc: 'Vnější / vnitřní odsazení', ex: 'margin: 16px;\npadding: 8px 16px;' },
                    { prop: 'display', desc: 'Způsob zobrazení', ex: 'display: flex;\ndisplay: grid;\ndisplay: none;' },
                    { prop: 'flex', desc: 'Flexbox', ex: 'display: flex;\njustify-content: space-between;\nalign-items: center;' },
                    { prop: 'grid', desc: 'CSS Grid', ex: 'display: grid;\ngrid-template-columns: 1fr 2fr;\ngap: 20px;' },
                    { prop: 'width / height', desc: 'Rozměry', ex: 'width: 100%;\nheight: 200px;\nmin-height: 50px;' },
                    { prop: 'border', desc: 'Ohraničení', ex: 'border: 1px solid #ccc;\nborder-radius: 8px;' },
                    { prop: 'position', desc: 'Pozicování', ex: 'position: relative;\nposition: absolute;\ntop: 0; left: 0;' },
                    { prop: 'overflow', desc: 'Přetečení obsahu', ex: 'overflow: hidden;\noverflow-y: auto;' },
                    { prop: 'opacity', desc: 'Průhlednost (0–1)', ex: 'opacity: 0.5;' },
                    { prop: 'cursor', desc: 'Kurzor myši', ex: 'cursor: pointer;\ncursor: not-allowed;' },
                    { prop: 'transition', desc: 'Animace změn', ex: 'transition: all 0.3s ease;' },
                    { prop: 'box-shadow', desc: 'Stín elementu', ex: 'box-shadow: 0 2px 8px rgba(0,0,0,.2);' },
                    { prop: 'z-index', desc: 'Vrstvení elementů', ex: 'position: relative;\nz-index: 10;' },
                  ].filter(t => !refSearch || t.prop.toLowerCase().includes(refSearch.toLowerCase()) || t.desc.toLowerCase().includes(refSearch.toLowerCase()))
                    .map(t => (
                    <div key={t.prop} style={{ marginBottom: 8, background: D.bgMid, borderRadius: 8, padding: '8px 10px', border: `1px solid ${D.border}` }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                        <code style={{ fontSize: 11, fontWeight: 700, color: '#c792ea', fontFamily: 'monospace' }}>{t.prop}</code>
                        <span style={{ fontSize: 10, color: D.txtSec }}>{t.desc}</span>
                      </div>
                      <pre onClick={() => { const ed = editorRef.current; if (!ed) return; const pos = ed.getPosition(); ed.executeEdits('ref', [{ range: { startLineNumber: pos.lineNumber, startColumn: pos.column, endLineNumber: pos.lineNumber, endColumn: pos.column }, text: t.ex }]); ed.focus() }}
                        style={{ margin: 0, padding: '4px 7px', background: '#0d1117', borderRadius: 5, fontSize: 10, color: '#a8d8a8', fontFamily: 'monospace', whiteSpace: 'pre-wrap', cursor: 'pointer', border: `1px solid ${D.border}` }}>
                        {t.ex}
                      </pre>
                    </div>
                  ))}
                </>}
              </div>
            )}

          </div>
        </div>

      </div>
    </DarkLayout>
  )
}
