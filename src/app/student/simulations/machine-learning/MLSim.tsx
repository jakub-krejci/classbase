'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useRef, useCallback } from 'react'

type Tab = 'supervised' | 'unsupervised' | 'reinforcement'

const TAB_INFO = {
  supervised: {
    icon: '👨‍🏫', title: 'Dozorované učení', subtitle: 'Supervised Learning',
    color: '#3b82f6', tagline: 'Učení se správnými odpověďmi',
    description: 'Model se učí z dat, která mají správné odpovědi (štítky). Jako žák, kterému učitel říká co je správně a co špatně.',
    when: 'Klasifikace e-mailů (spam/ham), rozpoznávání obrázků, předpovídání cen.',
    steps: ['Dostaneme data s odpověďmi (štítky)','Model se učí vzory z těchto dat','Model předpoví odpověď pro nová data','Porovnáme se správnou odpovědí → upravíme'],
    pros: ['Přesné predikce','Jasný cíl optimalizace'],
    cons: ['Potřebuje označená data','Označování je drahé a pomalé'],
  },
  unsupervised: {
    icon: '🔍', title: 'Nedozorované učení', subtitle: 'Unsupervised Learning',
    color: '#22c55e', tagline: 'Hledání skryté struktury v datech',
    description: 'Model dostane data bez štítků a sám hledá vzory, skupiny nebo strukturu. Jako detektiv, který třídí stopy bez návodu.',
    when: 'Segmentace zákazníků, detekce anomálií, komprese dat, doporučovací systémy.',
    steps: ['Dostaneme data BEZ odpovědí','Algoritmus hledá podobnosti v datech','Vytvoří skupiny (clustery) podobných dat','My pojmenujeme skupiny podle kontextu'],
    pros: ['Nevyžaduje štítky','Odhalí skrytou strukturu'],
    cons: ['Těžko ověřit správnost','Výsledky mohou být neočekávané'],
  },
  reinforcement: {
    icon: '🎮', title: 'Posilované učení', subtitle: 'Reinforcement Learning',
    color: '#f59e0b', tagline: 'Učení pokusem, omylem a odměnami',
    description: 'Agent se učí jednat v prostředí tak, aby maximalizoval odměnu. Jako trénování psa — správné chování = pamlsek.',
    when: 'Hry (AlphaGo, Chess), robotika, autonomní řízení, optimalizace reklam.',
    steps: ['Agent pozoruje stav prostředí','Provede akci (pohyb, rozhodnutí)','Dostane odměnu (+) nebo trest (−)','Aktualizuje strategii → opakuje'],
    pros: ['Nevyžaduje štítky','Může překonat lidský výkon'],
    cons: ['Potřebuje miliony iterací','Definování odměn je složité'],
  },
}

const C = { bg:'#090B10', card:'#11141D', border:'rgba(255,255,255,0.07)', txt:'#fff', sec:'#8892a4' }

// ─────────────────────────────────────────────────────────────────────────────
// SUPERVISED SIM
// ─────────────────────────────────────────────────────────────────────────────
interface Animal { id:number; x:number; y:number; vy:number; type:'cat'|'dog'; labeled:boolean; settled:boolean; finalY:number }

function SupervisedSim({ playing, speed, canvasSize }: { playing:boolean; speed:number; canvasSize:{w:number;h:number} }) {
  const cvRef = useRef<HTMLCanvasElement>(null)
  const st = useRef({ animals:[] as Animal[], tick:0, nextId:0, progress:0, trained:false })
  const rafRef = useRef(0)
  const playRef = useRef(playing); useEffect(()=>{ playRef.current=playing },[playing])
  const speedRef = useRef(speed); useEffect(()=>{ speedRef.current=speed },[speed])
  // For click prediction after training
  const [prediction, setPrediction] = useState<{text:string;x:number;y:number;t:number}|null>(null)
  const predRef = useRef<{text:string;x:number;y:number;t:number}|null>(null)

  const W = canvasSize.w, H = canvasSize.h

  const spawnAnimal = useCallback((type:'cat'|'dog') => {
    const isCat = type==='cat'
    const xRange = isCat ? [0.08,0.42] : [0.58,0.92]
    const x = (xRange[0]+Math.random()*(xRange[1]-xRange[0]))*W
    const finalY = H*0.22 + Math.random()*H*0.58
    st.current.animals.push({ id:st.current.nextId++, x, y:-30, vy:0.9+Math.random()*0.5, type, labeled:false, settled:false, finalY })
  },[W, H])

  useEffect(()=>{
    const cv = cvRef.current; if(!cv) return
    const ctx = cv.getContext('2d')!
    st.current = { animals:[], tick:0, nextId:0, progress:0, trained:false }
    for(let i=0;i<7;i++) spawnAnimal('cat')
    for(let i=0;i<7;i++) spawnAnimal('dog')

    const draw = () => {
      if(playRef.current){
        const s = speedRef.current
        st.current.tick += s
        st.current.animals.forEach(a=>{
          if(!a.settled){ a.y+=a.vy*s; if(a.y>=a.finalY){ a.y=a.finalY; a.settled=true; a.labeled=true } }
        })
        const allSettled = st.current.animals.every(a=>a.settled)
        if(allSettled && st.current.progress<1){
          st.current.progress = Math.min(1, st.current.progress+0.004*s)
          if(st.current.progress>=1) st.current.trained=true
        }
        if(st.current.tick%(110/s)<1 && st.current.animals.length<16) spawnAnimal(Math.random()<0.5?'cat':'dog')
      }
      // Fade prediction
      if(predRef.current){ predRef.current.t-=0.02*speedRef.current; if(predRef.current.t<=0) predRef.current=null }

      ctx.clearRect(0,0,W,H)
      const bx=W*0.5
      ctx.fillStyle='rgba(59,130,246,0.07)'; ctx.fillRect(0,0,bx,H)
      ctx.fillStyle='rgba(249,115,22,0.07)'; ctx.fillRect(bx,0,W-bx,H)
      ctx.font='bold 15px sans-serif'; ctx.textAlign='center'
      ctx.fillStyle='rgba(59,130,246,0.55)'; ctx.fillText('🐱 Kočky',bx*0.5,26)
      ctx.fillStyle='rgba(249,115,22,0.55)'; ctx.fillText('🐶 Psi',bx+(W-bx)*0.5,26)

      // Decision boundary
      ctx.save(); ctx.shadowColor='#fff'; ctx.shadowBlur=10
      ctx.strokeStyle='rgba(255,255,255,0.7)'; ctx.lineWidth=2; ctx.setLineDash([8,5])
      ctx.beginPath(); ctx.moveTo(bx,36); ctx.lineTo(bx,H-50); ctx.stroke()
      ctx.setLineDash([]); ctx.restore()
      ctx.fillStyle='rgba(255,255,255,0.5)'; ctx.font='bold 9px monospace'; ctx.textAlign='center'
      ctx.fillText('ROZHODOVACÍ HRANICE',bx,H-52)

      // Animals
      st.current.animals.forEach(a=>{
        ctx.font='24px sans-serif'; ctx.textAlign='center'
        ctx.fillText(a.type==='cat'?'🐱':'🐶',a.x,a.y)
        if(a.labeled){
          const col=a.type==='cat'?'#60a5fa':'#fb923c'
          const lbl=a.type==='cat'?'Kočka':'Pes'
          const bw=44,bh=16
          ctx.fillStyle=col+'33'; ctx.fillRect(a.x-bw/2,a.y+12,bw,bh)
          ctx.fillStyle=col; ctx.font='bold 9px sans-serif'; ctx.textAlign='center'
          ctx.fillText(lbl,a.x,a.y+23)
        }
      })

      // Progress
      if(st.current.progress>0){
        const bw2=W*0.55, bx2=W*0.225
        ctx.fillStyle='rgba(255,255,255,0.06)'; ctx.fillRect(bx2,H-30,bw2,8)
        ctx.fillStyle='#3b82f6'; ctx.fillRect(bx2,H-30,bw2*st.current.progress,8)
        ctx.fillStyle=st.current.trained?'#22c55e':C.sec; ctx.font=`${st.current.trained?'bold':''} 10px sans-serif`; ctx.textAlign='center'
        ctx.fillText(st.current.trained?'✓ Natrénováno! Klikni kamkoliv pro predikci.':
          `Model se učí: ${Math.round(st.current.progress*100)}%`, W/2, H-36)
      }

      // Click prediction pop
      if(predRef.current){
        const p=predRef.current, al=Math.min(1,p.t)
        ctx.save(); ctx.globalAlpha=al
        const col=p.text.includes('Kočka')?'#60a5fa':'#fb923c'
        ctx.fillStyle=col+'33'; ctx.strokeStyle=col; ctx.lineWidth=1.5
        const pw=130,ph=36
        ctx.fillRect(p.x-pw/2,p.y-ph-8,pw,ph)
        ctx.strokeRect(p.x-pw/2,p.y-ph-8,pw,ph)
        ctx.fillStyle='#fff'; ctx.font='bold 12px sans-serif'; ctx.textAlign='center'
        ctx.fillText(p.text,p.x,p.y-22)
        ctx.font='10px sans-serif'; ctx.fillStyle=C.sec
        ctx.fillText(`Pravděpodobnost: ${p.text.includes('Kočka')?'92%':'88%'}`,p.x,p.y-9)
        ctx.restore()
      }

      rafRef.current=requestAnimationFrame(draw)
    }
    rafRef.current=requestAnimationFrame(draw)
    return()=>cancelAnimationFrame(rafRef.current)
  },[spawnAnimal,W,H])

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if(!st.current.trained) return
    const rect = cvRef.current!.getBoundingClientRect()
    const scaleX = W/rect.width, scaleY = H/rect.height
    const cx = (e.clientX-rect.left)*scaleX
    const cy = (e.clientY-rect.top)*scaleY
    const isCatSide = cx < W*0.5
    const text = isCatSide ? '🐱 Toto je Kočka!' : '🐶 Toto je Pes!'
    predRef.current = { text, x:cx, y:cy, t:3.5 }
  }

  return (
    <canvas ref={cvRef} width={W} height={H} onClick={handleClick}
      style={{ width:'100%', height:'100%', cursor: st.current.trained?'crosshair':'default' }} />
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// UNSUPERVISED SIM  — all points start gray, colors assigned by k-means
// ─────────────────────────────────────────────────────────────────────────────
interface KPoint { x:number; y:number; cluster:number; displayColor:string }
interface Centroid { x:number; y:number; color:string; tx:number; ty:number }
const CLUSTER_COLORS=['#3b82f6','#22c55e','#f59e0b']

function UnsupervisedSim({ playing, speed, canvasSize }:{ playing:boolean; speed:number; canvasSize:{w:number;h:number} }) {
  const cvRef = useRef<HTMLCanvasElement>(null)
  const st = useRef<{ points:KPoint[]; centroids:Centroid[]; phase:'scatter'|'assign'|'move'|'done'; phaseT:number; iteration:number }>
    ({ points:[], centroids:[], phase:'scatter', phaseT:0, iteration:0 })
  const rafRef = useRef(0)
  const playRef = useRef(playing); useEffect(()=>{ playRef.current=playing },[playing])
  const speedRef = useRef(speed); useEffect(()=>{ speedRef.current=speed },[speed])

  const W = canvasSize.w, H = canvasSize.h

  const initState = useCallback(()=>{
    const s = st.current
    const cx=W/2, cy=H/2
    const centers=[{x:cx*0.45,y:cy*0.5},{x:cx*1.55,y:cy*0.5},{x:cx,y:cy*1.6}]
    s.points=[]
    centers.forEach(c=>{
      for(let i=0;i<13;i++){
        s.points.push({
          x:c.x+(Math.random()-0.5)*W*0.24,
          y:c.y+(Math.random()-0.5)*H*0.24,
          cluster:-1,
          displayColor:'#64748b', // start gray — no cluster assigned
        })
      }
    })
    s.centroids=CLUSTER_COLORS.map(col=>({ x:W*0.15+Math.random()*W*0.7, y:H*0.12+Math.random()*H*0.76, color:col, tx:0, ty:0 }))
    s.phase='scatter'; s.phaseT=0; s.iteration=0
  },[W,H])

  useEffect(()=>{
    const cv=cvRef.current; if(!cv) return
    const ctx=cv.getContext('2d')!
    initState()
    const s=st.current

    const assignClusters=()=>{
      s.points.forEach(p=>{
        let minD=Infinity,best=0
        s.centroids.forEach((c,i)=>{ const d=Math.hypot(p.x-c.x,p.y-c.y); if(d<minD){minD=d;best=i} })
        p.cluster=best
        p.displayColor=CLUSTER_COLORS[best]
      })
    }
    const moveCentroids=()=>{
      s.centroids.forEach((c,i)=>{
        const m=s.points.filter(p=>p.cluster===i)
        if(m.length>0){ c.tx=m.reduce((a,p)=>a+p.x,0)/m.length; c.ty=m.reduce((a,p)=>a+p.y,0)/m.length }
      })
    }

    const draw=()=>{
      if(playRef.current){
        const sp=speedRef.current
        s.phaseT+=0.022*sp

        if(s.phase==='scatter'&&s.phaseT>1.8){ assignClusters(); s.phase='assign'; s.phaseT=0 }
        else if(s.phase==='assign'&&s.phaseT>1.8){ moveCentroids(); s.phase='move'; s.phaseT=0 }
        else if(s.phase==='move'){
          s.centroids.forEach(c=>{ c.x+=(c.tx-c.x)*0.05*sp; c.y+=(c.ty-c.y)*0.05*sp })
          if(s.phaseT>2.2){ s.iteration++; if(s.iteration>=6){ s.phase='done'; s.phaseT=0 } else{ assignClusters(); s.phase='assign'; s.phaseT=0 } }
        }
        else if(s.phase==='done'&&s.phaseT>3.5){ initState(); }
      }

      ctx.clearRect(0,0,W,H)

      // Cluster regions when assigned
      if(s.phase!=='scatter'){
        s.centroids.forEach(c=>{
          const g=ctx.createRadialGradient(c.x,c.y,0,c.x,c.y,W*0.33)
          g.addColorStop(0,c.color+'1a'); g.addColorStop(1,'transparent')
          ctx.fillStyle=g; ctx.beginPath(); ctx.arc(c.x,c.y,W*0.33,0,Math.PI*2); ctx.fill()
        })
      }

      // Assign lines
      if(s.phase==='assign'){
        s.points.forEach(p=>{
          if(p.cluster<0)return
          const c=s.centroids[p.cluster]
          ctx.beginPath(); ctx.moveTo(p.x,p.y); ctx.lineTo(c.x,c.y)
          ctx.strokeStyle=c.color+'55'; ctx.lineWidth=1; ctx.setLineDash([3,3]); ctx.stroke(); ctx.setLineDash([])
        })
      }

      // Points — gray before assignment, colored after
      s.points.forEach(p=>{
        ctx.beginPath(); ctx.arc(p.x,p.y,7,0,Math.PI*2)
        ctx.fillStyle=p.displayColor+'cc'; ctx.fill()
        ctx.strokeStyle=p.displayColor==='#64748b'?'#475569':p.displayColor; ctx.lineWidth=1.5; ctx.stroke()
      })

      // Centroids
      s.centroids.forEach((c,i)=>{
        ctx.beginPath(); ctx.arc(c.x,c.y,14,0,Math.PI*2); ctx.fillStyle=c.color+'33'; ctx.fill()
        ctx.beginPath(); ctx.arc(c.x,c.y,10,0,Math.PI*2); ctx.fillStyle=c.color; ctx.fill()
        ctx.strokeStyle='#fff'; ctx.lineWidth=2.5; ctx.stroke()
        ctx.fillStyle='#fff'; ctx.font='bold 11px monospace'; ctx.textAlign='center'; ctx.fillText('✕',c.x,c.y+4)
        ctx.fillStyle=c.color; ctx.font='bold 10px sans-serif'; ctx.fillText(`Cluster ${i+1}`,c.x,c.y-18)
      })

      // Phase label
      const labels:Record<string,string>={
        scatter:'⏳ Body rozmístěna náhodně — žádné štítky, žádné skupiny…',
        assign:`🔄 Přiřazuji body k nejbližšímu centroidu (iterace ${s.iteration+1})`,
        move:'📍 Centroidy se přesouvají do středu svých skupin…',
        done:'✓ Konvergováno! K-Means nalezl 3 přirozené skupiny.',
      }
      ctx.fillStyle=s.phase==='done'?'#22c55e':C.sec; ctx.font=`${s.phase==='done'?'bold':''} 11px sans-serif`; ctx.textAlign='center'
      ctx.fillText(labels[s.phase]||'',W/2,H-10)
      if(s.iteration>0){ ctx.fillStyle='#475569'; ctx.font='9px monospace'; ctx.textAlign='left'; ctx.fillText(`Iterace: ${s.iteration}`,10,20) }

      rafRef.current=requestAnimationFrame(draw)
    }
    rafRef.current=requestAnimationFrame(draw)
    return()=>cancelAnimationFrame(rafRef.current)
  },[initState,W,H])

  return <canvas ref={cvRef} width={W} height={H} style={{ width:'100%', height:'100%' }}/>
}

// ─────────────────────────────────────────────────────────────────────────────
// REINFORCEMENT SIM
// ─────────────────────────────────────────────────────────────────────────────
const MAZE_COLS=8,MAZE_ROWS=6,CELL=56
type MazeCell=0|1
const MAZE:MazeCell[][]=[
  [0,0,0,1,0,0,0,0],[1,1,0,1,0,1,1,0],[0,0,0,0,0,0,1,0],
  [0,1,1,1,1,0,1,0],[0,0,0,0,1,0,0,0],[1,1,1,0,1,1,0,0],
]
const START={r:0,c:0},GOAL={r:2,c:7}
const DIRS=[{dr:0,dc:1,l:'→'},{dr:1,dc:0,l:'↓'},{dr:0,dc:-1,l:'←'},{dr:-1,dc:0,l:'↑'}]

function ReinforcementSim({ playing, speed, canvasSize }:{ playing:boolean; speed:number; canvasSize:{w:number;h:number} }) {
  const cvRef=useRef<HTMLCanvasElement>(null)
  const st=useRef<any>({ agent:{r:START.r,c:START.c,x:0,y:0}, Q:[] as number[][][], episode:0, epsilon:1.0, path:[] as any[], rewardPops:[] as any[], stepQueue:[] as any[], phaseT:0, moving:false })
  const rafRef=useRef(0)
  const playRef=useRef(playing); useEffect(()=>{ playRef.current=playing },[playing])
  const speedRef=useRef(speed); useEffect(()=>{ speedRef.current=speed },[speed])

  const W=canvasSize.w, H=canvasSize.h
  // Scale cell to fit canvas
  const cellW=Math.floor(W/MAZE_COLS), cellH=Math.floor((H-60)/MAZE_ROWS)
  const cS=Math.min(cellW,cellH,CELL)
  const offX=Math.floor((W-cS*MAZE_COLS)/2), offY=38

  const cx=(c:number)=>offX+c*cS+cS/2
  const cy=(r:number)=>offY+r*cS+cS/2
  const isValid=(r:number,c:number)=>r>=0&&r<MAZE_ROWS&&c>=0&&c<MAZE_COLS&&MAZE[r][c]===0

  useEffect(()=>{
    const cv=cvRef.current; if(!cv) return
    const ctx=cv.getContext('2d')!
    const s=st.current
    s.Q=Array.from({length:MAZE_ROWS},()=>Array.from({length:MAZE_COLS},()=>Array(4).fill(0)))
    s.agent={r:START.r,c:START.c,x:cx(START.c),y:cy(START.r)}
    s.epsilon=1.0; s.episode=0; s.moving=false; s.stepQueue=[]; s.path=[]; s.rewardPops=[]

    const LR=0.2,GAMMA=0.9
    const eps_greedy=(r:number,c:number,eps:number)=>{
      if(Math.random()<eps)return Math.floor(Math.random()*4)
      const q=s.Q[r][c]; return q.indexOf(Math.max(...q))
    }
    const runEpisode=()=>{
      let r=START.r,c=START.c; const path=[{r,c}]
      for(let i=0;i<60;i++){
        const a=eps_greedy(r,c,s.epsilon),{dr,dc}=DIRS[a]
        const nr=r+dr,nc=c+dc
        let reward=-0.1,nr2=r,nc2=c
        if(isValid(nr,nc)){nr2=nr;nc2=nc}else{reward=-0.5}
        if(nr2===GOAL.r&&nc2===GOAL.c)reward=10
        const mq=Math.max(...s.Q[nr2][nc2])
        s.Q[r][c][a]+=LR*(reward+GAMMA*mq-s.Q[r][c][a])
        r=nr2;c=nc2; path.push({r,c})
        if(r===GOAL.r&&c===GOAL.c)break
      }
      s.epsilon=Math.max(0.05,s.epsilon*0.92); s.episode++
      return path
    }
    // pre-train
    for(let i=0;i<10;i++)runEpisode()

    const draw=()=>{
      if(playRef.current){
        const sp=speedRef.current; s.phaseT+=0.04*sp
        if(s.moving&&s.stepQueue.length>0){
          const tgt=s.stepQueue[0]
          const tx=cx(tgt.c),ty=cy(tgt.r),dx=tx-s.agent.x,dy=ty-s.agent.y,dist=Math.hypot(dx,dy)
          const mv=cS*0.1*sp
          if(dist<mv){ s.agent.x=tx;s.agent.y=ty;s.agent.r=tgt.r;s.agent.c=tgt.c;s.stepQueue.shift()
            if(tgt.r===GOAL.r&&tgt.c===GOAL.c)s.rewardPops.push({x:tx,y:ty-10,val:10,t:2})
            else if(Math.random()<0.25)s.rewardPops.push({x:tx,y:ty-8,val:-0.1,t:1.2})
          }else{ s.agent.x+=dx/dist*mv; s.agent.y+=dy/dist*mv }
        }else{ const p=runEpisode(); s.path=p; s.stepQueue=[...p]; s.moving=true; s.agent.r=START.r;s.agent.c=START.c;s.agent.x=cx(START.c);s.agent.y=cy(START.r) }
        s.rewardPops=s.rewardPops.map((p:any)=>({...p,t:p.t-0.04*sp,y:p.y-0.4*sp})).filter((p:any)=>p.t>0)
      }

      ctx.clearRect(0,0,W,H)
      // Header
      ctx.fillStyle='#475569';ctx.font='10px sans-serif';ctx.textAlign='left'
      ctx.fillText(`Epizoda: ${s.episode}  |  Průzkum ε: ${(s.epsilon*100).toFixed(0)}%`,8,18)

      for(let r=0;r<MAZE_ROWS;r++) for(let c=0;c<MAZE_COLS;c++){
        const x=offX+c*cS,y=offY+r*cS
        if(MAZE[r][c]===1){ ctx.fillStyle='#1e293b'; ctx.fillRect(x+1,y+1,cS-2,cS-2) }
        else{
          ctx.fillStyle='#0f172a'; ctx.fillRect(x+1,y+1,cS-2,cS-2)
          const mq=Math.max(...s.Q[r][c])
          if(mq>0.5){ ctx.fillStyle=`rgba(34,197,94,${Math.min(0.35,mq*0.07)})`; ctx.fillRect(x+1,y+1,cS-2,cS-2) }
          if(!(r===GOAL.r&&c===GOAL.c)){
            const ba=s.Q[r][c].indexOf(Math.max(...s.Q[r][c]))
            if(s.Q[r][c][ba]>0.3){
              ctx.fillStyle=`rgba(148,163,184,${Math.min(0.65,s.Q[r][c][ba]*0.15)})`
              ctx.font=`${Math.floor(cS*0.35)}px sans-serif`;ctx.textAlign='center'
              ctx.fillText(DIRS[ba].l,x+cS/2,y+cS/2+cS*0.15)
            }
          }
        }
        ctx.strokeStyle='#1e2d3d';ctx.lineWidth=1;ctx.strokeRect(x,y,cS,cS)
      }

      ctx.font=`${Math.floor(cS*0.55)}px sans-serif`;ctx.textAlign='center'
      ctx.fillText('🏆',cx(GOAL.c),cy(GOAL.r)+cS*0.18)

      if(s.path.length>1){
        ctx.beginPath();ctx.moveTo(cx(s.path[0].c),cy(s.path[0].r))
        for(let i=1;i<s.path.length;i++)ctx.lineTo(cx(s.path[i].c),cy(s.path[i].r))
        ctx.strokeStyle='#f59e0b44';ctx.lineWidth=3;ctx.setLineDash([4,3]);ctx.stroke();ctx.setLineDash([])
      }

      ctx.beginPath();ctx.arc(s.agent.x,s.agent.y,cS*0.24,0,Math.PI*2)
      ctx.fillStyle='#7c3aed';ctx.fill();ctx.strokeStyle='#a78bfa';ctx.lineWidth=2.5;ctx.stroke()
      ctx.font=`${Math.floor(cS*0.35)}px sans-serif`;ctx.textAlign='center'
      ctx.fillText('🤖',s.agent.x,s.agent.y+cS*0.12)

      s.rewardPops.forEach((p:any)=>{
        const al=Math.min(1,p.t);ctx.globalAlpha=al
        ctx.fillStyle=p.val>0?'#22c55e':'#ef4444'
        ctx.font=`bold ${p.val>1?14:11}px sans-serif`;ctx.textAlign='center'
        ctx.fillText(p.val>0?`+${p.val.toFixed(1)}`:p.val.toFixed(1),p.x,p.y)
        ctx.globalAlpha=1
      })

      const bw=W*0.5,bx2=(W-bw)/2,by=H-22
      ctx.fillStyle='#1e293b';ctx.fillRect(bx2,by,bw,7)
      ctx.fillStyle=`hsl(${s.epsilon*45+15},78%,55%)`;ctx.fillRect(bx2,by,bw*s.epsilon,7)
      ctx.fillStyle='#475569';ctx.font='9px sans-serif';ctx.textAlign='center'
      ctx.fillText(`Průzkum ←──── ε=${(s.epsilon*100).toFixed(0)}% ────→ Využívání`,W/2,by-5)

      rafRef.current=requestAnimationFrame(draw)
    }
    rafRef.current=requestAnimationFrame(draw)
    return()=>cancelAnimationFrame(rafRef.current)
  },[cx,cy,isValid,W,H])

  return <canvas ref={cvRef} width={W} height={H} style={{ width:'100%', height:'100%' }}/>
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────────────────
export default function MLSim({ accentColor }:{ accentColor:string }) {
  const [tab,setTab]=useState<Tab>('supervised')
  const [playing,setPlaying]=useState(false) // start paused!
  const [speed,setSpeed]=useState(1)
  const containerRef=useRef<HTMLDivElement>(null)
  const [canvasSize,setCanvasSize]=useState({w:800,h:440})
  const info=TAB_INFO[tab]

  // Measure canvas container to fill it
  useEffect(()=>{
    const el=containerRef.current; if(!el)return
    const ro=new ResizeObserver(entries=>{
      const{width,height}=entries[0].contentRect
      setCanvasSize({w:Math.floor(width),h:Math.floor(height)})
    })
    ro.observe(el)
    return()=>ro.disconnect()
  },[])

  const TABS=[
    {id:'supervised' as Tab, label:'Dozorované', icon:'👨‍🏫'},
    {id:'unsupervised' as Tab, label:'Nedozorované', icon:'🔍'},
    {id:'reinforcement' as Tab, label:'Posilované', icon:'🎮'},
  ]

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', background:C.bg, color:C.txt, fontFamily:'inherit', overflow:'hidden' }}>
      <style>{`@keyframes fadeIn{from{opacity:0;transform:translateY(7px)}to{opacity:1;transform:none}}.fi{animation:fadeIn .3s ease}`}</style>

      {/* Header */}
      <div style={{ padding:'10px 20px', borderBottom:`1px solid ${C.border}`, display:'flex', alignItems:'center', gap:12, flexShrink:0, background:C.card }}>
        <a href="/student/simulations" style={{ color:C.sec, fontSize:13, textDecoration:'none' }}>← Simulace</a>
        <div style={{ width:1, height:14, background:C.border }}/>
        <span style={{ fontSize:14, fontWeight:700 }}>🤖 Strojové učení — Typy učení</span>
        <div style={{ marginLeft:'auto', display:'flex', gap:10, alignItems:'center' }}>
          <button onClick={()=>setPlaying(p=>!p)}
            style={{ padding:'6px 18px', background:playing?'rgba(239,68,68,.15)':'rgba(34,197,94,.15)', color:playing?'#f87171':'#4ade80', border:`1px solid ${playing?'rgba(239,68,68,.3)':'rgba(34,197,94,.3)'}`, borderRadius:8, cursor:'pointer', fontSize:12, fontWeight:700, fontFamily:'inherit' }}>
            {playing?'⏸ Pauza':'▶ Spustit animaci'}
          </button>
          <label style={{ fontSize:10, color:C.sec, display:'flex', alignItems:'center', gap:5 }}>
            Rychlost:
            <input type="range" min={0.3} max={3} step={0.1} value={speed} onChange={e=>setSpeed(+e.target.value)}
              style={{ width:70, accentColor }} />
            <span style={{ color:C.txt, minWidth:24 }}>{speed.toFixed(1)}×</span>
          </label>
        </div>
      </div>

      {/* Tab bar */}
      <div style={{ display:'flex', borderBottom:`1px solid ${C.border}`, flexShrink:0, background:C.card }}>
        {TABS.map(t=>(
          <button key={t.id} onClick={()=>{setTab(t.id);setPlaying(false)}}
            style={{ flex:1, padding:'11px 8px', background:'transparent', border:'none', borderBottom:`3px solid ${tab===t.id?TAB_INFO[t.id].color:'transparent'}`, cursor:'pointer', fontFamily:'inherit', display:'flex', flexDirection:'column', alignItems:'center', gap:3, transition:'border-color .2s' }}>
            <span style={{ fontSize:22 }}>{t.icon}</span>
            <span style={{ fontSize:11, fontWeight:700, color:tab===t.id?TAB_INFO[t.id].color:C.sec }}>{t.label}</span>
            <span style={{ fontSize:9, color:'#475569' }}>{TAB_INFO[t.id].subtitle}</span>
          </button>
        ))}
      </div>

      {/* Main */}
      <div style={{ flex:1, display:'flex', minHeight:0, overflow:'hidden' }}>

        {/* Canvas — takes all available space */}
        <div ref={containerRef} style={{ flex:1, position:'relative', overflow:'hidden' }}>
          <div style={{ position:'absolute', top:0, left:0, right:0, height:3, background:`linear-gradient(90deg,transparent,${info.color},transparent)` }}/>

          {/* Play overlay — shown when paused and not yet started */}
          {!playing && (
            <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', zIndex:5, pointerEvents:'none' }}>
              <div style={{ padding:'16px 32px', background:'rgba(9,11,16,.85)', border:`1px solid ${info.color}44`, borderRadius:16, textAlign:'center', backdropFilter:'blur(4px)' }}>
                <div style={{ fontSize:36, marginBottom:8 }}>{info.icon}</div>
                <div style={{ fontSize:15, fontWeight:700, color:'#fff', marginBottom:4 }}>{info.title}</div>
                <div style={{ fontSize:12, color:C.sec, marginBottom:14 }}>{info.tagline}</div>
                <div style={{ fontSize:11, color:info.color, pointerEvents:'auto' }}>
                  <button onClick={()=>setPlaying(true)} style={{ padding:'8px 24px', background:info.color, color:'#000', border:'none', borderRadius:8, cursor:'pointer', fontFamily:'inherit', fontSize:13, fontWeight:700 }}>
                    ▶ Spustit simulaci
                  </button>
                </div>
              </div>
            </div>
          )}

          <div key={tab} className="fi" style={{ width:'100%', height:'100%' }}>
            {canvasSize.w>0 && (
              <>
                {tab==='supervised'    && <SupervisedSim     playing={playing} speed={speed} canvasSize={canvasSize}/>}
                {tab==='unsupervised'  && <UnsupervisedSim   playing={playing} speed={speed} canvasSize={canvasSize}/>}
                {tab==='reinforcement' && <ReinforcementSim  playing={playing} speed={speed} canvasSize={canvasSize}/>}
              </>
            )}
          </div>
        </div>

        {/* Right info panel */}
        <div style={{ width:280, flexShrink:0, borderLeft:`1px solid ${C.border}`, display:'flex', flexDirection:'column', overflow:'hidden', background:C.card }}>
          <div style={{ flex:1, overflowY:'auto', padding:16 }}>
            <div key={tab} className="fi">
              <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:13 }}>
                <div style={{ width:38, height:38, borderRadius:10, background:info.color+'20', border:`1px solid ${info.color}40`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:20 }}>{info.icon}</div>
                <div>
                  <div style={{ fontSize:14, fontWeight:800, color:'#fff' }}>{info.title}</div>
                  <div style={{ fontSize:10, color:info.color, fontWeight:600 }}>{info.subtitle}</div>
                </div>
              </div>

              <div style={{ padding:'7px 10px', background:info.color+'12', border:`1px solid ${info.color}30`, borderRadius:8, marginBottom:12 }}>
                <div style={{ fontSize:11.5, fontWeight:700, color:info.color }}>{info.tagline}</div>
              </div>

              <p style={{ fontSize:12, color:'#cbd5e1', lineHeight:1.75, margin:'0 0 13px' }}>{info.description}</p>

              <div style={{ marginBottom:13 }}>
                <div style={{ fontSize:9, fontWeight:700, color:C.sec, textTransform:'uppercase', letterSpacing:'.06em', marginBottom:7 }}>Jak funguje</div>
                {info.steps.map((s,i)=>(
                  <div key={i} style={{ display:'flex', gap:8, marginBottom:6, alignItems:'flex-start' }}>
                    <div style={{ width:17, height:17, borderRadius:'50%', background:info.color+'25', border:`1px solid ${info.color}50`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:9, fontWeight:700, color:info.color, flexShrink:0, marginTop:1 }}>{i+1}</div>
                    <span style={{ fontSize:11, color:'#94a3b8', lineHeight:1.6 }}>{s}</span>
                  </div>
                ))}
              </div>

              <div style={{ padding:'8px 10px', background:'rgba(251,191,36,.05)', border:'1px solid rgba(251,191,36,.15)', borderRadius:8, marginBottom:13 }}>
                <p style={{ fontSize:11, color:'#fcd34d', margin:0, lineHeight:1.65 }}>💡 {info.when}</p>
              </div>

              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:7, marginBottom:16 }}>
                <div style={{ padding:'8px 9px', background:'rgba(34,197,94,.06)', border:'1px solid rgba(34,197,94,.17)', borderRadius:8 }}>
                  <div style={{ fontSize:8, fontWeight:700, color:'#4ade80', textTransform:'uppercase', marginBottom:5 }}>✓ Výhody</div>
                  {info.pros.map((p,i)=><div key={i} style={{ fontSize:10.5, color:'#86efac', marginBottom:3, lineHeight:1.5 }}>• {p}</div>)}
                </div>
                <div style={{ padding:'8px 9px', background:'rgba(239,68,68,.06)', border:'1px solid rgba(239,68,68,.17)', borderRadius:8 }}>
                  <div style={{ fontSize:8, fontWeight:700, color:'#f87171', textTransform:'uppercase', marginBottom:5 }}>✗ Nevýhody</div>
                  {info.cons.map((c,i)=><div key={i} style={{ fontSize:10.5, color:'#fca5a5', marginBottom:3, lineHeight:1.5 }}>• {c}</div>)}
                </div>
              </div>

              {/* Supervised: click hint */}
              {tab==='supervised'&&(
                <div style={{ padding:'8px 10px', background:'rgba(59,130,246,.08)', border:'1px solid rgba(59,130,246,.2)', borderRadius:8, marginBottom:13 }}>
                  <div style={{ fontSize:10, color:'#93c5fd', lineHeight:1.6 }}>👆 Po dotrénování modelu klikni kdekoliv na canvas — model předpoví zda se jedná o kočku nebo psa!</div>
                </div>
              )}
              {tab==='unsupervised'&&(
                <div style={{ padding:'8px 10px', background:'rgba(34,197,94,.08)', border:'1px solid rgba(34,197,94,.2)', borderRadius:8, marginBottom:13 }}>
                  <div style={{ fontSize:10, color:'#86efac', lineHeight:1.6 }}>🔍 Body začínají šedé (bez skupiny). Sleduj jak je K-Means postupně rozdělí do barevných clusterů na základě vzdálenosti.</div>
                </div>
              )}
              {tab==='reinforcement'&&(
                <div style={{ padding:'8px 10px', background:'rgba(245,158,11,.08)', border:'1px solid rgba(245,158,11,.2)', borderRadius:8, marginBottom:13 }}>
                  <div style={{ fontSize:10, color:'#fcd34d', lineHeight:1.6 }}>🎮 Sleduj ε (epsilon) bar — zpočátku agent exploruje náhodně, postupně přechází na naučenou strategii. Zelená heatmapa = naučené Q-hodnoty.</div>
                </div>
              )}

              {/* Comparison table */}
              <div style={{ borderTop:`1px solid ${C.border}`, paddingTop:13 }}>
                <div style={{ fontSize:9, fontWeight:700, color:C.sec, textTransform:'uppercase', letterSpacing:'.06em', marginBottom:8 }}>Srovnání typů učení</div>
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:10 }}>
                  <thead><tr style={{ borderBottom:`1px solid ${C.border}` }}>
                    <th style={{ padding:'3px 5px', color:C.sec, fontWeight:600, textAlign:'left' }}>Typ</th>
                    <th style={{ padding:'3px 5px', color:C.sec, fontWeight:600 }}>Štítky</th>
                    <th style={{ padding:'3px 5px', color:C.sec, fontWeight:600, textAlign:'left' }}>Příklad</th>
                  </tr></thead>
                  <tbody>
                    {([['supervised','👨‍🏫 Dozor.','Ano','Spam filtr'],['unsupervised','🔍 Nedozor.','Ne','K-Means'],['reinforcement','🎮 Posilované','Odměna','AlphaGo']] as [Tab,string,string,string][]).map(([id,name,lbl,ex])=>(
                      <tr key={id} style={{ borderBottom:`1px solid ${C.border}`, background:tab===id?TAB_INFO[id].color+'10':'transparent' }}>
                        <td style={{ padding:'4px 5px', color:tab===id?TAB_INFO[id].color:'#64748b', fontWeight:tab===id?700:400 }}>{name}</td>
                        <td style={{ padding:'4px 5px', textAlign:'center', color:'#94a3b8' }}>{lbl}</td>
                        <td style={{ padding:'4px 5px', color:'#94a3b8' }}>{ex}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
