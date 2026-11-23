// Photos, voice notes, audio and video for journal entries.
import { useEffect, useState } from 'react'
import { db, getKV, newId, type JournalMedia } from '../db'
import { sb } from '../sync/client'

export const BUCKET = 'family-files'
export const MB = 1024 * 1024
/** Free storage is about 1 GB for the whole family, so everything is kept small. */
export const LIMITS = { audio: 20 * MB, video: 25 * MB, imageIn: 30 * MB, voiceMaxSec: 600, imageSide: 1600 }

export const kindOf = (mime: string): JournalMedia['kind'] | null => (mime.startsWith('image/') ? 'image' : mime.startsWith('audio/') ? 'audio' : mime.startsWith('video/') ? 'video' : null)
export const fmtSize = (n: number) => (n >= MB ? `${(n / MB).toFixed(n >= 10 * MB ? 0 : 1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`)
export const fmtDur = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`

/** Phone photos are huge. Keep them readable (1600 px on the long side) at a fraction of the size. */
export async function shrinkImage(file: Blob): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file)
    const scale = Math.min(1, LIMITS.imageSide / Math.max(bmp.width, bmp.height))
    const c = document.createElement('canvas')
    c.width = Math.max(1, Math.round(bmp.width * scale)); c.height = Math.max(1, Math.round(bmp.height * scale))
    c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height)
    const out = await new Promise<Blob | null>((res) => c.toBlob(res, 'image/jpeg', 0.82))
    if (out && (scale < 1 || out.size < file.size)) return out
  } catch { /* some formats cannot be read here; keep the original */ }
  return file
}

/** Turns a chosen file into a media record, or explains why it cannot be added. */
export async function makeMedia(file: File | Blob, name: string, owner: number, durationSec?: number): Promise<JournalMedia | string> {
  const kind = kindOf(file.type)
  if (!kind) return `"${name}" is not a photo, audio or video file.`
  if (kind === 'audio' && file.size > LIMITS.audio) return `"${name}" is ${fmtSize(file.size)}. Audio can be up to ${fmtSize(LIMITS.audio)}.`
  if (kind === 'video' && file.size > LIMITS.video) return `"${name}" is ${fmtSize(file.size)}. Video can be up to ${fmtSize(LIMITS.video)}. Try a shorter clip.`
  if (kind === 'image' && file.size > LIMITS.imageIn) return `"${name}" is too large.`
  const blob = kind === 'image' ? await shrinkImage(file) : file
  return { id: newId(), entryId: 0, ownerMemberId: owner, kind, name, mime: blob.type || file.type, size: blob.size, durationSec, createdAt: Date.now(), blob }
}

const cache = new Map<number, { url: string; exp: number }>()
/** A playable address for a file: the local copy if this device has it, otherwise a short-lived private link. */
export function useMediaUrl(m: JournalMedia) {
  const [url, setUrl] = useState<string | undefined>()
  const [err, setErr] = useState('')
  useEffect(() => {
    let alive = true
    let obj: string | undefined
    setErr(''); setUrl(undefined)
    void (async () => {
      if (m.blob) { obj = URL.createObjectURL(m.blob); if (alive) setUrl(obj); return }
      if (!sb || !m.blobPath) { if (alive) setErr('Still uploading from the other device.'); return }
      const hit = cache.get(m.id)
      if (hit && hit.exp > Date.now()) { setUrl(hit.url); return }
      const { data, error } = await sb.storage.from(BUCKET).createSignedUrl(m.blobPath, 3600)
      if (error || !data) { if (alive) setErr('Could not open this. Check your connection.'); return }
      cache.set(m.id, { url: data.signedUrl, exp: Date.now() + 3_000_000 })
      if (alive) setUrl(data.signedUrl)
    })()
    return () => { alive = false; if (obj) URL.revokeObjectURL(obj) }
  }, [m.id, m.blob, m.blobPath])
  return { url, err }
}

/** Deletes a file from private storage (best effort), then its record. */
export async function removeMedia(m: JournalMedia) {
  if (sb) {
    // the author's own device does not keep the file's address, but it is always <family>/journalMedia/<id>
    const fam = await getKV<{ id: string; status: string } | null>('sync:family', null)
    const path = m.blobPath ?? (fam?.status === 'approved' ? `${fam.id}/journalMedia/${m.id}` : undefined)
    if (path) { try { await sb.storage.from(BUCKET).remove([path]) } catch { /* a leftover file is harmless */ } }
  }
  cache.delete(m.id)
  await db.journalMedia.delete(m.id)
}

/** The types a voice recording can use here (Android and desktop: webm; iPhone: mp4). */
export const recorderType = () => ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'].find((t) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(t))
