export default function NotFound() {
  return (
    <div style={{ textAlign: 'center', padding: '80px 20px', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>🔒</div>
      <h1 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 8px', color: '#111' }}>Profil není dostupný</h1>
      <p style={{ fontSize: 14, color: '#888', margin: '0 0 24px', lineHeight: 1.6 }}>
        Tento student nemá veřejný profil, nebo nejste ve stejném modulu.
      </p>
      <a href="/student/modules" style={{ padding: '9px 20px', background: '#185FA5', color: '#fff', borderRadius: 8, textDecoration: 'none', fontSize: 14, fontWeight: 600 }}>
        ← Zpět na moduly
      </a>
    </div>
  )
}
