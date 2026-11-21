import { useState } from 'react'
import { Home } from 'lucide-react'
import { googleEnabled, resetPassword, signIn, signInGoogle, signUp } from '../sync/account'

const friendly = (m: string) =>
  /invalid login/i.test(m) ? "That email and password don't match. New here? Tap \"Create account\" above." :
  /already registered|already been registered/i.test(m) ? 'This email already has an account. Tap "Sign in" above.' :
  /rate limit/i.test(m) ? 'Too many emails were sent just now. Please wait a few minutes and try again.' :
  /password/i.test(m) && /6|8|short|weak/i.test(m) ? 'Please choose a longer password (at least 8 characters).' :
  /valid email|invalid email/i.test(m) ? 'That email address does not look right.' :
  /not confirmed/i.test(m) ? 'Please open the email we sent you and tap the link first.' : m

export default function Welcome({ onLocal, onBack, start = 'in' }: { onLocal: () => void; onBack?: () => void; start?: 'in' | 'new' }) {
  const [mode, setMode] = useState<'in' | 'new'>(start)
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ kind: 'err' | 'ok'; text: string } | null>(null)

  async function go() {
    setBusy(true); setMsg(null)
    try {
      if (mode === 'new') {
        const r = await signUp(email.trim(), pw)
        if (!r.session) { setMsg({ kind: 'ok', text: 'Almost there! We sent you an email. Open it and tap the link, then come back here and tap "Sign in".' }); setMode('in') }
      } else await signIn(email.trim(), pw)
    } catch (e) { setMsg({ kind: 'err', text: friendly((e as Error).message) }) } finally { setBusy(false) }
  }
  async function forgot() {
    if (!email.trim()) return setMsg({ kind: 'err', text: 'Type your email above first, then tap this again.' })
    try { await resetPassword(email.trim()); setMsg({ kind: 'ok', text: 'We sent you an email with a link to choose a new password.' }) } catch (e) { setMsg({ kind: 'err', text: friendly((e as Error).message) }) }
  }

  return (
    <div className="gate">
      <form className="gate-card" onSubmit={(e) => { e.preventDefault(); void go() }}>
        <div className="gate-logo"><Home size={38} strokeWidth={2.6} /></div>
        <h1>Welcome to FamilyOS</h1>
        <p>Your family's calendar, chores and reminders, together.</p>

        {googleEnabled && (
          <>
            <button type="button" className="btn huge" onClick={() => signInGoogle().catch((e) => setMsg({ kind: 'err', text: friendly((e as Error).message) }))}>
              <svg width="22" height="22" viewBox="0 0 48 48" aria-hidden><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
              Continue with Google
            </button>
            <div className="or">or use your email</div>
          </>
        )}

        <div className="seg">
          <button type="button" className={mode === 'in' ? 'on' : ''} onClick={() => { setMode('in'); setMsg(null) }}>Sign in</button>
          <button type="button" className={mode === 'new' ? 'on' : ''} onClick={() => { setMode('new'); setMsg(null) }}>Create account</button>
        </div>

        <input type="email" inputMode="email" placeholder="Your email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" aria-label="Email" required />
        <div className="pw">
          <input type={show ? 'text' : 'password'} placeholder={mode === 'new' ? 'Make up a password' : 'Your password'} value={pw} onChange={(e) => setPw(e.target.value)} autoComplete={mode === 'new' ? 'new-password' : 'current-password'} aria-label="Password" required style={{ paddingRight: 80 }} />
          <button type="button" onClick={() => setShow(!show)} aria-label={show ? 'Hide password' : 'Show password'}>{show ? 'Hide' : 'Show'}</button>
        </div>
        {mode === 'new' && <div className="muted" style={{ textAlign: 'center', marginTop: -8 }}>At least 8 letters or numbers.</div>}
        {msg && <div className={msg.kind === 'err' ? 'err' : 'ok'} role="alert">{msg.text}</div>}
        <button className="btn primary huge" disabled={busy || !email || pw.length < 8} type="submit">{busy ? 'One moment…' : mode === 'new' ? 'Create my account' : 'Sign in'}</button>
        {mode === 'in' && <button type="button" className="link" onClick={forgot}>I forgot my password</button>}
        <button type="button" className="link" style={{ color: 'var(--muted)', fontSize: 15 }} onClick={onLocal}>Just use it on this device, no account</button>
        {onBack && <button type="button" className="link" style={{ color: 'var(--muted)', fontSize: 15 }} onClick={onBack}>← Back</button>}
      </form>
    </div>
  )
}
