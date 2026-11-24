"use client"

/**
 * Friskvårdskvittot (v75) – data och PDF.
 *
 * Kvittot innehåller det Skatteverket kräver av underlaget för friskvårdsbidrag:
 * säljarens företagsnamn, adress och organisationsnummer, köparens namn (och
 * valfritt personnummer), vilken friskvårdsaktivitet som köpts, datum, belopp
 * och moms. Säljaren är PT:n; Coaviras serviceavgift står på en egen rad och
 * ingår inte i friskvårdsaktiviteten.
 *
 * PDF:en skapas i appen (pdf-lib, laddas först vid nedladdning). Personnumret
 * skickas aldrig till servern och sparas inte – det skrivs bara in i filen.
 */
import { isNativeApp } from "@/lib/native/app"

export const RECEIPT_SERVICE_DESCRIPTION = "Personlig träning & individanpassat träningsupplägg (Friskvårdsaktivitet)"

export interface WellnessReceiptLine {
  title: string
  quantity: number
  unitPriceSek: number
  priceSek: number
  isWellnessPackage: boolean
}

export interface WellnessReceipt {
  checkoutId: string
  receiptNumber: string
  paidAt: string
  buyerName: string
  seller: {
    name: string
    companyName: string
    orgNumber: string | null
    companyAddress: string
    vatRegistered: boolean
    /** Företagsnamn, organisationsnummer och adress finns. */
    complete: boolean
  }
  lines: WellnessReceiptLine[]
  subtotalSek: number
  serviceFeeSek: number
  totalSek: number
  /** 6 för momsregistrerad PT, annars 0. */
  vatRate: number
}

/** Svaret från get_wellness_receipt() (snake_case) → appens form. */
export function receiptFromRpc(r: Record<string, unknown>): WellnessReceipt {
  const s = (r.seller ?? {}) as Record<string, unknown>
  const lines = (Array.isArray(r.lines) ? r.lines : []) as Record<string, unknown>[]
  return {
    checkoutId: String(r.checkout_id),
    receiptNumber: String(r.receipt_number),
    paidAt: String(r.paid_at),
    buyerName: String(r.buyer_name ?? ""),
    seller: {
      name: String(s.name ?? ""),
      companyName: String(s.company_name ?? ""),
      orgNumber: s.org_number ? String(s.org_number) : null,
      companyAddress: String(s.company_address ?? ""),
      vatRegistered: s.vat_registered !== false,
      complete: s.complete === true,
    },
    lines: lines.map((l) => ({
      title: String(l.title),
      quantity: Number(l.quantity) || 1,
      unitPriceSek: Number(l.unit_price_sek) || 0,
      priceSek: Number(l.price_sek) || 0,
      isWellnessPackage: l.is_wellness_package === true,
    })),
    subtotalSek: Number(r.subtotal_sek) || 0,
    serviceFeeSek: Number(r.service_fee_sek) || 0,
    totalSek: Number(r.total_sek) || 0,
    vatRate: Number(r.vat_rate) || 0,
  }
}

/** Momsen som ingår i beloppet (öre-avrundad). 3 495 kr med 6 % → 197,83 kr. */
export const includedVat = (amountSek: number, rate: number) => (rate > 0 ? Math.round((amountSek * rate * 100) / (100 + rate)) / 100 : 0)

const money = (n: number, decimals = 2) =>
  `${new Intl.NumberFormat("sv-SE", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(n).replace(/[  ]/g, " ")} kr`

const dateSv = (iso: string) => new Date(iso).toLocaleDateString("sv-SE", { timeZone: "Europe/Stockholm" })

/** PDF-typsnittet (Helvetica, WinAnsi) klarar svenska tecken men inte t.ex. emoji. */
const pdfText = (s: string) => s.replace(/[  ]/g, " ").replace(/[^\x20-\x7e\xa0-\xff–—‘’“”•€]/g, "?")

export const receiptFileName = (r: WellnessReceipt) => `friskvardskvitto-${r.receiptNumber}.pdf`

/** Skapar kvittot som PDF (A4). */
export async function buildReceiptPdf(r: WellnessReceipt, opts: { personnummer?: string | null } = {}): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib")
  const doc = await PDFDocument.create()
  doc.setTitle(`Friskvårdskvitto ${r.receiptNumber}`)
  doc.setAuthor(r.seller.companyName || r.seller.name)
  doc.setProducer("Coavira")
  doc.setCreator("Coavira")
  const page = doc.addPage([595.28, 841.89])
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const ink = rgb(0.075, 0.098, 0.086) // #131916
  const muted = rgb(0.4, 0.43, 0.41)
  const lime = rgb(0.518, 0.8, 0.086) // #84cc16
  const left = 56
  const right = 595.28 - 56
  let y = 841.89 - 56

  const text = (s: string, x: number, size = 10, f = font, color = ink) => page.drawText(pdfText(s), { x, y, size, font: f, color })
  const textRight = (s: string, size = 10, f = font, color = ink) => {
    const t = pdfText(s)
    page.drawText(t, { x: right - f.widthOfTextAtSize(t, size), y, size, font: f, color })
  }
  const wrap = (s: string, width: number, size: number, f = font) => {
    const words = pdfText(s).split(/\s+/)
    const lines: string[] = []
    let line = ""
    for (const w of words) {
      const next = line ? `${line} ${w}` : w
      if (f.widthOfTextAtSize(next, size) > width && line) {
        lines.push(line)
        line = w
      } else line = next
    }
    if (line) lines.push(line)
    return lines
  }
  const rule = (color = rgb(0.86, 0.88, 0.86)) => page.drawLine({ start: { x: left, y }, end: { x: right, y }, thickness: 0.8, color })

  // Sidhuvud: limegrön list, rubrik och kvittonummer.
  page.drawRectangle({ x: 0, y: 841.89 - 8, width: 595.28, height: 8, color: lime })
  text("Kvitto – friskvård", left, 22, bold)
  textRight("Coavira", 12, bold, muted)
  y -= 22
  text(`Kvittonummer: ${r.receiptNumber}`, left, 10, font, muted)
  textRight(`Betalningsdatum: ${dateSv(r.paidAt)}`, 10, font, muted)
  y -= 28

  // Säljare och köpare sida vid sida.
  const col2 = left + 260
  const yTop = y
  text("Säljare", left, 9, bold, muted)
  y -= 15
  const seller = [
    r.seller.companyName || r.seller.name,
    r.seller.orgNumber ? `Org.nr ${r.seller.orgNumber}` : "Organisationsnummer saknas",
    ...wrap(r.seller.companyAddress || "Adress saknas", 230, 10),
    r.seller.vatRegistered ? "Momsregistrerad" : "Säljaren är inte momsregistrerad",
  ]
  for (const s of seller) {
    text(s, left, 10)
    y -= 14
  }
  const yAfterSeller = y
  y = yTop
  text("Köpare", col2, 9, bold, muted)
  y -= 15
  text(r.buyerName, col2, 10)
  y -= 14
  if (opts.personnummer) {
    text(`Personnummer ${opts.personnummer}`, col2, 10)
    y -= 14
  }
  y = Math.min(y, yAfterSeller) - 18

  // Tjänsten.
  text("Friskvårdsaktivitet", left, 9, bold, muted)
  y -= 15
  text(RECEIPT_SERVICE_DESCRIPTION, left, 11, bold)
  y -= 24

  // Rader.
  text("Specifikation", left, 9, bold, muted)
  textRight("Belopp", 9, bold, muted)
  y -= 8
  rule()
  y -= 16
  for (const l of r.lines) {
    const title = l.quantity > 1 ? `${l.title} (${l.quantity} × ${money(l.unitPriceSek, 0)})` : l.title
    const rows = wrap(title, right - left - 110, 10)
    rows.forEach((row, i) => {
      text(row, left, 10)
      if (i === 0) textRight(money(l.priceSek))
      y -= 14
    })
    y -= 4
  }
  rule()
  y -= 16
  text("Summa friskvårdsaktivitet", left, 10, bold)
  textRight(money(r.subtotalSek), 10, bold)
  y -= 14
  if (r.vatRate > 0) {
    text(`varav moms ${r.vatRate} %`, left, 10, font, muted)
    textRight(money(includedVat(r.subtotalSek, r.vatRate)), 10, font, muted)
    y -= 14
    text(`Belopp exkl. moms`, left, 10, font, muted)
    textRight(money(r.subtotalSek - includedVat(r.subtotalSek, r.vatRate)), 10, font, muted)
    y -= 14
  } else {
    text("Ingen moms (säljaren är inte momsregistrerad)", left, 10, font, muted)
    y -= 14
  }
  if (r.serviceFeeSek > 0) {
    y -= 6
    text("Serviceavgift till Coavira (bokning och betalning)", left, 10)
    textRight(money(r.serviceFeeSek))
    y -= 13
    text("Ingår inte i friskvårdsaktiviteten.", left, 9, font, muted)
    y -= 14
  }
  y -= 6
  rule(ink)
  y -= 20
  text("Totalt betalt", left, 13, bold)
  textRight(money(r.totalSek), 13, bold)
  y -= 16
  text("Betalt med kort via Coavira (Stripe).", left, 9, font, muted)

  // Sidfot.
  y = 70
  for (const line of wrap(
    `Kvittot är skapat av Coavira för säljarens räkning. Säljaren (${r.seller.companyName || r.seller.name}) tillhandahåller friskvårdsaktiviteten och ansvarar för den. Skapat ${dateSv(new Date().toISOString())}.`,
    right - left,
    8
  )) {
    text(line, left, 8, font, muted)
    y -= 11
  }
  return doc.save()
}

/** Sparar kvittot: delningsmenyn i mobilappen (Spara i Filer, mejl …), annars en vanlig nedladdning. */
export async function saveReceiptPdf(bytes: Uint8Array, fileName: string): Promise<void> {
  const blob = new Blob([bytes as BlobPart], { type: "application/pdf" })
  if (isNativeApp() && typeof File !== "undefined" && navigator.canShare) {
    const file = new File([blob], fileName, { type: "application/pdf" })
    if (navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: fileName })
        return
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return
      }
    }
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
