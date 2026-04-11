'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useRef, useCallback } from 'react'

const GRID = 8
function makeShape(type: 'square' | 'circle' | 'triangle'): number[] {
  const g: number[] = []
  for (let r = 0; r < GRID; r++) {
    for (let c = 0; c < GRID; c++) {
      if (type === 'square') { g.push(r>=1&&r<=6&&c>=1&&c<=6?1:0) }
      else if (type === 'circle') { const dx=c-3.5,dy=r-3.5; g.push(dx*dx+dy*dy<=10?1:0) }
      else { const mid=GRID/2,sl=(mid-1)/(GRID-2),l=mid-sl*(r-1),ri=mid+sl*(r-1); g.push(r>=1&&r<=6&&c>=l&&c<=ri?1:0) }
    }
  }
  return g
}
const SHAPES = {
  square:   {pixels:makeShape('square'),   label:'Čtverec',    emoji:'⬛', color:'#3b82f6'},
  circle:   {pixels:makeShape('circle'),   label:'Kolečko',    emoji:'🔵', color:'#22c55e'},
  triangle: {pixels:makeShape('triangle'), label:'Trojúhelník', emoji:'🔺', color:'#f59e0b'},
}
type ShapeKey = keyof typeof SHAPES
const SAMPLE_INDICES = [0,9,18,27,36,45,54,63]
const N_INPUT=8, N_HIDDEN=4, N_OUTPUT=3
function sigmoid(x:number){return 1/(1+Math.exp(-x))}
function dsigmoid(y:number){return y*(1-y)}
function initW(r:number,c:number):number[][]{return Array.from({length:r},()=>Array.from({length:c},()=>(Math.random()-0.5)*2))}
type Phase='choose'|'pixels'|'input_layer'|'weights_h'|'hidden_calc'|'activation'|'weights_o'|'output_calc'|'prediction'|'backprop'|'weight_update'|'done'
const PHASE_ORDER:Phase[]=['choose','pixels','input_layer','weights_h','hidden_calc','activation','weights_o','output_calc','prediction','backprop','weight_update','done']
const INFO:Record<Phase,{title:string;exp:string;tip:string}>={
  choose:       {title:'Vyber tvar',              exp:'Vyber tvar, který chceš naučit síť rozpoznávat. Uvidíš celý proces trénování animovaně, krok za krokem.',                                      tip:'💡 Neuronová síť se učí z příkladů — stejně jako ty!'},
  pixels:       {title:'1. Pixely obrazu',          exp:'Obrázek se rozdělí na 8×8 pixelů. Každý pixel = 0 (bílý) nebo 1 (černý). Pro přehlednost vybereme 8 vzorků po uhlopříčce (označeny čísly 1–8).', tip:'💡 Počítač vidí obrázky jako mřížku čísel.'},
  input_layer:  {title:'2. Vstupní vrstva',          exp:'8 vzorkových pixelů vstoupí do vstupní vrstvy. Šipky ukazují jak jsou čísla přiřazena do vstupních neuronů. Neurony jen předávají data — nepočítají.',                  tip:'💡 Vstupní vrstva = smysly sítě.'},
  weights_h:    {title:'3. Váhy spojení',             exp:'Každé spojení mezi neurony má váhu. Zelená čára = kladná váha (zesiluje), červená = záporná (tlumí). Sleduj animaci toku signálu ze vstupní do skryté vrstvy.',         tip:'💡 Váhy jsou to, co se síť učí měnit.'},
  hidden_calc:  {title:'4. Výpočet skryté vrstvy',   exp:'Každý skrytý neuron spočítá: z = Σ(vstup × váha) + bias. Bias je jako posun prahu aktivace. Výsledek z je zatím "surové číslo".',          tip:'💡 Vzorec: z = x₁w₁ + x₂w₂ + ... + b'},
  activation:   {title:'5. Aktivační funkce σ',       exp:'Surové z prochází sigmoidou: σ(z)=1/(1+e⁻ᶻ). Výstup je vždy v (0,1). Simuluje "zapnutý/vypnutý" neuron. Čím vyšší z, tím blíže 1.',          tip:'💡 Bez aktivační funkce by síť počítala jen lineární rovnice.'},
  weights_o:    {title:'6. Váhy → výstupní vrstva',   exp:'Aktivované hodnoty skryté vrstvy putují přes další sadu vah do výstupní vrstvy. Každý výstupní neuron odpovídá jednomu tvaru.',              tip:'💡 Více skrytých vrstev = složitější vzory.'},
  output_calc:  {title:'7. Výstupní vrstva',          exp:'Výstupní vrstva má 3 neurony (čtverec, kolečko, trojúhelník). Každý vypočítá svou aktivaci — neuron s nejvyšší hodnotou je predikce.',      tip:'💡 Nejvyšší hodnota = predikce sítě.'},
  prediction:   {title:'8. Predikce',                 exp:'Neuron s nejvyšší hodnotou = predikovaný tvar. Tabulka níže ukazuje výstup sítě vs. správné odpovědi a chybu pro každou třídu.',             tip:'💡 Správnost závisí na aktuálních vahách.'},
  backprop:     {title:'9. Zpětné šíření chyby',      exp:'Chyba se šíří ZPĚT sítí (šipky ←). Každá váha dostane gradient — díl odpovědnosti za chybu. Čím větší váha přispěla k chybě, tím větší gradient.', tip:'💡 Backprop = pravidlo řetězce z matematiky.'},
  weight_update:{title:'10. Aktualizace vah',          exp:'Váhy se upraví ve směru snižujícím chybu: w = w − η·∇L. η = 0.35 (learning rate). Poté proběhne nový forward pass a zkontroluje se predikce.', tip:'💡 Malé η = pomalé ale přesnější učení.'},
  done:         {title:'✓ Hotovo!',                   exp:'Síť správně rozpoznala tvar! Váhy se ustálily. V praxi se sítě trénují na tisících příkladů s mnohem složitějšími architekturami.',           tip:'💡 Reálné sítě mají miliony parametrů.'},
}
const C={bg:'#090B10',card:'#11141D',border:'rgba(255,255,255,0.07)',txt:'#fff',sec:'#8892a4',
  wPos:'#22c55e',wNeg:'#ef4444',wNeu:'#4b5563',correct:'#22c55e',wrong:'#ef4444'}
const NET_W=720,NET_H=380,NR=20
const LAYER_X=[NET_W*0.16,NET_W*0.50,NET_W*0.84]
function ly(li:number,ni:number){const n=[N_INPUT,N_HIDDEN,N_OUTPUT][li];const sp=Math.min((NET_H-70)/n,54);return NET_H/2-(n-1)*sp/2+ni*sp+32}

interface Dot{id:number;x1:number;y1:number;x2:number;y2:number;t:number;col:string}

export default function NeuralNetSim({accentColor}:{accentColor:string}){
  const accent=accentColor||'#7c3aed'
  const [sel,setSel]=useState<ShapeKey|null>(null)
  const [phase,setPhase]=useState<Phase>('choose')
  const [epoch,setEpoch]=useState(0)
  const [auto,setAuto]=useState(false)
  const autoRef=useRef(false)
  const [wH,setWH]=useState(()=>initW(N_HIDDEN,N_INPUT))
  const [wO,setWO]=useState(()=>initW(N_OUTPUT,N_HIDDEN))
  const [bH,setBH]=useState(()=>Array(N_HIDDEN).fill(0))
  const [bO,setBO]=useState(()=>Array(N_OUTPUT).fill(0))
  const [inp,setInp]=useState(Array(N_INPUT).fill(0))
  const [zH,setZH]=useState(Array(N_HIDDEN).fill(0))
  const [aH,setAH]=useState(Array(N_HIDDEN).fill(0))
  const [zO,setZO]=useState(Array(N_OUTPUT).fill(0))
  const [aO,setAO]=useState(Array(N_OUTPUT).fill(0))
  const [pred,setPred]=useState(-1)
  const [dots,setDots]=useState<Dot[]>([])
  const dotsRef=useRef<Dot[]>([])
  const animRef=useRef(0)
  const pixRef=useRef<HTMLCanvasElement>(null)
  const netRef=useRef<HTMLCanvasElement>(null)
  const sk:ShapeKey[]=['square','circle','triangle']
  const ti=sel?sk.indexOf(sel):0
  const pn=PHASE_ORDER.indexOf(phase)
  const isFwd=pn<=8, isBwd=pn>=9&&pn<=10

  const fwd=useCallback((i2:number[],wh:number[][],wo:number[][],bh:number[],bo:number[])=>{
    const zh=wh.map((r,i)=>r.reduce((s,w,j)=>s+w*i2[j],0)+bh[i])
    const ah=zh.map(sigmoid)
    const zo=wo.map((r,i)=>r.reduce((s,w,j)=>s+w*ah[j],0)+bo[i])
    const ao=zo.map(sigmoid)
    return{zh,ah,zo,ao,pred:ao.indexOf(Math.max(...ao))}
  },[])

  const bwd=useCallback((i2:number[],ah2:number[],ao2:number[],tgt:number,wo2:number[][],wh2:number[][],bh2:number[],bo2:number[],lr=0.35)=>{
    const tv=Array(N_OUTPUT).fill(0);tv[tgt]=1
    const dO=ao2.map((a,i)=>(a-tv[i])*dsigmoid(a))
    const dH=ah2.map((a,j)=>wo2.reduce((s,r,i)=>s+r[j]*dO[i],0)*dsigmoid(a))
    return{
      nWO:wo2.map((r,i)=>r.map((w,j)=>w-lr*dO[i]*ah2[j])),
      nWH:wh2.map((r,i)=>r.map((w,j)=>w-lr*dH[i]*i2[j])),
      nBO:bo2.map((b,i)=>b-lr*dO[i]),
      nBH:bh2.map((b,i)=>b-lr*dH[i]),
    }
  },[])

  const launch=useCallback((from:'i'|'h',col:string)=>{
    const sl=from==='i'?0:1,dl=from==='i'?1:2
    const sn=from==='i'?N_INPUT:N_HIDDEN,dn=from==='i'?N_HIDDEN:N_OUTPUT
    const d:Dot[]=[]; let id=Date.now()
    for(let s=0;s<sn;s++) for(let d2=0;d2<dn;d2++){
      d.push({id:id++,x1:LAYER_X[sl],y1:ly(sl,s),x2:LAYER_X[dl],y2:ly(dl,d2),t:-(s*0.07+d2*0.025),col})
    }
    dotsRef.current=d; setDots([...d])
  },[])

  useEffect(()=>{
    let run=true
    const step=()=>{
      if(!run)return
      dotsRef.current=dotsRef.current.map(d=>({...d,t:d.t+0.016})).filter(d=>d.t<1.3)
      setDots([...dotsRef.current])
      animRef.current=requestAnimationFrame(step)
    }
    animRef.current=requestAnimationFrame(step)
    return()=>{run=false;cancelAnimationFrame(animRef.current)}
  },[])

  // Draw pixel canvas
  useEffect(()=>{
    const cv=pixRef.current; if(!cv||!sel)return
    const ctx=cv.getContext('2d')!
    const px=SHAPES[sel].pixels,sz=cv.width/GRID
    ctx.clearRect(0,0,cv.width,cv.height)
    px.forEach((v,i)=>{
      const r=Math.floor(i/GRID),c=i%GRID
      ctx.fillStyle=v===1?'#e2e8f0':'#0d1117'
      ctx.fillRect(c*sz,r*sz,sz-1,sz-1)
      if(SAMPLE_INDICES.includes(i)){
        ctx.strokeStyle=accent+'cc'; ctx.lineWidth=1.5
        ctx.strokeRect(c*sz+1,r*sz+1,sz-3,sz-3)
        const si=SAMPLE_INDICES.indexOf(i)
        ctx.fillStyle=v===1?'#000':accent
        ctx.font=`bold ${sz*0.38}px monospace`; ctx.textAlign='center'
        ctx.fillText(`${si+1}`,c*sz+sz/2,r*sz+sz*0.72)
      }
    })
  },[sel,phase,accent])

  // Draw network canvas
  useEffect(()=>{
    const cv=netRef.current; if(!cv)return
    const ctx=cv.getContext('2d')!
    ctx.clearRect(0,0,NET_W,NET_H)

    // Layer labels high above neurons
    const lnames=['Vstupní vrstva','Skrytá vrstva','Výstupní vrstva']
    LAYER_X.forEach((x,li)=>{
      ctx.fillStyle='#475569'; ctx.font='10px sans-serif'; ctx.textAlign='center'
      ctx.fillText(lnames[li],x,14)
    })

    // Input → Hidden connections
    if(pn>=3){
      for(let h=0;h<N_HIDDEN;h++) for(let i=0;i<N_INPUT;i++){
        const w=wH[h]?.[i]??0
        const col=w>0.3?C.wPos:w<-0.3?C.wNeg:C.wNeu
        const a=Math.min(0.65,Math.abs(w)*0.4+0.12)
        ctx.strokeStyle=col+Math.round(a*255).toString(16).padStart(2,'0')
        ctx.lineWidth=Math.min(2.2,Math.abs(w)*1.2+0.3)
        ctx.beginPath(); ctx.moveTo(LAYER_X[0],ly(0,i)); ctx.lineTo(LAYER_X[1],ly(1,h)); ctx.stroke()
        // Weight label on hidden_calc
        if(pn===4&&h===0){
          const mx=(LAYER_X[0]+LAYER_X[1])/2,my=(ly(0,i)+ly(1,h))/2
          ctx.fillStyle=w>0?C.wPos+'cc':C.wNeg+'cc'; ctx.font='7px monospace'; ctx.textAlign='center'
          ctx.fillText(w.toFixed(1),mx,my)
        }
      }
    }
    // Hidden → Output connections
    if(pn>=6){
      for(let o=0;o<N_OUTPUT;o++) for(let h=0;h<N_HIDDEN;h++){
        const w=wO[o]?.[h]??0
        const col=w>0.3?C.wPos:w<-0.3?C.wNeg:C.wNeu
        const a=Math.min(0.65,Math.abs(w)*0.4+0.12)
        ctx.strokeStyle=col+Math.round(a*255).toString(16).padStart(2,'0')
        ctx.lineWidth=Math.min(2.2,Math.abs(w)*1.2+0.3)
        ctx.beginPath(); ctx.moveTo(LAYER_X[1],ly(1,h)); ctx.lineTo(LAYER_X[2],ly(2,o)); ctx.stroke()
      }
    }
    // Backprop dashed arrows ←
    if(pn===9||pn===10){
      ctx.setLineDash([5,4]); ctx.strokeStyle=C.wrong+'77'; ctx.lineWidth=1.2
      for(let h=0;h<N_HIDDEN;h++) for(let o=0;o<N_OUTPUT;o++){
        ctx.beginPath(); ctx.moveTo(LAYER_X[2]-NR-4,ly(2,o)); ctx.lineTo(LAYER_X[1]+NR+4,ly(1,h)); ctx.stroke()
      }
      for(let i=0;i<N_INPUT;i++) for(let h=0;h<N_HIDDEN;h++){
        ctx.beginPath(); ctx.moveTo(LAYER_X[1]-NR-4,ly(1,h)); ctx.lineTo(LAYER_X[0]+NR+4,ly(0,i)); ctx.stroke()
      }
      ctx.setLineDash([])
    }

    // Pixel-to-neuron connector lines (input_layer phase)
    if(pn===2){
      ctx.setLineDash([3,3]); ctx.strokeStyle=accent+'66'; ctx.lineWidth=1
      for(let i=0;i<N_INPUT;i++){
        // line from right edge of pixel grid (conceptual) to input neuron
        ctx.beginPath()
        ctx.moveTo(LAYER_X[0]-NR-2, ly(0,i))
        ctx.lineTo(LAYER_X[0]-NR-30, ly(0,i))
        ctx.stroke()
        // label
        ctx.fillStyle=accent+'bb'; ctx.font='bold 9px monospace'; ctx.textAlign='right'
        ctx.fillText(`px${i+1}`,LAYER_X[0]-NR-32,ly(0,i)+3)
      }
      ctx.setLineDash([])
    }

    // Signal dots
    for(const d of dotsRef.current){
      const t=Math.max(0,Math.min(1,d.t)); if(t<=0)continue
      const x=d.x1+(d.x2-d.x1)*t, y=d.y1+(d.y2-d.y1)*t
      const al=t<0.1?t*10:t>0.85?(1-t)*6.67:1
      ctx.beginPath(); ctx.arc(x,y,3.5,0,Math.PI*2)
      ctx.fillStyle=d.col+Math.round(al*210).toString(16).padStart(2,'0'); ctx.fill()
      ctx.beginPath(); ctx.arc(x,y,7,0,Math.PI*2)
      ctx.fillStyle=d.col+Math.round(al*50).toString(16).padStart(2,'0'); ctx.fill()
    }

    // Draw neurons
    const dN=(x:number,y:number,val:number,lbl:string,active:boolean,li:number,ni:number)=>{
      if(active&&val>0.5){ctx.beginPath();ctx.arc(x,y,NR+7,0,Math.PI*2);ctx.fillStyle='#3b82f618';ctx.fill()}
      ctx.beginPath();ctx.arc(x,y,NR,0,Math.PI*2)
      ctx.fillStyle=active?(val>0.6?'#1d4ed8':val>0.3?'#1e3a5f':'#1a2035'):'#141922'; ctx.fill()
      ctx.strokeStyle=active?(val>0.5?'#60a5fa':'#334155'):'#1e293b'; ctx.lineWidth=active?2:1; ctx.stroke()
      if(active&&pn>=4){
        ctx.fillStyle=val>0.4?'#e2e8f0':'#64748b'; ctx.font='bold 9px monospace'; ctx.textAlign='center'
        ctx.fillText(val.toFixed(2),x,y+3)
      } else {
        ctx.fillStyle='#334155'; ctx.font='8px monospace'; ctx.textAlign='center'; ctx.fillText(lbl,x,y+3)
      }
      ctx.fillStyle='#475569'; ctx.font='8px monospace'; ctx.textAlign='center'; ctx.fillText(lbl,x,y+NR+12)
      // Output labels
      if(li===2&&pn>=8&&ni<3){
        const isk=sk[ni],isW=aO.indexOf(Math.max(...aO))===ni,isTgt=ni===ti
        ctx.font='11px sans-serif'; ctx.textAlign='left'
        ctx.fillStyle=isW?(isTgt?C.correct:C.wrong):'#64748b'
        ctx.fillText(`${SHAPES[isk].emoji} ${(val*100).toFixed(0)}%`,x+NR+6,y+4)
        if(isW){ctx.strokeStyle=isTgt?C.correct+'55':C.wrong+'55';ctx.lineWidth=2;ctx.beginPath();ctx.arc(x,y,NR+5,0,Math.PI*2);ctx.stroke()}
      }
      // Pixel index label for input neurons in input_layer phase
      if(li===0&&pn===2){
        ctx.fillStyle=accent; ctx.font='bold 9px monospace'; ctx.textAlign='center'
        ctx.fillText(`px${ni+1}`,x,y+NR+22)
      }
    }
    for(let i=0;i<N_INPUT;i++)  dN(LAYER_X[0],ly(0,i),inp[i],`x${i+1}`,pn>=2,0,i)
    for(let h=0;h<N_HIDDEN;h++) dN(LAYER_X[1],ly(1,h),pn>=5?aH[h]:pn>=4?sigmoid(zH[h]||0):0,`h${h+1}`,pn>=4,1,h)
    for(let o=0;o<N_OUTPUT;o++) dN(LAYER_X[2],ly(2,o),pn>=8?aO[o]:0,`y${o+1}`,pn>=8,2,o)

    // z values next to hidden neurons
    if(pn===4||pn===5){
      for(let h=0;h<N_HIDDEN;h++){
        ctx.fillStyle='#f59e0b'; ctx.font='7.5px monospace'; ctx.textAlign='right'
        ctx.fillText(`z=${(zH[h]||0).toFixed(2)}`,LAYER_X[1]-NR-5,ly(1,h)+3)
      }
    }
  },[phase,inp,zH,aH,aO,wH,wO,pred,epoch,dots,ti,pn])

  const next=useCallback(()=>{
    setPhase(prev=>{
      if(prev==='choose')return prev
      if(prev==='pixels'){
        const px=SHAPES[sel!].pixels; const i2=SAMPLE_INDICES.map(i=>px[i]); setInp(i2); return'input_layer'
      }
      if(prev==='input_layer')return'weights_h'
      if(prev==='weights_h'){
        const px=SHAPES[sel!].pixels; const i2=SAMPLE_INDICES.map(i=>px[i])
        setZH(wH.map((r,i)=>r.reduce((s,w,j)=>s+w*i2[j],0)+bH[i]))
        launch('i',accent); return'hidden_calc'
      }
      if(prev==='hidden_calc'){setAH(zH.map(sigmoid));return'activation'}
      if(prev==='activation')return'weights_o'
      if(prev==='weights_o'){
        setZO(wO.map((r,i)=>r.reduce((s,w,j)=>s+w*aH[j],0)+bO[i]))
        launch('h','#a78bfa'); return'output_calc'
      }
      if(prev==='output_calc'){const a=zO.map(sigmoid);setAO(a);setPred(a.indexOf(Math.max(...a)));return'prediction'}
      if(prev==='prediction'){return aO.indexOf(Math.max(...aO))===ti?'done':'backprop'}
      if(prev==='backprop'){
        const{nWO,nWH,nBO,nBH}=bwd(inp,aH,aO,ti,wO,wH,bH,bO)
        setWO(nWO);setWH(nWH);setBO(nBO);setBH(nBH); return'weight_update'
      }
      if(prev==='weight_update'){
        setEpoch(e=>e+1)
        const px=SHAPES[sel!].pixels; const i2=SAMPLE_INDICES.map(i=>px[i])
        const{nWO,nWH,nBO,nBH}=bwd(i2,aH,aO,ti,wO,wH,bH,bO)
        const{zh,ah,zo,ao,pred:p}=fwd(i2,nWH,nWO,nBH,nBO)
        setInp(i2);setZH(zh);setAH(ah);setZO(zo);setAO(ao);setPred(p)
        if(p===ti)return'done'
        return'input_layer'
      }
      if(prev==='done'){
        setSel(null);setEpoch(0)
        setWH(initW(N_HIDDEN,N_INPUT));setWO(initW(N_OUTPUT,N_HIDDEN))
        setBH(Array(N_HIDDEN).fill(0));setBO(Array(N_OUTPUT).fill(0))
        setInp(Array(N_INPUT).fill(0));setZH(Array(N_HIDDEN).fill(0))
        setAH(Array(N_HIDDEN).fill(0));setZO(Array(N_OUTPUT).fill(0))
        setAO(Array(N_OUTPUT).fill(0));setPred(-1)
        return'choose'
      }
      return prev
    })
  },[sel,wH,wO,bH,bO,zH,aH,zO,aO,inp,ti,fwd,bwd,launch,accent])

  useEffect(()=>{
    autoRef.current=auto
    if(!auto)return
    const id=setInterval(()=>{if(autoRef.current)next()},2000)
    return()=>clearInterval(id)
  },[auto,next])

  const info=INFO[phase]

  return (
    <div style={{display:'flex',flexDirection:'column',height:'100%',background:C.bg,color:C.txt,fontFamily:'inherit',overflow:'hidden'}}>
      <style>{`@keyframes fadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}.fi{animation:fadeIn .3s ease}`}</style>

      {/* Header */}
      <div style={{padding:'11px 22px',borderBottom:`1px solid ${C.border}`,display:'flex',alignItems:'center',gap:14,flexShrink:0,background:C.card}}>
        <a href="/student/simulations" style={{color:C.sec,fontSize:13,textDecoration:'none'}}>← Simulace</a>
        <div style={{width:1,height:14,background:C.border}}/>
        <span style={{fontSize:14,fontWeight:700}}>🧠 Neuronová síť — vizualizace trénování</span>
        {epoch>0&&<span style={{marginLeft:'auto',fontSize:11,padding:'2px 10px',background:'rgba(124,58,237,.15)',color:'#a78bfa',borderRadius:20,border:'1px solid rgba(124,58,237,.3)'}}>Epocha {epoch}</span>}
      </div>

      <div style={{display:'flex',flex:1,minHeight:0,overflow:'hidden'}}>
        {/* LEFT panel */}
        <div style={{width:162,flexShrink:0,borderRight:`1px solid ${C.border}`,display:'flex',flexDirection:'column',padding:12,gap:10,overflowY:'auto',background:C.card}}>
          <div style={{fontSize:9,fontWeight:700,color:C.sec,textTransform:'uppercase',letterSpacing:'.06em'}}>Vstupní obrázek</div>
          {phase==='choose'&&sk.map(s=>(
            <button key={s} onClick={()=>{setSel(s);setPhase('pixels')}}
              style={{padding:'9px 7px',background:SHAPES[s].color+'18',border:`1px solid ${SHAPES[s].color}44`,borderRadius:9,cursor:'pointer',fontFamily:'inherit',display:'flex',alignItems:'center',gap:7}}>
              <span style={{fontSize:18}}>{SHAPES[s].emoji}</span>
              <span style={{fontSize:12,fontWeight:600,color:'#fff'}}>{SHAPES[s].label}</span>
            </button>
          ))}
          {sel&&(<>
            <div style={{textAlign:'center',fontSize:10,color:C.sec}}>{SHAPES[sel].emoji} {SHAPES[sel].label}</div>
            <canvas ref={pixRef} width={138} height={138} style={{width:'100%',imageRendering:'pixelated',borderRadius:5,border:`1px solid ${C.border}`}}/>
            {pn>=2&&(
              <div>
                <div style={{fontSize:8,fontWeight:700,color:C.sec,textTransform:'uppercase',marginBottom:4}}>Vzorkované pixely</div>
                <div style={{display:'flex',flexWrap:'wrap',gap:2}}>
                  {inp.map((v,i)=>(
                    <div key={i} style={{width:24,height:24,borderRadius:3,background:v>0.5?'#e2e8f0':'#1a2035',border:`1px solid ${C.border}`,display:'flex',alignItems:'center',justifyContent:'center',flexDirection:'column'}}>
                      <span style={{fontSize:8,color:v>0.5?'#000':C.sec,fontWeight:700,fontFamily:'monospace'}}>{v.toFixed(0)}</span>
                      <span style={{fontSize:6,color:v>0.5?'#3b82f6':C.sec+'aa'}}>x{i+1}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>)}
        </div>

        {/* CENTER */}
        <div style={{flex:1,display:'flex',flexDirection:'column',minWidth:0,overflow:'hidden'}}>
          {/* Direction indicator */}
          {phase!=='choose'&&(
            <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:8,padding:'7px',borderBottom:`1px solid ${C.border}`,flexShrink:0,background:C.card}}>
              {isFwd?(
                <div style={{display:'flex',alignItems:'center',gap:6,fontSize:11,fontWeight:700}}>
                  <span style={{color:'#60a5fa'}}>Vstup</span>
                  <span style={{color:C.sec,fontSize:10}}>──────</span>
                  <span style={{fontSize:14}}>→</span>
                  <span style={{color:C.sec,fontSize:10}}>──────</span>
                  <span style={{color:'#a78bfa'}}>Výstup</span>
                  <span style={{marginLeft:8,padding:'2px 10px',background:'rgba(59,130,246,.1)',color:'#60a5fa',borderRadius:20,fontSize:10,border:'1px solid rgba(59,130,246,.2)'}}>▶ Dopředné šíření (Forward pass)</span>
                </div>
              ):(
                <div style={{display:'flex',alignItems:'center',gap:6,fontSize:11,fontWeight:700}}>
                  <span style={{color:'#60a5fa'}}>Vstup</span>
                  <span style={{color:C.sec,fontSize:10}}>──────</span>
                  <span style={{fontSize:14}}>←</span>
                  <span style={{color:C.sec,fontSize:10}}>──────</span>
                  <span style={{color:'#f87171'}}>Výstup</span>
                  <span style={{marginLeft:8,padding:'2px 10px',background:'rgba(239,68,68,.1)',color:'#f87171',borderRadius:20,fontSize:10,border:'1px solid rgba(239,68,68,.2)'}}>◀ Zpětné šíření chyby (Backpropagation)</span>
                </div>
              )}
            </div>
          )}

          {/* Canvas */}
          <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',padding:12,minHeight:0,overflow:'hidden'}}>
            {phase==='choose'?(
              <div style={{textAlign:'center',color:C.sec}}>
                <div style={{fontSize:52,marginBottom:12}}>🧠</div>
                <div style={{fontSize:17,fontWeight:700,color:'#fff',marginBottom:6}}>Neuronová síť</div>
                <div style={{fontSize:13,lineHeight:1.7}}>Vyber tvar vlevo<br/>a sleduj trénování krok za krokem.</div>
              </div>
            ):(
              <canvas ref={netRef} width={NET_W} height={NET_H} style={{maxWidth:'100%',maxHeight:'100%'}}/>
            )}
          </div>

          {/* Computation strip */}
          {pn>=4&&pn<=7&&(
            <div style={{borderTop:`1px solid ${C.border}`,padding:'8px 18px',background:C.card,flexShrink:0}}>
              <div style={{display:'flex',gap:20,alignItems:'flex-start',overflowX:'auto'}}>
                <div style={{flexShrink:0}}>
                  <div style={{fontSize:8,fontWeight:700,color:C.sec,textTransform:'uppercase',marginBottom:5}}>z = Σ(x·w) + b</div>
                  {zH.map((z,i)=>(
                    <div key={i} style={{fontSize:9,fontFamily:'monospace',color:C.sec,marginBottom:2}}>
                      <span style={{color:'#60a5fa'}}>h{i+1}</span>: {wH[i]?.slice(0,4).map((w,j)=>`${w>0?'+':''}${w.toFixed(1)}·${inp[j]?.toFixed(0)??'0'}`).join('')}+{bH[i]?.toFixed(1)}=<span style={{color:'#f59e0b'}}>{z.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
                {pn>=5&&(
                  <div style={{flexShrink:0}}>
                    <div style={{fontSize:8,fontWeight:700,color:C.sec,textTransform:'uppercase',marginBottom:5}}>σ(z) → aktivace</div>
                    <div style={{display:'flex',gap:4,alignItems:'flex-end'}}>
                      {aH.map((a,i)=>(
                        <div key={i} style={{textAlign:'center'}}>
                          <div style={{width:26,height:40,background:'rgba(255,255,255,.04)',borderRadius:4,position:'relative',overflow:'hidden',border:`1px solid ${C.border}`}}>
                            <div style={{position:'absolute',bottom:0,width:'100%',height:`${a*100}%`,background:a>0.5?'#3b82f6':'#374151',borderRadius:4,transition:'height .5s'}}/>
                          </div>
                          <div style={{fontSize:7,color:'#94a3b8',marginTop:2}}>{a.toFixed(2)}</div>
                          <div style={{fontSize:6,color:C.sec}}>h{i+1}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Error table */}
          {(pn>=8)&&(
            <div style={{borderTop:`1px solid ${C.border}`,padding:'8px 18px',background:C.card,flexShrink:0}} className="fi">
              <div style={{display:'flex',gap:16,alignItems:'flex-start',flexWrap:'wrap' as const}}>
                <div>
                  <div style={{fontSize:8,fontWeight:700,color:C.sec,textTransform:'uppercase',marginBottom:5}}>Výstup sítě vs. Cíl vs. Chyba</div>
                  <table style={{borderCollapse:'collapse',fontSize:10,fontFamily:'monospace'}}>
                    <thead><tr>
                      <th style={{padding:'2px 10px',color:C.sec,fontWeight:600,textAlign:'left',fontSize:8}}>Třída</th>
                      <th style={{padding:'2px 10px',color:'#60a5fa',fontWeight:600,fontSize:8}}>Výstup</th>
                      <th style={{padding:'2px 10px',color:C.correct,fontWeight:600,fontSize:8}}>Cíl</th>
                      <th style={{padding:'2px 10px',color:C.wrong,fontWeight:600,fontSize:8}}>|Chyba|</th>
                    </tr></thead>
                    <tbody>{sk.map((s,i)=>{
                      const tgt=i===ti?1:0,out=aO[i]??0,err=Math.abs(out-tgt)
                      const isW=aO.indexOf(Math.max(...aO))===i
                      return(
                        <tr key={s} style={{background:isW?(i===ti?'rgba(34,197,94,.07)':'rgba(239,68,68,.07)'):'transparent'}}>
                          <td style={{padding:'2px 10px',color:SHAPES[s].color}}>{SHAPES[s].emoji} {SHAPES[s].label}</td>
                          <td style={{padding:'2px 10px',textAlign:'center',color:isW?'#fff':'#64748b',fontWeight:isW?700:400}}>{out.toFixed(3)}</td>
                          <td style={{padding:'2px 10px',textAlign:'center',color:tgt===1?C.correct:C.sec}}>{tgt.toFixed(3)}</td>
                          <td style={{padding:'2px 10px',textAlign:'center',color:err>0.3?C.wrong:err>0.1?'#f59e0b':C.correct,fontWeight:600}}>{err.toFixed(3)}</td>
                        </tr>
                      )
                    })}</tbody>
                  </table>
                </div>
                {phase==='done'&&(
                  <div style={{padding:'10px 14px',background:'rgba(34,197,94,.08)',border:'1px solid rgba(34,197,94,.2)',borderRadius:9}}>
                    <div style={{fontSize:22,marginBottom:4}}>🎉</div>
                    <div style={{fontSize:11,color:'#86efac',fontWeight:600}}>{sel&&SHAPES[sel].label} rozpoznán!</div>
                    <div style={{fontSize:10,color:C.sec}}>Po {epoch} epoch{epoch===1?'ě':epoch<5?'ách':'ách'}</div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Controls */}
          <div style={{borderTop:`1px solid ${C.border}`,padding:'9px 18px',display:'flex',alignItems:'center',gap:10,flexShrink:0}}>
            <div style={{display:'flex',gap:3}}>
              {PHASE_ORDER.slice(1,11).map((_,i)=>(
                <div key={i} style={{width:7,height:7,borderRadius:'50%',background:pn>i+1?accent:pn===i+1?accent+'88':'rgba(255,255,255,.1)',transition:'background .3s'}}/>
              ))}
            </div>
            {phase!=='choose'&&<span style={{fontSize:10,color:C.sec}}>Krok {pn}/10</span>}
            <div style={{flex:1}}/>
            {phase!=='choose'&&(<>
              <button onClick={()=>setAuto(p=>!p)}
                style={{padding:'5px 12px',background:auto?'rgba(239,68,68,.1)':'rgba(255,255,255,.05)',color:auto?'#f87171':C.sec,border:`1px solid ${auto?'rgba(239,68,68,.25)':C.border}`,borderRadius:7,cursor:'pointer',fontSize:11,fontFamily:'inherit'}}>
                {auto?'⏸ Pauza':'▶ Auto'}
              </button>
              <button onClick={next}
                style={{padding:'7px 18px',background:phase==='done'?C.correct:accent,color:'#fff',border:'none',borderRadius:7,cursor:'pointer',fontSize:13,fontWeight:700,fontFamily:'inherit'}}>
                {phase==='done'?'🔄 Znovu':'Další krok →'}
              </button>
            </>)}
          </div>
        </div>

        {/* RIGHT info panel */}
        <div style={{width:240,flexShrink:0,borderLeft:`1px solid ${C.border}`,display:'flex',flexDirection:'column',overflow:'hidden',background:C.card}}>
          <div style={{flex:1,overflowY:'auto',padding:14}}>
            <div key={phase} className="fi">
              {phase!=='choose'&&phase!=='done'&&(
                <div style={{fontSize:8,fontWeight:700,color:accent,textTransform:'uppercase',letterSpacing:'.08em',marginBottom:5}}>Krok {pn} / 10</div>
              )}
              <h3 style={{fontSize:13,fontWeight:800,color:'#fff',margin:'0 0 9px',lineHeight:1.4}}>{info.title}</h3>
              <p style={{fontSize:11.5,color:'#cbd5e1',lineHeight:1.75,margin:'0 0 10px'}}>{info.exp}</p>
              <div style={{padding:'8px 10px',background:'rgba(251,191,36,.05)',border:'1px solid rgba(251,191,36,.16)',borderRadius:7}}>
                <p style={{fontSize:10.5,color:'#fcd34d',margin:0,lineHeight:1.6}}>{info.tip}</p>
              </div>
              {phase==='weights_h'&&(
                <div style={{marginTop:11}}>
                  <div style={{fontSize:8,fontWeight:700,color:C.sec,textTransform:'uppercase',marginBottom:5}}>Legenda vah</div>
                  {[['Kladná váha','#22c55e','zesiluje signál'],['Záporná váha','#ef4444','tlumí signál'],['Slabá váha','#4b5563','malý vliv']].map(([l,c,d])=>(
                    <div key={l} style={{display:'flex',alignItems:'center',gap:7,marginBottom:5}}>
                      <div style={{width:26,height:2.5,background:c as string,borderRadius:2}}/>
                      <div><div style={{fontSize:10,color:'#fff'}}>{l}</div><div style={{fontSize:9,color:C.sec}}>{d}</div></div>
                    </div>
                  ))}
                </div>
              )}
              {phase==='activation'&&<SigmoidCurve/>}
              {phase==='backprop'&&(
                <div style={{marginTop:10,background:'rgba(239,68,68,.06)',border:'1px solid rgba(239,68,68,.18)',borderRadius:7,padding:9}}>
                  <div style={{fontSize:9,fontWeight:700,color:'#f87171',marginBottom:5}}>Gradient</div>
                  <div style={{fontFamily:'monospace',fontSize:9.5,color:'#e2e8f0',lineHeight:2}}>
                    δ_o = (ŷ−y)·σ'(z_o)<br/>
                    δ_h = (Wᵀδ_o)·σ'(z_h)<br/>
                    <span style={{color:'#f87171'}}>← šíří se zpátky</span>
                  </div>
                </div>
              )}
              {phase==='weight_update'&&(
                <div style={{marginTop:10,background:'rgba(34,197,94,.06)',border:'1px solid rgba(34,197,94,.18)',borderRadius:7,padding:9}}>
                  <div style={{fontSize:9,fontWeight:700,color:'#4ade80',marginBottom:5}}>Gradient descent</div>
                  <div style={{fontFamily:'monospace',fontSize:9.5,color:'#e2e8f0',lineHeight:2}}>
                    w ← w − 0.35·∂L/∂w<br/>
                    b ← b − 0.35·∂L/∂b
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function SigmoidCurve(){
  const W=176,H=68
  const pts=Array.from({length:W},(_,i)=>{const x=(i/W)*10-5;return`${i},${H-sigmoid2(x)*H}`}).join(' ')
  function sigmoid2(x:number){return 1/(1+Math.exp(-x))}
  return(
    <div style={{marginTop:11}}>
      <div style={{fontSize:8,fontWeight:700,color:'#8892a4',textTransform:'uppercase',letterSpacing:'.05em',marginBottom:4}}>σ(z) = 1/(1+e⁻ᶻ)</div>
      <svg width={W} height={H+16} style={{display:'block',overflow:'visible'}}>
        <line x1={0} y1={H/2} x2={W} y2={H/2} stroke="rgba(255,255,255,.07)" strokeWidth={1}/>
        <line x1={W/2} y1={0} x2={W/2} y2={H} stroke="rgba(255,255,255,.07)" strokeWidth={1}/>
        <polyline points={pts} fill="none" stroke="#7c3aed" strokeWidth={2}/>
        {[[-5,0],[0,W/2],[5,W-8]].map(([l,x])=><text key={l} x={x} y={H+13} fill="#475569" fontSize={8} textAnchor="middle">{l}</text>)}
      </svg>
    </div>
  )
}
