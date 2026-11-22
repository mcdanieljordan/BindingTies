import { useEffect, useState } from 'react'
import { PartyPopper } from 'lucide-react'
import { invitePreview, pendingInviteToken } from './account'

/** Shown on the sign-in screens when the person arrived through an invite link. */
export default function InviteBanner() {
  const [info, setInfo] = useState<{ family: string; person: string | null } | null | undefined>(undefined)
  const tok = pendingInviteToken()
  useEffect(() => { if (tok) void invitePreview(tok).then(setInfo).catch(() => setInfo(null)) }, [tok])
  if (!tok || info === undefined) return null
  if (!info) return <div className="err" role="alert" style={{ margin: '12px auto', maxWidth: 520 }}>This invite link has already been used or has expired. Ask for a new one, or sign in normally.</div>
  return (
    <div className="ok" style={{ margin: '12px auto', maxWidth: 520, display: 'flex', gap: 10, alignItems: 'center', textAlign: 'left' }}>
      <PartyPopper size={22} />
      <span>You're invited to join <b>{info.family}</b>{info.person ? <> as <b>{info.person}</b></> : null}. Sign in or create your account below and you're in.</span>
    </div>
  )
}
