/**
 * Juridiska sidor. De publika adresserna (coavira.fit/privacy och /terms)
 * används i appen, i registreringen och i App Store / Google Play. De visar
 * /integritet och /villkor (se next.config.ts).
 */
import { SITE_URL } from "@/lib/site"

export const PRIVACY_URL = `${SITE_URL}/privacy`
export const TERMS_URL = `${SITE_URL}/terms`
export const SUPPORT_URL = `${SITE_URL}/support`

/** Texten på den obligatoriska bockrutan vid registreringen. */
export const CONSENT_TEXT_START = "Jag godkänner "
export const CONSENT_TEXT_TERMS = "användarvillkoren"
export const CONSENT_TEXT_MIDDLE = " och behandlingen av mina hälsouppgifter för träningsuppföljning i enlighet med "
export const CONSENT_TEXT_PRIVACY = "Integritetspolicyn"
export const CONSENT_TEXT = `${CONSENT_TEXT_START}${CONSENT_TEXT_TERMS}${CONSENT_TEXT_MIDDLE}${CONSENT_TEXT_PRIVACY}.`
