"use client"

import * as React from "react"
import { sv } from "react-day-picker/locale"

import { Calendar } from "@/components/ui/calendar"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { daysWithSlots } from "@/lib/calendar/slots"
import { formatTimeRange, localISODate } from "@/lib/calendar/time"
import { useTrainerSlots } from "@/lib/calendar/use-slots"
import { cn } from "@/lib/utils"
import type { Slot } from "@/types/domain"

/**
 * Välj en ledig tid hos en PT: kalender där bara dagar med lediga tider går att
 * välja, och tidsknappar för vald dag. Används vid bokning och när klienten
 * föreslår en ny tid för ett preliminärt pass.
 */
export function SlotPicker({
  trainerId,
  trainerFirstName,
  value,
  onChange,
  days = 28,
}: {
  /** null = hämta inte (t.ex. när dialogen är stängd). */
  trainerId: string | null
  trainerFirstName: string
  value: Slot | null
  onChange: (slot: Slot | null) => void
  days?: number
}) {
  const { status, slots } = useTrainerSlots(trainerId, days)
  const [day, setDay] = React.useState<Date | undefined>(() => (value ? new Date(value.start) : undefined))
  const available = daysWithSlots(slots)
  const daySlots = day ? slots.filter((s) => localISODate(new Date(s.start)) === localISODate(day)) : []

  if (status === "loading") {
    return (
      <div className="space-y-4" aria-busy="true">
        <span className="sr-only">Hämtar lediga tider…</span>
        <div className="space-y-3 rounded-xl border p-3">
          <div className="flex items-center justify-between">
            <Skeleton className="size-7 rounded-full" />
            <Skeleton className="h-4 w-28" />
            <Skeleton className="size-7 rounded-full" />
          </div>
          <div className="grid grid-cols-7 gap-1.5">
            {Array.from({ length: 35 }, (_, i) => (
              <Skeleton key={i} className="aspect-square rounded-full" />
            ))}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-9 w-20 rounded-full" />
          ))}
        </div>
      </div>
    )
  }
  if (status === "error") {
    return <p className="rounded-lg bg-muted p-4 text-sm">Kunde inte hämta lediga tider. Kontrollera uppkopplingen och försök igen.</p>
  }
  if (slots.length === 0) {
    return (
      <p className="rounded-lg bg-muted p-4 text-sm">
        {trainerFirstName} har inga lediga tider de kommande {days === 28 ? "fyra veckorna" : `${days} dagarna`}. Skicka gärna ett meddelande.
      </p>
    )
  }
  return (
    <div className="space-y-4">
      <div className="flex justify-center rounded-md border">
        <Calendar
          mode="single"
          locale={sv}
          selected={day}
          onSelect={(d) => {
            setDay(d)
            onChange(null)
          }}
          disabled={(d) => !available.includes(localISODate(d))}
          modifiers={{ available: available.map((d) => new Date(`${d}T12:00:00`)) }}
          modifiersClassNames={{ available: "font-semibold underline decoration-primary decoration-2 underline-offset-4" }}
        />
      </div>
      {day && (
        <div className="space-y-2">
          <Label>Tid</Label>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Välj tid">
            {daySlots.map((s) => (
              <button
                key={s.start}
                type="button"
                role="radio"
                aria-checked={value?.start === s.start}
                onClick={() => onChange(s)}
                className={cn(
                  "rounded-lg border px-3 py-2 text-sm font-medium tabular transition-colors",
                  value?.start === s.start ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted"
                )}
              >
                {formatTimeRange(new Date(s.start), new Date(s.end))}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
