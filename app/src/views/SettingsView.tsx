import { useState } from 'react'
import { Bell, Download, Moon, Plus, Send, Sun, Trash2, Upload } from 'lucide-react'
import { db, type Member } from '../db'
import { PageHead, MemberChip } from '../components/ui'
import { useApp } from '../ctx'
import { useMembers } from '../lib/useData'
import { beep, notifySupported } from '../lib/engine'
import { AVATARS, Avatar } from '../lib/icons'
import SyncPanel from '../sync/SyncPanel'
import InviteModal from '../sync/InviteModal'

const COLORS = ['#8d7bff', '#50e0bd', '#ff7fb2', '#ffca70', '#5db7ff', '#ff9a62', '#b6e35a', '#e08cff']
const tables = ['members', 'events', 'routines', 'runs', 'ledger', 'rewards', 'chores', 'meds', 'doses', 'timers', 'alarms', 'lists', 'listItems', 'vault', 'goals', 'photos', 'kv'] as const

const blobToData = (b: Blob) => new Promise<string>((res) => { const r = new FileReader(); r.onload = () => res(r.result as string); r.readAsDataURL(b) })
const dataToBlob = async (u: string) => (await fetch(u)).blob()

export default function SettingsView() {
  const { settings, setSettings, toast, family } = useApp()
  const limited = family?.status === 'approved' && family.access === 'limited'
  const canInvite = family?.status === 'approved' && family.role !== 'member'
  const [inviting, setInviting] = useState<Member | null>(null)
  const members = useMembers()
  const [perm, setPerm] = useState(notifySupported() ? Notification.permission : 'unsupported')
  const [nm, setNm] = useState('')

  async function exportAll() {
    const out: Record<string, unknown[]> = {}
    for (const t of tables) {
      const rows = await (db as never as Record<string, { toArray(): Promise<Record<string, unknown>[]> }>)[t].toArray()
      out[t] = await Promise.all(rows.map(async (r) => { const c = { ...r }; if (c.blob instanceof Blob) c.blob = await blobToData(c.blob); return c }))
    }
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([JSON.stringify({ app: 'familyos', v: 1, data: out })], { type: 'application/json' }))
    a.download = `familyos-backup-${new Date().toISOString().slice(0, 10)}.json`; a.click()
  }
  async function importAll(f?: File) {
    if (!f || !confirm('Replace everything on this device with the backup?')) return
    const j = JSON.parse(await f.text())
    if (j.app !== 'familyos') return toast({ title: 'Not a FamilyOS backup', kind: 'warn' })
    for (const t of tables) {
      const tbl = (db as never as Record<string, { clear(): Promise<void>; bulkPut(r: unknown[]): Promise<unknown> }>)[t]
      await tbl.clear()
      const rows = await Promise.all((j.data[t] ?? []).map(async (r: Record<string, unknown>) => (typeof r.blob === 'string' ? { ...r, blob: await dataToBlob(r.blob) } : r)))
      await tbl.bulkPut(rows)
    }
    location.reload()
  }
  async function enableNotifs() {
    if (!notifySupported()) return
    const p = await Notification.requestPermission()
    setPerm(p)
    if (p === 'granted') new Notification('FamilyOS reminders are on', { icon: import.meta.env.BASE_URL + 'favicon.svg' })
  }
  const edit = (m: Member, p: Partial<Member>) => db.members.update(m.id, p)

  return (
    <>
      <PageHead title="Settings" />
      <div className="grid g2">
        <div className="card" style={{ marginTop: 0 }}>
          <h3>Look & feel</h3>
          <div className="stack" style={{ marginTop: 10 }}>
            <div className="seg" style={{ alignSelf: 'flex-start' }}>
              <button className={settings.theme === 'midnight' ? 'on' : ''} onClick={() => setSettings({ theme: 'midnight' })}><Moon size={14} style={{ verticalAlign: -2 }} /> Midnight</button>
              <button className={settings.theme === 'light' ? 'on' : ''} onClick={() => setSettings({ theme: 'light' })}><Sun size={14} style={{ verticalAlign: -2 }} /> Light</button>
            </div>
            <div className="seg" style={{ alignSelf: 'flex-start' }}>
              <button className={settings.skin === 'quest' ? 'on' : ''} onClick={() => setSettings({ skin: 'quest' })}>Quest (confetti)</button>
              <button className={settings.skin === 'calm' ? 'on' : ''} onClick={() => setSettings({ skin: 'calm' })}>Calm (no motion)</button>
            </div>
            <label className="row"><input type="checkbox" checked={settings.sound} onChange={(e) => setSettings({ sound: e.target.checked })} />Play a sound with reminders <button className="btn sm" onClick={() => beep()}>Test</button></label>
          </div>
          <h3 style={{ marginTop: 18 }}><Bell size={16} style={{ verticalAlign: -2 }} /> Notifications</h3>
          <p className="muted">Status: <b>{perm}</b>. {perm === 'granted' ? '' : <button className="btn sm primary" onClick={enableNotifs} disabled={perm === 'unsupported'}>Turn on</button>}</p>
          <div className="card" style={{ background: 'var(--panel2)', boxShadow: 'none' }}>
            <SyncPanel />
          </div>
          <div className="card" style={{ background: 'var(--panel2)', boxShadow: 'none' }}>
            <b>Honest note on reminders</b>
            <div className="muted small" style={{ marginTop: 4 }}>Without family sync, reminders fire only while FamilyOS is open. With sync and push turned on, a server sends them even when the app is closed, but phones can still delay or drop web push (Do Not Disturb, battery saver, iOS limits). For critical medicine, keep a phone alarm as backup.</div>
          </div>
        </div>

        {!limited && <div className="card" style={{ marginTop: 0 }}>
          <h3>Family</h3>
          <div className="stack" style={{ marginTop: 10 }}>
            {members.map((m) => (
              <div className="item" key={m.id}>
                <Avatar icon={m.icon} color={m.color} />
                <input value={m.name} style={{ flex: 1 }} onChange={(e) => edit(m, { name: e.target.value })} aria-label="Name" />
                <select value={m.role} onChange={(e) => edit(m, { role: e.target.value as Member['role'] })}><option value="parent">Parent</option><option value="child">Child</option><option value="caregiver">Caregiver</option></select>
                <input type="number" min={1} max={19} style={{ width: 62 }} placeholder="Age" value={m.age ?? ''} onChange={(e) => edit(m, { age: e.target.value ? Number(e.target.value) : undefined })} aria-label="Age" />
                <input type="color" value={m.color} onChange={(e) => edit(m, { color: e.target.value })} aria-label="Color" />
                {canInvite && <button className="btn sm" onClick={() => setInviting(m)}><Send size={14} />Invite</button>}
                <button className="btn ghost sm" aria-label={`Remove ${m.name}`} onClick={() => confirm(`Remove ${m.name}? Their saved files will remain but be unassigned.`) && db.members.delete(m.id)}><Trash2 size={14} /></button>
              </div>
            ))}
            <div className="row"><input placeholder="Add person" value={nm} onChange={(e) => setNm(e.target.value)} style={{ flex: 1 }} /><button className="btn" onClick={async () => { if (!nm.trim()) return; const i = members.length; await db.members.add({ name: nm.trim(), role: 'child', color: COLORS[i % 8], icon: AVATARS[i % AVATARS.length] } as never); setNm('') }}><Plus size={14} />Add</button></div>
            <div className="row">{members.map((m) => <MemberChip key={m.id} m={m} />)}</div>
          </div>
          <h3 style={{ marginTop: 18 }}>Your data</h3>
          <p className="muted">Your family's information is saved on this device and, when you are signed in, safely in your family's private cloud space. No ads or trackers. Make a backup now and then.</p>
          <div className="row">
            <button className="btn" onClick={exportAll}><Download size={15} />Export backup</button>
            <label className="btn"><Upload size={15} />Restore backup<input type="file" accept="application/json" hidden onChange={(e) => importAll(e.target.files?.[0])} /></label>
            <button className="btn danger" onClick={async () => { if (confirm('Erase ALL FamilyOS data on this device? Export a backup first.')) { await db.delete(); location.reload() } }}>Erase everything</button>
          </div>
        </div>}
      </div>
      {inviting && <InviteModal person={inviting} onClose={() => setInviting(null)} />}
    </>
  )
}
