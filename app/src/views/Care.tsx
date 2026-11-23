import { useEffect, useState } from 'react'
import { AlarmClock, BellRing, Pill, Plus, ShieldAlert, Timer as TimerIcon, Trash2, Lock } from 'lucide-react'
import Emergency from './Emergency'
import { db } from '../db'
import { Empty, MemberPick, PageHead, Ring, Who } from '../components/ui'
import { useAlarms, useDoses, useMeds, useMembers, useTimers } from '../lib/useData'
import { DOW, fmtDate, fmtTime, nowHm, todayStr, addDays } from '../lib/dates'
import { fmtMs } from '../lib/engine'
import { useApp } from '../ctx'

export default function Care() {
  const { family } = useApp()
  const limited = family?.status === 'approved' && family.access === 'limited'
  const [tab, setTab] = useState<'meds' | 'timers' | 'alarms' | 'emergency'>(limited ? 'timers' : 'meds')
  return (
    <>
      <PageHead title="Care & time" sub={limited ? 'Countdown timers and repeating alarms.' : 'Medicine log, timers, alarms and emergency info.'} />
      <div className="tabs">
        {!limited && <button className={`tab ${tab === 'meds' ? 'on' : ''}`} onClick={() => setTab('meds')}><Pill size={14} style={{ verticalAlign: -2 }} /> Medicine</button>}
        <button className={`tab ${tab === 'timers' ? 'on' : ''}`} onClick={() => setTab('timers')}><TimerIcon size={14} style={{ verticalAlign: -2 }} /> Timers</button>
        <button className={`tab ${tab === 'alarms' ? 'on' : ''}`} onClick={() => setTab('alarms')}><AlarmClock size={14} style={{ verticalAlign: -2 }} /> Alarms</button>
        {!limited && <button className={`tab ${tab === 'emergency' ? 'on' : ''}`} onClick={() => setTab('emergency')}><ShieldAlert size={14} style={{ verticalAlign: -2 }} /> Emergency</button>}
      </div>
      {tab === 'meds' && <Meds />}
      {tab === 'timers' && <Timers />}
      {tab === 'alarms' && <Alarms />}
      {tab === 'emergency' && !limited && <Emergency />}
    </>
  )
}

function Meds() {
  const { toast, me } = useApp()
  const members = useMembers()
  const meds = useMeds()
  const today = todayStr()
  const doses = useDoses(today)
  const [f, setF] = useState({ memberId: 0, name: '', dose: '', times: '08:00', notes: '', refillDate: '' })
  const [giver, setGiver] = useState<number>()
  const mem = (id?: number) => members.find((m) => m.id === id)
  const givers = members.filter((m) => m.role !== 'child')
  const who = giver ?? (givers.some((g) => g.id === me) ? me : givers[0]?.id)
  const now = nowHm()

  async function give(medId: number, time: string) {
    if (!who) return
    const dup = await db.doses.where('medId').equals(medId).filter((d) => d.date === today && d.time === time).first()
    if (dup) return toast({ title: 'Already given', body: `${mem(dup.givenBy)?.name} gave this dose.`, kind: 'warn' })
    await db.doses.add({ medId, date: today, time, givenBy: who, ts: Date.now() } as never)
    toast({ title: 'Dose logged', body: `Given by ${mem(who)?.name} at ${fmtTime(nowHm())}` })
  }
  async function add() {
    const memberId = f.memberId || members[0].id
    const times = f.times.split(/[ ,]+/).filter((t) => /^\d{1,2}:\d{2}$/.test(t)).map((t) => t.padStart(5, '0'))
    if (!f.name.trim() || !times.length) return toast({ title: 'Add a name and at least one time like 08:00', kind: 'warn' })
    await db.meds.add({ memberId, name: f.name.trim(), dose: f.dose.trim(), times, notes: f.notes, active: true, refillDate: f.refillDate || undefined } as never)
    setF({ ...f, name: '', dose: '', notes: '', refillDate: '' })
  }

  return (
    <div className="grid g2">
      <div className="card" style={{ marginTop: 0 }}>
        <div className="row between"><h3>Today</h3>
          <label className="row muted small">Logging as<MemberPick members={givers} value={who} onChange={setGiver} /></label></div>
        <div className="muted small" style={{ marginTop: 4 }}><Lock size={12} style={{ verticalAlign: -1 }} /> Once a dose is logged, the other adult sees who gave it and when, so nobody doubles up.</div>
        <div className="stack" style={{ marginTop: 10 }}>
          {meds.filter((m) => m.active).length === 0 && <Empty>No medicines or vitamins yet.</Empty>}
          {meds.filter((m) => m.active).flatMap((m) => m.times.map((t) => ({ m, t }))).sort((a, b) => a.t.localeCompare(b.t)).map(({ m, t }) => {
            const d = doses.find((x) => x.medId === m.id && x.time === t)
            const late = !d && t < now
            return (
              <div key={m.id + t} className={`item ${d ? 'done' : ''}`}>
                <Who m={mem(m.memberId)} size={34} />
                <div className="grow"><div className="title">{m.name} {m.dose && <span className="muted">• {m.dose}</span>}</div>
                  <div className="muted">{mem(m.memberId)?.name} • {fmtTime(t)}{m.notes ? ` • ${m.notes}` : ''}</div></div>
                {d ? <span className="chip good">✓ {mem(d.givenBy)?.name} at {fmtTime(new Date(d.ts).toTimeString().slice(0, 5))}</span>
                  : <>{late && <span className="chip warn">overdue</span>}<button className="btn sm mint" onClick={() => give(m.id, t)}>Given</button></>}
                {d && <button className="btn ghost sm" aria-label="Undo dose" onClick={() => confirm('Undo this logged dose?') && db.doses.delete(d.id)}>↺</button>}
              </div>
            )
          })}
        </div>
        <div className="muted small" style={{ marginTop: 12 }}>BindingTies is a reminder and log only. It does not calculate doses or give medical advice.</div>
      </div>

      <div className="card" style={{ marginTop: 0 }}>
        <h3>Add medicine or vitamin</h3>
        <div className="stack" style={{ marginTop: 10 }}>
          <div className="row">
            <label className="f">For<MemberPick members={members} value={f.memberId || members[0]?.id} onChange={(v) => setF({ ...f, memberId: v ?? 0 })} /></label>
            <label className="f">Name<input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Vitamin D" /></label>
          </div>
          <div className="row">
            <label className="f">Dose<input value={f.dose} onChange={(e) => setF({ ...f, dose: e.target.value })} placeholder="1 tablet / 5 mL" /></label>
            <label className="f">Times (24h, comma separated)<input value={f.times} onChange={(e) => setF({ ...f, times: e.target.value })} placeholder="08:00, 20:00" /></label>
          </div>
          <div className="row">
            <label className="f">Notes<input value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} placeholder="with food" /></label>
            <label className="f">Refill by (optional)<input type="date" value={f.refillDate} onChange={(e) => setF({ ...f, refillDate: e.target.value })} /></label>
          </div>
          <button className="btn primary" onClick={add}><Plus size={16} />Add</button>
        </div>
        <h3 style={{ marginTop: 18 }}>All medicines</h3>
        <div className="stack" style={{ marginTop: 8 }}>
          {meds.map((m) => (
            <div className="item" key={m.id}>
              <div className="grow"><div className="title">{m.name}</div><div className="muted">{mem(m.memberId)?.name} • {m.times.map(fmtTime).join(', ')}{m.refillDate ? ` • refill ${fmtDate(m.refillDate)}` : ''}{m.refillDate && m.refillDate <= addDays(today, 7) ? ' ⚠' : ''}</div></div>
              <button className="btn sm" onClick={() => db.meds.update(m.id, { active: !m.active })}>{m.active ? 'Pause' : 'Resume'}</button>
              <button className="btn ghost sm" aria-label="Delete" onClick={() => confirm(`Delete ${m.name} and its history?`) && db.meds.delete(m.id)}><Trash2 size={14} /></button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function Timers() {
  const timers = useTimers()
  const [label, setLabel] = useState('')
  const [mins, setMins] = useState(10)
  const [, tick] = useState(0)
  useEffect(() => { const t = setInterval(() => tick((x) => x + 1), 500); return () => clearInterval(t) }, [])
  const start = (l: string, m: number) => db.timers.add({ label: l || `${m}-minute timer`, endsAt: Date.now() + m * 60000, totalMs: m * 60000 } as never)
  return (
    <div className="grid g2">
      <div className="card" style={{ marginTop: 0 }}>
        <h3>New timer</h3>
        <div className="row" style={{ margin: '10px 0' }}>
          {[['Teeth', 2], ['Shoes on', 5], ['Tidy up', 10], ['Reading', 20], ['Screen time', 30]].map(([l, m]) => <button key={l} className="btn sm" onClick={() => start(String(l), Number(m))}>{l} • {m}m</button>)}
        </div>
        <div className="row" style={{ alignItems: 'flex-end' }}>
          <label className="f">Label<input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Leave for the bus" /></label>
          <label className="f" style={{ flex: '0 0 100px' }}>Minutes<input type="number" min={1} max={240} value={mins} onChange={(e) => setMins(Number(e.target.value))} /></label>
          <button className="btn primary wide-sm" onClick={() => { void start(label, mins); setLabel('') }}>Start</button>
        </div>
      </div>
      <div className="card" style={{ marginTop: 0 }}>
        <h3>Running</h3>
        <div className="grid" style={{ marginTop: 10, gridTemplateColumns: 'repeat(auto-fill,minmax(150px,1fr))' }}>
          {timers.length === 0 && <Empty>No timers.</Empty>}
          {timers.map((t) => {
            const left = t.endsAt - Date.now()
            const over = left <= 0
            return (
              <div className="badge-tile" key={t.id}>
                <div style={{ display: 'grid', placeItems: 'center' }}><Ring pct={over ? 0 : left / t.totalMs} size={100} stroke={10} color={over ? 'var(--danger)' : 'var(--primary)'}>{over ? '0:00' : fmtMs(left)}</Ring></div>
                <b>{t.label}</b>
                <div className="row" style={{ justifyContent: 'center', marginTop: 6 }}>
                  <button className="btn sm" onClick={() => db.timers.update(t.id, { endsAt: Date.now() + t.totalMs, done: false })}>Restart</button>
                  <button className="btn ghost sm" aria-label="Delete timer" onClick={() => db.timers.delete(t.id)}><Trash2 size={14} /></button>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function Alarms() {
  const alarms = useAlarms()
  const [a, setA] = useState({ label: '', time: '07:00', days: [1, 2, 3, 4, 5] as number[] })
  return (
    <div className="grid g2">
      <div className="card" style={{ marginTop: 0 }}>
        <h3>New alarm</h3>
        <div className="stack" style={{ marginTop: 10 }}>
          <div className="row">
            <label className="f">Label<input value={a.label} onChange={(e) => setA({ ...a, label: e.target.value })} placeholder="Wake up" /></label>
            <label className="f" style={{ flex: '0 0 130px' }}>Time<input type="time" value={a.time} onChange={(e) => setA({ ...a, time: e.target.value })} /></label>
          </div>
          <div className="row">{DOW.map((d, i) => <button key={d} className={`tab ${a.days.includes(i) ? 'on' : ''}`} onClick={() => setA({ ...a, days: a.days.includes(i) ? a.days.filter((x) => x !== i) : [...a.days, i] })}>{d}</button>)}</div>
          <button className="btn primary" onClick={async () => { await db.alarms.add({ label: a.label || 'Alarm', time: a.time, days: a.days, enabled: true } as never); setA({ ...a, label: '' }) }}><Plus size={16} />Add alarm</button>
          <div className="muted small"><BellRing size={12} style={{ verticalAlign: -1 }} /> Alarms ring while BindingTies is open, and send an alert to every device with alerts turned on, even when the app is closed. For wake-up alarms you can't miss, keep a phone alarm as backup.</div>
        </div>
      </div>
      <div className="card" style={{ marginTop: 0 }}>
        <h3>Your alarms</h3>
        <div className="stack" style={{ marginTop: 10 }}>
          {alarms.length === 0 && <Empty>No alarms yet.</Empty>}
          {alarms.map((x) => (
            <div className={`item ${x.enabled ? '' : 'done'}`} key={x.id}>
              <div className="grow"><div className="title" style={{ fontSize: 22 }}>{fmtTime(x.time)}</div><div className="muted">{x.label} • {x.days.length === 7 ? 'every day' : x.days.length === 0 ? 'once' : x.days.map((d) => DOW[d]).join(' ')}</div></div>
              <input type="checkbox" checked={x.enabled} onChange={() => db.alarms.update(x.id, { enabled: !x.enabled })} aria-label="Enabled" />
              <button className="btn ghost sm" aria-label="Delete alarm" onClick={() => db.alarms.delete(x.id)}><Trash2 size={14} /></button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
