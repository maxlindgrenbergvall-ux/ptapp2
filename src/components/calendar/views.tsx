"use client"

import * as React from "react"

import { itemsOnDay, layoutColumns, TONE_CLASS, TONE_LABEL, type CalItem } from "@/components/calendar/items"
import {
  addDays,
  formatTime,
  formatTimeRange,
  isoWeek,
  minutesOfDay,
  sameDay,
  startOfDay,
  startOfMonth,
  startOfWeek,
  WEEKDAY_SHORT,
} from "@/lib/calendar/time"
import { cn } from "@/lib/utils"

export type CalendarView = "month" | "week" | "day"

interface ViewProps {
  anchor: Date
  items: CalItem[]
  onSelect: (item: CalItem) => void
  /** Klick på tom tid: skapa ny händelse här. */
  onCreate: (start: Date) => void
  onOpenDay?: (day: Date) => void
}

// ================================================================== månad ===

export function MonthView({ anchor, items, onSelect, onOpenDay }: ViewProps) {
  const first = startOfWeek(startOfMonth(anchor))
  const days = Array.from({ length: 42 }, (_, i) => addDays(first, i))
  const today = new Date()
  return (
    <div className="overflow-hidden rounded-xl border">
      <div className="grid grid-cols-7 border-b bg-muted/40 text-center text-xs font-medium text-muted-foreground">
        {WEEKDAY_SHORT.map((d) => (
          <div key={d} className="py-2">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((day) => {
          const inMonth = day.getMonth() === anchor.getMonth()
          const list = itemsOnDay(items, day)
          const shown = list.slice(0, 3)
          return (
            <div
              key={day.toISOString()}
              className={cn("min-h-24 border-r border-b p-1 last:border-r-0 sm:min-h-28 [&:nth-child(7n)]:border-r-0", !inMonth && "bg-muted/30")}
            >
              <button
                type="button"
                onClick={() => onOpenDay?.(day)}
                className={cn(
                  "mb-1 flex size-6 items-center justify-center rounded-full text-xs tabular hover:bg-muted",
                  sameDay(day, today) && "bg-primary font-semibold text-primary-foreground hover:bg-primary/90",
                  !inMonth && "text-muted-foreground"
                )}
                aria-label={`Visa ${day.toLocaleDateString("sv-SE", { weekday: "long", day: "numeric", month: "long" })}`}
              >
                {day.getDate()}
              </button>
              <div className="space-y-0.5">
                {shown.map((i) => (
                  <button
                    key={i.id}
                    type="button"
                    onClick={() => onSelect(i)}
                    className={cn("block w-full truncate rounded border-l-2 px-1 py-0.5 text-left text-[11px] leading-tight", TONE_CLASS[i.tone])}
                    title={`${TONE_LABEL[i.tone]}: ${i.title}`}
                  >
                    {!i.allDay && <span className="mr-1 tabular">{formatTime(i.start)}</span>}
                    {i.title}
                  </button>
                ))}
                {list.length > shown.length && (
                  <button type="button" onClick={() => onOpenDay?.(day)} className="px-1 text-[11px] text-muted-foreground hover:underline">
                    +{list.length - shown.length} till
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ====================================================== vecka / dag (tid) ===

const SLOT_MIN = 30

export function TimeGridView({ anchor, items, onSelect, onCreate, days: dayCount }: ViewProps & { days: 1 | 7 }) {
  const start = dayCount === 7 ? startOfWeek(anchor) : startOfDay(anchor)
  const days = Array.from({ length: dayCount }, (_, i) => addDays(start, i))
  const hourHeight = dayCount === 1 ? 64 : 52
  const today = new Date()

  // Timintervall: 06–21 som standard, utökat om det finns händelser utanför.
  const timed = items.filter((i) => !i.allDay && days.some((d) => itemsOnDay([i], d).length))
  const firstHour = Math.min(6, ...timed.map((i) => (sameDay(i.start, i.end) || i.start >= start ? i.start.getHours() : 0)))
  const lastHour = Math.max(21, ...timed.map((i) => Math.min(24, i.end.getHours() + (i.end.getMinutes() ? 1 : 0) || 24)))
  const hours = Array.from({ length: lastHour - firstHour }, (_, i) => firstHour + i)

  const scrollRef = React.useRef<HTMLDivElement>(null)
  React.useEffect(() => {
    // Börja runt kl. 07 i stället för högst upp.
    if (scrollRef.current) scrollRef.current.scrollTop = Math.max(0, (7 - firstHour) * hourHeight - 8)
  }, [firstHour, hourHeight])

  const [now, setNow] = React.useState(() => new Date())
  React.useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 60_000)
    return () => window.clearInterval(t)
  }, [])

  return (
    <div className="overflow-hidden rounded-xl border">
      {/* Dagrubriker */}
      <div className="grid border-b bg-muted/40" style={{ gridTemplateColumns: `3.5rem repeat(${dayCount}, minmax(0, 1fr))` }}>
        <div className="py-2 text-center text-[10px] text-muted-foreground">v. {isoWeek(start)}</div>
        {days.map((d) => (
          <div key={d.toISOString()} className={cn("border-l py-2 text-center", sameDay(d, today) && "text-primary")}>
            <div className="text-[11px] text-muted-foreground">{WEEKDAY_SHORT[(d.getDay() + 6) % 7]}</div>
            <div className={cn("text-lg leading-tight font-semibold tabular", sameDay(d, today) && "text-primary")}>{d.getDate()}</div>
          </div>
        ))}
      </div>

      {/* Heldagsrad: planerade pass och långa blockeringar */}
      <div className="grid border-b" style={{ gridTemplateColumns: `3.5rem repeat(${dayCount}, minmax(0, 1fr))` }}>
        <div className="py-1.5 text-center text-[10px] text-muted-foreground">Heldag</div>
        {days.map((d) => (
          <div key={d.toISOString()} className="min-h-8 space-y-0.5 border-l p-0.5">
            {itemsOnDay(items, d)
              .filter((i) => i.allDay)
              .map((i) => (
                <button
                  key={i.id}
                  type="button"
                  onClick={() => onSelect(i)}
                  className={cn("block w-full truncate rounded border-l-2 px-1.5 py-0.5 text-left text-[11px]", TONE_CLASS[i.tone])}
                  title={`${TONE_LABEL[i.tone]}: ${i.title}${i.subtitle ? ` – ${i.subtitle}` : ""}`}
                >
                  <span className="font-medium">{i.title}</span>
                  {i.subtitle && dayCount === 1 && <span className="text-muted-foreground"> · {i.subtitle}</span>}
                </button>
              ))}
          </div>
        ))}
      </div>

      {/* Tidsrutnät */}
      <div ref={scrollRef} className="max-h-[68vh] overflow-y-auto">
        <div className="relative grid" style={{ gridTemplateColumns: `3.5rem repeat(${dayCount}, minmax(0, 1fr))` }}>
          <div>
            {hours.map((h) => (
              <div key={h} className="relative text-right text-[10px] text-muted-foreground tabular" style={{ height: hourHeight }}>
                <span className="absolute -top-1.5 right-1.5">{String(h).padStart(2, "0")}:00</span>
              </div>
            ))}
          </div>
          {days.map((day) => {
            const dayItems = itemsOnDay(items, day).filter((i) => !i.allDay)
            const layout = layoutColumns(dayItems)
            const dayStart = startOfDay(day)
            return (
              <div key={day.toISOString()} className="relative border-l">
                {/* Klickbara halvtimmar */}
                {hours.flatMap((h) =>
                  [0, 30].map((m) => {
                    const at = new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, m)
                    return (
                      <button
                        key={`${h}:${m}`}
                        type="button"
                        aria-label={`Ny händelse ${at.toLocaleString("sv-SE", { weekday: "short", hour: "2-digit", minute: "2-digit" })}`}
                        onClick={() => onCreate(at)}
                        className={cn("block w-full hover:bg-primary/5 focus-visible:bg-primary/10 focus-visible:outline-none", m === 0 ? "border-t border-border/60" : "border-t border-dashed border-border/30")}
                        style={{ height: (hourHeight * SLOT_MIN) / 60 }}
                      />
                    )
                  })
                )}
                {/* Händelser */}
                {dayItems.map((i) => {
                  const s = i.start < dayStart ? 0 : minutesOfDay(i.start)
                  const e = i.end > addDays(dayStart, 1) ? 24 * 60 : minutesOfDay(i.end) || 24 * 60
                  const top = ((s - firstHour * 60) / 60) * hourHeight
                  const height = Math.max(18, ((e - s) / 60) * hourHeight - 2)
                  const { col, cols } = layout.get(i.id) ?? { col: 0, cols: 1 }
                  return (
                    <button
                      key={i.id}
                      type="button"
                      onClick={() => onSelect(i)}
                      className={cn(
                        "absolute overflow-hidden rounded-md border-l-[3px] px-1.5 py-0.5 text-left text-[11px] leading-tight shadow-sm transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                        TONE_CLASS[i.tone]
                      )}
                      style={{ top, height, left: `calc(${(col / cols) * 100}% + 2px)`, width: `calc(${100 / cols}% - 4px)` }}
                      aria-label={`${TONE_LABEL[i.tone]}: ${i.title}, ${formatTimeRange(i.start, i.end)}`}
                    >
                      <div className="truncate font-semibold">{i.title}</div>
                      {height > 30 && <div className="truncate tabular opacity-80">{formatTimeRange(i.start, i.end)}</div>}
                      {height > 46 && i.subtitle && <div className="truncate opacity-80">{i.subtitle}</div>}
                    </button>
                  )
                })}
                {/* Nu-linje */}
                {sameDay(day, now) && minutesOfDay(now) >= firstHour * 60 && (
                  <div
                    aria-hidden
                    className="pointer-events-none absolute inset-x-0 z-10 border-t-2 border-destructive"
                    style={{ top: ((minutesOfDay(now) - firstHour * 60) / 60) * hourHeight }}
                  >
                    <span className="absolute -top-1.5 -left-1 size-2.5 rounded-full bg-destructive" />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

