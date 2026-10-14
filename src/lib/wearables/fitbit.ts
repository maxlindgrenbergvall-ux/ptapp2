import "server-only"

/**
 * Fitbit Web API (OAuth 2.0 Authorization Code + PKCE-fritt "server"-flöde).
 * https://dev.fitbit.com/build/reference/web-api/
 *
 * Kräver en app registrerad på dev.fitbit.com (typ "Server") med callback-URL
 * https://<domän>/api/wearables/fitbit/callback och scope "sleep".
 */
import { estimateSleepScore } from "@/lib/wearables/sleep-score"
import type { SleepRecord, TokenSet, WearableAdapter } from "@/lib/wearables/types"

const AUTH_URL = "https://www.fitbit.com/oauth2/authorize"
const TOKEN_URL = "https://api.fitbit.com/oauth2/token"
const API = "https://api.fitbit.com"

const CLIENT_ID = process.env.FITBIT_CLIENT_ID ?? ""
const CLIENT_SECRET = process.env.FITBIT_CLIENT_SECRET ?? ""

interface FitbitTokenResponse {
  access_token: string
  refresh_token: string
  expires_in: number
  scope: string
  user_id: string
}

interface FitbitSleep {
  logId: number
  dateOfSleep: string
  minutesAsleep: number
  timeInBed: number
  isMainSleep: boolean
  levels?: { summary?: Partial<Record<"deep" | "light" | "rem" | "wake", { minutes: number }>> }
}

async function tokenRequest(body: Record<string, string>): Promise<TokenSet> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(body),
    cache: "no-store",
  })
  if (!res.ok) throw new Error(`Fitbit token: ${res.status} ${await res.text()}`)
  const t = (await res.json()) as FitbitTokenResponse
  return {
    accessToken: t.access_token,
    refreshToken: t.refresh_token,
    expiresAt: new Date(Date.now() + t.expires_in * 1000).toISOString(),
    scope: t.scope.split(" "),
    externalUserId: t.user_id,
  }
}

export const fitbitAdapter: WearableAdapter = {
  provider: "fitbit",
  configured: Boolean(CLIENT_ID && CLIENT_SECRET),

  authorizeUrl(state, redirectUri) {
    const q = new URLSearchParams({
      client_id: CLIENT_ID,
      response_type: "code",
      scope: "sleep",
      redirect_uri: redirectUri,
      state,
      prompt: "consent",
    })
    return `${AUTH_URL}?${q}`
  },

  exchangeCode: (code, redirectUri) =>
    tokenRequest({ grant_type: "authorization_code", code, redirect_uri: redirectUri, client_id: CLIENT_ID }),

  async refresh(tokens) {
    if (!tokens.refreshToken) throw new Error("Saknar refresh token – anslut Fitbit igen")
    return { ...(await tokenRequest({ grant_type: "refresh_token", refresh_token: tokens.refreshToken })), externalUserId: tokens.externalUserId }
  },

  async fetchSleep(tokens, from, to) {
    const res = await fetch(`${API}/1.2/user/-/sleep/date/${from}/${to}.json`, {
      headers: { Authorization: `Bearer ${tokens.accessToken}`, "Accept-Language": "sv_SE" },
      cache: "no-store",
    })
    if (res.status === 401) throw new TokenExpiredError()
    if (!res.ok) throw new Error(`Fitbit sleep: ${res.status}`)
    const { sleep } = (await res.json()) as { sleep: FitbitSleep[] }
    // Huvudsömnen per natt (tupplurar räknas inte).
    return sleep
      .filter((s) => s.isMainSleep)
      .map((s): SleepRecord => {
        const sum = s.levels?.summary
        const stages =
          sum?.deep && sum.light && sum.rem && sum.wake
            ? { deep: sum.deep.minutes, light: sum.light.minutes, rem: sum.rem.minutes, awake: sum.wake.minutes }
            : undefined
        const hours = Math.round((s.minutesAsleep / 60) * 10) / 10
        return { date: s.dateOfSleep, hours, stages, sleepScore: estimateSleepScore(hours, stages), externalId: String(s.logId) }
      })
  },
}

export class TokenExpiredError extends Error {}

/**
 * Verifierar X-Fitbit-Signature: base64(HMAC-SHA1(body, client_secret + "&")).
 */
export async function verifyFitbitSignature(body: string, signature: string | null) {
  if (!signature || !CLIENT_SECRET) return false
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(`${CLIENT_SECRET}&`), { name: "HMAC", hash: "SHA-1" }, false, ["sign"])
  const mac = Buffer.from(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body))).toString("base64")
  return timingSafeEqual(mac, signature)
}

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}
