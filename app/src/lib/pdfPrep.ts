// Browser side of printing: turn entries and their files into what the PDF layout needs.
import type { JournalEntry, JournalMedia, Member } from '../db'
import type { PdfEntry, PdfImage } from './pdf'
import { mediaBlob } from './media'

const dataUrl = (b: Blob) => new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result as string); r.onerror = () => rej(r.error); r.readAsDataURL(b) })

/** PDF photos: flat white background, 1400 px on the long side, JPEG. Keeps a 50-photo book in a few MB. */
export async function toJpeg(blob: Blob, maxSide = 1400): Promise<PdfImage | null> {
  try {
    const bmp = await createImageBitmap(blob)
    const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height))
    const c = document.createElement('canvas')
    c.width = Math.max(1, Math.round(bmp.width * scale)); c.height = Math.max(1, Math.round(bmp.height * scale))
    const g = c.getContext('2d')!
    g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(bmp, 0, 0, c.width, c.height)
    const out = await new Promise<Blob | null>((res) => c.toBlob(res, 'image/jpeg', 0.8))
    return out ? { dataUrl: await dataUrl(out), w: c.width, h: c.height } : null
  } catch { return null }
}

export async function prepareEntries(entries: JournalEntry[], media: JournalMedia[], members: Member[], me: Member, withPhotos: boolean, onProgress?: (done: number, total: number) => void): Promise<PdfEntry[]> {
  const total = withPhotos ? media.filter((m) => m.kind === 'image' && entries.some((e) => e.id === m.entryId)).length : 0
  let done = 0
  const out: PdfEntry[] = []
  for (const e of entries) {
    const mine = e.ownerMemberId === me.id
    const att = media.filter((m) => m.entryId === e.id).sort((a, b) => a.createdAt - b.createdAt)
    const photos: PdfImage[] = []
    let missing = 0
    if (withPhotos) {
      for (const m of att.filter((x) => x.kind === 'image')) {
        const b = await mediaBlob(m)
        const j = b ? await toJpeg(b) : null
        if (j) photos.push(j); else missing++
        onProgress?.(++done, total)
      }
    }
    out.push({
      entry: e, mine, author: members.find((x) => x.id === e.ownerMemberId)?.name ?? 'someone', photos, missingPhotos: missing,
      other: att.filter((m) => m.kind !== 'image').map((m) => ({ kind: m.kind === 'audio' ? 'audio' : m.kind === 'video' ? 'video' : 'file', name: m.name, durationSec: m.durationSec })),
    })
  }
  return out
}
