"use client"

import { Dumbbell, Pencil, Plus, Salad, Trash2 } from "lucide-react"
import * as React from "react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NumberInput } from "@/components/ui/number-input"
import { Textarea } from "@/components/ui/textarea"
import { useAppData } from "@/lib/data/store"
import { formatSek } from "@/lib/money"
import { activeServices, serviceSummary } from "@/lib/services/balance"
import { cn } from "@/lib/utils"
import { SERVICE_KIND_LABEL, type ServiceKind, type TrainerService } from "@/types/domain"

const KINDS: { kind: ServiceKind; hint: string; sessions: number }[] = [
  { kind: "single", hint: "Ett pass i taget", sessions: 1 },
  { kind: "package", hint: "Program med ett fast antal pass, t.ex. 5 eller 6", sessions: 5 },
  { kind: "full", hint: "Pass + kostschema och uppföljning", sessions: 6 },
  { kind: "nutrition", hint: "Bara kostschema och uppföljning", sessions: 0 },
]

/** PT:ns tjänstemeny: det klienter kan köpa och betala för i appen. */
export function ServicesEditor() {
  const { data, me, actions } = useAppData()
  const mine = data.services.filter((x) => x.trainerId === me.id)
  const active = new Set(activeServices(data, me.id).map((x) => x.id))
  const [editing, setEditing] = React.useState<TrainerService | "new" | null>(null)

  return (
    <div className="space-y-3">
      {mine.length === 0 && <p className="text-sm text-muted-foreground">Inga tjänster än. Lägg till minst en så att klienter kan köpa pass av dig.</p>}
      <ul className="space-y-2" aria-label="Mina tjänster">
        {mine.map((x) => (
          <li key={x.id} className={cn("flex items-start gap-3 rounded-xl border p-3", !active.has(x.id) && "opacity-60")}>
            <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              {x.kind === "nutrition" ? <Salad className="size-4" /> : <Dumbbell className="size-4" />}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                <p className="font-medium break-words">{x.title}</p>
                <p className="font-semibold tabular">{formatSek(x.priceSek)}</p>
              </div>
              <p className="text-xs text-muted-foreground">
                {SERVICE_KIND_LABEL[x.kind]} · {serviceSummary(x)}
                {!x.active && " · Pausad"}
              </p>
            </div>
            <div className="flex shrink-0 gap-1">
              <Button variant="ghost" size="icon-sm" aria-label={`Ändra ${x.title}`} onClick={() => setEditing(x)}>
                <Pencil />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Ta bort ${x.title}`}
                onClick={() => {
                  if (!window.confirm(`Ta bort "${x.title}"? Redan sålda pass påverkas inte.`)) return
                  actions.deleteService(x.id)
                  toast("Tjänsten är borttagen")
                }}
              >
                <Trash2 />
              </Button>
            </div>
          </li>
        ))}
      </ul>
      <Button variant="outline" onClick={() => setEditing("new")}>
        <Plus /> Ny tjänst
      </Button>

      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-h-[92svh] overflow-y-auto sm:max-w-md">
          {editing !== null && (
            <ServiceForm key={editing === "new" ? "new" : editing.id} service={editing === "new" ? undefined : editing} onDone={() => setEditing(null)} />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function ServiceForm({ service, onDone }: { service?: TrainerService; onDone: () => void }) {
  const { data, me, actions } = useAppData()
  const basePrice = data.trainers.find((t) => t.id === me.id)?.pricePerSession || 0
  const [kind, setKind] = React.useState<ServiceKind>(service?.kind ?? "package")
  const [title, setTitle] = React.useState(service?.title ?? "")
  const [description, setDescription] = React.useState(service?.description ?? "")
  const [sessions, setSessions] = React.useState<number | undefined>(service?.sessions ?? 5)
  const [weeks, setWeeks] = React.useState<number | undefined>(service?.durationWeeks)
  const [price, setPrice] = React.useState<number | undefined>(service?.priceSek ?? (basePrice ? basePrice * 5 : undefined))
  const [active, setActive] = React.useState(service?.active ?? true)

  const fixedSessions = kind === "single" ? 1 : kind === "nutrition" ? 0 : null
  const count = fixedSessions ?? sessions ?? 0

  const pickKind = (k: ServiceKind) => {
    setKind(k)
    const preset = KINDS.find((x) => x.kind === k)!
    if (k === "package" || k === "full") setSessions(preset.sessions)
    if (!service && basePrice) setPrice(k === "nutrition" ? 1190 : Math.max(1, preset.sessions) * basePrice + (k === "full" ? 900 : 0))
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const t = title.trim() || defaultTitle(kind, count)
    if (t.length < 3) return toast.error("Skriv ett namn (minst 3 tecken)")
    if (kind === "package" && !(count >= 2 && count <= 100)) return toast.error("Ett träningsprogram ska ha 2–100 pass")
    if (kind === "full" && !(count >= 1 && count <= 100)) return toast.error("Helhetspaketet ska ha 1–100 pass")
    if (!price || price < 1) return toast.error("Priset måste vara minst 1 kr – Coavira har inga gratispass")
    actions.saveService({
      id: service?.id ?? actions.newId(),
      kind,
      title: t.slice(0, 80),
      description: description.trim().slice(0, 400),
      sessions: count,
      includesNutrition: kind === "nutrition" || kind === "full",
      durationWeeks: weeks && weeks >= 1 && weeks <= 52 ? weeks : undefined,
      priceSek: Math.round(price),
      active,
    })
    toast.success(service ? "Tjänsten är uppdaterad" : "Tjänsten är tillagd")
    onDone()
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <DialogHeader>
        <DialogTitle>{service ? "Ändra tjänst" : "Ny tjänst"}</DialogTitle>
        <DialogDescription>Klienten betalar i appen. Antalet pass styr hur många pass du kan schemalägga.</DialogDescription>
      </DialogHeader>

      <div role="radiogroup" aria-label="Typ av tjänst" className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {KINDS.map((k) => (
          <button
            key={k.kind}
            type="button"
            role="radio"
            aria-checked={kind === k.kind}
            onClick={() => pickKind(k.kind)}
            className={cn(
              "rounded-xl border p-3 text-left transition-colors",
              kind === k.kind ? "border-primary bg-primary/10 ring-1 ring-primary" : "hover:bg-muted"
            )}
          >
            <span className="block text-sm font-medium">{SERVICE_KIND_LABEL[k.kind]}</span>
            <span className="block text-xs text-muted-foreground">{k.hint}</span>
          </button>
        ))}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="svc-title">Namn</Label>
        <Input id="svc-title" value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} placeholder={defaultTitle(kind, count)} />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="svc-sessions">Antal pass</Label>
          {fixedSessions !== null ? (
            <Input id="svc-sessions" value={fixedSessions} disabled />
          ) : (
            <NumberInput id="svc-sessions" value={sessions} onValueChange={setSessions} />
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="svc-price">Pris (kr)</Label>
          <NumberInput id="svc-price" value={price} onValueChange={setPrice} />
        </div>
        <div className="col-span-2 space-y-1.5 sm:col-span-1">
          <Label htmlFor="svc-weeks">Veckor (valfritt)</Label>
          <NumberInput id="svc-weeks" min={1} max={52} value={weeks} onValueChange={setWeeks} />
        </div>
      </div>
      {count > 1 && price ? (
        <p className="text-xs text-muted-foreground">
          {formatSek(Math.round(price / count))} per pass{kind === "full" ? " inklusive kost" : ""}
        </p>
      ) : null}
      <div className="space-y-1.5">
        <Label htmlFor="svc-desc">Beskrivning (valfritt)</Label>
        <Textarea id="svc-desc" rows={3} maxLength={400} value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <Checkbox checked={active} onCheckedChange={(v) => setActive(v === true)} /> Aktiv (kan köpas)
      </label>
      {(kind === "nutrition" || kind === "full") && (
        <Badge variant="secondary" className="gap-1">
          <Salad /> Ger klienten tillgång till kostschemat
        </Badge>
      )}
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onDone}>
          Avbryt
        </Button>
        <Button type="submit">{service ? "Spara" : "Lägg till"}</Button>
      </DialogFooter>
    </form>
  )
}

function defaultTitle(kind: ServiceKind, sessions: number) {
  if (kind === "single") return "Enstaka pass"
  if (kind === "nutrition") return "Kostcoaching"
  if (kind === "full") return `Helhetspaket – ${sessions} pass och kost`
  return `Träningsprogram ${sessions} pass`
}
