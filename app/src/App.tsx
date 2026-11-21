import { useCallback, useEffect, useState } from 'react'
import { Home, CalendarDays, ListChecks, Trophy, HeartPulse, ShoppingBasket, FolderHeart, Settings as Cog, MonitorPlay } from 'lucide-react'
import { AppCtx } from './ctx'
import { DEFAULT_SETTINGS, loadSettings, startScheduler, type Settings, type Toast } from './lib/engine'
import { setKV } from './db'
import { useMembers } from './lib/useData'
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
import { bootSync } from './sync/SyncPanel'

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

export default function App() {
  const [settings, setS] = useState<Settings>(DEFAULT_SETTINGS)
  const [loaded, setLoaded] = useState(false)
  const [view, setView] = useState<string>('today')
  const [toasts, setToasts] = useState<Toast[]>([])
  const [wall, setWall] = useState(false)
  const members = useMembers()

  useEffect(() => { void bootSync() }, [])
  useEffect(() => { loadSettings().then((s) => { setS({ ...DEFAULT_SETTINGS, ...s }); setLoaded(true) }) }, [])
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

  const setSettings = (p: Partial<Settings>) => {
    const n = { ...settings, ...p }
    setS(n)
    void setKV('settings', n)
  }

  if (!loaded) return null
  const ctx = { settings, setSettings, toast, go: setView, openWall: () => setWall(true) }
  if (members.length === 0) return <AppCtx.Provider value={ctx}><Onboarding /></AppCtx.Provider>

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
