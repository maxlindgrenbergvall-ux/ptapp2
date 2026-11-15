import "server-only"

/**
 * Bolagsverkets öppna API, "Värdefulla datamängder" (v54) – uppslag på
 * organisationsnummer: organisationsform (AB …) och om bolaget är avregistrerat.
 * Det finns ingen namnsökning; numret hittas först i andra källor.
 *
 *   BOLAGSVERKET_CLIENT_ID / BOLAGSVERKET_CLIENT_SECRET   krävs (registrera en
 *       klient på portal.api.bolagsverket.se – gratis). Utan dem hoppas steget över.
 *   BOLAGSVERKET_TOKEN_URL   valfritt, standard https://portal.api.bolagsverket.se/oauth2/token
 *   BOLAGSVERKET_API_BASE    valfritt, standard https://gw.api.bolagsverket.se/vardefulla-datamangder/v1
 *                            (testmiljön: gw-accept2.api.bolagsverket.se)
 *   BOLAGSVERKET_SCOPE       valfritt, standard "vardefulla-datamangder:read"
 *
 * INTE VERIFIERAT MOT BOLAGSVERKET: dokumentationen gick inte att nå från
 * utvecklingsmiljön. Anropet (POST /organisationer med identitetsbeteckning)
 * och fältnamnen bygger på beskrivningar från tredje part. Svaret tolkas därför
 * tolerant: organisationsformen och avregistrering letas upp var de än ligger.
 * Blir svaret något annat än väntat räknas uppslaget som "inget besked" –
 * aldrig som ett felaktigt AB.
 */
export const bolagsverketConfigured = () => Boolean(process.env.BOLAGSVERKET_CLIENT_ID?.trim() && process.env.BOLAGSVERKET_CLIENT_SECRET?.trim())

import { parseRegistry, type RegistryAnswer } from "@/lib/crm/enrichment/registry"

export { parseRegistry, type RegistryAnswer }

let token: { value: string; expires: number } | null = null

async function accessToken(): Promise<string> {
  if (token && token.expires > Date.now() + 30_000) return token.value
  const url = process.env.BOLAGSVERKET_TOKEN_URL?.trim() || "https://portal.api.bolagsverket.se/oauth2/token"
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: process.env.BOLAGSVERKET_CLIENT_ID!.trim(),
      client_secret: process.env.BOLAGSVERKET_CLIENT_SECRET!.trim(),
      scope: process.env.BOLAGSVERKET_SCOPE?.trim() || "vardefulla-datamangder:read",
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  })
  const json = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number }
  if (!res.ok || !json.access_token) throw new Error(`Bolagsverket: inloggningen misslyckades (${res.status})`)
  token = { value: json.access_token, expires: Date.now() + (json.expires_in ?? 600) * 1000 }
  return token.value
}

/** Slå upp ett organisationsnummer. null = inget besked (inte konfigurerat, inte hittat eller oväntat svar). */
export async function lookupOrgNumber(orgNumber: string): Promise<RegistryAnswer | null> {
  if (!bolagsverketConfigured()) return null
  const digits = orgNumber.replace(/\D/g, "")
  const base = (process.env.BOLAGSVERKET_API_BASE?.trim() || "https://gw.api.bolagsverket.se/vardefulla-datamangder/v1").replace(/\/$/, "")
  const res = await fetch(`${base}/organisationer`, {
    method: "POST",
    headers: { Authorization: `Bearer ${await accessToken()}`, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ identitetsbeteckning: digits }),
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  })
  if (res.status === 404) return null
  if (res.status === 401) token = null
  if (!res.ok) throw new Error(`Bolagsverket svarade ${res.status}`)
  return parseRegistry(await res.json().catch(() => null))
}
