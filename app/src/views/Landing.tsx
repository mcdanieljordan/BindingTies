import { CalendarDays, ListChecks, Trophy, Pill, FolderHeart, MonitorPlay, Check, Home, ShieldCheck, Printer, Users } from 'lucide-react'
import { googleEnabled, signInGoogle } from '../sync/account'
import InviteBanner from '../sync/InviteBanner'

const FEATURES = [
  { I: CalendarDays, t: 'One family calendar', d: 'Everyone sees the same schedule. Type "Soccer Tuesday 5pm" and it is added.' },
  { I: ListChecks, t: 'Picture routines', d: 'Morning and bedtime steps with big pictures a 4-year-old can follow. Print them for the fridge.' },
  { I: Trophy, t: 'Team Family Quest', d: 'Chores and routines fill one shared bar. The whole family wins together.' },
  { I: Pill, t: 'Medicine and timers', d: 'See who gave a dose and when, so no one doubles up. Alarms and countdowns built in.' },
  { I: FolderHeart, t: 'Learning vault', d: 'Keep homework, grades and notes in one private place to share with teachers and doctors.' },
  { I: MonitorPlay, t: 'Kitchen wall display', d: 'Turn any old tablet into the family command center. No special screen to buy.' },
]

export default function Landing({ onStart, onSignIn, onLocal }: { onStart: () => void; onSignIn: () => void; onLocal: () => void }) {
  return (
    <div className="land">
      <header className="land-nav">
        <div className="brand"><span className="brand-icon"><Home size={19} strokeWidth={2.6} /></span>FamilyOS</div>
        <button className="btn" onClick={onSignIn}>Sign in</button>
      </header>
      <InviteBanner />

      <section className="land-hero">
        <div className="land-copy">
          <h1>Your whole family, finally on the same page.</h1>
          <p className="lead">A shared calendar, reminders, picture routines, and a points game the family plays <em>together</em>. Simple enough for a 6-year-old and an 80-year-old.</p>
          <div className="land-cta">
            {googleEnabled && (
              <button className="btn huge" onClick={() => signInGoogle().catch(() => onStart())}>Continue with Google</button>
            )}
            <button className="btn primary huge" onClick={onStart}>Create my free account</button>
            <button className="link" onClick={onSignIn}>I already have an account</button>
          </div>
          <ul className="land-ticks">
            <li><Check size={16} /> Free to start</li>
            <li><Check size={16} /> No ads, ever</li>
            <li><Check size={16} /> Works on phones, tablets and computers</li>
          </ul>
        </div>

        <div className="land-mock" aria-hidden>
          <div className="mock-card">
            <div className="mock-row"><b>Family Quest: Pizza &amp; Movie Night</b><span className="chip good">112 / 150</span></div>
            <div className="meter"><i style={{ width: '74%' }} /></div>
          </div>
          <div className="mock-card">
            <b>Morning Launch</b>
            {[['Wake up', true], ['Get dressed', true], ['Brush teeth', false]].map(([n, d], i) => (
              <div key={String(n)} className={`mock-step ${d ? 'done' : ''}`}><span className="step-num">{i + 1}</span>{n}<span className="mock-check">{d && <Check size={16} strokeWidth={3.5} />}</span></div>
            ))}
          </div>
          <div className="mock-card">
            <div className="mock-row"><b>Vitamin D</b><span className="chip good">Given by Mom, 8:02 AM</span></div>
            <div className="mock-row muted"><span>Soccer practice with Dad driving</span><span>5:00 PM</span></div>
          </div>
        </div>
      </section>

      <section className="land-sec">
        <h2>Everything your family juggles, in one calm place</h2>
        <div className="land-grid">
          {FEATURES.map(({ I, t, d }) => (
            <div className="land-feat" key={t}><span className="feat-ico"><I size={24} /></span><h3>{t}</h3><p>{d}</p></div>
          ))}
        </div>
      </section>

      <section className="land-sec alt">
        <h2>Getting started takes two minutes</h2>
        <div className="land-steps">
          <div><span className="step-num big">1</span><h3>Sign in</h3><p>With Google or your email.</p></div>
          <div><span className="step-num big">2</span><h3>Start or join your family</h3><p>Share a short code so everyone at home joins the same space.</p></div>
          <div><span className="step-num big">3</span><h3>Pick who you are</h3><p>Everyone gets their own view of the same family.</p></div>
        </div>
      </section>

      <section className="land-sec">
        <div className="land-two">
          <div className="land-feat wide"><span className="feat-ico"><Users size={24} /></span><h3>Made for every age</h3><p>Big buttons, pictures first, and one tap to finish a step. Grandparents, parents, teens and little ones all use the same app their own way.</p></div>
          <div className="land-feat wide"><span className="feat-ico"><Printer size={24} /></span><h3>Print it, stick it on the fridge</h3><p>Turn any routine into a clean black-and-white chart with a single tap.</p></div>
          <div className="land-feat wide"><span className="feat-ico"><ShieldCheck size={24} /></span><h3>Private by design</h3><p>No ads. No selling your data. Your family's information is only visible to your family, and you can export or delete it anytime.</p></div>
        </div>
      </section>

      <section className="land-final">
        <h2>Ready to get everyone organized?</h2>
        <button className="btn primary huge" style={{ maxWidth: 380 }} onClick={onStart}>Create my free account</button>
        <button className="link" onClick={onLocal}>Or try it on this device with no account</button>
      </section>
      <footer className="land-foot muted">FamilyOS • Made for families • <a href={`${import.meta.env.BASE_URL}privacy.html`}>Privacy & Terms</a></footer>
    </div>
  )
}
