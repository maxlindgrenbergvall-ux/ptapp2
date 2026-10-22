/**
 * Coavira Plus och inbjudningar. Reglerna bestäms av databasen (v18) –
 * konstanterna här används för visning och i demoläget.
 *
 * Gratis för alla: dagens kostschema, boka pass, utföra pass och chatt.
 * Coavira Plus låser upp: sömntracking, historik äldre än 30 dagar,
 * djupgående grafer (1RM-utveckling) och CSV-export av träning och kost.
 * (Exporten av ALL egen data i Min data och sekretess är alltid gratis – GDPR.)
 */
import { addDays } from "@/lib/date"
import { SITE_URL } from "@/lib/site"
import type { Account, ISODate } from "@/types/domain"

export const FREE_HISTORY_DAYS = 30
export const REFERRAL_PLUS_DAYS = 30
export const REFERRAL_BOOST_DAYS = 7
export const REFERRAL_WINDOW_DAYS = 14

export type PlusFeature = "sleep" | "history" | "charts" | "export"

export const PLUS_FEATURE_LABEL: Record<PlusFeature, string> = {
  sleep: "Sömntracking",
  history: "Historik äldre än 30 dagar",
  charts: "Djupgående grafer",
  export: "Export till CSV",
}

/** Har kontot Coavira Plus just nu? */
export const isPlusActive = (account: Pick<Account, "plusUntil" | "plusLifetime"> | undefined, now = Date.now()) =>
  Boolean(account && (account.plusLifetime || (account.plusUntil && Date.parse(account.plusUntil) > now)))

/** Hela dagar kvar av Plus (0 om inte aktivt; Infinity för Plus utan slutdatum). */
export function plusDaysLeft(account: Account | undefined, now = Date.now()) {
  if (!account || !isPlusActive(account, now)) return 0
  if (account.plusLifetime) return Infinity
  return Math.ceil((Date.parse(account.plusUntil!) - now) / 86_400_000)
}

/** Äldsta datum gratisklienter ser i historiken. */
export const historyCutoff = (today: ISODate) => addDays(today, -FREE_HISTORY_DAYS)

/** Ny sluttid när Plus förlängs (från nu eller från nuvarande slut, som databasen). */
export function extendPlus(current: string | undefined, days: number, now = Date.now()) {
  const start = Math.max(now, current ? Date.parse(current) : 0)
  return new Date(start + days * 86_400_000).toISOString()
}

// ---------------------------------------------------------------- koder ---

/** 8 tecken utan förväxlingsbara tecken (samma regel som databasen). */
export const REFERRAL_CODE = /^[A-HJ-NP-Z2-9]{8}$/
export const normalizeReferralCode = (raw: string) => raw.toUpperCase().replace(/[^A-Z0-9]/g, "")
export const isReferralCode = (raw: string) => REFERRAL_CODE.test(normalizeReferralCode(raw))

/** Länken som delas: coavira.fit/ref/KOD (leder till appen och registreringen). */
export const referralLink = (code: string) => `${SITE_URL}/ref/${code}`

const REF_KEY = "coavira:ref"
/** Koden från en inbjudningslänk sparas tills kontot skapats och koden lösts in (högst 30 dagar). */
export function rememberReferral(code: string) {
  try {
    window.localStorage.setItem(REF_KEY, JSON.stringify({ code: normalizeReferralCode(code), at: Date.now() }))
  } catch {}
}
export function storedReferral(): string | null {
  try {
    const raw = window.localStorage.getItem(REF_KEY)
    if (!raw) return null
    const { code, at } = JSON.parse(raw) as { code?: string; at?: number }
    if (!code || !REFERRAL_CODE.test(code) || !at || Date.now() - at > 30 * 86_400_000) return null
    return code
  } catch {
    return null
  }
}
export function forgetReferral() {
  try {
    window.localStorage.removeItem(REF_KEY)
  } catch {}
}

/** CSV med semikolon och decimalkomma (öppnas rätt i svenska Excel/Numbers). */
export function toCsv(header: string[], rows: (string | number)[][]) {
  const cell = (v: string | number) => {
    const s = typeof v === "number" ? String(v).replace(".", ",") : v
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  // BOM: Excel läser då å, ä och ö rätt.
  return "\uFEFF" + [header, ...rows].map((r) => r.map(cell).join(";")).join("\r\n")
}
