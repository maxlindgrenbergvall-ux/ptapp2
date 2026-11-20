/**
 * Decimalinmatning i passet (hotfix v63): både punkt och komma, oavsett om
 * telefonens tangentbord (iOS/Android i Capacitor) ger "62.5" eller "62,5".
 */

/** Rensar det användaren skriver: bara siffror och ETT decimaltecken (det första), max två decimaler. */
export function cleanDecimal(raw: string): string {
  const digits = raw.replace(/[^\d.,]/g, "")
  const sep = digits.search(/[.,]/)
  if (sep === -1) return digits
  const whole = digits.slice(0, sep)
  const frac = digits.slice(sep + 1).replace(/[.,]/g, "").slice(0, 2)
  return `${whole}${digits[sep]}${frac}`
}

/** Text → tal. Tomt fält (eller bara ett decimaltecken) = undefined – aldrig 0 eller 1. */
export function parseDecimal(text: string): number | undefined {
  const t = text.trim().replace(",", ".")
  if (t === "" || t === ".") return undefined
  const n = Number(t.startsWith(".") ? `0${t}` : t)
  return Number.isFinite(n) ? Math.max(0, n) : undefined
}
