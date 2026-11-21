import { useCallback, useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Home, CalendarDays, ListChecks, Trophy, HeartPulse, ShoppingBasket, FolderHeart, Settings as Cog, MonitorPlay, Users } from 'lucide-react'
import { AppCtx } from './ctx'
import { DEFAULT_SETTINGS, loadSettings, startScheduler, type Settings, type Toast } from './lib/engine'
import { db, getKV, setKV, wipeLocal } from './db'
import Today from './views/Today'
import CalendarView from './views/CalendarView'
import Routines from './views/Routines'
import Family from './views/Family'
import Care from './views/Care'
import Lists from './views/Lists'
import Vault from './views/Vault'
import SettingsView from './views/SettingsView'
import Wall from './views/Wall'
import Onboarding from './views/Onboarding'
import Welcome from './views/Welcome'
import FamilyStep from './views/FamilyStep'
import WhoIs from './views/WhoIs'
import { useSession } from './sync/useSession'
import { syncConfigured } from './sync/client'
import { myFamily, signOut, type FamilyInfo } from './sync/account'
import { startSync, stopSync, syncNow } from './sync/engine'
import { useSyncStatus } from './sync/SyncPanel'

const NAV = [
  { id: 'today', label: 'Today', I: Home },
  { id: 'calendar', label: 'Calendar', I: CalendarDays },
  { id: 'routines', label: 'Routines', I: ListChecks },
  { id: 'family', label: 'Team Quest', I: Trophy },
  { id: 'care', label: 'Care & Time', I: HeartPulse },
  { id: 'lists', label: 'Lists', I: ShoppingBasket },
  { id: 'vault', label: 'Learning', I: FolderHeart },
  { id: 'settings', label: 'Settings', I: Cog },
] as const

const Splash = ({ text }: { text: string }) => <div className="gate"><div className="gate-card"><div className="gate-logo"><Home size={38} /></div><h1>{text}</h1></div></div>

export default function App() {
  const [settings, setS] = useState<Settings>(DEFAULT_SETTINGS)
  const [loaded, setLoaded] = useState(false)
  const [localOnly, setLocalOnly] = useState(false)
  const [me, setMeState] = useState<number | undefined | null>(null) // null = not loaded yet
  const [pickWho, setPickWho] = useState(false)
  const [fam, setFam] = useState<FamilyInfo | null | undefined>(undefined) // undefined = checking
  const [justJoined, setJustJoined] = useState(false)
  const [waited, setWaited] = useState(false)
  const [view, setView] = useState<string>('today')
  const [toasts, setToasts] = useState<Toast[]>([])
  const [wall, setWall] = useState(false)
  const members = useLiveQuery(() => db.members.toArray(), [])
  const session = useSession()
  const st = useSyncStatus()

  useEffect(() => {
    void (async () => {
      setS({ ...DEFAULT_SETTINGS, ...(await loadSettings()) })
      setLocalOnly(await getKV('localOnly', false))
      setMeState(await getKV<number | undefined>('me', undefined))
      setLoaded(true)
    })()
  }, [])
  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme
    document.body.classList.toggle('calm', settings.skin === 'calm')
  }, [settings])

  const toast = useCallback((t: Omit<Toast, 'id'>) => {
    const id = Date.now() + Math.random()
    setToasts((x) => [...x.slice(-3), { ...t, id }])
    setTimeout(() => setToasts((x) => x.filter((y) => y.id !== id)), t.kind === 'warn' ? 15000 : 5000)
  }, [])
  useEffect(() => loaded ? startScheduler(toast) : undefined, [loaded, toast])

  // which cloud family (if any) does the signed-in account belong to?
  useEffect(() => {
    if (!syncConfigured || session.loading) return
    if (!session.uid) { setFam(null); stopSync(); return }
    let live = true
    void (async () => {
      const cached = await getKV<FamilyInfo | null>('sync:family', null)
      if (cached && live) setFam(cached)
      const f = await myFamily().catch(() => cached)
      if (!live) return
      setFam(f ?? null)
      await setKV('sync:family', f ?? null)
    })()
    return () => { live = false }
  }, [session.uid, session.loading])
  useEffect(() => { if (fam && session.uid) startSync(fam.id); else stopSync() }, [fam, session.uid])
  useEffect(() => { if (!fam) return; const t = setTimeout(() => setWaited(true), 8000); return () => clearTimeout(t) }, [fam])

  const setSettings = (p: Partial<Settings>) => { const n = { ...settings, ...p }; setS(n); void setKV('settings', n) }
  const setMe = (id: number | undefined) => { setMeState(id); void setKV('me', id); setPickWho(false) }
  const leaveFamily = async () => {
    if (session.uid) { try { await syncNow(fam!.id) } catch { /* keep going */ } await signOut() }
    stopSync(); await wipeLocal(); await setKV('localOnly', false); setLocalOnly(false); setFam(null); setMeState(undefined); setJustJoined(false); setWaited(false)
  }

  if (!loaded || members === undefined || me === null) return null
  const ctx = { settings, setSettings, toast, go: setView, openWall: () => setWall(true), me: me ?? undefined, setMe, leaveFamily }
  const wrap = (el: React.ReactNode) => <AppCtx.Provider value={ctx}>{el}</AppCtx.Provider>

  // ---- front door ----
  if (syncConfigured && !localOnly) {
    if (session.loading) return <Splash text="Opening FamilyOS…" />
    if (!session.uid) return wrap(<Welcome onLocal={() => { setLocalOnly(true); void setKV('localOnly', true) }} />)
    if (fam === undefined) return <Splash text="Opening your family…" />
    if (!fam) return wrap(<FamilyStep email={session.email} onDone={(f, joined) => { setFam(f); setJustJoined(joined); void setKV('sync:family', f) }} />)
  }
  if (members.length === 0) {
    if (fam && justJoined && st.state !== 'ok' && !waited) return <Splash text="Getting your family…" />
    if (fam && !justJoined && st.state === 'syncing' && !waited) return <Splash text="Getting your family…" />
    return wrap(<Onboarding />)
  }
  const meMember = members.find((m) => m.id === me)
  if (!meMember) {
    if (members.length === 1) { setTimeout(() => setMe(members[0].id), 0); return null }
    return wrap(<WhoIs members={members} onPick={setMe} />)
  }
  if (pickWho) return wrap(<WhoIs members={members} onPick={setMe} onClose={() => setPickWho(false)} />)

  return (
    <AppCtx.Provider value={ctx}>
      <div className="shell">
        <aside className="sidebar no-print">
          <div className="brand"><span className="brand-icon"><Home size={19} strokeWidth={2.6} /></span>FamilyOS</div>
          {NAV.map(({ id, label, I }) => (
            <button key={id} className={`nav-btn ${view === id ? 'active' : ''}`} onClick={() => setView(id)}><I size={19} />{label}</button>
          ))}
          <div className="sp" />
          <button className="nav-btn" onClick={() => setWall(true)}><MonitorPlay size={19} />Wall display</button>
          <button className="nav-btn" onClick={() => setPickWho(true)}><Users size={19} />I am {meMember.name}. Switch</button>
        </aside>
        <main className="main">
          {view === 'today' && <Today />}
          {view === 'calendar' && <CalendarView />}
          {view === 'routines' && <Routines />}
          {view === 'family' && <Family />}
          {view === 'care' && <Care />}
          {view === 'lists' && <Lists />}
          {view === 'vault' && <Vault />}
          {view === 'settings' && <SettingsView />}
        </main>
        <nav className="bottom-nav no-print" aria-label="Main">
          {NAV.slice(0, 7).map(({ id, label, I }) => (
            <button key={id} className={view === id ? 'active' : ''} onClick={() => setView(id)}><I size={21} />{label.split(' ')[0]}</button>
          ))}
          <button className={view === 'settings' ? 'active' : ''} onClick={() => setView('settings')}><Cog size={21} />More</button>
        </nav>
      </div>
      <div className="toasts no-print" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind ?? ''}`}><b>{t.title}</b>{t.body && <div className="muted">{t.body}</div>}</div>
        ))}
      </div>
      {wall && <Wall onExit={() => setWall(false)} />}
    </AppCtx.Provider>
  )
}
