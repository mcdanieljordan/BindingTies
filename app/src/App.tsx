import { useCallback, useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { BookOpen, Home, CalendarDays, ListChecks, Trophy, HeartPulse, ShoppingBasket, FolderHeart, Settings as Cog, MonitorPlay, Users, Menu } from 'lucide-react'
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
import Journal from './views/Journal'
import SettingsView from './views/SettingsView'
import Wall from './views/Wall'
import Onboarding from './views/Onboarding'
import Welcome from './views/Welcome'
import Landing from './views/Landing'
import FamilyStep from './views/FamilyStep'
import WhoIs from './views/WhoIs'
import Pending from './views/Pending'
import { useSession } from './sync/useSession'
import { syncConfigured } from './sync/client'
import { captureInvite, finishNativeAuth, linkMember, myFamily, resolveInvite, signOut, type FamilyInfo } from './sync/account'
import { startSync, stopSync, syncNow } from './sync/engine'
import { useSyncStatus } from './sync/SyncPanel'
import { refreshFeeds } from './lib/feeds'
import { listenForAuthLink, onCalendarFile } from './lib/native'
import ImportCalendar from './components/ImportCalendar'

const NAV = [
  { id: 'today', label: 'Today', I: Home },
  { id: 'calendar', label: 'Calendar', I: CalendarDays },
  { id: 'journal', label: 'Journal', I: BookOpen },
  { id: 'routines', label: 'Routines', I: ListChecks },
  { id: 'family', label: 'Team Quest', I: Trophy },
  { id: 'care', label: 'Care & Time', I: HeartPulse },
  { id: 'lists', label: 'Lists', I: ShoppingBasket },
  { id: 'vault', label: 'Learning', I: FolderHeart },
  { id: 'settings', label: 'Settings', I: Cog },
] as const

// the phone's bottom bar shows these; everything else lives under "More"
const MAIN: string[] = ['today', 'calendar', 'routines', 'journal', 'family']
const MORE_HINT: Record<string, string> = { care: 'Medicine, timers and alarms', lists: 'Groceries and shared lists', vault: 'School files, grades and goals', settings: 'People, look and feel, alerts, backup' }
captureInvite()
listenForAuthLink(finishNativeAuth)

const Splash = ({ text }: { text: string }) => <div className="gate"><div className="gate-card"><div className="gate-logo"><Home size={38} /></div><h1>{text}</h1></div></div>

export default function App() {
  const [settings, setS] = useState<Settings>(DEFAULT_SETTINGS)
  const [loaded, setLoaded] = useState(false)
  const [localOnly, setLocalOnly] = useState(false)
  const [me, setMeState] = useState<number | undefined | null>(null) // null = not loaded yet
  const [pickWho, setPickWho] = useState(false)
  const [auth, setAuth] = useState<'in' | 'new' | null>(null) // null = show the home page
  const [fam, setFam] = useState<FamilyInfo | null | undefined>(undefined) // undefined = checking
  const [waited, setWaited] = useState(false)
  const [view, setView] = useState<string>('today')
  const [jfocus, setJfocus] = useState<{ date: string; id?: number; seq: number } | undefined>()
  const [icsText, setIcsText] = useState<string | null>(null)
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
      let f = await myFamily().catch(() => cached)
      // an invite (link or matching email) lets this login straight in
      if (!f || f.status !== 'approved') {
        const r = await resolveInvite().catch(() => ({ fam: null as FamilyInfo | null, joinedByInvite: false }))
        if (r.fam) {
          if ((await db.members.count()) > 0) { await wipeLocal(); setMeState(undefined) }
          f = r.fam
        }
      }
      if (!live) return
      setFam(f ?? null)
      await setKV('sync:family', f ?? null)
    })()
    return () => { live = false }
  }, [session.uid, session.loading])
  useEffect(() => { if (fam && fam.status === 'approved' && session.uid) startSync(fam.id); else stopSync() }, [fam?.id, fam?.status, session.uid])
  useEffect(() => { if (!fam) return; const t = setTimeout(() => setWaited(true), 8000); return () => clearTimeout(t) }, [fam])

  const setSettings = (p: Partial<Settings>) => { const n = { ...settings, ...p }; setS(n); void setKV('settings', n) }
  const setMe = (id: number | undefined) => { setMeState(id); void setKV('me', id); setPickWho(false) }
  // first time this login picks a person, remember it on the account so next time it opens straight to them
  const pickMe = (id: number) => {
    setMe(id)
    if (fam && fam.status === 'approved' && fam.member_id == null && session.uid) void linkMember(fam.id, id).then(() => { const n = { ...fam, member_id: id }; setFam(n); void setKV('sync:family', n) }).catch(() => {})
  }
  const leaveFamily = async () => {
    if (session.uid) { try { await syncNow(fam!.id) } catch { /* keep going */ } await signOut() }
    stopSync(); await wipeLocal(); await setKV('localOnly', false); setLocalOnly(false); setFam(null); setMeState(undefined); setWaited(false)
  }

  const canFeed = loaded && (members?.length ?? 0) > 0 && !(fam?.status === 'approved' && fam.access === 'limited')
  useEffect(() => {
    if (!canFeed) return
    const t = setTimeout(() => void refreshFeeds(), 5000)
    const i = setInterval(() => void refreshFeeds(), 3600_000)
    return () => { clearTimeout(t); clearInterval(i) }
  }, [canFeed])

  useEffect(() => onCalendarFile((t) => setIcsText(t)), [])

  if (!loaded || members === undefined || me === null) return null
  const limited = fam?.status === 'approved' && fam.access === 'limited'
  const nav = NAV.filter((n) => !(limited && n.id === 'vault'))
  const ctx = { settings, setSettings, toast, go: setView, openWall: () => setWall(true), me: me ?? undefined, setMe, openJournal: (date: string, id?: number) => { setJfocus({ date, id, seq: Date.now() }); setView('journal') }, journalFocus: jfocus, leaveFamily, family: fam ?? undefined }
  const wrap = (el: React.ReactNode) => <AppCtx.Provider value={ctx}>{el}</AppCtx.Provider>

  // ---- front door ----
  if (syncConfigured && !localOnly) {
    if (session.loading) return <Splash text="Opening BindingTies…" />
    const goLocal = () => { setLocalOnly(true); void setKV('localOnly', true) }
    if (!session.uid) return wrap(auth ? <Welcome start={auth} onLocal={goLocal} onBack={() => setAuth(null)} /> : <Landing onStart={() => setAuth('new')} onSignIn={() => setAuth('in')} onLocal={goLocal} />)
    if (fam === undefined) return <Splash text="Opening your family…" />
    if (fam && fam.status === 'pending') return wrap(<Pending fam={fam} email={session.email} onUpdate={(f) => { setFam(f); void setKV('sync:family', f) }} />)
    if (!fam) return wrap(<FamilyStep email={session.email} onDone={(f) => { setFam(f); void setKV('sync:family', f) }} />)
  }
  if (members.length === 0) {
    const joiner = fam?.status === 'approved' && fam.role !== 'owner'
    if (joiner && !waited) return <Splash text="Getting your family…" />
    if (fam && st.state === 'syncing' && !waited) return <Splash text="Getting your family…" />
    return wrap(<Onboarding />)
  }
  const meMember = members.find((m) => m.id === me)
  if (!meMember) {
    const linked = fam?.status === 'approved' ? members.find((m) => m.id === fam.member_id) : undefined
    if (linked) { setTimeout(() => setMe(linked.id), 0); return null }
    if (members.length === 1) { setTimeout(() => pickMe(members[0].id), 0); return null }
    return wrap(<WhoIs members={members} onPick={pickMe} />)
  }
  if (pickWho) return wrap(<WhoIs members={members} onPick={pickMe} onClose={() => setPickWho(false)} />)

  return (
    <AppCtx.Provider value={ctx}>
      <div className="shell">
        <aside className="sidebar no-print">
          <div className="brand"><span className="brand-icon"><Home size={19} strokeWidth={2.6} /></span>BindingTies</div>
          {nav.map(({ id, label, I }) => (
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
          {view === 'vault' && !limited && <Vault />}
          {view === 'journal' && <Journal />}
          {view === 'settings' && <SettingsView />}
          {view === 'more' && (
            <>
              <h1 style={{ marginBottom: 14 }}>More</h1>
              <div className="moremenu">
                {nav.filter((n) => !MAIN.includes(n.id)).map(({ id, label, I }) => (
                  <button key={id} onClick={() => setView(id)}><I size={24} /><span>{label}<small>{MORE_HINT[id]}</small></span></button>
                ))}
                <button onClick={() => setWall(true)}><MonitorPlay size={24} /><span>Wall display<small>Full-screen schedule for a tablet or TV</small></span></button>
                <button onClick={() => setPickWho(true)}><Users size={24} /><span>I am {meMember.name}. Switch<small>Change who is using this device</small></span></button>
              </div>
            </>
          )}
        </main>
        <nav className="bottom-nav no-print" aria-label="Main">
          {nav.filter((n) => MAIN.includes(n.id)).map(({ id, label, I }) => (
            <button key={id} className={view === id ? 'active' : ''} onClick={() => setView(id)}><I size={22} />{label.split(' ')[0]}</button>
          ))}
          <button className={!MAIN.includes(view) ? 'active' : ''} onClick={() => setView('more')}><Menu size={22} />More</button>
        </nav>
      </div>
      <div className="toasts no-print" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind ?? ''}`}><b>{t.title}</b>{t.body && <div className="muted">{t.body}</div>}</div>
        ))}
      </div>
      {wall && <Wall onExit={() => setWall(false)} />}
      {icsText && !limited && <ImportCalendar initialText={icsText} onClose={() => setIcsText(null)} onDone={() => setView('calendar')} />}
    </AppCtx.Provider>
  )
}
