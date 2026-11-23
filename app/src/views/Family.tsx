import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Check, Gift, Hand, Plus, Settings2, Trash2, Trophy, X } from 'lucide-react'
import { db, DEFAULT_PREFS, getKV, setKV, type Chore, type ChoreTemplate, type Prefs, type Quest } from '../db'
import { Modal, PageHead, Empty, Who, MemberPick } from '../components/ui'
import { useChores, useLedger, useMembers, useRewards } from '../lib/useData'
import { award, celebrate, pointScale, questProgress, weekStart } from '../lib/engine'
import { todayStr, fmtDate, ymd } from '../lib/dates'
import { CHORE_PRESETS } from '../lib/seed'
import { awards, standings } from '../lib/board'
import { nextTurnOf, rotationAnchor, turnOf } from '../lib/chores'
import { useApp } from '../ctx'

const BADGES = [
  { id: 'first', icon: '🌱', name: 'First step', desc: 'Earn your first point', test: (p: number) => p > 0 },
  { id: 'fifty', icon: '⭐', name: 'Rising star', desc: 'Earn 50 points', test: (p: number) => p >= 50 },
  { id: 'hundred', icon: '🚀', name: 'Rocket', desc: 'Earn 100 points', test: (p: number) => p >= 100 },
  { id: 'fivehundred', icon: '🏆', name: 'Champion', desc: 'Earn 500 points', test: (p: number) => p >= 500 },
]

export default function Family() {
  const { toast, me, family } = useApp()
  const members = useMembers()
  const ledger = useLedger()
  const chores = useChores()
  const rewards = useRewards()
  const prog = useLiveQuery(questProgress, [ledger], undefined)
  const [editQuest, setEditQuest] = useState<Quest | null>(null)
  const [chore, setChore] = useState<Partial<Chore> | null>(null)
  const [saveTpl, setSaveTpl] = useState(false)
  const [setup, setSetup] = useState(false)
  const prefs = useLiveQuery(async () => ({ ...DEFAULT_PREFS, ...(await getKV<Partial<Prefs>>('prefs', {})) }), [], DEFAULT_PREFS)
  const templates = useLiveQuery(() => getKV<ChoreTemplate[]>('choreTemplates', []), [], [] as ChoreTemplate[])
  const [claim, setClaim] = useState<number | null>(null)
  const [reward, setReward] = useState({ title: '', cost: 50, scope: 'team' as 'team' | 'personal' })
  const [adj, setAdj] = useState<{ memberId?: number; points: number; reason: string } | null>(null)
  const today = todayStr()
  const mem = (id?: number) => members.find((m) => m.id === id)
  const kids = members.filter((m) => m.role !== 'caregiver')
  const wk = weekStart()
  const alive = new Set(members.map((m) => m.id))
  const total = (id: number) => ledger.filter((e) => e.memberId === id).reduce((s, e) => s + e.points, 0)
  const daysActive = (id: number) => new Set(ledger.filter((e) => e.memberId === id && e.points > 0 && new Date(e.ts).toISOString().slice(0, 10) >= wk).map((e) => new Date(e.ts).toDateString())).size
  const done = prog && prog.total >= prog.quest.target

  const isDone = (c: Chore) => c.repeat === 'none' ? !!c.doneDate : c.repeat === 'daily' ? c.doneDate === today : c.doneDate !== undefined && c.doneDate >= wk && c.repeat === 'weekly'
  // Only a parent on a full account can approve or change chores. If a family has no parent profile yet, anyone can.
  const meM = members.find((m) => m.id === me)
  const isParent = !members.some((m) => m.role === 'parent') || (meM?.role === 'parent' && family?.access !== 'limited')
  const pending = chores.filter((c) => c.pendingBy && !isDone(c))
  async function finish(c: Chore, by: number, day = today) {
    await db.chores.update(c.id, { doneBy: by, doneDate: day, pendingBy: undefined, pendingTs: undefined })
    await award(by, Math.round(c.points * pointScale()), `Chore: ${c.title}`)
    toast({ title: `${mem(by)?.name} did "${c.title}"`, body: `+${c.points} for the team!` })
    void celebrate(false)
  }
  async function complete(c: Chore, by: number) {
    setClaim(null)
    if (prefs.requireApproval && !isParent) {
      await db.chores.update(c.id, { pendingBy: by, pendingTs: Date.now() })
      toast({ title: 'Sent to a parent', body: 'Points arrive when they give a thumbs-up.' })
      return
    }
    await finish(c, by)
  }
  const approve = (c: Chore) => finish(c, c.pendingBy!, c.pendingTs ? ymd(new Date(c.pendingTs)) : today)
  const notYet = (c: Chore) => db.chores.update(c.id, { pendingBy: undefined, pendingTs: undefined })
  async function saveChore() {
    if (!chore?.title?.trim()) return
    const repeat = chore.repeat ?? 'daily'
    const turns = chore.rotate && repeat !== 'none' && chore.rotate.length >= 2 ? chore.rotate : undefined
    const old = chore.id ? chores.find((c) => c.id === chore.id) : undefined
    const same = !!old && !!turns && old.repeat === repeat && JSON.stringify(old.rotate) === JSON.stringify(turns)
    const rec = {
      title: chore.title.trim(), points: Math.max(1, Number(chore.points) || 1), repeat,
      assigneeId: turns ? undefined : chore.assigneeId,
      rotate: turns, rotateFrom: turns ? (same ? old!.rotateFrom : rotationAnchor(repeat, today)) : undefined, rotateShift: turns && same ? old!.rotateShift : undefined,
    }
    if (chore.id) await db.chores.update(chore.id, rec)
    else await db.chores.add(rec as never)
    if (saveTpl && !templates.some((t) => t.title.toLowerCase() === rec.title.toLowerCase() && t.points === rec.points)) {
      await setKV('choreTemplates', [...templates, { id: Math.random().toString(36).slice(2, 9), title: rec.title, points: rec.points, repeat: rec.repeat }])
    }
    setChore(null); setSaveTpl(false)
  }
  const startFrom = (t: { title: string; points: number; repeat: Chore['repeat'] }) => setChore((c) => ({ ...c, title: t.title, points: t.points, repeat: t.repeat }))
  // the friendly weekly challenge (children only; resets every Sunday)
  const children = members.filter((m) => m.role === 'child')
  const board = standings(ledger, children, wk, today)
  const lastWeek = awards(standings(ledger, children, ymd(new Date(new Date(wk + 'T00:00:00').getTime() - 7 * 86400000)), ymd(new Date(new Date(wk + 'T00:00:00').getTime() - 86400000))))
  const topEffort = Math.max(1, ...board.map((b) => b.effort))
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

      {pending.length > 0 && (
        <div className="card" style={{ borderColor: 'var(--amber)' }}>
          <h3>⏳ {isParent ? 'Waiting for your thumbs-up' : 'Waiting for a parent'}</h3>
          <div className="stack" style={{ marginTop: 10 }}>
            {pending.map((c) => (
              <div className="item" key={c.id}><Who m={mem(c.pendingBy)} size={32} />
                <div className="grow"><div className="title">{mem(c.pendingBy)?.name}: {c.title}</div><div className="muted">+{c.points} points when approved</div></div>
                {isParent ? <><button className="btn sm mint" onClick={() => approve(c)}><Check size={14} />Approve</button><button className="btn sm" onClick={() => notYet(c)}>Not yet</button></> : <span className="chip">Sent</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {prefs.board === 'friendly' && children.length > 0 && (
        <div className="card">
          <div className="row between"><h3>🏁 This week's friendly challenge</h3><span className="muted small">Fresh start every Sunday</span></div>
          <div className="stack" style={{ marginTop: 10 }}>
            {board.map((b, i) => {
              const m = mem(b.id)
              return (
                <div className="item" key={b.id}>
                  <span style={{ fontSize: 24, width: 30, textAlign: 'center' }}>{b.effort > 0 ? ['🥇', '🥈', '🥉'][i] ?? '⭐' : '🌱'}</span>
                  <Who m={m} size={38} />
                  <div className="grow">
                    <div className="title">{m?.name}</div>
                    <div className="meter" style={{ height: 8, margin: '4px 0' }}><i style={{ width: `${Math.round((b.effort / topEffort) * 100)}%` }} /></div>
                    <div className="muted small">{b.points} pts • {b.days} active day{b.days === 1 ? '' : 's'}{b.streak >= 2 ? ` • 🔥 ${b.streak} in a row` : ''}{b.delta > 0 ? ` • ↑ ${b.delta} more than last week` : ''}</div>
                  </div>
                  <span className="chip good">{b.effort}</span>
                </div>
              )
            })}
            {board.every((b) => b.effort === 0) && <div className="muted">A fresh week! Finish a routine step or a chore to get on the board.</div>}
          </div>
          <div className="muted small" style={{ marginTop: 8 }}>Effort score = points (little ones get a boost) + 5 for every active day + streak bonus. Everyone who tries counts.</div>
          {lastWeek.length > 0 && (
            <>
              <h3 style={{ marginTop: 14 }}>Last week's winners</h3>
              <div className="row" style={{ marginTop: 8, gap: 8 }}>
                {lastWeek.map((a) => <div className="badge-tile" key={a.key} style={{ minWidth: 130 }}><div style={{ fontSize: 28 }}>{a.icon}</div><b>{a.title}</b><div className="muted small">{a.ids.map((i) => mem(i)?.name).join(' & ')}</div><div className="muted small">{a.why}</div></div>)}
              </div>
            </>
          )}
        </div>
      )}

      <div className="grid g2" style={{ marginTop: 14 }}>
        <div className="card" style={{ marginTop: 0 }}>
          <h3>The team this week</h3>
          <div className="muted small">{prefs.board === 'friendly' ? 'Everyone\'s contribution, in points.' : 'Contributions, not rankings. Every person counts.'}</div>
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
          <div className="row between"><h3><Hand size={16} style={{ verticalAlign: -2 }} /> Shared chores</h3><div className="row" style={{ gap: 6 }}>{isParent && <button className="btn sm" aria-label="Team settings" onClick={() => setSetup(true)}><Settings2 size={14} /></button>}{isParent && <button className="btn sm primary" onClick={() => { setSaveTpl(false); setChore({ title: '', points: 10, repeat: 'daily' }) }}><Plus size={14} />Add</button>}</div></div>
          <div className="stack" style={{ marginTop: 10 }}>
            {chores.length === 0 && <Empty>{isParent ? 'Add chores. Pick from ready-made ones or make your own.' : 'No chores yet. A parent can add some.'}</Empty>}
            {chores.map((c) => {
              const d = isDone(c)
              const wait = !!c.pendingBy && !d
              const turn = turnOf(c, today, alive)
              const next = nextTurnOf(c, today, alive)
              return (
                <div key={c.id} className={`item ${d ? 'done' : ''}`}>
                  <div className="grow" style={isParent ? { cursor: 'pointer' } : undefined} onClick={() => isParent && (setSaveTpl(false), setChore(c))}><div className="title">{c.title}</div>
                    <div className="muted">{next ? `🔄 ${mem(turn)?.name}'s turn (then ${mem(next)?.name})` : turn ? `For ${mem(turn)?.name}` : 'Up for grabs'} • {c.repeat === 'none' ? 'once' : c.repeat}{d && c.doneBy ? ` • done by ${mem(c.doneBy)?.name}` : ''}</div></div>
                  <span className="chip good">+{c.points}</span>
                  {d ? <span className="chip">✓</span> : wait ? <span className="chip">⏳ {mem(c.pendingBy)?.name}</span> : turn ? <button className="btn sm mint" onClick={() => complete(c, turn)}>Done</button> : <button className="btn sm mint" onClick={() => setClaim(c.id)}>I did it</button>}
                  {isParent && next && !d && !wait && <button className="btn ghost sm" title="Skip this turn" aria-label={`Skip ${mem(turn)?.name}'s turn`} onClick={() => db.chores.update(c.id, { rotateShift: (c.rotateShift ?? 0) + 1 })}>Skip</button>}
                  {isParent && <button className="btn ghost sm" aria-label="Delete chore" onClick={() => confirm(`Delete "${c.title}"?`) && db.chores.delete(c.id)}><Trash2 size={14} /></button>}
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
        <Modal title={chore.id ? 'Edit chore' : 'New shared chore'} onClose={() => setChore(null)}>
          <div className="stack">
            {!chore.id && (
              <>
                <div className="muted">Start from a template, or type your own below.</div>
                <div className="row" style={{ maxHeight: 150, overflow: 'auto', gap: 6 }}>
                  {templates.map((t) => (
                    <span key={t.id} className="tab" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <span onClick={() => startFrom(t)} style={{ cursor: 'pointer' }}>⭐ {t.title} · {t.points}</span>
                      <X size={12} aria-label={`Remove template ${t.title}`} style={{ cursor: 'pointer' }} onClick={() => void setKV('choreTemplates', templates.filter((x) => x.id !== t.id))} />
                    </span>
                  ))}
                  {CHORE_PRESETS.map((t) => <button key={t.title} className="tab" onClick={() => startFrom(t)}>{t.title} · {t.points}</button>)}
                </div>
              </>
            )}
            <label className="f">Chore<input value={chore.title ?? ''} onChange={(e) => setChore({ ...chore, title: e.target.value })} autoFocus={!!chore.id} /></label>
            <div className="row">
              <label className="f">Points<input type="number" min={1} value={chore.points} onChange={(e) => setChore({ ...chore, points: Number(e.target.value) })} /></label>
              <label className="f">Repeats<select value={chore.repeat} onChange={(e) => setChore({ ...chore, repeat: e.target.value as Chore['repeat'] })}><option value="none">Once</option><option value="daily">Daily</option><option value="weekly">Weekly</option></select></label>
              <label className="f">Who
                <select value={chore.rotate ? 'turns' : chore.assigneeId ?? ''} onChange={(e) => { const v = e.target.value; setChore(v === 'turns' ? { ...chore, rotate: chore.rotate ?? [], assigneeId: undefined } : { ...chore, rotate: undefined, assigneeId: v ? Number(v) : undefined }) }}>
                  <option value="">Up for grabs</option>
                  {kids.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                  <option value="turns">🔄 Take turns…</option>
                </select>
              </label>
            </div>
            {chore.rotate && (
              <div className="stack" style={{ gap: 6 }}>
                <div className="muted">Pick who takes turns, in order. The turn moves on every {chore.repeat === 'weekly' ? 'week' : 'day'}.</div>
                <div className="row">
                  {kids.map((m) => {
                    const pos = chore.rotate!.indexOf(m.id)
                    return <button key={m.id} type="button" className={`tab ${pos >= 0 ? 'on' : ''}`} onClick={() => setChore({ ...chore, rotate: pos >= 0 ? chore.rotate!.filter((x) => x !== m.id) : [...chore.rotate!, m.id] })}>{pos >= 0 ? `${pos + 1}. ` : ''}{m.name}</button>
                  })}
                </div>
                {chore.repeat === 'none' && <div className="err">Taking turns needs a daily or weekly chore. Change "Repeats" above.</div>}
                {chore.repeat !== 'none' && chore.rotate.length < 2 && <div className="muted small">Choose at least two people.</div>}
              </div>
            )}
            <label className="row" style={{ gap: 8 }}><input type="checkbox" checked={saveTpl} onChange={(e) => setSaveTpl(e.target.checked)} /> Save as a template to reuse</label>
            <div className="row between">
              {chore.id ? <button className="btn ghost" onClick={async () => { if (confirm(`Delete "${chore.title}"?`)) { await db.chores.delete(chore.id!); setChore(null) } }}><Trash2 size={14} /> Delete</button> : <span />}
              <button className="btn primary" disabled={!chore.title?.trim() || (!!chore.rotate && (chore.repeat === 'none' || chore.rotate.length < 2))} onClick={saveChore}>{chore.id ? 'Save changes' : 'Add chore'}</button>
            </div>
          </div>
        </Modal>
      )}
      {setup && (
        <Modal title="Team settings" onClose={() => setSetup(false)}>
          <div className="stack">
            <label className="row" style={{ gap: 8, alignItems: 'flex-start' }}>
              <input type="checkbox" checked={prefs.requireApproval} onChange={(e) => void setKV('prefs', { ...prefs, requireApproval: e.target.checked })} />
              <span><b>Parents approve chores</b><br /><span className="muted">A child taps "I did it", a parent gives a thumbs-up, then the points count.</span></span>
            </label>
            <div><b>Leaderboard</b></div>
            <div className="seg">
              <button type="button" className={prefs.board === 'team' ? 'on' : ''} onClick={() => void setKV('prefs', { ...prefs, board: 'team' })}>Team only</button>
              <button type="button" className={prefs.board === 'friendly' ? 'on' : ''} onClick={() => void setKV('prefs', { ...prefs, board: 'friendly' })}>Friendly challenge</button>
            </div>
            <div className="muted small">{prefs.board === 'friendly' ? 'A weekly board that ranks effort (active days, streaks, points with a boost for little ones). It resets every Sunday and gives out awards like Most Improved.' : 'Only the shared team bar. No rankings.'}</div>
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
