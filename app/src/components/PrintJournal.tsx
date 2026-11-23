import { useMemo, useState } from 'react'
import { FileDown } from 'lucide-react'
import type { JournalEntry, JournalMedia, Member } from '../db'
import { Modal } from './ui'
import { buildPdf } from '../lib/pdf'
import { prepareEntries } from '../lib/pdfPrep'
import { savePdf } from '../lib/files'
import { addDays, todayStr, ymd } from '../lib/dates'

type Preset = 'month' | 'last' | '30' | 'year' | 'all' | 'custom'
const nice = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })

export default function PrintJournal({ entries, media, members, me, onClose }: { entries: JournalEntry[]; media: JournalMedia[]; members: Member[]; me: Member; onClose: () => void }) {
  const today = todayStr()
  const first = entries.reduce((m, e) => (e.date < m ? e.date : m), today)
  const last = entries.reduce((m, e) => (e.date > m ? e.date : m), today)
  const now = new Date()
  const range = (p: Preset): [string, string] => {
    if (p === 'month') return [ymd(new Date(now.getFullYear(), now.getMonth(), 1)), ymd(new Date(now.getFullYear(), now.getMonth() + 1, 0))]
    if (p === 'last') return [ymd(new Date(now.getFullYear(), now.getMonth() - 1, 1)), ymd(new Date(now.getFullYear(), now.getMonth(), 0))]
    if (p === '30') return [addDays(today, -29), today]
    if (p === 'year') return [`${now.getFullYear()}-01-01`, `${now.getFullYear()}-12-31`]
    return [first, last]
  }
  const [preset, setPreset] = useState<Preset>('30')
  const [[from, to], setSpan] = useState<[string, string]>(range('30'))
  const [others, setOthers] = useState(false)
  const [photos, setPhotos] = useState(true)
  const [goals, setGoals] = useState(true)
  const [title, setTitle] = useState(`${me.name}'s journal`)
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')

  const pick = (p: Preset) => { setPreset(p); if (p !== 'custom') setSpan(range(p)) }
  const chosen = useMemo(() => entries
    .filter((e) => e.date >= from && e.date <= to && (others || e.ownerMemberId === me.id))
    .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt), [entries, from, to, others, me.id])
  const attach = media.filter((m) => chosen.some((e) => e.id === m.entryId))
  const nPhotos = attach.filter((m) => m.kind === 'image').length
  const nOther = attach.length - nPhotos
  const nOthers = entries.filter((e) => e.ownerMemberId !== me.id).length

  async function make() {
    setBusy('Preparing…'); setErr(''); setMsg('')
    try {
      const pe = await prepareEntries(chosen, media, members, me, photos, (d, t) => setBusy(`Preparing photos ${d} of ${t}…`))
      setBusy('Laying out pages…')
      const res = await buildPdf({ title: title.trim() || 'Journal', subtitle: from === to ? nice(from) : `${nice(from)} - ${nice(to)}`, byLine: `Printed ${nice(today)} by ${me.name}`, entries: pe, includeGoals: goals })
      const name = `BindingTies-journal-${from}-to-${to}.pdf`
      const how = await savePdf(res.bytes, name)
      setMsg(`${how === 'saved' ? 'Saved' : 'Ready to save or send'}: ${res.pages - 1} page${res.pages - 1 === 1 ? '' : 's'}, ${(res.bytes.length / 1048576).toFixed(1)} MB.${res.unsupportedChars ? ` ${res.unsupportedChars} emoji or non-Latin characters could not be printed.` : ''}`)
    } catch (e) { setErr((e as Error).message || 'Could not create the PDF.') } finally { setBusy('') }
  }

  return (
    <Modal title="Print or save as PDF" onClose={onClose}>
      <div className="stack">
        <div>
          <div className="muted" style={{ fontWeight: 800, marginBottom: 6 }}>Which days</div>
          <div className="row" style={{ gap: 6 }}>
            {([['month', 'This month'], ['last', 'Last month'], ['30', 'Last 30 days'], ['year', 'This year'], ['all', 'Everything']] as [Preset, string][]).map(([k, l]) => <button key={k} type="button" className={`tab ${preset === k ? 'on' : ''}`} onClick={() => pick(k)}>{l}</button>)}
          </div>
          <div className="row" style={{ marginTop: 8 }}>
            <label className="f">From<input type="date" value={from} onChange={(e) => { setPreset('custom'); setSpan([e.target.value, to]) }} /></label>
            <label className="f">To<input type="date" value={to} onChange={(e) => { setPreset('custom'); setSpan([from, e.target.value]) }} /></label>
          </div>
        </div>
        <label className="f">Title on the cover<input value={title} onChange={(e) => setTitle(e.target.value)} /></label>
        <div className="stack" style={{ gap: 6 }}>
          <label className="row" style={{ gap: 8, flexWrap: 'nowrap' }}><input type="checkbox" checked={photos} onChange={(e) => setPhotos(e.target.checked)} /> Include photos</label>
          <label className="row" style={{ gap: 8, flexWrap: 'nowrap' }}><input type="checkbox" checked={goals} onChange={(e) => setGoals(e.target.checked)} /> Include goals and checkmarks</label>
          {nOthers > 0 && <label className="row" style={{ gap: 8, flexWrap: 'nowrap' }}><input type="checkbox" checked={others} onChange={(e) => setOthers(e.target.checked)} /> Also include entries other people shared with me ({nOthers})</label>}
        </div>
        <div className="muted">
          <b>{chosen.length}</b> {chosen.length === 1 ? 'entry' : 'entries'}{photos ? `, ${nPhotos} photo${nPhotos === 1 ? '' : 's'}` : ''}{nOther ? `, ${nOther} audio or video (shown as a note: they stay in the app)` : ''}.
          <div className="small">Only entries you are allowed to read are included.</div>
        </div>
        {err && <div className="err" role="alert">{err}</div>}
        {msg && <div role="status"><b>{msg}</b></div>}
        <button className="btn primary" disabled={!!busy || !chosen.length} onClick={make}><FileDown size={16} />{busy || 'Create PDF'}</button>
      </div>
    </Modal>
  )
}
