"use client"

import { CalendarDays, Check, ChevronRight, Dumbbell } from "lucide-react"
import Link from "next/link"

import { AdherenceChart } from "@/components/charts/progress-charts"
import { EmptyState, PersonAvatar } from "@/components/common"
import { FillBar } from "@/components/motion"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { adherence, adherenceByWeek, workoutsFor } from "@/lib/data/selectors"
import { useAppData } from "@/lib/data/store"
import { addDays, formatDay, formatShort, formatTime, todayISO } from "@/lib/date"
import { cn } from "@/lib/utils"
import type { Client, ISODate } from "@/types/domain"

/** Klickbart KPI-kort: samma utseende som StatTile, men en knapp med tydligt fokus och tryck. */
export function TileButton({ children, onClick, testId, label }: { children: React.ReactNode; onClick: () => void; testId: string; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      data-testid={testId}
      className="group relative rounded-2xl text-left outline-none transition-transform duration-200 hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-ring/50 active:scale-[0.98] motion-reduce:hover:translate-y-0 [&>div]:h-full [&>div]:transition-colors [&>div]:duration-200 hover:[&>div]:border-primary/50"
    >
      {children}
      <ChevronRight className="absolute right-3 bottom-3 size-4 text-muted-foreground transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-primary" aria-hidden />
    </button>
  )
}

interface UpcomingRow {
  key: string
  clientId: string
  date: ISODate
  /** Klockslag för bokade pass (ISO), annars undefined (pass på egen hand). */
  at?: string
  title: string
  detail: string
  pending: boolean
}

/** Pass och bokningar för PT:ns klienter de kommande `days` dagarna (idag räknas med). */
export function useUpcoming(clients: Client[], days = 7) {
  const { data, me } = useAppData()
  const today = todayISO()
  const until = addDays(today, days - 1)
  const ids = new Set(clients.map((c) => c.id))
  const nowIso = new Date().toISOString()
  const events = data.events.filter(
    (e) => e.trainerId === me.id && e.clientId && ids.has(e.clientId) && (e.status === "confirmed" || e.status === "pending") && e.end >= nowIso && e.start.slice(0, 10) <= until
  )
  const booked = new Set(events.map((e) => e.workoutId).filter(Boolean))
  const rows: UpcomingRow[] = [
    ...events.map((e): UpcomingRow => {
      const w = e.workoutId ? data.workouts.find((x) => x.id === e.workoutId) : undefined
      const d = new Date(e.start)
      const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
      return {
        key: `e-${e.id}`,
        clientId: e.clientId!,
        date,
        at: e.start,
        title: w?.name ?? e.title,
        detail: `Bokat pass ${formatTime(e.start)}${e.status === "pending" ? " · väntar på bekräftelse" : ""}`,
        pending: e.status === "pending",
      }
    }),
    ...data.workouts
      .filter((w) => ids.has(w.clientId) && !booked.has(w.id) && (w.status === "planned" || w.status === "in_progress") && w.date >= today && w.date <= until)
      .map((w): UpcomingRow => ({
        key: `w-${w.id}`,
        clientId: w.clientId,
        date: w.date,
        title: w.name,
        detail: `${w.exercises.length} övningar · ${w.byClient ? "eget pass" : "på egen hand"}`,
        pending: false,
      })),
  ].sort((a, b) => (a.date + (a.at ?? "T99")).localeCompare(b.date + (b.at ?? "T99")))
  return { rows, today }
}

/** "Loggade pass": vad som är inbokat de kommande sju dagarna + vad som loggats de senaste sju. */
export function UpcomingDialog({ open, onOpenChange, clients }: { open: boolean; onOpenChange: (o: boolean) => void; clients: Client[] }) {
  const { data } = useAppData()
  const { rows, today } = useUpcoming(clients)
  const name = (id: string) => clients.find((c) => c.id === id)
  const weekAgo = addDays(today, -7)
  const logged = data.workouts
    .filter((w) => clients.some((c) => c.id === w.clientId) && w.status === "completed" && w.date >= weekAgo)
    .sort((a, b) => b.date.localeCompare(a.date))
  const byDay = new Map<ISODate, UpcomingRow[]>()
  for (const r of rows) byDay.set(r.date, [...(byDay.get(r.date) ?? []), r])
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="grid max-h-[88dvh] grid-cols-[minmax(0,1fr)] grid-rows-[auto_minmax(0,1fr)] sm:max-w-lg" data-testid="kpi-upcoming">
        <DialogHeader className="text-left">
          <DialogTitle>Pass den här veckan</DialogTitle>
          <DialogDescription>
            {rows.length} inbokade de kommande 7 dagarna · {logged.length} loggade de senaste 7.
          </DialogDescription>
        </DialogHeader>
        <div className="-mx-1 space-y-5 overflow-y-auto px-1">
          <section className="space-y-3" aria-label="Kommande 7 dagar">
            <h3 className="flex items-center gap-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
              <CalendarDays className="size-3.5" aria-hidden /> Kommande 7 dagar
            </h3>
            {rows.length === 0 && <EmptyState compact icon={CalendarDays} title="Inget inbokat" text="Inga pass eller bokningar för dina klienter de kommande sju dagarna." />}
            {[...byDay.entries()].map(([date, list], gi) => (
              <div key={date} className="rise-in space-y-1.5" style={{ animationDelay: `${Math.min(gi, 6) * 50}ms` }}>
                <p className="text-sm font-semibold">
                  {date === today ? "Idag" : date === addDays(today, 1) ? "Imorgon" : formatDay(date)}
                  <span className="ml-1.5 font-normal text-muted-foreground tabular">{list.length} pass</span>
                </p>
                <ul className="space-y-1.5">
                  {list.map((r) => {
                    const c = name(r.clientId)
                    return (
                      <li key={r.key}>
                        <Link
                          href={`/pt/klienter/${r.clientId}`}
                          className="flex items-center gap-3 rounded-xl border bg-card p-2.5 transition-colors hover:border-primary/50 hover:bg-primary/5"
                          data-testid="upcoming-row"
                        >
                          <PersonAvatar name={c?.name ?? "Klient"} src={c?.avatarUrl} className="size-8" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium">{c?.name ?? "Klient"}</span>
                            <span className="block truncate text-xs text-muted-foreground">
                              {r.title} · {r.detail}
                            </span>
                          </span>
                          <span className={cn("size-2 shrink-0 rounded-full", r.pending ? "bg-warning" : "bg-primary")} aria-hidden />
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              </div>
            ))}
          </section>

          <section className="space-y-2" aria-label="Loggade senaste 7 dagarna">
            <h3 className="flex items-center gap-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
              <Check className="size-3.5" aria-hidden /> Loggade senaste 7 dagarna
            </h3>
            {logged.length === 0 ? (
              <p className="text-sm text-muted-foreground">Inga loggade pass den senaste veckan.</p>
            ) : (
              <ul className="space-y-1.5">
                {logged.slice(0, 20).map((w) => {
                  const c = name(w.clientId)
                  return (
                    <li key={w.id}>
                      <Link href={`/pt/klienter/${w.clientId}/pass/${w.id}`} className="flex items-center gap-3 rounded-xl border p-2.5 transition-colors hover:bg-muted/50" data-testid="logged-row">
                        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                          <Check className="size-3.5" strokeWidth={3} aria-hidden />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{w.name}</span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {c?.name ?? "Klient"} · {formatShort(w.date)} · {w.logs.filter((l) => l.done).length} set
                          </span>
                        </span>
                        <Dumbbell className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                      </Link>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/** "Snittföljsamhet": graf över tid (alla aktiva klienter) och läget per klient. */
export function AdherenceDialog({ open, onOpenChange, clients }: { open: boolean; onOpenChange: (o: boolean) => void; clients: Client[] }) {
  const { data } = useAppData()
  const today = todayISO()
  const ids = new Set(clients.map((c) => c.id))
  const weeks = adherenceByWeek(data.workouts.filter((w) => ids.has(w.clientId)), 12, today)
  const perClient = clients
    .map((c) => ({ client: c, pct: adherence(workoutsFor(data, c.id), 28, today) }))
    .filter((r): r is { client: Client; pct: number } => r.pct !== null)
    .sort((a, b) => a.pct - b.pct)
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="grid max-h-[88dvh] grid-cols-[minmax(0,1fr)] grid-rows-[auto_minmax(0,1fr)] sm:max-w-xl" data-testid="kpi-adherence">
        <DialogHeader className="text-left">
          <DialogTitle>Följsamhet över tid</DialogTitle>
          <DialogDescription>Andel genomförda av schemalagda pass per vecka, alla aktiva klienter. Senaste 12 veckorna.</DialogDescription>
        </DialogHeader>
        <div className="-mx-1 space-y-5 overflow-y-auto px-1">
          <AdherenceChart weeks={weeks} />
          {perClient.length > 0 && (
            <section className="space-y-2" aria-label="Per klient, senaste 4 veckorna">
              <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Per klient · senaste 4 veckorna</h3>
              <ul className="space-y-1.5">
                {perClient.map(({ client, pct }) => (
                  <li key={client.id}>
                    <Link href={`/pt/klienter/${client.id}`} className="flex items-center gap-3 rounded-xl border p-2.5 transition-colors hover:border-primary/50 hover:bg-primary/5" data-testid="adherence-row">
                      <PersonAvatar name={client.name} src={client.avatarUrl} className="size-8" />
                      <span className="min-w-0 flex-1 space-y-1.5">
                        <span className="flex items-baseline justify-between gap-2 text-sm">
                          <span className="truncate font-medium">{client.name}</span>
                          <span className="shrink-0 tabular text-muted-foreground">{pct} %</span>
                        </span>
                        <FillBar value={pct} className="h-1.5" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={`Följsamhet ${pct} procent`} />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
