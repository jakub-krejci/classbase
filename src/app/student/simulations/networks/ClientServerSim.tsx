'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef, useState, useCallback } from 'react'

const C = { bg:'#090B10', card:'#11141D', border:'rgba(255,255,255,0.07)', txt:'#fff', sec:'#8892a4' }

interface HTTPStep {
  id: number
  phase: string
  label: string
  detail: string
  dir: 'right'|'left'
  col: string
  type: 'dns'|'tcp'|'http'|'render'
}

const STEPS: HTTPStep[] = [
  { id:0, phase:'DNS',       label:'DNS Lookup: google.com → ?',    detail:'Prohlížeč potřebuje IP adresu pro google.com',          dir:'right', col:'#f59e0b', type:'dns' },
  { id:1, phase:'DNS',       label:'142.250.185.14',                 detail:'DNS resolver vrátí IP adresu',                          dir:'left',  col:'#f59e0b', type:'dns' },
  { id:2, phase:'TCP',       label:'SYN',                           detail:'Klient zahajuje TCP spojení',                           dir:'right', col:'#a78bfa', type:'tcp' },
  { id:3, phase:'TCP',       label:'SYN-ACK',                       detail:'Server potvrzuje a zahajuje',                           dir:'left',  col:'#a78bfa', type:'tcp' },
  { id:4, phase:'TCP',       label:'ACK',                           detail:'Klient potvrzuje — spojení navázáno',                   dir:'right', col:'#a78bfa', type:'tcp' },
  { id:5, phase:'HTTPS',     label:'TLS Handshake',                 detail:'Vyjednání šifrování (certifikát, klíče)',               dir:'right', col:'#22c55e', type:'tcp' },
  { id:6, phase:'HTTP',      label:'GET / HTTP/1.1\nHost: google.com\nAccept: text/html', detail:'HTTP požadavek na hlavní stránku', dir:'right', col:'#3b82f6', type:'http' },
  { id:7, phase:'HTTP',      label:'HTTP/1.1 200 OK\nContent-Type: text/html\nContent-Length: 14532', detail:'Server posílá HTML dokument', dir:'left', col:'#3b82f6', type:'http' },
  { id:8, phase:'HTTP',      label:'GET /style.css',               detail:'Prohlížeč stahuje CSS soubor',                          dir:'right', col:'#06b6d4', type:'http' },
  { id:9, phase:'HTTP',      label:'GET /script.js',               detail:'Prohlížeč stahuje JavaScript',                          dir:'right', col:'#06b6d4', type:'http' },
  { id:10, phase:'HTTP',     label:'200 OK (CSS)',                  detail:'Server posílá styly',                                   dir:'left',  col:'#06b6d4', type:'http' },
  { id:11, phase:'HTTP',     label:'200 OK (JS)',                   detail:'Server posílá skripty',                                 dir:'left',  col:'#06b6d4', type:'http' },
  { id:12, phase:'Render',   label:'🎨 Renderuji stránku',         detail:'Prohlížeč sestaví DOM + CSSOM → stránka zobrazena',     dir:'right', col:'#22c55e', type:'render' },
]

const STATUS_CODES = [
  { code:'200', label:'OK',                col:'#22c55e', desc:'Požadavek úspěšný' },
  { code:'301', label:'Moved',             col:'#f59e0b', desc:'Trvalé přesměrování' },
  { code:'304', label:'Not Modified',      col:'#06b6d4', desc:'Z cache, nezměněno' },
  { code:'404', label:'Not Found',         col:'#ef4444', desc:'Stránka neexistuje' },
  { code:'500', label:'Server Error',      col:'#ef4444', desc:'Chyba serveru' },
  { code:'503', label:'Service Unavailable',col:'#ef4444',desc:'Server nedostupný' },
]

export function ClientServerSim({ size, playing }:{ size:{w:number;h:number}; playing:boolean }) {
  const cvRef = useRef<HTMLCanvasElement>(null)
  const [step, setStep] = useState(-1)
  const [showStatus, setShowStatus] = useState(false)
  const stepRef = useRef(-1)
  const rafRef = useRef(0)
  const particlesRef = useRef<{x:number;y:number;tx:number;ty:number;t:number;col:string;label:string;multiline:boolean}[]>([])
  const playRef = useRef(playing); useEffect(()=>{ playRef.current=playing },[playing])
  const W = size.w, H = size.h

  // Layout
  const clientX = W * 0.12
  const serverX = W * 0.88
  const midY    = H * 0.48

  const goStep = useCallback((s:number)=>{
    if(s<0||s>=STEPS.length)return
    stepRef.current=s; setStep(s)
    const hs=STEPS[s]
    const x1=hs.dir==='right'?clientX:serverX
    const x2=hs.dir==='right'?serverX:clientX
    particlesRef.current=[...particlesRef.current.slice(-6),
      {x:x1,y:midY+(s-6)*18,tx:x2,ty:midY+(s-6)*18,t:0,col:hs.col,label:hs.label,multiline:hs.label.includes('\n')}]
  },[clientX,serverX,midY])

  const reset=()=>{ stepRef.current=-1; setStep(-1); particlesRef.current=[] }

  useEffect(()=>{
    if(!playing)return
    const id=setInterval(()=>{
      if(stepRef.current<STEPS.length-1) goStep(stepRef.current+1)
      else { reset(); setTimeout(()=>goStep(0),800) }
    }, 1600)
    return()=>clearInterval(id)
  },[playing,goStep])

  useEffect(()=>{
    const cv=cvRef.current; if(!cv)return
    const ctx=cv.getContext('2d')!
    const canvasH = H - 42

    const draw=()=>{
      particlesRef.current=particlesRef.current.map(p=>({...p,t:Math.min(1,p.t+0.035)}))
      ctx.clearRect(0,0,W,canvasH)

      // Background
      ctx.fillStyle='#0a0d14'; ctx.fillRect(0,0,W,canvasH)

      // Internet cloud in middle
      const cloudX=W/2, cloudY=midY
      ctx.beginPath(); ctx.ellipse(cloudX,cloudY,W*0.16,H*0.14,0,0,Math.PI*2)
      ctx.fillStyle='rgba(255,255,255,.03)'; ctx.fill()
      ctx.strokeStyle='rgba(255,255,255,.08)'; ctx.lineWidth=1.5; ctx.stroke()
      ctx.font='12px sans-serif'; ctx.textAlign='center'
      ctx.fillStyle='rgba(255,255,255,.2)'; ctx.fillText('🌐',cloudX,cloudY-2)
      ctx.fillStyle='#334155'; ctx.font='9px sans-serif'; ctx.fillText('Internet',cloudX,cloudY+14)

      // Connection lines client-cloud-server
      ctx.strokeStyle='rgba(255,255,255,.1)'; ctx.lineWidth=2
      const edgeL=cloudX-W*0.16, edgeR=cloudX+W*0.16
      ctx.beginPath(); ctx.moveTo(clientX+32,midY); ctx.lineTo(edgeL,midY); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(serverX-32,midY); ctx.lineTo(edgeR,midY); ctx.stroke()

      // Client
      drawEndpoint(ctx,clientX,midY,'💻','Klient\n(Prohlížeč)',stepRef.current,'#3b82f6',false)
      // Server
      drawEndpoint(ctx,serverX,midY,'🖥','Web Server\n(google.com)',stepRef.current,'#22c55e',true)

      // Stagger arrows for each step up to current
      const curStep=stepRef.current
      for(let i=Math.max(0,curStep-7);i<=curStep;i++){
        const hs=STEPS[i]
        if(!hs)continue
        const x1=hs.dir==='right'?clientX+32:serverX-32
        const x2=hs.dir==='right'?serverX-32:clientX+32
        const y=midY+(i-6)*19
        if(y<30||y>canvasH-30)continue
        const isActive=i===curStep
        const alpha=isActive?1:Math.max(0.2,1-(curStep-i)*0.12)
        ctx.globalAlpha=alpha
        drawHTTPArrow(ctx,x1,y,x2,y,hs.col,hs.label,hs.dir,isActive)
        ctx.globalAlpha=1
      }

      // Moving particles
      particlesRef.current.forEach(p=>{
        const x=p.x+(p.tx-p.x)*p.t, y=p.y+(p.ty-p.y)*p.t
        const alpha=p.t<0.15?p.t/0.15:p.t>0.75?(1-p.t)/0.25:1
        ctx.globalAlpha=Math.min(1,alpha)
        ctx.beginPath(); ctx.arc(x,y,5,0,Math.PI*2)
        ctx.fillStyle=p.col+'88'; ctx.fill()
        ctx.beginPath(); ctx.arc(x,y,3,0,Math.PI*2)
        ctx.fillStyle=p.col; ctx.fill()
        ctx.globalAlpha=1
      })

      // Phase labels on left
      const phases=['DNS','TCP','HTTPS','HTTP','Render']
      const phaseY:Record<string,number>={DNS:midY-6*19,TCP:midY-4*19,HTTPS:midY-1*19,HTTP:midY+1*19,Render:midY+7*19}
      phases.forEach(ph=>{
        const py=phaseY[ph]+(ph==='HTTP'?38:0)
        if(py<25||py>canvasH-15)return
        ctx.fillStyle='#334155'; ctx.font='8px monospace'; ctx.textAlign='left'
        ctx.fillText(ph,6,py)
        ctx.strokeStyle='rgba(255,255,255,.04)'; ctx.lineWidth=1; ctx.setLineDash([3,3])
        ctx.beginPath(); ctx.moveTo(28,py-4); ctx.lineTo(W-10,py-4); ctx.stroke()
        ctx.setLineDash([])
      })

      // Step label bottom
      if(curStep>=0){
        const hs=STEPS[curStep]
        ctx.fillStyle='rgba(10,13,20,.9)'; ctx.fillRect(0,canvasH-36,W,36)
        ctx.fillStyle=hs.col; ctx.font='bold 10px sans-serif'; ctx.textAlign='left'
        ctx.fillText(`[${hs.phase}] Krok ${curStep+1}/${STEPS.length}: ${hs.detail}`,12,canvasH-18)
      }

      rafRef.current=requestAnimationFrame(draw)
    }
    rafRef.current=requestAnimationFrame(draw)
    return()=>cancelAnimationFrame(rafRef.current)
  },[W,H,midY])

  return (
    <div style={{display:'flex',flexDirection:'column',width:'100%',height:'100%'}}>
      <div style={{display:'flex',alignItems:'center',gap:8,padding:'6px 14px',borderBottom:`1px solid ${C.border}`,flexShrink:0,background:C.card,flexWrap:'wrap' as const}}>
        <button onClick={()=>{reset();setTimeout(()=>goStep(0),100)}}
          style={{padding:'4px 14px',background:'#3b82f6',color:'#fff',border:'none',borderRadius:7,cursor:'pointer',fontSize:12,fontWeight:700,fontFamily:'inherit'}}>
          🌐 Nový požadavek
        </button>
        {!playing&&<>
          <button onClick={()=>goStep(step+1)} disabled={step>=STEPS.length-1}
            style={{padding:'4px 12px',background:'rgba(255,255,255,.07)',color:step>=STEPS.length-1?C.sec:'#fff',border:`1px solid ${C.border}`,borderRadius:7,cursor:step>=STEPS.length-1?'not-allowed':'pointer',fontSize:12,fontFamily:'inherit'}}>
            Další →
          </button>
          <button onClick={reset}
            style={{padding:'4px 10px',background:'rgba(255,255,255,.07)',color:C.sec,border:`1px solid ${C.border}`,borderRadius:7,cursor:'pointer',fontSize:11,fontFamily:'inherit'}}>
            Reset
          </button>
        </>}
        <button onClick={()=>setShowStatus(p=>!p)}
          style={{padding:'4px 12px',background:showStatus?'rgba(239,68,68,.15)':'rgba(255,255,255,.07)',color:showStatus?'#f87171':C.sec,border:`1px solid ${showStatus?'rgba(239,68,68,.3)':C.border}`,borderRadius:7,cursor:'pointer',fontSize:11,fontFamily:'inherit'}}>
          {showStatus?'Skrýt':'📋 HTTP kódy'}
        </button>
        <span style={{marginLeft:'auto',fontSize:10,color:C.sec}}>
          {step>=0?`${STEPS[step].phase} — ${STEPS[step].label.split('\n')[0]}`:''}
        </span>
      </div>

      <div style={{flex:1,position:'relative',overflow:'hidden'}}>
        <canvas ref={cvRef} width={W} height={H-42} style={{width:'100%',height:'100%'}}/>

        {/* HTTP Status codes overlay */}
        {showStatus&&(
          <div style={{position:'absolute',top:8,right:8,background:'rgba(10,13,20,.96)',border:`1px solid ${C.border}`,borderRadius:12,padding:'12px 14px',minWidth:200}}>
            <div style={{fontSize:10,fontWeight:700,color:C.sec,textTransform:'uppercase',marginBottom:10}}>HTTP Status kódy</div>
            {STATUS_CODES.map(s=>(
              <div key={s.code} style={{display:'flex',gap:8,marginBottom:6,alignItems:'center'}}>
                <code style={{fontSize:11,fontWeight:700,color:s.col,minWidth:30}}>{s.code}</code>
                <span style={{fontSize:10,color:'#fff',fontWeight:600}}>{s.label}</span>
                <span style={{fontSize:9,color:C.sec}}>{s.desc}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function drawEndpoint(ctx:CanvasRenderingContext2D,x:number,y:number,icon:string,label:string,step:number,col:string,isServer:boolean){
  ctx.beginPath(); ctx.arc(x,y,30,0,Math.PI*2)
  ctx.fillStyle=col+'18'; ctx.fill()
  ctx.strokeStyle=col+'55'; ctx.lineWidth=2; ctx.stroke()
  ctx.font='22px sans-serif'; ctx.textAlign='center'; ctx.fillText(icon,x,y+7)
  label.split('\n').forEach((l,i)=>{
    ctx.fillStyle='#94a3b8'; ctx.font=`bold 9px sans-serif`
    ctx.fillText(l,x,y+44+i*12)
  })
}

function drawHTTPArrow(ctx:CanvasRenderingContext2D,x1:number,y:number,x2:number,y2:number,col:string,label:string,dir:'right'|'left',active:boolean){
  ctx.strokeStyle=col+(active?'':66); ctx.lineWidth=active?2:1
  ctx.beginPath(); ctx.moveTo(x1,y); ctx.lineTo(x2,y); ctx.stroke()
  const ah=6
  const ax=dir==='right'?x2:x1
  ctx.beginPath()
  ctx.moveTo(ax,y)
  ctx.lineTo(ax+(dir==='right'?-ah:ah),y-ah/2)
  ctx.lineTo(ax+(dir==='right'?-ah:ah),y+ah/2)
  ctx.closePath(); ctx.fillStyle=col+(active?'':66); ctx.fill()
  const firstLine=label.split('\n')[0]
  const mx=(x1+x2)/2
  ctx.fillStyle=active?col:col+'99'; ctx.font=`${active?'bold':''} 8px monospace`; ctx.textAlign='center'
  ctx.fillText(firstLine,mx,y-5)
  if(active&&label.includes('\n')){
    label.split('\n').slice(1,3).forEach((l,i)=>{
      ctx.fillStyle='#47556988'; ctx.font='7px monospace'
      ctx.fillText(l,mx,y+6+i*10)
    })
  }
}

export const ClientServerInfo = ()=>(
  <>
    <p style={{fontSize:12,color:'#cbd5e1',lineHeight:1.75,margin:'0 0 12px'}}>
      Každé otevření webové stránky je série komunikací: DNS → TCP → HTTP. Prohlížeč je klient, webový server odpovídá na požadavky.
    </p>
    <div style={{marginBottom:12}}>
      {[
        {phase:'🔸 DNS',     col:'#f59e0b', desc:'Přeložení jména na IP (1–2 round tripy)'},
        {phase:'🟣 TCP/TLS', col:'#a78bfa', desc:'Navázání spojení + šifrování (1–2 RT)'},
        {phase:'🔵 HTTP GET',col:'#3b82f6', desc:'Požadavek na HTML dokument'},
        {phase:'🟢 200 OK',  col:'#22c55e', desc:'Server posílá HTML (~14kB first chunk)'},
        {phase:'🩵 Sub-req', col:'#06b6d4', desc:'CSS, JS, obrázky staženy paralelně'},
        {phase:'✨ Render',  col:'#f472b6', desc:'DOM + CSSOM → Layout → Paint'},
      ].map((s,i)=>(
        <div key={i} style={{display:'flex',gap:8,marginBottom:5,alignItems:'flex-start'}}>
          <span style={{fontSize:10,color:s.col,flexShrink:0,minWidth:72,fontWeight:700}}>{s.phase}</span>
          <span style={{fontSize:10,color:'#94a3b8',lineHeight:1.5}}>{s.desc}</span>
        </div>
      ))}
    </div>
    <div style={{padding:'8px 10px',background:'rgba(251,191,36,.05)',border:'1px solid rgba(251,191,36,.15)',borderRadius:8,marginBottom:12}}>
      <p style={{fontSize:11,color:'#fcd34d',margin:0,lineHeight:1.65}}>
        💡 HTTP/2 a HTTP/3 posílají více požadavků přes jedno TCP spojení (multiplexing) — stránka se načte rychleji.
      </p>
    </div>
    <div style={{background:'#0d1117',borderRadius:7,padding:'10px 12px',fontFamily:'monospace',fontSize:10,color:'#94a3b8',lineHeight:1.9}}>
      <div style={{color:'#60a5fa'}}>GET / HTTP/1.1</div>
      <div>Host: <span style={{color:'#22c55e'}}>google.com</span></div>
      <div>Accept: text/html</div>
      <div>Cookie: session=abc</div>
      <div style={{marginTop:6,color:'#4ade80'}}>HTTP/1.1 200 OK</div>
      <div>Content-Type: <span style={{color:'#f59e0b'}}>text/html</span></div>
      <div>Cache-Control: max-age=3600</div>
    </div>
  </>
)
