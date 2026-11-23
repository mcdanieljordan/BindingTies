import type { Member } from '../db'
import { Avatar } from '../lib/icons'

export default function WhoIs({ members, onPick, onClose }: { members: Member[]; onPick: (id: number) => void; onClose?: () => void }) {
  return (
    <div className="gate">
      <div className="gate-card" style={{ width: 'min(680px, 100%)' }}>
        <h1>Who is using BindingTies?</h1>
        <p>Tap your name.</p>
        <div className="who-grid">
          {members.map((m) => (
            <button key={m.id} className="who" onClick={() => onPick(m.id)}>
              <Avatar icon={m.icon} color={m.color} size={84} />
              {m.name}
            </button>
          ))}
        </div>
        {onClose && <button className="btn huge" onClick={onClose}>Cancel</button>}
      </div>
    </div>
  )
}
