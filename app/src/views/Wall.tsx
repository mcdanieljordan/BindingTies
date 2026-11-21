import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { X, Moon } from 'lucide-react'
import { useEvents, useMembers, useMeds, useDoses, useRoutines, useRuns, useTimers } from '../lib/useData'
import { eventsOn, fmtTime, fmtDate, todayStr, nowHm } from '../lib/dates'
import { fmtMs, questProgress } from '../lib/engine'
import { MemberChip } from '../components/ui'

export default function Wall({ onExit }: { onExit: () => void }) {
  const [now, setNow] = useState(new Date())
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t) }, [])
  const today = todayStr()
  const events = useEvents(), members = useMembers(), meds = useMeds(), doses = useDoses(today), routines = useRoutines(), runs = useRuns(today), timers = useTimers()
  const q = useLiveQuery(questProgress, [], undefined)
  const [dim, setDim] = useState(false)
  const hm = nowHm()
  const night = hm >= '22:00' || hm < '06:30'
  const mem = (id?: number) => members.find((m) => m.id === id)
  const pend = meds.filter((m) => m.active).flatMap((m) => m.times.map((t) => ({ m, t }))).filter(({ m, t }) => !doses.some((d) => d.medId === m.id && d.time === t) && t <= hm)
  return (
    <div className="wall">
      <div className="row between">
        <div><div className="clock">{now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</div><h2>{fmtDate(today, { weekday: 'long', month: 'long', day: 'numeric' })}</h2></div>
        <div className="row"><button className="btn" onClick={() => setDim(true)}><Moon size={16} />Dim</button><button className="btn" onClick={onExit}><X size={16} />Exit</button></div>
      </div>
      {q && <div className="card" style={{ marginTop: 14 }}><div className="row between"><b>Family Quest: {q.quest.title}</b><span>{q.total} / {q.quest.target}</span></div><div className="meter" style={{ marginTop: 8, height: 22 }}><i style={{ width: `${q.pct}%` }} /></div></div>}
      <div className="grid g2" style={{ marginTop: 14 }}>
        <div className="card" style={{ marginTop: 0 }}><h2>Today</h2><div className="stack" style={{ marginTop: 10 }}>
          {eventsOn(events, today).map((e) => <div className="item" key={e.id} style={{ borderLeft: `6px solid ${mem(e.memberIds[0])?.color}`, fontSize: 20 }}><div className="grow"><b>{e.title}</b><div className="muted">{e.start ? fmtTime(e.start) : 'All day'}{e.driverId ? ` • driver ${mem(e.driverId)?.name}` : ''}</div></div>{e.memberIds.map((i) => <MemberChip key={i} m={mem(i)} />)}</div>)}
          {eventsOn(events, today).length === 0 && <div className="muted">Nothing scheduled.</div>}
        </div></div>
        <div className="card" style={{ marginTop: 0 }}><h2>Routines</h2><div className="stack" style={{ marginTop: 10 }}>
          {routines.filter((r) => r.days.includes(now.getDay())).map((r) => { const d = runs.find((x) => x.routineId === r.id)?.doneStepIds.length ?? 0; return <div className="item" key={r.id} style={{ fontSize: 18 }}><div className="grow"><b>{r.name}</b><div className="muted">{mem(r.memberId)?.name ?? 'Everyone'}</div></div><div className="meter" style={{ width: 120 }}><i style={{ width: `${(d / Math.max(1, r.steps.length)) * 100}%` }} /></div><b>{d}/{r.steps.length}</b></div> })}
        </div></div>
      </div>
      {(pend.length > 0 || timers.some((t) => !t.done)) && (
        <div className="card"><h2>Right now</h2><div className="row" style={{ marginTop: 8 }}>
          {pend.map(({ m, t }) => <span className="chip warn" style={{ fontSize: 16 }} key={m.id + t}>💊 {m.name} for {mem(m.memberId)?.name} ({fmtTime(t)})</span>)}
          {timers.filter((t) => !t.done).map((t) => <span className="chip good" style={{ fontSize: 16 }} key={t.id}>⏱ {t.label} {fmtMs(t.endsAt - Date.now())}</span>)}
        </div></div>
      )}
      {(dim || night) && dim && <div className="dim" onClick={() => setDim(false)}>{now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</div>}
    </div>
  )
}
