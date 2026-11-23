import { useEffect, useRef, useState } from 'react'
import { Film, ImagePlus, Mic, Music, Square, X } from 'lucide-react'
import type { JournalMedia } from '../db'
import { Modal } from './ui'
import { fmtDur, fmtSize, LIMITS, makeMedia, recorderType, useMediaUrl } from '../lib/media'

/** One attachment: photo thumbnail (tap to enlarge), audio player or video player. */
export function MediaItem({ m, onRemove }: { m: JournalMedia; onRemove?: () => void }) {
  const { url, err } = useMediaUrl(m)
  const [big, setBig] = useState(false)
  return (
    <div className="mitem">
      {m.kind === 'image' && (url ? <img src={url} alt={m.name} className="mthumb" onClick={() => setBig(true)} /> : <div className="mthumb muted small">{err || 'Loading…'}</div>)}
      {m.kind === 'audio' && (
        <div className="stack" style={{ gap: 4 }}>
          <div className="muted small"><Music size={13} style={{ verticalAlign: -2 }} /> {m.name}{m.durationSec ? ` • ${fmtDur(m.durationSec)}` : ''} • {fmtSize(m.size)}</div>
          {url ? <audio controls preload="none" src={url} style={{ width: '100%' }} /> : <div className="muted small">{err || 'Loading…'}</div>}
        </div>
      )}
      {m.kind === 'video' && (
        <div className="stack" style={{ gap: 4 }}>
          <div className="muted small"><Film size={13} style={{ verticalAlign: -2 }} /> {m.name} • {fmtSize(m.size)}</div>
          {url ? <video controls playsInline preload="metadata" src={url} style={{ width: '100%', maxHeight: 260, borderRadius: 12, background: '#000' }} /> : <div className="muted small">{err || 'Loading…'}</div>}
        </div>
      )}
      {onRemove && <button type="button" className="mremove" aria-label={`Remove ${m.name}`} onClick={onRemove}><X size={14} /></button>}
      {big && url && <Modal title={m.name} onClose={() => setBig(false)}><img src={url} alt={m.name} style={{ width: '100%', borderRadius: 12 }} /></Modal>}
    </div>
  )
}

export function MediaList({ items, onRemove }: { items: JournalMedia[]; onRemove?: (m: JournalMedia) => void }) {
  if (!items.length) return null
  const photos = items.filter((m) => m.kind === 'image')
  const rest = items.filter((m) => m.kind !== 'image')
  return (
    <div className="stack" style={{ gap: 8 }}>
      {photos.length > 0 && <div className="mgrid">{photos.map((m) => <MediaItem key={m.id} m={m} onRemove={onRemove && (() => onRemove(m))} />)}</div>}
      {rest.map((m) => <MediaItem key={m.id} m={m} onRemove={onRemove && (() => onRemove(m))} />)}
    </div>
  )
}

/** Buttons to add a photo, record a voice note, or add an audio/video file. */
export function AttachBar({ owner, onAdd, warn }: { owner: number; onAdd: (m: JournalMedia) => void; warn: (msg: string) => void }) {
  const photo = useRef<HTMLInputElement>(null)
  const other = useRef<HTMLInputElement>(null)
  const [rec, setRec] = useState<{ recorder: MediaRecorder; start: number } | null>(null)
  const [secs, setSecs] = useState(0)
  const chunks = useRef<Blob[]>([])

  useEffect(() => {
    if (!rec) return
    const t = setInterval(() => { const s = Math.round((Date.now() - rec.start) / 1000); setSecs(s); if (s >= LIMITS.voiceMaxSec) rec.recorder.stop() }, 500)
    return () => clearInterval(t)
  }, [rec])
  useEffect(() => () => { rec?.recorder.state === 'recording' && rec.recorder.stop() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function addFiles(files: FileList | null) {
    for (const f of Array.from(files ?? [])) {
      const m = await makeMedia(f, f.name || 'File', owner)
      if (typeof m === 'string') warn(m); else onAdd(m)
    }
  }
  async function startRec() {
    const type = recorderType()
    if (!type || !navigator.mediaDevices?.getUserMedia) return warn('This device cannot record audio here. You can add an audio file instead.')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream, { mimeType: type })
      chunks.current = []
      const start = Date.now()
      recorder.ondataavailable = (e) => { if (e.data.size) chunks.current.push(e.data) }
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop())
        setRec(null); setSecs(0)
        const blob = new Blob(chunks.current, { type: type.split(';')[0] })
        if (!blob.size) return
        const d = new Date()
        const m = await makeMedia(blob, `Voice note ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`, owner, Math.round((Date.now() - start) / 1000))
        if (typeof m === 'string') warn(m); else onAdd(m)
      }
      recorder.start()
      setRec({ recorder, start })
    } catch { warn('Allow the microphone to record a voice note.') }
  }

  return (
    <div className="stack" style={{ gap: 6 }}>
      <div className="row" style={{ gap: 6 }}>
        <button type="button" className="btn sm" onClick={() => photo.current?.click()} disabled={!!rec}><ImagePlus size={14} />Photo</button>
        {rec
          ? <button type="button" className="btn sm danger" onClick={() => rec.recorder.stop()}><Square size={14} />Stop {fmtDur(secs)}</button>
          : <button type="button" className="btn sm" onClick={startRec}><Mic size={14} />Voice note</button>}
        <button type="button" className="btn sm" onClick={() => other.current?.click()} disabled={!!rec}><Music size={14} />Audio / video file</button>
      </div>
      <input ref={photo} type="file" accept="image/*" multiple hidden onChange={(e) => { void addFiles(e.target.files); e.target.value = '' }} />
      <input ref={other} type="file" accept="audio/*,video/*" multiple hidden onChange={(e) => { void addFiles(e.target.files); e.target.value = '' }} />
      <div className="muted small">Photos are shrunk to save space. Audio up to {fmtSize(LIMITS.audio)}, video up to {fmtSize(LIMITS.video)}.</div>
    </div>
  )
}
