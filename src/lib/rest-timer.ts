"use client"

/**
 * Vilotid (v32): användarens egen standard, före eller under passet.
 *
 * Inställningen sparas på enheten (localStorage) – den hör till hur man
 * tränar just där och synkas inte. Läget avgör vilken vilotid timern startar med:
 *   - "exercise": passets/övningens vilotid (PT:ns), annars standarden,
 *   - "fixed":    alltid min egen vilotid.
 *
 * När vilan är slut: vibration + kort ljudsignal i appen, och en notis om
 * appen ligger i bakgrunden eller skärmen är låst (lokal notis i Capacitor,
 * Notification API i webbläsaren).
 */
import * as React from "react"

import { isNativeApp } from "@/lib/native/app"

export const REST_PRESETS = [45, 60, 90, 120, 180] as const
export const REST_MIN = 10
export const REST_MAX = 600

export type RestMode = "exercise" | "fixed"
export interface RestPreference {
  mode: RestMode
  seconds: number
  /** Ljud och vibration när vilan är slut. */
  alert: boolean
}

const KEY = "coavira:rest:v1"
export const DEFAULT_REST: RestPreference = { mode: "exercise", seconds: 90, alert: true }

const clampSeconds = (n: number) => Math.min(REST_MAX, Math.max(REST_MIN, Math.round(n / 5) * 5))

function read(): RestPreference {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "null") as Partial<RestPreference> | null
    if (!raw) return DEFAULT_REST
    return {
      mode: raw.mode === "fixed" ? "fixed" : "exercise",
      seconds: Number.isFinite(raw.seconds) ? clampSeconds(raw.seconds!) : DEFAULT_REST.seconds,
      alert: raw.alert !== false,
    }
  } catch {
    return DEFAULT_REST
  }
}

const listeners = new Set<() => void>()
let cache: RestPreference | null = null

export function getRestPreference(): RestPreference {
  if (typeof window === "undefined") return DEFAULT_REST
  return (cache ??= read())
}

export function setRestPreference(patch: Partial<RestPreference>) {
  const next = { ...getRestPreference(), ...patch }
  next.seconds = clampSeconds(next.seconds)
  cache = next
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    // Privat läge e.d.: gäller ändå under sessionen.
  }
  listeners.forEach((l) => l())
}

/** Inställningen som React-state (uppdateras i alla vyer när den ändras). */
export function useRestPreference(): [RestPreference, (patch: Partial<RestPreference>) => void] {
  const pref = React.useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    getRestPreference,
    () => DEFAULT_REST
  )
  return [pref, setRestPreference]
}

/**
 * Vilotiden (sekunder) efter ett set. "fixed" = alltid min egen. Annars
 * övningens (0 = ingen vila, t.ex. superset) och min standard om den saknas.
 */
export function restSecondsFor(exerciseRest: number | undefined, pref: RestPreference): number {
  if (pref.mode === "fixed") return pref.seconds
  return exerciseRest === undefined || !Number.isFinite(exerciseRest) ? pref.seconds : Math.max(0, exerciseRest)
}

export function formatRest(seconds: number): string {
  if (seconds < 60) return `${seconds} s`
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return s ? `${m}:${String(s).padStart(2, "0")} min` : `${m} min`
}

// --------------------------------------------------------------- notiser ---
const NOTIFICATION_ID = 7301

/**
 * Schemalägger "Vilan är slut" vid `endsAt`. I appen en lokal notis (syns på
 * låsskärmen); i webbläsaren en Notification när fliken ligger i bakgrunden.
 */
export async function scheduleRestNotification(endsAt: number): Promise<void> {
  if (isNativeApp()) {
    try {
      const { LocalNotifications } = await import("@capacitor/local-notifications")
      const perm = await LocalNotifications.checkPermissions()
      if (perm.display !== "granted" && (await LocalNotifications.requestPermissions()).display !== "granted") return
      await LocalNotifications.cancel({ notifications: [{ id: NOTIFICATION_ID }] })
      await LocalNotifications.schedule({
        notifications: [{ id: NOTIFICATION_ID, title: "Vilan är slut", body: "Dags för nästa set 💪", schedule: { at: new Date(endsAt), allowWhileIdle: true } }],
      })
    } catch {
      // Pluginet saknas i äldre appbyggen: ljud och vibration i appen räcker.
    }
  }
}

export async function cancelRestNotification(): Promise<void> {
  if (!isNativeApp()) return
  try {
    const { LocalNotifications } = await import("@capacitor/local-notifications")
    await LocalNotifications.cancel({ notifications: [{ id: NOTIFICATION_ID }] })
  } catch {
    // ingen notis att ta bort
  }
}

/** Webbläsaren: be om tillåtelse för notiser (bara efter en användarhandling). */
export function requestWebNotificationPermission() {
  if (isNativeApp() || typeof Notification === "undefined" || Notification.permission !== "default") return
  void Notification.requestPermission().catch(() => {})
}

/** Vilan är slut: vibration, ljudsignal och (i bakgrunden på webben) en notis. */
export function restFinishedAlert() {
  navigator.vibrate?.([200, 100, 200])
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (Ctx) {
      const ctx = new Ctx()
      const beep = (at: number, freq: number) => {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.frequency.value = freq
        gain.gain.setValueAtTime(0.0001, ctx.currentTime + at)
        gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + at + 0.02)
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + at + 0.18)
        osc.connect(gain).connect(ctx.destination)
        osc.start(ctx.currentTime + at)
        osc.stop(ctx.currentTime + at + 0.2)
      }
      beep(0, 880)
      beep(0.25, 1175)
      setTimeout(() => void ctx.close(), 800)
    }
  } catch {
    // ljud är ett tillägg – vibrationen och timern räcker
  }
  if (!isNativeApp() && document.visibilityState === "hidden" && typeof Notification !== "undefined" && Notification.permission === "granted") {
    try {
      new Notification("Vilan är slut", { body: "Dags för nästa set", tag: "coavira-rest" })
    } catch {
      // vissa mobila webbläsare kräver service worker för notiser
    }
  }
}
