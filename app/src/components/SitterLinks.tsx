import { useEffect, useState } from 'react'
import { Copy, Link2, Mail, MessageSquare, Share2 } from 'lucide-react'
import type { Member } from '../db'
import { Modal } from './ui'
import { useApp } from '../ctx'
import { createSitterPass, listSitterPasses, revokeSitterPass, sitterUrl, type SitterOptions, type SitterPass } from '../sync/sitter'

const HOURS: [number, string][] = [[4, '4 hours'], [12, 'Tonight (12 hours)'], [24, '1 day'], [72, '3 days'], [168, '7 days (the longest)']]
const when = (iso: string) => new Date(iso).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

export default function SitterLinks({ people }: { people: Member[] }) {
  const { family, toast } = useApp()
  const fid = family?.status === 'approved' && family.role !== 'member' ? family.id : undefined
  const [passes, setPasses] = useState<SitterPass[]>([])
  const [open, setOpen] = useState(false)
  const load = () => { if (fid) void listSitterPasses(fid).then(setPasses).catch(() => {}) }
  useEffect(load, [fid]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!fid) {
    return <div className="card"><h3>Sitter links</h3><p className="muted" style={{ margin: 0 }}>{family?.status === 'approved' ? 'Only a parent sign-in can make sitter links.' : 'Sign in to your family account to make a sitter link: a page with this information for someone who has no account.'}</p></div>
  }
  const now = Date.now()
  const state = (p: SitterPass) => (p.revoked_at ? 'off' : new Date(p.expires_at).getTime() <= now ? 'expired' : 'active')

  return (
    <div className="card stack">
      <div className="row between"><h3 style={{ margin: 0 }}><Link2 size={16} style={{ verticalAlign: -2 }} /> Sitter links</h3><button className="btn primary sm" onClick={() => setOpen(true)}>Make a sitter link</button></div>
      <div className="muted">Give a babysitter or grandparent a page with the emergency info, schedule and medicine times. They need no account, and it stops working by itself.</div>
      {passes.map((p) => {
        const st = state(p)
        return (
          <div className="item" key={p.id} style={{ opacity: st === 'active' ? 1 : 0.6, flexWrap: 'wrap' }}>
            <div className="grow" style={{ minWidth: 160 }}>
              <div className="title">{p.label}</div>
              <div className="muted small">For {p.member_ids.map((id) => people.find((m) => m.id === id)?.name).filter(Boolean).join(', ') || 'family'} · {st === 'active' ? `works until ${when(p.expires_at)}` : st === 'off' ? 'turned off' : 'expired'}</div>
              <div className="muted small">{p.view_count ? `Opened ${p.view_count} time${p.view_count === 1 ? '' : 's'}, last ${when(p.last_viewed_at!)}` : 'Not opened yet'}</div>
            </div>
            {st === 'active' && <button className="btn sm" onClick={async () => { if (confirm(`Turn off "${p.label}" now? The link stops working immediately.`)) { try { await revokeSitterPass(p.id); toast({ title: 'Link turned off' }); load() } catch (e) { toast({ title: 'Could not turn it off', body: (e as Error).message, kind: 'warn' }) } } }}>Turn off</button>}
          </div>
        )
      })}
      {open && <MakeLink fid={fid} people={people} onClose={() => { setOpen(false); load() }} />}
    </div>
  )
}

function MakeLink({ fid, people, onClose }: { fid: string; people: Member[]; onClose: () => void }) {
  const { toast } = useApp()
  const [label, setLabel] = useState('Babysitter')
  const [who, setWho] = useState<number[]>(people.filter((p) => p.role === 'child').map((p) => p.id))
  const [opt, setOpt] = useState<SitterOptions>({ schedule: true, meds: true, routines: true, address: true })
  const [notes, setNotes] = useState('')
  const [hours, setHours] = useState(12)
  const [busy, setBusy] = useState(false)
  const [res, setRes] = useState<{ url: string; until: string } | null>(null)

  async function make() {
    setBusy(true)
    try { const r = await createSitterPass(fid, label, who, opt, notes, hours); setRes({ url: sitterUrl(r.token), until: when(r.expires_at) }) }
    catch (e) { toast({ title: 'Could not make the link', body: (e as Error).message, kind: 'warn' }) }
    finally { setBusy(false) }
  }
  const msg = res ? `Hi! Here is the info page for tonight: ${res.url}\nIt works until ${res.until}. Please do not share it.` : ''
  const check = (k: keyof SitterOptions, text: string) => <label className="row" style={{ gap: 8, flexWrap: 'nowrap' }}><input type="checkbox" checked={opt[k]} onChange={(e) => setOpt({ ...opt, [k]: e.target.checked })} /> {text}</label>

  if (res) {
    return (
      <Modal title="Your sitter link is ready" onClose={onClose}>
        <div className="stack">
          <div style={{ wordBreak: 'break-all', padding: 10, borderRadius: 12, background: 'var(--panel2)', border: '1px solid var(--border)', fontSize: 14 }}>{res.url}</div>
          <div className="muted">Works until <b>{res.until}</b>. You can turn it off any time from the Emergency tab.</div>
          <div className="row" style={{ gap: 6 }}>
            <button className="btn primary" onClick={async () => { try { await navigator.clipboard.writeText(res.url); toast({ title: 'Link copied' }) } catch { toast({ title: 'Press and hold the link to copy it', kind: 'warn' }) } }}><Copy size={14} />Copy</button>
            <a className="btn" href={`sms:?&body=${encodeURIComponent(msg)}`}><MessageSquare size={14} />Text</a>
            <a className="btn" href={`mailto:?subject=${encodeURIComponent('Info for tonight')}&body=${encodeURIComponent(msg)}`}><Mail size={14} />Email</a>
            {typeof navigator.share === 'function' && <button className="btn" onClick={() => void navigator.share({ title: 'Info for tonight', text: msg }).catch(() => {})}><Share2 size={14} />Share</button>}
          </div>
          <div className="muted small"><b>This is the only time the full link is shown.</b> Anyone who has it can read this information until it expires, so send it only to the person who needs it. If you lose it, make a new one.</div>
          <button className="btn" onClick={onClose}>Done</button>
        </div>
      </Modal>
    )
  }
  return (
    <Modal title="Make a sitter link" onClose={onClose}>
      <div className="stack">
        <label className="f">Name this link<input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Friday night sitter" /></label>
        <div>
          <div className="muted" style={{ fontWeight: 800, marginBottom: 6 }}>Who are they looking after?</div>
          <div className="row" style={{ gap: 6 }}>{people.filter((p) => p.role !== 'caregiver').map((p) => { const on = who.includes(p.id); return <button key={p.id} type="button" className={`tab ${on ? 'on' : ''}`} onClick={() => setWho((c) => (c.includes(p.id) ? c.filter((x) => x !== p.id) : [...c, p.id]))}>{p.name}</button> })}</div>
        </div>
        <div className="stack" style={{ gap: 6 }}>
          <div className="muted" style={{ fontWeight: 800 }}>What can they see?</div>
          <label className="row" style={{ gap: 8, flexWrap: 'nowrap' }}><input type="checkbox" checked disabled /> Allergies, doctor and who to call (always)</label>
          {check('schedule', 'Their schedule for the next few days')}
          {check('meds', 'Medicine and times')}
          {check('routines', 'Routine steps (like bedtime)')}
          {check('address', 'Home address')}
          <div className="muted small">Insurance details and birth dates are never shared.</div>
        </div>
        <label className="f">Notes for the sitter (optional)<textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Bedtime is 8. Snacks are in the pantry. Text me with any question." /></label>
        <label className="f">Works for<select value={hours} onChange={(e) => setHours(Number(e.target.value))}>{HOURS.map(([h, l]) => <option key={h} value={h}>{l}</option>)}</select></label>
        <button className="btn primary" disabled={busy || !who.length} onClick={make}>{busy ? 'Making…' : 'Make the link'}</button>
      </div>
    </Modal>
  )
}
