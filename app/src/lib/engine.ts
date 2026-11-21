import confetti from 'canvas-confetti'
import { db, getKV, type Quest, DEFAULT_QUEST } from '../db'
import { ymd, nowHm, todayStr, parseYmd, pad, occursOn } from './dates'

/* ---------- settings ---------- */
export type Skin = 'quest' | 'calm'
export interface Settings { theme: 'midnight' | 'light'; skin: Skin; sound: boolean }
export const DEFAULT_SETTINGS: Settings = { theme: 'midnight', skin: 'quest', sound: true }
export const loadSettings = () => getKV<Settings>('settings', DEFAULT_SETTINGS)

/* ---------- points (cooperative: every point also fuels the family quest) ---------- */
export async function award(memberId: number, points: number, reason: string, ref?: string) {
  await db.ledger.add({ ts: Date.now(), memberId, points, reason, ref } as never)
}
export async function revoke(ref: string) {
  await db.ledger.filter((e) => e.ref === ref).delete()
}
export async function questProgress() {
  const q = await getKV<Quest>('quest', DEFAULT_QUEST)
  const entries = await db.ledger.where('ts').aboveOrEqual(q.since).toArray()
  const total = entries.filter((e) => e.points > 0).reduce((s, e) => s + e.points, 0)
  return { quest: q, total, pct: Math.min(100, Math.round((total / q.target) * 100)) }
}
export async function pointsOf(memberId: number) {
  const all = await db.ledger.where('memberId').equals(memberId).toArray()
  return all.reduce((s, e) => s + e.points, 0)
}
/** Weekends are lighter (about a third) so rest days never feel like a penalty. */
export const pointScale = () => ([0, 6].includes(new Date().getDay()) ? 0.5 : 1)

export async function celebrate(big = false) {
  const s = await loadSettings()
  if (s.skin === 'calm') return
  confetti({ particleCount: big ? 160 : 50, spread: big ? 90 : 55, origin: { y: 0.7 }, disableForReducedMotion: true })
}

/* ---------- sound ---------- */
let ctx: AudioContext | null = null
export function beep(pattern: number[] = [660, 880, 660]) {
  try {
    ctx ??= new AudioContext()
    let t = ctx.currentTime
    for (const f of pattern) {
      const o = ctx.createOscillator()
      const g = ctx.createGain()
      o.frequency.value = f
      o.type = 'sine'
      g.gain.setValueAtTime(0.0001, t)
      g.gain.exponentialRampToValueAtTime(0.25, t + 0.02)
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25)
      o.connect(g).connect(ctx.destination)
      o.start(t)
      o.stop(t + 0.27)
      t += 0.3
    }
  } catch { /* audio unavailable */ }
}

/* ---------- reminders while the app is open ---------- */
export interface Toast { id: number; title: string; body?: string; kind?: 'info' | 'warn' }
type ToastFn = (t: Omit<Toast, 'id'>) => void
const fired = new Set<string>()
try {
  const prev = JSON.parse(localStorage.getItem('fos-fired') ?? '[]') as string[]
  prev.slice(-300).forEach((k) => fired.add(k))
} catch { /* ignore */ }
function once(key: string) {
  if (fired.has(key)) return false
  fired.add(key)
  try { localStorage.setItem('fos-fired', JSON.stringify([...fired].slice(-300))) } catch { /* ignore */ }
  return true
}
export const notifySupported = () => typeof Notification !== 'undefined'
function systemNotify(title: string, body?: string) {
  // when server push is on, the push message is the notification; avoid doubles
  let pushOn = false
  try { pushOn = localStorage.getItem('fos-push') === '1' } catch { /* ignore */ }
  if (!pushOn && notifySupported() && Notification.permission === 'granted') {
    try { new Notification(title, { body, icon: import.meta.env.BASE_URL + 'favicon.svg', tag: title + body }) } catch { /* some mobile browsers need a service worker */ }
  }
}

export function startScheduler(toast: ToastFn) {
  const fire = async (title: string, body?: string, kind: Toast['kind'] = 'info') => {
    toast({ title, body, kind })
    systemNotify(title, body)
    const s = await loadSettings()
    if (s.sound) beep(kind === 'warn' ? [880, 660, 880, 660] : undefined)
  }
  const tick = async () => {
    const now = new Date()
    const today = ymd(now)
    const hm = nowHm()
    const dow = now.getDay()
    // events with reminders
    const events = await db.events.toArray()
    for (const e of events) {
      if (!e.start || !e.remindMin || !occursOn(e, today)) continue
      const [h, m] = e.start.split(':').map(Number)
      const at = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m).getTime() - e.remindMin * 60000
      if (Date.now() >= at && Date.now() < at + 5 * 60000 && once(`ev-${e.id}-${today}`)) {
        await fire(`Coming up: ${e.title}`, `Starts at ${e.start}${e.remindMin ? ` (in ~${e.remindMin} min)` : ''}`)
      }
    }
    // alarms
    for (const a of await db.alarms.toArray()) {
      if (a.enabled && a.time === hm && (a.days.length === 0 || a.days.includes(dow)) && once(`al-${a.id}-${today}-${hm}`)) {
        await fire(`⏰ ${a.label}`, a.time, 'warn')
      }
    }
    // timers
    for (const t of await db.timers.toArray()) {
      if (!t.done && Date.now() >= t.endsAt && once(`tm-${t.id}`)) {
        await db.timers.update(t.id, { done: true })
        await fire(`⏱ ${t.label}`, 'Time is up!', 'warn')
      }
    }
    // meds (reminds until logged; repeats every 10 min up to 3 times)
    const doses = await db.doses.where('date').equals(today).toArray()
    for (const med of await db.meds.toArray()) {
      if (!med.active) continue
      for (const time of med.times) {
        if (doses.some((d) => d.medId === med.id && d.time === time)) continue
        const [h, m] = time.split(':').map(Number)
        const mins = (now.getHours() * 60 + now.getMinutes()) - (h * 60 + m)
        if (mins >= 0 && mins <= 30) {
          const slot = Math.floor(mins / 10)
          if (once(`med-${med.id}-${today}-${time}-${slot}`)) {
            const who = (await db.members.get(med.memberId))?.name ?? ''
            await fire(`💊 ${med.name} for ${who}`, `${med.dose} due at ${time}. Tap Care to log it once given.`, 'warn')
          }
        }
      }
    }
  }
  void tick()
  const id = window.setInterval(tick, 15000)
  return () => window.clearInterval(id)
}

/* ---------- helpers ---------- */
export const uid = () => Math.random().toString(36).slice(2, 10)
export const weekStart = (d = new Date()) => {
  const x = new Date(d)
  x.setDate(x.getDate() - x.getDay())
  return ymd(x)
}
export const hex2rgba = (hex: string, a: number) => {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`
}
export const fmtMs = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(s / 60)}:${pad(s % 60)}`
}
export { todayStr, parseYmd }
