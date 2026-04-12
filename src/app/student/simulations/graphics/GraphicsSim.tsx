'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useRef } from 'react'
import { RasterVectorTab }  from './RasterVector'
import { ColorModelsTab }   from './ColorModels'
import { ResolutionTab }    from './Resolution'
import { CompressionTab }   from './Compression'
import { VectorTab }        from './VectorGraphics'
import { RasterizationTab } from './Rasterization'

type Tab = 'rastervector' | 'colors' | 'resolution' | 'compression' | 'vector' | 'rasterization'

const C = { bg:'#090B10', card:'#11141D', border:'rgba(255,255,255,0.07)', txt:'#fff', sec:'#8892a4' }

const TABS: { id:Tab; icon:string; label:string; sub:string; color:string }[] = [
  { id:'rastervector',  icon:'🔀', label:'Rastr vs Vektor',   sub:'Porovnání',          color:'#3b82f6' },
  { id:'colors',        icon:'🎨', label:'Barevné modely',    sub:'RGB, CMYK, HSL…',    color:'#ec4899' },
  { id:'resolution',    icon:'📐', label:'Rozlišení & DPI',   sub:'PPI, tisk, web',     color:'#06b6d4' },
  { id:'compression',   icon:'📦', label:'Komprese JPEG',     sub:'DCT & sandbox',      color:'#f59e0b' },
  { id:'vector',        icon:'✏️', label:'Vektorová grafika',  sub:'Bézier, bool. op.',  color:'#a855f7' },
  { id:'rasterization', icon:'🔲', label:'Rasterizace',       sub:'Vektor→pixel',       color:'#22c55e' },
]

const INFO: Record<Tab,{desc:string;facts:{k:string;v:string}[];tip:string}> = {
  rastervector: {
    desc:'Rastrová grafika ukládá obrázek jako mřížku pixelů. Vektorová grafika popisuje tvary matematicky.',
    facts:[{k:'Rastr',v:'PNG, JPG, GIF, WebP'},{k:'Vektor',v:'SVG, AI, EPS, PDF'},{k:'Rastr zoom',v:'Zrnitost pixelů'},{k:'Vektor zoom',v:'Vždy ostrý'}],
    tip:'💡 Zoom pomocí slideru ukazuje klíčový rozdíl: rastr pixelizuje, vektor zůstává ostrý.',
  },
  colors: {
    desc:'Barvy v počítači lze popsat různými modely — každý se hodí pro jiný účel.',
    facts:[{k:'RGB',v:'Světlo (monitor)'},{k:'CMYK',v:'Inkoust (tisk)'},{k:'HSL/HSV',v:'Intuitivní design'},{k:'HEX',v:'Web CSS'},],
    tip:'💡 Posuv sliderů změní barvu ve všech modelech současně — uvidíš jak se vzájemně přepočítávají.',
  },
  resolution: {
    desc:'Rozlišení určuje počet pixelů. DPI/PPI pak říká jak hustě jsou rozmístěny na fyzickém médiu.',
    facts:[{k:'Full HD',v:'1920×1080 = 2.1 MP'},{k:'4K',v:'3840×2160 = 8.3 MP'},{k:'Tisk',v:'300+ DPI'},{k:'Web',v:'72–96 PPI'}],
    tip:'💡 Kalkulačka ukáže na jak velký formát zvládneš obrázek vytisknout kvalitně.',
  },
  compression: {
    desc:'JPEG dělí obrázek na bloky 8×8, aplikuje DCT transformaci a zahazuje méně viditelné frekvence.',
    facts:[{k:'Blok',v:'8×8 pixelů'},{k:'DCT',v:'64 koeficientů'},{k:'Quality 80',v:'~80% koef. zachováno'},{k:'PSNR >40 dB',v:'Vizuálně bezeztrátové'}],
    tip:'💡 Sandbox vlevo ti dovolí zadat vlastní 8×8 matici pixelů a sledovat DCT v reálném čase.',
  },
  vector: {
    desc:'Vektorová grafika používá matematické křivky (Bézier), souřadnice a booleovské operace nad tvary.',
    facts:[{k:'Bézier',v:'4 kontrolní body'},{k:'P1, P2',v:'Táhla (handles)'},{k:'Bool. op.',v:'Union, Intersect…'},{k:'SVG',v:'XML vektor formát'}],
    tip:'💡 Kresli Bézierovy křivky 4 kliky a táhni kontrolní body. Vyber 2 tvary pro booleovské operace.',
  },
  rasterization: {
    desc:'Rasterizace převádí vektorové tvary na pixely. Vektorizace dělá opak — z pixelů rekonstruuje křivky.',
    facts:[{k:'Anti-aliasing',v:'Průměrování okrajů'},{k:'Rasterizace',v:'Vektor → pixely'},{k:'Vektorizace',v:'Pixely → SVG'},{k:'Potrace',v:'Populární vektorizátor'}],
    tip:'💡 Zapni Anti-aliasing a porovnej s vypnutým — uvidíš jak moc vyhlazuje zubaté okraje.',
  },
}

export default function GraphicsSim({ accentColor }: { accentColor: string }) {
  const [tab, setTab] = useState<Tab>('rastervector')
  const containerRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w:900, h:500 })

  useEffect(() => {
    const el = containerRef.current; if (!el) return
    const ro = new ResizeObserver(e => {
      const { width, height } = e[0].contentRect
      setSize({ w:Math.floor(width), h:Math.floor(height) })
    })
    ro.observe(el); return () => ro.disconnect()
  }, [])

  const ti = TABS.find(t=>t.id===tab)!
  const info = INFO[tab]

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', background:C.bg, color:C.txt, fontFamily:'inherit', overflow:'hidden' }}>
      <style>{`@keyframes fadeIn{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:none}}.fi{animation:fadeIn .3s ease} input,select,textarea{outline:none}`}</style>

      {/* Header */}
      <div style={{ padding:'10px 18px', borderBottom:`1px solid ${C.border}`, display:'flex', alignItems:'center', gap:12, flexShrink:0, background:C.card }}>
        <a href="/student/simulations" style={{ color:C.sec, fontSize:13, textDecoration:'none' }}>← Simulace</a>
        <div style={{ width:1, height:14, background:C.border }}/>
        <span style={{ fontSize:14, fontWeight:700 }}>🎨 Počítačová grafika — interaktivní průvodce</span>
      </div>

      {/* Tab bar */}
      <div style={{ display:'flex', borderBottom:`1px solid ${C.border}`, flexShrink:0, background:C.card, overflowX:'auto' }}>
        {TABS.map(t => (
          <button key={t.id} onClick={()=>setTab(t.id)}
            style={{ flexShrink:0, padding:'9px 12px', background:'transparent', border:'none', borderBottom:`3px solid ${tab===t.id?t.color:'transparent'}`, cursor:'pointer', fontFamily:'inherit', display:'flex', flexDirection:'column', alignItems:'center', gap:2, minWidth:95 }}>
            <span style={{ fontSize:18 }}>{t.icon}</span>
            <span style={{ fontSize:10, fontWeight:700, color:tab===t.id?t.color:C.sec, whiteSpace:'nowrap' }}>{t.label}</span>
            <span style={{ fontSize:8, color:'#475569', whiteSpace:'nowrap' }}>{t.sub}</span>
          </button>
        ))}
      </div>

      {/* Main */}
      <div style={{ flex:1, display:'flex', minHeight:0, overflow:'hidden' }}>

        {/* Content */}
        <div ref={containerRef} style={{ flex:1, overflow:'hidden', display:'flex', flexDirection:'column' }}>
          <div key={tab} className="fi" style={{ flex:1, overflow:'hidden', display:'flex', flexDirection:'column' }}>
            {tab==='rastervector'  && <RasterVectorTab />}
            {tab==='colors'        && <ColorModelsTab />}
            {tab==='resolution'    && <ResolutionTab />}
            {tab==='compression'   && <CompressionTab />}
            {tab==='vector'        && <VectorTab size={size} />}
            {tab==='rasterization' && <RasterizationTab size={size} />}
          </div>
        </div>

        {/* Right info panel */}
        <div style={{ width:248, flexShrink:0, borderLeft:`1px solid ${C.border}`, display:'flex', flexDirection:'column', overflow:'hidden', background:C.card }}>
          <div style={{ flex:1, overflowY:'auto', padding:14 }}>
            <div key={tab} className="fi">
              <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:12 }}>
                <div style={{ width:36, height:36, borderRadius:9, background:ti.color+'22', border:`1px solid ${ti.color}44`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:20 }}>{ti.icon}</div>
                <div>
                  <div style={{ fontSize:13, fontWeight:800, color:'#fff' }}>{ti.label}</div>
                  <div style={{ fontSize:10, color:ti.color, fontWeight:600 }}>{ti.sub}</div>
                </div>
              </div>

              <p style={{ fontSize:11.5, color:'#cbd5e1', lineHeight:1.75, margin:'0 0 12px' }}>{info.desc}</p>

              <table style={{ width:'100%', borderCollapse:'collapse' as const, marginBottom:12 }}>
                <tbody>
                  {info.facts.map((f,i)=>(
                    <tr key={i} style={{ borderBottom:`1px solid ${C.border}` }}>
                      <td style={{ padding:'4px 6px', fontSize:10, color:C.sec }}>{f.k}</td>
                      <td style={{ padding:'4px 6px', fontSize:10, color:'#e2e8f0', fontWeight:600, textAlign:'right' as const }}>{f.v}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div style={{ padding:'8px 10px', background:'rgba(251,191,36,.05)', border:'1px solid rgba(251,191,36,.15)', borderRadius:8, marginBottom:14 }}>
                <p style={{ fontSize:11, color:'#fcd34d', margin:0, lineHeight:1.65 }}>{info.tip}</p>
              </div>

              {/* Navigation */}
              <div style={{ borderTop:`1px solid ${C.border}`, paddingTop:12 }}>
                <div style={{ fontSize:9, fontWeight:700, color:C.sec, textTransform:'uppercase', letterSpacing:'.06em', marginBottom:8 }}>Témata</div>
                {TABS.map(t => (
                  <button key={t.id} onClick={()=>setTab(t.id)}
                    style={{ display:'flex', alignItems:'center', gap:8, width:'100%', padding:'6px 8px', background:tab===t.id?t.color+'12':'transparent', border:`1px solid ${tab===t.id?t.color+'30':C.border}`, borderRadius:7, cursor:'pointer', fontFamily:'inherit', marginBottom:4 }}>
                    <span style={{ fontSize:14 }}>{t.icon}</span>
                    <div style={{ textAlign:'left' as const }}>
                      <div style={{ fontSize:11, fontWeight:600, color:tab===t.id?t.color:'#94a3b8' }}>{t.label}</div>
                      <div style={{ fontSize:9, color:'#475569' }}>{t.sub}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
