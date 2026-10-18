"use client"

import { ArrowRight, CalendarClock, ChevronLeft, ChevronRight, Move, Plus } from "lucide-react"
import * as React from "react"
import { toast } from "sonner"

import { AvailabilityDialog } from "@/components/calendar/availability-dialog"
import { CalendarSyncButton } from "@/components/calendar/calendar-sync-dialog"
import { EventDetailsDialog } from "@/components/calendar/event-details"
import { EventFormDialog } from "@/components/calendar/event-form-dialog"
import { buildItems, TONE_DOT, TONE_LABEL, type CalItem, type Tone } from "@/components/calendar/items"
import { RequestsPanel } from "@/components/calendar/requests-panel"
import type { DragPreview } from "@/components/calendar/use-event-drag"
import { MonthView, TimeGridView, type CalendarView } from "@/components/calendar/views"
import { PageHeader } from "@/components/common"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { findConflict } from "@/lib/calendar/slots"
import { addDays, formatDayLong, formatDayShort, formatMonth, formatTimeRange, isoWeek, startOfDay, startOfWeek } from "@/lib/calendar/time"
import { useAppData } from "@/lib/data/store"
import { cn } from "@/lib/utils"
import type { CalendarEvent } from "@/types/domain"
import { firstName } from "@/lib/names"

const LEGEND: Tone[] = ["pending", "confirmed", "planned", "block", "completed"]

/** PT:ns kalender: månad/vecka/dag, förfrågningar, egna pass, blockeringar och tillgänglighet. */
export function PtCalendar() {
  const { data, me, actions } = useAppData()
  // På mobil är dagvyn läsbarast. (Komponenten renderas först efter att datan laddats i webbläsaren.)
  const [view, setView] = React.useState<CalendarView>(() =>
    typeof window !== "undefined" && window.matchMedia("(max-width: 640px)").matches ? "day" : "week"
  )
  const [anchor, setAnchor] = React.useState(() => startOfDay(new Date()))
  const [showCancelled, setShowCancelled] = React.useState(false)
  const [selected, setSelected] = React.useState<CalItem | null>(null)
  const [form, setForm] = React.useState<{ start?: Date; event?: CalendarEvent } | null>(null)
  const [availabilityOpen, setAvailabilityOpen] = React.useState(false)
  /** Släppt flytt som väntar på att PT:n bekräftar (då aviseras klienten). */
  const [pendingMove, setPendingMove] = React.useState<DragPreview | null>(null)

  const clientName = React.useCallback((id: string) => data.clients.find((c) => c.id === id)?.name ?? "Klient", [data.clients])
  const items = React.useMemo(() => buildItems(data, me.id, { showCancelled, clientName }), [data, me.id, showCancelled, clientName])

  const step = (dir: -1 | 1) =>
    setAnchor((a) =>
      view === "month" ? new Date(a.getFullYear(), a.getMonth() + dir, 1) : addDays(a, dir * (view === "week" ? 7 : 1))
    )
  const heading =
    view === "month"
      ? formatMonth(anchor)
      : view === "week"
        ? `Vecka ${isoWeek(anchor)} · ${formatMonth(startOfWeek(anchor))}`
        : formatDayLong(anchor)

  const canMove = React.useCallback(
    (item: CalItem, start: Date, end: Date) => !findConflict(data.events, me.id, start, end, item.id),
    [data.events, me.id]
  )
  const onMove = (item: CalItem, start: Date) =>
    setPendingMove({ item, start, end: new Date(start.getTime() + (item.end.getTime() - item.start.getTime())), valid: true })
  const confirmMove = () => {
    if (!pendingMove?.item.event) return
    const { item, start, end } = pendingMove
    const error = actions.moveEvent(item.event!.id, start)
    setPendingMove(null)
    if (error) {
      toast.error("Kunde inte flytta passet", { description: error })
      return
    }
    toast.success(`Ny tid föreslagen till ${item.title}`, {
      description: `${formatDayShort(start)} ${formatTimeRange(start, end)} · ${firstName(item.title)} får en avisering och kan acceptera eller föreslå en annan tid.`,
    })
  }
  const dragProps = { onMove, canMove, pendingMove }

  const openDay = (day: Date) => {
    setAnchor(startOfDay(day))
    setView("day")
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Kalender"
        description="Bokningar, egna pass och blockerad tid. Bekräftade pass syns direkt i klientens kalender."
        actions={
          <>
            <CalendarSyncButton className="h-9" />
            <Button variant="outline" onClick={() => setAvailabilityOpen(true)}>
              <CalendarClock /> Tillgänglighet
            </Button>
            <Button onClick={() => setForm({})}>
              <Plus /> Ny händelse
            </Button>
          </>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1">
              <Button variant="outline" size="icon-sm" aria-label="Föregående" onClick={() => step(-1)}>
                <ChevronLeft />
              </Button>
              <Button variant="outline" size="sm" onClick={() => setAnchor(startOfDay(new Date()))}>
                Idag
              </Button>
              <Button variant="outline" size="icon-sm" aria-label="Nästa" onClick={() => step(1)}>
                <ChevronRight />
              </Button>
            </div>
            <h2 className="min-w-0 flex-1 truncate text-lg font-semibold" aria-live="polite">
              {heading}
            </h2>
            <Tabs value={view} onValueChange={(v) => setView(v as CalendarView)}>
              <TabsList>
                <TabsTrigger value="month">Månad</TabsTrigger>
                <TabsTrigger value="week">Vecka</TabsTrigger>
                <TabsTrigger value="day">Dag</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          {view === "month" ? (
            <MonthView
              anchor={anchor}
              items={items}
              onSelect={setSelected}
              onCreate={(start) => setForm({ start })}
              onOpenDay={openDay}
              {...dragProps}
            />
          ) : (
            <TimeGridView
              anchor={anchor}
              items={items}
              days={view === "week" ? 7 : 1}
              onSelect={setSelected}
              onCreate={(start) => setForm({ start })}
              {...dragProps}
            />
          )}

          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Move className="size-3.5 shrink-0" />
            Dra ett preliminärt (gult, streckat) pass för att föreslå en ny tid – klienten aviseras och kan acceptera eller föreslå en annan. Bekräftade pass är låsta.
          </p>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
            {LEGEND.map((t) => (
              <span key={t} className="flex items-center gap-1.5">
                <span aria-hidden className={cn("size-2.5 rounded-full", TONE_DOT[t])} /> {TONE_LABEL[t]}
              </span>
            ))}
            <label className="ml-auto flex items-center gap-1.5">
              <Checkbox checked={showCancelled} onCheckedChange={(v) => setShowCancelled(v === true)} /> Visa avbokade
            </label>
          </div>
        </div>

        <aside className="space-y-6">
          <RequestsPanel onShow={(e) => setSelected(items.find((i) => i.id === e.id) ?? null)} />
          <Upcoming items={items} onSelect={setSelected} />
        </aside>
      </div>

      <EventDetailsDialog
        item={selected}
        onOpenChange={(o) => !o && setSelected(null)}
        onEdit={(event) => {
          setSelected(null)
          setForm({ event })
        }}
      />
      <EventFormDialog open={form !== null} onOpenChange={(o) => !o && setForm(null)} initialStart={form?.start} event={form?.event} />
      <AvailabilityDialog open={availabilityOpen} onOpenChange={setAvailabilityOpen} />

      <Dialog open={pendingMove !== null} onOpenChange={(o) => !o && setPendingMove(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Föreslå ny tid?</DialogTitle>
            <DialogDescription>
              {pendingMove?.item.title} får en ombokningsavisering och kan acceptera tiden eller föreslå en annan.
            </DialogDescription>
          </DialogHeader>
          {pendingMove && (
            <p className="flex flex-wrap items-center gap-2 rounded-lg bg-muted px-3 py-2 text-sm tabular">
              <span className="text-muted-foreground line-through">
                {formatDayShort(pendingMove.item.start)} {formatTimeRange(pendingMove.item.start, pendingMove.item.end)}
              </span>
              <ArrowRight className="size-4 text-muted-foreground" />
              <span className="font-semibold">
                {formatDayShort(pendingMove.start)} {formatTimeRange(pendingMove.start, pendingMove.end)}
              </span>
            </p>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPendingMove(null)}>
              Avbryt
            </Button>
            <Button onClick={confirmMove}>Skicka förslag</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/** Dagens och morgondagens bekräftade pass. */
function Upcoming({ items, onSelect }: { items: CalItem[]; onSelect: (i: CalItem) => void }) {
  const now = new Date()
  const until = addDays(startOfDay(now), 2)
  const list = items.filter((i) => !i.allDay && i.tone === "confirmed" && i.end > now && i.start < until)
  return (
    <section className="space-y-2">
      <h2 className="font-semibold">Idag och imorgon</h2>
      {list.length === 0 && <p className="text-sm text-muted-foreground">Inga bekräftade pass.</p>}
      <ul className="space-y-1.5">
        {list.map((i) => (
          <li key={i.id}>
            <button type="button" onClick={() => onSelect(i)} className="flex w-full items-center gap-3 rounded-lg border-l-4 border-l-primary bg-card px-3 py-2 text-left text-sm hover:bg-muted/60">
              <span className="w-20 shrink-0 text-xs text-muted-foreground tabular">
                {i.start.toDateString() === now.toDateString() ? "Idag" : "Imorgon"} {i.start.toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" })}
              </span>
              <span className="min-w-0 flex-1 truncate font-medium">{i.title}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
