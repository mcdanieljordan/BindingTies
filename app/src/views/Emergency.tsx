import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { FileDown, Plus, ShieldAlert, X } from 'lucide-react'
import { db, newId, type EmergencyContact, type EmergencyInfo, type Member } from '../db'
import { Modal, Who } from '../components/ui'
import { useMeds, useMembers } from '../lib/useData'
import { useApp } from '../ctx'
import SitterLinks from '../components/SitterLinks'
import { buildEmergencyPdf } from '../lib/emergencyPdf'
import { savePdf } from '../lib/files'
import { todayStr } from '../lib/dates'

const BLOOD = ['', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', "Don't know"]
const blank = (id: number): EmergencyInfo => ({ id, updatedAt: Date.now() })
const filled = (i?: EmergencyInfo) => !!(i?.allergies?.trim())

export default function Emergency() {
  const { toast } = useApp()
  const members = useMembers().filter((m) => m.role !== 'caregiver')
  const rows = useLiveQuery(() => db.emergency.toArray(), [], [])
  const [sel, setSel] = useState<number>(() => 0)
  const [print, setPrint] = useState(false)
  const house = rows.find((r) => r.id === 0)

  return (
    <div className="stack">
      <div className="card" style={{ borderColor: 'var(--amber)' }}>
        <div className="row" style={{ gap: 10, flexWrap: 'nowrap', alignItems: 'flex-start' }}>
          <ShieldAlert size={22} color="var(--amber)" style={{ flexShrink: 0, marginTop: 2 }} />
          <div><b>Call 911 first in an emergency.</b>
            <div className="muted">Everything a sitter, grandparent or paramedic needs, on one page per person. Only parents and full-access sign-ins can see this. It stays hidden from kids on Limited access.</div></div>
        </div>
        <div className="row" style={{ marginTop: 10 }}><button className="btn primary" onClick={() => setPrint(true)}><FileDown size={16} />Print or save sheets</button></div>
      </div>

      <SitterLinks people={members} />

      <div className="row" style={{ gap: 6 }}>
        <button className={`tab ${sel === 0 ? 'on' : ''}`} onClick={() => setSel(0)}>🏠 Our home{house?.address || house?.contacts?.length ? '' : ' •'}</button>
        {members.map((m) => (
          <button key={m.id} className={`tab ${sel === m.id ? 'on' : ''}`} onClick={() => setSel(m.id)}>{m.name}{filled(rows.find((r) => r.id === m.id)) ? ' ✓' : ' •'}</button>
        ))}
      </div>
      <div className="muted small">A dot means allergies are not filled in yet. Write "None known" if there are none, so a sitter knows it was checked.</div>

      <Form key={sel} id={sel} person={members.find((m) => m.id === sel)} saved={rows.find((r) => r.id === sel)} onSaved={() => toast({ title: 'Saved' })} />

      {print && <PrintSheets people={members} rows={rows} onClose={() => setPrint(false)} />}
    </div>
  )
}

function Form({ id, person, saved, onSaved }: { id: number; person?: Member; saved?: EmergencyInfo; onSaved: () => void }) {
  const meds = useMeds().filter((m) => m.memberId === id && m.active)
  const [d, setD] = useState<EmergencyInfo>(saved ?? blank(id))
  const [dirty, setDirty] = useState(false)
  // the saved copy can arrive after this screen opens (just synced): show it, unless the person has already started typing
  useEffect(() => { if (!dirty && saved) setD(saved) }, [saved?.updatedAt]) // eslint-disable-line react-hooks/exhaustive-deps
  const set = (p: Partial<EmergencyInfo>) => { setDirty(true); setD((x) => ({ ...x, ...p })) }
  const contacts = d.contacts ?? []
  const setContact = (cid: string, p: Partial<EmergencyContact>) => set({ contacts: contacts.map((c) => (c.id === cid ? { ...c, ...p } : c)) })
  const save = async () => { await db.emergency.put({ ...d, id, updatedAt: Date.now() }); onSaved() }
  const home = id === 0

  const Contacts = (
    <div className="stack" style={{ gap: 8 }}>
      <div className="muted" style={{ fontWeight: 800 }}>{home ? 'People to call for the whole family' : `Extra people to call for ${person?.name ?? 'this person'}`}</div>
      {contacts.map((c) => (
        <div className="row" key={c.id} style={{ gap: 6, flexWrap: 'wrap' }}>
          <input style={{ flex: '1 1 130px' }} placeholder="Name" aria-label="Contact name" value={c.name} onChange={(e) => setContact(c.id, { name: e.target.value })} />
          <input style={{ flex: '1 1 110px' }} placeholder="Who they are (Mom, neighbor…)" aria-label="Relationship" value={c.relation} onChange={(e) => setContact(c.id, { relation: e.target.value })} />
          <input style={{ flex: '1 1 130px' }} type="tel" placeholder="Phone" aria-label="Phone" value={c.phone} onChange={(e) => setContact(c.id, { phone: e.target.value })} />
          <button className="btn ghost sm" aria-label="Remove contact" onClick={() => set({ contacts: contacts.filter((x) => x.id !== c.id) })}><X size={14} /></button>
        </div>
      ))}
      <button className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={() => set({ contacts: [...contacts, { id: String(newId()), name: '', relation: '', phone: '' }] })}><Plus size={14} />Add a contact</button>
    </div>
  )

  if (home) {
    return (
      <div className="card stack">
        <h3>Our home</h3>
        <label className="f">Home address<textarea rows={2} value={d.address ?? ''} onChange={(e) => set({ address: e.target.value })} placeholder="Street, city. What you would tell a 911 operator." /></label>
        <div className="row">
          <label className="f">Poison control<input type="tel" value={d.poison ?? ''} onChange={(e) => set({ poison: e.target.value })} placeholder="1-800-222-1222 (US)" /></label>
        </div>
        <div className="row">
          <label className="f">Preferred hospital<input value={d.hospital ?? ''} onChange={(e) => set({ hospital: e.target.value })} /></label>
          <label className="f">Hospital phone<input type="tel" value={d.hospitalPhone ?? ''} onChange={(e) => set({ hospitalPhone: e.target.value })} /></label>
        </div>
        <label className="f">Good to know<textarea rows={3} value={d.houseNotes ?? ''} onChange={(e) => set({ houseNotes: e.target.value })} placeholder="Where the spare key is, pets, alarm, fire extinguisher…" /></label>
        {Contacts}
        <div className="row between"><span className="muted small">These details are printed at the bottom of every person's sheet.</span><button className="btn primary" onClick={save}>Save</button></div>
      </div>
    )
  }

  return (
    <div className="card stack">
      <div className="row" style={{ gap: 10 }}><Who m={person} size={40} /><h3 style={{ margin: 0 }}>{person?.name}</h3></div>
      <div className="row">
        <label className="f">Full name (for the sheet)<input value={d.fullName ?? ''} placeholder={person?.name} onChange={(e) => set({ fullName: e.target.value })} /></label>
        <label className="f">Date of birth<input type="date" value={d.dob ?? ''} onChange={(e) => set({ dob: e.target.value })} /></label>
        <label className="f">Blood type<select value={d.blood ?? ''} onChange={(e) => set({ blood: e.target.value })}>{BLOOD.map((b) => <option key={b} value={b}>{b || 'Not set'}</option>)}</select></label>
      </div>
      <label className="f" style={{ color: 'var(--red, #e5484d)' }}>Allergies (food, medicine, insects)<textarea rows={2} value={d.allergies ?? ''} onChange={(e) => set({ allergies: e.target.value })} placeholder='For example: Peanuts (severe, carries an EpiPen). Or write "None known".' /></label>
      <label className="f">Medical conditions<textarea rows={2} value={d.conditions ?? ''} onChange={(e) => set({ conditions: e.target.value })} placeholder="Asthma, diabetes, seizures, glasses, hearing aids…" /></label>
      <div>
        <div className="muted" style={{ fontWeight: 800, marginBottom: 4 }}>Medicines (from Care → Medicine)</div>
        {meds.length ? <div className="stack" style={{ gap: 2 }}>{meds.map((m) => <div key={m.id}>💊 {m.name}{m.dose ? ` - ${m.dose}` : ''}</div>)}</div> : <div className="muted small">None logged for {person?.name}. Add them in the Medicine tab and they show up here.</div>}
      </div>
      <label className="f">Other medicines or supplements<textarea rows={2} value={d.otherMeds ?? ''} onChange={(e) => set({ otherMeds: e.target.value })} placeholder="Things you do not log in Medicine (rescue inhaler, vitamins)" /></label>
      <div className="row">
        <label className="f">Doctor<input value={d.doctor ?? ''} onChange={(e) => set({ doctor: e.target.value })} /></label>
        <label className="f">Doctor phone<input type="tel" value={d.doctorPhone ?? ''} onChange={(e) => set({ doctorPhone: e.target.value })} /></label>
      </div>
      <div className="row">
        <label className="f">Insurance company<input value={d.insurer ?? ''} onChange={(e) => set({ insurer: e.target.value })} /></label>
        <label className="f">Member ID<input value={d.insuranceId ?? ''} onChange={(e) => set({ insuranceId: e.target.value })} /></label>
      </div>
      <label className="f">Important notes<textarea rows={2} value={d.notes ?? ''} onChange={(e) => set({ notes: e.target.value })} placeholder="What helps when they are scared, where the inhaler is kept…" /></label>
      {Contacts}
      <div className="row between"><span className="muted small">{saved?.updatedAt ? `Last saved ${new Date(saved.updatedAt).toLocaleDateString()}` : 'Not saved yet'}</span><button className="btn primary" onClick={save}>Save</button></div>
    </div>
  )
}

function PrintSheets({ people, rows, onClose }: { people: Member[]; rows: EmergencyInfo[]; onClose: () => void }) {
  const meds = useMeds()
  const [pick, setPick] = useState<number[]>(people.map((p) => p.id))
  const [addr, setAddr] = useState(true)
  const [ins, setIns] = useState(false)
  const [withMeds, setWithMeds] = useState(true)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')

  async function make() {
    setBusy(true); setErr(''); setMsg('')
    try {
      const chosen = people.filter((p) => pick.includes(p.id))
      const res = await buildEmergencyPdf({
        household: rows.find((r) => r.id === 0), includeAddress: addr, includeInsurance: ins, includeMeds: withMeds, printedOn: todayStr(),
        people: chosen.map((m) => ({ member: m, info: rows.find((r) => r.id === m.id), meds: meds.filter((x) => x.memberId === m.id) })),
      })
      const how = await savePdf(res.bytes, `BindingTies-emergency-sheets-${todayStr()}.pdf`)
      setMsg(`${how === 'saved' ? 'Saved' : 'Ready to save or send'}: ${res.pages} page${res.pages === 1 ? '' : 's'}.`)
    } catch (e) { setErr((e as Error).message || 'Could not create the PDF.') } finally { setBusy(false) }
  }

  return (
    <Modal title="Print emergency sheets" onClose={onClose}>
      <div className="stack">
        <div className="muted" style={{ fontWeight: 800 }}>One page for</div>
        <div className="row" style={{ gap: 6 }}>
          {people.map((p) => { const on = pick.includes(p.id); return <button key={p.id} type="button" className={`tab ${on ? 'on' : ''}`} onClick={() => setPick((cur) => (cur.includes(p.id) ? cur.filter((x) => x !== p.id) : [...cur, p.id]))}>{p.name}</button> })}
        </div>
        <label className="row" style={{ gap: 8, flexWrap: 'nowrap' }}><input type="checkbox" checked={withMeds} onChange={(e) => setWithMeds(e.target.checked)} /> Include medicines from Care</label>
        <label className="row" style={{ gap: 8, flexWrap: 'nowrap' }}><input type="checkbox" checked={addr} onChange={(e) => setAddr(e.target.checked)} /> Include the home address</label>
        <label className="row" style={{ gap: 8, flexWrap: 'nowrap', alignItems: 'flex-start' }}><input type="checkbox" checked={ins} onChange={(e) => setIns(e.target.checked)} /><span>Include insurance ID<br /><span className="muted small">Leave this off for a sheet on the fridge. Turn it on for a sheet that stays in your bag.</span></span></label>
        {err && <div className="err" role="alert">{err}</div>}
        {msg && <div role="status"><b>{msg}</b></div>}
        <button className="btn primary" disabled={busy || !pick.length} onClick={make}><FileDown size={16} />{busy ? 'Creating…' : 'Create PDF'}</button>
        <div className="muted small">Check each sheet before you rely on it, and reprint when something changes. A printed sheet can be read by anyone who sees it.</div>
      </div>
    </Modal>
  )
}

