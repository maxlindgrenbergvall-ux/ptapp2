import "server-only"

/**
 * Nyhetsbrev via Resend (v35): användare som kryssat i "nyhetsbrev, erbjudanden
 * och produktnyheter" (onboarding eller Inställningar) läggs som kontakt i
 * Resend, i segmentet för sin roll:
 *
 *   klient → segmentet "Klient - Nyhetsbrev"
 *   PT     → segmentet "PT - Nyhetsbrev"
 *
 * Drar användaren tillbaka samtycket markeras kontakten som avregistrerad
 * (unsubscribed) och tas bort ur segmenten. Raderas kontot tas kontakten bort helt.
 * Inga utskick byggs här – bara att rätt person ligger i rätt segment.
 *
 * Sanningen är databasen (profiles.marketing_consent, v34): servern läser
 * samtycket och rollen själv och litar aldrig på vad webbläsaren skickar.
 *
 * Miljövariabler (bara på servern – aldrig NEXT_PUBLIC_):
 *   RESEND_API_KEY              krävs (re_…), behörighet "Full access" för kontakter/segment
 *   RESEND_SEGMENT_CLIENT_ID    valfritt – annars hittas segmentet "Klient - Nyhetsbrev" via namnet
 *   RESEND_SEGMENT_PT_ID        valfritt – annars hittas segmentet "PT - Nyhetsbrev" via namnet
 * Segmenten skapas i Resend av er – appen skapar dem aldrig (inga dubbletter).
 *   RESEND_API_BASE             valfritt (tester), standard https://api.resend.com
 *
 * REST-API:t anropas direkt med fetch (samma vägar som Resends officiella SDK:
 * /contacts, /contacts/{email}/segments/{id}, /segments) – inget extra beroende.
 */

export type MarketingRole = "client" | "trainer"

export const SEGMENT_NAME: Record<MarketingRole, string> = {
  client: "Klient - Nyhetsbrev",
  trainer: "PT - Nyhetsbrev",
}

const SEGMENT_ENV: Record<MarketingRole, string> = {
  client: "RESEND_SEGMENT_CLIENT_ID",
  trainer: "RESEND_SEGMENT_PT_ID",
}

export class ResendError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message)
  }
}

export const resendConfigured = () => Boolean(process.env.RESEND_API_KEY?.trim())
const base = () => (process.env.RESEND_API_BASE?.trim() || "https://api.resend.com").replace(/\/$/, "")

async function call<T>(method: "GET" | "POST" | "PATCH" | "DELETE", path: string, body?: unknown, allow404 = false): Promise<T | null> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${base()}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
        "User-Agent": "coavira-server",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    })
    // Resend begränsar anropen per sekund – vänta och försök igen (högst två gånger).
    if (res.status === 429 && attempt < 2) {
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)))
      continue
    }
    if (res.status === 404 && allow404) return null
    const text = await res.text()
    const json = text ? (JSON.parse(text) as Record<string, unknown>) : {}
    if (!res.ok) throw new ResendError(String(json.message ?? `Resend svarade ${res.status}`), res.status)
    return json as T
  }
}

// Segmentens id cachas per serverinstans (de ändras inte).
const segmentCache = new Map<MarketingRole, string>()

/** Jämför segmentnamn utan att bry sig om skiftläge, mellanslag eller bindestreck (-, –, —). */
export const normalizeSegmentName = (name: string) =>
  name
    .toLowerCase()
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .replace(/\s*-\s*/g, " - ")
    .replace(/\s+/g, " ")
    .trim()

/**
 * Segmentets id: från miljövariabeln, annars uppslag på namnet i Resend.
 * Hittas det inte skapas inget nytt (då kunde en dubblett uppstå bredvid ert
 * segment) – i stället ett tydligt fel i serverloggen.
 */
export async function segmentId(role: MarketingRole): Promise<string> {
  const fromEnv = process.env[SEGMENT_ENV[role]]?.trim()
  if (fromEnv) return fromEnv
  const cached = segmentCache.get(role)
  if (cached) return cached
  const wanted = normalizeSegmentName(SEGMENT_NAME[role])
  let after: string | undefined
  for (let page = 0; page < 10; page++) {
    const list = await call<{ data: { id: string; name: string }[]; has_more?: boolean }>("GET", `/segments?limit=100${after ? `&after=${after}` : ""}`)
    const hit = list?.data.find((s) => normalizeSegmentName(s.name) === wanted)
    if (hit) {
      segmentCache.set(role, hit.id)
      return hit.id
    }
    if (!list?.has_more || !list.data.length) break
    after = list.data.at(-1)!.id
  }
  throw new ResendError(`Segmentet "${SEGMENT_NAME[role]}" finns inte i Resend – skapa det eller sätt ${SEGMENT_ENV[role]}`, 404)
}

export interface MarketingContact {
  email: string
  firstName?: string | null
  lastName?: string | null
  role: MarketingRole
  consent: boolean
}

export type SyncResult = { action: "subscribed" | "unsubscribed" | "noop"; segment: string }

const enc = encodeURIComponent

/**
 * Lägg kontakten i rollens segment (samtycke) eller avregistrera den (inget samtycke).
 * Idempotent – kan köras om när som helst (t.ex. av scripts/sync-resend-segments.mjs).
 */
export async function syncMarketingContact(c: MarketingContact): Promise<SyncResult> {
  const email = c.email.trim().toLowerCase()
  const segment = await segmentId(c.role)
  const otherRole: MarketingRole = c.role === "client" ? "trainer" : "client"
  const existing = await call<{ id: string; unsubscribed?: boolean }>("GET", `/contacts/${enc(email)}`, undefined, true)

  if (c.consent) {
    if (!existing) {
      await call("POST", "/contacts", {
        email,
        first_name: c.firstName || undefined,
        last_name: c.lastName || undefined,
        unsubscribed: false,
        segments: [{ id: segment }],
      })
    } else {
      await call("PATCH", `/contacts/${enc(email)}`, { unsubscribed: false, first_name: c.firstName || undefined, last_name: c.lastName || undefined })
      await call("POST", `/contacts/${enc(email)}/segments/${enc(segment)}`)
    }
    // Bytt roll (ovanligt): inte kvar i den andra rollens segment.
    if (existing && (process.env[SEGMENT_ENV[otherRole]] || segmentCache.has(otherRole))) {
      await call("DELETE", `/contacts/${enc(email)}/segments/${enc(await segmentId(otherRole))}`, undefined, true)
    }
    return { action: "subscribed", segment: SEGMENT_NAME[c.role] }
  }

  if (!existing) return { action: "noop", segment: SEGMENT_NAME[c.role] }
  await call("PATCH", `/contacts/${enc(email)}`, { unsubscribed: true })
  await call("DELETE", `/contacts/${enc(email)}/segments/${enc(segment)}`, undefined, true)
  return { action: "unsubscribed", segment: SEGMENT_NAME[c.role] }
}

/** Kontot raderas (GDPR art. 17): kontakten tas bort helt hos Resend. */
export async function removeMarketingContact(email: string): Promise<void> {
  await call("DELETE", `/contacts/${enc(email.trim().toLowerCase())}`, undefined, true)
}
