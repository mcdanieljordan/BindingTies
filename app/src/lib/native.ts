import { Capacitor, registerPlugin } from '@capacitor/core'

export const isNative = Capacitor.isNativePlatform()
const Ics = registerPlugin<{ getPending(): Promise<{ text?: string }> }>('IcsIntent')

/** Calls back with the text of a calendar file that Android opened with FamilyOS. */
export function onCalendarFile(cb: (text: string) => void) {
  if (!isNative || Capacitor.getPlatform() !== 'android') return () => {}
  const check = () => void Ics.getPending().then((r) => { if (r.text) cb(r.text) }).catch(() => {})
  check()
  window.addEventListener('fos-ics', check)
  return () => window.removeEventListener('fos-ics', check)
}
