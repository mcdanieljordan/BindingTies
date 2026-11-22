import { sb, VAPID_PUBLIC } from './client'

export type Access = 'full' | 'limited'
export interface FamilyInfo { id: string; name: string; invite_code: string; tz: string; status: 'pending' | 'approved'; member_id: number | null; role: 'owner' | 'parent' | 'member'; access?: Access }
export interface JoinRequest { user_id: string; email: string; requested: string; requested_access?: Access }
export interface FamilyAccount { user_id: string; email: string; member_id: number | null; role: 'owner' | 'parent' | 'member'; access?: Access }
export interface Invite { id: string; token: string; email: string | null; access: Access; role: 'parent' | 'member'; member_id: number; created_at: string }

export async function currentUser() {
  if (!sb) return null
  const { data } = await sb.auth.getSession()
  return data.session?.user ?? null
}
export async function signUp(email: string, password: string) {
  const { data, error } = await sb!.auth.signUp({ email, password, options: { emailRedirectTo: location.origin + import.meta.env.BASE_URL } })
  if (error) throw error
  return data
}
export async function signIn(email: string, password: string) {
  const { error } = await sb!.auth.signInWithPassword({ email, password })
  if (error) throw error
}
export const signOut = () => sb!.auth.signOut()

export async function myFamily(): Promise<FamilyInfo | null> {
  const { data, error } = await sb!.rpc('my_membership')
  if (error) throw error
  return (data as FamilyInfo | null) ?? null
}
export async function createFamily(name: string): Promise<FamilyInfo> {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
  const { data, error } = await sb!.rpc('create_family', { p_name: name, p_tz: tz })
  if (error) throw error
  return data as FamilyInfo
}
/** Asks to join. The family's parents must approve before anything is shared. */
export async function joinFamily(code: string, access: Access = 'limited'): Promise<FamilyInfo> {
  const { data, error } = await sb!.rpc('join_family', { p_code: code.trim().toUpperCase(), p_access: access })
  if (error) throw error
  return data as FamilyInfo
}
export async function pendingRequests(fid: string): Promise<JoinRequest[]> {
  const { data, error } = await sb!.rpc('pending_requests', { p_family: fid })
  if (error) throw error
  return (data as JoinRequest[]) ?? []
}
export async function familyAccounts(fid: string): Promise<FamilyAccount[]> {
  const { data, error } = await sb!.rpc('family_accounts', { p_family: fid })
  if (error) throw error
  return (data as FamilyAccount[]) ?? []
}
export async function approveMember(fid: string, uid: string, memberId: number | null, role: 'parent' | 'member', access: Access = 'limited') {
  const { error } = await sb!.rpc('approve_member', { p_family: fid, p_user: uid, p_member_id: memberId, p_role: role, p_access: access })
  if (error) throw error
}
export async function setMemberAccess(fid: string, uid: string, access: Access, role?: 'parent' | 'member') {
  const { error } = await sb!.rpc('set_member_access', { p_family: fid, p_user: uid, p_access: access, p_role: role ?? null })
  if (error) throw error
}

/* ---------- invites ---------- */
const INVITE_KEY = 'fos-invite'
/** An invite link looks like https://…/FamilyOS/?invite=TOKEN. Keep the token until the person has signed in. */
export function captureInvite() {
  try {
    const u = new URL(location.href)
    const t = u.searchParams.get('invite')
    if (t) { localStorage.setItem(INVITE_KEY, t.trim()); u.searchParams.delete('invite'); history.replaceState(null, '', u.pathname + (u.search || '') + u.hash) }
  } catch { /* ignore */ }
}
export const pendingInviteToken = () => { try { return localStorage.getItem(INVITE_KEY) } catch { return null } }
const clearInvite = () => { try { localStorage.removeItem(INVITE_KEY) } catch { /* ignore */ } }
export async function invitePreview(token: string): Promise<{ family: string; person: string | null } | null> {
  const { data } = await sb!.rpc('invite_preview', { p_token: token })
  return (data as { family: string; person: string | null } | null) ?? null
}
export async function createInvite(fid: string, memberId: number, email: string, access: Access, role: 'parent' | 'member'): Promise<Invite> {
  const { data, error } = await sb!.rpc('create_invite', { p_family: fid, p_member: memberId, p_email: email, p_access: access, p_role: role })
  if (error) throw error
  return data as Invite
}
export async function listInvites(fid: string): Promise<Invite[]> {
  const { data, error } = await sb!.rpc('list_invites', { p_family: fid })
  if (error) throw error
  return (data as Invite[]) ?? []
}
export async function revokeInvite(id: string) {
  const { error } = await sb!.rpc('revoke_invite', { p_invite: id })
  if (error) throw error
}
export const inviteLink = (token: string) => `${location.origin}${import.meta.env.BASE_URL}?invite=${token}`
/** Looks for an invite that belongs to this login: the link they opened, or their verified email. */
export async function resolveInvite(): Promise<{ fam: FamilyInfo | null; joinedByInvite: boolean }> {
  const tok = pendingInviteToken()
  if (tok) {
    const { data, error } = await sb!.rpc('accept_invite', { p_token: tok })
    if (!error && data) { clearInvite(); return { fam: data as FamilyInfo, joinedByInvite: true } }
    if (error && /already been used|expired/i.test(error.message)) clearInvite()
  }
  const { data } = await sb!.rpc('claim_invites')
  return { fam: (data as FamilyInfo | null) ?? null, joinedByInvite: !!data }
}
export async function denyMember(fid: string, uid: string) {
  const { error } = await sb!.rpc('deny_member', { p_family: fid, p_user: uid })
  if (error) throw error
}
export async function linkMember(fid: string, memberId: number) {
  const { error } = await sb!.rpc('link_member', { p_family: fid, p_member_id: memberId })
  if (error) throw error
}

/* ---------- Web Push ---------- */
export const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window && !!VAPID_PUBLIC
const b64 = (s: string) => {
  const p = '='.repeat((4 - (s.length % 4)) % 4)
  const raw = atob((s + p).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}
export async function pushActive() {
  if (!pushSupported()) return false
  const reg = await navigator.serviceWorker.ready
  const on = !!(await reg.pushManager.getSubscription()) && Notification.permission === 'granted'
  try { localStorage.setItem('fos-push', on ? '1' : '0') } catch { /* ignore */ }
  return on
}
export async function enablePush(familyId: string) {
  if (!pushSupported()) throw new Error('This browser does not support push. On iPhone, add FamilyOS to the Home Screen first.')
  const perm = await Notification.requestPermission()
  if (perm !== 'granted') throw new Error('Notifications were not allowed.')
  const reg = await navigator.serviceWorker.ready
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(VAPID_PUBLIC!) }))
  const j = sub.toJSON()
  const user = await currentUser()
  const { error } = await sb!.from('push_subscriptions').upsert({ user_id: user!.id, family_id: familyId, endpoint: j.endpoint, p256dh: j.keys!.p256dh, auth: j.keys!.auth, ua: navigator.userAgent.slice(0, 200) }, { onConflict: 'endpoint' })
  if (error) throw error
  try { localStorage.setItem('fos-push', '1') } catch { /* ignore */ }
}
export async function disablePush() {
  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.getSubscription()
  if (sub) { await sb!.from('push_subscriptions').delete().eq('endpoint', sub.endpoint); await sub.unsubscribe() }
  try { localStorage.setItem('fos-push', '0') } catch { /* ignore */ }
}

export const googleEnabled = import.meta.env.VITE_GOOGLE_ENABLED === 'true'
export async function signInGoogle() {
  const { error } = await sb!.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.origin + import.meta.env.BASE_URL } })
  if (error) throw error
}
export async function resetPassword(email: string) {
  const { error } = await sb!.auth.resetPasswordForEmail(email, { redirectTo: location.origin + import.meta.env.BASE_URL })
  if (error) throw error
}
