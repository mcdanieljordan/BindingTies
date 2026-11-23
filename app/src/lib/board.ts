// The friendly weekly challenge. Ranks effort, not raw points, and resets every Sunday so nobody is stuck behind.
import type { LedgerEntry, Member } from '../db'
import { addDays, parseYmd, ymd } from './dates'

export interface Standing {
  id: number
  points: number
  days: number
  streak: number
  chores: number
  effort: number
  /** points compared with the week before */
  delta: number
}
export interface Award { key: string; icon: string; title: string; why: string; ids: number[] }

const dayOf = (ts: number) => ymd(new Date(ts))
/** Younger children get a boost so a 6-year-old can top the board against a 12-year-old. */
export const ageBoost = (age?: number) => (age ? Math.min(1.5, Math.max(1, 1 + (10 - age) * 0.08)) : 1)

function weekStats(ledger: LedgerEntry[], id: number, wk: string, asOf: string) {
  const end = addDays(wk, 6)
  const mine = ledger.filter((e) => e.memberId === id && e.points > 0)
  const inWeek = mine.filter((e) => { const d = dayOf(e.ts); return d >= wk && d <= end && d <= asOf })
  const dayset = new Set(inWeek.map((e) => dayOf(e.ts)))
  // streak counts back from asOf (or the day before, so the morning never shows a broken streak)
  let streak = 0
  let d = asOf > end ? end : asOf
  if (!dayset.has(d)) d = addDays(d, -1)
  while (d >= wk && dayset.has(d)) { streak++; d = addDays(d, -1) }
  return {
    points: inWeek.reduce((s, e) => s + e.points, 0),
    days: dayset.size,
    streak,
    chores: inWeek.filter((e) => e.reason.startsWith('Chore:')).length,
  }
}

export function standings(ledger: LedgerEntry[], people: Member[], wk: string, asOf: string): Standing[] {
  const prev = addDays(wk, -7)
  return people
    .map((m) => {
      const t = weekStats(ledger, m.id, wk, asOf)
      const p = weekStats(ledger, m.id, prev, addDays(prev, 6))
      const effort = Math.round(t.points * ageBoost(m.age)) + t.days * 5 + Math.min(t.streak, 7) * 2
      return { id: m.id, ...t, effort, delta: t.points - p.points }
    })
    .sort((a, b) => b.effort - a.effort || b.days - a.days || a.id - b.id)
}

/** Several people can share an award; it only exists if someone actually earned it. */
export function awards(st: Standing[]): Award[] {
  const best = (pick: (s: Standing) => number, min: number) => {
    const top = Math.max(0, ...st.map(pick))
    return top >= min ? { top, ids: st.filter((s) => pick(s) === top).map((s) => s.id) } : null
  }
  const out: Award[] = []
  const eff = best((s) => s.effort, 1)
  if (eff) out.push({ key: 'effort', icon: '🏆', title: 'Top Effort', why: `${eff.top} effort`, ids: eff.ids })
  const stk = best((s) => s.streak, 2)
  if (stk) out.push({ key: 'streak', icon: '🔥', title: 'Streak Star', why: `${stk.top} days in a row`, ids: stk.ids })
  const imp = best((s) => s.delta, 1)
  if (imp) out.push({ key: 'improved', icon: '📈', title: 'Most Improved', why: `+${imp.top} points vs the week before`, ids: imp.ids })
  const ch = best((s) => s.chores, 1)
  if (ch) out.push({ key: 'chores', icon: '🧹', title: 'Chore Champ', why: `${ch.top} chore${ch.top === 1 ? '' : 's'}`, ids: ch.ids })
  return out
}

export const weekBefore = (wk: string) => ymd(parseYmd(addDays(wk, -7)))
