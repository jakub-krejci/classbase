'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
const C = { bg:'#090B10', card:'#11141D', border:'rgba(255,255,255,0.07)', txt:'#fff', sec:'#8892a4' }

// ── DCT helpers ───────────────────────────────────────────────────────────────
function dct2d(block: number[][]): number[][] {
  const N = 8
  const out: number[][] = Array.from({length:N},()=>Array(N).fill(0))
  for (let u=0;u<N;u++) for (let v=0;v<N;v++) {
    let sum=0
    for (let x=0;x<N;x++) for (let y=0;y<N;y++)
      sum += block[x][y]*Math.cos((2*x+1)*u*Math.PI/(2*N))*Math.cos((2*y+1)*v*Math.PI/(2*N))
    const cu=u===0?1/Math.sqrt(2):1, cv=v===0?1/Math.sqrt(2):1
    out[u][v]=0.25*cu*cv*sum
  }
  return out
}

function idct2d(dct: number[][]): number[][] {
  const N = 8
  const out: number[][] = Array.from({length:N},()=>Array(N).fill(0))
  for (let x=0;x<N;x++) for (let y=0;y<N;y++) {
    let sum=0
    for (let u=0;u<N;u++) for (let v=0;v<N;v++) {
      const cu=u===0?1/Math.sqrt(2):1, cv=v===0?1/Math.sqrt(2):1
      sum += cu*cv*dct[u][v]*Math.cos((2*x+1)*u*Math.PI/16)*Math.cos((2*y+1)*v*Math.PI/16)
    }
    out[x][y]=Math.round(0.25*sum+128)
  }
  return out
}

// Keep only top-left NxN coefficients (JPEG quantization simplified)
function quantize(dct: number[][], quality: number): number[][] {
  const N = 8
  const keepCoeffs = Math.max(1, Math.round(quality/100 * N*N))
  // Zig-zag order simplified: keep top-left square
  const sq = Math.ceil(Math.sqrt(keepCoeffs))
  return dct.map((row,u) => row.map((v2,v) => (u<sq&&v<sq)?v2:0))
}

// Default 8x8 pixel block (luminance values 0-255)
const DEFAULT_BLOCK = [
  [52, 55, 61, 66, 70, 61, 64, 73],
  [63, 59, 55, 90,109, 85, 69, 72],
  [62, 59, 68,113,144,104, 66, 73],
  [63, 58, 71,122,154,106, 70, 69],
  [67, 61, 68,104,126, 88, 68, 70],
  [79, 65, 60, 70, 77, 68, 58, 75],
  [85, 71, 64, 59, 55, 61, 65, 83],
  [87, 79, 69, 68, 65, 76, 78, 94],
]

export function CompressionTab() {
  const [quality, setQuality] = useState(75)
  const [showDCT, setShowDCT] = useState(false)
  const [activeCoeff, setActiveCoeff] = useState<[number,number]|null>(null)
  const [blockInput, setBlockInput] = useState(
    DEFAULT_BLOCK.map(r=>r.join(' ')).join('\n')
  )
  const [blockError, setBlockError] = useState('')
  const [block, setBlock] = useState(DEFAULT_BLOCK)

  const parseBlock = (text: string): number[][]|null => {
    try {
      const rows = text.trim().split('\n').map(r=>r.trim().split(/[\s,]+/).map(Number))
      if (rows.length!==8||rows.some(r=>r.length!==8||r.some(isNaN))) return null
      return rows
    } catch { return null }
  }

  const handleBlockChange = (val: string) => {
    setBlockInput(val)
    const parsed = parseBlock(val)
    if (parsed) { setBlock(parsed); setBlockError('') }
    else setBlockError('Zadej 8×8 čísel (0-255) oddělených mezerou')
  }

  const dctBlock = dct2d(block.map(r=>r.map(v=>v-128)))
  const quantized = quantize(dctBlock, quality)
  const reconstructed = idct2d(quantized)
  const clamp = (v:number) => Math.max(0,Math.min(255,v))

  // MSE
  const mse = block.flat().reduce((s,v,i)=>s+(v-clamp(reconstructed[Math.floor(i/8)][i%8]))**2,0)/64
  const psnr = mse>0 ? 10*Math.log10(255*255/mse) : 99

  const coeffsKept = quantized.flat().filter(v=>Math.abs(v)>0.01).length

  const origCvRef = useRef<HTMLCanvasElement>(null)
  const compCvRef = useRef<HTMLCanvasElement>(null)
  const dctCvRef  = useRef<HTMLCanvasElement>(null)

  const drawBlock = (cv: HTMLCanvasElement, pixels: number[][], label: string, col: string) => {
    const ctx = cv.getContext('2d')!
    const W=cv.width, H=cv.height-20
    const cell=Math.floor(Math.min(W,H)/8)
    ctx.clearRect(0,0,cv.width,cv.height)
    ctx.fillStyle='#0f172a'; ctx.fillRect(0,0,cv.width,cv.height)
    for (let r=0;r<8;r++) for (let c2=0;c2<8;c2++) {
      const v=clamp(Math.round(pixels[r]?.[c2]??0))
      ctx.fillStyle=`rgb(${v},${v},${v})`
      ctx.fillRect(c2*cell,r*cell,cell-1,cell-1)
      if (cell>=20) {
        ctx.fillStyle=v>128?'rgba(0,0,0,.6)':'rgba(255,255,255,.6)'
        ctx.font=`${Math.min(cell*0.38,9)}px monospace`; ctx.textAlign='center'
        ctx.fillText(String(v),c2*cell+cell/2,r*cell+cell/2+4)
      }
    }
    ctx.fillStyle=col; ctx.font='bold 11px sans-serif'; ctx.textAlign='center'
    ctx.fillText(label,W/2,H+14)
  }

  const drawDCT = (cv: HTMLCanvasElement, dct: number[][], highlight: [number,number]|null) => {
    const ctx = cv.getContext('2d')!
    const W=cv.width, H=cv.height-20
    const cell=Math.floor(Math.min(W,H)/8)
    ctx.clearRect(0,0,cv.width,cv.height)
    ctx.fillStyle='#0f172a'; ctx.fillRect(0,0,cv.width,cv.height)
    const max=Math.max(...dct.flat().map(Math.abs))||1
    for (let u=0;u<8;u++) for (let v=0;v<8;v++) {
      const val=dct[u][v], norm=val/max
      const gray=Math.round((norm+1)/2*255)
      const isKept=Math.abs(val)>0.01
      const isHL=highlight&&highlight[0]===u&&highlight[1]===v
      ctx.fillStyle=isHL?'#ec4899':isKept?`rgb(${gray},${gray},${gray})`:'#1e293b'
      ctx.fillRect(v*cell,u*cell,cell-1,cell-1)
      if (isHL||isKept) {
        ctx.fillStyle=gray>128?'rgba(0,0,0,.7)':'rgba(255,255,255,.7)'
        ctx.font=`${Math.min(cell*0.32,8)}px monospace`; ctx.textAlign='center'
        ctx.fillText(val.toFixed(0),v*cell+cell/2,u*cell+cell/2+3)
      }
    }
    ctx.fillStyle='#ec4899'; ctx.font='bold 11px sans-serif'; ctx.textAlign='center'
    ctx.fillText('DCT koeficienty',W/2,H+14)
  }

  useEffect(()=>{if(origCvRef.current)drawBlock(origCvRef.current,block,'Originál','#60a5fa')},[block])
  useEffect(()=>{if(compCvRef.current)drawBlock(compCvRef.current,reconstructed.map(r=>r.map(clamp)),`Rekonstrukce (q=${quality})`, quality>60?'#22c55e':'#ef4444')},[reconstructed,quality])
  useEffect(()=>{if(dctCvRef.current)drawDCT(dctCvRef.current,showDCT?dctBlock:quantized,activeCoeff)},[dctBlock,quantized,showDCT,activeCoeff])

  // Basis functions visualisation
  const [basisU, setBasisU] = useState(0)
  const [basisV, setBasisV] = useState(0)
  const basisCvRef = useRef<HTMLCanvasElement>(null)
  useEffect(()=>{
    const cv=basisCvRef.current; if(!cv)return
    const ctx=cv.getContext('2d')!
    const W=cv.width, H=cv.height
    const cell=Math.floor(Math.min(W,H)/8)
    ctx.clearRect(0,0,W,H); ctx.fillStyle='#0f172a'; ctx.fillRect(0,0,W,H)
    for (let x=0;x<8;x++) for (let y=0;y<8;y++) {
      const cu=basisU===0?1/Math.sqrt(2):1, cv2=basisV===0?1/Math.sqrt(2):1
      const val=0.25*cu*cv2*Math.cos((2*x+1)*basisU*Math.PI/16)*Math.cos((2*y+1)*basisV*Math.PI/16)
      const gray=Math.round((val+0.5)*255)
      ctx.fillStyle=`rgb(${Math.max(0,Math.min(255,gray))},${Math.max(0,Math.min(255,gray))},${Math.max(0,Math.min(255,gray))})`
      ctx.fillRect(y*cell,x*cell,cell-1,cell-1)
    }
    ctx.fillStyle='#ec4899'; ctx.font='bold 9px monospace'; ctx.textAlign='center'
    ctx.fillText(`Báze f(${basisU},${basisV})`,W/2,H-2)
  },[basisU,basisV])

  return (
    <div style={{display:'flex',flexDirection:'column',gap:14,padding:20,flex:1,overflowY:'auto'}}>

      {/* Explanation */}
      <div style={{padding:'10px 14px',background:'rgba(236,72,153,.06)',border:'1px solid rgba(236,72,153,.2)',borderRadius:10}}>
        <div style={{fontSize:12,fontWeight:700,color:'#f472b6',marginBottom:6}}>📦 Jak funguje JPEG komprese?</div>
        <div style={{fontSize:11,color:'#94a3b8',lineHeight:1.7}}>
          1. Obrázek se rozdělí na <strong style={{color:'#fff'}}>bloky 8×8 pixelů</strong> → 
          2. Každý blok prochází <strong style={{color:'#ec4899'}}>DCT transformací</strong> (Discrete Cosine Transform) → 
          3. Výsledné <strong style={{color:'#f59e0b'}}>koeficienty se kvantizují</strong> (méně důležité se zahodí) → 
          4. Komprese (Huffman kódování). Výsledek: malý soubor, mírná ztráta detailů.
        </div>
      </div>

      {/* Main visualisation */}
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:12}}>
        <div style={{display:'flex',flexDirection:'column' as const,gap:6}}>
          <canvas ref={origCvRef} width={200} height={220} style={{width:'100%',borderRadius:8,border:'1px solid rgba(96,165,250,.3)'}}/>
        </div>
        <div style={{display:'flex',flexDirection:'column' as const,gap:6}}>
          <div style={{display:'flex',gap:4,marginBottom:2}}>
            <button onClick={()=>setShowDCT(false)} style={{flex:1,padding:'3px',background:!showDCT?'rgba(236,72,153,.3)':'rgba(255,255,255,.06)',color:!showDCT?'#f472b6':'#64748b',border:'none',borderRadius:5,cursor:'pointer',fontSize:9,fontFamily:'inherit'}}>Po kvantizaci</button>
            <button onClick={()=>setShowDCT(true)} style={{flex:1,padding:'3px',background:showDCT?'rgba(236,72,153,.3)':'rgba(255,255,255,.06)',color:showDCT?'#f472b6':'#64748b',border:'none',borderRadius:5,cursor:'pointer',fontSize:9,fontFamily:'inherit'}}>Původní DCT</button>
          </div>
          <canvas ref={dctCvRef} width={200} height={220} style={{width:'100%',borderRadius:8,border:'1px solid rgba(236,72,153,.3)',cursor:'crosshair'}}
            onClick={e=>{
              const rect=(e.currentTarget as HTMLCanvasElement).getBoundingClientRect()
              const cell=Math.floor(Math.min(200,200)/8)
              const u=Math.floor((e.clientY-rect.top)/rect.height*8)
              const v=Math.floor((e.clientX-rect.left)/rect.width*8)
              setActiveCoeff(activeCoeff&&activeCoeff[0]===u&&activeCoeff[1]===v?null:[u,v])
              setBasisU(u); setBasisV(v)
            }}
          />
          <div style={{fontSize:9,color:C.sec,textAlign:'center' as const}}>Klikni na koeficient → zobrazí bázovou funkci</div>
        </div>
        <div style={{display:'flex',flexDirection:'column' as const,gap:6}}>
          <canvas ref={compCvRef} width={200} height={220} style={{width:'100%',borderRadius:8,border:`1px solid ${quality>60?'rgba(34,197,94,.3)':'rgba(239,68,68,.3)'}`}}/>
        </div>
      </div>

      {/* Quality slider */}
      <div style={{background:'#0d1117',borderRadius:10,padding:14,border:`1px solid ${C.border}`}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
          <span style={{fontSize:11,fontWeight:700,color:'#fff'}}>Kvalita komprese</span>
          <span style={{fontSize:14,fontWeight:800,color:quality>60?'#22c55e':quality>30?'#f59e0b':'#ef4444'}}>{quality}%</span>
        </div>
        <input type="range" min={1} max={100} value={quality} onChange={e=>setQuality(+e.target.value)}
          style={{width:'100%',accentColor:'#ec4899'}}/>
        <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:8,marginTop:10}}>
          {[
            {label:'Zachované koeficienty',val:`${coeffsKept}/64`,col:'#60a5fa'},
            {label:'MSE (chyba)',val:mse.toFixed(2),col:mse<10?'#22c55e':mse<100?'#f59e0b':'#ef4444'},
            {label:'PSNR (kvalita)',val:`${psnr.toFixed(1)} dB`,col:psnr>40?'#22c55e':psnr>30?'#f59e0b':'#ef4444'},
            {label:'Komprese',val:`~${Math.round((1-coeffsKept/64)*100)}%`,col:'#a78bfa'},
          ].map(s=>(
            <div key={s.label} style={{padding:'6px 8px',background:s.col+'0d',border:`1px solid ${s.col}22`,borderRadius:7,textAlign:'center' as const}}>
              <div style={{fontSize:8,color:C.sec,marginBottom:2}}>{s.label}</div>
              <div style={{fontSize:12,fontWeight:700,color:s.col,fontFamily:'monospace'}}>{s.val}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Basis function + sandbox */}
      <div style={{display:'grid',gridTemplateColumns:'1fr 2fr',gap:12}}>
        <div style={{background:'#0d1117',borderRadius:10,padding:12,border:`1px solid ${C.border}`}}>
          <div style={{fontSize:10,fontWeight:700,color:'#ec4899',marginBottom:8}}>Bázová DCT funkce</div>
          <canvas ref={basisCvRef} width={160} height={165} style={{width:'100%',borderRadius:7,border:'1px solid rgba(236,72,153,.3)'}}/>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:6,marginTop:8}}>
            {[['U (vert.)',basisU,setBasisU],['V (horiz.)',basisV,setBasisV]].map(([l,val,set])=>(
              <div key={l as string}>
                <div style={{fontSize:8,color:C.sec,marginBottom:2}}>{l}: {val}</div>
                <input type="range" min={0} max={7} value={val as number} onChange={e=>(set as any)(+e.target.value)}
                  style={{width:'100%',accentColor:'#ec4899'}}/>
              </div>
            ))}
          </div>
          <div style={{fontSize:9,color:C.sec,marginTop:6,lineHeight:1.5}}>
            f(0,0) = DC člen (průměr). Vyšší = vyšší frekvence (detaily).
          </div>
        </div>

        {/* Sandbox — pixel matrix editor */}
        <div style={{background:'#0d1117',borderRadius:10,padding:12,border:`1px solid ${C.border}`}}>
          <div style={{fontSize:10,fontWeight:700,color:'#60a5fa',marginBottom:6}}>🧪 Sandbox — edituj 8×8 blok</div>
          <div style={{fontSize:9,color:C.sec,marginBottom:6}}>Zadej 8 řádků po 8 číslech (0–255). Vlevo se v reálném čase zobrazí originál a rekonstrukce.</div>
          <textarea value={blockInput} onChange={e=>handleBlockChange(e.target.value)} rows={9}
            style={{width:'100%',padding:'8px 10px',background:'#0a0d14',color:'#60a5fa',border:`1px solid ${blockError?'#ef4444':'rgba(96,165,250,.3)'}`,borderRadius:7,fontSize:10,fontFamily:'monospace',resize:'none' as const,outline:'none',lineHeight:1.6,boxSizing:'border-box' as const}}/>
          {blockError&&<div style={{fontSize:9,color:'#ef4444',marginTop:3}}>{blockError}</div>}
          <div style={{display:'flex',gap:6,marginTop:6}}>
            {[['Gradient','52 55 61 66 70 61 64 73\n63 59 55 90 109 85 69 72\n62 59 68 113 144 104 66 73\n63 58 71 122 154 106 70 69\n67 61 68 104 126 88 68 70\n79 65 60 70 77 68 58 75\n85 71 64 59 55 61 65 83\n87 79 69 68 65 76 78 94'],
               ['Šachovnice','0 255 0 255 0 255 0 255\n255 0 255 0 255 0 255 0\n0 255 0 255 0 255 0 255\n255 0 255 0 255 0 255 0\n0 255 0 255 0 255 0 255\n255 0 255 0 255 0 255 0\n0 255 0 255 0 255 0 255\n255 0 255 0 255 0 255 0'],
               ['Plochý','128 128 128 128 128 128 128 128\n128 128 128 128 128 128 128 128\n128 128 128 128 128 128 128 128\n128 128 128 128 128 128 128 128\n128 128 128 128 128 128 128 128\n128 128 128 128 128 128 128 128\n128 128 128 128 128 128 128 128\n128 128 128 128 128 128 128 128'],
            ].map(([l,val])=>(
              <button key={l} onClick={()=>handleBlockChange(val)}
                style={{padding:'3px 9px',background:'rgba(96,165,250,.1)',color:'#60a5fa',border:'1px solid rgba(96,165,250,.25)',borderRadius:6,cursor:'pointer',fontSize:9,fontFamily:'inherit'}}>
                {l}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
