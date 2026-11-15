/**
 * PT:ns hemsida och Instagram (v51). Samma regler som databasens
 * check-constraints i 20261122000000_v51_trainer_links.sql, så att appen kan
 * visa ett tydligt fel innan något sparas – och så att en länk som visas på
 * profilen aldrig kan vara något annat än http(s).
 */

const HOST_LABEL = "[a-z0-9]([a-z0-9-]*[a-z0-9])?"
const WEBSITE_RE = new RegExp(`^https?://${HOST_LABEL}(\\.${HOST_LABEL})+(:[0-9]{1,5})?([/?#][^\\s<>"']*)?$`, "i")
const HANDLE_RE = /^[A-Za-z0-9._]{1,30}$/

export type LinkResult = { ok: true; value: string | null } | { ok: false; error: string }

/** "piapt.se", "www.piapt.se/om" eller "https://…" → "https://piapt.se/om". Tomt = ingen hemsida. */
export function normalizeWebsite(input: string): LinkResult {
  const raw = input.trim()
  if (!raw) return { ok: true, value: null }
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`
  if (!/^https?:\/\//i.test(withScheme)) return { ok: false, error: "Hemsidan måste börja med https://" }
  let url: URL
  try {
    url = new URL(withScheme)
  } catch {
    return { ok: false, error: "Det där ser inte ut som en webbadress" }
  }
  if (url.username || url.password) return { ok: false, error: "Webbadressen får inte innehålla inloggningsuppgifter" }
  // Behåll det PT:n skrev (utan avslutande snedstreck på startsidan), men med litet värdnamn.
  const value = `${url.protocol}//${url.host}${url.pathname === "/" ? "" : url.pathname}${url.search}${url.hash}`
  if (value.length > 300) return { ok: false, error: "Webbadressen är för lång (högst 300 tecken)" }
  if (!WEBSITE_RE.test(value)) return { ok: false, error: "Det där ser inte ut som en webbadress" }
  return { ok: true, value }
}

/** "@pia.pt", "pia.pt" eller "instagram.com/pia.pt/" → "pia.pt". Tomt = inget konto. */
export function normalizeInstagram(input: string): LinkResult {
  let raw = input.trim()
  if (!raw) return { ok: true, value: null }
  const fromUrl = raw.match(/^(?:https?:\/\/)?(?:www\.|m\.)?instagram\.com\/([^/?#]+)/i)
  if (fromUrl) raw = fromUrl[1]
  raw = raw.replace(/^@/, "")
  if (!HANDLE_RE.test(raw)) return { ok: false, error: "Instagramnamn får bara innehålla bokstäver, siffror, punkt och understreck (högst 30)" }
  return { ok: true, value: raw }
}

/** Kort text för en badge: "piapt.se" eller "piapt.se/om". */
export function websiteLabel(url: string): string {
  try {
    const u = new URL(url)
    const host = u.host.replace(/^www\./, "")
    const path = u.pathname === "/" ? "" : u.pathname.replace(/\/$/, "")
    const label = host + path
    return label.length > 32 ? `${label.slice(0, 31)}…` : label
  } catch {
    return url
  }
}

/** Säker länk att visa: bara http(s) som klarar samma kontroll som databasen. */
export function safeWebsiteHref(url: string | undefined): string | null {
  if (!url) return null
  return WEBSITE_RE.test(url) ? url : null
}

export function instagramHref(handle: string | undefined): string | null {
  if (!handle || !HANDLE_RE.test(handle)) return null
  return `https://www.instagram.com/${handle}/`
}
