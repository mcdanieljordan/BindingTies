import { Capacitor } from '@capacitor/core'

const b64 = (bytes: Uint8Array) => { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(s) }

/** Web: downloads the PDF. Android app: opens the phone's share sheet so it can be saved to Files or Drive, or sent. */
export async function savePdf(bytes: Uint8Array, name: string): Promise<'saved' | 'shared'> {
  if (Capacitor.isNativePlatform()) {
    const { Filesystem, Directory } = await import('@capacitor/filesystem')
    const { Share } = await import('@capacitor/share')
    const w = await Filesystem.writeFile({ path: name, data: b64(bytes), directory: Directory.Cache })
    await Share.share({ title: name, url: w.uri, dialogTitle: 'Save or send your journal' })
    return 'shared'
  }
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' }))
  const a = document.createElement('a')
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 30_000)
  return 'saved'
}
