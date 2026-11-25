"use client"

/**
 * Vilka inloggningssätt (Apple, Google) som är påslagna i Supabase. Läses från
 * Supabase Auths publika inställningar (/auth/v1/settings → external) en gång per
 * sidladdning. En knapp för ett avstängt sätt visas inte – annars hamnar
 * användaren på Supabases felsida "Unsupported provider: provider is not
 * enabled" (i appen i den inbyggda webbläsaren).
 *
 * Går inställningarna inte att läsa (t.ex. ingen uppkoppling) visas båda, som förut.
 */
import * as React from "react"

import { isSupabaseEnabled, SUPABASE_KEY, SUPABASE_URL } from "@/lib/supabase/config"

export interface ProviderState {
  apple: boolean
  google: boolean
  /** Inställningarna är lästa (annars antas båda vara påslagna). */
  known: boolean
}

const ALL: ProviderState = { apple: true, google: true, known: false }
let cached: ProviderState | null = null
let pending: Promise<ProviderState> | null = null
const listeners = new Set<() => void>()

export function loadProviders(): Promise<ProviderState> {
  if (cached) return Promise.resolve(cached)
  if (!isSupabaseEnabled) return Promise.resolve((cached = { apple: true, google: true, known: true }))
  pending ??= fetch(`${SUPABASE_URL}/auth/v1/settings`, { headers: { apikey: SUPABASE_KEY } })
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
    .then((s: { external?: Record<string, boolean> }) => ({ apple: Boolean(s.external?.apple), google: Boolean(s.external?.google), known: true }))
    .catch(() => ALL)
    .then((state) => {
      // Ett nätverksfel sparas inte – nästa sidladdning försöker igen.
      if (state.known) cached = state
      pending = null
      listeners.forEach((l) => l())
      return state
    })
  return pending
}

/** Påslagna inloggningssätt (uppdateras när inställningarna är lästa). */
export function useProviders(): ProviderState {
  const state = React.useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => cached ?? ALL,
    () => ALL
  )
  React.useEffect(() => {
    if (!cached) void loadProviders()
  }, [])
  return state
}
