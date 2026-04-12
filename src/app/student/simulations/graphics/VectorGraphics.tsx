'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
const C = { bg:'#090B10', card:'#11141D', border:'rgba(255,255,255,0.07)', txt:'#fff', sec:'#8892a4' }

type Tool = 'select'|'bezier'|'rect'|'circle'|'bool'
type BoolOp = 'union'|'intersect'|'subtract'|'exclude'

interface Pt { x:number; y:number }
interface BezierCurve { p0:Pt; p1:Pt; p2:Pt; p3:Pt; color:string }
interface Shape { type:'rect'|'circle'; x:number; y:number; w:number; h:number; color:string; id:number }

export function VectorTab({ size }:{ size:{w:number;h:number} }) {
  const [tool, setTool] = useState<Tool>('bezier')
  const [boolOp, setBoolOp] = useState<BoolOp>('union')
  const [curves, setCurves] = useState<BezierCurve[]>([])
  const [shapes, setShapes] = useState<Shape[]>([])
  const [dragging, setDragging] = useState<{type:'cp'|'shape';curveIdx:number;cpIdx:number;shapeId?:number}|null>(null)
  const [tempCurve, setTempCurve] = useState<Partial<BezierCurve>|null>(null)
  const [clickCount, setClickCount] = useState(0)
  const [showGrid, setShowGrid] = useState(true)
  const [showCoords, setShowCoords] = useState(true)
  const [mousePos, setMousePos] = useState<Pt>({x:0,y:0})
  const [nextShapeId, setNextShapeId] = useState(1)
  const [selectedBool, setSelectedBool] = useState<number[]>([])
  const [animT, setAnimT] = useState(0)
  const cvRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef(0)
  const animRef = useRef(0)

  const W = size.w, H = size.h

  // Animate t for curve tracing
  useEffect(()=>{
    let t=0, dir=1
    const step=()=>{
      t+=0.008*dir; if(t>1){t=1;dir=-1}; if(t<0){t=0;dir=1}
      setAnimT(t); animRef.current=requestAnimationFrame(step)
    }
    animRef.current=requestAnimationFrame(step)
    return()=>cancelAnimationFrame(animRef.current)
  },[])

  const evalBezier=(c:BezierCurve,t:number):Pt=>{
    const mt=1-t
    return {
      x:mt**3*c.p0.x+3*mt**2*t*c.p1.x+3*mt*t**2*c.p2.x+t**3*c.p3.x,
      y:mt**3*c.p0.y+3*mt**2*t*c.p1.y+3*mt*t**2*c.p2.y+t**3*c.p3.y
    }
  }

  // Init with demo curve
  useEffect(()=>{
    const cx=W/2, cy=H/2
    setCurves([{
      p0:{x:cx-120,y:cy+40}, p1:{x:cx-60,y:cy-80},
      p2:{x:cx+60,y:cy-80},  p3:{x:cx+120,y:cy+40},
      color:'#ec4899'
    }])
    setShapes([
      {type:'rect',  x:cx-140,y:cy+10,w:110,h:80, color:'#3b82f6', id:1},
      {type:'circle',x:cx+30, y:cy+10,w:110,h:80, color:'#22c55e', id:2},
    ])
    setNextShapeId(3)
  },[W,H])

  // Draw
  useEffect(()=>{
    const cv=cvRef.current; if(!cv)return
    const ctx=cv.getContext('2d')!
    ctx.clearRect(0,0,W,H)
    ctx.fillStyle='#0a0d14'; ctx.fillRect(0,0,W,H)

    // Grid
    if(showGrid){
      ctx.strokeStyle='rgba(255,255,255,.05)'; ctx.lineWidth=1
      for(let x=0;x<W;x+=20){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H);ctx.stroke()}
      for(let y=0;y<H;y+=20){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke()}
      // Axes
      ctx.strokeStyle='rgba(255,255,255,.15)'; ctx.lineWidth=1.5
      ctx.beginPath();ctx.moveTo(0,H/2);ctx.lineTo(W,H/2);ctx.stroke()
      ctx.beginPath();ctx.moveTo(W/2,0);ctx.lineTo(W/2,H);ctx.stroke()
      // Axis labels
      ctx.fillStyle='#334155'; ctx.font='9px monospace'; ctx.textAlign='center'
      for(let x=20;x<W;x+=40) ctx.fillText(String(x-Math.round(W/2)),x,H/2+11)
      ctx.textAlign='right'
      for(let y=20;y<H;y+=40) if(Math.abs(y-H/2)>5) ctx.fillText(String(Math.round(H/2)-y),W/2-3,y+3)
    }

    // Boolean shapes
    shapes.forEach(s=>{
      const isSelected=selectedBool.includes(s.id)
      ctx.save()
      ctx.fillStyle=s.color+(isSelected?'99':'33')
      ctx.strokeStyle=isSelected?'#fff':s.color
      ctx.lineWidth=isSelected?2:1.5
      ctx.beginPath()
      if(s.type==='rect') ctx.rect(s.x,s.y,s.w,s.h)
      else ctx.ellipse(s.x+s.w/2,s.y+s.h/2,s.w/2,s.h/2,0,0,Math.PI*2)
      ctx.fill(); ctx.stroke()
      if(isSelected){
        ctx.fillStyle='#fff'; ctx.font='bold 10px sans-serif'; ctx.textAlign='center'
        ctx.fillText(s.type==='rect'?'▭':'◯',s.x+s.w/2,s.y+s.h/2+4)
      }
      ctx.restore()
    })

    // Bezier curves
    curves.forEach((curve,ci)=>{
      // Control polygon
      ctx.strokeStyle='rgba(255,255,255,.12)'; ctx.lineWidth=1; ctx.setLineDash([4,3])
      ctx.beginPath(); ctx.moveTo(curve.p0.x,curve.p0.y); ctx.lineTo(curve.p1.x,curve.p1.y); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(curve.p3.x,curve.p3.y); ctx.lineTo(curve.p2.x,curve.p2.y); ctx.stroke()
      ctx.setLineDash([])

      // Curve
      ctx.beginPath(); ctx.moveTo(curve.p0.x,curve.p0.y)
      ctx.bezierCurveTo(curve.p1.x,curve.p1.y,curve.p2.x,curve.p2.y,curve.p3.x,curve.p3.y)
      ctx.strokeStyle=curve.color; ctx.lineWidth=2.5; ctx.stroke()

      // Animated point on curve
      const pt=evalBezier(curve,animT)
      ctx.beginPath(); ctx.arc(pt.x,pt.y,5,0,Math.PI*2)
      ctx.fillStyle='#fff'; ctx.fill()
      // Tangent line at t
      const eps=0.01
      const ptA=evalBezier(curve,Math.max(0,animT-eps))
      const ptB=evalBezier(curve,Math.min(1,animT+eps))
      const tx=ptB.x-ptA.x, ty=ptB.y-ptA.y
      const len=Math.sqrt(tx*tx+ty*ty)||1
      ctx.strokeStyle='rgba(255,255,255,.5)'; ctx.lineWidth=1.5
      ctx.beginPath(); ctx.moveTo(pt.x-tx/len*25,pt.y-ty/len*25); ctx.lineTo(pt.x+tx/len*25,pt.y+ty/len*25); ctx.stroke()

      // Control points
      const pts=[curve.p0,curve.p1,curve.p2,curve.p3]
      const cpCols=['#22c55e','#60a5fa','#a78bfa','#f59e0b']
      const cpLabels=['P0','P1','P2','P3']
      pts.forEach((p,pi)=>{
        ctx.beginPath(); ctx.arc(p.x,p.y,7,0,Math.PI*2)
        ctx.fillStyle=cpCols[pi]; ctx.fill()
        ctx.strokeStyle='#fff'; ctx.lineWidth=1.5; ctx.stroke()
        ctx.fillStyle='#fff'; ctx.font='bold 8px monospace'; ctx.textAlign='center'
        ctx.fillText(cpLabels[pi],p.x,p.y-12)
        if(showCoords){
          ctx.fillStyle='rgba(255,255,255,.5)'; ctx.font='7px monospace'
          ctx.fillText(`(${Math.round(p.x-W/2)},${Math.round(H/2-p.y)})`,p.x,p.y+20)
        }
      })
    })

    // Temp curve being drawn
    if(tempCurve?.p0){
      ctx.beginPath(); ctx.arc(tempCurve.p0.x,tempCurve.p0.y,6,0,Math.PI*2)
      ctx.fillStyle='#22c55e'; ctx.fill()
      if(tempCurve.p3){
        ctx.beginPath(); ctx.moveTo(tempCurve.p0.x,tempCurve.p0.y)
        ctx.bezierCurveTo(tempCurve.p1?.x??mousePos.x,tempCurve.p1?.y??mousePos.y,
          tempCurve.p2?.x??mousePos.x,tempCurve.p2?.y??mousePos.y,
          tempCurve.p3.x,tempCurve.p3.y)
        ctx.strokeStyle='#ec4899aa'; ctx.lineWidth=2; ctx.setLineDash([5,3]); ctx.stroke(); ctx.setLineDash([])
      }
    }

    // Mouse coords
    if(showCoords){
      ctx.fillStyle='rgba(255,255,255,.4)'; ctx.font='10px monospace'; ctx.textAlign='right'
      ctx.fillText(`(${Math.round(mousePos.x-W/2)}, ${Math.round(H/2-mousePos.y)})`,W-6,H-6)
    }

    // t label
    if(curves.length>0){
      ctx.fillStyle='#ec4899'; ctx.font='bold 10px monospace'; ctx.textAlign='left'
      ctx.fillText(`t = ${animT.toFixed(2)}`,8,16)
    }
  },[curves,shapes,tempCurve,mousePos,animT,showGrid,showCoords,selectedBool,W,H])

  const getPos=(e:React.MouseEvent<HTMLCanvasElement>):Pt=>{
    const rect=cvRef.current!.getBoundingClientRect()
    return {x:(e.clientX-rect.left)*W/rect.width, y:(e.clientY-rect.top)*H/rect.height}
  }

  const findCP=(pos:Pt,curve:BezierCurve):{cpIdx:number}|null=>{
    const pts=[curve.p0,curve.p1,curve.p2,curve.p3]
    for(let i=0;i<4;i++){
      const d=Math.hypot(pts[i].x-pos.x,pts[i].y-pos.y)
      if(d<14)return{cpIdx:i}
    }
    return null
  }

  const onMouseDown=useCallback((e:React.MouseEvent<HTMLCanvasElement>)=>{
    const pos=getPos(e)
    if(tool==='select'){
      // Find control point to drag
      for(let ci=0;ci<curves.length;ci++){
        const cp=findCP(pos,curves[ci])
        if(cp){setDragging({type:'cp',curveIdx:ci,...cp});return}
      }
      // Find shape to toggle boolean selection
      for(const s of shapes){
        const inShape=s.type==='rect'?
          pos.x>=s.x&&pos.x<=s.x+s.w&&pos.y>=s.y&&pos.y<=s.y+s.h:
          ((pos.x-s.x-s.w/2)**2/(s.w/2)**2+(pos.y-s.y-s.h/2)**2/(s.h/2)**2)<=1
        if(inShape){
          setSelectedBool(prev=>prev.includes(s.id)?prev.filter(i=>i!==s.id):[...prev,s.id].slice(-2))
          return
        }
      }
    }
    if(tool==='bezier'){
      if(clickCount===0){setTempCurve({p0:pos});setClickCount(1)}
      else if(clickCount===1){setTempCurve(t=>({...t,p1:pos,p3:pos}));setClickCount(2)}
      else if(clickCount===2){setTempCurve(t=>({...t,p2:pos}));setClickCount(3)}
      else if(clickCount===3){
        const colors=['#ec4899','#60a5fa','#22c55e','#f59e0b','#a78bfa']
        setCurves(c=>[...c,{...tempCurve,p2:pos,color:colors[c.length%colors.length]} as BezierCurve])
        setTempCurve(null);setClickCount(0)
      }
    }
    if(tool==='rect'){
      setShapes(s=>[...s,{type:'rect',x:pos.x-55,y:pos.y-40,w:110,h:80,color:'#3b82f6',id:nextShapeId}])
      setNextShapeId(n=>n+1)
    }
    if(tool==='circle'){
      setShapes(s=>[...s,{type:'circle',x:pos.x-55,y:pos.y-40,w:110,h:80,color:'#22c55e',id:nextShapeId}])
      setNextShapeId(n=>n+1)
    }
  },[tool,clickCount,curves,shapes,tempCurve,nextShapeId])

  const onMouseMove=useCallback((e:React.MouseEvent<HTMLCanvasElement>)=>{
    const pos=getPos(e); setMousePos(pos)
    if(dragging){
      setCurves(c=>c.map((curve,ci)=>{
        if(ci!==dragging.curveIdx)return curve
        const pts=['p0','p1','p2','p3'] as const
        return{...curve,[pts[dragging.cpIdx]]:pos}
      }))
    }
    if(tempCurve&&clickCount===2) setTempCurve(t=>({...t,p3:pos}))
    if(tempCurve&&clickCount===3) setTempCurve(t=>({...t,p2:pos}))
  },[dragging,tempCurve,clickCount])

  const onMouseUp=()=>setDragging(null)

  const clearAll=()=>{setCurves([]);setTempCurve(null);setClickCount(0);setSelectedBool([])}

  const TOOL_BTNS:[Tool,string,string][]=[['select','↖','Vybrat/táhnout'],['bezier','〜','Bézier křivka (4 kliky)'],['rect','▭','Obdélník'],['circle','◯','Elipsa']]

  return (
    <div style={{display:'flex',flexDirection:'column',width:'100%',height:'100%'}}>
      {/* Toolbar */}
      <div style={{display:'flex',alignItems:'center',gap:8,padding:'6px 12px',borderBottom:`1px solid ${C.border}`,flexShrink:0,background:C.card,flexWrap:'wrap' as const}}>
        {TOOL_BTNS.map(([t,icon,label])=>(
          <button key={t} onClick={()=>{setTool(t);setClickCount(0);setTempCurve(null)}} title={label}
            style={{padding:'5px 10px',background:tool===t?'rgba(236,72,153,.25)':'rgba(255,255,255,.05)',color:tool===t?'#f472b6':'#94a3b8',border:`1px solid ${tool===t?'rgba(236,72,153,.4)':C.border}`,borderRadius:7,cursor:'pointer',fontFamily:'inherit',fontSize:12}}>
            {icon} {label.split(' ')[0]}
          </button>
        ))}
        <div style={{width:1,height:20,background:C.border}}/>
        {tool==='select'&&selectedBool.length===2&&(<>
          <span style={{fontSize:10,color:C.sec}}>Bool op:</span>
          {(['union','intersect','subtract','exclude'] as BoolOp[]).map(op=>(
            <button key={op} onClick={()=>setBoolOp(op)}
              style={{padding:'3px 8px',background:boolOp===op?'rgba(168,85,247,.25)':'rgba(255,255,255,.05)',color:boolOp===op?'#c084fc':'#64748b',border:`1px solid ${boolOp===op?'rgba(168,85,247,.4)':C.border}`,borderRadius:6,cursor:'pointer',fontSize:10,fontFamily:'inherit'}}>
              {op==='union'?'A∪B':op==='intersect'?'A∩B':op==='subtract'?'A-B':'A⊕B'}
            </button>
          ))}
        </>)}
        <div style={{marginLeft:'auto',display:'flex',gap:6}}>
          <label style={{fontSize:10,color:C.sec,display:'flex',alignItems:'center',gap:4,cursor:'pointer'}}>
            <input type="checkbox" checked={showGrid} onChange={e=>setShowGrid(e.target.checked)} style={{accentColor:'#ec4899'}}/> Mřížka
          </label>
          <label style={{fontSize:10,color:C.sec,display:'flex',alignItems:'center',gap:4,cursor:'pointer'}}>
            <input type="checkbox" checked={showCoords} onChange={e=>setShowCoords(e.target.checked)} style={{accentColor:'#ec4899'}}/> Souřadnice
          </label>
          <button onClick={clearAll} style={{padding:'3px 10px',background:'rgba(239,68,68,.1)',color:'#f87171',border:'1px solid rgba(239,68,68,.3)',borderRadius:6,cursor:'pointer',fontSize:10,fontFamily:'inherit'}}>
            🗑 Smazat vše
          </button>
        </div>
      </div>

      <canvas ref={cvRef} width={W} height={H-42}
        style={{flex:1,width:'100%',height:'100%',cursor:tool==='select'?'default':'crosshair'}}
        onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseLeave={onMouseUp}/>

      {/* Instructions */}
      <div style={{padding:'5px 12px',borderTop:`1px solid ${C.border}`,flexShrink:0,background:C.card}}>
        <div style={{fontSize:10,color:C.sec}}>
          {tool==='bezier'&&`Klik ${clickCount+1}/4: ${['Bod P0 (start)','Bod P1 (kontrolní)','Bod P2 (kontrolní)','Bod P3 (konec)'][clickCount]}`}
          {tool==='select'&&'Táhni kontrolní body křivky. Klikni na 2 tvary pro Booleovské operace.'}
          {tool==='rect'&&'Klikni pro vložení obdélníku'}
          {tool==='circle'&&'Klikni pro vložení elipsy'}
          {tool==='bool'&&'Vyber 2 tvary (↖) a zvol operaci'}
          {curves.length>0&&<span style={{marginLeft:12,color:'#ec4899'}}>t={animT.toFixed(2)} · {curves.length} křivek</span>}
        </div>
      </div>
    </div>
  )
}
