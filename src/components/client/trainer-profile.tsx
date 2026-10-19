"use client"

import { ArrowLeft, BadgeCheck, CalendarDays, Dumbbell, Hourglass, MapPin, MessageCircle, Salad, UserMinus, X } from "lucide-react"
import Link from "next/link"
import * as React from "react"
import { toast } from "sonner"

import { SlotPicker } from "@/components/calendar/slot-picker"
import { ServiceMenu } from "@/components/services/service-menu"
import { EmptyState, PersonAvatar, Rating, SpecialtyBadge } from "@/components/common"
import { OfferCard } from "@/components/offers/offer-card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
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
import { formatSek } from "@/lib/money"
import { useAppData } from "@/lib/data/store"
import { formatDayLong, formatTimeRange } from "@/lib/calendar/time"
import { formatShort, todayISO } from "@/lib/date"
import { recordInterest } from "@/lib/offers/interests"
import { sessionBalance } from "@/lib/services/balance"
import { offersNutritionPlan } from "@/lib/services/recommend"
import { relationshipWith } from "@/lib/data/selectors"
import { isFreeOffer } from "@/lib/offers/policy"
import { cn } from "@/lib/utils"
import { COACHING_MODE_LABEL, SESSION_MODE_LABEL, type SessionMode, type Slot, type Trainer } from "@/types/domain"
import { firstName } from "@/lib/names"

export function TrainerProfile({ trainerId }: { trainerId: string }) {
  const { data, me } = useAppData()
  const trainer = data.trainers.find((t) => t.id === trainerId)
  const specialties = trainer?.specialties.join(",")
  // Att öppna en profil är en (svag) signal om intresse för PT:ns kategorier (sparas bara lokalt).
  React.useEffect(() => {
    if (specialties) recordInterest(me.id, specialties.split(",") as Trainer["specialties"], "profile")
  }, [specialties, me.id])
  // Tillbaka från Stripe utan att betala.
  React.useEffect(() => {
    if (new URLSearchParams(window.location.search).get("kop") === "avbrutet") toast("Betalningen avbröts – inget har dragits.")
  }, [])
  if (!trainer) return <EmptyState icon={X} title="Tränaren hittades inte" />
  const today = todayISO()
  const offers = data.offers.filter((o) => o.trainerId === trainer.id && o.active && !isFreeOffer(o) && (!o.validUntil || o.validUntil >= today))

  const rel = relationshipWith(data, me.id, trainer.id)
  const isMyTrainer = rel?.status === "active" || rel?.status === "paused"
  const balance = sessionBalance(data, trainer.id, me.id)

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
            <span className="font-semibold">{formatSek(trainer.pricePerSession)}</span> / pass
          </span>
          <span className="text-muted-foreground">·</span>
          <span>{trainer.yearsExperience} år</span>
        </div>
        <div className="flex flex-wrap justify-center gap-1.5">
          {trainer.specialties.map((s) => (
            <SpecialtyBadge key={s} specialty={s} />
          ))}
        </div>
        <OfferingBadges trainer={trainer} />
        {isMyTrainer && (
          <Badge variant="secondary" className="gap-1">
            <BadgeCheck className="text-primary" /> Din PT
          </Badge>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2">
        {trainer.offersTraining ? (
          <BookingDialog trainer={trainer} />
        ) : (
          <Button size="lg" className="h-12" onClick={() => document.getElementById("tjanster")?.scrollIntoView({ behavior: "smooth" })}>
            <Salad /> Kostcoaching
          </Button>
        )}
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

      <section id="tjanster" className="scroll-mt-20 space-y-2" aria-labelledby="services-title">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <h2 id="services-title" className="font-semibold">
            Tjänster
          </h2>
          {balance.paid > 0 && (
            <p className="text-sm text-muted-foreground" data-testid="session-balance">
              Du har <span className="font-medium text-foreground tabular">{balance.remaining}</span> av {balance.paid} pass kvar
            </p>
          )}
        </div>
        <ServiceMenu trainer={trainer} />
      </section>

      {offers.length > 0 && (
        <section className="space-y-2" aria-labelledby="offers-title">
          <h2 id="offers-title" className="font-semibold">
            Erbjudanden
          </h2>
          <div className="space-y-2">
            {offers.map((o) => (
              <OfferCard key={o.id} offer={o} />
            ))}
          </div>
        </section>
      )}

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

      {isMyTrainer && <LeaveTrainerButton trainer={trainer} />}

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
  const { actions, data, me } = useAppData()
  const balance = sessionBalance(data, trainer.id, me.id)
  const [open, setOpen] = React.useState(false)
  const [slot, setSlot] = React.useState<Slot | null>(null)
  const [mode, setMode] = React.useState<SessionMode>(trainer.coachingMode === "remote" ? "remote" : "onsite")
  const [note, setNote] = React.useState("")
  const [sent, setSent] = React.useState<Slot | null>(null)
  const modes: SessionMode[] = trainer.coachingMode === "both" ? ["onsite", "remote"] : [trainer.coachingMode === "remote" ? "remote" : "onsite"]

  const reset = () => {
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
                Väntar på bekräftelse från {firstName(trainer.name)}. Du ser statusen under Kalender.
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
        ) : balance.remaining < 1 ? (
          <div className="space-y-4">
            <DialogHeader>
              <DialogTitle>Köp pass för att boka</DialogTitle>
              <DialogDescription>
                {balance.paid > 0
                  ? `Du har använt alla ${balance.paid} pass du köpt hos ${firstName(trainer.name)}.`
                  : `Välj en tjänst hos ${firstName(trainer.name)} först. Varje bokning använder ett betalt pass.`}
              </DialogDescription>
            </DialogHeader>
            <Button
              className="w-full"
              onClick={() => {
                setOpen(false)
                document.getElementById("tjanster")?.scrollIntoView({ behavior: "smooth", block: "start" })
              }}
            >
              Visa tjänster och priser
            </Button>
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Boka {firstName(trainer.name)}</DialogTitle>
              <DialogDescription>
                Välj en ledig tid. Bokningen blir klar när {firstName(trainer.name)} bekräftat den. Du har {balance.remaining} pass kvar.
              </DialogDescription>
            </DialogHeader>
            <SlotPicker trainerId={open ? trainer.id : null} trainerFirstName={firstName(trainer.name)} value={slot} onChange={setSlot} />
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
                Skicka bokningsförfrågan
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

/** Vad PT:n erbjuder: träning, kost eller båda. */
export function OfferingBadges({ trainer, className }: { trainer: Trainer; className?: string }) {
  const { data } = useAppData()
  // "Kostschema" visas bara om PT:n kryssat i kost OCH har en aktiv kosttjänst.
  const nutrition = offersNutritionPlan(data, trainer)
  return (
    <div className={cn("flex flex-wrap justify-center gap-1.5", className)} aria-label="Erbjuder">
      {trainer.offersTraining && (
        <Badge variant="outline" className="gap-1">
          <Dumbbell /> Träning
        </Badge>
      )}
      {nutrition && <NutritionTag />}
    </div>
  )
}

/** Tydlig tagg för PT:er som säljer kostschema – samma på söksidan och PT-profilen. */
export function NutritionTag({ className }: { className?: string }) {
  return (
    <Badge className={cn("gap-1 bg-success/15 text-success", className)} data-testid="nutrition-tag">
      <Salad /> Kostschema
    </Badge>
  )
}

/** Klient: avsluta samarbetet. PT:n tappar åtkomst direkt och kommande pass avbokas. */
export function LeaveTrainerButton({ trainer, className }: { trainer: Trainer; className?: string }) {
  const { data, me, actions } = useAppData()
  const [open, setOpen] = React.useState(false)
  const balance = sessionBalance(data, trainer.id, me.id)
  const upcoming = data.events.filter(
    (e) => e.clientId === me.id && e.trainerId === trainer.id && (e.status === "pending" || e.status === "confirmed") && e.start > new Date().toISOString()
  ).length
  const name = firstName(trainer.name)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" className={cn("w-full text-muted-foreground hover:text-destructive", className)}>
          <UserMinus /> Lämna {name}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Lämna {trainer.name}?</DialogTitle>
          <DialogDescription>
            {name} slutar se din träning, kost och chatt direkt. Dina andra PT:er påverkas inte.
          </DialogDescription>
        </DialogHeader>
        <ul className="space-y-1.5 text-sm">
          {upcoming > 0 && <li>• {upcoming} kommande pass avbokas.</li>}
          <li>• Ett kostschema från {name} slutar gälla.</li>
          {balance.remaining > 0 && (
            <li>
              • Du har {balance.remaining} betalda pass kvar. Kontakta {name} om återbetalning innan du lämnar.
            </li>
          )}
          <li>• Du kan börja igen senare genom att köpa en ny tjänst.</li>
        </ul>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Avbryt
          </Button>
          <Button
            variant="destructive"
            onClick={() => {
              actions.leaveTrainer(trainer.id)
              setOpen(false)
              toast.success(`Du har lämnat ${trainer.name}`)
            }}
          >
            Lämna {name}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
