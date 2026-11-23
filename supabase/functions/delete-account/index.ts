// Deletes the signed-in person's account (Google Play and Apple both require this).
//  * If they are the LAST parent sign-in in a family, the whole family is deleted: records, files, links, invites.
//  * Otherwise only their sign-in goes, plus their own private journal entries and files. The family and everyone else stay.
// The caller must be signed in (verify_jwt) and must send {"confirm":"DELETE"}.
import { createClient } from 'npm:@supabase/supabase-js@2'

const url = Deno.env.get('SUPABASE_URL')!
const sb = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
const BUCKET = 'family-files'
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'content-type, authorization, apikey, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
const reply = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

async function removeFolder(prefix: string) {
  for (let pass = 0; pass < 50; pass++) { // the guard stops a loop if a file ever refuses to go
    const { data: items } = await sb.storage.from(BUCKET).list(prefix, { limit: 1000 })
    if (!items?.length) return
    const files = items.filter((i) => i.id).map((i) => `${prefix}/${i.name}`)
    if (files.length) await sb.storage.from(BUCKET).remove(files)
    for (const d of items.filter((i) => !i.id)) await removeFolder(`${prefix}/${d.name}`)
    if (!files.length) return
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return reply({ error: 'Use POST' }, 405)
  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  const { data: u } = await sb.auth.getUser(jwt)
  const uid = u?.user?.id
  if (!uid) return reply({ error: 'Please sign in again.' }, 401)
  let body: { confirm?: string } = {}
  try { body = await req.json() } catch { /* empty */ }
  if (body.confirm !== 'DELETE') return reply({ error: 'Confirmation is missing.' }, 400)

  const summary = { familiesDeleted: 0, left: 0, filesRemoved: 0 }
  const { data: mine } = await sb.from('family_members').select('family_id,status,member_id,role').eq('user_id', uid)
  for (const m of mine ?? []) {
    const fid = m.family_id as string
    const isParent = m.role === 'owner' || m.role === 'parent'
    const { count } = await sb.from('family_members').select('user_id', { count: 'exact', head: true }).eq('family_id', fid).eq('status', 'approved').in('role', ['owner', 'parent']).neq('user_id', uid)
    if (m.status === 'approved' && isParent && !count) {
      await removeFolder(fid)
      await sb.from('families').delete().eq('id', fid) // cascades records, invites, sitter links, push subscriptions
      summary.familiesDeleted++
      continue
    }
    if (m.status === 'approved' && m.member_id != null) {
      // leave the family: remove this person's private journal entries and the files attached to them
      const { data: rows } = await sb.from('records').select('tbl,rid,data').eq('family_id', fid).in('tbl', ['journal', 'journalMedia']).eq('deleted', false)
      const mine2 = (rows ?? []).filter((r) => Number((r.data as { ownerMemberId?: unknown } | null)?.ownerMemberId) === Number(m.member_id))
      const files = mine2.filter((r) => r.tbl === 'journalMedia').map((r) => `${fid}/journalMedia/${r.rid}`)
      if (files.length) { await sb.storage.from(BUCKET).remove(files); summary.filesRemoved += files.length }
      for (const r of mine2) await sb.from('records').update({ data: null, deleted: true }).eq('family_id', fid).eq('tbl', r.tbl).eq('rid', r.rid)
    }
    summary.left++
  }
  const { error } = await sb.auth.admin.deleteUser(uid) // also removes their membership rows and notification subscriptions
  if (error) return reply({ error: 'Could not finish deleting the account. Please try again.' }, 500)
  return reply({ ok: true, ...summary })
})
