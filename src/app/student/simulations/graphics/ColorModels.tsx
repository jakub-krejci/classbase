'use client'
import { useState, useCallback } from 'react'
const C = { bg:'#090B10', card:'#11141D', border:'rgba(255,255,255,0.07)', txt:'#fff', sec:'#8892a4' }

function hslToRgb(h:number,s:number,l:number):[number,number,number]{
  s/=100;l/=100
  const k=(n:number)=>(n+h/30)%12
  const a=s*Math.min(l,1-l)
  const f=(n:number)=>l-a*Math.max(-1,Math.min(k(n)-3,Math.min(9-k(n),1)))
  return [Math.round(f(0)*255),Math.round(f(8)*255),Math.round(f(4)*255)]
}
function rgbToHsl(r:number,g:number,b:number):[number,number,number]{
  r/=255;g/=255;b/=255
  const max=Math.max(r,g,b),min=Math.min(r,g,b),l=(max+min)/2
  if(max===min)return[0,0,Math.round(l*100)]
  const d=max-min,s=l>0.5?d/(2-max-min):d/(max+min)
  let h=0
  if(max===r)h=(g-b)/d+(g<b?6:0)
  else if(max===g)h=(b-r)/d+2
  else h=(r-g)/d+4
  return[Math.round(h*60),Math.round(s*100),Math.round(l*100)]
}
function rgbToCmyk(r:number,g:number,b:number):[number,number,number,number]{
  const r2=r/255,g2=g/255,b2=b/255
  const k=1-Math.max(r2,g2,b2)
  if(k===1)return[0,0,0,100]
  return[Math.round((1-r2-k)/(1-k)*100),Math.round((1-g2-k)/(1-k)*100),Math.round((1-b2-k)/(1-k)*100),Math.round(k*100)]
}
function rgbToHsv(r:number,g:number,b:number):[number,number,number]{
  r/=255;g/=255;b/=255
  const max=Math.max(r,g,b),min=Math.min(r,g,b),d=max-min
  let h=0
  if(d>0){
    if(max===r)h=((g-b)/d+6)%6
    else if(max===g)h=(b-r)/d+2
    else h=(r-g)/d+4
    h=Math.round(h*60)
  }
  return[h,Math.round(max===0?0:d/max*100),Math.round(max*100)]
}

function toHex(r:number,g:number,b:number){return'#'+[r,g,b].map(x=>x.toString(16).padStart(2,'0')).join('')}
function fromHex(h:string):[number,number,number]{const r=parseInt(h.slice(1,3),16),g=parseInt(h.slice(3,5),16),b=parseInt(h.slice(5,7),16);return[r,g,b]}

export function ColorModelsTab() {
  const [r,setR]=useState(65)
  const [g,setG]=useState(130)
  const [b,setB]=useState(220)
  const [alpha,setAlpha]=useState(100)

  const hex=toHex(r,g,b)
  const [h,s,l]=rgbToHsl(r,g,b)
  const [hv,sv,v]=rgbToHsv(r,g,b)
  const [c,m,y,k]=rgbToCmyk(r,g,b)

  const fromHexInput=(val:string)=>{
    if(/^#[0-9a-fA-F]{6}$/.test(val)){const[nr,ng,nb]=fromHex(val);setR(nr);setG(ng);setB(nb)}
  }

  const SliderRow=({label,val,max,onChange,color,unit=''}:{label:string,val:number,max:number,onChange:(v:number)=>void,color:string,unit?:string})=>(
    <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:6}}>
      <span style={{fontSize:10,fontWeight:700,color,width:16,textAlign:'center' as const}}>{label}</span>
      <input type="range" min={0} max={max} value={val} onChange={e=>onChange(+e.target.value)}
        style={{flex:1,accentColor:color,height:4}}/>
      <span style={{fontSize:10,fontFamily:'monospace',color:'#94a3b8',minWidth:32,textAlign:'right' as const}}>{val}{unit}</span>
    </div>
  )

  return (
    <div style={{display:'flex',flexDirection:'column',gap:14,padding:20,flex:1,overflowY:'auto'}}>
      {/* Color preview */}
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
        <div>
          <div style={{height:80,borderRadius:10,background:`rgba(${r},${g},${b},${alpha/100})`,border:`1px solid ${C.border}`,boxShadow:'0 4px 20px rgba(0,0,0,.5)',transition:'background .1s'}}/>
          <div style={{display:'flex',gap:8,marginTop:8,alignItems:'center'}}>
            <input type="color" value={hex} onChange={e=>fromHexInput(e.target.value)}
              style={{width:36,height:28,border:'none',borderRadius:6,cursor:'pointer',background:'transparent'}}/>
            <input value={hex} onChange={e=>fromHexInput(e.target.value)}
              style={{flex:1,padding:'5px 10px',background:'#1a2035',color:'#fff',border:`1px solid ${C.border}`,borderRadius:7,fontSize:13,fontFamily:'monospace',outline:'none'}}/>
          </div>
        </div>
        <div style={{padding:'10px 12px',background:'#0d1117',borderRadius:10,border:`1px solid ${C.border}`}}>
          <div style={{fontSize:9,fontWeight:700,color:C.sec,textTransform:'uppercase' as const,marginBottom:6}}>Checkerboard (průhlednost)</div>
          <div style={{height:52,borderRadius:7,position:'relative' as const,overflow:'hidden'}}>
            <div style={{position:'absolute' as const,inset:0,backgroundImage:'linear-gradient(45deg,#666 25%,transparent 25%),linear-gradient(-45deg,#666 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#666 75%),linear-gradient(-45deg,transparent 75%,#666 75%)',backgroundSize:'12px 12px',backgroundPosition:'0 0,0 6px,6px -6px,-6px 0'}}/>
            <div style={{position:'absolute' as const,inset:0,background:`rgba(${r},${g},${b},${alpha/100})`}}/>
          </div>
          <div style={{marginTop:6}}>
            <SliderRow label="A" val={alpha} max={100} onChange={setAlpha} color="#94a3b8" unit="%"/>
          </div>
        </div>
      </div>

      {/* Model cards */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(2,1fr)',gap:10}}>

        {/* RGB */}
        <div style={{padding:'12px 14px',background:'rgba(255,80,80,.05)',border:'1px solid rgba(255,80,80,.2)',borderRadius:12}}>
          <div style={{fontSize:12,fontWeight:800,color:'#f87171',marginBottom:4}}>RGB — Aditivní míchání</div>
          <div style={{fontSize:9,color:C.sec,marginBottom:10,lineHeight:1.5}}>Světlo: Červená+Zelená+Modrá → Bílá. Monitory, displeje.</div>
          <SliderRow label="R" val={r} max={255} onChange={setR} color="#ef4444"/>
          <SliderRow label="G" val={g} max={255} onChange={setG} color="#22c55e"/>
          <SliderRow label="B" val={b} max={255} onChange={setB} color="#3b82f6"/>
          <div style={{display:'flex',gap:4,marginTop:6}}>
            {[['R',r,'#ef444466'],['G',g,'#22c55e66'],['B',b,'#3b82f666']].map(([l,v,cl])=>(
              <div key={l as string} style={{flex:1,height:20,borderRadius:4,background:cl as string,display:'flex',alignItems:'center',justifyContent:'center',fontSize:8,fontWeight:700,color:'#fff'}}>{v}</div>
            ))}
          </div>
          <div style={{fontSize:10,fontFamily:'monospace',color:'#94a3b8',marginTop:6}}>rgb({r},{g},{b})</div>
          {/* Channel bars */}
          <div style={{display:'flex',gap:2,marginTop:6,height:40,alignItems:'flex-end'}}>
            {[[r,'#ef4444'],[g,'#22c55e'],[b,'#3b82f6']].map(([val,col],i)=>(
              <div key={i} style={{flex:1,background:col as string,height:`${(val as number)/255*100}%`,borderRadius:'3px 3px 0 0',transition:'height .2s'}}/>
            ))}
          </div>
        </div>

        {/* CMYK */}
        <div style={{padding:'12px 14px',background:'rgba(34,211,238,.05)',border:'1px solid rgba(34,211,238,.2)',borderRadius:12}}>
          <div style={{fontSize:12,fontWeight:800,color:'#22d3ee',marginBottom:4}}>CMYK — Subtraktivní</div>
          <div style={{fontSize:9,color:C.sec,marginBottom:10,lineHeight:1.5}}>Inkoust: Cyan+Magenta+Yellow+Key(Black). Tisk.</div>
          {[['C',c,'#06b6d4'],['M',m,'#ec4899'],['Y',y,'#f59e0b'],['K',k,'#6b7280']].map(([l,val,col])=>(
            <div key={l as string} style={{display:'flex',alignItems:'center',gap:8,marginBottom:5}}>
              <span style={{fontSize:10,fontWeight:700,color:col as string,width:16,textAlign:'center' as const}}>{l}</span>
              <div style={{flex:1,height:8,background:'rgba(255,255,255,.08)',borderRadius:4,overflow:'hidden'}}>
                <div style={{height:'100%',width:`${val}%`,background:col as string,borderRadius:4,transition:'width .2s'}}/>
              </div>
              <span style={{fontSize:10,fontFamily:'monospace',color:'#94a3b8',minWidth:28}}>{val}%</span>
            </div>
          ))}
          <div style={{fontSize:10,fontFamily:'monospace',color:'#94a3b8',marginTop:6}}>cmyk({c}%,{m}%,{y}%,{k}%)</div>
          {/* Ink dots simulation */}
          <div style={{display:'flex',gap:4,marginTop:6}}>
            {[[`rgba(0,${Math.round(255*(1-c/100))},${Math.round(255*(1-c/100))},1)`,'C'],[`rgba(${Math.round(255*(1-m/100))},0,${Math.round(255*(1-m/100))},1)`,'M'],[`rgba(${Math.round(255*(1-y/100))},${Math.round(255*(1-y/100))},0,1)`,'Y'],[`rgba(${Math.round(255*(1-k/100))},${Math.round(255*(1-k/100))},${Math.round(255*(1-k/100))},1)`,'K']].map(([cl,l])=>(
              <div key={l as string} style={{flex:1,height:20,borderRadius:4,background:cl as string,display:'flex',alignItems:'center',justifyContent:'center',fontSize:8,fontWeight:700,color:'rgba(0,0,0,.7)'}}>{l}</div>
            ))}
          </div>
        </div>

        {/* HSL */}
        <div style={{padding:'12px 14px',background:'rgba(168,85,247,.05)',border:'1px solid rgba(168,85,247,.2)',borderRadius:12}}>
          <div style={{fontSize:12,fontWeight:800,color:'#c084fc',marginBottom:4}}>HSL — Intuitivní</div>
          <div style={{fontSize:9,color:C.sec,marginBottom:10,lineHeight:1.5}}>Hue (odstín), Saturation (sytost), Lightness (světlost). Snadné pro design.</div>
          {[['H',h,360,'°','#a855f7'],['S',s,100,'%','#ec4899'],['L',l,100,'%','#f59e0b']].map(([label,val,max,unit,col])=>(
            <div key={label as string} style={{display:'flex',alignItems:'center',gap:8,marginBottom:5}}>
              <span style={{fontSize:10,fontWeight:700,color:col as string,width:14}}>{label}</span>
              <div style={{flex:1,height:10,borderRadius:5,overflow:'hidden',
                background: label==='H'?'linear-gradient(to right,#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)':
                  label==='S'?`linear-gradient(to right,hsl(${h},0%,${l}%),hsl(${h},100%,${l}%))`:
                  `linear-gradient(to right,#000,hsl(${h},${s}%,50%),#fff)`}}>
                <div style={{width:`${(val as number)/(max as number)*100}%`,height:'100%',borderRight:'2px solid #fff'}}/>
              </div>
              <span style={{fontSize:10,fontFamily:'monospace',color:'#94a3b8',minWidth:36}}>{val}{unit}</span>
            </div>
          ))}
          <div style={{fontSize:10,fontFamily:'monospace',color:'#94a3b8',marginTop:6}}>hsl({h},{s}%,{l}%)</div>
          {/* Hue wheel mini */}
          <div style={{marginTop:8,display:'flex',gap:3}}>
            {Array.from({length:24},(_,i)=>(
              <div key={i} style={{flex:1,height:14,borderRadius:2,background:`hsl(${i*15},80%,55%)`,border:Math.abs(i*15-h)<8?'2px solid #fff':'none'}}/>
            ))}
          </div>
        </div>

        {/* HSV */}
        <div style={{padding:'12px 14px',background:'rgba(245,158,11,.05)',border:'1px solid rgba(245,158,11,.2)',borderRadius:12}}>
          <div style={{fontSize:12,fontWeight:800,color:'#fbbf24',marginBottom:4}}>HSV — Fotografický</div>
          <div style={{fontSize:9,color:C.sec,marginBottom:10,lineHeight:1.5}}>Hue, Saturation, Value (jas). Používá Photoshop, color pickers.</div>
          {[['H',hv,360,'°','#f59e0b'],['S',sv,100,'%','#fb923c'],['V',v,100,'%','#fbbf24']].map(([label,val,max,unit,col])=>(
            <div key={label as string} style={{display:'flex',alignItems:'center',gap:8,marginBottom:5}}>
              <span style={{fontSize:10,fontWeight:700,color:col as string,width:14}}>{label}</span>
              <div style={{flex:1,height:10,borderRadius:5,overflow:'hidden',
                background: label==='H'?'linear-gradient(to right,#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)':
                  label==='S'?`linear-gradient(to right,#fff,hsl(${hv},100%,50%))`:
                  `linear-gradient(to right,#000,hsl(${hv},${sv}%,50%))`}}>
                <div style={{width:`${(val as number)/(max as number)*100}%`,height:'100%',borderRight:'2px solid #fff'}}/>
              </div>
              <span style={{fontSize:10,fontFamily:'monospace',color:'#94a3b8',minWidth:36}}>{val}{unit}</span>
            </div>
          ))}
          <div style={{fontSize:10,fontFamily:'monospace',color:'#94a3b8',marginTop:6}}>hsv({hv},{sv}%,{v}%)</div>
          {/* HSV gradient square mini */}
          <div style={{marginTop:8,height:28,borderRadius:5,position:'relative' as const,overflow:'hidden',
            background:`linear-gradient(to bottom,transparent,#000),linear-gradient(to right,#fff,hsl(${hv},100%,50%))`}}>
            <div style={{position:'absolute' as const,width:8,height:8,borderRadius:'50%',border:'2px solid #fff',
              left:`${sv}%`,top:`${100-v}%`,transform:'translate(-50%,-50%)',boxShadow:'0 0 4px rgba(0,0,0,.8)'}}/>
          </div>
        </div>
      </div>

      {/* Color comparison big swatch */}
      <div style={{background:'#0d1117',borderRadius:10,padding:14,border:`1px solid ${C.border}`}}>
        <div style={{fontSize:10,fontWeight:700,color:C.sec,textTransform:'uppercase' as const,marginBottom:10}}>Všechny zápisy stejné barvy</div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(180px,1fr))',gap:8}}>
          {[
            {model:'HEX',val:hex,col:'#60a5fa'},
            {model:'RGB',val:`rgb(${r},${g},${b})`,col:'#f87171'},
            {model:'RGBA',val:`rgba(${r},${g},${b},${(alpha/100).toFixed(2)})`,col:'#fb923c'},
            {model:'HSL',val:`hsl(${h},${s}%,${l}%)`,col:'#c084fc'},
            {model:'HSV',val:`hsv(${hv},${sv}%,${v}%)`,col:'#fbbf24'},
            {model:'CMYK',val:`cmyk(${c}%,${m}%,${y}%,${k}%)`,col:'#22d3ee'},
          ].map(f=>(
            <div key={f.model} style={{padding:'8px 10px',background:f.col+'0d',border:`1px solid ${f.col}33`,borderRadius:8}}>
              <div style={{fontSize:9,fontWeight:700,color:f.col,marginBottom:3}}>{f.model}</div>
              <div style={{fontSize:10,fontFamily:'monospace',color:'#e2e8f0',wordBreak:'break-all' as const}}>{f.val}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
