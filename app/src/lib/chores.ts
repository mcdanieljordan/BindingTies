import type { Chore } from '../db'
import { parseYmd } from './dates'
import { weekStart } from './engine'

/** The day or week the rotation started from, so turns line up with the chore's repeat. */
export const rotationAnchor = (repeat: Chore['repeat'], today: string) => (repeat === 'weekly' ? weekStart(parseYmd(today)) : today)

function turnIndex(c: Chore, today: string) {
  if (!c.rotateFrom) return 0
  const days = Math.max(0, Math.round((parseYmd(today).getTime() - parseYmd(c.rotateFrom).getTime()) / 86400000))
  return (c.repeat === 'weekly' ? Math.floor(days / 7) : days) + (c.rotateShift ?? 0)
}

/** People still in the family, in turn order. */
const people = (c: Chore, alive?: Set<number>) => (c.rotate ?? []).filter((id) => !alive || alive.has(id))
export const isRotating = (c: Chore, alive?: Set<number>) => c.repeat !== 'none' && people(c, alive).length >= 2

/** Whose job it is right now (a fixed assignee, a rotation turn, or nobody = up for grabs). */
export function turnOf(c: Chore, today: string, alive?: Set<number>): number | undefined {
  if (!isRotating(c, alive)) return c.assigneeId
  const r = people(c, alive)
  return r[turnIndex(c, today) % r.length]
}
/** Who is next after the current turn. */
export function nextTurnOf(c: Chore, today: string, alive?: Set<number>): number | undefined {
  if (!isRotating(c, alive)) return undefined
  const r = people(c, alive)
  return r[(turnIndex(c, today) + 1) % r.length]
}
