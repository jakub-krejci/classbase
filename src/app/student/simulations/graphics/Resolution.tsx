'use client'
import { useState, useEffect, useRef } from 'react'
const C = { bg:'#090B10', card:'#11141D', border:'rgba(255,255,255,0.07)', txt:'#fff', sec:'#8892a4' }

export function ResolutionTab() {
  const [width, setWidth] = useState(1920)
  const [height, setHeight] = useState(1080)
  const [dpi, setDpi] = useState(96)
  const [printW, setPrintW] = useState(20)  // cm
  const [imageKB, setImageKB] = useState(300)
  const [quality, setQuality] = useState(80)
  const cvRef = useRef<HTMLCanvasElement>(null)

  const totalPixels = width * height
  const megapixels = (totalPixels / 1_000_000).toFixed(1)
  const fileSize = Math.round(totalPixels * 3 / 1024)  // raw RGB KB
  const printDPI = Math.round((width / (printW / 2.54)))
  const printQuality = printDPI >= 300 ? 'Tiskařská kvalita ✓' : printDPI >= 150 ? 'Dobrá kvalita' : printDPI >= 72 ? 'Přijatelné pro web' : 'Nízká kvalita ✗'
  const printColor = printDPI >= 300 ? '#22c55e' : printDPI >= 150 ? '#f59e0b' : '#ef4444'

  // Draw pixel grid visualisation
  useEffect(() => {
    const cv = cvRef.current; if (!cv) return
    const ctx = cv.getContext('2d')!
    const W = cv.width, H = cv.height
    ctx.clearRect(0,0,W,H)
    ctx.fillStyle = '#0f172a'; ctx.fillRect(0,0,W,H)

    // Show relative pixel sizes for different DPIs
    const dpis = [72, 96, 150, 300]
    const boxW = W / dpis.length - 10
    dpis.forEach((d, i) => {
      const x = i * (boxW + 10) + 4
      const pixSize = Math.max(1, Math.round(8 * (72 / d) * 3))
      const cols = Math.floor(boxW / pixSize), rows = Math.floor((H - 36) / pixSize)
      // Draw pixel grid
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const hue = (r * cols + c) * 7 % 360
          ctx.fillStyle = `hsl(${hue},60%,${40 + Math.sin(r*0.5+c*0.3)*15}%)`
          ctx.fillRect(x + c*pixSize, 20 + r*pixSize, pixSize-1, pixSize-1)
        }
      }
      // Label
      ctx.fillStyle = d >= 300 ? '#22c55e' : d >= 150 ? '#f59e0b' : '#94a3b8'
      ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center'
      ctx.fillText(`${d} DPI`, x + boxW/2, 14)
    })
  }, [dpi])

  const AspectRatio = () => {
    const gcd = (a:number,b:number):number=>b?gcd(b,a%b):a
    const g = gcd(width,height)
    return `${width/g}:${height/g}`
  }

  return (
    <div style={{display:'flex',flexDirection:'column',gap:14,padding:20,flex:1,overflowY:'auto'}}>
      {/* Interactive resolution picker */}
      <div style={{background:'#0d1117',borderRadius:12,padding:16,border:`1px solid ${C.border}`}}>
        <div style={{fontSize:12,fontWeight:700,color:'#fff',marginBottom:12}}>📐 Rozlišení obrázku</div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:12,marginBottom:12}}>
          <div>
            <label style={{fontSize:9,color:C.sec,display:'block',marginBottom:4}}>Šířka (px)</label>
            <input type="number" value={width} onChange={e=>setWidth(Math.max(1,+e.target.value))}
              style={{width:'100%',padding:'7px 10px',background:'#1a2035',color:'#fff',border:`1px solid ${C.border}`,borderRadius:7,fontSize:13,fontFamily:'monospace',outline:'none',boxSizing:'border-box' as const}}/>
          </div>
          <div>
            <label style={{fontSize:9,color:C.sec,display:'block',marginBottom:4}}>Výška (px)</label>
            <input type="number" value={height} onChange={e=>setHeight(Math.max(1,+e.target.value))}
              style={{width:'100%',padding:'7px 10px',background:'#1a2035',color:'#fff',border:`1px solid ${C.border}`,borderRadius:7,fontSize:13,fontFamily:'monospace',outline:'none',boxSizing:'border-box' as const}}/>
          </div>
          <div>
            <label style={{fontSize:9,color:C.sec,display:'block',marginBottom:4}}>DPI (pro tisk)</label>
            <input type="range" min={72} max={600} step={1} value={dpi} onChange={e=>setDpi(+e.target.value)} style={{width:'100%',accentColor:'#ec4899',marginTop:4}}/>
            <div style={{fontSize:11,fontWeight:700,color:'#ec4899',textAlign:'center' as const}}>{dpi} DPI</div>
          </div>
        </div>

        {/* Quick presets */}
        <div style={{display:'flex',gap:6,flexWrap:'wrap' as const,marginBottom:12}}>
          {[['720p','1280','720'],['1080p FHD','1920','1080'],['4K UHD','3840','2160'],['Instagram','1080','1080'],['A4 @300dpi','2480','3508'],['iPhone 15','2556','1179']].map(([l,w,h])=>(
            <button key={l} onClick={()=>{setWidth(+w);setHeight(+h)}}
              style={{padding:'3px 9px',background:'rgba(255,255,255,.06)',color:'#94a3b8',border:`1px solid ${C.border}`,borderRadius:6,cursor:'pointer',fontSize:10,fontFamily:'inherit'}}>
              {l}
            </button>
          ))}
        </div>

        {/* Stats */}
        <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:8}}>
          {[
            {label:'Megapixely',val:megapixels+'M',col:'#60a5fa'},
            {label:'Celkem pixelů',val:totalPixels.toLocaleString(),col:'#a78bfa'},
            {label:'Poměr stran',val:AspectRatio(),col:'#f59e0b'},
            {label:'RAW velikost',val:`${(fileSize/1024).toFixed(1)} MB`,col:'#22c55e'},
          ].map(s=>(
            <div key={s.label} style={{padding:'8px 10px',background:s.col+'0d',border:`1px solid ${s.col}22`,borderRadius:8,textAlign:'center' as const}}>
              <div style={{fontSize:8,color:C.sec,marginBottom:3}}>{s.label}</div>
              <div style={{fontSize:13,fontWeight:800,color:s.col,fontFamily:'monospace'}}>{s.val}</div>
            </div>
          ))}
        </div>
      </div>

      {/* DPI visualisation */}
      <div style={{background:'#0d1117',borderRadius:12,border:`1px solid ${C.border}`,overflow:'hidden'}}>
        <div style={{padding:'10px 14px',borderBottom:`1px solid ${C.border}`,fontSize:11,fontWeight:700,color:'#fff'}}>
          Vizualizace hustoty pixelů (DPI)
        </div>
        <canvas ref={cvRef} width={600} height={120} style={{width:'100%',display:'block'}}/>
        <div style={{padding:'8px 14px',display:'flex',justifyContent:'space-around'}}>
          {[{d:72,l:'Web'},{d:96,l:'Screen'},{d:150,l:'Draft'},{d:300,l:'Print'}].map(({d,l})=>(
            <div key={d} style={{textAlign:'center' as const,fontSize:9,color:d>=300?'#22c55e':d>=150?'#f59e0b':'#64748b'}}>
              {d} DPI<br/>{l}
            </div>
          ))}
        </div>
      </div>

      {/* Print calculator */}
      <div style={{background:'#0d1117',borderRadius:12,padding:16,border:`1px solid ${C.border}`}}>
        <div style={{fontSize:12,fontWeight:700,color:'#fff',marginBottom:12}}>🖨️ Tisková kalkulačka</div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:10}}>
          <div>
            <label style={{fontSize:9,color:C.sec,display:'block',marginBottom:4}}>Šířka tisku (cm)</label>
            <input type="range" min={5} max={100} value={printW} onChange={e=>setPrintW(+e.target.value)}
              style={{width:'100%',accentColor:'#06b6d4'}}/>
            <div style={{fontSize:11,color:'#06b6d4',textAlign:'center' as const}}>{printW} cm</div>
          </div>
          <div style={{display:'flex',flexDirection:'column' as const,justifyContent:'center',gap:4}}>
            <div style={{padding:'8px 12px',background:printColor+'15',border:`1px solid ${printColor}44`,borderRadius:8}}>
              <div style={{fontSize:11,fontWeight:700,color:printColor}}>{printDPI} DPI při tisku</div>
              <div style={{fontSize:10,color:printColor+'cc'}}>{printQuality}</div>
            </div>
          </div>
        </div>
        <div style={{padding:'8px 10px',background:'rgba(251,191,36,.05)',border:'1px solid rgba(251,191,36,.15)',borderRadius:8}}>
          <div style={{fontSize:11,color:'#fcd34d'}}>
            💡 Pro kvalitní tisk potřebuješ ≥300 DPI. Obrázek {width}×{height}px natiskneš kvalitně na max {Math.round(width/300*2.54)} cm šíře.
          </div>
        </div>
      </div>

      {/* PPI vs DPI */}
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
        <div style={{padding:'12px',background:'rgba(59,130,246,.06)',border:'1px solid rgba(59,130,246,.2)',borderRadius:10}}>
          <div style={{fontSize:12,fontWeight:700,color:'#60a5fa',marginBottom:6}}>PPI — Pixels Per Inch</div>
          <div style={{fontSize:11,color:'#94a3b8',lineHeight:1.7}}>Hustota pixelů na <strong style={{color:'#fff'}}>obrazovce</strong>. iPhone Retina má ~460 PPI. Vyšší = ostřejší obraz při stejné fyzické velikosti.</div>
          <div style={{marginTop:8,fontSize:10,fontFamily:'monospace',color:'#60a5fa'}}>
            PPI = √(w²+h²) / úhlopříčka
          </div>
        </div>
        <div style={{padding:'12px',background:'rgba(34,197,94,.06)',border:'1px solid rgba(34,197,94,.2)',borderRadius:10}}>
          <div style={{fontSize:12,fontWeight:700,color:'#4ade80',marginBottom:6}}>DPI — Dots Per Inch</div>
          <div style={{fontSize:11,color:'#94a3b8',lineHeight:1.7}}>Hustota inkoustových teček na <strong style={{color:'#fff'}}>tiskárně</strong>. Laserová tiskárna: 600–1200 DPI. Čím vyšší, tím ostřejší tisk.</div>
          <div style={{marginTop:8,fontSize:10,fontFamily:'monospace',color:'#4ade80'}}>
            Tiskárna: 300–1200 DPI
          </div>
        </div>
      </div>

      {/* Common resolutions */}
      <div>
        <div style={{fontSize:10,fontWeight:700,color:C.sec,textTransform:'uppercase' as const,letterSpacing:'.06em',marginBottom:8}}>Běžná rozlišení</div>
        <div style={{overflowX:'auto'}}>
          <table style={{width:'100%',borderCollapse:'collapse' as const,fontSize:10}}>
            <thead><tr style={{borderBottom:`1px solid ${C.border}`}}>
              {['Název','Rozlišení','Pixelů','Poměr','Použití'].map(h=><th key={h} style={{padding:'5px 8px',color:C.sec,textAlign:'left' as const,fontWeight:600}}>{h}</th>)}
            </tr></thead>
            <tbody>
              {[
                ['SD','720×480','345K','3:2','DVD'],
                ['HD 720p','1280×720','0.9M','16:9','YouTube, TV'],
                ['Full HD 1080p','1920×1080','2.1M','16:9','Standard video, monitor'],
                ['2K QHD','2560×1440','3.7M','16:9','Gaming, design monitor'],
                ['4K UHD','3840×2160','8.3M','16:9','TV, profesionální video'],
                ['8K','7680×4320','33.2M','16:9','Profesionální kino'],
                ['A4 @300dpi','2480×3508','8.7M','√2:1','Tisk, plakáty'],
              ].map((row,i)=>(
                <tr key={i} style={{borderBottom:`1px solid ${C.border}`,background:i%2?'rgba(255,255,255,.02)':'transparent'}}>
                  {row.map((cell,j)=><td key={j} style={{padding:'6px 8px',color:j===0?'#e2e8f0':C.sec,fontWeight:j===0?600:400}}>{cell}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
