import { Capacitor, registerPlugin } from '@capacitor/core'

export const isNative = Capacitor.isNativePlatform()
const Ics = registerPlugin<{ getPending(): Promise<{ text?: string }> }>('IcsIntent')

/** Calls back with the text of a calendar file that Android opened with BindingTies. */
export function onCalendarFile(cb: (text: string) => void) {
  if (!isNative || Capacitor.getPlatform() !== 'android') return () => {}
  const check = () => void Ics.getPending().then((r) => { if (r.text) cb(r.text) }).catch(() => {})
  check()
  window.addEventListener('fos-ics', check)
  return () => window.removeEventListener('fos-ics', check)
}

export const NATIVE_AUTH_URL = 'com.bindingties.app://auth'

/** Finishes Google sign-in when the phone's browser sends the person back to the app. */
export function listenForAuthLink(finish: (url: string) => Promise<void>) {
  if (!isNative) return
  void import('@capacitor/app').then(({ App }) => App.addListener('appUrlOpen', ({ url }) => {
    if (!url.startsWith(NATIVE_AUTH_URL)) return
    void finish(url).finally(() => void import('@capacitor/browser').then(({ Browser }) => Browser.close()).catch(() => {}))
  }))
}
