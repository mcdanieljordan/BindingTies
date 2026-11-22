import { useCallback, useEffect, useState } from 'react'
import { UserPlus } from 'lucide-react'
import { approveMember, denyMember, pendingRequests, type Access, type JoinRequest } from './account'
import { useApp } from '../ctx'
import { useMembers } from '../lib/useData'
import { Modal } from '../components/ui'
import { Avatar } from '../lib/icons'

/** Shows people who asked to join with the family code. Only parents see it. */
export default function JoinRequests() {
  const { family, toast } = useApp()
  const members = useMembers()
  const [list, setList] = useState<JoinRequest[]>([])
  const [pick, setPick] = useState<JoinRequest | null>(null)
  const [person, setPerson] = useState<string>('')
  const [role, setRole] = useState<'parent' | 'member'>('member')
  const [access, setAccess] = useState<Access>('limited')
  const isParent = family?.status === 'approved' && family.role !== 'member'

  const load = useCallback(async () => { if (family && isParent) setList(await pendingRequests(family.id).catch(() => [])) }, [family, isParent])
  useEffect(() => { void load(); const t = setInterval(load, 15000); return () => clearInterval(t) }, [load])
  if (!family || !isParent || list.length === 0) return null

  const open = (r: JoinRequest) => { setPick(r); setPerson(''); setRole('member'); setAccess(r.requested_access ?? 'limited') }
  const choosePerson = (id: string) => { setPerson(id); const m = members.find((x) => String(x.id) === id); setRole(m && m.role !== 'child' ? 'parent' : 'member') }

  return (
    <>
      <div className="card" style={{ borderColor: 'var(--amber)', marginBottom: 14 }}>
        <div className="row"><UserPlus size={20} color="var(--amber)" /><h3>Someone wants to join your family</h3></div>
        <div className="stack" style={{ marginTop: 10 }}>
          {list.map((r) => (
            <div className="item" key={r.user_id}>
              <div className="grow"><div className="title" style={{ fontSize: 18 }}>{r.email}</div><div className="muted">Entered your family code • asked for {r.requested_access === 'full' ? 'Full' : 'Limited'} access</div></div>
              <button className="btn mint" onClick={() => open(r)}>Review</button>
              <button className="btn" onClick={async () => { if (confirm(`Say no to ${r.email}?`)) { await denyMember(family.id, r.user_id); void load() } }}>No</button>
            </div>
          ))}
        </div>
      </div>
      {pick && (
        <Modal title="Let them in?" onClose={() => setPick(null)}>
          <div className="stack">
            <div><b>{pick.email}</b> wants to join <b>{family.name}</b>.</div>
            <div className="muted">Only say yes if you know who this is. Which person in your family are they?</div>
            <div className="who-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))' }}>
              {members.map((m) => (
                <button key={m.id} className="who" style={{ fontSize: 17, padding: 12, borderColor: person === String(m.id) ? 'var(--mint)' : undefined }} onClick={() => choosePerson(String(m.id))}>
                  <Avatar icon={m.icon} color={m.color} size={52} />{m.name}
                </button>
              ))}
            </div>
            <button className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={() => { setPerson(''); }}>They are not on the list yet</button>
            <div className="seg" style={{ alignSelf: 'flex-start' }}>
              <button className={role === 'member' ? 'on' : ''} onClick={() => setRole('member')}>Family member</button>
              <button className={role === 'parent' ? 'on' : ''} onClick={() => setRole('parent')}>Parent (can approve others)</button>
            </div>
            {role !== 'parent' && (
              <div className="stack" style={{ gap: 4 }}>
                <b>What can they see?</b>
                <div className="seg" style={{ alignSelf: 'flex-start' }}>
                  <button className={access === 'limited' ? 'on' : ''} onClick={() => setAccess('limited')}>Limited</button>
                  <button className={access === 'full' ? 'on' : ''} onClick={() => setAccess('full')}>Full</button>
                </div>
                <span className="muted small">{access === 'limited' ? 'Only what they are named on, plus points, the team quest and shared lists.' : 'Everything, including medicine and the Learning vault.'}</span>
              </div>
            )}
            <button className="btn primary huge" onClick={async () => {
              try { await approveMember(family.id, pick.user_id, person ? Number(person) : null, role, access); toast({ title: 'Welcome!', body: `${pick.email} is in.` }); setPick(null); void load() }
              catch (e) { toast({ title: 'Could not approve', body: (e as Error).message, kind: 'warn' }) }
            }}>Yes, let them in</button>
          </div>
        </Modal>
      )}
    </>
  )
}
