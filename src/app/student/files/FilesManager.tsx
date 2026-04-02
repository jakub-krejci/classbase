'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { DarkLayout, D, card, SectionLabel } from '@/components/DarkLayout'

// ── Types ─────────────────────────────────────────────────────────────────────
type EditorType = 'python' | 'html' | 'jupyter' | 'sql'

interface AnyFile {
  path: string
  name: string
  folder: string       // '' = root of project
  project: string      // project key
  editor: EditorType
  size?: number
  updatedAt: string
  isFolder?: boolean   // virtual folder node for display
}

interface Project {
  key: string
  name: string
  editor: EditorType
  files: AnyFile[]
  totalSize: number
}

interface EditorSection {
  id: EditorType
  label: string
  icon: string
  color: string
  bucket: string
  href: string         // editor route with ?project= query
  editorHref: (projKey: string, filePath?: string) => string
}

// ── Editor section definitions ─────────────────────────────────────────────────
const SECTIONS: EditorSection[] = [
  {
    id: 'python', label: 'Python programování', icon: '/icons/python.png', color: '#3B82F6',
    bucket: 'python-files', href: '/student/python',
    editorHref: (proj) => `/student/python`,
  },
  {
    id: 'html', label: 'Tvorba webů', icon: '/icons/html.png', color: '#E34C26',
    bucket: 'web-files', href: '/student/html',
    editorHref: (proj) => `/student/html`,
  },
  {
    id: 'jupyter', label: 'Jupyter Notebook', icon: '/icons/jupyter.png', color: '#F37726',
    bucket: 'jupyter-files', href: '/student/jupyter',
    editorHref: (proj) => `/student/jupyter`,
  },
  {
    id: 'sql', label: 'Databáze (SQL)', icon: '/icons/database.png', color: '#336791',
    bucket: 'sql-files', href: '/student/sql',
    editorHref: (proj) => `/student/sql`,
  },
]

function fmtSize(b?: number): string {
  if (!b) return ''
  if (b < 1024) return `${b} B`
  if (b < 1048576) return `${(b / 1024).toFixed(1)} kB`
  return `${(b / 1048576).toFixed(2)} MB`
}
function fmtDate(iso: string): string {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'short', year: 'numeric' })
  } catch { return '' }
}
function fileIcon(name: string, editor: EditorType): string {
  const ext = name.split('.').pop()?.toLowerCase()
  if (ext === 'py') return '/icons/python.png'
  if (ext === 'html' || ext === 'htm') return '/icons/html.png'
  if (ext === 'css') return '/icons/css.png'
  if (ext === 'js') return '/icons/js.png'
  if (ext === 'ipynb') return '/icons/jupyter.png'
  if (ext === 'db') return '/icons/database.png'
  if (ext === 'sql') return '/icons/database.png'
  if (['png','jpg','jpeg','gif','webp','svg','ico','bmp'].includes(ext ?? '')) return '/icons/img.png'
  return '/icons/python.png'
}

// ── Main component ────────────────────────────────────────────────────────────
export default function FilesManager({ profile }: { profile: any }) {
  const supabase = createClient()
  const accent   = profile?.accent_color ?? '#7C3AED'
  const uid      = profile?.id as string

  const [projects, setProjects]           = useState<Project[]>([])
  const [loading, setLoading]             = useState(true)
  const [search, setSearch]               = useState('')
  const [expandedProj, setExpandedProj]   = useState<Set<string>>(new Set())
  const [recentPaths, setRecentPaths]     = useState<Record<string, string>>({})
  const [totalSize, setTotalSize]         = useState(0)
  const [sectionSizes, setSectionSizes]   = useState<Record<EditorType, number>>({ python: 0, html: 0, jupyter: 0, sql: 0 })

  // Rename modal
  const [renameModal, setRenameModal]     = useState<AnyFile | null>(null)
  const [renameVal, setRenameVal]         = useState('')
  // Delete modal
  const [deleteModal, setDeleteModal]     = useState<AnyFile | null>(null)
  // Move modal
  const [moveModal, setMoveModal]         = useState<AnyFile | null>(null)
  const [moveDest, setMoveDest]           = useState('')

  const [opMsg, setOpMsg]                 = useState('')
  const [opErr, setOpErr]                 = useState('')

  function flash(msg: string, err = false) {
    if (err) { setOpErr(msg); setTimeout(() => setOpErr(''), 3000) }
    else     { setOpMsg(msg); setTimeout(() => setOpMsg(''), 3000) }
  }

  // ── Load recent from localStorage ──────────────────────────────────────────
  useEffect(() => {
    const keys: Record<EditorType, string> = { python: 'cb_py_last', html: 'cb_html_last', jupyter: 'cb_jup_last', sql: 'cb_sql_last' }
    const rec: Record<string, string> = {}
    for (const [editor, key] of Object.entries(keys)) {
      const val = localStorage.getItem(key)
      if (val) rec[editor] = val
    }
    setRecentPaths(rec)
  }, [])

  // ── Load all files from all buckets ────────────────────────────────────────
  const loadAll = useCallback(async () => {
    setLoading(true)
    const allProjects: Project[] = []
    const sizes: Record<EditorType, number> = { python: 0, html: 0, jupyter: 0, sql: 0 }

    for (const section of SECTIONS) {
      const { data: topLevel } = await supabase.storage.from(section.bucket).list(`zaci/${uid}`, { limit: 200 })
      if (!topLevel) continue

      for (const item of topLevel) {
        // Skip files at top level (only folders = projects)
        if (item.metadata !== null && item.metadata !== undefined) continue
        if (item.name.includes('.')) continue

        const projKey = item.name
        const files: AnyFile[] = []

        // List project root
        const { data: rootItems } = await supabase.storage.from(section.bucket).list(`zaci/${uid}/${projKey}`, { limit: 200 })
        for (const f of rootItems ?? []) {
          if (f.name === '.gitkeep') continue
          if (f.metadata === null || f.metadata === undefined) {
            // Subfolder — list its contents too
            const { data: subItems } = await supabase.storage.from(section.bucket).list(`zaci/${uid}/${projKey}/${f.name}`, { limit: 200 })
            for (const sf of subItems ?? []) {
              if (sf.name === '.gitkeep') continue
              if (sf.metadata === null || sf.metadata === undefined) continue
              const sz = sf.metadata?.size ?? 0
              sizes[section.id] += sz
              files.push({
                path: `zaci/${uid}/${projKey}/${f.name}/${sf.name}`,
                name: sf.name, folder: f.name, project: projKey,
                editor: section.id, size: sz, updatedAt: sf.updated_at ?? '',
              })
            }
          } else {
            const sz = f.metadata?.size ?? 0
            sizes[section.id] += sz
            files.push({
              path: `zaci/${uid}/${projKey}/${f.name}`,
              name: f.name, folder: '', project: projKey,
              editor: section.id, size: sz, updatedAt: f.updated_at ?? '',
            })
          }
        }

        const projSize = files.reduce((a, f) => a + (f.size ?? 0), 0)
        allProjects.push({ key: projKey, name: projKey, editor: section.id, files, totalSize: projSize })
      }
    }

    setProjects(allProjects)
    setSectionSizes(sizes)
    setTotalSize(Object.values(sizes).reduce((a, b) => a + b, 0))
    setLoading(false)
  }, [uid])

  useEffect(() => { loadAll() }, [loadAll])

  // ── Rename file ─────────────────────────────────────────────────────────────
  async function doRename(file: AnyFile) {
    const newName = renameVal.trim()
    if (!newName || newName === file.name) { setRenameModal(null); return }
    const ext = file.name.split('.').pop()
    const finalName = newName.includes('.') ? newName : (ext ? `${newName}.${ext}` : newName)
    const newPath = file.folder
      ? `zaci/${uid}/${file.project}/${file.folder}/${finalName}`
      : `zaci/${uid}/${file.project}/${finalName}`
    const section = SECTIONS.find(s => s.id === file.editor)!
    // Download + re-upload
    const { data: blob } = await supabase.storage.from(section.bucket).download(file.path)
    if (!blob) { flash('❌ Stažení souboru selhalo', true); return }
    await supabase.storage.from(section.bucket).remove([newPath])
    const { error } = await supabase.storage.from(section.bucket).upload(newPath, blob, { contentType: 'application/octet-stream', cacheControl: '0' })
    if (error) { flash('❌ ' + error.message, true); return }
    await supabase.storage.from(section.bucket).remove([file.path])
    flash(`✓ Přejmenováno na ${finalName}`)
    setRenameModal(null)
    await loadAll()
  }

  // ── Delete file ─────────────────────────────────────────────────────────────
  async function doDelete(file: AnyFile) {
    const section = SECTIONS.find(s => s.id === file.editor)!
    await supabase.storage.from(section.bucket).remove([file.path])
    flash(`✓ Smazáno: ${file.name}`)
    setDeleteModal(null)
    await loadAll()
  }

  // ── Move file to different folder ───────────────────────────────────────────
  async function doMove(file: AnyFile) {
    const destFolder = moveDest.trim()
    if (destFolder === file.folder) { setMoveModal(null); return }
    const section = SECTIONS.find(s => s.id === file.editor)!
    const newPath = destFolder
      ? `zaci/${uid}/${file.project}/${destFolder}/${file.name}`
      : `zaci/${uid}/${file.project}/${file.name}`
    const { data: blob } = await supabase.storage.from(section.bucket).download(file.path)
    if (!blob) { flash('❌ Stažení selhalo', true); return }
    await supabase.storage.from(section.bucket).remove([newPath])
    const { error } = await supabase.storage.from(section.bucket).upload(newPath, blob, { contentType: 'application/octet-stream', cacheControl: '0' })
    if (error) { flash('❌ ' + error.message, true); return }
    await supabase.storage.from(section.bucket).remove([file.path])
    flash(`✓ Přesunuto do ${destFolder || 'kořene projektu'}`)
    setMoveModal(null)
    await loadAll()
  }

  // ── Filtered files for search ───────────────────────────────────────────────
  const q = search.trim().toLowerCase()
  const filteredProjects = q
    ? projects.map(p => ({ ...p, files: p.files.filter(f => f.name.toLowerCase().includes(q) || f.project.toLowerCase().includes(q)) })).filter(p => p.files.length > 0)
    : projects

  // Group by section
  const bySection = SECTIONS.map(sec => ({
    section: sec,
    projects: filteredProjects.filter(p => p.editor === sec.id),
    totalSize: sectionSizes[sec.id],
    fileCount: filteredProjects.filter(p => p.editor === sec.id).reduce((a, p) => a + p.files.length, 0),
    projCount: filteredProjects.filter(p => p.editor === sec.id).length,
  }))

  // Recently opened projects across all editors
  const recentItems = SECTIONS.flatMap(sec => {
    const lastPath = recentPaths[sec.id]
    if (!lastPath) return []
    const proj = projects.find(p => p.editor === sec.id && lastPath.includes(p.key))
    if (!proj) return []
    return [{ section: sec, proj }]
  })

  const modalInp: React.CSSProperties = { width: '100%', padding: '10px 13px', background: D.bgMid, border: `1px solid ${D.border}`, borderRadius: 10, fontSize: 14, color: D.txtPri, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' as const }

  function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
    return (
      <>
        <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.72)', zIndex: 9998, backdropFilter: 'blur(5px)' }} />
        <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', zIndex: 9999, width: '100%', maxWidth: 420, padding: '0 16px' }}>
          <div style={{ background: D.bgCard, borderRadius: 20, padding: '28px 24px', border: `1px solid ${D.border}`, boxShadow: '0 28px 70px rgba(0,0,0,.75)' }}>
            <div style={{ fontSize: 17, fontWeight: 800, color: D.txtPri, marginBottom: 16 }}>{title}</div>
            {children}
          </div>
        </div>
      </>
    )
  }

  return (
    <DarkLayout profile={profile} activeRoute="/student/files">

      {/* Modals */}
      {renameModal && (
        <Modal title="✏️ Přejmenovat soubor" onClose={() => setRenameModal(null)}>
          <p style={{ fontSize: 13, color: D.txtSec, marginBottom: 10 }}>Nový název pro <strong style={{ color: D.txtPri }}>{renameModal.name}</strong></p>
          <input value={renameVal} onChange={e => setRenameVal(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && doRename(renameModal)}
            autoFocus placeholder={renameModal.name} style={{ ...modalInp, marginBottom: 14 }} />
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => doRename(renameModal)} style={{ flex: 1, padding: '10px', background: accent, color: '#fff', border: 'none', borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Přejmenovat</button>
            <button onClick={() => setRenameModal(null)} style={{ padding: '10px 14px', background: D.bgMid, color: D.txtSec, border: `1px solid ${D.border}`, borderRadius: 9, cursor: 'pointer', fontFamily: 'inherit' }}>Zrušit</button>
          </div>
        </Modal>
      )}
      {deleteModal && (
        <Modal title="🗑️ Smazat soubor" onClose={() => setDeleteModal(null)}>
          <p style={{ fontSize: 13, color: D.txtSec, marginBottom: 6 }}>Opravdu smazat <strong style={{ color: D.txtPri }}>{deleteModal.name}</strong>?</p>
          <p style={{ fontSize: 12, color: D.danger, marginBottom: 18 }}>Tato akce je nevratná.</p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => doDelete(deleteModal)} style={{ flex: 1, padding: '10px', background: D.danger, color: '#fff', border: 'none', borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Smazat</button>
            <button onClick={() => setDeleteModal(null)} style={{ padding: '10px 14px', background: D.bgMid, color: D.txtSec, border: `1px solid ${D.border}`, borderRadius: 9, cursor: 'pointer', fontFamily: 'inherit' }}>Zrušit</button>
          </div>
        </Modal>
      )}
      {moveModal && (
        <Modal title="📁 Přesunout soubor" onClose={() => setMoveModal(null)}>
          <p style={{ fontSize: 13, color: D.txtSec, marginBottom: 10 }}>
            Přesunout <strong style={{ color: D.txtPri }}>{moveModal.name}</strong> do složky:
          </p>
          <p style={{ fontSize: 11, color: D.txtSec, marginBottom: 6 }}>
            Nyní v: <code style={{ background: D.bgMid, padding: '1px 6px', borderRadius: 4 }}>{moveModal.folder || '(kořen projektu)'}</code>
          </p>
          {/* Destination folder options from the same project */}
          {(() => {
            const proj = projects.find(p => p.key === moveModal.project && p.editor === moveModal.editor)
            const folders = [...new Set(proj?.files.map(f => f.folder).filter(Boolean) ?? [])]
            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 14 }}>
                {[{ key: '', label: '(kořen projektu)' }, ...folders.map(f => ({ key: f, label: f }))].map(opt => (
                  <div key={opt.key} onClick={() => setMoveDest(opt.key)}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 8, cursor: 'pointer', border: `1px solid ${moveDest === opt.key ? accent+'60' : D.border}`, background: moveDest === opt.key ? accent+'12' : 'transparent', transition: 'all .15s' }}>
                    <span>{opt.key ? '📂' : '📁'}</span>
                    <span style={{ fontSize: 13, color: moveDest === opt.key ? accent : D.txtPri }}>{opt.label}</span>
                    {moveDest === opt.key && <span style={{ marginLeft: 'auto', color: accent, fontSize: 12 }}>✓</span>}
                  </div>
                ))}
              </div>
            )
          })()}
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => doMove(moveModal)} style={{ flex: 1, padding: '10px', background: accent, color: '#fff', border: 'none', borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Přesunout</button>
            <button onClick={() => setMoveModal(null)} style={{ padding: '10px 14px', background: D.bgMid, color: D.txtSec, border: `1px solid ${D.border}`, borderRadius: 9, cursor: 'pointer', fontFamily: 'inherit' }}>Zrušit</button>
          </div>
        </Modal>
      )}

      <style>{`
        .fm-row { transition: background .12s; }
        .fm-row:hover { background: rgba(255,255,255,.04) !important; }
        .fm-row:hover .fm-acts { opacity: 1 !important; }
        .fm-proj:hover { background: rgba(255,255,255,.03) !important; }
        @keyframes spin { to { transform: rotate(360deg) } }
      `}</style>

      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20, flexWrap: 'wrap' }}>
        <div style={{ width: 40, height: 40, borderRadius: 11, background: accent+'18', border: `1px solid ${accent}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>📁</div>
        <div>
          <h1 style={{ fontSize: 19, fontWeight: 800, color: D.txtPri, margin: '0 0 2px' }}>Moje soubory</h1>
          <p style={{ fontSize: 11, color: D.txtSec, margin: 0 }}>Všechny projekty a soubory na jednom místě</p>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {opMsg && <span style={{ fontSize: 12, color: D.success, fontWeight: 600 }}>{opMsg}</span>}
          {opErr && <span style={{ fontSize: 12, color: D.danger, fontWeight: 600 }}>{opErr}</span>}
          {!loading && <span style={{ fontSize: 11, color: D.txtSec, padding: '4px 12px', background: D.bgMid, borderRadius: 20, border: `1px solid ${D.border}` }}>💾 {fmtSize(totalSize)} celkem</span>}
          <button onClick={loadAll} style={{ padding: '6px 14px', background: 'rgba(255,255,255,.04)', color: D.txtSec, border: `1px solid ${D.border}`, borderRadius: 8, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>↺ Obnovit</button>
        </div>
      </div>

      {/* ── Search ── */}
      <div style={{ position: 'relative', marginBottom: 20 }}>
        <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', fontSize: 14, color: D.txtSec, pointerEvents: 'none' }}>🔍</span>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Hledat soubory a projekty…"
          style={{ width: '100%', padding: '11px 14px 11px 40px', background: D.bgCard, border: `1px solid ${search ? accent+'60' : D.border}`, borderRadius: 12, fontSize: 14, color: D.txtPri, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' as const, transition: 'border-color .2s' }} />
        {search && <button onClick={() => setSearch('')} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: D.txtSec, fontSize: 16 }}>✕</button>}
      </div>

      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14, padding: '60px 0', color: D.txtSec }}>
          <div style={{ width: 22, height: 22, border: `3px solid ${D.border}`, borderTopColor: accent, borderRadius: '50%', animation: 'spin .7s linear infinite' }} />
          <span style={{ fontSize: 14 }}>Načítám soubory ze všech editorů…</span>
        </div>
      ) : (
        <>
          {/* ── Recently opened ── */}
          {recentItems.length > 0 && !search && (
            <div style={{ ...card({ padding: '16px 18px', marginBottom: 16 }) }}>
              <SectionLabel>Naposledy otevřeno</SectionLabel>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {recentItems.map(({ section, proj }) => (
                  <a key={section.id} href={section.href}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: D.bgMid, border: `1px solid ${D.border}`, borderRadius: 12, textDecoration: 'none', transition: 'all .15s', minWidth: 160 }}
                    onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.borderColor = section.color + '60'; (e.currentTarget as HTMLAnchorElement).style.background = section.color + '10' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.borderColor = D.border; (e.currentTarget as HTMLAnchorElement).style.background = D.bgMid }}>
                    <img src={section.icon} alt={section.label} style={{ width: 22, height: 22, objectFit: 'contain' }} onError={e => { (e.target as HTMLImageElement).style.display='none' }} />
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: D.txtPri }}>{proj.name}</div>
                      <div style={{ fontSize: 10, color: D.txtSec }}>{section.label}</div>
                    </div>
                    <span style={{ marginLeft: 'auto', fontSize: 11, color: section.color }}>→</span>
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* ── Storage overview bar ── */}
          {!search && (
            <div style={{ ...card({ padding: '14px 18px', marginBottom: 20 }) }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: D.txtSec, textTransform: 'uppercase', letterSpacing: '.06em' }}>Využití úložiště</span>
                <span style={{ fontSize: 11, color: D.txtSec }}>{fmtSize(totalSize)}</span>
              </div>
              <div style={{ display: 'flex', height: 8, borderRadius: 99, overflow: 'hidden', background: 'rgba(255,255,255,.07)', gap: 2 }}>
                {SECTIONS.map(sec => {
                  const pct = totalSize > 0 ? (sectionSizes[sec.id] / totalSize) * 100 : 0
                  return pct > 1 ? <div key={sec.id} style={{ width: `${pct}%`, background: sec.color, borderRadius: 99, transition: 'width .6s ease' }} title={`${sec.label}: ${fmtSize(sectionSizes[sec.id])}`} /> : null
                })}
              </div>
              <div style={{ display: 'flex', gap: 16, marginTop: 8, flexWrap: 'wrap' }}>
                {SECTIONS.map(sec => (
                  <div key={sec.id} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: sec.color, flexShrink: 0 }} />
                    <span style={{ fontSize: 10, color: D.txtSec }}>{sec.label.split(' ')[0]} · {fmtSize(sectionSizes[sec.id]) || '0 B'}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Sections ── */}
          {bySection.map(({ section, projects: sProjects, fileCount, projCount }) => (
            <div key={section.id} style={{ marginBottom: 24 }}>
              {/* Section header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <img src={section.icon} alt={section.label} style={{ width: 20, height: 20, objectFit: 'contain' }} onError={e => { (e.target as HTMLImageElement).style.display='none' }} />
                <h2 style={{ fontSize: 15, fontWeight: 800, color: D.txtPri, margin: 0 }}>{section.label}</h2>
                <span style={{ fontSize: 11, padding: '2px 9px', background: section.color + '18', color: section.color, borderRadius: 20, fontWeight: 600 }}>
                  {projCount} {projCount === 1 ? 'projekt' : projCount < 5 ? 'projekty' : 'projektů'} · {fileCount} souborů
                </span>
                <div style={{ flex: 1 }} />
                <a href={section.href} style={{ fontSize: 12, color: section.color, textDecoration: 'none', padding: '4px 12px', background: section.color + '12', border: `1px solid ${section.color}30`, borderRadius: 8, fontWeight: 600 }}>
                  Otevřít editor →
                </a>
              </div>

              {sProjects.length === 0 ? (
                <div style={{ ...card({ padding: '20px', textAlign: 'center' as const }) }}>
                  <div style={{ fontSize: 24, marginBottom: 8, opacity: .4 }}>📭</div>
                  <div style={{ fontSize: 13, color: D.txtSec }}>Žádné projekty</div>
                  <a href={section.href} style={{ fontSize: 12, color: section.color, textDecoration: 'none', display: 'inline-block', marginTop: 8 }}>Vytvořit první projekt →</a>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {sProjects.map(proj => (
                    <div key={proj.key} style={{ ...card({ overflow: 'hidden' }) }}>
                      {/* Project header */}
                      <div className="fm-proj"
                        onClick={() => setExpandedProj(prev => { const n = new Set(prev); n.has(proj.key + proj.editor) ? n.delete(proj.key + proj.editor) : n.add(proj.key + proj.editor); return n })}
                        style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', cursor: 'pointer' }}>
                        <span style={{ fontSize: 9, color: D.txtSec, display: 'inline-block', transform: expandedProj.has(proj.key + proj.editor) ? 'rotate(90deg)' : 'none', transition: 'transform .15s', flexShrink: 0 }}>▶</span>
                        <div style={{ width: 32, height: 32, borderRadius: 8, background: section.color + '18', border: `1px solid ${section.color}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <img src={section.icon} alt="" style={{ width: 18, height: 18, objectFit: 'contain' }} onError={e => { (e.target as HTMLImageElement).style.display='none' }} />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 14, fontWeight: 700, color: D.txtPri, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{proj.name}</div>
                          <div style={{ fontSize: 11, color: D.txtSec }}>{proj.files.length} souborů · {fmtSize(proj.totalSize)}</div>
                        </div>
                        <a href={section.href} onClick={e => e.stopPropagation()}
                          style={{ fontSize: 11, color: section.color, textDecoration: 'none', padding: '4px 10px', background: section.color + '15', border: `1px solid ${section.color}30`, borderRadius: 7, fontWeight: 600, flexShrink: 0, transition: 'all .15s' }}>
                          Otevřít v editoru
                        </a>
                      </div>

                      {/* File list */}
                      {expandedProj.has(proj.key + proj.editor) && (
                        <div style={{ borderTop: `1px solid ${D.border}` }}>
                          {/* Group by folder */}
                          {(() => {
                            const folderMap = new Map<string, AnyFile[]>()
                            for (const f of proj.files) {
                              const key = f.folder || ''
                              if (!folderMap.has(key)) folderMap.set(key, [])
                              folderMap.get(key)!.push(f)
                            }
                            const folders = [...folderMap.entries()].sort(([a], [b]) => a.localeCompare(b))
                            return folders.map(([folder, files]) => (
                              <div key={folder}>
                                {folder && (
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 16px 4px 24px', background: 'rgba(255,255,255,.02)' }}>
                                    <span style={{ fontSize: 11 }}>📂</span>
                                    <span style={{ fontSize: 11, fontWeight: 600, color: D.txtSec }}>{folder}/</span>
                                  </div>
                                )}
                                {files.map(file => (
                                  <div key={file.path} className="fm-row"
                                    style={{ display: 'flex', alignItems: 'center', gap: 10, padding: `7px 16px 7px ${folder ? '32px' : '16px'}`, borderTop: `1px solid ${D.border}` }}>
                                    <img src={fileIcon(file.name, file.editor)} alt="" style={{ width: 15, height: 15, objectFit: 'contain', flexShrink: 0, opacity: .8 }} onError={e => { (e.target as HTMLImageElement).style.display='none' }} />
                                    <span style={{ fontSize: 12, color: D.txtPri, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</span>
                                    <span style={{ fontSize: 10, color: D.txtSec, flexShrink: 0 }}>{fmtSize(file.size)}</span>
                                    <span style={{ fontSize: 10, color: D.txtSec, flexShrink: 0, minWidth: 80, textAlign: 'right' as const }}>{fmtDate(file.updatedAt)}</span>
                                    {/* Actions */}
                                    <div className="fm-acts" style={{ display: 'flex', gap: 3, opacity: 0, flexShrink: 0 }}>
                                      {/* Open in editor */}
                                      <a href={section.href} title="Otevřít v editoru"
                                        style={{ padding: '3px 8px', background: section.color + '20', color: section.color, border: 'none', borderRadius: 5, fontSize: 10, cursor: 'pointer', fontFamily: 'inherit', textDecoration: 'none', fontWeight: 600 }}>
                                        Otevřít
                                      </a>
                                      {/* Move (only if project has folders) */}
                                      {proj.files.some(f2 => f2.folder !== file.folder) && (
                                        <button onClick={() => { setMoveModal(file); setMoveDest(file.folder) }} title="Přesunout"
                                          style={{ padding: '3px 6px', background: 'rgba(255,255,255,.06)', color: D.txtSec, border: 'none', borderRadius: 5, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>
                                          📁
                                        </button>
                                      )}
                                      {/* Rename */}
                                      <button onClick={() => { setRenameModal(file); setRenameVal(file.name.replace(/\.[^.]+$/, '')) }} title="Přejmenovat"
                                        style={{ padding: '3px 6px', background: 'rgba(255,255,255,.06)', color: D.txtSec, border: 'none', borderRadius: 5, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>
                                        ✏️
                                      </button>
                                      {/* Delete */}
                                      <button onClick={() => setDeleteModal(file)} title="Smazat"
                                        style={{ padding: '3px 6px', background: 'rgba(239,68,68,.12)', color: D.danger, border: 'none', borderRadius: 5, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>
                                        🗑️
                                      </button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ))
                          })()}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}

          {/* Empty search state */}
          {q && bySection.every(s => s.projects.length === 0) && (
            <div style={{ textAlign: 'center', padding: '60px 0', color: D.txtSec }}>
              <div style={{ fontSize: 32, marginBottom: 12, opacity: .3 }}>🔍</div>
              <div style={{ fontSize: 14 }}>Žádné výsledky pro <strong>"{search}"</strong></div>
              <button onClick={() => setSearch('')} style={{ marginTop: 12, padding: '6px 16px', background: D.bgMid, color: D.txtSec, border: `1px solid ${D.border}`, borderRadius: 8, cursor: 'pointer', fontSize: 12, fontFamily: 'inherit' }}>Zrušit hledání</button>
            </div>
          )}
        </>
      )}
    </DarkLayout>
  )
}
