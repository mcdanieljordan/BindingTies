import { db, getKV, setKV, type EventItem } from '../db'
import { sb } from '../sync/client'
import { parseIcs, type IcsEvent, type IcsResult } from './ics'

export interface Feed { url: string; name: string; memberIds: number[] }

export const normalizeUrl = (u: string) => u.trim().replace(/^webcal(s?):\/\//i, 'https://')
export const getFeeds = () => getKV<Feed[]>('feeds', [])

/** Calendar servers don't allow browsers to read them directly, so the request goes through our own function. */
export async function fetchIcs(url: string): Promise<string> {
  const u = normalizeUrl(url)
  if (!/^https:\/\//i.test(u)) throw new Error('That does not look like a calendar link. It should start with https:// or webcal://')
  if (sb) {
    const { data, error } = await sb.functions.invoke('ics-proxy', { body: { url: u } })
    if (error) throw new Error('Could not reach the calendar. Check the link and try again.')
    if (data?.error) throw new Error(data.error as string)
    return data.text as string
  }
  const r = await fetch(u)
  if (!r.ok) throw new Error('Could not open that calendar link.')
  return r.text()
}

export async function loadFeed(url: string): Promise<IcsResult> {
  const text = await fetchIcs(url)
  if (!/BEGIN:VCALENDAR/i.test(text)) throw new Error('That link did not return a calendar.')
  return parseIcs(text)
}

// same file or link always produces the same ids, so importing twice (or from two phones) never duplicates
function eventId(source: string, key: string) {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57
  const s = source + '\n' + key
  for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677) }
  return ((h1 >>> 0) % 2 ** 21) * 2 ** 27 + ((h2 >>> 0) % 2 ** 27) + 1
}

/** Saves events. Anyone already tagged on an existing event is left alone. Returns what changed. */
export async function saveEvents(events: IcsEvent[], source: string, memberIds: number[], isFeed: boolean) {
  let added = 0, updated = 0
  const ids = new Set<number>()
  const puts: EventItem[] = []
  for (const ev of events) {
    const id = eventId(source, ev.key)
    ids.add(id)
    const old = await db.events.get(id)
    const rec: EventItem = { id, title: ev.title, date: ev.date, start: ev.start, end: ev.end, remindMin: ev.remindMin, repeat: ev.repeat, notes: ev.notes, memberIds: old ? old.memberIds : memberIds, driverId: old?.driverId, feed: isFeed ? source : undefined }
    if (!old) { added++; puts.push(rec) }
    else if (old.title !== rec.title || old.date !== rec.date || old.start !== rec.start || old.end !== rec.end || old.repeat !== rec.repeat || old.notes !== rec.notes || old.remindMin !== rec.remindMin) { updated++; puts.push(rec) }
  }
  if (puts.length) await db.events.bulkPut(puts)
  let removed = 0
  if (isFeed) {
    const stale = (await db.events.toArray()).filter((e) => e.feed === source && !ids.has(e.id)).map((e) => e.id)
    if (stale.length) { await db.events.bulkDelete(stale); removed = stale.length }
  }
  return { added, updated, removed }
}

export async function subscribe(feed: Feed, events: IcsEvent[]) {
  const feeds = await getFeeds()
  await setKV('feeds', [...feeds.filter((f) => f.url !== feed.url), feed])
  const r = await saveEvents(events, feed.url, feed.memberIds, true)
  markSynced(feed.url)
  return r
}
export async function unsubscribe(url: string) {
  await setKV('feeds', (await getFeeds()).filter((f) => f.url !== url))
  const ids = (await db.events.toArray()).filter((e) => e.feed === url).map((e) => e.id)
  if (ids.length) await db.events.bulkDelete(ids)
}

const LAST = 'fos-feeds-last'
const lastMap = (): Record<string, number> => { try { return JSON.parse(localStorage.getItem(LAST) ?? '{}') } catch { return {} } }
const markSynced = (url: string) => { try { localStorage.setItem(LAST, JSON.stringify({ ...lastMap(), [url]: Date.now() })) } catch { /* ignore */ } }

/** Re-reads subscribed calendars. Quiet: a feed that is down just keeps its old events. */
export async function refreshFeeds(force = false) {
  const last = lastMap()
  for (const f of await getFeeds()) {
    if (!force && Date.now() - (last[f.url] ?? 0) < 6 * 3600_000) continue
    try {
      const res = await loadFeed(f.url)
      await saveEvents(res.events, f.url, f.memberIds, true)
      markSynced(f.url)
    } catch { /* try again next time */ }
  }
}
