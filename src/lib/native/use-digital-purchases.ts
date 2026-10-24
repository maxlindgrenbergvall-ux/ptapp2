"use client"

import * as React from "react"

import { digitalPurchasesAllowed } from "@/lib/native/app"

const noop = () => () => {}

/** Se digitalPurchasesAllowed(). Servern renderar som webben (köp tillåtna). */
export function useDigitalPurchasesAllowed() {
  return React.useSyncExternalStore(noop, digitalPurchasesAllowed, () => true)
}
