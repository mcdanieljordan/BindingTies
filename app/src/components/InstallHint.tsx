import { useState } from 'react'
import { Share, X } from 'lucide-react'

const KEY = 'installHintDismissed'
const read = () => { try { return localStorage.getItem(KEY) === '1' } catch { return false } }

/** On iPhone/iPad (no app store version), explains how to put BindingTies on the Home Screen. Shown once, in a browser only. */
export default function InstallHint() {
  const [gone, setGone] = useState(read)
  const ua = navigator.userAgent
  const ios = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  const standalone = (navigator as { standalone?: boolean }).standalone === true || window.matchMedia('(display-mode: standalone)').matches
  const native = !!(window as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.()
  if (!ios || standalone || native || gone) return null
  const close = () => { try { localStorage.setItem(KEY, '1') } catch { /* ignore */ } setGone(true) }
  return (
    <div className="card" role="note">
      <div className="row between">
        <h3><Share size={16} style={{ verticalAlign: -2 }} /> Put BindingTies on your Home Screen</h3>
        <button className="btn sm" aria-label="Dismiss" onClick={close}><X size={14} /></button>
      </div>
      <ol style={{ margin: '8px 0 0', paddingLeft: 20 }}>
        <li>Open this page in <b>Safari</b> (or Chrome).</li>
        <li>Tap the <b>Share</b> button <Share size={14} style={{ verticalAlign: -2 }} />, then <b>Add to Home Screen</b>.</li>
        <li>Open BindingTies from the new icon. Then turn on alerts in Settings to get reminders.</li>
      </ol>
      <div className="muted small" style={{ marginTop: 6 }}>Needs iOS or iPadOS 16.4 or newer for reminders.</div>
    </div>
  )
}
