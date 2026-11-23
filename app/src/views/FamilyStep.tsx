import { useState } from 'react'
import { Users, KeyRound } from 'lucide-react'
import { createFamily, joinFamily, signOut, type Access, type FamilyInfo } from '../sync/account'
import { db, wipeLocal } from '../db'

export default function FamilyStep({ email, onDone }: { email?: string; onDone: (f: FamilyInfo, joined: boolean) => void }) {
  const [name, setName] = useState('Our family')
  const [code, setCode] = useState('')
  const [access, setAccess] = useState<Access>('limited')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function create() {
    setBusy(true); setErr('')
    try { onDone(await createFamily(name), false) } catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }
  async function join() {
    setBusy(true); setErr('')
    try {
      const f = await joinFamily(code, access)
      // anything already on this device would mix with the family's data
      if ((await db.members.count()) > 0) await wipeLocal()
      onDone(f, true)
    } catch (e) { setErr(/not found/i.test((e as Error).message) ? 'We could not find that code. Please check it and try again.' : (e as Error).message) } finally { setBusy(false) }
  }

  return (
    <div className="gate">
      <div className="gate-card">
        <div className="gate-logo"><Users size={38} strokeWidth={2.4} /></div>
        <h1>Your family</h1>
        <p>Is someone in your home already using BindingTies?</p>

        <div className="card" style={{ boxShadow: 'none', background: 'var(--panel2)' }}>
          <h2 style={{ fontSize: 22 }}>Yes, I have a code</h2>
          <p style={{ textAlign: 'left', fontSize: 16, margin: '6px 0 12px' }}>Ask them to open <b>Settings</b> and read you the family code.</p>
          <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="Family code" aria-label="Family code" autoCapitalize="characters" style={{ textAlign: 'center', letterSpacing: 4, fontWeight: 800 }} />
          <div className="stack" style={{ gap: 4, marginTop: 12, textAlign: 'left' }}>
            <b style={{ fontSize: 16 }}>What do you need?</b>
            <div className="seg" style={{ alignSelf: 'stretch' }}>
              <button type="button" className={access === 'limited' ? 'on' : ''} onClick={() => setAccess('limited')}>Limited</button>
              <button type="button" className={access === 'full' ? 'on' : ''} onClick={() => setAccess('full')}>Full family</button>
            </div>
            <span className="muted" style={{ fontSize: 14 }}>{access === 'limited' ? 'Just what you are named on: your events, routines and points.' : 'Everything, like a parent would see. A parent has to approve this.'}</span>
          </div>
          <button className="btn primary huge" style={{ marginTop: 12 }} disabled={busy || code.trim().length < 4} onClick={join}><KeyRound size={20} />Join my family</button>
        </div>

        <div className="card" style={{ boxShadow: 'none', background: 'var(--panel2)' }}>
          <h2 style={{ fontSize: 22 }}>No, I'm the first</h2>
          <input value={name} onChange={(e) => setName(e.target.value)} aria-label="Family name" style={{ marginTop: 10 }} />
          <button className="btn mint huge" style={{ marginTop: 12 }} disabled={busy || !name.trim()} onClick={create}>Start our family</button>
        </div>

        {err && <div className="err" role="alert">{err}</div>}
        <button className="link gate-link" style={{ background: 'none', border: 0, color: 'var(--muted)', fontSize: 15, textDecoration: 'underline', cursor: 'pointer' }} onClick={() => signOut()}>Not {email ?? 'you'}? Sign out</button>
      </div>
    </div>
  )
}
