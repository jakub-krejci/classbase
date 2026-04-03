'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useRef, useCallback, useReducer } from 'react'
import { createClient } from '@/lib/supabase/client'
import { DarkLayout, D, SectionLabel } from '@/components/DarkLayout'

// ── Constants ─────────────────────────────────────────────────────────────────
const BUCKET      = 'flowchart-files'
const LS_LAST     = 'cb_flow_last'
const DEFAULT_PROJ = 'Výchozí'

function sanitizeKey(s: string) {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9._\-]/g,'_').replace(/_+/g,'_').replace(/^_|_$/g,'') || 'soubor'
}
function fp(uid: string, proj: string, name: string) {
  return `zaci/${uid}/${sanitizeKey(proj)}/${sanitizeKey(name)}`
}

// ── Types ─────────────────────────────────────────────────────────────────────
type NodeType = 'start' | 'end' | 'process' | 'decision' | 'io' | 'loop'

interface FNode {
  id: string; type: NodeType
  x: number; y: number; w: number; h: number
  label: string
}
interface FEdge {
  id: string; from: string; to: string; label?: string
  fromPort?: 'bottom'|'top'|'left'|'right'
  toPort?:   'bottom'|'top'|'left'|'right'
}
interface Diagram { nodes: FNode[]; edges: FEdge[] }
interface FlowFile { path: string; name: string; project: string; updatedAt: string }
interface Project  { name: string; files: FlowFile[] }

const EMPTY: Diagram = { nodes: [], edges: [] }

// ── Node shapes config ────────────────────────────────────────────────────────
const NODE_CFG: Record<NodeType, { label: string; color: string; defaultW: number; defaultH: number }> = {
  start:    { label: 'Start',      color: '#22C55E', defaultW: 120, defaultH: 50 },
  end:      { label: 'Konec',      color: '#EF4444', defaultW: 120, defaultH: 50 },
  process:  { label: 'Proces',     color: '#3B82F6', defaultW: 160, defaultH: 60 },
  decision: { label: 'Rozhodnutí', color: '#F59E0B', defaultW: 160, defaultH: 80 },
  io:       { label: 'Vstup/Výstup', color: '#8B5CF6', defaultW: 160, defaultH: 60 },
  loop:     { label: 'Smyčka',     color: '#06B6D4', defaultW: 160, defaultH: 60 },
}

// ── Port positions ─────────────────────────────────────────────────────────────
function getPort(node: FNode, port: string): { x: number; y: number } {
  switch(port) {
    case 'top':    return { x: node.x + node.w/2, y: node.y }
    case 'bottom': return { x: node.x + node.w/2, y: node.y + node.h }
    case 'left':   return { x: node.x,             y: node.y + node.h/2 }
    case 'right':  return { x: node.x + node.w,    y: node.y + node.h/2 }
    default:       return { x: node.x + node.w/2, y: node.y + node.h }
  }
}

// ── SVG shapes ────────────────────────────────────────────────────────────────
function NodeShape({ node, selected, onSelect, onDoubleClick, onDragStart }: {
  node: FNode; selected: boolean
  onSelect: (id: string, e: React.MouseEvent) => void
  onDoubleClick: (id: string) => void
  onDragStart: (id: string, e: React.MouseEvent) => void
}) {
  const cfg   = NODE_CFG[node.type]
  const fill  = cfg.color + '22'
  const stroke = selected ? '#fff' : cfg.color
  const sw     = selected ? 2.5 : 1.5
  const { x, y, w, h, label } = node

  const textProps = {
    x: x + w/2, y: y + h/2,
    dominantBaseline: 'central' as const, textAnchor: 'middle' as const,
    fontSize: 13, fontFamily: 'DM Sans, system-ui, sans-serif',
    fill: '#fff', style: { userSelect: 'none' as const, pointerEvents: 'none' as const }
  }

  let shape: React.ReactNode
  switch(node.type) {
    case 'start':
    case 'end':
      shape = <ellipse cx={x+w/2} cy={y+h/2} rx={w/2} ry={h/2} fill={fill} stroke={stroke} strokeWidth={sw} />
      break
    case 'decision':
      // Diamond
      shape = <polygon points={`${x+w/2},${y} ${x+w},${y+h/2} ${x+w/2},${y+h} ${x},${y+h/2}`} fill={fill} stroke={stroke} strokeWidth={sw} />
      break
    case 'io':
      // Parallelogram
      shape = <polygon points={`${x+15},${y} ${x+w},${y} ${x+w-15},${y+h} ${x},${y+h}`} fill={fill} stroke={stroke} strokeWidth={sw} />
      break
    case 'loop':
      // Hexagon-ish (process with cut corners)
      shape = <polygon points={`${x+15},${y} ${x+w-15},${y} ${x+w},${y+h/2} ${x+w-15},${y+h} ${x+15},${y+h} ${x},${y+h/2}`} fill={fill} stroke={stroke} strokeWidth={sw} />
      break
    default:
      shape = <rect x={x} y={y} width={w} height={h} rx={8} ry={8} fill={fill} stroke={stroke} strokeWidth={sw} />
  }

  // Hover port indicators
  const ports = ['top','bottom','left','right'].map(port => {
    const p = getPort(node, port)
    return <circle key={port} cx={p.x} cy={p.y} r={5} fill={cfg.color} opacity={0} className={`port port-${node.id}-${port}`}
      style={{ cursor:'crosshair' }} />
  })

  return (
    <g className={`fc-node${selected?' fc-selected':''}`}
      onMouseDown={e => { e.stopPropagation(); onDragStart(node.id, e) }}
      onClick={e => { e.stopPropagation(); onSelect(node.id, e) }}
      onDoubleClick={e => { e.stopPropagation(); onDoubleClick(node.id) }}
      style={{ cursor: 'move' }}>
      {shape}
      <text {...textProps} fontWeight={600}>{label}</text>
      {ports}
    </g>
  )
}

// ── Edge path ─────────────────────────────────────────────────────────────────
function edgePath(from: { x: number; y: number }, to: { x: number; y: number }): string {
  const dx = (to.x - from.x) * 0.5
  const dy = (to.y - from.y) * 0.5
  return `M ${from.x} ${from.y} C ${from.x+dx} ${from.y} ${to.x-dx} ${to.y} ${to.x} ${to.y}`
}

// ── Generate Python from diagram ───────────────────────────────────────────────
function generatePython(diagram: Diagram): string {
  if (diagram.nodes.length === 0) return '# Prázdný diagram\n'

  const lines = ['# Vygenerováno z flowchart editoru ClassBase', '']
  const visited = new Set<string>()
  const nodeMap = new Map(diagram.nodes.map(n => [n.id, n]))

  function indent(depth: number) { return '    '.repeat(depth) }

  function walkNode(nodeId: string, depth: number): string[] {
    if (visited.has(nodeId)) return []
    visited.add(nodeId)
    const node = nodeMap.get(nodeId)
    if (!node) return []
    const out: string[] = []
    const outEdges = diagram.edges.filter(e => e.from === nodeId)

    switch(node.type) {
      case 'start':
        out.push(`${indent(depth)}# === START ===`)
        break
      case 'end':
        out.push(`${indent(depth)}# === KONEC ===`)
        return out
      case 'process':
        out.push(`${indent(depth)}# ${node.label}`)
        out.push(`${indent(depth)}pass  # TODO: implementovat "${node.label}"`)
        break
      case 'io':
        if (node.label.toLowerCase().includes('vstup') || node.label.toLowerCase().includes('input')) {
          out.push(`${indent(depth)}${node.label.replace(/[^a-zA-Z_]/g,'_').toLowerCase() || 'vstup'} = input("${node.label}: ")`)
        } else {
          out.push(`${indent(depth)}print("${node.label}")`)
        }
        break
      case 'decision':
        out.push(`${indent(depth)}if True:  # Podmínka: ${node.label}`)
        const yesEdge = outEdges.find(e => e.label?.toLowerCase() === 'ano' || e.label?.toLowerCase() === 'yes' || (!e.label && outEdges.indexOf(e) === 0))
        const noEdge  = outEdges.find(e => e.label?.toLowerCase() === 'ne'  || e.label?.toLowerCase() === 'no'  || (!e.label && outEdges.indexOf(e) === 1))
        if (yesEdge) {
          out.push(`${indent(depth+1)}# ANO:`)
          out.push(...walkNode(yesEdge.to, depth+1))
        }
        if (noEdge) {
          out.push(`${indent(depth)}else:`)
          out.push(`${indent(depth+1)}# NE:`)
          out.push(...walkNode(noEdge.to, depth+1))
        }
        return out
      case 'loop':
        out.push(`${indent(depth)}while True:  # Smyčka: ${node.label}`)
        if (outEdges[0]) out.push(...walkNode(outEdges[0].to, depth+1))
        out.push(`${indent(depth+1)}break  # TODO: podmínka ukončení`)
        return out
    }

    // Continue to next node
    const nextEdge = outEdges.find(e => !visited.has(e.to))
    if (nextEdge) out.push(...walkNode(nextEdge.to, depth))
    return out
  }

  const startNode = diagram.nodes.find(n => n.type === 'start')
  if (startNode) {
    lines.push(...walkNode(startNode.id, 0))
  } else {
    diagram.nodes.forEach(n => {
      if (!visited.has(n.id)) lines.push(...walkNode(n.id, 0))
    })
  }

  return lines.join('\n') + '\n'
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function FlowchartEditor({ profile }: { profile: any }) {
  const supabase = createClient()
  const accent   = profile?.accent_color ?? '#7C3AED'
  const uid      = profile?.id as string

  // ── File management state ──────────────────────────────────────────────────
  const [projects, setProjects]     = useState<Project[]>([])
  const [loadingProj, setLoadingProj] = useState(true)
  const [activeFile, setActiveFile] = useState<FlowFile | null>(null)
  const [isDirty, setIsDirty]       = useState(false)
  const [expanded, setExpanded]     = useState<Set<string>>(new Set([DEFAULT_PROJ]))
  const [saving, setSaving]         = useState(false)
  const [saveMsg, setSaveMsg]       = useState('')

  // ── Modals ─────────────────────────────────────────────────────────────────
  const [newFileModal, setNewFileModal]   = useState(false)
  const [newFileName, setNewFileName]     = useState('')
  const [newFileProj, setNewFileProj]     = useState(DEFAULT_PROJ)
  const [newProjModal, setNewProjModal]   = useState(false)
  const [newProjName, setNewProjName]     = useState('')
  const [deleteModal, setDeleteModal]     = useState<FlowFile | null>(null)
  const [pythonModal, setPythonModal]     = useState(false)
  const [pythonCode, setPythonCode]       = useState('')

  // ── Diagram state ──────────────────────────────────────────────────────────
  const [diagram, setDiagram]   = useState<Diagram>(EMPTY)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [editingLabel, setEditingLabel] = useState<string | null>(null) // node id
  const [editLabelVal, setEditLabelVal] = useState('')

  // Canvas pan/zoom
  const [pan, setPan]   = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const svgRef      = useRef<SVGSVGElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Drag state
  const draggingNode   = useRef<{ id: string; startX: number; startY: number; nodeStartX: number; nodeStartY: number } | null>(null)
  const panningRef     = useRef<{ startX: number; startY: number; panX: number; panY: number } | null>(null)

  // Edge drawing
  const [drawingEdge, setDrawingEdge] = useState<{ fromId: string; fromPort: string; mouseX: number; mouseY: number } | null>(null)
  const [pendingEdgeLabel, setPendingEdgeLabel] = useState<{ edgeId: string; val: string } | null>(null)

  // ── Storage helpers ────────────────────────────────────────────────────────
  async function pushDiagram(path: string, data: Diagram): Promise<string | null> {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { upsert: true, cacheControl: '0' })
    if (error) {
      await supabase.storage.from(BUCKET).remove([path])
      const { error: e2 } = await supabase.storage.from(BUCKET).upload(path, blob, { cacheControl: '0' })
      return e2?.message ?? null
    }
    return null
  }

  async function fetchDiagram(path: string): Promise<Diagram> {
    const { data, error } = await supabase.storage.from(BUCKET).download(path)
    if (error || !data) return EMPTY
    try { return JSON.parse(await data.text()) } catch { return EMPTY }
  }

  // ── Refresh project tree ───────────────────────────────────────────────────
  const refreshProjects = useCallback(async () => {
    setLoadingProj(true)
    const { data: top } = await supabase.storage.from(BUCKET).list(`zaci/${uid}`, { limit: 200, sortBy: { column: 'name', order: 'asc' } })
    if (!top) { setLoadingProj(false); return }
    const result: Project[] = []
    for (const item of top) {
      if (item.metadata != null) continue
      const { data: files } = await supabase.storage.from(BUCKET).list(`zaci/${uid}/${item.name}`, { limit: 200 })
      result.push({
        name: item.name,
        files: (files ?? []).filter(f => f.name !== '.gitkeep' && f.metadata != null).map(f => ({
          path: `zaci/${uid}/${item.name}/${f.name}`,
          name: f.name, project: item.name, updatedAt: f.updated_at ?? '',
        }))
      })
    }
    setProjects(result)
    if (result.length === 0) {
      // Create default project with a starter file
      const path = fp(uid, DEFAULT_PROJ, 'muj-diagram.flow')
      await pushDiagram(path, EMPTY)
      await refreshProjects()
      return
    }
    setNewFileProj(result[0]?.name ?? DEFAULT_PROJ)
    setLoadingProj(false)
  }, [uid])

  useEffect(() => { refreshProjects() }, [refreshProjects])

  // ── Open file ──────────────────────────────────────────────────────────────
  async function openFile(file: FlowFile) {
    if (isDirty && !confirm('Neuložené změny budou ztraceny. Pokračovat?')) return
    const data = await fetchDiagram(file.path)
    setDiagram(data)
    setActiveFile(file)
    setIsDirty(false)
    setSelectedIds(new Set())
    setPan({ x: 0, y: 0 }); setZoom(1)
    localStorage.setItem(LS_LAST, JSON.stringify(file))
  }

  // ── Save ───────────────────────────────────────────────────────────────────
  async function save() {
    if (!activeFile) { setNewFileModal(true); return }
    setSaving(true)
    const err = await pushDiagram(activeFile.path, diagram)
    setSaving(false)
    if (err) { setSaveMsg('❌ ' + err); return }
    setIsDirty(false)
    setSaveMsg('✓ Uloženo'); setTimeout(() => setSaveMsg(''), 2000)
    await refreshProjects()
  }

  async function createFile() {
    const name = newFileName.trim() || 'diagram'
    const fname = name.endsWith('.flow') ? name : name + '.flow'
    const proj  = newFileProj || DEFAULT_PROJ
    const path  = fp(uid, proj, fname)
    await pushDiagram(path, EMPTY)
    const file: FlowFile = { path, name: fname, project: proj, updatedAt: new Date().toISOString() }
    setNewFileModal(false); setNewFileName('')
    await refreshProjects()
    await openFile(file)
  }

  async function createProject() {
    const name = newProjName.trim() || 'Projekt'
    const path = fp(uid, name, 'diagram.flow')
    await pushDiagram(path, EMPTY)
    setNewProjModal(false); setNewProjName('')
    await refreshProjects()
  }

  async function deleteFile(file: FlowFile) {
    await supabase.storage.from(BUCKET).remove([file.path])
    if (activeFile?.path === file.path) { setDiagram(EMPTY); setActiveFile(null) }
    setDeleteModal(null)
    await refreshProjects()
  }

  // ── Diagram mutations (update + mark dirty) ───────────────────────────────
  function updateDiagram(fn: (d: Diagram) => Diagram) {
    setDiagram(prev => { const next = fn(prev); setIsDirty(true); return next })
  }

  function addNode(type: NodeType, x: number, y: number) {
    const cfg = NODE_CFG[type]
    const id  = 'n' + Date.now()
    updateDiagram(d => ({
      ...d,
      nodes: [...d.nodes, { id, type, x, y, w: cfg.defaultW, h: cfg.defaultH, label: cfg.label }]
    }))
    return id
  }

  function deleteSelected() {
    updateDiagram(d => ({
      nodes: d.nodes.filter(n => !selectedIds.has(n.id)),
      edges: d.edges.filter(e => !selectedIds.has(e.id) && !selectedIds.has(e.from) && !selectedIds.has(e.to))
    }))
    setSelectedIds(new Set())
  }

  // ── SVG coordinate helpers ─────────────────────────────────────────────────
  function svgCoords(e: React.MouseEvent | MouseEvent) {
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect) return { x: 0, y: 0 }
    return {
      x: (e.clientX - rect.left - pan.x) / zoom,
      y: (e.clientY - rect.top  - pan.y) / zoom,
    }
  }

  // ── Mouse handlers ─────────────────────────────────────────────────────────
  function onNodeDragStart(id: string, e: React.MouseEvent) {
    if (e.button !== 0) return
    const node = diagram.nodes.find(n => n.id === id)!
    draggingNode.current = { id, startX: e.clientX, startY: e.clientY, nodeStartX: node.x, nodeStartY: node.y }
  }

  function onSvgMouseMove(e: React.MouseEvent) {
    // Dragging node
    if (draggingNode.current) {
      const dx = (e.clientX - draggingNode.current.startX) / zoom
      const dy = (e.clientY - draggingNode.current.startY) / zoom
      updateDiagram(d => ({
        ...d,
        nodes: d.nodes.map(n => n.id === draggingNode.current!.id
          ? { ...n, x: Math.max(0, draggingNode.current!.nodeStartX + dx), y: Math.max(0, draggingNode.current!.nodeStartY + dy) }
          : n)
      }))
      return
    }
    // Panning
    if (panningRef.current) {
      setPan({
        x: panningRef.current.panX + (e.clientX - panningRef.current.startX),
        y: panningRef.current.panY + (e.clientY - panningRef.current.startY),
      })
      return
    }
    // Edge drawing
    if (drawingEdge) {
      const c = svgCoords(e)
      setDrawingEdge(prev => prev ? { ...prev, mouseX: c.x, mouseY: c.y } : null)
    }
  }

  function onSvgMouseUp(e: React.MouseEvent) {
    draggingNode.current = null
    panningRef.current = null
    if (drawingEdge) {
      // Check if released on a node
      const c = svgCoords(e)
      const target = diagram.nodes.find(n =>
        c.x >= n.x && c.x <= n.x + n.w && c.y >= n.y && c.y <= n.y + n.h &&
        n.id !== drawingEdge.fromId
      )
      if (target) {
        const id = 'e' + Date.now()
        updateDiagram(d => ({
          ...d,
          edges: [...d.edges, { id, from: drawingEdge.fromId, to: target.id, fromPort: drawingEdge.fromPort as any, toPort: 'top', label: '' }]
        }))
        // Prompt for label
        const label = prompt('Popisek šipky (volitelné):') ?? ''
        if (label) updateDiagram(d => ({ ...d, edges: d.edges.map(ed => ed.id === id ? { ...ed, label } : ed) }))
      }
      setDrawingEdge(null)
    }
  }

  function onSvgMouseDown(e: React.MouseEvent) {
    if (e.button === 1 || e.button === 2 || (e.altKey && e.button === 0)) {
      panningRef.current = { startX: e.clientX, startY: e.clientY, panX: pan.x, panY: pan.y }
      e.preventDefault(); return
    }
    if (e.target === svgRef.current || (e.target as Element).tagName === 'svg') {
      setSelectedIds(new Set())
    }
  }

  function onSvgWheel(e: React.WheelEvent) {
    e.preventDefault()
    const factor = e.deltaY > 0 ? 0.9 : 1.1
    setZoom(z => Math.min(3, Math.max(0.2, z * factor)))
  }

  // ── Drop from palette ──────────────────────────────────────────────────────
  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    const type = e.dataTransfer.getData('nodeType') as NodeType
    if (!type) return
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect) return
    const x = (e.clientX - rect.left - pan.x) / zoom - NODE_CFG[type].defaultW / 2
    const y = (e.clientY - rect.top  - pan.y) / zoom - NODE_CFG[type].defaultH / 2
    addNode(type, Math.max(0, x), Math.max(0, y))
  }

  // ── Export ─────────────────────────────────────────────────────────────────
  function exportSVG() {
    const svg = svgRef.current
    if (!svg) return
    const serializer = new XMLSerializer()
    const source = '<?xml version="1.0" encoding="UTF-8"?>\n' +
      serializer.serializeToString(svg).replace(/transform="translate.*?"/, 'transform="translate(20,20) scale(1)"')
    const blob = new Blob([source], { type: 'image/svg+xml' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = (activeFile?.name?.replace('.flow','') || 'diagram') + '.svg'
    a.click()
  }

  function exportPNG() {
    const svg = svgRef.current
    if (!svg) return
    const serializer = new XMLSerializer()
    const svgStr = serializer.serializeToString(svg)
    const img = new Image()
    const blob = new Blob([svgStr], { type: 'image/svg+xml' })
    const url  = URL.createObjectURL(blob)
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width  = svg.clientWidth  * 2
      canvas.height = svg.clientHeight * 2
      const ctx = canvas.getContext('2d')!
      ctx.fillStyle = '#090B10'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.scale(2, 2)
      ctx.drawImage(img, 0, 0)
      URL.revokeObjectURL(url)
      const a = document.createElement('a')
      a.href = canvas.toDataURL('image/png')
      a.download = (activeFile?.name?.replace('.flow','') || 'diagram') + '.png'
      a.click()
    }
    img.src = url
  }

  function showPython() {
    setPythonCode(generatePython(diagram))
    setPythonModal(true)
  }

  // ── Keyboard shortcuts ─────────────────────────────────────────────────────
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); save() }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (editingLabel) return
        if (selectedIds.size > 0) deleteSelected()
      }
      if (e.key === 'Escape') { setSelectedIds(new Set()); setEditingLabel(null) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedIds, editingLabel, diagram])

  // ── Render ─────────────────────────────────────────────────────────────────
  const inp: React.CSSProperties = { padding: '9px 12px', background: D.bgMid, border: `1px solid ${D.border}`, borderRadius: 8, fontSize: 13, color: D.txtPri, fontFamily: 'inherit', outline: 'none', width: '100%', boxSizing: 'border-box' }

  function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
    return (
      <>
        <div onClick={onClose} style={{ position:'fixed',inset:0,background:'rgba(0,0,0,.7)',zIndex:9998,backdropFilter:'blur(4px)' }} />
        <div style={{ position:'fixed',top:'50%',left:'50%',transform:'translate(-50%,-50%)',zIndex:9999,width:'100%',maxWidth:440,padding:'0 16px' }}>
          <div style={{ background:D.bgCard,borderRadius:16,padding:'24px',border:`1px solid ${D.border}`,boxShadow:'0 24px 60px rgba(0,0,0,.7)' }}>
            <div style={{ fontSize:16,fontWeight:700,color:D.txtPri,marginBottom:16 }}>{title}</div>
            {children}
          </div>
        </div>
      </>
    )
  }

  const PALETTE_ITEMS: { type: NodeType; emoji: string }[] = [
    { type:'start',    emoji:'🟢' },
    { type:'end',      emoji:'🔴' },
    { type:'process',  emoji:'🔵' },
    { type:'decision', emoji:'🟡' },
    { type:'io',       emoji:'🟣' },
    { type:'loop',     emoji:'🩵' },
  ]

  return (
    <DarkLayout profile={profile} activeRoute="/student/flowchart" fullContent>
      <style>{`
        .fc-node { transition: opacity .1s; }
        .fc-node:hover .port { opacity: 0.7 !important; }
        .fc-node:hover { opacity: 0.92; }
        .fc-selected rect, .fc-selected ellipse, .fc-selected polygon { filter: drop-shadow(0 0 6px rgba(255,255,255,.4)); }
        .palette-item { transition: background .12s, transform .12s; }
        .palette-item:hover { background: rgba(255,255,255,.08) !important; transform: translateX(2px); }
        .file-row:hover { background: rgba(255,255,255,.04) !important; }
        .fc-toolbar-btn { background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.1); color: ${D.txtSec}; border-radius: 7px; padding: 6px 12px; cursor: pointer; font-family: inherit; font-size: 12px; transition: all .12s; }
        .fc-toolbar-btn:hover { background: rgba(255,255,255,.12); color: #fff; }
        @keyframes spin { to { transform: rotate(360deg) } }
      `}</style>

      {/* ── Modals ── */}
      {newFileModal && (
        <Modal title="📄 Nový diagram" onClose={() => setNewFileModal(false)}>
          <div style={{ display:'flex',flexDirection:'column',gap:10 }}>
            <div>
              <label style={{ fontSize:12,color:D.txtSec,display:'block',marginBottom:4 }}>Název souboru</label>
              <input value={newFileName} onChange={e=>setNewFileName(e.target.value)}
                onKeyDown={e=>e.key==='Enter'&&createFile()} placeholder="muj-diagram" autoFocus style={inp} />
            </div>
            <div>
              <label style={{ fontSize:12,color:D.txtSec,display:'block',marginBottom:4 }}>Projekt</label>
              <select value={newFileProj} onChange={e=>setNewFileProj(e.target.value)}
                style={{ ...inp, appearance:'none' }}>
                {projects.map(p => <option key={p.name} value={p.name}>{p.name}</option>)}
              </select>
            </div>
            <div style={{ display:'flex',gap:8,marginTop:4 }}>
              <button onClick={createFile} style={{ flex:1,padding:'9px',background:accent,color:'#fff',border:'none',borderRadius:8,cursor:'pointer',fontFamily:'inherit',fontWeight:600 }}>Vytvořit</button>
              <button onClick={()=>setNewFileModal(false)} style={{ padding:'9px 14px',background:D.bgMid,color:D.txtSec,border:`1px solid ${D.border}`,borderRadius:8,cursor:'pointer',fontFamily:'inherit' }}>Zrušit</button>
            </div>
          </div>
        </Modal>
      )}

      {newProjModal && (
        <Modal title="📁 Nový projekt" onClose={() => setNewProjModal(false)}>
          <input value={newProjName} onChange={e=>setNewProjName(e.target.value)}
            onKeyDown={e=>e.key==='Enter'&&createProject()} placeholder="Název projektu" autoFocus style={{ ...inp,marginBottom:12 }} />
          <div style={{ display:'flex',gap:8 }}>
            <button onClick={createProject} style={{ flex:1,padding:'9px',background:accent,color:'#fff',border:'none',borderRadius:8,cursor:'pointer',fontFamily:'inherit',fontWeight:600 }}>Vytvořit</button>
            <button onClick={()=>setNewProjModal(false)} style={{ padding:'9px 14px',background:D.bgMid,color:D.txtSec,border:`1px solid ${D.border}`,borderRadius:8,cursor:'pointer',fontFamily:'inherit' }}>Zrušit</button>
          </div>
        </Modal>
      )}

      {deleteModal && (
        <Modal title="🗑️ Smazat diagram" onClose={()=>setDeleteModal(null)}>
          <p style={{ fontSize:13,color:D.txtSec,marginBottom:16 }}>Smazat <strong style={{ color:D.txtPri }}>{deleteModal.name}</strong>? Tato akce je nevratná.</p>
          <div style={{ display:'flex',gap:8 }}>
            <button onClick={()=>deleteFile(deleteModal)} style={{ flex:1,padding:'9px',background:D.danger,color:'#fff',border:'none',borderRadius:8,cursor:'pointer',fontFamily:'inherit',fontWeight:600 }}>Smazat</button>
            <button onClick={()=>setDeleteModal(null)} style={{ padding:'9px 14px',background:D.bgMid,color:D.txtSec,border:`1px solid ${D.border}`,borderRadius:8,cursor:'pointer',fontFamily:'inherit' }}>Zrušit</button>
          </div>
        </Modal>
      )}

      {pythonModal && (
        <Modal title="🐍 Vygenerovaný Python kód" onClose={()=>setPythonModal(false)}>
          <pre style={{ background:'#1e1e2e',color:'#cdd6f4',padding:'14px',borderRadius:10,fontSize:12,overflowX:'auto',maxHeight:400,whiteSpace:'pre-wrap',fontFamily:'ui-monospace,monospace',marginBottom:12 }}>
            {pythonCode}
          </pre>
          <div style={{ display:'flex',gap:8 }}>
            <button onClick={()=>navigator.clipboard.writeText(pythonCode)} style={{ flex:1,padding:'9px',background:accent,color:'#fff',border:'none',borderRadius:8,cursor:'pointer',fontFamily:'inherit',fontWeight:600 }}>📋 Kopírovat</button>
            <button onClick={()=>setPythonModal(false)} style={{ padding:'9px 14px',background:D.bgMid,color:D.txtSec,border:`1px solid ${D.border}`,borderRadius:8,cursor:'pointer',fontFamily:'inherit' }}>Zavřít</button>
          </div>
        </Modal>
      )}

      {/* ── Main layout: left panel | canvas | right toolbar ── */}
      <div style={{ display:'flex', flex:1, minHeight:0, overflow:'hidden' }}>

        {/* ═══ LEFT PANEL ═══ */}
        <div style={{ width:220, flexShrink:0, borderRight:`1px solid ${D.border}`, background:D.bgCard, display:'flex', flexDirection:'column', overflow:'hidden' }}>

          {/* Header */}
          <div style={{ padding:'14px 14px 10px', borderBottom:`1px solid ${D.border}`, flexShrink:0 }}>
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
              <span style={{ fontSize:18 }}>📊</span>
              <span style={{ fontSize:14, fontWeight:700, color:D.txtPri }}>Flowchart</span>
            </div>
            <div style={{ display:'flex', gap:6 }}>
              <button onClick={()=>setNewFileModal(true)} className="fc-toolbar-btn" style={{ flex:1 }}>+ Diagram</button>
              <button onClick={()=>setNewProjModal(true)} className="fc-toolbar-btn">📁</button>
            </div>
          </div>

          {/* Block palette */}
          <div style={{ padding:'10px 14px 8px', borderBottom:`1px solid ${D.border}`, flexShrink:0 }}>
            <div style={{ fontSize:10, fontWeight:700, color:D.txtSec, textTransform:'uppercase', letterSpacing:'.07em', marginBottom:8 }}>Bloky — táhni na plátno</div>
            {PALETTE_ITEMS.map(({ type, emoji }) => {
              const cfg = NODE_CFG[type]
              return (
                <div key={type} draggable
                  onDragStart={e => e.dataTransfer.setData('nodeType', type)}
                  className="palette-item"
                  style={{ display:'flex', alignItems:'center', gap:9, padding:'7px 10px', borderRadius:8, cursor:'grab', marginBottom:2, border:`1px solid transparent` }}>
                  <span style={{ fontSize:14 }}>{emoji}</span>
                  <div>
                    <div style={{ fontSize:12, fontWeight:600, color:D.txtPri }}>{cfg.label}</div>
                  </div>
                  <div style={{ marginLeft:'auto', width:16, height:2, background:cfg.color+'60', borderRadius:1 }} />
                </div>
              )
            })}
          </div>

          {/* File tree */}
          <div style={{ flex:1, overflowY:'auto', padding:'6px 0' }}>
            {loadingProj
              ? <div style={{ padding:'20px', textAlign:'center', color:D.txtSec, fontSize:12 }}>Načítám…</div>
              : projects.map(proj => (
                  <div key={proj.name}>
                    <div onClick={()=>setExpanded(prev=>{const n=new Set(prev);n.has(proj.name)?n.delete(proj.name):n.add(proj.name);return n})}
                      style={{ display:'flex',alignItems:'center',gap:6,padding:'6px 14px',cursor:'pointer',fontSize:12,fontWeight:600,color:D.txtSec }}>
                      <span style={{ fontSize:10 }}>{expanded.has(proj.name)?'▼':'▶'}</span>
                      <span>📁 {proj.name}</span>
                      <span style={{ marginLeft:'auto',fontSize:10,opacity:.5 }}>{proj.files.length}</span>
                    </div>
                    {expanded.has(proj.name) && proj.files.map(file => (
                      <div key={file.path} className="file-row"
                        style={{ display:'flex',alignItems:'center',gap:6,padding:'5px 14px 5px 28px',cursor:'pointer',background:activeFile?.path===file.path?accent+'15':'transparent',borderLeft:`2px solid ${activeFile?.path===file.path?accent:'transparent'}` }}>
                        <span style={{ fontSize:11 }}>📊</span>
                        <span onClick={()=>openFile(file)} style={{ fontSize:12,color:activeFile?.path===file.path?D.txtPri:D.txtSec,flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>
                          {file.name.replace('.flow','')}
                        </span>
                        <button onClick={()=>setDeleteModal(file)} style={{ background:'none',border:'none',cursor:'pointer',color:D.danger,fontSize:12,opacity:.6,padding:'1px 4px',flexShrink:0 }}>🗑</button>
                      </div>
                    ))}
                  </div>
                ))
            }
          </div>

          {/* Save status */}
          {saveMsg && (
            <div style={{ padding:'8px 14px', borderTop:`1px solid ${D.border}`, fontSize:12, color:saveMsg.startsWith('❌')?D.danger:D.success }}>
              {saveMsg}
            </div>
          )}
        </div>

        {/* ═══ CANVAS ═══ */}
        <div style={{ flex:1, display:'flex', flexDirection:'column', minWidth:0 }}>

          {/* Toolbar */}
          <div style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 14px', borderBottom:`1px solid ${D.border}`, flexShrink:0, flexWrap:'wrap' }}>
            {/* File info */}
            <div style={{ fontSize:13, fontWeight:600, color:D.txtPri, minWidth:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
              {activeFile ? `${activeFile.project} / ${activeFile.name.replace('.flow','')}${isDirty?' •':''}` : 'Žádný diagram'}
            </div>
            <div style={{ flex:1 }} />
            {/* Actions */}
            <button onClick={save} disabled={saving} className="fc-toolbar-btn" style={{ background:isDirty?accent+'30':undefined, borderColor:isDirty?accent+'60':undefined, color:isDirty?accent:undefined }}>
              {saving ? '…' : '💾 Uložit'}
            </button>
            <button onClick={showPython} className="fc-toolbar-btn">🐍 Python</button>
            <button onClick={exportSVG} className="fc-toolbar-btn">⬇ SVG</button>
            <button onClick={exportPNG} className="fc-toolbar-btn">⬇ PNG</button>
            <button onClick={()=>{setPan({x:0,y:0});setZoom(1)}} className="fc-toolbar-btn" title="Resetovat pohled">⊙</button>
            {selectedIds.size > 0 && (
              <button onClick={deleteSelected} className="fc-toolbar-btn" style={{ color:D.danger, borderColor:D.danger+'40' }}>
                🗑 Smazat ({selectedIds.size})
              </button>
            )}
            <span style={{ fontSize:11, color:D.txtSec }}>{Math.round(zoom*100)}%</span>
          </div>

          {/* SVG canvas */}
          <div ref={containerRef} style={{ flex:1, overflow:'hidden', position:'relative', background:'#0D0F16', cursor: panningRef.current ? 'grabbing' : 'default' }}
            onDrop={onDrop} onDragOver={e=>e.preventDefault()}>

            {/* Grid background */}
            <svg style={{ position:'absolute', inset:0, width:'100%', height:'100%', pointerEvents:'none', zIndex:0 }}>
              <defs>
                <pattern id="grid" width={20*zoom} height={20*zoom} x={pan.x % (20*zoom)} y={pan.y % (20*zoom)} patternUnits="userSpaceOnUse">
                  <circle cx={0} cy={0} r={0.8} fill="rgba(255,255,255,.07)" />
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#grid)" />
            </svg>

            {!activeFile && (
              <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', gap:12, color:D.txtSec, pointerEvents:'none', zIndex:1 }}>
                <div style={{ fontSize:52, opacity:.2 }}>📊</div>
                <div style={{ fontSize:14, opacity:.5 }}>Otevři nebo vytvoř nový diagram</div>
                <div style={{ fontSize:12, opacity:.35 }}>Přetáhni bloky na plátno · Propoj šipkami · Uložit Ctrl+S</div>
              </div>
            )}

            <svg
              ref={svgRef}
              style={{ position:'absolute', inset:0, width:'100%', height:'100%', zIndex:1 }}
              onMouseMove={onSvgMouseMove}
              onMouseUp={onSvgMouseUp}
              onMouseDown={onSvgMouseDown}
              onWheel={onSvgWheel}>

              <defs>
                <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                  <polygon points="0 0, 10 3.5, 0 7" fill="rgba(255,255,255,.5)" />
                </marker>
              </defs>

              <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>
                {/* Edges */}
                {diagram.edges.map(edge => {
                  const fromNode = diagram.nodes.find(n => n.id === edge.from)
                  const toNode   = diagram.nodes.find(n => n.id === edge.to)
                  if (!fromNode || !toNode) return null
                  const from = getPort(fromNode, edge.fromPort || 'bottom')
                  const to   = getPort(toNode,   edge.toPort   || 'top')
                  const path = edgePath(from, to)
                  const mid  = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 }
                  const isSelEdge = selectedIds.has(edge.id)
                  return (
                    <g key={edge.id} onClick={e=>{e.stopPropagation();setSelectedIds(new Set([edge.id]))}}>
                      {/* Wide invisible click target */}
                      <path d={path} fill="none" stroke="transparent" strokeWidth={12} style={{ cursor:'pointer' }} />
                      <path d={path} fill="none" stroke={isSelEdge?'#fff':'rgba(255,255,255,.35)'} strokeWidth={isSelEdge?2:1.5} markerEnd="url(#arrowhead)" />
                      {edge.label && (
                        <text x={mid.x} y={mid.y-6} textAnchor="middle" fontSize={11} fill="rgba(255,255,255,.6)" fontFamily="DM Sans,system-ui,sans-serif"
                          style={{ pointerEvents:'none' }}>
                          {edge.label}
                        </text>
                      )}
                    </g>
                  )
                })}

                {/* Nodes */}
                {diagram.nodes.map(node => (
                  <NodeShape key={node.id} node={node}
                    selected={selectedIds.has(node.id)}
                    onSelect={(id, e) => setSelectedIds(e.shiftKey ? new Set([...selectedIds, id]) : new Set([id]))}
                    onDoubleClick={id => { setEditingLabel(id); setEditLabelVal(diagram.nodes.find(n=>n.id===id)?.label??'') }}
                    onDragStart={onNodeDragStart}
                  />
                ))}

                {/* Edge being drawn */}
                {drawingEdge && (() => {
                  const fromNode = diagram.nodes.find(n => n.id === drawingEdge.fromId)
                  if (!fromNode) return null
                  const from = getPort(fromNode, drawingEdge.fromPort)
                  return (
                    <path d={edgePath(from, { x: drawingEdge.mouseX, y: drawingEdge.mouseY })}
                      fill="none" stroke="rgba(255,255,255,.4)" strokeWidth={1.5} strokeDasharray="6,3" markerEnd="url(#arrowhead)" />
                  )
                })()}
              </g>
            </svg>

            {/* Label editor overlay */}
            {editingLabel && (() => {
              const node = diagram.nodes.find(n => n.id === editingLabel)
              if (!node) return null
              const rect = svgRef.current?.getBoundingClientRect()
              if (!rect) return null
              const sx = node.x * zoom + pan.x + rect.left
              const sy = node.y * zoom + pan.y + rect.top
              return (
                <input
                  value={editLabelVal}
                  onChange={e => setEditLabelVal(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' || e.key === 'Escape') {
                      if (e.key === 'Enter') updateDiagram(d => ({ ...d, nodes: d.nodes.map(n => n.id===editingLabel ? { ...n, label:editLabelVal } : n) }))
                      setEditingLabel(null)
                    }
                  }}
                  onBlur={() => { updateDiagram(d => ({ ...d, nodes: d.nodes.map(n => n.id===editingLabel ? { ...n, label:editLabelVal } : n) })); setEditingLabel(null) }}
                  autoFocus
                  style={{ position:'fixed', left:sx, top:sy, width:node.w*zoom, height:node.h*zoom, background:'rgba(0,0,0,.8)', border:`2px solid ${accent}`, borderRadius:6, color:'#fff', textAlign:'center', fontSize:13*zoom, fontFamily:'DM Sans,system-ui,sans-serif', fontWeight:600, outline:'none', zIndex:100 }}
                />
              )
            })()}

            {/* Zoom controls */}
            <div style={{ position:'absolute', bottom:16, right:16, display:'flex', flexDirection:'column', gap:4, zIndex:10 }}>
              {[['＋',1.2],['−',0.8],['↺',0]].map(([label, factor]) => (
                <button key={String(label)} onClick={() => {
                  if (factor === 0) { setPan({x:0,y:0}); setZoom(1) }
                  else setZoom(z => Math.min(3, Math.max(0.2, z * Number(factor))))
                }} style={{ width:30, height:30, background:'rgba(255,255,255,.08)', border:'1px solid rgba(255,255,255,.12)', borderRadius:7, color:'rgba(255,255,255,.6)', cursor:'pointer', fontSize:16, display:'flex', alignItems:'center', justifyContent:'center' }}>
                  {label}
                </button>
              ))}
            </div>

            {/* Hint */}
            <div style={{ position:'absolute', bottom:16, left:16, fontSize:11, color:'rgba(255,255,255,.2)', zIndex:10, userSelect:'none' }}>
              Táhni bloky z panelu · Dvojklik = upravit text · Kolečko = zoom · Alt+drag = pan · Del = smazat
            </div>
          </div>
        </div>
      </div>
    </DarkLayout>
  )
}
