"use client"

import * as React from "react"
import { toast } from "sonner"

import { SlotPicker } from "@/components/calendar/slot-picker"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { formatDayShort, formatTimeRange } from "@/lib/calendar/time"
import { useAppData } from "@/lib/data/store"
import type { CalendarEvent, Slot } from "@/types/domain"
import { firstName } from "@/lib/names"

/**
 * Klient: föreslå en ny tid för ett preliminärt pass. Bara lediga tider hos PT:n
 * kan väljas; PT:n aviseras och får acceptera eller flytta igen.
 */
export function ProposeTimeDialog({
  event,
  onOpenChange,
}: {
  /** Passet att föreslå ny tid för; null = stängd. */
  event: CalendarEvent | null
  onOpenChange: (open: boolean) => void
}) {
  const { data, actions } = useAppData()
  const [slot, setSlot] = React.useState<Slot | null>(null)
  const trainer = event ? data.trainers.find((t) => t.id === event.trainerId) : undefined
  const first = firstName(trainer?.name, "PT:n")

  const close = (o: boolean) => {
    if (!o) setSlot(null)
    onOpenChange(o)
  }

  return (
    <Dialog open={Boolean(event)} onOpenChange={close}>
      <DialogContent className="max-h-[92svh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Föreslå en ny tid</DialogTitle>
          <DialogDescription>
            {event && (
              <>
                Nuvarande förslag: {formatDayShort(new Date(event.start))} {formatTimeRange(new Date(event.start), new Date(event.end))}.{" "}
              </>
            )}
            Välj en ledig tid så skickas förslaget till {first}.
          </DialogDescription>
        </DialogHeader>
        {event && <SlotPicker key={event.id} trainerId={event.trainerId} trainerFirstName={first} value={slot} onChange={setSlot} />}
        <DialogFooter>
          <Button
            disabled={!slot || !event}
            onClick={() => {
              if (!slot || !event) return
              const error = actions.moveEvent(event.id, new Date(slot.start), new Date(slot.end))
              if (error) {
                toast.error("Kunde inte föreslå tiden", { description: error })
                setSlot(null)
                return
              }
              toast.success(`Nytt förslag skickat till ${first}`, {
                description: `${formatDayShort(new Date(slot.start))} ${formatTimeRange(new Date(slot.start), new Date(slot.end))}`,
              })
              close(false)
            }}
          >
            Skicka förslag
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
