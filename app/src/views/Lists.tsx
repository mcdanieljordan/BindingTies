import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { db } from '../db'
import { Empty, PageHead } from '../components/ui'
import { useListItems, useLists } from '../lib/useData'

const CATS = ['Produce', 'Dairy & fridge', 'Pantry', 'Frozen', 'Household', 'Other']
export default function Lists() {
  const lists = useLists()
  const items = useListItems()
  const [sel, setSel] = useState<number>()
  const [text, setText] = useState('')
  const [cat, setCat] = useState('Other')
  const [name, setName] = useState('')
  const l = lists.find((x) => x.id === sel) ?? lists[0]
  const mine = items.filter((i) => i.listId === l?.id)
  const groups = [...new Set(mine.map((i) => i.category))].sort()
  return (
    <>
      <PageHead title="Shared lists" sub="Groceries, packing, anything. Check things off as you go.">
        <input placeholder="New list" value={name} onChange={(e) => setName(e.target.value)} />
        <button className="btn" onClick={async () => { if (!name.trim()) return; setSel((await db.lists.add({ name: name.trim() } as never)) as number); setName('') }}><Plus size={16} />List</button>
      </PageHead>
      <div className="tabs">{lists.map((x) => <button key={x.id} className={`tab ${x.id === l?.id ? 'on' : ''}`} onClick={() => setSel(x.id)}>{x.name}</button>)}</div>
      {l && (
        <div className="card">
          <div className="row">
            <input style={{ flex: 1 }} value={text} placeholder="Add item…" onChange={(e) => setText(e.target.value)} onKeyDown={async (e) => { if (e.key === 'Enter' && text.trim()) { await db.listItems.add({ listId: l.id, text: text.trim(), done: false, category: cat } as never); setText('') } }} aria-label="Add item" />
            <button className="btn primary" onClick={async () => { if (!text.trim()) return; await db.listItems.add({ listId: l.id, text: text.trim(), done: false, category: cat } as never); setText('') }}>Add</button>
          </div>
          <div className="row" style={{ marginTop: 8, gap: 6 }} role="group" aria-label="Category">{CATS.map((c) => <button key={c} type="button" className={`tab ${cat === c ? 'on' : ''}`} onClick={() => setCat(c)}>{c}</button>)}</div>
          <div className="stack" style={{ marginTop: 14 }}>
            {mine.length === 0 && <Empty>Nothing here yet.</Empty>}
            {groups.map((g) => (
              <div key={g}>
                <div className="muted" style={{ fontWeight: 800, margin: '6px 0' }}>{g}</div>
                <div className="stack">
                  {mine.filter((i) => i.category === g).map((i) => (
                    <label key={i.id} className={`item ${i.done ? 'done' : ''}`} style={{ cursor: 'pointer' }}>
                      <input type="checkbox" checked={i.done} onChange={() => db.listItems.update(i.id, { done: !i.done })} />
                      <span className="grow" style={{ fontSize: 17, textDecoration: i.done ? 'line-through' : 'none' }}>{i.text}</span>
                      <button className="btn ghost sm" aria-label="Delete item" onClick={(e) => { e.preventDefault(); void db.listItems.delete(i.id) }}><Trash2 size={14} /></button>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
          {mine.some((i) => i.done) && <button className="btn sm" style={{ marginTop: 12 }} onClick={() => db.listItems.bulkDelete(mine.filter((i) => i.done).map((i) => i.id))}>Clear checked</button>}
        </div>
      )}
    </>
  )
}
