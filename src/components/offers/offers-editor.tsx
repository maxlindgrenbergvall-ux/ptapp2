"use client"

import { Pencil, Plus, Sparkles, Trash2 } from "lucide-react"
import * as React from "react"
import { toast } from "sonner"

import { OfferCard } from "@/components/offers/offer-card"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { NumberInput } from "@/components/ui/number-input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { useAppData } from "@/lib/data/store"
import { todayISO } from "@/lib/date"
import { MAX_DISCOUNT_PERCENT, mentionsFree } from "@/lib/offers/policy"
import { SPECIALTY_LABEL, type Specialty, type TrainerOffer } from "@/types/domain"

type PriceKind = "price" | "discount" | "none"

/**
 * PT:ns erbjudanden. Varje erbjudande hör till en av PT:ns inriktningar och visas
 * i aviseringsmenyn hos klienter som visat intresse för just den inriktningen.
 */
export function OffersEditor() {
  const { data, me, actions } = useAppData()
  const trainer = data.trainers.find((t) => t.id === me.id)
  const offers = data.offers.filter((o) => o.trainerId === me.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const [editing, setEditing] = React.useState<TrainerOffer | "new" | null>(null)
  const today = todayISO()
  const specialties = trainer?.specialties ?? []

  return (
    <div className="space-y-3">
      {offers.length === 0 && <p className="text-sm text-muted-foreground">Inga erbjudanden än.</p>}
      <ul className="space-y-2">
        {offers.map((o) => {
          const expired = Boolean(o.validUntil && o.validUntil < today)
          return (
            <li key={o.id} className="flex items-start gap-2">
              <div className={!o.active || expired ? "min-w-0 flex-1 opacity-60" : "min-w-0 flex-1"}>
                <OfferCard offer={o} />
                {(!o.active || expired) && <p className="mt-1 text-xs text-muted-foreground">{expired ? "Har gått ut" : "Pausat – syns inte för klienter"}</p>}
              </div>
              <div className="flex flex-col gap-1">
                <Button variant="ghost" size="icon-sm" aria-label={`Ändra ${o.title}`} onClick={() => setEditing(o)}>
                  <Pencil />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Ta bort ${o.title}`}
                  onClick={() => {
                    if (!window.confirm(`Ta bort "${o.title}"?`)) return
                    actions.deleteOffer(o.id)
                    toast("Erbjudandet är borttaget")
                  }}
                >
                  <Trash2 />
                </Button>
              </div>
            </li>
          )
        })}
      </ul>
      <Button variant="outline" onClick={() => setEditing("new")} disabled={specialties.length === 0}>
        <Plus /> Nytt erbjudande
      </Button>
      {specialties.length === 0 && <p className="text-xs text-muted-foreground">Välj minst en inriktning och spara profilen först.</p>}

      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-h-[92svh] overflow-y-auto sm:max-w-md">
          {editing !== null && (
            <OfferForm
              key={editing === "new" ? "new" : editing.id}
              offer={editing === "new" ? undefined : editing}
              specialties={specialties}
              onDone={() => setEditing(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function OfferForm({ offer, specialties, onDone }: { offer?: TrainerOffer; specialties: Specialty[]; onDone: () => void }) {
  const { actions } = useAppData()
  const [category, setCategory] = React.useState<Specialty>(offer?.category ?? specialties[0])
  const [title, setTitle] = React.useState(offer?.title ?? "")
  const [description, setDescription] = React.useState(offer?.description ?? "")
  const [priceKind, setPriceKind] = React.useState<PriceKind>(offer?.discountPercent ? "discount" : offer?.priceSek !== undefined ? "price" : "none")
  const [amount, setAmount] = React.useState(String(offer?.discountPercent ?? offer?.priceSek ?? ""))
  const [validUntil, setValidUntil] = React.useState(offer?.validUntil ?? "")
  const [active, setActive] = React.useState(offer?.active ?? true)

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const n = Math.round(Number(amount))
    if (title.trim().length < 3) return toast.error("Skriv en rubrik (minst 3 tecken)")
    // Inga gratispass: rabatten måste vara under 100 % och priset över 0 kr.
    if (priceKind === "discount" && !(n >= 1 && n <= MAX_DISCOUNT_PERCENT)) return toast.error(`Rabatten ska vara 1–${MAX_DISCOUNT_PERCENT} %`)
    if (priceKind === "price" && !(n >= 1 && n <= 100000)) return toast.error("Priset måste vara minst 1 kr – Coavira har inga gratispass")
    if (mentionsFree(`${title} ${description}`)) return toast.error("Erbjudanden kan inte vara gratis", { description: "Coavira hanterar inga gratispass. Använd en rabatt eller ett paketpris." })
    actions.saveOffer({
      id: offer?.id ?? actions.newId(),
      createdAt: offer?.createdAt,
      category,
      title: title.trim(),
      description: description.trim(),
      priceSek: priceKind === "price" ? n : undefined,
      discountPercent: priceKind === "discount" ? n : undefined,
      validUntil: validUntil || undefined,
      active,
    })
    toast.success(offer ? "Erbjudandet är uppdaterat" : "Erbjudandet är publicerat för intresserade klienter")
    onDone()
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Sparkles className="size-4 text-primary" /> {offer ? "Ändra erbjudande" : "Nytt erbjudande"}
        </DialogTitle>
        <DialogDescription>Visas för klienter som tittat på eller sökt efter inriktningen. Gratispass erbjuds inte – använd rabatt (högst {MAX_DISCOUNT_PERCENT} %) eller ett paketpris.</DialogDescription>
      </DialogHeader>
      <div className="space-y-1.5">
        <Label>Inriktning</Label>
        <Select value={category} onValueChange={(v) => setCategory(v as Specialty)}>
          <SelectTrigger className="w-full" aria-label="Inriktning">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {specialties.map((s) => (
              <SelectItem key={s} value={s}>
                {SPECIALTY_LABEL[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="offer-title">Rubrik</Label>
        <Input id="offer-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} placeholder="T.ex. Hyrox Stockholm – 6 veckor" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="offer-desc">Beskrivning</Label>
        <Textarea id="offer-desc" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={280} rows={3} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Pris</Label>
          <Select value={priceKind} onValueChange={(v) => setPriceKind(v as PriceKind)}>
            <SelectTrigger className="w-full" aria-label="Pristyp">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="discount">Rabatt i %</SelectItem>
              <SelectItem value="price">Fast pris (kr)</SelectItem>
              <SelectItem value="none">Inget pris</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {priceKind !== "none" && (
          <div className="space-y-1.5">
            <Label htmlFor="offer-amount">{priceKind === "discount" ? "Rabatt (%)" : "Pris (kr)"}</Label>
            {/* Ingen tyst begränsning här: formuläret förklarar varför 0 kr eller 100 % inte går. */}
            <NumberInput
              id="offer-amount"
              value={amount === "" ? undefined : Number(amount)}
              onValueChange={(v) => setAmount(v === undefined ? "" : String(v))}
            />
          </div>
        )}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="offer-until">Giltigt till och med (valfritt)</Label>
        <Input id="offer-until" type="date" min={todayISO()} value={validUntil} onChange={(e) => setValidUntil(e.target.value)} className="w-44" />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <Checkbox checked={active} onCheckedChange={(v) => setActive(v === true)} /> Aktivt (syns för klienter)
      </label>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onDone}>
          Avbryt
        </Button>
        <Button type="submit">Spara</Button>
      </DialogFooter>
    </form>
  )
}
