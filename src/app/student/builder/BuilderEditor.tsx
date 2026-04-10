'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useRef, useCallback } from 'react'
import * as THREE from 'three'
import { createClient } from '@/lib/supabase/client'
import { DarkLayout, D } from '@/components/DarkLayout'
import AssignmentPanel from '@/components/AssignmentPanel'

// ── Constants ──────────────────────────────────────────────────────────────────
const BUCKET = 'builder-files'
const LS_LAST = 'cb_builder_last'

function sanitize(s: string) {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[^a-zA-Z0-9._-]/g,'_').replace(/_+/g,'_').replace(/^_|_$/g,'') || 'soubor'
}
function fp(uid: string, proj: string, name: string) {
  return `zaci/${uid}/${sanitize(proj)}/${sanitize(name)}`
}
function newId() { return Math.random().toString(36).slice(2,10) }

// ── Types ──────────────────────────────────────────────────────────────────────
type ShapeType = 'box'|'sphere'|'cylinder'|'cone'|'pyramid'|'text'
type ToolMode  = 'all'|'select'|'move'|'rotate'|'scale'

interface BuildObject {
  id: string; type: ShapeType
  x: number; y: number; z: number
  rx: number; ry: number; rz: number
  width: number; height: number; depth: number
  color: string; isHole: boolean
  wireframe?: boolean
  radialSegments?: number
  groupedIds?: string[]
  label?: string
  groupId?: string
  csgSnapshot?: string
  scaleX?: number; scaleY?: number; scaleZ?: number
}
interface Scene { objects: BuildObject[]; groups: {id:string;objectIds:string[]}[] }
interface GridSettings { visible:boolean; size:number; divisions:number; snap:boolean; snapSize:number }

function emptyScene(): Scene { return { objects:[], groups:[] } }

const SHAPE_COLORS: Record<ShapeType,string> = {
  box:'#e74c3c', sphere:'#3498db', cylinder:'#2ecc71',
  cone:'#f39c12', pyramid:'#9b59b6', text:'#1abc9c',
}

function snap(v:number,s:number){ return Math.round(v/s)*s }

// ══════════════════════════════════════════════════════════════════════════════
// ThreeViewport — all 11 features
// ══════════════════════════════════════════════════════════════════════════════
function ThreeViewport({
  scene, selectedIds, toolMode, gridSettings, showWireframe, showEdges,
  onSelect, onMultiSelect, onUpdateObject, accent, resetViewKey,
}:{
  scene:Scene; selectedIds:Set<string>; toolMode:ToolMode
  gridSettings:GridSettings; showWireframe:boolean; showEdges:boolean
  onSelect:(id:string|null,add?:boolean)=>void
  onMultiSelect:(ids:string[])=>void
  onUpdateObject:(id:string,p:Partial<BuildObject>)=>void
  accent:string; resetViewKey:number
}) {
  const mountRef    = useRef<HTMLDivElement>(null)
  const canvasRef   = useRef<any>(null)      // renderer.domElement
  const T           = useRef<any>({})        // three objects
  const meshMap     = useRef<Map<string,any>>(new Map())
  const gizmoGroup  = useRef<any>(null)
  const boxRect     = useRef<HTMLDivElement>(null)
  const tooltip     = useRef<HTMLDivElement>(null)

  // interaction state
  const drag = useRef<{
    mode: 'none'|'orbit'|'drag-obj'|'scale-h'|'lift-h'|'rot-h'|'box-sel'
    objId?: string
    // orbit
    lastX?: number; lastY?: number
    // drag-obj
    startWorldX?: number; startWorldZ?: number; origX?: number; origZ?: number; planeY?: number
    // scale-h
    hName?: string; origW?:number; origH?:number; origD?:number; startX?:number; startY?:number
    // lift-h
    origY?: number; startPY?: number
    // rot-h
    rotAxis?: 'x'|'y'|'z'; origRx?:number; origRy?:number; origRz?:number; rotStart?:number
    // box-sel
    bsX0?: number; bsY0?: number
  }>({ mode:'none' })

  // ── init ────────────────────────────────────────────────────────────────────
  useEffect(()=>{
    if(!mountRef.current) return
    const el=mountRef.current
    const W=el.clientWidth, H=el.clientHeight

    const renderer=new THREE.WebGLRenderer({antialias:true})
    renderer.setPixelRatio(window.devicePixelRatio)
    renderer.setSize(W,H)
    renderer.shadowMap.enabled=true
    el.appendChild(renderer.domElement)
    canvasRef.current=renderer.domElement

    const ts=new THREE.Scene()
    ts.background=new THREE.Color('#0d1117')

    const camera=new THREE.PerspectiveCamera(50,W/H,0.1,2000)
    camera.position.set(8,6,10)
    camera.lookAt(0,0,0)

    ts.add(new THREE.AmbientLight(0xffffff,0.6))
    const dir=new THREE.DirectionalLight(0xffffff,0.9)
    dir.position.set(10,20,10); dir.castShadow=true; ts.add(dir)
    ts.add(new THREE.HemisphereLight(0xffffff,0x334455,0.4))

    const grid=new THREE.GridHelper(20,20,0x1e2230,0x1e2230)
    grid.name='grid'; ts.add(grid)

    T.current={ renderer, scene:ts, camera, raycaster:new THREE.Raycaster(),
      sph:{ theta:0.8, phi:1.0, radius:14, tx:0, ty:0, tz:0 } }

    function updateCam(){
      const { theta,phi,radius,tx,ty,tz }=T.current.sph
      camera.position.set(
        tx+radius*Math.sin(phi)*Math.sin(theta),
        ty+radius*Math.cos(phi),
        tz+radius*Math.sin(phi)*Math.cos(theta)
      )
      camera.lookAt(tx,ty,tz)
    }
    updateCam()
    T.current.updateCam=updateCam

    let raf=0
    function animate(){ raf=requestAnimationFrame(animate); renderer.render(ts,camera) }
    animate()

    const ro=new ResizeObserver(()=>{
      const w=el.clientWidth,h=el.clientHeight
      renderer.setSize(w,h); camera.aspect=w/h; camera.updateProjectionMatrix()
    })
    ro.observe(el)

    return ()=>{
      cancelAnimationFrame(raf); ro.disconnect(); renderer.dispose()
      if(el.contains(renderer.domElement)) el.removeChild(renderer.domElement)
    }
  },[])

  // ── reset view ───────────────────────────────────────────────────────────────
  useEffect(()=>{
    if(!T.current.sph) return
    T.current.sph={ theta:0.8, phi:1.0, radius:14, tx:0, ty:0, tz:0 }
    T.current.updateCam?.()
  },[resetViewKey])

  // ── grid settings ────────────────────────────────────────────────────────────
  useEffect(()=>{
    const {scene:ts}=T.current; if(!ts) return
    const old=ts.getObjectByName('grid'); if(old) ts.remove(old)
    if(gridSettings.visible){
      const g=new THREE.GridHelper(gridSettings.size,gridSettings.divisions,0x1e2230,0x1e2230)
      g.name='grid'; ts.add(g)
    }
  },[gridSettings])

  // ── sync meshes ──────────────────────────────────────────────────────────────
  useEffect(()=>{
    const {scene:ts}=T.current
    if(!ts) return

    const curIds=new Set(scene.objects.map(o=>o.id))
    meshMap.current.forEach((m,id)=>{ if(!curIds.has(id)){ ts.remove(m); meshMap.current.delete(id) } })

    for(const obj of scene.objects){
      // Skip the invisible group marker (has groupedIds + SNAP: label + tiny width)
      if(obj.groupedIds?.length&&obj.label?.startsWith('SNAP:')&&obj.width<0.01){
        const old=meshMap.current.get(obj.id)
        if(old){ T.current.scene.remove(old); meshMap.current.delete(obj.id) }
        continue
      }
      // An object is "selected" if directly selected, or if its group marker is selected
      const sel=selectedIds.has(obj.id)||(!!obj.groupId&&selectedIds.has(obj.groupId))
      const old=meshMap.current.get(obj.id)
      if(old){ ts.remove(old); old.geometry?.dispose(); old.material?.dispose() }

      // CSG result: label starts with 'CSG:'
      const isCsgResult2=obj.label?.startsWith('CSG:')
      let geo:any
      if(isCsgResult2){
        try{
          const {pos,norm,idx}=JSON.parse(obj.label!.slice(4))
          geo=new THREE.BufferGeometry()
          geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3))
          if(norm.length>0) geo.setAttribute('normal',new THREE.Float32BufferAttribute(norm,3))
          if(idx.length>0)  geo.setIndex(new THREE.Uint32BufferAttribute(idx,1))
          if(norm.length===0) geo.computeVertexNormals()
        }catch{
          geo=new THREE.BoxGeometry(obj.width,obj.height,obj.depth)
        }
      } else {
        switch(obj.type){
          case 'box':      geo=new THREE.BoxGeometry(obj.width,obj.height,obj.depth); break
          case 'sphere':   geo=new THREE.SphereGeometry(obj.width/2,obj.radialSegments??32,16); break
          case 'cylinder': geo=new THREE.CylinderGeometry(obj.width/2,obj.width/2,obj.height,obj.radialSegments??32); break
          case 'cone':     geo=new THREE.ConeGeometry(obj.width/2,obj.height,obj.radialSegments??32); break
          case 'pyramid':  geo=new THREE.ConeGeometry(obj.width/2,obj.height,4); break
          case 'text':     geo=new THREE.BoxGeometry(obj.width,obj.height*0.4,obj.depth); break
          default:         geo=new THREE.BoxGeometry(obj.width,obj.height,obj.depth)
        }
      }

      // Holes in a merged group: completely skip rendering (invisible + non-raycastable)
      const isGroupedHole=obj.isHole&&!!obj.groupId
      if(isGroupedHole){
        // Remove any existing mesh and skip — holes in groups are invisible
        const old2=meshMap.current.get(obj.id)
        if(old2){ ts.remove(old2); meshMap.current.delete(obj.id) }
        continue
      }

      const isCsgResult=isCsgResult2

      const mat = obj.isHole
        ? new THREE.MeshStandardMaterial({ color:0x4488ff, transparent:true, opacity:0.25, wireframe: showWireframe||obj.wireframe })
        : new THREE.MeshStandardMaterial({ color:new THREE.Color(obj.color), wireframe: showWireframe||obj.wireframe })

      const mesh=new THREE.Mesh(geo,mat)
      if(isCsgResult){
        mesh.position.set(obj.x, obj.y, obj.z)
        if(obj.scaleX!=null) mesh.scale.set(obj.scaleX, obj.scaleY??1, obj.scaleZ??1)
        if(obj.rx||obj.ry||obj.rz) mesh.rotation.set(obj.rx*Math.PI/180, obj.ry*Math.PI/180, obj.rz*Math.PI/180)
      } else {
        mesh.position.set(obj.x, obj.y+obj.height/2, obj.z)
        mesh.rotation.set(obj.rx*Math.PI/180, obj.ry*Math.PI/180, obj.rz*Math.PI/180)
      }
      mesh.castShadow=true; mesh.receiveShadow=true
      // All objects use their own id — the click handler resolves group via obj.groupId
      mesh.userData.objectId = obj.id

      // black edge overlay (toggled by showEdges, off when wireframe mode active)
      if(!showWireframe&&!obj.wireframe&&showEdges){
        const eg=new THREE.EdgesGeometry(geo)
        const em=new THREE.LineBasicMaterial({ color: sel ? new THREE.Color(accent) : 0x000000, transparent:true, opacity: sel?1:0.4 })
        mesh.add(new THREE.LineSegments(eg,em))
      }

      // selection highlight
      if(sel){
        const hg=new THREE.EdgesGeometry(geo)
        const hm=new THREE.LineBasicMaterial({ color:new THREE.Color(accent), linewidth:2 })
        const hl=new THREE.LineSegments(hg,hm); hl.name='sel-hl'
        hl.renderOrder=100
        mesh.add(hl)
      }

      ts.add(mesh)
      meshMap.current.set(obj.id,mesh)
    }

    buildGizmos()
  },[scene,selectedIds,accent,showWireframe,showEdges,toolMode])

  // ── gizmos ───────────────────────────────────────────────────────────────────
  // Key insight: attach gizmos as children of the mesh so they rotate/move with it
  function buildGizmos(){
    const {scene:ts}=T.current; if(!ts) return

    // Remove old gizmo group from scene
    if(gizmoGroup.current){ ts.remove(gizmoGroup.current); gizmoGroup.current=null }
    // Remove old gizmos from all meshes
    meshMap.current.forEach(mesh=>{
      const old=mesh.getObjectByName('gizmo-group')
      if(old) mesh.remove(old)
    })

    // Only show gizmos for single selection
    if(selectedIds.size!==1) return
    const id=[...selectedIds][0]
    const obj=scene.objects.find(o=>o.id===id)
    if(!obj) return

    let targetMesh:any=null
    let hw:number, hh:number, hd:number

    if(obj.label&&obj.width<0.01){
      // It's a group marker — build gizmo spanning all constituent meshes
      const members=scene.objects.filter(o=>o.groupId===id)
      if(members.length===0) return
      // Compute bounding box of all members
      let minX=Infinity,minY=Infinity,minZ=Infinity,maxX=-Infinity,maxY=-Infinity,maxZ=-Infinity
      members.forEach(m=>{
        minX=Math.min(minX,m.x-m.width/2); maxX=Math.max(maxX,m.x+m.width/2)
        minY=Math.min(minY,m.y);           maxY=Math.max(maxY,m.y+m.height)
        minZ=Math.min(minZ,m.z-m.depth/2); maxZ=Math.max(maxZ,m.z+m.depth/2)
      })
      hw=(maxX-minX)/2; hh=(maxY-minY)/2; hd=(maxZ-minZ)/2
      const cx=(minX+maxX)/2, cy=(minY+maxY)/2, cz=(minZ+maxZ)/2
      // Use first constituent mesh as host, but adjust gizmo position globally
      targetMesh=meshMap.current.get(members[0].id)
      if(!targetMesh) return
      // Create gizmo at world position, attach to scene directly (not mesh child)
      // to avoid inheriting mesh transform for groups
      const g=new THREE.Group(); g.name='gizmo-group'
      // Build gizmo content (same as below but at world coords)
      _buildGizmoContent(g,id,hw,hh,hd,cx,cy,cz,true)
      T.current.scene.add(g)
      gizmoGroup.current=g
      return
    }

    if(obj.width<0.01) return
    targetMesh=meshMap.current.get(id)
    if(!targetMesh) return
    hw=obj.width/2; hh=obj.height/2; hd=obj.depth/2

    const isCsgObj=obj.label?.startsWith('CSG:')
    if(isCsgObj){
      // CSG: geometry is world-space baked, mesh.position=(obj.x, obj.y, obj.z)
      // obj.y = bb.min.y (bottom of bbox), center vertically = obj.y + hh
      // Apply scale factor to dimensions for correct gizmo size
      const sx=obj.scaleX??1, sy=obj.scaleY??1, sz=obj.scaleZ??1
      const g=new THREE.Group(); g.name='gizmo-group'
      _buildGizmoContent(g, id, hw*sx, hh*sy, hd*sz, obj.x, obj.y+hh*sy, obj.z, true)
      T.current.scene.add(g)
      gizmoGroup.current=g
    } else {
      const g=new THREE.Group(); g.name='gizmo-group'
      _buildGizmoContent(g,id,hw,hh,hd,0,0,0,false)
      targetMesh.add(g)
      gizmoGroup.current=g
    }
  }

  // ── helper: build gizmo content (shared between regular and group gizmos) ──
  function _buildGizmoContent(
    g:any, id:string, hw:number, hh:number, hd:number,
    wx:number, wy:number, wz:number, worldSpace:boolean
  ){

    // ── 8 corner scale handles (white cubes) ──────────────────────────────
    const hGeo=new THREE.BoxGeometry(0.15,0.15,0.15)
    const corners=[
      [ hw, hh, hd,'sx+y+z+'],[-hw, hh, hd,'sx-y+z+'],
      [ hw, hh,-hd,'sx+y+z-'],[-hw, hh,-hd,'sx-y+z-'],
      [ hw,-hh, hd,'sx+y-z+'],[-hw,-hh, hd,'sx-y-z+'],
      [ hw,-hh,-hd,'sx+y-z-'],[-hw,-hh,-hd,'sx-y-z-'],
    ]
    corners.forEach(([ox,oy,oz,name])=>{
      const h=new THREE.Mesh(hGeo,new THREE.MeshBasicMaterial({color:0xffffff,depthTest:false}))
      h.position.set((ox as number)+(worldSpace?wx:0),(oy as number)+(worldSpace?wy:0),(oz as number)+(worldSpace?wz:0))
      h.userData={ gizmo:'scale', handleName:name, objId:id }
      h.renderOrder=999; g.add(h)
    })

    // ── 6 face handles — same white cube shape as corner handles, on face centers ──
    const fGeo=new THREE.BoxGeometry(0.15,0.15,0.15)
    const fMat=new THREE.MeshBasicMaterial({color:0xdddddd,depthTest:false})
    const faceHandles=[
      [[hw,   0,   0  ],'x','face+x'],
      [[-hw,  0,   0  ],'x','face-x'],
      [[0,    hh,  0  ],'y','face+y'],
      [[0,   -hh,  0  ],'y','face-y'],
      [[0,    0,   hd ],'z','face+z'],
      [[0,    0,  -hd ],'z','face-z'],
    ]
    faceHandles.forEach(([pos,axis,name])=>{
      const fh=new THREE.Mesh(fGeo,new THREE.MeshBasicMaterial({color:0x111111,depthTest:false}))
      const p=pos as number[]
      fh.position.set(p[0]+(worldSpace?wx:0),p[1]+(worldSpace?wy:0),p[2]+(worldSpace?wz:0))
      fh.userData={ gizmo:'face-scale', faceAxis:axis, faceName:name, objId:id }
      fh.renderOrder=998; g.add(fh)
    })

    // ── Lift handle (yellow upward cone above object) ──────────────────────
    const liftH=new THREE.Mesh(
      new THREE.ConeGeometry(0.13,0.30,3),
      new THREE.MeshBasicMaterial({color:0xffdd00,depthTest:false})
    )
    liftH.position.set(worldSpace?wx:0, hh+0.50+(worldSpace?wy:0), worldSpace?wz:0)
    liftH.userData={ gizmo:'lift', objId:id }
    liftH.renderOrder=999; g.add(liftH)

    // ── Rotation handles: curved arc arrows per axis ───────────────────────
    // Use a partial torus (arc) with arrowheads at both ends for bidirectional look
    function makeArcArrow(axis:'rx'|'ry'|'rz', color:number, offset:[number,number,number]){
      const ag=new THREE.Group()
      ag.userData={ gizmo:'rotate', rotAxis:axis.slice(1), objId:id }

      // Arc: partial torus (tube along 3/4 of a circle)
      const arcGeo=new THREE.TorusGeometry(0.28,0.035,6,24,Math.PI*1.5)
      const mat=new THREE.MeshBasicMaterial({color,depthTest:false})
      const arc=new THREE.Mesh(arcGeo,mat)
      ag.add(arc)

      // Arrowhead 1 at start of arc (pointing CW)
      const ah1=new THREE.Mesh(new THREE.ConeGeometry(0.07,0.16,6),mat.clone())
      ah1.position.set(0.28,0,0)
      ah1.rotation.z=Math.PI/2
      ag.add(ah1)

      // Arrowhead 2 at end of arc (pointing CCW) — end of 270° = at (-radius,0)
      const ah2=new THREE.Mesh(new THREE.ConeGeometry(0.07,0.16,6),mat.clone())
      ah2.position.set(-0.28,0.01,0)
      ah2.rotation.z=-Math.PI/2
      ag.add(ah2)

      // Orient the arc to rotate around the correct world axis:
      // RX: arc in YZ plane (torus rotated 90° around Z)
      // RY: arc in XZ plane (torus rotated 90° around X)  
      // RZ: arc in XY plane (default torus orientation)
      if(axis==='rx'){ ag.rotation.z=Math.PI/2 }
      if(axis==='ry'){ ag.rotation.x=Math.PI/2 }
      // rz: default XY plane — no rotation needed

      ag.position.set(offset[0],offset[1],offset[2])
      ag.renderOrder=999
      ag.traverse((c:any)=>{ if(c.isMesh) c.userData={ gizmo:'rotate', rotAxis:axis.slice(1), objId:id } })
      return ag
    }

    // Place rotation arcs — colors match the RX/RY/RZ labels in the settings panel
    // RX=green, RY=blue, RZ=red (same as rx=red, ry=green, rz=blue in settings)
    // Wait — settings panel has: rx=#cc4444(red), ry=#44cc44(green), rz=#4444cc(blue)
    // So: green arc = RY, blue arc = RZ, red arc = RX
    const wo:[number,number,number]=worldSpace?[wx,wy,wz]:[0,0,0]
    g.add(makeArcArrow('ry',0x44cc44,[wo[0], hh+0.65+wo[1], wo[2]]))    // green = RY, above
    g.add(makeArcArrow('rx',0xcc4444,[hw+0.65+wo[0], wo[1], wo[2]]))    // red = RX, right side
    g.add(makeArcArrow('rz',0x4444cc,[wo[0], wo[1], hd+0.65+wo[2]]))   // blue = RZ, front

  }

  // ── helpers ──────────────────────────────────────────────────────────────────
  function getNDC(clientX:number,clientY:number){ 
    const r=mountRef.current!.getBoundingClientRect()
    return {x:((clientX-r.left)/r.width)*2-1, y:-((clientY-r.top)/r.height)*2+1}
  }

  function raycastGroup(ndc:{x:number;y:number}){
    const {raycaster,camera,scene:ts}=T.current; if(!raycaster) return null
    raycaster.setFromCamera(new THREE.Vector2(ndc.x,ndc.y),camera)
    const gizmoMeshes:any[]=[]
    // Check mesh children (for regular objects)
    meshMap.current.forEach(mesh=>{
      mesh.traverse((c:any)=>{ if(c.isMesh&&c.userData.gizmo) gizmoMeshes.push(c) })
    })
    // Also check scene-level gizmo groups (for groups in world space)
    if(ts){
      const sg=ts.getObjectByName('gizmo-group')
      if(sg) sg.traverse((c:any)=>{ if(c.isMesh&&c.userData.gizmo) gizmoMeshes.push(c) })
    }
    if(gizmoMeshes.length===0) return null
    const hits=raycaster.intersectObjects(gizmoMeshes,false)
    return hits.length>0?hits[0].object:null
  }

  function raycastObjects(ndc:{x:number;y:number}){
    const {raycaster,camera}=T.current; if(!raycaster) return null
    raycaster.setFromCamera(new THREE.Vector2(ndc.x,ndc.y),camera)
    const meshes:any[]=[]; meshMap.current.forEach(m=>meshes.push(m))
    const hits=raycaster.intersectObjects(meshes,false)
    return hits.length>0?hits[0]:null
  }

  function getWorldXZ(clientX:number,clientY:number,planeY=0){
    const {raycaster,camera}=T.current; if(!raycaster) return {x:0,z:0}
    const ndc=getNDC(clientX,clientY)
    raycaster.setFromCamera(new THREE.Vector2(ndc.x,ndc.y),camera)
    const plane=new THREE.Plane(new THREE.Vector3(0,1,0),-planeY)
    const pt=new THREE.Vector3()
    raycaster.ray.intersectPlane(plane,pt)
    return {x:pt.x,z:pt.z}
  }

  // ── pointer down ─────────────────────────────────────────────────────────────
  function onPD(e:React.PointerEvent){
    (e.target as Element).setPointerCapture(e.pointerId)

    // RMB → orbit
    if(e.button===2){
      drag.current={ mode:'orbit', lastX:e.clientX, lastY:e.clientY }
      return
    }
    if(e.button!==0) return

    const ndc=getNDC(e.clientX,e.clientY)

    // 1. check gizmos
    const gz=raycastGroup(ndc)
    if(gz){
      const {gizmo,objId}=gz.userData
      const obj=scene.objects.find(o=>o.id===objId); if(!obj) return

      if(gizmo==='scale'){
        drag.current={
          mode:'scale-h', objId, hName:gz.userData.handleName,
          origW:obj.width, origH:obj.height, origD:obj.depth,
          startX:e.clientX, startY:e.clientY
        }
        return
      }
      if(gizmo==='face-scale'){
        drag.current={
          mode:'scale-h', objId, hName:'face:'+gz.userData.faceAxis,
          origW:obj.width, origH:obj.height, origD:obj.depth,
          startX:e.clientX, startY:e.clientY
        }
        return
      }
      if(gizmo==='lift'){
        drag.current={ mode:'lift-h', objId, origY:obj.y, startPY:e.clientY }
        return
      }
      if(gizmo==='rotate'){
        const ax=gz.userData.rotAxis as 'x'|'y'|'z'
        const ang=Math.atan2(e.clientY-window.innerHeight/2, e.clientX-window.innerWidth/2)*180/Math.PI
        drag.current={
          mode:'rot-h', objId, rotAxis:ax,
          origRx:obj.rx, origRy:obj.ry, origRz:obj.rz, rotStart:ang
        }
        return
      }
    }

    // 2. check objects
    const hit=raycastObjects(ndc)
    if(hit){
      const hitId=hit.object.userData.objectId
      if(hitId){
        const obj=scene.objects.find(o=>o.id===hitId)
        // If clicked object belongs to a group, select the group marker instead
        const effectiveId = obj?.groupId ?? hitId
        onSelect(effectiveId, e.shiftKey)
        const effectiveObj=scene.objects.find(o=>o.id===effectiveId)??obj
        if(effectiveObj){
          // For group markers (width<0.01), find a representative member for position reference
          const isGroupMarker=effectiveObj.width<0.01&&effectiveObj.groupedIds?.length
          const posRef = isGroupMarker
            ? (scene.objects.find(o=>o.groupId===effectiveId&&!o.isHole)??effectiveObj)
            : effectiveObj
          if(toolMode==='move'||toolMode==='all'){
            const wp=getWorldXZ(e.clientX,e.clientY,0)
            drag.current={
              mode:'drag-obj', objId:effectiveId,
              startX:e.clientX, startY:e.clientY,
              startWorldX:wp.x, startWorldZ:wp.z,
              origX:effectiveObj.x, origZ:effectiveObj.z, planeY:0
            }
          } else if(toolMode==='rotate'){
            const ang=Math.atan2(e.clientY-window.innerHeight/2, e.clientX-window.innerWidth/2)*180/Math.PI
            drag.current={
              mode:'rot-h', objId:effectiveId, rotAxis:'y',
              origRx:posRef.rx??0, origRy:posRef.ry??0, origRz:posRef.rz??0, rotStart:ang
            }
          } else if(toolMode==='scale'){
            drag.current={
              mode:'scale-h', objId:effectiveId, hName:'sx+y+z+',
              origW:posRef.width, origH:posRef.height, origD:posRef.depth,
              startX:e.clientX, startY:e.clientY
            }
          }
        }
        return
      }
    }

    // 3. empty click → deselect + box-select
    onSelect(null)
    const r=mountRef.current!.getBoundingClientRect()
    drag.current={ mode:'box-sel', bsX0:e.clientX-r.left, bsY0:e.clientY-r.top }
    if(boxRect.current){
      boxRect.current.style.display='block'
      boxRect.current.style.left=(e.clientX-r.left)+'px'
      boxRect.current.style.top=(e.clientY-r.top)+'px'
      boxRect.current.style.width='0'; boxRect.current.style.height='0'
    }
  }

  // ── pointer move ─────────────────────────────────────────────────────────────
  function onPM(e:React.PointerEvent){
    const d=drag.current

    if(d.mode==='orbit'){
      const dx=e.clientX-(d.lastX??e.clientX)
      const dy=e.clientY-(d.lastY??e.clientY)
      d.lastX=e.clientX; d.lastY=e.clientY
      const sph=T.current.sph; if(!sph) return
      sph.theta-=dx*0.008
      sph.phi=Math.max(0.05,Math.min(Math.PI-0.05,sph.phi+dy*0.008))
      T.current.updateCam?.()
      return
    }

    if(d.mode==='drag-obj'&&d.objId!=null){
      const wp=getWorldXZ(e.clientX,e.clientY,d.planeY??0)
      let nx=(d.origX??0)+(wp.x-(d.startWorldX??0))
      let nz=(d.origZ??0)+(wp.z-(d.startWorldZ??0))
      if(gridSettings.snap){ nx=snap(nx,gridSettings.snapSize); nz=snap(nz,gridSettings.snapSize) }
      const dx=e.clientX-(d.startX??e.clientX), dz_raw=e.clientY-(d.startY??e.clientY)
      // Recalculate world delta properly
      const wpNow=getWorldXZ(e.clientX,e.clientY,0)
      const wpOrig=getWorldXZ(d.startX??e.clientX,d.startY??e.clientY,0)
      const wdx=wpNow.x-wpOrig.x, wdz=wpNow.z-wpOrig.z
      // Move constituent group members if this is a group
      const groupMembers=scene.objects.filter(o=>o.groupId===d.objId)
      if(groupMembers.length>0){
        groupMembers.forEach(co=>{
          const key='orig_'+co.id
          if(!(drag.current as any)[key]) (drag.current as any)[key]={x:co.x,z:co.z}
          const orig=(drag.current as any)[key]
          // For CSG results (baked geometry), x/z acts as a translation offset applied to mesh.position
          onUpdateObject(co.id,{x:orig.x+wdx, z:orig.z+wdz})
        })
      } else {
        onUpdateObject(d.objId,{x:nx,z:nz})
      }
      return
    }

    if(d.mode==='scale-h'&&d.objId!=null&&d.hName!=null){
      const dx=e.clientX-(d.startX??e.clientX)
      const dy=e.clientY-(d.startY??e.clientY)
      const hn=d.hName
      // Check if we're scaling a group marker → scale all constituents
      const groupMembers=scene.objects.filter(o=>o.groupId===d.objId)
      const isGroup=groupMembers.length>0
      if(isGroup){
        // Uniform proportional scale for entire group
        const delta=(dx-dy)*0.025
        const scaleFactor=1+delta
        groupMembers.forEach(co=>{
          const key='origDim_'+co.id
          if(!(drag.current as any)[key]) (drag.current as any)[key]={w:co.width,h:co.height,d:co.depth,x:co.x,y:co.y,z:co.z}
          const orig=(drag.current as any)[key]
          onUpdateObject(co.id,{
            width:  Math.max(0.05,orig.w*scaleFactor),
            height: Math.max(0.05,orig.h*scaleFactor),
            depth:  Math.max(0.05,orig.d*scaleFactor),
            x: orig.x*scaleFactor,
            y: orig.y*scaleFactor,
            z: orig.z*scaleFactor,
          })
        })
      } else if(hn.startsWith('face:')){
        // single-axis scaling from face handle
        const axis=hn.slice(5) // 'x','y','z'
        const delta=(dx-dy)*0.03
        onUpdateObject(d.objId,{
          width:  axis==='x'?Math.max(0.1,(d.origW??1)+delta):d.origW??1,
          height: axis==='y'?Math.max(0.1,(d.origH??1)+delta):d.origH??1,
          depth:  axis==='z'?Math.max(0.1,(d.origD??1)+delta):d.origD??1,
        })
      } else {
        // corner handle — scale proportionally
        const delta=(dx-dy)*0.025
        const csgDragObj=scene.objects.find(o=>o.id===d.objId)
        if(csgDragObj?.label?.startsWith('CSG:')){
          // CSG: update scaleX/Y/Z instead of width/height/depth
          const curSx=csgDragObj.scaleX??1, curSy=csgDragObj.scaleY??1, curSz=csgDragObj.scaleZ??1
          const nx=hn.includes('x')?Math.max(0.05,curSx+delta*curSx):curSx
          const ny=hn.includes('y')?Math.max(0.05,curSy+delta*curSy):curSy
          const nz=hn.includes('z')?Math.max(0.05,curSz+delta*curSz):curSz
          onUpdateObject(d.objId,{ scaleX:nx, scaleY:ny, scaleZ:nz,
            width:csgDragObj.width*(nx/curSx), height:csgDragObj.height*(ny/curSy), depth:csgDragObj.depth*(nz/curSz) })
        } else {
          const dw=hn.includes('x')?(d.origW??1)+delta*(d.origW??1):(d.origW??1)
          const dh=hn.includes('y')?(d.origH??1)+delta*(d.origH??1):(d.origH??1)
          const dd=hn.includes('z')?(d.origD??1)+delta*(d.origD??1):(d.origD??1)
          onUpdateObject(d.objId,{ width:Math.max(0.1,dw), height:Math.max(0.1,dh), depth:Math.max(0.1,dd) })
        }
      }
      return
    }

    if(d.mode==='lift-h'&&d.objId!=null){
      const dy=e.clientY-(d.startPY??e.clientY)
      const ny=Math.max(0,(d.origY??0)-dy*0.025)
      onUpdateObject(d.objId,{y:ny})
      return
    }

    if(d.mode==='rot-h'&&d.objId!=null&&d.rotAxis!=null){
      const ang=Math.atan2(e.clientY-window.innerHeight/2, e.clientX-window.innerWidth/2)*180/Math.PI
      const delta=ang-(d.rotStart??0)
      const ax=d.rotAxis
      // Check if rotating a group — rotate all members
      const groupMembers=scene.objects.filter(o=>o.groupId===d.objId)
      if(groupMembers.length>0){
        groupMembers.forEach(co=>{
          const key='origRot_'+co.id
          if(!(drag.current as any)[key]) (drag.current as any)[key]={rx:co.rx,ry:co.ry,rz:co.rz}
          const orig=(drag.current as any)[key]
          onUpdateObject(co.id,{
            rx: ax==='x' ? (orig.rx+delta)%360 : orig.rx,
            ry: ax==='y' ? (orig.ry+delta)%360 : orig.ry,
            rz: ax==='z' ? (orig.rz+delta)%360 : orig.rz,
          })
        })
      } else {
        onUpdateObject(d.objId,{
          rx: ax==='x' ? ((d.origRx??0)+delta)%360 : (d.origRx??0),
          ry: ax==='y' ? ((d.origRy??0)+delta)%360 : (d.origRy??0),
          rz: ax==='z' ? ((d.origRz??0)+delta)%360 : (d.origRz??0),
        })
      }
      return
    }

    if(d.mode==='box-sel'&&d.bsX0!=null&&d.bsY0!=null){
      const r=mountRef.current!.getBoundingClientRect()
      const ex=e.clientX-r.left, ey=e.clientY-r.top
      if(boxRect.current){
        boxRect.current.style.left=Math.min(d.bsX0,ex)+'px'
        boxRect.current.style.top=Math.min(d.bsY0,ey)+'px'
        boxRect.current.style.width=Math.abs(ex-d.bsX0)+'px'
        boxRect.current.style.height=Math.abs(ey-d.bsY0)+'px'
      }
      return
    }

    // hover → tooltip on scale / face handles
    const gz=raycastGroup(getNDC(e.clientX,e.clientY))
    const gType=gz?.userData.gizmo
    if((gType==='scale'||gType==='face-scale')&&tooltip.current){
      const id=gz.userData.objId
      const obj=scene.objects.find(o=>o.id===id)
      if(obj){
        const r=mountRef.current!.getBoundingClientRect()
        tooltip.current.style.display='block'
        tooltip.current.style.left=(e.clientX-r.left+12)+'px'
        tooltip.current.style.top=(e.clientY-r.top-28)+'px'
        if(gType==='face-scale'){
          const ax=gz.userData.faceAxis
          tooltip.current.textContent=ax==='x'?`← W:${obj.width.toFixed(1)} →`:ax==='y'?`↕ H:${obj.height.toFixed(1)}`:` D:${obj.depth.toFixed(1)}`
        } else {
          tooltip.current.textContent=`W:${obj.width.toFixed(1)}  H:${obj.height.toFixed(1)}  D:${obj.depth.toFixed(1)}`
        }
      }
    } else if(tooltip.current){
      tooltip.current.style.display='none'
    }
  }

  // ── pointer up ───────────────────────────────────────────────────────────────
  function onPU(e:React.PointerEvent){
    const d=drag.current
    if(d.mode==='box-sel'&&d.bsX0!=null&&d.bsY0!=null){
      const r=mountRef.current!.getBoundingClientRect()
      const x0=Math.min(d.bsX0,e.clientX-r.left)/r.width*2-1
      const y0=-(Math.min(d.bsY0,e.clientY-r.top)/r.height*2-1)
      const x1=Math.max(d.bsX0,e.clientX-r.left)/r.width*2-1
      const y1=-(Math.max(d.bsY0,e.clientY-r.top)/r.height*2-1)
      const found:string[]=[]
      const {camera}=T.current
      scene.objects.forEach(obj=>{
        const m=meshMap.current.get(obj.id); if(!m||!camera) return
        const pt=m.position.clone().project(camera)
        if(pt.x>=x0&&pt.x<=x1&&pt.y>=y1&&pt.y<=y0) found.push(obj.id)
      })
      if(found.length>0) onMultiSelect(found)
      if(boxRect.current) boxRect.current.style.display='none'
    }
    drag.current={ mode:'none' }
  }

  function onWheel(e:React.WheelEvent){
    const sph=T.current.sph; if(!sph) return
    sph.radius=Math.max(1.5,Math.min(80,sph.radius+e.deltaY*0.03))
    T.current.updateCam?.()
  }

  function onDragOver(e:React.DragEvent){ e.preventDefault() }
  function onDrop(e:React.DragEvent){
    e.preventDefault()
    const type=e.dataTransfer.getData('shape') as ShapeType; if(!type) return
    const rx=(Math.random()-0.5)*4, rz=(Math.random()-0.5)*4
    const nx=gridSettings.snap?snap(rx,gridSettings.snapSize):rx
    const nz=gridSettings.snap?snap(rz,gridSettings.snapSize):rz
    const o:BuildObject={ id:newId(),type,x:nx,y:0,z:nz,rx:0,ry:0,rz:0,
      width:2,height:2,depth:2,color:SHAPE_COLORS[type],isHole:false,radialSegments:32 }
    onUpdateObject(o.id,o as any)
    onSelect(o.id)
  }

  return (
    <div style={{width:'100%',height:'100%',position:'relative',overflow:'hidden'}}>
      <div ref={mountRef}
        style={{width:'100%',height:'100%'}}
        onPointerDown={onPD} onPointerMove={onPM} onPointerUp={onPU} onPointerLeave={onPU}
        onWheel={onWheel} onContextMenu={e=>e.preventDefault()}
        onDragOver={onDragOver} onDrop={onDrop}
      />
      {/* Box selection rect */}
      <div ref={boxRect} style={{
        display:'none',position:'absolute',
        border:`1.5px dashed ${accent}`,background:`${accent}14`,
        pointerEvents:'none',zIndex:10
      }}/>
      {/* Dimension tooltip */}
      <div ref={tooltip} style={{
        display:'none',position:'absolute',background:'rgba(0,0,0,.85)',
        color:'#fff',fontSize:11,padding:'3px 9px',borderRadius:5,
        fontFamily:'monospace',pointerEvents:'none',zIndex:20,whiteSpace:'nowrap'
      }}/>
    </div>
  )
}

// ── ShapeCard ──────────────────────────────────────────────────────────────────
function ShapeCard({type,label,icon}:{type:ShapeType;label:string;icon:string}){
  return (
    <div draggable
      onDragStart={e=>{ e.dataTransfer.setData('shape',type); e.dataTransfer.effectAllowed='copy' }}
      style={{display:'flex',flexDirection:'column',alignItems:'center',gap:5,padding:'10px 6px',
        background:'rgba(255,255,255,.04)',border:'1px solid rgba(255,255,255,.1)',
        borderRadius:9,cursor:'grab',userSelect:'none',transition:'all .15s'}}
      onMouseEnter={e=>{(e.currentTarget as HTMLDivElement).style.background='rgba(255,255,255,.1)'}}
      onMouseLeave={e=>{(e.currentTarget as HTMLDivElement).style.background='rgba(255,255,255,.04)'}}>
      <span style={{fontSize:24}}>{icon}</span>
      <span style={{fontSize:10,color:'rgba(255,255,255,.6)',fontWeight:600}}>{label}</span>
    </div>
  )
}

// ── NumSlider ──────────────────────────────────────────────────────────────────
function NumSlider({label,value,onChange,min=0.1,max=20,step=0.1,accent}:{
  label:string;value:number;onChange:(v:number)=>void;min?:number;max?:number;step?:number;accent:string
}){
  return (
    <div style={{marginBottom:10}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:3}}>
        <span style={{fontSize:10,color:D.txtSec,fontWeight:600,textTransform:'uppercase',letterSpacing:'.04em'}}>{label}</span>
        <input type="number" value={value} min={min} max={max} step={step}
          onChange={e=>onChange(Number(e.target.value))}
          style={{width:58,padding:'3px 6px',background:D.bgMid,border:`1px solid ${D.border}`,
            borderRadius:5,fontSize:11,color:D.txtPri,fontFamily:'monospace',outline:'none',textAlign:'center' as const}}/>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e=>onChange(Number(e.target.value))}
        style={{width:'100%',accentColor:accent,cursor:'pointer',display:'block'}}/>
    </div>
  )
}

// ── Main Component ─────────────────────────────────────────────────────────────
export default function BuilderEditor({profile,assignmentId}:{profile:any;assignmentId?:string|null}){
  const supabase=createClient()
  const accent=profile?.accent_color??'#7C3AED'
  const uid=profile?.id as string

  const threeLoaded=true  // Three.js loaded via npm import

  // ── Scene state + Undo/Redo ───────────────────────────────────────────────
  const [scene,setScene]           = useState<Scene>(emptyScene())
  const [selectedIds,setSelectedIds] = useState<Set<string>>(new Set())
  const [isDirty,setIsDirty]       = useState(false)
  const [toolMode,setToolMode]     = useState<ToolMode>('all')
  const historyRef = useRef<Scene[]>([emptyScene()])
  const historyIdxRef = useRef<number>(0)
  const [resetViewKey,setResetViewKey] = useState(0)
  const [showWireframe,setShowWireframe] = useState(false)
  const [showEdges,setShowEdges]         = useState(true)
  const [gridSettings,setGridSettings] = useState<GridSettings>({
    visible:true,size:20,divisions:20,snap:false,snapSize:0.5
  })

  const selectedId = selectedIds.size===1?[...selectedIds][0]:null
  const selectedObj= selectedId?scene.objects.find(o=>o.id===selectedId)??null:null

  // Push scene to history and update
  function pushHistory(newScene:Scene){
    const h=historyRef.current
    const idx=historyIdxRef.current
    // Discard any redo future
    historyRef.current=[...h.slice(0,idx+1),newScene].slice(-50) // max 50 steps
    historyIdxRef.current=historyRef.current.length-1
  }

  function addOrUpdateObject(id:string,partial:Partial<BuildObject>){
    setScene(prev=>{
      const ex=prev.objects.find(o=>o.id===id)
      const next=ex
        ?{...prev,objects:prev.objects.map(o=>o.id===id?{...o,...partial}:o)}
        :{...prev,objects:[...prev.objects,{rx:0,ry:0,rz:0,...partial,id} as BuildObject]}
      pushHistory(next)
      return next
    })
    setIsDirty(true)
  }

  function deleteSelected(){
    if(selectedIds.size===0) return
    setScene(prev=>{
      const next={...prev,objects:prev.objects.filter(o=>!selectedIds.has(o.id))}
      pushHistory(next); return next
    })
    setSelectedIds(new Set()); setIsDirty(true)
  }

  function duplicateSelected(){
    if(selectedIds.size===0) return
    const news:BuildObject[]=[]
    selectedIds.forEach(id=>{
      const o=scene.objects.find(x=>x.id===id)
      if(o) news.push({...o,id:newId(),x:o.x+0.5,z:o.z+0.5})
    })
    setScene(prev=>({...prev,objects:[...prev.objects,...news]}))
    setSelectedIds(new Set(news.map(o=>o.id))); setIsDirty(true)
  }

  // ── CSG helpers ───────────────────────────────────────────────────────────
  function buildGeoForObj(obj:BuildObject):any {
    if(obj.label?.startsWith('CSG:')){
      try{
        const {pos,norm,idx}=JSON.parse(obj.label.slice(4))
        const geo=new THREE.BufferGeometry()
        geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3))
        if(norm.length>0) geo.setAttribute('normal',new THREE.Float32BufferAttribute(norm,3))
        if(idx.length>0)  geo.setIndex(new THREE.Uint32BufferAttribute(idx,1))
        if(norm.length===0) geo.computeVertexNormals()
        return geo
      }catch{}
    }
    switch(obj.type){
      case 'sphere':   return new THREE.SphereGeometry(obj.width/2, obj.radialSegments??32, 16)
      case 'cylinder': return new THREE.CylinderGeometry(obj.width/2, obj.width/2, obj.height, obj.radialSegments??32)
      case 'cone':     return new THREE.ConeGeometry(obj.width/2, obj.height, obj.radialSegments??32)
      case 'pyramid':  return new THREE.ConeGeometry(obj.width/2, obj.height, 4)
      default:         return new THREE.BoxGeometry(obj.width, obj.height, obj.depth)
    }
  }

  async function mergeSelected(){
    if(selectedIds.size<2) return
    const selObjs=scene.objects.filter(o=>selectedIds.has(o.id))
    const baseColor=selObjs.find(o=>!o.isHole)?.color??selObjs[0].color
    const snapshot=JSON.stringify(selObjs)  // for split restoration

    // Load CSG library
    let Evaluator:any, SUBTRACTION:any, ADDITION:any, Brush:any
    try {
      const mod = await import('three-bvh-csg')
      Evaluator = mod.Evaluator; SUBTRACTION = mod.SUBTRACTION
      ADDITION  = mod.ADDITION;  Brush = mod.Brush
    } catch(e) {
      alert('CSG knihovna se nepodařila načíst.'); return
    }

    function makeBrush(obj:BuildObject):any {
      const geo=buildGeoForObj(obj)
      const b = new Brush(geo, new THREE.MeshStandardMaterial())
      if(obj.label?.startsWith('CSG:')){
        // CSG geometry is world-space; apply offset/scale/rotation only
        b.position.set(obj.x, obj.y, obj.z)
        if(obj.scaleX!=null) b.scale.set(obj.scaleX, obj.scaleY??1, obj.scaleZ??1)
        b.rotation.set((obj.rx||0)*Math.PI/180, (obj.ry||0)*Math.PI/180, (obj.rz||0)*Math.PI/180)
      } else {
        b.position.set(obj.x, obj.y + obj.height/2, obj.z)
        b.rotation.set((obj.rx||0)*Math.PI/180, (obj.ry||0)*Math.PI/180, (obj.rz||0)*Math.PI/180)
      }
      b.updateMatrixWorld(true)
      return b
    }

    const evaluator = new Evaluator()
    const holes  = selObjs.filter(o=>o.isHole)
    const solids = selObjs.filter(o=>!o.isHole)

    // Step 1: UNION all solids into one brush
    let resultBrush:any = makeBrush(solids[0])
    for(let i=1;i<solids.length;i++){
      try { resultBrush = evaluator.evaluate(resultBrush, makeBrush(solids[i]), ADDITION) }
      catch(e){ console.warn('CSG union failed',e) }
    }

    // Step 2: SUBTRACT all holes
    for(const hole of holes){
      try { resultBrush = evaluator.evaluate(resultBrush, makeBrush(hole), SUBTRACTION) }
      catch(e){ console.warn('CSG subtract failed',e) }
    }

    // Bake world transform into geometry vertices
    resultBrush.updateMatrixWorld(true)
    const finalGeo = resultBrush.geometry.clone()
    finalGeo.applyMatrix4(resultBrush.matrixWorld)
    if(!finalGeo.attributes.normal) finalGeo.computeVertexNormals()

    // Serialize geometry
    const pos  = Array.from(finalGeo.attributes.position.array as Float32Array)
    const norm = finalGeo.attributes.normal ? Array.from(finalGeo.attributes.normal.array as Float32Array) : []
    const idx  = finalGeo.index ? Array.from(finalGeo.index.array as Uint32Array) : []
    const geoData = JSON.stringify({pos,norm,idx})

    // Compute bounding box center for position reference
    finalGeo.computeBoundingBox()
    const bb = finalGeo.boundingBox!
    const cx=(bb.min.x+bb.max.x)/2, cy=bb.min.y, cz=(bb.min.z+bb.max.z)/2
    const bw=bb.max.x-bb.min.x, bh=bb.max.y-bb.min.y, bd=bb.max.z-bb.min.z

    // Single result object — no group, no marker, no complexity
    // csgGeo field holds the serialized geometry, position is at bounding box center
    const resultId = newId()
    const resultObj: BuildObject = {
      id:resultId, type:'box' as ShapeType,
      x:cx, y:cy, z:cz,
      rx:0, ry:0, rz:0,
      width:bw, height:bh, depth:bd,
      color:baseColor, isHole:false,
      label:'CSG:'+geoData,      // CSG: prefix = single result mesh
      csgSnapshot:'SNAP:'+snapshot,  // for split
      radialSegments:32,
    }

    setScene(prev=>{
      const next={...prev, objects:[
        ...prev.objects.filter(o=>!selectedIds.has(o.id)),
        resultObj,
      ]}
      pushHistory(next); return next
    })
    setSelectedIds(new Set([resultId])); setIsDirty(true)
  }

  function splitSelected(){
    if(!selectedObj) return
    // Only CSG result objects can be split
    const snap=selectedObj.csgSnapshot
    if(!snap?.startsWith('SNAP:')) return
    try{
      const originals:BuildObject[]=JSON.parse(snap.slice(5))
      setScene(prev=>{
        const next={...prev, objects:[
          ...prev.objects.filter(o=>o.id!==selectedObj.id),
          ...originals,
        ]}
        pushHistory(next); return next
      })
      setSelectedIds(new Set(originals.map(o=>o.id)))
      setIsDirty(true)
    }catch{}
  }

  function undo(){
    const idx=historyIdxRef.current
    if(idx<=0) return
    historyIdxRef.current=idx-1
    setScene(historyRef.current[historyIdxRef.current])
    setSelectedIds(new Set())
  }
  function redo(){
    const idx=historyIdxRef.current
    if(idx>=historyRef.current.length-1) return
    historyIdxRef.current=idx+1
    setScene(historyRef.current[historyIdxRef.current])
    setSelectedIds(new Set())
  }

  function handleSelect(id:string|null,add=false){
    if(!id){setSelectedIds(new Set());return}
    if(add){setSelectedIds(prev=>{const n=new Set(prev);n.has(id)?n.delete(id):n.add(id);return n})}
    else{setSelectedIds(new Set([id]))}
    if(id) setRightTab('settings')
  }
  function handleMultiSelect(ids:string[]){
    setSelectedIds(new Set(ids))
    if(ids.length===1) setRightTab('settings')
  }

  // ── Files ──────────────────────────────────────────────────────────────────
  const [projects,setProjects]  = useState<{name:string;files:{path:string;name:string;project:string}[]}[]>([])
  const [activeFile,setActiveFile] = useState<{path:string;name:string;project:string}|null>(null)
  const [activeProject,setActiveProject] = useState('')
  const [saving,setSaving]      = useState(false)
  const [saveMsg,setSaveMsg]    = useState('')
  const [loadingProj,setLoadingProj] = useState(true)
  const [expanded,setExpanded]  = useState<Set<string>>(new Set())
  const [newProjModal,setNewProjModal] = useState(false)
  const [newProjName,setNewProjName]   = useState('')
  const [newFileModal,setNewFileModal] = useState(false)
  const [newFileName,setNewFileName]   = useState('')
  const [newFileProj,setNewFileProj]   = useState('')
  const [renamingId,setRenamingId]     = useState<string|null>(null)
  const [renameVal,setRenameVal]       = useState('')
  const [renamingProj,setRenamingProj] = useState<string|null>(null)
  const [renameProjVal,setRenameProjVal] = useState('')
  const [rightTab,setRightTab]  = useState<'shapes'|'settings'>('shapes')

  async function push(path:string,content:string){
    const blob=new Blob([content],{type:'application/json'})
    await supabase.storage.from(BUCKET).remove([path])
    await supabase.storage.from(BUCKET).upload(path,blob,{contentType:'application/json',cacheControl:'0'})
  }
  async function fetchContent(path:string){
    const {data}=await supabase.storage.from(BUCKET).download(path+'?t='+Date.now())
    return data?await data.text():'{}'
  }

  const refreshProjects=useCallback(async()=>{
    setLoadingProj(true)
    try{
      const {data}=await supabase.storage.from(BUCKET).list(`zaci/${uid}`,{limit:100})
      const projs:typeof projects=[]
      for(const item of data??[]){
        if(item.id===null){
          const {data:files}=await supabase.storage.from(BUCKET).list(`zaci/${uid}/${item.name}`,{limit:100})
          projs.push({name:item.name,files:(files??[]).filter(f=>f.name.endsWith('.json')&&f.id!==null).map(f=>({
            path:`zaci/${uid}/${item.name}/${f.name}`,name:f.name,project:item.name
          }))})
        }
      }
      setProjects(projs); return projs
    }finally{setLoadingProj(false)}
  },[uid])

  useEffect(()=>{
    (async()=>{
      const projs=await refreshProjects()
      const last=localStorage.getItem(LS_LAST)
      if(last){ for(const p of projs){ const f=p.files.find(x=>x.path===last); if(f){await openFile(f);return} } }
    })()
  },[])

  async function openFile(f:{path:string;name:string;project:string}){
    try{ const sc:Scene=JSON.parse(await fetchContent(f.path)); setScene(sc??emptyScene()) }catch{ setScene(emptyScene()) }
    setActiveFile(f); setActiveProject(f.project); setSelectedIds(new Set()); setIsDirty(false)
    setExpanded(prev=>new Set([...prev,f.project])); localStorage.setItem(LS_LAST,f.path)
  }

  async function save(){
    if(!activeFile) return; setSaving(true)
    await push(activeFile.path,JSON.stringify(scene,null,2))
    setIsDirty(false); setSaveMsg('✓ Uloženo'); setTimeout(()=>setSaveMsg(''),2000); setSaving(false)
  }

  async function doCreateProject(){
    if(!newProjName.trim()) return
    const k=sanitize(newProjName.trim())
    await push(fp(uid,k,'scene.json'),JSON.stringify(emptyScene()))
    const projs=await refreshProjects()
    const f=projs.find(x=>x.name===k)?.files[0]; if(f) await openFile(f)
    setNewProjModal(false); setNewProjName('')
  }

  async function doCreateFile(){
    if(!newFileName.trim()) return
    const proj=newFileProj||activeProject; if(!proj) return
    let name=newFileName.trim(); if(!name.endsWith('.json')) name+='.json'
    const path=fp(uid,proj,name)
    await push(path,JSON.stringify(emptyScene()))
    const projs=await refreshProjects()
    const f=projs.find(x=>x.name===proj)?.files.find(x=>x.path===path); if(f) await openFile(f)
    setNewFileModal(false); setNewFileName(''); setNewFileProj('')
  }

  async function deleteFile(f:{path:string;name:string;project:string}){
    await supabase.storage.from(BUCKET).remove([f.path])
    if(activeFile?.path===f.path){setActiveFile(null);setScene(emptyScene())}
    await refreshProjects()
  }

  useEffect(()=>{
    function onKey(e:KeyboardEvent){
      if((e.ctrlKey||e.metaKey)&&e.key==='s'){e.preventDefault();save()}
      if((e.key==='Delete'||e.key==='Backspace')&&document.activeElement===document.body) deleteSelected()
      if((e.ctrlKey||e.metaKey)&&e.key==='d'){e.preventDefault();duplicateSelected()}
      if((e.ctrlKey||e.metaKey)&&e.key==='z'&&!e.shiftKey){e.preventDefault();undo()}
      if((e.ctrlKey||e.metaKey)&&(e.key==='y'||(e.key==='z'&&e.shiftKey))){e.preventDefault();redo()}
    }
    window.addEventListener('keydown',onKey)
    return()=>window.removeEventListener('keydown',onKey)
  },[selectedIds,scene,activeFile])

  // ── Styles ─────────────────────────────────────────────────────────────────
  const sideBtn:React.CSSProperties={display:'flex',alignItems:'center',gap:8,padding:'7px 10px',
    background:'rgba(255,255,255,.04)',border:`1px solid ${D.border}`,borderRadius:7,
    color:D.txtSec,fontSize:11,cursor:'pointer',fontFamily:'inherit',width:'100%',
    textAlign:'left' as const,transition:'all .15s'}
  const inpStyle:React.CSSProperties={width:'100%',padding:'9px 12px',background:D.bgMid,
    border:`1px solid ${D.border}`,borderRadius:8,fontSize:13,color:D.txtPri,
    fontFamily:'inherit',outline:'none',boxSizing:'border-box' as const,marginBottom:12}

  function Modal({title,onClose,children}:{title:string;onClose:()=>void;children:React.ReactNode}){
    return(
      <>
        <div onClick={onClose} style={{position:'fixed',inset:0,background:'rgba(0,0,0,.72)',zIndex:9998,backdropFilter:'blur(5px)'}}/>
        <div style={{position:'fixed',top:'50%',left:'50%',transform:'translate(-50%,-50%)',zIndex:9999,width:'100%',maxWidth:380,padding:'0 16px'}}>
          <div style={{background:D.bgCard,borderRadius:12,padding:'24px',border:`1px solid ${D.border}`,boxShadow:'0 28px 70px rgba(0,0,0,.75)'}}>
            <div style={{fontSize:16,fontWeight:800,color:D.txtPri,marginBottom:14}}>{title}</div>
            {children}
          </div>
        </div>
      </>
    )
  }

  const tools:[ToolMode,string,string][]=[
    ['all','✦','Vše'],['select','↖','Výběr'],['move','✥','Přesun'],['rotate','↻','Rotace'],['scale','⤢','Měřítko']
  ]

  return (
    <DarkLayout profile={profile} activeRoute="/student/builder" fullContent>

      {newProjModal&&(
        <Modal title="📦 Nový projekt" onClose={()=>setNewProjModal(false)}>
          <input value={newProjName} onChange={e=>setNewProjName(e.target.value)}
            onKeyDown={e=>e.key==='Enter'&&newProjName.trim()&&doCreateProject()}
            autoFocus placeholder="Název projektu" style={inpStyle}/>
          <div style={{display:'flex',gap:8}}>
            <button onClick={doCreateProject} disabled={!newProjName.trim()}
              style={{flex:1,padding:'9px',background:!newProjName.trim()?D.bgMid:accent,color:!newProjName.trim()?D.txtSec:'#fff',border:'none',borderRadius:8,fontSize:13,fontWeight:600,cursor:!newProjName.trim()?'not-allowed':'pointer',fontFamily:'inherit'}}>Vytvořit</button>
            <button onClick={()=>setNewProjModal(false)} style={{padding:'9px 14px',background:D.bgMid,color:D.txtSec,border:`1px solid ${D.border}`,borderRadius:8,cursor:'pointer',fontFamily:'inherit'}}>Zrušit</button>
          </div>
        </Modal>
      )}
      {newFileModal&&(
        <Modal title="📄 Nový soubor" onClose={()=>setNewFileModal(false)}>
          <div style={{marginBottom:6,fontSize:11,color:D.txtSec}}>Projekt</div>
          <select value={newFileProj||(projects[0]?.name??'')} onChange={e=>setNewFileProj(e.target.value)}
            style={{width:'100%',padding:'8px 10px',background:D.bgMid,border:`1px solid ${D.border}`,borderRadius:7,fontSize:12,color:D.txtPri,fontFamily:'inherit',outline:'none',marginBottom:12}}>
            {projects.map(p=><option key={p.name} value={p.name}>{p.name}</option>)}
          </select>
          <div style={{marginBottom:6,fontSize:11,color:D.txtSec}}>Název souboru</div>
          <input value={newFileName} onChange={e=>setNewFileName(e.target.value)}
            onKeyDown={e=>e.key==='Enter'&&newFileName.trim()&&doCreateFile()}
            autoFocus placeholder="scene.json" style={inpStyle}/>
          <div style={{display:'flex',gap:8}}>
            <button onClick={doCreateFile} disabled={!newFileName.trim()}
              style={{flex:1,padding:'9px',background:!newFileName.trim()?D.bgMid:accent,color:!newFileName.trim()?D.txtSec:'#fff',border:'none',borderRadius:8,fontSize:13,fontWeight:600,cursor:!newFileName.trim()?'not-allowed':'pointer',fontFamily:'inherit'}}>Vytvořit</button>
            <button onClick={()=>setNewFileModal(false)} style={{padding:'9px 14px',background:D.bgMid,color:D.txtSec,border:`1px solid ${D.border}`,borderRadius:8,cursor:'pointer',fontFamily:'inherit'}}>Zrušit</button>
          </div>
        </Modal>
      )}

      <style>{`
        .b-sb:hover{background:rgba(255,255,255,.08)!important;color:#fff!important}
        .b-row{transition:background .12s}
        .b-row:hover{background:rgba(255,255,255,.05)!important}
        .b-row:hover .b-acts{opacity:1!important}
        @keyframes spin{to{transform:rotate(360deg)}}
      `}</style>

      {assignmentId&&<AssignmentPanel assignmentId={assignmentId} studentId={uid} accent={accent}/>}
      <div style={{display:'flex',flex:1,minHeight:0,overflow:'hidden'}}>

        {/* ══ LEFT ══ */}
        <div style={{width:210,flexShrink:0,borderRight:`1px solid ${D.border}`,background:D.bgCard,display:'flex',flexDirection:'column',overflow:'hidden'}}>
          <div style={{padding:'12px 12px 10px',borderBottom:`1px solid ${D.border}`,flexShrink:0}}>
            <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:8}}>
              <div style={{width:28,height:28,borderRadius:7,background:accent+'30',border:`1px solid ${accent}50`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:15}}>🧱</div>
              <div>
                <div style={{fontSize:12,fontWeight:700,color:D.txtPri,lineHeight:1.2}}>3DBuilder</div>
                <div style={{fontSize:9,color:D.txtSec,lineHeight:1.2}}>by Jakub Krejčí</div>
              </div>
              {isDirty&&<span style={{fontSize:9,color:D.warning,marginLeft:'auto'}}>● neuloženo</span>}
            </div>
            <div style={{display:'flex',flexDirection:'column',gap:4}}>
              <button className="b-sb" style={sideBtn} onClick={()=>setNewProjModal(true)}><span>📁</span> Nový projekt</button>
              <button className="b-sb" style={sideBtn} onClick={()=>setNewFileModal(true)} disabled={!activeProject}><span>📄</span> Nový soubor</button>
              <div style={{height:1,background:D.border,margin:'2px 0'}}/>
              <button className="b-sb" style={{...sideBtn,opacity:!activeFile||saving?.4:1}} disabled={!activeFile||saving} onClick={save}><span>💾</span>{saving?'Ukládám…':'Uložit'}</button>
            </div>
          </div>

          <div style={{flex:1,overflowY:'auto',padding:'6px 0'}}>
            <div style={{padding:'5px 12px 3px',fontSize:10,fontWeight:700,color:D.txtSec,textTransform:'uppercase',letterSpacing:'.06em'}}>Moje projekty</div>
            {loadingProj
              ?<div style={{fontSize:11,color:D.txtSec,padding:'8px 12px',display:'flex',alignItems:'center',gap:6}}><div style={{width:11,height:11,border:`2px solid ${D.border}`,borderTopColor:accent,borderRadius:'50%',animation:'spin .6s linear infinite'}}/> Načítám…</div>
              :projects.length===0
                ?<div style={{fontSize:11,color:D.txtSec,padding:'4px 12px'}}>Žádné projekty</div>
                :projects.map(proj=>(
                  <div key={proj.name}>
                    <div className="b-row" onClick={()=>setExpanded(prev=>{const n=new Set(prev);n.has(proj.name)?n.delete(proj.name):n.add(proj.name);return n})}
                      style={{display:'flex',alignItems:'center',gap:5,padding:'4px 12px',cursor:'pointer',background:proj.name===activeProject?accent+'10':'transparent'}}>
                      <span style={{fontSize:9,color:D.txtSec,display:'inline-block',transition:'transform .15s',transform:expanded.has(proj.name)?'rotate(90deg)':'none'}}>▶</span>
                      <span style={{fontSize:12}}>📁</span>
                      {renamingProj===proj.name?(
                        <input value={renameProjVal} autoFocus
                          onChange={e=>setRenameProjVal(e.target.value)}
                          onKeyDown={async e=>{
                            if(e.key==='Enter'){
                              if(renameProjVal.trim()&&renameProjVal!==proj.name){
                                const newN=sanitize(renameProjVal.trim())
                                for(const f of proj.files){
                                  const np=`zaci/${uid}/${newN}/${f.name}`
                                  await push(np,await fetchContent(f.path))
                                  await supabase.storage.from(BUCKET).remove([f.path])
                                  if(activeFile?.path===f.path) setActiveFile({...f,path:np,project:newN})
                                }
                                if(activeProject===proj.name) setActiveProject(newN)
                                await refreshProjects()
                              }
                              setRenamingProj(null)
                            }
                            if(e.key==='Escape') setRenamingProj(null)
                          }}
                          onBlur={()=>setRenamingProj(null)}
                          style={{flex:1,padding:'2px 5px',background:D.bgMid,border:`1px solid ${accent}`,borderRadius:4,fontSize:11,color:D.txtPri,fontFamily:'inherit',outline:'none'}}
                          onClick={e=>e.stopPropagation()}/>
                      ):(
                        <span style={{fontSize:11,fontWeight:600,color:proj.name===activeProject?accent:D.txtPri,flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{proj.name}</span>
                      )}
                      <div className="b-acts" style={{display:'flex',gap:1,opacity:0}}>
                        <button onClick={e=>{e.stopPropagation();setRenamingProj(proj.name);setRenameProjVal(proj.name)}} style={{padding:'1px 4px',background:'none',border:'none',cursor:'pointer',color:D.txtSec,fontSize:10}}>✏</button>
                      </div>
                    </div>
                    {expanded.has(proj.name)&&proj.files.map(f=>(
                      <div key={f.path} className="b-row"
                        style={{display:'flex',alignItems:'center',gap:5,padding:'3px 12px 3px 26px',cursor:'pointer',background:f.path===activeFile?.path?accent+'18':'transparent',borderLeft:f.path===activeFile?.path?`2px solid ${accent}`:'2px solid transparent'}}>
                        {renamingId===f.path?(
                          <input value={renameVal} autoFocus onChange={e=>setRenameVal(e.target.value)}
                            onKeyDown={async e=>{
                              if(e.key==='Enter'){
                                const trimmed=renameVal.trim()
                                if(trimmed&&trimmed!==f.name.replace(/\.json$/,'')){
                                  let nn=trimmed; if(!nn.endsWith('.json')) nn+='.json'
                                  const np=fp(uid,f.project,nn)
                                  await push(np,await fetchContent(f.path))
                                  await supabase.storage.from(BUCKET).remove([f.path])
                                  if(activeFile?.path===f.path) setActiveFile({...f,path:np,name:nn})
                                  await refreshProjects()
                                }
                                setRenamingId(null)
                              }
                              if(e.key==='Escape') setRenamingId(null)
                            }}
                            onBlur={()=>setRenamingId(null)}
                            style={{flex:1,padding:'2px 5px',background:D.bgMid,border:`1px solid ${accent}`,borderRadius:4,fontSize:10,color:D.txtPri,fontFamily:'inherit',outline:'none'}}
                            onClick={e=>e.stopPropagation()}/>
                        ):(
                          <>
                            <span style={{fontSize:10}}>📐</span>
                            <span onClick={()=>openFile(f)} style={{fontSize:10,color:f.path===activeFile?.path?accent:D.txtSec,flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{f.name}</span>
                            <div className="b-acts" style={{display:'flex',gap:1,opacity:0}}>
                              <button onClick={e=>{e.stopPropagation();setRenamingId(f.path);setRenameVal(f.name.replace(/\.json$/,''))}} style={{padding:'1px 4px',background:'none',border:'none',cursor:'pointer',color:D.txtSec,fontSize:10}}>✏</button>
                              <button onClick={e=>{e.stopPropagation();deleteFile(f)}} style={{padding:'1px 4px',background:'none',border:'none',cursor:'pointer',color:D.danger,fontSize:10}}>🗑</button>
                            </div>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                ))
            }
          </div>
          {saveMsg&&<div style={{padding:'6px 12px',borderTop:`1px solid ${D.border}`,fontSize:11,color:D.success,flexShrink:0}}>{saveMsg}</div>}
        </div>

        {/* ══ CENTER ══ */}
        <div style={{flex:1,display:'flex',flexDirection:'column',minWidth:0}}>

          {/* Toolbar */}
          <div style={{display:'flex',alignItems:'center',gap:5,padding:'6px 10px',borderBottom:`1px solid ${D.border}`,flexShrink:0,flexWrap:'wrap' as const}}>
            {/* Tool modes */}
            <div style={{display:'flex',gap:2,background:D.bgMid,borderRadius:7,padding:2,border:`1px solid ${D.border}`}}>
              {tools.map(([id,icon,label])=>(
                <button key={id} onClick={()=>setToolMode(id)} title={label}
                  style={{padding:'4px 10px',borderRadius:5,border:'none',cursor:'pointer',fontFamily:'inherit',fontSize:13,
                    background:toolMode===id?accent:'transparent',color:toolMode===id?'#fff':D.txtSec,transition:'all .12s'}}>
                  {icon}
                </button>
              ))}
            </div>
            <div style={{width:1,height:20,background:D.border}}/>
            <button onClick={()=>mergeSelected()} disabled={selectedIds.size<2}
              style={{padding:'4px 9px',background:'rgba(255,255,255,.04)',color:selectedIds.size>=2?D.txtPri:D.txtSec,border:`1px solid ${D.border}`,borderRadius:6,fontSize:11,cursor:selectedIds.size>=2?'pointer':'not-allowed',fontFamily:'inherit',opacity:selectedIds.size<2?.4:1}}
              title="Sloučit vybrané (min. 2)">🔗 Sloučit</button>
            <button onClick={splitSelected} disabled={!selectedObj?.csgSnapshot}
              style={{padding:'4px 9px',background:'rgba(255,255,255,.04)',color:D.txtSec,border:`1px solid ${D.border}`,borderRadius:6,fontSize:11,cursor:selectedObj?.csgSnapshot?'pointer':'not-allowed',fontFamily:'inherit',opacity:!selectedObj?.csgSnapshot?.4:1}}
              title="Rozdělit CSG objekt">✂ Rozdělit</button>
            <button onClick={duplicateSelected} disabled={selectedIds.size===0}
              style={{padding:'4px 9px',background:'rgba(255,255,255,.04)',color:D.txtSec,border:`1px solid ${D.border}`,borderRadius:6,fontSize:11,cursor:selectedIds.size>0?'pointer':'not-allowed',fontFamily:'inherit',opacity:selectedIds.size===0?.4:1}}
              title="Duplikovat (Ctrl+D)">⧉ Duplikovat</button>
            <button onClick={deleteSelected} disabled={selectedIds.size===0}
              style={{padding:'4px 9px',background:selectedIds.size>0?D.danger+'15':'transparent',color:selectedIds.size>0?D.danger:D.txtSec,border:`1px solid ${selectedIds.size>0?D.danger+'40':D.border}`,borderRadius:6,fontSize:11,cursor:selectedIds.size>0?'pointer':'not-allowed',fontFamily:'inherit',opacity:selectedIds.size===0?.4:1}}
              title="Smazat (Del)">🗑 Smazat</button>
            <div style={{width:1,height:20,background:D.border}}/>
            <button onClick={()=>setShowWireframe(p=>!p)}
              style={{padding:'4px 9px',background:showWireframe?accent+'20':'rgba(255,255,255,.04)',color:showWireframe?accent:D.txtSec,border:`1px solid ${showWireframe?accent+'50':D.border}`,borderRadius:6,fontSize:11,cursor:'pointer',fontFamily:'inherit'}}
              title={showWireframe?'Wireframe ZAP — klikni pro hladký povrch':'Wireframe VYP — klikni pro drátěný model'}>
              ⬡ {showWireframe?'Wireframe':'Hladký'}
            </button>
            <button onClick={()=>setShowEdges(p=>!p)}
              style={{padding:'4px 9px',background:showEdges?accent+'20':'rgba(255,255,255,.04)',color:showEdges?accent:D.txtSec,border:`1px solid ${showEdges?accent+'50':D.border}`,borderRadius:6,fontSize:11,cursor:'pointer',fontFamily:'inherit'}}
              title="Zvýraznění hran objektů">
              ⬡ Hrany
            </button>
            <button onClick={()=>setGridSettings(p=>({...p,visible:!p.visible}))}
              style={{padding:'4px 9px',background:gridSettings.visible?accent+'20':'rgba(255,255,255,.04)',color:gridSettings.visible?accent:D.txtSec,border:`1px solid ${gridSettings.visible?accent+'50':D.border}`,borderRadius:6,fontSize:11,cursor:'pointer',fontFamily:'inherit'}}>
              ⊞ Mřížka
            </button>
            <button onClick={()=>setGridSettings(p=>({...p,snap:!p.snap}))}
              style={{padding:'4px 9px',background:gridSettings.snap?'#22c55e20':'rgba(255,255,255,.04)',color:gridSettings.snap?'#22c55e':D.txtSec,border:`1px solid ${gridSettings.snap?'#22c55e50':D.border}`,borderRadius:6,fontSize:11,cursor:'pointer',fontFamily:'inherit'}}>
              🧲 Snap{gridSettings.snap?` ${gridSettings.snapSize}`:''}
            </button>
            <div style={{flex:1}}/>
            <button onClick={undo} title="Zpět (Ctrl+Z)"
              style={{padding:'4px 9px',background:'rgba(255,255,255,.04)',color:historyIdxRef.current>0?D.txtPri:D.txtSec,border:`1px solid ${D.border}`,borderRadius:6,fontSize:11,cursor:'pointer',fontFamily:'inherit',opacity:historyIdxRef.current>0?1:.4}}>
              ↩ Zpět
            </button>
            <button onClick={redo} title="Dopředu (Ctrl+Y)"
              style={{padding:'4px 9px',background:'rgba(255,255,255,.04)',color:historyIdxRef.current<historyRef.current.length-1?D.txtPri:D.txtSec,border:`1px solid ${D.border}`,borderRadius:6,fontSize:11,cursor:'pointer',fontFamily:'inherit',opacity:historyIdxRef.current<historyRef.current.length-1?1:.4}}>
              ↪ Dopředu
            </button>
            <button onClick={()=>setResetViewKey(p=>p+1)}
              style={{padding:'4px 9px',background:'rgba(255,255,255,.04)',color:D.txtSec,border:`1px solid ${D.border}`,borderRadius:6,fontSize:11,cursor:'pointer',fontFamily:'inherit'}}
              title="Reset pohledu na výchozí">⌂ Reset pohledu</button>
          </div>

          {/* Status */}
          <div style={{padding:'3px 10px',borderBottom:`1px solid ${D.border}`,fontSize:10,color:D.txtSec,flexShrink:0,display:'flex',gap:12}}>
            <span>{scene.objects.length} obj.</span>
            {selectedIds.size>0&&<span style={{color:accent}}>Vybráno: {selectedIds.size}</span>}
            {selectedObj&&<span>W:{selectedObj.width.toFixed(1)} H:{selectedObj.height.toFixed(1)} D:{selectedObj.depth.toFixed(1)} | rx:{selectedObj.rx.toFixed(0)}° ry:{selectedObj.ry.toFixed(0)}° rz:{selectedObj.rz.toFixed(0)}°</span>}
            <span style={{marginLeft:'auto',opacity:.4}}>🖱 Pravé tl. = otočení · Kolečko = zoom · Přetáhni tvary z panelu vpravo</span>
          </div>

          {/* Viewport */}
          <div style={{flex:1,position:'relative',overflow:'hidden'}}>
            {!threeLoaded?(
              <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100%',flexDirection:'column',gap:12,color:D.txtSec}}>
                <div style={{width:32,height:32,border:'3px solid rgba(255,255,255,.1)',borderTopColor:accent,borderRadius:'50%',animation:'spin .8s linear infinite'}}/>
                <span style={{fontSize:13}}>Načítám 3D engine…</span>
              </div>
            ):(
              <ThreeViewport
                scene={scene} selectedIds={selectedIds} toolMode={toolMode}
                gridSettings={gridSettings} showWireframe={showWireframe} showEdges={showEdges}
                onSelect={handleSelect} onMultiSelect={handleMultiSelect}
                onUpdateObject={addOrUpdateObject} accent={accent} resetViewKey={resetViewKey}
              />
            )}
            {scene.objects.length===0&&threeLoaded&&(
              <div style={{position:'absolute',top:'50%',left:'50%',transform:'translate(-50%,-50%)',textAlign:'center' as const,pointerEvents:'none'}}>
                <div style={{fontSize:44,marginBottom:10,opacity:.12}}>🧱</div>
                <div style={{fontSize:14,color:'rgba(255,255,255,.18)',fontWeight:600}}>Přetáhni tvar z pravého panelu</div>
                <div style={{fontSize:11,color:'rgba(255,255,255,.1)',marginTop:4}}>nebo vytvoř nový projekt</div>
              </div>
            )}
          </div>

          {/* Grid settings footer */}
          {gridSettings.visible&&(
            <div style={{display:'flex',alignItems:'center',gap:10,padding:'4px 10px',borderTop:`1px solid ${D.border}`,flexShrink:0,fontSize:10,color:D.txtSec,flexWrap:'wrap' as const}}>
              <span style={{fontWeight:600}}>Mřížka:</span>
              <label style={{display:'flex',alignItems:'center',gap:4}}>Velikost
                <input type="number" value={gridSettings.size} min={5} max={200} step={5}
                  onChange={e=>setGridSettings(p=>({...p,size:Number(e.target.value)}))}
                  style={{width:48,padding:'2px 5px',background:D.bgMid,border:`1px solid ${D.border}`,borderRadius:4,fontSize:10,color:D.txtPri,outline:'none',fontFamily:'monospace'}}/>
              </label>
              <label style={{display:'flex',alignItems:'center',gap:4}}>Dílky
                <input type="number" value={gridSettings.divisions} min={5} max={100} step={5}
                  onChange={e=>setGridSettings(p=>({...p,divisions:Number(e.target.value)}))}
                  style={{width:48,padding:'2px 5px',background:D.bgMid,border:`1px solid ${D.border}`,borderRadius:4,fontSize:10,color:D.txtPri,outline:'none',fontFamily:'monospace'}}/>
              </label>
              {gridSettings.snap&&(
                <label style={{display:'flex',alignItems:'center',gap:4}}>Krok
                  <input type="number" value={gridSettings.snapSize} min={0.1} max={5} step={0.1}
                    onChange={e=>setGridSettings(p=>({...p,snapSize:Number(e.target.value)}))}
                    style={{width:48,padding:'2px 5px',background:D.bgMid,border:`1px solid ${D.border}`,borderRadius:4,fontSize:10,color:D.txtPri,outline:'none',fontFamily:'monospace'}}/>
                </label>
              )}
            </div>
          )}
        </div>

        {/* ══ RIGHT ══ */}
        <div style={{width:255,flexShrink:0,borderLeft:`1px solid ${D.border}`,background:D.bgCard,display:'flex',flexDirection:'column',overflow:'hidden'}}>
          <div style={{display:'flex',borderBottom:`1px solid ${D.border}`,flexShrink:0}}>
            {(['shapes','settings'] as const).map(tab=>(
              <button key={tab} onClick={()=>setRightTab(tab)}
                style={{flex:1,padding:'8px 4px',background:rightTab===tab?D.bgMid:'transparent',border:'none',
                  borderBottom:`2px solid ${rightTab===tab?accent:'transparent'}`,cursor:'pointer',
                  fontFamily:'inherit',fontSize:11,fontWeight:600,color:rightTab===tab?D.txtPri:D.txtSec,
                  display:'flex',flexDirection:'column',alignItems:'center',gap:2}}>
                <span style={{fontSize:15}}>{tab==='shapes'?'🧱':'⚙️'}</span>
                {tab==='shapes'?'Tvary':'Nastavení'}
              </button>
            ))}
          </div>

          <div style={{flex:1,overflowY:'auto'}}>

            {/* ── Tvary ── */}
            {rightTab==='shapes'&&(
              <div style={{padding:'12px'}}>
                <div style={{fontSize:10,fontWeight:700,color:D.txtSec,textTransform:'uppercase',letterSpacing:'.06em',marginBottom:10}}>Přetáhni na plochu</div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:7,marginBottom:14}}>
                  <ShapeCard type="box"      label="Krychle" icon="🟥"/>
                  <ShapeCard type="sphere"   label="Koule"   icon="🔵"/>
                  <ShapeCard type="cylinder" label="Válec"   icon="🟫"/>
                  <ShapeCard type="cone"     label="Kužel"   icon="🔺"/>
                  <ShapeCard type="pyramid"  label="Jehlan"  icon="🔷"/>
                  <ShapeCard type="text"     label="Text"    icon="🔤"/>
                </div>
                <div style={{height:1,background:D.border,marginBottom:10}}/>
                <button onClick={()=>{setScene(emptyScene());setSelectedIds(new Set());setIsDirty(true)}}
                  style={{width:'100%',padding:'7px 10px',background:'rgba(239,68,68,.08)',color:D.danger,border:'1px solid rgba(239,68,68,.2)',borderRadius:7,fontSize:11,cursor:'pointer',fontFamily:'inherit',textAlign:'left' as const,marginBottom:12}}>
                  🗑 Vymazat vše
                </button>
                <div style={{height:1,background:D.border,marginBottom:10}}/>
                <div style={{fontSize:10,fontWeight:700,color:D.txtSec,textTransform:'uppercase',letterSpacing:'.06em',marginBottom:7}}>Objekty ({scene.objects.length})</div>
                {scene.objects.map((obj,i)=>(
                  <div key={obj.id} className="b-row" onClick={()=>handleSelect(obj.id,false)}
                    style={{display:'flex',alignItems:'center',gap:7,padding:'5px 8px',borderRadius:7,cursor:'pointer',background:selectedIds.has(obj.id)?accent+'15':'transparent',marginBottom:2,border:`1px solid ${selectedIds.has(obj.id)?accent+'30':'transparent'}`}}>
                    <div style={{width:12,height:12,borderRadius:3,background:obj.isHole?'transparent':obj.color,border:obj.isHole?`2px dashed ${obj.color}`:'none',flexShrink:0}}/>
                    <span style={{fontSize:10,color:selectedIds.has(obj.id)?accent:D.txtPri,flex:1}}>{obj.type} #{i+1}</span>
                    {obj.isHole&&<span style={{fontSize:9,color:'#3b82f6',background:'#3b82f620',padding:'1px 4px',borderRadius:3}}>díra</span>}
                    {obj.groupedIds?.length&&<span style={{fontSize:9,color:'#f59e0b',background:'#f59e0b20',padding:'1px 4px',borderRadius:3}}>group</span>}
                  </div>
                ))}
              </div>
            )}

            {/* ── Nastavení ── */}
            {rightTab==='settings'&&(
              <div style={{padding:'12px'}}>
                {!selectedObj?(
                  <div style={{color:D.txtSec,fontSize:11,textAlign:'center' as const,marginTop:24,lineHeight:1.8}}>
                    <div style={{fontSize:28,marginBottom:8}}>👆</div>
                    Klikni na objekt<br/>nebo přetáhni tvar
                  </div>
                ):(
                  <>
                    <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:12}}>
                      <div style={{width:16,height:16,borderRadius:4,background:selectedObj.color}}/>
                      <span style={{fontSize:12,fontWeight:700,color:D.txtPri}}>{selectedObj.type}</span>
                      <span style={{fontSize:9,color:D.txtSec,marginLeft:'auto'}}>#{selectedObj.id.slice(0,6)}</span>
                    </div>

                    {/* Position */}
                    <div style={{fontSize:10,fontWeight:700,color:D.txtSec,textTransform:'uppercase',letterSpacing:'.06em',marginBottom:5}}>Pozice</div>
                    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:5,marginBottom:11}}>
                      {(['x','y','z'] as const).map(ax=>(
                        <div key={ax}>
                          <div style={{fontSize:9,color:D.txtSec,textAlign:'center' as const,marginBottom:2}}>{ax.toUpperCase()}</div>
                          <input type="number" value={Number(selectedObj[ax].toFixed(2))} step={0.5}
                            onChange={e=>addOrUpdateObject(selectedObj.id,{[ax]:Number(e.target.value)})}
                            style={{width:'100%',padding:'5px 4px',background:D.bgMid,border:`1px solid ${D.border}`,borderRadius:6,fontSize:11,color:D.txtPri,fontFamily:'monospace',outline:'none',boxSizing:'border-box' as const,textAlign:'center' as const}}/>
                        </div>
                      ))}
                    </div>

                    {/* Rotation */}
                    <div style={{fontSize:10,fontWeight:700,color:D.txtSec,textTransform:'uppercase',letterSpacing:'.06em',marginBottom:5}}>Rotace (°)</div>
                    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:5,marginBottom:11}}>
                      {([['rx','#cc4444'],['ry','#44cc44'],['rz','#4444cc']] as const).map(([ax,col])=>(
                        <div key={ax}>
                          <div style={{fontSize:9,color:col,textAlign:'center' as const,marginBottom:2}}>{ax.toUpperCase()}</div>
                          <input type="number" value={Number(selectedObj[ax].toFixed(1))} step={15}
                            onChange={e=>addOrUpdateObject(selectedObj.id,{[ax]:Number(e.target.value)})}
                            style={{width:'100%',padding:'5px 4px',background:D.bgMid,border:`1px solid ${D.border}`,borderRadius:6,fontSize:11,color:D.txtPri,fontFamily:'monospace',outline:'none',boxSizing:'border-box' as const,textAlign:'center' as const}}/>
                        </div>
                      ))}
                    </div>

                    {/* Dimensions */}
                    <div style={{fontSize:10,fontWeight:700,color:D.txtSec,textTransform:'uppercase',letterSpacing:'.06em',marginBottom:6}}>Rozměry</div>
                    <NumSlider label="Šířka (W)" value={selectedObj.width} accent={accent} onChange={v=>addOrUpdateObject(selectedObj.id,{width:v})}/>
                    <NumSlider label="Výška (H)" value={selectedObj.height} accent={accent} onChange={v=>addOrUpdateObject(selectedObj.id,{height:v})}/>
                    {selectedObj.type!=='sphere'&&(
                      <NumSlider label="Hloubka (D)" value={selectedObj.depth} accent={accent} onChange={v=>addOrUpdateObject(selectedObj.id,{depth:v})}/>
                    )}
                    {['cylinder','cone'].includes(selectedObj.type)&&(
                      <NumSlider label="Segmenty" value={selectedObj.radialSegments??32} min={3} max={64} step={1} accent={accent} onChange={v=>addOrUpdateObject(selectedObj.id,{radialSegments:v})}/>
                    )}

                    {/* Color */}
                    <div style={{fontSize:10,fontWeight:700,color:D.txtSec,textTransform:'uppercase',letterSpacing:'.06em',margin:'12px 0 7px'}}>Barva</div>
                    <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:8}}>
                      <input type="color" value={selectedObj.color}
                        onChange={e=>addOrUpdateObject(selectedObj.id,{color:e.target.value})}
                        style={{width:44,height:36,border:'none',borderRadius:7,cursor:'pointer',flexShrink:0}}/>
                      <code style={{fontSize:11,color:D.txtSec}}>{selectedObj.color}</code>
                    </div>
                    <div style={{display:'flex',gap:5,flexWrap:'wrap' as const,marginBottom:12}}>
                      {['#e74c3c','#e67e22','#f1c40f','#2ecc71','#1abc9c','#3498db','#9b59b6','#ecf0f1','#95a5a6','#2c3e50'].map(c=>(
                        <div key={c} onClick={()=>addOrUpdateObject(selectedObj.id,{color:c})}
                          style={{width:22,height:22,borderRadius:5,background:c,cursor:'pointer',border:`2px solid ${selectedObj.color===c?'#fff':'transparent'}`}}/>
                      ))}
                    </div>

                    {/* Per-object wireframe */}
                    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}}>
                      <span style={{fontSize:11,color:D.txtSec}}>Viditelné hrany</span>
                      <button onClick={()=>addOrUpdateObject(selectedObj.id,{wireframe:!selectedObj.wireframe})}
                        style={{padding:'3px 10px',background:selectedObj.wireframe?accent+'20':D.bgMid,color:selectedObj.wireframe?accent:D.txtSec,border:`1px solid ${selectedObj.wireframe?accent+'50':D.border}`,borderRadius:6,fontSize:11,cursor:'pointer',fontFamily:'inherit'}}>
                        {selectedObj.wireframe?'ZAP':'VYP'}
                      </button>
                    </div>

                    {/* Hole */}
                    <button onClick={()=>addOrUpdateObject(selectedObj.id,{isHole:!selectedObj.isHole})}
                      style={{width:'100%',padding:'8px 10px',borderRadius:8,cursor:'pointer',fontFamily:'inherit',fontSize:11,fontWeight:600,border:'2px solid',background:selectedObj.isHole?'#3b82f620':'rgba(255,255,255,.04)',color:selectedObj.isHole?'#3b82f6':D.txtSec,borderColor:selectedObj.isHole?'#3b82f650':D.border,textAlign:'left' as const,display:'flex',alignItems:'center',gap:8,marginBottom:12}}>
                      <span style={{fontSize:15}}>{selectedObj.isHole?'⬜':'🟦'}</span>
                      <div>
                        <div>{selectedObj.isHole?'Díra (odečítá)':'Pevný objekt'}</div>
                        <div style={{fontSize:9,fontWeight:400,opacity:.6}}>{selectedObj.isHole?'Vyřeže z ostatních objektů':'Klikni pro změnu na díru'}</div>
                      </div>
                    </button>

                    <button onClick={deleteSelected}
                      style={{width:'100%',padding:'7px',background:D.danger+'12',color:D.danger,border:`1px solid ${D.danger}25`,borderRadius:7,cursor:'pointer',fontFamily:'inherit',fontSize:11,fontWeight:600}}>
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
