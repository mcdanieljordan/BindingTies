import { useEffect, useState, useSyncExternalStore } from 'react'
import { Cloud, CloudOff, Copy, LogOut, RefreshCw, Bell } from 'lucide-react'
import { getStatus, subscribe, syncNow } from './engine'
import { denyMember, disablePush, enablePush, familyAccounts, pushActive, pushSupported, setMemberAccess, type FamilyAccount } from './account'
import { syncConfigured } from './client'
import { useApp } from '../ctx'
import { useMembers } from '../lib/useData'
import JoinRequests from './JoinRequests'
import { useSession } from './useSession'

export function useSyncStatus() { return useSyncExternalStore(subscribe, getStatus) }

/** Account area in Settings. Signing in happens on the front screen, not here. */
export default function SyncPanel() {
  const { toast, leaveFamily, family: fam } = useApp()
  const members = useMembers()
  const [accts, setAccts] = useState<FamilyAccount[]>([])
  const st = useSyncStatus()
  const session = useSession()
  const [push, setPush] = useState(false)
  const [busy, setBusy] = useState(false)

  const loadAccts = () => { if (fam?.status === 'approved') void familyAccounts(fam.id).then(setAccts).catch(() => {}) }
  useEffect(() => { void pushActive().then(setPush); loadAccts() }, [session.uid, fam?.id])

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
      {fam.role !== 'member' && <div className="item">
        <div className="grow"><div className="title">Family code</div><div className="muted">Give this to family members so they can join.</div></div>
        <b className="kbd" style={{ fontSize: 20 }}>{fam.invite_code}</b>
        <button className="btn sm" aria-label="Copy code" onClick={() => { void navigator.clipboard.writeText(fam.invite_code); toast({ title: 'Code copied' }) }}><Copy size={14} /></button>
      </div>}
      <JoinRequests />
      {fam.role !== 'member' && <div>
        <div className="muted" style={{ fontWeight: 800, marginBottom: 6 }}>Logins in this family</div>
        <div className="stack">
          {accts.map((a) => (
            <div className="item" key={a.user_id}>
              <div className="grow"><div className="title">{a.email}</div><div className="muted">{members.find((m) => m.id === a.member_id)?.name ?? 'Not linked to a person'} • {a.role === 'owner' ? 'Owner' : a.role === 'parent' ? 'Parent' : a.access === 'limited' ? 'Limited access' : 'Full access'}</div></div>
              {a.user_id !== session.uid && a.role === 'member' && fam.role !== 'member' && <button className="btn sm" onClick={async () => { await setMemberAccess(fam.id, a.user_id, a.access === 'limited' ? 'full' : 'limited'); loadAccts() }}>{a.access === 'limited' ? 'Give full access' : 'Make limited'}</button>}
              {a.user_id !== session.uid && a.role !== 'owner' && fam.role !== 'member' && <button className="btn ghost sm" onClick={async () => { if (confirm(`Remove ${a.email} from the family?`)) { await denyMember(fam.id, a.user_id); loadAccts() } }}>Remove</button>}
            </div>
          ))}
        </div>
      </div>}
      <div className="row">
        <button className="btn" onClick={() => void syncNow(fam.id)}><RefreshCw size={14} />Update now</button>
        <button className={`btn ${push ? '' : 'primary'}`} disabled={busy || !pushSupported()} onClick={async () => { setBusy(true); try { if (push) await disablePush(); else await enablePush(fam.id); setPush(await pushActive()) } catch (e) { toast({ title: 'Could not change alerts', body: (e as Error).message, kind: 'warn' }) } finally { setBusy(false) } }}><Bell size={14} />{push ? 'Turn off alerts on this device' : 'Turn on alerts on this device'}</button>
        <button className="btn ghost" onClick={() => { if (confirm('Sign out on this device? Your family\'s information stays safe in the cloud and comes back when you sign in.')) void leaveFamily() }}><LogOut size={14} />Sign out</button>
      </div>
      {!pushSupported() && <div className="muted small">Alerts need the installed app. On iPhone: tap Share, then Add to Home Screen, then open BindingTies from your Home Screen.</div>}
    </div>
  )
}
