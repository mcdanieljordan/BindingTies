import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { Modal } from './ui'
import { useApp } from '../ctx'
import { deleteMyAccount } from '../sync/account'
import { stopSync } from '../sync/engine'
import { setKV, wipeLocal } from '../db'

/** `lastParent`: nobody else could run the family, so deleting this login deletes the family for everyone. */
export default function DeleteAccount({ lastParent, email }: { lastParent: boolean; email?: string }) {
  const { toast } = useApp()
  const [open, setOpen] = useState(false)
  const [word, setWord] = useState('')
  const [busy, setBusy] = useState(false)

  async function go() {
    setBusy(true)
    try {
      await deleteMyAccount()
      stopSync(); await wipeLocal(); await setKV('localOnly', false)
      location.reload()
    } catch (e) { toast({ title: 'Account not deleted', body: (e as Error).message, kind: 'warn' }); setBusy(false) }
  }

  return (
    <>
      <button className="btn ghost" style={{ color: 'var(--red, #e5484d)' }} onClick={() => setOpen(true)}><Trash2 size={14} />Delete my account</button>
      {open && (
        <Modal title="Delete my account" onClose={() => { if (!busy) { setOpen(false); setWord('') } }}>
          <div className="stack">
            {lastParent
              ? <div className="err" role="alert"><b>You are the only parent on this family.</b> Deleting your account deletes the whole family for everyone: the calendar, chores, points, journals, photos, emergency information and sitter links. Other people's logins will be left with no family.</div>
              : <div>This deletes {email ? <b>{email}</b> : 'your sign-in'}, your private journal entries and their photos and recordings, and your notification settings. The family and everyone else's information stay.</div>}
            <div className="muted">This cannot be undone. If you want to keep a copy first, go back and use <b>Export backup</b> in Settings.</div>
            <label className="f">Type DELETE to confirm<input value={word} onChange={(e) => setWord(e.target.value)} autoCapitalize="characters" autoComplete="off" /></label>
            <div className="row between">
              <button className="btn" disabled={busy} onClick={() => { setOpen(false); setWord('') }}>Keep my account</button>
              <button className="btn danger" disabled={busy || word.trim() !== 'DELETE'} onClick={go}>{busy ? 'Deleting…' : 'Delete forever'}</button>
            </div>
          </div>
        </Modal>
      )}
    </>
  )
}
