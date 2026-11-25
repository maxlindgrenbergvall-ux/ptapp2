"use client"

/**
 * Passtimern (v73): hur länge passet har pågått.
 *
 * v74: mäter hela passet – inte seten. Startar när passet öppnas (på passdagen)
 * och stannar när passet avslutas.
 * v81: tyst – ingen klocka under passet. Starttiden ligger kvar på enheten (även
 * när appen ligger i bakgrunden) och längden visas först i summeringen.
 * Avbockade set påverkar inte timern. Tiden
 * sparas på enheten per pass (localStorage) – den överlever att appen stängs
 * eller laddas om mitt i passet. Tider äldre än 60 dagar rensas bort.
 */
import * as React from "react"

export interface WorkoutTimerState {
  /** När timern startade (ms sedan epoch). */
  startedAt: number
  /** Satt medan timern är pausad. */
  pausedAt?: number
  /** Summan av alla pauser hittills. */
  pausedMs: number
  /** Satt när passet avslutades – tiden står då still. */
  endedAt?: number
}

const PREFIX = "coavira:workout-timer:v1:"
const MAX_AGE_MS = 60 * 24 * 3600 * 1000
const listeners = new Set<() => void>()
const cache = new Map<string, WorkoutTimerState | null>()

function read(id: string): WorkoutTimerState | null {
  if (cache.has(id)) return cache.get(id)!
  let state: WorkoutTimerState | null = null
  try {
    const raw = JSON.parse(localStorage.getItem(PREFIX + id) ?? "null") as Partial<WorkoutTimerState> | null
    if (raw && Number.isFinite(raw.startedAt)) {
      state = {
        startedAt: raw.startedAt!,
        pausedMs: Number.isFinite(raw.pausedMs) ? raw.pausedMs! : 0,
        ...(Number.isFinite(raw.pausedAt) ? { pausedAt: raw.pausedAt } : {}),
        ...(Number.isFinite(raw.endedAt) ? { endedAt: raw.endedAt } : {}),
      }
    }
  } catch {}
  cache.set(id, state)
  return state
}

function write(id: string, state: WorkoutTimerState | null) {
  cache.set(id, state)
  try {
    if (state) localStorage.setItem(PREFIX + id, JSON.stringify(state))
    else localStorage.removeItem(PREFIX + id)
  } catch {
    // Privat läge e.d.: timern gäller ändå under sessionen.
  }
  listeners.forEach((l) => l())
}

/** Rensa tider från pass som är äldre än 60 dagar. */
function prune(now: number) {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i)
      if (!key?.startsWith(PREFIX)) continue
      const s = JSON.parse(localStorage.getItem(key) ?? "null") as WorkoutTimerState | null
      if (!s || now - s.startedAt > MAX_AGE_MS) localStorage.removeItem(key)
    }
  } catch {}
}

/** Förfluten tid i millisekunder (utan pauser). */
export function elapsedMs(s: WorkoutTimerState, now: number): number {
  const end = s.endedAt ?? s.pausedAt ?? now
  return Math.max(0, end - s.startedAt - s.pausedMs)
}

export const isRunning = (s: WorkoutTimerState | null) => Boolean(s && !s.pausedAt && !s.endedAt)

/** Starta timern om den inte har startat (och återuppta den om den är pausad). */
export function startWorkoutTimer(id: string, now = Date.now()) {
  const s = read(id)
  if (!s) {
    prune(now)
    return write(id, { startedAt: now, pausedMs: 0 })
  }
  if (s.endedAt) return
  if (s.pausedAt) write(id, { startedAt: s.startedAt, pausedMs: s.pausedMs + (now - s.pausedAt) })
}

/** Starta timern om passet inte redan har en (en pausad timer förblir pausad). */
export function ensureWorkoutTimer(id: string, now = Date.now()) {
  if (!read(id)) startWorkoutTimer(id, now)
}

/** Pausa eller återuppta. */
export function toggleWorkoutTimer(id: string, now = Date.now()) {
  const s = read(id)
  if (!s || s.endedAt) return startWorkoutTimer(id, now)
  if (s.pausedAt) return startWorkoutTimer(id, now)
  write(id, { ...s, pausedAt: now })
}

/** Passet är avslutat: tiden står still. Ger passets tid i sekunder (eller null utan timer). */
export function endWorkoutTimer(id: string, now = Date.now()): number | null {
  const s = read(id)
  if (!s) return null
  if (!s.endedAt) {
    const ended = { ...s, endedAt: s.pausedAt ?? now }
    write(id, ended)
    return Math.round(elapsedMs(ended, now) / 1000)
  }
  return Math.round(elapsedMs(s, now) / 1000)
}

/** Timerns tillstånd för ett pass (uppdateras i alla vyer när det ändras). */
export function useWorkoutTimer(id: string): WorkoutTimerState | null {
  return React.useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => read(id),
    () => null
  )
}

/** "4:05", "47:12" eller "1:02:09". */
export function formatElapsed(ms: number): string {
  const total = Math.floor(ms / 1000)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = String(total % 60).padStart(2, "0")
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`
}

/** Utloggning / radering: inga passtider kvar på enheten. */
export function forgetWorkoutTimers() {
  cache.clear()
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i)
      if (key?.startsWith(PREFIX)) localStorage.removeItem(key)
    }
  } catch {}
  listeners.forEach((l) => l())
}

/** v81: passets längd i summeringen – "48 min" eller "1 tim 15 min" (minst 1 min). */
export function formatDuration(sec: number): string {
  const total = Math.max(1, Math.round(sec / 60))
  const h = Math.floor(total / 60)
  const m = total % 60
  if (!h) return `${m} min`
  return m ? `${h} tim ${m} min` : `${h} tim`
}
