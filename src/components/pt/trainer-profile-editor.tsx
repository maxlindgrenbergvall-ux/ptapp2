"use client"

import {
  BadgeCheck,
  CalendarPlus,
  Camera,
  Eye,
  EyeOff,
  Link2,
  Loader2,
  MapPin,
  Check,
  Dumbbell,
  Repeat,
  Salad,
  Save,
  ShieldCheck,
  Wifi,
} from "lucide-react"
import Link from "next/link"
import * as React from "react"
import { toast } from "sonner"

import { PageHeader, PersonAvatar, Rating, SpecialtyBadge } from "@/components/common"
import { OffersEditor } from "@/components/offers/offers-editor"
import { ServicesEditor } from "@/components/services/services-editor"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { NumberInput } from "@/components/ui/number-input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { formatSek } from "@/lib/money"
import type { TrainerProfilePatch } from "@/lib/data/state"
import { useAppData } from "@/lib/data/store"
import { ACCEPT, uploadFile } from "@/lib/storage"
import { cn } from "@/lib/utils"
import { COACHING_MODE_LABEL, SPECIALTIES, SPECIALTY_LABEL, type CoachingMode, type Specialty, type Trainer } from "@/types/domain"


export function TrainerProfileEditor() {
  const { data, me, actions } = useAppData()
  const trainer = data.trainers.find((t) => t.id === me.id)
  const [form, setForm] = React.useState(() => ({
    city: trainer?.city ?? "",
    specialties: trainer?.specialties ?? ([] as Specialty[]),
    bio: trainer?.bio ?? "",
    yearsExperience: trainer?.yearsExperience ?? 0,
    pricePerSession: trainer?.pricePerSession ?? 0,
    coachingMode: trainer?.coachingMode ?? ("onsite" as CoachingMode),
    avatarUrl: trainer?.avatarUrl ?? "",
    offersTraining: trainer?.offersTraining ?? true,
    offersNutrition: trainer?.offersNutrition ?? true,
  }))
  const hasServices = data.services.some((x) => x.trainerId === me.id && x.active)

  if (!trainer) return null

  const missing = [
    !form.city.trim() && form.coachingMode !== "remote" && "stad",
    form.specialties.length === 0 && "minst en inriktning",
    form.bio.trim().length < 40 && "en presentation (minst 40 tecken)",
    form.pricePerSession <= 0 && "pris",
    !hasServices && "minst en tjänst",
  ].filter(Boolean) as string[]

  const dirty = (Object.keys(form) as (keyof typeof form)[]).some(
    (k) => JSON.stringify(form[k] || "") !== JSON.stringify(trainer[k] || "")
  )

  const save = (extra: TrainerProfilePatch = {}) => {
    actions.updateTrainerProfile({
      ...form,
      city: form.city.trim(),
      bio: form.bio.trim(),
      avatarUrl: form.avatarUrl || undefined,
      ...extra,
    })
  }

  const preview = { ...trainer, ...form, avatarUrl: form.avatarUrl || undefined }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Min profil"
        description="Det här ser klienter när de söker PT."
        actions={
          <Button
            disabled={!dirty}
            onClick={() => {
              save()
              toast.success("Profilen är sparad")
            }}
          >
            <Save /> Spara
          </Button>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <Section title="Profilbild och grunduppgifter">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
              <AvatarPicker
                name={me.name}
                value={form.avatarUrl}
                onChange={(avatarUrl) => setForm({ ...form, avatarUrl })}
                userId={me.id}
              />
              <div className="grid flex-1 gap-4 sm:grid-cols-3">
                <Field label="Stad" htmlFor="city">
                  <Input id="city" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
                </Field>
                <Field label="Pris per pass (kr)" htmlFor="price">
                  <NumberInput
                    id="price"
                    min={0}
                    max={100000}
                    value={form.pricePerSession}
                    onValueChange={(v) => setForm({ ...form, pricePerSession: v ?? 0 })}
                  />
                </Field>
                <Field label="Års erfarenhet" htmlFor="years">
                  <NumberInput
                    id="years"
                    min={0}
                    max={80}
                    value={form.yearsExperience}
                    onValueChange={(v) => setForm({ ...form, yearsExperience: Math.min(80, v ?? 0) })}
                  />
                </Field>
              </div>
            </div>
          </Section>

          <Section
            title="Vad erbjuder du?"
            description="Erbjuder du bara kost säljer du inga pass, och erbjuder du bara träning kan klienter inte köpa kostcoaching av dig."
          >
            <div role="group" aria-label="Utbud" className="grid gap-2 sm:grid-cols-2">
              {(
                [
                  ["offersTraining", Dumbbell, "Träning", "Pass, program och uppföljning"],
                  ["offersNutrition", Salad, "Kost", "Kostschema, recept och kostcoaching"],
                ] as const
              ).map(([key, Icon, label, hint]) => {
                const on = form[key]
                const other = key === "offersTraining" ? form.offersNutrition : form.offersTraining
                return (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={on}
                    onClick={() => {
                      // Minst ett måste vara valt.
                      if (on && !other) return toast.error("Du behöver erbjuda träning, kost eller båda")
                      setForm({ ...form, [key]: !on })
                    }}
                    className={cn(
                      "flex items-start gap-3 rounded-xl border p-3 text-left transition-colors",
                      on ? "border-primary bg-primary/10 ring-1 ring-primary" : "hover:bg-muted"
                    )}
                  >
                    <Icon className={cn("mt-0.5 size-4 shrink-0", on ? "text-primary" : "text-muted-foreground")} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium">{label}</span>
                      <span className="block text-xs text-muted-foreground">{hint}</span>
                    </span>
                    <span
                      className={cn(
                        "flex size-5 shrink-0 items-center justify-center rounded-md border",
                        on ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40"
                      )}
                      aria-hidden
                    >
                      {on && <Check className="size-3.5" />}
                    </span>
                  </button>
                )
              })}
            </div>
            {(!form.offersTraining || !form.offersNutrition) && (
              <p className="text-xs text-muted-foreground">
                Tjänster som innehåller {form.offersTraining ? "kost" : "pass"} pausas när du sparar.
              </p>
            )}
          </Section>

          <Section title="Coaching-typ" description="Hur du träffar dina klienter. Visas som filter i sökningen.">
            <div role="radiogroup" aria-label="Coaching-typ" className="grid gap-2 sm:grid-cols-3">
              {MODES.map(({ value, icon: Icon, hint }) => {
                const on = form.coachingMode === value
                return (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => setForm({ ...form, coachingMode: value })}
                    className={cn(
                      "flex items-start gap-3 rounded-xl border p-3 text-left transition-colors",
                      on ? "border-primary bg-primary/10 ring-1 ring-primary" : "hover:bg-muted"
                    )}
                  >
                    <Icon className={cn("mt-0.5 size-4 shrink-0", on ? "text-primary" : "text-muted-foreground")} />
                    <span>
                      <span className="block text-sm font-medium">{COACHING_MODE_LABEL[value]}</span>
                      <span className="block text-xs text-muted-foreground">{hint}</span>
                    </span>
                  </button>
                )
              })}
            </div>
          </Section>

          <Section title="Inriktningar och certifieringar">
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {SPECIALTIES.map((s) => {
                  const on = form.specialties.includes(s)
                  return (
                    <button
                      key={s}
                      type="button"
                      aria-pressed={on}
                      onClick={() =>
                        setForm({ ...form, specialties: on ? form.specialties.filter((x) => x !== s) : [...form.specialties, s] })
                      }
                      className={cn(
                        "rounded-full border px-3 py-1 text-sm transition-colors",
                        on ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted"
                      )}
                    >
                      {SPECIALTY_LABEL[s]}
                    </button>
                  )
                })}
              </div>
              <VerifiedCertifications certifications={trainer.certifications} />
            </div>
          </Section>

          <Section title="Presentation">
            <Textarea
              id="bio"
              aria-label="Presentation"
              rows={5}
              maxLength={2000}
              value={form.bio}
              onChange={(e) => setForm({ ...form, bio: e.target.value })}
              placeholder="Vem är du, hur jobbar du och vem passar du för?"
            />
            <p className="mt-1 text-right text-xs text-muted-foreground tabular">{form.bio.length}/2000</p>
          </Section>

          <Section
            title="Tjänster och priser"
            description="Det klienter kan köpa av dig. Klienten betalar i appen, och du kan bara schemalägga så många pass som klienten har betalat för."
          >
            <ServicesEditor />
          </Section>

          <Section
            title="Erbjudanden"
            description="Paket och kampanjer per inriktning. De visas i aviseringsmenyn hos klienter som tittat på inriktningen – aldrig för den som stängt av personliga erbjudanden."
          >
            <OffersEditor />
          </Section>
        </div>

        <div className="space-y-6">
          <div className="space-y-2">
            <h2 className="text-sm font-medium text-muted-foreground">Förhandsvisning</h2>
            <TrainerCardPreview trainer={preview} />
          </div>

          <Card className="gap-3">
            <CardHeader>
              <CardTitle className="text-base">Synlighet</CardTitle>
              <CardDescription>
                {trainer.isPublished ? "Din profil syns i PT-sökningen." : "Din profil är dold. Klienter kan inte hitta dig än."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {!trainer.isPublished && missing.length > 0 && (
                <p className="text-sm text-muted-foreground">Fyll i {missing.join(", ")} för att kunna publicera.</p>
              )}
              {trainer.isPublished ? (
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => {
                    actions.updateTrainerProfile({ isPublished: false })
                    toast("Profilen är dold från sökningen")
                  }}
                >
                  <EyeOff /> Dölj profilen
                </Button>
              ) : (
                <Button
                  className="w-full"
                  disabled={missing.length > 0}
                  onClick={() => {
                    save({ isPublished: true })
                    toast.success("Profilen är publicerad")
                  }}
                >
                  <Eye /> Spara och publicera
                </Button>
              )}
            </CardContent>
          </Card>
          <Card className="gap-3">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <CalendarPlus className="size-4" /> Bokningsbara tider
              </CardTitle>
              <CardDescription>Veckoschema, specialtider och blockeringar sköts i kalendern.</CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild variant="outline" className="w-full">
                <Link href="/pt/kalender">Öppna kalendern</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

const MODES: { value: CoachingMode; icon: React.ComponentType<{ className?: string }>; hint: string }[] = [
  { value: "remote", icon: Wifi, hint: "Program, chatt och videosamtal" },
  { value: "onsite", icon: MapPin, hint: "Träning på gym eller plats" },
  { value: "both", icon: Repeat, hint: "Kombinera efter behov" },
]

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 rounded-2xl border bg-card p-5">
      <div>
        <h2 className="font-semibold">{title}</h2>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {children}
    </section>
  )
}

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor} className="text-xs text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  )
}

function AvatarPicker({
  name,
  value,
  userId,
  onChange,
}: {
  name: string
  value: string
  userId: string
  onChange: (url: string) => void
}) {
  const inputRef = React.useRef<HTMLInputElement>(null)
  const [busy, setBusy] = React.useState(false)
  const [showUrl, setShowUrl] = React.useState(false)
  const [url, setUrl] = React.useState("")

  const upload = async (file: File | undefined) => {
    if (!file) return
    setBusy(true)
    try {
      onChange(await uploadFile("avatars", `${userId}/avatar.webp`, file))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Uppladdningen misslyckades")
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ""
    }
  }

  return (
    <div className="flex items-center gap-4 sm:flex-col sm:items-center">
      <div className="relative">
        <PersonAvatar name={name} src={value || undefined} className="size-24 text-2xl ring-2 ring-primary/30 ring-offset-2 ring-offset-card" />
        {busy && (
          <div className="absolute inset-0 flex items-center justify-center rounded-full bg-background/70">
            <Loader2 className="size-5 animate-spin" />
          </div>
        )}
      </div>
      <div className="flex flex-col gap-1.5 sm:items-center">
        <input ref={inputRef} type="file" accept={ACCEPT.avatars} className="sr-only" onChange={(e) => upload(e.target.files?.[0])} />
        <Button type="button" size="sm" variant="secondary" onClick={() => inputRef.current?.click()} disabled={busy}>
          <Camera /> {value ? "Byt bild" : "Ladda upp bild"}
        </Button>
        <div className="flex gap-1">
          <Button type="button" size="xs" variant="ghost" onClick={() => setShowUrl((s) => !s)}>
            <Link2 /> Länk
          </Button>
          {value && (
            <Button type="button" size="xs" variant="ghost" onClick={() => onChange("")}>
              Ta bort
            </Button>
          )}
        </div>
        {showUrl && (
          <form
            className="flex gap-1"
            onSubmit={(e) => {
              e.preventDefault()
              if (!/^https:\/\/\S+$/.test(url.trim())) return toast.error("Ange en https-länk till en bild")
              onChange(url.trim())
              setShowUrl(false)
              setUrl("")
            }}
          >
            <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" className="h-8 w-44 text-xs" aria-label="Bildlänk" />
            <Button type="submit" size="sm" variant="outline">
              OK
            </Button>
          </form>
        )}
      </div>
    </div>
  )
}

/**
 * Certifikat kan inte läggas till av PT:n själv – Coavira verifierar dem
 * manuellt och lägger in dem (databasen spärrar ändringar från PT-kontot).
 */
function VerifiedCertifications({ certifications }: { certifications: string[] }) {
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">Verifierade certifieringar</p>
      {certifications.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5" aria-label="Verifierade certifieringar">
          {certifications.map((c) => (
            <li key={c}>
              <Badge variant="outline" className="gap-1 border-primary/30 bg-primary/5 py-1">
                <BadgeCheck className="text-primary" />
                {c}
              </Badge>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">Inga verifierade certifieringar än.</p>
      )}
      <p className="flex items-start gap-2 rounded-lg bg-muted px-3 py-2 text-sm" data-testid="cert-info">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />
        <span>
          Alla certifikat, licenser och intyg måste skickas in till oss för manuell verifiering via{" "}
          <a href="mailto:certifiering@coavira.com" className="font-medium underline underline-offset-4">
            certifiering@coavira.com
          </a>{" "}
          innan de godkänns på din profil.
        </span>
      </p>
    </div>
  )
}

function TrainerCardPreview({ trainer }: { trainer: Trainer }) {
  return (
    <div className="rounded-2xl border bg-card p-4" aria-label="Så här ser klienter din profil">
      <div className="flex gap-3">
        <PersonAvatar name={trainer.name} src={trainer.avatarUrl} className="size-12" />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h3 className="truncate font-semibold">{trainer.name}</h3>
            <span className="shrink-0 font-semibold tabular">{formatSek(trainer.pricePerSession)}</span>
          </div>
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <MapPin className="size-3" /> {trainer.city || "Stad saknas"} · {COACHING_MODE_LABEL[trainer.coachingMode]}
          </p>
          <Rating value={trainer.rating} count={trainer.reviews.length} />
        </div>
      </div>
      <p className="mt-3 line-clamp-3 text-sm text-muted-foreground">{trainer.bio || "Ingen presentation än."}</p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {trainer.specialties.map((s) => (
          <SpecialtyBadge key={s} specialty={s} />
        ))}
        {trainer.certifications.slice(0, 3).map((c) => (
          <Badge key={c} variant="outline" className="gap-1 border-primary/30 bg-primary/5">
            <BadgeCheck className="text-primary" /> {c}
          </Badge>
        ))}
      </div>
    </div>
  )
}

