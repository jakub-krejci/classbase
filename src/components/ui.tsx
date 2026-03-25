/* eslint-disable @typescript-eslint/no-explicit-any */
import React from 'react'

export const TAG_COLORS: Record<string, { bg: string; color: string }> = {
  Science:         { bg: '#E1F5EE', color: '#085041' },
  Math:            { bg: '#E6F1FB', color: '#0C447C' },
  Geography:       { bg: '#EAF3DE', color: '#27500A' },
  Programming:     { bg: '#EEEDFE', color: '#3C3489' },
  History:         { bg: '#FAEEDA', color: '#633806' },
  Language:        { bg: '#E1F5EE', color: '#085041' },
  'Graduation Exam': { bg: '#FCEBEB', color: '#791F1F' },
  Other:           { bg: '#E6F1FB', color: '#0C447C' },
}

export function Tag({ tag }: { tag: string }) {
  const c = TAG_COLORS[tag] ?? TAG_COLORS.Other
  return (
    <span style={{ fontSize: 10, fontWeight: 500, padding: '2px 9px', borderRadius: 20, background: c.bg, color: c.color, whiteSpace: 'nowrap' }}>
      {tag}
    </span>
  )
}

export function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ background: '#fff', border: '0.5px solid #e5e7eb', borderRadius: 12, padding: '14px 16px', ...style }}>
      {children}
    </div>
  )
}

export function Btn({ children, onClick, href, variant = 'default', style }: { children: React.ReactNode; onClick?: () => void; href?: string; variant?: 'primary' | 'danger' | 'default'; style?: React.CSSProperties }) {
  const base: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 500, cursor: 'pointer', textDecoration: 'none', border: '0.5px solid', fontFamily: 'inherit' }
  const variants = {
    primary: { background: '#185FA5', color: '#E6F1FB', borderColor: '#185FA5' },
    danger:  { background: '#FCEBEB', color: '#791F1F', borderColor: '#F09595' },
    default: { background: '#fff',    color: '#333',    borderColor: '#e5e7eb' },
  }
  const merged = { ...base, ...variants[variant], ...style }
  if (href) return <a href={href} style={merged}>{children}</a>
  return <button onClick={onClick} style={{ ...merged, cursor: 'pointer' }}>{children}</button>
}

export function PageHeader({ title, sub, action }: { title: string; sub?: string; action?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 22 }}>
      <div>
        <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 2 }}>{title}</h1>
        {sub && <p style={{ fontSize: 13, color: '#888' }}>{sub}</p>}
      </div>
      {action && <div>{action}</div>}
    </div>
  )
}

export function StatGrid({ stats }: { stats: { label: string; value: string | number }[] }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${stats.length}, minmax(0,1fr))`, gap: 10, marginBottom: 22 }}>
      {stats.map(s => (
        <div key={s.label} style={{ background: '#f3f4f6', borderRadius: 10, padding: '11px 14px' }}>
          <div style={{ fontSize: 11, color: '#888', marginBottom: 3 }}>{s.label}</div>
          <div style={{ fontSize: 20, fontWeight: 600 }}>{s.value}</div>
        </div>
      ))}
    </div>
  )
}

export function EmptyState({ message }: { message: string }) {
  return (
    <div style={{ textAlign: 'center', padding: '48px 20px', color: '#aaa', fontSize: 13, border: '1px dashed #e5e7eb', borderRadius: 12 }}>
      {message}
    </div>
  )
}

export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <a href={href} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#185FA5', textDecoration: 'none', marginBottom: 16 }}>
      ← {label}
    </a>
  )
}

export function Pill({ label, color = 'blue' }: { label: string; color?: 'blue' | 'green' | 'amber' | 'red' | 'gray' }) {
  const map: any = {
    blue:  { bg: '#E6F1FB', color: '#0C447C' },
    green: { bg: '#EAF3DE', color: '#27500A' },
    amber: { bg: '#FAEEDA', color: '#633806' },
    red:   { bg: '#FCEBEB', color: '#791F1F' },
    gray:  { bg: '#f3f4f6', color: '#555' },
  }
  const c = map[color]
  return <span style={{ fontSize: 10, fontWeight: 500, padding: '2px 8px', borderRadius: 20, background: c.bg, color: c.color }}>{label}</span>
}
