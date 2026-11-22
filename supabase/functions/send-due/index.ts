// Runs every minute (pg_cron). Finds reminders that are due for each family and sends Web Push.
import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

interface Rec { tbl: string; rid: string; data: Record<string, any> }
interface Msg { key: string; title: string; body?: string; urgent?: boolean; who?: number[]; fullOnly?: boolean }

const hm = (s: string) => { const [h, m] = s.split(':').map(Number); return h * 60 + m }
const fmt12 = (s: string) => { const [h, m] = s.split(':').map(Number); return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}` }

function localParts(tz: string) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short' }).formatToParts(new Date()).map((x) => [x.type, x.value]))
  const dow = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday)
  return { today: `${p.year}-${p.month}-${p.day}`, dow, mins: Number(p.hour) * 60 + Number(p.minute) }
}
const dayOf = (d: string) => new Date(`${d}T00:00:00Z`)
function occursOn(e: Record<string, any>, date: string) {
  if (date < e.date) return false
  if (e.repeat === 'none' || !e.repeat) return e.date === date
  if (e.repeat === 'daily') return true
  if (e.repeat === 'weekly') return dayOf(e.date).getUTCDay() === dayOf(date).getUTCDay()
  return dayOf(e.date).getUTCDate() === dayOf(date).getUTCDate()
}

function buildMessages(fid: string, recs: Rec[], tz: string): Msg[] {
  const { today, dow, mins } = localParts(tz)
  const by = (t: string) => recs.filter((r) => r.tbl === t)
  const members = new Map(by('members').map((r) => [Number(r.rid), r.data.name as string]))
  const doses = by('doses').map((r) => r.data)
  const out: Msg[] = []

  for (const { rid, data: e } of by('events')) {
    if (!e.start || !e.remindMin || !occursOn(e, today)) continue
    const at = hm(e.start) - e.remindMin
    if (mins >= at && mins < at + 5) out.push({ key: `ev:${fid}:${rid}:${today}`, title: `Coming up: ${e.title}`, body: `Starts at ${fmt12(e.start)}`, who: (e.memberIds ?? []).map(Number) })
  }
  for (const { rid, data: a } of by('alarms')) {
    if (!a.enabled || !a.time) continue
    if ((!a.days?.length || a.days.includes(dow)) && mins >= hm(a.time) && mins < hm(a.time) + 3)
      out.push({ key: `al:${fid}:${rid}:${today}:${a.time}`, title: `⏰ ${a.label}`, body: fmt12(a.time), urgent: true })
  }
  const nowMs = Date.now()
  for (const { rid, data: t } of by('timers')) {
    if (!t.done && nowMs >= t.endsAt && nowMs - t.endsAt < 10 * 60000) out.push({ key: `tm:${fid}:${rid}:${t.endsAt}`, title: `⏱ ${t.label}`, body: 'Time is up!', urgent: true })
  }
  for (const { rid, data: m } of by('meds')) {
    if (!m.active) continue
    const who = members.get(Number(m.memberId)) ?? ''
    for (const time of m.times ?? []) {
      if (doses.some((d) => String(d.medId) === rid && d.date === today && d.time === time)) continue
      const late = mins - hm(time)
      if (late >= 0 && late <= 30) out.push({ key: `med:${fid}:${rid}:${today}:${time}:${Math.floor(late / 10)}`, title: `💊 ${m.name} for ${who}`, body: `${m.dose ?? ''} due at ${fmt12(time)}. Mark it given in FamilyOS.`, urgent: true, fullOnly: true })
      else if (late > 30 && late <= 120) out.push({ key: `medesc:${fid}:${rid}:${today}:${time}`, title: `Not logged yet: ${m.name} for ${who}`, body: `Due at ${fmt12(time)}. Has someone already given it? Check before giving another dose.`, urgent: true, fullOnly: true })
    }
  }
  return out
}

Deno.serve(async (req) => {
  const { data: cfgRows } = await sb.from('server_config').select('key,value')
  const cfg = Object.fromEntries((cfgRows ?? []).map((r) => [r.key, r.value]))
  if (!cfg.cron_secret || req.headers.get('x-cron-secret') !== cfg.cron_secret) return new Response('forbidden', { status: 403 })
  const priv = Deno.env.get('VAPID_PRIVATE_KEY')
  if (!priv || !cfg.vapid_public) return new Response('VAPID keys not configured', { status: 500 })
  webpush.setVapidDetails(cfg.vapid_subject ?? 'mailto:noreply@example.com', cfg.vapid_public, priv)

  const { data: subs } = await sb.from('push_subscriptions').select('id,user_id,family_id,endpoint,p256dh,auth')
  const famIds = [...new Set((subs ?? []).map((s) => s.family_id))]
  let sent = 0, failed = 0
  for (const fid of famIds) {
    const { data: fam } = await sb.from('families').select('tz').eq('id', fid).single()
    const { data: recs } = await sb.from('records').select('tbl,rid,data').eq('family_id', fid).eq('deleted', false).in('tbl', ['events', 'alarms', 'meds', 'timers', 'doses', 'members'])
    const msgs = buildMessages(fid, (recs ?? []) as Rec[], fam?.tz ?? 'America/Chicago')
    if (!msgs.length) continue
    // dedupe: only messages whose key we have not sent before
    const { data: fresh } = await sb.from('push_log').upsert(msgs.map((m) => ({ key: m.key })), { onConflict: 'key', ignoreDuplicates: true }).select('key')
    const freshKeys = new Set((fresh ?? []).map((r) => r.key))
    const { data: mem } = await sb.from('family_members').select('user_id,status,role,access,member_id').eq('family_id', fid)
    const who = new Map((mem ?? []).map((r) => [r.user_id as string, r as { status: string; role: string; access: string; member_id: number | null }]))
    // Full accounts hear everything; Limited accounts only hear about things they are named on, never medicine
    const wants = (uid: string, m: Msg) => {
      const r = who.get(uid)
      if (!r || r.status !== 'approved') return false
      if (r.role !== 'member' || r.access === 'full') return true
      if (m.fullOnly) return false
      return !m.who || (r.member_id != null && m.who.includes(Number(r.member_id)))
    }
    for (const m of msgs.filter((x) => freshKeys.has(x.key))) {
      for (const s of (subs ?? []).filter((x) => x.family_id === fid && wants(x.user_id, m))) {
        try {
          await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify({ title: m.title, body: m.body, tag: m.key, urgent: m.urgent, url: '/' }), { TTL: 3600, urgency: 'high' })
          sent++
        } catch (e) {
          failed++
          const code = (e as { statusCode?: number }).statusCode
          if (code === 404 || code === 410) await sb.from('push_subscriptions').delete().eq('id', s.id)
        }
      }
    }
  }
  return new Response(JSON.stringify({ families: famIds.length, sent, failed }), { headers: { 'Content-Type': 'application/json' } })
})
