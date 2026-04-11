'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef, useState, useCallback } from 'react'

const C = { bg:'#090B10', card:'#11141D', border:'rgba(255,255,255,0.07)', txt:'#fff', sec:'#8892a4' }

const DNS_STEPS = [
  { from:'browser',  to:'cache',       q:'Je "example.cz" v cache?',              a:'❌ Není v cache',         col:'#f59e0b', arrow:'right' },
  { from:'browser',  to:'resolver',    q:'Co je IP pro "example.cz"?',            a:'Ptám se dál…',            col:'#3b82f6', arrow:'right' },
  { from:'resolver', to:'root',        q:'Kdo spravuje .cz domény?',              a:'→ TLD server pro .cz',    col:'#8b5cf6', arrow:'right' },
  { from:'root',     to:'resolver',    q:'←Odpověď z Root',                       a:'TLD .cz: 192.58.128.30',  col:'#8b5cf6', arrow:'left' },
  { from:'resolver', to:'tld',         q:'Kdo spravuje "example.cz"?',            a:'→ Auth. NS: ns1.example.cz',col:'#06b6d4', arrow:'right' },
  { from:'tld',      to:'resolver',    q:'← Odpověď z TLD',                       a:'NS: 93.184.216.1',        col:'#06b6d4', arrow:'left' },
  { from:'resolver', to:'auth',        q:'Jaká je IP "example.cz"?',              a:'→ Auth. nameserver',      col:'#22c55e', arrow:'right' },
  { from:'auth',     to:'resolver',    q:'← Finální odpověď',                     a:'A record: 93.184.216.34', col:'#22c55e', arrow:'left' },
  { from:'resolver', to:'browser',     q:'← IP adresa nalezena',                  a:'93.184.216.34 (TTL 3600s)',col:'#3b82f6', arrow:'left' },
  { from:'browser',  to:'cache',       q:'Uložit do cache',                       a:'✓ Uloženo na 3600s',      col:'#f59e0b', arrow:'right' },
]

const NODES = [
  { id:'browser',  x:0.06, y:0.5,  label:'Prohlížeč',   icon:'🌐', col:'#3b82f6' },
  { id:'cache',    x:0.22, y:0.15, label:'DNS Cache',    icon:'💾', col:'#f59e0b' },
  { id:'resolver', x:0.38, y:0.5,  label:'Resolver\n(ISP)',icon:'🔍',col:'#8b5cf6' },
  { id:'root',     x:0.60, y:0.18, label:'Root NS\n(.)',  icon:'🌍', col:'#8b5cf6' },
  { id:'tld',      x:0.75, y:0.5,  label:'TLD NS\n(.cz)',icon:'🏷',  col:'#06b6d4' },
  { id:'auth',     x:0.60, y:0.82, label:'Auth. NS\nexample.cz',icon:'📋',col:'#22c55e' },
]

interface Particle { x:number;y:number;tx:number;ty:number;t:number;col:string;label:string }

export function DNSSim({ size, playing }:{ size:{w:number;h:number}; playing:boolean }) {
  const cvRef = useRef<HTMLCanvasElement>(null)
  const [step, setStep] = useState(-1)
  const [domain, setDomain] = useState('example.cz')
  const [cached, setCached] = useState(false)
  const [particles, setParticles] = useState<Particle[]>([])
  const rafRef = useRef(0)
  const stepRef = useRef(-1)
  const particlesRef = useRef<Particle[]>([])
  const playRef = useRef(playing); useEffect(()=>{ playRef.current=playing },[playing])

  const W = size.w, H = size.h
  const nx=(id:string)=>(NODES.find(n=>n.id===id)!.x)*W
  const ny=(id:string)=>(NODES.find(n=>n.id===id)!.y)*H

  const goStep = useCallback((s:number)=>{
    if(s>=DNS_STEPS.length)return
    stepRef.current=s; setStep(s)
    const ds=DNS_STEPS[s]
    const p:Particle = { x:nx(ds.from), y:ny(ds.from), tx:nx(ds.to), ty:ny(ds.to), t:0, col:ds.col, label:ds.q }
    particlesRef.current=[...particlesRef.current.slice(-8), p]
    setParticles([...particlesRef.current])
  },[W,H])

  const nextStep = ()=> goStep(step+1)
  const reset = ()=>{ stepRef.current=-1; setStep(-1); particlesRef.current=[]; setParticles([]) }

  // Auto-play
  useEffect(()=>{
    if(!playing)return
    const id=setInterval(()=>{
      if(stepRef.current<DNS_STEPS.length-1) goStep(stepRef.current+1)
      else { stepRef.current=-1; setStep(-1); particlesRef.current=[]; setParticles([]) }
    }, 1800)
    return()=>clearInterval(id)
  },[playing,goStep])

  // Particle animation
  useEffect(()=>{
    const cv=cvRef.current; if(!cv)return
    const ctx=cv.getContext('2d')!
    const draw=()=>{
      // Move particles
      particlesRef.current=particlesRef.current.map(p=>({...p,t:Math.min(1,p.t+0.04)}))

      ctx.clearRect(0,0,W,H)

      // Edges
      const connections=[
        ['browser','cache'],['browser','resolver'],['resolver','root'],
        ['resolver','tld'],['resolver','auth'],['root','tld'],
      ]
      connections.forEach(([a,b])=>{
        ctx.beginPath(); ctx.moveTo(nx(a),ny(a)); ctx.lineTo(nx(b),ny(b))
        ctx.strokeStyle='rgba(255,255,255,0.07)'; ctx.lineWidth=1.5; ctx.stroke()
      })

      // Active step highlight
      if(stepRef.current>=0){
        const ds=DNS_STEPS[stepRef.current]
        ctx.beginPath(); ctx.moveTo(nx(ds.from),ny(ds.from)); ctx.lineTo(nx(ds.to),ny(ds.to))
        ctx.strokeStyle=ds.col+'55'; ctx.lineWidth=3; ctx.stroke()
      }

      // Particles
      particlesRef.current.forEach(p=>{
        const x=p.x+(p.tx-p.x)*p.t, y=p.y+(p.ty-p.y)*p.t
        const alpha=p.t<0.1?p.t*10:p.t>0.8?(1-p.t)*5:1
        ctx.globalAlpha=alpha
        ctx.beginPath(); ctx.arc(x,y,7,0,Math.PI*2)
        ctx.fillStyle=p.col+'44'; ctx.fill()
        ctx.beginPath(); ctx.arc(x,y,4,0,Math.PI*2)
        ctx.fillStyle=p.col; ctx.fill()
        // Label near particle
        ctx.fillStyle='#fff'; ctx.font='bold 8px sans-serif'; ctx.textAlign='center'
        ctx.fillText('?',x,y+3)
        ctx.globalAlpha=1
      })

      // Nodes
      NODES.forEach(n=>{
        const x=nx(n.id), y=ny(n.id)
        const isActive=stepRef.current>=0&&(DNS_STEPS[stepRef.current].from===n.id||DNS_STEPS[stepRef.current].to===n.id)
        if(isActive){
          ctx.beginPath(); ctx.arc(x,y,30,0,Math.PI*2)
          ctx.fillStyle=n.col+'15'; ctx.fill()
        }
        ctx.beginPath(); ctx.arc(x,y,22,0,Math.PI*2)
        ctx.fillStyle=isActive?n.col+'33':'#141922'; ctx.fill()
        ctx.strokeStyle=isActive?n.col:'rgba(255,255,255,.15)'; ctx.lineWidth=isActive?2.5:1.5; ctx.stroke()
        ctx.font='18px sans-serif'; ctx.textAlign='center'; ctx.fillText(n.icon,x,y+6)
        const lines=n.label.split('\n')
        ctx.fillStyle=isActive?'#fff':'#94a3b8'; ctx.font=`${isActive?'bold':''} 9px sans-serif`
        lines.forEach((l,li)=>ctx.fillText(l,x,y+30+li*12))
      })

      // Step info overlay
      if(stepRef.current>=0){
        const ds=DNS_STEPS[stepRef.current]
        const bw=Math.min(W-40,420), bh=52, bx=(W-bw)/2, by=H-70
        ctx.fillStyle='rgba(10,13,20,.9)'
        ctx.strokeStyle=ds.col+'55'; ctx.lineWidth=1
        ctx.fillRect(bx,by,bw,bh); ctx.strokeRect(bx,by,bw,bh)
        ctx.fillStyle=ds.col; ctx.font='bold 10px sans-serif'; ctx.textAlign='left'
        ctx.fillText(`Krok ${stepRef.current+1}/${DNS_STEPS.length}: ${ds.q}`,bx+12,by+18)
        ctx.fillStyle='#94a3b8'; ctx.font='9px sans-serif'
        ctx.fillText(`Odpověď: ${ds.a}`,bx+12,by+36)
      }

      rafRef.current=requestAnimationFrame(draw)
    }
    rafRef.current=requestAnimationFrame(draw)
    return()=>cancelAnimationFrame(rafRef.current)
  },[W,H])

  return (
    <div style={{display:'flex',flexDirection:'column',width:'100%',height:'100%'}}>
      <div style={{display:'flex',alignItems:'center',gap:10,padding:'6px 14px',borderBottom:`1px solid ${C.border}`,flexShrink:0,background:C.card,flexWrap:'wrap' as const}}>
        <span style={{fontSize:11,color:C.sec}}>Doména:</span>
        <input value={domain} onChange={e=>setDomain(e.target.value)}
          style={{padding:'3px 10px',background:'#1a2035',color:'#fff',border:`1px solid ${C.border}`,borderRadius:6,fontSize:12,fontFamily:'monospace',width:160}}/>
        <button onClick={()=>{reset();setTimeout(()=>goStep(0),100)}}
          style={{padding:'4px 14px',background:'#06b6d4',color:'#000',border:'none',borderRadius:7,cursor:'pointer',fontSize:12,fontWeight:700,fontFamily:'inherit'}}>
          🔍 Lookup
        </button>
        {!playing&&<>
          <button onClick={nextStep} disabled={step>=DNS_STEPS.length-1}
            style={{padding:'4px 12px',background:'rgba(255,255,255,.07)',color:step>=DNS_STEPS.length-1?C.sec:'#fff',border:`1px solid ${C.border}`,borderRadius:7,cursor:step>=DNS_STEPS.length-1?'not-allowed':'pointer',fontSize:12,fontFamily:'inherit'}}>
            Další krok →
          </button>
          <button onClick={reset}
            style={{padding:'4px 10px',background:'rgba(255,255,255,.07)',color:C.sec,border:`1px solid ${C.border}`,borderRadius:7,cursor:'pointer',fontSize:11,fontFamily:'inherit'}}>
            Reset
          </button>
        </>}
        <div style={{marginLeft:'auto',fontSize:11,color:C.sec}}>
          {step>=0?`Krok ${step+1}/${DNS_STEPS.length}`:'Stiskni Lookup nebo Další krok'}
        </div>
      </div>
      <canvas ref={cvRef} width={W} height={H-42} style={{width:'100%',height:'100%'}}/>
    </div>
  )
}

export const DNSInfo = ()=>(
  <>
    <p style={{fontSize:12,color:'#cbd5e1',lineHeight:1.75,margin:'0 0 12px'}}>
      DNS (Domain Name System) překládá doménová jména na IP adresy. Funguje jako telefonní seznam internetu.
    </p>
    <div style={{marginBottom:12}}>
      {DNS_STEPS.map((s,i)=>(
        <div key={i} style={{display:'flex',gap:7,marginBottom:5,alignItems:'flex-start'}}>
          <div style={{width:16,height:16,borderRadius:'50%',background:s.col+'25',border:`1px solid ${s.col}50`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:8,fontWeight:700,color:s.col,flexShrink:0,marginTop:1}}>{i+1}</div>
          <span style={{fontSize:10,color:'#94a3b8',lineHeight:1.5}}>{s.q.replace('← ','').replace('→ ','')}<span style={{color:s.col,marginLeft:4}}>→ {s.a}</span></span>
        </div>
      ))}
    </div>
    <div style={{padding:'8px 10px',background:'rgba(251,191,36,.05)',border:'1px solid rgba(251,191,36,.15)',borderRadius:8}}>
      <p style={{fontSize:11,color:'#fcd34d',margin:0,lineHeight:1.65}}>
        💡 DNS cache šetří čas — druhý dotaz na stejnou doménu se rovnou vrátí z cache bez cestování přes celou hierarchii. TTL určuje jak dlouho je odpověď platná.
      </p>
    </div>
  </>
)
