/**
 * Telefonnummer i E.164 (+46701234567). Samma regler som normalize_phone() i
 * databasen: svenska nummer med inledande 0 får +46, 00 blir +.
 */
export function normalizePhone(input: string): string | null {
  const d = input.replace(/[\s\-().]/g, "")
  if (/^\+[1-9]\d{7,14}$/.test(d)) return d
  if (/^00[1-9]\d{7,14}$/.test(d)) return `+${d.slice(2)}`
  if (/^0[1-9]\d{6,12}$/.test(d)) return `+46${d.slice(1)}`
  return null
}
