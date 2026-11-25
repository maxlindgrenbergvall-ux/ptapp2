"use client"

/**
 * Aktiverad PT (v81): Stripe tar emot kort OCH minst ett aktivt coachingpaket.
 * Först då syns PT:n i Hitta PT och kan bjuda in egna klienter. Databasen håller
 * samma regel (trainers.is_pt_activated) – det här är vyns bild av den.
 */
import * as React from "react"

import { useAppData } from "@/lib/data/store"
import { demoPayoutsDone } from "@/lib/pt-onboarding-flow"
import { getSupabase } from "@/lib/supabase/client"
import { isSupabaseEnabled } from "@/lib/supabase/config"
import type { AppData, Trainer } from "@/types/domain"

/** Syns PT:n i Hitta PT, sökresultat och rekommendationer? */
export const isMarketplaceVisible = (t: Trainer) => t.isPublished && t.isPtActivated !== false

export const activePackages = (data: Pick<AppData, "services">, trainerId: string) =>
  data.services.filter((s) => s.trainerId === trainerId && s.active).length

export interface Activation {
  stripe: boolean
  packages: number
  activated: boolean
  /** Stripe-statusen är hämtad (Supabase) – innan dess visas ingen spärr. */
  ready: boolean
  refresh: () => void
}

// Gemensamt för alla vyer: en koppling i checklistan syns direkt i knappar och kort.
const listeners = new Set<() => void>()
let remoteStripe: boolean | null = null
let loading: Promise<void> | null = null
let demoStripe: boolean | null = null

const emit = () => listeners.forEach((l) => l())
const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}

function loadRemote(fallback: boolean) {
  if (loading || !isSupabaseEnabled) return
  loading = (async () => {
    const { data, error } = await getSupabase().rpc("my_activation_status")
    // Före v81-migrationen: falla tillbaka på Stripe-flaggan på profilen.
    const row = data as { stripe_charges_enabled?: boolean } | null
    remoteStripe = error || !row ? fallback : Boolean(row.stripe_charges_enabled)
    loading = null
    emit()
  })()
}

/** Läs om Stripe-statusen (efter en koppling) – alla vyer uppdateras. */
export function refreshActivation() {
  remoteStripe = null
  demoStripe = null
  emit()
}

/** PT:ns egen aktivering (checklistan, inbjudningar och publicering). */
export function useActivation(): Activation {
  const { data, me, mode } = useAppData()
  const trainer = data.trainers.find((t) => t.id === me.id)
  const packages = activePackages(data, me.id)
  const stripe = React.useSyncExternalStore(
    subscribe,
    () => (mode === "demo" ? (demoStripe ??= demoPayoutsDone()) : remoteStripe),
    () => null
  )
  React.useEffect(() => {
    if (mode !== "demo" && stripe === null) loadRemote(Boolean(trainer?.payoutsReady))
  }, [mode, stripe, trainer?.payoutsReady])
  return { stripe: Boolean(stripe), packages, activated: Boolean(stripe) && packages > 0, ready: stripe !== null, refresh: refreshActivation }
}
