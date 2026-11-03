import "server-only"

/**
 * Strava (v32): OAuth 2 och aktiviteter (löpning, cykel, simning …).
 *
 *   1. /api/strava/connect   → Strava-inloggning (scope read,activity:read_all) med state-cookie.
 *   2. /api/strava/callback  → koden byts mot tokens (servern), anslutningen sparas.
 *   3. syncStrava()          → senaste 30 dagarnas aktiviteter hämtas och sparas i
 *                              activity_logs (kalorier: Stravas egna, annars uppskattade).
 *   4. /api/strava/disconnect → åtkomsten återkallas hos Strava och raderas här.
 *
 * Tokens ligger i wearable_tokens (bara service role kan läsa). Client secret
 * finns bara på servern (STRAVA_CLIENT_SECRET) – aldrig i webbläsaren.
 * STRAVA_API_BASE pekar på Stravas API (bytbar mot en mock i e2e-testerna).
 */
import { addDays, todayISO } from "@/lib/date"
import { estimateKcal } from "@/lib/activity/summary"
import { createSupabaseAdmin } from "@/lib/supabase/admin"

export const STRAVA_SCOPES = "read,activity:read_all"
const base = () => (process.env.STRAVA_API_BASE ?? "https://www.strava.com").replace(/\/$/, "")

export function stravaConfigured(): boolean {
  return Boolean(process.env.STRAVA_CLIENT_ID && process.env.STRAVA_CLIENT_SECRET)
}

export class StravaAuthError extends Error {}

export interface StravaTokens {
  accessToken: string
  refreshToken: string
  /** ISO-tid då åtkomsttoken går ut. */
  expiresAt: string
  athleteId: string
  scope?: string[]
}

export function stravaAuthorizeUrl(state: string, redirectUri: string): string {
  const url = new URL(`${base()}/oauth/authorize`)
  url.searchParams.set("client_id", process.env.STRAVA_CLIENT_ID!)
  url.searchParams.set("redirect_uri", redirectUri)
  url.searchParams.set("response_type", "code")
  url.searchParams.set("approval_prompt", "auto")
  url.searchParams.set("scope", STRAVA_SCOPES)
  url.searchParams.set("state", state)
  return url.toString()
}

interface TokenResponse {
  access_token: string
  refresh_token: string
  expires_at: number
  athlete?: { id: number | string }
}

async function tokenRequest(body: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch(`${base()}/oauth/token`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ client_id: process.env.STRAVA_CLIENT_ID, client_secret: process.env.STRAVA_CLIENT_SECRET, ...body }),
    cache: "no-store",
  })
  if (res.status === 400 || res.status === 401) throw new StravaAuthError("Strava nekade åtkomsten")
  if (!res.ok) throw new Error(`Strava svarade ${res.status}`)
  return (await res.json()) as TokenResponse
}

const toTokens = (t: TokenResponse, athleteId?: string, scope?: string[]): StravaTokens => ({
  accessToken: t.access_token,
  refreshToken: t.refresh_token,
  expiresAt: new Date(t.expires_at * 1000).toISOString(),
  athleteId: String(t.athlete?.id ?? athleteId ?? ""),
  scope,
})

export async function exchangeStravaCode(code: string, scope: string[]): Promise<StravaTokens> {
  return toTokens(await tokenRequest({ code, grant_type: "authorization_code" }), undefined, scope)
}

async function refreshStrava(tokens: StravaTokens): Promise<StravaTokens> {
  return toTokens(await tokenRequest({ refresh_token: tokens.refreshToken, grant_type: "refresh_token" }), tokens.athleteId, tokens.scope)
}

/** Återkalla åtkomsten hos Strava (koppla från). Fel ignoreras – anslutningen tas bort ändå. */
export async function deauthorizeStrava(accessToken: string): Promise<void> {
  await fetch(`${base()}/oauth/deauthorize`, { method: "POST", headers: { authorization: `Bearer ${accessToken}` }, cache: "no-store" }).catch(() => {})
}

interface StravaActivity {
  id: number | string
  name: string
  type?: string
  sport_type?: string
  start_date: string
  start_date_local?: string
  elapsed_time: number
  moving_time?: number
  distance?: number
  kilojoules?: number
  calories?: number
}

async function api<T>(path: string, accessToken: string): Promise<T> {
  const res = await fetch(`${base()}/api/v3${path}`, { headers: { authorization: `Bearer ${accessToken}` }, cache: "no-store" })
  if (res.status === 401) throw new StravaAuthError("Token har gått ut")
  if (res.status === 429) throw new Error("Stravas gräns för anrop är nådd – försök igen om en kvart")
  if (!res.ok) throw new Error(`Strava svarade ${res.status}`)
  return (await res.json()) as T
}

/** Datum (YYYY-MM-DD) i klientens lokala tid: Strava ger start_date_local utan zon ("…Z" men lokal tid). */
const localDate = (a: StravaActivity) => (a.start_date_local ?? a.start_date).slice(0, 10)

export interface StravaSyncResult {
  activities: number
  estimated: number
}

/** Hur många aktiviteter utan kalorier vi hämtar detaljer för per synk (Stravas gräns: 100 anrop/15 min). */
const DETAIL_LIMIT = 10

/**
 * Hämtar senaste `days` dagarnas aktiviteter och sparar dem (idempotent).
 * Kalorier: Stravas egna (detaljanrop) → kilojoule från effektmätare (≈ kcal) →
 * uppskattning med MET × kroppsvikt × tid (markeras som uppskattad).
 */
export async function syncStrava(userId: string, days = 30): Promise<StravaSyncResult> {
  const db = createSupabaseAdmin()
  const [{ data: tok }, { data: conn }] = await Promise.all([
    db.from("wearable_tokens").select("access_token, refresh_token, expires_at").match({ user_id: userId, provider: "strava" }).maybeSingle(),
    db.from("wearable_connections").select("external_user_id, scopes").match({ user_id: userId, provider: "strava" }).maybeSingle(),
  ])
  if (!tok) throw new Error("Strava är inte kopplat")
  let tokens: StravaTokens = {
    accessToken: tok.access_token,
    refreshToken: tok.refresh_token ?? "",
    expiresAt: tok.expires_at ?? new Date(0).toISOString(),
    athleteId: conn?.external_user_id ?? "",
    scope: conn?.scopes ?? [],
  }
  const markError = (message: string) =>
    db.from("wearable_connections").update({ status: "error", last_error: message.slice(0, 300) }).match({ user_id: userId, provider: "strava" })

  try {
    if (new Date(tokens.expiresAt).getTime() < Date.now() + 120_000) {
      tokens = await refreshStrava(tokens)
      await saveStravaConnection(userId, tokens)
    }
    const after = Math.floor(new Date(`${addDays(todayISO(), -days)}T00:00:00Z`).getTime() / 1000)
    let list: StravaActivity[]
    try {
      list = await api<StravaActivity[]>(`/athlete/activities?after=${after}&per_page=100`, tokens.accessToken)
    } catch (e) {
      if (!(e instanceof StravaAuthError)) throw e
      tokens = await refreshStrava(tokens)
      await saveStravaConnection(userId, tokens)
      list = await api<StravaActivity[]>(`/athlete/activities?after=${after}&per_page=100`, tokens.accessToken)
    }

    // Senaste vikten för uppskattningen (70 kg om ingen vägning finns).
    const { data: w } = await db.from("weight_entries").select("kg").eq("client_id", userId).order("date", { ascending: false }).limit(1).maybeSingle()
    const weightKg = Number(w?.kg ?? 70)
    const { data: existing } = await db.from("activity_logs").select("external_id, kcal, kcal_estimated").match({ client_id: userId, source: "strava" })
    const known = new Map(((existing ?? []) as { external_id: string; kcal: number | null; kcal_estimated: boolean }[]).map((r) => [r.external_id, r]))

    let details = 0
    let estimated = 0
    const rows = []
    for (const a of list) {
      const id = String(a.id)
      const sport = a.sport_type ?? a.type ?? "Workout"
      const duration = Math.max(0, Math.round(a.moving_time ?? a.elapsed_time))
      let kcal: number | undefined = a.calories
      let isEstimate = false
      const prev = known.get(id)
      if (kcal === undefined && prev?.kcal !== null && prev && !prev.kcal_estimated) kcal = prev.kcal ?? undefined
      if (kcal === undefined && a.kilojoules) kcal = Math.round(a.kilojoules) // effektmätare: kJ mekaniskt ≈ kcal förbränt
      if (kcal === undefined && details < DETAIL_LIMIT) {
        details++
        const detail = await api<StravaActivity>(`/activities/${encodeURIComponent(id)}`, tokens.accessToken).catch(() => null)
        if (detail?.calories) kcal = Math.round(detail.calories)
      }
      if (kcal === undefined) {
        kcal = estimateKcal(sport, duration, weightKg)
        isEstimate = true
        estimated++
      }
      rows.push({
        client_id: userId,
        source: "strava",
        external_id: id,
        sport: sport.slice(0, 40),
        name: (a.name ?? "").slice(0, 200),
        started_at: a.start_date,
        date: localDate(a),
        duration_sec: Math.min(duration, 172800),
        distance_m: a.distance ? Math.round(a.distance * 10) / 10 : null,
        kcal: Math.min(20000, Math.max(0, Math.round(kcal))),
        kcal_estimated: isEstimate,
        updated_at: new Date().toISOString(),
      })
    }
    if (rows.length) {
      const { error } = await db.from("activity_logs").upsert(rows, { onConflict: "client_id,source,external_id" })
      if (error) throw new Error(error.message)
    }
    await db.from("wearable_connections").update({ status: "active", last_synced_at: new Date().toISOString(), last_error: null }).match({ user_id: userId, provider: "strava" })
    return { activities: rows.length, estimated }
  } catch (e) {
    if (e instanceof StravaAuthError) {
      await db.from("wearable_connections").update({ status: "revoked", last_error: "Åtkomsten har återkallats – koppla Strava igen" }).match({ user_id: userId, provider: "strava" })
    } else {
      await markError(e instanceof Error ? e.message : "Synk misslyckades")
    }
    throw e
  }
}

export async function saveStravaConnection(userId: string, tokens: StravaTokens) {
  const db = createSupabaseAdmin()
  const { error: e1 } = await db.from("wearable_connections").upsert({
    user_id: userId,
    provider: "strava",
    status: "active",
    external_user_id: tokens.athleteId,
    scopes: tokens.scope ?? [],
    connected_at: new Date().toISOString(),
    last_error: null,
  })
  if (e1) throw new Error(e1.message)
  const { error: e2 } = await db.from("wearable_tokens").upsert({
    user_id: userId,
    provider: "strava",
    access_token: tokens.accessToken,
    refresh_token: tokens.refreshToken,
    expires_at: tokens.expiresAt,
  })
  if (e2) throw new Error(e2.message)
}

/** Koppla från: återkalla hos Strava och radera anslutningen (passen raderas av en trigger). */
export async function disconnectStrava(userId: string): Promise<void> {
  const db = createSupabaseAdmin()
  const { data: tok } = await db.from("wearable_tokens").select("access_token").match({ user_id: userId, provider: "strava" }).maybeSingle()
  if (tok?.access_token) await deauthorizeStrava(tok.access_token)
  await db.from("wearable_connections").delete().match({ user_id: userId, provider: "strava" })
}
