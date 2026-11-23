import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Lock, Plus, Printer, Search, Settings2, Target, Trash2, X } from 'lucide-react'
import { db, newId, type JournalEntry, type JournalGoal, type JournalMedia, type Member } from '../db'
import { AttachBar, MediaList } from '../components/JournalMedia'
import PrintJournal from '../components/PrintJournal'
import { fmtSize, removeMedia } from '../lib/media'
import { Empty, Modal, PageHead, Who } from '../components/ui'
import { useMembers } from '../lib/useData'
import { useApp } from '../ctx'
import { addDays, fmtDate, todayStr } from '../lib/dates'
import { audience, canEdit, canSee, getPin, hashPin, isMinor, isUnlocked, savePin, setUnlocked } from '../lib/journal'

type Draft = Partial<JournalEntry> & { goals: JournalGoal[]; shareWith: number[]; shareParents: boolean; media: JournalMedia[] }

const longDate = (s: string) => fmtDate(s, { weekday: 'short', month: 'short', day: 'numeric', year: s.slice(0, 4) === todayStr().slice(0, 4) ? undefined : 'numeric' })
const firstLine = (t: string) => (t.split('\n').find((l) => l.trim()) ?? '').slice(0, 90)

export default function Journal() {
  const { me, family, toast, journalFocus, setMe } = useApp()
  const members = useMembers()
  const entries = useLiveQuery(() => db.journal.toArray(), [], [])
  const policies = useLiveQuery(() => db.policy.toArray(), [], [])
  const allMedia = useLiveQuery(() => db.journalMedia.toArray(), [], [])
  const meM = members.find((m) => m.id === me)
  const [tab, setTab] = useState<'mine' | 'others'>('mine')
  const [q, setQ] = useState('')
  const [onDay, setOnDay] = useState('')
  const [edit, setEdit] = useState<Draft | null>(null)
  const [read, setRead] = useState<JournalEntry | null>(null)
  const [lockOpen, setLockOpen] = useState(false)
  const [printOpen, setPrintOpen] = useState(false)
  const [pin, setPin] = useState('')
  const [unlocked, setUn] = useState(false)
  const [hasPin, setHasPin] = useState(false)
  const today = todayStr()

  useEffect(() => { setUn(meM ? isUnlocked(meM.id) : false); setHasPin(meM ? !!getPin(meM.id) : false) }, [meM?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // opened from the calendar
  useEffect(() => {
    if (!journalFocus) return
    const e = journalFocus.id ? entries.find((x) => x.id === journalFocus.id) : undefined
    if (e && canSee(e, meM, members, policies)) { if (canEdit(e, meM)) setEdit(toDraft(e)); else setRead(e) } else setOnDay(journalFocus.date)
  }, [journalFocus?.seq]) // eslint-disable-line react-hooks/exhaustive-deps

  // The journal belongs to whoever signed in: the server only lets an account write its own person's entries.
  const linked = family?.status === 'approved' ? family.member_id : undefined
  const signedIn = family?.status === 'approved'
  const canWrite = !!meM && (!signedIn || (linked != null && me === linked))
  const linkedName = members.find((m) => m.id === linked)?.name
  const forced = !!meM && isMinor(meM) && policies.some((p) => p.id === meM.id && p.parentsRead)

  if (!meM) return <><PageHead title="Journal" /><div className="card"><Empty>Choose who is using BindingTies first.</Empty></div></>

  if (hasPin && !unlocked) {
    return (
      <>
        <PageHead title="Journal" sub={`${meM.name}'s journal is locked.`} />
        <div className="card stack" style={{ maxWidth: 360 }}>
          <label className="f">Journal PIN<input type="password" inputMode="numeric" autoComplete="off" value={pin} onChange={(e) => setPin(e.target.value)} autoFocus /></label>
          <button className="btn primary" onClick={async () => { if ((await hashPin(pin, meM.id)) === getPin(meM.id)) { setUnlocked(meM.id); setUn(true); setPin('') } else toast({ title: 'That PIN is not right', kind: 'warn' }) }}><Lock size={15} />Open my journal</button>
        </div>
      </>
    )
  }

  const visible = entries.filter((e) => canSee(e, meM, members, policies))
  const needle = q.trim().toLowerCase()
  const pool = visible
    .filter((e) => (tab === 'mine' ? e.ownerMemberId === meM.id : e.ownerMemberId !== meM.id))
    .filter((e) => !onDay || e.date === onDay)
    .filter((e) => !needle || `${e.title ?? ''} ${e.body} ${e.goals.map((g) => g.text).join(' ')}`.toLowerCase().includes(needle))
  const upcoming = pool.filter((e) => e.date > today).sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt)
  const past = pool.filter((e) => e.date <= today).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt)
  const nOthers = visible.filter((e) => e.ownerMemberId !== meM.id).length

  const blank = (date: string, kind: 'note' | 'plan'): Draft => ({ date, kind, title: '', body: '', goals: [], shareWith: [], shareParents: isMinor(meM), media: [] })
  function toDraft(e: JournalEntry): Draft { return { ...e, goals: e.goals ?? [], shareWith: e.shareWith ?? [], media: allMedia.filter((m) => m.entryId === e.id) } }

  async function save() {
    if (!edit || !meM) return
    const goals = edit.goals.filter((g) => g.text.trim()).map((g) => ({ ...g, text: g.text.trim() }))
    const body = (edit.body ?? '').trim()
    if (!body && !goals.length && !edit.media.length) return toast({ title: 'Write something or add a photo first', kind: 'warn' })
    const rec = { ownerMemberId: meM.id, date: edit.date ?? today, kind: edit.kind ?? 'note', title: edit.title?.trim() || undefined, body, goals, shareWith: edit.shareWith, shareParents: forced ? true : edit.shareParents, updatedAt: Date.now() }
    const id = edit.id ?? newId()
    if (edit.id) await db.journal.update(id, rec)
    else await db.journal.add({ ...rec, id, createdAt: Date.now() } as never)
    // attachments: add the new ones, remove the ones taken off
    const before = allMedia.filter((m) => m.entryId === id)
    const had = new Set(before.map((m) => m.id)), keep = new Set(edit.media.map((m) => m.id))
    for (const m of edit.media) if (!had.has(m.id)) await db.journalMedia.add({ ...m, entryId: id } as never)
    for (const m of before) if (!keep.has(m.id)) await removeMedia(m)
    setEdit(null)
  }
  async function remove(e: Draft) {
    if (!e.id || !confirm('Delete this entry? This cannot be undone.')) return
    for (const m of allMedia.filter((x) => x.entryId === e.id)) await removeMedia(m)
    await db.journal.delete(e.id); setEdit(null)
  }
  const others = members.filter((m) => m.id !== meM.id && m.role !== 'caregiver' && !(isMinor(meM) && m.role === 'parent'))
  const mem = (id: number) => members.find((m) => m.id === id)

  const Card = ({ e }: { e: JournalEntry }) => {
    const mine = e.ownerMemberId === meM.id
    const a = audience(e, members)
    const done = e.goals.filter((g) => g.done).length
    const att = allMedia.filter((m) => m.entryId === e.id)
    const n = (k: JournalMedia['kind']) => att.filter((m) => m.kind === k).length
    return (
      <div className="item jcard" onClick={() => (canEdit(e, meM) ? setEdit(toDraft(e)) : setRead(e))} style={{ cursor: 'pointer', alignItems: 'flex-start' }}>
        {!mine && <Who m={mem(e.ownerMemberId)} size={34} />}
        <div className="grow">
          <div className="muted small">{longDate(e.date)} • {e.kind === 'plan' ? '🎯 Plan' : '📓 Journal'}{e.date > today ? ' • upcoming' : ''}</div>
          <div className="title">{e.title || firstLine(e.body) || 'Goals'}</div>
          {e.title && e.body && <div className="muted jclamp">{e.body}</div>}
          <div className="row" style={{ marginTop: 4, gap: 6 }}>
            {e.goals.length > 0 && <span className="chip"><Target size={12} /> {done}/{e.goals.length} goals</span>}
            {n('image') > 0 && <span className="chip">🖼 {n('image')}</span>}
            {n('audio') > 0 && <span className="chip">🎧 {n('audio')}</span>}
            {n('video') > 0 && <span className="chip">🎬 {n('video')}</span>}
            {mine ? <span className="chip">{a.icon} {a.text}</span> : <span className="chip">From {mem(e.ownerMemberId)?.name ?? 'someone'}</span>}
          </div>
        </div>
      </div>
    )
  }

  return (
    <>
      <PageHead title="Journal" sub="Write it down, look back, plan ahead. Only the people you choose can read it.">
        <button className="btn" aria-label="Journal lock" onClick={() => setLockOpen(true)}><Settings2 size={16} /></button>
        <button className="btn" onClick={() => setPrintOpen(true)}><Printer size={16} />Print / PDF</button>
        {canWrite && <button className="btn" onClick={() => setEdit(blank(addDays(today, 1), 'plan'))}><Target size={16} />Plan a day</button>}
        {canWrite && <button className="btn primary" onClick={() => setEdit(blank(onDay || today, 'note'))}><Plus size={16} />New entry</button>}
      </PageHead>

      {forced && <div className="card" style={{ borderColor: 'var(--amber)' }}><b>👪 Your parents can read your journal.</b><div className="muted">They turned this on in Settings, so everything you write here is visible to them.</div></div>}
      {signedIn && !canWrite && (
        <div className="card">
          <b>Journals belong to each person's own sign-in.</b>
          <div className="muted" style={{ margin: '4px 0 10px' }}>This device is signed in as {linkedName ?? 'another person'}, so you can read what is shared with {meM.name} but not write. To keep a private journal, {meM.name} needs their own sign-in (Settings → Invite).</div>
          {linked != null && <button className="btn" onClick={() => setMe(linked)}>Switch to {linkedName}</button>}
        </div>
      )}

      <div className="card no-print">
        <div className="row">
          <div className="seg">
            <button className={tab === 'mine' ? 'on' : ''} onClick={() => setTab('mine')}>My journal</button>
            <button className={tab === 'others' ? 'on' : ''} onClick={() => setTab('others')}>From others{nOthers ? ` (${nOthers})` : ''}</button>
          </div>
          <div className="row" style={{ flex: '1 1 160px', gap: 6 }}><Search size={16} /><input style={{ flex: 1 }} placeholder="Search" aria-label="Search the journal" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <label className="row" style={{ gap: 6 }}><span className="muted small">Day</span><input type="date" aria-label="Show one day" value={onDay} onChange={(e) => setOnDay(e.target.value)} /></label>
          {onDay && <button className="btn sm" onClick={() => setOnDay('')}><X size={14} />All days</button>}
        </div>
      </div>

      <div className="stack" style={{ marginTop: 14 }}>
        {upcoming.length > 0 && <h3>Coming up</h3>}
        {upcoming.map((e) => <Card key={e.id} e={e} />)}
        {past.length > 0 && upcoming.length > 0 && <h3>Earlier</h3>}
        {past.map((e) => <Card key={e.id} e={e} />)}
        {pool.length === 0 && (
          <div className="card"><Empty>
            {tab === 'others' ? 'Nothing has been shared with you yet.' : needle || onDay ? 'No entries match.' : canWrite ? 'Nothing here yet. Write about today, or plan tomorrow and set a few goals.' : 'Nothing here yet.'}
          </Empty></div>
        )}
      </div>

      {edit && (
        <Modal title={edit.id ? 'Edit entry' : 'New entry'} onClose={() => setEdit(null)}>
          <div className="stack">
            <div className="row">
              <label className="f">Day<input type="date" value={edit.date ?? today} onChange={(e) => setEdit({ ...edit, date: e.target.value })} /></label>
              <div className="seg" style={{ alignSelf: 'flex-end' }}>
                <button type="button" className={edit.kind !== 'plan' ? 'on' : ''} onClick={() => setEdit({ ...edit, kind: 'note' })}>📓 Journal</button>
                <button type="button" className={edit.kind === 'plan' ? 'on' : ''} onClick={() => setEdit({ ...edit, kind: 'plan' })}>🎯 Plan</button>
              </div>
            </div>
            <label className="f">Title (optional)<input value={edit.title ?? ''} onChange={(e) => setEdit({ ...edit, title: e.target.value })} /></label>
            <label className="f">{edit.kind === 'plan' ? 'Intentions for the day' : 'What happened? How did it feel?'}<textarea rows={7} value={edit.body ?? ''} onChange={(e) => setEdit({ ...edit, body: e.target.value })} autoFocus /></label>

            <div>
              <div className="muted" style={{ fontWeight: 800, marginBottom: 6 }}>Goals{edit.kind === 'plan' ? '' : ' (optional)'}</div>
              <div className="stack" style={{ gap: 6 }}>
                {edit.goals.map((g) => (
                  <div className="row" key={g.id} style={{ flexWrap: 'nowrap' }}>
                    <input type="checkbox" checked={g.done} aria-label="Done" onChange={(e) => setEdit({ ...edit, goals: edit.goals.map((x) => (x.id === g.id ? { ...x, done: e.target.checked } : x)) })} />
                    <input style={{ flex: 1 }} value={g.text} onChange={(e) => setEdit({ ...edit, goals: edit.goals.map((x) => (x.id === g.id ? { ...x, text: e.target.value } : x)) })} />
                    <button className="btn ghost sm" aria-label="Remove goal" onClick={() => setEdit({ ...edit, goals: edit.goals.filter((x) => x.id !== g.id) })}><X size={14} /></button>
                  </div>
                ))}
                <button className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={() => setEdit({ ...edit, goals: [...edit.goals, { id: String(newId()), text: '', done: false }] })}><Plus size={14} />Add a goal</button>
              </div>
            </div>

            <div>
              <div className="muted" style={{ fontWeight: 800, marginBottom: 6 }}>Photos &amp; recordings</div>
              <div className="stack" style={{ gap: 8 }}>
                <MediaList items={edit.media} onRemove={(m) => setEdit((d) => d && { ...d, media: d.media.filter((x) => x.id !== m.id) })} />
                {edit.media.length < 12
                  ? <AttachBar owner={meM.id} warn={(t) => toast({ title: t, kind: 'warn' })} onAdd={(m) => setEdit((d) => d && (d.media.length >= 12 ? d : { ...d, media: [...d.media, m] }))} />
                  : <div className="muted small">That is the most attachments one entry can hold (12).</div>}
              </div>
            </div>

            <div>
              <div className="muted" style={{ fontWeight: 800, marginBottom: 6 }}>Who can read this</div>
              {isMinor(meM) && (
                <label className="row" style={{ gap: 8, alignItems: 'flex-start', flexWrap: 'nowrap', marginBottom: 8 }}>
                  <input type="checkbox" checked={forced || edit.shareParents} disabled={forced} onChange={(e) => setEdit({ ...edit, shareParents: e.target.checked })} />
                  <span>My parents can read this<br /><span className="muted small">{forced ? 'Your parents have turned on reading for your whole journal.' : 'Untick it to keep this entry private from your parents.'}</span></span>
                </label>
              )}
              {others.length > 0 && <div className="muted small" style={{ marginBottom: 4 }}>Also share with</div>}
              <div className="row" style={{ gap: 6 }}>
                {others.map((m: Member) => {
                  const on = edit.shareWith.includes(m.id)
                  return <button key={m.id} type="button" className={`tab ${on ? 'on' : ''}`} onClick={() => setEdit({ ...edit, shareWith: on ? edit.shareWith.filter((x) => x !== m.id) : [...edit.shareWith, m.id] })}>{m.name}</button>
                })}
              </div>
              <div className="muted small" style={{ marginTop: 6 }}>{(() => { const a = audience({ ...(edit as JournalEntry), shareParents: forced || edit.shareParents }, members); return `${a.icon} ${a.text === 'Only me' ? 'Only you can read this.' : 'Readable by: ' + a.text + '. They can read but not change it.'}` })()}</div>
            </div>

            <div className="row between">
              {edit.id ? <button className="btn ghost" onClick={() => remove(edit)}><Trash2 size={14} /> Delete</button> : <span />}
              <button className="btn primary" onClick={save}>Save</button>
            </div>
          </div>
        </Modal>
      )}

      {read && (
        <Modal title={`${mem(read.ownerMemberId)?.name ?? 'Someone'}'s entry`} onClose={() => setRead(null)}>
          <div className="stack">
            <div className="muted">{longDate(read.date)} • {read.kind === 'plan' ? '🎯 Plan' : '📓 Journal'}</div>
            {read.title && <h3>{read.title}</h3>}
            <div style={{ whiteSpace: 'pre-wrap' }}>{read.body}</div>
            {read.goals.length > 0 && <div className="stack" style={{ gap: 4 }}>{read.goals.map((g) => <div key={g.id}>{g.done ? '☑' : '☐'} {g.text}</div>)}</div>}
            <MediaList items={allMedia.filter((m) => m.entryId === read.id)} />
            <div className="muted small">Shared with you to read. Only {mem(read.ownerMemberId)?.name ?? 'the author'} can change it.</div>
          </div>
        </Modal>
      )}

      {printOpen && <PrintJournal entries={visible} media={allMedia} members={members} me={meM} onClose={() => setPrintOpen(false)} />}

      {lockOpen && (
        <Modal title="Journal lock" onClose={() => { setLockOpen(false); setPin('') }}>
          <div className="stack">
            <p className="muted" style={{ margin: 0 }}>{hasPin ? 'A PIN is set. It is asked for before this journal opens on this device.' : 'Optional: ask for a PIN before this journal opens on this device. Handy on a family tablet or a parent’s phone.'} It keeps casual snoopers out, but it is not encryption.</p>
            <div className="muted small">Your photos and recordings use {fmtSize(allMedia.filter((m) => m.ownerMemberId === meM.id).reduce((t, m) => t + m.size, 0))} of your family's free storage (about 1 GB in total).</div>
            <label className="f">{hasPin ? 'New PIN (4 to 8 digits)' : 'PIN (4 to 8 digits)'}<input type="password" inputMode="numeric" autoComplete="off" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))} /></label>
            <div className="row between">
              {hasPin ? <button className="btn ghost" onClick={() => { savePin(meM.id, null); setHasPin(false); setUnlocked(null); setLockOpen(false); setPin('') }}>Remove PIN</button> : <span />}
              <button className="btn primary" disabled={pin.length < 4} onClick={async () => { savePin(meM.id, await hashPin(pin, meM.id)); setHasPin(true); setUnlocked(meM.id); setUn(true); setLockOpen(false); setPin(''); toast({ title: 'Journal lock is on' }) }}>Save PIN</button>
            </div>
          </div>
        </Modal>
      )}
    </>
  )
}
