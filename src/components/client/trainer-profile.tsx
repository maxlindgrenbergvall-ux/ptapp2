"use client"

import { ArrowLeft, CalendarDays, MapPin, MessageCircle, Wifi, X } from "lucide-react"
import Link from "next/link"
import * as React from "react"
import { sv } from "react-day-picker/locale"
import { toast } from "sonner"

import { EmptyState, PersonAvatar, Rating, SpecialtyBadge } from "@/components/common"
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
import { formatShort, formatSlot, formatTime, toISODate } from "@/lib/date"
import { cn } from "@/lib/utils"
import type { Trainer } from "@/types/domain"

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
        <PersonAvatar name={trainer.name} className="size-20 text-xl" />
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{trainer.name}</h1>
          <p className="flex items-center justify-center gap-1 text-sm text-muted-foreground">
            <MapPin className="size-3.5" /> {trainer.city}
            {trainer.offersRemote && (
              <>
                {" "}· <Wifi className="size-3.5" /> Distans
              </>
            )}
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
  const [slot, setSlot] = React.useState<string | null>(null)
  const [note, setNote] = React.useState("")

  const now = new Date().toISOString()
  const slots = trainer.availability.filter((s) => s > now).sort()
  const days = [...new Set(slots.map((s) => toISODate(new Date(s))))]
  const daySlots = day ? slots.filter((s) => toISODate(new Date(s)) === toISODate(day)) : []

  const reset = () => {
    setDay(undefined)
    setSlot(null)
    setNote("")
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
        <Button size="lg" className="h-12 bg-brand text-brand-foreground hover:bg-brand/90" disabled={slots.length === 0}>
          <CalendarDays /> Boka
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Boka {trainer.name.split(" ")[0]}</DialogTitle>
          <DialogDescription>Dagar med lediga tider är markerade. Bokningen bekräftas av tränaren.</DialogDescription>
        </DialogHeader>
        <div className="flex justify-center rounded-md border">
          <Calendar
            mode="single"
            locale={sv}
            selected={day}
            onSelect={(d) => {
              setDay(d)
              setSlot(null)
            }}
            disabled={(d) => !days.includes(toISODate(d))}
            modifiers={{ available: days.map((d) => new Date(`${d}T12:00:00`)) }}
            modifiersClassNames={{ available: "font-semibold underline decoration-brand decoration-2 underline-offset-4" }}
          />
        </div>
        {day && (
          <div className="space-y-2">
            <Label>Tid</Label>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Välj tid">
              {daySlots.map((s) => (
                <button
                  key={s}
                  role="radio"
                  aria-checked={slot === s}
                  onClick={() => setSlot(s)}
                  className={cn(
                    "rounded-lg border px-4 py-2 text-sm font-medium tabular transition-colors",
                    slot === s ? "border-foreground bg-foreground text-background" : "hover:bg-muted"
                  )}
                >
                  {formatTime(s)}
                </button>
              ))}
            </div>
          </div>
        )}
        {slot && (
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
        )}
        <DialogFooter>
          <Button
            disabled={!slot}
            className="w-full sm:w-auto"
            onClick={() => {
              if (!slot) return
              actions.requestBooking(trainer.id, slot, note.trim() || undefined)
              toast.success("Förfrågan skickad", { description: `${formatSlot(slot)} hos ${trainer.name}` })
              setOpen(false)
              reset()
            }}
          >
            Skicka bokningsförfrågan · {trainer.pricePerSession} kr
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
