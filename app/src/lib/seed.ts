import { db, setKV, DEFAULT_QUEST, type Step } from '../db'
import { uid } from './engine'
import { todayStr } from './dates'

const s = (title: string, icon: string, mins?: number): Step => ({ id: uid(), title, icon, mins })

export const TEMPLATES: { name: string; block: 'morning' | 'after_school' | 'bedtime'; ages: string; steps: Step[] }[] = [
  { name: 'Morning Launch', block: 'morning', ages: '3–7', steps: [s('Wake up', 'wake'), s('Potty', 'toilet'), s('Get dressed', 'dress'), s('Eat breakfast', 'breakfast', 15), s('Brush teeth', 'teeth', 2), s('Shoes on', 'shoes'), s('Backpack', 'backpack')] },
  { name: 'Bedtime', block: 'bedtime', ages: '3–7', steps: [s('Pajamas', 'pjs'), s('Brush teeth', 'teeth', 2), s('Potty', 'toilet'), s('Story time', 'story', 10), s('Cuddle', 'cuddle'), s('Lights out', 'lights')] },
  { name: 'After School', block: 'after_school', ages: '5–10', steps: [s('Backpack away', 'backpack'), s('Snack', 'snack', 10), s('Homework', 'homework', 25), s('Read a book', 'read', 15), s('Free play', 'play')] },
  { name: 'Teen Morning', block: 'morning', ages: '11+', steps: [s('Shower', 'shower', 10), s('Get dressed', 'dress'), s('Breakfast', 'breakfast', 10), s('Pack bag', 'backpack'), s('Meds / vitamins', 'vitamin')] },
  { name: 'Chore Blitz', block: 'after_school', ages: '6+', steps: [s('Tidy toys', 'tidy', 5), s('Dishes', 'dishes', 10), s('Take out trash', 'trash'), s('Feed pet', 'pet-dog')] },
]

export async function seedStarter() {
  if ((await db.lists.count()) === 0) {
    await db.lists.add({ name: 'Groceries' } as never)
    await db.lists.add({ name: 'Packing' } as never)
  }
  if ((await db.rewards.count()) === 0) {
    await db.rewards.bulkAdd([
      { title: 'Pick a family movie', cost: 60, scope: 'team' },
      { title: 'Extra 15 min of reading time with a parent', cost: 40, scope: 'personal' },
      { title: 'Choose Friday dinner', cost: 80, scope: 'personal' },
    ] as never[])
  }
}

export async function seedSample() {
  await db.members.bulkAdd([
    { name: 'Alex', role: 'parent', color: '#8d7bff', icon: 'smile' },
    { name: 'Sam', role: 'parent', color: '#50e0bd', icon: 'star' },
    { name: 'Maya', role: 'child', age: 7, color: '#ff7fb2', icon: 'rabbit' },
    { name: 'Leo', role: 'child', age: 4, color: '#ffca70', icon: 'dog' },
  ] as never[])
  const ms = await db.members.toArray()
  const maya = ms.find((m) => m.name === 'Maya')!
  const leo = ms.find((m) => m.name === 'Leo')!
  await setKV('quest', { ...DEFAULT_QUEST, since: Date.now() })
  await seedStarter()
  await db.routines.add({ ...TEMPLATES[0], block: 'morning', memberId: leo.id, days: [0, 1, 2, 3, 4, 5, 6] } as never)
  await db.routines.add({ ...TEMPLATES[2], memberId: maya.id, days: [1, 2, 3, 4, 5] } as never)
  await db.events.add({ title: 'Soccer practice', date: todayStr(), start: '17:00', end: '18:00', memberIds: [maya.id], remindMin: 30, repeat: 'weekly' } as never)
  await db.chores.bulkAdd([
    { title: 'Unload dishwasher', points: 10, repeat: 'daily' },
    { title: 'Water the plants', points: 8, repeat: 'weekly' },
  ] as never[])
}
