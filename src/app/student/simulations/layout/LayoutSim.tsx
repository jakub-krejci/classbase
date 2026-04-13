'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useCallback, useMemo } from 'react'

// ─── Types ─────────────────────────────────────────────────────────────────────
type Mode = 'flex' | 'grid'
type Tab  = 'controls' | 'code' | 'challenge'

// ─── Flexbox properties ────────────────────────────────────────────────────────
interface FlexProps {
  flexDirection:    'row'|'row-reverse'|'column'|'column-reverse'
  flexWrap:         'nowrap'|'wrap'|'wrap-reverse'
  justifyContent:   'flex-start'|'flex-end'|'center'|'space-between'|'space-around'|'space-evenly'
  alignItems:       'stretch'|'flex-start'|'flex-end'|'center'|'baseline'
  alignContent:     'stretch'|'flex-start'|'flex-end'|'center'|'space-between'|'space-around'
  gap:              number
  // Child props
  flexGrow:         number
  flexShrink:       number
  flexBasis:        string
  alignSelf:        'auto'|'flex-start'|'flex-end'|'center'|'stretch'|'baseline'
  order:            number
}

// ─── Grid properties ──────────────────────────────────────────────────────────
interface GridProps {
  gridTemplateColumns: string
  gridTemplateRows:    string
  gap:                 number
  columnGap:           number
  rowGap:              number
  justifyItems:        'start'|'end'|'center'|'stretch'
  alignItems:          'start'|'end'|'center'|'stretch'
  justifyContent:      'start'|'end'|'center'|'stretch'|'space-between'|'space-around'|'space-evenly'
  alignContent:        'start'|'end'|'center'|'stretch'|'space-between'|'space-around'
  gridAutoFlow:        'row'|'column'|'dense'|'row dense'|'column dense'
}

// ─── Box item ─────────────────────────────────────────────────────────────────
interface Box {
  id: number
  label: string
  color: string
  width:  string   // 'auto' or px value
  height: string
  selected: boolean
  // Grid-specific
  gridColumn: string
  gridRow:    string
}

// ─── Challenges ───────────────────────────────────────────────────────────────
interface Challenge {
  id: number
  title: string
  description: string
  mode: Mode
  target: Record<string,any>
  hint: string
  difficulty: 'easy'|'medium'|'hard'
}

const CHALLENGES: Challenge[] = [
  { id:1, title:'Navbar', description:'Vytvoř navigační lištu: logo vlevo, menu uprostřed, tlačítko vpravo.', mode:'flex',
    target:{ flexDirection:'row', justifyContent:'space-between', alignItems:'center' },
    hint:'justify-content: space-between rozloží prvky na krajní pozice', difficulty:'easy' },
  { id:2, title:'Centrování', description:'Vycentruj jeden box přesně doprostřed kontejneru.', mode:'flex',
    target:{ justifyContent:'center', alignItems:'center' },
    hint:'Potřebuješ oba: justify-content i align-items nastavit na center', difficulty:'easy' },
  { id:3, title:'Holy Grail', description:'Vytvoř rozvržení: header nahoře, sidebar+content+sidebar uprostřed, footer dole.', mode:'flex',
    target:{ flexDirection:'column', flexWrap:'nowrap' },
    hint:'Použij flex-direction: column pro vnější wrapper, a row pro střední sekci', difficulty:'medium' },
  { id:4, title:'Grid 3×3', description:'Vytvoř symetrickou mřížku 3×3 s mezerami 16px.', mode:'grid',
    target:{ gridTemplateColumns:'1fr 1fr 1fr', gap:16 },
    hint:'gridTemplateColumns: repeat(3, 1fr) vytvoří 3 stejně velké sloupce', difficulty:'easy' },
  { id:5, title:'Magazine Layout', description:'Vytvoř magazínové rozvržení: velký hlavní obrázek vlevo (span 2 řádky) a 2 menší vpravo.', mode:'grid',
    target:{ gridTemplateColumns:'2fr 1fr', gridTemplateRows:'1fr 1fr' },
    hint:'Použij grid-column a grid-row na prvním boxu pro span', difficulty:'medium' },
  { id:6, title:'Mosaic', description:'Vytvoř mozaiku kde první box zabírá 2 sloupce a 2 řádky.', mode:'grid',
    target:{ gridTemplateColumns:'repeat(3,1fr)', gridTemplateRows:'repeat(3,1fr)' },
    hint:'Na prvním boxu nastav grid-column: span 2 a grid-row: span 2', difficulty:'hard' },
]

// ─── Default colors ────────────────────────────────────────────────────────────
const BOX_COLORS = ['#3b82f6','#22c55e','#f59e0b','#ec4899','#a855f7','#06b6d4','#ef4444','#84cc16']
const BOX_LABELS = ['A','B','C','D','E','F','G','H']

function makeBoxes(n: number): Box[] {
  return Array.from({length:n},(_,i)=>({
    id:i+1, label:BOX_LABELS[i]||String(i+1), color:BOX_COLORS[i%BOX_COLORS.length],
    width:'auto', height:'auto', selected:false,
    gridColumn:'auto', gridRow:'auto',
  }))
}

const DEFAULT_FLEX: FlexProps = {
  flexDirection:'row', flexWrap:'nowrap', justifyContent:'flex-start',
  alignItems:'stretch', alignContent:'stretch', gap:8,
  flexGrow:0, flexShrink:1, flexBasis:'auto', alignSelf:'auto', order:0,
}

const DEFAULT_GRID: GridProps = {
  gridTemplateColumns:'repeat(3,1fr)', gridTemplateRows:'auto',
  gap:8, columnGap:8, rowGap:8,
  justifyItems:'stretch', alignItems:'stretch',
  justifyContent:'start', alignContent:'start',
  gridAutoFlow:'row',
}

// ─── Prop option definitions ──────────────────────────────────────────────────
type PropDef = { key:string; label:string; options?:string[]; type?:'number'|'text'|'range'; min?:number; max?:number; step?:number; group:string; desc:string }

const FLEX_CONTAINER_PROPS: PropDef[] = [
  { key:'flexDirection',  label:'flex-direction',  options:['row','row-reverse','column','column-reverse'], group:'Direction', desc:'Osa hlavního směru flex kontejneru' },
  { key:'flexWrap',       label:'flex-wrap',        options:['nowrap','wrap','wrap-reverse'],                group:'Direction', desc:'Přetékání na nový řádek/sloupec' },
  { key:'justifyContent', label:'justify-content',  options:['flex-start','flex-end','center','space-between','space-around','space-evenly'], group:'Zarovnání', desc:'Zarovnání podél hlavní osy' },
  { key:'alignItems',     label:'align-items',      options:['stretch','flex-start','flex-end','center','baseline'], group:'Zarovnání', desc:'Zarovnání podél vedlejší osy' },
  { key:'alignContent',   label:'align-content',    options:['stretch','flex-start','flex-end','center','space-between','space-around'], group:'Zarovnání', desc:'Zarovnání více řádků' },
  { key:'gap',            label:'gap',              type:'range', min:0, max:48, step:4, group:'Mezery', desc:'Mezera mezi flex položkami' },
]

const FLEX_CHILD_PROPS: PropDef[] = [
  { key:'flexGrow',   label:'flex-grow',   type:'range', min:0, max:5, step:1, group:'Růst',  desc:'Kolik volného místa zabere (0 = neroste)' },
  { key:'flexShrink', label:'flex-shrink', type:'range', min:0, max:5, step:1, group:'Růst',  desc:'Jak moc se smrskne (1 = normálně)' },
  { key:'flexBasis',  label:'flex-basis',  options:['auto','0','100px','200px','50%','30%'],   group:'Růst',     desc:'Výchozí velikost před distribucí' },
  { key:'alignSelf',  label:'align-self',  options:['auto','flex-start','flex-end','center','stretch','baseline'], group:'Zarovnání', desc:'Přebíjí align-items pro jeden prvek' },
  { key:'order',      label:'order',       type:'range', min:-3, max:10, step:1, group:'Pořadí', desc:'Vizuální pořadí (výchozí: 0)' },
]

const GRID_CONTAINER_PROPS: PropDef[] = [
  { key:'gridTemplateColumns', label:'grid-template-columns', type:'text', group:'Struktura', desc:'Definice sloupců: fr, px, auto, repeat()' },
  { key:'gridTemplateRows',    label:'grid-template-rows',    type:'text', group:'Struktura', desc:'Definice řádků: fr, px, auto, minmax()' },
  { key:'gap',                 label:'gap',                   type:'range', min:0, max:48, step:4, group:'Mezery',   desc:'Mezera mezi buňkami mřížky' },
  { key:'columnGap',           label:'column-gap',            type:'range', min:0, max:48, step:4, group:'Mezery',   desc:'Horizontální mezera' },
  { key:'rowGap',              label:'row-gap',               type:'range', min:0, max:48, step:4, group:'Mezery',   desc:'Vertikální mezera' },
  { key:'justifyItems',        label:'justify-items',         options:['start','end','center','stretch'],             group:'Zarovnání', desc:'Zarovnání obsahu buněk horizontálně' },
  { key:'alignItems',          label:'align-items',           options:['start','end','center','stretch'],             group:'Zarovnání', desc:'Zarovnání obsahu buněk vertikálně' },
  { key:'justifyContent',      label:'justify-content',       options:['start','end','center','stretch','space-between','space-around','space-evenly'], group:'Zarovnání', desc:'Zarovnání mřížky v kontejneru' },
  { key:'alignContent',        label:'align-content',         options:['start','end','center','stretch','space-between','space-around'], group:'Zarovnání', desc:'Zarovnání řádků v kontejneru' },
  { key:'gridAutoFlow',        label:'grid-auto-flow',        options:['row','column','dense','row dense','column dense'], group:'Tok', desc:'Jak se automaticky umisťují položky' },
]

const GRID_CHILD_PROPS: PropDef[] = [
  { key:'gridColumn', label:'grid-column', type:'text', group:'Umístění', desc:'span 2 nebo 1/3 nebo auto' },
  { key:'gridRow',    label:'grid-row',    type:'text', group:'Umístění', desc:'span 2 nebo 1/3 nebo auto' },
]

// ─── Preset layouts ────────────────────────────────────────────────────────────
const FLEX_PRESETS = [
  { name:'Navbar',        fp:{ flexDirection:'row', justifyContent:'space-between', alignItems:'center', gap:16 } },
  { name:'Centered',      fp:{ flexDirection:'row', justifyContent:'center',        alignItems:'center', gap:8 } },
  { name:'Column',        fp:{ flexDirection:'column', justifyContent:'flex-start', alignItems:'stretch', gap:8 } },
  { name:'Wrap Tiles',    fp:{ flexDirection:'row', flexWrap:'wrap', justifyContent:'flex-start', alignItems:'flex-start', gap:12 } },
  { name:'Space-between', fp:{ flexDirection:'row', justifyContent:'space-between', alignItems:'center', gap:0 } },
]

const GRID_PRESETS = [
  { name:'3 sloupce',   gp:{ gridTemplateColumns:'repeat(3,1fr)', gridTemplateRows:'auto', gap:12 } },
  { name:'12-col grid', gp:{ gridTemplateColumns:'repeat(12,1fr)', gridTemplateRows:'auto', gap:8 } },
  { name:'Holy Grail',  gp:{ gridTemplateColumns:'200px 1fr 200px', gridTemplateRows:'auto 1fr auto', gap:8 } },
  { name:'Mosaic',      gp:{ gridTemplateColumns:'repeat(3,1fr)', gridTemplateRows:'repeat(3,80px)', gap:8 } },
  { name:'Sidebar',     gp:{ gridTemplateColumns:'250px 1fr', gridTemplateRows:'auto', gap:16 } },
]

// ─── CSS code generator ────────────────────────────────────────────────────────
function genFlexCSS(fp: FlexProps, boxes: Box[]): string {
  const container = `.container {
  display: flex;
  flex-direction: ${fp.flexDirection};
  flex-wrap: ${fp.flexWrap};
  justify-content: ${fp.justifyContent};
  align-items: ${fp.alignItems};
  align-content: ${fp.alignContent};
  gap: ${fp.gap}px;
}`
  const child = `\n\n.item {
  flex-grow: ${fp.flexGrow};
  flex-shrink: ${fp.flexShrink};
  flex-basis: ${fp.flexBasis};
  align-self: ${fp.alignSelf};
  order: ${fp.order};
}`
  const selected = boxes.filter(b=>b.selected)
  const sel = selected.length > 0 ? selected.map(b => `\n\n/* Box ${b.label} */\n.item-${b.label.toLowerCase()} {\n  align-self: ${fp.alignSelf};\n  order: ${fp.order};\n  flex-grow: ${fp.flexGrow};\n}`).join('') : ''
  return container + child + sel
}

function genGridCSS(gp: GridProps, boxes: Box[]): string {
  const container = `.container {
  display: grid;
  grid-template-columns: ${gp.gridTemplateColumns};
  grid-template-rows: ${gp.gridTemplateRows};
  gap: ${gp.gap}px;
  justify-items: ${gp.justifyItems};
  align-items: ${gp.alignItems};
  justify-content: ${gp.justifyContent};
  align-content: ${gp.alignContent};
  grid-auto-flow: ${gp.gridAutoFlow};
}`
  const custom = boxes.filter(b=>b.gridColumn!=='auto'||b.gridRow!=='auto')
  const items = custom.map(b=>`\n\n.item-${b.label.toLowerCase()} {\n  grid-column: ${b.gridColumn};\n  grid-row: ${b.gridRow};\n}`).join('')
  return container + items
}

// ─── Main component ─────────────────────────────────────────────────────────────
const C = { bg:'#090B10', card:'#11141D', border:'rgba(255,255,255,0.07)', txt:'#fff', sec:'#8892a4' }

export default function LayoutSim({ accentColor }: { accentColor: string }) {
  const [mode, setMode]             = useState<Mode>('flex')
  const [tab, setTab]               = useState<Tab>('controls')
  const [boxes, setBoxes]           = useState<Box[]>(makeBoxes(5))
  const [flexProps, setFlexProps]   = useState<FlexProps>(DEFAULT_FLEX)
  const [gridProps, setGridProps]   = useState<GridProps>(DEFAULT_GRID)
  const [selectedBox, setSelectedBox] = useState<number|null>(null)
  const [challenge, setChallenge]   = useState<Challenge|null>(null)
  const [showHint, setShowHint]     = useState(false)
  const [copied, setCopied]         = useState(false)

  const setFP = (key: string, val: any) => setFlexProps(p => ({...p,[key]:val}))
  const setGP = (key: string, val: any) => setGridProps(p => ({...p,[key]:val}))

  const containerStyle = useMemo((): React.CSSProperties => {
    if (mode === 'flex') return {
      display:'flex',
      flexDirection: flexProps.flexDirection as any,
      flexWrap: flexProps.flexWrap as any,
      justifyContent: flexProps.justifyContent,
      alignItems: flexProps.alignItems,
      alignContent: flexProps.alignContent,
      gap: flexProps.gap,
      width:'100%', height:'100%', padding:8, boxSizing:'border-box',
    }
    return {
      display:'grid',
      gridTemplateColumns: gridProps.gridTemplateColumns,
      gridTemplateRows: gridProps.gridTemplateRows,
      gap: gridProps.gap,
      columnGap: gridProps.columnGap,
      rowGap: gridProps.rowGap,
      justifyItems: gridProps.justifyItems as any,
      alignItems: gridProps.alignItems as any,
      justifyContent: gridProps.justifyContent as any,
      alignContent: gridProps.alignContent as any,
      gridAutoFlow: gridProps.gridAutoFlow as any,
      width:'100%', height:'100%', padding:8, boxSizing:'border-box',
    }
  }, [mode, flexProps, gridProps])

  const boxStyle = (box: Box): React.CSSProperties => {
    const isSelected = selectedBox === box.id
    const base: React.CSSProperties = {
      background: box.color+'33',
      border: `2px solid ${box.color}${isSelected?'':'88'}`,
      borderRadius: 8,
      display:'flex', alignItems:'center', justifyContent:'center',
      fontWeight:800, fontSize:15, color:'#fff',
      cursor:'pointer', userSelect:'none',
      position:'relative',
      minWidth:36, minHeight:36,
      outline: isSelected ? `3px solid ${box.color}` : 'none',
      outlineOffset: 2,
      transition:'all .15s',
      boxShadow: isSelected ? `0 0 12px ${box.color}55` : 'none',
    }
    if (mode === 'flex') {
      if (isSelected) Object.assign(base, {
        flexGrow: flexProps.flexGrow,
        flexShrink: flexProps.flexShrink,
        flexBasis: flexProps.flexBasis,
        alignSelf: flexProps.alignSelf,
        order: flexProps.order,
      })
    } else {
      if (box.gridColumn !== 'auto') base.gridColumn = box.gridColumn
      if (box.gridRow    !== 'auto') base.gridRow    = box.gridRow
    }
    if (box.width  !== 'auto') base.width  = box.width
    if (box.height !== 'auto') base.height = box.height
    return base
  }

  const code = mode === 'flex' ? genFlexCSS(flexProps, boxes) : genGridCSS(gridProps, boxes)

  const copyCode = () => {
    navigator.clipboard.writeText(code)
    setCopied(true); setTimeout(()=>setCopied(false), 2000)
  }

  const applyPreset = (fp?: Partial<FlexProps>, gp?: Partial<GridProps>) => {
    if (fp) setFlexProps(p => ({...p,...fp}))
    if (gp) setGridProps(p => ({...p,...gp}))
  }

  const applyChallenge = (ch: Challenge) => {
    setChallenge(ch); setMode(ch.mode); setShowHint(false)
    setBoxes(makeBoxes(ch.mode==='flex'?5:6))
    if (ch.mode==='flex') setFlexProps({...DEFAULT_FLEX,...ch.target as any})
    else setGridProps({...DEFAULT_GRID,...ch.target as any})
  }

  const resetChallenge = () => { setChallenge(null); setBoxes(makeBoxes(5)); setFlexProps(DEFAULT_FLEX); setGridProps(DEFAULT_GRID) }

  // ── Render prop control ─────────────────────────────────────────────────────
  const renderProp = (prop: PropDef, val: any, setter: (k:string,v:any)=>void) => (
    <div key={prop.key} style={{ marginBottom:10 }}>
      <div style={{ display:'flex', justifyContent:'space-between', marginBottom:3 }}>
        <code style={{ fontSize:10, color:accentColor, fontFamily:'monospace' }}>{prop.label}</code>
        <span style={{ fontSize:10, color:'#e2e8f0', fontFamily:'monospace', fontWeight:700 }}>
          {prop.type==='range'?`${val}px`:val}
        </span>
      </div>
      <div style={{ fontSize:9, color:C.sec, marginBottom:4, lineHeight:1.4 }}>{prop.desc}</div>
      {prop.options ? (
        <div style={{ display:'flex', flexWrap:'wrap' as const, gap:3 }}>
          {prop.options.map(opt => (
            <button key={opt} onClick={()=>setter(prop.key, opt)}
              style={{ padding:'3px 7px', background:val===opt?accentColor+'33':'rgba(255,255,255,.05)', color:val===opt?accentColor:'#64748b', border:`1px solid ${val===opt?accentColor+'55':C.border}`, borderRadius:5, cursor:'pointer', fontFamily:'monospace', fontSize:9, fontWeight:val===opt?700:400 }}>
              {opt}
            </button>
          ))}
        </div>
      ) : prop.type==='range' ? (
        <div style={{ display:'flex', gap:6, alignItems:'center' }}>
          <input type="range" min={prop.min} max={prop.max} step={prop.step} value={val}
            onChange={e=>setter(prop.key,+e.target.value)}
            style={{ flex:1, accentColor, height:4 }}/>
          <span style={{ fontSize:10, color:'#94a3b8', minWidth:28, textAlign:'right' as const }}>{val}</span>
        </div>
      ) : (
        <input value={val} onChange={e=>setter(prop.key,e.target.value)}
          style={{ width:'100%', padding:'5px 8px', background:'#0d1117', color:accentColor, border:`1px solid ${C.border}`, borderRadius:6, fontSize:11, fontFamily:'monospace', outline:'none', boxSizing:'border-box' as const }}/>
      )}
    </div>
  )

  const containerProps = mode==='flex' ? FLEX_CONTAINER_PROPS : GRID_CONTAINER_PROPS
  const childProps     = mode==='flex' ? FLEX_CHILD_PROPS     : GRID_CHILD_PROPS
  const propVals       = mode==='flex' ? flexProps as any      : gridProps as any
  const propSetter     = mode==='flex' ? setFP                 : setGP

  // Group props
  const grouped = (props: PropDef[]) => {
    const groups: Record<string,PropDef[]> = {}
    props.forEach(p => { if(!groups[p.group]) groups[p.group]=[]; groups[p.group].push(p) })
    return groups
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', background:C.bg, color:C.txt, fontFamily:'inherit', overflow:'hidden' }}>
      <style>{`
        @keyframes fadeIn{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}
        .fi{animation:fadeIn .25s ease}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}
        input[type=range]{cursor:pointer}
        input,select{outline:none}
        .prop-group{margin-bottom:14px}
        .box-hover:hover{transform:scale(1.04);z-index:10}
      `}</style>

      {/* ── Header ── */}
      <div style={{ padding:'10px 18px', borderBottom:`1px solid ${C.border}`, display:'flex', alignItems:'center', gap:12, flexShrink:0, background:C.card }}>
        <a href="/student/simulations" style={{ color:C.sec, fontSize:13, textDecoration:'none' }}>← Simulace</a>
        <div style={{ width:1, height:14, background:C.border }}/>
        <span style={{ fontSize:14, fontWeight:700 }}>📦 Flexbox / Grid Playground</span>
        {/* Mode switcher */}
        <div style={{ marginLeft:8, display:'flex', border:`1px solid ${C.border}`, borderRadius:8, overflow:'hidden' }}>
          {(['flex','grid'] as Mode[]).map(m=>(
            <button key={m} onClick={()=>{ setMode(m); setSelectedBox(null) }}
              style={{ padding:'5px 18px', background:mode===m?accentColor:'transparent', color:mode===m?'#000':'#94a3b8', border:'none', cursor:'pointer', fontFamily:'inherit', fontSize:12, fontWeight:700 }}>
              {m==='flex'?'Flexbox':'CSS Grid'}
            </button>
          ))}
        </div>
        <div style={{ marginLeft:'auto', display:'flex', gap:8, alignItems:'center' }}>
          {/* Box count */}
          <label style={{ fontSize:10, color:C.sec, display:'flex', alignItems:'center', gap:6 }}>
            Krabičky:
            <input type="range" min={1} max={8} value={boxes.length}
              onChange={e=>setBoxes(makeBoxes(+e.target.value))}
              style={{ width:70, accentColor }}/>
            <span style={{ color:C.txt, minWidth:14 }}>{boxes.length}</span>
          </label>
        </div>
      </div>

      {/* ── Main layout: left controls | center preview | right info ── */}
      <div style={{ flex:1, display:'flex', minHeight:0, overflow:'hidden' }}>

        {/* ══ LEFT PANEL: controls ══ */}
        <div style={{ width:240, flexShrink:0, borderRight:`1px solid ${C.border}`, display:'flex', flexDirection:'column', overflow:'hidden', background:C.card }}>
          {/* Tabs */}
          <div style={{ display:'flex', borderBottom:`1px solid ${C.border}`, flexShrink:0 }}>
            {([['controls','⚙️','Vlastnosti'],['code','</>', 'Kód'],['challenge','🏆','Výzvy']] as [Tab,string,string][]).map(([t,icon,label])=>(
              <button key={t} onClick={()=>setTab(t)}
                style={{ flex:1, padding:'8px 4px', background:tab===t?C.bg:'transparent', border:'none', borderBottom:`2px solid ${tab===t?accentColor:'transparent'}`, cursor:'pointer', fontFamily:'inherit', fontSize:10, fontWeight:700, color:tab===t?accentColor:C.sec, display:'flex', flexDirection:'column', alignItems:'center', gap:2 }}>
                <span style={{ fontSize:14 }}>{icon}</span>{label}
              </button>
            ))}
          </div>

          <div style={{ flex:1, overflowY:'auto', padding:12 }}>
            {tab==='controls' && (
              <div key={mode} className="fi">
                {/* Presets */}
                <div style={{ marginBottom:12 }}>
                  <div style={{ fontSize:9, fontWeight:700, color:C.sec, textTransform:'uppercase' as const, letterSpacing:'.06em', marginBottom:6 }}>Presets</div>
                  <div style={{ display:'flex', flexWrap:'wrap' as const, gap:4 }}>
                    {(mode==='flex'?FLEX_PRESETS:GRID_PRESETS).map(p=>(
                      <button key={p.name} onClick={()=>applyPreset((p as any).fp, (p as any).gp)}
                        style={{ padding:'3px 8px', background:'rgba(255,255,255,.06)', color:'#94a3b8', border:`1px solid ${C.border}`, borderRadius:6, cursor:'pointer', fontSize:10, fontFamily:'inherit' }}>
                        {p.name}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Container props */}
                <div style={{ marginBottom:4 }}>
                  <div style={{ fontSize:9, fontWeight:700, color:accentColor, textTransform:'uppercase' as const, letterSpacing:'.06em', marginBottom:8, padding:'4px 8px', background:accentColor+'12', borderRadius:5 }}>
                    .container — родительский
                  </div>
                  {Object.entries(grouped(containerProps)).map(([grp,props])=>(
                    <div key={grp} className="prop-group">
                      <div style={{ fontSize:8, fontWeight:700, color:'#475569', textTransform:'uppercase' as const, letterSpacing:'.06em', marginBottom:6, borderBottom:`1px solid ${C.border}`, paddingBottom:4 }}>{grp}</div>
                      {props.map(p=>renderProp(p, propVals[p.key], propSetter))}
                    </div>
                  ))}
                </div>

                {/* Child props */}
                <div style={{ marginTop:8 }}>
                  <div style={{ fontSize:9, fontWeight:700, color:'#f59e0b', textTransform:'uppercase' as const, letterSpacing:'.06em', marginBottom:8, padding:'4px 8px', background:'rgba(245,158,11,.1)', borderRadius:5, display:'flex', alignItems:'center', gap:6 }}>
                    .item — дочерний
                    {selectedBox&&<span style={{ fontSize:8, color:'#fff', background:'#f59e0b', borderRadius:10, padding:'1px 6px' }}>Box {boxes.find(b=>b.id===selectedBox)?.label}</span>}
                  </div>
                  {selectedBox
                    ? Object.entries(grouped(childProps)).map(([grp,props])=>(
                        <div key={grp} className="prop-group">
                          <div style={{ fontSize:8, fontWeight:700, color:'#475569', textTransform:'uppercase' as const, letterSpacing:'.06em', marginBottom:6, borderBottom:`1px solid ${C.border}`, paddingBottom:4 }}>{grp}</div>
                          {props.map(p => {
                            const boxVal = selectedBox && mode==='grid'
                              ? (boxes.find(b=>b.id===selectedBox) as any)?.[p.key]
                              : flexProps[p.key as keyof FlexProps]
                            const setter2 = (k:string,v:any) => {
                              if (mode==='grid') {
                                setBoxes(prev=>prev.map(b=>b.id===selectedBox?{...b,[k]:v}:b))
                              } else {
                                setFP(k,v)
                              }
                            }
                            return renderProp(p, boxVal ?? (p.type==='range'?0:'auto'), setter2)
                          })}
                          {/* Box size overrides */}
                          <div style={{ marginBottom:10 }}>
                            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:3 }}>
                              <code style={{ fontSize:10, color:'#94a3b8', fontFamily:'monospace' }}>width / height</code>
                            </div>
                            {(['width','height'] as const).map(dim=>(
                              <div key={dim} style={{ display:'flex', gap:4, marginBottom:4, alignItems:'center' }}>
                                <span style={{ fontSize:9, color:C.sec, width:40 }}>{dim}:</span>
                                <input value={boxes.find(b=>b.id===selectedBox)?.[dim]||'auto'}
                                  onChange={e=>setBoxes(prev=>prev.map(b=>b.id===selectedBox?{...b,[dim]:e.target.value}:b))}
                                  placeholder="auto / 100px / 50%"
                                  style={{ flex:1, padding:'3px 7px', background:'#0d1117', color:'#e2e8f0', border:`1px solid ${C.border}`, borderRadius:5, fontSize:10, fontFamily:'monospace', outline:'none' }}/>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))
                    : <div style={{ padding:'12px', background:'rgba(245,158,11,.05)', border:'1px solid rgba(245,158,11,.15)', borderRadius:8, fontSize:10, color:'#fcd34d', lineHeight:1.6 }}>
                        👆 Klikni na krabičku v náhledu pro nastavení vlastností daného prvku.
                      </div>
                  }
                </div>
              </div>
            )}

            {tab==='code' && (
              <div className="fi">
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
                  <span style={{ fontSize:10, fontWeight:700, color:C.sec, textTransform:'uppercase' as const }}>Generovaný CSS</span>
                  <button onClick={copyCode}
                    style={{ padding:'3px 10px', background:copied?'rgba(34,197,94,.2)':'rgba(255,255,255,.08)', color:copied?'#4ade80':C.sec, border:`1px solid ${copied?'rgba(34,197,94,.3)':C.border}`, borderRadius:6, cursor:'pointer', fontSize:10, fontFamily:'inherit' }}>
                    {copied?'✓ Zkopírováno':'📋 Kopírovat'}
                  </button>
                </div>
                <pre style={{ background:'#0d1117', borderRadius:8, padding:12, fontSize:10, fontFamily:'monospace', color:'#e2e8f0', lineHeight:1.7, overflowX:'auto', whiteSpace:'pre-wrap' as const, border:`1px solid ${C.border}`, margin:0 }}>
                  {code.split('\n').map((line,i) => {
                    const isProperty = /^\s+[\w-]+:/.test(line)
                    const isProp = isProperty && line.includes(':')
                    const [prop,...rest] = isProp ? line.split(':') : [line]
                    return (
                      <span key={i}>
                        {isProp ? (
                          <><span style={{ color:'#60a5fa' }}>{prop}</span>:<span style={{ color:'#a3e635' }}>{rest.join(':')}</span></>
                        ) : (
                          <span style={{ color: line.includes('.')?'#f472b6':line.includes('{')||line.includes('}')?'#94a3b8':'#e2e8f0' }}>{line}</span>
                        )}
                        {'\n'}
                      </span>
                    )
                  })}
                </pre>

                {/* HTML structure */}
                <div style={{ marginTop:12, fontSize:10, fontWeight:700, color:C.sec, textTransform:'uppercase' as const, marginBottom:6 }}>HTML struktura</div>
                <pre style={{ background:'#0d1117', borderRadius:8, padding:12, fontSize:10, fontFamily:'monospace', color:'#e2e8f0', lineHeight:1.7, border:`1px solid ${C.border}`, margin:0, whiteSpace:'pre-wrap' as const }}>
                  {`<div class="container">\n${boxes.map(b=>`  <div class="item item-${b.label.toLowerCase()}">${b.label}</div>`).join('\n')}\n</div>`}
                </pre>
              </div>
            )}

            {tab==='challenge' && (
              <div className="fi">
                {challenge ? (
                  <div>
                    <div style={{ padding:'10px 12px', background:`${accentColor}15`, border:`1px solid ${accentColor}33`, borderRadius:9, marginBottom:12 }}>
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:4 }}>
                        <span style={{ fontSize:12, fontWeight:800, color:'#fff' }}>{challenge.title}</span>
                        <span style={{ fontSize:9, padding:'2px 7px', borderRadius:10, background: challenge.difficulty==='easy'?'rgba(34,197,94,.2)':challenge.difficulty==='medium'?'rgba(245,158,11,.2)':'rgba(239,68,68,.2)', color: challenge.difficulty==='easy'?'#4ade80':challenge.difficulty==='medium'?'#fbbf24':'#f87171' }}>
                          {challenge.difficulty}
                        </span>
                      </div>
                      <p style={{ fontSize:11, color:'#94a3b8', margin:0, lineHeight:1.65 }}>{challenge.description}</p>
                    </div>
                    {!showHint
                      ? <button onClick={()=>setShowHint(true)} style={{ width:'100%', padding:'7px', background:'rgba(251,191,36,.08)', color:'#fcd34d', border:'1px solid rgba(251,191,36,.2)', borderRadius:7, cursor:'pointer', fontSize:11, fontFamily:'inherit', marginBottom:8 }}>💡 Zobrazit nápovědu</button>
                      : <div style={{ padding:'8px 10px', background:'rgba(251,191,36,.07)', border:'1px solid rgba(251,191,36,.2)', borderRadius:7, marginBottom:8, fontSize:11, color:'#fcd34d', lineHeight:1.6 }}>{challenge.hint}</div>
                    }
                    <button onClick={resetChallenge} style={{ width:'100%', padding:'6px', background:'rgba(255,255,255,.07)', color:C.sec, border:`1px solid ${C.border}`, borderRadius:7, cursor:'pointer', fontSize:11, fontFamily:'inherit' }}>
                      ↺ Zpět na výzvy
                    </button>
                  </div>
                ) : (
                  <div>
                    <div style={{ fontSize:10, fontWeight:700, color:C.sec, textTransform:'uppercase' as const, letterSpacing:'.06em', marginBottom:10 }}>Výzvy</div>
                    {CHALLENGES.map(ch=>(
                      <button key={ch.id} onClick={()=>applyChallenge(ch)}
                        style={{ width:'100%', textAlign:'left' as const, padding:'9px 10px', background:'rgba(255,255,255,.03)', border:`1px solid ${C.border}`, borderRadius:8, cursor:'pointer', fontFamily:'inherit', marginBottom:6, display:'flex', alignItems:'center', gap:8 }}>
                        <div style={{ width:24, height:24, borderRadius:6, background: ch.difficulty==='easy'?'rgba(34,197,94,.15)':ch.difficulty==='medium'?'rgba(245,158,11,.15)':'rgba(239,68,68,.15)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, flexShrink:0 }}>
                          {ch.mode==='flex'?'📦':'⚏'}
                        </div>
                        <div>
                          <div style={{ fontSize:11, fontWeight:700, color:'#fff', marginBottom:1 }}>{ch.title}</div>
                          <div style={{ fontSize:9, color:C.sec }}>{ch.mode.toUpperCase()} · {ch.difficulty}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ══ CENTER: preview ══ */}
        <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }}>
          {/* Preview toolbar */}
          <div style={{ padding:'6px 14px', borderBottom:`1px solid ${C.border}`, flexShrink:0, background:C.card, display:'flex', alignItems:'center', gap:8 }}>
            <span style={{ fontSize:11, color:C.sec }}>
              <code style={{ color:accentColor }}>display: {mode}</code>
              {mode==='flex' && <> · <code style={{ color:'#94a3b8' }}>{flexProps.flexDirection}</code> · <code style={{ color:'#94a3b8' }}>{flexProps.justifyContent}</code> · <code style={{ color:'#94a3b8' }}>{flexProps.alignItems}</code></>}
              {mode==='grid' && <> · <code style={{ color:'#94a3b8' }}>{gridProps.gridTemplateColumns}</code></>}
            </span>
            {selectedBox && (
              <span style={{ fontSize:10, color:'#f59e0b', marginLeft:4 }}>· Vybrán Box {boxes.find(b=>b.id===selectedBox)?.label}</span>
            )}
            <button onClick={()=>setSelectedBox(null)} style={{ marginLeft:'auto', padding:'3px 10px', background:'rgba(255,255,255,.06)', color:C.sec, border:`1px solid ${C.border}`, borderRadius:6, cursor:'pointer', fontSize:10, fontFamily:'inherit', opacity:selectedBox?1:0.3 }}>
              ✕ Odebrat výběr
            </button>
          </div>

          {/* Preview area */}
          <div style={{ flex:1, overflow:'hidden', position:'relative' as const, background:'#0a0d14' }}>
            {/* Grid/Flex background pattern */}
            <div style={{ position:'absolute' as const, inset:0, backgroundImage:'radial-gradient(circle,rgba(255,255,255,.04) 1px,transparent 1px)', backgroundSize:'20px 20px', pointerEvents:'none' }}/>

            {/* Container */}
            <div style={{ position:'relative' as const, width:'calc(100% - 32px)', height:'calc(100% - 32px)', margin:16, border:`2px dashed ${accentColor}44`, borderRadius:10, overflow:'hidden' }}>
              {/* Container label */}
              <div style={{ position:'absolute' as const, top:-10, left:8, background:C.bg, padding:'0 6px', fontSize:9, color:accentColor, fontFamily:'monospace', fontWeight:700, zIndex:10 }}>
                .container
              </div>

              <div style={containerStyle}>
                {boxes.map(box => (
                  <div key={box.id}
                    className="box-hover"
                    style={boxStyle(box)}
                    onClick={()=>setSelectedBox(box.id===selectedBox?null:box.id)}>
                    <span style={{ fontSize:16, fontWeight:900, textShadow:'0 1px 4px rgba(0,0,0,.5)' }}>{box.label}</span>
                    {selectedBox===box.id && (
                      <div style={{ position:'absolute' as const, top:-9, right:0, fontSize:8, color:'#fff', background:box.color, borderRadius:10, padding:'1px 5px', fontWeight:700, whiteSpace:'nowrap' as const }}>
                        vybrán
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ── Explainer strip ── */}
          <div style={{ padding:'8px 16px', borderTop:`1px solid ${C.border}`, flexShrink:0, background:C.card, display:'flex', gap:16, overflowX:'auto' }}>
            {mode==='flex' ? (
              <>
                <ExplainerPill label="Hlavní osa" value={flexProps.flexDirection==='row'||flexProps.flexDirection==='row-reverse'?'→ Horizontální':'↓ Vertikální'} color={accentColor}/>
                <ExplainerPill label="justify-content" value={flexProps.justifyContent} color='#60a5fa'/>
                <ExplainerPill label="align-items"     value={flexProps.alignItems}     color='#4ade80'/>
                <ExplainerPill label="flex-wrap"       value={flexProps.flexWrap}       color='#f59e0b'/>
                <ExplainerPill label="gap"             value={`${flexProps.gap}px`}     color='#a78bfa'/>
              </>
            ) : (
              <>
                <ExplainerPill label="columns" value={gridProps.gridTemplateColumns} color={accentColor}/>
                <ExplainerPill label="rows"    value={gridProps.gridTemplateRows}    color='#60a5fa'/>
                <ExplainerPill label="gap"     value={`${gridProps.gap}px`}          color='#4ade80'/>
                <ExplainerPill label="justify-items" value={gridProps.justifyItems}  color='#f59e0b'/>
                <ExplainerPill label="align-items"   value={gridProps.alignItems}    color='#a78bfa'/>
              </>
            )}
          </div>
        </div>

        {/* ══ RIGHT PANEL: visual cheatsheet ══ */}
        <div style={{ width:220, flexShrink:0, borderLeft:`1px solid ${C.border}`, display:'flex', flexDirection:'column', overflow:'hidden', background:C.card }}>
          <div style={{ flex:1, overflowY:'auto', padding:12 }}>
            <div style={{ fontSize:9, fontWeight:700, color:C.sec, textTransform:'uppercase' as const, letterSpacing:'.06em', marginBottom:10 }}>
              {mode==='flex'?'Flexbox':'CSS Grid'} — vizuální reference
            </div>

            {mode==='flex' ? <FlexCheatsheet current={flexProps} accent={accentColor}/> : <GridCheatsheet current={gridProps} accent={accentColor}/>}

            {/* Tip */}
            <div style={{ marginTop:12, padding:'8px 10px', background:'rgba(251,191,36,.05)', border:'1px solid rgba(251,191,36,.15)', borderRadius:8 }}>
              <p style={{ fontSize:10, color:'#fcd34d', margin:0, lineHeight:1.65 }}>
                {mode==='flex'
                  ? '💡 Flexbox je jednorozměrný — řídí buď řádek nebo sloupec. Použij justify-content pro hlavní osu, align-items pro vedlejší.'
                  : '💡 CSS Grid je dvourozměrný — řídí řádky i sloupce zároveň. 1fr = zlomek volného místa.'}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Mini components ──────────────────────────────────────────────────────────
function ExplainerPill({ label, value, color }: { label:string; value:string; color:string }) {
  return (
    <div style={{ flexShrink:0, display:'flex', flexDirection:'column' as const, gap:1 }}>
      <span style={{ fontSize:8, color:'#475569', textTransform:'uppercase' as const }}>{label}</span>
      <code style={{ fontSize:10, color, fontWeight:700, whiteSpace:'nowrap' as const }}>{value}</code>
    </div>
  )
}

// ─── Flexbox visual cheatsheet ────────────────────────────────────────────────
function FlexCheatsheet({ current, accent }: { current:FlexProps; accent:string }) {
  const Mini = ({ jc, ai, dir='row', label }: { jc:string; ai:string; dir?:string; label:string }) => {
    const isActive = current.justifyContent===jc && current.alignItems===ai && (current.flexDirection as string)===dir
    return (
      <div onClick={()=>{}} style={{ padding:4, borderRadius:6, border:`1px solid ${isActive?accent:C.border}`, background:isActive?accent+'15':'transparent', cursor:'default', marginBottom:4 }}>
        <div style={{ display:'flex', flexDirection:dir as any, justifyContent:jc, alignItems:ai, height:28, gap:2, marginBottom:3 }}>
          {[0,1,2].map(i=><div key={i} style={{ width:8, height:8, borderRadius:2, background:isActive?accent:'#334155', flexShrink:0 }}/>)}
        </div>
        <div style={{ fontSize:7.5, color:isActive?accent:'#475569', fontFamily:'monospace', textAlign:'center' as const, lineHeight:1.4 }}>
          jc:{jc.replace('flex-','f-').replace('space-','sp-')}<br/>ai:{ai.replace('flex-','f-')}
        </div>
      </div>
    )
  }

  return (
    <div>
      <div style={{ fontSize:9, color:C.sec, marginBottom:6, fontWeight:600 }}>justify-content</div>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:3, marginBottom:10 }}>
        {['flex-start','center','flex-end','space-between','space-around','space-evenly'].map(jc=>(
          <div key={jc} style={{ padding:'3px 5px', borderRadius:5, border:`1px solid ${current.justifyContent===jc?accent:C.border}`, background:current.justifyContent===jc?accent+'15':'transparent', cursor:'default' }}>
            <div style={{ display:'flex', flexDirection:'row', justifyContent:jc as any, alignItems:'center', height:14, gap:1, marginBottom:2 }}>
              {[0,1,2].map(i=><div key={i} style={{ width:5, height:10, borderRadius:1, background:current.justifyContent===jc?accent:'#334155' }}/>)}
            </div>
            <div style={{ fontSize:7, color:current.justifyContent===jc?accent:'#475569', fontFamily:'monospace', whiteSpace:'nowrap' as const }}>
              {jc.replace('flex-','f-').replace('space-','sp-')}
            </div>
          </div>
        ))}
      </div>

      <div style={{ fontSize:9, color:C.sec, marginBottom:6, fontWeight:600 }}>align-items</div>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:3 }}>
        {['flex-start','center','flex-end','stretch','baseline'].map(ai=>(
          <div key={ai} style={{ padding:'3px 5px', borderRadius:5, border:`1px solid ${current.alignItems===ai?accent:C.border}`, background:current.alignItems===ai?accent+'15':'transparent', cursor:'default' }}>
            <div style={{ display:'flex', flexDirection:'row', alignItems:ai==='baseline'?'flex-end':ai as any, height:20, gap:1, marginBottom:2, justifyContent:'center' }}>
              {[10,16,8].map((h,i)=><div key={i} style={{ width:7, height:ai==='stretch'?18:h, borderRadius:1, background:current.alignItems===ai?accent:'#334155' }}/>)}
            </div>
            <div style={{ fontSize:7, color:current.alignItems===ai?accent:'#475569', fontFamily:'monospace' }}>
              {ai.replace('flex-','f-')}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Grid visual cheatsheet ───────────────────────────────────────────────────
function GridCheatsheet({ current, accent }: { current:GridProps; accent:string }) {
  const templates = [
    { label:'1fr 1fr 1fr',cols:3,fracs:[1,1,1] },
    { label:'2fr 1fr',    cols:2,fracs:[2,1] },
    { label:'1fr 2fr 1fr',cols:3,fracs:[1,2,1] },
    { label:'200px 1fr',  cols:2,fracs:[1.2,2.8] },
    { label:'repeat(4,1fr)',cols:4,fracs:[1,1,1,1] },
  ]
  return (
    <div>
      <div style={{ fontSize:9, color:C.sec, marginBottom:6, fontWeight:600 }}>grid-template-columns</div>
      <div style={{ display:'flex', flexDirection:'column' as const, gap:4 }}>
        {templates.map(t=>(
          <div key={t.label} style={{ padding:'5px 7px', borderRadius:6, border:`1px solid ${current.gridTemplateColumns===t.label?accent:C.border}`, background:current.gridTemplateColumns===t.label?accent+'12':'transparent', cursor:'default' }}>
            <div style={{ display:'grid', gridTemplateColumns:t.fracs.map(f=>`${f}fr`).join(' '), gap:2, height:16, marginBottom:3 }}>
              {t.fracs.map((_,i)=><div key={i} style={{ borderRadius:2, background:current.gridTemplateColumns===t.label?accent:'#1e293b' }}/>)}
            </div>
            <code style={{ fontSize:8, color:current.gridTemplateColumns===t.label?accent:'#475569', fontFamily:'monospace' }}>{t.label}</code>
          </div>
        ))}
      </div>

      <div style={{ fontSize:9, color:C.sec, marginBottom:6, fontWeight:600, marginTop:10 }}>justify-items / align-items</div>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:3 }}>
        {['start','center','end','stretch'].map(v=>(
          <div key={v} style={{ padding:'4px', borderRadius:5, border:`1px solid ${current.justifyItems===v?accent:C.border}`, background:current.justifyItems===v?accent+'15':'transparent', cursor:'default' }}>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:1, height:18, justifyItems:v as any, alignItems:v as any, marginBottom:2 }}>
              {[0,1,2,3].map(i=><div key={i} style={{ width:v==='stretch'?'100%':6, height:v==='stretch'?'100%':6, borderRadius:1, background:current.justifyItems===v?accent:'#1e293b' }}/>)}
            </div>
            <div style={{ fontSize:7, color:current.justifyItems===v?accent:'#475569', fontFamily:'monospace', textAlign:'center' as const }}>{v}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
