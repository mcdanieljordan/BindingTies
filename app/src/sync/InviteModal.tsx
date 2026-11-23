import { useEffect, useState } from 'react'
import { Copy, Mail, MessageSquare, Share2, UserPlus } from 'lucide-react'
import { Modal } from '../components/ui'
import { useApp } from '../ctx'
import { createInvite, inviteLink, listInvites, revokeInvite, type Access, type Invite } from './account'
import type { Member } from '../db'

/** Parent-only: make a personal invite link for one person, optionally tied to their email. */
export default function InviteModal({ person, onClose }: { person: Member; onClose: () => void }) {
  const { family, toast } = useApp()
  const [email, setEmail] = useState('')
  const [access, setAccess] = useState<Access>(person.role === 'parent' ? 'full' : 'limited')
  const [inv, setInv] = useState<Invite | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    if (!family) return
    void listInvites(family.id).then((l) => { const mine = l.find((x) => x.member_id === person.id); if (mine) { setInv(mine); setEmail(mine.email ?? ''); setAccess(mine.access) } }).catch(() => {})
  }, [family, person.id])
  if (!family) return null

  const role = person.role === 'parent' ? 'parent' : 'member'
  const link = inv ? inviteLink(inv.token) : ''
  const msg = `${person.name}, you're invited to join ${family.name} on BindingTies. Tap this link and sign in with Google or an email and password: ${link}`

  async function make() {
    setBusy(true); setErr('')
    try { setInv(await createInvite(family!.id, person.id, email, role === 'parent' ? 'full' : access, role) as Invite) } catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }
  const share = async () => {
    try { if (navigator.share) await navigator.share({ title: 'BindingTies invite', text: msg }); else { await navigator.clipboard.writeText(msg); toast({ title: 'Message copied' }) } } catch { /* cancelled */ }
  }

  return (
    <Modal title={`Invite ${person.name}`} onClose={onClose}>
      <div className="stack">
        {!inv && (
          <>
            <div className="muted">{person.name} gets their own login. Google or an email and password both work, and a Gmail account can use either way.</div>
            <label className="stack" style={{ gap: 4 }}>
              <b>Their email (optional)</b>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@gmail.com" autoCapitalize="none" />
              <span className="muted small">If you add it, they join automatically when they sign in with that email, no link needed.</span>
            </label>
            {role !== 'parent' && (
              <div className="stack" style={{ gap: 4 }}>
                <b>What can they see?</b>
                <div className="seg" style={{ alignSelf: 'flex-start' }}>
                  <button className={access === 'limited' ? 'on' : ''} onClick={() => setAccess('limited')}>Limited</button>
                  <button className={access === 'full' ? 'on' : ''} onClick={() => setAccess('full')}>Full</button>
                </div>
                <span className="muted small">{access === 'limited' ? 'Only events and routines they are named on, their points, the team quest and shared lists. No medicine, school records or other people\'s private items.' : 'Everything in the family, including medicine and the Learning vault.'}</span>
              </div>
            )}
            {role === 'parent' && <div className="muted small">Parents always get full access and can approve other people.</div>}
            {err && <div className="err" role="alert">{err}</div>}
            <button className="btn primary huge" disabled={busy} onClick={make}><UserPlus size={18} />Make {person.name}'s invite</button>
          </>
        )}
        {inv && (
          <>
            <div className="ok">Invite ready for <b>{person.name}</b> ({inv.access === 'full' ? 'Full' : 'Limited'} access{inv.email ? `, ${inv.email}` : ''}).</div>
            <div className="muted">Send them this link. It works once and expires in 30 days.</div>
            <input readOnly value={link} onFocus={(e) => e.currentTarget.select()} aria-label="Invite link" />
            <div className="row" style={{ flexWrap: 'wrap' }}>
              <a className="btn mint" href={`sms:?&body=${encodeURIComponent(msg)}`}><MessageSquare size={16} />Text</a>
              <a className="btn" href={`mailto:${encodeURIComponent(inv.email ?? '')}?subject=${encodeURIComponent(`Join ${family.name} on BindingTies`)}&body=${encodeURIComponent(msg)}`}><Mail size={16} />Email</a>
              <button className="btn" onClick={share}><Share2 size={16} />Share…</button>
              <button className="btn" onClick={() => { void navigator.clipboard.writeText(link); toast({ title: 'Link copied' }) }}><Copy size={16} />Copy</button>
            </div>
            <button className="btn ghost sm" style={{ alignSelf: 'flex-start' }} onClick={async () => { await revokeInvite(inv.id); setInv(null); toast({ title: 'Invite cancelled' }) }}>Cancel this invite</button>
          </>
        )}
      </div>
    </Modal>
  )
}
