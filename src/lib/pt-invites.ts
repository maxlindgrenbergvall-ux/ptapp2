/**
 * PT:ns koder till befintliga klienter (v19). Databasen skapar och löser in
 * koderna (create_pt_invite / redeem_pt_invite) – den här filen används för
 * formatet, länken, visning och demoläget.
 *
 * En inlöst kod kopplar klienten till PT:n som EXISTING_CLIENT: 5 %
 * serviceavgift hos den PT:n i stället för 10 %.
 */
import { SITE_URL } from "@/lib/site"

/** Samma format som databasen: EX- + 6 tecken utan förväxlingsbara tecken (0/O, 1/I/L). */
export const PT_INVITE_CODE = /^EX-[A-HJ-NP-Z2-9]{6}$/
/** Koderna gäller i 30 dagar (pt_invites.expires_at). */
export const PT_INVITE_DAYS = 30

/** "ex8fk29a", "EX 8FK29A" och "8FK29A" → "EX-8FK29A". */
export function normalizePtInviteCode(raw: string) {
  const s = raw.toUpperCase().replace(/[^A-Z0-9]/g, "")
  return `EX-${(s.startsWith("EX") ? s.slice(2) : s).slice(0, 6)}`
}

/**
 * Är länkens kod en PT-kod? Kräver bindestrecket: vänkoderna (v18) är 8 tecken
 * utan prefix och kan själva börja på "EX".
 */
export const looksLikePtInvite = (raw: string) => /^EX-[A-HJ-NP-Z2-9]{6}$/i.test(raw.trim())

/** Demoläget: en slumpad kod (riktiga koder skapas av databasen). */
export function randomInviteCode() {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
  const bytes = crypto.getRandomValues(new Uint8Array(6))
  return `EX-${Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("")}`
}

/** Länken PT:n skickar: coavira.fit/ref/EX-8FK29A → registreringen med koden ifylld. */
export const ptInviteLink = (code: string) => `${SITE_URL}/ref/${code}`

const KEY = "coavira:ptkod"
/** Koden från PT:ns länk sparas tills kontot skapats (högst 30 dagar). */
export function rememberPtInvite(code: string) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ code: normalizePtInviteCode(code), at: Date.now() }))
  } catch {}
}
export function storedPtInvite(): string | null {
  try {
    const raw = window.localStorage.getItem(KEY)
    if (!raw) return null
    const { code, at } = JSON.parse(raw) as { code?: string; at?: number }
    if (!code || !PT_INVITE_CODE.test(code) || !at || Date.now() - at > PT_INVITE_DAYS * 86_400_000) return null
    return code
  } catch {
    return null
  }
}
export function forgetPtInvite() {
  try {
    window.localStorage.removeItem(KEY)
  } catch {}
}

/** Har en oanvänd kod gått ut? */
export const isInviteExpired = (invite: { isUsed: boolean; expiresAt: string }, now = Date.now()) => !invite.isUsed && Date.parse(invite.expiresAt) <= now
