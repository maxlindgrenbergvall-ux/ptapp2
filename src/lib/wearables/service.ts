import "server-only"

/**
 * Serverlogik för wearables: koppla, synka och spara sömn. Körs med service
 * role eftersom tokens inte är läsbara för inloggade (se migrationen).
 */
import { addDays, todayISO } from "@/lib/date"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { fitbitAdapter, TokenExpiredError } from "@/lib/wearables/fitbit"
import { mockAdapter } from "@/lib/wearables/mock"
import type { SleepRecord, TokenSet, WearableAdapter } from "@/lib/wearables/types"
import type { HealthSource, WearableProvider } from "@/types/domain"

/** Apple Health och Health Connect saknar webb-API (data finns bara på telefonen). */
export const WEB_OAUTH_PROVIDERS: WearableProvider[] = ["fitbit"]

export function adapterFor(provider: WearableProvider): WearableAdapter {
  if (provider === "fitbit" && fitbitAdapter.configured) return fitbitAdapter
  return mockAdapter(provider)
}

export function sourceFor(adapter: WearableAdapter): HealthSource {
  return adapter.configured ? adapter.provider : "mock"
}

export async function saveConnection(userId: string, provider: WearableProvider, tokens: TokenSet) {
  const db = createSupabaseAdmin()
  const { error: e1 } = await db.from("wearable_connections").upsert({
    user_id: userId,
    provider,
    status: "active",
    external_user_id: tokens.externalUserId,
    scopes: tokens.scope ?? [],
    connected_at: new Date().toISOString(),
    last_error: null,
  })
  if (e1) throw new Error(e1.message)
  const { error: e2 } = await db.from("wearable_tokens").upsert({
    user_id: userId,
    provider,
    access_token: tokens.accessToken,
    refresh_token: tokens.refreshToken ?? null,
    expires_at: tokens.expiresAt ?? null,
  })
  if (e2) throw new Error(e2.message)
}

/** Hämtar sömn för de senaste `days` nätterna och sparar dem. Returnerar sparade rader. */
export async function syncSleep(userId: string, provider: WearableProvider, days = 7): Promise<SleepRecord[]> {
  const db = createSupabaseAdmin()
  const adapter = adapterFor(provider)
  const { data: row, error } = await db
    .from("wearable_tokens")
    .select("access_token, refresh_token, expires_at")
    .match({ user_id: userId, provider })
    .single()
  if (error || !row) throw new Error("Ingen anslutning")

  const { data: conn } = await db.from("wearable_connections").select("external_user_id").match({ user_id: userId, provider }).single()
  let tokens: TokenSet = {
    accessToken: row.access_token,
    refreshToken: row.refresh_token ?? undefined,
    expiresAt: row.expires_at ?? undefined,
    externalUserId: conn?.external_user_id ?? "",
  }

  const to = todayISO()
  const from = addDays(to, -(days - 1))
  let records: SleepRecord[]
  try {
    if (tokens.expiresAt && new Date(tokens.expiresAt).getTime() < Date.now() + 60_000) tokens = await refreshAndStore(userId, adapter, tokens)
    records = await adapter.fetchSleep(tokens, from, to)
  } catch (e) {
    if (e instanceof TokenExpiredError) {
      tokens = await refreshAndStore(userId, adapter, tokens)
      records = await adapter.fetchSleep(tokens, from, to)
    } else {
      await db.from("wearable_connections").update({ status: "error", last_error: String(e) }).match({ user_id: userId, provider })
      throw e
    }
  }

  if (records.length) {
    const { error: upErr } = await db.from("sleep_logs").upsert(
      records.map((r) => ({
        client_id: userId,
        date: r.date,
        hours: r.hours,
        sleep_score: r.sleepScore ?? null,
        stages: r.stages ?? null,
        source: sourceFor(adapter),
        external_id: r.externalId ?? null,
        updated_at: new Date().toISOString(),
      }))
    )
    if (upErr) throw new Error(upErr.message)
  }
  await db
    .from("wearable_connections")
    .update({ status: "active", last_synced_at: new Date().toISOString(), last_error: null })
    .match({ user_id: userId, provider })
  return records
}

async function refreshAndStore(userId: string, adapter: WearableAdapter, tokens: TokenSet) {
  const fresh = await adapter.refresh(tokens)
  await saveConnection(userId, adapter.provider, fresh)
  return fresh
}

/** Webhook: hitta användaren bakom ett leverantörs-id. */
export async function userForExternalId(provider: WearableProvider, externalUserId: string) {
  const { data } = await createSupabaseAdmin()
    .from("wearable_connections")
    .select("user_id")
    .match({ provider, external_user_id: externalUserId })
    .maybeSingle()
  return (data?.user_id as string | undefined) ?? null
}
