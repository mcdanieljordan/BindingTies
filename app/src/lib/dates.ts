import type { EventItem } from '../db'

export const pad = (n: number) => String(n).padStart(2, '0')
export const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const parseYmd = (s: string) => {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}
export const todayStr = () => ymd(new Date())
export const addDays = (s: string, n: number) => {
  const d = parseYmd(s)
  d.setDate(d.getDate() + n)
  return ymd(d)
}
export const nowHm = () => {
  const d = new Date()
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}
export const fmtTime = (hm?: string) => {
  if (!hm) return ''
  const [h, m] = hm.split(':').map(Number)
  return `${((h + 11) % 12) + 1}:${pad(m)} ${h < 12 ? 'AM' : 'PM'}`
}
export const fmtDate = (s: string, opts: Intl.DateTimeFormatOptions = { weekday: 'short', month: 'short', day: 'numeric' }) =>
  parseYmd(s).toLocaleDateString(undefined, opts)
export const greeting = () => {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
}
export const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** Does a (possibly repeating) event occur on a given date? */
export function occursOn(e: EventItem, date: string): boolean {
  if (date < e.date) return false
  if (e.repeat === 'none') return e.date === date
  if (e.repeat === 'daily') return true
  const a = parseYmd(e.date)
  const b = parseYmd(date)
  if (e.repeat === 'weekly') return e.days?.length ? e.days.includes(b.getDay()) : a.getDay() === b.getDay()
  return a.getDate() === b.getDate()
}
/** Start/end for a given day (a weekly event can have its own time on some weekdays). */
export function timesOn(e: EventItem, date: string): { start?: string; end?: string } {
  const t = e.repeat === 'weekly' && e.days?.length ? e.dayTimes?.[String(parseYmd(date).getDay())] : undefined
  return t?.start ? { start: t.start, end: t.end || undefined } : { start: e.start, end: e.end }
}
export const eventsOn = (events: EventItem[], date: string) =>
  events
    .filter((e) => occursOn(e, date))
    .map((e) => ({ ...e, ...timesOn(e, date) }))
    .sort((a, b) => (a.start ?? '00:00').localeCompare(b.start ?? '00:00'))
