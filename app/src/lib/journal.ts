// Who may read a journal entry. The database enforces the same rules (migration 004); this copy keeps other people's
// entries out of view on a shared device and powers the screens.
import type { JournalEntry, JournalPolicy, Member } from '../db'

/** Under 15 (or a child with no age set): the only group a parent override can reach. */
export const isMinor = (m?: Member) => !!m && m.role === 'child' && (m.age ?? 0) < 15

export function canSee(e: JournalEntry, me: Member | undefined, members: Member[], policies: JournalPolicy[]): boolean {
  if (!me) return false
  if (e.ownerMemberId === me.id) return true
  if ((e.shareWith ?? []).includes(me.id)) return true
  if (me.role === 'parent') {
    if (e.shareParents) return true
    const owner = members.find((m) => m.id === e.ownerMemberId)
    if (isMinor(owner) && policies.some((p) => p.id === owner!.id && p.parentsRead)) return true
  }
  return false
}
export const canEdit = (e: JournalEntry, me?: Member) => !!me && e.ownerMemberId === me.id

/** Short description of who can read an entry, from the author's point of view. */
export function audience(e: JournalEntry, members: Member[]): { icon: string; text: string } {
  const names = (e.shareWith ?? []).map((id) => members.find((m) => m.id === id)?.name).filter(Boolean) as string[]
  if (e.shareParents && names.length) return { icon: '👥', text: `Parents, ${names.join(', ')}` }
  if (e.shareParents) return { icon: '👪', text: 'Parents can read' }
  if (names.length) return { icon: '👥', text: names.join(', ') }
  return { icon: '🔒', text: 'Only me' }
}

/** A simple lock for a shared device. It keeps casual snoopers out; it is not encryption. */
export async function hashPin(pin: string, memberId: number) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${memberId}:${pin}`))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}
const UNLOCK = 'fos-journal-unlocked'
export const isUnlocked = (id: number) => { try { return sessionStorage.getItem(UNLOCK) === String(id) } catch { return false } }
export const setUnlocked = (id: number | null) => { try { if (id == null) sessionStorage.removeItem(UNLOCK); else sessionStorage.setItem(UNLOCK, String(id)) } catch { /* ignore */ } }

export const useJournalCalendarKey = (me?: number) => `fos-jcal-${me ?? 'x'}`

/** The lock lives on this device only (a Limited account cannot edit people records, and a PIN should not sync anyway). */
const PIN = (id: number) => `fos-jpin-${id}`
export const getPin = (id: number) => { try { return localStorage.getItem(PIN(id)) } catch { return null } }
export const savePin = (id: number, hash: string | null) => { try { if (hash) localStorage.setItem(PIN(id), hash); else localStorage.removeItem(PIN(id)) } catch { /* ignore */ } }
