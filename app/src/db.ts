import Dexie, { type EntityTable } from 'dexie'

export type Role = 'parent' | 'child' | 'caregiver'
export interface Member {
  id: number
  name: string
  role: Role
  color: string
  icon: string
  age?: number
  pin?: string
  /** Free-text context a future AI helper / teacher / doctor could use */
  profile?: string
}
export type Repeat = 'none' | 'daily' | 'weekly' | 'monthly'
export interface EventItem {
  id: number
  title: string
  date: string // YYYY-MM-DD
  start?: string // HH:mm
  end?: string
  memberIds: number[]
  driverId?: number
  remindMin: number
  repeat: Repeat
  notes?: string
  /** set when the event came from a subscribed calendar link */
  feed?: string
}
export interface Step {
  id: string
  title: string
  icon: string
  mins?: number
  photoId?: number
}
export interface Routine {
  id: number
  name: string
  block: 'morning' | 'after_school' | 'bedtime' | 'custom'
  memberId?: number
  steps: Step[]
  days: number[] // 0-6, Sunday=0
  timeOfDay?: string
}
export interface RoutineRun {
  id: number
  routineId: number
  date: string
  doneStepIds: string[]
  completed: boolean
}
export interface LedgerEntry {
  id: number
  ts: number
  memberId: number
  points: number
  reason: string
  ref?: string
}
export interface Reward {
  id: number
  title: string
  cost: number
  scope: 'team' | 'personal'
  claimedAt?: number
}
export interface Chore {
  id: number
  title: string
  points: number
  assigneeId?: number // undefined = up for grabs
  doneBy?: number
  doneDate?: string
  repeat: Repeat
  lastDone?: string
  /** a child says they did it; a parent must approve before points count */
  pendingBy?: number
  pendingTs?: number
  /** take turns: these people, in order. The turn moves on every day (daily chores) or week (weekly chores) */
  rotate?: number[]
  rotateFrom?: string
  /** how many turns a parent has skipped ahead */
  rotateShift?: number
}
/* ---------- journal ---------- */
export interface JournalGoal { id: string; text: string; done: boolean }
export interface JournalEntry {
  id: number
  /** the person who wrote it (only their own sign-in can write it) */
  ownerMemberId: number
  date: string // YYYY-MM-DD, can be in the future (plans, goals)
  kind: 'note' | 'plan'
  title?: string
  body: string
  goals: JournalGoal[]
  /** people who may read it */
  shareWith: number[]
  /** parents may read it (children can switch this off to keep an entry private) */
  shareParents: boolean
  createdAt: number
  updatedAt: number
}
/** one row per child; a parent can switch on reading for a child under 15 */
export interface JournalPolicy { id: number; parentsRead: boolean }
export interface ChoreTemplate { id: string; title: string; points: number; repeat: Repeat }
export interface Prefs { requireApproval: boolean; board: 'team' | 'friendly' }
export const DEFAULT_PREFS: Prefs = { requireApproval: true, board: 'friendly' }
export interface Med {
  id: number
  name: string
  dose: string
  memberId: number
  times: string[] // HH:mm
  notes?: string
  active: boolean
  refillDate?: string
}
export interface DoseLog {
  id: number
  medId: number
  date: string
  time: string
  givenBy: number
  ts: number
}
export interface TimerItem {
  id: number
  label: string
  endsAt: number
  totalMs: number
  done?: boolean
}
export interface Alarm {
  id: number
  label: string
  time: string
  days: number[]
  enabled: boolean
}
export interface ListT {
  id: number
  name: string
}
export interface ListItem {
  id: number
  listId: number
  text: string
  done: boolean
  category: string
}
export type DocKind = 'homework' | 'grade' | 'report' | 'school' | 'iep' | 'medical' | 'therapy' | 'note' | 'other'
export interface VaultDoc {
  id: number
  memberId: number
  kind: DocKind
  title: string
  date: string
  subject?: string
  tags: string[]
  context?: string // what this is / why it matters — for humans & future AI
  score?: number
  scoreMax?: number
  fileName?: string
  mime?: string
  size?: number
  blob?: Blob
}
export interface Goal {
  id: number
  memberId: number
  text: string
  area: string
  status: 'active' | 'met' | 'paused'
  created: string
}
export interface PhotoBlob {
  id: number
  blob: Blob
}
export interface KV {
  key: string
  value: unknown
}

export interface OutboxRow { seq: number; tbl: string; rid: string; ts: number }

export const db = new Dexie('familyos-v2') as Dexie & {
  outbox: EntityTable<OutboxRow, 'seq'>
  members: EntityTable<Member, 'id'>
  events: EntityTable<EventItem, 'id'>
  routines: EntityTable<Routine, 'id'>
  runs: EntityTable<RoutineRun, 'id'>
  ledger: EntityTable<LedgerEntry, 'id'>
  rewards: EntityTable<Reward, 'id'>
  chores: EntityTable<Chore, 'id'>
  meds: EntityTable<Med, 'id'>
  doses: EntityTable<DoseLog, 'id'>
  timers: EntityTable<TimerItem, 'id'>
  alarms: EntityTable<Alarm, 'id'>
  lists: EntityTable<ListT, 'id'>
  listItems: EntityTable<ListItem, 'id'>
  vault: EntityTable<VaultDoc, 'id'>
  goals: EntityTable<Goal, 'id'>
  photos: EntityTable<PhotoBlob, 'id'>
  journal: EntityTable<JournalEntry, 'id'>
  policy: EntityTable<JournalPolicy, 'id'>
  kv: EntityTable<KV, 'key'>
}

db.version(1).stores({
  members: 'id',
  events: 'id, date',
  routines: 'id',
  runs: 'id, routineId, date',
  ledger: 'id, ts, memberId',
  rewards: 'id',
  chores: 'id',
  meds: 'id, memberId',
  doses: 'id, medId, date',
  timers: 'id',
  alarms: 'id',
  lists: 'id',
  listItems: 'id, listId',
  vault: 'id, memberId, kind, date',
  goals: 'id, memberId',
  photos: 'id',
  kv: 'key',
  outbox: '++seq, [tbl+rid]',
})

db.version(2).stores({ journal: 'id, date, ownerMemberId', policy: 'id' })

/* Random ids that stay unique across devices (fits safely in a JS number). */
export const newId = () => Math.floor(Math.random() * 2 ** 48) + 1
export const SYNCED = ['members', 'events', 'routines', 'runs', 'ledger', 'rewards', 'chores', 'meds', 'doses', 'timers', 'alarms', 'lists', 'listItems', 'vault', 'goals', 'photos', 'journal', 'policy'] as const
export const SYNCED_KV = ['quest', 'feeds', 'prefs', 'choreTemplates']

const isRemote = () => !!(Dexie.currentTransaction as unknown as { remote?: boolean } | null)?.remote
const queue = (tbl: string, rid: unknown) => {
  if (isRemote()) return
  Dexie.ignoreTransaction(() => db.outbox.add({ tbl, rid: String(rid), ts: Date.now() } as never)).catch(() => {})
}
for (const t of SYNCED) {
  const tbl = db.table(t)
  tbl.hook('creating', (_pk, obj) => { if (obj.id == null) obj.id = newId(); queue(t, obj.id) })
  tbl.hook('updating', (_m, pk) => { queue(t, pk) })
  tbl.hook('deleting', (pk) => { queue(t, pk) })
}
db.kv.hook('creating', (pk) => { if (SYNCED_KV.includes(String(pk))) queue('kv', pk) })
db.kv.hook('updating', (_m, pk) => { if (SYNCED_KV.includes(String(pk))) queue('kv', pk) })

/** One-time copy of data from the first version of the local database. */
export async function migrateLegacy() {
  if ((await db.kv.get('legacyDone'))?.value) return
  try {
    const names = (await indexedDB.databases?.())?.map((d) => d.name) ?? []
    if (names.includes('familyos')) {
      const old = new Dexie('familyos')
      await old.open()
      for (const t of old.tables) {
        if (db.tables.some((x) => x.name === t.name)) await db.table(t.name).bulkPut(await t.toArray())
      }
      old.close()
      await Dexie.delete('familyos')
    }
  } catch (e) { console.warn('legacy migration skipped', e) }
  await db.kv.put({ key: 'legacyDone', value: true })
}

export async function getKV<T>(key: string, fallback: T): Promise<T> {
  const r = await db.kv.get(key)
  return r ? (r.value as T) : fallback
}
export const setKV = (key: string, value: unknown) => db.kv.put({ key, value })

export interface Quest {
  title: string
  target: number
  reward: string
  since: number
}
export const DEFAULT_QUEST: Quest = {
  title: 'Family Fun Night',
  target: 150,
  reward: 'Pizza and a movie together',
  since: Date.now(),
}

/** Remove all family data from this device (cloud copy is untouched). Keeps device settings. */
export async function wipeLocal() {
  await db.transaction('rw', db.tables, async () => {
    // clearing this device is NOT the family deleting its data: keep it out of the upload queue
    ;(Dexie.currentTransaction as unknown as { remote: boolean }).remote = true
    for (const t of db.tables) {
      if (t.name === 'kv') await t.filter((r) => !['settings', 'legacyDone'].includes((r as KV).key)).delete()
      else await t.clear()
    }
  })
  await db.outbox.clear()
}
