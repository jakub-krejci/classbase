'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { DarkLayout, D } from '@/components/DarkLayout'

const BUCKET = 'flowchart-files'
const DEFAULT_PROJ = 'Vychozi'

function sanitize(s: string) {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9._-]/g,'_').replace(/_+/g,'_').replace(/^_|_$/g,'') || 'soubor'
}
function fp(uid:string,proj:string,name:string){ return `zaci/${uid}/${sanitize(proj)}/${sanitize(name)}` }

// ── Types ─────────────────────────────────────────────────────────────────────
type NodeType = 'start'|'end'|'process'|'decision'|'io'|'loop'|'subroutine'|'connector'|'text'
type Port = 'top'|'bottom'|'left'|'right'
type TextAlign = 'left'|'center'|'right'

interface TextStyle {
  bold?:boolean; italic?:boolean; underline?:boolean
  size?:number; color?:string; align?:TextAlign
}
interface NodeStyle {
  fillColor?:string; strokeColor?:string; strokeWidth?:number; strokeDash?:string
}
interface FNode {
  id:string; type:NodeType; x:number; y:number; w:number; h:number; label:string
  textStyle?:TextStyle; nodeStyle?:NodeStyle
}
interface FEdge { id:string; from:string; to:string; fromPort:Port; toPort:Port; label:string; waypoints?:{x:number;y:number}[] }
interface Diagram { nodes:FNode[]; edges:FEdge[] }
interface FFile { path:string; name:string; project:string }
interface Project { name:string; files:FFile[] }

const EMPTY_DIAGRAM: Diagram = { nodes:[], edges:[] }

const NODE_CFG: Record<NodeType,{label:string;color:string;w:number;h:number}> = {
  start:      {label:'Start',        color:'#22C55E', w:140, h:56},
  end:        {label:'Konec',        color:'#EF4444', w:140, h:56},
  process:    {label:'Proces',       color:'#3B82F6', w:180, h:64},
  decision:   {label:'Rozhodnutí',   color:'#F59E0B', w:180, h:90},
  io:         {label:'Vstup/Výstup', color:'#8B5CF6', w:180, h:64},
  loop:       {label:'Smyčka',       color:'#06B6D4', w:180, h:64},
  subroutine: {label:'Podprogram',   color:'#EC4899', w:180, h:64},
  connector:  {label:'A',            color:'#A3A3A3', w:56,  h:56},
  text:       {label:'Text...',      color:'#E2E8F0', w:160, h:40},
}

// Preset color themes for the properties panel
const PRESETS = [
  {name:'Modrá',   fill:'#3B82F620',stroke:'#3B82F6'},
  {name:'Zelená',  fill:'#22C55E20',stroke:'#22C55E'},
  {name:'Červená', fill:'#EF444420',stroke:'#EF4444'},
  {name:'Žlutá',   fill:'#F59E0B20',stroke:'#F59E0B'},
  {name:'Fialová', fill:'#8B5CF620',stroke:'#8B5CF6'},
  {name:'Cyan',    fill:'#06B6D420',stroke:'#06B6D4'},
  {name:'Růžová',  fill:'#EC489920',stroke:'#EC4899'},
  {name:'Šedá',    fill:'#6B728020',stroke:'#6B7280'},
]

function portXY(n:FNode,port:Port):[number,number]{
  switch(port){
    case 'top':    return [n.x+n.w/2, n.y]
    case 'bottom': return [n.x+n.w/2, n.y+n.h]
    case 'left':   return [n.x,       n.y+n.h/2]
    case 'right':  return [n.x+n.w,   n.y+n.h/2]
  }
}
function bestPorts(a:FNode,b:FNode):[Port,Port]{
  const dx=(b.x+b.w/2)-(a.x+a.w/2), dy=(b.y+b.h/2)-(a.y+a.h/2)
  if(Math.abs(dy)>=Math.abs(dx)) return dy>0?['bottom','top']:['top','bottom']
  return dx>0?['right','left']:['left','right']
}
function curvePath(x1:number,y1:number,x2:number,y2:number){
  const dy=Math.abs(y2-y1)*0.5
  return `M${x1},${y1} C${x1},${y1+dy} ${x2},${y2-dy} ${x2},${y2}`
}
function edgePathWithWaypoints(x1:number,y1:number,x2:number,y2:number,wps?:{x:number;y:number}[]): string {
  if(!wps||wps.length===0) return curvePath(x1,y1,x2,y2)
  let path=`M${x1},${y1}`
  const points=[{x:x1,y:y1},...wps,{x:x2,y:y2}]
  for(let i=0;i<points.length-1;i++){
    const a=points[i],b=points[i+1]
    const dy=Math.abs(b.y-a.y)*0.4
    path+=` C${a.x},${a.y+dy} ${b.x},${b.y-dy} ${b.x},${b.y}`
  }
  return path
}

// ── SVG shape for each node type ──────────────────────────────────────────────
function NodeShape({n,sel}:{n:FNode;sel:boolean}){
  if(n.type==='text'){
    // Text block: just a dashed selection box, transparent fill
    return sel
      ? <rect x={n.x} y={n.y} width={n.w} height={n.h} fill="rgba(255,255,255,.03)" stroke="rgba(255,255,255,.3)" strokeWidth={1} strokeDasharray="4,3" rx={3}/>
      : <rect x={n.x} y={n.y} width={n.w} height={n.h} fill="transparent" stroke="transparent"/>
  }
  const defColor = NODE_CFG[n.type].color
  const fill   = n.nodeStyle?.fillColor   ?? defColor+'20'
  const stroke = sel ? '#fff' : (n.nodeStyle?.strokeColor ?? defColor)
  const sw     = n.nodeStyle?.strokeWidth ?? (sel?2.5:1.5)
  const dash   = n.nodeStyle?.strokeDash  ?? undefined
  const props  = {fill,stroke,strokeWidth:sw,strokeDasharray:dash}
  const {x,y,w,h} = n
  switch(n.type){
    case 'start': case 'end': case 'connector':
      return <ellipse cx={x+w/2} cy={y+h/2} rx={w/2} ry={h/2} {...props}/>
    case 'decision':
      return <polygon points={`${x+w/2},${y} ${x+w},${y+h/2} ${x+w/2},${y+h} ${x},${y+h/2}`} {...props}/>
    case 'io':
      return <polygon points={`${x+18},${y} ${x+w},${y} ${x+w-18},${y+h} ${x},${y+h}`} {...props}/>
    case 'loop':
      return <polygon points={`${x+16},${y} ${x+w-16},${y} ${x+w},${y+h/2} ${x+w-16},${y+h} ${x+16},${y+h} ${x},${y+h/2}`} {...props}/>
    case 'subroutine':
      return <>
        <rect x={x} y={y} width={w} height={h} rx={4} {...props}/>
        <line x1={x+12} y1={y} x2={x+12} y2={y+h} stroke={stroke} strokeWidth={1}/>
        <line x1={x+w-12} y1={y} x2={x+w-12} y2={y+h} stroke={stroke} strokeWidth={1}/>
      </>
    default:
      return <rect x={x} y={y} width={w} height={h} rx={8} {...props}/>
  }
}

// ── Mini SVG for palette previews ────────────────────────────────────────────
function PalettePreview({type,color}:{type:NodeType;color:string}){
  const W=44, H=26, fill=color+'25', stroke=color, sw=1.5
  const props={fill,stroke,strokeWidth:sw}
  switch(type){
    case 'start': case 'end': case 'connector':
      return <svg width={W} height={H}><ellipse cx={W/2} cy={H/2} rx={W/2-1} ry={H/2-1} {...props}/></svg>
    case 'decision':
      return <svg width={W} height={H}><polygon points={`${W/2},1 ${W-1},${H/2} ${W/2},${H-1} 1,${H/2}`} {...props}/></svg>
    case 'io':
      return <svg width={W} height={H}><polygon points={`8,1 ${W-1},1 ${W-9},${H-1} 0,${H-1}`} {...props}/></svg>
    case 'loop':
      return <svg width={W} height={H}><polygon points={`8,1 ${W-9},1 ${W-1},${H/2} ${W-9},${H-1} 8,${H-1} 0,${H/2}`} {...props}/></svg>
    case 'subroutine':
      return <svg width={W} height={H}>
        <rect x={1} y={1} width={W-2} height={H-2} rx={2} {...props}/>
        <line x1={7} y1={1} x2={7} y2={H-1} stroke={stroke} strokeWidth={1}/>
        <line x1={W-8} y1={1} x2={W-8} y2={H-1} stroke={stroke} strokeWidth={1}/>
      </svg>
    case 'text':
      return <svg width={W} height={H}><rect x={1} y={5} width={W-2} height={H-12} fill="transparent" stroke={color} strokeWidth={1} strokeDasharray="3,2" rx={2}/><text x={W/2} y={H/2+2} textAnchor="middle" dominantBaseline="central" fontSize={8} fill={color} fontFamily="DM Sans,system-ui">Aa</text></svg>
    default:
      return <svg width={W} height={H}><rect x={1} y={1} width={W-2} height={H-2} rx={4} {...props}/></svg>
  }
}

// ── Pseudocode generation ─────────────────────────────────────────────────────
function genPseudo(d:Diagram): string {
  if(d.nodes.length===0) return '// Prázdný diagram\n'
  const lines=['ALGORITMUS','']
  const visited=new Set<string>()
  const nm=new Map(d.nodes.map(n=>[n.id,n]))
  function ind(depth:number){ return '  '.repeat(depth) }
  function walk(id:string,depth:number):string[]{
    if(visited.has(id)) return []
    visited.add(id)
    const node=nm.get(id); if(!node) return []
    const out:string[]=[]
    const outs=d.edges.filter(e=>e.from===id)
    switch(node.type){
      case 'start':      out.push(`${ind(depth)}ZAČÁTEK`); break
      case 'end':        out.push(`${ind(depth)}KONEC`); return out
      case 'connector':  out.push(`${ind(depth)}// Spojka: ${node.label}`); break
      case 'subroutine': out.push(`${ind(depth)}VOLEJ ${node.label}()`); break
      case 'process':    out.push(`${ind(depth)}${node.label}`); break
      case 'io':
        if(/vstup|input|zadej|načti/i.test(node.label))
          out.push(`${ind(depth)}NAČTI ${node.label.replace(/vstup|input|zadej|načti/i,'').trim()||'hodnota'}`)
        else
          out.push(`${ind(depth)}VYPIŠ ${node.label}`)
        break
      case 'decision':
        out.push(`${ind(depth)}POKUD ${node.label} PAK`)
        const yes=outs.find(e=>/ano|yes|true|pravda/i.test(e.label||'')||outs.indexOf(e)===0)
        const no=outs.find(e=>/ne|no|false|nepravda/i.test(e.label||'')||outs.indexOf(e)===1)
        if(yes){ out.push(...walk(yes.to,depth+1)) }
        if(no){ out.push(`${ind(depth)}JINAK`); out.push(...walk(no.to,depth+1)) }
        out.push(`${ind(depth)}KONEC_POKUD`)
        return out
      case 'loop':
        out.push(`${ind(depth)}DOKUD ${node.label} OPAKUJ`)
        if(outs[0]) out.push(...walk(outs[0].to,depth+1))
        out.push(`${ind(depth)}KONEC_DOKUD`)
        return out
    }
    const next=outs.find(e=>!visited.has(e.to))
    if(next) out.push(...walk(next.to,depth))
    return out
  }
  const start=d.nodes.find(n=>n.type==='start')
  if(start) lines.push(...walk(start.id,0))
  else d.nodes.forEach(n=>{if(!visited.has(n.id))lines.push(...walk(n.id,0))})
  lines.push('','KONEC_ALGORITMU')
  return lines.join('\n')+'\n'
}

// ─────────────────────────────────────────────────────────────────────────────
export default function FlowchartEditor({profile}:{profile:any}){
  const supabase=createClient()
  const accent=profile?.accent_color??'#7C3AED'
  const uid=profile?.id as string

  const [projects,setProjects]   = useState<Project[]>([])
  const [loadingProj,setLP]      = useState(true)
  const [activeFile,setActiveFile] = useState<FFile|null>(null)
  const [isDirty,setIsDirty]     = useState(false)
  const [expanded,setExpanded]   = useState<Set<string>>(new Set([DEFAULT_PROJ]))
  const [saving,setSaving]       = useState(false)
  const [saveMsg,setSaveMsg]     = useState('')

  const diagramRef = useRef<Diagram>(EMPTY_DIAGRAM)
  const [diagram,setDiagramState] = useState<Diagram>(EMPTY_DIAGRAM)
  function setDiagram(fn:(d:Diagram)=>Diagram){
    const next=fn(diagramRef.current)
    diagramRef.current=next; setDiagramState(next); setIsDirty(true)
  }

  const [selectedIds,setSelectedIds] = useState<Set<string>>(new Set())
  const [editingId,setEditingId]     = useState<string|null>(null)
  const [editVal,setEditVal]         = useState('')
  const [edgeLabelId,setEdgeLabelId] = useState<string|null>(null)
  const [edgeLabelVal,setEdgeLabelVal] = useState('')
  const [quickInsert,setQuickInsert] = useState<{x:number;y:number;svgX:number;svgY:number;fromId:string;fromPort:Port}|null>(null)

  const svgRef   = useRef<SVGSVGElement>(null)
  const [pan,setPan]   = useState({x:80,y:60})
  const [zoom,setZoom] = useState(1)
  const panRef   = useRef({x:80,y:60})
  const zoomRef  = useRef(1)
  const dragNode = useRef<{id:string;ox:number;oy:number;sx:number;sy:number}|null>(null)
  const panStart = useRef<{mx:number;my:number;px:number;py:number}|null>(null)
  const [drawingEdge,setDrawingEdge] = useState<{fromId:string;fromPort:Port;mx:number;my:number}|null>(null)
  const drawingRef = useRef<typeof drawingEdge>(null)
  const resizeRef = useRef<{id:string;corner:string;ox:number;oy:number;ow:number;oh:number;nx:number;ny:number}|null>(null)
  // Edge waypoint drag
  const edgeDragRef = useRef<{edgeId:string;wpIdx:number;ox:number;oy:number}|null>(null)

  // Modals
  const [nfm,setNFM]=useState(false); const [nfn,setNFN]=useState(''); const [nfp,setNFP]=useState(DEFAULT_PROJ)
  const [npm,setNPM]=useState(false); const [npn,setNPN]=useState('')
  const [dfm,setDFM]=useState<FFile|null>(null)
  const [dpm,setDPM]=useState<string|null>(null)
  const [pseudoModal,setPseudoModal]=useState(false); const [pseudoCode,setPseudoCode]=useState('')
  // Rename
  const [renamingFile,setRenamingFile]  = useState<FFile|null>(null)
  const [renameFileVal,setRFV]         = useState('')
  const [renamingProj,setRenamingProj] = useState<string|null>(null)
  const [renameProjVal,setRPV]         = useState('')

  // ── Storage ────────────────────────────────────────────────────────────────
  async function push(path:string,data:Diagram){
    const blob=new Blob([JSON.stringify(data)],{type:'application/json'})
    await supabase.storage.from(BUCKET).remove([path])
    const {error}=await supabase.storage.from(BUCKET).upload(path,blob,{cacheControl:'0'})
    return error?.message??null
  }
  async function pull(path:string):Promise<Diagram>{
    const {data,error}=await supabase.storage.from(BUCKET).download(path)
    if(error||!data) return EMPTY_DIAGRAM
    try{return JSON.parse(await data.text())}catch{return EMPTY_DIAGRAM}
  }

  // ── Projects ───────────────────────────────────────────────────────────────
  const refresh=useCallback(async()=>{
    setLP(true)
    const {data:top}=await supabase.storage.from(BUCKET).list(`zaci/${uid}`,{limit:200,sortBy:{column:'name',order:'asc'}})
    if(!top){setLP(false);return}
    const res:Project[]=[]
    for(const item of top){
      if(item.metadata!=null) continue
      const {data:files}=await supabase.storage.from(BUCKET).list(`zaci/${uid}/${item.name}`,{limit:200})
      res.push({name:item.name,files:(files??[]).filter(f=>f.name!=='.gitkeep'&&f.metadata!=null).map(f=>({
        path:`zaci/${uid}/${item.name}/${f.name}`,name:f.name,project:item.name
      }))})
    }
    setProjects(res)
    if(res.length===0){await push(fp(uid,DEFAULT_PROJ,'diagram.flow'),EMPTY_DIAGRAM);await refresh();return}
    setNFP(res[0]?.name??DEFAULT_PROJ); setLP(false)
  },[uid])
  useEffect(()=>{refresh()},[refresh])

  async function openFile(file:FFile){
    if(isDirty&&!confirm('Neuložené změny budou ztraceny.')) return
    const data=await pull(file.path)
    diagramRef.current=data; setDiagramState(data); setActiveFile(file); setIsDirty(false); setSelectedIds(new Set())
    localStorage.setItem('cb_flow_last',JSON.stringify(file))
  }
  async function save(){
    if(!activeFile){setNFM(true);return}
    setSaving(true)
    const err=await push(activeFile.path,diagramRef.current)
    setSaving(false)
    if(err){setSaveMsg('❌ '+err);return}
    setIsDirty(false); setSaveMsg('✓ Uloženo'); setTimeout(()=>setSaveMsg(''),2500)
    await refresh()
  }
  async function createFile(){
    const name=(nfn.trim()||'diagram').replace(/\.flow$/,'')+'.flow'
    const proj=nfp||DEFAULT_PROJ; const path=fp(uid,proj,name)
    await push(path,EMPTY_DIAGRAM)
    setNFM(false); setNFN('')
    await refresh()
    await openFile({path,name,project:proj})
  }
  async function createProject(){
    await push(fp(uid,npn.trim()||'Projekt','diagram.flow'),EMPTY_DIAGRAM)
    setNPM(false); setNPN(''); await refresh()
  }
  async function deleteFile(file:FFile){
    await supabase.storage.from(BUCKET).remove([file.path])
    if(activeFile?.path===file.path){diagramRef.current=EMPTY_DIAGRAM;setDiagramState(EMPTY_DIAGRAM);setActiveFile(null)}
    setDFM(null); await refresh()
  }
  async function deleteProject(name:string){
    const proj=projects.find(p=>p.name===name)
    const paths=proj?.files.map(f=>f.path)??[]
    if(paths.length) await supabase.storage.from(BUCKET).remove(paths)
    if(activeFile?.project===name){diagramRef.current=EMPTY_DIAGRAM;setDiagramState(EMPTY_DIAGRAM);setActiveFile(null)}
    setDPM(null); await refresh()
  }

  // ── Canvas helpers ────────────────────────────────────────────────────────
  function clientToSvg(cx:number,cy:number){
    const r=svgRef.current?.getBoundingClientRect(); if(!r) return {x:0,y:0}
    return {x:(cx-r.left-panRef.current.x)/zoomRef.current,y:(cy-r.top-panRef.current.y)/zoomRef.current}
  }
  function addNode(type:NodeType,x:number,y:number){
    const cfg=NODE_CFG[type]; const id='n'+Date.now()
    setDiagram(d=>({...d,nodes:[...d.nodes,{id,type,x,y,w:cfg.w,h:cfg.h,label:cfg.label}]}))
  }
  function deleteSelected(){
    setDiagram(d=>({nodes:d.nodes.filter(n=>!selectedIds.has(n.id)),edges:d.edges.filter(e=>!selectedIds.has(e.id)&&!selectedIds.has(e.from)&&!selectedIds.has(e.to))}))
    setSelectedIds(new Set())
  }
  async function renameFile(file:FFile, newName:string){
    if(!newName.trim()||newName===file.name) return
    const fname=newName.trim().endsWith('.flow')?newName.trim():newName.trim()+'.flow'
    const newPath=`zaci/${uid}/${sanitize(file.project)}/${sanitize(fname)}`
    const data=diagramRef.current
    // Load current data from storage
    const cur=await pull(file.path)
    await push(newPath,cur)
    await supabase.storage.from(BUCKET).remove([file.path])
    if(activeFile?.path===file.path) setActiveFile({...file,path:newPath,name:fname})
    setRenamingFile(null)
    await refresh()
  }

  async function renameProject(oldName:string, newName:string){
    if(!newName.trim()||newName===oldName) return
    const proj=projects.find(p=>p.name===oldName); if(!proj) return
    for(const file of proj.files){
      const cur=await pull(file.path)
      const newPath=`zaci/${uid}/${sanitize(newName)}/${sanitize(file.name)}`
      await push(newPath,cur)
      await supabase.storage.from(BUCKET).remove([file.path])
      if(activeFile?.path===file.path) setActiveFile({...activeFile,path:newPath,project:newName})
    }
    setRenamingProj(null)
    setExpanded(prev=>{const n=new Set(prev);n.delete(oldName);n.add(newName);return n})
    await refresh()
  }

  function quickInsertNode(type:NodeType){
    if(!quickInsert) return
    const cfg=NODE_CFG[type]; const id='n'+Date.now()
    const nx=quickInsert.svgX-cfg.w/2; const ny=quickInsert.svgY-cfg.h/2
    const newNode:FNode={id,type,x:Math.max(0,nx),y:Math.max(0,ny),w:cfg.w,h:cfg.h,label:cfg.label}
    const fromNode=diagramRef.current.nodes.find(n=>n.id===quickInsert.fromId)
    const [_fp,tp]=fromNode?bestPorts(fromNode,newNode):['bottom' as Port,'top' as Port]
    const eid='e'+Date.now()
    setDiagram(d=>({nodes:[...d.nodes,newNode],edges:[...d.edges,{id:eid,from:quickInsert.fromId,to:id,fromPort:quickInsert.fromPort,toPort:tp,label:''}]}))
    setQuickInsert(null)
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
  function updateNode(id:string,patch:Partial<FNode>){
    setDiagram(d=>({...d,nodes:d.nodes.map(n=>n.id===id?{...n,...patch}:n)}))
  }
  function updateNodeStyle(id:string,patch:Partial<NodeStyle>){
    setDiagram(d=>({...d,nodes:d.nodes.map(n=>n.id===id?{...n,nodeStyle:{...n.nodeStyle,...patch}}:n)}))
  }
  function updateTextStyle(id:string,patch:Partial<TextStyle>){
    setDiagram(d=>({...d,nodes:d.nodes.map(n=>n.id===id?{...n,textStyle:{...n.textStyle,...patch}}:n)}))
  }

  // ── Global mouse ──────────────────────────────────────────────────────────
  useEffect(()=>{
    function onMove(e:MouseEvent){
      if(dragNode.current){
        const {id,ox,oy,sx,sy}=dragNode.current
        const nx=Math.max(0,ox+(e.clientX-sx)/zoomRef.current)
        const ny=Math.max(0,oy+(e.clientY-sy)/zoomRef.current)
        const node=diagramRef.current.nodes.find(n=>n.id===id)
        if(node){node.x=nx;node.y=ny}
        setDiagramState({...diagramRef.current}); return
      }
      if(panStart.current){
        const px=panStart.current.px+(e.clientX-panStart.current.mx)
        const py=panStart.current.py+(e.clientY-panStart.current.my)
        panRef.current={x:px,y:py}; setPan({x:px,y:py}); return
      }
      if(drawingRef.current){
        const c=clientToSvg(e.clientX,e.clientY)
        setDrawingEdge({...drawingRef.current,mx:c.x,my:c.y}); return
      }
      if(resizeRef.current){
        const r=resizeRef.current
        const dx=(e.clientX-r.ox)/zoomRef.current, dy=(e.clientY-r.oy)/zoomRef.current
        const node=diagramRef.current.nodes.find(n=>n.id===r.id)
        if(node){
          if(r.corner.includes('right'))  node.w=Math.max(56,r.ow+dx)
          if(r.corner.includes('bottom')) node.h=Math.max(30,r.oh+dy)
          if(r.corner.includes('left'))  {node.w=Math.max(56,r.ow-dx);node.x=r.nx+Math.min(dx,r.ow-56)}
          if(r.corner.includes('top'))   {node.h=Math.max(30,r.oh-dy);node.y=r.ny+Math.min(dy,r.oh-30)}
        }
        setDiagramState({...diagramRef.current})
      }
      if(edgeDragRef.current){
        const c=clientToSvg(e.clientX,e.clientY)
        const ed=edgeDragRef.current
        const edge=diagramRef.current.edges.find(e=>e.id===ed.edgeId)
        if(edge){
          const wps=[...(edge.waypoints??[])]
          wps[ed.wpIdx]={x:c.x,y:c.y}
          edge.waypoints=wps
        }
        setDiagramState({...diagramRef.current})
      }
    }
    function onUp(e:MouseEvent){
      if(drawingRef.current){
        const de=drawingRef.current; const c=clientToSvg(e.clientX,e.clientY)
        const target=diagramRef.current.nodes.find(n=>c.x>=n.x&&c.x<=n.x+n.w&&c.y>=n.y&&c.y<=n.y+n.h&&n.id!==de.fromId)
        if(target){
          const [fp2,tp]=bestPorts(diagramRef.current.nodes.find(n=>n.id===de.fromId)!,target)
          const id='e'+Date.now()
          setDiagram(d=>({...d,edges:[...d.edges,{id,from:de.fromId,to:target.id,fromPort:de.fromPort,toPort:tp,label:''}]}))
          setEdgeLabelId(id); setEdgeLabelVal('')
        } else {
          // Dropped in empty space → quick-insert popup
          setQuickInsert({x:e.clientX,y:e.clientY,svgX:c.x,svgY:c.y,fromId:de.fromId,fromPort:de.fromPort})
        }
        drawingRef.current=null; setDrawingEdge(null)
      }
      dragNode.current=null; panStart.current=null; resizeRef.current=null; edgeDragRef.current=null
    }
    window.addEventListener('mousemove',onMove)
    window.addEventListener('mouseup',onUp)
    return ()=>{window.removeEventListener('mousemove',onMove);window.removeEventListener('mouseup',onUp)}
  },[])

  // ── Keyboard ──────────────────────────────────────────────────────────────
  useEffect(()=>{
    function onKey(e:KeyboardEvent){
      if(editingId||edgeLabelId) return
      if((e.ctrlKey||e.metaKey)&&e.key==='s'){e.preventDefault();save()}
      if((e.key==='Delete'||e.key==='Backspace')&&selectedIds.size>0) deleteSelected()
      if(e.key==='Escape'){setSelectedIds(new Set());setQuickInsert(null)}
    }
    window.addEventListener('keydown',onKey)
    return ()=>window.removeEventListener('keydown',onKey)
  },[selectedIds,editingId,edgeLabelId])

  // ── Export ────────────────────────────────────────────────────────────────
  function exportSVG(){
    if(!svgRef.current) return
    const svg=svgRef.current
    // Temporarily hide ports and resize handles
    svg.querySelectorAll('.fc-port,.fc-resize-h').forEach((el:any)=>{el.dataset.oldDisplay=el.style.display;el.style.display='none'})
    const src='<?xml version="1.0" encoding="UTF-8"?>\n'+new XMLSerializer().serializeToString(svg)
    svg.querySelectorAll('.fc-port,.fc-resize-h').forEach((el:any)=>{el.style.display=el.dataset.oldDisplay??''})
    const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([src],{type:'image/svg+xml'}))
    a.download=(activeFile?.name.replace('.flow','')||'diagram')+'.svg'; a.click()
  }
  function exportPNG(){
    if(!svgRef.current) return
    const svg=svgRef.current
    svg.querySelectorAll('.fc-port,.fc-resize-h').forEach((el:any)=>{el.dataset.oldDisplay=el.style.display;el.style.display='none'})
    const src=new XMLSerializer().serializeToString(svg)
    svg.querySelectorAll('.fc-port,.fc-resize-h').forEach((el:any)=>{el.style.display=el.dataset.oldDisplay??''})
    const img=new Image(); const url=URL.createObjectURL(new Blob([src],{type:'image/svg+xml'}))
    img.onload=()=>{
      const c=document.createElement('canvas'); c.width=svg.clientWidth*2; c.height=svg.clientHeight*2
      const ctx=c.getContext('2d')!; ctx.fillStyle='#090B10'; ctx.fillRect(0,0,c.width,c.height)
      ctx.scale(2,2); ctx.drawImage(img,0,0); URL.revokeObjectURL(url)
      const a=document.createElement('a'); a.href=c.toDataURL('image/png')
      a.download=(activeFile?.name.replace('.flow','')||'diagram')+'.png'; a.click()
    }; img.src=url
  }

  // ── Selected node for properties panel ───────────────────────────────────
  const selNodeId = selectedIds.size===1 ? [...selectedIds][0] : null
  const selNode   = selNodeId ? diagram.nodes.find(n=>n.id===selNodeId) : null

  // ── Small helpers for properties panel ───────────────────────────────────
  const inp:React.CSSProperties={padding:'7px 10px',background:D.bgMid,border:`1px solid ${D.border}`,borderRadius:7,fontSize:12,color:D.txtPri,fontFamily:'inherit',outline:'none',width:'100%',boxSizing:'border-box' as const}
  const smallLabel:React.CSSProperties={fontSize:10,fontWeight:600,color:D.txtSec,textTransform:'uppercase' as const,letterSpacing:'.06em',display:'block',marginBottom:4}

  function Modal({title,onClose,children}:{title:string;onClose:()=>void;children:React.ReactNode}){
    return<>
      <div onClick={onClose} style={{position:'fixed',inset:0,background:'rgba(0,0,0,.7)',zIndex:9998,backdropFilter:'blur(4px)'}}/>
      <div style={{position:'fixed',top:'50%',left:'50%',transform:'translate(-50%,-50%)',zIndex:9999,width:'100%',maxWidth:460,padding:'0 16px'}}>
        <div style={{background:D.bgCard,borderRadius:16,padding:'24px',border:`1px solid ${D.border}`,boxShadow:'0 24px 60px rgba(0,0,0,.7)'}}>
          <div style={{fontSize:15,fontWeight:700,color:D.txtPri,marginBottom:14}}>{title}</div>
          {children}
        </div>
      </div>
    </>
  }

  const PALETTE_ITEMS:[NodeType,string][]=[
    ['start','Start'],['end','Konec'],['process','Proces'],
    ['decision','Rozhodnutí'],['io','Vstup / Výstup'],['loop','Smyčka'],
    ['subroutine','Podprogram'],['connector','Spojka'],['text','Volný text'],
  ]
  const fcBtn:React.CSSProperties={background:'rgba(255,255,255,.06)',border:'1px solid rgba(255,255,255,.1)',color:'rgba(255,255,255,.6)',borderRadius:7,padding:'6px 11px',cursor:'pointer',fontFamily:'inherit',fontSize:12,transition:'all .12s',whiteSpace:'nowrap' as const}

  // ─────────────────────────────────────────────────────────────────────────
  return(
    <DarkLayout profile={profile} activeRoute="/student/flowchart" fullContent>
      <style>{`
        .fc-palette-item{display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:7px;cursor:grab;border:1px solid transparent;transition:all .12s;}
        .fc-palette-item:hover{background:rgba(255,255,255,.07)!important;border-color:rgba(255,255,255,.1)!important;}
        .fc-file-row{display:flex;align-items:center;padding:5px 12px 5px 26px;cursor:pointer;gap:5px;transition:background .1s;}
        .fc-file-row:hover{background:rgba(255,255,255,.05)!important;}
        .fc-btn:hover{background:rgba(255,255,255,.12)!important;color:#fff!important;}
        .fc-port{fill:transparent;stroke:transparent;cursor:crosshair;transition:fill .15s,stroke .15s;}
        .fc-node-g:hover .fc-port{fill:rgba(255,255,255,.15)!important;stroke:rgba(255,255,255,.6)!important;}
        .fc-port:hover{fill:rgba(255,255,255,.5)!important;stroke:white!important;}
        .fc-resize-h{fill:rgba(255,255,255,.15);cursor:se-resize;}
        .fc-resize-h:hover{fill:rgba(255,255,255,.45);}
        .prop-toggle{background:transparent;border:1px solid rgba(255,255,255,.12);border-radius:5px;color:rgba(255,255,255,.4);padding:3px 7px;cursor:pointer;font-family:inherit;font-size:12px;transition:all .12s;}
        .qi-item{display:flex;flex-direction:column;align-items:center;gap:4px;padding:8px;border-radius:9px;cursor:pointer;border:1px solid transparent;background:rgba(255,255,255,.04);transition:all .12s;}
        .qi-item:hover{background:rgba(255,255,255,.12)!important;border-color:rgba(255,255,255,.2)!important;transform:scale(1.05);}
        .prop-toggle.active{background:rgba(255,255,255,.15);border-color:rgba(255,255,255,.3);color:#fff;}
      `}</style>

      {/* ── Modals ── */}
      {nfm&&<Modal title="📄 Nový diagram" onClose={()=>setNFM(false)}>
        <div style={{display:'flex',flexDirection:'column',gap:10}}>
          <div><label style={smallLabel}>Název</label><input value={nfn} onChange={e=>setNFN(e.target.value)} onKeyDown={e=>e.key==='Enter'&&createFile()} placeholder="muj-diagram" autoFocus style={inp}/></div>
          <div><label style={smallLabel}>Projekt</label><select value={nfp} onChange={e=>setNFP(e.target.value)} style={{...inp,cursor:'pointer'}}>{projects.map(p=><option key={p.name} value={p.name}>{p.name}</option>)}</select></div>
          <div style={{display:'flex',gap:8,marginTop:4}}>
            <button onClick={createFile} style={{flex:1,padding:'9px',background:accent,color:'#fff',border:'none',borderRadius:8,cursor:'pointer',fontFamily:'inherit',fontWeight:600}}>Vytvořit</button>
            <button onClick={()=>setNFM(false)} style={{padding:'9px 14px',background:D.bgMid,color:D.txtSec,border:`1px solid ${D.border}`,borderRadius:8,cursor:'pointer',fontFamily:'inherit'}}>Zrušit</button>
          </div>
        </div>
      </Modal>}
      {npm&&<Modal title="📁 Nový projekt" onClose={()=>setNPM(false)}>
        <input value={npn} onChange={e=>setNPN(e.target.value)} onKeyDown={e=>e.key==='Enter'&&createProject()} placeholder="Název projektu" autoFocus style={{...inp,marginBottom:12}}/>
        <div style={{display:'flex',gap:8}}>
          <button onClick={createProject} style={{flex:1,padding:'9px',background:accent,color:'#fff',border:'none',borderRadius:8,cursor:'pointer',fontFamily:'inherit',fontWeight:600}}>Vytvořit</button>
          <button onClick={()=>setNPM(false)} style={{padding:'9px 14px',background:D.bgMid,color:D.txtSec,border:`1px solid ${D.border}`,borderRadius:8,cursor:'pointer',fontFamily:'inherit'}}>Zrušit</button>
        </div>
      </Modal>}
      {dfm&&<Modal title="🗑️ Smazat diagram" onClose={()=>setDFM(null)}>
        <p style={{fontSize:13,color:D.txtSec,marginBottom:14}}>Smazat <strong style={{color:D.txtPri}}>{dfm.name}</strong>?</p>
        <div style={{display:'flex',gap:8}}>
          <button onClick={()=>deleteFile(dfm)} style={{flex:1,padding:'9px',background:D.danger,color:'#fff',border:'none',borderRadius:8,cursor:'pointer',fontFamily:'inherit',fontWeight:600}}>Smazat</button>
          <button onClick={()=>setDFM(null)} style={{padding:'9px 14px',background:D.bgMid,color:D.txtSec,border:`1px solid ${D.border}`,borderRadius:8,cursor:'pointer',fontFamily:'inherit'}}>Zrušit</button>
        </div>
      </Modal>}
      {dpm&&<Modal title="🗑️ Smazat projekt" onClose={()=>setDPM(null)}>
        <p style={{fontSize:13,color:D.txtSec,marginBottom:14}}>Smazat projekt <strong style={{color:D.txtPri}}>{dpm}</strong> a všechny diagramy?</p>
        <div style={{display:'flex',gap:8}}>
          <button onClick={()=>deleteProject(dpm)} style={{flex:1,padding:'9px',background:D.danger,color:'#fff',border:'none',borderRadius:8,cursor:'pointer',fontFamily:'inherit',fontWeight:600}}>Smazat</button>
          <button onClick={()=>setDPM(null)} style={{padding:'9px 14px',background:D.bgMid,color:D.txtSec,border:`1px solid ${D.border}`,borderRadius:8,cursor:'pointer',fontFamily:'inherit'}}>Zrušit</button>
        </div>
      </Modal>}
      {edgeLabelId&&<Modal title="✏️ Popisek šipky" onClose={()=>setEdgeLabelId(null)}>
        <input value={edgeLabelVal} onChange={e=>setEdgeLabelVal(e.target.value)} onKeyDown={e=>e.key==='Enter'&&finishEdgeLabel()} placeholder="např. Ano / Ne (volitelné)" autoFocus style={{...inp,marginBottom:12}}/>
        <div style={{display:'flex',gap:8}}>
          <button onClick={finishEdgeLabel} style={{flex:1,padding:'9px',background:accent,color:'#fff',border:'none',borderRadius:8,cursor:'pointer',fontFamily:'inherit',fontWeight:600}}>Potvrdit</button>
          <button onClick={()=>setEdgeLabelId(null)} style={{padding:'9px 14px',background:D.bgMid,color:D.txtSec,border:`1px solid ${D.border}`,borderRadius:8,cursor:'pointer',fontFamily:'inherit'}}>Bez popisku</button>
        </div>
      </Modal>}
      {/* Rename file modal */}
      {renamingFile&&<Modal title="✏️ Přejmenovat diagram" onClose={()=>setRenamingFile(null)}>
        <input value={renameFileVal} onChange={e=>setRFV(e.target.value)}
          onKeyDown={e=>e.key==='Enter'&&renameFile(renamingFile,renameFileVal)}
          autoFocus style={{...inp,marginBottom:12}}/>
        <div style={{display:'flex',gap:8}}>
          <button onClick={()=>renameFile(renamingFile,renameFileVal)} style={{flex:1,padding:'9px',background:accent,color:'#fff',border:'none',borderRadius:8,cursor:'pointer',fontFamily:'inherit',fontWeight:600}}>Uložit</button>
          <button onClick={()=>setRenamingFile(null)} style={{padding:'9px 14px',background:D.bgMid,color:D.txtSec,border:`1px solid ${D.border}`,borderRadius:8,cursor:'pointer',fontFamily:'inherit'}}>Zrušit</button>
        </div>
      </Modal>}

      {/* Rename project modal */}
      {renamingProj&&<Modal title="✏️ Přejmenovat projekt" onClose={()=>setRenamingProj(null)}>
        <input value={renameProjVal} onChange={e=>setRPV(e.target.value)}
          onKeyDown={e=>e.key==='Enter'&&renameProject(renamingProj,renameProjVal)}
          autoFocus style={{...inp,marginBottom:12}}/>
        <div style={{display:'flex',gap:8}}>
          <button onClick={()=>renameProject(renamingProj,renameProjVal)} style={{flex:1,padding:'9px',background:accent,color:'#fff',border:'none',borderRadius:8,cursor:'pointer',fontFamily:'inherit',fontWeight:600}}>Uložit</button>
          <button onClick={()=>setRenamingProj(null)} style={{padding:'9px 14px',background:D.bgMid,color:D.txtSec,border:`1px solid ${D.border}`,borderRadius:8,cursor:'pointer',fontFamily:'inherit'}}>Zrušit</button>
        </div>
      </Modal>}

      {pseudoModal&&<Modal title="📋 Pseudokód" onClose={()=>setPseudoModal(false)}>
        <pre style={{background:'#1e1e2e',color:'#cdd6f4',padding:'14px',borderRadius:10,fontSize:12,overflowX:'auto',maxHeight:380,whiteSpace:'pre-wrap',fontFamily:'ui-monospace,monospace',marginBottom:12}}>{pseudoCode}</pre>
        <div style={{display:'flex',gap:8}}>
          <button onClick={()=>navigator.clipboard.writeText(pseudoCode)} style={{flex:1,padding:'9px',background:accent,color:'#fff',border:'none',borderRadius:8,cursor:'pointer',fontFamily:'inherit',fontWeight:600}}>📋 Kopírovat</button>
          <button onClick={()=>setPseudoModal(false)} style={{padding:'9px 14px',background:D.bgMid,color:D.txtSec,border:`1px solid ${D.border}`,borderRadius:8,cursor:'pointer',fontFamily:'inherit'}}>Zavřít</button>
        </div>
      </Modal>}

      {/* ── Quick Insert popup ── */}
      {quickInsert&&(
        <>
          <div onClick={()=>setQuickInsert(null)} style={{position:'fixed',inset:0,zIndex:9990}}/>
          <div style={{position:'fixed',left:quickInsert.x-160,top:quickInsert.y-100,zIndex:9991,background:'#14171F',border:'1px solid rgba(255,255,255,.12)',borderRadius:16,padding:'10px 12px',boxShadow:'0 16px 48px rgba(0,0,0,.7)',width:320}}>
            <div style={{fontSize:11,fontWeight:700,color:'rgba(255,255,255,.35)',textTransform:'uppercase',letterSpacing:'.07em',marginBottom:8,textAlign:'center'}}>Přidat blok a propojit</div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:6}}>
              {([
                ['start','🟢'],['end','🔴'],['process','🔵'],['decision','🟡'],
                ['io','🟣'],['loop','🩵'],['subroutine','🩷'],['connector','⚪'],['text','Aa'],
              ] as [NodeType,string][]).map(([type,emoji])=>(
                <button key={type} className="qi-item" onClick={()=>quickInsertNode(type)}>
                  <PalettePreview type={type} color={NODE_CFG[type].color}/>
                  <span style={{fontSize:9,color:'rgba(255,255,255,.45)',lineHeight:1.2,textAlign:'center'}}>{NODE_CFG[type].label}</span>
                </button>
              ))}
            </div>
            <div style={{fontSize:10,color:'rgba(255,255,255,.2)',textAlign:'center',marginTop:8}}>Klik = přidá blok + automaticky propojí šipkou · Esc = zrušit</div>
          </div>
        </>
      )}

      <div style={{display:'flex',flex:1,minHeight:0,overflow:'hidden'}}>

        {/* ═══ LEFT PANEL ═══ */}
        <div style={{width:200,flexShrink:0,borderRight:`1px solid ${D.border}`,background:D.bgCard,display:'flex',flexDirection:'column',overflow:'hidden'}}>
          <div style={{padding:'11px 11px 9px',borderBottom:`1px solid ${D.border}`,flexShrink:0}}>
            <div style={{display:'flex',alignItems:'center',gap:7,marginBottom:7}}>
              <span style={{fontSize:15}}>📊</span>
              <span style={{fontSize:13,fontWeight:700,color:D.txtPri}}>Flowchart</span>
              {isDirty&&<span style={{fontSize:9,color:D.warning,marginLeft:'auto'}}>● neuloženo</span>}
            </div>
            <div style={{display:'flex',gap:5}}>
              <button onClick={()=>setNFM(true)} style={{...fcBtn,flex:1}}>+ Diagram</button>
              <button onClick={()=>setNPM(true)} style={{...fcBtn}} title="Nový projekt">📁</button>
            </div>
          </div>

          {/* Palette with shape previews */}
          <div style={{padding:'8px 8px 6px',borderBottom:`1px solid ${D.border}`,flexShrink:0}}>
            <div style={{fontSize:9,fontWeight:700,color:D.txtSec,textTransform:'uppercase',letterSpacing:'.07em',marginBottom:5}}>Bloky — přetáhni na plátno</div>
            {PALETTE_ITEMS.map(([type,label])=>(
              <div key={type} draggable onDragStart={e=>e.dataTransfer.setData('nodeType',type)} className="fc-palette-item">
                <PalettePreview type={type} color={NODE_CFG[type].color}/>
                <span style={{fontSize:11,color:D.txtSec,lineHeight:1.3}}>{label}</span>
              </div>
            ))}
          </div>

          {/* File tree */}
          <div style={{flex:1,overflowY:'auto',padding:'3px 0'}}>
            {loadingProj
              ?<div style={{padding:'18px',textAlign:'center',color:D.txtSec,fontSize:12}}>Načítám…</div>
              :projects.map(proj=>(
                <div key={proj.name}>
                  <div style={{display:'flex',alignItems:'center',gap:5,padding:'5px 11px',cursor:'pointer',fontSize:12,fontWeight:600,color:D.txtSec}}
                    onClick={()=>setExpanded(prev=>{const n=new Set(prev);n.has(proj.name)?n.delete(proj.name):n.add(proj.name);return n})}>
                    <span style={{fontSize:9}}>{expanded.has(proj.name)?'▼':'▶'}</span>
                    <span style={{flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>📁 {proj.name}</span>
                    <button onClick={e=>{e.stopPropagation();setRenamingProj(proj.name);setRPV(proj.name)}} style={{background:'none',border:'none',cursor:'pointer',color:'rgba(255,255,255,.4)',fontSize:11,padding:'0 2px'}} title="Přejmenovat">✏</button>
                    <button onClick={e=>{e.stopPropagation();setDPM(proj.name)}} style={{background:'none',border:'none',cursor:'pointer',color:D.danger,fontSize:11,padding:'0 2px',opacity:.5}} title="Smazat projekt">🗑</button>
                  </div>
                  {expanded.has(proj.name)&&proj.files.map(file=>(
                    <div key={file.path} className="fc-file-row" style={{background:activeFile?.path===file.path?accent+'15':'transparent',borderLeft:`2px solid ${activeFile?.path===file.path?accent:'transparent'}`}}>
                      <span style={{fontSize:9}}>📊</span>
                      <span onClick={()=>openFile(file)} style={{fontSize:11,color:activeFile?.path===file.path?D.txtPri:D.txtSec,flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{file.name.replace('.flow','')}</span>
                      <button onClick={e=>{e.stopPropagation();setRenamingFile(file);setRFV(file.name.replace('.flow',''))}} style={{background:'none',border:'none',cursor:'pointer',color:'rgba(255,255,255,.4)',fontSize:11,padding:'0 2px',flexShrink:0}} title="Přejmenovat">✏</button>
                      <button onClick={()=>setDFM(file)} style={{background:'none',border:'none',cursor:'pointer',color:D.danger,fontSize:11,opacity:.5,padding:'0 2px',flexShrink:0}}>🗑</button>
                    </div>
                  ))}
                </div>
              ))
            }
          </div>
          {saveMsg&&<div style={{padding:'6px 11px',borderTop:`1px solid ${D.border}`,fontSize:11,color:saveMsg.startsWith('❌')?D.danger:D.success}}>{saveMsg}</div>}
        </div>

        {/* ═══ CANVAS AREA ═══ */}
        <div style={{flex:1,display:'flex',flexDirection:'column',minWidth:0}}>
          {/* Toolbar */}
          <div style={{display:'flex',alignItems:'center',gap:6,padding:'7px 11px',borderBottom:`1px solid ${D.border}`,flexShrink:0,flexWrap:'wrap'}}>
            <div style={{fontSize:12,fontWeight:600,color:D.txtPri,flex:1,minWidth:0,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
              {activeFile?`${activeFile.project} / ${activeFile.name.replace('.flow','')}${isDirty?' ●':''}` : 'Bez souboru'}
            </div>
            <button onClick={save} disabled={saving} className="fc-btn" style={{...fcBtn,background:isDirty?accent+'25':undefined,borderColor:isDirty?accent+'50':undefined,color:isDirty?accent:undefined}}>{saving?'…':'💾 Uložit'}</button>
            <button onClick={()=>{setPseudoCode(genPseudo(diagram));setPseudoModal(true)}} style={fcBtn} className="fc-btn">📋 Pseudokód</button>
            <button onClick={exportSVG} style={fcBtn} className="fc-btn">⬇ SVG</button>
            <button onClick={exportPNG} style={fcBtn} className="fc-btn">⬇ PNG</button>
            <button onClick={()=>{panRef.current={x:80,y:60};setPan({x:80,y:60});zoomRef.current=1;setZoom(1)}} style={fcBtn} className="fc-btn" title="Resetovat pohled">⊙</button>
            {selectedIds.size>0&&<button onClick={deleteSelected} style={{...fcBtn,color:D.danger,borderColor:D.danger+'40'}} className="fc-btn">🗑 ({selectedIds.size})</button>}
            <span style={{fontSize:11,color:D.txtSec}}>{Math.round(zoom*100)}%</span>
          </div>

          {/* Canvas */}
          <div style={{flex:1,position:'relative',overflow:'hidden',background:'#0A0C12'}}
            onDrop={e=>{
              e.preventDefault()
              const type=e.dataTransfer.getData('nodeType') as NodeType; if(!type) return
              const r=svgRef.current?.getBoundingClientRect(); if(!r) return
              const x=(e.clientX-r.left-panRef.current.x)/zoomRef.current-NODE_CFG[type].w/2
              const y=(e.clientY-r.top-panRef.current.y)/zoomRef.current-NODE_CFG[type].h/2
              addNode(type,Math.max(0,x),Math.max(0,y))
            }}
            onDragOver={e=>e.preventDefault()}
            onWheel={e=>{
              e.preventDefault()
              const nz=Math.min(3,Math.max(0.2,zoomRef.current*(e.deltaY>0?.9:1.1)))
              zoomRef.current=nz; setZoom(nz)
            }}>

            {/* Dot grid */}
            <svg style={{position:'absolute',inset:0,width:'100%',height:'100%',pointerEvents:'none'}}>
              <defs><pattern id="dotgrid" width={24*zoom} height={24*zoom} x={pan.x%(24*zoom)} y={pan.y%(24*zoom)} patternUnits="userSpaceOnUse"><circle cx={0} cy={0} r={0.9} fill="rgba(255,255,255,.07)"/></pattern></defs>
              <rect width="100%" height="100%" fill="url(#dotgrid)"/>
            </svg>

            {!activeFile&&<div style={{position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center',flexDirection:'column',gap:8,color:D.txtSec,pointerEvents:'none'}}>
              <div style={{fontSize:44,opacity:.12}}>📊</div>
              <div style={{fontSize:13,opacity:.35}}>Otevři nebo vytvoř nový diagram</div>
              <div style={{fontSize:11,opacity:.2}}>Přetáhni bloky · Hover = porty → kresli hranu · Del = smazat</div>
            </div>}

            <svg ref={svgRef} style={{position:'absolute',inset:0,width:'100%',height:'100%'}}
              onMouseDown={e=>{
                if(e.button===1||(e.altKey&&e.button===0)){
                  panStart.current={mx:e.clientX,my:e.clientY,px:panRef.current.x,py:panRef.current.y}
                  e.preventDefault(); return
                }
                if((e.target as Element)===svgRef.current) setSelectedIds(new Set())
              }}>
              <defs>
                <marker id="arr" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
                  <polygon points="0 0,8 3,0 6" fill="rgba(255,255,255,.45)"/>
                </marker>
              </defs>
              <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>
                {/* Edges */}
                {diagram.edges.map(edge=>{
                  const fn=diagram.nodes.find(n=>n.id===edge.from); const tn=diagram.nodes.find(n=>n.id===edge.to)
                  if(!fn||!tn) return null
                  const [fx,fy]=portXY(fn,edge.fromPort); const [tx,ty]=portXY(tn,edge.toPort)
                  const wps=edge.waypoints??[]
                  const path=edgePathWithWaypoints(fx,fy,tx,ty,wps); const sel=selectedIds.has(edge.id)
                  // Midpoint for adding a waypoint (center of path)
                  const allPts=[{x:fx,y:fy},...wps,{x:tx,y:ty}]
                  const mid=allPts[Math.floor(allPts.length/2)]
                  return<g key={edge.id} style={{cursor:'pointer'}} onClick={e=>{e.stopPropagation();setSelectedIds(new Set([edge.id]))}}>
                    <path d={path} fill="none" stroke="transparent" strokeWidth={14}/>
                    <path d={path} fill="none" stroke={sel?'#fff':'rgba(255,255,255,.35)'} strokeWidth={sel?2:1.5} markerEnd="url(#arr)"/>
                    {edge.label&&<text x={mid.x} y={mid.y-9} textAnchor="middle" fontSize={11} fill="rgba(255,255,255,.55)" fontFamily="DM Sans,system-ui" style={{pointerEvents:'none'}}>{edge.label}</text>}
                    {/* Waypoint handles (draggable) */}
                    {sel&&wps.map((wp,i)=>(
                      <circle key={i} cx={wp.x} cy={wp.y} r={6} fill="#fff" fillOpacity={.25} stroke="#fff" strokeWidth={1.5}
                        style={{cursor:'move'}}
                        onMouseDown={e=>{e.stopPropagation();edgeDragRef.current={edgeId:edge.id,wpIdx:i,ox:e.clientX,oy:e.clientY}}}/>
                    ))}
                    {/* Midpoint handle to add new waypoint */}
                    {sel&&<circle cx={mid.x} cy={mid.y} r={5} fill={accent} fillOpacity={.7} stroke="#fff" strokeWidth={1}
                      style={{cursor:'crosshair'}} title="Táhni pro ohnutí hrany"
                      onMouseDown={e=>{
                        e.stopPropagation()
                        // Insert a new waypoint at mid position
                        const newWps=[...wps]
                        const insertIdx=Math.floor(allPts.length/2)-1
                        newWps.splice(Math.max(0,insertIdx),0,{x:mid.x,y:mid.y})
                        setDiagram(d=>({...d,edges:d.edges.map(ed=>ed.id===edge.id?{...ed,waypoints:newWps}:ed)}))
                        edgeDragRef.current={edgeId:edge.id,wpIdx:Math.max(0,insertIdx),ox:e.clientX,oy:e.clientY}
                      }}/>}
                  </g>
                })}
                {/* Nodes */}
                {diagram.nodes.map(node=>{
                  const cfg=NODE_CFG[node.type]; const sel=selectedIds.has(node.id)
                  const {x,y,w,h}=node; const ts=node.textStyle??{}
                  const ports:Port[]=['top','bottom','left','right']
                  return<g key={node.id} className="fc-node-g"
                    onMouseDown={e=>{
                      if(e.button!==0) return; e.stopPropagation()
                      const t=e.target as Element
                      if(t.classList.contains('fc-port')){
                        const port=t.getAttribute('data-port') as Port; const c=clientToSvg(e.clientX,e.clientY)
                        const de={fromId:node.id,fromPort:port,mx:c.x,my:c.y}
                        drawingRef.current=de; setDrawingEdge(de); return
                      }
                      if(t.classList.contains('fc-resize-h')){
                        resizeRef.current={id:node.id,corner:t.getAttribute('data-corner')||'bottom-right',ox:e.clientX,oy:e.clientY,ow:w,oh:h,nx:x,ny:y}; return
                      }
                      dragNode.current={id:node.id,ox:x,oy:y,sx:e.clientX,sy:e.clientY}
                      setSelectedIds(new Set([node.id]))
                    }}
                    onClick={e=>{e.stopPropagation();setSelectedIds(prev=>e.shiftKey?new Set([...prev,node.id]):new Set([node.id]))}}
                    onDoubleClick={e=>{e.stopPropagation();setEditingId(node.id);setEditVal(node.label)}}>
                    <NodeShape n={node} sel={sel}/>
                    <text x={x+w/2} y={y+h/2} dominantBaseline="central"
                      textAnchor={ts.align==='left'?'start':ts.align==='right'?'end':'middle'}
                      fontSize={ts.size??12} fontFamily="DM Sans,system-ui" fontWeight={ts.bold?'700':'600'}
                      fontStyle={ts.italic?'italic':'normal'}
                      textDecoration={ts.underline?'underline':'none'}
                      fill={ts.color??'#fff'} style={{pointerEvents:'none',userSelect:'none'}}>
                      {node.label}
                    </text>
                    {/* Ports — only visible on hover via CSS */}
                    {node.type!=='text'&&ports.map(port=>{const [px,py]=portXY(node,port); return<circle key={port} className="fc-port" data-port={port} cx={px} cy={py} r={7} strokeWidth={2} style={{cursor:'crosshair'}}/>})}
                    {/* Resize handles */}
                    {sel&&[['bottom-right',x+w,y+h],['bottom-left',x,y+h],['top-right',x+w,y],['top-left',x,y]].map(([c,cx,cy])=>(
                      <rect key={String(c)} className="fc-resize-h" data-corner={String(c)} x={Number(cx)-5} y={Number(cy)-5} width={10} height={10} rx={2}/>
                    ))}
                  </g>
                })}
                {/* Edge being drawn */}
                {drawingEdge&&(()=>{
                  const fn=diagram.nodes.find(n=>n.id===drawingEdge.fromId); if(!fn) return null
                  const [fx,fy]=portXY(fn,drawingEdge.fromPort)
                  return<path d={curvePath(fx,fy,drawingEdge.mx,drawingEdge.my)} fill="none" stroke="rgba(255,255,255,.5)" strokeWidth={1.5} strokeDasharray="6,3" markerEnd="url(#arr)"/>
                })()}
              </g>
            </svg>

            {/* Inline label editor */}
            {editingId&&(()=>{
              const node=diagram.nodes.find(n=>n.id===editingId); if(!node) return null
              const r=svgRef.current?.getBoundingClientRect(); if(!r) return null
              return<input value={editVal} onChange={e=>setEditVal(e.target.value)}
                onKeyDown={e=>{if(e.key==='Enter')finishLabelEdit();if(e.key==='Escape')setEditingId(null)}}
                onBlur={finishLabelEdit} autoFocus
                style={{position:'fixed',left:node.x*zoom+pan.x+r.left,top:node.y*zoom+pan.y+r.top,width:node.w*zoom,height:node.h*zoom,background:'rgba(0,0,0,.85)',border:`2px solid ${accent}`,borderRadius:7,color:'#fff',textAlign:'center',fontSize:Math.max(10,12*zoom),fontFamily:'DM Sans,system-ui',fontWeight:600,outline:'none',zIndex:200}}/>
            })()}

            {/* Zoom controls */}
            <div style={{position:'absolute',bottom:14,right:14,display:'flex',flexDirection:'column',gap:4,zIndex:10}}>
              {[['＋',1.2],['−',0.8],['⊙',0]].map(([l,f])=>(
                <button key={String(l)} onClick={()=>{if(f===0){panRef.current={x:80,y:60};setPan({x:80,y:60});zoomRef.current=1;setZoom(1)}else{const nz=Math.min(3,Math.max(.2,zoomRef.current*Number(f)));zoomRef.current=nz;setZoom(nz)}}} style={{width:30,height:30,background:'rgba(255,255,255,.08)',border:'1px solid rgba(255,255,255,.12)',borderRadius:7,color:'rgba(255,255,255,.5)',cursor:'pointer',fontSize:15,display:'flex',alignItems:'center',justifyContent:'center'}}>{l}</button>
              ))}
            </div>
            <div style={{position:'absolute',bottom:14,left:14,fontSize:9,color:'rgba(255,255,255,.18)',userSelect:'none',lineHeight:1.7}}>
              Přetáhni blok z panelu · Hover na blok → porty (kroužky) → táhni hranu<br/>
              Dvojklik = text · Del = smazat · Alt+drag = posun · Kolečko = zoom
            </div>
          </div>
        </div>

        {/* ═══ RIGHT PROPERTIES PANEL ═══ */}
        <div style={{width:220,flexShrink:0,borderLeft:`1px solid ${D.border}`,background:D.bgCard,display:'flex',flexDirection:'column',overflow:'hidden'}}>
          <div style={{padding:'12px 14px 10px',borderBottom:`1px solid ${D.border}`,flexShrink:0}}>
            <div style={{fontSize:12,fontWeight:700,color:D.txtPri}}>
              {selNode ? `${NODE_CFG[selNode.type].label}` : 'Vlastnosti'}
            </div>
            {!selNode&&<div style={{fontSize:10,color:D.txtSec,marginTop:3}}>Klikni na blok</div>}
          </div>

          {selNode ? (
            <div style={{flex:1,overflowY:'auto',padding:'12px 14px',display:'flex',flexDirection:'column',gap:14}}>

              {/* ── Barevné presety ── */}
              <div>
                <label style={smallLabel}>Barevný styl</label>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:5}}>
                  {PRESETS.map(p=>(
                    <button key={p.name} onClick={()=>updateNodeStyle(selNode.id,{fillColor:p.fill,strokeColor:p.stroke})}
                      style={{padding:'6px 8px',borderRadius:7,border:`2px solid ${p.stroke}`,background:p.fill,cursor:'pointer',fontSize:10,color:p.stroke,fontFamily:'inherit',fontWeight:600,transition:'all .12s'}}>
                      {p.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* ── Výplň ── */}
              <div>
                <label style={smallLabel}>Výplň</label>
                <div style={{display:'flex',gap:7,alignItems:'center'}}>
                  <input type="color" value={(selNode.nodeStyle?.fillColor??NODE_CFG[selNode.type].color+'20').replace(/[0-9a-f]{2}$/i,'')||'#3B82F6'}
                    onChange={e=>updateNodeStyle(selNode.id,{fillColor:e.target.value+'33'})}
                    style={{width:32,height:28,border:'none',borderRadius:5,cursor:'pointer',background:'none',padding:0}}/>
                  <input value={selNode.nodeStyle?.fillColor??''} onChange={e=>updateNodeStyle(selNode.id,{fillColor:e.target.value})}
                    placeholder="rgba(59,130,246,.2)" style={{...inp,fontSize:10}}/>
                </div>
              </div>

              {/* ── Ohraničení ── */}
              <div>
                <label style={smallLabel}>Ohraničení</label>
                <div style={{display:'flex',gap:6,alignItems:'center',marginBottom:6}}>
                  <input type="color" value={selNode.nodeStyle?.strokeColor??NODE_CFG[selNode.type].color}
                    onChange={e=>updateNodeStyle(selNode.id,{strokeColor:e.target.value})}
                    style={{width:32,height:28,border:'none',borderRadius:5,cursor:'pointer',padding:0}}/>
                  <input value={selNode.nodeStyle?.strokeColor??''} onChange={e=>updateNodeStyle(selNode.id,{strokeColor:e.target.value})}
                    placeholder="#3B82F6" style={{...inp,fontSize:10,flex:1}}/>
                </div>
                <div style={{display:'flex',gap:6,alignItems:'center'}}>
                  <div style={{flex:1}}>
                    <div style={{fontSize:9,color:D.txtSec,marginBottom:3}}>Tloušťka</div>
                    <input type="number" min={0.5} max={8} step={0.5} value={selNode.nodeStyle?.strokeWidth??1.5}
                      onChange={e=>updateNodeStyle(selNode.id,{strokeWidth:parseFloat(e.target.value)})}
                      style={{...inp,fontSize:11}}/>
                  </div>
                  <div style={{flex:1}}>
                    <div style={{fontSize:9,color:D.txtSec,marginBottom:3}}>Styl</div>
                    <select value={selNode.nodeStyle?.strokeDash??''}
                      onChange={e=>updateNodeStyle(selNode.id,{strokeDash:e.target.value||undefined})}
                      style={{...inp,fontSize:11,cursor:'pointer'}}>
                      <option value="">Plná</option>
                      <option value="6,3">Přerušovaná</option>
                      <option value="2,3">Tečkovaná</option>
                      <option value="10,3,2,3">Čerchovaná</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* ── Text ── */}
              <div>
                <label style={smallLabel}>Text</label>
                {/* Bold / Italic / Underline */}
                <div style={{display:'flex',gap:5,marginBottom:8}}>
                  {([['B','bold','bold'],['I','italic','italic'],['U','underline','underline']] as [string,string,keyof TextStyle][]).map(([lbl,style,key])=>(
                    <button key={key} className={`prop-toggle${selNode.textStyle?.[key]?' active':''}`}
                      style={{fontWeight:style==='bold'?'700':'400',fontStyle:style==='italic'?'italic':'normal',textDecoration:style==='underline'?'underline':'none'}}
                      onClick={()=>updateTextStyle(selNode.id,{[key]:!selNode.textStyle?.[key]})}>
                      {lbl}
                    </button>
                  ))}
                  {/* Align */}
                  {(['left','center','right'] as TextAlign[]).map(align=>(
                    <button key={align} className={`prop-toggle${selNode.textStyle?.align===align?' active':''}`}
                      onClick={()=>updateTextStyle(selNode.id,{align})}
                      style={{fontSize:11,padding:'3px 6px'}}>
                      {align==='left'?'⬅':align==='center'?'⬛':'➡'}
                    </button>
                  ))}
                </div>
                {/* Size + color */}
                <div style={{display:'flex',gap:6,alignItems:'center'}}>
                  <div style={{flex:1}}>
                    <div style={{fontSize:9,color:D.txtSec,marginBottom:3}}>Velikost</div>
                    <input type="number" min={8} max={32} value={selNode.textStyle?.size??12}
                      onChange={e=>updateTextStyle(selNode.id,{size:parseInt(e.target.value)})}
                      style={{...inp,fontSize:11}}/>
                  </div>
                  <div style={{flex:1}}>
                    <div style={{fontSize:9,color:D.txtSec,marginBottom:3}}>Barva</div>
                    <div style={{display:'flex',gap:5,alignItems:'center'}}>
                      <input type="color" value={selNode.textStyle?.color??'#ffffff'}
                        onChange={e=>updateTextStyle(selNode.id,{color:e.target.value})}
                        style={{width:28,height:28,border:'none',borderRadius:5,cursor:'pointer',padding:0,flexShrink:0}}/>
                      <input value={selNode.textStyle?.color??'#fff'} onChange={e=>updateTextStyle(selNode.id,{color:e.target.value})}
                        style={{...inp,fontSize:10}}/>
                    </div>
                  </div>
                </div>
              </div>

              {/* ── Reset ── */}
              <button onClick={()=>updateNode(selNode.id,{nodeStyle:undefined,textStyle:undefined})}
                style={{padding:'7px',background:'rgba(255,255,255,.04)',border:`1px solid ${D.border}`,borderRadius:7,color:D.txtSec,cursor:'pointer',fontFamily:'inherit',fontSize:11}}>
                ↺ Resetovat styly
              </button>
            </div>
          ) : (
            <div style={{flex:1,padding:'16px 14px',display:'flex',flexDirection:'column',gap:8}}>
              <div style={{fontSize:11,color:D.txtSec,lineHeight:1.6}}>Klikni na blok pro úpravu jeho vlastností:</div>
              <ul style={{fontSize:11,color:'rgba(255,255,255,.3)',lineHeight:1.9,paddingLeft:16}}>
                <li>Barevný styl</li><li>Výplň a ohraničení</li><li>Styl čáry</li>
                <li>Formátování textu</li>
              </ul>
            </div>
          )}
        </div>
      </div>
    </DarkLayout>
  )
}
