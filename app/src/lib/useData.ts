import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'

export const useMembers = () => useLiveQuery(() => db.members.toArray(), [], [])
export const useEvents = () => useLiveQuery(() => db.events.toArray(), [], [])
export const useRoutines = () => useLiveQuery(() => db.routines.toArray(), [], [])
export const useRuns = (date: string) => useLiveQuery(() => db.runs.where('date').equals(date).toArray(), [date], [])
export const useLedger = () => useLiveQuery(() => db.ledger.orderBy('ts').reverse().toArray(), [], [])
export const useRewards = () => useLiveQuery(() => db.rewards.toArray(), [], [])
export const useChores = () => useLiveQuery(() => db.chores.toArray(), [], [])
export const useMeds = () => useLiveQuery(() => db.meds.toArray(), [], [])
export const useDoses = (date: string) => useLiveQuery(() => db.doses.where('date').equals(date).toArray(), [date], [])
export const useTimers = () => useLiveQuery(() => db.timers.toArray(), [], [])
export const useAlarms = () => useLiveQuery(() => db.alarms.toArray(), [], [])
export const useLists = () => useLiveQuery(() => db.lists.toArray(), [], [])
export const useListItems = () => useLiveQuery(() => db.listItems.toArray(), [], [])
export const useVault = () => useLiveQuery(() => db.vault.orderBy('date').reverse().toArray(), [], [])
export const useGoals = () => useLiveQuery(() => db.goals.toArray(), [], [])
