import { createContext, useContext } from 'react'
import type { Settings, Toast } from './lib/engine'

export interface Ctx {
  settings: Settings
  setSettings: (s: Partial<Settings>) => void
  toast: (t: Omit<Toast, 'id'>) => void
  go: (view: string) => void
  /** Chosen "who's using this device" profile (for kid mode etc.) */
  openWall: () => void
}
export const AppCtx = createContext<Ctx>(null as unknown as Ctx)
export const useApp = () => useContext(AppCtx)
