import { useState } from 'react'
import { Plus, Sparkles } from 'lucide-react'
import { db, setKV, DEFAULT_QUEST, type Role } from '../db'
import { AVATARS, Avatar } from '../lib/icons'
import { seedSample, seedStarter } from '../lib/seed'

const COLORS = ['#8d7bff', '#50e0bd', '#ff7fb2', '#ffca70', '#5db7ff', '#ff9a62', '#b6e35a', '#e08cff']
interface Draft { name: string; role: Role; age: string }

export default function Onboarding() {
  const [list, setList] = useState<Draft[]>([{ name: '', role: 'parent', age: '' }])
  const set = (i: number, p: Partial<Draft>) => setList((l) => l.map((x, j) => (j === i ? { ...x, ...p } : x)))
  const valid = list.filter((x) => x.name.trim())

  async function start() {
    let i = 0
    for (const m of valid) {
      await db.members.add({ name: m.name.trim(), role: m.role, age: m.age ? Number(m.age) : undefined, color: COLORS[i % COLORS.length], icon: AVATARS[i % AVATARS.length] } as never)
      i++
    }
    await setKV('quest', { ...DEFAULT_QUEST, since: Date.now() })
    await seedStarter()
  }
  return (
    <div className="main" style={{ maxWidth: 640, paddingTop: 40 }}>
      <div className="card">
        <div className="brand"><span className="brand-icon"><Sparkles size={19} /></span>Welcome to FamilyOS</div>
        <p className="muted">Who is in your family? Add each person, grown-ups and kids. They don't need their own login.</p>
        <div className="stack" style={{ marginTop: 14 }}>
          {list.map((m, i) => (
            <div className="row" key={i}>
              <Avatar icon={AVATARS[i % AVATARS.length]} color={COLORS[i % COLORS.length]} />
              <input style={{ flex: '1 1 140px' }} placeholder="Name" value={m.name} onChange={(e) => set(i, { name: e.target.value })} aria-label="Name" />
              <select value={m.role} onChange={(e) => set(i, { role: e.target.value as Role })} aria-label="Role">
                <option value="parent">Parent</option><option value="child">Child</option><option value="caregiver">Caregiver</option>
              </select>
              {m.role === 'child' && <input type="number" min={1} max={19} placeholder="Age" style={{ width: 70 }} value={m.age} onChange={(e) => set(i, { age: e.target.value })} aria-label="Age" />}
            </div>
          ))}
          <div className="row">
            <button className="btn" onClick={() => setList([...list, { name: '', role: 'child', age: '' }])}><Plus size={16} />Add person</button>
            <span className="sp" />
            <button className="btn primary" disabled={!valid.length} onClick={start}>Start</button>
          </div>
          <button className="btn ghost sm" onClick={seedSample}>Or explore with a sample family</button>
        </div>
      </div>
    </div>
  )
}
