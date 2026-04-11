'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef, useState, useCallback } from 'react'

const C = { bg:'#090B10', card:'#11141D', border:'rgba(255,255,255,0.07)', txt:'#fff', sec:'#8892a4' }

interface Node { id:string; x:number; y:number; label:string; ip:string; type:'host'|'router'|'server' }
interface Edge { a:string; b:string; latency:number }
interface Packet { id:number; fromId:string; toId:string; path:string[]; step:number; px:number; py:number; t:number; color:string; label:string; done:boolean; ttl:number }

const NODES:Node[] = [
  { id:'pc1',   x:0.08, y:0.30, label:'PC',      ip:'192.168.1.10', type:'host' },
  { id:'pc2',   x:0.08, y:0.65, label:'Laptop',  ip:'192.168.1.11', type:'host' },
  { id:'r1',    x:0.28, y:0.48, label:'Router 1',ip:'10.0.0.1',     type:'router' },
  { id:'r2',    x:0.50, y:0.22, label:'Router 2',ip:'10.0.1.1',     type:'router' },
  { id:'r3',    x:0.50, y:0.72, label:'Router 3',ip:'10.0.2.1',     type:'router' },
  { id:'r4',    x:0.72, y:0.48, label:'Router 4',ip:'10.0.3.1',     type:'router' },
  { id:'srv',   x:0.92, y:0.48, label:'Server',  ip:'93.184.216.34',type:'server' },
]
const EDGES:Edge[] = [
  {a:'pc1', b:'r1', latency:2},{a:'pc2',b:'r1',latency:3},
  {a:'r1',  b:'r2', latency:5},{a:'r1', b:'r3',latency:4},
  {a:'r2',  b:'r4', latency:6},{a:'r3', b:'r4',latency:5},
  {a:'r2',  b:'r3', latency:8},{a:'r4', b:'srv',latency:2},
]

// Dijkstra
function dijkstra(from:string, to:string):string[] {
  const dist:Record<string,number> = {}
  const prev:Record<string,string|null> = {}
  const visited = new Set<string>()
  NODES.forEach(n=>{ dist[n.id]=Infinity; prev[n.id]=null })
  dist[from]=0
  const adj:Record<string,{id:string;w:number}[]>={}
  NODES.forEach(n=>adj[n.id]=[])
  EDGES.forEach(e=>{ adj[e.a].push({id:e.b,w:e.latency}); adj[e.b].push({id:e.a,w:e.latency}) })
  const q = [...NODES.map(n=>n.id)]
  while(q.length){
    q.sort((a,b)=>dist[a]-dist[b])
    const u=q.shift()!
    if(visited.has(u))continue
    visited.add(u)
    if(u===to)break
    adj[u].forEach(({id:v,w})=>{ const nd=dist[u]+w; if(nd<dist[v]){dist[v]=nd;prev[v]=u} })
  }
  const path:string[]=[]
  let cur:string|null=to
  while(cur){path.unshift(cur);cur=prev[cur]}
  return path[0]===from?path:[]
}

export function PacketSim({ size }:{ size:{w:number;h:number} }) {
  const cvRef = useRef<HTMLCanvasElement>(null)
  const st = useRef<{ packets:Packet[]; nextId:number; log:string[] }>({ packets:[], nextId:0, log:[] })
  const rafRef = useRef(0)
  const [log, setLog] = useState<string[]>([])
  const [src, setSrc] = useState('pc1')
  const [dst, setDst] = useState('srv')

  const W = size.w, H = size.h

  const nx = (n:Node)=>n.x*W
  const ny = (n:Node)=>n.y*H

  const sendPacket = useCallback(() => {
    const path = dijkstra(src, dst)
    if(path.length<2)return
    const srcNode = NODES.find(n=>n.id===src)!
    const dstNode = NODES.find(n=>n.id===dst)!
    const pkt:Packet = {
      id:st.current.nextId++, fromId:src, toId:dst, path, step:0,
      px:nx(srcNode), py:ny(srcNode), t:0, color:'#06b6d4',
      label:`Packet #${st.current.nextId}`, done:false, ttl:path.length+2
    }
    st.current.packets.push(pkt)
    const hops = path.map(id=>NODES.find(n=>n.id===id)!.ip).join(' → ')
    st.current.log = [`📦 ${pkt.label}: ${srcNode.ip} → ${dstNode.ip}`, `   Route: ${hops}`, ...st.current.log].slice(0,8)
    setLog([...st.current.log])
  }, [src, dst, W, H])

  useEffect(()=>{
    const cv = cvRef.current; if(!cv)return
    const ctx = cv.getContext('2d')!

    const draw = ()=>{
      ctx.clearRect(0,0,W,H)

      // Edges
      EDGES.forEach(e=>{
        const a=NODES.find(n=>n.id===e.a)!, b=NODES.find(n=>n.id===e.b)!
        ctx.beginPath(); ctx.moveTo(nx(a),ny(a)); ctx.lineTo(nx(b),ny(b))
        ctx.strokeStyle='rgba(255,255,255,0.12)'; ctx.lineWidth=2; ctx.stroke()
        // Latency label
        const mx=(nx(a)+nx(b))/2, my=(ny(a)+ny(b))/2
        ctx.fillStyle='#475569'; ctx.font='9px monospace'; ctx.textAlign='center'
        ctx.fillText(`${e.latency}ms`, mx, my-4)
      })

      // Packets (move along path)
      st.current.packets = st.current.packets.filter(p=>!p.done)
      st.current.packets.forEach(p=>{
        p.t += 0.03
        if(p.t>=1){
          p.step++; p.t=0
          if(p.step>=p.path.length-1){ p.done=true; return }
        }
        const a=NODES.find(n=>n.id===p.path[p.step])!
        const b=NODES.find(n=>n.id===p.path[p.step+1])!
        p.px = nx(a)+(nx(b)-nx(a))*p.t
        p.py = ny(a)+(ny(b)-ny(a))*p.t

        // Glow
        ctx.beginPath(); ctx.arc(p.px,p.py,10,0,Math.PI*2)
        ctx.fillStyle=p.color+'33'; ctx.fill()
        // Dot
        ctx.beginPath(); ctx.arc(p.px,p.py,5,0,Math.PI*2)
        ctx.fillStyle=p.color; ctx.fill()
        // Highlight current edge
        ctx.beginPath(); ctx.moveTo(nx(a),ny(a)); ctx.lineTo(nx(b),ny(b))
        ctx.strokeStyle=p.color+'88'; ctx.lineWidth=3; ctx.stroke()
        // TTL label
        const ttl = p.path.length-1-p.step
        ctx.fillStyle=p.color; ctx.font='bold 8px monospace'; ctx.textAlign='center'
        ctx.fillText(`TTL:${ttl}`,p.px,p.py-10)
      })

      // Nodes
      NODES.forEach(n=>{
        const x=nx(n),y=ny(n)
        const isActive = st.current.packets.some(p=>p.path[p.step]===n.id||p.path[p.step+1]===n.id)
        // Node circle
        const col = n.type==='server'?'#22c55e':n.type==='router'?'#f59e0b':'#3b82f6'
        if(isActive){ ctx.beginPath();ctx.arc(x,y,22,0,Math.PI*2);ctx.fillStyle=col+'22';ctx.fill() }
        ctx.beginPath(); ctx.arc(x,y,16,0,Math.PI*2)
        ctx.fillStyle=n.id===src?col+'55':n.id===dst?col+'55':'#1a2035'; ctx.fill()
        ctx.strokeStyle=n.id===src||n.id===dst?col:'rgba(255,255,255,.2)'; ctx.lineWidth=2; ctx.stroke()
        // Icon
        const icon = n.type==='server'?'🖥':n.type==='router'?'📡':'💻'
        ctx.font='14px sans-serif'; ctx.textAlign='center'; ctx.fillText(icon,x,y+5)
        // Label
        ctx.fillStyle='#fff'; ctx.font='bold 9px sans-serif'; ctx.textAlign='center'
        ctx.fillText(n.label,x,y+28)
        ctx.fillStyle='#475569'; ctx.font='8px monospace'
        ctx.fillText(n.ip,x,y+39)
        // Selected indicator
        if(n.id===src){ ctx.fillStyle='#06b6d4'; ctx.fillText('SRC',x,y-22) }
        if(n.id===dst){ ctx.fillStyle='#22c55e'; ctx.fillText('DST',x,y-22) }
      })

      rafRef.current = requestAnimationFrame(draw)
    }
    rafRef.current = requestAnimationFrame(draw)
    return ()=>cancelAnimationFrame(rafRef.current)
  },[W,H])

  return (
    <div style={{display:'flex',flexDirection:'column',width:'100%',height:'100%'}}>
      {/* Toolbar */}
      <div style={{display:'flex',alignItems:'center',gap:10,padding:'6px 14px',borderBottom:`1px solid ${C.border}`,flexShrink:0,background:C.card,flexWrap:'wrap' as const}}>
        <span style={{fontSize:11,color:C.sec}}>Zdroj:</span>
        <select value={src} onChange={e=>setSrc(e.target.value)} style={{padding:'3px 8px',background:'#1a2035',color:'#fff',border:`1px solid ${C.border}`,borderRadius:6,fontSize:11,fontFamily:'inherit',cursor:'pointer'}}>
          {NODES.filter(n=>n.type!=='server').map(n=><option key={n.id} value={n.id}>{n.label} ({n.ip})</option>)}
        </select>
        <span style={{fontSize:11,color:C.sec}}>Cíl:</span>
        <select value={dst} onChange={e=>setDst(e.target.value)} style={{padding:'3px 8px',background:'#1a2035',color:'#fff',border:`1px solid ${C.border}`,borderRadius:6,fontSize:11,fontFamily:'inherit',cursor:'pointer'}}>
          {NODES.filter(n=>n.id!==src).map(n=><option key={n.id} value={n.id}>{n.label} ({n.ip})</option>)}
        </select>
        <button onClick={sendPacket} style={{padding:'4px 14px',background:'#06b6d4',color:'#000',border:'none',borderRadius:7,cursor:'pointer',fontSize:12,fontWeight:700,fontFamily:'inherit'}}>
          📦 Odeslat paket
        </button>
        <button onClick={()=>{ for(let i=0;i<5;i++) setTimeout(sendPacket,i*300) }}
          style={{padding:'4px 14px',background:'rgba(6,182,212,.15)',color:'#06b6d4',border:'1px solid rgba(6,182,212,.3)',borderRadius:7,cursor:'pointer',fontSize:12,fontFamily:'inherit'}}>
          📦×5 Burst
        </button>
        <div style={{marginLeft:'auto',display:'flex',gap:8}}>
          {[{col:'#3b82f6',lbl:'Host'},{col:'#f59e0b',lbl:'Router'},{col:'#22c55e',lbl:'Server'}].map(({col,lbl})=>(
            <span key={lbl} style={{fontSize:10,color:col}}>● {lbl}</span>
          ))}
        </div>
      </div>
      <div style={{flex:1,display:'flex',minHeight:0}}>
        <canvas ref={cvRef} width={W} height={H-42} style={{flex:1,width:'100%',height:'100%'}}/>
        {/* Log */}
        <div style={{width:220,borderLeft:`1px solid ${C.border}`,background:'#0a0d14',padding:10,overflowY:'auto',flexShrink:0}}>
          <div style={{fontSize:9,fontWeight:700,color:C.sec,textTransform:'uppercase',marginBottom:8}}>Log paketů</div>
          {log.length===0 && <div style={{fontSize:10,color:'#334155'}}>Žádné pakety…</div>}
          {log.map((l,i)=>(
            <div key={i} style={{fontSize:9,fontFamily:'monospace',color:l.startsWith('  ')?'#475569':'#94a3b8',lineHeight:1.7}}>{l}</div>
          ))}
        </div>
      </div>
    </div>
  )
}

export const PacketInfo = () => (
  <>
    <p style={{fontSize:12,color:'#cbd5e1',lineHeight:1.75,margin:'0 0 12px'}}>
      Datový paket putuje sítí přes sérii routerů. Každý router rozhoduje kam paket předat dál na základě <strong style={{color:'#06b6d4'}}>směrovací tabulky</strong>.
    </p>
    <div style={{background:'#0d1117',borderRadius:7,padding:'10px 12px',fontFamily:'monospace',fontSize:10.5,color:'#94a3b8',lineHeight:2,marginBottom:12}}>
      <div>IP Paket obsahuje:</div>
      <div>• <span style={{color:'#06b6d4'}}>Zdrojová IP</span> (kdo posílá)</div>
      <div>• <span style={{color:'#22c55e'}}>Cílová IP</span> (kam jde)</div>
      <div>• <span style={{color:'#f59e0b'}}>TTL</span> (max. počet hopů)</div>
      <div>• Data (payload)</div>
    </div>
    <div style={{padding:'8px 10px',background:'rgba(251,191,36,.05)',border:'1px solid rgba(251,191,36,.15)',borderRadius:8,marginBottom:12}}>
      <p style={{fontSize:11,color:'#fcd34d',margin:0,lineHeight:1.65}}>
        💡 Algoritmus Dijkstra hledá nejkratší cestu (nejnižší latenci). Čísla na linkách = latence v ms.
      </p>
    </div>
    <div style={{padding:'8px 10px',background:'rgba(6,182,212,.08)',border:'1px solid rgba(6,182,212,.2)',borderRadius:8}}>
      <div style={{fontSize:10,color:'#67e8f9',lineHeight:1.6}}>
        📦 Zkus odeslat více paketů najednou (Burst) — uvidíš jak se pohybují nezávisle na sobě.
      </div>
    </div>
  </>
)
