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

// ----------------------------------------------------------------- ljud ---
/*
 * v73: tydligare och högre signal.
 *  - En enda ljudmotor (AudioContext) som låses upp när användaren trycker
 *    (primeAlertSound, t.ex. när ett set bockas av). iOS håller annars en
 *    ljudmotor som skapas utan tryck tyst – därför hördes signalen ibland inte.
 *  - Tre toner (stigande, den sista längre) med övertoner, nära full volym,
 *    genom en kompressor så att signalen blir hög utan att spricka.
 *  - På iPhone (iOS 17+) spelas den som ett kort "transient"-ljud: musik som
 *    spelas samtidigt sänks en stund i stället för att stoppas.
 */
type AudioSessionNavigator = Navigator & { audioSession?: { type: string } }
let audio: AudioContext | null = null

function audioContext(): AudioContext | null {
  if (typeof window === "undefined") return null
  if (audio && audio.state !== "closed") return audio
  const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  audio = Ctx ? new Ctx() : null
  return audio
}

/** Lås upp ljudet medan användaren trycker (anropas från en klickhändelse). */
export function primeAlertSound() {
  try {
    const ctx = audioContext()
    if (!ctx) return
    if (ctx.state === "suspended") void ctx.resume().catch(() => {})
    // En tyst, kort buffert "väcker" ljudet på äldre iOS.
    const silent = ctx.createBufferSource()
    silent.buffer = ctx.createBuffer(1, 1, 22050)
    silent.connect(ctx.destination)
    silent.start(0)
  } catch {}
}

/** Själva signalen. Används också av "Testa ljudet" i inställningen. */
export function playRestSound() {
  const ctx = audioContext()
  if (!ctx) return
  const session = (navigator as AudioSessionNavigator).audioSession
  try {
    if (session) session.type = "transient"
  } catch {}
  const play = () => {
    const t0 = ctx.currentTime + 0.02
    const comp = ctx.createDynamicsCompressor()
    comp.threshold.value = -12
    comp.knee.value = 6
    comp.ratio.value = 6
    comp.attack.value = 0.002
    comp.release.value = 0.12
    const master = ctx.createGain()
    master.gain.value = 1
    comp.connect(master).connect(ctx.destination)
    const tone = (at: number, freq: number, length: number) => {
      // Grundton + oktav: hörs tydligare i en bullrig gymlokal än en ren sinuston.
      for (const [mult, type, level] of [
        [1, "triangle", 0.9],
        [2, "sine", 0.35],
      ] as const) {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.type = type
        osc.frequency.value = freq * mult
        gain.gain.setValueAtTime(0.0001, t0 + at)
        gain.gain.exponentialRampToValueAtTime(level, t0 + at + 0.012)
        gain.gain.setValueAtTime(level, t0 + at + length * 0.6)
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + at + length)
        osc.connect(gain).connect(comp)
        osc.start(t0 + at)
        osc.stop(t0 + at + length + 0.02)
      }
    }
    tone(0, 988, 0.16)
    tone(0.2, 1319, 0.16)
    tone(0.4, 1568, 0.42)
    window.setTimeout(() => {
      try {
        if (session) session.type = "auto"
      } catch {}
    }, 1200)
  }
  if (ctx.state === "suspended") void ctx.resume().then(play, () => {})
  else play()
}

/** Vilan är slut: vibration, ljudsignal och (i bakgrunden på webben) en notis. */
export function restFinishedAlert() {
  navigator.vibrate?.([250, 120, 250, 120, 400])
  try {
    playRestSound()
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
