'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef, useState } from 'react'

const C = { bg:'#090B10', card:'#11141D', border:'rgba(255,255,255,0.07)', txt:'#fff', sec:'#8892a4' }

interface Msg { id:number; label:string; x:number; y:number; tx:number; ty:number; t:number; color:string; lost:boolean; ack:boolean; dir:'right'|'left'; type:string }

function drawArrow(ctx:CanvasRenderingContext2D, x1:number,y1:number,x2:number,y2:number,col:string,lw:number,label:string,lost:boolean){
  if(lost){ ctx.globalAlpha=0.25 }
  ctx.strokeStyle=col; ctx.lineWidth=lw
  ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke()
  // Arrowhead
  const angle=Math.atan2(y2-y1,x2-x1)
  const as=8
  ctx.beginPath()
  ctx.moveTo(x2,y2)
  ctx.lineTo(x2-as*Math.cos(angle-0.4),y2-as*Math.sin(angle-0.4))
  ctx.lineTo(x2-as*Math.cos(angle+0.4),y2-as*Math.sin(angle+0.4))
  ctx.closePath(); ctx.fillStyle=col; ctx.fill()
  // Label
  const mx=(x1+x2)/2,my=(y1+y2)/2
  ctx.fillStyle=lost?'#ef444488':col
  ctx.font='bold 9px monospace'; ctx.textAlign='center'
  ctx.fillText(label,mx,my-5)
  if(lost){ ctx.fillStyle='#ef4444'; ctx.font='bold 10px sans-serif'; ctx.fillText('✗ LOST',mx,my+8) }
  ctx.globalAlpha=1
}

export function TCPUDPSim({ size,playing }:{ size:{w:number;h:number}; playing:boolean }) {
  const cvRef = useRef<HTMLCanvasElement>(null)
  const st = useRef<{
    phase:'idle'|'tcp_handshake'|'tcp_data'|'udp_stream'
    msgs:Msg[]; nextId:number; tick:number; lossRate:number
    tcpPhase:number; tcpWindow:number; udpSent:number; udpLost:number
  }>({ phase:'idle', msgs:[], nextId:0, tick:0, lossRate:0.25, tcpPhase:0, tcpWindow:4, udpSent:0, udpLost:0 })
  const rafRef = useRef(0)
  const [mode, setMode] = useState<'tcp'|'udp'|'compare'>('compare')
  const [lossRate, setLossRate] = useState(0.25)
  const [stats, setStats] = useState({ tcpAcked:0, udpReceived:0, udpLost:0, phase:'' })
  const playRef = useRef(playing); useEffect(()=>{ playRef.current=playing },[playing])

  const W = size.w, H = size.h

  useEffect(()=>{
    const cv = cvRef.current; if(!cv)return
    const ctx = cv.getContext('2d')!
    const s=st.current

    // Layout: TCP left half, UDP right half (compare) or full width
    const panel = (side:'left'|'right'|'full')=>{
      const hw=W/2
      if(side==='full') return {cx1:W*0.12,cx2:W*0.88,cy:H/2,w:W}
      if(side==='left') return {cx1:W*0.06,cx2:W*0.44,cy:H/2,w:hw}
      return {cx1:W*0.56,cx2:W*0.94,cy:H/2,w:hw}
    }

    const addMsg=(label:string,x1:number,y1:number,x2:number,y2:number,col:string,dir:'right'|'left',type:string,lost=false)=>{
      s.msgs.push({id:s.nextId++,label,x:x1,y:y1,tx:x2,ty:y2,t:0,color:col,lost,ack:false,dir,type})
    }

    let frame=0
    const draw=()=>{
      if(playRef.current){ s.tick+=1 }
      frame++

      ctx.clearRect(0,0,W,H)

      // ── Compare mode: TCP left, UDP right ──────────────────────────────────
      if(mode==='compare'){
        const pL=panel('left'), pR=panel('right')
        // Divider
        ctx.strokeStyle='rgba(255,255,255,.08)'; ctx.lineWidth=1
        ctx.beginPath(); ctx.moveTo(W/2,0); ctx.lineTo(W/2,H); ctx.stroke()
        ctx.fillStyle='rgba(255,255,255,.05)'; ctx.fillRect(0,0,W/2,H)

        // Labels
        ctx.font='bold 13px sans-serif'; ctx.textAlign='center'
        ctx.fillStyle='#3b82f6'; ctx.fillText('🔒 TCP — Spolehlivý',W/4,22)
        ctx.fillStyle='#f59e0b'; ctx.fillText('⚡ UDP — Rychlý',3*W/4,22)

        // Draw both sides
        drawSide(ctx,pL,'tcp',s.tick,lossRate,W,H)
        drawSide(ctx,pR,'udp',s.tick,lossRate,W,H)

      } else if(mode==='tcp'){
        const p=panel('full')
        ctx.font='bold 14px sans-serif'; ctx.textAlign='center'
        ctx.fillStyle='#3b82f6'; ctx.fillText('🔒 TCP — Spolehlivý přenos dat',W/2,24)
        drawSide(ctx,p,'tcp',s.tick,lossRate,W,H)
      } else {
        const p=panel('full')
        ctx.font='bold 14px sans-serif'; ctx.textAlign='center'
        ctx.fillStyle='#f59e0b'; ctx.fillText('⚡ UDP — Rychlý přenos (bez záruky)',W/2,24)
        drawSide(ctx,p,'udp',s.tick,lossRate,W,H)
      }

      rafRef.current=requestAnimationFrame(draw)
    }
    rafRef.current=requestAnimationFrame(draw)
    return()=>cancelAnimationFrame(rafRef.current)
  },[W,H,mode,lossRate])

  return (
    <div style={{display:'flex',flexDirection:'column',width:'100%',height:'100%'}}>
      <div style={{display:'flex',alignItems:'center',gap:10,padding:'6px 14px',borderBottom:`1px solid ${C.border}`,flexShrink:0,background:C.card,flexWrap:'wrap' as const}}>
        <div style={{display:'flex',border:`1px solid ${C.border}`,borderRadius:7,overflow:'hidden'}}>
          {(['compare','tcp','udp'] as const).map(m=>(
            <button key={m} onClick={()=>setMode(m)}
              style={{padding:'4px 12px',background:mode===m?'rgba(255,255,255,.1)':'transparent',color:mode===m?'#fff':C.sec,border:'none',cursor:'pointer',fontFamily:'inherit',fontSize:11,fontWeight:mode===m?700:400}}>
              {m==='compare'?'🔀 Porovnat':m==='tcp'?'🔒 TCP':'⚡ UDP'}
            </button>
          ))}
        </div>
        <label style={{fontSize:10,color:C.sec,display:'flex',alignItems:'center',gap:5}}>
          Ztráta paketů:
          <input type="range" min={0} max={0.7} step={0.05} value={lossRate}
            onChange={e=>{ setLossRate(+e.target.value); st.current.lossRate=+e.target.value }}
            style={{width:80,accentColor:'#ef4444'}}/>
          <span style={{color:'#f87171',minWidth:32}}>{Math.round(lossRate*100)}%</span>
        </label>
      </div>
      <canvas ref={cvRef} width={W} height={H-42} style={{width:'100%',height:'100%'}}/>
    </div>
  )
}

function drawSide(ctx:CanvasRenderingContext2D, panel:{cx1:number;cx2:number;cy:number;w:number}, proto:'tcp'|'udp', tick:number, lossRate:number, W:number, H:number){
  const {cx1,cx2,cy}=panel
  const isTcp=proto==='tcp'
  const col=isTcp?'#3b82f6':'#f59e0b'

  // Timeline axes
  const timeH=H-120
  const topY=50, bottomY=H-70

  // Client/Server columns
  ctx.strokeStyle='rgba(255,255,255,.15)'; ctx.lineWidth=1
  ctx.beginPath(); ctx.moveTo(cx1,topY); ctx.lineTo(cx1,bottomY); ctx.stroke()
  ctx.beginPath(); ctx.moveTo(cx2,topY); ctx.lineTo(cx2,bottomY); ctx.stroke()

  // Labels
  ctx.font='bold 11px sans-serif'; ctx.textAlign='center'
  ctx.fillStyle='#60a5fa'; ctx.fillText('💻 Klient',cx1,topY-10)
  ctx.fillStyle='#4ade80'; ctx.fillText('🖥 Server',cx2,topY-10)

  const msgH = isTcp ? 28 : 22  // spacing between messages
  const speed = 0.6
  const period = Math.floor(tick * speed)

  if(isTcp){
    // TCP: handshake + data + acks + retransmission
    const msgs = getTCPMessages(cx1,cx2,topY,msgH,lossRate)
    msgs.forEach(m=>{
      const progress = Math.min(1, Math.max(0,(period - m.startT)/12))
      if(progress<=0)return
      const x1=m.dir==='right'?cx1:cx2, x2=m.dir==='right'?cx2:cx1
      const y1=m.y, y2=m.y+8
      const cx_=x1+(x2-x1)*progress, cy_=y1+(y2-y1)*progress
      const alpha=progress<0.05?progress*20:progress>0.95?(1-progress)*20:1
      ctx.globalAlpha=alpha
      drawArrow(ctx,x1,y1,cx_,cy_,m.col,m.lost?1.5:2,m.label,false)
      ctx.globalAlpha=1
      if(progress>=1 && !m.lost){
        drawArrow(ctx,x1,y1,x2,y2+2,m.col,m.lost?1:1.8,m.label,m.lost)
      }
    })
  } else {
    // UDP: stream of packets, some lost
    const N=12
    for(let i=0;i<N;i++){
      const startT=i*3
      const progress=Math.min(1,Math.max(0,(period-startT)/10))
      if(progress<=0)continue
      const lost = hashLost(i,lossRate)
      const y=topY+28+i*msgH
      if(y>bottomY-20)continue
      const cx_=cx1+(cx2-cx1)*progress
      const cy_=y+(y+4-y)*progress
      const alpha=progress<0.1?progress*10:1
      ctx.globalAlpha=alpha*(lost?0.35:1)
      drawArrow(ctx,cx1,y,Math.min(cx_,cx2),cy_,col,1.8,`UDP[${i+1}]`,false)
      ctx.globalAlpha=1
      if(progress>=1){
        if(lost){
          ctx.fillStyle='#ef4444'; ctx.font='bold 10px sans-serif'; ctx.textAlign='left'
          ctx.fillText('✗ ztráta',cx2+6,y+3)
        } else {
          ctx.fillStyle='#22c55e55'; ctx.font='9px sans-serif'; ctx.textAlign='left'
          ctx.fillText('✓',cx2+6,y+3)
        }
      }
    }
    // No retransmission label
    if(period>5){
      ctx.fillStyle='#f59e0b88'; ctx.font='9px sans-serif'; ctx.textAlign='center'
      ctx.fillText('⚠ Žádná retransmise — ztracená data jsou pryč',
        (cx1+cx2)/2, bottomY+14)
    }
  }

  // Phase labels for TCP
  if(isTcp){
    const phases=[
      {y:topY+14,label:'Handshake',col:'#a78bfa',t:0},
      {y:topY+14+3*msgH+4,label:'Přenos dat',col:'#60a5fa',t:8},
    ]
    phases.forEach(p=>{
      if(period<p.t)return
      ctx.fillStyle=p.col+'88'; ctx.font='8px sans-serif'; ctx.textAlign='right'
      ctx.fillText(`← ${p.label}`,cx1-4,p.y)
    })
  }
}

interface TMsg { dir:'right'|'left'; y:number; label:string; col:string; startT:number; lost:boolean }

function getTCPMessages(cx1:number,cx2:number,topY:number,msgH:number,lossRate:number):TMsg[]{
  const msgs:TMsg[]=[
    // Handshake
    {dir:'right',y:topY+14,     label:'SYN',    col:'#a78bfa',startT:0, lost:false},
    {dir:'left', y:topY+14+msgH,label:'SYN-ACK',col:'#a78bfa',startT:4, lost:false},
    {dir:'right',y:topY+14+msgH*2,label:'ACK',  col:'#a78bfa',startT:8, lost:false},
    // Data
    {dir:'right',y:topY+14+msgH*3+8,label:'DATA[1]',col:'#60a5fa',startT:12,lost:false},
    {dir:'right',y:topY+14+msgH*4+8,label:'DATA[2]',col:'#60a5fa',startT:14,lost:false},
    {dir:'right',y:topY+14+msgH*5+8,label:'DATA[3]',col:'#ef4444',startT:16,lost:hashLost(3,lossRate)},
    {dir:'left', y:topY+14+msgH*5+12,label:'ACK[1,2]',col:'#22c55e',startT:20,lost:false},
    // Retransmit if lost
    {dir:'right',y:topY+14+msgH*6+8,label:'DATA[3]⟳',col:'#f59e0b',startT:26,lost:false},
    {dir:'left', y:topY+14+msgH*7+8,label:'ACK[3]',  col:'#22c55e',startT:30,lost:false},
  ]
  return msgs
}

function hashLost(i:number,rate:number):boolean{
  // Deterministic pseudo-random based on index
  const h=(i*2654435761)%1000/1000
  return h<rate
}

export const TCPUDPInfo = ()=>(
  <>
    <p style={{fontSize:12,color:'#cbd5e1',lineHeight:1.75,margin:'0 0 12px'}}>
      TCP a UDP jsou dva hlavní transportní protokoly. Liší se v záruče doručení a rychlosti.
    </p>
    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:12}}>
      <div style={{padding:'8px',background:'rgba(59,130,246,.08)',border:'1px solid rgba(59,130,246,.2)',borderRadius:8}}>
        <div style={{fontSize:10,fontWeight:700,color:'#60a5fa',marginBottom:6}}>🔒 TCP</div>
        {['Spojované','3-way handshake','Potvrzování (ACK)','Retransmise','Řazení paketů','Pomalé, spolehlivé'].map((t,i)=>(
          <div key={i} style={{fontSize:10,color:'#93c5fd',marginBottom:2}}>✓ {t}</div>
        ))}
        <div style={{fontSize:9,color:'#475569',marginTop:4}}>Web, e-mail, přenos souborů</div>
      </div>
      <div style={{padding:'8px',background:'rgba(245,158,11,.08)',border:'1px solid rgba(245,158,11,.2)',borderRadius:8}}>
        <div style={{fontSize:10,fontWeight:700,color:'#fbbf24',marginBottom:6}}>⚡ UDP</div>
        {['Nespojované','Bez handshake','Bez potvrzení','Bez retransmise','Bez řazení','Rychlé, nespolehlivé'].map((t,i)=>(
          <div key={i} style={{fontSize:10,color:'#fcd34d',marginBottom:2}}>• {t}</div>
        ))}
        <div style={{fontSize:9,color:'#475569',marginTop:4}}>Streaming, gaming, DNS, VoIP</div>
      </div>
    </div>
    <div style={{background:'#0d1117',borderRadius:7,padding:'10px 12px',fontFamily:'monospace',fontSize:10,color:'#94a3b8',lineHeight:2,marginBottom:12}}>
      <div style={{color:'#a78bfa'}}>TCP Handshake:</div>
      <div>Klient → <span style={{color:'#60a5fa'}}>SYN</span> → Server</div>
      <div>Server → <span style={{color:'#60a5fa'}}>SYN-ACK</span> → Klient</div>
      <div>Klient → <span style={{color:'#60a5fa'}}>ACK</span> → Server</div>
      <div style={{color:'#22c55e',marginTop:4}}>✓ Spojení navázáno</div>
    </div>
    <div style={{padding:'8px 10px',background:'rgba(251,191,36,.05)',border:'1px solid rgba(251,191,36,.15)',borderRadius:8}}>
      <p style={{fontSize:11,color:'#fcd34d',margin:0,lineHeight:1.65}}>
        💡 Zkus zvýšit ztrátu paketů — uvidíš rozdíl: TCP retransmituje, UDP prostě ztratí data.
      </p>
    </div>
  </>
)
