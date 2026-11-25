/**
 * "Välkommen tillbaka" (v80): enheten minns vem som senast var inloggad, så att
 * Kom igång och Logga in kan visa inloggningsrutan direkt – med namnet och
 * e-posten ifyllda och rätt inloggningssätt (e-post, Apple eller Google).
 *
 * Bara förnamn, e-post och inloggningssätt sparas – aldrig någon token eller
 * något lösenord. Cookien ligger kvar efter utloggning (det är hela poängen) och
 * tas bort med "Inte du? Byt konto" eller när kontot raderas. Den är en vanlig
 * cookie (inte httpOnly) som läses i webbläsaren – sidorna förblir statiska.
 */
export const KNOWN_COOKIE = "coavira_known"
const MAX_AGE = 400 * 24 * 60 * 60

export type KnownMethod = "password" | "apple" | "google"

export interface KnownAccount {
  name: string
  email: string
  method: KnownMethod
  role: "client" | "trainer"
}

/** Tolkar cookievärdet; allt som inte ser rätt ut ignoreras. */
export function parseKnown(raw: string | undefined | null): KnownAccount | null {
  if (!raw) return null
  try {
    const v = JSON.parse(decodeURIComponent(raw)) as Partial<KnownAccount>
    const method = v.method === "apple" || v.method === "google" ? v.method : "password"
    const role = v.role === "trainer" ? "trainer" : "client"
    const email = typeof v.email === "string" && /^[^\s@]+@[^\s@]+$/.test(v.email) ? v.email.slice(0, 200) : ""
    const name = typeof v.name === "string" ? v.name.trim().slice(0, 40) : ""
    if (!email) return null
    return { name, email, method, role }
  } catch {
    return null
  }
}

/** Inloggningssättet från Supabase (app_metadata.provider). */
export function methodFromProvider(provider: unknown): KnownMethod {
  return provider === "apple" ? "apple" : provider === "google" ? "google" : "password"
}

export function rememberAccount(account: KnownAccount) {
  if (typeof document === "undefined") return
  const value = encodeURIComponent(JSON.stringify({ ...account, name: account.name.split(" ")[0] ?? "" }))
  const secure = window.location.protocol === "https:" ? "; Secure" : ""
  document.cookie = `${KNOWN_COOKIE}=${value}; Path=/; Max-Age=${MAX_AGE}; SameSite=Lax${secure}`
  window.dispatchEvent(new Event("coavira:known-account"))
}

export function forgetAccount() {
  if (typeof document === "undefined") return
  document.cookie = `${KNOWN_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`
  document.documentElement.classList.remove(KNOWN_CLASS)
  window.dispatchEvent(new Event("coavira:known-account"))
}

/**
 * Klassen sätts av ett litet skript på Kom igång innan sidan målas, så att
 * startsidan döljs direkt för en känd enhet (inget blink innan "Välkommen
 * tillbaka" visas).
 */
export const KNOWN_CLASS = "known-account"
export const KNOWN_SCRIPT = `try{if(document.cookie.indexOf("${KNOWN_COOKIE}=")>-1)document.documentElement.classList.add("${KNOWN_CLASS}")}catch(e){}`

/** Klientsidan: läser cookien (t.ex. i komponenter utan serverdata). */
export function readKnownAccount(): KnownAccount | null {
  if (typeof document === "undefined") return null
  const raw = document.cookie
    .split("; ")
    .find((c) => c.startsWith(`${KNOWN_COOKIE}=`))
    ?.slice(KNOWN_COOKIE.length + 1)
  return parseKnown(raw)
}
