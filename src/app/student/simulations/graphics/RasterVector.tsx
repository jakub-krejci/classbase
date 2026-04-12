'use client'
import { useState, useEffect, useRef } from 'react'
const C = { bg:'#090B10', card:'#11141D', border:'rgba(255,255,255,0.07)', txt:'#fff', sec:'#8892a4' }

export function RasterVectorTab() {
  const [zoom, setZoom] = useState(1)
  const rasterRef = useRef<HTMLCanvasElement>(null)
  const vectorRef = useRef<HTMLCanvasElement>(null)

  // Draw raster star at given zoom
  useEffect(() => {
    const cv = rasterRef.current; if (!cv) return
    const ctx = cv.getContext('2d')!
    const W = cv.width, H = cv.height
    ctx.clearRect(0,0,W,H)
    ctx.fillStyle = '#0f172a'; ctx.fillRect(0,0,W,H)

    // Draw a star into an offscreen 48×48 canvas, then scale up pixelated
    const off = document.createElement('canvas')
    off.width = 48; off.height = 48
    const oc = off.getContext('2d')!
    oc.fillStyle = '#0f172a'; oc.fillRect(0,0,48,48)
    oc.save()
    oc.translate(24,24)
    oc.fillStyle = '#f59e0b'
    oc.beginPath()
    for (let i=0;i<5;i++) {
      oc.lineTo(Math.cos((18+i*72)*Math.PI/180)*18, Math.sin((18+i*72)*Math.PI/180)*18)
      oc.lineTo(Math.cos((54+i*72)*Math.PI/180)*8,  Math.sin((54+i*72)*Math.PI/180)*8)
    }
    oc.closePath(); oc.fill()
    oc.restore()

    // Scale up
    ctx.imageSmoothingEnabled = false
    const scale = zoom * 2
    const sw = 48 * scale, sh = 48 * scale
    const ox = (W - sw) / 2, oy = (H - sh) / 2
    ctx.drawImage(off, ox, oy, sw, sh)

    // Draw pixel grid when zoomed
    if (zoom >= 2) {
      ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.lineWidth = 0.5
      for (let r=0;r<Math.ceil(H/scale);r++) {
        ctx.beginPath(); ctx.moveTo(ox,oy+r*scale); ctx.lineTo(ox+sw,oy+r*scale); ctx.stroke()
      }
      for (let c=0;c<Math.ceil(W/scale);c++) {
        ctx.beginPath(); ctx.moveTo(ox+c*scale,oy); ctx.lineTo(ox+c*scale,oy+sh); ctx.stroke()
      }
    }

    // Label
    ctx.fillStyle = zoom>=3?'#ef4444':'#22c55e'
    ctx.font = 'bold 11px sans-serif'; ctx.textAlign='center'
    ctx.fillText(zoom>=3?`Pixely viditelné (${zoom}× zoom)`:`${zoom}× zoom`, W/2, H-8)
  }, [zoom])

  // Draw vector star (perfectly sharp at any zoom)
  useEffect(() => {
    const cv = vectorRef.current; if (!cv) return
    const ctx = cv.getContext('2d')!
    const W = cv.width, H = cv.height
    ctx.clearRect(0,0,W,H)
    ctx.fillStyle = '#0f172a'; ctx.fillRect(0,0,W,H)
    const cx = W/2, cy = H/2
    const outerR = 52 * zoom, innerR = 22 * zoom
    ctx.save(); ctx.translate(cx, cy); ctx.fillStyle = '#f59e0b'
    ctx.beginPath()
    for (let i=0;i<5;i++) {
      ctx.lineTo(Math.cos((18+i*72)*Math.PI/180)*outerR, Math.sin((18+i*72)*Math.PI/180)*outerR)
      ctx.lineTo(Math.cos((54+i*72)*Math.PI/180)*innerR, Math.sin((54+i*72)*Math.PI/180)*innerR)
    }
    ctx.closePath(); ctx.fill(); ctx.restore()
    // Draw math definition
    ctx.fillStyle = '#22c55e'; ctx.font='bold 11px sans-serif'; ctx.textAlign='center'
    ctx.fillText(`${zoom}× zoom — matematicky ostrý`, W/2, H-8)
    // Draw control points
    if (zoom >= 2) {
      ctx.strokeStyle='rgba(255,255,255,.2)'; ctx.lineWidth=1
      for (let i=0;i<5;i++) {
        const ax=cx+Math.cos((18+i*72)*Math.PI/180)*outerR, ay=cy+Math.sin((18+i*72)*Math.PI/180)*outerR
        ctx.beginPath(); ctx.arc(ax,ay,3,0,Math.PI*2); ctx.strokeStyle='#60a5fa'; ctx.stroke()
      }
    }
  }, [zoom])

  return (
    <div style={{display:'flex',flexDirection:'column',gap:16,padding:20,flex:1,overflowY:'auto'}}>
      {/* Header comparison */}
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
        <div style={{padding:'14px 16px',background:'rgba(59,130,246,.07)',border:'1px solid rgba(59,130,246,.2)',borderRadius:12}}>
          <div style={{fontSize:16,marginBottom:6}}>🖼️</div>
          <div style={{fontSize:13,fontWeight:800,color:'#60a5fa',marginBottom:6}}>Rastrová grafika</div>
          <div style={{fontSize:11,color:'#94a3b8',lineHeight:1.7}}>Mřížka barevných pixelů. Každý pixel má přesnou barvu. Čím více pixelů, tím lepší kvalita — ale větší soubor.</div>
        </div>
        <div style={{padding:'14px 16px',background:'rgba(34,197,94,.07)',border:'1px solid rgba(34,197,94,.2)',borderRadius:12}}>
          <div style={{fontSize:16,marginBottom:6}}>📐</div>
          <div style={{fontSize:13,fontWeight:800,color:'#4ade80',marginBottom:6}}>Vektorová grafika</div>
          <div style={{fontSize:11,color:'#94a3b8',lineHeight:1.7}}>Matematické objekty (čáry, křivky, tvary). Nekonečně škálovatelné bez ztráty kvality. Malé soubory pro jednoduché tvary.</div>
        </div>
      </div>

      {/* Zoom demo */}
      <div style={{background:'#0d1117',borderRadius:12,padding:16,border:`1px solid ${C.border}`}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
          <div style={{fontSize:12,fontWeight:700,color:'#fff'}}>🔍 Zoom — hvězda</div>
          <div style={{display:'flex',alignItems:'center',gap:8}}>
            <span style={{fontSize:10,color:C.sec}}>Zoom:</span>
            <input type="range" min={1} max={6} step={0.5} value={zoom} onChange={e=>setZoom(+e.target.value)}
              style={{width:100,accentColor:'#ec4899'}}/>
            <span style={{fontSize:12,fontWeight:700,color:'#ec4899'}}>{zoom}×</span>
          </div>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
          <div>
            <div style={{fontSize:10,fontWeight:700,color:'#60a5fa',marginBottom:6,textAlign:'center' as const}}>🖼️ Rastrová (PNG/JPG)</div>
            <canvas ref={rasterRef} width={260} height={200} style={{width:'100%',borderRadius:8,border:'1px solid rgba(59,130,246,.3)'}}/>
          </div>
          <div>
            <div style={{fontSize:10,fontWeight:700,color:'#4ade80',marginBottom:6,textAlign:'center' as const}}>📐 Vektorová (SVG)</div>
            <canvas ref={vectorRef} width={260} height={200} style={{width:'100%',borderRadius:8,border:'1px solid rgba(34,197,94,.3)'}}/>
          </div>
        </div>
      </div>

      {/* Properties table */}
      <div style={{overflowX:'auto'}}>
        <table style={{width:'100%',borderCollapse:'collapse' as const,fontSize:11}}>
          <thead>
            <tr style={{borderBottom:`1px solid ${C.border}`}}>
              <th style={{padding:'8px 12px',color:C.sec,textAlign:'left' as const,fontWeight:600}}>Vlastnost</th>
              <th style={{padding:'8px 12px',color:'#60a5fa',textAlign:'center' as const,fontWeight:700}}>🖼️ Rastrová</th>
              <th style={{padding:'8px 12px',color:'#4ade80',textAlign:'center' as const,fontWeight:700}}>📐 Vektorová</th>
            </tr>
          </thead>
          <tbody>
            {[
              ['Škálování','✗ Ztráta kvality','✓ Bez ztráty'],
              ['Fotorealismus','✓ Výborný','✗ Omezený'],
              ['Velikost souboru','Závisí na rozlišení','Závisí na složitosti'],
              ['Editace pixelů','✓ Přímá','✗ Nutná rasterizace'],
              ['Průhlednost','Alfa kanál','Podporována'],
              ['Formáty','PNG, JPG, GIF, WebP, BMP','SVG, AI, EPS, PDF'],
              ['Použití','Fotografie, screenshoty','Loga, ikony, ilustrace, tisk'],
              ['Software','Photoshop, GIMP','Illustrator, Inkscape, Figma'],
            ].map(([prop,rast,vect],i)=>(
              <tr key={i} style={{borderBottom:`1px solid ${C.border}`,background:i%2===0?'rgba(255,255,255,.02)':'transparent'}}>
                <td style={{padding:'7px 12px',color:'#e2e8f0',fontWeight:600}}>{prop}</td>
                <td style={{padding:'7px 12px',textAlign:'center' as const,color:rast.startsWith('✓')?'#4ade80':rast.startsWith('✗')?'#f87171':'#94a3b8'}}>{rast}</td>
                <td style={{padding:'7px 12px',textAlign:'center' as const,color:vect.startsWith('✓')?'#4ade80':vect.startsWith('✗')?'#f87171':'#94a3b8'}}>{vect}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Format cards */}
      <div>
        <div style={{fontSize:10,fontWeight:700,color:C.sec,textTransform:'uppercase',letterSpacing:'.06em',marginBottom:10}}>Běžné formáty</div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(140px,1fr))',gap:8}}>
          {[
            {fmt:'JPEG/JPG',type:'Rastr',col:'#ef4444',desc:'Ztrátová komprese. Fotografie. Malý soubor.'},
            {fmt:'PNG',type:'Rastr',col:'#3b82f6',desc:'Bezztrátový, průhlednost. Loga, UI.'},
            {fmt:'WebP',type:'Rastr',col:'#06b6d4',desc:'Moderní. Lepší než PNG+JPEG dohromady.'},
            {fmt:'GIF',type:'Rastr',col:'#a855f7',desc:'Animace. Jen 256 barev. Zastaralý.'},
            {fmt:'SVG',type:'Vektor',col:'#22c55e',desc:'XML text. Web, loga. Nekonečně škálovatelný.'},
            {fmt:'PDF',type:'Vektor',col:'#f59e0b',desc:'Dokumenty s vektory i rastrem.'},
          ].map(f=>(
            <div key={f.fmt} style={{padding:'9px 10px',background:f.col+'0d',border:`1px solid ${f.col}30`,borderRadius:9}}>
              <div style={{display:'flex',justifyContent:'space-between',marginBottom:4}}>
                <span style={{fontSize:12,fontWeight:800,color:f.col}}>{f.fmt}</span>
                <span style={{fontSize:8,color:f.col,background:f.col+'22',padding:'1px 5px',borderRadius:10}}>{f.type}</span>
              </div>
              <div style={{fontSize:10,color:C.sec,lineHeight:1.5}}>{f.desc}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
