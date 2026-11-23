import { sb } from './client'
import { isNative } from '../lib/native'

export interface SitterOptions { schedule: boolean; meds: boolean; routines: boolean; address: boolean }
export interface SitterPass { id: string; label: string; member_ids: number[]; options: Partial<SitterOptions>; created_at: string; expires_at: string; revoked_at: string | null; last_viewed_at: string | null; view_count: number }

/** The Android app runs on its own address, so links must always point at the public website. */
export const PUBLIC_BASE = 'https://mcdanieljordan.github.io/BindingTies/'
const base = () => (isNative ? PUBLIC_BASE : location.origin + import.meta.env.BASE_URL)
/** The token goes after the # so it is never sent to any server or written to a log. */
export const sitterUrl = (token: string) => `${base()}sitter.html#${token}`
export const siteBase = base

export async function createSitterPass(fid: string, label: string, members: number[], options: SitterOptions, notes: string, hours: number): Promise<{ id: string; token: string; expires_at: string }> {
  const { data, error } = await sb!.rpc('create_sitter_pass', { p_family: fid, p_label: label, p_members: members, p_options: options, p_notes: notes, p_hours: hours })
  if (error) throw error
  return data as { id: string; token: string; expires_at: string }
}
export async function listSitterPasses(fid: string): Promise<SitterPass[]> {
  const { data, error } = await sb!.rpc('list_sitter_passes', { p_family: fid })
  if (error) throw error
  return (data as SitterPass[]) ?? []
}
export async function revokeSitterPass(id: string) {
  const { error } = await sb!.rpc('revoke_sitter_pass', { p_id: id })
  if (error) throw error
}
