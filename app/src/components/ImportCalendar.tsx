import { useEffect, useState } from 'react'
import { FileUp, Link2, RefreshCw, Trash2 } from 'lucide-react'
import { Modal } from './ui'
import { useMembers } from '../lib/useData'
import { parseIcs, type IcsResult } from '../lib/ics'
import { fmtDate, fmtTime } from '../lib/dates'
import { getFeeds, loadFeed, normalizeUrl, refreshFeeds, saveEvents, subscribe, unsubscribe, type Feed } from '../lib/feeds'

type Mode = 'file' | 'link'
interface Preview { res: IcsResult; source: string; name: string }

export default function ImportCalendar({ onClose, onDone, initialText, initialName }: { onClose: () => void; onDone: (firstDate?: string) => void; initialText?: string; initialName?: string }) {
  const members = useMembers()
  const [mode, setMode] = useState<Mode>('file')
  const [link, setLink] = useState('')
  const [prev, setPrev] = useState<Preview | null>(null)
  const [skip, setSkip] = useState<Set<string>>(new Set())
  const [who, setWho] = useState<number[]>([])
  const [feeds, setFeeds] = useState<Feed[]>([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [msg, setMsg] = useState('')

  const loadFeeds = () => getFeeds().then(setFeeds)
  useEffect(() => { void loadFeeds() }, [])

  useEffect(() => { if (initialText) void readText(initialText, initialName ?? 'Calendar file') }, [initialText]) // eslint-disable-line react-hooks/exhaustive-deps

  async function onFile(f?: File) {
    if (f) await readText(await f.text(), f.name)
  }
  async function readText(text: string, name: string) {
    setErr(''); setMsg('')
    try {
      if (!/BEGIN:VCALENDAR/i.test(text)) throw new Error('That file is not a calendar (.ics) file.')
      const res = parseIcs(text)
      if (!res.events.length) throw new Error(res.skippedPast ? `Everything in that file is in the past (${res.skippedPast} events).` : 'No events found in that file.')
      setPrev({ res, source: 'file', name }); setSkip(new Set())
    } catch (e) { setErr((e as Error).message) }
  }
  async function onLink() {
    setErr(''); setMsg(''); setBusy(true)
    try {
      const url = normalizeUrl(link)
      const res = await loadFeed(url)
      if (!res.events.length) throw new Error('That calendar has no upcoming events.')
      setPrev({ res, source: url, name: res.name ?? new URL(url).hostname }); setSkip(new Set())
    } catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }
  async function doImport() {
    if (!prev) return
    setBusy(true); setErr('')
    try {
      const events = prev.res.events.filter((e) => !skip.has(e.key))
      const isFeed = prev.source !== 'file'
      const r = isFeed ? await subscribe({ url: prev.source, name: prev.name, memberIds: who }, events) : await saveEvents(events, 'file', who, false)
      setMsg(`${isFeed ? 'Subscribed. ' : ''}Added ${r.added} event${r.added === 1 ? '' : 's'}${r.updated ? `, updated ${r.updated}` : ''}.`)
      setPrev(null); setLink(''); void loadFeeds()
      onDone(events[0]?.date)
    } catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }
  async function refresh() {
    setBusy(true); setMsg('')
    await refreshFeeds(true); onDone()
    setMsg('Calendars refreshed.'); setBusy(false)
  }

  const chosen = prev ? prev.res.events.length - skip.size : 0
  return (
    <Modal title="Bring in a calendar" onClose={onClose}>
      <div className="stack">
        {!prev && (
          <>
            <div className="row">
              <button className={`tab ${mode === 'file' ? 'on' : ''}`} onClick={() => setMode('file')}><FileUp size={15} /> From a file</button>
              <button className={`tab ${mode === 'link' ? 'on' : ''}`} onClick={() => setMode('link')}><Link2 size={15} /> From a link</button>
            </div>
            {mode === 'file' ? (
              <>
                <p className="muted" style={{ margin: 0 }}>Pick a calendar file ending in <b>.ics</b>. Google, Apple and Outlook calendars, school schedules and email invites all export this.</p>
                <input type="file" accept=".ics,text/calendar" aria-label="Calendar file" onChange={(e) => void onFile(e.target.files?.[0])} />
              </>
            ) : (
              <>
                <p className="muted" style={{ margin: 0 }}>Paste a calendar link (it may start with <b>webcal://</b>). BindingTies keeps it up to date, so changes at the school or team show up here.</p>
                <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://… or webcal://…" aria-label="Calendar link" />
                <button className="btn primary" disabled={busy || link.trim().length < 8} onClick={onLink}>{busy ? 'Reading…' : 'Look at it'}</button>
              </>
            )}
          </>
        )}

        {prev && (
          <>
            <div><b>{prev.name}</b><div className="muted">{chosen} of {prev.res.events.length} upcoming events{prev.res.skippedPast ? ` (${prev.res.skippedPast} past ones skipped)` : ''}</div></div>
            <div className="muted">Who is it for? Leave empty for the whole family.</div>
            <div className="row">
              {members.map((m) => {
                const on = who.includes(m.id)
                return <button key={m.id} className={`tab ${on ? 'on' : ''}`} onClick={() => setWho(on ? who.filter((x) => x !== m.id) : [...who, m.id])}>{m.name}</button>
              })}
            </div>
            <div className="stack" style={{ maxHeight: 260, overflow: 'auto', gap: 4 }}>
              {prev.res.events.slice(0, 300).map((e) => (
                <label key={e.key} className="row" style={{ gap: 8, alignItems: 'flex-start' }}>
                  <input type="checkbox" checked={!skip.has(e.key)} onChange={() => setSkip((s) => { const n = new Set(s); if (n.has(e.key)) n.delete(e.key); else n.add(e.key); return n })} />
                  <span><b>{e.title}</b><br /><span className="muted">{fmtDate(e.date)}{e.start ? ` • ${fmtTime(e.start)}` : ' • all day'}{e.repeat !== 'none' ? ` • repeats ${e.repeat}` : ''}</span></span>
                </label>
              ))}
              {prev.res.events.length > 300 && <span className="muted">…and {prev.res.events.length - 300} more (all are imported unless you untick them).</span>}
            </div>
            <div className="row between">
              <button className="btn" onClick={() => setPrev(null)}>Back</button>
              <button className="btn primary" disabled={busy || !chosen} onClick={doImport}>{prev.source === 'file' ? `Add ${chosen} events` : `Subscribe and add ${chosen}`}</button>
            </div>
          </>
        )}

        {err && <div className="err" role="alert">{err}</div>}
        {msg && <div className="muted" role="status"><b>{msg}</b></div>}

        {!prev && feeds.length > 0 && (
          <div className="stack" style={{ gap: 6 }}>
            <div className="row between"><b>Calendars you follow</b><button className="btn sm" disabled={busy} onClick={refresh}><RefreshCw size={14} /> Refresh now</button></div>
            {feeds.map((f) => (
              <div key={f.url} className="item">
                <div className="grow"><div className="title">{f.name}</div><div className="muted" style={{ wordBreak: 'break-all', fontSize: 13 }}>{f.url}</div></div>
                <button className="btn ghost sm" aria-label={`Stop following ${f.name}`} onClick={async () => { if (confirm(`Stop following "${f.name}" and remove its events?`)) { await unsubscribe(f.url); await loadFeeds(); onDone() } }}><Trash2 size={16} /></button>
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  )
}
