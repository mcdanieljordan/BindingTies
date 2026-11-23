// Builds a journal "photo book" PDF. This file draws pages only; photos arrive already prepared (see pdfPrep.ts).
import type { JournalEntry } from '../db'

export interface PdfImage { dataUrl: string; w: number; h: number }
export interface PdfEntry {
  entry: JournalEntry
  author: string
  mine: boolean
  photos: PdfImage[]
  /** audio / video / other files that cannot go on a page */
  other: { kind: 'audio' | 'video' | 'file'; name: string; durationSec?: number }[]
  /** photos that could not be loaded (offline, removed) */
  missingPhotos: number
}
export interface PdfOptions { title: string; subtitle: string; byLine: string; entries: PdfEntry[]; includeGoals: boolean }
export interface PdfResult { bytes: Uint8Array; pages: number; unsupportedChars: number }

const W = 612, H = 792, M = 54, CW = W - M * 2, TOP = M, BOTTOM = H - 60
const ACCENT: [number, number, number] = [124, 108, 255]
const INK: [number, number, number] = [28, 35, 51]
const MUTED: [number, number, number] = [108, 117, 133]
const LINE: [number, number, number] = [221, 224, 232]

let lost = 0
/** The built-in PDF fonts cover Western European letters only: tidy punctuation, drop emoji, mark anything else. */
export function clean(s: string): string {
  return s.normalize('NFC')
    .replace(/[‘’‚′]/g, "'").replace(/[“”„″]/g, '"').replace(/[–—−]/g, '-')
    .replace(/…/g, '...').replace(/[•●◦]/g, '-').replace(/[   ]/g, ' ').replace(/\r\n?/g, '\n')
    .replace(/[\u{1F000}-\u{1FFFF}☀-➿⬀-⯿️‍⃣]/gu, () => { lost++; return '' })
    .replace(/[^\n\t\x20-\x7E¡-ÿ]/g, () => { lost++; return '?' })
}

const longDate = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
const monthName = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
const dur = (s?: number) => (s ? ` (${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')})` : '')

export async function buildPdf(o: PdfOptions): Promise<PdfResult> {
  lost = 0
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'pt', format: 'letter', compress: true })
  let y = TOP
  let cont = '' // the entry being drawn: if it spills onto a new page, say whose page this is
  const newPage = () => {
    doc.addPage(); y = TOP
    if (cont) { doc.setFont('helvetica', 'italic'); doc.setFontSize(9); doc.setTextColor(...MUTED); doc.text(`${cont} (continued)`, M, y + 8); y += 22 }
  }
  const ensure = (h: number) => { if (y + h > BOTTOM) newPage() }
  const color = (c: [number, number, number]) => doc.setTextColor(c[0], c[1], c[2])
  const font = (style: 'normal' | 'bold' | 'italic', size: number) => { doc.setFont('helvetica', style); doc.setFontSize(size) }
  const lines = (t: string, width: number) => doc.splitTextToSize(clean(t), width) as string[]

  // ---- cover ----
  doc.setFillColor(...ACCENT); doc.rect(0, 0, W, 230, 'F')
  font('bold', 34); doc.setTextColor(255, 255, 255)
  const tl = lines(o.title || 'My journal', CW).slice(0, 3)
  tl.forEach((l, i) => doc.text(l, M, 120 + i * 40))
  font('normal', 15); doc.setTextColor(238, 235, 255)
  doc.text(clean(o.subtitle), M, 120 + tl.length * 40 + 8)
  font('normal', 13); color(INK)
  doc.text(clean(o.byLine), M, 290)
  const photos = o.entries.reduce((n, e) => n + e.photos.length, 0)
  const rec = o.entries.reduce((n, e) => n + e.other.length, 0)
  font('normal', 12); color(MUTED)
  const parts = [`${o.entries.length} ${o.entries.length === 1 ? 'entry' : 'entries'}`, photos ? `${photos} ${photos === 1 ? 'photo' : 'photos'}` : '', rec ? `${rec} ${rec === 1 ? 'recording or video' : 'recordings and videos'} (kept in the app)` : ''].filter(Boolean)
  doc.text(parts.join('   -   '), M, 312)
  font('italic', 10); color(MUTED)
  doc.text('Made with BindingTies', M, H - 54)

  // ---- entries ----
  let month = ''
  newPage()
  for (const pe of o.entries) {
    const e = pe.entry
    if (monthName(e.date) !== month) {
      month = monthName(e.date)
      ensure(70)
      font('bold', 19); color(ACCENT); doc.text(month, M, y + 16)
      doc.setDrawColor(...LINE); doc.setLineWidth(1); doc.line(M, y + 24, W - M, y + 24)
      y += 44
    }
    cont = ''
    ensure(86)
    cont = longDate(e.date)
    // date bar
    doc.setFillColor(...ACCENT); doc.rect(M, y, 4, 17, 'F')
    font('bold', 12); color(INK); doc.text(longDate(e.date), M + 12, y + 13)
    const tag = `${e.kind === 'plan' ? 'Plan' : 'Journal'}${pe.mine ? '' : ' - from ' + pe.author}`
    font('normal', 10); color(MUTED); doc.text(clean(tag), W - M, y + 13, { align: 'right' })
    y += 28
    if (e.title?.trim()) {
      font('bold', 15); color(INK)
      for (const l of lines(e.title, CW)) { ensure(20); doc.text(l, M, y + 13); y += 20 }
      y += 2
    }
    if (e.body?.trim()) {
      font('normal', 11); color(INK)
      for (const l of lines(e.body, CW)) { ensure(15); doc.text(l, M, y + 11); y += 15 }
      y += 4
    }
    if (o.includeGoals && e.goals?.length) {
      y += 4
      for (const g of e.goals) {
        const gl = lines(g.text, CW - 22)
        ensure(gl.length * 15 + 4)
        doc.setDrawColor(...INK); doc.setLineWidth(1); doc.rect(M, y + 2, 10, 10)
        if (g.done) { doc.setLineWidth(1.6); doc.line(M + 2, y + 7, M + 4.5, y + 10); doc.line(M + 4.5, y + 10, M + 9, y + 3) }
        font('normal', 11); color(g.done ? MUTED : INK)
        gl.forEach((l, i) => doc.text(l, M + 20, y + 11 + i * 15))
        y += gl.length * 15 + 3
      }
      y += 4
    }
    // photos: one big, or two per row
    if (pe.photos.length) {
      y += 6
      const gap = 10
      const fit = (p: PdfImage, maxW: number, maxH: number) => { const s = Math.min(maxW / p.w, maxH / p.h); return { w: p.w * s, h: p.h * s } }
      if (pe.photos.length === 1) {
        const f = fit(pe.photos[0], Math.min(CW, 420), 330)
        ensure(f.h + 8)
        doc.addImage(pe.photos[0].dataUrl, 'JPEG', M, y, f.w, f.h, undefined, 'FAST')
        y += f.h + 10
      } else {
        const cell = (CW - gap) / 2
        for (let i = 0; i < pe.photos.length; i += 2) {
          const row = pe.photos.slice(i, i + 2).map((p) => ({ p, ...fit(p, cell, 230) }))
          const rowH = Math.max(...row.map((r) => r.h))
          ensure(rowH + 8)
          row.forEach((r, k) => doc.addImage(r.p.dataUrl, 'JPEG', M + k * (cell + gap), y, r.w, r.h, undefined, 'FAST'))
          y += rowH + gap
        }
      }
    }
    if (pe.missingPhotos) { font('italic', 10); color(MUTED); ensure(16); doc.text(`${pe.missingPhotos} photo${pe.missingPhotos === 1 ? '' : 's'} could not be loaded for this printout.`, M, y + 10); y += 16 }
    for (const m of pe.other) {
      font('italic', 10); color(MUTED); ensure(18)
      const label = m.kind === 'audio' ? 'Audio' : m.kind === 'video' ? 'Video' : 'File'
      doc.setFillColor(...ACCENT); doc.roundedRect(M, y + 1, 36, 13, 3, 3, 'F')
      doc.setTextColor(255, 255, 255); font('bold', 8); doc.text(label.toUpperCase(), M + 18, y + 10, { align: 'center' })
      font('italic', 10); color(MUTED)
      const t = lines(`${m.name}${dur(m.durationSec)} - attached to this entry, open it in BindingTies to ${m.kind === 'audio' ? 'listen' : 'watch'}`, CW - 46)
      t.forEach((l, i) => doc.text(l, M + 44, y + 11 + i * 13))
      y += Math.max(18, t.length * 13 + 5)
    }
    y += 6
    ensure(24)
    cont = ''
    doc.setDrawColor(...LINE); doc.setLineWidth(0.6); doc.line(M, y, W - M, y)
    y += 22
  }
  if (!o.entries.length) { font('italic', 12); color(MUTED); doc.text('There are no entries in this range.', M, 120) }

  // ---- footers ----
  const total = doc.getNumberOfPages()
  for (let p = 2; p <= total; p++) {
    doc.setPage(p)
    font('normal', 9); color(MUTED)
    doc.text(clean(o.title || 'Journal'), M, H - 32)
    doc.text(`Page ${p - 1} of ${total - 1}`, W - M, H - 32, { align: 'right' })
  }
  return { bytes: new Uint8Array(doc.output('arraybuffer')), pages: total, unsupportedChars: lost }
}
