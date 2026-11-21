import { useEffect } from 'react'
import { Hourglass } from 'lucide-react'
import { myFamily, signOut, type FamilyInfo } from '../sync/account'

export default function Pending({ fam, email, onUpdate }: { fam: FamilyInfo; email?: string; onUpdate: (f: FamilyInfo | null) => void }) {
  useEffect(() => {
    const check = () => myFamily().then((f) => onUpdate(f)).catch(() => {})
    const t = setInterval(check, 4000)
    return () => clearInterval(t)
  }, [onUpdate])
  return (
    <div className="gate">
      <div className="gate-card">
        <div className="gate-logo"><Hourglass size={36} /></div>
        <h1>Waiting for a parent to say yes</h1>
        <p>You asked to join <b>{fam.name}</b>. A parent in the family needs to tap <b>Approve</b> in their app. This page will update by itself.</p>
        <div className="ok" role="status">Signed in as {email ?? 'you'}. You can close this and come back later.</div>
        <button className="btn huge" onClick={async () => { await signOut(); onUpdate(null) }}>Cancel and sign out</button>
      </div>
    </div>
  )
}
