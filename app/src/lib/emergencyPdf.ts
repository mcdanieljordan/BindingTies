// A one-page-per-person emergency sheet for the fridge, a sitter, a grandparent or a paramedic.
import type { EmergencyContact, EmergencyInfo, Med, Member } from '../db'
import { clean } from './pdf'

export interface SheetPerson { member: Member; info?: EmergencyInfo; meds: Med[] }
export interface SheetOptions { household?: EmergencyInfo; people: SheetPerson[]; includeAddress: boolean; includeInsurance: boolean; includeMeds: boolean; printedOn: string }

const W = 612, H = 792, M = 46, CW = W - M * 2, BOTTOM = H - 52
const RED: [number, number, number] = [200, 40, 50]
const INK: [number, number, number] = [24, 28, 40]
const MUTED: [number, number, number] = [105, 112, 128]
const LINE: [number, number, number] = [214, 218, 226]

const ageOf = (dob?: string) => {
  if (!dob || !/^\d{4}-\d{2}-\d{2}$/.test(dob)) return ''
  const d = new Date(dob + 'T00:00:00'), n = new Date()
  let a = n.getFullYear() - d.getFullYear()
  if (n.getMonth() < d.getMonth() || (n.getMonth() === d.getMonth() && n.getDate() < d.getDate())) a--
  return a >= 0 ? String(a) : ''
}
const niceDate = (d?: string) => (d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : d ?? '')
const times = (ts: string[]) => ts.map((t) => { const [h, m] = t.split(':').map(Number); return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}` }).join(', ')

export async function buildEmergencyPdf(o: SheetOptions): Promise<{ bytes: Uint8Array; pages: number }> {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'pt', format: 'letter', compress: true })
  let y = 0
  let who = ''
  const font = (style: 'normal' | 'bold' | 'italic', size: number) => { doc.setFont('helvetica', style); doc.setFontSize(size) }
  const color = (c: [number, number, number]) => doc.setTextColor(c[0], c[1], c[2])
  const wrap = (t: string, w: number) => doc.splitTextToSize(clean(t), w) as string[]
  const header = (name: string, cont: boolean) => {
    doc.setFillColor(...RED); doc.rect(0, 0, W, 66, 'F')
    font('bold', 21); doc.setTextColor(255, 255, 255); doc.text('EMERGENCY INFORMATION', M, 32)
    font('normal', 12); doc.text(cont ? `${clean(name)} (continued)` : 'In an emergency, call 911 first.', M, 52)
    y = 90
  }
  const page = (name: string, cont = false) => { if (cont) doc.addPage(); header(name, cont) }
  const ensure = (h: number) => { if (y + h > BOTTOM) { doc.addPage(); header(who, true) } }
  const label = (t: string) => { ensure(34); font('bold', 9); color(RED); doc.text(t.toUpperCase(), M, y + 9); y += 16 }
  const block = (t: string, size = 12, style: 'normal' | 'bold' = 'normal') => {
    font(style, size); color(INK)
    for (const l of wrap(t, CW)) { ensure(size + 5); doc.text(l, M, y + size); y += size + 4 }
    y += 6
  }
  const rule = () => { doc.setDrawColor(...LINE); doc.setLineWidth(0.7); doc.line(M, y, W - M, y); y += 12 }

  const h = o.household
  o.people.forEach((p, idx) => {
    const info = p.info
    who = p.member.name
    if (idx === 0) page(who); else { doc.addPage(); header(who, false) }

    // ---- who ----
    font('bold', 30); color(INK)
    const name = clean(info?.fullName?.trim() || p.member.name)
    for (const l of wrap(name, CW).slice(0, 2)) { doc.text(l, M, y + 26); y += 34 }
    const age = ageOf(info?.dob) || (p.member.age ? String(p.member.age) : '')
    const bits = [age && `Age ${age}`, info?.dob && `Born ${niceDate(info.dob)}`, info?.blood && `Blood type ${info.blood}`].filter(Boolean) as string[]
    if (bits.length) { font('normal', 13); color(MUTED); doc.text(clean(bits.join('   -   ')), M, y + 12); y += 24 } else y += 6

    // ---- allergies (the first thing anyone looks for) ----
    const allergies = info?.allergies?.trim()
    font('bold', 15) // measure in the size it will be drawn
    const al = allergies ? wrap(allergies, CW - 28) : []
    const boxH = 30 + Math.max(1, al.length) * 20
    ensure(boxH + 10)
    doc.setDrawColor(...RED); doc.setLineWidth(2); doc.setFillColor(253, 236, 238); doc.roundedRect(M, y, CW, boxH, 6, 6, 'FD')
    font('bold', 10); color(RED); doc.text('ALLERGIES', M + 12, y + 17)
    font(allergies ? 'bold' : 'italic', allergies ? 15 : 12); color(allergies ? INK : MUTED)
    ;(al.length ? al : ['Not recorded']).forEach((l, i) => doc.text(l, M + 12, y + 38 + i * 20))
    y += boxH + 14

    if (info?.conditions?.trim()) { label('Medical conditions'); block(info.conditions) }
    const meds = o.includeMeds ? p.meds.filter((m) => m.active) : []
    if (meds.length || info?.otherMeds?.trim()) {
      label('Medicines')
      for (const m of meds) block(`${m.name}${m.dose ? ' - ' + m.dose : ''}${m.times?.length ? ' - ' + times(m.times) : ''}${m.notes ? ' (' + m.notes + ')' : ''}`, 12, 'bold')
      if (info?.otherMeds?.trim()) block(info.otherMeds)
    }
    if (info?.doctor?.trim() || info?.doctorPhone?.trim()) {
      label('Doctor'); block([info?.doctor, info?.doctorPhone].filter(Boolean).join('   -   '), 14, 'bold')
    }
    if (o.includeInsurance && (info?.insurer?.trim() || info?.insuranceId?.trim())) {
      label('Insurance'); block([info?.insurer, info?.insuranceId && `ID ${info.insuranceId}`].filter(Boolean).join('   -   '), 12)
    }
    if (info?.notes?.trim()) { label('Important notes'); block(info.notes) }

    // ---- who to call ----
    const contacts: EmergencyContact[] = []
    for (const c of [...(info?.contacts ?? []), ...(h?.contacts ?? [])]) if ((c.name || c.phone) && !contacts.some((x) => x.phone === c.phone && x.name === c.name)) contacts.push(c)
    if (contacts.length) {
      rule(); label('Who to call')
      for (const c of contacts) {
        ensure(24)
        font('bold', 14); color(INK); doc.text(clean(c.name || 'Contact'), M, y + 14)
        font('normal', 11); color(MUTED); doc.text(clean(c.relation || ''), M + 190, y + 14)
        font('bold', 15); color(INK); doc.text(clean(c.phone || ''), W - M, y + 14, { align: 'right' })
        y += 26
      }
      y += 4
    }

    // ---- the home ----
    const home = [
      o.includeAddress && h?.address?.trim() ? ['Home address', h.address] : null,
      ['Poison control', h?.poison?.trim() || '1-800-222-1222 (US)'],
      h?.hospital?.trim() || h?.hospitalPhone?.trim() ? ['Preferred hospital', [h?.hospital, h?.hospitalPhone].filter(Boolean).join('   -   ')] : null,
      h?.houseNotes?.trim() ? ['Good to know', h.houseNotes] : null,
    ].filter(Boolean) as string[][]
    if (home.length) {
      rule()
      for (const [k, v] of home) { label(k); block(v, 12) }
    }

    // footer on this person's last page
    font('italic', 8.5); color(MUTED)
    doc.text(clean(`Printed ${niceDate(o.printedOn)}${info?.updatedAt ? `  -  information last updated ${new Date(info.updatedAt).toLocaleDateString('en-US')}` : ''}  -  keep this current and out of sight of strangers`), M, H - 28)
    doc.text('BindingTies', W - M, H - 28, { align: 'right' })
  })
  if (!o.people.length) { page('Emergency'); font('italic', 12); color(MUTED); doc.text('No people selected.', M, y + 12) }
  return { bytes: new Uint8Array(doc.output('arraybuffer')), pages: doc.getNumberOfPages() }
}
