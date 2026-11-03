"use client"

/**
 * Hälsodata från telefonen (v32): Apple Hälsa (HealthKit) på iPhone och
 * Health Connect på Android, via @capgo/capacitor-health i Coavira-appen.
 *
 * Läser (aldrig skriver):
 *   - aktiv energi per dag ("calories"), aktiva minuter ("exerciseTime") och steg,
 *   - träningspass ("workouts") med kalorier, längd och distans.
 * Datan finns bara på telefonen – det finns inget webb-API – så appen läser
 * den och sparar dagssummor och pass i Supabase (RLS: bara egna rader).
 * I webbläsaren är allt här avstängt.
 */
import { addDays, todayISO, toISODate } from "@/lib/date"
import { isNativeApp, nativePlatform } from "@/lib/native/app"
import type { ActivityDay, ActivityLog, ID } from "@/types/domain"

const READ = ["calories", "exerciseTime", "steps", "workouts"] as const
const CONNECTED_KEY = "coavira:health:connected"
const LAST_SYNC_KEY = "coavira:health:last-sync"

export type HealthPlatformSource = "apple_health" | "google_fit"

export function healthSource(): HealthPlatformSource | null {
  const p = nativePlatform()
  return p === "ios" ? "apple_health" : p === "android" ? "google_fit" : null
}

export const HEALTH_LABEL: Record<HealthPlatformSource, string> = { apple_health: "Apple Hälsa", google_fit: "Health Connect" }

// Pluginet lindas in i ett objekt: ett Capacitor-plugin får inte returneras direkt ur
// ett promise (då anropar `await` pluginets .then(), som inte finns).
const plugin = async () => ({ Health: (await import("@capgo/capacitor-health")).Health })

/** Finns HealthKit / Health Connect på telefonen (och pluginet i appbygget)? */
export async function healthAvailable(): Promise<boolean> {
  if (!isNativeApp()) return false
  try {
    const { Health } = await plugin()
    return (await Health.isAvailable()).available
  } catch {
    return false
  }
}

export function healthConnected(): boolean {
  try {
    return isNativeApp() && localStorage.getItem(CONNECTED_KEY) === "1"
  } catch {
    return false
  }
}

/** Be om läsbehörighet (systemets egen dialog). Returnerar false om användaren nekar allt. */
export async function connectHealth(): Promise<boolean> {
  const { Health } = await plugin()
  const status = await Health.requestAuthorization({ read: [...READ], requestHistoryAccess: false })
  // iOS visar inte om läsning nekats (integritet) – då tolkas svaret som ok.
  const ok = nativePlatform() === "ios" || status.readAuthorized.length > 0
  try {
    if (ok) localStorage.setItem(CONNECTED_KEY, "1")
  } catch {
    // ignoreras
  }
  return ok
}

export function disconnectHealth() {
  try {
    localStorage.removeItem(CONNECTED_KEY)
    localStorage.removeItem(LAST_SYNC_KEY)
  } catch {
    // ignoreras
  }
}

/** Synka högst var 15:e minut automatiskt (vid appstart/återkomst). */
export function healthSyncDue(): boolean {
  try {
    return healthConnected() && Date.now() - Number(localStorage.getItem(LAST_SYNC_KEY) ?? 0) > 15 * 60_000
  } catch {
    return false
  }
}

/**
 * Läser de senaste `days` dygnens hälsodata. Dagssummorna (aktiv energi,
 * aktiva minuter, steg) och passen returneras i appens format; anroparen sparar dem.
 */
export async function readDeviceActivity(clientId: ID, days = 14): Promise<{ days: ActivityDay[]; activities: ActivityLog[] }> {
  const source = healthSource()
  if (!source) return { days: [], activities: [] }
  const { Health } = await plugin()
  const startDate = new Date(`${addDays(todayISO(), -(days - 1))}T00:00:00`).toISOString()
  const endDate = new Date().toISOString()
  const agg = async (dataType: "calories" | "exerciseTime" | "steps") => {
    try {
      const { samples } = await Health.queryAggregated({ dataType, startDate, endDate, bucket: "day", aggregation: "sum" })
      return new Map(samples.map((s) => [toISODate(new Date(s.startDate)), s.value]))
    } catch {
      return new Map<string, number>()
    }
  }
  const [kcal, minutes, steps] = await Promise.all([agg("calories"), agg("exerciseTime"), agg("steps")])
  const dates = new Set([...kcal.keys(), ...minutes.keys(), ...steps.keys()])
  const dayRows: ActivityDay[] = [...dates]
    .filter((date) => (kcal.get(date) ?? 0) > 0 || (steps.get(date) ?? 0) > 0)
    .map((date) => ({
      clientId,
      date,
      source,
      activeKcal: Math.min(20000, Math.round(kcal.get(date) ?? 0)),
      activeMinutes: minutes.has(date) ? Math.min(1440, Math.round(minutes.get(date)!)) : undefined,
      steps: steps.has(date) ? Math.min(300000, Math.round(steps.get(date)!)) : undefined,
    }))

  let workouts: Awaited<ReturnType<typeof Health.queryWorkouts>>["workouts"] = []
  try {
    workouts = (await Health.queryWorkouts({ startDate, endDate, limit: 200, ascending: false })).workouts
  } catch {
    workouts = []
  }
  const activities: ActivityLog[] = workouts.map((w) => ({
    id: crypto.randomUUID(),
    clientId,
    source,
    externalId: (w.platformId ?? `${w.startDate}-${w.workoutType}`).slice(0, 200),
    sport: w.workoutType,
    name: w.sourceName ? `${w.sourceName}` : "",
    startedAt: new Date(w.startDate).toISOString(),
    date: toISODate(new Date(w.startDate)),
    durationSec: Math.min(172800, Math.max(0, Math.round(w.duration))),
    distanceM: w.totalDistance ? Math.round(w.totalDistance * 10) / 10 : undefined,
    kcal: w.totalEnergyBurned !== undefined ? Math.min(20000, Math.round(w.totalEnergyBurned)) : undefined,
  }))
  try {
    localStorage.setItem(LAST_SYNC_KEY, String(Date.now()))
  } catch {
    // ignoreras
  }
  return { days: dayRows, activities }
}
