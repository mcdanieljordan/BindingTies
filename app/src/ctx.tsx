import { createContext, useContext } from 'react'
import type { Settings, Toast } from './lib/engine'
import type { FamilyInfo } from './sync/account'

export interface Ctx {
  settings: Settings
  setSettings: (s: Partial<Settings>) => void
  toast: (t: Omit<Toast, 'id'>) => void
  go: (view: string) => void
  /** Chosen "who's using this device" profile (for kid mode etc.) */
  openWall: () => void
  /** The person using this device right now (a family member profile id) */
  me?: number
  /** The cloud family this account belongs to (undefined when using the app without an account) */
  family?: FamilyInfo
  setMe: (id: number | undefined) => void
  /** jump to the journal, on a day or to one entry */
  openJournal: (date: string, id?: number) => void
  journalFocus?: { date: string; id?: number; seq: number }
  /** Sign out of the cloud family and clear this device */
  leaveFamily: () => Promise<void>
}
export const AppCtx = createContext<Ctx>(null as unknown as Ctx)
export const useApp = () => useContext(AppCtx)
