"use client"

import { Activity, Bike, Dumbbell, Flame, Footprints, Heart, Loader2, RefreshCw, Smartphone, Timer, Unplug, Waves } from "lucide-react"
import * as React from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { confirmDialog } from "@/components/ui/confirm"
import { daySummary, formatDistance, formatDuration, SOURCE_LABEL, sportLabel } from "@/lib/activity/summary"
import { useAppData } from "@/lib/data/store"
import { addDays, todayISO } from "@/lib/date"
import { connectHealth, disconnectHealth, HEALTH_LABEL, healthAvailable, healthConnected, healthSource, healthSyncDue, readDeviceActivity } from "@/lib/native/health"
import { getSupabase } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"
import type { ActivityLog, ID } from "@/types/domain"

const WEEKDAY = ["sö", "må", "ti", "on", "to", "fr", "lö"]

function SportIcon({ sport, className }: { sport: string; className?: string }) {
  const s = sport.toLowerCase()
  const Icon = /ride|cycl|bik/.test(s) ? Bike : /swim/.test(s) ? Waves : /walk|hike/.test(s) ? Footprints : /weight|strength|crossfit|workout/.test(s) ? Dumbbell : /run/.test(s) ? Activity : Heart
  return <Icon className={className} />
}

/**
 * Kalorimätaren (v32): förbränd aktiv energi och aktiv tid i dag, veckans
 * staplar och dagens pass – från Strava, Apple Hälsa och Health Connect, utan
 * dubbelräkning (se src/lib/activity/summary.ts). Klienten kopplar källorna
 * här; PT:n ser samma siffror (skrivskyddat, `readOnly`).
 */
export function ActivityCard({ clientId, readOnly, compact }: { clientId: ID; readOnly?: boolean; compact?: boolean }) {
  const { data } = useAppData()
  const today = todayISO()
  const summary = daySummary(data.activities, data.activityDays, clientId, today)
  const week = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6)).map((d) => daySummary(data.activities, data.activityDays, clientId, d))
  const max = Math.max(300, ...week.map((d) => d.activeKcal))

  return (
    <section className="space-y-4 rounded-2xl border border-border/70 bg-card p-5 shadow-card" aria-labelledby={`activity-${clientId}`} data-testid="activity-card">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id={`activity-${clientId}`} className="flex items-center gap-2 font-semibold">
            <Flame className="size-4 text-orange-500" /> Aktivitet i dag
          </h2>
          <p className="text-xs text-muted-foreground">
            {summary.sources.length ? `Från ${summary.sources.map((s) => SOURCE_LABEL[s]).join(", ")}` : "Koppla Strava eller telefonens hälsodata"}
          </p>
        </div>
        {!readOnly && <SyncButtons clientId={clientId} />}
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        <Stat icon={Flame} value={summary.activeKcal.toLocaleString("sv-SE")} unit="kcal" label="förbränt" testId="activity-kcal" />
        <Stat icon={Timer} value={String(summary.activeMinutes)} unit="min" label="aktiv tid" testId="activity-minutes" />
        <Stat icon={Footprints} value={summary.steps !== undefined ? summary.steps.toLocaleString("sv-SE") : "–"} unit="" label="steg" />
      </div>
      {summary.estimated && <p className="text-[11px] text-muted-foreground">Vissa kalorier är uppskattade (källan saknar mätning).</p>}

      {!compact && (
        <ol className="grid grid-cols-7 items-end gap-1.5" aria-label="Förbränning senaste 7 dagarna">
          {week.map((d) => (
            <li key={d.date} className="flex flex-col items-center gap-1">
              <span className="text-[10px] text-muted-foreground tabular">{d.activeKcal ? d.activeKcal : ""}</span>
              <span className="flex h-16 w-full items-end overflow-hidden rounded-md bg-muted">
                <span
                  className={cn("w-full rounded-md", d.date === today ? "bg-orange-500" : "bg-orange-500/45")}
                  style={{ height: `${Math.round((d.activeKcal / max) * 100)}%` }}
                  aria-label={`${d.activeKcal} kcal`}
                />
              </span>
              <span className={cn("text-[10px] uppercase", d.date === today ? "font-semibold" : "text-muted-foreground")}>{WEEKDAY[new Date(`${d.date}T12:00:00`).getDay()]}</span>
            </li>
          ))}
        </ol>
      )}

      {summary.activities.length > 0 && (
        <ul className="divide-y rounded-xl border" data-testid="activity-list">
          {summary.activities.map((a) => (
            <ActivityRow key={a.id} a={a} />
          ))}
        </ul>
      )}
    </section>
  )
}

function Stat({ icon: Icon, value, unit, label, testId }: { icon: React.ComponentType<{ className?: string }>; value: string; unit: string; label: string; testId?: string }) {
  return (
    <div className="rounded-xl bg-muted/50 px-2 py-2.5">
      <Icon className="mx-auto size-4 text-muted-foreground" />
      <p className="mt-0.5 text-xl leading-tight font-bold tabular" data-testid={testId}>
        {value}
        {unit && <span className="text-xs font-medium text-muted-foreground"> {unit}</span>}
      </p>
      <p className="text-[11px] text-muted-foreground">{label}</p>
    </div>
  )
}

function ActivityRow({ a }: { a: ActivityLog }) {
  const distance = formatDistance(a.distanceM)
  return (
    <li className="flex items-center gap-3 px-3 py-2">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-orange-500/10 text-orange-600 dark:text-orange-400">
        <SportIcon sport={a.sport} className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{a.name || sportLabel(a.sport)}</span>
        <span className="block truncate text-xs text-muted-foreground">
          {sportLabel(a.sport)} · {formatDuration(a.durationSec)}
          {distance ? ` · ${distance}` : ""} · {SOURCE_LABEL[a.source]}
        </span>
      </span>
      {a.kcal !== undefined && (
        <span className="shrink-0 text-sm font-semibold tabular">
          {a.kcalEstimated ? "≈" : ""}
          {a.kcal} <span className="text-xs font-normal text-muted-foreground">kcal</span>
        </span>
      )}
    </li>
  )
}

/** Koppla och synka källorna: Strava (alla) och telefonens hälsodata (bara i appen). */
function SyncButtons({ clientId }: { clientId: ID }) {
  const { data, mode, actions } = useAppData()
  const strava = data.wearables.find((w) => w.provider === "strava" && w.status !== "revoked")
  const [busy, setBusy] = React.useState<"strava" | "health" | null>(null)
  const [deviceHealth, setDeviceHealth] = React.useState<{ available: boolean; connected: boolean }>({ available: false, connected: false })
  const source = healthSource()

  // Resultat från Strava-flödet (?strava=…).
  React.useEffect(() => {
    const url = new URL(window.location.href)
    const status = url.searchParams.get("strava")
    if (!status) return
    const messages: Record<string, () => void> = {
      ansluten: () => toast.success("Strava är kopplat", { description: "Dina senaste aktiviteter är hämtade." }),
      nekad: () => toast("Kopplingen till Strava avbröts"),
      behorighet: () => toast.error("Coavira behöver få läsa dina aktiviteter", { description: "Koppla igen och låt rutan för aktiviteter vara ikryssad." }),
      "ej-aktiverad": () => toast("Strava är inte aktiverat än (STRAVA_CLIENT_ID saknas på servern)"),
      fel: () => toast.error("Kopplingen till Strava misslyckades. Försök igen."),
    }
    messages[status]?.()
    url.searchParams.delete("strava")
    window.history.replaceState(null, "", url)
  }, [])

  const syncHealth = React.useCallback(
    async (quiet = false) => {
      setBusy("health")
      try {
        const res = await readDeviceActivity(clientId)
        actions.syncDeviceActivity(res.days, res.activities)
        if (!quiet) toast.success(`${source ? HEALTH_LABEL[source] : "Hälsodata"} är synkad`)
      } catch (e) {
        if (!quiet) toast.error(e instanceof Error ? e.message : "Synken misslyckades")
      } finally {
        setBusy(null)
      }
    },
    [actions, clientId, source]
  )

  // I appen: kolla om HealthKit/Health Connect finns, och synka automatiskt (högst var 15:e min).
  const syncRef = React.useRef(syncHealth)
  React.useEffect(() => {
    syncRef.current = syncHealth
  })
  React.useEffect(() => {
    let cancelled = false
    void healthAvailable().then((available) => {
      if (cancelled) return
      setDeviceHealth({ available, connected: available && healthConnected() })
      if (available && healthSyncDue()) void syncRef.current(true)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const connectStrava = () => {
    if (mode === "demo") {
      const now = new Date().toISOString()
      actions.setWearables([...data.wearables.filter((w) => w.provider !== "strava"), { provider: "strava", status: "active", connectedAt: now, lastSyncedAt: now }])
      toast.success("Strava kopplat (demo)")
      return
    }
    // Hel sidladdning (även i appen): API-routen skickar vidare till Stravas inloggning och tillbaka hit.
    const back = window.location.pathname
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign(`/api/strava/connect?tillbaka=${encodeURIComponent(back)}`)
  }

  const syncStrava = async () => {
    setBusy("strava")
    try {
      if (mode === "supabase") {
        const res = await fetch("/api/strava/sync", { method: "POST" })
        const body = (await res.json().catch(() => ({}))) as { error?: string; activities?: number }
        if (!res.ok) throw new Error(body.error ?? "Synken misslyckades")
        const { reloadActivities, reloadSleepAndWearables } = await import("@/lib/data/supabase-source")
        const [list, fresh] = await Promise.all([reloadActivities(getSupabase()), reloadSleepAndWearables(getSupabase())])
        actions.setActivities("strava", list.filter((a) => a.source === "strava"))
        actions.setWearables(fresh.wearables)
        toast.success(`Strava är synkat (${body.activities ?? 0} aktiviteter)`)
      } else {
        toast.success("Strava är synkat (demo)")
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Synken misslyckades")
    } finally {
      setBusy(null)
    }
  }

  const disconnectStrava = async () => {
    if (!(await confirmDialog({ title: "Koppla från Strava?", description: "Åtkomsten återkallas hos Strava och passen därifrån tas bort i Coavira.", confirmLabel: "Koppla från" }))) return
    setBusy("strava")
    try {
      if (mode === "supabase") {
        const res = await fetch("/api/strava/disconnect", { method: "POST" })
        if (!res.ok) throw new Error("Kunde inte koppla från")
      }
      actions.setWearables(data.wearables.filter((w) => w.provider !== "strava"))
      actions.setActivities("strava", [])
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Kunde inte koppla från")
    } finally {
      setBusy(null)
    }
  }

  const connectDevice = async () => {
    setBusy("health")
    try {
      if (!(await connectHealth())) {
        toast.error("Coavira fick inte läsa hälsodata", { description: "Ändra under Inställningar → Hälsa (iPhone) eller Health Connect (Android)." })
        return
      }
      setDeviceHealth({ available: true, connected: true })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Kunde inte koppla")
      return
    } finally {
      setBusy(null)
    }
    await syncHealth()
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      {strava ? (
        <div className="flex items-center gap-1">
          <Button variant="outline" size="sm" className="h-8 gap-1 border-[#fc4c02]/40 text-[#fc4c02]" onClick={() => void syncStrava()} disabled={busy !== null} data-testid="strava-sync">
            {busy === "strava" ? <Loader2 className="animate-spin" /> : <RefreshCw />} Strava
          </Button>
          <Button variant="ghost" size="icon-sm" aria-label="Koppla från Strava" onClick={() => void disconnectStrava()} disabled={busy !== null}>
            <Unplug />
          </Button>
        </div>
      ) : (
        <Button size="sm" className="h-8 bg-[#fc4c02] text-white hover:bg-[#e34402]" onClick={connectStrava} data-testid="strava-connect">
          Koppla Strava
        </Button>
      )}
      {deviceHealth.available && source && (
        <Button variant="outline" size="sm" className="h-8 gap-1" onClick={() => void (deviceHealth.connected ? syncHealth() : connectDevice())} disabled={busy !== null} data-testid="health-sync">
          {busy === "health" ? <Loader2 className="animate-spin" /> : <Smartphone />}
          {deviceHealth.connected ? HEALTH_LABEL[source] : `Koppla ${HEALTH_LABEL[source]}`}
        </Button>
      )}
      {deviceHealth.connected && (
        <button type="button" className="text-[11px] text-muted-foreground underline-offset-2 hover:underline" onClick={() => (disconnectHealth(), setDeviceHealth((d) => ({ ...d, connected: false })))}>
          Sluta synka hälsodata
        </button>
      )}
    </div>
  )
}
