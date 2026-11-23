import { useEffect, useMemo, useState } from 'react'
import { Copy, Download, FileText, FolderHeart, GraduationCap, Plus, Search, Sparkles, Target, Trash2, Upload, ExternalLink, ShieldAlert } from 'lucide-react'
import { db, type DocKind, type Member, type VaultDoc } from '../db'
import { Empty, Modal, PageHead, Who } from '../components/ui'
import { useGoals, useMembers, useVault } from '../lib/useData'
import { fmtDate, todayStr } from '../lib/dates'
import { useApp } from '../ctx'

const KINDS: { id: DocKind; label: string; sensitive?: boolean }[] = [
  { id: 'homework', label: 'Homework' }, { id: 'grade', label: 'Grade / test' }, { id: 'report', label: 'Report card' },
  { id: 'school', label: 'School notice' }, { id: 'iep', label: 'IEP / 504 plan', sensitive: true }, { id: 'medical', label: 'Medical record', sensitive: true },
  { id: 'therapy', label: 'Therapy note', sensitive: true }, { id: 'note', label: 'My observation' }, { id: 'other', label: 'Other' },
]
const kindLabel = (k: DocKind) => KINDS.find((x) => x.id === k)?.label ?? k
const pct = (d: VaultDoc) => (d.score != null && d.scoreMax ? Math.round((d.score / d.scoreMax) * 100) : null)
const COLORS = ['#8d7bff', '#50e0bd', '#ff7fb2', '#ffca70', '#5db7ff', '#ff9a62']

function Thumb({ d }: { d: VaultDoc }) {
  const [u, setU] = useState<string>()
  useEffect(() => {
    if (!d.blob || !d.mime?.startsWith('image/')) return
    const x = URL.createObjectURL(d.blob); setU(x); return () => URL.revokeObjectURL(x)
  }, [d.blob, d.mime])
  return <div className="step-pic" style={{ width: 52, height: 52 }}>{u ? <img src={u} alt="" /> : <FileText size={26} />}</div>
}

export default function Vault() {
  const members = useMembers()
  const docs = useVault()
  const goals = useGoals()
  const people = members.filter((m) => m.role === 'child').length ? members.filter((m) => m.role === 'child') : members
  const [sid, setSid] = useState<number>()
  const stu = people.find((m) => m.id === sid) ?? people[0]
  const [tab, setTab] = useState<'overview' | 'docs' | 'pack'>('overview')
  const [add, setAdd] = useState<Partial<VaultDoc> & { files?: File[] } | null>(null)
  const [q, setQ] = useState('')
  const [kind, setKind] = useState<string>('all')
  const { toast } = useApp()
  if (!stu) return null

  const mine = docs.filter((d) => d.memberId === stu.id)
  const shown = mine.filter((d) => (kind === 'all' || d.kind === kind) && (!q || `${d.title} ${d.subject ?? ''} ${d.tags.join(' ')} ${d.context ?? ''}`.toLowerCase().includes(q.toLowerCase())))
  const graded = mine.filter((d) => pct(d) != null).sort((a, b) => a.date.localeCompare(b.date))
  const subjects = [...new Set(graded.map((d) => d.subject || 'General'))]
  const myGoals = goals.filter((g) => g.memberId === stu.id)

  async function saveDoc() {
    if (!add) return
    const files = add.files ?? []
    const base = { memberId: stu.id, kind: add.kind ?? 'homework', date: add.date ?? todayStr(), subject: add.subject?.trim() || undefined, tags: add.tags ?? [], context: add.context?.trim() || undefined, score: add.score, scoreMax: add.scoreMax }
    if (files.length === 0) {
      if (!add.title?.trim()) return toast({ title: 'Add a title or choose a file', kind: 'warn' })
      await db.vault.add({ ...base, title: add.title.trim() } as never)
    } else {
      for (const f of files) await db.vault.add({ ...base, title: files.length === 1 && add.title?.trim() ? add.title.trim() : f.name.replace(/\.[^.]+$/, ''), fileName: f.name, mime: f.type || 'application/octet-stream', size: f.size, blob: f } as never)
    }
    setAdd(null); toast({ title: 'Saved to the vault' })
  }
  const open = (d: VaultDoc) => { if (!d.blob) return; const u = URL.createObjectURL(d.blob); window.open(u, '_blank'); setTimeout(() => URL.revokeObjectURL(u), 60000) }
  const download = (d: VaultDoc) => { if (!d.blob) return; const a = document.createElement('a'); a.href = URL.createObjectURL(d.blob); a.download = d.fileName ?? d.title; a.click() }

  return (
    <>
      <PageHead title="Learning vault" sub="Homework, grades, plans and notes in one private place, organized so a teacher, doctor, therapist or future AI helper can use it.">
        <button className="btn primary" onClick={() => setAdd({ kind: 'homework', date: todayStr(), tags: [] })}><Upload size={16} />Add to vault</button>
      </PageHead>
      <div className="tabs">
        {people.map((m) => <button key={m.id} className={`tab ${m.id === stu.id ? 'on' : ''}`} onClick={() => setSid(m.id)}>{m.name}</button>)}
      </div>
      <div className="seg" style={{ marginBottom: 14 }}>
        {([['overview', 'Progress'], ['docs', `Files (${mine.length})`], ['pack', 'Share / AI pack']] as const).map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}
      </div>

      {tab === 'overview' && (
        <div className="grid g2">
          <div className="card" style={{ marginTop: 0 }}>
            <div className="row"><Who m={stu} size={42} /><h2>{stu.name}'s profile</h2></div>
            <div className="muted small" style={{ margin: '6px 0' }}>What should any helper know? Diagnoses, strengths, triggers, what works, communication style, supports at school. Saved in your family's private cloud space.</div>
            <textarea rows={7} defaultValue={stu.profile ?? ''} key={stu.id} placeholder="Example: Loves dinosaurs. Needs a visual schedule and a 2-minute warning before transitions. Reading is a strength; handwriting is hard…" onBlur={(e) => db.members.update(stu.id, { profile: e.target.value })} aria-label="Profile notes" />
            <div className="row between" style={{ marginTop: 14 }}><h3><Target size={16} style={{ verticalAlign: -2 }} /> Goals</h3><button className="btn sm" onClick={async () => { const t = prompt('New goal (e.g. "Read 20 minutes a night")'); if (t?.trim()) await db.goals.add({ memberId: stu.id, text: t.trim(), area: 'School', status: 'active', created: todayStr() } as never) }}><Plus size={14} />Goal</button></div>
            <div className="stack" style={{ marginTop: 8 }}>
              {myGoals.length === 0 && <div className="muted">No goals yet.</div>}
              {myGoals.map((g) => (
                <div className={`item ${g.status !== 'active' ? 'done' : ''}`} key={g.id}>
                  <div className="grow"><div className="title">{g.text}</div><div className="muted small">since {fmtDate(g.created)}</div></div>
                  <button className="btn sm" onClick={() => db.goals.update(g.id, { status: g.status === 'met' ? 'active' : 'met' })}>{g.status === 'met' ? 'Met ✓' : 'Mark met'}</button>
                  <button className="btn ghost sm" aria-label="Delete goal" onClick={() => db.goals.delete(g.id)}><Trash2 size={14} /></button>
                </div>
              ))}
            </div>
          </div>
          <div className="card" style={{ marginTop: 0 }}>
            <div className="row between"><h3><GraduationCap size={16} style={{ verticalAlign: -2 }} /> Grades over time</h3><button className="btn sm" onClick={() => setAdd({ kind: 'grade', date: todayStr(), tags: [], scoreMax: 100 })}><Plus size={14} />Add grade</button></div>
            {graded.length === 0 ? <Empty>Add grades or scores to see the trend. Scores can come with a photo of the paper.</Empty> : (
              <>
                <Chart docs={graded} subjects={subjects} />
                <div className="row" style={{ marginTop: 8 }}>{subjects.map((s, i) => <span key={s} className="chip"><span className="dot" style={{ background: COLORS[i % COLORS.length] }} />{s}</span>)}</div>
              </>
            )}
            <h3 style={{ marginTop: 16 }}>Recent</h3>
            <div className="stack" style={{ marginTop: 8 }}>
              {mine.slice(0, 5).map((d) => <div className="item" key={d.id}><Thumb d={d} /><div className="grow"><div className="title">{d.title}</div><div className="muted">{kindLabel(d.kind)} • {fmtDate(d.date)}{d.subject ? ` • ${d.subject}` : ''}</div></div>{pct(d) != null && <span className="chip good">{pct(d)}%</span>}</div>)}
              {mine.length === 0 && <div className="muted">Nothing saved yet.</div>}
            </div>
          </div>
        </div>
      )}

      {tab === 'docs' && (
        <div className="card">
          <div className="row">
            <Search size={16} /><input style={{ flex: 1 }} placeholder="Search title, subject, tag, notes…" value={q} onChange={(e) => setQ(e.target.value)} />
            <select value={kind} onChange={(e) => setKind(e.target.value)}><option value="all">All types</option>{KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}</select>
          </div>
          <div className="stack" style={{ marginTop: 12 }}>
            {shown.length === 0 && <Empty><FolderHeart size={30} /><div>No files match. Add PDFs, photos of homework, report cards or notes.</div></Empty>}
            {shown.map((d) => (
              <div className="item" key={d.id}>
                <Thumb d={d} />
                <div className="grow">
                  <div className="title">{d.title} {KINDS.find((k) => k.id === d.kind)?.sensitive && <ShieldAlert size={14} color="var(--amber)" style={{ verticalAlign: -2 }} aria-label="Sensitive" />}</div>
                  <div className="muted">{kindLabel(d.kind)} • {fmtDate(d.date)}{d.subject ? ` • ${d.subject}` : ''}{d.size ? ` • ${(d.size / 1024).toFixed(0)} KB` : ''}</div>
                  {d.context && <div className="small" style={{ marginTop: 2 }}>{d.context}</div>}
                  {d.tags.length > 0 && <div className="row" style={{ marginTop: 4 }}>{d.tags.map((t) => <span className="chip" key={t}>#{t}</span>)}</div>}
                </div>
                {pct(d) != null && <span className="chip good">{d.score}/{d.scoreMax} • {pct(d)}%</span>}
                {d.blob && <><button className="btn sm" onClick={() => open(d)} aria-label="Open"><ExternalLink size={14} /></button><button className="btn sm" onClick={() => download(d)} aria-label="Download"><Download size={14} /></button></>}
                <button className="btn ghost sm" aria-label="Delete" onClick={() => confirm(`Delete "${d.title}"? This cannot be undone.`) && db.vault.delete(d.id)}><Trash2 size={14} /></button>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'pack' && <Pack stu={stu} />}

      {add && (
        <Modal title={add.kind === 'grade' && !add.files?.length ? 'Add a grade' : 'Add to vault'} onClose={() => setAdd(null)}>
          <div className="stack">
            <label className="f">Files (PDF, photos, scans) <input type="file" multiple accept="application/pdf,image/*,.doc,.docx,.txt" onChange={(e) => setAdd({ ...add, files: [...(e.target.files ?? [])] })} /></label>
            <label className="f">Title<input value={add.title ?? ''} onChange={(e) => setAdd({ ...add, title: e.target.value })} placeholder="Spelling test unit 4" /></label>
            <div className="row">
              <label className="f">Type<select value={add.kind} onChange={(e) => setAdd({ ...add, kind: e.target.value as DocKind })}>{KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}</select></label>
              <label className="f">Date<input type="date" value={add.date} onChange={(e) => setAdd({ ...add, date: e.target.value })} /></label>
              <label className="f">Subject<input value={add.subject ?? ''} onChange={(e) => setAdd({ ...add, subject: e.target.value })} placeholder="Math" list="subjects" /></label>
              <datalist id="subjects">{['Math', 'Reading', 'Writing', 'Science', 'Social Studies', 'Spelling', 'Speech', 'OT', 'Behavior'].map((s) => <option key={s} />)}</datalist>
            </div>
            <div className="row">
              <label className="f">Score<input type="number" value={add.score ?? ''} onChange={(e) => setAdd({ ...add, score: e.target.value === '' ? undefined : Number(e.target.value) })} /></label>
              <label className="f">Out of<input type="number" value={add.scoreMax ?? ''} onChange={(e) => setAdd({ ...add, scoreMax: e.target.value === '' ? undefined : Number(e.target.value) })} /></label>
            </div>
            <label className="f">Context: what is this, and what should a helper know?<textarea rows={3} value={add.context ?? ''} onChange={(e) => setAdd({ ...add, context: e.target.value })} placeholder="Struggled with word problems; did well once we used drawings. Teacher says focus improved after lunch." /></label>
            <label className="f">Tags (comma separated)<input value={(add.tags ?? []).join(', ')} onChange={(e) => setAdd({ ...add, tags: e.target.value.split(',').map((t) => t.trim()).filter(Boolean) })} placeholder="fractions, focus" /></label>
            <button className="btn primary" onClick={saveDoc}>Save</button>
          </div>
        </Modal>
      )}
    </>
  )
}

function Chart({ docs, subjects }: { docs: VaultDoc[]; subjects: string[] }) {
  const W = 420, H = 190, P = 28
  const dates = [...new Set(docs.map((d) => d.date))].sort()
  const x = (d: string) => P + (dates.length === 1 ? (W - 2 * P) / 2 : (dates.indexOf(d) / (dates.length - 1)) * (W - 2 * P))
  const y = (p: number) => H - P - (p / 100) * (H - 2 * P)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', marginTop: 10 }} role="img" aria-label="Grades over time">
      {[0, 25, 50, 75, 100].map((g) => <g key={g}><line x1={P} x2={W - P} y1={y(g)} y2={y(g)} stroke="var(--border)" strokeDasharray="3 4" /><text x={4} y={y(g) + 4} fontSize="10" fill="var(--muted)">{g}</text></g>)}
      {subjects.map((s, i) => {
        const pts = docs.filter((d) => (d.subject || 'General') === s).map((d) => [x(d.date), y(pct(d)!)] as const)
        return <g key={s}><polyline fill="none" stroke={COLORS[i % COLORS.length]} strokeWidth="3" strokeLinejoin="round" points={pts.map((p) => p.join(',')).join(' ')} />{pts.map((p, j) => <circle key={j} cx={p[0]} cy={p[1]} r="4.5" fill={COLORS[i % COLORS.length]} />)}</g>
      })}
      <text x={P} y={H - 6} fontSize="10" fill="var(--muted)">{fmtDate(dates[0], { month: 'short', day: 'numeric' })}</text>
      <text x={W - P} y={H - 6} fontSize="10" fill="var(--muted)" textAnchor="end">{fmtDate(dates[dates.length - 1], { month: 'short', day: 'numeric' })}</text>
    </svg>
  )
}

/* ---------- context pack: a clean summary any person or AI can read ---------- */
function Pack({ stu }: { stu: Member }) {
  const stuId = stu.id
  const { toast } = useApp()
  const docs = useVault()
  const goals = useGoals()
  const [aud, setAud] = useState<'teacher' | 'doctor' | 'therapist' | 'ai'>('teacher')
  const [sens, setSens] = useState(false)
  const [months, setMonths] = useState(6)
  const text = useMemo(() => {
    const since = new Date(); since.setMonth(since.getMonth() - months)
    const from = since.toISOString().slice(0, 10)
    const d = docs.filter((x) => x.memberId === stuId && x.date >= from && (sens || !KINDS.find((k) => k.id === x.kind)?.sensitive))
    const L: string[] = []
    const intro = { teacher: 'Summary for the teacher', doctor: 'Summary for the doctor', therapist: 'Summary for the therapist', ai: 'Context for an AI assistant (privacy: use only to help this family; do not retain or share)' }[aud]
    L.push(`# ${intro}: ${stu.name}${stu.age ? ` (age ${stu.age})` : ''}`, `Generated ${todayStr()} • covers the last ${months} months`, '')
    L.push('## About', stu.profile?.trim() || '_No profile notes yet._', '')
    const g = goals.filter((x) => x.memberId === stuId)
    L.push('## Goals', ...(g.length ? g.map((x) => `- [${x.status === 'met' ? 'x' : ' '}] ${x.text} (since ${x.created})`) : ['_None recorded._']), '')
    const gr = d.filter((x) => pct(x) != null).sort((a, b) => a.date.localeCompare(b.date))
    L.push('## Grades & scores', ...(gr.length ? gr.map((x) => `- ${x.date} • ${x.subject || 'General'} • ${x.title}: ${x.score}/${x.scoreMax} (${pct(x)}%)${x.context ? ` — ${x.context}` : ''}`) : ['_None recorded._']), '')
    L.push('## Documents & observations', ...(d.length ? d.sort((a, b) => b.date.localeCompare(a.date)).map((x) => `- ${x.date} • ${kindLabel(x.kind)}${x.subject ? ` • ${x.subject}` : ''} • ${x.title}${x.fileName ? ` [file: ${x.fileName}]` : ''}${x.tags.length ? ` #${x.tags.join(' #')}` : ''}${x.context ? `\n  Context: ${x.context}` : ''}`) : ['_None._']))
    return L.join('\n')
  }, [docs, goals, stu, stuId, aud, sens, months])
  return (
    <>
    <div className="print-root print-only"><pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'system-ui, sans-serif', fontSize: 13 }}>{text}</pre></div>
    <div className="card">
      <div className="row"><Sparkles size={18} color="var(--primary)" /><h3>Context pack for {stu.name}</h3></div>
      <p className="muted">One readable summary you can hand to a teacher or doctor, or paste into an AI assistant so it understands the full picture. Nothing leaves your device unless you copy or download it.</p>
      <div className="row">
        <label className="f">Who is it for?<select value={aud} onChange={(e) => setAud(e.target.value as typeof aud)}><option value="teacher">Teacher</option><option value="doctor">Doctor</option><option value="therapist">Therapist</option><option value="ai">AI assistant</option></select></label>
        <label className="f">Time span<select value={months} onChange={(e) => setMonths(Number(e.target.value))}>{[1, 3, 6, 12, 36].map((m) => <option key={m} value={m}>{m} months</option>)}</select></label>
        <label className="row" style={{ flex: '1 1 220px' }}><input type="checkbox" checked={sens} onChange={(e) => setSens(e.target.checked)} /><span className="muted">Include sensitive items (medical, IEP/504, therapy)</span></label>
      </div>
      <textarea readOnly rows={14} value={text} style={{ marginTop: 12, fontFamily: 'ui-monospace, monospace', fontSize: 12.5 }} aria-label="Context pack text" />
      <div className="row" style={{ marginTop: 10 }}>
        <button className="btn primary" onClick={async () => { await navigator.clipboard.writeText(text); toast({ title: 'Copied', body: 'Paste it into an email or AI chat.' }) }}><Copy size={15} />Copy</button>
        <button className="btn" onClick={() => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'text/markdown' })); a.download = `${stu.name}-context-${todayStr()}.md`; a.click() }}><Download size={15} />Download .md</button>
        <button className="btn" onClick={() => window.print()}>Print</button>
      </div>
    </div>
    </>
  )
}
