import { Dexie } from 'dexie'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { db, getKV, setKV, SYNCED, SYNCED_KV } from '../db'
import { sb } from './client'

export type SyncState = 'off' | 'syncing' | 'ok' | 'offline' | 'error'
export interface Status { state: SyncState; last?: number; error?: string; pending: number }
let status: Status = { state: 'off', pending: 0 }
const subs = new Set<() => void>()
const set = (p: Partial<Status>) => { status = { ...status, ...p }; subs.forEach((f) => f()) }
export const getStatus = () => status
export const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f) } }

const BUCKET = 'family-files'
interface Rec { tbl: string; rid: string; data: Record<string, unknown> | null; deleted: boolean; updated_at: string }
type Row = Record<string, unknown> & { id?: number; blob?: Blob }

async function push(fid: string) {
  if (!sb) return
  for (;;) {
    const batch = await db.outbox.orderBy('seq').limit(100).toArray()
    if (!batch.length) break
    const keys = new Map(batch.map((r) => [`${r.tbl}/${r.rid}`, r]))
    const ups: Record<string, unknown>[] = []
    const uploaded = new Set(await getKV<string[]>('sync:uploaded', []))
    for (const r of keys.values()) {
      if (r.tbl === 'kv') {
        const row = await db.kv.get(r.rid)
        ups.push({ family_id: fid, tbl: 'kv', rid: r.rid, data: row ? { key: row.key, value: row.value } : null, deleted: !row })
        continue
      }
      const row = (await db.table(r.tbl).get(Number(r.rid))) as Row | undefined
      if (!row) { ups.push({ family_id: fid, tbl: r.tbl, rid: r.rid, data: null, deleted: true }); continue }
      const data: Row = { ...row }
      if (data.blob instanceof Blob) {
        const path = `${fid}/${r.tbl}/${r.rid}`
        if (!uploaded.has(path)) {
          // journal files are write-once; an upload that already happened (a retry) counts as done
          const once = r.tbl === 'journalMedia'
          const { error } = await sb.storage.from(BUCKET).upload(path, data.blob, { upsert: !once, contentType: data.blob.type || 'application/octet-stream' })
          if (error && !(once && /exist|duplicate/i.test(error.message))) throw error
          uploaded.add(path)
        }
        data.blobPath = path
        delete data.blob
      }
      ups.push({ family_id: fid, tbl: r.tbl, rid: r.rid, data, deleted: false })
    }
    const { error } = await sb.from('records').upsert(ups, { onConflict: 'family_id,tbl,rid' })
    if (error) {
      // One row the server will never accept (for example an edit to something that is not yours) must not hold up everything behind it.
      // Retry one by one and give up only on private-data rows that were refused by the privacy rules.
      if (!/row-level security/i.test(error.message)) throw error
      for (const u of ups) {
        const { error: e1 } = await sb.from('records').upsert(u, { onConflict: 'family_id,tbl,rid' })
        if (e1 && !(/row-level security/i.test(e1.message) && ['journal', 'journalMedia', 'policy'].includes(u.tbl as string))) throw e1
      }
    }
    await setKV('sync:uploaded', [...uploaded].slice(-2000))
    await db.outbox.bulkDelete(batch.map((r) => r.seq))
  }
}

async function apply(recs: Rec[]) {
  if (!sb || !recs.length) return
  const pending = new Set((await db.outbox.toArray()).map((o) => `${o.tbl}/${o.rid}`))
  const todo = recs.filter((r) => !pending.has(`${r.tbl}/${r.rid}`)) // local edits not yet sent win
  // fetch files first: IndexedDB transactions can't wait on the network
  const blobs = new Map<string, Blob>()
  for (const r of todo) {
    const path = r.data?.blobPath as string | undefined
    if (!r.deleted && path && r.tbl !== 'kv' && r.tbl !== 'journalMedia') { // journal media downloads when it is opened
      const local = (await db.table(r.tbl).get(Number(r.rid))) as Row | undefined
      if (local?.blob) { blobs.set(r.rid + r.tbl, local.blob); continue }
      const { data, error } = await sb.storage.from(BUCKET).download(path)
      if (!error && data) blobs.set(r.rid + r.tbl, data)
    }
  }
  await db.transaction('rw', db.tables, async () => {
    ;(Dexie.currentTransaction as unknown as { remote: boolean }).remote = true
    for (const r of todo) {
      if (r.tbl === 'kv') {
        if (!SYNCED_KV.includes(r.rid)) continue
        if (r.deleted) await db.kv.delete(r.rid)
        else await db.kv.put({ key: r.rid, value: (r.data as { value: unknown }).value })
        continue
      }
      if (!(SYNCED as readonly string[]).includes(r.tbl)) continue
      const tbl = db.table(r.tbl)
      if (r.deleted) { await tbl.delete(Number(r.rid)); continue }
      const row = { ...(r.data as Row) }
      if (r.tbl !== 'journalMedia') delete row.blobPath // journal media keeps its address and downloads when opened
      const b = blobs.get(r.rid + r.tbl)
      if (b) row.blob = b
      else if (r.tbl === 'journalMedia') { const old = (await tbl.get(Number(r.rid))) as Row | undefined; if (old?.blob) row.blob = old.blob } // keep the copy this device already has
      await tbl.put(row)
    }
  })
}

/** Bumped whenever sync starts or stops, so a pull that is still running for a previous login cannot write into the next one. */
let gen = 0
const EPOCH = '1970-01-01T00:00:00Z'

async function pull(fid: string, g: number) {
  if (!sb) return
  let cursor = await getKV<string>('sync:cursor', EPOCH)
  // an empty device has downloaded nothing yet, whatever an old marker says
  if (cursor !== EPOCH && (await db.members.count()) === 0) cursor = EPOCH
  for (;;) {
    const { data, error } = await sb.from('records').select('tbl,rid,data,deleted,updated_at').eq('family_id', fid).gt('updated_at', cursor).order('updated_at').limit(300)
    if (error) throw error
    if (g !== gen) return
    if (!data?.length) break
    await apply(data as Rec[])
    if (g !== gen) return
    cursor = data[data.length - 1].updated_at
    await setKV('sync:cursor', cursor)
    if (data.length < 300) break
  }
}

/** Journal entries and their media can become readable (a parent switches on reading, an author shares an old entry) or stop being
 *  readable without the row itself changing, so the "changed since last time" pull misses it. Compare what this account can see
 *  with what this device holds: download what is missing, remove what is no longer allowed. */
async function reconcileTable(fid: string, g: number, name: 'journal' | 'journalMedia') {
  if (!sb) return
  const table = db.table(name)
  const { data, error } = await sb.from('records').select('rid').eq('family_id', fid).eq('tbl', name).eq('deleted', false).limit(5000)
  if (error || !data || g !== gen) return
  const visible = new Set(data.map((r) => Number(r.rid)))
  const pending = new Set((await db.outbox.toArray()).filter((o) => o.tbl === name).map((o) => Number(o.rid)))
  const local = new Set(((await table.toArray()) as { id: number }[]).map((e) => e.id))
  const stale = [...local].filter((id) => !visible.has(id) && !pending.has(id))
  const missing = [...visible].filter((id) => !local.has(id) && !pending.has(id))
  const rows: Record<string, unknown>[] = []
  for (let i = 0; i < missing.length; i += 100) {
    const { data: got, error: e2 } = await sb.from('records').select('rid,data').eq('family_id', fid).eq('tbl', name).eq('deleted', false).in('rid', missing.slice(i, i + 100).map(String))
    if (e2) return
    for (const r of got ?? []) if (r.data) rows.push(r.data as Record<string, unknown>)
  }
  if (g !== gen || (!stale.length && !rows.length)) return
  await db.transaction('rw', db.tables, async () => {
    ;(Dexie.currentTransaction as unknown as { remote: boolean }).remote = true
    if (stale.length) await table.bulkDelete(stale)
    if (rows.length) await table.bulkPut(rows)
  })
}
const reconcileJournal = async (fid: string, g: number) => { await reconcileTable(fid, g, 'journal'); await reconcileTable(fid, g, 'journalMedia') }

let busy = false
let again = false
async function cycle(fid: string) {
  if (busy) { again = true; return }
  busy = true
  const g = gen
  set({ state: 'syncing' })
  try {
    await push(fid)
    if (g !== gen) return
    await pull(fid, g)
    await reconcileJournal(fid, g)
    set({ state: 'ok', last: Date.now(), error: undefined, pending: await db.outbox.count() })
  } catch (e) {
    const offline = !navigator.onLine
    set({ state: offline ? 'offline' : 'error', error: offline ? undefined : (e as Error).message, pending: await db.outbox.count() })
  } finally {
    busy = false
    if (again) { again = false; void cycle(fid) }
  }
}

let stop: (() => void) | null = null
export function startSync(fid: string) {
  stopSync()
  const myGen = gen
  if (!sb) return
  const kick = () => void cycle(fid)
  let debounce: number | undefined
  const sub = (async () => {
    // watch the outbox so local edits go up within a moment
    const { liveQuery } = await import('dexie')
    return liveQuery(() => db.outbox.count()).subscribe((n) => {
      set({ pending: n })
      if (n > 0) { clearTimeout(debounce); debounce = window.setTimeout(kick, 800) }
    })
  })()
  const ch: RealtimeChannel = sb
    .channel(`records-${fid}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'records', filter: `family_id=eq.${fid}` }, (p) => {
      const r = (p.new && Object.keys(p.new).length ? p.new : null) as Rec | null
      if (r && myGen === gen) void apply([r])
    })
    .subscribe()
  const timer = window.setInterval(kick, 60000)
  window.addEventListener('online', kick)
  kick()
  stop = () => {
    clearInterval(timer); clearTimeout(debounce)
    window.removeEventListener('online', kick)
    void sb!.removeChannel(ch)
    void sub.then((s) => s.unsubscribe())
  }
}
export function stopSync() { gen++; stop?.(); stop = null; set({ state: 'off' }) }
export const syncNow = (fid: string) => cycle(fid)
