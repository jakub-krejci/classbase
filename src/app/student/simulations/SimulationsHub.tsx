'use client'
import { D } from '@/components/DarkLayout'

const SIMS = [
  {
    id: 'neural-network',
    icon: '🧠',
    title: 'Neuronová síť',
    desc: 'Vizualizace trénování neuronové sítě krok za krokem — pixely, váhy, aktivační funkce, backpropagation.',
    difficulty: 'Střední',
    tags: ['AI', 'Strojové učení'],
    color: '#7c3aed',
    href: '/student/simulations/neural-network',
    ready: true,
  },
  {
    id: 'machine-learning',
    icon: '🤖',
    title: 'Strojové učení',
    desc: 'Dozorované, nedozorované, posilované učení + interaktivní lineární/logistická regrese a SVM.',
    difficulty: 'Lehká',
    tags: ['AI', 'Strojové učení'],
    color: '#a855f7',
    href: '/student/simulations/machine-learning',
    ready: true,
  },
  {
    id: 'networks',
    icon: '🌐',
    title: 'Počítačové sítě',
    desc: 'Pakety & routování, TCP vs UDP, DNS lookup krok za krokem, klient-server architektura a HTTP požadavky.',
    difficulty: 'Lehká',
    tags: ['Sítě', 'Protokoly', 'Web'],
    color: '#0ea5e9',
    href: '/student/simulations/networks',
    ready: true,
  },
  {
    id: 'blockchain',
    icon: '🔗',
    title: 'Blockchain',
    desc: 'Řetěz bloků, mining (Proof of Work), detekce manipulace, konsenzus distribuované sítě a UTXO transakce.',
    difficulty: 'Střední',
    tags: ['Kryptografie', 'Decentralizace'],
    color: '#f59e0b',
    href: '/student/simulations/blockchain',
    ready: true,
  },
  {
    id: 'sorting',
    icon: '📊',
    title: 'Třídící algoritmy',
    desc: 'Bubble, Selection, Insertion, Merge a Quick Sort — vizuální animace s porovnáním složitosti a krok-za-krokem vysvětlením.',
    difficulty: 'Lehká',
    tags: ['Algoritmy'],
    color: '#22c55e',
    href: '/student/simulations/sorting',
    ready: true,
  },
  {
    id: 'crypto',
    icon: '🔐',
    title: 'Kryptografie',
    desc: 'Caesar, Vigenère, SHA-256 hašování, RSA asymetrické šifrování a AES — interaktivní ukázky s animacemi.',
    difficulty: 'Střední',
    tags: ['Bezpečnost', 'Matematika'],
    color: '#ef4444',
    href: '/student/simulations/crypto',
    ready: true,
  },
  {
    id: 'pathfinding',
    icon: '🗺️',
    title: 'Pathfinding (A*)',
    desc: 'Nakresli překážky a sleduj jak A*, Dijkstra, BFS, DFS a Greedy hledají cestu. Porovnej efektivitu a optimálnost.',
    difficulty: 'Střední',
    tags: ['Algoritmy', 'AI'],
    color: '#f97316',
    href: '/student/simulations/pathfinding',
    ready: true,
  },
  {
    id: 'graphics',
    icon: '🎨',
    title: 'Počítačová grafika',
    desc: 'Rastr vs vektor, barevné modely (RGB/CMYK/HSL), rozlišení & DPI, JPEG komprese s DCT sandboxem, Bézierovy křivky a rasterizace.',
    difficulty: 'Střední',
    tags: ['Grafika', 'Design'],
    color: '#ec4899',
    href: '/student/simulations/graphics',
    ready: true,
  },
  {
    id: 'layout',
    icon: '📦',
    title: 'Flexbox / Grid',
    desc: 'Interaktivní playground pro CSS Flexbox a Grid — posuvníky a live náhled, generátor kódu, výzvy a vizuální reference.',
    difficulty: 'Lehká',
    tags: ['CSS', 'Web design'],
    color: '#06b6d4',
    href: '/student/simulations/layout',
    ready: true,
  },
]

export default function SimulationsHub() {
  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '36px 40px' }}>
      <div style={{ maxWidth: 1000, margin: '0 auto' }}>
        <div style={{ marginBottom: 32 }}>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: '#fff', margin: 0 }}>🧪 Simulace</h1>
          <p style={{ color: D.txtSec, margin: '8px 0 0', fontSize: 15, lineHeight: 1.6 }}>
            Interaktivní vizualizace konceptů z informatiky. Klikni na simulaci a prozkoumej jak věci fungují.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
          {SIMS.map(sim => (
            <a key={sim.id} href={sim.href}
              style={{ textDecoration: 'none', opacity: sim.ready ? 1 : 0.55, pointerEvents: sim.ready ? 'auto' : 'none' }}>
              <div style={{
                background: D.bgCard, border: `1px solid ${D.border}`, borderRadius: 16,
                padding: '22px 22px', height: '100%', boxSizing: 'border-box',
                transition: 'border-color .2s, transform .2s',
                cursor: sim.ready ? 'pointer' : 'default',
              }}
                onMouseEnter={e => { if (sim.ready) { (e.currentTarget as HTMLElement).style.borderColor = sim.color + '60'; (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)' } }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = D.border; (e.currentTarget as HTMLElement).style.transform = 'none' }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 12 }}>
                  <div style={{ width: 48, height: 48, borderRadius: 13, background: sim.color + '20', border: `1px solid ${sim.color}40`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, flexShrink: 0 }}>
                    {sim.icon}
                  </div>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: '#fff', marginBottom: 2 }}>
                      {sim.title}
                      {!sim.ready && <span style={{ fontSize: 10, color: D.txtSec, fontWeight: 400, marginLeft: 8 }}>Brzy</span>}
                    </div>
                    <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' as const }}>
                      {sim.tags.map(t => (
                        <span key={t} style={{ fontSize: 10, padding: '1px 7px', borderRadius: 10, background: sim.color + '15', color: sim.color, fontWeight: 600 }}>{t}</span>
                      ))}
                    </div>
                  </div>
                </div>
                <p style={{ color: D.txtSec, fontSize: 12, lineHeight: 1.6, margin: '0 0 12px' }}>{sim.desc}</p>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 11, color: D.txtSec }}>Obtížnost: {sim.difficulty}</span>
                  {sim.ready && <span style={{ fontSize: 12, color: sim.color, fontWeight: 600 }}>Spustit →</span>}
                </div>
              </div>
            </a>
          ))}
        </div>
      </div>
    </div>
  )
}
