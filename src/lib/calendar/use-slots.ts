"use client"

/**
 * Lediga tider för bokning. Demoläge: räknas lokalt ur all data. Supabase:
 * hämtas från databasfunktionen (klienten ser aldrig andra klienters bokningar),
 * och hämtas om när kalendern ändras (t.ex. efter en egen bokning).
 */
import * as React from "react"

import { computeSlots } from "@/lib/calendar/slots"
import { addDays, startOfDay } from "@/lib/calendar/time"
import { useAppData } from "@/lib/data/store"
import { getSupabase } from "@/lib/supabase/client"
import type { Slot } from "@/types/domain"

type State = { status: "loading" | "done" | "error"; slots: Slot[] }

export function useTrainerSlots(trainerId: string | null, days = 28): State & { reload: () => void } {
  const { data, mode } = useAppData()
  const [remote, setRemote] = React.useState<State & { key?: string }>({ status: "loading", slots: [] })
  const [nonce, setNonce] = React.useState(0)
  // Ändringar i den egna kalendern (ny bokning, avbokning) ska ge nya lediga tider.
  const calendarKey = data.events.map((e) => `${e.id}:${e.status}:${e.start}`).join("|")

  const local = React.useMemo<State | null>(() => {
    if (mode !== "demo" || !trainerId) return null
    const trainer = data.trainers.find((t) => t.id === trainerId)
    const from = new Date()
    return {
      status: "done",
      slots: computeSlots({
        trainerId,
        rules: data.availabilityRules,
        events: data.events,
        from,
        to: addDays(startOfDay(from), days),
        minNoticeMinutes: trainer?.minNoticeMinutes ?? 120,
      }),
    }
  }, [mode, trainerId, data.availabilityRules, data.events, data.trainers, days])

  const key = `${trainerId}|${days}|${calendarKey}|${nonce}`
  React.useEffect(() => {
    if (mode !== "supabase" || !trainerId) return
    let cancelled = false
    void import("@/lib/data/supabase-source").then(({ fetchSlots }) =>
      fetchSlots(getSupabase(), trainerId, new Date(), addDays(startOfDay(new Date()), days))
        .then((slots) => !cancelled && setRemote({ status: "done", slots, key }))
        .catch(() => !cancelled && setRemote({ status: "error", slots: [], key }))
    )
    return () => {
      cancelled = true
    }
  }, [mode, trainerId, days, key])

  const reload = React.useCallback(() => setNonce((n) => n + 1), [])
  if (local) return { ...local, reload }
  if (!trainerId) return { status: "done", slots: [], reload }
  return { ...(remote.key === key ? remote : { status: "loading" as const, slots: [] }), reload }
}

/** Första lediga tid per PT (PT-sökningen). */
export function useNextSlots(trainerIds: string[]): Record<string, string | undefined> {
  const { data, mode } = useAppData()
  const ids = trainerIds.join(",")
  const [remote, setRemote] = React.useState<{ ids: string; map: Record<string, string> }>({ ids: "", map: {} })

  const local = React.useMemo(() => {
    if (mode !== "demo") return null
    const from = new Date()
    const to = addDays(startOfDay(from), 21)
    return Object.fromEntries(
      (ids ? ids.split(",") : []).map((id) => {
        const t = data.trainers.find((x) => x.id === id)
        const first = computeSlots({ trainerId: id, rules: data.availabilityRules, events: data.events, from, to, minNoticeMinutes: t?.minNoticeMinutes ?? 120 })[0]
        return [id, first?.start]
      })
    )
  }, [mode, ids, data.availabilityRules, data.events, data.trainers])

  React.useEffect(() => {
    if (mode !== "supabase" || !ids) return
    let cancelled = false
    void import("@/lib/data/supabase-source").then(({ fetchNextSlots }) =>
      fetchNextSlots(getSupabase(), ids.split(","))
        .then((map) => !cancelled && setRemote({ ids, map }))
        .catch(() => {})
    )
    return () => {
      cancelled = true
    }
  }, [mode, ids])

  return local ?? (remote.ids === ids ? remote.map : {})
}
