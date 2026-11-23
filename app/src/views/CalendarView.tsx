import { useState } from 'react'
import { CalendarPlus, ChevronLeft, Copy, ChevronRight, Plus, Trash2, Wand2 } from 'lucide-react'
import * as chrono from 'chrono-node'
import { db, type EventItem, type Repeat } from '../db'
import ImportCalendar from '../components/ImportCalendar'
import { useApp } from '../ctx'
import { Modal, PageHead, MemberChip, Empty, MemberPick } from '../components/ui'
import { useEvents, useMembers } from '../lib/useData'
import { DOW, eventsOn, fmtDate, fmtTime, pad, todayStr, ymd } from '../lib/dates'

const blank = (date: string): Partial<EventItem> => ({ title: '', date, start: '', end: '', memberIds: [], remindMin: 30, repeat: 'none', notes: '' })

export default function CalendarView() {
  const events = useEvents()
  const members = useMembers()
  const [cursor, setCursor] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1) })
  const [sel, setSel] = useState(todayStr())
  const [edit, setEdit] = useState<Partial<EventItem> | null>(null)
  const [nl, setNl] = useState('')
  const [imp, setImp] = useState(false)
  const [copying, setCopying] = useState(false)
  const app = useApp()
  const mem = (id?: number) => members.find((m) => m.id === id)

  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1)
  const start = new Date(first); start.setDate(1 - first.getDay())
  const cells = Array.from({ length: 42 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d })

  function quickAdd() {
    const text = nl.trim()
    if (!text) return
    const res = chrono.parse(text, new Date(), { forwardDate: true })[0]
    const lower = text.toLowerCase()
    const who = members.filter((m) => lower.includes(m.name.toLowerCase()))
    const drv = members.find((m) => new RegExp(`driver\\s+${m.name.toLowerCase()}|${m.name.toLowerCase()}\\s+(is )?driving`).test(lower))
    const remind = /remind\s+(\d+)\s*(m|min|h|hr)/.exec(lower)
    const repeat: Repeat = /every day|daily/.test(lower) ? 'daily' : /every week|weekly|every (mon|tue|wed|thu|fri|sat|sun)/.test(lower) ? 'weekly' : 'none'
    let title = text
    if (res) title = text.replace(res.text, '')
    title = title.replace(/remind\s+\d+\s*\w+/i, '').replace(/driver\s+\w+/i, '').replace(/\b(every day|daily|weekly|every week)\b/i, '').replace(/\s+(at|on|for)\s*$/i, '').replace(/\s{2,}/g, ' ').trim()
    const d = res?.start.date()
    const hasTime = res?.start.isCertain('hour')
    const e = res?.end?.date()
    setEdit({
      ...blank(d ? ymd(d) : sel), title: title || text,
      start: hasTime && d ? `${pad(d.getHours())}:${pad(d.getMinutes())}` : '',
      end: hasTime && e ? `${pad(e.getHours())}:${pad(e.getMinutes())}` : '',
      memberIds: who.filter((m) => m.id !== drv?.id || who.length === 1).map((m) => m.id), driverId: drv?.id,
      remindMin: remind ? Number(remind[1]) * (remind[2].startsWith('h') ? 60 : 1) : hasTime ? 30 : 0, repeat,
    })
    setNl('')
  }

  /** Opens a new event pre-filled from an existing one, so only the date (or whatever differs) needs changing. */
  function copyEvent(e: EventItem) {
    const c: Partial<EventItem> = { ...e }
    delete c.id; delete c.feed
    setCopying(true); setEdit(c)
  }
  async function save() {
    if (!edit?.title?.trim()) return
    const rec = { ...edit, title: edit.title.trim(), start: edit.start || undefined, end: edit.end || undefined } as EventItem
    if (rec.id) await db.events.put(rec); else await db.events.add(rec as never)
    setSel(rec.date); setEdit(null); setCopying(false)
  }

  const dayEvents = eventsOn(events, sel)
  return (
    <>
      <PageHead title="Family calendar" sub="Type a sentence, check it, save it.">
        {app.family?.access !== 'limited' && <button className="btn" onClick={() => setImp(true)}><CalendarPlus size={16} />Import / follow</button>}
        <button className="btn primary" onClick={() => setEdit(blank(sel))}><Plus size={16} />Add event</button>
      </PageHead>
      <div className="card no-print">
        <div className="row">
          <Wand2 size={18} color="var(--primary)" />
          <input style={{ flex: 1 }} value={nl} onChange={(e) => setNl(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && quickAdd()} placeholder='Try: "Soccer Maya Tuesday 5pm driver Alex remind 30m weekly"' aria-label="Quick add" />
          <button className="btn" onClick={quickAdd}>Add</button>
        </div>
      </div>

      <div className="grid g2" style={{ gridTemplateColumns: 'minmax(0, 1.5fr) minmax(280px, 1fr)', marginTop: 14 }}>
        <div className="card" style={{ marginTop: 0 }}>
          <div className="row between" style={{ marginBottom: 10 }}>
            <button className="btn sm" aria-label="Previous month" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}><ChevronLeft size={16} /></button>
            <h2>{cursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</h2>
            <button className="btn sm" aria-label="Next month" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}><ChevronRight size={16} /></button>
          </div>
          <div className="cal">
            {DOW.map((d) => <div key={d} className="dow">{d}</div>)}
            {cells.map((d) => {
              const s = ymd(d)
              const evs = eventsOn(events, s)
              return (
                <button key={s} className={`day ${d.getMonth() !== cursor.getMonth() ? 'out' : ''} ${s === todayStr() ? 'today' : ''} ${s === sel ? 'sel' : ''}`} onClick={() => setSel(s)} aria-label={`${fmtDate(s)}, ${evs.length} events`}>
                  <span className="n">{d.getDate()}</span>
                  <span className="dots">{evs.slice(0, 6).map((e) => <span key={e.id} className="dot" style={{ background: mem(e.memberIds[0])?.color ?? 'var(--primary)', width: 8, height: 8 }} />)}</span>
                </button>
              )
            })}
          </div>
        </div>

        <div className="card" style={{ marginTop: 0 }}>
          <h3>{fmtDate(sel, { weekday: 'long', month: 'long', day: 'numeric' })}</h3>
          <div className="stack" style={{ marginTop: 10 }}>
            {dayEvents.length === 0 && <Empty>No events this day.</Empty>}
            {dayEvents.map((e) => (
              <div key={e.id} className="item" style={{ borderLeft: `6px solid ${mem(e.memberIds[0])?.color ?? 'var(--primary)'}` }}>
                <div className="grow" onClick={() => setEdit(e)} style={{ cursor: 'pointer' }}>
                  <div className="title">{e.title}</div>
                  <div className="muted">{e.start ? `${fmtTime(e.start)}${e.end ? ' – ' + fmtTime(e.end) : ''}` : 'All day'}{e.repeat !== 'none' ? ` • repeats ${e.repeat}` : ''}{e.remindMin ? ` • remind ${e.remindMin}m before` : ''}</div>
                  <div className="row" style={{ marginTop: 4 }}>{e.memberIds.map((i) => <MemberChip key={i} m={mem(i)} />)}{e.driverId && <span className="chip">Driver: {mem(e.driverId)?.name}</span>}</div>
                </div>
                <button className="btn ghost sm" aria-label={`Copy ${e.title}`} onClick={() => copyEvent(e)}><Copy size={16} /></button>
                <button className="btn ghost sm" aria-label="Delete event" onClick={() => confirm(`Delete "${e.title}"?`) && db.events.delete(e.id)}><Trash2 size={16} /></button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {imp && <ImportCalendar onClose={() => setImp(false)} onDone={(d) => { if (d) { setSel(d); const x = new Date(d + 'T00:00:00'); setCursor(new Date(x.getFullYear(), x.getMonth(), 1)) } }} />}
      {edit && (
        <Modal title={edit.id ? 'Edit event' : copying ? 'Copy of event: pick the new date' : 'New event'} onClose={() => { setEdit(null); setCopying(false) }}>
          <div className="stack">
            <label className="f">Title<input value={edit.title ?? ''} onChange={(e) => setEdit({ ...edit, title: e.target.value })} autoFocus /></label>
            <div className="row">
              <label className="f">Date<input type="date" value={edit.date} onChange={(e) => setEdit({ ...edit, date: e.target.value })} /></label>
              <label className="f">Start<input type="time" value={edit.start ?? ''} onChange={(e) => setEdit({ ...edit, start: e.target.value })} /></label>
              <label className="f">End<input type="time" value={edit.end ?? ''} onChange={(e) => setEdit({ ...edit, end: e.target.value })} /></label>
            </div>
            <div className="muted">Who is it for?</div>
            <div className="row">
              {members.map((m) => {
                const on = edit.memberIds?.includes(m.id)
                return <button key={m.id} className={`tab ${on ? 'on' : ''}`} onClick={() => setEdit({ ...edit, memberIds: on ? edit.memberIds!.filter((x) => x !== m.id) : [...(edit.memberIds ?? []), m.id] })}>{m.name}</button>
              })}
            </div>
            <div className="row">
              <label className="f">Driver / pickup<MemberPick any anyLabel="None" members={members.filter((m) => m.role === 'parent' || m.role === 'caregiver')} value={edit.driverId} onChange={(v) => setEdit({ ...edit, driverId: v })} /></label>
              <label className="f">Repeats<select value={edit.repeat} onChange={(e) => setEdit({ ...edit, repeat: e.target.value as Repeat })}><option value="none">Never</option><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select></label>
              <label className="f">Remind me<select value={edit.remindMin} onChange={(e) => setEdit({ ...edit, remindMin: Number(e.target.value) })}><option value={0}>No reminder</option><option value={5}>5 min before</option><option value={15}>15 min before</option><option value={30}>30 min before</option><option value={60}>1 hour before</option><option value={120}>2 hours before</option></select></label>
            </div>
            <label className="f">Notes<textarea rows={2} value={edit.notes ?? ''} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} /></label>
            <div className="row between"><span className="row" style={{ gap: 8 }}>{edit.id && <button className="btn" onClick={() => copyEvent(edit as EventItem)}><Copy size={14} /> Make a copy</button>}<span className="muted small">Reminders fire while BindingTies is open. See Settings for notifications.</span></span><button className="btn primary" onClick={save}>Save</button></div>
          </div>
        </Modal>
      )}
    </>
  )
}
