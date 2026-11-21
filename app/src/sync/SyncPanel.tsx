import { useEffect, useState, useSyncExternalStore } from 'react'
import { Cloud, CloudOff, Copy, LogOut, RefreshCw, Bell } from 'lucide-react'
import { getStatus, subscribe, startSync, stopSync, syncNow } from './engine'
import { createFamily, currentUser, disablePush, enablePush, joinFamily, myFamily, pushActive, pushSupported, signIn, signOut, signUp, type FamilyInfo } from './account'
import { syncConfigured } from './client'
import { useApp } from '../ctx'
import { getKV, setKV } from '../db'

export function useSyncStatus() { return useSyncExternalStore(subscribe, getStatus) }

/** Starts syncing whenever this device is signed in and attached to a family. */
export async function bootSync() {
  if (!syncConfigured) return
  const u = await currentUser()
  if (!u) return
  const fam = (await getKV<FamilyInfo | null>('sync:family', null)) ?? (await myFamily().catch(() => null))
  if (fam) { await setKV('sync:family', fam); startSync(fam.id) }
}

export default function SyncPanel() {
  const { toast } = useApp()
  const st = useSyncStatus()
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [user, setUser] = useState<string | null>(null)
  const [fam, setFam] = useState<FamilyInfo | null>(null)
  const [code, setCode] = useState('')
  const [fname, setFname] = useState('Our family')
  const [push, setPush] = useState(false)
  const [busy, setBusy] = useState(false)
  const [mode, setMode] = useState<'new' | 'in'>('new')

  async function refresh() {
    const u = await currentUser()
    setUser(u?.email ?? null)
    if (u) { const f = await getKV<FamilyInfo | null>('sync:family', null); setFam(f); setPush(await pushActive()) }
  }
  useEffect(() => { void refresh() }, [])

  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    try { await fn() } catch (e) {
      const m = (e as Error).message
      const friendly = /invalid login/i.test(m) ? "That email and password don't match an account yet. If this is your first time, choose \"Create account\" first." : /already registered/i.test(m) ? 'That email already has an account. Choose "Sign in" instead.' : /rate limit/i.test(m) ? 'Too many emails sent recently. Wait a few minutes and try again.' : m
      toast({ title: 'Could not continue', body: friendly, kind: 'warn' })
    } finally { setBusy(false) }
  }
  const attach = async (f: FamilyInfo) => { await setKV('sync:family', f); setFam(f); startSync(f.id) }

  if (!syncConfigured) return (
    <div className="card" style={{ background: 'var(--panel2)', boxShadow: 'none' }}>
      <b><CloudOff size={15} style={{ verticalAlign: -2 }} /> Family sync is not set up yet</b>
      <div className="muted small" style={{ marginTop: 4 }}>This device keeps everything locally. Add the backend settings (see app/.env.example) to share one family across phones and get background reminders.</div>
    </div>
  )

  return (
    <div className="stack">
      <div className="row"><Cloud size={18} /><b>Family sync &amp; push</b>
        {fam && <span className={`chip ${st.state === 'ok' ? 'good' : st.state === 'error' ? 'bad' : 'warn'}`}>{st.state === 'ok' ? 'Up to date' : st.state === 'syncing' ? 'Syncing…' : st.state === 'offline' ? 'Offline (will catch up)' : st.state === 'error' ? 'Problem' : 'Starting'}{st.pending ? ` • ${st.pending} waiting` : ''}</span>}</div>
      {st.error && <div className="muted small" style={{ color: 'var(--danger)' }}>{st.error}</div>}

      {!user && (
        <div className="stack">
          <div className="seg" style={{ alignSelf: 'flex-start' }}>
            <button className={mode === 'new' ? 'on' : ''} onClick={() => setMode('new')}>New here: create account</button>
            <button className={mode === 'in' ? 'on' : ''} onClick={() => setMode('in')}>I already have one: sign in</button>
          </div>
          <div className="row"><input style={{ flex: 1 }} type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /><input style={{ flex: 1 }} type="password" placeholder={mode === 'new' ? 'Make up a password (8+ characters)' : 'Your password'} value={pw} onChange={(e) => setPw(e.target.value)} autoComplete={mode === 'new' ? 'new-password' : 'current-password'} /></div>
          <div className="row">
            <button className="btn primary" disabled={busy || !email || pw.length < 8} onClick={() => run(async () => {
              if (mode === 'new') { const r = await signUp(email, pw); if (!r.session) { toast({ title: 'Check your email', body: 'Click the confirmation link, then come back here and choose "I already have one: sign in".' }); setMode('in'); return } }
              else await signIn(email, pw)
              await refresh(); const f = await myFamily().catch(() => null); if (f) await attach(f)
            })}>{mode === 'new' ? 'Create account' : 'Sign in'}</button>
          </div>
          <div className="muted small">Only parents get accounts. Children are profiles inside your family, with no email and no tracking.</div>
        </div>
      )}

      {user && !fam && (
        <div className="stack">
          <div className="muted">Signed in as {user}. Start your family or join one with an invite code.</div>
          <div className="row"><input style={{ flex: 1 }} value={fname} onChange={(e) => setFname(e.target.value)} /><button className="btn primary" disabled={busy} onClick={() => run(async () => attach(await createFamily(fname)))}>Create family</button></div>
          <div className="row"><input style={{ flex: 1 }} placeholder="Invite code" value={code} onChange={(e) => setCode(e.target.value)} /><button className="btn" disabled={busy || code.length < 4} onClick={() => run(async () => attach(await joinFamily(code)))}>Join</button></div>
          <button className="btn ghost sm" onClick={() => run(async () => { await signOut(); await refresh() })}><LogOut size={14} />Sign out</button>
        </div>
      )}

      {user && fam && (
        <div className="stack">
          <div className="item"><div className="grow"><div className="title">{fam.name}</div><div className="muted">Signed in as {user}</div></div>
            <span className="chip">Invite code: <b className="kbd">{fam.invite_code}</b></span>
            <button className="btn ghost sm" aria-label="Copy code" onClick={() => navigator.clipboard.writeText(fam.invite_code)}><Copy size={14} /></button></div>
          <div className="row">
            <button className="btn" onClick={() => void syncNow(fam.id)}><RefreshCw size={14} />Sync now</button>
            <button className={`btn ${push ? '' : 'primary'}`} disabled={busy || !pushSupported()} onClick={() => run(async () => { if (push) await disablePush(); else await enablePush(fam.id); setPush(await pushActive()) })}><Bell size={14} />{push ? 'Turn off push on this device' : 'Turn on push on this device'}</button>
            <button className="btn ghost" onClick={() => run(async () => { stopSync(); await signOut(); await setKV('sync:family', null); await setKV('sync:cursor', '1970-01-01T00:00:00Z'); await refresh() })}><LogOut size={14} />Sign out</button>
          </div>
          {!pushSupported() && <div className="muted small">Push needs the installed app. On iPhone: Share, then Add to Home Screen, then open FamilyOS from there.</div>}
          <div className="muted small">Pushed to every signed-in parent device: event reminders, alarms, timers, medicine due, and "dose not logged yet" if nobody has marked it given 30 minutes later.</div>
        </div>
      )}
    </div>
  )
}
