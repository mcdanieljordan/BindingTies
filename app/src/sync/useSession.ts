import { useEffect, useState } from 'react'
import { sb } from './client'

export interface SessionInfo { loading: boolean; uid?: string; email?: string }

export function useSession(): SessionInfo {
  const [s, setS] = useState<SessionInfo>({ loading: !!sb })
  useEffect(() => {
    if (!sb) return
    let live = true
    sb.auth.getSession().then(({ data }) => live && setS({ loading: false, uid: data.session?.user.id, email: data.session?.user.email ?? undefined }))
    const { data } = sb.auth.onAuthStateChange((_e, sess) => setS({ loading: false, uid: sess?.user.id, email: sess?.user.email ?? undefined }))
    return () => { live = false; data.subscription.unsubscribe() }
  }, [])
  return s
}
