"use client"

import * as React from "react"

import { purchaseMode, type PurchaseMode } from "@/lib/native/purchases"

const noop = () => () => {}

/** Hur Plus och Boost köps här (se purchaseMode). Servern renderar som webben (Stripe). */
export function usePurchaseMode(): PurchaseMode {
  return React.useSyncExternalStore(noop, purchaseMode, () => "stripe")
}
