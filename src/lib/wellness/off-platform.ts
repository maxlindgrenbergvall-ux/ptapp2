/**
 * Anti-leakage i chatten (v75): före första köpet hos PT:n stoppas meddelanden
 * med telefon- eller Swish-nummer och uppmaningar att betala utanför appen.
 * Samma regler som mentions_offplatform_payment() i migration v75 – databasen
 * stoppar meddelandet även om appen skulle missa det; här visas en varning direkt.
 */
const PATTERNS: RegExp[] = [
  // Mobil- och telefonnummer: +46 / 0046 / 07x … och 0x-nummer med 7–10 siffror.
  /(\+46|0046)[ -]?\(?0?\)?[ -]?[1-9]([ -]?[0-9]){6,8}/i,
  /(^|[^0-9])0[1-9]([ -]?[0-9]){6,9}([^0-9]|$)/i,
  // Swish-nummer (123 xxx xx xx) och Swish i alla former.
  /(^|[^0-9])123[ -]?[0-9]{3}[ -]?[0-9]{2}[ -]?[0-9]{2}([^0-9]|$)/i,
  /\bswish/i,
  // Betalning via portaler, bank eller kontant – och "utanför appen".
  /\b(betala|betalar|betalning|betalningen|betalt|pay)\b[^.!?]{0,30}\b(epassi|benify|benifex|edenred|wellnet|actiway|kontant|faktura|bankgiro|plusgiro|privat)/i,
  /\b(via|med|genom)\s+(epassi|benify|benifex|edenred|wellnet|actiway)\b/i,
  /\b(bankgiro|plusgiro|clearingnummer|kontonummer|kontanter)\b/i,
  /utanför (appen|coavira)/i,
]

export function mentionsOffplatformPayment(text: string): boolean {
  return PATTERNS.some((p) => p.test(text))
}

export const OFFPLATFORM_MESSAGE =
  "Telefonnummer, Swish och betalning utanför appen kan delas först efter första köpet i Coavira. Det skyddar både dig och PT:n."
