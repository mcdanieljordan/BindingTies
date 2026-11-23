// Public, read-only view for a sitter link. No sign-in: the random token in the link IS the permission.
// It only ever returns a whitelist of fields (never insurance IDs, birth dates, or anything the family did not choose to share),
// only while the link is active, and a wrong / expired / turned-off token always gets the same plain "expired" answer.
import { createClient } from 'npm:@supabase/supabase-js@2'

const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'content-type, authorization, apikey, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
const reply = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })
const gone = () => reply({ error: 'expired' }, 404)

const sha256 = async (t: string) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t)))].map((b) => b.toString(16).padStart(2, '0')).join('')
const str = (v: unknown, max = 2000) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined)
const num = (v: unknown) => (typeof v === 'number' && isFinite(v) ? v : undefined)

const dayOf = (d: string) => new Date(`${d}T00:00:00Z`)
const addDays = (d: string, n: number) => { const x = dayOf(d); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10) }
function localDate(tz: string, at = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(at).map((x) => [x.type, x.value]))
  return `${p.year}-${p.month}-${p.day}`
}
function occursOn(e: Record<string, any>, date: string) {
  if (typeof e.date !== 'string' || date < e.date) return false
  if (e.repeat === 'none' || !e.repeat) return e.date === date
  if (e.repeat === 'daily') return true
  if (e.repeat === 'weekly') return Array.isArray(e.days) && e.days.length ? e.days.map(Number).includes(dayOf(date).getUTCDay()) : dayOf(e.date).getUTCDay() === dayOf(date).getUTCDay()
  return dayOf(e.date).getUTCDate() === dayOf(date).getUTCDate()
}
function timesOn(e: Record<string, any>, date: string): { start?: string; end?: string } {
  const t = e.repeat === 'weekly' && Array.isArray(e.days) && e.days.length ? e.dayTimes?.[String(dayOf(date).getUTCDay())] : undefined
  return t?.start ? { start: t.start, end: t.end || undefined } : { start: e.start, end: e.end }
}
const contacts = (v: unknown) => (Array.isArray(v) ? v : []).slice(0, 12).map((c: any) => ({ name: str(c?.name, 80), relation: str(c?.relation, 80), phone: str(c?.phone, 40) })).filter((c) => c.name || c.phone)

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return gone()
  let token = ''
  try { token = String((await req.json())?.token ?? '') } catch { return gone() }
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return gone()

  const { data: pass } = await sb.from('sitter_passes').select('*').eq('token_hash', await sha256(token)).is('revoked_at', null).gt('expires_at', new Date().toISOString()).maybeSingle()
  if (!pass) return gone()

  const fid = pass.family_id as string
  const ids: number[] = (pass.member_ids ?? []).map(Number)
  const opts = (pass.options ?? {}) as Record<string, boolean>
  const { data: fam } = await sb.from('families').select('tz').eq('id', fid).single()
  const tz = fam?.tz ?? 'America/Chicago'
  const { data: recs } = await sb.from('records').select('tbl,rid,data').eq('family_id', fid).eq('deleted', false).in('tbl', ['members', 'emergency', 'meds', 'events', 'routines'])
  const by = (t: string) => (recs ?? []).filter((r) => r.tbl === t && r.data)
  const members = new Map(by('members').map((r) => [Number(r.rid), r.data as Record<string, any>]))
  const name = (id: unknown) => str(members.get(Number(id))?.name, 60)

  const em = (id: number) => by('emergency').find((r) => Number(r.rid) === id)?.data as Record<string, any> | undefined
  const house = em(0)
  const people = ids.filter((id) => members.has(id)).map((id) => {
    const m = members.get(id)!, e = em(id) ?? {}
    return {
      name: str(m.name, 60), age: num(m.age), blood: str(e.blood, 20), allergies: str(e.allergies), conditions: str(e.conditions), otherMeds: str(e.otherMeds),
      doctor: str(e.doctor, 120), doctorPhone: str(e.doctorPhone, 40), notes: str(e.notes), contacts: contacts(e.contacts),
      meds: opts.meds ? by('meds').filter((r) => Number(r.data!.memberId) === id && r.data!.active).map((r) => ({ name: str(r.data!.name, 80), dose: str(r.data!.dose, 80), times: Array.isArray(r.data!.times) ? r.data!.times.filter((t: unknown) => typeof t === 'string').slice(0, 12) : [], notes: str(r.data!.notes, 200) })) : [],
      routines: opts.routines ? by('routines').filter((r) => Number(r.data!.memberId) === id).map((r) => ({ name: str(r.data!.name, 80), block: str(r.data!.block, 20), steps: (Array.isArray(r.data!.steps) ? r.data!.steps : []).map((s: any) => str(s?.title, 80)).filter(Boolean) })) : [],
    }
  })

  const today = localDate(tz)
  const last = [addDays(today, 6), localDate(tz, new Date(pass.expires_at))].sort()[0]
  const schedule: Record<string, unknown>[] = []
  if (opts.schedule) {
    for (let d = today; d <= last; d = addDays(d, 1)) {
      for (const r of by('events')) {
        const e = r.data as Record<string, any>
        const who = (Array.isArray(e.memberIds) ? e.memberIds : []).map(Number)
        if (!occursOn(e, d) || (who.length && !who.some((w: number) => ids.includes(w)))) continue
        schedule.push({ date: d, title: str(e.title, 120), start: str(timesOn(e, d).start, 5), end: str(timesOn(e, d).end, 5), notes: str(e.notes, 200), who: who.map(name).filter(Boolean), driver: name(e.driverId) })
      }
    }
    schedule.sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.start ?? '').localeCompare(String(b.start ?? '')))
  }

  await sb.from('sitter_passes').update({ last_viewed_at: new Date().toISOString(), view_count: (pass.view_count ?? 0) + 1 }).eq('id', pass.id)

  return reply({
    label: str(pass.label, 60), expiresAt: pass.expires_at, generatedAt: new Date().toISOString(), tz, today, notes: str(pass.notes),
    household: {
      address: opts.address === false ? undefined : str(house?.address), poison: str(house?.poison, 40) ?? '1-800-222-1222', hospital: str(house?.hospital, 120), hospitalPhone: str(house?.hospitalPhone, 40),
      houseNotes: str(house?.houseNotes), contacts: contacts(house?.contacts),
    },
    people, schedule,
  })
})
