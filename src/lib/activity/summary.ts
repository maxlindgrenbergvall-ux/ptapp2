/**
 * Kalorimätaren (v32): förbränd energi och aktiv tid per dag från Strava,
 * Apple Health (HealthKit) och Health Connect.
 *
 * Dubbelräkning undviks så här:
 *   - Telefonens dagssumma (aktiv energi) innehåller redan klockans pass och
 *     ofta även Strava-pass som synkats dit. Därför adderas den inte till
 *     passen – i stället används det STÖRSTA av
 *       (a) telefonens dagssumma (Apple Health / Health Connect; max om båda finns) och
 *       (b) summan av dagens pass (Strava + telefonens pass + manuella, utan dubbletter).
 *   - Samma pass från två källor (t.ex. Strava och Apple Health) räknas en gång:
 *     pass som börjar inom 5 minuter från varandra med samma längd (±20 %)
 *     slås ihop, och källan med kalorier vinner.
 * Ren TypeScript – enhetstestad i e2e/activity.unit.ts.
 */
import type { ActivityDay, ActivityLog, ActivitySource, ID, ISODate } from "@/types/domain"

export interface DayActivitySummary {
  date: ISODate
  /** Förbränd aktiv energi (kcal). */
  activeKcal: number
  activeMinutes: number
  steps?: number
  /** Dagens pass (utan dubbletter), senaste först. */
  activities: ActivityLog[]
  /** Källor som bidrog. */
  sources: ActivitySource[]
  /** Någon kalorisiffra är uppskattad (MET) i stället för uppmätt. */
  estimated: boolean
}

const SOURCE_RANK: Record<ActivitySource, number> = { strava: 3, apple_health: 2, google_fit: 2, manual: 1 }

/** Samma pass från två källor? Start inom 5 min och längd inom 20 %. */
function samePass(a: ActivityLog, b: ActivityLog): boolean {
  const dt = Math.abs(new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime())
  const longest = Math.max(a.durationSec, b.durationSec, 1)
  return dt <= 5 * 60_000 && Math.abs(a.durationSec - b.durationSec) / longest <= 0.2
}

/** Pass utan dubbletter. Vid dubblett vinner uppmätta kalorier, sedan källans rang (Strava har namn och karta). */
export function dedupeActivities(list: ActivityLog[]): ActivityLog[] {
  const out: ActivityLog[] = []
  const sorted = [...list].sort((a, b) => a.startedAt.localeCompare(b.startedAt))
  for (const a of sorted) {
    const i = out.findIndex((b) => b.source !== a.source && samePass(a, b))
    if (i < 0) {
      out.push(a)
      continue
    }
    const b = out[i]
    const score = (x: ActivityLog) => (x.kcal !== undefined && !x.kcalEstimated ? 10 : 0) + SOURCE_RANK[x.source]
    out[i] = score(a) > score(b) ? a : b
  }
  return out.sort((a, b) => b.startedAt.localeCompare(a.startedAt))
}

export function daySummary(activities: ActivityLog[], days: ActivityDay[], clientId: ID, date: ISODate): DayActivitySummary {
  const passes = dedupeActivities(activities.filter((a) => a.clientId === clientId && a.date === date))
  const device = days.filter((d) => d.clientId === clientId && d.date === date)
  const passKcal = passes.reduce((s, a) => s + (a.kcal ?? 0), 0)
  const passMinutes = Math.round(passes.reduce((s, a) => s + a.durationSec, 0) / 60)
  const deviceKcal = Math.max(0, ...device.map((d) => d.activeKcal))
  const deviceMinutes = Math.max(0, ...device.map((d) => d.activeMinutes ?? 0))
  const steps = device.some((d) => d.steps !== undefined) ? Math.max(...device.map((d) => d.steps ?? 0)) : undefined
  const sources = [...new Set<ActivitySource>([...device.map((d) => d.source), ...passes.map((a) => a.source)])]
  return {
    date,
    activeKcal: Math.round(Math.max(deviceKcal, passKcal)),
    activeMinutes: Math.max(deviceMinutes, passMinutes),
    steps,
    activities: passes,
    sources,
    estimated: deviceKcal < passKcal && passes.some((a) => a.kcalEstimated),
  }
}

/** Senaste `n` dagarnas förbränning (äldst först) – för veckostaplarna. */
export function recentDays(activities: ActivityLog[], days: ActivityDay[], clientId: ID, dates: ISODate[]): DayActivitySummary[] {
  return dates.map((d) => daySummary(activities, days, clientId, d))
}

// ------------------------------------------------------------ sporter ---
const SPORT_SV: Record<string, string> = {
  run: "Löpning",
  running: "Löpning",
  trailrun: "Trail",
  virtualrun: "Löpband",
  runningtreadmill: "Löpband",
  walk: "Promenad",
  walking: "Promenad",
  hike: "Vandring",
  hiking: "Vandring",
  ride: "Cykel",
  cycling: "Cykel",
  virtualride: "Inomhuscykel",
  ebikeride: "Elcykel",
  mountainbikeride: "MTB",
  gravelride: "Grus",
  bikingstationary: "Spinning",
  swim: "Simning",
  swimming: "Simning",
  swimmingpool: "Simning",
  rowing: "Rodd",
  rowingmachine: "Roddmaskin",
  nordicski: "Längdskidor",
  crosscountryskiing: "Längdskidor",
  alpineski: "Utförsåkning",
  weighttraining: "Styrketräning",
  traditionalstrengthtraining: "Styrketräning",
  functionalstrengthtraining: "Funktionell styrka",
  strengthtraining: "Styrketräning",
  workout: "Träningspass",
  crossfit: "CrossFit",
  highintensityintervaltraining: "HIIT",
  hiit: "HIIT",
  yoga: "Yoga",
  pilates: "Pilates",
  elliptical: "Crosstrainer",
  stairstepper: "Trappmaskin",
  stairclimbing: "Trappmaskin",
  soccer: "Fotboll",
  tennis: "Tennis",
  padel: "Padel",
}

export function sportLabel(sport: string): string {
  return SPORT_SV[sport.toLowerCase().replace(/[^a-z]/g, "")] ?? sport
}

/**
 * Ungefärliga MET-värden (Compendium of Physical Activities) – används bara när
 * källan saknar kalorier: kcal ≈ MET × kg × timmar.
 */
const MET: Record<string, number> = {
  run: 9.8, running: 9.8, trailrun: 9.8, virtualrun: 9.0, walk: 3.8, walking: 3.8, hike: 6.0, hiking: 6.0,
  ride: 7.5, cycling: 7.5, virtualride: 6.8, ebikeride: 4.0, mountainbikeride: 8.5, gravelride: 8.0,
  swim: 7.0, swimming: 7.0, rowing: 7.0, nordicski: 9.0, alpineski: 5.3, weighttraining: 5.0, workout: 5.5,
  crossfit: 8.0, hiit: 8.0, yoga: 2.5, pilates: 3.0, elliptical: 5.0, soccer: 7.0, tennis: 7.3, padel: 6.0,
}

export function estimateKcal(sport: string, durationSec: number, weightKg: number): number {
  const met = MET[sport.toLowerCase().replace(/[^a-z]/g, "")] ?? 5
  return Math.round(met * weightKg * (durationSec / 3600))
}

export function formatDuration(sec: number): string {
  const h = Math.floor(sec / 3600)
  const m = Math.round((sec % 3600) / 60)
  return h ? `${h} h ${m} min` : `${m} min`
}

export function formatDistance(m: number | undefined): string | null {
  if (!m) return null
  return m >= 1000 ? `${(m / 1000).toLocaleString("sv-SE", { maximumFractionDigits: 1 })} km` : `${Math.round(m)} m`
}

export const SOURCE_LABEL: Record<ActivitySource, string> = {
  strava: "Strava",
  apple_health: "Apple Hälsa",
  google_fit: "Health Connect",
  manual: "Manuellt",
}
