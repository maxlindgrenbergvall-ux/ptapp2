"use client"

import * as React from "react"

import { dayPart, type DayPart } from "@/lib/greeting"

// En gemensam minut-timer för alla som lyssnar (hälsningen byter när klockan passerar 05, 10 och 18).
const listeners = new Set<() => void>()
let timer: ReturnType<typeof setInterval> | null = null
let current: DayPart | null = null

function subscribe(cb: () => void) {
  listeners.add(cb)
  if (!timer) {
    timer = setInterval(() => {
      const next = dayPart(new Date())
      if (next !== current) {
        current = next
        listeners.forEach((l) => l())
      }
    }, 60_000)
  }
  // Appen kommer tillbaka från bakgrunden (Capacitor/flik): räkna om direkt.
  const onVisible = () => {
    if (document.visibilityState === "visible") {
      current = dayPart(new Date())
      cb()
    }
  }
  document.addEventListener("visibilitychange", onVisible)
  return () => {
    listeners.delete(cb)
    document.removeEventListener("visibilitychange", onVisible)
    if (!listeners.size && timer) {
      clearInterval(timer)
      timer = null
    }
  }
}

const snapshot = () => (current ??= dayPart(new Date()))

/**
 * Del av dygnet enligt enhetens klocka. Servern (förrendering) ger "day" –
 * neutralt "Hej …!" – och klienten byter direkt efter hydreringen.
 */
export function useDayPart(): DayPart {
  return React.useSyncExternalStore(subscribe, snapshot, () => "day")
}
