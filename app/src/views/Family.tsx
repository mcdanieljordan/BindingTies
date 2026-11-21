import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Gift, Hand, Plus, Settings2, Trash2, Trophy } from 'lucide-react'
import { db, setKV, type Chore, type Quest } from '../db'
import { Modal, PageHead, Empty, Who, MemberPick } from '../components/ui'
import { useChores, useLedger, useMembers, useRewards } from '../lib/useData'
import { award, celebrate, pointScale, questProgress, weekStart } from '../lib/engine'
import { todayStr, fmtDate } from '../lib/dates'
import { useApp } from '../ctx'

const BADGES = [
  { id: 'first', icon: '🌱', name: 'First step', desc: 'Earn your first point', test: (p: number) => p > 0 },
  { id: 'fifty', icon: '⭐', name: 'Rising star', desc: 'Earn 50 points', test: (p: number) => p >= 50 },
  { id: 'hundred', icon: '🚀', name: 'Rocket', desc: 'Earn 100 points', test: (p: number) => p >= 100 },
  { id: 'fivehundred', icon: '🏆', name: 'Champion', desc: 'Earn 500 points', test: (p: number) => p >= 500 },
]

export default function Family() {
  const { toast } = useApp()
  const members = useMembers()
  const ledger = useLedger()
  const chores = useChores()
  const rewards = useRewards()
  const prog = useLiveQuery(questProgress, [ledger], undefined)
  const [editQuest, setEditQuest] = useState<Quest | null>(null)
  const [chore, setChore] = useState<Partial<Chore> | null>(null)
  const [claim, setClaim] = useState<number | null>(null)
  const [reward, setReward] = useState({ title: '', cost: 50, scope: 'team' as 'team' | 'personal' })
  const [adj, setAdj] = useState<{ memberId?: number; points: number; reason: string } | null>(null)
  const today = todayStr()
  const mem = (id?: number) => members.find((m) => m.id === id)
  const kids = members.filter((m) => m.role !== 'caregiver')
  const wk = weekStart()
  const total = (id: number) => ledger.filter((e) => e.memberId === id).reduce((s, e) => s + e.points, 0)
  const daysActive = (id: number) => new Set(ledger.filter((e) => e.memberId === id && e.points > 0 && new Date(e.ts).toISOString().slice(0, 10) >= wk).map((e) => new Date(e.ts).toDateString())).size
  const done = prog && prog.total >= prog.quest.target

  const isDone = (c: Chore) => c.repeat === 'none' ? !!c.doneDate : c.repeat === 'daily' ? c.doneDate === today : c.doneDate !== undefined && c.doneDate >= wk && c.repeat === 'weekly'
  async function complete(c: Chore, by: number) {
    await db.chores.update(c.id, { doneBy: by, doneDate: today })
    await award(by, Math.round(c.points * pointScale()), `Chore: ${c.title}`)
    toast({ title: `${mem(by)?.name} did "${c.title}"`, body: `+${c.points} for the team!` })
    void celebrate(false); setClaim(null)
  }
  async function claimReward(id: number) {
    const r = rewards.find((x) => x.id === id)!
    if (r.scope === 'team') {
      if (!done) return
      await db.rewards.update(id, { claimedAt: Date.now() })
      void celebrate(true)
      toast({ title: 'Team reward unlocked! 🎉', body: r.title })
    }
  }
  async function spend(id: number, who: number) {
    const r = rewards.find((x) => x.id === id)!
    if (total(who) < r.cost) return toast({ title: 'Not enough points yet', body: `${mem(who)?.name} has ${total(who)}, needs ${r.cost}.`, kind: 'warn' })
    await award(who, -r.cost, `Spent: ${r.title}`)
    toast({ title: `${mem(who)?.name} got: ${r.title}` })
  }

  return (
    <>
      <PageHead title="Team Family Quest" sub="Everyone's effort fills the same bar. No penalties, ever." />
      <div className="card">
        <div className="row between">
          <div className="row"><Trophy color="var(--amber)" /><h2>{prog?.quest.title}</h2></div>
          <button className="btn sm" onClick={() => setEditQuest(prog!.quest)}><Settings2 size={14} />Change goal</button>
        </div>
        <div className="meter" style={{ margin: '12px 0 6px', height: 22 }}><i style={{ width: `${prog?.pct ?? 0}%` }} /></div>
        <div className="row between"><span><b>{prog?.total ?? 0}</b> / {prog?.quest.target} team points</span><span className="muted">Reward: {prog?.quest.reward}</span></div>
        {done && (
          <div className="row" style={{ marginTop: 12 }}>
            <span className="chip good">🎉 Goal reached! Time to celebrate together.</span>
            <button className="btn mint" onClick={async () => { void celebrate(true); await setKV('quest', { ...prog!.quest, since: Date.now(), title: 'Next family goal' } satisfies Quest) }}>Celebrate &amp; start next quest</button>
          </div>
        )}
      </div>

      <div className="grid g2" style={{ marginTop: 14 }}>
        <div className="card" style={{ marginTop: 0 }}>
          <h3>The team this week</h3>
          <div className="muted small">Contributions, not rankings. Every person counts.</div>
          <div className="stack" style={{ marginTop: 10 }}>
            {kids.map((m) => (
              <div className="item" key={m.id}><Who m={m} size={40} />
                <div className="grow"><div className="title">{m.name}</div><div className="muted">{daysActive(m.id)} active day{daysActive(m.id) === 1 ? '' : 's'} this week</div></div>
                <span className="chip good">{total(m.id)} pts</span>
              </div>
            ))}
          </div>
          <h3 style={{ marginTop: 16 }}>Badges</h3>
          <div className="grid g3" style={{ marginTop: 8, gridTemplateColumns: 'repeat(auto-fill,minmax(110px,1fr))' }}>
            {kids.flatMap((m) => BADGES.map((b) => ({ m, b, on: b.test(total(m.id)) }))).filter((x) => x.on).slice(0, 12).map(({ m, b }) => (
              <div className="badge-tile" key={m.id + b.id}><div style={{ fontSize: 30 }}>{b.icon}</div><b>{b.name}</b><div className="muted small">{m.name}</div></div>
            ))}
            {kids.every((m) => total(m.id) <= 0) && <div className="muted">Earn points to unlock badges.</div>}
          </div>
        </div>

        <div className="card" style={{ marginTop: 0 }}>
          <div className="row between"><h3><Hand size={16} style={{ verticalAlign: -2 }} /> Shared chores</h3><button className="btn sm primary" onClick={() => setChore({ title: '', points: 10, repeat: 'daily' })}><Plus size={14} />Add</button></div>
          <div className="stack" style={{ marginTop: 10 }}>
            {chores.length === 0 && <Empty>Add chores. Leave them "up for grabs" so anyone can jump in.</Empty>}
            {chores.map((c) => {
              const d = isDone(c)
              return (
                <div key={c.id} className={`item ${d ? 'done' : ''}`}>
                  <div className="grow"><div className="title">{c.title}</div>
                    <div className="muted">{c.assigneeId ? `For ${mem(c.assigneeId)?.name}` : 'Up for grabs'} • {c.repeat === 'none' ? 'once' : c.repeat}{d && c.doneBy ? ` • done by ${mem(c.doneBy)?.name}` : ''}</div></div>
                  <span className="chip good">+{c.points}</span>
                  {d ? <span className="chip">✓</span> : c.assigneeId ? <button className="btn sm mint" onClick={() => complete(c, c.assigneeId!)}>Done</button> : <button className="btn sm mint" onClick={() => setClaim(c.id)}>I did it</button>}
                  <button className="btn ghost sm" aria-label="Delete chore" onClick={() => db.chores.delete(c.id)}><Trash2 size={14} /></button>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      <div className="grid g2" style={{ marginTop: 14 }}>
        <div className="card" style={{ marginTop: 0 }}>
          <h3><Gift size={16} style={{ verticalAlign: -2 }} /> Rewards</h3>
          <div className="stack" style={{ marginTop: 10 }}>
            {rewards.map((r) => (
              <div className="item" key={r.id}>
                <div className="grow"><div className="title">{r.title}</div><div className="muted">{r.scope === 'team' ? 'Team reward: unlocks when the quest bar fills' : `${r.cost} personal points`}</div></div>
                {r.scope === 'team'
                  ? (r.claimedAt ? <span className="chip good">Enjoyed ✓</span> : <button className="btn sm" disabled={!done} onClick={() => claimReward(r.id)}>Unlock</button>)
                  : <MemberPick members={kids.filter((m) => m.role === 'child')} onChange={(v) => v && spend(r.id, v)} any anyLabel={`Spend ${r.cost}…`} />}
                <button className="btn ghost sm" aria-label="Delete reward" onClick={() => db.rewards.delete(r.id)}><Trash2 size={14} /></button>
              </div>
            ))}
          </div>
          <div className="row" style={{ marginTop: 12 }}>
            <input style={{ flex: '1 1 160px' }} placeholder="New reward" value={reward.title} onChange={(e) => setReward({ ...reward, title: e.target.value })} />
            <input type="number" min={5} style={{ width: 78 }} value={reward.cost} onChange={(e) => setReward({ ...reward, cost: Number(e.target.value) })} aria-label="Cost" />
            <select value={reward.scope} onChange={(e) => setReward({ ...reward, scope: e.target.value as 'team' | 'personal' })}><option value="team">Team</option><option value="personal">Personal</option></select>
            <button className="btn" onClick={async () => { if (!reward.title.trim()) return; await db.rewards.add({ ...reward, title: reward.title.trim() } as never); setReward({ ...reward, title: '' }) }}>Add</button>
          </div>
        </div>

        <div className="card" style={{ marginTop: 0 }}>
          <div className="row between"><h3>Points history</h3><button className="btn sm" onClick={() => setAdj({ points: 5, reason: '' })}>Give bonus</button></div>
          <div className="stack" style={{ marginTop: 10, maxHeight: 300, overflow: 'auto' }}>
            {ledger.length === 0 && <Empty>Complete a routine step to see points land here.</Empty>}
            {ledger.slice(0, 40).map((e) => (
              <div className="item" key={e.id} style={{ padding: '6px 10px' }}><Who m={mem(e.memberId)} size={26} />
                <div className="grow"><div>{e.reason}</div><div className="muted small">{fmtDate(new Date(e.ts).toISOString().slice(0, 10))} • {mem(e.memberId)?.name}</div></div>
                <b style={{ color: e.points >= 0 ? 'var(--mint)' : 'var(--amber)' }}>{e.points > 0 ? '+' : ''}{e.points}</b>
                <button className="btn ghost sm" aria-label="Remove entry" onClick={() => db.ledger.delete(e.id)}>×</button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {editQuest && (
        <Modal title="Family quest" onClose={() => setEditQuest(null)}>
          <div className="stack">
            <label className="f">Quest name<input value={editQuest.title} onChange={(e) => setEditQuest({ ...editQuest, title: e.target.value })} /></label>
            <label className="f">Team points needed<input type="number" min={20} value={editQuest.target} onChange={(e) => setEditQuest({ ...editQuest, target: Number(e.target.value) })} /></label>
            <label className="f">Reward<input value={editQuest.reward} onChange={(e) => setEditQuest({ ...editQuest, reward: e.target.value })} /></label>
            <div className="row between"><button className="btn" onClick={() => setEditQuest({ ...editQuest, since: Date.now() })}>Restart progress from today</button><button className="btn primary" onClick={async () => { await setKV('quest', editQuest); setEditQuest(null) }}>Save</button></div>
          </div>
        </Modal>
      )}
      {chore && (
        <Modal title="New shared chore" onClose={() => setChore(null)}>
          <div className="stack">
            <label className="f">Chore<input value={chore.title ?? ''} onChange={(e) => setChore({ ...chore, title: e.target.value })} autoFocus /></label>
            <div className="row">
              <label className="f">Points<input type="number" min={1} value={chore.points} onChange={(e) => setChore({ ...chore, points: Number(e.target.value) })} /></label>
              <label className="f">Repeats<select value={chore.repeat} onChange={(e) => setChore({ ...chore, repeat: e.target.value as Chore['repeat'] })}><option value="none">Once</option><option value="daily">Daily</option><option value="weekly">Weekly</option></select></label>
              <label className="f">Who<MemberPick any anyLabel="Up for grabs" members={kids} value={chore.assigneeId} onChange={(v) => setChore({ ...chore, assigneeId: v })} /></label>
            </div>
            <button className="btn primary" onClick={async () => { if (!chore.title?.trim()) return; await db.chores.add({ ...chore, title: chore.title.trim() } as never); setChore(null) }}>Add chore</button>
          </div>
        </Modal>
      )}
      {claim && (
        <Modal title="Who did it?" onClose={() => setClaim(null)}>
          <div className="row">{kids.map((m) => <button key={m.id} className="btn big" onClick={() => complete(chores.find((c) => c.id === claim)!, m.id)}><Who m={m} size={28} />{m.name}</button>)}</div>
        </Modal>
      )}
      {adj && (
        <Modal title="Give a bonus" onClose={() => setAdj(null)}>
          <div className="stack">
            <label className="f">Who<MemberPick members={kids} value={adj.memberId} onChange={(v) => setAdj({ ...adj, memberId: v })} any anyLabel="Choose…" /></label>
            <label className="f">Points<input type="number" value={adj.points} onChange={(e) => setAdj({ ...adj, points: Number(e.target.value) })} /></label>
            <label className="f">Why<input value={adj.reason} placeholder="Kind to her brother" onChange={(e) => setAdj({ ...adj, reason: e.target.value })} /></label>
            <button className="btn primary" disabled={!adj.memberId} onClick={async () => { await award(adj.memberId!, adj.points, adj.reason || 'Bonus'); setAdj(null) }}>Give</button>
          </div>
        </Modal>
      )}
    </>
  )
}
