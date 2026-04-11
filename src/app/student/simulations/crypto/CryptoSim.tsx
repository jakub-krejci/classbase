'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useRef, useCallback } from 'react'

// ─── Shared styles ─────────────────────────────────────────────────────────────
const C = {
  bg:'#090B10', card:'#11141D', border:'rgba(255,255,255,0.07)',
  txt:'#fff', sec:'#8892a4',
  caesar:'#f59e0b', vigenere:'#3b82f6', hash:'#ef4444', rsa:'#a855f7', sym:'#22c55e',
}

type Tab = 'caesar' | 'vigenere' | 'hash' | 'rsa' | 'symmetric'

const TAB_INFO = {
  caesar:    { icon:'🔐', title:'Caesar Cipher',        sub:'Substituční šifra',  color:C.caesar  },
  vigenere:  { icon:'🔑', title:'Vigenère Cipher',      sub:'Polyalfabetická',    color:C.vigenere },
  hash:      { icon:'#️⃣', title:'Hašování',             sub:'SHA-256 / MD5',      color:C.hash    },
  rsa:       { icon:'🏛', title:'RSA Šifrování',         sub:'Asymetrická krypto', color:C.rsa     },
  symmetric: { icon:'🔒', title:'AES – Symetrické',      sub:'Blokové šifrování',  color:C.sym     },
}

// ══════════════════════════════════════════════════════════════════════════════
// CAESAR TAB
// ══════════════════════════════════════════════════════════════════════════════
function CaesarTab() {
  const [text, setText] = useState('AHOJ SVETE')
  const [shift, setShift] = useState(3)
  const [mode, setMode] = useState<'encrypt'|'decrypt'>('encrypt')
  const [animStep, setAnimStep] = useState(-1)
  const [playing, setPlaying] = useState(false)
  const timerRef = useRef<any>(null)

  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  const clean = text.toUpperCase().replace(/[^A-Z ]/g, '')

  const process = (str: string, s: number, enc: boolean) =>
    str.split('').map(c => {
      if (c === ' ') return ' '
      const idx = alphabet.indexOf(c)
      if (idx < 0) return c
      return enc
        ? alphabet[(idx + s + 26) % 26]
        : alphabet[(idx - s + 26) % 26]
    }).join('')

  const encrypted = process(clean, shift, true)
  const result = mode === 'encrypt' ? encrypted : process(clean, shift, false)

  useEffect(() => {
    if (!playing) return
    if (animStep >= clean.length - 1) { setPlaying(false); return }
    timerRef.current = setTimeout(() => setAnimStep(i => i + 1), 160)
    return () => clearTimeout(timerRef.current)
  }, [playing, animStep, clean.length])

  const startAnim = () => { setAnimStep(-1); setPlaying(false); setTimeout(() => { setAnimStep(0); setPlaying(true) }, 50) }
  const stopAnim = () => { setPlaying(false); clearTimeout(timerRef.current) }

  return (
    <div style={{display:'flex',flexDirection:'column',gap:16,padding:20,flex:1,overflowY:'auto'}}>
      {/* Controls */}
      <div style={{display:'grid',gridTemplateColumns:'1fr auto',gap:12}}>
        <div>
          <label style={{fontSize:10,color:C.sec,display:'block',marginBottom:4}}>Vstupní text</label>
          <input value={text} onChange={e=>setText(e.target.value.toUpperCase())}
            style={{width:'100%',padding:'8px 12px',background:'#1a2035',color:'#fff',border:`1px solid ${C.border}`,borderRadius:8,fontSize:14,fontFamily:'monospace',boxSizing:'border-box' as const}}/>
        </div>
        <div>
          <label style={{fontSize:10,color:C.sec,display:'block',marginBottom:4}}>Posun (klíč)</label>
          <div style={{display:'flex',alignItems:'center',gap:8}}>
            <input type="range" min={1} max={25} value={shift} onChange={e=>setShift(+e.target.value)}
              style={{width:100,accentColor:C.caesar}}/>
            <span style={{fontSize:20,fontWeight:800,color:C.caesar,minWidth:28,textAlign:'center'}}>{shift}</span>
          </div>
        </div>
      </div>

      {/* Mode toggle */}
      <div style={{display:'flex',gap:8}}>
        {(['encrypt','decrypt'] as const).map(m=>(
          <button key={m} onClick={()=>setMode(m)}
            style={{padding:'6px 16px',background:mode===m?C.caesar+'33':'rgba(255,255,255,.05)',color:mode===m?C.caesar:C.sec,border:`1px solid ${mode===m?C.caesar+'55':C.border}`,borderRadius:7,cursor:'pointer',fontFamily:'inherit',fontSize:12,fontWeight:mode===m?700:400}}>
            {m==='encrypt'?'🔒 Šifrovat':'🔓 Dešifrovat'}
          </button>
        ))}
        <button onClick={startAnim}
          style={{padding:'6px 16px',background:'rgba(245,158,11,.15)',color:C.caesar,border:`1px solid ${C.caesar}44`,borderRadius:7,cursor:'pointer',fontFamily:'inherit',fontSize:12}}>
          {playing?'↺ Restartovat':'▶ Animovat'}
        </button>
        {playing&&<button onClick={stopAnim} style={{padding:'6px 12px',background:'rgba(239,68,68,.1)',color:'#f87171',border:`1px solid rgba(239,68,68,.3)`,borderRadius:7,cursor:'pointer',fontFamily:'inherit',fontSize:12}}>⏸</button>}
      </div>

      {/* Animated letter mapping */}
      <div style={{background:'#0d1117',borderRadius:10,padding:16,border:`1px solid ${C.border}`}}>
        <div style={{fontSize:10,fontWeight:700,color:C.sec,textTransform:'uppercase',letterSpacing:'.06em',marginBottom:10}}>
          Šifrovací tabulka — posun o {shift}
        </div>
        {/* Alphabet wheel visualisation */}
        <AlphabetWheel shift={shift} highlightIdx={animStep>=0?alphabet.indexOf(clean[animStep]):undefined} mode={mode}/>
      </div>

      {/* Letter-by-letter mapping */}
      <div style={{background:'#0d1117',borderRadius:10,padding:14,border:`1px solid ${C.border}`}}>
        <div style={{fontSize:10,fontWeight:700,color:C.sec,textTransform:'uppercase',marginBottom:10}}>Překlad písmen</div>
        <div style={{display:'flex',flexWrap:'wrap' as const,gap:6}}>
          {clean.split('').map((ch,i)=>{
            const enc = process(ch, shift, true)
            const dec = process(ch, shift, false)
            const out = mode==='encrypt'?enc:dec
            const isActive = i===animStep
            const isDone = animStep>=0&&i<=animStep
            return (
              <div key={i} style={{textAlign:'center',minWidth:38}}>
                <div style={{
                  padding:'6px 4px',borderRadius:6,border:`1.5px solid ${isActive?C.caesar:isDone?C.caesar+'44':C.border}`,
                  background:isActive?C.caesar+'22':isDone?C.caesar+'0d':'transparent',
                  transition:'all .2s'
                }}>
                  <div style={{fontSize:16,fontWeight:800,color:isActive?C.caesar:isDone?'#fff':C.sec,fontFamily:'monospace'}}>{ch}</div>
                  {ch!==' '&&<div style={{fontSize:9,color:C.sec,margin:'1px 0'}}>↓</div>}
                  {ch!==' '&&<div style={{fontSize:16,fontWeight:800,color:isActive?C.caesar:isDone?C.caesar:C.sec,fontFamily:'monospace'}}>{isDone||animStep<0?out:'?'}</div>}
                  {ch===' '&&<div style={{fontSize:14,color:C.sec}}>·</div>}
                </div>
                <div style={{fontSize:8,color:'#334155',marginTop:2}}>{i}</div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Result */}
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
        <CryptoBox label={mode==='encrypt'?'Plaintext':'Ciphertext'} value={clean} color={C.sec}/>
        <CryptoBox label={mode==='encrypt'?'Ciphertext':'Plaintext'} value={animStep>=0?process(clean.slice(0,animStep+1),shift,mode==='encrypt'):result} color={C.caesar}/>
      </div>

      {/* Frequency analysis */}
      <FreqAnalysis plain={clean} cipher={encrypted} color={C.caesar}/>
    </div>
  )
}

function AlphabetWheel({shift,highlightIdx,mode}:{shift:number;highlightIdx?:number;mode:'encrypt'|'decrypt'}) {
  const alpha = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  return (
    <div style={{overflowX:'auto'}}>
      <div style={{display:'flex',flexDirection:'column',gap:4,minWidth:'max-content'}}>
        <div style={{display:'flex',gap:2}}>
          <span style={{fontSize:9,color:C.sec,width:60,flexShrink:0}}>Plaintext:</span>
          {alpha.split('').map((c,i)=>(
            <div key={i} style={{width:22,height:22,display:'flex',alignItems:'center',justifyContent:'center',borderRadius:4,
              background:highlightIdx!==undefined&&(mode==='encrypt'?i:((i+shift)%26))===highlightIdx?C.caesar+'33':'#1a2035',
              border:`1px solid ${highlightIdx!==undefined&&(mode==='encrypt'?i:((i+shift)%26))===highlightIdx?C.caesar:'transparent'}`,
              fontSize:10,fontWeight:700,color:'#94a3b8',fontFamily:'monospace'}}>
              {c}
            </div>
          ))}
        </div>
        <div style={{display:'flex',gap:2,alignItems:'center'}}>
          <span style={{fontSize:9,color:C.caesar,width:60,flexShrink:0}}>+{shift} →</span>
          {alpha.split('').map((c,i)=>{
            const shifted = (i+shift)%26
            const isTarget = highlightIdx!==undefined&&(mode==='encrypt'?i===highlightIdx:shifted===highlightIdx)
            return (
              <div key={i} style={{width:22,height:22,display:'flex',alignItems:'center',justifyContent:'center',borderRadius:4,
                background:isTarget?C.caesar+'55':'transparent',
                border:`1px solid ${isTarget?C.caesar:'transparent'}`,
                fontSize:10,fontWeight:700,color:isTarget?C.caesar:'#475569',fontFamily:'monospace'}}>
                {alpha[shifted]}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// VIGENÈRE TAB
// ══════════════════════════════════════════════════════════════════════════════
function VigenereTab() {
  const [text, setText] = useState('UTOCME ZA USVITU')
  const [key, setKey] = useState('KLÍČ')
  const [mode, setMode] = useState<'encrypt'|'decrypt'>('encrypt')
  const [animStep, setAnimStep] = useState(-1)
  const [playing, setPlaying] = useState(false)
  const timerRef = useRef<any>(null)

  const alpha = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  const cleanText = text.toUpperCase().replace(/[^A-Z ]/g,'')
  const cleanKey = (key.toUpperCase().replace(/[^A-Z]/g,'') || 'A')

  const vigenere = (str:string, k:string, enc:boolean) => {
    let ki = 0
    return str.split('').map(c => {
      if (c===' ') return ' '
      const ci = alpha.indexOf(c), ki2 = alpha.indexOf(k[ki%k.length])
      ki++
      return enc ? alpha[(ci+ki2+26)%26] : alpha[(ci-ki2+26)%26]
    }).join('')
  }

  const result = vigenere(cleanText, cleanKey, mode==='encrypt')

  useEffect(()=>{
    if(!playing)return
    const letters = cleanText.split('').filter(c=>c!==' ')
    if(animStep>=letters.length-1){setPlaying(false);return}
    timerRef.current = setTimeout(()=>setAnimStep(i=>i+1),200)
    return()=>clearTimeout(timerRef.current)
  },[playing,animStep,cleanText])

  const startAnim=()=>{setAnimStep(-1);setPlaying(false);setTimeout(()=>{setAnimStep(0);setPlaying(true)},50)}

  // Build step table
  let letterCount = 0
  const rows = cleanText.split('').map((c,i)=>{
    if(c===' ') return {c,k:' ',ci:-1,ki:-1,out:' ',idx:i}
    const ki2 = cleanKey[letterCount%cleanKey.length]
    const ci = alpha.indexOf(c)
    const ki3 = alpha.indexOf(ki2)
    const out = mode==='encrypt'?alpha[(ci+ki3+26)%26]:alpha[(ci-ki3+26)%26]
    letterCount++
    return {c,k:ki2,ci,ki:ki3,out,idx:i}
  })

  return (
    <div style={{display:'flex',flexDirection:'column',gap:16,padding:20,flex:1,overflowY:'auto'}}>
      <div style={{display:'grid',gridTemplateColumns:'2fr 1fr',gap:12}}>
        <div>
          <label style={{fontSize:10,color:C.sec,display:'block',marginBottom:4}}>Vstupní text</label>
          <input value={text} onChange={e=>setText(e.target.value)}
            style={{width:'100%',padding:'8px 12px',background:'#1a2035',color:'#fff',border:`1px solid ${C.border}`,borderRadius:8,fontSize:13,fontFamily:'monospace',boxSizing:'border-box' as const}}/>
        </div>
        <div>
          <label style={{fontSize:10,color:C.sec,display:'block',marginBottom:4}}>Klíč</label>
          <input value={key} onChange={e=>setKey(e.target.value.toUpperCase().replace(/[^A-Z]/g,''))}
            style={{width:'100%',padding:'8px 12px',background:'#1a2035',color:C.vigenere,border:`1px solid ${C.vigenere}55`,borderRadius:8,fontSize:13,fontFamily:'monospace',fontWeight:700,boxSizing:'border-box' as const}}/>
        </div>
      </div>

      <div style={{display:'flex',gap:8}}>
        {(['encrypt','decrypt'] as const).map(m=>(
          <button key={m} onClick={()=>setMode(m)}
            style={{padding:'6px 14px',background:mode===m?C.vigenere+'33':'rgba(255,255,255,.05)',color:mode===m?C.vigenere:C.sec,border:`1px solid ${mode===m?C.vigenere+'55':C.border}`,borderRadius:7,cursor:'pointer',fontFamily:'inherit',fontSize:12,fontWeight:mode===m?700:400}}>
            {m==='encrypt'?'🔒 Šifrovat':'🔓 Dešifrovat'}
          </button>
        ))}
        <button onClick={startAnim}
          style={{padding:'6px 14px',background:'rgba(59,130,246,.15)',color:C.vigenere,border:`1px solid ${C.vigenere}44`,borderRadius:7,cursor:'pointer',fontFamily:'inherit',fontSize:12}}>
          ▶ Animovat
        </button>
      </div>

      {/* Key expansion */}
      <div style={{background:'#0d1117',borderRadius:10,padding:14,border:`1px solid ${C.border}`}}>
        <div style={{fontSize:10,fontWeight:700,color:C.sec,textTransform:'uppercase',marginBottom:8}}>Opakování klíče</div>
        <div style={{display:'flex',gap:2,flexWrap:'wrap' as const}}>
          {rows.filter(r=>r.c!==' ').map((r,i)=>(
            <div key={i} style={{textAlign:'center'}}>
              <div style={{width:22,height:22,display:'flex',alignItems:'center',justifyContent:'center',borderRadius:4,background:'#1a2035',fontSize:10,color:'#94a3b8',fontFamily:'monospace'}}>{r.c}</div>
              <div style={{width:22,height:22,display:'flex',alignItems:'center',justifyContent:'center',borderRadius:4,background:C.vigenere+'22',border:`1px solid ${C.vigenere}44`,fontSize:10,color:C.vigenere,fontFamily:'monospace',fontWeight:700,marginTop:1}}>{r.k}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Vigenere square highlight */}
      <div style={{background:'#0d1117',borderRadius:10,padding:14,border:`1px solid ${C.border}`}}>
        <div style={{fontSize:10,fontWeight:700,color:C.sec,textTransform:'uppercase',marginBottom:8}}>
          Aktuální šifrování {animStep>=0&&rows[animStep]?.c!==' '?`— ${rows[animStep].c} + ${rows[animStep].k} = ${rows[animStep].out}`:''}
        </div>
        <VigenereSquare row={animStep>=0?rows[animStep].ki:-1} col={animStep>=0?rows[animStep].ci:-1} color={C.vigenere}/>
      </div>

      {/* Letter table */}
      <div style={{background:'#0d1117',borderRadius:10,padding:14,border:`1px solid ${C.border}`}}>
        <div style={{overflowX:'auto'}}>
          <div style={{display:'flex',gap:4,flexWrap:'wrap' as const}}>
            {rows.map((r,i)=>{
              const isDone = animStep>=0&&i<=animStep
              const isActive = i===animStep
              return (
                <div key={i} style={{textAlign:'center',minWidth:32}}>
                  <div style={{padding:'5px 4px',borderRadius:6,border:`1.5px solid ${isActive?C.vigenere:isDone?C.vigenere+'44':C.border}`,background:isActive?C.vigenere+'22':isDone?C.vigenere+'0d':'transparent',transition:'all .15s'}}>
                    <div style={{fontSize:14,fontWeight:800,color:isActive?'#fff':C.sec,fontFamily:'monospace'}}>{r.c}</div>
                    {r.c!==' '&&<><div style={{fontSize:9,color:C.vigenere}}>+{r.k}</div>
                    <div style={{fontSize:14,fontWeight:800,color:isActive?C.vigenere:isDone?C.vigenere:'#334155',fontFamily:'monospace'}}>{isDone||animStep<0?r.out:'?'}</div></>}
                    {r.c===' '&&<div style={{fontSize:14,color:C.sec}}>·</div>}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
        <CryptoBox label="Plaintext" value={cleanText} color={C.sec}/>
        <CryptoBox label={mode==='encrypt'?'Ciphertext':'Dešifrováno'} value={result} color={C.vigenere}/>
      </div>
    </div>
  )
}

function VigenereSquare({row,col,color}:{row:number;col:number;color:string}) {
  const alpha='ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  const show = 8 // show 8×8 portion around active cell
  const startR = row<0?0:Math.max(0,Math.min(18,row-3))
  const startC = col<0?0:Math.max(0,Math.min(18,col-3))
  return (
    <div style={{overflowX:'auto'}}>
      <table style={{borderCollapse:'collapse',fontSize:9,fontFamily:'monospace'}}>
        <thead><tr>
          <td style={{width:16}}/>
          {alpha.slice(startC,startC+show).split('').map((c,ci)=>(
            <td key={ci} style={{width:20,textAlign:'center',color:startC+ci===col?color:C.sec,fontWeight:startC+ci===col?700:400,paddingBottom:3}}>
              {c}
            </td>
          ))}
        </tr></thead>
        <tbody>
          {alpha.slice(startR,startR+show).split('').map((rc,ri)=>(
            <tr key={ri}>
              <td style={{color:startR+ri===row?color:C.sec,fontWeight:startR+ri===row?700:400,paddingRight:4}}>{rc}</td>
              {alpha.slice(startC,startC+show).split('').map((_,ci)=>{
                const letter = alpha[(startR+ri+startC+ci)%26]
                const isTarget = startR+ri===row&&startC+ci===col
                const isRow = startR+ri===row
                const isCol = startC+ci===col
                return (
                  <td key={ci} style={{
                    width:20,height:20,textAlign:'center',
                    background:isTarget?color:isRow||isCol?color+'18':'transparent',
                    color:isTarget?'#000':isRow||isCol?color:'#334155',
                    fontWeight:isTarget||isRow||isCol?700:400,
                    borderRadius:isTarget?4:0,
                  }}>{letter}</td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {row>=0&&col>=0&&<div style={{fontSize:9,color:color,marginTop:4}}>Řádek: {alpha[row]}, Sloupec: {alpha[col]} → {alpha[(row+col)%26]}</div>}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// HASH TAB
// ══════════════════════════════════════════════════════════════════════════════
// Simple hash visualisation using Web Crypto API
async function sha256hex(msg:string):Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(msg))
  return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('')
}

// Simple 32-bit djb2 hash for "MD5-like" demo
function djb2(s:string):string {
  let h=5381; for(let i=0;i<s.length;i++) h=((h<<5)+h+s.charCodeAt(i))>>>0
  return h.toString(16).padStart(8,'0').repeat(4)
}

function HashTab() {
  const [input, setInput] = useState('Ahoj světe!')
  const [sha, setSha] = useState('')
  const [md5like, setMd5like] = useState('')
  const [prevInput, setPrevInput] = useState('')
  const [prevSha, setPrevSha] = useState('')
  const [showAvalanche, setShowAvalanche] = useState(false)
  const [comparing, setComparing] = useState(false)
  const [compareInput, setCompareInput] = useState('')
  const [compareSha, setCompareSha] = useState('')

  useEffect(()=>{
    sha256hex(input).then(h=>{setSha(h)})
    setMd5like(djb2(input))
  },[input])

  const takeSnapshot = async ()=>{
    setPrevInput(input); setPrevSha(sha)
    setShowAvalanche(true)
  }

  const handleCompare = async (v:string) => {
    setCompareInput(v)
    const h = await sha256hex(v)
    setCompareSha(h)
  }

  // Bit diff
  const bitDiff = (a:string,b:string) => {
    let diff=0
    for(let i=0;i<Math.min(a.length,b.length);i++){
      const x=(parseInt(a[i],16)||0)^(parseInt(b[i],16)||0)
      diff+=x.toString(2).split('1').length-1
    }
    return diff
  }

  const diff = prevSha&&sha ? bitDiff(prevSha,sha) : 0
  const totalBits = 256
  const diffPct = Math.round(diff/totalBits*100)

  return (
    <div style={{display:'flex',flexDirection:'column',gap:16,padding:20,flex:1,overflowY:'auto'}}>
      <div>
        <label style={{fontSize:10,color:C.sec,display:'block',marginBottom:4}}>Vstupní zpráva</label>
        <textarea value={input} onChange={e=>setInput(e.target.value)} rows={3}
          style={{width:'100%',padding:'10px 12px',background:'#1a2035',color:'#fff',border:`1px solid ${C.border}`,borderRadius:8,fontSize:13,fontFamily:'monospace',resize:'vertical',boxSizing:'border-box' as const}}/>
        <div style={{fontSize:10,color:C.sec,marginTop:3}}>{input.length} znaků · {new TextEncoder().encode(input).length} bajtů</div>
      </div>

      {/* SHA-256 */}
      <div style={{background:'#0d1117',borderRadius:10,padding:14,border:`1px solid ${C.hash}33`}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
          <div style={{fontSize:11,fontWeight:700,color:C.hash}}>SHA-256 (256 bitů = 64 hex znaky)</div>
          <div style={{fontSize:10,color:C.sec}}>Kryptograficky bezpečný</div>
        </div>
        <HashDisplay hash={sha} color={C.hash}/>
      </div>

      {/* MD5-like */}
      <div style={{background:'#0d1117',borderRadius:10,padding:14,border:`1px solid rgba(245,158,11,.3)`}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
          <div style={{fontSize:11,fontWeight:700,color:'#f59e0b'}}>MD5-like (128 bitů = 32 hex znaků)</div>
          <div style={{fontSize:10,color:'#ef444488'}}>⚠ Zastaralý, nespolehlivý</div>
        </div>
        <HashDisplay hash={md5like.slice(0,32)} color="#f59e0b"/>
      </div>

      {/* Hash properties */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8}}>
        {[
          {name:'Deterministický',desc:'Stejný vstup → vždy stejný hash',icon:'🎯',ok:true},
          {name:'Jednosměrný',desc:'Z hashe nejde zpět získat zprávu',icon:'🚫',ok:true},
          {name:'Lavinový efekt',desc:'Malá změna → úplně jiný hash',icon:'🌊',ok:true},
          {name:'Fixní délka',desc:'Libovolně dlouhý vstup → 256 bitů',icon:'📏',ok:true},
          {name:'Rychlý',desc:'SHA-256: miliarda hashů za sekundu',icon:'⚡',ok:true},
          {name:'Kolize-odolný',desc:'Prakticky nemožné najít dvě kolize',icon:'🔒',ok:true},
        ].map((p,i)=>(
          <div key={i} style={{padding:'9px 10px',background:p.ok?'rgba(34,197,94,.05)':'rgba(239,68,68,.05)',border:`1px solid ${p.ok?'rgba(34,197,94,.2)':'rgba(239,68,68,.2)'}`,borderRadius:8}}>
            <div style={{fontSize:16,marginBottom:4}}>{p.icon}</div>
            <div style={{fontSize:10,fontWeight:700,color:p.ok?'#4ade80':'#f87171',marginBottom:2}}>{p.name}</div>
            <div style={{fontSize:9,color:C.sec,lineHeight:1.5}}>{p.desc}</div>
          </div>
        ))}
      </div>

      {/* Avalanche effect */}
      <div style={{background:'#0d1117',borderRadius:10,padding:14,border:`1px solid ${C.border}`}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}>
          <div style={{fontSize:11,fontWeight:700,color:'#fff'}}>🌊 Lavinový efekt</div>
          <button onClick={takeSnapshot}
            style={{padding:'4px 12px',background:C.hash+'22',color:C.hash,border:`1px solid ${C.hash}44`,borderRadius:6,cursor:'pointer',fontSize:10,fontFamily:'inherit'}}>
            📸 Ulož snapshot
          </button>
        </div>
        <p style={{fontSize:11,color:C.sec,margin:'0 0 10px',lineHeight:1.6}}>
          Ulož snapshot, pak změň jedinou hlásku ve vstupním textu. Uvidíš jak moc se hash změní.
        </p>
        {showAvalanche&&prevSha&&(
          <div>
            <div style={{marginBottom:6}}>
              <div style={{fontSize:10,color:C.sec,marginBottom:3}}>Původní: <code style={{color:'#94a3b8'}}>{prevInput.slice(0,40)}</code></div>
              <HashDisplay hash={prevSha} color="#475569"/>
            </div>
            <div style={{marginBottom:8}}>
              <div style={{fontSize:10,color:C.sec,marginBottom:3}}>Aktuální: <code style={{color:'#94a3b8'}}>{input.slice(0,40)}</code></div>
              <HashDisplay hash={sha} color={C.hash} compare={prevSha}/>
            </div>
            <div style={{padding:'8px 12px',background:diffPct>40?'rgba(34,197,94,.1)':'rgba(245,158,11,.1)',border:`1px solid ${diffPct>40?'rgba(34,197,94,.3)':'rgba(245,158,11,.3)'}`,borderRadius:8}}>
              <div style={{fontSize:12,fontWeight:700,color:diffPct>40?'#4ade80':'#fbbf24'}}>
                Změněno {diff} z {totalBits} bitů ({diffPct}%)
              </div>
              <div style={{height:8,background:'rgba(255,255,255,.08)',borderRadius:4,marginTop:6,overflow:'hidden'}}>
                <div style={{height:'100%',width:`${diffPct}%`,background:diffPct>40?'#22c55e':'#f59e0b',borderRadius:4,transition:'width .5s'}}/>
              </div>
              <div style={{fontSize:10,color:C.sec,marginTop:4}}>Dobrý hash by měl změnit ~50% bitů (lavinový efekt)</div>
            </div>
          </div>
        )}
      </div>

      {/* Use cases */}
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
        {[
          {title:'Hesla v databázi',desc:'Hesla se nikdy neukládají jako plaintext — pouze jejich hash. Při přihlášení se hash porovná.',icon:'🔐',col:'#3b82f6'},
          {title:'Integrita souborů',desc:'SHA-256 checksum ověří že stažený soubor nebyl pozměněn.',icon:'📁',col:'#22c55e'},
          {title:'Digitální podpis',desc:'Hash zprávy se podepíše soukromým klíčem — ověří autenticitu.',icon:'✍️',col:'#a855f7'},
          {title:'Blockchain',desc:'Každý blok obsahuje hash předchozího bloku — změna bloku invaliduje celý řetěz.',icon:'⛓',col:'#f59e0b'},
        ].map((u,i)=>(
          <div key={i} style={{padding:'10px 12px',background:u.col+'0d',border:`1px solid ${u.col}30`,borderRadius:9}}>
            <div style={{fontSize:16,marginBottom:4}}>{u.icon}</div>
            <div style={{fontSize:11,fontWeight:700,color:u.col,marginBottom:4}}>{u.title}</div>
            <div style={{fontSize:10,color:C.sec,lineHeight:1.6}}>{u.desc}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function HashDisplay({hash,color,compare}:{hash:string;color:string;compare?:string}) {
  if(!hash) return <div style={{fontSize:11,color:'#334155',fontFamily:'monospace'}}>Počítám…</div>
  return (
    <div style={{display:'flex',flexWrap:'wrap' as const,gap:1}}>
      {hash.split('').map((c,i)=>{
        const diff = compare&&compare[i]&&compare[i]!==c
        return (
          <span key={i} style={{
            fontSize:11,fontFamily:'monospace',fontWeight:700,
            color:diff?'#fff':color,
            background:diff?color+'66':'transparent',
            borderRadius:2,padding:'0 1px',
          }}>{c}</span>
        )
      })}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// RSA TAB
// ══════════════════════════════════════════════════════════════════════════════
// Small primes for demo
const SMALL_PRIMES = [5,7,11,13,17,19,23,29,31,37,41,43]

function gcd(a:number,b:number):number{return b===0?a:gcd(b,a%b)}
function modpow(base:number,exp:number,mod:number):number{
  let result=1; base=base%mod
  while(exp>0){if(exp%2===1)result=(result*base)%mod;exp=Math.floor(exp/2);base=(base*base)%mod}
  return result
}
function modInverse(a:number,m:number):number{
  for(let x=1;x<m;x++)if((a*x)%m===1)return x
  return -1
}

function RSATab() {
  const [p, setP] = useState(11)
  const [q, setQ] = useState(13)
  const [message, setMessage] = useState(7)
  const [step, setStep] = useState(0)
  const [animating, setAnimating] = useState(false)

  const n = p * q
  const phi = (p-1)*(q-1)
  // Find e: 1 < e < phi, gcd(e,phi)=1
  const e = SMALL_PRIMES.find(x=>x<phi&&gcd(x,phi)===1&&x!==p&&x!==q) || 3
  const d = modInverse(e, phi)
  const encrypted = d>0 ? modpow(message, e, n) : 0
  const decrypted = d>0 ? modpow(encrypted, d, n) : 0

  const STEPS = [
    {title:'Výběr prvočísel',          color:'#a855f7', desc:`Zvolíme dvě prvočísla p=${p} a q=${q}. V praxi jsou to čísla s tisíci ciframi.`},
    {title:'Výpočet n a φ(n)',          color:'#8b5cf6', desc:`n = p×q = ${p}×${q} = ${n}\nφ(n) = (p-1)×(q-1) = ${p-1}×${q-1} = ${phi}`},
    {title:'Výběr veřejného exponentu', color:'#7c3aed', desc:`Zvolíme e tak, aby 1 < e < φ(n) a gcd(e,φ(n))=1.\ne=${e}, gcd(${e},${phi})=${gcd(e,phi)} ✓\nVerejný klíč: (e=${e}, n=${n})`},
    {title:'Soukromý klíč d',           color:'#6d28d9', desc:`d = e⁻¹ mod φ(n)\nd×${e} ≡ 1 (mod ${phi})\nd = ${d}\nSoukromý klíč: (d=${d}, n=${n})`},
    {title:'Šifrování zprávy',          color:'#3b82f6', desc:`Zpráva m=${message}\nc = mᵉ mod n = ${message}^${e} mod ${n} = ${encrypted}\nSzšifrováno: c=${encrypted}`},
    {title:'Dešifrování',               color:'#22c55e', desc:`c=${encrypted}\nm = cᵈ mod n = ${encrypted}^${d} mod ${n} = ${decrypted}\nDešifrováno: m=${decrypted} ${decrypted===message?'✓ Správně!':'✗'}`},
  ]

  const goStep=(s:number)=>setStep(Math.max(0,Math.min(STEPS.length-1,s)))

  return (
    <div style={{display:'flex',flexDirection:'column',gap:16,padding:20,flex:1,overflowY:'auto'}}>
      {/* Parameter pickers */}
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:12}}>
        <div>
          <label style={{fontSize:10,color:C.sec,display:'block',marginBottom:4}}>p (prvočíslo)</label>
          <select value={p} onChange={e=>setP(+e.target.value)}
            style={{width:'100%',padding:'7px 10px',background:'#1a2035',color:C.rsa,border:`1px solid ${C.rsa}44`,borderRadius:7,fontSize:14,fontWeight:700,fontFamily:'monospace',cursor:'pointer'}}>
            {SMALL_PRIMES.map(x=><option key={x} value={x}>{x}</option>)}
          </select>
        </div>
        <div>
          <label style={{fontSize:10,color:C.sec,display:'block',marginBottom:4}}>q (prvočíslo ≠ p)</label>
          <select value={q} onChange={e=>setQ(+e.target.value)}
            style={{width:'100%',padding:'7px 10px',background:'#1a2035',color:C.rsa,border:`1px solid ${C.rsa}44`,borderRadius:7,fontSize:14,fontWeight:700,fontFamily:'monospace',cursor:'pointer'}}>
            {SMALL_PRIMES.filter(x=>x!==p).map(x=><option key={x} value={x}>{x}</option>)}
          </select>
        </div>
        <div>
          <label style={{fontSize:10,color:C.sec,display:'block',marginBottom:4}}>Zpráva m (číslo)</label>
          <input type="number" min={2} max={Math.min(n-1,20)} value={message}
            onChange={e=>setMessage(Math.max(2,Math.min(n-1,+e.target.value)))}
            style={{width:'100%',padding:'7px 10px',background:'#1a2035',color:'#fff',border:`1px solid ${C.border}`,borderRadius:7,fontSize:14,fontFamily:'monospace',boxSizing:'border-box' as const}}/>
        </div>
      </div>

      {/* Key summary */}
      {d>0&&<div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
        <div style={{padding:'10px 14px',background:'rgba(168,85,247,.08)',border:'1px solid rgba(168,85,247,.25)',borderRadius:10}}>
          <div style={{fontSize:10,fontWeight:700,color:C.rsa,marginBottom:6}}>🔑 Veřejný klíč (sdílet)</div>
          <div style={{fontFamily:'monospace',fontSize:13,color:'#e2e8f0'}}>e = {e}</div>
          <div style={{fontFamily:'monospace',fontSize:13,color:'#e2e8f0'}}>n = {n}</div>
          <div style={{fontSize:9,color:C.sec,marginTop:4}}>Kdokoliv může šifrovat</div>
        </div>
        <div style={{padding:'10px 14px',background:'rgba(239,68,68,.08)',border:'1px solid rgba(239,68,68,.25)',borderRadius:10}}>
          <div style={{fontSize:10,fontWeight:700,color:'#f87171',marginBottom:6}}>🔐 Soukromý klíč (tajný!)</div>
          <div style={{fontFamily:'monospace',fontSize:13,color:'#e2e8f0'}}>d = {d}</div>
          <div style={{fontFamily:'monospace',fontSize:13,color:'#e2e8f0'}}>n = {n}</div>
          <div style={{fontSize:9,color:C.sec,marginTop:4}}>Pouze příjemce může dešifrovat</div>
        </div>
      </div>}

      {/* Steps stepper */}
      <div>
        <div style={{display:'flex',gap:4,marginBottom:12}}>
          {STEPS.map((s,i)=>(
            <button key={i} onClick={()=>goStep(i)}
              style={{flex:1,padding:'6px 4px',background:step===i?s.color+'33':step>i?'rgba(255,255,255,.05)':'transparent',border:`1px solid ${step===i?s.color+'55':C.border}`,borderRadius:7,cursor:'pointer',fontFamily:'inherit',display:'flex',flexDirection:'column',alignItems:'center',gap:3}}>
              <div style={{width:18,height:18,borderRadius:'50%',background:step>=i?STEPS[i].color:C.sec+'33',display:'flex',alignItems:'center',justifyContent:'center',fontSize:9,fontWeight:700,color:'#fff'}}>{step>i?'✓':i+1}</div>
            </button>
          ))}
        </div>
        <div style={{background:'#0d1117',borderRadius:10,padding:16,border:`1px solid ${STEPS[step].color}44`,minHeight:100}}>
          <div style={{fontSize:12,fontWeight:800,color:STEPS[step].color,marginBottom:8}}>{STEPS[step].title}</div>
          <pre style={{fontSize:12,color:'#e2e8f0',fontFamily:'monospace',lineHeight:1.8,margin:0,whiteSpace:'pre-wrap' as const}}>{STEPS[step].desc}</pre>
        </div>
        <div style={{display:'flex',gap:8,marginTop:8}}>
          <button onClick={()=>goStep(step-1)} disabled={step===0}
            style={{padding:'5px 14px',background:'rgba(255,255,255,.07)',color:step===0?'#334155':'#fff',border:`1px solid ${C.border}`,borderRadius:7,cursor:step===0?'not-allowed':'pointer',fontSize:12,fontFamily:'inherit'}}>
            ← Zpět
          </button>
          <button onClick={()=>goStep(step+1)} disabled={step===STEPS.length-1}
            style={{padding:'5px 14px',background:STEPS[step].color,color:'#fff',border:'none',borderRadius:7,cursor:step===STEPS.length-1?'not-allowed':'pointer',fontSize:12,fontWeight:700,fontFamily:'inherit'}}>
            Další →
          </button>
          <button onClick={()=>setStep(0)}
            style={{padding:'5px 12px',background:'rgba(255,255,255,.07)',color:C.sec,border:`1px solid ${C.border}`,borderRadius:7,cursor:'pointer',fontSize:11,fontFamily:'inherit'}}>
            ↺ Reset
          </button>
        </div>
      </div>

      {/* Visual encryption flow */}
      {d>0&&<div style={{background:'#0d1117',borderRadius:10,padding:14,border:`1px solid ${C.border}`}}>
        <div style={{fontSize:10,fontWeight:700,color:C.sec,textTransform:'uppercase',marginBottom:12}}>Tok šifrování</div>
        <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap' as const}}>
          <div style={{textAlign:'center'}}>
            <div style={{fontSize:22,marginBottom:4}}>👤</div>
            <div style={{fontSize:10,color:C.sec}}>Odesílatel</div>
          </div>
          <div style={{flex:1,textAlign:'center'}}>
            <div style={{padding:'6px 12px',background:'rgba(168,85,247,.1)',border:'1px solid rgba(168,85,247,.3)',borderRadius:8,fontFamily:'monospace',fontSize:13}}>m = {message}</div>
            <div style={{fontSize:9,color:C.sec,marginTop:2}}>zpráva</div>
          </div>
          <div style={{textAlign:'center'}}>
            <div style={{fontSize:11,color:C.rsa,fontFamily:'monospace'}}>c = m^e mod n</div>
            <div style={{fontSize:10,color:C.sec}}>veřejný klíč (e,n)</div>
            <div style={{fontSize:13}}>→</div>
          </div>
          <div style={{flex:1,textAlign:'center'}}>
            <div style={{padding:'6px 12px',background:'rgba(239,68,68,.1)',border:'1px solid rgba(239,68,68,.3)',borderRadius:8,fontFamily:'monospace',fontSize:13}}>c = {encrypted}</div>
            <div style={{fontSize:9,color:C.sec,marginTop:2}}>šifrovaná zpráva</div>
          </div>
          <div style={{textAlign:'center'}}>
            <div style={{fontSize:11,color:'#22c55e',fontFamily:'monospace'}}>m = c^d mod n</div>
            <div style={{fontSize:10,color:C.sec}}>soukromý klíč (d,n)</div>
            <div style={{fontSize:13}}>→</div>
          </div>
          <div style={{flex:1,textAlign:'center'}}>
            <div style={{padding:'6px 12px',background:'rgba(34,197,94,.1)',border:'1px solid rgba(34,197,94,.3)',borderRadius:8,fontFamily:'monospace',fontSize:13}}>m = {decrypted}</div>
            <div style={{fontSize:9,color:decrypted===message?'#4ade80':C.sec,marginTop:2}}>{decrypted===message?'✓ Dešifrováno':'✗ Chyba'}</div>
          </div>
          <div style={{textAlign:'center'}}>
            <div style={{fontSize:22,marginBottom:4}}>👤</div>
            <div style={{fontSize:10,color:C.sec}}>Příjemce</div>
          </div>
        </div>
      </div>}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// SYMMETRIC (AES visual) TAB
// ══════════════════════════════════════════════════════════════════════════════
function SymmetricTab() {
  const [text, setText] = useState('TAJNÁ ZPRÁVA')
  const [key2, setKey2] = useState('MOJEKLÍČ')
  const [step2, setStep2] = useState(0)
  const [showXOR, setShowXOR] = useState(false)

  // Very simplified AES-like demo using XOR
  const toBytes=(s:string)=>Array.from(s).map(c=>c.charCodeAt(0))
  const fromBytes=(b:number[])=>b.map(x=>String.fromCharCode(x&127)).join('')
  const xorEncrypt=(msg:string,k:string)=>{
    const mb=toBytes(msg),kb=toBytes(k)
    return mb.map((b,i)=>b^kb[i%kb.length])
  }

  const msgBytes=toBytes(text.toUpperCase())
  const keyBytes=toBytes(key2.toUpperCase())
  const encBytes=xorEncrypt(text.toUpperCase(),key2.toUpperCase())
  const decBytes=xorEncrypt(encBytes.map(b=>String.fromCharCode(b)).join(''),key2.toUpperCase()).map(b=>b&127)

  const AES_STEPS=[
    {title:'1. Key Expansion',    color:C.sym,   desc:'AES expanduje 128-bitový klíč na 11 rundových klíčů (Key Schedule). Každá runda používá jiný odvozeníklíč.'},
    {title:'2. AddRoundKey',      color:'#06b6d4',desc:'XOR každého bajtu bloku s rundovým klíčem. Přidá "tajemství" klíče do dat.'},
    {title:'3. SubBytes',         color:'#3b82f6',desc:'Každý bajt se nahradí hodnotou z S-Box tabulky (substituční tabulka 16×16). Nelineární operace.'},
    {title:'4. ShiftRows',        color:'#a855f7',desc:'Řádky 4×4 matice se rotují doleva: řádek 0 o 0, řádek 1 o 1, řádek 2 o 2, řádek 3 o 3 pozice.'},
    {title:'5. MixColumns',       color:'#f59e0b',desc:'Každý sloupec 4×4 matice se násobí fixní maticí v GF(2⁸). Diffúze — šíří vliv každého bajtu.'},
    {title:'6. Opakuj 10×',       color:C.sym,   desc:'Kroky 2–5 se opakují 10 rundami (AES-128). Poslední runda vynechá MixColumns. Výsledek = ciphertext.'},
  ]

  return (
    <div style={{display:'flex',flexDirection:'column',gap:16,padding:20,flex:1,overflowY:'auto'}}>
      <div style={{display:'grid',gridTemplateColumns:'2fr 1fr',gap:12}}>
        <div>
          <label style={{fontSize:10,color:C.sec,display:'block',marginBottom:4}}>Zpráva (plaintext)</label>
          <input value={text} onChange={e=>setText(e.target.value.toUpperCase())}
            style={{width:'100%',padding:'8px 12px',background:'#1a2035',color:'#fff',border:`1px solid ${C.border}`,borderRadius:8,fontSize:13,fontFamily:'monospace',boxSizing:'border-box' as const}}/>
        </div>
        <div>
          <label style={{fontSize:10,color:C.sec,display:'block',marginBottom:4}}>Klíč (sdílený tajný)</label>
          <input value={key2} onChange={e=>setKey2(e.target.value.toUpperCase())}
            style={{width:'100%',padding:'8px 12px',background:'#1a2035',color:C.sym,border:`1px solid ${C.sym}44`,borderRadius:8,fontSize:13,fontFamily:'monospace',fontWeight:700,boxSizing:'border-box' as const}}/>
        </div>
      </div>

      {/* XOR demo */}
      <div style={{background:'#0d1117',borderRadius:10,padding:14,border:`1px solid ${C.sym}33`}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}>
          <div style={{fontSize:11,fontWeight:700,color:C.sym}}>XOR šifrování (zjednodušená ukázka)</div>
          <button onClick={()=>setShowXOR(p=>!p)}
            style={{padding:'3px 10px',background:'rgba(34,197,94,.1)',color:C.sym,border:`1px solid ${C.sym}44`,borderRadius:6,cursor:'pointer',fontSize:10,fontFamily:'inherit'}}>
            {showXOR?'Skrýt':'Zobrazit bity'}
          </button>
        </div>

        {/* Byte visualization */}
        <div style={{overflowX:'auto'}}>
          <div style={{display:'flex',flexDirection:'column',gap:4,minWidth:'max-content'}}>
            <ByteRow label="Zpráva  " bytes={msgBytes.slice(0,8)} color="#94a3b8" showBits={showXOR}/>
            <ByteRow label="Klíč    " bytes={keyBytes.slice(0,8)} color={C.sym} showBits={showXOR}/>
            <div style={{borderTop:`1px solid ${C.border}`,margin:'2px 0'}}/>
            <ByteRow label="XOR ⊕   " bytes={encBytes.slice(0,8)} color={C.sym} showBits={showXOR}/>
          </div>
        </div>

        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginTop:12}}>
          <CryptoBox label="Šifrovaná zpráva (hex)" value={encBytes.map(b=>b.toString(16).padStart(2,'0')).join(' ')} color={C.sym}/>
          <CryptoBox label="Dešifrováno" value={fromBytes(decBytes)} color="#4ade80"/>
        </div>
      </div>

      {/* AES pipeline */}
      <div>
        <div style={{fontSize:11,fontWeight:700,color:'#fff',marginBottom:10}}>🔄 AES-128 Pipeline (10 rund)</div>
        <div style={{display:'flex',gap:4,marginBottom:10,overflowX:'auto'}}>
          {AES_STEPS.map((s,i)=>(
            <button key={i} onClick={()=>setStep2(i)}
              style={{flexShrink:0,padding:'5px 8px',background:step2===i?s.color+'33':step2>i?'rgba(255,255,255,.05)':'transparent',border:`1px solid ${step2===i?s.color+'55':C.border}`,borderRadius:7,cursor:'pointer',fontFamily:'inherit',fontSize:9,color:step2===i?s.color:C.sec,fontWeight:step2===i?700:400,textAlign:'center',minWidth:60}}>
              {step2>i?'✓ ':''}
              {s.title.split('.')[1]?.trim()||s.title}
            </button>
          ))}
        </div>
        <div style={{background:'#0d1117',borderRadius:10,padding:14,border:`1px solid ${AES_STEPS[step2].color}44`}}>
          <div style={{fontSize:12,fontWeight:800,color:AES_STEPS[step2].color,marginBottom:6}}>{AES_STEPS[step2].title}</div>
          <div style={{fontSize:12,color:'#e2e8f0',lineHeight:1.7}}>{AES_STEPS[step2].desc}</div>
          {step2===2&&<AESSBox/>}
          {step2===3&&<AESShiftRows/>}
        </div>
        <div style={{display:'flex',gap:8,marginTop:8}}>
          <button onClick={()=>setStep2(s=>Math.max(0,s-1))} disabled={step2===0}
            style={{padding:'5px 12px',background:'rgba(255,255,255,.07)',color:step2===0?'#334155':'#fff',border:`1px solid ${C.border}`,borderRadius:7,cursor:'pointer',fontSize:12,fontFamily:'inherit'}}>
            ← Zpět
          </button>
          <button onClick={()=>setStep2(s=>Math.min(AES_STEPS.length-1,s+1))} disabled={step2===AES_STEPS.length-1}
            style={{padding:'5px 14px',background:AES_STEPS[step2].color,color:'#fff',border:'none',borderRadius:7,cursor:'pointer',fontSize:12,fontWeight:700,fontFamily:'inherit'}}>
            Další →
          </button>
        </div>
      </div>

      {/* Symmetric vs Asymmetric comparison */}
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
        <div style={{padding:'10px 12px',background:'rgba(34,197,94,.06)',border:'1px solid rgba(34,197,94,.2)',borderRadius:9}}>
          <div style={{fontSize:11,fontWeight:700,color:C.sym,marginBottom:6}}>🔒 Symetrické (AES)</div>
          {['Jeden sdílený klíč','Velmi rychlé','AES-256: ~1 GB/s','Problém: jak klíč sdílet?','Použití: šifrování dat'].map((t,i)=>(
            <div key={i} style={{fontSize:10,color:'#86efac',marginBottom:2}}>• {t}</div>
          ))}
        </div>
        <div style={{padding:'10px 12px',background:'rgba(168,85,247,.06)',border:'1px solid rgba(168,85,247,.2)',borderRadius:9}}>
          <div style={{fontSize:11,fontWeight:700,color:C.rsa,marginBottom:6}}>🏛 Asymetrické (RSA)</div>
          {['Veřejný + soukromý klíč','Pomalé (~1000× pomalejší)','RSA-4096: ~100 KB/s','Řeší sdílení klíčů','Použití: výměna klíčů'].map((t,i)=>(
            <div key={i} style={{fontSize:10,color:'#c4b5fd',marginBottom:2}}>• {t}</div>
          ))}
        </div>
      </div>

      {/* HTTPS hybrid */}
      <div style={{padding:'10px 14px',background:'rgba(6,182,212,.06)',border:'1px solid rgba(6,182,212,.2)',borderRadius:9}}>
        <div style={{fontSize:11,fontWeight:700,color:'#22d3ee',marginBottom:6}}>🌐 HTTPS = RSA + AES dohromady</div>
        <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap' as const}}>
          {['RSA: výměna klíčů →','AES klíč se bezpečně přenese →','AES: šifrování dat'].map((t,i)=>(
            <div key={i} style={{padding:'4px 10px',background:'rgba(6,182,212,.1)',border:'1px solid rgba(6,182,212,.25)',borderRadius:6,fontSize:10,color:'#67e8f9'}}>{t}</div>
          ))}
        </div>
        <div style={{fontSize:10,color:C.sec,marginTop:6}}>TLS Handshake použije RSA (nebo ECDH) pro bezpečný přenos AES klíče. Pak vše šifruje rychlým AES.</div>
      </div>
    </div>
  )
}

function ByteRow({label,bytes,color,showBits}:{label:string;bytes:number[];color:string;showBits:boolean}){
  return (
    <div style={{display:'flex',alignItems:'center',gap:4}}>
      <span style={{fontSize:9,color:C.sec,fontFamily:'monospace',width:60,flexShrink:0}}>{label}</span>
      {bytes.map((b,i)=>(
        <div key={i} style={{textAlign:'center'}}>
          {showBits
            ?<div style={{display:'flex',gap:0}}>
              {b.toString(2).padStart(8,'0').split('').map((bit,bi)=>(
                <div key={bi} style={{width:8,height:16,background:bit==='1'?color+'cc':'transparent',border:`1px solid ${color}33`,fontSize:6,color:bit==='1'?'#000':color,display:'flex',alignItems:'center',justifyContent:'center'}}>{bit}</div>
              ))}
            </div>
            :<div style={{width:28,padding:'3px 4px',background:color+'22',border:`1px solid ${color}44`,borderRadius:4,fontFamily:'monospace',fontSize:10,color,textAlign:'center'}}>
              {b.toString(16).padStart(2,'0')}
            </div>
          }
        </div>
      ))}
    </div>
  )
}

function AESSBox(){
  // First 8×8 of the actual AES S-Box
  const sbox=[0x63,0x7c,0x77,0x7b,0xf2,0x6b,0x6f,0xc5,0x30,0x01,0x67,0x2b,0xfe,0xd7,0xab,0x76,0xca,0x82,0xc9,0x7d,0xfa,0x59,0x47,0xf0,0xad,0xd4,0xa2,0xaf,0x9c,0xa4,0x72,0xc0]
  return (
    <div style={{marginTop:10,overflowX:'auto'}}>
      <div style={{fontSize:9,color:C.sec,marginBottom:6}}>Ukázka S-Box (nelineární substituční tabulka):</div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(16,1fr)',gap:1,maxWidth:320}}>
        {sbox.map((v,i)=>(
          <div key={i} style={{width:18,height:18,display:'flex',alignItems:'center',justifyContent:'center',background:'#1a2035',borderRadius:2,fontSize:7,fontFamily:'monospace',color:'#60a5fa'}}>
            {v.toString(16).padStart(2,'0')}
          </div>
        ))}
      </div>
    </div>
  )
}

function AESShiftRows(){
  const rows=[['a0','a1','a2','a3'],['a4','a5','a6','a7'],['a8','a9','aa','ab'],['ac','ad','ae','af']]
  const shifted=rows.map((r,ri)=>[...r.slice(ri),...r.slice(0,ri)])
  return (
    <div style={{marginTop:10,display:'flex',gap:24,alignItems:'flex-start'}}>
      {[{label:'Před',data:rows,col:'#475569'},{label:'Po',data:shifted,col:'#a855f7'}].map(({label,data,col})=>(
        <div key={label}>
          <div style={{fontSize:9,color:C.sec,marginBottom:4}}>{label}:</div>
          {data.map((row,ri)=>(
            <div key={ri} style={{display:'flex',gap:2,marginBottom:2}}>
              {row.map((cell,ci)=>(
                <div key={ci} style={{width:26,height:22,display:'flex',alignItems:'center',justifyContent:'center',background:col+'22',border:`1px solid ${col}44`,borderRadius:3,fontFamily:'monospace',fontSize:9,color:col}}>
                  {cell}
                </div>
              ))}
              {label==='Po'&&ri>0&&<span style={{fontSize:9,color:C.sec,marginLeft:4}}>←{ri}</span>}
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// SHARED HELPERS
// ══════════════════════════════════════════════════════════════════════════════
function CryptoBox({label,value,color}:{label:string;value:string;color:string}){
  return (
    <div style={{padding:'10px 12px',background:'#0d1117',border:`1px solid ${color}33`,borderRadius:9}}>
      <div style={{fontSize:9,fontWeight:700,color,textTransform:'uppercase',letterSpacing:'.06em',marginBottom:5}}>{label}</div>
      <div style={{fontFamily:'monospace',fontSize:13,color:'#e2e8f0',wordBreak:'break-all' as const,lineHeight:1.5}}>{value||'—'}</div>
    </div>
  )
}

function FreqAnalysis({plain,cipher,color}:{plain:string;cipher:string;color:string}){
  const freq=(s:string)=>{
    const f:Record<string,number>={}
    s.split('').filter(c=>c!==' ').forEach(c=>f[c]=(f[c]||0)+1)
    return Object.entries(f).sort((a,b)=>b[1]-a[1]).slice(0,8)
  }
  const pf=freq(plain), cf=freq(cipher)
  const maxP=Math.max(...pf.map(x=>x[1]),1), maxC=Math.max(...cf.map(x=>x[1]),1)
  return (
    <div style={{background:'#0d1117',borderRadius:10,padding:14,border:`1px solid ${C.border}`}}>
      <div style={{fontSize:10,fontWeight:700,color:C.sec,textTransform:'uppercase',marginBottom:10}}>📊 Frekvenční analýza</div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
        {[{label:'Plaintext',freqs:pf,max:maxP,col:'#94a3b8'},{label:'Ciphertext',freqs:cf,max:maxC,col:color}].map(({label,freqs,max,col})=>(
          <div key={label}>
            <div style={{fontSize:9,color:C.sec,marginBottom:6}}>{label}</div>
            {freqs.map(([ch,cnt])=>(
              <div key={ch} style={{display:'flex',alignItems:'center',gap:5,marginBottom:3}}>
                <span style={{fontFamily:'monospace',fontSize:10,color:col,width:14}}>{ch}</span>
                <div style={{flex:1,height:8,background:'rgba(255,255,255,.05)',borderRadius:2,overflow:'hidden'}}>
                  <div style={{height:'100%',width:`${cnt/max*100}%`,background:col,borderRadius:2,transition:'width .3s'}}/>
                </div>
                <span style={{fontSize:9,color:C.sec,minWidth:16}}>{cnt}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
      <div style={{fontSize:10,color:'#f59e0b',marginTop:8,padding:'6px 8px',background:'rgba(245,158,11,.05)',border:'1px solid rgba(245,158,11,.15)',borderRadius:6}}>
        💡 Caesar šifra zachovává frekvence písmen — útočník může pomocí frekvenční analýzy prolomit šifru bez znalosti klíče!
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN
// ══════════════════════════════════════════════════════════════════════════════
const INFO_PANEL: Record<Tab,{desc:string;props:{k:string;v:string}[];tip:string;usedIn:string}> = {
  caesar: {
    desc:'Nejstarší šifra (použita Juliem Caesarem). Každé písmeno se posune o pevný počet míst v abecedě.',
    props:[{k:'Typ',v:'Substituční'},{k:'Klíč',v:'Posun 1–25'},{k:'Bezpečnost',v:'⚠ Velmi nízká'},{k:'Klíčový prostor',v:'25 možností'}],
    tip:'💡 Prolomení: stačí zkusit všech 25 posunů (brute force) nebo frekvenční analýza. "E" je nejčastější písmeno v angličtině.',
    usedIn:'Výuka kryptografie, jednoduché hádanky.'
  },
  vigenere:{
    desc:'Polyalfabetická šifra využívající klíčové slovo. Každé písmeno se posouvá o různý posun podle klíče.',
    props:[{k:'Typ',v:'Polyalfabetická'},{k:'Klíč',v:'Klíčové slovo'},{k:'Bezpečnost',v:'⚠ Nízká'},{k:'Prolomení',v:'Kasiskiho test'}],
    tip:'💡 Bezpečnější než Caesar, ale stále prolomitelná — délka klíče se dá zjistit analýzou opakujících se vzorů (Kasiski).',
    usedIn:'Historická komunikace, výuka kryptografie.'
  },
  hash:{
    desc:'Hashovací funkce transformuje libovolně dlouhý vstup na fixně dlouhý výstup (otisk). Proces je jednosměrný.',
    props:[{k:'SHA-256',v:'256 bitů'},{k:'MD5',v:'128 bitů (zastaralý)'},{k:'Jednosměrný',v:'✓ Ano'},{k:'Kolize',v:'Prakticky nemožné'}],
    tip:'💡 SHA-256 je základem Bitcoinu. Těžení = hledání vstupu jehož hash začíná N nulami.',
    usedIn:'Hesla, integrita souborů, blockchain, digitální podpisy.'
  },
  rsa:{
    desc:'Asymetrická šifra postavená na faktorizaci velkých čísel. Veřejný klíč šifruje, soukromý dešifruje.',
    props:[{k:'Typ',v:'Asymetrická'},{k:'Klíče',v:'Veřejný + soukromý'},{k:'Bezpečnost',v:'✓ Vysoká'},{k:'Rychlost',v:'Pomalý'}],
    tip:'💡 Bezpečnost RSA závisí na obtížnosti faktorizace n=p×q. Kvantové počítače by ji mohly prolomit!',
    usedIn:'HTTPS/TLS, šifrování e-mailů (PGP), digitální podpisy.'
  },
  symmetric:{
    desc:'AES (Advanced Encryption Standard) je symetrická bloková šifra. Jeden sdílený klíč pro šifrování i dešifrování.',
    props:[{k:'AES-128',v:'10 rund'},{k:'AES-256',v:'14 rund'},{k:'Blok',v:'128 bitů'},{k:'Rychlost',v:'~1 GB/s'}],
    tip:'💡 AES je standardem USA NIST od 2001. Používá ho WiFi (WPA2), HTTPS, šifrování disků (BitLocker) a prakticky vše.',
    usedIn:'WiFi (WPA2/3), HTTPS, TLS, šifrování disků, VPN.'
  }
}

export default function CryptoSim({ accentColor }:{ accentColor:string }) {
  const [tab,setTab]=useState<Tab>('caesar')
  const info=TAB_INFO[tab]
  const panel=INFO_PANEL[tab]

  return (
    <div style={{display:'flex',flexDirection:'column',height:'100%',background:C.bg,color:C.txt,fontFamily:'inherit',overflow:'hidden'}}>
      <style>{`@keyframes fadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}.fi{animation:fadeIn .3s ease} textarea,input,select{outline:none}`}</style>

      {/* Header */}
      <div style={{padding:'10px 20px',borderBottom:`1px solid ${C.border}`,display:'flex',alignItems:'center',gap:12,flexShrink:0,background:C.card}}>
        <a href="/student/simulations" style={{color:C.sec,fontSize:13,textDecoration:'none'}}>← Simulace</a>
        <div style={{width:1,height:14,background:C.border}}/>
        <span style={{fontSize:14,fontWeight:700}}>🔐 Kryptografie — interaktivní ukázky</span>
      </div>

      {/* Tab bar */}
      <div style={{display:'flex',borderBottom:`1px solid ${C.border}`,flexShrink:0,background:C.card,overflowX:'auto'}}>
        {(Object.entries(TAB_INFO) as [Tab,typeof TAB_INFO[Tab]][]).map(([id,ti])=>(
          <button key={id} onClick={()=>setTab(id)}
            style={{flexShrink:0,padding:'10px 14px',background:'transparent',border:'none',borderBottom:`3px solid ${tab===id?ti.color:'transparent'}`,cursor:'pointer',fontFamily:'inherit',display:'flex',flexDirection:'column',alignItems:'center',gap:3,transition:'border-color .2s',minWidth:100}}>
            <span style={{fontSize:20}}>{ti.icon}</span>
            <span style={{fontSize:11,fontWeight:700,color:tab===id?ti.color:C.sec,whiteSpace:'nowrap'}}>{ti.title}</span>
            <span style={{fontSize:9,color:'#475569',whiteSpace:'nowrap'}}>{ti.sub}</span>
          </button>
        ))}
      </div>

      {/* Main */}
      <div style={{flex:1,display:'flex',minHeight:0,overflow:'hidden'}}>
        {/* Content */}
        <div style={{flex:1,overflow:'hidden',display:'flex',flexDirection:'column'}}>
          <div key={tab} className="fi" style={{flex:1,overflowY:'auto',display:'flex',flexDirection:'column'}}>
            {tab==='caesar'    && <CaesarTab/>}
            {tab==='vigenere'  && <VigenereTab/>}
            {tab==='hash'      && <HashTab/>}
            {tab==='rsa'       && <RSATab/>}
            {tab==='symmetric' && <SymmetricTab/>}
          </div>
        </div>

        {/* Right info panel */}
        <div style={{width:260,flexShrink:0,borderLeft:`1px solid ${C.border}`,display:'flex',flexDirection:'column',overflow:'hidden',background:C.card}}>
          <div style={{flex:1,overflowY:'auto',padding:14}}>
            <div key={tab} className="fi">
              <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:12}}>
                <div style={{width:36,height:36,borderRadius:9,background:info.color+'22',border:`1px solid ${info.color}44`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:20}}>{info.icon}</div>
                <div>
                  <div style={{fontSize:13,fontWeight:800,color:'#fff'}}>{info.title}</div>
                  <div style={{fontSize:10,color:info.color,fontWeight:600}}>{info.sub}</div>
                </div>
              </div>

              <p style={{fontSize:11.5,color:'#cbd5e1',lineHeight:1.75,margin:'0 0 12px'}}>{panel.desc}</p>

              {/* Properties */}
              <div style={{marginBottom:12}}>
                <div style={{fontSize:9,fontWeight:700,color:C.sec,textTransform:'uppercase',letterSpacing:'.06em',marginBottom:6}}>Vlastnosti</div>
                <table style={{width:'100%',borderCollapse:'collapse' as const}}>
                  <tbody>
                    {panel.props.map((p,i)=>(
                      <tr key={i} style={{borderBottom:`1px solid ${C.border}`}}>
                        <td style={{padding:'4px 6px',fontSize:10,color:C.sec}}>{p.k}</td>
                        <td style={{padding:'4px 6px',fontSize:10,color:'#e2e8f0',fontWeight:600,textAlign:'right' as const}}>{p.v}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div style={{padding:'8px 10px',background:'rgba(251,191,36,.05)',border:'1px solid rgba(251,191,36,.15)',borderRadius:8,marginBottom:12}}>
                <p style={{fontSize:11,color:'#fcd34d',margin:0,lineHeight:1.65}}>{panel.tip}</p>
              </div>

              <div style={{padding:'8px 10px',background:info.color+'0d',border:`1px solid ${info.color}25`,borderRadius:8,marginBottom:14}}>
                <div style={{fontSize:9,fontWeight:700,color:info.color,textTransform:'uppercase',marginBottom:4}}>Použití</div>
                <div style={{fontSize:11,color:'#94a3b8',lineHeight:1.6}}>{panel.usedIn}</div>
              </div>

              {/* Navigation */}
              <div style={{borderTop:`1px solid ${C.border}`,paddingTop:12}}>
                <div style={{fontSize:9,fontWeight:700,color:C.sec,textTransform:'uppercase',marginBottom:8}}>Témata</div>
                {(Object.entries(TAB_INFO) as [Tab,typeof TAB_INFO[Tab]][]).map(([id,ti])=>(
                  <button key={id} onClick={()=>setTab(id)}
                    style={{display:'flex',alignItems:'center',gap:8,width:'100%',padding:'6px 8px',background:tab===id?ti.color+'12':'transparent',border:`1px solid ${tab===id?ti.color+'30':C.border}`,borderRadius:7,cursor:'pointer',fontFamily:'inherit',marginBottom:4,textAlign:'left' as const}}>
                    <span style={{fontSize:14}}>{ti.icon}</span>
                    <div>
                      <div style={{fontSize:11,fontWeight:600,color:tab===id?ti.color:'#94a3b8'}}>{ti.title}</div>
                      <div style={{fontSize:9,color:'#475569'}}>{ti.sub}</div>
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
