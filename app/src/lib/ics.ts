// Reads iCalendar (.ics) text from Google, Apple, Outlook, schools, sports leagues, email invites.
// Output is already shaped like BindingTies events, converted to this device's local time.
import type { Repeat } from '../db'
import { pad, parseYmd, todayStr, ymd } from './dates'

export interface IcsEvent {
  /** stable identity, used so re-importing or refreshing updates instead of duplicating */
  key: string
  title: string
  date: string
  start?: string
  end?: string
  remindMin: number
  repeat: Repeat
  notes?: string
}
export interface IcsResult { events: IcsEvent[]; name?: string; skippedPast: number }

interface Prop { name: string; params: Record<string, string>; value: string }
interface Comp { type: string; props: Prop[]; kids: Comp[] }

const unescape = (s: string) => s.replace(/\\[nN]/g, '\n').replace(/\\([,;\\])/g, '$1')

function parseComponents(text: string): Comp {
  const lines = text.replace(/^﻿/, '').replace(/\r\n|\r/g, '\n').replace(/\n[ \t]/g, '').split('\n')
  const root: Comp = { type: 'ROOT', props: [], kids: [] }
  const stack = [root]
  for (const line of lines) {
    if (!line.trim()) continue
    let q = false, at = -1
    for (let i = 0; i < line.length; i++) {
      if (line[i] === '"') q = !q
      else if (line[i] === ':' && !q) { at = i; break }
    }
    if (at < 1) continue
    const head = line.slice(0, at), value = line.slice(at + 1)
    const [name, ...ps] = head.split(';')
    const params: Record<string, string> = {}
    for (const p of ps) { const i = p.indexOf('='); if (i > 0) params[p.slice(0, i).toUpperCase()] = p.slice(i + 1).replace(/^"|"$/g, '') }
    const N = name.toUpperCase()
    if (N === 'BEGIN') { const c: Comp = { type: value.trim().toUpperCase(), props: [], kids: [] }; stack[stack.length - 1].kids.push(c); stack.push(c) }
    else if (N === 'END') { if (stack.length > 1) stack.pop() }
    else stack[stack.length - 1].props.push({ name: N, params, value })
  }
  return root
}

const WIN: Record<string, string> = {
  'Eastern Standard Time': 'America/New_York', 'Central Standard Time': 'America/Chicago', 'Mountain Standard Time': 'America/Denver',
  'Pacific Standard Time': 'America/Los_Angeles', 'US Mountain Standard Time': 'America/Phoenix', 'Alaskan Standard Time': 'America/Anchorage',
  'Hawaiian Standard Time': 'Pacific/Honolulu', 'Atlantic Standard Time': 'America/Halifax', 'GMT Standard Time': 'Europe/London',
  'W. Europe Standard Time': 'Europe/Berlin', 'Central Europe Standard Time': 'Europe/Budapest', 'UTC': 'UTC',
}
function tzOffset(ms: number, tz: string) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' }).formatToParts(new Date(ms)).map((x) => [x.type, x.value]))
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - Math.floor(ms / 1000) * 1000
}
interface DT { date: string; time?: string }
function parseDT(p?: Prop): DT | null {
  if (!p) return null
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(p.value.trim())
  if (!m) return null
  const [, Y, Mo, D, h, mi, s, z] = m
  if (h === undefined) return { date: `${Y}-${Mo}-${D}` }
  const wall = Date.UTC(+Y, +Mo - 1, +D, +h, +mi, +(s ?? 0))
  let d: Date
  const tz = z ? 'UTC' : p.params.TZID ? (WIN[p.params.TZID] ?? p.params.TZID) : ''
  if (!tz) d = new Date(+Y, +Mo - 1, +D, +h, +mi)
  else {
    try { let ms = wall - tzOffset(wall, tz); ms = wall - tzOffset(ms, tz); d = new Date(ms) } catch { d = new Date(+Y, +Mo - 1, +D, +h, +mi) }
  }
  return { date: ymd(d), time: `${pad(d.getHours())}:${pad(d.getMinutes())}` }
}

const REMIND = [5, 15, 30, 60, 120]
function alarmMinutes(c: Comp): number | undefined {
  for (const a of c.kids.filter((k) => k.type === 'VALARM')) {
    const t = a.props.find((p) => p.name === 'TRIGGER')?.value.trim()
    const m = t && /^(-)?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?)?/.exec(t)
    if (!m || !m[1]) continue
    const mins = (+(m[2] ?? 0)) * 10080 + (+(m[3] ?? 0)) * 1440 + (+(m[4] ?? 0)) * 60 + +(m[5] ?? 0)
    return REMIND.reduce((best, x) => (Math.abs(x - mins) < Math.abs(best - mins) ? x : best), REMIND[0])
  }
}

function hash(s: string) { // small stable id used when a file has no UID
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57
  for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677) }
  return (h1 >>> 0).toString(36) + (h2 >>> 0).toString(36)
}

const DAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA']
const addD = (s: string, n: number) => { const d = parseYmd(s); d.setDate(d.getDate() + n); return ymd(d) }
const diffDays = (a: string, b: string) => Math.round((parseYmd(b).getTime() - parseYmd(a).getTime()) / 86400000)

interface Rule { freq: string; interval: number; count?: number; until?: string; byday: { ord?: number; wd: number }[]; bymonthday: number[]; bymonth: number[] }
function parseRule(v: string): Rule {
  const k: Record<string, string> = {}
  for (const part of v.split(';')) { const i = part.indexOf('='); if (i > 0) k[part.slice(0, i).toUpperCase()] = part.slice(i + 1) }
  const until = k.UNTIL ? parseDT({ name: 'UNTIL', params: {}, value: k.UNTIL })?.date : undefined
  return {
    freq: (k.FREQ ?? '').toUpperCase(), interval: Math.max(1, +(k.INTERVAL ?? 1) || 1), count: k.COUNT ? +k.COUNT : undefined, until,
    byday: (k.BYDAY ?? '').split(',').filter(Boolean).map((x) => { const m = /^([+-]?\d+)?([A-Z]{2})$/.exec(x.trim()); return m ? { ord: m[1] ? +m[1] : undefined, wd: DAYS.indexOf(m[2]) } : { wd: -1 } }).filter((x) => x.wd >= 0),
    bymonthday: (k.BYMONTHDAY ?? '').split(',').filter(Boolean).map(Number),
    bymonth: (k.BYMONTH ?? '').split(',').filter(Boolean).map(Number),
  }
}

function matches(r: Rule, start: string, d: string): boolean {
  const sd = parseYmd(start), dd = parseYmd(d)
  const wd = dd.getDay()
  if (r.freq === 'DAILY') return diffDays(start, d) % r.interval === 0
  if (r.freq === 'WEEKLY') {
    const wk = Math.floor((diffDays(start, d) + sd.getDay()) / 7) // weeks since the week of the start (Sunday-based)
    const days = r.byday.length ? r.byday.map((x) => x.wd) : [sd.getDay()]
    return wk % r.interval === 0 && days.includes(wd)
  }
  const months = (dd.getFullYear() - sd.getFullYear()) * 12 + dd.getMonth() - sd.getMonth()
  if (r.freq === 'MONTHLY') {
    if (months % r.interval !== 0) return false
    if (r.byday.length) {
      const nth = Math.ceil(dd.getDate() / 7)
      const last = dd.getDate() + 7 > new Date(dd.getFullYear(), dd.getMonth() + 1, 0).getDate()
      return r.byday.some((x) => x.wd === wd && (x.ord === undefined || x.ord === nth || (x.ord === -1 && last)))
    }
    const dom = r.bymonthday.length ? r.bymonthday : [sd.getDate()]
    const len = new Date(dd.getFullYear(), dd.getMonth() + 1, 0).getDate()
    return dom.some((x) => (x > 0 ? x : len + 1 + x) === dd.getDate())
  }
  if (r.freq === 'YEARLY') {
    if ((dd.getFullYear() - sd.getFullYear()) % r.interval !== 0) return false
    const mo = r.bymonth.length ? r.bymonth : [sd.getMonth() + 1]
    return mo.includes(dd.getMonth() + 1) && dd.getDate() === (r.bymonthday[0] ?? sd.getDate())
  }
  return false
}

export function parseIcs(text: string, today = todayStr()): IcsResult {
  const root = parseComponents(text)
  const cal = root.kids.find((k) => k.type === 'VCALENDAR') ?? root
  const name = cal.props.find((p) => p.name === 'X-WR-CALNAME')?.value
  const vevents = cal.kids.filter((k) => k.type === 'VEVENT')
  const prop = (c: Comp, n: string) => c.props.find((p) => p.name === n)
  const horizon = addD(today, 400)
  const out: IcsEvent[] = []
  let skippedPast = 0

  // instances of a repeating event that were moved or cancelled individually
  const overridden = new Map<string, Set<string>>()
  for (const c of vevents) {
    const rid = parseDT(prop(c, 'RECURRENCE-ID'))
    const uid = prop(c, 'UID')?.value
    if (rid && uid) { if (!overridden.has(uid)) overridden.set(uid, new Set()); overridden.get(uid)!.add(rid.date) }
  }

  for (const c of vevents) {
    if (/CANCELLED/i.test(prop(c, 'STATUS')?.value ?? '')) continue
    const s = parseDT(prop(c, 'DTSTART'))
    if (!s) continue
    const e = parseDT(prop(c, 'DTEND'))
    const title = unescape(prop(c, 'SUMMARY')?.value ?? '').trim() || '(no title)'
    const loc = unescape(prop(c, 'LOCATION')?.value ?? '').trim()
    const desc = unescape(prop(c, 'DESCRIPTION')?.value ?? '').trim().slice(0, 600)
    const notes = [loc && `📍 ${loc}`, desc].filter(Boolean).join('\n') || undefined
    const timed = !!s.time
    const remindMin = alarmMinutes(c) ?? (timed ? 30 : 0)
    const uid = prop(c, 'UID')?.value.trim() || hash(title + s.date + (s.time ?? ''))
    const base = { title, start: s.time, end: timed && e?.time ? e.time : undefined, remindMin, notes }
    const rr = prop(c, 'RRULE')
    const isOverride = !!prop(c, 'RECURRENCE-ID')

    if (!rr || isOverride) {
      // a single event (all-day events that span several days become one per day)
      const span = !timed && e ? Math.min(31, Math.max(1, diffDays(s.date, e.date))) : 1
      for (let i = 0; i < span; i++) {
        const date = addD(s.date, i)
        if (date < today) { skippedPast++; continue }
        out.push({ ...base, key: `${uid}|${isOverride ? 'o' : ''}${date}`, date, repeat: 'none' })
      }
      continue
    }

    const r = parseRule(rr.value)
    const ex = new Set<string>(overridden.get(uid) ?? [])
    for (const p of c.props.filter((x) => x.name === 'EXDATE')) for (const v of p.value.split(',')) { const d = parseDT({ ...p, value: v }); if (d) ex.add(d.date) }
    const sd = parseYmd(s.date)
    const open = !r.count && !r.until && r.interval === 1 && ex.size === 0

    // simple, never-ending patterns map straight onto BindingTies repeats
    if (open && r.freq === 'DAILY' && !r.byday.length) { out.push({ ...base, key: uid, date: s.date, repeat: 'daily' }); continue }
    if (open && r.freq === 'WEEKLY' && !r.byday.some((x) => x.ord)) {
      const days = r.byday.length ? r.byday.map((x) => x.wd) : [sd.getDay()]
      for (const wd of days) out.push({ ...base, key: `${uid}#${wd}`, date: addD(s.date, (wd - sd.getDay() + 7) % 7), repeat: 'weekly' })
      continue
    }
    if (open && r.freq === 'MONTHLY' && !r.byday.length && (!r.bymonthday.length || (r.bymonthday.length === 1 && r.bymonthday[0] === sd.getDate())) && sd.getDate() <= 28) {
      out.push({ ...base, key: uid, date: s.date, repeat: 'monthly' }); continue
    }

    // anything else (ends after N times, every other week, 2nd Tuesday, skipped dates…) becomes individual events
    let n = 0
    const last = r.until && r.until < horizon ? r.until : horizon
    for (let d = s.date, i = 0; d <= last && i < 40000; d = addD(d, 1), i++) {
      if (!matches(r, s.date, d)) continue
      n++
      if (r.count && n > r.count) break
      if (ex.has(d)) continue
      if (d < today) { skippedPast++; continue }
      out.push({ ...base, key: `${uid}|${d}`, date: d, repeat: 'none' })
    }
  }
  out.sort((a, b) => a.date.localeCompare(b.date) || (a.start ?? '').localeCompare(b.start ?? ''))
  return { events: out, name: name ? unescape(name) : undefined, skippedPast }
}
