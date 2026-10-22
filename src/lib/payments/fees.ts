/**
 * Serviceavgiften: 7 % av deltotalen, avrundat till hela kronor (66,5 → 67).
 * Samma regel som service_fee_sek() i databasen (v17), som bestämmer det
 * belopp klienten faktiskt betalar – den här filen används för visning och
 * som kontroll innan Stripe-sessionen skapas.
 */
export const SERVICE_FEE_PERCENT = 7

/** Högst så många enstaka pass per rad (samma gräns som databasen). */
export const MAX_QUANTITY = 20

/** Serviceavgift i hela kronor. Heltalsräkning: inga flyttalsfel (t.ex. 950 kr → 67 kr). */
export const serviceFeeSek = (subtotalSek: number) => Math.floor((subtotalSek * SERVICE_FEE_PERCENT + 50) / 100)

export interface CheckoutTotals {
  subtotalSek: number
  serviceFeeSek: number
  totalSek: number
}

export function checkoutTotals(subtotalSek: number): CheckoutTotals {
  const fee = serviceFeeSek(subtotalSek)
  return { subtotalSek, serviceFeeSek: fee, totalSek: subtotalSek + fee }
}

/** Bara enstaka pass kan köpas i flera exemplar. */
export const canChooseQuantity = (s: { kind: string }) => s.kind === "single"

export const clampQuantity = (n: number) => Math.min(MAX_QUANTITY, Math.max(1, Math.round(Number.isFinite(n) ? n : 1)))
