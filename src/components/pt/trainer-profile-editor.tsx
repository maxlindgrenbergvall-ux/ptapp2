"use client"

import { CalendarPlus, Eye, EyeOff, Save, Trash2 } from "lucide-react"
import * as React from "react"
import { sv } from "react-day-picker/locale"
import { toast } from "sonner"

import { PageHeader } from "@/components/common"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import type { TrainerProfilePatch } from "@/lib/data/state"
import { useAppData } from "@/lib/data/store"
import { formatSlot, parseISODate, toISODate, todayISO } from "@/lib/date"
import { cn } from "@/lib/utils"
import { SPECIALTIES, SPECIALTY_LABEL, type Specialty } from "@/types/domain"

const TIMES = ["06:00", "07:00", "08:00", "09:00", "10:00", "12:00", "15:00", "16:00", "17:00", "18:00", "19:00"]

export function TrainerProfileEditor() {
  const { data, me, actions } = useAppData()
  const trainer = data.trainers.find((t) => t.id === me.id)
  const [form, setForm] = React.useState(() => ({
    city: trainer?.city ?? "",
    specialties: trainer?.specialties ?? ([] as Specialty[]),
    bio: trainer?.bio ?? "",
    yearsExperience: trainer?.yearsExperience ?? 0,
    pricePerSession: trainer?.pricePerSession ?? 0,
    offersRemote: trainer?.offersRemote ?? false,
  }))

  if (!trainer) return null

  const missing = [
    !form.city.trim() && "stad",
    form.specialties.length === 0 && "minst en inriktning",
    form.bio.trim().length < 40 && "en presentation (minst 40 tecken)",
    form.pricePerSession <= 0 && "pris",
  ].filter(Boolean) as string[]

  const dirty = (Object.keys(form) as (keyof typeof form)[]).some(
    (k) => JSON.stringify(form[k]) !== JSON.stringify(trainer[k])
  )

  const save = (extra: TrainerProfilePatch = {}) => {
    actions.updateTrainerProfile({ ...form, city: form.city.trim(), bio: form.bio.trim(), ...extra })
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Min profil"
        description="Det här ser klienter när de söker PT."
        actions={
          <>
            <Button
              disabled={!dirty}
              onClick={() => {
                save()
                toast.success("Profilen är sparad")
              }}
            >
              <Save /> Spara
            </Button>
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <Card>
          <CardHeader>
            <CardTitle>Om dig</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="city">Stad</Label>
                <Input id="city" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="price">Pris per pass (kr)</Label>
                <Input
                  id="price"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  step={50}
                  value={form.pricePerSession}
                  onChange={(e) => setForm({ ...form, pricePerSession: Math.max(0, Number(e.target.value)) })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="years">Års erfarenhet</Label>
                <Input
                  id="years"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={80}
                  value={form.yearsExperience}
                  onChange={(e) => setForm({ ...form, yearsExperience: Math.min(80, Math.max(0, Number(e.target.value))) })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Inriktningar</Label>
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
                        on ? "border-foreground bg-foreground text-background" : "hover:bg-muted"
                      )}
                    >
                      {SPECIALTY_LABEL[s]}
                    </button>
                  )
                })}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="bio">Presentation</Label>
              <Textarea
                id="bio"
                rows={5}
                maxLength={2000}
                value={form.bio}
                onChange={(e) => setForm({ ...form, bio: e.target.value })}
                placeholder="Vem är du, hur jobbar du och vem passar du för?"
              />
              <p className="text-right text-xs text-muted-foreground tabular">{form.bio.length}/2000</p>
            </div>
            <div className="flex items-center gap-3">
              <Checkbox id="remote" checked={form.offersRemote} onCheckedChange={(v) => setForm({ ...form, offersRemote: v === true })} />
              <Label htmlFor="remote" className="font-normal">
                Jag erbjuder distanscoachning
              </Label>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Synlighet</CardTitle>
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
                  className="w-full bg-brand text-brand-foreground hover:bg-brand/90"
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
          <AvailabilityEditor />
        </div>
      </div>
    </div>
  )
}

function AvailabilityEditor() {
  const { data, me, actions } = useAppData()
  const trainer = data.trainers.find((t) => t.id === me.id)!
  const [day, setDay] = React.useState<Date | undefined>(parseISODate(todayISO()))
  const now = new Date().toISOString()
  const upcoming = trainer.availability.filter((s) => s > now).sort()

  const addTime = (time: string) => {
    if (!day) return
    const slot = new Date(`${toISODate(day)}T${time}:00`).toISOString()
    if (slot <= now) return toast.error("Tiden har redan passerat")
    if (trainer.availability.includes(slot)) return
    actions.addAvailability(slot)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarPlus className="size-4" /> Lediga tider
        </CardTitle>
        <CardDescription>Klienter kan skicka bokningsförfrågan på de här tiderna.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex justify-center rounded-md border">
          <Calendar mode="single" locale={sv} selected={day} onSelect={setDay} disabled={{ before: parseISODate(todayISO()) }} />
        </div>
        {day && (
          <div className="flex flex-wrap gap-1.5">
            {TIMES.map((t) => {
              const slot = new Date(`${toISODate(day)}T${t}:00`).toISOString()
              const on = trainer.availability.includes(slot)
              return (
                <button
                  key={t}
                  type="button"
                  aria-pressed={on}
                  onClick={() => (on ? actions.removeAvailability(slot) : addTime(t))}
                  className={cn(
                    "rounded-md border px-2.5 py-1 text-sm tabular transition-colors",
                    on ? "border-foreground bg-foreground text-background" : "hover:bg-muted"
                  )}
                >
                  {t}
                </button>
              )
            })}
          </div>
        )}
        <ul className="max-h-56 divide-y overflow-y-auto rounded-md border text-sm">
          {upcoming.length === 0 && <li className="p-3 text-muted-foreground">Inga lediga tider inlagda.</li>}
          {upcoming.map((s) => (
            <li key={s} className="flex items-center justify-between px-3 py-1.5">
              <span className="tabular">{formatSlot(s)}</span>
              <Button variant="ghost" size="icon-xs" aria-label={`Ta bort ${formatSlot(s)}`} onClick={() => actions.removeAvailability(s)}>
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}
