// Fetches a public calendar link (.ics) for a signed-in BindingTies user, because browsers can't read other sites' calendars directly.
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
const json = (b: unknown) => new Response(JSON.stringify(b), { headers: { ...cors, 'Content-Type': 'application/json' } })
const NOPE = 'That address is not allowed.'

const privateIp = (ip: string) =>
  /^(10\.|127\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.)/.test(ip) ||
  /^(::1?$|fc|fd|fe80|::ffff:)/i.test(ip)

async function safe(u: URL) {
  if (u.protocol !== 'https:') throw new Error('Only https calendar links are allowed.')
  const h = u.hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal') || (!h.includes('.') && !h.includes(':'))) throw new Error(NOPE)
  if (/^[\d.]+$/.test(h) || h.includes(':')) { if (privateIp(h)) throw new Error(NOPE); return }
  for (const type of ['A', 'AAAA'] as const) {
    let ips: string[] = []
    try { ips = await Deno.resolveDns(h, type) } catch { /* no records of this type */ }
    if (ips.some(privateIp)) throw new Error(NOPE)
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const { url } = await req.json()
    let u = new URL(String(url).replace(/^webcal(s?):\/\//i, 'https://'))
    for (let hop = 0; hop < 4; hop++) {
      await safe(u)
      const r = await fetch(u, { redirect: 'manual', signal: AbortSignal.timeout(10_000), headers: { Accept: 'text/calendar, text/plain, */*', 'User-Agent': 'BindingTies-calendar-reader' } })
      if (r.status >= 300 && r.status < 400 && r.headers.get('location')) { u = new URL(r.headers.get('location')!, u); continue }
      if (!r.ok) return json({ error: `The calendar site answered with an error (${r.status}).` })
      const text = await r.text()
      if (text.length > 3_000_000) return json({ error: 'That calendar is too large.' })
      return json({ text })
    }
    return json({ error: 'Too many redirects.' })
  } catch (e) { return json({ error: (e as Error).message || 'Could not read that calendar.' }) }
})
