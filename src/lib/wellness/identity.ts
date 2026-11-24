/**
 * Organisations- och personnummer (v75). Samma kontroll som databasen
 * (is_valid_org_number / normalize_org_number i migration v75): 10 siffror,
 * eller 12 med sekel, och Luhn-kontrollsiffra.
 */
const digits = (s: string) => s.replace(/[^0-9]/g, "")

function luhnOk(ten: string): boolean {
  let sum = 0
  for (let i = 0; i < 10; i++) {
    const n = Number(ten[i]) * (i % 2 === 0 ? 2 : 1)
    sum += Math.floor(n / 10) + (n % 10)
  }
  return sum % 10 === 0
}

const tenDigits = (s: string): string | null => {
  const d = digits(s)
  if (d.length === 12) return d.slice(2)
  return d.length === 10 ? d : null
}

export function isValidOrgNumber(s: string): boolean {
  const d = tenDigits(s)
  return d !== null && luhnOk(d)
}

/** "5591234561" → "559123-4561" (null om ogiltigt). */
export function normalizeOrgNumber(s: string): string | null {
  const d = tenDigits(s)
  return d && luhnOk(d) ? `${d.slice(0, 6)}-${d.slice(6)}` : null
}

/**
 * Personnummer (för kvittot): ÅÅMMDD-NNNN eller ÅÅÅÅMMDD-NNNN, rimligt datum
 * (dag 61–91 = samordningsnummer) och Luhn. Sparas aldrig – bara i PDF:en.
 */
export function normalizePersonnummer(s: string): string | null {
  const d = digits(s)
  const ten = tenDigits(s)
  if (!ten || !luhnOk(ten)) return null
  const month = Number(ten.slice(2, 4))
  const day = Number(ten.slice(4, 6))
  const realDay = day > 60 ? day - 60 : day
  if (month < 1 || month > 12 || realDay < 1 || realDay > 31) return null
  if (d.length === 12) return `${d.slice(0, 8)}-${d.slice(8)}`
  return `${ten.slice(0, 6)}-${ten.slice(6)}`
}
