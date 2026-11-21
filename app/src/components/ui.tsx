import { useEffect, type ReactNode } from 'react'
import { X } from 'lucide-react'
import type { Member } from '../db'
import { Avatar } from '../lib/icons'

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])
  return (
    <div className="overlay no-print" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="row between" style={{ marginBottom: 12 }}>
          <h2>{title}</h2>
          <button className="btn ghost sm" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function PageHead({ title, sub, children }: { title: string; sub?: string; children?: ReactNode }) {
  return (
    <div className="page-head no-print">
      <div><h1>{title}</h1>{sub && <div className="muted">{sub}</div>}</div>
      <div className="row">{children}</div>
    </div>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>
}

export function MemberPick({ members, value, onChange, any, anyLabel = 'Whole family' }: { members: Member[]; value?: number; onChange: (v: number | undefined) => void; any?: boolean; anyLabel?: string }) {
  return (
    <select value={value ?? ''} onChange={(e) => onChange(e.target.value ? Number(e.target.value) : undefined)}>
      {any && <option value="">{anyLabel}</option>}
      {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
    </select>
  )
}

export function MemberChip({ m }: { m?: Member }) {
  if (!m) return null
  return <span className="chip"><span className="dot" style={{ background: m.color }} />{m.name}</span>
}

export function Who({ m, size = 30 }: { m?: Member; size?: number }) {
  return m ? <Avatar icon={m.icon} color={m.color} size={size} /> : null
}

export function Ring({ pct, size = 120, stroke = 12, color = 'var(--mint)', children }: { pct: number; size?: number; stroke?: number; color?: string; children?: ReactNode }) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size} className="ring">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--border)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - Math.min(1, Math.max(0, pct)))} />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', fontWeight: 900 }}>{children}</div>
    </div>
  )
}
