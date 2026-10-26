"use client"

import { CalendarClock, Plus, Trash2 } from "lucide-react"
import * as React from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { addDays, localISODate, WEEKDAY_LONG } from "@/lib/calendar/time"
import { useTrainerSlots } from "@/lib/calendar/use-slots"
import { useAppData } from "@/lib/data/store"
import { formatShort } from "@/lib/date"
import type { AvailabilityRule } from "@/types/domain"

const SLOT_OPTIONS = [30, 45, 60, 75, 90, 120]
const NOTICE_OPTIONS = [
  { value: 0, label: "Ingen" },
  { value: 60, label: "1 timme" },
  { value: 120, label: "2 timmar" },
  { value: 720, label: "12 timmar" },
  { value: 1440, label: "1 dygn" },
  { value: 2880, label: "2 dygn" },
]

/**
 * PT:ns tillgänglighet: veckoschema (t.ex. mån–fre 07–10) och specialtider för
 * enskilda datum. Klienter kan bara boka tider som ryms här och inte krockar med
 * kalendern. Ändringar sparas direkt.
 */
export function AvailabilityDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { data, me, actions } = useAppData()
  const trainer = data.trainers.find((t) => t.id === me.id)
  const rules = data.availabilityRules.filter((r) => r.trainerId === me.id)
  const weekly = rules.filter((r) => r.weekday)
  const dated = rules.filter((r) => r.date).sort((a, b) => a.date!.localeCompare(b.date!) || a.start.localeCompare(b.start))
  const preview = useTrainerSlots(open ? me.id : null, 14)
  const [newDate, setNewDate] = React.useState(localISODate(addDays(new Date(), 7)))

  const add = (rule: Omit<AvailabilityRule, "id" | "trainerId">) => actions.saveAvailabilityRule({ ...rule, id: actions.newId() })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarClock className="size-5 text-primary" /> Tillgänglighet
          </DialogTitle>
          <DialogDescription>
            Klienter kan skicka bokningsförfrågningar på de här tiderna. Bokade pass, egna pass och blockeringar räknas bort automatiskt.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-primary/10 px-4 py-3 text-sm">
          <span>
            <span className="font-semibold tabular">{preview.status === "done" ? preview.slots.length : "…"}</span> lediga tider de kommande två veckorna
          </span>
          <label className="flex items-center gap-2">
            <span className="text-muted-foreground">Minsta framförhållning</span>
            <Select
              value={String(trainer?.minNoticeMinutes ?? 120)}
              onValueChange={(v) => actions.updateTrainerProfile({ minNoticeMinutes: Number(v) })}
            >
              <SelectTrigger size="sm" aria-label="Minsta framförhållning">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {NOTICE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={String(o.value)}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
        </div>

        <section className="space-y-2">
          <h3 className="text-sm font-semibold">Veckoschema</h3>
          <ul className="divide-y rounded-xl border">
            {WEEKDAY_LONG.map((name, i) => {
              const weekday = i + 1
              const dayRules = weekly.filter((r) => r.weekday === weekday).sort((a, b) => a.start.localeCompare(b.start))
              return (
                <li key={name} className="flex flex-wrap items-start gap-3 px-3 py-2.5">
                  <span className="w-20 pt-1.5 text-sm font-medium">{name}</span>
                  <div className="min-w-0 flex-1 space-y-1.5">
                    {dayRules.length === 0 && <p className="pt-1.5 text-sm text-muted-foreground">Ej bokningsbar</p>}
                    {dayRules.map((r) => (
                      <RuleRow key={r.id} rule={r} />
                    ))}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`Lägg till tid på ${name.toLowerCase()}`}
                    onClick={() => {
                      const last = dayRules.at(-1)
                      add(last ? { weekday, start: last.end, end: shiftHHMM(last.end, 180), slotMinutes: last.slotMinutes } : { weekday, start: "08:00", end: "11:00", slotMinutes: 60 })
                    }}
                  >
                    <Plus /> Tid
                  </Button>
                </li>
              )
            })}
          </ul>
        </section>

        <section className="space-y-2">
          <h3 className="text-sm font-semibold">Specialtider</h3>
          <p className="text-xs text-muted-foreground">
            Gäller ett visst datum och ersätter veckoschemat den dagen. Vill du stänga en hel dag, blockera den i kalendern.
          </p>
          {dated.length > 0 && (
            <ul className="divide-y rounded-xl border">
              {dated.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                  <span className="w-20 text-sm font-medium">{formatShort(r.date!)}</span>
                  <div className="min-w-0 flex-1">
                    <RuleRow rule={r} />
                  </div>
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1">
              <Label htmlFor="special-date" className="text-xs text-muted-foreground">
                Datum
              </Label>
              <Input id="special-date" type="date" value={newDate} min={localISODate(new Date())} onChange={(e) => setNewDate(e.target.value)} className="w-44" />
            </div>
            <Button
              variant="outline"
              onClick={() => {
                if (!newDate) return
                add({ date: newDate, start: "09:00", end: "12:00", slotMinutes: 60 })
                toast.success(`Specialtid tillagd ${formatShort(newDate)}`)
              }}
            >
              <Plus /> Lägg till specialtid
            </Button>
          </div>
        </section>
      </DialogContent>
    </Dialog>
  )
}

function RuleRow({ rule }: { rule: AvailabilityRule }) {
  const { actions } = useAppData()
  const [start, setStart] = React.useState(rule.start)
  const [end, setEnd] = React.useState(rule.end)
  const commit = (patch: Partial<AvailabilityRule>) => {
    const next = { ...rule, start, end, ...patch }
    if (next.end <= next.start) {
      toast.error("Sluttiden måste vara efter starttiden")
      setStart(rule.start)
      setEnd(rule.end)
      return
    }
    actions.saveAvailabilityRule({ id: next.id, weekday: next.weekday, date: next.date, start: next.start, end: next.end, slotMinutes: next.slotMinutes })
  }
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Input type="time" step={900} value={start} onChange={(e) => setStart(e.target.value)} onBlur={() => start !== rule.start && commit({ start })} className="h-8 w-28" aria-label="Från" />
      <span className="text-muted-foreground">–</span>
      <Input type="time" step={900} value={end} onChange={(e) => setEnd(e.target.value)} onBlur={() => end !== rule.end && commit({ end })} className="h-8 w-28" aria-label="Till" />
      <Select value={String(rule.slotMinutes)} onValueChange={(v) => commit({ slotMinutes: Number(v) })}>
        <SelectTrigger size="sm" className="w-28" aria-label="Passlängd">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {SLOT_OPTIONS.map((m) => (
            <SelectItem key={m} value={String(m)}>
              {m} min/pass
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button variant="ghost" size="icon-sm" aria-label="Ta bort tiden" onClick={() => actions.deleteAvailabilityRule(rule.id)}>
        <Trash2 />
      </Button>
    </div>
  )
}

function shiftHHMM(hhmm: string, minutes: number) {
  const [h, m] = hhmm.split(":").map(Number)
  const t = Math.min(23 * 60 + 45, h * 60 + m + minutes)
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`
}
