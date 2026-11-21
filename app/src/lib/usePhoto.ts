import { useEffect, useState } from 'react'
import { db } from '../db'

export function usePhoto(id?: number) {
  const [url, setUrl] = useState<string>()
  useEffect(() => {
    let u: string | undefined
    let live = true
    if (id) db.photos.get(id).then((p) => { if (p && live) { u = URL.createObjectURL(p.blob); setUrl(u) } })
    else setUrl(undefined)
    return () => { live = false; if (u) URL.revokeObjectURL(u) }
  }, [id])
  return url
}

/** Downscale a picked image so photos stay small on device. */
export async function shrinkImage(file: File, max = 480): Promise<Blob> {
  const bmp = await createImageBitmap(file)
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height))
  const c = document.createElement('canvas')
  c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k)
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height)
  return new Promise((res) => c.toBlob((b) => res(b ?? file), 'image/jpeg', 0.85))
}
