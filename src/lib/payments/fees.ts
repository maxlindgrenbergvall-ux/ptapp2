/**
 * Serviceavgiften räknas på deltotalen och avrundas till hela kronor (37,5 → 38).
 * Procentsatsen beror på hur klienten kom till PT:n (v19):
 *
 *   EXISTING_CLIENT – PT:ns befintliga klient som löst in PT:ns kod: 5 %
 *   PLATFORM_CLIENT – hittade PT:n i appen (standard):               10 %
 *
 * Samma regel som service_fee_percent_for() och service_fee_sek() i databasen,
 * som bestämmer det belopp klienten faktiskt betalar – den här filen används
 * för visning och som kontroll innan Stripe-sessionen skapas.
 */
import type { AcquisitionType, AppData, ID } from "@/types/domain"

export const PLATFORM_FEE_PERCENT = 10
export const EXISTING_CLIENT_FEE_PERCENT = 5

/** Högst så många enstaka pass per rad (samma gräns som databasen). */
export const MAX_QUANTITY = 20

export const feePercentFor = (acquisition: AcquisitionType | undefined) =>
  acquisition === "EXISTING_CLIENT" ? EXISTING_CLIENT_FEE_PERCENT : PLATFORM_FEE_PERCENT

/** Kundursprunget för klienten hos en PT (ingen relation = plattformsklient). */
export function acquisitionOf(data: AppData, clientId: ID, trainerId: ID): AcquisitionType {
  return data.relationships.find((r) => r.clientId === clientId && r.trainerId === trainerId)?.acquisition ?? "PLATFORM_CLIENT"
}

/** Serviceavgift i hela kronor. Heltalsräkning: inga flyttalsfel (t.ex. 750 kr × 5 % → 38 kr). */
export const serviceFeeSek = (subtotalSek: number, percent: number) => Math.floor((subtotalSek * percent + 50) / 100)

export interface CheckoutTotals {
  subtotalSek: number
  feePercent: number
  serviceFeeSek: number
  totalSek: number
}

export function checkoutTotals(subtotalSek: number, percent: number): CheckoutTotals {
  const fee = serviceFeeSek(subtotalSek, percent)
  return { subtotalSek, feePercent: percent, serviceFeeSek: fee, totalSek: subtotalSek + fee }
}

/** Bara enstaka pass kan köpas i flera exemplar. */
export const canChooseQuantity = (s: { kind: string }) => s.kind === "single"

export const clampQuantity = (n: number) => Math.min(MAX_QUANTITY, Math.max(1, Math.round(Number.isFinite(n) ? n : 1)))
