'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { DarkLayout, D } from '@/components/DarkLayout'

// ── Constants ─────────────────────────────────────────────────────────────────
const BUCKET       = 'flowchart-files'
const LS_LAST      = 'cb_flow_last'
const DEFAULT_PROJ = 'Vychozi'

function sanitize(s: string) {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9._-]/g,'_').replace(/_+/g,'_').replace(/^_|_$/g,'') || 'soubor'
}
function fp(uid: string, proj: string, name: string) {
  return `zaci/${uid}/${sanitize(proj)}/${sanitize(name)}`
}

// ── Types ─────────────────────────────────────────────────────────────────────
type NodeType = 'start'|'end'|'process'|'decision'|'io'|'loop'
type Port = 'top'|'bottom'|'left'|'right'

interface FNode { id:string; type:NodeType; x:number; y:number; w:number; h:number; label:string }
interface FEdge { id:string; from:string; to:string; fromPort:Port; toPort:Port; label:string }
interface Diagram { nodes:FNode[]; edges:FEdge[] }
interface FFile { path:string; name:string; project:string }
interface Project { name:string; files:FFile[] }

const EMPTY_DIAGRAM: Diagram = { nodes:[], edges:[] }

const NODE_CFG: Record<NodeType,{label:string;color:string;w:number;h:number}> = {
  start:    {label:'Start',        color:'#22C55E', w:140, h:56},
  end:      {label:'Konec',        color:'#EF4444', w:140, h:56},
  process:  {label:'Proces',       color:'#3B82F6', w:180, h:64},
  decision: {label:'Rozhodnutí',   color:'#F59E0B', w:180, h:90},
  io:       {label:'Vstup/Výstup', color:'#8B5CF6', w:180, h:64},
  loop:     {label:'Smyčka',       color:'#06B6D4', w:180, h:64},
}

function portXY(n: FNode, port: Port): [number,number] {
  switch(port){
    case 'top':    return [n.x+n.w/2, n.y]
    case 'bottom': return [n.x+n.w/2, n.y+n.h]
    case 'left':   return [n.x,       n.y+n.h/2]
    case 'right':  return [n.x+n.w,   n.y+n.h/2]
  }
}

// Best port pair based on relative position
function bestPorts(a: FNode, b: FNode): [Port,Port] {
  const ax=a.x+a.w/2, ay=a.y+a.h/2, bx=b.x+b.w/2, by=b.y+b.h/2
  const dx=bx-ax, dy=by-ay
  if(Math.abs(dy)>=Math.abs(dx)) return dy>0 ? ['bottom','top'] : ['top','bottom']
  return dx>0 ? ['right','left'] : ['left','right']
}

function curvePath(x1:number,y1:number,x2:number,y2:number): string {
  const cx=(x1+x2)/2, cy=(y1+y2)/2
  const dx=Math.abs(x2-x1)*0.5, dy=Math.abs(y2-y1)*0.5
  return `M${x1},${y1} C${x1},${y1+dy} ${x2},${y2-dy} ${x2},${y2}`
}

// ── Shapes ────────────────────────────────────────────────────────────────────
function NodeShape({n,sel,color}:{n:FNode;sel:boolean;color:string}) {
  const fill=color+'20', stroke=sel?'#fff':color, sw=sel?2.5:1.5
  const {x,y,w,h}=n
  switch(n.type){
    case 'start': case 'end':
      return <ellipse cx={x+w/2} cy={y+h/2} rx={w/2} ry={h/2} fill={fill} stroke={stroke} strokeWidth={sw}/>
    case 'decision':
      return <polygon points={`${x+w/2},${y} ${x+w},${y+h/2} ${x+w/2},${y+h} ${x},${y+h/2}`} fill={fill} stroke={stroke} strokeWidth={sw}/>
    case 'io':
      return <polygon points={`${x+18},${y} ${x+w},${y} ${x+w-18},${y+h} ${x},${y+h}`} fill={fill} stroke={stroke} strokeWidth={sw}/>
    case 'loop':
      return <polygon points={`${x+16},${y} ${x+w-16},${y} ${x+w},${y+h/2} ${x+w-16},${y+h} ${x+16},${y+h} ${x},${y+h/2}`} fill={fill} stroke={stroke} strokeWidth={sw}/>
    default:
      return <rect x={x} y={y} width={w} height={h} rx={8} fill={fill} stroke={stroke} strokeWidth={sw}/>
  }
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function FlowchartEditor({profile}:{profile:any}) {
  const supabase = createClient()
  const accent   = profile?.accent_color ?? '#7C3AED'
  const uid      = profile?.id as string

  // ── File state ─────────────────────────────────────────────────────────────
  const [projects,setProjects]   = useState<Project[]>([])
  const [loadingProj,setLP]      = useState(true)
  const [activeFile,setActiveFile] = useState<FFile|null>(null)
  const [isDirty,setIsDirty]     = useState(false)
  const [expanded,setExpanded]   = useState<Set<string>>(new Set([DEFAULT_PROJ]))
  const [saving,setSaving]       = useState(false)
  const [saveMsg,setSaveMsg]     = useState('')

  // ── Diagram state (ref for perf, state for render) ─────────────────────────
  const diagramRef = useRef<Diagram>(EMPTY_DIAGRAM)
  const [diagram,setDiagramState] = useState<Diagram>(EMPTY_DIAGRAM)

  function setDiagram(fn: (d:Diagram)=>Diagram) {
    const next = fn(diagramRef.current)
    diagramRef.current = next
    setDiagramState(next)
    setIsDirty(true)
  }

  // ── Selection + interaction state ─────────────────────────────────────────
  const [selectedIds,setSelectedIds] = useState<Set<string>>(new Set())
  const [editingId,setEditingId]   = useState<string|null>(null)
  const [editVal,setEditVal]       = useState('')
  const [edgeLabelId,setEdgeLabelId] = useState<string|null>(null)
  const [edgeLabelVal,setEdgeLabelVal] = useState('')

  // ── Interaction refs (no re-render) ───────────────────────────────────────
  const svgRef    = useRef<SVGSVGElement>(null)
  const [pan,setPan]   = useState({x:60,y:40})
  const [zoom,setZoom] = useState(1)
  const panRef    = useRef({x:60,y:40})
  const zoomRef   = useRef(1)

  // Drag node
  const dragNode  = useRef<{id:string;ox:number;oy:number;sx:number;sy:number}|null>(null)
  // Pan
  const panStart  = useRef<{mx:number;my:number;px:number;py:number}|null>(null)
  // Edge drawing
  const [drawingEdge,setDrawingEdge] = useState<{fromId:string;fromPort:Port;mx:number;my:number}|null>(null)
  const drawingRef = useRef<typeof drawingEdge>(null)
  // Resize
  const resizeRef = useRef<{id:string;corner:string;ox:number;oy:number;ow:number;oh:number;nx:number;ny:number}|null>(null)

  // ── Modals ─────────────────────────────────────────────────────────────────
  const [newFileModal,setNFM]  = useState(false)
  const [newFileName,setNFN]   = useState('')
  const [newFileProj,setNFP]   = useState(DEFAULT_PROJ)
  const [newProjModal,setNPM]  = useState(false)
  const [newProjName,setNPN]   = useState('')
  const [deleteFileM,setDFM]   = useState<FFile|null>(null)
  const [deleteProjM,setDPM]   = useState<string|null>(null)
  const [pyModal,setPyModal]   = useState(false)
  const [pyCode,setPyCode]     = useState('')

  // ── Storage ────────────────────────────────────────────────────────────────
  async function push(path:string, data:Diagram) {
    const blob = new Blob([JSON.stringify(data)],{type:'application/json'})
    // Always remove first to avoid upsert conflicts
    await supabase.storage.from(BUCKET).remove([path])
    const {error} = await supabase.storage.from(BUCKET).upload(path, blob, {cacheControl:'0'})
    return error?.message ?? null
  }

  async function pull(path:string): Promise<Diagram> {
    const {data,error} = await supabase.storage.from(BUCKET).download(path)
    if(error||!data) return EMPTY_DIAGRAM
    try { return JSON.parse(await data.text()) } catch { return EMPTY_DIAGRAM }
  }

  // ── Projects ───────────────────────────────────────────────────────────────
  const refresh = useCallback(async () => {
    setLP(true)
    const {data:top} = await supabase.storage.from(BUCKET).list(`zaci/${uid}`,{limit:200,sortBy:{column:'name',order:'asc'}})
    if(!top){setLP(false);return}
    const res:Project[] = []
    for(const item of top){
      if(item.metadata!=null) continue
      const {data:files} = await supabase.storage.from(BUCKET).list(`zaci/${uid}/${item.name}`,{limit:200})
      res.push({name:item.name, files:(files??[]).filter(f=>f.name!=='.gitkeep'&&f.metadata!=null).map(f=>({
        path:`zaci/${uid}/${item.name}/${f.name}`, name:f.name, project:item.name
      }))})
    }
    setProjects(res)
    if(res.length===0){
      // Create default
      await push(fp(uid,DEFAULT_PROJ,'diagram.flow'), EMPTY_DIAGRAM)
      await refresh()
      return
    }
    setNFP(res[0]?.name??DEFAULT_PROJ)
    setLP(false)
  },[uid])

  useEffect(()=>{refresh()},[refresh])

  async function openFile(file:FFile) {
    if(isDirty && !confirm('Neuložené změny budou ztraceny.')) return
    const data = await pull(file.path)
    diagramRef.current = data
    setDiagramState(data)
    setActiveFile(file)
    setIsDirty(false)
    setSelectedIds(new Set())
    localStorage.setItem(LS_LAST, JSON.stringify(file))
  }

  async function save() {
    if(!activeFile){setNFM(true);return}
    setSaving(true)
    const err = await push(activeFile.path, diagramRef.current)
    setSaving(false)
    if(err){setSaveMsg('❌ '+err);return}
    setIsDirty(false)
    setSaveMsg('✓ Uloženo'); setTimeout(()=>setSaveMsg(''),2500)
    await refresh()
  }

  async function createFile() {
    const name=newFileName.trim()||'diagram'
    const fname=name.endsWith('.flow')?name:name+'.flow'
    const proj=newFileProj||DEFAULT_PROJ
    const path=fp(uid,proj,fname)
    await push(path, EMPTY_DIAGRAM)
    const file:FFile={path,name:fname,project:proj}
    setNFM(false); setNFN('')
    await refresh()
    await openFile(file)
  }

  async function createProject() {
    const name=newProjName.trim()||'Projekt'
    await push(fp(uid,name,'diagram.flow'), EMPTY_DIAGRAM)
    setNPM(false); setNPN('')
    await refresh()
  }

  async function deleteFile(file:FFile) {
    await supabase.storage.from(BUCKET).remove([file.path])
    if(activeFile?.path===file.path){diagramRef.current=EMPTY_DIAGRAM;setDiagramState(EMPTY_DIAGRAM);setActiveFile(null)}
    setDFM(null); await refresh()
  }

  async function deleteProject(projName:string) {
    const proj = projects.find(p=>p.name===projName)
    if(!proj) return
    const paths = proj.files.map(f=>f.path)
    if(paths.length>0) await supabase.storage.from(BUCKET).remove(paths)
    if(activeFile?.project===projName){diagramRef.current=EMPTY_DIAGRAM;setDiagramState(EMPTY_DIAGRAM);setActiveFile(null)}
    setDPM(null); await refresh()
  }

  // ── SVG coords ─────────────────────────────────────────────────────────────
  function clientToSvg(cx:number,cy:number){
    const r=svgRef.current?.getBoundingClientRect()
    if(!r) return {x:0,y:0}
    return {x:(cx-r.left-panRef.current.x)/zoomRef.current, y:(cy-r.top-panRef.current.y)/zoomRef.current}
  }

  // ── Diagram ops ─────────────────────────────────────────────────────────────
  function addNode(type:NodeType, x:number, y:number){
    const cfg=NODE_CFG[type]
    const id='n'+Date.now()
    setDiagram(d=>({...d,nodes:[...d.nodes,{id,type,x,y,w:cfg.w,h:cfg.h,label:cfg.label}]}))
  }

  function deleteSelected(){
    setDiagram(d=>({
      nodes:d.nodes.filter(n=>!selectedIds.has(n.id)),
      edges:d.edges.filter(e=>!selectedIds.has(e.id)&&!selectedIds.has(e.from)&&!selectedIds.has(e.to))
    }))
    setSelectedIds(new Set())
  }

  function finishLabelEdit(){
    if(!editingId) return
    setDiagram(d=>({...d,nodes:d.nodes.map(n=>n.id===editingId?{...n,label:editVal}:n)}))
    setEditingId(null)
  }
  function finishEdgeLabel(){
    if(!edgeLabelId) return
    setDiagram(d=>({...d,edges:d.edges.map(e=>e.id===edgeLabelId?{...e,label:edgeLabelVal}:e)}))
    setEdgeLabelId(null)
  }

  // ── Global mousemove/mouseup ───────────────────────────────────────────────
  useEffect(()=>{
    function onMove(e:MouseEvent){
      // Drag node — directly mutate ref + update state
      if(dragNode.current){
        const {id,ox,oy,sx,sy}=dragNode.current
        const dx=(e.clientX-sx)/zoomRef.current
        const dy=(e.clientY-sy)/zoomRef.current
        const nx=Math.max(0,ox+dx), ny=Math.max(0,oy+dy)
        // Update ref immediately (no re-render)
        const node=diagramRef.current.nodes.find(n=>n.id===id)
        if(node){node.x=nx;node.y=ny}
        // Throttled state update
        setDiagramState({...diagramRef.current})
        return
      }
      // Pan
      if(panStart.current){
        const px=panStart.current.px+(e.clientX-panStart.current.mx)
        const py=panStart.current.py+(e.clientY-panStart.current.my)
        panRef.current={x:px,y:py}
        setPan({x:px,y:py})
        return
      }
      // Edge drawing
      if(drawingRef.current){
        const c=clientToSvg(e.clientX,e.clientY)
        setDrawingEdge({...drawingRef.current,mx:c.x,my:c.y})
        return
      }
      // Resize
      if(resizeRef.current){
        const r=resizeRef.current
        const dx=(e.clientX-r.ox)/zoomRef.current
        const dy=(e.clientY-r.oy)/zoomRef.current
        const node=diagramRef.current.nodes.find(n=>n.id===r.id)
        if(node){
          if(r.corner.includes('right'))  node.w=Math.max(60,r.ow+dx)
          if(r.corner.includes('bottom')) node.h=Math.max(30,r.oh+dy)
          if(r.corner.includes('left'))   {node.w=Math.max(60,r.ow-dx);node.x=r.nx+Math.min(dx,r.ow-60)}
          if(r.corner.includes('top'))    {node.h=Math.max(30,r.oh-dy);node.y=r.ny+Math.min(dy,r.oh-30)}
        }
        setDiagramState({...diagramRef.current})
        return
      }
    }
    function onUp(e:MouseEvent){
      // Finish edge
      if(drawingRef.current){
        const de=drawingRef.current
        const c=clientToSvg(e.clientX,e.clientY)
        const target=diagramRef.current.nodes.find(n=>
          c.x>=n.x&&c.x<=n.x+n.w&&c.y>=n.y&&c.y<=n.y+n.h&&n.id!==de.fromId
        )
        if(target){
          const [fp2,tp]=bestPorts(diagramRef.current.nodes.find(n=>n.id===de.fromId)!,target)
          const id='e'+Date.now()
          setDiagram(d=>({...d,edges:[...d.edges,{id,from:de.fromId,to:target.id,fromPort:de.fromPort,toPort:tp,label:''}]}))
          // Ask for edge label
          setEdgeLabelId(id); setEdgeLabelVal('')
        }
        drawingRef.current=null
        setDrawingEdge(null)
      }
      dragNode.current=null
      panStart.current=null
      resizeRef.current=null
    }
    window.addEventListener('mousemove',onMove)
    window.addEventListener('mouseup',onUp)
    return ()=>{window.removeEventListener('mousemove',onMove);window.removeEventListener('mouseup',onUp)}
  },[])

  // ── Keyboard ───────────────────────────────────────────────────────────────
  useEffect(()=>{
    function onKey(e:KeyboardEvent){
      if(editingId||edgeLabelId) return
      if((e.ctrlKey||e.metaKey)&&e.key==='s'){e.preventDefault();save()}
      if((e.key==='Delete'||e.key==='Backspace')&&selectedIds.size>0) deleteSelected()
      if(e.key==='Escape'){setSelectedIds(new Set())}
    }
    window.addEventListener('keydown',onKey)
    return ()=>window.removeEventListener('keydown',onKey)
  },[selectedIds,editingId,edgeLabelId])

  // ── Python generation ──────────────────────────────────────────────────────
  function genPython(d:Diagram): string {
    if(d.nodes.length===0) return '# Prázdný diagram\n'
    const lines=['# Vygenerováno z ClassBase Flowchart Editoru','']
    const visited=new Set<string>()
    const nodeMap=new Map(d.nodes.map(n=>[n.id,n]))
    function ind(depth:number){return '    '.repeat(depth)}
    function walk(id:string,depth:number):string[]{
      if(visited.has(id)) return []
      visited.add(id)
      const node=nodeMap.get(id); if(!node) return []
      const out:string[]=[]
      const outs=d.edges.filter(e=>e.from===id)
      switch(node.type){
        case 'start': out.push(`${ind(depth)}# START`); break
        case 'end':   out.push(`${ind(depth)}# KONEC`); return out
        case 'process': out.push(`${ind(depth)}# ${node.label}`); out.push(`${ind(depth)}pass  # TODO: "${node.label}"`); break
        case 'io':
          if(/vstup|input/i.test(node.label)) out.push(`${ind(depth)}vstup = input("${node.label}: ")`)
          else out.push(`${ind(depth)}print("${node.label}")`)
          break
        case 'decision':
          out.push(`${ind(depth)}if True:  # ${node.label}`)
          const yes=outs.find(e=>/ano|yes/i.test(e.label||'')||outs.indexOf(e)===0)
          const no=outs.find(e=>/ne|no/i.test(e.label||'')||outs.indexOf(e)===1)
          if(yes){out.push(`${ind(depth+1)}# ANO`);out.push(...walk(yes.to,depth+1))}
          if(no){out.push(`${ind(depth)}else:  # NE`);out.push(...walk(no.to,depth+1))}
          return out
        case 'loop':
          out.push(`${ind(depth)}while True:  # ${node.label}`)
          if(outs[0]) out.push(...walk(outs[0].to,depth+1))
          out.push(`${ind(depth+1)}break  # podmínka ukončení`)
          return out
      }
      const next=outs.find(e=>!visited.has(e.to))
      if(next) out.push(...walk(next.to,depth))
      return out
    }
    const start=d.nodes.find(n=>n.type==='start')
    if(start) lines.push(...walk(start.id,0))
    else d.nodes.forEach(n=>{if(!visited.has(n.id))lines.push(...walk(n.id,0))})
    return lines.join('\n')+'\n'
  }

  // ── Export ─────────────────────────────────────────────────────────────────
  function exportSVG(){
    if(!svgRef.current) return
    const clone=svgRef.current.cloneNode(true) as SVGSVGElement
    clone.setAttribute('xmlns','http://www.w3.org/2000/svg')
    // Remove grid pattern, set white/dark bg
    const src='<?xml version="1.0" encoding="UTF-8"?>\n'+new XMLSerializer().serializeToString(clone)
    const a=document.createElement('a')
    a.href=URL.createObjectURL(new Blob([src],{type:'image/svg+xml'}))
    a.download=(activeFile?.name.replace('.flow','')||'diagram')+'.svg'
    a.click()
  }
  function exportPNG(){
    if(!svgRef.current) return
    const clone=svgRef.current.cloneNode(true) as SVGSVGElement
    clone.setAttribute('xmlns','http://www.w3.org/2000/svg')
    const svgStr=new XMLSerializer().serializeToString(clone)
    const img=new Image()
    const blob=new Blob([svgStr],{type:'image/svg+xml'})
    const url=URL.createObjectURL(blob)
    img.onload=()=>{
      const c=document.createElement('canvas')
      c.width=svgRef.current!.clientWidth*2; c.height=svgRef.current!.clientHeight*2
      const ctx=c.getContext('2d')!
      ctx.fillStyle='#090B10'; ctx.fillRect(0,0,c.width,c.height)
      ctx.scale(2,2); ctx.drawImage(img,0,0)
      URL.revokeObjectURL(url)
      const a=document.createElement('a')
      a.href=c.toDataURL('image/png')
      a.download=(activeFile?.name.replace('.flow','')||'diagram')+'.png'
      a.click()
    }
    img.src=url
  }

  // ── Render helpers ─────────────────────────────────────────────────────────
  const inp:React.CSSProperties={padding:'9px 12px',background:D.bgMid,border:`1px solid ${D.border}`,borderRadius:8,fontSize:13,color:D.txtPri,fontFamily:'inherit',outline:'none',width:'100%',boxSizing:'border-box' as const}

  function Modal({title,onClose,children}:{title:string;onClose:()=>void;children:React.ReactNode}){
    return(
      <>
        <div onClick={onClose} style={{position:'fixed',inset:0,background:'rgba(0,0,0,.7)',zIndex:9998,backdropFilter:'blur(4px)'}}/>
        <div style={{position:'fixed',top:'50%',left:'50%',transform:'translate(-50%,-50%)',zIndex:9999,width:'100%',maxWidth:440,padding:'0 16px'}}>
          <div style={{background:D.bgCard,borderRadius:16,padding:'24px',border:`1px solid ${D.border}`,boxShadow:'0 24px 60px rgba(0,0,0,.7)'}}>
            <div style={{fontSize:16,fontWeight:700,color:D.txtPri,marginBottom:16}}>{title}</div>
            {children}
          </div>
        </div>
      </>
    )
  }

  const PALETTE:[NodeType,string,string][] = [
    ['start',    '🟢','Start / Začátek'],
    ['end',      '🔴','Konec'],
    ['process',  '🔵','Proces'],
    ['decision', '🟡','Rozhodnutí (kosočtverec)'],
    ['io',       '🟣','Vstup / Výstup'],
    ['loop',     '🩵','Smyčka'],
  ]

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <DarkLayout profile={profile} activeRoute="/student/flowchart" fullContent>
      <style>{`
        .fc-palette-item{display:flex;align-items:center;gap:9px;padding:7px 10px;border-radius:8px;cursor:grab;margin-bottom:2px;border:1px solid transparent;transition:background .12s;}
        .fc-palette-item:hover{background:rgba(255,255,255,.07)!important;border-color:rgba(255,255,255,.1)!important;}
        .fc-file-row{display:flex;align-items:center;padding:5px 14px 5px 28px;cursor:pointer;gap:6px;transition:background .1s;}
        .fc-file-row:hover{background:rgba(255,255,255,.05)!important;}
        .fc-btn{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);color:rgba(255,255,255,.6);border-radius:7px;padding:6px 12px;cursor:pointer;font-family:inherit;font-size:12px;transition:all .12s;white-space:nowrap;}
        .fc-btn:hover{background:rgba(255,255,255,.12);color:#fff;}
        .fc-port{fill:transparent;cursor:crosshair;transition:fill .1s;}
        .fc-node-g:hover .fc-port{fill:rgba(255,255,255,.15)!important;}
        .fc-port:hover{fill:rgba(255,255,255,.5)!important;}
        .fc-resize-handle{fill:rgba(255,255,255,.15);cursor:se-resize;}
        .fc-resize-handle:hover{fill:rgba(255,255,255,.4);}
      `}</style>

      {/* Modals */}
      {newFileModal&&(
        <Modal title="📄 Nový diagram" onClose={()=>setNFM(false)}>
          <div style={{display:'flex',flexDirection:'column',gap:10}}>
            <div><label style={{fontSize:12,color:D.txtSec,display:'block',marginBottom:4}}>Název</label>
              <input value={newFileName} onChange={e=>setNFN(e.target.value)} onKeyDown={e=>e.key==='Enter'&&createFile()} placeholder="muj-diagram" autoFocus style={inp}/></div>
            <div><label style={{fontSize:12,color:D.txtSec,display:'block',marginBottom:4}}>Projekt</label>
              <select value={newFileProj} onChange={e=>setNFP(e.target.value)} style={{...inp,cursor:'pointer'}}>
                {projects.map(p=><option key={p.name} value={p.name}>{p.name}</option>)}</select></div>
            <div style={{display:'flex',gap:8,marginTop:4}}>
              <button onClick={createFile} style={{flex:1,padding:'9px',background:accent,color:'#fff',border:'none',borderRadius:8,cursor:'pointer',fontFamily:'inherit',fontWeight:600}}>Vytvořit</button>
              <button onClick={()=>setNFM(false)} style={{padding:'9px 14px',background:D.bgMid,color:D.txtSec,border:`1px solid ${D.border}`,borderRadius:8,cursor:'pointer',fontFamily:'inherit'}}>Zrušit</button>
            </div>
          </div>
        </Modal>
      )}
      {newProjModal&&(
        <Modal title="📁 Nový projekt" onClose={()=>setNPM(false)}>
          <input value={newProjName} onChange={e=>setNPN(e.target.value)} onKeyDown={e=>e.key==='Enter'&&createProject()} placeholder="Název projektu" autoFocus style={{...inp,marginBottom:12}}/>
          <div style={{display:'flex',gap:8}}>
            <button onClick={createProject} style={{flex:1,padding:'9px',background:accent,color:'#fff',border:'none',borderRadius:8,cursor:'pointer',fontFamily:'inherit',fontWeight:600}}>Vytvořit</button>
            <button onClick={()=>setNPM(false)} style={{padding:'9px 14px',background:D.bgMid,color:D.txtSec,border:`1px solid ${D.border}`,borderRadius:8,cursor:'pointer',fontFamily:'inherit'}}>Zrušit</button>
          </div>
        </Modal>
      )}
      {deleteFileM&&(
        <Modal title="🗑️ Smazat diagram" onClose={()=>setDFM(null)}>
          <p style={{fontSize:13,color:D.txtSec,marginBottom:16}}>Smazat <strong style={{color:D.txtPri}}>{deleteFileM.name}</strong>?</p>
          <div style={{display:'flex',gap:8}}>
            <button onClick={()=>deleteFile(deleteFileM)} style={{flex:1,padding:'9px',background:D.danger,color:'#fff',border:'none',borderRadius:8,cursor:'pointer',fontFamily:'inherit',fontWeight:600}}>Smazat</button>
            <button onClick={()=>setDFM(null)} style={{padding:'9px 14px',background:D.bgMid,color:D.txtSec,border:`1px solid ${D.border}`,borderRadius:8,cursor:'pointer',fontFamily:'inherit'}}>Zrušit</button>
          </div>
        </Modal>
      )}
      {deleteProjM&&(
        <Modal title="🗑️ Smazat projekt" onClose={()=>setDPM(null)}>
          <p style={{fontSize:13,color:D.txtSec,marginBottom:16}}>Smazat projekt <strong style={{color:D.txtPri}}>{deleteProjM}</strong> a všechny jeho diagramy?</p>
          <div style={{display:'flex',gap:8}}>
            <button onClick={()=>deleteProject(deleteProjM)} style={{flex:1,padding:'9px',background:D.danger,color:'#fff',border:'none',borderRadius:8,cursor:'pointer',fontFamily:'inherit',fontWeight:600}}>Smazat</button>
            <button onClick={()=>setDPM(null)} style={{padding:'9px 14px',background:D.bgMid,color:D.txtSec,border:`1px solid ${D.border}`,borderRadius:8,cursor:'pointer',fontFamily:'inherit'}}>Zrušit</button>
          </div>
        </Modal>
      )}
      {pyModal&&(
        <Modal title="🐍 Python kód" onClose={()=>setPyModal(false)}>
          <pre style={{background:'#1e1e2e',color:'#cdd6f4',padding:'14px',borderRadius:10,fontSize:12,overflowX:'auto',maxHeight:380,whiteSpace:'pre-wrap',fontFamily:'ui-monospace,monospace',marginBottom:12}}>{pyCode}</pre>
          <div style={{display:'flex',gap:8}}>
            <button onClick={()=>navigator.clipboard.writeText(pyCode)} style={{flex:1,padding:'9px',background:accent,color:'#fff',border:'none',borderRadius:8,cursor:'pointer',fontFamily:'inherit',fontWeight:600}}>📋 Kopírovat</button>
            <button onClick={()=>setPyModal(false)} style={{padding:'9px 14px',background:D.bgMid,color:D.txtSec,border:`1px solid ${D.border}`,borderRadius:8,cursor:'pointer',fontFamily:'inherit'}}>Zavřít</button>
          </div>
        </Modal>
      )}
      {/* Edge label modal */}
      {edgeLabelId&&(
        <Modal title="✏️ Popisek šipky" onClose={()=>setEdgeLabelId(null)}>
          <input value={edgeLabelVal} onChange={e=>setEdgeLabelVal(e.target.value)}
            onKeyDown={e=>e.key==='Enter'&&finishEdgeLabel()}
            placeholder="např. Ano / Ne (volitelné)" autoFocus style={{...inp,marginBottom:12}}/>
          <div style={{display:'flex',gap:8}}>
            <button onClick={finishEdgeLabel} style={{flex:1,padding:'9px',background:accent,color:'#fff',border:'none',borderRadius:8,cursor:'pointer',fontFamily:'inherit',fontWeight:600}}>Potvrdit</button>
            <button onClick={()=>setEdgeLabelId(null)} style={{padding:'9px 14px',background:D.bgMid,color:D.txtSec,border:`1px solid ${D.border}`,borderRadius:8,cursor:'pointer',fontFamily:'inherit'}}>Bez popisku</button>
          </div>
        </Modal>
      )}

      <div style={{display:'flex',flex:1,minHeight:0,overflow:'hidden'}}>

        {/* ═══ LEFT PANEL ═══ */}
        <div style={{width:216,flexShrink:0,borderRight:`1px solid ${D.border}`,background:D.bgCard,display:'flex',flexDirection:'column',overflow:'hidden'}}>
          {/* Header */}
          <div style={{padding:'12px 12px 10px',borderBottom:`1px solid ${D.border}`,flexShrink:0}}>
            <div style={{display:'flex',alignItems:'center',gap:7,marginBottom:8}}>
              <span style={{fontSize:16}}>📊</span>
              <span style={{fontSize:13,fontWeight:700,color:D.txtPri}}>Flowchart</span>
              {isDirty&&<span style={{fontSize:10,color:D.warning,marginLeft:'auto'}}>● neuloženo</span>}
            </div>
            <div style={{display:'flex',gap:5}}>
              <button onClick={()=>setNFM(true)} className="fc-btn" style={{flex:1}}>+ Diagram</button>
              <button onClick={()=>setNPM(true)} className="fc-btn" title="Nový projekt">📁</button>
            </div>
          </div>

          {/* Palette */}
          <div style={{padding:'8px 10px',borderBottom:`1px solid ${D.border}`,flexShrink:0}}>
            <div style={{fontSize:9,fontWeight:700,color:D.txtSec,textTransform:'uppercase',letterSpacing:'.07em',marginBottom:6}}>Bloky — přetáhni na plátno</div>
            {PALETTE.map(([type,emoji,label])=>(
              <div key={type} draggable onDragStart={e=>e.dataTransfer.setData('nodeType',type)}
                className="fc-palette-item">
                <span style={{fontSize:13}}>{emoji}</span>
                <span style={{fontSize:11,color:D.txtSec}}>{label}</span>
                <div style={{marginLeft:'auto',width:14,height:2,background:NODE_CFG[type].color+'80',borderRadius:1,flexShrink:0}}/>
              </div>
            ))}
          </div>

          {/* File tree */}
          <div style={{flex:1,overflowY:'auto',padding:'4px 0'}}>
            {loadingProj
              ? <div style={{padding:'20px',textAlign:'center',color:D.txtSec,fontSize:12}}>Načítám…</div>
              : projects.map(proj=>(
                  <div key={proj.name}>
                    <div style={{display:'flex',alignItems:'center',gap:5,padding:'6px 12px',cursor:'pointer',fontSize:12,fontWeight:600,color:D.txtSec}}
                      onClick={()=>setExpanded(prev=>{const n=new Set(prev);n.has(proj.name)?n.delete(proj.name):n.add(proj.name);return n})}>
                      <span style={{fontSize:9}}>{expanded.has(proj.name)?'▼':'▶'}</span>
                      <span style={{flex:1}}>📁 {proj.name}</span>
                      <button onClick={e=>{e.stopPropagation();setDPM(proj.name)}}
                        style={{background:'none',border:'none',cursor:'pointer',color:D.danger,fontSize:11,padding:'0 2px',opacity:.5}}
                        title="Smazat projekt">🗑</button>
                    </div>
                    {expanded.has(proj.name)&&proj.files.map(file=>(
                      <div key={file.path} className="fc-file-row"
                        style={{background:activeFile?.path===file.path?accent+'15':'transparent',borderLeft:`2px solid ${activeFile?.path===file.path?accent:'transparent'}`}}>
                        <span style={{fontSize:10}}>📊</span>
                        <span onClick={()=>openFile(file)} style={{fontSize:11,color:activeFile?.path===file.path?D.txtPri:D.txtSec,flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                          {file.name.replace('.flow','')}
                        </span>
                        <button onClick={()=>setDFM(file)} style={{background:'none',border:'none',cursor:'pointer',color:D.danger,fontSize:11,opacity:.5,padding:'0 2px',flexShrink:0}}>🗑</button>
                      </div>
                    ))}
                  </div>
                ))
            }
          </div>

          {saveMsg&&<div style={{padding:'7px 12px',borderTop:`1px solid ${D.border}`,fontSize:12,color:saveMsg.startsWith('❌')?D.danger:D.success}}>{saveMsg}</div>}
        </div>

        {/* ═══ CANVAS AREA ═══ */}
        <div style={{flex:1,display:'flex',flexDirection:'column',minWidth:0}}>

          {/* Toolbar */}
          <div style={{display:'flex',alignItems:'center',gap:7,padding:'8px 12px',borderBottom:`1px solid ${D.border}`,flexShrink:0,flexWrap:'wrap'}}>
            <div style={{fontSize:13,fontWeight:600,color:D.txtPri,flex:1,minWidth:0,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
              {activeFile?`${activeFile.project} / ${activeFile.name.replace('.flow','')}${isDirty?' ●':''}` : 'Bez souboru'}
            </div>
            <button onClick={save} disabled={saving} className="fc-btn" style={{background:isDirty?accent+'25':undefined,borderColor:isDirty?accent+'50':undefined,color:isDirty?accent:undefined}}>
              {saving?'…':'💾 Uložit'}
            </button>
            <button onClick={()=>{setPyCode(genPython(diagram));setPyModal(true)}} className="fc-btn">🐍 Python</button>
            <button onClick={exportSVG} className="fc-btn">⬇ SVG</button>
            <button onClick={exportPNG} className="fc-btn">⬇ PNG</button>
            <button onClick={()=>{panRef.current={x:60,y:40};setPan({x:60,y:40});setZoom(1);zoomRef.current=1}} className="fc-btn" title="Resetovat pohled">⊙</button>
            {selectedIds.size>0&&<button onClick={deleteSelected} className="fc-btn" style={{color:D.danger,borderColor:D.danger+'40'}}>🗑 ({selectedIds.size})</button>}
            <span style={{fontSize:11,color:D.txtSec}}>{Math.round(zoom*100)}%</span>
          </div>

          {/* Canvas */}
          <div style={{flex:1,position:'relative',overflow:'hidden',background:'#0A0C12'}}
            onDrop={e=>{
              e.preventDefault()
              const type=e.dataTransfer.getData('nodeType') as NodeType
              if(!type) return
              const r=svgRef.current?.getBoundingClientRect()
              if(!r) return
              const x=(e.clientX-r.left-panRef.current.x)/zoomRef.current-NODE_CFG[type].w/2
              const y=(e.clientY-r.top-panRef.current.y)/zoomRef.current-NODE_CFG[type].h/2
              addNode(type,Math.max(0,x),Math.max(0,y))
            }}
            onDragOver={e=>e.preventDefault()}
            onWheel={e=>{
              e.preventDefault()
              const f=e.deltaY>0?.9:1.1
              const nz=Math.min(3,Math.max(0.2,zoomRef.current*f))
              zoomRef.current=nz; setZoom(nz)
            }}>

            {/* Dot grid */}
            <svg style={{position:'absolute',inset:0,width:'100%',height:'100%',pointerEvents:'none'}}>
              <defs>
                <pattern id="dotgrid" width={24*zoom} height={24*zoom} x={pan.x%(24*zoom)} y={pan.y%(24*zoom)} patternUnits="userSpaceOnUse">
                  <circle cx={0} cy={0} r={0.9} fill="rgba(255,255,255,.07)"/>
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#dotgrid)"/>
            </svg>

            {!activeFile&&(
              <div style={{position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center',flexDirection:'column',gap:10,color:D.txtSec,pointerEvents:'none'}}>
                <div style={{fontSize:48,opacity:.15}}>📊</div>
                <div style={{fontSize:14,opacity:.4}}>Otevři nebo vytvoř nový diagram</div>
                <div style={{fontSize:11,opacity:.25}}>Přetáhni bloky z levého panelu · Ctrl+S uložit · Del smazat</div>
              </div>
            )}

            <svg ref={svgRef} style={{position:'absolute',inset:0,width:'100%',height:'100%'}}
              onMouseDown={e=>{
                if(e.button===1||(e.altKey&&e.button===0)){
                  panStart.current={mx:e.clientX,my:e.clientY,px:panRef.current.x,py:panRef.current.y}
                  e.preventDefault(); return
                }
                const target=e.target as Element
                if(target===svgRef.current||target.tagName==='svg'||target.tagName==='g'&&!(target as Element).closest('.fc-node-g'))
                  setSelectedIds(new Set())
              }}>

              <defs>
                <marker id="arr" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
                  <polygon points="0 0,8 3,0 6" fill="rgba(255,255,255,.45)"/>
                </marker>
              </defs>

              <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>

                {/* Edges */}
                {diagram.edges.map(edge=>{
                  const fn=diagram.nodes.find(n=>n.id===edge.from)
                  const tn=diagram.nodes.find(n=>n.id===edge.to)
                  if(!fn||!tn) return null
                  const [fx,fy]=portXY(fn,edge.fromPort)
                  const [tx,ty]=portXY(tn,edge.toPort)
                  const path=curvePath(fx,fy,tx,ty)
                  const mx=(fx+tx)/2, my=(fy+ty)/2
                  const isSel=selectedIds.has(edge.id)
                  return(
                    <g key={edge.id} style={{cursor:'pointer'}}
                      onClick={e=>{e.stopPropagation();setSelectedIds(new Set([edge.id]))}}>
                      <path d={path} fill="none" stroke="transparent" strokeWidth={14}/>
                      <path d={path} fill="none" stroke={isSel?'#fff':'rgba(255,255,255,.35)'} strokeWidth={isSel?2:1.5} markerEnd="url(#arr)"/>
                      {edge.label&&<text x={mx} y={my-7} textAnchor="middle" fontSize={11} fill="rgba(255,255,255,.55)" fontFamily="DM Sans,system-ui,sans-serif" style={{pointerEvents:'none'}}>{edge.label}</text>}
                    </g>
                  )
                })}

                {/* Nodes */}
                {diagram.nodes.map(node=>{
                  const cfg=NODE_CFG[node.type]
                  const isSel=selectedIds.has(node.id)
                  const {x,y,w,h}=node
                  const ports:Port[]=['top','bottom','left','right']
                  return(
                    <g key={node.id} className="fc-node-g"
                      onMouseDown={e=>{
                        if(e.button!==0) return
                        e.stopPropagation()
                        // Check if on port
                        const target=e.target as Element
                        if(target.classList.contains('fc-port')){
                          const port=target.getAttribute('data-port') as Port
                          const c=clientToSvg(e.clientX,e.clientY)
                          const de={fromId:node.id,fromPort:port,mx:c.x,my:c.y}
                          drawingRef.current=de; setDrawingEdge(de)
                          return
                        }
                        // Resize handle
                        if(target.classList.contains('fc-resize-handle')){
                          const corner=target.getAttribute('data-corner')||'bottom-right'
                          resizeRef.current={id:node.id,corner,ox:e.clientX,oy:e.clientY,ow:w,oh:h,nx:x,ny:y}
                          return
                        }
                        // Drag node
                        dragNode.current={id:node.id,ox:x,oy:y,sx:e.clientX,sy:e.clientY}
                        setSelectedIds(new Set([node.id]))
                      }}
                      onClick={e=>{e.stopPropagation();setSelectedIds(prev=>e.shiftKey?new Set([...prev,node.id]):new Set([node.id]))}}
                      onDoubleClick={e=>{e.stopPropagation();setEditingId(node.id);setEditVal(node.label)}}>
                      <NodeShape n={node} sel={isSel} color={cfg.color}/>
                      <text x={x+w/2} y={y+h/2} dominantBaseline="central" textAnchor="middle"
                        fontSize={12} fontFamily="DM Sans,system-ui,sans-serif" fontWeight={600} fill="#fff"
                        style={{pointerEvents:'none',userSelect:'none'}}>
                        {node.label}
                      </text>
                      {/* Ports — visible on hover */}
                      {ports.map(port=>{
                        const [px,py]=portXY(node,port)
                        return<circle key={port} className="fc-port" data-port={port}
                          cx={px} cy={py} r={7} strokeWidth={2} stroke={cfg.color}
                          style={{cursor:'crosshair'}}/>
                      })}
                      {/* Resize handles (only when selected) */}
                      {isSel&&[
                        {c:'bottom-right',cx:x+w,cy:y+h},
                        {c:'bottom-left', cx:x,  cy:y+h},
                        {c:'top-right',   cx:x+w,cy:y  },
                        {c:'top-left',    cx:x,  cy:y  },
                      ].map(({c,cx,cy})=>(
                        <rect key={c} className="fc-resize-handle" data-corner={c}
                          x={cx-5} y={cy-5} width={10} height={10} rx={2}/>
                      ))}
                    </g>
                  )
                })}

                {/* Drawing edge preview */}
                {drawingEdge&&(()=>{
                  const fn=diagram.nodes.find(n=>n.id===drawingEdge.fromId)
                  if(!fn) return null
                  const [fx,fy]=portXY(fn,drawingEdge.fromPort)
                  return<path d={curvePath(fx,fy,drawingEdge.mx,drawingEdge.my)}
                    fill="none" stroke="rgba(255,255,255,.5)" strokeWidth={1.5} strokeDasharray="6,3" markerEnd="url(#arr)"/>
                })()}
              </g>
            </svg>

            {/* Label editor */}
            {editingId&&(()=>{
              const node=diagram.nodes.find(n=>n.id===editingId)
              if(!node) return null
              const r=svgRef.current?.getBoundingClientRect()
              if(!r) return null
              const sx=node.x*zoom+pan.x+r.left
              const sy=node.y*zoom+pan.y+r.top
              return<input value={editVal} onChange={e=>setEditVal(e.target.value)}
                onKeyDown={e=>{if(e.key==='Enter'){finishLabelEdit()}else if(e.key==='Escape'){setEditingId(null)}}}
                onBlur={finishLabelEdit} autoFocus
                style={{position:'fixed',left:sx,top:sy,width:node.w*zoom,height:node.h*zoom,
                  background:'rgba(0,0,0,.85)',border:`2px solid ${accent}`,borderRadius:7,
                  color:'#fff',textAlign:'center',fontSize:Math.max(10,12*zoom),
                  fontFamily:'DM Sans,system-ui,sans-serif',fontWeight:600,outline:'none',zIndex:200}}/>
            })()}

            {/* Zoom controls */}
            <div style={{position:'absolute',bottom:14,right:14,display:'flex',flexDirection:'column',gap:4,zIndex:10}}>
              {[['＋',1.2],['−',0.8],['⊙',0]].map(([lbl,f])=>(
                <button key={String(lbl)} onClick={()=>{
                  if(f===0){panRef.current={x:60,y:40};setPan({x:60,y:40});zoomRef.current=1;setZoom(1)}
                  else{const nz=Math.min(3,Math.max(0.2,zoomRef.current*Number(f)));zoomRef.current=nz;setZoom(nz)}
                }} style={{width:30,height:30,background:'rgba(255,255,255,.08)',border:'1px solid rgba(255,255,255,.12)',borderRadius:7,color:'rgba(255,255,255,.6)',cursor:'pointer',fontSize:16,display:'flex',alignItems:'center',justifyContent:'center'}}>
                  {lbl}
                </button>
              ))}
            </div>

            {/* Hint */}
            <div style={{position:'absolute',bottom:14,left:14,fontSize:10,color:'rgba(255,255,255,.18)',userSelect:'none',lineHeight:1.6}}>
              Táhni blok z panelu · Hover na blok → port kroužky → táhni hranu<br/>
              Dvojklik = upravit · Del = smazat · Alt+drag nebo kolečko myši = pan/zoom
            </div>
          </div>
        </div>
      </div>
    </DarkLayout>
  )
}
