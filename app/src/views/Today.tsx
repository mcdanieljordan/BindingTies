import { useLiveQuery } from 'dexie-react-hooks'
import { CalendarDays, ListChecks, Pill, Trophy, Hand, Timer as TimerIcon } from 'lucide-react'
import { PageHead, MemberChip, Empty } from '../components/ui'
import { useApp } from '../ctx'
import { turnOf } from '../lib/chores'
import { useChores, useDoses, useEvents, useMembers, useMeds, useRoutines, useRuns, useTimers } from '../lib/useData'
import { eventsOn, fmtTime, fmtDate, greeting, todayStr } from '../lib/dates'
import { questProgress } from '../lib/engine'
import { Ico } from '../lib/icons'
import JoinRequests from '../sync/JoinRequests'
import InstallHint from '../components/InstallHint'

export default function Today() {
  const { go, family } = useApp()
  const limited = family?.status === 'approved' && family.access === 'limited'
  const today = todayStr()
  const members = useMembers()
  const events = useEvents()
  const routines = useRoutines()
  const runs = useRuns(today)
  const meds = useMeds()
  const doses = useDoses(today)
  const chores = useChores()
  const timers = useTimers()
  const q = useLiveQuery(questProgress, [], undefined)
  const mem = (id?: number) => members.find((m) => m.id === id)
  const dow = new Date().getDay()
  const todays = eventsOn(events, today)
  const dueRoutines = routines.filter((r) => r.days.includes(dow))
  const pendingMeds = meds.filter((m) => m.active).flatMap((m) => m.times.map((t) => ({ m, t }))).filter(({ m, t }) => !doses.some((d) => d.medId === m.id && d.time === t)).sort((a, b) => a.t.localeCompare(b.t))
  const alive = new Set(members.map((m) => m.id))
  const open = chores.filter((c) => !turnOf(c, today, alive) && c.doneDate !== today)
  const running = timers.filter((t) => !t.done)

  return (
    <>
      <PageHead title={`${greeting()}!`} sub={fmtDate(today, { weekday: 'long', month: 'long', day: 'numeric' })} />
      <JoinRequests />
      <InstallHint />
      <div className="card" onClick={() => go('family')} style={{ cursor: 'pointer' }}>
        <div className="row between"><h3><Trophy size={16} style={{ verticalAlign: -2 }} /> Family Quest: {q?.quest.title}</h3><span className="chip good">{q?.total ?? 0} / {q?.quest.target} team points</span></div>
        <div className="meter" style={{ margin: '10px 0 6px' }}><i style={{ width: `${q?.pct ?? 0}%` }} /></div>
        <div className="muted">Reward when we hit it: <b>{q?.quest.reward}</b>. Every checkmark counts for everyone.</div>
      </div>

      <div className="grid g2" style={{ marginTop: 14 }}>
        <div className="card" style={{ marginTop: 0 }}>
          <div className="row between"><h3><CalendarDays size={16} style={{ verticalAlign: -2 }} /> Today's schedule</h3><button className="btn sm" onClick={() => go('calendar')}>Open</button></div>
          <div className="stack" style={{ marginTop: 10 }}>
            {todays.length === 0 && <Empty>Nothing scheduled. Enjoy the open day.</Empty>}
            {todays.map((e) => (
              <div className="item" key={e.id}>
                <div className="grow"><div className="title">{e.title}</div>
                  <div className="muted">{e.start ? `${fmtTime(e.start)}${e.end ? ' – ' + fmtTime(e.end) : ''}` : 'All day'}{e.driverId ? ` • driver ${mem(e.driverId)?.name}` : ''}</div></div>
                <div className="row">{e.memberIds.map((i) => <MemberChip key={i} m={mem(i)} />)}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="card" style={{ marginTop: 0 }}>
          <div className="row between"><h3><ListChecks size={16} style={{ verticalAlign: -2 }} /> Routines today</h3><button className="btn sm" onClick={() => go('routines')}>Open</button></div>
          <div className="stack" style={{ marginTop: 10 }}>
            {dueRoutines.length === 0 && <Empty>No routines yet. Build one in Routines.</Empty>}
            {dueRoutines.map((r) => {
              const run = runs.find((x) => x.routineId === r.id)
              const done = run?.doneStepIds.length ?? 0
              return (
                <div className="item" key={r.id}>
                  <div className="grow"><div className="title">{r.name}</div><div className="muted">{mem(r.memberId)?.name ?? 'Everyone'} • {done}/{r.steps.length} steps</div></div>
                  <div style={{ width: 80 }} className="meter"><i style={{ width: `${r.steps.length ? (done / r.steps.length) * 100 : 0}%` }} /></div>
                  {run?.completed ? <span className="chip good">Done!</span> : <button className="btn sm primary" onClick={() => go('routines')}>Start</button>}
                </div>
              )
            })}
          </div>
        </div>

        {!limited && <div className="card" style={{ marginTop: 0 }}>
          <div className="row between"><h3><Pill size={16} style={{ verticalAlign: -2 }} /> Still to give today</h3><button className="btn sm" onClick={() => go('care')}>Open</button></div>
          <div className="stack" style={{ marginTop: 10 }}>
            {pendingMeds.length === 0 && <Empty>All caught up on medicine and vitamins.</Empty>}
            {pendingMeds.slice(0, 5).map(({ m, t }) => (
              <div className="item" key={m.id + t}><Ico k="medicine" /><div className="grow"><div className="title">{m.name} • {m.dose}</div><div className="muted">{mem(m.memberId)?.name} at {fmtTime(t)}</div></div></div>
            ))}
          </div>
        </div>}

        <div className="card" style={{ marginTop: 0 }}>
          <div className="row between"><h3><Hand size={16} style={{ verticalAlign: -2 }} /> Up for grabs</h3><button className="btn sm" onClick={() => go('family')}>Open</button></div>
          <div className="stack" style={{ marginTop: 10 }}>
            {open.length === 0 && <Empty>Nothing open. Add shared chores in Team Quest.</Empty>}
            {open.slice(0, 4).map((c) => <div className="item" key={c.id}><div className="grow title">{c.title}</div><span className="chip good">+{c.points}</span></div>)}
            {running.length > 0 && <div className="item"><TimerIcon size={18} /><div className="grow">{running.length} timer{running.length > 1 ? 's' : ''} running</div><button className="btn sm" onClick={() => go('care')}>View</button></div>}
          </div>
        </div>
      </div>
    </>
  )
}
