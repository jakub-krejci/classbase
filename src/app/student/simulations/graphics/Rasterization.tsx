'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
const C = { bg:'#090B10', card:'#11141D', border:'rgba(255,255,255,0.07)', txt:'#fff', sec:'#8892a4' }

export function RasterizationTab({ size }:{ size:{w:number;h:number} }) {
  const [mode, setMode] = useState<'rasterize'|'vectorize'>('rasterize')
  const [resolution, setResolution] = useState(16)
  const [antiAlias, setAntiAlias] = useState(false)
  const [shape, setShape] = useState<'circle'|'line'|'bezier'|'text'>('circle')
  const [animating, setAnimating] = useState(false)
  const [animStep, setAnimStep] = useState(0)
  const cvRef = useRef<HTMLCanvasElement>(null)
  const animRef = useRef(0)

  const W = size.w, H = size.h - 42

  const drawRasterization = useCallback((ctx: CanvasRenderingContext2D, step: number) => {
    const cw = W, ch = H
    ctx.clearRect(0,0,cw,ch)
    ctx.fillStyle='#0a0d14'; ctx.fillRect(0,0,cw,ch)
    const cellSize = Math.floor(Math.min(cw,ch) / resolution)
    const cols = Math.floor(cw/cellSize), rows = Math.floor(ch/cellSize)
    const cx2 = cols/2, cy2 = rows/2
    const maxStep = cols+rows

    for(let r=0;r<rows;r++){
      for(let c=0;c<cols;c++){
        // Only draw up to current step (wave animation)
        if(animating && c+r > step) continue

        let inside = false
        let coverage = 0 // for anti-aliasing

        if(shape==='circle'){
          if(antiAlias){
            const samples=4
            for(let sy=0;sy<samples;sy++) for(let sx=0;sx<samples;sx++){
              const px=(c+(sx+0.5)/samples)-cx2, py=(r+(sy+0.5)/samples)-cy2
              if(px*px+py*py<(Math.min(cols,rows)*0.4)**2) coverage++
            }
            coverage/=samples*samples
          } else {
            const px=c+0.5-cx2, py=r+0.5-cy2
            inside=px*px+py*py<(Math.min(cols,rows)*0.4)**2
          }
        } else if(shape==='line'){
          const slope=0.4, intercept=rows*0.15
          if(antiAlias){
            const samples=4
            for(let sy=0;sy<samples;sy++) for(let sx=0;sx<samples;sx++){
              const px=c+(sx+0.5)/samples, py=r+(sy+0.5)/samples
              if(Math.abs(py-(slope*px+intercept))<0.5) coverage++
            }
            coverage/=samples*samples
          } else {
            const py=r+0.5, px=c+0.5
            inside=Math.abs(py-(slope*px+intercept))<0.6
          }
        } else if(shape==='bezier'){
          // Sample bezier p0=(0,cy2*0.7) p1=(cols*0.3,0) p2=(cols*0.7,rows) p3=(cols,cy2*0.3)
          let minD=Infinity
          for(let t=0;t<=1;t+=0.01){
            const mt=1-t
            const bx=mt**3*0+3*mt**2*t*cols*0.3+3*mt*t**2*cols*0.7+t**3*cols
            const by=mt**3*cy2*0.7+3*mt**2*t*0+3*mt*t**2*rows+t**3*cy2*0.3
            minD=Math.min(minD,Math.hypot(c+0.5-bx,r+0.5-by))
          }
          coverage=antiAlias?Math.max(0,1-minD/0.8):0
          inside=!antiAlias&&minD<0.7
        } else {
          // "A" text rasterized
          const nx=(c+0.5)/cols, ny=(r+0.5)/rows
          const inA=(nx>0.25&&nx<0.75&&ny>0.1&&ny<0.9&&
            (Math.abs(nx-0.5)<0.04+ny*0.26||(ny>0.45&&ny<0.6)))
          inside=inA
        }

        const alpha = antiAlias ? coverage : (inside?1:0)
        if(alpha>0.01){
          ctx.fillStyle=`rgba(236,72,153,${alpha})`
          ctx.fillRect(c*cellSize, r*cellSize, cellSize-1, cellSize-1)
        }

        // Grid
        ctx.strokeStyle='rgba(255,255,255,0.04)'; ctx.lineWidth=0.5
        ctx.strokeRect(c*cellSize,r*cellSize,cellSize,cellSize)
      }
    }

    // Original vector shape (reference, faded)
    ctx.save(); ctx.strokeStyle='rgba(255,255,255,0.2)'; ctx.lineWidth=1.5; ctx.setLineDash([4,3])
    if(shape==='circle'){
      ctx.beginPath(); ctx.arc(cx2*cellSize,cy2*cellSize,Math.min(cols,rows)*0.4*cellSize,0,Math.PI*2); ctx.stroke()
    } else if(shape==='line'){
      ctx.beginPath(); ctx.moveTo(0,(0.4*0+rows*0.15)*cellSize); ctx.lineTo(cols*cellSize,(0.4*cols+rows*0.15)*cellSize); ctx.stroke()
    }
    ctx.setLineDash([]); ctx.restore()

    // Labels
    ctx.fillStyle='#ec4899'; ctx.font='bold 11px sans-serif'; ctx.textAlign='left'
    ctx.fillText(`${resolution}×${resolution} pixelů${antiAlias?' (anti-aliasing)':''}`,8,16)

    // Pixel detail legend
    if(cellSize>=8){
      ctx.fillStyle='rgba(255,255,255,.3)'; ctx.font='7px monospace'; ctx.textAlign='center'
      const showcols=Math.min(8,cols), showrows=Math.min(4,rows)
      for(let r2=0;r2<showrows;r2++) for(let c2=0;c2<showcols;c2++){
        const v=Math.round((shape==='circle'?Math.hypot(c2+0.5-cx2,r2+0.5-cy2)<Math.min(cols,rows)*0.4?1:0:0)*255)
        // ctx.fillText(v>0?'1':'0',c2*cellSize+cellSize/2,r2*cellSize+cellSize/2+3)
      }
    }
  }, [shape, resolution, antiAlias, animating, W, H])

  const drawVectorization = useCallback((ctx: CanvasRenderingContext2D, step: number) => {
    const cw=W, ch=H
    ctx.clearRect(0,0,cw,ch); ctx.fillStyle='#0a0d14'; ctx.fillRect(0,0,cw,ch)
    const cx2=cw/2, cy2=ch/2, R=Math.min(cw,ch)*0.3

    // Step 1: show raster pixels
    const cellSize=Math.floor(Math.min(cw,ch)/12)
    if(step<1){
      for(let r=0;r<Math.floor(ch/cellSize);r++){
        for(let c=0;c<Math.floor(cw/cellSize);c++){
          const px=c+0.5-cw/2/cellSize, py=r+0.5-ch/2/cellSize
          if(px*px+py*py<(R/cellSize)**2){
            ctx.fillStyle=`rgba(236,72,153,0.6)`; ctx.fillRect(c*cellSize,r*cellSize,cellSize-1,cellSize-1)
          }
          ctx.strokeStyle='rgba(255,255,255,.04)'; ctx.lineWidth=0.5; ctx.strokeRect(c*cellSize,r*cellSize,cellSize,cellSize)
        }
      }
      ctx.fillStyle='#94a3b8'; ctx.font='bold 11px sans-serif'; ctx.textAlign='center'
      ctx.fillText('Rastový vstup — pixely',cw/2,16)
      return
    }

    // Step 2: trace contour
    ctx.strokeStyle='rgba(255,255,255,0.15)'; ctx.lineWidth=1
    const pts:number=Math.min(step<2?Math.floor((step-1)*24):24, 24)
    if(pts>1){
      ctx.beginPath()
      for(let i=0;i<pts;i++){
        const a=i/24*Math.PI*2
        const nx=cx2+Math.cos(a)*(R+Math.sin(i*3)*5), ny=cy2+Math.sin(a)*(R+Math.sin(i*5)*5)
        i===0?ctx.moveTo(nx,ny):ctx.lineTo(nx,ny)
      }
      if(pts===24)ctx.closePath()
      ctx.strokeStyle='rgba(255,100,200,.7)'; ctx.lineWidth=2; ctx.stroke()
    }
    if(step>=2){
      ctx.fillStyle='#94a3b8'; ctx.font='bold 11px sans-serif'; ctx.textAlign='center'
      ctx.fillText('Detekce kontur',cw/2,16)
    }

    // Step 3: fit bezier curves
    if(step>=3){
      ctx.strokeStyle='#ec4899'; ctx.lineWidth=2.5
      ctx.beginPath(); ctx.arc(cx2,cy2,R,0,Math.PI*2); ctx.stroke()
      // Control points
      const anchors=8
      for(let i=0;i<anchors;i++){
        const a=i/anchors*Math.PI*2
        const ax=cx2+Math.cos(a)*R, ay=cy2+Math.sin(a)*R
        ctx.beginPath(); ctx.arc(ax,ay,5,0,Math.PI*2); ctx.fillStyle='#60a5fa'; ctx.fill()
        // Tangent handles
        const ta=a+Math.PI/2
        ctx.beginPath(); ctx.moveTo(ax-Math.cos(ta)*20,ay-Math.sin(ta)*20); ctx.lineTo(ax+Math.cos(ta)*20,ay+Math.sin(ta)*20)
        ctx.strokeStyle='rgba(96,165,250,.4)'; ctx.lineWidth=1; ctx.stroke()
        ctx.beginPath(); ctx.arc(ax+Math.cos(ta)*20,ay+Math.sin(ta)*20,3,0,Math.PI*2); ctx.fillStyle='#a78bfa'; ctx.fill()
        ctx.beginPath(); ctx.arc(ax-Math.cos(ta)*20,ay-Math.sin(ta)*20,3,0,Math.PI*2); ctx.fillStyle='#a78bfa'; ctx.fill()
      }
      ctx.fillStyle='#22c55e'; ctx.font='bold 11px sans-serif'; ctx.textAlign='center'
      ctx.fillText('✓ Vektorové křivky (SVG)',cw/2,16)
      // SVG code preview
      ctx.fillStyle='rgba(255,255,255,.5)'; ctx.font='10px monospace'; ctx.textAlign='left'
      ctx.fillText(`<circle cx="${Math.round(cx2)}" cy="${Math.round(cy2)}" r="${Math.round(R)}" fill="#ec4899"/>`,12,ch-10)
    }
  }, [W, H])

  useEffect(()=>{
    const cv=cvRef.current; if(!cv)return
    const ctx=cv.getContext('2d')!
    if(mode==='rasterize') drawRasterization(ctx, animStep)
    else drawVectorization(ctx, animStep)
  },[mode,drawRasterization,drawVectorization,animStep])

  const runAnimation=()=>{
    setAnimating(true); setAnimStep(0)
    let s=0
    const max=mode==='rasterize'?resolution*2:4
    const step=()=>{
      s+=0.5; setAnimStep(s)
      if(s<max) animRef.current=requestAnimationFrame(step)
      else setAnimating(false)
    }
    animRef.current=requestAnimationFrame(step)
  }

  return (
    <div style={{display:'flex',flexDirection:'column',width:'100%',height:'100%'}}>
      <div style={{display:'flex',alignItems:'center',gap:10,padding:'6px 12px',borderBottom:`1px solid ${C.border}`,flexShrink:0,background:C.card,flexWrap:'wrap' as const}}>
        <div style={{display:'flex',border:`1px solid ${C.border}`,borderRadius:7,overflow:'hidden'}}>
          {(['rasterize','vectorize'] as const).map(m=>(
            <button key={m} onClick={()=>{setMode(m);setAnimStep(0);setAnimating(false)}}
              style={{padding:'5px 14px',background:mode===m?'rgba(236,72,153,.25)':'transparent',color:mode===m?'#f472b6':'#94a3b8',border:'none',cursor:'pointer',fontFamily:'inherit',fontSize:11,fontWeight:mode===m?700:400}}>
              {m==='rasterize'?'📐→🖼️ Rasterizace':'🖼️→📐 Vektorizace'}
            </button>
          ))}
        </div>

        {mode==='rasterize'&&(<>
          <select value={shape} onChange={e=>setShape(e.target.value as any)}
            style={{padding:'4px 8px',background:'#1a2035',color:'#fff',border:`1px solid ${C.border}`,borderRadius:6,fontSize:11,fontFamily:'inherit',cursor:'pointer',outline:'none'}}>
            <option value="circle">Kruh</option>
            <option value="line">Přímka</option>
            <option value="bezier">Bézierova křivka</option>
            <option value="text">Text "A"</option>
          </select>
          <label style={{fontSize:10,color:C.sec,display:'flex',alignItems:'center',gap:5}}>
            Rozlišení:
            <input type="range" min={4} max={48} value={resolution} onChange={e=>{setResolution(+e.target.value);setAnimStep(0)}} style={{width:70,accentColor:'#ec4899'}}/>
            <span style={{color:'#ec4899',minWidth:20}}>{resolution}</span>
          </label>
          <label style={{fontSize:10,color:C.sec,display:'flex',alignItems:'center',gap:5,cursor:'pointer'}}>
            <input type="checkbox" checked={antiAlias} onChange={e=>setAntiAlias(e.target.checked)} style={{accentColor:'#ec4899'}}/>
            Anti-aliasing
          </label>
        </>)}

        <button onClick={runAnimation} disabled={animating}
          style={{padding:'5px 14px',background:'rgba(236,72,153,.2)',color:'#f472b6',border:'1px solid rgba(236,72,153,.35)',borderRadius:7,cursor:animating?'not-allowed':'pointer',fontSize:11,fontFamily:'inherit'}}>
          {animating?'▶ Animuji…':'▶ Animovat'}
        </button>
      </div>

      <canvas ref={cvRef} width={W} height={H}
        style={{flex:1,width:'100%',height:'100%',display:'block'}}/>
    </div>
  )
}
