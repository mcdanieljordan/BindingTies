import { useEffect, useState, useSyncExternalStore } from 'react'
import { Cloud, CloudOff, Copy, LogOut, RefreshCw, Bell } from 'lucide-react'
import { getStatus, subscribe, syncNow } from './engine'
import { disablePush, enablePush, pushActive, pushSupported, type FamilyInfo } from './account'
import { syncConfigured } from './client'
import { useApp } from '../ctx'
import { getKV } from '../db'
import { useSession } from './useSession'

export function useSyncStatus() { return useSyncExternalStore(subscribe, getStatus) }

/** Account area in Settings. Signing in happens on the front screen, not here. */
export default function SyncPanel() {
  const { toast, leaveFamily } = useApp()
  const st = useSyncStatus()
  const session = useSession()
  const [fam, setFam] = useState<FamilyInfo | null>(null)
  const [push, setPush] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => { void getKV<FamilyInfo | null>('sync:family', null).then(setFam); void pushActive().then(setPush) }, [session.uid])

  if (!syncConfigured) return <div className="muted">Cloud sharing is not turned on in this copy of the app.</div>
  if (!session.uid || !fam) return (
    <div className="stack">
      <div className="row"><CloudOff size={18} /><b>Not sharing with your family yet</b></div>
      <div className="muted">Sign in to share the calendar, routines and reminders with everyone at home.</div>
      <button className="btn primary" onClick={() => void leaveFamily()}>Sign in or join my family</button>
    </div>
  )

  const label = st.state === 'ok' ? 'Up to date' : st.state === 'syncing' ? 'Updating…' : st.state === 'offline' ? 'Offline, will catch up' : st.state === 'error' ? 'Problem' : 'Starting…'
  return (
    <div className="stack">
      <div className="row"><Cloud size={18} /><b>{fam.name}</b><span className={`chip ${st.state === 'ok' ? 'good' : st.state === 'error' ? 'bad' : 'warn'}`}>{label}{st.pending ? ` • ${st.pending} waiting` : ''}</span></div>
      {st.error && <div className="err">{st.error}</div>}
      <div className="muted">Signed in as {session.email}</div>
      <div className="item">
        <div className="grow"><div className="title">Family code</div><div className="muted">Give this to family members so they can join.</div></div>
        <b className="kbd" style={{ fontSize: 20 }}>{fam.invite_code}</b>
        <button className="btn sm" aria-label="Copy code" onClick={() => { void navigator.clipboard.writeText(fam.invite_code); toast({ title: 'Code copied' }) }}><Copy size={14} /></button>
      </div>
      <div className="row">
        <button className="btn" onClick={() => void syncNow(fam.id)}><RefreshCw size={14} />Update now</button>
        <button className={`btn ${push ? '' : 'primary'}`} disabled={busy || !pushSupported()} onClick={async () => { setBusy(true); try { if (push) await disablePush(); else await enablePush(fam.id); setPush(await pushActive()) } catch (e) { toast({ title: 'Could not change alerts', body: (e as Error).message, kind: 'warn' }) } finally { setBusy(false) } }}><Bell size={14} />{push ? 'Turn off alerts on this device' : 'Turn on alerts on this device'}</button>
        <button className="btn ghost" onClick={() => { if (confirm('Sign out on this device? Your family\'s information stays safe in the cloud and comes back when you sign in.')) void leaveFamily() }}><LogOut size={14} />Sign out</button>
      </div>
      {!pushSupported() && <div className="muted small">Alerts need the installed app. On iPhone: tap Share, then Add to Home Screen, then open FamilyOS from your Home Screen.</div>}
    </div>
  )
}
