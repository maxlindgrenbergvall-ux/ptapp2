/**
 * Svenska organisationsnummer (v54) – rena funktioner.
 *
 *   NNNNNN-NNNN, sista siffran är en kontrollsiffra (Luhn, mod 10).
 *   Första siffran anger organisationstypen:
 *     5 aktiebolag · 9 handels-/kommanditbolag · 7 ekonomisk förening/bostadsrättsförening
 *     8 ideell förening/stiftelse · 2 stat/region/kommun · 1 dödsbo · 6 enkla bolag · 3 utländska
 *   En ENSKILD FIRMA har inget eget nummer: den använder ägarens personnummer
 *   (ÅÅMMDD-NNNN, där tredje siffran är 0–1 eftersom månaden är 01–12).
 *
 * Personnummer behandlas bara som en SIGNAL ("det här är en enskild firma") –
 * siffrorna returneras aldrig och sparas aldrig någonstans.
 */

export type OrgKind = "ab" | "handelsbolag" | "forening" | "offentlig" | "other_entity" | "personnummer" | "invalid"

/** Luhn (mod 10) över alla tio siffror. */
export function luhnValid(digits: string): boolean {
  if (!/^\d{10}$/.test(digits)) return false
  let sum = 0
  for (let i = 0; i < 10; i++) {
    let d = Number(digits[i]) * (i % 2 === 0 ? 2 : 1)
    if (d > 9) d -= 9
    sum += d
  }
  return sum % 10 === 0
}

/** Kontrollsiffran för nio siffror (för tester och demo). */
export function luhnDigit(nine: string): number {
  for (let d = 0; d <= 9; d++) if (luhnValid(`${nine}${d}`)) return d
  return 0
}

/** Vad ett tiosiffrigt nummer är. Ett personnummer känns igen på datumet (månad 01–12, dag 01–31). */
export function classifyNumber(digits: string): OrgKind {
  if (!luhnValid(digits)) return "invalid"
  const month = Number(digits.slice(2, 4))
  const day = Number(digits.slice(4, 6))
  // Organisationsnummer har alltid "månad" ≥ 20 (tredje siffran ≥ 2) – det skiljer dem från personnummer.
  if (month >= 1 && month <= 12 && ((day >= 1 && day <= 31) || (day >= 61 && day <= 91))) return "personnummer"
  if (month < 20) return "invalid"
  switch (digits[0]) {
    case "5":
      return "ab"
    case "9":
      return "handelsbolag"
    case "7":
    case "8":
      return "forening"
    case "2":
      return "offentlig"
    default:
      return "other_entity"
  }
}

/** "5591234567" → "559123-4567". */
export const formatOrgNumber = (digits: string) => `${digits.slice(0, 6)}-${digits.slice(6)}`

export interface NumberHit {
  kind: OrgKind
  /** Bara för aktiebolag (och andra juridiska personer) – aldrig för personnummer. */
  orgNumber: string | null
}

/**
 * Hitta organisations-/personnummer i en text. 12-siffriga personnummer
 * (ÅÅÅÅMMDD-NNNN) känns igen och kortas till tio siffror innan kontrollen.
 * Personnummer ger bara { kind: "personnummer", orgNumber: null }.
 */
export function findNumbers(text: string): NumberHit[] {
  const out: NumberHit[] = []
  const seen = new Set<string>()
  for (const m of text.matchAll(/(?<![\d-])(?:(19|20)(\d{6})|(\d{6}))[-+\s]?(\d{4})(?![\d-])/g)) {
    const digits = `${m[2] ?? m[3]}${m[4]}`
    if (seen.has(digits)) continue
    seen.add(digits)
    const kind = m[1] ? (classifyNumber(digits) === "personnummer" ? "personnummer" : "invalid") : classifyNumber(digits)
    if (kind === "invalid") continue
    out.push({ kind, orgNumber: kind === "personnummer" ? null : formatOrgNumber(digits) })
  }
  return out
}

/** Siffror som ser ut som ett personnummer tas bort ur en text innan den sparas eller visas. */
export function redactPersonnummer(text: string): string {
  return text.replace(/(?<![\d-])(?:(19|20)(\d{6})|(\d{6}))[-+\s]?(\d{4})(?![\d-])/g, (whole, century, long, short, last) => {
    const digits = `${long ?? short}${last}`
    return classifyNumber(digits) === "personnummer" || century ? "[personnummer]" : whole
  })
}
