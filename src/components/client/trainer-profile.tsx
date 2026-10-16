"use client"

import { ArrowLeft, BadgeCheck, CalendarDays, Hourglass, Loader2, MapPin, MessageCircle, X } from "lucide-react"
import Link from "next/link"
import * as React from "react"
import { sv } from "react-day-picker/locale"
import { toast } from "sonner"

import { EmptyState, PersonAvatar, Rating, SpecialtyBadge } from "@/components/common"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Textarea } from "@/components/ui/textarea"
import { useAppData } from "@/lib/data/store"
import { daysWithSlots } from "@/lib/calendar/slots"
import { formatDayLong, formatTimeRange, localISODate } from "@/lib/calendar/time"
import { useTrainerSlots } from "@/lib/calendar/use-slots"
import { formatShort } from "@/lib/date"
import { cn } from "@/lib/utils"
import { COACHING_MODE_LABEL, SESSION_MODE_LABEL, type SessionMode, type Slot, type Trainer } from "@/types/domain"

export function TrainerProfile({ trainerId }: { trainerId: string }) {
  const { data, me } = useAppData()
  const trainer = data.trainers.find((t) => t.id === trainerId)
  const client = data.clients.find((c) => c.id === me.id)!
  if (!trainer) return <EmptyState icon={X} title="Tränaren hittades inte" />

  const isMyTrainer = client.trainerId === trainer.id && client.status !== "pending"

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2 text-muted-foreground">
        <Link href="/klient/hitta">
          <ArrowLeft /> Alla tränare
        </Link>
      </Button>

      <div className="flex flex-col items-center gap-3 text-center">
        <PersonAvatar name={trainer.name} src={trainer.avatarUrl} className="size-20 text-xl" />
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{trainer.name}</h1>
          <p className="flex items-center justify-center gap-1 text-sm text-muted-foreground">
            <MapPin className="size-3.5" /> {trainer.city}
            {" "}· {COACHING_MODE_LABEL[trainer.coachingMode]}
          </p>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <Rating value={trainer.rating} count={trainer.reviews.length} />
          <span className="text-muted-foreground">·</span>
          <span className="tabular">
            <span className="font-semibold">{trainer.pricePerSession} kr</span> / pass
          </span>
          <span className="text-muted-foreground">·</span>
          <span>{trainer.yearsExperience} år</span>
        </div>
        <div className="flex flex-wrap justify-center gap-1.5">
          {trainer.specialties.map((s) => (
            <SpecialtyBadge key={s} specialty={s} />
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <BookingDialog trainer={trainer} />
        {isMyTrainer ? (
          <Button asChild variant="outline" size="lg" className="h-12">
            <Link href="/klient/chatt">
              <MessageCircle /> Chatta
            </Link>
          </Button>
        ) : (
          <Button variant="outline" size="lg" className="h-12" disabled title="Chatten öppnas när PT:n accepterat dig">
            <MessageCircle /> Chatta
          </Button>
        )}
      </div>

      {trainer.certifications.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-semibold">Certifieringar</h2>
          <div className="flex flex-wrap gap-1.5">
            {trainer.certifications.map((c) => (
              <Badge key={c} variant="outline" className="gap-1 border-primary/30 bg-primary/5">
                <BadgeCheck className="text-primary" /> {c}
              </Badge>
            ))}
          </div>
        </section>
      )}

      <section className="space-y-2">
        <h2 className="font-semibold">Om mig</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">{trainer.bio}</p>
      </section>

      <Separator />

      <section className="space-y-3">
        <h2 className="font-semibold">Omdömen</h2>
        {trainer.reviews.map((r) => (
          <article key={r.id} className="space-y-1 rounded-xl border p-3">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">{r.author}</span>
              <Rating value={r.rating} />
            </div>
            <p className="text-sm text-muted-foreground">{r.text}</p>
            <p className="text-xs text-muted-foreground">{formatShort(r.date)}</p>
          </article>
        ))}
      </section>
    </div>
  )
}

function BookingDialog({ trainer }: { trainer: Trainer }) {
  const { actions } = useAppData()
  const [open, setOpen] = React.useState(false)
  const [day, setDay] = React.useState<Date | undefined>()
  const [slot, setSlot] = React.useState<Slot | null>(null)
  const [mode, setMode] = React.useState<SessionMode>(trainer.coachingMode === "remote" ? "remote" : "onsite")
  const [note, setNote] = React.useState("")
  const [sent, setSent] = React.useState<Slot | null>(null)
  // Lediga tider de kommande fyra veckorna, enligt PT:ns tillgänglighet minus bokad tid.
  const { status, slots } = useTrainerSlots(open ? trainer.id : null, 28)

  const days = daysWithSlots(slots)
  const daySlots = day ? slots.filter((s) => localISODate(new Date(s.start)) === localISODate(day)) : []
  const modes: SessionMode[] = trainer.coachingMode === "both" ? ["onsite", "remote"] : [trainer.coachingMode === "remote" ? "remote" : "onsite"]

  const reset = () => {
    setDay(undefined)
    setSlot(null)
    setNote("")
    setSent(null)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (!o) reset()
      }}
    >
      <DialogTrigger asChild>
        <Button size="lg" className="h-12">
          <CalendarDays /> Boka
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[92svh] overflow-y-auto sm:max-w-md">
        {sent ? (
          <div className="space-y-4 text-center">
            <DialogHeader className="items-center">
              <span className="flex size-12 items-center justify-center rounded-full bg-warning/20">
                <Hourglass className="size-6 text-warning" />
              </span>
              <DialogTitle>Förfrågan skickad</DialogTitle>
              <DialogDescription>
                {formatDayLong(new Date(sent.start))} · {formatTimeRange(new Date(sent.start), new Date(sent.end))}
                <br />
                Väntar på bekräftelse från {trainer.name.split(" ")[0]}. Du ser statusen under Kalender.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-2">
              <Button asChild>
                <Link href="/klient/kalender">Visa mina pass</Link>
              </Button>
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Stäng
              </Button>
            </div>
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Boka {trainer.name.split(" ")[0]}</DialogTitle>
              <DialogDescription>Välj en ledig tid. Bokningen blir klar när {trainer.name.split(" ")[0]} bekräftat den.</DialogDescription>
            </DialogHeader>
            {status === "loading" ? (
              <div className="flex h-72 items-center justify-center">
                <Loader2 className="size-5 animate-spin text-muted-foreground" />
              </div>
            ) : status === "error" ? (
              <p className="rounded-lg bg-muted p-4 text-sm">Kunde inte hämta lediga tider. Kontrollera uppkopplingen och försök igen.</p>
            ) : slots.length === 0 ? (
              <p className="rounded-lg bg-muted p-4 text-sm">{trainer.name.split(" ")[0]} har inga lediga tider de kommande fyra veckorna. Skicka gärna ett meddelande.</p>
            ) : (
              <>
                <div className="flex justify-center rounded-md border">
                  <Calendar
                    mode="single"
                    locale={sv}
                    selected={day}
                    onSelect={(d) => {
                      setDay(d)
                      setSlot(null)
                    }}
                    disabled={(d) => !days.includes(localISODate(d))}
                    modifiers={{ available: days.map((d) => new Date(`${d}T12:00:00`)) }}
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
                          aria-checked={slot?.start === s.start}
                          onClick={() => setSlot(s)}
                          className={cn(
                            "rounded-lg border px-3 py-2 text-sm font-medium tabular transition-colors",
                            slot?.start === s.start ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted"
                          )}
                        >
                          {formatTimeRange(new Date(s.start), new Date(s.end))}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {slot && (
                  <>
                    {modes.length > 1 && (
                      <div className="space-y-2">
                        <Label>Träna</Label>
                        <div role="radiogroup" aria-label="Träna" className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
                          {modes.map((m) => (
                            <button
                              key={m}
                              type="button"
                              role="radio"
                              aria-checked={mode === m}
                              onClick={() => setMode(m)}
                              className={cn("rounded-md py-1.5 text-sm", mode === m ? "bg-background font-medium shadow-sm" : "text-muted-foreground")}
                            >
                              {SESSION_MODE_LABEL[m]}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    <div className="space-y-2">
                      <Label htmlFor="booking-note">Meddelande (valfritt)</Label>
                      <Textarea
                        id="booking-note"
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        rows={3}
                        maxLength={500}
                        placeholder="Berätta kort om dina mål. Skriv inte känsliga hälsouppgifter här."
                      />
                    </div>
                  </>
                )}
              </>
            )}
            <DialogFooter>
              <Button
                disabled={!slot}
                className="w-full sm:w-auto"
                onClick={() => {
                  if (!slot) return
                  const error = actions.requestBooking(trainer.id, slot, modes.includes(mode) ? mode : modes[0], note)
                  if (error) {
                    toast.error(error)
                    setSlot(null)
                    return
                  }
                  setSent(slot)
                }}
              >
                Skicka bokningsförfrågan · {trainer.pricePerSession} kr
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
