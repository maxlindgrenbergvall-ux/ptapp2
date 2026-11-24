/**
 * Friskvårdspaket och prisstöd för PT:n (v75).
 *
 * Coaviras faktiska avgiftsmodell (PT-avtalet, Stripe Connect med destination
 * charge): PT:n får HELA sitt pris. Coaviras serviceavgift – 5 % för PT:ns egna
 * klienter (inbjudningslänk), 10 % för klienter som hittat PT:n i appen – läggs
 * på klientens pris, och Stripes kortavgift betalas av Coavira ur avgiften.
 * Därför räknar kalkylatorn på vad KLIENTEN betalar (det som ska rymmas i
 * friskvårdsbidraget) och jämför PT:ns netto med ett eget portalavtal (ePassi).
 */
import { EXISTING_CLIENT_FEE_PERCENT, PLATFORM_FEE_PERCENT, serviceFeeSek } from "@/lib/payments/fees"

/** 1-klicksmallen "+ Skapa Friskvårdspaket". */
export const WELLNESS_TEMPLATE = {
  kind: "full" as const,
  title: "Friskvårdsupplägg 3 månader – Personlig träning & skräddarsytt kostschema",
  description:
    "Individanpassat träningsprogram, skräddarsytt kostupplägg samt full tillgång till Coavira+ (receptbibliotek & verktyg). Kan betalas med friskvårdsbidrag.",
  priceSek: 3495,
  // Tre programmerade pass i veckan i tolv veckor (varje schemalagt pass räknas som ett pass).
  sessions: 36,
  durationWeeks: 12,
  isWellnessPackage: true,
}

/** Snabbval strax under jämna tusental (vanliga friskvårdstak). */
export const WELLNESS_PRICE_CHIPS = [1995, 2995, 3995, 4995] as const
export const WELLNESS_PRICE_HINT =
  "De flesta arbetsgivare ger 2 000–5 000 kr/år i bidrag. Ligg strax under ett jämnt tusental så slipper klienten betala mellanskillnaden privat."

/**
 * Friskvårdsrutan i kassan – i appen och på Stripes betalsida (custom_text).
 * Inget myndighets-"godkännande" utlovas: kvittot innehåller det underlag Skatteverket kräver.
 */
export const WELLNESS_CHECKOUT_TEXT =
  "Har du friskvårdsbidrag via Benifex, Edenred eller din arbetsgivare? Betala smidigt här – ett friskvårdskvitto (PDF) med det underlag Skatteverket kräver skapas direkt efter köpet."

/** ePassi och liknande portaler tar normalt 5–10 % av PT:n. */
export const PORTAL_FEE_RANGE = { low: 5, high: 10 } as const

export interface WellnessCalc {
  price: number
  /** Via Coavira: PT:n får hela priset. */
  ptNet: number
  /** Vad klienten betalar totalt (pris + serviceavgift). */
  clientTotalApp: number
  clientTotalOwn: number
  feeApp: number
  feeOwn: number
  /** Via eget portalavtal: PT:ns netto efter 5–10 % portalavgift. */
  portalNetLow: number
  portalNetHigh: number
  /** Pris som krävs via portalen för samma netto som via Coavira. */
  portalPriceForSameNetLow: number
  portalPriceForSameNetHigh: number
  /** Hamnar klientens totalbelopp (appklient) strax över ett tusental? Då föreslås ett lägre pris. */
  capTip: { cap: number; price: number; total: number } | null
}

const roundUp = (n: number, step = 5) => Math.ceil(n / step) * step

/** Högsta pris som slutar på 95 där klientens totala kostnad ryms under taket. */
export function priceUnderCap(cap: number, feePercent: number): number {
  let p = Math.floor((cap * 100) / (100 + feePercent))
  p = Math.floor((p - 95) / 100) * 100 + 95
  while (p > 95 && p + serviceFeeSek(p, feePercent) > cap) p -= 100
  return Math.max(95, p)
}

export function wellnessCalc(price: number): WellnessCalc {
  const p = Math.max(0, Math.round(price))
  const feeApp = serviceFeeSek(p, PLATFORM_FEE_PERCENT)
  const feeOwn = serviceFeeSek(p, EXISTING_CLIENT_FEE_PERCENT)
  const clientTotalApp = p + feeApp
  // Strax över ett tusental (inom serviceavgiften): föreslå ett pris som håller klienten under det.
  const thousand = Math.floor(clientTotalApp / 1000) * 1000
  const capTip =
    p > 0 && thousand >= 1000 && p <= thousand && clientTotalApp > thousand
      ? { cap: thousand, price: priceUnderCap(thousand, PLATFORM_FEE_PERCENT), total: 0 }
      : null
  if (capTip) capTip.total = capTip.price + serviceFeeSek(capTip.price, PLATFORM_FEE_PERCENT)
  return {
    price: p,
    ptNet: p,
    clientTotalApp,
    clientTotalOwn: p + feeOwn,
    feeApp,
    feeOwn,
    portalNetLow: Math.round(p * (1 - PORTAL_FEE_RANGE.high / 100)),
    portalNetHigh: Math.round(p * (1 - PORTAL_FEE_RANGE.low / 100)),
    portalPriceForSameNetLow: roundUp(p / (1 - PORTAL_FEE_RANGE.low / 100)),
    portalPriceForSameNetHigh: roundUp(p / (1 - PORTAL_FEE_RANGE.high / 100)),
    capTip,
  }
}
