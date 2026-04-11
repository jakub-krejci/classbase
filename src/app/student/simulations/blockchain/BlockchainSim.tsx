'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useRef, useCallback } from 'react'

// ─── Colors ───────────────────────────────────────────────────────────────────
const C = {
  bg:'#090B10', card:'#11141D', border:'rgba(255,255,255,0.07)',
  txt:'#fff', sec:'#8892a4',
  gold:'#f59e0b', green:'#22c55e', red:'#ef4444', blue:'#3b82f6', purple:'#a855f7',
}

type Tab = 'chain' | 'mining' | 'tamper' | 'consensus' | 'transactions'

const TAB_INFO: Record<Tab,{icon:string;title:string;sub:string;color:string}> = {
  chain:        { icon:'⛓',  title:'Blockchain',      sub:'Řetěz bloků',          color:C.gold   },
  mining:       { icon:'⛏',  title:'Mining',           sub:'Proof of Work',        color:C.blue   },
  tamper:       { icon:'🔨',  title:'Manipulace',       sub:'Proč nelze podvádět',  color:C.red    },
  consensus:    { icon:'🤝',  title:'Konsenzus',        sub:'Distribuovaná síť',    color:C.green  },
  transactions: { icon:'💸',  title:'Transakce',        sub:'UTXO model',           color:C.purple },
}

// ─── Hash helpers (deterministic for demo) ───────────────────────────────────
function simpleHash(input: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = (Math.imul(h, 0x01000193)) >>> 0
  }
  // Extend to 64 hex chars
  let result = ''
  let seed = h
  for (let i = 0; i < 8; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    result += seed.toString(16).padStart(8, '0')
  }
  return result
}

function blockHash(index: number, prevHash: string, data: string, nonce: number): string {
  return simpleHash(`${index}${prevHash}${data}${nonce}`)
}

function meetsTarget(hash: string, difficulty: number): boolean {
  return hash.startsWith('0'.repeat(difficulty))
}

// ─── Block type ───────────────────────────────────────────────────────────────
interface Block {
  index: number
  data: string
  prevHash: string
  hash: string
  nonce: number
  timestamp: string
  valid: boolean
}

function makeGenesisBlock(): Block {
  const data = 'Genesis Block'
  const hash = blockHash(0, '0000000000000000', data, 0)
  return { index: 0, data, prevHash: '0000000000000000', hash, nonce: 0, timestamp: '2024-01-01 00:00:00', valid: true }
}

function mineBlock(index: number, prevHash: string, data: string, difficulty: number): Block {
  let nonce = 0
  let hash = ''
  while (true) {
    hash = blockHash(index, prevHash, data, nonce)
    if (meetsTarget(hash, difficulty)) break
    nonce++
    if (nonce > 200000) break
  }
  return {
    index, data, prevHash, hash, nonce,
    timestamp: new Date().toISOString().slice(0, 19).replace('T', ' '),
    valid: true,
  }
}

function validateChain(chain: Block[]): Block[] {
  return chain.map((b, i) => {
    if (i === 0) return { ...b, valid: true }
    const expectedPrev = chain[i - 1].hash
    const expectedHash = blockHash(b.index, b.prevHash, b.data, b.nonce)
    const valid = b.prevHash === expectedPrev && b.hash === expectedHash
    return { ...b, valid }
  })
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB 1: BLOCKCHAIN CHAIN VIEW
// ══════════════════════════════════════════════════════════════════════════════
function ChainTab() {
  const [chain, setChain] = useState<Block[]>(() => {
    const genesis = makeGenesisBlock()
    const b1 = mineBlock(1, genesis.hash, 'Alice → Bob: 5 BTC', 2)
    const b2 = mineBlock(2, b1.hash, 'Bob → Carol: 3 BTC', 2)
    const b3 = mineBlock(3, b2.hash, 'Carol → Dave: 1 BTC', 2)
    return [genesis, b1, b2, b3]
  })
  const [editIdx, setEditIdx] = useState<number | null>(null)
  const [editData, setEditData] = useState('')
  const [adding, setAdding] = useState(false)
  const [newData, setNewData] = useState('')
  const [animBlock, setAnimBlock] = useState<number | null>(null)

  const addBlock = () => {
    if (!newData.trim()) return
    setAdding(true)
    const prev = chain[chain.length - 1]
    const newBlock = mineBlock(chain.length, prev.hash, newData.trim(), 2)
    setChain(c => validateChain([...c, newBlock]))
    setNewData('')
    setAdding(false)
    setAnimBlock(newBlock.index)
    setTimeout(() => setAnimBlock(null), 1500)
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:16, padding:20, flex:1, overflowY:'auto' }}>
      {/* What is blockchain */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8 }}>
        {[
          { icon:'📦', title:'Blok', desc:'Obsahuje data, hash předchozího bloku a vlastní hash.' },
          { icon:'⛓', title:'Řetěz', desc:'Bloky jsou propojeny hashem — každý odkazuje na předchozí.' },
          { icon:'🌐', title:'Distribuovaný', desc:'Tisíce kopií existují na různých uzlech — nikdo nemá kontrolu.' },
        ].map((c,i) => (
          <div key={i} style={{ padding:'10px 12px', background:C.gold+'0d', border:`1px solid ${C.gold}25`, borderRadius:9 }}>
            <div style={{ fontSize:20, marginBottom:6 }}>{c.icon}</div>
            <div style={{ fontSize:11, fontWeight:700, color:C.gold, marginBottom:4 }}>{c.title}</div>
            <div style={{ fontSize:10, color:C.sec, lineHeight:1.6 }}>{c.desc}</div>
          </div>
        ))}
      </div>

      {/* Chain visualization */}
      <div style={{ display:'flex', gap:0, overflowX:'auto', paddingBottom:8 }}>
        {chain.map((b, i) => (
          <div key={b.index} style={{ display:'flex', alignItems:'center', flexShrink:0 }}>
            <BlockCard
              block={b}
              isAnim={animBlock === b.index}
              onEdit={() => { setEditIdx(i); setEditData(b.data) }}
              editMode={editIdx === i}
              editData={editData}
              onEditChange={setEditData}
              onEditSave={() => {
                const updated = chain.map((bl, idx) => idx === i ? { ...bl, data: editData, hash: blockHash(bl.index, bl.prevHash, editData, bl.nonce) } : bl)
                setChain(validateChain(updated))
                setEditIdx(null)
              }}
              onEditCancel={() => setEditIdx(null)}
            />
            {i < chain.length - 1 && (
              <div style={{ display:'flex', flexDirection:'column', alignItems:'center', width:40, flexShrink:0 }}>
                <div style={{ fontSize:9, color:C.sec, marginBottom:2 }}>prevHash</div>
                <div style={{ fontSize:18, color: chain[i+1].valid ? C.gold : C.red }}>→</div>
              </div>
            )}
          </div>
        ))}
        {/* Add block */}
        <div style={{ display:'flex', alignItems:'center', flexShrink:0 }}>
          <div style={{ fontSize:18, color:C.gold, width:30, textAlign:'center' }}>→</div>
          <div style={{ width:160, padding:12, border:`2px dashed ${C.gold}44`, borderRadius:12, background:C.gold+'08' }}>
            <div style={{ fontSize:10, color:C.sec, marginBottom:6 }}>Nový blok</div>
            <input value={newData} onChange={e => setNewData(e.target.value)}
              placeholder="Zadej transakci…"
              onKeyDown={e => e.key === 'Enter' && addBlock()}
              style={{ width:'100%', padding:'5px 8px', background:'#0d1117', color:'#fff', border:`1px solid ${C.border}`, borderRadius:6, fontSize:11, fontFamily:'monospace', boxSizing:'border-box' as const }} />
            <button onClick={addBlock} disabled={adding || !newData.trim()}
              style={{ marginTop:6, width:'100%', padding:'5px', background:C.gold, color:'#000', border:'none', borderRadius:6, cursor:'pointer', fontSize:11, fontWeight:700, fontFamily:'inherit', opacity: adding || !newData.trim() ? 0.5 : 1 }}>
              {adding ? '⛏ Mining…' : '+ Přidat blok'}
            </button>
          </div>
        </div>
      </div>

      {/* Chain health */}
      <div style={{ padding:'10px 14px', background: chain.every(b=>b.valid) ? 'rgba(34,197,94,.08)' : 'rgba(239,68,68,.08)', border:`1px solid ${chain.every(b=>b.valid)?'rgba(34,197,94,.3)':'rgba(239,68,68,.3)'}`, borderRadius:9 }}>
        <div style={{ fontSize:12, fontWeight:700, color: chain.every(b=>b.valid) ? C.green : C.red }}>
          {chain.every(b=>b.valid) ? '✓ Blockchain je validní — všechny hashe souhlasí' : '✗ Blockchain je INVALIDNÍ — někde byl změněn data!'}
        </div>
        {!chain.every(b=>b.valid) && (
          <div style={{ fontSize:11, color:C.sec, marginTop:4 }}>
            Poškozené bloky: {chain.filter(b=>!b.valid).map(b=>`#${b.index}`).join(', ')} — jejich prevHash nebo data neodpovídá.
          </div>
        )}
      </div>

      <InfoBox color={C.gold} title="Proč je blockchain neměnný?">
        Každý blok obsahuje hash předchozího bloku. Pokud změníš data v bloku #2, změní se jeho hash — a blok #3 má uložen starý hash #2, takže se řetěz přeruší. Aby útok prošel, musel bys přepočítat hashe VŠECH následujících bloků RYCHLEJI než zbytek sítě přidává nové. To je výpočetně nemožné.
      </InfoBox>
    </div>
  )
}

function BlockCard({ block, isAnim, onEdit, editMode, editData, onEditChange, onEditSave, onEditCancel }: {
  block: Block; isAnim: boolean
  onEdit: () => void; editMode: boolean; editData: string
  onEditChange: (v: string) => void; onEditSave: () => void; onEditCancel: () => void
}) {
  const col = block.valid ? (block.index === 0 ? C.gold : '#94a3b8') : C.red
  const borderCol = block.valid ? (isAnim ? C.green : (block.index === 0 ? C.gold+'66' : C.border)) : C.red+'66'
  return (
    <div style={{
      width:170, padding:'10px 12px', background: block.valid ? (isAnim ? 'rgba(34,197,94,.1)' : C.card) : 'rgba(239,68,68,.08)',
      border:`2px solid ${borderCol}`, borderRadius:12, flexShrink:0,
      transition:'all .4s', boxShadow: isAnim ? `0 0 20px ${C.green}55` : 'none'
    }}>
      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
        <div style={{ fontSize:10, fontWeight:700, color:col }}>
          {block.index === 0 ? '🌱 Genesis' : `#${block.index}`}
        </div>
        <div style={{ fontSize:9, color: block.valid ? C.green : C.red }}>
          {block.valid ? '✓ Valid' : '✗ Invalid'}
        </div>
      </div>

      {/* Data */}
      <div style={{ marginBottom:7 }}>
        <div style={{ fontSize:8, color:C.sec, marginBottom:2 }}>DATA</div>
        {editMode ? (
          <div>
            <input value={editData} onChange={e => onEditChange(e.target.value)} autoFocus
              style={{ width:'100%', padding:'3px 6px', background:'#0d1117', color:'#fff', border:`1px solid ${C.red}`, borderRadius:4, fontSize:10, fontFamily:'monospace', boxSizing:'border-box' as const }} />
            <div style={{ display:'flex', gap:4, marginTop:4 }}>
              <button onClick={onEditSave} style={{ flex:1, padding:'3px', background:C.red+'33', color:C.red, border:`1px solid ${C.red}55`, borderRadius:4, cursor:'pointer', fontSize:9, fontFamily:'inherit' }}>Uložit</button>
              <button onClick={onEditCancel} style={{ flex:1, padding:'3px', background:'rgba(255,255,255,.06)', color:C.sec, border:`1px solid ${C.border}`, borderRadius:4, cursor:'pointer', fontSize:9, fontFamily:'inherit' }}>Zrušit</button>
            </div>
          </div>
        ) : (
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:4 }}>
            <div style={{ fontSize:10, color:'#e2e8f0', fontFamily:'monospace', lineHeight:1.4, wordBreak:'break-all' as const }}>{block.data}</div>
            {block.index > 0 && (
              <button onClick={onEdit} style={{ padding:'2px 5px', background:'rgba(239,68,68,.1)', color:C.red, border:`1px solid ${C.red}33`, borderRadius:4, cursor:'pointer', fontSize:9, fontFamily:'inherit', flexShrink:0 }}>✏</button>
            )}
          </div>
        )}
      </div>

      {/* Prev Hash */}
      <div style={{ marginBottom:6 }}>
        <div style={{ fontSize:8, color:C.sec, marginBottom:2 }}>PREV HASH</div>
        <div style={{ fontSize:8, fontFamily:'monospace', color:'#475569', wordBreak:'break-all' as const, lineHeight:1.3 }}>
          {block.prevHash.slice(0, 16)}…
        </div>
      </div>

      {/* Hash */}
      <div style={{ marginBottom:6 }}>
        <div style={{ fontSize:8, color:C.sec, marginBottom:2 }}>HASH</div>
        <div style={{ fontSize:8, fontFamily:'monospace', color: block.valid ? C.gold : C.red, wordBreak:'break-all' as const, lineHeight:1.3 }}>
          {block.hash.slice(0, 16)}…
        </div>
      </div>

      {/* Nonce */}
      <div style={{ display:'flex', justifyContent:'space-between' }}>
        <div>
          <div style={{ fontSize:8, color:C.sec }}>NONCE</div>
          <div style={{ fontSize:9, color:'#60a5fa', fontFamily:'monospace' }}>{block.nonce}</div>
        </div>
        <div style={{ textAlign:'right' as const }}>
          <div style={{ fontSize:8, color:C.sec }}>ČAS</div>
          <div style={{ fontSize:8, color:'#475569', fontFamily:'monospace' }}>{block.timestamp.slice(11)}</div>
        </div>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB 2: MINING / PROOF OF WORK
// ══════════════════════════════════════════════════════════════════════════════
function MiningTab() {
  const [difficulty, setDifficulty] = useState(3)
  const [data, setData] = useState('Alice → Bob: 10 BTC')
  const [nonce, setNonce] = useState(0)
  const [hash, setHash] = useState('')
  const [mining, setMining] = useState(false)
  const [found, setFound] = useState(false)
  const [attempts, setAttempts] = useState(0)
  const [log, setLog] = useState<string[]>([])
  const stopRef = useRef(false)
  const prevHash = '0000000000000000abcdef1234567890'

  useEffect(() => {
    const h = blockHash(1, prevHash, data, nonce)
    setHash(h)
  }, [data, nonce])

  const startMining = useCallback(async () => {
    setMining(true); setFound(false); stopRef.current = false
    setLog([]); setAttempts(0)
    let n = 0
    const target = '0'.repeat(difficulty)
    const addLog = (s: string) => setLog(p => [s, ...p.slice(0, 12)])

    const step = () => {
      if (stopRef.current) { setMining(false); return }
      const BATCH = 500
      for (let i = 0; i < BATCH; i++) {
        const h = blockHash(1, prevHash, data, n)
        if (h.startsWith(target)) {
          setNonce(n); setHash(h); setAttempts(n + 1)
          setFound(true); setMining(false)
          addLog(`✓ Nonce: ${n} → hash: ${h.slice(0, 20)}…`)
          return
        }
        n++
      }
      setNonce(n); setAttempts(n)
      if (n % 5000 === 0) addLog(`⛏ Zkouším nonce ${n}… ${blockHash(1, prevHash, data, n).slice(0, 12)}`)
      requestAnimationFrame(step)
    }
    requestAnimationFrame(step)
  }, [difficulty, data])

  const stopMining = () => { stopRef.current = true; setMining(false) }
  const resetMining = () => { setNonce(0); setFound(false); setAttempts(0); setLog([]) }

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:16, padding:20, flex:1, overflowY:'auto' }}>
      {/* What is mining */}
      <div style={{ padding:'12px 14px', background:C.blue+'0d', border:`1px solid ${C.blue}25`, borderRadius:10 }}>
        <div style={{ fontSize:12, fontWeight:700, color:C.blue, marginBottom:6 }}>⛏ Co je Mining (těžení)?</div>
        <div style={{ fontSize:11, color:'#cbd5e1', lineHeight:1.75 }}>
          Mining = hledání čísla <strong style={{color:C.blue}}>nonce</strong> takového, aby hash bloku začínal určitým počtem nul (target).
          Je to záměrně těžké — CPU musí zkusit miliony kombinací. Kdo první najde platný nonce, dostane odměnu v BTC.
        </div>
      </div>

      {/* Controls */}
      <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr', gap:12 }}>
        <div>
          <label style={{ fontSize:10, color:C.sec, display:'block', marginBottom:4 }}>Data bloku</label>
          <input value={data} onChange={e=>setData(e.target.value)}
            style={{ width:'100%', padding:'8px 12px', background:'#1a2035', color:'#fff', border:`1px solid ${C.border}`, borderRadius:8, fontSize:12, fontFamily:'monospace', boxSizing:'border-box' as const }} />
        </div>
        <div>
          <label style={{ fontSize:10, color:C.sec, display:'block', marginBottom:4 }}>Obtížnost (počet nul)</label>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <input type="range" min={1} max={5} value={difficulty} onChange={e=>setDifficulty(+e.target.value)}
              style={{ flex:1, accentColor:C.blue }} />
            <span style={{ fontSize:18, fontWeight:800, color:C.blue, minWidth:20 }}>{difficulty}</span>
          </div>
          <div style={{ fontSize:9, color:C.sec }}>Target: <code style={{color:C.gold}}>{'0'.repeat(difficulty)}{'?'.repeat(6)}</code></div>
        </div>
      </div>

      {/* Current block */}
      <div style={{ background:'#0d1117', borderRadius:10, padding:16, border:`1px solid ${C.border}` }}>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:12 }}>
          <HashField label="Index" value="1" color={C.sec}/>
          <HashField label="Nonce" value={nonce.toLocaleString()} color={C.blue}/>
          <HashField label="Prev Hash" value={prevHash.slice(0,20)+'…'} color={C.sec}/>
          <HashField label="Data" value={data.slice(0,24)+(data.length>24?'…':'')} color={C.sec}/>
        </div>
        {/* Hash display */}
        <div style={{ marginBottom:6 }}>
          <div style={{ fontSize:9, color:C.sec, marginBottom:4 }}>VÝSLEDNÝ HASH</div>
          <div style={{ display:'flex', flexWrap:'wrap' as const, gap:1, fontFamily:'monospace', fontSize:12 }}>
            {hash.split('').map((c,i) => {
              const isTarget = i < difficulty
              const isGood = isTarget && c === '0'
              const isBad = isTarget && c !== '0'
              return (
                <span key={i} style={{
                  color: isGood ? C.green : isBad ? C.red : '#475569',
                  background: isTarget ? (isGood?'rgba(34,197,94,.15)':'rgba(239,68,68,.15)') : 'transparent',
                  borderRadius:2, padding:'0 1px',
                  fontWeight: isTarget ? 700 : 400,
                }}>{c}</span>
              )
            })}
          </div>
          {found && <div style={{ fontSize:11, color:C.green, marginTop:6, fontWeight:700 }}>✓ Valid hash! Začíná {difficulty} nulami. Blok přijat sítí!</div>}
        </div>

        {/* Proof of work visualisation */}
        <div style={{ marginBottom:10 }}>
          <div style={{ fontSize:9, color:C.sec, marginBottom:4 }}>SHODA S TARGETEM ({difficulty} nuly)</div>
          <div style={{ display:'flex', gap:3 }}>
            {Array.from({length:difficulty}).map((_,i) => (
              <div key={i} style={{ width:24, height:24, borderRadius:5, display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:700, fontFamily:'monospace', background: hash[i]==='0'?'rgba(34,197,94,.2)':'rgba(239,68,68,.2)', border:`1px solid ${hash[i]==='0'?C.green:C.red}55`, color: hash[i]==='0'?C.green:C.red }}>
                {hash[i]}
              </div>
            ))}
            <div style={{ display:'flex', alignItems:'center', fontSize:10, color:C.sec, marginLeft:4 }}>
              {found ? '→ ✓ MATCH!' : '→ ✗ Hledám…'}
            </div>
          </div>
        </div>

        {/* Stats */}
        {attempts > 0 && (
          <div style={{ display:'flex', gap:16, padding:'8px 10px', background:'rgba(255,255,255,.04)', borderRadius:7 }}>
            <div><div style={{fontSize:9,color:C.sec}}>Pokusy</div><div style={{fontSize:13,fontWeight:700,color:C.blue,fontFamily:'monospace'}}>{attempts.toLocaleString()}</div></div>
            <div><div style={{fontSize:9,color:C.sec}}>Nonce</div><div style={{fontSize:13,fontWeight:700,color:C.gold,fontFamily:'monospace'}}>{nonce.toLocaleString()}</div></div>
            <div><div style={{fontSize:9,color:C.sec}}>Oček. pokusy</div><div style={{fontSize:13,fontWeight:700,color:C.sec,fontFamily:'monospace'}}>16^{difficulty} ≈ {Math.pow(16,difficulty).toLocaleString()}</div></div>
          </div>
        )}
      </div>

      {/* Buttons */}
      <div style={{ display:'flex', gap:8 }}>
        <button onClick={startMining} disabled={mining}
          style={{ padding:'8px 20px', background:mining?'rgba(59,130,246,.2)':C.blue, color:mining?C.blue:'#fff', border:`1px solid ${mining?C.blue+'44':'transparent'}`, borderRadius:8, cursor:mining?'not-allowed':'pointer', fontSize:13, fontWeight:700, fontFamily:'inherit', display:'flex', alignItems:'center', gap:6 }}>
          {mining ? <><span style={{display:'inline-block',animation:'spin .5s linear infinite'}}>⛏</span> Mining…</> : '⛏ Spustit mining'}
        </button>
        {mining && <button onClick={stopMining} style={{ padding:'8px 14px', background:'rgba(239,68,68,.15)', color:C.red, border:`1px solid ${C.red}44`, borderRadius:8, cursor:'pointer', fontSize:12, fontFamily:'inherit' }}>⏹ Stop</button>}
        <button onClick={resetMining} style={{ padding:'8px 14px', background:'rgba(255,255,255,.07)', color:C.sec, border:`1px solid ${C.border}`, borderRadius:8, cursor:'pointer', fontSize:12, fontFamily:'inherit' }}>↺ Reset</button>
      </div>

      {/* Log */}
      {log.length > 0 && (
        <div style={{ background:'#0a0d14', borderRadius:8, padding:10, border:`1px solid ${C.border}`, fontFamily:'monospace', fontSize:10, maxHeight:160, overflowY:'auto' }}>
          {log.map((l,i) => <div key={i} style={{ color:l.startsWith('✓')?C.green:C.sec, lineHeight:1.8 }}>{l}</div>)}
        </div>
      )}

      {/* Difficulty comparison */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:6 }}>
        {[1,2,3,4,5].map(d => (
          <div key={d} style={{ padding:'8px', background:difficulty===d?C.blue+'22':'rgba(255,255,255,.03)', border:`1px solid ${difficulty===d?C.blue+'44':C.border}`, borderRadius:8, textAlign:'center' as const }}>
            <div style={{ fontSize:11, fontWeight:700, color:difficulty===d?C.blue:C.sec }}>{d} {'0'.repeat(d)}</div>
            <div style={{ fontSize:9, color:C.sec, marginTop:2 }}>~{Math.pow(16,d).toLocaleString()}</div>
            <div style={{ fontSize:8, color:'#334155', marginTop:1 }}>pokusů</div>
          </div>
        ))}
      </div>

      <InfoBox color={C.blue} title="Proč je mining těžký záměrně?">
        Obtížnost zabraňuje útokům. Kdyby bylo snadné vygenerovat platný hash, útočník by mohl přepsat historii transakcí. Bitcoin automaticky upravuje obtížnost tak, aby nový blok vznikl průměrně každých 10 minut — bez ohledu na to, kolik těžařů je v síti.
      </InfoBox>
    </div>
  )
}

function HashField({ label, value, color }: { label:string; value:string; color:string }) {
  return (
    <div>
      <div style={{ fontSize:8, color:C.sec, marginBottom:2 }}>{label}</div>
      <div style={{ fontSize:11, color, fontFamily:'monospace', wordBreak:'break-all' as const }}>{value}</div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB 3: TAMPER DETECTION
// ══════════════════════════════════════════════════════════════════════════════
function TamperTab() {
  const [chain, setChain] = useState<Block[]>(() => {
    const g = makeGenesisBlock()
    const b1 = mineBlock(1, g.hash, 'Alice → Bob: 5 BTC', 2)
    const b2 = mineBlock(2, b1.hash, 'Bob → Carol: 3 BTC', 2)
    const b3 = mineBlock(3, b2.hash, 'Carol → Dave: 1 BTC', 2)
    const b4 = mineBlock(4, b3.hash, 'Dave → Eve: 2 BTC', 2)
    return [g, b1, b2, b3, b4]
  })
  const [tamperIdx, setTamperIdx] = useState<number | null>(null)
  const [tamperData, setTamperData] = useState('')
  const [repairing, setRepairing] = useState(false)
  const [ripple, setRipple] = useState<number[]>([])

  const tamper = (idx: number) => {
    setTamperIdx(idx)
    setTamperData(chain[idx].data)
  }

  const applyTamper = () => {
    if (tamperIdx === null) return
    // Change data but don't recompute hash — this breaks the chain
    const updated = chain.map((b, i) => {
      if (i === tamperIdx) return { ...b, data: tamperData }
      return b
    })
    const validated = validateChain(updated)
    setChain(validated)
    setTamperIdx(null)
    // Animate ripple
    const affectedBlocks = chain.slice(tamperIdx).map(b => b.index)
    setRipple(affectedBlocks)
    setTimeout(() => setRipple([]), 2000)
  }

  const repairBlock = (idx: number) => {
    // Re-mine from this block onward
    setRepairing(true)
    let newChain = [...chain]
    for (let i = idx; i < newChain.length; i++) {
      const prev = i === 0 ? '0000000000000000' : newChain[i-1].hash
      newChain[i] = mineBlock(i, prev, newChain[i].data, 2)
    }
    setChain(validateChain(newChain))
    setRepairing(false)
  }

  const reset = () => {
    const g = makeGenesisBlock()
    const b1 = mineBlock(1, g.hash, 'Alice → Bob: 5 BTC', 2)
    const b2 = mineBlock(2, b1.hash, 'Bob → Carol: 3 BTC', 2)
    const b3 = mineBlock(3, b2.hash, 'Carol → Dave: 1 BTC', 2)
    const b4 = mineBlock(4, b3.hash, 'Dave → Eve: 2 BTC', 2)
    setChain([g, b1, b2, b3, b4])
    setTamperIdx(null); setRipple([])
  }

  const isValid = chain.every(b => b.valid)

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:16, padding:20, flex:1, overflowY:'auto' }}>
      <div style={{ padding:'10px 14px', background:isValid?'rgba(34,197,94,.08)':'rgba(239,68,68,.1)', border:`1px solid ${isValid?'rgba(34,197,94,.3)':'rgba(239,68,68,.4)'}`, borderRadius:10 }}>
        <div style={{ fontSize:13, fontWeight:700, color:isValid?C.green:C.red }}>
          {isValid ? '🛡 Blockchain je neporušen' : '⚠ DETEKOVÁNA MANIPULACE s blockchainém!'}
        </div>
        {!isValid && <div style={{ fontSize:11, color:C.sec, marginTop:4 }}>
          Bloky {chain.filter(b=>!b.valid).map(b=>`#${b.index}`).join(', ')} mají neplatné hashe. Síť by tento blockchain odmítla.
        </div>}
      </div>

      {/* Chain with tamper controls */}
      <div style={{ overflowX:'auto' }}>
        <div style={{ display:'flex', gap:8, paddingBottom:8 }}>
          {chain.map((b, i) => {
            const inRipple = ripple.includes(b.index)
            return (
              <div key={b.index} style={{ flexShrink:0, width:175 }}>
                <div style={{
                  padding:'10px 12px', borderRadius:12,
                  border:`2px solid ${b.valid ? C.border : C.red+'88'}`,
                  background: inRipple ? 'rgba(239,68,68,.15)' : b.valid ? C.card : 'rgba(239,68,68,.07)',
                  transition:'all .3s',
                  boxShadow: inRipple ? `0 0 16px ${C.red}44` : 'none'
                }}>
                  <div style={{ display:'flex', justifyContent:'space-between', marginBottom:8 }}>
                    <span style={{ fontSize:10, fontWeight:700, color:b.index===0?C.gold:'#94a3b8' }}>{b.index===0?'Genesis':`Blok #${b.index}`}</span>
                    <span style={{ fontSize:10, color:b.valid?C.green:C.red }}>{b.valid?'✓':'✗'}</span>
                  </div>

                  {tamperIdx === i ? (
                    <div>
                      <input value={tamperData} onChange={e=>setTamperData(e.target.value)} autoFocus
                        style={{ width:'100%', padding:'4px 8px', background:'#0d1117', color:C.red, border:`1px solid ${C.red}`, borderRadius:5, fontSize:10, fontFamily:'monospace', boxSizing:'border-box' as const }} />
                      <div style={{ display:'flex', gap:4, marginTop:5 }}>
                        <button onClick={applyTamper} style={{ flex:1, padding:'3px', background:C.red+'33', color:C.red, border:`1px solid ${C.red}55`, borderRadius:4, cursor:'pointer', fontSize:9, fontFamily:'inherit' }}>⚠ Tamper!</button>
                        <button onClick={()=>setTamperIdx(null)} style={{ flex:1, padding:'3px', background:'rgba(255,255,255,.06)', color:C.sec, border:`1px solid ${C.border}`, borderRadius:4, cursor:'pointer', fontSize:9, fontFamily:'inherit' }}>Zrušit</button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ fontSize:10, fontFamily:'monospace', color:'#e2e8f0', marginBottom:6, minHeight:28 }}>{b.data}</div>
                  )}

                  <div style={{ fontSize:8, color:C.sec, marginBottom:2 }}>HASH</div>
                  <div style={{ fontSize:8, fontFamily:'monospace', color:b.valid?'#475569':C.red, wordBreak:'break-all' as const, marginBottom:8 }}>{b.hash.slice(0,18)}…</div>

                  <div style={{ display:'flex', gap:4 }}>
                    {i > 0 && tamperIdx === null && b.valid && (
                      <button onClick={()=>tamper(i)}
                        style={{ flex:1, padding:'3px 6px', background:'rgba(239,68,68,.1)', color:C.red, border:`1px solid ${C.red}33`, borderRadius:5, cursor:'pointer', fontSize:9, fontFamily:'inherit' }}>
                        ✏ Tamper
                      </button>
                    )}
                    {!b.valid && (
                      <button onClick={()=>repairBlock(i)} disabled={repairing}
                        style={{ flex:1, padding:'3px 6px', background:'rgba(34,197,94,.1)', color:C.green, border:`1px solid ${C.green}33`, borderRadius:5, cursor:'pointer', fontSize:9, fontFamily:'inherit' }}>
                        ⛏ Opravit
                      </button>
                    )}
                  </div>
                </div>
                {i < chain.length - 1 && (
                  <div style={{ textAlign:'center' as const, marginTop:6 }}>
                    <div style={{ fontSize:9, color:C.sec }}>prevHash</div>
                    <div style={{ fontSize:14, color: chain[i+1].valid ? C.gold : C.red }}>→</div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      <div style={{ display:'flex', gap:8 }}>
        <button onClick={reset} style={{ padding:'6px 14px', background:'rgba(255,255,255,.07)', color:C.sec, border:`1px solid ${C.border}`, borderRadius:7, cursor:'pointer', fontSize:11, fontFamily:'inherit' }}>↺ Reset</button>
      </div>

      <InfoBox color={C.red} title="Jak funguje detekce manipulace?">
        <strong>1. Změníš data</strong> v bloku #2 → hash bloku #2 se změní. <strong>2.</strong> Blok #3 má uložen starý hash #2 jako prevHash. <strong>3.</strong> Síť ověří: hash(blok#2) ≠ prevHash(blok#3) → ALARM. <strong>4.</strong> Aby útok prošel, musíš přepočítat bloky #2, #3, #4… ZÁROVEŇ rychleji než 51% těžařů — to je prakticky nemožné.
      </InfoBox>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB 4: CONSENSUS / DISTRIBUTED NETWORK
// ══════════════════════════════════════════════════════════════════════════════
interface NetNode { id:string; x:number; y:number; chain:number[]; honest:boolean; label:string }
interface NetMsg { from:string; to:string; t:number; data:string }

function ConsensusTab({ size }: { size: {w:number;h:number} }) {
  const [nodes, setNodes] = useState<NetNode[]>([
    {id:'A',x:0.5,y:0.12,chain:[1,2,3,4],honest:true,label:'Node A'},
    {id:'B',x:0.15,y:0.42,chain:[1,2,3,4],honest:true,label:'Node B'},
    {id:'C',x:0.85,y:0.42,chain:[1,2,3,4],honest:true,label:'Node C'},
    {id:'D',x:0.28,y:0.82,chain:[1,2,3,4],honest:true,label:'Node D'},
    {id:'E',x:0.72,y:0.82,chain:[1,2,3,4],honest:true,label:'Node E'},
  ])
  const [msgs, setMsgs] = useState<NetMsg[]>([])
  const [phase, setPhase] = useState<'idle'|'broadcast'|'attack'|'consensus'>('idle')
  const [attackNode, setAttackNode] = useState<string|null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef(0)
  const msgsRef = useRef<NetMsg[]>([])
  const nodesRef = useRef(nodes)
  useEffect(() => { nodesRef.current = nodes }, [nodes])

  const W = size.w * 0.65, H = size.h - 42

  useEffect(() => {
    const cv = canvasRef.current; if (!cv) return
    const ctx = cv.getContext('2d')!
    const edges = [['A','B'],['A','C'],['B','D'],['C','E'],['D','E'],['B','C']]

    const draw = () => {
      msgsRef.current = msgsRef.current.map(m => ({...m, t:Math.min(1,m.t+0.025)})).filter(m=>m.t<1.05)
      ctx.clearRect(0,0,W,H)

      // Edges
      edges.forEach(([a,b]) => {
        const na = nodesRef.current.find(n=>n.id===a)!, nb = nodesRef.current.find(n=>n.id===b)!
        ctx.beginPath(); ctx.moveTo(na.x*W, na.y*H); ctx.lineTo(nb.x*W, nb.y*H)
        ctx.strokeStyle = 'rgba(255,255,255,0.1)'; ctx.lineWidth = 1.5; ctx.stroke()
      })

      // Messages in transit
      msgsRef.current.forEach(m => {
        const from = nodesRef.current.find(n=>n.id===m.from)!
        const to   = nodesRef.current.find(n=>n.id===m.to)!
        const x = from.x*W + (to.x*W - from.x*W)*m.t
        const y = from.y*H + (to.y*H - from.y*H)*m.t
        const al = m.t<0.1?m.t*10:m.t>0.8?(1-m.t)*5:1
        ctx.globalAlpha=al
        ctx.beginPath(); ctx.arc(x,y,5,0,Math.PI*2)
        ctx.fillStyle = '#60a5fa44'; ctx.fill()
        ctx.beginPath(); ctx.arc(x,y,3,0,Math.PI*2)
        ctx.fillStyle = '#60a5fa'; ctx.fill()
        ctx.globalAlpha=1
      })

      // Nodes
      nodesRef.current.forEach(n => {
        const nx=n.x*W, ny=n.y*H
        const isAttacker = n.id === attackNode
        const col = isAttacker ? C.red : n.honest ? C.green : C.red
        ctx.beginPath(); ctx.arc(nx,ny,28,0,Math.PI*2)
        ctx.fillStyle = (isAttacker?C.red:col)+'22'; ctx.fill()
        ctx.beginPath(); ctx.arc(nx,ny,20,0,Math.PI*2)
        ctx.fillStyle = C.card; ctx.fill()
        ctx.strokeStyle = col; ctx.lineWidth = 2.5; ctx.stroke()
        ctx.font='bold 11px sans-serif'; ctx.textAlign='center'; ctx.fillStyle=col
        ctx.fillText(isAttacker?'😈':n.honest?'✓':'✗', nx, ny+4)
        ctx.fillStyle='#94a3b8'; ctx.font='9px sans-serif'
        ctx.fillText(n.label, nx, ny+34)
        ctx.fillStyle=col; ctx.font='8px monospace'
        ctx.fillText(`${n.chain.length} bloků`, nx, ny+44)
      })
      rafRef.current = requestAnimationFrame(draw)
    }
    rafRef.current = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(rafRef.current)
  }, [W, H, attackNode])

  const broadcast = () => {
    setPhase('broadcast')
    const newMsgs: NetMsg[] = []
    const edges = [['A','B'],['A','C'],['B','D'],['C','E'],['D','E'],['B','C'],['B','A'],['C','A'],['D','B'],['E','C']]
    edges.forEach(([f,t]) => newMsgs.push({from:f, to:t, t:-(Math.random()*0.4), data:'new block'}))
    msgsRef.current = newMsgs
    setMsgs(newMsgs)
    setNodes(ns => ns.map(n => ({...n, chain:[...n.chain, n.chain.length+1]})))
    setTimeout(() => setPhase('idle'), 3000)
  }

  const attackNode51 = () => {
    setAttackNode('A')
    setPhase('attack')
    // Node A gets a longer fake chain
    setNodes(ns => ns.map(n => n.id==='A' ? {...n, chain:[1,2,3,4,5,6,7], honest:false} : n))
    setTimeout(() => {
      // Consensus restores honest chain
      setNodes(ns => ns.map(n => ({...n, chain:[1,2,3,4,5], honest:true})))
      setAttackNode(null); setPhase('consensus')
      setTimeout(() => setPhase('idle'), 2000)
    }, 3000)
  }

  return (
    <div style={{ display:'flex', gap:16, flex:1, overflow:'hidden', padding:16 }}>
      <div style={{ flex:1, display:'flex', flexDirection:'column', gap:12 }}>
        {/* Phase indicator */}
        <div style={{ padding:'8px 12px', background:
          phase==='attack'?'rgba(239,68,68,.1)':
          phase==='consensus'?'rgba(34,197,94,.1)':
          phase==='broadcast'?'rgba(59,130,246,.1)':'rgba(255,255,255,.04)',
          border:`1px solid ${phase==='attack'?C.red+'44':phase==='consensus'?C.green+'44':phase==='broadcast'?C.blue+'44':C.border}`,
          borderRadius:8, fontSize:11, fontWeight:700,
          color:phase==='attack'?C.red:phase==='consensus'?C.green:phase==='broadcast'?C.blue:'#94a3b8' }}>
          {phase==='idle'?'🌐 Síť v klidu — 5 uzlů se shoduje na stejném řetězu':
           phase==='broadcast'?'📡 Broadcastování nového bloku sítí…':
           phase==='attack'?'☠ Útok 51%! Node A se snaží podvrhnout řetěz…':
           '✓ Konsenzus obnovení — poctivý řetěz vyhrál!'}
        </div>

        <canvas ref={canvasRef} width={W} height={H}
          style={{ borderRadius:12, border:`1px solid ${C.border}`, background:'#0a0d14', width:'100%', flex:1 }}/>

        <div style={{ display:'flex', gap:8 }}>
          <button onClick={broadcast}
            style={{ padding:'7px 16px', background:C.blue, color:'#fff', border:'none', borderRadius:7, cursor:'pointer', fontSize:12, fontWeight:700, fontFamily:'inherit' }}>
            📦 Broadcastuj blok
          </button>
          <button onClick={attackNode51}
            style={{ padding:'7px 16px', background:'rgba(239,68,68,.15)', color:C.red, border:`1px solid ${C.red}44`, borderRadius:7, cursor:'pointer', fontSize:12, fontFamily:'inherit' }}>
            ☠ Simuluj 51% útok
          </button>
        </div>
      </div>

      <div style={{ width:260, flexShrink:0, display:'flex', flexDirection:'column', gap:10, overflowY:'auto' }}>
        {/* Node states */}
        <div style={{ fontSize:10, fontWeight:700, color:C.sec, textTransform:'uppercase', letterSpacing:'.06em' }}>Stav uzlů</div>
        {nodes.map(n => (
          <div key={n.id} style={{ padding:'8px 10px', background:n.honest?'rgba(34,197,94,.06)':'rgba(239,68,68,.06)', border:`1px solid ${n.honest?C.green+'22':C.red+'44'}`, borderRadius:8 }}>
            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
              <span style={{ fontSize:11, fontWeight:700, color:n.honest?C.green:C.red }}>{n.id===attackNode?'😈':''} {n.label}</span>
              <span style={{ fontSize:10, color:C.sec }}>{n.chain.length} bloků</span>
            </div>
            <div style={{ display:'flex', gap:3 }}>
              {n.chain.map(b => (
                <div key={b} style={{ width:14, height:14, borderRadius:3, background:n.honest?C.green+'33':C.red+'33', border:`1px solid ${n.honest?C.green+'44':C.red+'44'}`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:7, color:n.honest?C.green:C.red }}>{b}</div>
              ))}
            </div>
          </div>
        ))}

        <InfoBox color={C.green} title="Nakamoto konsenzus">
          Platí nejdelší řetěz (největší PoW). Pokud útočník kontroluje méně než 51% hashrate sítě, nemůže přepsat historii — poctivá síť vždy dohnala a předhonila jeho řetěz.
        </InfoBox>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB 5: TRANSACTIONS / UTXO
// ══════════════════════════════════════════════════════════════════════════════
interface UTXO { id:string; owner:string; amount:number; spent:boolean }
interface TxAnim { from:string; to:string; amount:number; t:number; id:number }

function TransactionsTab() {
  const [wallets] = useState(['Alice','Bob','Carol','Dave'])
  const [utxos, setUtxos] = useState<UTXO[]>([
    {id:'utxo1', owner:'Alice', amount:5, spent:false},
    {id:'utxo2', owner:'Alice', amount:3, spent:false},
    {id:'utxo3', owner:'Bob',   amount:2, spent:false},
    {id:'utxo4', owner:'Bob',   amount:7, spent:false},
    {id:'utxo5', owner:'Carol', amount:4, spent:false},
  ])
  const [from, setFrom] = useState('Alice')
  const [to, setTo] = useState('Bob')
  const [amount, setAmount] = useState(3)
  const [txAnims, setTxAnims] = useState<TxAnim[]>([])
  const [txLog, setTxLog] = useState<{desc:string;ok:boolean}[]>([])
  const [animId, setAnimId] = useState(0)

  const balance = (name: string) => utxos.filter(u => u.owner===name && !u.spent).reduce((s,u) => s+u.amount, 0)

  const sendTx = () => {
    const avail = utxos.filter(u => u.owner===from && !u.spent)
    const total = avail.reduce((s,u) => s+u.amount, 0)
    if (total < amount) {
      setTxLog(p => [{desc:`✗ Nedostatečný zůstatek: ${from} má ${total} BTC, potřebuje ${amount} BTC`, ok:false}, ...p.slice(0,7)])
      return
    }
    // Select UTXOs (greedy)
    let remaining = amount
    const toSpend: UTXO[] = []
    for (const u of avail) {
      if (remaining <= 0) break
      toSpend.push(u); remaining -= u.amount
    }
    const change = -remaining
    // Update UTXOs
    setUtxos(prev => {
      const spent = prev.map(u => toSpend.find(ts=>ts.id===u.id) ? {...u,spent:true} : u)
      const newUtxos: UTXO[] = [
        ...spent,
        {id:`utxo${Date.now()}`, owner:to, amount, spent:false},
      ]
      if (change > 0) newUtxos.push({id:`utxo${Date.now()+1}`, owner:from, amount:change, spent:false})
      return newUtxos
    })
    // Animate
    const id = animId; setAnimId(p=>p+1)
    setTxAnims(p => [...p, {from, to, amount, t:0, id}])
    setTimeout(() => setTxAnims(p => p.filter(a=>a.id!==id)), 2000)
    setTxLog(p => [{desc:`✓ ${from} → ${to}: ${amount} BTC${change>0?` (zbytek: ${change} BTC → ${from})`:''}`, ok:true}, ...p.slice(0,7)])
  }

  const walletColors: Record<string,string> = {Alice:'#3b82f6',Bob:'#22c55e',Carol:'#f59e0b',Dave:'#a855f7'}

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:16, padding:20, flex:1, overflowY:'auto' }}>
      {/* Wallet balances */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:8 }}>
        {wallets.map(w => (
          <div key={w} style={{ padding:'10px 12px', background:walletColors[w]+'0d', border:`1px solid ${walletColors[w]}33`, borderRadius:10, textAlign:'center' as const }}>
            <div style={{ fontSize:20, marginBottom:4 }}>👤</div>
            <div style={{ fontSize:12, fontWeight:700, color:walletColors[w] }}>{w}</div>
            <div style={{ fontSize:18, fontWeight:800, color:'#fff', marginTop:4 }}>{balance(w)}</div>
            <div style={{ fontSize:9, color:C.sec }}>BTC</div>
          </div>
        ))}
      </div>

      {/* Transaction builder */}
      <div style={{ background:'#0d1117', borderRadius:10, padding:14, border:`1px solid ${C.border}` }}>
        <div style={{ fontSize:11, fontWeight:700, color:'#fff', marginBottom:10 }}>💸 Nová transakce</div>
        <div style={{ display:'flex', gap:10, alignItems:'flex-end', flexWrap:'wrap' as const }}>
          <div>
            <label style={{ fontSize:9, color:C.sec, display:'block', marginBottom:3 }}>Od</label>
            <select value={from} onChange={e=>setFrom(e.target.value)}
              style={{ padding:'6px 10px', background:'#1a2035', color:walletColors[from], border:`1px solid ${walletColors[from]}44`, borderRadius:7, fontSize:12, fontFamily:'inherit', cursor:'pointer', fontWeight:700 }}>
              {wallets.map(w=><option key={w} value={w}>{w} ({balance(w)} BTC)</option>)}
            </select>
          </div>
          <div style={{ fontSize:18 }}>→</div>
          <div>
            <label style={{ fontSize:9, color:C.sec, display:'block', marginBottom:3 }}>Komu</label>
            <select value={to} onChange={e=>setTo(e.target.value)}
              style={{ padding:'6px 10px', background:'#1a2035', color:walletColors[to]||'#fff', border:`1px solid ${C.border}`, borderRadius:7, fontSize:12, fontFamily:'inherit', cursor:'pointer' }}>
              {wallets.filter(w=>w!==from).map(w=><option key={w} value={w}>{w}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize:9, color:C.sec, display:'block', marginBottom:3 }}>Částka</label>
            <input type="number" min={1} max={balance(from)} value={amount} onChange={e=>setAmount(+e.target.value)}
              style={{ width:80, padding:'6px 10px', background:'#1a2035', color:'#fff', border:`1px solid ${C.border}`, borderRadius:7, fontSize:12, fontFamily:'monospace', boxSizing:'border-box' as const }}/>
          </div>
          <button onClick={sendTx}
            style={{ padding:'8px 18px', background:C.purple, color:'#fff', border:'none', borderRadius:8, cursor:'pointer', fontSize:13, fontWeight:700, fontFamily:'inherit' }}>
            📤 Odeslat
          </button>
        </div>
      </div>

      {/* UTXO pool */}
      <div>
        <div style={{ fontSize:10, fontWeight:700, color:C.sec, textTransform:'uppercase', letterSpacing:'.06em', marginBottom:8 }}>UTXO Pool (Unspent Transaction Outputs)</div>
        <div style={{ display:'flex', flexWrap:'wrap' as const, gap:6 }}>
          {utxos.map(u => (
            <div key={u.id} style={{ padding:'6px 10px', background: u.spent ? 'rgba(255,255,255,.03)' : walletColors[u.owner]+'15', border:`1px solid ${u.spent?C.border:walletColors[u.owner]+'44'}`, borderRadius:8, opacity: u.spent ? 0.4 : 1, transition:'all .3s', display:'flex', alignItems:'center', gap:6 }}>
              <div style={{ width:8, height:8, borderRadius:'50%', background: u.spent ? C.sec : walletColors[u.owner] }}/>
              <span style={{ fontSize:10, color: u.spent ? C.sec : walletColors[u.owner], fontWeight:700 }}>{u.owner}</span>
              <span style={{ fontSize:11, fontWeight:800, color: u.spent ? C.sec : '#fff', fontFamily:'monospace' }}>{u.amount} BTC</span>
              {u.spent && <span style={{ fontSize:9, color:C.sec }}>utraceno</span>}
            </div>
          ))}
        </div>
      </div>

      {/* TX Log */}
      {txLog.length > 0 && (
        <div style={{ background:'#0a0d14', borderRadius:8, padding:10, border:`1px solid ${C.border}` }}>
          <div style={{ fontSize:9, fontWeight:700, color:C.sec, textTransform:'uppercase', marginBottom:6 }}>Log transakcí</div>
          {txLog.map((l,i) => (
            <div key={i} style={{ fontSize:10, fontFamily:'monospace', color:l.ok?C.green:C.red, lineHeight:1.8 }}>{l.desc}</div>
          ))}
        </div>
      )}

      <InfoBox color={C.purple} title="UTXO model">
        Bitcoin nepoužívá "účty s zůstatkem" jako banka. Místo toho existují <strong>UTXOs</strong> — kusy bitcoinů vlastněné adresami. Transakce spotřebuje (utratí) existující UTXOs jako vstupy a vytvoří nové UTXOs jako výstupy. Zbytek se vrátí jako "change" zpátky odesílateli.
      </InfoBox>
    </div>
  )
}

// ─── Shared helpers ───────────────────────────────────────────────────────────
function InfoBox({ color, title, children }: { color:string; title:string; children:React.ReactNode }) {
  return (
    <div style={{ padding:'12px 14px', background:color+'0a', border:`1px solid ${color}2a`, borderRadius:10 }}>
      <div style={{ fontSize:11, fontWeight:700, color, marginBottom:6 }}>💡 {title}</div>
      <div style={{ fontSize:11, color:'#cbd5e1', lineHeight:1.75 }}>{children}</div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN
// ══════════════════════════════════════════════════════════════════════════════
const INFO_PANEL: Record<Tab,{desc:string;facts:{k:string;v:string}[];tip:string}> = {
  chain: {
    desc:'Blockchain je řetěz bloků kde každý blok obsahuje hash předchozího. Jakákoliv změna dat rozbije celý řetěz.',
    facts:[{k:'Vynalezl',v:'Satoshi Nakamoto (2008)'},{k:'První blok',v:'Genesis Block 2009'},{k:'Velikost bloku',v:'~1–4 MB (BTC)'},{k:'Čas bloku',v:'~10 minut (BTC)'}],
    tip:'💡 Klikni na ✏ Tamper tlačítko u bloku a uprav data — uvidíš jak se řetěz rozbije!'
  },
  mining: {
    desc:'Mining je proces hledání nonce takového, aby hash bloku splňoval cíl (začínal N nulami). Je záměrně výpočetně náročný.',
    facts:[{k:'Algoritmus',v:'SHA-256 (BTC)'},{k:'Odměna',v:'3.125 BTC/blok (2024)'},{k:'Hashrate sítě',v:'~600 EH/s'},{k:'Spotřeba',v:'~150 TWh/rok'}],
    tip:'💡 Zkus obtížnost 4 nebo 5 — uvidíš jak exponenciálně narůstá počet pokusů!'
  },
  tamper: {
    desc:'Ukázka proč je blockchain neměnný — změní-li útočník data v jednom bloku, rozbije celý zbytek řetězu.',
    facts:[{k:'Detekce',v:'Hash mismatch'},{k:'Prevence',v:'Proof of Work'},{k:'51% útok',v:'>50% hashrate'},{k:'Náklady útoku',v:'>$5 mld USD (BTC)'}],
    tip:'💡 Klikni Tamper na libovolném bloku a sleduj jak se červeně označí všechny následující!'
  },
  consensus: {
    desc:'Distribuovaná síť uzlů se shoduje na platném řetězu pomocí Nakamoto konsenzu — platí nejdelší (nejtěžší) řetěz.',
    facts:[{k:'Konsenzus',v:'Nakamoto (PoW)'},{k:'Uzlů v BTC',v:'~50 000'},{k:'Finalizace',v:'6 potvrz. (~1h)'},{k:'Alternativy',v:'PoS, DPoS'}],
    tip:'💡 Klikni Simuluj 51% útok — uvidíš jak poctivá síť útok odrazí!'
  },
  transactions: {
    desc:'Bitcoin transakce fungují přes UTXO model — místo zůstatků existují "mince" (kusy BTC) vlastněné adresami.',
    facts:[{k:'Model',v:'UTXO'},{k:'Poplatek',v:'sat/vByte'},{k:'Podpis',v:'ECDSA'},{k:'Skripty',v:'Bitcoin Script'}],
    tip:'💡 Zkus poslat více BTC než je zůstatek — uvidíš jak síť transakci odmítne!'
  },
}

export default function BlockchainSim({ accentColor }: { accentColor:string }) {
  const [tab, setTab] = useState<Tab>('chain')
  const containerRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w:900, h:500 })
  const info = TAB_INFO[tab]
  const panel = INFO_PANEL[tab]

  useEffect(() => {
    const el = containerRef.current; if (!el) return
    const ro = new ResizeObserver(e => {
      const { width, height } = e[0].contentRect
      setSize({ w:Math.floor(width), h:Math.floor(height) })
    })
    ro.observe(el); return () => ro.disconnect()
  }, [])

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', background:C.bg, color:C.txt, fontFamily:'inherit', overflow:'hidden' }}>
      <style>{`@keyframes fadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}.fi{animation:fadeIn .3s ease} @keyframes spin{to{transform:rotate(360deg)}} input,select,textarea{outline:none}`}</style>

      {/* Header */}
      <div style={{ padding:'10px 20px', borderBottom:`1px solid ${C.border}`, display:'flex', alignItems:'center', gap:12, flexShrink:0, background:C.card }}>
        <a href="/student/simulations" style={{ color:C.sec, fontSize:13, textDecoration:'none' }}>← Simulace</a>
        <div style={{ width:1, height:14, background:C.border }}/>
        <span style={{ fontSize:14, fontWeight:700 }}>⛓ Blockchain — interaktivní simulace</span>
      </div>

      {/* Tab bar */}
      <div style={{ display:'flex', borderBottom:`1px solid ${C.border}`, flexShrink:0, background:C.card, overflowX:'auto' }}>
        {(Object.entries(TAB_INFO) as [Tab,typeof TAB_INFO[Tab]][]).map(([id,ti]) => (
          <button key={id} onClick={()=>setTab(id)}
            style={{ flexShrink:0, padding:'10px 14px', background:'transparent', border:'none', borderBottom:`3px solid ${tab===id?ti.color:'transparent'}`, cursor:'pointer', fontFamily:'inherit', display:'flex', flexDirection:'column', alignItems:'center', gap:3, minWidth:100 }}>
            <span style={{ fontSize:20 }}>{ti.icon}</span>
            <span style={{ fontSize:11, fontWeight:700, color:tab===id?ti.color:C.sec }}>{ti.title}</span>
            <span style={{ fontSize:9, color:'#475569' }}>{ti.sub}</span>
          </button>
        ))}
      </div>

      {/* Main */}
      <div style={{ flex:1, display:'flex', minHeight:0, overflow:'hidden' }}>
        {/* Content */}
        <div ref={containerRef} style={{ flex:1, overflow:'hidden', display:'flex', flexDirection:'column' }}>
          <div key={tab} className="fi" style={{ flex:1, overflow:'hidden', display:'flex', flexDirection:'column' }}>
            {tab==='chain'        && <ChainTab />}
            {tab==='mining'       && <MiningTab />}
            {tab==='tamper'       && <TamperTab />}
            {tab==='consensus'    && <ConsensusTab size={size} />}
            {tab==='transactions' && <TransactionsTab />}
          </div>
        </div>

        {/* Right panel */}
        <div style={{ width:252, flexShrink:0, borderLeft:`1px solid ${C.border}`, display:'flex', flexDirection:'column', overflow:'hidden', background:C.card }}>
          <div style={{ flex:1, overflowY:'auto', padding:14 }}>
            <div key={tab} className="fi">
              <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:12 }}>
                <div style={{ width:36, height:36, borderRadius:9, background:info.color+'22', border:`1px solid ${info.color}44`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:20 }}>{info.icon}</div>
                <div>
                  <div style={{ fontSize:13, fontWeight:800, color:'#fff' }}>{info.title}</div>
                  <div style={{ fontSize:10, color:info.color, fontWeight:600 }}>{info.sub}</div>
                </div>
              </div>

              <p style={{ fontSize:11.5, color:'#cbd5e1', lineHeight:1.75, margin:'0 0 12px' }}>{panel.desc}</p>

              <table style={{ width:'100%', borderCollapse:'collapse' as const, marginBottom:12 }}>
                <tbody>
                  {panel.facts.map((f,i)=>(
                    <tr key={i} style={{ borderBottom:`1px solid ${C.border}` }}>
                      <td style={{ padding:'4px 6px', fontSize:10, color:C.sec }}>{f.k}</td>
                      <td style={{ padding:'4px 6px', fontSize:10, color:'#e2e8f0', fontWeight:600, textAlign:'right' as const }}>{f.v}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div style={{ padding:'8px 10px', background:'rgba(251,191,36,.05)', border:'1px solid rgba(251,191,36,.15)', borderRadius:8, marginBottom:14 }}>
                <p style={{ fontSize:11, color:'#fcd34d', margin:0, lineHeight:1.65 }}>{panel.tip}</p>
              </div>

              {/* Nav */}
              <div style={{ borderTop:`1px solid ${C.border}`, paddingTop:12 }}>
                <div style={{ fontSize:9, fontWeight:700, color:C.sec, textTransform:'uppercase', marginBottom:8 }}>Témata</div>
                {(Object.entries(TAB_INFO) as [Tab,typeof TAB_INFO[Tab]][]).map(([id,ti])=>(
                  <button key={id} onClick={()=>setTab(id)}
                    style={{ display:'flex', alignItems:'center', gap:8, width:'100%', padding:'6px 8px', background:tab===id?ti.color+'12':'transparent', border:`1px solid ${tab===id?ti.color+'30':C.border}`, borderRadius:7, cursor:'pointer', fontFamily:'inherit', marginBottom:4 }}>
                    <span style={{ fontSize:14 }}>{ti.icon}</span>
                    <div style={{ textAlign:'left' as const }}>
                      <div style={{ fontSize:11, fontWeight:600, color:tab===id?ti.color:'#94a3b8' }}>{ti.title}</div>
                      <div style={{ fontSize:9, color:'#475569' }}>{ti.sub}</div>
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
