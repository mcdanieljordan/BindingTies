import { Capacitor, registerPlugin } from '@capacitor/core'

const SaveFile = registerPlugin<{ sharePdf(o: { data: string; name: string; title?: string }): Promise<void> }>('SaveFile')

const b64 = (bytes: Uint8Array) => { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(s) }

/** Web: downloads the PDF. Android app: opens the phone's share sheet so it can be saved to Files or Drive, or sent. */
export async function savePdf(bytes: Uint8Array, name: string): Promise<'saved' | 'shared'> {
  if (Capacitor.isNativePlatform()) {
    await SaveFile.sharePdf({ data: b64(bytes), name, title: 'Save or send your journal' })
    return 'shared'
  }
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' }))
  const a = document.createElement('a')
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 30_000)
  return 'saved'
}
