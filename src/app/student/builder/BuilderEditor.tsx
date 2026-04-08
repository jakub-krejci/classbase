'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { DarkLayout, D } from '@/components/DarkLayout'

// ── Constants ──────────────────────────────────────────────────────────────────
const BUCKET = 'builder-files'
const LS_LAST = 'cb_builder_last'

function sanitize(s: string) {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9._-]/g,'_').replace(/_+/g,'_').replace(/^_|_$/g,'') || 'soubor'
}
function fp(uid: string, proj: string, name: string) {
  return `zaci/${uid}/${sanitize(proj)}/${sanitize(name)}`
}

// ── Types ──────────────────────────────────────────────────────────────────────
type ShapeType = 'box' | 'sphere' | 'cylinder' | 'cone' | 'pyramid' | 'text'

interface BuildObject {
  id: string
  type: ShapeType
  x: number; y: number; z: number        // position
  width: number; height: number; depth: number
  color: string
  isHole: boolean
  label?: string
  // shape-specific
  radiusTop?: number
  radiusBottom?: number
  radialSegments?: number
  groupId?: string                        // for merged objects
}

interface Scene { objects: BuildObject[]; groups: { id: string; objectIds: string[] }[] }

function emptyScene(): Scene { return { objects: [], groups: [] } }

function newId() { return Math.random().toString(36).slice(2, 10) }

const SHAPE_COLORS: Record<ShapeType, string> = {
  box: '#e74c3c', sphere: '#3498db', cylinder: '#2ecc71',
  cone: '#f39c12', pyramid: '#9b59b6', text: '#1abc9c',
}

// ── Three.js 3D Viewport ───────────────────────────────────────────────────────
function ThreeViewport({
  scene, selectedId, onSelect, onUpdateObject, accent
}: {
  scene: Scene
  selectedId: string | null
  onSelect: (id: string | null) => void
  onUpdateObject: (id: string, partial: Partial<BuildObject>) => void
  accent: string
}) {
  const mountRef = useRef<HTMLDivElement>(null)
  const threeRef = useRef<any>({})
  const animFrameRef = useRef<number>(0)
  const isDraggingCameraRef = useRef(false)
  const lastPointerRef = useRef({ x: 0, y: 0 })
  const isScaleHandleRef = useRef<string | null>(null) // which handle axis

  useEffect(() => {
    const THREE = (window as any).THREE
    if (!THREE || !mountRef.current) return
    const container = mountRef.current
    const W = container.clientWidth, H = container.clientHeight

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setPixelRatio(window.devicePixelRatio)
    renderer.setSize(W, H)
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    container.appendChild(renderer.domElement)
    threeRef.current.renderer = renderer

    // Scene
    const threeScene = new THREE.Scene()
    threeScene.background = new THREE.Color('#0d1117')
    threeRef.current.scene = threeScene

    // Camera
    const camera = new THREE.PerspectiveCamera(50, W / H, 0.1, 1000)
    camera.position.set(8, 6, 10)
    camera.lookAt(0, 0, 0)
    threeRef.current.camera = camera

    // Lights
    const ambLight = new THREE.AmbientLight(0xffffff, 0.5)
    threeScene.add(ambLight)
    const dirLight = new THREE.DirectionalLight(0xffffff, 1)
    dirLight.position.set(10, 20, 10)
    dirLight.castShadow = true
    threeScene.add(dirLight)
    const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0.4)
    threeScene.add(hemi)

    // Grid
    const grid = new THREE.GridHelper(20, 20, '#1e2230', '#1e2230')
    threeScene.add(grid)

    // Axes helper (small, in corner)
    const axes = new THREE.AxesHelper(1)
    axes.position.set(-9, 0.01, -9)
    threeScene.add(axes)

    // Orbit controls (manual implementation)
    let spherical = { theta: Math.PI / 4, phi: Math.PI / 3, radius: 14 }
    let target = new THREE.Vector3(0, 0, 0)

    function updateCamera() {
      const { theta, phi, radius } = spherical
      camera.position.set(
        target.x + radius * Math.sin(phi) * Math.sin(theta),
        target.y + radius * Math.cos(phi),
        target.z + radius * Math.sin(phi) * Math.cos(theta)
      )
      camera.lookAt(target)
    }
    updateCamera()
    threeRef.current.spherical = spherical
    threeRef.current.target = target
    threeRef.current.updateCamera = updateCamera

    // Raycaster
    const raycaster = new THREE.Raycaster()
    threeRef.current.raycaster = raycaster

    // Animation loop
    function animate() {
      animFrameRef.current = requestAnimationFrame(animate)
      renderer.render(threeScene, camera)
    }
    animate()

    // Resize
    const ro = new ResizeObserver(() => {
      const w = container.clientWidth, h = container.clientHeight
      renderer.setSize(w, h)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
    })
    ro.observe(container)

    threeRef.current.initialized = true

    return () => {
      cancelAnimationFrame(animFrameRef.current)
      ro.disconnect()
      renderer.dispose()
      container.removeChild(renderer.domElement)
    }
  }, [])

  // ── Sync scene objects ────────────────────────────────────────────────────
  const meshMapRef = useRef<Map<string, any>>(new Map())

  useEffect(() => {
    const THREE = (window as any).THREE
    const { scene: threeScene } = threeRef.current
    if (!THREE || !threeScene) return

    const currentIds = new Set(scene.objects.map(o => o.id))

    // Remove deleted
    meshMapRef.current.forEach((mesh, id) => {
      if (!currentIds.has(id)) {
        threeScene.remove(mesh)
        mesh.geometry?.dispose()
        meshMapRef.current.delete(id)
      }
    })

    // Add/update
    for (const obj of scene.objects) {
      const existing = meshMapRef.current.get(obj.id)

      let geo: any
      switch (obj.type) {
        case 'box':
          geo = new THREE.BoxGeometry(obj.width, obj.height, obj.depth)
          break
        case 'sphere':
          geo = new THREE.SphereGeometry(obj.width / 2, obj.radialSegments ?? 32, obj.radialSegments ?? 16)
          break
        case 'cylinder':
          geo = new THREE.CylinderGeometry(
            obj.radiusTop ?? obj.width / 2,
            obj.radiusBottom ?? obj.width / 2,
            obj.height,
            obj.radialSegments ?? 32
          )
          break
        case 'cone':
          geo = new THREE.ConeGeometry(obj.width / 2, obj.height, obj.radialSegments ?? 32)
          break
        case 'pyramid':
          geo = new THREE.ConeGeometry(obj.width / 2, obj.height, 4)
          break
        case 'text': {
          // Approximate text as flat box
          geo = new THREE.BoxGeometry(obj.width, obj.height, 0.3)
          break
        }
        default:
          geo = new THREE.BoxGeometry(obj.width, obj.height, obj.depth)
      }

      const isSelected = obj.id === selectedId
      const mat = obj.isHole
        ? new THREE.MeshStandardMaterial({
            color: 0x4488ff,
            transparent: true,
            opacity: 0.3,
            wireframe: false,
          })
        : new THREE.MeshStandardMaterial({
            color: new THREE.Color(obj.color),
            transparent: isSelected,
            opacity: isSelected ? 0.9 : 1,
          })

      if (existing) {
        threeScene.remove(existing)
        existing.geometry?.dispose()
        existing.material?.dispose()
        meshMapRef.current.delete(obj.id)
      }

      const mesh = new THREE.Mesh(geo, mat)
      mesh.position.set(obj.x, obj.y + obj.height / 2, obj.z)
      mesh.castShadow = true
      mesh.receiveShadow = true
      mesh.userData.objectId = obj.id

      // Selection outline
      if (isSelected) {
        const edgesGeo = new THREE.EdgesGeometry(geo)
        const edgesMat = new THREE.LineBasicMaterial({ color: new THREE.Color(accent), linewidth: 2 })
        const edges = new THREE.LineSegments(edgesGeo, edgesMat)
        mesh.add(edges)

        // Scale handles — small cubes at corners
        const handleGeo = new THREE.BoxGeometry(0.18, 0.18, 0.18)
        const handleMat = new THREE.MeshBasicMaterial({ color: 0xffffff })
        const positions = [
          [obj.width / 2, obj.height / 2, obj.depth / 2],
          [-obj.width / 2, obj.height / 2, obj.depth / 2],
          [obj.width / 2, obj.height / 2, -obj.depth / 2],
          [-obj.width / 2, obj.height / 2, -obj.depth / 2],
          [obj.width / 2, -obj.height / 2, obj.depth / 2],
          [-obj.width / 2, -obj.height / 2, obj.depth / 2],
          [obj.width / 2, -obj.height / 2, -obj.depth / 2],
          [-obj.width / 2, -obj.height / 2, -obj.depth / 2],
        ]
        positions.forEach(([hx, hy, hz]) => {
          const h = new THREE.Mesh(handleGeo, handleMat)
          h.position.set(hx, hy, hz)
          mesh.add(h)
        })
      }

      threeScene.add(mesh)
      meshMapRef.current.set(obj.id, mesh)
    }
  }, [scene, selectedId, accent])

  // ── Pointer events ────────────────────────────────────────────────────────
  function onPointerDown(e: React.PointerEvent) {
    if (e.button === 0) {
      // Try to pick object
      const THREE = (window as any).THREE
      const { camera, raycaster, scene: threeScene } = threeRef.current
      if (!THREE || !camera) return

      const rect = mountRef.current!.getBoundingClientRect()
      const mx = ((e.clientX - rect.left) / rect.width) * 2 - 1
      const my = -((e.clientY - rect.top) / rect.height) * 2 + 1
      raycaster.setFromCamera(new THREE.Vector2(mx, my), camera)

      const meshes: any[] = []
      meshMapRef.current.forEach(m => meshes.push(m))
      const intersects = raycaster.intersectObjects(meshes, false)

      if (intersects.length > 0) {
        const hit = intersects[0].object
        const id = hit.userData.objectId ?? hit.parent?.userData.objectId
        if (id) { onSelect(id); return }
      } else {
        onSelect(null)
      }
    }

    if (e.button === 2 || e.button === 1 || (e.button === 0 && !e.ctrlKey)) {
      isDraggingCameraRef.current = e.button !== 0
      lastPointerRef.current = { x: e.clientX, y: e.clientY }
    }
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!isDraggingCameraRef.current) return
    const dx = e.clientX - lastPointerRef.current.x
    const dy = e.clientY - lastPointerRef.current.y
    lastPointerRef.current = { x: e.clientX, y: e.clientY }

    const { spherical, updateCamera } = threeRef.current
    if (!spherical) return

    spherical.theta -= dx * 0.01
    spherical.phi = Math.max(0.1, Math.min(Math.PI - 0.1, spherical.phi + dy * 0.01))
    updateCamera()
  }

  function onPointerUp() { isDraggingCameraRef.current = false }

  function onWheel(e: React.WheelEvent) {
    const { spherical, updateCamera } = threeRef.current
    if (!spherical) return
    spherical.radius = Math.max(2, Math.min(50, spherical.radius + e.deltaY * 0.02))
    updateCamera()
  }

  function onContextMenu(e: React.MouseEvent) { e.preventDefault() }

  // ── Drop zone ─────────────────────────────────────────────────────────────
  function onDragOver(e: React.DragEvent) { e.preventDefault() }
  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    const type = e.dataTransfer.getData('shape') as ShapeType
    if (!type) return
    const rect = mountRef.current!.getBoundingClientRect()
    // Place near center with slight random offset
    const rx = (Math.random() - 0.5) * 4
    const rz = (Math.random() - 0.5) * 4
    const newObj: BuildObject = {
      id: newId(), type,
      x: rx, y: 0, z: rz,
      width: type === 'sphere' ? 2 : 2,
      height: 2,
      depth: type === 'sphere' || type === 'cylinder' || type === 'cone' ? 2 : 2,
      color: SHAPE_COLORS[type],
      isHole: false,
      radialSegments: 32,
    }
    onUpdateObject(newObj.id, newObj as any)
    onSelect(newObj.id)
  }

  return (
    <div
      ref={mountRef}
      style={{ width: '100%', height: '100%', cursor: 'grab', position: 'relative' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerUp}
      onWheel={onWheel}
      onContextMenu={onContextMenu}
      onDragOver={onDragOver}
      onDrop={onDrop}
    />
  )
}

// ── Shape Card (in right panel) ────────────────────────────────────────────────
function ShapeCard({ type, label, icon }: { type: ShapeType; label: string; icon: string }) {
  return (
    <div
      draggable
      onDragStart={e => { e.dataTransfer.setData('shape', type); e.dataTransfer.effectAllowed = 'copy' }}
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
        padding: '10px 8px', background: 'rgba(255,255,255,.04)', border: `1px solid rgba(255,255,255,.1)`,
        borderRadius: 9, cursor: 'grab', userSelect: 'none',
        transition: 'all .15s',
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,.09)' }}
      onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,.04)' }}
    >
      <span style={{ fontSize: 28 }}>{icon}</span>
      <span style={{ fontSize: 10, color: 'rgba(255,255,255,.6)', fontWeight: 600 }}>{label}</span>
    </div>
  )
}

// ── Main Component ─────────────────────────────────────────────────────────────
export default function BuilderEditor({ profile }: { profile: any }) {
  const supabase = createClient()
  const accent   = profile?.accent_color ?? '#7C3AED'
  const uid      = profile?.id as string

  // ── Three.js loader ──────────────────────────────────────────────────────
  const [threeLoaded, setThreeLoaded] = useState(false)
  useEffect(() => {
    if ((window as any).THREE) { setThreeLoaded(true); return }
    const s = document.createElement('script')
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js'
    s.onload = () => setThreeLoaded(true)
    document.head.appendChild(s)
  }, [])

  // ── Scene state ──────────────────────────────────────────────────────────
  const [scene, setScene] = useState<Scene>(emptyScene())
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [isDirty, setIsDirty] = useState(false)

  const selectedObj = scene.objects.find(o => o.id === selectedId) ?? null

  function addOrUpdateObject(id: string, partial: Partial<BuildObject>) {
    setScene(prev => {
      const exists = prev.objects.find(o => o.id === id)
      if (exists) {
        return { ...prev, objects: prev.objects.map(o => o.id === id ? { ...o, ...partial } : o) }
      } else {
        return { ...prev, objects: [...prev.objects, { id, ...partial } as BuildObject] }
      }
    })
    setIsDirty(true)
  }

  function deleteSelected() {
    if (!selectedId) return
    setScene(prev => ({ ...prev, objects: prev.objects.filter(o => o.id !== selectedId) }))
    setSelectedId(null)
    setIsDirty(true)
  }

  function duplicateSelected() {
    if (!selectedObj) return
    const newObj: BuildObject = { ...selectedObj, id: newId(), x: selectedObj.x + 0.5, z: selectedObj.z + 0.5 }
    setScene(prev => ({ ...prev, objects: [...prev.objects, newObj] }))
    setSelectedId(newObj.id)
    setIsDirty(true)
  }

  function mergeSelected() {
    const sel = scene.objects.filter(o => o.id === selectedId)
    // For now: merge all objects — in a real CSG implementation we'd use CSG.js
    // Here we do a visual "group": hole objects carve into non-hole objects (conceptually)
    // We'll mark them as grouped and offset holes visually
    if (scene.objects.length < 2) return
    const groupId = newId()
    setScene(prev => ({
      ...prev,
      objects: prev.objects.map(o => ({ ...o, groupId })),
      groups: [...prev.groups, { id: groupId, objectIds: prev.objects.map(o => o.id) }]
    }))
    setIsDirty(true)
  }

  // ── File state ───────────────────────────────────────────────────────────
  const [projects, setProjects] = useState<{ name: string; files: { path: string; name: string; project: string }[] }[]>([])
  const [activeFile, setActiveFile] = useState<{ path: string; name: string; project: string } | null>(null)
  const [activeProject, setActiveProject] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')
  const [loadingProj, setLoadingProj] = useState(true)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  // ── Modals ───────────────────────────────────────────────────────────────
  const [newProjModal, setNewProjModal] = useState(false)
  const [newProjName, setNewProjName]   = useState('')
  const [newFileModal, setNewFileModal] = useState(false)
  const [newFileName, setNewFileName]   = useState('')
  const [newFileProj, setNewFileProj]   = useState('')
  const [renamingId, setRenamingId]     = useState<string | null>(null)
  const [renameVal, setRenameVal]       = useState('')

  // ── Right panel ──────────────────────────────────────────────────────────
  const [rightTab, setRightTab] = useState<'shapes'|'settings'>('shapes')

  // ── Storage ──────────────────────────────────────────────────────────────
  async function push(path: string, content: string) {
    const blob = new Blob([content], { type: 'application/json' })
    await supabase.storage.from(BUCKET).remove([path])
    await supabase.storage.from(BUCKET).upload(path, blob, { contentType: 'application/json', cacheControl: '0' })
  }
  async function fetchContent(path: string): Promise<string> {
    const { data } = await supabase.storage.from(BUCKET).download(path + '?t=' + Date.now())
    return data ? await data.text() : '{}'
  }

  const refreshProjects = useCallback(async () => {
    setLoadingProj(true)
    try {
      const { data } = await supabase.storage.from(BUCKET).list(`zaci/${uid}`, { limit: 100 })
      const projs: typeof projects = []
      for (const item of data ?? []) {
        if (item.id === null) {
          const { data: files } = await supabase.storage.from(BUCKET).list(`zaci/${uid}/${item.name}`, { limit: 100 })
          projs.push({
            name: item.name,
            files: (files ?? []).filter(f => f.name.endsWith('.json') && f.id !== null).map(f => ({
              path: `zaci/${uid}/${item.name}/${f.name}`,
              name: f.name,
              project: item.name,
            }))
          })
        }
      }
      setProjects(projs)
      return projs
    } finally { setLoadingProj(false) }
  }, [uid])

  useEffect(() => {
    (async () => {
      const projs = await refreshProjects()
      const last = localStorage.getItem(LS_LAST)
      if (last) {
        for (const p of projs) {
          const f = p.files.find(x => x.path === last)
          if (f) { await openFile(f); return }
        }
      }
    })()
  }, [])

  async function openFile(f: { path: string; name: string; project: string }) {
    try {
      const content = await fetchContent(f.path)
      const loaded: Scene = JSON.parse(content)
      setScene(loaded ?? emptyScene())
    } catch { setScene(emptyScene()) }
    setActiveFile(f)
    setActiveProject(f.project)
    setSelectedId(null)
    setIsDirty(false)
    setExpanded(prev => new Set([...prev, f.project]))
    localStorage.setItem(LS_LAST, f.path)
  }

  async function save() {
    if (!activeFile) return
    setSaving(true)
    await push(activeFile.path, JSON.stringify(scene, null, 2))
    setIsDirty(false)
    setSaveMsg('✓ Uloženo'); setTimeout(() => setSaveMsg(''), 2000)
    setSaving(false)
  }

  async function doCreateProject() {
    if (!newProjName.trim()) return
    const projKey = sanitize(newProjName.trim())
    const fileName = 'scene.json'
    const path = fp(uid, projKey, fileName)
    await push(path, JSON.stringify(emptyScene()))
    const projs = await refreshProjects()
    const p = projs.find(x => x.name === projKey)
    if (p?.files[0]) await openFile(p.files[0])
    setNewProjModal(false); setNewProjName('')
  }

  async function doCreateFile() {
    if (!newFileName.trim()) return
    const proj = newFileProj || activeProject
    if (!proj) return
    let name = newFileName.trim()
    if (!name.endsWith('.json')) name += '.json'
    const path = fp(uid, proj, name)
    await push(path, JSON.stringify(emptyScene()))
    const projs = await refreshProjects()
    const p = projs.find(x => x.name === proj)
    const f = p?.files.find(x => x.path === path)
    if (f) await openFile(f)
    setNewFileModal(false); setNewFileName('')
  }

  async function deleteFile(f: { path: string; name: string; project: string }) {
    await supabase.storage.from(BUCKET).remove([f.path])
    if (activeFile?.path === f.path) { setActiveFile(null); setScene(emptyScene()) }
    await refreshProjects()
  }

  // ── Keyboard shortcuts ───────────────────────────────────────────────────
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); save() }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (document.activeElement === document.body) deleteSelected()
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'd') { e.preventDefault(); duplicateSelected() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedId, scene, activeFile])

  // ── Styles ───────────────────────────────────────────────────────────────
  const sideBtn: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px',
    background: 'rgba(255,255,255,.04)', border: `1px solid ${D.border}`,
    borderRadius: 7, color: D.txtSec, fontSize: 11, cursor: 'pointer',
    fontFamily: 'inherit', width: '100%', textAlign: 'left' as const, transition: 'all .15s',
  }

  function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
    return (
      <>
        <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.72)', zIndex: 9998, backdropFilter: 'blur(5px)' }} />
        <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', zIndex: 9999, width: '100%', maxWidth: 380, padding: '0 16px' }}>
          <div style={{ background: D.bgCard, borderRadius: 12, padding: '24px', border: `1px solid ${D.border}`, boxShadow: '0 28px 70px rgba(0,0,0,.75)' }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: D.txtPri, marginBottom: 14 }}>{title}</div>
            {children}
          </div>
        </div>
      </>
    )
  }

  const inp: React.CSSProperties = { width: '100%', padding: '9px 12px', background: D.bgMid, border: `1px solid ${D.border}`, borderRadius: 8, fontSize: 13, color: D.txtPri, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' as const, marginBottom: 12 }

  // ── Number input helper ──────────────────────────────────────────────────
  function NumInput({ label, value, onChange, min = 0.1, max = 20, step = 0.5 }: { label: string; value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number }) {
    return (
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 10, color: D.txtSec, fontWeight: 600, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.04em' }}>{label}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input type="range" min={min} max={max} step={step} value={value}
            onChange={e => onChange(Number(e.target.value))}
            style={{ flex: 1, accentColor: accent }} />
          <input type="number" min={min} max={max} step={step} value={value}
            onChange={e => onChange(Number(e.target.value))}
            style={{ width: 52, padding: '4px 6px', background: D.bgMid, border: `1px solid ${D.border}`, borderRadius: 6, fontSize: 12, color: D.txtPri, fontFamily: 'monospace', outline: 'none', textAlign: 'center' as const }} />
        </div>
      </div>
    )
  }

  return (
    <DarkLayout profile={profile} activeRoute="/student/builder" fullContent>

      {newProjModal && (
        <Modal title="📦 Nový projekt" onClose={() => setNewProjModal(false)}>
          <input value={newProjName} onChange={e => setNewProjName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && newProjName.trim() && doCreateProject()}
            autoFocus placeholder="Název projektu" style={inp} />
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={doCreateProject} disabled={!newProjName.trim()}
              style={{ flex: 1, padding: '9px', background: !newProjName.trim() ? D.bgMid : accent, color: !newProjName.trim() ? D.txtSec : '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: !newProjName.trim() ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
              Vytvořit
            </button>
            <button onClick={() => setNewProjModal(false)} style={{ padding: '9px 14px', background: D.bgMid, color: D.txtSec, border: `1px solid ${D.border}`, borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit' }}>Zrušit</button>
          </div>
        </Modal>
      )}
      {newFileModal && (
        <Modal title="📄 Nový soubor" onClose={() => setNewFileModal(false)}>
          <input value={newFileName} onChange={e => setNewFileName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && newFileName.trim() && doCreateFile()}
            autoFocus placeholder="scene.json" style={inp} />
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={doCreateFile} disabled={!newFileName.trim()}
              style={{ flex: 1, padding: '9px', background: !newFileName.trim() ? D.bgMid : accent, color: !newFileName.trim() ? D.txtSec : '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: !newFileName.trim() ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
              Vytvořit
            </button>
            <button onClick={() => setNewFileModal(false)} style={{ padding: '9px 14px', background: D.bgMid, color: D.txtSec, border: `1px solid ${D.border}`, borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit' }}>Zrušit</button>
          </div>
        </Modal>
      )}

      <style>{`
        .b-sb:hover { background: rgba(255,255,255,.08) !important; color: #fff !important; }
        .b-row { transition: background .12s; }
        .b-row:hover { background: rgba(255,255,255,.05) !important; }
        .b-row:hover .b-acts { opacity: 1 !important; }
        @keyframes spin { to { transform: rotate(360deg) } }
      `}</style>

      <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>

        {/* ══ LEFT: Sidebar ══ */}
        <div style={{ width: 210, flexShrink: 0, borderRight: `1px solid ${D.border}`, background: D.bgCard, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ padding: '12px 12px 10px', borderBottom: `1px solid ${D.border}`, flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <div style={{ width: 28, height: 28, borderRadius: 7, background: accent+'30', border: `1px solid ${accent}50`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 15 }}>🧱</div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: D.txtPri, lineHeight: 1.2 }}>3DBuilder</div>
                <div style={{ fontSize: 9, color: D.txtSec, lineHeight: 1.2 }}>by Jakub Krejčí</div>
              </div>
              {isDirty && <span style={{ fontSize: 9, color: D.warning, marginLeft: 'auto' }}>● neuloženo</span>}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <button className="b-sb" style={sideBtn} onClick={() => setNewProjModal(true)}><span>📁</span> Nový projekt</button>
              <button className="b-sb" style={sideBtn} onClick={() => setNewFileModal(true)} disabled={!activeProject}><span>📄</span> Nový soubor</button>
              <div style={{ height: 1, background: D.border, margin: '2px 0' }} />
              <button className="b-sb" style={{ ...sideBtn, opacity: !activeFile || saving ? .4 : 1 }} disabled={!activeFile || saving} onClick={save}><span>💾</span> {saving ? 'Ukládám…' : 'Uložit'}</button>
            </div>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '6px 0' }}>
            <div style={{ padding: '5px 12px 3px', fontSize: 10, fontWeight: 700, color: D.txtSec, textTransform: 'uppercase', letterSpacing: '.06em' }}>Moje projekty</div>
            {loadingProj
              ? <div style={{ fontSize: 11, color: D.txtSec, padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ width: 11, height: 11, border: `2px solid ${D.border}`, borderTopColor: accent, borderRadius: '50%', animation: 'spin .6s linear infinite' }} />Načítám…
                </div>
              : projects.length === 0
                ? <div style={{ fontSize: 11, color: D.txtSec, padding: '4px 12px' }}>Žádné projekty. Vytvoř první!</div>
                : projects.map(proj => (
                    <div key={proj.name}>
                      <div className="b-row"
                        onClick={() => setExpanded(prev => { const n = new Set(prev); n.has(proj.name) ? n.delete(proj.name) : n.add(proj.name); return n })}
                        style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 12px', cursor: 'pointer', background: proj.name === activeProject ? accent+'10' : 'transparent' }}>
                        <span style={{ fontSize: 9, color: D.txtSec, transition: 'transform .15s', display: 'inline-block', transform: expanded.has(proj.name) ? 'rotate(90deg)' : 'none' }}>▶</span>
                        <span style={{ fontSize: 12 }}>📁</span>
                        <span style={{ fontSize: 11, fontWeight: 600, color: proj.name === activeProject ? accent : D.txtPri, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{proj.name}</span>
                      </div>
                      {expanded.has(proj.name) && proj.files.map(f => (
                        <div key={f.path} className="b-row"
                          style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 12px 3px 26px', cursor: 'pointer', background: f.path === activeFile?.path ? accent+'18' : 'transparent', borderLeft: f.path === activeFile?.path ? `2px solid ${accent}` : '2px solid transparent' }}>
                          {renamingId === f.path ? (
                            <input value={renameVal} autoFocus
                              onChange={e => setRenameVal(e.target.value)}
                              onBlur={async () => {
                                if (renameVal.trim() && renameVal !== f.name) {
                                  let newName = renameVal.trim()
                                  if (!newName.endsWith('.json')) newName += '.json'
                                  const newPath = fp(uid, f.project, newName)
                                  const content = await fetchContent(f.path)
                                  await push(newPath, content)
                                  await supabase.storage.from(BUCKET).remove([f.path])
                                  if (activeFile?.path === f.path) setActiveFile({ ...f, path: newPath, name: newName })
                                  await refreshProjects()
                                }
                                setRenamingId(null)
                              }}
                              onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setRenamingId(null) }}
                              style={{ flex: 1, padding: '2px 5px', background: D.bgMid, border: `1px solid ${accent}`, borderRadius: 4, fontSize: 10, color: D.txtPri, fontFamily: 'inherit', outline: 'none' }}
                              onClick={e => e.stopPropagation()}
                            />
                          ) : (
                            <>
                              <span style={{ fontSize: 10 }}>📐</span>
                              <span onClick={() => openFile(f)} style={{ fontSize: 10, color: f.path === activeFile?.path ? accent : D.txtSec, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                              <div className="b-acts" style={{ display: 'flex', gap: 1, opacity: 0 }}>
                                <button onClick={e => { e.stopPropagation(); setRenamingId(f.path); setRenameVal(f.name.replace(/\.json$/, '')) }} style={{ padding: '1px 4px', background: 'none', border: 'none', cursor: 'pointer', color: D.txtSec, fontSize: 10 }}>✏</button>
                                <button onClick={e => { e.stopPropagation(); deleteFile(f) }} style={{ padding: '1px 4px', background: 'none', border: 'none', cursor: 'pointer', color: D.danger, fontSize: 10 }}>🗑</button>
                              </div>
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  ))
            }
          </div>

          {saveMsg && <div style={{ padding: '6px 12px', borderTop: `1px solid ${D.border}`, fontSize: 11, color: D.success, flexShrink: 0 }}>{saveMsg}</div>}
        </div>

        {/* ══ CENTER: 3D Editor ══ */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          {/* Toolbar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderBottom: `1px solid ${D.border}`, flexShrink: 0, flexWrap: 'wrap' as const }}>
            {/* Object count */}
            <span style={{ fontSize: 11, color: D.txtSec }}>
              {scene.objects.length} {scene.objects.length === 1 ? 'objekt' : 'objektů'}
              {selectedObj && <span style={{ color: accent, fontWeight: 600 }}> · Vybrán: {selectedObj.type}</span>}
            </span>
            <div style={{ flex: 1 }} />
            {/* Merge */}
            <button onClick={mergeSelected} disabled={scene.objects.length < 2}
              style={{ padding: '5px 10px', background: 'rgba(255,255,255,.04)', color: D.txtSec, border: `1px solid ${D.border}`, borderRadius: 7, fontSize: 11, cursor: scene.objects.length >= 2 ? 'pointer' : 'not-allowed', fontFamily: 'inherit', opacity: scene.objects.length < 2 ? .4 : 1 }}
              title="Sloučit všechny objekty (Ctrl+M)">
              🔗 Sloučit
            </button>
            {/* Duplicate */}
            <button onClick={duplicateSelected} disabled={!selectedObj}
              style={{ padding: '5px 10px', background: 'rgba(255,255,255,.04)', color: D.txtSec, border: `1px solid ${D.border}`, borderRadius: 7, fontSize: 11, cursor: selectedObj ? 'pointer' : 'not-allowed', fontFamily: 'inherit', opacity: !selectedObj ? .4 : 1 }}
              title="Duplikovat vybraný objekt (Ctrl+D)">
              ⧉ Duplikovat
            </button>
            {/* Delete */}
            <button onClick={deleteSelected} disabled={!selectedObj}
              style={{ padding: '5px 10px', background: selectedObj ? D.danger+'18' : 'rgba(255,255,255,.04)', color: selectedObj ? D.danger : D.txtSec, border: `1px solid ${selectedObj ? D.danger+'40' : D.border}`, borderRadius: 7, fontSize: 11, cursor: selectedObj ? 'pointer' : 'not-allowed', fontFamily: 'inherit', opacity: !selectedObj ? .4 : 1 }}
              title="Smazat vybraný objekt (Del)">
              🗑 Smazat
            </button>
            {/* View controls */}
            <div style={{ width: 1, height: 20, background: D.border }} />
            <button
              onClick={() => {
                const t = (window as any).THREE
                const { spherical, updateCamera } = (document.querySelector('canvas') as any)?.__three ?? {}
                // Reset via re-initializing — we'll trigger via a state hack
              }}
              style={{ padding: '5px 8px', background: 'rgba(255,255,255,.04)', color: D.txtSec, border: `1px solid ${D.border}`, borderRadius: 7, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}
              title="Reset pohledu">
              ⌂ Reset
            </button>
          </div>

          {/* Viewport */}
          <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
            {!threeLoaded ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', flexDirection: 'column', gap: 12, color: D.txtSec }}>
                <div style={{ width: 32, height: 32, border: `3px solid rgba(255,255,255,.1)`, borderTopColor: accent, borderRadius: '50%', animation: 'spin .8s linear infinite' }} />
                <span style={{ fontSize: 13 }}>Načítám 3D engine…</span>
              </div>
            ) : (
              <ThreeViewport
                scene={scene}
                selectedId={selectedId}
                onSelect={id => { setSelectedId(id); if (id) setRightTab('settings') }}
                onUpdateObject={addOrUpdateObject}
                accent={accent}
              />
            )}

            {/* Viewport hints */}
            <div style={{ position: 'absolute', bottom: 10, left: 10, fontSize: 10, color: 'rgba(255,255,255,.3)', pointerEvents: 'none', lineHeight: 1.8 }}>
              🖱 Pravé tlačítko: otáčení · Kolečko: zoom · Přetáhni tvary z pravého panelu
            </div>

            {/* Empty state */}
            {scene.objects.length === 0 && threeLoaded && (
              <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center' as const, pointerEvents: 'none' }}>
                <div style={{ fontSize: 40, marginBottom: 10, opacity: .2 }}>🧱</div>
                <div style={{ fontSize: 14, color: 'rgba(255,255,255,.25)', fontWeight: 600 }}>Přetáhni tvar z pravého panelu</div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,.15)', marginTop: 4 }}>nebo vytvoř nový projekt</div>
              </div>
            )}
          </div>
        </div>

        {/* ══ RIGHT: Tools ══ */}
        <div style={{ width: 260, flexShrink: 0, borderLeft: `1px solid ${D.border}`, background: D.bgCard, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ display: 'flex', borderBottom: `1px solid ${D.border}`, flexShrink: 0 }}>
            {([['shapes','🧱','Tvary'],['settings','⚙️','Nastavení']] as const).map(([tab, icon, label]) => (
              <button key={tab} onClick={() => setRightTab(tab)}
                style={{ flex: 1, padding: '9px 4px', background: rightTab === tab ? D.bgMid : 'transparent', border: 'none', borderBottom: `2px solid ${rightTab === tab ? accent : 'transparent'}`, cursor: 'pointer', fontFamily: 'inherit', fontSize: 11, fontWeight: 600, color: rightTab === tab ? D.txtPri : D.txtSec, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                <span style={{ fontSize: 16 }}>{icon}</span>{label}
              </button>
            ))}
          </div>

          <div style={{ flex: 1, overflowY: 'auto' }}>

            {/* ── Základní tvary ── */}
            {rightTab === 'shapes' && (
              <div style={{ padding: '12px' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: D.txtSec, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 10 }}>Přetáhni na plochu</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <ShapeCard type="box"      label="Krychle"  icon="🟥" />
                  <ShapeCard type="sphere"   label="Koule"    icon="🔵" />
                  <ShapeCard type="cylinder" label="Válec"    icon="🟫" />
                  <ShapeCard type="cone"     label="Kužel"    icon="🔺" />
                  <ShapeCard type="pyramid"  label="Jehlan"   icon="🔷" />
                  <ShapeCard type="text"     label="Text"     icon="🔤" />
                </div>

                <div style={{ height: 1, background: D.border, margin: '14px 0' }} />

                {/* Quick actions */}
                <div style={{ fontSize: 10, fontWeight: 700, color: D.txtSec, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>Rychlé akce</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <button onClick={() => setScene(emptyScene())}
                    style={{ padding: '7px 10px', background: 'rgba(239,68,68,.08)', color: D.danger, border: `1px solid rgba(239,68,68,.2)`, borderRadius: 7, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' as const }}>
                    🗑 Vymazat vše
                  </button>
                </div>

                <div style={{ height: 1, background: D.border, margin: '14px 0' }} />

                {/* Object list */}
                <div style={{ fontSize: 10, fontWeight: 700, color: D.txtSec, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>Objekty ve scéně ({scene.objects.length})</div>
                {scene.objects.length === 0
                  ? <div style={{ fontSize: 11, color: D.txtSec }}>Žádné objekty</div>
                  : scene.objects.map((obj, i) => (
                    <div key={obj.id} className="b-row"
                      onClick={() => { setSelectedId(obj.id); setRightTab('settings') }}
                      style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '5px 8px', borderRadius: 7, cursor: 'pointer', background: obj.id === selectedId ? accent+'15' : 'transparent', marginBottom: 2 }}>
                      <div style={{ width: 12, height: 12, borderRadius: 3, background: obj.isHole ? 'transparent' : obj.color, border: obj.isHole ? `2px dashed ${obj.color}` : 'none', flexShrink: 0 }} />
                      <span style={{ fontSize: 11, color: obj.id === selectedId ? accent : D.txtPri, flex: 1 }}>{obj.type} #{i+1}</span>
                      {obj.isHole && <span style={{ fontSize: 9, color: '#3b82f6', background: '#3b82f620', padding: '1px 5px', borderRadius: 4 }}>díra</span>}
                    </div>
                  ))
                }
              </div>
            )}

            {/* ── Nastavení ── */}
            {rightTab === 'settings' && (
              <div style={{ padding: '12px' }}>
                {!selectedObj ? (
                  <div style={{ color: D.txtSec, fontSize: 11, textAlign: 'center' as const, marginTop: 24, lineHeight: 1.7 }}>
                    <div style={{ fontSize: 28, marginBottom: 8 }}>👆</div>
                    Klikni na objekt<br/>ve scéně pro nastavení
                  </div>
                ) : (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                      <div style={{ width: 18, height: 18, borderRadius: 4, background: selectedObj.color, flexShrink: 0 }} />
                      <span style={{ fontSize: 13, fontWeight: 700, color: D.txtPri }}>{selectedObj.type}</span>
                      <span style={{ fontSize: 10, color: D.txtSec, marginLeft: 'auto' }}>ID: {selectedObj.id.slice(0,6)}</span>
                    </div>

                    {/* Position */}
                    <div style={{ fontSize: 10, fontWeight: 700, color: D.txtSec, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>Pozice</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginBottom: 12 }}>
                      {(['x','y','z'] as const).map(axis => (
                        <div key={axis}>
                          <div style={{ fontSize: 9, color: D.txtSec, textAlign: 'center' as const, marginBottom: 2 }}>{axis.toUpperCase()}</div>
                          <input type="number" value={selectedObj[axis]} step={0.5}
                            onChange={e => addOrUpdateObject(selectedObj.id, { [axis]: Number(e.target.value) })}
                            style={{ width: '100%', padding: '5px 6px', background: D.bgMid, border: `1px solid ${D.border}`, borderRadius: 6, fontSize: 11, color: D.txtPri, fontFamily: 'monospace', outline: 'none', boxSizing: 'border-box' as const, textAlign: 'center' as const }} />
                        </div>
                      ))}
                    </div>

                    {/* Dimensions */}
                    <div style={{ fontSize: 10, fontWeight: 700, color: D.txtSec, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>Rozměry</div>
                    <NumInput label="Šířka (W)" value={selectedObj.width} onChange={v => addOrUpdateObject(selectedObj.id, { width: v })} />
                    <NumInput label="Výška (H)" value={selectedObj.height} onChange={v => addOrUpdateObject(selectedObj.id, { height: v })} />
                    {selectedObj.type !== 'sphere' && (
                      <NumInput label="Hloubka (D)" value={selectedObj.depth} onChange={v => addOrUpdateObject(selectedObj.id, { depth: v })} />
                    )}
                    {(selectedObj.type === 'cylinder' || selectedObj.type === 'cone') && (
                      <NumInput label="Segmenty" value={selectedObj.radialSegments ?? 32} min={3} max={64} step={1} onChange={v => addOrUpdateObject(selectedObj.id, { radialSegments: v })} />
                    )}

                    {/* Color */}
                    <div style={{ fontSize: 10, fontWeight: 700, color: D.txtSec, textTransform: 'uppercase', letterSpacing: '.06em', margin: '12px 0 8px' }}>Barva</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                      <input type="color" value={selectedObj.color}
                        onChange={e => addOrUpdateObject(selectedObj.id, { color: e.target.value })}
                        style={{ width: 40, height: 32, border: 'none', borderRadius: 6, cursor: 'pointer' }} />
                      <span style={{ fontSize: 11, color: D.txtSec, fontFamily: 'monospace' }}>{selectedObj.color}</span>
                    </div>
                    {/* Color presets */}
                    <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' as const, marginBottom: 12 }}>
                      {['#e74c3c','#e67e22','#f1c40f','#2ecc71','#3498db','#9b59b6','#1abc9c','#ecf0f1','#95a5a6','#2c3e50'].map(c => (
                        <div key={c} onClick={() => addOrUpdateObject(selectedObj.id, { color: c })}
                          style={{ width: 22, height: 22, borderRadius: 5, background: c, cursor: 'pointer', border: `2px solid ${selectedObj.color === c ? '#fff' : 'transparent'}`, flexShrink: 0 }} />
                      ))}
                    </div>

                    {/* Hole toggle */}
                    <div style={{ fontSize: 10, fontWeight: 700, color: D.txtSec, textTransform: 'uppercase', letterSpacing: '.06em', margin: '12px 0 8px' }}>Typ objektu</div>
                    <button
                      onClick={() => addOrUpdateObject(selectedObj.id, { isHole: !selectedObj.isHole })}
                      style={{
                        width: '100%', padding: '9px', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 600, border: '2px solid',
                        background: selectedObj.isHole ? '#3b82f620' : 'rgba(255,255,255,.04)',
                        color: selectedObj.isHole ? '#3b82f6' : D.txtSec,
                        borderColor: selectedObj.isHole ? '#3b82f650' : D.border,
                        textAlign: 'left' as const,
                        display: 'flex', alignItems: 'center', gap: 8,
                      }}>
                      <span style={{ fontSize: 16 }}>{selectedObj.isHole ? '⬜' : '🟦'}</span>
                      <div>
                        <div>{selectedObj.isHole ? 'Díra (odečítá)' : 'Pevný objekt'}</div>
                        <div style={{ fontSize: 10, fontWeight: 400, opacity: .7 }}>{selectedObj.isHole ? 'Přesahující oblst se vyřeže z ostatních objektů' : 'Klikni pro změnu na díru'}</div>
                      </div>
                    </button>

                    {/* Delete button */}
                    <button onClick={deleteSelected}
                      style={{ width: '100%', marginTop: 14, padding: '8px', background: D.danger+'15', color: D.danger, border: `1px solid ${D.danger}30`, borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 600 }}>
                      🗑 Smazat objekt
                    </button>
                  </>
                )}
              </div>
            )}

          </div>
        </div>

      </div>
    </DarkLayout>
  )
}
