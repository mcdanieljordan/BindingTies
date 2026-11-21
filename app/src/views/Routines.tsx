import { useState } from 'react'
import { ArrowDown, ArrowUp, Check, Eye, ImagePlus, ListChecks, Plus, Printer, RotateCcw, Trash2, X, Play } from 'lucide-react'
import { db, type Routine, type Step } from '../db'
import { Ico, ICONS, ICON_CATS, getIcon } from '../lib/icons'
import { useMembers, useRoutines, useRuns } from '../lib/useData'
import { PageHead, Empty, Ring } from '../components/ui'
import { DOW, todayStr } from '../lib/dates'
import { award, celebrate, pointScale, revoke, uid, fmtMs } from '../lib/engine'
import { TEMPLATES } from '../lib/seed'
import { usePhoto, shrinkImage } from '../lib/usePhoto'
import { useApp } from '../ctx'
import { useEffect } from 'react'

function Pic({ s, size, print }: { s: Step; size: number; print?: boolean }) {
  const url = usePhoto(s.photoId)
  return url ? <img src={url} alt="" style={{ width: size, height: size, objectFit: 'cover', borderRadius: print ? 12 : 16, border: print ? '2px solid #000' : undefined }} /> : <Ico k={s.icon} size={size * 0.7} stroke={print ? 2.5 : 2} />
}

export default function Routines() {
  const routines = useRoutines()
  const members = useMembers()
  const today = todayStr()
  const runs = useRuns(today)
  const [selId, setSelId] = useState<number>()
  const [mode, setMode] = useState<'list' | 'focus' | 'edit' | 'print'>('list')
  const [tpl, setTpl] = useState(false)
  const r = routines.find((x) => x.id === selId) ?? routines[0]
  const mem = (id?: number) => members.find((m) => m.id === id)

  async function create(t?: (typeof TEMPLATES)[number]) {
    const id = await db.routines.add({ name: t?.name ?? 'New routine', block: t?.block ?? 'morning', memberId: members.find((m) => m.role === 'child')?.id, days: [0, 1, 2, 3, 4, 5, 6], steps: (t?.steps ?? []).map((s) => ({ ...s, id: uid() })) } as never)
    setSelId(id as number); setTpl(false); setMode(t ? 'list' : 'edit')
  }

  return (
    <>
      <PageHead title="Picture routines" sub="Pictures, order, one tap. Print it for the fridge.">
        <button className="btn" onClick={() => setTpl(true)}><Plus size={16} />Start from template</button>
        <button className="btn primary" onClick={() => create()}><Plus size={16} />Blank routine</button>
      </PageHead>

      {tpl && (
        <div className="card no-print">
          <div className="row between"><h3>Pick a starting point</h3><button className="btn ghost sm" onClick={() => setTpl(false)}><X size={16} /></button></div>
          <div className="grid g3" style={{ marginTop: 10 }}>
            {TEMPLATES.map((t) => (
              <button key={t.name} className="item" style={{ textAlign: 'left' }} onClick={() => create(t)}>
                <div className="grow"><div className="title">{t.name}</div><div className="muted">Ages {t.ages} • {t.steps.length} steps</div></div>
              </button>
            ))}
          </div>
        </div>
      )}

      {routines.length === 0 && !tpl && <div className="card"><Empty>No routines yet. Start from a template to get a running start.</Empty></div>}

      {r && (
        <>
          <div className="tabs no-print">
            {routines.map((x) => <button key={x.id} className={`tab ${x.id === r.id ? 'on' : ''}`} onClick={() => { setSelId(x.id); setMode('list') }}>{x.name}</button>)}
          </div>
          <div className="row no-print" style={{ marginBottom: 12 }}>
            <div className="seg" role="tablist">
              {([['list', 'Checklist', ListChecks], ['focus', 'Kid focus', Play], ['edit', 'Edit', Eye], ['print', 'Print', Printer]] as const).map(([k, l, I]) => (
                <button key={k} className={mode === k ? 'on' : ''} onClick={() => setMode(k)}><I size={14} style={{ verticalAlign: -2 }} /> {l}</button>
              ))}
            </div>
            <span className="muted">{mem(r.memberId)?.name ?? 'Everyone'} • {r.days.length === 7 ? 'daily' : r.days.map((d) => DOW[d]).join(' ')}</span>
          </div>
          {(mode === 'list' || mode === 'focus') && <Runner r={r} run={runs.find((x) => x.routineId === r.id)} focus={mode === 'focus'} />}
          {mode === 'edit' && <Editor r={r} onDeleted={() => { setSelId(undefined); setMode('list') }} />}
          {mode === 'print' && <PrintStudio r={r} childName={mem(r.memberId)?.name} />}
        </>
      )}
    </>
  )
}

/* ---------- running a routine ---------- */
function Runner({ r, run, focus }: { r: Routine; run?: { id: number; doneStepIds: string[]; completed: boolean }; focus: boolean }) {
  const { toast } = useApp()
  const done = run?.doneStepIds ?? []
  const who = r.memberId ?? 0
  const pct = r.steps.length ? done.length / r.steps.length : 0

  async function toggle(s: Step) {
    let runId = run?.id
    if (!runId) runId = (await db.runs.add({ routineId: r.id, date: todayStr(), doneStepIds: [], completed: false } as never)) as number
    const cur = run?.doneStepIds ?? []
    if (cur.includes(s.id)) {
      const next = cur.filter((x) => x !== s.id)
      await db.runs.update(runId, { doneStepIds: next, completed: false })
      await revoke(`step:${runId}:${s.id}`); await revoke(`bonus:${runId}`)
      return
    }
    const next = [...cur, s.id]
    const complete = next.length === r.steps.length
    await db.runs.update(runId, { doneStepIds: next, completed: complete })
    const k = pointScale()
    if (who) await award(who, Math.max(1, Math.round(3 * k)), `${r.name}: ${s.title}`, `step:${runId}:${s.id}`)
    if (complete) {
      if (who) await award(who, Math.round(10 * k), `${r.name} complete!`, `bonus:${runId}`)
      toast({ title: `${r.name} done! 🎉`, body: 'Nice teamwork. Points added to the Family Quest.' })
      void celebrate(true)
    } else void celebrate(false)
  }
  async function reset() {
    if (!run) return
    await db.ledger.filter((e) => !!e.ref && (e.ref.startsWith(`step:${run.id}:`) || e.ref === `bonus:${run.id}`)).delete()
    await db.runs.delete(run.id)
  }

  if (r.steps.length === 0) return <div className="card"><Empty>No steps yet. Open Edit to add some pictures.</Empty></div>
  if (focus) return <Focus r={r} done={done} onDone={toggle} pct={pct} />
  return (
    <div className="card">
      <div className="row between" style={{ marginBottom: 12 }}>
        <div className="row"><Ring pct={pct} size={64} stroke={8}>{done.length}/{r.steps.length}</Ring><div><h2>{r.name}</h2><div className="muted">{run?.completed ? 'All done today. Great job!' : 'Tap each step when finished.'}</div></div></div>
        <button className="btn sm" onClick={reset}><RotateCcw size={14} />Reset today</button>
      </div>
      <div className="stack">
        {r.steps.map((s, i) => {
          const d = done.includes(s.id)
          return (
            <button key={s.id} className={`step-card ${d ? 'done' : ''}`} onClick={() => toggle(s)} aria-pressed={d} style={{ textAlign: 'left' }}>
              <span className="step-num">{i + 1}</span>
              <span className="step-pic"><Pic s={s} size={40} /></span>
              <span style={{ flex: 1 }}><b style={{ fontSize: 19 }}>{s.title}</b>{s.mins ? <div className="muted">{s.mins} min</div> : null}</span>
              <span style={{ width: 34, height: 34, borderRadius: 10, border: '3px solid var(--border)', display: 'grid', placeItems: 'center', background: d ? 'var(--mint)' : 'none', borderColor: d ? 'var(--mint)' : undefined }}>{d && <Check size={22} color="#052" strokeWidth={3.5} />}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function Focus({ r, done, onDone, pct }: { r: Routine; done: string[]; onDone: (s: Step) => void; pct: number }) {
  const idx = r.steps.findIndex((s) => !done.includes(s.id))
  const s = r.steps[idx]
  const [left, setLeft] = useState<number | null>(null)
  const [endAt, setEndAt] = useState(0)
  const url = usePhoto(s?.photoId)
  useEffect(() => { setLeft(null) }, [s?.id])
  useEffect(() => {
    if (!endAt) return
    const t = setInterval(() => { const l = endAt - Date.now(); setLeft(Math.max(0, l)); if (l <= 0) clearInterval(t) }, 250)
    return () => clearInterval(t)
  }, [endAt])
  if (!s) return (
    <div className="card focus"><h2>All done! 🌟</h2><div className="muted">Every step is finished. Fantastic work.</div><Ring pct={1} size={140}>100%</Ring></div>
  )
  const total = (s.mins ?? 0) * 60000
  return (
    <div className="card focus">
      <div className="dots-row">{r.steps.map((x, i) => <i key={x.id} className={done.includes(x.id) ? 'on' : i === idx ? 'cur' : ''} />)}</div>
      <div className="muted">Step {idx + 1} of {r.steps.length}</div>
      <div className="pic">{url ? <img src={url} alt="" /> : <Ico k={s.icon} size={150} stroke={1.8} />}</div>
      <h2>{s.title}</h2>
      {total > 0 && (left === null
        ? <button className="btn" onClick={() => setEndAt(Date.now() + total)}>Start {s.mins}-minute timer</button>
        : <Ring pct={left / total} size={110} stroke={10} color="var(--primary)">{fmtMs(left)}</Ring>)}
      <button className="btn mint big" onClick={() => onDone(s)}><Check size={26} strokeWidth={3.5} />All done!</button>
      <div className="muted small">{pct > 0 ? `${Math.round(pct * 100)}% complete` : ''}</div>
    </div>
  )
}

/* ---------- editing ---------- */
function Editor({ r, onDeleted }: { r: Routine; onDeleted: () => void }) {
  const members = useMembers()
  const [cat, setCat] = useState('morning')
  const [q, setQ] = useState('')
  const [icon, setIcon] = useState('teeth')
  const [title, setTitle] = useState('')
  const [mins, setMins] = useState('')
  const [photoId, setPhotoId] = useState<number>()
  const list = ICONS.filter((i) => (q ? (i.label + i.key).toLowerCase().includes(q.toLowerCase()) : i.cat === cat))
  const save = (p: Partial<Routine>) => db.routines.update(r.id, p)
  const move = (i: number, d: number) => { const s = [...r.steps]; const j = i + d; if (j < 0 || j >= s.length) return; [s[i], s[j]] = [s[j], s[i]]; void save({ steps: s }) }

  async function add() {
    const label = title.trim() || getIcon(icon).label
    await save({ steps: [...r.steps, { id: uid(), title: label, icon, mins: mins ? Number(mins) : undefined, photoId }] })
    setTitle(''); setMins(''); setPhotoId(undefined)
  }
  async function pickPhoto(f?: File) {
    if (!f) return
    const blob = await shrinkImage(f)
    setPhotoId((await db.photos.add({ blob } as never)) as number)
  }
  return (
    <div className="grid g2 no-print">
      <div className="card" style={{ marginTop: 0 }}>
        <h3>Routine settings</h3>
        <div className="stack" style={{ marginTop: 10 }}>
          <label className="f">Name<input value={r.name} onChange={(e) => save({ name: e.target.value })} /></label>
          <div className="row">
            <label className="f">For<select value={r.memberId ?? ''} onChange={(e) => save({ memberId: e.target.value ? Number(e.target.value) : undefined })}><option value="">Everyone</option>{members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label>
            <label className="f">Part of day<select value={r.block} onChange={(e) => save({ block: e.target.value as Routine['block'] })}><option value="morning">Morning</option><option value="after_school">After school</option><option value="bedtime">Bedtime</option><option value="custom">Custom</option></select></label>
          </div>
          <div className="row">{DOW.map((d, i) => <button key={d} className={`tab ${r.days.includes(i) ? 'on' : ''}`} onClick={() => save({ days: r.days.includes(i) ? r.days.filter((x) => x !== i) : [...r.days, i].sort() })}>{d}</button>)}</div>
        </div>
        <h3 style={{ marginTop: 18 }}>Steps in order</h3>
        <div className="stack" style={{ marginTop: 10 }}>
          {r.steps.length === 0 && <Empty>Add your first step on the right.</Empty>}
          {r.steps.map((s, i) => (
            <div className="item" key={s.id}>
              <span className="step-num">{i + 1}</span><span className="step-pic" style={{ width: 44, height: 44 }}><Pic s={s} size={30} /></span>
              <div className="grow"><input value={s.title} style={{ width: '100%' }} onChange={(e) => save({ steps: r.steps.map((x) => x.id === s.id ? { ...x, title: e.target.value } : x) })} aria-label="Step name" /></div>
              <input type="number" min={0} max={90} placeholder="min" style={{ width: 62 }} value={s.mins ?? ''} onChange={(e) => save({ steps: r.steps.map((x) => x.id === s.id ? { ...x, mins: e.target.value ? Number(e.target.value) : undefined } : x) })} aria-label="Minutes" />
              <button className="btn ghost sm" onClick={() => move(i, -1)} aria-label="Move up"><ArrowUp size={15} /></button>
              <button className="btn ghost sm" onClick={() => move(i, 1)} aria-label="Move down"><ArrowDown size={15} /></button>
              <button className="btn ghost sm danger" onClick={() => save({ steps: r.steps.filter((x) => x.id !== s.id) })} aria-label="Remove step"><Trash2 size={15} /></button>
            </div>
          ))}
        </div>
        <button className="btn danger sm" style={{ marginTop: 16 }} onClick={async () => { if (confirm(`Delete routine "${r.name}"?`)) { await db.routines.delete(r.id); onDeleted() } }}><Trash2 size={14} />Delete routine</button>
      </div>

      <div className="card" style={{ marginTop: 0 }}>
        <h3>Add a step</h3>
        <div className="row" style={{ margin: '10px 0' }}>
          <input style={{ flex: 1 }} placeholder="Search pictures (tooth, dog, bed…)" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {!q && <div className="row" style={{ marginBottom: 8 }}>{Object.entries(ICON_CATS).map(([k, l]) => <button key={k} className={`tab ${cat === k ? 'on' : ''}`} onClick={() => setCat(k)}>{l}</button>)}</div>}
        <div className="icon-grid">
          {list.map((i) => <button key={i.key} className={`icon-tile ${icon === i.key ? 'on' : ''}`} onClick={() => { setIcon(i.key); if (!title) setTitle(i.label) }}><i.I size={30} />{i.label}</button>)}
        </div>
        <div className="row" style={{ marginTop: 12 }}>
          <label className="f">Words<input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={getIcon(icon).label} /></label>
          <label className="f" style={{ flex: '0 0 90px' }}>Minutes<input type="number" min={0} max={90} value={mins} onChange={(e) => setMins(e.target.value)} /></label>
        </div>
        <div className="row" style={{ marginTop: 10 }}>
          <label className="btn sm"><ImagePlus size={15} />{photoId ? 'Photo added ✓' : 'Use own photo'}<input type="file" accept="image/*" hidden onChange={(e) => pickPhoto(e.target.files?.[0])} /></label>
          <span className="sp" /><button className="btn primary" onClick={add}><Plus size={16} />Add step</button>
        </div>
      </div>
    </div>
  )
}

/* ---------- print studio ---------- */
function PrintStudio({ r, childName }: { r: Routine; childName?: string }) {
  const [layout, setLayout] = useState<'list' | 'grid'>('list')
  const [cols, setCols] = useState(2)
  const [size, setSize] = useState(72)
  const [boxes, setBoxes] = useState(true)
  const [nums, setNums] = useState(true)
  return (
    <>
      <div className="card no-print">
        <div className="row">
          <div className="seg"><button className={layout === 'list' ? 'on' : ''} onClick={() => setLayout('list')}>Rows</button><button className={layout === 'grid' ? 'on' : ''} onClick={() => setLayout('grid')}>Cards</button></div>
          {layout === 'grid' && <label className="row muted">Columns<select value={cols} onChange={(e) => setCols(Number(e.target.value))}>{[2, 3, 4].map((n) => <option key={n}>{n}</option>)}</select></label>}
          <label className="row muted">Picture size<input type="range" min={44} max={140} value={size} onChange={(e) => setSize(Number(e.target.value))} /></label>
          <label className="row muted"><input type="checkbox" checked={nums} onChange={(e) => setNums(e.target.checked)} />Numbers</label>
          <label className="row muted"><input type="checkbox" checked={boxes} onChange={(e) => setBoxes(e.target.checked)} />Check boxes</label>
          <span className="sp" />
          <button className="btn primary" onClick={() => window.print()}><Printer size={16} />Print</button>
        </div>
        <div className="muted small" style={{ marginTop: 8 }}>Prints black and white on Letter or A4. In the print dialog, turn off "headers and footers" for the cleanest page.</div>
      </div>
      <div className="print-root">
        <div className="pr-sheet">
          <div className="pr-head"><h1>{r.name}</h1><div style={{ fontSize: 22, fontWeight: 700 }}>{childName ?? ''}</div></div>
          <div className={layout === 'grid' ? 'pr-grid' : 'pr-list'} style={{ ['--cols' as string]: cols }}>
            {r.steps.map((s, i) => (
              <div className="pr-step" key={s.id}>
                {nums && <div className="pr-num">{i + 1}</div>}
                <div className="pr-pic" style={{ width: size, height: size }}><Pic s={s} size={size} print /></div>
                <div className="pr-label">{s.title}{s.mins ? <span style={{ fontSize: 16, fontWeight: 500 }}> ({s.mins} min)</span> : null}</div>
                {boxes && <div className="pr-box" />}
              </div>
            ))}
          </div>
          <div className="pr-foot">FamilyOS • {r.steps.length} steps • I did it! ⭐</div>
        </div>
      </div>
    </>
  )
}
