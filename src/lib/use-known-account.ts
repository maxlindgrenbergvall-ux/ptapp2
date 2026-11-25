"use client"

import * as React from "react"

import { KNOWN_COOKIE, type KnownAccount, parseKnown } from "@/lib/known-account"

/** Skickas när enheten glömmer eller minns ett konto (forgetAccount/rememberAccount). */
export const KNOWN_EVENT = "coavira:known-account"

let lastRaw: string | undefined
let lastValue: KnownAccount | null = null

function snapshot(): KnownAccount | null {
  const raw = document.cookie
    .split("; ")
    .find((c) => c.startsWith(`${KNOWN_COOKIE}=`))
    ?.slice(KNOWN_COOKIE.length + 1)
  if (raw !== lastRaw) {
    lastRaw = raw
    lastValue = parseKnown(raw)
  }
  return lastValue
}

function subscribe(onChange: () => void) {
  window.addEventListener(KNOWN_EVENT, onChange)
  window.addEventListener("focus", onChange)
  return () => {
    window.removeEventListener(KNOWN_EVENT, onChange)
    window.removeEventListener("focus", onChange)
  }
}

/** v80: kontot enheten minns (null på servern och första renderingen). */
export function useKnownAccount(): KnownAccount | null {
  return React.useSyncExternalStore(subscribe, snapshot, () => null)
}
