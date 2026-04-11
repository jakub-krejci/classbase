'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useRef } from 'react'
import { PacketSim, PacketInfo } from './PacketSim'
import { TCPUDPSim, TCPUDPInfo } from './TCPUDPSim'
import { DNSSim, DNSInfo } from './DNSSim'
import { ClientServerSim, ClientServerInfo } from './ClientServerSim'

type Tab = 'packets' | 'tcpudp' | 'dns' | 'clientserver'

const C = { bg:'#090B10', card:'#11141D', border:'rgba(255,255,255,0.07)', txt:'#fff', sec:'#8892a4' }

const TAB_INFO: Record<Tab, { icon:string; title:string; subtitle:string; color:string; tagline:string }> = {
  packets:      { icon:'📦', title:'Pakety & Routování', subtitle:'IP / Routing',      color:'#06b6d4', tagline:'Jak datagram putuje přes internet' },
  tcpudp:       { icon:'🤝', title:'TCP vs UDP',          subtitle:'Transport Layer',   color:'#3b82f6', tagline:'Spolehlivý vs. rychlý přenos dat' },
  dns:          { icon:'🔍', title:'DNS Lookup',           subtitle:'Domain Name System',color:'#f59e0b', tagline:'Jak se doménové jméno přeloží na IP' },
  clientserver: { icon:'🏗', title:'Klient–Server',        subtitle:'HTTP / Web Arch.',  color:'#22c55e', tagline:'Jak prohlížeč komunikuje se serverem' },
}

export default function NetworkSim({ accentColor }: { accentColor: string }) {
  const [tab, setTab] = useState<Tab>('packets')
  const [playing, setPlaying] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 900, h: 500 })
  const info = TAB_INFO[tab]

  useEffect(() => {
    const el = containerRef.current; if (!el) return
    const ro = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect
      setSize({ w: Math.floor(width), h: Math.floor(height) })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const TABS: { id: Tab; icon: string; label: string; sub: string }[] = [
    { id:'packets',      icon:'📦', label:'Pakety',       sub:'IP / Routing' },
    { id:'tcpudp',       icon:'🤝', label:'TCP vs UDP',   sub:'Transport' },
    { id:'dns',          icon:'🔍', label:'DNS',          sub:'Name System' },
    { id:'clientserver', icon:'🏗', label:'Klient–Server',sub:'HTTP / Web' },
  ]

  // Tabs that use play/pause
  const isAnimated = tab === 'tcpudp' || tab === 'dns' || tab === 'clientserver'
  // Packets tab is always interactive (no play needed)

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', background:C.bg, color:C.txt, fontFamily:'inherit', overflow:'hidden' }}>
      <style>{`@keyframes fadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}.fi{animation:fadeIn .3s ease}`}</style>

      {/* Header */}
      <div style={{ padding:'10px 20px', borderBottom:`1px solid ${C.border}`, display:'flex', alignItems:'center', gap:12, flexShrink:0, background:C.card }}>
        <a href="/student/simulations" style={{ color:C.sec, fontSize:13, textDecoration:'none' }}>← Simulace</a>
        <div style={{ width:1, height:14, background:C.border }}/>
        <span style={{ fontSize:14, fontWeight:700 }}>🌐 Počítačové sítě</span>
        <div style={{ marginLeft:'auto', display:'flex', gap:10, alignItems:'center' }}>
          {isAnimated && (
            <button onClick={() => setPlaying(p => !p)}
              style={{ padding:'6px 16px', background:playing?'rgba(239,68,68,.15)':'rgba(34,197,94,.15)', color:playing?'#f87171':'#4ade80', border:`1px solid ${playing?'rgba(239,68,68,.3)':'rgba(34,197,94,.3)'}`, borderRadius:8, cursor:'pointer', fontSize:12, fontWeight:700, fontFamily:'inherit' }}>
              {playing ? '⏸ Pauza' : '▶ Auto-play'}
            </button>
          )}
        </div>
      </div>

      {/* Tab bar */}
      <div style={{ display:'flex', borderBottom:`1px solid ${C.border}`, flexShrink:0, background:C.card }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => { setTab(t.id); setPlaying(false) }}
            style={{ flex:1, padding:'10px 6px', background:'transparent', border:'none', borderBottom:`3px solid ${tab===t.id?TAB_INFO[t.id].color:'transparent'}`, cursor:'pointer', fontFamily:'inherit', display:'flex', flexDirection:'column', alignItems:'center', gap:3, transition:'border-color .2s' }}>
            <span style={{ fontSize:20 }}>{t.icon}</span>
            <span style={{ fontSize:11, fontWeight:700, color:tab===t.id?TAB_INFO[t.id].color:C.sec }}>{t.label}</span>
            <span style={{ fontSize:9, color:'#475569' }}>{t.sub}</span>
          </button>
        ))}
      </div>

      {/* Main */}
      <div style={{ flex:1, display:'flex', minHeight:0, overflow:'hidden' }}>

        {/* Canvas area */}
        <div ref={containerRef} style={{ flex:1, position:'relative', overflow:'hidden' }}>
          <div style={{ position:'absolute', top:0, left:0, right:0, height:3, background:`linear-gradient(90deg,transparent,${info.color},transparent)` }}/>

          {/* Pause overlay for animated tabs */}
          {isAnimated && !playing && (
            <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', zIndex:5, pointerEvents:'none' }}>
              <div style={{ padding:'18px 36px', background:'rgba(9,11,16,.88)', border:`1px solid ${info.color}44`, borderRadius:16, textAlign:'center', backdropFilter:'blur(4px)', pointerEvents:'auto' }}>
                <div style={{ fontSize:38, marginBottom:8 }}>{info.icon}</div>
                <div style={{ fontSize:15, fontWeight:700, color:'#fff', marginBottom:4 }}>{info.title}</div>
                <div style={{ fontSize:12, color:C.sec, marginBottom:16 }}>{info.tagline}</div>
                <div style={{ display:'flex', gap:10, justifyContent:'center' }}>
                  <button onClick={() => setPlaying(true)}
                    style={{ padding:'8px 24px', background:info.color, color:'#000', border:'none', borderRadius:8, cursor:'pointer', fontFamily:'inherit', fontSize:13, fontWeight:700 }}>
                    ▶ Auto-play
                  </button>
                  {(tab==='dns'||tab==='clientserver') && (
                    <button onClick={() => {}}
                      style={{ padding:'8px 20px', background:'rgba(255,255,255,.08)', color:'#fff', border:`1px solid ${C.border}`, borderRadius:8, cursor:'pointer', fontFamily:'inherit', fontSize:13 }}>
                      Krok po kroku →
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          <div key={tab} className="fi" style={{ width:'100%', height:'100%' }}>
            {size.w > 0 && (
              <>
                {tab==='packets'      && <PacketSim      size={size} />}
                {tab==='tcpudp'       && <TCPUDPSim      size={size} playing={playing} />}
                {tab==='dns'          && <DNSSim         size={size} playing={playing} />}
                {tab==='clientserver' && <ClientServerSim size={size} playing={playing} />}
              </>
            )}
          </div>
        </div>

        {/* Right info panel */}
        <div style={{ width:270, flexShrink:0, borderLeft:`1px solid ${C.border}`, display:'flex', flexDirection:'column', overflow:'hidden', background:C.card }}>
          <div style={{ flex:1, overflowY:'auto', padding:16 }}>
            <div key={tab} className="fi">
              {/* Header */}
              <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:13 }}>
                <div style={{ width:38, height:38, borderRadius:10, background:info.color+'20', border:`1px solid ${info.color}40`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:20 }}>
                  {info.icon}
                </div>
                <div>
                  <div style={{ fontSize:14, fontWeight:800, color:'#fff' }}>{info.title}</div>
                  <div style={{ fontSize:10, color:info.color, fontWeight:600 }}>{info.subtitle}</div>
                </div>
              </div>

              <div style={{ padding:'7px 10px', background:info.color+'12', border:`1px solid ${info.color}30`, borderRadius:8, marginBottom:14 }}>
                <div style={{ fontSize:11.5, fontWeight:700, color:info.color }}>{info.tagline}</div>
              </div>

              {/* Tab-specific info */}
              {tab==='packets'      && <PacketInfo />}
              {tab==='tcpudp'       && <TCPUDPInfo />}
              {tab==='dns'          && <DNSInfo />}
              {tab==='clientserver' && <ClientServerInfo />}

              {/* Navigation */}
              <div style={{ marginTop:16, borderTop:`1px solid ${C.border}`, paddingTop:13 }}>
                <div style={{ fontSize:9, fontWeight:700, color:C.sec, textTransform:'uppercase', letterSpacing:'.06em', marginBottom:8 }}>Témata</div>
                {TABS.map(t => (
                  <button key={t.id} onClick={() => { setTab(t.id); setPlaying(false) }}
                    style={{ display:'flex', alignItems:'center', gap:8, width:'100%', padding:'6px 8px', background:tab===t.id?TAB_INFO[t.id].color+'12':'transparent', border:`1px solid ${tab===t.id?TAB_INFO[t.id].color+'30':C.border}`, borderRadius:7, cursor:'pointer', fontFamily:'inherit', marginBottom:4, textAlign:'left' as const }}>
                    <span style={{ fontSize:14 }}>{t.icon}</span>
                    <div>
                      <div style={{ fontSize:11, fontWeight:600, color:tab===t.id?TAB_INFO[t.id].color:'#94a3b8' }}>{t.label}</div>
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
